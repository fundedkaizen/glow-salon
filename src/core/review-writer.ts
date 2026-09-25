import { REVIEWS_DATA } from '../content/reviews.ts'
import type { Look } from './customers.ts'
import type { Review } from './reviews.ts'
import { speedScore } from './reviews.ts'
import { makeRng, type Rng } from './rng.ts'
import type { TreatmentResult } from './treatments/session.ts'

/**
 * Google-style reviews written from the review grammar (content/reviews.ts): an opener in the customer's
 * voice, one or two remarks chosen by the stars, extras for what actually happened (a disaster turned
 * around, the salon cat, four hands, a quick visit, the decor, the price), and a closer. Lines used
 * recently are avoided, so the reviews stay fresh day after day. Each review also carries the category
 * tags it supports ("Great for nails"), which add up to the salon's tag chips.
 */
export type ReviewExtra = keyof typeof REVIEWS_DATA.extras

export type GoogleReview = Review & {
  voice: string
  archetype: string
  look: Look | null
  /** Category tags this review supports. */
  tags: string[]
  /** Who treated them (a player or a staff member). */
  staff: string
}

export type ReviewInput = {
  id: string
  day: number
  name: string
  stars: number
  result: TreatmentResult
  mood: number
  regular: boolean
  disaster: boolean
  ambience: number
  seed: number
  voice: string
  archetype: string
  budget: number
  price: number
  look: Look | null
  salon: string
  staff: string
  /** The salon cat was petted today (customers notice a happy cat). */
  cat: boolean
  /** Lines used recently; picked lines are appended (the caller keeps the list short). */
  recent: string[]
}

const WORDS: Record<string, { treatment: string; part: string }> = {
  facial: { treatment: 'facial', part: 'skin' },
  nails: { treatment: 'manicure', part: 'nails' },
}

/** The category tags, in the order they are preferred when counts tie. */
export const TAGS = {
  facial: 'Great for facials',
  nails: 'Great for nails',
  relaxing: 'Relaxing',
  friendly: 'Friendly staff',
  cat: 'Cat lovers’ spot',
  decor: 'Gorgeous decor',
  fast: 'Quick service',
  disaster: 'Miracle workers',
  value: 'Great value',
  pricey: 'A bit pricey',
  regulars: 'Loyal regulars',
} as const

function fresh(r: Rng, lines: readonly string[], recent: string[]): string {
  const unused = lines.filter(l => !recent.includes(l))
  const line = r.pick(unused.length ? unused : lines)
  recent.push(line)
  return line
}

function fill(text: string, input: ReviewInput) {
  const w = WORDS[input.result.treatment] ?? { treatment: 'treatment', part: 'skin' }
  return text.replace(/\{salon\}/g, input.salon).replace(/\{staff\}/g, input.staff).replace(/\{treatment\}/g, w.treatment).replace(/\{part\}/g, w.part)
}

/** Lower-case the first letter after an opener that runs on ("ok so", "Oh my dear,"), unless it is "I" or a name. */
function runOn(sentence: string, names: string[]) {
  if (/^I\b|^I'/.test(sentence) || names.some(n => n && sentence.startsWith(n))) return sentence
  return sentence.charAt(0).toLowerCase() + sentence.slice(1)
}

export function writeGoogleReview(input: ReviewInput): GoogleReview {
  const r = makeRng((input.seed ^ 0x2e11) >>> 0)
  const g = REVIEWS_DATA
  const voice = (input.voice in g.openers ? input.voice : 'polite') as keyof typeof g.openers
  const stars = Math.max(1, Math.min(5, Math.round(input.stars)))
  const bucket = String(Math.max(2, stars)) as keyof typeof g.remarks
  const { result } = input
  const speed = speedScore(result.seconds, result.par)
  const tags: string[] = []

  const opener = fill(fresh(r, g.openers[voice], input.recent), input)
  const remarks: string[] = [fill(fresh(r, g.remarks[bucket], input.recent), input)]
  if (stars >= 5 && result.thoroughness >= 0.9 && r.chance(0.45)) remarks.push(fill(fresh(r, g.remarks[bucket], input.recent), input))

  // Extras: what actually happened, most notable first, at most two.
  const extras: ReviewExtra[] = []
  if (input.disaster && stars >= 3) extras.push('disaster')
  if (result.fourHands) extras.push('four-hands')
  if (input.regular && stars >= 4) extras.push('regular')
  if (input.cat && r.chance(0.7)) extras.push('cat')
  if (speed >= 1 && input.mood > 0.8 && stars >= 4) extras.push('fast')
  if (input.ambience >= 3 && r.chance(0.55)) extras.push('decor')
  // The price against what this customer is used to spending.
  const expected = 18 + input.budget * 9
  if (input.price > expected * 1.5 && r.chance(0.6)) extras.push('pricey')
  else if (input.price < expected * 0.95 && stars >= 4 && r.chance(0.5)) extras.push('bargain')
  if (!extras.length && r.chance(0.3)) extras.push(r.chance(0.5) ? 'music' : 'decor')
  const chosen = extras.slice(0, 2)
  const extraLines = chosen.map(e => fill(fresh(r, g.extras[e], input.recent), input))
  const closer = fill(fresh(r, g.closers[voice], input.recent), input)

  const names = [input.staff, input.salon]
  const runsOn = !/[.!?]$/.test(opener)
  const body = [runsOn ? runOn(remarks[0], names) : remarks[0], ...remarks.slice(1), ...extraLines]
  let text = `${opener} ${body.join(' ')} ${closer}`
  if (voice === 'loud') text = text.toUpperCase()
  const emoji = (g.emoji as Record<string, string[]>)[voice]
  if (emoji && stars >= 4 && r.chance(voice === 'dramatic' || voice === 'excited' ? 0.85 : 0.4)) {
    text += ' ' + r.pick(emoji) + (voice === 'dramatic' && r.chance(0.5) ? r.pick(emoji) : '')
  }
  if (input.recent.length > 40) input.recent.splice(0, input.recent.length - 40)

  // The categories this review speaks for.
  if (stars >= 4) tags.push(result.treatment === 'nails' ? TAGS.nails : TAGS.facial)
  if (stars >= 4 && (voice === 'sleepy' || voice === 'dreamy' || input.mood > 0.85)) tags.push(TAGS.relaxing)
  if (stars >= 4 && remarks.some(t => t.includes(input.staff))) tags.push(TAGS.friendly)
  for (const e of chosen) {
    if (e === 'cat') tags.push(TAGS.cat)
    else if (e === 'decor') tags.push(TAGS.decor)
    else if (e === 'fast') tags.push(TAGS.fast)
    else if (e === 'disaster') tags.push(TAGS.disaster)
    else if (e === 'bargain') tags.push(TAGS.value)
    else if (e === 'pricey') tags.push(TAGS.pricey)
    else if (e === 'regular') tags.push(TAGS.regulars)
  }

  return {
    id: input.id, day: input.day, name: input.name, stars, text, treatment: result.treatment, regular: input.regular, disaster: input.disaster,
    voice, archetype: input.archetype, look: input.look, tags: [...new Set(tags)], staff: input.staff,
  }
}

/** The salon's tag chips: the most supported categories across its reviews, with counts. */
export function salonTags(reviews: readonly Partial<GoogleReview>[], max = 5): { tag: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const rv of reviews) for (const t of rv.tags ?? []) counts.set(t, (counts.get(t) ?? 0) + 1)
  const order = Object.values(TAGS) as string[]
  return [...counts.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || order.indexOf(a.tag) - order.indexOf(b.tag)).slice(0, max)
}
