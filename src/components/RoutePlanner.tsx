import { useEffect, useRef, useState, type PointerEvent } from 'react'
import {
  ChevronRight,
  Clock3,
  Footprints,
  Gauge,
  MapPin,
  Navigation,
  ShieldCheck,
  UsersRound,
  X,
} from 'lucide-react'

import type { QuietRoute } from '../lib/quietRoute'

type RoutePlannerProps = {
  route: QuietRoute
  routes: QuietRoute[]
  onClose: () => void
  onSelectRoute: (routeId: string) => void
  onStartNavigation: () => void
  onSheetStateChange: (state: RouteSheetState) => void
}

export type RouteSheetState = 'collapsed' | 'medium' | 'expanded'

function formatDistance(distanceMeters: number) {
  if (distanceMeters < 1_000) return `${Math.round(distanceMeters)} m`
  return `${(distanceMeters / 1_000).toFixed(1)} km`
}

function crowdLabel(level: QuietRoute['score']['crowdLevel']) {
  if (level === 'low') return 'Low pedestrian activity'
  if (level === 'medium') return 'Moderate pedestrian activity'
  return 'High pedestrian activity'
}

function overallScore(route: QuietRoute) {
  return Math.max(0, Math.round((1 - route.score.combinedCost) * 100))
}

