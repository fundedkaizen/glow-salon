import type { Region, Shape } from './geometry.ts'
import { makeRng } from './rng.ts'

/**
 * The foot for the pedicure close-ups, as geometry in art space (1024 x 1024), shared by the art (art/foot.ts)
 * and, once the steps are wired, the treatment logic. Two views of the same seeded foot (the customer's right):
 *
 *   top   the top of the foot on a towel, toes pointing down the screen, the big toe on the right, the ankle and
 *         a rolled-up trouser cuff at the top: toes, nails, knuckles, the instep.
 *   sole  the sole, toes up, the big toe on the left, the heel at the bottom: toe pads, the ball, the arch, the heel.
 *
 * Every customer's foot differs (seeded): toe lengths (sometimes a second toe longer than the big toe), toe
 * widths, the foot's width, nail shapes (square, round or fan) and, now and then, a bunion that bends the big toe
 * in and bulges the joint out. Pure and deterministic, so co-op partners build the same foot.
 *
 * This lives outside core/treatments/ for now; the step wiring can move it next to anatomy.ts (docs/FEET-WIRING.md).
 */
export type Point = { x: number; y: number }
export type FootView = 'top' | 'sole'
export type ToeName = 'big' | 'second' | 'third' | 'fourth' | 'little'
export const TOE_NAMES: ToeName[] = ['big', 'second', 'third', 'fourth', 'little']

export type Toe = {
  name: ToeName
  /** The toe's root (the ball joint) and its tip, in art space. */
  base: Point
  tip: Point
  /** Half-width at the root and at the tip. */
  r0: number
  r1: number
  /** Top view: the nail plate's length along the toe and its half-width. */
  nailLength: number
  nailWidth: number
}

export type NailShape = 'square' | 'round' | 'fan'

export type FootShape = {
  seed: number
  /** The foot's width, around 1. */
  width: number
  /** 0 none, else 0.5 to 1: the big toe bends toward the others and the joint bulges out. */
  bunion: number
  /** The second toe reaches past the big toe. */
  longSecond: boolean
  nailShape: NailShape
  /** Top view toes, big toe first. */
  toes: Toe[]
  /** Sole view toes, big toe first. */
  soleToes: Toe[]
}

// ---------------------------------------------------------------- the seeded shape

/**
 * The top view is framed close, like a pedicure game's shot: the forefoot fills the sheet and the ankle runs off
 * the top under a draped towel. Its geometry is designed as a whole foot and mapped into art space by this scale
 * about a point near the toe tips.
 */
export const TOP_SCALE = 1.62
const TOP_PIVOT = { x: 512, y: 986 }
export function topPoint(x: number, y: number): Point { return { x: TOP_PIVOT.x + (x - TOP_PIVOT.x) * TOP_SCALE, y: TOP_PIVOT.y + (y - TOP_PIVOT.y) * TOP_SCALE } }

/** The hanging edge of the towel draped over the ankle (top view): layers stop above it. */
export function drapeY(x: number) { return 150 + 34 * Math.exp(-(((x - 560) / 240) ** 2)) + 9 * Math.sin(x / 58) }

type ToeSpec = { base: [number, number]; tip: [number, number]; r0: number; r1: number; nl: number; nw: number }
/** Top view, before variation. */
const TOP_TOES: ToeSpec[] = [
  { base: [650, 752], tip: [664, 940], r0: 60, r1: 55, nl: 78, nw: 40 },
  { base: [553, 780], tip: [542, 932], r0: 37, r1: 34, nl: 38, nw: 21 },
  { base: [477, 772], tip: [458, 908], r0: 35, r1: 32, nl: 34, nw: 19.5 },
  { base: [405, 752], tip: [381, 874], r0: 33, r1: 30, nl: 30, nw: 18 },
  { base: [341, 720], tip: [314, 824], r0: 31, r1: 27, nl: 25, nw: 15.5 },
]
/** Sole view, before variation: the same toes seen from below (foreshortened, pads showing). */
const SOLE_TOES: ToeSpec[] = [
  { base: [378, 292], tip: [368, 118], r0: 61, r1: 56, nl: 0, nw: 0 },
  { base: [476, 262], tip: [484, 138], r0: 36, r1: 33, nl: 0, nw: 0 },
  { base: [552, 270], tip: [566, 158], r0: 34, r1: 31, nl: 0, nw: 0 },
  { base: [622, 290], tip: [642, 192], r0: 32, r1: 29, nl: 0, nw: 0 },
  { base: [688, 326], tip: [710, 246], r0: 30, r1: 26, nl: 0, nw: 0 },
]

