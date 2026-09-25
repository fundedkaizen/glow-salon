import { clamp, dist, inRegion } from '../geometry.ts'
import { makeRng, type Rng } from '../rng.ts'
import { FACE, HAND, REGIONS, bandEdge, freeEdgeOf, isFootRegion, nailOf, type BaseRegionId, type FootRegionId, type RegionId } from './anatomy.ts'
import { GRID, decodeGrid, encodeGrid, paintedShare, rasterize, stamp, sumIn } from './grid.ts'
import { planTreatment, type TreatmentPlan } from './plan.ts'
import { profileFor, type FaceProfile, type FootProfile, type HandProfile, type Profile } from './profile.ts'
import { footAnatomy, ingrownSpot, toeFreeEdge, toeNail, alongToe, type FootAnatomy } from '../foot.ts'
import type { Region } from '../geometry.ts'
import { viewOf } from './feet.ts'
import type { StepDef, TargetKind, TreatmentDef, TreatmentId } from './types.ts'

/**
 * One treatment in progress: the pure, renderer-free step pipeline. Every change arrives as an `Op` (a stroke,
 * a hold, a tap...), so the same ops can be mirrored to a co-op partner's session and give the same result.
 * The session emits events (a stamp, a pop, a step ready) that the renderer and the sounds follow.
 *
 * The customer's profile (profile.ts, from their seed) decides what is on the skin and which steps apply:
 * a step with nothing to do drops out ("na"), a disaster case gets extra steps.
 */

export type Target = {
  id: number
  kind: TargetKind
  x: number
  y: number
  /** 0.4 to 1.5: a big whitehead needs a longer squeeze. */
  size: number
  progress: number
  done: boolean
  /** For nail targets: which finger. For gems: the gem colour. */
  n?: number
  /** Deep pimples: squeezes still needed (2, then 1). A new press is needed for the second. */
  stage?: number
  gripped?: boolean
  /**
   * Four hands: who gets the credit (the lowest-numbered player who pressed it), whether a press on it came while
   * the partner squeezed close by, and whether a press finished it. Every press is recorded, even one that arrives
   * after the spot was done, so both screens end up agreeing whatever order the presses reached them in.
   */
  by?: number
  assist?: boolean
  worked?: boolean
  /** Which step's targets these are, when two steps share a kind (under-eye patches are 'eye'). */
  tag?: string
  /** Feet: which side of the foot it is on (splinters are on the sole). */
  view?: 'top' | 'sole'
  /** Feet: a splinter's direction (radians), to draw it and pull it out along it. */
  angle?: number
}

/**
 * `p` is the player who sent a stroke, hold, tap or lift (0 when absent: solo). Two players work at once (four
 * hands), each with their own grip. What depends on timing is decided once, where the op is made, and carried in
 * the op so every mirror applies it alike: `t` the target a tap landed on (0: a miss), `a` the four-hands boost
 * (1: another player was squeezing a spot close by; a hold squeezes faster, a tap marks the spot). `pts` carries a
 * stroke on through more points (x, y pairs): the per-frame strokes merged into one op for the network, applied
 * segment by segment.
 */
export type Op =
  | { k: 'stroke'; s: number; x0: number; y0: number; x1: number; y1: number; pts?: number[]; p?: number }
  | { k: 'hold'; s: number; x: number; y: number; dt: number; p?: number; a?: number }
  | { k: 'tap'; s: number; x: number; y: number; p?: number; t?: number; a?: number }
  | { k: 'lift'; s: number; p?: number }
  | { k: 'peel'; s: number; v: number; dt: number }
  | { k: 'choose'; s: number; i: number }
  | { k: 'tick'; s: number; dt: number }
  | { k: 'advance'; s: number; skip?: boolean }

export type SessionEvent =
  | { e: 'stamp'; layer: string; x: number; y: number; r: number; amount: number; changed: number }
  | { e: 'target'; id: number; progress: number }
  | { e: 'targetStage'; id: number; x: number; y: number; size: number }
  /** `by`: the player credited with it (Target.by; -1 for a sweep). */
  | { e: 'targetDone'; id: number; kind: TargetKind; x: number; y: number; size: number; n?: number; by: number }
  | { e: 'miss'; x: number; y: number }
  | { e: 'ready'; step: number }
  /** A part of the step's region is finished (one nail, one area of the face): a small cue. */
  | { e: 'zone'; x: number; y: number }
  | { e: 'resolve'; layer: string; to: 0 | 1 }
  /** A whole layer changed evenly (a soak loosening the grime): the renderer redraws it from the grid. */
  | { e: 'fade'; layer: string; amount: number }
  | { e: 'peel'; progress: number; tension: number; released: boolean; unstuck: boolean }
  | { e: 'hold'; progress: number }
  | { e: 'choose'; index: number }
  | { e: 'advance'; from: number; to: number; skipped: boolean; na: boolean }
  | { e: 'setup'; step: number }
  | { e: 'done' }

export type SessionOptions = {
  treatment: TreatmentId
  seed: number
  /** A "disaster case": extreme grime, extra steps, bigger pay. */
  disaster?: boolean
  /** Tool tier, 1 to 4: faster and prettier. */
  tier?: number
  /** The polish colour the customer asked for, if any. */
  wish?: number
  /** Resume a paused treatment at this step (earlier steps count as done). */
  startStep?: number
}

/** 'na': the step did not apply to this customer (nothing to do), so it is not counted. */
export type StepStatus = 'todo' | 'done' | 'skipped' | 'na'

export type TreatmentResult = {
  treatment: TreatmentId
  seconds: number
  par: number
  required: number
  done: number
  skipped: number
  optionalDone: number
  popped: number
  extracted: number
  fourHands: boolean
  wishMatched: boolean | null
  disaster: boolean
  /** 0 to 1: every step done well, plus extras. */
  thoroughness: number
  /** The lead saved the before-and-after photo (set by the salon glue, not the session). */
  photo?: boolean
}

export const TIER_RATE = [1, 1.5, 2.1, 2.6]
export const TIER_RADIUS = [1, 1.16, 1.32, 1.42]
/** Four hands: another player squeezing a spot this close (art px) speeds both squeezes up by ASSIST_RATE. */
export const ASSIST_RANGE = 170
export const ASSIST_RATE = 1.6
/** Pseudo-layer the renderer uses for the wet, glossy look. Not measured. */
export const WET = '$wet'
/** The peel line runs from the chin (progress 0) to the hairline (1). */
export const PEEL_FROM = 915, PEEL_TO = 262
/** A foot mask peels from the toes up to the towel over the ankle. */
export const FOOT_PEEL_FROM = 955, FOOT_PEEL_TO = 175
/** The peel's front edge sags a little in the middle, like a real sheet being lifted. */
export const peelCurve = (x: number) => 26 * (1 - Math.min(1, ((x - 512) / 290) ** 2))

