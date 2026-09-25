import { check } from './harness.ts'
import { newSave, reduce, startDay, toSave, type SalonState } from '../src/core/salon.ts'
import { tick } from './calls.ts'
import { canBuy, ITEM_BY_ID, ITEMS, type Item } from '../src/core/economy.ts'
import { candidates, ext, hireCheck } from '../src/core/salon-ext.ts'
import { CAMPAIGNS, canRunCampaign } from '../src/core/marketing.ts'
import { DECOR_SETS, DECOR_ITEM_BY_ID } from '../src/core/decor.ts'
import { STAFF_ID_BASE } from '../src/core/staff.ts'
import type { TreatmentResult } from '../src/core/treatments/session.ts'
import type { TreatmentId } from '../src/core/treatments/types.ts'
import type { GoogleReview } from '../src/core/review-writer.ts'

/**
 * The economy, played for 30 days by a simulated player with the real salon rules (customers, staff, wages,
 * tips, set bonuses, goals). The player serves customers at a relaxed pace (about three minutes each, every
 * step done), shops each morning for the cheapest new thing they can afford, and buys a little decor when
 * money allows. The pacing must hold: something affordable every morning, the nail bar by day 2, and a new
 * unlock (a station, a tool, a treatment, a hire, a new decor set or a new kind of campaign) at least every
 * three days.
 */
const DAYS = 30
const perfect = (treatment: TreatmentId, seconds: number): TreatmentResult => ({ treatment, seconds, par: treatment === 'facial' ? 170 : treatment === 'feet' ? 210 : 190, required: 12, done: 12, skipped: 0, optionalDone: 1, popped: treatment === 'facial' ? 6 : 0, extracted: treatment === 'facial' ? 11 : 0, fourHands: false, wishMatched: treatment === 'nails' ? true : null, disaster: false, thoroughness: 0.96 })

const BIG_TABS = new Set(['tools', 'stations', 'treatments'])

type Unlock = { id: string; price: number; buy: (s: SalonState) => boolean }

/** Every new thing the salon could get this morning. */
function unlocksFor(s: SalonState, ran: Set<string>): Unlock[] {
  const out: Unlock[] = []
  for (const item of ITEMS) {
    if (item.soon || item.gift || !BIG_TABS.has(item.tab) || s.owned.includes(item.id)) continue
    if ((item.needs ?? []).some(n => !s.owned.includes(n)) || (item.unlockDay ?? 0) > s.day) continue
    // Refused whatever the money (no room left on the floor for another station): not an unlock.
    if (!canBuy(s.owned, 1e9, item.id, s.day).ok) continue
    out.push({ id: item.id, price: item.price, buy: st => reduce(st, 0, { a: 'buy', item: item.id }) })
  }
  candidates(s).forEach((c, idx) => {
    const ok = hireCheck(s, idx)
    if (ok.ok || ok.reason.startsWith('Needs $')) out.push({ id: `hire:${c.name}`, price: c.fee, buy: st => reduce(st, 0, { a: 'hire', idx }) })
  })
  for (const set of DECOR_SETS) {
    if (set.items.some(i => s.owned.includes(i.id))) continue
    const gate = ITEM_BY_ID[set.items[0].id].needs?.[0]
    if (gate && !s.owned.includes(gate)) continue
    const first = set.items.map(i => ITEM_BY_ID[i.id]).sort((a, b) => a.price - b.price)[0]
    if ((first.unlockDay ?? 0) > s.day) continue
    out.push({ id: `set:${set.id}`, price: first.price, buy: st => reduce(st, 0, { a: 'buy', item: first.id }) })
  }
  for (const c of CAMPAIGNS) {
    if (ran.has(c.id)) continue
    const e = ext(s)
    const ok = canRunCampaign(c.id, e.campaigns, e.loyalty, 1e9, s.day)
    if (ok.ok) out.push({ id: `campaign:${c.id}`, price: c.price, buy: st => { const done = reduce(st, 0, { a: 'campaign', id: c.id }); if (done) ran.add(c.id); return done } })
  }
  // A sensible player saves for new treatments, stations and tools first, then hires, then the rest.
  const rank = (u: Unlock) => (ITEM_BY_ID[u.id] ? 0 : u.id.startsWith('hire:') ? 1 : 2)
  return out.sort((a, b) => rank(a) - rank(b) || a.price - b.price)
}

/** The cheapest thing on sale this morning (shop items and campaigns). */
function cheapestOnSale(s: SalonState): number {
  const e = ext(s)
  const items = ITEMS.filter((i: Item) => !i.soon && !i.gift && i.tab !== 'marketing' && canBuy(s.owned, 1e9, i.id, s.day).ok).map(i => i.price)
  const campaigns = CAMPAIGNS.filter(c => canRunCampaign(c.id, e.campaigns, e.loyalty, 1e9, s.day).ok).map(c => c.price)
  return Math.min(...items, ...campaigns)
}

