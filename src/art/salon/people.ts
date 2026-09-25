import { CanvasSource, Texture } from 'pixi.js'
import type { Look } from '../../core/customers.ts'
import { HAIR, OUTFIT, SKIN } from '../palette.ts'
import { hairPalette } from '../hair.ts'
import { SENIOR_AGE, lookFigure, type Figure } from '../../core/figure.ts'
import { makeRng } from '../../core/rng.ts'
import { blob, blurred, canvas, mixRGB, rgba, shade, type Ctx, type RGB } from '../paint.ts'
import { hexRGB } from './furniture.ts'
import { IRIS as CLOSEUP_IRIS, irisForSeed } from '../face.ts'
import { faceProfile } from '../../core/treatments/profile.ts'

/**
 * The people on the salon floor, painted from a Look in our own cute style: a round head a little under a third of
 * the figure's height on a neck you can see, big glossy eyes, and a small body in soft light from the top left. Hair
 * follows the close-up's seven styles (long, bob, bun, curly, crop, ponytail, braids) with volume, strands and
 * a sheen band. Clothes say who they are: players wear an apron in their colour over a tee, staff a mint smock
 * with a name badge, and customers dress for their archetype (a suit for the businessman, a hoodie for the
 * student, scrubs for the nurse, a cardigan for the grandma...). Arms and legs are separate so people walk,
 * sit and work. Every texture is cached by look and made once.
 */
export type Expr = 'smile' | 'happy' | 'neutral' | 'meh' | 'sleepy' | 'blink' | 'wow'
export type Role = 'customer' | 'player' | 'staff'

export type PersonTextures = { hairBack: Texture | null; body: Texture; arm: Texture; leg: Texture; legSeat: (k: SeatKind) => Texture; head: (e: Expr) => Texture }

/**
 * Where a seated person's hips, knees and feet land (the person's own units, from the feet anchor), per seat: sunk
 * into the sofa with the feet on the floor, perched on the nail stool, or reclined in the facial chair with the legs
 * along the leg rest and the shoes toes-up at its end.
 */
export type SeatKind = 'sofa' | 'chair' | 'stool'
export const SEATS: Record<SeatKind, { hip: number; knee: number; foot: number; recline: boolean }> = {
  sofa: { hip: -15.5, knee: -4, foot: 11, recline: false },
  chair: { hip: -3, knee: 7, foot: 13, recline: true },
  stool: { hip: -6.5, knee: 3.5, foot: 15, recline: false },
}

/** Character geometry in world units, feet at (0, 0): the head (with its hair) is a little under a third of the height. */
export const P = {
  /** The middle of the face (the chin sits a clear neck above the shoulders). */
  headY: -76.4,
  headR: 15,
  /** The head and its hair are painted at headR and drawn smaller on the floor, so the body carries the figure. */
  headScale: 0.86,
  shoulderY: -57,
  shoulderX: 10.5,
  hipY: -30,
  legX: 5,
  height: 100,
}

/** Anchors (in the texture's own units) for placing each part. */
export const ANCHOR = {
  head: { w: 58, h: 62, x: 29, y: 36 },
  hairBack: { w: 62, h: 86, x: 31, y: 36 },
  body: { w: 46, h: 57, x: 23, y: 14 },
  arm: { w: 12, h: 30, x: 6, y: 3 },
  leg: { w: 13, h: 35, x: 6.5, y: 2 },
}

/** People are painted at three canvas pixels per world unit: they are small and seen up close on a phone. */
const RES = 3
const cache = new Map<string, Texture>()
function tex(key: string, w: number, h: number, draw: (ctx: Ctx) => void): Texture {
  let t = cache.get(key)
  if (!t) {
    const [c, ctx] = canvas(Math.ceil(w * RES), Math.ceil(h * RES))
    ctx.scale(RES, RES)
    draw(ctx)
    t = new Texture({ source: new CanvasSource({ resource: c, resolution: RES, autoGenerateMipmaps: true, scaleMode: 'linear' }) })
    cache.set(key, t)
  }
  return t
}

// ------------------------------------------------------------------ outfits

/** What a customer wears, from who they are. */
export type OutfitKind = 'dress' | 'jumper' | 'dungarees' | 'suit' | 'hoodie' | 'sporty' | 'cardigan' | 'jacket' | 'scrubs' | 'chef'

const ARCHETYPE_OUTFITS: Record<string, OutfitKind[]> = {
  student: ['hoodie', 'jumper'], office: ['suit', 'cardigan'], grandma: ['cardigan', 'dress'], athlete: ['sporty'], teen: ['hoodie', 'dungarees'],
  farmer: ['dungarees'], chef: ['chef'], nurse: ['scrubs'], gamer: ['hoodie'], rocker: ['jacket'], dancer: ['sporty', 'dress'], businessman: ['suit'],
  bride: ['dress'], influencer: ['dress', 'jacket'], gardener: ['dungarees', 'cardigan'], musician: ['jacket', 'hoodie'], surfer: ['sporty'],
  teacher: ['cardigan', 'jumper'], mechanic: ['dungarees'], artist: ['dungarees', 'jumper'], hiker: ['sporty', 'jacket'], baker: ['chef', 'cardigan'],
  lawyer: ['suit'], model: ['dress', 'jacket'], grandpa: ['cardigan', 'jumper'], 'toddler-parent': ['jumper', 'hoodie'], wrestler: ['sporty'],
  pilot: ['suit'], streamer: ['hoodie'], royal: ['dress', 'suit'],
}

type Outfit = { kind: OutfitKind; main: RGB; second: RGB; pants: RGB; skirt: boolean; shoes: RGB; sleeve: RGB | null }

function outfitOf(look: Look, fig: Figure, role: Role, tint: number, archetype?: string): Outfit {
  const main = hexRGB(OUTFIT[look.outfit % OUTFIT.length])
  const second = hexRGB(OUTFIT[(look.outfit + 3) % OUTFIT.length])
  const shoes = shade(hexRGB(OUTFIT[(look.outfit + 4) % OUTFIT.length]), -0.3)
  if (role === 'player') return { kind: 'jumper', main: [252, 246, 240], second: hexRGB(tint), pants: [92, 84, 120], skirt: false, shoes: [250, 250, 252], sleeve: [252, 246, 240] }
  if (role === 'staff') return { kind: 'scrubs', main: [178, 228, 210], second: [120, 196, 170], pants: [250, 250, 248], skirt: false, shoes: [255, 255, 255], sleeve: [178, 228, 210] }
  const r = makeRng(look.outfit * 131 + look.hair * 17 + look.skin * 7 + (archetype ? archetype.length * 3 : 0))
  const pool = (archetype && ARCHETYPE_OUTFITS[archetype]) || (['dress', 'jumper', 'dungarees', 'hoodie', 'cardigan'] as OutfitKind[])
  let kind = r.pick(pool)
  if (fig.masc && kind === 'dress') kind = archetype === 'royal' ? 'suit' : 'jumper'
  const denim: RGB = [110, 142, 196], slate: RGB = [86, 84, 112], khaki: RGB = [196, 170, 128]
  switch (kind) {
    case 'dress': return { kind, main: archetype === 'bride' ? [252, 250, 248] : archetype === 'royal' ? [176, 140, 220] : main, second, pants: [0, 0, 0], skirt: true, shoes, sleeve: null }
    case 'suit': return { kind, main: archetype === 'pilot' ? [58, 72, 118] : r.pick([[72, 74, 104], [118, 104, 140], [92, 110, 128]] as RGB[]), second: main, pants: archetype === 'pilot' ? [58, 72, 118] : [72, 74, 104], skirt: false, shoes: [70, 52, 58], sleeve: null }
    case 'hoodie': return { kind, main, second, pants: denim, skirt: false, shoes: [250, 250, 252], sleeve: main }
    case 'sporty': return { kind, main, second: [255, 255, 255], pants: r.pick([slate, second]), skirt: false, shoes: [250, 250, 252], sleeve: null }
    case 'cardigan': return { kind, main, second: [252, 246, 236], pants: fig.masc ? khaki : shade(second, -0.1), skirt: !fig.masc, shoes, sleeve: main }
    case 'jacket': return { kind, main: [70, 62, 78], second: main, pants: denim, skirt: false, shoes: [60, 52, 60], sleeve: [70, 62, 78] }
    case 'scrubs': return { kind, main: [150, 206, 222], second: [110, 170, 196], pants: [150, 206, 222], skirt: false, shoes: [255, 255, 255], sleeve: null }
    case 'chef': return { kind, main: [252, 252, 250], second: [220, 90, 110], pants: [72, 70, 84], skirt: false, shoes: [60, 52, 60], sleeve: [252, 252, 250] }
    case 'dungarees': return { kind, main, second: denim, pants: denim, skirt: false, shoes, sleeve: null }
    default: return { kind: 'jumper', main, second, pants: fig.masc ? slate : r.pick([denim, slate, shade(second, -0.2)]), skirt: false, shoes, sleeve: main }
  }
}

/**
 * What makes a face its own at floor scale: the eye colour (a customer's is the same as in their close-up), the
 * brows' weight and arch, the nose, the mouth's width, the blush and the lashes, all 0 to 1 from the seed.
 */
type FaceVar = { iris: RGB; brow: number; nose: number; mouth: number; blush: number; lashes: number }
function faceVarOf(look: Look, seed?: number): FaceVar {
  if (seed !== undefined) {
    const f = faceProfile(seed, false).features
    return { iris: irisForSeed(seed), brow: f.brow, nose: f.nose, mouth: f.lips, blush: f.blush, lashes: f.lashes }
  }
  const r = makeRng(look.skin * 97 + look.hair * 31 + look.outfit * 11 + look.hairStyle * 5 + look.accessory)
  return { iris: CLOSEUP_IRIS[r.int(0, CLOSEUP_IRIS.length - 1)], brow: r(), nose: r(), mouth: r(), blush: r(), lashes: r() }
}

