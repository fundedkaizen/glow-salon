import { check, near } from './harness.ts'
import { canBuy, ITEM_BY_ID, ITEMS, ambiencePoints } from '../src/core/economy.ts'
import { blockedGrid, CELL, COLS, DOOR_INSIDE, PROP_BLOCK, ROWS, SLOTS, SOFA_SEATS, STANDING, stationSeat, type Pt } from '../src/core/floor.ts'
import { ghostPicks, LAST_STAR_LEVEL, levelInfo, levelProgress, salonLevel, STYLE_COUNT, styleKeys, styleOf, tierOf, UPGRADE_ITEMS } from '../src/core/unlocks.ts'
import { newSave, reduce, startDay, tick, toSave, type SalonState } from '../src/core/salon.ts'
import { ext, validateExt } from '../src/core/salon-ext.ts'
import { handleGuestMessage, publicState } from '../src/core/coop/protocol.ts'
import type { TreatmentResult } from '../src/core/treatments/session.ts'

/** Serenity-style progression: salon levels from earnings, the upgrades they open, styles, and the ghosts. */
export function run() {
  // ---- levels: always a next one, in order, reachable
  let ordered = true
  for (let n = 1; n < 200; n++) if (!(levelInfo(n + 1).target > levelInfo(n).target)) ordered = false
  check('level targets rise forever (there is always a next goal)', ordered)
  check('level 1 is where every salon starts', levelInfo(1).target === 0 && salonLevel(0) === 1)
  check('reaching a target reaches that level', [2, 5, 16, 17, 30, 60].every(n => salonLevel(levelInfo(n).target) === n && salonLevel(levelInfo(n).target - 1) === n - 1))
  const lp = levelProgress(1500)
  check('progress toward the next level', lp.level === 3 && lp.next.level === 4 && lp.have === 500 && lp.need === 1000, lp)
  // Pacing for about 100 hours: early levels every few days, later ones far apart. A late salon grosses roughly
  // $1,500 a day at about 12 minutes a day, so level 20 comes around day 100 and level 30 near 100 hours.
  check('early levels come quickly (level 4 by about $2,000 earned)', levelInfo(4).target <= 2500)
  check('level 20 needs over $100k earned', levelInfo(20).target > 100_000 && levelInfo(20).target < 250_000, levelInfo(20).target)
  check('level 30 needs over $500k earned (about 100 hours)', levelInfo(30).target > 500_000 && levelInfo(30).target < 1_500_000, levelInfo(30).target)

  // ---- the unlock order: every level up to the last star opens a real, buyable item
  const opened = Array.from({ length: LAST_STAR_LEVEL - 1 }, (_, i) => levelInfo(i + 2))
  check('every level opens an upgrade', opened.every(l => l.opens && ITEM_BY_ID[l.opens]), opened.filter(l => !l.opens || !ITEM_BY_ID[l.opens]).map(l => l.level))
  check('each upgrade opens at its level', opened.every(l => ITEM_BY_ID[l.opens!].level === l.level))
  check('every upgrade is opened by exactly one level', UPGRADE_ITEMS.every(i => opened.filter(l => l.opens === i.id).length === 1))
  check('a better tier opens after the one it needs', UPGRADE_ITEMS.every(i => (i.needs ?? []).every(n => (ITEM_BY_ID[n].level ?? 0) < (i.level ?? 0))))
  check('upgrades get dearer level by level', opened.every((l, i) => i === 0 || ITEM_BY_ID[l.opens!].price >= ITEM_BY_ID[opened[i - 1].opens!].price))
  // Each opened upgrade is a save of at most a few days at that level (a steady buy, not a wall).
  check('each upgrade costs at most a third of its level step', opened.every(l => ITEM_BY_ID[l.opens!].price <= (levelInfo(l.level + 1).target - l.target) / 3 + 1), opened.filter(l => ITEM_BY_ID[l.opens!].price > (levelInfo(l.level + 1).target - l.target) / 3).map(l => l.level))
  check('upgrades add ambience', ambiencePoints(['up-desk-2', 'up-fountain']) === 3)
  check('upgrade tiers', tierOf([], 'desk') === 1 && tierOf(['up-desk-2'], 'desk') === 2 && tierOf(['up-desk-2', 'up-desk-3'], 'desk') === 3)
  // Shop rules: closed until the level, then for sale like anything else.
  check('an upgrade is closed below its level', !canBuy([], 9999, 'up-fountain', 30, 3).ok && (canBuy([], 9999, 'up-fountain', 30, 3) as { reason: string }).reason === 'Opens at salon level 4')
  check('an upgrade is for sale at its level', canBuy([], 9999, 'up-fountain', 30, 4).ok)
  check('left out, the level opens no upgrades (the economy sim is unchanged)', !canBuy([], 1e9, 'up-desk-2').ok && canBuy([], 1e9, 'plant').ok)
  check('tier 3 needs tier 2', !canBuy([], 1e9, 'up-desk-3', 99, 99).ok && canBuy(['up-desk-2'], 1e9, 'up-desk-3', 99, 99).ok)

  // ---- a salon that earns levels up, and the opened upgrade can be bought (host-authoritative, as in co-op)
  const s = startDay({ ...newSave(99), totals: { served: 0, earned: 380 }, money: 500 }, [])
  reduce(s, 0, { a: 'join', name: 'Ada' })
  check('the first buy of an upgrade is refused before the level', !reduce(s, 0, { a: 'buy', item: 'up-desk-2' }))
  reduce(s, 0, { a: 'open' })
  const served = serveOne(s)
  const unlock = s.events.find(e => e.kind === 'unlock')
  check('a treatment that crosses a level announces it', served && !!unlock && unlock.item === 'up-desk-2' && unlock.amount === 2, s.events.map(e => e.text))
  check('the opened upgrade can be bought', reduce(s, 0, { a: 'buy', item: 'up-desk-2' }) && s.owned.includes('up-desk-2'))

  // ---- styles: three per piece, cosmetic, saved, and only for pieces the salon has
  const keys = styleKeys(['nail-desk', 'plant', 'flyers'], id => { const k = ITEM_BY_ID[id]?.effect.kind; return k === 'station' || k === 'decor' })
  check('style keys: the base pieces and what stands in the salon', keys.join() === 'desk,lounge,facial-chair-1,nail-desk,plant', keys)
  check('style of an unset piece is the first', styleOf({}, 'desk') === 0 && styleOf({ desk: 2 }, 'desk') === 2 && styleOf({ desk: 7 }, 'desk') === 0)
  check('a player restyles the desk', reduce(s, 0, { a: 'style', item: 'desk', style: 2 }) && ext(s).styles.desk === 2)
  check('an owned upgrade can be restyled', reduce(s, 0, { a: 'style', item: 'up-desk-2', style: 1 }))
  check('a piece the salon does not have cannot be styled', !reduce(s, 0, { a: 'style', item: 'aquarium', style: 1 }))
  check('only three styles', !reduce(s, 0, { a: 'style', item: 'desk', style: STYLE_COUNT }) && !reduce(s, 0, { a: 'style', item: 'desk', style: -1 }))
  check('a stranger cannot restyle', !reduce(s, 7, { a: 'style', item: 'desk', style: 1 }))
  const saved = validateExt(JSON.parse(JSON.stringify(toSave(s).ext)))
  check('styles survive a save', saved.styles.desk === 2 && saved.styles['up-desk-2'] === 1)
  check('junk styles are dropped on load', Object.keys(validateExt({ styles: { desk: 9, lounge: 1, ['x'.repeat(80)]: 1, evil: 'a' } }).styles).join() === 'lounge')
  // Co-op: a guest's pick goes through the host and every screen sees it.
  const coop = startDay(newSave(5), [])
  reduce(coop, 0, { a: 'join', name: 'Host' })
  handleGuestMessage(coop, 1, { t: 'hello', name: 'Guest' })
  handleGuestMessage(coop, 1, { t: 'act', a: { a: 'style', item: 'lounge', style: 1 } })
  check('co-op: a guest restyles through the host', publicState(coop).ext?.styles.lounge === 1)

  // ---- ghosts: the next few, cheapest first, nearly affordable, at most two stations
  const stands = (i: { effect: { kind: string } }) => i.effect.kind === 'station' || i.effect.kind === 'treatment' || i.effect.kind === 'decor'
  const at = (owned: string[], money: number, day: number, level: number) => ghostPicks(ITEMS, money, id => canBuy(owned, money, id, day, level), stands)
  const g1 = at([], 60, 1, 1)
  check('day 1 ghosts: a few cheap things, cheapest first', g1.length >= 1 && g1.length <= 4 && g1.every((g, i) => i === 0 || g.price >= g1[i - 1].price), g1.map(g => g.id))
  check('day 1 ghosts are within reach', g1.every(g => g.price <= 60 * 1.5 + 120), g1.map(g => `${g.id}:${g.price}`))
  const g2 = at([], 5000, 30, 12)
  check('a rich salon sees at most two stations as ghosts', g2.filter(g => g.effect.kind === 'station' || g.effect.kind === 'treatment').length <= 2 && g2.length === 4, g2.map(g => g.id))
  check('ghosts never show what is owned or not open', g2.every(g => canBuy([], 5000, g.id, 30, 12).ok || (canBuy([], 5000, g.id, 30, 12) as { reason: string }).reason.startsWith('Needs $')))
  const everything = ITEMS.filter(i => stands(i)).map(i => i.id)
  const g3 = ghostPicks(ITEMS, 0, id => everything.includes(id) && ITEM_BY_ID[id].price > 10_000 ? { ok: false, reason: `Needs $${ITEM_BY_ID[id].price} more` } : { ok: false, reason: 'Owned' }, stands)
  check('with nothing near, the cheapest next thing still shows', g3.length === 1 && g3[0].price > 10_000, g3.map(g => g.id))

  // ---- the fountain garden stands in the middle without cutting anyone off
  const grid = blockedGrid(SLOTS.map((_, i) => i), ['up-fountain', 'plant', 'aquarium'])
  const open = (p: Pt) => !grid[Math.floor(p.y / CELL) * COLS + Math.floor(p.x / CELL)]
  const trips: [Pt, Pt][] = [...SOFA_SEATS, ...STANDING].map(p => [DOOR_INSIDE, p] as [Pt, Pt])
  for (let i = 0; i < SLOTS.length; i++) for (const seat of SOFA_SEATS) trips.push([seat, stationSeat(i)])
  check('the fountain garden blocks its own footprint', !open({ x: PROP_BLOCK['up-fountain'].x + 40, y: PROP_BLOCK['up-fountain'].y + 40 }))
  check('with the fountain garden, every customer trip still has a path', trips.every(([a, b]) => reachable(grid, a, b)), trips.filter(([a, b]) => !reachable(grid, a, b)).slice(0, 3))
  near('lifetime earnings are the bar', levelProgress(levelInfo(7).target + 10).have, 10)
}

