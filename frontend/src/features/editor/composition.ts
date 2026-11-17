import type { Asset, EditorProject, TimelineClip, TrackId } from './types'

/**
 * The backend's Composition v1, as JSON. The backend kernel
 * (backend/src/domain/composition) is the authority for this shape and
 * validates everything sent to it; this is a local mirror because the frontend
 * cannot import backend types yet (ADR 0006).
 */
export type ImageClipV1 = { id: string; kind: 'image'; assetId: string; durationMs: number }

export type VideoClipV1 = {
  id: string
  kind: 'video'
  assetId: string
  sourceStartMs: number
  sourceEndMs: number
  speed: number
  volume: number
  durationMs: number
}

export type AudioClipV1 = {
  id: string
  kind: 'audio'
  assetId: string
  sourceStartMs: number
  sourceEndMs: number
  timelineStartMs: number
  volume: number
  fadeInMs: number
  fadeOutMs: number
}

export type CompositionV1 = {
  schemaVersion: 1
  id: string
  presetId: string
  tracks: [
    { id: string; kind: 'visual'; clips: (ImageClipV1 | VideoClipV1)[] },
    { id: string; kind: 'audio'; clips: AudioClipV1[] },
  ]
}

export type CompositionExport = {
  composition: CompositionV1
  /** The assets the composition uses, each once: the media the backend needs. */
  assets: Asset[]
  /** Timeline clips left out because they cannot be rendered. */
  skippedClipIds: string[]
}

export const DEFAULT_PRESET_ID = 'vertical-1080p30'

/** Lanes that feed the single visual track, in tie-break order. */
const VISUAL_LANES: TrackId[] = ['video', 'overlay']

/**
 * Maps the editor's timeline to a Composition.
 *
 * - Clips on the Video and Images lanes become one sequential visual track,
 *   ordered by where they start on the timeline. Their start times are then
 *   implied by that order; gaps and overlaps between lanes are not kept.
 * - Clips on the Audio lane become the audio track and keep their positions.
 * - A clip's speed and volume win when they were changed; otherwise the asset's
 *   slider values apply. An image's duration slider wins over the clip length.
 * - A video clip's duration is recomputed from its source range and speed.
 * - Canvas nodes, folders, segments, and command history are not part of the
 *   Composition.
 *
 * The result is not guaranteed to be valid: the backend decides that and
 * explains any problem.
 */
export function toComposition(
  project: EditorProject,
  presetId: string = DEFAULT_PRESET_ID,
): CompositionExport {
  const assetsById = new Map(project.assets.map((asset) => [asset.id, asset]))
  const used = new Map<string, Asset>()
  const skippedClipIds: string[] = []

  const assetFor = (clip: TimelineClip, kinds: Asset['type'][]): Asset | null => {
    const asset = assetsById.get(clip.assetId)
    if (!asset || !kinds.includes(asset.type)) {
      skippedClipIds.push(clip.id)
      return null
    }
    used.set(asset.id, asset)
    return asset
  }

  const visualClips: (ImageClipV1 | VideoClipV1)[] = []
  const visual = project.timelineClips
    .map((clip, index) => ({ clip, index }))
    .filter(({ clip }) => VISUAL_LANES.includes(clip.trackId))
    .sort(
      (a, b) =>
        a.clip.timelineStartMs - b.clip.timelineStartMs ||
        VISUAL_LANES.indexOf(a.clip.trackId) - VISUAL_LANES.indexOf(b.clip.trackId) ||
        a.index - b.index,
    )

  for (const { clip } of visual) {
    const asset = assetFor(clip, ['image', 'video'])
    if (!asset) continue

    if (asset.type === 'image') {
      visualClips.push({
        id: clip.id,
        kind: 'image',
        assetId: asset.id,
        durationMs: Math.round(asset.metadata.imageDurationMs ?? clip.durationMs),
      })
      continue
    }

    const sourceStartMs = Math.round(clip.sourceStartMs)
    const sourceEndMs = Math.round(clip.sourceEndMs)
    const speed = effective(clip.speed, asset.metadata.speed)
    visualClips.push({
      id: clip.id,
      kind: 'video',
      assetId: asset.id,
      sourceStartMs,
      sourceEndMs,
      speed,
      volume: effective(clip.volume, asset.metadata.volume),
      durationMs: speed > 0 ? Math.round((sourceEndMs - sourceStartMs) / speed) : 0,
    })
  }

  const audioClips: AudioClipV1[] = []
  for (const clip of project.timelineClips) {
    if (clip.trackId !== 'audio') continue
    const asset = assetFor(clip, ['audio'])
    if (!asset) continue
    audioClips.push({
      id: clip.id,
      kind: 'audio',
      assetId: asset.id,
      sourceStartMs: Math.round(clip.sourceStartMs),
      sourceEndMs: Math.round(clip.sourceEndMs),
      timelineStartMs: Math.round(clip.timelineStartMs),
      volume: effective(clip.volume, asset.metadata.volume),
      fadeInMs: 0,
      fadeOutMs: 0,
    })
  }

  return {
    composition: {
      schemaVersion: 1,
      id: project.id,
      presetId,
      tracks: [
        { id: 'track-visual', kind: 'visual', clips: visualClips },
        { id: 'track-audio', kind: 'audio', clips: audioClips },
      ],
    },
    assets: [...used.values()],
    skippedClipIds,
  }
}

/**
 * Speed and volume live in two places today: on the clip (set by commands) and
 * on the asset (set by the sliders). A clip value other than the default of 1
 * was set on purpose and wins; otherwise the asset's slider value applies.
 */
function effective(clipValue: number, assetValue: number | undefined): number {
  return clipValue !== 1 ? clipValue : (assetValue ?? 1)
}
