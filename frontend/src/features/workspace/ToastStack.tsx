import type { Toast } from './types'
import styles from './Workspace.module.css'

type ToastStackProps = {
  toasts: Toast[]
  onUndo: (toast: Toast) => void
}

export function ToastStack({ toasts, onUndo }: ToastStackProps) {
  return (
    <div className={styles.toastStack}>
      {toasts.map((toast) => (
        <div key={toast.id} role="status" className={styles.toast}>
          <span className={styles.toastText}>{toast.text}</span>
          {toast.onUndo && (
            <button type="button" className={styles.toastUndo} onClick={() => onUndo(toast)}>
              Undo
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