/** Glasses suit some people more than others: fewer overall, more on the teacher, the lawyer, the grandpa. */
const GLASSES_FIT = new Set(['teacher', 'businessman', 'grandpa', 'grandma', 'lawyer', 'office', 'artist', 'gamer', 'pilot'])
function accessoryFor(look: Look, archetype?: string): number {
  const h = (look.skin * 7 + look.hair * 13 + look.outfit * 17 + look.hairStyle * 3) % 10
  if (look.accessory === 2 && !(archetype && GLASSES_FIT.has(archetype)) && h < 5) return 0
  if (look.accessory === 0 && archetype && GLASSES_FIT.has(archetype) && h < 3) return 2
  return look.accessory
}

const lookKey = (l: Look, fig: Figure) => `${l.skin}.${l.hair}.${l.hairStyle}.${l.outfit}.${l.accessory}.${l.freckles ? 1 : 0}.${fig.masc ? 1 : 0}${fig.age >= SENIOR_AGE ? 1 : 0}`

/** Kept for callers that ask for the old outfit style number. */
export function outfitStyle(l: Look) { return l.outfit % 3 }

export function personTextures(look0: Look, role: Role = 'customer', tint = 0xe7799c, archetype?: string, seed?: number): PersonTextures {
  const look = { ...look0, accessory: accessoryFor(look0, archetype) }
  const fig = lookFigure(look)
  const face = faceVarOf(look, seed)
  const key = `${lookKey(look, fig)}|${role}|${tint}|${archetype ?? ''}|${seed ?? ''}`
  const skin = SKIN[look.skin % SKIN.length]
  const hair = hairPalette(HAIR[look.hair % HAIR.length], fig)
  const outfit = outfitOf(look, fig, role, tint, archetype)
  const sleeve = outfit.sleeve ?? skin.base
  return {
    hairBack: tex(`hb|${key}`, ANCHOR.hairBack.w, ANCHOR.hairBack.h, ctx => paintHairBack(ctx, look, hair, ANCHOR.hairBack.x, ANCHOR.hairBack.y)),
    body: tex(`b|${key}`, ANCHOR.body.w, ANCHOR.body.h, ctx => paintBody(ctx, outfit, skin, fig, role)),
    arm: tex(`a|${key}`, ANCHOR.arm.w, ANCHOR.arm.h, ctx => paintArm(ctx, sleeve, skin, outfit.sleeve === null)),
    leg: tex(`l|${key}`, ANCHOR.leg.w, ANCHOR.leg.h, ctx => paintLeg(ctx, outfit, skin, fig)),
    legSeat: (k: SeatKind) => tex(`ls|${key}|${k}`, ANCHOR.leg.w, ANCHOR.leg.h, ctx => paintSeatLeg(ctx, outfit, skin, fig, k)),
    head: (e: Expr) => tex(`h|${key}|${e}`, ANCHOR.head.w, ANCHOR.head.h, ctx => paintHead(ctx, look, skin, hair, e, fig, ANCHOR.head.x, ANCHOR.head.y, face)),
  }
}

type SkinT = (typeof SKIN)[number]
type HairT = (typeof HAIR)[number]

function outline(ctx: Ctx, col: RGB, a = 0.55, w = 0.8) { ctx.strokeStyle = rgba(shade(col, -0.45), a); ctx.lineWidth = w; ctx.stroke() }

// ------------------------------------------------------------------ the head

function facePath(ctx: Ctx, cx: number, cy: number, R: number, masc: boolean) {
  const jaw = masc ? 0.66 : 0.5
  ctx.beginPath()
  ctx.moveTo(cx - R, cy - 1)
  ctx.bezierCurveTo(cx - R, cy - R * 1.2, cx + R, cy - R * 1.2, cx + R, cy - 1)
  ctx.bezierCurveTo(cx + R, cy + R * 0.7, cx + R * jaw, cy + R * 1.0, cx, cy + R * 1.0)
  ctx.bezierCurveTo(cx - R * jaw, cy + R * 1.0, cx - R, cy + R * 0.7, cx - R, cy - 1)
  ctx.closePath()
}

function paintHead(ctx: Ctx, look: Look, skin: SkinT, hair: HairT, e: Expr, fig: Figure, cx: number, cy: number, face: FaceVar = faceVarOf(look)) {
  const R = P.headR
  // Ears, with a warm inner shade.
  for (const s of [-1, 1]) {
    ctx.fillStyle = rgba(skin.base); ctx.beginPath(); ctx.ellipse(cx + s * (R - 0.4), cy + 2, 3.1, 4, s * 0.15, 0, Math.PI * 2); ctx.fill(); outline(ctx, skin.shadow, 0.45)
    ctx.fillStyle = rgba(skin.blush, 0.5); ctx.beginPath(); ctx.ellipse(cx + s * (R - 0.2), cy + 2.2, 1.5, 2.3, 0, 0, Math.PI * 2); ctx.fill()
  }
  // The face: soft and round, fuller at the cheeks, lit from the top left with a warm shade on the far side.
  facePath(ctx, cx, cy, R, fig.masc)
  const g = ctx.createRadialGradient(cx - 5, cy - 6, 2, cx, cy, R * 1.3)
  g.addColorStop(0, rgba(skin.light)); g.addColorStop(0.55, rgba(skin.base)); g.addColorStop(1, rgba(mixRGB(skin.base, skin.shadow, 0.7)))
  ctx.fillStyle = g
  ctx.fill()
  ctx.save()
  facePath(ctx, cx, cy, R, fig.masc); ctx.clip()
  // Form: a soft shade down the right cheek and under the jaw, a rim of light on the left.
  blurred(ctx, 3, () => { ctx.fillStyle = rgba(skin.shadow, 0.35); ctx.beginPath(); ctx.ellipse(cx + R * 0.95, cy + 3, R * 0.45, R * 1.1, 0, 0, Math.PI * 2); ctx.fill() })
  blurred(ctx, 1.5, () => { ctx.strokeStyle = rgba(skin.light, 0.8); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(cx, cy, R - 0.6, Math.PI * 0.72, Math.PI * 1.08); ctx.stroke() })
  if (fig.masc && fig.age < SENIOR_AGE && (look.skin + look.hair) % 3 === 0) blurred(ctx, 1.5, () => { ctx.fillStyle = rgba(mixRGB(skin.shadow, [90, 70, 70], 0.4), 0.22); ctx.beginPath(); ctx.ellipse(cx, cy + R * 0.72, R * 0.72, R * 0.36, 0, 0, Math.PI * 2); ctx.fill() })
  ctx.restore()
  outline(ctx, skin.shadow, 0.5)
  // Cheeks: some rosy, some barely.
  const blushA = (0.3 + 0.4 * face.blush) * (fig.masc ? 0.55 : 1)
  blob(ctx, cx - 8.2, cy + 5.2, 3.6, 2.4, skin.blush, blushA)
  blob(ctx, cx + 8.8, cy + 5.2, 3.6, 2.4, skin.blush, blushA)
  if (look.freckles) { ctx.fillStyle = rgba(skin.deep, 0.45); for (const [fx, fy] of [[-9, 2.5], [-6.5, 4], [-8, 5.5], [8, 2.5], [10.5, 4], [7.5, 5.5]]) { ctx.beginPath(); ctx.arc(cx + fx, cy + fy, 0.55, 0, Math.PI * 2); ctx.fill() } }
  if (fig.age >= SENIOR_AGE) { ctx.strokeStyle = rgba(skin.shadow, 0.55); ctx.lineWidth = 0.6; for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(cx + s * 7.5, cy + 7, 3, s < 0 ? Math.PI * 0.6 : Math.PI * 0.1, s < 0 ? Math.PI * 0.9 : Math.PI * 0.4); ctx.stroke() } }
  paintFace(ctx, cx + 0.8, cy, e, skin, fig, face)
  paintHairFront(ctx, look, hair, cx, cy, skin)
  // No bow for masculine customers (glasses and flower clips stay).
  paintAccessory(ctx, fig.masc && look.accessory === 1 ? { ...look, accessory: 0 } : look, cx, cy)
}

