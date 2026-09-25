import { firstNameOf, planDay, type CustomerPlan } from './customers.ts'
import { regularChance, setPayMult, setStarBonus, setTipMult, vipBoost } from './decor.ts'
import { ambienceStars, canBuy, customersPerDay, ITEM_BY_ID, needsConfirm, payFor, START_MONEY, STATION_NAME, tipFor, treatmentsUnlocked, type StationKind } from './economy.ts'
import { blockedGrid, DOOR, DOOR_INSIDE, findPath, SLOTS, SOFA_SEATS, spawnPoint, STANDING, stationSeat, walk, type Pt } from './floor.ts'
import { campaignBias } from './marketing.ts'
import { goalFor } from './goals.ts'
import { addReview, average, starsFor, type Rating, type Review } from './reviews.ts'
import { ext, extOnClose, extOnStartDay, extraCustomers, extReview, extTick, reduceExt, saveExt, staffAvailableAt, staffShare, type ExtAction, type SalonExt } from './salon-ext.ts'
import { STAFF_ID_BASE } from './staff.ts'
import { planTreatment, stepCount } from './treatments/plan.ts'
import { TREATMENTS } from './treatments/registry.ts'
import type { TreatmentResult } from './treatments/session.ts'
import type { TreatmentId } from './treatments/types.ts'

/**
 * The salon: one pure state and a reducer. The host runs it (the day, the customers, the money); every
 * player's input arrives as an Action with the player's number, whether it came from this browser or
 * through the relay. Guests only draw the snapshots.
 */
export type Phase = 'prep' | 'open' | 'closing' | 'receipt'

export type Station = {
  id: string
  kind: StationKind
  /** Where it stands (an index into SLOTS), or -1 while a new station waits to be placed. */
  slot: number
  customer: number | null
  /** The player running the treatment, and any helpers (four hands). */
  lead: number | null
  helpers: number[]
  step: number
  steps: number
  progress: number
}

export type CustomerState = 'entering' | 'waiting' | 'toStation' | 'seated' | 'treating' | 'leaving'

export type Customer = {
  id: number
  plan: CustomerPlan
  x: number
  y: number
  path: Pt[]
  state: CustomerState
  seat: number | null
  station: string | null
  /** 1 happy to 0.2 a bit grumpy: only lowers the tip. */
  mood: number
  /** Money and stars once paid, shown as a float above them. */
  paid: number
  stars: number
}

export type Player = { id: number; name: string; x: number; y: number; facing: 1 | -1; moving: boolean; station: string | null }

export type PlayerStats = { name: string; served: number; popped: number; extracted: number; tips: number; foam: number; fastest: number | null; nails: number; feet: number }

export type DayStats = {
  revenue: number
  tips: number
  costs: number
  served: number
  reviews: Review[]
  ratingBefore: number
  reviewsBefore: number
  byPlayer: Record<number, PlayerStats>
}

export type Pending = { id: number; item: string; by: number; yes: number[] }

export type GameEvent = { seq: number; kind: 'arrive' | 'paid' | 'bought' | 'vote' | 'declined' | 'phase' | 'unlock' | 'placed' | 'goal' | 'gift'; text: string; x?: number; y?: number; amount?: number; player?: number; item?: string }

/** What is saved, and what a save code carries. */
export type SaveData = {
  v: 1
  day: number
  money: number
  owned: string[]
  /** Each owned station's slot, in the order stations are listed. */
  slots: number[]
  rating: Rating
  reviews: Review[]
  met: string[]
  seed: number
  totals: { served: number; earned: number }
  /** Staff, campaigns, friendships, decor placement and names (salon-ext.ts). Older saves have none. */
  ext?: SalonExt
}

export type SalonState = SaveData & {
  phase: Phase
  clock: number
  schedule: CustomerPlan[]
  spawned: number
  customers: Customer[]
  stations: Station[]
  players: Player[]
  stats: DayStats
  pending: Pending | null
  nextId: number
  events: GameEvent[]
  seq: number
}