const regionCache = new Map<RegionId, Uint8Array>()
/** A fixed region's cells (the face and the hand). A foot's regions are the customer's own: see TreatmentSession.mask. */
export function regionMask(id: RegionId) {
  let mask = regionCache.get(id)
  if (!mask) { mask = rasterize(REGIONS[id as BaseRegionId] ?? REGIONS.everywhere); regionCache.set(id, mask) }
  return mask
}

/** One customer's foot regions, rasterised once per seed (co-op partners and a resumed treatment agree). */
const footCache = new Map<string, Uint8Array>()
export function footRegionMask(seed: number, a: FootAnatomy, p: FootProfile, id: FootRegionId): Uint8Array {
  const key = `${seed}|${id}`
  let mask = footCache.get(key)
  if (!mask) {
    if (footCache.size > 400) footCache.clear()
    mask = rasterize(footRegion(a, p, id))
    footCache.set(key, mask)
  }
  return mask
}

/** A foot region by id, including the ones made from this customer's conditions (fungal nails, the sore spots). */
export function footRegion(a: FootAnatomy, p: FootProfile, id: FootRegionId): Region {
  const [view, name] = id.split('.') as ['top' | 'sole', string]
  if (view === 'sole') return (a.regions.sole as Record<string, Region>)[name] ?? a.regions.sole.everywhere
  const big = a.nails[0]
  const fold = (side: number): Region['include'][number] => {
    const nx = -big.dir.y * side, ny = big.dir.x * side, o = big.halfWidth * 0.98
    return { t: 'capsule', x0: big.base.x + nx * o + big.dir.x * 20, y0: big.base.y + ny * o + big.dir.y * 20, x1: big.tip.x + nx * o * 0.95 - big.dir.x * 8, y1: big.tip.y + ny * o * 0.95 - big.dir.y * 8, r0: 13, r1: 17 }
  }
  const folds = p.ingrown ? [fold(p.ingrown)] : [fold(-1), fold(1)]
  if (name === 'fungal') return { include: a.shapes.nailShapes.filter((_, i) => p.fungus[i] > 0) }
  if (name === 'fold') return { include: folds }
  if (name === 'treated') {
    const spots = p.corns.map(c => ({ t: 'ellipse' as const, cx: c.x, cy: c.y, rx: 30, ry: 30 }))
    return { include: p.ingrown || !spots.length ? [...folds, ...spots] : spots }
  }
  return (a.regions.top as Record<string, Region>)[name] ?? a.regions.top.everywhere
}

type Zone = { cells: number[]; start: number; done: boolean }

const zoneCache = new Map<string, number[][]>()
/**
 * A region split into zones that finish one by one: separate pieces (each nail) are their own zones; a big
 * piece (the face) is cut into blocks of about a hand's width. `mask` and `key` for a customer's own region.
 */
export function zonesOf(id: RegionId, mask = regionMask(id), key: string = id): number[][] {
  const cached = zoneCache.get(key)
  if (cached) return cached
  if (zoneCache.size > 400) zoneCache.clear()
  const seen = new Uint8Array(mask.length)
  const pieces: number[][] = []
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || seen[i]) continue
    const piece: number[] = []
    const stack = [i]
    seen[i] = 1
    while (stack.length) {
      const c = stack.pop()!
      piece.push(c)
      const x = c % GRID, y = Math.floor(c / GRID)
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) continue
        const n = ny * GRID + nx
        if (mask[n] && !seen[n]) { seen[n] = 1; stack.push(n) }
      }
    }
    pieces.push(piece)
  }
  const zones: number[][] = []
  for (const piece of pieces) {
    if (piece.length < 8) continue
    if (piece.length <= 400) { zones.push(piece); continue }
    // Big pieces: blocks of 24 x 24 cells, small leftovers merged into their neighbour block.
    const blocks = new Map<number, number[]>()
    for (const c of piece) { const k = Math.floor((c % GRID) / 24) + Math.floor(Math.floor(c / GRID) / 24) * 100; (blocks.get(k) ?? blocks.set(k, []).get(k)!).push(c) }
    let carry: number[] = []
    for (const cells of blocks.values()) { const all = carry.concat(cells); if (all.length < 120) { carry = all; continue } zones.push(all); carry = [] }
    if (carry.length && zones.length) zones[zones.length - 1].push(...carry)
  }
  zoneCache.set(key, zones)
  return zones
}

/** How long a whitehead, a blackhead or a hangnail must be held, in seconds at tier 1. */
export function holdTime(target: Target) {
  if (target.kind === 'whitehead') return 0.35 + 0.6 * target.size
  if (target.kind === 'blackhead') return 0.28 + 0.3 * target.size
  if (target.kind === 'hangnail') return 0.32
  if (target.kind === 'corn') return 0.45 + 0.35 * target.size
  if (target.kind === 'ingrown') return 1.1
  if (target.kind === 'splinter') return 0.55 + 0.25 * target.size
  return 0
}

/** How close a press must be to a target, in art pixels: right on the spot for pimples and blackheads. */
export function hitRadius(target: Target) {
  if (target.kind === 'blackhead') return 15 + 7 * target.size
  if (target.kind === 'whitehead') return 22 + 14 * target.size
  if (target.kind === 'drop') return 70
  if (target.kind === 'gem' || target.kind === 'tip') return 56
  if (target.kind === 'corn' || target.kind === 'splinter' || target.kind === 'ingrown') return 46
  return 48
}

/** Where whiteheads gather, by cluster: boxes in art space [x0, x1, y0, y1]. */
const ZONES: Record<string, [number, number, number, number][]> = {
  forehead: [[380, 644, 388, 452]],
  tzone: [[420, 604, 390, 450], [470, 554, 540, 600], [440, 584, 820, 880]],
  chin: [[420, 604, 810, 890]],
  cheeks: [[300, 420, 600, 760], [604, 724, 600, 760]],
  scattered: [[300, 420, 600, 760], [604, 724, 600, 760], [430, 594, 820, 880], [400, 624, 390, 432], [470, 554, 560, 600]],
}

export class TreatmentSession {
  /** The treatment with this customer's own step list (plan.ts). */
  readonly def: TreatmentDef
  readonly plan: TreatmentPlan
  readonly tier: number
  readonly seed: number
  readonly disaster: boolean
  readonly wish: number | null
  readonly profile: Profile
  step = 0
  layers: Record<string, Float32Array> = {}
  targets: Target[] = []
  status: StepStatus[]
  /** For hold steps: 0 to 1. */
  hold = 0
  peel = { progress: 0, unstuck: false, released: false }
  choices: Record<number, number> = {}
  /**
   * Each player's grip: the target their current press is on (hold targets). Each spot takes its own press,
   * sliding off or lifting lets go, and one player's press never takes another's spot away.
   */
  grips: Record<number, number | null> = {}
  elapsed = 0
  ready = false
  finished = false
  popped = 0
  extracted = 0
  /** Feet: the customer's own foot (regions and toes), for both views. */
  readonly anatomy: FootAnatomy | null = null
  /** Coverage of the step's layer inside its region when the step began (erase steps). */
  private startSum = 0
  /** The step's region split into zones, each finishing on its own. */
  private zones: Zone[] = []
  private events: SessionEvent[] = []
  private nextTarget = 1
  private rng: Rng

