import { makeRng } from '../../core/rng.ts'
import { blob, blurred, rgba, shade, type Ctx, type RGB } from '../paint.ts'
import { worldCanvas } from './room.ts'

/**
 * The salon's furniture, painted in the room's light: the reception desk with the salon computer, the
 * waiting sofa, the facial chair, the nail desk and the starter decor. Each piece is a canvas in world units
 * with an anchor (the point on the floor it stands on), so the floor view can sort it by depth.
 */
export type Piece = { canvas: HTMLCanvasElement; w: number; h: number; ax: number; ay: number }

export function piece(w: number, h: number, ax: number, ay: number, draw: (ctx: Ctx) => void): Piece {
  const [canvas, ctx] = worldCanvas(w, h)
  draw(ctx)
  return { canvas, w, h, ax, ay }
}

export const hexRGB = (c: number): RGB => [(c >> 16) & 255, (c >> 8) & 255, c & 255]

/** A soft contact shadow on the floor. */
export function floorShadow(ctx: Ctx, x: number, y: number, rx: number, ry: number, a = 0.3) {
  blurred(ctx, Math.max(2, ry * 0.5), () => { ctx.fillStyle = `rgba(110,55,80,${a})`; ctx.beginPath(); ctx.ellipse(x + rx * 0.08, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill() })
}

/** A rounded box lit from the top left: a light top face and a darker front face, with a thin darker outline. */
export function box(ctx: Ctx, x: number, y: number, w: number, h: number, depth: number, col: RGB, r = 8, outline = true) {
  // Front face.
  const fg = ctx.createLinearGradient(x, 0, x + w, 0)
  fg.addColorStop(0, rgba(shade(col, -0.02))); fg.addColorStop(1, rgba(shade(col, -0.14)))
  ctx.fillStyle = fg
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill()
  if (outline) { ctx.strokeStyle = rgba(shade(col, -0.35), 0.55); ctx.lineWidth = 1.2; ctx.stroke() }
  // Top face.
  const tg = ctx.createLinearGradient(x, y, x + w, y + depth)
  tg.addColorStop(0, rgba(shade(col, 0.32))); tg.addColorStop(1, rgba(shade(col, 0.12)))
  ctx.fillStyle = tg
  ctx.beginPath(); ctx.roundRect(x, y, w, depth, [r, r, Math.min(r, 4), Math.min(r, 4)]); ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ctx.beginPath(); ctx.roundRect(x + r * 0.6, y + 1.2, w - r * 1.2, 1.6, 1); ctx.fill()
}

/** A plump cushion (sofa seats, chair pads): a rounded shape with a soft highlight and a crease shadow. */
export function cushion(ctx: Ctx, x: number, y: number, w: number, h: number, col: RGB, r = 10) {
  const g = ctx.createLinearGradient(x, y, x + w * 0.3, y + h)
  g.addColorStop(0, rgba(shade(col, 0.28))); g.addColorStop(0.6, rgba(col)); g.addColorStop(1, rgba(shade(col, -0.12)))
  ctx.fillStyle = g
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill()
  ctx.strokeStyle = rgba(shade(col, -0.32), 0.5); ctx.lineWidth = 1.1; ctx.stroke()
  blob(ctx, x + w * 0.3, y + h * 0.3, w * 0.28, h * 0.22, [255, 255, 255], 0.35)
}

// ------------------------------------------------------------------ reception desk and the salon computer

export const DESK_ART = { x: 104, y: 150, w: 224, h: 146 }

export function paintDesk(): Piece {
  // Anchor at the desk's front bottom edge (world y 288).
  return piece(DESK_ART.w, DESK_ART.h, 6, 138, ctx => {
    const X = 6, top = 46 // desk top at world y 196
    floorShadow(ctx, X + 106, 140, 118, 9, 0.35)
    const mint: RGB = [178, 228, 210]
    // Front: fluted mint panel with a gold kick and a curved return on the left.
    const fg = ctx.createLinearGradient(X, 0, X + 210, 0)
    fg.addColorStop(0, rgba(shade(mint, 0.1))); fg.addColorStop(1, rgba(shade(mint, -0.12)))
    ctx.fillStyle = fg
    ctx.beginPath(); ctx.roundRect(X, top + 20, 210, 72, [4, 4, 14, 14]); ctx.fill()
    ctx.strokeStyle = rgba(shade(mint, -0.4), 0.55); ctx.lineWidth = 1.2; ctx.stroke()
    for (let fx = X + 10; fx < X + 205; fx += 12) {
      const flute = ctx.createLinearGradient(fx, 0, fx + 10, 0)
      flute.addColorStop(0, 'rgba(255,255,255,0.35)'); flute.addColorStop(0.5, 'rgba(255,255,255,0)'); flute.addColorStop(1, 'rgba(60,120,100,0.18)')
      ctx.fillStyle = flute
      ctx.beginPath(); ctx.roundRect(fx, top + 30, 10, 52, 5); ctx.fill()
    }
    ctx.fillStyle = '#e9c070'
    ctx.beginPath(); ctx.roundRect(X + 2, top + 84, 206, 5, 2); ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(X + 4, top + 84, 202, 1.2)
    // Marble top with a rounded front edge.
    const mg = ctx.createLinearGradient(X, top, X + 210, top + 26)
    mg.addColorStop(0, '#fffdfb'); mg.addColorStop(1, '#f1e8ea')
    ctx.fillStyle = mg
    ctx.beginPath(); ctx.roundRect(X - 4, top - 4, 218, 28, 8); ctx.fill()
    ctx.strokeStyle = 'rgba(190,150,165,0.6)'; ctx.lineWidth = 1.1; ctx.stroke()
    ctx.strokeStyle = 'rgba(210,180,190,0.5)'; ctx.lineWidth = 0.8
    const r = makeRng(3)
    for (let i = 0; i < 5; i++) { ctx.beginPath(); let vx = X + r.range(0, 200), vy = top - 2; ctx.moveTo(vx, vy); for (let k = 0; k < 4; k++) { vx += r.range(-6, 12); vy += r.range(4, 7); ctx.lineTo(vx, vy) } ctx.stroke() }
    ctx.fillStyle = 'rgba(160,110,130,0.25)'; ctx.fillRect(X - 2, top + 22, 214, 2)
    // The salon computer: a pastel all-in-one with a glowing screen.
    const mx = X + 70, my = top - 44
    blurred(ctx, 3, () => { ctx.fillStyle = 'rgba(120,60,84,0.25)'; ctx.beginPath(); ctx.ellipse(mx + 30, top + 6, 26, 4, 0, 0, Math.PI * 2); ctx.fill() })
    ctx.fillStyle = '#f3d6df'; ctx.beginPath(); ctx.roundRect(mx + 22, my + 36, 16, 14, 3); ctx.fill()
    ctx.fillStyle = '#f7c6d4'; ctx.beginPath(); ctx.roundRect(mx + 14, top + 2, 32, 5, 2.5); ctx.fill()
    ctx.fillStyle = '#fbe0e8'; ctx.beginPath(); ctx.roundRect(mx, my, 60, 42, 7); ctx.fill()
    ctx.strokeStyle = 'rgba(200,120,150,0.6)'; ctx.lineWidth = 1.1; ctx.stroke()
    const sg = ctx.createLinearGradient(mx, my, mx + 60, my + 34)
    sg.addColorStop(0, '#fff1f6'); sg.addColorStop(0.5, '#e3d6fb'); sg.addColorStop(1, '#c9efe2')
    ctx.fillStyle = sg; ctx.beginPath(); ctx.roundRect(mx + 4, my + 4, 52, 30, 4); ctx.fill()
    // A tiny shop window on the screen: three coloured cards and a heart.
    for (let i = 0; i < 3; i++) { ctx.fillStyle = ['#f7b7cc', '#a9e3cf', '#cdbdf2'][i]; ctx.beginPath(); ctx.roundRect(mx + 9 + i * 15, my + 14, 12, 14, 2); ctx.fill() }
    ctx.fillStyle = '#e98aa8'; ctx.fillRect(mx + 8, my + 8, 22, 3)
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.moveTo(mx + 30, my + 4); ctx.lineTo(mx + 42, my + 4); ctx.lineTo(mx + 26, my + 34); ctx.lineTo(mx + 14, my + 34); ctx.fill()
    // Keyboard and mouse.
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.roundRect(mx + 8, top + 9, 42, 8, 2); ctx.fill()
    ctx.strokeStyle = 'rgba(190,150,165,0.7)'; ctx.stroke()
    ctx.fillStyle = 'rgba(200,170,185,0.8)'; for (let k = 0; k < 7; k++) ctx.fillRect(mx + 11 + k * 5.5, top + 11.5, 3.8, 2)
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(mx + 58, top + 13, 3.5, 4.5, 0, 0, Math.PI * 2); ctx.fill()
    // Service bell.
    const bx = X + 164, by = top + 8
    ctx.fillStyle = '#d9a44a'; ctx.beginPath(); ctx.ellipse(bx, by + 2, 11, 3.5, 0, 0, Math.PI * 2); ctx.fill()
    const bg = ctx.createRadialGradient(bx - 3, by - 7, 1, bx, by - 3, 10)
    bg.addColorStop(0, '#fff4d0'); bg.addColorStop(1, '#e2b456')
    ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(bx, by, 8, Math.PI, 0); ctx.fill()
    ctx.fillStyle = '#e2b456'; ctx.fillRect(bx - 1, by - 11, 2, 3)
    // A card reader and a little business-card stand.
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.roundRect(X + 26, top + 2, 20, 10, 2); ctx.fill()
    ctx.strokeStyle = 'rgba(190,150,165,0.7)'; ctx.stroke()
    ctx.fillStyle = '#f7b7cc'; ctx.fillRect(X + 29, top + 4, 14, 3)
  })
}

// ------------------------------------------------------------------ the waiting sofa

export function paintSofa(): Piece {
  // SOFA x 380-630, y 196-288; anchor the seat line so seated customers sort in front of it.
  return piece(270, 120, 10, 70, ctx => {
    const X = 10, W = 250
    const rose: RGB = [242, 170, 190]
    floorShadow(ctx, X + W / 2, 108, 130, 10, 0.35)
    // Legs.
    ctx.fillStyle = '#d9a44a'
    for (const lx of [X + 14, X + W - 20]) { ctx.beginPath(); ctx.roundRect(lx, 96, 6, 12, 2); ctx.fill() }
    // Back rest with channel tufting.
    const bg = ctx.createLinearGradient(0, 8, 0, 60)
    bg.addColorStop(0, rgba(shade(rose, 0.2))); bg.addColorStop(1, rgba(shade(rose, -0.08)))
    ctx.fillStyle = bg
    ctx.beginPath(); ctx.roundRect(X + 8, 6, W - 16, 58, [26, 26, 8, 8]); ctx.fill()
    ctx.strokeStyle = rgba(shade(rose, -0.35), 0.55); ctx.lineWidth = 1.2; ctx.stroke()
    for (let i = 1; i < 5; i++) {
      const cx = X + 8 + ((W - 16) / 5) * i
      const cg = ctx.createLinearGradient(cx - 5, 0, cx + 5, 0)
      cg.addColorStop(0, 'rgba(160,70,100,0)'); cg.addColorStop(0.5, 'rgba(160,70,100,0.22)'); cg.addColorStop(1, 'rgba(255,255,255,0.2)')
      ctx.fillStyle = cg; ctx.fillRect(cx - 5, 12, 10, 48)
    }
    blob(ctx, X + 70, 20, 60, 10, [255, 255, 255], 0.35)
    // Seat cushions.
    const seatY = 56
    for (let i = 0; i < 2; i++) cushion(ctx, X + 26 + i * ((W - 52) / 2), seatY, (W - 52) / 2 - 2, 26, shade(rose, 0.08), 9)
    // Front rail under the seats.
    box(ctx, X + 22, seatY + 24, W - 44, 18, 4, shade(rose, -0.06), 6)
    // Arms: rolled, with a highlight.
    for (const ax of [X, X + W - 34]) {
      const ag = ctx.createLinearGradient(ax, 0, ax + 34, 0)
      ag.addColorStop(0, rgba(shade(rose, 0.24))); ag.addColorStop(1, rgba(shade(rose, -0.1)))
      ctx.fillStyle = ag
      ctx.beginPath(); ctx.roundRect(ax, 34, 34, 64, 16); ctx.fill()
      ctx.strokeStyle = rgba(shade(rose, -0.35), 0.55); ctx.stroke()
      blob(ctx, ax + 12, 44, 9, 6, [255, 255, 255], 0.5)
    }
    // Throw pillows: mint and butter.
    pillow(ctx, X + 40, 32, [169, 227, 207], -0.2)
    pillow(ctx, X + W - 70, 32, [251, 224, 160], 0.2)
  })
}

function pillow(ctx: Ctx, x: number, y: number, col: RGB, tilt: number) {
  ctx.save(); ctx.translate(x + 15, y + 13); ctx.rotate(tilt)
  cushion(ctx, -15, -13, 30, 26, col, 9)
  ctx.fillStyle = rgba(shade(col, -0.2), 0.8); ctx.beginPath(); ctx.arc(0, 0, 2, 0, Math.PI * 2); ctx.fill()
  ctx.restore()
}

// ------------------------------------------------------------------ stations

/** The facial chair, in two parts: the back (behind the customer) and the arms and footrest (in front). */
export function paintFacialChair(): { back: Piece; front: Piece } {
  const blush: RGB = [247, 190, 206]
  const back = piece(190, 160, 95, 112, ctx => {
    const cx = 95 + 10 // the chair centres on the customer's seat, 10 right of the slot
    floorShadow(ctx, cx, 150, 62, 9, 0.35)
    // Magnifier ring lamp on an arm, behind the chair.
    ctx.strokeStyle = '#e6d7de'; ctx.lineWidth = 4; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(cx - 64, 146); ctx.lineTo(cx - 64, 40); ctx.quadraticCurveTo(cx - 60, 16, cx - 34, 18); ctx.stroke()
    ctx.fillStyle = '#e6d7de'; ctx.beginPath(); ctx.ellipse(cx - 64, 147, 12, 4, 0, 0, Math.PI * 2); ctx.fill()
    ctx.lineWidth = 5; ctx.strokeStyle = '#fbfafc'
    ctx.beginPath(); ctx.ellipse(cx - 24, 22, 15, 10, -0.2, 0, Math.PI * 2); ctx.stroke()
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(160,120,140,0.6)'; ctx.stroke()
    ctx.fillStyle = 'rgba(210,235,255,0.55)'; ctx.beginPath(); ctx.ellipse(cx - 24, 22, 12, 7.5, -0.2, 0, Math.PI * 2); ctx.fill()
    // The backrest, reclined a touch, with a rolled towel headrest.
    const bg = ctx.createLinearGradient(cx - 40, 30, cx + 40, 110)
    bg.addColorStop(0, rgba(shade(blush, 0.26))); bg.addColorStop(1, rgba(shade(blush, -0.1)))
    ctx.fillStyle = bg
    ctx.beginPath(); ctx.roundRect(cx - 38, 34, 76, 80, [30, 30, 10, 10]); ctx.fill()
    ctx.strokeStyle = rgba(shade(blush, -0.38), 0.55); ctx.lineWidth = 1.2; ctx.stroke()
    for (const ty of [58, 80]) for (const tx of [-16, 0, 16]) { ctx.fillStyle = rgba(shade(blush, -0.25)); ctx.beginPath(); ctx.arc(cx + tx, ty, 1.8, 0, Math.PI * 2); ctx.fill() }
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.roundRect(cx - 24, 36, 48, 14, 7); ctx.fill()
    ctx.strokeStyle = 'rgba(200,170,185,0.8)'; ctx.stroke()
    // Seat.
    cushion(ctx, cx - 40, 106, 80, 24, shade(blush, 0.1), 9)
    // Base: a gold pedestal.
    ctx.fillStyle = '#e2b456'; ctx.beginPath(); ctx.roundRect(cx - 6, 128, 12, 16, 3); ctx.fill()
    ctx.fillStyle = '#eec474'; ctx.beginPath(); ctx.ellipse(cx, 146, 26, 6, 0, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(cx - 4, 129, 2, 13)
    // A side trolley with products on the right.
    const tx = cx + 50
    ctx.fillStyle = '#f2e6ea'; ctx.fillRect(tx + 4, 90, 3, 52); ctx.fillRect(tx + 29, 90, 3, 52)
    box(ctx, tx, 84, 36, 10, 5, [255, 247, 250], 3)
    box(ctx, tx, 124, 36, 8, 4, [255, 247, 250], 3)
    const cols: RGB[] = [[169, 227, 207], [205, 189, 242], [247, 183, 204]]
    cols.forEach((c, i) => { ctx.fillStyle = rgba(c); ctx.beginPath(); ctx.roundRect(tx + 4 + i * 10, 70 - (i % 2) * 4, 8, 15 + (i % 2) * 4, 2); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(tx + 5.5 + i * 10, 73 - (i % 2) * 4, 1.5, 9) })
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(tx + 18, 120, 10, 4, 0, 0, Math.PI * 2); ctx.fill()
    for (const wx of [tx + 5, tx + 31]) { ctx.fillStyle = '#c9b6c0'; ctx.beginPath(); ctx.arc(wx, 144, 2.5, 0, Math.PI * 2); ctx.fill() }
  })
  const front = piece(190, 160, 95, 112, ctx => {
    const cx = 105
    // Arm rests in front of the customer's sides.
    for (const ax of [cx - 46, cx + 30]) {
      const ag = ctx.createLinearGradient(ax, 0, ax + 16, 0)
      ag.addColorStop(0, rgba(shade(blush, 0.24))); ag.addColorStop(1, rgba(shade(blush, -0.12)))
      ctx.fillStyle = ag
      ctx.beginPath(); ctx.roundRect(ax, 92, 16, 36, 8); ctx.fill()
      ctx.strokeStyle = rgba(shade(blush, -0.38), 0.55); ctx.lineWidth = 1.2; ctx.stroke()
    }
    // Footrest.
    cushion(ctx, cx - 26, 128, 52, 12, shade(blush, 0.05), 6)
  })
  return { back, front }
}

/** The nail desk: a small marble-topped desk with a hand cushion, a polish rack and a UV lamp; a stool for the customer. */
export function paintNailDesk(): { back: Piece; front: Piece } {
  const lilac: RGB = [214, 200, 245]
  const back = piece(190, 150, 95, 110, ctx => {
    // Customer stool, to the right, behind the customer.
    const sx = 95 + 14
    floorShadow(ctx, sx, 134, 26, 6, 0.3)
    ctx.fillStyle = '#e2b456'; ctx.fillRect(sx - 2, 112, 4, 22)
    const sg = ctx.createLinearGradient(sx - 22, 70, sx + 22, 110)
    sg.addColorStop(0, rgba(shade(lilac, 0.25))); sg.addColorStop(1, rgba(shade(lilac, -0.1)))
    ctx.fillStyle = sg
    ctx.beginPath(); ctx.roundRect(sx - 22, 64, 44, 46, [18, 18, 8, 8]); ctx.fill()
    ctx.strokeStyle = rgba(shade(lilac, -0.4), 0.55); ctx.lineWidth = 1.2; ctx.stroke()
    cushion(ctx, sx - 24, 100, 48, 16, shade(lilac, 0.1), 7)
  })
  const front = piece(190, 150, 95, 110, ctx => {
    // The desk sits between the player (left) and the customer (right).
    const dx = 95 - 82, top = 84
    floorShadow(ctx, dx + 38, 142, 46, 7, 0.32)
    ctx.fillStyle = '#e8d9ec'
    for (const lx of [dx + 6, dx + 64]) { ctx.beginPath(); ctx.roundRect(lx, top + 20, 5, 36, 2); ctx.fill() }
    box(ctx, dx, top, 76, 24, 16, [255, 250, 252], 6)
    ctx.fillStyle = rgba(lilac); ctx.beginPath(); ctx.roundRect(dx + 2, top + 18, 72, 5, 2); ctx.fill()
    // Hand cushion on a little towel.
    ctx.fillStyle = '#fdf1f4'; ctx.beginPath(); ctx.roundRect(dx + 38, top + 1, 30, 12, 3); ctx.fill()
    cushion(ctx, dx + 44, top - 3, 20, 11, [247, 190, 206], 5)
    // UV lamp: a little white dome.
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.roundRect(dx + 6, top - 12, 26, 18, [10, 10, 3, 3]); ctx.fill()
    ctx.strokeStyle = 'rgba(180,150,200,0.7)'; ctx.lineWidth = 1; ctx.stroke()
    ctx.fillStyle = 'rgba(190,160,255,0.7)'; ctx.fillRect(dx + 9, top + 2, 20, 3)
    // Polish rack: a row of tiny bottles.
    const cols = [0xf4a6b8, 0xd83a56, 0xb79ce6, 0x94dcc0, 0xf6dd8a, 0x8ec5f2]
    cols.forEach((c, i) => {
      const bx = dx + 8 + i * 10, by = top + 22
      void by
      ctx.fillStyle = rgba(hexRGB(c)); ctx.beginPath(); ctx.roundRect(dx + 6 + i * 11, top - 22, 8, 10, 2); ctx.fill()
      ctx.fillStyle = '#4a3a52'; ctx.fillRect(dx + 8 + i * 11, top - 27, 4, 5)
      ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(dx + 7 + i * 11, top - 20, 1.5, 6)
      void bx
    })
  })
  return { back, front }
}

// ------------------------------------------------------------------ starter decor

export function paintPlant(scale = 1): Piece {
  return piece(90 * scale, 120 * scale, 45 * scale, 112 * scale, ctx => {
    ctx.scale(scale, scale)
    floorShadow(ctx, 45, 112, 26, 6, 0.35)
    // Pot: blush terracotta with a rim.
    const pg = ctx.createLinearGradient(28, 0, 62, 0)
    pg.addColorStop(0, '#fbd2dc'); pg.addColorStop(1, '#e8a3b5')
    ctx.fillStyle = pg
    ctx.beginPath(); ctx.moveTo(28, 80); ctx.lineTo(62, 80); ctx.lineTo(58, 112); ctx.lineTo(32, 112); ctx.closePath(); ctx.fill()
    ctx.fillStyle = '#fbe0e7'; ctx.beginPath(); ctx.roundRect(25, 76, 40, 8, 3); ctx.fill()
    // Monstera leaves: split leaves on curved stems, lit from the top left.
    const leaves: [number, number, number, number][] = [[22, 36, -0.8, 1], [66, 30, 0.7, 1.05], [44, 18, -0.1, 1.1], [30, 58, -1.3, 0.85], [62, 56, 1.2, 0.9]]
    for (const [lx, ly, rot, s] of leaves) {
      ctx.strokeStyle = '#6fa77e'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(45, 80); ctx.quadraticCurveTo(45 + (lx - 45) * 0.3, ly + 20, lx, ly); ctx.stroke()
      monstera(ctx, lx, ly, rot, s)
    }
  })
}

function monstera(ctx: Ctx, x: number, y: number, rot: number, s: number) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s, s)
  const g = ctx.createLinearGradient(-14, -18, 14, 14)
  g.addColorStop(0, '#9fd8a8'); g.addColorStop(1, '#5c9f73')
  ctx.fillStyle = g
  ctx.beginPath(); ctx.ellipse(0, -2, 15, 18, 0, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = 'rgba(50,110,70,0.5)'; ctx.lineWidth = 1; ctx.stroke()
  // The splits.
  ctx.globalCompositeOperation = 'destination-out'
  for (const [a, l] of [[0.5, 9], [1.1, 10], [2.2, 10], [2.7, 9]] as const) { ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 16, Math.sin(a) * 18 - 2); ctx.lineTo(Math.cos(a) * (16 - l), Math.sin(a) * (18 - l) - 2); ctx.stroke() }
  ctx.globalCompositeOperation = 'source-over'
  ctx.strokeStyle = 'rgba(230,255,235,0.6)'; ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(0, 14); ctx.lineTo(0, -16); ctx.stroke()
  ctx.restore()
}

