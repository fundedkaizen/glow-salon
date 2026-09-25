import { withLookDefaults, type CustomerPlan } from './customers.ts'
import { advanceCampaigns, campaignBias, campaignCustomers, canRunCampaign, CAMPAIGN_BY_ID, type ActiveCampaign } from './marketing.ts'
import { DECOR_ITEM_BY_ID, GIFT_BY_ID, GIFT_BY_REGULAR } from './decor.ts'
import { CONFIRM_PRICE } from './economy.ts'
import { stationSpot } from './floor.ts'
import { goalFor, goalTally, type DailyGoal } from './goals.ts'
import { personaFor, type Persona } from './persona.ts'
import { writeGoogleReview, type GoogleReview } from './review-writer.ts'
import { MOOD_DRAIN_WAITING, reduce, type Customer, type SalonState } from './salon.ts'
import { candidatesFor, cleanStaffName, gainXp, has, hire, MAX_STAFF, rest, staffDuration, staffResult, STAFF_GRACE, STAFF_ID_BASE, tire, weekOf, type Candidate, type StaffMember } from './staff.ts'
import { planTreatment } from './treatments/plan.ts'
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
  /** How many reviews gave 1, 2, 3, 4 and 5 stars (index 0 is 1 star), for the rating histogram. */
  stars: number[]
  /** The last day the day-start rules ran (so reloading a day does not run them twice). */
  lastDay: number
  /** First names of this week's customers, by day, so a name is not used twice in a week. */
  names: { n: string; d: number }[]
  today: {
    ready: number[]; wages: number; pets: number; levelUps: string[]; bias: string[]; seatedAt: Record<string, number>; friendUps: { name: string; level: number; gift: string | null }[]
    /** Today's relaxed goal and whether it is reached. */
    goal: DailyGoal | null
    /** Stations players are walking over to (player id to station and when), so staff leave them be. */
    claims: Record<number, { station: string; at: number }>
  }
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
  /** Ready to open: the day starts once every player in the salon is ready. */
  | { a: 'ready' }
  /** A player sets off for a station (or for somewhere else: null), so staff do not take it from under them. */
  | { a: 'claim'; station: string | null }

export const DEFAULT_SALON_NAME = 'Glow Salon'
export const DEFAULT_CAT_NAME = 'Mochi'

const emptyToday = (): SalonExt['today'] => ({ ready: [], wages: 0, pets: 0, levelUps: [], bias: [], seatedAt: {}, friendUps: [], goal: null, claims: {} })

