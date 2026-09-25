import type { BodyPartId, RegionId } from './anatomy.ts'

/**
 * A treatment is data: a body part, the layers painted on it, and an ordered list of steps. Each step names
 * a tool, a gesture, the layer it changes and where it counts. The session (session.ts) runs any treatment
 * from this data, so a new treatment (feet, brows, a shave) is mostly a new data file plus its art.
 */
export type TreatmentId = 'facial' | 'nails' | 'feet'

/** How a step is played. */
export type Gesture =
  /** Drag to wipe a layer away (scrub, rinse, wipe). Progress: how much of it is gone. */
  | 'erase'
  /** Drag to lay a layer down (clay mask, polish). Progress: how much of the region is covered. */
  | 'paint'
  /** Drag back and forth to build a layer by rubbing (foam, scrub, cream). Like paint, with rub feedback. */
  | 'rub'
  /** Press and hold on the body part (steam towel, UV lamp, the fan while a mask dries). */
  | 'hold'
  /** Press each target: hold to pop or nip, or a tap to clip, drop or place. */
  | 'targets'
  /** Drag the tool across targets to work them (the blackhead loop). */
  | 'sweep'
  /** A slow drag with resistance, then release (a peel-off mask). */
  | 'peel'

export type LayerKind = 'dirt' | 'damage' | 'paint' | 'wet' | 'glow'


/** How the session seeds a layer, scaled by the customer's profile (profile.ts). */
export type LayerSeed = 'full' | 'empty' | 'grime' | 'grime2' | 'oil' | 'redness' | 'flakes' | 'polish' | 'dirt' | 'cuticle' | 'dry'
  /** Feet: seeded from the foot's own conditions, by layer (session.ts seedFoot). */
  | 'foot'

export type LayerDef = {
  id: string
  kind: LayerKind
  region: RegionId
  seed: LayerSeed
}

export type TargetKind = 'whitehead' | 'blackhead' | 'drop' | 'patch' | 'tip' | 'hangnail' | 'gem'
  /** Feet: a corn's hard core (lifted with a hold), the ingrown nail's edge (eased out with a hold), a splinter (pulled out with a hold). */
  | 'corn' | 'ingrown' | 'splinter'

export type Reaction = 'neutral' | 'content' | 'flinch' | 'tickle'

/** Sound families; audio/sfx.ts plays each (recorded clips layered with synthesis). */
export type ToolSound = 'steam' | 'foam' | 'water' | 'pop' | 'loop' | 'wipe' | 'brush' | 'fan' | 'peel' | 'drip' | 'cream' | 'patch'
  | 'snip' | 'rasp' | 'push' | 'buff' | 'scrub' | 'polish' | 'uv' | 'gem' | 'comb' | 'roll' | 'oil' | 'sheet'
  /** The foot bath: warm water and rising bubbles. */
  | 'bath'

export type StepDef = {
  id: string
  /** Short name on the tool tray: "Steam towel". */
  label: string
  /** One line telling the player what to do. */
  hint: string
  /** The tool's art. */
  tool: string
  gesture: Gesture
  sound: ToolSound
  /** The layer the gesture adds to or removes. */
  layer?: string
  /** Where the step counts. */
  region: RegionId
  /** Other layers the tool also changes where it passes (a rinse carries the dirt away with the foam). */
  also?: { layer: string; amount: number }[]
  /** Brush radius in art pixels, and coverage per brush stamp, at tool tier 1. */
  radius?: number
  rate?: number
  /** Hold steps: seconds of holding at tier 1. `passive` is the share of that speed without holding. */
  holdSeconds?: number
  passive?: number
  /** Target steps: which targets. */
  targets?: TargetKind
  /** Target steps that share a kind with another step (under-eye patches and pimple patches): which group. */
  targetTag?: string
  /** Where the camera looks during the step (art space) and how close. */
  camera: { x: number; y: number; zoom: number }
  /** How the customer feels about this step. */
  reaction: Reaction
  /** Wets the skin where the tool goes (0 to 1), for the glossy highlight. */
  wet?: number
  /** Share at which a coverage step completes by itself (default 0.95). */
  complete?: number
  /** The step can be left out without a penalty; doing it earns a bonus. */
  optional?: boolean
  /** A choice to make before painting: the polish colour. */
  choice?: 'polish'
  /** A second player can hold the magnifier lamp during this step (four hands). */
  lamp?: boolean
  /**
   * When the step applies: 'targets' only if this customer has any of its targets, 'layer' only if its
   * layer has something on it when the step comes up, 'disaster' only for disaster cases. A step that does
   * not apply drops out of this customer's treatment with no penalty.
   */
  need?: 'targets' | 'layer' | 'disaster'
  /** Layers this step clears away when it finishes, besides its own. */
  clears?: string[]
  /**
   * The colour this step's product should show in, for steps that share a layer (the mask variants all
   * paint the 'mask' layer: grey-green clay, a white sheet, charcoal bubbles, gold foil). The art tints the
   * layer (and the peel flap) with it; without it the layer keeps its own colour.
   */
  tint?: number
  /** Feet: which side of the foot the step works on (default 'top'); the close-up turns the foot over between them. */
  view?: 'top' | 'sole'
}

export type TreatmentDef = {
  id: TreatmentId
  name: string
  bodyPart: BodyPartId
  /** Station kind that runs it. */
  station: TreatmentId
  basePrice: number
  productCost: number
  /** Seconds a good, unhurried pass takes; the speed score compares against it. */
  parSeconds: number
  layers: LayerDef[]
  steps: StepDef[]
}

/** The colours on the polish rack; a customer wishes for one of them. */
export const POLISH_COLORS = [
  { name: 'Blush', hex: 0xf4a6b8 },
  { name: 'Cherry', hex: 0xd83a56 },
  { name: 'Lilac', hex: 0xb79ce6 },
  { name: 'Mint', hex: 0x94dcc0 },
  { name: 'Butter', hex: 0xf6dd8a },
  { name: 'Sky', hex: 0x8ec5f2 },
  { name: 'Coral', hex: 0xf5836b },
  { name: 'Midnight', hex: 0x3b3a6e },
] as const
