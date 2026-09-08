type KnarraMarkProps = {
  /** Rendered box in px. The mark stays legible down to 16. */
  size?: number
  /** Stroke colour. The logo system is single-colour by design. */
  color?: string
  /** Accessible name; omit for a purely decorative mark. */
  label?: string
}

/**
 * The Knarra monogram: a 24x24 geometric K where the vertical stroke reads as
 * a timeline playhead and the two angled strokes open rightward into a
 * forward-motion wedge. Geometry and 3.1 stroke width come straight from the
 * logo sheet in the design export.
 */
export function KnarraMark({ size = 24, color = 'var(--ws-brand)', label }: KnarraMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={3.1}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? 'img' : 'presentation'}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <path d="M6.1 3.6V20.4" />
      <path d="M10 12.05 17.4 4" />
      <path d="M10 12.05 17.4 20.1" />
    </svg>
  )
}
