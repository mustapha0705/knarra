import { useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { MinusIcon, PlusIcon } from '../../components/icons'
import { TRACKS, fmtTime } from './media'
import type { Asset, EditorProject, TimelineClip } from './types'
import styles from './Editor.module.css'

type TimelineProps = {
  project: EditorProject
  activeAssetId: string | null
  /** Horizontal scale, in pixels per second. */
  pxPerSecond: number
  currentMs: number
  onZoomIn: () => void
  onZoomOut: () => void
  onSelectClip: (clip: TimelineClip) => void
  onClipMoved: (clipId: string, startMs: number) => void
}

const TICK_STEP_SECONDS = 5
/** Keeps a short timeline from collapsing, and leaves headroom past the end. */
const MIN_SPAN_MS = 30_000
const TAIL_MS = 8_000

const CLIP_BACKGROUNDS = {
  video: 'var(--ed-clip-video)',
  overlay: 'var(--ed-clip-overlay)',
  audio: 'var(--ed-clip-audio)',
} as const

export function Timeline({
  project,
  activeAssetId,
  pxPerSecond,
  currentMs,
  onZoomIn,
  onZoomOut,
  onSelectClip,
  onClipMoved,
}: TimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  const contentMs = project.timelineClips.reduce(
    (max, clip) => Math.max(max, clip.timelineStartMs + clip.durationMs),
    0,
  )
  const totalMs = Math.max(MIN_SPAN_MS, contentMs + TAIL_MS)
  const totalSeconds = Math.ceil(totalMs / 1000)

  const ticks: number[] = []
  for (let second = 0; second <= totalSeconds; second += TICK_STEP_SECONDS) ticks.push(second)

  const assetById = new Map<string, Asset>(project.assets.map((asset) => [asset.id, asset]))

  const onClipPointerDown = (event: ReactPointerEvent<HTMLDivElement>, clip: TimelineClip) => {
    event.stopPropagation()
    onSelectClip(clip)

    const target = event.currentTarget
    const startX = event.clientX
    const startMs = clip.timelineStartMs
    const paint = (deltaMs: number) => {
      target.style.left = `${Math.max(0, ((startMs + deltaMs) / 1000) * pxPerSecond)}px`
    }

    // As with canvas nodes: window-level, so leaving the clip or having the
    // pointer cancelled can't strand the drag.
    const detach = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
    }

    const onMove = (moveEvent: PointerEvent) => paint(((moveEvent.clientX - startX) / pxPerSecond) * 1000)

    const onUp = (upEvent: PointerEvent) => {
      detach()
      const deltaMs = ((upEvent.clientX - startX) / pxPerSecond) * 1000
      // Ignore jitter so a click to select doesn't nudge the clip.
      if (Math.abs(deltaMs) < 30) return
      onClipMoved(clip.id, Math.max(0, Math.round(startMs + deltaMs)))
    }

    const onCancel = () => {
      detach()
      paint(0)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
  }

  const clipCount = project.timelineClips.length

  return (
    <div className={styles.timeline}>
      <div className={styles.timelineHead}>
        <span className={styles.timelineTitle}>Timeline</span>
        <span className={styles.timelineSummary}>
          {clipCount ? `${clipCount} clip${clipCount > 1 ? 's' : ''} · ${fmtTime(totalMs - TAIL_MS)}` : 'empty'}
        </span>
        <div className={styles.toolbarSpacer} />
        <button
          type="button"
          aria-label="Zoom timeline out"
          className={styles.timelineZoomButton}
          onClick={onZoomOut}
        >
          <MinusIcon size={14} />
        </button>
        <button
          type="button"
          aria-label="Zoom timeline in"
          className={styles.timelineZoomButton}
          onClick={onZoomIn}
        >
          <PlusIcon size={14} strokeWidth={1.8} />
        </button>
      </div>

      <div className={styles.timelineBody}>
        <div className={styles.trackLabels}>
          {TRACKS.map((track) => (
            <div key={track.id} className={styles.trackLabel}>
              {track.label}
            </div>
          ))}
        </div>

        <div ref={scrollRef} className={styles.trackScroll}>
          <div className={styles.trackInner} style={{ width: totalSeconds * pxPerSecond + 120 }}>
            <div className={styles.ruler}>
              {ticks.map((second) => (
                <div key={second} className={styles.tick} style={{ left: second * pxPerSecond }}>
                  {fmtTime(second * 1000)}
                </div>
              ))}
            </div>

            {TRACKS.map((track) => (
              <div key={track.id} className={styles.trackRow} style={{ background: track.bg }}>
                {project.timelineClips
                  .filter((clip) => clip.trackId === track.id)
                  .map((clip) => {
                    const asset = assetById.get(clip.assetId)
                    const selected = activeAssetId === clip.assetId
                    return (
                      <div
                        key={clip.id}
                        role="button"
                        tabIndex={0}
                        data-clip-id={clip.id}
                        aria-label={`${clip.referenceId} ${asset?.name ?? ''} at ${fmtTime(clip.timelineStartMs)}`}
                        className={[styles.clip, selected && styles.clipSelected].filter(Boolean).join(' ')}
                        style={{
                          left: (clip.timelineStartMs / 1000) * pxPerSecond,
                          width: Math.max(46, (clip.durationMs / 1000) * pxPerSecond),
                          background: CLIP_BACKGROUNDS[track.id],
                        }}
                        onPointerDown={(event) => onClipPointerDown(event, clip)}
                      >
                        <span className={styles.clipBadge}>{clip.referenceId || asset?.referenceId}</span>
                        <span className={styles.clipName}>{asset?.name ?? ''}</span>
                      </div>
                    )
                  })}
              </div>
            ))}

            <div className={styles.playhead} style={{ left: (currentMs / 1000) * pxPerSecond }} />
          </div>
        </div>
      </div>

      {!clipCount && (
        <div className={styles.timelineEmpty}>
          <div className={styles.timelineEmptyTitle}>No clips yet</div>
          <div className={styles.timelineEmptyBody}>
            Select an asset and choose “Add to timeline”, or run a command below.
          </div>
        </div>
      )}
    </div>
  )
}
