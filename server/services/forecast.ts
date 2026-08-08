import { getSupabaseAdminClient } from '../lib/supabase.js'
import {
  getCrowdLevel,
  getIntensity,
  getPedestrianSensorCatalogue,
  type CrowdLevel,
} from './crowd.js'

const MODEL_VERSION = 'hourly-gradient-v1'
const FORECAST_HOURS = 6
const FRAME_INTERVAL_MINUTES = 15
const FRAME_COUNT = (FORECAST_HOURS * 60) / FRAME_INTERVAL_MINUTES + 1
const TIMEZONE = 'Australia/Melbourne'
const SOURCE_URL =
  'https://data.melbourne.vic.gov.au/explore/dataset/pedestrian-counting-system-monthly-counts-per-hour/'
const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
}
type Season = 'summer' | 'autumn' | 'winter' | 'spring'

type ForecastTimeKey = {
  dayOfWeek: number
  season: Season
  hourOfDay: number
  minute: number
}

type ForecastProfileRow = {
  location_id: number | string
  day_of_week: number
  season: Season
  hour_of_day: number
  baseline_ppm: number
  gradient_ppm_per_hour: number
  sample_count: number
  quality_flag: 'ok' | 'low_sample' | 'fallback'
  source_start_date: string
  source_end_date: string
}

export type CrowdForecastSensor = {
  sensorId: number
  name: string
  latitude: number
  longitude: number
}

export type CrowdForecastValue = {
  sensorId: number
  pedestriansPerMinute: number
  crowdLevel: CrowdLevel
  intensity: number
  qualityFlag: 'ok' | 'low_sample' | 'fallback'
  sampleCount: number
}

export type CrowdForecastFrame = {
  forecastAt: string
  pointCount: number
  values: CrowdForecastValue[]
}

export type CrowdForecastSnapshot = {
  generatedAt: string
  startsAt: string
  endsAt: string
  timezone: typeof TIMEZONE
  horizonHours: typeof FORECAST_HOURS
  intervalMinutes: typeof FRAME_INTERVAL_MINUTES
  modelVersion: typeof MODEL_VERSION
  sourceStartDate: string
  sourceEndDate: string
  sensorCount: number
  sensors: CrowdForecastSensor[]
  frames: CrowdForecastFrame[]
  source: {
    name: string
    url: string
    license: 'CC BY 4.0'
  }
}

export class ForecastUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ForecastUnavailableError'
  }
}

function getSeason(month: number): Season {
  if (month === 12 || month <= 2) return 'summer'
  if (month <= 5) return 'autumn'
  if (month <= 8) return 'winter'
  return 'spring'
}

export function getMelbourneTimeKey(value: Date): ForecastTimeKey {
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: TIMEZONE,
    weekday: 'short',
    month: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(value)
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value
  const weekday = part('weekday')
  const month = Number(part('month'))
  const hour = Number(part('hour'))
  const minute = Number(part('minute'))
  if (
    !weekday ||
    WEEKDAY_INDEX[weekday] === undefined ||
    !Number.isInteger(month) ||
    !Number.isInteger(hour) ||
    !Number.isInteger(minute)
  ) {
    throw new ForecastUnavailableError('Could not resolve Melbourne forecast time.')
  }
  return {
    dayOfWeek: WEEKDAY_INDEX[weekday],
    season: getSeason(month),
    hourOfDay: hour,
    minute,
  }
}

function keyFor(time: Pick<ForecastTimeKey, 'dayOfWeek' | 'season' | 'hourOfDay'>) {
  return `${time.dayOfWeek}:${time.season}:${time.hourOfDay}`
}

function profileKey(row: ForecastProfileRow) {
  return `${Number(row.location_id)}:${row.day_of_week}:${row.season}:${row.hour_of_day}`
}

function roundPrediction(value: number) {
  return Math.round(Math.max(0, value) * 10) / 10
}

