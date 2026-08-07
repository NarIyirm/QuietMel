import {
  DEFAULT_PLACE_CATEGORY_IDS,
  isPlaceCategoryId,
  type PlaceCategoryId,
} from './placeDiscovery'

type StoredMapPreferences = {
  version: 1
  quickPlaceCategories: PlaceCategoryId[]
  customized: boolean
}

const STORAGE_KEY = 'quietmel.map-preferences'

function normalizeCategories(value: unknown): PlaceCategoryId[] {
  if (!Array.isArray(value)) return [...DEFAULT_PLACE_CATEGORY_IDS]

  const categories = [...new Set(value.filter(isPlaceCategoryId))]
  return categories.length ? categories : [...DEFAULT_PLACE_CATEGORY_IDS]
}

export function readLocalMapPreferences(): StoredMapPreferences {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return {
        version: 1,
        quickPlaceCategories: [...DEFAULT_PLACE_CATEGORY_IDS],
        customized: false,
      }
    }

    const parsed = JSON.parse(raw) as Partial<StoredMapPreferences>
    return {
      version: 1,
      quickPlaceCategories: normalizeCategories(parsed.quickPlaceCategories),
      customized: parsed.customized === true,
    }
  } catch {
    window.localStorage.removeItem(STORAGE_KEY)
    return {
      version: 1,
      quickPlaceCategories: [...DEFAULT_PLACE_CATEGORY_IDS],
      customized: false,
    }
  }
}

export function saveLocalMapPreferences(
  quickPlaceCategories: PlaceCategoryId[],
  customized = true,
) {
  const preferences: StoredMapPreferences = {
    version: 1,
    quickPlaceCategories: normalizeCategories(quickPlaceCategories),
    customized,
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences))
  return preferences
}
