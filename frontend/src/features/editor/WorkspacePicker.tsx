import { useState } from 'react'
import { CloseIcon } from '../../components/icons'
import { WORKSPACE_MEDIA } from '../../assets/media'
import styles from './Editor.module.css'

type WorkspacePickerProps = {
  onClose: () => void
  onConfirm: (picks: { name: string; src: string }[]) => void
}

/** Multi-select over the bundled sample library, added to the canvas on confirm. */
export function WorkspacePicker({ onClose, onConfirm }: WorkspacePickerProps) {
  const [picked, setPicked] = useState<string[]>([])

  const toggle = (src: string) =>
    setPicked((current) =>
      current.includes(src) ? current.filter((entry) => entry !== src) : [...current, src],
    )

  return (
    <div className={styles.pickerOverlay} onClick={onClose}>
      <div
        role="dialog"
        aria-label="Add from workspace"
        className={styles.pickerDialog}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.pickerHead}>
          <span className={styles.pickerTitle}>Add from workspace</span>
          <div className={styles.toolbarSpacer} />
          <button type="button" aria-label="Close" className={styles.pickerClose} onClick={onClose}>
            <CloseIcon size={14} strokeWidth={2} />
          </button>
        </div>

        <div className={styles.pickerGrid}>
          {WORKSPACE_MEDIA.map((item) => {
            const active = picked.includes(item.src)
            return (
              <button
                key={item.src}
                type="button"
                aria-pressed={active}
                aria-label={`Add ${item.name}`}
                className={[styles.pickerItem, active && styles.pickerItemActive].filter(Boolean).join(' ')}
                onClick={() => toggle(item.src)}
              >
                <div className={styles.pickerThumb}>
                  <img src={item.src} alt="" loading="lazy" />
                </div>
                <div className={styles.pickerName}>{item.name}</div>
              </button>
            )
          })}
        </div>

        <div className={styles.pickerFoot}>
          <span className={styles.pickerCount}>{picked.length} selected</span>
          <div className={styles.toolbarSpacer} />
          <button
            type="button"
            className={styles.pickerConfirm}
            onClick={() => onConfirm(WORKSPACE_MEDIA.filter((item) => picked.includes(item.src)))}
          >
            Add to canvas
          </button>
        </div>
      </div>
    </div>
  )
}
