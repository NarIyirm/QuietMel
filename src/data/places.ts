export type PlaceCategory = 'park' | 'library' | 'riverside'

export type QuietPlace = {
  id: string
  name: string
  category: PlaceCategory
  categoryLabel: string
  coordinates: [longitude: number, latitude: number]
  quietScore: number
  distance: string
  description: string
}

export const PLACES: QuietPlace[] = [
  {
    id: 'carlton-gardens',
    name: 'Carlton Gardens',
    category: 'park',
    categoryLabel: 'Park',
    coordinates: [144.9713, -37.8054],
    quietScore: 92,
    distance: '1.1 km',
    description: 'Open lawns and quieter paths away from the main roads.',
  },
  {
    id: 'fitzroy-gardens',
    name: 'Fitzroy Gardens',
    category: 'park',
    categoryLabel: 'Park',
    coordinates: [144.9802, -37.8125],
    quietScore: 88,
    distance: '1.7 km',
    description: 'Shaded paths with several low-traffic resting areas.',
  },
  {
    id: 'state-library',
    name: 'State Library Victoria',
    category: 'library',
    categoryLabel: 'Library',
    coordinates: [144.9651, -37.8098],
    quietScore: 78,
    distance: '450 m',
    description: 'Indoor quiet spaces with seating and accessible facilities.',
  },
  {
    id: 'birrarung-marr',
    name: 'Birrarung Marr',
    category: 'riverside',
    categoryLabel: 'Riverside',
    coordinates: [144.9746, -37.8175],
    quietScore: 84,
    distance: '1.4 km',
    description: 'Riverside paths with calmer pockets outside event times.',
  },
  {
    id: 'royal-botanic-gardens',
    name: 'Royal Botanic Gardens',
    category: 'park',
    categoryLabel: 'Garden',
    coordinates: [144.9796, -37.8304],
    quietScore: 94,
    distance: '2.8 km',
    description: 'Large green spaces with many secluded paths and benches.',
  },
]

export function getQuietLabel(score: number) {
  if (score >= 90) return 'Very quiet'
  if (score >= 80) return 'Quiet'
  return 'Moderate'
}
