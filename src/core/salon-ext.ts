import type { CustomerPlan } from './customers.ts'
import { advanceCampaigns, campaignBias, campaignCustomers, canRunCampaign, CAMPAIGN_BY_ID, type ActiveCampaign } from './marketing.ts'
import { DECOR_ITEM_BY_ID } from './decor.ts'
import { CONFIRM_PRICE } from './economy.ts'
import { personaFor, type Persona } from './persona.ts'
import { writeGoogleReview, type GoogleReview } from './review-writer.ts'
import { MOOD_DRAIN_WAITING, reduce, type Customer, type SalonState } from './salon.ts'
import { candidatesFor, cleanStaffName, gainXp, hire, MAX_STAFF, rest, staffDuration, staffResult, STAFF_GRACE, STAFF_ID_BASE, tire, weekOf, type Candidate, type StaffMember } from './staff.ts'
import { TREATMENTS } from './treatments/registry.ts'
import type { TreatmentResult } from './treatments/session.ts'

/**
 * The salon's second half of state, saved with the first: staff, marketing campaigns, the regulars'
 * friendship, where decor is placed, the salon's and the cat's names, and today's small tallies. The core
 * salon calls in here at a few points (a new day, every tick, a finished treatment, closing time), so the
 * extra systems live in one place.
 */
export type ExtVote = { kind: 'hire' | 'campaign'; ref: string; label: string; by: number; yes: number[] }

export type SalonExt = {
  salonName: string
  catName: string
  staff: StaffMember[]
  /** Candidates hired this week (by index), so each can be hired once. */
  hired: number[]
  week: number
  campaigns: ActiveCampaign[]
  loyalty: boolean
  /** Regular id to friendship, 0 to 5. */
  friends: Record<string, number>
  /** Decor placement history, newest last. */
  decorOrder: string[]
  /** Review lines used lately, so reviews do not repeat. */
  recent: string[]
  /** The last day the day-start rules ran (so reloading a day does not run them twice). */
  lastDay: number
  today: { wages: number; pets: number; levelUps: string[]; bias: string[]; seatedAt: Record<string, number>; friendUps: { name: string; level: number; gift: string | null }[] }
  vote: ExtVote | null
}

export type ExtAction =
  | { a: 'hire'; idx: number }
  | { a: 'extVote'; yes: boolean }
  | { a: 'renameStaff'; id: number; name: string }
  | { a: 'assignStaff'; id: number; station: string | null }
  | { a: 'campaign'; id: string }
  | { a: 'petCat' }
  | { a: 'placeDecor'; id: string }
  | { a: 'renameSalon'; name: string }
  | { a: 'renameCat'; name: string }

export const DEFAULT_SALON_NAME = 'Glow Salon'
export const DEFAULT_CAT_NAME = 'Mochi'

const emptyToday = (): SalonExt['today'] => ({ wages: 0, pets: 0, levelUps: [], bias: [], seatedAt: {}, friendUps: [] })

export function newExt(): SalonExt {
  return { salonName: DEFAULT_SALON_NAME, catName: DEFAULT_CAT_NAME, staff: [], hired: [], week: -1, campaigns: [], loyalty: false, friends: {}, decorOrder: [], recent: [], lastDay: 0, today: emptyToday(), vote: null }
}

/** The ext of a state, created on first use (older saves have none). */
export function ext(state: { ext?: SalonExt }): SalonExt {
  return (state.ext ??= newExt())
}

