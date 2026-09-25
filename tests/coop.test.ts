import { check } from './harness.ts'
import { MAX_CATCH_UP, newSave, startDay, reduce } from '../src/core/salon.ts'
import { runFor, tick } from './calls.ts'
import { handleGuestMessage, parseGuestMessage, publicState, routeOps, stationCrew } from '../src/core/coop/protocol.ts'

export function run() {
  // Day 5: the second chair is in the shop by then.
  const state = startDay({ ...newSave(7), day: 5 })
  reduce(state, 0, { a: 'join', name: 'Kaizen' })
  // A guest says hello and becomes a player.
  handleGuestMessage(state, 1, { t: 'hello', name: 'Anna<script>' })
  check('guest joined', state.players.length === 2 && state.players[1].id === 1)
  check('names are cleaned', !state.players[1].name.includes('<'))
  // A guest cannot fake a join for someone else: the relay's `from` decides who acts.
  handleGuestMessage(state, 1, { t: 'act', a: { a: 'pos', x: 300, y: 400, f: -1, m: true } })
  check('guest moves itself', state.players[1].x === 300 && state.players[1].facing === -1 && state.players[0].x !== 300)
  check('join through act ignored', handleGuestMessage(state, 2, { t: 'act', a: { a: 'join', name: 'X' } }).length === 0 && state.players.length === 2)

  // Shared wallet, and a big purchase needs both players.
  state.money = 1000
  handleGuestMessage(state, 1, { t: 'act', a: { a: 'buy', item: 'plant' } })
  check('small buy is instant', state.owned.includes('plant') && state.money === 955)
  handleGuestMessage(state, 1, { t: 'act', a: { a: 'buy', item: 'facial-chair-2' } })
  check('big buy waits for a vote', state.pending !== null && !state.owned.includes('facial-chair-2'))
  reduce(state, 0, { a: 'vote', id: state.pending!.id, yes: true })
  check('both yes buys it', state.pending === null && state.owned.includes('facial-chair-2') && state.stations.length === 2)
  handleGuestMessage(state, 1, { t: 'act', a: { a: 'buy', item: 'treat-nails' } })
  const pendingId = state.pending?.id ?? -1
  reduce(state, 0, { a: 'vote', id: pendingId, yes: false })
  check('a no cancels', pendingId > 0 && state.pending === null && !state.owned.includes('treat-nails'))
  // A vote never stalls on someone who left.
  reduce(state, 0, { a: 'buy', item: 'treat-nails' })
  check('host proposes', state.pending !== null)
  reduce(state, 1, { a: 'leave' })
  check('leaving settles the vote', state.pending === null && state.owned.includes('treat-nails'))
  handleGuestMessage(state, 1, { t: 'hello', name: 'Anna' })

  // Both work stations at the same time.
  reduce(state, 0, { a: 'open' })
  // The two facial chairs (the nail bar's desk waits for a manicure customer).
  const chairs = state.stations.filter(s => s.kind === 'facial')
  for (let t = 0; t < 2400 && chairs.some(s => s.customer === null || state.customers.find(c => c.id === s.customer)?.state !== 'seated'); t++) tick(state, 0.1)
  check('both stations have customers', chairs.length === 2 && chairs.every(s => s.customer !== null))
  check('host works s0', reduce(state, 0, { a: 'work', station: 's0' }))
  handleGuestMessage(state, 1, { t: 'act', a: { a: 'work', station: 's1' } })
  check('guest works s1', state.stations[1].lead === 1 && state.players.find(p => p.id === 1)!.station === 's1')
  // A guest cannot report progress for a station it does not lead.
  handleGuestMessage(state, 1, { t: 'act', a: { a: 'progress', station: 's0', step: 9, steps: 13, progress: 1 } })
  check('progress only from the lead', state.stations[0].step !== 9)

  // Four hands: the guest joins the host's station as a helper; ops flow between them.
  handleGuestMessage(state, 1, { t: 'act', a: { a: 'work', station: 's0' } })
  check('guest helps at s0', state.stations[0].lead === 0 && state.stations[0].helpers.includes(1) && state.stations[1].lead === null)
  check('crew', stationCrew(state, 's0').join() === '0,1')
  const op = { k: 'lamp' as const, x: 500, y: 600, on: true }
  const fromGuest = handleGuestMessage(state, 1, { t: 'ops', st: 's0', ops: [op] })
  check('guest op goes to the host (lead)', fromGuest.length === 1 && fromGuest[0].to === 0 && fromGuest[0].msg.t === 'ops')
  const fromHost = routeOps(state, 's0', 0, [op])
  check('host op goes to the helper', fromHost.length === 1 && fromHost[0].to === 1)
  check('outsider ops dropped', routeOps(state, 's0', 2, [op]).length === 0)
  const sync = handleGuestMessage(state, 1, { t: 'syncReq', st: 's0' })
  check('sync request goes to the lead', sync.length === 1 && sync[0].to === 0)
  check('only the lead can answer a sync', handleGuestMessage(state, 1, { t: 'sync', st: 's0', to: 0, snap: {} as never }).length === 0)

  // Drop-out: the lead leaves, the helper takes over; nothing stalls.
  reduce(state, 0, { a: 'leave' })
  check('helper promoted to lead', state.stations[0].lead === 1)
  reduce(state, 0, { a: 'join', name: 'Kaizen' })
  handleGuestMessage(state, 1, { t: 'act', a: { a: 'stopWork', station: 's0' } })
  check('a paused station waits for anyone', state.stations[0].lead === null && state.stations[0].customer !== null)
  check('anyone can resume', reduce(state, 0, { a: 'work', station: 's0' }) && state.stations[0].lead === 0)

  // Snapshot sent to guests hides the schedule and the paths.
  const snap = publicState(state)
  check('snapshot small', !('schedule' in snap) && snap.customers.every(c => !('path' in c)))
  check('snapshot json', JSON.stringify(snap).length < 60000)

  // Parsing is defensive.
  check('parse hello', parseGuestMessage({ t: 'hello', name: 'A' })?.t === 'hello')
  check('parse junk', parseGuestMessage({ t: 'nope' }) === null && parseGuestMessage(null) === null && parseGuestMessage({ t: 'ops', st: 1 }) === null && parseGuestMessage({ t: 'ops', st: 's0', ops: [{ k: 'tap' }] })?.t === 'ops')

  // The host's clock: a throttled tab wakes once a minute; the catch-up replays the whole minute in 0.25 s steps.
  const woke = startDay(newSave(31))
  reduce(woke, 0, { a: 'join', name: 'Host' })
  reduce(woke, 0, { a: 'open' })
  const stepped = structuredClone(woke)
  runFor(woke, 60)
  for (let i = 0; i < 240; i++) tick(stepped, 0.25)
  check('catch-up: a minute asleep is a minute of the day', Math.abs(woke.clock - 60) < 1e-6, woke.clock)
  check('catch-up: the same day as ticking every quarter second', woke.spawned === stepped.spawned && woke.customers.length === stepped.customers.length && woke.spawned > 0, { woke: woke.spawned, stepped: stepped.spawned })
  const long = startDay(newSave(32))
  reduce(long, 0, { a: 'open' })
  runFor(long, 3600)
  check('catch-up: one wake-up replays at most two minutes', long.clock <= MAX_CATCH_UP + 1e-6 && long.clock > MAX_CATCH_UP - 1, long.clock)
  const before = long.clock
  runFor(long, -5)
  check('catch-up: time never runs backwards', long.clock === before)
}
