import type { RegionId } from './anatomy.ts'
import type { StepDef, TreatmentDef } from './types.ts'

const hand = { x: 470, y: 590, zoom: 0.92 }
const tips = { x: 480, y: 420, zoom: 1.25 }

/** Every manicure step, by id. A customer's manicure is built from these (plan.ts). */
const LIBRARY = {
  soak: { id: 'soak', label: 'Warm soak', hint: 'Sweep the warm sponge over the hand', tool: 'sponge', gesture: 'paint', sound: 'water', layer: 'wet', region: 'hand', radius: 96, rate: 0.26, also: [{ layer: 'dirt', amount: -0.012 }], camera: hand, reaction: 'content', wet: 1, complete: 0.9 },
  remove: { id: 'remove', label: 'Polish remover', hint: 'Rub the cotton pad over the old polish', tool: 'cottonPad', gesture: 'erase', sound: 'wipe', layer: 'oldPolish', region: 'nails', radius: 44, rate: 0.2, camera: tips, reaction: 'neutral', need: 'layer' },
  under: { id: 'under', label: 'Under the nails', hint: 'Brush the dirt out from under each nail', tool: 'nailBrush', gesture: 'erase', sound: 'scrub', layer: 'dirt', region: 'tips', radius: 36, rate: 0.2, camera: tips, reaction: 'neutral', need: 'layer' },
  clip: { id: 'clip', label: 'Clip', hint: 'Tap each long nail to clip it', tool: 'clipper', gesture: 'targets', sound: 'snip', targets: 'tip', region: 'nails', camera: tips, reaction: 'neutral', need: 'targets' },
  file: { id: 'file', label: 'File', hint: 'File the tips smooth with short strokes', tool: 'file', gesture: 'erase', sound: 'rasp', layer: 'rough', region: 'tips', radius: 34, rate: 0.16, camera: tips, reaction: 'neutral' },
  // Wide and forgiving: pushing back ten little cuticles should take seconds, not a hunt.
  cuticles: { id: 'cuticles', label: 'Cuticle pusher', hint: 'Push the cuticles back at the base of each nail', tool: 'pusher', gesture: 'erase', sound: 'push', layer: 'cuticle', region: 'cuticles', radius: 39, rate: 0.24, camera: tips, reaction: 'neutral', complete: 0.85 },
  nip: { id: 'nip', label: 'Nip hangnails', hint: 'Press each little hangnail to nip it', tool: 'nipper', gesture: 'targets', sound: 'snip', targets: 'hangnail', region: 'hand', camera: tips, reaction: 'flinch', need: 'targets' },
  buff: { id: 'buff', label: 'Buff', hint: 'Buff each nail until it shines', tool: 'buffer', gesture: 'erase', sound: 'buff', layer: 'dull', region: 'nails', radius: 42, rate: 0.18, camera: tips, reaction: 'neutral', clears: ['wet'] },
  scrub: { id: 'scrub', label: 'Hand scrub', hint: 'Rub the sugar scrub all over the hand', tool: 'scrub', gesture: 'rub', sound: 'scrub', layer: 'scrub', region: 'hand', radius: 88, rate: 0.16, also: [{ layer: 'dry', amount: -0.12 }], camera: hand, reaction: 'content', complete: 0.9 },
  wipe: { id: 'wipe', label: 'Warm towel', hint: 'Wipe the scrub away with the warm towel', tool: 'towel', gesture: 'erase', sound: 'wipe', layer: 'scrub', region: 'hand', radius: 100, rate: 0.22, camera: hand, reaction: 'content', wet: 0.4, clears: ['dry', 'wet'] },
  base: { id: 'base', label: 'Base coat', hint: 'Paint a clear base coat on every nail', tool: 'baseCoat', gesture: 'paint', sound: 'polish', layer: 'base', region: 'nails', radius: 36, rate: 0.24, camera: tips, reaction: 'neutral' },
  color: { id: 'color', label: 'Colour', hint: 'Pick a colour, then paint every nail', tool: 'polishBrush', gesture: 'paint', sound: 'polish', layer: 'color', region: 'nails', radius: 36, rate: 0.22, choice: 'polish', camera: tips, reaction: 'content' },
  top: { id: 'top', label: 'Top coat', hint: 'Seal it with a glossy top coat', tool: 'topCoat', gesture: 'paint', sound: 'polish', layer: 'top', region: 'nails', radius: 36, rate: 0.26, camera: tips, reaction: 'neutral' },
  cure: { id: 'cure', label: 'UV lamp', hint: 'Hold under the lamp to set the polish', tool: 'uvLamp', gesture: 'hold', sound: 'uv', region: 'nails', holdSeconds: 3, camera: hand, reaction: 'content' },
  airDry: { id: 'airDry', label: 'Air dry', hint: 'Hold the little fan over the nails while they dry', tool: 'fan', gesture: 'hold', sound: 'fan', region: 'nails', holdSeconds: 2.6, passive: 0.5, camera: hand, reaction: 'content' },
  gems: { id: 'gems', label: 'Gems', hint: 'Tap a nail to add a gem, or finish', tool: 'gems', gesture: 'targets', sound: 'gem', targets: 'gem', region: 'nails', camera: tips, reaction: 'content', optional: true },
  oil: { id: 'oil', label: 'Cuticle oil', hint: 'A drop of oil on each cuticle, then rub it in', tool: 'dropper', gesture: 'paint', sound: 'oil', layer: 'wet', region: 'cuticles', radius: 34, rate: 0.3, camera: tips, reaction: 'content', complete: 0.85 },
  massage: { id: 'massage', label: 'Hand massage', hint: 'Rub the cream into the hand in slow circles', tool: 'cream', gesture: 'rub', sound: 'cream', layer: 'wet', region: 'hand', radius: 96, rate: 0.16, also: [{ layer: 'dry', amount: -0.1 }], camera: hand, reaction: 'content', complete: 0.9, clears: ['dry'] },
} satisfies Record<string, StepDef>
export const NAIL_STEPS: { readonly [K in keyof typeof LIBRARY]: StepDef } = LIBRARY