  constructor(options: SessionOptions) {
    this.tier = clamp(Math.round(options.tier ?? 1), 1, TIER_RATE.length)
    this.seed = options.seed
    this.disaster = !!options.disaster
    this.plan = planTreatment(options.treatment, options.seed, this.disaster)
    this.def = this.plan.def
    this.wish = options.wish ?? null
    this.rng = makeRng(options.seed)
    this.profile = profileFor(this.def.bodyPart, options.seed, this.disaster)
    if (this.profile.kind === 'foot') this.anatomy = footAnatomy(options.seed)
    this.status = this.def.steps.map(() => 'todo')
    for (const layer of this.def.layers) this.layers[layer.id] = this.seedLayer(layer.seed, layer.region, layer.id)
    this.layers[WET] = new Float32Array(GRID * GRID)
    this.makeTargets()
    // Steps this customer will never need drop out now, so the step count is right from the first step.
    this.def.steps.forEach((step, i) => { if (!this.planned(step)) this.status[i] = 'na' })
    const start = clamp(options.startStep ?? 0, 0, this.def.steps.length)
    // Resume: earlier steps count as done and their layers settle as if finished.
    if (start === 0) this.beginStep()
    else {
      while (this.step < start && !this.finished) this.apply({ k: 'advance', s: this.step })
    }
    this.events.length = 0
  }

  get current(): StepDef | undefined { return this.def.steps[this.step] }
  /** Spots finished side by side with the partner (four hands). */
  get lampAssists(): number { return this.targets.filter(t => t.worked && t.assist).length }
  /** Spots each player finished (pops, plugs, drops, gems...). */
  get doneBy(): Record<number, number> {
    const out: Record<number, number> = {}
    for (const t of this.targets) if (t.worked && t.by !== undefined) out[t.by] = (out[t.by] ?? 0) + 1
    return out
  }
  /** Player 0's grip (solo play). */
  get grip(): number | null { return this.grips[0] ?? null }
  /** The target a player is gripping, while it is still to do. */
  gripOf(p: number): Target | null {
    const id = this.grips[p]
    return id === undefined || id === null ? null : this.targets.find(t => t.id === id && !t.done) ?? null
  }
  /** Is another player (not `p`) squeezing a spot within reach of this one? */
  assisted(t: { x: number; y: number }, p: number): boolean {
    for (const [q, id] of Object.entries(this.grips)) {
      if (Number(q) === p || id === null) continue
      const o = this.targets.find(x => x.id === id && !x.done)
      if (o && dist(o.x, o.y, t.x, t.y) < ASSIST_RANGE) return true
    }
    return false
  }
  get face(): FaceProfile | null { return this.profile.kind === 'face' ? this.profile : null }
  get hand(): HandProfile | null { return this.profile.kind === 'hand' ? this.profile : null }
  get foot(): FootProfile | null { return this.profile.kind === 'foot' ? this.profile : null }
  /** Feet: the side of the foot the current step works on. */
  get view(): 'top' | 'sole' { return viewOf(this.current) }

  /** A region's cells for this customer (a foot's regions are its own; the face's and hand's are shared). */
  mask(id: RegionId): Uint8Array {
    if (isFootRegion(id) && this.anatomy && this.foot) return footRegionMask(this.seed, this.anatomy, this.foot, id)
    return regionMask(id)
  }

  /** The peel line's start (progress 0) and end (1), in art space. */
  get peelRange(): [number, number] { return this.foot ? [FOOT_PEEL_FROM, FOOT_PEEL_TO] : [PEEL_FROM, PEEL_TO] }

  /** Take the events since the last call. */
  drain(): SessionEvent[] {
    const out = this.events
    this.events = []
    return out
  }

  private emit(event: SessionEvent) { this.events.push(event) }

  // ------------------------------------------------------------------ seeding

  private seedLayer(seed: string, regionId: RegionId, layerId = ''): Float32Array {
    const grid = new Float32Array(GRID * GRID)
    const region = this.mask(regionId)
    if (seed === 'foot') { this.seedFoot(grid, region, layerId); return grid }
    const r = this.rng
    const blobs = (count: number, pick: () => [number, number], rMin: number, rMax: number, aMin: number, aMax: number) => {
      for (let i = 0; i < count; i++) {
        const [x, y] = pick()
        stamp(grid, x, y, r.range(rMin, rMax), r.range(aMin, aMax), region)
      }
    }
    const f = this.face, h = this.hand
    switch (seed) {
      case 'full': for (let i = 0; i < grid.length; i++) grid[i] = region[i]; break
      case 'grime': {
        const g = f?.grime ?? 0
        if (g <= 0) break
        // Grime gathers around the nose, the chin, the forehead and the hairline.
        const spots: [number, number][] = [[512, 620], [512, 860], [512, 360], [340, 700], [684, 700], [300, 460], [724, 460]]
        blobs(Math.round(14 * g), () => { const s = r.pick(spots); return [s[0] + r.range(-120, 120), s[1] + r.range(-80, 80)] }, 38, 95, 0.4 * Math.min(1.4, g), 0.9)
        blobs(Math.round(9 * g), () => [r.range(260, 764), r.range(320, 900)], 20, 50, 0.35, 0.8)
        break
      }
      case 'grime2':
        if (this.disaster) blobs(18, () => [r.range(280, 744), r.range(340, 900)], 40, 100, 0.6, 1)
        break
      case 'oil': blobs(Math.round(8 * (f?.oil ?? 0)), () => [512 + r.range(-190, 190), r.pick([380, 620, 850]) + r.range(-40, 40)], 40, 90, 0.5, 1); break
      case 'redness': {
        const k = f?.redness ?? 0
        blobs(Math.round(7 * k), () => [r.chance(0.5) ? r.range(320, 420) : r.range(604, 704), r.range(590, 720)], 50, 100, 0.35, 0.7)
        blobs(Math.round(3 * k), () => [512 + r.range(-60, 60), r.range(820, 880)], 30, 60, 0.3, 0.55)
        break
      }
      case 'flakes': blobs(Math.round(10 * (f?.flakes ?? 0)), () => [r.pick([360, 664, 512]) + r.range(-70, 70), r.pick([640, 400, 860]) + r.range(-50, 50)], 30, 70, 0.5, 1); break
      case 'polish': {
        const p = h?.polish
        if (!p) break
        for (let i = 0; i < grid.length; i++) grid[i] = region[i]
        // Chipped old polish: bites out of the free edges.
        for (const finger of HAND.fingers) {
          const n = nailOf(finger)
          for (let c = 0; c < Math.round(1 + p.chips * 4); c++) {
            const t = r.range(0.6, 1.05)
            const side = r.range(-0.9, 0.9) * n.halfWidth
            stamp(grid, n.base.x + (n.tip.x - n.base.x) * t - n.dir.y * side, n.base.y + (n.tip.y - n.base.y) * t + n.dir.x * side, r.range(8, 20), -1, region)
          }
        }
        break
      }
      case 'dirt': if ((h?.dirt ?? 0) > 0) for (let i = 0; i < grid.length; i++) grid[i] = region[i] * h!.dirt; break
      case 'cuticle': for (let i = 0; i < grid.length; i++) grid[i] = region[i] * (h?.cuticle ?? 1); break
      case 'dry': {
        const d = h?.dry ?? 0
        if (d > 0) blobs(Math.round(12 * d), () => { const fg = r.pick(HAND.fingers); return [fg.base.x + r.range(-30, 30), fg.base.y + r.range(0, 60)] }, 26, 60, 0.5, 1)
        if (d > 0) blobs(Math.round(4 * d), () => [r.range(420, 640), r.range(700, 900)], 40, 80, 0.4, 0.8)
        break
      }
    }
    return grid
  }

