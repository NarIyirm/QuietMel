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
  routeReady: boolean
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
  autocompleteEnabled?: boolean
  selectOnFocus?: boolean
  trailingAction?: {
    label: string
    active?: boolean
    disabled?: boolean
    onClick: () => void
  }
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
  autocompleteEnabled = true,
  selectOnFocus = false,
  trailingAction,
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
    if (!autocompleteEnabled || !mapsReady || input.length < 2) {
      requestSequence.current += 1
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
  }, [autocompleteEnabled, locationBias, mapsReady, value])

  async function selectPrediction(prediction: google.maps.places.PlacePrediction) {
    const place = prediction.toPlace()
    await place.fetchFields({
      fields: ['id', 'displayName', 'formattedAddress', 'location'],
    })
    if (!place.location) return
    const placeLabel = place.displayName || prediction.mainText?.toString() || prediction.text.toString()
    const address = place.formattedAddress || prediction.secondaryText?.toString() || placeLabel
    onValueChange(placeLabel)
    onPlaceChange({
      placeId: place.id,
      label: placeLabel,
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
          onFocus={(event) => {
            setOpen(true)
            if (selectOnFocus) event.currentTarget.select()
          }}
          onBlur={(event) => {
            if (!event.currentTarget.closest('.route-place-field')?.contains(event.relatedTarget)) {
              setOpen(false)
            }
          }}
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
        {autocompleteEnabled && loading
          ? <LoaderCircle className="route-place-field__loader" aria-label="Finding places" />
          : null}
        {trailingAction ? (
          <button
            type="button"
            className={`route-place-field__location${trailingAction.active ? ' route-place-field__location--active' : ''}`}
            aria-label={trailingAction.label}
            title={trailingAction.label}
            disabled={trailingAction.disabled}
            onClick={trailingAction.onClick}
          >
            <LocateFixed aria-hidden="true" />
          </button>
        ) : null}
      </div>
      {open && autocompleteEnabled && value.trim().length >= 2 && suggestions.length > 0 ? (
        <ul id={`${id}-suggestions`} className="route-place-suggestions" role="listbox">
          {suggestions.map((suggestion) => (
            <li key={suggestion.placeId} role="option" aria-selected="false">
              <button
                type="button"
                onPointerDown={(event) => {
                  // Safari does not focus buttons on click, so the input's blur
                  // can remove this list before the click event is dispatched.
                  event.preventDefault()
                }}
                onClick={() => void selectPrediction(suggestion)}
              >
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
  routeReady,
  onRequestLocation,
  onPlan,
}: RouteSearchPanelProps) {
  const [expanded, setExpanded] = useState(false)
  const [useCurrentLocation, setUseCurrentLocation] = useState(true)
  const [originQuery, setOriginQuery] = useState('')
  const [destinationQuery, setDestinationQuery] = useState('')
  const [originPlace, setOriginPlace] = useState<PlaceSelection | null>(null)
  const [destinationPlace, setDestinationPlace] = useState<PlaceSelection | null>(null)
  const previousRouteReady = useRef(routeReady)

  useEffect(() => {
    if (routeReady && !previousRouteReady.current) {
      setExpanded(false)
    }
    previousRouteReady.current = routeReady
  }, [routeReady])

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
  const originValue = useCurrentLocation
    ? locating && !userPosition ? 'Finding your location…' : 'Your location'
    : originQuery

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedOrigin || !destinationPlace || planning) return
    onPlan(selectedOrigin, destinationPlace)
  }

  function chooseCurrentLocation() {
    setUseCurrentLocation(true)
    setOriginQuery('')
    setOriginPlace(null)
    if (!userPosition) onRequestLocation()
  }

  return (
    <form
      className={`route-search-panel${expanded ? ' route-search-panel--expanded' : ''}`}
      role="search"
      aria-label="Plan a quiet walking route"
      onSubmit={submit}
    >
      <button
        type="button"
        className="route-search-panel__collapsed search-orb-container"
        aria-expanded={expanded}
        aria-controls="route-search-expanded"
        onClick={() => setExpanded(true)}
      >
        <span className="gooey-background-layer" aria-hidden="true">
          <span className="blob blob-1" />
          <span className="blob blob-2" />
          <span className="blob blob-3" />
          <span className="blob-bridge" />
        </span>
        <span className="input-overlay">
          <span className="search-icon-wrapper">
            <Search className="search-icon" aria-hidden="true" />
          </span>
          <span className="modern-input">
            {destinationPlace?.label || destinationQuery || 'Where do you want to go?'}
          </span>
          <Navigation className="route-search-panel__collapsed-nav" aria-hidden="true" />
          <span className="focus-indicator" aria-hidden="true" />
        </span>
        <svg className="gooey-svg-filter" aria-hidden="true">
          <defs>
            <filter id="enhanced-goo">
              <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="blur" />
              <feColorMatrix
                in="blur"
                mode="matrix"
                values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -9"
                result="goo"
              />
              <feComposite in="SourceGraphic" in2="goo" operator="atop" />
            </filter>
          </defs>
        </svg>
      </button>

      <div id="route-search-expanded" className="route-search-panel__expanded-content">
        <header>
          <span className="route-search-panel__window-tools" aria-hidden="true">
            <i className="route-search-panel__window-dot route-search-panel__window-dot--red" />
            <i className="route-search-panel__window-dot route-search-panel__window-dot--yellow" />
            <i className="route-search-panel__window-dot route-search-panel__window-dot--green" />
          </span>
          <div>
            <strong>Plan a quiet walk</strong>
            <span>Live and predicted pedestrian activity</span>
          </div>
          <button type="button" aria-label="Close route search" onClick={() => setExpanded(false)}>
            <X aria-hidden="true" />
          </button>
        </header>

        <div className="route-search-panel__fields">
          <span className="route-search-panel__connector" aria-hidden="true" />
          <PlaceField
            id="route-origin"
            label="Start"
            placeholder="Enter a starting point"
            value={originValue}
            mapsReady={mapsReady}
            locationBias={userPosition}
            icon="origin"
            autocompleteEnabled={!useCurrentLocation}
            selectOnFocus={useCurrentLocation}
            trailingAction={{
              label: 'Use your current location',
              active: useCurrentLocation,
              disabled: locating && !userPosition,
              onClick: chooseCurrentLocation,
            }}
            onValueChange={(value) => {
              setUseCurrentLocation(false)
              setOriginQuery(value)
            }}
            onPlaceChange={setOriginPlace}
          />

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
          className={`route-search-panel__submit${planning ? ' route-search-panel__submit--planning' : ''}`}
          disabled={!selectedOrigin || !destinationPlace || planning}
          aria-busy={planning}
        >
          <span>{planning ? 'Finding the quietest route…' : 'Find quiet route'}</span>
          {planning ? (
            <span className="route-search-panel__submit-loader" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
          ) : (
            <svg className="route-search-panel__submit-arrow" viewBox="0 0 16 19" aria-hidden="true">
              <path d="M7 18C7 18.5523 7.44772 19 8 19C8.55228 19 9 18.5523 9 18H7ZM8.70711 0.292893C8.31658 -0.0976311 7.68342 -0.0976311 7.29289 0.292893L0.928932 6.65685C0.538408 7.04738 0.538408 7.68054 0.928932 8.07107C1.31946 8.46159 1.95262 8.46159 2.34315 8.07107L8 2.41421L13.6569 8.07107C14.0474 8.46159 14.6805 8.46159 15.0711 8.07107C15.4616 7.68054 15.4616 7.04738 15.0711 6.65685L8.70711 0.292893ZM9 18L9 1H7L7 18H9Z" />
            </svg>
          )}
        </button>
      </div>
    </form>
  )
}