export function newExt(): SalonExt {
  return { salonName: DEFAULT_SALON_NAME, catName: DEFAULT_CAT_NAME, staff: [], hired: [], week: -1, campaigns: [], loyalty: false, friends: {}, decorOrder: [], recent: [], stars: [0, 0, 0, 0, 0], lastDay: 0, names: [], today: emptyToday(), vote: null }
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
  e.staff = Array.isArray(d.staff) ? d.staff.filter(s => s && typeof s.name === 'string' && Number.isInteger(s.id) && s.skills && s.look).slice(0, MAX_STAFF).map(s => ({ ...s, skills: { ...s.skills, feet: s.skills.feet ?? 1 }, look: withLookDefaults(s.look), name: cleanStaffName(s.name) || 'Staff', task: null, breakLeft: 0, energy: 1 })) : []
  e.hired = Array.isArray(d.hired) ? d.hired.filter(n => Number.isInteger(n) && n >= 0 && n < 3) : []
  e.week = Number.isInteger(d.week) ? d.week! : -1
  e.campaigns = Array.isArray(d.campaigns) ? d.campaigns.filter(c => c && CAMPAIGN_BY_ID[c.id] && Number.isInteger(c.day) && c.day >= 0) : []
  e.loyalty = d.loyalty === true
  e.friends = d.friends && typeof d.friends === 'object' ? Object.fromEntries(Object.entries(d.friends).filter(([, v]) => typeof v === 'number').map(([k, v]) => [k, Math.max(0, Math.min(5, v))])) : {}
  e.decorOrder = Array.isArray(d.decorOrder) ? d.decorOrder.filter(id => typeof id === 'string' && DECOR_ITEM_BY_ID[id]).slice(-60) : []
  e.recent = Array.isArray(d.recent) ? d.recent.filter(l => typeof l === 'string').slice(-40) : []
  e.stars = Array.isArray(d.stars) && d.stars.length === 5 && d.stars.every(n => Number.isInteger(n) && n >= 0) ? [...d.stars] : [0, 0, 0, 0, 0]
  e.lastDay = Number.isInteger(d.lastDay) ? d.lastDay! : 0
  e.names = Array.isArray(d.names) ? d.names.filter(n => n && typeof n.n === 'string' && Number.isInteger(n.d)).slice(-120) : []
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
  e.today.goal = goalFor(state.seed, state.day, state.schedule.length, state.owned.includes('treat-nails'), state.owned.includes('treat-feet'))
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
  if (!canRunCampaign(id, e.campaigns, e.loyalty, state.money, state.day).ok) return false
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
      if (!canRunCampaign(action.id, e.campaigns, e.loyalty, state.money, state.day).ok || e.vote || state.pending) return false
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
    case 'ready': {
      if (state.phase !== 'prep' || !player) return false
      if (!e.today.ready.includes(by)) e.today.ready.push(by)
      if (state.players.every(p => e.today.ready.includes(p.id))) reduce(state, by, { a: 'open' })
      return true
    }
    case 'claim': {
      const claims = (e.today.claims ??= {})
      if (action.station === null) { delete claims[by]; return true }
      if (!player || !state.stations.some(st => st.id === action.station)) return false
      claims[by] = { station: action.station, at: state.clock }
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

/** A staff member who could start at this station right now (their own station, free and fresh). */
export function staffAvailableAt(state: SalonState, stationId: string): boolean {
  return !!state.ext?.staff.some(m => m.station === stationId && !m.task && m.breakLeft <= 0)
}

/**
 * The salon's share of a treatment done by staff: revenue x (0.6 + 0.1 x stars), never more than a player
 * would earn, and half the tip (calm staff keep facial customers relaxed: a little more). Doing it yourself
 * stays the best paid.
 */
export function staffShare(state: SalonState, staffId: number, stars: number, treatment: string): { revenue: number; tips: number } {
  const s = state.ext?.staff.find(m => m.id === staffId)
  return { revenue: Math.min(1, 0.6 + 0.1 * stars), tips: 0.5 * (s && has(s, 'calm') && treatment === 'facial' ? 1.3 : 1) }
}

/** Staff skilled enough for a treatment to take it at a station that is not theirs. */
const SKILLED = 2
/** Seconds a customer waits before staff set to "Anywhere" come over: players get first pick. */
export const ROAM_GRACE = 30
/** A player this close to a station's spot is at it (the floor's prompt shows from about 80 px). */
export const NEAR_STATION = 120
/** Seconds a player's walk to a station keeps it for them. */
export const CLAIM_SECONDS = 12

/** A player is at this station, standing by it, or on the way to it: staff leave it to them. */
export function playerHolds(state: Pick<SalonState, 'players' | 'stations' | 'clock'> & { ext?: SalonExt }, stationId: string): boolean {
  const st = state.stations.find(x => x.id === stationId)
  if (!st || st.slot < 0) return false
  const spot = stationSpot(st.slot)
  if (state.players.some(p => p.station === stationId || Math.hypot(p.x - spot.x, p.y - spot.y) < NEAR_STATION)) return true
  const claims = state.ext?.today.claims ?? {}
  return state.players.some(p => { const c = claims[p.id]; return !!c && c.station === stationId && state.clock - c.at < CLAIM_SECONDS })
}

/**
 * The station an idle staff member should start at now, if any. Staff with a station work only there; staff
 * set to "Anywhere they are skilled" pick up any station nobody covers, after a longer wait. Never one a
 * player is at or walking to.
 */
function workFor(state: SalonState, s: StaffMember): string | null {
  const e = ext(state)
  const seated = (st: SalonState['stations'][number]) => {
    if (st.customer === null || st.lead !== null || st.slot < 0) return false
    const c = state.customers.find(x => x.id === st.customer)
    return !!c && c.state === 'seated'
  }
  const ready = (st: SalonState['stations'][number], grace: number) => {
    // A player at the station (or on the way) restarts the wait, so staff never step in the moment they leave.
    if (playerHolds(state, st.id)) { e.today.seatedAt[st.id] = state.clock; return false }
    const since = (e.today.seatedAt[st.id] ??= state.clock)
    return state.clock - since >= grace
  }
  if (s.station) {
    const home = state.stations.find(x => x.id === s.station)
    return home && seated(home) && ready(home, STAFF_GRACE) ? home.id : null
  }
  for (const st of state.stations) {
    if (!seated(st)) continue
    const c = state.customers.find(x => x.id === st.customer)!
    if ((s.skills[c.plan.treatment] ?? 0) < SKILLED) continue
    if (e.staff.some(m => m !== s && m.station === st.id && !m.task && m.breakLeft <= 0)) continue
    if (ready(st, ROAM_GRACE)) return st.id
  }
  return null
}

/** Staff at work, tea breaks, and cheerful staff keeping the waiting room happy. Also today's goal. */
export function extTick(state: SalonState, dt: number) {
  const e = ext(state)
  const goal = e.today.goal
  if (goal && !goal.done && goalTally(state)[goal.kind] >= goal.target) {
    goal.done = true
    state.money += goal.reward
    state.seq++
    state.events.push({ seq: state.seq, kind: 'goal', text: `Goal reached: ${goal.text}. +$${goal.reward}`, amount: goal.reward })
    if (state.events.length > 24) state.events.splice(0, state.events.length - 24)
  }
  // A treatment everyone walked away from waits, seated, for whoever comes next.
  for (const st of state.stations) {
    if (st.lead !== null || st.customer === null) { delete e.today.seatedAt[st.id]; continue }
    const c = state.customers.find(x => x.id === st.customer)
    if (c && c.state === 'treating') c.state = 'seated'
  }
  if (!e.staff.length) return
  const active = e.staff.filter(s => s.breakLeft <= 0)
  if (active.some(s => s.traits.includes('cheerful'))) {
    for (const c of state.customers) if (c.state === 'waiting') c.mood = Math.min(1, c.mood + MOOD_DRAIN_WAITING * 0.4 * dt)
  }
  for (const s of e.staff) {
    rest(s, dt, e.today.pets > 0)
    if (s.task) {
      const st = state.stations.find(x => x.id === s.task!.station)
      if (!st || st.lead !== s.id || st.customer === null) { s.task = null; continue }
      s.task.t += dt
      st.progress = Math.min(1, s.task.t / s.task.dur)
      st.step = Math.min(st.steps - 1, Math.floor(st.progress * st.steps))
      if (s.task.t >= s.task.dur) finishForStaff(state, s, st.id)
      continue
    }
    if (s.breakLeft > 0) continue
    const at = workFor(state, s)
    if (!at) continue
    const st = state.stations.find(x => x.id === at)!
    const c = state.customers.find(x => x.id === st.customer)!
    delete e.today.seatedAt[st.id]
    st.lead = s.id
    c.state = 'treating'
    s.task = { station: st.id, t: 0, dur: staffDuration(s, c.plan.treatment, state.clock, planTreatment(c.plan.treatment, c.plan.seed, c.plan.disaster).def.parSeconds) }
  }
}

function finishForStaff(state: SalonState, s: StaffMember, stationId: string) {
  const st = state.stations.find(x => x.id === stationId)!
  const c = state.customers.find(x => x.id === st.customer)
  const took = s.task?.dur ?? 0
  s.task = null
  if (!c) return
  const def = planTreatment(c.plan.treatment, c.plan.seed, c.plan.disaster).def
  const persona = personaOf(state, c.plan)
  const result = { ...staffResult(s, c.plan.treatment, def.parSeconds, c.plan.seed, persona.traits), seconds: Math.round(took) || def.parSeconds }
  reduce(state, s.id, { a: 'finish', station: stationId, result })
  // Staff are not players: their day's numbers stay off the players' awards.
  delete state.stats.byPlayer[s.id]
  if (gainXp(s, c.plan.treatment)) ext(state).today.levelUps.push(s.name)
  tire(s)
}

/** Seconds until the station's staff member steps in, or null when nobody will. */
export function staffCountdown(state: Pick<SalonState, 'players' | 'stations' | 'clock'> & { ext?: SalonExt }, stationId: string): number | null {
  const e = state.ext
  if (!e) return null
  const s = e.staff.find(m => m.station === stationId && !m.task && m.breakLeft <= 0)
  const since = e.today.seatedAt[stationId]
  if (!s || since === undefined || playerHolds(state, stationId)) return null
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
    salon: e.salonName, staff: who, cat: e.today.pets > 0, recent: e.recent, owned: state.owned, byStaff: by >= STAFF_ID_BASE,
  })
  e.stars[Math.max(1, Math.min(5, review.stars)) - 1]++
  if (c.plan.regular && stars >= 4) {
    const before = e.friends[c.plan.regular] ?? 0
    // A chatterbox on the team makes friends twice as fast.
    const staffer = e.staff.find(s => s.id === by)
    const level = Math.min(5, before + (staffer && has(staffer, 'chatterbox') ? 2 : 1))
    e.friends[c.plan.regular] = level
    const gift = level === 5 && before < 5 ? GIFT_BY_REGULAR[c.plan.regular] : null
    if (gift && !state.owned.includes(gift.id)) {
      // The gift is real: it joins the salon's things, on the gift shelf.
      state.owned.push(gift.id)
      state.seq++
      state.events.push({ seq: state.seq, kind: 'gift', text: `${c.plan.name} left you a gift: ${gift.label}`, item: gift.id })
    }
    if (level > before) e.today.friendUps.push({ name: c.plan.name, level, gift: gift ? gift.label : null })
  }
  return review
}

/** The gift item of a regular, if they have given it (for the shop's gift shelf). */
export const giftOf = (id: string) => GIFT_BY_ID[id] ?? null

/** Closing time: the day's wages. */
export function extOnClose(state: SalonState) {
  const e = ext(state)
  const wages = e.staff.reduce((sum, s) => sum + s.wage, 0)
  e.today.wages = wages
  state.money -= wages
}

export type { StaffMember, Candidate }
