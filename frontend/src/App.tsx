import { useEffect, useState } from 'react'
import { ProjectEditor } from './features/editor/ProjectEditor'
import { WorkspacePage } from './features/workspace/WorkspacePage'

type Route = { view: 'workspace' } | { view: 'editor'; title: string }

type HistoryState = { knarraView?: 'workspace' | 'editor'; knarraTitle?: string }

/**
 * Two screens, one history entry apart. Opening a project pushes a state so
 * the browser Back button returns to the workspace, matching the export.
 */
export default function App() {
  const [route, setRoute] = useState<Route>({ view: 'workspace' })

  useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      const state = (event.state ?? {}) as HistoryState
      setRoute(
        state.knarraView === 'editor'
          ? { view: 'editor', title: state.knarraTitle ?? 'Untitled project' }
          : { view: 'workspace' },
      )
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const openProject = (title: string) => {
    try {
      history.pushState({ knarraView: 'editor', knarraTitle: title } satisfies HistoryState, '', '#/projects/new')
    } catch {
      // Some embedded contexts block history writes; navigate anyway.
    }
    setRoute({ view: 'editor', title })
  }

  const goToProjects = () => {
    try {
      history.pushState({ knarraView: 'workspace' } satisfies HistoryState, '', '#/projects')
    } catch {
      // As above.
    }
    setRoute({ view: 'workspace' })
  }

  if (route.view === 'editor') {
    // Keyed on the title so switching projects starts the editor clean.
    return <ProjectEditor key={route.title} projectTitle={route.title} onHome={goToProjects} />
  }

  return <WorkspacePage onOpenProject={openProject} />
}
