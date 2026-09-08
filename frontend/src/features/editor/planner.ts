import { fmtTime, parseClock, uid } from './media'
import type {
  CommandContext,
  EditOperation,
  EditOperationName,
  EditPlan,
  EditorProject,
  TrackId,
} from './types'

const SUPPORTED: EditOperationName[] = [
  'insertClip',
  'insertImage',
  'addAudio',
  'moveClip',
  'trimClip',
  'splitClip',
  'setSpeed',
  'setVolume',
  'setImageDuration',
  'setBrightness',
  'setContrast',
  'setSaturation',
  'addTransition',
  'removeClip',
]

/** The slice of project state a command is allowed to reason about. */
export function buildCommandContext(project: EditorProject, selectionAssetIds: string[]): CommandContext {
  return {
    projectId: project.id,
    assets: project.assets.map((asset) => ({
      referenceId: asset.referenceId,
      id: asset.id,
      name: asset.name,
      type: asset.type,
      role: asset.role,
      durationMs: asset.durationMs,
    })),
    segments: project.segments.map((segment) => ({
      referenceId: segment.referenceId,
      assetId: segment.assetId,
      startMs: segment.startMs,
      endMs: segment.endMs,
    })),
    timeline: project.timelineClips.map((clip) => ({
      id: clip.id,
      assetId: clip.assetId,
      trackId: clip.trackId,
      timelineStartMs: clip.timelineStartMs,
      durationMs: clip.durationMs,
    })),
    selection: selectionAssetIds.slice(),
  }
}

type RefEntry =
  | CommandContext['assets'][number]
  | CommandContext['segments'][number]

function indexByRef(context: CommandContext): Record<string, RefEntry> {
  const byRef: Record<string, RefEntry> = {}
  context.assets.forEach((asset) => {
    byRef[asset.referenceId] = asset
  })
  context.segments.forEach((segment) => {
    byRef[segment.referenceId] = segment
  })
  return byRef
}

function isSegment(entry: RefEntry | undefined): entry is CommandContext['segments'][number] {
  return Boolean(entry && 'assetId' in entry && (entry as { startMs?: number }).startMs != null)
}

/**
 * Deterministic local stand-in for the future LLM planner.
 *
 * It reads @-mentions, an `mm:ss to mm:ss` range, a speed multiplier, and a
 * handful of intent words, then emits the same operation shape the real
 * planner will produce — so validation, preview and apply can all be built
 * and exercised before any model is wired up.
 */
export function parseEditCommand(prompt: string, context: CommandContext): EditPlan {
  const text = prompt.trim()
  const plan: EditPlan = { version: 1, operations: [] }
  if (!text) return plan

  const mentioned: string[] = []
  const mentionPattern = /@([A-Z]\d+(?:-S\d+)?)/g
  let match: RegExpExecArray | null
  while ((match = mentionPattern.exec(text))) {
    if (!mentioned.includes(match[1])) mentioned.push(match[1])
  }

  const byRef = indexByRef(context)
  const lower = text.toLowerCase()
  const rangeMatch = /(\d{1,2}:\d{2})\s*(?:to|–|—|-)\s*(\d{1,2}:\d{2})/.exec(lower)
  const speedMatch = /(\d+(?:\.\d+)?)\s*(?:x|×)\s*speed|speed\s*(?:to\s*)?(\d+(?:\.\d+)?)\s*(?:x|×)/.exec(lower)
  const wantsMusic = /(background music|soundtrack|as music|music bed)/.test(lower)

  // With no explicit mention, a collective phrasing means "everything".
  const refs = mentioned.length
    ? mentioned
    : /(these|all|every|dump|montage)/.test(lower)
      ? context.assets.map((asset) => asset.referenceId)
      : []

  refs.forEach((ref, index) => {
    const entry = byRef[ref]
    if (!entry) {
      plan.operations.push({ op: 'insertClip', assetId: ref })
      return
    }

    const segment = isSegment(entry)
    const type = segment ? 'video' : (entry as CommandContext['assets'][number]).type

    if (type === 'audio') {
      plan.operations.push({
        op: 'addAudio',
        assetId: ref,
        timelineStartMs: 0,
        volume: wantsMusic ? 0.65 : 1,
      })
      return
    }

    if (type === 'image') {
      plan.operations.push({
        op: 'insertImage',
        assetId: ref,
        durationMs: 3000,
        after: index > 0 ? refs[index - 1] : undefined,
      })
      return
    }

    const operation: EditOperation = { op: 'insertClip', assetId: ref }
    if (segment) {
      const seg = entry as CommandContext['segments'][number]
      operation.sourceRange = { startMs: seg.startMs, endMs: seg.endMs }
    } else if (rangeMatch && refs.length === 1) {
      operation.sourceRange = { startMs: parseClock(rangeMatch[1]), endMs: parseClock(rangeMatch[2]) }
    }
    if (index > 0) operation.after = refs[index - 1]
    plan.operations.push(operation)
  })

  if (speedMatch) {
    const rate = parseFloat(speedMatch[1] || speedMatch[2])
    const target =
      refs.find((ref) => {
        const entry = byRef[ref]
        return entry && !isSegment(entry) && entry.type === 'video'
      }) ?? refs[refs.length - 1]
    if (target) plan.operations.push({ op: 'setSpeed', targetId: target, rate })
  }

  return plan
}

