import { makeRng, type Rng } from './rng.ts'
import type { TreatmentId } from './treatments/types.ts'
import { POLISH_COLORS } from './treatments/types.ts'

/** How a customer looks: indexes into the art's palettes, so the art decides the actual colours. */
export type Look = {
  skin: number
  hair: number
  hairStyle: number
  outfit: number
  /** A headband, a clip, glasses...: 0 is none. */
  accessory: number
  freckles: boolean
}

export const LOOK_SIZES = { skin: 6, hair: 8, hairStyle: 6, outfit: 8, accessory: 4 }

export type Regular = { id: string; name: string; look: Look; favourite: TreatmentId }

/** Named regulars who come back, with their own looks. */
export const REGULARS: Regular[] = [
  { id: 'mira', name: 'Mira', look: { skin: 1, hair: 6, hairStyle: 0, outfit: 2, accessory: 1, freckles: true }, favourite: 'facial' },
  { id: 'jonah', name: 'Jonah', look: { skin: 3, hair: 1, hairStyle: 4, outfit: 5, accessory: 0, freckles: false }, favourite: 'facial' },
  { id: 'rosa', name: 'Aunt Rosa', look: { skin: 2, hair: 7, hairStyle: 3, outfit: 0, accessory: 3, freckles: false }, favourite: 'nails' },
  { id: 'priya', name: 'Priya', look: { skin: 4, hair: 0, hairStyle: 1, outfit: 3, accessory: 2, freckles: false }, favourite: 'nails' },
  { id: 'theo', name: 'Theo', look: { skin: 0, hair: 3, hairStyle: 5, outfit: 6, accessory: 0, freckles: true }, favourite: 'facial' },
  { id: 'luna', name: 'Luna', look: { skin: 5, hair: 5, hairStyle: 2, outfit: 7, accessory: 1, freckles: false }, favourite: 'nails' },
]

const FIRST = ['Ava', 'Noah', 'Chloe', 'Leo', 'Isla', 'Kai', 'Zoe', 'Omar', 'Lily', 'Ezra', 'Maya', 'Finn', 'Nora', 'Sami', 'Ruby', 'Ivy', 'Hana', 'Milo', 'Jade', 'Ellie', 'Rafi', 'Tess', 'Yara', 'Owen', 'Bea', 'Luca', 'Nina', 'Cleo', 'Aria', 'Dev']
const LAST = 'ABCDEFGHJKLMNPRSTVWZ'

export type CustomerPlan = {
  name: string
  look: Look
  treatment: TreatmentId
  /** Extreme grime, bigger pay. */
  disaster: boolean
  regular: string | null
  /** A polish colour they want (nails). */
  wish: number
  seed: number
  /** Seconds after opening that they walk in. */
  arriveAt: number
}

export function randomLook(r: Rng): Look {
  return { skin: r.int(0, LOOK_SIZES.skin - 1), hair: r.int(0, LOOK_SIZES.hair - 1), hairStyle: r.int(0, LOOK_SIZES.hairStyle - 1), outfit: r.int(0, LOOK_SIZES.outfit - 1), accessory: r.chance(0.5) ? r.int(1, LOOK_SIZES.accessory - 1) : 0, freckles: r.chance(0.2) }
}

/**
 * The day's customers: who comes, for what, and when. Disaster cases start on day 2; regulars you have met
 * come back. Only treatments that have a station can be booked.
 */
export function planDay(options: { day: number; seed: number; count: number; treatments: TreatmentId[]; met: readonly string[] }): CustomerPlan[] {
  const r = makeRng(options.seed ^ (options.day * 7919))
  const plans: CustomerPlan[] = []
  const usedRegulars = new Set<string>()
  const treatments = options.treatments.length ? options.treatments : (['facial'] as TreatmentId[])
  for (let i = 0; i < options.count; i++) {
    const treatment = treatments.length > 1 && i === 1 ? treatments[1] : r.pick(treatments)
    const disaster = options.day >= 2 && i > 0 && r.chance(0.16)
    let regular: Regular | null = null
    // Day 1 always brings Mira, so the first review has a friendly face.
    if (options.day === 1 && i === 0) regular = REGULARS[0]
    else if (r.chance(0.3)) {
      const pool = REGULARS.filter(g => options.met.includes(g.id) && !usedRegulars.has(g.id) && treatments.includes(g.favourite))
      if (pool.length) regular = r.pick(pool)
    } else if (r.chance(0.12)) {
      const pool = REGULARS.filter(g => !options.met.includes(g.id) && !usedRegulars.has(g.id) && treatments.includes(g.favourite))
      if (pool.length) regular = r.pick(pool)
    }
    if (regular) usedRegulars.add(regular.id)
    plans.push({
      name: regular ? regular.name : `${r.pick(FIRST)} ${r.pick([...LAST])}.`,
      look: regular ? regular.look : randomLook(r),
      treatment: regular && treatments.includes(regular.favourite) ? regular.favourite : treatment,
      disaster: disaster && !regular,
      regular: regular?.id ?? null,
      wish: r.int(0, POLISH_COLORS.length - 1),
      seed: r.seed(),
      arriveAt: i === 0 ? 2 : 2 + i * r.range(34, 48),
    })
  }
  return plans
}
