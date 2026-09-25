import { makeRng, type Rng } from '../rng.ts'
import { FACIAL, FACIAL_STEPS as F } from './facial.ts'
import { NAILS, NAIL_STEPS as N, repairStep } from './nails.ts'
import { FEET, FOOT_STEPS as P, FOOT_VARIANTS, type FootVariant } from './feet.ts'
import { footProfile, type FootProfile } from '../foot.ts'
import { faceProfile, handProfile, type FaceProfile, type HandProfile } from './profile.ts'
import { TREATMENTS } from './registry.ts'
import type { StepDef, TreatmentDef, TreatmentId } from './types.ts'

/**
 * Every customer's own treatment, built from the step library and their seed, so no two play the same:
 *
 * - Facials pick a mask from the skin (clay for oily skin, a sheet mask for dry or mature skin, a charcoal
 *   bubble mask for grime, now and then gold foil), add one or two little extras (brow tidy, lip scrub,
 *   under-eye patches, jade roller), and shuffle the steps whose order does not matter (steam before or after
 *   the cleanse, pimples before or after blackheads, toner and extras in any order).
 * - Manicures pick classic (air dry) or gel (UV lamp twice), repair each broken nail, add one or two extras
 *   (hand scrub, cuticle oil, hand massage, gems) and shuffle what can be shuffled.
 * - Pedicures pick the Classic Pedicure, the Foot Clinic or the Spa Pedicure from the foot's problems (corns,
 *   an ingrown nail, splinters and fungus call for the clinic), take only the steps the foot needs (no clipping
 *   for short nails, no antifungal for healthy ones), and shuffle what can be shuffled, including whether the
 *   sole is done before or after the toenails (the foot turns over between them).
 * - Disaster cases get their extra steps (a second cleanse, extra repairs, a second scrub and cracked heels).
 *
 * Pure and deterministic from (treatment, seed, disaster): the host, every guest at the station and a
 * resumed treatment all build the same list.
 */
export type MaskVariant = 'clay' | 'sheet' | 'bubble' | 'gold'
export type PolishStyle = 'classic' | 'gel'

export type TreatmentPlan = {
  /** The treatment with this customer's step list. */
  def: TreatmentDef
  mask: MaskVariant | null
  polish: PolishStyle | null
  /** The extras this customer gets, by step id. */
  extras: string[]
  /** Pedicures: which of the three this customer booked. */
  variant?: FootVariant
}

const MASKS: Record<MaskVariant, StepDef[]> = {
  clay: [F.mask, F.dry, F.peel],
  sheet: [F.sheet, F.soakIn, F.sheetPeel],
  bubble: [F.bubble, F.fizz, F.rinseMask],
  gold: [F.gold, F.goldDry, F.goldPeel],
}

export const MASK_LABEL: Record<MaskVariant, string> = { clay: 'Clay mask', sheet: 'Sheet mask', bubble: 'Bubble mask', gold: 'Gold foil mask' }

/** Blocks whose order does not matter, shuffled; each block keeps its own order. */
function shuffled<T>(r: Rng, blocks: T[][]): T[] {
  const b = [...blocks]
  for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [b[i], b[j]] = [b[j], b[i]] }
  return b.flat()
}

/** Weighted pick: [item, weight][]. */
function weighted<T>(r: Rng, items: [T, number][]): T {
  const total = items.reduce((a, [, w]) => a + Math.max(0, w), 0)
  let x = r() * total
  for (const [item, w] of items) { x -= Math.max(0, w); if (x <= 0) return item }
  return items[items.length - 1][0]
}

/** One or two distinct extras from a pool. */
function extrasFrom<T extends string>(r: Rng, pool: T[]): T[] {
  const n = r.chance(0.45) ? 2 : 1
  const left = [...pool]
  const out: T[] = []
  while (out.length < n && left.length) out.push(left.splice(Math.floor(r() * left.length), 1)[0])
  return out
}

