import { blob, canvas, mixRGB, rgba, shade, type RGB } from './paint.ts'
import type { SkinTone } from './palette.ts'

/**
 * Pimples painted for this customer's skin: an inflamed halo that blends into the skin, a raised dome with a
 * soft shadow under it and a highlight on top, and a yellow-white head seen through a thin sheen of skin.
 * Deep ones are a bigger, redder dome with no head until the first squeeze. Cute, never gory.
 */
export type PimpleArt = { halo: HTMLCanvasElement; dome: HTMLCanvasElement; deepDome: HTMLCanvasElement; head: HTMLCanvasElement; blanch: HTMLCanvasElement; mark: HTMLCanvasElement; dab: HTMLCanvasElement }

export function paintPimples(skin: SkinTone): PimpleArt {
  const inflamed = mixRGB(skin.blush, [226, 92, 104], 0.55)
  const halo = one(160, ctx => {
    blob(ctx, 80, 80, 78, 72, inflamed, 0.42)
    blob(ctx, 80, 82, 46, 42, mixRGB(inflamed, [210, 70, 90], 0.3), 0.45)
  })
  const domeArt = (size: number, red: number) => one(size, ctx => {
    const c = size / 2, r = size * 0.36
    // Contact shadow, then the raised bump lit from the top left.
    blob(ctx, c + r * 0.18, c + r * 0.3, r * 1.1, r * 0.9, shade(skin.shadow, -0.2), 0.4)
    const base: RGB = mixRGB(skin.base, inflamed, red)
    const g = ctx.createRadialGradient(c - r * 0.35, c - r * 0.4, r * 0.1, c, c, r)
    g.addColorStop(0, rgba(shade(base, 0.35))); g.addColorStop(0.55, rgba(base)); g.addColorStop(1, rgba(shade(base, -0.12), 0))
    ctx.fillStyle = g
    ctx.beginPath(); ctx.arc(c, c, r, 0, Math.PI * 2); ctx.fill()
    blob(ctx, c - r * 0.35, c - r * 0.42, r * 0.28, r * 0.18, [255, 255, 255], 0.55)
  })
  const head = one(96, ctx => {
    // The head under a thin film of skin: creamy yellow-white, soft edge, a wet highlight.
    const g = ctx.createRadialGradient(44, 44, 2, 48, 48, 26)
    g.addColorStop(0, '#fffbe8'); g.addColorStop(0.5, '#fbeec0'); g.addColorStop(0.85, 'rgba(240,214,150,0.6)'); g.addColorStop(1, 'rgba(240,214,150,0)')
    ctx.fillStyle = g
    ctx.beginPath(); ctx.arc(48, 48, 26, 0, Math.PI * 2); ctx.fill()
    blob(ctx, 48, 50, 24, 24, mixRGB(skin.light, [255, 220, 210], 0.4), 0.28)
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    ctx.beginPath(); ctx.ellipse(40, 39, 6, 4, -0.6, 0, Math.PI * 2); ctx.fill()
  })
  const blanch = one(128, ctx => {
    const g = ctx.createRadialGradient(64, 64, 18, 64, 64, 50)
    g.addColorStop(0, 'rgba(255,248,242,0)'); g.addColorStop(0.45, 'rgba(255,246,238,0.75)'); g.addColorStop(1, 'rgba(255,246,238,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 128, 128)
  })
  const mark = one(96, ctx => { blob(ctx, 48, 48, 30, 28, [226, 70, 92], 0.75); blob(ctx, 48, 48, 14, 13, [200, 50, 74], 0.6) })
  const dab = one(64, ctx => {
    const g = ctx.createRadialGradient(28, 28, 2, 32, 32, 18)
    g.addColorStop(0, '#fffdf0'); g.addColorStop(0.6, '#fbeeb8'); g.addColorStop(1, 'rgba(239,214,138,0)')
    ctx.fillStyle = g
    ctx.beginPath(); ctx.arc(32, 32, 18, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.95)'
    ctx.beginPath(); ctx.ellipse(26, 25, 5, 3, -0.6, 0, Math.PI * 2); ctx.fill()
  })
  return { halo, dome: domeArt(128, 0.25), deepDome: domeArt(160, 0.55), head, blanch, mark, dab }
}

function one(size: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const [c, ctx] = canvas(size)
  draw(ctx)
  return c
}
