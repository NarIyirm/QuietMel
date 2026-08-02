export type DemoRouteId = 'quietest' | 'balanced' | 'fastest'
export type NavigationRouteId = DemoRouteId | 'reroute'

export type RouteCoordinate = {
  lat: number
  lng: number
}

export type PressureArea = {
  name: string
  exposure: string
  note: string
}

export type CalmPlace = {
  name: string
  type: 'park' | 'library'
  tags: string[]
}

export type DemoRoute = {
  id: DemoRouteId
  rank: number
  label: string
  summary: string
  color: string
  durationMinutes: number
  distanceKm: number
  sensoryScore: number
  sensoryLabel: string
  combinedScore: number
  coordinates: RouteCoordinate[]
  pressureAreas: PressureArea[]
  calmPlaces: CalmPlace[]
}

export const DEMO_ROUTE_ORIGIN = 'Melbourne Central'

export const DEMO_REROUTE: DemoRoute = {
  id: 'quietest',
  rank: 1,
  label: 'Calmer reroute',
  summary: 'Avoids rising crowds near Swanston Street',
  color: '#07938c',
  durationMinutes: 27,
  distanceKm: 3.6,
  sensoryScore: 19,
  sensoryLabel: 'Very low sensory pressure',
  combinedScore: 95,
  coordinates: [
    { lat: -37.8102, lng: 144.9628 },
    { lat: -37.8075, lng: 144.9596 },
    { lat: -37.8043, lng: 144.9632 },
    { lat: -37.8038, lng: 144.9718 },
    { lat: -37.8078, lng: 144.9797 },
    { lat: -37.8143, lng: 144.984 },
    { lat: -37.8223, lng: 144.9832 },
    { lat: -37.8302, lng: 144.9785 },
  ],
  pressureAreas: [
    { name: 'Victoria Street west', exposure: 'Brief', note: 'A short moderate section before quieter streets' },
  ],
  calmPlaces: [
    { name: 'Carlton Gardens', type: 'park', tags: ['Low crowds', 'Shaded'] },
    { name: 'Treasury Gardens', type: 'park', tags: ['Rest area'] },
    { name: 'Fitzroy Gardens', type: 'park', tags: ['Quiet paths'] },
  ],
}

export const DEMO_ROUTES: DemoRoute[] = [
  {
    id: 'quietest',
    rank: 1,
    label: 'Quietest recommended',
    summary: 'Lower pressure · Calmer streets',
    color: '#087c78',
    durationMinutes: 24,
    distanceKm: 3.2,
    sensoryScore: 28,
    sensoryLabel: 'Low sensory pressure',
    combinedScore: 92,
    coordinates: [
      { lat: -37.8102, lng: 144.9628 },
      { lat: -37.8056, lng: 144.9666 },
      { lat: -37.8052, lng: 144.9737 },
      { lat: -37.8094, lng: 144.9786 },
      { lat: -37.8151, lng: 144.9822 },
      { lat: -37.8217, lng: 144.9827 },
      { lat: -37.8278, lng: 144.9799 },
      { lat: -37.8302, lng: 144.9785 },
    ],
    pressureAreas: [
      { name: 'Victoria Street', exposure: 'Brief', note: 'About 2 minutes near moderate foot traffic' },
      { name: 'Parliament precinct', exposure: 'Low', note: 'Passes along the quieter eastern edge' },
    ],
    calmPlaces: [
      { name: 'Carlton Gardens', type: 'park', tags: ['Low crowds', 'Shaded'] },
      { name: 'State Library Victoria', type: 'library', tags: ['Quiet seating'] },
      { name: 'Treasury Gardens', type: 'park', tags: ['Rest area'] },
    ],
  },
  {
    id: 'balanced',
    rank: 2,
    label: 'Balanced',
    summary: 'Moderate pressure · Shorter walk',
    color: '#64788a',
    durationMinutes: 21,
    distanceKm: 3,
    sensoryScore: 51,
    sensoryLabel: 'Moderate sensory pressure',
    combinedScore: 81,
    coordinates: [
      { lat: -37.8102, lng: 144.9628 },
      { lat: -37.8108, lng: 144.9682 },
      { lat: -37.8142, lng: 144.9723 },
      { lat: -37.8193, lng: 144.9748 },
      { lat: -37.8236, lng: 144.9788 },
      { lat: -37.8302, lng: 144.9785 },
    ],
    pressureAreas: [
      { name: 'Swanston Street', exposure: 'Moderate', note: 'About 5 minutes near shops and tram stops' },
      { name: 'Federation Square', exposure: 'Moderate', note: 'Crowds may increase around events' },
    ],
    calmPlaces: [
      { name: 'State Library Victoria', type: 'library', tags: ['Quiet seating'] },
      { name: 'Birrarung Marr', type: 'park', tags: ['Open space'] },
    ],
  },
  {
    id: 'fastest',
    rank: 3,
    label: 'Fastest',
    summary: 'Higher pressure · Most direct',
    color: '#d39b4a',
    durationMinutes: 18,
    distanceKm: 2.7,
    sensoryScore: 79,
    sensoryLabel: 'High sensory pressure',
    combinedScore: 68,
    coordinates: [
      { lat: -37.8102, lng: 144.9628 },
      { lat: -37.8145, lng: 144.9657 },
      { lat: -37.8183, lng: 144.9671 },
      { lat: -37.8213, lng: 144.9705 },
      { lat: -37.8255, lng: 144.9754 },
      { lat: -37.8302, lng: 144.9785 },
    ],
    pressureAreas: [
      { name: 'Swanston Street', exposure: 'High', note: 'Dense tram, retail and pedestrian activity' },
      { name: 'Flinders Street Station', exposure: 'High', note: 'About 6 minutes through the busiest zone' },
      { name: 'Federation Square', exposure: 'Moderate', note: 'Open but frequently crowded' },
    ],
    calmPlaces: [
      { name: 'Birrarung Marr', type: 'park', tags: ['Open space'] },
      { name: 'Alexandra Gardens', type: 'park', tags: ['Quiet edge'] },
    ],
  },
]
