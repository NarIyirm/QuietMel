function readFirst(...names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim()
    if (value) return value
  }

  return undefined
}

function parseBoolean(value: string | undefined, fallback: boolean) {
  if (value === undefined) return fallback
  return value.toLowerCase() === 'true'
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3000),
  clientOrigins: (process.env.CLIENT_ORIGINS ?? 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  supabaseUrl: readFirst('SUPABASE_URL'),
  supabasePublishableKey: readFirst(
    'SUPABASE_PUBLISHABLE_KEY',
    'SUPABASE_ANON_KEY',
  ),
  supabaseSecretKey: readFirst(
    'SUPABASE_SECRET_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
  ),
  captchaRequired: parseBoolean(process.env.AUTH_CAPTCHA_REQUIRED, false),
  emailRedirectUrl: readFirst('AUTH_EMAIL_REDIRECT_URL'),
}

export function getMissingSupabaseVariables() {
  const missing: string[] = []

  if (!env.supabaseUrl) missing.push('SUPABASE_URL')
  if (!env.supabasePublishableKey) {
    missing.push('SUPABASE_PUBLISHABLE_KEY or SUPABASE_ANON_KEY')
  }
  if (!env.supabaseSecretKey) {
    missing.push('SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY')
  }

  return missing
}
