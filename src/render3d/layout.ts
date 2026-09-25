import { DECOR_ITEM_BY_ID, DECOR_SETS, GIFT_SLOTS, placeDecor, type DecorKind } from '../core/decor.ts'
import { COMPUTER_SPOT, DESK, FIXTURES, PARTITIONS, PROP_BLOCK, SOFA, spawnPoint, stationRect, stationSpot, type Rect } from '../core/floor.ts'
import { lenX, lenZ, ROOM3, toWorld } from './mapping.ts'

/**
 * Where everything stands in the 3D salon, as plain data in metres, so a test can check the whole layout (no
 * overlaps, clear walkways, nothing across a window) for every salon the game can make. The room, the furniture
 * and the ghosts are all placed from here.
 *
 * Walls: a wall item sits on the back wall (u = X + W/2, left to right as seen from inside) or the right wall
 * (u = Z, back to front), from y0 to y1 metres up. Floor: a footprint is a box X0..X1 by Z0..Z1.
 */
export type Wall = 'back' | 'right'
export type WallItem = { id: string; wall: Wall; u: number; w: number; y0: number; y1: number; kind: 'window' | 'arch' | 'item' | 'sconce' | 'lights' }
export type Box = { x0: number; x1: number; z0: number; z1: number }
export type FloorItem = Box & { id: string; kind: 'furniture' | 'plant' | 'station' | 'wall' }

const { w: W, d: D, wallH: H } = ROOM3
/** The door's gap in the left wall, in sim y (as art/salon/room.ts DOOR_Y0 and DOOR_Y1). */
const DOOR_Y0 = 556, DOOR_Y1 = 664
export const WALL_LEN: Record<Wall, number> = { back: W, right: D }
/** Nothing on a wall reaches closer than this to the top trim. */
export const TOP_MARGIN = 0.14

// ------------------------------------------------------------------ walls

/** The arched windows: glass width, sill height, straight height (the arch adds half the width). */
export const WIN = { w: 1.2, bottom: 0.92, h: 0.95, frame: 0.13 }
export const WINDOW_SPOTS: { wall: Wall; u: number }[] = [
  { wall: 'back', u: 8.0 }, { wall: 'back', u: 11.9 },
  { wall: 'right', u: 1.35 }, { wall: 'right', u: 6.0 },
]
/** The four wall decor slots (core decor.ts DECOR_SLOTS.wall, by index) along the back wall, each in an arched niche. */
export const WALL_SLOTS: number[] = [1.4, 2.75, 4.1, 5.45]
/** The widest wall piece a slot holds, and its height band. */
export const WALL_SLOT = { w: 1.15, y0: 1.15, y1: 2.25, y: 1.7 }
export const ARCH = { w: 0.92, y0: 0.2, y1: 2.28 }
/** Starter wall decor: the neon sign and the wall art, and the trophy and bottle shelves on the right wall. */
export const NEON = { wall: 'back' as Wall, u: 6.55, w: 1.0, y0: 1.35, y1: 2.05 }
export const ART = { wall: 'back' as Wall, u: 9.95, w: 1.2, y0: 1.2, y1: 2.2 }
export const TROPHY = { wall: 'right' as Wall, u: 2.95, w: 1.5, y0: 1.4, y1: 2.0, y: 1.45 }
export const BOTTLES = { wall: 'right' as Wall, u: 4.35, w: 1.15, y0: 1.4, y1: 2.0, y: 1.7 }
export const SCONCE_SPOTS: { wall: Wall; u: number }[] = [{ wall: 'back', u: 9.02 }, { wall: 'back', u: 10.87 }, { wall: 'right', u: 5.08 }, { wall: 'right', u: 0.42 }]
export const SCONCE = { w: 0.2, y0: 1.86, y1: 2.16 }
/** The fairy lights hang along the back wall, just under the crown moulding, above the windows. */
export const LIGHTS = { y0: 2.53, y1: 2.6 }

