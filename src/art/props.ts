import { FACE } from '../core/treatments/anatomy.ts'
import { makeRng } from '../core/rng.ts'
import { blob, canvas, mixRGB, rgba, shade, smoothPath, softBatch, terry, terryLoops, type RGB } from './paint.ts'
import type { SkinTone } from './palette.ts'

/**
 * The warm steam towel wrapped over the lower face (the eyes stay free), in art space. It follows the face
 * beneath: the bridge and tip of the nose lift it (lit on the left, a shadow falling right), it dips over the
 * mouth, domes over the cheeks and chin, and wraps in around the jaw in folds that run toward the chin. Looped
 * terry, a thick rolled top edge with its shadow on the skin, darker damp patches, a pastel hem stripe.
 */
export function paintSteamTowel(seed: number, tint: RGB = [252, 244, 242]): HTMLCanvasElement {
  const [c, ctx] = canvas(1024)
  const r = makeRng(seed + 77)
  const top = 574, bottom = 940
  const n = FACE.nose, l = FACE.lips
  // It hugs the face: the face's own outline below the eyes, a little fuller, tucked in under the jaw.
  const o = FACE.outline, shape: number[] = []
  for (let i = 0; i < o.length; i += 2) if (o[i + 1] > top - 10) shape.push(512 + (o[i] - 512) * 1.07, 540 + (o[i + 1] - 540) * 1.05 + 6)
  shape.push(512 - 284 * 1.02, top + 8, 512, top - 18, 512 + 284 * 1.02, top + 8)
  const light = shade(tint, 0.3), fold = mixRGB(tint, [196, 170, 180], 0.7), deepFold = mixRGB(tint, [170, 136, 150], 0.8)
  // Its soft shadow on the skin and pillow, and the contact line under the rolled top edge.
  softBatch(ctx, 22, k => { k.fillStyle = 'rgba(110,60,80,0.36)'; k.beginPath(); smoothPath(k, shape.map((v, i) => v + (i % 2 ? 16 : 10))); k.fill() })
  softBatch(ctx, 4, k => { k.strokeStyle = 'rgba(110,60,80,0.4)'; k.lineWidth = 10; k.beginPath(); k.moveTo(200, top + 22); k.quadraticCurveTo(512, top - 50, 824, top + 22); k.stroke() })
  ctx.save()
  ctx.beginPath(); smoothPath(ctx, shape)
  const g = ctx.createLinearGradient(160, top, 860, bottom)
  g.addColorStop(0, rgba(shade(tint, 0.2))); g.addColorStop(0.6, rgba(tint)); g.addColorStop(1, rgba(shade(tint, -0.08)))
  ctx.fillStyle = g
  ctx.fill()
  ctx.clip()
  terry(ctx, 110, top - 40, 804, bottom - top + 100, tint, seed + 78, 0.02)
  terryLoops(ctx, 110, top - 40, 804, bottom - top + 100, 0.5)
  // Form from the face beneath, in one soft pass of light and one of shade.
  softBatch(ctx, 18, k => {
    const b = (x: number, y: number, rx: number, ry: number, col: RGB, a: number) => { k.fillStyle = rgba(col, a); k.beginPath(); k.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); k.fill() }
    b(n.x - 14, n.y - 30, 26, 70, light, 0.9)
    b(n.x - 8, n.y + 6, 44, 42, light, 0.85)
    b(372, 700, 110, 90, light, 0.55)
    b(652, 706, 90, 80, light, 0.3)
    b(500, 850, 110, 46, light, 0.6)
  })
  softBatch(ctx, 10, k => {
    const b = (x: number, y: number, rx: number, ry: number, col: RGB, a: number) => { k.fillStyle = rgba(col, a); k.beginPath(); k.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); k.fill() }
    b(n.x + 40, n.y - 6, 26, 80, deepFold, 1)
    b(n.x + 50, n.y + 20, 40, 50, deepFold, 0.8)
    b(n.x + 16, n.y + 62, 84, 22, deepFold, 0.9)
    b(n.x - 40, n.y + 50, 40, 16, fold, 0.5)
    b(l.x + 6, l.y + 8, 96, 26, fold, 0.6)
    b(l.x + 10, l.y + 66, 76, 16, deepFold, 0.55)
    b(236, 780, 56, 140, deepFold, 0.6)
    b(792, 780, 60, 140, deepFold, 0.8)
  }, 'multiply')
  // Folds wrapping in around the jaw toward the chin: a shadowed crease with a lit ridge beside it.
  softBatch(ctx, 5, k => {
    for (let i = 0; i < 9; i++) {
      const side = i % 2 ? 1 : -1
      const y0 = r.range(640, 820), x0 = 512 + side * r.range(270, 300)
      const x1 = 512 + side * r.range(90, 170), y1 = r.range(850, 920)
      const cx = 512 + side * r.range(210, 260), cy = (y0 + y1) / 2 + r.range(-30, 30)
      k.strokeStyle = rgba(deepFold, 0.55); k.lineWidth = r.range(5, 9)
      k.beginPath(); k.moveTo(x0, y0); k.quadraticCurveTo(cx, cy, x1, y1); k.stroke()
      k.strokeStyle = rgba(light, 0.8); k.lineWidth = r.range(4, 7)
      k.beginPath(); k.moveTo(x0 - side * 8, y0 - 6); k.quadraticCurveTo(cx - side * 8, cy - 6, x1 - side * 6, y1 - 6); k.stroke()
    }
  })
  // Damp: a few darker, slightly glossy patches where it is wettest.
  softBatch(ctx, 16, k => {
    for (let i = 0; i < 6; i++) { k.fillStyle = rgba(fold, 0.35); k.beginPath(); k.ellipse(r.range(280, 740), r.range(640, 880), r.range(40, 80), r.range(26, 50), r.range(0, 3), 0, Math.PI * 2); k.fill() }
  }, 'multiply')
  for (let i = 0; i < 14; i++) blob(ctx, r.range(300, 720), r.range(620, 880), 5, 3, [255, 255, 255], 0.6)
  // A pastel stripe near the lower hem, following the curve of the chin.
  ctx.strokeStyle = 'rgba(247,183,201,0.75)'; ctx.lineWidth = 14
  ctx.beginPath(); ctx.moveTo(250, bottom - 110); ctx.quadraticCurveTo(512, bottom - 20, 774, bottom - 110); ctx.stroke()
  ctx.restore()
  // The rolled top edge: a thick soft tube, lit on top, shaded beneath, lifting over the nose.
  const edge = (k: Ctx2, dy: number) => { k.beginPath(); k.moveTo(220, top + 30 + dy); k.bezierCurveTo(330, top - 6 + dy, 440, top - 30 + dy, 512, top - 34 + dy); k.bezierCurveTo(584, top - 30 + dy, 694, top - 6 + dy, 804, top + 30 + dy) }
  ctx.lineCap = 'round'
  ctx.strokeStyle = rgba(tint); ctx.lineWidth = 26; edge(ctx, 2); ctx.stroke()
  softBatch(ctx, 3, k => {
    k.strokeStyle = rgba([255, 255, 255], 0.95); k.lineWidth = 9; edge(k, -4); k.stroke()
    k.strokeStyle = rgba(deepFold, 0.6); k.lineWidth = 6; edge(k, 12); k.stroke()
  })
  return c
}

