import { DECOR_ITEM_BY_ID, DECOR_SET_BY_ID, type DecorKind } from '../../core/decor.ts'
import { makeRng } from '../../core/rng.ts'
import { blob, blurred, rgba, shade, type Ctx, type RGB } from '../paint.ts'
import { box, cushion, floorShadow, hexRGB, paintPlant, piece, type Piece } from './furniture.ts'
import { WINDOWS } from './room.ts'

/**
 * The decor sets' items, drawn from a handful of shapes painted in each set's palette (main, second,
 * accent, trim), so a Luxe Gold armchair is plum velvet with gold legs and a Pastel Pop one is candy pink.
 * Floor items anchor on the floor, wall items at their centre, ceiling items at the ceiling.
 */
const cache = new Map<string, Piece>()

export function decorPiece(id: string): Piece | null {
  const item = DECOR_ITEM_BY_ID[id]
  if (!item) return null
  let p = cache.get(id)
  if (!p) {
    const set = DECOR_SET_BY_ID[item.set]
    const pal = set.palette.map(hexRGB)
    p = paint(item.kind, pal, item.set, item.label)
    cache.set(id, p)
  }
  return p
}

const outline = (ctx: Ctx, col: RGB, a = 0.55) => { ctx.strokeStyle = rgba(shade(col, -0.42), a); ctx.lineWidth = 1.1; ctx.stroke() }

function grad(ctx: Ctx, col: RGB, x0: number, y0: number, x1: number, y1: number, hi = 0.28, lo = -0.12) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1)
  g.addColorStop(0, rgba(shade(col, hi))); g.addColorStop(1, rgba(shade(col, lo)))
  return g
}

