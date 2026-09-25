import { FACE } from '../core/treatments/anatomy.ts'
import { makeRng } from '../core/rng.ts'
import { blob, blurred, canvas, rgba, shade, smoothPath, terry, type RGB } from './paint.ts'

/**
 * Close-up props painted in art space: the warm steam towel draped over the face. It follows the face's
 * form (a lift over the nose, soft dips at the eyes) with rolled edges and terry folds.
 */
export function paintSteamTowel(seed: number, tint: RGB = [255, 250, 247]): HTMLCanvasElement {
  const [c, ctx] = canvas(1024)
  const r = makeRng(seed + 77)
  const top = 300, bottom = 930
  const shape = [182, top + 30, 330, top - 6, 512, top - 14, 694, top - 6, 842, top + 30, 870, 520, 856, 760, 812, bottom, 512, bottom + 22, 212, bottom, 168, 760, 154, 520]
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
  // The face underneath: a lift over the nose, dips at the eyes and mouth, the chin.
  const n = FACE.nose
  blob(ctx, n.x - 18, n.y - 40, 40, 110, [255, 255, 255], 0.7)
  blob(ctx, n.x + 40, n.y - 20, 30, 100, [196, 170, 176], 0.45)
  for (const e of FACE.eyes) blob(ctx, e.x, e.y + 6, 90, 44, [206, 184, 190], 0.4)
  blob(ctx, FACE.lips.x, FACE.lips.y + 10, 90, 30, [210, 188, 194], 0.35)
  blob(ctx, 512, 860, 120, 50, [255, 255, 255], 0.5)
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
  ctx.fillRect(140, bottom - 58, 760, 14)
  ctx.restore()
  // Rolled edges: a light tube along the top and bottom hems.
  for (const [y0, y1] of [[top + 2, top - 10], [bottom - 6, bottom + 10]] as const) {
    blurred(ctx, 3, () => {
      ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 16; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(220, y0 + 20); ctx.quadraticCurveTo(512, y1 - 6, 804, y0 + 20); ctx.stroke()
      ctx.strokeStyle = 'rgba(180,150,160,0.35)'; ctx.lineWidth = 6
      ctx.beginPath(); ctx.moveTo(220, y0 + 30); ctx.quadraticCurveTo(512, y1 + 4, 804, y0 + 30); ctx.stroke()
    })
  }
  return c
}
