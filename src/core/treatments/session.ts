import { clamp, dist, inRegion } from '../geometry.ts'
import { makeRng, type Rng } from '../rng.ts'
import { FACE, HAND, REGIONS, bandEdge, freeEdgeOf, nailOf, type RegionId } from './anatomy.ts'
import { GRID, decodeGrid, encodeGrid, paintedShare, rasterize, stamp, sumIn } from './grid.ts'
import { profileFor, type FaceProfile, type HandProfile, type Profile } from './profile.ts'
import { TREATMENTS } from './registry.ts'
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
}

export type Op =
  | { k: 'stroke'; s: number; x0: number; y0: number; x1: number; y1: number }
  | { k: 'hold'; s: number; x: number; y: number; dt: number }
  | { k: 'tap'; s: number; x: number; y: number }
  | { k: 'peel'; s: number; v: number; dt: number }
  | { k: 'choose'; s: number; i: number }
  | { k: 'tick'; s: number; dt: number }
  | { k: 'lamp'; x: number; y: number; on: boolean }
  | { k: 'advance'; s: number; skip?: boolean }

export type SessionEvent =
  | { e: 'stamp'; layer: string; x: number; y: number; r: number; amount: number; changed: number }
  | { e: 'target'; id: number; progress: number }
  | { e: 'targetStage'; id: number; x: number; y: number; size: number }
  | { e: 'targetDone'; id: number; kind: TargetKind; x: number; y: number; size: number; n?: number }
  | { e: 'miss'; x: number; y: number }
  | { e: 'ready'; step: number }
  /** A part of the step's region is finished (one nail, one area of the face): a small cue. */
  | { e: 'zone'; x: number; y: number }
  | { e: 'resolve'; layer: string; to: 0 | 1 }
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
  /** Tool tier, 1 to 3: faster and prettier. */
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
}

export const TIER_RATE = [1, 1.5, 2.1]
export const TIER_RADIUS = [1, 1.16, 1.32]
/** Pseudo-layer the renderer uses for the wet, glossy look. Not measured. */
export const WET = '$wet'
/** The peel line runs from the chin (progress 0) to the hairline (1). */
export const PEEL_FROM = 915, PEEL_TO = 262
/** The peel's front edge sags a little in the middle, like a real sheet being lifted. */
export const peelCurve = (x: number) => 26 * (1 - Math.min(1, ((x - 512) / 290) ** 2))

const regionCache = new Map<RegionId, Uint8Array>()
export function regionMask(id: RegionId) {
  let mask = regionCache.get(id)
  if (!mask) { mask = rasterize(REGIONS[id]); regionCache.set(id, mask) }
  return mask
}

type Zone = { cells: number[]; start: number; done: boolean }

const zoneCache = new Map<RegionId, number[][]>()
/**
 * A region split into zones that finish one by one: separate pieces (each nail) are their own zones; a big
 * piece (the face) is cut into blocks of about a hand's width.
 */
export function zonesOf(id: RegionId): number[][] {
  const cached = zoneCache.get(id)
  if (cached) return cached
  const mask = regionMask(id)
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
  zoneCache.set(id, zones)
  return zones
}

/** How long a whitehead or hangnail must be held, in seconds at tier 1. */
export function holdTime(target: Target) {
  if (target.kind === 'whitehead') return 0.35 + 0.6 * target.size
  if (target.kind === 'hangnail') return 0.32
  return 0
}

