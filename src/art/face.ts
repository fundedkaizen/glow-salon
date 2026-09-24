import type { Look } from '../core/customers.ts'
import { FACE, SHAPES } from '../core/treatments/anatomy.ts'
import { makeRng } from '../core/rng.ts'
import type { FaceProfile } from '../core/treatments/profile.ts'
import type { Shape } from '../core/geometry.ts'
import { HAIR, OUTFIT, SKIN, type SkinTone } from './palette.ts'
import { blob, blurred, canvas, fbm, hex, mixRGB, rgba, shade, smoothPath, taper, terry, tintedByNoise, type Ctx, type RGB } from './paint.ts'

/**
 * The face close-up, painted in code: the base (skin, hair, headband, towel), a height map for the skin
 * shader's pores and form, one art sheet per treatment layer, and the expression overlays (eyes, brows,
 * mouth) that crossfade as the customer reacts. Everything lines up with core/treatments/anatomy.ts.
 */
export type Crop = { canvas: HTMLCanvasElement; x: number; y: number }
export type EyeState = 'open' | 'wide' | 'closed' | 'squeeze' | 'happy'
export type BrowState = 'relaxed' | 'worried' | 'happy'
export type MouthState = 'neutral' | 'smile' | 'wince' | 'beam' | 'o'

export type FaceArt = {
  base: HTMLCanvasElement
  height: HTMLCanvasElement
  layers: Record<string, HTMLCanvasElement>
  /** The clay mask once dry (the mask layer crossfades to it). */
  maskDry: HTMLCanvasElement
  eyes: Record<EyeState, Crop>
  brows: Record<BrowState, Crop>
  mouth: Record<MouthState, Crop>
  skin: SkinTone
}

const S = 1024

function faceClip(ctx: Ctx) {
  ctx.beginPath()
  smoothPath(ctx, FACE.outline)
  ctx.clip()
}

/** Clip to the skin region: the face minus hair, eyes, brows and lips (the layers live here). */
function skinClip(ctx: Ctx) {
  faceClip(ctx)
  ctx.beginPath()
  ctx.rect(0, 0, S, S)
  const hole = (s: Shape) => {
    if (s.t !== 'ellipse') return
    ctx.moveTo(s.cx + s.rx, s.cy)
    ctx.ellipse(s.cx, s.cy, s.rx, s.ry, s.rot ?? 0, 0, Math.PI * 2, true)
  }
  hole(FACE.hairCap)
  for (const s of SHAPES.eyeShapes) hole(s)
  for (const s of SHAPES.browShapes) hole(s)
  hole(SHAPES.lipShape)
  ctx.clip('evenodd')
}

/** Iris colours: brown, hazel, green, blue, grey. */
const IRIS: RGB[] = [[112, 70, 44], [150, 110, 60], [96, 132, 84], [92, 136, 190], [120, 130, 146]]

/** Per-customer feature shape, from the profile (all 0 to 1). */
type Feat = { brow: number; lips: number; lashes: number; blush: number; nose: number; iris: RGB }

export function paintFace(look: Look, seed: number, profile: FaceProfile): FaceArt {
  const skin = SKIN[look.skin % SKIN.length]
  const hair = HAIR[look.hair % HAIR.length]
  const band = hex(OUTFIT[look.outfit % OUTFIT.length])
  const feat: Feat = { ...profile.features, iris: IRIS[makeRng(seed + 17).int(0, IRIS.length - 1)] }
  const base = paintBase(look, skin, hair, band, seed, profile, feat)
  const height = paintHeight(seed)
  const layers = paintLayers(skin, seed)
  const maskDry = paintClay(true, seed)
  const eye = (st: EyeState) => eyeCrop(st, hair.dark, skin, feat)
  const eyes = { open: eye('open'), wide: eye('wide'), closed: eye('closed'), squeeze: eye('squeeze'), happy: eye('happy') }
  const brows = { relaxed: browCrop('relaxed', hair, seed, feat), worried: browCrop('worried', hair, seed, feat), happy: browCrop('happy', hair, seed, feat) }
  const m = (st: MouthState) => mouthCrop(st, skin, feat)
  const mouth = { neutral: m('neutral'), smile: m('smile'), wince: m('wince'), beam: m('beam'), o: m('o') }
  return { base, height, layers, maskDry, eyes, brows, mouth, skin }
}

// ------------------------------------------------------------------ base

