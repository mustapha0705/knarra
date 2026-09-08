import type { CSSProperties } from 'react'
import { KnarraMark } from '../../components/KnarraMark'
import { DotsIcon } from '../../components/icons'
import { THUMBS } from '../../assets/media'
import { STATUS, editedAgo } from './data'
import { ProjectActionsMenu, type ProjectActionHandlers } from './ProjectActionsMenu'
import type { AspectRatio, Project } from './types'
import styles from './Workspace.module.css'

type ProjectCardProps = {
  project: Project
  menuOpen: boolean
  onToggleMenu: () => void
  actions: ProjectActionHandlers
}

/**
 * The stacked-paper placeholder scales with the project's aspect ratio, so a
 * vertical project reads as vertical even before anything is rendered.
 */
function placeholderSizes(ratio: AspectRatio) {
  const vertical = ratio === '9:16'
  const frame: CSSProperties = vertical
    ? { height: '74%', aspectRatio: '9 / 16' }
    : ratio === '1:1'
      ? { height: '74%', aspectRatio: '1 / 1' }
      : { width: '64%', aspectRatio: '16 / 9' }
  const back: CSSProperties = vertical
    ? { height: '62%', aspectRatio: '9 / 16' }
    : { width: '54%', aspectRatio: '16 / 9' }
  const mid: CSSProperties = vertical
    ? { height: '66%', aspectRatio: '9 / 16' }
    : { width: '58%', aspectRatio: '16 / 9' }
  return { frame, back, mid }
}

export function ProjectCard({ project, menuOpen, onToggleMenu, actions }: ProjectCardProps) {
  const status = STATUS[project.status]
  const isRendering = project.status === 'rendering'
  const sizes = placeholderSizes(project.ratio)

  return (
    <div className={[styles.card, menuOpen && styles.cardMenuOpen].filter(Boolean).join(' ')}>
      <button
        type="button"
        aria-label={`Open ${project.title}`}
        className={styles.cardOpen}
        onClick={() => actions.onOpen(project)}
      >
        <div
          className={styles.thumb}
          style={
            project.kind === 'single'
              ? { backgroundImage: `url("${THUMBS.submitGame}")`, backgroundColor: 'var(--ws-thumb-fallback)' }
              : undefined
          }
        >
          {project.kind === 'collage' && (
            <div className={styles.collage}>
              <div
                className={[styles.collageTile, styles.collageLead].join(' ')}
                style={{ backgroundImage: `url("${THUMBS.gameDetail}")` }}
              />
              <div
                className={styles.collageTile}
                style={{ backgroundImage: `url("${THUMBS.gameDetailAlt}")` }}
              />
              <div className={styles.collageTile} style={{ backgroundImage: `url("${THUMBS.feed}")` }} />
            </div>
          )}

          {project.kind === 'placeholder' && (
            <div className={styles.placeholder}>
              <div className={[styles.placeholderLayer, styles.placeholderBack].join(' ')} style={sizes.back} />
              <div className={[styles.placeholderLayer, styles.placeholderMid].join(' ')} style={sizes.mid} />
              <div className={styles.placeholderFrame} style={sizes.frame}>
                <KnarraMark size={20} color="var(--ws-frame-icon)" />
              </div>
            </div>
          )}

          <div className={styles.statusPill} style={{ background: status.bg, color: status.fg }}>
            {isRendering ? `${status.label} ${project.progress ?? 0}%` : status.label}
          </div>

          {isRendering && (
            <div className={styles.progressTrack}>
              <div className={styles.progressFill} style={{ width: `${project.progress ?? 0}%` }} />
            </div>
          )}
        </div>
      </button>

      <div className={styles.cardMenuAnchor}>
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label={`Actions for ${project.title}`}
          title="More actions"
          className={[styles.dotsButton, menuOpen && styles.dotsButtonOpen].filter(Boolean).join(' ')}
          onClick={onToggleMenu}
        >
          <DotsIcon />
        </button>
        {menuOpen && <ProjectActionsMenu project={project} actions={actions} />}
      </div>

      <div className={styles.cardBody}>
        <div className={styles.cardTitle}>{project.title}</div>
        <div className={styles.cardEdited}>{editedAgo(project.editedAt)}</div>
        <div className={styles.cardMeta}>
          {project.assets} assets · {project.duration} · {project.ratio}
        </div>
      </div>
    </div>
  )
}
