import { useId } from 'react'

import { PulseLoader } from './PulseLoader'

type CrowdRefreshButtonProps = {
  refreshing: boolean
  onRefresh: () => void
}

function CloudRefreshIcon() {
  const id = useId().replace(/:/g, '')
  const shapeMaskId = `cloud-shapes-${id}`
  const stripeMaskId = `cloud-stripes-${id}`

  return (
    <svg
      className="crowd-refresh-button__cloud"
      viewBox="0 0 100 100"
      aria-hidden="true"
    >
      <defs>
        <mask id={shapeMaskId}>
          <g fill="white">
            <polygon points="50 37.5 80 75 20 75 50 37.5" />
            <circle cx="20" cy="60" r="15" />
            <circle cx="80" cy="60" r="15" />
            <circle cx="50" cy="47" r="23" />
          </g>
        </mask>
        <mask id={stripeMaskId}>
          <g className="crowd-refresh-button__stripes" mask={`url(#${shapeMaskId})`}>
            {Array.from({ length: 14 }, (_, index) => (
              <line
                key={index}
                x1="-35"
                y1={index * 9 - 12}
                x2="135"
                y2={index * 9 - 12}
              />
            ))}
          </g>
        </mask>
      </defs>
      <rect width="100" height="100" mask={`url(#${stripeMaskId})`} />
      <g className="crowd-refresh-button__arrows">
        <path d="M33.52 68.12c1.5-5.32 5.51-9.6 10.72-11.43 5.02-1.76 10.44-1.08 14.8 1.71l-2.8 2.13c-.79.6-.56 1.84.39 2.11l10.58 3.02c.77.22 1.54-.36 1.53-1.16l-.06-11c-.01-.99-1.14-1.55-1.93-.95l-2.71 2.06c-6.16-4.82-14.31-6.21-21.79-3.58-7.05 2.48-12.47 8.26-14.51 15.46-.45 1.59.48 3.25 2.07 3.7 1.59.45 3.26-.48 3.71-2.07Z" />
        <path d="M69.95 74.85c-1.6-.45-3.25.47-3.7 2.07-1.51 5.32-5.52 9.59-10.73 11.43-5.01 1.76-10.43 1.08-14.79-1.72l2.8-2.12c.78-.6.55-1.84-.4-2.11l-10.58-3.02c-.77-.22-1.53.36-1.53 1.16l.07 11c0 .99 1.13 1.55 1.92.95l2.71-2.06c4.09 3.2 9.05 4.89 14.12 4.89 2.57 0 5.16-.43 7.67-1.31 7.05-2.48 12.48-8.26 14.51-15.46.45-1.6-.48-3.25-2.07-3.7Z" />
      </g>
    </svg>
  )
}

export function CrowdRefreshButton({
  refreshing,
  onRefresh,
}: CrowdRefreshButtonProps) {
  return (
    <button
      type="button"
      className="crowd-refresh-button"
      aria-label={refreshing ? 'Refreshing live crowd data' : 'Refresh live crowd data'}
      title="Refresh live crowd data"
      disabled={refreshing}
      onClick={onRefresh}
    >
      {refreshing ? (
        <PulseLoader label="Refreshing live crowd data" />
      ) : (
        <CloudRefreshIcon />
      )}
    </button>
  )
}
