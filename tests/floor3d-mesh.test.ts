import './dom-stub.ts'
import { check } from './harness.ts'
import { Box3, Vector3 } from 'three'
import { DECOR_ITEM_BY_ID, DECOR_SLOTS, GIFTS, type DecorPlace } from '../src/core/decor.ts'
import type { StationKind } from '../src/core/economy.ts'
import { COMPUTER_SPOT, DOOR_INSIDE, SLOTS, spawnPoint, STANDING } from '../src/core/floor.ts'
import { UPGRADE_ITEMS } from '../src/core/unlocks.ts'
import { furnish, newBuild, type FurnishSpec } from '../src/render3d/furnish.ts'
import { PARTS, type PartBox } from '../src/render3d/kit.ts'
import { ALL_DECOR, doorway, ENTRANCE, outsideItems } from '../src/render3d/layout.ts'
import { toWorld } from '../src/render3d/mapping.ts'
import { buildRoom } from '../src/render3d/room.ts'

/**
 * The mesh layout check: builds the real 3D salon (the room, the garden and every piece of furniture, exactly as
 * the floor view does) and tests the box of every shape against every shape of every other piece. Nothing may
 * pass through anything else: a pole through a pot, a lamp in a hedge, a trolley in a chair. The only contacts
 * allowed are the intended ones: everything stands on the floor (which is not a shape), and pieces mounted on a
 * wall (named `mount:`) touch the wall. People standing where they work, queue, start the day or come in must not
 * stand in anything either, except the stool a therapist sits on. And the entrance set is symmetric about the door.
 */
const TOL = 0.012
const hit = (a: Box3, b: Box3) => a.min.x < b.max.x - TOL && b.min.x < a.max.x - TOL && a.min.y < b.max.y - TOL && b.min.y < a.max.y - TOL && a.min.z < b.max.z - TOL && b.min.z < a.max.z - TOL

const fmt = (b: Box3) => `[${b.min.x.toFixed(2)}..${b.max.x.toFixed(2)}, ${b.min.y.toFixed(2)}..${b.max.y.toFixed(2)}, ${b.min.z.toFixed(2)}..${b.max.z.toFixed(2)}]`
function record(fn: () => void): PartBox[] {
  PARTS.on = true
  PARTS.list = []
  try { fn() } finally { PARTS.on = false }
  return PARTS.list.filter(p => !p.piece.startsWith('skip:'))
}

/** Every part of the room and the garden (built once). */
const shell = record(() => { buildRoom() })

function allowed(a: string, b: string) {
  const mounted = (x: string) => x.startsWith('mount:')
  // Wall pieces touch the wall; the ground (plinth, kerb) is under everything outside.
  if ((mounted(a) && b === 'room') || (mounted(b) && a === 'room')) return true
  if (a === 'ground' || b === 'ground') return true
  // Curtains hang over the windows' frames.
  const dressing = (x: string, y: string) => x.includes('@window') && y.startsWith('mount:window')
  if (dressing(a, b) || dressing(b, a)) return true
  return false
}

/** Pairs of parts of different pieces whose boxes cross (only pieces whose overall boxes meet are compared). */
function clashes(parts: PartBox[], only?: (p: PartBox) => boolean): string[] {
  const byPiece = new Map<string, { box: Box3; parts: PartBox[] }>()
  for (const p of parts) {
    let e = byPiece.get(p.piece)
    if (!e) byPiece.set(p.piece, (e = { box: new Box3(), parts: [] }))
    e.box.union(p.box)
    e.parts.push(p)
  }
  const names = [...byPiece.keys()]
  const bad = new Set<string>()
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
    const A = byPiece.get(names[i])!, B = byPiece.get(names[j])!
    if (!hit(A.box, B.box) || allowed(names[i], names[j])) continue
    if (only && !A.parts.some(only) && !B.parts.some(only)) continue
    outer: for (const p of A.parts) for (const q of B.parts) if (hit(p.box, q.box)) {
      bad.add(`${names[i]} x ${names[j]}`)
      if (process.env.MESH_DEBUG) console.log(names[i], fmt(p.box), 'x', names[j], fmt(q.box))
      break outer
    }
  }
  return [...bad]
}

const STATION_KINDS: StationKind[] = ['facial', 'nails', 'feet']
const stationsOf = (kind: StationKind | 'mix', n = SLOTS.length) => Array.from({ length: n }, (_, i) => ({ id: `s${i}`, kind: kind === 'mix' ? STATION_KINDS[i % 3] : kind, slot: i }))
const spec = (owned: string[], stations: FurnishSpec['stations'], decorOrder: string[] = []): FurnishSpec => ({ owned, stations, styles: {}, decorOrder, salonName: 'Glow Salon', placing: false, isoKey: null })

function build(s: FurnishSpec) {
  let f: ReturnType<typeof furnish> | null = null
  const parts = record(() => { f = furnish(newBuild(), newBuild(), s) })
  return { parts: [...shell, ...parts], f: f! as ReturnType<typeof furnish> }
}

