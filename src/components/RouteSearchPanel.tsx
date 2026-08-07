import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  CircleDot,
  LocateFixed,
  LoaderCircle,
  MapPin,
  Navigation,
  Search,
  X,
} from 'lucide-react'

import type { PlaceSelection, RouteCoordinate } from '../lib/quietRoute'

type RouteSearchPanelProps = {
  mapsReady: boolean
  userPosition: RouteCoordinate | null
  locating: boolean
  planning: boolean
  onRequestLocation: () => void
  onPlan: (origin: PlaceSelection, destination: PlaceSelection) => void
}

type PlaceFieldProps = {
  id: string
  label: string
  placeholder: string
  value: string
  mapsReady: boolean
  locationBias: RouteCoordinate | null
  icon: 'origin' | 'destination'
  onValueChange: (value: string) => void
  onPlaceChange: (place: PlaceSelection | null) => void
}

function PlaceField({
  id,
  label,
  placeholder,
  value,
  mapsReady,
  locationBias,
  icon,
  onValueChange,
  onPlaceChange,
}: PlaceFieldProps) {
  const [suggestions, setSuggestions] = useState<google.maps.places.PlacePrediction[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const requestSequence = useRef(0)
  const sessionToken = useRef<google.maps.places.AutocompleteSessionToken | null>(null)

  useEffect(() => {
    const input = value.trim()
    if (!mapsReady || input.length < 2) {
      return
    }

    const requestId = requestSequence.current + 1
    requestSequence.current = requestId
    const timer = window.setTimeout(() => {
      setLoading(true)
      void google.maps.importLibrary('places').then(async ({
        AutocompleteSessionToken,
        AutocompleteSuggestion,
      }) => {
        sessionToken.current ??= new AutocompleteSessionToken()
        const { suggestions: nextSuggestions } =
          await AutocompleteSuggestion.fetchAutocompleteSuggestions({
            input,
            includedRegionCodes: ['au'],
            language: 'en-AU',
            region: 'au',
            sessionToken: sessionToken.current,
            origin: locationBias ?? undefined,
            locationBias: locationBias
              ? { center: locationBias, radius: 50_000 }
              : { center: { lat: -37.8136, lng: 144.9631 }, radius: 50_000 },
          })
        if (requestSequence.current !== requestId) return
        setSuggestions(
          nextSuggestions.flatMap((suggestion) =>
            suggestion.placePrediction ? [suggestion.placePrediction] : [],
          ).slice(0, 5),
        )
        setLoading(false)
      }).catch(() => {
        if (requestSequence.current !== requestId) return
        setSuggestions([])
        setLoading(false)
      })
    }, 260)

    return () => window.clearTimeout(timer)
  }, [locationBias, mapsReady, value])

  async function selectPrediction(prediction: google.maps.places.PlacePrediction) {
    const place = prediction.toPlace()
    await place.fetchFields({
      fields: ['id', 'displayName', 'formattedAddress', 'location'],
    })
    if (!place.location) return
    const label = place.displayName || prediction.mainText?.toString() || prediction.text.toString()
    const address = place.formattedAddress || prediction.secondaryText?.toString() || label
    onValueChange(label)
    onPlaceChange({
      placeId: place.id,
      label,
      address,
      location: place.location.toJSON(),
      source: 'google-place',
    })
    setOpen(false)
    setSuggestions([])
    sessionToken.current = null
  }

  return (
    <div className="route-place-field">
      <label htmlFor={id}>{label}</label>
      <div className="route-place-field__control">
        {icon === 'origin'
          ? <CircleDot aria-hidden="true" />
          : <MapPin aria-hidden="true" />}
        <input
          id={id}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open && suggestions.length > 0}
          aria-controls={`${id}-suggestions`}
          autoComplete="off"
          value={value}
          placeholder={placeholder}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            const nextValue = event.target.value
            onValueChange(nextValue)
            onPlaceChange(null)
            setOpen(true)
            if (nextValue.trim().length < 2) {
              setSuggestions([])
              setLoading(false)
            }
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setOpen(false)
          }}
        />
        {loading ? <LoaderCircle className="route-place-field__loader" aria-label="Finding places" /> : null}
      </div>
      {open && value.trim().length >= 2 && suggestions.length > 0 ? (
        <ul id={`${id}-suggestions`} className="route-place-suggestions" role="listbox">
          {suggestions.map((suggestion) => (
            <li key={suggestion.placeId} role="option" aria-selected="false">
              <button type="button" onClick={() => void selectPrediction(suggestion)}>
                <MapPin aria-hidden="true" />
                <span>
                  <strong>{suggestion.mainText?.toString() || suggestion.text.toString()}</strong>
                  {suggestion.secondaryText ? <small>{suggestion.secondaryText.toString()}</small> : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

export function RouteSearchPanel({
  mapsReady,
  userPosition,
  locating,
  planning,
  onRequestLocation,
  onPlan,
}: RouteSearchPanelProps) {
  const [expanded, setExpanded] = useState(false)
  const [useCurrentLocation, setUseCurrentLocation] = useState(true)
  const [originQuery, setOriginQuery] = useState('')
  const [destinationQuery, setDestinationQuery] = useState('')
  const [originPlace, setOriginPlace] = useState<PlaceSelection | null>(null)
  const [destinationPlace, setDestinationPlace] = useState<PlaceSelection | null>(null)

  const currentOrigin: PlaceSelection | null = userPosition
    ? {
        placeId: null,
        label: 'Your location',
        address: 'Current device location',
        location: userPosition,
        source: 'current-location',
      }
    : null
  const selectedOrigin = useCurrentLocation ? currentOrigin : originPlace

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedOrigin || !destinationPlace || planning) return
    setExpanded(false)
    onPlan(selectedOrigin, destinationPlace)
  }

  return (
    <form
      className={`route-search-panel${expanded ? ' route-search-panel--expanded' : ''}`}
      role="search"
      aria-label="Plan a quiet walking route"
      onSubmit={submit}
      onClick={() => setExpanded(true)}
    >
      <div className="route-search-panel__collapsed">
        <Search aria-hidden="true" />
        <span>{destinationPlace?.label || destinationQuery || 'Where do you want to go?'}</span>
        <Navigation aria-hidden="true" />
      </div>

      <div className="route-search-panel__expanded-content">
        <header>
          <div>
            <strong>Plan a quiet walk</strong>
            <span>Live and predicted pedestrian activity</span>
          </div>
          <button
            type="button"
            aria-label="Close route search"
            onClick={(event) => {
              event.stopPropagation()
              setExpanded(false)
            }}
          >
            <X aria-hidden="true" />
          </button>
        </header>

        <div className="route-search-panel__fields">
          <span className="route-search-panel__connector" aria-hidden="true" />
          {useCurrentLocation ? (
            <div className="route-current-location">
              <span>Start</span>
              <button
                type="button"
                onClick={() => {
                  if (!userPosition) onRequestLocation()
                }}
              >
                <LocateFixed aria-hidden="true" />
                <span>
                  <strong>{locating ? 'Finding your location…' : 'Your location'}</strong>
                  <small>{userPosition ? 'Location ready' : 'Allow access or enter a start point'}</small>
                </span>
              </button>
              <button
                type="button"
                className="route-current-location__manual"
                onClick={() => setUseCurrentLocation(false)}
              >
                Enter manually
              </button>
            </div>
          ) : (
            <div className="route-manual-origin">
              <PlaceField
                id="route-origin"
                label="Start"
                placeholder="Enter a starting point"
                value={originQuery}
                mapsReady={mapsReady}
                locationBias={userPosition}
                icon="origin"
                onValueChange={setOriginQuery}
                onPlaceChange={setOriginPlace}
              />
              <button
                type="button"
                disabled={!userPosition && locating}
                onClick={() => {
                  setUseCurrentLocation(true)
                  if (!userPosition) onRequestLocation()
                }}
              >
                <LocateFixed aria-hidden="true" />
                Use your location
              </button>
            </div>
          )}

          <PlaceField
            id="route-destination"
            label="Destination"
            placeholder="Search for a place"
            value={destinationQuery}
            mapsReady={mapsReady}
            locationBias={selectedOrigin?.location ?? userPosition}
            icon="destination"
            onValueChange={setDestinationQuery}
            onPlaceChange={setDestinationPlace}
          />
        </div>

        <button
          type="submit"
          className="route-search-panel__submit"
          disabled={!selectedOrigin || !destinationPlace || planning}
        >
          {planning ? <LoaderCircle aria-hidden="true" /> : <Navigation aria-hidden="true" />}
          {planning ? 'Finding the quietest route…' : 'Find quiet route'}
        </button>
      </div>
    </form>
  )
}
