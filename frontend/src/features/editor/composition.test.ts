import { describe, expect, it } from 'vitest'
import { DEFAULT_PRESET_ID, toComposition } from './composition'
import { exportFileName } from './exportProject'
import type { Asset, AssetType, EditorProject, TimelineClip, TrackId } from './types'

function asset(id: string, type: AssetType, overrides: Partial<Asset> = {}): Asset {
  return {
    id,
    referenceId: id.toUpperCase(),
    name: `${id}.bin`,
    type,
    role: 'source',
    src: `blob:http://localhost/${id}`,
    thumbnail: null,
    poster: null,
    durationMs: type === 'image' ? null : 60_000,
    width: 1280,
    height: 720,
    mimeType: 'application/octet-stream',
    size: 1,
    folderId: null,
    status: 'ready',
    metadata: {},
    ...overrides,
  }
}

function clip(id: string, assetId: string, trackId: TrackId, overrides: Partial<TimelineClip> = {}): TimelineClip {
  return {
    id,
    assetId,
    referenceId: assetId.toUpperCase(),
    trackId,
    sourceStartMs: 0,
    sourceEndMs: 5000,
    timelineStartMs: 0,
    durationMs: 5000,
    speed: 1,
    volume: 1,
    effects: {},
    ...overrides,
  }
}

function project(assets: Asset[], timelineClips: TimelineClip[]): EditorProject {
  return {
    id: 'proj_abc1234',
    title: 'Demo',
    instructions: '',
    assets,
    folders: [],
    canvasNodes: [],
    timelineClips,
    segments: [],
    commands: [],
    createdAt: 0,
    updatedAt: 0,
  }
}

const img = asset('asset_img', 'image')
const vid = asset('asset_vid', 'video')
const aud = asset('asset_aud', 'audio')

