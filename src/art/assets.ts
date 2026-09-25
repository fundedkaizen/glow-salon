import type { Texture } from 'pixi.js'
import { canvasTexture } from './tex.ts'
import type { Look } from '../core/customers.ts'
import type { TreatmentId } from '../core/treatments/types.ts'
import type { Profile } from '../core/treatments/profile.ts'
import type { LayerStyle, SurfaceArt } from '../render/surface.ts'
import { paintFace, type Crop } from './face.ts'
import { paintHand } from './hand.ts'
import { paintBackdrop } from './backdrop.ts'
import { ROBE, paintRobe, paintSteamTowel } from './props.ts'
import { OUTFIT } from './palette.ts'
import { hex } from './paint.ts'
import { paintPimples } from './pimples.ts'

/**
 * The asset layer: everything a close-up needs, by body part. Today every sheet is painted in code
 * (face.ts, hand.ts); a painted image can replace any of them later without touching the game logic, as
 * long as it lines up with core/treatments/anatomy.ts on a 1024 x 1024 sheet:
 *
 *   base    the body part itself (albedo)        height  greyscale bumps (pores, form); the shader lights it
 *   layers  one sheet per treatment layer (grime, foam, clay, polish...), shown where the tools put it
 *   overlays  expression crops (eyes, brows, mouth) at fixed positions
 */
export type CropTex = { texture: Texture; x: number; y: number }

export type PartAssets = {
  surface: SurfaceArt
  backdrop: Texture
  /** Face only: expression overlays by feature and state. */
  features?: { eyes: Record<string, CropTex>; brows: Record<string, CropTex>; mouth: Record<string, CropTex> }
  /** Hand only: the overgrown free edge of each nail, clipped off one by one. */
  tips?: CropTex[]
  /** Facial only: the robe over the shoulders, in art space (it reaches past the sheet). */
  robe?: CropTex
  /** Facial only: the warm towel draped over the face during the steam step (art space). */
  towel?: { get: () => Texture; made: Texture | null }
  /** Facial only: pimple parts painted for this skin. */
  pimples?: Record<'halo' | 'dome' | 'deepDome' | 'head' | 'blanch' | 'mark' | 'dab', Texture>
  skinRGB: [number, number, number]
}

const FACE_STYLES: Record<string, LayerStyle> = {
  redness: { gloss: 0, relief: 0 },
  marks: { gloss: 0.15, relief: 0.4 },
  oil: { gloss: 0.95, relief: 0.3 },
  // Dirt is matte: a little relief for volume, almost no gloss (a glossy relief reads as glassy droplets).
  grime: { gloss: 0.02, relief: 0.7 },
  grime2: { gloss: 0.03, relief: 0.9 },
  flakes: { gloss: 0.05, relief: 1.4 },
  serum: { gloss: 1, relief: 0.8 },
  // Flat, so a strong gloss would add one even white sheen that greys deeper skin.
  glow: { gloss: 0.12, relief: 0 },
  cream: { gloss: 0.55, relief: 2.2, brush: 'paint' },
  mask: { gloss: 0.8, relief: 3.8, brush: 'paint' },
  foam: { gloss: 0.3, relief: 2.6 },
}

const HAND_STYLES: Record<string, LayerStyle> = {
  wet: { gloss: 1, relief: 0.4, opacity: 0.9 },
  dull: { gloss: 0, relief: 0.2 },
  dirt: { gloss: 0.1, relief: 1.2 },
  dry: { gloss: 0, relief: 1.2 },
  oldPolish: { gloss: 0.15, relief: 0.3 },
  rough: { gloss: 0, relief: 1.6 },
  cuticle: { gloss: 0.1, relief: 1.2 },
  scrub: { gloss: 0.25, relief: 2.4, brush: 'paint' },
  base: { gloss: 0.9, relief: 0.8, brush: 'paint' },
  color: { gloss: 0.85, relief: 1.4, brush: 'paint' },
  top: { gloss: 1, relief: 0.8, brush: 'paint' },
}

