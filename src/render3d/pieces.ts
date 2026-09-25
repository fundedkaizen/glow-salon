import { Box3, Vector3 } from 'three'
import { DECOR_ITEM_BY_ID, DECOR_SLOTS, type DecorPlace } from '../core/decor.ts'
import { ITEM_BY_ID, type Item, type StationKind } from '../core/economy.ts'
import { DESK, PROP_BLOCK, PROP_SPOTS, SLOTS, SOFA_SEATS } from '../core/floor.ts'
import { tierOf } from '../core/unlocks.ts'
import { aquarium, bigPlant, decorItem, desk, facialChair, floorDecal, fountainGarden, lounge, nailDesk, pedicureChair, pendantLight, starShape, type Build } from './furniture.ts'
import { G, tf } from './kit.ts'
import { lenX, lenZ, ROOM3, toWorld, wallHeight } from './mapping.ts'
import { setPalette, styleColor, STYLE_COLORS } from './styles.ts'
import { rugTexture } from './textures.ts'

/**
 * Where each thing the salon can buy stands, and how to build it: as a grey ghost on the floor before it is
 * bought, and as a thumbnail on its style cards. Shared by the floor view so a ghost stands exactly where the
 * real piece will.
 */
export type Spot =
  | { kind: 'station'; station: StationKind; slot: number }
  | { kind: 'decor'; id: string; place: DecorPlace; x: number; y: number }
  | { kind: 'prop'; id: string }
  | { kind: 'upgrade'; id: string; family: string }

export type SpotCtx = { freeSlots: number[]; takenDecor: Set<string>; stationSlots: Partial<Record<StationKind, number>>; owned: readonly string[] }

/** The starter decor with a place of its own (floor.ts PROP_SPOTS). */
const PROPS = new Set(['plant', 'candles', 'rug', 'lights', 'art', 'neon', 'aquarium', 'chandelier'])

/** The station an item brings: a station item, or a treatment with its first station. */
export function stationOf(item: Item): StationKind | null {
  if (item.effect.kind === 'station') return item.effect.station
  if (item.effect.kind === 'treatment') { const inc = (item.includes ?? []).map(i => ITEM_BY_ID[i]).find(i => i?.effect.kind === 'station'); return inc && inc.effect.kind === 'station' ? inc.effect.station : null }
  return null
}

/** The item key each station is styled by: the first chair, then the station items in purchase order. */
export function stationKeys(owned: readonly string[]): string[] {
  return ['facial-chair-1', ...owned.filter(id => ITEM_BY_ID[id]?.effect.kind === 'station')]
}

/** Whether an item stands somewhere on the floor (so it can be a ghost). */
export function standsInSalon(item: Item): boolean {
  if (stationOf(item)) return true
  if (item.effect.kind !== 'decor') return false
  return PROPS.has(item.id) || !!DECOR_ITEM_BY_ID[item.id] || item.id.startsWith('up-')
}

/**
 * Whether an item shows as a grey ghost: real furniture with a shape (stations, plants, the aquarium, the
 * chandelier, set pieces, the upgrades). Flat or tiny things (rugs, candles, fairy lights, prints, table trinkets)
 * are bought at the computer instead: as a grey ghost they read as a smudge.
 */
export function ghostable(item: Item): boolean {
  if (!standsInSalon(item)) return false
  if (['rug', 'candles', 'lights', 'art', 'neon'].includes(item.id)) return false
  const d = DECOR_ITEM_BY_ID[item.id]
  return !d || (d.place !== 'rug' && d.place !== 'table')
}

