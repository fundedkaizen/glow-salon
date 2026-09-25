import type { StepDef, TreatmentDef } from './types.ts'

/**
 * The pedicure as data: the feet family of content/treatments.json (Classic Pedicure, Foot Clinic, Spa
 * Pedicure). One customer's foot is seen from two sides: the top (toes, nails, knuckles, the instep; `view`
 * 'top', the default) and the sole (heel, ball, arch; `view` 'sole'). Every layer id and region id carries its
 * side ('top.dirt', 'sole.calluses'); the regions are the customer's own foot (core/foot.ts), rasterised by the
 * session for their seed. plan.ts builds each customer's own list from this library (docs/FEET-WIRING.md).
 */
const foot = { x: 512, y: 560, zoom: 0.98 }
const toes = { x: 505, y: 770, zoom: 1.32 }
const bigToe = { x: 712, y: 812, zoom: 1.75 }
const knuckles = { x: 480, y: 730, zoom: 1.35 }
const sole = { x: 540, y: 560, zoom: 0.94 }
const heel = { x: 548, y: 640, zoom: 1.05 }

/** Every pedicure step, by id. */
const LIBRARY = {
  bath: { id: 'bath', label: 'Foot bath', hint: 'Press and hold to let the foot soak in the warm bubbly water', tool: 'bath', gesture: 'hold', sound: 'bath', layer: 'top.water', region: 'everywhere', holdSeconds: 3.4, also: [{ layer: 'top.dirt', amount: -0.45 }, { layer: 'sole.dirt', amount: -0.45 }, { layer: 'sole.dry', amount: -0.25 }], wet: 1, camera: foot, reaction: 'content' },
  scrub: { id: 'scrub', label: 'Foot scrub', hint: 'Scrub the top of the foot in circles until it is all lather', tool: 'footBrush', gesture: 'rub', sound: 'scrub', layer: 'top.scrub', region: 'top.foot', radius: 84, rate: 0.17, also: [{ layer: 'top.dirt', amount: -0.08 }], camera: foot, reaction: 'tickle', complete: 0.9, clears: ['top.scrub', 'top.dirt'] },
  scrubSole: { id: 'scrubSole', label: 'Sole scrub', hint: 'Scrub the sole from the toes to the heel', tool: 'footBrush', gesture: 'rub', sound: 'scrub', layer: 'sole.scrub', region: 'sole.sole', radius: 84, rate: 0.17, also: [{ layer: 'sole.dirt', amount: -0.08 }, { layer: 'sole.dry', amount: -0.04 }], camera: sole, reaction: 'tickle', complete: 0.9, clears: ['sole.scrub', 'sole.dirt'], view: 'sole' },
  salt: { id: 'salt', label: 'Salt scrub', hint: 'Rub the pink salt scrub all over the top of the foot', tool: 'scrub', gesture: 'rub', sound: 'scrub', layer: 'top.salt', region: 'top.foot', radius: 84, rate: 0.17, also: [{ layer: 'top.dirt', amount: -0.08 }], camera: foot, reaction: 'tickle', complete: 0.9, clears: ['top.salt', 'top.dirt'] },
  saltSole: { id: 'saltSole', label: 'Salt scrub', hint: 'Rub the salt scrub over the sole, the heel most of all', tool: 'scrub', gesture: 'rub', sound: 'scrub', layer: 'sole.salt', region: 'sole.sole', radius: 84, rate: 0.17, also: [{ layer: 'sole.dirt', amount: -0.08 }, { layer: 'sole.dry', amount: -0.05 }], camera: sole, reaction: 'tickle', complete: 0.9, clears: ['sole.salt', 'sole.dirt'], view: 'sole' },
  rasp: { id: 'rasp', label: 'Callus rasp', hint: 'Rasp the hard yellow skin off the heel and the ball', tool: 'callusRasp', gesture: 'erase', sound: 'rasp', layer: 'sole.callus', region: 'sole.calluses', radius: 58, rate: 0.13, also: [{ layer: 'sole.dry', amount: -0.08 }], camera: heel, reaction: 'neutral', complete: 0.93, need: 'layer', clears: ['top.callus'], view: 'sole' },
  // Disaster heels: the fine side of the rasp for the cracks.
  smooth: { id: 'smooth', label: 'Smooth the heel', hint: 'Cracked heels: smooth them with the fine side of the rasp', tool: 'callusRasp', gesture: 'erase', sound: 'rasp', layer: 'sole.cracks', region: 'sole.heelRim', radius: 52, rate: 0.14, camera: { x: 548, y: 820, zoom: 1.35 }, reaction: 'neutral', complete: 0.9, need: 'layer', view: 'sole' },
  splinter: { id: 'splinter', label: 'Splinters', hint: 'Hold the tweezers on each splinter until it slides out', tool: 'tweezers', gesture: 'targets', sound: 'pop', targets: 'splinter', region: 'sole.sole', camera: sole, reaction: 'flinch', need: 'targets', view: 'sole' },
  plasterSole: { id: 'plasterSole', label: 'Plasters', hint: 'Tap each little wound to put a plaster on it', tool: 'patch', gesture: 'targets', sound: 'patch', targets: 'patch', targetTag: 'sole', region: 'sole.sole', camera: sole, reaction: 'content', need: 'targets', view: 'sole' },
  creamSole: { id: 'creamSole', label: 'Heel balm', hint: 'Rub the rich balm into the heel and the sole', tool: 'cream', gesture: 'rub', sound: 'cream', layer: 'sole.cream', region: 'sole.sole', radius: 86, rate: 0.16, also: [{ layer: 'sole.dry', amount: -0.08 }, { layer: 'sole.cracks', amount: -0.05 }], camera: sole, reaction: 'content', wet: 0.35, complete: 0.9, clears: ['sole.cream', 'sole.dry', 'sole.cracks'], view: 'sole' },
  remove: { id: 'remove', label: 'Polish remover', hint: 'Rub the old chipped polish off every toenail', tool: 'cottonPad', gesture: 'erase', sound: 'wipe', layer: 'top.oldPolish', region: 'top.nails', radius: 40, rate: 0.22, camera: toes, reaction: 'neutral', need: 'layer' },
  clip: { id: 'clip', label: 'Clip', hint: 'Tap each long toenail to clip it', tool: 'clipper', gesture: 'targets', sound: 'snip', targets: 'tip', region: 'top.nails', camera: toes, reaction: 'neutral', need: 'targets' },
  file: { id: 'file', label: 'File', hint: 'File the tips of the toenails smooth', tool: 'file', gesture: 'erase', sound: 'rasp', layer: 'top.rough', region: 'top.tips', radius: 32, rate: 0.2, camera: toes, reaction: 'neutral', complete: 0.9 },
  fungusFile: { id: 'fungusFile', label: 'Thin the nails', hint: 'File the thick yellow nails down until they are smooth', tool: 'file', gesture: 'erase', sound: 'rasp', layer: 'top.fungus', region: 'top.fungal', radius: 36, rate: 0.13, camera: toes, reaction: 'neutral', complete: 0.92, need: 'layer' },
  cuticles: { id: 'cuticles', label: 'Cuticle pusher', hint: 'Push the cuticles back at the base of each toenail', tool: 'pusher', gesture: 'erase', sound: 'push', layer: 'top.cuticle', region: 'top.cuticles', radius: 34, rate: 0.26, camera: toes, reaction: 'neutral', complete: 0.85 },
  corn: { id: 'corn', label: 'Corns', hint: 'Hold the tweezers on each corn to lift its hard core out', tool: 'tweezers', gesture: 'targets', sound: 'pop', targets: 'corn', region: 'top.knuckles', camera: knuckles, reaction: 'flinch', need: 'targets' },
  ingrown: { id: 'ingrown', label: 'Ingrown nail', hint: 'Hold the pusher on the red edge to ease the nail out of the skin', tool: 'pusher', gesture: 'targets', sound: 'push', targets: 'ingrown', region: 'top.nailFolds', camera: bigToe, reaction: 'flinch', need: 'targets' },
  fungusCream: { id: 'fungusCream', label: 'Antifungal cream', hint: 'Rub the antifungal cream over the toes and between them', tool: 'creamTube', gesture: 'rub', sound: 'cream', layer: 'top.antifungal', region: 'top.toes', radius: 46, rate: 0.2, camera: toes, reaction: 'content', complete: 0.9, clears: ['top.antifungal', 'top.redness'] },
  antiseptic: { id: 'antiseptic', label: 'Antiseptic', hint: 'Dab the antiseptic on the sore spots. It stings a little', tool: 'cottonPad', gesture: 'paint', sound: 'wipe', layer: 'top.antiseptic', region: 'top.treated', radius: 34, rate: 0.3, camera: toes, reaction: 'flinch', complete: 0.9 },
  plaster: { id: 'plaster', label: 'Plasters', hint: 'Tap each sore spot to put a plaster on it', tool: 'patch', gesture: 'targets', sound: 'patch', targets: 'patch', targetTag: 'top', region: 'top.foot', camera: toes, reaction: 'content', need: 'targets' },
  cream: { id: 'cream', label: 'Foot cream', hint: 'Rub the foot cream in until the skin glows', tool: 'cream', gesture: 'rub', sound: 'cream', layer: 'top.cream', region: 'top.foot', radius: 88, rate: 0.16, camera: foot, reaction: 'content', wet: 0.35, complete: 0.9, clears: ['top.cream', 'top.redness'] },
  mask: { id: 'mask', label: 'Foot mask', hint: 'Brush the lavender gel mask over the whole foot', tool: 'maskBrush', gesture: 'paint', sound: 'brush', layer: 'top.mask', region: 'top.foot', radius: 70, rate: 0.24, camera: foot, reaction: 'content', complete: 0.93 },
  towel: { id: 'towel', label: 'Hot towel', hint: 'Press and hold the warm towel around the foot', tool: 'towel', gesture: 'hold', sound: 'steam', region: 'top.foot', holdSeconds: 3, wet: 0.5, camera: foot, reaction: 'content' },
  peel: { id: 'peel', label: 'Peel it off', hint: 'Grab the mask at the toes and peel it up slowly', tool: 'fingers', gesture: 'peel', sound: 'peel', layer: 'top.mask', region: 'top.foot', camera: { x: 512, y: 560, zoom: 0.96 }, reaction: 'tickle', clears: ['top.redness', 'top.antiseptic'] },
  // The oil soaks in at the end: the skin keeps its glow, not the streaks.
  massage: { id: 'massage', label: 'Foot massage', hint: 'Rub the warm oil in with long slow strokes', tool: 'fingers', gesture: 'rub', sound: 'oil', layer: 'top.oil', region: 'top.foot', radius: 92, rate: 0.16, camera: foot, reaction: 'content', wet: 0.3, complete: 0.9, clears: ['top.redness', 'top.oil'] },
  color: { id: 'color', label: 'Colour', hint: 'Pick a colour, then paint every toenail', tool: 'polishBrush', gesture: 'paint', sound: 'polish', layer: 'top.color', region: 'top.nails', radius: 30, rate: 0.24, choice: 'polish', camera: toes, reaction: 'content' },
  top: { id: 'top', label: 'Top coat', hint: 'Seal the colour with a glossy top coat', tool: 'topCoat', gesture: 'paint', sound: 'polish', layer: 'top.top', region: 'top.nails', radius: 30, rate: 0.28, camera: toes, reaction: 'neutral' },
} satisfies Record<string, StepDef>
export const FOOT_STEPS: { readonly [K in keyof typeof LIBRARY]: StepDef } = LIBRARY

