import type { Look } from '../core/customers.ts'
import { makeRng } from '../core/rng.ts'
import { OUTFIT } from './palette.ts'
import { blob, blurred, canvas, hex, rgba, shade, smoothPath, terry, type Ctx } from './paint.ts'

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
    // The far end of the room, out of focus: a pastel wall with a shelf of polish bottles and warm light.
    const [room, rctx] = canvas(BACKDROP)
    const wall = rctx.createLinearGradient(0, 0, 0, 420)
    wall.addColorStop(0, '#f3dcef'); wall.addColorStop(1, '#ecd0e4')
    rctx.fillStyle = wall
    rctx.fillRect(0, 0, BACKDROP, 420)
    blob(rctx, 1300, 80, 600, 300, [255, 240, 214], 0.8)
    rctx.fillStyle = '#fff6f9'; rctx.fillRect(120, 250, 1360, 16)
    for (let x = 150; x < 1440; x += r.range(46, 70)) {
      const col = hex([0xf4a6b8, 0xd83a56, 0xb79ce6, 0x94dcc0, 0xf6dd8a, 0x8ec5f2, 0xf5836b][r.int(0, 6)])
      rctx.fillStyle = rgba(col); rctx.beginPath(); rctx.roundRect(x, 196, 34, 54, 10); rctx.fill()
      rctx.fillStyle = '#3c3048'; rctx.fillRect(x + 11, 170, 12, 28)
    }
    for (let i = 0; i < 18; i++) blob(rctx, r.range(0, 1600), r.range(0, 360), r.range(14, 40), r.range(14, 40), [255, 236, 214], r.range(0.3, 0.7), 0.7)
    ctx.save(); ctx.filter = 'blur(12px)'; ctx.drawImage(room, 0, 0); ctx.restore()
    // The desk: a soft cream top with a gentle sheen, a little out of focus toward the far edge.
    const [desk, dctx] = canvas(BACKDROP)
    const dg = dctx.createLinearGradient(0, 330, 0, BACKDROP)
    dg.addColorStop(0, '#f6e9ec'); dg.addColorStop(0.4, '#fbf3f1'); dg.addColorStop(1, '#f3e4e3')
    dctx.fillStyle = dg
    dctx.beginPath(); dctx.roundRect(-40, 330, BACKDROP + 80, BACKDROP, 60); dctx.fill()
    blob(dctx, 420, 620, 520, 260, [255, 255, 255], 0.55)
    dctx.fillStyle = 'rgba(200,160,176,0.35)'; dctx.fillRect(0, 330, BACKDROP, 10)
    ctx.save(); ctx.filter = 'blur(3px)'; ctx.drawImage(desk, 0, 0); ctx.restore()
    // A soft folded towel under the hand, with rolled edges.
    const towel = shade(hex(OUTFIT[(look.outfit + 2) % OUTFIT.length]), 0.45)
    const tx = o + 70, ty = o + 110, tw = 880, th = 1100
    blurred(ctx, 26, () => { ctx.fillStyle = 'rgba(140,90,120,0.3)'; ctx.beginPath(); ctx.roundRect(tx + 16, ty + 26, tw, th, 70); ctx.fill() })
    ctx.save()
    ctx.beginPath(); ctx.roundRect(tx, ty, tw, th, 70)
    const tg = ctx.createLinearGradient(tx, ty, tx + tw, ty + th)
    tg.addColorStop(0, rgba(shade(towel, 0.35))); tg.addColorStop(1, rgba(shade(towel, -0.05)))
    ctx.fillStyle = tg
    ctx.fill()
    ctx.clip()
    terry(ctx, tx, ty, tw, th, towel, 13, 0.02)
    blurred(ctx, 12, () => {
      for (let i = 0; i < 5; i++) {
        const y = ty + 180 + i * 190 + r.range(-40, 40)
        ctx.strokeStyle = i % 2 ? rgba(shade(towel, 0.4), 0.6) : rgba(shade(towel, -0.18), 0.4)
        ctx.lineWidth = r.range(16, 28)
        ctx.beginPath(); ctx.moveTo(tx - 20, y); ctx.quadraticCurveTo(tx + tw / 2, y + r.range(-50, 50), tx + tw + 20, y + r.range(-30, 30)); ctx.stroke()
      }
    })
    ctx.restore()
    blurred(ctx, 3, () => {
      ctx.strokeStyle = rgba(shade(towel, 0.5), 0.95); ctx.lineWidth = 22; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(tx + 40, ty + 14); ctx.lineTo(tx + tw - 40, ty + 14); ctx.stroke()
      ctx.strokeStyle = rgba(shade(towel, -0.2), 0.4); ctx.lineWidth = 6
      ctx.beginPath(); ctx.moveTo(tx + 40, ty + 30); ctx.lineTo(tx + tw - 40, ty + 30); ctx.stroke()
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
