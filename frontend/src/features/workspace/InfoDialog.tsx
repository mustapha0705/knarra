import { useState } from 'react'
import { Dialog } from './Dialog'
import { ACCOUNT } from './data'
import type { InfoDialogKind } from './types'
import styles from './Workspace.module.css'

type InfoDialogProps = {
  kind: InfoDialogKind
  onClose: () => void
  onConfirm: (kind: InfoDialogKind) => void
}

type InfoContent = {
  title: string
  body?: string
  shortcuts?: { label: string; keys: string }[]
  hasForm?: boolean
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
}

const SHORTCUTS = [
  { label: 'Play or pause preview', keys: 'Space' },
  { label: 'Set In point', keys: 'I' },
  { label: 'Set Out point', keys: 'O' },
  { label: 'Zoom canvas', keys: 'Scroll' },
  { label: 'Pan canvas', keys: 'Shift + Scroll' },
  { label: 'Undo', keys: 'Ctrl / ⌘ + Z' },
]

const CONTENT: Record<InfoDialogKind, InfoContent> = {
  start: {
    title: 'Getting started',
    body: 'Create a project, drop in your photos, videos, and music, then describe the edit you want. Knarra assembles a first cut you can refine on the canvas and timeline.',
  },
  keys: {
    title: 'Keyboard shortcuts',
    body: 'Available while a project is open in the editor.',
    shortcuts: SHORTCUTS,
  },
  feedback: {
    title: 'Send feedback',
    body: 'Tell us what is working and what is not. This prototype does not send anything yet.',
    hasForm: true,
    confirmLabel: 'Send',
    cancelLabel: 'Cancel',
  },
  profile: {
    title: ACCOUNT.name,
    body: 'Prototype account. Profile details are not editable in this version.',
  },
  signout: {
    title: 'Sign out of Knarra?',
    body: 'You can sign back in at any time. Your projects stay where they are.',
    confirmLabel: 'Sign out',
    cancelLabel: 'Cancel',
    destructive: true,
  },
}

/** Shared shell for the help/account dialogs: prose, a key list, or a form. */
export function InfoDialog({ kind, onClose, onConfirm }: InfoDialogProps) {
  const [feedback, setFeedback] = useState('')
  const content = CONTENT[kind]

  return (
    <Dialog
      label={content.title}
      onDismiss={onClose}
      overlayClassName={styles.overlayInfo}
      className={styles.dialogInfo}
    >
      <div className={[styles.dialogTitle, styles.dialogTitleInfo].join(' ')}>{content.title}</div>
      {content.body && <div className={styles.infoBody}>{content.body}</div>}

      {content.shortcuts && (
        <div className={styles.shortcutList}>
          {content.shortcuts.map((shortcut) => (
            <div key={shortcut.label} className={styles.shortcutRow}>
              <span className={styles.shortcutLabel}>{shortcut.label}</span>
              <span className={styles.shortcutKeys}>{shortcut.keys}</span>
            </div>
          ))}
        </div>
      )}

      {content.hasForm && (
        <div className={styles.feedbackField}>
          <label htmlFor="knarra-feedback" className={styles.fieldLabel}>
            Your feedback
          </label>
          <textarea
            id="knarra-feedback"
            rows={4}
            placeholder="What could work better?"
            className={styles.textArea}
            value={feedback}
            onChange={(event) => setFeedback(event.target.value)}
          />
        </div>
      )}

      <div className={[styles.dialogFooter, styles.dialogFooterPlain].join(' ')}>
        <button type="button" className={styles.dialogSecondary} onClick={onClose}>
          {content.cancelLabel ?? 'Close'}
        </button>
        {content.confirmLabel && (
          <button
            type="button"
            className={[styles.dialogPrimary, content.destructive && styles.dialogPrimaryDanger]
              .filter(Boolean)
              .join(' ')}
            onClick={() => onConfirm(kind)}
          >
            {content.confirmLabel}
          </button>
        )}
      </div>
    </Dialog>
  )
}