function paintFace(ctx: Ctx, cx: number, cy: number, e: Expr, skin: SkinT, fig: Figure, face: FaceVar) {
  const ink = 'rgba(64,36,50,1)'
  const eyeY = cy + 1.4, ex = 5.7
  ctx.lineCap = 'round'
  const closedArc = (x: number, up: boolean) => { ctx.strokeStyle = ink; ctx.lineWidth = 1.2; ctx.beginPath(); if (up) ctx.arc(x, eyeY + 1.6, 2.5, Math.PI * 1.15, Math.PI * 1.85); else ctx.arc(x, eyeY - 1, 2.5, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke() }
  if (e === 'happy') { closedArc(cx - ex, true); closedArc(cx + ex, true) }
  else if (e === 'sleepy' || e === 'blink') { closedArc(cx - ex, false); closedArc(cx + ex, false) }
  else {
    for (const s of [-1, 1]) {
      const x = cx + s * ex
      const h = e === 'wow' ? 3.7 : 3.2
      // A white of the eye peeking at the outer corner, a big glossy iris, two catchlights.
      ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.ellipse(x + s * 0.5, eyeY, 2.6, h, 0, 0, Math.PI * 2); ctx.fill()
      const ig = ctx.createLinearGradient(0, eyeY - h, 0, eyeY + h)
      ig.addColorStop(0, rgba(shade(face.iris, -0.62))); ig.addColorStop(0.55, rgba(shade(face.iris, -0.2))); ig.addColorStop(1, rgba(shade(face.iris, 0.18)))
      ctx.fillStyle = ig
      ctx.beginPath(); ctx.ellipse(x, eyeY + 0.2, 2.25, h, 0, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x - 0.8, eyeY - 1.3, 0.95, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.beginPath(); ctx.arc(x + 0.9, eyeY + 1.3, 0.5, 0, Math.PI * 2); ctx.fill()
      // The upper lid line, with a little flick of lashes on the feminine faces.
      ctx.strokeStyle = ink; ctx.lineWidth = fig.masc ? 0.9 : 1.1
      ctx.beginPath(); ctx.arc(x, eyeY + 0.6, 2.7, Math.PI * 1.12, Math.PI * 1.88); ctx.stroke()
      // Lashes: a flick at the outer corner, longer on some; none on the masculine faces.
      if (!fig.masc) { const l = 0.7 + face.lashes * 0.9; ctx.beginPath(); ctx.moveTo(x + s * 2.4, eyeY - 1.4); ctx.lineTo(x + s * (2.4 + l), eyeY - 1.4 - l * 0.9); ctx.stroke(); if (face.lashes > 0.55) { ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(x + s * 1.6, eyeY - 2.1); ctx.lineTo(x + s * (1.9 + l * 0.6), eyeY - 2.2 - l * 0.7); ctx.stroke() } }
      if (e === 'meh') { ctx.fillStyle = rgba(skin.base); ctx.fillRect(x - 3, eyeY - h - 1, 6, h * 0.85); ctx.strokeStyle = ink; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(x - 2.6, eyeY - h * 0.2); ctx.lineTo(x + 2.6, eyeY - h * 0.2); ctx.stroke() }
    }
  }
  // Brows: soft arcs, heavier or lighter and more or less arched per person; raised when happy, tilted when meh.
  ctx.strokeStyle = fig.masc ? 'rgba(78,48,60,0.8)' : 'rgba(96,60,74,0.7)'; ctx.lineWidth = (fig.masc ? 1.15 : 0.8) + face.brow * 0.5
  const arch = 0.4 + face.brow * 0.9 - (fig.masc ? 0.3 : 0)
  for (const s of [-1, 1]) {
    const x = cx + s * ex, y = eyeY - 5.6 - (e === 'happy' || e === 'wow' ? 0.9 : 0)
    ctx.beginPath()
    if (e === 'meh') { ctx.moveTo(x - 2.2, y + (s < 0 ? -0.6 : 1)); ctx.lineTo(x + 2.2, y + (s < 0 ? 1 : -0.6)) }
    else { ctx.moveTo(x - 2.3, y + 0.6); ctx.quadraticCurveTo(x + s * 0.4, y - arch, x + 2.3, y + 0.6) }
    ctx.stroke()
  }
  // Nose: a small shade and a highlight, a little bigger on some; a hint of the bridge on the bigger ones.
  const nose = 0.8 + face.nose * 0.5 + (fig.masc ? 0.2 : 0)
  ctx.fillStyle = rgba(skin.shadow, 0.55); ctx.beginPath(); ctx.ellipse(cx + 0.6, cy + 5.6, 0.95 * nose, 0.65 * nose, 0, 0, Math.PI * 2); ctx.fill()
  if (nose > 1.05) { ctx.strokeStyle = rgba(skin.shadow, 0.35); ctx.lineWidth = 0.55; ctx.beginPath(); ctx.moveTo(cx + 1.3, cy + 1.8); ctx.quadraticCurveTo(cx + 1.8, cy + 4, cx + 1.4, cy + 5.2); ctx.stroke() }
  ctx.fillStyle = rgba(skin.light, 0.8); ctx.beginPath(); ctx.arc(cx - 0.2, cy + 4.6, 0.5, 0, Math.PI * 2); ctx.fill()
  // Mouth: narrower or wider per person.
  const mw = 0.8 + face.mouth * 0.45
  const my = cy + 8.4
  ctx.strokeStyle = 'rgba(122,48,68,0.9)'; ctx.lineWidth = 1
  if (e === 'happy' || e === 'wow') {
    ctx.fillStyle = e === 'wow' ? '#963c58' : '#aa4664'
    ctx.beginPath()
    if (e === 'wow') ctx.ellipse(cx, my + 0.6, 1.6, 2, 0, 0, Math.PI * 2)
    else { ctx.moveTo(cx - 2.8 * mw, my - 0.4); ctx.quadraticCurveTo(cx, my + 4, cx + 2.8 * mw, my - 0.4); ctx.closePath() }
    ctx.fill()
    if (e === 'happy') { ctx.fillStyle = '#f39aa9'; ctx.beginPath(); ctx.ellipse(cx, my + 1.8, 1.4, 0.8, 0, 0, Math.PI * 2); ctx.fill() }
  } else if (e === 'meh') { ctx.beginPath(); ctx.moveTo(cx - 1.7, my + 0.6); ctx.quadraticCurveTo(cx, my - 0.4, cx + 1.7, my + 0.6); ctx.stroke() }
  else if (e === 'sleepy') { ctx.beginPath(); ctx.ellipse(cx, my + 0.3, 1.1, 0.8, 0, 0, Math.PI * 2); ctx.stroke() }
  else { ctx.beginPath(); ctx.moveTo(cx - 2.1 * mw, my - 0.2); ctx.quadraticCurveTo(cx, my + 1.8, cx + 2.1 * mw, my - 0.2); ctx.stroke() }
}

// ------------------------------------------------------------------ hair

/** Hair colour: light on top, the base, then dark underneath. */
function hairFill(ctx: Ctx, hair: HairT, x0: number, y0: number, x1: number, y1: number) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1)
  g.addColorStop(0, rgba(hair.light)); g.addColorStop(0.3, rgba(hair.base)); g.addColorStop(1, rgba(hair.dark))
  return g
}

/** A strong specular band across the crown, the way the close-up's hair shines. */
function sheen(ctx: Ctx, hair: HairT, cx: number, cy: number, r: number, from = 1.12, to = 1.5) {
  ctx.save()
  ctx.lineCap = 'round'
  ctx.strokeStyle = rgba(shade(hair.light, 0.45), 0.75); ctx.lineWidth = 1.8
  ctx.beginPath(); ctx.arc(cx - 1, cy, r, Math.PI * from, Math.PI * to); ctx.stroke()
  ctx.strokeStyle = rgba(shade(hair.light, 0.65), 0.6); ctx.lineWidth = 0.9
  ctx.beginPath(); ctx.arc(cx - 1, cy, r - 1.6, Math.PI * (from + 0.06), Math.PI * (to - 0.1)); ctx.stroke()
  ctx.restore()
}

/** Fine strands inside a filled shape: a few dark and light hairlines along the flow. */
function strands(ctx: Ctx, hair: HairT, lines: [number, number, number, number, number, number][]) {
  ctx.save()
  ctx.lineCap = 'round'
  lines.forEach(([x0, y0, qx, qy, x1, y1], i) => {
    ctx.strokeStyle = i % 3 === 0 ? rgba(shade(hair.light, 0.2), 0.45) : rgba(hair.dark, 0.35)
    ctx.lineWidth = i % 3 === 0 ? 0.55 : 0.5
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(qx, qy, x1, y1); ctx.stroke()
  })
  ctx.restore()
}