export function paintCandles(): Piece {
  return piece(60, 50, 30, 44, ctx => {
    const specs: [number, number, number][] = [[16, 22, 30], [30, 26, 38], [44, 18, 30]]
    for (const [x, h, y0] of specs) {
      void y0
      const cg = ctx.createLinearGradient(x - 6, 0, x + 6, 0)
      cg.addColorStop(0, '#fffaf4'); cg.addColorStop(1, '#f1dccf')
      ctx.fillStyle = cg; ctx.beginPath(); ctx.roundRect(x - 6, 44 - h, 12, h, 3); ctx.fill()
      ctx.strokeStyle = 'rgba(200,160,160,0.6)'; ctx.lineWidth = 0.8; ctx.stroke()
      ctx.fillStyle = '#f7b7cc'; ctx.fillRect(x - 6, 44 - h * 0.5, 12, 3)
      ctx.strokeStyle = '#5a3a52'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, 44 - h); ctx.lineTo(x, 44 - h - 3); ctx.stroke()
    }
  })
}

export function paintCloudRug(): Piece {
  return piece(240, 130, 120, 65, ctx => {
    const puffs: [number, number, number][] = [[60, 70, 40], [100, 52, 44], [148, 56, 42], [186, 74, 36], [124, 84, 48], [78, 88, 34], [170, 92, 32]]
    blurred(ctx, 4, () => { ctx.fillStyle = 'rgba(120,60,84,0.22)'; for (const [x, y, r] of puffs) { ctx.beginPath(); ctx.ellipse(x + 3, y + 5, r, r * 0.55, 0, 0, Math.PI * 2); ctx.fill() } })
    ctx.fillStyle = '#fbf7fb'
    for (const [x, y, r] of puffs) { ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.55, 0, 0, Math.PI * 2); ctx.fill() }
    for (const [x, y, r] of puffs) blob(ctx, x - r * 0.2, y - r * 0.15, r * 0.7, r * 0.3, [255, 255, 255], 0.9)
    ctx.strokeStyle = 'rgba(210,180,210,0.6)'; ctx.lineWidth = 1.2
    for (const [x, y, r] of puffs) { ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.55, 0, 0.2, Math.PI - 0.2); ctx.stroke() }
  })
}

