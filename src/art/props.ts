import { FACE } from '../core/treatments/anatomy.ts'
import { makeRng } from '../core/rng.ts'
import { blob, blurred, canvas, mixRGB, rgba, shade, smoothPath, softBatch, terry, type RGB } from './paint.ts'
import type { SkinTone } from './palette.ts'

/**
 * Close-up props painted in art space: the warm steam towel wrapped over the lower face (the eyes stay free). It follows the face
 * form (the nose tip lifting it, a dip at the mouth, the round of the chin) with a rolled top edge and terry folds.
 */
export function paintSteamTowel(seed: number, tint: RGB = [255, 250, 247]): HTMLCanvasElement {
  const [c, ctx] = canvas(1024)
  const r = makeRng(seed + 77)
  const top = 574, bottom = 940
  const shape = [150, top + 26, 300, top - 4, 512, top - 16, 724, top - 4, 874, top + 26, 900, 700, 850, 860, 740, bottom, 512, bottom + 20, 284, bottom, 174, 860, 124, 700]
  // A soft shadow on the skin and pillow around it.
  blurred(ctx, 24, () => { ctx.fillStyle = 'rgba(120,70,90,0.35)'; ctx.beginPath(); smoothPath(ctx, shape.map((v, i) => v + (i % 2 ? 16 : 10))); ctx.fill() })
  ctx.save()
  ctx.beginPath(); smoothPath(ctx, shape)
  const g = ctx.createLinearGradient(160, top, 860, bottom)
  g.addColorStop(0, rgba(shade(tint, 0.2))); g.addColorStop(0.6, rgba(tint)); g.addColorStop(1, rgba(shade(tint, -0.1)))
  ctx.fillStyle = g
  ctx.fill()
  ctx.clip()
  terry(ctx, 140, top - 30, 740, bottom - top + 80, tint, seed + 78, 0.02)
  // The face underneath: the tip of the nose lifting it, a dip at the mouth, the round of the chin and cheeks.
  const n = FACE.nose
  blob(ctx, n.x - 10, n.y + 6, 46, 50, [255, 255, 255], 0.75)
  blob(ctx, n.x + 34, n.y + 26, 40, 40, [196, 170, 176], 0.4)
  blob(ctx, FACE.lips.x, FACE.lips.y + 6, 96, 34, [210, 188, 194], 0.35)
  blob(ctx, 500, 850, 120, 50, [255, 255, 255], 0.5)
  for (const x of [300, 724]) blob(ctx, x, 720, 90, 120, x < 512 ? [255, 255, 255] : [206, 184, 190], 0.4)
  // Where it tucks around the jaw, it falls into shadow.
  blob(ctx, 150, 760, 70, 200, [180, 150, 160], 0.5)
  blob(ctx, 874, 760, 70, 200, [170, 140, 152], 0.6)
  // Soft diagonal folds.
  blurred(ctx, 10, () => {
    for (let i = 0; i < 7; i++) {
      const x = r.range(200, 820), y = r.range(360, 880)
      ctx.strokeStyle = r() < 0.5 ? 'rgba(255,255,255,0.8)' : 'rgba(190,165,172,0.5)'
      ctx.lineWidth = r.range(10, 22)
      ctx.beginPath(); ctx.moveTo(x - 80, y - 30); ctx.quadraticCurveTo(x, y + r.range(-20, 20), x + 90, y + 40); ctx.stroke()
    }
  })
  // A pastel stripe near the lower hem.
  ctx.fillStyle = 'rgba(247,183,201,0.75)'
  ctx.fillRect(120, bottom - 58, 800, 14)
  ctx.restore()
  // Rolled edges: a light tube along the top and bottom hems.
  for (const [y0, y1] of [[top + 4, top - 12]] as const) {
    blurred(ctx, 3, () => {
      ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 16; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(220, y0 + 20); ctx.quadraticCurveTo(512, y1 - 6, 804, y0 + 20); ctx.stroke()
      ctx.strokeStyle = 'rgba(180,150,160,0.35)'; ctx.lineWidth = 6
      ctx.beginPath(); ctx.moveTo(220, y0 + 30); ctx.quadraticCurveTo(512, y1 + 4, 804, y0 + 30); ctx.stroke()
    })
  }
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
  // Soft folds sweeping over the shoulders and down.
  softBatch(ctx, 9, k => {
    for (let i = 0; i < 12; i++) {
      const side = i % 2 ? 1 : -1, x = 512 + side * r.range(240, 780), y = r.range(960, 1200)
      k.strokeStyle = i % 3 ? rgba(fold, 0.5) : rgba(lit, 0.6)
      k.lineWidth = r.range(8, 16)
      k.beginPath(); k.moveTo(x - side * 70, y - 60); k.quadraticCurveTo(x, y, x + side * 50, y + 120); k.stroke()
    }
  })
  // The skin of the chest in the V, shadowed under the collar.
  ctx.beginPath(); ctx.moveTo(400, 896); ctx.lineTo(624, 896); ctx.lineTo(512, 1150); ctx.closePath()
  const cg = ctx.createLinearGradient(0, 900, 0, 1150)
  cg.addColorStop(0, rgba(mixRGB(skin.base, skin.shadow, 0.55))); cg.addColorStop(1, rgba(mixRGB(skin.base, skin.shadow, 0.25)))
  ctx.fillStyle = cg
  ctx.fill()
  blob(ctx, 490, 1000, 40, 70, skin.light, 0.25)
  ctx.restore()
  // The shawl collar: the right lapel first, then the left crossing over it.
  for (const side of [1, -1]) {
    const lapel = (k: Ctx2) => {
      k.beginPath()
      k.moveTo(512 + side * 96, 892)
      k.bezierCurveTo(512 + side * 90, 980, 512 + side * 40, 1080, 512 - side * 34, 1190)
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
      k.beginPath(); k.moveTo(512 + side * 106, 900); k.bezierCurveTo(512 + side * 100, 985, 512 + side * 52, 1080, 512 - side * 22, 1190); k.stroke()
      k.strokeStyle = rgba(fold, 0.55); k.lineWidth = 16
      k.beginPath(); k.moveTo(512 + side * 212, 910); k.bezierCurveTo(512 + side * 190, 1020, 512 + side * 116, 1170, 512 + side * 64, 1340); k.stroke()
    })
    ctx.restore()
  }
  // The collar shades the neck where it stands up behind it.
  softBatch(ctx, 12, k => {
    k.fillStyle = rgba(skin.deep, 0.35)
    k.beginPath(); k.ellipse(512, 890, 110, 22, 0, 0, Math.PI * 2); k.fill()
  }, 'multiply')
  return c
}
type Ctx2 = CanvasRenderingContext2D
