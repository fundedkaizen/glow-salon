import { makeRng } from '../core/rng.ts'

/**
 * Canvas painting helpers for the code-drawn art: soft shapes, noise, smooth paths. Everything the art
 * layer draws goes through a 2D canvas first, then becomes a GPU texture.
 */
export type Ctx = CanvasRenderingContext2D

export function canvas(w: number, h = w): [HTMLCanvasElement, Ctx] {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d', { willReadFrequently: false })!
  return [c, ctx]
}

export type RGB = [number, number, number]

export function hex(color: number): RGB { return [(color >> 16) & 255, (color >> 8) & 255, color & 255] }
export function rgba(c: RGB | number, a = 1) { const [r, g, b] = typeof c === 'number' ? hex(c) : c; return `rgba(${r | 0},${g | 0},${b | 0},${a})` }
export function mixRGB(a: RGB, b: RGB, t: number): RGB { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t] }
export function shade(c: RGB, k: number): RGB { return k >= 0 ? mixRGB(c, [255, 255, 255], k) : mixRGB(c, [0, 0, 0], -k) }

/** A closed smooth path through points (Catmull-Rom as Beziers). */
export function smoothPath(ctx: Ctx, pts: number[], closed = true) {
  const n = pts.length / 2
  const P = (i: number) => { const k = closed ? ((i % n) + n) % n : Math.max(0, Math.min(n - 1, i)); return [pts[k * 2], pts[k * 2 + 1]] }
  ctx.moveTo(pts[0], pts[1])
  const last = closed ? n : n - 1
  for (let i = 0; i < last; i++) {
    const [x0, y0] = P(i - 1), [x1, y1] = P(i), [x2, y2] = P(i + 1), [x3, y3] = P(i + 2)
    ctx.bezierCurveTo(x1 + (x2 - x0) / 6, y1 + (y2 - y0) / 6, x2 - (x3 - x1) / 6, y2 - (y3 - y1) / 6, x2, y2)
  }
  if (closed) ctx.closePath()
}

/** A soft round blob: a radial gradient from `color` at the centre to transparent. */
export function blob(ctx: Ctx, x: number, y: number, rx: number, ry: number, color: RGB | number, alpha: number, hardness = 0) {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(1, ry / rx)
  const g = ctx.createRadialGradient(0, 0, rx * hardness, 0, 0, rx)
  g.addColorStop(0, rgba(color, alpha))
  g.addColorStop(1, rgba(color, 0))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(0, 0, rx, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

/** Draw with a blur filter (soft painted shading). */
export function blurred(ctx: Ctx, px: number, draw: () => void) {
  ctx.save()
  ctx.filter = `blur(${px}px)`
  draw()
  ctx.restore()
}

/** Value noise at a given cell size, as a greyscale canvas (smooth, via bilinear upscaling). */
export function noise(size: number, cell: number, seed: number, soft = true): HTMLCanvasElement {
  const n = Math.max(2, Math.ceil(size / cell) + 1)
  const [small, sctx] = canvas(n)
  const r = makeRng(seed)
  const img = sctx.createImageData(n, n)
  for (let i = 0; i < n * n; i++) { const v = r() * 255; img.data[i * 4] = v; img.data[i * 4 + 1] = v; img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255 }
  sctx.putImageData(img, 0, 0)
  const [out, octx] = canvas(size)
  octx.imageSmoothingEnabled = soft
  octx.imageSmoothingQuality = 'high'
  octx.drawImage(small, 0, 0, n, n, 0, 0, size * (n / (size / cell)), size * (n / (size / cell)))
  return out
}

/** Fractal noise: octaves of value noise averaged, 0 to 255 grey. */
export function fbm(size: number, baseCell: number, octaves: number, seed: number): HTMLCanvasElement {
  const [out, ctx] = canvas(size)
  ctx.fillStyle = '#808080'
  ctx.fillRect(0, 0, size, size)
  let amp = 0.5, cell = baseCell
  for (let o = 0; o < octaves; o++) {
    ctx.globalAlpha = amp
    ctx.globalCompositeOperation = o === 0 ? 'source-over' : 'overlay'
    ctx.drawImage(noise(size, cell, seed + o * 101), 0, 0)
    amp *= 0.6
    cell = Math.max(1, cell / 2)
  }
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
  return out
}

/** Use a greyscale canvas as the alpha of a flat colour. */
export function tintedByNoise(size: number, color: RGB | number, noiseCanvas: HTMLCanvasElement, lo: number, hi: number): HTMLCanvasElement {
  const [out, ctx] = canvas(size)
  ctx.drawImage(noiseCanvas, 0, 0, size, size)
  const img = ctx.getImageData(0, 0, size, size)
  const [r, g, b] = typeof color === 'number' ? hex(color) : color
  for (let i = 0; i < img.data.length; i += 4) {
    const v = img.data[i] / 255
    img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b
    img.data[i + 3] = Math.max(0, Math.min(255, (lo + (hi - lo) * v) * 255))
  }
  ctx.putImageData(img, 0, 0)
  return out
}

/** Clip further drawing to a closed polygon. */
export function clipPoly(ctx: Ctx, pts: number[]) {
  ctx.beginPath()
  smoothPath(ctx, pts)
  ctx.clip()
}

/** Tapered stroke: a line that is thick in the middle and thin at both ends (lashes, hair, strands). */
export function taper(ctx: Ctx, x0: number, y0: number, cx: number, cy: number, x1: number, y1: number, w0: number, w1: number, color: string) {
  const steps = 10
  ctx.fillStyle = color
  const pts: [number, number][] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const x = (1 - t) ** 2 * x0 + 2 * (1 - t) * t * cx + t * t * x1
    const y = (1 - t) ** 2 * y0 + 2 * (1 - t) * t * cy + t * t * y1
    pts.push([x, y])
  }
  const left: [number, number][] = [], right: [number, number][] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const [x, y] = pts[i]
    const [xa, ya] = pts[Math.max(0, i - 1)], [xb, yb] = pts[Math.min(steps, i + 1)]
    const dx = xb - xa, dy = yb - ya, l = Math.hypot(dx, dy) || 1
    const w = (w0 + (w1 - w0) * t) * Math.sin(Math.PI * Math.min(1, 0.15 + t * 0.85)) * 0.5 + 0.25
    left.push([x - (dy / l) * w, y + (dx / l) * w])
    right.push([x + (dy / l) * w, y - (dx / l) * w])
  }
  ctx.beginPath()
  ctx.moveTo(left[0][0], left[0][1])
  for (const [x, y] of left) ctx.lineTo(x, y)
  for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1])
  ctx.closePath()
  ctx.fill()
}

/** Terry-cloth texture (towels, headbands): tiny loops as noisy dots. */
export function terry(ctx: Ctx, x: number, y: number, w: number, h: number, base: RGB, seed: number, density = 0.012) {
  const r = makeRng(seed)
  const count = Math.floor(w * h * density)
  for (let i = 0; i < count; i++) {
    const px = x + r() * w, py = y + r() * h
    const rr = r.range(1.2, 3.2)
    ctx.fillStyle = rgba(shade(base, r.range(-0.12, 0.14)), r.range(0.35, 0.8))
    ctx.beginPath()
    ctx.arc(px, py, rr, 0, Math.PI * 2)
    ctx.fill()
  }
}
