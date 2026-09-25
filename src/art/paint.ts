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

/**
 * Soft terry cloth (towels, robes, headbands): a fine, low-contrast pile, softened so it reads as fabric at
 * any zoom rather than as grain, plus a few broad soft folds.
 */
export function terry(ctx: Ctx, x: number, y: number, w: number, h: number, base: RGB, seed: number, density = 0.012) {
  const r = makeRng(seed)
  const [pile, pctx] = canvas(Math.max(1, Math.ceil(w)), Math.max(1, Math.ceil(h)))
  const count = Math.floor(w * h * Math.min(density, 0.02))
  // Four shades, one batched fill each (a fill per dot cost tens of milliseconds on a big robe).
  for (const k of [-0.05, -0.015, 0.02, 0.06]) dots(pctx, shade(base, k), Math.round(count / 4), () => ({ x: r() * w, y: r() * h, r: r.range(1.2, 2.6), a: r.range(0.25, 0.5) }), 1)
  ctx.save()
  ctx.filter = 'blur(0.9px)'
  ctx.drawImage(pile, x, y)
  ctx.restore()
  terryLoops(ctx, x, y, w, h, 0.5)
  // Broad folds: soft light and shadow bands.
  ctx.save()
  ctx.filter = `blur(${Math.max(6, Math.min(w, h) * 0.08)}px)`
  for (let i = 0; i < Math.max(2, Math.round((w + h) / 260)); i++) {
    const fx = x + r() * w, fy = y + r() * h
    ctx.strokeStyle = rgba(r() < 0.5 ? shade(base, 0.25) : shade(base, -0.12), 0.35)
    ctx.lineWidth = Math.max(6, Math.min(w, h) * 0.06)
    ctx.beginPath(); ctx.moveTo(fx - w * 0.2, fy); ctx.quadraticCurveTo(fx, fy + r.range(-30, 30), fx + w * 0.25, fy + r.range(-20, 20)); ctx.stroke()
  }
  ctx.restore()
}

/** Lighten toward a warm cream instead of white, so light rims keep their colour (white reads as ash on deep tones). */
export function warm(c: RGB, k: number): RGB { return mixRGB(c, [Math.min(255, c[0] * 1.5 + 40), Math.min(255, c[1] * 1.4 + 30), Math.min(255, c[2] * 1.25 + 20)], k) }

let loopTile: HTMLCanvasElement | null = null
/**
 * A seamless tile of terry-cloth loops on mid grey: each loop a tiny ring lit on top and shaded underneath.
 * Laid over any colour with 'overlay', it turns a flat fill into looped towelling. Made once and shared.
 */
export function terryTile(): HTMLCanvasElement {
  if (loopTile) return loopTile
  const T = 128
  const [c, ctx] = canvas(T)
  ctx.fillStyle = 'rgb(128,128,128)'
  ctx.fillRect(0, 0, T, T)
  const r = makeRng(4242)
  ctx.lineCap = 'round'
  for (let i = 0; i < 1500; i++) {
    const x = r() * T, y = r() * T, rr = r.range(1.3, 2.4), tilt = r.range(-0.5, 0.5)
    for (const dx of [-T, 0, T]) for (const dy of [-T, 0, T]) {
      const px = x + dx, py = y + dy
      if (px < -4 || px > T + 4 || py < -4 || py > T + 4) continue
      ctx.strokeStyle = `rgba(70,70,70,${r.range(0.35, 0.6)})`
      ctx.lineWidth = 1.1
      ctx.beginPath(); ctx.arc(px + 0.4, py + 0.6, rr, tilt, tilt + Math.PI); ctx.stroke()
      ctx.strokeStyle = `rgba(215,215,215,${r.range(0.45, 0.8)})`
      ctx.beginPath(); ctx.arc(px, py, rr, tilt + Math.PI * 1.05, tilt + Math.PI * 1.95); ctx.stroke()
    }
  }
  loopTile = c
  return c
}

/** Terry loops over whatever is under the current clip (overlay: keeps the colour, adds the pile). */
export function terryLoops(ctx: Ctx, x: number, y: number, w: number, h: number, alpha = 0.55, scale = 1) {
  ctx.save()
  ctx.globalCompositeOperation = 'overlay'
  ctx.globalAlpha = alpha
  const p = ctx.createPattern(terryTile(), 'repeat')!
  if (scale !== 1) p.setTransform(new DOMMatrix().scale(scale))
  ctx.fillStyle = p
  ctx.fillRect(x, y, w, h)
  ctx.restore()
}

