import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react'
import { MinusIcon, PlusIcon } from '../../components/icons'
import { useBodySurface, useEventCallback } from '../../lib/hooks'
import { Canvas } from './Canvas'
import { clampZoom, toCanvasPoint, type Pan } from './canvasGeometry'
import { CommandDock, type ContextChip, type MentionEntry } from './CommandDock'
import { EditorToolbar } from './EditorToolbar'
import { PlanCard } from './PlanCard'
import { StudioPanel } from './StudioPanel'
import { Timeline } from './Timeline'
import { WorkspacePicker } from './WorkspacePicker'
import {
  ID_PREFIX,
  classify,
  collectDrop,
  fmtTime,
  isSynthetic,
  probe,
  uid,
} from './media'
import {
  applyEditPlan,
  buildCommandContext,
  describePlan,
  executeEditPlan,
  parseEditCommand,
  validateEditPlan,
} from './planner'
import { useProjectHistory } from './useProjectHistory'
import type {
  Asset,
  AssetMetadata,
  EditPlan,
  EditorMode,
  EditorProject,
  EditorToast,
  ImportEntry,
  RefKind,
  Segment,
  SyntheticFile,
  TrackId,
} from './types'
import styles from './Editor.module.css'

type ProjectEditorProps = {
  projectTitle: string
  onHome: () => void
}

const NODE_SIZE = 168
const NODE_STRIDE_X = 178
const NODE_STRIDE_Y = 176
const SUGGESTIONS = [
  'Create a monthly dump video from these files.',
  'Use @A1 as background music.',
  'Make @V1 play at 2× speed.',
]

