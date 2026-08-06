import { lazy, Suspense, type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  BookOpen,
  Bookmark,
  Clock3,
  Coffee,
  Leaf,
  Library,
  Landmark,
  LogIn,
  LogOut,
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
  UserRound,
  UserPlus,
  UsersRound,
  Waves,
  X,
  type LucideIcon,
} from 'lucide-react'
import { AuthPanel } from './components/AuthPanel'
import { CrowdRefreshButton } from './components/CrowdRefreshButton'
import { MapLayersControl } from './components/MapLayersControl'
import { PulseLoader } from './components/PulseLoader'
import { RoutePlanner, type RouteSheetState } from './components/RoutePlanner'
import { NavigationDemo } from './components/NavigationDemo'
import { type DemoRouteId, type NavigationRouteId } from './data/demoRoutes'
import { PLACES } from './data/places'
import { useLiveCrowd } from './hooks/useLiveCrowd'
import { usePedestrianSensors } from './hooks/usePedestrianSensors'
import type { CrowdLayerMode, PedestrianSensor } from './lib/crowd'
import {
  loadCloudMapPreferences,
  readLocalMapPreferences,
  saveCloudMapPreferences,
  saveLocalMapPreferences,
} from './lib/mapPreferences'
import {
  DEFAULT_PLACE_CATEGORY_IDS,
  PLACE_CATEGORIES,
  type PlaceCategoryId,
} from './lib/placeDiscovery'
import {
  clearStoredAuth,
  getUserInitial,
  logoutAuth,
  readStoredAuth,
  restoreStoredAuth,
  type StoredAuth,
} from './lib/auth'
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
  const preferenceSaveSequence = useRef(0)
  const [selectedPlaceId, setSelectedPlaceId] = useState(PLACES[0].id)
  const [locateRequest, setLocateRequest] = useState(0)
  const [crowdLayerMode, setCrowdLayerMode] = useState<CrowdLayerMode>('heatmap')
  const [selectedPedestrianSensorId, setSelectedPedestrianSensorId] = useState<number | null>(null)
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
  const [authPanelOpen, setAuthPanelOpen] = useState(false)
  const [authPanelMode, setAuthPanelMode] = useState<'login' | 'register'>('login')
  const [authState, setAuthState] = useState<StoredAuth | null>(() => readStoredAuth())
  const [loggingOut, setLoggingOut] = useState(false)
  const {
    snapshot: crowdSnapshot,
    loading: crowdLoading,
    refreshing: crowdRefreshing,
    error: crowdError,
    refresh: refreshCrowd,
  } = useLiveCrowd()
  const { catalogue: sensorCatalogue } = usePedestrianSensors()

  useEffect(() => {
    let active = true

    void restoreStoredAuth().then((auth) => {
      if (active) setAuthState(auth)
    })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true
    const localPreferences = readLocalMapPreferences()

    if (!authState) {
      return () => {
        active = false
      }
    }

    void loadCloudMapPreferences(authState.session.accessToken)
      .then(async (cloudPreferences) => {
        if (!active) return

        if (cloudPreferences.source === 'stored') {
          setVisibleCategories(cloudPreferences.quickPlaceCategories)
          saveLocalMapPreferences(cloudPreferences.quickPlaceCategories, true)
          setPreferenceStatus('saved')
          return
        }

        if (localPreferences.customized) {
          const saved = await saveCloudMapPreferences(
            authState.session.accessToken,
            localPreferences.quickPlaceCategories,
          )
          if (!active) return
          setVisibleCategories(saved)
          saveLocalMapPreferences(saved, true)
        } else {
          setVisibleCategories(cloudPreferences.quickPlaceCategories)
          saveLocalMapPreferences(cloudPreferences.quickPlaceCategories, false)
        }
        setPreferenceStatus('saved')
      })
      .catch(() => {
        if (!active) return
        setVisibleCategories(localPreferences.quickPlaceCategories)
        setPreferenceStatus('error')
      })

    return () => {
      active = false
    }
  }, [authState])

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
  const userInitial = getUserInitial(authState?.user)
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

  function handleCrowdLayerModeChange(mode: CrowdLayerMode) {
    setCrowdLayerMode(mode)
    setSelectedPedestrianSensorId(null)
  }

  function openAuthPanel(mode: 'login' | 'register' = 'login') {
    setAuthPanelMode(mode)
    setAuthPanelOpen(true)
  }

  function handleAuthenticated(auth: StoredAuth) {
    setAuthState(auth)
    setStatusMessage(`Logged in as ${auth.user.email ?? 'QuietMel user'}.`)
  }

  function handleLoggedOut() {
    setAuthState(null)
    setStatusMessage('You have logged out.')
  }

  async function handleLogout() {
    if (!authState || loggingOut) return

    setLoggingOut(true)

    try {
      await logoutAuth(authState.session.accessToken)
    } catch {
      // Clear local authentication when the remote session already expired.
    } finally {
      clearStoredAuth()
      setLoggingOut(false)
      handleLoggedOut()
    }
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
    const requestId = preferenceSaveSequence.current + 1
    preferenceSaveSequence.current = requestId
    const savedLocally = saveLocalMapPreferences(categories)
    setVisibleCategories(savedLocally.quickPlaceCategories)

    if (
      activeCategory &&
      !savedLocally.quickPlaceCategories.includes(activeCategory)
    ) {
      setActiveCategory(null)
    }

    if (!authState) {
      setPreferenceStatus('saved')
      return
    }

    setPreferenceStatus('saving')
    void saveCloudMapPreferences(
      authState.session.accessToken,
      savedLocally.quickPlaceCategories,
    )
      .then((saved) => {
        if (preferenceSaveSequence.current !== requestId) return
        setVisibleCategories(saved)
        saveLocalMapPreferences(saved, true)
        setPreferenceStatus('saved')
      })
      .catch(() => {
        if (preferenceSaveSequence.current === requestId) setPreferenceStatus('error')
      })
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

      <section className={`map-region${routePlanningActive ? ` map-region--planning map-region--route-sheet-${routeSheetState}` : ''}${navigationActive ? ' map-region--navigating' : ''}${activeCategory ? ' map-region--places' : ''}`} aria-label="Explore places">
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
            crowdPoints={crowdSnapshot?.points ?? []}
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

        {!activeCategory ? <aside className="sensory-pressure-legend" aria-label="Live pedestrian activity heatmap legend">
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

        <div className="desktop-search-panel">
          <SearchField
            id="desktop-search"
            query={query}
            onQueryChange={setQuery}
            onSearch={startRoutePlanning}
          />
        </div>

        {!routePlanningActive ? (
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

        <details className={`desktop-profile${authState ? ' desktop-profile--authenticated' : ''}`}>
          <summary aria-label="Open account menu">
            {userInitial ? <span aria-hidden="true">{userInitial}</span> : <UserRound aria-hidden="true" size={21} strokeWidth={1.8} />}
          </summary>
          <nav className="desktop-profile__menu" aria-label="Account options">
            <span>{authState?.user.email ?? 'Account'}</span>
            {authState ? (
              <>
                <button
                  type="button"
                  onClick={(event) => {
                    event.currentTarget.closest('details')?.removeAttribute('open')
                    openAuthPanel('login')
                  }}
                >
                  <Settings aria-hidden="true" size={16} />
                  Settings
                </button>
                <button
                  type="button"
                  className="desktop-profile__logout"
                  disabled={loggingOut}
                  onClick={(event) => {
                    event.currentTarget.closest('details')?.removeAttribute('open')
                    void handleLogout()
                  }}
                >
                  {loggingOut ? <PulseLoader label="Logging out" /> : <LogOut aria-hidden="true" size={16} />}
                  {loggingOut ? 'Logging out…' : 'Log out'}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={(event) => {
                    event.currentTarget.closest('details')?.removeAttribute('open')
                    openAuthPanel('login')
                  }}
                >
                  <LogIn aria-hidden="true" size={16} />
                  Log in
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.currentTarget.closest('details')?.removeAttribute('open')
                    openAuthPanel('register')
                  }}
                >
                  <UserPlus aria-hidden="true" size={16} />
                  Create account
                </button>
              </>
            )}
          </nav>
        </details>

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
            <details className={`mobile-profile${authState ? ' mobile-profile--authenticated' : ''}`}>
              <summary className="mobile-avatar" aria-label="Open account menu">
                {userInitial ?? 'Q'}
              </summary>
              <nav className="mobile-profile__menu" aria-label="Account options">
                <span>{authState?.user.email ?? 'Account'}</span>
                {authState ? (
                  <>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.currentTarget.closest('details')?.removeAttribute('open')
                        openAuthPanel('login')
                      }}
                    >
                      <Settings aria-hidden="true" size={16} />
                      Settings
                    </button>
                    <button
                      type="button"
                      className="mobile-profile__logout"
                      disabled={loggingOut}
                      onClick={(event) => {
                        event.currentTarget.closest('details')?.removeAttribute('open')
                        void handleLogout()
                      }}
                    >
                      {loggingOut ? <PulseLoader label="Logging out" /> : <LogOut aria-hidden="true" size={16} />}
                      {loggingOut ? 'Logging out…' : 'Log out'}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.currentTarget.closest('details')?.removeAttribute('open')
                        openAuthPanel('login')
                      }}
                    >
                      <LogIn aria-hidden="true" size={16} />
                      Log in
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.currentTarget.closest('details')?.removeAttribute('open')
                        openAuthPanel('register')
                      }}
                    >
                      <UserPlus aria-hidden="true" size={16} />
                      Create account
                    </button>
                  </>
                )}
              </nav>
            </details>
          </div>

          {!routePlanningActive ? (
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

        {!activeCategory ? (
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
          <button className="mobile-nav__item" type="button" onClick={() => openAuthPanel('login')}>
            <span className="mobile-nav__icon">
              <UserRound aria-hidden="true" size={23} />
            </span>
            <span>{authState ? 'Account' : 'Profile'}</span>
          </button>
        </nav>

        {authPanelOpen ? (
          <AuthPanel
            auth={authState}
            initialMode={authPanelMode}
            open
            onAuthenticated={handleAuthenticated}
            onClose={() => setAuthPanelOpen(false)}
          />
        ) : null}

        <p className="sr-only" role="status" aria-live="polite">
          {statusMessage}
        </p>
      </section>
    </main>
  )
}

export default App