export function footShape(seed: number): FootShape {
  const r = makeRng(seed ^ 0xf007)
  const width = r.range(0.95, 1.05)
  const bunion = r.chance(0.22) ? r.range(0.5, 1) : 0
  const longSecond = r.chance(0.25)
  const nailShape = r.pick(['square', 'round', 'fan'] as const)
  // Length of each toe past its root, as a factor; a long second toe reaches past the big toe.
  const len = [r.range(0.95, 1.04), longSecond ? r.range(1.12, 1.2) : r.range(0.9, 1.04), r.range(0.92, 1.06), r.range(0.9, 1.06), r.range(0.88, 1.06)]
  const thick = TOE_NAMES.map(() => r.range(0.94, 1.06))
  const make = (spec: ToeSpec[], sole: boolean): Toe[] => spec.map((s, i) => {
    const sx = (x: number) => 512 + (x - 512) * width
    const k = sole ? 1 : TOP_SCALE
    const map = (x: number, y: number) => (sole ? { x, y } : topPoint(x, y))
    const base = map(sx(s.base[0]), s.base[1])
    let tip = map(sx(s.tip[0]), s.tip[1])
    // From below, the smaller toes curl under a little, so they look shorter.
    const tuck = sole && i > 0 ? 0.86 : 1
    tip = { x: base.x + (tip.x - base.x) * len[i] * tuck, y: base.y + (tip.y - base.y) * len[i] * tuck }
    // A bunion tips the big toe toward the second (toward the middle of the foot).
    if (i === 0 && bunion) tip.x += (sole ? 1 : -1) * 30 * k * bunion
    return { name: TOE_NAMES[i], base, tip, r0: s.r0 * thick[i] * width * k, r1: s.r1 * thick[i] * width * k, nailLength: s.nl * k * len[i] ** 0.5, nailWidth: s.nw * k * thick[i] * width }
  })
  return { seed, width, bunion, longSecond, nailShape, toes: make(TOP_TOES, false), soleToes: make(SOLE_TOES, true) }
}

/** A toe's unit direction (root to tip). */
export function toeDir(t: Toe): Point {
  const dx = t.tip.x - t.base.x, dy = t.tip.y - t.base.y, l = Math.hypot(dx, dy)
  return { x: dx / l, y: dy / l }
}

/** A point along a toe (0 root, 1 tip) and to one side (-1 to 1 of its half-width). */
export function alongToe(t: Toe, u: number, side = 0): Point {
  const d = toeDir(t), n = { x: -d.y, y: d.x }
  const w = t.r0 + (t.r1 - t.r0) * u
  return { x: t.base.x + (t.tip.x - t.base.x) * u + n.x * side * w, y: t.base.y + (t.tip.y - t.base.y) * u + n.y * side * w }
}

/** Top view: the nail plate on a toe, from its base (the cuticle) to the tip. */
export function toeNail(t: Toe) {
  const d = toeDir(t)
  const tip = { x: t.tip.x - d.x * t.r1 * 0.3, y: t.tip.y - d.y * t.r1 * 0.3 }
  const base = { x: tip.x - d.x * t.nailLength, y: tip.y - d.y * t.nailLength }
  return { base, tip, halfWidth: t.nailWidth, dir: d }
}

/** Where an overgrown toenail ends (before clipping): past the toe's tip. */
export function toeFreeEdge(t: Toe, grown: number): Point {
  const n = toeNail(t)
  return { x: n.tip.x + n.dir.x * grown, y: n.tip.y + n.dir.y * grown }
}

// ---------------------------------------------------------------- outlines

/**
 * The top view's outline without the toes: the leg from above the sheet, the ankle bones, the instep and the
 * front edge scalloped behind the toe roots (the toes, drawn as their own shapes, cover it).
 */