function paintBase(look: Look, skin: SkinTone, hair: typeof HAIR[number], band: RGB, seed: number, profile: FaceProfile, feat: Feat) {
  const [c, ctx] = canvas(S)
  const r = makeRng(seed)
  // Hair spread on the pillow behind the head.
  const hairShape = [512, 36, 700, 60, 850, 170, 930, 360, 948, 560, 920, 760, 850, 930, 760, 1010, 640, 1024, 384, 1024, 264, 1010, 174, 930, 104, 760, 76, 560, 94, 360, 174, 170, 324, 60]
  ctx.save()
  ctx.beginPath()
  smoothPath(ctx, hairShape)
  const hg = ctx.createRadialGradient(512, 420, 120, 512, 520, 560)
  hg.addColorStop(0, rgba(hair.base))
  hg.addColorStop(0.7, rgba(mixRGB(hair.base, hair.dark, 0.35)))
  hg.addColorStop(1, rgba(hair.dark))
  ctx.fillStyle = hg
  ctx.fill()
  ctx.clip()
  // Strands flowing out from the crown, with light and dark variation.
  for (let i = 0; i < 900; i++) {
    const a = r.range(-Math.PI * 0.95, Math.PI * 0.95) - Math.PI / 2
    const len = r.range(260, 560)
    const x0 = 512 + Math.cos(a) * r.range(40, 160), y0 = 300 + Math.sin(a) * r.range(20, 120)
    const bend = r.range(-0.35, 0.35)
    const x1 = 512 + Math.cos(a + bend * 0.3) * len * 1.05, y1 = 330 + Math.sin(a + bend * 0.3) * len + Math.max(0, Math.cos(a)) * 0
    const cx = (x0 + x1) / 2 + Math.cos(a + Math.PI / 2) * len * bend * 0.4, cy = (y0 + y1) / 2 + Math.sin(a + Math.PI / 2) * len * bend * 0.4
    const tone = r() < 0.45 ? hair.light : r() < 0.5 ? hair.dark : hair.base
    ctx.strokeStyle = rgba(tone, r.range(0.12, 0.32))
    ctx.lineWidth = r.range(1.5, 4.5)
    ctx.beginPath()
    ctx.moveTo(x0, y0)
    ctx.quadraticCurveTo(cx, cy, x1, y1)
    ctx.stroke()
  }
  // A soft sheen band across the crown.
  blurred(ctx, 26, () => {
    ctx.globalCompositeOperation = 'screen'
    ctx.strokeStyle = rgba(hair.light, 0.35)
    ctx.lineWidth = 60
    ctx.beginPath()
    ctx.ellipse(512, 330, 330, 250, 0, Math.PI * 1.1, Math.PI * 1.9)
    ctx.stroke()
  })
  ctx.restore()

  // Neck, shadowed under the jaw.
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(404, 780); ctx.lineTo(620, 780); ctx.bezierCurveTo(630, 900, 660, 960, 690, 1024); ctx.lineTo(334, 1024); ctx.bezierCurveTo(364, 960, 394, 900, 404, 780)
  ctx.closePath()
  const ng = ctx.createLinearGradient(0, 800, 0, 1024)
  ng.addColorStop(0, rgba(skin.shadow)); ng.addColorStop(0.5, rgba(mixRGB(skin.base, skin.shadow, 0.45))); ng.addColorStop(1, rgba(skin.base))
  ctx.fillStyle = ng
  ctx.fill()
  ctx.clip()
  blob(ctx, 512, 840, 190, 70, skin.deep, 0.5)
  ctx.restore()

  // Towel wrapped at the shoulders: fluffy terry with a pastel stripe.
  ctx.save()
  const towel = [150, 1024, 180, 968, 260, 944, 360, 958, 440, 986, 512, 996, 584, 986, 664, 958, 764, 944, 844, 968, 874, 1024]
  ctx.beginPath()
  ctx.moveTo(150, 1030)
  for (let i = 2; i < towel.length; i += 2) ctx.lineTo(towel[i], towel[i + 1])
  ctx.lineTo(874, 1030)
  ctx.closePath()
  ctx.fillStyle = '#fbf6f2'
  ctx.fill()
  ctx.clip()
  terry(ctx, 150, 930, 724, 100, [240, 232, 228], seed + 3, 0.02)
  ctx.fillStyle = rgba(band, 0.55)
  ctx.fillRect(150, 1000, 724, 10)
  blurred(ctx, 10, () => { ctx.strokeStyle = 'rgba(160,130,140,0.35)'; ctx.lineWidth = 16; ctx.beginPath(); ctx.moveTo(180, 968); for (let i = 2; i < towel.length - 2; i += 2) ctx.lineTo(towel[i], towel[i + 1]); ctx.stroke() })
  ctx.restore()

  // Ears.
  for (const [i, e] of FACE.ears.entries()) {
    const side = i === 0 ? -1 : 1
    ctx.save()
    ctx.beginPath()
    ctx.ellipse(e.x, e.y, 44, 80, side * 0.12, 0, Math.PI * 2)
    const eg = ctx.createRadialGradient(e.x - side * 6, e.y, 10, e.x, e.y, 84)
    eg.addColorStop(0, rgba(skin.base)); eg.addColorStop(0.7, rgba(mixRGB(skin.base, skin.blush, 0.3))); eg.addColorStop(1, rgba(skin.shadow))
    ctx.fillStyle = eg
    ctx.fill()
    ctx.clip()
    blurred(ctx, 5, () => {
      ctx.strokeStyle = rgba(skin.deep, 0.45)
      ctx.lineWidth = 7
      ctx.beginPath()
      ctx.ellipse(e.x + side * 6, e.y + 4, 22, 52, side * 0.12, -Math.PI * 0.6, Math.PI * 0.8)
      ctx.stroke()
    })
    blob(ctx, e.x + side * 10, e.y + 10, 16, 26, skin.deep, 0.4)
    ctx.restore()
  }

  // The face.
  ctx.save()
  ctx.beginPath()
  smoothPath(ctx, FACE.outline)
  const fg = ctx.createRadialGradient(492, 470, 40, 512, 540, 430)
  fg.addColorStop(0, rgba(skin.light))
  fg.addColorStop(0.45, rgba(skin.base))
  fg.addColorStop(0.82, rgba(mixRGB(skin.base, skin.shadow, 0.5)))
  fg.addColorStop(1, rgba(skin.shadow))
  ctx.fillStyle = fg
  ctx.fill()
  ctx.clip()
  // Form: a darker rim, and a warm subsurface band just inside it.
  blurred(ctx, 34, () => { ctx.strokeStyle = rgba(skin.shadow, 0.75); ctx.lineWidth = 90; ctx.beginPath(); smoothPath(ctx, FACE.outline); ctx.stroke() })
  blurred(ctx, 22, () => { ctx.strokeStyle = rgba(skin.blush, 0.28); ctx.lineWidth = 60; ctx.beginPath(); smoothPath(ctx, FACE.outline.map((v, i) => (i % 2 ? 520 + (v - 520) * 0.9 : 512 + (v - 512) * 0.9))); ctx.stroke() })
  // Soft skin mottling.
  ctx.globalCompositeOperation = 'soft-light'
  ctx.globalAlpha = 0.35
  ctx.drawImage(fbm(S, 64, 4, seed + 11), 0, 0)
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
  for (const [i, e] of FACE.eyes.entries()) {
    const side = i === 0 ? -1 : 1
    blob(ctx, e.x, e.y - 4, 104, 60, skin.shadow, 0.42)
    blob(ctx, e.x + side * 10, e.y + 30, 70, 26, skin.shadow, 0.2)
    blob(ctx, e.x, e.y - 24, 58, 18, skin.light, 0.5)
    blob(ctx, e.x - side * 6, e.y - 66, 80, 22, skin.light, 0.34)
    blob(ctx, e.x + side * 118, e.y - 80, 70, 110, skin.shadow, 0.24)
  }
  // Nose: bridge light, side shadows, the tip's ball, wings, nostrils, the shadow under it.
  const n = FACE.nose
  blob(ctx, 512, 552, 20, 90, skin.light, 0.55)
  blob(ctx, 474, 584, 22, 86, skin.shadow, 0.34)
  blob(ctx, 550, 584, 22, 86, skin.shadow, 0.34)
  blob(ctx, 512, n.y - 4, 44 + feat.nose * 12, 36 + feat.nose * 8, skin.shadow, 0.25)
  blob(ctx, 512, n.y - 6, 40, 32, skin.blush, 0.18)
  blob(ctx, 506, n.y - 14, 20, 14, skin.light, 0.85)
  blob(ctx, 472, n.y + 16, 26, 22, skin.shadow, 0.45)
  blob(ctx, 552, n.y + 16, 26, 22, skin.shadow, 0.45)
  blob(ctx, 468, n.y + 8, 10, 8, skin.light, 0.5)
  blob(ctx, 556, n.y + 8, 10, 8, skin.light, 0.5)
  blurred(ctx, 2.5, () => {
    ctx.fillStyle = rgba(skin.deep, 0.85)
    ctx.beginPath(); ctx.ellipse(490, n.y + 30, 13, 6.5, 0.35, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.ellipse(534, n.y + 30, 13, 6.5, -0.35, 0, Math.PI * 2); ctx.fill()
  })
  blob(ctx, 512, n.y + 50, 58, 14, skin.shadow, 0.4)
  // Philtrum, chin, cheeks, forehead.
  blob(ctx, 512, 712, 14, 26, skin.light, 0.35)
  blob(ctx, 498, 712, 6, 24, skin.shadow, 0.25)
  blob(ctx, 526, 712, 6, 24, skin.shadow, 0.25)
  blob(ctx, 512, 818, 70, 16, skin.shadow, 0.35)
  blob(ctx, 512, 866, 58, 30, skin.light, 0.4)
  for (const x of [362, 662]) {
    blob(ctx, x, 664, 118, 84, skin.blush, 0.24 + feat.blush * 0.26)
    blob(ctx, x + (x < 512 ? 8 : -8), 604, 74, 26, skin.light, 0.34)
  }
  blob(ctx, 512, 392, 170, 64, skin.light, 0.42)
  blob(ctx, 512, 320, 260, 40, skin.shadow, 0.3)
  if (look.freckles) {
    for (let i = 0; i < 70; i++) {
      const side = r() < 0.5 ? -1 : 1
      const x = 512 + side * r.range(20, 180), y = r.range(560, 680) - Math.abs(x - 512) * 0.1
      ctx.fillStyle = rgba(skin.deep, r.range(0.18, 0.4))
      ctx.beginPath(); ctx.arc(x, y, r.range(1.8, 4), 0, Math.PI * 2); ctx.fill()
    }
  }
  // Fine lines with age: forehead, crow's feet, smile lines.
  if (profile.age > 0.05) {
    const a = profile.age
    ctx.lineCap = 'round'
    blurred(ctx, 1.6, () => {
      ctx.strokeStyle = rgba(skin.deep, 0.22 * a)
      ctx.lineWidth = 2.4
      for (const [y, w] of [[372, 150], [396, 170], [420, 120]] as const) { ctx.beginPath(); ctx.moveTo(512 - w, y + 6); ctx.quadraticCurveTo(512, y - 8, 512 + w, y + 6); ctx.stroke() }
      for (const [i, e] of FACE.eyes.entries()) {
        const side = i === 0 ? -1 : 1
        for (const k of [-1, 0, 1]) { ctx.beginPath(); ctx.moveTo(e.x + side * 84, e.y + k * 10); ctx.lineTo(e.x + side * 104, e.y + k * 16 - 2); ctx.stroke() }
      }
      ctx.strokeStyle = rgba(skin.deep, 0.3 * a)
      ctx.lineWidth = 3
      for (const side of [-1, 1]) { ctx.beginPath(); ctx.moveTo(512 + side * 52, 676); ctx.quadraticCurveTo(512 + side * 96, 716, 512 + side * 92, 780); ctx.stroke() }
    })
  }
  // Peach fuzz catching the light along the edge of the face.
  ctx.globalCompositeOperation = 'screen'
  const out = FACE.outline
  for (let i = 0; i < 700; i++) {
    const k = r.int(0, out.length / 2 - 1)
    const x = out[k * 2], y = out[k * 2 + 1]
    const dx = x - 512, dy = y - 520, l = Math.hypot(dx, dy)
    const inset = r.range(4, 26)
    const px = x - (dx / l) * inset, py = y - (dy / l) * inset
    ctx.strokeStyle = rgba(skin.light, r.range(0.12, 0.3))
    ctx.lineWidth = 0.8
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + (dx / l) * 7 + r.range(-2, 2), py + (dy / l) * 7 + r.range(-2, 2)); ctx.stroke()
  }
  ctx.restore()
  // A thin, warm contour: darker than the skin, never black, heavier on the shadow side.
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.strokeStyle = rgba(mixRGB(skin.deep, skin.shadow, 0.3), 0.55)
  ctx.lineWidth = 3
  ctx.beginPath(); smoothPath(ctx, FACE.outline); ctx.stroke()
  ctx.strokeStyle = rgba(skin.deep, 0.35)
  ctx.lineWidth = 2.5
  ctx.beginPath(); smoothPath(ctx, FACE.outline.map((v, i) => (i % 2 === 0 ? v + 2 : v + 2))); ctx.stroke()
  ctx.restore()

  // Hairline: soft shadow and wisps of hair over the top of the forehead.
  ctx.save()
  faceClip(ctx)
  blurred(ctx, 16, () => { ctx.fillStyle = rgba(skin.deep, 0.35); ctx.beginPath(); ctx.ellipse(512, 214, 380, 150, 0, 0, Math.PI * 2); ctx.fill() })
  ctx.fillStyle = rgba(hair.base)
  ctx.beginPath(); ctx.ellipse(512, 196, 372, 132, 0, 0, Math.PI * 2); ctx.fill()
  for (let i = 0; i < 160; i++) {
    const x = r.range(180, 844)
    const y0 = 196 + 132 * Math.sqrt(Math.max(0, 1 - ((x - 512) / 372) ** 2)) - 8
    ctx.strokeStyle = rgba(r() < 0.5 ? hair.base : hair.dark, r.range(0.3, 0.7))
    ctx.lineWidth = r.range(1, 2.4)
    ctx.beginPath(); ctx.moveTo(x, y0 - 20); ctx.quadraticCurveTo(x + r.range(-10, 10), y0, x + r.range(-14, 14), y0 + r.range(4, 16)); ctx.stroke()
  }
  ctx.restore()

  paintHeadband(ctx, band, seed)
  return c
}

