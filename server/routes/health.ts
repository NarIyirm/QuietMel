import { Router } from 'express'

import { getMissingSupabaseVariables } from '../config/env.js'
import {
  getSupabaseAdminClient,
  SupabaseConfigurationError,
} from '../lib/supabase.js'

export const healthRouter = Router()

healthRouter.get('/', (_request, response) => {
  const missingVariables = getMissingSupabaseVariables()

  response.status(missingVariables.length === 0 ? 200 : 503).json({
    status: missingVariables.length === 0 ? 'ok' : 'configuration_required',
    service: 'quietmel-api',
    supabaseConfigured: missingVariables.length === 0,
    ...(missingVariables.length > 0 ? { missingVariables } : {}),
  })
})

healthRouter.get('/database', async (_request, response) => {
  const startedAt = performance.now()

  try {
    const { data, error } = await getSupabaseAdminClient().rpc('health_check')

    if (error) {
      response.status(503).json({
        status: 'error',
        database: 'unavailable',
        message: error.message,
        hint:
          error.code === 'PGRST202'
            ? 'Run the initial Supabase migration, then reload the schema cache.'
            : undefined,
      })
      return
    }

    response.json({
      status: 'ok',
      database: 'connected',
      latencyMs: Math.round(performance.now() - startedAt),
      result: data,
    })
  } catch (error) {
    if (error instanceof SupabaseConfigurationError) {
      response.status(503).json({
        status: 'configuration_required',
        database: 'not_checked',
        missingVariables: error.missingVariables,
      })
      return
    }

    response.status(503).json({
      status: 'error',
      database: 'unavailable',
      message: error instanceof Error ? error.message : 'Unknown database error',
    })
  }
})
