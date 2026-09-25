import { check } from './harness.ts'
import { ASSIST_RANGE, TreatmentSession, hitRadius, type Op } from '../src/core/treatments/session.ts'
import { planTreatment } from '../src/core/treatments/plan.ts'
import { faceProfile } from '../src/core/treatments/profile.ts'
import { GRID, CELL, encodeGrid } from '../src/core/treatments/grid.ts'
import type { TreatmentId } from '../src/core/treatments/types.ts'

/**
 * Four hands: two players at one station, each screen with its own mirror of the session. Each player's ops
 * apply at once on their own screen and reach the other a little later, so the two mirrors see them in a
 * different order; they must still end up the same.
 */

function seedWhere(ok: (seed: number) => boolean) { for (let seed = 1; seed < 5000; seed++) if (ok(seed)) return seed; throw new Error('no seed') }
const at = (t: TreatmentId, seed: number, id: string) => planTreatment(t, seed, false).def.steps.findIndex(s => s.id === id)
/** An op as it arrives over the wire (JSON), so nothing is shared between the mirrors. */
const wire = (op: Op): Op => JSON.parse(JSON.stringify(op))

/** Two players, each making ops against their own mirror; the partner's arrive `lag` ticks later. */
function duo(treatment: TreatmentId, seed: number, step: number, next: (s: TreatmentSession, p: number, tick: number) => Op | null, ticks = 600, lag = 3) {
  const mirrors = [0, 1].map(() => new TreatmentSession({ treatment, seed, startStep: step }))
  const inbox: { op: Op; at: number }[][] = [[], []]
  let sent = 0
  for (let tick = 0; tick < ticks; tick++) {
    for (const p of [0, 1]) {
      const own = mirrors[p]
      const op = next(own, p, tick)
      if (op) {
        // Like the view: the sender stamps who made it, applies it (the session settles its target and boost), sends it.
        ;(op as { p?: number }).p = p
        own.apply(op)
        inbox[1 - p].push({ op: wire(op), at: tick + lag + p })
        sent++
      }
      while (inbox[p].length && inbox[p][0].at <= tick) mirrors[p].apply(inbox[p].shift()!.op)
    }
  }
  for (const p of [0, 1]) for (const w of inbox[p].splice(0)) mirrors[p].apply(w.op)
  return { a: mirrors[0], b: mirrors[1], sent }
}

/** Everything that matters about a session, rounded past float noise from adding in another order. */
function state(s: TreatmentSession) {
  const r = (v: number) => Math.round(v * 1e6) / 1e6
  const layers: Record<string, string> = {}
  for (const [id, g] of Object.entries(s.layers)) layers[id] = encodeGrid(g.map(v => r(v)))
  return JSON.stringify({ step: s.step, ready: s.ready, hold: r(s.hold), popped: s.popped, extracted: s.extracted, doneBy: s.doneBy, assists: s.lampAssists, grips: Object.entries(s.grips).filter(([, id]) => id !== null), targets: s.targets.map(t => [t.id, t.done, r(t.progress), t.stage ?? 0, !!t.gripped]), layers })
}

/** A player popping spots on their own half of the face (left for 0, right for 1), then any left over. */
function popper(kind: 'whitehead' | 'blackhead', mid: number) {
  return (s: TreatmentSession, p: number): Op | null => {
    if (s.ready) return null
    const g = s.gripOf(p)
    if (g) return { k: 'hold', s: s.step, x: g.x, y: g.y, dt: 0.05 }
    const open = s.stepTargets().filter(t => t.kind === kind && !t.done)
    const mine = open.filter(t => (p === 0) === (t.x < mid))
    const t = (mine.length ? mine : open)[0]
    return t ? { k: 'tap', s: s.step, x: t.x, y: t.y } : null
  }
}

