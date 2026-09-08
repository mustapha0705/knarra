import { useEffect, useRef, useState, type DragEvent, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { useEventCallback } from '../../lib/hooks'
import { CanvasNode } from './CanvasNode'
import { toCanvasPoint, type Pan } from './canvasGeometry'
import type { Asset, CanvasNode as CanvasNodeModel, EditorProject, Folder } from './types'
import styles from './Editor.module.css'

type CanvasProps = {
  canvasRef: RefObject<HTMLDivElement | null>
  project: EditorProject
  selection: string[]
  activeAssetId: string | null
  expanded: Record<string, boolean>
  zoom: number
  pan: Pan
  dragOver: boolean
  onSelectionChange: (ids: string[]) => void
  onPanChange: (pan: Pan) => void
  onZoomAt: (clientX: number, clientY: number, factor: number) => void
  onNodeSelect: (nodeId: string, additive: boolean) => void
  onNodesMoved: (ids: string[], dx: number, dy: number) => void
  onToggleExpanded: (nodeId: string) => void
  onSetActiveAsset: (assetId: string) => void
  onDeleteNode: (nodeId: string) => void
  onReorderNode: (nodeId: string, direction: 1 | -1) => void
  onDragOver: (event: DragEvent<HTMLDivElement>) => void
  onDragLeave: (event: DragEvent<HTMLDivElement>) => void
  onDrop: (event: DragEvent<HTMLDivElement>) => void
  onUploadFile: () => void
  onUploadFolder: () => void
  onAddFromWorkspace: () => void
}

type Marquee = { x0: number; y0: number; x1: number; y1: number }

export function Canvas({
  canvasRef,
  project,
  selection,
  activeAssetId,
  expanded,
  zoom,
  pan,
  dragOver,
  onSelectionChange,
  onPanChange,
  onZoomAt,
  onNodeSelect,
  onNodesMoved,
  onToggleExpanded,
  onSetActiveAsset,
  onDeleteNode,
  onReorderNode,
  onDragOver,
  onDragLeave,
  onDrop,
  onUploadFile,
  onUploadFolder,
  onAddFromWorkspace,
}: CanvasProps) {
  const layerRef = useRef<HTMLDivElement>(null)
  const [marquee, setMarquee] = useState<Marquee | null>(null)
  // Space is the "pan instead of zoom / pan instead of marquee" modifier.
  const spaceHeld = useRef(false)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement | null)?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea') return
      if (event.code === 'Space') spaceHeld.current = true
    }
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') spaceHeld.current = false
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('keyup', onKeyUp)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('keyup', onKeyUp)
    }
  }, [])

  // Wheel must be non-passive so pinch-zoom and scroll can be intercepted;
  // React's synthetic onWheel is passive, so bind it directly.
  const onWheel = useEventCallback((event: WheelEvent) => {
    if (event.cancelable) event.preventDefault()
    event.stopPropagation()

    const page = canvasRef.current?.getBoundingClientRect().height ?? window.innerHeight
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? page : 1
    const dx = event.deltaX * unit
    const dy = event.deltaY * unit
    const shouldPan = event.shiftKey || spaceHeld.current || Math.abs(dx) > Math.abs(dy)

    if (shouldPan) {
      onPanChange({
        x: pan.x - (event.shiftKey && Math.abs(dx) < Math.abs(dy) ? dy : dx),
        y: spaceHeld.current && !event.shiftKey ? pan.y - dy : pan.y,
      })
      return
    }

    const factor = Math.max(0.8, Math.min(1.25, Math.exp(-dy * 0.0015)))
    onZoomAt(event.clientX, event.clientY, factor)
  })

  useEffect(() => {
    const element = canvasRef.current
    if (!element) return
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [canvasRef, onWheel])

  const onCanvasPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    const target = event.target as HTMLElement
    if (target.closest('[data-node-id]')) return
    // Never hijack real controls living inside the canvas (empty-state upload
    // buttons, zoom controls, the picker): capturing would retarget their click.
    if (target.closest('button,a,input,textarea,select,label,[role="button"],[role="menuitem"],[role="dialog"]')) {
      return
    }

    const startX = event.clientX
    const startY = event.clientY
    const isMarquee = event.shiftKey && !spaceHeld.current
    const origin = toCanvasPoint(canvasRef.current, startX, startY, pan, zoom)
    const panStart = { ...pan }
    if (!isMarquee) onSelectionChange([])

    const surface = event.currentTarget
    const pointerId = event.pointerId
    let captured = false
    let current: Marquee | null = null

    const onMove = (moveEvent: PointerEvent) => {
      if (!captured && Math.abs(moveEvent.clientX - startX) + Math.abs(moveEvent.clientY - startY) > 3) {
        captured = true
        try {
          surface.setPointerCapture(pointerId)
        } catch {
          // Pointer capture is best-effort; dragging still works without it.
        }
      }
      if (isMarquee) {
        const point = toCanvasPoint(canvasRef.current, moveEvent.clientX, moveEvent.clientY, pan, zoom)
        current = { x0: origin.x, y0: origin.y, x1: point.x, y1: point.y }
        setMarquee(current)
      } else {
        onPanChange({
          x: panStart.x + (moveEvent.clientX - startX),
          y: panStart.y + (moveEvent.clientY - startY),
        })
      }
    }

    const onUp = () => {
      surface.removeEventListener('pointermove', onMove)
      surface.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointerup', onUp)
      if (captured) {
        try {
          surface.releasePointerCapture(pointerId)
        } catch {
          // Already released.
        }
      }
      if (isMarquee && current) {
        const x0 = Math.min(current.x0, current.x1)
        const x1 = Math.max(current.x0, current.x1)
        const y0 = Math.min(current.y0, current.y1)
        const y1 = Math.max(current.y0, current.y1)
        const hits = project.canvasNodes
          .filter((node) => node.x + node.width > x0 && node.x < x1 && node.y + node.height > y0 && node.y < y1)
          .map((node) => node.id)
        onSelectionChange(hits)
        setMarquee(null)
      }
    }

    surface.addEventListener('pointermove', onMove)
    surface.addEventListener('pointerup', onUp)
    window.addEventListener('pointerup', onUp)
  }

  const onNodePointerDown = (event: ReactPointerEvent<HTMLDivElement>, node: CanvasNodeModel) => {
    event.stopPropagation()
    const additive = event.shiftKey || event.metaKey
    const alreadySelected = selection.includes(node.id)
    if (!alreadySelected || additive) onNodeSelect(node.id, additive)

    // Drag the whole selection only when grabbing something already in it.
    const ids = alreadySelected && !additive ? selection.slice() : [node.id]
    const origins = new Map<string, { x: number; y: number }>()
    project.canvasNodes.forEach((candidate) => {
      if (ids.includes(candidate.id)) origins.set(candidate.id, { x: candidate.x, y: candidate.y })
    })

    const elements = new Map<string, HTMLElement>()
    ids.forEach((id) => {
      const element = layerRef.current?.querySelector<HTMLElement>(`[data-node-id="${id}"]`)
      if (element) elements.set(id, element)
    })

    const startX = event.clientX
    const startY = event.clientY
    let moved = false

    // Positions are written straight to the DOM while dragging, then committed
    // once on release — one history entry per drag, and no per-frame rerender.
    const paint = (dx: number, dy: number) => {
      ids.forEach((id) => {
        const element = elements.get(id)
        const origin = origins.get(id)
        if (!element || !origin) return
        element.style.left = `${origin.x + dx}px`
        element.style.top = `${origin.y + dy}px`
      })
    }

    // Listeners live on the window, not the node: the pointer routinely leaves
    // the node mid-drag, and a cancelled pointer would otherwise strand it.
    const detach = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
    }

    const onMove = (moveEvent: PointerEvent) => {
      const dx = (moveEvent.clientX - startX) / zoom
      const dy = (moveEvent.clientY - startY) / zoom
      if (Math.abs(dx) + Math.abs(dy) > 2) moved = true
      paint(dx, dy)
    }

    const onUp = (upEvent: PointerEvent) => {
      detach()
      if (!moved) return
      onNodesMoved(ids, (upEvent.clientX - startX) / zoom, (upEvent.clientY - startY) / zoom)
    }

    const onCancel = () => {
      detach()
      paint(0, 0)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
  }

  const assetById = new Map<string, Asset>(project.assets.map((asset) => [asset.id, asset]))
  const folderById = new Map<string, Folder>(project.folders.map((folder) => [folder.id, folder]))
  const isEmpty = !project.canvasNodes.length && !dragOver

  return (
    <div
      ref={canvasRef}
      className={styles.canvas}
      style={{
        backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
        backgroundPosition: `${pan.x}px ${pan.y}px`,
      }}
      onPointerDown={onCanvasPointerDown}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div
        ref={layerRef}
        className={styles.canvasLayer}
        style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
      >
        {project.canvasNodes.map((node) => {
          const folder = node.folderId ? folderById.get(node.folderId) : undefined
          const asset = node.assetId ? assetById.get(node.assetId) : undefined
          const folderAssets = folder
            ? folder.assetIds.map((id) => assetById.get(id)).filter((entry): entry is Asset => Boolean(entry))
            : []

          return (
            <CanvasNode
              key={node.id}
              node={node}
              asset={asset}
              folder={folder}
              folderAssets={folderAssets}
              selected={selection.includes(node.id)}
              expanded={Boolean(expanded[node.id])}
              activeAssetId={activeAssetId}
              onPointerDown={(event) => onNodePointerDown(event, node)}
              onDoubleClick={() => {
                if (folder) onToggleExpanded(node.id)
                else if (asset) onSetActiveAsset(asset.id)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  if (asset) onSetActiveAsset(asset.id)
                  else onToggleExpanded(node.id)
                } else if (event.key === 'Delete' || event.key === 'Backspace') {
                  event.preventDefault()
                  onDeleteNode(node.id)
                } else if (event.key === ']') {
                  event.preventDefault()
                  onReorderNode(node.id, 1)
                } else if (event.key === '[') {
                  event.preventDefault()
                  onReorderNode(node.id, -1)
                }
              }}
              onChildSelect={onSetActiveAsset}
            />
          )
        })}

        {marquee && (
          <div
            className={styles.marquee}
            style={{
              left: Math.min(marquee.x0, marquee.x1),
              top: Math.min(marquee.y0, marquee.y1),
              width: Math.abs(marquee.x1 - marquee.x0),
              height: Math.abs(marquee.y1 - marquee.y0),
            }}
          />
        )}
      </div>

      {isEmpty && (
        <div className={styles.canvasEmpty}>
          <div className={styles.canvasEmptyTitle}>Drop files or folders to begin</div>
          <div className={styles.canvasEmptyBody}>
            Add photos, videos, and music from your device or workspace.
          </div>
          <div className={styles.canvasEmptyActions}>
            <button type="button" className={styles.smallButton} onClick={onUploadFile}>
              Upload files
            </button>
            <button type="button" className={styles.smallButton} onClick={onUploadFolder}>
              Upload folder
            </button>
            <button type="button" className={styles.smallButton} onClick={onAddFromWorkspace}>
              Add from workspace
            </button>
          </div>
        </div>
      )}

      {dragOver && <div className={styles.dropOverlay}>Drop files or folders to add them</div>}
    </div>
  )
}
