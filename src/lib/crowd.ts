export type CrowdLevel = 'low' | 'medium' | 'high'
export type CrowdLayerMode = 'heatmap' | 'sensors' | 'combined'

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
  timezone: 'Australia/Melbourne'
  horizonHours: 6
  intervalMinutes: 15
  modelVersion: 'hourly-gradient-v1'
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

type CrowdErrorResponse = {
  message?: string
}

export async function fetchLiveCrowd(signal?: AbortSignal, force = false) {
  const url = force ? `/api/crowd/live?refresh=1&t=${Date.now()}` : '/api/crowd/live'
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    cache: force ? 'no-store' : 'default',
    signal,
  })

  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as CrowdErrorResponse
    throw new Error(error.message ?? 'Live pedestrian data is unavailable.')
  }

  return response.json() as Promise<LiveCrowdSnapshot>
}

export async function fetchPedestrianSensors(signal?: AbortSignal) {
  const response = await fetch('/api/crowd/sensors', {
    headers: { Accept: 'application/json' },
    signal,
  })

  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as CrowdErrorResponse
    throw new Error(error.message ?? 'Pedestrian sensor locations are unavailable.')
  }

  return response.json() as Promise<PedestrianSensorCatalogue>
}

export async function fetchCrowdForecast(signal?: AbortSignal) {
  const response = await fetch('/api/crowd/forecast', {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
    signal,
  })

  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as CrowdErrorResponse
    throw new Error(error.message ?? 'Crowd forecast data is unavailable.')
  }

  return response.json() as Promise<CrowdForecastSnapshot>
}
