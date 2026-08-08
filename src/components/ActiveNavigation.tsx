import { Clock3, Footprints, MapPin, Navigation, X } from 'lucide-react'

import type { QuietRoute } from '../lib/quietRoute'

function formatDistance(distanceMeters: number) {
  return distanceMeters < 1_000
    ? `${Math.round(distanceMeters)} m`
    : `${(distanceMeters / 1_000).toFixed(1)} km`
}

export function ActiveNavigation({
  route,
  onEnd,
}: {
  route: QuietRoute
  onEnd: () => void
}) {
  const firstStep = route.steps[0]

  return (
    <aside className="active-navigation" aria-label="Walking navigation">
      <header>
        <span><Navigation aria-hidden="true" /></span>
        <div>
          <small>Walking to</small>
          <strong>{route.destination.label}</strong>
        </div>
        <button type="button" aria-label="End navigation" onClick={onEnd}>
          <X aria-hidden="true" />
        </button>
      </header>
      {firstStep ? (
        <div className="active-navigation__next">
          <MapPin aria-hidden="true" />
          <p><small>Next</small><strong>{firstStep.instruction}</strong></p>
          <span>{formatDistance(firstStep.distanceMeters)}</span>
        </div>
      ) : null}
      <footer>
        <span><Clock3 aria-hidden="true" />{Math.round(route.durationMinutes)} min</span>
        <span><Footprints aria-hidden="true" />{formatDistance(route.distanceMeters)}</span>
        <button type="button" onClick={onEnd}>End navigation</button>
      </footer>
    </aside>
  )
}