export function topOutline(f: FootShape): number[] {
  const w = f.width, sx = (x: number) => 512 + (x - 512) * w
  const b = f.bunion
  const t = f.toes
  const P = (x: number, y: number): [number, number] => { const q = topPoint(x, y); return [q.x, q.y] }
  const pts: [number, number][] = [
    // The outer edge runs nearly straight from the ankle to the little toe's joint.
    P(sx(370), -60), P(sx(368), 40), P(sx(364), 120), P(sx(352), 200), P(sx(344), 280), P(sx(336), 360), P(sx(322), 450), P(sx(304), 540), P(sx(292), 610),
    [t[4].base.x - t[4].r0 * 1.05, t[4].base.y - 8],
    [t[4].base.x + 4, t[4].base.y + t[4].r0 * 0.9], [t[3].base.x, t[3].base.y + t[3].r0 * 0.9], [t[2].base.x, t[2].base.y + t[2].r0 * 0.9], [t[1].base.x, t[1].base.y + t[1].r0 * 0.85],
    [t[0].base.x - t[0].r0 * 0.3, t[0].base.y + t[0].r0 * 0.9],
    [t[0].base.x + t[0].r0 * 0.9 + b * 40, t[0].base.y - 10],
    // The inner edge curves in along the arch, then out to the big toe's joint.
    P(sx(724) + b * 34, 640), P(sx(702) + b * 10, 560), P(sx(684), 470), P(sx(674), 380), P(sx(676), 290), P(sx(684), 200), P(sx(682), 120), P(sx(676), 40), P(sx(672), -60),
  ]
  return pts.flat()
}

/** The sole's outline without the toes: heel at the bottom, the arch curving in on the left, the ball at the top. */
export function soleOutline(f: FootShape): number[] {
  const w = f.width, sx = (x: number) => 512 + (x - 512) * w
  const b = f.bunion
  const t = f.soleToes
  const pts: [number, number][] = [
    [sx(548), 990], [sx(470), 972], [sx(424), 918], [sx(410), 840], [sx(414), 760], [sx(400), 680], [sx(378), 590], [sx(350), 500],
    [sx(322) - b * 30, 420], [t[0].base.x - t[0].r0 * 0.95 - b * 20, t[0].base.y + 4],
    [t[0].base.x, t[0].base.y - t[0].r0 * 0.7], [t[1].base.x, t[1].base.y - t[1].r0 * 0.6], [t[2].base.x, t[2].base.y - t[2].r0 * 0.6], [t[3].base.x, t[3].base.y - t[3].r0 * 0.6],
    [t[4].base.x + t[4].r0 * 0.4, t[4].base.y - t[4].r0 * 0.5], [t[4].base.x + t[4].r0 * 1.15, t[4].base.y + 16],
    [sx(738), 420], [sx(730), 520], [sx(712), 620], [sx(700), 720], [sx(696), 820], [sx(680), 910], [sx(628), 972],
  ]
  return pts.flat()
}

const toeShape = (t: Toe): Shape => ({ t: 'capsule', x0: t.base.x, y0: t.base.y, x1: t.tip.x, y1: t.tip.y, r0: t.r0, r1: t.r1 })

// ---------------------------------------------------------------- regions

export type FootTopRegion = 'foot' | 'toes' | 'nails' | 'tips' | 'cuticles' | 'nailFolds' | 'knuckles' | 'betweenToes' | 'instep' | 'ankle' | 'everywhere'
export type FootSoleRegion = 'sole' | 'toePads' | 'ball' | 'arch' | 'heel' | 'heelRim' | 'calluses' | 'everywhere'

const EVERYWHERE: Shape = { t: 'poly', pts: [0, 0, 1024, 0, 1024, 1024, 0, 1024] }
/** Above this the draped towel covers everything in the top view (its edge dips lower in places, see drapeY). */
export const CUFF_Y = 140