/** Check and clean a loaded ext; a fresh one when it is missing or broken. */
export function validateExt(raw: unknown): SalonExt {
  const e = newExt()
  if (!raw || typeof raw !== 'object') return e
  const d = raw as Partial<SalonExt>
  const str = (v: unknown, fallback: string, max = 20) => (typeof v === 'string' && v.trim() ? v.replace(/[<>&"]/g, '').trim().slice(0, max) : fallback)
  e.salonName = str(d.salonName, DEFAULT_SALON_NAME)
  e.catName = str(d.catName, DEFAULT_CAT_NAME, 12)
  e.staff = Array.isArray(d.staff) ? d.staff.filter(s => s && typeof s.name === 'string' && Number.isInteger(s.id) && s.skills && s.look).slice(0, MAX_STAFF).map(s => ({ ...s, name: cleanStaffName(s.name) || 'Staff', task: null, breakLeft: 0, energy: 1 })) : []
  e.hired = Array.isArray(d.hired) ? d.hired.filter(n => Number.isInteger(n) && n >= 0 && n < 3) : []
  e.week = Number.isInteger(d.week) ? d.week! : -1
  e.campaigns = Array.isArray(d.campaigns) ? d.campaigns.filter(c => c && CAMPAIGN_BY_ID[c.id] && Number.isInteger(c.day) && c.day >= 0) : []
  e.loyalty = d.loyalty === true
  e.friends = d.friends && typeof d.friends === 'object' ? Object.fromEntries(Object.entries(d.friends).filter(([, v]) => typeof v === 'number').map(([k, v]) => [k, Math.max(0, Math.min(5, v))])) : {}
  e.decorOrder = Array.isArray(d.decorOrder) ? d.decorOrder.filter(id => typeof id === 'string' && DECOR_ITEM_BY_ID[id]).slice(-60) : []
  e.recent = Array.isArray(d.recent) ? d.recent.filter(l => typeof l === 'string').slice(-40) : []
  e.lastDay = Number.isInteger(d.lastDay) ? d.lastDay! : 0
  return e
}

/** A save-ready copy: today's tallies and any vote are left behind. */
export function saveExt(e: SalonExt): SalonExt {
  return { ...structuredClone(e), today: emptyToday(), vote: null, staff: e.staff.map(s => ({ ...structuredClone(s), task: null })) }
}

/** Extra customers today from campaigns (read before the day is planned). */
export function extraCustomers(state: { ext?: SalonExt }) {
  const e = ext(state)
  return campaignCustomers(e.campaigns, e.loyalty)
}

/** Day start: campaign days move on, this week's candidates, fresh tallies. Runs once per day. */
export function extOnStartDay(state: SalonState) {
  const e = ext(state)
  e.today = emptyToday()
  e.vote = null
  e.today.bias = campaignBias(e.campaigns)
  for (const s of e.staff) { s.task = null; s.breakLeft = 0; s.energy = 1 }
  if (state.day > e.lastDay) {
    if (e.lastDay > 0) e.campaigns = advanceCampaigns(e.campaigns)
    e.lastDay = state.day
  }
  const week = weekOf(state.day)
  if (week !== e.week) { e.week = week; e.hired = [] }
  // Staff whose station was sold or swapped away go back to reception.
  for (const s of e.staff) if (s.station && !state.stations.some(st => st.id === s.station)) s.station = null
}

/** Who a customer is (archetype, voice, traits), the same on every screen. */
export function personaOf(state: Pick<SalonState, 'stats'> & { ext?: SalonExt }, plan: Pick<CustomerPlan, 'seed' | 'regular' | 'treatment'>): Persona {
  return personaFor(plan, { rating: state.stats.ratingBefore, bias: state.ext?.today.bias })
}

export function candidates(state: Pick<SalonState, 'seed' | 'day'>): Candidate[] {
  return candidatesFor(state.seed, weekOf(state.day))
}

/** Staff can be hired once the salon has a second station (so a player keeps one). */
export function hireCheck(state: SalonState, idx: number): { ok: true } | { ok: false; reason: string } {
  const e = ext(state)
  const c = candidates(state)[idx]
  if (!c) return { ok: false, reason: 'Unknown candidate' }
  if (e.hired.includes(idx)) return { ok: false, reason: 'Hired' }
  if (state.stations.length < 2) return { ok: false, reason: 'Needs a second station' }
  if (e.staff.length >= Math.min(MAX_STAFF, state.stations.length - 1 + Math.floor(state.stations.length / 3))) return { ok: false, reason: 'Needs another station' }
  if (state.money < c.fee) return { ok: false, reason: `Needs $${c.fee - state.money} more` }
  return { ok: true }
}

function note(state: SalonState, text: string, player?: number) {
  state.seq++
  state.events.push({ seq: state.seq, kind: 'bought', text, player })
  if (state.events.length > 24) state.events.splice(0, state.events.length - 24)
}

function doHire(state: SalonState, idx: number, by: number) {
  const e = ext(state)
  const c = candidates(state)[idx]
  if (!hireCheck(state, idx).ok) return false
  state.money -= c.fee
  const id = STAFF_ID_BASE + (e.staff.reduce((m, s) => Math.max(m, s.id - STAFF_ID_BASE + 1), 0))
  const member = hire(c, id)
  // A new hire takes the last station nobody else staffs.
  const free = [...state.stations].reverse().find(st => st.id !== 's0' && !e.staff.some(s => s.station === st.id))
  member.station = free?.id ?? null
  e.staff.push(member)
  e.hired.push(idx)
  note(state, `Hired ${member.name}`, by)
  return true
}

function doCampaign(state: SalonState, id: string, by: number) {
  const e = ext(state)
  const c = CAMPAIGN_BY_ID[id]
  if (!canRunCampaign(id, e.campaigns, e.loyalty, state.money).ok) return false
  state.money -= c.price
  if (c.permanent) e.loyalty = true
  else e.campaigns.push({ id, day: 0 })
  note(state, `Started ${c.label}`, by)
  return true
}

function settleVote(state: SalonState) {
  const e = ext(state)
  const v = e.vote
  if (!v) return
  if (state.players.every(p => v.yes.includes(p.id))) {
    e.vote = null
    if (v.kind === 'hire') doHire(state, Number(v.ref), v.by)
    else doCampaign(state, v.ref, v.by)
  }
}

/** Apply one of the extra actions. Returns false when it was not allowed. */
export function reduceExt(state: SalonState, by: number, action: ExtAction): boolean {
  const e = ext(state)
  const player = state.players.find(p => p.id === by)
  switch (action.a) {
    case 'hire': {
      if (!hireCheck(state, action.idx).ok || e.vote || state.pending) return false
      const c = candidates(state)[action.idx]
      if (state.players.length > 1 && c.fee >= CONFIRM_PRICE) {
        e.vote = { kind: 'hire', ref: String(action.idx), label: `hire ${c.name}`, by, yes: [by] }
        return true
      }
      return doHire(state, action.idx, by)
    }
    case 'campaign': {
      if (!canRunCampaign(action.id, e.campaigns, e.loyalty, state.money).ok || e.vote || state.pending) return false
      const c = CAMPAIGN_BY_ID[action.id]
      if (state.players.length > 1 && c.price >= CONFIRM_PRICE) {
        e.vote = { kind: 'campaign', ref: action.id, label: `run ${c.label}`, by, yes: [by] }
        return true
      }
      return doCampaign(state, action.id, by)
    }
    case 'extVote': {
      if (!e.vote) return false
      if (!action.yes) { e.vote = null; return true }
      if (!e.vote.yes.includes(by)) e.vote.yes.push(by)
      settleVote(state)
      return true
    }
    case 'renameStaff': {
      const s = e.staff.find(m => m.id === action.id)
      const name = cleanStaffName(action.name)
      if (!s || !name) return false
      s.name = name
      return true
    }
    case 'assignStaff': {
      const s = e.staff.find(m => m.id === action.id)
      if (!s) return false
      if (action.station !== null && !state.stations.some(st => st.id === action.station)) return false
      if (s.task) return false
      // One staff member per station: whoever was there swaps to this one's old post.
      const other = action.station ? e.staff.find(m => m !== s && m.station === action.station) : null
      if (other) { if (other.task) return false; other.station = s.station }
      s.station = action.station
      return true
    }
    case 'petCat': e.today.pets++; return true
    case 'placeDecor': {
      if (!state.owned.includes(action.id) || !DECOR_ITEM_BY_ID[action.id]) return false
      e.decorOrder.push(action.id)
      if (e.decorOrder.length > 60) e.decorOrder.splice(0, e.decorOrder.length - 60)
      return true
    }
    case 'renameSalon': {
      const name = String(action.name ?? '').replace(/[<>&"]/g, '').trim().slice(0, 20)
      if (!name || !player) return false
      e.salonName = name
      return true
    }
    case 'renameCat': {
      const name = String(action.name ?? '').replace(/[<>&"]/g, '').trim().slice(0, 12)
      if (!name || !player) return false
      e.catName = name
      return true
    }
  }
}

/** Staff at work, tea breaks, and cheerful staff keeping the waiting room happy. */
export function extTick(state: SalonState, dt: number) {
  const e = ext(state)
  if (!e.staff.length) return
  const active = e.staff.filter(s => s.breakLeft <= 0)
  if (active.some(s => s.traits.includes('cheerful'))) {
    for (const c of state.customers) if (c.state === 'waiting') c.mood = Math.min(1, c.mood + MOOD_DRAIN_WAITING * 0.4 * dt)
  }
  for (const s of e.staff) {
    rest(s, dt, false)
    if (s.task) {
      const st = state.stations.find(x => x.id === s.task!.station)
      if (!st || st.lead !== s.id || st.customer === null) { s.task = null; continue }
      s.task.t += dt
      st.progress = Math.min(1, s.task.t / s.task.dur)
      st.step = Math.min(st.steps - 1, Math.floor(st.progress * st.steps))
      if (s.task.t >= s.task.dur) finishForStaff(state, s, st.id)
      continue
    }
    if (s.breakLeft > 0 || !s.station) continue
    const st = state.stations.find(x => x.id === s.station)
    if (!st || st.customer === null || st.lead !== null) { if (st) delete e.today.seatedAt[st.id]; continue }
    const c = state.customers.find(x => x.id === st.customer)
    if (!c || c.state !== 'seated') continue
    const since = (e.today.seatedAt[st.id] ??= state.clock)
    if (state.clock - since < STAFF_GRACE) continue
    delete e.today.seatedAt[st.id]
    st.lead = s.id
    c.state = 'treating'
    s.task = { station: st.id, t: 0, dur: staffDuration(s, c.plan.treatment, state.clock) }
  }
}

function finishForStaff(state: SalonState, s: StaffMember, stationId: string) {
  const st = state.stations.find(x => x.id === stationId)!
  const c = state.customers.find(x => x.id === st.customer)
  s.task = null
  if (!c) return
  const def = TREATMENTS[c.plan.treatment]
  const persona = personaOf(state, c.plan)
  const result = staffResult(s, c.plan.treatment, def.parSeconds, c.plan.seed, persona.traits)
  reduce(state, s.id, { a: 'finish', station: stationId, result })
  // Staff are not players: their day's numbers stay off the players' awards.
  delete state.stats.byPlayer[s.id]
  if (gainXp(s, c.plan.treatment)) ext(state).today.levelUps.push(s.name)
  tire(s)
}

/** Seconds until the station's staff member steps in, or null when nobody will. */
export function staffCountdown(state: SalonState & { ext?: SalonExt }, stationId: string): number | null {
  const e = state.ext
  if (!e) return null
  const s = e.staff.find(m => m.station === stationId && !m.task && m.breakLeft <= 0)
  const since = e.today.seatedAt[stationId]
  if (!s || since === undefined) return null
  return Math.max(0, STAFF_GRACE - (state.clock - since))
}

/** The review for a finished treatment, from the grammar, plus friendship with a regular. */
export function extReview(state: SalonState, c: Customer, by: number, stars: number, result: TreatmentResult, price: number, ambience: number): GoogleReview {
  const e = ext(state)
  const persona = personaOf(state, c.plan)
  const met = !!c.plan.regular && state.met.includes(c.plan.regular)
  const who = state.players.find(p => p.id === by)?.name ?? e.staff.find(s => s.id === by)?.name ?? 'the team'
  const review = writeGoogleReview({
    id: `d${state.day}c${c.id}`, day: state.day, name: c.plan.name, stars, result, mood: c.mood, regular: met, disaster: c.plan.disaster, ambience,
    seed: c.plan.seed, voice: persona.voice, archetype: persona.archetype, budget: persona.budget, price, look: c.plan.look,
    salon: e.salonName, staff: who, cat: e.today.pets > 0, recent: e.recent,
  })
  if (c.plan.regular && stars >= 4) {
    const before = e.friends[c.plan.regular] ?? 0
    const level = Math.min(5, before + 1)
    e.friends[c.plan.regular] = level
    if (level > before) e.today.friendUps.push({ name: c.plan.name, level, gift: level === 5 && persona.story ? persona.story.gift : null })
  }
  return review
}

/** Closing time: the day's wages. */
export function extOnClose(state: SalonState) {
  const e = ext(state)
  const wages = e.staff.reduce((sum, s) => sum + s.wage, 0)
  e.today.wages = wages
  state.money -= wages
}

export type { StaffMember, Candidate }