export type Action =
  | { a: 'join'; name: string }
  | { a: 'leave' }
  | { a: 'rename'; name: string }
  | { a: 'pos'; x: number; y: number; f: 1 | -1; m: boolean }
  | { a: 'open' }
  | { a: 'work'; station: string }
  | { a: 'stopWork'; station: string }
  | { a: 'progress'; station: string; step: number; steps: number; progress: number }
  | { a: 'finish'; station: string; result: TreatmentResult; foam?: number }
  | { a: 'buy'; item: string }
  | { a: 'vote'; id: number; yes: boolean }
  | { a: 'swap'; station: string; slot: number }
  /** Put a new station in an empty slot (or move one that has nobody in it). */
  | { a: 'place'; station: string; slot: number }
  | { a: 'next' }
  | ExtAction

export const WALK_SPEED = 170
export const MOOD_DRAIN_WAITING = 0.006
export const MOOD_DRAIN_SEATED = 0.003
export const MOOD_FLOOR = 0.2

export function newSave(seed = Math.floor(Math.random() * 2 ** 31)): SaveData {
  return { v: 1, day: 1, money: START_MONEY, owned: [], slots: [0], rating: { sum: 0, count: 0 }, reviews: [], met: [], seed, totals: { served: 0, earned: 0 } }
}

/** The stations the salon owns: the first facial chair, then one per station bought, in purchase order. */
export function stationKinds(owned: readonly string[]): StationKind[] {
  const kinds: StationKind[] = ['facial']
  for (const id of owned) { const e = ITEM_BY_ID[id]?.effect; if (e?.kind === 'station') kinds.push(e.station) }
  return kinds
}

export function freeSlot(taken: number[]) { return SLOTS.findIndex((_, i) => !taken.includes(i)) }

function buildStations(save: SaveData): Station[] {
  const kinds = stationKinds(save.owned)
  const slots = [...save.slots]
  while (slots.length < kinds.length) slots.push(freeSlot(slots))
  return kinds.map((kind, i) => ({ id: `s${i}`, kind, slot: slots[i], customer: null, lead: null, helpers: [], step: 0, steps: TREATMENTS[kind].steps.length, progress: 0 }))
}

/** Names used in the week before `day`, so no new customer shares a first name with one from this week. */
function namesThisWeek(e: SalonExt, day: number) {
  e.names = (e.names ?? []).filter(n => n.d < day && n.d > day - 7)
  return e.names.map(n => n.n)
}

function emptyStats(state: { rating: Rating }, players: Player[]): DayStats {
  const byPlayer: Record<number, PlayerStats> = {}
  for (const p of players) byPlayer[p.id] = blankStats(p.name)
  return { revenue: 0, tips: 0, costs: 0, served: 0, reviews: [], ratingBefore: average(state.rating), reviewsBefore: state.rating.count, byPlayer }
}

const blankStats = (name: string): PlayerStats => ({ name, served: 0, popped: 0, extracted: 0, tips: 0, foam: 0, fastest: null, nails: 0, feet: 0 })

/** Treatments customers can book today: unlocked and with a station to do them. */
export function bookable(state: Pick<SalonState, 'owned'>): TreatmentId[] {
  const kinds = stationKinds(state.owned)
  return treatmentsUnlocked(state.owned).filter(t => kinds.includes(TREATMENTS[t].station))
}

export function startDay(save: SaveData, players: Player[] = []): SalonState {
  const state: SalonState = {
    ...structuredClone(save),
    phase: 'prep', clock: 0, schedule: [], spawned: 0, customers: [], stations: buildStations(save), players,
    stats: emptyStats(save, players), pending: null, nextId: 1, events: [], seq: 0,
  }
  state.slots = state.stations.map(s => s.slot)
  planSchedule(state)
  extOnStartDay(state)
  players.forEach(p => { p.station = null; const at = spawnPoint(p.id); p.x = at.x; p.y = at.y })
  return state
}

