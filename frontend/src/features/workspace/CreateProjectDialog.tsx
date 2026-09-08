import { useRef, useState, type CSSProperties } from 'react'
import { Dialog } from './Dialog'
import type { AspectRatio } from './types'
import styles from './Workspace.module.css'

type CreateProjectDialogProps = {
  defaultRatio: AspectRatio
  onCancel: () => void
  onCreate: (name: string, ratio: AspectRatio) => void
}

const RATIOS: { key: AspectRatio; label: string; frame: CSSProperties }[] = [
  { key: '9:16', label: 'Vertical', frame: { height: 38, aspectRatio: '9 / 16' } },
  { key: '16:9', label: 'Landscape', frame: { width: 52, aspectRatio: '16 / 9' } },
  { key: '1:1', label: 'Square', frame: { height: 38, aspectRatio: '1 / 1' } },
]

export function CreateProjectDialog({ defaultRatio, onCancel, onCreate }: CreateProjectDialogProps) {
  const [name, setName] = useState('')
  const [ratio, setRatio] = useState<AspectRatio>(defaultRatio)
  const [nameTouched, setNameTouched] = useState(false)
  const [picked, setPicked] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)
  const folderInput = useRef<HTMLInputElement>(null)

  const nameOk = name.trim().length > 0

  const submit = () => {
    if (!nameOk) {
      setNameTouched(true)
      return
    }
    onCreate(name.trim(), ratio)
  }

  const openPicker = (input: HTMLInputElement | null) => {
    if (!input) return
    input.value = ''
    input.click()
  }

  const onPicked = (event: React.ChangeEvent<HTMLInputElement>) => {
    const count = event.target.files?.length ?? 0
    event.target.value = ''
    if (count) setPicked(`${count} ${count === 1 ? 'file' : 'files'} ready to import`)
  }

  return (
    <Dialog label="Create a new project" onDismiss={onCancel}>
      <div className={styles.dialogHead}>
        <div className={styles.dialogTitle}>Create a new project</div>
        <div className={styles.dialogLead}>
          Set up your project now. You can add or change media at any time.
        </div>
      </div>

      <div className={styles.dialogBody}>
        <div>
          <label htmlFor="knarra-project-name" className={styles.fieldLabel}>
            Project name
          </label>
          <input
            id="knarra-project-name"
            type="text"
            autoFocus
            placeholder="Untitled project"
            className={styles.textInput}
            value={name}
            onChange={(event) => {
              setName(event.target.value)
              setNameTouched(true)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && nameOk) submit()
            }}
          />
          {nameTouched && !nameOk && (
            <div className={styles.fieldError}>Enter a name to create the project.</div>
          )}
        </div>

        <div>
          <span className={styles.fieldLabel}>Aspect ratio</span>
          <div role="radiogroup" aria-label="Aspect ratio" className={styles.ratioGroup}>
            {RATIOS.map((option) => {
              const active = ratio === option.key
              return (
                <button
                  key={option.key}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  className={[styles.ratioOption, active && styles.ratioOptionActive].filter(Boolean).join(' ')}
                  onClick={() => setRatio(option.key)}
                >
                  <div className={styles.ratioFrame} style={option.frame} />
                  <span className={styles.ratioLabel}>{option.label}</span>
                  <span className={styles.ratioValue}>{option.key}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div className={styles.dropZone}>
          <span className={styles.dropTitle}>Drop photos, videos, audio, or a folder here</span>
          <span className={styles.dropHint}>You can also add media later from the editor.</span>
          <div className={styles.dropActions}>
            <button type="button" className={styles.dropButton} onClick={() => openPicker(fileInput.current)}>
              Browse files
            </button>
            <button type="button" className={styles.dropButton} onClick={() => openPicker(folderInput.current)}>
              Browse folder
            </button>
          </div>
          {picked && <div className={styles.dropPicked}>{picked}</div>}
        </div>
      </div>

      <div className={styles.dialogFooter}>
        <button type="button" className={styles.dialogSecondary} onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className={styles.dialogPrimary} disabled={!nameOk} onClick={submit}>
          Create project
        </button>
      </div>

      <input
        ref={fileInput}
        type="file"
        multiple
        accept="image/*,video/*,audio/*"
        className={styles.visuallyHiddenInput}
        tabIndex={-1}
        aria-hidden="true"
        onChange={onPicked}
      />
      <input
        ref={folderInput}
        type="file"
        multiple
        webkitdirectory=""
        directory=""
        className={styles.visuallyHiddenInput}
        tabIndex={-1}
        aria-hidden="true"
        onChange={onPicked}
      />
    </Dialog>
  )
}
