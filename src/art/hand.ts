import type { Look } from '../core/customers.ts'
import type { Shape } from '../core/geometry.ts'
import { makeRng } from '../core/rng.ts'
import { HAND, SHAPES, fingerDir, nailOf } from '../core/treatments/anatomy.ts'
import { POLISH_COLORS } from '../core/treatments/types.ts'
import type { HandProfile } from '../core/treatments/profile.ts'
import { SKIN, type SkinTone } from './palette.ts'
import { blob, blurred, canvas, fbm, hex, mixRGB, rgba, shade, tintedByNoise, type Ctx } from './paint.ts'
import type { Crop } from './face.ts'

/**
 * The hand close-up for the manicure, painted in code on the anatomy in core/treatments/anatomy.ts: the
 * hand (skin, knuckles, natural nails), its height map, the layer sheets (old polish, cuticles, scrub,
 * base, colour, top coat...) and the overgrown nail tips that get clipped.
 */
export type HandArt = { base: HTMLCanvasElement; height: HTMLCanvasElement; layers: Record<string, HTMLCanvasElement>; tips: Crop[]; skin: SkinTone }

const S = 1024

export function shapePath(ctx: Ctx, s: Shape) {
  if (s.t === 'ellipse') { ctx.moveTo(s.cx + s.rx, s.cy); ctx.ellipse(s.cx, s.cy, s.rx, s.ry, s.rot ?? 0, 0, Math.PI * 2) }
  else if (s.t === 'poly') { ctx.moveTo(s.pts[0], s.pts[1]); for (let i = 2; i < s.pts.length; i += 2) ctx.lineTo(s.pts[i], s.pts[i + 1]); ctx.closePath() }
  else {
    const a = Math.atan2(s.y1 - s.y0, s.x1 - s.x0)
    const l = Math.hypot(s.x1 - s.x0, s.y1 - s.y0)
    const n = { x: -Math.sin(a), y: Math.cos(a) }
    ctx.moveTo(s.x0 + n.x * s.r0, s.y0 + n.y * s.r0)
    ctx.lineTo(s.x1 + n.x * s.r1, s.y1 + n.y * s.r1)
    ctx.arc(s.x1, s.y1, s.r1, a + Math.PI / 2, a - Math.PI / 2, true)
    ctx.lineTo(s.x0 - n.x * s.r0, s.y0 - n.y * s.r0)
    ctx.arc(s.x0, s.y0, s.r0, a - Math.PI / 2, a + Math.PI / 2, true)
    ctx.closePath()
    void l
  }
}

function fillShapes(ctx: Ctx, shapes: Shape[], style: string) {
  ctx.fillStyle = style
  for (const s of shapes) { ctx.beginPath(); shapePath(ctx, s); ctx.fill() }
}

/** The hand's silhouette as a white-on-transparent canvas, softened at the webbing. */
function silhouette(): HTMLCanvasElement {
  const [c, ctx] = canvas(S)
  const palm: Shape = { t: 'poly', pts: HAND.palm }
  fillShapes(ctx, [palm, ...SHAPES.fingerShapes], '#fff')
  // Webbing between the fingers, so they join the palm smoothly.
  for (let i = 1; i < HAND.fingers.length - 1; i++) {
    const a = HAND.fingers[i], b = HAND.fingers[i + 1]
    ctx.beginPath(); ctx.ellipse((a.base.x + b.base.x) / 2, (a.base.y + b.base.y) / 2 + 26, 40, 34, 0, 0, Math.PI * 2); ctx.fill()
  }
  return c
}

function clipTo(ctx: Ctx, mask: HTMLCanvasElement) {
  ctx.globalCompositeOperation = 'destination-in'
  ctx.drawImage(mask, 0, 0)
  ctx.globalCompositeOperation = 'source-over'
}

function shapesCanvas(shapes: Shape[]) { const [c, ctx] = canvas(S); fillShapes(ctx, shapes, '#fff'); return c }

