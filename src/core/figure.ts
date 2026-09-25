import { makeRng } from './rng.ts'

/**
 * Who a customer looks like beyond their colours: masculine or not, and how old. It comes from the name and
 * the archetype (a grandpa is an older man; a bride is not), so the floor sprite, the close-up and the
 * reviews agree. Pure and deterministic.
 */
export type Figure = { masc: boolean; age: number }

const MASC = new Set(['noah', 'leo', 'kai', 'omar', 'ezra', 'finn', 'milo', 'rafi', 'owen', 'luca', 'dev', 'jonah', 'theo', 'amir', 'arlo', 'ben',
  'chen', 'diego', 'eddie', 'eli', 'emil', 'enzo', 'felix', 'gil', 'hugo', 'jai', 'karim', 'lior', 'malik', 'mateo', 'nico', 'rafa', 'teo', 'vik',
  'yosef', 'zeno', 'gus', 'tomas', 'rex', 'otto', 'ivan', 'bruno', 'ahmed', 'zane', 'sol', 'pip'])
const ARCH_MASC: Record<string, boolean> = { grandpa: true, businessman: true, wrestler: true, grandma: false, bride: false }
const ARCH_AGE: Record<string, number> = { grandma: 0.95, grandpa: 0.95, teen: 0.1, student: 0.2, 'toddler-parent': 0.4, royal: 0.6, lawyer: 0.5, teacher: 0.5, gardener: 0.6, farmer: 0.55, pilot: 0.5 }

export function figureOf(name: string, archetype: string | null | undefined, seed: number): Figure {
  const r = makeRng(seed ^ 0x5eed)
  const first = name.replace(/^(Nonna|Old|Aunt|Uncle|Grandpa|Grandma)\s+/i, '').split(/[\s.]/)[0].toLowerCase()
  const titled = /^(Old|Uncle|Grandpa)\s/i.test(name) ? true : /^(Nonna|Aunt|Grandma)\s/i.test(name) ? false : undefined
  const masc = (archetype && archetype in ARCH_MASC ? ARCH_MASC[archetype] : undefined) ?? titled ?? MASC.has(first)
  const oldName = /^(Nonna|Old|Grandpa|Grandma)\s/i.test(name)
  const age = oldName ? 0.95 : archetype && archetype in ARCH_AGE ? ARCH_AGE[archetype] : r.range(0.2, 0.6)
  return { masc, age }
}

/** A look with its figure filled in (the floor sprite and the close-up both draw from it). */
export function withFigure<L extends { figure?: Figure }>(look: L, name: string, archetype: string | null | undefined, seed: number): L {
  return look.figure ? look : { ...look, figure: figureOf(name, archetype, seed) }
}

/**
 * The figure the art draws for a look: the look's gender always wins over a stale or missing figure, so a man
 * is never drawn with lashes and a bow, and a woman never with stubble.
 */
export function lookFigure(look: { figure?: Figure; gender?: 'female' | 'male'; age?: 'young' | 'adult' | 'older' }): Figure {
  const f = look.figure
  if (!f) return { masc: look.gender === 'male', age: look.age === 'young' ? 0.18 : look.age === 'older' ? 0.92 : look.age ? 0.42 : 0.35 }
  return look.gender ? { ...f, masc: look.gender === 'male' } : f
}

/** Grey hair from here up. */
export const SENIOR_AGE = 0.8
