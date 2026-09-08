export type ProjectStatus = 'draft' | 'rendering' | 'ready'

/** How a project card renders its thumbnail when no real render exists yet. */
export type ProjectThumbKind = 'collage' | 'single' | 'placeholder'

export type AspectRatio = '9:16' | '16:9' | '1:1'

export type Project = {
  id: string
  title: string
  status: ProjectStatus
  /** Percentage complete, only meaningful while `status` is `rendering`. */
  progress?: number
  editedAt: number
  createdAt: number
  assets: number
  duration: string
  ratio: AspectRatio
  kind: ProjectThumbKind
}

export type ViewMode = 'grid' | 'list'

export type SortKey = 'Last edited' | 'Date created' | 'Name'

export type FilterKey = 'All' | 'Drafts' | 'Rendering' | 'Completed'

export type Toast = {
  id: number
  text: string
  onUndo?: () => void
}

export type WorkspaceSettings = {
  ratio: AspectRatio
  autosave: boolean
  confirmTrash: boolean
  imageDuration: '2s' | '3s' | '5s'
  transition: 'None' | 'Fade' | 'Dissolve'
  snapping: boolean
}

/** The auxiliary dialogs reachable from the help and account menus. */
export type InfoDialogKind = 'start' | 'keys' | 'feedback' | 'profile' | 'signout'
