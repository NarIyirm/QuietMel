import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: ['server/.env', '.env.local', '.env'] })

const BUCKET = 'help-manuals'
const manuals = [
  {
    id: 'quick-start',
    file: 'quietmel-quick-start.pdf',
    title_en: 'Quick start',
    title_zh: '快速开始',
    summary_en: 'Location, map controls and the first quiet route.',
    summary_zh: '定位、地图控件和第一次安静路线规划。',
    page_count: 2,
    sort_order: 10,
  },
  {
    id: 'map-data',
    file: 'quietmel-map-and-crowd-data.pdf',
    title_en: 'Map and crowd data',
    title_zh: '地图与人流数据',
    summary_en: 'Live layers, sensor readings and the six-hour forecast.',
    summary_zh: '实时图层、传感器读数和未来六小时预测。',
    page_count: 2,
    sort_order: 20,
  },
  {
    id: 'routes',
    file: 'quietmel-routes-and-quiet-places.pdf',
    title_en: 'Routes and quiet places',
    title_zh: '路线与安静地点',
    summary_en: 'Route alternatives, navigation and nearby quiet places.',
    summary_zh: '路线备选、导航和附近安静地点。',
    page_count: 2,
    sort_order: 30,
  },
]

function requireEnvironment(name, alternatives = []) {
  for (const candidate of [name, ...alternatives]) {
    const value = process.env[candidate]?.trim()
    if (value) return value
  }
  throw new Error(`Missing ${[name, ...alternatives].join(' or ')}`)
}

async function main() {
  if (process.argv.includes('--dry-run')) {
    for (const manual of manuals) {
      const contents = await readFile(resolve('output/pdf', manual.file))
      console.log(`Ready: ${manual.file} (${contents.byteLength} bytes)`)
    }
    return
  }

  const supabase = createClient(
    requireEnvironment('SUPABASE_URL'),
    requireEnvironment('SUPABASE_SECRET_KEY', ['SUPABASE_SERVICE_ROLE_KEY']),
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  for (const manual of manuals) {
    const source = resolve('output/pdf', manual.file)
    const contents = await readFile(source)
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(manual.file, contents, {
        contentType: 'application/pdf',
        cacheControl: '3600',
        upsert: true,
      })

    if (uploadError) {
      throw new Error(`Could not upload ${manual.file}: ${uploadError.message}`)
    }

    const { file, ...metadata } = manual
    void file
    const { error: metadataError } = await supabase
      .from('help_manuals')
      .upsert({
        ...metadata,
        storage_path: manual.file,
        is_published: true,
        updated_at: new Date().toISOString(),
      })

    if (metadataError) {
      throw new Error(`Could not save metadata for ${manual.file}: ${metadataError.message}`)
    }

    console.log(`Uploaded ${manual.file}`)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
