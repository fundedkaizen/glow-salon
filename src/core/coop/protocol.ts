import { reduce, type Action, type SalonState } from '../salon.ts'
import type { Op, SessionSnapshot } from '../treatments/session.ts'

/**
 * Co-op messages and the host's routing, kept pure so they can be tested without a network. The relay
 * (server/coop-relay.mjs) numbers players: the host 0, guests 1 to 3. Guests talk only to the host; the host
 * applies their actions to the one salon state and passes treatment ops on to whoever shares that station.
 */
export type GuestMessage =
  | { t: 'hello'; name: string }
  | { t: 'act'; a: Action }
  | { t: 'op'; st: string; op: Op }
  | { t: 'syncReq'; st: string }
  | { t: 'sync'; st: string; to: number; snap: SessionSnapshot }

export type HostMessage =
  | { t: 'snap'; s: PublicState }
  | { t: 'op'; st: string; op: Op; by: number }
  | { t: 'syncReq'; st: string; by: number }
  | { t: 'sync'; st: string; snap: SessionSnapshot }

/** The salon as guests see it: everything but the day's hidden schedule and walking paths. */
export type PublicState = Omit<SalonState, 'schedule' | 'customers'> & { customers: Omit<SalonState['customers'][number], 'path'>[]; scheduled: number }

export function publicState(state: SalonState): PublicState {
  const { schedule, customers, ...rest } = state
  return { ...rest, reviews: state.reviews.slice(-12), scheduled: schedule.length, customers: customers.map(({ path: _path, ...c }) => c) }
}

/** A message for a player: 0 is the host itself (handled locally), guests go through the relay with `to`. */
export type Delivery = { to: number; msg: HostMessage }

/** Everyone working at a station. */
export function stationCrew(state: Pick<SalonState, 'stations'>, stationId: string): number[] {
  const s = state.stations.find(st => st.id === stationId)
  if (!s) return []
  return [s.lead, ...s.helpers].filter((id): id is number => id !== null)
}

/** Where a treatment op from `from` goes: to the rest of that station's crew. */
export function routeOp(state: Pick<SalonState, 'stations'>, stationId: string, from: number, op: Op): Delivery[] {
  const crew = stationCrew(state, stationId)
  if (!crew.includes(from)) return []
  return crew.filter(id => id !== from).map(to => ({ to, msg: { t: 'op', st: stationId, op, by: from } }))
}

/**
 * The host receives a guest's message: apply it to the salon, or say where it goes next. `from` is set by
 * the relay, so a guest cannot act as someone else.
 */
export function handleGuestMessage(state: SalonState, from: number, message: GuestMessage): Delivery[] {
  switch (message.t) {
    case 'hello': reduce(state, from, { a: 'join', name: message.name }); return []
    case 'act':
      if (!message.a || typeof message.a !== 'object' || message.a.a === 'join') return []
      reduce(state, from, message.a)
      return []
    case 'op': return routeOp(state, message.st, from, message.op)
    case 'syncReq': {
      const s = state.stations.find(st => st.id === message.st)
      if (!s || s.lead === null || s.lead === from) return []
      return [{ to: s.lead, msg: { t: 'syncReq', st: message.st, by: from } }]
    }
    case 'sync': {
      const s = state.stations.find(st => st.id === message.st)
      if (!s || s.lead !== from || !stationCrew(state, message.st).includes(message.to)) return []
      return [{ to: message.to, msg: { t: 'sync', st: message.st, snap: message.snap } }]
    }
  }
}

/** Parse a relay frame defensively: anything malformed is dropped. */
export function parseGuestMessage(raw: unknown): GuestMessage | null {
  if (!raw || typeof raw !== 'object') return null
  const m = raw as Record<string, unknown>
  switch (m.t) {
    case 'hello': return typeof m.name === 'string' ? { t: 'hello', name: m.name.slice(0, 16) } : null
    case 'act': return m.a && typeof m.a === 'object' && typeof (m.a as { a?: unknown }).a === 'string' ? { t: 'act', a: m.a as Action } : null
    case 'op': return typeof m.st === 'string' && m.op && typeof m.op === 'object' && typeof (m.op as { k?: unknown }).k === 'string' ? { t: 'op', st: m.st, op: m.op as Op } : null
    case 'syncReq': return typeof m.st === 'string' ? { t: 'syncReq', st: m.st } : null
    case 'sync': return typeof m.st === 'string' && typeof m.to === 'number' && m.snap && typeof m.snap === 'object' ? { t: 'sync', st: m.st, to: m.to, snap: m.snap as SessionSnapshot } : null
  }
  return null
}