/**
 * Pack a greyscale height map and a greyscale gloss map into one texture: height in red, gloss (where the
 * skin shines: the T-zone, cheekbones, knuckles) in green. The skin shader reads both.
 */
export function packHeight(height: HTMLCanvasElement, gloss: HTMLCanvasElement): HTMLCanvasElement {
  const [c, ctx] = canvas(height.width, height.height)
  ctx.drawImage(height, 0, 0)
  ctx.globalCompositeOperation = 'multiply'
  ctx.fillStyle = 'rgb(255,0,0)'
  ctx.fillRect(0, 0, c.width, c.height)
  const [g, gctx] = canvas(height.width, height.height)
  gctx.drawImage(gloss, 0, 0)
  gctx.globalCompositeOperation = 'multiply'
  gctx.fillStyle = 'rgb(0,255,0)'
  gctx.fillRect(0, 0, c.width, c.height)
  ctx.globalCompositeOperation = 'lighter'
  ctx.drawImage(g, 0, 0)
  ctx.globalCompositeOperation = 'source-over'
  return c
}

/** A soft elliptical dab, rotated: the painterly brush mark for skin variation and hair light. */
export function dab(ctx: Ctx, x: number, y: number, rx: number, ry: number, rot: number, color: RGB, alpha: number) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(rot)
  ctx.scale(1, ry / rx)
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx)
  g.addColorStop(0, rgba(color, alpha))
  g.addColorStop(1, rgba(color, 0))
  ctx.fillStyle = g
  ctx.fillRect(-rx, -rx, rx * 2, rx * 2)
  ctx.restore()
}

/**
 * Many small dots in a few fills: dots are bucketed by alpha and each bucket is one path, so tens of
 * thousands of pores cost a handful of draw calls instead of one each (single fills under a clip cost
 * seconds).
 */
export function dots(ctx: Ctx, color: RGB, count: number, at: (i: number) => { x: number; y: number; r: number; a: number }, buckets = 4) {
  const paths: Path2D[] = []
  const alphas: number[] = []
  for (let b = 0; b < buckets; b++) { paths.push(new Path2D()); alphas.push(0) }
  const counts = new Array(buckets).fill(0)
  let aMin = Infinity, aMax = -Infinity
  const all: { x: number; y: number; r: number; a: number }[] = []
  for (let i = 0; i < count; i++) { const d = at(i); all.push(d); aMin = Math.min(aMin, d.a); aMax = Math.max(aMax, d.a) }
  for (const d of all) {
    const b = aMax > aMin ? Math.min(buckets - 1, Math.floor(((d.a - aMin) / (aMax - aMin)) * buckets)) : 0
    paths[b].moveTo(d.x + d.r, d.y)
    paths[b].arc(d.x, d.y, d.r, 0, Math.PI * 2)
    alphas[b] += d.a
    counts[b]++
  }
  for (let b = 0; b < buckets; b++) {
    if (!counts[b]) continue
    ctx.fillStyle = rgba(color, alphas[b] / counts[b])
    ctx.fill(paths[b])
  }
}

let scratch: HTMLCanvasElement | null = null
/**
 * Many soft shapes for the price of one blur: canvas filters blur every draw call on its own, so a loop of
 * blurred strokes costs a blur pass each. Paint them sharp on a shared scratch canvas (same transform as
 * ctx), then composite that once, blurred, through ctx's clip.
 */
export function softBatch(ctx: Ctx, blur: number, draw: (c: Ctx) => void, composite: GlobalCompositeOperation = 'source-over', alpha = 1) {
  const W = ctx.canvas.width, H = ctx.canvas.height
  if (!scratch || scratch.width < W || scratch.height < H) { scratch = document.createElement('canvas'); scratch.width = Math.max(W, scratch?.width ?? 0); scratch.height = Math.max(H, scratch?.height ?? 0) }
  const sctx = scratch.getContext('2d')!
  sctx.setTransform(1, 0, 0, 1, 0, 0)
  sctx.clearRect(0, 0, W, H)
  sctx.save()
  sctx.setTransform(ctx.getTransform())
  sctx.lineCap = 'round'
  sctx.lineJoin = 'round'
  draw(sctx)
  sctx.restore()
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalCompositeOperation = composite
  ctx.globalAlpha = alpha
  if (blur > 0) ctx.filter = `blur(${blur}px)`
  ctx.drawImage(scratch, 0, 0, W, H, 0, 0, W, H)
  ctx.restore()
}
