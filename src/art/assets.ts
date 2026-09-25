import type { Texture } from 'pixi.js'
import { canvasTexture } from './tex.ts'
import type { Look } from '../core/customers.ts'
import type { TreatmentId } from '../core/treatments/types.ts'
import type { Profile } from '../core/treatments/profile.ts'
import type { LayerStyle, SurfaceArt } from '../render/surface.ts'
import { paintFace, type Crop } from './face.ts'
import { paintHand } from './hand.ts'
import { paintBackdrop } from './backdrop.ts'
import { paintSteamTowel } from './props.ts'
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
  /** Facial only: the warm towel draped over the face during the steam step (art space). */
  towel?: Texture
  /** Facial only: pimple parts painted for this skin. */
  pimples?: Record<'halo' | 'dome' | 'deepDome' | 'head' | 'blanch' | 'mark' | 'dab', Texture>
  skinRGB: [number, number, number]
}

const FACE_STYLES: Record<string, LayerStyle> = {
  redness: { gloss: 0, relief: 0 },
  marks: { gloss: 0.15, relief: 0.4 },
  oil: { gloss: 0.95, relief: 0.3 },
  grime: { gloss: 0.12, relief: 1.2 },
  grime2: { gloss: 0.15, relief: 1.6 },
  flakes: { gloss: 0.05, relief: 1.4 },
  serum: { gloss: 1, relief: 0.8 },
  glow: { gloss: 0.8, relief: 0 },
  cream: { gloss: 0.4, relief: 3.2, brush: 'paint' },
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
const cropTex = (c: Crop): CropTex => ({ texture: tex(c.canvas), x: c.x, y: c.y })
const toTex = <K extends string>(r: Record<K, Crop>) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, cropTex(v as Crop)])) as Record<K, CropTex>

export function assetsFor(treatment: TreatmentId, look: Look, seed: number, order: string[], profile: Profile): PartAssets {
  if (treatment === 'facial' && profile.kind === 'face') {
    const art = paintFace(look, seed, profile)
    const layers: SurfaceArt['layers'] = {}
    for (const id of order) {
      const canvas = art.layers[id]
      if (!canvas) continue
      layers[id] = { art: tex(canvas), art2: id === 'mask' ? tex(art.maskDry) : undefined, style: FACE_STYLES[id] ?? { gloss: 0.2, relief: 0.5 } }
    }
    return {
      surface: { base: tex(art.base), height: tex(art.height), bump: 2.4, sss: [0.95, 0.32, 0.26], layers, order },
      backdrop: tex(paintBackdrop('facial', look)),
      features: { eyes: toTex(art.eyes), brows: toTex(art.brows), mouth: toTex(art.mouth) },
      towel: tex(paintSteamTowel(seed)),
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
    backdrop: tex(paintBackdrop('nails', look)),
    tips: art.tips.map(cropTex),
    skinRGB: art.skin.base,
  }
}