/** A wall position in the room: the point on the wall's inner face and the turn that faces into the room. */
export function onWall(wall: Wall, u: number): { x: number; z: number; ry: number } {
  return wall === 'back' ? { x: u - W / 2, z: 0, ry: 0 } : { x: W / 2, z: u, ry: -Math.PI / 2 }
}

/** Everything on the walls of a salon that owns `owned` (ghost items count as owned: they must fit too). */
export function wallItems(owned: readonly string[], decorOrder: readonly string[] = []): WallItem[] {
  const out: WallItem[] = []
  for (const s of WINDOW_SPOTS) out.push({ id: `window@${s.wall}${s.u}`, wall: s.wall, u: s.u, w: WIN.w + 2 * WIN.frame, y0: WIN.bottom - 0.05, y1: WIN.bottom + WIN.h + WIN.w / 2 + 0.05, kind: 'window' })
  WALL_SLOTS.forEach((u, i) => out.push({ id: `arch${i}`, wall: 'back', u, w: ARCH.w, y0: ARCH.y0, y1: ARCH.y1, kind: 'arch' }))
  for (const s of SCONCE_SPOTS) out.push({ id: `sconce@${s.wall}${s.u}`, wall: s.wall, u: s.u, w: SCONCE.w, y0: SCONCE.y0, y1: SCONCE.y1, kind: 'sconce' })
  out.push({ id: 'bottles', ...BOTTLES, kind: 'item' })
  if (owned.some(id => id.startsWith('up-star-'))) out.push({ id: 'trophies', ...TROPHY, kind: 'item' })
  if (owned.includes('neon')) out.push({ id: 'neon', ...NEON, kind: 'item' })
  if (owned.includes('art')) out.push({ id: 'art', ...ART, kind: 'item' })
  if (owned.includes('lights')) out.push({ id: 'lights', wall: 'back', u: W / 2, w: W - 0.6, y0: LIGHTS.y0, y1: LIGHTS.y1, kind: 'lights' })
  for (const d of placeDecor(owned, decorOrder)) if (d.place === 'wall') out.push({ id: d.id, wall: 'back', u: WALL_SLOTS[d.slot], w: WALL_SLOT.w, y0: WALL_SLOT.y0, y1: WALL_SLOT.y1, kind: 'item' })
  // Empty wall slots hold a framed filler print.
  const taken = new Set(placeDecor(owned, decorOrder).filter(d => d.place === 'wall').map(d => d.slot))
  WALL_SLOTS.forEach((u, i) => { if (!taken.has(i)) out.push({ id: `filler${i}`, wall: 'back', u, w: 0.8, y0: 1.3, y1: 2.1, kind: 'item' }) })
  return out
}

// ------------------------------------------------------------------ floor

const rectBox = (r: Rect): Box => { const a = toWorld(r.x, r.y), b = toWorld(r.x + r.w, r.y + r.h); return { x0: a.x, x1: b.x, z0: a.z, z1: b.z } }
const around = (x: number, z: number, w: number, d: number): Box => ({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 })