/** How close a press must be to a target, in art pixels. */
export function hitRadius(target: Target) {
  if (target.kind === 'blackhead') return 18 + 10 * target.size
  if (target.kind === 'whitehead') return 30 + 22 * target.size
  if (target.kind === 'drop') return 70
  if (target.kind === 'gem' || target.kind === 'tip') return 56
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
  readonly def: TreatmentDef
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
  lamp: { x: number; y: number } | null = null
  elapsed = 0
  ready = false
  finished = false
  popped = 0
  extracted = 0
  lampAssists = 0
  /** Coverage of the step's layer inside its region when the step began (erase steps). */
  private startSum = 0
  /** The step's region split into zones, each finishing on its own. */
  private zones: Zone[] = []
  private events: SessionEvent[] = []
  private nextTarget = 1
  private rng: Rng

  constructor(options: SessionOptions) {
    this.def = TREATMENTS[options.treatment]
    this.tier = clamp(Math.round(options.tier ?? 1), 1, 3)
    this.seed = options.seed
    this.disaster = !!options.disaster
    this.wish = options.wish ?? null
    this.rng = makeRng(options.seed)
    this.profile = profileFor(this.def.bodyPart, options.seed, this.disaster)
    this.status = this.def.steps.map(() => 'todo')
    for (const layer of this.def.layers) this.layers[layer.id] = this.seedLayer(layer.seed, layer.region)
    this.layers[WET] = new Float32Array(GRID * GRID)
    this.makeTargets()
    const start = clamp(options.startStep ?? 0, 0, this.def.steps.length)
    // Resume: earlier steps count as done and their layers settle as if finished.
    if (start === 0) this.beginStep()
    else {
      while (this.step < start && !this.finished) this.apply({ k: 'advance', s: this.step })
    }
    this.events.length = 0
  }

  get current(): StepDef | undefined { return this.def.steps[this.step] }
  get face(): FaceProfile | null { return this.profile.kind === 'face' ? this.profile : null }
  get hand(): HandProfile | null { return this.profile.kind === 'hand' ? this.profile : null }

  /** Take the events since the last call. */
  drain(): SessionEvent[] {
    const out = this.events
    this.events = []
    return out
  }

  private emit(event: SessionEvent) { this.events.push(event) }

  // ------------------------------------------------------------------ seeding

  private seedLayer(seed: string, regionId: RegionId): Float32Array {
    const grid = new Float32Array(GRID * GRID)
    const region = regionMask(regionId)
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
    }
  }

  // ------------------------------------------------------------------ steps

  /** Does a step apply to this customer right now? */
  private applies(step: StepDef): boolean {
    if (step.need === 'disaster') return this.disaster
    if (step.need === 'targets') {
      if (step.targets === 'patch') return this.targets.some(t => t.kind === 'whitehead' && t.done)
      return this.targets.some(t => t.kind === step.targets && !t.done)
    }
    if (step.need === 'layer' && step.layer) return sumIn(this.layers[step.layer], regionMask(step.region)) > 1.5
    return true
  }

  private beginStep() {
    // Steps with nothing to do for this customer drop out without a penalty.
    while (this.current && !this.applies(this.current)) {
      const from = this.step
      this.status[from] = 'na'
      this.step++
      this.emit({ e: 'advance', from, to: this.step, skipped: false, na: true })
    }
    const step = this.current
    if (!step) { this.finished = true; this.emit({ e: 'done' }); return }
    this.hold = 0
    this.ready = false
    if (step.targets === 'patch') this.makePatches()
    if (step.id === 'moisturize') {
      for (const [x, y, rr] of [[400, 660, 58], [624, 660, 58], [512, 392, 62]]) this.stampLayer('cream', x, y, rr, 1, 'skin')
    }
    if (step.gesture === 'erase' && step.layer) this.startSum = sumIn(this.layers[step.layer], regionMask(step.region))
    this.zones = step.layer && (step.gesture === 'erase' || step.gesture === 'paint' || step.gesture === 'rub') ? zonesOf(step.region).map(cells => ({ cells, start: step.gesture === 'erase' ? cells.reduce((a, i) => a + this.layers[step.layer!][i], 0) : 0, done: false })) : []
    this.emit({ e: 'setup', step: this.step })
    this.checkReady()
  }

  /** Patches go on the biggest spots that were popped. */
  private makePatches() {
    if (this.targets.some(t => t.kind === 'patch')) return
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
        return clamp(1 - sumIn(this.layers[step.layer], regionMask(step.region)) / this.startSum)
      }
      case 'paint':
      case 'rub':
        if (step.choice && this.choices[this.step] === undefined) return 0
        return step.layer ? paintedShare(this.layers[step.layer], regionMask(step.region)) : 0
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
    return kind ? this.targets.filter(t => t.kind === kind) : []
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
    const changed = stamp(grid, x, y, r, amount, regionMask(regionId))
    this.emit({ e: 'stamp', layer, x, y, r, amount, changed })
    return changed
  }

  /** Apply one op. Ops for a step that is no longer current are ignored (a late co-op message). */
  apply(op: Op) {
    if (this.finished) return
    if (op.k === 'lamp') { this.lamp = op.on ? { x: op.x, y: op.y } : null; return }
    if (op.s !== this.step) return
    const step = this.current
    if (!step) return
    switch (op.k) {
      case 'stroke': this.stroke(step, op.x0, op.y0, op.x1, op.y1); break
      case 'hold': this.holdAt(step, op.x, op.y, op.dt); break
      case 'tick':
        if (step.gesture === 'hold' && step.passive) { this.hold = clamp(this.hold + op.dt * step.passive * this.speed() / (step.holdSeconds ?? 3)); this.emit({ e: 'hold', progress: this.hold }) }
        break
      case 'tap': this.tap(step, op.x, op.y); break
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
      const lamp = this.lamp && dist(this.lamp.x, this.lamp.y, t.x, t.y) < 170 ? 2 : 1
      t.progress = clamp(t.progress + (rate * lamp) / (0.6 + 0.6 * t.size))
      this.emit({ e: 'target', id: t.id, progress: t.progress })
      if (t.progress >= 1) this.finishTarget(t, lamp > 1)
    }
  }

  private nearest(x: number, y: number): Target | null {
    let best: Target | null = null, bestD = Infinity
    for (const t of this.stepTargets()) {
      if (t.done) continue
      const d = dist(x, y, t.x, t.y)
      if (d <= hitRadius(t) && d < bestD) { best = t; bestD = d }
    }
    return best
  }

  private holdAt(step: StepDef, x: number, y: number, dt: number) {
    dt = clamp(dt, 0, 0.5)
    if (step.gesture === 'hold') {
      this.hold = clamp(this.hold + (dt * this.speed()) / (step.holdSeconds ?? 3))
      this.emit({ e: 'hold', progress: this.hold })
      if (step.wet) this.stampLayer(WET, x, y, 160, step.wet * dt, 'everywhere')
      return
    }
    if (step.gesture !== 'targets') return
    const t = this.nearest(x, y)
    if (!t) return
    const time = holdTime(t)
    if (time <= 0) return
    // The second squeeze of a deep pimple needs a fresh press.
    if (t.stage === 1 && !t.gripped) return
    const lamp = this.lamp && dist(this.lamp.x, this.lamp.y, t.x, t.y) < 170 ? 1.6 : 1
    t.progress = clamp(t.progress + (dt * this.speed() * lamp) / time)
    this.emit({ e: 'target', id: t.id, progress: t.progress })
    if (t.progress < 1) return
    if (t.stage === 2) {
      // First squeeze: it comes to a head. Let go and squeeze again.
      t.stage = 1
      t.progress = 0
      t.gripped = false
      t.size = Math.max(0.8, t.size * 0.85)
      this.emit({ e: 'targetStage', id: t.id, x: t.x, y: t.y, size: t.size })
      return
    }
    this.finishTarget(t, lamp > 1)
  }

  private tap(step: StepDef, x: number, y: number) {
    if (step.gesture !== 'targets') return
    const t = this.nearest(x, y)
    if (!t) { this.emit({ e: 'miss', x, y }); return }
    // A press on a pimple is a grip (the second squeeze of a deep one); taps finish tap targets.
    if (holdTime(t) > 0) { t.gripped = true; return }
    t.progress = 1
    this.finishTarget(t, false)
  }

  private finishTarget(t: Target, lamp: boolean) {
    t.done = true
    t.progress = 1
    if (lamp) this.lampAssists++
    if (t.kind === 'whitehead') { this.popped++; this.stampLayer('marks', t.x, t.y, 12 + 9 * t.size, 0.85, 'skin') }
    if (t.kind === 'blackhead') { this.extracted++; this.stampLayer('marks', t.x, t.y, 8 + 4 * t.size, 0.3, 'skin') }
    if (t.kind === 'drop') { this.stampLayer('serum', t.x, t.y, 96, 1, 'skin'); this.stampLayer(WET, t.x, t.y, 100, 0.9, 'everywhere') }
    if (t.kind === 'gem') t.n = this.targets.filter(o => o.kind === 'gem' && o.done).length
    this.emit({ e: 'targetDone', id: t.id, kind: t.kind, x: t.x, y: t.y, size: t.size, n: t.n })
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
    this.clearMaskBelow(PEEL_FROM + (PEEL_TO - PEEL_FROM) * p.progress)
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
    // The last few percent settle by themselves, so nobody hunts for pixels.
    if (step.layer && step.gesture !== 'targets') {
      const to = step.gesture === 'erase' || step.gesture === 'peel' ? 0 : 1
      this.resolveLayer(step.layer, to, step.gesture === 'erase' || step.gesture === 'peel' ? 'everywhere' : step.region)
    }
    for (const id of step.clears ?? []) this.resolveLayer(id, 0, 'everywhere')
    if (step.targets && !step.optional) for (const t of this.stepTargets()) if (!t.done) { t.done = true; t.progress = 1 }
    if (step.gesture === 'peel') { this.peel.progress = 1; this.peel.released = true }
    const from = this.step
    this.step++
    this.emit({ e: 'advance', from, to: this.step, skipped: skip, na: false })
    this.beginStep()
  }

  private resolveLayer(id: string, to: 0 | 1, regionId: RegionId) {
    const grid = this.layers[id]
    if (!grid) return
    const region = regionMask(regionId)
    for (let i = 0; i < grid.length; i++) if (to === 0) grid[i] = 0; else if (region[i]) grid[i] = 1
    this.emit({ e: 'resolve', layer: id, to })
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
    const fourHands = this.lampAssists >= 3
    const thoroughness = clamp((done / Math.max(1, required)) * 0.9 + 0.06 * optionalDone + (fourHands ? 0.04 : 0) + (wishMatched ? 0.05 : 0))
    return { treatment: this.def.id, seconds: Math.round(this.elapsed), par: this.def.parSeconds, required, done, skipped, optionalDone, popped: this.popped, extracted: this.extracted, fourHands, wishMatched, disaster: this.disaster, thoroughness }
  }

  // ------------------------------------------------------------------ co-op sync

  /** Everything a late-joining partner needs to see this treatment as it is now. */
  snapshot(): SessionSnapshot {
    const layers: Record<string, string> = {}
    for (const [id, grid] of Object.entries(this.layers)) layers[id] = encodeGrid(grid)
    return { step: this.step, layers, targets: this.targets.map(t => ({ ...t })), status: [...this.status], hold: this.hold, peel: { ...this.peel }, choices: { ...this.choices }, popped: this.popped, extracted: this.extracted, startSum: this.startSum, ready: this.ready, elapsed: this.elapsed }
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
}