/** Where the robe sprite sits in art space (it reaches past the 1024 sheet, down and out to the screen edges). */
export const ROBE = { x: -338, y: 870, w: 1700, h: 470 }

/**
 * The spa robe over the shoulders, painted in art space as its own sprite above the skin, so it runs on
 * below the art sheet without a seam: a terry body rounding over the shoulders with soft folds, the skin of
 * the chest in the V, and a thick rolled shawl collar crossing left over right, each lapel lit along its
 * roll and casting a soft shadow on the body and the neck.
 */
export function paintRobe(color: RGB, skin: SkinTone, seed: number): HTMLCanvasElement {
  const [c, ctx] = canvas(ROBE.w, ROBE.h)
  ctx.translate(-ROBE.x, -ROBE.y)
  const r = makeRng(seed + 131)
  const robe = shade(color, 0.22), fold = shade(color, -0.14), lit = shade(color, 0.5)
  const body = (k: Ctx2) => {
    k.beginPath()
    k.moveTo(-340, 1345); k.lineTo(-340, 1080)
    k.bezierCurveTo(-190, 1000, 110, 928, 330, 904)
    k.lineTo(694, 904)
    k.bezierCurveTo(914, 928, 1214, 1000, 1364, 1080)
    k.lineTo(1364, 1345); k.closePath()
  }
  // Its soft shadow on the bed and pillow.
  softBatch(ctx, 16, k => { k.translate(10, 14); k.fillStyle = 'rgba(120,60,90,0.3)'; body(k); k.fill() })
  // The V of the neckline is left open, so the neck and chest painted on the art sheet show through with no
  // seam; the lapels cross above the sheet's edge.
  const vee = (k: Ctx2) => { k.beginPath(); k.moveTo(404, 880); k.lineTo(620, 880); k.lineTo(512, 1004); k.closePath() }
  ctx.save()
  body(ctx)
  const g = ctx.createLinearGradient(0, 900, 0, 1340)
  g.addColorStop(0, rgba(shade(robe, 0.18))); g.addColorStop(1, rgba(shade(robe, -0.04)))
  ctx.fillStyle = g
  ctx.fill()
  ctx.clip()
  // The shoulders round away from the light: darker toward the outer edges, the far side most.
  const sg = ctx.createLinearGradient(-340, 0, 1364, 0)
  sg.addColorStop(0, rgba(fold, 0.35)); sg.addColorStop(0.3, rgba(fold, 0)); sg.addColorStop(0.7, rgba(fold, 0)); sg.addColorStop(1, rgba(fold, 0.5))
  ctx.fillStyle = sg
  ctx.fillRect(-340, 880, 1704, 470)
  terry(ctx, -340, 890, 1704, 460, robe, seed + 3, 0.012)
  // The shoulders round up toward the light: a broad lit crown on each, falling into shade below.
  softBatch(ctx, 40, k => {
    k.fillStyle = rgba(lit, 0.7)
    for (const side of [-1, 1]) { k.beginPath(); k.ellipse(512 + side * 360, 985, 230, 70, side * 0.18, 0, Math.PI * 2); k.fill() }
  })
  softBatch(ctx, 40, k => { k.fillStyle = rgba(fold, 0.6); k.fillRect(-340, 1180, 1704, 200) }, 'multiply')
  // Folds sweeping over the shoulders and down: each a shaded valley with a lit ridge beside it.
  softBatch(ctx, 7, k => {
    for (let i = 0; i < 14; i++) {
      const side = i % 2 ? 1 : -1, x = 512 + side * r.range(250, 760), y = r.range(980, 1220)
      const bend = r.range(-30, 30)
      k.strokeStyle = rgba(shade(fold, -0.1), 0.6); k.lineWidth = r.range(9, 16)
      k.beginPath(); k.moveTo(x - side * 80, y - 70); k.quadraticCurveTo(x + bend, y, x + side * 60, y + 140); k.stroke()
      k.strokeStyle = rgba(lit, 0.7); k.lineWidth = r.range(6, 10)
      k.beginPath(); k.moveTo(x - side * 80 - 12, y - 76); k.quadraticCurveTo(x + bend - 12, y - 6, x + side * 60 - 12, y + 134); k.stroke()
    }
  })
  ctx.restore()
  ctx.save()
  ctx.globalCompositeOperation = 'destination-out'
  ctx.filter = 'blur(1px)'
  vee(ctx); ctx.fill()
  ctx.restore()
  // The shawl collar: the right lapel first, then the left crossing over it.
  for (const side of [1, -1]) {
    const lapel = (k: Ctx2) => {
      k.beginPath()
      k.moveTo(512 + side * 96, 892)
      k.bezierCurveTo(512 + side * 86, 940, 512 + side * 40, 985, 512 - side * 30, 1050)
      k.lineTo(512 - side * 70, 1345)
      k.lineTo(512 + side * 60, 1345)
      k.bezierCurveTo(512 + side * 120, 1180, 512 + side * 200, 1020, 512 + side * 226, 898)
      k.quadraticCurveTo(512 + side * 160, 872, 512 + side * 96, 892)
      k.closePath()
    }
    // Shadow cast on the body and the chest, down and right.
    softBatch(ctx, 10, k => { k.translate(side < 0 ? 14 : 6, 12); k.fillStyle = 'rgba(90,40,70,0.32)'; lapel(k) ; k.fill() })
    ctx.save()
    lapel(ctx)
    const lg = ctx.createLinearGradient(512 + side * 90, 0, 512 + side * 220, 0)
    lg.addColorStop(0, rgba(lit)); lg.addColorStop(0.45, rgba(shade(robe, 0.2))); lg.addColorStop(1, rgba(fold))
    ctx.fillStyle = lg
    ctx.fill()
    ctx.clip()
    terry(ctx, 512 - 260, 860, 520, 490, robe, seed + 9 + side, 0.02)
    // The roll: a lit ridge along the inner edge, shade toward the outer.
    softBatch(ctx, 5, k => {
      k.strokeStyle = rgba(shade(lit, 0.2), 0.8); k.lineWidth = 12
      k.beginPath(); k.moveTo(512 + side * 106, 900); k.bezierCurveTo(512 + side * 96, 945, 512 + side * 50, 990, 512 - side * 18, 1052); k.stroke()
      k.strokeStyle = rgba(fold, 0.55); k.lineWidth = 16
      k.beginPath(); k.moveTo(512 + side * 212, 910); k.bezierCurveTo(512 + side * 190, 1020, 512 + side * 116, 1170, 512 + side * 64, 1340); k.stroke()
    })
    ctx.restore()
  }
  // The collar shades the neck where it stands up behind it (a normal blend: this sprite has no neck
  // under it to multiply).
  softBatch(ctx, 12, k => {
    k.fillStyle = rgba(skin.deep, 0.3)
    k.beginPath(); k.ellipse(512, 900, 100, 20, 0, 0, Math.PI * 2); k.fill()
  })
  return c
}
type Ctx2 = CanvasRenderingContext2D
