import { reduce, tick as coreTick, MAX_CATCH_UP, type SalonState } from '../src/core/salon.ts'
import { TREATMENTS } from '../src/core/treatments/registry.ts'

/**
 * The day as a player plays it since customers wait to be called: before every tick the first player taps each
 * free station that has someone waiting for it (a prompt player; the game's player taps when they are ready).
 * Staffed stations call by themselves inside the core tick. Tests about the day's systems use these; the call
 * itself is tested in salon.test.ts.
 */
export function callFree(state: SalonState) {
  if (state.phase !== 'open' && state.phase !== 'closing') return
  const by = state.players[0]?.id ?? 0
  for (const s of state.stations) {
    if (s.customer !== null || s.slot < 0) continue
    if (state.customers.some(c => (c.state === 'waiting' || c.state === 'entering') && TREATMENTS[c.plan.treatment].station === s.kind)) reduce(state, by, { a: 'call', station: s.id })
  }
}

export function tick(state: SalonState, dt: number) { callFree(state); coreTick(state, dt) }

export function runFor(state: SalonState, seconds: number) {
  let left = Math.min(MAX_CATCH_UP, Math.max(0, seconds))
  while (left > 1e-6) { const d = Math.min(0.25, left); tick(state, d); left -= d }
}
