import type { Asset, AssetType, ImportEntry, RefKind, SyntheticFile, TrackId } from './types'

export const ID_PREFIX: Record<RefKind, string> = {
  image: 'I',
  video: 'V',
  audio: 'A',
  reference: 'R',
  folder: 'F',
  other: 'X',
}

export const TRACKS: { id: TrackId; label: string; bg: string }[] = [
  { id: 'video', label: 'Video', bg: 'var(--ed-bg)' },
  { id: 'overlay', label: 'Images', bg: 'var(--ed-track-overlay)' },
  { id: 'audio', label: 'Audio', bg: 'var(--ed-bg)' },
]

export const uid = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 9)}`

export function isSynthetic(file: File | SyntheticFile): file is SyntheticFile {
  return 'src' in file
}

/** MIME first, extension as the fallback for files the OS didn't type. */
export function classify(file: File | SyntheticFile): AssetType {
  const type = (file.type || '').toLowerCase()
  const name = (file.name || '').toLowerCase()
  if (type.startsWith('image/') || /\.(png|jpe?g|gif|webp|avif|heic)$/.test(name)) return 'image'
  if (type.startsWith('video/') || /\.(mp4|mov|m4v|webm|avi|mkv)$/.test(name)) return 'video'
  if (type.startsWith('audio/') || /\.(mp3|wav|m4a|aac|flac|ogg)$/.test(name)) return 'audio'
  return 'other'
}

export function fmtTime(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return '--:--'
  const seconds = Math.max(0, Math.round(ms / 1000))
  const minutes = Math.floor(seconds / 60)
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

export function fmtSize(bytes: number): string {
  if (!bytes) return '—'
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

/** Parses an `mm:ss` clock out of a command, e.g. "trim 00:12 to 00:30". */
export function parseClock(text: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(text.trim())
  if (!match) return null
  return (parseInt(match[1], 10) * 60 + parseInt(match[2], 10)) * 1000
}

/**
 * Deterministic pseudo-waveform for audio cards. Seeded from the asset id so
 * the same clip always draws the same bars across renders.
 */
export function waveBars(seed: string, count: number): number[] {
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) % 100000
  const bars: number[] = []
  for (let i = 0; i < count; i += 1) {
    hash = (hash * 1103515245 + 12345) % 2147483648
    const value = 0.25 + ((hash >>> 8) % 1000) / 1000 * 0.75
    bars.push(Math.round(value * 100))
  }
  return bars
}

export type ProbeResult = Partial<
  Pick<Asset, 'width' | 'height' | 'durationMs' | 'thumbnail' | 'poster' | 'status'>
>

/**
 * Reads real dimensions and duration from the browser, and grabs a poster
 * frame for video. Every path resolves — a probe that fails degrades the card
 * rather than stalling the import.
 */
export function probe(asset: Asset): Promise<ProbeResult> {
  const url = asset.src

  if (asset.type === 'image') {
    return new Promise((resolve) => {
      const image = new Image()
      image.onload = () =>
        resolve({
          width: image.naturalWidth,
          height: image.naturalHeight,
          thumbnail: url,
          status: 'ready',
        })
      image.onerror = () => resolve({ status: 'error' })
      image.src = url
    })
  }

  if (asset.type === 'video') {
    return new Promise((resolve) => {
      const video = document.createElement('video')
      video.preload = 'metadata'
      video.muted = true
      video.playsInline = true
      video.src = url

      let settled = false
      const finish = (extra: ProbeResult) => {
        if (settled) return
        settled = true
        resolve({ status: 'ready', ...extra })
      }

      const grabPoster = () => {
        const base: ProbeResult = {
          durationMs: Math.round(video.duration * 1000),
          width: video.videoWidth,
          height: video.videoHeight,
        }
        try {
          const canvas = document.createElement('canvas')
          canvas.width = 320
          canvas.height = Math.max(1, Math.round((320 * (video.videoHeight || 9)) / (video.videoWidth || 16)))
          canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height)
          const poster = canvas.toDataURL('image/jpeg', 0.72)
          finish({ ...base, poster, thumbnail: poster })
        } catch {
          // A cross-origin source taints the canvas; keep the metadata we have.
          finish(base)
        }
      }

      video.onloadeddata = () => {
        try {
          video.currentTime = Math.min(0.12, (video.duration || 1) / 4)
        } catch {
          grabPoster()
        }
      }
      video.onseeked = grabPoster
      video.onerror = () => finish({ status: 'error' })
      setTimeout(() => finish({ durationMs: video.duration ? Math.round(video.duration * 1000) : 0 }), 4000)
    })
  }

  if (asset.type === 'audio') {
    return new Promise((resolve) => {
      const audio = document.createElement('audio')
      audio.preload = 'metadata'
      audio.src = url
      audio.onloadedmetadata = () => resolve({ status: 'ready', durationMs: Math.round(audio.duration * 1000) })
      audio.onerror = () => resolve({ status: 'error' })
      setTimeout(() => resolve({ status: 'ready' }), 3500)
    })
  }

  return Promise.resolve({ status: 'ready' })
}

/**
 * Walks a drop's `DataTransfer`, descending into dropped folders so a whole
 * shoot can be added at once. Falls back to the flat file list when the
 * browser doesn't expose directory entries.
 */
export function collectDrop(transfer: DataTransfer): Promise<ImportEntry[]> {
  const items = transfer.items ? Array.from(transfer.items) : []
  const entries = items
    .map((item) => (item.webkitGetAsEntry ? item.webkitGetAsEntry() : null))
    .filter((entry): entry is FileSystemEntry => Boolean(entry))

  if (!entries.length) {
    return Promise.resolve(Array.from(transfer.files ?? []).map((file) => ({ file, path: file.name })))
  }

  const collected: ImportEntry[] = []

  const walk = (entry: FileSystemEntry, prefix: string): Promise<void> =>
    new Promise((resolve) => {
      if (entry.isFile) {
        ;(entry as FileSystemFileEntry).file(
          (file) => {
            collected.push({ file, path: prefix + entry.name })
            resolve()
          },
          () => resolve(),
        )
        return
      }
      if (entry.isDirectory) {
        const reader = (entry as FileSystemDirectoryEntry).createReader()
        // readEntries returns at most a page at a time; keep reading until empty.
        const readBatch = () => {
          reader.readEntries(
            async (batch) => {
              if (!batch.length) {
                resolve()
                return
              }
              await Promise.all(batch.map((child) => walk(child, `${prefix + entry.name}/`)))
              readBatch()
            },
            () => resolve(),
          )
        }
        readBatch()
        return
      }
      resolve()
    })

  return Promise.all(entries.map((entry) => walk(entry, ''))).then(() => collected)
}