describe('toComposition', () => {
  it('produces a version 1 composition with one visual and one audio track', () => {
    const { composition } = toComposition(project([img], [clip('clip_1', 'asset_img', 'overlay', { durationMs: 3000 })]))

    expect(composition).toEqual({
      schemaVersion: 1,
      id: 'proj_abc1234',
      presetId: DEFAULT_PRESET_ID,
      tracks: [
        { id: 'track-visual', kind: 'visual', clips: [{ id: 'clip_1', kind: 'image', assetId: 'asset_img', durationMs: 3000 }] },
        { id: 'track-audio', kind: 'audio', clips: [] },
      ],
    })
  })

  it('merges the Video and Images lanes into one sequence ordered by timeline start', () => {
    const { composition } = toComposition(
      project(
        [img, vid],
        [
          clip('clip_v2', 'asset_vid', 'video', { timelineStartMs: 8000 }),
          clip('clip_i1', 'asset_img', 'overlay', { timelineStartMs: 5000, durationMs: 3000 }),
          clip('clip_v1', 'asset_vid', 'video', { timelineStartMs: 0 }),
        ],
      ),
    )

    expect(composition.tracks[0].clips.map((c) => c.id)).toEqual(['clip_v1', 'clip_i1', 'clip_v2'])
  })

  it('puts the Video lane first when two clips start together, then keeps insertion order', () => {
    const { composition } = toComposition(
      project(
        [img, vid],
        [
          clip('clip_i1', 'asset_img', 'overlay'),
          clip('clip_i2', 'asset_img', 'overlay'),
          clip('clip_v1', 'asset_vid', 'video'),
        ],
      ),
    )

    expect(composition.tracks[0].clips.map((c) => c.id)).toEqual(['clip_v1', 'clip_i1', 'clip_i2'])
  })

  it('maps a video clip and recomputes its duration from range and speed', () => {
    // The editor's own durationMs can drift (speed changes compound); it is not trusted.
    const { composition } = toComposition(
      project([vid], [clip('clip_v', 'asset_vid', 'video', { sourceStartMs: 1000, sourceEndMs: 7000, speed: 2, volume: 0.4, durationMs: 1234 })]),
    )

    expect(composition.tracks[0].clips).toEqual([
      { id: 'clip_v', kind: 'video', assetId: 'asset_vid', sourceStartMs: 1000, sourceEndMs: 7000, speed: 2, volume: 0.4, durationMs: 3000 },
    ])
  })

  it('uses the asset sliders when the clip still has default speed and volume', () => {
    const slid = asset('asset_vid', 'video', { metadata: { speed: 1.5, volume: 0.2 } })
    const { composition } = toComposition(project([slid], [clip('clip_v', 'asset_vid', 'video', { sourceEndMs: 3000 })]))

    expect(composition.tracks[0].clips[0]).toMatchObject({ speed: 1.5, volume: 0.2, durationMs: 2000 })
  })

  it('lets a clip value that was changed win over the asset sliders', () => {
    const slid = asset('asset_vid', 'video', { metadata: { speed: 1.5, volume: 0.2 } })
    const { composition } = toComposition(
      project([slid], [clip('clip_v', 'asset_vid', 'video', { sourceEndMs: 4000, speed: 4, volume: 0 })]),
    )

    expect(composition.tracks[0].clips[0]).toMatchObject({ speed: 4, volume: 0, durationMs: 1000 })
  })

  it('uses the image duration slider over the clip length', () => {
    const slid = asset('asset_img', 'image', { metadata: { imageDurationMs: 1500 } })
    const { composition } = toComposition(project([slid], [clip('clip_i', 'asset_img', 'overlay', { durationMs: 3000 })]))

    expect(composition.tracks[0].clips[0]).toEqual({ id: 'clip_i', kind: 'image', assetId: 'asset_img', durationMs: 1500 })
  })

  it('decides image or video from the asset, not from the lane', () => {
    const { composition } = toComposition(
      project([img, vid], [clip('clip_a', 'asset_img', 'video', { durationMs: 2000 }), clip('clip_b', 'asset_vid', 'overlay', { timelineStartMs: 2000 })]),
    )

    expect(composition.tracks[0].clips.map((c) => c.kind)).toEqual(['image', 'video'])
  })

  it('maps Audio lane clips with their timeline position and no fades', () => {
    const { composition } = toComposition(
      project(
        [img, aud],
        [
          clip('clip_i', 'asset_img', 'overlay'),
          clip('clip_a', 'asset_aud', 'audio', { sourceStartMs: 2000, sourceEndMs: 9000, timelineStartMs: 1500, volume: 0.65 }),
        ],
      ),
    )

    expect(composition.tracks[1].clips).toEqual([
      { id: 'clip_a', kind: 'audio', assetId: 'asset_aud', sourceStartMs: 2000, sourceEndMs: 9000, timelineStartMs: 1500, volume: 0.65, fadeInMs: 0, fadeOutMs: 0 },
    ])
  })

  it('lists each used asset once and leaves unused assets out', () => {
    const unused = asset('asset_unused', 'video')
    const { assets } = toComposition(
      project(
        [img, vid, aud, unused],
        [
          clip('clip_1', 'asset_vid', 'video'),
          clip('clip_2', 'asset_vid', 'video', { timelineStartMs: 5000 }),
          clip('clip_3', 'asset_aud', 'audio'),
        ],
      ),
    )

    expect(assets.map((a) => a.id)).toEqual(['asset_vid', 'asset_aud'])
  })

  it('skips clips whose asset is missing or cannot be rendered on that track', () => {
    const doc = asset('asset_doc', 'other')
    const result = toComposition(
      project(
        [img, aud, doc],
        [
          clip('clip_ok', 'asset_img', 'overlay'),
          clip('clip_gone', 'asset_deleted', 'video'),
          clip('clip_doc', 'asset_doc', 'video'),
          clip('clip_audio_on_video', 'asset_aud', 'video'),
          clip('clip_image_on_audio', 'asset_img', 'audio'),
        ],
      ),
    )

    expect(result.composition.tracks[0].clips.map((c) => c.id)).toEqual(['clip_ok'])
    expect(result.composition.tracks[1].clips).toEqual([])
    expect(result.skippedClipIds.sort()).toEqual(['clip_audio_on_video', 'clip_doc', 'clip_gone', 'clip_image_on_audio'])
    expect(result.assets.map((a) => a.id)).toEqual(['asset_img'])
  })

  it('rounds fractional times to whole milliseconds', () => {
    const { composition } = toComposition(
      project([vid], [clip('clip_v', 'asset_vid', 'video', { sourceStartMs: 0.4, sourceEndMs: 2999.6 })]),
    )

    expect(composition.tracks[0].clips[0]).toMatchObject({ sourceStartMs: 0, sourceEndMs: 3000, durationMs: 3000 })
  })

  it('carries no file paths, URLs, names, or canvas state', () => {
    const { composition } = toComposition(project([img, vid, aud], [clip('c1', 'asset_vid', 'video'), clip('c2', 'asset_aud', 'audio')]))
    const json = JSON.stringify(composition)

    expect(json).not.toContain('blob:')
    expect(json).not.toContain('.bin')
    expect(json).not.toContain('referenceId')
  })

  it('does not change the project', () => {
    const input = project([img, vid], [clip('c2', 'asset_vid', 'video', { timelineStartMs: 9 }), clip('c1', 'asset_img', 'overlay')])
    const before = JSON.stringify(input)

    toComposition(input)

    expect(JSON.stringify(input)).toBe(before)
  })

  it('returns an empty visual track for an empty timeline', () => {
    expect(toComposition(project([img], [])).composition.tracks[0].clips).toEqual([])
  })
})

describe('exportFileName', () => {
  it.each([
    ['My Summer Reel', 'my-summer-reel.mp4'],
    ['  Trip: Lagos → Accra!  ', 'trip-lagos-accra.mp4'],
    ['../../etc/passwd', 'etc-passwd.mp4'],
    ['', 'knarra-export.mp4'],
    ['***', 'knarra-export.mp4'],
  ])('turns %j into %j', (title, expected) => {
    expect(exportFileName(title)).toBe(expected)
  })
})
