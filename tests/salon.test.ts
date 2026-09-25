import { check } from './harness.ts'
import { newSave, startDay, reduce, tick, receipt, awards, toSave, completionOf, type SalonState } from '../src/core/salon.ts'
import { ITEMS, canBuy, customersPerDay, ambiencePoints, ambienceStars, wealth, toolTier, payFor, tipFor, nextUnlock, START_MONEY, CONFIRM_PRICE } from '../src/core/economy.ts'
import { starsFor, speedScore, writeReview, average, addReview, revealTitle } from '../src/core/reviews.ts'
import { planDay } from '../src/core/customers.ts'
import { ext } from '../src/core/salon-ext.ts'
import { blockedGrid, findPath, SLOTS, SOFA_SEATS, DOOR_INSIDE } from '../src/core/floor.ts'
import type { TreatmentResult } from '../src/core/treatments/session.ts'

const goodResult = (treatment: 'facial' | 'nails' = 'facial'): TreatmentResult => ({ treatment, seconds: 150, par: 170, required: 12, done: 12, skipped: 0, optionalDone: 1, popped: 6, extracted: 12, fourHands: false, wishMatched: null, disaster: false, thoroughness: 0.96 })

/** Run the host's clock until a condition or a time limit. */
function runUntil(state: SalonState, done: () => boolean, seconds = 600) {
  for (let t = 0; t < seconds && !done(); t += 0.1) tick(state, 0.1)
}

