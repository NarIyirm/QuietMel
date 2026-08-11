export type RouteCoordinate = {
  lat: number
  lng: number
}

export type PlaceSelection = {
  placeId: string | null
  label: string
  address: string
  location: RouteCoordinate
  source: 'current-location' | 'google-place' | 'map-selected'
}

export type QuietRouteStep = {
  instruction: string
  distanceMeters: number
  durationMinutes: number
  maneuver: string | null
}

export type QuietRouteCandidate = {
  id: string
  durationMinutes: number
  distanceMeters: number
  path: RouteCoordinate[]
  steps: QuietRouteStep[]
}

export type QuietRouteScore = {
  routeId: string
  durationMinutes: number
  distanceMeters: number
  averageCrowdPpm: number
  maximumCrowdPpm: number
  crowdExposure: number
  highCrowdPercent: number
  coverageConfidence: number
  extraMinutesComparedWithFastest: number
  crowdReductionPercent: number
  crowdLevel: 'low' | 'medium' | 'high'
  combinedCost: number
}

export type QuietRoute = QuietRouteCandidate & {
  origin: PlaceSelection
  destination: PlaceSelection
  candidateCount: number
  modelVersion: string
  generatedAt: string
  score: QuietRouteScore
  priority: number
  planType: 'crowd-ranked' | 'nearest-quiet'
}

type QuietRouteSelectionResponse = {
  generatedAt: string
  selectedRouteId: string
  candidateCount: number
  modelVersion: string
  score: QuietRouteScore
  scores: QuietRouteScore[]
}

function compactPath(path: RouteCoordinate[], maximumPoints = 60) {
  if (path.length <= maximumPoints) return path
  const stride = Math.ceil(path.length / maximumPoints)
  const compacted = path.filter((_, index) => index % stride === 0)
  const last = path.at(-1)
  if (last && compacted.at(-1) !== last) compacted.push(last)
  return compacted
}

export async function scoreQuietRouteCandidates(
  candidates: QuietRouteCandidate[],
  signal?: AbortSignal,
) {
  const response = await fetch('/api/routes/quiet', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    signal,
    body: JSON.stringify({
      departureTime: new Date().toISOString(),
      candidates: candidates.map((candidate) => ({
        id: candidate.id,
        durationMinutes: candidate.durationMinutes,
        distanceMeters: candidate.distanceMeters,
        path: compactPath(candidate.path),
      })),
    }),
  })
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) {
    throw new Error(`Route scoring failed with status ${response.status}.`)
  }
  const payload = await response.json() as QuietRouteSelectionResponse & {
    message?: string
  }
  if (!response.ok) {
    throw new Error(payload.message || 'A quiet walking route could not be calculated.')
  }
  return payload
}
