import { PEOPLE_DATA } from '../content/people.ts'
import { pickFirstName, type Gender } from './names.ts'
import { peopleFor, pickArchetype, regularPeople, STORY_REGULARS, treatmentForFamily, type AgeGroup, type StoryRegular } from './persona.ts'
import { hashString, makeRng, type Rng } from './rng.ts'
import type { TreatmentId } from './treatments/types.ts'
import { POLISH_COLORS } from './treatments/types.ts'

export type { Gender } from './names.ts'
export type { AgeGroup } from './persona.ts'

/**
 * How a customer looks: indexes into the art's palettes, so the art decides the actual colours, plus who
 * they are on the outside (gender and age group), which the art uses for its masculine and older variants.
 */
export type Look = {
  skin: number
  hair: number
  hairStyle: number
  outfit: number
  /** A headband, a clip, glasses...: 0 is none. */
  accessory: number
  freckles: boolean
  /** 'female' or 'male'. Every customer, regular and staff member has it (art-only looks may leave it out). */
  gender?: Gender
  /** 'young' (teens, students), 'adult' or 'older' (grandparents). Set with gender. */
  age?: AgeGroup
  /**
   * The same, as the art reads it: masculine or not, and age from 0 to 1 (see core/figure.ts). Looks made
   * here carry it (from gender and age); withFigure fills it from the name for older looks.
   */
  figure?: import('./figure.ts').Figure
}

export const LOOK_SIZES = { skin: 6, hair: 8, hairStyle: 6, outfit: 8, accessory: 4 }

const AGES: readonly AgeGroup[] = ['young', 'adult', 'older']
/** A look from an older save or message: fill in who they are when it is missing. */
export function withLookDefaults(look: Look): Look {
  const gender: Gender = look.gender === 'male' ? 'male' : 'female'
  const age: AgeGroup = AGES.includes(look.age as AgeGroup) ? (look.age as AgeGroup) : 'adult'
  return { ...look, gender, age, figure: look.figure ?? figureFor(gender, age) }
}

/**
 * A random look. The first draws are the same as before gender and age existed, so a seed keeps its
 * colours; gender and age come last (or from the caller, who knows the archetype).
 */
export function randomLook(r: Rng, who: { gender?: Gender; age?: AgeGroup } = {}): Look {
  const look = { skin: r.int(0, LOOK_SIZES.skin - 1), hair: r.int(0, LOOK_SIZES.hair - 1), hairStyle: r.int(0, LOOK_SIZES.hairStyle - 1), outfit: r.int(0, LOOK_SIZES.outfit - 1), accessory: r.chance(0.5) ? r.int(1, LOOK_SIZES.accessory - 1) : 0, freckles: r.chance(0.2) }
  const gender = who.gender ?? (r.chance(0.62) ? 'female' : 'male')
  const age = who.age ?? r.pick(['young', 'adult', 'adult', 'older'] as const)
  return { ...look, gender, age, figure: figureFor(gender, age, r()) }
}

/** The art's figure for a gender and age group: young 0.1 to 0.25, adult 0.3 to 0.6, older 0.85 to 1. */
export function figureFor(gender: Gender, age: AgeGroup, k = 0.5): import('./figure.ts').Figure {
  const [lo, hi] = age === 'young' ? [0.1, 0.25] : age === 'older' ? [0.85, 1] : [0.3, 0.6]
  return { masc: gender === 'male', age: Math.round((lo + (hi - lo) * k) * 100) / 100 }
}

/** A named regular from the story content: always the same look. */
export function regularLook(story: StoryRegular): Look {
  return randomLook(makeRng(hashString(`regular:${story.id}`)), regularPeople(story))
}

/** Regulars who can book a treatment the salon offers, by id. */
export function bookableRegulars(treatments: readonly TreatmentId[]): StoryRegular[] {
  return STORY_REGULARS.filter(g => { const t = treatmentForFamily(g.favourite); return !!t && treatments.includes(t) })
}

