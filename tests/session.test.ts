import { check, near } from './harness.ts'
import { TreatmentSession, regionMask, type Op, type SessionEvent } from '../src/core/treatments/session.ts'
import { TREATMENTS } from '../src/core/treatments/registry.ts'
import { GRID, CELL, stamp, encodeGrid, decodeGrid } from '../src/core/treatments/grid.ts'
import { REGIONS, HAND, nailOf } from '../src/core/treatments/anatomy.ts'
import { inRegion } from '../src/core/geometry.ts'

/** Every cell centre of a region, for sweeping a brush over all of it. */
function cellsOf(regionId: keyof typeof REGIONS) {
  const mask = regionMask(regionId)
  const pts: [number, number][] = []
  for (let i = 0; i < mask.length; i++) if (mask[i]) pts.push([(i % GRID + 0.5) * CELL, (Math.floor(i / GRID) + 0.5) * CELL])
  return pts
}

/** Play the current step the way a player would, with ops only. Returns the ops used. */
function playStep(s: TreatmentSession, ops: Op[] = []): Op[] {
  const step = s.current!
  const i = s.step
  const push = (op: Op) => { ops.push(op); s.apply(op) }
  let guard = 0
  if (step.choice) push({ k: 'choose', s: i, i: 2 })
  while (!s.ready && guard++ < 4000) {
    if (step.gesture === 'hold') push({ k: 'hold', s: i, x: 512, y: 540, dt: 0.1 })
    else if (step.gesture === 'peel') push({ k: 'peel', s: i, v: Math.min(1, s.peel.progress + 0.15), dt: 0.1 })
    else if (step.gesture === 'targets' || step.gesture === 'sweep') {
      const t = s.stepTargets().find(x => !x.done)
      if (!t) break
      if (step.gesture === 'sweep') push({ k: 'stroke', s: i, x0: t.x - 20, y0: t.y, x1: t.x + 20, y1: t.y })
      else if (t.kind === 'whitehead' || t.kind === 'hangnail') push({ k: 'hold', s: i, x: t.x, y: t.y, dt: 0.1 })
      else push({ k: 'tap', s: i, x: t.x, y: t.y })
      if (step.optional) break
    } else {
      // Brush over the region in rows.
      const pts = cellsOf(step.region)
      for (let k = 0; k < pts.length && !s.ready; k += 3) push({ k: 'stroke', s: i, x0: pts[k][0] - 6, y0: pts[k][1], x1: pts[k][0] + 6, y1: pts[k][1] })
    }
  }
  return ops
}

