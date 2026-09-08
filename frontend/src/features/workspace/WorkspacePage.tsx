import { useMemo, useState } from 'react'
import { PlayFrameIcon, PlusIcon, SearchIcon } from '../../components/icons'
import { useBodySurface, useDismissOnOutsideClick, useEscapeKey } from '../../lib/hooks'
import { CreateProjectDialog } from './CreateProjectDialog'
import { InfoDialog } from './InfoDialog'
import { ProjectCard } from './ProjectCard'
import { ProjectList } from './ProjectList'
import { RenameProjectDialog } from './RenameProjectDialog'
import { SettingsDialog } from './SettingsDialog'
import { ToastStack } from './ToastStack'
import { WorkspaceHeader } from './WorkspaceHeader'
import { WorkspaceToolbar } from './WorkspaceToolbar'
import { DEFAULT_SETTINGS, newProjectId, seedProjects } from './data'
import type { ProjectActionHandlers } from './ProjectActionsMenu'
import { useToasts } from './useToasts'
import type {
  AspectRatio,
  FilterKey,
  InfoDialogKind,
  Project,
  SortKey,
  ViewMode,
  WorkspaceSettings,
} from './types'
import styles from './Workspace.module.css'

type WorkspacePageProps = {
  productName?: string
  defaultView?: ViewMode
  /** Opens a project in the editor. Owned by the router so the URL can change. */
  onOpenProject: (title: string) => void
}

