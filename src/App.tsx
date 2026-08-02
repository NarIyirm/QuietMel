import { lazy, Suspense, type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import {
  Armchair,
  Bookmark,
  Clock3,
  Coffee,
  CloudSun,
  Layers3,
  Leaf,
  Library,
  LogIn,
  MapPin,
  MapPinned,
  Menu,
  Mic,
  Minus,
  Navigation,
  Plus,
  Search,
  Settings,
  Trees,
  UserRound,
  UserPlus,
  UsersRound,
  Waves,
  type LucideIcon,
} from 'lucide-react'
import { RoutePlanner, type RouteSheetState } from './components/RoutePlanner'
import { NavigationDemo } from './components/NavigationDemo'
import { SensoryForecast } from './components/SensoryForecast'
import { type DemoRouteId, type NavigationRouteId } from './data/demoRoutes'
import { PLACES } from './data/places'
import { QUIET_SPACES } from './data/quietSpaces'
import './styles/app.css'

const MapView = lazy(() => import('./components/MapView'))

type CategoryId = 'parks' | 'libraries' | 'cafes' | 'low-crowds' | 'rest-areas'

const CATEGORIES: { id: CategoryId; label: string; icon: LucideIcon }[] = [
  { id: 'parks', label: 'Parks', icon: Trees },
  { id: 'libraries', label: 'Libraries', icon: Library },
  { id: 'cafes', label: 'Cafés', icon: Coffee },
  { id: 'low-crowds', label: 'Low crowds', icon: UsersRound },
  { id: 'rest-areas', label: 'Rest areas', icon: Armchair },
]

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
  activeCategory: CategoryId | null
  onCategoryChange: (category: CategoryId | null) => void
  className: string
}

function CategoryBar({ activeCategory, onCategoryChange, className }: CategoryBarProps) {
  return (
    <div className={className} aria-label="Explore categories">
      {CATEGORIES.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          className="map-category"
          aria-pressed={activeCategory === id}
          onClick={() => onCategoryChange(activeCategory === id ? null : id)}
        >
          <Icon aria-hidden="true" size={19} strokeWidth={2} />
          <span>{label}</span>
        </button>
      ))}
    </div>
  )
}