export type CustomerPlan = {
  name: string
  look: Look
  treatment: TreatmentId
  /** Extreme grime, extra steps, bigger pay. */
  disaster: boolean
  regular: string | null
  /** The archetype (student, grandma...), chosen with the name and look so they agree. */
  archetype?: string
  /** A polish colour they want (nails). */
  wish: number
  seed: number
  /** Seconds after opening that they walk in. */
  arriveAt: number
}

export type PlanOptions = {
  day: number
  seed: number
  count: number
  treatments: TreatmentId[]
  met: readonly string[]
  /** The salon's rating this morning: archetypes and new regulars open up with it. */
  rating?: number
  /** Archetypes today's campaigns reach. */
  bias?: readonly string[]
  /** First names used this week: nobody new shares one. */
  avoidNames?: readonly string[]
  /** Chance per customer that a met regular comes back (loyalty cards and the Retro Diner set raise it). */
  regularChance?: number
  /** VIPs come twice as often (Luxe Gold). */
  vip?: boolean
}

/** Share of customers who come in as a disaster case (not the very first customer of the game). */
export const DISASTER_CHANCE = 0.15

/**
 * The day's customers: who comes, for what, and when. Every customer's archetype, gender, age, first name
 * and look agree; a first name is never reused within a week; regulars you have met come back, and new
 * ones appear as the rating grows. Only treatments that have a station can be booked.
 */
export function planDay(options: PlanOptions): CustomerPlan[] {
  const r = makeRng(options.seed ^ (options.day * 7919))
  const plans: CustomerPlan[] = []
  const usedRegulars = new Set<string>()
  const avoid = new Set(options.avoidNames ?? [])
  const treatments = options.treatments.length ? options.treatments : (['facial'] as TreatmentId[])
  const rating = options.rating ?? 0
  const regulars = bookableRegulars(treatments)
  for (let i = 0; i < options.count; i++) {
    const treatment = treatments.length > 1 && i === 1 ? treatments[1] : r.pick(treatments)
    const disaster = !(options.day === 1 && i === 0) && r.chance(DISASTER_CHANCE)
    let regular: StoryRegular | null = null
    if (i > 0 || options.day > 1) {
      if (r.chance(options.regularChance ?? 0.3)) {
        const pool = regulars.filter(g => options.met.includes(g.id) && !usedRegulars.has(g.id))
        if (pool.length) regular = r.pick(pool)
      } else if (r.chance(0.14)) {
        const pool = regulars.filter(g => !options.met.includes(g.id) && !usedRegulars.has(g.id) && g.arrives <= Math.floor(rating))
        if (pool.length) regular = r.pick(pool)
      }
    }
    if (regular) usedRegulars.add(regular.id)
    const seed = r.seed()
    const wish = r.int(0, POLISH_COLORS.length - 1)
    const arriveAt = i === 0 ? 2 : 2 + i * r.range(34, 48)
    if (regular) {
      plans.push({ name: regular.name, look: regularLook(regular), treatment: treatmentForFamily(regular.favourite) ?? treatment, disaster: false, regular: regular.id, archetype: regular.archetype, wish, seed, arriveAt })
      continue
    }
    // Who walks in: an archetype, then a gender and age that fit it, a name for them, and their look.
    const pr = makeRng((seed ^ 0x9e37) >>> 0)
    const archetype = pickArchetype(pr, treatment, { rating, bias: options.bias, vip: options.vip })
    const who = peopleFor(archetype.id, pr)
    const first = pickFirstName(pr, who.gender, who.age === 'older', avoid)
    avoid.add(first)
    plans.push({ name: `${first} ${pr.pick(PEOPLE_DATA.lastInitials)}`, look: randomLook(pr, who), treatment, disaster, regular: null, archetype: archetype.id, wish, seed, arriveAt })
  }
  return plans
}

/** The first name of a customer's display name ("Ada K." is Ada). */
export const firstNameOf = (name: string) => name.split(' ')[0]
