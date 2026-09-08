import type { ReactNode } from 'react'
import styles from './Workspace.module.css'

type DialogProps = {
  label: string
  onDismiss: () => void
  /** Extra class on the scrim, used to stack settings above create, info above both. */
  overlayClassName?: string
  className?: string
  children: ReactNode
}

/**
 * Scrim + panel. Escape is handled centrally by the page so layered dialogs
 * close in the right order; this only handles the click-outside case.
 */
export function Dialog({ label, onDismiss, overlayClassName, className, children }: DialogProps) {
  return (
    <div
      className={[styles.overlay, overlayClassName].filter(Boolean).join(' ')}
      onClick={onDismiss}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={[styles.dialog, className].filter(Boolean).join(' ')}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}
