import type { Look } from '../core/customers.ts'
import { FACE, SHAPES, bandEdge } from '../core/treatments/anatomy.ts'
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

/** Clip to the face below the headband (grime lives here). */
function faceBelowBand(ctx: Ctx) {
  const cap = FACE.hairCap
  ctx.beginPath()
  smoothPath(ctx, FACE.outline)
  if (cap.t === 'poly') { ctx.moveTo(cap.pts[0], cap.pts[1]); for (let i = 2; i < cap.pts.length; i += 2) ctx.lineTo(cap.pts[i], cap.pts[i + 1]); ctx.closePath() }
  ctx.clip('evenodd')
}

/** Clip to the skin region: the face minus hair, eyes, brows and lips (the layers live here). */
function skinClip(ctx: Ctx) {
  faceClip(ctx)
  ctx.beginPath()
  ctx.rect(0, 0, S, S)
  const hole = (s: Shape) => {
    if (s.t === 'poly') { ctx.moveTo(s.pts[0], s.pts[1]); for (let i = 2; i < s.pts.length; i += 2) ctx.lineTo(s.pts[i], s.pts[i + 1]); ctx.closePath(); return }
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
  paintHair(ctx, hair, look.hairStyle, seed)

  // Neck, shadowed under the jaw.
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(414, 780); ctx.lineTo(610, 780); ctx.bezierCurveTo(614, 860, 626, 900, 660, 930); ctx.lineTo(364, 930); ctx.bezierCurveTo(398, 900, 410, 860, 414, 780)
  ctx.closePath()
  const ng = ctx.createLinearGradient(0, 800, 0, 1024)
  ng.addColorStop(0, rgba(skin.shadow)); ng.addColorStop(0.5, rgba(mixRGB(skin.base, skin.shadow, 0.45))); ng.addColorStop(1, rgba(skin.base))
  ctx.fillStyle = ng
  ctx.fill()
  ctx.clip()
  blob(ctx, 530, 800, 200, 80, skin.deep, 0.6)
  blob(ctx, 512, 872, 150, 36, skin.shadow, 0.45)
  blob(ctx, 560, 860, 120, 60, skin.shadow, 0.4)
  ctx.restore()

  // A fluffy spa robe with a crossed collar, in the customer's colour.
  {
    const robe = shade(band, 0.25), fold = shade(band, -0.12)
    ctx.save()
    ctx.beginPath()
    ctx.moveTo(60, 1030)
    ctx.bezierCurveTo(90, 960, 200, 920, 330, 905)
    ctx.lineTo(694, 905)
    ctx.bezierCurveTo(824, 920, 934, 960, 964, 1030)
    ctx.closePath()
    const rg = ctx.createLinearGradient(0, 900, 0, 1024)
    rg.addColorStop(0, rgba(shade(robe, 0.2))); rg.addColorStop(1, rgba(robe))
    ctx.fillStyle = rg
    ctx.fill()
    ctx.clip()
    terry(ctx, 60, 890, 904, 140, robe, seed + 3, 0.018)
    // The skin of the chest showing in the V of the collar.
    ctx.beginPath(); ctx.moveTo(420, 900); ctx.lineTo(604, 900); ctx.lineTo(512, 1030); ctx.closePath()
    const cg = ctx.createLinearGradient(0, 900, 0, 1024)
    cg.addColorStop(0, rgba(skin.shadow)); cg.addColorStop(1, rgba(mixRGB(skin.base, skin.shadow, 0.3)))
    ctx.fillStyle = cg
    ctx.fill()
    // Two thick lapels crossing, each with a soft fold shadow.
    for (const side of [-1, 1]) {
      ctx.save()
      ctx.beginPath()
      ctx.moveTo(512 - side * 190, 902)
      ctx.lineTo(512 - side * 100, 902)
      ctx.lineTo(512 + side * 40, 1030)
      ctx.lineTo(512 - side * 60, 1030)
      ctx.closePath()
      const lg = ctx.createLinearGradient(512 - side * 150, 0, 512 + side * 20, 0)
      lg.addColorStop(0, rgba(shade(robe, 0.3))); lg.addColorStop(1, rgba(robe))
      ctx.fillStyle = lg
      ctx.fill()
      ctx.clip()
      terry(ctx, 300, 890, 424, 140, robe, seed + 5 + side, 0.03)
      ctx.restore()
      blurred(ctx, 6, () => { ctx.strokeStyle = rgba(fold, 0.7); ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(512 - side * 100, 904); ctx.lineTo(512 + side * 40, 1030); ctx.stroke() })
    }
    ctx.restore()
    blurred(ctx, 8, () => { ctx.strokeStyle = 'rgba(120,70,90,0.28)'; ctx.lineWidth = 10; ctx.beginPath(); ctx.moveTo(90, 1000); ctx.bezierCurveTo(200, 925, 330, 912, 420, 906); ctx.moveTo(604, 906); ctx.bezierCurveTo(694, 912, 824, 925, 934, 1000); ctx.stroke() })
    // Soft folds in the robe over the shoulders.
    blurred(ctx, 6, () => {
      const rr = makeRng(seed + 44)
      for (let k = 0; k < 8; k++) {
        const side = k % 2 ? 1 : -1, x = 512 + side * rr.range(200, 400), y = rr.range(950, 1010)
        ctx.strokeStyle = k % 3 ? rgba(shade(robe, -0.2), 0.45) : rgba(shade(robe, 0.45), 0.6)
        ctx.lineWidth = rr.range(4, 9)
        ctx.beginPath(); ctx.moveTo(x - side * 40, y - 30); ctx.quadraticCurveTo(x, y, x + side * 30, y + 40); ctx.stroke()
      }
    })
  }

  // Ears.
  for (const [i, e] of FACE.ears.entries()) {
    const side = i === 0 ? -1 : 1
    ctx.save()
    ctx.beginPath()
    ctx.ellipse(e.x + side * 12, e.y + 10, 34, 62, side * 0.12, 0, Math.PI * 2)
    const eg = ctx.createRadialGradient(e.x - side * 6, e.y, 10, e.x, e.y, 84)
    eg.addColorStop(0, rgba(skin.base)); eg.addColorStop(0.7, rgba(mixRGB(skin.base, skin.blush, 0.3))); eg.addColorStop(1, rgba(skin.shadow))
    ctx.fillStyle = eg
    ctx.fill()
    ctx.clip()
    blurred(ctx, 5, () => {
      ctx.strokeStyle = rgba(skin.deep, 0.45)
      ctx.lineWidth = 7
      ctx.beginPath()
      ctx.ellipse(e.x + side * 16, e.y + 14, 17, 40, side * 0.12, -Math.PI * 0.6, Math.PI * 0.8)
      ctx.stroke()
    })
    blob(ctx, e.x + side * 10, e.y + 10, 16, 26, skin.deep, 0.4)
    blob(ctx, e.x, e.y - 20, 34, 40, skin.blush, 0.35)
    ctx.restore()
  }

  // Hair falls over the top of each ear.
  for (const [i, e] of FACE.ears.entries()) {
    const side = i === 0 ? -1 : 1
    ctx.save()
    const g = ctx.createLinearGradient(e.x, e.y - 90, e.x, e.y + 20)
    g.addColorStop(0, rgba(hair.dark)); g.addColorStop(1, rgba(hair.base))
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.moveTo(e.x - side * 20, e.y - 110)
    ctx.bezierCurveTo(e.x + side * 60, e.y - 90, e.x + side * 64, e.y - 20, e.x + side * 40, e.y + 26)
    ctx.bezierCurveTo(e.x + side * 20, e.y - 10, e.x + side * 4, e.y - 50, e.x - side * 30, e.y - 60)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = rgba(hair.light, 0.35); ctx.lineWidth = 1.5
    for (let k = 0; k < 6; k++) { ctx.beginPath(); ctx.moveTo(e.x - side * (14 - k * 4), e.y - 104 + k * 6); ctx.bezierCurveTo(e.x + side * (50 - k * 4), e.y - 80, e.x + side * (54 - k * 5), e.y - 20, e.x + side * (36 - k * 3), e.y + 16 - k * 4); ctx.stroke() }
    ctx.restore()
  }

  // The face, lit by one warm key light from the top left.
  ctx.save()
  ctx.beginPath()
  smoothPath(ctx, FACE.outline)
  ctx.fillStyle = rgba(skin.base)
  ctx.fill()
  ctx.clip()
  // Key light and its falloff across the face.
  blob(ctx, 420, 400, 460, 420, skin.light, 0.5)
  blob(ctx, 760, 760, 420, 380, skin.shadow, 0.42)
  blurred(ctx, 36, () => { ctx.strokeStyle = rgba(skin.shadow, 0.7); ctx.lineWidth = 96; ctx.beginPath(); smoothPath(ctx, FACE.outline); ctx.stroke() })
  blob(ctx, 300, 470, 120, 200, skin.light, 0.35)
  // A warm band where the light turns away (light scattering under the skin).
  blurred(ctx, 20, () => { ctx.strokeStyle = rgba(mixRGB(skin.blush, skin.base, 0.3), 0.32); ctx.lineWidth = 54; ctx.beginPath(); smoothPath(ctx, FACE.outline.map((v, i) => (i % 2 ? 520 + (v - 520) * 0.88 : 512 + (v - 512) * 0.88))); ctx.stroke() })
  ctx.globalCompositeOperation = 'soft-light'
  ctx.globalAlpha = 0.18
  ctx.drawImage(fbm(S, 90, 3, seed + 11), 0, 0)
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
  // Temples and the sides of the forehead turn away, a little cooler; the cheeks warmer.
  blob(ctx, 270, 440, 90, 120, [196, 170, 200], 0.14)
  blob(ctx, 754, 440, 90, 120, [196, 170, 200], 0.14)
  blob(ctx, 380, 680, 150, 110, [255, 160, 130], 0.1)
  blob(ctx, 644, 680, 150, 110, [255, 160, 130], 0.1)
  blob(ctx, 262, 430, 80, 140, skin.shadow, 0.3)
  blob(ctx, 766, 430, 90, 150, skin.shadow, 0.45)
  // Eye sockets (deeper on the far side), the brow bone catching the light, lids.
  for (const [i, e] of FACE.eyes.entries()) {
    const side = i === 0 ? -1 : 1
    const far = side > 0 ? 1.3 : 1
    blob(ctx, e.x + side * 6, e.y - 2, 100, 58, skin.shadow, 0.34 * far)
    blob(ctx, e.x - side * 30, e.y - 4, 30, 26, skin.shadow, 0.3)
    blob(ctx, e.x + side * 12, e.y + 34, 64, 20, skin.shadow, 0.16 * far)
    blob(ctx, e.x - side * 8, e.y - 64, 84, 20, skin.light, side < 0 ? 0.55 : 0.3)
    blob(ctx, e.x, e.y - 20, 54, 16, skin.light, 0.4)
  }
  // Nose: a bridge with a thin highlight, soft sides (darker away from the light), a round tip,
  // wings with a rim of light, soft nostrils and the shadow the nose casts down and right.
  const n = FACE.nose
  blob(ctx, 480, 578, 20, 78, skin.shadow, 0.22)
  blob(ctx, 548, 584, 26, 88, skin.shadow, 0.5)
  blob(ctx, 505, 560, 10, 70, skin.light, 0.7)
  blob(ctx, 512, n.y - 2, 44 + feat.nose * 12, 34 + feat.nose * 8, skin.shadow, 0.24)
  blob(ctx, 512, n.y - 4, 40, 30, skin.blush, 0.28)
  blob(ctx, 502, n.y - 14, 18, 12, skin.light, 0.95)
  blob(ctx, 500, n.y - 17, 7, 5, [255, 255, 255], 0.55)
  blob(ctx, 474, n.y + 16, 26, 22, skin.shadow, 0.4)
  blob(ctx, 552, n.y + 16, 28, 22, skin.shadow, 0.6)
  blob(ctx, 468, n.y + 6, 11, 8, skin.light, 0.55)
  blob(ctx, 554, n.y + 6, 9, 7, skin.light, 0.3)
  blurred(ctx, 3, () => {
    ctx.fillStyle = rgba(mixRGB(skin.deep, [80, 30, 40], 0.3), 0.8)
    ctx.beginPath(); ctx.ellipse(491, n.y + 30, 12, 6, 0.35, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.ellipse(533, n.y + 30, 12, 6, -0.35, 0, Math.PI * 2); ctx.fill()
  })
  blob(ctx, 526, n.y + 52, 62, 16, skin.shadow, 0.55)
  ctx.save()
  ctx.lineCap = 'round'
  blurred(ctx, 2.2, () => {
    // The shadow side of the bridge, running down into the wing.
    ctx.strokeStyle = rgba(skin.shadow, 0.22)
    ctx.lineWidth = 7
    ctx.beginPath(); ctx.moveTo(538, 540); ctx.bezierCurveTo(544, 560, 548, 596, 552, n.y + 2); ctx.stroke()
    // Wings (alae): soft crescents around the nostrils.
    ctx.strokeStyle = rgba(skin.deep, 0.45)
    ctx.lineWidth = 3.4
    ctx.beginPath(); ctx.moveTo(468, n.y + 2); ctx.bezierCurveTo(452, n.y + 12, 456, n.y + 34, 476, n.y + 38); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(556, n.y + 2); ctx.bezierCurveTo(572, n.y + 12, 568, n.y + 34, 548, n.y + 38); ctx.stroke()
    // The underside of the tip between the nostrils.
    ctx.strokeStyle = rgba(skin.deep, 0.3)
    ctx.lineWidth = 3
    ctx.beginPath(); ctx.moveTo(494, n.y + 26); ctx.quadraticCurveTo(512, n.y + 34, 530, n.y + 26); ctx.stroke()
  })
  ctx.restore()
  // Cheekbones: a lifted highlight (brighter on the lit side) with a soft hollow below.
  blob(ctx, 372, 600, 80, 28, skin.light, 0.55)
  blob(ctx, 650, 604, 70, 24, skin.light, 0.28)
  blob(ctx, 350, 700, 70, 40, skin.shadow, 0.12)
  blob(ctx, 676, 700, 70, 44, skin.shadow, 0.22)
  // Blush on the cheeks and the nose tip.
  for (const x of [362, 662]) blob(ctx, x, 664, 116, 80, skin.blush, 0.22 + feat.blush * 0.26)
  // Philtrum ridges and the cupid's bow highlight, the shadow under the lower lip, the chin.
  blob(ctx, 499, 700, 5, 22, skin.light, 0.45)
  blob(ctx, 525, 700, 5, 22, skin.shadow, 0.3)
  blob(ctx, 512, 704, 8, 20, skin.shadow, 0.14)
  blob(ctx, 512, 722, 30, 5, skin.light, 0.6)
  blob(ctx, 518, 800, 64, 14, skin.shadow, 0.45)
  blob(ctx, 500, 852, 50, 28, skin.light, 0.55)
  blob(ctx, 512, 902, 150, 24, skin.shadow, 0.35)
  // Forehead: a broad soft highlight.
  blob(ctx, 480, 392, 170, 64, skin.light, 0.3)
  blob(ctx, 512, 322, 260, 40, skin.shadow, 0.28)
  if (look.freckles) {
    for (let i = 0; i < 70; i++) {
      const side = r() < 0.5 ? -1 : 1
      const x = 512 + side * r.range(20, 180), y = r.range(560, 680) - Math.abs(x - 512) * 0.1
      ctx.fillStyle = rgba(skin.deep, r.range(0.18, 0.4))
      ctx.beginPath(); ctx.arc(x, y, r.range(1.8, 4), 0, Math.PI * 2); ctx.fill()
    }
  }
  // A warm rim of light along the far edge of the face.
  blurred(ctx, 5, () => {
    ctx.strokeStyle = rgba(mixRGB(skin.light, [255, 214, 190], 0.5), 0.55)
    ctx.lineWidth = 7
    ctx.beginPath()
    const o = FACE.outline
    let started = false
    for (let k = 0; k < o.length / 2; k++) {
      const x = o[k * 2], y = o[k * 2 + 1]
      if (x < 600 || y < 380 || y > 860) { started = false; continue }
      const px = 512 + (x - 512) * 0.975, py = 520 + (y - 520) * 0.975
      if (!started) { ctx.moveTo(px, py); started = true } else ctx.lineTo(px, py)
    }
    ctx.stroke()
  })
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
  ctx.restore()
  // A thin, warm contour: darker than the skin, never black, heavier on the shadow side.
  ctx.save()
  ctx.lineJoin = 'round'
  blurred(ctx, 1.2, () => {
    ctx.strokeStyle = rgba(mixRGB(skin.deep, skin.shadow, 0.4), 0.38)
    ctx.lineWidth = 2.2
    ctx.beginPath(); smoothPath(ctx, FACE.outline); ctx.stroke()
  })
  ctx.restore()

  // Hairline: soft shadow and wisps of hair over the top of the forehead.
  ctx.save()
  faceClip(ctx)
  blurred(ctx, 16, () => { ctx.fillStyle = rgba(skin.deep, 0.35); ctx.beginPath(); ctx.ellipse(512, 214, 380, 150, 0, 0, Math.PI * 2); ctx.fill() })
  {
    const cg = ctx.createLinearGradient(0, 60, 0, 330)
    cg.addColorStop(0, rgba(hair.dark)); cg.addColorStop(0.6, rgba(hair.base)); cg.addColorStop(1, rgba(mixRGB(hair.base, hair.dark, 0.4)))
    ctx.fillStyle = cg
    ctx.beginPath(); ctx.ellipse(512, 196, 372, 132, 0, 0, Math.PI * 2); ctx.fill()
    // Clumps of hair swept back from the hairline toward the crown, each shaded like a ribbon.
    const clumps: { x: number; len: number }[] = []
    for (let i = 0; i < 38; i++) clumps.push({ x: r.range(160, 864), len: r.range(0.55, 1) })
    clumps.sort((a, b) => Math.abs(b.x - 512) - Math.abs(a.x - 512))
    for (const c of clumps) {
      const y0 = 196 + 132 * Math.sqrt(Math.max(0, 1 - ((c.x - 512) / 372) ** 2)) + 6
      const tx = 512 + (c.x - 512) * 0.3, ty = 60 + (1 - c.len) * 120
      const w = r.range(22, 44)
      const pts: [number, number][] = []
      for (let k = 0; k <= 12; k++) {
        const t = k / 12
        pts.push([c.x + (tx - c.x) * t + Math.sin(t * Math.PI) * (c.x - 512) * 0.06, y0 + (ty - y0) * t - Math.sin(t * Math.PI) * 10])
      }
      ctx.beginPath()
      for (let k = 0; k <= 12; k++) { const t = k / 12, ww = w * (1 - t * 0.75) / 2; ctx.lineTo(pts[k][0] - ww, pts[k][1]) }
      for (let k = 12; k >= 0; k--) { const t = k / 12, ww = w * (1 - t * 0.75) / 2; ctx.lineTo(pts[k][0] + ww, pts[k][1]) }
      ctx.closePath()
      const lg = ctx.createLinearGradient(c.x - w, 0, c.x + w, 0)
      lg.addColorStop(0, rgba(hair.dark)); lg.addColorStop(0.5, rgba(shade(hair.base, 0.06))); lg.addColorStop(1, rgba(mixRGB(hair.base, hair.dark, 0.5)))
      ctx.fillStyle = lg
      ctx.fill()
      for (let k = 0; k < 6; k++) {
        const off = r.range(-0.4, 0.4) * w
        ctx.strokeStyle = rgba(r() < 0.45 ? hair.light : hair.dark, r.range(0.18, 0.4))
        ctx.lineWidth = r.range(0.8, 1.8)
        ctx.beginPath()
        for (let j = 0; j <= 12; j++) { const t = j / 12; const x = pts[j][0] + off * (1 - t * 0.75), y = pts[j][1]; if (j === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y) }
        ctx.stroke()
      }
    }
    // The sheen band across the top of the head.
    blurred(ctx, 12, () => {
      ctx.globalCompositeOperation = 'screen'
      ctx.strokeStyle = rgba(hair.light, 0.3)
      ctx.lineWidth = 30
      ctx.beginPath(); ctx.ellipse(512, 250, 330, 120, 0, Math.PI * 1.12, Math.PI * 1.88); ctx.stroke()
      ctx.globalCompositeOperation = 'source-over'
    })
  }
  for (let i = 0; i < 160; i++) {
    const x = r.range(180, 844)
    const y0 = 196 + 132 * Math.sqrt(Math.max(0, 1 - ((x - 512) / 372) ** 2)) - 8
    ctx.strokeStyle = rgba(r() < 0.5 ? hair.base : hair.dark, r.range(0.3, 0.7))
    ctx.lineWidth = r.range(1, 2.4)
    ctx.beginPath(); ctx.moveTo(x, y0 - 20); ctx.quadraticCurveTo(x + r.range(-10, 10), y0, x + r.range(-14, 14), y0 + r.range(4, 16)); ctx.stroke()
  }
  ctx.restore()

  paintHeadband(ctx, band, seed)
  // Hair falls over the ends of the band, where it goes around the back of the head.
  for (const side of [-1, 1]) {
    const x = 512 + side * 292
    ctx.save()
    const g = ctx.createLinearGradient(x, 330, x, 560)
    g.addColorStop(0, rgba(hair.base)); g.addColorStop(1, rgba(hair.dark))
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.moveTo(x - side * 34, 330)
    ctx.bezierCurveTo(x + side * 30, 360, x + side * 44, 470, x + side * 40, 570)
    ctx.lineTo(x + side * 110, 570)
    ctx.bezierCurveTo(x + side * 116, 460, x + side * 84, 350, x + side * 20, 312)
    ctx.closePath()
    ctx.fill()
    const r2 = makeRng(seed + 70 + side)
    for (let k = 0; k < 18; k++) {
      ctx.strokeStyle = rgba(r2() < 0.4 ? hair.light : hair.dark, r2.range(0.2, 0.45))
      ctx.lineWidth = r2.range(1, 2.2)
      const o = r2.range(0, 60)
      ctx.beginPath(); ctx.moveTo(x - side * 20 + side * o * 0.5, 326); ctx.bezierCurveTo(x + side * (30 + o * 0.3), 370, x + side * (50 + o * 0.5), 470, x + side * (44 + o * 0.7), 558); ctx.stroke()
    }
    ctx.restore()
  }
  return c
}

/**
 * Hair spread on the pillow: locks that flow from the parting around the head and down to the shoulders,
 * each a tapered band with its own shading and fine strands, and a glossy sheen band across the crown.
 * The style changes the length, the volume and the wave.
 */
function paintHair(ctx: Ctx, hair: typeof HAIR[number], style: number, seed: number) {
  const r = makeRng(seed + 900)
  const length = [1.0, 0.92, 0.62, 0.8, 0.7, 1.05][style % 6]
  const volume = [1.0, 1.08, 0.92, 1.2, 0.95, 1.0][style % 6]
  const wave = [0.1, 0.5, 0.05, 1.1, 0.2, 0.3][style % 6]
  const bottom = 520 + 520 * length
  // Full styles would spill past the 1024 art sheet and get cut off in a straight line: past a knee, ease
  // the sideways reach in so the outermost hair still ends round and inside the sheet.
  const X = (x: number) => {
    const dx = x - 512, a = Math.abs(dx), knee = 380, max = 500
    return a <= knee ? x : 512 + Math.sign(dx) * (knee + (max - knee) * Math.tanh((a - knee) / (max - knee)))
  }
  // The mass behind everything, a little darker.
  ctx.save()
  const mass = [512, 48, 700, 70, 856, 180, 930, 380, 950, 600, 920, bottom - 140, 840, bottom, 640, bottom + 20, 384, bottom + 20, 184, bottom, 104, bottom - 140, 74, 600, 94, 380, 168, 180, 324, 70]
  const scaleX = (v: number, i: number) => (i % 2 === 0 ? X(512 + (v - 512) * volume) : v)
  ctx.beginPath()
  smoothPath(ctx, mass.map(scaleX))
  const hg = ctx.createRadialGradient(512, 360, 120, 512, 480, 600)
  hg.addColorStop(0, rgba(mixRGB(hair.base, hair.dark, 0.25)))
  hg.addColorStop(1, rgba(hair.dark))
  ctx.fillStyle = hg
  ctx.fill()
  ctx.restore()
  // Locks, outermost first, flowing from the parting around the head.
  type Lock = { side: number; t: number }
  const locks: Lock[] = []
  for (let i = 0; i < 46; i++) locks.push({ side: i % 2 ? 1 : -1, t: r() })
  locks.sort((a, b) => b.t - a.t)
  for (const lock of locks) {
    const s = lock.side
    const spreadOut = 0.35 + lock.t * 0.65
    const x0 = 512 + s * r.range(0, 40), y0 = 130 + r.range(-10, 20)
    const x1 = 512 + s * (260 + 150 * spreadOut) * volume, y1 = 300 + lock.t * 120
    const x2 = 512 + s * (330 + 140 * spreadOut) * volume, y2 = 520 + lock.t * 140
    const x3 = 512 + s * (250 + 200 * spreadOut + r.range(-30, 30)) * volume, y3 = bottom - r.range(0, 80)
    const width = r.range(34, 70) * volume
    const at = (u: number) => {
      const a = (1 - u) ** 3, b = 3 * (1 - u) ** 2 * u, c = 3 * (1 - u) * u * u, d = u ** 3
      const w = Math.sin(u * Math.PI * 3 + lock.t * 6) * 18 * wave * u
      return { x: a * x0 + b * x1 + c * x2 + d * x3 + w * s, y: a * y0 + b * y1 + c * y2 + d * y3 }
    }
    const left: [number, number][] = [], right: [number, number][] = []
    for (let k = 0; k <= 24; k++) {
      const u = k / 24, p = at(u), q = at(Math.min(1, u + 0.02))
      const dx = q.x - p.x, dy = q.y - p.y, l = Math.hypot(dx, dy) || 1
      const w = width * (0.25 + Math.sin(Math.PI * Math.min(1, u * 1.1 + 0.08)) * 0.75) * (u > 0.85 ? (1 - u) / 0.15 * 0.7 + 0.3 : 1)
      left.push([X(p.x - (dy / l) * w / 2), p.y + (dx / l) * w / 2])
      right.push([X(p.x + (dy / l) * w / 2), p.y - (dx / l) * w / 2])
    }
    ctx.beginPath()
    ctx.moveTo(left[0][0], left[0][1])
    for (const [x, y] of left) ctx.lineTo(x, y)
    for (let k = right.length - 1; k >= 0; k--) ctx.lineTo(right[k][0], right[k][1])
    ctx.closePath()
    const mid = at(0.45)
    const lg = ctx.createLinearGradient(mid.x - s * width, mid.y, mid.x + s * width, mid.y)
    lg.addColorStop(0, rgba(hair.dark)); lg.addColorStop(0.45, rgba(hair.base)); lg.addColorStop(1, rgba(mixRGB(hair.base, hair.dark, 0.6)))
    ctx.fillStyle = lg
    ctx.fill()
    // Fine strands inside the lock.
    for (let k = 0; k < 14; k++) {
      const off = r.range(-0.45, 0.45) * width
      const tone = r() < 0.4 ? hair.light : r() < 0.5 ? hair.dark : shade(hair.base, 0.1)
      ctx.strokeStyle = rgba(tone, r.range(0.18, 0.45))
      ctx.lineWidth = r.range(0.8, 2)
      ctx.beginPath()
      for (let j = 0; j <= 20; j++) {
        const u = j / 20, p = at(u), q = at(Math.min(1, u + 0.02))
        const dx = q.x - p.x, dy = q.y - p.y, l = Math.hypot(dx, dy) || 1
        const o = off * (0.3 + Math.sin(Math.PI * Math.min(1, u * 1.1 + 0.08)) * 0.7)
        const x = X(p.x - (dy / l) * o), y = p.y + (dx / l) * o
        if (j === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
      }
      ctx.stroke()
    }
  }
  // The sheen: a bright band across the crown where the light catches the curve of the hair.
  ctx.save()
  ctx.beginPath()
  smoothPath(ctx, mass.map(scaleX))
  ctx.clip()
  blurred(ctx, 10, () => {
    ctx.globalCompositeOperation = 'screen'
    for (let k = 0; k < 3; k++) {
      ctx.strokeStyle = rgba(hair.light, 0.28 - k * 0.07)
      ctx.lineWidth = 34 - k * 10
      ctx.beginPath()
      ctx.ellipse(512, 360, Math.min(350 * volume, 400) - k * 6, 250 - k * 4, 0, Math.PI * 1.08, Math.PI * 1.92)
      ctx.stroke()
    }
  })
  ctx.restore()
}

/** The spa headband: a terry band across the hairline with a cute knotted bow. */
function paintHeadband(ctx: Ctx, band: RGB, seed: number) {
  const r = makeRng(seed + 61)
  const light = shade(band, 0.45), mid = shade(band, 0.15), dark = shade(band, -0.18)
  // The band wraps around the head: it follows the hairline and tucks behind the ears at the sides.
  const top = (t: number) => bandEdge('top', t)
  const bot = (t: number) => bandEdge('bottom', t)
  const path = () => {
    ctx.beginPath()
    for (let k = 0; k <= 40; k++) { const p = top(k / 40); if (k === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y) }
    for (let k = 40; k >= 0; k--) { const p = bot(k / 40); ctx.lineTo(p.x, p.y) }
    ctx.closePath()
  }
  // A soft shadow on the forehead under the band.
  blurred(ctx, 12, () => { ctx.fillStyle = 'rgba(110,60,70,0.3)'; ctx.translate(0, 12); path(); ctx.fill() })
  ctx.save()
  path()
  ctx.fillStyle = rgba(mid)
  ctx.fill()
  ctx.clip()
  // Rounded like a rolled towel: light along the top, shade underneath.
  for (let k = 0; k <= 40; k++) {
    const t = k / 40, a = top(t), b = bot(t)
    const g = ctx.createLinearGradient(a.x, a.y, b.x, b.y)
    g.addColorStop(0, rgba(light)); g.addColorStop(0.35, rgba(shade(band, 0.3))); g.addColorStop(0.75, rgba(mid)); g.addColorStop(1, rgba(dark))
    ctx.strokeStyle = g
    ctx.lineWidth = 22
    ctx.beginPath(); ctx.moveTo(a.x, a.y - 4); ctx.lineTo(b.x, b.y + 4); ctx.stroke()
  }
  terry(ctx, 150, 180, 724, 300, mid, seed + 7, 0.02)
  // Soft gathers and folds across the band.
  blurred(ctx, 3, () => {
    for (let i = 0; i < 16; i++) {
      const t = r.range(0.05, 0.95), a = top(t), b = bot(t)
      const bend = r.range(-14, 14)
      ctx.strokeStyle = i % 2 ? rgba(light, 0.55) : rgba(dark, 0.4)
      ctx.lineWidth = r.range(3, 6)
      ctx.beginPath(); ctx.moveTo(a.x + bend * 0.3, a.y + 6); ctx.quadraticCurveTo((a.x + b.x) / 2 + bend, (a.y + b.y) / 2, b.x + bend * 0.2, b.y - 6); ctx.stroke()
    }
  })
  // Where it goes behind the head, it darkens into the hair.
  for (const side of [0, 1]) {
    const x = side ? 854 : 170
    const g = ctx.createLinearGradient(x, 0, side ? x - 110 : x + 110, 0)
    g.addColorStop(0, 'rgba(60,30,40,0.35)'); g.addColorStop(1, 'rgba(60,30,40,0)')
    ctx.fillStyle = g
    ctx.fillRect(side ? x - 110 : x, 150, 110, 340)
  }
  ctx.restore()
  // A small knotted bow on top.
  const bx = 512, by = 238
  for (const side of [-1, 1]) {
    ctx.save()
    ctx.translate(bx, by)
    ctx.scale(side * 0.62, 0.62)
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.bezierCurveTo(40, -90, 120, -86, 118, -30)
    ctx.bezierCurveTo(116, 10, 50, 20, 0, 0)
    const bg = ctx.createLinearGradient(0, -90, 0, 20)
    bg.addColorStop(0, rgba(light)); bg.addColorStop(1, rgba(dark))
    ctx.fillStyle = bg
    ctx.fill()
    ctx.clip()
    terry(ctx, 0, -100, 130, 130, band, seed + 9 + side, 0.02)
    blurred(ctx, 3, () => { ctx.strokeStyle = rgba(dark, 0.45); ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(10, -4); ctx.quadraticCurveTo(60, -40, 100, -44); ctx.stroke() })
    blob(ctx, 64, -52, 26, 16, light, 0.7)
    ctx.restore()
  }
  ctx.beginPath()
  ctx.ellipse(bx, by, 20, 17, 0, 0, Math.PI * 2)
  const kg = ctx.createRadialGradient(bx - 6, by - 6, 3, bx, by, 21)
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
  for (let i = 0; i < 18000; i++) {
    let x: number, y: number
    if (i % 3 === 0) { x = 512 + r.range(-80, 80); y = 560 + r.range(-40, 130) } else if (i % 3 === 1) { const side = r() < 0.5 ? -1 : 1; x = 512 + side * r.range(70, 230); y = r.range(560, 780) } else { x = r.range(220, 800); y = r.range(300, 920) }
    ctx.fillStyle = `rgba(0,0,0,${r.range(0.05, 0.12)})`
    ctx.beginPath(); ctx.arc(x, y, r.range(0.9, 1.7), 0, Math.PI * 2); ctx.fill()
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

/** A blob of cartoon grime: soft contact shadow, a dark core, a lighter rim and a small wet highlight. */
function grimeClump(ctx: Ctx, x: number, y: number, r: number, body: RGB, seed: number) {
  const rr = makeRng(seed)
  const pts: number[] = []
  const n = 10
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; const d = r * rr.range(0.72, 1.12); pts.push(x + Math.cos(a) * d, y + Math.sin(a) * d * rr.range(0.7, 0.95)) }
  blurred(ctx, r * 0.3, () => { ctx.fillStyle = rgba(shade(body, -0.5), 0.32); ctx.beginPath(); smoothPath(ctx, pts.map((v, i) => v + (i % 2 ? r * 0.22 : r * 0.14))); ctx.fill() })
  ctx.save()
  ctx.beginPath(); smoothPath(ctx, pts)
  const g = ctx.createRadialGradient(x + r * 0.1, y + r * 0.1, 0, x, y, r * 1.05)
  g.addColorStop(0, rgba(shade(body, -0.38))); g.addColorStop(0.55, rgba(shade(body, -0.12))); g.addColorStop(0.85, rgba(body)); g.addColorStop(1, rgba(shade(body, 0.22)))
  ctx.fillStyle = g
  ctx.fill()
  ctx.clip()
  for (let i = 0; i < r * 0.8; i++) { ctx.fillStyle = rgba(shade(body, rr.range(-0.4, 0.15)), rr.range(0.2, 0.5)); ctx.beginPath(); ctx.arc(x + rr.range(-r, r), y + rr.range(-r, r), rr.range(1, 2.6), 0, Math.PI * 2); ctx.fill() }
  ctx.restore()
  ctx.strokeStyle = rgba(shade(body, -0.3), 0.45); ctx.lineWidth = 1.4
  ctx.beginPath(); smoothPath(ctx, pts); ctx.stroke()
  ctx.fillStyle = 'rgba(255,252,240,0.7)'
  ctx.beginPath(); ctx.ellipse(x - r * 0.35, y - r * 0.38, r * 0.2, r * 0.11, -0.6, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = 'rgba(255,252,240,0.45)'
  ctx.beginPath(); ctx.arc(x - r * 0.08, y - r * 0.5, r * 0.06, 0, Math.PI * 2); ctx.fill()
}

/** A flat smear of grime: a soft-edged wipe with darker streaks along it. */
function grimeSmear(ctx: Ctx, x: number, y: number, len: number, body: RGB, seed: number) {
  const rr = makeRng(seed)
  const a = rr.range(-0.8, 0.8)
  const dx = Math.cos(a), dy = Math.sin(a)
  blurred(ctx, 6, () => {
    ctx.strokeStyle = rgba(body, 0.5)
    ctx.lineCap = 'round'
    ctx.lineWidth = len * 0.35
    ctx.beginPath(); ctx.moveTo(x - dx * len / 2, y - dy * len / 2); ctx.quadraticCurveTo(x + dy * len * 0.15, y - dx * len * 0.15, x + dx * len / 2, y + dy * len / 2); ctx.stroke()
  })
  // A few soft darker streaks along the wipe direction (blurred, so they read as smears, not sticks).
  blurred(ctx, 3, () => {
    for (let k = 0; k < 3; k++) {
      const off = rr.range(-0.1, 0.1) * len
      ctx.strokeStyle = rgba(shade(body, rr.range(-0.2, -0.05)), rr.range(0.1, 0.2))
      ctx.lineWidth = rr.range(6, 12)
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(x - dx * len * 0.3 - dy * off, y - dy * len * 0.3 + dx * off)
      ctx.quadraticCurveTo(x + dy * len * 0.1, y - dx * len * 0.1, x + dx * len * 0.3 - dy * off, y + dy * len * 0.3 + dx * off)
      ctx.stroke()
    }
  })
}

/** Soften a layer sheet's edges (where the skin region clips it) so it fades out instead of cutting off. */
function feather(sheet: HTMLCanvasElement, px: number) {
  const [m, mctx] = canvas(sheet.width, sheet.height)
  mctx.filter = `blur(${px}px)`
  mctx.drawImage(sheet, 0, 0)
  const ctx = sheet.getContext('2d')!
  ctx.save()
  ctx.globalCompositeOperation = 'destination-in'
  ctx.drawImage(m, 0, 0)
  ctx.drawImage(m, 0, 0)
  ctx.restore()
}

function paintLayers(skin: SkinTone, seed: number): Record<string, HTMLCanvasElement> {
  const layers: Record<string, HTMLCanvasElement> = {}
  const r = makeRng(seed + 30)
  // Grime: cute and cartoony, never gross. A dusty veil with clumps that have real volume.
  layers.grime = clipped(S, (ctx) => {
    ctx.drawImage(tintedByNoise(S, [150, 124, 92], fbm(S, 70, 4, seed + 31), 0.05, 0.38), 0, 0)
    for (let i = 0; i < 70; i++) grimeSmear(ctx, r.range(230, 790), r.range(310, 920), r.range(40, 110), [140, 112, 80], seed + 200 + i)
    for (let i = 0; i < 90; i++) grimeClump(ctx, r.range(230, 790), r.range(310, 920), r.range(8, 24), [132, 104, 72], seed + 300 + i)
  }, faceBelowBand)
  // Ground-in grime (disaster cases): darker, heavier.
  layers.grime2 = clipped(S, (ctx) => {
    ctx.drawImage(tintedByNoise(S, [100, 80, 58], fbm(S, 50, 4, seed + 35), 0.2, 0.6), 0, 0)
    for (let i = 0; i < 60; i++) grimeSmear(ctx, r.range(230, 790), r.range(310, 920), r.range(60, 140), [96, 74, 52], seed + 400 + i)
    for (let i = 0; i < 90; i++) grimeClump(ctx, r.range(230, 790), r.range(310, 920), r.range(12, 30), [96, 74, 52], seed + 500 + i)
  }, faceBelowBand)
  layers.flakes = clipped(S, (ctx) => {
    ctx.drawImage(tintedByNoise(S, [250, 238, 228], fbm(S, 24, 3, seed + 36), 0.05, 0.3), 0, 0)
    for (let i = 0; i < 420; i++) {
      const x = r.range(220, 800), y = r.range(300, 930), s = r.range(2.5, 7)
      ctx.fillStyle = 'rgba(180,150,140,0.35)'
      ctx.beginPath(); ctx.moveTo(x + 1, y + 2); ctx.lineTo(x + s + 1, y + 1); ctx.lineTo(x + s * 0.6 + 1, y + s + 2); ctx.closePath(); ctx.fill()
      ctx.fillStyle = rgba([255, 250, 244], r.range(0.7, 1))
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + s, y - 1); ctx.lineTo(x + s * 0.6, y + s); ctx.closePath(); ctx.fill()
    }
  })
  layers.oil = clipped(512, (ctx) => {
    ctx.drawImage(tintedByNoise(512, [250, 228, 170], fbm(512, 32, 3, seed + 41), 0.04, 0.22), 0, 0)
  })
  layers.redness = clipped(512, (ctx) => {
    ctx.drawImage(tintedByNoise(512, mixRGB(skin.blush, [232, 96, 104], 0.5), fbm(512, 40, 3, seed + 51), 0.1, 0.36), 0, 0)
    for (let i = 0; i < 90; i++) { ctx.fillStyle = rgba([220, 80, 96], r.range(0.15, 0.4)); ctx.beginPath(); ctx.arc(r.range(100, 412), r.range(150, 470), r.range(1, 2.5), 0, Math.PI * 2); ctx.fill() }
  })
  layers.marks = clipped(512, (ctx) => {
    ctx.drawImage(tintedByNoise(512, [222, 92, 104], fbm(512, 12, 2, seed + 61), 0.32, 0.6), 0, 0)
  })
  layers.serum = clipped(512, (ctx) => {
    ctx.drawImage(tintedByNoise(512, [255, 238, 196], fbm(512, 40, 2, seed + 71), 0.14, 0.26), 0, 0)
  })
  layers.glow = clipped(512, (ctx) => {
    ctx.drawImage(tintedByNoise(512, [255, 236, 236], fbm(512, 60, 2, seed + 81), 0.12, 0.26), 0, 0)
  })
  layers.cream = clipped(S, (ctx) => {
    // Rich white cream: smooth, with soft swirls where it was scooped and spread.
    ctx.fillStyle = '#fffaf4'
    ctx.fillRect(0, 0, S, S)
    ctx.globalCompositeOperation = 'multiply'
    ctx.globalAlpha = 0.25
    ctx.drawImage(fbm(S, 60, 3, seed + 90), 0, 0)
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
    const rc = makeRng(seed + 91)
    blurred(ctx, 3, () => {
      for (let i = 0; i < 70; i++) {
        const x = rc.range(220, 810), y = rc.range(300, 920), rr = rc.range(18, 44)
        ctx.strokeStyle = rc() < 0.5 ? 'rgba(232,220,214,0.5)' : 'rgba(255,255,255,0.8)'
        ctx.lineWidth = rc.range(3, 7)
        ctx.beginPath(); ctx.arc(x, y, rr, rc() * 6, rc() * 6 + rc.range(1.2, 2.4)); ctx.stroke()
      }
    })
  })
  layers.mask = paintClay(false, seed)
  layers.foam = clipped(S, (ctx) => {
    ctx.fillStyle = 'rgba(253,251,255,0.9)'
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
  feather(layers.foam, 14)
  feather(layers.cream, 8)
  return layers
}

/** The mint clay mask, wet (glossy, brush-streaked) or dry (paler, matte, cracked). */
/** The peel mask's outline: the face, minus organic cut-outs around each eye and brow and around the lips. */
function maskClip(ctx: Ctx) {
  ctx.beginPath()
  smoothPath(ctx, FACE.outline)
  // Around each eye and brow together: a soft rounded window.
  for (const [i, e] of FACE.eyes.entries()) {
    const side = i === 0 ? -1 : 1
    const b = FACE.brows[i]
    const pts = [
      e.x - side * 96, e.y + 6, e.x - side * 70, b.y - 22, e.x - side * 10, b.y - 34, e.x + side * 64, b.y - 30, e.x + side * 104, b.y + 4,
      e.x + side * 100, e.y + 16, e.x + side * 60, e.y + 42, e.x - side * 8, e.y + 46, e.x - side * 62, e.y + 36,
    ]
    const path = side < 0 ? pts : pts.reduceRight<number[]>((acc, _, k, arr) => (k % 2 === 1 ? acc.concat([arr[k - 1], arr[k]]) : acc), [])
    smoothPath(ctx, path)
  }
  // Around the lips: follows the cupid's bow.
  const l = FACE.lips
  smoothPath(ctx, [l.x - 104, l.y + 4, l.x - 60, l.y - 36, l.x, l.y - 30, l.x + 60, l.y - 36, l.x + 104, l.y + 4, l.x + 60, l.y + 50, l.x, l.y + 58, l.x - 60, l.y + 50])
  const cap = FACE.hairCap
  if (cap.t === 'poly') { ctx.moveTo(cap.pts[0], cap.pts[1]); for (let i = 2; i < cap.pts.length; i += 2) ctx.lineTo(cap.pts[i], cap.pts[i + 1]); ctx.closePath() }
  ctx.clip('evenodd')
}

function paintClay(dry: boolean, seed: number) {
  const sheet = clipped(S, (ctx) => {
    const base: RGB = dry ? [206, 236, 222] : [112, 206, 164]
    ctx.fillStyle = rgba(base, dry ? 1 : 0.9)
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
    } else {
      // Tiny air bubbles caught in the gel, and a sheen.
      for (let i = 0; i < 160; i++) { const x = r.range(220, 800), y = r.range(320, 900), rr = r.range(1.5, 4.5); blob(ctx, x, y, rr, rr, [236, 255, 246], 0.7, 0.4); blob(ctx, x - rr * 0.3, y - rr * 0.3, rr * 0.35, rr * 0.3, [255, 255, 255], 0.95) }
      blob(ctx, 420, 420, 200, 90, [230, 255, 244], 0.25)
    }
  }, maskClip)
  // Thickness at the edges: a darker rim just inside every cut edge, lighter on the top of each lip.
  const [rim, rctx] = canvas(S)
  rctx.drawImage(sheet, 0, 0)
  rctx.globalCompositeOperation = 'source-in'
  rctx.fillStyle = dry ? 'rgba(150,190,172,1)' : 'rgba(60,150,112,1)'
  rctx.fillRect(0, 0, S, S)
  const [inner, ictx] = canvas(S)
  ictx.filter = 'blur(5px)'
  ictx.drawImage(sheet, 0, 0)
  rctx.globalCompositeOperation = 'destination-out'
  rctx.drawImage(inner, 0, 0)
  rctx.drawImage(inner, 0, 0)
  const ctx = sheet.getContext('2d')!
  ctx.globalAlpha = dry ? 0.5 : 0.75
  ctx.globalCompositeOperation = 'source-atop'
  ctx.drawImage(rim, 0, 0)
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
  return sheet
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
  const inner = { x: ex - side * 64, y: ey - 2 }
  const outer = { x: ex + side * 68, y: ey - 9 }
  const sag = state === 'closed' ? 22 : state === 'squeeze' ? 12 : -22
  const cx = ex + side * 4, cy = ey + sag
  const point = (t: number) => ({ x: (1 - t) ** 2 * inner.x + 2 * (1 - t) * t * cx + t * t * outer.x, y: (1 - t) ** 2 * inner.y + 2 * (1 - t) * t * cy + t * t * outer.y })
  // The lid: lighter, rounded over the eyeball, with the crease above it.
  blob(ctx, ex, ey - 4 + (state === 'happy' ? -8 : 0), 62, 26, mixRGB(skin.base, skin.shadow, 0.25), 0.55, 0.3)
  blob(ctx, ex - side * 8, ey - 12 + (state === 'happy' ? -8 : 0), 40, 14, skin.light, 0.4)
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
  const w = 68, top = wide ? 37 : 31, bottom = wide ? 25 : 21
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
  const ir = wide ? 26 : 29, ix = ex + side * 2, iy = ey - (wide ? 0 : 3)
  const ig = ctx.createRadialGradient(ix, iy + 6, 2, ix, iy, ir)
  ig.addColorStop(0, rgba(shade(feat.iris, 0.35))); ig.addColorStop(0.55, rgba(feat.iris)); ig.addColorStop(0.9, rgba(shade(feat.iris, -0.35))); ig.addColorStop(1, rgba(shade(feat.iris, -0.6)))
  ctx.fillStyle = ig
  ctx.beginPath(); ctx.arc(ix, iy, ir, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = rgba(shade(feat.iris, 0.45), 0.35); ctx.lineWidth = 1
  for (let i = 0; i < 28; i++) { const a = (i / 28) * Math.PI * 2; ctx.beginPath(); ctx.moveTo(ix + Math.cos(a) * 8, iy + Math.sin(a) * 8); ctx.lineTo(ix + Math.cos(a) * (ir - 3), iy + Math.sin(a) * (ir - 3)); ctx.stroke() }
  ctx.fillStyle = '#1e1418'
  ctx.beginPath(); ctx.arc(ix, iy, wide ? 8 : 10.5, 0, Math.PI * 2); ctx.fill()
  // The upper lid casts a soft shadow on the eyeball.
  const shadowG = ctx.createLinearGradient(0, ey - top, 0, ey - top + 22)
  shadowG.addColorStop(0, 'rgba(90,50,60,0.45)'); shadowG.addColorStop(1, 'rgba(90,50,60,0)')
  ctx.fillStyle = shadowG
  ctx.fillRect(ex - w - 4, ey - top - 8, w * 2 + 8, 34)
  // Catchlights: a big one up-left, a small one down-right.
  ctx.fillStyle = 'rgba(255,255,255,0.95)'
  ctx.beginPath(); ctx.ellipse(ix - 10, iy - 11, 8.5, 6.5, -0.5, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.arc(ix + 10, iy + 10, 3.4, 0, Math.PI * 2); ctx.fill()
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
  const weight = 0.58 + feat.brow * 0.4
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
    ctx.strokeStyle = rgba(r() < 0.5 ? dark : color, r.range(0.45, 0.75))
    ctx.lineWidth = r.range(1.2, 2.4)
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(sx + hx * len * 0.5, sy + hy * len * 0.5 - 2, sx + hx * len, sy + hy * len); ctx.stroke()
  }
}

function mouthCrop(state: MouthState, skin: SkinTone, feat: Feat): Crop {
  return crop(MOUTH_CROP, ctx => drawMouth(ctx, FACE.lips.x, FACE.lips.y, state, skin, feat))
}

function drawMouth(ctx: Ctx, mx: number, my: number, state: MouthState, skin: SkinTone, feat: Feat) {
  const full = 1.05 + feat.lips * 0.3
  const lip = mixRGB(skin.lip, [236, 118, 140], 0.5), lipDark = shade(lip, -0.18), lipLight = shade(lip, 0.35)
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
  blob(ctx, mx - 6, my + lineSag + lowerH * 0.5, cw * 0.2, 3.5, [255, 255, 255], 0.85)
  blob(ctx, mx + 22, my + lineSag + lowerH * 0.62, cw * 0.08, 2, [255, 255, 255], 0.7)
  blob(ctx, mx - 16, my - upperH + 6, 12, 3, lipLight, 0.5)
  for (const s of [-1, 1]) blob(ctx, mx + s * (cw + 4), my + corner, 8, 8, skin.deep, state === 'smile' ? 0.45 : 0.3)
  if (state === 'wince') { ctx.strokeStyle = rgba(skin.deep, 0.3); ctx.lineWidth = 1.5; for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(mx + s * (cw + 6), my + 6); ctx.quadraticCurveTo(mx + s * (cw + 14), my + 16, mx + s * (cw + 10), my + 26); ctx.stroke() } }
}