  /**
   * A foot's condition layers, from its profile (docs/FEET-WIRING.md): whole shapes for the layers whose art
   * already scales with severity (fungus, old polish, swelling, calluses, cracks, cuticles, hair), patches for
   * dirt, dry skin and redness.
   */
  private seedFoot(grid: Float32Array, region: Uint8Array, id: string) {
    const p = this.foot, a = this.anatomy
    if (!p || !a) return
    const r = this.rng
    const fill = (k = 1) => { for (let i = 0; i < grid.length; i++) grid[i] = region[i] * k }
    const blobs = (count: number, pick: () => { x: number; y: number }, rMin: number, rMax: number, aMin: number, aMax: number) => {
      for (let i = 0; i < count; i++) { const q = pick(); stamp(grid, q.x, q.y, r.range(rMin, rMax), r.range(aMin, aMax), region) }
    }
    const toes = a.shape.toes, soleToes = a.shape.soleToes
    const w = a.shape.width, sx = (x: number) => 512 + (x - 512) * w
    switch (id) {
      case 'top.fungus': if (p.fungus.some(f => f > 0)) fill(); break
      case 'top.swelling': if (p.ingrown) fill(); break
      case 'top.callus': case 'sole.callus': if (p.calluses > 0.05) fill(); break
      case 'sole.cracks': if (p.cracks > 0.05) fill(); break
      case 'top.hair': if (p.hair > 0.05) fill(); break
      case 'top.cuticle': fill(p.cuticle); break
      case 'top.oldPolish': {
        if (!p.polish) break
        // No polish left on a crumbling fungal nail.
        a.shapes.nailShapes.forEach((shape, i) => {
          if (p.fungus[i] > 0.3) return
          const only = rasterize({ include: [shape] })
          for (let k = 0; k < grid.length; k++) if (only[k] && region[k]) grid[k] = 1
        })
        break
      }
      case 'top.dirt': {
        if (p.dirt <= 0) break
        // Grime over the foot, thicker in the toe creases and the clefts.
        blobs(Math.round(10 + 16 * p.dirt), () => ({ x: r.range(200, 840), y: r.range(200, 880) }), 50, 110, 0.35 * p.dirt, 0.9 * p.dirt + 0.1)
        blobs(Math.round(8 * p.dirt) + 3, () => { const t = r.pick(toes); return alongToe(t, r.range(0.05, 0.7), r.range(-0.8, 0.8)) }, 40, 76, 0.25, 0.55)
        break
      }
      case 'sole.dirt': {
        if (p.dirt <= 0) break
        // Everything that touches the floor: the heel, the ball, the outer edge and the toe pads; never the arch.
        const spots = [{ x: sx(552), y: 862 }, { x: sx(520), y: 388 }, { x: sx(690), y: 620 }, ...soleToes.map(t => alongToe(t, 0.75))]
        blobs(Math.round(12 + 14 * p.dirt), () => { const q = r.pick(spots); return { x: q.x + r.range(-90, 90), y: q.y + r.range(-60, 60) } }, 50, 100, 0.4 * p.dirt, 0.8 * p.dirt + 0.2)
        break
      }
      case 'sole.dry': {
        if (p.dry <= 0) break
        blobs(Math.round(6 + 8 * p.dry), () => r.chance(0.6) ? { x: sx(552) + r.range(-110, 110), y: 862 + r.range(-90, 90) } : { x: sx(520) + r.range(-170, 170), y: 388 + r.range(-50, 50) }, 40, 90, 0.4, 0.9)
        break
      }
      case 'top.redness': {
        // Round sick nails, corns, the ingrown fold, and between the toes.
        toes.forEach((t, i) => {
          if (p.fungus[i] <= 0) return
          const q = toeNail(t).tip
          blobs(3, () => ({ x: q.x + r.range(-30, 30), y: q.y + r.range(-40, 20) }), 30, 60, 0.35, 0.7)
        })
        for (const c of p.corns) blobs(2, () => ({ x: c.x + r.range(-12, 12), y: c.y + r.range(-12, 12) }), 26, 44, 0.4, 0.7)
        if (p.ingrown) { const q = ingrownSpot(a, p.ingrown); blobs(3, () => ({ x: q.x + r.range(-16, 16), y: q.y + r.range(-40, 30) }), 26, 50, 0.5, 0.9) }
        break
      }
    }
  }

