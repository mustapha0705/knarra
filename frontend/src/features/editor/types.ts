export type AssetType = 'image' | 'video' | 'audio' | 'other'
export type AssetRole = 'source' | 'reference'
export type AssetStatus = 'processing' | 'ready' | 'error'

/** Reference-id prefixes: assets are addressed as @V1, @I2, @A1 in commands. */
export type RefKind = AssetType | 'reference' | 'folder'

export type AssetMetadata = {
  imageDurationMs?: number
  speed?: number
  volume?: number
  brightness?: number
  contrast?: number
  saturation?: number
  /** Remembers the source-role id while an asset is marked as a reference. */
  sourceRef?: string | null
}

export type Asset = {
  id: string
  /** Stable short handle shown on the canvas and typed after @ in commands. */
  referenceId: string
  name: string
  type: AssetType
  role: AssetRole
  src: string
  thumbnail: string | null
  poster: string | null
  durationMs: number | null
  width: number | null
  height: number | null
  mimeType: string
  size: number
  folderId: string | null
  status: AssetStatus
  metadata: AssetMetadata
}

export type Folder = {
  id: string
  referenceId: string
  name: string
  assetIds: string[]
  createdAt: number
}

export type CanvasNode = {
  id: string
  assetId?: string
  folderId?: string
  segmentId?: string
  x: number
  y: number
  width: number
  height: number
  scale: number
  rotation: number
  zIndex: number
  groupId: string | null
}

export type TrackId = 'video' | 'overlay' | 'audio'

export type TimelineClip = {
  id: string
  assetId: string
  referenceId: string
  trackId: TrackId
  sourceStartMs: number
  sourceEndMs: number
  timelineStartMs: number
  durationMs: number
  speed: number
  volume: number
  effects: Record<string, number>
}

/** A named in/out range on an asset, addressable as @V1-S1. */
export type Segment = {
  id: string
  referenceId: string
  assetId: string
  startMs: number
  endMs: number
  label: string
}

export type CommandRecord = {
  id: string
  prompt: string
  status: 'applied'
  proposedPlan: EditPlan
  appliedOperations: EditOperation[]
  createdAt: number
}

export type EditorProject = {
  id: string
  title: string
  instructions: string
  assets: Asset[]
  folders: Folder[]
  canvasNodes: CanvasNode[]
  timelineClips: TimelineClip[]
  segments: Segment[]
  commands: CommandRecord[]
  createdAt: number
  updatedAt: number
}

export type EditOperationName =
  | 'insertClip'
  | 'insertImage'
  | 'addAudio'
  | 'moveClip'
  | 'trimClip'
  | 'splitClip'
  | 'setSpeed'
  | 'setVolume'
  | 'setImageDuration'
  | 'setBrightness'
  | 'setContrast'
  | 'setSaturation'
  | 'addTransition'
  | 'removeClip'

export type EditOperation = {
  op: EditOperationName
  /** Reference id of the asset or segment the operation reads from. */
  assetId?: string
  /** Reference id of an existing timeline target. */
  targetId?: string
  sourceRange?: { startMs: number | null; endMs: number | null }
  timelineStartMs?: number
  durationMs?: number
  volume?: number
  rate?: number
  /** Reference id this operation should be placed after. */
  after?: string
}

export type EditPlan = {
  version: 1
  operations: EditOperation[]
}

export type CommandContext = {
  projectId: string
  assets: Pick<Asset, 'referenceId' | 'id' | 'name' | 'type' | 'role' | 'durationMs'>[]
  segments: Pick<Segment, 'referenceId' | 'assetId' | 'startMs' | 'endMs'>[]
  timeline: Pick<TimelineClip, 'id' | 'assetId' | 'trackId' | 'timelineStartMs' | 'durationMs'>[]
  selection: string[]
}

/** A file plus its folder-relative path, as produced by drops and pickers. */
export type ImportEntry = {
  file: File | SyntheticFile
  path: string
}

/**
 * Stand-in for a `File` when media comes from the bundled workspace library
 * rather than the user's disk — it already has a URL, so no blob is made.
 */
export type SyntheticFile = {
  name: string
  type: string
  size: number
  src: string
}

export type EditorMode = 'canvas' | 'timeline'

export type EditorToast = {
  id: string
  text: string
  tone: 'info' | 'warn'
}