/** Who comes today, for what and when (at dawn, or again when a new treatment is bought before opening). */
function planSchedule(state: SalonState) {
  const e = ext(state)
  const count = customersPerDay(state.owned, state.day, state.stations.length) + extraCustomers(state)
  e.names = (e.names ?? []).filter(n => n.d !== state.day)
  state.schedule = planDay({
    day: state.day, seed: state.seed, count, treatments: bookable(state), met: state.met, rating: average(state.rating), bias: campaignBias(e.campaigns),
    avoidNames: namesThisWeek(e, state.day), regularChance: regularChance(state.owned, e.loyalty), vip: vipBoost(state.owned),
  })
  for (const p of state.schedule) if (!p.regular) e.names.push({ n: firstNameOf(p.name), d: state.day })
}

export function toSave(state: SalonState): SaveData {
  return { v: 1, day: state.day, money: state.money, owned: [...state.owned], slots: state.stations.map(s => s.slot), rating: { ...state.rating }, reviews: state.reviews.slice(-40), met: [...state.met], seed: state.seed, totals: { ...state.totals }, ext: saveExt(ext(state)) }
}

function event(state: SalonState, e: Omit<GameEvent, 'seq'>) {
  state.seq++
  state.events.push({ ...e, seq: state.seq })
  if (state.events.length > 24) state.events.splice(0, state.events.length - 24)
}

const grids = new Map<string, Uint8Array>()
function floorGrid(state: SalonState) {
  const props = state.owned.map(id => { const e = ITEM_BY_ID[id]?.effect; return e?.kind === 'decor' ? e.prop : '' }).filter(Boolean)
  const key = state.stations.map(s => s.slot).join(',') + '|' + props.join(',')
  let grid = grids.get(key)
  if (!grid) { grid = blockedGrid(state.stations.map(s => s.slot), props); grids.set(key, grid) }
  return grid
}

/** A path on the floor, around the furniture. */
export function pathOnFloor(state: SalonState, from: Pt, to: Pt) { return findPath(floorGrid(state), from, to) }

function playerStats(state: SalonState, id: number) {
  const p = state.players.find(pl => pl.id === id)
  return (state.stats.byPlayer[id] ??= blankStats(p?.name ?? 'Player'))
}

