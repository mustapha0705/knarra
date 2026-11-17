import { toComposition } from './composition'
import type { EditorProject } from './types'

/** An export problem with a message that is safe and useful to show the user. */
export class ExportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ExportError'
  }
}

type ErrorBody = { error?: string; issues?: { message?: string }[] }

async function failure(response: Response, fallback: string): Promise<ExportError> {
  const body = (await response.json().catch(() => null)) as ErrorBody | null
  return new ExportError(body?.issues?.[0]?.message ?? body?.error ?? `${fallback} (${response.status})`)
}

/**
 * Renders the project on the backend and returns the MP4.
 *
 * The backend has no stored media until asset ingestion exists (KNAR-502), so
 * the files the timeline uses are sent with each export: create an export,
 * upload each asset once, then send the Composition and receive the video.
 * The backend deletes the uploaded copies when the render ends.
 */
export async function exportProject(project: EditorProject, signal?: AbortSignal): Promise<Blob> {
  const { composition, assets } = toComposition(project)
  if (composition.tracks[0].clips.length === 0) {
    throw new ExportError('Add an image or video to the timeline before exporting.')
  }

  const created = await fetch('/api/exports', { method: 'POST', signal })
  if (!created.ok) throw await failure(created, 'Could not start the export')
  const { exportId } = (await created.json()) as { exportId: string }
  const base = `/api/exports/${encodeURIComponent(exportId)}`

  try {
    for (const asset of assets) {
      // `asset.src` is a blob: URL for imported files or a same-origin URL for
      // bundled media; either way fetch gives back the original bytes.
      const media = await fetch(asset.src, { signal })
      if (!media.ok) throw new ExportError(`Could not read ${asset.name}. Import it again and retry.`)

      const uploaded = await fetch(`${base}/assets/${encodeURIComponent(asset.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: await media.blob(),
        signal,
      })
      if (!uploaded.ok) throw await failure(uploaded, `Could not upload ${asset.name}`)
    }

    const rendered = await fetch(`${base}/render`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ composition }),
      signal,
    })
    if (!rendered.ok) throw await failure(rendered, 'Render failed')
    return await rendered.blob()
  } catch (error) {
    // The backend discards a rendered or failed export itself; this covers an
    // export abandoned before rendering. Best effort only.
    void fetch(base, { method: 'DELETE' }).catch(() => undefined)
    throw error
  }
}

/** A filesystem-friendly download name derived from the project title. */
export function exportFileName(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return `${slug || 'knarra-export'}.mp4`
}
