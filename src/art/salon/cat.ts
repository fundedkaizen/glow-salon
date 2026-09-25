import type { Texture } from 'pixi.js'
import { blob, rgba, shade, type Ctx, type RGB } from '../paint.ts'
import { canvasTexture, worldCanvas } from './room.ts'

/**
 * The salon cat: a round ginger-and-cream tabby, painted in three poses (sitting, walking in two steps, and
 * curled up asleep) with its tail as its own piece so it can swish. Feet at the texture's bottom centre.
 */
export type CatPose = 'sit' | 'walk1' | 'walk2' | 'sleep' | 'happy'

const FUR: RGB = [243, 178, 112]
const CREAM: RGB = [255, 240, 222]
const STRIPE: RGB = [214, 132, 74]
const LINE = 'rgba(140,70,40,0.55)'

export const CAT_SIZE = { w: 60, h: 56, ax: 30, ay: 52 }

const cache = new Map<string, Texture>()
function tex(key: string, w: number, h: number, draw: (ctx: Ctx) => void) {
  let t = cache.get(key)
  if (!t) { const [c, ctx] = worldCanvas(w, h); draw(ctx); t = canvasTexture(c); cache.set(key, t) }
  return t
}

function furFill(ctx: Ctx, x0: number, y0: number, x1: number, y1: number) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1)
  g.addColorStop(0, rgba(shade(FUR, 0.25))); g.addColorStop(1, rgba(shade(FUR, -0.1)))
  return g
}

