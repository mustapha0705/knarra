import { useEffect, useRef } from 'react'
import { KnarraMark } from '../../components/KnarraMark'
import {
  CanvasTabIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  RedoIcon,
  SearchIcon,
  TimelineTabIcon,
  UndoIcon,
} from '../../components/icons'
import { AddSourcesMenu, type AddSourcesHandlers } from './AddSourcesMenu'
import type { EditorMode } from './types'
import styles from './Editor.module.css'

type EditorToolbarProps = AddSourcesHandlers & {
  title: string
  saveState: string
  mode: EditorMode
  menuOpen: boolean
  canUndo: boolean
  canRedo: boolean
  assetQuery: string
  playing: boolean
  onTitleChange: (title: string) => void
  onModeChange: (mode: EditorMode) => void
  onToggleMenu: () => void
  onCloseMenu: () => void
  onUndo: () => void
  onRedo: () => void
  onAssetQueryChange: (value: string) => void
  onTogglePlay: () => void
  onExport: () => void
  onHome: () => void
}

export function EditorToolbar({
  title,
  saveState,
  mode,
  menuOpen,
  canUndo,
  canRedo,
  assetQuery,
  playing,
  onTitleChange,
  onModeChange,
  onToggleMenu,
  onCloseMenu,
  onUndo,
  onRedo,
  onAssetQueryChange,
  onTogglePlay,
  onExport,
  onHome,
  ...sources
}: EditorToolbarProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  // The menu owns its own outside-click because it must ignore its trigger.
  useEffect(() => {
    if (!menuOpen) return
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (menuRef.current?.contains(target)) return
      if (triggerRef.current?.contains(target)) return
      onCloseMenu()
    }
    document.addEventListener('mousedown', onDown, true)
    return () => document.removeEventListener('mousedown', onDown, true)
  }, [menuOpen, onCloseMenu])

  return (
    <div className={styles.toolbar}>
      <div className={styles.toolbarGroup}>
        <button
          type="button"
          className={styles.homeButton}
          title="Go to projects"
          aria-label="Go to projects"
          onClick={onHome}
        >
          <KnarraMark size={17} label="Knarra" />
        </button>

        <input
          type="text"
          aria-label="Project name"
          className={styles.projectTitle}
          value={title}
          onChange={(event) => onTitleChange(event.target.value)}
        />
        <span className={styles.saveState}>{saveState}</span>

        <div className={styles.anchor}>
          <button
            ref={triggerRef}
            type="button"
            aria-label="Add sources"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className={styles.ghostButton}
            onClick={onToggleMenu}
          >
            <PlusIcon size={15} />
            <span>Add sources</span>
          </button>
          {menuOpen && <AddSourcesMenu menuRef={menuRef} {...sources} />}
        </div>
      </div>

      <div className={styles.toolbarSpacer} />

      <div role="group" aria-label="Workspace view" className={styles.tabGroup}>
        <button
          type="button"
          aria-pressed={mode === 'canvas'}
          className={[styles.tab, mode === 'canvas' && styles.tabActive].filter(Boolean).join(' ')}
          onClick={() => onModeChange('canvas')}
        >
          <CanvasTabIcon size={15} />
          <span>Canvas</span>
        </button>
        <button
          type="button"
          aria-pressed={mode === 'timeline'}
          className={[styles.tab, mode === 'timeline' && styles.tabActive].filter(Boolean).join(' ')}
          onClick={() => onModeChange('timeline')}
        >
          <TimelineTabIcon size={15} />
          <span>Timeline</span>
        </button>
      </div>

      <div className={styles.toolbarSpacer} />

      <div className={styles.toolbarGroup} style={{ gap: 6 }}>
        <button
          type="button"
          aria-label="Undo"
          title="Undo"
          disabled={!canUndo}
          className={styles.iconButton}
          onClick={onUndo}
        >
          <UndoIcon size={17} />
        </button>
        <button
          type="button"
          aria-label="Redo"
          title="Redo"
          disabled={!canRedo}
          className={styles.iconButton}
          onClick={onRedo}
        >
          <RedoIcon size={17} />
        </button>

        <div className={styles.assetSearch}>
          <SearchIcon size={15} strokeWidth={1.6} />
          <input
            type="text"
            aria-label="Search assets"
            placeholder="Search assets"
            value={assetQuery}
            onChange={(event) => onAssetQueryChange(event.target.value)}
          />
        </div>

        <button
          type="button"
          aria-label={playing ? 'Pause' : 'Play'}
          title={playing ? 'Pause' : 'Play'}
          className={styles.iconButton}
          onClick={onTogglePlay}
        >
          {playing ? <PauseIcon /> : <PlayIcon />}
        </button>

        <button type="button" className={styles.exportButton} onClick={onExport}>
          Export
        </button>
      </div>
    </div>
  )
}
