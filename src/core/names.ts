import { PEOPLE_DATA } from '../content/people.ts'
import type { Rng } from './rng.ts'

/**
 * First names by gender, from the content's name pool, so a customer's name fits their look and archetype
 * (a grandpa is never "Nonna Rosa", a bride is never "Karim"). Names that suit anyone go in both pools.
 * Older customers lean towards the classic names.
 */
export type Gender = 'female' | 'male'

const MASC = new Set(['Alex', 'Amir', 'Arlo', 'Ben', 'Chen', 'Diego', 'Eddie', 'Eli', 'Emil', 'Enzo', 'Ezra', 'Felix', 'Gil', 'Hugo', 'Jai', 'Jonah', 'Karim', 'Luca', 'Malik', 'Mateo', 'Milo', 'Nico', 'Omar', 'Rafa', 'Teo', 'Vik', 'Yosef', 'Zeno'])
const EITHER = new Set(['Bo', 'Dani', 'Kiko', 'Lior', 'Noa', 'Paz', 'Quinn', 'Remi', 'Rumi', 'Sami', 'Wren'])
const CLASSIC = new Set(['Olga', 'Vera', 'Rita', 'Nell', 'Mae', 'Flo', 'Effie', 'Nora', 'Ada', 'Ines', 'Lucia', 'Gil', 'Eddie', 'Hugo', 'Emil', 'Yosef', 'Felix', 'Omar', 'Karim'])

const ALL: readonly string[] = PEOPLE_DATA.firstNames
export const NAMES: Record<Gender, string[]> = {
  female: ALL.filter(n => !MASC.has(n)),
  male: ALL.filter(n => MASC.has(n) || EITHER.has(n)),
}

/** The gender a first name reads as, or null when it suits anyone. */
export function genderOfName(name: string): Gender | null {
  if (EITHER.has(name)) return null
  return MASC.has(name) ? 'male' : 'female'
}

/**
 * A first name for this gender and age that is not in `avoid` (names used this week). Falls back to a
 * repeat only when every name is taken.
 */
export function pickFirstName(r: Rng, gender: Gender, older: boolean, avoid: ReadonlySet<string>): string {
  const pool = NAMES[gender]
  const free = pool.filter(n => !avoid.has(n))
  const list = free.length ? free : pool
  if (older) {
    const classic = list.filter(n => CLASSIC.has(n))
    if (classic.length && r.chance(0.7)) return r.pick(classic)
  }
  return r.pick(list)
}
