import type { PointerEvent as ReactPointerEvent, KeyboardEvent as ReactKeyboardEvent } from 'react'
import { DocumentIcon } from '../../components/icons'
import { fmtSize, fmtTime, waveBars } from './media'
import type { Asset, CanvasNode as CanvasNodeModel, Folder } from './types'
import styles from './Editor.module.css'

type CanvasNodeProps = {
  node: CanvasNodeModel
  asset?: Asset
  folder?: Folder
  folderAssets: Asset[]
  selected: boolean
  expanded: boolean
  activeAssetId: string | null
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void
  onDoubleClick: () => void
  onKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => void
  onChildSelect: (assetId: string) => void
}

/** Three peeking thumbnails fanned above a folder body. */
const FOLDER_THUMB_POSITIONS = [
  { x: -20, y: -18, rotate: -8, z: 1 },
  { x: 0, y: -26, rotate: 0, z: 3 },
  { x: 20, y: -18, rotate: 8, z: 2 },
]

export function CanvasNode({
  node,
  asset,
  folder,
  folderAssets,
  selected,
  expanded,
  activeAssetId,
  onPointerDown,
  onDoubleClick,
  onKeyDown,
  onChildSelect,
}: CanvasNodeProps) {
  const height = folder && expanded
    ? node.height + Math.min(196, 9 + Math.ceil(folderAssets.length / 3) * 55)
    : node.height

  const referenceId = folder ? folder.referenceId : (asset?.referenceId ?? '')
  const label = folder ? folder.name : (asset?.name ?? '')
  const meta = folder
    ? String(folderAssets.length)
    : asset
      ? asset.status === 'processing'
        ? 'Processing'
        : asset.durationMs
          ? fmtTime(asset.durationMs)
          : fmtSize(asset.size)
      : ''

  const thumb = asset?.thumbnail ?? asset?.poster ?? null
  const isAudio = asset?.type === 'audio'
  const isBlank = Boolean(asset && !thumb && !isAudio)
  const folderThumbs = folder
    ? folderAssets
        .slice(0, 3)
        .map((child, index) => ({
          id: child.id,
          src: child.thumbnail ?? child.poster ?? '',
          position: FOLDER_THUMB_POSITIONS[index],
        }))
        .filter((entry) => entry.src)
    : []

  return (
    <div
      data-node-id={node.id}
      role="button"
      tabIndex={0}
      aria-label={`${referenceId} ${label}${asset ? `, ${asset.type}` : ', folder'}`}
      className={[styles.node, selected && styles.nodeSelected].filter(Boolean).join(' ')}
      style={{
        left: node.x,
        top: node.y,
        width: node.width,
        height,
        zIndex: (selected ? 500 : 0) + node.zIndex,
      }}
      onPointerDown={onPointerDown}
      onDoubleClick={(event) => {
        event.stopPropagation()
        onDoubleClick()
      }}
      onKeyDown={onKeyDown}
    >
      <div className={styles.nodeBadge}>{referenceId}</div>

      {folder && (
        <div className={styles.nodeFolderArt}>
          <div className={styles.nodeFolderStack}>
            <svg width="74" height="62" viewBox="0 0 74 62" fill="none" aria-hidden="true">
              <path
                d="M3.6 9.5A6.5 6.5 0 0 1 10.1 3h13.5a5 5 0 0 1 3.85 1.8l4.6 5.5v7.2H3.6Z"
                fill="var(--ed-folder-tab)"
              />
              <rect x="1.7" y="10.4" width="70.6" height="50" rx="8.5" fill="var(--ed-folder-body)" />
            </svg>
            {folderThumbs.map((entry) => (
              <div
                key={entry.id}
                className={styles.nodeFolderThumb}
                style={{
                  zIndex: entry.position.z,
                  transform: `translate(${entry.position.x}px, ${entry.position.y}px) rotate(${entry.position.rotate}deg)`,
                }}
              >
                <img src={entry.src} alt="" loading="lazy" draggable={false} />
              </div>
            ))}
            <svg
              width="74"
              height="62"
              viewBox="0 0 74 62"
              fill="none"
              style={{ zIndex: 5 }}
              aria-hidden="true"
            >
              <rect x="1.7" y="17.6" width="70.6" height="42.8" rx="8.5" fill="var(--ed-folder-body)" />
            </svg>
          </div>
        </div>
      )}

      {asset && (
        <div className={styles.nodeMedia}>
          {thumb && <img src={thumb} alt="" loading="lazy" draggable={false} />}

          {isAudio && (
            <div className={styles.nodeWave}>
              {waveBars(asset.id, 18).map((value, index) => (
                <div
                  key={index}
                  className={styles.waveBar}
                  style={{ height: `${value}%`, background: '#9fb3a7' }}
                />
              ))}
            </div>
          )}

          {isBlank && <DocumentIcon size={26} />}

          {Boolean(asset.durationMs) && (
            <div className={styles.nodeDuration}>{fmtTime(asset.durationMs)}</div>
          )}
          {asset.role === 'reference' && <div className={styles.nodeReference}>REFERENCE</div>}
        </div>
      )}

      <div className={styles.nodeFooter}>
        <span className={styles.nodeName}>{label}</span>
        <span className={styles.nodeMeta}>{meta}</span>
      </div>

      {folder && expanded && (
        <div className={styles.nodeChildren}>
          {folderAssets.slice(0, 9).map((child) => (
            <button
              key={child.id}
              type="button"
              aria-label={`${child.referenceId} ${child.name}`}
              className={[styles.nodeChild, activeAssetId === child.id && styles.nodeChildActive]
                .filter(Boolean)
                .join(' ')}
              onPointerDown={(event) => {
                event.stopPropagation()
                onChildSelect(child.id)
              }}
            >
              {(child.thumbnail ?? child.poster) && (
                <img src={child.thumbnail ?? child.poster ?? ''} alt="" loading="lazy" draggable={false} />
              )}
              <span className={styles.nodeChildBadge}>{child.referenceId}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