function paintHairFront(ctx: Ctx, look: Look, hair: HairT, cx: number, cy: number, skin?: SkinT) {
  const R = P.headR
  const style = ((look.hairStyle % 7) + 7) % 7
  const top = cy - R - 4.5
  if (style === 3) {
    // Curly: a cloud of springy curls framing the face, lit on top.
    const curls: [number, number, number][] = [[-14, -6, 5.6], [-12, -13, 6], [-5, -17.5, 6.2], [4, -18, 6.2], [11.5, -13.5, 6], [14.5, -6, 5.6], [-15.5, 1.5, 4.4], [16, 2, 4.4], [-8, -12, 5], [7, -12.5, 5]]
    for (const [x, y, r] of curls) { ctx.fillStyle = hairFill(ctx, hair, cx + x - r, cy + y - r, cx + x + r, cy + y + r); ctx.beginPath(); ctx.arc(cx + x, cy + y, r, 0, Math.PI * 2); ctx.fill() }
    ctx.strokeStyle = rgba(hair.dark, 0.55); ctx.lineWidth = 0.6
    for (const [x, y, r] of curls) { ctx.beginPath(); ctx.arc(cx + x + 0.5, cy + y + 0.5, r * 0.55, 0.3, 2.7); ctx.stroke() }
    for (const [x, y, r] of curls.slice(1, 5)) blob(ctx, cx + x - r * 0.35, cy + y - r * 0.4, r * 0.42, r * 0.26, shade(hair.light, 0.3), 0.8)
    return
  }
  const back = style === 2 || style === 5 || style === 6
  // Where the hair flows to: the part (loose styles), the bun or the ponytail's tie (pulled back).
  const origin = style === 2 ? { x: cx + 1, y: top - 4 } : style === 5 ? { x: cx + R + 2, y: cy - 10 } : style === 6 ? { x: cx, y: top } : { x: cx + 4, y: top + 0.5 }
  // The outer contour over the crown, full and a little above the scalp for volume.
  const sideY = style === 0 || style === 1 ? 4 : style === 4 ? -2.5 : -1.5
  const r = makeRng(look.hair * 31 + look.hairStyle * 7 + look.skin)
  // The crown's silhouette: the dome, with soft tufts along it (bigger on loose hair), so it never reads as a cap.
  const bez = (t: number, a: number, b: number, c2: number, d: number) => (1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t * t * c2 + t ** 3 * d
  const tuft = back ? 0.5 : 1.3
  const rim = Array.from({ length: 17 }, (_, k) => {
    const t = k / 16
    const x = bez(t, cx - R - 1.3, cx - R - 3.2, cx + R + 3.2, cx + R + 1.3), y = bez(t, cy + sideY, top - 2.5, top - 2.5, cy + sideY)
    const dx = x - cx, dy = y - (cy - 2), d = Math.hypot(dx, dy) || 1
    const out = k === 0 || k === 16 ? 0 : (k % 2 ? tuft * r.range(0.5, 1.1) : r.range(0, 0.3))
    return { x: x + (dx / d) * out, y: y + (dy / d) * out }
  })
  const crown = (c: Ctx) => {
    c.moveTo(rim[0].x, rim[0].y)
    for (let k = 1; k < rim.length - 1; k++) c.quadraticCurveTo(rim[k].x, rim[k].y, (rim[k].x + rim[k + 1].x) / 2, (rim[k].y + rim[k + 1].y) / 2)
    c.lineTo(rim[16].x, rim[16].y)
  }
  // The hairline, back from the right temple to the left one, shaped per style.
  const hairline = (c: Ctx) => {
    if (style === 1) {
      // Bob: sides to the chin curling in, a blunt fringe with a soft uneven edge.
      c.lineTo(cx + R + 1.3, cy + 9); c.quadraticCurveTo(cx + R - 0.5, cy + 12.8, cx + R - 4, cy + 9.4)
      c.lineTo(cx + R - 4.3, cy - 4.5)
      for (let k = 0; k <= 6; k++) { const x = cx + R - 4.3 - (k / 6) * (2 * R - 8.6); c.lineTo(x, cy - 5.2 + (k % 2 ? 0.7 : 0)) }
      c.lineTo(cx - R + 4, cy + 9.4); c.quadraticCurveTo(cx - R + 0.5, cy + 12.8, cx - R - 1.3, cy + 9)
    } else if (style === 4) {
      // Crop: a side part with the fringe swept across into a little lock.
      c.quadraticCurveTo(cx + R - 0.8, cy - 6.5, cx + 5, cy - 10)
      c.quadraticCurveTo(cx - 1, cy - 11, cx - 6, cy - 7.5)
      c.quadraticCurveTo(cx - 8.5, cy - 5.2, cx - 9.6, cy - 6.5)
      c.quadraticCurveTo(cx - R + 1, cy - 6, cx - R - 1.3, cy + sideY)
    } else if (back) {
      // Pulled back: the hairline follows the forehead, dips a touch in the middle and comes down at the temples.
      c.quadraticCurveTo(cx + R - 0.6, cy - 7.5, cx + 7, cy - 10)
      c.quadraticCurveTo(cx + 2.5, cy - 11.2, cx, cy - 9.6)
      c.quadraticCurveTo(cx - 2.5, cy - 11.2, cx - 7, cy - 10)
      c.quadraticCurveTo(cx - R + 0.6, cy - 7.5, cx - R - 1.3, cy + sideY)
    } else {
      // Long: a side-swept fringe falling over one brow.
      c.quadraticCurveTo(cx + R - 1.2, cy - 2, cx + R - 4.6, cy - 5.6)
      c.quadraticCurveTo(cx + 3, cy - 11.4, cx - 4.5, cy - 4.6)
      c.quadraticCurveTo(cx - 8.5, cy - 1.2, cx - R + 1.2, cy + 4.5)
    }
  }
  const shape = () => { ctx.beginPath(); crown(ctx); hairline(ctx); ctx.closePath() }
  // The hair's soft shadow on the forehead, just under the hairline: it sits on the skin, not like a hat brim.
  const shadowCol: RGB = skin ? mixRGB(skin.shadow, [120, 60, 80], 0.3) : [140, 80, 90]
  ctx.save(); ctx.translate(0.4, 1.3); ctx.filter = 'blur(0.9px)'; shape(); ctx.fillStyle = rgba(shadowCol, 0.4); ctx.fill(); ctx.restore()
  ctx.save()
  shape()
  ctx.fillStyle = hairFill(ctx, hair, cx - R, top, cx + R * 0.4, cy + 8)
  ctx.fill()
  ctx.clip()
  // Clumps of hair flowing from the part, or back toward the bun or the tie: a dark groove between each, and a
  // lit ridge beside it on the side the light comes from.
  ctx.lineCap = 'round'
  const clumps = back ? 8 : 7
  for (let k = 0; k < clumps; k++) {
    const u = (k + 0.5 + r.range(-0.2, 0.2)) / clumps
    const edge = { x: cx - R - 1.5 + u * (2 * R + 3), y: back ? cy - 9 + Math.abs(u - 0.5) * 13 : cy - 1 + Math.abs(u - 0.5) * 7 }
    const bend = edge.x < origin.x ? -2.6 : 2.6
    const mid = { x: (edge.x + origin.x) / 2 + bend, y: (edge.y + origin.y) / 2 - 2.8 }
    const o = { x: origin.x + r.range(-1.2, 1.2), y: origin.y + r.range(-0.6, 0.6) }
    ctx.strokeStyle = rgba(hair.dark, 0.5); ctx.lineWidth = 0.8
    ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.quadraticCurveTo(mid.x, mid.y, edge.x, edge.y); ctx.stroke()
    ctx.strokeStyle = rgba(shade(hair.light, 0.25), 0.42); ctx.lineWidth = 1.1
    ctx.beginPath(); ctx.moveTo(o.x - 1, o.y + 0.4); ctx.quadraticCurveTo(mid.x - 1.1, mid.y + 0.3, edge.x - 1.1, edge.y - 0.6); ctx.stroke()
  }
  // Finer strands between the clumps.
  for (let k = 0; k < 10; k++) {
    const u = r()
    const edge = { x: cx - R + u * 2 * R, y: back ? cy - 9 + Math.abs(u - 0.5) * 12 : cy - 1.5 + Math.abs(u - 0.5) * 7 }
    ctx.strokeStyle = rgba(k % 2 ? hair.dark : shade(hair.light, 0.3), 0.3); ctx.lineWidth = 0.4
    ctx.beginPath(); ctx.moveTo(origin.x, origin.y); ctx.quadraticCurveTo((edge.x + origin.x) / 2 + (edge.x < origin.x ? -2 : 2), (edge.y + origin.y) / 2 - 2.5, edge.x, edge.y); ctx.stroke()
  }
  // Darker underneath at the sides, where the hair turns under.
  blurred(ctx, 1.4, () => { ctx.fillStyle = rgba(hair.dark, 0.35); for (const sd of [-1, 1]) { ctx.beginPath(); ctx.ellipse(cx + sd * (R + 0.5), cy + sideY - 2, 2.6, 6, 0, 0, Math.PI * 2); ctx.fill() } })
  ctx.restore()
  // Only the outer contour gets a line; the hairline stays soft.
  ctx.beginPath(); crown(ctx); outline(ctx, hair.dark, 0.5, 0.7)
  // The sheen: a band of short bright strokes across the crown (one smooth arc would read as a helmet's shine).
  ctx.save()
  ctx.lineCap = 'round'
  for (const [a0, a1, w] of [[1.13, 1.2, 1.6], [1.23, 1.31, 1.9], [1.34, 1.41, 1.7], [1.44, 1.5, 1.3]] as [number, number, number][]) {
    const rr = R + 0.9 + r.range(-0.5, 0.5)
    ctx.strokeStyle = rgba(shade(hair.light, 0.5), 0.8); ctx.lineWidth = w
    ctx.beginPath(); ctx.arc(cx - 1, cy - 2.5, rr, Math.PI * a0, Math.PI * a1); ctx.stroke()
    ctx.strokeStyle = rgba(shade(hair.light, 0.75), 0.7); ctx.lineWidth = w * 0.4
    ctx.beginPath(); ctx.arc(cx - 1, cy - 2.5, rr - 0.2, Math.PI * (a0 + 0.015), Math.PI * (a1 - 0.02)); ctx.stroke()
  }
  ctx.restore()
  // A few loose wisps at the temples on the pulled-back styles.
  if (back) {
    ctx.strokeStyle = rgba(hair.base, 0.8); ctx.lineWidth = 0.5
    for (const sd of [-1, 1]) { ctx.beginPath(); ctx.moveTo(cx + sd * (R - 1.5), cy - 5); ctx.quadraticCurveTo(cx + sd * (R - 0.5), cy - 1, cx + sd * (R - 2), cy + 2); ctx.stroke() }
  }
  if (style === 6) {
    // A clean centre parting for the braids.
    ctx.strokeStyle = rgba(mixRGB(hair.dark, [200, 150, 150], 0.25), 0.7); ctx.lineWidth = 0.7
    ctx.beginPath(); ctx.moveTo(cx, top + 0.5); ctx.quadraticCurveTo(cx + 0.5, cy - R * 0.6, cx, cy - 10); ctx.stroke()
  }
  if (style === 2) {
    // The top bun: a twisted knot of two or three loops, strands wrapping round it, a shade where it sits.
    const by = top - 4.5
    blurred(ctx, 1, () => { ctx.fillStyle = rgba(hair.dark, 0.45); ctx.beginPath(); ctx.ellipse(cx + 1, by + 5, 6.5, 2, 0, 0, Math.PI * 2); ctx.fill() })
    const loops: [number, number, number, number, number][] = [[-2.2, 0.8, 4.6, 4, -0.5], [2.8, 0.4, 4.8, 4.2, 0.4], [0.4, -2.6, 4.4, 3.6, 0.1]]
    for (const [dx, dy, rx, ry, rot] of loops) {
      ctx.fillStyle = hairFill(ctx, hair, cx + dx - rx, by + dy - ry, cx + dx + rx, by + dy + ry)
      ctx.beginPath(); ctx.ellipse(cx + 1 + dx, by + dy, rx, ry, rot, 0, Math.PI * 2); ctx.fill(); outline(ctx, hair.dark, 0.5, 0.65)
      ctx.strokeStyle = rgba(hair.dark, 0.5); ctx.lineWidth = 0.55
      ctx.beginPath(); ctx.ellipse(cx + 1 + dx, by + dy + 0.3, rx * 0.6, ry * 0.55, rot, Math.PI * 0.1, Math.PI * 0.95); ctx.stroke()
      ctx.strokeStyle = rgba(shade(hair.light, 0.45), 0.7); ctx.lineWidth = 0.8
      ctx.beginPath(); ctx.ellipse(cx + 1 + dx, by + dy, rx * 0.72, ry * 0.7, rot, Math.PI * 1.15, Math.PI * 1.55); ctx.stroke()
    }
  }
}

function paintHairBack(ctx: Ctx, look: Look, hair: HairT, cx: number, cy: number) {
  const R = P.headR
  const style = ((look.hairStyle % 7) + 7) % 7
  const top = cy - R - 4.5
  ctx.fillStyle = hairFill(ctx, hair, cx - R, top, cx + R, cy + 30)
  // The back of the head, always there (it rounds the silhouette out behind the ears).
  ctx.beginPath(); ctx.ellipse(cx, cy - 2, R + 2.4, R + 3.2, 0, 0, Math.PI * 2); ctx.fill()
  outline(ctx, hair.dark, 0.5, 0.75)
  if (style === 0) {
    // Long: flowing past the shoulders, a little wave at the ends.
    ctx.fillStyle = hairFill(ctx, hair, cx - R, top, cx + R, cy + 32)
    ctx.beginPath()
    ctx.moveTo(cx - R - 2.4, cy - 3)
    ctx.bezierCurveTo(cx - R - 4, cy + 12, cx - R - 3, cy + 24, cx - R + 1, cy + 31)
    ctx.quadraticCurveTo(cx - 6, cy + 34, cx, cy + 31)
    ctx.quadraticCurveTo(cx + 6, cy + 34, cx + R - 1, cy + 31)
    ctx.bezierCurveTo(cx + R + 3, cy + 24, cx + R + 4, cy + 12, cx + R + 2.4, cy - 3)
    ctx.closePath(); ctx.fill(); outline(ctx, hair.dark, 0.5, 0.75)
    strands(ctx, hair, [[cx - R, cy + 2, cx - R - 1, cy + 18, cx - R + 2, cy + 30], [cx + R, cy + 2, cx + R + 1, cy + 18, cx + R - 2, cy + 30], [cx - 9, cy + 6, cx - 10, cy + 20, cx - 7, cy + 31], [cx + 9, cy + 6, cx + 10, cy + 20, cx + 7, cy + 31], [cx - R + 2, cy, cx - R, cy + 16, cx - R + 4, cy + 28]])
    sheen(ctx, hair, cx - R + 3, cy + 16, 10, 0.75, 1.05)
  } else if (style === 1) {
    ctx.beginPath(); ctx.ellipse(cx, cy + 2, R + 3.4, R + 1.5, 0, 0, Math.PI * 2); ctx.fill(); outline(ctx, hair.dark, 0.5, 0.75)
  } else if (style === 3) {
    // Curly: a big springy puff behind.
    const puffs: [number, number, number][] = [[-15, 6, 6], [15, 6, 6], [-11, 13, 5.5], [11, 13, 5.5], [0, 12, 7], [-17, -4, 5], [17, -4, 5]]
    for (const [x, y, r] of puffs) { ctx.fillStyle = hairFill(ctx, hair, cx + x - r, cy + y - r, cx + x + r, cy + y + r); ctx.beginPath(); ctx.arc(cx + x, cy + y, r, 0, Math.PI * 2); ctx.fill() }
    ctx.strokeStyle = rgba(hair.dark, 0.5); ctx.lineWidth = 0.6
    for (const [x, y, r] of puffs) { ctx.beginPath(); ctx.arc(cx + x, cy + y, r * 0.5, 0.4, 2.6); ctx.stroke() }
  } else if (style === 5) {
    // A ponytail swinging out behind, tied with a bobble.
    const tie = hexRGB(OUTFIT[(look.outfit + 5) % OUTFIT.length])
    ctx.fillStyle = hairFill(ctx, hair, cx + R - 4, cy - 12, cx + R + 10, cy + 24)
    ctx.beginPath()
    ctx.moveTo(cx + R - 2, cy - 10)
    ctx.bezierCurveTo(cx + R + 11, cy - 8, cx + R + 10, cy + 14, cx + R + 3, cy + 24)
    ctx.quadraticCurveTo(cx + R + 1, cy + 12, cx + R - 5, cy - 3)
    ctx.closePath(); ctx.fill(); outline(ctx, hair.dark, 0.5, 0.75)
    strands(ctx, hair, [[cx + R, cy - 6, cx + R + 8, cy + 4, cx + R + 4, cy + 20], [cx + R + 2, cy - 7, cx + R + 10, cy + 5, cx + R + 6, cy + 17]])
    ctx.fillStyle = rgba(tie); ctx.beginPath(); ctx.arc(cx + R - 1, cy - 8.5, 2.2, 0, Math.PI * 2); ctx.fill(); outline(ctx, tie, 0.5, 0.6)
  } else if (style === 6) {
    // Two plaits hanging down beside the shoulders: a chain of lobes each side, and a tie at the end.
    const tie = hexRGB(OUTFIT[(look.outfit + 5) % OUTFIT.length])
    for (const sd of [-1, 1]) {
      for (let k = 0; k < 7; k++) {
        const x = cx + sd * (R + 0.5 + k * 0.25) + (k % 2 ? sd * 0.9 : -sd * 0.9), y = cy + 3 + k * 4.2
        ctx.fillStyle = hairFill(ctx, hair, x - 3.5, y - 3.5, x + 3.5, y + 3.5)
        ctx.beginPath(); ctx.ellipse(x, y, 3.4 - k * 0.18, 2.8, sd * (k % 2 ? 0.55 : -0.55), 0, Math.PI * 2); ctx.fill()
        outline(ctx, hair.dark, 0.5, 0.6)
        blob(ctx, x - 0.9, y - 0.9, 1.3, 0.8, shade(hair.light, 0.35), 0.7)
      }
      ctx.fillStyle = rgba(tie); ctx.beginPath(); ctx.roundRect(cx + sd * (R + 2.2) - 2, cy + 31, 4, 2.2, 1); ctx.fill()
      ctx.fillStyle = hairFill(ctx, hair, 0, cy + 32, 0, cy + 37); ctx.beginPath(); ctx.moveTo(cx + sd * (R + 2.2) - 1.8, cy + 33); ctx.lineTo(cx + sd * (R + 2.2), cy + 37); ctx.lineTo(cx + sd * (R + 2.2) + 1.8, cy + 33); ctx.fill()
    }
  }
}

function paintAccessory(ctx: Ctx, look: Look, cx: number, cy: number) {
  const accent = hexRGB(OUTFIT[(look.outfit + 5) % OUTFIT.length])
  if (look.accessory === 1) {
    // A bow on the side of the head.
    const bx = cx - 10, by = cy - 13.5
    ctx.fillStyle = rgba(accent)
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(bx, by); ctx.quadraticCurveTo(bx + s * 6.5, by - 6, bx + s * 7, by + 0.8); ctx.quadraticCurveTo(bx + s * 5, by + 4, bx, by); ctx.fill(); outline(ctx, accent, 0.55, 0.7) }
    ctx.fillStyle = rgba(shade(accent, -0.1)); ctx.beginPath(); ctx.arc(bx, by, 2, 0, Math.PI * 2); ctx.fill()
    blob(ctx, bx - 3.4, by - 2, 2, 1.3, [255, 255, 255], 0.7)
  } else if (look.accessory === 2) {
    // Round glasses.
    ctx.strokeStyle = 'rgba(86,56,76,0.9)'; ctx.lineWidth = 0.9
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(cx + 0.8 + s * 5.7, cy + 1.6, 3.9, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = 'rgba(255,255,255,0.16)'; ctx.fill() }
    ctx.beginPath(); ctx.moveTo(cx - 1.1, cy + 1.2); ctx.lineTo(cx + 2.7, cy + 1.2); ctx.stroke()
  } else if (look.accessory === 3) {
    // A flower clip.
    const fx = cx + 10, fy = cy - 11
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; ctx.fillStyle = rgba(shade(accent, 0.2)); ctx.beginPath(); ctx.arc(fx + Math.cos(a) * 2.4, fy + Math.sin(a) * 2.4, 2, 0, Math.PI * 2); ctx.fill() }
    ctx.fillStyle = '#fbe7b0'; ctx.beginPath(); ctx.arc(fx, fy, 1.5, 0, Math.PI * 2); ctx.fill()
  }
}