  private makeTargets() {
    const r = this.rng
    const add = (kind: TargetKind, x: number, y: number, size: number, n?: number, extra: Partial<Target> = {}) =>
      this.targets.push({ id: this.nextTarget++, kind, x, y, size, progress: 0, done: false, n, ...extra })
    const inSkin = (x: number, y: number) => inRegion(REGIONS.skin, x, y)
    const spaced = (list: { x: number; y: number }[], x: number, y: number, gap: number) => list.every(p => dist(p.x, p.y, x, y) >= gap)
    const f = this.face, h = this.hand
    if (f) {
      const placed: { x: number; y: number }[] = []
      // reach: how far the biggest bump spreads, so none of it lies on the headband.
      const clearOfBand = (x: number, y: number, reach: number) => y - reach >= bandEdge('bottom', clamp((x - 186) / 652, 0, 1)).y
      const place = (count: number, zones: [number, number, number, number][], gap: number, reach: number, make: (x: number, y: number) => void) => {
        let made = 0
        for (let tries = 0; made < count && tries < 600; tries++) {
          const z = r.pick(zones)
          const x = r.range(z[0], z[1]), y = r.range(z[2], z[3])
          if (!inSkin(x, y) || !spaced(placed, x, y, gap) || !clearOfBand(x, y, reach)) continue
          placed.push({ x, y })
          make(x, y)
          made++
        }
      }
      // Most whiteheads gather in this customer's cluster; a few stray elsewhere.
      const inCluster = Math.round(f.whiteheads * 0.7)
      place(inCluster, ZONES[f.cluster], 46, 30, (x, y) => add('whitehead', x, y, r.range(0.5, 1.2)))
      place(f.whiteheads - inCluster, ZONES.scattered, 56, 30, (x, y) => add('whitehead', x, y, r.range(0.5, 1.25)))
      // Deep ones: bigger, red, under the skin; two squeezes.
      place(f.deep, ZONES.scattered, 70, 56, (x, y) => add('whitehead', x, y, r.range(1.15, 1.5), undefined, { stage: 2 }))
      const blackheads: { x: number; y: number }[] = []
      for (let tries = 0; blackheads.length < f.blackheads && tries < 800; tries++) {
        const side = r.chance(0.5) ? -1 : 1
        const zone = r()
        // Mostly the sides of the nose and the creases by the wings; a few on the bridge and tip.
        const x = zone < 0.45 ? FACE.nose.x + side * r.range(22, 56) : zone < 0.8 ? FACE.nose.x + side * r.range(44, 70) : FACE.nose.x + r.range(-20, 20)
        const y = zone < 0.45 ? FACE.nose.y + r.range(-44, 10) : zone < 0.8 ? FACE.nose.y + r.range(8, 40) : FACE.nose.y + r.range(-30, 0)
        if (!inRegion(REGIONS.nose, x, y) || !spaced(blackheads, x, y, 14)) continue
        blackheads.push({ x, y })
        add('blackhead', x, y, r.range(0.4, 1.25))
      }
      for (const [x, y] of [[512, 410], [372, 650], [652, 650], [512, 850], [512, 582]]) add('drop', x, y, 1)
    } else if (h) {
      HAND.fingers.forEach((finger, i) => {
        if (h.grown[i] <= 0) return
        const e = freeEdgeOf(finger, h.grown[i])
        add('tip', e.x, e.y, h.grown[i] / 34, i)
      })
      const fingers = [0, 1, 2, 3, 4].sort(() => r() - 0.5).slice(0, h.hangnails)
      for (const i of fingers) {
        const n = nailOf(HAND.fingers[i])
        const side = r.chance(0.5) ? 1 : -1
        add('hangnail', n.base.x - n.dir.y * side * (n.halfWidth + 6) + n.dir.x * 12, n.base.y + n.dir.x * side * (n.halfWidth + 6) + n.dir.y * 12, 1, i)
      }
      HAND.fingers.forEach((finger, i) => {
        const n = nailOf(finger)
        add('gem', n.base.x + (n.tip.x - n.base.x) * 0.42, n.base.y + (n.tip.y - n.base.y) * 0.42, 1, i)
      })
    } else if (this.foot && this.anatomy) {
      const p = this.foot, a = this.anatomy
      // Overgrown toenails (the art paints a tip from 4 px on), fungal ones thick and yellow.
      a.shape.toes.forEach((t, i) => {
        if (p.grown[i] < 4) return
        const e = toeFreeEdge(t, p.grown[i])
        add('tip', e.x, e.y, Math.max(0.5, p.grown[i] / 20), i, { view: 'top' })
      })
      for (const c of p.corns) add('corn', c.x, c.y, c.size / 40, c.toe, { view: 'top' })
      if (p.ingrown) { const q = ingrownSpot(a, p.ingrown); add('ingrown', q.x, q.y, 1, 0, { view: 'top' }) }
      for (const sp of p.splinters) add('splinter', sp.x, sp.y, sp.size / 36, undefined, { view: 'sole', angle: sp.angle })
    }
  }

  // ------------------------------------------------------------------ steps

  /** Does a step apply to this customer right now? */
  private applies(step: StepDef): boolean {
    if (step.need === 'disaster') return this.disaster
    if (step.need === 'targets') {
      if (step.targets === 'patch' && !step.targetTag) return this.targets.some(t => t.kind === 'whitehead' && t.done)
      if (step.targets === 'patch' && (step.targetTag === 'top' || step.targetTag === 'sole')) return this.plasterSpots(step.targetTag).length > 0
      return this.targets.some(t => t.kind === step.targets && !t.done)
    }
    if (step.need === 'layer' && step.layer) return sumIn(this.layers[step.layer], this.mask(step.region)) > 1.5
    return true
  }

  /**
   * Will this customer need the step, as far as can be told before anything is done? Pimple patches, plasters
   * and the antiseptic count on the pops and pulls before them being done.
   */
  private planned(step: StepDef): boolean {
    const any = (...kinds: TargetKind[]) => this.targets.some(t => kinds.includes(t.kind))
    if (step.need === 'targets' && step.targets === 'patch' && !step.targetTag) return any('whitehead')
    if (step.need === 'targets' && step.targets === 'patch' && step.targetTag === 'top') return any('corn', 'ingrown')
    if (step.need === 'targets' && step.targets === 'patch' && step.targetTag === 'sole') return any('splinter')
    if (step.need === 'layer' && step.layer === 'marks') return any('whitehead', 'blackhead')
    return this.applies(step)
  }

  private beginStep() {
    // Steps with nothing to do for this customer drop out without a penalty: planned out from the start, or (for
    // what depends on the pops before them) nothing to do now. A planned clean-up of the customer's own grime or
    // polish stays even if an earlier step took most of it, so the step count holds.
    const stays = (step: StepDef) => step.need === 'layer' && step.layer !== 'marks'
    while (this.current && (this.status[this.step] === 'na' || (!stays(this.current) && !this.applies(this.current)))) {
      const from = this.step
      this.status[from] = 'na'
      this.step++
      this.emit({ e: 'advance', from, to: this.step, skipped: false, na: true })
    }
    const step = this.current
    if (!step) { this.finished = true; this.emit({ e: 'done' }); return }
    this.hold = 0
    this.grips = {}
    this.ready = false
    if (step.targets === 'patch' && !step.targetTag) this.makePatches()
    if (step.targetTag === 'eye') this.makeEyePatches()
    if (step.targets === 'patch' && (step.targetTag === 'top' || step.targetTag === 'sole')) this.makePlasters(step.targetTag)
    // A hold step with a layer fills it as it begins (the foot bath's water comes in) and drains it at the end.
    if (step.gesture === 'hold' && step.layer) this.resolveLayer(step.layer, 1, step.region)
    if (step.id === 'moisturize') {
      for (const [x, y, rr] of [[400, 660, 58], [624, 660, 58], [512, 392, 62]]) this.stampLayer('cream', x, y, rr, 1, 'skin')
    }
    if (step.gesture === 'erase' && step.layer) this.startSum = sumIn(this.layers[step.layer], this.mask(step.region))
    this.zones = step.layer && (step.gesture === 'erase' || step.gesture === 'paint' || step.gesture === 'rub') ? zonesOf(step.region, this.mask(step.region), this.foot ? `${this.seed}|${step.region}` : step.region).map(cells => ({ cells, start: step.gesture === 'erase' ? cells.reduce((a, i) => a + this.layers[step.layer!][i], 0) : 0, done: false })) : []
    this.emit({ e: 'setup', step: this.step })
    this.checkReady()
  }

  /** Cooling patches under each eye. */
  private makeEyePatches() {
    if (this.targets.some(t => t.tag === 'eye')) return
    for (const e of FACE.eyes) this.targets.push({ id: this.nextTarget++, kind: 'patch', x: e.x, y: e.y + 62, size: 1.3, progress: 0, done: false, tag: 'eye' })
  }

