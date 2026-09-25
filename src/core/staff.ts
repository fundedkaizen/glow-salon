import { PEOPLE_DATA } from '../content/people.ts'
import { randomLook, type Look } from './customers.ts'
import { genderOfName } from './names.ts'
import { makeRng } from './rng.ts'
import type { TreatmentResult } from './treatments/session.ts'
import type { TreatmentId } from './treatments/types.ts'

/**
 * Staff: every week the salon computer shows three generated candidates (a name the players can change, a
 * look, one or two traits, a skill per treatment). Hired staff are assigned to a station and take whole
 * treatments there when no player does; they get better with practice, level up, take tea breaks on their
 * own and never quit. Pure data and rules; salon-ext.ts runs them inside the salon day.
 */
export type StaffTrait = (typeof PEOPLE_DATA.staffTraits)[number]
export const STAFF_TRAITS: readonly StaffTrait[] = PEOPLE_DATA.staffTraits
export const STAFF_TRAIT_BY_ID: Record<string, StaffTrait> = Object.fromEntries(STAFF_TRAITS.map(t => [t.id, t]))
/** Traits with nothing to act on in the salon yet (there are no spills to tidy): never rolled for new candidates. */
export const HIDDEN_TRAITS = new Set(['tidy'])
const ROLLED_TRAITS = STAFF_TRAITS.filter(t => !HIDDEN_TRAITS.has(t.id))
export const STAFF_LEVELS: readonly string[] = PEOPLE_DATA.staffLevels

export type Skills = Record<TreatmentId, number>

export type Candidate = { name: string; look: Look; traits: string[]; skills: Skills; wage: number; fee: number; seed: number }

export type StaffMember = {
  /** Staff act in the salon under ids from STAFF_ID_BASE up, so they never clash with players (0 to 3). */
  id: number
  name: string
  look: Look
  traits: string[]
  /** 1 to 5 stars per treatment. */
  skills: Skills
  level: number
  xp: number
  wage: number
  /** The station they work, or null (they help out at reception). */
  station: string | null
  /** 1 fresh to 0 needs tea. */
  energy: number
  /** Seconds left on a tea break. */
  breakLeft: number
  served: number
  /** The treatment in hand. */
  task: { station: string; t: number; dur: number } | null
}

export const STAFF_ID_BASE = 100
export const MAX_STAFF = 4
/** Seconds a seated customer waits for a player before the station's staff member starts. */
export const STAFF_GRACE = 6
export const DAYS_PER_WEEK = 7

export const weekOf = (day: number) => Math.floor((day - 1) / DAYS_PER_WEEK)

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** This week's three candidates: the same for every player, rebuilt from the salon seed and the week. */
export function candidatesFor(seed: number, week: number): Candidate[] {
  const r = makeRng((seed ^ Math.imul(week + 1, 0x9e3779b1)) >>> 0)
  const used = new Set<string>()
  const out: Candidate[] = []
  for (let i = 0; i < 3; i++) {
    let first = r.pick(PEOPLE_DATA.firstNames)
    while (used.has(first)) first = r.pick(PEOPLE_DATA.firstNames)
    used.add(first)
    const traits = [r.pick(ROLLED_TRAITS).id]
    if (r.chance(0.45)) { const t = r.pick(ROLLED_TRAITS).id; if (!traits.includes(t)) traits.push(t) }
    // One star skill, the other a little lower; later weeks bring slightly stronger people.
    const lift = Math.min(1, week * 0.15)
    // Each week: one specialist, one all-rounder and one in between, so the choice is a real one.
    const star = i === 1 ? (r.chance(0.5) ? 'facial' : 'nails') : r.chance(0.5) ? 'facial' : 'nails'
    const skills: Skills = { facial: 1, nails: 1, feet: 1 }
    const other = star === 'facial' ? 'nails' : 'facial'
    if (i === 0) { skills[star] = Math.min(5, 3 + (r.chance(0.2 + lift * 0.4) ? 1 : 0)); skills[other] = 1 }
    else if (i === 1) { skills[star] = 2 + (r.chance(0.2 + lift * 0.3) ? 1 : 0); skills[other] = 2 }
    else { skills[star] = 2 + (r.chance(0.35 + lift * 0.3) ? 1 : 0); skills[other] = r.chance(0.5) ? 2 : 1 }
    // Pedicures from their own stream, so the week's people stay who they were before feet arrived.
    const fr = makeRng((seed ^ Math.imul(week + 1, 0x51ed27) ^ Math.imul(i + 1, 0x2c1b3c6d)) >>> 0)
    skills.feet = fr.chance(0.3 + lift * 0.2) ? 3 + (fr.chance(0.15 + lift * 0.3) ? 1 : 0) : fr.int(1, 2)
    const total = skills.facial + skills.nails
    const wage = 10 + total * 5 + (skills.feet - 1) * 3 + (traits.includes('perfectionist') ? 3 : 0) + r.int(0, 3)
    const gender = genderOfName(first) ?? (r.chance(0.5) ? 'female' : 'male')
    out.push({ name: first, look: randomLook(r, { gender, age: r.chance(0.25) ? 'young' : 'adult' }), traits, skills, wage, fee: Math.round((wage * 4) / 5) * 5, seed: r.seed() })
  }
  return out
}