/** The spa headband: a terry band across the hairline with a cute knotted bow. */
function paintHeadband(ctx: Ctx, band: RGB, seed: number) {
  const light = shade(band, 0.35), dark = shade(band, -0.22)
  ctx.save()
  const path = () => {
    ctx.beginPath()
    ctx.moveTo(150, 348)
    ctx.quadraticCurveTo(512, 140, 874, 348)
    ctx.lineTo(852, 432)
    ctx.quadraticCurveTo(512, 262, 172, 432)
    ctx.closePath()
  }
  blurred(ctx, 14, () => { ctx.fillStyle = 'rgba(90,50,60,0.35)'; ctx.translate(0, 14); path(); ctx.fill() })
  path()
  const g = ctx.createLinearGradient(0, 200, 0, 420)
  g.addColorStop(0, rgba(light)); g.addColorStop(0.55, rgba(band)); g.addColorStop(1, rgba(dark))
  ctx.fillStyle = g
  ctx.fill()
  ctx.clip()
  terry(ctx, 140, 150, 744, 300, band, seed + 7, 0.03)
  blurred(ctx, 8, () => { ctx.strokeStyle = rgba(light, 0.8); ctx.lineWidth = 10; ctx.beginPath(); ctx.moveTo(170, 360); ctx.quadraticCurveTo(512, 170, 854, 360); ctx.stroke() })
  ctx.restore()
  // The bow on top.
  const bx = 512, by = 214
  for (const side of [-1, 1]) {
    ctx.save()
    ctx.translate(bx, by)
    ctx.scale(side, 1)
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.bezierCurveTo(40, -90, 120, -86, 118, -30)
    ctx.bezierCurveTo(116, 10, 50, 20, 0, 0)
    const bg = ctx.createLinearGradient(0, -90, 0, 20)
    bg.addColorStop(0, rgba(light)); bg.addColorStop(1, rgba(dark))
    ctx.fillStyle = bg
    ctx.fill()
    ctx.clip()
    terry(ctx, 0, -100, 130, 130, band, seed + 9 + side, 0.03)
    blob(ctx, 60, -50, 30, 20, light, 0.6)
    ctx.restore()
  }
  ctx.beginPath()
  ctx.ellipse(bx, by, 30, 26, 0, 0, Math.PI * 2)
  const kg = ctx.createRadialGradient(bx - 8, by - 8, 4, bx, by, 32)
  kg.addColorStop(0, rgba(light)); kg.addColorStop(1, rgba(dark))
  ctx.fillStyle = kg
  ctx.fill()
}