/** The six floor decor slots (core decor.ts DECOR_SLOTS.floor, by index), with the footprint a piece may use. */
export const FLOOR_SLOTS: { x: number; z: number; w: number; d: number; ry: number }[] = [
  { x: 1.55, z: 0.5, w: 1.2, d: 0.7, ry: 0 },
  { x: 3.05, z: 0.5, w: 1.2, d: 0.7, ry: 0 },
  { x: 5.0, z: 0.5, w: 0.9, d: 0.7, ry: 0 },
  { x: 0.3, z: 6.62, w: 1.0, d: 0.6, ry: Math.PI },
  { x: -5.9, z: 6.55, w: 1.0, d: 0.6, ry: Math.PI - 0.5 },
  { x: 3.6, z: 6.62, w: 1.0, d: 0.6, ry: Math.PI },
]
/** The eight gift stands (core decor.ts GIFT_SLOTS, by index), each about 0.44 m round. */
export const GIFT_SPOTS: { x: number; z: number; ry: number }[] = [
  { x: -6.1, z: 2.2, ry: Math.PI / 2 }, { x: 3.95, z: 0.35, ry: 0 }, { x: 6.1, z: 3.25, ry: -Math.PI / 2 }, { x: 1.3, z: 6.62, ry: Math.PI },
  { x: 2.2, z: 6.62, ry: Math.PI }, { x: 5.2, z: 6.62, ry: Math.PI }, { x: -1.4, z: 6.62, ry: Math.PI }, { x: -3.0, z: 6.62, ry: Math.PI },
]
export const GIFT_R = 0.44
/** Fixed pieces: the tea cart, the front lamp, the welcome sign, the topiaries, the plant corner, the aquarium. */
export const TEA_CART = { x: -2.87, z: 0.42, ry: Math.PI / 2, w: 0.42, d: 0.7 }
export const FRONT_LAMP = { x: -2.2, z: 6.6 }
export const WELCOME = { x: -4.92, z: 6.11 }
export const TOPIARIES: { x: number; z: number; k: number }[] = [{ x: 0.3, z: 0.34, k: 1 }, { x: -3.05, z: 1.7, k: 0.8 }, { x: 4.5, z: 3.74, k: 0.8 }]
export const PLANT_SPOT = { x: W / 2 - 0.45, z: 0.45, r: 0.8 }
export const AQUARIUM_SPOT = { x: -W / 2 + 0.3, z: toWorld(0, 460).z, w: 0.5, d: 1.1 }

/** The floor size of a decor piece of each kind, before it is fitted to its slot. */
const DECOR_FOOT: Partial<Record<DecorKind, [number, number]>> = {
  armchair: [0.8, 0.75], sofa: [1.75, 0.85], bench: [1.3, 0.42], lamp: [0.48, 0.48], screen: [1.4, 0.6], fountain: [1.32, 1.32], plant: [0.5, 0.5],
  palm: [1.2, 1.2], bonsai: [0.4, 0.3], counter: [1.36, 0.6], cart: [0.6, 0.4], hammock: [1.9, 0.6], cabinet: [0.7, 0.6], jukebox: [0.8, 0.5],
}
/** How much a decor piece shrinks to fit a floor slot (1: it fits as it is). */
export function decorScale(kind: DecorKind, slot: number): number {
  const f = DECOR_FOOT[kind] ?? [0.8, 0.8]
  const s = FLOOR_SLOTS[slot]
  return Math.min(1, s.w / f[0], s.d / f[1])
}