function paint(kind: DecorKind, [main, second, accent, trim]: RGB[], set: string, label: string): Piece {
  const r = makeRng(label.length * 97 + set.length)
  const gold: RGB = [226, 180, 86]
  const legs = set === 'luxe-gold' ? gold : set === 'neon-night' ? [60, 50, 80] as RGB : set === 'retro-diner' ? [200, 206, 214] as RGB : [200, 160, 120] as RGB
  switch (kind) {
    case 'armchair': return piece(70, 86, 35, 82, ctx => {
      floorShadow(ctx, 35, 81, 30, 5)
      ctx.fillStyle = rgba(legs); for (const x of [14, 52]) { ctx.beginPath(); ctx.roundRect(x, 70, 4, 12, 2); ctx.fill() }
      ctx.fillStyle = grad(ctx, main, 10, 6, 60, 60); ctx.beginPath(); ctx.roundRect(10, 8, 50, 50, [22, 22, 8, 8]); ctx.fill(); outline(ctx, main)
      if (set === 'tropical') { ctx.strokeStyle = rgba(shade(main, -0.25), 0.5); ctx.lineWidth = 1; for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(35, 58, 12 + i * 7, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke() } }
      if (set === 'cottagecore') for (let i = 0; i < 7; i++) blob(ctx, r.range(16, 54), r.range(14, 50), 3, 3, accent, 0.9, 0.5)
      cushion(ctx, 12, 48, 46, 18, shade(main, 0.08), 8)
      for (const x of [4, 52]) { ctx.fillStyle = grad(ctx, main, x, 30, x + 14, 70); ctx.beginPath(); ctx.roundRect(x, 34, 14, 38, 7); ctx.fill(); outline(ctx, main) }
      ctx.fillStyle = grad(ctx, second, 22, 30, 48, 50); ctx.beginPath(); ctx.roundRect(24, 30, 22, 18, 7); ctx.fill(); outline(ctx, second)
    })
    case 'sofa': return piece(120, 84, 60, 80, ctx => {
      floorShadow(ctx, 60, 79, 54, 6)
      ctx.fillStyle = rgba(legs); for (const x of [10, 106]) { ctx.beginPath(); ctx.roundRect(x, 68, 4, 12, 2); ctx.fill() }
      ctx.fillStyle = grad(ctx, main, 8, 6, 112, 50); ctx.beginPath(); ctx.roundRect(8, 8, 104, 40, [20, 20, 6, 6]); ctx.fill(); outline(ctx, main)
      if (set === 'retro-diner') { ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2; for (let x = 22; x < 104; x += 16) { ctx.beginPath(); ctx.moveTo(x, 12); ctx.lineTo(x, 44); ctx.stroke() } }
      cushion(ctx, 18, 42, 42, 20, shade(main, 0.08), 8); cushion(ctx, 60, 42, 42, 20, shade(main, 0.08), 8)
      for (const x of [2, 104]) { ctx.fillStyle = grad(ctx, main, x, 26, x + 16, 70); ctx.beginPath(); ctx.roundRect(x, 28, 16, 42, 8); ctx.fill(); outline(ctx, main) }
      cushion(ctx, 26, 26, 22, 18, second, 7); cushion(ctx, 74, 26, 22, 18, accent, 7)
    })
    case 'bench': return piece(100, 50, 50, 46, ctx => {
      floorShadow(ctx, 50, 45, 46, 5)
      ctx.fillStyle = rgba(shade(second, -0.2)); for (const x of [10, 84]) ctx.fillRect(x, 26, 6, 18)
      box(ctx, 4, 14, 92, 16, 10, second, 4)
      ctx.strokeStyle = rgba(shade(second, -0.3), 0.5); ctx.lineWidth = 0.8; for (let x = 12; x < 92; x += 8) { ctx.beginPath(); ctx.moveTo(x, 15); ctx.lineTo(x, 24); ctx.stroke() }
      cushion(ctx, 16, 6, 30, 12, main, 5)
    })
    case 'lamp': return piece(50, 110, 25, 106, ctx => {
      floorShadow(ctx, 25, 105, 16, 4)
      ctx.fillStyle = rgba(legs); ctx.beginPath(); ctx.ellipse(25, 104, 12, 4, 0, 0, Math.PI * 2); ctx.fill()
      ctx.fillRect(23.5, 40, 3, 64)
      if (set === 'tropical') {
        ctx.fillStyle = grad(ctx, [200, 160, 110], 10, 16, 40, 44); ctx.beginPath(); ctx.moveTo(12, 44); ctx.lineTo(38, 44); ctx.lineTo(32, 14); ctx.lineTo(18, 14); ctx.closePath(); ctx.fill(); outline(ctx, [200, 160, 110])
        const fg = ctx.createRadialGradient(25, 10, 1, 25, 10, 9); fg.addColorStop(0, '#fff3b0'); fg.addColorStop(1, 'rgba(255,150,80,0)'); ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(25, 10, 9, 0, Math.PI * 2); ctx.fill()
      } else {
        // A glowing globe.
        const g = ctx.createRadialGradient(20, 22, 2, 25, 28, 20)
        g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, rgba(shade(main, 0.5))); g.addColorStop(1, rgba(main))
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(25, 28, 17, 0, Math.PI * 2); ctx.fill(); outline(ctx, main, 0.4)
        blob(ctx, 19, 21, 5, 3, [255, 255, 255], 0.9)
      }
    })
    case 'lantern': return piece(50, 100, 25, 0, ctx => {
      ctx.strokeStyle = 'rgba(120,90,80,0.6)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(25, 0); ctx.lineTo(25, 44); ctx.stroke()
      const g = ctx.createRadialGradient(21, 60, 3, 25, 64, 22); g.addColorStop(0, '#fffaf0'); g.addColorStop(1, rgba(trim)); ctx.fillStyle = g
      ctx.beginPath(); ctx.ellipse(25, 64, 17, 20, 0, 0, Math.PI * 2); ctx.fill(); outline(ctx, trim, 0.5)
      ctx.strokeStyle = rgba(shade(trim, -0.3), 0.4); for (let y = 50; y < 82; y += 6) { ctx.beginPath(); ctx.ellipse(25, y, 16 * Math.sin(((y - 44) / 40) * Math.PI), 2, 0, 0, Math.PI); ctx.stroke() }
      ctx.fillStyle = rgba(shade(second, -0.2)); ctx.fillRect(18, 43, 14, 3); ctx.fillRect(18, 83, 14, 3)
    })
    case 'chandelier': return piece(110, 100, 55, 0, ctx => {
      ctx.strokeStyle = rgba(second); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(55, 0); ctx.lineTo(55, 30); ctx.stroke()
      ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(55, 52, 38, 11, 0, 0, Math.PI); ctx.stroke()
      for (let i = 0; i < 11; i++) { const a = (i / 10) * Math.PI, x = 55 + Math.cos(a) * 38, y = 52 + Math.sin(a) * 11; ctx.fillStyle = 'rgba(240,248,255,0.95)'; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 3, y + 8); ctx.lineTo(x, y + 18); ctx.lineTo(x + 3, y + 8); ctx.fill() }
      for (const x of [28, 55, 82]) { ctx.fillStyle = '#fff4dc'; ctx.beginPath(); ctx.roundRect(x - 3, 34, 6, 12, 2); ctx.fill(); ctx.fillStyle = '#ffd98a'; ctx.beginPath(); ctx.ellipse(x, 30, 2.4, 4, 0, 0, Math.PI * 2); ctx.fill() }
    })
    case 'disco': return piece(60, 90, 30, 0, ctx => {
      ctx.strokeStyle = 'rgba(120,90,100,0.6)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(30, 0); ctx.lineTo(30, 42); ctx.stroke()
      ctx.save(); ctx.beginPath(); ctx.arc(30, 62, 20, 0, Math.PI * 2); ctx.clip()
      for (let y = 42; y < 84; y += 5) for (let x = 10; x < 52; x += 5) { const v = r.range(0.4, 1); ctx.fillStyle = `rgba(${200 + 55 * v},${190 + 60 * v},${230 + 25 * v},1)`; ctx.fillRect(x, y, 4.4, 4.4) }
      ctx.restore()
      blob(ctx, 23, 55, 7, 5, [255, 255, 255], 0.9)
      ctx.strokeStyle = 'rgba(120,110,160,0.5)'; ctx.beginPath(); ctx.arc(30, 62, 20, 0, Math.PI * 2); ctx.stroke()
    })
    case 'shelf': return piece(80, 50, 40, 25, ctx => {
      for (let i = 0; i < 6; i++) {
        const x = 10 + i * 10.5, h = set === 'cottagecore' ? r.range(8, 12) : 8
        if (set === 'cottagecore') { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.roundRect(x, 30 - h, 8, h, 2); ctx.fill(); outline(ctx, [220, 210, 200]); blob(ctx, x + 4, 30 - h - 4, 5, 4, second, 1, 0.6) }
        else { const c = [main, second, accent, trim][i % 4]; ctx.fillStyle = grad(ctx, c, x, 22, x + 9, 30); ctx.beginPath(); ctx.roundRect(x, 23, 9, 4, 2); ctx.fill(); ctx.beginPath(); ctx.roundRect(x, 27, 9, 4, 2); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fillRect(x + 1, 26.6, 7, 0.9) }
      }
      blurred(ctx, 2, () => { ctx.fillStyle = 'rgba(120,60,84,0.25)'; ctx.fillRect(6, 34, 70, 4) })
      ctx.fillStyle = set === 'cottagecore' ? '#c9a27a' : '#fff4ec'; ctx.beginPath(); ctx.roundRect(4, 31, 72, 5, 2); ctx.fill(); outline(ctx, [220, 190, 170], 0.6)
    })
    case 'mirror': return piece(64, 80, 32, 40, ctx => {
      blurred(ctx, 3, () => { ctx.fillStyle = 'rgba(120,60,84,0.3)'; ctx.beginPath(); ctx.ellipse(34, 43, 25, 32, 0, 0, Math.PI * 2); ctx.fill() })
      const frame: RGB = set === 'luxe-gold' ? gold : set === 'neon-night' ? [240, 240, 255] : main
      const path = () => { ctx.beginPath(); if (set === 'pastel-pop') { const s = 26; ctx.moveTo(32, 70); ctx.bezierCurveTo(32 - s * 1.5, 45, 32 - s, 10, 32, 26); ctx.bezierCurveTo(32 + s, 10, 32 + s * 1.5, 45, 32, 70) } else ctx.ellipse(32, 40, 24, 32, 0, 0, Math.PI * 2) }
      path(); ctx.fillStyle = grad(ctx, frame, 6, 6, 58, 74); ctx.fill(); outline(ctx, frame)
      if (set === 'neon-night') { blurred(ctx, 4, () => { path(); ctx.strokeStyle = 'rgba(160,240,255,0.9)'; ctx.lineWidth = 4; ctx.stroke() }) }
      ctx.save(); ctx.translate(32, 40); ctx.scale(0.8, 0.82); ctx.translate(-32, -40); path(); ctx.restore()
      const mg = ctx.createLinearGradient(10, 10, 54, 70); mg.addColorStop(0, '#f4fbff'); mg.addColorStop(1, '#cfe3ee'); ctx.fillStyle = mg; ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(20, 30); ctx.lineTo(30, 20); ctx.moveTo(22, 38); ctx.lineTo(36, 24); ctx.stroke()
    })
    case 'neon': case 'sign': return piece(80, 56, 40, 28, ctx => {
      if (kind === 'sign') {
        // A surf sign: a painted board.
        ctx.fillStyle = grad(ctx, second, 6, 10, 74, 46); ctx.beginPath(); ctx.roundRect(6, 12, 68, 32, 16); ctx.fill(); outline(ctx, second)
        ctx.fillStyle = rgba(accent); ctx.font = '700 15px Fredoka, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('surf', 40, 28)
        ctx.strokeStyle = rgba(main); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(14, 38); ctx.quadraticCurveTo(40, 30, 66, 38); ctx.stroke()
        return
      }
      const col = set === 'neon-night' ? accent : second
      const drawShape = (w: number, style: string) => {
        ctx.strokeStyle = style; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath()
        if (set === 'pastel-pop') { ctx.arc(26, 30, 11, Math.PI * 0.8, Math.PI * 1.9); ctx.arc(42, 24, 13, Math.PI * 1.1, Math.PI * 1.95); ctx.arc(57, 31, 10, Math.PI * 1.3, Math.PI * 0.3); ctx.lineTo(24, 41); ctx.closePath() }
        else { ctx.moveTo(40, 44); ctx.bezierCurveTo(14, 26, 22, 8, 40, 20); ctx.bezierCurveTo(58, 8, 66, 26, 40, 44) }
        ctx.stroke()
      }
      blurred(ctx, 4, () => drawShape(8, rgba(col, 0.8)))
      drawShape(3.4, rgba(shade(col, 0.5)))
      drawShape(1.3, '#ffffff')
    })
    case 'clock': return piece(56, 56, 28, 28, ctx => {
      blurred(ctx, 4, () => { ctx.strokeStyle = rgba(accent, 0.9); ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(28, 28, 21, 0, Math.PI * 2); ctx.stroke() })
      ctx.fillStyle = '#fffaf2'; ctx.beginPath(); ctx.arc(28, 28, 19, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = rgba(shade(accent, 0.4)); ctx.lineWidth = 3; ctx.stroke()
      ctx.strokeStyle = '#5a3a52'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(28, 28); ctx.lineTo(28, 16); ctx.moveTo(28, 28); ctx.lineTo(37, 31); ctx.stroke()
      for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; ctx.fillStyle = rgba(main); ctx.beginPath(); ctx.arc(28 + Math.cos(a) * 15, 28 + Math.sin(a) * 15, 1.2, 0, Math.PI * 2); ctx.fill() }
    })
    case 'frame': return piece(64, 70, 32, 35, ctx => {
      blurred(ctx, 3, () => { ctx.fillStyle = 'rgba(120,60,84,0.3)'; ctx.fillRect(10, 10, 48, 58) })
      ctx.fillStyle = grad(ctx, gold, 6, 6, 58, 64, 0.35, -0.15); ctx.beginPath(); ctx.roundRect(6, 6, 52, 60, 4); ctx.fill(); outline(ctx, gold)
      ctx.strokeStyle = 'rgba(255,240,200,0.8)'; ctx.lineWidth = 1; ctx.strokeRect(10, 10, 44, 52)
      const g = ctx.createLinearGradient(12, 12, 52, 60); g.addColorStop(0, rgba(trim)); g.addColorStop(1, rgba(main)); ctx.fillStyle = g; ctx.fillRect(13, 13, 38, 46)
      blob(ctx, 32, 40, 12, 14, second, 0.9, 0.5)
    })
    case 'wreath': return piece(60, 60, 30, 30, ctx => {
      for (let i = 0; i < 18; i++) { const a = (i / 18) * Math.PI * 2; blob(ctx, 30 + Math.cos(a) * 18, 30 + Math.sin(a) * 18, 6, 4, i % 3 ? second : [180, 150, 110], 1, 0.6) }
      for (let i = 0; i < 7; i++) { const a = r.range(0, Math.PI * 2); blob(ctx, 30 + Math.cos(a) * 18, 30 + Math.sin(a) * 18, 3.5, 3.5, i % 2 ? accent : main, 1, 0.7) }
      ctx.fillStyle = rgba(accent); ctx.beginPath(); ctx.moveTo(30, 48); ctx.lineTo(24, 56); ctx.lineTo(30, 52); ctx.lineTo(36, 56); ctx.fill()
    })
    case 'vinyl': return piece(90, 60, 45, 30, ctx => {
      for (let i = 0; i < 3; i++) {
        const x = 16 + i * 29, y = 30 + (i % 2 ? -6 : 6)
        blurred(ctx, 2, () => { ctx.fillStyle = 'rgba(120,60,84,0.3)'; ctx.beginPath(); ctx.arc(x + 1, y + 2, 13, 0, Math.PI * 2); ctx.fill() })
        ctx.fillStyle = '#2f2733'; ctx.beginPath(); ctx.arc(x, y, 13, 0, Math.PI * 2); ctx.fill()
        ctx.strokeStyle = 'rgba(255,255,255,0.12)'; for (const rr of [6, 9, 11.5]) { ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2); ctx.stroke() }
        ctx.fillStyle = rgba([main, accent, second][i]); ctx.beginPath(); ctx.arc(x, y, 4.2, 0, Math.PI * 2); ctx.fill()
      }
    })
    case 'rug': case 'sand': return piece(180, 90, 90, 45, ctx => {
      blurred(ctx, 3, () => { ctx.fillStyle = 'rgba(120,60,84,0.22)'; ctx.beginPath(); ctx.roundRect(10, 12, 164, 72, 30); ctx.fill() })
      ctx.save(); ctx.beginPath()
      if (kind === 'sand' || set === 'retro-diner') ctx.roundRect(6, 8, 168, 72, 8); else ctx.ellipse(90, 44, 84, 36, 0, 0, Math.PI * 2)
      ctx.clip()
      if (kind === 'sand') {
        ctx.fillStyle = '#efe3cc'; ctx.fillRect(0, 0, 180, 90)
        ctx.strokeStyle = 'rgba(180,160,130,0.6)'; ctx.lineWidth = 1.2; for (let y = 14; y < 80; y += 6) { ctx.beginPath(); ctx.moveTo(6, y); ctx.bezierCurveTo(60, y - 4, 120, y + 4, 174, y); ctx.stroke() }
        for (const [x, y, s] of [[50, 40, 9], [120, 50, 7]]) { blob(ctx, x + 2, y + 3, s, s * 0.6, [120, 110, 100], 0.4); ctx.fillStyle = '#b9b2a8'; ctx.beginPath(); ctx.ellipse(x, y, s, s * 0.7, 0, 0, Math.PI * 2); ctx.fill(); blob(ctx, x - 2, y - 2, s * 0.5, s * 0.3, [255, 255, 255], 0.6) }
      } else if (set === 'retro-diner') {
        for (let y = 0; y < 90; y += 12) for (let x = 0; x < 180; x += 12) { ctx.fillStyle = (x / 12 + y / 12) % 2 ? '#fbf4ea' : '#3a3440'; ctx.fillRect(x, y, 12, 12) }
      } else if (set === 'neon-night') {
        const g = ctx.createLinearGradient(0, 0, 180, 90); g.addColorStop(0, '#b8f1ff'); g.addColorStop(0.35, '#e7c7ff'); g.addColorStop(0.7, '#ffc4e5'); g.addColorStop(1, '#c9ffe9'); ctx.fillStyle = g; ctx.fillRect(0, 0, 180, 90)
        ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillRect(0, 30, 180, 8)
      } else {
        ctx.fillStyle = rgba(shade(main, 0.2)); ctx.fillRect(0, 0, 180, 90)
        ctx.strokeStyle = rgba(trim); ctx.lineWidth = 7; ctx.beginPath(); ctx.ellipse(90, 44, 70, 26, 0, 0, Math.PI * 2); ctx.stroke()
        ctx.strokeStyle = rgba(second); ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(90, 44, 50, 17, 0, 0, Math.PI * 2); ctx.stroke()
        for (let i = 0; i < 10; i++) blob(ctx, r.range(20, 160), r.range(15, 75), 3, 2, [255, 255, 255], 0.5)
      }
      ctx.restore()
    })
    case 'screen': return piece(80, 110, 40, 104, ctx => {
      floorShadow(ctx, 40, 103, 36, 5)
      for (let i = 0; i < 3; i++) {
        const x = 6 + i * 23
        ctx.fillStyle = '#f7f1e3'; ctx.beginPath(); ctx.roundRect(x, 10, 22, 92, 3); ctx.fill()
        ctx.strokeStyle = rgba(second); ctx.lineWidth = 2.4; ctx.strokeRect(x + 1, 11, 20, 90)
        ctx.lineWidth = 1; for (let y = 30; y < 100; y += 20) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 22, y); ctx.stroke() }
        blob(ctx, x + 11, 50, 8, 16, main, 0.35)
      }
    })
    case 'fountain': return piece(90, 90, 45, 84, ctx => {
      floorShadow(ctx, 45, 83, 38, 6)
      box(ctx, 8, 52, 74, 30, 14, [190, 186, 180], 12)
      ctx.fillStyle = 'rgba(150,210,230,0.9)'; ctx.beginPath(); ctx.ellipse(45, 58, 32, 6, 0, 0, Math.PI * 2); ctx.fill()
      box(ctx, 30, 22, 30, 32, 8, [180, 176, 170], 8)
      ctx.fillStyle = 'rgba(150,210,230,0.9)'; ctx.beginPath(); ctx.ellipse(45, 26, 12, 3, 0, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = 'rgba(200,240,255,0.9)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(45, 12); ctx.quadraticCurveTo(58, 10, 60, 52); ctx.moveTo(45, 12); ctx.quadraticCurveTo(32, 10, 30, 52); ctx.stroke()
      blob(ctx, 20, 70, 8, 5, main, 1, 0.6)
    })
    case 'plant': return paintPlant(0.8)
    case 'palm': return piece(90, 130, 45, 124, ctx => {
      floorShadow(ctx, 45, 123, 24, 5)
      ctx.fillStyle = grad(ctx, second, 30, 94, 60, 124); ctx.beginPath(); ctx.moveTo(30, 96); ctx.lineTo(60, 96); ctx.lineTo(55, 124); ctx.lineTo(35, 124); ctx.fill(); outline(ctx, second)
      ctx.strokeStyle = rgba(shade(second, -0.25), 0.5); for (let y = 100; y < 124; y += 5) { ctx.beginPath(); ctx.moveTo(32, y); ctx.lineTo(58, y); ctx.stroke() }
      for (let i = 0; i < 8; i++) {
        const a = -Math.PI / 2 + (i - 3.5) * 0.38, len = r.range(36, 48)
        ctx.strokeStyle = rgba(shade(main, -0.1)); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(45, 96); const ex = 45 + Math.cos(a) * len, ey = 60 + Math.sin(a) * len * 0.8; ctx.quadraticCurveTo(45 + Math.cos(a) * len * 0.4, 50, ex, ey); ctx.stroke()
        for (let k = 1; k < 8; k++) { const t = k / 8; const px = 45 + (ex - 45) * t, py = 96 + (ey - 96) * t - Math.sin(t * Math.PI) * 18; blob(ctx, px, py, 7, 2.6, shade(main, (k % 2) * 0.12), 1, 0.7) }
      }
    })
    case 'bonsai': return piece(40, 44, 20, 40, ctx => {
      ctx.fillStyle = '#6e8fb0'; ctx.beginPath(); ctx.roundRect(8, 32, 24, 8, 3); ctx.fill()
      ctx.strokeStyle = '#8a6a50'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(20, 32); ctx.quadraticCurveTo(14, 22, 22, 16); ctx.stroke()
      for (const [x, y, s] of [[14, 14, 8], [26, 12, 9], [20, 8, 7]]) blob(ctx, x, y, s, s * 0.7, main, 1, 0.6)
    })
    case 'counter': return piece(110, 90, 55, 86, ctx => {
      floorShadow(ctx, 55, 85, 50, 6)
      const top = set === 'luxe-gold' ? [250, 246, 242] as RGB : set === 'cottagecore' ? shade(second, 0.2) : shade(trim, 0.2)
      const face = set === 'cottagecore' ? [184, 138, 100] as RGB : main
      box(ctx, 6, 28, 98, 56, 16, face, 8)
      ctx.fillStyle = grad(ctx, top, 4, 22, 106, 44, 0.3, -0.05); ctx.beginPath(); ctx.roundRect(4, 22, 102, 18, 6); ctx.fill(); outline(ctx, top)
      if (set === 'retro-diner') { ctx.fillStyle = rgba(trim); ctx.fillRect(8, 56, 94, 4); for (const x of [26, 54, 82]) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.roundRect(x - 5, 6, 10, 18, 3); ctx.fill(); ctx.fillStyle = rgba(accent); ctx.fillRect(x - 5, 12, 10, 12); ctx.fillStyle = '#e25a64'; ctx.beginPath(); ctx.arc(x, 5, 3, 0, Math.PI * 2); ctx.fill() } }
      else if (set === 'cottagecore') { for (const y of [48, 66]) { ctx.strokeStyle = rgba(shade(face, -0.3), 0.6); ctx.strokeRect(12, y, 86, 14); ctx.fillStyle = '#e2b456'; ctx.beginPath(); ctx.arc(55, y + 7, 2, 0, Math.PI * 2); ctx.fill() } }
      else { ctx.strokeStyle = rgba(gold); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(8, 44); ctx.lineTo(102, 44); ctx.stroke(); blob(ctx, 30, 30, 20, 4, [255, 255, 255], 0.6) }
    })
    case 'cart': return piece(60, 80, 30, 76, ctx => {
      floorShadow(ctx, 30, 75, 26, 4)
      ctx.strokeStyle = rgba(gold); ctx.lineWidth = 2.4; ctx.strokeRect(10, 30, 40, 38)
      box(ctx, 6, 28, 48, 7, 4, trim, 3); box(ctx, 6, 58, 48, 6, 3, trim, 3)
      for (const x of [12, 48]) { ctx.fillStyle = rgba(gold); ctx.beginPath(); ctx.arc(x, 72, 3.4, 0, Math.PI * 2); ctx.fill() }
      ctx.fillStyle = '#3b5d3e'; ctx.beginPath(); ctx.roundRect(16, 8, 9, 20, 3); ctx.fill(); ctx.fillStyle = rgba(gold); ctx.fillRect(18, 4, 5, 6)
      for (const x of [32, 40]) { ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x - 3, 14); ctx.lineTo(x + 3, 14); ctx.lineTo(x, 22); ctx.closePath(); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x, 22); ctx.lineTo(x, 28); ctx.stroke() }
    })
    case 'hammock': return piece(120, 90, 60, 84, ctx => {
      floorShadow(ctx, 60, 83, 54, 5)
      ctx.strokeStyle = '#b88a64'; ctx.lineWidth = 4; for (const x of [8, 112]) { ctx.beginPath(); ctx.moveTo(x, 84); ctx.lineTo(x, 20); ctx.stroke() }
      ctx.fillStyle = grad(ctx, main, 10, 30, 110, 70); ctx.beginPath(); ctx.moveTo(10, 28); ctx.quadraticCurveTo(60, 88, 110, 28); ctx.quadraticCurveTo(60, 60, 10, 28); ctx.fill(); outline(ctx, main)
      ctx.strokeStyle = rgba(accent); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(18, 36); ctx.quadraticCurveTo(60, 76, 102, 36); ctx.stroke()
    })
    case 'bowl': return piece(40, 30, 20, 26, ctx => {
      for (const [x, y, c] of [[14, 12, accent], [22, 10, [250, 210, 90] as RGB], [18, 6, main], [27, 14, [240, 140, 60] as RGB]] as [number, number, RGB][]) { ctx.fillStyle = rgba(c); ctx.beginPath(); ctx.arc(x, y, 5.4, 0, Math.PI * 2); ctx.fill(); blob(ctx, x - 2, y - 2, 2, 1.4, [255, 255, 255], 0.8) }
      ctx.fillStyle = grad(ctx, second, 4, 14, 36, 26); ctx.beginPath(); ctx.moveTo(4, 14); ctx.quadraticCurveTo(20, 34, 36, 14); ctx.closePath(); ctx.fill(); outline(ctx, second)
    })
    case 'teapot': return piece(46, 32, 23, 28, ctx => {
      ctx.fillStyle = grad(ctx, trim, 8, 6, 32, 28, 0.4); ctx.beginPath(); ctx.ellipse(18, 18, 11, 9, 0, 0, Math.PI * 2); ctx.fill(); outline(ctx, trim)
      ctx.strokeStyle = rgba(shade(trim, -0.2)); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(28, 18); ctx.quadraticCurveTo(34, 12, 36, 10); ctx.stroke()
      ctx.beginPath(); ctx.arc(7, 18, 4, Math.PI * 0.5, Math.PI * 1.5); ctx.stroke()
      blob(ctx, 16, 16, 3, 3, accent, 1, 0.6)
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(38, 26, 6, 3, 0, 0, Math.PI * 2); ctx.fill(); outline(ctx, [220, 210, 210])
    })
    case 'cabinet': case 'jukebox': return piece(70, 120, 35, 116, ctx => {
      floorShadow(ctx, 35, 115, 30, 5)
      if (kind === 'jukebox') {
        ctx.fillStyle = grad(ctx, main, 6, 10, 64, 112); ctx.beginPath(); ctx.roundRect(6, 10, 58, 104, [29, 29, 6, 6]); ctx.fill(); outline(ctx, main)
        const g = ctx.createLinearGradient(12, 20, 58, 70); g.addColorStop(0, '#fff3c4'); g.addColorStop(1, rgba(accent)); ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(14, 18, 42, 44, [21, 21, 4, 4]); ctx.fill()
        for (let i = 0; i < 5; i++) { ctx.fillStyle = rgba(i % 2 ? trim : second); ctx.fillRect(16, 68 + i * 6, 38, 3) }
        ctx.fillStyle = rgba(shade(main, -0.3)); ctx.fillRect(14, 98, 42, 8)
      } else {
        ctx.fillStyle = grad(ctx, main, 8, 6, 62, 112, 0.15, -0.2); ctx.beginPath(); ctx.roundRect(8, 6, 54, 108, 6); ctx.fill(); outline(ctx, [80, 60, 100])
        const g = ctx.createLinearGradient(14, 16, 56, 56); g.addColorStop(0, rgba(accent)); g.addColorStop(1, rgba(second)); ctx.fillStyle = g; ctx.fillRect(14, 16, 42, 36)
        ctx.fillStyle = 'rgba(255,255,255,0.8)'; for (let i = 0; i < 4; i++) ctx.fillRect(18 + i * 9, 40 - i * 5, 5, 5)
        ctx.fillStyle = rgba(shade(main, 0.2)); ctx.beginPath(); ctx.moveTo(8, 60); ctx.lineTo(62, 60); ctx.lineTo(66, 74); ctx.lineTo(4, 74); ctx.fill()
        ctx.fillStyle = rgba(second); ctx.beginPath(); ctx.arc(22, 66, 3, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = rgba(accent); for (const x of [38, 46, 54]) { ctx.beginPath(); ctx.arc(x, 67, 2.4, 0, Math.PI * 2); ctx.fill() }
      }
    })
    case 'curtains': return piece(140, 110, 70, 0, ctx => {
      // Lace curtains tied back either side of a window (drawn at each window).
      for (const s of [-1, 1]) {
        const x0 = 70 + s * 62
        ctx.fillStyle = 'rgba(255,252,248,0.92)'
        ctx.beginPath(); ctx.moveTo(x0 - s * 4, 8); ctx.lineTo(x0 - s * 26, 8); ctx.quadraticCurveTo(x0 - s * 8, 60, x0 - s * 18, 104); ctx.lineTo(x0 + s * 6, 104); ctx.quadraticCurveTo(x0 + s * 2, 60, x0 - s * 4, 8); ctx.fill()
        ctx.strokeStyle = 'rgba(210,180,190,0.7)'; ctx.lineWidth = 0.8; ctx.stroke()
        for (let y = 20; y < 100; y += 9) { ctx.beginPath(); ctx.arc(x0 - s * 10, y, 2.2, 0, Math.PI * 2); ctx.stroke() }
        ctx.fillStyle = rgba(accent); ctx.beginPath(); ctx.roundRect(x0 - s * 16 - 4, 62, 8, 5, 2); ctx.fill()
      }
      ctx.fillStyle = rgba(second); ctx.beginPath(); ctx.roundRect(4, 4, 132, 5, 2); ctx.fill()
    })
  }
}

/** Where curtains go: over each window. */
export const CURTAIN_SPOTS = WINDOWS.map(w => ({ x: w.x, y: 12 }))

export { box }
