import type { LiveCrowdPoint } from './crowd'

// A single point along the walking route path.
export type RoutePathPoint = {
  lat: number
  lng: number
}

// A crowded location the route passes near.
export type CrowdedSegment = {
  sensorId: number
  name: string
  intensity: number
  crowdLevel: 'low' | 'medium' | 'high'
}

export type RouteQuietnessResult = {
  // 0-100, higher means quieter (less crowd exposure).
  quietnessScore: number
  // A short human label for the score.
  quietnessLabel: string
  // Sensors classified as busy that the route passes close to.
  crowdedSegments: CrowdedSegment[]
}

// How close (in metres) a sensor must be to the route to "count" as on-route.
const NEARBY_RADIUS_METRES = 160

// Rough metres-per-degree near Melbourne's latitude. Good enough for a
// short-distance proximity check without pulling in a geo library.
const METRES_PER_DEG_LAT = 111_320
const METRES_PER_DEG_LNG = 87_000 // cos(37.8°) * 111320 ≈ 87000

// Approximate distance in metres between two lat/lng points (equirectangular
// approximation — accurate enough over walking distances).
function approxDistanceMetres(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const dLat = (aLat - bLat) * METRES_PER_DEG_LAT
  const dLng = (aLng - bLng) * METRES_PER_DEG_LNG
  return Math.sqrt(dLat * dLat + dLng * dLng)
}

// Shortest distance (metres) from a sensor to the whole route path, checked
// against each path point. Simple and fast for our point counts.
function distanceToRoute(
  sensor: LiveCrowdPoint,
  path: RoutePathPoint[],
): number {
  let shortest = Infinity
  for (const point of path) {
    const distance = approxDistanceMetres(
      sensor.latitude,
      sensor.longitude,
      point.lat,
      point.lng,
    )
    if (distance < shortest) shortest = distance
  }
  return shortest
}

// Score a walking route by how much pedestrian crowd it passes through.
// Returns a 0-100 quietness score plus the busy locations it passes near.
export function scoreRouteQuietness(
  path: RoutePathPoint[],
  crowdPoints: LiveCrowdPoint[],
): RouteQuietnessResult {
  if (path.length === 0 || crowdPoints.length === 0) {
    // No data to score against — treat as unknown but quiet.
    return {
      quietnessScore: 100,
      quietnessLabel: 'No crowd data',
      crowdedSegments: [],
    }
  }

  let totalExposure = 0
  const crowdedSegments: CrowdedSegment[] = []

  for (const sensor of crowdPoints) {
    const distance = distanceToRoute(sensor, path)
    if (distance > NEARBY_RADIUS_METRES) continue

    // Closer sensors contribute more; fade linearly to zero at the radius edge.
    const proximityWeight = 1 - distance / NEARBY_RADIUS_METRES
    totalExposure += sensor.intensity * proximityWeight

    // Record busy locations the user will actually pass.
    if (sensor.crowdLevel === 'high' || sensor.crowdLevel === 'medium') {
      crowdedSegments.push({
        sensorId: sensor.sensorId,
        name: sensor.name,
        intensity: sensor.intensity,
        crowdLevel: sensor.crowdLevel,
      })
    }
  }

  // Normalise exposure into a 0-100 quietness score. The divisor controls how
  // quickly the score drops; tuned so a couple of busy sensors is noticeable
  // but not an instant zero.
  const exposurePenalty = Math.min(100, totalExposure / 2)
  const quietnessScore = Math.round(100 - exposurePenalty)

  // Sort busiest-first so the UI can show the worst spots.
  crowdedSegments.sort((first, second) => second.intensity - first.intensity)

  return {
    quietnessScore,
    quietnessLabel: quietnessLabelFor(quietnessScore),
    crowdedSegments,
  }
}

function quietnessLabelFor(score: number): string {
  if (score >= 80) return 'Very quiet'
  if (score >= 60) return 'Fairly quiet'
  if (score >= 40) return 'Moderate crowds'
  if (score >= 20) return 'Busy'
  return 'Very busy'
}