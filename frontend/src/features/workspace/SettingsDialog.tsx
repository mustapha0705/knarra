import { useState } from 'react'
import { Dialog } from './Dialog'
import type { WorkspaceSettings } from './types'
import styles from './Workspace.module.css'

type SettingsDialogProps = {
  settings: WorkspaceSettings
  onCancel: () => void
  onSave: (settings: WorkspaceSettings) => void
}

type ToggleKey = { [K in keyof WorkspaceSettings]: WorkspaceSettings[K] extends boolean ? K : never }[keyof WorkspaceSettings]
type ChoiceKey = Exclude<keyof WorkspaceSettings, ToggleKey>

type Row =
  | { kind: 'toggle'; key: ToggleKey; label: string }
  | { kind: 'choice'; key: ChoiceKey; label: string; options: readonly string[] }

const GROUPS: { id: string; title: string; rows: Row[] }[] = [
  {
    id: 'general',
    title: 'General',
    rows: [
      { kind: 'choice', key: 'ratio', label: 'Default project aspect ratio', options: ['9:16', '16:9', '1:1'] },
      { kind: 'toggle', key: 'autosave', label: 'Autosave' },
      { kind: 'toggle', key: 'confirmTrash', label: 'Confirm before moving a project to trash' },
    ],
  },
  {
    id: 'editor',
    title: 'Editor defaults',
    rows: [
      { kind: 'choice', key: 'imageDuration', label: 'Default image duration', options: ['2s', '3s', '5s'] },
      { kind: 'choice', key: 'transition', label: 'Default transition', options: ['None', 'Fade', 'Dissolve'] },
      { kind: 'toggle', key: 'snapping', label: 'Timeline snapping' },
    ],
  },
]

/** Edits a working copy so Cancel really discards, matching the export. */
export function SettingsDialog({ settings, onCancel, onSave }: SettingsDialogProps) {
  const [draft, setDraft] = useState<WorkspaceSettings>(settings)

  return (
    <Dialog label="Settings" onDismiss={onCancel} overlayClassName={styles.overlaySettings}>
      <div className={[styles.dialogHead, styles.dialogTitle].join(' ')}>Settings</div>

      <div className={[styles.dialogBody, styles.dialogBodySettings].join(' ')}>
        {GROUPS.map((group) => (
          <div key={group.id}>
            <div className={styles.settingGroupTitle}>{group.title}</div>
            <div className={styles.settingRows}>
              {group.rows.map((row) => (
                <div key={row.key} className={styles.settingRow}>
                  <span className={styles.settingLabel}>{row.label}</span>

                  {row.kind === 'toggle' ? (
                    <button
                      type="button"
                      role="switch"
                      aria-checked={draft[row.key]}
                      aria-label={row.label}
                      className={[styles.switch, draft[row.key] && styles.switchOn].filter(Boolean).join(' ')}
                      onClick={() => setDraft((current) => ({ ...current, [row.key]: !current[row.key] }))}
                    >
                      <span className={styles.switchKnob} />
                    </button>
                  ) : (
                    <div role="group" aria-label={row.label} className={styles.choiceGroup}>
                      {row.options.map((option) => {
                        const active = draft[row.key] === option
                        return (
                          <button
                            key={option}
                            type="button"
                            aria-pressed={active}
                            className={[styles.choice, active && styles.choiceActive].filter(Boolean).join(' ')}
                            onClick={() =>
                              setDraft((current) => ({
                                ...current,
                                [row.key]: option as WorkspaceSettings[ChoiceKey],
                              }))
                            }
                          >
                            {option}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className={styles.dialogFooter}>
        <button type="button" className={styles.dialogSecondary} onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className={styles.dialogPrimary} onClick={() => onSave(draft)}>
          Save changes
        </button>
      </div>
    </Dialog>
  )
}