// ------------------------------------------------------------------ height (for the skin shader)

function paintHeight(seed: number) {
  const [c, ctx] = canvas(S)
  const r = makeRng(seed + 5)
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, S, S)
  ctx.save()
  faceClip(ctx)
  const g = ctx.createRadialGradient(512, 520, 30, 512, 540, 420)
  g.addColorStop(0, '#d8d8d8'); g.addColorStop(0.7, '#9a9a9a'); g.addColorStop(1, '#3a3a3a')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, S, S)
  const w = (x: number, y: number, rx: number, ry: number, a: number) => blob(ctx, x, y, rx, ry, [255, 255, 255], a)
  const d = (x: number, y: number, rx: number, ry: number, a: number) => blob(ctx, x, y, rx, ry, [0, 0, 0], a)
  w(512, 590, 44, 110, 0.5); w(512, 628, 44, 36, 0.55); w(472, 650, 24, 20, 0.3); w(552, 650, 24, 20, 0.3)
  w(380, 640, 110, 90, 0.2); w(644, 640, 110, 90, 0.2)
  for (const e of FACE.eyes) { d(e.x, e.y, 80, 44, 0.3); w(e.x, e.y - 64, 90, 24, 0.2) }
  w(512, 762, 84, 34, 0.3); w(512, 866, 70, 40, 0.25); d(512, 818, 70, 12, 0.25); d(512, 690, 30, 12, 0.3)
  d(490, 664, 12, 7, 0.8); d(534, 664, 12, 7, 0.8)
  ctx.restore()
  // Pores: denser on the nose and cheeks; fine texture everywhere.
  ctx.save()
  faceClip(ctx)
  ctx.globalCompositeOperation = 'overlay'
  ctx.globalAlpha = 0.45
  ctx.drawImage(fbm(S, 6, 2, seed + 21), 0, 0)
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
  for (let i = 0; i < 26000; i++) {
    let x: number, y: number
    if (i % 3 === 0) { x = 512 + r.range(-80, 80); y = 560 + r.range(-40, 130) } else if (i % 3 === 1) { const side = r() < 0.5 ? -1 : 1; x = 512 + side * r.range(70, 230); y = r.range(560, 780) } else { x = r.range(220, 800); y = r.range(300, 920) }
    ctx.fillStyle = `rgba(0,0,0,${r.range(0.18, 0.42)})`
    ctx.beginPath(); ctx.arc(x, y, r.range(0.8, 1.9), 0, Math.PI * 2); ctx.fill()
  }
  ctx.restore()
  return c
}

// ------------------------------------------------------------------ layer sheets

function clipped(size: number, draw: (ctx: Ctx, k: number) => void, clip: (ctx: Ctx) => void = skinClip) {
  const [c, ctx] = canvas(size)
  const k = size / S
  ctx.save()
  ctx.scale(k, k)
  clip(ctx)
  ctx.scale(1 / k, 1 / k)
  draw(ctx, k)
  ctx.restore()
  return c
}

function specks(ctx: Ctx, k: number, count: number, color: RGB, rMin: number, rMax: number, aMin: number, aMax: number, seed: number) {
  const r = makeRng(seed)
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = rgba(shade(color, r.range(-0.15, 0.15)), r.range(aMin, aMax))
    ctx.beginPath()
    ctx.ellipse(r.range(180, 850) * k, r.range(260, 960) * k, r.range(rMin, rMax) * k, r.range(rMin, rMax) * k, r() * 3, 0, Math.PI * 2)
    ctx.fill()
  }
}

/** A clump of cartoon grime with volume: contact shadow, dark core, lighter rim, a small highlight, specks. */
function grimeClump(ctx: Ctx, x: number, y: number, r: number, body: RGB, seed: number) {
  const rr = makeRng(seed)
  const pts: number[] = []
  const n = 9
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; const d = r * rr.range(0.7, 1.15); pts.push(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.85) }
  blurred(ctx, r * 0.25, () => { ctx.fillStyle = rgba(shade(body, -0.55), 0.45); ctx.beginPath(); smoothPath(ctx, pts.map((v, i) => v + (i % 2 ? r * 0.18 : r * 0.12))); ctx.fill() })
  ctx.save()
  ctx.beginPath(); smoothPath(ctx, pts)
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r * 1.1)
  g.addColorStop(0, rgba(shade(body, 0.28))); g.addColorStop(0.55, rgba(body)); g.addColorStop(1, rgba(shade(body, -0.35)))
  ctx.fillStyle = g
  ctx.fill()
  ctx.clip()
  for (let i = 0; i < r * 1.2; i++) { ctx.fillStyle = rgba(shade(body, rr.range(-0.45, 0.3)), rr.range(0.3, 0.8)); ctx.beginPath(); ctx.arc(x + rr.range(-r, r), y + rr.range(-r, r), rr.range(1, 3.2), 0, Math.PI * 2); ctx.fill() }
  ctx.restore()
  ctx.strokeStyle = rgba(shade(body, -0.45), 0.6); ctx.lineWidth = 1.6
  ctx.beginPath(); smoothPath(ctx, pts); ctx.stroke()
  blob(ctx, x - r * 0.32, y - r * 0.4, r * 0.28, r * 0.16, [255, 250, 236], 0.55)
}

