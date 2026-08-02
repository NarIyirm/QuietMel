import type { RouteCoordinate } from './demoRoutes'

export type QuietSpace = {
  id: string
  name: string
  type: string
  coordinates: RouteCoordinate
  distance: string
  walkingMinutes: number
  quietScore: number
  density: 'Very low' | 'Low' | 'Moderate'
  densityPercent: number
  description: string
  routeCoordinates: RouteCoordinate[]
}

const CURRENT_POSITION = { lat: -37.8112, lng: 144.967 }

export const QUIET_SPACES: QuietSpace[] = [
  {
    id: 'state-library-reading-room',
    name: 'State Library Reading Room',
    type: 'Indoor quiet space',
    coordinates: { lat: -37.8098, lng: 144.9651 },
    distance: '420 m',
    walkingMinutes: 6,
    quietScore: 86,
    density: 'Low',
    densityPercent: 22,
    description: 'Quiet seating, soft lighting and accessible facilities.',
    routeCoordinates: [CURRENT_POSITION, { lat: -37.8107, lng: 144.9665 }, { lat: -37.8102, lng: 144.9655 }, { lat: -37.8098, lng: 144.9651 }],
  },
  {
    id: 'carlton-gardens-south',
    name: 'Carlton Gardens South',
    type: 'Park',
    coordinates: { lat: -37.8064, lng: 144.9709 },
    distance: '850 m',
    walkingMinutes: 11,
    quietScore: 92,
    density: 'Very low',
    densityPercent: 13,
    description: 'Shaded lawns with several paths away from road traffic.',
    routeCoordinates: [CURRENT_POSITION, { lat: -37.8097, lng: 144.9682 }, { lat: -37.8081, lng: 144.9697 }, { lat: -37.8064, lng: 144.9709 }],
  },
  {
    id: 'treasury-gardens-retreat',
    name: 'Treasury Gardens Retreat',
    type: 'Park rest area',
    coordinates: { lat: -37.8144, lng: 144.9762 },
    distance: '1.1 km',
    walkingMinutes: 14,
    quietScore: 89,
    density: 'Low',
    densityPercent: 18,
    description: 'Open green space with benches and quieter eastern paths.',
    routeCoordinates: [CURRENT_POSITION, { lat: -37.8119, lng: 144.9702 }, { lat: -37.8132, lng: 144.9732 }, { lat: -37.8144, lng: 144.9762 }],
  },
  {
    id: 'rmit-reflection-room',
    name: 'RMIT Reflection Room',
    type: 'Low-stimulation room',
    coordinates: { lat: -37.8077, lng: 144.9638 },
    distance: '760 m',
    walkingMinutes: 10,
    quietScore: 81,
    density: 'Moderate',
    densityPercent: 38,
    description: 'A small indoor room intended for quiet reflection and rest.',
    routeCoordinates: [CURRENT_POSITION, { lat: -37.8102, lng: 144.9657 }, { lat: -37.8089, lng: 144.9645 }, { lat: -37.8077, lng: 144.9638 }],
  },
]