export function WorkspacePage({
  productName = 'Knarra',
  defaultView = 'grid',
  onOpenProject,
}: WorkspacePageProps) {
  useBodySurface('workspace')

  const [projects, setProjects] = useState<Project[]>(() => seedProjects())
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<FilterKey>('All')
  const [sort, setSort] = useState<SortKey>('Last edited')
  const [view, setView] = useState<ViewMode>(defaultView)
  const [settings, setSettings] = useState<WorkspaceSettings>(DEFAULT_SETTINGS)

  const [sortOpen, setSortOpen] = useState(false)
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [helpOpen, setHelpOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)

  const [createOpen, setCreateOpen] = useState(false)
  const [renameFor, setRenameFor] = useState<Project | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [info, setInfo] = useState<InfoDialogKind | null>(null)

  const { toasts, toast, undo } = useToasts()

  const anyPopoverOpen = sortOpen || menuFor !== null || helpOpen || accountOpen

  const closePopovers = () => {
    setSortOpen(false)
    setMenuFor(null)
    setHelpOpen(false)
    setAccountOpen(false)
  }

  useDismissOnOutsideClick(anyPopoverOpen, closePopovers)

  // Escape unwinds one layer at a time, deepest dialog first.
  useEscapeKey(true, () => {
    if (info) return setInfo(null)
    if (settingsOpen) return setSettingsOpen(false)
    if (renameFor) return setRenameFor(null)
    if (createOpen) return setCreateOpen(false)
    if (anyPopoverOpen) closePopovers()
  })

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const matched = projects.filter((project) => {
      if (needle && !project.title.toLowerCase().includes(needle)) return false
      if (filter === 'Drafts') return project.status === 'draft'
      if (filter === 'Rendering') return project.status === 'rendering'
      if (filter === 'Completed') return project.status === 'ready'
      return true
    })
    return matched.sort((a, b) => {
      if (sort === 'Name') return a.title.localeCompare(b.title)
      if (sort === 'Date created') return b.createdAt - a.createdAt
      return b.editedAt - a.editedAt
    })
  }, [projects, query, filter, sort])

  const hasResults = visible.length > 0
  const noProjects = projects.length === 0

  const openProject = (title: string) => {
    closePopovers()
    setCreateOpen(false)
    onOpenProject(title)
  }

  const removeProject = (project: Project, message: string) => {
    const index = projects.findIndex((candidate) => candidate.id === project.id)
    if (index === -1) return
    setProjects((current) => current.filter((candidate) => candidate.id !== project.id))
    setMenuFor(null)
    toast(message, () => {
      setProjects((current) => {
        const next = current.slice()
        next.splice(Math.min(index, next.length), 0, project)
        return next
      })
      toast('Project restored')
    })
  }

  const actions: ProjectActionHandlers = {
    onOpen: (project) => openProject(project.title),
    onRename: (project) => {
      setRenameFor(project)
      setMenuFor(null)
    },
    onDuplicate: (project) => {
      const copy: Project = {
        ...project,
        id: newProjectId(),
        title: `${project.title} copy`,
        status: 'draft',
        progress: undefined,
        editedAt: Date.now(),
        createdAt: Date.now(),
      }
      setProjects((current) => [copy, ...current])
      setMenuFor(null)
      toast('Project duplicated')
    },
    onArchive: (project) => removeProject(project, 'Project archived'),
    onTrash: (project) => removeProject(project, 'Project moved to trash'),
  }

  const createProject = (name: string, ratio: AspectRatio) => {
    const project: Project = {
      id: newProjectId(),
      title: name,
      status: 'draft',
      editedAt: Date.now(),
      createdAt: Date.now(),
      assets: 0,
      duration: '00:00',
      ratio,
      kind: 'placeholder',
    }
    setProjects((current) => [project, ...current])
    setCreateOpen(false)
    toast('Project created')
    openProject(name)
  }

  const confirmInfo = (kind: InfoDialogKind) => {
    setInfo(null)
    if (kind === 'feedback') toast('Feedback sent')
    if (kind === 'signout') toast('Signed out')
  }

  const openSettings = () => {
    setSettingsOpen(true)
    closePopovers()
  }

  const toggleCardMenu = (id: string) => {
    setMenuFor((current) => (current === id ? null : id))
    setSortOpen(false)
  }

  return (
    <div className={styles.page}>
      <WorkspaceHeader
        productName={productName}
        helpOpen={helpOpen}
        accountOpen={accountOpen}
        onToggleHelp={() => {
          setHelpOpen((open) => !open)
          setAccountOpen(false)
          setMenuFor(null)
          setSortOpen(false)
        }}
        onToggleAccount={() => {
          setAccountOpen((open) => !open)
          setHelpOpen(false)
          setMenuFor(null)
          setSortOpen(false)
        }}
        onGoProjects={closePopovers}
        onOpenSettings={openSettings}
        onShowInfo={(kind) => {
          setInfo(kind)
          closePopovers()
        }}
      />

      <div className={styles.body}>
        <div className={styles.heading}>
          <div className={styles.headingText}>
            <h1 className={styles.title}>Projects</h1>
            <p className={styles.subtitle}>Create a new video or continue where you left off.</p>
          </div>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => {
              setCreateOpen(true)
              closePopovers()
            }}
          >
            <PlusIcon size={18} />
            <span>New project</span>
          </button>
        </div>

        <WorkspaceToolbar
          query={query}
          filter={filter}
          sort={sort}
          sortOpen={sortOpen}
          view={view}
          onQueryChange={setQuery}
          onClearQuery={() => setQuery('')}
          onFilterChange={(next) => {
            setFilter(next)
            setMenuFor(null)
          }}
          onToggleSort={() => {
            setSortOpen((open) => !open)
            setMenuFor(null)
          }}
          onSortChange={(next) => {
            setSort(next)
            setSortOpen(false)
          }}
          onViewChange={(next) => {
            setView(next)
            setMenuFor(null)
          }}
        />

        {hasResults && (
          <div className={styles.sectionHeading}>
            <span className={styles.sectionTitle}>Recent projects</span>
            <span className={styles.sectionCount}>
              {visible.length} {visible.length === 1 ? 'project' : 'projects'}
            </span>
          </div>
        )}

        {hasResults && view === 'grid' && (
          <div className={styles.grid}>
            {visible.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                menuOpen={menuFor === project.id}
                onToggleMenu={() => toggleCardMenu(project.id)}
                actions={actions}
              />
            ))}
          </div>
        )}

        {hasResults && view === 'list' && (
          <ProjectList projects={visible} menuFor={menuFor} onToggleMenu={toggleCardMenu} actions={actions} />
        )}

        {noProjects && (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>
              <PlayFrameIcon size={27} />
            </div>
            <div className={styles.emptyTitle}>Create your first video project</div>
            <div className={styles.emptyBody}>
              Add your photos, videos, and music, then use AI to help turn them into a finished edit.
            </div>
            <button
              type="button"
              className={[styles.primaryButton, styles.emptyAction].join(' ')}
              onClick={() => setCreateOpen(true)}
            >
              <PlusIcon size={18} />
              <span>New project</span>
            </button>
          </div>
        )}

        {!noProjects && !hasResults && (
          <div className={[styles.emptyState, styles.noResults].join(' ')}>
            <div className={[styles.emptyIcon, styles.emptyIconSmall].join(' ')}>
              <SearchIcon size={23} />
            </div>
            <div className={[styles.emptyTitle, styles.emptyTitleSmall].join(' ')}>No projects found</div>
            <div className={styles.emptyBody}>Try a different search or clear your filters.</div>
            <button
              type="button"
              className={[styles.secondaryButton, styles.clearFilters].join(' ')}
              onClick={() => {
                setQuery('')
                setFilter('All')
              }}
            >
              Clear filters
            </button>
          </div>
        )}
      </div>

      {createOpen && (
        <CreateProjectDialog
          defaultRatio={settings.ratio}
          onCancel={() => setCreateOpen(false)}
          onCreate={createProject}
        />
      )}

      {renameFor && (
        <RenameProjectDialog
          initialName={renameFor.title}
          onCancel={() => setRenameFor(null)}
          onSave={(name) => {
            const id = renameFor.id
            setProjects((current) =>
              current.map((project) =>
                project.id === id ? { ...project, title: name, editedAt: Date.now() } : project,
              ),
            )
            setRenameFor(null)
            toast('Project renamed')
          }}
        />
      )}

      {settingsOpen && (
        <SettingsDialog
          settings={settings}
          onCancel={() => setSettingsOpen(false)}
          onSave={(next) => {
            setSettings(next)
            setSettingsOpen(false)
            toast('Settings saved')
          }}
        />
      )}

      {info && <InfoDialog kind={info} onClose={() => setInfo(null)} onConfirm={confirmInfo} />}

      <ToastStack toasts={toasts} onUndo={undo} />
    </div>
  )
}
