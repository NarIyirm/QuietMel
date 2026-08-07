import { getSupabaseAdminClient } from '../lib/supabase.js'

const CITY_DATA_BASE_URL =
  'https://data.melbourne.vic.gov.au/api/explore/v2.1/catalog/datasets'
const LIVE_COUNTS_DATASET =
  'pedestrian-counting-system-past-hour-counts-per-minute'
const SENSOR_LOCATIONS_DATASET =
  'pedestrian-counting-system-sensor-locations'
const CITY_DATA_PORTAL_URL =
  'https://data.melbourne.vic.gov.au/explore/dataset/pedestrian-counting-system-past-hour-counts-per-minute/'
const SENSOR_DATA_PORTAL_URL =
  'https://data.melbourne.vic.gov.au/explore/dataset/pedestrian-counting-system-sensor-locations/'

const PAGE_SIZE = 100
const LIVE_RECORD_LIMIT = 300
const LIVE_CACHE_DURATION_MS = 60_000
const SENSOR_CACHE_DURATION_MS = 6 * 60 * 60 * 1000
const SOURCE_TIMEOUT_MS = 10_000
const STALE_READING_THRESHOLD_MS = 15 * 60 * 1000

type OdsResponse<T> = {
  total_count: number
  results: T[]
}

type RawLiveCount = {
  location_id?: number | string | null
  sensing_datetime?: string | null
  total_of_directions?: number | string | null
}

type RawSensorLocation = {
  location_id?: number | string | null
  sensor_description?: string | null
  sensor_name?: string | null
  status?: string | null
  latitude?: number | string | null
  longitude?: number | string | null
}

export type CrowdLevel = 'low' | 'medium' | 'high'

export type LiveCrowdPoint = {
  sensorId: number
  name: string
  latitude: number
  longitude: number
  pedestriansPerMinute: number
  crowdLevel: CrowdLevel
  intensity: number
  measuredAt: string
}

export type LiveCrowdSnapshot = {
  fetchedAt: string
  newestReadingAt: string | null
  stale: boolean
  pointCount: number
  points: LiveCrowdPoint[]
  source: {
    name: string
    url: string
    license: 'CC BY 4.0'
  }
}

export type PedestrianSensor = {
  sensorId: number
  name: string
  description: string
  latitude: number
  longitude: number
  status: string
  googlePlaceId: string | null
}

export type PedestrianSensorCatalogue = {
  fetchedAt: string
  pointCount: number
  sensors: PedestrianSensor[]
  source: {
    name: string
    url: string
    license: 'CC BY 4.0'
  }
}

type CacheEntry<T> = {
  value: T
  expiresAt: number
}

let liveCache: CacheEntry<LiveCrowdSnapshot> | undefined
let liveRequest: Promise<LiveCrowdSnapshot> | undefined
let sensorCache: CacheEntry<Map<number, RawSensorLocation>> | undefined

export class CrowdSourceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CrowdSourceError'
  }
}

function asFiniteNumber(value: unknown) {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number : null
}

function getSensorName(locationId: number, location: RawSensorLocation) {
  return (
    location.sensor_description?.trim() ||
    location.sensor_name?.trim() ||
    `Sensor ${locationId}`
  )
}

function getSensorDescription(location: RawSensorLocation) {
  const description = location.sensor_description?.trim()
  const placeName = description || location.sensor_name?.trim() || 'This location'
  return `${placeName} is monitored by the City of Melbourne pedestrian counting network.`
}

async function readSensorLocationsFromDatabase() {
  try {
    const { data, error } = await getSupabaseAdminClient()
      .from('pedestrian_sensors')
      .select(
        'location_id,sensor_name,sensor_description,status,latitude,longitude,google_place_id',
      )
      .eq('status', 'A')

    if (error || !data?.length) return null

    const locations = new Map<number, RawSensorLocation>()
    const googlePlaceIds = new Map<number, string | null>()
    for (const row of data) {
      const locationId = asFiniteNumber(row.location_id)
      const latitude = asFiniteNumber(row.latitude)
      const longitude = asFiniteNumber(row.longitude)
      if (locationId === null || latitude === null || longitude === null) continue
      locations.set(locationId, {
        location_id: locationId,
        sensor_name: row.sensor_name,
        sensor_description: row.sensor_description,
        status: row.status,
        latitude,
        longitude,
      })
      googlePlaceIds.set(locationId, row.google_place_id ?? null)
    }

    return locations.size > 0 ? { locations, googlePlaceIds } : null
  } catch {
    return null
  }
}

