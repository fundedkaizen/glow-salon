import { FACE } from '../core/treatments/anatomy.ts'
import { makeRng } from '../core/rng.ts'
import { blob, blurred, canvas, rgba, shade, smoothPath, terry, type RGB } from './paint.ts'

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
