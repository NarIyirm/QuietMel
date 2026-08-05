import { useEffect, useState } from 'react'

import {
  fetchPedestrianSensors,
  type PedestrianSensorCatalogue,
} from '../lib/crowd'

export function usePedestrianSensors() {
  const [catalogue, setCatalogue] = useState<PedestrianSensorCatalogue | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      void fetchPedestrianSensors(controller.signal)
        .then((nextCatalogue) => {
          setCatalogue(nextCatalogue)
          setError(null)
        })
        .catch((loadError: unknown) => {
          if (controller.signal.aborted) return
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Pedestrian sensor locations are unavailable.',
          )
        })
    }, 0)

    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [])

  return { catalogue, error }
}
