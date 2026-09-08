import { useState } from 'react'
import { Dialog } from './Dialog'
import styles from './Workspace.module.css'

type RenameProjectDialogProps = {
  initialName: string
  onCancel: () => void
  onSave: (name: string) => void
}

export function RenameProjectDialog({ initialName, onCancel, onSave }: RenameProjectDialogProps) {
  const [value, setValue] = useState(initialName)
  const canSave = value.trim().length > 0

  const save = () => {
    if (canSave) onSave(value.trim())
  }

  return (
    <Dialog label="Rename project" onDismiss={onCancel} className={styles.dialogNarrow}>
      <div className={[styles.dialogTitle, styles.dialogTitleSmall].join(' ')}>Rename project</div>
      <label htmlFor="knarra-rename-input" className={styles.fieldLabel} style={{ marginTop: 18 }}>
        Project name
      </label>
      <input
        id="knarra-rename-input"
        type="text"
        autoFocus
        className={styles.textInput}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') save()
        }}
      />
      <div className={[styles.dialogFooter, styles.dialogFooterPlain].join(' ')}>
        <button type="button" className={styles.dialogSecondary} onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className={styles.dialogPrimary} disabled={!canSave} onClick={save}>
          Save
        </button>
      </div>
    </Dialog>
  )
}
