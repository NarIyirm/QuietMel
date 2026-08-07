import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: ['server/.env', '.env.local', '.env'] })

const PROFILE_COLUMNS = [
  'location_id',
  'day_of_week',
  'season',
  'hour_of_day',
  'baseline_ppm',
  'trimmed_mean_ppm',
  'p25_ppm',
  'p75_ppm',
  'gradient_ppm_per_hour',
  'sample_count',
  'quality_flag',
  'source_start_date',
  'source_end_date',
  'model_version',
]
const EXCLUDED_LOCATION_IDS = new Set([28, 65, 78])
const EXPECTED_SENSOR_COUNT = 100
const EXPECTED_ROWS_PER_SENSOR = 7 * 4 * 24
const BATCH_SIZE = 500

function requireEnvironment(name, alternatives = []) {
  for (const candidate of [name, ...alternatives]) {
    const value = process.env[candidate]?.trim()
    if (value) return value
  }
  throw new Error(`Missing ${[name, ...alternatives].join(' or ')}`)
}

function parseProfiles(csv) {
  const [headerLine, ...lines] = csv.trim().split(/\r?\n/)
  const headers = headerLine.split(',')
  if (headers.join(',') !== PROFILE_COLUMNS.join(',')) {
    throw new Error('Forecast CSV columns do not match the required contract.')
  }

  const rows = lines.filter(Boolean).map((line, lineIndex) => {
    const values = line.split(',')
    if (values.length !== PROFILE_COLUMNS.length) {
      throw new Error(`Invalid CSV value count on line ${lineIndex + 2}.`)
    }
    const row = Object.fromEntries(headers.map((header, index) => [header, values[index]]))
    return {
      location_id: Number(row.location_id),
      day_of_week: Number(row.day_of_week),
      season: row.season,
      hour_of_day: Number(row.hour_of_day),
      baseline_ppm: Number(row.baseline_ppm),
      trimmed_mean_ppm: Number(row.trimmed_mean_ppm),
      p25_ppm: Number(row.p25_ppm),
      p75_ppm: Number(row.p75_ppm),
      gradient_ppm_per_hour: Number(row.gradient_ppm_per_hour),
      sample_count: Number(row.sample_count),
      quality_flag: row.quality_flag,
      source_start_date: row.source_start_date,
      source_end_date: row.source_end_date,
      model_version: row.model_version,
    }
  })

  const sensorIds = new Set(rows.map((row) => row.location_id))
  const versions = new Set(rows.map((row) => row.model_version))
  if (sensorIds.size !== EXPECTED_SENSOR_COUNT) {
    throw new Error(`Expected ${EXPECTED_SENSOR_COUNT} sensors, found ${sensorIds.size}.`)
  }
  if (rows.length !== sensorIds.size * EXPECTED_ROWS_PER_SENSOR) {
    throw new Error(`Expected ${sensorIds.size * EXPECTED_ROWS_PER_SENSOR} rows, found ${rows.length}.`)
  }
  if ([...sensorIds].some((sensorId) => EXCLUDED_LOCATION_IDS.has(sensorId))) {
    throw new Error('The forecast CSV still contains a removed sensor.')
  }
  if (versions.size !== 1) throw new Error('The forecast CSV must contain one model version.')
  if (
    rows.some((row) =>
      !Number.isFinite(row.location_id) ||
      !Number.isFinite(row.baseline_ppm) ||
      !Number.isFinite(row.gradient_ppm_per_hour)
    )
  ) {
    throw new Error('The forecast CSV contains non-finite numeric values.')
  }
  return { rows, modelVersion: [...versions][0] }
}

async function main() {
  const csvPath = resolve('model/output/crowd_hourly_profiles.csv')
  const { rows, modelVersion } = parseProfiles(await readFile(csvPath, 'utf8'))
  if (process.argv.includes('--dry-run')) {
    console.log(`Forecast CSV is valid: ${rows.length} rows, ${EXPECTED_SENSOR_COUNT} sensors, ${modelVersion}.`)
    return
  }
  const supabase = createClient(
    requireEnvironment('SUPABASE_URL'),
    requireEnvironment('SUPABASE_SECRET_KEY', ['SUPABASE_SERVICE_ROLE_KEY']),
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  const { error: deleteError } = await supabase
    .from('crowd_hourly_profiles')
    .delete()
    .eq('model_version', modelVersion)
  if (deleteError) {
    throw new Error(`Could not clear the previous ${modelVersion} import: ${deleteError.message}`)
  }

  for (let index = 0; index < rows.length; index += BATCH_SIZE) {
    const batch = rows.slice(index, index + BATCH_SIZE)
    const { error } = await supabase.from('crowd_hourly_profiles').insert(batch)
    if (error) {
      throw new Error(`Import failed at row ${index + 1}: ${error.message}`)
    }
    process.stdout.write(`\rImported ${Math.min(index + batch.length, rows.length)}/${rows.length}`)
  }

  process.stdout.write('\n')
  console.log(`Forecast model ${modelVersion} is ready for ${EXPECTED_SENSOR_COUNT} sensors.`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