export function footAnatomy(seed: number) {
  const f = footShape(seed)
  const top = f.toes, sole = f.soleToes
  const nails = top.map(toeNail)
  const nailShapes: Shape[] = nails.map(n => {
    const end = n.halfWidth * 0.8
    return { t: 'capsule', x0: n.base.x + n.dir.x * n.halfWidth * 0.55, y0: n.base.y + n.dir.y * n.halfWidth * 0.55, x1: n.tip.x - n.dir.x * end, y1: n.tip.y - n.dir.y * end, r0: n.halfWidth * 0.92, r1: n.halfWidth }
  })
  const tipShapes: Shape[] = nails.map(n => ({ t: 'capsule', x0: n.tip.x - n.dir.x * n.halfWidth * 0.6, y0: n.tip.y - n.dir.y * n.halfWidth * 0.6, x1: n.tip.x + n.dir.x * 6, y1: n.tip.y + n.dir.y * 6, r0: n.halfWidth * 1.05, r1: n.halfWidth * 0.95 }))
  const cuticleShapes: Shape[] = nails.map(n => ({ t: 'ellipse', cx: n.base.x + n.dir.x * 4, cy: n.base.y + n.dir.y * 4, rx: n.halfWidth * 1.25, ry: Math.max(9, n.halfWidth * 0.5), rot: Math.atan2(n.dir.y, n.dir.x) + Math.PI / 2 }))
  // The skin folds along both sides of the big toenail (where an ingrown nail digs in).
  const big = nails[0]
  const fold = (side: number): Shape => {
    const nx = -big.dir.y * side, ny = big.dir.x * side, o = big.halfWidth * 0.98
    return { t: 'capsule', x0: big.base.x + nx * o + big.dir.x * 20, y0: big.base.y + ny * o + big.dir.y * 20, x1: big.tip.x + nx * o * 0.95 - big.dir.x * 8, y1: big.tip.y + ny * o * 0.95 - big.dir.y * 8, r0: 13, r1: 17 }
  }
  // Corns sit on the knuckle (the middle joint) on top of the smaller toes, and on the outer side of the little toe.
  const knuckleShapes: Shape[] = top.slice(1).map(t => { const p = alongToe(t, 0.44); return { t: 'ellipse', cx: p.x, cy: p.y, rx: t.r0 * 0.85, ry: t.r0 * 0.7 } })
  const lp = alongToe(top[4], 0.5, -0.95)
  knuckleShapes.push({ t: 'ellipse', cx: lp.x, cy: lp.y, rx: 22, ry: 30 })
  const between: Shape[] = top.slice(0, 4).map((t, i) => {
    const n = top[i + 1], a = alongToe(t, 0.12), b = alongToe(n, 0.12)
    return { t: 'ellipse', cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 + 28, rx: 22, ry: 64, rot: Math.atan2(t.tip.x - t.base.x, t.base.y - t.tip.y) }
  })
  const topOut: Shape = { t: 'poly', pts: topOutline(f) }
  const soleOut: Shape = { t: 'poly', pts: soleOutline(f) }
  const cuffPts = [0, -100, 1024, -100]
  for (let x = 1024; x >= 0; x -= 32) cuffPts.push(x, drapeY(x) + 4)
  const cuff: Shape = { t: 'poly', pts: cuffPts }
  const T = (x: number, y: number) => topPoint(512 + (x - 512) * w, y)
  const K = TOP_SCALE
  const w = f.width, sx = (x: number) => 512 + (x - 512) * w
  const heel: Shape = { t: 'ellipse', cx: sx(552), cy: 862, rx: 132 * w, ry: 118 }
  const heelInner: Shape = { t: 'ellipse', cx: sx(556), cy: 850, rx: 92 * w, ry: 80 }
  const ball: Shape = { t: 'ellipse', cx: sx(520), cy: 388, rx: 205 * w, ry: 78, rot: 0.12 }
  const arch: Shape = { t: 'ellipse', cx: sx(430), cy: 620, rx: 62 * w, ry: 150, rot: 0.25 }
  const pads: Shape[] = sole.map(t => { const p = alongToe(t, 0.78); return { t: 'ellipse', cx: p.x, cy: p.y, rx: t.r1 * 0.95, ry: t.r1 * 0.9 } })
  const TOP: Record<FootTopRegion, Region> = {
    foot: { include: [topOut, ...top.map(toeShape)], exclude: [cuff] },
    toes: { include: top.map(toeShape) },
    nails: { include: nailShapes },
    tips: { include: tipShapes },
    cuticles: { include: cuticleShapes },
    nailFolds: { include: [fold(-1), fold(1)] },
    knuckles: { include: knuckleShapes },
    betweenToes: { include: between },
    instep: { include: [{ t: 'ellipse', cx: T(512, 650).x, cy: T(512, 650).y, rx: 170 * w * K, ry: 70 * K }], exclude: [cuff] },
    ankle: { include: [{ t: 'poly', pts: [110, CUFF_Y, 914, CUFF_Y, 914, CUFF_Y + 130, 110, CUFF_Y + 130] }], exclude: [cuff] },
    everywhere: { include: [EVERYWHERE] },
  }
  const SOLE: Record<FootSoleRegion, Region> = {
    sole: { include: [soleOut, ...sole.map(toeShape)] },
    toePads: { include: pads },
    ball: { include: [ball] },
    arch: { include: [arch] },
    heel: { include: [heel] },
    heelRim: { include: [heel], exclude: [heelInner] },
    calluses: { include: [heel, ball, pads[0]] },
    everywhere: { include: [EVERYWHERE] },
  }
  return { shape: f, nails, regions: { top: TOP, sole: SOLE }, shapes: { topOut, soleOut, nailShapes, tipShapes, cuticleShapes, knuckleShapes, between, heel, heelInner, ball, arch, pads, cuff } }
}
export type FootAnatomy = ReturnType<typeof footAnatomy>