export function paintFairyLights(): Piece {
  return piece(1260, 40, 630, 0, ctx => {
    ctx.strokeStyle = 'rgba(120,90,80,0.55)'; ctx.lineWidth = 1
    ctx.beginPath()
    for (let x = 10; x <= 1250; x += 2) { const y = 16 + Math.abs(Math.sin((x / 1240) * Math.PI * 6)) * 14; if (x === 10) ctx.moveTo(x, y); else ctx.lineTo(x, y) }
    ctx.stroke()
    for (let x = 30; x < 1250; x += 34) {
      const y = 16 + Math.abs(Math.sin((x / 1240) * Math.PI * 6)) * 14 + 4
      ctx.fillStyle = '#fff3cf'; ctx.beginPath(); ctx.ellipse(x, y, 2.6, 3.6, 0, 0, Math.PI * 2); ctx.fill()
    }
  })
}

/** Bulb positions of the fairy lights (world), for their twinkling glows. */
export function fairyBulbs(): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = []
  for (let x = 30; x < 1250; x += 34) out.push({ x: x + 10, y: 16 + Math.abs(Math.sin((x / 1240) * Math.PI * 6)) * 14 + 4 })
  return out
}

export function paintWallArt(): Piece {
  return piece(120, 90, 60, 45, ctx => {
    const frames: [number, number, number, number, string[]][] = [[6, 14, 44, 58, ['#fbd3de', '#f59ab7']], [58, 6, 56, 40, ['#d9ccf5', '#a9e3cf']], [58, 52, 30, 30, ['#fbe7b0', '#f7b7cc']]]
    for (const [x, y, w, h, [a, b]] of frames) {
      blurred(ctx, 2.5, () => { ctx.fillStyle = 'rgba(120,60,84,0.3)'; ctx.fillRect(x + 2, y + 3, w, h) })
      ctx.fillStyle = '#e8c16e'; ctx.fillRect(x, y, w, h)
      ctx.fillStyle = '#fffaf2'; ctx.fillRect(x + 3, y + 3, w - 6, h - 6)
      const g = ctx.createLinearGradient(x, y, x + w, y + h)
      g.addColorStop(0, a); g.addColorStop(1, b)
      ctx.fillStyle = g
      ctx.beginPath(); ctx.arc(x + w / 2, y + h / 2 + 2, Math.min(w, h) / 2 - 8, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); ctx.ellipse(x + w / 2 - 4, y + h / 2 - 3, 4, 2.5, -0.5, 0, Math.PI * 2); ctx.fill()
    }
  })
}

