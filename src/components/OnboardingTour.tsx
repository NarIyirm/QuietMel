import { useLayoutEffect, useState } from 'react'
import { X } from 'lucide-react'

type TourStep = { target: string; title: string; body: string }

const steps: TourStep[] = [
  { target: 'route-search', title: 'Plan a walk', body: 'Search for a start and destination to compare quieter walking routes.' },
  { target: 'layers', title: 'Choose map details', body: 'Switch between the heatmap, sensor locations, or both together.' },
  { target: 'refresh', title: 'Refresh live activity', body: 'Request the latest pedestrian readings whenever you need them.' },
  { target: 'nearby-quiet', title: 'Find quiet nearby', body: 'Use your location to take the fastest walk to the nearest low-activity area.' },
  { target: 'locate', title: 'Your location', body: 'Return the map to your current position at any time.' },
]

type OnboardingTourProps = { open: boolean; onClose: () => void }

export function OnboardingTour({ open, onClose }: OnboardingTourProps) {
  const [step, setStep] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const active = steps[step]

  useLayoutEffect(() => {
    if (!open) return
    const update = () => setRect(document.querySelector(`[data-tour="${active.target}"]`)?.getBoundingClientRect() ?? null)
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => { window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true) }
  }, [active.target, open])

  if (!open || !rect) return null
  const cardHeight = 202
  const cardTop = rect.bottom + 16 + cardHeight > window.innerHeight ? Math.max(16, rect.top - cardHeight - 16) : rect.bottom + 16
  const cardLeft = Math.max(16, Math.min(rect.left, window.innerWidth - 336))

  return (
    <div className="onboarding-tour" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      <span className="onboarding-tour__shade" aria-hidden="true" />
      <span className="onboarding-tour__highlight" aria-hidden="true" style={{ top: rect.top - 5, left: rect.left - 5, width: rect.width + 10, height: rect.height + 10 }} />
      <section className="onboarding-tour__card" style={{ top: cardTop, left: cardLeft }}>
        <button type="button" aria-label="Close tutorial" onClick={onClose}><X aria-hidden="true" /></button>
        <span>{step + 1} of {steps.length}</span>
        <h2 id="tour-title">{active.title}</h2>
        <p>{active.body}</p>
        <footer>
          <button type="button" onClick={onClose}>Skip</button>
          <button type="button" className="onboarding-tour__next" onClick={() => step === steps.length - 1 ? onClose() : setStep((value) => value + 1)}>
            {step === steps.length - 1 ? 'Finish' : 'Next'}
          </button>
        </footer>
      </section>
    </div>
  )
}
