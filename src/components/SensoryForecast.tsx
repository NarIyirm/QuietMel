import { useEffect, useState, type CSSProperties } from 'react'
import { CloudSun, Pause, Play, X } from 'lucide-react'
import { SENSORY_FORECAST_SLOTS } from '../data/sensoryForecast'

type SensoryForecastProps = {
  active: boolean
  slotIndex: number
  onSlotChange: (slotIndex: number) => void
  onExit: () => void
}

export function SensoryForecast({
  active,
  slotIndex,
  onSlotChange,
  onExit,
}: SensoryForecastProps) {
  const [playing, setPlaying] = useState(false)
  const slot = SENSORY_FORECAST_SLOTS[slotIndex]

  useEffect(() => {
    if (!active || !playing) return
    const timer = window.setInterval(() => {
      onSlotChange((slotIndex + 1) % SENSORY_FORECAST_SLOTS.length)
    }, 1400)
    return () => window.clearInterval(timer)
  }, [active, onSlotChange, playing, slotIndex])

  if (!active) return null

  return (
    <section className="forecast-controls" aria-label="Sensory forecast controls">
      <header className="forecast-controls__header">
        <span className="forecast-controls__icon" aria-hidden="true"><CloudSun /></span>
        <div>
          <h2>Sensory Forecast</h2>
          <p>{slot.summary} · Static demo estimate</p>
        </div>
        <time dateTime={`2026-08-02T${14 + slotIndex}:00:00+10:00`}>
          <strong>{slot.time}</strong>
          <span>{slot.relativeLabel}</span>
        </time>
        <button type="button" className="forecast-controls__exit" aria-label="Exit sensory forecast" onClick={onExit}>
          <X aria-hidden="true" />
        </button>
      </header>

      <div className="forecast-controls__timeline">
        <button
          type="button"
          className="forecast-controls__play"
          aria-label={playing ? 'Pause forecast playback' : 'Play forecast timeline'}
          aria-pressed={playing}
          onClick={() => setPlaying((value) => !value)}
        >
          {playing ? <Pause aria-hidden="true" fill="currentColor" /> : <Play aria-hidden="true" fill="currentColor" />}
        </button>
        <label>
          <span className="sr-only">Forecast time</span>
          <input
            type="range"
            min="0"
            max={SENSORY_FORECAST_SLOTS.length - 1}
            step="1"
            value={slotIndex}
            style={{ '--forecast-progress': `${(slotIndex / (SENSORY_FORECAST_SLOTS.length - 1)) * 100}%` } as CSSProperties}
            aria-valuetext={`Today at ${slot.time}, ${slot.summary}`}
            onChange={(event) => onSlotChange(Number(event.target.value))}
          />
          <span className="forecast-controls__ticks" aria-hidden="true">
            <span>2 PM</span><span>5 PM</span><span>9 PM</span>
          </span>
        </label>
      </div>
    </section>
  )
}