/** Everything standing on the floor of a salon with these stations and owned things (ghosts included as owned). */
export function floorItems(owned: readonly string[], slots: number[], decorOrder: readonly string[] = []): FloorItem[] {
  const out: FloorItem[] = []
  out.push({ id: 'desk', ...rectBox(DESK), kind: 'furniture' })
  out.push({ id: 'lounge', ...rectBox(SOFA), kind: 'furniture' })
  out.push({ id: 'waiting', ...rectBox(FIXTURES.waiting), kind: 'furniture' })
  out.push({ id: 'planter', ...rectBox(FIXTURES.planter), kind: 'furniture' })
  PARTITIONS.forEach((p, i) => out.push({ id: `partition${i}`, ...rectBox(p), kind: 'wall' }))
  for (const s of slots) if (s >= 0) out.push({ id: `station${s}`, ...rectBox(stationRect(s)), kind: 'station' })
  out.push({ id: 'tea', ...around(TEA_CART.x, TEA_CART.z, TEA_CART.w, TEA_CART.d), kind: 'furniture' })
  out.push({ id: 'frontLamp', ...around(FRONT_LAMP.x, FRONT_LAMP.z, 0.4, 0.4), kind: 'furniture' })
  out.push({ id: 'welcome', ...around(WELCOME.x, WELCOME.z, 0.5, 0.45), kind: 'furniture' })
  TOPIARIES.forEach((t, i) => out.push({ id: `topiary${i}`, ...around(t.x, t.z, 0.5 * t.k, 0.5 * t.k), kind: 'plant' }))
  if (owned.includes('plant')) out.push({ id: 'plant', ...around(PLANT_SPOT.x, PLANT_SPOT.z, PLANT_SPOT.r, PLANT_SPOT.r), kind: 'plant' })
  if (owned.includes('aquarium')) out.push({ id: 'aquarium', ...around(AQUARIUM_SPOT.x, AQUARIUM_SPOT.z, AQUARIUM_SPOT.w, AQUARIUM_SPOT.d), kind: 'furniture' })
  if (owned.includes('up-fountain')) out.push({ id: 'up-fountain', ...rectBox(PROP_BLOCK['up-fountain']), kind: 'furniture' })
  const decor = placeDecor(owned, decorOrder)
  const taken = new Set(decor.filter(d => d.place === 'floor').map(d => d.slot))
  for (const d of decor) if (d.place === 'floor') {
    const s = FLOOR_SLOTS[d.slot], k = decorScale(DECOR_ITEM_BY_ID[d.id].kind, d.slot), f = DECOR_FOOT[DECOR_ITEM_BY_ID[d.id].kind] ?? [0.8, 0.8]
    out.push({ id: d.id, ...around(s.x, s.z, f[0] * k, f[1] * k), kind: 'furniture' })
  }
  // An empty floor slot holds a little succulent.
  FLOOR_SLOTS.forEach((s, i) => { if (!taken.has(i) && i !== 3) out.push({ id: `succulent${i}`, ...around(s.x, s.z, 0.3, 0.3), kind: 'plant' }) })
  owned.filter(id => id.startsWith('gift:')).slice(0, GIFT_SLOTS.length).forEach((id, i) => out.push({ id, ...around(GIFT_SPOTS[i].x, GIFT_SPOTS[i].z, GIFT_R, GIFT_R), kind: 'furniture' }))
  return out
}

/** Floor that must stay clear: in front of the desk (two tiles), round the computer and the nook's way in, the door, the players' start spots and each station's work spot. */
export function clearZones(slots: number[]): (Box & { id: string; station?: number })[] {
  const tile = lenX(32), tileZ = lenZ(32)
  const desk = rectBox(DESK)
  const pc = toWorld(COMPUTER_SPOT.x, COMPUTER_SPOT.y)
  const door0 = toWorld(0, DOOR_Y0 - 30).z, door1 = toWorld(0, DOOR_Y1 + 30).z
  const out: (Box & { id: string; station?: number })[] = [
    { id: 'deskFront', x0: desk.x0, x1: desk.x1, z0: desk.z1 + 0.02, z1: desk.z1 + 2 * tileZ },
    { id: 'computer', ...around(pc.x, pc.z, 2 * tile, 2 * tileZ) },
    { id: 'nookWay', x0: -W / 2, x1: desk.x0 - 0.02, z0: pc.z - tileZ / 2, z1: desk.z1 },
    { id: 'door', x0: -W / 2, x1: -W / 2 + 1.2, z0: door0, z1: door1 },
  ]
  for (let id = 0; id < 4; id++) { const p = spawnPoint(id), a = toWorld(p.x, p.y); out.push({ id: `spawn${id}`, ...around(a.x, a.z, tile, tileZ) }) }
  for (const s of slots) if (s >= 0) { const p = stationSpot(s), a = toWorld(p.x, p.y); out.push({ id: `work${s}`, ...around(a.x, a.z, 2 * tile * 0.8, 2 * tileZ * 0.8), station: s }) }
  return out
}

/** The entrance path outside, from the door to the street: the garden keeps it clear. */
export function entrancePath(): Box {
  const z0 = toWorld(0, DOOR_Y0).z, z1 = toWorld(0, DOOR_Y1).z
  return { x0: -W / 2 - 3.6, x1: -W / 2 - ROOM3.wallT, z0: z0 + 0.05, z1: z1 - 0.05 }
}

