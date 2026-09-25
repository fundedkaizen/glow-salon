import { ARCHETYPES_DATA } from '../content/archetypes.ts'
import { REGULARS_DATA } from '../content/regulars.ts'
import { makeRng } from './rng.ts'
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

/** The treatment family each treatment belongs to, as the content names them. */
export const FAMILY: Record<TreatmentId, string> = { facial: 'facial', nails: 'nails' }

/** Regulars in the game's own list who are not in the story content yet still get a fitting archetype. */
const REGULAR_ARCHETYPE: Record<string, string> = { jonah: 'student', theo: 'gamer', luna: 'dancer' }

export function personaFor(plan: { seed: number; regular: string | null; treatment: TreatmentId }, opts: { rating: number; bias?: readonly string[] } = { rating: 0 }): Persona {
  const r = makeRng((plan.seed ^ 0x51f0a3) >>> 0)
  const story = plan.regular ? STORY_BY_ID[plan.regular] ?? null : null
  let archetype: Archetype | undefined
  if (story) archetype = ARCHETYPE_BY_ID[story.archetype]
  else if (plan.regular && REGULAR_ARCHETYPE[plan.regular]) archetype = ARCHETYPE_BY_ID[REGULAR_ARCHETYPE[plan.regular]]
  if (!archetype && opts.bias?.length && r.chance(0.5)) archetype = ARCHETYPE_BY_ID[r.pick(opts.bias)]
  if (!archetype) {
    // Archetypes open up as the salon's rating grows; those who love this treatment come more often.
    const family = FAMILY[plan.treatment]
    const open = ARCHETYPES.filter(a => a.unlock <= Math.floor(opts.rating))
    const weighted: Archetype[] = []
    for (const a of open) for (let i = 0; i < ((a.favourites as readonly string[]).includes(family) ? 3 : 1); i++) weighted.push(a)
    archetype = r.pick(weighted.length ? weighted : ARCHETYPES.slice(0, 1))
  }
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