/** Every failure is phrased as something the user can act on. */
export function validateEditPlan(plan: EditPlan, context: CommandContext): { ok: boolean; errors: string[] } {
  const errors: string[] = []
  const byRef: Record<string, CommandContext['assets'][number]> = {}
  context.assets.forEach((asset) => {
    byRef[asset.referenceId] = asset
  })
  const segByRef: Record<string, CommandContext['segments'][number]> = {}
  context.segments.forEach((segment) => {
    segByRef[segment.referenceId] = segment
  })

  if (!plan.operations.length) {
    errors.push(
      'I could not find anything to edit. Mention an asset with @ (for example @V1) or describe the video you want.',
    )
    return { ok: false, errors }
  }

  plan.operations.forEach((operation) => {
    if (!SUPPORTED.includes(operation.op)) {
      errors.push(`Operation “${operation.op}” is not supported yet.`)
      return
    }

    const ref = operation.assetId || operation.targetId
    const asset = ref ? byRef[ref] : undefined
    const segment = ref ? segByRef[ref] : undefined

    if (ref && !asset && !segment) {
      errors.push(`${ref} is not in this project. Add it first, or mention a different asset.`)
      return
    }

    const duration = asset ? asset.durationMs : segment ? segment.endMs - segment.startMs : null

    if (operation.sourceRange) {
      const { startMs, endMs } = operation.sourceRange
      if (startMs == null || endMs == null) errors.push(`${ref}: I need both a start and an end time.`)
      else if (startMs >= endMs) errors.push(`${ref}: the start time must come before the end time.`)
      else if (asset?.durationMs && endMs > asset.durationMs) {
        errors.push(`${ref} is only ${fmtTime(asset.durationMs)} long. Which range should I use?`)
      }
    }
    if (operation.op === 'setSpeed' && (!(operation.rate && operation.rate > 0) || operation.rate > 8)) {
      errors.push(`A speed of ${operation.rate}× is outside the supported range (0.1×–8×).`)
    }
    if (operation.volume != null && (operation.volume < 0 || operation.volume > 1)) {
      errors.push('Volume must be between 0 and 1.')
    }
    if (operation.after && !byRef[operation.after] && !segByRef[operation.after]) {
      errors.push(`I could not find ${operation.after} to place this after.`)
    }
    if (operation.op === 'insertClip' && asset && asset.type !== 'video' && asset.role !== 'reference') {
      errors.push(`${ref} is ${asset.type === 'audio' ? 'audio' : 'an image'} — it cannot be inserted as a video clip.`)
    }
    if (duration === 0) errors.push(`${ref} has no readable duration yet.`)
  })

  return { ok: errors.length === 0, errors }
}