  /** Feet: where plasters go on one side: the lifted corns and the eased ingrown nail on top, the pulled splinters on the sole. */
  private plasterSpots(view: 'top' | 'sole'): Target[] {
    return this.targets.filter(t => t.done && (view === 'top' ? t.kind === 'corn' || t.kind === 'ingrown' : t.kind === 'splinter'))
  }

  private makePlasters(view: 'top' | 'sole') {
    if (this.targets.some(t => t.kind === 'patch' && t.tag === view)) return
    for (const t of this.plasterSpots(view)) this.targets.push({ id: this.nextTarget++, kind: 'patch', x: t.x, y: t.y, size: 1, progress: 0, done: false, tag: view, view, n: t.n })
  }

  /** Patches go on the biggest spots that were popped. */
  private makePatches() {
    if (this.targets.some(t => t.kind === 'patch' && !t.tag)) return
    const popped = this.targets.filter(t => t.kind === 'whitehead' && t.done).sort((a, b) => b.size - a.size).slice(0, 3)
    for (const t of popped) this.targets.push({ id: this.nextTarget++, kind: 'patch', x: t.x, y: t.y, size: t.size, progress: 0, done: false })
  }

  /** How far the current step is, 0 to 1. */
  progress(): number {
    const step = this.current
    if (!step) return 1
    switch (step.gesture) {
      case 'erase': {
        if (!step.layer || this.startSum < 0.5) return 1
        return clamp(1 - sumIn(this.layers[step.layer], this.mask(step.region)) / this.startSum)
      }
      case 'paint':
      case 'rub':
        if (step.choice && this.choices[this.step] === undefined) return 0
        return step.layer ? paintedShare(this.layers[step.layer], this.mask(step.region)) : 0
      case 'hold': return clamp(this.hold)
      case 'peel': return clamp(this.peel.progress)
      case 'targets':
      case 'sweep': {
        const list = this.stepTargets()
        // Optional target steps (gems) are "done" once one is placed; the player finishes them.
        if (step.optional) return list.length === 0 ? 1 : list.some(t => t.done) ? 1 : 0
        if (list.length === 0) return 1
        // Deep pimples count half when their first squeeze is done.
        return list.reduce((a, t) => a + (t.done ? 1 : t.stage === 1 ? 0.5 : 0), 0) / list.length
      }
    }
  }

  /** The share at which the current step completes by itself. */
  threshold() {
    const step = this.current
    if (!step) return 1
    if (step.gesture === 'erase' || step.gesture === 'paint' || step.gesture === 'rub') return step.complete ?? 0.95
    return 1
  }

  stepTargets(): Target[] {
    const kind = this.current?.targets
    const tag = this.current?.targetTag
    return kind ? this.targets.filter(t => t.kind === kind && t.tag === tag) : []
  }

  private checkReady() {
    this.checkZones()
    if (this.ready || !this.current) return
    // Optional steps wait for the player to press Finish even when something was placed.
    if (this.current.optional) return
    if (this.progress() >= this.threshold() - 1e-9) {
      this.ready = true
      this.emit({ e: 'ready', step: this.step })
    }
  }

  private checkZones() {
    const step = this.current
    if (!step?.layer || !this.zones.length) return
    const grid = this.layers[step.layer]
    const goal = this.threshold()
    for (const z of this.zones) {
      if (z.done) continue
      let p: number
      if (step.gesture === 'erase') p = z.start < 0.5 ? 1 : 1 - z.cells.reduce((a, i) => a + grid[i], 0) / z.start
      else p = z.cells.reduce((a, i) => a + Math.min(1, grid[i] / 0.8), 0) / z.cells.length
      if (p < goal) continue
      z.done = true
      if (z.start < 0.5 && step.gesture === 'erase') continue
      let x = 0, y = 0
      for (const i of z.cells) { x += (i % GRID) + 0.5; y += Math.floor(i / GRID) + 0.5 }
      this.emit({ e: 'zone', x: (x / z.cells.length) * (1024 / GRID), y: (y / z.cells.length) * (1024 / GRID) })
    }
  }

  private speed() { return TIER_RATE[this.tier - 1] }

  private stampLayer(layer: string, x: number, y: number, r: number, amount: number, regionId: RegionId) {
    const grid = this.layers[layer]
    if (!grid) return 0
    const changed = stamp(grid, x, y, r, amount, this.mask(regionId))
    this.emit({ e: 'stamp', layer, x, y, r, amount, changed })
    return changed
  }

  /** Apply one op. Ops for a step that is no longer current are ignored (a late co-op message). */
  apply(op: Op) {
    if (this.finished) return
    if (op.s !== this.step) return
    const step = this.current
    if (!step) return
    switch (op.k) {
      case 'stroke': {
        this.stroke(step, op.x0, op.y0, op.x1, op.y1)
        const pts = Array.isArray(op.pts) ? op.pts : []
        for (let i = 0, x = op.x1, y = op.y1; i + 1 < pts.length; i += 2) { this.stroke(step, x, y, pts[i], pts[i + 1]); x = pts[i]; y = pts[i + 1] }
        break
      }
      case 'hold': this.holdAt(step, op); break
      case 'lift': this.grips[op.p ?? 0] = null; break
      case 'tick':
        if (step.gesture === 'hold' && step.passive) { this.hold = clamp(this.hold + op.dt * step.passive * this.speed() / (step.holdSeconds ?? 3)); this.emit({ e: 'hold', progress: this.hold }) }
        break
      case 'tap': this.tap(step, op); break
      case 'peel': this.peelTo(step, op.v, op.dt); break
      case 'choose':
        if (step.choice) { this.choices[this.step] = op.i; this.emit({ e: 'choose', index: op.i }) }
        break
      case 'advance': this.advance(!!op.skip); return
    }
    this.checkReady()
  }

  private stroke(step: StepDef, x0: number, y0: number, x1: number, y1: number) {
    if (step.gesture === 'hold' || step.gesture === 'targets' || step.gesture === 'peel') return
    if (step.choice && this.choices[this.step] === undefined) return
    let length = dist(x0, y0, x1, y1)
    if (length > 420) { const k = 420 / length; x1 = x0 + (x1 - x0) * k; y1 = y0 + (y1 - y0) * k; length = 420 }
    const radius = (step.radius ?? 50) * TIER_RADIUS[this.tier - 1]
    const rate = (step.rate ?? 0.2) * this.speed()
    const spacing = Math.max(4, radius * 0.3)
    const count = Math.max(1, Math.ceil(length / spacing))
    for (let i = 1; i <= count; i++) {
      const t = i / count
      const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t
      if (step.gesture === 'sweep') { this.sweepAt(x, y, radius, rate); continue }
      if (step.layer) {
        const sign = step.gesture === 'erase' ? -1 : 1
        this.stampLayer(step.layer, x, y, radius, sign * rate, step.gesture === 'erase' ? 'everywhere' : step.region)
      }
      for (const also of step.also ?? []) this.stampLayer(also.layer, x, y, radius, also.amount * this.speed(), 'everywhere')
      if (step.wet) this.stampLayer(WET, x, y, radius, step.wet * 0.5, 'everywhere')
    }
  }

