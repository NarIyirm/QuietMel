import { useCallback, useEffect, useRef, useState } from 'react'

import {
  fetchCrowdForecast,
  type CrowdForecastSnapshot,
} from '../lib/crowd'

export function useCrowdForecast() {
  const [snapshot, setSnapshot] = useState<CrowdForecastSnapshot | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestRef = useRef<AbortController | null>(null)

  const load = useCallback(async () => {
    requestRef.current?.abort()
    const controller = new AbortController()
    requestRef.current = controller
    setLoading(true)
    setError(null)

    try {
      const nextSnapshot = await fetchCrowdForecast(controller.signal)
      if (requestRef.current !== controller) return null
      setSnapshot(nextSnapshot)
      return nextSnapshot
    } catch (requestError) {
      if (controller.signal.aborted) return null
      const message = requestError instanceof Error
        ? requestError.message
        : 'Crowd forecast data is unavailable.'
      setError(message)
      return null
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null
        setLoading(false)
      }
    }
  }, [])

  const reset = useCallback(() => {
    requestRef.current?.abort()
    requestRef.current = null
    setSnapshot(null)
    setLoading(false)
    setError(null)
  }, [])

  useEffect(() => () => requestRef.current?.abort(), [])

  return { snapshot, loading, error, load, reset }
}