function paintLayers(skin: SkinTone, seed: number): Record<string, HTMLCanvasElement> {
  const layers: Record<string, HTMLCanvasElement> = {}
  const r = makeRng(seed + 30)
  // Grime: cute and cartoony, never gross. A dusty veil with clumps that have real volume.
  layers.grime = clipped(S, (ctx) => {
    ctx.drawImage(tintedByNoise(S, [150, 128, 96], fbm(S, 48, 4, seed + 31), 0.2, 0.62), 0, 0)
    specks(ctx, 1, 1800, [104, 84, 62], 1.2, 3.6, 0.3, 0.75, seed + 32)
    for (let i = 0; i < 70; i++) grimeClump(ctx, r.range(220, 800), r.range(300, 930), r.range(9, 26), [128, 104, 74], seed + 300 + i)
  }, faceClip)
  // Ground-in grime (disaster cases): darker, heavier clumps.
  layers.grime2 = clipped(S, (ctx) => {
    ctx.drawImage(tintedByNoise(S, [96, 76, 56], fbm(S, 36, 4, seed + 35), 0.35, 0.8), 0, 0)
    for (let i = 0; i < 90; i++) grimeClump(ctx, r.range(220, 800), r.range(300, 930), r.range(12, 34), [92, 72, 52], seed + 500 + i)
  }, faceClip)
  layers.flakes = clipped(S, (ctx) => {
    ctx.drawImage(tintedByNoise(S, [250, 238, 228], fbm(S, 16, 3, seed + 36), 0.15, 0.45), 0, 0)
    for (let i = 0; i < 900; i++) {
      const x = r.range(220, 800), y = r.range(300, 930), s = r.range(2.5, 7)
      ctx.fillStyle = 'rgba(180,150,140,0.35)'
      ctx.beginPath(); ctx.moveTo(x + 1, y + 2); ctx.lineTo(x + s + 1, y + 1); ctx.lineTo(x + s * 0.6 + 1, y + s + 2); ctx.closePath(); ctx.fill()
      ctx.fillStyle = rgba([255, 250, 244], r.range(0.7, 1))
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + s, y - 1); ctx.lineTo(x + s * 0.6, y + s); ctx.closePath(); ctx.fill()
    }
  })
  layers.oil = clipped(512, (ctx) => {
    ctx.drawImage(tintedByNoise(512, [250, 232, 170], fbm(512, 32, 3, seed + 41), 0.12, 0.4), 0, 0)
  })
  layers.redness = clipped(512, (ctx) => {
    ctx.drawImage(tintedByNoise(512, mixRGB(skin.blush, [232, 96, 104], 0.5), fbm(512, 20, 3, seed + 51), 0.25, 0.62), 0, 0)
    for (let i = 0; i < 90; i++) { ctx.fillStyle = rgba([220, 80, 96], r.range(0.15, 0.4)); ctx.beginPath(); ctx.arc(r.range(100, 412), r.range(150, 470), r.range(1, 2.5), 0, Math.PI * 2); ctx.fill() }
  })
  layers.marks = clipped(512, (ctx) => {
    ctx.drawImage(tintedByNoise(512, [226, 84, 96], fbm(512, 12, 2, seed + 61), 0.5, 0.78), 0, 0)
  })
  layers.serum = clipped(512, (ctx) => {
    ctx.drawImage(tintedByNoise(512, [255, 214, 130], fbm(512, 40, 2, seed + 71), 0.28, 0.45), 0, 0)
  })
  layers.glow = clipped(512, (ctx) => {
    ctx.drawImage(tintedByNoise(512, [255, 236, 236], fbm(512, 60, 2, seed + 81), 0.12, 0.26), 0, 0)
  })
  layers.cream = clipped(S, (ctx) => {
    ctx.fillStyle = '#fffaf3'
    ctx.fillRect(0, 0, S, S)
    const rc = makeRng(seed + 91)
    for (let i = 0; i < 500; i++) {
      const x = rc.range(200, 830), y = rc.range(280, 940)
      ctx.strokeStyle = rc() < 0.5 ? 'rgba(236,222,210,0.8)' : 'rgba(255,255,255,0.9)'
      ctx.lineWidth = rc.range(2, 6)
      ctx.beginPath(); ctx.arc(x, y, rc.range(8, 30), rc() * 6, rc() * 6 + rc.range(1, 3)); ctx.stroke()
    }
  })
  layers.mask = paintClay(false, seed)
  layers.foam = clipped(S, (ctx) => {
    ctx.fillStyle = 'rgba(253,251,255,0.97)'
    ctx.fillRect(0, 0, S, S)
    const rf = makeRng(seed + 101)
    for (let i = 0; i < 5200; i++) {
      const x = rf.range(180, 850), y = rf.range(260, 960), rr = rf() < 0.9 ? rf.range(2.5, 9) : rf.range(10, 20)
      ctx.fillStyle = rgba([222, 222, 238], rf.range(0.3, 0.65))
      ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = rgba([255, 255, 255], rf.range(0.7, 1))
      ctx.beginPath(); ctx.arc(x - rr * 0.25, y - rr * 0.25, rr * 0.7, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,1)'
      ctx.beginPath(); ctx.arc(x - rr * 0.4, y - rr * 0.4, rr * 0.22, 0, Math.PI * 2); ctx.fill()
    }
  })
  return layers
}

/** The mint clay mask, wet (glossy, brush-streaked) or dry (paler, matte, cracked). */
function paintClay(dry: boolean, seed: number) {
  return clipped(S, (ctx) => {
    const base: RGB = dry ? [210, 238, 224] : [152, 216, 192]
    ctx.fillStyle = rgba(base)
    ctx.fillRect(0, 0, S, S)
    const r = makeRng(seed + 111)
    // Brush streaks.
    for (let i = 0; i < 900; i++) {
      const x = r.range(160, 860), y = r.range(250, 970), a = r.range(-0.6, 0.6), len = r.range(30, 110)
      ctx.strokeStyle = rgba(shade(base, r.range(-0.12, 0.12)), r.range(0.15, 0.45))
      ctx.lineWidth = r.range(3, 10)
      ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + len * 0.5 * Math.cos(a), y + 10 * Math.sin(a * 3), x + len * Math.cos(a), y + len * Math.sin(a)); ctx.stroke()
    }
    ctx.globalCompositeOperation = 'soft-light'
    ctx.drawImage(fbm(S, 30, 4, seed + 112), 0, 0)
    ctx.globalCompositeOperation = 'source-over'
    if (dry) {
      // Cracks: a network of short jagged lines.
      for (let i = 0; i < 140; i++) {
        let x = r.range(200, 830), y = r.range(300, 940)
        ctx.strokeStyle = `rgba(150,184,170,${r.range(0.35, 0.7)})`
        ctx.lineWidth = r.range(1, 2.4)
        ctx.beginPath(); ctx.moveTo(x, y)
        let a = r() * Math.PI * 2
        for (let s = 0; s < r.int(3, 7); s++) { a += r.range(-0.9, 0.9); x += Math.cos(a) * r.range(8, 22); y += Math.sin(a) * r.range(8, 22); ctx.lineTo(x, y) }
        ctx.stroke()
      }
      specks(ctx, 1, 1200, [236, 250, 244], 1, 2.5, 0.3, 0.7, seed + 113)
    }
  })
}

