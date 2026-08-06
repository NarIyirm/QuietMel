import { useEffect, useRef, useState, type CSSProperties } from 'react'
import {
  ArrowUpRight,
  Clock3,
  MapPin,
  Navigation,
  Octagon,
  ShieldCheck,
  TriangleAlert,
  Volume2,
  VolumeX,
} from 'lucide-react'
import {
  DEMO_REROUTE,
  DEMO_ROUTES,
  type NavigationRouteId,
} from '../data/demoRoutes'

type NavigationDemoProps = {
  routeId: NavigationRouteId
  reroutePromptVisible: boolean
  onSwitchRoute: () => void
  onKeepRoute: () => void
  onEndNavigation: () => void
}

export function NavigationDemo({
  routeId,
  reroutePromptVisible,
  onSwitchRoute,
  onKeepRoute,
  onEndNavigation,
}: NavigationDemoProps) {
  const [guidanceMuted, setGuidanceMuted] = useState(false)
  const dialogRef = useRef<HTMLElement>(null)
  const route = routeId === 'reroute'
    ? DEMO_REROUTE
    : DEMO_ROUTES.find((candidate) => candidate.id === routeId) ?? DEMO_ROUTES[0]
  const rerouted = routeId === 'reroute'

  useEffect(() => {
    if (reroutePromptVisible) dialogRef.current?.focus()
  }, [reroutePromptVisible])

  return (
    <>
      {!reroutePromptVisible ? (
        <>
          <section className="navigation-instruction" aria-live="polite" aria-label="Next navigation instruction">
            <span className="navigation-instruction__turn" aria-hidden="true">
              <ArrowUpRight />
            </span>
            <div>
              <span>{rerouted ? '180 m' : '120 m'}</span>
              <h2>{rerouted ? 'Continue onto Rathdowne Street' : 'Turn right onto Exhibition Street'}</h2>
              <p>{rerouted ? 'Stay on the quieter eastern side' : 'Then continue for 600 m'}</p>
            </div>
            <button
              type="button"
              aria-label={guidanceMuted ? 'Unmute navigation guidance' : 'Mute navigation guidance'}
              aria-pressed={guidanceMuted}
              onClick={() => setGuidanceMuted((muted) => !muted)}
            >
              {guidanceMuted ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
            </button>
          </section>

          <section className="navigation-trip-bar" aria-label="Current trip summary">
            <div className="navigation-trip-bar__eta">
              <strong>{rerouted ? '10:45' : '10:42'}</strong>
              <span>arrival</span>
            </div>
            <div className="navigation-trip-bar__metrics">
              <span><Clock3 aria-hidden="true" /><strong>{route.durationMinutes}</strong> min</span>
              <span><MapPin aria-hidden="true" /><strong>{route.distanceKm} km</strong></span>
              <span><ShieldCheck aria-hidden="true" />Pressure {route.sensoryScore}/100</span>
            </div>
            <button type="button" className="navigation-trip-bar__end" onClick={onEndNavigation}>
              <Octagon aria-hidden="true" />
              End navigation
            </button>
          </section>
        </>
      ) : null}

      {reroutePromptVisible ? (
        <div className="reroute-dialog-backdrop">
          <section
            ref={dialogRef}
            className="reroute-dialog"
            role="dialog"
            tabIndex={-1}
            aria-labelledby="reroute-dialog-title"
            aria-describedby="reroute-dialog-description"
          >
            <header className="reroute-dialog__header">
              <span aria-hidden="true"><TriangleAlert /></span>
              <div>
                <small>Navigation paused · Live sensory update</small>
                <h2 id="reroute-dialog-title">Swanston Street is getting crowded</h2>
              </div>
            </header>

            <p id="reroute-dialog-description">
              Foot traffic and noise are rising ahead. A calmer route is available.
            </p>

            <div className="reroute-dialog__routes" aria-label="Current and proposed routes">
              <article className="reroute-route-option reroute-route-option--current">
                <div className="reroute-route-option__heading">
                  <span>Current route</span>
                  <strong>{route.label}</strong>
                </div>
                <div className="reroute-route-option__metrics">
                  <span><Clock3 aria-hidden="true" />{route.durationMinutes} min</span>
                  <span><MapPin aria-hidden="true" />{route.distanceKm} km</span>
                </div>
                <div className="reroute-route-option__pressure">
                  <span className="reroute-pressure-scale" aria-label={`Pressure ${route.sensoryScore} out of 100`}>
                    <i
                      style={{ '--reroute-pressure': `${route.sensoryScore}%` } as CSSProperties}
                      aria-hidden="true"
                    />
                  </span>
                  <strong>Pressure {route.sensoryScore}/100</strong>
                </div>
                <p><TriangleAlert aria-hidden="true" />Swanston Street · High pressure now</p>
              </article>

              <article className="reroute-route-option reroute-route-option--recommended">
                <div className="reroute-route-option__heading">
                  <span>Recommended change</span>
                  <strong>Calmer reroute</strong>
                  <em>Recommended</em>
                </div>
                <div className="reroute-route-option__metrics">
                  <span><Clock3 aria-hidden="true" />{DEMO_REROUTE.durationMinutes} min</span>
                  <span><MapPin aria-hidden="true" />{DEMO_REROUTE.distanceKm} km</span>
                </div>
                <div className="reroute-route-option__pressure">
                  <span className="reroute-pressure-scale" aria-label="Pressure 19 out of 100">
                    <i style={{ '--reroute-pressure': '19%' } as CSSProperties} aria-hidden="true" />
                  </span>
                  <strong>Pressure 19/100</strong>
                </div>
                <p><ShieldCheck aria-hidden="true" />Avoids Swanston Street · +3 min</p>
                <small>Calm places: Carlton Gardens · Treasury Gardens</small>
              </article>
            </div>

            <p className="reroute-dialog__map-note">
              <Navigation aria-hidden="true" />
              The proposed route is previewed on the map.
            </p>

            <div className="reroute-dialog__actions">
              <button type="button" className="reroute-dialog__switch" onClick={onSwitchRoute}>
                Switch route
              </button>
              <button type="button" className="reroute-dialog__keep" onClick={onKeepRoute}>
                Keep current route
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  )
}