export function run() {
  // Grid basics.
  const g = new Float32Array(GRID * GRID)
  const changed = stamp(g, 512, 512, 40, 1)
  check('stamp paints', changed > 0 && g[64 * GRID + 64] > 0.9)
  const back = decodeGrid(encodeGrid(g))
  near('grid round trip', back[64 * GRID + 64], g[64 * GRID + 64], 1 / 255)

  // Regions are sane: the nose is inside the face, the eyes are not skin.
  check('nose in face', inRegion(REGIONS.face, 512, 630))
  check('eye excluded from skin', !inRegion(REGIONS.skin, 398, 516))
  check('cheek is skin', inRegion(REGIONS.skin, 360, 660))
  const nail = nailOf(HAND.fingers[2])
  check('nail centre in nails region', inRegion(REGIONS.nails, (nail.base.x + nail.tip.x) / 2, (nail.base.y + nail.tip.y) / 2))

  for (const id of ['facial', 'nails'] as const) {
    const def = TREATMENTS[id]
    const s = new TreatmentSession({ treatment: id, seed: 1234, wish: 2 })
    check(`${id}: starts at step 0`, s.step === 0 && !s.finished)
    const allOps: Op[] = []
    const seen = new Set<string>()
    for (let i = 0; i < def.steps.length; i++) {
      check(`${id}: step ${i} is current`, s.step === i, s.step)
      playStep(s, allOps)
      const optional = def.steps[i].optional
      if (!optional) check(`${id}: step ${def.steps[i].id} reaches ready`, s.ready, s.progress())
      const events = s.drain()
      for (const e of events) seen.add(e.e)
      const op: Op = { k: 'advance', s: i }
      allOps.push(op)
      s.apply(op)
    }
    check(`${id}: finished`, s.finished)
    const done = s.drain()
    check(`${id}: done event`, done.some(e => e.e === 'done'))
    check(`${id}: stamps happened`, seen.has('stamp'))
    check(`${id}: targets happened`, seen.has('targetDone'))
    s.time(120)
    const r = s.result()
    check(`${id}: all required steps done`, r.done === r.required && r.skipped === 0, r)
    check(`${id}: thorough`, r.thoroughness >= 0.9, r.thoroughness)

    // The same ops replayed on a second session (a co-op partner) end in the same state.
    const mirror = new TreatmentSession({ treatment: id, seed: 1234, wish: 2 })
    for (const op of allOps) mirror.apply(op)
    check(`${id}: mirror finishes`, mirror.finished)
    check(`${id}: mirror same pops`, mirror.popped === s.popped && mirror.extracted === s.extracted)
  }

  // Facial specifics.
  const f = new TreatmentSession({ treatment: 'facial', seed: 7 })
  const whiteheads = f.targets.filter(t => t.kind === 'whitehead')
  const blackheads = f.targets.filter(t => t.kind === 'blackhead')
  check('facial: several whiteheads, varied sizes', whiteheads.length >= 4 && Math.max(...whiteheads.map(t => t.size)) - Math.min(...whiteheads.map(t => t.size)) > 0.2, whiteheads.length)
  check('facial: blackheads on the nose', blackheads.length >= 8 && blackheads.every(t => inRegion(REGIONS.nose, t.x, t.y)))
  check('facial: whiteheads on skin', whiteheads.every(t => inRegion(REGIONS.skin, t.x, t.y)))
  // Hold on a whitehead: it swells, then pops.
  f.apply({ k: 'advance', s: 0 }); f.apply({ k: 'advance', s: 1 }); f.apply({ k: 'advance', s: 2 })
  check('facial: at pop step', f.current?.id === 'pop')
  f.drain()
  const w = f.stepTargets()[0]
  f.apply({ k: 'hold', s: 3, x: w.x, y: w.y, dt: 0.1 })
  check('facial: pressing swells', w.progress > 0 && !w.done)
  for (let k = 0; k < 40 && !w.done; k++) f.apply({ k: 'hold', s: 3, x: w.x, y: w.y, dt: 0.1 })
  const ev = f.drain()
  check('facial: pops with an event', w.done && ev.some((e: SessionEvent) => e.e === 'targetDone' && e.kind === 'whitehead'))
  check('facial: a popped spot leaves a mark', f.layers.marks.some(v => v > 0))
  // Ops for an old step are ignored.
  const before = f.popped
  f.apply({ k: 'hold', s: 1, x: w.x, y: w.y, dt: 0.2 })
  check('stale ops ignored', f.popped === before)
  // Skipping lowers thoroughness.
  const skip = new TreatmentSession({ treatment: 'facial', seed: 9 })
  while (!skip.finished) skip.apply({ k: 'advance', s: skip.step, skip: true })
  check('skipping everything is not thorough', skip.result().thoroughness < 0.1 && skip.result().skipped > 5)

  // Auto-complete: an erase step is ready at 95% and the rest settles on advance.
  const r2 = new TreatmentSession({ treatment: 'facial', seed: 3 })
  r2.apply({ k: 'advance', s: 0 })
  playStep(r2) // foam
  r2.apply({ k: 'advance', s: 1 })
  check('foam fills on advance', r2.layers.foam.some(v => v === 1))
  playStep(r2) // rinse
  check('rinse ready below 100%', r2.ready && r2.progress() >= 0.95)
  r2.apply({ k: 'advance', s: 2 })
  check('rinse clears foam and grime', r2.layers.foam.every(v => v === 0) && r2.layers.grime.every(v => v === 0))

  // Peel: it sticks first, then follows slowly, then releases.
  const p = new TreatmentSession({ treatment: 'facial', seed: 5, startStep: 8 })
  check('resume at a later step', p.current?.id === 'peel' && p.status.slice(0, 8).every(x => x === 'done'))
  p.apply({ k: 'peel', s: 8, v: 0.05, dt: 0.1 })
  check('peel sticks at first', p.peel.progress === 0)
  p.apply({ k: 'peel', s: 8, v: 0.3, dt: 0.1 })
  check('peel unsticks past the slack', p.peel.unstuck && p.peel.progress > 0)
  p.apply({ k: 'peel', s: 8, v: 1, dt: 0.1 })
  check('peel cannot be yanked', p.peel.progress < 0.3, p.peel.progress)
  for (let k = 0; k < 40 && !p.peel.released; k++) p.apply({ k: 'peel', s: 8, v: 1, dt: 0.1 })
  check('peel releases', p.peel.released && p.ready)

  // Tool tiers make coverage faster.
  const slow = new TreatmentSession({ treatment: 'facial', seed: 11, startStep: 1, tier: 1 })
  const fast = new TreatmentSession({ treatment: 'facial', seed: 11, startStep: 1, tier: 3 })
  for (const s of [slow, fast]) for (let k = 0; k < 20; k++) s.apply({ k: 'stroke', s: 1, x0: 300, y0: 400 + k * 20, x1: 720, y1: 400 + k * 20 })
  check('higher tier covers faster', fast.progress() > slow.progress(), [slow.progress(), fast.progress()])

  // Snapshot for a late joiner.
  const snap = f.snapshot()
  const joiner = new TreatmentSession({ treatment: 'facial', seed: 7 })
  joiner.restore(JSON.parse(JSON.stringify(snap)))
  check('snapshot restores step', joiner.step === f.step && joiner.popped === f.popped)
  near('snapshot restores marks', joiner.layers.marks.reduce((a, b) => a + b, 0), f.layers.marks.reduce((a, b) => a + b, 0), 2)

  // Nails: the colour wish.
  const n = new TreatmentSession({ treatment: 'nails', seed: 21, wish: 4 })
  while (!n.finished) {
    const step = n.current!
    if (step.choice) n.apply({ k: 'choose', s: n.step, i: 4 })
    n.apply({ k: 'advance', s: n.step })
  }
  check('nails: wish matched', n.result().wishMatched === true)
  check('nails: five tips to clip', n.targets.filter(t => t.kind === 'tip').length === 5)
  // Lamp (four hands) doubles the loop's speed.
  const solo = new TreatmentSession({ treatment: 'facial', seed: 13, startStep: 4 })
  const duo = new TreatmentSession({ treatment: 'facial', seed: 13, startStep: 4 })
  const bh = solo.stepTargets()[0]
  duo.apply({ k: 'lamp', x: bh.x, y: bh.y, on: true })
  solo.apply({ k: 'stroke', s: 4, x0: bh.x - 5, y0: bh.y, x1: bh.x + 5, y1: bh.y })
  duo.apply({ k: 'stroke', s: 4, x0: bh.x - 5, y0: bh.y, x1: bh.x + 5, y1: bh.y })
  check('lamp speeds extraction', duo.stepTargets()[0].progress > solo.stepTargets()[0].progress)
}
