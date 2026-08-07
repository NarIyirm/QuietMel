import { lazy, Suspense, type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  Menu,
  Mic,
  Minus,
  Navigation,
  Palette,
  Plus,
  Search,
  Settings,
  SlidersHorizontal,
  Trees,
  UsersRound,
  Waves,
  X,
  type LucideIcon,
} from 'lucide-react'
import { CrowdRefreshButton } from './components/CrowdRefreshButton'
import { ForecastControls } from './components/ForecastControls'
import { MapLayersControl } from './components/MapLayersControl'
import { RoutePlanner, type RouteSheetState } from './components/RoutePlanner'
import { NavigationDemo } from './components/NavigationDemo'
import { type DemoRouteId, type NavigationRouteId } from './data/demoRoutes'
import { PLACES } from './data/places'
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

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className={compact ? 'brand-mark brand-mark--compact' : 'brand-mark'} aria-hidden="true">
      <Leaf className="brand-mark__leaf" strokeWidth={2.4} />
      <Waves className="brand-mark__waves" strokeWidth={2.2} />
    </span>
  )
}

type SearchFieldProps = {
  id: string
  query: string
  onQueryChange: (value: string) => void
  onSearch: () => void
}

function SearchField({ id, query, onQueryChange, onSearch }: SearchFieldProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSearch()
  }

  return (
    <form className="search-orb-container" role="search" onSubmit={handleSubmit}>
      <div className="gooey-background-layer" aria-hidden="true">
        <div className="blob blob-1" />
        <div className="blob blob-2" />
        <div className="blob blob-3" />
        <div className="blob-bridge" />
      </div>

      <div className="input-overlay">
        <button type="submit" className="search-icon-wrapper" aria-label="Plan route">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="search-icon"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </button>
        <label className="sr-only" htmlFor={id}>
          Search quiet places
        </label>
        <input
          id={id}
          type="search"
          className="modern-input"
          value={query}
          placeholder="Search quiet places"
          autoComplete="off"
          onChange={(event) => onQueryChange(event.target.value)}
        />
        <div className="focus-indicator" aria-hidden="true" />
      </div>

      <svg className="gooey-svg-filter" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <defs>
          <filter id="enhanced-goo">
            <feGaussianBlur in="SourceGraphic" stdDeviation="12" result="blur" />
            <feColorMatrix
              in="blur"
              mode="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -10"
              result="goo"
            />
            <feComposite in="SourceGraphic" in2="goo" operator="atop" />
          </filter>
        </defs>
      </svg>
    </form>
  )
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
  const [query, setQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState<PlaceCategoryId | null>(null)
  const [visibleCategories, setVisibleCategories] = useState<PlaceCategoryId[]>(
    () => readLocalMapPreferences().quickPlaceCategories,
  )
  const [preferenceStatus, setPreferenceStatus] = useState<
    'idle' | 'saving' | 'saved' | 'error'
  >('idle')
  const [selectedPlaceId, setSelectedPlaceId] = useState(PLACES[0].id)
  const [locateRequest, setLocateRequest] = useState(0)
  const [crowdLayerMode, setCrowdLayerMode] = useState<CrowdLayerMode>('heatmap')
  const [selectedPedestrianSensorId, setSelectedPedestrianSensorId] = useState<number | null>(null)
  const [forecasting, setForecasting] = useState(false)
  const [forecastFrameIndex, setForecastFrameIndex] = useState(0)
  const [forecastPlaying, setForecastPlaying] = useState(false)
  const [zoomRequest, setZoomRequest] = useState({ id: 0, delta: 0 })
  const [statusMessage, setStatusMessage] = useState('')
  const [routePlanningActive, setRoutePlanningActive] = useState(false)
  const [plannedDestination, setPlannedDestination] = useState('')
  const [selectedRouteId, setSelectedRouteId] = useState<DemoRouteId>('quietest')
  const [navigationActive, setNavigationActive] = useState(false)
  const [navigationRouteId, setNavigationRouteId] = useState<NavigationRouteId>('quietest')
  const [reroutePromptVisible, setReroutePromptVisible] = useState(false)
  const [rerouteHandled, setRerouteHandled] = useState(false)
  const [routeSheetState, setRouteSheetState] = useState<RouteSheetState>('medium')
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

  const visiblePlaces = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()

    return PLACES.filter((place) => {
      const matchesQuery =
        normalizedQuery.length === 0 ||
        place.name.toLocaleLowerCase().includes(normalizedQuery) ||
        place.categoryLabel.toLocaleLowerCase().includes(normalizedQuery)

      if (!matchesQuery) return false
      return true
    })
  }, [query])

  const selectedPlace =
    visiblePlaces.find((place) => place.id === selectedPlaceId) ??
    visiblePlaces[0] ??
    PLACES[0]
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

  function startRoutePlanning() {
    const destination = query.trim()
    if (!destination) {
      setStatusMessage('Enter a destination to compare routes.')
      return
    }

    setPlannedDestination(destination)
    setSelectedRouteId('quietest')
    setRoutePlanningActive(true)
    setRouteSheetState('medium')
    setActiveCategory(null)
    setStatusMessage(`Showing three demo routes to ${destination}.`)
  }

  const selectRoute = useCallback((routeId: DemoRouteId) => {
    setSelectedRouteId(routeId)
  }, [])

  useEffect(() => {
    if (!navigationActive || rerouteHandled) return

    const timer = window.setTimeout(() => {
      setReroutePromptVisible(true)
      setStatusMessage('Swanston Street is getting crowded. A calmer reroute is available.')
    }, 8000)
    return () => window.clearTimeout(timer)
  }, [navigationActive, rerouteHandled])

  function startNavigation() {
    setNavigationRouteId(selectedRouteId)
    setRoutePlanningActive(false)
    setNavigationActive(true)
    setReroutePromptVisible(false)
    setRerouteHandled(false)
    setStatusMessage('Demo navigation started.')
  }

  function switchToReroute() {
    setNavigationRouteId('reroute')
    setReroutePromptVisible(false)
    setRerouteHandled(true)
    setStatusMessage('Switched to the calmer reroute.')
  }

  function keepCurrentRoute() {
    setReroutePromptVisible(false)
    setRerouteHandled(true)
    setStatusMessage('Continuing on the current route.')
  }

  function endNavigation() {
    setNavigationActive(false)
    setReroutePromptVisible(false)
    setRerouteHandled(true)
    setRoutePlanningActive(true)
    setStatusMessage('Navigation ended. Route options are shown again.')
  }

  return (
    <main className={`map-app${navigationActive ? ' map-app--navigating' : ''}`}>
      <aside className="desktop-rail" aria-label="Main navigation">
        <a className="rail-brand" href="/" aria-label="QuietMel home">
          <BrandMark />
        </a>

        <nav className="rail-navigation" aria-label="Desktop navigation">
          <button type="button" className="rail-item" onClick={() => showComingSoon('Menu')}>
            <Menu aria-hidden="true" />
            <span>Menu</span>
          </button>
          <button type="button" className="rail-item" onClick={() => showComingSoon('Saved places')}>
            <Bookmark aria-hidden="true" />
            <span>Saved</span>
          </button>
          <button type="button" className="rail-item" onClick={() => showComingSoon('Recent places')}>
            <Clock3 aria-hidden="true" />
            <span>Recent</span>
          </button>
        </nav>

        <button type="button" className="rail-place" onClick={() => setSelectedPlaceId(PLACES[0].id)}>
          <span className="rail-place__preview">
            <MapPinned aria-hidden="true" size={24} />
          </span>
          <span>{selectedPlace.name.split(' ')[0]}</span>
        </button>

        <button type="button" className="rail-settings" aria-label="Open settings" onClick={() => showComingSoon('Settings')}>
          <Settings aria-hidden="true" size={21} />
        </button>
      </aside>

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
            onLocationStatus={setStatusMessage}
          />
        </Suspense>

        {routePlanningActive ? (
          <RoutePlanner
            destination={plannedDestination}
            selectedRouteId={selectedRouteId}
            onRouteSelect={selectRoute}
            onClose={() => setRoutePlanningActive(false)}
            onStartNavigation={startNavigation}
            onSheetStateChange={setRouteSheetState}
          />
        ) : null}

        {navigationActive ? (
          <NavigationDemo
            routeId={navigationRouteId}
            reroutePromptVisible={reroutePromptVisible}
            onSwitchRoute={switchToReroute}
            onKeepRoute={keepCurrentRoute}
            onEndNavigation={endNavigation}
          />
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

        <div className="desktop-search-panel">
          <SearchField
            id="desktop-search"
            query={query}
            onQueryChange={setQuery}
            onSearch={startRoutePlanning}
          />
        </div>

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
          <div className="mobile-search-row">
            <form
              className="mobile-search-field"
              role="search"
              onSubmit={(event) => {
                event.preventDefault()
                startRoutePlanning()
              }}
            >
              <BrandMark compact />
              <label className="sr-only" htmlFor="mobile-search">
                Search quiet places
              </label>
              <input
                id="mobile-search"
                type="search"
                value={query}
                placeholder="Search quiet places"
                autoComplete="off"
                onChange={(event) => setQuery(event.target.value)}
              />
              <button type="button" className="mobile-search-action" aria-label="Voice search" onClick={() => showComingSoon('Voice search')}>
                <Mic aria-hidden="true" size={21} />
              </button>
              <button type="submit" className="mobile-search-action" aria-label="Plan route">
                <Search aria-hidden="true" size={21} />
              </button>
            </form>
          </div>

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
            <MapLayersControl
              mode={crowdLayerMode}
              sensorCount={pedestrianSensors.length}
              sensorLocationsAvailable={pedestrianSensors.length > 0}
              onModeChange={handleCrowdLayerModeChange}
            />

            <CrowdRefreshButton
              refreshing={crowdRefreshing}
              onRefresh={() => void handleCrowdRefresh()}
            />
          </>
        ) : null}

        <button
          type="button"
          className="locate-button"
          aria-label="Show my location"
          onClick={() => setLocateRequest((request) => request + 1)}
        >
          <Navigation aria-hidden="true" size={22} fill="currentColor" />
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
      </section>
    </main>
  )
}

export default App
