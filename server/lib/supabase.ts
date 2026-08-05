import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { env, getMissingSupabaseVariables } from '../config/env.js'

let adminClient: SupabaseClient | undefined

export class SupabaseConfigurationError extends Error {
  readonly missingVariables: string[]

  constructor(missingVariables = getMissingSupabaseVariables()) {
    super(`Missing Supabase configuration: ${missingVariables.join(', ')}`)
    this.name = 'SupabaseConfigurationError'
    this.missingVariables = missingVariables
  }
}

function requireSupabaseUrl() {
  if (!env.supabaseUrl) throw new SupabaseConfigurationError()
  return env.supabaseUrl
}

export function getSupabaseAuthClient() {
  if (!env.supabasePublishableKey) throw new SupabaseConfigurationError()

  // Auth clients are request-scoped so one user's in-memory session can never
  // leak into another Express request.
  return createClient(requireSupabaseUrl(), env.supabasePublishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  })
}

export function getSupabaseAdminClient() {
  if (!env.supabaseSecretKey) throw new SupabaseConfigurationError()

  adminClient ??= createClient(requireSupabaseUrl(), env.supabaseSecretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  })

  return adminClient
}
