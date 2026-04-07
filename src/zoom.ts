import type { ZoomState } from './types'

export function createZoomState(): ZoomState {
  return { scale: 1, tx: 0, ty: 0 }
}
