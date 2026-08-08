import { useEffect, useRef, useState } from 'react'
import { Activity, MapPin, X } from 'lucide-react'

import type { CrowdLayerMode } from '../lib/crowd'

type MapLayersControlProps = {
  mode: CrowdLayerMode
  sensorCount: number
  sensorLocationsAvailable: boolean
  onModeChange: (mode: CrowdLayerMode) => void
}

const OPTIONS: Array<{
  mode: CrowdLayerMode
  label: string
  description: string
}> = [
  {
    mode: 'heatmap',
    label: 'Heatmap',
    description: 'Live crowd activity',
  },
  {
    mode: 'sensors',
    label: 'Sensors',
    description: 'Locations and readings',
  },
  {
    mode: 'combined',
    label: 'Combined',
    description: 'Heatmap with pins',
  },
]

function LayerPreview({ mode }: { mode: CrowdLayerMode }) {
  return (
    <span className={`map-layer-preview map-layer-preview--${mode}`} aria-hidden="true">
      {mode !== 'sensors' ? <Activity size={24} strokeWidth={1.8} /> : null}
      {mode !== 'heatmap' ? <MapPin size={23} strokeWidth={2.2} /> : null}
    </span>
  )
}

function SensorAvailabilitySignal({ available }: { available: boolean }) {
  const points = '0.157 23.954, 14 23.954, 21.843 48, 43 0, 50 24, 64 24'

  return (
    <span
      className={`sensor-availability-signal ${available ? 'is-available' : 'is-unavailable'}`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 64 48" focusable="false">
        <polyline className="sensor-availability-signal__back" points={points} />
        <polyline className="sensor-availability-signal__front" points={points} />
      </svg>
    </span>
  )
}

export function MapLayersControl({
  mode,
  sensorCount,
  sensorLocationsAvailable,
  onModeChange,
}: MapLayersControlProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    function closeWhenOutside(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('pointerdown', closeWhenOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeWhenOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  return (
    <div className="map-layers-control" data-tour="layers" ref={rootRef}>
      <button
        type="button"
        className={`layers-button${open ? ' layers-button--open' : ''}`}
        aria-label="Choose map layers"
        aria-expanded={open}
        aria-controls="map-layers-panel"
        onClick={() => setOpen((current) => !current)}
      >
        <span className="layers-button__bar layers-button__bar--first" />
        <span className="layers-button__bar layers-button__bar--second" />
        <span className="layers-button__bar layers-button__bar--third" />
      </button>

      {open ? (
        <section
          id="map-layers-panel"
          className="map-layers-panel"
          role="dialog"
          aria-modal="false"
          aria-labelledby="map-layers-title"
        >
          <header className="map-layers-panel__header">
            <div>
              <h2 id="map-layers-title">Map details</h2>
              <p>Choose how pedestrian data appears.</p>
            </div>
            <button
              type="button"
              className="map-layers-panel__close"
              aria-label="Close map details"
              onClick={() => setOpen(false)}
            >
              <X aria-hidden="true" size={19} />
            </button>
          </header>

          <div className="map-layers-panel__options" role="radiogroup" aria-label="Crowd map display">
            {OPTIONS.map((option) => (
              <button
                key={option.mode}
                type="button"
                className="map-layer-option"
                role="radio"
                aria-checked={mode === option.mode}
                disabled={!sensorLocationsAvailable && option.mode !== 'heatmap'}
                onClick={() => onModeChange(option.mode)}
              >
                <LayerPreview mode={option.mode} />
                <strong>{option.label}</strong>
                <span>{option.description}</span>
              </button>
            ))}
          </div>

          <footer className="map-layers-panel__footer">
            <SensorAvailabilitySignal available={sensorLocationsAvailable} />
            {sensorLocationsAvailable
              ? `${sensorCount} stored sensor locations available`
              : 'Sensor locations are currently unavailable'}
          </footer>
        </section>
      ) : null}
    </div>
  )
}
