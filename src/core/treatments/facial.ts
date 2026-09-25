import { FACE } from './anatomy.ts'
import type { StepDef, TreatmentDef } from './types.ts'

const whole = { x: 512, y: 540, zoom: 1 }
const wash = { x: 512, y: 560, zoom: 1.08 }
const close = { x: 512, y: 600, zoom: 1.2 }
const nose = FACE.nose

/** Every facial step, by id. A customer's facial is built from these (plan.ts): no two run the same. */
const LIBRARY = {
  steam: { id: 'steam', label: 'Steam towel', hint: 'Press and hold to warm the skin and open the pores', tool: 'towel', gesture: 'hold', sound: 'steam', region: 'face', holdSeconds: 3.2, camera: whole, reaction: 'content', wet: 0.5 },
  cleanse: { id: 'cleanse', label: 'Foam cleanser', hint: 'Rub in circles to build a rich foam', tool: 'foamBrush', gesture: 'rub', sound: 'foam', layer: 'foam', region: 'skin', radius: 74, rate: 0.16, also: [{ layer: 'grime', amount: -0.05 }, { layer: 'oil', amount: -0.05 }, { layer: 'flakes', amount: -0.05 }], camera: wash, reaction: 'content', complete: 0.93 },
  rinse: { id: 'rinse', label: 'Rinse', hint: 'Spray the water to carry the foam away', tool: 'shower', gesture: 'erase', sound: 'water', layer: 'foam', region: 'skin', radius: 82, rate: 0.2, also: [{ layer: 'grime', amount: -0.3 }, { layer: 'oil', amount: -0.3 }, { layer: 'flakes', amount: -0.3 }], camera: wash, reaction: 'content', wet: 1, clears: ['grime', 'oil', 'flakes'] },
  cleanse2: { id: 'cleanse2', label: 'Second cleanse', hint: 'Ground-in grime: build a second round of foam', tool: 'foamBrush', gesture: 'rub', sound: 'foam', layer: 'foam', region: 'skin', radius: 74, rate: 0.18, also: [{ layer: 'grime2', amount: -0.08 }], camera: wash, reaction: 'content', complete: 0.93, need: 'disaster' },
  rinse2: { id: 'rinse2', label: 'Rinse again', hint: 'Rinse the last of the grime away', tool: 'shower', gesture: 'erase', sound: 'water', layer: 'foam', region: 'skin', radius: 82, rate: 0.22, also: [{ layer: 'grime2', amount: -0.4 }], camera: wash, reaction: 'content', wet: 1, clears: ['grime2'], need: 'disaster' },
  pop: { id: 'pop', label: 'Pop whiteheads', hint: 'Press and hold each whitehead until it pops. Deep ones take two squeezes', tool: 'fingers', gesture: 'targets', sound: 'pop', targets: 'whitehead', region: 'skin', camera: close, reaction: 'flinch', lamp: true, need: 'targets' },
  extract: { id: 'extract', label: 'Blackhead loop', hint: 'Drag the loop across the blackheads on the nose', tool: 'loop', gesture: 'sweep', sound: 'loop', targets: 'blackhead', region: 'nose', radius: 26, rate: 0.1, camera: { x: nose.x, y: nose.y - 10, zoom: 1.75 }, reaction: 'flinch', lamp: true, need: 'targets' },
  antiseptic: { id: 'antiseptic', label: 'Antiseptic pad', hint: 'Dab the pad over the red marks', tool: 'cottonPad', gesture: 'erase', sound: 'wipe', layer: 'marks', region: 'skin', radius: 62, rate: 0.24, camera: close, reaction: 'neutral', wet: 0.3, need: 'layer' },
  // The masks: four kinds, one per customer (plan.ts picks from their skin). All paint the 'mask' layer;
  // `tint` says what colour the art should show it in.
  mask: { id: 'mask', label: 'Clay mask', hint: 'Brush the clay over the skin, around the eyes and lips', tool: 'maskBrush', gesture: 'paint', sound: 'brush', layer: 'mask', region: 'skin', radius: 58, rate: 0.22, camera: whole, reaction: 'content', complete: 0.94 },
  dry: { id: 'dry', label: 'Let it dry', hint: 'Hold the fan to dry the mask faster', tool: 'fan', gesture: 'hold', sound: 'fan', region: 'skin', holdSeconds: 3.6, passive: 0.3, camera: whole, reaction: 'content' },
  peel: { id: 'peel', label: 'Peel it off', hint: 'Grab the chin edge and drag up slowly', tool: 'fingers', gesture: 'peel', sound: 'peel', layer: 'mask', region: 'skin', camera: { x: 512, y: 560, zoom: 1.02 }, reaction: 'tickle' },
  sheet: { id: 'sheet', label: 'Sheet mask', hint: 'Smooth the sheet mask on, from the middle out to the edges', tool: 'sheetMask', gesture: 'paint', sound: 'sheet', layer: 'mask', region: 'skin', radius: 68, rate: 0.34, camera: whole, reaction: 'content', wet: 0.6, complete: 0.92, tint: 0xf3f6fa },
  soakIn: { id: 'soakIn', label: 'Let it soak in', hint: 'Press gently and let the essence soak in', tool: 'fingers', gesture: 'hold', sound: 'cream', region: 'skin', holdSeconds: 3, passive: 0.45, camera: whole, reaction: 'content', wet: 0.4 },
  sheetPeel: { id: 'peel', label: 'Lift the sheet', hint: 'Take the sheet at the chin and lift it off slowly', tool: 'fingers', gesture: 'peel', sound: 'peel', layer: 'mask', region: 'skin', camera: { x: 512, y: 560, zoom: 1.02 }, reaction: 'tickle', tint: 0xf3f6fa },
  bubble: { id: 'bubble', label: 'Bubble mask', hint: 'Brush on the charcoal bubble mask', tool: 'maskBrush', gesture: 'paint', sound: 'brush', layer: 'mask', region: 'skin', radius: 62, rate: 0.24, camera: whole, reaction: 'content', complete: 0.93, tint: 0x6b6770 },
  fizz: { id: 'fizz', label: 'Let it fizz', hint: 'Rub in little circles and watch it bubble up', tool: 'fingers', gesture: 'rub', sound: 'foam', layer: 'foam', region: 'skin', radius: 80, rate: 0.17, camera: wash, reaction: 'tickle', complete: 0.9 },
  rinseMask: { id: 'rinseMask', label: 'Rinse it off', hint: 'Spray the bubbles and the mask away', tool: 'shower', gesture: 'erase', sound: 'water', layer: 'foam', region: 'skin', radius: 84, rate: 0.22, also: [{ layer: 'mask', amount: -0.35 }], camera: wash, reaction: 'content', wet: 1, clears: ['mask'] },
  gold: { id: 'gold', label: 'Gold foil mask', hint: 'Lay the gold foil over the skin in soft strokes', tool: 'maskBrush', gesture: 'paint', sound: 'sheet', layer: 'mask', region: 'skin', radius: 62, rate: 0.26, camera: whole, reaction: 'content', complete: 0.93, tint: 0xe8c46a },
  goldDry: { id: 'dry', label: 'Let it set', hint: 'Hold the fan while the gold sets', tool: 'fan', gesture: 'hold', sound: 'fan', region: 'skin', holdSeconds: 3.2, passive: 0.35, camera: whole, reaction: 'content', tint: 0xe8c46a },
  goldPeel: { id: 'peel', label: 'Peel the gold', hint: 'Grab the chin edge and peel the gold up slowly', tool: 'fingers', gesture: 'peel', sound: 'peel', layer: 'mask', region: 'skin', camera: { x: 512, y: 560, zoom: 1.02 }, reaction: 'tickle', tint: 0xe8c46a },
  toner: { id: 'toner', label: 'Toner', hint: 'Sweep the toner pad over the redness', tool: 'tonerPad', gesture: 'erase', sound: 'wipe', layer: 'redness', region: 'skin', radius: 70, rate: 0.2, camera: whole, reaction: 'content', wet: 0.45, need: 'layer' },
  serum: { id: 'serum', label: 'Serum', hint: 'Tap each glowing spot to drip the serum', tool: 'dropper', gesture: 'targets', sound: 'drip', targets: 'drop', layer: 'serum', region: 'skin', camera: whole, reaction: 'content', wet: 0.8 },
  moisturize: { id: 'moisturize', label: 'Moisturiser', hint: 'Rub the cream in until the skin glows', tool: 'cream', gesture: 'rub', sound: 'cream', layer: 'glow', region: 'skin', radius: 86, rate: 0.14, also: [{ layer: 'cream', amount: -0.12 }, { layer: 'serum', amount: -0.05 }], camera: whole, reaction: 'content', wet: 0.4, complete: 0.93, clears: ['cream', 'serum'] },
  patches: { id: 'patches', label: 'Pimple patches', hint: 'Tap the spots that need a patch', tool: 'patch', gesture: 'targets', sound: 'patch', targets: 'patch', region: 'skin', camera: close, reaction: 'content', optional: true, need: 'targets' },
  // Little extras: one or two per customer.
  brows: { id: 'brows', label: 'Brow tidy', hint: 'Brush the brows up and into shape', tool: 'browBrush', gesture: 'paint', sound: 'comb', layer: 'glow', region: 'brows', radius: 34, rate: 0.3, camera: { x: 512, y: 452, zoom: 1.45 }, reaction: 'neutral', complete: 0.85 },
  lips: { id: 'lips', label: 'Lip scrub', hint: 'Rub the sugar scrub over the lips in little circles', tool: 'scrub', gesture: 'rub', sound: 'scrub', layer: 'cream', region: 'lips', radius: 32, rate: 0.28, camera: { x: 512, y: 748, zoom: 1.7 }, reaction: 'tickle', complete: 0.88 },
  eyePatches: { id: 'eyePatches', label: 'Under-eye patches', hint: 'Tap under each eye to place a cooling patch', tool: 'patch', gesture: 'targets', sound: 'patch', targets: 'patch', targetTag: 'eye', region: 'skin', camera: { x: 512, y: 560, zoom: 1.3 }, reaction: 'content' },
  jade: { id: 'jade', label: 'Jade roller', hint: 'Roll the serum in with long upward strokes', tool: 'jadeRoller', gesture: 'rub', sound: 'roll', layer: 'serum', region: 'skin', radius: 80, rate: 0.2, camera: whole, reaction: 'content', wet: 0.3, complete: 0.9 },
} satisfies Record<string, StepDef>
export const FACIAL_STEPS: { readonly [K in keyof typeof LIBRARY]: StepDef } = LIBRARY