// ------------------------------------------------------------------ the body

/** The torso's outline: shoulders, a soft waist, hips (and a skirt's flare when there is one). */
function torsoPath(ctx: Ctx, cx: number, sy: number, fig: Figure, flare: number) {
  const sh = fig.masc ? 11.2 : 10.2, waist = fig.masc ? 9.4 : 7.8, hip = fig.masc ? 9.6 : 9.4
  const hy = sy + 27
  ctx.beginPath()
  ctx.moveTo(cx - sh + 2, sy)
  ctx.quadraticCurveTo(cx, sy - 1.6, cx + sh - 2, sy)
  ctx.quadraticCurveTo(cx + sh + 0.6, sy + 1, cx + sh, sy + 6)
  ctx.quadraticCurveTo(cx + waist, sy + 15, cx + hip + flare, hy + flare * 0.9)
  ctx.quadraticCurveTo(cx, hy + 2 + flare * 1.1, cx - hip - flare, hy + flare * 0.9)
  ctx.quadraticCurveTo(cx - waist, sy + 15, cx - sh, sy + 6)
  ctx.quadraticCurveTo(cx - sh - 0.6, sy + 1, cx - sh + 2, sy)
  ctx.closePath()
}

/** Soft cloth light: lit from the top left, a shade on the right. */
function clothFill(ctx: Ctx, col: RGB, cx: number, sy: number) {
  const g = ctx.createLinearGradient(cx - 12, sy, cx + 12, sy + 30)
  g.addColorStop(0, rgba(shade(col, 0.28))); g.addColorStop(0.5, rgba(col)); g.addColorStop(1, rgba(shade(col, -0.16)))
  return g
}

