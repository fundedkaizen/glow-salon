import { ARCHETYPES_DATA } from '../content/archetypes.ts'
import { REGULARS_DATA } from '../content/regulars.ts'
import type { Gender } from './names.ts'
import { makeRng, type Rng } from './rng.ts'
import type { TreatmentId } from './treatments/types.ts'

/**
 * Who a customer is, beyond their look: their archetype (student, grandma, athlete...), the voice their
 * review is written in, one or two personality traits, and for named regulars their story. All of it comes
 * from the customer's seed, so the host and every guest agree without sending it, and a day replays the same.
 */
export type Archetype = (typeof ARCHETYPES_DATA.archetypes)[number]
export type Trait = (typeof ARCHETYPES_DATA.traits)[number]
export type StoryRegular = (typeof REGULARS_DATA.regulars)[number]

export type Persona = {
  archetype: string
  label: string
  voice: string
  /** 1 tight to 5 lavish. */
  budget: number
  traits: string[]
  /** A named regular with story beats, when this is one. */
  story: StoryRegular | null
}

export const ARCHETYPES: readonly Archetype[] = ARCHETYPES_DATA.archetypes
export const ARCHETYPE_BY_ID: Record<string, Archetype> = Object.fromEntries(ARCHETYPES.map(a => [a.id, a]))
export const TRAITS: readonly Trait[] = ARCHETYPES_DATA.traits
export const STORY_REGULARS: readonly StoryRegular[] = REGULARS_DATA.regulars
const STORY_BY_ID: Record<string, StoryRegular> = Object.fromEntries(STORY_REGULARS.map(r => [r.id, r]))

/** Which content families each bookable treatment covers (a regular who loves "hands" books nails). */
export const FAMILIES_OF: Record<TreatmentId, string[]> = { facial: ['facial'], nails: ['nails', 'hands'], feet: ['feet'] }

/** The bookable treatment for a content family, or null when the salon cannot do it yet. */
export function treatmentForFamily(family: string): TreatmentId | null {
  for (const [t, fams] of Object.entries(FAMILIES_OF)) if (fams.includes(family)) return t as TreatmentId
  return null
}

export type AgeGroup = 'young' | 'adult' | 'older'

/**
 * Who an archetype is on the outside: a fixed gender where the archetype names one (grandma, grandpa,
 * businessman, bride-to-be), and the ages that fit it. Everyone else is anyone.
 */
const PEOPLE: Record<string, { gender?: Gender; ages: AgeGroup[] }> = {
  student: { ages: ['young'] }, teen: { ages: ['young'] }, grandma: { gender: 'female', ages: ['older'] }, grandpa: { gender: 'male', ages: ['older'] },
  bride: { gender: 'female', ages: ['adult'] }, businessman: { gender: 'male', ages: ['adult', 'adult', 'older'] }, gamer: { ages: ['young', 'adult'] },
  streamer: { ages: ['young', 'adult'] }, influencer: { ages: ['young', 'adult'] }, model: { ages: ['young', 'adult'] }, dancer: { ages: ['young', 'adult'] },
  surfer: { ages: ['young', 'adult'] }, farmer: { ages: ['adult', 'older'] }, gardener: { ages: ['adult', 'older', 'older'] }, royal: { ages: ['adult', 'older'] },
  lawyer: { ages: ['adult', 'adult', 'older'] }, teacher: { ages: ['adult', 'adult', 'older'] }, baker: { ages: ['adult', 'older'] }, pilot: { ages: ['adult'] },
  'toddler-parent': { ages: ['adult'] },
}

/** The gender and age of a customer of this archetype. */
export function peopleFor(archetype: string, r: Rng): { gender: Gender; age: AgeGroup } {
  const p = PEOPLE[archetype] ?? { ages: ['adult', 'adult', 'young', 'older'] as AgeGroup[] }
  return { gender: p.gender ?? (r.chance(0.62) ? 'female' : 'male'), age: r.pick(p.ages) }
}

/** The gender a named regular has (from their archetype, or their name when the archetype says nothing). */
export function regularPeople(story: StoryRegular): { gender: Gender; age: AgeGroup } {
  const p = PEOPLE[story.archetype]
  const r = makeRng(hashId(story.id))
  const byName: Gender | null = /^(Old |Mr |Sir )/.test(story.name) || MALE_REGULARS.has(story.id) ? 'male' : null
  return { gender: p?.gender ?? byName ?? 'female', age: p ? r.pick(p.ages) : 'adult' }
}
const MALE_REGULARS = new Set(['leo', 'gus', 'kai', 'tomas', 'rex', 'dev', 'otto', 'ivan', 'sol', 'bruno', 'pip', 'finn', 'ahmed', 'zane', 'marco'])
function hashId(id: string) { let h = 2166136261; for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619) } return h >>> 0 }

/**
 * An archetype for a new customer: the ones a campaign reaches half the time, otherwise those the salon's
 * rating has opened, weighted towards people who love this treatment (and VIPs twice as often with the
 * Luxe Gold set).
 */
export function pickArchetype(r: Rng, treatment: TreatmentId, opts: { rating: number; bias?: readonly string[]; vip?: boolean }): Archetype {
  if (opts.bias?.length && r.chance(0.5)) { const a = ARCHETYPE_BY_ID[r.pick(opts.bias)]; if (a) return a }
  const families = FAMILIES_OF[treatment]
  const open = ARCHETYPES.filter(a => a.unlock <= Math.floor(opts.rating))
  const weighted: Archetype[] = []
  for (const a of open) {
    let w = (a.favourites as readonly string[]).some(f => families.includes(f)) ? 3 : 1
    if (opts.vip && a.budget >= 5) w *= 2
    for (let i = 0; i < w; i++) weighted.push(a)
  }
  return r.pick(weighted.length ? weighted : ARCHETYPES.slice(0, 1))
}

export function personaFor(plan: { seed: number; regular: string | null; treatment: TreatmentId; archetype?: string }, opts: { rating: number; bias?: readonly string[] } = { rating: 0 }): Persona {
  const r = makeRng((plan.seed ^ 0x51f0a3) >>> 0)
  const story = plan.regular ? STORY_BY_ID[plan.regular] ?? null : null
  let archetype: Archetype | undefined
  if (story) archetype = ARCHETYPE_BY_ID[story.archetype]
  else if (plan.archetype) archetype = ARCHETYPE_BY_ID[plan.archetype]
  // Older plans (and the title screen's demo) have no archetype yet: pick one from the seed as before.
  if (!archetype && opts.bias?.length && r.chance(0.5)) archetype = ARCHETYPE_BY_ID[r.pick(opts.bias)]
  if (!archetype) archetype = pickArchetype(r, plan.treatment, { rating: opts.rating })
  const traits: string[] = [r.pick(TRAITS).id]
  if (r.chance(0.4)) { const second = r.pick(TRAITS).id; if (second !== traits[0]) traits.push(second) }
  // A dramatic personality writes dramatically, whatever their job.
  const voice = traits.includes('dramatic') && archetype.voice !== 'dramatic' && r.chance(0.5) ? 'dramatic' : archetype.voice
  return { archetype: archetype.id, label: archetype.label, voice, budget: archetype.budget, traits, story }
}

/** The line a regular says at this friendship level (0 on the first visit, up to 4). */
export function storyBeat(story: StoryRegular, friendship: number): string {
  return story.beats[Math.max(0, Math.min(story.beats.length - 1, friendship))]
}
