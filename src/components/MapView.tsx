import { useEffect, useMemo, useRef, useState } from 'react'
import { scoreRouteQuietness, type RouteQuietnessResult } from '../lib/routeQuietness'
import { ExternalLink, X } from 'lucide-react'
import {
  AdvancedMarker,
  APIProvider,
  InfoWindow,
  Map as GoogleMap,
  useMap,
} from '@vis.gl/react-google-maps'
import {
  DEMO_REROUTE,
  DEMO_ROUTES,
  type DemoRouteId,
  type NavigationRouteId,
} from '../data/demoRoutes'
import type {
  CrowdLayerMode,
  LiveCrowdPoint,
  PedestrianSensor,
} from '../lib/crowd'
import { getPlaceCategory, type PlaceCategoryId } from '../lib/placeDiscovery'
import type { DirectionsPoint, PickTarget } from './DirectionsPanel'

type ZoomRequest = {
  id: number
  delta: number
}

type MapViewProps = {
  locateRequest: number
  zoomRequest: ZoomRequest
  routePlanningActive: boolean
  selectedRouteId: DemoRouteId
  onRouteSelect: (routeId: DemoRouteId) => void
  navigationActive: boolean
  navigationRouteId: NavigationRouteId
  reroutePreviewVisible: boolean
  activePlaceCategory: PlaceCategoryId | null
  crowdPoints: LiveCrowdPoint[]
  pedestrianSensors: PedestrianSensor[]
  crowdLayerMode: CrowdLayerMode
  selectedPedestrianSensorId: number | null
  onPedestrianSensorSelect: (sensorId: number | null) => void
  routeSheetState: 'collapsed' | 'medium' | 'expanded'
  onLocationStatus: (message: string) => void
  // Directions feature: real walking route between two chosen points.
  directionsActive: boolean
  directionsOrigin: DirectionsPoint | null
  directionsDestination: DirectionsPoint | null
  directionsPickTarget: PickTarget
  onDirectionsMapPick: (point: DirectionsPoint) => void
  onDirectionsRouteResult: (summary: { distance: string; duration: string } | null) => void
  onDirectionsQuietnessResult: (result: RouteQuietnessResult | null) => void
}

const MELBOURNE_CENTRE = { lat: -37.8136, lng: 144.9631 }
const DEFAULT_ZOOM = 14
const CROWD_COLOR_STOPS = [
  { value: 0, color: [82, 163, 181] },
  { value: 0.35, color: [103, 180, 157] },
  { value: 0.56, color: [202, 199, 119] },
  { value: 0.68, color: [239, 112, 64] },
  { value: 0.78, color: [224, 48, 48] },
  { value: 1, color: [172, 20, 31] },
]

const PULSE_DURATION = 4400
const PULSE_THRESHOLD = 75

type DynamicPlaceDetails = {
  displayName: string | null
  formattedAddress: string | null
  editorialSummary: string | null
  googleMapsUri: string | null
}

const placeDetailsSessionCache = new Map<number, Promise<DynamicPlaceDetails | null>>()

async function requestDynamicPlaceDetails(sensor: PedestrianSensor) {
  const cached = placeDetailsSessionCache.get(sensor.sensorId)
  if (cached) return cached

  const request = (async () => {
    const { Place } = await google.maps.importLibrary('places')
    let place: google.maps.places.Place | undefined

    if (sensor.googlePlaceId) {
      place = new Place({ id: sensor.googlePlaceId })
      await place.fetchFields({
        fields: ['displayName', 'formattedAddress', 'editorialSummary', 'googleMapsURI'],
      })
    } else {
      const result = await Place.searchByText({
        textQuery: `${sensor.name}, Melbourne VIC, Australia`,
        fields: [
          'displayName',
          'formattedAddress',
          'editorialSummary',
          'googleMapsURI',
        ],
        locationBias: {
          center: { lat: sensor.latitude, lng: sensor.longitude },
          radius: 180,
        },
        language: 'en-AU',
        region: 'AU',
        maxResultCount: 1,
      })
      place = result.places[0]
    }

    if (!place) return null
    return {
      displayName: place.displayName ?? null,
      formattedAddress: place.formattedAddress ?? null,
      editorialSummary: place.editorialSummary ?? null,
      googleMapsUri: place.googleMapsURI ?? null,
    }
  })()

  placeDetailsSessionCache.set(sensor.sensorId, request)
  request.catch(() => placeDetailsSessionCache.delete(sensor.sensorId))
  return request
}

function DynamicPlaceSummary({ sensor }: { sensor: PedestrianSensor }) {
  const [state, setState] = useState<{
    status: 'loading' | 'ready' | 'unavailable'
    details: DynamicPlaceDetails | null
  }>({ status: 'loading', details: null })

  useEffect(() => {
    let active = true
    void requestDynamicPlaceDetails(sensor)
      .then((details) => {
        if (!active) return
        setState({
          status: details ? 'ready' : 'unavailable',
          details,
        })
      })
      .catch(() => {
        if (active) setState({ status: 'unavailable', details: null })
      })

    return () => {
      active = false
    }
  }, [sensor])

  if (state.status === 'loading') {
    return (
      <div
        className="pedestrian-sensor-card__place-skeleton"
        aria-label="Loading Google Maps place details"
      >
        <span />
        <span />
      </div>
    )
  }

  if (!state.details) {
    return (
      <div className="pedestrian-sensor-card__place-details">
        <p>{sensor.description}</p>
        <small>Live Google details are unavailable.</small>
      </div>
    )
  }

  const details = state.details
  return (
    <div className="pedestrian-sensor-card__place-details">
      {details.displayName && details.displayName !== sensor.name ? (
        <b>{details.displayName}</b>
      ) : null}
      <p>
        {details.editorialSummary || details.formattedAddress || sensor.description}
      </p>
      {details.editorialSummary && details.formattedAddress ? (
        <small>{details.formattedAddress}</small>
      ) : null}
      {details.googleMapsUri ? (
        <a href={details.googleMapsUri} target="_blank" rel="noreferrer">
          View on Google Maps
          <ExternalLink aria-hidden="true" size={13} />
        </a>
      ) : null}
    </div>
  )
}

