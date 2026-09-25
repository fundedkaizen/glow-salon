import type { StationKind } from '../core/economy.ts'
import type { Build, Node3, StationNodes } from './furniture.ts'
import { G, tf } from './kit.ts'
import { bakeModel, hasModel, model, nodeAt, styleOf } from './models.ts'
import { FLOOR_SLOTS } from './layout.ts'
import { ROOM3 } from './mapping.ts'

/**
 * The salon's pieces from Helper B's models (models.ts), each with its style and the salon's upgrade tier, placed
 * and turned to fit the layout. Every function returns null (or false) when its model has not loaded, and the
 * caller builds the stand-in instead.
 */

/** Which way each station's model turns, so the therapist works where the layout expects (the left, or behind). */
const STATION_MODEL: Record<StationKind, { id: string; ry: number; seatKind: StationNodes['seatKind']; recline: number; workX?: number }> = {
  // The recliner's head end to the left; the therapist stands behind it, facing the room.
  // The model's work spot is inside its base's side panel: the therapist stands just clear of it.
  facial: { id: 'facial-chair', ry: Math.PI / 2, seatKind: 'chair', recline: 1, workX: 0.78 },
  // The nail desk and the pedicure throne: the therapist on the left, the customer on the right.
  nails: { id: 'nail-desk', ry: -Math.PI / 2, seatKind: 'stool', recline: 0 },
  feet: { id: 'pedicure-chair', ry: -Math.PI / 2, seatKind: 'pedicure', recline: 0.15 },
}

/** A station from its model, in its style, with the tier's plinth (2: a gold-rimmed dais; 3: a rose-gold halo too). */
export function stationModel(b: Build, kind: StationKind, x: number, z: number, style: number, tier: number): StationNodes | null {
  const s = STATION_MODEL[kind], m = model(s.id)
  if (!m) return null
  const { file, overrides } = styleOf(m, style)
  if (!hasModel(file)) return null
  if (tier >= 2) {
    // A dais the size of the station's floor spot, with a gold (rose-gold at tier 3) rim.
    b.kit.add(G.box(1.46, 0.03, 1.18, 0.012), 0xfff6ef, 'satin', tf(x, 0.015, z))
    b.kit.add(G.box(1.48, 0.012, 1.2, 0.005), tier >= 3 ? 0xe8b4a0 : 0xe6bd6a, 'metal', tf(x, 0.006, z))
  }
  if (!bakeModel(b.kit, file, x, z, s.ry, 1, overrides, tier >= 2 ? 0.03 : 0)) return null
  if (tier >= 3) b.kit.add(G.torus(0.7, 0.03, Math.PI, 40), 0xe8b4a0, 'metal', tf(x, 0.03, z - 0.52, 0, 0, 0))
  const lift = tier >= 2 ? 0.03 : 0
  const at = (n: string): Node3 => { const p = nodeAt(m.nodes[n], x, z, s.ry); return { ...p, y: p.y + lift } }
  b.blobs.push({ x, z, rx: m.footprint[1] / 2 + 0.2, rz: m.footprint[0] / 2 + 0.1, a: 0.3 })
  const w = m.nodes.work
  const work = s.workX === undefined ? at('work') : (() => { const p = nodeAt({ pos: [s.workX, w.pos[1], w.pos[2]], rotY: w.rotY }, x, z, s.ry); return { ...p, y: p.y + lift } })()
  return { seat: at('seat'), work, feet: m.nodes.feet ? at('feet') : undefined, recline: s.recline, seatKind: s.seatKind }
}

/** The reception desk, stretched along X to the layout's width; tier 2 adds a glowing strip, tier 3 brighter gold. */
export function deskModel(b: Build, x: number, z: number, w: number, style: number, tier: number): boolean {
  const m = model('reception-desk')
  if (!m) return false
  const { file, overrides } = styleOf(m, style)
  const tint = tier >= 3 ? { ...overrides, Trim: 0xf2c65a } : overrides
  if (!bakeModel(b.kit, file, x, z, 0, [w / m.footprint[0], 1, 1], tint)) return false
  if (tier >= 2) b.kit.add(G.box(w - 0.3, 0.025, 0.02, 0.008), 0xfff0d6, 'glow', tf(x, 0.08, z + m.footprint[1] / 2 + 0.01))
  b.blobs.push({ x, z, rx: w / 2 + 0.2, rz: 0.6, a: 0.32 })
  return true
}

