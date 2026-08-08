import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  BookOpen,
  Bookmark,
  Clock3,
  Coffee,
  Leaf,
  Library,
  Landmark,
  MapPin,
  MapPinned,
  Minus,
  Navigation,
  Palette,
  Plus,
  Settings,
  SlidersHorizontal,
  Trees,
  UsersRound,
  X,
  type LucideIcon,
} from 'lucide-react'
import { CrowdRefreshButton } from './components/CrowdRefreshButton'
import { AppSettings, type LanguageChoice, type ThemeChoice } from './components/AppSettings'
import { OnboardingTour } from './components/OnboardingTour'
import { ForecastControls } from './components/ForecastControls'
import { MapLayersControl } from './components/MapLayersControl'
import { RoutePlanner, type RouteSheetState } from './components/RoutePlanner'
import { ActiveNavigation } from './components/ActiveNavigation'
import { RouteSearchPanel } from './components/RouteSearchPanel'
import { type DemoRouteId, type NavigationRouteId } from './data/demoRoutes'
import { useLiveCrowd } from './hooks/useLiveCrowd'
import { useCrowdForecast } from './hooks/useCrowdForecast'
import { usePedestrianSensors } from './hooks/usePedestrianSensors'
import type {
  CrowdLayerMode,
  LiveCrowdPoint,
  PedestrianSensor,
} from './lib/crowd'
import { readLocalMapPreferences, saveLocalMapPreferences } from './lib/mapPreferences'
import {
  scoreQuietRouteCandidates,
  type PlaceSelection,
  type QuietRoute,
  type QuietRouteCandidate,
  type RouteCoordinate,
} from './lib/quietRoute'
import {
  DEFAULT_PLACE_CATEGORY_IDS,
  PLACE_CATEGORIES,
  type PlaceCategoryId,
} from './lib/placeDiscovery'
import './styles/app.css'

const MapView = lazy(() => import('./components/MapView'))

const CATEGORY_ICONS: Record<PlaceCategoryId, LucideIcon> = {
  parks: Trees,
  libraries: Library,
  cafes: Coffee,
  gardens: Leaf,
  museums: Landmark,
  'art-galleries': Palette,
  bookshops: BookOpen,
  'community-centres': UsersRound,
  'picnic-areas': Trees,
  'visitor-centres': MapPinned,
  'places-of-worship': Landmark,
}

type CategoryBarProps = {
  activeCategory: PlaceCategoryId | null
  visibleCategories: PlaceCategoryId[]
  preferenceStatus: 'idle' | 'saving' | 'saved' | 'error'
  onCategoryChange: (category: PlaceCategoryId) => void
  onExitPlaceMode: () => void
  onVisibleCategoriesChange: (categories: PlaceCategoryId[]) => void
  className: string
}