export type NailStepId = keyof typeof LIBRARY

const FINGER_NAMES = ['thumb', 'index', 'middle', 'ring', 'little']

/** Repairing one broken nail: repair gel brushed over just that nail (it sets under the base coat). */
export function repairStep(finger: number): StepDef {
  return { id: `repair${finger}`, label: 'Repair', hint: `Brush repair gel over the broken ${FINGER_NAMES[finger] ?? ''} nail`, tool: 'baseCoat', gesture: 'paint', sound: 'polish', layer: 'base', region: `nail${finger}` as RegionId, radius: 30, rate: 0.3, camera: tips, reaction: 'neutral', complete: 0.9, tint: 0xfbe4ec }
}

const S = NAIL_STEPS

/** The manicure as data. Its step list is the classic manicure; each customer gets their own (plan.ts). */
export const NAILS: TreatmentDef = {
  id: 'nails',
  name: 'Mani Glow-Up',
  bodyPart: 'hand',
  station: 'nails',
  basePrice: 32,
  productCost: 6,
  parSeconds: 190,
  layers: [
    { id: 'wet', kind: 'wet', region: 'hand', seed: 'empty' },
    { id: 'dry', kind: 'damage', region: 'hand', seed: 'dry' },
    { id: 'dull', kind: 'dirt', region: 'nails', seed: 'full' },
    { id: 'oldPolish', kind: 'dirt', region: 'nails', seed: 'polish' },
    { id: 'dirt', kind: 'dirt', region: 'tips', seed: 'dirt' },
    { id: 'rough', kind: 'damage', region: 'tips', seed: 'full' },
    { id: 'cuticle', kind: 'damage', region: 'cuticles', seed: 'cuticle' },
    { id: 'scrub', kind: 'paint', region: 'hand', seed: 'empty' },
    { id: 'base', kind: 'paint', region: 'nails', seed: 'empty' },
    { id: 'color', kind: 'paint', region: 'nails', seed: 'empty' },
    { id: 'top', kind: 'paint', region: 'nails', seed: 'empty' },
  ],
  steps: [S.soak, S.remove, S.under, S.clip, S.file, S.cuticles, S.nip, S.buff, S.scrub, S.wipe, S.base, S.color, S.top, S.cure, S.gems],
}