/** Where an item would stand now (null: nowhere free for it). `nth`: how many station ghosts come before it. */
export function spotFor(item: Item, ctx: SpotCtx, nth: number): Spot | null {
  const st = stationOf(item)
  if (st) { const slot = ctx.freeSlots[nth]; return slot === undefined ? null : { kind: 'station', station: st, slot } }
  if (PROPS.has(item.id)) return { kind: 'prop', id: item.id }
  const d = DECOR_ITEM_BY_ID[item.id]
  if (d) {
    const slots = DECOR_SLOTS[d.place]
    const free = slots.findIndex((_, i) => !ctx.takenDecor.has(`${d.place}:${i}`))
    if (free < 0) return null
    return { kind: 'decor', id: item.id, place: d.place, ...slots[free] }
  }
  if (item.id.startsWith('up-')) {
    const family = item.id.startsWith('up-star-') ? 'star' : item.id.replace(/^up-/, '').replace(/-\d$/, '')
    // A station upgrade needs a station of that kind to show on.
    if ((family === 'facial' || family === 'nails' || family === 'feet') && ctx.stationSlots[family] === undefined) return null
    return { kind: 'upgrade', id: item.id, family }
  }
  return null
}

/** The aquarium stands against the door wall, clear of the waiting corner. */
export const AQUARIUM_X = -ROOM3.w / 2 + 0.3

/** The trophy shelf's place on the right wall. */
export const SHELF = { x: ROOM3.w / 2 - 0.02, y: 1.45, z: toWorld(0, 400).z, ry: -Math.PI / 2 }

/**
 * Build what an item looks like at its spot (for the grey ghost) and say where its price badge floats and what a
 * tap hits. In-place upgrades (a better desk, lounge, chair, floor, walls) build nothing: their badge floats over
 * the piece they improve.
 */