// ------------------------------------------------------------------ expressions

const EYE_CROP = { x: 290, y: 430, w: 444, h: 160 }
const BROW_CROP = { x: 284, y: 380, w: 456, h: 112 }
const MOUTH_CROP = { x: 396, y: 690, w: 232, h: 160 }

function crop(area: { x: number; y: number; w: number; h: number }, draw: (ctx: Ctx) => void): Crop {
  const [c, ctx] = canvas(area.w, area.h)
  ctx.translate(-area.x, -area.y)
  draw(ctx)
  return { canvas: c, x: area.x, y: area.y }
}

function eyeCrop(state: EyeState, lashColor: RGB, skin: SkinTone, feat: Feat): Crop {
  return crop(EYE_CROP, ctx => { for (const [i, e] of FACE.eyes.entries()) drawEye(ctx, e.x, e.y, i === 0 ? -1 : 1, state, lashColor, skin, feat) })
}

function drawEye(ctx: Ctx, ex: number, ey: number, side: number, state: EyeState, lashColor: RGB, skin: SkinTone, feat: Feat) {
  if (state === 'open' || state === 'wide') { drawOpenEye(ctx, ex, ey, side, state === 'wide', lashColor, skin, feat); return }
  const lash = rgba(mixRGB(lashColor, [20, 10, 16], 0.5))
  const lashLen = 0.8 + feat.lashes * 0.5
  const inner = { x: ex - side * 58, y: ey - 2 }
  const outer = { x: ex + side * 62, y: ey - 8 }
  const sag = state === 'closed' ? 22 : state === 'squeeze' ? 12 : -22
  const cx = ex + side * 4, cy = ey + sag
  const point = (t: number) => ({ x: (1 - t) ** 2 * inner.x + 2 * (1 - t) * t * cx + t * t * outer.x, y: (1 - t) ** 2 * inner.y + 2 * (1 - t) * t * cy + t * t * outer.y })
  // The lid: lighter, rounded over the eyeball, with the crease above it.
  blob(ctx, ex, ey - 4 + (state === 'happy' ? -8 : 0), 66, 30, skin.base, 0.9, 0.5)
  blob(ctx, ex - side * 6, ey - 12 + (state === 'happy' ? -8 : 0), 44, 16, skin.light, 0.55)
  blurred(ctx, 1.5, () => {
    ctx.strokeStyle = rgba(skin.deep, state === 'squeeze' ? 0.55 : 0.32)
    ctx.lineWidth = state === 'squeeze' ? 3.5 : 2.5
    ctx.beginPath()
    const lift = state === 'squeeze' ? -22 : -34
    ctx.moveTo(inner.x + side * 6, inner.y - 10)
    ctx.quadraticCurveTo(ex, ey + lift + (state === 'happy' ? -14 : 0), outer.x - side * 4, outer.y - 12)
    ctx.stroke()
  })
  blurred(ctx, 5, () => {
    ctx.strokeStyle = rgba(skin.deep, 0.22)
    ctx.lineWidth = 10
    ctx.beginPath(); ctx.moveTo(inner.x, inner.y + 4); ctx.quadraticCurveTo(cx, cy + 6, outer.x, outer.y + 4); ctx.stroke()
  })
  taper(ctx, inner.x, inner.y, cx, cy, outer.x, outer.y, 3, 7, lash)
  const count = state === 'squeeze' ? 8 : 11
  for (let i = 0; i < count; i++) {
    const t = 0.22 + (i / (count - 1)) * 0.78
    const p = point(t)
    const q = point(Math.min(1, t + 0.02))
    const tx = q.x - p.x, ty = q.y - p.y, tl = Math.hypot(tx, ty) || 1
    let nx = -ty / tl, ny = tx / tl
    if (ny < 0) { nx = -nx; ny = -ny }
    const len = ((state === 'squeeze' ? 9 : 13) + t * (state === 'happy' ? 8 : 14)) * lashLen
    const outward = side * (0.25 + t * 0.9)
    const ex2 = p.x + (nx + outward * 0.8) * len, ey2 = p.y + ny * len * (state === 'happy' ? 0.7 : 1)
    taper(ctx, p.x, p.y, p.x + nx * len * 0.5, p.y + ny * len * 0.7, ex2, ey2, 3.2, 0.4, lash)
  }
  if (state === 'squeeze') {
    ctx.strokeStyle = rgba(skin.deep, 0.35)
    ctx.lineWidth = 2
    for (let k = -1; k <= 1; k++) {
      ctx.beginPath()
      ctx.moveTo(outer.x + side * 8, outer.y + k * 9)
      ctx.quadraticCurveTo(outer.x + side * 20, outer.y + k * 11, outer.x + side * 30, outer.y + k * 14)
      ctx.stroke()
    }
  }
  if (state === 'happy') blob(ctx, ex, ey + 30, 50, 12, skin.shadow, 0.18)
}

