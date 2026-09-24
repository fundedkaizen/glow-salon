import type { Look } from '../core/customers.ts'
import { makeRng } from '../core/rng.ts'
import { OUTFIT } from './palette.ts'
import { blob, blurred, canvas, fbm, hex, rgba, shade, terry, type Ctx } from './paint.ts'

/**
 * What surrounds the body part in a close-up, 1600 x 1600 centred on the 1024 art sheet (so it still fills
 * the view when the camera pulls back): the spa bed's pillow for a facial, the nail desk for a manicure.
 * Out-of-focus props at the edges give depth.
 */
export const BACKDROP = 1600
export const BACKDROP_OFFSET = (BACKDROP - 1024) / 2

export function paintBackdrop(kind: 'facial' | 'nails', look: Look): HTMLCanvasElement {
  const [c, ctx] = canvas(BACKDROP)
  const r = makeRng(look.outfit * 31 + look.hair)
  const o = BACKDROP_OFFSET
  if (kind === 'facial') {
    const g = ctx.createRadialGradient(800, 760, 200, 800, 800, 1000)
    g.addColorStop(0, '#fbe3ea'); g.addColorStop(1, '#e9b9ca')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, BACKDROP, BACKDROP)
    // Tufted blush leather of the spa bed.
    ctx.globalAlpha = 0.5
    for (let y = 40; y < BACKDROP; y += 150) for (let x = (y / 150) % 2 ? 40 : 115; x < BACKDROP; x += 150) { blob(ctx, x, y, 60, 60, [255, 240, 244], 0.35); blob(ctx, x, y, 7, 7, [196, 120, 146], 0.9) }
    ctx.globalAlpha = 1
    // The terry pillow under the head.
    blurred(ctx, 30, () => { ctx.fillStyle = 'rgba(150,80,110,0.4)'; ctx.beginPath(); ctx.roundRect(o - 150, o - 120, 1340, 1260, 180); ctx.fill() })
    ctx.save()
    ctx.beginPath(); ctx.roundRect(o - 170, o - 150, 1364, 1250, 190)
    const pg = ctx.createRadialGradient(800, 700, 100, 800, 760, 900)
    pg.addColorStop(0, '#ffffff'); pg.addColorStop(0.8, '#f6f0f1'); pg.addColorStop(1, '#e6dadd')
    ctx.fillStyle = pg
    ctx.fill()
    ctx.clip()
    terry(ctx, o - 170, o - 150, 1364, 1250, [238, 230, 232], 11, 0.012)
    blurred(ctx, 18, () => { ctx.strokeStyle = 'rgba(200,180,188,0.6)'; ctx.lineWidth = 30; ctx.beginPath(); ctx.roundRect(o - 150, o - 130, 1324, 1210, 180); ctx.stroke() })
    ctx.restore()
    // Out-of-focus rose petals and a candle at the edges.
    blurred(ctx, 7, () => {
      for (let i = 0; i < 12; i++) {
        const side = r() < 0.5
        const x = side ? r.range(20, 200) : r.range(1400, 1580), y = r.range(100, 1500)
        ctx.fillStyle = rgba(shade(hex(0xf28aa9), r.range(-0.1, 0.2)), 0.9)
        ctx.beginPath(); ctx.ellipse(x, y, r.range(18, 30), r.range(10, 18), r() * 3, 0, Math.PI * 2); ctx.fill()
      }
    })
    blurred(ctx, 10, () => {
      ctx.fillStyle = '#fff4e8'; ctx.beginPath(); ctx.roundRect(1440, 1300, 110, 140, 20); ctx.fill()
      blob(ctx, 1495, 1280, 50, 70, [255, 214, 140], 0.8)
    })
  } else {
    // A cream marble nail desk.
    ctx.fillStyle = '#f7f1ee'
    ctx.fillRect(0, 0, BACKDROP, BACKDROP)
    ctx.globalCompositeOperation = 'multiply'
    ctx.globalAlpha = 0.18
    ctx.drawImage(fbm(BACKDROP, 200, 5, 77), 0, 0)
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
    blurred(ctx, 2, () => {
      for (let i = 0; i < 14; i++) {
        ctx.strokeStyle = `rgba(200,170,180,${r.range(0.15, 0.4)})`
        ctx.lineWidth = r.range(1, 4)
        ctx.beginPath()
        let x = r.range(0, BACKDROP), y = 0
        ctx.moveTo(x, y)
        while (y < BACKDROP) { x += r.range(-80, 80); y += r.range(60, 160); ctx.lineTo(x, y) }
        ctx.stroke()
      }
    })
    // A folded hand towel under the hand.
    const towel = hex(OUTFIT[(look.outfit + 2) % OUTFIT.length])
    blurred(ctx, 24, () => { ctx.fillStyle = 'rgba(120,90,120,0.35)'; ctx.beginPath(); ctx.roundRect(o + 60, o + 150, 920, 1100, 60); ctx.fill() })
    ctx.save()
    ctx.beginPath(); ctx.roundRect(o + 40, o + 120, 940, 1100, 60)
    const tg = ctx.createLinearGradient(0, o + 120, 0, o + 1200)
    tg.addColorStop(0, rgba(shade(towel, 0.35))); tg.addColorStop(1, rgba(shade(towel, 0.1)))
    ctx.fillStyle = tg
    ctx.fill()
    ctx.clip()
    terry(ctx, o + 40, o + 120, 940, 1100, shade(towel, 0.25), 13, 0.016)
    ctx.fillStyle = rgba(shade(towel, -0.15), 0.5)
    ctx.fillRect(o + 40, o + 1080, 940, 16)
    ctx.restore()
    // A glass bowl of warm water, cotton balls and polish bottles, out of focus.
    blurred(ctx, 6, () => {
      ctx.fillStyle = 'rgba(210,236,250,0.8)'; ctx.beginPath(); ctx.ellipse(1400, 1250, 170, 120, 0, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 10; ctx.beginPath(); ctx.ellipse(1400, 1250, 170, 120, 0, 0, Math.PI * 2); ctx.stroke()
      blob(ctx, 1350, 1210, 60, 30, [255, 255, 255], 0.6)
      for (let i = 0; i < 5; i++) { const x = 140 + i * 70, y = 1380 + (i % 2) * 50; blob(ctx, x, y, 34, 34, [255, 255, 255], 1, 0.6) }
      const bottles = [0xf4a6b8, 0xb79ce6, 0x94dcc0, 0xd83a56]
      bottles.forEach((col, i) => {
        const x = 120 + i * 95, y = 140
        ctx.fillStyle = rgba(hex(col)); ctx.beginPath(); ctx.roundRect(x, y, 70, 90, 16); ctx.fill()
        ctx.fillStyle = '#3c3048'; ctx.beginPath(); ctx.roundRect(x + 18, y - 70, 34, 72, 8); ctx.fill()
        blob(ctx, x + 22, y + 26, 10, 22, [255, 255, 255], 0.6)
      })
    })
  }
  vignette(ctx)
  return c
}

function vignette(ctx: Ctx) {
  const g = ctx.createRadialGradient(800, 800, 500, 800, 800, 1150)
  g.addColorStop(0, 'rgba(90,40,70,0)'); g.addColorStop(1, 'rgba(90,40,70,0.28)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, BACKDROP, BACKDROP)
}
