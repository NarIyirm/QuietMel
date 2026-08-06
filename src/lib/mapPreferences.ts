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

type PreferencesApiResponse = {
  quickPlaceCategories: unknown
  source: 'default' | 'stored'
}

const STORAGE_KEY = 'quietmel.map-preferences'

export class MapPreferencesRequestError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'MapPreferencesRequestError'
    this.status = status
  }
}

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

async function parseResponse(response: Response) {
  const body = (await response.json().catch(() => ({}))) as {
    message?: string
  } & Partial<PreferencesApiResponse>

  if (!response.ok) {
    throw new MapPreferencesRequestError(
      body.message ?? 'Map preferences could not be saved.',
      response.status,
    )
  }

  return body as PreferencesApiResponse
}

export async function loadCloudMapPreferences(accessToken: string) {
  const response = await fetch('/api/preferences/map', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const body = await parseResponse(response)
  return {
    quickPlaceCategories: normalizeCategories(body.quickPlaceCategories),
    source: body.source,
  }
}

export async function saveCloudMapPreferences(
  accessToken: string,
  quickPlaceCategories: PlaceCategoryId[],
) {
  const response = await fetch('/api/preferences/map', {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ quickPlaceCategories }),
  })
  const body = await parseResponse(response)
  return normalizeCategories(body.quickPlaceCategories)
}