/** Apply one player's action. Returns false when it was not allowed (the UI can say so). */
export function reduce(state: SalonState, by: number, action: Action): boolean {
  switch (action.a) {
    case 'join': {
      const name = cleanName(action.name) || `Player ${by + 1}`
      const existing = state.players.find(p => p.id === by)
      if (existing) { existing.name = name; return true }
      const at = spawnPoint(by)
      state.players.push({ id: by, name, x: at.x, y: at.y, facing: 1, moving: false, station: null })
      state.stats.byPlayer[by] ??= blankStats(name)
      return true
    }
    case 'rename': {
      const p = state.players.find(pl => pl.id === by)
      if (p) { p.name = cleanName(action.name) || p.name; playerStats(state, by).name = p.name }
      return !!p
    }
    case 'leave': {
      state.players = state.players.filter(p => p.id !== by)
      for (const s of state.stations) releaseFromStation(s, by)
      // A purchase vote never waits on someone who left.
      if (state.pending) settleVote(state)
      return true
    }
    case 'pos': {
      const p = state.players.find(pl => pl.id === by)
      if (!p || !Number.isFinite(action.x) || !Number.isFinite(action.y)) return false
      p.x = Math.max(0, Math.min(1280, action.x)); p.y = Math.max(0, Math.min(800, action.y)); p.facing = action.f === -1 ? -1 : 1; p.moving = !!action.m
      return true
    }
    case 'open': {
      if (state.phase !== 'prep') return false
      // A station still waiting for a spot goes to the first free one, so customers can use it.
      for (const s of state.stations) if (s.slot < 0) s.slot = freeSlot(state.stations.map(o => o.slot))
      state.slots = state.stations.map(s => s.slot)
      state.phase = 'open'
      state.clock = 0
      event(state, { kind: 'phase', text: 'The salon is open!' })
      return true
    }
    case 'work': {
      const s = state.stations.find(st => st.id === action.station)
      const p = state.players.find(pl => pl.id === by)
      if (!s || !p || s.customer === null) return false
      const c = state.customers.find(cu => cu.id === s.customer)
      if (!c || (c.state !== 'seated' && c.state !== 'treating')) return false
      for (const other of state.stations) if (other !== s) releaseFromStation(other, by)
      if (s.lead === null || s.lead === by) s.lead = by
      else if (!s.helpers.includes(by)) { if (s.helpers.length >= 3) return false; s.helpers.push(by) }
      p.station = s.id
      c.state = 'treating'
      return true
    }
    case 'stopWork': {
      const s = state.stations.find(st => st.id === action.station)
      if (!s) return false
      releaseFromStation(s, by)
      const p = state.players.find(pl => pl.id === by)
      if (p) p.station = null
      return true
    }
    case 'progress': {
      const s = state.stations.find(st => st.id === action.station)
      if (!s || s.lead !== by) return false
      s.step = Math.max(0, Math.min(action.steps, Math.floor(action.step)))
      s.steps = Math.max(1, Math.floor(action.steps))
      s.progress = Math.max(0, Math.min(1, action.progress))
      return true
    }
    case 'finish': return finish(state, by, action.station, action.result, action.foam ?? 0)
    case 'buy': return buy(state, by, action.item)
    case 'vote': {
      if (!state.pending || state.pending.id !== action.id) return false
      if (!action.yes) {
        const name = state.players.find(p => p.id === by)?.name ?? 'Someone'
        event(state, { kind: 'declined', text: `${name} said not yet to ${ITEM_BY_ID[state.pending.item].name}` })
        state.pending = null
        return true
      }
      if (!state.pending.yes.includes(by)) state.pending.yes.push(by)
      settleVote(state)
      return true
    }
    case 'swap': {
      if (state.phase !== 'prep' && state.phase !== 'receipt') return false
      const s = state.stations.find(st => st.id === action.station)
      if (!s || action.slot < 0 || action.slot >= SLOTS.length) return false
      const other = state.stations.find(st => st.slot === action.slot)
      if (other) other.slot = s.slot
      s.slot = action.slot
      state.slots = state.stations.map(st => st.slot)
      return true
    }
    case 'place': {
      const s = state.stations.find(st => st.id === action.station)
      if (!s || !Number.isInteger(action.slot) || action.slot < 0 || action.slot >= SLOTS.length) return false
      if (state.stations.some(st => st.slot === action.slot)) return false
      if (s.slot >= 0 && (s.customer !== null || (state.phase !== 'prep' && state.phase !== 'receipt'))) return false
      const first = s.slot < 0
      s.slot = action.slot
      state.slots = state.stations.map(st => st.slot)
      const p = SLOTS[action.slot]
      if (first) event(state, { kind: 'placed', text: `The new ${STATION_NAME[s.kind]} is ready`, x: p.x, y: p.y, player: by, item: s.id })
      return true
    }
    case 'next': {
      if (state.phase !== 'receipt') return false
      const players = state.players
      const next = startDay({ ...toSave(state), day: state.day + 1 }, players)
      Object.assign(state, next)
      event(state, { kind: 'phase', text: `Day ${state.day}` })
      return true
    }
    default: return reduceExt(state, by, action)
  }
}

