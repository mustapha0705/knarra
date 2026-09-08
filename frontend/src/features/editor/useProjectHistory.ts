import { useCallback, useMemo, useReducer } from 'react'
import type { EditorProject } from './types'

/** Only the parts of a project that undo/redo should travel through. */
type Snapshot = string

type State = {
  project: EditorProject
  past: Snapshot[]
  future: Snapshot[]
  /** Increments on every committed edit, so the shell can show "Saving…". */
  revision: number
}

type Action =
  | { type: 'commit'; mutate: (project: EditorProject) => EditorProject }
  | { type: 'patch'; mutate: (project: EditorProject) => EditorProject }
  | { type: 'undo' }
  | { type: 'redo' }

const HISTORY_LIMIT = 40

function snapshot(project: EditorProject): Snapshot {
  return JSON.stringify({
    assets: project.assets,
    folders: project.folders,
    canvasNodes: project.canvasNodes,
    timelineClips: project.timelineClips,
    segments: project.segments,
    title: project.title,
  })
}

function restore(project: EditorProject, json: Snapshot): EditorProject {
  return { ...project, ...(JSON.parse(json) as Partial<EditorProject>) }
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'commit': {
      const before = snapshot(state.project)
      return {
        project: action.mutate(state.project),
        past: state.past.concat(before).slice(-HISTORY_LIMIT),
        future: [],
        revision: state.revision + 1,
      }
    }
    // Import probes and other background metadata updates shouldn't land in
    // history — undoing them would be meaningless to the user.
    case 'patch':
      return { ...state, project: action.mutate(state.project) }
    case 'undo': {
      if (!state.past.length) return state
      const previous = state.past[state.past.length - 1]
      return {
        project: restore(state.project, previous),
        past: state.past.slice(0, -1),
        future: state.future.concat(snapshot(state.project)),
        revision: state.revision + 1,
      }
    }
    case 'redo': {
      if (!state.future.length) return state
      const next = state.future[state.future.length - 1]
      return {
        project: restore(state.project, next),
        past: state.past.concat(snapshot(state.project)),
        future: state.future.slice(0, -1),
        revision: state.revision + 1,
      }
    }
    default:
      return state
  }
}

export function useProjectHistory(initial: () => EditorProject) {
  const [state, dispatch] = useReducer(reducer, undefined, () => ({
    project: initial(),
    past: [],
    future: [],
    revision: 0,
  }))

  const commit = useCallback(
    (mutate: (project: EditorProject) => EditorProject) => dispatch({ type: 'commit', mutate }),
    [],
  )
  const patch = useCallback(
    (mutate: (project: EditorProject) => EditorProject) => dispatch({ type: 'patch', mutate }),
    [],
  )
  const undo = useCallback(() => dispatch({ type: 'undo' }), [])
  const redo = useCallback(() => dispatch({ type: 'redo' }), [])

  return useMemo(
    () => ({
      project: state.project,
      revision: state.revision,
      canUndo: state.past.length > 0,
      canRedo: state.future.length > 0,
      commit,
      patch,
      undo,
      redo,
    }),
    [state, commit, patch, undo, redo],
  )
}