async function getProfilesForTimes(times: ForecastTimeKey[]) {
  const profileGroups = await Promise.all(times.map(async (time) => {
    const { data, error } = await getSupabaseAdminClient()
      .from('crowd_hourly_profiles')
      .select(
        'location_id,day_of_week,season,hour_of_day,baseline_ppm,gradient_ppm_per_hour,sample_count,quality_flag,source_start_date,source_end_date',
      )
      .eq('model_version', MODEL_VERSION)
      .eq('day_of_week', time.dayOfWeek)
      .eq('season', time.season)
      .eq('hour_of_day', time.hourOfDay)
    if (error) {
      throw new ForecastUnavailableError(
        'Forecast profiles could not be loaded from Supabase.',
      )
    }
    return (data ?? []) as ForecastProfileRow[]
  }))
  const profiles = profileGroups.flat()
  if (profiles.length === 0) {
    throw new ForecastUnavailableError(
      `Forecast model ${MODEL_VERSION} is not available in Supabase.`,
    )
  }
  return profiles
}

export async function getCrowdForecast(startValue = new Date()): Promise<CrowdForecastSnapshot> {
  if (!Number.isFinite(startValue.getTime())) {
    throw new ForecastUnavailableError('Invalid forecast start time.')
  }
  const start = new Date(startValue)
  start.setSeconds(0, 0)
  const frameTimes = Array.from(
    { length: FRAME_COUNT },
    (_, index) => new Date(start.getTime() + index * FRAME_INTERVAL_MINUTES * 60_000),
  )
  const frameKeys = frameTimes.map(getMelbourneTimeKey)
  const uniqueTimeKeys = new Map(
    frameKeys.map((time) => [keyFor(time), time]),
  )

  const [catalogue, profiles] = await Promise.all([
    getPedestrianSensorCatalogue(),
    getProfilesForTimes([...uniqueTimeKeys.values()]),
  ])
  if (profiles.length === 0) {
    throw new ForecastUnavailableError('No forecast profiles are available.')
  }

  const profileLookup = new Map(profiles.map((row) => [profileKey(row), row]))
  const profileSensorIds = new Set(profiles.map((row) => Number(row.location_id)))
  const sensors = catalogue.sensors
    .filter((sensor) => profileSensorIds.has(sensor.sensorId))
    .map((sensor) => ({
      sensorId: sensor.sensorId,
      name: sensor.name,
      latitude: sensor.latitude,
      longitude: sensor.longitude,
    }))
    .sort((first, second) => first.sensorId - second.sensorId)
  if (sensors.length === 0) {
    throw new ForecastUnavailableError('Forecast profiles do not match current sensor locations.')
  }

  const frames = frameTimes.map((forecastAt, index): CrowdForecastFrame => {
    const time = frameKeys[index]
    const values = sensors.flatMap((sensor) => {
      const profile = profileLookup.get(
        `${sensor.sensorId}:${time.dayOfWeek}:${time.season}:${time.hourOfDay}`,
      )
      if (!profile) return []
      const pedestriansPerMinute = roundPrediction(
        Number(profile.baseline_ppm) +
          Number(profile.gradient_ppm_per_hour) * (time.minute / 60),
      )
      return [{
        sensorId: sensor.sensorId,
        pedestriansPerMinute,
        crowdLevel: getCrowdLevel(pedestriansPerMinute),
        intensity: getIntensity(pedestriansPerMinute),
        qualityFlag: profile.quality_flag,
        sampleCount: Number(profile.sample_count),
      }]
    })
    return {
      forecastAt: forecastAt.toISOString(),
      pointCount: values.length,
      values,
    }
  })
  const sourceRow = profiles[0]

  return {
    generatedAt: new Date().toISOString(),
    startsAt: frameTimes[0].toISOString(),
    endsAt: frameTimes[frameTimes.length - 1]?.toISOString() ?? frameTimes[0].toISOString(),
    timezone: TIMEZONE,
    horizonHours: FORECAST_HOURS,
    intervalMinutes: FRAME_INTERVAL_MINUTES,
    modelVersion: MODEL_VERSION,
    sourceStartDate: sourceRow.source_start_date,
    sourceEndDate: sourceRow.source_end_date,
    sensorCount: sensors.length,
    sensors,
    frames,
    source: {
      name: 'City of Melbourne historical pedestrian counts',
      url: SOURCE_URL,
      license: 'CC BY 4.0',
    },
  }
}
