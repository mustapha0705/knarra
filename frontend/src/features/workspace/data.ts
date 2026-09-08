import type { FilterKey, Project, ProjectStatus, SortKey, WorkspaceSettings } from './types'

export const MINUTE = 60_000
export const HOUR = 3_600_000
export const DAY = 86_400_000

export const ACCOUNT = { name: 'Mustapha Mohammed', initials: 'MM' }

export const SORTS: SortKey[] = ['Last edited', 'Date created', 'Name']
export const FILTERS: FilterKey[] = ['All', 'Drafts', 'Rendering', 'Completed']

export const STATUS: Record<ProjectStatus, { label: string; bg: string; fg: string }> = {
  draft: { label: 'Draft', bg: 'var(--ws-brand-soft)', fg: 'var(--ws-brand)' },
  rendering: { label: 'Rendering', bg: 'var(--ws-brand-soft)', fg: 'var(--ws-brand)' },
  ready: { label: 'Completed', bg: 'var(--ws-brand)', fg: '#ffffff' },
}

export const DEFAULT_SETTINGS: WorkspaceSettings = {
  ratio: '9:16',
  autosave: true,
  confirmTrash: true,
  imageDuration: '3s',
  transition: 'None',
  snapping: true,
}

/** Seed projects, timestamped relative to first load so "edited" labels stay true. */
export function seedProjects(now = Date.now()): Project[] {
  return [
    { id: 'p1', title: 'Episode 1', status: 'draft', editedAt: now - 12 * MINUTE, createdAt: now - 40 * DAY, assets: 5, duration: '03:49', ratio: '16:9', kind: 'collage' },
    { id: 'p2', title: 'February Dump', status: 'draft', editedAt: now - 1 * DAY, createdAt: now - 9 * DAY, assets: 28, duration: '00:32', ratio: '9:16', kind: 'placeholder' },
    { id: 'p3', title: 'Graduation Weekend', status: 'ready', editedAt: now - 3 * DAY, createdAt: now - 22 * DAY, assets: 42, duration: '01:08', ratio: '9:16', kind: 'placeholder' },
    { id: 'p4', title: 'Boardmates Demo', status: 'rendering', progress: 64, editedAt: now - 5 * HOUR, createdAt: now - 3 * DAY, assets: 12, duration: '00:45', ratio: '16:9', kind: 'single' },
    { id: 'p5', title: 'Summer in Ghana', status: 'draft', editedAt: now - 7 * DAY, createdAt: now - 60 * DAY, assets: 36, duration: '00:58', ratio: '9:16', kind: 'placeholder' },
  ]
}

/** "Edited 3 days ago" — coarse, human phrasing rather than a timestamp. */
export function editedAgo(timestamp: number): string {
  const delta = Date.now() - timestamp
  if (delta < 2 * MINUTE) return 'Edited just now'
  if (delta < HOUR) return `Edited ${Math.round(delta / MINUTE)} minutes ago`
  if (delta < DAY) {
    const hours = Math.round(delta / HOUR)
    return `Edited ${hours} ${hours === 1 ? 'hour' : 'hours'} ago`
  }
  const days = Math.round(delta / DAY)
  if (days === 1) return 'Edited yesterday'
  if (days < 7) return `Edited ${days} days ago`
  const weeks = Math.round(days / 7)
  return `Edited ${weeks} ${weeks === 1 ? 'week' : 'weeks'} ago`
}

export function newProjectId(): string {
  return 'p' + Math.random().toString(36).slice(2, 8)
}
