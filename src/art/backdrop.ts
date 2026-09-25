import type { Look } from '../core/customers.ts'
import { makeRng } from '../core/rng.ts'
import { OUTFIT } from './palette.ts'
import { blob, blurred, canvas, hex, rgba, shade, terry, type Ctx } from './paint.ts'

/**
 * What surrounds the body part in a close-up, 1600 x 1600 centred on the 1024 art sheet (so it still fills
 * the view when the camera pulls back). For a facial: a softly blurred pastel treatment room (shelves,
 * a plant, warm window light, bokeh) behind the spa bed, the pillow and a folded towel under the head.
 * For a manicure: the nail desk. Blur gives depth of field: far things soft, near things crisp.
 */
export const BACKDROP = 1600
export const BACKDROP_OFFSET = (BACKDROP - 1024) / 2

export function paintBackdrop(kind: 'facial' | 'nails' | 'feet' | 'sole', look: Look): HTMLCanvasElement {
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
    // The salon beside the bed (out of focus): a vanity mirror ringed with warm bulbs on the left, open
    // shelves of pastel bottles and a flower vase on the right, a big leafy plant at each foot.
    // Vanity: the mirror's pale glass reflecting the room, a cream frame, bulbs down its inner edge.
    rctx.fillStyle = '#fbf1ea'; rctx.beginPath(); rctx.roundRect(-150, 120, 260, 1080, 60); rctx.fill()
    const mg = rctx.createLinearGradient(-130, 0, 80, 0)
    mg.addColorStop(0, '#e6eef4'); mg.addColorStop(0.6, '#f6f1f4'); mg.addColorStop(1, '#dde4ee')
    rctx.fillStyle = mg; rctx.beginPath(); rctx.roundRect(-130, 150, 210, 1020, 44); rctx.fill()
    rctx.fillStyle = 'rgba(255,255,255,0.5)'; rctx.beginPath(); rctx.moveTo(0, 170); rctx.lineTo(60, 170); rctx.lineTo(-30, 700); rctx.lineTo(-40, 520); rctx.closePath(); rctx.fill()
    for (let y = 190; y < 1160; y += 120) {
      blob(rctx, 96, y, 70, 70, [255, 226, 180], 0.5)
      blob(rctx, 96, y, 26, 26, [255, 250, 236], 1, 0.6)
    }
    // Shelves on the right with bottles, jars and a vase of flowers.
    for (const [sx, sy, w] of [[1400, 330, 260], [1420, 760, 240], [1400, 1180, 260], [-20, 1320, 220]] as const) {
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
    // Flowers in a vase on the top shelf.
    rctx.fillStyle = '#cfe6f2'; rctx.beginPath(); rctx.roundRect(1440, 700, 70, 60, 20); rctx.fill()
    for (let i = 0; i < 9; i++) {
      const fx = 1475 + r.range(-70, 70), fy = 600 + r.range(-60, 40)
      rctx.strokeStyle = '#8cc49e'; rctx.lineWidth = 5; rctx.beginPath(); rctx.moveTo(1475, 700); rctx.quadraticCurveTo(1475 + (fx - 1475) * 0.3, 660, fx, fy); rctx.stroke()
      blob(rctx, fx, fy, 30, 30, r.pick([[247, 170, 196], [255, 220, 150], [240, 240, 255]] as const) as unknown as [number, number, number], 0.95, 0.6)
    }
    // Leafy plants at the feet of the walls.
    for (const bx of [110, 1500]) {
      const by = 1500
      for (let i = 0; i < 16; i++) {
        const a = -Math.PI / 2 + r.range(-1.2, 1.2), len = r.range(160, 300)
        const tx = bx + Math.cos(a) * len, ty = by + Math.sin(a) * len
        rctx.fillStyle = rgba(shade([120, 190, 150], r.range(-0.2, 0.2)))
        rctx.beginPath(); rctx.ellipse((bx + tx) / 2 + (tx - bx) * 0.2, (by + ty) / 2 + (ty - by) * 0.2, len * 0.32, len * 0.16, a, 0, Math.PI * 2); rctx.fill()
      }
      rctx.fillStyle = '#f3e4dc'; rctx.beginPath(); rctx.roundRect(bx - 85, by - 10, 170, 150, 30); rctx.fill()
    }
    // Bokeh: fairy lights and glints, out of focus.
    for (let i = 0; i < 40; i++) {
      const x = r() < 0.5 ? r.range(0, 260) : r.range(1340, 1600), y = r.range(0, 1600)
      const rad = r.range(14, 46)
      const col = r.pick([[255, 240, 210], [255, 200, 220], [255, 255, 255], [220, 200, 255]] as const)
      blob(rctx, x, y, rad, rad, [col[0], col[1], col[2]], r.range(0.35, 0.8), 0.7)
    }
    ctx.save(); ctx.filter = 'blur(14px)'; ctx.drawImage(room, 0, 0); ctx.restore()
    // The spa bed's blush cushion around the pillow, a little soft.
    const [bed, bctx] = canvas(BACKDROP)
    bctx.fillStyle = '#eeb3c7'
    bctx.beginPath(); bctx.roundRect(o - 150, o - 250, 1024 + 300, 1024 + 600, 170); bctx.fill()
    const bg = bctx.createLinearGradient(o - 150, 0, o + 1174, 0)
    bg.addColorStop(0, 'rgba(255,230,238,0.7)'); bg.addColorStop(0.5, 'rgba(255,255,255,0)'); bg.addColorStop(1, 'rgba(160,80,110,0.35)')
    bctx.fillStyle = bg
    bctx.beginPath(); bctx.roundRect(o - 150, o - 250, 1024 + 300, 1024 + 600, 170); bctx.fill()
    ctx.save(); ctx.filter = 'blur(5px)'; ctx.drawImage(bed, 0, 0); ctx.restore()
    // The pillow under the head: a wide, puffy cotton cushion with pinched corners and a piped seam.
    // It sits behind the head, so the hair covers most of it; only its shoulders show around the hair.
    const L = o - 90, R = o + 1114, T = o - 30, B = o + 860
    const cushion = (inset: number) => {
      const l = L + inset, rr = R - inset, t = T + inset, b = B - inset, dip = 34 - inset * 0.3
      ctx.beginPath()
      ctx.moveTo(l + 40, t + 10)
      ctx.bezierCurveTo((l + rr) / 2 - 300, t + dip, (l + rr) / 2 + 300, t + dip, rr - 40, t + 10)
      ctx.quadraticCurveTo(rr + 6, t - 4, rr - 8, t + 44)
      ctx.bezierCurveTo(rr - dip * 0.8, (t + b) / 2 - 200, rr - dip * 0.8, (t + b) / 2 + 200, rr - 8, b - 44)
      ctx.quadraticCurveTo(rr + 6, b + 4, rr - 40, b - 10)
      ctx.bezierCurveTo((l + rr) / 2 + 300, b - dip, (l + rr) / 2 - 300, b - dip, l + 40, b - 10)
      ctx.quadraticCurveTo(l - 6, b + 4, l + 8, b - 44)
      ctx.bezierCurveTo(l + dip * 0.8, (t + b) / 2 + 200, l + dip * 0.8, (t + b) / 2 - 200, l + 8, t + 44)
      ctx.quadraticCurveTo(l - 6, t - 4, l + 40, t + 10)
      ctx.closePath()
    }
    // Its soft shadow on the bed.
    blurred(ctx, 30, () => { ctx.fillStyle = 'rgba(140,70,100,0.3)'; ctx.translate(18, 30); cushion(0); ctx.fill() })
    ctx.save()
    cushion(0)
    const pg = ctx.createRadialGradient(o + 330, o + 180, 60, o + 512, o + 420, 900)
    pg.addColorStop(0, '#fffdfb'); pg.addColorStop(0.55, '#f8eeee'); pg.addColorStop(1, '#e8d6dc')
    ctx.fillStyle = pg
    ctx.fill()
    ctx.clip()
    // Puffed up in the middle: the edges roll away from the light and darken.
    blurred(ctx, 40, () => { ctx.strokeStyle = 'rgba(176,130,150,0.38)'; ctx.lineWidth = 120; cushion(0); ctx.stroke() })
    blurred(ctx, 30, () => { ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 40; ctx.beginPath(); ctx.moveTo(L + 120, T + 120); ctx.quadraticCurveTo(o + 300, T + 60, o + 700, T + 90); ctx.stroke() })
    // The head presses a soft hollow into it.
    blob(ctx, o + 512, o + 470, 560, 520, [170, 120, 140], 0.28)
    // Creases running in from the pinched corners.
    blurred(ctx, 6, () => {
      for (const [cx, cy, dx, dy] of [[L, T, 1, 1], [R, T, -1, 1], [L, B, 1, -1], [R, B, -1, -1]] as const) {
        for (let k = 0; k < 3; k++) {
          const len = r.range(90, 170), bend = r.range(-30, 30)
          ctx.strokeStyle = k % 2 ? 'rgba(255,255,255,0.8)' : 'rgba(190,150,165,0.45)'
          ctx.lineWidth = r.range(4, 8)
          const sx = cx + dx * (30 + k * 16), sy = cy + dy * (40 - k * 8)
          ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(sx + dx * len * 0.5 + bend, sy + dy * len * 0.3, sx + dx * len, sy + dy * len * 0.55); ctx.stroke()
        }
      }
    })
    // Cotton weave, barely there.
    ctx.globalAlpha = 0.05
    for (let i = 0; i < 900; i++) { ctx.fillStyle = r() < 0.5 ? '#ffffff' : '#c9a9b6'; ctx.fillRect(L + r() * (R - L), T + r() * (B - T), r.range(1, 3), 1) }
    ctx.globalAlpha = 1
    ctx.restore()
    // The piped seam just inside the edge: a light roll and the shadow line under it.
    blurred(ctx, 1.5, () => {
      ctx.strokeStyle = 'rgba(190,150,166,0.55)'; ctx.lineWidth = 3; cushion(26); ctx.stroke()
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 2; ctx.translate(-1.5, -2); cushion(26); ctx.stroke()
    })
  } else if (kind === 'feet' || kind === 'sole') {
    paintFootTowel(ctx, look, kind === 'feet')
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

/**
 * The pedicure: seen from above, a padded footrest with a fluffy terry towel folded over it, standing on the
 * salon's pastel tiles (far below, so softly out of focus, with a plant and bottles at the edges). The towel
 * has deep soft folds, a rolled hem and a stitched stripe. Under the top view's toes, the rim of the foot
 * bath shows at the bottom: glazed ceramic and a sliver of water.
 */
function paintFootTowel(ctx: Ctx, look: Look, basin: boolean) {
  const r = makeRng(look.outfit * 13 + 7)
  const W = BACKDROP
  const towel = shade(hex([0xd9ccf5, 0xf7c6d4, 0xbfeadb, 0xcdbdf2][look.outfit % 4]), 0.05)
  // The floor, far below: pastel tiles with white grout, warm light, a plant and bottles at the edges.
  const [room, rctx] = canvas(W)
  const tiles = ['#cdeee4', '#d7e9f7', '#f4dbe8']
  for (let y = -40; y < W; y += 190) for (let x = -40; x < W; x += 190) {
    rctx.fillStyle = tiles[((x + y) / 190 + 20) % 3 | 0]
    rctx.fillRect(x + 5, y + 5, 180, 180)
    rctx.fillStyle = 'rgba(255,255,255,0.35)'; rctx.fillRect(x + 12, y + 12, 70, 18)
  }
  blob(rctx, 200, 150, 700, 500, [255, 244, 222], 0.6)
  for (const [px, py] of [[90, 260], [1520, 1280]] as const) {
    for (let i = 0; i < 14; i++) {
      const a = r.range(0, Math.PI * 2), len = r.range(120, 220)
      rctx.fillStyle = rgba(shade([120, 190, 150], r.range(-0.25, 0.15)))
      rctx.beginPath(); rctx.ellipse(px + Math.cos(a) * len * 0.5, py + Math.sin(a) * len * 0.5, len * 0.5, len * 0.2, a, 0, Math.PI * 2); rctx.fill()
    }
    rctx.fillStyle = '#f3e4dc'; rctx.beginPath(); rctx.arc(px, py, 70, 0, Math.PI * 2); rctx.fill()
  }
  for (const [bx, by, col] of [[1500, 160, '#f7b7c9'], [1450, 300, '#ffffff'], [1540, 420, '#cdbdf2'], [70, 1420, '#fbd9a0']] as const) {
    rctx.fillStyle = col; rctx.beginPath(); rctx.arc(bx, by, 46, 0, Math.PI * 2); rctx.fill()
    rctx.fillStyle = 'rgba(255,255,255,0.7)'; rctx.beginPath(); rctx.arc(bx - 14, by - 14, 12, 0, Math.PI * 2); rctx.fill()
  }
  ctx.save(); ctx.filter = 'blur(12px)'; ctx.drawImage(room, 0, 0); ctx.restore()
  // The footrest: a padded blush cushion with piping, its shadow on the floor.
  const L = 150, T = 40, R = W - 150, B = W + 200
  blurred(ctx, 30, () => { ctx.fillStyle = 'rgba(110,60,100,0.4)'; ctx.beginPath(); ctx.roundRect(L + 20, T + 34, R - L, B - T, 130); ctx.fill() })
  ctx.save()
  ctx.beginPath(); ctx.roundRect(L, T, R - L, B - T, 130)
  const cg = ctx.createLinearGradient(L, 0, R, 0)
  cg.addColorStop(0, '#f6c9d8'); cg.addColorStop(0.5, '#fbdce6'); cg.addColorStop(1, '#e3a9bf')
  ctx.fillStyle = cg
  ctx.fill()
  ctx.clip()
  blurred(ctx, 26, () => { ctx.strokeStyle = 'rgba(170,90,120,0.45)'; ctx.lineWidth = 70; ctx.beginPath(); ctx.roundRect(L, T, R - L, B - T, 130); ctx.stroke() })
  ctx.restore()
  blurred(ctx, 1.5, () => { ctx.strokeStyle = 'rgba(255,240,246,0.9)'; ctx.lineWidth = 5; ctx.beginPath(); ctx.roundRect(L + 20, T + 20, R - L - 40, B - T - 40, 112); ctx.stroke() })
  // The towel folded over it: fluffy terry, lit from the top left, deep soft folds, a rolled edge on top.
  const tL = L + 70, tT = T + 80, tR = R - 70
  const towelPath = (c: Ctx) => {
    c.beginPath(); c.moveTo(tL + 40, tT)
    c.bezierCurveTo((tL + tR) / 2 - 200, tT + 16, (tL + tR) / 2 + 200, tT - 10, tR - 40, tT + 6)
    c.quadraticCurveTo(tR + 10, tT + 10, tR + 6, tT + 60)
    c.lineTo(tR + 26, W + 100); c.lineTo(tL - 26, W + 100); c.lineTo(tL - 6, tT + 60)
    c.quadraticCurveTo(tL - 8, tT + 4, tL + 40, tT)
    c.closePath()
  }
  blurred(ctx, 20, () => { ctx.fillStyle = 'rgba(110,60,110,0.35)'; ctx.translate(12, 20); towelPath(ctx); ctx.fill() })
  ctx.save()
  towelPath(ctx)
  const g = ctx.createLinearGradient(tL, tT, tR, W)
  g.addColorStop(0, rgba(shade(towel, 0.3))); g.addColorStop(0.5, rgba(towel)); g.addColorStop(1, rgba(shade(towel, -0.12)))
  ctx.fillStyle = g
  ctx.fill()
  ctx.clip()
  terry(ctx, tL - 30, tT - 10, tR - tL + 60, W - tT + 110, towel, 21, 0.02)
  // Deep folds: each a shaded valley beside a lit ridge, running down the towel.
  blurred(ctx, 22, () => {
    for (let i = 0; i < 7; i++) {
      const x = tL + 60 + i * ((tR - tL - 120) / 6) + r.range(-50, 50), bend = r.range(-120, 120)
      ctx.strokeStyle = rgba(shade(towel, -0.24), 0.5); ctx.lineWidth = r.range(30, 52)
      ctx.beginPath(); ctx.moveTo(x, tT + 40); ctx.quadraticCurveTo(x + bend, W / 2, x + r.range(-160, 160), W + 100); ctx.stroke()
      ctx.strokeStyle = rgba(shade(towel, 0.4), 0.55); ctx.lineWidth = r.range(20, 34)
      ctx.beginPath(); ctx.moveTo(x - 46, tT + 40); ctx.quadraticCurveTo(x + bend - 46, W / 2, x + r.range(-160, 160) - 46, W + 100); ctx.stroke()
    }
  })
  // Fluff: soft light pile catching the light at the top left.
  blob(ctx, 480, 460, 600, 500, [255, 250, 255], 0.22)
  blob(ctx, 1300, 1300, 600, 500, [90, 50, 100], 0.12)
  ctx.restore()
  // The rolled top edge and a stitched stripe below it.
  const edge = (c: Ctx, dy: number) => { c.beginPath(); c.moveTo(tL + 20, tT + 8 + dy); c.bezierCurveTo((tL + tR) / 2 - 200, tT + 22 + dy, (tL + tR) / 2 + 200, tT - 4 + dy, tR - 20, tT + 12 + dy) }
  ctx.lineCap = 'round'
  blurred(ctx, 3, () => {
    ctx.strokeStyle = rgba(shade(towel, 0.5), 0.95); ctx.lineWidth = 20; edge(ctx, 4); ctx.stroke()
    ctx.strokeStyle = rgba(shade(towel, -0.28), 0.5); ctx.lineWidth = 8; edge(ctx, 20); ctx.stroke()
  })
  ctx.strokeStyle = rgba(shade(towel, -0.12), 0.6); ctx.lineWidth = 3; ctx.setLineDash([12, 9])
  edge(ctx, 64); ctx.stroke(); ctx.setLineDash([])
  if (!basin) return
  // The foot bath's rim at the bottom: glazed ceramic curving away, a lip of light and a sliver of water.
  const cx = W / 2, cy = W + 620, Rr = 900
  blurred(ctx, 20, () => { ctx.fillStyle = 'rgba(100,60,100,0.35)'; ctx.beginPath(); ctx.arc(cx + 10, cy - 30, Rr + 16, 0, Math.PI * 2); ctx.fill() })
  ctx.save()
  ctx.beginPath(); ctx.arc(cx, cy, Rr, 0, Math.PI * 2)
  const rim = ctx.createRadialGradient(cx, cy, Rr - 70, cx, cy, Rr)
  rim.addColorStop(0, '#e7d9c8'); rim.addColorStop(0.5, '#fbf3ea'); rim.addColorStop(0.8, '#fffaf4'); rim.addColorStop(1, '#d9c2ae')
  ctx.fillStyle = rim
  ctx.fill()
  ctx.clip()
  ctx.beginPath(); ctx.arc(cx, cy, Rr - 60, 0, Math.PI * 2)
  const wg = ctx.createLinearGradient(0, cy - Rr, 0, cy - Rr + 200)
  wg.addColorStop(0, '#9fd9df'); wg.addColorStop(1, '#c4ecef')
  ctx.fillStyle = wg
  ctx.fill()
  blurred(ctx, 3, () => { ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(cx, cy, Rr - 74, Math.PI * 1.3, Math.PI * 1.7); ctx.stroke() })
  for (let i = 0; i < 26; i++) { const a = r.range(Math.PI * 1.25, Math.PI * 1.75), d = r.range(Rr - 200, Rr - 70); blob(ctx, cx + Math.cos(a) * d, cy + Math.sin(a) * d, r.range(3, 9), r.range(3, 9), [255, 255, 255], 0.7, 0.5) }
  ctx.restore()
  blurred(ctx, 2, () => { ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(cx, cy, Rr - 8, Math.PI * 1.32, Math.PI * 1.62); ctx.stroke() })
}

function vignette(ctx: Ctx) {
  const g = ctx.createRadialGradient(800, 800, 520, 800, 800, 1150)
  g.addColorStop(0, 'rgba(90,40,70,0)'); g.addColorStop(1, 'rgba(90,40,70,0.25)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, BACKDROP, BACKDROP)
}
