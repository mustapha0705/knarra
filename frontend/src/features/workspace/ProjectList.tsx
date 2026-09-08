import { DotsIcon } from '../../components/icons'
import { THUMBS } from '../../assets/media'
import { STATUS, editedAgo } from './data'
import { ProjectActionsMenu, type ProjectActionHandlers } from './ProjectActionsMenu'
import type { Project } from './types'
import styles from './Workspace.module.css'

type ProjectListProps = {
  projects: Project[]
  menuFor: string | null
  onToggleMenu: (id: string) => void
  actions: ProjectActionHandlers
}

const COLUMNS = ['Preview', 'Project', 'Status', 'Last edited', 'Duration', 'Ratio', 'Assets', '']

export function ProjectList({ projects, menuFor, onToggleMenu, actions }: ProjectListProps) {
  return (
    <div className={styles.list}>
      <div className={styles.listHead}>
        {COLUMNS.map((column, index) => (
          <span key={column || `spacer-${index}`}>{column}</span>
        ))}
      </div>

      {projects.map((project) => {
        const status = STATUS[project.status]
        const menuOpen = menuFor === project.id
        const thumb =
          project.kind === 'placeholder'
            ? undefined
            : `url("${project.kind === 'single' ? THUMBS.submitGame : THUMBS.gameDetail}")`

        return (
          <div
            key={project.id}
            className={[styles.row, menuOpen && styles.rowMenuOpen].filter(Boolean).join(' ')}
          >
            <button
              type="button"
              aria-label={`Open ${project.title}`}
              className={styles.rowFields}
              onClick={() => actions.onOpen(project)}
            >
              <div className={styles.rowThumb} style={thumb ? { backgroundImage: thumb } : undefined} />
              <span className={styles.rowTitle}>{project.title}</span>
              <span className={styles.rowStatus} style={{ background: status.bg, color: status.fg }}>
                {project.status === 'rendering' ? `${status.label} ${project.progress ?? 0}%` : status.label}
              </span>
              <span className={[styles.rowCell, styles.rowCellClamp].join(' ')}>
                {editedAgo(project.editedAt)}
              </span>
              <span className={styles.rowCell}>{project.duration}</span>
              <span className={styles.rowCell}>{project.ratio}</span>
              <span className={styles.rowCell}>{project.assets} assets</span>
            </button>

            <div className={styles.rowMenuAnchor}>
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label={`Actions for ${project.title}`}
                title="More actions"
                className={styles.rowDots}
                onClick={() => onToggleMenu(project.id)}
              >
                <DotsIcon />
              </button>
              {menuOpen && <ProjectActionsMenu project={project} actions={actions} />}
            </div>
          </div>
        )
      })}
    </div>
  )
}