/** Every decor item the shop sells, for the layout test (any of them can stand in any slot of its kind). */
export const ALL_DECOR = DECOR_SETS.flatMap(s => s.items.map(i => i.id))
export { H as WALL_H3 }

// ------------------------------------------------------------------ outside: the street-front garden

export type OutsideKind = 'bed' | 'topiary' | 'fence' | 'post' | 'mailbox' | 'sign' | 'bench' | 'lamp' | 'tree' | 'rack' | 'streetlamp' | 'hedge' | 'shrub' | 'stone' | 'paver' | 'awning'
export type OutsideItem = Box & { id: string; kind: OutsideKind; solid: boolean; h: number; seed: number }

/** The street runs along the door side: the fence line, the pavement and the road, in X (metres). */
export const STREET = { fence: -10.3, paveIn: -10.5, paveOut: -12.4, roadOut: -19 }

/**
 * The garden outside, as data (the validator keeps the entrance path clear and nothing overlapping): flower beds
 * along the walls, topiaries flanking the door, pavers to the street, a bench and a lamp post, small trees, stepping
 * stones, a low fence with gold caps (open at the path), a mailbox and the lit salon sign at the gate; along the
 * street a kerbed pavement with streetlamps and a bike rack; along the front a lawn edged with varied hedges.
 */
export function outsideItems(): OutsideItem[] {
  const T = ROOM3.wallT
  const out: OutsideItem[] = []
  let seed = 1
  const add = (id: string, kind: OutsideKind, x: number, z: number, w: number, d: number, h: number, solid = true) => out.push({ id, kind, ...around(x, z, w, d), solid, h, seed: seed++ })
  const path = entrancePath()
  const zp0 = path.z0, zp1 = path.z1, zm = (zp0 + zp1) / 2
  // Flower beds along the door wall (either side of the door) and along the front wall.
  add('bed-door-back', 'bed', -W / 2 - T - 0.55, 1.9, 0.9, 3.4, 0.45)
  add('bed-door-front', 'bed', -W / 2 - T - 0.55, 6.68, 0.9, 0.9, 0.45)
  add('bed-front', 'bed', 0.4, D + T + 0.55, W - 1.4, 0.9, 0.45)
  // The door: topiaries either side, an awning over the entrance, pavers out to the street.
  add('topiary-door-a', 'topiary', -W / 2 - T - 0.45, zp0 - 0.36, 0.5, 0.5, 1.5)
  add('topiary-door-b', 'topiary', -W / 2 - T - 0.45, zp1 + 0.36, 0.5, 0.5, 1.5)
  add('awning', 'awning', -W / 2 - T - 0.3, zm, 0.55, zp1 - zp0 + 0.5, 2.35, false)
  for (let x = path.x1 - 0.35; x > STREET.fence - 0.2; x -= 0.62) add(`paver${x.toFixed(1)}`, 'paver', x, zm, 0.56, zp1 - zp0 - 0.1, 0.03, false)
  // The front garden: a bench by a lamp post, round trees, stepping stones to the bench.
  add('bench', 'bench', -8.9, 2.55, 0.5, 1.4, 0.8)
  add('garden-lamp', 'lamp', -8.9, 1.45, 0.3, 0.3, 2.4)
  add('tree-a', 'tree', -9.3, 0.1, 0.5, 0.5, 3.2)
  add('tree-b', 'tree', -8.7, 7.3, 0.5, 0.5, 3.0)
  add('tree-c', 'tree', 8.2, D + 2.6, 0.5, 0.5, 3.4)
  for (let i = 0; i < 3; i++) add(`stone${i}`, 'stone', -8.2 - i * 0.25, zp0 - 0.5 - i * 0.5, 0.36, 0.3, 0.02, false)
  // The fence with gold caps along the street, open at the path; the sign and the mailbox at the gate.
  add('fence-back', 'fence', STREET.fence, (-1.5 + zp0 - 0.62) / 2, 0.12, zp0 - 0.62 + 1.5, 0.7)
  add('fence-front', 'fence', STREET.fence, (zp1 + 0.62 + D + 2.5) / 2, 0.12, D + 2.5 - zp1 - 0.62, 0.7)
  add('gate-post-a', 'post', STREET.fence, zp0 - 0.5, 0.2, 0.2, 0.95)
  add('gate-post-b', 'post', STREET.fence, zp1 + 0.5, 0.2, 0.2, 0.95)
  add('sign', 'sign', STREET.fence + 0.45, zp0 - 1.3, 0.3, 1.3, 1.6)
  add('mailbox', 'mailbox', STREET.fence + 0.4, zp1 + 1.05, 0.3, 0.35, 1.1)
  // The street edge: kerbed pavement with streetlamps and a bike rack.
  add('streetlamp-a', 'streetlamp', STREET.paveIn - 0.35, -0.8, 0.3, 0.3, 4)
  add('streetlamp-b', 'streetlamp', STREET.paveIn - 0.35, 8.6, 0.3, 0.3, 4)
  add('bike-rack', 'rack', STREET.paveIn - 0.45, zp1 + 2.2, 0.5, 1.5, 0.9)
  // Along the front: hedges of different lengths and heights, boxed and rounded, with shrubs between.
  const spans: [number, number, number][] = [[-8.6, 1.9, 0.8], [-6.3, 2.6, 1.05], [-3.2, 1.6, 0.7], [-1.0, 2.2, 0.95], [2.1, 2.5, 0.8], [5.05, 1.8, 1.1]]
  for (const [x, len, h] of spans) add(`hedge${x}`, 'hedge', x, D + T + 2.35, len, 0.85, h)
  for (const [x, z, s] of [[-4.6, D + T + 2.2, 0.7], [0.42, D + T + 2.25, 0.55], [3.75, D + T + 2.3, 0.7], [6.6, D + T + 2.1, 0.7]]) add(`shrub${x}`, 'shrub', x, z, s, s, 0.75)
  return out
}