export type FacialStepId = keyof typeof LIBRARY

const S = FACIAL_STEPS

/** The facial as data. Its step list is the classic clay facial; each customer gets their own (plan.ts). */
export const FACIAL: TreatmentDef = {
  id: 'facial',
  name: 'Glow Facial',
  bodyPart: 'face',
  station: 'facial',
  basePrice: 38,
  productCost: 7,
  parSeconds: 170,
  layers: [
    { id: 'redness', kind: 'damage', region: 'skin', seed: 'redness' },
    { id: 'marks', kind: 'damage', region: 'skin', seed: 'empty' },
    { id: 'flakes', kind: 'dirt', region: 'skin', seed: 'flakes' },
    { id: 'oil', kind: 'dirt', region: 'tzone', seed: 'oil' },
    { id: 'grime', kind: 'dirt', region: 'face', seed: 'grime' },
    { id: 'grime2', kind: 'dirt', region: 'face', seed: 'grime2' },
    { id: 'serum', kind: 'glow', region: 'skin', seed: 'empty' },
    { id: 'glow', kind: 'glow', region: 'skin', seed: 'empty' },
    { id: 'cream', kind: 'paint', region: 'skin', seed: 'empty' },
    { id: 'mask', kind: 'paint', region: 'skin', seed: 'empty' },
    { id: 'foam', kind: 'paint', region: 'skin', seed: 'empty' },
  ],
  steps: [S.steam, S.cleanse, S.rinse, S.cleanse2, S.rinse2, S.pop, S.extract, S.antiseptic, S.mask, S.dry, S.peel, S.toner, S.serum, S.moisturize, S.patches],
}