export function buildAt(b: Build, spot: Spot, ctx: SpotCtx): { anchor: Vector3; box: Box3 } {
  const box = new Box3()
  const around = (x: number, z: number, rx: number, rz: number, h: number) => box.set(new Vector3(x - rx, 0, z - rz), new Vector3(x + rx, h, z + rz))
  if (spot.kind === 'station') {
    const p = SLOTS[spot.slot]
    const a = toWorld(p.x, p.y)
    const c = STYLE_COLORS[spot.station][0]
    const tier = tierOf(ctx.owned, spot.station)
    if (spot.station === 'facial') facialChair(b, a.x, a.z, c, tier)
    else if (spot.station === 'feet') pedicureChair(b, a.x, a.z, c, tier)
    else nailDesk(b, a.x, a.z, c, tier)
    around(a.x, a.z, 1.1, 0.75, 1.5)
    return { anchor: new Vector3(a.x, 1.9, a.z), box }
  }
  if (spot.kind === 'decor') {
    const d = DECOR_ITEM_BY_ID[spot.id]
    const pal = setPalette(undefined, spot.id)
    const a = toWorld(spot.x, spot.y)
    if (spot.place === 'wall') { decorItem(b, d.kind, pal, a.x, wallHeight(spot.y), 0); around(a.x, 0.1, 0.6, 0.3, 2.4); return { anchor: new Vector3(a.x, wallHeight(spot.y) + 0.6, 0.2), box } }
    if (spot.place === 'ceiling') { decorItem(b, d.kind, pal, a.x, 2.3, 1.2); around(a.x, 1.2, 0.5, 0.5, 2.8); return { anchor: new Vector3(a.x, 2.7, 1.2), box } }
    if (spot.place === 'rug') { floorDecal(b, rugTexture('round', '#e6e1ea', '#cfc8d6', '#ffffff'), a.x, a.z, 2.4, 1.6, 0.008); around(a.x, a.z, 1.2, 0.8, 0.3); return { anchor: new Vector3(a.x, 0.5, a.z), box } }
    if (spot.place === 'window') { decorItem(b, 'curtains', pal, toWorld(760, 0).x, 2.72, 0.02); around(toWorld(760, 0).x, 0.2, 1, 0.3, 2.8); return { anchor: new Vector3(toWorld(760, 0).x, 2.9, 0.3), box } }
    if (spot.place === 'table') { const tx = spot.x < 250 ? toWorld(DESK.x + DESK.w / 2, 0).x - 0.55 : toWorld(352, 0).x; const tz = spot.x < 250 ? toWorld(0, DESK.y + DESK.h / 2).z : 0.42; decorItem(b, d.kind, pal, tx, spot.x < 250 ? 1.055 : 0.76, tz); around(tx, tz, 0.3, 0.3, 1.5); return { anchor: new Vector3(tx, 1.7, tz), box } }
    const front = a.z > ROOM3.d / 2
    const z = front ? Math.min(a.z, ROOM3.d - 0.55) : Math.max(a.z, 0.55)
    decorItem(b, d.kind, pal, a.x, 0, z, front ? Math.PI - Math.sign(a.x || 1) * 0.5 : 0)
    around(a.x, z, 0.6, 0.5, 1.6)
    return { anchor: new Vector3(a.x, 1.9, z), box }
  }
  if (spot.kind === 'prop') {
    const id = spot.id
    const at = (x: number, y: number) => toWorld(x, y)
    if (id === 'plant') { bigPlant(b, ROOM3.w / 2 - 0.45, 0.45, 0xf2e6df, 1.1); around(ROOM3.w / 2 - 0.45, 0.45, 0.5, 0.5, 1.8); return { anchor: new Vector3(ROOM3.w / 2 - 0.45, 2.1, 0.45), box } }
    if (id === 'aquarium') { const x = AQUARIUM_X, z = at(72, 460).z; aquarium(b, x, z, Math.PI / 2); around(x, z, 0.35, 0.6, 1.4); return { anchor: new Vector3(x, 1.8, z), box } }
    if (id === 'rug') { const a = at(420, 560); floorDecal(b, rugTexture('cloud', '#e6e1ea', '#cfc8d6', '#ffffff'), a.x, a.z, 2.6, 1.9, 0.008); around(a.x, a.z, 1.3, 0.9, 0.3); return { anchor: new Vector3(a.x, 0.5, a.z), box } }
    if (id === 'chandelier') { const a = at(PROP_SPOTS.chandelier.x, 0); decorItem(b, 'chandelier', [0xf7c6d4, 0xffffff, 0xffffff, 0xfbe0a0], a.x, 2.45, 1.7); around(a.x, 1.7, 0.5, 0.5, 3); return { anchor: new Vector3(a.x, 2.9, 1.7), box } }
    if (id === 'candles') { const dx = toWorld(DESK.x + DESK.w / 2, 0).x + 0.75, dz = toWorld(0, DESK.y + DESK.h / 2).z + 0.12; for (const [ox, h] of [[0, 0.16], [0.08, 0.11], [-0.07, 0.09]] as const) b.kit.add(G.cyl(0.03, 0.03, h, 10), 0xfff4e6, 'satin', tf(dx + ox, 1.055 + h / 2, dz)); around(dx, dz, 0.2, 0.2, 1.4); return { anchor: new Vector3(dx, 1.6, dz), box } }
    // Wall pieces: the fairy lights, the art and the neon.
    const x = id === 'art' ? at(960, 0).x : id === 'neon' ? at(505, 0).x : 0
    if (id === 'lights') for (let i = 0; i <= 40; i += 2) b.kit.add(G.sphere(0.03, 6), 0xffffff, 'glow', tf(-ROOM3.w / 2 + 0.3 + (i / 40) * (ROOM3.w - 0.6), 2.55 - 0.18 * Math.sin(((i % 8) / 8) * Math.PI), 0.05))
    else b.kit.add(G.box(id === 'neon' ? 1.3 : 1.2, id === 'neon' ? 0.6 : 0.9, 0.04, 0.03), 0xffffff, 'satin', tf(x, wallHeight(70), 0.03))
    around(x, 0.1, id === 'lights' ? ROOM3.w / 2 : 0.7, 0.3, 2.8)
    return { anchor: new Vector3(x, id === 'lights' ? 2.7 : wallHeight(70) + 0.7, 0.25), box }
  }
  // Upgrades.
  const f = spot.family
  if (spot.id === 'up-fountain') {
    const r = PROP_BLOCK['up-fountain'], a = toWorld(r.x + r.w / 2, r.y + r.h / 2)
    fountainGarden(b, a.x, a.z, lenX(r.w), lenZ(r.h))
    around(a.x, a.z, lenX(r.w) / 2, lenZ(r.h) / 2, 1)
    return { anchor: new Vector3(a.x, 1.3, a.z), box }
  }
  if (f === 'star') {
    b.kit.at(tf(SHELF.x, SHELF.y + 0.15, SHELF.z, 0, SHELF.ry, 0), () => starShape(b.kit))
    around(SHELF.x - 0.2, SHELF.z, 0.3, 0.8, 2.2)
    return { anchor: new Vector3(SHELF.x - 0.2, SHELF.y + 0.75, SHELF.z), box }
  }
  if (f === 'lights') {
    const p = SLOTS[ctx.stationSlots.facial ?? 0], a = toWorld(p.x, p.y)
    pendantLight(b, a.x, a.z)
    around(a.x, a.z, 0.4, 0.4, 3)
    return { anchor: new Vector3(a.x, 2.7, a.z), box }
  }
  // In place: over the desk, the lounge, the first station of a kind, the middle of the floor, or the back wall.
  let at: Vector3
  if (f === 'desk') at = new Vector3(toWorld(DESK.x + DESK.w / 2, 0).x, 1.9, toWorld(0, DESK.y + DESK.h / 2).z)
  else if (f === 'lounge') at = new Vector3(toWorld(SOFA_SEATS[1].x + 30, 0).x, 1.6, 0.7)
  else if (f === 'facial' || f === 'nails' || f === 'feet') { const p = SLOTS[ctx.stationSlots[f]!], a = toWorld(p.x, p.y); at = new Vector3(a.x, 1.9, a.z) }
  else if (f === 'walls') at = new Vector3(0, 2.2, 0.2)
  else at = new Vector3(toWorld(640, 0).x, 0.4, toWorld(0, 600).z)
  around(at.x, at.z, 0.9, 0.7, at.y + 0.3)
  return { anchor: at, box }
}

