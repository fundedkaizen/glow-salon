import { clamp, dist, inRegion } from '../geometry.ts'
import { makeRng, type Rng } from '../rng.ts'
import { FACE, HAND, REGIONS, freeEdgeOf, nailOf, type RegionId } from './anatomy.ts'
import { CELL, GRID, decodeGrid, encodeGrid, paintedShare, rasterize, stamp, sumIn } from './grid.ts'
import { TREATMENTS } from './registry.ts'
import type { StepDef, TargetKind, TreatmentDef, TreatmentId } from './types.ts'

/**
 * One treatment in progress: the pure, renderer-free step pipeline. Every change arrives as an `Op` (a stroke,
 * a hold, a tap...), so the same ops can be mirrored to a co-op partner's session and give the same result.
 * The session emits events (a stamp, a pop, a step ready) that the renderer and the sounds follow.
 */

export type Target = {
  id: number
  kind: TargetKind
  x: number
  y: number
  /** 0.4 to 1.4: a big whitehead needs a longer squeeze. */
  size: number
  progress: number
  done: boolean
  /** For nail targets: which finger. For gems: the gem colour. */
  n?: number
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
  | { e: 'targetDone'; id: number; kind: TargetKind; x: number; y: number; size: number; n?: number }
  | { e: 'miss'; x: number; y: number }
  | { e: 'ready'; step: number }
  | { e: 'resolve'; layer: string; to: 0 | 1 }
  | { e: 'peel'; progress: number; tension: number; released: boolean; unstuck: boolean }
  | { e: 'hold'; progress: number }
  | { e: 'choose'; index: number }
  | { e: 'advance'; from: number; to: number; skipped: boolean }
  | { e: 'setup'; step: number }
  | { e: 'done' }

export type SessionOptions = {
  treatment: TreatmentId
  seed: number
  /** 1 for a normal customer; up to 2 for a "disaster case". */
  grime?: number
  /** Tool tier, 1 to 3: faster and prettier. */
  tier?: number
  /** The polish colour the customer asked for, if any. */
  wish?: number
  /** Resume a paused treatment at this step (earlier steps count as done). */
  startStep?: number
}

export type StepStatus = 'todo' | 'done' | 'skipped'

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
  /** 0 to 1: every step done well, plus extras. */
  thoroughness: number
}

export const TIER_RATE = [1, 1.5, 2.1]
export const TIER_RADIUS = [1, 1.16, 1.32]
/** Pseudo-layer the renderer uses for the wet, glossy look. Not measured. */
export const WET = '$wet'
/** The peel line runs from the chin (progress 0) to the hairline (1). */
export const PEEL_FROM = 915, PEEL_TO = 262

const regionCache = new Map<RegionId, Uint8Array>()
export function regionMask(id: RegionId) {
  let mask = regionCache.get(id)
  if (!mask) { mask = rasterize(REGIONS[id]); regionCache.set(id, mask) }
  return mask
}