/** The mask a face calls for. */
export function maskFor(face: FaceProfile, r: Rng): MaskVariant {
  return weighted(r, [
    ['clay', 0.8 + face.oil + (face.whiteheads > 5 ? 0.6 : 0)],
    ['sheet', 0.5 + face.flakes * 1.6 + face.age],
    ['bubble', 0.4 + face.grime * 0.9],
    ['gold', 0.3 + face.age * 0.5],
  ])
}

function facialPlan(seed: number, disaster: boolean): TreatmentPlan {
  const r = makeRng((seed ^ 0x7a11c3) >>> 0)
  const face = faceProfile(seed, disaster)
  const mask = maskFor(face, r)
  const extras = extrasFrom(r, ['brows', 'lips', 'eyePatches', 'jade'] as const)
  const has = (id: string) => extras.includes(id as never)
  const prep = shuffled(r, [[F.steam], [F.cleanse, F.rinse]])
  const deep = disaster ? [F.cleanse2, F.rinse2] : []
  const extraction = [...shuffled(r, [[F.pop], [F.extract]]), F.antiseptic]
  const finishing = shuffled(r, [[F.toner], ...(has('brows') ? [[F.brows]] : []), ...(has('lips') ? [[F.lips]] : [])])
  const serum = has('jade') ? [F.serum, F.jade] : [F.serum]
  const steps = [...prep, ...deep, ...extraction, ...MASKS[mask], ...finishing, ...serum, F.moisturize, ...(has('eyePatches') ? [F.eyePatches] : []), F.patches]
  return { def: { ...FACIAL, steps }, mask, polish: null, extras: [...extras] }
}

function nailsPlan(seed: number, disaster: boolean): TreatmentPlan {
  const r = makeRng((seed ^ 0x4a17e5) >>> 0)
  const hand: HandProfile = handProfile(seed, disaster)
  const polish: PolishStyle = r.chance(0.45) ? 'gel' : 'classic'
  const extras = extrasFrom(r, ['scrub', 'oil', 'massage', 'gems'] as const)
  const has = (id: string) => extras.includes(id as never)
  const cleanUp = shuffled(r, [[N.remove], [N.under]])
  const shape = shuffled(r, [[N.clip, N.file], [N.cuticles, N.nip]])
  const repairs = [...hand.broken].sort((a, b) => a - b).map(repairStep)
  const pamper = has('scrub') ? [N.scrub, N.wipe] : []
  const coats = polish === 'gel' ? [N.base, N.color, N.cure, N.top, N.cure] : [N.base, N.color, N.top, N.airDry]
  const after = shuffled(r, [...(has('oil') ? [[N.oil]] : []), ...(has('massage') ? [[N.massage]] : [])])
  const steps = [N.soak, ...cleanUp, ...shape, N.buff, ...pamper, ...repairs, ...coats, ...after, ...(has('gems') ? [N.gems] : [])]
  return { def: { ...NAILS, steps }, mask: null, polish, extras: [...extras] }
}

/** The pedicure a foot calls for: the clinic for real problems, the spa for tired but healthy feet. */
export function footVariantFor(p: FootProfile, disaster: boolean, r: Rng): FootVariant {
  const fungal = p.fungus.filter(f => f > 0).length
  const problems = p.corns.length * 0.5 + (p.ingrown ? 1 : 0) + p.splinters.length * 0.45 + fungal * 0.35 + (disaster ? 1.2 : 0)
  return weighted(r, [
    ['classic', 1],
    ['clinic', 0.15 + problems],
    ['spa', problems < 0.6 ? 0.8 : 0.25],
  ])
}

