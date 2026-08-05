type PulseLoaderProps = {
  label?: string
}

export function PulseLoader({ label = 'Loading' }: PulseLoaderProps) {
  return (
    <span className="pulse-loader" role="status" aria-label={label}>
      {Array.from({ length: 6 }, (_, index) => (
        <span key={index} aria-hidden="true" />
      ))}
    </span>
  )
}
