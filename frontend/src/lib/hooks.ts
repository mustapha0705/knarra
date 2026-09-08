import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'

/**
 * Runs `handler` when a mousedown lands outside any open menu surface.
 *
 * Matches the export's behaviour: the listener is registered in the capture
 * phase so a click on a menu trigger toggles rather than close-then-reopen,
 * and clicks inside a menu (or on any menu trigger) are ignored.
 */
export function useDismissOnOutsideClick(active: boolean, onDismiss: () => void) {
  const handler = useEventCallback(onDismiss)

  useEffect(() => {
    if (!active) return
    const onDown = (event: MouseEvent) => {
      const target = event.target
      if (target instanceof Element && target.closest('[role="menu"],[aria-haspopup="menu"]')) return
      handler()
    }
    document.addEventListener('mousedown', onDown, true)
    return () => document.removeEventListener('mousedown', onDown, true)
  }, [active, handler])
}

/** Document-level Escape handling, so layered dialogs can pick their own priority. */
export function useEscapeKey(active: boolean, onEscape: () => void) {
  const handler = useEventCallback(onEscape)

  useEffect(() => {
    if (!active) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') handler()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [active, handler])
}

/**
 * A stable callback identity that always sees the latest render's closure.
 * Keeps event listeners from re-binding on every keystroke.
 */
export function useEventCallback<A extends unknown[], R>(fn: (...args: A) => R) {
  const ref = useRef(fn)
  useLayoutEffect(() => {
    ref.current = fn
  })
  return useCallback((...args: A) => ref.current(...args), [])
}

/** Marks `document.body` so global CSS can switch between the two surfaces. */
export function useBodySurface(surface: 'workspace' | 'editor') {
  useEffect(() => {
    document.body.dataset.surface = surface
    return () => {
      delete document.body.dataset.surface
    }
  }, [surface])
}
