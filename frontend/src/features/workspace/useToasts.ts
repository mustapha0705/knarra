import { useCallback, useEffect, useRef, useState } from 'react'
import type { Toast } from './types'

/**
 * Transient status messages. A toast that offers Undo lingers longer, and all
 * pending timers are cleared on unmount so a dismissed screen can't call back.
 */
export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(0)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => {
    const pending = timers.current
    return () => pending.forEach(clearTimeout)
  }, [])

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const toast = useCallback(
    (text: string, onUndo?: () => void) => {
      const id = ++nextId.current
      setToasts((current) => [...current, { id, text, onUndo }])
      timers.current.push(setTimeout(() => dismiss(id), onUndo ? 6000 : 3200))
    },
    [dismiss],
  )

  const undo = useCallback(
    (item: Toast) => {
      dismiss(item.id)
      item.onUndo?.()
    },
    [dismiss],
  )

  return { toasts, toast, undo }
}
