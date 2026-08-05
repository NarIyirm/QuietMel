import {
  CheckCircle2,
  Eye,
  EyeOff,
  LockKeyhole,
  LogIn,
  Mail,
  UserPlus,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'

import {
  loginWithEmail,
  registerWithEmail,
  saveStoredAuth,
  type StoredAuth,
} from '../lib/auth'
import { PulseLoader } from './PulseLoader'
import { TurnstileWidget } from './TurnstileWidget'

type AuthMode = 'login' | 'register'

type AuthPanelProps = {
  auth: StoredAuth | null
  initialMode: AuthMode
  open: boolean
  onAuthenticated: (auth: StoredAuth) => void
  onClose: () => void
}

const LOCAL_TEST_SITE_KEY = '1x00000000000000000000AA'
const TURNSTILE_SITE_KEY =
  import.meta.env.VITE_TURNSTILE_SITE_KEY || (import.meta.env.DEV ? LOCAL_TEST_SITE_KEY : '')

function friendlyAuthMessage(message: string) {
  const normalized = message.toLocaleLowerCase()
  if (normalized.includes('invalid login credentials')) return 'Email or password is incorrect.'
  if (normalized.includes('email not confirmed')) return 'Confirm your email before logging in.'
  if (normalized.includes('already registered')) return 'An account already exists for this email.'
  if (normalized.includes('timeout-or-duplicate') || normalized.includes('expired')) {
    return 'Security check expired. Please complete it again.'
  }
  if (normalized.includes('invalid-input-response')) {
    return 'Security check could not be verified. Please refresh and try again.'
  }
  if (normalized.includes('captcha')) {
    return 'Security check failed. Please complete it again.'
  }
  if (normalized.includes('password')) return message
  if (import.meta.env.DEV) return message
  return 'We could not complete that request. Please try again.'
}

export function AuthPanel({
  auth,
  initialMode,
  open,
  onAuthenticated,
  onClose,
}: AuthPanelProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  const [mode, setMode] = useState<AuthMode>(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const [turnstileResetKey, setTurnstileResetKey] = useState(0)
  const [errorMessage, setErrorMessage] = useState('')
  const [confirmationEmail, setConfirmationEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleTurnstileToken = useCallback((token: string | null) => {
    setTurnstileToken(token)
  }, [])

  const handleTurnstileError = useCallback((message: string) => {
    setErrorMessage(message)
  }, [])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (open && !dialog.open) {
      dialog.showModal()
      window.setTimeout(() => emailRef.current?.focus(), 0)
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  function closePanel() {
    setMode('login')
    setPassword('')
    setShowPassword(false)
    setErrorMessage('')
    setConfirmationEmail('')
    setTurnstileToken(null)
    onClose()
  }

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode)
    setPassword('')
    setErrorMessage('')
    setConfirmationEmail('')
    setTurnstileToken(null)
    setTurnstileResetKey((key) => key + 1)
    window.setTimeout(() => emailRef.current?.focus(), 0)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!TURNSTILE_SITE_KEY) {
      setErrorMessage('Turnstile is not configured for this environment.')
      return
    }
    if (!turnstileToken) {
      setErrorMessage('Complete the security check before continuing.')
      return
    }

    setSubmitting(true)
    setErrorMessage('')

    try {
      if (mode === 'register') {
        const result = await registerWithEmail(email.trim(), password, turnstileToken)
        if (result.auth) {
          saveStoredAuth(result.auth)
          onAuthenticated(result.auth)
          closePanel()
        } else if (result.emailConfirmationRequired) {
          setConfirmationEmail(email.trim())
        }
      } else {
        const result = await loginWithEmail(email.trim(), password, turnstileToken)
        if (!result) throw new Error('No session returned')
        saveStoredAuth(result)
        onAuthenticated(result)
        closePanel()
      }
    } catch (error) {
      setErrorMessage(friendlyAuthMessage(error instanceof Error ? error.message : 'Unknown error'))
    } finally {
      setSubmitting(false)
      setTurnstileToken(null)
      setTurnstileResetKey((key) => key + 1)
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="auth-dialog"
      aria-labelledby="auth-title"
      onCancel={(event) => {
        event.preventDefault()
        closePanel()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) closePanel()
      }}
    >
      <div className="auth-dialog__surface">
        <header className="auth-dialog__header">
          <div>
            <span className="auth-dialog__brand">QuietMel account</span>
            <h2 id="auth-title">
              {auth ? 'Account settings' : confirmationEmail ? 'Check your inbox' : mode === 'login' ? 'Welcome back' : 'Create your account'}
            </h2>
          </div>
          <button type="button" className="auth-dialog__close" aria-label="Close account panel" onClick={closePanel}>
            <X aria-hidden="true" />
          </button>
        </header>

        {auth ? (
          <div className="auth-account">
            <div className="auth-account__identity">
              <span aria-hidden="true">{auth.user.email?.charAt(0).toLocaleUpperCase() ?? 'Q'}</span>
              <div>
                <strong>{auth.user.email ?? 'QuietMel user'}</strong>
                <small>Signed in on this device</small>
              </div>
            </div>
            {errorMessage ? <p className="auth-message auth-message--error" role="alert">{errorMessage}</p> : null}
            <div className="auth-account__actions">
              <button type="button" className="auth-button auth-button--secondary" onClick={closePanel}>Return to map</button>
            </div>
          </div>
        ) : confirmationEmail ? (
          <div className="auth-confirmation">
            <CheckCircle2 aria-hidden="true" />
            <p>We sent a confirmation link to <strong>{confirmationEmail}</strong>.</p>
            <span>Open the link, then return here to log in.</span>
            <button type="button" className="auth-button auth-button--primary" onClick={() => switchMode('login')}>Go to log in</button>
          </div>
        ) : (
          <>
            <div className="auth-mode-switch" role="group" aria-label="Account action">
              <button type="button" aria-pressed={mode === 'login'} onClick={() => switchMode('login')}>Log in</button>
              <button type="button" aria-pressed={mode === 'register'} onClick={() => switchMode('register')}>Create account</button>
            </div>

            <form className="auth-form" onSubmit={(event) => void handleSubmit(event)}>
              <div className="auth-field">
                <label htmlFor="auth-email">Email</label>
                <div className="auth-field__control">
                  <Mail aria-hidden="true" />
                  <input
                    id="auth-email"
                    ref={emailRef}
                    type="email"
                    value={email}
                    autoComplete="email"
                    placeholder="you@example.com"
                    required
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </div>
              </div>

              <div className="auth-field">
                <label htmlFor="auth-password">Password</label>
                <div className="auth-field__control">
                  <LockKeyhole aria-hidden="true" />
                  <input
                    id="auth-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    placeholder={mode === 'register' ? 'At least 8 characters' : 'Enter your password'}
                    minLength={8}
                    maxLength={128}
                    required
                    onChange={(event) => setPassword(event.target.value)}
                  />
                  <button
                    type="button"
                    className="auth-field__reveal"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    onClick={() => setShowPassword((visible) => !visible)}
                  >
                    {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                  </button>
                </div>
              </div>

              {mode === 'register' ? <p className="auth-form__hint">Use 8 or more characters. You may need to confirm your email.</p> : null}

              {TURNSTILE_SITE_KEY ? (
                <TurnstileWidget
                  action={mode}
                  resetKey={turnstileResetKey}
                  siteKey={TURNSTILE_SITE_KEY}
                  onError={handleTurnstileError}
                  onToken={handleTurnstileToken}
                />
              ) : (
                <p className="auth-message auth-message--error" role="alert">Turnstile site key is missing.</p>
              )}

              {errorMessage ? <p className="auth-message auth-message--error" role="alert">{errorMessage}</p> : null}

              <button type="submit" className="auth-button auth-button--primary" disabled={submitting || !turnstileToken}>
                {submitting ? (
                  <PulseLoader label={mode === 'login' ? 'Logging in' : 'Creating account'} />
                ) : mode === 'login' ? (
                  <LogIn aria-hidden="true" />
                ) : (
                  <UserPlus aria-hidden="true" />
                )}
                {submitting ? (mode === 'login' ? 'Logging in…' : 'Creating account…') : mode === 'login' ? 'Log in' : 'Create account'}
              </button>
            </form>
          </>
        )}
      </div>
    </dialog>
  )
}