async function persistSensorLocations(
  locations: Map<number, RawSensorLocation>,
) {
  try {
    const syncedAt = new Date().toISOString()
    const rows = [...locations].map(([locationId, location]) => ({
      location_id: locationId,
      sensor_name: location.sensor_name?.trim() || null,
      sensor_description: getSensorName(locationId, location),
      latitude: asFiniteNumber(location.latitude),
      longitude: asFiniteNumber(location.longitude),
      status: location.status?.trim() || 'A',
      source_name: 'City of Melbourne Pedestrian Counting System',
      source_url: SENSOR_DATA_PORTAL_URL,
      source_synced_at: syncedAt,
      updated_at: syncedAt,
    }))

    const { error } = await getSupabaseAdminClient()
      .from('pedestrian_sensors')
      .upsert(rows, { onConflict: 'location_id' })
    if (error) return false
    return true
  } catch {
    return false
  }
}

function createDatasetUrl(
  dataset: string,
  parameters: Record<string, string>,
) {
  const url = new URL(`${CITY_DATA_BASE_URL}/${dataset}/records`)
  for (const [name, value] of Object.entries(parameters)) {
    url.searchParams.set(name, value)
  }
  return url
}

async function fetchPage<T>(
  dataset: string,
  parameters: Record<string, string>,
  offset: number,
) {
  const url = createDatasetUrl(dataset, {
    ...parameters,
    limit: String(PAGE_SIZE),
    offset: String(offset),
  })

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'QuietMel/1.0 (City of Melbourne open data client)',
    },
    signal: AbortSignal.timeout(SOURCE_TIMEOUT_MS),
  })

  if (!response.ok) {
    throw new CrowdSourceError(
      `City of Melbourne API returned ${response.status}.`,
    )
  }

  const payload = (await response.json()) as Partial<OdsResponse<T>>
  if (!Array.isArray(payload.results)) {
    throw new CrowdSourceError('City of Melbourne API returned an invalid response.')
  }

  return {
    total_count: asFiniteNumber(payload.total_count) ?? payload.results.length,
    results: payload.results,
  }
}

async function getSensorLocations() {
  const now = Date.now()
  if (sensorCache && sensorCache.expiresAt > now) return sensorCache.value

  let locations: Map<number, RawSensorLocation>
  try {
    const firstPage = await fetchPage<RawSensorLocation>(
      SENSOR_LOCATIONS_DATASET,
      {
        select:
          'location_id,sensor_description,sensor_name,status,latitude,longitude',
        where: `status = 'A'`,
        order_by: 'location_id asc',
      },
      0,
    )
    const offsets = Array.from(
      { length: Math.ceil(firstPage.total_count / PAGE_SIZE) - 1 },
      (_, index) => (index + 1) * PAGE_SIZE,
    )
    const remainingPages = await Promise.all(
      offsets.map((offset) =>
        fetchPage<RawSensorLocation>(
          SENSOR_LOCATIONS_DATASET,
          {
            select:
              'location_id,sensor_description,sensor_name,status,latitude,longitude',
            where: `status = 'A'`,
            order_by: 'location_id asc',
          },
          offset,
        ),
      ),
    )

    locations = new Map<number, RawSensorLocation>()
    for (const record of [
      ...firstPage.results,
      ...remainingPages.flatMap((page) => page.results),
    ]) {
      const locationId = asFiniteNumber(record.location_id)
      const latitude = asFiniteNumber(record.latitude)
      const longitude = asFiniteNumber(record.longitude)
      if (locationId === null || latitude === null || longitude === null) continue
      locations.set(locationId, record)
    }

    void persistSensorLocations(locations)
  } catch (sourceError) {
    const stored = await readSensorLocationsFromDatabase()
    if (!stored) throw sourceError
    locations = stored.locations
  }

  sensorCache = {
    value: locations,
    expiresAt: now + SENSOR_CACHE_DURATION_MS,
  }
  return locations
}

export async function getPedestrianSensorCatalogue(): Promise<PedestrianSensorCatalogue> {
  const locations = await getSensorLocations()
  let stored = await readSensorLocationsFromDatabase()
  if (!stored) {
    await persistSensorLocations(locations)
    stored = await readSensorLocationsFromDatabase()
  }
  const googlePlaceIds = stored?.googlePlaceIds ?? new Map<number, string | null>()
  const sensors: PedestrianSensor[] = []

  for (const [sensorId, location] of locations) {
    const latitude = asFiniteNumber(location.latitude)
    const longitude = asFiniteNumber(location.longitude)
    if (latitude === null || longitude === null) continue

    sensors.push({
      sensorId,
      name: getSensorName(sensorId, location),
      description: getSensorDescription(location),
      latitude,
      longitude,
      status: location.status?.trim() || 'A',
      googlePlaceId: googlePlaceIds.get(sensorId) ?? null,
    })
  }

  sensors.sort((first, second) => first.sensorId - second.sensorId)
  return {
    fetchedAt: new Date().toISOString(),
    pointCount: sensors.length,
    sensors,
    source: {
      name: 'City of Melbourne Pedestrian Counting System sensor locations',
      url: SENSOR_DATA_PORTAL_URL,
      license: 'CC BY 4.0',
    },
  }
}