/** A person standing (or working) at a spot: a slim column. */
const personAt = (x: number, z: number, r = 0.17) => new Box3(new Vector3(x - r, 0.12, z - r), new Vector3(x + r, 1.75, z + r))

export function run() {
  const starters = ['plant', 'candles', 'rug', 'lights', 'art', 'neon', 'aquarium', 'chandelier']
  const upgrades = UPGRADE_ITEMS.map(i => i.id)
  const gifts = GIFTS.slice(0, 8).map(g => g.id)
  const salons: [string, string[], FurnishSpec['stations']][] = [
    ['day one', [], stationsOf('facial', 1)],
    ['full salon of facials', [...starters, ...gifts], stationsOf('facial')],
    ['full salon of nail desks', [...starters, ...gifts], stationsOf('nails')],
    ['full salon of foot spas', [...starters, ...gifts], stationsOf('feet')],
    ['every upgrade', [...starters, ...upgrades, ...gifts], stationsOf('mix')],
  ]
  for (const [label, owned, stations] of salons) {
    const { parts, f } = build(spec(owned, stations))
    const bad = clashes(parts)
    check(`mesh: nothing passes through anything else (${label})`, bad.length === 0, bad.slice(0, 6))
    // People: therapists at work, the player at the computer, the queue, the start spots and the way in.
    const people: [string, Box3][] = []
    for (const st of f.stations) people.push([`worker at station ${st.slot} (${st.kind})`, personAt(st.nodes.work.x, st.nodes.work.z)])
    const pc = toWorld(COMPUTER_SPOT.x, COMPUTER_SPOT.y), door = toWorld(DOOR_INSIDE.x, DOOR_INSIDE.y)
    people.push(['player at the computer', personAt(pc.x, pc.z)], ['customer coming in', personAt(door.x, door.z)])
    STANDING.forEach((p, i) => { const a = toWorld(p.x, p.y); people.push([`customer queueing ${i}`, personAt(a.x, a.z)]) })
    for (let i = 0; i < 4; i++) { const p = spawnPoint(i), a = toWorld(p.x, p.y); people.push([`player ${i} at the start`, personAt(a.x, a.z)]) }
    const inBad: string[] = []
    for (const [who, box] of people) for (const p of parts) if (p.tag !== 'worker-seat' && hit(box, p.box)) { inBad.push(`${who} stands in ${p.piece}`); if (process.env.MESH_DEBUG) console.log(who, fmt(box), p.piece, fmt(p.box)); break }
    check(`mesh: people stand clear of every piece (${label})`, inBad.length === 0, inBad.slice(0, 6))
  }

  // Every decor piece in every slot of its place, beside a full salon with every upgrade.
  const base: string[] = [...starters, ...upgrades, ...gifts]
  const decorBad = new Set<string>()
  for (const place of ['floor', 'wall', 'ceiling', 'window'] as DecorPlace[]) {
    const ids = ALL_DECOR.filter(id => DECOR_ITEM_BY_ID[id].place === place)
    const slots = DECOR_SLOTS[place].length
    for (const id of ids) for (let k = 0; k < slots; k++) {
      // The newest owned item takes slot 0: `id` first, then k others, puts `id` in slot k.
      const others = ids.filter(o => o !== id).slice(0, k)
      const { parts } = build(spec([...base, id, ...others], stationsOf('mix')))
      for (const c of clashes(parts, p => p.piece.includes(`${id}@`))) decorBad.add(c)
    }
  }
  check('mesh: every decor piece fits every slot without passing through anything', decorBad.size === 0, [...decorBad].slice(0, 6))

  // The entrance set is centred on the door: the pots either side of the pillars at the same distance, the gate
  // posts either side of the path, the pavers on the door's middle line.
  const d = doorway(), out = outsideItems()
  const mid = (id: string) => { const o = out.find(x => x.id === id)!; return { x: (o.x0 + o.x1) / 2, z: (o.z0 + o.z1) / 2 } }
  const pa = mid('topiary-door-a'), pb = mid('topiary-door-b'), ga = mid('gate-post-a'), gb = mid('gate-post-b')
  const near = (a: number, b: number) => Math.abs(a - b) < 0.005
  check('entrance: the pots flank the door symmetrically', near(d.zm - pa.z, pb.z - d.zm) && near(pa.x, pb.x), { a: pa, b: pb, zm: d.zm })
  check('entrance: the pots stand outside the pillars', pa.z + ENTRANCE.potR < d.pillars[0] - d.pillarR && pb.z - ENTRANCE.potR > d.pillars[1] + d.pillarR)
  check('entrance: the gate posts are centred on the door', near(d.zm - ga.z, gb.z - d.zm) && near(ga.x, gb.x))
  check('entrance: the path runs down the middle of the door', out.filter(o => o.kind === 'paver').every(o => near((o.z0 + o.z1) / 2, d.zm)))
  check('entrance: the pillars are centred on the opening', near(d.zm - d.pillars[0], d.pillars[1] - d.zm))
}
