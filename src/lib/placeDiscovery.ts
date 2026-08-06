export const PLACE_CATEGORIES = [
  { id: 'parks', label: 'Parks', googleTypes: ['park', 'city_park'] },
  { id: 'libraries', label: 'Libraries', googleTypes: ['library'] },
  { id: 'cafes', label: 'Cafés', googleTypes: ['cafe', 'coffee_shop'] },
  { id: 'gardens', label: 'Gardens', googleTypes: ['garden', 'botanical_garden'] },
  { id: 'museums', label: 'Museums', googleTypes: ['museum', 'art_museum'] },
  { id: 'art-galleries', label: 'Art galleries', googleTypes: ['art_gallery'] },
  { id: 'bookshops', label: 'Bookshops', googleTypes: ['book_store'] },
  {
    id: 'community-centres',
    label: 'Community centres',
    googleTypes: ['community_center', 'cultural_center'],
  },
  { id: 'picnic-areas', label: 'Picnic areas', googleTypes: ['picnic_ground'] },
  { id: 'visitor-centres', label: 'Visitor centres', googleTypes: ['visitor_center'] },
  {
    id: 'places-of-worship',
    label: 'Places of worship',
    googleTypes: ['church', 'hindu_temple', 'mosque', 'synagogue'],
  },
] as const

export type PlaceCategoryId = (typeof PLACE_CATEGORIES)[number]['id']

export const DEFAULT_PLACE_CATEGORY_IDS: PlaceCategoryId[] = [
  'parks',
  'libraries',
  'cafes',
]

const PLACE_CATEGORY_ID_SET = new Set<string>(
  PLACE_CATEGORIES.map((category) => category.id),
)

export function isPlaceCategoryId(value: unknown): value is PlaceCategoryId {
  return typeof value === 'string' && PLACE_CATEGORY_ID_SET.has(value)
}

export function getPlaceCategory(categoryId: PlaceCategoryId) {
  return PLACE_CATEGORIES.find((category) => category.id === categoryId)!
}

