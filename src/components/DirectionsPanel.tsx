import { useEffect, useRef, useState } from 'react'
import { Crosshair, MapPin, MapPinned, Navigation, X } from 'lucide-react'
import type { RouteQuietnessResult } from '../lib/routeQuietness'

// A resolved endpoint: a label to show in the UI + the actual coordinates.
export type DirectionsPoint = {
  label: string
  location: google.maps.LatLngLiteral
}

// Which endpoint the user is currently placing by tapping the map.
export type PickTarget = 'origin' | 'destination' | null

type DirectionsPanelProps = {
  origin: DirectionsPoint | null
  destination: DirectionsPoint | null
  pickTarget: PickTarget
  routeSummary: { distance: string; duration: string } | null
  calculating: boolean
  onOriginChange: (point: DirectionsPoint | null) => void
  onDestinationChange: (point: DirectionsPoint | null) => void
  onUseMyLocation: () => void
  onPickTargetChange: (target: PickTarget) => void
  onCalculate: () => void
  onClose: () => void
  quietness: RouteQuietnessResult | null
}

// Wraps the new Google PlaceAutocompleteElement (a Web Component).
// We mount it via ref and listen for its "gmp-select" event, then
// fetch the chosen place's coordinates and report them upward.
function AutocompleteField({
  id,
  placeholder,
  valueLabel,
  onResolved,
}: {
  id: string
  placeholder: string
  valueLabel: string | null
  onResolved: (point: DirectionsPoint) => void
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let element: google.maps.places.PlaceAutocompleteElement | null = null
    let cancelled = false

    async function mount() {
      // Load the Places library and create the autocomplete element.
      const { PlaceAutocompleteElement } = await google.maps.importLibrary(
        'places',
      ) as google.maps.PlacesLibrary
      if (cancelled || !hostRef.current) return

      element = new PlaceAutocompleteElement({
        // Bias results toward Melbourne so local searches rank first.
        locationBias: {
          center: { lat: -37.8136, lng: 144.9631 },
          radius: 12_000,
        },
      })
      element.id = id
      hostRef.current.appendChild(element)
      setReady(true)

      // Fired when the user picks a suggestion from the dropdown.
      element.addEventListener('gmp-select', async (event) => {
        const prediction = (event as unknown as {
          placePrediction: google.maps.places.PlacePrediction
        }).placePrediction
        const place = prediction.toPlace()
        await place.fetchFields({ fields: ['displayName', 'formattedAddress', 'location'] })
        if (!place.location) return
        onResolved({
          label: place.displayName ?? place.formattedAddress ?? 'Selected place',
          location: { lat: place.location.lat(), lng: place.location.lng() },
        })
      })
    }

    void mount()

    return () => {
      cancelled = true
      element?.remove()
    }
    // Mount once; onResolved is stable enough for this demo scope.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  return (
    <div className="directions-field">
      <div ref={hostRef} className="directions-field__autocomplete" />
      {!ready ? (
        // Simple fallback text shown until the Google element mounts.
        <span className="directions-field__placeholder">{placeholder}</span>
      ) : null}
      {valueLabel ? (
        <span className="directions-field__value">{valueLabel}</span>
      ) : null}
    </div>
  )
}