/** Can a walker get from a to b (their nearest open cells), moving as findPath does (8 ways, no cut corners)? */
export function reachable(grid: Uint8Array, a: Pt, b: Pt): boolean {
  const near = (p: Pt) => {
    const cx = Math.floor(p.x / CELL), cy = Math.floor(p.y / CELL)
    let best = -1, bd = Infinity
    for (let y = Math.max(0, cy - 8); y <= Math.min(ROWS - 1, cy + 8); y++) for (let x = Math.max(0, cx - 8); x <= Math.min(COLS - 1, cx + 8); x++) {
      if (grid[y * COLS + x]) continue
      const d = (x - cx) ** 2 + (y - cy) ** 2
      if (d < bd) { bd = d; best = y * COLS + x }
    }
    return best
  }
  const start = near(a), goal = near(b)
  if (start < 0 || goal < 0) return false
  const seen = new Uint8Array(COLS * ROWS)
  const queue = [start]
  seen[start] = 1
  while (queue.length) {
    const cur = queue.shift()!
    if (cur === goal) return true
    const x = cur % COLS, y = (cur / COLS) | 0
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy
      if ((!dx && !dy) || nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue
      const ni = ny * COLS + nx
      if (grid[ni] || seen[ni] || (dx && dy && (grid[y * COLS + nx] || grid[ny * COLS + x]))) continue
      seen[ni] = 1
      queue.push(ni)
    }
  }
  return false
}

/** Serve one seated customer with a clean result, as a player would. */
function serveOne(s: SalonState): boolean {
  for (let t = 0; t < 400; t++) {
    reduce(s, 0, { a: 'pos', x: 200, y: 500, f: 1, m: false })
    const st = s.stations.find(x => x.customer !== null && s.customers.find(c => c.id === x.customer)?.state === 'seated')
    if (st && reduce(s, 0, { a: 'work', station: st.id })) {
      const c = s.customers.find(x => x.id === st.customer)!
      const result: TreatmentResult = { treatment: c.plan.treatment, seconds: 170, par: 170, required: 12, done: 12, skipped: 0, optionalDone: 1, popped: 6, extracted: 11, fourHands: false, wishMatched: null, disaster: false, thoroughness: 0.96 }
      return reduce(s, 0, { a: 'finish', station: st.id, result })
    }
    tickFor(s, 1)
  }
  return false
}

function tickFor(s: SalonState, seconds: number) { for (let t = 0; t < seconds; t += 0.25) tick(s, 0.25) }
