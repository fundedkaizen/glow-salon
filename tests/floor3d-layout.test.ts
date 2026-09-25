import { check } from './harness.ts'
import { DECOR_ITEM_BY_ID, DECOR_SLOTS, GIFTS } from '../src/core/decor.ts'
import { SLOTS } from '../src/core/floor.ts'
import { UPGRADE_ITEMS } from '../src/core/unlocks.ts'
import { ALL_DECOR, clearZones, decorScale, entrancePath, FLOOR_SLOTS, floorItems, outsideItems, TOP_MARGIN, WALL_H3, WALL_LEN, WALL_SLOT, WALL_SLOTS, wallItems, type Box, type FloorItem, type WallItem } from '../src/render3d/layout.ts'
import { ROOM3 } from '../src/render3d/mapping.ts'

/**
 * The 3D salon's layout validator, run on every salon the game can make: nothing on a wall crosses a window, a
 * door or another piece, or pokes above the wall; no two pieces of furniture overlap; the desk's front, the
 * computer, the door, the start spots and every work spot keep clear floor; the entrance path outside is clear.
 * Ghosts stand exactly where the bought piece will, so checking every piece in every spot checks them too.
 */
const EPS = 0.01
const overlap = (a: Box, b: Box) => a.x0 < b.x1 - EPS && b.x0 < a.x1 - EPS && a.z0 < b.z1 - EPS && b.z0 < a.z1 - EPS
const wallOverlap = (a: WallItem, b: WallItem) => a.wall === b.wall && Math.abs(a.u - b.u) < (a.w + b.w) / 2 - EPS && a.y0 < b.y1 - EPS && b.y0 < a.y1 - EPS

function checkWalls(label: string, items: WallItem[]) {
  const bad: string[] = []
  for (const it of items) {
    if (it.u - it.w / 2 < 0.1 - EPS || it.u + it.w / 2 > WALL_LEN[it.wall] - 0.1 + EPS) bad.push(`${it.id} runs off the ${it.wall} wall`)
    if (it.y1 > WALL_H3 - TOP_MARGIN + EPS) bad.push(`${it.id} reaches the top of the wall (${it.y1.toFixed(2)} m)`)
    if (it.y0 < 0.15 - EPS) bad.push(`${it.id} sits on the skirting`)
  }
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const a = items[i], b = items[j]
    if (!wallOverlap(a, b)) continue
    // A piece may hang inside its own arched niche; the fairy lights run above everything else.
    const nested = (x: WallItem, y: WallItem) => x.kind === 'arch' && y.kind === 'item' && Math.abs(x.u - y.u) < EPS
    if (nested(a, b) || nested(b, a)) continue
    bad.push(`${a.id} overlaps ${b.id}`)
  }
  check(`walls: ${label}`, bad.length === 0, bad.slice(0, 4))
}

function checkFloor(label: string, items: FloorItem[], slots: number[]) {
  const bad: string[] = []
  const { w: W, d: D } = ROOM3
  for (const it of items) if (it.x0 < -W / 2 - EPS || it.x1 > W / 2 + EPS || it.z0 < -EPS || it.z1 > D + EPS) bad.push(`${it.id} stands outside the room`)
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) if (overlap(items[i], items[j])) bad.push(`${items[i].id} overlaps ${items[j].id}`)
  for (const z of clearZones(slots)) for (const it of items) {
    if (!overlap(z, it)) continue
    if (z.station !== undefined && it.id === `station${z.station}`) continue
    bad.push(`${it.id} blocks the ${z.id} space`)
  }
  check(`floor: ${label}`, bad.length === 0, bad.slice(0, 4))
}

