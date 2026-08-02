import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AdvancedMarker,
  APIProvider,
  InfoWindow,
  Map as GoogleMap,
  useMap,
} from '@vis.gl/react-google-maps'
import {
  SENSORY_PRESSURE_POINTS,
} from '../data/sensoryPressure'
import {
  DEMO_REROUTE,
  DEMO_ROUTES,
  type DemoRouteId,
  type NavigationRouteId,
} from '../data/demoRoutes'
import { QUIET_SPACES, type QuietSpace } from '../data/quietSpaces'
import { getForecastPressure } from '../data/sensoryForecast'

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
  quietFinderOpen: boolean
  selectedQuietSpaceId: string
  quietSpaceDestination: QuietSpace | null
  forecastSlotIndex: number | null
  routeSheetState: 'collapsed' | 'medium' | 'expanded'
  onQuietSpaceSelect: (spaceId: string) => void
  onQuietSpaceConfirm: (spaceId: string) => void
  onLocationStatus: (message: string) => void
}

const MELBOURNE_CENTRE = { lat: -37.8136, lng: 144.9631 }
const DEFAULT_ZOOM = 14
const SENSORY_COLOR_STOPS = [
  { value: 0, color: [82, 163, 181] },
  { value: 0.35, color: [103, 180, 157] },
  { value: 0.56, color: [202, 199, 119] },
  { value: 0.68, color: [239, 112, 64] },
  { value: 0.78, color: [224, 48, 48] },
  { value: 1, color: [172, 20, 31] },
]

const PULSE_DURATION = 4400
const PULSE_THRESHOLD = 75

function getPressureColor(pressure: number) {
  const value = Math.min(1, Math.max(0, pressure / 100))
  const upperIndex = SENSORY_COLOR_STOPS.findIndex((stop) => value <= stop.value)
  const upper = SENSORY_COLOR_STOPS[Math.max(1, upperIndex)]
  const lower = SENSORY_COLOR_STOPS[Math.max(0, upperIndex - 1)]
  const amount = (value - lower.value) / (upper.value - lower.value)
  const color = lower.color.map((channel, index) =>
    Math.round(channel + (upper.color[index] - channel) * amount),
  )

  return color.join(', ')
}