export function DirectionsPanel({
  origin,
  destination,
  pickTarget,
  routeSummary,
  calculating,
  quietness,
  onOriginChange,
  onDestinationChange,
  onUseMyLocation,
  onPickTargetChange,
  onCalculate,
  onClose,
}: DirectionsPanelProps) {
  const canCalculate = Boolean(origin && destination) && !calculating

  return (
    <aside className="directions-panel" aria-label="Plan a walking route">
      <header className="directions-panel__header">
        <div>
          <span>Directions</span>
          <h2>Walking route</h2>
        </div>
        <button type="button" aria-label="Close directions" onClick={onClose}>
          <X aria-hidden="true" />
        </button>
      </header>

      {/* ORIGIN */}
      <section className="directions-panel__endpoint">
        <label className="directions-panel__label">
          <span className="directions-panel__dot directions-panel__dot--start" aria-hidden="true" />
          From
        </label>

        {origin ? (
          <div className="directions-panel__resolved">
            <MapPin aria-hidden="true" size={16} />
            <span>{origin.label}</span>
            <button type="button" aria-label="Clear start point" onClick={() => onOriginChange(null)}>
              <X aria-hidden="true" size={15} />
            </button>
          </div>
        ) : (
          <AutocompleteField
            id="directions-origin"
            placeholder="Enter a start point"
            valueLabel={null}
            onResolved={onOriginChange}
          />
        )}

        {/* Three ways to set the origin */}
        <div className="directions-panel__origin-actions">
          <button type="button" onClick={onUseMyLocation}>
            <Crosshair aria-hidden="true" size={15} />
            My location
          </button>
          <button
            type="button"
            className={pickTarget === 'origin' ? 'is-active' : undefined}
            aria-pressed={pickTarget === 'origin'}
            onClick={() => onPickTargetChange(pickTarget === 'origin' ? null : 'origin')}
          >
            <MapPinned aria-hidden="true" size={15} />
            {pickTarget === 'origin' ? 'Tap the map…' : 'Pick on map'}
          </button>
        </div>
      </section>

      {/* DESTINATION */}
      <section className="directions-panel__endpoint">
        <label className="directions-panel__label">
          <span className="directions-panel__dot directions-panel__dot--end" aria-hidden="true" />
          To
        </label>

        {destination ? (
          <div className="directions-panel__resolved">
            <MapPin aria-hidden="true" size={16} />
            <span>{destination.label}</span>
            <button type="button" aria-label="Clear destination" onClick={() => onDestinationChange(null)}>
              <X aria-hidden="true" size={15} />
            </button>
          </div>
        ) : (
          <AutocompleteField
            id="directions-destination"
            placeholder="Enter a destination"
            valueLabel={null}
            onResolved={onDestinationChange}
          />
        )}

        <div className="directions-panel__origin-actions">
          <button
            type="button"
            className={pickTarget === 'destination' ? 'is-active' : undefined}
            aria-pressed={pickTarget === 'destination'}
            onClick={() =>
              onPickTargetChange(pickTarget === 'destination' ? null : 'destination')
            }
          >
            <MapPinned aria-hidden="true" size={15} />
            {pickTarget === 'destination' ? 'Tap the map…' : 'Pick on map'}
          </button>
        </div>
      </section>

      {routeSummary ? (
        <div className="directions-panel__summary">
          <strong>{routeSummary.duration}</strong>
          <span>{routeSummary.distance} walking</span>
        </div>
      ) : null}

      {quietness ? (
        <div className="directions-panel__quietness">
          <div className="directions-panel__quietness-score">
            <strong>{quietness.quietnessScore}</strong>
            <span>/ 100 quietness · {quietness.quietnessLabel}</span>
          </div>
          {quietness.crowdedSegments.length > 0 ? (
            <div className="directions-panel__crowded">
              <span>Passes {quietness.crowdedSegments.length} busy area
                {quietness.crowdedSegments.length > 1 ? 's' : ''}:</span>
              <ul>
                {quietness.crowdedSegments.slice(0, 3).map((segment) => (
                  <li key={segment.sensorId}>
                    {segment.name}
                    <em className={`directions-panel__crowd-tag directions-panel__crowd-tag--${segment.crowdLevel}`}>
                      {segment.crowdLevel}
                    </em>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="directions-panel__quiet-note">No busy areas along this route.</p>
          )}
        </div>
      ) : null}

      <button
        type="button"
        className="directions-panel__go"
        disabled={!canCalculate}
        onClick={onCalculate}
      >
        <Navigation aria-hidden="true" size={17} />
        {calculating ? 'Calculating…' : 'Get walking route'}
      </button>
    </aside>
  )
}

export default DirectionsPanel