/** One day on the floor: the player takes whoever is seated, about three minutes each. */
function playDay(s: SalonState) {
  reduce(s, 0, { a: 'open' })
  let at: string | null = null, until = 0
  for (let t = 0; t < 6000 && s.phase !== 'receipt'; t += 0.25) {
    tick(s, 0.25)
    if (at && s.clock >= until) {
      const st = s.stations.find(x => x.id === at)!
      const c = s.customers.find(x => x.id === st.customer)
      reduce(s, 0, { a: 'finish', station: at, result: perfect(c?.plan.treatment ?? 'facial', Math.round(until - (until - 175))) })
      at = null
    }
    if (!at) {
      // A free chair of their own first, then any seated customer nobody is on yet.
      const seated = s.stations.filter(st => st.lead === null && st.customer !== null && s.customers.find(c => c.id === st.customer)?.state === 'seated')
      const mine = seated.find(st => !s.ext?.staff.some(m => m.station === st.id && m.breakLeft <= 0)) ?? seated[0]
      if (mine && reduce(s, 0, { a: 'work', station: mine.id })) {
        const c = s.customers.find(x => x.id === mine.customer)!
        at = mine.id
        until = s.clock + (c.plan.treatment === 'facial' ? 175 : 185)
      }
    }
  }
}

export function run() {
  let s = startDay(newSave(424242), [])
  reduce(s, 0, { a: 'join', name: 'Sim' })
  const ran = new Set<string>()
  const unlockDays: number[] = []
  const rows: string[] = []
  const affordable: boolean[] = []
  const lows: number[] = []
  let nailsDay = -1
  let staffServed = 0, playerServed = 0
  for (let day = 1; day <= DAYS; day++) {
    // Morning: is anything affordable? Then shop.
    affordable.push(s.money >= cheapestOnSale(s))
    lows.push(s.money)
    if (nailsDay < 0 && canBuy(s.owned, s.money, 'treat-nails', s.day).ok) nailsDay = day
    const bought: string[] = []
    for (let guard = 0; guard < 6; guard++) {
      const next = unlocksFor(s, ran).find(u => u.price <= s.money)
      if (!next || !next.buy(s)) break
      bought.push(next.id)
      if (!unlockDays.includes(day)) unlockDays.push(day)
    }
    // A little decor when there is room for it after saving for the next unlock.
    const goal = unlocksFor(s, ran).find(u => ITEM_BY_ID[u.id])?.price ?? 0
    const decor = ITEMS.filter(i => i.tab === 'decor' && !i.gift && canBuy(s.owned, s.money, i.id, s.day).ok).sort((a, b) => a.price - b.price)[0]
    if (decor && s.money - decor.price >= goal * 0.5) { reduce(s, 0, { a: 'buy', item: decor.id }); bought.push(DECOR_ITEM_BY_ID[decor.id]?.label ?? decor.id) }
    const morning = s.money
    playDay(s)
    for (const r of s.stats.reviews as GoogleReview[]) if (r.staff === 'Sim') playerServed++; else staffServed++
    rows.push(`day ${String(day).padStart(2)}: ${String(s.schedule.length).padStart(2)} customers, ${s.stations.length} stations, ${s.ext?.staff.length ?? 0} staff, $${morning} -> $${s.money}${bought.length ? `, bought ${bought.join(', ')}` : ''}`)
    reduce(s, 0, { a: 'next' })
    // A saved and reloaded morning, as the game does.
    s = startDay(toSave(s), s.players)
  }
  if (process.env.SIM_LOG) console.log(rows.join('\n'))
  const gaps = unlockDays.map((d, i) => d - (i ? unlockDays[i - 1] : 0))
  check('sim: something affordable every morning', affordable.every(Boolean), affordable.map((a, i) => a ? '' : `day ${i + 1}`).filter(Boolean))
  check('sim: the nail bar is affordable by the morning of day 2', nailsDay > 0 && nailsDay <= 2, nailsDay)
  check('sim: a new unlock at least every 3 days', gaps.every(g => g <= 3) && unlockDays[unlockDays.length - 1] >= DAYS - 2, { unlockDays })
  check('sim: the wallet never goes negative', lows.every(m => m >= 0), lows)
  check('sim: the salon grows (more customers on day 30 than day 1)', rows.length === DAYS && Number(/(\d+) customers/.exec(rows[DAYS - 1])![1]) > Number(/(\d+) customers/.exec(rows[0])![1]))
  check('sim: staff serve customers once hired', staffServed > 0 && playerServed > 0, { staffServed, playerServed })
  void STAFF_ID_BASE
}
