import type { Project } from './types'
import styles from './Workspace.module.css'

export type ProjectActionHandlers = {
  onOpen: (project: Project) => void
  onRename: (project: Project) => void
  onDuplicate: (project: Project) => void
  onArchive: (project: Project) => void
  onTrash: (project: Project) => void
}

type ProjectActionsMenuProps = {
  project: Project
  /** Extra positioning class — the card floats its menu, the row anchors it. */
  className?: string
  actions: ProjectActionHandlers
}

export function ProjectActionsMenu({ project, className, actions }: ProjectActionsMenuProps) {
  const items = [
    { id: 'open', label: 'Open project', run: () => actions.onOpen(project) },
    { id: 'rename', label: 'Rename', run: () => actions.onRename(project) },
    { id: 'duplicate', label: 'Duplicate', run: () => actions.onDuplicate(project) },
    { id: 'archive', label: 'Archive', run: () => actions.onArchive(project) },
    { id: 'trash', label: 'Move to trash', run: () => actions.onTrash(project), danger: true },
  ]

  return (
    <div
      role="menu"
      aria-label="Project actions"
      className={[styles.menu, styles.cardMenu, className].filter(Boolean).join(' ')}
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="menuitem"
          className={[
            styles.menuItem,
            item.danger && styles.menuItemDivided,
            item.danger && styles.menuItemDanger,
          ]
            .filter(Boolean)
            .join(' ')}
          onClick={item.run}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}
