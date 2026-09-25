import type { Look } from '../core/customers.ts'
import { FACE, SHAPES, bandEdge, faceOutline } from '../core/treatments/anatomy.ts'
import { lookFigure, type Figure } from '../core/figure.ts'
import { paintHairBack, paintHairCap, paintHairSides, scalpPath } from './hair.ts'
import { makeRng } from '../core/rng.ts'
import type { FaceProfile } from '../core/treatments/profile.ts'
import type { Shape } from '../core/geometry.ts'
import { HAIR, OUTFIT, SKIN, type SkinTone } from './palette.ts'
import { blob, blurred, canvas, dab, dots, fbm, softBatch, hex, mixRGB, packHeight, rgba, shade, smoothPath, taper, terryLoops, tintedByNoise, warm, type Ctx, type RGB } from './paint.ts'

/**
 * The face close-up, painted in code: the base (skin, hair, headband, towel), a height map for the skin
 * shader's pores and form, one art sheet per treatment layer, and the expression overlays (eyes, brows,
 * mouth) that crossfade as the customer reacts. Everything lines up with core/treatments/anatomy.ts.
 */
export type Crop = { canvas: HTMLCanvasElement; x: number; y: number }
export type EyeState = 'open' | 'wide' | 'half' | 'closed' | 'squeeze' | 'happy'
export type BrowState = 'relaxed' | 'worried' | 'happy'
export type MouthState = 'neutral' | 'smile' | 'wince' | 'beam' | 'o' | 'pout'

export type FaceArt = {
  base: HTMLCanvasElement
  height: HTMLCanvasElement
  /** Painters for the layer sheets (called when each is first needed). */
  layers: Record<string, () => HTMLCanvasElement>
  /** The mask once dry or set (the mask layer crossfades to it). */
  maskDry: () => HTMLCanvasElement
  eyes: Record<EyeState, Crop>
  brows: Record<BrowState, Crop>
  /** The same brows after the brow tidy: every hair brushed up and out, set with a clear gel sheen. */
  browsGroomed: Record<BrowState, Crop>
  mouth: Record<MouthState, Crop>
  /** The mouth that blends between shapes (the close-up draws this one; the crops above are its key shapes). */
  liveMouth: LiveMouth
  skin: SkinTone
}

const S = 1024

/**
 * This customer's face outline (one of a few shapes, see anatomy.faceOutline). Every shape contains the
 * shared outline the treatment logic uses, so layers never reach past the painted face. Set per painting.
 */
let OUTLINE = FACE.outline

function faceClip(ctx: Ctx) {
  ctx.beginPath()
  smoothPath(ctx, OUTLINE)
  ctx.clip()
}

