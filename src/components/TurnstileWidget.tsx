import { useEffect, useRef } from 'react'

type TurnstileApi = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string
      action: string
      appearance: 'always'
      size: 'compact' | 'flexible'
      theme: 'light'
      callback: (token: string) => void
      'expired-callback': () => void
      'timeout-callback': () => void
      'error-callback': (errorCode: string) => boolean
    },
  ) => string
  remove: (widgetId: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

let scriptPromise: Promise<void> | undefined

function loadTurnstileScript() {
  if (window.turnstile) return Promise.resolve()
  if (scriptPromise) return scriptPromise

  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-quietmel-turnstile]')
    const script = existing ?? document.createElement('script')

    function handleLoad() {
      if (window.turnstile) resolve()
      else reject(new Error('Turnstile loaded without an API.'))
    }

    script.addEventListener('load', handleLoad, { once: true })
    script.addEventListener('error', () => reject(new Error('Turnstile could not be loaded.')), {
      once: true,
    })

    if (!existing) {
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
      script.async = true
      script.defer = true
      script.dataset.quietmelTurnstile = 'true'
      document.head.append(script)
    }
  })

  return scriptPromise
}

type TurnstileWidgetProps = {
  action: 'login' | 'register'
  resetKey: number
  siteKey: string
  onError: (message: string) => void
  onToken: (token: string | null) => void
}

export function TurnstileWidget({
  action,
  resetKey,
  siteKey,
  onError,
  onToken,
}: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    let widgetId: string | undefined
    onToken(null)

    void loadTurnstileScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return

        widgetId = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          action,
          appearance: 'always',
          size: window.matchMedia('(max-width: 340px)').matches ? 'compact' : 'flexible',
          theme: 'light',
          callback: (token) => onToken(token),
          'expired-callback': () => onToken(null),
          'timeout-callback': () => {
            onToken(null)
            onError('Security check timed out. Please complete it again.')
          },
          'error-callback': (errorCode) => {
            onToken(null)
            onError(
              errorCode.startsWith('110') || errorCode === '400020'
                ? 'Security check configuration is invalid. Please contact support.'
                : 'Security check failed to load. Please refresh and try again.',
            )
            return true
          },
        })
      })
      .catch(() => {
        if (!cancelled) onError('Security check is unavailable. Check your connection and try again.')
      })

    return () => {
      cancelled = true
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId)
    }
  }, [action, onError, onToken, resetKey, siteKey])

  return <div className="turnstile-widget" ref={containerRef} aria-label="Security check" />
}