  private sweepAt(x: number, y: number, radius: number, rate: number) {
    for (const t of this.stepTargets()) {
      if (t.done) continue
      const d = dist(x, y, t.x, t.y)
      if (d > radius * 0.6 + hitRadius(t) * 0.4) continue
      t.progress = clamp(t.progress + rate / (0.6 + 0.6 * t.size))
      this.emit({ e: 'target', id: t.id, progress: t.progress })
      if (t.progress >= 1) this.finishTarget(t)
    }
  }

  /** The spot a press by player `p` lands on: the closest within reach, a spot nobody else holds first. */
  private nearest(x: number, y: number, p: number): Target | null {
    const held = new Set<number>()
    for (const [q, id] of Object.entries(this.grips)) if (Number(q) !== p && id !== null) held.add(id)
    let best: Target | null = null, bestD = Infinity
    for (const t of this.stepTargets()) {
      if (t.done) continue
      const d = dist(x, y, t.x, t.y)
      if (d > hitRadius(t)) continue
      const rank = d + (held.has(t.id) ? 1e6 : 0)
      if (rank < bestD) { best = t; bestD = rank }
    }
    return best
  }

  private holdAt(step: StepDef, op: Extract<Op, { k: 'hold' }>) {
    const { x, y } = op
    const dt = clamp(op.dt, 0, 0.5)
    const p = op.p ?? 0
    if (step.gesture === 'hold') {
      const before = this.hold
      this.hold = clamp(this.hold + (dt * this.speed()) / (step.holdSeconds ?? 3))
      this.emit({ e: 'hold', progress: this.hold })
      if (step.wet) this.stampLayer(WET, x, y, 160, step.wet * dt, 'everywhere')
      // What the hold loosens (the foot bath softens the grime): the whole change over the full hold, evenly.
      if (step.also && this.hold > before) for (const also of step.also) this.fadeLayer(also.layer, also.amount * (this.hold - before))
      return
    }
    if (step.gesture !== 'targets') return
    // Only the spot this press landed on: a finger dragged across the face works nothing it slides onto.
    const t = this.gripOf(p)
    if (!t) return
    const time = holdTime(t)
    if (time <= 0) return
    // Sliding off the spot lets go; the next squeeze takes a fresh press.
    if (dist(x, y, t.x, t.y) > hitRadius(t) * 1.4) { this.grips[p] = null; t.gripped = false; return }
    // The second squeeze of a deep pimple needs a fresh press.
    if (t.stage === 1 && !t.gripped) return
    // Four hands: decided where the op was made (see Op), so every mirror squeezes alike.
    if (op.a === undefined) op.a = this.assisted(t, p) ? 1 : 0
    const boost = op.a ? ASSIST_RATE : 1
    t.progress = clamp(t.progress + (dt * this.speed() * boost) / time)
    this.emit({ e: 'target', id: t.id, progress: t.progress })
    if (t.progress < 1) return
    if (t.stage === 2) {
      // First squeeze: it comes to a head. Let go and squeeze again.
      t.stage = 1
      t.progress = 0
      t.gripped = false
      this.release(t.id)
      t.size = Math.max(0.8, t.size * 0.85)
      this.emit({ e: 'targetStage', id: t.id, x: t.x, y: t.y, size: t.size })
      return
    }
    this.finishTarget(t)
  }

  /** Everyone gripping this spot lets go of it. */
  private release(id: number) {
    for (const q of Object.keys(this.grips)) if (this.grips[Number(q)] === id) this.grips[Number(q)] = null
  }

  private tap(step: StepDef, op: Extract<Op, { k: 'tap' }>) {
    if (step.gesture !== 'targets') return
    const { x, y } = op
    const p = op.p ?? 0
    // The spot is chosen once, where the press was made. A mirror takes that same spot even if it was finished
    // there meanwhile (the press then does nothing), so every screen agrees on every grip.
    if (op.t === undefined) {
      const near = this.nearest(x, y, p)
      op.t = near?.id ?? 0
      op.a = near && this.assisted(near, p) ? 1 : 0
    }
    const t = op.t ? this.stepTargets().find(o => o.id === op.t && dist(x, y, o.x, o.y) <= hitRadius(o) + 1) : undefined
    if (!t) { this.grips[p] = null; this.emit({ e: 'miss', x, y }); return }
    t.by = t.by === undefined ? p : Math.min(t.by, p)
    if (op.a) t.assist = true
    // A press on a pimple or a blackhead grips that one spot (and is the fresh grip a deep one's second
    // squeeze needs); taps finish tap targets.
    if (holdTime(t) > 0) { this.grips[p] = t.done ? null : t.id; if (!t.done) t.gripped = true; return }
    if (t.done) return
    t.progress = 1
    this.finishTarget(t)
  }

  private finishTarget(t: Target) {
    t.done = true
    t.progress = 1
    t.worked = true
    this.release(t.id)
    if (t.kind === 'whitehead') { this.popped++; this.stampLayer('marks', t.x, t.y, 12 + 9 * t.size, 0.85, 'skin') }
    if (t.kind === 'blackhead') { this.extracted++; this.stampLayer('marks', t.x, t.y, 8 + 4 * t.size, 0.3, 'skin') }
    if (t.kind === 'drop') { this.stampLayer('serum', t.x, t.y, 96, 1, 'skin'); this.stampLayer(WET, t.x, t.y, 100, 0.9, 'everywhere') }
    if (t.kind === 'gem') t.n = this.targets.filter(o => o.kind === 'gem' && o.done).length
    // The ingrown edge eased out of the skin: the swollen fold calms down.
    if (t.kind === 'ingrown') this.resolveLayer('top.swelling', 0, 'everywhere')
    this.emit({ e: 'targetDone', id: t.id, kind: t.kind, x: t.x, y: t.y, size: t.size, n: t.n, by: t.by ?? -1 })
  }

  private peelTo(step: StepDef, v: number, dt: number) {
    if (step.gesture !== 'peel' || this.peel.released) return
    dt = clamp(dt, 0, 0.5)
    const target = clamp(v)
    const p = this.peel
    const tension = Math.max(0, target - p.progress)
    let unstuck = false
    if (!p.unstuck) {
      // The first bit sticks: pull a little past it and it lets go.
      if (tension > 0.1) { p.unstuck = true; unstuck = true; p.progress = Math.max(p.progress, 0.06) }
    } else {
      // Then it follows, but only so fast: too quick a pull just stretches it.
      p.progress = Math.min(target, p.progress + dt * 0.55 * this.speed())
    }
    if (p.progress >= 0.8) { p.progress = 1; p.released = true }
    const [from, to] = this.peelRange
    this.clearMaskBelow(from + (to - from) * p.progress)
    this.emit({ e: 'peel', progress: p.progress, tension, released: p.released, unstuck })
  }

  private clearMaskBelow(lineY: number) {
    const mask = this.layers[this.current?.layer ?? 'mask']
    if (!mask) return
    const cell = 1024 / GRID
    for (let gx = 0; gx < GRID; gx++) {
      const y = lineY + peelCurve((gx + 0.5) * cell)
      for (let gy = Math.max(0, Math.floor(y / cell)); gy < GRID; gy++) mask[gy * GRID + gx] = 0
    }
  }

