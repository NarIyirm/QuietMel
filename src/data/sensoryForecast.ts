import type { SensoryPressurePoint } from './sensoryPressure'

export type SensoryForecastSlot = {
  time: string
  relativeLabel: string
  summary: string
  factor: number
  offset: number
}

export const SENSORY_FORECAST_SLOTS: SensoryForecastSlot[] = [
  { time: '2:00 PM', relativeLabel: 'Now', summary: 'Moderate activity', factor: 0.82, offset: -4 },
  { time: '3:00 PM', relativeLabel: '+1 hr', summary: 'Activity increasing', factor: 0.9, offset: -2 },
  { time: '4:00 PM', relativeLabel: '+2 hrs', summary: 'Busy in the city centre', factor: 1, offset: 0 },
  { time: '5:00 PM', relativeLabel: '+3 hrs', summary: 'Evening peak expected', factor: 1.08, offset: 4 },
  { time: '6:00 PM', relativeLabel: '+4 hrs', summary: 'High transport activity', factor: 1.04, offset: 2 },
  { time: '7:00 PM', relativeLabel: '+5 hrs', summary: 'Activity easing', factor: 0.91, offset: -1 },
  { time: '8:00 PM', relativeLabel: '+6 hrs', summary: 'Quieter streets expected', factor: 0.76, offset: -4 },
  { time: '9:00 PM', relativeLabel: '+7 hrs', summary: 'Low overall activity', factor: 0.62, offset: -6 },
]

const GREEN_SPACE_IDS = new Set([
  'fitzroy-gardens',
  'carlton-gardens',
  'birrarung-marr',
  'royal-botanic-north',
  'royal-botanic-south',
  'royal-park-edge',
])

export function getForecastPressure(point: SensoryPressurePoint, slotIndex: number) {
  const slot = SENSORY_FORECAST_SLOTS[slotIndex] ?? SENSORY_FORECAST_SLOTS[0]
  const stableVariation = point.id
    .split('')
    .reduce((sum, character) => sum + character.charCodeAt(0), slotIndex * 7) % 9 - 4
  const greenSpaceAdjustment = GREEN_SPACE_IDS.has(point.id)
    ? slotIndex < 4 ? 5 : -4
    : 0
  return Math.round(Math.min(100, Math.max(6,
    point.pressure * slot.factor + slot.offset + stableVariation + greenSpaceAdjustment,
  )))
}