/** Our lounge styles in B's sofa order (teal first, so the default lounge stays teal). */
const SOFA_STYLE = [1, 0, 2]

/**
 * The lounge: two sofas against the back wall in a shallow arc round `cx`, their four seats left to right; tier 2
 * adds floor lamps at the ends, tier 3 tall plants too.
 */
export function loungeModel(b: Build, cx: number, z: number, style: number, tier: number): Node3[] | null {
  const m = model('sofa')
  if (!m) return null
  const { file, overrides: o } = styleOf(m, SOFA_STYLE[style] ?? 1)
  // Velvet (tier 2) deepens the cushions; Grand (tier 3) brightens the gold.
  const overrides = { ...o, ...(tier >= 2 ? { Accent2: 0xf7d6e0 } : {}), ...(tier >= 3 ? { Trim: 0xf2c65a } : {}) }
  const seats: Node3[] = []
  for (const [dx, ry] of [[-0.8, 0.06], [0.8, -0.06]] as const) {
    const x = cx + dx
    if (!bakeModel(b.kit, file, x, z, ry, 1, overrides)) return null
    seats.push(nodeAt(m.nodes.seat, x, z, ry), nodeAt(m.nodes.seat2, x, z, ry))
  }
  b.blobs.push({ x: cx, z: z + 0.1, rx: 1.9, rz: 0.6, a: 0.32 })
  return seats
}

/** Two armchairs facing each other across a round coffee table, each turned a little towards the sofas behind. */
export function armchairsModel(b: Build, x: number, z: number, w: number, style: number): boolean {
  const a = model('armchair'), t = model('coffee-table')
  if (!a || !t) return false
  const af = styleOf(a, style)
  const off = w / 2 - a.footprint[1] / 2 - 0.02
  if (!bakeModel(b.kit, af.file, x - off, z, Math.PI / 2 + 0.3, 1, af.overrides)) return false
  bakeModel(b.kit, af.file, x + off, z, -Math.PI / 2 - 0.3, 1, af.overrides)
  bakeModel(b.kit, styleOf(t, 1).file, x, z, 0, 0.9)
  b.blobs.push({ x, z, rx: w / 2 + 0.1, rz: 0.55, a: 0.3 })
  return true
}

/** Any single model by catalogue id at a spot, scaled to fit `fit` metres across if given. */
export function placeModel(b: Build, id: string, x: number, z: number, ry = 0, opts: { style?: number; fit?: number; k?: number; tint?: Record<string, number>; y?: number } = {}): boolean {
  const m = model(id)
  if (!m) return false
  const { file, overrides } = styleOf(m, opts.style ?? 0)
  const k = opts.k ?? (opts.fit ? Math.min(1, opts.fit / Math.max(m.footprint[0], m.footprint[1])) : 1)
  const ok = bakeModel(b.kit, file, x, z, ry, k, { ...overrides, ...(opts.tint ?? {}) }, opts.y ?? 0)
  if (ok && m.height > 0.05 && (opts.y ?? 0) < 0.1) b.blobs.push({ x, z, rx: (m.footprint[0] * k) / 2 + 0.1, rz: (m.footprint[1] * k) / 2 + 0.1, a: 0.28 })
  return ok
}

/** The catalogue id of a decor set piece's model, if it has one ('set:item' becomes 'set--item'). */
export const decorModelId = (decorId: string) => { const id = decorId.replace(':', '--'); return model(id) ? id : null }

/**
 * A decor set's hero piece from its model, if it has one: fitted to its floor slot, or hanging from the ceiling.
 */
export function decorModel(b: Build, id: string, place: string, slot: number, sp: { x: number; y: number; z: number; ry: number }): boolean {
  const mid = decorModelId(id)
  if (!mid) return false
  const m = model(mid)!
  if (place === 'ceiling') return placeModel(b, mid, sp.x, sp.z, 0, { k: 0.9, y: ROOM3.wallH - m.height * 0.9 - 0.02 })
  if (place !== 'floor') return false
  const s = FLOOR_SLOTS[slot]
  return placeModel(b, mid, sp.x, sp.z, sp.ry, { k: Math.min(1, s.w / m.footprint[0], s.d / m.footprint[1]) })
}