function paintBody(ctx: Ctx, o: Outfit, skin: SkinT, fig: Figure, role: Role) {
  const cx = ANCHOR.body.x, sy = ANCHOR.body.y
  // The neck: slim, in the chin's shade at the top and lit lower down, widening a touch into the shoulders.
  const ng = ctx.createLinearGradient(0, sy - 13, 0, sy + 1)
  ng.addColorStop(0, rgba(mixRGB(skin.base, skin.shadow, 0.8))); ng.addColorStop(0.45, rgba(mixRGB(skin.base, skin.shadow, 0.35))); ng.addColorStop(1, rgba(mixRGB(skin.base, skin.shadow, 0.2)))
  ctx.fillStyle = ng
  ctx.beginPath()
  ctx.moveTo(cx - 3.5, sy - 13); ctx.lineTo(cx + 3.5, sy - 13); ctx.lineTo(cx + 3.7, sy - 2.5); ctx.quadraticCurveTo(cx + 4.2, sy + 0.5, cx + 6.5, sy + 1.5)
  ctx.lineTo(cx - 6.5, sy + 1.5); ctx.quadraticCurveTo(cx - 4.2, sy + 0.5, cx - 3.7, sy - 2.5); ctx.closePath(); ctx.fill()
  ctx.strokeStyle = rgba(skin.shadow, 0.35); ctx.lineWidth = 0.5
  for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(cx + s * 3.5, sy - 12); ctx.lineTo(cx + s * 3.7, sy - 2.5); ctx.stroke() }
  const flare = o.skirt ? (o.kind === 'dress' ? 6.5 : 4.5) : o.kind === 'chef' || o.kind === 'jacket' || o.kind === 'suit' ? 1 : 0
  const main = o.main
  torsoPath(ctx, cx, sy, fig, flare)
  ctx.fillStyle = clothFill(ctx, main, cx, sy)
  ctx.fill()
  outline(ctx, main, 0.5, 0.8)
  ctx.save()
  torsoPath(ctx, cx, sy, fig, flare); ctx.clip()
  // Form: a shade down the right side and under the chest, a light rim on the left.
  blurred(ctx, 2.5, () => { ctx.fillStyle = rgba(shade(main, -0.3), 0.3); ctx.beginPath(); ctx.ellipse(cx + 10, sy + 16, 5, 18, 0, 0, Math.PI * 2); ctx.fill() })
  blurred(ctx, 1.2, () => { ctx.strokeStyle = rgba(shade(main, 0.5), 0.7); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(cx - 10, sy + 5); ctx.quadraticCurveTo(cx - 9, sy + 16, cx - 9.5, sy + 26); ctx.stroke() })
  const hy = sy + 27
  switch (o.kind) {
    case 'dress': {
      // A waist tie and soft folds in the skirt.
      ctx.fillStyle = rgba(shade(o.main, -0.1)); ctx.fillRect(cx - 12, sy + 15, 24, 2.4)
      ctx.strokeStyle = rgba(shade(o.main, -0.22), 0.5); ctx.lineWidth = 0.7
      for (const x of [-5, 0, 5]) { ctx.beginPath(); ctx.moveTo(cx + x, sy + 18); ctx.quadraticCurveTo(cx + x * 1.3, hy, cx + x * 1.6, hy + 7); ctx.stroke() }
      break
    }
    case 'jumper': {
      // Ribbing at the hem and a soft cable down the front.
      ctx.strokeStyle = rgba(shade(o.main, -0.2), 0.55); ctx.lineWidth = 0.55
      for (let x = cx - 11; x < cx + 11; x += 1.8) { ctx.beginPath(); ctx.moveTo(x, hy - 3); ctx.lineTo(x, hy + 2); ctx.stroke() }
      if (role !== 'player') { ctx.strokeStyle = rgba(shade(o.main, -0.14), 0.45); ctx.lineWidth = 0.8; for (let y = sy + 5; y < hy - 4; y += 3) { ctx.beginPath(); ctx.arc(cx, y + 1.5, 1.5, Math.PI * 0.1, Math.PI * 0.9); ctx.stroke() } }
      break
    }
    case 'hoodie': {
      // The hood behind the neck, strings and a front pocket.
      ctx.fillStyle = rgba(shade(o.main, -0.12)); ctx.beginPath(); ctx.moveTo(cx - 7, sy - 1); ctx.quadraticCurveTo(cx, sy + 7, cx + 7, sy - 1); ctx.quadraticCurveTo(cx, sy + 2, cx - 7, sy - 1); ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 0.6
      for (const x of [-2, 2]) { ctx.beginPath(); ctx.moveTo(cx + x, sy + 3); ctx.lineTo(cx + x * 1.2, sy + 10); ctx.stroke() }
      ctx.fillStyle = rgba(shade(o.main, -0.08)); ctx.beginPath(); ctx.roundRect(cx - 6.5, sy + 17, 13, 7, 2.5); ctx.fill(); outline(ctx, o.main, 0.35, 0.6)
      break
    }
    case 'suit': {
      // A white shirt and a tie between the lapels, buttons.
      ctx.fillStyle = '#fbf8f6'; ctx.beginPath(); ctx.moveTo(cx - 4.5, sy - 0.5); ctx.lineTo(cx, sy + 13); ctx.lineTo(cx + 4.5, sy - 0.5); ctx.closePath(); ctx.fill()
      ctx.fillStyle = rgba(o.second); ctx.beginPath(); ctx.moveTo(cx - 1.1, sy + 1); ctx.lineTo(cx + 1.1, sy + 1); ctx.lineTo(cx + 1.6, sy + 10); ctx.lineTo(cx, sy + 12.5); ctx.lineTo(cx - 1.6, sy + 10); ctx.closePath(); ctx.fill()
      ctx.strokeStyle = rgba(shade(o.main, 0.3), 0.8); ctx.lineWidth = 0.8
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(cx + s * 4.8, sy - 0.2); ctx.lineTo(cx + s * 1.2, sy + 13); ctx.stroke() }
      ctx.fillStyle = rgba(shade(o.main, 0.4)); for (const y of [sy + 16, sy + 21]) { ctx.beginPath(); ctx.arc(cx + 1.8, y, 0.8, 0, Math.PI * 2); ctx.fill() }
      break
    }
    case 'sporty': {
      // A tank with a contrast stripe and a number.
      ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect(cx - 12, sy + 9, 24, 1.8)
      ctx.fillStyle = rgba(shade(o.main, -0.25), 0.6); ctx.font = '700 6px Fredoka, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(String(((o.main[0] + o.main[2]) % 9) + 1), cx, sy + 19)
      break
    }
    case 'cardigan': {
      // An open cardigan over a pale blouse, buttons down one side.
      ctx.fillStyle = rgba(o.second); ctx.beginPath(); ctx.moveTo(cx - 4, sy - 0.5); ctx.lineTo(cx + 4, sy - 0.5); ctx.lineTo(cx + 3, hy); ctx.lineTo(cx - 3, hy); ctx.closePath(); ctx.fill()
      ctx.strokeStyle = rgba(shade(o.main, -0.25), 0.6); ctx.lineWidth = 0.7
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(cx + s * 4, sy - 0.5); ctx.lineTo(cx + s * 3, hy); ctx.stroke() }
      ctx.fillStyle = rgba(shade(o.main, 0.45)); for (const y of [sy + 7, sy + 12, sy + 17, sy + 22]) { ctx.beginPath(); ctx.arc(cx - 4.6, y, 0.75, 0, Math.PI * 2); ctx.fill() }
      break
    }
    case 'jacket': {
      // A dark leather jacket open over a coloured tee, a zip glint.
      ctx.fillStyle = rgba(o.second); ctx.beginPath(); ctx.moveTo(cx - 4.5, sy - 0.5); ctx.lineTo(cx + 4.5, sy - 0.5); ctx.lineTo(cx + 3.5, hy); ctx.lineTo(cx - 3.5, hy); ctx.closePath(); ctx.fill()
      ctx.strokeStyle = 'rgba(210,210,230,0.8)'; ctx.lineWidth = 0.6
      ctx.beginPath(); ctx.moveTo(cx + 4.5, sy + 1); ctx.lineTo(cx + 3.6, hy); ctx.stroke()
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cx - 9, sy + 4); ctx.lineTo(cx - 8.5, sy + 18); ctx.stroke()
      break
    }
    case 'scrubs': {
      // A V-neck and a chest pocket with a pen.
      ctx.fillStyle = rgba(mixRGB(skin.base, skin.shadow, 0.25)); ctx.beginPath(); ctx.moveTo(cx - 3.5, sy - 0.5); ctx.lineTo(cx, sy + 5.5); ctx.lineTo(cx + 3.5, sy - 0.5); ctx.closePath(); ctx.fill()
      ctx.strokeStyle = rgba(shade(o.main, -0.25), 0.6); ctx.lineWidth = 0.7
      ctx.beginPath(); ctx.moveTo(cx - 4, sy - 0.5); ctx.lineTo(cx, sy + 6); ctx.lineTo(cx + 4, sy - 0.5); ctx.stroke()
      ctx.strokeRect(cx + 2.5, sy + 8, 6, 5)
      if (role === 'staff') {
        // Staff: a name badge and a little brush and a comb in the pocket.
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.roundRect(cx - 8.5, sy + 8, 6.5, 3.6, 1); ctx.fill()
        ctx.fillStyle = '#e98aa8'; ctx.fillRect(cx - 7.6, sy + 9.3, 4.6, 0.9)
        ctx.fillStyle = '#f7b7cc'; ctx.fillRect(cx + 4, sy + 5, 1.4, 4.5)
        ctx.fillStyle = '#fbe7b0'; ctx.fillRect(cx + 6, sy + 6, 1.2, 3.5)
      } else { ctx.fillStyle = '#5a4a6a'; ctx.fillRect(cx + 4, sy + 6.5, 0.9, 3.5) }
      break
    }
    case 'chef': {
      // A double-breasted white jacket with a neckerchief.
      ctx.fillStyle = rgba(o.second); ctx.beginPath(); ctx.moveTo(cx - 4.5, sy - 0.5); ctx.quadraticCurveTo(cx, sy + 4, cx + 4.5, sy - 0.5); ctx.lineTo(cx + 2, sy + 3); ctx.lineTo(cx - 2, sy + 3); ctx.closePath(); ctx.fill()
      ctx.fillStyle = 'rgba(160,150,160,0.8)'; for (const y of [sy + 8, sy + 13, sy + 18]) for (const x of [-3, 3]) { ctx.beginPath(); ctx.arc(cx + x, y, 0.8, 0, Math.PI * 2); ctx.fill() }
      break
    }
    case 'dungarees': {
      // A tee under dungarees: the bib, the straps and two brass buttons.
      ctx.fillStyle = rgba(o.second); ctx.beginPath(); ctx.roundRect(cx - 7, sy + 10, 14, hy - sy - 8, 2); ctx.fill()
      ctx.fillRect(cx - 7, sy + 1, 2.2, 10); ctx.fillRect(cx + 4.8, sy + 1, 2.2, 10)
      ctx.fillStyle = rgba(shade(o.second, 0.3)); ctx.fillRect(cx - 7, sy + 10, 14, 1)
      ctx.fillStyle = '#f3d27a'; for (const x of [-5.9, 5.9]) { ctx.beginPath(); ctx.arc(cx + x, sy + 10.5, 1, 0, Math.PI * 2); ctx.fill() }
      ctx.strokeStyle = rgba(shade(o.second, -0.3), 0.6); ctx.lineWidth = 0.6; ctx.strokeRect(cx - 3, sy + 14, 6, 4.5)
      break
    }
  }
  ctx.restore()
  // A little collar where there is one.
  if (o.kind === 'dress' || o.kind === 'jumper' || o.kind === 'cardigan') {
    ctx.fillStyle = rgba(shade(o.kind === 'cardigan' ? o.second : o.main, 0.45))
    ctx.beginPath(); ctx.moveTo(cx - 5, sy - 0.8); ctx.lineTo(cx, sy + 3.2); ctx.lineTo(cx + 5, sy - 0.8); ctx.quadraticCurveTo(cx, sy + 0.8, cx - 5, sy - 0.8); ctx.fill()
  }
  if (role === 'player') {
    // An apron in the player's colour: a bib with straps, a pocket, a heart, and the tie at the waist.
    const col = o.second
    ctx.beginPath()
    ctx.moveTo(cx - 6, sy + 3); ctx.lineTo(cx + 6, sy + 3); ctx.lineTo(cx + 7, sy + 14); ctx.quadraticCurveTo(cx + 10, hy - 1, cx + 9.5, hy + 4); ctx.quadraticCurveTo(cx, hy + 6, cx - 9.5, hy + 4); ctx.quadraticCurveTo(cx - 10, hy - 1, cx - 7, sy + 14); ctx.closePath()
    const ag = ctx.createLinearGradient(cx - 10, sy, cx + 10, hy)
    ag.addColorStop(0, rgba(shade(col, 0.3))); ag.addColorStop(0.55, rgba(col)); ag.addColorStop(1, rgba(shade(col, -0.12)))
    ctx.fillStyle = ag; ctx.fill(); outline(ctx, col, 0.55, 0.8)
    ctx.strokeStyle = rgba(shade(col, 0.2)); ctx.lineWidth = 1.2
    ctx.beginPath(); ctx.moveTo(cx - 6, sy + 3); ctx.lineTo(cx - 4.5, sy - 2); ctx.moveTo(cx + 6, sy + 3); ctx.lineTo(cx + 4.5, sy - 2); ctx.stroke()
    ctx.strokeStyle = rgba(shade(col, -0.15)); ctx.lineWidth = 1.3
    ctx.beginPath(); ctx.moveTo(cx - 10, sy + 16); ctx.lineTo(cx + 10, sy + 16); ctx.stroke()
    ctx.fillStyle = rgba(shade(col, -0.1)); ctx.beginPath(); ctx.roundRect(cx - 4.5, sy + 19, 9, 5.5, 1.5); ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 0.5; ctx.setLineDash([1, 1]); ctx.beginPath(); ctx.roundRect(cx - 4, sy + 19.5, 8, 4.5, 1.2); ctx.stroke(); ctx.setLineDash([])
    heart(ctx, cx, sy + 8.5, 2.3, '#ffffff')
  }
}

