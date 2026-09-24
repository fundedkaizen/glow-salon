/**
 * Plain shapes in "art space" (each body part is drawn on a 1024 x 1024 canvas). The treatment logic uses
 * them to know where a region is; the renderer uses the same shapes to draw, so art and logic always agree.
 */
export const ART_SIZE = 1024

export type Shape =
  | { t: 'ellipse'; cx: number; cy: number; rx: number; ry: number; rot?: number }
  | { t: 'poly'; pts: number[] }
  | { t: 'capsule'; x0: number; y0: number; x1: number; y1: number; r0: number; r1: number }

export type Region = { include: Shape[]; exclude?: Shape[] }

export function inShape(shape: Shape, x: number, y: number): boolean {
  if (shape.t === 'ellipse') {
    let dx = x - shape.cx, dy = y - shape.cy
    if (shape.rot) {
      const c = Math.cos(-shape.rot), s = Math.sin(-shape.rot)
      const rx = dx * c - dy * s, ry = dx * s + dy * c
      dx = rx; dy = ry
    }
    return (dx * dx) / (shape.rx * shape.rx) + (dy * dy) / (shape.ry * shape.ry) <= 1
  }
  if (shape.t === 'capsule') {
    const vx = shape.x1 - shape.x0, vy = shape.y1 - shape.y0
    const len2 = vx * vx + vy * vy || 1
    const t = Math.max(0, Math.min(1, ((x - shape.x0) * vx + (y - shape.y0) * vy) / len2))
    const px = shape.x0 + vx * t, py = shape.y0 + vy * t
    const r = shape.r0 + (shape.r1 - shape.r0) * t
    return (x - px) ** 2 + (y - py) ** 2 <= r * r
  }
  // Even-odd polygon test.
  const p = shape.pts
  let inside = false
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const xi = p[i], yi = p[i + 1], xj = p[j], yj = p[j + 1]
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

export function inRegion(region: Region, x: number, y: number) {
  return region.include.some(s => inShape(s, x, y)) && !(region.exclude ?? []).some(s => inShape(s, x, y))
}

/** The bounding box of a shape, for drawing and for quick rejects. */
export function shapeBounds(shape: Shape): [number, number, number, number] {
  if (shape.t === 'ellipse') {
    const r = Math.max(shape.rx, shape.ry)
    return shape.rot ? [shape.cx - r, shape.cy - r, shape.cx + r, shape.cy + r] : [shape.cx - shape.rx, shape.cy - shape.ry, shape.cx + shape.rx, shape.cy + shape.ry]
  }
  if (shape.t === 'capsule') {
    const r = Math.max(shape.r0, shape.r1)
    return [Math.min(shape.x0, shape.x1) - r, Math.min(shape.y0, shape.y1) - r, Math.max(shape.x0, shape.x1) + r, Math.max(shape.y0, shape.y1) + r]
  }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (let i = 0; i < shape.pts.length; i += 2) {
    x0 = Math.min(x0, shape.pts[i]); x1 = Math.max(x1, shape.pts[i])
    y0 = Math.min(y0, shape.pts[i + 1]); y1 = Math.max(y1, shape.pts[i + 1])
  }
  return [x0, y0, x1, y1]
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v))
export const dist = (x0: number, y0: number, x1: number, y1: number) => Math.hypot(x1 - x0, y1 - y0)
