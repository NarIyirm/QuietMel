import type { CSSProperties } from 'react'
import { Clock3, Pause, Play, X } from 'lucide-react'

import type { CrowdForecastSnapshot } from '../lib/crowd'

type ForecastControlsProps = {
  snapshot: CrowdForecastSnapshot
  activeFrameIndex: number
  playing: boolean
  onFrameChange: (index: number) => void
  onPlayingChange: (playing: boolean) => void
  onClose: () => void
}

const TIME_FORMATTER = new Intl.DateTimeFormat('en-AU', {
  timeZone: 'Australia/Melbourne',
  hour: 'numeric',
  minute: '2-digit',
})
const DAY_FORMATTER = new Intl.DateTimeFormat('en-AU', {
  timeZone: 'Australia/Melbourne',
  weekday: 'short',
})

export function ForecastControls({
  snapshot,
  activeFrameIndex,
  playing,
  onFrameChange,
  onPlayingChange,
  onClose,
}: ForecastControlsProps) {
  const frame = snapshot.frames[activeFrameIndex] ?? snapshot.frames[0]
  const progress = snapshot.frames.length <= 1
    ? 0
    : (activeFrameIndex / (snapshot.frames.length - 1)) * 100
  const elapsedMinutes = activeFrameIndex * snapshot.intervalMinutes
  const elapsedLabel = elapsedMinutes === 0
    ? 'Now'
    : `+${elapsedMinutes < 60 ? `${elapsedMinutes} min` : `${(elapsedMinutes / 60).toFixed(elapsedMinutes % 60 ? 1 : 0)} hr`}`

  function togglePlayback() {
    if (activeFrameIndex >= snapshot.frames.length - 1) {
      onFrameChange(0)
      onPlayingChange(true)
      return
    }
    onPlayingChange(!playing)
  }

  return (
    <section className="forecast-controls" aria-label="Six hour crowd forecast controls">
      <header className="forecast-controls__header">
        <span className="forecast-controls__icon" aria-hidden="true">
          <Clock3 />
        </span>
        <div>
          <h2>6-hour crowd forecast</h2>
          <p>
            Historical pattern · {frame.pointCount} sensors · {snapshot.modelVersion}
          </p>
        </div>
        <time dateTime={frame.forecastAt}>
          <strong>{TIME_FORMATTER.format(new Date(frame.forecastAt))}</strong>
          <span>{DAY_FORMATTER.format(new Date(frame.forecastAt))} · {elapsedLabel}</span>
        </time>
        <button
          type="button"
          className="forecast-controls__exit"
          aria-label="Exit crowd forecast"
          onClick={onClose}
        >
          <X aria-hidden="true" />
        </button>
      </header>

      <div className="forecast-controls__timeline">
        <button
          type="button"
          className="forecast-controls__play"
          aria-label={playing ? 'Pause forecast animation' : 'Play forecast animation'}
          onClick={togglePlayback}
        >
          {playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" fill="currentColor" />}
        </button>
        <label>
          <span className="sr-only">Forecast time</span>
          <input
            type="range"
            min={0}
            max={Math.max(0, snapshot.frames.length - 1)}
            value={activeFrameIndex}
            style={{ '--forecast-progress': `${progress}%` } as CSSProperties}
            onChange={(event) => {
              onPlayingChange(false)
              onFrameChange(Number(event.currentTarget.value))
            }}
          />
          <span className="forecast-controls__ticks" aria-hidden="true">
            <span>Now</span>
            <span>+3 hr</span>
            <span>+6 hr</span>
          </span>
        </label>
      </div>
    </section>
  )
}
