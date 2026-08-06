import { Router, type Request, type Response } from 'express'
import { z } from 'zod'

import {
  getSupabaseAdminClient,
  getSupabaseAuthClient,
  SupabaseConfigurationError,
} from '../lib/supabase.js'

const placeCategorySchema = z.enum([
  'parks',
  'libraries',
  'cafes',
  'gardens',
  'museums',
  'art-galleries',
  'bookshops',
  'community-centres',
  'picnic-areas',
  'visitor-centres',
  'places-of-worship',
])

const updateMapPreferencesSchema = z.object({
  quickPlaceCategories: z
    .array(placeCategorySchema)
    .min(1)
    .max(11)
    .refine((categories) => new Set(categories).size === categories.length, {
      message: 'Place categories must be unique.',
    }),
})

const defaultCategories = ['parks', 'libraries', 'cafes'] as const

export const preferencesRouter = Router()

async function requireUserId(request: Request, response: Response) {
  const authorization = request.header('authorization')
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]

  if (!token) {
    response.status(401).json({
      error: 'authentication_required',
      message: 'Log in to sync map preferences.',
    })
    return null
  }

  const { data, error } = await getSupabaseAuthClient().auth.getUser(token)
  if (error || !data.user) {
    response.status(401).json({
      error: 'invalid_session',
      message: 'Your session has expired. Please log in again.',
    })
    return null
  }

  return data.user.id
}

preferencesRouter.get('/map', async (request, response) => {
  try {
    const userId = await requireUserId(request, response)
    if (!userId) return

    const { data, error } = await getSupabaseAdminClient()
      .from('user_map_preferences')
      .select('quick_place_categories')
      .eq('user_id', userId)
      .maybeSingle()

    if (error) throw error

    response.json({
      quickPlaceCategories: data?.quick_place_categories ?? defaultCategories,
      source: data ? 'stored' : 'default',
    })
  } catch (error) {
    handlePreferencesError(error, response)
  }
})

preferencesRouter.put('/map', async (request, response) => {
  const validation = updateMapPreferencesSchema.safeParse(request.body)
  if (!validation.success) {
    response.status(400).json({
      error: 'invalid_request',
      message: 'Select between 1 and 11 valid place categories.',
      issues: z.flattenError(validation.error).fieldErrors,
    })
    return
  }

  try {
    const userId = await requireUserId(request, response)
    if (!userId) return

    const { data, error } = await getSupabaseAdminClient()
      .from('user_map_preferences')
      .upsert(
        {
          user_id: userId,
          quick_place_categories: validation.data.quickPlaceCategories,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      )
      .select('quick_place_categories')
      .single()

    if (error) throw error

    response.json({
      quickPlaceCategories: data.quick_place_categories,
      source: 'stored',
    })
  } catch (error) {
    handlePreferencesError(error, response)
  }
})

function handlePreferencesError(error: unknown, response: Response) {
  if (error instanceof SupabaseConfigurationError) {
    response.status(503).json({
      error: 'configuration_required',
      message: error.message,
      missingVariables: error.missingVariables,
    })
    return
  }

  const databaseError = error as { code?: string; message?: string }
  if (databaseError.code === '42P01') {
    response.status(503).json({
      error: 'migration_required',
      message: 'Run the user_map_preferences Supabase migration first.',
    })
    return
  }

  response.status(500).json({
    error: 'preferences_failed',
    message: databaseError.message ?? 'Map preferences could not be loaded.',
  })
}