const tex = (c: HTMLCanvasElement) => canvasTexture(c)
/** The backdrop is soft and blurry, so it is stored at 1024 (the view scales it back up): 60% less memory. */
function backdropTex(c: HTMLCanvasElement) {
  const small = document.createElement('canvas')
  small.width = small.height = 1024
  const ctx = small.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(c, 0, 0, 1024, 1024)
  return canvasTexture(small)
}
/** The facial room is the same for everyone: painted once, kept for the session. */
let sharedFacialBackdrop: Texture | null = null
function facialBackdrop() { return (sharedFacialBackdrop ??= backdropTex(paintBackdrop('facial', { skin: 0, hair: 0, hairStyle: 0, outfit: 0, accessory: 0, freckles: false }))) }
/** Paint the shared facial backdrop ahead of time (the title screen warms it). */
export function warmFacialBackdrop() { return facialBackdrop() }
/** A texture painted on first use. */
function lazyTex(paint: () => HTMLCanvasElement) {
  const t = { made: null as Texture | null, get: () => (t.made ??= tex(paint())) }
  return t
}
const cropTex = (c: Crop): CropTex => ({ texture: tex(c.canvas), x: c.x, y: c.y })
const toTex = <K extends string>(r: Record<K, Crop>) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, cropTex(v as Crop)])) as Record<K, CropTex>

/**
 * `eager`: the layers that start with something on them (painted now); the others are painted when first
 * needed (the surface does it in the frames after opening), so a close-up opens fast.
 */
export function assetsFor(treatment: TreatmentId, look: Look, seed: number, order: string[], profile: Profile, eager?: Set<string>): PartAssets {
  if (treatment === 'facial' && profile.kind === 'face') {
    const art = paintFace(look, seed, profile)
    const layers: SurfaceArt['layers'] = {}
    for (const id of order) {
      const paint = art.layers[id]
      if (!paint) continue
      const make = () => ({ art: tex(paint()), art2: id === 'mask' ? tex(art.maskDry()) : undefined })
      const style = FACE_STYLES[id] ?? { gloss: 0.2, relief: 0.5 }
      layers[id] = !eager || eager.has(id) ? { ...make(), style } : { lazy: make, style }
    }
    return {
      surface: { base: tex(art.base), height: tex(art.height), bump: 2.4, sss: [0.95, 0.32, 0.26], layers, order },
      backdrop: facialBackdrop(),
      features: { eyes: toTex(art.eyes), brows: toTex(art.brows), mouth: toTex(art.mouth) },
      towel: lazyTex(() => paintSteamTowel(seed)),
      robe: { texture: tex(paintRobe(hex(OUTFIT[look.outfit % OUTFIT.length]), art.skin, seed)), x: ROBE.x, y: ROBE.y },
      pimples: Object.fromEntries(Object.entries(paintPimples(art.skin)).map(([k, c]) => [k, tex(c)])) as PartAssets['pimples'],
      skinRGB: art.skin.base,
    }
  }
  if (profile.kind !== 'hand') throw new Error('hand profile expected')
  const art = paintHand(look, seed, profile)
  const layers: SurfaceArt['layers'] = {}
  for (const id of order) {
    const canvas = art.layers[id]
    if (!canvas) continue
    layers[id] = { art: tex(canvas), style: HAND_STYLES[id] ?? { gloss: 0.2, relief: 0.5 } }
  }
  return {
    surface: { base: tex(art.base), height: tex(art.height), bump: 4, sss: [0.95, 0.35, 0.28], layers, order },
    backdrop: backdropTex(paintBackdrop('nails', look)),
    tips: art.tips.map(cropTex),
    skinRGB: art.skin.base,
  }
}

/** Free every texture made for one customer (called when the close-up closes; shared bits and tools stay). */
export function destroyAssets(a: PartAssets) {
  // The facial backdrop is shared by every customer and stays.
  const all: Texture[] = [a.surface.base, a.surface.height]
  if (a.backdrop !== sharedFacialBackdrop) all.push(a.backdrop)
  for (const l of Object.values(a.surface.layers)) { if (l.art) all.push(l.art); if (l.art2) all.push(l.art2) }
  if (a.features) for (const part of Object.values(a.features)) for (const c of Object.values(part)) all.push(c.texture)
  for (const c of a.tips ?? []) all.push(c.texture)
  if (a.towel?.made) all.push(a.towel.made)
  if (a.robe) all.push(a.robe.texture)
  if (a.pimples) all.push(...Object.values(a.pimples))
  for (const t of new Set(all)) t.destroy(true)
}