function formatReadingTime(value: string) {
  return new Intl.DateTimeFormat('en-AU', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

function formatBusinessStatus(value: string) {
  if (value === 'OPERATIONAL') return 'Open for business'
  if (value === 'CLOSED_TEMPORARILY') return 'Temporarily closed'
  if (value === 'CLOSED_PERMANENTLY') return 'Permanently closed'
  if (value === 'FUTURE_OPENING') return 'Opening in the future'
  return value.toLocaleLowerCase().replaceAll('_', ' ')
}

function getCrowdColor(intensity: number) {
  const value = Math.min(1, Math.max(0, intensity / 100))
  const upperIndex = CROWD_COLOR_STOPS.findIndex((stop) => value <= stop.value)
  const upper = CROWD_COLOR_STOPS[Math.max(1, upperIndex)]
  const lower = CROWD_COLOR_STOPS[Math.max(0, upperIndex - 1)]
  const amount = (value - lower.value) / (upper.value - lower.value)
  const color = lower.color.map((channel, index) =>
    Math.round(channel + (upper.color[index] - channel) * amount),
  )

  return color.join(', ')
}

function LiveCrowdHeatmap({ points }: { points: LiveCrowdPoint[] }) {
  const map = useMap()
  const pointsRef = useRef<LiveCrowdPoint[]>([])
  const schedulePaintRef = useRef<() => void>(() => undefined)

  useEffect(() => {
    pointsRef.current = [...points].sort(
      (first, second) => first.intensity - second.intensity,
    )
    schedulePaintRef.current()
  }, [points])

  useEffect(() => {
    if (!map) return

    const overlay = new google.maps.OverlayView()
    let canvas: HTMLCanvasElement | null = null
    let frame = 0
    let lastPaint = 0
    let resizeObserver: ResizeObserver | null = null
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

    const paint = (timestamp: number) => {
      frame = 0
      if (!canvas) return

      const shouldPulse = !reducedMotion.matches && document.visibilityState === 'visible'
      if (shouldPulse && timestamp - lastPaint < 32) {
        frame = window.requestAnimationFrame(paint)
        return
      }
      lastPaint = timestamp

      const projection = overlay.getProjection()
      if (!projection) return

      const mapElement = map.getDiv()
      const width = mapElement.clientWidth
      const height = mapElement.clientHeight
      const mapBounds = mapElement.getBoundingClientRect()
      const paneBounds = canvas.parentElement?.getBoundingClientRect()
      if (paneBounds) {
        canvas.style.left = `${mapBounds.left - paneBounds.left}px`
        canvas.style.top = `${mapBounds.top - paneBounds.top}px`
      }
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
      const canvasWidth = Math.round(width * pixelRatio)
      const canvasHeight = Math.round(height * pixelRatio)
      if (canvas.width !== canvasWidth || canvas.height !== canvasHeight) {
        canvas.width = canvasWidth
        canvas.height = canvasHeight
        canvas.style.width = `${width}px`
        canvas.style.height = `${height}px`
      }

      const context = canvas.getContext('2d')
      if (!context) return

      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
      context.clearRect(0, 0, width, height)
      context.globalCompositeOperation = 'source-over'
      const pulse = shouldPulse
        ? 0.5 - 0.5 * Math.cos((timestamp / PULSE_DURATION) * Math.PI * 2)
        : 0

      for (const point of pointsRef.current) {
        if (point.pedestriansPerMinute <= 0 || point.intensity <= 0) continue
        const intensity = point.intensity
        const pixel = projection.fromLatLngToContainerPixel(
          new google.maps.LatLng(point.latitude, point.longitude),
        )
        if (!pixel) continue

        const pulseStrength = Math.max(
          0,
          (intensity - PULSE_THRESHOLD) / (100 - PULSE_THRESHOLD),
        )
        const radius = 36 + intensity * 0.3 + pulse * pulseStrength * 8

        if (
          pixel.x < -radius ||
          pixel.y < -radius ||
          pixel.x > width + radius ||
          pixel.y > height + radius
        ) continue

        const color = getCrowdColor(intensity)
        const centreAlpha =
          0.14 +
          (intensity / 100) * 0.13 +
          pulse * pulseStrength * 0.045
        const gradient = context.createRadialGradient(
          pixel.x,
          pixel.y,
          0,
          pixel.x,
          pixel.y,
          radius,
        )
        gradient.addColorStop(0, `rgba(${color}, ${centreAlpha})`)
        gradient.addColorStop(0.34, `rgba(${color}, ${centreAlpha * 0.72})`)
        gradient.addColorStop(0.7, `rgba(${color}, ${centreAlpha * 0.26})`)
        gradient.addColorStop(1, `rgba(${color}, 0)`)
        context.fillStyle = gradient
        context.fillRect(
          pixel.x - radius,
          pixel.y - radius,
          radius * 2,
          radius * 2,
        )

        if (intensity >= PULSE_THRESHOLD) {
          const coreRadius = radius * 0.52
          const coreAlpha = 0.08 + pulseStrength * 0.08 + pulse * 0.025
          const coreGradient = context.createRadialGradient(
            pixel.x,
            pixel.y,
            0,
            pixel.x,
            pixel.y,
            coreRadius,
          )
          coreGradient.addColorStop(0, `rgba(${color}, ${coreAlpha})`)
          coreGradient.addColorStop(0.48, `rgba(${color}, ${coreAlpha * 0.55})`)
          coreGradient.addColorStop(1, `rgba(${color}, 0)`)
          context.fillStyle = coreGradient
          context.fillRect(
            pixel.x - coreRadius,
            pixel.y - coreRadius,
            coreRadius * 2,
            coreRadius * 2,
          )
        }
      }

      if (shouldPulse) frame = window.requestAnimationFrame(paint)
    }

    const schedulePaint = () => {
      if (!frame) frame = window.requestAnimationFrame(paint)
    }
    schedulePaintRef.current = schedulePaint
    overlay.onAdd = () => {
      canvas = document.createElement('canvas')
      canvas.className = 'sensory-pressure-canvas'
      canvas.setAttribute('aria-hidden', 'true')
      overlay.getPanes()?.overlayLayer.appendChild(canvas)
      resizeObserver = new ResizeObserver(schedulePaint)
      resizeObserver.observe(map.getDiv())
      reducedMotion.addEventListener('change', schedulePaint)
      document.addEventListener('visibilitychange', schedulePaint)
      schedulePaint()
    }
    overlay.draw = schedulePaint
    overlay.onRemove = () => {
      resizeObserver?.disconnect()
      resizeObserver = null
      reducedMotion.removeEventListener('change', schedulePaint)
      document.removeEventListener('visibilitychange', schedulePaint)
      if (frame) window.cancelAnimationFrame(frame)
      frame = 0
      schedulePaintRef.current = () => undefined
      canvas?.remove()
      canvas = null
    }
    overlay.setMap(map)

    return () => {
      overlay.setMap(null)
    }
  }, [map])

  return null
}

function DemoRouteOverlay({
  selectedRouteId,
  onRouteSelect,
  routeSheetState,
}: {
  selectedRouteId: DemoRouteId
  onRouteSelect: (routeId: DemoRouteId) => void
  routeSheetState: 'collapsed' | 'medium' | 'expanded'
}) {
  const map = useMap()

  useEffect(() => {
    if (!map) return

    const bounds = new google.maps.LatLngBounds()
    for (const route of DEMO_ROUTES) {
      for (const coordinate of route.coordinates) bounds.extend(coordinate)
    }

    const desktop = window.matchMedia('(min-width: 768px)').matches
    const mobilePanelHeight = routeSheetState === 'collapsed'
      ? 132
      : routeSheetState === 'expanded'
        ? Math.min(720, window.innerHeight - 128)
        : Math.min(380, Math.max(300, window.innerHeight * 0.42))
    map.fitBounds(bounds, desktop
      ? { top: 100, right: 70, bottom: 70, left: 430 }
      : { top: 120, right: 32, bottom: mobilePanelHeight + 98, left: 32 })
  }, [map, routeSheetState])

  useEffect(() => {
    if (!map) return

    const mapLines: google.maps.Polyline[] = []
    const listeners: google.maps.MapsEventListener[] = []
    const visualOverlay = new google.maps.OverlayView()
    let canvas: HTMLCanvasElement | null = null
    let frame = 0
    let resizeObserver: ResizeObserver | null = null
    const orderedRoutes = [...DEMO_ROUTES].sort(
      (first, second) =>
        Number(first.id === selectedRouteId) - Number(second.id === selectedRouteId),
    )

    const paintRoutes = () => {
      frame = 0
      if (!canvas) return

      const projection = visualOverlay.getProjection()
      if (!projection) return

      const mapElement = map.getDiv()
      const width = mapElement.clientWidth
      const height = mapElement.clientHeight
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
      const canvasWidth = Math.round(width * pixelRatio)
      const canvasHeight = Math.round(height * pixelRatio)
      if (canvas.width !== canvasWidth || canvas.height !== canvasHeight) {
        canvas.width = canvasWidth
        canvas.height = canvasHeight
        canvas.style.width = `${width}px`
        canvas.style.height = `${height}px`
      }

      const context = canvas.getContext('2d')
      if (!context) return
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
      context.clearRect(0, 0, width, height)
      context.lineCap = 'round'
      context.lineJoin = 'round'

      const drawRoute = (route: (typeof DEMO_ROUTES)[number], color: string, width: number) => {
        const pixels = route.coordinates
          .map((coordinate) => projection.fromLatLngToContainerPixel(coordinate))
          .filter((pixel): pixel is google.maps.Point => pixel !== null)
        if (pixels.length < 2) return

        context.beginPath()
        context.moveTo(pixels[0].x, pixels[0].y)
        for (let index = 1; index < pixels.length - 1; index += 1) {
          const current = pixels[index]
          const next = pixels[index + 1]
          context.quadraticCurveTo(
            current.x,
            current.y,
            (current.x + next.x) / 2,
            (current.y + next.y) / 2,
          )
        }
        const last = pixels.at(-1)
        if (last) context.lineTo(last.x, last.y)
        context.strokeStyle = color
        context.lineWidth = width
        context.stroke()
      }

      for (const route of orderedRoutes) {
        const selected = route.id === selectedRouteId
        if (selected) drawRoute(route, 'rgba(255, 255, 255, 0.94)', 11)
        drawRoute(route, route.color, selected ? 7 : 5)
      }
    }

    const schedulePaint = () => {
      if (!frame) frame = window.requestAnimationFrame(paintRoutes)
    }

    visualOverlay.onAdd = () => {
      canvas = document.createElement('canvas')
      canvas.className = 'route-lines-canvas'
      canvas.setAttribute('aria-hidden', 'true')
      map.getDiv().appendChild(canvas)
      resizeObserver = new ResizeObserver(schedulePaint)
      resizeObserver.observe(map.getDiv())
      schedulePaint()
    }
    visualOverlay.draw = schedulePaint
    visualOverlay.onRemove = () => {
      resizeObserver?.disconnect()
      resizeObserver = null
      if (frame) window.cancelAnimationFrame(frame)
      frame = 0
      canvas?.remove()
      canvas = null
    }
    visualOverlay.setMap(map)

    for (const route of orderedRoutes) {
      const line = new google.maps.Polyline({
        map,
        path: route.coordinates,
        clickable: true,
        strokeColor: route.color,
        strokeOpacity: 0.01,
        strokeWeight: 18,
        zIndex: route.rank,
      })
      listeners.push(line.addListener('click', () => onRouteSelect(route.id)))
      mapLines.push(line)
    }

    return () => {
      visualOverlay.setMap(null)
      for (const listener of listeners) listener.remove()
      for (const line of mapLines) line.setMap(null)
    }
  }, [map, onRouteSelect, selectedRouteId])

  const start = DEMO_ROUTES[0].coordinates[0]
  const end = DEMO_ROUTES[0].coordinates.at(-1)

  return (
    <>
      <AdvancedMarker position={start} title="Melbourne Central">
        <div className="route-endpoint-marker route-endpoint-marker--start" aria-label="Start: Melbourne Central" />
      </AdvancedMarker>
      {end ? (
        <AdvancedMarker position={end} title="Demo destination">
          <div className="route-endpoint-marker route-endpoint-marker--end" aria-label="Destination" />
        </AdvancedMarker>
      ) : null}
    </>
  )
}

function NavigationMapOverlay({
  routeId,
  reroutePreviewVisible,
}: {
  routeId: NavigationRouteId
  reroutePreviewVisible: boolean
}) {
  const map = useMap()
  const progress = useRef(0.035)
  const route = routeId === 'reroute'
    ? DEMO_REROUTE
    : DEMO_ROUTES.find((candidate) => candidate.id === routeId) ?? DEMO_ROUTES[0]
  const [navigationPosition, setNavigationPosition] = useState(route.coordinates[0])

  useEffect(() => {
    if (!map || reroutePreviewVisible) return

    const getRoutePosition = () => {
      const routeProgress = Math.min(progress.current, 0.88)
      const scaled = routeProgress * (route.coordinates.length - 1)
      const index = Math.min(Math.floor(scaled), route.coordinates.length - 2)
      const amount = scaled - index
      const current = route.coordinates[index]
      const next = route.coordinates[index + 1]
      return {
        position: {
          lat: current.lat + (next.lat - current.lat) * amount,
          lng: current.lng + (next.lng - current.lng) * amount,
        },
        heading: (Math.atan2(next.lng - current.lng, next.lat - current.lat) * 180) / Math.PI,
      }
    }

    const updatePosition = () => {
      progress.current = Math.min(progress.current + 0.006, 0.88)
      const next = getRoutePosition()
      setNavigationPosition(next.position)
      map.moveCamera({
        center: next.position,
        zoom: 17.2,
        heading: next.heading,
        tilt: 45,
      })
    }

    updatePosition()
    const timer = window.setInterval(updatePosition, 600)
    return () => window.clearInterval(timer)
  }, [map, reroutePreviewVisible, route])

  useEffect(() => {
    if (!map || !reroutePreviewVisible) return

    const bounds = new google.maps.LatLngBounds()
    for (const coordinate of route.coordinates) bounds.extend(coordinate)
    for (const coordinate of DEMO_REROUTE.coordinates) bounds.extend(coordinate)
    bounds.extend({ lat: -37.8115, lng: 144.966 })

    map.moveCamera({ heading: 0, tilt: 0 })
    const desktop = window.matchMedia('(min-width: 768px)').matches
    const mobileSheetPadding = Math.min(
      Math.round(window.innerHeight * 0.64),
      window.innerHeight - 180,
    )
    map.fitBounds(bounds, desktop
      ? { top: 70, right: 70, bottom: 70, left: 430 }
      : { top: 42, right: 26, bottom: mobileSheetPadding, left: 26 })
  }, [map, reroutePreviewVisible, route])

  useEffect(() => {
    if (!map) return

    const visualOverlay = new google.maps.OverlayView()
    let canvas: HTMLCanvasElement | null = null
    let frame = 0
    let resizeObserver: ResizeObserver | null = null

    const paintRoutes = () => {
      frame = 0
      if (!canvas) return
      const projection = visualOverlay.getProjection()
      if (!projection) return

      const mapElement = map.getDiv()
      const width = mapElement.clientWidth
      const height = mapElement.clientHeight
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
      const canvasWidth = Math.round(width * pixelRatio)
      const canvasHeight = Math.round(height * pixelRatio)
      if (canvas.width !== canvasWidth || canvas.height !== canvasHeight) {
        canvas.width = canvasWidth
        canvas.height = canvasHeight
        canvas.style.width = `${width}px`
        canvas.style.height = `${height}px`
      }

      const context = canvas.getContext('2d')
      if (!context) return
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
      context.clearRect(0, 0, width, height)
      context.lineCap = 'round'
      context.lineJoin = 'round'

      const drawRoute = (
        coordinates: typeof route.coordinates,
        color: string,
        lineWidth: number,
        dashed = false,
      ) => {
        const pixels = coordinates
          .map((coordinate) => projection.fromLatLngToContainerPixel(coordinate))
          .filter((pixel): pixel is google.maps.Point => pixel !== null)
        if (pixels.length < 2) return
        context.save()
        context.setLineDash(dashed ? [12, 9] : [])
        context.beginPath()
        context.moveTo(pixels[0].x, pixels[0].y)
        for (let index = 1; index < pixels.length - 1; index += 1) {
          const current = pixels[index]
          const next = pixels[index + 1]
          context.quadraticCurveTo(
            current.x,
            current.y,
            (current.x + next.x) / 2,
            (current.y + next.y) / 2,
          )
        }
        const last = pixels.at(-1)
        if (last) context.lineTo(last.x, last.y)
        context.strokeStyle = color
        context.lineWidth = lineWidth
        context.stroke()
        context.restore()
      }

      drawRoute(route.coordinates, 'rgba(255, 255, 255, 0.95)', 12)
      drawRoute(
        route.coordinates,
        reroutePreviewVisible && routeId !== 'reroute' ? '#64788a' : route.color,
        7,
      )
      if (reroutePreviewVisible && routeId !== 'reroute') {
        drawRoute(DEMO_REROUTE.coordinates, 'rgba(255, 255, 255, 0.92)', 11, true)
        drawRoute(DEMO_REROUTE.coordinates, DEMO_REROUTE.color, 6, true)
      }
    }

    const schedulePaint = () => {
      if (!frame) frame = window.requestAnimationFrame(paintRoutes)
    }

    visualOverlay.onAdd = () => {
      canvas = document.createElement('canvas')
      canvas.className = 'route-lines-canvas route-lines-canvas--navigation'
      canvas.setAttribute('aria-hidden', 'true')
      map.getDiv().appendChild(canvas)
      resizeObserver = new ResizeObserver(schedulePaint)
      resizeObserver.observe(map.getDiv())
      schedulePaint()
    }
    visualOverlay.draw = schedulePaint
    visualOverlay.onRemove = () => {
      resizeObserver?.disconnect()
      if (frame) window.cancelAnimationFrame(frame)
      canvas?.remove()
      canvas = null
    }
    visualOverlay.setMap(map)

    return () => visualOverlay.setMap(null)
  }, [map, reroutePreviewVisible, route, routeId])

  useEffect(() => {
    if (!map) return
    return () => {
      map.moveCamera({ heading: 0, tilt: 0 })
    }
  }, [map])

  return (
    <>
      <AdvancedMarker position={navigationPosition} title="Current navigation position" zIndex={20}>
        <div className="navigation-position-marker" aria-label="Your position and direction" />
      </AdvancedMarker>
      {reroutePreviewVisible ? (
        <AdvancedMarker position={{ lat: -37.8115, lng: 144.966 }} title="Rising sensory pressure">
          <div className="dynamic-pressure-marker" aria-label="Swanston Street is getting crowded" />
        </AdvancedMarker>
      ) : null}
    </>
  )
}

type PlaceRouteSummary = {
  placeId: string
  distance: string
  duration: string
}

function PlaceDiscoveryOverlay({
  categoryId,
  userPosition,
  onStatus,
}: {
  categoryId: PlaceCategoryId
  userPosition: google.maps.LatLngLiteral | null
  onStatus: (message: string) => void
}) {
  const map = useMap()
  const [places, setPlaces] = useState<google.maps.places.Place[]>([])
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null)
  const [routingPlaceId, setRoutingPlaceId] = useState<string | null>(null)
  const [routeSummary, setRouteSummary] = useState<PlaceRouteSummary | null>(null)
  const searchSequence = useRef(0)
  const routeSequence = useRef(0)
  const routePolylines = useRef<google.maps.Polyline[]>([])
  const selectedPlace = places.find((place) => place.id === selectedPlaceId) ?? null

 
  function clearRoute() {
    routeSequence.current += 1
    for (const polyline of routePolylines.current) polyline.setMap(null)
    routePolylines.current = []
    setRouteSummary(null)
    setRoutingPlaceId(null)
  }

  useEffect(() => {
    if (!map) return

    const requestId = searchSequence.current + 1
    searchSequence.current = requestId
    const category = getPlaceCategory(categoryId)
    const center = userPosition ?? map.getCenter()?.toJSON() ?? MELBOURNE_CENTRE

    onStatus(`Searching Google Maps for nearby ${category.label.toLocaleLowerCase()}…`)

    void google.maps.importLibrary('places').then(async ({ Place }) => {
      const result = await Place.searchNearby({
        fields: [
          'id',
          'displayName',
          'location',
          'primaryTypeDisplayName',
        ],
        includedTypes: [...category.googleTypes],
        locationRestriction: { center, radius: 2_000 },
        maxResultCount: 20,
        rankPreference: 'DISTANCE',
        language: 'en-AU',
        region: 'AU',
      })

      if (searchSequence.current !== requestId) return
      const nextPlaces = result.places.filter(
        (place) => place.location && place.displayName,
      )
      setPlaces(nextPlaces)

      if (!nextPlaces.length) {
        onStatus(`No ${category.label.toLocaleLowerCase()} were found within 2 km.`)
        return
      }

      const bounds = new google.maps.LatLngBounds()
      bounds.extend(center)
      for (const place of nextPlaces) {
        if (place.location) bounds.extend(place.location)
      }
      map.moveCamera({ heading: 0, tilt: 0 })
      const desktop = window.matchMedia('(min-width: 768px)').matches
      map.fitBounds(
        bounds,
        desktop
          ? { top: 120, right: 90, bottom: 100, left: 420 }
          : { top: 190, right: 44, bottom: 150, left: 44 },
      )
      onStatus(`Showing ${nextPlaces.length} nearby ${category.label.toLocaleLowerCase()} from Google Maps.`)
    }).catch(() => {
      if (searchSequence.current === requestId) {
        onStatus('Google Maps could not load nearby places. Check the Places API configuration.')
      }
    })

    return () => {
      searchSequence.current += 1
      routeSequence.current += 1
      for (const polyline of routePolylines.current) polyline.setMap(null)
      routePolylines.current = []
    }
  }, [categoryId, map, onStatus, userPosition])

  async function showWalkingRoute(place: google.maps.places.Place) {
    if (!map || !place.location) return

    const requestId = routeSequence.current + 1
    routeSequence.current = requestId
    for (const polyline of routePolylines.current) polyline.setMap(null)
    routePolylines.current = []
    setRouteSummary(null)
    setRoutingPlaceId(place.id)
    onStatus(`Calculating a walking route to ${place.displayName ?? 'this place'}…`)

    try {
      const { Route } = await google.maps.importLibrary('routes')
      const origin = userPosition ?? map.getCenter()?.toJSON() ?? MELBOURNE_CENTRE
      const result = await Route.computeRoutes({
        origin,
        destination: place,
        travelMode: 'WALKING',
        fields: ['path', 'distanceMeters', 'durationMillis', 'localizedValues', 'viewport'],
        language: 'en-AU',
        region: 'AU',
        units: google.maps.UnitSystem.METRIC,
      })

      if (routeSequence.current !== requestId) return
      const route = result.routes?.[0]
      if (!route) throw new Error('No walking route returned')

      const polylines = route.createPolylines({
        polylineOptions: {
          strokeColor: '#087c78',
          strokeOpacity: 0.94,
          strokeWeight: 7,
          zIndex: 30,
        },
      })
      for (const polyline of polylines) polyline.setMap(map)
      routePolylines.current = polylines

      if (route.viewport) {
        const desktop = window.matchMedia('(min-width: 768px)').matches
        map.fitBounds(
          route.viewport,
          desktop
            ? { top: 120, right: 90, bottom: 100, left: 420 }
            : { top: 190, right: 44, bottom: 220, left: 44 },
        )
      }

      const distance = route.localizedValues?.distance
        ?? `${Math.round((route.distanceMeters ?? 0) / 10) / 100} km`
      const duration = route.localizedValues?.duration
        ?? `${Math.max(1, Math.round((route.durationMillis ?? 0) / 60_000))} min`
      setRouteSummary({ placeId: place.id, distance, duration })
      setRoutingPlaceId(null)
      onStatus(`Walking route ready: ${duration}, ${distance}.`)
    } catch {
      if (routeSequence.current !== requestId) return
      setRoutingPlaceId(null)
      onStatus('Google Maps could not calculate a walking route. Check the Routes API configuration.')
    }
  }

  async function selectPlace(place: google.maps.places.Place) {
    setSelectedPlaceId(place.id)
    if (place.formattedAddress !== undefined) return

    try {
      await place.fetchFields({
        fields: [
          'formattedAddress',
          'businessStatus',
          'rating',
          'userRatingCount',
          'googleMapsURI',
        ],
      })
      setPlaces((current) => [...current])
    } catch {
      onStatus('Some Google Maps place details are unavailable.')
    }
  }

  return (
    <>
      {places.map((place) => {
        if (!place.location) return null
        const selected = place.id === selectedPlaceId
        return (
          <AdvancedMarker
            key={place.id}
            position={place.location}
            title={place.displayName ?? 'Google Maps place'}
            zIndex={selected ? 80 : 40}
            onClick={() => void selectPlace(place)}
          >
            <div
              className={`place-result-marker${selected ? ' place-result-marker--selected' : ''}`}
              aria-label={place.displayName ?? 'Google Maps place'}
            >
              <span aria-hidden="true" />
            </div>
          </AdvancedMarker>
        )
      })}

      {selectedPlace?.location ? (
        <InfoWindow
          position={selectedPlace.location}
          onCloseClick={() => setSelectedPlaceId(null)}
          headerDisabled
          pixelOffset={[0, -32]}
        >
          <article className="place-result-card">
            <header>
              <div>
                <span>{selectedPlace.primaryTypeDisplayName ?? 'Place'}</span>
                <h2>{selectedPlace.displayName}</h2>
              </div>
              <button
                type="button"
                aria-label="Close place details"
                onClick={() => setSelectedPlaceId(null)}
              >
                <X aria-hidden="true" size={17} />
              </button>
            </header>
            {selectedPlace.formattedAddress ? <p>{selectedPlace.formattedAddress}</p> : null}
            <div className="place-result-card__facts">
              {selectedPlace.rating ? (
                <span>
                  <strong>{selectedPlace.rating.toFixed(1)}</strong>
                  Google rating
                  {selectedPlace.userRatingCount ? ` · ${selectedPlace.userRatingCount.toLocaleString('en-AU')} reviews` : ''}
                </span>
              ) : null}
              {selectedPlace.businessStatus ? (
                <span>{formatBusinessStatus(selectedPlace.businessStatus)}</span>
              ) : null}
              {routeSummary?.placeId === selectedPlace.id ? (
                <span><strong>{routeSummary.duration}</strong> · {routeSummary.distance} walking</span>
              ) : null}
            </div>
            <div className="place-result-card__actions">
              <button
                type="button"
                disabled={routingPlaceId === selectedPlace.id}
                onClick={() => void showWalkingRoute(selectedPlace)}
              >
                {routingPlaceId === selectedPlace.id ? 'Calculating…' : 'Show walking route'}
              </button>
              {routeSummary?.placeId === selectedPlace.id ? (
                <button type="button" onClick={clearRoute}>Clear route</button>
              ) : null}
              {selectedPlace.googleMapsURI ? (
                <a href={selectedPlace.googleMapsURI} target="_blank" rel="noreferrer">
                  View on Google Maps
                  <ExternalLink aria-hidden="true" size={13} />
                </a>
              ) : null}
            </div>
          </article>
        </InfoWindow>
      ) : null}
    </>
  )
}

function DirectionsOverlay({
  origin,
  destination,
  pickTarget,
  crowdPoints,
  onMapPick,
  onRouteResult,
  onQuietnessResult,
  onStatus,
}: {
  origin: DirectionsPoint | null
  destination: DirectionsPoint | null
  pickTarget: PickTarget
  crowdPoints: LiveCrowdPoint[]
  onMapPick: (point: DirectionsPoint) => void
  onRouteResult: (summary: { distance: string; duration: string } | null) => void
  onQuietnessResult: (result: RouteQuietnessResult | null) => void
  onStatus: (message: string) => void
}) {
  const map = useMap()
  const routePolylines = useRef<google.maps.Polyline[]>([])
  const routeSequence = useRef(0)

  // Clear any drawn route lines from the map.
  function clearRouteLines() {
    for (const polyline of routePolylines.current) polyline.setMap(null)
    routePolylines.current = []
  }

  // When "pick on map" is active, the next map click sets that endpoint.
  useEffect(() => {
    if (!map || !pickTarget) return

    const listener = map.addListener('click', (event: google.maps.MapMouseEvent) => {
      const latLng = event.latLng
      if (!latLng) return
      const location = { lat: latLng.lat(), lng: latLng.lng() }
      // Report the tapped location; the label is a short coordinate string.
      onMapPick({
        label: `Dropped pin (${location.lat.toFixed(4)}, ${location.lng.toFixed(4)})`,
        location,
      })
    })

    return () => listener.remove()
  }, [map, pickTarget, onMapPick])

  // Whenever both endpoints exist, compute and draw a real walking route.
  useEffect(() => {
    if (!map || !origin || !destination) {
      clearRouteLines()
      onRouteResult(null)
      onQuietnessResult(null)
      return
    }

    const requestId = routeSequence.current + 1
    routeSequence.current = requestId
    onStatus('Calculating a walking route…')

    void (async () => {
      try {
        const { Route } = await google.maps.importLibrary('routes') as google.maps.RoutesLibrary
        const result = await Route.computeRoutes({
          origin: origin.location,
          destination: destination.location,
          travelMode: 'WALKING',
          fields: ['path', 'distanceMeters', 'durationMillis', 'localizedValues', 'viewport'],
          language: 'en-AU',
          region: 'AU',
          units: google.maps.UnitSystem.METRIC,
        })

        // Ignore if a newer request started while we awaited.
        if (routeSequence.current !== requestId) return

        const route = result.routes?.[0]
        if (!route) throw new Error('No walking route returned')

        clearRouteLines()
        const polylines = route.createPolylines({
          polylineOptions: {
            strokeColor: '#087c78',
            strokeOpacity: 0.95,
            strokeWeight: 7,
            zIndex: 40,
          },
        })
        for (const polyline of polylines) polyline.setMap(map)
        routePolylines.current = polylines

        // Fit the map to the whole route.
        if (route.viewport) {
          const desktop = window.matchMedia('(min-width: 768px)').matches
          map.fitBounds(
            route.viewport,
            desktop
              ? { top: 120, right: 90, bottom: 100, left: 420 }
              : { top: 190, right: 44, bottom: 220, left: 44 },
          )
        }

        const distance = route.localizedValues?.distance
          ?? `${Math.round((route.distanceMeters ?? 0) / 10) / 100} km`
        const duration = route.localizedValues?.duration
          ?? `${Math.max(1, Math.round((route.durationMillis ?? 0) / 60_000))} min`
        onRouteResult({ distance, duration })

        // Score the route against live pedestrian crowd data.
        const path = route.path?.map((point) => ({
          lat: point.lat,
          lng: point.lng,
        })) ?? []
        const quietness = scoreRouteQuietness(path, crowdPoints)
        onQuietnessResult(quietness)

        onStatus(
          `Walking route ready: ${duration}, ${distance}. ${quietness.quietnessLabel}.`,
        )
      } catch {
        if (routeSequence.current !== requestId) return
        clearRouteLines()
        onRouteResult(null)
        onStatus('Could not calculate a walking route. Check the Routes API configuration.')
      }
    })()

    return () => {
      routeSequence.current += 1
    }
   }, [map, origin, destination])

  // Clean up route lines when the overlay unmounts.
  useEffect(() => clearRouteLines, [])

  return (
    <>
      {origin ? (
        <AdvancedMarker position={origin.location} title="Start" zIndex={50}>
          <div className="directions-marker directions-marker--start" aria-label="Start point" />
        </AdvancedMarker>
      ) : null}
      {destination ? (
        <AdvancedMarker position={destination.location} title="Destination" zIndex={50}>
          <div className="directions-marker directions-marker--end" aria-label="Destination" />
        </AdvancedMarker>
      ) : null}
    </>
  )
}

function MapContent({
  locateRequest,
  zoomRequest,
  routePlanningActive,
  selectedRouteId,
  onRouteSelect,
  navigationActive,
  navigationRouteId,
  reroutePreviewVisible,
  activePlaceCategory,
  crowdPoints,
  pedestrianSensors,
  crowdLayerMode,
  selectedPedestrianSensorId,
  onPedestrianSensorSelect,
  routeSheetState,
  onLocationStatus,
  directionsActive,
  directionsOrigin,
  directionsDestination,
  directionsPickTarget,
  onDirectionsMapPick,
  onDirectionsRouteResult,
  onDirectionsQuietnessResult,
}: MapViewProps) {
  const map = useMap()
  const [userPosition, setUserPosition] = useState<{ lat: number; lng: number } | null>(null)
  const sensorCloseTimerRef = useRef<number | null>(null)
  const readingsBySensor = useMemo(
    () => new Map(crowdPoints.map((point) => [point.sensorId, point])),
    [crowdPoints],
  )
  const selectedSensor = pedestrianSensors.find(
    (sensor) => sensor.sensorId === selectedPedestrianSensorId,
  ) ?? null
  const selectedReading = selectedPedestrianSensorId === null
    ? null
    : readingsBySensor.get(selectedPedestrianSensorId) ?? null

  function cancelSensorClose() {
    if (sensorCloseTimerRef.current !== null) {
      window.clearTimeout(sensorCloseTimerRef.current)
      sensorCloseTimerRef.current = null
    }
  }

  function scheduleSensorClose() {
    cancelSensorClose()
    sensorCloseTimerRef.current = window.setTimeout(() => {
      onPedestrianSensorSelect(null)
      sensorCloseTimerRef.current = null
    }, 220)
  }

  useEffect(() => {
    if (!map || zoomRequest.id === 0) return

    const nextZoom = (map.getZoom() ?? DEFAULT_ZOOM) + zoomRequest.delta
    map.setZoom(Math.min(20, Math.max(3, nextZoom)))
  }, [map, zoomRequest])

  useEffect(() => {
    if (!map || locateRequest === 0) return

    if (!navigator.geolocation) {
      onLocationStatus('Location is not available in this browser.')
      return
    }

    onLocationStatus('Finding your location...')
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const position = { lat: coords.latitude, lng: coords.longitude }
        setUserPosition(position)
        map.setCenter(position)
        map.setZoom(15)
        onLocationStatus('Your location is shown on the map.')
      },
      () => onLocationStatus('We could not access your location.'),
      { enableHighAccuracy: true, timeout: 8000 },
    )
  }, [locateRequest, map, onLocationStatus])

  useEffect(() => () => cancelSensorClose(), [])

  return (
    <>
      {!activePlaceCategory && crowdLayerMode !== 'sensors' ? (
        <LiveCrowdHeatmap points={crowdPoints} />
      ) : null}

      {!activePlaceCategory && crowdLayerMode !== 'heatmap'
        ? pedestrianSensors.map((sensor) => {
            const reading = readingsBySensor.get(sensor.sensorId)
            const level = reading?.crowdLevel ?? 'unavailable'
            const selected = sensor.sensorId === selectedPedestrianSensorId

            return (
              <AdvancedMarker
                key={sensor.sensorId}
                position={{ lat: sensor.latitude, lng: sensor.longitude }}
                title={`${sensor.name}. ${reading ? `${reading.pedestriansPerMinute} pedestrians per minute` : 'Current reading unavailable'}`}
                zIndex={selected ? 100 : reading ? 20 : 5}
                collisionBehavior={google.maps.CollisionBehavior.OPTIONAL_AND_HIDES_LOWER_PRIORITY}
                onClick={() => {
                  cancelSensorClose()
                  onPedestrianSensorSelect(sensor.sensorId)
                }}
              >
                <div
                  className={`pedestrian-sensor-marker pedestrian-sensor-marker--${level}${selected ? ' pedestrian-sensor-marker--selected' : ''}`}
                  aria-hidden="true"
                >
                  <span>{reading?.pedestriansPerMinute ?? '·'}</span>
                </div>
              </AdvancedMarker>
            )
          })
        : null}

      {!activePlaceCategory && crowdLayerMode !== 'heatmap' && selectedSensor ? (
        <InfoWindow
          position={{ lat: selectedSensor.latitude, lng: selectedSensor.longitude }}
          onCloseClick={() => onPedestrianSensorSelect(null)}
          headerDisabled
          pixelOffset={[0, -30]}
        >
          <article
            className="pedestrian-sensor-card"
            onPointerEnter={cancelSensorClose}
            onPointerLeave={scheduleSensorClose}
          >
            <header className="pedestrian-sensor-card__header">
              <h2>{selectedSensor.name}</h2>
              <button
                type="button"
                aria-label="Close sensor details"
                onClick={() => onPedestrianSensorSelect(null)}
              >
                <X aria-hidden="true" size={18} />
              </button>
            </header>
            {selectedReading ? (
              <div className="pedestrian-sensor-card__reading">
                <strong>{selectedReading.pedestriansPerMinute}</strong>
                <div>
                  <span>pedestrians per minute</span>
                  <small>Updated {formatReadingTime(selectedReading.measuredAt)}</small>
                </div>
              </div>
            ) : (
              <div className="pedestrian-sensor-card__reading pedestrian-sensor-card__reading--unavailable">
                <strong>—</strong>
                <div>
                  <span>Current count unavailable</span>
                  <small>Stored sensor position</small>
                </div>
              </div>
            )}
            <section className="pedestrian-sensor-card__summary">
              <strong>Google Maps</strong>
              <DynamicPlaceSummary
                key={selectedSensor.sensorId}
                sensor={selectedSensor}
              />
            </section>
          </article>
        </InfoWindow>
      ) : null}

      {routePlanningActive ? (
        <DemoRouteOverlay
          selectedRouteId={selectedRouteId}
          onRouteSelect={onRouteSelect}
          routeSheetState={routeSheetState}
        />
      ) : null}

      {navigationActive ? (
        <NavigationMapOverlay
          routeId={navigationRouteId}
          reroutePreviewVisible={reroutePreviewVisible}
        />
      ) : null}

      {activePlaceCategory ? (
        <PlaceDiscoveryOverlay
          key={`${activePlaceCategory}:${userPosition?.lat ?? 'map'}:${userPosition?.lng ?? 'centre'}`}
          categoryId={activePlaceCategory}
          userPosition={userPosition}
          onStatus={onLocationStatus}
        />
      ) : null}

      {directionsActive ? (
        <DirectionsOverlay
          origin={directionsOrigin}
          destination={directionsDestination}
          pickTarget={directionsPickTarget}
          crowdPoints={crowdPoints}
          onMapPick={onDirectionsMapPick}
          onRouteResult={onDirectionsRouteResult}
          onQuietnessResult={onDirectionsQuietnessResult}
          onStatus={onLocationStatus}
        />
      ) : null}

      {userPosition ? (
        <AdvancedMarker position={userPosition} title="Your location">
          <div className="user-location-marker" aria-label="Your location" />
        </AdvancedMarker>
      ) : null}
    </>
  )
}

export function MapView(props: MapViewProps) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim()
  const mapId = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID?.trim() || 'DEMO_MAP_ID'

  if (!apiKey) {
    return (
      <div className="map-canvas map-config-message" role="status">
        <div className="map-config-message__content">
          <strong>Google Maps is ready to connect</strong>
          <span>
            Add <code>VITE_GOOGLE_MAPS_API_KEY</code> to <code>.env.local</code>, then restart the development server.
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="map-canvas" aria-label="Map of Melbourne">
      <APIProvider apiKey={apiKey} language="en" region="AU">
        <GoogleMap
          defaultCenter={MELBOURNE_CENTRE}
          defaultZoom={DEFAULT_ZOOM}
          mapId={mapId}
          disableDefaultUI
          gestureHandling="greedy"
          reuseMaps
          style={{ width: '100%', height: '100%' }}
        >
          <MapContent {...props} />
        </GoogleMap>
      </APIProvider>
    </div>
  )
}

export default MapView