export function getCrowdLevel(count: number): CrowdLevel {
  if (count < 50) return 'low'
  if (count < 150) return 'medium'
  return 'high'
}

export function getIntensity(count: number) {
  if (count <= 50) return Math.round((count / 50) * 35)
  if (count <= 150) return Math.round(35 + ((count - 50) / 100) * 40)
  return Math.round(75 + Math.min((count - 150) / 150, 1) * 25)
}

async function fetchLiveCrowdSnapshot(): Promise<LiveCrowdSnapshot> {
  const [locations, ...countPages] = await Promise.all([
    getSensorLocations(),
    ...Array.from(
      { length: LIVE_RECORD_LIMIT / PAGE_SIZE },
      (_, index) =>
        fetchPage<RawLiveCount>(
          LIVE_COUNTS_DATASET,
          {
            select: 'location_id,sensing_datetime,total_of_directions',
            where:
              'location_id is not null and sensing_datetime is not null and total_of_directions is not null',
            order_by: 'sensing_datetime desc',
            timezone: 'Australia/Melbourne',
          },
          index * PAGE_SIZE,
        ),
    ),
  ])

  const latestBySensor = new Map<number, RawLiveCount>()
  for (const record of countPages.flatMap((page) => page.results)) {
    const locationId = asFiniteNumber(record.location_id)
    if (locationId === null || latestBySensor.has(locationId)) continue
    latestBySensor.set(locationId, record)
  }

  const points: LiveCrowdPoint[] = []
  for (const [sensorId, record] of latestBySensor) {
    const location = locations.get(sensorId)
    const latitude = asFiniteNumber(location?.latitude)
    const longitude = asFiniteNumber(location?.longitude)
    const count = asFiniteNumber(record.total_of_directions)
    const measuredAt = record.sensing_datetime
    if (
      !location ||
      latitude === null ||
      longitude === null ||
      count === null ||
      typeof measuredAt !== 'string'
    ) continue

    points.push({
      sensorId,
      name: getSensorName(sensorId, location),
      latitude,
      longitude,
      pedestriansPerMinute: Math.max(0, Math.round(count)),
      crowdLevel: getCrowdLevel(count),
      intensity: getIntensity(count),
      measuredAt,
    })
  }

  points.sort((first, second) => first.sensorId - second.sensorId)
  const newestReadingAt = points.reduce<string | null>((latest, point) => {
    if (!latest) return point.measuredAt
    return Date.parse(point.measuredAt) > Date.parse(latest)
      ? point.measuredAt
      : latest
  }, null)

  if (points.length === 0) {
    throw new CrowdSourceError('No current pedestrian readings were available.')
  }

  return {
    fetchedAt: new Date().toISOString(),
    newestReadingAt,
    stale:
      newestReadingAt === null ||
      Date.now() - Date.parse(newestReadingAt) > STALE_READING_THRESHOLD_MS,
    pointCount: points.length,
    points,
    source: {
      name: 'City of Melbourne Pedestrian Counting System',
      url: CITY_DATA_PORTAL_URL,
      license: 'CC BY 4.0',
    },
  }
}

export async function getLiveCrowdSnapshot(forceRefresh = false) {
  const now = Date.now()
  if (!forceRefresh && liveCache && liveCache.expiresAt > now) return liveCache.value
  if (liveRequest) return liveRequest

  liveRequest = fetchLiveCrowdSnapshot()
    .then((snapshot) => {
      liveCache = {
        value: snapshot,
        expiresAt: Date.now() + LIVE_CACHE_DURATION_MS,
      }
      return snapshot
    })
    .catch((error) => {
      if (liveCache) return { ...liveCache.value, stale: true }
      if (error instanceof CrowdSourceError) throw error
      throw new CrowdSourceError(
        error instanceof Error
          ? `City of Melbourne data could not be loaded: ${error.message}`
          : 'City of Melbourne data could not be loaded.',
      )
    })
    .finally(() => {
      liveRequest = undefined
    })

  return liveRequest
}
