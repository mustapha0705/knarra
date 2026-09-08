import type { EditPlan } from './types'
import styles from './Editor.module.css'

type PlanCardProps = {
  plan: EditPlan
  steps: string[]
  errors: string[]
  detailsOpen: boolean
  onApply: () => void
  onToggleDetails: () => void
  onCancel: () => void
}

/**
 * The review step between a typed command and the timeline changing. Nothing
 * is applied until the user says so, and blocking problems are shown in place.
 */
export function PlanCard({
  plan,
  steps,
  errors,
  detailsOpen,
  onApply,
  onToggleDetails,
  onCancel,
}: PlanCardProps) {
  const hasErrors = errors.length > 0

  return (
    <div role="region" aria-label="Proposed edit" className={styles.planCard}>
      <div className={styles.planHead}>
        <span className={styles.planTitle}>Proposed edit</span>
        <span className={styles.planNote}>local mock planner · no AI connected</span>
      </div>

      <ol className={styles.planSteps}>
        {steps.map((step, index) => (
          <li key={index} className={styles.planStep}>
            {step}
          </li>
        ))}
      </ol>

      {hasErrors && (
        <div className={styles.planErrors}>
          {errors.map((error, index) => (
            <div key={index} className={styles.planError}>
              {error}
            </div>
          ))}
        </div>
      )}

      <div className={styles.planActions}>
        <button type="button" className={styles.planApply} disabled={hasErrors} onClick={onApply}>
          Apply
        </button>
        <button type="button" className={styles.planSecondary} onClick={onToggleDetails}>
          {detailsOpen ? 'Hide details' : 'Review details'}
        </button>
        <button type="button" className={styles.planGhost} onClick={onCancel}>
          Cancel
        </button>
      </div>

      {detailsOpen && <pre className={styles.planJson}>{JSON.stringify(plan, null, 2)}</pre>}
    </div>
  )
}
