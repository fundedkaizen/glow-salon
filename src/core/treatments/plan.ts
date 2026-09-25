import { makeRng, type Rng } from '../rng.ts'
import { FACIAL, FACIAL_STEPS as F } from './facial.ts'
import { NAILS, NAIL_STEPS as N, repairStep } from './nails.ts'
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
 * - Disaster cases get their extra steps (a second cleanse, extra repairs).
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

const cache = new Map<string, TreatmentPlan>()

/** This customer's treatment. */
export function planTreatment(treatment: TreatmentId, seed: number, disaster: boolean): TreatmentPlan {
  const key = `${treatment}:${seed}:${disaster ? 1 : 0}`
  let plan = cache.get(key)
  if (!plan) {
    // A treatment without its own planner (a new family) runs its data as written.
    plan = treatment === 'facial' ? facialPlan(seed, disaster) : treatment === 'nails' ? nailsPlan(seed, disaster) : { def: TREATMENTS[treatment], mask: null, polish: null, extras: [] }
    if (cache.size > 300) cache.clear()
    cache.set(key, plan)
  }
  return plan
}

/** How many steps this customer's treatment has (the floor's progress ring counts them). */
export function stepCount(treatment: TreatmentId, seed: number, disaster: boolean) {
  return planTreatment(treatment, seed, disaster).def.steps.length
}