export function run() {
  // ---------------------------------------------------------------- economy
  check('start money affordable decor', START_MONEY >= 45)
  check('every item has a price and tab', ITEMS.every(i => (i.price > 0 || i.gift) && i.tab))
  check('something affordable after day 1 (< $150)', ITEMS.filter(i => !i.soon && !i.needs && i.price <= 150).length >= 3)
  check('4 customers on day 1, 5 on day 2', customersPerDay([], 1, 1) === 4 && customersPerDay([], 2, 1) === 5 && customersPerDay(['flyers'], 1, 1) === 5)
  check('growth follows the stations', customersPerDay([], 9, 1) === 5 && customersPerDay([], 9, 3) > customersPerDay([], 9, 2))
  check('wealth grows with marketing', wealth(['flyers', 'social']) > wealth([]))
  check('ambience from decor', ambiencePoints(['plant', 'neon']) === 3 && ambienceStars([]) === 1 && ambienceStars(['plant', 'neon']) > 1)
  check('tool tier', toolTier(['facial-kit-2'], 'facial') === 2 && toolTier([], 'facial') === 1)
  check('needs are enforced', !canBuy([], 9999, 'facial-kit-3').ok && canBuy(['facial-kit-2'], 9999, 'facial-kit-3').ok)
  check('money is enforced', !canBuy([], 10, 'plant').ok)
  check('staff is phase 2', !canBuy([], 99999, 'stylist').ok)
  check('disaster pays more', payFor(38, [], true) > payFor(38, [], false))
  check('tips grow with stars', tipFor(40, 5, 1, []) > tipFor(40, 2, 1, []))
  check('tips grow with decor', tipFor(40, 4, 1, ['plant', 'candles', 'rug']) > tipFor(40, 4, 1, []))
  check('tips never negative', tipFor(40, 1, 0.2, []) >= 0)
  check('next unlock teaser', nextUnlock([]) !== null)

  // ---------------------------------------------------------------- reviews
  check('speed score', speedScore(100, 170) === 1 && speedScore(510, 170) === 0)
  check('thorough and quick is 5 stars', starsFor({ thoroughness: 1, seconds: 120, par: 170 }, 1, 3) === 5)
  check('skipping everything is low', starsFor({ thoroughness: 0.1, seconds: 400, par: 170 }, 0.3, 1) <= 2)
  check('stars in range', [0, 0.5, 1].every(t => { const s = starsFor({ thoroughness: t, seconds: 170, par: 170 }, t, 1); return s >= 1 && s <= 5 }))
  const review = writeReview({ id: 'x', day: 1, name: 'Mira', stars: 5, result: goodResult(), mood: 1, regular: true, disaster: false, ambience: 2, seed: 4 })
  check('review has text', review.text.length > 10 && review.stars === 5, review.text)
  check('review mentions no em dash', !review.text.includes('—'))
  const rushed = writeReview({ id: 'y', day: 1, name: 'Leo', stars: 2, result: { ...goodResult(), skipped: 4, done: 8, thoroughness: 0.6 }, mood: 0.3, regular: false, disaster: false, ambience: 1, seed: 5 })
  check('rushed review reacts', /skip|rushed|wait/i.test(rushed.text), rushed.text)
  check('average', average({ sum: 9, count: 2 }) === 4.5 && average(addReview({ sum: 0, count: 0 }, 5)) === 5)

  // ---------------------------------------------------------------- customers
  const plans = planDay({ day: 1, seed: 42, count: 3, treatments: ['facial'], met: [] })
  check('plan count', plans.length === 3)
  check('no debug regular on day 1', plans[0].regular === null && plans.every(p => p.name !== 'Mira'))
  check('arrivals ordered', plans.every((p, i) => i === 0 || p.arriveAt > plans[i - 1].arriveAt))
  check('the very first customer is never a disaster', Array.from({ length: 40 }, (_, k) => planDay({ day: 1, seed: k, count: 4, treatments: ['facial'], met: [] })[0]).every(p => !p.disaster))
  const later = Array.from({ length: 30 }, (_, d) => planDay({ day: d + 2, seed: 42, count: 5, treatments: ['facial', 'nails'], met: ['mira', 'rosa'] })).flat()
  check('disaster cases happen later', later.some(p => p.disaster))
  check('both treatments booked', later.some(p => p.treatment === 'nails') && later.some(p => p.treatment === 'facial'))
  check('only bookable treatments', planDay({ day: 5, seed: 1, count: 8, treatments: ['facial'], met: [] }).every(p => p.treatment === 'facial'))

  // ---------------------------------------------------------------- floor
  const grid = blockedGrid([0, 1], [])
  const path = findPath(grid, DOOR_INSIDE, SOFA_SEATS[0])
  check('path reaches the sofa', path.length > 0 && path[path.length - 1] === SOFA_SEATS[0])
  const toSlot = findPath(grid, DOOR_INSIDE, { x: SLOTS[4].x - 100, y: SLOTS[4].y + 30 })
  check('path to a station spot', toSlot.length > 0)

  // ---------------------------------------------------------------- the day loop
  const state = startDay(newSave(99))
  reduce(state, 0, { a: 'join', name: 'Kaizen' })
  check('prep first', state.phase === 'prep' && state.day === 1 && state.stations.length === 1)
  check('schedule planned', state.schedule.length === 4)
  check('cannot finish without a customer', !reduce(state, 0, { a: 'finish', station: 's0', result: goodResult() }))
  check('open', reduce(state, 0, { a: 'open' }) && state.phase === 'open')
  runUntil(state, () => state.customers.length > 0)
  check('a customer arrives', state.customers.length === 1 && state.events.some(e => e.kind === 'arrive'))
  runUntil(state, () => state.customers[0]?.state === 'seated')
  const c = state.customers[0]
  check('first customer sits at the station', c.state === 'seated' && state.stations[0].customer === c.id)
  check('work starts the treatment', reduce(state, 0, { a: 'work', station: 's0' }) && state.stations[0].lead === 0 && c.state === 'treating')
  check('progress reported', reduce(state, 0, { a: 'progress', station: 's0', step: 4, steps: 13, progress: 0.5 }) && state.stations[0].step === 4)
  const money0 = state.money
  check('finish pays', reduce(state, 0, { a: 'finish', station: 's0', result: goodResult(), foam: 120 }))
  check('money went up', state.money > money0, [money0, state.money])
  check('customer leaves', c.state === 'leaving' && state.stations[0].customer === null)
  check('a review was written', state.stats.reviews.length === 1 && state.rating.count === 1)
  // Serve the rest.
  const phase = (): string => state.phase
  for (let k = 0; k < 10 && phase() !== 'receipt'; k++) {
    runUntil(state, () => phase() === 'receipt' || state.stations[0].customer !== null && state.customers.find(x => x.id === state.stations[0].customer)?.state === 'seated')
    if (phase() === 'receipt') break
    reduce(state, 0, { a: 'work', station: 's0' })
    reduce(state, 0, { a: 'finish', station: 's0', result: goodResult() })
  }
  runUntil(state, () => state.phase === 'receipt')
  check('the day closes to a receipt', state.phase === 'receipt')
  const rc = receipt(state)
  check('receipt adds up', rc.net === rc.revenue + rc.tips - rc.costs && rc.served === 4, rc)
  check('receipt rating', rc.ratingAfter > 0 && rc.reviews.length === 4)
  check('awards', awards(state.stats).length >= 2)
  check('day 1 goal reached and paid', state.ext?.today.goal?.done === true && state.events.some(e => e.kind === 'goal'))
  // Mood drains while waiting but never below the floor; nobody walks out.
  const waitState = startDay(newSave(5))
  reduce(waitState, 0, { a: 'join', name: 'A' })
  reduce(waitState, 0, { a: 'open' })
  for (let t = 0; t < 3000; t++) tick(waitState, 0.25)
  check('nobody walks out', waitState.customers.length === 4 && waitState.phase === 'closing')
  check('mood floor', waitState.customers.every(x => x.mood >= 0.2))

  // Purchase and next day.
  const save = toSave(state)
  check('save keeps money', save.money === state.money)
  state.money = 1000
  check('the second chair arrives in the shop on day 4', !reduce(state, 0, { a: 'buy', item: 'facial-chair-2' }) && state.owned.length === 0)
  state.day = 5
  check('buy decor', reduce(state, 0, { a: 'buy', item: 'plant' }) && state.owned.includes('plant') && state.money === 955)
  check('cannot buy twice', !reduce(state, 0, { a: 'buy', item: 'plant' }))
  check('solo big buy needs no vote', reduce(state, 0, { a: 'buy', item: 'facial-chair-2' }) && state.stations.length === 2)
  check('a new station waits to be placed', state.stations[1].slot === -1)
  check('placing it in a taken slot is refused', !reduce(state, 0, { a: 'place', station: 's1', slot: state.stations[0].slot }))
  check('the player places it in a free slot', reduce(state, 0, { a: 'place', station: 's1', slot: 6 }) && state.stations[1].slot === 6 && state.events.some(e => e.kind === 'placed'))
  check('next day', reduce(state, 0, { a: 'next' }) && state.day === 6 && state.phase === 'prep')
  check('stations kept', state.stations.length === 2 && state.players.length === 1 && state.stations[1].slot === 6)
  check('swap slots in prep', reduce(state, 0, { a: 'swap', station: 's1', slot: 5 }) && state.stations[1].slot === 5)
  check('the nail bar comes with its desk for about $200', (() => { state.money = 205; return reduce(state, 0, { a: 'buy', item: 'treat-nails' }) && state.owned.includes('nail-desk') && state.stations.some(st => st.kind === 'nails') && state.money === 5 })())
  const unplaced = state.stations.find(st => st.kind === 'nails')!
  check('an unplaced station takes a free slot when the salon opens', reduce(state, 0, { a: 'open' }) && unplaced.slot >= 0 && new Set(state.stations.map(st => st.slot)).size === state.stations.length)
  check('big purchases confirm threshold', CONFIRM_PRICE === 200)

  // ---------------------------------------------------------------- bought in the morning, used the same day (C2-07)
  const morning = startDay({ ...newSave(61), day: 4, money: 1000 })
  reduce(morning, 0, { a: 'join', name: 'Kai' })
  const planned = morning.schedule.length
  reduce(morning, 0, { a: 'buy', item: 'facial-chair-2' })
  check('a chair bought before opening brings more customers that day', morning.schedule.length > planned, { planned, now: morning.schedule.length })
  reduce(morning, 0, { a: 'buy', item: 'treat-nails' })
  check('a nail bar bought before opening brings nail customers that day', morning.schedule.some(p => p.treatment === 'nails'))
  check('the goal follows the new day', ext(morning).today.goal !== null)
  const names = morning.schedule.map(p => p.name)
  check('re-planning keeps names unique', new Set(names).size === names.length)
  reduce(morning, 0, { a: 'open' })
  const opened = morning.schedule.map(p => p.name).join()
  morning.money = 1000
  morning.phase = 'prep'
  morning.spawned = 1
  morning.day = 9
  check('once customers are on their way, the day is not planned again', reduce(morning, 0, { a: 'buy', item: 'nail-desk-2' }) && morning.schedule.map(p => p.name).join() === opened)

  // ---------------------------------------------------------------- skipped steps pay less (C2-02)
  const paid = (result: TreatmentResult) => {
    const st = startDay(newSave(88))
    reduce(st, 0, { a: 'join', name: 'Kai' })
    reduce(st, 0, { a: 'open' })
    runUntil(st, () => st.stations[0].customer !== null && st.customers.some(c => c.state === 'seated'))
    reduce(st, 0, { a: 'work', station: 's0' })
    const c = st.customers.find(x => x.id === st.stations[0].customer)!
    c.mood = 1
    reduce(st, 0, { a: 'finish', station: 's0', result })
    return { revenue: st.stats.revenue, text: st.events.filter(e => e.kind === 'paid').at(-1)?.text ?? '' }
  }
  const full = paid(goodResult())
  const none = paid({ ...goodResult(), done: 0, skipped: 12, thoroughness: 0, seconds: 40, popped: 0, extracted: 0, optionalDone: 0 })
  const most = paid({ ...goodResult(), done: 9, skipped: 3, thoroughness: 0.7 })
  check('skip pay: every step done pays the full price', full.revenue === 38 && !full.text.includes('rushed'), full)
  check('skip pay: nothing done pays 40%', none.revenue === Math.round(38 * 0.4) && none.text.includes('rushed'), none)
  check('skip pay: most steps done pays most of it', most.revenue > none.revenue && most.revenue < full.revenue && !most.text.includes('rushed'), most)
  check('skip pay: completion is clamped', completionOf({ done: 20, required: 10 }) === 1 && completionOf({ done: 0, required: 0 }) === 0)
  check('reveal: a rushed job is never glowing', !revealTitle('Ella', 2).includes('glowing') && !revealTitle('Ella', 3).includes('glowing') && revealTitle('Ella', 4) === 'Ella is glowing!' && revealTitle('Ella', 5) === 'Ella is glowing!')
}
