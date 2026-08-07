import { getLiveCrowdSnapshot } from './crowd.js'
import { getCrowdForecast } from './forecast.js'

export type RouteCoordinate = {
  lat: number
  lng: number
}

export type QuietRouteCandidate = {
  id: string
  durationMinutes: number
  distanceMeters: number
  path: RouteCoordinate[]
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

export type QuietRouteSelection = {
  generatedAt: string
  selectedRouteId: string
  candidateCount: number
  modelVersion: string
  score: QuietRouteScore
}

type SamplePoint = RouteCoordinate & {
  distanceAlongMeters: number
}

const SAMPLE_SPACING_METERS = 50
const SENSOR_RADIUS_METERS = 250
const MAX_NEARBY_SENSORS = 4

function toRadians(value: number) {
  return value * (Math.PI / 180)
}

function distanceMeters(first: RouteCoordinate, second: RouteCoordinate) {
  const earthRadius = 6_371_000
  const latitudeDistance = toRadians(second.lat - first.lat)
  const longitudeDistance = toRadians(second.lng - first.lng)
  const firstLatitude = toRadians(first.lat)
  const secondLatitude = toRadians(second.lat)
  const haversine =
    Math.sin(latitudeDistance / 2) ** 2 +
    Math.cos(firstLatitude) *
      Math.cos(secondLatitude) *
      Math.sin(longitudeDistance / 2) ** 2
  return earthRadius * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
}

function samplePath(path: RouteCoordinate[]): SamplePoint[] {
  const segmentLengths: number[] = []
  let totalDistance = 0
  for (let index = 1; index < path.length; index += 1) {
    const length = distanceMeters(path[index - 1], path[index])
    segmentLengths.push(length)
    totalDistance += length
  }

  if (totalDistance === 0) return [{ ...path[0], distanceAlongMeters: 0 }]
  const samples: SamplePoint[] = []
  let segmentIndex = 0
  let segmentStartDistance = 0
  for (
    let targetDistance = 0;
    targetDistance <= totalDistance;
    targetDistance += SAMPLE_SPACING_METERS
  ) {
    while (
      segmentIndex < segmentLengths.length - 1 &&
      segmentStartDistance + segmentLengths[segmentIndex] < targetDistance
    ) {
      segmentStartDistance += segmentLengths[segmentIndex]
      segmentIndex += 1
    }
    const segmentLength = segmentLengths[segmentIndex] || 1
    const amount = Math.min(1, (targetDistance - segmentStartDistance) / segmentLength)
    const start = path[segmentIndex]
    const end = path[segmentIndex + 1] ?? start
    samples.push({
      lat: start.lat + (end.lat - start.lat) * amount,
      lng: start.lng + (end.lng - start.lng) * amount,
      distanceAlongMeters: targetDistance,
    })
  }
  const last = path.at(-1)
  if (last && samples.at(-1)?.distanceAlongMeters !== totalDistance) {
    samples.push({ ...last, distanceAlongMeters: totalDistance })
  }
  return samples
}

function round(value: number, digits = 1) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function normalize(value: number, minimum: number, maximum: number) {
  if (maximum <= minimum) return 0
  return (value - minimum) / (maximum - minimum)
}

export async function selectQuietRoute(
  candidates: QuietRouteCandidate[],
  departureTime: Date,
): Promise<QuietRouteSelection> {
  const [forecast, live] = await Promise.all([
    getCrowdForecast(departureTime),
    getLiveCrowdSnapshot(false),
  ])
  const liveBySensor = new Map(
    live.points.map((point) => [point.sensorId, point.pedestriansPerMinute]),
  )
  const forecastSensors = new Map(
    forecast.sensors.map((sensor) => [sensor.sensorId, sensor]),
  )
  const forecastFrames = forecast.frames.map((frame) => ({
    average:
      frame.values.reduce((sum, value) => sum + value.pedestriansPerMinute, 0) /
      Math.max(1, frame.values.length),
    values: new Map(
      frame.values.map((value) => [value.sensorId, value.pedestriansPerMinute]),
    ),
  }))

  const rawScores = candidates.map((candidate) => {
    const samples = samplePath(candidate.path)
    let exposure = 0
    let highCrowdMinutes = 0
    let coveredSamples = 0
    let maximumCrowd = 0
    const minutesPerSample = candidate.durationMinutes / Math.max(1, samples.length - 1)

    for (const sample of samples) {
      const routeProgress = sample.distanceAlongMeters / Math.max(candidate.distanceMeters, 1)
      const arrivalMinutes = Math.min(candidate.durationMinutes, routeProgress * candidate.durationMinutes)
      const frameIndex = Math.min(
        forecastFrames.length - 1,
        Math.max(0, Math.round(arrivalMinutes / forecast.intervalMinutes)),
      )
      const frame = forecastFrames[frameIndex]
      const nearby = [...forecastSensors.values()]
        .map((sensor) => ({
          sensor,
          distance: distanceMeters(sample, {
            lat: sensor.latitude,
            lng: sensor.longitude,
          }),
        }))
        .filter((entry) => entry.distance <= SENSOR_RADIUS_METERS)
        .sort((first, second) => first.distance - second.distance)
        .slice(0, MAX_NEARBY_SENSORS)

      let crowd = frame.average
      if (nearby.length > 0) {
        coveredSamples += 1
        let weightedCrowd = 0
        let totalWeight = 0
        const liveWeight = Math.max(0, 0.7 * (1 - arrivalMinutes / 60))
        for (const { sensor, distance } of nearby) {
          const predicted = frame.values.get(sensor.sensorId) ?? frame.average
          const current = liveBySensor.get(sensor.sensorId)
          const blended = current === undefined
            ? predicted
            : current * liveWeight + predicted * (1 - liveWeight)
          const weight = 1 / Math.max(40, distance) ** 2
          weightedCrowd += blended * weight
          totalWeight += weight
        }
        crowd = weightedCrowd / Math.max(totalWeight, Number.EPSILON)
      }

      exposure += crowd * minutesPerSample
      if (crowd >= 150) highCrowdMinutes += minutesPerSample
      maximumCrowd = Math.max(maximumCrowd, crowd)
    }

    return {
      candidate,
      exposure,
      averageCrowd: exposure / Math.max(candidate.durationMinutes, 1),
      maximumCrowd,
      highCrowdPercent: (highCrowdMinutes / Math.max(candidate.durationMinutes, 1)) * 100,
      coverageConfidence: coveredSamples / Math.max(1, samples.length),
    }
  })

  const fastestDuration = Math.min(...rawScores.map(({ candidate }) => candidate.durationMinutes))
  const maximumAllowedDuration = Math.min(fastestDuration * 1.25, fastestDuration + 10)
  const eligible = rawScores.filter(
    ({ candidate }) => candidate.durationMinutes <= maximumAllowedDuration,
  )
  const durationValues = eligible.map(({ candidate }) => candidate.durationMinutes)
  const exposureValues = eligible.map(({ exposure }) => exposure)
  const durationMinimum = Math.min(...durationValues)
  const durationMaximum = Math.max(...durationValues)
  const exposureMinimum = Math.min(...exposureValues)
  const exposureMaximum = Math.max(...exposureValues)

  const ranked = eligible
    .map((entry) => ({
      ...entry,
      combinedCost:
        normalize(entry.candidate.durationMinutes, durationMinimum, durationMaximum) * 0.45 +
        normalize(entry.exposure, exposureMinimum, exposureMaximum) * 0.4 +
        Math.min(1, entry.highCrowdPercent / 100) * 0.1 +
        (1 - entry.coverageConfidence) * 0.05,
    }))
    .sort((first, second) => first.combinedCost - second.combinedCost)
  const selected = ranked[0]
  const fastest = rawScores.reduce((best, entry) =>
    entry.candidate.durationMinutes < best.candidate.durationMinutes ? entry : best,
  )
  const crowdReduction = fastest.exposure > 0
    ? Math.max(0, (1 - selected.exposure / fastest.exposure) * 100)
    : 0
  const crowdLevel = selected.averageCrowd < 50
    ? 'low'
    : selected.averageCrowd < 150
      ? 'medium'
      : 'high'

  return {
    generatedAt: new Date().toISOString(),
    selectedRouteId: selected.candidate.id,
    candidateCount: candidates.length,
    modelVersion: forecast.modelVersion,
    score: {
      routeId: selected.candidate.id,
      durationMinutes: round(selected.candidate.durationMinutes),
      distanceMeters: Math.round(selected.candidate.distanceMeters),
      averageCrowdPpm: round(selected.averageCrowd),
      maximumCrowdPpm: round(selected.maximumCrowd),
      crowdExposure: round(selected.exposure),
      highCrowdPercent: round(selected.highCrowdPercent),
      coverageConfidence: round(selected.coverageConfidence, 2),
      extraMinutesComparedWithFastest: round(
        selected.candidate.durationMinutes - fastestDuration,
      ),
      crowdReductionPercent: Math.round(crowdReduction),
      crowdLevel,
      combinedCost: round(selected.combinedCost, 3),
    },
  }
}
