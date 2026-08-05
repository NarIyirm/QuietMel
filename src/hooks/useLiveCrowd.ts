import { useCallback, useEffect, useRef, useState } from 'react'

import { fetchLiveCrowd, type LiveCrowdSnapshot } from '../lib/crowd'

const REFRESH_INTERVAL_MS = 60_000
const MANUAL_REFRESH_FEEDBACK_MS = 450

export function useLiveCrowd() {
  const [snapshot, setSnapshot] = useState<LiveCrowdSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)
  const controllerRef = useRef<AbortController | null>(null)
  const requestRef = useRef<Promise<LiveCrowdSnapshot | null> | null>(null)

  const load = useCallback((force = false) => {
    if (requestRef.current) return requestRef.current
    const controller = new AbortController()
    controllerRef.current = controller
    const refreshStartedAt = Date.now()
    if (force) setRefreshing(true)

    const request = (async () => {
      try {
        const nextSnapshot = await fetchLiveCrowd(controller.signal, force)
        if (mountedRef.current) {
          setSnapshot(nextSnapshot)
          setError(null)
        }
        return nextSnapshot
      } catch (loadError) {
        if (!controller.signal.aborted && mountedRef.current) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Live pedestrian data is unavailable.',
          )
        }
        return null
      } finally {
        if (force) {
          const remainingFeedbackTime =
            MANUAL_REFRESH_FEEDBACK_MS - (Date.now() - refreshStartedAt)
          if (remainingFeedbackTime > 0) {
            await new Promise((resolve) =>
              window.setTimeout(resolve, remainingFeedbackTime),
            )
          }
        }
        requestRef.current = null
        if (!controller.signal.aborted && mountedRef.current) {
          setLoading(false)
          if (force) setRefreshing(false)
        }
      }
    })()

    requestRef.current = request
    return request
  }, [])

  useEffect(() => {
    mountedRef.current = true

    function refreshWhenVisible() {
      if (document.visibilityState === 'visible') void load()
    }

    const initialTimer = window.setTimeout(() => void load(), 0)
    const interval = window.setInterval(() => void load(), REFRESH_INTERVAL_MS)
    document.addEventListener('visibilitychange', refreshWhenVisible)

    return () => {
      mountedRef.current = false
      controllerRef.current?.abort()
      window.clearTimeout(initialTimer)
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [load])

  const refresh = useCallback(() => load(true), [load])

  return { snapshot, loading, refreshing, error, refresh }
}