export function run() {
  const all = SLOTS.map((_, i) => i)
  const starters = ['plant', 'candles', 'rug', 'lights', 'art', 'neon', 'aquarium', 'chandelier']
  const upgrades = UPGRADE_ITEMS.map(i => i.id)
  const gifts = GIFTS.slice(0, 8).map(g => g.id)
  // Day one, a full salon, and a salon with everything the levels open.
  const salons: [string, string[], number[]][] = [
    ['day one', [], [0]],
    ['nail bar day', ['treat-nails', 'nail-desk'], [0, 1]],
    ['full salon', [...starters, ...gifts], all],
    ['every upgrade', [...starters, ...upgrades, ...gifts], all],
  ]
  for (const [label, owned, slots] of salons) {
    checkWalls(label, wallItems(owned))
    checkFloor(label, floorItems(owned, slots), slots)
  }
  // Every decor piece in every slot of its kind (the wall's four and the floor's six), beside everything else.
  const base = floorItems([...starters, ...upgrades, ...gifts], all)
  const floorBad: string[] = []
  for (const id of ALL_DECOR) {
    const d = DECOR_ITEM_BY_ID[id]
    if (d.place !== 'floor') continue
    FLOOR_SLOTS.forEach((s, slot) => {
      const k = decorScale(d.kind, slot)
      if (k < 0.45) floorBad.push(`${id} shrinks to ${k.toFixed(2)} in floor slot ${slot}`)
      const box: Box = { x0: s.x - s.w / 2, x1: s.x + s.w / 2, z0: s.z - s.d / 2, z1: s.z + s.d / 2 }
      for (const it of base) if (!it.id.startsWith('succulent') && overlap(box, it)) floorBad.push(`${id} in floor slot ${slot} overlaps ${it.id}`)
      for (const z of clearZones(all)) if (overlap(box, z)) floorBad.push(`${id} in floor slot ${slot} blocks ${z.id}`)
    })
  }
  check('every floor decor piece fits every floor slot', floorBad.length === 0, [...new Set(floorBad)].slice(0, 4))
  check('the six floor slots never touch each other', FLOOR_SLOTS.every((a, i) => FLOOR_SLOTS.every((b, j) => i === j || !overlap({ x0: a.x - a.w / 2, x1: a.x + a.w / 2, z0: a.z - a.d / 2, z1: a.z + a.d / 2 }, { x0: b.x - b.w / 2, x1: b.x + b.w / 2, z0: b.z - b.d / 2, z1: b.z + b.d / 2 }))))
  check('one 3D spot for every wall and floor slot of the shop', WALL_SLOTS.length === DECOR_SLOTS.wall.length && FLOOR_SLOTS.length === DECOR_SLOTS.floor.length)
  // A full wall of set pieces: every wall slot taken.
  const wallDecor = ALL_DECOR.filter(id => DECOR_ITEM_BY_ID[id].place === 'wall').slice(0, 4)
  checkWalls('every wall slot taken', wallItems([...starters, ...wallDecor, 'up-star-17']))
  check('wall slot pieces are no wider than the slot allows', WALL_SLOT.w <= 1.2)
  // Outside: the garden keeps the path from the door to the street clear.
  const path = entrancePath()
  const blocking = outsideItems().filter(o => o.solid && overlap(o, path))
  check('outside: nothing blocks the entrance path', blocking.length === 0, blocking.map(o => o.id).slice(0, 4))
  const outBad: string[] = []
  const outs = outsideItems()
  const room: Box = { x0: -ROOM3.w / 2 - ROOM3.wallT, x1: ROOM3.w / 2 + ROOM3.wallT, z0: -ROOM3.wallT, z1: ROOM3.d + ROOM3.wallT }
  for (const o of outs) if (overlap(o, room)) outBad.push(`${o.id} stands inside the salon`)
  for (let i = 0; i < outs.length; i++) for (let j = i + 1; j < outs.length; j++) if (outs[i].solid && outs[j].solid && overlap(outs[i], outs[j])) outBad.push(`${outs[i].id} overlaps ${outs[j].id}`)
  check('outside: garden pieces stand clear of the salon and of each other', outBad.length === 0, outBad.slice(0, 4))
}