/** How long a whitehead or hangnail must be held, in seconds at tier 1. */
export function holdTime(target: Target) {
  if (target.kind === 'whitehead') return 0.35 + 0.65 * target.size
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

export class TreatmentSession {
  readonly def: TreatmentDef
  readonly tier: number
  readonly seed: number
  readonly grime: number
  readonly wish: number | null
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
  private events: SessionEvent[] = []
  private nextTarget = 1
  private rng: Rng

  constructor(options: SessionOptions) {
    this.def = TREATMENTS[options.treatment]
    this.tier = clamp(Math.round(options.tier ?? 1), 1, 3)
    this.seed = options.seed
    this.grime = clamp(options.grime ?? 1, 0.5, 2.2)
    this.wish = options.wish ?? null
    this.rng = makeRng(options.seed)
    this.status = this.def.steps.map(() => 'todo')
    for (const layer of this.def.layers) this.layers[layer.id] = this.seedLayer(layer.seed, layer.region)
    this.layers[WET] = new Float32Array(GRID * GRID)
    this.makeTargets()
    const start = clamp(options.startStep ?? 0, 0, this.def.steps.length)
    // Resume: earlier steps count as done and their layers settle as if finished.
    if (start === 0) this.beginStep()
    else while (this.step < start) this.apply({ k: 'advance', s: this.step })
    this.events.length = 0
  }

  get current(): StepDef | undefined { return this.def.steps[this.step] }

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
    const g = this.grime
    if (seed === 'full') for (let i = 0; i < grid.length; i++) grid[i] = region[i]
    else if (seed === 'grime') {
      // Grime gathers around the nose, the chin, the forehead and the hairline.
      const spots: [number, number][] = [[512, 620], [512, 860], [512, 360], [340, 700], [684, 700], [300, 460], [724, 460]]
      blobs(Math.round(16 * g), () => { const s = r.pick(spots); return [s[0] + r.range(-120, 120), s[1] + r.range(-80, 80)] }, 38, 95, 0.45 * g, 0.9 * g)
      blobs(Math.round(10 * g), () => [r.range(260, 764), r.range(320, 900)], 20, 50, 0.4, 0.8 * g)
    } else if (seed === 'oil') {
      blobs(Math.round(8 * g), () => [512 + r.range(-190, 190), r.pick([380, 620, 850]) + r.range(-40, 40)], 40, 90, 0.5, 1)
    } else if (seed === 'redness') {
      blobs(Math.round(7 * g), () => [r.chance(0.5) ? r.range(320, 420) : r.range(604, 704), r.range(590, 720)], 50, 100, 0.35, 0.7)
      blobs(3, () => [512 + r.range(-60, 60), r.range(820, 880)], 30, 60, 0.3, 0.55)
    } else if (seed === 'polishChips') {
      for (let i = 0; i < grid.length; i++) grid[i] = region[i]
      // Chipped old polish: bites out of the free edges and a few scratches.
      for (const f of HAND.fingers) {
        const n = nailOf(f)
        for (let c = 0; c < 3; c++) {
          const t = r.range(0.62, 1.05)
          const side = r.range(-0.9, 0.9) * n.halfWidth
          const x = n.base.x + (n.tip.x - n.base.x) * t - n.dir.y * side
          const y = n.base.y + (n.tip.y - n.base.y) * t + n.dir.x * side
          stamp(grid, x, y, r.range(10, 22), -1, region)
        }
      }
    }
    return grid
  }

  private makeTargets() {
    const r = this.rng
    const add = (kind: TargetKind, x: number, y: number, size: number, n?: number) =>
      this.targets.push({ id: this.nextTarget++, kind, x, y, size, progress: 0, done: false, n })
    const inSkin = (x: number, y: number) => inRegion(REGIONS.skin, x, y)
    const spaced = (list: { x: number; y: number }[], x: number, y: number, gap: number) => list.every(p => dist(p.x, p.y, x, y) >= gap)
    if (this.def.bodyPart === 'face') {
      const whiteheads: { x: number; y: number }[] = []
      const count = Math.round((this.grime > 1.3 ? 10 : 6) + r.range(-1, 1.4))
      const zones: [number, number, number, number][] = [[300, 420, 600, 760], [604, 724, 600, 760], [430, 594, 820, 890], [400, 624, 330, 410], [470, 554, 560, 600]]
      for (let tries = 0; whiteheads.length < count && tries < 400; tries++) {
        const z = r.pick(zones)
        const x = r.range(z[0], z[1]), y = r.range(z[2], z[3])
        if (!inSkin(x, y) || !spaced(whiteheads, x, y, 70)) continue
        whiteheads.push({ x, y })
        add('whitehead', x, y, r.range(0.55, 1.3))
      }
      const blackheads: { x: number; y: number }[] = []
      const bCount = Math.round((this.grime > 1.3 ? 18 : 12) + r.range(-1, 2))
      for (let tries = 0; blackheads.length < bCount && tries < 600; tries++) {
        const x = FACE.nose.x + r.range(-66, 66), y = FACE.nose.y + r.range(-40, 48)
        if (!inRegion(REGIONS.nose, x, y) || !spaced(blackheads, x, y, 17)) continue
        blackheads.push({ x, y })
        add('blackhead', x, y, r.range(0.5, 1.1))
      }
      for (const [x, y] of [[512, 368], [372, 650], [652, 650], [512, 862], [512, 582]]) add('drop', x, y, 1)
    } else {
      HAND.fingers.forEach((f, i) => {
        const grown = r.range(24, 44)
        const e = freeEdgeOf(f, grown)
        add('tip', e.x, e.y, grown / 34, i)
      })
      const fingers = [0, 1, 2, 3, 4].sort(() => r() - 0.5).slice(0, r.int(2, 3))
      for (const i of fingers) {
        const n = nailOf(HAND.fingers[i])
        const side = r.chance(0.5) ? 1 : -1
        add('hangnail', n.base.x - n.dir.y * side * (n.halfWidth + 6) + n.dir.x * 12, n.base.y + n.dir.x * side * (n.halfWidth + 6) + n.dir.y * 12, 1, i)
      }
      HAND.fingers.forEach((f, i) => {
        const n = nailOf(f)
        add('gem', n.base.x + (n.tip.x - n.base.x) * 0.42, n.base.y + (n.tip.y - n.base.y) * 0.42, 1, i)
      })
    }
  }

  // ------------------------------------------------------------------ steps

  private beginStep() {
    const step = this.current
    if (!step) return
    this.hold = 0
    this.ready = false
    if (step.targets === 'patch') this.makePatches()
    if (step.id === 'moisturize') {
      for (const [x, y, rr] of [[400, 660, 58], [624, 660, 58], [512, 392, 62]]) this.stampLayer('cream', x, y, rr, 1, 'skin')
    }
    if (step.gesture === 'erase' && step.layer) this.startSum = sumIn(this.layers[step.layer], regionMask(step.region))
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
        return list.length === 0 ? 1 : list.filter(t => t.done).length / list.length
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
    if (this.ready || !this.current) return
    // Optional steps wait for the player to press Finish even when something was placed.
    if (this.current.optional) return
    if (this.progress() >= this.threshold() - 1e-9) {
      this.ready = true
      this.emit({ e: 'ready', step: this.step })
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
      if (d > radius + hitRadius(t) * 0.5) continue
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
    dt = clamp(dt, 0, 0.25)
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
    const lamp = this.lamp && dist(this.lamp.x, this.lamp.y, t.x, t.y) < 170 ? 1.6 : 1
    t.progress = clamp(t.progress + (dt * this.speed() * lamp) / time)
    this.emit({ e: 'target', id: t.id, progress: t.progress })
    if (t.progress >= 1) this.finishTarget(t, lamp > 1)
  }

  private tap(step: StepDef, x: number, y: number) {
    if (step.gesture !== 'targets') return
    const t = this.nearest(x, y)
    if (!t) { this.emit({ e: 'miss', x, y }); return }
    if (holdTime(t) > 0) return
    t.progress = 1
    this.finishTarget(t, false)
  }

  private finishTarget(t: Target, lamp: boolean) {
    t.done = true
    if (lamp) this.lampAssists++
    if (t.kind === 'whitehead') { this.popped++; this.stampLayer('marks', t.x, t.y, 22 + 16 * t.size, 0.9, 'skin') }
    if (t.kind === 'blackhead') { this.extracted++; this.stampLayer('marks', t.x, t.y, 12 + 6 * t.size, 0.35, 'skin') }
    if (t.kind === 'drop') { this.stampLayer('serum', t.x, t.y, 96, 1, 'skin'); this.stampLayer(WET, t.x, t.y, 100, 0.9, 'everywhere') }
    if (t.kind === 'gem') t.n = this.targets.filter(o => o.kind === 'gem' && o.done).length
    this.emit({ e: 'targetDone', id: t.id, kind: t.kind, x: t.x, y: t.y, size: t.size, n: t.n })
  }

  private peelTo(step: StepDef, v: number, dt: number) {
    if (step.gesture !== 'peel' || this.peel.released) return
    dt = clamp(dt, 0, 0.25)
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
    const row = Math.max(0, Math.min(GRID, Math.floor(lineY / CELL)))
    for (let gy = row; gy < GRID; gy++) mask.fill(0, gy * GRID, gy * GRID + GRID)
  }

  /** Finish the current step (or skip it) and move to the next. */
  private advance(skip: boolean) {
    const step = this.current
    if (!step) return
    this.status[this.step] = skip && !step.optional ? 'skipped' : skip ? 'todo' : 'done'
    if (step.optional && !skip) this.status[this.step] = this.stepTargets().some(t => t.done) || !step.targets ? 'done' : 'todo'
    // The last few percent settle by themselves, so nobody hunts for pixels.
    if (step.layer && step.gesture !== 'targets') {
      const to = step.gesture === 'erase' || step.gesture === 'peel' ? 0 : 1
      this.resolveLayer(step.layer, to, step.gesture === 'erase' || step.gesture === 'peel' ? 'everywhere' : step.region)
    }
    for (const id of CLEARS[step.id] ?? []) this.resolveLayer(id, 0, 'everywhere')
    if (step.targets && !step.optional) for (const t of this.stepTargets()) if (!t.done) { t.done = true; t.progress = 1 }
    if (step.gesture === 'peel') { this.peel.progress = 1; this.peel.released = true }
    const from = this.step
    this.step++
    this.emit({ e: 'advance', from, to: this.step, skipped: skip })
    if (this.step >= this.def.steps.length) { this.finished = true; this.emit({ e: 'done' }) } else this.beginStep()
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

  result(): TreatmentResult {
    const steps = this.def.steps
    const required = steps.filter(s => !s.optional).length
    const done = steps.filter((s, i) => !s.optional && this.status[i] === 'done').length
    const skipped = steps.filter((s, i) => !s.optional && this.status[i] === 'skipped').length
    const optionalDone = steps.filter((s, i) => s.optional && this.status[i] === 'done').length
    const colorStep = steps.findIndex(s => s.choice === 'polish')
    const wishMatched = this.wish === null || colorStep < 0 || this.choices[colorStep] === undefined ? null : this.choices[colorStep] === this.wish
    const fourHands = this.lampAssists >= 3
    const thoroughness = clamp((done / required) * 0.9 + 0.06 * optionalDone + (fourHands ? 0.04 : 0) + (wishMatched ? 0.05 : 0))
    return { treatment: this.def.id, seconds: Math.round(this.elapsed), par: this.def.parSeconds, required, done, skipped, optionalDone, popped: this.popped, extracted: this.extracted, fourHands, wishMatched, thoroughness }
  }

  // ------------------------------------------------------------------ co-op sync

  /** Everything a late-joining partner needs to see this treatment as it is now. */
  snapshot(): SessionSnapshot {
    const layers: Record<string, string> = {}
    for (const [id, grid] of Object.entries(this.layers)) layers[id] = encodeGrid(grid)
    return { step: this.step, layers, targets: this.targets.map(t => ({ ...t })), status: [...this.status], hold: this.hold, peel: { ...this.peel }, choices: { ...this.choices }, popped: this.popped, extracted: this.extracted, startSum: this.startSum, ready: this.ready }
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
}

/** Layers a step clears away when it finishes, besides its own. */
const CLEARS: Record<string, string[]> = {
  rinse: ['grime', 'oil'],
  moisturize: ['cream', 'serum'],
  wipe: ['scrub'],
}
