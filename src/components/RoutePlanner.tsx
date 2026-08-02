import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import {
  ChevronRight,
  CircleAlert,
  Clock3,
  Library,
  MapPin,
  Navigation,
  ShieldCheck,
  Trees,
  X,
} from 'lucide-react'
import {
  DEMO_ROUTE_ORIGIN,
  DEMO_ROUTES,
  type DemoRoute,
  type DemoRouteId,
} from '../data/demoRoutes'

type RoutePlannerProps = {
  destination: string
  selectedRouteId: DemoRouteId
  onRouteSelect: (routeId: DemoRouteId) => void
  onClose: () => void
  onStartNavigation: () => void
  onSheetStateChange: (state: RouteSheetState) => void
}

export type RouteSheetState = 'collapsed' | 'medium' | 'expanded'

type PressureScaleProps = {
  score: number
}

function PressureScale({ score }: PressureScaleProps) {
  return (
    <div className="route-pressure-scale" aria-label={`Sensory pressure score ${score} out of 100`}>
      <span className="route-pressure-scale__gradient" aria-hidden="true" />
      <span
        className="route-pressure-scale__marker"
        style={{ '--pressure-position': `${score}%` } as CSSProperties}
        aria-hidden="true"
      />
    </div>
  )
}

function RouteOption({
  route,
  selected,
  onSelect,
}: {
  route: DemoRoute
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      className={`route-option route-option--${route.id}${selected ? ' route-option--selected' : ''}`}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <span className="route-option__rank" aria-hidden="true">
        {route.rank}
      </span>
      <span className="route-option__content">
        <span className="route-option__heading">
          <strong>{route.label}</strong>
        </span>
        <span className="route-option__summary">{route.summary}</span>
        <span className="route-option__metrics">
          <span><Clock3 aria-hidden="true" />{route.durationMinutes} min</span>
          <span><MapPin aria-hidden="true" />{route.distanceKm} km</span>
        </span>
        <span className="route-option__pressure">
          <PressureScale score={route.sensoryScore} />
          <span>{route.sensoryLabel}</span>
        </span>
      </span>
      <ChevronRight className="route-option__chevron" aria-hidden="true" />
    </button>
  )
}

function RouteDetails({
  route,
  onStartNavigation,
}: {
  route: DemoRoute
  onStartNavigation: () => void
}) {
  return (
    <div className="route-details">
      <div className="route-details__summary">
        <div>
          <span className="route-details__eyebrow">Selected route</span>
          <h3>{route.label}</h3>
        </div>
        <span className="route-details__score">
          <ShieldCheck aria-hidden="true" />
          {route.combinedScore}
          <small>route score</small>
        </span>
      </div>

      <div className="route-details__metrics" aria-label="Route metrics">
        <span><Clock3 aria-hidden="true" /><strong>{route.durationMinutes}</strong> min</span>
        <span><MapPin aria-hidden="true" /><strong>{route.distanceKm}</strong> km</span>
        <span className={`route-details__level route-details__level--${route.id}`}>
          {route.sensoryLabel}
        </span>
      </div>

      <section className="route-details__section">
        <div className="route-details__section-heading">
          <h4>Pressure overview</h4>
          <span>{route.sensoryScore}/100</span>
        </div>
        <PressureScale score={route.sensoryScore} />
        <p>The score estimates crowds, traffic, noise and activity along the whole route.</p>
      </section>

      <section className="route-details__section">
        <h4>High-pressure areas</h4>
        <ul className="route-details__list">
          {route.pressureAreas.map((area) => (
            <li key={area.name}>
              <CircleAlert aria-hidden="true" />
              <span><strong>{area.name}</strong><small>{area.note}</small></span>
              <em>{area.exposure}</em>
            </li>
          ))}
        </ul>
      </section>

      <section className="route-details__section">
        <h4>Calm places along the way</h4>
        <ul className="route-details__list route-details__list--calm">
          {route.calmPlaces.map((place) => {
            const Icon = place.type === 'park' ? Trees : Library
            return (
              <li key={place.name}>
                <Icon aria-hidden="true" />
                <span><strong>{place.name}</strong><small>{place.tags.join(' · ')}</small></span>
              </li>
            )
          })}
        </ul>
      </section>

      <button type="button" className="route-details__start" onClick={onStartNavigation}>
        <Navigation aria-hidden="true" />
        Start navigation
      </button>
    </div>
  )
}