export function run() {
  // ---------------------------------------------------------------- two players pop at once
  const popSeed = seedWhere(seed => { const f = faceProfile(seed, false); return f.whiteheads >= 5 && f.deep >= 1 && at('facial', seed, 'pop') >= 0 })
  const pop = at('facial', popSeed, 'pop')
  const both = duo('facial', popSeed, pop, popper('whitehead', 512))
  check('four hands: both mirrors pop every whitehead', both.a.ready && both.b.ready, [both.a.progress(), both.b.progress()])
  check('four hands: interleaved ops leave identical sessions', state(both.a) === state(both.b))
  check('four hands: both players popped some', (both.a.doneBy[0] ?? 0) >= 1 && (both.a.doneBy[1] ?? 0) >= 1, both.a.doneBy)
  check('four hands: every pop credited once', (both.a.doneBy[0] ?? 0) + (both.a.doneBy[1] ?? 0) === both.a.popped, both.a.doneBy)
  check('four hands: the result says four hands', both.a.result().fourHands && both.b.result().fourHands)
  // Racing for the same spots (both start from the same end): still the same on both screens.
  const race = duo('facial', popSeed, pop, (s, p) => {
    if (s.ready) return null
    const g = s.gripOf(p)
    if (g) return { k: 'hold', s: s.step, x: g.x, y: g.y, dt: 0.07 }
    const t = s.stepTargets().find(x => !x.done)
    return t ? { k: 'tap', s: s.step, x: t.x, y: t.y } : null
  }, 600, 5)
  check('four hands: racing for the same spots stays identical', race.a.ready && state(race.a) === state(race.b))
  // Blackheads sit close together on the nose: the busiest case for grips and the boost.
  const bhSeed = seedWhere(seed => faceProfile(seed, false).blackheads >= 8 && at('facial', seed, 'extract') >= 0)
  const bh = duo('facial', bhSeed, at('facial', bhSeed, 'extract'), popper('blackhead', 512))
  check('four hands: blackheads on both mirrors identical', bh.a.ready && state(bh.a) === state(bh.b))
  check('four hands: squeezing side by side on the nose counts as four hands', bh.a.lampAssists > 0, bh.a.lampAssists)

  // ---------------------------------------------------------------- per-player grips
  const g = new TreatmentSession({ treatment: 'facial', seed: bhSeed, startStep: at('facial', bhSeed, 'extract') })
  const spots = g.stepTargets()
  // Two blackheads so close that a press on one could land on either.
  let pair: [typeof spots[number], typeof spots[number]] | null = null
  for (const x of spots) for (const y of spots) if (!pair && x !== y && Math.hypot(x.x - y.x, x.y - y.y) < Math.min(hitRadius(x), hitRadius(y)) * 0.8) pair = [x, y]
  check('grips: found two blackheads within one reach', !!pair)
  if (pair) {
    const [x, y] = pair
    g.apply({ k: 'tap', s: g.step, x: x.x, y: x.y, p: 0 })
    const taken: Op = { k: 'tap', s: g.step, x: x.x, y: x.y, p: 1 }
    g.apply(taken)
    check('grips: a press on a spot the partner holds takes the free one next to it', g.grips[0] === x.id && g.grips[1] === y.id, g.grips)
    check('grips: the tap carries the spot it took', (taken as { t?: number }).t === y.id)
    g.apply({ k: 'hold', s: g.step, x: x.x, y: x.y, dt: 0.05, p: 0 })
    g.apply({ k: 'hold', s: g.step, x: y.x, y: y.y, dt: 0.05, p: 1 })
    check('grips: both squeeze their own spot at once', x.progress > 0 && y.progress > 0)
    g.apply({ k: 'lift', s: g.step, p: 1 })
    check('grips: lifting lets go of only your own spot', g.grips[1] === null && g.grips[0] === x.id)
  }
  // A lone whitehead: a second press on it shares it instead of stealing it.
  const w = new TreatmentSession({ treatment: 'facial', seed: popSeed, startStep: pop })
  const lone = w.stepTargets().find(t => !t.stage && w.stepTargets().every(o => o === t || Math.hypot(o.x - t.x, o.y - t.y) > hitRadius(o) + hitRadius(t)))!
  w.apply({ k: 'tap', s: pop, x: lone.x, y: lone.y, p: 0 })
  w.apply({ k: 'tap', s: pop, x: lone.x, y: lone.y, p: 1 })
  w.apply({ k: 'hold', s: pop, x: lone.x, y: lone.y, dt: 0.05, p: 0 })
  check('grips: the partner pressing the same spot does not steal it', w.grips[0] === lone.id && lone.progress > 0)
  // A mirror that hears of a tap after the spot was finished there still agrees: the press grips nothing.
  const late = new TreatmentSession({ treatment: 'facial', seed: popSeed, startStep: pop })
  const t0 = late.stepTargets().find(t => !t.stage)!
  late.apply({ k: 'tap', s: pop, x: t0.x, y: t0.y, p: 0 })
  for (let k = 0; k < 40 && !t0.done; k++) late.apply({ k: 'hold', s: pop, x: t0.x, y: t0.y, dt: 0.1, p: 0 })
  late.apply({ k: 'tap', s: pop, x: t0.x, y: t0.y, p: 1, t: t0.id })
  check('grips: a late tap on a finished spot grips nothing', late.grips[1] === null && late.popped === 1)

  // ---------------------------------------------------------------- the lamp bonus (a partner close by)
  const lb = (partner: { x: number; y: number } | null) => {
    const s = new TreatmentSession({ treatment: 'facial', seed: bhSeed, startStep: at('facial', bhSeed, 'extract') })
    const [first, ...rest] = s.stepTargets()
    if (partner) {
      const other = rest.reduce((a, b) => (Math.hypot(b.x - partner.x, b.y - partner.y) < Math.hypot(a.x - partner.x, a.y - partner.y) ? b : a))
      s.apply({ k: 'tap', s: s.step, x: other.x, y: other.y, p: 1 })
    }
    s.apply({ k: 'tap', s: s.step, x: first.x, y: first.y, p: 0 })
    const hold: Op = { k: 'hold', s: s.step, x: first.x, y: first.y, dt: 0.05, p: 0 }
    s.apply(hold)
    return { progress: first.progress, a: (hold as { a?: number }).a, first }
  }
  const alone = lb(null)
  const helped = lb(alone.first)
  check('lamp bonus: a partner squeezing close by speeds the squeeze', helped.progress > alone.progress * 1.4 && helped.a === 1, [alone.progress, helped.progress])
  // The boost travels with the op: a mirror that has not yet heard of the partner's press squeezes just as fast.
  const mirror = new TreatmentSession({ treatment: 'facial', seed: bhSeed, startStep: at('facial', bhSeed, 'extract') })
  const mf = mirror.stepTargets()[0]
  mirror.apply({ k: 'tap', s: mirror.step, x: mf.x, y: mf.y, p: 0 })
  mirror.apply({ k: 'hold', s: mirror.step, x: mf.x, y: mf.y, dt: 0.05, p: 0, a: 1 })
  check('lamp bonus: the boost is carried in the op (mirrors agree)', Math.abs(mf.progress - helped.progress) < 1e-9)
  // Far apart: no boost; and after the partner lifts: no boost.
  const whFar = new TreatmentSession({ treatment: 'facial', seed: popSeed, startStep: pop })
  const ws = whFar.stepTargets().filter(t => !t.stage)
  let far: [typeof ws[number], typeof ws[number]] | null = null
  for (const x of ws) for (const y of ws) if (!far && Math.hypot(x.x - y.x, x.y - y.y) > ASSIST_RANGE + 20) far = [x, y]
  if (far) {
    whFar.apply({ k: 'tap', s: pop, x: far[1].x, y: far[1].y, p: 1 })
    whFar.apply({ k: 'tap', s: pop, x: far[0].x, y: far[0].y, p: 0 })
    const h: Op = { k: 'hold', s: pop, x: far[0].x, y: far[0].y, dt: 0.05, p: 0 }
    whFar.apply(h)
    check('lamp bonus: none when the partner works far away', (h as { a?: number }).a === 0)
  }
  const lifted = new TreatmentSession({ treatment: 'facial', seed: bhSeed, startStep: at('facial', bhSeed, 'extract') })
  const [l0, l1] = lifted.stepTargets()
  lifted.apply({ k: 'tap', s: lifted.step, x: l1.x, y: l1.y, p: 1 })
  lifted.apply({ k: 'lift', s: lifted.step, p: 1 })
  lifted.apply({ k: 'tap', s: lifted.step, x: l0.x, y: l0.y, p: 0 })
  const lh: Op = { k: 'hold', s: lifted.step, x: l0.x, y: l0.y, dt: 0.05, p: 0 }
  lifted.apply(lh)
  check('lamp bonus: none once the partner lets go', (lh as { a?: number }).a === 0)

  // ---------------------------------------------------------------- strokes: the helper's count too
  const nailSeed = seedWhere(seed => at('nails', seed, 'base') >= 0)
  const base = at('nails', nailSeed, 'base')
  const nail = new TreatmentSession({ treatment: 'nails', seed: nailSeed, startStep: base })
  const cells: [number, number][] = []
  const mask = nail.mask(nail.current!.region)
  for (let i = 0; i < mask.length; i++) if (mask[i]) cells.push([((i % GRID) + 0.5) * CELL, (Math.floor(i / GRID) + 0.5) * CELL])
  for (let k = 0; k < cells.length && !nail.ready; k += 3) nail.apply({ k: 'stroke', s: base, x0: cells[k][0] - 6, y0: cells[k][1], x1: cells[k][0] + 6, y1: cells[k][1], p: 1 })
  check('strokes: the helper alone can paint the base coat', nail.ready, nail.progress())
  // Both painting, each from their own end of the nails: identical mirrors.
  const paint = duo('nails', nailSeed, base, (s, p, tick) => {
    if (s.ready) return null
    const k = (p === 0 ? tick * 3 : cells.length - 1 - tick * 3)
    const c = cells[Math.max(0, Math.min(cells.length - 1, k))]
    return { k: 'stroke', s: s.step, x0: c[0] - 6, y0: c[1], x1: c[0] + 6, y1: c[1] }
  }, 400)
  check('strokes: two painters, identical mirrors', paint.a.ready && state(paint.a) === state(paint.b))
  // A rub step on the face (the cleanser): both players' strokes count.
  const rubSeed = seedWhere(seed => at('facial', seed, 'cleanse') >= 0)
  const cleanse = at('facial', rubSeed, 'cleanse')
  const helperRub = new TreatmentSession({ treatment: 'facial', seed: rubSeed, startStep: cleanse })
  helperRub.apply({ k: 'stroke', s: cleanse, x0: 400, y0: 640, x1: 470, y1: 700, p: 1 })
  check('strokes: the helper rubs the cleanser in', helperRub.progress() > 0)
  // One merged op through several points paints exactly what the per-frame segments did.
  const path = [[400, 600], [430, 620], [470, 640], [520, 650], [560, 700]]
  const seg = new TreatmentSession({ treatment: 'facial', seed: rubSeed, startStep: cleanse })
  const merged = new TreatmentSession({ treatment: 'facial', seed: rubSeed, startStep: cleanse })
  for (let i = 1; i < path.length; i++) seg.apply({ k: 'stroke', s: cleanse, x0: path[i - 1][0], y0: path[i - 1][1], x1: path[i][0], y1: path[i][1] })
  merged.apply({ k: 'stroke', s: cleanse, x0: path[0][0], y0: path[0][1], x1: path[1][0], y1: path[1][1], pts: path.slice(2).flat() })
  check('strokes: a merged stroke paints the same as its segments', encodeGrid(seg.layers.foam) === encodeGrid(merged.layers.foam))

  // ---------------------------------------------------------------- hold steps: two hands go faster
  const steamSeed = seedWhere(seed => at('facial', seed, 'steam') >= 0)
  const steam = at('facial', steamSeed, 'steam')
  const one = new TreatmentSession({ treatment: 'facial', seed: steamSeed, startStep: steam })
  const two = new TreatmentSession({ treatment: 'facial', seed: steamSeed, startStep: steam })
  for (let k = 0; k < 5; k++) {
    one.apply({ k: 'hold', s: steam, x: 512, y: 540, dt: 0.1, p: 0 })
    two.apply({ k: 'hold', s: steam, x: 512, y: 540, dt: 0.1, p: 0 })
    two.apply({ k: 'hold', s: steam, x: 520, y: 560, dt: 0.1, p: 1 })
  }
  check('hold: both holding is faster', two.hold > one.hold * 1.9, [one.hold, two.hold])

  // ---------------------------------------------------------------- a late joiner gets everyone's grips
  const snapFrom = new TreatmentSession({ treatment: 'facial', seed: popSeed, startStep: pop })
  const s0 = snapFrom.stepTargets()[0]
  snapFrom.apply({ k: 'tap', s: pop, x: s0.x, y: s0.y, p: 1 })
  const joiner = new TreatmentSession({ treatment: 'facial', seed: popSeed, startStep: pop })
  joiner.restore(JSON.parse(JSON.stringify(snapFrom.snapshot())))
  check('snapshot: grips per player survive a sync', joiner.grips[1] === s0.id && joiner.grip === null)
}