export function heart(ctx: Ctx, x: number, y: number, s: number, color: string) {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(x, y + s * 0.9)
  ctx.bezierCurveTo(x - s * 1.6, y - s * 0.2, x - s * 0.8, y - s * 1.4, x, y - s * 0.5)
  ctx.bezierCurveTo(x + s * 0.8, y - s * 1.4, x + s * 1.6, y - s * 0.2, x, y + s * 0.9)
  ctx.fill()
}

function paintArm(ctx: Ctx, sleeve: RGB, skin: SkinT, short: boolean) {
  const cx = ANCHOR.arm.x
  // The arm (bare below a short sleeve), and a round little hand.
  const ag = ctx.createLinearGradient(cx - 3, 0, cx + 3, 0)
  ag.addColorStop(0, rgba(shade(skin.base, 0.12))); ag.addColorStop(1, rgba(mixRGB(skin.base, skin.shadow, 0.45)))
  ctx.fillStyle = ag
  ctx.beginPath(); ctx.roundRect(cx - 2.7, 1, 5.4, 22, 2.7); ctx.fill()
  ctx.strokeStyle = rgba(skin.shadow, 0.5); ctx.lineWidth = 0.6; ctx.stroke()
  const len = short ? 7 : 16
  const sg = ctx.createLinearGradient(cx - 3.4, 0, cx + 3.4, 0)
  sg.addColorStop(0, rgba(shade(sleeve, 0.22))); sg.addColorStop(1, rgba(shade(sleeve, -0.16)))
  ctx.fillStyle = sg
  ctx.beginPath(); ctx.roundRect(cx - 3.4, 0, 6.8, len, [3.2, 3.2, 1.6, 1.6]); ctx.fill()
  outline(ctx, sleeve, 0.45, 0.6)
  if (!short) { ctx.fillStyle = rgba(shade(sleeve, -0.1)); ctx.fillRect(cx - 3.4, len - 1.6, 6.8, 1.6) }
  ctx.fillStyle = rgba(skin.base); ctx.beginPath(); ctx.arc(cx, 24, 3.1, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = rgba(skin.shadow, 0.55); ctx.lineWidth = 0.6; ctx.stroke()
  blob(ctx, cx - 1, 23, 1.2, 0.8, skin.light, 0.7)
}

function paintLeg(ctx: Ctx, o: Outfit, skin: SkinT, fig: Figure) {
  const cx = ANCHOR.leg.x
  const len = 26
  // A skirt or a dress: bare legs (a soft tight on the older ladies); otherwise trousers or shorts.
  const bare = o.skirt
  const shorts = o.kind === 'sporty'
  const legCol = bare ? (fig.age >= SENIOR_AGE ? mixRGB(skin.base, [120, 100, 110], 0.35) : skin.base) : o.pants
  const g = ctx.createLinearGradient(cx - 3.5, 0, cx + 3.5, 0)
  g.addColorStop(0, rgba(shade(legCol, 0.14))); g.addColorStop(1, rgba(shade(legCol, -0.16)))
  ctx.fillStyle = g
  ctx.beginPath(); ctx.roundRect(cx - 3.3, 1, 6.6, len, 3); ctx.fill()
  ctx.strokeStyle = rgba(shade(legCol, -0.4), 0.45); ctx.lineWidth = 0.6; ctx.stroke()
  if (shorts) {
    ctx.fillStyle = rgba(skin.base); ctx.beginPath(); ctx.roundRect(cx - 2.8, 10, 5.6, len - 9, 2.6); ctx.fill()
    ctx.fillStyle = rgba(shade(o.pants, -0.1)); ctx.fillRect(cx - 3.3, 9, 6.6, 1.4)
  } else if (!bare) {
    // A crease down the trouser leg and a turn-up.
    ctx.strokeStyle = rgba(shade(legCol, 0.25), 0.5); ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(cx - 0.5, 3); ctx.lineTo(cx - 0.8, len - 2); ctx.stroke()
    ctx.fillStyle = rgba(shade(legCol, -0.12)); ctx.fillRect(cx - 3.3, len - 1.5, 6.6, 1.6)
  }
  // Shoes: a rounded toe, a sole and a shine.
  const sy = len + 1
  ctx.fillStyle = rgba(o.shoes); ctx.beginPath(); ctx.roundRect(cx - 3.8, sy - 2.5, 8.4, 5.4, 2.7); ctx.fill()
  ctx.strokeStyle = rgba(shade(o.shoes, -0.4), 0.55); ctx.lineWidth = 0.6; ctx.stroke()
  ctx.fillStyle = rgba(shade(o.shoes, -0.25)); ctx.fillRect(cx - 3.6, sy + 2, 8, 0.9)
  ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillRect(cx - 2, sy - 1.6, 2.4, 0.9)
}

/**
 * A seated leg, seen from the front and a little above: the thigh comes toward us as a short lap, lit on top, with
 * a round knee; then the shin drops to the floor in the knee's shade (or, reclined, runs on along the leg rest and
 * widens as it nears us), and the shoe. A skirt drapes over the lap; shorts cover it and leave the shin bare.
 */
function paintSeatLeg(ctx: Ctx, o: Outfit, skin: SkinT, fig: Figure, k: SeatKind) {
  const cx = ANCHOR.leg.x
  const s = SEATS[k]
  const top = 1, knee = top + s.knee - s.hip, foot = top + s.foot - s.hip
  const bareSkin = fig.age >= SENIOR_AGE && o.skirt ? mixRGB(skin.base, [120, 100, 110], 0.35) : skin.base
  const lapCol = o.skirt ? o.main : o.pants
  const shinCol = o.skirt || o.kind === 'sporty' ? bareSkin : o.pants
  // The shin, under the knee.
  const w0 = 6.2, w1 = s.recline ? 7.2 : 6.2
  const sg = ctx.createLinearGradient(cx - 3.6, 0, cx + 3.6, 0)
  sg.addColorStop(0, rgba(shade(shinCol, 0.06))); sg.addColorStop(1, rgba(shade(shinCol, -0.22)))
  ctx.fillStyle = sg
  ctx.beginPath()
  ctx.moveTo(cx - w0 / 2, knee - 1); ctx.lineTo(cx + w0 / 2, knee - 1); ctx.lineTo(cx + w1 / 2, foot); ctx.lineTo(cx - w1 / 2, foot); ctx.closePath(); ctx.fill()
  ctx.strokeStyle = rgba(shade(shinCol, -0.4), 0.45); ctx.lineWidth = 0.6; ctx.stroke()
  // The knee's shade falling on the top of the shin.
  blurred(ctx, 0.8, () => { ctx.fillStyle = rgba(shade(shinCol, -0.45), 0.35); ctx.beginPath(); ctx.ellipse(cx, knee + 1, 3, 1.2, 0, 0, Math.PI * 2); ctx.fill() })
  if (!o.skirt && o.kind !== 'sporty') { ctx.fillStyle = rgba(shade(shinCol, -0.12)); ctx.fillRect(cx - w1 / 2, foot - 1.4, w1, 1.4) }
  // The lap: the thigh foreshortened toward us, lit on top, ending in a round knee.
  const lw = 7.6
  const lg = ctx.createLinearGradient(0, top, 0, knee + 1.5)
  lg.addColorStop(0, rgba(shade(lapCol, 0.24))); lg.addColorStop(0.6, rgba(shade(lapCol, 0.04))); lg.addColorStop(1, rgba(shade(lapCol, -0.14)))
  ctx.fillStyle = lg
  ctx.beginPath(); ctx.roundRect(cx - lw / 2, top, lw, knee + 1.5 - top, [2, 2, 3.8, 3.8]); ctx.fill()
  ctx.strokeStyle = rgba(shade(lapCol, -0.42), 0.5); ctx.lineWidth = 0.6; ctx.stroke()
  blob(ctx, cx - 0.9, knee - 0.6, 2.1, 1.2, shade(lapCol, 0.5), 0.55)
  if (o.skirt) { ctx.fillStyle = rgba(shade(lapCol, -0.12)); ctx.beginPath(); ctx.roundRect(cx - lw / 2, knee, lw, 1.5, [0, 0, 3, 3]); ctx.fill() }
  // The shoe: a toe cap from above on the floor; toes-up with the sole showing at the end of the leg rest.
  if (s.recline) {
    ctx.fillStyle = rgba(o.shoes); ctx.beginPath(); ctx.ellipse(cx, foot + 1.6, 4.2, 3.2, 0, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = rgba(shade(o.shoes, -0.4), 0.55); ctx.lineWidth = 0.6; ctx.stroke()
    ctx.strokeStyle = rgba(shade(o.shoes, -0.3)); ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(cx, foot + 1.9, 3.6, 2.6, 0, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke()
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); ctx.ellipse(cx - 1.4, foot + 0.4, 1.3, 0.7, -0.3, 0, Math.PI * 2); ctx.fill()
  } else {
    const fy = foot + 1
    ctx.fillStyle = rgba(o.shoes); ctx.beginPath(); ctx.roundRect(cx - 3.8, fy - 2.5, 8, 5, 2.5); ctx.fill()
    ctx.strokeStyle = rgba(shade(o.shoes, -0.4), 0.55); ctx.lineWidth = 0.6; ctx.stroke()
    ctx.fillStyle = rgba(shade(o.shoes, -0.25)); ctx.fillRect(cx - 3.6, fy + 1.6, 7.6, 0.9)
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillRect(cx - 2, fy - 1.6, 2.4, 0.9)
  }
}

/** A round portrait for review cards and staff cards (a DOM image): head and shoulders. */
export function portrait(look0: Look, size = 96, bg = '#fbe0e8', role: Role = 'customer', tint = 0xe7799c, archetype?: string, seed?: number): string {
  const look = { ...look0, accessory: accessoryFor(look0, archetype) }
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')!
  const fig = lookFigure(look)
  ctx.fillStyle = bg
  ctx.beginPath(); ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2); ctx.fill()
  ctx.save()
  ctx.beginPath(); ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2); ctx.clip()
  const skin = SKIN[look.skin % SKIN.length], hair = hairPalette(HAIR[look.hair % HAIR.length], fig)
  const outfit = outfitOf(look, fig, role, tint, archetype)
  // The face fills most of the circle; the shoulders show below it.
  const s = size / 46
  ctx.scale(s, s)
  const cx = 23, cy = 22
  paintHairBack(ctx, look, hair, cx, cy)
  ctx.save(); ctx.translate(cx - ANCHOR.body.x, cy + (P.shoulderY - P.headY) - ANCHOR.body.y); paintBody(ctx, outfit, skin, fig, role); ctx.restore()
  paintHead(ctx, look, skin, hair, 'happy', fig, cx, cy, faceVarOf(look, seed))
  ctx.restore()
  return c.toDataURL()
}