function CategoryBar({
  activeCategory,
  visibleCategories,
  preferenceStatus,
  onCategoryChange,
  onExitPlaceMode,
  onVisibleCategoriesChange,
  className,
}: CategoryBarProps) {
  const [draftCategories, setDraftCategories] = useState<PlaceCategoryId[]>(visibleCategories)
  const filterRef = useRef<HTMLDetailsElement>(null)
  const draftCategorySet = new Set(draftCategories)
  const hasPendingChanges =
    draftCategories.length !== visibleCategories.length ||
    draftCategories.some((category, index) => category !== visibleCategories[index])

  function toggleDraftCategory(categoryId: PlaceCategoryId) {
    if (draftCategorySet.has(categoryId)) {
      if (draftCategories.length === 1) return
      setDraftCategories(draftCategories.filter((id) => id !== categoryId))
      return
    }

    const selected = new Set([...draftCategories, categoryId])
    setDraftCategories(
      PLACE_CATEGORIES.flatMap((category) =>
        selected.has(category.id) ? [category.id] : [],
      ),
    )
  }

  function saveDraftCategories() {
    if (!hasPendingChanges) return
    onVisibleCategoriesChange(draftCategories)
    filterRef.current?.removeAttribute('open')
  }

  return (
    <div className={`${className} category-toolbar`}>
      <div className="category-toolbar__scroller" aria-label="Explore place categories">
        {visibleCategories.map((categoryId) => {
          const category = PLACE_CATEGORIES.find((candidate) => candidate.id === categoryId)
          if (!category) return null
          const Icon = CATEGORY_ICONS[category.id]

          return (
            <button
              key={category.id}
              type="button"
              className="map-category"
              aria-pressed={activeCategory === category.id}
              onClick={() => onCategoryChange(category.id)}
            >
              <Icon aria-hidden="true" size={19} strokeWidth={2} />
              <span>{category.label}</span>
            </button>
          )
        })}
      </div>

      {activeCategory ? (
        <button
          type="button"
          className="category-mode-exit"
          aria-label="Exit place search and return to the crowd map"
          onClick={onExitPlaceMode}
        >
          <X aria-hidden="true" size={19} />
          <span>Back to crowd map</span>
        </button>
      ) : (
        <details
          ref={filterRef}
          className="category-filter"
          onToggle={(event) => {
            if (event.currentTarget.open) setDraftCategories(visibleCategories)
          }}
        >
          <summary aria-label="Choose quick place categories">
            <SlidersHorizontal aria-hidden="true" size={19} />
            <span className="category-filter__summary-label">Filter</span>
          </summary>
          <section className="category-filter__menu" aria-label="Quick place categories">
            <header>
              <strong>Quick scenes</strong>
              <span>Choose which buttons appear on the map.</span>
            </header>
            <div className="category-filter__options">
              {PLACE_CATEGORIES.map((category) => {
                const checked = draftCategorySet.has(category.id)
                return (
                  <label key={category.id}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={checked && draftCategories.length === 1}
                      onChange={() => toggleDraftCategory(category.id)}
                    />
                    <span>{category.label}</span>
                  </label>
                )
              })}
            </div>
            <footer>
              <button
                type="button"
                onClick={() => setDraftCategories([...DEFAULT_PLACE_CATEGORY_IDS])}
              >
                Restore defaults
              </button>
              <div className="category-filter__commit">
                <span role="status">
                  {preferenceStatus === 'saving'
                    ? 'Saving…'
                    : preferenceStatus === 'saved'
                      ? 'Saved'
                      : preferenceStatus === 'error'
                        ? 'Saved on this device'
                        : ''}
                </span>
                <button
                  type="button"
                  className="category-filter__save"
                  disabled={!hasPendingChanges}
                  onClick={saveDraftCategories}
                >
                  Save changes
                </button>
              </div>
            </footer>
          </section>
        </details>
      )}
    </div>
  )
}