function cleanName(name: string) { return String(name ?? '').replace(/[<>&"]/g, '').trim().slice(0, 16) }

function releaseFromStation(s: Station, by: number) {
  s.helpers = s.helpers.filter(h => h !== by)
  if (s.lead === by) {
    // A helper takes over; otherwise the treatment waits, paused, for whoever comes next.
    s.lead = s.helpers.shift() ?? null
  }
}

function buy(state: SalonState, by: number, id: string): boolean {
  const check = canBuy(state.owned, state.money, id, state.day)
  if (!check.ok) return false
  if (state.pending) return false
  if (needsConfirm(id) && state.players.length > 1) {
    state.pending = { id: state.seq + 1, item: id, by, yes: [by] }
    const name = state.players.find(p => p.id === by)?.name ?? 'Someone'
    event(state, { kind: 'vote', text: `${name} wants to buy ${ITEM_BY_ID[id].name}`, player: by })
    return true
  }
  complete(state, id, by)
  return true
}

function settleVote(state: SalonState) {
  const pending = state.pending
  if (!pending) return
  const present = state.players.map(p => p.id)
  if (present.every(id => pending.yes.includes(id))) {
    state.pending = null
    if (canBuy(state.owned, state.money, pending.item, state.day).ok) complete(state, pending.item, pending.by)
  }
}

function complete(state: SalonState, id: string, by: number) {
  const item = ITEM_BY_ID[id]
  state.money -= item.price
  // A bundle brings its parts (the nail bar comes with its desk).
  for (const got of [id, ...(item.includes ?? [])]) {
    if (state.owned.includes(got)) continue
    state.owned.push(got)
    if (ITEM_BY_ID[got]?.effect.kind !== 'station') continue
    // A new station waits for the players to tap a free spot for it (or takes the first one at opening).
    const kinds = stationKinds(state.owned)
    const kind = kinds[kinds.length - 1]
    const slot = state.phase === 'prep' || state.phase === 'receipt' ? -1 : freeSlot(state.stations.map(s => s.slot))
    state.stations.push({ id: `s${state.stations.length}`, kind, slot, customer: null, lead: null, helpers: [], step: 0, steps: TREATMENTS[kind].steps.length, progress: 0 })
    state.slots = state.stations.map(s => s.slot)
  }
  // A new treatment bought before opening: today's customers (nobody has arrived yet) can already ask for it.
  if (state.phase === 'prep' && item.effect.kind === 'treatment') {
    planSchedule(state)
    const e = ext(state)
    if (e.today.goal && !e.today.goal.done) e.today.goal = goalFor(state.seed, state.day, state.schedule.length, state.owned.includes('treat-nails'), state.owned.includes('treat-feet'))
  }
  event(state, { kind: 'bought', text: `Bought ${item.name}`, amount: item.price, player: by, item: id })
}

function finish(state: SalonState, by: number, stationId: string, result: TreatmentResult, foam: number): boolean {
  const s = state.stations.find(st => st.id === stationId)
  if (!s || s.lead !== by || s.customer === null) return false
  const c = state.customers.find(cu => cu.id === s.customer)
  if (!c) return false
  // The customer's own treatment: a Foot Clinic pays more than a Classic Pedicure.
  const def = planTreatment(c.plan.treatment, c.plan.seed, c.plan.disaster).def
  const amb = ambienceStars(state.owned)
  const stars = Math.min(5, starsFor(result, c.mood, amb) + setStarBonus(state.owned, c.plan.treatment))
  let price = Math.round(payFor(def.basePrice, state.owned, c.plan.disaster) * setPayMult(state.owned, state.day))
  const mid = state.schedule[Math.floor(state.schedule.length / 2)]
  let tipMult = setTipMult(state.owned, c.plan.archetype ?? '', !!mid && c.plan.arriveAt >= mid.arriveAt)
  // Staff take a share: the salon keeps less of a staff treatment than one the players do themselves.
  if (by >= STAFF_ID_BASE) { const share = staffShare(state, by, stars, c.plan.treatment); price = Math.round(price * share.revenue); tipMult *= share.tips }
  // A player pays for what was done: skipped steps take the price down (to 40% with nothing done).
  const completion = completionOf(result)
  if (by < STAFF_ID_BASE) price = Math.round(price * (0.4 + 0.6 * completion))
  const rushed = by < STAFF_ID_BASE && completion < RUSHED
  const tip = tipFor(price, stars, c.mood, state.owned, tipMult)
  state.money += price + tip - def.productCost
  state.stats.revenue += price
  state.stats.tips += tip
  state.stats.costs += def.productCost
  state.stats.served++
  state.totals.served++
  state.totals.earned += price + tip
  const review = extReview(state, c, by, stars, result, price, amb)
  state.stats.reviews.push(review)
  state.reviews.push(review)
  if (state.reviews.length > 40) state.reviews.splice(0, state.reviews.length - 40)
  state.rating = addReview(state.rating, stars)
  if (c.plan.regular && !state.met.includes(c.plan.regular)) state.met.push(c.plan.regular)
  // Awards: the lead gets the customer and the tip; everyone who helped shares the pops.
  const lead = playerStats(state, by)
  lead.served++
  lead.tips += tip
  lead.popped += result.popped
  lead.extracted += result.extracted
  lead.foam += foam
  if (result.treatment === 'nails') lead.nails++
  if (result.treatment === 'feet') lead.feet = (lead.feet ?? 0) + 1
  if (lead.fastest === null || result.seconds < lead.fastest) lead.fastest = result.seconds
  c.paid = price + tip
  c.stars = stars
  c.state = 'leaving'
  c.path = pathOnFloor(state, c, DOOR_INSIDE).concat([DOOR])
  for (const pid of [s.lead, ...s.helpers]) { const p = state.players.find(pl => pl.id === pid); if (p) p.station = null }
  s.customer = null; s.lead = null; s.helpers = []; s.step = 0; s.progress = 0
  event(state, { kind: 'paid', text: `${c.plan.name} paid $${price} + $${tip} tip${rushed ? ' (rushed)' : ''}`, x: c.x, y: c.y, amount: price + tip, player: by })
  return true
}

/** Below this share of the steps done, a treatment counts as rushed. */
export const RUSHED = 0.6

/** The share of a treatment's required steps that were really done (0 to 1). */
export function completionOf(result: Pick<TreatmentResult, 'done' | 'required'>) {
  const done = Number.isFinite(result.done) ? result.done : 0
  return Math.max(0, Math.min(1, done / Math.max(1, result.required)))
}

/** Advance the day by `dt` seconds (the host only). */
export function tick(state: SalonState, dt: number) {
  dt = Math.min(dt, 0.25)
  if (state.phase !== 'open' && state.phase !== 'closing') return
  state.clock += dt
  // Arrivals.
  while (state.spawned < state.schedule.length && state.schedule[state.spawned].arriveAt <= state.clock) {
    const plan = state.schedule[state.spawned++]
    const c: Customer = { id: state.nextId++, plan, x: DOOR.x, y: DOOR.y, path: [], state: 'entering', seat: null, station: null, mood: 1, paid: 0, stars: 0 }
    c.seat = takeSeat(state)
    c.path = [DOOR_INSIDE, ...pathOnFloor(state, DOOR_INSIDE, seatPoint(c.seat))]
    state.customers.push(c)
    event(state, { kind: 'arrive', text: `${plan.name} arrived for a ${planTreatment(plan.treatment, plan.seed, plan.disaster).def.name}`, x: c.x, y: c.y })
  }
  if (state.spawned >= state.schedule.length && state.phase === 'open') {
    state.phase = 'closing'
    event(state, { kind: 'phase', text: 'Last customer of the day is in' })
  }
  for (const c of state.customers) {
    if (c.path.length) c.path = walk(c, c.path, WALK_SPEED * dt)
    if (c.state === 'entering' && !c.path.length) c.state = 'waiting'
    if (c.state === 'toStation' && !c.path.length) c.state = 'seated'
    if (c.state === 'waiting' || c.state === 'entering') c.mood = Math.max(MOOD_FLOOR, c.mood - MOOD_DRAIN_WAITING * dt)
    if (c.state === 'seated') {
      const s = state.stations.find(st => st.id === c.station)
      if (!s || s.lead === null) c.mood = Math.max(MOOD_FLOOR, c.mood - MOOD_DRAIN_SEATED * dt)
    }
  }
  // Free stations call the next waiting customer who wants what they do (first come, first served). A
  // station with a staff member ready calls first, so staff are never idle while a player's chair fills.
  const free = state.stations.filter(s => s.customer === null && s.slot >= 0)
  free.sort((a, b) => Number(staffAvailableAt(state, b.id)) - Number(staffAvailableAt(state, a.id)))
  for (const s of free) {
    const next = state.customers.find(c => (c.state === 'waiting' || c.state === 'entering') && TREATMENTS[c.plan.treatment].station === s.kind)
    if (!next) continue
    s.customer = next.id
    s.step = 0
    s.progress = 0
    s.steps = stepCount(next.plan.treatment, next.plan.seed, next.plan.disaster)
    next.station = s.id
    next.seat = null
    next.state = 'toStation'
    next.path = pathOnFloor(state, next, stationSeat(s.slot))
    reseat(state)
  }
  // Paid customers leave by the door.
  state.customers = state.customers.filter(c => !(c.state === 'leaving' && !c.path.length))
  extTick(state, dt)
  if (state.phase === 'closing' && state.customers.length === 0) {
    state.phase = 'receipt'
    extOnClose(state)
    event(state, { kind: 'phase', text: 'Closing time' })
  }
}

/** The longest stretch one catch-up replays (a host tab woken after a long sleep). */
export const MAX_CATCH_UP = 120

/**
 * Advance the day by real elapsed seconds in 0.25 s steps (tick() takes at most 0.25 at a time), so a host
 * whose tab gets few or no frames keeps the salon running at full speed for the guests.
 */
export function runFor(state: SalonState, seconds: number) {
  let left = Math.min(MAX_CATCH_UP, Math.max(0, seconds))
  while (left > 1e-6) { const d = Math.min(0.25, left); tick(state, d); left -= d }
}

function seatPoint(seat: number | null): Pt {
  if (seat === null) return STANDING[0]
  return seat < SOFA_SEATS.length ? SOFA_SEATS[seat] : STANDING[(seat - SOFA_SEATS.length) % STANDING.length]
}

function takeSeat(state: SalonState): number {
  const taken = state.customers.filter(c => c.seat !== null).map(c => c.seat!)
  for (let i = 0; ; i++) if (!taken.includes(i)) return i
}

/** When a sofa seat frees up, someone standing sits down. */
function reseat(state: SalonState) {
  const standing = state.customers.filter(c => c.state === 'waiting' && c.seat !== null && c.seat >= SOFA_SEATS.length)
  for (const c of standing) {
    const taken = state.customers.filter(o => o.seat !== null).map(o => o.seat!)
    const free = SOFA_SEATS.findIndex((_, i) => !taken.includes(i))
    if (free < 0) return
    c.seat = free
    c.path = pathOnFloor(state, c, SOFA_SEATS[free])
  }
}

/** The day's awards, for the receipt. */
export function awards(stats: DayStats): { title: string; name: string; value: string }[] {
  const players = Object.values(stats.byPlayer)
  if (!players.length) return []
  const out: { title: string; name: string; value: string }[] = []
  type Key = 'popped' | 'extracted' | 'tips' | 'served' | 'foam' | 'nails' | 'feet'
  const best = (key: Key) => players.reduce((a, b) => ((b[key] ?? 0) > (a[key] ?? 0) ? b : a))
  const add = (title: string, key: Key, unit: (n: number) => string) => {
    const p = best(key)
    if ((p[key] ?? 0) > 0) out.push({ title, name: p.name, value: unit(p[key] ?? 0) })
  }
  add('Most pimples popped', 'popped', n => `${n} popped`)
  add('Blackhead hunter', 'extracted', n => `${n} extracted`)
  add('Tip magnet', 'tips', n => `$${n} in tips`)
  add('Busiest hands', 'served', n => `${n} customers`)
  add('Foam artist', 'foam', n => `${Math.round(n)} bubbles`)
  add('Nail artist', 'nails', n => `${n} manicures`)
  add('Foot whisperer', 'feet', n => `${n} ${n === 1 ? 'pedicure' : 'pedicures'}`)
  const fastest = players.filter(p => p.fastest !== null).sort((a, b) => a.fastest! - b.fastest!)[0]
  if (fastest) out.push({ title: 'Speedy hands', name: fastest.name, value: `${Math.floor(fastest.fastest! / 60)}:${String(fastest.fastest! % 60).padStart(2, '0')}` })
  return out.slice(0, 4)
}

/** Everything the receipt shows. */
export function receipt(state: SalonState) {
  const s = state.stats
  const wages = state.ext?.today.wages ?? 0
  return {
    day: state.day,
    revenue: s.revenue,
    tips: s.tips,
    costs: s.costs,
    wages,
    net: s.revenue + s.tips - s.costs - wages,
    served: s.served,
    ratingBefore: s.ratingBefore,
    ratingAfter: average(state.rating),
    reviewsTotal: state.rating.count,
    reviews: s.reviews,
    awards: awards(s),
  }
}
