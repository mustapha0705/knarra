import { useRef, type DragEvent, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { PauseIcon, PlayIcon, VolumeIcon } from '../../components/icons'
import { fmtSize, fmtTime, waveBars } from './media'
import type { Asset, AssetMetadata, EditorProject, Segment } from './types'
import styles from './Editor.module.css'

type Slider = {
  id: string
  label: string
  min: number
  max: number
  step: number
  value: number
  display: string
  onChange: (value: number) => void
}

type Action = {
  id: string
  label: string
  primary?: boolean
  onClick: () => void
}

type StudioPanelProps = {
  project: EditorProject
  active: Asset | null
  assetQuery: string
  playing: boolean
  currentMs: number
  durationMs: number
  volume: number
  inMs: number | null
  outMs: number | null
  onAttachMedia: (element: HTMLMediaElement | null) => void
  onLoadedMetadata: (durationMs: number) => void
  onTimeUpdate: (currentMs: number) => void
  onEnded: () => void
  onTogglePlay: () => void
  onSeekRatio: (ratio: number) => void
  onVolumeChange: (volume: number) => void
  onSetIn: () => void
  onSetOut: () => void
  onCreateSegment: () => void
  onRenameAsset: (name: string) => void
  onSetAssetMeta: (patch: AssetMetadata) => void
  onAddToTimeline: (assetId: string, range?: { startMs: number; endMs: number; referenceId: string }) => void
  onRemoveFromCanvas: (assetId: string) => void
  onDuplicateNode: (assetId: string) => void
  onToggleReference: (assetId: string) => void
  onAnalyzeStyle: () => void
  onSetActiveAsset: (assetId: string) => void
  onSegmentDragStart: (event: DragEvent<HTMLDivElement>, segment: Segment) => void
}

export function StudioPanel(props: StudioPanelProps) {
  const {
    project,
    active,
    assetQuery,
    playing,
    currentMs,
    durationMs,
    volume,
    inMs,
    outMs,
    onAttachMedia,
    onLoadedMetadata,
    onTimeUpdate,
    onEnded,
    onTogglePlay,
    onSeekRatio,
    onVolumeChange,
    onSetIn,
    onSetOut,
    onCreateSegment,
    onRenameAsset,
    onSetAssetMeta,
    onAddToTimeline,
    onRemoveFromCanvas,
    onDuplicateNode,
    onToggleReference,
    onAnalyzeStyle,
    onSetActiveAsset,
    onSegmentDragStart,
  } = props

  const scrubRef = useRef<HTMLDivElement>(null)

  const effectiveDuration = durationMs || active?.durationMs || 0
  const percent = effectiveDuration ? Math.min(100, (currentMs / effectiveDuration) * 100) : 0
  const inPercent = inMs != null && effectiveDuration ? (inMs / effectiveDuration) * 100 : null
  const outPercent = outMs != null && effectiveDuration ? (outMs / effectiveDuration) * 100 : null
  const hasPlayable = active?.type === 'video' || active?.type === 'audio'
  const canRange = active?.type === 'video'
  const segmentReady = inMs != null && outMs != null && outMs > inMs

  const onScrubDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const element = scrubRef.current
    if (!element) return
    const rect = element.getBoundingClientRect()
    onSeekRatio((event.clientX - rect.left) / rect.width)

    const onMove = (moveEvent: PointerEvent) => onSeekRatio((moveEvent.clientX - rect.left) / rect.width)
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const onScrubKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const span = effectiveDuration || 1
    const step = (event.shiftKey ? 5000 : 1000) * (event.key === 'ArrowRight' ? 1 : -1)
    onSeekRatio((currentMs + step) / span)
  }

  const sliders: Slider[] = []
  const actions: Action[] = []

  if (active) {
    const metadata = active.metadata

    if (active.type === 'image') {
      const durationSeconds = (metadata.imageDurationMs ?? 3000) / 1000
      sliders.push({
        id: 'duration',
        label: 'Duration',
        min: 0.5,
        max: 12,
        step: 0.5,
        value: durationSeconds,
        display: `${durationSeconds.toFixed(1)}s`,
        onChange: (value) => onSetAssetMeta({ imageDurationMs: Math.round(value * 1000) }),
      })
    }

    if (active.type === 'video' || active.type === 'audio') {
      const speed = metadata.speed ?? 1
      const assetVolume = metadata.volume ?? 1
      sliders.push({
        id: 'speed',
        label: 'Speed',
        min: 0.25,
        max: 4,
        step: 0.25,
        value: speed,
        display: `${speed}×`,
        onChange: (value) => onSetAssetMeta({ speed: value }),
      })
      sliders.push({
        id: 'volume',
        label: 'Volume',
        min: 0,
        max: 1,
        step: 0.05,
        value: assetVolume,
        display: `${Math.round(assetVolume * 100)}%`,
        onChange: (value) => onSetAssetMeta({ volume: value }),
      })
    }

    if (active.type !== 'audio') {
      ;(['brightness', 'contrast', 'saturation'] as const).forEach((key) => {
        const value = metadata[key] ?? 1
        sliders.push({
          id: key,
          label: key[0].toUpperCase() + key.slice(1),
          min: 0.5,
          max: 1.5,
          step: 0.05,
          value,
          display: `${Math.round(value * 100)}%`,
          onChange: (next) => onSetAssetMeta({ [key]: next }),
        })
      })
    }

    actions.push({ id: 'add', label: 'Add to timeline', primary: true, onClick: () => onAddToTimeline(active.id) })
    actions.push({ id: 'remove', label: 'Remove from canvas', onClick: () => onRemoveFromCanvas(active.id) })
    actions.push({ id: 'duplicate', label: 'Duplicate', onClick: () => onDuplicateNode(active.id) })

    if (active.type === 'video') {
      actions.push({
        id: 'reference',
        label: active.role === 'reference' ? 'Unmark reference' : 'Mark as reference',
        onClick: () => onToggleReference(active.id),
      })
      if (active.role === 'reference') {
        actions.push({ id: 'analyze', label: 'Analyze style', onClick: onAnalyzeStyle })
      }
    }
  }

  const filteredAssets = project.assets.filter(
    (asset) =>
      !assetQuery || `${asset.name} ${asset.referenceId}`.toLowerCase().includes(assetQuery.toLowerCase()),
  )

  return (
    <div className={styles.panel}>
      <div className={styles.panelScroll}>
        <div className={styles.stage}>
          {!active && <div className={styles.stageEmpty}>Your preview will appear here.</div>}

          {active?.type === 'image' && (
            <div
              role="img"
              aria-label={active.name}
              className={styles.stageImage}
              style={{ backgroundImage: `url("${active.src}")` }}
            />
          )}

          {active?.type === 'video' && (
            <video
              key={active.id}
              ref={onAttachMedia}
              src={active.src}
              playsInline
              preload="metadata"
              onLoadedMetadata={(event) => onLoadedMetadata(Math.round(event.currentTarget.duration * 1000))}
              onTimeUpdate={(event) => onTimeUpdate(Math.round(event.currentTarget.currentTime * 1000))}
              onEnded={onEnded}
            />
          )}

          {active?.type === 'audio' && (
            <div className={styles.stageWave}>
              {waveBars(active.id, 34).map((value, index) => (
                <div
                  key={index}
                  className={styles.waveBar}
                  style={{ height: `${value}%`, background: 'var(--ed-accent-dark)' }}
                />
              ))}
              <audio
                key={active.id}
                ref={onAttachMedia}
                src={active.src}
                preload="metadata"
                style={{ display: 'none' }}
                onLoadedMetadata={(event) => onLoadedMetadata(Math.round(event.currentTarget.duration * 1000))}
                onTimeUpdate={(event) => onTimeUpdate(Math.round(event.currentTarget.currentTime * 1000))}
                onEnded={onEnded}
              />
            </div>
          )}
        </div>

        {hasPlayable && (
          <div className={styles.transport}>
            <div
              ref={scrubRef}
              role="slider"
              tabIndex={0}
              aria-label="Playback position"
              aria-valuemin={0}
              aria-valuemax={effectiveDuration}
              aria-valuenow={currentMs}
              aria-valuetext={`${fmtTime(currentMs)} of ${fmtTime(effectiveDuration)}`}
              className={styles.scrub}
              onPointerDown={onScrubDown}
              onKeyDown={onScrubKey}
            >
              <div className={styles.scrubTrack} />
              {inPercent != null && outPercent != null && (
                <div
                  className={styles.scrubRange}
                  style={{
                    left: `${Math.min(inPercent, outPercent)}%`,
                    width: `${Math.abs(outPercent - inPercent)}%`,
                  }}
                />
              )}
              <div className={styles.scrubProgress} style={{ width: `${percent}%` }} />
              <div className={styles.scrubKnob} style={{ left: `calc(${percent}% - 6px)` }} />
              {inPercent != null && (
                <div className={styles.scrubMarker} style={{ left: `calc(${inPercent}% - 1px)` }} />
              )}
              {outPercent != null && (
                <div className={styles.scrubMarker} style={{ left: `calc(${outPercent}% - 1px)` }} />
              )}
            </div>

            <div className={styles.transportRow}>
              <button
                type="button"
                aria-label={playing ? 'Pause' : 'Play'}
                className={styles.transportButton}
                onClick={onTogglePlay}
              >
                {playing ? <PauseIcon size={14} /> : <PlayIcon size={14} />}
              </button>
              <span className={styles.timeLabel}>
                {fmtTime(currentMs)} / {fmtTime(effectiveDuration)}
              </span>
              <div className={styles.toolbarSpacer} />
              <VolumeIcon size={15} />
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={volume}
                aria-label="Volume"
                className={styles.volumeSlider}
                onChange={(event) => onVolumeChange(parseFloat(event.target.value))}
              />
            </div>

            {canRange && (
              <div className={styles.rangeRow}>
                <button type="button" className={styles.chipButton} onClick={onSetIn}>
                  Set In
                </button>
                <button type="button" className={styles.chipButton} onClick={onSetOut}>
                  Set Out
                </button>
                <span className={styles.rangeLabel}>
                  {inMs != null || outMs != null
                    ? `${inMs != null ? fmtTime(inMs) : '--:--'} – ${outMs != null ? fmtTime(outMs) : '--:--'}`
                    : 'no range set'}
                </span>
                <div className={styles.toolbarSpacer} />
                <button
                  type="button"
                  className={[styles.actionButton, styles.actionButtonPrimary].join(' ')}
                  disabled={!segmentReady}
                  onClick={onCreateSegment}
                >
                  Create segment
                </button>
              </div>
            )}
          </div>
        )}

        <div className={styles.card}>
          <div className={styles.cardHead}>
            <span className={styles.cardTitle}>{active ? 'Selection' : 'Nothing selected'}</span>
            <div className={styles.toolbarSpacer} />
            {active && <span className={styles.badge}>{active.referenceId}</span>}
          </div>

          {!active && (
            <div className={styles.inspectorHint}>
              {project.assets.length
                ? 'Select an asset on the canvas, or pick one from the asset list below.'
                : 'Import media to start building this project.'}
            </div>
          )}

          {active && (
            <div className={styles.inspectorFields}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Name</span>
                <input
                  type="text"
                  className={styles.fieldInput}
                  value={active.name}
                  onChange={(event) => onRenameAsset(event.target.value)}
                />
              </label>

              <div className={styles.metaGrid}>
                <div className={styles.metaItem}>
                  <span className={styles.metaLabel}>Type</span>
                  <span className={styles.metaValue}>
                    {active.role === 'reference' ? 'reference' : active.type}
                  </span>
                </div>
                <div className={styles.metaItem}>
                  <span className={styles.metaLabel}>Duration</span>
                  <span className={styles.metaValue}>
                    {active.durationMs ? fmtTime(active.durationMs) : '—'}
                  </span>
                </div>
                <div className={styles.metaItem}>
                  <span className={styles.metaLabel}>Size</span>
                  <span className={styles.metaValue}>
                    {active.width ? `${active.width}×${active.height}` : fmtSize(active.size)}
                  </span>
                </div>
                <div className={styles.metaItem}>
                  <span className={styles.metaLabel}>Status</span>
                  <span className={styles.metaValue}>{active.status}</span>
                </div>
              </div>

              {sliders.map((slider) => (
                <label key={slider.id} className={styles.sliderRow}>
                  <span className={styles.sliderLabel}>{slider.label}</span>
                  <input
                    type="range"
                    min={slider.min}
                    max={slider.max}
                    step={slider.step}
                    value={slider.value}
                    aria-label={slider.label}
                    className={styles.slider}
                    onChange={(event) => slider.onChange(parseFloat(event.target.value))}
                  />
                  <span className={styles.sliderValue}>{slider.display}</span>
                </label>
              ))}

              <div className={styles.actionRow}>
                {actions.map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    className={[styles.actionButton, action.primary && styles.actionButtonPrimary]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={action.onClick}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {project.segments.length > 0 && (
          <div className={[styles.card, styles.cardTight].join(' ')}>
            <div className={styles.cardTitle} style={{ marginBottom: 9 }}>
              Segments
            </div>
            <div className={styles.segmentList}>
              {project.segments.map((segment) => (
                <div
                  key={segment.id}
                  draggable
                  className={styles.segmentRow}
                  onDragStart={(event) => onSegmentDragStart(event, segment)}
                >
                  <span className={styles.badge}>{segment.referenceId}</span>
                  <span className={styles.segmentRange}>
                    {fmtTime(segment.startMs)}–{fmtTime(segment.endMs)}
                  </span>
                  <button
                    type="button"
                    aria-label={`Add ${segment.referenceId} to timeline`}
                    className={styles.segmentAdd}
                    onClick={() =>
                      onAddToTimeline(segment.assetId, {
                        startMs: segment.startMs,
                        endMs: segment.endMs,
                        referenceId: segment.referenceId,
                      })
                    }
                  >
                    Add
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {project.assets.length > 0 && (
          <div className={[styles.card, styles.cardTight].join(' ')}>
            <div className={styles.cardHead} style={{ marginBottom: 9 }}>
              <span className={styles.cardTitle}>Assets</span>
              <span className={styles.cardCount}>
                {project.assets.length} item{project.assets.length > 1 ? 's' : ''}
              </span>
            </div>
            <div className={styles.assetList}>
              {filteredAssets.map((asset) => (
                <button
                  key={asset.id}
                  type="button"
                  aria-label={`Open ${asset.referenceId} ${asset.name} in preview`}
                  className={[styles.assetRow, active?.id === asset.id && styles.assetRowActive]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => onSetActiveAsset(asset.id)}
                >
                  <span className={[styles.badge, styles.badgeSmall].join(' ')}>{asset.referenceId}</span>
                  <span className={styles.assetName}>{asset.name}</span>
                  <span className={styles.assetMeta}>
                    {asset.durationMs ? fmtTime(asset.durationMs) : asset.type}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
