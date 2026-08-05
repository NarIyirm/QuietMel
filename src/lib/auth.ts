export type AuthUser = {
  id: string
  email: string | null
}

export type AuthSession = {
  accessToken: string
  refreshToken: string
  expiresAt: number
}

export type StoredAuth = {
  user: AuthUser
  session: AuthSession
}

type ApiSession = {
  access_token: string
  refresh_token: string
  expires_at: number
}

type ApiUser = {
  id: string
  email?: string | null
}

type AuthApiResponse = {
  user: ApiUser | null
  session: ApiSession | null
  emailConfirmationRequired?: boolean
}

type ApiErrorResponse = {
  message?: string
}

const STORAGE_KEY = 'quietmel.auth'

export class AuthRequestError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'AuthRequestError'
    this.status = status
  }
}

async function request<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as ApiErrorResponse
    throw new AuthRequestError(error.message ?? 'The request could not be completed.', response.status)
  }

  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

function normalizeAuth(data: AuthApiResponse): StoredAuth | null {
  if (!data.user || !data.session) return null

  return {
    user: {
      id: data.user.id,
      email: data.user.email ?? null,
    },
    session: {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresAt: data.session.expires_at,
    },
  }
}

export async function registerWithEmail(
  email: string,
  password: string,
  turnstileToken: string,
) {
  const data = await request<AuthApiResponse>('/api/auth/register', {
    email,
    password,
    turnstileToken,
  })

  return {
    auth: normalizeAuth(data),
    emailConfirmationRequired: data.emailConfirmationRequired === true,
  }
}

export async function loginWithEmail(
  email: string,
  password: string,
  turnstileToken: string,
) {
  return normalizeAuth(
    await request<AuthApiResponse>('/api/auth/login', {
      email,
      password,
      turnstileToken,
    }),
  )
}

export async function refreshAuth(refreshToken: string) {
  return normalizeAuth(
    await request<AuthApiResponse>('/api/auth/refresh', { refreshToken }),
  )
}

export async function logoutAuth(accessToken: string) {
  await request<void>('/api/auth/logout', { accessToken })
}

export function saveStoredAuth(auth: StoredAuth) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(auth))
}

export function clearStoredAuth() {
  window.localStorage.removeItem(STORAGE_KEY)
}

export function readStoredAuth(): StoredAuth | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY)
    if (!value) return null

    const parsed = JSON.parse(value) as StoredAuth
    if (
      !parsed.user?.id ||
      !parsed.session?.accessToken ||
      !parsed.session?.refreshToken ||
      !parsed.session?.expiresAt
    ) {
      clearStoredAuth()
      return null
    }

    return parsed
  } catch {
    clearStoredAuth()
    return null
  }
}

export async function restoreStoredAuth() {
  const stored = readStoredAuth()
  if (!stored) return null

  const expiresSoon = stored.session.expiresAt * 1000 <= Date.now() + 60_000
  if (!expiresSoon) return stored

  try {
    const refreshed = await refreshAuth(stored.session.refreshToken)
    if (!refreshed) throw new Error('No refreshed session returned')
    saveStoredAuth(refreshed)
    return refreshed
  } catch {
    clearStoredAuth()
    return null
  }
}

export function getUserInitial(user: AuthUser | null | undefined) {
  const character = user?.email?.trim().charAt(0)
  return character ? character.toLocaleUpperCase() : null
}