  /** Finish the current step (or skip it) and move to the next. */
  private advance(skip: boolean) {
    const step = this.current
    if (!step) return
    // A choice nobody made (a skip, or a resumed treatment) falls back to what the customer wanted.
    if (step.choice && this.choices[this.step] === undefined) this.choices[this.step] = this.wish ?? 0
    if (step.optional) this.status[this.step] = !skip && this.stepTargets().some(t => t.done) ? 'done' : 'todo'
    else this.status[this.step] = skip ? 'skipped' : 'done'
    // A skipped step leaves the customer's own problem as it was (grime, old polish, calluses, pimples); only
    // the salon's own products (foam, a mask, the bath water) still come off, so the treatment carries on.
    const settles = (id: string) => !skip || this.isProduct(id)
    // The last few percent settle by themselves, so nobody hunts for pixels.
    if (step.layer && step.gesture !== 'targets') {
      const to = step.gesture === 'erase' || step.gesture === 'peel' || step.gesture === 'hold' ? 0 : 1
      if (!skip || (to === 0 && this.isProduct(step.layer))) this.resolveLayer(step.layer, to, to === 0 ? 'everywhere' : step.region)
    }
    // Out of the foot bath (or from under the hot towel), the foot is wet all over.
    if (this.foot && step.gesture === 'hold' && step.wet) this.stampLayer(WET, 512, 540, 760, step.wet, 'everywhere')
    for (const id of step.clears ?? []) if (settles(id)) this.resolveLayer(id, 0, 'everywhere')
    if (!skip && step.targets && !step.optional) for (const t of this.stepTargets()) if (!t.done) { t.done = true; t.progress = 1 }
    if (step.gesture === 'peel') { this.peel.progress = 1; this.peel.released = true }
    const from = this.step
    this.step++
    this.emit({ e: 'advance', from, to: this.step, skipped: skip, na: false })
    this.beginStep()
  }

  /** Something the salon put on (a paint, wet or glow layer), not one of the customer's own problems. */
  private isProduct(id: string) {
    const kind = this.def.layers.find(l => l.id === id)?.kind
    return kind === 'paint' || kind === 'wet' || kind === 'glow'
  }

  private resolveLayer(id: string, to: 0 | 1, regionId: RegionId) {
    const grid = this.layers[id]
    if (!grid) return
    const region = this.mask(regionId)
    for (let i = 0; i < grid.length; i++) if (to === 0) grid[i] = 0; else if (region[i]) grid[i] = 1
    this.emit({ e: 'resolve', layer: id, to })
  }

  /** Change a whole layer evenly by `amount` (a soak loosening the grime everywhere at once). */
  private fadeLayer(id: string, amount: number) {
    const grid = this.layers[id]
    if (!grid || amount === 0) return
    let changed = 0
    for (let i = 0; i < grid.length; i++) { if (!grid[i]) continue; const v = clamp(grid[i] + amount); changed += Math.abs(v - grid[i]); grid[i] = v }
    if (changed > 0) this.emit({ e: 'fade', layer: id, amount })
  }

  /** Add real seconds to the treatment's clock (the lead player's session only). */
  time(dt: number) { if (!this.finished) this.elapsed += clamp(dt, 0, 0.5) }

  /** The steps this customer actually gets (not-applicable ones left out). */
  activeSteps(): number[] { return this.def.steps.map((_, i) => i).filter(i => this.status[i] !== 'na') }

  result(): TreatmentResult {
    const steps = this.def.steps
    const counted = (i: number) => this.status[i] !== 'na'
    const required = steps.filter((s, i) => !s.optional && counted(i)).length
    const done = steps.filter((s, i) => !s.optional && this.status[i] === 'done').length
    const skipped = steps.filter((s, i) => !s.optional && this.status[i] === 'skipped').length
    const optionalDone = steps.filter((s, i) => s.optional && this.status[i] === 'done').length
    const colorStep = steps.findIndex(s => s.choice === 'polish')
    const wishMatched = this.wish === null || colorStep < 0 || this.choices[colorStep] === undefined ? null : this.choices[colorStep] === this.wish
    // Four hands: squeezing side by side a few times, or two players each doing a real share of the spots.
    const fourHands = this.lampAssists >= 3 || Object.values(this.doneBy).filter(n => n >= 2).length >= 2
    const thoroughness = clamp((done / Math.max(1, required)) * 0.9 + 0.06 * optionalDone + (fourHands ? 0.04 : 0) + (wishMatched ? 0.05 : 0))
    return { treatment: this.def.id, seconds: Math.round(this.elapsed), par: this.def.parSeconds, required, done, skipped, optionalDone, popped: this.popped, extracted: this.extracted, fourHands, wishMatched, disaster: this.disaster, thoroughness }
  }

  // ------------------------------------------------------------------ co-op sync

  /** Everything a late-joining partner needs to see this treatment as it is now. */
  snapshot(): SessionSnapshot {
    const layers: Record<string, string> = {}
    for (const [id, grid] of Object.entries(this.layers)) layers[id] = encodeGrid(grid)
    return { step: this.step, layers, targets: this.targets.map(t => ({ ...t })), status: [...this.status], hold: this.hold, peel: { ...this.peel }, choices: { ...this.choices }, popped: this.popped, extracted: this.extracted, startSum: this.startSum, ready: this.ready, elapsed: this.elapsed, grips: { ...this.grips } }
  }

  restore(snap: SessionSnapshot) {
    this.step = snap.step
    for (const [id, text] of Object.entries(snap.layers)) if (this.layers[id]) this.layers[id] = decodeGrid(text)
    this.targets = snap.targets.map(t => ({ ...t }))
    this.nextTarget = Math.max(0, ...this.targets.map(t => t.id)) + 1
    this.status = [...snap.status]
    this.hold = snap.hold
    this.peel = { ...snap.peel }
    this.choices = { ...snap.choices }
    this.popped = snap.popped
    this.extracted = snap.extracted
    this.startSum = snap.startSum
    this.ready = snap.ready
    this.elapsed = snap.elapsed ?? this.elapsed
    this.grips = snap.grips ? { ...snap.grips } : snap.grip !== undefined && snap.grip !== null ? { 0: snap.grip } : {}
    this.finished = this.step >= this.def.steps.length
    this.events.length = 0
  }
}

export type SessionSnapshot = {
  step: number
  layers: Record<string, string>
  targets: Target[]
  status: StepStatus[]
  hold: number
  peel: { progress: number; unstuck: boolean; released: boolean }
  choices: Record<number, number>
  popped: number
  extracted: number
  startSum: number
  ready: boolean
  /** Seconds the treatment has run (a helper who takes over keeps counting from here). */
  elapsed?: number
  /** Each player's grip (the spot their press is squeezing). */
  grips?: Record<number, number | null>
  /** Older snapshots: the one grip. */
  grip?: number | null
}