export function paintNeonGlow(): { tube: Piece; glow: Piece } {
  const draw = (ctx: Ctx, width: number, color: string) => {
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    ctx.font = '600 44px Fredoka, Nunito, sans-serif'
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.strokeText('glow', 80, 34)
  }
  const tube = piece(160, 70, 80, 35, ctx => {
    blurred(ctx, 2, () => { ctx.globalAlpha = 0.35; draw(ctx, 4, 'rgba(160,40,90,1)'); ctx.globalAlpha = 1 })
    draw(ctx, 5, '#ff7fb0')
    draw(ctx, 1.8, '#fff2f7')
  })
  const glow = piece(160, 70, 80, 35, ctx => { blurred(ctx, 7, () => draw(ctx, 14, 'rgba(255,70,150,0.7)')) })
  return { tube, glow }
}

export function paintAquarium(): Piece {
  return piece(80, 150, 40, 140, ctx => {
    floorShadow(ctx, 40, 140, 36, 7, 0.35)
    box(ctx, 6, 84, 68, 56, 10, [255, 247, 250], 6)
    // Glass tank.
    const g = ctx.createLinearGradient(0, 20, 0, 88)
    g.addColorStop(0, 'rgba(190,235,250,0.9)'); g.addColorStop(1, 'rgba(120,200,230,0.95)')
    ctx.fillStyle = g
    ctx.beginPath(); ctx.roundRect(8, 22, 64, 64, 6); ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 2; ctx.stroke()
    ctx.fillStyle = '#f5e0c6'; ctx.fillRect(10, 76, 60, 9)
    for (const [x, h] of [[18, 30], [26, 22], [60, 36], [52, 20]]) { ctx.strokeStyle = '#5fb07a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, 80); ctx.quadraticCurveTo(x + 6, 80 - h / 2, x - 2, 80 - h); ctx.stroke() }
    ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillRect(12, 26, 4, 54)
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.roundRect(6, 16, 68, 8, 3); ctx.fill()
  })
}

export function paintChandelier(): { body: Piece; glow: Piece } {
  const body = piece(110, 110, 55, 0, ctx => {
    ctx.strokeStyle = '#d9a44a'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(55, 0); ctx.lineTo(55, 36); ctx.stroke()
    ctx.strokeStyle = '#e2b456'; ctx.lineWidth = 3
    ctx.beginPath(); ctx.ellipse(55, 56, 40, 12, 0, 0, Math.PI); ctx.stroke()
    ctx.beginPath(); ctx.ellipse(55, 44, 24, 8, 0, 0, Math.PI); ctx.stroke()
    for (let i = 0; i < 9; i++) {
      const a = (i / 8) * Math.PI, x = 55 + Math.cos(a) * 40, y = 56 + Math.sin(a) * 12
      ctx.fillStyle = 'rgba(235,245,255,0.95)'; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 3, y + 8); ctx.lineTo(x, y + 16); ctx.lineTo(x + 3, y + 8); ctx.closePath(); ctx.fill()
      ctx.strokeStyle = 'rgba(160,170,210,0.8)'; ctx.lineWidth = 0.6; ctx.stroke()
    }
    for (const x of [25, 55, 85]) { ctx.fillStyle = '#fff7e4'; ctx.beginPath(); ctx.roundRect(x - 3, 26 + (x === 55 ? -4 : 6), 6, 12, 2); ctx.fill(); ctx.fillStyle = '#ffd98a'; ctx.beginPath(); ctx.ellipse(x, 22 + (x === 55 ? -4 : 6), 2.4, 4, 0, 0, Math.PI * 2); ctx.fill() }
  })
  const glow = piece(220, 200, 110, 0, ctx => { const g = ctx.createRadialGradient(110, 40, 4, 110, 50, 90); g.addColorStop(0, 'rgba(255,214,150,0.22)'); g.addColorStop(1, 'rgba(255,214,150,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, 220, 200) })
  return { body, glow }
}

/** A floor glow ring under a station, for "a customer is waiting here". */
export function paintStationGlow(): Piece {
  return piece(200, 90, 100, 45, ctx => {
    const g = ctx.createRadialGradient(100, 45, 20, 100, 45, 96)
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.7, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.beginPath(); ctx.ellipse(100, 45, 96, 40, 0, 0, Math.PI * 2); ctx.fill()
  })
}

// ------------------------------------------------------------------ the base room's own cosy touches

/** A big scalloped oval rug in the middle of the salon. */
export function paintBaseRug(): Piece {
  return piece(360, 180, 180, 90, ctx => {
    blurred(ctx, 5, () => { ctx.fillStyle = 'rgba(120,60,84,0.2)'; ctx.beginPath(); ctx.ellipse(184, 96, 168, 76, 0, 0, Math.PI * 2); ctx.fill() })
    // Scalloped edge.
    ctx.fillStyle = '#f9e3e9'
    ctx.beginPath()
    for (let i = 0; i <= 48; i++) {
      const a = (i / 48) * Math.PI * 2
      const r = 1 + 0.035 * Math.cos(i * Math.PI)
      const x = 180 + Math.cos(a) * 170 * r, y = 90 + Math.sin(a) * 78 * r
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
    }
    ctx.closePath(); ctx.fill()
    ctx.strokeStyle = 'rgba(214,150,172,0.55)'; ctx.lineWidth = 1.4; ctx.stroke()
    const g = ctx.createRadialGradient(150, 70, 10, 180, 90, 170)
    g.addColorStop(0, '#fff8f6'); g.addColorStop(1, '#f6d5de')
    ctx.fillStyle = g
    ctx.beginPath(); ctx.ellipse(180, 90, 150, 66, 0, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = 'rgba(169,227,207,0.95)'; ctx.lineWidth = 5
    ctx.beginPath(); ctx.ellipse(180, 90, 132, 56, 0, 0, Math.PI * 2); ctx.stroke()
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.5; ctx.setLineDash([2, 6])
    ctx.beginPath(); ctx.ellipse(180, 90, 120, 50, 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([])
    // A little flower motif in the middle.
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; blob(ctx, 180 + Math.cos(a) * 14, 90 + Math.sin(a) * 7, 10, 6, [247, 183, 204], 0.9, 0.55) }
    blob(ctx, 180, 90, 7, 4, [251, 224, 160], 1, 0.6)
  })
}

/** An arc floor lamp with a warm shade, next to the sofa. */
export function paintFloorLamp(): Piece {
  return piece(90, 170, 20, 164, ctx => {
    floorShadow(ctx, 22, 164, 16, 4)
    ctx.fillStyle = '#e2b456'; ctx.beginPath(); ctx.ellipse(20, 162, 14, 4.5, 0, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = '#e2b456'; ctx.lineWidth = 3; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(20, 160); ctx.lineTo(20, 60); ctx.quadraticCurveTo(22, 14, 62, 22); ctx.stroke()
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(19, 150); ctx.lineTo(19, 64); ctx.stroke()
    // The shade: a blush dome, glowing underneath.
    const sg = ctx.createLinearGradient(46, 20, 82, 44)
    sg.addColorStop(0, '#fff1c4'); sg.addColorStop(1, '#f2c45e')
    ctx.fillStyle = sg
    ctx.beginPath(); ctx.moveTo(44, 44); ctx.quadraticCurveTo(46, 18, 64, 18); ctx.quadraticCurveTo(82, 18, 84, 44); ctx.closePath(); ctx.fill()
    ctx.strokeStyle = 'rgba(200,110,140,0.6)'; ctx.lineWidth = 1.1; ctx.stroke()
    ctx.fillStyle = '#fff4d6'; ctx.beginPath(); ctx.ellipse(64, 44, 20, 4, 0, 0, Math.PI * 2); ctx.fill()
  })
}

/** A warm pool of lamp light (drawn additively). */
export function paintLampGlow(): Piece {
  return piece(220, 220, 110, 110, ctx => {
    const g = ctx.createRadialGradient(110, 110, 4, 110, 110, 108)
    g.addColorStop(0, 'rgba(255,214,150,0.5)'); g.addColorStop(0.4, 'rgba(255,200,140,0.16)'); g.addColorStop(1, 'rgba(255,200,140,0)')
    ctx.fillStyle = g; ctx.fillRect(0, 0, 220, 220)
  })
}

/** A small chalkboard welcome sign by the door. */
export function paintWelcomeSign(): Piece {
  return piece(56, 76, 28, 72, ctx => {
    floorShadow(ctx, 28, 72, 20, 4)
    ctx.strokeStyle = '#c9a27a'; ctx.lineWidth = 3; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(12, 72); ctx.lineTo(18, 8); ctx.moveTo(44, 72); ctx.lineTo(38, 8); ctx.stroke()
    ctx.fillStyle = '#c9a27a'; ctx.beginPath(); ctx.roundRect(8, 6, 40, 50, 5); ctx.fill()
    ctx.fillStyle = '#4f5d58'; ctx.beginPath(); ctx.roundRect(11, 9, 34, 44, 3); ctx.fill()
    ctx.fillStyle = '#ffffff'; ctx.font = '600 9px Fredoka, sans-serif'; ctx.textAlign = 'center'
    ctx.fillText('welcome', 28, 22)
    ctx.fillStyle = '#f7b7cc'; ctx.fillText('come in', 28, 34)
    heartTiny(ctx, 28, 44)
  })
}

/** A round side table with a stack of magazines, by the sofa. */
export function paintMagazineTable(): Piece {
  return piece(56, 60, 28, 56, ctx => {
    floorShadow(ctx, 28, 55, 18, 4)
    ctx.fillStyle = '#e2b456'; ctx.fillRect(26.5, 26, 3, 28)
    ctx.fillStyle = '#e2b456'; ctx.beginPath(); ctx.ellipse(28, 55, 10, 3, 0, 0, Math.PI * 2); ctx.fill()
    const tg = ctx.createLinearGradient(8, 18, 48, 34)
    tg.addColorStop(0, '#ffffff'); tg.addColorStop(1, '#f1e6ea')
    ctx.fillStyle = tg; ctx.beginPath(); ctx.ellipse(28, 26, 22, 8, 0, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = 'rgba(190,150,165,0.8)'; ctx.lineWidth = 1; ctx.stroke()
    const mags: [number, number, number, string][] = [[20, 22, -0.25, '#a9e3cf'], [24, 20, 0.12, '#f7b7cc'], [30, 18, -0.05, '#cdbdf2']]
    for (const [x, y, r, c] of mags) { ctx.save(); ctx.translate(x, y); ctx.rotate(r); ctx.fillStyle = c; ctx.fillRect(-9, -5, 18, 10); ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillRect(-7, -3, 8, 2); ctx.fillRect(-7, 0, 12, 1.2); ctx.restore() }
  })
}

/** The tea corner: a little cart with a kettle, cups and a "free tea" card. */
export function paintTeaCorner(): Piece {
  return piece(70, 96, 35, 90, ctx => {
    floorShadow(ctx, 35, 89, 30, 5)
    ctx.fillStyle = '#e8d9ec'; for (const x of [10, 56]) ctx.fillRect(x, 44, 4, 42)
    box(ctx, 4, 38, 62, 10, 6, [255, 250, 247], 4)
    box(ctx, 4, 70, 62, 8, 4, [255, 250, 247], 4)
    for (const x of [12, 58]) { ctx.fillStyle = '#c9b6c0'; ctx.beginPath(); ctx.arc(x, 88, 3, 0, Math.PI * 2); ctx.fill() }
    // Kettle.
    const kg = ctx.createLinearGradient(12, 14, 34, 38); kg.addColorStop(0, '#c5f0e0'); kg.addColorStop(1, '#6fc9a9')
    ctx.fillStyle = kg; ctx.beginPath(); ctx.ellipse(23, 30, 11, 9, 0, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = 'rgba(40,120,90,0.6)'; ctx.lineWidth = 1; ctx.stroke()
    ctx.strokeStyle = '#6fc9a9'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(23, 22, 7, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(33, 30); ctx.lineTo(38, 25); ctx.stroke()
    blob(ctx, 19, 27, 3, 2, [255, 255, 255], 0.8)
    // Cups.
    for (const [x, c] of [[44, '#f7b7cc'], [54, '#fbe18f']] as [number, string][]) { ctx.fillStyle = c; ctx.beginPath(); ctx.roundRect(x - 4, 30, 8, 8, [1, 1, 3, 3]); ctx.fill(); ctx.strokeStyle = 'rgba(160,110,130,0.6)'; ctx.lineWidth = 0.8; ctx.stroke() }
    // Card.
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.roundRect(36, 60, 26, 12, 2); ctx.fill()
    ctx.fillStyle = '#d9577f'; ctx.font = '700 6.5px Nunito, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('free tea', 49, 68)
    // Steam.
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.4
    for (const x of [36, 40]) { ctx.beginPath(); ctx.moveTo(x, 20); ctx.quadraticCurveTo(x + 4, 14, x, 8); ctx.stroke() }
  })
}

/** A folding screen over an empty station slot: more room is coming. */
export function paintSoonScreen(): Piece {
  return piece(170, 120, 85, 110, ctx => {
    // A dashed outline on the floor where the station will go.
    ctx.strokeStyle = 'rgba(214,150,172,0.45)'; ctx.lineWidth = 2; ctx.setLineDash([6, 6])
    ctx.beginPath(); ctx.roundRect(10, 64, 150, 52, 18); ctx.stroke(); ctx.setLineDash([])
    floorShadow(ctx, 85, 100, 60, 6, 0.25)
    const cols: RGB[] = [[252, 226, 234], [246, 214, 226], [252, 226, 234]]
    cols.forEach((c, i) => {
      const x = 32 + i * 36, skew = i === 1 ? 0 : i === 0 ? -6 : 6
      const g = ctx.createLinearGradient(x, 0, x + 36, 0)
      g.addColorStop(0, rgba(shade(c, 0.2))); g.addColorStop(1, rgba(shade(c, -0.08)))
      ctx.fillStyle = g
      ctx.beginPath(); ctx.moveTo(x, 18 + skew); ctx.quadraticCurveTo(x + 18, 8, x + 36, 18 - skew); ctx.lineTo(x + 36, 100 - skew); ctx.lineTo(x, 100 + skew); ctx.closePath(); ctx.fill()
      ctx.strokeStyle = 'rgba(214,150,172,0.8)'; ctx.lineWidth = 1.2; ctx.stroke()
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.moveTo(x + 6, 26); ctx.lineTo(x + 6, 92); ctx.stroke()
    })
    // A little heart and a sign.
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.roundRect(42, 44, 86, 26, 13); ctx.fill()
    ctx.strokeStyle = 'rgba(214,150,172,0.9)'; ctx.lineWidth = 1.2; ctx.stroke()
    ctx.fillStyle = '#d9577f'; ctx.font = '600 10.5px Fredoka, Nunito, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('coming soon', 85, 57.5)
  })
}

/** Little fillers for empty decor slots: a small framed print and a potted succulent. */
export function paintFillerFrame(seed: number): Piece {
  const cols = [['#fbd3de', '#f59ab7'], ['#d9ccf5', '#a9e3cf'], ['#fbe7b0', '#f7b7cc'], ['#bfeadb', '#cdbdf2']][seed % 4]
  return piece(44, 54, 22, 27, ctx => {
    blurred(ctx, 2, () => { ctx.fillStyle = 'rgba(120,60,84,0.28)'; ctx.fillRect(6, 7, 34, 44) })
    ctx.fillStyle = '#fffaf2'; ctx.beginPath(); ctx.roundRect(4, 4, 34, 44, 3); ctx.fill()
    ctx.strokeStyle = '#e8c16e'; ctx.lineWidth = 2; ctx.stroke()
    const g = ctx.createLinearGradient(8, 8, 34, 44); g.addColorStop(0, cols[0]); g.addColorStop(1, cols[1])
    ctx.fillStyle = g
    if (seed % 2) { ctx.beginPath(); ctx.arc(21, 26, 10, 0, Math.PI * 2); ctx.fill() }
    else { ctx.beginPath(); ctx.moveTo(9, 42); ctx.quadraticCurveTo(21, 8, 33, 42); ctx.fill() }
  })
}

export function paintSucculent(): Piece {
  return piece(40, 50, 20, 46, ctx => {
    floorShadow(ctx, 20, 45, 13, 3.5)
    ctx.fillStyle = '#fff4ec'; ctx.beginPath(); ctx.roundRect(9, 28, 22, 18, [3, 3, 8, 8]); ctx.fill()
    ctx.strokeStyle = 'rgba(200,160,160,0.7)'; ctx.lineWidth = 1; ctx.stroke()
    ctx.fillStyle = '#f7b7cc'; ctx.fillRect(9, 32, 22, 3)
    for (let i = 0; i < 7; i++) { const a = -Math.PI / 2 + (i - 3) * 0.42; blob(ctx, 20 + Math.cos(a) * 8, 24 + Math.sin(a) * 9, 5, 7, [140, 200, 160], 1, 0.6) }
    blob(ctx, 20, 20, 4, 6, [170, 220, 180], 1, 0.6)
  })
}

/** The brass shop bell over the door; it swings when a customer comes in. */
export function paintDoorBell(): Piece {
  return piece(24, 30, 12, 2, ctx => {
    ctx.strokeStyle = '#b98a3a'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(12, 8); ctx.stroke()
    const g = ctx.createRadialGradient(9, 12, 1, 12, 16, 10); g.addColorStop(0, '#fff2c4'); g.addColorStop(1, '#d9a44a')
    ctx.fillStyle = g
    ctx.beginPath(); ctx.moveTo(12, 7); ctx.quadraticCurveTo(4, 9, 4, 22); ctx.lineTo(20, 22); ctx.quadraticCurveTo(20, 9, 12, 7); ctx.fill()
    ctx.strokeStyle = 'rgba(150,100,40,0.7)'; ctx.lineWidth = 0.8; ctx.stroke()
    ctx.fillStyle = '#c38f3c'; ctx.beginPath(); ctx.arc(12, 24, 2.4, 0, Math.PI * 2); ctx.fill()
  })
}

function heartTiny(ctx: Ctx, x: number, y: number) {
  ctx.fillStyle = '#f7b7cc'
  ctx.beginPath(); ctx.moveTo(x, y + 4); ctx.bezierCurveTo(x - 6, y, x - 3, y - 5, x, y - 2); ctx.bezierCurveTo(x + 3, y - 5, x + 6, y, x, y + 4); ctx.fill()
}