/**
 * Where to lift an ingrown nail (top view): on the swollen fold beside the big toenail, two thirds of the way
 * to its free edge, on the side that digs in (-1 toward the second toe, 1 the outer side).
 */
export function ingrownSpot(a: FootAnatomy, side: -1 | 1): Point {
  const n = a.nails[0], nx = -n.dir.y * side, ny = n.dir.x * side
  return { x: n.base.x + (n.tip.x - n.base.x) * 0.68 + nx * n.halfWidth * 0.98, y: n.base.y + (n.tip.y - n.base.y) * 0.68 + ny * n.halfWidth * 0.98 }
}

// ---------------------------------------------------------------- the customer's problem

export type Personality = 'calm' | 'ticklish' | 'sensitive'

/** A small thing on the foot to work one at a time (corns, splinters), in art space for its view. */
export type FootSpot = { view: FootView; x: number; y: number; toe?: number; angle: number; size: number }

/**
 * The feet family's conditions (content/treatments.json), seeded: every value scales its layer's art and
 * coverage. Ranges follow the catalogue: calluses, cracks, dirt, oldPolish, hair 0 to 1; corns 0 to 3;
 * ingrown 0 or 1; fungus 0 to 5 nails; splinters 0 to 3.
 */
export type FootProfile = {
  kind: 'foot'
  calluses: number
  corns: FootSpot[]
  /** Which side of the big toenail digs in (-1 the side toward the second toe, 1 the outer side), or 0. */
  ingrown: -1 | 0 | 1
  /** Per toe (big toe first): how bad its fungus is, 0 (healthy) to 1 (thick, yellow, crumbling). */
  fungus: number[]
  cracks: number
  dirt: number
  splinters: FootSpot[]
  /** Old polish on the toenails: a colour index (POLISH_COLORS) and how chipped it is. */
  polish: { color: number; chips: number } | null
  hair: number
  /** How far each toenail has grown past the toe (art px); 0 is already short. */
  grown: number[]
  /** Overgrown cuticles, 0.2 to 1. */
  cuticle: number
  /** Dry, flaky skin on the heel and the ball, 0 to 1. */
  dry: number
  personality: Personality
}

const POLISH_COUNT = 8

/** Fisher-Yates with the seeded stream (a random sort comparator differs between browsers). */
function shuffle<T>(items: T[], r: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [items[i], items[j]] = [items[j], items[i]] }
  return items
}