/** What a worker holds while they work: a facial brush, a nail file or a foot brush. */
export type HandTool = 'brush' | 'file' | 'footBrush'

/** A small tool held in the hand, its grip at (6, 4) of a 12 x 22 texture, pointing down along the arm. */
export function handToolTexture(kind: HandTool): Texture {
  return tex(`tool|${kind}`, 12, 22, ctx => {
    ctx.lineCap = 'round'
    if (kind === 'file') {
      ctx.strokeStyle = '#f4b6c8'; ctx.lineWidth = 3.2; ctx.beginPath(); ctx.moveTo(6, 3); ctx.lineTo(6, 20); ctx.stroke()
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(5.2, 6); ctx.lineTo(5.2, 18); ctx.stroke()
    } else if (kind === 'footBrush') {
      ctx.fillStyle = '#f07aa0'; ctx.beginPath(); ctx.roundRect(2, 8, 8, 12, 3); ctx.fill()
      ctx.strokeStyle = '#f6e7c8'; ctx.lineWidth = 0.9; for (let x = 3; x <= 9; x += 1.5) { ctx.beginPath(); ctx.moveTo(x, 20); ctx.lineTo(x, 22); ctx.stroke() }
      ctx.fillStyle = '#e8c06a'; ctx.fillRect(5, 3, 2, 6)
    } else {
      ctx.strokeStyle = '#b79ce6'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(6, 3); ctx.lineTo(6, 14); ctx.stroke()
      ctx.fillStyle = '#e8c06a'; ctx.fillRect(4.8, 13, 2.4, 2.5)
      ctx.fillStyle = '#fff4f7'; ctx.beginPath(); ctx.ellipse(6, 18.5, 2.6, 3.8, 0, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = 'rgba(200,170,190,0.8)'; ctx.lineWidth = 0.6; ctx.stroke()
    }
  })
}

/** A soft shadow texture under a character. */
export function shadowTexture(): Texture {
  return tex('shadow', 50, 16, ctx => {
    blurred(ctx, 3, () => { ctx.fillStyle = 'rgba(110,55,80,0.28)'; ctx.beginPath(); ctx.ellipse(25, 8, 17, 5, 0, 0, Math.PI * 2); ctx.fill() })
    blurred(ctx, 1.2, () => { ctx.fillStyle = 'rgba(100,45,70,0.3)'; ctx.beginPath(); ctx.ellipse(25, 8, 10, 2.8, 0, 0, Math.PI * 2); ctx.fill() })
  })
}