export function RoutePlanner({
  destination,
  selectedRouteId,
  onRouteSelect,
  onClose,
  onStartNavigation,
  onSheetStateChange,
}: RoutePlannerProps) {
  const mobileDetailsRef = useRef<HTMLDivElement>(null)
  const dragStartRef = useRef({ y: 0, height: 0 })
  const dragMovedRef = useRef(false)
  const dragHeightRef = useRef<number | null>(null)
  const [sheetState, setSheetState] = useState<RouteSheetState>('medium')
  const [dragHeight, setDragHeight] = useState<number | null>(null)
  const selectedRoute =
    DEMO_ROUTES.find((route) => route.id === selectedRouteId) ?? DEMO_ROUTES[0]

  useEffect(() => {
    onSheetStateChange(sheetState)
  }, [onSheetStateChange, sheetState])

  function getSnapHeights() {
    const viewportHeight = window.innerHeight
    return {
      collapsed: 132,
      medium: Math.min(380, Math.max(300, viewportHeight * 0.42)),
      expanded: Math.min(720, viewportHeight - 128),
    }
  }

  function handleDragStart(event: PointerEvent<HTMLButtonElement>) {
    if (!window.matchMedia('(max-width: 767px)').matches) return
    const panel = event.currentTarget.closest('.route-planner-panel')
    if (!(panel instanceof HTMLElement)) return
    dragMovedRef.current = false
    dragStartRef.current = { y: event.clientY, height: panel.getBoundingClientRect().height }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function handleDragMove(event: PointerEvent<HTMLButtonElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    const distance = dragStartRef.current.y - event.clientY
    if (Math.abs(distance) > 5) dragMovedRef.current = true
    const heights = getSnapHeights()
    const nextHeight = Math.min(heights.expanded, Math.max(heights.collapsed, dragStartRef.current.height + distance))
    dragHeightRef.current = nextHeight
    setDragHeight(nextHeight)
  }

  function handleDragEnd(event: PointerEvent<HTMLButtonElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    event.currentTarget.releasePointerCapture(event.pointerId)
    const height = dragHeightRef.current ?? dragStartRef.current.height
    const heights = getSnapHeights()
    const nearest = (Object.entries(heights) as [RouteSheetState, number][]).reduce(
      (best, candidate) => Math.abs(candidate[1] - height) < Math.abs(best[1] - height) ? candidate : best,
    )[0]
    setSheetState(nearest)
    dragHeightRef.current = null
    setDragHeight(null)
  }

  function cycleSheetState() {
    if (dragMovedRef.current) {
      dragMovedRef.current = false
      return
    }
    setSheetState((state) => state === 'collapsed' ? 'medium' : 'collapsed')
  }

  function selectRoute(routeId: DemoRouteId) {
    onRouteSelect(routeId)
    if (!window.matchMedia('(max-width: 767px)').matches) return
  }

  return (
    <>
      <aside
        className={`route-planner-panel route-planner-panel--${sheetState}${dragHeight !== null ? ' route-planner-panel--dragging' : ''}`}
        style={dragHeight !== null ? { height: `${dragHeight}px` } : undefined}
        aria-label="Route options"
      >
        <button
          type="button"
          className="route-sheet-handle"
          aria-label={`${sheetState === 'collapsed' ? 'Expand' : 'Resize'} route options`}
          aria-expanded={sheetState !== 'collapsed'}
          onClick={cycleSheetState}
          onPointerDown={handleDragStart}
          onPointerMove={handleDragMove}
          onPointerUp={handleDragEnd}
          onPointerCancel={handleDragEnd}
        >
          <span aria-hidden="true" />
        </button>

        <button
          type="button"
          className="route-sheet-summary"
          aria-label={`Show route options. Selected: ${selectedRoute.label}, ${selectedRoute.durationMinutes} minutes, ${selectedRoute.distanceKm} kilometres`}
          onClick={() => setSheetState('medium')}
        >
          <span><strong>{selectedRoute.label}</strong><small>Selected route</small></span>
          <span><strong>{selectedRoute.durationMinutes} min</strong><small>{selectedRoute.distanceKm} km · Pressure {selectedRoute.sensoryScore}</small></span>
          <ChevronRight aria-hidden="true" />
        </button>

        <header className="route-planner-panel__header">
          <div>
            <span>Demo route plan</span>
            <h2>Choose a calmer route</h2>
          </div>
          <button type="button" aria-label="Close route planning" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </header>

        <div className="route-planner-panel__scroll">

        <div className="route-endpoints" aria-label="Journey endpoints">
          <span className="route-endpoints__line" aria-hidden="true" />
          <div><span aria-hidden="true" /> <p><small>From</small>{DEMO_ROUTE_ORIGIN}</p></div>
          <div><MapPin aria-hidden="true" /> <p><small>To</small>{destination}</p></div>
        </div>

        <div className="route-planner-panel__intro">
          <div>
            <h3>Route options</h3>
            <p>Ranked by sensory pressure, travel time and distance.</p>
          </div>
          <button
            type="button"
            className={sheetState === 'expanded' ? 'route-planner-panel__expand route-planner-panel__expand--active' : 'route-planner-panel__expand'}
            onClick={() => setSheetState((state) => state === 'expanded' ? 'medium' : 'expanded')}
          >
            <ChevronRight aria-hidden="true" />
            {sheetState === 'expanded' ? 'Compact view' : 'Expand details'}
          </button>
        </div>

        <div className="route-options">
          {DEMO_ROUTES.map((route) => (
            <RouteOption
              key={route.id}
              route={route}
              selected={route.id === selectedRouteId}
              onSelect={() => selectRoute(route.id)}
            />
          ))}
        </div>

        <div ref={mobileDetailsRef} className="route-panel-details">
          <RouteDetails route={selectedRoute} onStartNavigation={onStartNavigation} />
        </div>

        <p className="route-planner-panel__note">
          Demo estimates only. Route data is not live.
        </p>
        </div>
      </aside>

      <section className="route-detail-popover" aria-live="polite" aria-label="Selected route details">
        <span className="route-detail-popover__pointer" aria-hidden="true" />
        <RouteDetails route={selectedRoute} onStartNavigation={onStartNavigation} />
      </section>
    </>
  )
}
