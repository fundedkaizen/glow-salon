import { ART_SIZE, inRegion, type Region } from '../geometry.ts'

/** Coverage grids: each layer of a treatment is tracked on a coarse grid so progress is cheap and exact. */
export const GRID = 128
export const CELL = ART_SIZE / GRID

/** Which cells of the grid lie in a region (a cell counts when its centre does). */
export function rasterize(region: Region): Uint8Array {
  const mask = new Uint8Array(GRID * GRID)
  for (let gy = 0; gy < GRID; gy++) for (let gx = 0; gx < GRID; gx++) {
    if (inRegion(region, (gx + 0.5) * CELL, (gy + 0.5) * CELL)) mask[gy * GRID + gx] = 1
  }
  return mask
}

export function countMask(mask: Uint8Array) {
  let n = 0
  for (let i = 0; i < mask.length; i++) n += mask[i]
  return n
}

/**
 * Stamp a soft round brush into a grid. `amount` is positive to add coverage and negative to remove it.
 * Returns how much coverage changed (always positive), which drives sounds and particles.
 */
export function stamp(grid: Float32Array, x: number, y: number, radius: number, amount: number, clip?: Uint8Array): number {
  const r = radius / CELL
  const cx = x / CELL - 0.5, cy = y / CELL - 0.5
  const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(GRID - 1, Math.ceil(cx + r))
  const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(GRID - 1, Math.ceil(cy + r))
  let changed = 0
  for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) {
    const i = gy * GRID + gx
    if (clip && !clip[i]) continue
    const d = Math.hypot(gx - cx, gy - cy) / Math.max(r, 0.5)
    if (d >= 1) continue
    const falloff = d < 0.55 ? 1 : 1 - (d - 0.55) / 0.45
    const before = grid[i]
    const after = Math.max(0, Math.min(1, before + amount * falloff))
    grid[i] = after
    changed += Math.abs(after - before)
  }
  return changed
}

/** Sum of coverage inside a mask. */
export function sumIn(grid: Float32Array, mask: Uint8Array) {
  let s = 0
  for (let i = 0; i < grid.length; i++) if (mask[i]) s += grid[i]
  return s
}

/** The share of a mask that is painted at least `full` deep, softly: 0 to 1. */
export function paintedShare(grid: Float32Array, mask: Uint8Array, full = 0.8) {
  let s = 0, n = 0
  for (let i = 0; i < grid.length; i++) if (mask[i]) { n++; s += Math.min(1, grid[i] / full) }
  return n ? s / n : 1
}

/** Base64 of a grid quantised to bytes, for co-op late joiners and saves of a paused treatment. */
export function encodeGrid(grid: Float32Array): string {
  const bytes = new Uint8Array(grid.length)
  for (let i = 0; i < grid.length; i++) bytes[i] = Math.round(grid[i] * 255)
  let text = ''
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(text)
}

export function decodeGrid(text: string): Float32Array {
  const raw = atob(text)
  const grid = new Float32Array(GRID * GRID)
  for (let i = 0; i < grid.length && i < raw.length; i++) grid[i] = raw.charCodeAt(i) / 255
  return grid
}