export type FootStepId = keyof typeof LIBRARY

const S = FOOT_STEPS

/** The Classic Pedicure as written; each customer gets their own list (plan.ts). */
export const FEET: TreatmentDef = {
  id: 'feet',
  name: 'Pedicure',
  bodyPart: 'foot',
  station: 'feet',
  basePrice: 30,
  productCost: 6,
  parSeconds: 210,
  layers: [
    { id: 'top.redness', kind: 'damage', region: 'top.foot', seed: 'foot' },
    { id: 'top.swelling', kind: 'damage', region: 'top.fold', seed: 'foot' },
    { id: 'top.callus', kind: 'damage', region: 'top.foot', seed: 'foot' },
    { id: 'top.fungus', kind: 'damage', region: 'top.fungal', seed: 'foot' },
    { id: 'top.oldPolish', kind: 'dirt', region: 'top.nails', seed: 'foot' },
    { id: 'top.cuticle', kind: 'damage', region: 'top.cuticles', seed: 'foot' },
    { id: 'top.rough', kind: 'damage', region: 'top.tips', seed: 'full' },
    { id: 'top.dirt', kind: 'dirt', region: 'top.foot', seed: 'foot' },
    { id: 'top.hair', kind: 'damage', region: 'top.foot', seed: 'foot' },
    { id: 'top.antiseptic', kind: 'paint', region: 'top.treated', seed: 'empty' },
    { id: 'top.cream', kind: 'paint', region: 'top.foot', seed: 'empty' },
    { id: 'top.antifungal', kind: 'paint', region: 'top.toes', seed: 'empty' },
    { id: 'top.oil', kind: 'glow', region: 'top.foot', seed: 'empty' },
    { id: 'top.mask', kind: 'paint', region: 'top.foot', seed: 'empty' },
    { id: 'top.scrub', kind: 'paint', region: 'top.foot', seed: 'empty' },
    { id: 'top.salt', kind: 'paint', region: 'top.foot', seed: 'empty' },
    { id: 'top.color', kind: 'paint', region: 'top.nails', seed: 'empty' },
    { id: 'top.top', kind: 'paint', region: 'top.nails', seed: 'empty' },
    { id: 'top.water', kind: 'wet', region: 'everywhere', seed: 'empty' },
    { id: 'sole.callus', kind: 'damage', region: 'sole.calluses', seed: 'foot' },
    { id: 'sole.dry', kind: 'damage', region: 'sole.sole', seed: 'foot' },
    { id: 'sole.cracks', kind: 'damage', region: 'sole.heelRim', seed: 'foot' },
    { id: 'sole.dirt', kind: 'dirt', region: 'sole.sole', seed: 'foot' },
    { id: 'sole.cream', kind: 'paint', region: 'sole.sole', seed: 'empty' },
    { id: 'sole.scrub', kind: 'paint', region: 'sole.sole', seed: 'empty' },
    { id: 'sole.salt', kind: 'paint', region: 'sole.sole', seed: 'empty' },
  ],
  steps: [S.bath, S.scrub, S.scrubSole, S.rasp, S.creamSole, S.remove, S.clip, S.file, S.cuticles, S.cream, S.color],
}

/** The three pedicures of the feet family, with their price against the classic. */
export const FOOT_VARIANTS = {
  classic: { label: 'Classic Pedicure', price: 1, par: 210 },
  clinic: { label: 'Foot Clinic', price: 1.8, par: 250 },
  spa: { label: 'Spa Pedicure', price: 1.6, par: 240 },
} as const
export type FootVariant = keyof typeof FOOT_VARIANTS

/** Which side of the foot a step works on. */
export const viewOf = (step: StepDef | undefined): 'top' | 'sole' => step?.view ?? 'top'