function SensoryPressureHeatmap({
  dynamicPressureActive = false,
  forecastSlotIndex = null,
}: {
  dynamicPressureActive?: boolean
  forecastSlotIndex?: number | null
}) {
  const map = useMap()
  const forecastSlotRef = useRef<number | null>(forecastSlotIndex)
  const schedulePaintRef = useRef<() => void>(() => undefined)

  useEffect(() => {
    forecastSlotRef.current = forecastSlotIndex
    schedulePaintRef.current()
  }, [forecastSlotIndex])

  useEffect(() => {
    if (!map) return

    const overlay = new google.maps.OverlayView()
    let canvas: HTMLCanvasElement | null = null
    let frame = 0
    let lastPaint = 0
    let resizeObserver: ResizeObserver | null = null
    const displayedPressures = new Map<string, number>()
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

      for (const point of [...SENSORY_PRESSURE_POINTS].sort(
        (first, second) => first.pressure - second.pressure,
      )) {
        const targetPressure = forecastSlotRef.current === null
          ? point.pressure
          : getForecastPressure(point, forecastSlotRef.current)
        const previousPressure = displayedPressures.get(point.id) ?? targetPressure
        const pressure = shouldPulse
          ? previousPressure + (targetPressure - previousPressure) * 0.09
          : targetPressure
        displayedPressures.set(point.id, pressure)
        const [lng, lat] = point.coordinates
        const pixel = projection.fromLatLngToContainerPixel(
          new google.maps.LatLng(lat, lng),
        )
        if (!pixel) continue

        const pulseStrength = Math.max(
          0,
          (pressure - PULSE_THRESHOLD) / (100 - PULSE_THRESHOLD),
        )
        const radius = 74 + pressure * 0.36 + pulse * pulseStrength * 12

        if (
          pixel.x < -radius ||
          pixel.y < -radius ||
          pixel.x > width + radius ||
          pixel.y > height + radius
        ) continue

        const color = getPressureColor(pressure)
        const centreAlpha =
          0.14 +
          (pressure / 100) * 0.13 +
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

        if (pressure >= PULSE_THRESHOLD) {
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

      if (dynamicPressureActive) {
        const eventPixel = projection.fromLatLngToContainerPixel(
          new google.maps.LatLng(-37.8115, 144.966),
        )
        if (eventPixel) {
          const radius = 118 + pulse * 34
          const eventGradient = context.createRadialGradient(
            eventPixel.x,
            eventPixel.y,
            0,
            eventPixel.x,
            eventPixel.y,
            radius,
          )
          eventGradient.addColorStop(0, `rgba(172, 20, 31, ${0.52 + pulse * 0.1})`)
          eventGradient.addColorStop(0.28, `rgba(210, 42, 49, ${0.34 + pulse * 0.08})`)
          eventGradient.addColorStop(0.66, 'rgba(239, 112, 64, 0.15)')
          eventGradient.addColorStop(1, 'rgba(239, 112, 64, 0)')
          context.fillStyle = eventGradient
          context.fillRect(
            eventPixel.x - radius,
            eventPixel.y - radius,
            radius * 2,
            radius * 2,
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
      map.getDiv().appendChild(canvas)
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
      canvas?.remove()
      canvas = null
      schedulePaintRef.current = () => undefined
    }
    overlay.setMap(map)

    return () => {
      overlay.setMap(null)
    }
  }, [dynamicPressureActive, map])

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
  quietFinderOpen,
  quietSpaceDestination,
}: {
  routeId: NavigationRouteId
  reroutePreviewVisible: boolean
  quietFinderOpen: boolean
  quietSpaceDestination: QuietSpace | null
}) {
  const map = useMap()
  const progress = useRef(0.035)
  const baseRoute = routeId === 'reroute'
    ? DEMO_REROUTE
    : DEMO_ROUTES.find((candidate) => candidate.id === routeId) ?? DEMO_ROUTES[0]
  const route = useMemo(() => quietSpaceDestination
    ? { ...baseRoute, coordinates: quietSpaceDestination.routeCoordinates, color: '#087c78' }
    : baseRoute, [baseRoute, quietSpaceDestination])
  const [navigationPosition, setNavigationPosition] = useState(route.coordinates[0])

  useEffect(() => {
    if (!map || reroutePreviewVisible || quietFinderOpen) return

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
  }, [map, quietFinderOpen, reroutePreviewVisible, route])

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
      if (quietFinderOpen) return
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
  }, [map, quietFinderOpen, reroutePreviewVisible, route, routeId])

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

function QuietSpaceFinderOverlay({
  active,
  selectedSpaceId,
  onSelect,
  onConfirm,
}: {
  active: boolean
  selectedSpaceId: string
  onSelect: (spaceId: string) => void
  onConfirm: (spaceId: string) => void
}) {
  const map = useMap()
  const selectedSpace = QUIET_SPACES.find((space) => space.id === selectedSpaceId)

  useEffect(() => {
    if (!map || !active) return
    const bounds = new google.maps.LatLngBounds()
    for (const space of QUIET_SPACES) bounds.extend(space.coordinates)
    bounds.extend({ lat: -37.8112, lng: 144.967 })
    map.moveCamera({ heading: 0, tilt: 0 })
    const desktop = window.matchMedia('(min-width: 768px)').matches
    map.fitBounds(bounds, desktop
      ? { top: 120, right: 120, bottom: 130, left: 120 }
      : { top: 150, right: 54, bottom: 190, left: 54 })
  }, [active, map])

  if (!active) return null

  return (
    <>
      {QUIET_SPACES.map((space) => (
        <AdvancedMarker
          key={space.id}
          position={space.coordinates}
          title={space.name}
          zIndex={space.id === selectedSpaceId ? 18 : 14}
          onClick={() => onSelect(space.id)}
        >
          <div
            className={`quiet-space-marker${space.id === selectedSpaceId ? ' quiet-space-marker--selected' : ''}`}
            aria-label={`${space.name}, ${space.density.toLowerCase()} density`}
          >
            <span aria-hidden="true">Q</span>
          </div>
        </AdvancedMarker>
      ))}

      {selectedSpace ? (
        <InfoWindow
          position={selectedSpace.coordinates}
          onCloseClick={() => onSelect('')}
          headerDisabled
          disableAutoPan
        >
          <article className="quiet-space-info">
            <span className="quiet-space-info__type">{selectedSpace.type}</span>
            <h2>{selectedSpace.name}</h2>
            <div className="quiet-space-info__metrics">
              <strong>{selectedSpace.distance}</strong>
              <span>Quiet {selectedSpace.quietScore}/100</span>
            </div>
            <div className="quiet-space-info__density">
              <span>Current density</span>
              <strong>{selectedSpace.density} · {selectedSpace.densityPercent}%</strong>
            </div>
            <p>{selectedSpace.description}</p>
            <button type="button" onClick={() => onConfirm(selectedSpace.id)}>
              Navigate here · {selectedSpace.walkingMinutes} min
            </button>
            <small>Demo live estimate</small>
          </article>
        </InfoWindow>
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
  quietFinderOpen,
  selectedQuietSpaceId,
  quietSpaceDestination,
  forecastSlotIndex,
  routeSheetState,
  onQuietSpaceSelect,
  onQuietSpaceConfirm,
  onLocationStatus,
}: MapViewProps) {
  const map = useMap()
  const [userPosition, setUserPosition] = useState<{ lat: number; lng: number } | null>(null)

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

  return (
    <>
      <SensoryPressureHeatmap
        dynamicPressureActive={navigationActive && reroutePreviewVisible}
        forecastSlotIndex={forecastSlotIndex}
      />

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
          quietFinderOpen={quietFinderOpen}
          quietSpaceDestination={quietSpaceDestination}
        />
      ) : null}

      {navigationActive ? (
        <QuietSpaceFinderOverlay
          active={quietFinderOpen}
          selectedSpaceId={selectedQuietSpaceId}
          onSelect={onQuietSpaceSelect}
          onConfirm={onQuietSpaceConfirm}
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
