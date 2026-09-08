export type Pan = { x: number; y: number }

export const ZOOM_MIN = 0.25
export const ZOOM_MAX = 3

/** Screen point → canvas coordinates, undoing the layer's pan and scale. */
export function toCanvasPoint(
  element: HTMLElement | null,
  clientX: number,
  clientY: number,
  pan: Pan,
  zoom: number,
): Pan {
  const rect = element?.getBoundingClientRect() ?? { left: 0, top: 0 }
  return { x: (clientX - rect.left - pan.x) / zoom, y: (clientY - rect.top - pan.y) / zoom }
}

export function clampZoom(zoom: number): number {
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom))
}