/** Plain-English preview of what Apply will do, one line per operation. */
export function describePlan(plan: EditPlan, context: CommandContext): string[] {
  const byRef = indexByRef(context)

  return plan.operations.map((operation) => {
    const ref = operation.assetId || operation.targetId
    const entry = ref ? byRef[ref] : undefined
    const name = entry && 'name' in entry && entry.name ? ` (${entry.name})` : ''

    switch (operation.op) {
      case 'insertClip':
        return operation.sourceRange
          ? `Extract ${ref}${name} from ${fmtTime(operation.sourceRange.startMs)} to ${fmtTime(operation.sourceRange.endMs)}${
              operation.after ? ` and insert it after ${operation.after}` : ' and add it to the video track'
            }.`
          : `Insert ${ref}${name}${operation.after ? ` after ${operation.after}` : ' on the video track'}.`
      case 'insertImage':
        return `Place ${ref}${name} on the image track for ${((operation.durationMs ?? 0) / 1000).toFixed(1)}s.`
      case 'addAudio':
        return `Add ${ref}${name} as audio at ${fmtTime(operation.timelineStartMs ?? 0)}${
          operation.volume != null ? ` (volume ${Math.round(operation.volume * 100)}%)` : ''
        }.`
      case 'setSpeed':
        return `Set ${ref}${name} to ${operation.rate}× speed.`
      case 'setVolume':
        return `Set ${ref} volume to ${Math.round((operation.volume ?? 0) * 100)}%.`
      case 'setImageDuration':
        return `Show ${ref} for ${((operation.durationMs ?? 0) / 1000).toFixed(1)}s.`
      case 'removeClip':
        return `Remove ${ref} from the timeline.`
      default:
        return `${operation.op} ${ref ?? ''}`.trim()
    }
  })
}

/** Applies a validated plan. Pure: returns a new project, never mutates. */
export function applyEditPlan(project: EditorProject, plan: EditPlan): EditorProject {
  const next: EditorProject = {
    ...project,
    assets: project.assets.slice(),
    segments: project.segments.slice(),
    canvasNodes: project.canvasNodes.slice(),
    timelineClips: project.timelineClips.slice(),
    updatedAt: Date.now(),
  }

  const trackEnd = (trackId: TrackId) =>
    next.timelineClips
      .filter((clip) => clip.trackId === trackId)
      .reduce((max, clip) => Math.max(max, clip.timelineStartMs + clip.durationMs), 0)

  plan.operations.forEach((operation) => {
    const ref = operation.assetId || operation.targetId
    const segment = next.segments.find((candidate) => candidate.referenceId === ref)
    const asset = segment
      ? next.assets.find((candidate) => candidate.id === segment.assetId)
      : next.assets.find((candidate) => candidate.referenceId === ref)
    if (!asset) return

    if (operation.op === 'insertClip' || operation.op === 'insertImage' || operation.op === 'addAudio') {
      const trackId: TrackId =
        operation.op === 'addAudio' ? 'audio' : operation.op === 'insertImage' ? 'overlay' : 'video'
      const range = operation.sourceRange ?? (segment ? { startMs: segment.startMs, endMs: segment.endMs } : null)
      const sourceStart = range?.startMs ?? 0
      const sourceEnd = range?.endMs ?? asset.durationMs ?? operation.durationMs ?? 3000
      const duration = operation.durationMs ?? Math.max(200, sourceEnd - sourceStart)

      next.timelineClips.push({
        id: uid('clip'),
        assetId: asset.id,
        referenceId: segment ? segment.referenceId : asset.referenceId,
        trackId,
        sourceStartMs: sourceStart,
        sourceEndMs: sourceEnd,
        timelineStartMs: operation.timelineStartMs ?? trackEnd(trackId),
        durationMs: duration,
        speed: 1,
        volume: operation.volume ?? 1,
        effects: {},
      })
      return
    }

    if (operation.op === 'setSpeed' || operation.op === 'setVolume' || operation.op === 'setImageDuration') {
      next.timelineClips = next.timelineClips.map((clip) => {
        if (clip.assetId !== asset.id) return clip
        if (operation.op === 'setSpeed') {
          const rate = operation.rate ?? 1
          return { ...clip, speed: rate, durationMs: Math.max(200, Math.round(clip.durationMs / rate)) }
        }
        if (operation.op === 'setVolume') return { ...clip, volume: operation.volume ?? clip.volume }
        return { ...clip, durationMs: operation.durationMs ?? clip.durationMs }
      })
      return
    }

    if (operation.op === 'removeClip') {
      next.timelineClips = next.timelineClips.filter((clip) => clip.assetId !== asset.id)
    }
  })

  return next
}

/**
 * Placeholder for the deterministic render engine. The plan is applied to
 * project state either way; nothing is encoded yet.
 */
export function executeEditPlan(plan: EditPlan): Promise<{ status: 'not-connected' }> {
  console.info('[executeEditPlan] no render engine connected; operations:', plan.operations.length)
  return Promise.resolve({ status: 'not-connected' })
}