function App() {
  const [query, setQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState<CategoryId | null>(null)
  const [selectedPlaceId, setSelectedPlaceId] = useState(PLACES[0].id)
  const [locateRequest, setLocateRequest] = useState(0)
  const [zoomRequest, setZoomRequest] = useState({ id: 0, delta: 0 })
  const [statusMessage, setStatusMessage] = useState('')
  const [routePlanningActive, setRoutePlanningActive] = useState(false)
  const [plannedDestination, setPlannedDestination] = useState('')
  const [selectedRouteId, setSelectedRouteId] = useState<DemoRouteId>('quietest')
  const [navigationActive, setNavigationActive] = useState(false)
  const [navigationRouteId, setNavigationRouteId] = useState<NavigationRouteId>('quietest')
  const [reroutePromptVisible, setReroutePromptVisible] = useState(false)
  const [rerouteHandled, setRerouteHandled] = useState(false)
  const [quietFinderOpen, setQuietFinderOpen] = useState(false)
  const [selectedQuietSpaceId, setSelectedQuietSpaceId] = useState(QUIET_SPACES[0].id)
  const [quietSpaceDestinationId, setQuietSpaceDestinationId] = useState<string | null>(null)
  const [forecastActive, setForecastActive] = useState(false)
  const [forecastSlotIndex, setForecastSlotIndex] = useState(0)
  const [routeSheetState, setRouteSheetState] = useState<RouteSheetState>('medium')

  const visiblePlaces = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()

    return PLACES.filter((place) => {
      const matchesQuery =
        normalizedQuery.length === 0 ||
        place.name.toLocaleLowerCase().includes(normalizedQuery) ||
        place.categoryLabel.toLocaleLowerCase().includes(normalizedQuery)

      if (!matchesQuery) return false
      if (activeCategory === 'parks') return place.category === 'park'
      if (activeCategory === 'libraries') return place.category === 'library'
      if (activeCategory === 'low-crowds') return place.quietScore >= 85
      return true
    })
  }, [activeCategory, query])

  const selectedPlace =
    visiblePlaces.find((place) => place.id === selectedPlaceId) ??
    visiblePlaces[0] ??
    PLACES[0]
  const quietSpaceDestination = QUIET_SPACES.find(
    (space) => space.id === quietSpaceDestinationId,
  ) ?? null

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
    setForecastActive(false)
    setActiveCategory(null)
    setStatusMessage(`Showing three demo routes to ${destination}.`)
  }

  const selectRoute = useCallback((routeId: DemoRouteId) => {
    setSelectedRouteId(routeId)
  }, [])

  useEffect(() => {
    if (!navigationActive || rerouteHandled || quietFinderOpen) return

    const timer = window.setTimeout(() => {
      setReroutePromptVisible(true)
      setStatusMessage('Swanston Street is getting crowded. A calmer reroute is available.')
    }, 8000)
    return () => window.clearTimeout(timer)
  }, [navigationActive, quietFinderOpen, rerouteHandled])

  function startNavigation() {
    setNavigationRouteId(selectedRouteId)
    setRoutePlanningActive(false)
    setNavigationActive(true)
    setReroutePromptVisible(false)
    setRerouteHandled(false)
    setQuietFinderOpen(false)
    setQuietSpaceDestinationId(null)
    setForecastActive(false)
    setStatusMessage('Demo navigation started.')
  }

  function toggleQuietFinder() {
    setQuietFinderOpen((open) => {
      const nextOpen = !open
      if (nextOpen) {
        setSelectedQuietSpaceId(QUIET_SPACES[0].id)
        setStatusMessage(`Showing ${QUIET_SPACES.length} nearby quiet spaces. Navigation is paused.`)
      } else {
        setStatusMessage('Quiet Space Finder closed. Navigation resumed.')
      }
      return nextOpen
    })
  }

  function navigateToQuietSpace(spaceId: string) {
    const space = QUIET_SPACES.find((candidate) => candidate.id === spaceId)
    if (!space) return
    setQuietSpaceDestinationId(space.id)
    setQuietFinderOpen(false)
    setReroutePromptVisible(false)
    setRerouteHandled(true)
    setStatusMessage(`Navigating to ${space.name}, ${space.walkingMinutes} minutes away.`)
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
    setQuietFinderOpen(false)
    setQuietSpaceDestinationId(null)
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

      <section className={`map-region${routePlanningActive ? ` map-region--planning map-region--route-sheet-${routeSheetState}` : ''}${navigationActive ? ' map-region--navigating' : ''}${forecastActive ? ' map-region--forecasting' : ''}`} aria-label="Explore quiet places">
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
            quietFinderOpen={quietFinderOpen}
            selectedQuietSpaceId={selectedQuietSpaceId}
            quietSpaceDestination={quietSpaceDestination}
            forecastSlotIndex={forecastActive ? forecastSlotIndex : null}
            routeSheetState={routeSheetState}
            onQuietSpaceSelect={setSelectedQuietSpaceId}
            onQuietSpaceConfirm={navigateToQuietSpace}
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
            quietFinderOpen={quietFinderOpen}
            quietSpaceDestination={quietSpaceDestination}
            onToggleQuietFinder={toggleQuietFinder}
            onSwitchRoute={switchToReroute}
            onKeepRoute={keepCurrentRoute}
            onEndNavigation={endNavigation}
          />
        ) : null}

        <aside className="sensory-pressure-legend" aria-label="Sensory pressure heatmap legend">
          <div className="sensory-pressure-legend__heading">
            <div>
              <strong>Sensory pressure</strong>
              <span>{forecastActive ? 'Forecast estimate' : 'Demo estimate'}</span>
            </div>
            {!forecastActive && !navigationActive && !routePlanningActive ? (
              <button
                type="button"
                className="sensory-pressure-legend__forecast"
                aria-label="Open Sensory Forecast"
                onClick={() => {
                  setForecastActive(true)
                  setForecastSlotIndex(0)
                  setStatusMessage('Sensory Forecast opened. Showing a static estimate for 2:00 PM.')
                }}
              >
                <CloudSun aria-hidden="true" />
                Forecast
              </button>
            ) : null}
          </div>
          <div className="sensory-pressure-legend__scale" aria-hidden="true" />
          <div className="sensory-pressure-legend__labels">
            <span>Low</span>
            <span>High pressure</span>
          </div>
        </aside>

        {!navigationActive && !routePlanningActive ? (
          <SensoryForecast
            active={forecastActive}
            slotIndex={forecastSlotIndex}
            onSlotChange={(slotIndex) => {
              setForecastSlotIndex(slotIndex)
              setStatusMessage('Sensory forecast time updated.')
            }}
            onExit={() => {
              setForecastActive(false)
              setForecastSlotIndex(0)
              setStatusMessage('Sensory Forecast closed. Current map conditions restored.')
            }}
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

        {!routePlanningActive ? (
          <CategoryBar
            className="desktop-category-bar"
            activeCategory={activeCategory}
            onCategoryChange={setActiveCategory}
          />
        ) : null}

        <details className="desktop-profile">
          <summary aria-label="Open account menu">
            <UserRound aria-hidden="true" size={21} strokeWidth={1.8} />
          </summary>
          <nav className="desktop-profile__menu" aria-label="Account options">
            <span>Account</span>
            <button type="button" onClick={() => showComingSoon('Log in')}>
              <LogIn aria-hidden="true" size={16} />
              Log in
            </button>
            <button type="button" onClick={() => showComingSoon('Account creation')}>
              <UserPlus aria-hidden="true" size={16} />
              Create account
            </button>
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
            <button type="button" className="mobile-avatar" aria-label="Open profile" onClick={() => showComingSoon('Profile')}>
              Q
            </button>
          </div>

          {!routePlanningActive ? (
            <CategoryBar
              className="mobile-category-bar"
              activeCategory={activeCategory}
              onCategoryChange={setActiveCategory}
            />
          ) : null}
        </div>

        <button type="button" className="layers-button" aria-label="Map layers" onClick={() => showComingSoon('Map layers')}>
          <Layers3 aria-hidden="true" size={23} />
        </button>

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
          <button className="mobile-nav__item" type="button" onClick={() => showComingSoon('Profile')}>
            <span className="mobile-nav__icon">
              <UserRound aria-hidden="true" size={23} />
            </span>
            <span>Profile</span>
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