export function hire(c: Candidate, id: number): StaffMember {
  return { id, name: c.name, look: { ...c.look }, traits: [...c.traits], skills: { ...c.skills }, level: 1, xp: 0, wage: c.wage, station: null, energy: 1, breakLeft: 0, served: 0, task: null }
}

export function cleanStaffName(name: string) { return String(name ?? '').replace(/[<>&"]/g, '').trim().slice(0, 14) }

export const has = (s: Pick<StaffMember, 'traits'>, trait: string) => s.traits.includes(trait)

/** Treatments done to reach the next level. */
export const xpToLevel = (level: number) => 2 + level

/** Real seconds a staff member takes for a treatment: quicker with skill, slower for perfectionists. */
export function staffDuration(s: StaffMember, treatment: TreatmentId, clock: number): number {
  let d = 62 - 7 * (s.skills[treatment] ?? 1)
  if (has(s, 'perfectionist')) d *= 1.15
  if (has(s, 'night-owl') && clock > 150) d *= 0.85
  if (has(s, 'early-bird') && clock < 90) d *= 0.85
  return Math.round(d)
}

/** How a staff member's treatment went, from their skill and traits (players are always a little better). */
export function staffResult(s: StaffMember, treatment: TreatmentId, par: number, seed: number, customerTraits: readonly string[]): TreatmentResult {
  const r = makeRng(seed ^ 0x5eed)
  let thoroughness = 0.62 + 0.065 * s.skills[treatment] + r.range(-0.04, 0.04)
  if (has(s, 'perfectionist')) thoroughness += 0.05
  if (has(s, 'artist') && (treatment === 'nails' || treatment === 'feet')) thoroughness += 0.04
  if (has(s, 'gentle-hands') && customerTraits.some(t => t === 'nervous' || t === 'ticklish')) thoroughness += 0.04
  thoroughness = Math.max(0.5, Math.min(0.97, thoroughness))
  const seconds = Math.round(par * (1.25 - 0.08 * s.skills[treatment]))
  const popped = treatment === 'facial' ? r.int(2, 6) : 0
  return { treatment, seconds, par, required: 10, done: Math.floor(10 * thoroughness), skipped: 0, optionalDone: 0, popped, extracted: treatment === 'facial' ? r.int(4, 12) : 0, fourHands: false, wishMatched: treatment !== 'facial' ? r.chance(0.7) : null, disaster: false, thoroughness }
}

/** Practice: xp after a treatment, levels, and a skill step every other level. Returns true on a level up. */
export function gainXp(s: StaffMember, treatment: TreatmentId): boolean {
  s.xp += has(s, 'fast-learner') ? 1.5 : 1
  s.served++
  if (s.level >= STAFF_LEVELS.length || s.xp < xpToLevel(s.level)) return false
  s.xp -= xpToLevel(s.level)
  s.level++
  if (s.level % 2 === 0) s.skills[treatment] = Math.min(5, s.skills[treatment] + 1)
  s.wage += 3
  return true
}

/** Energy after a treatment, and a tea break when it runs low. */
export function tire(s: StaffMember) {
  s.energy = Math.max(0, s.energy - 0.28)
  if (s.energy < 0.3) s.breakLeft = has(s, 'tea-lover') ? 28 : 18
}

export function rest(s: StaffMember, dt: number, catNearby: boolean) {
  if (s.breakLeft > 0) {
    s.breakLeft = Math.max(0, s.breakLeft - dt)
    s.energy = Math.min(1, s.energy + dt * (has(s, 'tea-lover') ? 0.05 : 0.04) * (catNearby && has(s, 'cat-person') ? 1.5 : 1))
    if (s.breakLeft === 0) s.energy = Math.max(s.energy, has(s, 'tea-lover') ? 1 : 0.85)
  }
}

export const levelName = (level: number) => STAFF_LEVELS[Math.max(0, Math.min(STAFF_LEVELS.length - 1, level - 1))]
export const traitLabel = (id: string) => STAFF_TRAIT_BY_ID[id]?.label ?? cap(id)
