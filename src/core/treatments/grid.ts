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

/**
 * A grid packed for the network (a co-op late joiner): quantised to 32 levels and run-length encoded, so a
 * mostly empty or mostly full layer is a few hundred bytes. Base64 text, prefixed "r1:".
 */
export function encodeGrid(grid: Float32Array): string {
  const out: number[] = []
  let i = 0
  while (i < grid.length) {
    const v = Math.round(Math.max(0, Math.min(1, grid[i])) * 31)
    let run = 1
    while (i + run < grid.length && run < 255 && Math.round(Math.max(0, Math.min(1, grid[i + run])) * 31) === v) run++
    out.push(run, v)
    i += run
  }
  const bytes = Uint8Array.from(out)
  let text = ''
  for (let k = 0; k < bytes.length; k += 0x8000) text += String.fromCharCode(...bytes.subarray(k, k + 0x8000))
  return 'r1:' + btoa(text)
}

export function decodeGrid(text: string): Float32Array {
  const grid = new Float32Array(GRID * GRID)
  if (!text.startsWith('r1:')) return grid
  const raw = atob(text.slice(3))
  let i = 0
  for (let k = 0; k + 1 < raw.length && i < grid.length; k += 2) {
    const run = raw.charCodeAt(k), v = raw.charCodeAt(k + 1) / 31
    for (let n = 0; n < run && i < grid.length; n++) grid[i++] = v
  }
  return grid
}