/** The pieces the Decorate mode can restyle, and whether a key's styles show (a visible colourway). */
export function stylable(key: string): boolean {
  if (key === 'desk' || key === 'lounge' || key === 'facial-chair-1' || key === 'plant' || key === 'rug') return true
  const item = ITEM_BY_ID[key]
  return !!item && (item.effect.kind === 'station' || !!DECOR_ITEM_BY_ID[key])
}

/** Build a piece at the origin in one of its styles, for its style card. */
export function buildThumb(b: Build, key: string, style: number, owned: readonly string[]) {
  const styles = { [key]: style }
  const item = ITEM_BY_ID[key]
  const station: StationKind | null = key === 'facial-chair-1' ? 'facial' : item?.effect.kind === 'station' ? item.effect.station : null
  if (station) {
    const c = styleColor(styles, key), tier = tierOf(owned, station)
    if (station === 'facial') facialChair(b, 0, 0, c, tier)
    else if (station === 'feet') pedicureChair(b, 0, 0, c, tier)
    else nailDesk(b, 0, 0, c, tier)
    return
  }
  if (key === 'desk') { desk(b, 0, 0, 2.0, 0.75, styleColor(styles, 'desk'), tierOf(owned, 'desk')); return }
  if (key === 'lounge') { lounge(b, 0, [-0.9, -0.3, 0.3, 0.9], styleColor(styles, 'lounge'), tierOf(owned, 'lounge')); return }
  if (key === 'plant') { bigPlant(b, 0, 0, styleColor(styles, 'plant'), 1); return }
  if (key === 'rug') { const c = STYLE_COLORS.rug[style]; floorDecal(b, rugTexture('cloud', '#fdf6fb', css(c), css(c)), 0, 0, 2.2, 1.6, 0.01); return }
  const d = DECOR_ITEM_BY_ID[key]
  if (d) decorItem(b, d.place === 'window' ? 'curtains' : d.kind, setPalette(styles, key), 0, d.place === 'window' ? 2.2 : 0, 0)
}

const css = (c: number) => `#${c.toString(16).padStart(6, '0')}`