/** Where a decor set piece stands (or hangs) in the 3D salon, by its place and slot, and how much it shrinks to fit. */
export function decorSpot(place: string, slot: number, kind: DecorKind): { x: number; y: number; z: number; ry: number; k: number } {
  if (place === 'floor') { const s = FLOOR_SLOTS[slot]; return { x: s.x, y: 0, z: s.z, ry: s.ry, k: decorScale(kind, slot) } }
  if (place === 'wall') { const p = onWall('back', WALL_SLOTS[slot]); return { x: p.x, y: WALL_SLOT.y, z: 0, ry: 0, k: 1 } }
  if (place === 'table') {
    const desk = toWorld(DESK.x + DESK.w / 2, DESK.y + DESK.h / 2)
    return slot === 0 ? { x: desk.x - 0.55, y: 1.055, z: desk.z, ry: 0, k: 1 } : { x: TEA_CART.x, y: 0.76, z: TEA_CART.z, ry: 0, k: 1 }
  }
  const slots = DECOR_SLOTS_3D[place as 'ceiling' | 'rug'] ?? []
  const p = slots[slot] ?? { x: 0, z: D / 2 }
  return { x: p.x, y: place === 'ceiling' ? 2.3 : 0, z: p.z, ry: 0, k: 1 }
}
/** The ceiling's and the rugs' spots: lanterns and chandeliers hang over the lounge and the station aisle; rugs lie on open floor. */
const DECOR_SLOTS_3D: Record<'ceiling' | 'rug', { x: number; z: number }[]> = {
  ceiling: [{ x: 2.2, z: 1.0 }, { x: -3.1, z: 1.1 }, { x: 4.2, z: 1.0 }],
  rug: [{ x: 3.2, z: 3.4 }, { x: -2.0, z: 3.2 }, { x: -0.4, z: 5.4 }],
}