function feetPlan(seed: number, disaster: boolean): TreatmentPlan {
  const r = makeRng((seed ^ 0x6f00e7) >>> 0)
  const p = footProfile(seed, disaster)
  const variant = footVariantFor(p, disaster, r)
  const fungal = p.fungus.some(f => f > 0)
  const long = p.grown.some(g => g >= 4)
  const sore = p.corns.length > 0 || p.ingrown !== 0
  // Disaster feet: the first scrub only loosens the grime; a second one clears it, and the heels need smoothing.
  const scrubTop = variant === 'spa' ? P.salt : P.scrub
  const firstScrub = disaster ? { ...scrubTop, clears: [scrubTop.layer!] } : scrubTop
  const secondScrub: StepDef[] = disaster ? [{ ...P.scrub, id: 'scrub2', label: 'Scrub again', hint: 'Ground-in grime: one more round of lather' }] : []
  const scrubSole = variant === 'spa' ? P.saltSole : P.scrubSole
  const heels = disaster ? [P.smooth] : []
  // The sole: scrub, then the rasp and the splinters in either order, then the balm.
  const soleWork = variant === 'clinic'
    ? shuffled(r, [[P.rasp, ...heels], ...(p.splinters.length ? [[P.splinter, P.plasterSole]] : [])])
    : [...(p.calluses > 0.05 || disaster ? [P.rasp, ...heels] : [])]
  const soleBlock = [scrubSole, ...soleWork, ...(variant === 'spa' ? [] : [P.creamSole])]
  // The toenails: old polish off, clip, file, then the cuticles (before or after the nails).
  const nails = [...(p.polish ? [P.remove] : []), ...(long || disaster ? [P.clip] : []), ...(variant === 'spa' && !long ? [] : [P.file]), ...(fungal ? [P.fungusFile] : [])]
  let topBlock: StepDef[]
  let finish: StepDef[]
  if (variant === 'clinic') {
    const fixes = shuffled(r, [...(p.corns.length ? [[P.corn]] : []), ...(p.ingrown ? [[P.ingrown]] : []), ...(fungal ? [[P.fungusCream]] : [])])
    topBlock = [...shuffled(r, [nails, [P.cuticles]]), ...fixes, P.antiseptic, ...(sore ? [P.plaster] : [])]
    finish = [P.mask, P.peel]
  } else if (variant === 'spa') {
    topBlock = nails
    finish = [P.mask, P.towel, P.peel, P.massage, P.color, P.top]
  } else {
    topBlock = shuffled(r, [nails, [P.cuticles]])
    // Most want a colour; nearly everyone who came in with old polish does.
    const colour = r.chance(p.polish ? 0.85 : 0.6)
    finish = [P.cream, ...(colour ? [P.color] : [])]
  }
  // The foot turns over for the sole: straight after the scrub, or after the toenails.
  const soleFirst = r.chance(0.6)
  const middle = soleFirst ? [...soleBlock, ...topBlock] : [...topBlock, ...soleBlock]
  const steps = [P.bath, firstScrub, ...secondScrub, ...middle, ...finish]
  const v = FOOT_VARIANTS[variant]
  return { def: { ...FEET, name: v.label, basePrice: Math.round(FEET.basePrice * v.price), parSeconds: v.par, steps }, mask: null, polish: null, extras: [], variant }
}

const cache = new Map<string, TreatmentPlan>()

/** This customer's treatment. */
export function planTreatment(treatment: TreatmentId, seed: number, disaster: boolean): TreatmentPlan {
  const key = `${treatment}:${seed}:${disaster ? 1 : 0}`
  let plan = cache.get(key)
  if (!plan) {
    // A treatment without its own planner (a new family) runs its data as written.
    plan = treatment === 'facial' ? facialPlan(seed, disaster) : treatment === 'nails' ? nailsPlan(seed, disaster) : treatment === 'feet' ? feetPlan(seed, disaster) : { def: TREATMENTS[treatment], mask: null, polish: null, extras: [] }
    if (cache.size > 300) cache.clear()
    cache.set(key, plan)
  }
  return plan
}

/** How many steps this customer's treatment has (the floor's progress ring counts them). */
export function stepCount(treatment: TreatmentId, seed: number, disaster: boolean) {
  return planTreatment(treatment, seed, disaster).def.steps.length
}