function emptyProject(title: string): EditorProject {
  return {
    id: uid('proj'),
    title,
    instructions: '',
    assets: [],
    folders: [],
    canvasNodes: [],
    timelineClips: [],
    segments: [],
    commands: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

export function ProjectEditor({ projectTitle, onHome }: ProjectEditorProps) {
  useBodySurface('editor')

  const {
    project,
    canUndo,
    canRedo,
    commit: commitToHistory,
    patch,
    undo,
    redo,
  } = useProjectHistory(() => emptyProject(projectTitle))

  const [mode, setMode] = useState<EditorMode>('canvas')
  const [selection, setSelection] = useState<string[]>([])
  const [activeAssetId, setActiveAssetId] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState<Pan>({ x: 0, y: 0 })
  const [dragOver, setDragOver] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [importing, setImporting] = useState<{ done: number; total: number } | null>(null)
  const [toasts, setToasts] = useState<EditorToast[]>([])
  const [assetQuery, setAssetQuery] = useState('')
  const [timelineZoom, setTimelineZoom] = useState(42)
  const [saveState, setSaveState] = useState('Saved')

  const [prompt, setPrompt] = useState('')
  const [plan, setPlan] = useState<EditPlan | null>(null)
  const [planErrors, setPlanErrors] = useState<string[]>([])
  const [planDetailsOpen, setPlanDetailsOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [status, setStatus] = useState('')
  const [statusTone, setStatusTone] = useState<'muted' | 'warn' | 'ok'>('muted')

  const [playing, setPlaying] = useState(false)
  const [currentMs, setCurrentMs] = useState(0)
  const [durationMs, setDurationMs] = useState(0)
  const [volume, setVolume] = useState(1)
  const [inMs, setInMs] = useState<number | null>(null)
  const [outMs, setOutMs] = useState<number | null>(null)

  const canvasRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dirInputRef = useRef<HTMLInputElement>(null)
  const mediaRef = useRef<HTMLMediaElement | null>(null)
  const counters = useRef<Record<RefKind, number>>({
    image: 0,
    video: 0,
    audio: 0,
    reference: 0,
    folder: 0,
    other: 0,
  })
  const objectUrls = useRef<string[]>([])
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const active = project.assets.find((asset) => asset.id === activeAssetId) ?? null

  /* ---------- housekeeping ---------- */

  useEffect(() => {
    const urls = objectUrls.current
    return () => {
      urls.forEach((url) => {
        try {
          URL.revokeObjectURL(url)
        } catch {
          // Already revoked.
        }
      })
    }
  }, [])

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
  }, [])

  /**
   * Every committed edit flips the toolbar indicator to "Saving…" and settles
   * back to "Saved". Undo and redo deliberately don't — they replay history
   * rather than producing a new save.
   */
  const commit = useCallback(
    (mutate: (current: EditorProject) => EditorProject) => {
      commitToHistory(mutate)
      setSaveState('Saving…')
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => setSaveState('Saved'), 550)
    },
    [commitToHistory],
  )

  const toast = (text: string, tone: EditorToast['tone'] = 'info') => {
    const id = uid('toast')
    setToasts((current) => [...current, { id, text, tone }])
    setTimeout(() => setToasts((current) => current.filter((entry) => entry.id !== id)), 4200)
  }

  /* ---------- import ---------- */

  const nextRef = (kind: RefKind) => {
    counters.current[kind] = (counters.current[kind] ?? 0) + 1
    return `${ID_PREFIX[kind]}${counters.current[kind]}`
  }

  const makeAsset = (file: File | SyntheticFile, folderId?: string): Asset => {
    const type = classify(file)
    const src = isSynthetic(file) ? file.src : URL.createObjectURL(file)
    if (!isSynthetic(file)) objectUrls.current.push(src)

    return {
      id: uid('asset'),
      referenceId: nextRef(type),
      name: file.name,
      type,
      role: 'source',
      src,
      thumbnail: type === 'image' ? src : null,
      poster: null,
      durationMs: null,
      width: null,
      height: null,
      mimeType: file.type || '',
      size: file.size || 0,
      folderId: folderId ?? null,
      status: 'processing',
      metadata: {},
    }
  }

  const canvasCenter = () => {
    const element = canvasRef.current
    if (!element) return { x: (-pan.x + 450) / zoom, y: (-pan.y + 260) / zoom }
    const rect = element.getBoundingClientRect()
    return toCanvasPoint(element, rect.left + rect.width / 2, rect.top + rect.height / 2 - 40, pan, zoom)
  }

  /**
   * Turns dropped or picked files into assets, folders and canvas nodes, then
   * probes each asset for real metadata in the background.
   */
  const ingest = async (entries: ImportEntry[], dropPoint: { x: number; y: number } | null) => {
    const supported = entries.filter((entry) => classify(entry.file) !== 'other')
    const rejected = entries.length - supported.length

    if (!supported.length) {
      if (rejected) toast(`${rejected} file${rejected > 1 ? 's' : ''} skipped — unsupported format`, 'warn')
      return
    }

    setImporting({ done: 0, total: supported.length })

    // A dropped folder becomes one node; loose files each get their own.
    const byFolder = new Map<string, ImportEntry[]>()
    const loose: ImportEntry[] = []
    supported.forEach((entry) => {
      const top = entry.path.includes('/') ? entry.path.split('/')[0] : null
      if (top) {
        const bucket = byFolder.get(top) ?? []
        bucket.push(entry)
        byFolder.set(top, bucket)
      } else {
        loose.push(entry)
      }
    })

    const newAssets: Asset[] = []
    const newFolders: EditorProject['folders'] = []
    const newNodes: EditorProject['canvasNodes'] = []
    const base = dropPoint ?? canvasCenter()

    let slot = 0
    const place = () => {
      const column = slot % 4
      const row = Math.floor(slot / 4)
      slot += 1
      return {
        x: Math.round(base.x + column * NODE_STRIDE_X - 88),
        y: Math.round(base.y + row * NODE_STRIDE_Y - 70),
      }
    }

    byFolder.forEach((list, name) => {
      const folder = {
        id: uid('folder'),
        referenceId: nextRef('folder'),
        name,
        assetIds: [] as string[],
        createdAt: Date.now(),
      }
      list.forEach((entry) => {
        const asset = makeAsset(entry.file, folder.id)
        newAssets.push(asset)
        folder.assetIds.push(asset.id)
      })
      newFolders.push(folder)
      const point = place()
      newNodes.push({
        id: uid('node'),
        folderId: folder.id,
        x: point.x,
        y: point.y,
        width: NODE_SIZE,
        height: NODE_SIZE,
        scale: 1,
        rotation: 0,
        zIndex: newNodes.length + 1,
        groupId: null,
      })
    })

    loose.forEach((entry) => {
      const asset = makeAsset(entry.file)
      newAssets.push(asset)
      const point = place()
      newNodes.push({
        id: uid('node'),
        assetId: asset.id,
        x: point.x,
        y: point.y,
        width: NODE_SIZE,
        height: NODE_SIZE,
        scale: 1,
        rotation: 0,
        zIndex: newNodes.length + 1,
        groupId: null,
      })
    })

    commit((current) => ({
      ...current,
      assets: current.assets.concat(newAssets),
      folders: current.folders.concat(newFolders),
      canvasNodes: current.canvasNodes.concat(newNodes),
      updatedAt: Date.now(),
    }))

    let done = 0
    for (const asset of newAssets) {
      const meta = await probe(asset)
      done += 1
      setImporting({ done, total: newAssets.length })
      // Metadata arrives after the fact; patch it in without touching history.
      patch((current) => ({
        ...current,
        assets: current.assets.map((entry) => (entry.id === asset.id ? { ...entry, ...meta } : entry)),
      }))
    }
    setImporting(null)

    if (newFolders.length === 1 && !loose.length) toast(`${newFolders[0].name} folder added`)
    else if (newFolders.length) {
      toast(
        `${newFolders.length} folder${newFolders.length > 1 ? 's' : ''} and ${loose.length} file${
          loose.length === 1 ? '' : 's'
        } added`,
      )
    } else toast(`${newAssets.length} file${newAssets.length > 1 ? 's' : ''} added`)

    if (rejected) toast(`${rejected} file${rejected > 1 ? 's' : ''} skipped — unsupported format`, 'warn')
  }

  const openFilePicker = () => {
    const input = fileInputRef.current
    setMenuOpen(false)
    if (!input) {
      toast('The file picker could not be opened.', 'warn')
      return
    }
    input.value = ''
    input.click()
  }

  const openFolderPicker = () => {
    const input = dirInputRef.current
    setMenuOpen(false)
    if (!input) {
      toast('The folder picker could not be opened.', 'warn')
      return
    }
    const supportsDirectory =
      Reflect.has(input, 'webkitdirectory') || input.hasAttribute('webkitdirectory')
    if (!supportsDirectory) {
      toast(
        'Folder selection is not supported in this browser. You can still drag the folder onto the canvas.',
        'warn',
      )
      return
    }
    input.value = ''
    input.click()
  }

  /* ---------- canvas ---------- */

  const zoomAt = (clientX: number, clientY: number, factor: number) => {
    const rect = canvasRef.current?.getBoundingClientRect() ?? { left: 0, top: 0 }
    const next = clampZoom(zoom * factor)
    const ratio = next / zoom
    const px = clientX - rect.left
    const py = clientY - rect.top
    setZoom(next)
    setPan({ x: px - (px - pan.x) * ratio, y: py - (py - pan.y) * ratio })
  }

  const zoomBy = (factor: number) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) {
      setZoom(clampZoom(zoom * factor))
      return
    }
    zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, factor)
  }

  const fitAll = () => {
    const nodes = project.canvasNodes
    const element = canvasRef.current
    if (!nodes.length || !element) {
      setZoom(1)
      setPan({ x: 0, y: 0 })
      return
    }
    const rect = element.getBoundingClientRect()
    const x0 = Math.min(...nodes.map((node) => node.x)) - 40
    const y0 = Math.min(...nodes.map((node) => node.y)) - 40
    const x1 = Math.max(...nodes.map((node) => node.x + node.width)) + 40
    const y1 = Math.max(...nodes.map((node) => node.y + node.height)) + 40
    // Leave room for the command dock along the bottom.
    const next = Math.max(0.25, Math.min(1.6, Math.min(rect.width / (x1 - x0), (rect.height - 150) / (y1 - y0))))
    setZoom(next)
    setPan({ x: -x0 * next + (rect.width - (x1 - x0) * next) / 2, y: -y0 * next + 20 })
  }

  const selectNode = (nodeId: string, additive: boolean) => {
    const node = project.canvasNodes.find((candidate) => candidate.id === nodeId)
    setSelection((current) => {
      const has = current.includes(nodeId)
      if (!additive) return [nodeId]
      return has ? current.filter((id) => id !== nodeId) : [...current, nodeId]
    })
    if (node?.assetId) setActiveAssetId(node.assetId)
    else if (node?.folderId && !additive) setActiveAssetId(null)
    resetPlayback()
  }

  const resetPlayback = () => {
    setInMs(null)
    setOutMs(null)
    setCurrentMs(0)
    setPlaying(false)
  }

  const setActiveAsset = (assetId: string) => {
    setActiveAssetId(assetId)
    setDurationMs(0)
    resetPlayback()
  }

  const deleteSelection = () => {
    if (!selection.length) return
    const ids = selection
    commit((current) => ({
      ...current,
      canvasNodes: current.canvasNodes.filter((node) => !ids.includes(node.id)),
    }))
    setSelection([])
    toast(`${ids.length} item${ids.length > 1 ? 's' : ''} removed from canvas · ⌘Z to undo`)
  }

  /* ---------- global keyboard ---------- */

  const onGlobalKeyDown = useEventCallback((event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      setMenuOpen(false)
      setPickerOpen(false)
      return
    }

    const tag = (event.target as HTMLElement | null)?.tagName?.toLowerCase()
    if (tag === 'input' || tag === 'textarea') return

    if ((event.key === 'Delete' || event.key === 'Backspace') && selection.length) {
      event.preventDefault()
      deleteSelection()
    } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault()
      if (event.shiftKey) redo()
      else undo()
    }
  })

  useEffect(() => {
    document.addEventListener('keydown', onGlobalKeyDown)
    return () => document.removeEventListener('keydown', onGlobalKeyDown)
  }, [onGlobalKeyDown])

  const reorderNode = (nodeId: string, direction: 1 | -1) => {
    commit((current) => {
      const max = current.canvasNodes.reduce((value, node) => Math.max(value, node.zIndex), 0)
      return {
        ...current,
        canvasNodes: current.canvasNodes.map((node) =>
          node.id === nodeId ? { ...node, zIndex: direction > 0 ? max + 1 : 0 } : node,
        ),
      }
    })
  }

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragOver(false)
    const segmentId = event.dataTransfer.getData('application/x-segment')
    const point = toCanvasPoint(canvasRef.current, event.clientX, event.clientY, pan, zoom)
    if (segmentId) {
      dropSegment(segmentId, point)
      return
    }
    collectDrop(event.dataTransfer).then((entries) => {
      if (entries.length) void ingest(entries, point)
    })
  }

  /* ---------- assets ---------- */

  const setAssetMeta = (assetId: string, meta: AssetMetadata) => {
    commit((current) => ({
      ...current,
      assets: current.assets.map((asset) =>
        asset.id === assetId ? { ...asset, metadata: { ...asset.metadata, ...meta } } : asset,
      ),
    }))
  }

  const removeAssetNode = (assetId: string) => {
    commit((current) => ({
      ...current,
      canvasNodes: current.canvasNodes.filter((node) => node.assetId !== assetId),
    }))
    toast('Removed from canvas · ⌘Z to undo')
  }

  const duplicateAssetNode = (assetId: string) => {
    commit((current) => {
      const source = current.canvasNodes.find((node) => node.assetId === assetId)
      if (!source) return current
      const max = current.canvasNodes.reduce((value, node) => Math.max(value, node.zIndex), 0)
      return {
        ...current,
        canvasNodes: current.canvasNodes.concat({
          ...source,
          id: uid('node'),
          x: source.x + 26,
          y: source.y + 26,
          zIndex: max + 1,
        }),
      }
    })
  }

  const toggleReference = (assetId: string) => {
    // Marking as a reference re-keys the asset to an R-prefixed handle and
    // stashes the old one so unmarking can restore it.
    const referenceId = nextRef('reference')
    commit((current) => ({
      ...current,
      assets: current.assets.map((asset) => {
        if (asset.id !== assetId) return asset
        const wasReference = asset.role === 'reference'
        return {
          ...asset,
          role: wasReference ? 'source' : 'reference',
          referenceId: wasReference ? (asset.metadata.sourceRef ?? asset.referenceId) : referenceId,
          metadata: { ...asset.metadata, sourceRef: wasReference ? null : asset.referenceId },
        }
      }),
    }))
  }

  const addAssetToTimeline = (
    assetId: string,
    range?: { startMs: number; endMs: number; referenceId: string },
  ) => {
    const asset = project.assets.find((candidate) => candidate.id === assetId)
    if (!asset) return
    const trackId: TrackId = asset.type === 'audio' ? 'audio' : asset.type === 'image' ? 'overlay' : 'video'

    commit((current) => {
      const end = current.timelineClips
        .filter((clip) => clip.trackId === trackId)
        .reduce((max, clip) => Math.max(max, clip.timelineStartMs + clip.durationMs), 0)
      const start = range ? range.startMs : 0
      const stop = range ? range.endMs : (asset.durationMs ?? 3000)
      return {
        ...current,
        timelineClips: current.timelineClips.concat({
          id: uid('clip'),
          assetId: asset.id,
          referenceId: range?.referenceId ?? asset.referenceId,
          trackId,
          sourceStartMs: start,
          sourceEndMs: stop,
          timelineStartMs: end,
          durationMs: Math.max(400, stop - start),
          speed: 1,
          volume: 1,
          effects: {},
        }),
      }
    })
    toast(`${asset.referenceId} added to timeline`)
  }

  const createSegment = () => {
    if (!active || inMs == null || outMs == null) return
    const index = project.segments.filter((segment) => segment.assetId === active.id).length + 1
    const segment: Segment = {
      id: uid('seg'),
      referenceId: `${active.referenceId}-S${index}`,
      assetId: active.id,
      startMs: Math.min(inMs, outMs),
      endMs: Math.max(inMs, outMs),
      label: `${active.name} range ${index}`,
    }
    commit((current) => ({ ...current, segments: current.segments.concat(segment) }))
    toast(`${segment.referenceId} · ${fmtTime(segment.startMs)}–${fmtTime(segment.endMs)} created`)
  }

  const dropSegment = (segmentId: string, point: { x: number; y: number }) => {
    const segment = project.segments.find((candidate) => candidate.id === segmentId)
    if (!segment) return
    commit((current) => {
      const max = current.canvasNodes.reduce((value, node) => Math.max(value, node.zIndex), 0)
      return {
        ...current,
        canvasNodes: current.canvasNodes.concat({
          id: uid('node'),
          assetId: segment.assetId,
          segmentId: segment.id,
          x: Math.round(point.x - 84),
          y: Math.round(point.y - 70),
          width: NODE_SIZE,
          height: NODE_SIZE,
          scale: 1,
          rotation: 0,
          zIndex: max + 1,
          groupId: null,
        }),
      }
    })
  }

  /* ---------- playback ---------- */

  const togglePlay = () => {
    const element = mediaRef.current
    if (!element) {
      toast('Select a video or audio asset to play.')
      return
    }
    if (element.paused) {
      element.volume = volume
      element
        .play()
        .then(() => setPlaying(true))
        .catch(() => {
          // Autoplay policies can refuse; leave the transport paused.
        })
    } else {
      element.pause()
      setPlaying(false)
    }
  }

  const seekRatio = (ratio: number) => {
    const element = mediaRef.current
    const span = durationMs
    if (!element || !span) return
    const ms = Math.max(0, Math.min(span, ratio * span))
    element.currentTime = ms / 1000
    setCurrentMs(Math.round(ms))
  }

  /* ---------- command flow ---------- */

  const selectedAssetIds = () => {
    const ids: string[] = []
    selection.forEach((nodeId) => {
      const node = project.canvasNodes.find((candidate) => candidate.id === nodeId)
      if (!node) return
      if (node.assetId) ids.push(node.assetId)
      if (node.folderId) {
        const folder = project.folders.find((candidate) => candidate.id === node.folderId)
        folder?.assetIds.forEach((id) => ids.push(id))
      }
    })
    if (activeAssetId && !ids.includes(activeAssetId)) ids.push(activeAssetId)
    return ids
  }

  const submitPrompt = () => {
    const text = prompt.trim()
    if (!text) return
    if (!project.assets.length) {
      setStatus('Add media before running a command.')
      setStatusTone('warn')
      setPlan(null)
      return
    }

    const ids = selectedAssetIds()
    const context = buildCommandContext(project, ids)

    // An unmentioned command still needs a subject: fall back to the selection.
    let enriched = text
    if (!/@[A-Z]\d/.test(enriched) && ids.length) {
      const refs = ids
        .map((id) => project.assets.find((asset) => asset.id === id)?.referenceId)
        .filter((ref): ref is string => Boolean(ref))
      enriched += ` ${refs.map((ref) => `@${ref}`).join(' ')}`
    }

    const nextPlan = parseEditCommand(enriched, context)
    const result = validateEditPlan(nextPlan, context)
    setPlan(nextPlan)
    setPlanErrors(result.errors)
    setPlanDetailsOpen(false)
    setStatus(result.ok ? 'Review the proposed edit' : '')
    setStatusTone('muted')
  }

  const applyPlan = () => {
    if (!plan) return
    const context = buildCommandContext(project, selectedAssetIds())
    const result = validateEditPlan(plan, context)
    if (!result.ok) {
      setPlanErrors(result.errors)
      return
    }

    const submitted = prompt.trim()
    commit((current) => {
      const next = applyEditPlan(current, plan)
      next.commands = current.commands.concat({
        id: uid('cmd'),
        prompt: submitted,
        status: 'applied',
        proposedPlan: plan,
        appliedOperations: plan.operations,
        createdAt: Date.now(),
      })
      return next
    })
    void executeEditPlan(plan)

    setPlan(null)
    setPlanErrors([])
    setPrompt('')
    setStatus('Applied · ⌘Z to undo')
    setStatusTone('ok')
    setMode('timeline')
  }

  /* ---------- derived view data ---------- */

  const planSteps = plan ? describePlan(plan, buildCommandContext(project, selectedAssetIds())) : []

  const mentionPool: MentionEntry[] = project.assets
    .map((asset) => ({
      referenceId: asset.referenceId,
      name: asset.name,
      meta: asset.durationMs ? fmtTime(asset.durationMs) : asset.type,
    }))
    .concat(
      project.segments.map((segment) => ({
        referenceId: segment.referenceId,
        name: segment.label,
        meta: `${fmtTime(segment.startMs)}–${fmtTime(segment.endMs)}`,
      })),
    )

  const contextChips: ContextChip[] = selection
    .map((nodeId) => {
      const node = project.canvasNodes.find((candidate) => candidate.id === nodeId)
      if (!node) return null
      const folder = node.folderId ? project.folders.find((entry) => entry.id === node.folderId) : undefined
      const asset = node.assetId ? project.assets.find((entry) => entry.id === node.assetId) : undefined
      return { id: nodeId, label: folder?.referenceId ?? asset?.referenceId ?? '' }
    })
    .filter((chip): chip is ContextChip => chip !== null)

  const addSourcesHandlers = {
    onAddFromWorkspace: () => {
      setMenuOpen(false)
      setPickerOpen(true)
    },
    onUploadFile: openFilePicker,
    onUploadFolder: openFolderPicker,
    onCreateMarkdown: () => {
      setMenuOpen(false)
      toast('Markdown notes aren’t built yet.')
    },
    onCreateLink: () => {
      setMenuOpen(false)
      toast('Link sources aren’t built yet.')
    },
    onCreateSandbox: () => {
      setMenuOpen(false)
      toast('Sandbox isn’t built yet.')
    },
  }

  return (
    <div className={styles.shell}>
      <EditorToolbar
        title={project.title}
        saveState={saveState}
        mode={mode}
        menuOpen={menuOpen}
        canUndo={canUndo}
        canRedo={canRedo}
        assetQuery={assetQuery}
        playing={playing}
        onTitleChange={(title) => commit((current) => ({ ...current, title }))}
        onModeChange={setMode}
        onToggleMenu={() => setMenuOpen((open) => !open)}
        onCloseMenu={() => setMenuOpen(false)}
        onUndo={undo}
        onRedo={redo}
        onAssetQueryChange={setAssetQuery}
        onTogglePlay={togglePlay}
        onExport={() => toast('Export isn’t connected in this prototype.', 'warn')}
        onHome={onHome}
        {...addSourcesHandlers}
      />

      <div className={styles.body}>
        <div className={styles.main}>
          {mode === 'canvas' ? (
            <Canvas
              canvasRef={canvasRef}
              project={project}
              selection={selection}
              activeAssetId={activeAssetId}
              expanded={expanded}
              zoom={zoom}
              pan={pan}
              dragOver={dragOver}
              onSelectionChange={setSelection}
              onPanChange={setPan}
              onZoomAt={zoomAt}
              onNodeSelect={selectNode}
              onNodesMoved={(ids, dx, dy) =>
                commit((current) => ({
                  ...current,
                  canvasNodes: current.canvasNodes.map((node) =>
                    ids.includes(node.id)
                      ? { ...node, x: Math.round(node.x + dx), y: Math.round(node.y + dy) }
                      : node,
                  ),
                }))
              }
              onToggleExpanded={(nodeId) =>
                setExpanded((current) => ({ ...current, [nodeId]: !current[nodeId] }))
              }
              onSetActiveAsset={setActiveAsset}
              onDeleteNode={(nodeId) => {
                setSelection([nodeId])
                commit((current) => ({
                  ...current,
                  canvasNodes: current.canvasNodes.filter((node) => node.id !== nodeId),
                }))
                setSelection([])
                toast('1 item removed from canvas · ⌘Z to undo')
              }}
              onReorderNode={reorderNode}
              onDragOver={(event) => {
                event.preventDefault()
                if (!dragOver) setDragOver(true)
              }}
              onDragLeave={(event) => {
                if (event.currentTarget.contains(event.relatedTarget as Node)) return
                setDragOver(false)
              }}
              onDrop={onDrop}
              onUploadFile={openFilePicker}
              onUploadFolder={openFolderPicker}
              onAddFromWorkspace={() => setPickerOpen(true)}
            />
          ) : (
            <Timeline
              project={project}
              activeAssetId={activeAssetId}
              pxPerSecond={timelineZoom}
              currentMs={currentMs}
              onZoomIn={() => setTimelineZoom((value) => Math.min(160, value * 1.4))}
              onZoomOut={() => setTimelineZoom((value) => Math.max(12, value / 1.4))}
              onSelectClip={(clip) => setActiveAsset(clip.assetId)}
              onClipMoved={(clipId, startMs) =>
                commit((current) => ({
                  ...current,
                  timelineClips: current.timelineClips.map((clip) =>
                    clip.id === clipId ? { ...clip, timelineStartMs: startMs } : clip,
                  ),
                }))
              }
            />
          )}

          <div className={styles.dock}>
            {mode === 'canvas' && (
              <div className={styles.zoomRow}>
                <div className={styles.zoomBar}>
                  <button
                    type="button"
                    aria-label="Zoom out"
                    className={styles.zoomButton}
                    onClick={() => zoomBy(1 / 1.2)}
                  >
                    <MinusIcon size={15} />
                  </button>
                  <div aria-live="polite" className={styles.zoomValue}>
                    {Math.round(zoom * 100)}%
                  </div>
                  <button
                    type="button"
                    aria-label="Zoom in"
                    className={styles.zoomButton}
                    onClick={() => zoomBy(1.2)}
                  >
                    <PlusIcon size={15} strokeWidth={1.8} />
                  </button>
                  <div className={styles.zoomDivider} />
                  <button type="button" className={styles.zoomFit} onClick={fitAll}>
                    Fit all
                  </button>
                </div>
              </div>
            )}

            {plan && (
              <PlanCard
                plan={plan}
                steps={planSteps}
                errors={planErrors}
                detailsOpen={planDetailsOpen}
                onApply={applyPlan}
                onToggleDetails={() => setPlanDetailsOpen((open) => !open)}
                onCancel={() => {
                  setPlan(null)
                  setPlanErrors([])
                  setStatus('')
                }}
              />
            )}

            <CommandDock
              prompt={prompt}
              mentionPool={mentionPool}
              contextChips={contextChips}
              suggestions={SUGGESTIONS}
              showSuggestions={!prompt.trim() && !plan}
              status={status}
              statusTone={statusTone}
              history={project.commands}
              historyOpen={historyOpen}
              onPromptChange={(value) => {
                setPrompt(value)
                setStatus('')
              }}
              onSubmit={submitPrompt}
              onRemoveChip={(id) => setSelection((current) => current.filter((nodeId) => nodeId !== id))}
              onPickSuggestion={setPrompt}
              onToggleHistory={() => setHistoryOpen((open) => !open)}
              onAttach={() => setMenuOpen((open) => !open)}
            />
          </div>

          <div className={styles.statusStack}>
            {importing && (
              <div role="status" className={styles.importPill}>
                <span>
                  Importing {importing.done}/{importing.total}
                </span>
                <div className={styles.importTrack}>
                  <div
                    className={styles.importFill}
                    style={{ width: `${Math.round((importing.done / Math.max(1, importing.total)) * 100)}%` }}
                  />
                </div>
              </div>
            )}
            {toasts.map((entry) => (
              <div
                key={entry.id}
                role="status"
                className={[styles.toast, entry.tone === 'warn' && styles.toastWarn].filter(Boolean).join(' ')}
              >
                {entry.text}
              </div>
            ))}
          </div>

          {pickerOpen && (
            <WorkspacePicker
              onClose={() => setPickerOpen(false)}
              onConfirm={(picks) => {
                setPickerOpen(false)
                if (!picks.length) return
                void ingest(
                  picks.map((pick) => ({
                    file: { name: pick.name, type: 'image/png', size: 0, src: pick.src },
                    path: pick.name,
                  })),
                  null,
                )
              }}
            />
          )}
        </div>

        <StudioPanel
          project={project}
          active={active}
          assetQuery={assetQuery}
          playing={playing}
          currentMs={currentMs}
          durationMs={durationMs}
          volume={volume}
          inMs={inMs}
          outMs={outMs}
          onAttachMedia={(element) => {
            mediaRef.current = element
            if (element) element.volume = volume
          }}
          onLoadedMetadata={setDurationMs}
          onTimeUpdate={setCurrentMs}
          onEnded={() => setPlaying(false)}
          onTogglePlay={togglePlay}
          onSeekRatio={seekRatio}
          onVolumeChange={(next) => {
            setVolume(next)
            if (mediaRef.current) mediaRef.current.volume = next
          }}
          onSetIn={() => setInMs(currentMs)}
          onSetOut={() => setOutMs(currentMs)}
          onCreateSegment={createSegment}
          onRenameAsset={(name) => {
            if (!active) return
            const id = active.id
            commit((current) => ({
              ...current,
              assets: current.assets.map((asset) => (asset.id === id ? { ...asset, name } : asset)),
            }))
          }}
          onSetAssetMeta={(meta) => active && setAssetMeta(active.id, meta)}
          onAddToTimeline={addAssetToTimeline}
          onRemoveFromCanvas={removeAssetNode}
          onDuplicateNode={duplicateAssetNode}
          onToggleReference={toggleReference}
          onAnalyzeStyle={() =>
            toast('Style analysis isn’t connected yet — this is a placeholder.', 'warn')
          }
          onSetActiveAsset={setActiveAsset}
          onSegmentDragStart={(event, segment) => {
            event.dataTransfer.setData('application/x-segment', segment.id)
            event.dataTransfer.effectAllowed = 'copy'
          }}
        />
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,video/*,audio/*"
        className={styles.hiddenInput}
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? [])
          event.target.value = ''
          if (files.length) void ingest(files.map((file) => ({ file, path: file.name })), null)
        }}
      />
      <input
        ref={dirInputRef}
        type="file"
        multiple
        webkitdirectory=""
        directory=""
        className={styles.hiddenInput}
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? [])
          event.target.value = ''
          if (files.length) {
            void ingest(
              files.map((file) => ({ file, path: file.webkitRelativePath || file.name })),
              null,
            )
          }
        }}
      />
    </div>
  )
}