function head(ctx: Ctx, x: number, y: number, eyes: 'open' | 'closed' | 'happy') {
  // Ears.
  for (const s of [-1, 1]) {
    ctx.fillStyle = furFill(ctx, x - 12, y - 16, x + 12, y)
    ctx.beginPath(); ctx.moveTo(x + s * 4, y - 9); ctx.lineTo(x + s * 11, y - 18); ctx.lineTo(x + s * 13, y - 5); ctx.closePath(); ctx.fill()
    ctx.strokeStyle = LINE; ctx.lineWidth = 1; ctx.stroke()
    ctx.fillStyle = '#f7b7c4'; ctx.beginPath(); ctx.moveTo(x + s * 6, y - 9); ctx.lineTo(x + s * 10.5, y - 15); ctx.lineTo(x + s * 11.5, y - 7); ctx.closePath(); ctx.fill()
  }
  ctx.fillStyle = furFill(ctx, x - 14, y - 12, x + 14, y + 10)
  ctx.beginPath(); ctx.ellipse(x, y, 14, 12, 0, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = LINE; ctx.lineWidth = 1.1; ctx.stroke()
  // Forehead stripes and a cream muzzle.
  ctx.strokeStyle = rgba(STRIPE, 0.8); ctx.lineWidth = 1.6; ctx.lineCap = 'round'
  for (const dx of [-4, 0, 4]) { ctx.beginPath(); ctx.moveTo(x + dx, y - 11); ctx.lineTo(x + dx * 0.8, y - 6); ctx.stroke() }
  ctx.fillStyle = rgba(CREAM); ctx.beginPath(); ctx.ellipse(x, y + 5, 8, 5.5, 0, 0, Math.PI * 2); ctx.fill()
  blob(ctx, x - 9, y + 3, 3.5, 2.2, [247, 150, 160], 0.5)
  blob(ctx, x + 9, y + 3, 3.5, 2.2, [247, 150, 160], 0.5)
  // Eyes.
  ctx.strokeStyle = '#4a2c38'; ctx.lineWidth = 1.5
  for (const s of [-1, 1]) {
    const ex = x + s * 6, ey = y - 1
    if (eyes === 'open') {
      ctx.fillStyle = '#4a2c38'; ctx.beginPath(); ctx.ellipse(ex, ey, 2.2, 3, 0, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex - 0.7, ey - 1.1, 0.9, 0, Math.PI * 2); ctx.fill()
    } else if (eyes === 'happy') { ctx.beginPath(); ctx.arc(ex, ey + 1.2, 2.6, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke() }
    else { ctx.beginPath(); ctx.arc(ex, ey - 1, 2.6, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke() }
  }
  // Nose and mouth.
  ctx.fillStyle = '#e98aa0'; ctx.beginPath(); ctx.moveTo(x - 1.6, y + 2.4); ctx.lineTo(x + 1.6, y + 2.4); ctx.lineTo(x, y + 4); ctx.closePath(); ctx.fill()
  ctx.strokeStyle = 'rgba(90,50,60,0.8)'; ctx.lineWidth = 0.9
  ctx.beginPath(); ctx.moveTo(x, y + 4); ctx.quadraticCurveTo(x - 1.5, y + 6.5, x - 3.5, y + 5.5); ctx.moveTo(x, y + 4); ctx.quadraticCurveTo(x + 1.5, y + 6.5, x + 3.5, y + 5.5); ctx.stroke()
  // Whiskers.
  ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 0.7
  for (const s of [-1, 1]) for (const dy of [-1, 1.5]) { ctx.beginPath(); ctx.moveTo(x + s * 7, y + 4 + dy); ctx.lineTo(x + s * 17, y + 3 + dy * 2); ctx.stroke() }
}

export function catTexture(pose: CatPose): Texture {
  const { w, h } = CAT_SIZE
  return tex(pose, w, h, ctx => {
    const cx = CAT_SIZE.ax, base = CAT_SIZE.ay
    if (pose === 'sleep') {
      // Curled into a loaf, head tucked on the paws.
      ctx.fillStyle = furFill(ctx, cx - 22, base - 22, cx + 22, base)
      ctx.beginPath(); ctx.ellipse(cx + 2, base - 11, 22, 12, 0, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = LINE; ctx.lineWidth = 1.1; ctx.stroke()
      ctx.strokeStyle = rgba(STRIPE, 0.7); ctx.lineWidth = 2; ctx.lineCap = 'round'
      for (const dx of [2, 9, 16]) { ctx.beginPath(); ctx.moveTo(cx + dx, base - 22); ctx.quadraticCurveTo(cx + dx + 3, base - 15, cx + dx, base - 9); ctx.stroke() }
      blob(ctx, cx - 4, base - 18, 10, 4, [255, 255, 255], 0.35)
      head(ctx, cx - 12, base - 12, 'closed')
      return
    }
    const walking = pose === 'walk1' || pose === 'walk2'
    // Legs.
    ctx.fillStyle = rgba(CREAM)
    const legs = walking ? (pose === 'walk1' ? [-12, -3, 7, 15] : [-9, -6, 10, 12]) : [-7, 7]
    for (const lx of legs) { ctx.beginPath(); ctx.roundRect(cx + lx - 3, base - 12, 6, 12, 3); ctx.fill(); ctx.strokeStyle = LINE; ctx.lineWidth = 0.9; ctx.stroke() }
    // Body: sitting upright or walking long.
    ctx.fillStyle = furFill(ctx, cx - 18, base - 34, cx + 18, base)
    ctx.beginPath()
    if (walking) ctx.ellipse(cx + 2, base - 17, 20, 11, 0, 0, Math.PI * 2)
    else ctx.ellipse(cx, base - 16, 14, 16, 0, 0, Math.PI * 2)
    ctx.fill(); ctx.strokeStyle = LINE; ctx.lineWidth = 1.1; ctx.stroke()
    // Stripes on the back and a cream chest.
    ctx.strokeStyle = rgba(STRIPE, 0.75); ctx.lineWidth = 2.2; ctx.lineCap = 'round'
    const sx = walking ? [0, 7, 14] : [6, 11]
    for (const dx of sx) { ctx.beginPath(); ctx.moveTo(cx + dx, base - (walking ? 27 : 28)); ctx.quadraticCurveTo(cx + dx + 3, base - 20, cx + dx + 1, base - 13); ctx.stroke() }
    ctx.fillStyle = rgba(CREAM)
    ctx.beginPath(); ctx.ellipse(walking ? cx - 11 : cx - 2, base - 13, walking ? 7 : 8, walking ? 7 : 10, 0, 0, Math.PI * 2); ctx.fill()
    blob(ctx, cx - 5, base - 26, 8, 4, [255, 255, 255], 0.35)
    head(ctx, walking ? cx - 16 : cx - 2, walking ? base - 27 : base - 33, pose === 'happy' ? 'happy' : 'open')
  })
}

/** The tail, pivoting at its base (bottom left of the texture). */
export function catTail(): Texture {
  return tex('tail', 30, 34, ctx => {
    ctx.strokeStyle = rgba(shade(FUR, -0.05)); ctx.lineWidth = 7; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(4, 30); ctx.bezierCurveTo(22, 30, 26, 16, 18, 6); ctx.stroke()
    ctx.strokeStyle = rgba(STRIPE, 0.8); ctx.lineWidth = 7.4
    ctx.setLineDash([3, 5]); ctx.beginPath(); ctx.moveTo(4, 30); ctx.bezierCurveTo(22, 30, 26, 16, 18, 6); ctx.stroke(); ctx.setLineDash([])
    ctx.fillStyle = rgba(CREAM); ctx.beginPath(); ctx.arc(18, 6, 3.6, 0, Math.PI * 2); ctx.fill()
  })
}