function App() {
  const [activeCategory, setActiveCategory] = useState<PlaceCategoryId | null>(null)
  const [visibleCategories, setVisibleCategories] = useState<PlaceCategoryId[]>(
    () => readLocalMapPreferences().quickPlaceCategories,
  )
  const [preferenceStatus, setPreferenceStatus] = useState<
    'idle' | 'saving' | 'saved' | 'error'
  >('idle')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [theme, setTheme] = useState<ThemeChoice>(() => localStorage.getItem('quietmel:theme') === 'dark' ? 'dark' : 'original')
  const [language, setLanguage] = useState<LanguageChoice>(() => (localStorage.getItem('quietmel:language') as LanguageChoice | null) ?? 'en')
  const [tourOpen, setTourOpen] = useState(() => localStorage.getItem('quietmel:onboarding-complete') !== 'true')
  const [tourSession, setTourSession] = useState(0)
  const [locateRequest, setLocateRequest] = useState(1)
  const [userPosition, setUserPosition] = useState<RouteCoordinate | null>(null)
  const [locating, setLocating] = useState(true)
  const [mapsReady, setMapsReady] = useState(false)
  const [crowdLayerMode, setCrowdLayerMode] = useState<CrowdLayerMode>('heatmap')
  const [selectedPedestrianSensorId, setSelectedPedestrianSensorId] = useState<number | null>(null)
  const [forecasting, setForecasting] = useState(false)
  const [forecastFrameIndex, setForecastFrameIndex] = useState(0)
  const [forecastPlaying, setForecastPlaying] = useState(false)
  const [zoomRequest, setZoomRequest] = useState({ id: 0, delta: 0 })
  const [statusMessage, setStatusMessage] = useState('')
  const [routePlanningActive, setRoutePlanningActive] = useState(false)
  const [routePlanningLoading, setRoutePlanningLoading] = useState(false)
  const [nearbyQuietLoading, setNearbyQuietLoading] = useState(false)
  const [nearbyQuietFeedback, setNearbyQuietFeedback] = useState<string | null>(null)
  const [locationPermissionNotice, setLocationPermissionNotice] = useState(false)
  const [quietRoute, setQuietRoute] = useState<QuietRoute | null>(null)
  const [quietRouteOptions, setQuietRouteOptions] = useState<QuietRoute[]>([])
  const [selectedRouteId, setSelectedRouteId] = useState<DemoRouteId>('quietest')
  const [navigationActive, setNavigationActive] = useState(false)
  const navigationRouteId: NavigationRouteId = 'quietest'
  const reroutePromptVisible = false
  const [routeSheetState, setRouteSheetState] = useState<RouteSheetState>('medium')
  const routeRequestRef = useRef<AbortController | null>(null)
  const {
    snapshot: crowdSnapshot,
    loading: crowdLoading,
    refreshing: crowdRefreshing,
    error: crowdError,
    refresh: refreshCrowd,
  } = useLiveCrowd()
  const {
    snapshot: forecastSnapshot,
    loading: forecastLoading,
    load: loadForecast,
    reset: resetForecast,
  } = useCrowdForecast()
  const { catalogue: sensorCatalogue } = usePedestrianSensors()

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('quietmel:theme', theme)
  }, [theme])

  useEffect(() => {
    document.documentElement.lang = language
    localStorage.setItem('quietmel:language', language)
  }, [language])

  function closeTour() {
    setTourOpen(false)
    localStorage.setItem('quietmel:onboarding-complete', 'true')
  }

  function restartTour() {
    setSettingsOpen(false)
    setNavigationActive(false)
    setRoutePlanningActive(false)
    setForecasting(false)
    setActiveCategory(null)
    localStorage.removeItem('quietmel:onboarding-complete')
    setTourSession((session) => session + 1)
    setTourOpen(true)
  }
  const pedestrianSensors = useMemo<PedestrianSensor[]>(() => {
    if (sensorCatalogue?.sensors.length) return sensorCatalogue.sensors
    return (crowdSnapshot?.points ?? []).map((point) => ({
      sensorId: point.sensorId,
      name: point.name,
      description: `${point.name} pedestrian counting location.`,
      latitude: point.latitude,
      longitude: point.longitude,
      status: 'A',
      googlePlaceId: null,
    }))
  }, [crowdSnapshot?.points, sensorCatalogue?.sensors])
  const forecastSensorMap = useMemo(
    () => new Map((forecastSnapshot?.sensors ?? []).map((sensor) => [sensor.sensorId, sensor])),
    [forecastSnapshot?.sensors],
  )
  const activeForecastFrame = forecastSnapshot?.frames[forecastFrameIndex] ?? null
  const forecastCrowdPoints = useMemo<LiveCrowdPoint[]>(() => {
    if (!activeForecastFrame) return []
    return activeForecastFrame.values.flatMap((value) => {
      const sensor = forecastSensorMap.get(value.sensorId)
      if (!sensor) return []
      return [{
        sensorId: sensor.sensorId,
        name: sensor.name,
        latitude: sensor.latitude,
        longitude: sensor.longitude,
        pedestriansPerMinute: value.pedestriansPerMinute,
        crowdLevel: value.crowdLevel,
        intensity: value.intensity,
        measuredAt: activeForecastFrame.forecastAt,
      }]
    })
  }, [activeForecastFrame, forecastSensorMap])
  const displayedCrowdPoints = forecasting
    ? forecastCrowdPoints
    : crowdSnapshot?.points ?? []

  useEffect(() => {
    if (!forecasting || !forecastPlaying || !forecastSnapshot) return
    const lastFrameIndex = forecastSnapshot.frames.length - 1
    const timer = window.setTimeout(() => {
      if (forecastFrameIndex >= lastFrameIndex) {
        setForecastPlaying(false)
        return
      }
      setForecastFrameIndex(forecastFrameIndex + 1)
    }, 850)
    return () => window.clearTimeout(timer)
  }, [forecastFrameIndex, forecastPlaying, forecasting, forecastSnapshot])

  async function handleCrowdRefresh() {
    const refreshedSnapshot = await refreshCrowd()
    if (!refreshedSnapshot) {
      setStatusMessage('Live crowd data could not be refreshed.')
      return
    }

    const measuredAt = new Date(
      refreshedSnapshot.newestReadingAt ?? refreshedSnapshot.fetchedAt,
    )
    setStatusMessage(
      `Live crowd data refreshed. Latest reading ${new Intl.DateTimeFormat('en-AU', {
        hour: 'numeric',
        minute: '2-digit',
      }).format(measuredAt)} from ${refreshedSnapshot.pointCount} sensors.`,
    )
  }

  async function startCrowdForecast() {
    setStatusMessage('Preparing the next six hours of crowd activity...')
    const nextForecast = await loadForecast()
    if (!nextForecast || nextForecast.frames.length === 0) {
      setStatusMessage('The crowd forecast is currently unavailable.')
      return
    }

    setActiveCategory(null)
    setRoutePlanningActive(false)
    setNavigationActive(false)
    setCrowdLayerMode('heatmap')
    setSelectedPedestrianSensorId(null)
    setForecastFrameIndex(0)
    setForecasting(true)
    setForecastPlaying(true)
    setStatusMessage(
      `Showing a six-hour forecast from ${nextForecast.sensorCount} sensor locations.`,
    )
  }

  function exitCrowdForecast() {
    setForecasting(false)
    setForecastPlaying(false)
    setForecastFrameIndex(0)
    resetForecast()
    setStatusMessage('Live crowd heatmap restored.')
  }

  function handleCrowdLayerModeChange(mode: CrowdLayerMode) {
    setCrowdLayerMode(mode)
    setSelectedPedestrianSensorId(null)
  }

  function handleCategoryChange(category: PlaceCategoryId) {
    if (!userPosition) {
      setStatusMessage('Location access is required to search for nearby places. Please allow location access.')
      requestLocation()
      return
    }
    setActiveCategory(category)
    setSelectedPedestrianSensorId(null)
    setStatusMessage(
      `Searching for nearby ${PLACE_CATEGORIES.find((item) => item.id === category)?.label.toLocaleLowerCase() ?? 'places'}…`,
    )
  }

  function exitPlaceMode() {
    setActiveCategory(null)
    setStatusMessage('Crowd heatmap restored.')
  }

  function handleVisibleCategoriesChange(categories: PlaceCategoryId[]) {
    const savedLocally = saveLocalMapPreferences(categories)
    setVisibleCategories(savedLocally.quickPlaceCategories)

    if (
      activeCategory &&
      !savedLocally.quickPlaceCategories.includes(activeCategory)
    ) {
      setActiveCategory(null)
    }

    setPreferenceStatus('saved')
  }

  function showComingSoon(feature: string) {
    setStatusMessage(`${feature} will be added in a later version.`)
  }

  const selectRoute = useCallback((routeId: DemoRouteId) => {
    setSelectedRouteId(routeId)
  }, [])

  const handleMapReady = useCallback(() => setMapsReady(true), [])

  const handleUserPositionChange = useCallback((position: RouteCoordinate | null) => {
    setUserPosition(position)
    setLocating(false)
    if (position) setLocationPermissionNotice(false)
  }, [])

  const handleLocationStatus = useCallback((message: string) => {
    setStatusMessage(message)
    if (message.includes('Location access was not available')) {
      setLocationPermissionNotice(true)
    }
  }, [])

  function requestLocation() {
    setLocating(true)
    setLocateRequest((request) => request + 1)
  }

  async function planQuietRoute(origin: PlaceSelection, destination: PlaceSelection) {
    routeRequestRef.current?.abort()
    const controller = new AbortController()
    routeRequestRef.current = controller
    setRoutePlanningLoading(true)
    setNearbyQuietLoading(false)
    setRoutePlanningActive(false)
    setNavigationActive(false)
    setQuietRoute(null)
    setQuietRouteOptions([])
    setActiveCategory(null)
    setForecasting(false)
    setStatusMessage(`Comparing quiet walking routes to ${destination.label}…`)

    try {
      const { Route } = await google.maps.importLibrary('routes')
      const result = await Route.computeRoutes({
        origin: origin.location,
        destination: destination.location,
        travelMode: 'WALKING',
        computeAlternativeRoutes: true,
        fields: ['path', 'distanceMeters', 'durationMillis', 'legs', 'viewport'],
        language: 'en-AU',
        region: 'au',
        units: google.maps.UnitSystem.METRIC,
      })
      if (controller.signal.aborted) return

      const candidates: QuietRouteCandidate[] = (result.routes ?? []).flatMap((route, index) => {
        const path = route.path?.map((point) => ({ lat: point.lat, lng: point.lng })) ?? []
        const durationMinutes = (route.durationMillis ?? 0) / 60_000
        const distanceMeters = route.distanceMeters ?? 0
        if (path.length < 2 || durationMinutes <= 0 || distanceMeters <= 0) return []
        return [{
          id: `google-route-${index + 1}`,
          durationMinutes,
          distanceMeters,
          path,
          steps: (route.legs ?? []).flatMap((leg) =>
            leg.steps.map((step) => ({
              instruction: (step.instructions || 'Continue walking').replace(/<[^>]*>/g, ''),
              distanceMeters: step.distanceMeters,
              durationMinutes: (step.staticDurationMillis ?? 0) / 60_000,
              maneuver: step.maneuver,
            })),
          ),
        }]
      })
      if (candidates.length === 0) {
        throw new Error('Google Maps did not return a walking route for these places.')
      }

      const selection = await scoreQuietRouteCandidates(candidates, controller.signal)
      if (controller.signal.aborted) return
      const routesById = new Map(candidates.map((candidate) => [candidate.id, candidate]))
      const scoredRoutes = selection.scores.flatMap((score, index) => {
        const candidate = routesById.get(score.routeId)
        if (!candidate) return []
        return [{
          ...candidate,
          origin,
          destination,
          candidateCount: selection.candidateCount,
          modelVersion: selection.modelVersion,
          generatedAt: selection.generatedAt,
          score,
          priority: index + 1,
          planType: 'crowd-ranked' as const,
        }]
      })
      const selected = scoredRoutes.find((route) => route.id === selection.selectedRouteId)
      if (!selected) throw new Error('The recommended route could not be matched to the map.')

      setQuietRouteOptions(scoredRoutes)
      setQuietRoute(selected)
      setRouteSheetState('medium')
      setRoutePlanningActive(true)
      setStatusMessage(
        `Quiet route ready: ${Math.round(selected.durationMinutes)} minutes to ${destination.label}.`,
      )
    } catch (error) {
      if (controller.signal.aborted) return
      setStatusMessage(
        error instanceof Error
          ? error.message
          : 'A quiet walking route could not be calculated.',
      )
    } finally {
      if (routeRequestRef.current === controller) {
        routeRequestRef.current = null
        setRoutePlanningLoading(false)
      }
    }
  }

  useEffect(() => () => routeRequestRef.current?.abort(), [])

  function startNavigation() {
    if (!quietRoute) return
    setRoutePlanningActive(false)
    setNavigationActive(true)
    setStatusMessage(`Navigation started to ${quietRoute.destination.label}.`)
  }

  function selectQuietRouteOption(routeId: string) {
    const selected = quietRouteOptions.find((route) => route.id === routeId)
    if (!selected || selected.id === quietRoute?.id) return
    setQuietRoute(selected)
    setStatusMessage(
      `Route ${selected.priority} selected: ${Math.round(selected.durationMinutes)} minutes to ${selected.destination.label}.`,
    )
  }

  function endNavigation() {
    setNavigationActive(false)
    setRoutePlanningActive(true)
    setStatusMessage('Navigation ended. Your route summary is shown again.')
  }

  function requestCurrentPosition() {
    return new Promise<RouteCoordinate>((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Location is not available in this browser.'))
        return
      }
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => resolve({ lat: coords.latitude, lng: coords.longitude }),
        () => reject(new Error('Location access is needed to find a nearby quiet place.')),
        { enableHighAccuracy: true, timeout: 8_000, maximumAge: 30_000 },
      )
    })
  }

  async function findNearbyQuietPlace() {
    if (nearbyQuietLoading) return
    const controller = new AbortController()
    routeRequestRef.current?.abort()
    routeRequestRef.current = controller
    setNearbyQuietLoading(true)
    setRoutePlanningLoading(false)
    setNearbyQuietFeedback('Getting your location…')
    setStatusMessage('Finding the nearest quiet area…')

    try {
      const originLocation = userPosition ?? await requestCurrentPosition()
      if (controller.signal.aborted) return
      setUserPosition(originLocation)
      setLocating(false)
      setNearbyQuietFeedback('Looking for nearby parks, cafés and libraries…')
      const { Place } = await google.maps.importLibrary('places')
      const nearbyPlaces = await Place.searchNearby({
        fields: ['id', 'displayName', 'formattedAddress', 'location', 'primaryTypeDisplayName'],
        includedTypes: [
          'park', 'city_park', 'garden', 'botanical_garden', 'library', 'cafe',
          'coffee_shop', 'book_store', 'art_gallery',
        ],
        locationRestriction: { center: originLocation, radius: 4_000 },
        maxResultCount: 20,
        rankPreference: 'DISTANCE',
        language: 'en-AU',
        region: 'AU',
      })
      if (controller.signal.aborted) return
      const nearest = nearbyPlaces.places.find((place) => place.location && place.displayName)
      if (!nearest?.location) throw new Error('No nearby quiet places were found within 4 km.')
      const placeLocation = nearest.location.toJSON()
      const placeName = nearest.displayName ?? 'Nearby quiet place'

      const origin: PlaceSelection = {
        placeId: null,
        label: 'Your location',
        address: 'Current location',
        location: originLocation,
        source: 'current-location',
      }
      const destination: PlaceSelection = {
        placeId: nearest.id ?? null,
        label: placeName,
        address: nearest.formattedAddress ?? 'Nearby quiet place',
        location: placeLocation,
        source: 'google-place',
      }
      const { Route } = await google.maps.importLibrary('routes')
      const result = await Route.computeRoutes({
        origin: origin.location,
        destination: destination.location,
        travelMode: 'WALKING',
        fields: ['path', 'distanceMeters', 'durationMillis', 'legs', 'viewport'],
        language: 'en-AU',
        region: 'au',
        units: google.maps.UnitSystem.METRIC,
      })
      if (controller.signal.aborted) return
      const fastest = result.routes?.[0]
      const path = fastest?.path?.map((point) => ({ lat: point.lat, lng: point.lng })) ?? []
      const durationMinutes = (fastest?.durationMillis ?? 0) / 60_000
      const distanceMeters = fastest?.distanceMeters ?? 0
      if (path.length < 2 || durationMinutes <= 0 || distanceMeters <= 0) {
        throw new Error('Google Maps did not return a walking route to this quiet area.')
      }

      const route: QuietRoute = {
        id: `nearby-quiet-${nearest.id ?? Date.now()}`,
        durationMinutes,
        distanceMeters,
        path,
        steps: (fastest?.legs ?? []).flatMap((leg) => leg.steps.map((step) => ({
          instruction: (step.instructions || 'Continue walking').replace(/<[^>]*>/g, ''),
          distanceMeters: step.distanceMeters,
          durationMinutes: (step.staticDurationMillis ?? 0) / 60_000,
          maneuver: step.maneuver,
        }))),
        origin,
        destination,
        candidateCount: 1,
        modelVersion: 'nearby-quiet-place',
        generatedAt: new Date().toISOString(),
        priority: 1,
        planType: 'nearest-quiet',
        score: {
          routeId: `nearby-quiet-${nearest.id ?? 'place'}`,
          durationMinutes: Math.round(durationMinutes * 10) / 10,
          distanceMeters: Math.round(distanceMeters),
          averageCrowdPpm: 0,
          maximumCrowdPpm: 0,
          crowdExposure: 0,
          highCrowdPercent: 0,
          coverageConfidence: 1,
          extraMinutesComparedWithFastest: 0,
          crowdReductionPercent: 0,
          crowdLevel: 'low',
          combinedCost: 0,
        },
      }
      setQuietRouteOptions([route])
      setQuietRoute(route)
      setRouteSheetState('medium')
      setRoutePlanningActive(true)
      setNavigationActive(false)
      setNearbyQuietFeedback(null)
      setStatusMessage(`Fastest route ready: ${Math.round(durationMinutes)} minutes to ${placeName}.`)
    } catch (error) {
      if (!controller.signal.aborted) {
        if (error instanceof Error && error.message.includes('Location access')) {
          setLocationPermissionNotice(true)
        }
        setNearbyQuietFeedback(error instanceof Error ? error.message : 'A nearby quiet place could not be found.')
        setStatusMessage(error instanceof Error ? error.message : 'A nearby quiet place could not be found.')
      }
    } finally {
      if (routeRequestRef.current === controller) {
        routeRequestRef.current = null
        setNearbyQuietLoading(false)
      }
    }
  }

  return (
    <main className={`map-app${navigationActive ? ' map-app--navigating' : ''}`}>
      <section className={`map-region${routePlanningActive ? ` map-region--planning map-region--route-sheet-${routeSheetState}` : ''}${navigationActive ? ' map-region--navigating' : ''}${activeCategory ? ' map-region--places' : ''}${forecasting ? ' map-region--forecasting' : ''}`} aria-label="Explore places">
        <Suspense
          fallback={
            <div className="map-loading" role="status">
              <span aria-hidden="true" />
              Loading map…
            </div>
          }
        >
          <MapView
            locateRequest={locateRequest}
            zoomRequest={zoomRequest}
            routePlanningActive={routePlanningActive}
            selectedRouteId={selectedRouteId}
            onRouteSelect={selectRoute}
            navigationActive={navigationActive}
            navigationRouteId={navigationRouteId}
            reroutePreviewVisible={reroutePromptVisible}
            activePlaceCategory={activeCategory}
            crowdPoints={displayedCrowdPoints}
            pedestrianSensors={pedestrianSensors}
            crowdLayerMode={crowdLayerMode}
            selectedPedestrianSensorId={selectedPedestrianSensorId}
            onPedestrianSensorSelect={setSelectedPedestrianSensorId}
            routeSheetState={routeSheetState}
            onLocationStatus={handleLocationStatus}
            quietRoute={quietRoute}
            quietRouteOptions={quietRouteOptions}
            onQuietRouteSelect={selectQuietRouteOption}
            onUserPositionChange={handleUserPositionChange}
            onMapReady={handleMapReady}
          />
        </Suspense>

        <button type="button" className="map-settings-button" data-tour="settings" aria-label="Open settings" onClick={() => setSettingsOpen(true)}>
          <Settings aria-hidden="true" size={21} />
        </button>
        {locationPermissionNotice ? (
          <aside className="location-permission-notice" role="alert">
            <span>Location permission is off. Turn it on to use this feature.</span>
            <button type="button" aria-label="Dismiss location permission notice" onClick={() => setLocationPermissionNotice(false)}>
              <X aria-hidden="true" size={16} />
            </button>
          </aside>
        ) : null}

        {routePlanningActive && quietRoute ? (
          <RoutePlanner
            route={quietRoute}
            routes={quietRouteOptions}
            onClose={() => setRoutePlanningActive(false)}
            onSelectRoute={selectQuietRouteOption}
            onStartNavigation={startNavigation}
            onSheetStateChange={setRouteSheetState}
          />
        ) : null}

        {navigationActive && quietRoute ? (
          <ActiveNavigation route={quietRoute} onEnd={endNavigation} />
        ) : null}

        {!activeCategory && !forecasting ? <aside className="sensory-pressure-legend" aria-label="Live pedestrian activity heatmap legend">
          <div className="sensory-pressure-legend__heading">
            <div>
              <strong>Crowd level</strong>
              <span aria-live="polite">
                {crowdLoading && !crowdSnapshot
                  ? 'Loading live data'
                  : crowdError && !crowdSnapshot
                    ? 'Live data unavailable'
                    : crowdSnapshot?.stale
                      ? `Data delayed · ${crowdSnapshot.pointCount} sensors`
                      : crowdSnapshot
                        ? `Live · ${new Intl.DateTimeFormat('en-AU', {
                            hour: 'numeric',
                            minute: '2-digit',
                          }).format(new Date(crowdSnapshot.newestReadingAt ?? crowdSnapshot.fetchedAt))} · ${crowdSnapshot.pointCount} sensors`
                        : 'Waiting for live data'}
              </span>
            </div>
            {!routePlanningActive && !navigationActive ? (
              <button
                type="button"
                className="sensory-pressure-legend__forecast"
                disabled={forecastLoading}
                onClick={() => void startCrowdForecast()}
              >
                <Clock3 aria-hidden="true" />
                {forecastLoading ? 'Loading...' : 'Forecast'}
              </button>
            ) : null}
          </div>
          <div className="sensory-pressure-legend__scale" aria-hidden="true" />
          <div className="sensory-pressure-legend__labels">
            <span>Low</span>
            <span>High activity</span>
          </div>
          <a
            className="sensory-pressure-legend__source"
            href={crowdSnapshot?.source.url ?? 'https://data.melbourne.vic.gov.au/explore/dataset/pedestrian-counting-system-past-hour-counts-per-minute/'}
            target="_blank"
            rel="noreferrer"
          >
            City of Melbourne · CC BY 4.0
          </a>
        </aside> : null}

        {forecasting && forecastSnapshot ? (
          <ForecastControls
            snapshot={forecastSnapshot}
            activeFrameIndex={forecastFrameIndex}
            playing={forecastPlaying}
            onFrameChange={setForecastFrameIndex}
            onPlayingChange={setForecastPlaying}
            onClose={exitCrowdForecast}
          />
        ) : null}

        {!navigationActive && !forecasting ? (
          <div className="route-search-shell" data-tour="route-search">
            <RouteSearchPanel
              mapsReady={mapsReady}
              userPosition={userPosition}
              locating={locating}
              planning={routePlanningLoading}
              routeReady={routePlanningActive}
              onRequestLocation={requestLocation}
              onPlan={(origin, destination) => void planQuietRoute(origin, destination)}
            />
          </div>
        ) : null}

        {!routePlanningActive && !forecasting ? (
          <CategoryBar
            className="desktop-category-bar"
            activeCategory={activeCategory}
            visibleCategories={visibleCategories}
            preferenceStatus={preferenceStatus}
            onCategoryChange={handleCategoryChange}
            onExitPlaceMode={exitPlaceMode}
            onVisibleCategoriesChange={handleVisibleCategoriesChange}
          />
        ) : null}

        <div className="mobile-map-header">
          {!routePlanningActive && !forecasting ? (
            <CategoryBar
              className="mobile-category-bar"
              activeCategory={activeCategory}
              visibleCategories={visibleCategories}
              preferenceStatus={preferenceStatus}
              onCategoryChange={handleCategoryChange}
              onExitPlaceMode={exitPlaceMode}
              onVisibleCategoriesChange={handleVisibleCategoriesChange}
            />
          ) : null}
        </div>

        {!activeCategory && !forecasting ? (
          <>
            <MapLayersControl mode={crowdLayerMode} sensorCount={pedestrianSensors.length} sensorLocationsAvailable={pedestrianSensors.length > 0} onModeChange={handleCrowdLayerModeChange} />
            <CrowdRefreshButton refreshing={crowdRefreshing} onRefresh={() => void handleCrowdRefresh()} />
          </>
        ) : null}

        <button
          type="button"
          className="locate-button"
          data-tour="locate"
          aria-label="Show my location"
          onClick={requestLocation}
        >
          <Navigation aria-hidden="true" size={22} fill="currentColor" />
        </button>
        {nearbyQuietFeedback ? <p className="nearby-quiet-feedback" role="status">{nearbyQuietFeedback}</p> : null}

        <button
          type="button"
          className={`nearby-quiet-button${nearbyQuietLoading ? ' nearby-quiet-button--loading' : ''}`}
          data-tour="nearby-quiet"
          aria-label="Find the nearest quiet place"
          aria-busy={nearbyQuietLoading}
          disabled={nearbyQuietLoading || !mapsReady}
          onClick={() => void findNearbyQuietPlace()}
        >
          {nearbyQuietLoading ? (
            <span className="nearby-quiet-button__loader" aria-hidden="true"><i /><i /><i /></span>
          ) : <Leaf aria-hidden="true" size={19} />}
          <span>{nearbyQuietLoading ? (language === 'zh-CN' ? '正在查找…' : 'Finding a quiet place…') : (language === 'zh-CN' ? '查找附近安静地点' : 'Find quiet nearby')}</span>
        </button>

        <div className="desktop-zoom-controls" aria-label="Map zoom controls">
          <button
            type="button"
            aria-label="Zoom in"
            onClick={() => setZoomRequest((request) => ({ id: request.id + 1, delta: 1 }))}
          >
            <Plus aria-hidden="true" size={20} />
          </button>
          <button
            type="button"
            aria-label="Zoom out"
            onClick={() => setZoomRequest((request) => ({ id: request.id + 1, delta: -1 }))}
          >
            <Minus aria-hidden="true" size={20} />
          </button>
        </div>

        <nav className="mobile-nav" aria-label="Primary navigation">
          <a className="mobile-nav__item mobile-nav__item--active" href="#map" aria-current="page">
            <span className="mobile-nav__icon">
              <MapPin aria-hidden="true" size={22} fill="currentColor" />
            </span>
            <span>Explore</span>
          </a>
          <button className="mobile-nav__item" type="button" onClick={() => showComingSoon('Saved places')}>
            <span className="mobile-nav__icon mobile-nav__icon--status">
              <Bookmark aria-hidden="true" size={22} />
            </span>
            <span>Saved</span>
          </button>
        </nav>

        <p className="sr-only" role="status" aria-live="polite">
          {statusMessage}
        </p>
        <AppSettings open={settingsOpen} theme={theme} language={language} onClose={() => setSettingsOpen(false)} onThemeChange={setTheme} onLanguageChange={setLanguage} onRestartTutorial={restartTour} />
        <OnboardingTour key={tourSession} open={tourOpen && mapsReady} onClose={closeTour} />
      </section>
    </main>
  )
}

export default App