export function paintHand(look: Look, seed: number, profile: HandProfile): HandArt {
  const grown = profile.grown
  const skin = SKIN[look.skin % SKIN.length]
  const r = makeRng(seed + 400)
  const sil = silhouette()
  const nails = shapesCanvas(SHAPES.nailShapes)

  // ---------------------------------------------------------------- base
  const [base, ctx] = canvas(S)
  // A soft shadow on the towel under the hand.
  blurred(ctx, 26, () => { ctx.globalAlpha = 0.35; ctx.drawImage(sil, 16, 26); ctx.globalCompositeOperation = 'source-in'; ctx.fillStyle = 'rgb(120,80,110)'; ctx.fillRect(0, 0, S, S) })
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
  const [skinC, sctx] = canvas(S)
  const lg = sctx.createLinearGradient(0, 1024, 0, 220)
  lg.addColorStop(0, rgba(mixRGB(skin.base, skin.shadow, 0.35))); lg.addColorStop(0.5, rgba(skin.base)); lg.addColorStop(1, rgba(mixRGB(skin.base, skin.light, 0.3)))
  sctx.fillStyle = lg
  sctx.fillRect(0, 0, S, S)
  sctx.globalCompositeOperation = 'soft-light'
  sctx.globalAlpha = 0.3
  sctx.drawImage(fbm(S, 50, 4, seed + 1), 0, 0)
  sctx.globalAlpha = 1
  sctx.globalCompositeOperation = 'source-over'
  blob(sctx, 540, 760, 200, 170, skin.light, 0.4)
  // Fingers: rounded like cylinders, lit from the top left, warm at the tips.
  for (const f of HAND.fingers) {
    const d = fingerDir(f)
    const n = { x: -d.y, y: d.x }
    const mid = { x: (f.base.x + f.tip.x) / 2, y: (f.base.y + f.tip.y) / 2 }
    const g = sctx.createLinearGradient(mid.x - n.x * f.r0, mid.y - n.y * f.r0, mid.x + n.x * f.r0, mid.y + n.y * f.r0)
    g.addColorStop(0, rgba(skin.shadow, 0.55)); g.addColorStop(0.35, rgba(skin.light, 0.35)); g.addColorStop(0.65, rgba(skin.base, 0)); g.addColorStop(1, rgba(skin.shadow, 0.6))
    sctx.fillStyle = g
    sctx.beginPath(); shapePath(sctx, { t: 'capsule', x0: f.base.x, y0: f.base.y, x1: f.tip.x, y1: f.tip.y, r0: f.r0, r1: f.r1 }); sctx.fill()
    blob(sctx, f.tip.x - d.x * 20, f.tip.y - d.y * 20, f.r1 * 1.1, f.r1 * 1.1, skin.blush, 0.3)
    // Knuckle creases: two joints on each finger (one on the thumb).
    const joints = f.name === 'thumb' ? [0.5] : [0.42, 0.7]
    for (const t of joints) {
      const jx = f.base.x + (f.tip.x - f.base.x) * t, jy = f.base.y + (f.tip.y - f.base.y) * t
      blob(sctx, jx, jy, f.r0 * 0.7, f.r0 * 0.45, skin.light, 0.25)
      sctx.strokeStyle = rgba(skin.deep, 0.28)
      sctx.lineWidth = 1.6
      for (let k = -1; k <= 1; k++) {
        const off = k * 6
        const w = f.r0 * (0.55 - Math.abs(k) * 0.12)
        sctx.beginPath()
        sctx.moveTo(jx + d.x * off - n.x * w, jy + d.y * off - n.y * w)
        sctx.quadraticCurveTo(jx + d.x * (off - 5), jy + d.y * (off - 5), jx + d.x * off + n.x * w, jy + d.y * off + n.y * w)
        sctx.stroke()
      }
    }
  }
  // Knuckles on the back of the hand, and faint tendons toward the wrist.
  for (const f of HAND.fingers.slice(1)) {
    blob(sctx, f.base.x, f.base.y + 20, 34, 24, skin.light, 0.4)
    blob(sctx, f.base.x + 10, f.base.y + 36, 28, 16, skin.shadow, 0.2)
    blurred(sctx, 6, () => { sctx.strokeStyle = rgba(skin.light, 0.25); sctx.lineWidth = 10; sctx.beginPath(); sctx.moveTo(f.base.x, f.base.y + 40); sctx.quadraticCurveTo(f.base.x * 0.7 + 512 * 0.3, 850, 512 + (f.base.x - 512) * 0.4, 1024); sctx.stroke() })
  }
  blurred(sctx, 3, () => { sctx.strokeStyle = 'rgba(120,140,190,0.10)'; sctx.lineWidth = 5; sctx.beginPath(); sctx.moveTo(470, 1024); sctx.bezierCurveTo(480, 900, 540, 820, 560, 740); sctx.stroke() })
  // Darker where fingers meet, and around the whole edge.
  for (let i = 1; i < HAND.fingers.length - 1; i++) {
    const a = HAND.fingers[i], b = HAND.fingers[i + 1]
    blob(sctx, (a.base.x + b.base.x) / 2, (a.base.y + b.base.y) / 2 - 6, 18, 30, skin.deep, 0.45)
  }
  // Natural nails: pink beds, a pale half-moon, a white free edge and a gloss stripe.
  for (const f of HAND.fingers) {
    const nl = nailOf(f)
    const shape: Shape = { t: 'capsule', x0: nl.base.x, y0: nl.base.y, x1: nl.tip.x, y1: nl.tip.y, r0: nl.halfWidth * 0.94, r1: nl.halfWidth }
    sctx.save()
    sctx.beginPath(); shapePath(sctx, shape); sctx.clip()
    sctx.fillStyle = rgba(mixRGB(skin.base, [242, 176, 180], 0.55))
    sctx.fillRect(0, 0, S, S)
    blob(sctx, nl.base.x + nl.dir.x * 8, nl.base.y + nl.dir.y * 8, nl.halfWidth * 0.8, nl.halfWidth * 0.55, [255, 236, 236], 0.8)
    const e = { x: nl.tip.x - nl.dir.x * 6, y: nl.tip.y - nl.dir.y * 6 }
    blob(sctx, e.x, e.y, nl.halfWidth * 1.1, 14, [255, 250, 246], 0.9, 0.4)
    sctx.restore()
    sctx.strokeStyle = rgba(skin.deep, 0.35)
    sctx.lineWidth = 2.5
    sctx.beginPath(); shapePath(sctx, shape); sctx.stroke()
    blurred(sctx, 2, () => {
      sctx.strokeStyle = 'rgba(255,255,255,0.7)'; sctx.lineWidth = 5
      const off = -nl.halfWidth * 0.35
      sctx.beginPath()
      sctx.moveTo(nl.base.x + nl.dir.x * 16 - nl.dir.y * off, nl.base.y + nl.dir.y * 16 + nl.dir.x * off)
      sctx.lineTo(nl.tip.x - nl.dir.x * 16 - nl.dir.y * off, nl.tip.y - nl.dir.y * 16 + nl.dir.x * off)
      sctx.stroke()
    })
  }
  // Broken nails: a jagged missing corner and a hairline crack.
  for (const i of profile.broken) {
    const nl = nailOf(HAND.fingers[i])
    const side = i % 2 ? 1 : -1
    const tx = nl.tip.x - nl.dir.x * 14, ty = nl.tip.y - nl.dir.y * 14
    sctx.fillStyle = rgba(mixRGB(skin.base, skin.blush, 0.35))
    sctx.beginPath()
    sctx.moveTo(tx - nl.dir.y * side * nl.halfWidth, ty + nl.dir.x * side * nl.halfWidth)
    sctx.lineTo(tx + nl.dir.x * 20 - nl.dir.y * side * nl.halfWidth, ty + nl.dir.y * 20 + nl.dir.x * side * nl.halfWidth)
    sctx.lineTo(tx + nl.dir.x * 20 + nl.dir.y * side * 4, ty + nl.dir.y * 20 - nl.dir.x * side * 4)
    sctx.lineTo(tx + nl.dir.x * 6 - nl.dir.y * side * 6, ty + nl.dir.y * 6 + nl.dir.x * side * 6)
    sctx.closePath(); sctx.fill()
    sctx.strokeStyle = rgba(skin.deep, 0.55); sctx.lineWidth = 1.6
    sctx.beginPath(); sctx.moveTo(tx - nl.dir.y * side * 4, ty + nl.dir.x * side * 4); sctx.lineTo(tx - nl.dir.x * 26 + nl.dir.y * side * 8, ty - nl.dir.y * 26 - nl.dir.x * side * 8); sctx.stroke()
  }
  // A soft darker rim around the whole hand, for roundness.
  const [rim, rctx] = canvas(S)
  rctx.drawImage(sil, 0, 0)
  rctx.globalCompositeOperation = 'source-out'
  rctx.fillStyle = rgba(skin.shadow)
  rctx.fillRect(0, 0, S, S)
  blurred(sctx, 16, () => { sctx.globalAlpha = 0.9; sctx.drawImage(rim, 0, 0) })
  clipTo(sctx, sil)
  ctx.drawImage(skinC, 0, 0)

  // ---------------------------------------------------------------- height
  const [height, hctx] = canvas(S)
  hctx.fillStyle = '#000'
  hctx.fillRect(0, 0, S, S)
  blurred(hctx, 22, () => hctx.drawImage(sil, 0, 0))
  hctx.globalCompositeOperation = 'multiply'
  hctx.drawImage(sil, 0, 0)
  hctx.globalCompositeOperation = 'source-over'
  for (const f of HAND.fingers) {
    const d = fingerDir(f)
    const joints = f.name === 'thumb' ? [0.5] : [0.42, 0.7]
    for (const t of joints) blob(hctx, f.base.x + (f.tip.x - f.base.x) * t, f.base.y + (f.tip.y - f.base.y) * t, f.r0 * 0.6, f.r0 * 0.4, [255, 255, 255], 0.25)
    blob(hctx, f.base.x, f.base.y + 20, 30, 22, [255, 255, 255], 0.3)
    void d
  }
  blurred(hctx, 1.5, () => { hctx.globalAlpha = 0.5; hctx.drawImage(nails, 0, 0) })
  hctx.globalAlpha = 1
  for (let i = 0; i < 9000; i++) {
    hctx.fillStyle = `rgba(0,0,0,${r.range(0.1, 0.3)})`
    hctx.beginPath(); hctx.arc(r.range(180, 780), r.range(220, 1024), r.range(0.7, 1.5), 0, Math.PI * 2); hctx.fill()
  }

  // ---------------------------------------------------------------- layers
  const handMask = sil
  const cuticleMask = shapesCanvas(SHAPES.cuticleShapes)
  const tipsMask = shapesCanvas(SHAPES.tipShapes)
  const layer = (mask: HTMLCanvasElement, draw: (ctx: Ctx) => void) => { const [c, lctx] = canvas(S); draw(lctx); clipTo(lctx, mask); return c }
  const layers: Record<string, HTMLCanvasElement> = {
    wet: layer(handMask, l => {
      l.drawImage(tintedByNoise(S, [214, 238, 255], fbm(S, 40, 3, seed + 2), 0.12, 0.35), 0, 0)
      for (let i = 0; i < 160; i++) { const x = r.range(200, 780), y = r.range(260, 1000), rr = r.range(3, 9); blob(l, x, y, rr, rr, [255, 255, 255], 0.7, 0.5) }
    }),
    dull: layer(nails, l => {
      l.drawImage(tintedByNoise(S, [244, 232, 230], fbm(S, 10, 3, seed + 3), 0.4, 0.7), 0, 0)
      l.strokeStyle = 'rgba(255,255,255,0.35)'; l.lineWidth = 1
      for (let i = 0; i < 400; i++) { const x = r.range(180, 760), y = r.range(200, 700); l.beginPath(); l.moveTo(x, y); l.lineTo(x + r.range(-12, 12), y + r.range(-4, 4)); l.stroke() }
    }),
    oldPolish: layer(nails, l => {
      const p = profile.polish
      if (!p) return
      const c1 = hex(POLISH_COLORS[p.color].hex), c2 = hex(POLISH_COLORS[p.second].hex)
      HAND.fingers.forEach((f, i) => {
        const nl = nailOf(f)
        const base = p.pattern === 'french' ? mixRGB(skin.base, [250, 214, 214], 0.6) : p.pattern === 'twoTone' && i % 2 ? c2 : c1
        l.fillStyle = rgba(shade(base, -0.08))
        l.beginPath(); shapePath(l, { t: 'capsule', x0: nl.base.x, y0: nl.base.y, x1: nl.tip.x, y1: nl.tip.y, r0: nl.halfWidth + 4, r1: nl.halfWidth + 4 }); l.fill()
        if (p.pattern === 'french') { l.fillStyle = '#fbf7f2'; l.beginPath(); l.ellipse(nl.tip.x - nl.dir.x * 4, nl.tip.y - nl.dir.y * 4, nl.halfWidth + 6, 16, Math.atan2(nl.dir.y, nl.dir.x) + Math.PI / 2, 0, Math.PI * 2); l.fill() }
        if (p.pattern === 'dots') for (let k = 0; k < 6; k++) { l.fillStyle = 'rgba(255,255,255,0.9)'; l.beginPath(); l.arc(nl.base.x + (nl.tip.x - nl.base.x) * r.range(0.2, 0.9) + r.range(-12, 12), nl.base.y + (nl.tip.y - nl.base.y) * r.range(0.2, 0.9) + r.range(-8, 8), 4, 0, Math.PI * 2); l.fill() }
        if (p.pattern === 'glitter') for (let k = 0; k < 40; k++) { l.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.9)' : rgba(shade(c1, 0.5), 0.9); l.fillRect(nl.base.x + (nl.tip.x - nl.base.x) * r() + r.range(-18, 18), nl.base.y + (nl.tip.y - nl.base.y) * r() + r.range(-12, 12), 2.5, 2.5) }
      })
      l.globalCompositeOperation = 'soft-light'
      l.drawImage(fbm(S, 16, 3, seed + 4), 0, 0)
      l.globalCompositeOperation = 'source-over'
      l.strokeStyle = 'rgba(255,255,255,0.25)'; l.lineWidth = 1.2
      for (let i = 0; i < 200; i++) { const x = r.range(180, 760), y = r.range(200, 700); l.beginPath(); l.moveTo(x, y); l.lineTo(x + r.range(-14, 14), y + r.range(-6, 6)); l.stroke() }
    }),
    dirt: layer(tipsMask, l => {
      l.drawImage(tintedByNoise(S, [110, 92, 74], fbm(S, 8, 3, seed + 6), 0.55, 0.95), 0, 0)
      for (let i = 0; i < 500; i++) { l.fillStyle = rgba([72, 58, 46], r.range(0.4, 0.9)); l.fillRect(r.range(160, 800), r.range(200, 700), r.range(1.5, 3.5), r.range(1.5, 3.5)) }
    }),
    dry: layer(handMask, l => {
      l.drawImage(tintedByNoise(S, [246, 232, 224], fbm(S, 20, 3, seed + 7), 0.3, 0.7), 0, 0)
      l.strokeStyle = 'rgba(190,150,140,0.45)'; l.lineWidth = 1.2
      for (let i = 0; i < 260; i++) { let x = r.range(200, 780), y = r.range(300, 1000); l.beginPath(); l.moveTo(x, y); for (let k = 0; k < 3; k++) { x += r.range(-10, 10); y += r.range(-8, 8); l.lineTo(x, y) } l.stroke() }
      for (let i = 0; i < 700; i++) { l.fillStyle = rgba([255, 250, 246], r.range(0.5, 0.95)); l.fillRect(r.range(200, 780), r.range(300, 1000), r.range(2, 4), r.range(1.5, 3)) }
    }),
    rough: layer(tipsMask, l => {
      for (let i = 0; i < 900; i++) { l.fillStyle = `rgba(${r() < 0.5 ? '255,250,246' : '236,224,218'},${r.range(0.5, 1)})`; l.fillRect(r.range(160, 800), r.range(200, 640), r.range(2, 5), r.range(2, 5)) }
    }),
    cuticle: layer(cuticleMask, l => {
      l.drawImage(tintedByNoise(S, mixRGB(skin.base, [250, 226, 220], 0.6), fbm(S, 8, 3, seed + 5), 0.55, 0.95), 0, 0)
      for (let i = 0; i < 300; i++) { l.fillStyle = 'rgba(255,245,240,0.8)'; l.fillRect(r.range(160, 800), r.range(200, 760), 2, 2) }
    }),
    scrub: layer(handMask, l => {
      l.fillStyle = 'rgba(244,222,206,0.9)'
      l.fillRect(0, 0, S, S)
      for (let i = 0; i < 6000; i++) {
        const x = r.range(150, 820), y = r.range(200, 1024)
        l.fillStyle = r() < 0.5 ? `rgba(255,252,246,${r.range(0.6, 1)})` : `rgba(226,176,120,${r.range(0.5, 0.9)})`
        l.fillRect(x, y, r.range(2, 4.5), r.range(2, 4.5))
      }
    }),
    base: layer(nails, l => { l.fillStyle = 'rgba(255,250,252,0.28)'; l.fillRect(0, 0, S, S) }),
    color: layer(nails, l => {
      l.fillStyle = '#ffffff'
      l.fillRect(0, 0, S, S)
      l.strokeStyle = 'rgba(210,210,210,0.35)'; l.lineWidth = 2
      for (const f of HAND.fingers) {
        const nl = nailOf(f)
        for (let k = -2; k <= 2; k++) { const off = k * nl.halfWidth * 0.35; l.beginPath(); l.moveTo(nl.base.x - nl.dir.y * off, nl.base.y + nl.dir.x * off); l.lineTo(nl.tip.x - nl.dir.y * off, nl.tip.y + nl.dir.x * off); l.stroke() }
        blob(l, nl.base.x + (nl.tip.x - nl.base.x) * 0.5, nl.base.y + (nl.tip.y - nl.base.y) * 0.5, nl.halfWidth, nl.halfWidth * 1.6, [255, 255, 255], 0.4)
      }
    }),
    top: layer(nails, l => { l.fillStyle = 'rgba(255,255,255,0.2)'; l.fillRect(0, 0, S, S) }),
  }

  // ---------------------------------------------------------------- tips to clip
  const tips = HAND.fingers.map((f, i) => {
    const nl = nailOf(f)
    const len = Math.max(12, grown[i])
    const w = nl.halfWidth * 2 + 20, h = len + 30
    const [c, tctx] = canvas(Math.ceil(w), Math.ceil(h))
    // Drawn pointing up; the view rotates it to the finger's direction.
    tctx.translate(w / 2, h - 6)
    tctx.beginPath()
    tctx.moveTo(-nl.halfWidth * 0.96, 0)
    tctx.bezierCurveTo(-nl.halfWidth * 0.98, -len * 0.6, -nl.halfWidth * 0.7, -len, 0, -len)
    tctx.bezierCurveTo(nl.halfWidth * 0.7, -len, nl.halfWidth * 0.98, -len * 0.6, nl.halfWidth * 0.96, 0)
    tctx.closePath()
    const g = tctx.createLinearGradient(0, 0, 0, -len)
    g.addColorStop(0, 'rgba(255,250,246,0.95)'); g.addColorStop(1, 'rgba(246,236,230,0.85)')
    tctx.fillStyle = g
    tctx.fill()
    tctx.strokeStyle = 'rgba(210,190,184,0.8)'; tctx.lineWidth = 2; tctx.stroke()
    tctx.fillStyle = 'rgba(255,255,255,0.8)'; tctx.fillRect(-nl.halfWidth * 0.5, -len * 0.8, 4, len * 0.6)
    return { canvas: c, x: 0, y: 0 }
  })
  return { base, height, layers, tips, skin }
}

