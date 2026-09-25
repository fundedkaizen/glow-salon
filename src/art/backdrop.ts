import type { Look } from '../core/customers.ts'
import { makeRng } from '../core/rng.ts'
import { OUTFIT } from './palette.ts'
import { blob, blurred, canvas, fbm, hex, rgba, shade, smoothPath, terry, type Ctx } from './paint.ts'

/**
 * What surrounds the body part in a close-up, 1600 x 1600 centred on the 1024 art sheet (so it still fills
 * the view when the camera pulls back). For a facial: a softly blurred pastel treatment room (shelves,
 * a plant, warm window light, bokeh) behind the spa bed, the pillow and a folded towel under the head.
 * For a manicure: the nail desk. Blur gives depth of field: far things soft, near things crisp.
 */
export const BACKDROP = 1600
export const BACKDROP_OFFSET = (BACKDROP - 1024) / 2

export function paintBackdrop(kind: 'facial' | 'nails', look: Look): HTMLCanvasElement {
  const [c, ctx] = canvas(BACKDROP)
  const r = makeRng(look.outfit * 31 + look.hair + 5)
  const o = BACKDROP_OFFSET
  if (kind === 'facial') {
    // The room, far away and out of focus.
    const [room, rctx] = canvas(BACKDROP)
    const wall = rctx.createLinearGradient(0, 0, 0, BACKDROP)
    wall.addColorStop(0, '#f9e6ee'); wall.addColorStop(0.55, '#f1d4e2'); wall.addColorStop(1, '#e6c3d5')
    rctx.fillStyle = wall
    rctx.fillRect(0, 0, BACKDROP, BACKDROP)
    // Warm light pouring in from a window at the top left.
    blob(rctx, 120, 80, 700, 520, [255, 240, 214], 0.9)
    rctx.save()
    rctx.globalCompositeOperation = 'screen'
    for (let i = 0; i < 4; i++) {
      rctx.fillStyle = 'rgba(255,236,210,0.16)'
      rctx.beginPath(); rctx.moveTo(40 + i * 140, 0); rctx.lineTo(160 + i * 140, 0); rctx.lineTo(620 + i * 180, 1600); rctx.lineTo(420 + i * 180, 1600); rctx.closePath(); rctx.fill()
    }
    rctx.restore()
    // Shelves with jars and bottles, left and right.
    for (const [sx, sy, w] of [[40, 300, 360], [1200, 260, 380], [60, 760, 300], [1260, 820, 320]] as const) {
      rctx.fillStyle = '#fff6f9'; rctx.fillRect(sx, sy, w, 18)
      rctx.fillStyle = 'rgba(190,140,160,0.4)'; rctx.fillRect(sx, sy + 18, w, 8)
      let x = sx + 14
      while (x < sx + w - 40) {
        const bw = r.range(34, 60), bh = r.range(60, 130)
        const col = hex([0xf7b7c9, 0xa9e3cf, 0xcdbdf2, 0xfbd9a0, 0xffffff, 0xf5a99a][r.int(0, 5)])
        rctx.fillStyle = rgba(col); rctx.beginPath(); rctx.roundRect(x, sy - bh, bw, bh, 10); rctx.fill()
        rctx.fillStyle = rgba(shade(col, -0.25)); rctx.fillRect(x + bw * 0.25, sy - bh - 14, bw * 0.5, 16)
        blob(rctx, x + bw * 0.3, sy - bh * 0.6, bw * 0.15, bh * 0.3, [255, 255, 255], 0.7)
        x += bw + r.range(8, 20)
      }
    }
    // A big leafy plant at the left.
    for (let i = 0; i < 16; i++) {
      const a = -Math.PI / 2 + r.range(-1.2, 1.2), len = r.range(160, 300)
      const bx = 150, by = 1250
      const tx = bx + Math.cos(a) * len, ty = by + Math.sin(a) * len
      rctx.fillStyle = rgba(shade([120, 190, 150], r.range(-0.2, 0.2)))
      rctx.beginPath(); rctx.ellipse((bx + tx) / 2 + (tx - bx) * 0.2, (by + ty) / 2 + (ty - by) * 0.2, len * 0.32, len * 0.16, a, 0, Math.PI * 2); rctx.fill()
    }
    rctx.fillStyle = '#f3e4dc'; rctx.beginPath(); rctx.roundRect(70, 1240, 170, 150, 30); rctx.fill()
    // Bokeh: fairy lights and glints, out of focus.
    for (let i = 0; i < 40; i++) {
      const x = r() < 0.5 ? r.range(0, 360) : r.range(1240, 1600), y = r.range(0, 1600)
      const rad = r.range(14, 46)
      const col = r.pick([[255, 240, 210], [255, 200, 220], [255, 255, 255], [220, 200, 255]] as const)
      blob(rctx, x, y, rad, rad, [col[0], col[1], col[2]], r.range(0.35, 0.8), 0.7)
    }
    ctx.save(); ctx.filter = 'blur(14px)'; ctx.drawImage(room, 0, 0); ctx.restore()
    // The spa bed's blush cushion around the pillow, a little soft.
    const [bed, bctx] = canvas(BACKDROP)
    bctx.fillStyle = '#eeb3c7'
    bctx.beginPath(); bctx.roundRect(o - 330, o - 250, 1024 + 660, 1024 + 600, 220); bctx.fill()
    const bg = bctx.createLinearGradient(o - 330, 0, o + 1350, 0)
    bg.addColorStop(0, 'rgba(255,230,238,0.7)'); bg.addColorStop(0.5, 'rgba(255,255,255,0)'); bg.addColorStop(1, 'rgba(160,80,110,0.35)')
    bctx.fillStyle = bg
    bctx.beginPath(); bctx.roundRect(o - 330, o - 250, 1024 + 660, 1024 + 600, 220); bctx.fill()
    ctx.save(); ctx.filter = 'blur(5px)'; ctx.drawImage(bed, 0, 0); ctx.restore()
    // The pillow under the head: plump cotton with soft folds.
    const pillow = [o + 70, o + 120, o + 250, o - 40, o + 512, o - 90, o + 774, o - 40, o + 954, o + 120, o + 1010, o + 520, o + 954, o + 920, o + 512, o + 1010, o + 70, o + 920, o + 14, o + 520]
    blurred(ctx, 26, () => { ctx.fillStyle = 'rgba(140,70,100,0.35)'; ctx.beginPath(); smoothPath(ctx, pillow.map((v, i) => v + (i % 2 ? 24 : 14))); ctx.fill() })
    ctx.save()
    ctx.beginPath(); smoothPath(ctx, pillow)
    const pg = ctx.createRadialGradient(o + 420, o + 300, 80, o + 512, o + 460, 700)
    pg.addColorStop(0, '#ffffff'); pg.addColorStop(0.7, '#f9f1f3'); pg.addColorStop(1, '#e9dbe0')
    ctx.fillStyle = pg
    ctx.fill()
    ctx.clip()
    blurred(ctx, 16, () => {
      for (let i = 0; i < 8; i++) {
        const x = o + r.range(80, 940), y = o + r.range(-40, 960)
        ctx.strokeStyle = r() < 0.5 ? 'rgba(255,255,255,0.9)' : 'rgba(210,190,198,0.5)'
        ctx.lineWidth = r.range(14, 30)
        ctx.beginPath(); ctx.moveTo(x - 120, y - 40); ctx.quadraticCurveTo(x, y + r.range(-40, 40), x + 140, y + 30); ctx.stroke()
      }
    })
    ctx.restore()
    // A folded towel under the neck, in the customer's colour.
    const towel = shade(hex(OUTFIT[(look.outfit + 3) % OUTFIT.length]), 0.3)
    ctx.save()
    ctx.beginPath(); ctx.roundRect(o + 60, o + 860, 904, 240, 70)
    const tg = ctx.createLinearGradient(0, o + 860, 0, o + 1100)
    tg.addColorStop(0, rgba(shade(towel, 0.3))); tg.addColorStop(1, rgba(shade(towel, -0.05)))
    ctx.fillStyle = tg
    ctx.fill()
    ctx.clip()
    terry(ctx, o + 60, o + 860, 904, 240, towel, 91, 0.014)
    ctx.restore()
  } else {
    // A cream marble nail desk.
    ctx.fillStyle = '#f7f1ee'
    ctx.fillRect(0, 0, BACKDROP, BACKDROP)
    ctx.globalCompositeOperation = 'multiply'
    ctx.globalAlpha = 0.14
    ctx.drawImage(fbm(BACKDROP, 240, 4, 77), 0, 0)
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
    blurred(ctx, 3, () => {
      for (let i = 0; i < 12; i++) {
        ctx.strokeStyle = `rgba(206,176,186,${r.range(0.15, 0.35)})`
        ctx.lineWidth = r.range(1.5, 4)
        ctx.beginPath()
        let x = r.range(0, BACKDROP), y = 0
        ctx.moveTo(x, y)
        while (y < BACKDROP) { x += r.range(-80, 80); y += r.range(60, 160); ctx.lineTo(x, y) }
        ctx.stroke()
      }
    })
    blob(ctx, 200, 150, 700, 500, [255, 244, 226], 0.5)
    // A folded hand towel under the hand.
    const towel = hex(OUTFIT[(look.outfit + 2) % OUTFIT.length])
    blurred(ctx, 24, () => { ctx.fillStyle = 'rgba(120,90,120,0.3)'; ctx.beginPath(); ctx.roundRect(o + 60, o + 150, 920, 1100, 60); ctx.fill() })
    ctx.save()
    ctx.beginPath(); ctx.roundRect(o + 40, o + 120, 940, 1100, 60)
    const tg = ctx.createLinearGradient(0, o + 120, 0, o + 1200)
    tg.addColorStop(0, rgba(shade(towel, 0.4))); tg.addColorStop(1, rgba(shade(towel, 0.15)))
    ctx.fillStyle = tg
    ctx.fill()
    ctx.clip()
    terry(ctx, o + 40, o + 120, 940, 1100, shade(towel, 0.3), 13, 0.012)
    ctx.fillStyle = rgba(shade(towel, -0.1), 0.5)
    ctx.fillRect(o + 40, o + 1080, 940, 16)
    ctx.restore()
    // A glass bowl of warm water, cotton balls and polish bottles, out of focus.
    blurred(ctx, 8, () => {
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
  const g = ctx.createRadialGradient(800, 800, 520, 800, 800, 1150)
  g.addColorStop(0, 'rgba(90,40,70,0)'); g.addColorStop(1, 'rgba(90,40,70,0.25)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, BACKDROP, BACKDROP)
}