/** An open eye: white with lid shadow, a detailed iris with a limbal ring, pupil, catchlights and lashes. */
function drawOpenEye(ctx: Ctx, ex: number, ey: number, side: number, wide: boolean, lashColor: RGB, skin: SkinTone, feat: Feat) {
  const lash = rgba(mixRGB(lashColor, [20, 10, 16], 0.55))
  const lashLen = 0.8 + feat.lashes * 0.5
  const w = 60, top = wide ? 30 : 24, bottom = wide ? 20 : 16
  const inner = { x: ex - side * w * 0.95, y: ey + 2 }, outer = { x: ex + side * w, y: ey - 5 }
  const upper = () => { ctx.moveTo(inner.x, inner.y); ctx.bezierCurveTo(ex - side * 34, ey - top - 6, ex + side * 30, ey - top - 4, outer.x, outer.y) }
  const lower = () => { ctx.bezierCurveTo(ex + side * 30, ey + bottom + 2, ex - side * 34, ey + bottom + 4, inner.x, inner.y) }
  // Socket shading around the opening.
  blob(ctx, ex, ey - 8, 74, 40, skin.shadow, 0.25)
  ctx.save()
  ctx.beginPath(); upper(); lower(); ctx.closePath()
  const white = ctx.createRadialGradient(ex, ey + 4, 6, ex, ey, w)
  white.addColorStop(0, '#fbf8f6'); white.addColorStop(0.75, '#efe6e6'); white.addColorStop(1, '#d9c3c6')
  ctx.fillStyle = white
  ctx.fill()
  ctx.clip()
  // Iris: limbal ring, radial fibres, a lighter lower half, the pupil.
  const ir = wide ? 21 : 23, ix = ex + side * 2, iy = ey - (wide ? 0 : 2)
  const ig = ctx.createRadialGradient(ix, iy + 6, 2, ix, iy, ir)
  ig.addColorStop(0, rgba(shade(feat.iris, 0.35))); ig.addColorStop(0.55, rgba(feat.iris)); ig.addColorStop(0.9, rgba(shade(feat.iris, -0.35))); ig.addColorStop(1, rgba(shade(feat.iris, -0.6)))
  ctx.fillStyle = ig
  ctx.beginPath(); ctx.arc(ix, iy, ir, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = rgba(shade(feat.iris, 0.45), 0.35); ctx.lineWidth = 1
  for (let i = 0; i < 28; i++) { const a = (i / 28) * Math.PI * 2; ctx.beginPath(); ctx.moveTo(ix + Math.cos(a) * 8, iy + Math.sin(a) * 8); ctx.lineTo(ix + Math.cos(a) * (ir - 3), iy + Math.sin(a) * (ir - 3)); ctx.stroke() }
  ctx.fillStyle = '#1e1418'
  ctx.beginPath(); ctx.arc(ix, iy, wide ? 7 : 8.5, 0, Math.PI * 2); ctx.fill()
  // The upper lid casts a soft shadow on the eyeball.
  const shadowG = ctx.createLinearGradient(0, ey - top, 0, ey - top + 22)
  shadowG.addColorStop(0, 'rgba(90,50,60,0.45)'); shadowG.addColorStop(1, 'rgba(90,50,60,0)')
  ctx.fillStyle = shadowG
  ctx.fillRect(ex - w - 4, ey - top - 8, w * 2 + 8, 34)
  // Catchlights: a big one up-left, a small one down-right.
  ctx.fillStyle = 'rgba(255,255,255,0.95)'
  ctx.beginPath(); ctx.ellipse(ix - 8, iy - 9, 6.5, 5, -0.5, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.arc(ix + 8, iy + 8, 2.6, 0, Math.PI * 2); ctx.fill()
  ctx.restore()
  // Lids: a thick upper lash line with a little wing, a fine lower line, the crease above.
  ctx.lineCap = 'round'
  ctx.strokeStyle = lash; ctx.lineWidth = 5
  ctx.beginPath(); upper(); ctx.stroke()
  taper(ctx, outer.x - side * 6, outer.y - 2, outer.x + side * 6, outer.y - 6, outer.x + side * 16, outer.y - 12, 4, 1, lash)
  ctx.strokeStyle = rgba(skin.deep, 0.55); ctx.lineWidth = 1.8
  ctx.beginPath(); ctx.moveTo(outer.x, outer.y); lower(); ctx.stroke()
  blob(ctx, ex, ey + bottom + 3, 34, 3, [255, 236, 236], 0.5)
  blurred(ctx, 1.4, () => {
    ctx.strokeStyle = rgba(skin.deep, 0.4); ctx.lineWidth = 2.4
    ctx.beginPath(); ctx.moveTo(inner.x + side * 6, inner.y - 14); ctx.bezierCurveTo(ex - side * 30, ey - top - 22, ex + side * 30, ey - top - 20, outer.x - side * 2, outer.y - 16); ctx.stroke()
  })
  // Upper lashes curling up and out; a few short lower ones.
  for (let i = 0; i < 12; i++) {
    const t = 0.18 + (i / 11) * 0.82
    const x = inner.x + (outer.x - inner.x) * t
    const y = ey - top * Math.sin(Math.PI * Math.min(1, t * 0.9 + 0.05)) * 0.92 - 1 + (outer.y - ey) * t
    const len = (10 + t * 12) * lashLen
    taper(ctx, x, y, x + side * len * (0.2 + t * 0.4), y - len * 0.7, x + side * len * (0.5 + t * 0.6), y - len * 0.8, 3, 0.3, lash)
  }
  for (let i = 0; i < 6; i++) {
    const t = 0.45 + (i / 5) * 0.5
    const x = inner.x + (outer.x - inner.x) * t, y = ey + bottom * Math.sin(Math.PI * t) * 0.9 + 1
    taper(ctx, x, y, x + side * 2, y + 4, x + side * 4, y + 7 * lashLen, 1.6, 0.3, rgba(mixRGB(lashColor, [60, 40, 40], 0.5), 0.8))
  }
}

function browCrop(state: BrowState, hair: typeof HAIR[number], seed: number, feat: Feat): Crop {
  return crop(BROW_CROP, ctx => {
    for (const [i, b] of FACE.brows.entries()) drawBrow(ctx, b.x, b.y, i === 0 ? -1 : 1, state, hair, seed + i, feat)
  })
}

function drawBrow(ctx: Ctx, bx: number, by: number, side: number, state: BrowState, hair: typeof HAIR[number], seed: number, feat: Feat) {
  const r = makeRng(seed)
  // Light hair still reads as brows a shade darker.
  const lum = (hair.base[0] + hair.base[1] + hair.base[2]) / 3
  const color = lum > 150 ? shade(hair.base, -0.35) : hair.base
  const dark = lum > 150 ? shade(hair.dark, -0.2) : hair.dark
  const weight = 0.75 + feat.brow * 0.55
  const innerY = state === 'worried' ? by - 8 : state === 'happy' ? by + 0 : by + 10
  const peakY = state === 'worried' ? by - 4 : state === 'happy' ? by - 24 : by - 14
  const outerY = state === 'worried' ? by + 14 : state === 'happy' ? by - 4 : by + 2
  const inner = { x: bx - side * 72, y: innerY }, peak = { x: bx + side * 26, y: peakY }, outer = { x: bx + side * 80, y: outerY }
  const at = (t: number) => t < 0.62
    ? { x: inner.x + (peak.x - inner.x) * (t / 0.62), y: inner.y + (peak.y - inner.y) * Math.sin((t / 0.62) * Math.PI / 2) }
    : { x: peak.x + (outer.x - peak.x) * ((t - 0.62) / 0.38), y: peak.y + (outer.y - peak.y) * ((t - 0.62) / 0.38) ** 1.4 }
  blurred(ctx, 3, () => {
    for (let i = 0; i <= 20; i++) {
      const t = i / 20, p = at(t)
      ctx.fillStyle = rgba(color, 0.42)
      ctx.beginPath(); ctx.ellipse(p.x, p.y, 8, (9 - t * 5) * weight, 0, 0, Math.PI * 2); ctx.fill()
    }
  })
  for (let i = 0; i < Math.round(90 * weight); i++) {
    const t = r()
    const p = at(t)
    const q = at(Math.min(1, t + 0.05))
    const dx = q.x - p.x, dy = q.y - p.y, l = Math.hypot(dx, dy) || 1
    const up = (1 - t) * 0.9
    const hx = dx / l * (1 - up), hy = dy / l * (1 - up) - up
    const len = r.range(10, 20) * (1 - t * 0.4)
    const off = r.range(-1, 1) * (9 - t * 5) * weight
    const sx = p.x + (-dy / l) * off, sy = p.y + (dx / l) * off + 3
    ctx.strokeStyle = rgba(r() < 0.5 ? dark : color, r.range(0.55, 0.9))
    ctx.lineWidth = r.range(1.2, 2.4)
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(sx + hx * len * 0.5, sy + hy * len * 0.5 - 2, sx + hx * len, sy + hy * len); ctx.stroke()
  }
}

function mouthCrop(state: MouthState, skin: SkinTone, feat: Feat): Crop {
  return crop(MOUTH_CROP, ctx => drawMouth(ctx, FACE.lips.x, FACE.lips.y, state, skin, feat))
}

function drawMouth(ctx: Ctx, mx: number, my: number, state: MouthState, skin: SkinTone, feat: Feat) {
  const full = 0.85 + feat.lips * 0.4
  const lip = skin.lip, lipDark = shade(lip, -0.25), lipLight = shade(lip, 0.3)
  const inside: RGB = [120, 40, 52]
  if (state === 'beam' || state === 'o') {
    const w = state === 'beam' ? 80 : 26, top = state === 'beam' ? my - 14 : my - 12, bottom = state === 'beam' ? my + 40 : my + 22
    // Lips around an open mouth.
    ctx.beginPath()
    ctx.moveTo(mx - w - 8, my - 8)
    ctx.bezierCurveTo(mx - w * 0.6, top - 16, mx - 10, top - 18, mx, top - 10)
    ctx.bezierCurveTo(mx + 10, top - 18, mx + w * 0.6, top - 16, mx + w + 8, my - 8)
    ctx.bezierCurveTo(mx + w * 0.7, bottom + 20, mx - w * 0.7, bottom + 20, mx - w - 8, my - 8)
    ctx.closePath()
    const g = ctx.createLinearGradient(0, top - 20, 0, bottom + 20)
    g.addColorStop(0, rgba(lipDark)); g.addColorStop(0.5, rgba(lip)); g.addColorStop(1, rgba(lipLight))
    ctx.fillStyle = g
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(mx - w, my - 6)
    ctx.bezierCurveTo(mx - w * 0.5, top - 2, mx + w * 0.5, top - 2, mx + w, my - 6)
    ctx.bezierCurveTo(mx + w * 0.6, bottom, mx - w * 0.6, bottom, mx - w, my - 6)
    ctx.closePath()
    ctx.fillStyle = rgba(inside)
    ctx.fill()
    ctx.save()
    ctx.clip()
    if (state === 'beam') {
      ctx.fillStyle = '#fffaf6'
      ctx.beginPath(); ctx.ellipse(mx, top + 2, w * 0.86, 14, 0, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = 'rgba(200,180,180,0.5)'; ctx.lineWidth = 1.2
      for (const k of [-2, -1, 0, 1, 2]) { ctx.beginPath(); ctx.moveTo(mx + k * 22, top - 8); ctx.lineTo(mx + k * 22, top + 12); ctx.stroke() }
    }
    blob(ctx, mx, bottom + 6, w * 0.6, 18, [236, 120, 130], 0.9)
    ctx.restore()
    blob(ctx, mx + 6, bottom + 8, w * 0.35, 5, lipLight, 0.6)
    if (state === 'beam') for (const s of [-1, 1]) blob(ctx, mx + s * (w + 16), my - 10, 12, 16, skin.shadow, 0.35)
    return
  }
  const corner = state === 'smile' ? -10 : state === 'wince' ? 8 : 2
  const cw = state === 'smile' ? 78 : state === 'wince' ? 60 : 70
  const upperH = (state === 'wince' ? 8 : 16) * full, lowerH = (state === 'wince' ? 12 : state === 'smile' ? 22 : 28) * full
  const lineSag = state === 'smile' ? 12 : state === 'wince' ? -2 : 4
  const L = { x: mx - cw, y: my + corner }, R = { x: mx + cw, y: my + corner }
  // Upper lip with a cupid's bow.
  ctx.beginPath()
  ctx.moveTo(L.x, L.y)
  ctx.bezierCurveTo(mx - cw * 0.55, my - upperH * 0.6, mx - 26, my - upperH - 4, mx - 14, my - upperH)
  ctx.quadraticCurveTo(mx, my - upperH + 8, mx + 14, my - upperH)
  ctx.bezierCurveTo(mx + 26, my - upperH - 4, mx + cw * 0.55, my - upperH * 0.6, R.x, R.y)
  ctx.quadraticCurveTo(mx, my + lineSag + 4, L.x, L.y)
  ctx.closePath()
  const ug = ctx.createLinearGradient(0, my - upperH, 0, my + 4)
  ug.addColorStop(0, rgba(lip)); ug.addColorStop(1, rgba(lipDark))
  ctx.fillStyle = ug
  ctx.fill()
  // Lower lip.
  ctx.beginPath()
  ctx.moveTo(L.x, L.y)
  ctx.quadraticCurveTo(mx, my + lineSag + 4, R.x, R.y)
  ctx.bezierCurveTo(mx + cw * 0.6, my + lowerH + lineSag, mx - cw * 0.6, my + lowerH + lineSag, L.x, L.y)
  ctx.closePath()
  const lg = ctx.createLinearGradient(0, my, 0, my + lowerH + lineSag)
  lg.addColorStop(0, rgba(lipDark)); lg.addColorStop(0.4, rgba(lip)); lg.addColorStop(1, rgba(shade(lip, 0.08)))
  ctx.fillStyle = lg
  ctx.fill()
  // The line between the lips, and a wet highlight.
  ctx.strokeStyle = rgba(shade(lip, -0.5), 0.85)
  ctx.lineWidth = state === 'wince' ? 3.5 : 2.6
  ctx.beginPath(); ctx.moveTo(L.x + 2, L.y); ctx.quadraticCurveTo(mx, my + lineSag + 4, R.x - 2, R.y); ctx.stroke()
  blob(ctx, mx + 6, my + lineSag + lowerH * 0.55, cw * 0.36, 5, lipLight, 0.75)
  blob(ctx, mx - 16, my - upperH + 6, 12, 3, lipLight, 0.5)
  for (const s of [-1, 1]) blob(ctx, mx + s * (cw + 4), my + corner, 8, 8, skin.deep, state === 'smile' ? 0.45 : 0.3)
  if (state === 'wince') { ctx.strokeStyle = rgba(skin.deep, 0.3); ctx.lineWidth = 1.5; for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(mx + s * (cw + 6), my + 6); ctx.quadraticCurveTo(mx + s * (cw + 14), my + 16, mx + s * (cw + 10), my + 26); ctx.stroke() } }
}