/** Clip to the face below the headband (grime lives here). */
function faceBelowBand(ctx: Ctx) {
  const cap = FACE.hairCap
  ctx.beginPath()
  smoothPath(ctx, OUTLINE)
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

/** How fair a tone is, 0 (deepest) to 1 (fairest). */
function fairOf(skin: SkinTone) { return Math.min(1, (skin.base[0] + skin.base[1] + skin.base[2]) / 3 / 215) }
const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

/**
 * Brows and lashes: a darker, desaturated take on the hair colour. Fantasy colours (pink, lilac) settle into a
 * soft taupe, and deep skin tones get dark brown to near-black brows whatever the hair.
 */
function browTone(hair: typeof HAIR[number], skin: SkinTone): { color: RGB; dark: RGB; lash: RGB; sheen: number } {
  const b = hair.base
  const lum = (b[0] + b[1] + b[2]) / 3
  let c = mixRGB(b, [lum * 0.98, lum * 0.86, lum * 0.74], 0.6)
  if (b[2] > b[1] + 10) c = mixRGB(c, [110, 84, 76], 0.6)
  c = shade(c, lum > 150 ? -0.5 : -0.18)
  c = mixRGB(c, [50, 34, 28], clamp01((0.74 - fairOf(skin)) / 0.28))
  const dark = shade(c, -0.35)
  return { color: c, dark, lash: mixRGB(dark, [22, 14, 14], 0.65), sheen: clamp01((0.6 - fairOf(skin)) / 0.25) }
}

/**
 * The colour to multiply into the skin for soft occlusion in creases: the tone's own deep shade relative to
 * its base, pushed a little warmer, so shadows deepen the colour instead of greying it.
 */
function aoColor(skin: SkinTone): RGB {
  const k = [1.08, 0.97, 0.9]
  return [0, 1, 2].map(i => Math.min(255, (skin.deep[i] / skin.base[i]) * 255 * k[i])) as RGB
}

/** Iris colours: brown, hazel, green, blue, grey. */
export const IRIS: RGB[] = [[112, 70, 44], [150, 110, 60], [96, 132, 84], [92, 136, 190], [120, 130, 146]]
/** A customer's eye colour, from their seed (the floor sprite uses it too, so the two always agree). */
export const irisForSeed = (seed: number): RGB => IRIS[makeRng(seed + 17).int(0, IRIS.length - 1)]

/** Per-customer feature shape, from the profile (all 0 to 1). */
type Feat = { brow: number; lips: number; lashes: number; blush: number; nose: number; iris: RGB; masc: boolean; age: number; stubble: number; bow: boolean; earShift: number }

/** The four face masks (plan.ts gives each customer one): clay, a sheet mask, a charcoal bubble mask, gold foil. */
export type MaskKind = 'clay' | 'sheet' | 'bubble' | 'gold'

export function paintFace(look: Look, seed: number, profile: FaceProfile, maskKind: MaskKind = 'clay'): FaceArt {
  const skin = SKIN[look.skin % SKIN.length]
  const hair = HAIR[look.hair % HAIR.length]
  const band = hex(OUTFIT[look.outfit % OUTFIT.length])
  const fig: Figure = lookFigure(look)
  const fr = makeRng(seed + 23)
  // Face shape: oval, round, heart (wide cheekbones) or square (more often masculine).
  const shape = fig.masc ? fr.pick([3, 3, 1]) : fr.pick([0, 1, 2, 1, 3])
  OUTLINE = faceOutline(shape)
  const feat: Feat = {
    ...profile.features, iris: irisForSeed(seed),
    masc: fig.masc, age: fig.age, stubble: fig.masc && fig.age < 0.8 && fr() < 0.55 ? fr.range(0.4, 1) : 0,
    bow: !fig.masc && fig.age < 0.75 && fr() < 0.65, earShift: [0, 6, 13, 3][shape],
  }
  if (fig.masc) { feat.brow = Math.min(1, feat.brow + 0.45); feat.lashes = feat.lashes * 0.3; feat.lips = feat.lips * 0.4; feat.blush *= 0.5 }
  const base = paintBase(look, skin, hair, band, seed, profile, feat, fig)
  const height = paintHeight(seed)
  OUTLINE = FACE.outline
  const layers = paintLayers(skin, seed)
  layers.mask = () => paintMask(maskKind, false, seed)
  const maskDry = () => paintMask(maskKind, true, seed)
  const tone = browTone(hair, skin)
  const eye = (st: EyeState) => eyeCrop(st, tone.lash, skin, feat)
  const eyes = { open: eye('open'), wide: eye('wide'), half: eye('half'), closed: eye('closed'), squeeze: eye('squeeze'), happy: eye('happy') }
  const brows = { relaxed: browCrop('relaxed', tone, seed, feat), worried: browCrop('worried', tone, seed, feat), happy: browCrop('happy', tone, seed, feat) }
  const browsGroomed = { relaxed: browCrop('relaxed', tone, seed, feat, true), worried: browCrop('worried', tone, seed, feat, true), happy: browCrop('happy', tone, seed, feat, true) }
  const m = (st: MouthState) => mouthCrop(st, skin, feat)
  const mouth = { neutral: m('neutral'), smile: m('smile'), wince: m('wince'), beam: m('beam'), o: m('o'), pout: m('pout') }
  return { base, height, layers, maskDry, eyes, brows, browsGroomed, mouth, liveMouth: liveMouth(skin, feat), skin }
}

// ------------------------------------------------------------------ base

function paintBase(look: Look, skin: SkinTone, hair: typeof HAIR[number], band: RGB, seed: number, profile: FaceProfile, feat: Feat, fig: Figure) {
  const [c, ctx] = canvas(S)
  const r = makeRng(seed)
  paintHairBack(ctx, hair, look.hairStyle, seed, fig)

  // Neck, shadowed under the jaw.
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(414, 780); ctx.lineTo(610, 780); ctx.bezierCurveTo(614, 860, 626, 900, 660, 930); ctx.lineTo(700, 1030); ctx.lineTo(324, 1030); ctx.lineTo(364, 930); ctx.bezierCurveTo(398, 900, 410, 860, 414, 780)
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

  // Ears.
  for (const [i, e0] of FACE.ears.entries()) {
    const side = i === 0 ? -1 : 1
    const e = { x: e0.x + side * feat.earShift, y: e0.y }
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
    // Light shining through the thin rim and the lobe comes out red (subsurface scattering).
    const sss = sssColor(skin)
    blurred(ctx, 6, () => { ctx.strokeStyle = rgba(sss, 0.42); ctx.lineWidth = 12; ctx.beginPath(); ctx.ellipse(e.x + side * 12, e.y + 10, 30, 57, side * 0.12, -Math.PI * 0.55, Math.PI * 0.45); ctx.stroke() })
    blob(ctx, e.x + side * 10, e.y + 56, 18, 14, sss, 0.4)
    ctx.restore()
  }

  // The face, lit by one warm key light from the top left.
  ctx.save()
  ctx.beginPath()
  smoothPath(ctx, OUTLINE)
  ctx.fillStyle = rgba(skin.base)
  ctx.fill()
  ctx.clip()
  // Key light and its falloff across the face.
  blob(ctx, 420, 400, 460, 420, skin.light, 0.5)
  blob(ctx, 760, 760, 420, 380, skin.shadow, 0.42)
  blurred(ctx, 36, () => { ctx.strokeStyle = rgba(skin.shadow, 0.7); ctx.lineWidth = 96; ctx.beginPath(); smoothPath(ctx, OUTLINE); ctx.stroke() })
  blob(ctx, 300, 470, 120, 200, skin.light, 0.35)
  // A warm band where the light turns away (light scattering under the skin).
  blurred(ctx, 20, () => { ctx.strokeStyle = rgba(mixRGB(skin.blush, skin.base, 0.3), 0.32); ctx.lineWidth = 54; ctx.beginPath(); smoothPath(ctx, OUTLINE.map((v, i) => (i % 2 ? 520 + (v - 520) * 0.88 : 512 + (v - 512) * 0.88))); ctx.stroke() })
  ctx.globalCompositeOperation = 'soft-light'
  ctx.globalAlpha = 0.12
  ctx.drawImage(fbm(S, 90, 3, seed + 11), 0, 0)
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
  paintSkinVariation(ctx, skin, seed)
  // Temples and the sides of the forehead turn away, a little cooler; the cheeks warmer.
  const cool = mixRGB(skin.shadow, [150, 130, 175], 0.3), warm = mixRGB(skin.blush, skin.light, 0.4)
  blob(ctx, 270, 440, 90, 120, cool, 0.14)
  blob(ctx, 754, 440, 90, 120, cool, 0.14)
  blob(ctx, 380, 680, 150, 110, warm, 0.12)
  blob(ctx, 644, 680, 150, 110, warm, 0.12)
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
  paintPlanes(ctx, skin)
  paintForm(ctx, skin, feat)
  paintPores(ctx, skin, seed)
  // A warm rim of light along the far edge of the face.
  blurred(ctx, 5, () => {
    ctx.strokeStyle = rgba(mixRGB(skin.light, [255, 214, 190], 0.5), 0.55)
    ctx.lineWidth = 7
    ctx.beginPath()
    const o = OUTLINE
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
  if (feat.stubble > 0) paintStubble(ctx, skin, hair, feat, seed)
  const lined = Math.max(profile.age * Math.min(1, 0.25 + feat.age * 1.2), Math.min(1, (feat.age - 0.45) * 1.8))
  if (lined > 0.05) {
    const a = lined
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
  // A thin, warm contour: darker than the skin, never black, heavier on the shadow side (only below the
  // band: above it, its outer half would show over the hair).
  ctx.save()
  ctx.beginPath(); ctx.rect(0, 440, S, S); ctx.clip()
  ctx.lineJoin = 'round'
  blurred(ctx, 1.2, () => {
    ctx.strokeStyle = rgba(mixRGB(skin.deep, skin.shadow, 0.4), 0.38)
    ctx.lineWidth = 2.2
    ctx.beginPath(); smoothPath(ctx, OUTLINE); ctx.stroke()
  })
  ctx.restore()

  // Hair above the band: swept back to the crown, bun or tie (or short, or curls), inside the face's top.
  paintHairCap(ctx, hair, look.hairStyle, seed, fig, faceClip)

  // The band wraps around the head: keep it inside the round of the skull so its ends never stick out.
  ctx.save()
  ctx.beginPath(); scalpPath(ctx, 6); ctx.clip()
  paintHeadband(ctx, band, seed, feat.bow, skin)
  ctx.restore()
  paintHairSides(ctx, hair, look.hairStyle, seed, fig, aoColor(skin))
  return c
}

/**
 * The spa headband: a rolled terry band across the hairline. Shaded across its width like a tube (lit along
 * the top, shadowed underneath), with looped pile, soft gathers where it bunches, rolled edges, darkening
 * where it wraps behind the head, a soft shadow on the forehead, and (for some) a knotted terry bow.
 */
function paintHeadband(ctx: Ctx, band: RGB, seed: number, bow: boolean, skin: SkinTone) {
  const r = makeRng(seed + 61)
  const light = shade(band, 0.45), mid = shade(band, 0.15), dark = shade(band, -0.2)
  const top = (t: number) => bandEdge('top', t)
  const bot = (t: number) => bandEdge('bottom', t)
  const lerpP = (t: number, f: number) => { const a = top(t), b = bot(t); return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f } }
  const path = (c: Ctx) => {
    c.beginPath()
    for (let k = 0; k <= 48; k++) { const p = top(k / 48); if (k === 0) c.moveTo(p.x, p.y); else c.lineTo(p.x, p.y) }
    for (let k = 48; k >= 0; k--) { const p = bot(k / 48); c.lineTo(p.x, p.y) }
    c.closePath()
  }
  // Soft occlusion on the forehead under the band, and a tight contact line.
  softBatch(ctx, 12, c => { c.translate(4, 14); c.fillStyle = rgba(aoColor(skin), 0.55); path(c); c.fill() }, 'multiply')
  softBatch(ctx, 2.5, c => {
    c.strokeStyle = rgba(aoColor(skin), 0.6); c.lineWidth = 5
    c.beginPath(); for (let k = 0; k <= 48; k++) { const p = bot(k / 48); if (k === 0) c.moveTo(p.x, p.y + 3); else c.lineTo(p.x, p.y + 3) } c.stroke()
  }, 'multiply')
  ctx.save()
  path(ctx)
  ctx.fillStyle = rgba(mid)
  ctx.fill()
  ctx.clip()
  // Across the width: lines following the band's curve, light at the top shading to dark underneath.
  ctx.lineCap = 'round'
  const shadeAt = (f: number): RGB => f < 0.25 ? mixRGB(shade(band, 0.3), light, 1 - f / 0.25) : f < 0.6 ? mixRGB(shade(band, 0.3), mid, (f - 0.25) / 0.35) : mixRGB(mid, dark, (f - 0.6) / 0.4)
  for (let i = 0; i <= 16; i++) {
    const f = i / 16
    ctx.strokeStyle = rgba(shadeAt(f))
    ctx.lineWidth = 6
    ctx.beginPath()
    for (let k = 0; k <= 48; k++) { const p = lerpP(k / 48, f); if (k === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y) }
    ctx.stroke()
  }
  terryLoops(ctx, 150, 180, 724, 320, 0.6)
  // Gathers: soft ridges where the band bunches, lit on the left, shaded on the right.
  softBatch(ctx, 3, c => {
    for (let i = 0; i < 14; i++) {
      const t = 0.06 + (i / 13) * 0.88 + r.range(-0.02, 0.02)
      const bend = r.range(-10, 10), dt = 0.008
      const a = top(t), b = bot(t), a2 = top(t + dt), b2 = bot(t + dt)
      c.strokeStyle = rgba(light, 0.55); c.lineWidth = r.range(3, 5)
      c.beginPath(); c.moveTo(a.x, a.y + 5); c.quadraticCurveTo((a.x + b.x) / 2 + bend, (a.y + b.y) / 2, b.x, b.y - 5); c.stroke()
      c.strokeStyle = rgba(dark, 0.45); c.lineWidth = r.range(3, 6)
      c.beginPath(); c.moveTo(a2.x, a2.y + 5); c.quadraticCurveTo((a2.x + b2.x) / 2 + bend, (a2.y + b2.y) / 2, b2.x, b2.y - 5); c.stroke()
    }
    // Rolled edges: a lit lip along the top, a shadowed one along the bottom.
    c.strokeStyle = rgba(shade(band, 0.6), 0.8); c.lineWidth = 4
    c.beginPath(); for (let k = 2; k <= 46; k++) { const p = lerpP(k / 48, 0.08); if (k === 2) c.moveTo(p.x, p.y); else c.lineTo(p.x, p.y) } c.stroke()
    c.strokeStyle = rgba(shade(band, -0.35), 0.55); c.lineWidth = 4
    c.beginPath(); for (let k = 2; k <= 46; k++) { const p = lerpP(k / 48, 0.94); if (k === 2) c.moveTo(p.x, p.y); else c.lineTo(p.x, p.y) } c.stroke()
  })
  // Where it goes behind the head, it darkens into the hair.
  for (const side of [0, 1]) {
    const x = side ? 854 : 170
    const g = ctx.createLinearGradient(x, 0, side ? x - 120 : x + 120, 0)
    g.addColorStop(0, 'rgba(60,30,40,0.45)'); g.addColorStop(1, 'rgba(60,30,40,0)')
    ctx.fillStyle = g
    ctx.fillRect(side ? x - 120 : x, 150, 120, 340)
  }
  ctx.restore()
  if (!bow) return
  // A knotted terry bow on top: two loops pleated into the knot, a shadow under it on the band.
  const bx = 512, by = 238
  softBatch(ctx, 6, c => { c.fillStyle = rgba(shade(band, -0.5), 0.4); c.beginPath(); c.ellipse(bx + 8, by + 16, 70, 22, 0, 0, Math.PI * 2); c.fill() })
  for (const side of [-1, 1]) {
    ctx.save()
    ctx.translate(bx, by)
    ctx.scale(side * 0.62, 0.62)
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.bezierCurveTo(40, -90, 120, -86, 118, -30)
    ctx.bezierCurveTo(116, 10, 50, 20, 0, 0)
    const bg = ctx.createLinearGradient(0, -90, 0, 20)
    bg.addColorStop(0, rgba(light)); bg.addColorStop(0.6, rgba(mid)); bg.addColorStop(1, rgba(dark))
    ctx.fillStyle = bg
    ctx.fill()
    ctx.clip()
    terryLoops(ctx, 0, -100, 130, 130, 0.6)
    ctx.lineCap = 'round'
    // Pleats fanning out from the knot, and the loop's inner shadow.
    for (let k = 0; k < 4; k++) {
      ctx.strokeStyle = rgba(k % 2 ? light : dark, 0.35); ctx.lineWidth = 5
      ctx.beginPath(); ctx.moveTo(8, -2); ctx.quadraticCurveTo(50, -30 - k * 8, 104, -36 - k * 10 + 20); ctx.stroke()
    }
    blob(ctx, 72, -34, 26, 14, dark, 0.5)
    blob(ctx, 60, -62, 30, 12, light, 0.7)
    ctx.restore()
  }
  ctx.beginPath()
  ctx.ellipse(bx, by, 20, 17, 0, 0, Math.PI * 2)
  const kg = ctx.createRadialGradient(bx - 6, by - 6, 3, bx, by, 21)
  kg.addColorStop(0, rgba(light)); kg.addColorStop(1, rgba(dark))
  ctx.fillStyle = kg
  ctx.fill()
  ctx.save(); ctx.clip(); terryLoops(ctx, bx - 22, by - 20, 44, 40, 0.5); ctx.restore()
}

/**
 * Stubble: a shadow of fine dots over the jaw, chin and upper lip, in the hair's darkest tone (a touch cool
 * on fair skin, a deeper brown on deep skin), thinning toward the cheeks.
 */
function paintStubble(ctx: Ctx, skin: SkinTone, hair: typeof HAIR[number], feat: Feat, seed: number) {
  const r = makeRng(seed + 61)
  const col = mixRGB(shade(hair.dark, -0.2), skin.deep, 0.35)
  const inBeard = (x: number, y: number) => {
    const dx = (x - 512) / 250, dy = (y - 840) / 190
    const jaw = dx * dx + dy * dy < 1 && y > 700
    const lip = Math.abs(x - 512) < 86 && y > 700 && y < 734
    return (jaw && !(Math.abs(x - 512) < 90 && y > 722 && y < 792)) || lip
  }
  ctx.save()
  ctx.globalCompositeOperation = 'multiply'
  softBatch(ctx, 14, c => { c.fillStyle = rgba(mixRGB(skin.base, [150, 150, 170], 0.25), 0.4 * feat.stubble); c.beginPath(); c.ellipse(512, 830, 230, 150, 0, 0, Math.PI * 2); c.fill() }, 'multiply')
  ctx.restore()
  dots(ctx, col, Math.round(2600 * feat.stubble), () => {
    let x = 0, y = 0
    for (let k = 0; k < 8; k++) { x = r.range(270, 754); y = r.range(700, 900); if (inBeard(x, y)) break }
    return { x, y, r: r.range(0.8, 1.5), a: inBeard(x, y) ? r.range(0.2, 0.45) * feat.stubble : 0 }
  }, 3)
}

/** The warm red of light that has travelled under the skin (ears, nose, cheeks), kept rich on every tone. */
function sssColor(skin: SkinTone): RGB { return mixRGB(skin.blush, [Math.min(255, skin.blush[0] * 1.15 + 20), skin.blush[1] * 0.7, skin.blush[2] * 0.6], 0.5) }

/**
 * Painterly variation: hundreds of soft, low-contrast dabs laid along the form (around the face, not at
 * random), in the three colour zones a portrait painter uses: a golden forehead, a red middle (cheeks, nose,
 * ears) and a cooler lower face. Reads as brushwork rather than noise.
 */
function paintSkinVariation(ctx: Ctx, skin: SkinTone, seed: number) {
  const r = makeRng(seed + 808)
  const gold = mixRGB(skin.base, [236, 200, 130], 0.35)
  const red = mixRGB(skin.base, skin.blush, 0.6)
  for (let i = 0; i < 340; i++) {
    const x = r.range(230, 800), y = r.range(330, 900)
    const zone = y < 480 ? 0 : y < 740 ? 1 : 2
    const k = r()
    const color = k < 0.34 ? skin.light : k < 0.6 ? (zone === 0 ? gold : zone === 1 ? red : skin.shadow) : k < 0.8 ? skin.shadow : mixRGB(skin.base, skin.light, 0.5)
    const rx = r.range(16, 46)
    dab(ctx, x, y, rx, rx * r.range(0.35, 0.55), Math.atan2(y - 540, x - 512) + Math.PI / 2 + r.range(-0.3, 0.3), color, r.range(0.035, 0.075))
  }
  // The zones themselves, very soft.
  blob(ctx, 500, 390, 230, 90, gold, 0.12)
  ctx.save()
  ctx.globalCompositeOperation = 'multiply'
  blob(ctx, 512, 830, 230, 110, [236, 238, 246], 0.5)
  ctx.restore()
}

/**
 * Painted planes: the flat facets a portrait painter blocks in before blending, kept just visible. Lit from
 * the top left, the front of the forehead, the apples of the cheeks, the upper lip and the chin face the
 * light; the temples, the sides of the cheeks and the jaw turn away (more on the far side). Each facet is a
 * soft-edged polygon at low strength, so the face reads as carved form rather than a smooth balloon.
 */
function paintPlanes(ctx: Ctx, skin: SkinTone) {
  const lit = (pts: number[], a: number) => ({ pts, a, lit: true })
  const dim = (pts: number[], a: number) => ({ pts, a, lit: false })
  const mirror = (pts: number[]) => pts.map((v, i) => (i % 2 ? v : 1024 - v))
  const cheekFront = [440, 562, 350, 556, 334, 618, 402, 688, 472, 656]
  const cheekSide = [318, 560, 262, 584, 246, 700, 286, 770, 332, 704]
  const temple = [296, 384, 356, 352, 364, 426, 312, 474]
  const jaw = [292, 748, 350, 786, 424, 856, 380, 870, 312, 812]
  const planes = [
    lit([392, 336, 632, 336, 660, 418, 364, 418], 0.12),
    lit([370, 424, 470, 418, 468, 446, 380, 452], 0.1),
    lit(cheekFront, 0.14), lit(mirror(cheekFront), 0.07),
    lit([470, 690, 554, 690, 570, 730, 454, 730], 0.07),
    lit([460, 822, 564, 822, 580, 868, 512, 890, 444, 868], 0.12),
    dim(temple, 0.06), dim(mirror(temple), 0.12),
    dim(cheekSide, 0.06), dim(mirror(cheekSide), 0.13),
    dim(jaw, 0.06), dim(mirror(jaw), 0.12),
  ]
  const ao = aoColor(skin)
  softBatch(ctx, 7, c => { for (const pl of planes) if (pl.lit) { c.fillStyle = rgba(mixRGB(skin.light, [255, 244, 234], 0.2), pl.a); c.beginPath(); smoothPath(c, pl.pts); c.fill() } })
  softBatch(ctx, 9, c => { for (const pl of planes) if (!pl.lit) { c.fillStyle = rgba(ao, pl.a); c.beginPath(); smoothPath(c, pl.pts); c.fill() } }, 'multiply')
}

/**
 * Pores that read softly at normal zoom: on the nose and the inner cheeks only, each a faint darker dot with
 * a lighter rim on its lit side, thinning out toward the edges of those zones (never an even noise).
 */
function paintPores(ctx: Ctx, skin: SkinTone, seed: number) {
  const r = makeRng(seed + 919)
  const zones = [{ x: 512, y: 610, rx: 58, ry: 70, n: 520 }, { x: 402, y: 640, rx: 92, ry: 58, n: 700 }, { x: 622, y: 640, rx: 92, ry: 58, n: 700 }, { x: 512, y: 860, rx: 60, ry: 26, n: 160 }]
  const pores: { x: number; y: number; r: number; a: number }[] = []
  for (const z of zones) for (let i = 0; i < z.n; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r())
    // Denser toward the middle of the zone.
    if (r() < d * 0.7) continue
    pores.push({ x: z.x + Math.cos(a) * z.rx * d, y: z.y + Math.sin(a) * z.ry * d, r: r.range(1.3, 2), a: r.range(0.11, 0.18) * (1 - d * 0.6) })
  }
  const pore = mixRGB(skin.shadow, skin.deep, 0.4)
  softBatch(ctx, 0.7, c => {
    dots(c, pore, pores.length, i => pores[i], 3)
    dots(c, mixRGB(skin.light, [255, 248, 240], 0.3), pores.length, i => ({ x: pores[i].x - 1.2, y: pores[i].y - 1.3, r: pores[i].r * 0.55, a: pores[i].a * 0.7 }), 2)
  })
}

/**
 * Form: soft occlusion in the creases (the folds from the nose to the mouth corners, under the lower lip, the
 * inner eye sockets and under the brow bone, the tear troughs, the jawline), each with a lit ridge beside it,
 * and warm light under the skin at the nose. Heavier on the side away from the light.
 */
function paintForm(ctx: Ctx, skin: SkinTone, feat: Feat) {
  const n = FACE.nose, l = FACE.lips
  const col = (a: number) => rgba(aoColor(skin), a)
  // Fine creases (one blur for all): the nose-to-mouth folds, the mouth corners, under the lower lip, the
  // tear troughs, the sides of the nostrils. Multiplied in the tone's warm shadow colour.
  softBatch(ctx, 7, c => {
    for (const side of [-1, 1]) {
      const far = side > 0 ? 1.3 : 1
      c.strokeStyle = col(0.15 * far); c.lineWidth = 12
      c.beginPath(); c.moveTo(512 + side * 56, n.y + 14); c.bezierCurveTo(512 + side * 78, n.y + 38, 512 + side * 86, l.y - 26, 512 + side * 84, l.y - 4); c.stroke()
      c.fillStyle = col(0.3 * far)
      c.beginPath(); c.ellipse(512 + side * 72, l.y + 4, 9, 12, 0, 0, Math.PI * 2); c.fill()
      c.fillStyle = col(0.34)
      c.beginPath(); c.ellipse(512 + side * 60, n.y + 22, 10, 16, 0, 0, Math.PI * 2); c.fill()
    }
    c.strokeStyle = col(0.42); c.lineWidth = 14
    c.beginPath(); c.moveTo(466, l.y + 58); c.quadraticCurveTo(516, l.y + 76, 562, l.y + 56); c.stroke()
    for (const [i, e] of FACE.eyes.entries()) {
      const side = i === 0 ? -1 : 1, far = side > 0 ? 1.25 : 1
      c.strokeStyle = col(0.2 * far); c.lineWidth = 9
      c.beginPath(); c.moveTo(e.x - side * 58, e.y + 30); c.quadraticCurveTo(e.x - side * 10, e.y + 50, e.x + side * 40, e.y + 44); c.stroke()
    }
  }, 'multiply')
  // Broad forms: the inner eye sockets beside the bridge, under the brow bone, the sides of the nose.
  softBatch(ctx, 11, c => {
    for (const [i, e] of FACE.eyes.entries()) {
      const side = i === 0 ? -1 : 1, far = side > 0 ? 1.25 : 1
      c.fillStyle = col(0.4 * far)
      c.beginPath(); c.ellipse(e.x - side * 74, e.y - 6, 20, 30, 0, 0, Math.PI * 2); c.fill()
      c.strokeStyle = col(0.24 * far); c.lineWidth = 20
      c.beginPath(); c.moveTo(e.x - side * 68, e.y - 26); c.quadraticCurveTo(e.x, e.y - 58, e.x + side * 84, e.y - 24); c.stroke()
    }
    c.fillStyle = col(0.22)
    c.beginPath(); c.ellipse(548, 596, 16, 60, 0.05, 0, Math.PI * 2); c.fill()
    c.beginPath(); c.ellipse(478, 596, 12, 52, -0.05, 0, Math.PI * 2); c.fill()
  }, 'multiply')
  // Jawline: the underside of the jaw turns away from the light.
  softBatch(ctx, 18, c => {
    c.strokeStyle = col(0.4); c.lineWidth = 34
    const o = OUTLINE
    c.beginPath()
    let started = false
    for (let k = 0; k <= o.length / 2; k++) {
      const x = o[(k * 2) % o.length], y = o[(k * 2 + 1) % o.length]
      if (y < 700) { started = false; continue }
      if (!started) { c.moveTo(x, y); started = true } else c.lineTo(x, y)
    }
    c.stroke()
  }, 'multiply')
  // The lit ridges beside the folds, and the round of the chin.
  softBatch(ctx, 9, c => {
    for (const side of [-1, 1]) {
      c.strokeStyle = rgba(skin.light, side < 0 ? 0.12 : 0.06); c.lineWidth = 14
      c.beginPath(); c.moveTo(512 + side * 74, n.y + 6); c.bezierCurveTo(512 + side * 102, n.y + 40, 512 + side * 112, l.y - 20, 512 + side * 108, l.y + 20); c.stroke()
    }
  })
  blob(ctx, 500, l.y + 96, 44, 22, skin.light, 0.35)
  // Warm light through the nose tip and the rims of the nostrils.
  const sss = sssColor(skin)
  blob(ctx, 512, n.y - 2, 30, 22, sss, 0.16 + feat.nose * 0.06)
  for (const sd of [-1, 1]) blob(ctx, 512 + sd * 42, n.y + 14, 13, 11, sss, 0.24)
  // A crisp little catch-light on the tip and bridge.
  blob(ctx, 503, n.y - 16, 6, 4, [255, 250, 244], 0.5)
  blob(ctx, 507, 548, 4, 20, [255, 250, 244], 0.22)
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
  dots(ctx, [0, 0, 0], 18000, i => {
    let x: number, y: number
    if (i % 3 === 0) { x = 512 + r.range(-80, 80); y = 560 + r.range(-40, 130) } else if (i % 3 === 1) { const side = r() < 0.5 ? -1 : 1; x = 512 + side * r.range(70, 230); y = r.range(560, 780) } else { x = r.range(220, 800); y = r.range(300, 920) }
    return { x, y, a: r.range(0.05, 0.12), r: r.range(0.9, 1.7) }
  })
  ctx.restore()
  // Gloss: where skin shines (the T-zone, the nose, the cheekbones, the chin), packed into the green channel.
  const [gm, gctx] = canvas(S)
  gctx.fillStyle = '#000'
  gctx.fillRect(0, 0, S, S)
  gctx.save()
  faceClip(gctx)
  gctx.fillStyle = 'rgba(255,255,255,0.14)'
  gctx.fillRect(0, 0, S, S)
  const gw = (x: number, y: number, rx: number, ry: number, a: number) => blob(gctx, x, y, rx, ry, [255, 255, 255], a)
  gw(490, 392, 140, 50, 0.55); gw(506, 572, 16, 66, 0.85); gw(505, 624, 24, 18, 1)
  gw(372, 604, 66, 26, 0.6); gw(652, 606, 56, 22, 0.45); gw(504, 852, 42, 22, 0.6); gw(512, 716, 28, 9, 0.4)
  gctx.restore()
  return packHeight(c, gm)
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

/**
 * Dirt, matte and earthy, never glassy: smudged wipes with darker streaks along them, and soft clumps with a
 * contact shadow (down and right, away from the key light), a body a little darker at the rim where it thins
 * and dries, a crumbly texture and only a dull lift on the lit side. Every soft pass is one blur for the
 * whole sheet (a blur per clump cost a quarter of a second).
 */
function paintDirt(ctx: Ctx, seed: number, o: { smears: number; clumps: number; rMin: number; rMax: number; lenMin: number; lenMax: number; color: (i: number) => RGB }) {
  const r = makeRng(seed)
  const smears = Array.from({ length: o.smears }, (_, i) => ({ x: r.range(230, 790), y: r.range(310, 920), len: r.range(o.lenMin, o.lenMax), a: r.range(-0.8, 0.8), body: o.color(i), rr: makeRng(seed + 200 + i) }))
  const clumps = Array.from({ length: o.clumps }, (_, i) => {
    const x = r.range(230, 790), y = r.range(310, 920), rad = r.range(o.rMin, o.rMax)
    const rr = makeRng(seed + 300 + i)
    const pts: number[] = []
    for (let k = 0; k < 11; k++) { const a = (k / 11) * Math.PI * 2; const d = rad * rr.range(0.68, 1.15); pts.push(x + Math.cos(a) * d, y + Math.sin(a) * d * rr.range(0.7, 0.95)) }
    return { x, y, r: rad, pts, body: o.color(i + 3), rr }
  })
  // Wipes, and the clumps' contact shadows.
  softBatch(ctx, 6, c => {
    for (const m of smears) {
      const dx = Math.cos(m.a), dy = Math.sin(m.a)
      c.strokeStyle = rgba(m.body, 0.5); c.lineWidth = m.len * 0.35
      c.beginPath(); c.moveTo(m.x - dx * m.len / 2, m.y - dy * m.len / 2); c.quadraticCurveTo(m.x + dy * m.len * 0.15, m.y - dx * m.len * 0.15, m.x + dx * m.len / 2, m.y + dy * m.len / 2); c.stroke()
    }
    for (const k of clumps) {
      c.fillStyle = rgba(shade(k.body, -0.55), 0.3)
      c.beginPath(); smoothPath(c, k.pts.map((v, i) => v + (i % 2 ? k.r * 0.2 : k.r * 0.12))); c.fill()
    }
  })
  // Darker streaks along each wipe.
  softBatch(ctx, 3, c => {
    for (const m of smears) {
      const dx = Math.cos(m.a), dy = Math.sin(m.a)
      for (let k = 0; k < 3; k++) {
        const off = m.rr.range(-0.1, 0.1) * m.len
        c.strokeStyle = rgba(shade(m.body, m.rr.range(-0.2, -0.05)), m.rr.range(0.1, 0.2))
        c.lineWidth = m.rr.range(6, 12)
        c.beginPath()
        c.moveTo(m.x - dx * m.len * 0.3 - dy * off, m.y - dy * m.len * 0.3 + dx * off)
        c.quadraticCurveTo(m.x + dy * m.len * 0.1, m.y - dx * m.len * 0.1, m.x + dx * m.len * 0.3 - dy * off, m.y + dy * m.len * 0.3 + dx * off)
        c.stroke()
      }
    }
  })
  // Clump bodies: lit centre, earthy middle, a darker drying rim; soft edged.
  softBatch(ctx, 1.2, c => {
    for (const k of clumps) {
      c.beginPath(); smoothPath(c, k.pts)
      const g = c.createRadialGradient(k.x - k.r * 0.2, k.y - k.r * 0.25, 0, k.x, k.y, k.r * 1.1)
      g.addColorStop(0, rgba(warm(k.body, 0.12))); g.addColorStop(0.6, rgba(k.body)); g.addColorStop(0.88, rgba(shade(k.body, -0.22))); g.addColorStop(1, rgba(shade(k.body, -0.3), 0.85))
      c.fillStyle = g
      c.fill()
    }
  })
  // Crumbly, matte texture inside each clump: darker grains and a few lighter dry ones (warm, never white).
  for (const k of clumps) {
    ctx.save()
    ctx.beginPath(); smoothPath(ctx, k.pts); ctx.clip()
    const n = Math.round(k.r * 1.1)
    dots(ctx, shade(k.body, -0.25), Math.round(n * 0.65), () => ({ x: k.x + k.rr.range(-k.r, k.r), y: k.y + k.rr.range(-k.r, k.r), r: k.rr.range(0.8, 2.2), a: k.rr.range(0.25, 0.55) }), 2)
    dots(ctx, warm(k.body, 0.18), Math.round(n * 0.35), () => ({ x: k.x + k.rr.range(-k.r, k.r), y: k.y + k.rr.range(-k.r, k.r), r: k.rr.range(0.8, 2), a: k.rr.range(0.25, 0.5) }), 1)
    ctx.restore()
    // A dull, soft lift on the lit side: volume without shine.
    blob(ctx, k.x - k.r * 0.3, k.y - k.r * 0.35, k.r * 0.45, k.r * 0.3, warm(k.body, 0.3), 0.3)
  }
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

/**
 * The layer sheets, each as a painter to call when it is needed: the view paints the ones that start with
 * something on them right away and the rest (foam, cream, clay, serum...) in the frames after the close-up
 * opens. Each has its own random stream, so the order they are painted in never changes how they look.
 */
function paintLayers(skin: SkinTone, seed: number): Record<string, () => HTMLCanvasElement> {
  // Dirt stays earthy on every tone: olive-brown and grey-brown on fair skin; on deep skin a darker, richer
  // mud brown (a pale khaki over deep skin reads as an ashy grey film).
  const kf = clamp01((fairOf(skin) - 0.45) / 0.4)
  const olive = mixRGB([82, 54, 28], [132, 104, 64], kf), greyBrown = mixRGB([76, 52, 36], [124, 100, 80], kf)
  const dirt = (i: number, k = 0): RGB => shade(mixRGB(olive, greyBrown, (i * 0.618) % 1), k)
  // Tints follow the tone: on deeper skin a fixed pale colour turns into a grey film.
  const fair = fairOf(skin)
  // Tints fade out toward the face's edge, so a finished face never shows a lighter oval against the ears.
  const soft = (sheet: HTMLCanvasElement) => { feather(sheet, 10); return sheet }
  return {
    // Grime: cute and cartoony, never gross. A dusty veil, smudges and soft clumps, all matte.
    grime: () => clipped(S, (ctx) => {
      ctx.drawImage(tintedByNoise(S, mixRGB(olive, greyBrown, 0.5), fbm(S, 70, 4, seed + 31), 0.04, 0.34), 0, 0)
      paintDirt(ctx, seed + 32, { smears: 70, clumps: 90, rMin: 8, rMax: 24, lenMin: 40, lenMax: 110, color: i => dirt(i, 0.04) })
    }, faceBelowBand),
    // Ground-in grime (disaster cases): darker, heavier.
    grime2: () => clipped(S, (ctx) => {
      ctx.drawImage(tintedByNoise(S, shade(greyBrown, -0.25), fbm(S, 50, 4, seed + 35), 0.18, 0.56), 0, 0)
      paintDirt(ctx, seed + 36, { smears: 60, clumps: 90, rMin: 12, rMax: 30, lenMin: 60, lenMax: 140, color: i => dirt(i, -0.2) })
    }, faceBelowBand),
    flakes: () => clipped(S, (ctx) => {
      const r = makeRng(seed + 33)
      ctx.drawImage(tintedByNoise(S, [250, 238, 228], fbm(S, 24, 3, seed + 36), 0.05, 0.3), 0, 0)
      const flakes = Array.from({ length: 420 }, () => ({ x: r.range(220, 800), y: r.range(300, 930), s: r.range(2.5, 7) }))
      const tri = (path: Path2D, x: number, y: number, s: number) => { path.moveTo(x, y); path.lineTo(x + s, y - 1); path.lineTo(x + s * 0.6, y + s); path.closePath() }
      const shadow = new Path2D(), light = new Path2D()
      for (const f of flakes) { tri(shadow, f.x + 1, f.y + 2, f.s); tri(light, f.x, f.y, f.s) }
      ctx.fillStyle = 'rgba(180,150,140,0.35)'; ctx.fill(shadow)
      ctx.fillStyle = 'rgba(255,250,244,0.85)'; ctx.fill(light)
    }),
    oil: () => soft(clipped(512, (ctx) => {
      ctx.drawImage(tintedByNoise(512, mixRGB(shade(skin.light, 0.1), [250, 228, 170], 0.45 * fair), fbm(512, 32, 3, seed + 41), 0.04, 0.22), 0, 0)
    }, faceBelowBand)),
    redness: () => soft(clipped(512, (ctx) => {
      const r = makeRng(seed + 52)
      ctx.drawImage(tintedByNoise(512, mixRGB(skin.blush, [232, 96, 104], 0.5 * fair), fbm(512, 40, 3, seed + 51), 0.1, 0.36), 0, 0)
      dots(ctx, mixRGB(skin.blush, [220, 80, 96], 0.6 * fair), 90, () => ({ x: r.range(100, 412), y: r.range(150, 470), r: r.range(1, 2.5), a: r.range(0.15, 0.4) }), 3)
    }, faceBelowBand)),
    marks: () => clipped(512, (ctx) => {
      ctx.drawImage(tintedByNoise(512, [222, 92, 104], fbm(512, 12, 2, seed + 61), 0.32, 0.6), 0, 0)
    }),
    serum: () => soft(clipped(512, (ctx) => {
      ctx.drawImage(tintedByNoise(512, mixRGB(shade(skin.light, 0.1), [255, 238, 196], 0.2 + 0.3 * fair), fbm(512, 40, 2, seed + 71), 0.12, 0.22), 0, 0)
    }, faceBelowBand)),
    // A warm lift of the customer's own tone, even across the face (no mottling): more warmth than light,
    // so fair skin never blows out to cream and deep skin never greys.
    glow: () => soft(clipped(512, (ctx) => {
      ctx.drawImage(tintedByNoise(512, mixRGB(mixRGB(skin.base, skin.blush, 0.22), skin.light, 0.45), fbm(512, 90, 2, seed + 81), 0.14, 0.2), 0, 0)
    }, faceBelowBand)),
    // Rich white cream: smooth, with soft swirls where it was scooped and spread.
    cream: () => {
      const sheet = clipped(S, (ctx) => {
        ctx.fillStyle = '#fffaf4'
        ctx.fillRect(0, 0, S, S)
        ctx.globalCompositeOperation = 'multiply'
        ctx.globalAlpha = 0.25
        ctx.drawImage(fbm(S, 60, 3, seed + 90), 0, 0)
        ctx.globalAlpha = 1
        ctx.globalCompositeOperation = 'source-over'
        const rc = makeRng(seed + 91)
        softBatch(ctx, 3, c => {
          for (let i = 0; i < 70; i++) {
            const x = rc.range(220, 810), y = rc.range(300, 920), rr = rc.range(18, 44)
            c.strokeStyle = rc() < 0.5 ? 'rgba(232,220,214,0.5)' : 'rgba(255,255,255,0.8)'
            c.lineWidth = rc.range(3, 7)
            c.beginPath(); c.arc(x, y, rr, rc() * 6, rc() * 6 + rc.range(1.2, 2.4)); c.stroke()
          }
        })
      })
      // Around the mouth it is the lip scrub (the lips step paints this layer there): pink sugar.
      const sctx = sheet.getContext('2d')!
      sctx.save()
      sctx.globalCompositeOperation = 'source-atop'
      sctx.beginPath(); sctx.ellipse(FACE.lips.x, FACE.lips.y + 6, 150, 86, 0, 0, Math.PI * 2); sctx.clip()
      sctx.fillStyle = 'rgba(248,180,206,0.92)'
      sctx.fillRect(0, 0, S, S)
      const rs = makeRng(seed + 95)
      dots(sctx, [255, 250, 252], 500, () => ({ x: FACE.lips.x + rs.range(-150, 150), y: FACE.lips.y + 6 + rs.range(-86, 86), r: rs.range(1, 2.4), a: rs.range(0.6, 1) }), 2)
      dots(sctx, [236, 140, 176], 200, () => ({ x: FACE.lips.x + rs.range(-150, 150), y: FACE.lips.y + 6 + rs.range(-86, 86), r: rs.range(1, 2), a: rs.range(0.5, 0.9) }), 2)
      sctx.restore()
      feather(sheet, 8)
      return sheet
    },
    mask: () => paintClay(false, seed),
    // Foam: thousands of bubbles, each a soft shadowed rim, a white body and a bright glint, in a few batches
    // (a fill per bubble cost more than the rest of the face together).
    foam: () => {
      const sheet = clipped(S, (ctx) => {
        ctx.fillStyle = 'rgba(253,251,255,0.9)'
        ctx.fillRect(0, 0, S, S)
        const rf = makeRng(seed + 101)
        for (let batch = 0; batch < 4; batch++) {
          const bubbles = Array.from({ length: 1300 }, () => { const rr = rf() < 0.9 ? rf.range(2.5, 9) : rf.range(10, 20); return { x: rf.range(180, 850), y: rf.range(260, 960), r: rr } })
          dots(ctx, [222, 222, 238], bubbles.length, i => ({ ...bubbles[i], a: rf.range(0.3, 0.65) }), 3)
          dots(ctx, [255, 255, 255], bubbles.length, i => ({ x: bubbles[i].x - bubbles[i].r * 0.25, y: bubbles[i].y - bubbles[i].r * 0.25, r: bubbles[i].r * 0.7, a: rf.range(0.7, 1) }), 3)
          dots(ctx, [255, 255, 255], bubbles.length, i => ({ x: bubbles[i].x - bubbles[i].r * 0.4, y: bubbles[i].y - bubbles[i].r * 0.4, r: bubbles[i].r * 0.22, a: 1 }), 1)
        }
      })
      feather(sheet, 14)
      return sheet
    },
  }
}

/** The peel mask's outline: the face, minus organic cut-outs around each eye and brow and around the lips. */
function maskClip(ctx: Ctx) {
  // The face first, then the windows cut out of it (an even-odd hole outside the face would fill instead).
  faceClip(ctx)
  ctx.beginPath()
  ctx.rect(0, 0, S, S)
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

/** A face mask of the given kind, wet or dry/set, inside the mask outline (eye and lip windows cut out). */
function paintMask(kind: MaskKind, dry: boolean, seed: number) {
  if (kind === 'clay') return paintClay(dry, seed)
  if (kind === 'sheet') return paintSheetMask(seed)
  if (kind === 'bubble') return paintBubbleMask(seed)
  return paintGoldMask(dry, seed)
}

/** Darken (or lighten) a sheet just inside every cut edge, so the mask reads as having a thickness. */
function maskRim(sheet: HTMLCanvasElement, color: string, alpha: number, blur = 5) {
  const [rim, rctx] = canvas(S)
  rctx.drawImage(sheet, 0, 0)
  rctx.globalCompositeOperation = 'source-in'
  rctx.fillStyle = color
  rctx.fillRect(0, 0, S, S)
  const [inner, ictx] = canvas(S)
  ictx.filter = 'blur(' + blur + 'px)'
  ictx.drawImage(sheet, 0, 0)
  rctx.globalCompositeOperation = 'destination-out'
  rctx.drawImage(inner, 0, 0)
  rctx.drawImage(inner, 0, 0)
  const ctx = sheet.getContext('2d')!
  ctx.globalAlpha = alpha
  ctx.globalCompositeOperation = 'source-atop'
  ctx.drawImage(rim, 0, 0)
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
  return sheet
}

/**
 * A sheet mask: thin, translucent white fabric soaked in essence, the skin showing through, a fine fibrous weave,
 * soft wrinkles where it was smoothed on, a wet sheen and its cut edge a little brighter.
 */
function paintSheetMask(seed: number) {
  const sheet = clipped(S, ctx => {
    ctx.fillStyle = 'rgba(248,250,253,0.5)'
    ctx.fillRect(0, 0, S, S)
    const r = makeRng(seed + 121)
    // The fibres: a fine, soft weave of short strands.
    softBatch(ctx, 0.6, c => {
      c.lineWidth = 1
      const light = new Path2D(), dark = new Path2D()
      for (let i = 0; i < 5000; i++) {
        const x = r.range(160, 860), y = r.range(240, 980), a = r.range(0, Math.PI), l = r.range(4, 12)
        const path = r() < 0.5 ? light : dark
        path.moveTo(x, y); path.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l)
      }
      c.strokeStyle = 'rgba(255,255,255,0.5)'; c.stroke(light)
      c.strokeStyle = 'rgba(214,222,232,0.45)'; c.stroke(dark)
    })
    // Wrinkles: soft ridges where the sheet did not lie flat, mostly toward the edges.
    softBatch(ctx, 3, c => {
      for (let i = 0; i < 26; i++) {
        const side = r() < 0.5 ? -1 : 1, x = 512 + side * r.range(150, 270), y = r.range(420, 900), len = r.range(40, 90), a = r.range(-0.5, 0.5) + (side < 0 ? 0.3 : -0.3)
        c.strokeStyle = 'rgba(190,200,214,0.5)'; c.lineWidth = 5
        c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + Math.cos(a) * len * 0.5 + 6, y + Math.sin(a) * len * 0.5, x + Math.cos(a) * len, y + Math.sin(a) * len); c.stroke()
        c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = 3
        c.beginPath(); c.moveTo(x - 4, y - 4); c.quadraticCurveTo(x + Math.cos(a) * len * 0.5 + 2, y + Math.sin(a) * len * 0.5 - 4, x + Math.cos(a) * len - 4, y + Math.sin(a) * len - 4); c.stroke()
      }
    })
    // The wet sheen: broad soft light on the forehead, cheekbones and chin.
    for (const [x, y, rx, ry] of [[470, 400, 150, 50], [380, 620, 80, 40], [660, 630, 60, 30], [500, 860, 60, 26]] as const) blob(ctx, x, y, rx, ry, [255, 255, 255], 0.45)
  }, maskClip)
  return maskRim(sheet, 'rgba(255,255,255,1)', 0.8, 4)
}

/** A charcoal bubble mask: a matte, smoky grey paste, brush-streaked, freckled with tiny fizzing bubbles. */
function paintBubbleMask(seed: number) {
  const sheet = clipped(S, ctx => {
    const base: RGB = [98, 94, 104]
    ctx.fillStyle = rgba(base, 0.95)
    ctx.fillRect(0, 0, S, S)
    const r = makeRng(seed + 131)
    for (let i = 0; i < 800; i++) {
      const x = r.range(160, 860), y = r.range(250, 970), a = r.range(-0.6, 0.6), len = r.range(30, 110)
      ctx.strokeStyle = rgba(shade(base, r.range(-0.25, 0.18)), r.range(0.15, 0.4))
      ctx.lineWidth = r.range(3, 10)
      ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + len * 0.5 * Math.cos(a), y + 10 * Math.sin(a * 3), x + len * Math.cos(a), y + len * Math.sin(a)); ctx.stroke()
    }
    ctx.globalCompositeOperation = 'soft-light'
    ctx.drawImage(fbm(S, 30, 4, seed + 132), 0, 0)
    ctx.globalCompositeOperation = 'source-over'
    const bubbles = Array.from({ length: 900 }, () => ({ x: r.range(180, 850), y: r.range(260, 960), r: r.range(1.2, 4) }))
    dots(ctx, [150, 146, 158], bubbles.length, i => ({ ...bubbles[i], a: 0.6 }), 2)
    dots(ctx, [236, 234, 240], bubbles.length, i => ({ x: bubbles[i].x - bubbles[i].r * 0.3, y: bubbles[i].y - bubbles[i].r * 0.3, r: bubbles[i].r * 0.35, a: 0.8 }), 1)
  }, maskClip)
  return maskRim(sheet, 'rgba(64,60,70,1)', 0.7)
}

/**
 * Gold foil: a thin leaf pressed onto a clear gel, crinkled into small facets that each catch the light
 * differently, with bright glints and darker creases; once set it dulls a little.
 */
function paintGoldMask(dry: boolean, seed: number) {
  const sheet = clipped(S, ctx => {
    const gold: RGB = [232, 194, 104]
    ctx.fillStyle = rgba(gold)
    ctx.fillRect(0, 0, S, S)
    const r = makeRng(seed + 141)
    // Facets: small irregular polygons in lighter and darker golds.
    for (let i = 0; i < 1400; i++) {
      const x = r.range(160, 860), y = r.range(240, 980), rr = r.range(8, 22), n = r.int(4, 6), a0 = r() * Math.PI
      const k = r.range(-0.3, 0.35)
      ctx.fillStyle = rgba(k > 0 ? mixRGB(gold, [255, 244, 200], k * 1.6) : shade(gold, k), r.range(0.4, 0.8))
      ctx.beginPath()
      for (let j = 0; j < n; j++) { const aa = a0 + (j / n) * Math.PI * 2, d = rr * r.range(0.6, 1.1); if (j === 0) ctx.moveTo(x + Math.cos(aa) * d, y + Math.sin(aa) * d); else ctx.lineTo(x + Math.cos(aa) * d, y + Math.sin(aa) * d) }
      ctx.closePath(); ctx.fill()
    }
    // Creases between the facets.
    ctx.lineWidth = 1.2
    const creases = new Path2D()
    for (let i = 0; i < 500; i++) {
      let x = r.range(170, 850), y = r.range(250, 970)
      creases.moveTo(x, y)
      for (let j = 0; j < 3; j++) { x += r.range(-14, 14); y += r.range(-14, 14); creases.lineTo(x, y) }
    }
    ctx.strokeStyle = 'rgba(150,108,40,0.4)'
    ctx.stroke(creases)
    // Glints.
    for (let i = 0; i < (dry ? 60 : 140); i++) { const x = r.range(200, 830), y = r.range(280, 940); blob(ctx, x, y, r.range(3, 7), r.range(3, 7), [255, 252, 230], 0.9, 0.4) }
    blob(ctx, 440, 420, 190, 80, [255, 244, 200], dry ? 0.15 : 0.3)
    if (dry) { ctx.fillStyle = 'rgba(214,184,120,0.25)'; ctx.fillRect(0, 0, S, S) }
  }, maskClip)
  return maskRim(sheet, 'rgba(150,108,40,1)', 0.6, 4)
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
  // Big, expressive eyes (about a fifth of the face's width), a little smaller for men and elders.
  const k = feat.masc || feat.age >= 0.8 ? 1.08 : 1.18
  return crop(EYE_CROP, ctx => {
    for (const [i, e] of FACE.eyes.entries()) {
      ctx.save(); ctx.translate(e.x, e.y); ctx.scale(k, k); ctx.translate(-e.x, -e.y)
      drawEye(ctx, e.x, e.y, i === 0 ? -1 : 1, state, lashColor, skin, feat)
      ctx.restore()
    }
  })
}

function drawEye(ctx: Ctx, ex: number, ey: number, side: number, state: EyeState, lashColor: RGB, skin: SkinTone, feat: Feat) {
  if (state === 'open' || state === 'wide' || state === 'half') { drawOpenEye(ctx, ex, ey, side, state === 'wide', lashColor, skin, feat, state === 'half' ? 0.62 : 0); return }
  const lash = rgba(lashColor)
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

/**
 * An open eye (or, with a lid value above 0, one with the upper lid part way down, for blinks): the socket,
 * a moist white with shaded corners and a pink caruncle, an iris with a limbal ring, a lighter collarette,
 * crypts and light pooling in its lower half, the upper lid as rounded skin with a crease and its soft
 * shadow on the eyeball, lashes in little clumps that curl up and out, a wet waterline and fine lower lashes.
 */
function drawOpenEye(ctx: Ctx, ex: number, ey: number, side: number, wide: boolean, lashColor: RGB, skin: SkinTone, feat: Feat, lid = 0) {
  const lash = rgba(lashColor)
  const lashLen = 0.8 + feat.lashes * 0.5
  const w = 68, top0 = wide ? 37 : 31, bottom = wide ? 25 : 21
  const top = top0 - (top0 + bottom * 0.55) * lid
  const inner = { x: ex - side * w * 0.95, y: ey + 2 }, outer = { x: ex + side * w, y: ey - 5 }
  const upperAt = (tt: number, tp: number) => {
    const c1 = { x: ex - side * 34, y: ey - tp - 6 }, c2 = { x: ex + side * 30, y: ey - tp - 4 }
    const u = 1 - tt
    return { x: u ** 3 * inner.x + 3 * u * u * tt * c1.x + 3 * u * tt * tt * c2.x + tt ** 3 * outer.x, y: u ** 3 * inner.y + 3 * u * u * tt * c1.y + 3 * u * tt * tt * c2.y + tt ** 3 * outer.y }
  }
  const upper = (tp = top) => { ctx.moveTo(inner.x, inner.y); ctx.bezierCurveTo(ex - side * 34, ey - tp - 6, ex + side * 30, ey - tp - 4, outer.x, outer.y) }
  const lower = () => { ctx.bezierCurveTo(ex + side * 30, ey + bottom + 2, ex - side * 34, ey + bottom + 4, inner.x, inner.y) }
  // Socket shading around the opening.
  blob(ctx, ex, ey - 8, 74, 40, skin.shadow, 0.22)
  ctx.save()
  ctx.beginPath(); upper(); lower(); ctx.closePath()
  const white = ctx.createRadialGradient(ex + side * 2, ey + 4, 6, ex, ey, w)
  white.addColorStop(0, '#fbf8f6'); white.addColorStop(0.7, '#f1e8e7'); white.addColorStop(1, '#d6bfc2')
  ctx.fillStyle = white
  ctx.fill()
  ctx.clip()
  // The white turns away at the corners (the far corner darker), faint warmth by the caruncle.
  blob(ctx, outer.x - side * 6, ey, 30, 26, [176, 142, 150], 0.4)
  blob(ctx, inner.x + side * 14, ey + 2, 24, 22, [232, 180, 184], 0.45)
  // Iris.
  const ir = wide ? 26 : 29, ix = ex + side * 2, iy = ey - (wide ? 0 : 3)
  const ig = ctx.createRadialGradient(ix, iy + 6, 2, ix, iy, ir)
  ig.addColorStop(0, rgba(shade(feat.iris, 0.3))); ig.addColorStop(0.5, rgba(feat.iris)); ig.addColorStop(0.86, rgba(shade(feat.iris, -0.3))); ig.addColorStop(1, rgba(shade(feat.iris, -0.65)))
  ctx.fillStyle = ig
  ctx.beginPath(); ctx.arc(ix, iy, ir, 0, Math.PI * 2); ctx.fill()
  const rr = makeRng(Math.round(ex * 7 + feat.iris[0]))
  // Fibres, darker crypts between them, and a lighter collarette ring around the pupil.
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2 + rr.range(-0.03, 0.03)
    ctx.strokeStyle = rgba(rr() < 0.6 ? shade(feat.iris, 0.4) : shade(feat.iris, -0.3), rr.range(0.18, 0.4))
    ctx.lineWidth = rr.range(0.7, 1.4)
    const r0 = rr.range(8, 13), r1 = ir - rr.range(2, 6)
    ctx.beginPath(); ctx.moveTo(ix + Math.cos(a) * r0, iy + Math.sin(a) * r0); ctx.quadraticCurveTo(ix + Math.cos(a + 0.08) * (r0 + r1) / 2, iy + Math.sin(a + 0.08) * (r0 + r1) / 2, ix + Math.cos(a) * r1, iy + Math.sin(a) * r1); ctx.stroke()
  }
  for (let i = 0; i < 9; i++) { const a = rr() * Math.PI * 2, d = rr.range(14, 22); blob(ctx, ix + Math.cos(a) * d, iy + Math.sin(a) * d, 3.5, 2.2, shade(feat.iris, -0.45), 0.4) }
  ctx.strokeStyle = rgba(warm(feat.iris, 0.45), 0.45); ctx.lineWidth = 2.2
  ctx.beginPath(); ctx.arc(ix, iy, 13.5, 0, Math.PI * 2); ctx.stroke()
  // Light pools in the lower half of the iris, opposite the key light.
  blob(ctx, ix + side * 3 + 5, iy + ir * 0.5, ir * 0.7, ir * 0.36, warm(feat.iris, 0.5), 0.55)
  ctx.strokeStyle = rgba(shade(feat.iris, -0.7), 0.6); ctx.lineWidth = 2.4
  ctx.beginPath(); ctx.arc(ix, iy, ir - 1, 0, Math.PI * 2); ctx.stroke()
  const pg = ctx.createRadialGradient(ix, iy, 0, ix, iy, wide ? 9.5 : 12)
  pg.addColorStop(0, '#140d10'); pg.addColorStop(0.78, '#1e1418'); pg.addColorStop(1, rgba(shade(feat.iris, -0.6), 0))
  ctx.fillStyle = pg
  ctx.beginPath(); ctx.arc(ix, iy, wide ? 9.5 : 12, 0, Math.PI * 2); ctx.fill()
  // The upper lid and its lashes cast a soft shadow on the eyeball.
  const shadowG = ctx.createLinearGradient(0, ey - top - 6, 0, ey - top + 24)
  shadowG.addColorStop(0, 'rgba(80,40,52,0.55)'); shadowG.addColorStop(1, 'rgba(80,40,52,0)')
  ctx.fillStyle = shadowG
  ctx.fillRect(ex - w - 4, ey - top - 10, w * 2 + 8, 40)
  // Catchlights: a big soft window up-left, a small sharp one down-right.
  if (lid < 0.5) {
    blob(ctx, ix - 10, iy - 11, 10, 8, [255, 255, 255], 0.5)
    ctx.fillStyle = 'rgba(255,255,255,0.95)'
    ctx.beginPath(); ctx.ellipse(ix - 10, iy - 11, 7.5, 5.8, -0.5, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(ix + 10, iy + 10, 2.8, 0, Math.PI * 2); ctx.fill()
  }
  ctx.restore()
  // Caruncle: the pink fold in the inner corner, with a wet glint.
  blob(ctx, inner.x + side * 7, inner.y, 8, 6, [220, 128, 136], 0.85, 0.3)
  blob(ctx, inner.x + side * 6, inner.y - 1.5, 2.2, 1.5, [255, 255, 255], 0.8)
  // The upper lid: rounded skin from the lash line up to the crease (a wider band as it closes).
  const crease = top0 + 16
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(inner.x - side * 4, inner.y - 2)
  ctx.bezierCurveTo(ex - side * 34, ey - crease - 4, ex + side * 32, ey - crease - 2, outer.x + side * 4, outer.y - 6)
  ctx.lineTo(outer.x, outer.y)
  ctx.bezierCurveTo(ex + side * 30, ey - top - 4, ex - side * 34, ey - top - 6, inner.x, inner.y)
  ctx.closePath()
  const lg = ctx.createLinearGradient(0, ey - crease, 0, ey - top + 2)
  lg.addColorStop(0, rgba(mixRGB(skin.base, skin.shadow, 0.35), 0.7)); lg.addColorStop(0.45, rgba(mixRGB(skin.base, skin.light, 0.5), 0.9)); lg.addColorStop(1, rgba(mixRGB(skin.base, skin.shadow, 0.5), 0.95))
  ctx.fillStyle = lg
  ctx.fill()
  ctx.clip()
  blob(ctx, ex - side * 6, ey - top - 9, 30, 7, skin.light, 0.55)
  ctx.restore()
  // The crease with a soft shadow tucked under it.
  blurred(ctx, 2.5, () => {
    ctx.strokeStyle = rgba(skin.deep, 0.34); ctx.lineWidth = 4
    ctx.beginPath(); ctx.moveTo(inner.x + side * 4, inner.y - 12); ctx.bezierCurveTo(ex - side * 32, ey - crease - 6, ex + side * 32, ey - crease - 4, outer.x, outer.y - 14); ctx.stroke()
  })
  // On deep skin a lit lid margin just above the lash line keeps the line reading against the skin.
  const deepK = clamp01((0.6 - fairOf(skin)) / 0.25)
  if (deepK > 0) blurred(ctx, 1.2, () => { ctx.strokeStyle = rgba(mixRGB(skin.light, [255, 226, 210], 0.4), 0.55 * deepK); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(inner.x + side * 8, inner.y - 6); ctx.bezierCurveTo(ex - side * 34, ey - top - 12, ex + side * 30, ey - top - 10, outer.x - side * 4, outer.y - 7); ctx.stroke() })
  // Lash line: thick, dark, a little wing.
  ctx.lineCap = 'round'
  ctx.strokeStyle = lash; ctx.lineWidth = feat.masc ? 3 : 4.6
  ctx.beginPath(); upper(); ctx.stroke()
  if (!feat.masc) taper(ctx, outer.x - side * 6, outer.y - 2, outer.x + side * 6, outer.y - 6, outer.x + side * 15, outer.y - 11, 3.6, 1, lash)
  // Waterline and lower lid rim.
  blurred(ctx, 0.8, () => {
    ctx.strokeStyle = rgba(mixRGB(skin.light, [250, 200, 200], 0.5), 0.75); ctx.lineWidth = 2.6
    ctx.beginPath(); ctx.moveTo(outer.x - side * 6, outer.y + 3); ctx.bezierCurveTo(ex + side * 28, ey + bottom + 1, ex - side * 32, ey + bottom + 3, inner.x + side * 10, inner.y + 3); ctx.stroke()
  })
  ctx.strokeStyle = rgba(skin.deep, 0.42); ctx.lineWidth = 1.5
  ctx.beginPath(); ctx.moveTo(outer.x, outer.y); lower(); ctx.stroke()
  blob(ctx, ex - side * 8, ey + bottom + 1, 6, 1.6, [255, 255, 255], 0.7)
  blob(ctx, ex, ey + bottom + 6, 36, 5, skin.light, 0.35)
  // Upper lashes in clumps: longer toward the outer corner, curling up and out (down and out as the lid drops).
  const lr = makeRng(Math.round(ex * 13))
  for (let i = 0; i < (feat.masc ? 24 : 40); i++) {
    const clump = Math.floor(i / (feat.masc ? 2.4 : 4))
    const t = 0.1 + (clump / 10) * 0.9 + lr.range(-0.02, 0.03)
    const p = upperAt(Math.min(1, t), top)
    const len = (8 + t * 13) * lashLen * lr.range(0.8, 1.12)
    const up = 1 - lid * 0.85
    const out = side * (0.15 + t * 0.75)
    const tipX = p.x + out * len * 0.9 + lr.range(-1.5, 1.5), tipY = p.y - len * (0.75 * up) + len * lid * 0.35
    taper(ctx, p.x, p.y, p.x + out * len * 0.2, p.y - len * 0.8 * up, tipX, tipY, lr.range(2, 2.8), 0.2, lash)
  }
  for (let i = 0; i < 11; i++) {
    const t = 0.4 + (i / 10) * 0.55
    const x = inner.x + (outer.x - inner.x) * t, y = ey + bottom * Math.sin(Math.PI * t) * 0.92 + 1
    taper(ctx, x, y, x + side * 2, y + 4, x + side * (3 + t * 3), y + (5 + t * 4) * lashLen, 1.3, 0.2, rgba(lashColor, 0.65))
  }
}

type BrowTone = { color: RGB; dark: RGB; lash: RGB; sheen: number }

function browCrop(state: BrowState, tone: BrowTone, seed: number, feat: Feat, groomed = false): Crop {
  return crop(BROW_CROP, ctx => {
    for (const [i, b] of FACE.brows.entries()) drawBrow(ctx, b.x, b.y, i === 0 ? -1 : 1, state, tone, seed + i, feat, groomed)
  })
}

/**
 * A brow drawn hair by hair, the way brows grow: at the head the hairs stand up and lean out, along the body
 * the lower hairs sweep up and out while the upper ones lie flatter and point out and a little down (a
 * herringbone that meets along the middle), and at the tail they all run out and down and thin away.
 */
function drawBrow(ctx: Ctx, bx: number, by: number, side: number, state: BrowState, tone: BrowTone, seed: number, feat: Feat, groomed = false) {
  const r = makeRng(seed)
  const weight = 0.58 + feat.brow * 0.4
  const innerY = state === 'worried' ? by - 8 : state === 'happy' ? by + 0 : by + 10
  const peakY = state === 'worried' ? by - 4 : state === 'happy' ? by - 24 : by - 14
  const outerY = state === 'worried' ? by + 14 : state === 'happy' ? by - 4 : by + 2
  const inner = { x: bx - side * 72, y: innerY }, peak = { x: bx + side * 26, y: peakY }, outer = { x: bx + side * 80, y: outerY }
  const at = (t: number) => t < 0.62
    ? { x: inner.x + (peak.x - inner.x) * (t / 0.62), y: inner.y + (peak.y - inner.y) * Math.sin((t / 0.62) * Math.PI / 2) }
    : { x: peak.x + (outer.x - peak.x) * ((t - 0.62) / 0.38), y: peak.y + (outer.y - peak.y) * ((t - 0.62) / 0.38) ** 1.4 }
  // Half-thickness along the brow: full at the head and body, tapering to a fine tail.
  const thick = (t: number) => (t < 0.12 ? 7 + t * 20 : 9.5 - Math.max(0, t - 0.45) * 12) * weight
  // A faint tint of skin showing through, so the hairs sit in a soft shape rather than on bare skin.
  blurred(ctx, 4, () => {
    for (let i = 0; i <= 24; i++) {
      const t = i / 24, p = at(t)
      ctx.fillStyle = rgba(tone.color, 0.16 * (1 - t * 0.5))
      ctx.beginPath(); ctx.ellipse(p.x, p.y + 2, 7, thick(t), 0, 0, Math.PI * 2); ctx.fill()
    }
  })
  const count = Math.round(170 * weight)
  const hairs: { x: number; y: number; ex: number; ey: number; cx: number; cy: number; w: number; c: string }[] = []
  for (let i = 0; i < count; i++) {
    // Denser in the body, sparse at the head and the tail.
    const t = Math.min(1, Math.max(0, r() ** 0.9 * 1.02))
    const p = at(t), q = at(Math.min(1, t + 0.04)), p0 = at(Math.max(0, t - 0.04))
    let dx = q.x - p0.x, dy = q.y - p0.y
    const l = Math.hypot(dx, dy) || 1
    dx /= l; dy /= l
    // "Up" away from the eye, perpendicular to the brow line.
    let ux = dy * side, uy = -dx * side
    if (uy > 0) { ux = -ux; uy = -uy }
    const off = r.range(-1, 1)
    const th = thick(t)
    const sx = p.x + ux * off * th, sy = p.y + uy * off * th + 3
    // Growth angle from the brow line (radians, toward "up"): steep at the head, a herringbone in the body.
    const head = clamp01(1 - t / 0.16)
    const body = off < 0 ? 0.55 - t * 0.5 : -0.18 - t * 0.12
    const tail = clamp01((t - 0.7) / 0.3)
    // Groomed: every hair brushed the same way, up and out, lying neatly in the brow's shape.
    const ang = groomed ? head * 1.15 + (1 - head) * ((0.62 - t * 0.38) * (1 - tail) + 0.12 * tail) : head * 1.25 + (1 - head) * (body * (1 - tail) + -0.28 * tail)
    const hx = dx * Math.cos(ang) + ux * Math.sin(ang), hy = dy * Math.cos(ang) + uy * Math.sin(ang)
    const len = r.range(9, 16) * (1 - tail * 0.35) * (0.85 + weight * 0.25) * (groomed ? 1.08 : 1)
    const bend = groomed ? r.range(0.02, 0.1) : r.range(0.1, 0.3)
    hairs.push({
      x: sx, y: sy, ex: sx + hx * len, ey: sy + hy * len,
      cx: sx + hx * len * 0.55 + dx * len * bend, cy: sy + hy * len * 0.55 + dy * len * bend,
      w: r.range(1.3, 2.3) * (1 - tail * 0.3),
      c: rgba(r() < 0.55 ? tone.dark : tone.color, r.range(0.5, 0.88) * (1 - tail * 0.25)),
    })
  }
  // Lighter under-hairs first, darker ones on top.
  hairs.sort((a, b) => (a.c > b.c ? 1 : -1))
  for (const h of hairs) taper(ctx, h.x, h.y, h.cx, h.cy, h.ex, h.ey, h.w, 0.25, h.c)
  if (groomed) {
    // Clear brow gel: a soft sheen along the brushed hairs, and no strays.
    blurred(ctx, 2, () => {
      ctx.strokeStyle = 'rgba(255,255,255,0.32)'; ctx.lineWidth = 3; ctx.lineCap = 'round'
      ctx.beginPath()
      for (let i = 0; i <= 20; i++) { const t = 0.1 + (i / 20) * 0.75, p = at(t); if (i === 0) ctx.moveTo(p.x, p.y - thick(t) * 0.4); else ctx.lineTo(p.x, p.y - thick(t) * 0.4) }
      ctx.stroke()
    })
    return
  }
  // A few fine, pale strays catch the light along the top.
  for (let i = 0; i < 6 + Math.round(tone.sheen * 14); i++) {
    const t = r.range(0.2, 0.8), p = at(t)
    ctx.strokeStyle = rgba(warmMix(tone.color), 0.35 + tone.sheen * 0.25)
    ctx.lineWidth = 0.8
    ctx.beginPath(); ctx.moveTo(p.x, p.y - thick(t) * 0.6); ctx.quadraticCurveTo(p.x + side * 5, p.y - thick(t) - 5, p.x + side * 11, p.y - thick(t) - 4); ctx.stroke()
  }
}

const warmMix = (c: RGB): RGB => mixRGB(c, [230, 196, 170], 0.35)

/**
 * The mouth as a handful of numbers, so expressions blend by moving control points instead of crossfading
 * drawings: the corners' half-width and height (negative is up), the lips' heights, how far the lip line
 * sags in the middle (a smile), how far the lips part, how much of the upper teeth shows, how round the
 * opening is (an "o") and how tense the corners are (a wince).
 */
export type MouthParams = { cw: number; corner: number; upperH: number; lowerH: number; sag: number; open: number; teeth: number; round: number; wince: number }
export const MOUTH_PARAMS: Record<MouthState, MouthParams> = {
  neutral: { cw: 64, corner: 2, upperH: 16, lowerH: 28, sag: 4, open: 0, teeth: 0, round: 0, wince: 0 },
  smile: { cw: 66, corner: -10, upperH: 16, lowerH: 22, sag: 12, open: 0, teeth: 0, round: 0, wince: 0 },
  wince: { cw: 60, corner: 8, upperH: 8, lowerH: 12, sag: -2, open: 0, teeth: 0, round: 0, wince: 1 },
  pout: { cw: 54, corner: 6, upperH: 19, lowerH: 32, sag: 1, open: 0, teeth: 0, round: 0, wince: 0 },
  beam: { cw: 60, corner: -12, upperH: 12, lowerH: 17, sag: 10, open: 15, teeth: 1, round: 0, wince: 0 },
  o: { cw: 27, corner: 3, upperH: 13, lowerH: 15, sag: 2, open: 22, teeth: 0, round: 1, wince: 0 },
}
export function mixMouth(a: MouthParams, b: MouthParams, t: number): MouthParams {
  const out = { ...a }
  for (const k of Object.keys(a) as (keyof MouthParams)[]) out[k] = a[k] + (b[k] - a[k]) * t
  return out
}

/** A mouth that redraws itself for any blend of shapes (and the lip scrub), for the close-up's live mouth. */
export type LiveMouth = { canvas: HTMLCanvasElement; x: number; y: number; draw: (p: MouthParams, scrub?: number) => void }

function mouthScale(feat: Feat) { return feat.masc ? 1.1 : 1.2 }

function mouthCrop(state: MouthState, skin: SkinTone, feat: Feat): Crop {
  // Full lips, a touch smaller on men.
  const k = mouthScale(feat), l = FACE.lips
  return crop(MOUTH_CROP, ctx => { ctx.translate(l.x, l.y); ctx.scale(k, k); ctx.translate(-l.x, -l.y); drawMouth(ctx, l.x, l.y, MOUTH_PARAMS[state], skin, feat) })
}

export function liveMouth(skin: SkinTone, feat: Feat): LiveMouth {
  const [c, ctx] = canvas(MOUTH_CROP.w, MOUTH_CROP.h)
  const k = mouthScale(feat), l = FACE.lips
  return {
    canvas: c, x: MOUTH_CROP.x, y: MOUTH_CROP.y,
    draw: (p, scrub = 0) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, c.width, c.height)
      ctx.translate(-MOUTH_CROP.x, -MOUTH_CROP.y)
      ctx.translate(l.x, l.y); ctx.scale(k, k); ctx.translate(-l.x, -l.y)
      drawMouth(ctx, l.x, l.y, p, skin, feat, scrub)
    },
  }
}

/**
 * Lips from the parameters: an upper lip with a cupid's bow, a fuller lower lip, and between them either the
 * lip line or, as they part, the dark of the mouth with the upper teeth under the lip. Shaded top to bottom,
 * a wet highlight on the lower lip, soft shadows tucked into the corners (deeper in a smile), tension lines in
 * a wince, the cheeks lifting in a beam. `scrub` lays pink sugar scrub over the lips.
 */
function drawMouth(ctx: Ctx, mx: number, my: number, p: MouthParams, skin: SkinTone, feat: Feat, scrub = 0) {
  const full = 1.05 + feat.lips * 0.3
  // Lips follow the tone: a touch of rose on fair skin, the customer's own deeper lip colour otherwise.
  const fair = Math.min(1, (skin.base[0] + skin.base[1] + skin.base[2]) / 3 / 215)
  const lip = mixRGB(skin.lip, [236, 118, 140], 0.15 + 0.25 * fair + (feat.masc ? -0.1 : 0)), lipDark = shade(lip, -0.2)
  // Deep tones get a brighter, warmer gloss so the lips still read.
  const lipLight = mixRGB(mixRGB(lip, skin.light, 0.45), [255, 222, 214], 0.45 * (1 - fair))
  const inside = mixRGB(shade(skin.lip, -0.55), [70, 20, 30], 0.5)
  const cw = p.cw, upperH = p.upperH * full, lowerH = p.lowerH * full, rnd = p.round, open = p.open
  const L = { x: mx - cw, y: my + p.corner }, R = { x: mx + cw, y: my + p.corner }
  const lineY = my + p.sag + 4
  const bw = Math.min(1, cw / 64)
  const lift = open * 0.25
  const ctrl = 0.5 + 0.5 * rnd, outer = 0.55 + 0.5 * rnd
  const upTop = open * (0.3 + 0.45 * rnd), downTop = open * (0.9 - 0.15 * rnd)
  // The outlines, as path builders.
  const upperTop = () => {
    ctx.moveTo(L.x, L.y)
    ctx.bezierCurveTo(mx - cw * outer, my - upperH * 0.6 - lift, mx - 26 * bw, my - upperH - 4 - lift, mx - 14 * bw, my - upperH - lift)
    ctx.quadraticCurveTo(mx, my - upperH + 8 - lift, mx + 14 * bw, my - upperH - lift)
    ctx.bezierCurveTo(mx + 26 * bw, my - upperH - 4 - lift, mx + cw * outer, my - upperH * 0.6 - lift, R.x, R.y)
  }
  const upperBottomBack = () => ctx.bezierCurveTo(mx + cw * ctrl, lineY - upTop, mx - cw * ctrl, lineY - upTop, L.x, L.y)
  const lowerTop = () => { ctx.moveTo(L.x, L.y); ctx.bezierCurveTo(mx - cw * ctrl, lineY + downTop, mx + cw * ctrl, lineY + downTop, R.x, R.y) }
  const lowerBottomBack = () => ctx.bezierCurveTo(mx + cw * (0.6 + 0.4 * rnd), my + lowerH + p.sag + open * 0.8, mx - cw * (0.6 + 0.4 * rnd), my + lowerH + p.sag + open * 0.8, L.x, L.y)
  const upperLip = () => { ctx.beginPath(); upperTop(); upperBottomBack(); ctx.closePath() }
  const lowerLip = () => { ctx.beginPath(); lowerTop(); lowerBottomBack(); ctx.closePath() }
  const opening = () => { ctx.beginPath(); ctx.moveTo(L.x, L.y); ctx.bezierCurveTo(mx - cw * ctrl, lineY - upTop, mx + cw * ctrl, lineY - upTop, R.x, R.y); ctx.bezierCurveTo(mx + cw * ctrl, lineY + downTop, mx - cw * ctrl, lineY + downTop, L.x, L.y); ctx.closePath() }
  // The mouth inside, with the upper teeth tucked under the lip.
  if (open > 0.5) {
    opening()
    ctx.fillStyle = rgba(inside)
    ctx.fill()
    ctx.save()
    opening(); ctx.clip()
    const top = lineY - upTop * 0.75
    if (p.teeth > 0.02) {
      ctx.globalAlpha = Math.min(1, p.teeth)
      ctx.fillStyle = '#f8f2ee'
      ctx.beginPath(); ctx.ellipse(mx, top + 2, cw * 0.66, 6 + open * 0.15, 0, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = 'rgba(190,168,168,0.28)'; ctx.lineWidth = 1
      for (const k of [-1, 0, 1]) { ctx.beginPath(); ctx.moveTo(mx + k * 15, top - 4); ctx.lineTo(mx + k * 15, top + 8 - Math.abs(k) * 2); ctx.stroke() }
      ctx.globalAlpha = 1
    }
    const sh = ctx.createLinearGradient(0, top - 6, 0, top + 6)
    sh.addColorStop(0, rgba(inside, 0.5)); sh.addColorStop(1, rgba(inside, 0))
    ctx.fillStyle = sh
    ctx.fillRect(mx - cw, top - 8, cw * 2, 14)
    blob(ctx, mx, lineY + downTop * 0.75, cw * 0.5, 7 + open * 0.2, mixRGB(skin.lip, [222, 108, 118], 0.45), 0.8)
    ctx.restore()
  }
  // Upper lip.
  upperLip()
  const ug = ctx.createLinearGradient(0, my - upperH - lift, 0, lineY)
  ug.addColorStop(0, rgba(lip)); ug.addColorStop(1, rgba(lipDark))
  ctx.fillStyle = ug
  ctx.fill()
  // Lower lip.
  lowerLip()
  const lg = ctx.createLinearGradient(0, lineY + downTop * 0.5, 0, my + lowerH + p.sag + open * 0.8)
  lg.addColorStop(0, rgba(lipDark)); lg.addColorStop(0.4, rgba(lip)); lg.addColorStop(1, rgba(shade(lip, 0.08)))
  ctx.fillStyle = lg
  ctx.fill()
  // The line between the lips (it fades as they part), and the wet highlights.
  const shut = Math.max(0, 1 - open / 6)
  if (shut > 0) {
    ctx.strokeStyle = rgba(shade(lip, -0.5), 0.85 * shut)
    ctx.lineWidth = 2.6 + p.wince
    ctx.beginPath(); ctx.moveTo(L.x + 2, L.y); ctx.bezierCurveTo(mx - cw * ctrl, lineY, mx + cw * ctrl, lineY, R.x - 2, R.y); ctx.stroke()
  }
  const lowMid = my + p.sag + (lowerH + open * 0.8) * 0.55 + downTop * 0.3
  blob(ctx, mx + 6, lowMid, cw * 0.36, 5, lipLight, 0.75)
  blob(ctx, mx - 6, lowMid - 1, cw * 0.2, 3.5, [255, 255, 255], 0.85)
  blob(ctx, mx + 22 * bw, lowMid + 2, cw * 0.08, 2, [255, 255, 255], 0.7)
  blob(ctx, mx - 16 * bw, my - upperH + 6 - lift, 12 * bw, 3, lipLight, 0.5)
  // Corners tucked into the cheeks: deeper in a smile; the cheeks lift in a beam.
  const smile = Math.max(0, -p.corner / 12)
  for (const sd of [-1, 1]) blob(ctx, mx + sd * (cw + 4), my + p.corner, 8, 8, skin.shadow, 0.25 + 0.1 * smile)
  if (p.teeth > 0.3) for (const sd of [-1, 1]) blob(ctx, mx + sd * (cw + 16), my + p.corner - 5, 9, 12, skin.shadow, 0.16 * p.teeth)
  if (p.wince > 0.05) {
    ctx.strokeStyle = rgba(skin.deep, 0.3 * p.wince); ctx.lineWidth = 1.5
    for (const sd of [-1, 1]) { ctx.beginPath(); ctx.moveTo(mx + sd * (cw + 6), my + 6); ctx.quadraticCurveTo(mx + sd * (cw + 14), my + 16, mx + sd * (cw + 10), my + 26); ctx.stroke() }
  }
  if (scrub > 0.01) {
    // Pink sugar scrub over both lips: a glossy pink film full of sugar crystals.
    ctx.save()
    ctx.globalAlpha = Math.min(1, scrub)
    ctx.beginPath(); upperTop(); upperBottomBack(); ctx.closePath(); lowerTop(); lowerBottomBack(); ctx.closePath()
    ctx.clip()
    ctx.fillStyle = 'rgba(250,176,204,0.55)'
    ctx.fillRect(mx - cw - 10, my - 60, cw * 2 + 20, 130)
    for (let i = 0; i < 150; i++) {
      const x = mx - cw + ((i * 73) % (cw * 2)), y = my - upperH - 6 + ((i * 41) % (upperH + lowerH + open + 20)), sz = 1.5 + (i % 3)
      ctx.fillStyle = i % 4 ? 'rgba(255,250,252,0.95)' : 'rgba(255,200,220,0.95)'
      ctx.fillRect(x, y, sz, sz)
    }
    ctx.restore()
  }
}