export function footProfile(seed: number, disaster: boolean): FootProfile {
  const r = makeRng(seed ^ 0xfee7)
  const a = footAnatomy(seed)
  const top = a.shape.toes, sole = a.shape.soleToes
  const sev = (lo: number, hi: number, chance: number) => (disaster ? r.range(Math.max(lo, 0.7), 1) : r.chance(chance) ? r.range(lo, hi) : 0)
  // Fungus spreads from the big toe: n nails, the big toe worst.
  // The small toes catch it later and lighter: some barely touched, some still healthy.
  const fungusNails = disaster ? r.int(2, 5) : r.chance(0.35) ? r.int(1, 3) : 0
  const fungus = top.map((_, i) => (i < fungusNails ? Math.max(0.2, (disaster ? r.range(0.75, 1) : r.range(0.45, 1)) * (i === 0 ? 1 : r.range(0.3, 0.9))) : 0))
  const cornCount = disaster ? r.int(2, 3) : r.chance(0.4) ? r.int(1, 2) : 0
  const cornToes = shuffle([1, 2, 3, 4, 4], r).slice(0, cornCount)
  const corns: FootSpot[] = cornToes.map((ti, k) => {
    const t = top[ti]
    // The little toe's corn is often on its outer side.
    const p = ti === 4 && k % 2 ? alongToe(t, 0.5, -0.8) : alongToe(t, r.range(0.4, 0.5), r.range(-0.25, 0.25))
    return { view: 'top', x: p.x, y: p.y, toe: ti, angle: r.range(0, Math.PI * 2), size: t.r0 * r.range(0.42, 0.55) }
  })
  const splinterCount = disaster ? r.int(2, 3) : r.chance(0.3) ? r.int(1, 2) : 0
  const spots = [
    () => { const p = alongToe(sole[0], r.range(0.55, 0.85), r.range(-0.4, 0.4)); return p },
    () => ({ x: 512 + (r.range(440, 640) - 512) * a.shape.width, y: r.range(360, 420) }),
    () => ({ x: 512 + (r.range(600, 680) - 512) * a.shape.width, y: r.range(560, 760) }),
    () => ({ x: 512 + (r.range(490, 610) - 512) * a.shape.width, y: r.range(800, 900) }),
  ]
  shuffle(spots, r)
  const splinters: FootSpot[] = spots.slice(0, splinterCount).map(s => { const p = s(); return { view: 'sole', x: p.x, y: p.y, angle: r.range(-Math.PI, Math.PI), size: r.range(26, 44) } })
  const polished = disaster || r.chance(0.55)
  const longNails = disaster || r.chance(0.75)
  return {
    kind: 'foot',
    calluses: disaster ? r.range(0.75, 1) : r.chance(0.8) ? r.range(0.3, 0.9) : r.range(0, 0.2),
    corns,
    ingrown: (disaster ? r.pick([-1, 1]) : r.chance(0.2) ? r.pick([-1, 1]) : 0) as -1 | 0 | 1,
    fungus,
    cracks: sev(0.25, 0.9, 0.45),
    dirt: disaster ? r.range(0.75, 1) : r.chance(0.6) ? r.range(0.2, 0.8) : 0,
    splinters,
    polish: polished ? { color: r.int(0, POLISH_COUNT - 1), chips: disaster ? r.range(0.6, 1) : r.range(0.2, 0.9) } : null,
    hair: r.chance(0.4) ? r.range(0.3, 1) : 0,
    grown: top.map((_, i) => (!longNails || r.chance(0.15) ? 0 : r.range(10, 18) * (i === 0 ? 1.6 : 1) * (disaster ? 1.3 : 1))),
    cuticle: disaster ? r.range(0.8, 1) : r.range(0.25, 0.9),
    dry: disaster ? r.range(0.7, 1) : r.chance(0.6) ? r.range(0.2, 0.8) : 0,
    personality: r.pick(['calm', 'ticklish', 'sensitive'] as const),
  }
}

/**
 * A customer at a set severity, for previews and contact sheets: 0 clean (the finished foot), 1 mild,
 * 2 bad, 3 a disaster. Every condition is present from level 1 up, so each layer can be judged at each level.
 */
export function footProfileLevel(seed: number, level: 0 | 1 | 2 | 3): FootProfile {
  const p = footProfile(seed, level === 3)
  if (level === 3) return { ...p, ingrown: p.ingrown || 1, hair: Math.max(p.hair, 0.8) }
  const a = footAnatomy(seed)
  const k = level === 0 ? 0 : level === 1 ? 0.4 : 0.7
  const top = a.shape.toes
  const corn = (ti: number, u: number): FootSpot => { const q = alongToe(top[ti], u); return { view: 'top', x: q.x, y: q.y, toe: ti, angle: ti, size: top[ti].r0 * 0.5 } }
  const sole = a.shape.soleToes
  const spl = (x: number, y: number, angle: number): FootSpot => ({ view: 'sole', x, y, angle, size: 36 })
  const pad = alongToe(sole[0], 0.7, 0.2)
  return {
    ...p,
    calluses: k, cracks: k, dirt: k, dry: k, hair: k, cuticle: 0.2 + k,
    fungus: level === 0 ? [0, 0, 0, 0, 0] : level === 1 ? [0.5, 0, 0, 0, 0] : [0.85, 0.6, 0, 0, 0],
    corns: level === 0 ? [] : level === 1 ? [corn(2, 0.44)] : [corn(2, 0.44), corn(4, 0.46)],
    splinters: level === 0 ? [] : level === 1 ? [spl(pad.x, pad.y, 0.6)] : [spl(pad.x, pad.y, 0.6), spl(512 + 80 * a.shape.width, 860, -0.9)],
    ingrown: level === 2 ? 1 : 0,
    polish: level === 0 ? null : { color: p.polish?.color ?? 1, chips: k },
    grown: level === 0 ? [0, 0, 0, 0, 0] : top.map((_, i) => (i === 0 ? 26 : 14) * (0.5 + k)),
  }
}
