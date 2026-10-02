/** Hand-rolled 20×20 stroke icons. A few shapes are not worth an icon
 *  dependency, and emoji would render differently on every machine — a bad
 *  trait for the thing that signals whether a lesson is locked. */

interface IconProps {
  className?: string
}

const STROKE = {
  fill: 'none' as const,
  stroke: 'currentColor' as const,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

/** Lesson completed. */
export function CheckIcon({ className = 'size-4' }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" strokeWidth={2.2} aria-hidden="true" className={className} {...STROKE}>
      <path d="M4.5 10.5 8 14l7.5-8" />
    </svg>
  )
}

/** Lesson locked behind the previous one. */
export function LockIcon({ className = 'size-4' }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" strokeWidth={1.7} aria-hidden="true" className={className} {...STROKE}>
      <rect x="4.5" y="8.5" width="11" height="7.5" rx="1.8" />
      <path d="M7.25 8.5V6.75a2.75 2.75 0 0 1 5.5 0V8.5" />
    </svg>
  )
}

/** Lesson unlocked and not yet finished. */
export function CurrentIcon({ className = 'size-4' }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className={className}>
      <circle cx="10" cy="10" r="6.5" stroke="currentColor" strokeWidth={1.7} />
      <circle cx="10" cy="10" r="2.9" fill="currentColor" />
    </svg>
  )
}

export function FileIcon({ className = 'size-4' }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" strokeWidth={1.6} aria-hidden="true" className={className} {...STROKE}>
      <path d="M11.5 2.5H6A1.5 1.5 0 0 0 4.5 4v12A1.5 1.5 0 0 0 6 17.5h8a1.5 1.5 0 0 0 1.5-1.5V6.5z" />
      <path d="M11.5 2.5v4h4" />
    </svg>
  )
}

/** The AI tutor. */
export function SparkIcon({ className = 'size-4' }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" strokeWidth={1.6} aria-hidden="true" className={className} {...STROKE}>
      <path d="M10 2.5l1.6 4.3 4.4 1.7-4.4 1.7L10 14.5 8.4 10.2 4 8.5l4.4-1.7z" />
      <path d="M15.5 13.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" />
    </svg>
  )
}

export function BackIcon({ className = 'size-4' }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" strokeWidth={1.8} aria-hidden="true" className={className} {...STROKE}>
      <path d="M11.5 5.5 7 10l4.5 4.5" />
    </svg>
  )
}
