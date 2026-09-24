import { FACE } from './anatomy.ts'
import type { TreatmentDef } from './types.ts'

const whole = { x: 512, y: 540, zoom: 1 }
const nose = FACE.nose

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
    { id: 'oil', kind: 'dirt', region: 'tzone', seed: 'oil' },
    { id: 'grime', kind: 'dirt', region: 'face', seed: 'grime' },
    { id: 'serum', kind: 'glow', region: 'skin', seed: 'empty' },
    { id: 'glow', kind: 'glow', region: 'skin', seed: 'empty' },
    { id: 'cream', kind: 'paint', region: 'skin', seed: 'empty' },
    { id: 'mask', kind: 'paint', region: 'skin', seed: 'empty' },
    { id: 'foam', kind: 'paint', region: 'face', seed: 'empty' },
  ],
  steps: [
    { id: 'steam', label: 'Steam towel', hint: 'Press and hold to warm the skin and open the pores', tool: 'towel', gesture: 'hold', sound: 'steam', region: 'face', holdSeconds: 3.2, camera: whole, reaction: 'content', wet: 0.5 },
    { id: 'cleanse', label: 'Foam cleanser', hint: 'Rub in circles to build a rich foam', tool: 'foamBrush', gesture: 'rub', sound: 'foam', layer: 'foam', region: 'face', radius: 74, rate: 0.16, also: [{ layer: 'grime', amount: -0.05 }, { layer: 'oil', amount: -0.05 }], camera: { x: 512, y: 560, zoom: 1.08 }, reaction: 'content', complete: 0.93 },
    { id: 'rinse', label: 'Rinse', hint: 'Spray the water to carry the foam away', tool: 'shower', gesture: 'erase', sound: 'water', layer: 'foam', region: 'face', radius: 82, rate: 0.2, also: [{ layer: 'grime', amount: -0.3 }, { layer: 'oil', amount: -0.3 }], camera: { x: 512, y: 560, zoom: 1.08 }, reaction: 'content', wet: 1 },
    { id: 'pop', label: 'Pop whiteheads', hint: 'Press and hold each whitehead until it pops', tool: 'fingers', gesture: 'targets', sound: 'pop', targets: 'whitehead', region: 'skin', camera: { x: 512, y: 600, zoom: 1.28 }, reaction: 'flinch', lamp: true },
    { id: 'extract', label: 'Blackhead loop', hint: 'Drag the loop across the blackheads on the nose', tool: 'loop', gesture: 'sweep', sound: 'loop', targets: 'blackhead', region: 'nose', radius: 30, rate: 0.28, camera: { x: nose.x, y: nose.y - 6, zoom: 2.35 }, reaction: 'flinch', lamp: true },
    { id: 'antiseptic', label: 'Antiseptic pad', hint: 'Dab the pad over the red marks', tool: 'cottonPad', gesture: 'erase', sound: 'wipe', layer: 'marks', region: 'skin', radius: 62, rate: 0.24, camera: { x: 512, y: 600, zoom: 1.2 }, reaction: 'neutral', wet: 0.3 },
    { id: 'mask', label: 'Clay mask', hint: 'Brush the clay over the skin, around the eyes and lips', tool: 'maskBrush', gesture: 'paint', sound: 'brush', layer: 'mask', region: 'skin', radius: 58, rate: 0.22, camera: whole, reaction: 'content', complete: 0.94 },
    { id: 'dry', label: 'Let it dry', hint: 'Hold the fan to dry the mask faster', tool: 'fan', gesture: 'hold', sound: 'fan', region: 'skin', holdSeconds: 3.6, passive: 0.3, camera: whole, reaction: 'content' },
    { id: 'peel', label: 'Peel it off', hint: 'Grab the chin edge and drag up slowly', tool: 'fingers', gesture: 'peel', sound: 'peel', layer: 'mask', region: 'skin', camera: { x: 512, y: 560, zoom: 1.02 }, reaction: 'tickle' },
    { id: 'toner', label: 'Toner', hint: 'Sweep the toner pad over the redness', tool: 'tonerPad', gesture: 'erase', sound: 'wipe', layer: 'redness', region: 'skin', radius: 70, rate: 0.2, camera: whole, reaction: 'content', wet: 0.45 },
    { id: 'serum', label: 'Serum', hint: 'Tap each glowing spot to drip the serum', tool: 'dropper', gesture: 'targets', sound: 'drip', targets: 'drop', layer: 'serum', region: 'skin', camera: whole, reaction: 'content', wet: 0.8 },
    { id: 'moisturize', label: 'Moisturiser', hint: 'Rub the cream in until the skin glows', tool: 'cream', gesture: 'rub', sound: 'cream', layer: 'glow', region: 'skin', radius: 86, rate: 0.14, also: [{ layer: 'cream', amount: -0.12 }, { layer: 'serum', amount: -0.05 }], camera: whole, reaction: 'content', wet: 0.4, complete: 0.93 },
    { id: 'patches', label: 'Pimple patches', hint: 'Tap the spots that need a patch', tool: 'patch', gesture: 'targets', sound: 'patch', targets: 'patch', region: 'skin', camera: { x: 512, y: 600, zoom: 1.2 }, reaction: 'content', optional: true },
  ],
}
