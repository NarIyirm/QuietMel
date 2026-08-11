import { useEffect, useLayoutEffect, useRef } from 'react'
import { MapPinned, TriangleAlert, X } from 'lucide-react'

export type LocationToast = {
  id: number
  message: string
}

type LocationToastStackProps = {
  toasts: LocationToast[]
  onDismiss: (id: number) => void
}

export function LocationToastStack({ toasts, onDismiss }: LocationToastStackProps) {
  const toastElementsRef = useRef(new Map<number, HTMLElement>())
  const previousPositionsRef = useRef(new Map<number, number>())
  const reflowAnimationsRef = useRef(new Map<number, Animation>())

  useLayoutEffect(() => {
    const nextPositions = new Map<number, number>()
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    for (const toast of toasts) {
      const element = toastElementsRef.current.get(toast.id)
      if (!element) continue

      const currentTop = element.getBoundingClientRect().top
      const previousTop = previousPositionsRef.current.get(toast.id)
      nextPositions.set(toast.id, currentTop)

      if (reduceMotion || previousTop === undefined) continue
      const offset = previousTop - currentTop
      if (Math.abs(offset) < 1) continue

      reflowAnimationsRef.current.get(toast.id)?.cancel()
      const animation = element.animate(
        [
          { transform: `translateY(${offset}px)` },
          { transform: 'translateY(0)' },
        ],
        {
          duration: 280,
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
        },
      )
      reflowAnimationsRef.current.set(toast.id, animation)
      animation.onfinish = () => {
        if (reflowAnimationsRef.current.get(toast.id) === animation) {
          reflowAnimationsRef.current.delete(toast.id)
        }
      }
    }

    previousPositionsRef.current = nextPositions
  }, [toasts])

  useEffect(() => () => {
    for (const animation of reflowAnimationsRef.current.values()) animation.cancel()
    reflowAnimationsRef.current.clear()
  }, [])

  if (toasts.length === 0) return null

  return (
    <section className="location-toast-stack" aria-label="Location notifications" aria-live="assertive">
      {toasts.map((toast) => (
        <article
          key={toast.id}
          ref={(element) => {
            if (element) toastElementsRef.current.set(toast.id, element)
            else toastElementsRef.current.delete(toast.id)
          }}
          className="location-toast"
          role="alert"
        >
          <span className="location-toast__icon" aria-hidden="true">
            <TriangleAlert size={19} />
          </span>
          <div>
            <strong>Location unavailable</strong>
            <p>{toast.message}</p>
            <span className="location-toast__alternative">
              <MapPinned aria-hidden="true" size={13} />
              Choose an area on the map instead.
            </span>
          </div>
          <button
            type="button"
            aria-label="Dismiss location notification"
            onClick={() => onDismiss(toast.id)}
          >
            <X aria-hidden="true" size={15} />
          </button>
          <span className="location-toast__timer" aria-hidden="true" />
        </article>
      ))}
    </section>
  )
}
