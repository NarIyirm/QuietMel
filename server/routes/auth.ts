import { Router } from 'express'
import { z } from 'zod'

import { env } from '../config/env.js'
import {
  getSupabaseAdminClient,
  getSupabaseAuthClient,
  SupabaseConfigurationError,
} from '../lib/supabase.js'

const credentialsSchema = z.object({
  email: z.email(),
  password: z.string().min(8).max(128),
  turnstileToken: z.string().min(1).max(2048).optional(),
})

const refreshSchema = z.object({
  refreshToken: z.string().min(20),
})

const logoutSchema = z.object({
  accessToken: z.string().min(20),
})

type Credentials = z.infer<typeof credentialsSchema>
type CredentialValidation =
  | { success: true; data: Credentials }
  | {
      success: false
      status: number
      body: {
        error: string
        message: string
        issues?: Record<string, string[] | undefined>
      }
    }

export const authRouter = Router()

function validateCredentials(body: unknown): CredentialValidation {
  const result = credentialsSchema.safeParse(body)

  if (!result.success) {
    return {
      success: false,
      status: 400,
      body: {
        error: 'invalid_request',
        message: 'Please provide a valid email and a password of 8-128 characters.',
        issues: z.flattenError(result.error).fieldErrors,
      },
    }
  }

  if (env.captchaRequired && !result.data.turnstileToken) {
    return {
      success: false,
      status: 400,
      body: {
        error: 'captcha_required',
        message: 'Complete the Cloudflare Turnstile challenge and try again.',
      },
    }
  }

  return { success: true, data: result.data }
}

authRouter.post('/register', async (request, response) => {
  const validation = validateCredentials(request.body)

  if (!validation.success) {
    response.status(validation.status).json(validation.body)
    return
  }

  try {
    const { email, password, turnstileToken } = validation.data
    const { data, error } = await getSupabaseAuthClient().auth.signUp({
      email,
      password,
      options: {
        ...(turnstileToken ? { captchaToken: turnstileToken } : {}),
        ...(env.emailRedirectUrl
          ? { emailRedirectTo: env.emailRedirectUrl }
          : {}),
      },
    })

    if (error) {
      response.status(error.status || 400).json({
        error: 'registration_failed',
        message: error.message,
      })
      return
    }

    response.status(201).json({
      user: data.user,
      session: data.session,
      emailConfirmationRequired: data.session === null,
    })
  } catch (error) {
    handleAuthConfigurationError(error, response)
  }
})

authRouter.post('/login', async (request, response) => {
  const validation = validateCredentials(request.body)

  if (!validation.success) {
    response.status(validation.status).json(validation.body)
    return
  }

  try {
    const { email, password, turnstileToken } = validation.data
    const { data, error } = await getSupabaseAuthClient().auth.signInWithPassword({
      email,
      password,
      options: turnstileToken ? { captchaToken: turnstileToken } : undefined,
    })

    if (error) {
      response.status(error.status || 401).json({
        error: 'login_failed',
        message: error.message,
      })
      return
    }

    response.json({ user: data.user, session: data.session })
  } catch (error) {
    handleAuthConfigurationError(error, response)
  }
})

authRouter.post('/refresh', async (request, response) => {
  const validation = refreshSchema.safeParse(request.body)

  if (!validation.success) {
    response.status(400).json({
      error: 'invalid_request',
      message: 'A valid refresh token is required.',
    })
    return
  }

  try {
    const { data, error } = await getSupabaseAuthClient().auth.refreshSession({
      refresh_token: validation.data.refreshToken,
    })

    if (error || !data.session) {
      response.status(error?.status || 401).json({
        error: 'refresh_failed',
        message: error?.message ?? 'The session could not be refreshed.',
      })
      return
    }

    response.json({ user: data.user, session: data.session })
  } catch (error) {
    handleAuthConfigurationError(error, response)
  }
})

authRouter.post('/logout', async (request, response) => {
  const validation = logoutSchema.safeParse(request.body)

  if (!validation.success) {
    response.status(400).json({
      error: 'invalid_request',
      message: 'A valid access token is required.',
    })
    return
  }

  try {
    const { error } = await getSupabaseAdminClient().auth.admin.signOut(
      validation.data.accessToken,
      'local',
    )

    const errorStatus = error?.status ?? 500
    if (error && ![401, 403, 404].includes(errorStatus)) {
      response.status(errorStatus).json({
        error: 'logout_failed',
        message: error.message,
      })
      return
    }

    response.status(204).send()
  } catch (error) {
    handleAuthConfigurationError(error, response)
  }
})

function handleAuthConfigurationError(
  error: unknown,
  response: Parameters<Parameters<typeof authRouter.post>[1]>[1],
) {
  if (error instanceof SupabaseConfigurationError) {
    response.status(503).json({
      error: 'configuration_required',
      message: error.message,
      missingVariables: error.missingVariables,
    })
    return
  }

  response.status(500).json({
    error: 'internal_error',
    message: error instanceof Error ? error.message : 'Unknown authentication error',
  })
}
