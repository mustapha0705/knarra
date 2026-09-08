import { useEffect, useRef } from 'react'
import {
  HomeIcon,
  LinkIcon,
  MarkdownIcon,
  SandboxIcon,
  UploadFileIcon,
  UploadFolderIcon,
} from '../../components/icons'
import styles from './Editor.module.css'

export type AddSourcesHandlers = {
  onAddFromWorkspace: () => void
  onUploadFile: () => void
  onUploadFolder: () => void
  onCreateMarkdown: () => void
  onCreateLink: () => void
  onCreateSandbox: () => void
}

type AddSourcesMenuProps = AddSourcesHandlers & {
  menuRef: React.RefObject<HTMLDivElement | null>
}

/** Roving arrow-key focus across the menu; Enter/Space come free from buttons. */
function useArrowNavigation(container: React.RefObject<HTMLDivElement | null>) {
  return (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    const items = Array.from(
      container.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
    )
    if (!items.length) return
    const index = items.indexOf(document.activeElement as HTMLElement)
    const next =
      event.key === 'ArrowDown'
        ? (index + 1) % items.length
        : (index - 1 + items.length) % items.length
    items[next < 0 ? 0 : next].focus()
  }
}

export function AddSourcesMenu({ menuRef, ...handlers }: AddSourcesMenuProps) {
  const onKeyDown = useArrowNavigation(menuRef)
  const firstItem = useRef<HTMLButtonElement>(null)

  // Focus the first item so the arrow-key handler below is reachable without
  // tabbing in. preventScroll keeps ancestors from scrolling to reach it.
  useEffect(() => {
    firstItem.current?.focus({ preventScroll: true })
  }, [])

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="Add sources"
      className={styles.sourceMenu}
      onKeyDown={onKeyDown}
    >
      <div className={styles.sourceMenuLabel}>Add sources</div>

      <button
        ref={firstItem}
        type="button"
        role="menuitem"
        className={styles.sourceMenuItem}
        onClick={handlers.onAddFromWorkspace}
      >
        <HomeIcon size={18} />
        <span>Add from workspace</span>
      </button>
      <button type="button" role="menuitem" className={styles.sourceMenuItem} onClick={handlers.onUploadFile}>
        <UploadFileIcon size={18} />
        <span>Upload file</span>
      </button>
      <button
        type="button"
        role="menuitem"
        className={styles.sourceMenuItem}
        onClick={handlers.onUploadFolder}
      >
        <UploadFolderIcon size={18} />
        <span>Upload folder</span>
      </button>

      <div className={styles.sourceMenuRule} />
      <div className={[styles.sourceMenuLabel, styles.sourceMenuLabelTight].join(' ')}>Create</div>

      <button
        type="button"
        role="menuitem"
        className={styles.sourceMenuItem}
        onClick={handlers.onCreateMarkdown}
      >
        <MarkdownIcon size={18} />
        <span>Markdown</span>
      </button>
      <button type="button" role="menuitem" className={styles.sourceMenuItem} onClick={handlers.onCreateLink}>
        <LinkIcon size={18} />
        <span>Link</span>
      </button>
      <button
        type="button"
        role="menuitem"
        className={styles.sourceMenuItem}
        onClick={handlers.onCreateSandbox}
      >
        <SandboxIcon size={18} />
        <span>Sandbox</span>
      </button>
    </div>
  )
}