function RouteChoices({
  routes,
  selectedRouteId,
  onSelectRoute,
}: {
  routes: QuietRoute[]
  selectedRouteId: string
  onSelectRoute: (routeId: string) => void
}) {
  if (routes.length < 2) return null

  return (
    <section className="route-choices" aria-label="Route options">
      <div className="route-details__section-heading">
        <h3>Choose a route</h3>
        <span>Ranked by overall score</span>
      </div>
      <div className="route-choices__list" role="radiogroup" aria-label="Available walking routes">
        {routes.map((candidate) => {
          const selected = candidate.id === selectedRouteId
          return (
            <button
              key={candidate.id}
              type="button"
              className={`route-choice${selected ? ' route-choice--selected' : ''}`}
              role="radio"
              aria-checked={selected}
              onClick={() => onSelectRoute(candidate.id)}
            >
              <span className="route-choice__rank">{candidate.priority}</span>
              <span className="route-choice__main">
                <strong>{candidate.priority === 1 ? 'Recommended' : `Alternative ${candidate.priority}`}</strong>
                <small>{Math.round(candidate.durationMinutes)} min · {formatDistance(candidate.distanceMeters)} · {crowdLabel(candidate.score.crowdLevel)}</small>
              </span>
              <span className="route-choice__score"><strong>{overallScore(candidate)}</strong><small>score</small></span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

function RouteDetails({
  route,
  onStartNavigation,
}: {
  route: QuietRoute
  onStartNavigation: () => void
}) {
  const confidencePercent = Math.round(route.score.coverageConfidence * 100)
  const nearbyQuietRoute = route.planType === 'nearest-quiet'

  return (
    <div className="route-details route-details--live">
      <div className="route-details__summary">
        <div>
          <span className="route-details__eyebrow">
            {nearbyQuietRoute ? 'Nearest low-activity area' : `Priority ${route.priority} of ${route.candidateCount}`}
          </span>
          <h3>{nearbyQuietRoute ? 'Fastest nearby quiet walk' : route.priority === 1 ? 'Recommended quiet walk' : `Alternative route ${route.priority}`}</h3>
        </div>
        <span className="route-details__score">
          {nearbyQuietRoute ? <UsersRound aria-hidden="true" /> : <ShieldCheck aria-hidden="true" />}
          {nearbyQuietRoute ? route.score.averageCrowdPpm : overallScore(route)}
          <small>{nearbyQuietRoute ? 'pedestrians/min nearby' : 'overall score'}</small>
        </span>
      </div>

      <div className="route-details__metrics" aria-label="Route metrics">
        <span><Clock3 aria-hidden="true" /><strong>{Math.round(route.durationMinutes)}</strong> min</span>
        <span><Footprints aria-hidden="true" /><strong>{formatDistance(route.distanceMeters)}</strong></span>
        <span className={`route-details__level route-details__level--${route.score.crowdLevel}`}>
          {crowdLabel(route.score.crowdLevel)}
        </span>
      </div>

      <section className="route-details__section route-details__recommendation">
        <div className="route-details__section-heading">
          <h4>Why this route</h4>
          <span>{confidencePercent}% coverage</span>
        </div>
        <p>
          {nearbyQuietRoute
            ? 'Google Maps selected its fastest walking route to the nearest currently low-activity sensor area.'
            : route.score.extraMinutesComparedWithFastest > 0
            ? `${route.score.extraMinutesComparedWithFastest} minutes longer than the fastest option, with lower predicted crowd exposure.`
            : 'This is both the fastest eligible route and the best match for current crowd conditions.'}
        </p>
        <div className="route-details__crowd-facts">
          <span><UsersRound aria-hidden="true" /><strong>{route.score.averageCrowdPpm}</strong><small>average pedestrians/min</small></span>
          <span><Gauge aria-hidden="true" /><strong>{route.score.maximumCrowdPpm}</strong><small>peak pedestrians/min</small></span>
        </div>
      </section>

      <section className="route-details__section">
        <div className="route-details__section-heading">
          <h4>Walking directions</h4>
          <span>{route.steps.length} steps</span>
        </div>
        <ol className="route-directions-preview">
          {route.steps.slice(0, 4).map((step, index) => (
            <li key={`${step.instruction}:${index}`}>
              <span>{index + 1}</span>
              <p><strong>{step.instruction}</strong><small>{formatDistance(step.distanceMeters)}</small></p>
            </li>
          ))}
        </ol>
      </section>

      <p className="route-details__coverage-note">
        Crowd estimates combine current readings with the six-hour Supabase forecast.
      </p>

      <button type="button" className="route-details__start" onClick={onStartNavigation}>
        <Navigation aria-hidden="true" />
        Start navigation
      </button>
    </div>
  )
}

export function RoutePlanner({
  route,
  routes,
  onClose,
  onSelectRoute,
  onStartNavigation,
  onSheetStateChange,
}: RoutePlannerProps) {
  const dragStartRef = useRef({ y: 0, height: 0 })
  const dragMovedRef = useRef(false)
  const dragHeightRef = useRef<number | null>(null)
  const [sheetState, setSheetState] = useState<RouteSheetState>('medium')
  const [dragHeight, setDragHeight] = useState<number | null>(null)

  useEffect(() => {
    onSheetStateChange(sheetState)
  }, [onSheetStateChange, sheetState])

  function getSnapHeights() {
    const viewportHeight = window.innerHeight
    return {
      collapsed: 132,
      medium: Math.min(410, Math.max(320, viewportHeight * 0.45)),
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
    const nextHeight = Math.min(
      heights.expanded,
      Math.max(heights.collapsed, dragStartRef.current.height + distance),
    )
    dragHeightRef.current = nextHeight
    setDragHeight(nextHeight)
  }

  function handleDragEnd(event: PointerEvent<HTMLButtonElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    event.currentTarget.releasePointerCapture(event.pointerId)
    const height = dragHeightRef.current ?? dragStartRef.current.height
    const heights = getSnapHeights()
    const nearest = (Object.entries(heights) as [RouteSheetState, number][]).reduce(
      (best, candidate) =>
        Math.abs(candidate[1] - height) < Math.abs(best[1] - height) ? candidate : best,
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

  return (
    <>
      <aside
        className={`route-planner-panel route-planner-panel--${sheetState}${dragHeight !== null ? ' route-planner-panel--dragging' : ''}`}
        style={dragHeight !== null ? { height: `${dragHeight}px` } : undefined}
        aria-label="Recommended quiet route"
      >
        <button
          type="button"
          className="route-sheet-handle"
          aria-label={`${sheetState === 'collapsed' ? 'Expand' : 'Resize'} route details`}
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
          aria-label="Show recommended route details"
          onClick={() => setSheetState('medium')}
        >
          <span><strong>{route.planType === 'nearest-quiet' ? 'Nearby quiet walk' : route.priority === 1 ? 'Recommended quiet walk' : `Alternative route ${route.priority}`}</strong><small>{route.planType === 'nearest-quiet' ? 'Fastest route to a low-activity area' : `Priority ${route.priority} of ${route.candidateCount}`}</small></span>
          <span><strong>{Math.round(route.durationMinutes)} min</strong><small>{formatDistance(route.distanceMeters)} · {crowdLabel(route.score.crowdLevel)}</small></span>
          <ChevronRight aria-hidden="true" />
        </button>

        <header className="route-planner-panel__header">
          <div>
            <span>Live route plan</span>
            <h2>{route.planType === 'nearest-quiet' ? 'Nearest quiet place' : 'Your quietest practical route'}</h2>
          </div>
          <button type="button" aria-label="Close route planning" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </header>

        <div className="route-planner-panel__scroll">
          <div className="route-endpoints" aria-label="Journey endpoints">
            <span className="route-endpoints__line" aria-hidden="true" />
            <div><span aria-hidden="true" /><p><small>From</small>{route.origin.label}</p></div>
            <div><MapPin aria-hidden="true" /><p><small>To</small>{route.destination.label}</p></div>
          </div>
          <div className="route-panel-details">
            <RouteChoices
              routes={routes}
              selectedRouteId={route.id}
              onSelectRoute={onSelectRoute}
            />
            <RouteDetails route={route} onStartNavigation={onStartNavigation} />
          </div>
        </div>
      </aside>

      <section className="route-detail-popover" aria-live="polite" aria-label="Recommended route details">
        <span className="route-detail-popover__pointer" aria-hidden="true" />
        <RouteChoices
          routes={routes}
          selectedRouteId={route.id}
          onSelectRoute={onSelectRoute}
        />
        <RouteDetails route={route} onStartNavigation={onStartNavigation} />
      </section>
    </>
  )
}
