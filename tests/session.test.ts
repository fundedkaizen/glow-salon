import { check, near } from './harness.ts'
import { TreatmentSession, regionMask, zonesOf, type Op, type SessionEvent } from '../src/core/treatments/session.ts'
import { TREATMENTS } from '../src/core/treatments/registry.ts'
import { faceProfile, handProfile } from '../src/core/treatments/profile.ts'
import { GRID, CELL, stamp, encodeGrid, decodeGrid } from '../src/core/treatments/grid.ts'
import { REGIONS, HAND, bandEdge, nailOf } from '../src/core/treatments/anatomy.ts'
import { inRegion } from '../src/core/geometry.ts'

/** Every cell centre of a region, for sweeping a brush over all of it. */
function cellsOf(regionId: keyof typeof REGIONS) {
  const mask = regionMask(regionId)
  const pts: [number, number][] = []
  for (let i = 0; i < mask.length; i++) if (mask[i]) pts.push([(i % GRID + 0.5) * CELL, (Math.floor(i / GRID) + 0.5) * CELL])
  return pts
}

const stepIndex = (treatment: 'facial' | 'nails', id: string) => TREATMENTS[treatment].steps.findIndex(s => s.id === id)

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
      else if (t.kind === 'whitehead' || t.kind === 'hangnail') {
        // A fresh press (tap) then a hold: deep pimples need this twice.
        push({ k: 'tap', s: i, x: t.x, y: t.y })
        for (let k = 0; k < 30 && !t.done && (t.stage !== 1 || t.gripped || t.progress === 0); k++) {
          push({ k: 'hold', s: i, x: t.x, y: t.y, dt: 0.1 })
          if (t.stage === 1 && !t.gripped) break
        }
      } else push({ k: 'tap', s: i, x: t.x, y: t.y })
      if (step.optional) break
    } else {
      const pts = cellsOf(step.region)
      for (let k = 0; k < pts.length && !s.ready; k += 3) push({ k: 'stroke', s: i, x0: pts[k][0] - 6, y0: pts[k][1], x1: pts[k][0] + 6, y1: pts[k][1] })
    }
  }
  return ops
}

/** Play a whole treatment; returns every op and every event kind seen. */
function playAll(s: TreatmentSession) {
  const ops: Op[] = []
  const seen = new Set<string>()
  let guard = 0
  while (!s.finished && guard++ < 40) {
    playStep(s, ops)
    const optional = s.current?.optional
    if (!optional) check(`${s.def.id}: step ${s.current?.id} reaches ready`, s.ready, s.progress())
    for (const e of s.drain()) seen.add(e.e)
    const op: Op = { k: 'advance', s: s.step }
    ops.push(op)
    s.apply(op)
  }
  for (const e of s.drain()) seen.add(e.e)
  return { ops, seen }
}

/** Find a seed whose profile matches a condition. */
function seedWhere(ok: (seed: number) => boolean) { for (let seed = 1; seed < 5000; seed++) if (ok(seed)) return seed; throw new Error('no seed') }

export function run() {
  // Grid basics.
  const g = new Float32Array(GRID * GRID)
  const changed = stamp(g, 512, 512, 40, 1)
  check('stamp paints', changed > 0 && g[64 * GRID + 64] > 0.9)
  near('grid round trip', decodeGrid(encodeGrid(g))[64 * GRID + 64], g[64 * GRID + 64], 1 / 255)

  // Regions.
  check('nose in face', inRegion(REGIONS.face, 512, 630))
  check('eye excluded from skin', !inRegion(REGIONS.skin, 398, 516))
  check('cheek is skin', inRegion(REGIONS.skin, 360, 660))
  const nail = nailOf(HAND.fingers[2])
  check('nail centre in nails region', inRegion(REGIONS.nails, (nail.base.x + nail.tip.x) / 2, (nail.base.y + nail.tip.y) / 2))

  // ---------------------------------------------------------------- never repetitive
  const faces = Array.from({ length: 200 }, (_, i) => faceProfile(i + 1, false))
  const counts = new Set(faces.map(f => `${f.whiteheads}/${f.blackheads}/${f.deep}/${f.cluster}`))
  check('face profiles vary a lot', counts.size > 120, counts.size)
  check('every cluster type appears', new Set(faces.map(f => f.cluster)).size === 5)
  check('some clean customers', faces.some(f => f.grime === 0) && faces.some(f => f.grime > 0.5))
  check('deep pimples appear', faces.some(f => f.deep > 0) && faces.some(f => f.deep === 0))
  check('personalities vary', new Set(faces.map(f => f.personality)).size === 3)
  const disasterFace = faceProfile(7, true)
  check('disaster face is worse', disasterFace.grime >= 1.6 && disasterFace.whiteheads >= 9 && disasterFace.blackheads >= 18)
  const hands = Array.from({ length: 200 }, (_, i) => handProfile(i + 1, false))
  check('nail patterns vary', new Set(hands.map(h => h.polish?.pattern ?? 'bare')).size >= 5)
  check('some bare nails, some broken', hands.some(h => !h.polish) && hands.some(h => h.broken.length > 0))
  check('nail lengths vary', new Set(hands.map(h => h.grown.filter(x => x > 0).length)).size >= 3)
  check('same seed, same customer', JSON.stringify(faceProfile(42, false)) === JSON.stringify(faceProfile(42, false)))
  // Nothing is ever placed on the headband, the hair, the eyes or the lips.
  let offSkin = 0
  for (let seed = 1; seed <= 60; seed++) for (const t of new TreatmentSession({ treatment: 'facial', seed, disaster: seed % 5 === 0 }).targets) {
    if ((t.kind === 'whitehead' || t.kind === 'drop') && !inRegion(REGIONS.skin, t.x, t.y)) offSkin++
    if (t.kind === 'blackhead' && !inRegion(REGIONS.nose, t.x, t.y)) offSkin++
  }
  check('targets always on skin, never under the headband', offSkin === 0, offSkin)
  // Pimples are big bumps: the whole bump stays clear of the headband, not only its centre.
  let onBand = 0, forehead = 0
  for (let seed = 1; seed <= 200; seed++) for (const t of new TreatmentSession({ treatment: 'facial', seed, disaster: seed % 5 === 0 }).targets) {
    if (t.kind !== 'whitehead') continue
    const edge = bandEdge('bottom', Math.min(1, Math.max(0, (t.x - 186) / 652))).y
    if (t.y - (t.stage === 2 ? 56 : 30) < edge) onBand++
    if (t.y < 470) forehead++
  }
  check('no pimple spills onto the headband', onBand === 0, onBand)
  check('foreheads still get pimples', forehead > 100, forehead)
  // Regions split into zones that each finish with their own cue: five nails, several areas of a face.
  check('each nail is a zone', zonesOf('nails').length === 5, zonesOf('nails').length)
  check('the face splits into areas', zonesOf('skin').length >= 5 && zonesOf('skin').length <= 30, zonesOf('skin').length)
  const a = new TreatmentSession({ treatment: 'facial', seed: 101 }), b = new TreatmentSession({ treatment: 'facial', seed: 102 })
  check('two customers differ', JSON.stringify(a.targets.map(t => [t.kind, Math.round(t.x)])) !== JSON.stringify(b.targets.map(t => [t.kind, Math.round(t.x)])))

  // ---------------------------------------------------------------- full playthroughs (facial and nails, normal and disaster)
  for (const [id, disaster, seed] of [['facial', false, 1234], ['nails', false, 1234], ['facial', true, 77], ['nails', true, 77]] as const) {
    const label = `${id}${disaster ? ' disaster' : ''}`
    const s = new TreatmentSession({ treatment: id, seed, wish: 2, disaster })
    const { ops, seen } = playAll(s)
    check(`${label}: finished`, s.finished)
    check(`${label}: done event`, seen.has('done'))
    check(`${label}: stamps happened`, seen.has('stamp'))
    check(`${label}: zones finished along the way`, seen.has('zone'))
    s.time(120)
    const r = s.result()
    check(`${label}: all required steps done`, r.done === r.required && r.skipped === 0, r)
    check(`${label}: thorough`, r.thoroughness >= 0.9, r.thoroughness)
    // The same ops replayed on a partner's session end in the same state.
    const mirror = new TreatmentSession({ treatment: id, seed, wish: 2, disaster })
    for (const op of ops) mirror.apply(op)
    check(`${label}: mirror finishes`, mirror.finished)
    check(`${label}: mirror same pops`, mirror.popped === s.popped && mirror.extracted === s.extracted)
    check(`${label}: mirror same statuses`, mirror.status.join() === s.status.join())
  }
  // Disaster cases get the extra steps; normal ones do not.
  const dis = new TreatmentSession({ treatment: 'facial', seed: 77, disaster: true })
  playAll(dis)
  check('disaster: second cleanse done', dis.status[stepIndex('facial', 'cleanse2')] === 'done' && dis.status[stepIndex('facial', 'rinse2')] === 'done')
  const norm = new TreatmentSession({ treatment: 'facial', seed: 1234 })
  playAll(norm)
  check('normal: no second cleanse', norm.status[stepIndex('facial', 'cleanse2')] === 'na')
  check('na steps are not required', norm.result().required < TREATMENTS.facial.steps.filter(s => !s.optional).length)

  // A customer with no whiteheads skips the pop step; one with no polish skips the remover.
  const noPimples = seedWhere(seed => faceProfile(seed, false).whiteheads === 0 && faceProfile(seed, false).deep === 0)
  const np = new TreatmentSession({ treatment: 'facial', seed: noPimples })
  playAll(np)
  check('no pimples: pop step drops out', np.status[stepIndex('facial', 'pop')] === 'na')
  check('no pops: no patches', np.status[stepIndex('facial', 'patches')] === 'na')
  const bare = seedWhere(seed => handProfile(seed, false).polish === null)
  const bs = new TreatmentSession({ treatment: 'nails', seed: bare })
  playAll(bs)
  check('bare nails: remover drops out', bs.status[stepIndex('nails', 'remove')] === 'na')
  const dirty = seedWhere(seed => handProfile(seed, false).dirt > 0.3)
  const ds = new TreatmentSession({ treatment: 'nails', seed: dirty })
  playAll(ds)
  check('dirty nails: under-nail step done', ds.status[stepIndex('nails', 'under')] === 'done')

  // ---------------------------------------------------------------- facial specifics
  const popSeed = seedWhere(seed => faceProfile(seed, false).whiteheads >= 4 && faceProfile(seed, false).deep >= 1 && faceProfile(seed, false).blackheads >= 8)
  const f = new TreatmentSession({ treatment: 'facial', seed: popSeed })
  const whiteheads = f.targets.filter(t => t.kind === 'whitehead')
  const blackheads = f.targets.filter(t => t.kind === 'blackhead')
  check('facial: several whiteheads, varied sizes', whiteheads.length >= 4 && Math.max(...whiteheads.map(t => t.size)) - Math.min(...whiteheads.map(t => t.size)) > 0.2, whiteheads.length)
  check('facial: blackheads on the nose', blackheads.length >= 8 && blackheads.every(t => inRegion(REGIONS.nose, t.x, t.y)))
  check('facial: whiteheads on skin', whiteheads.every(t => inRegion(REGIONS.skin, t.x, t.y)))
  while (f.current?.id !== 'pop') f.apply({ k: 'advance', s: f.step })
  f.drain()
  const pop = stepIndex('facial', 'pop')
  const w = f.stepTargets().find(t => !t.stage)!
  f.apply({ k: 'hold', s: pop, x: w.x, y: w.y, dt: 0.1 })
  check('facial: pressing swells', w.progress > 0 && !w.done)
  for (let k = 0; k < 40 && !w.done; k++) f.apply({ k: 'hold', s: pop, x: w.x, y: w.y, dt: 0.1 })
  const ev = f.drain()
  check('facial: pops with an event', w.done && ev.some((e: SessionEvent) => e.e === 'targetDone' && e.kind === 'whitehead'))
  check('facial: a popped spot leaves a mark', f.layers.marks.some(v => v > 0))
  // A deep pimple: the first squeeze brings it up; holding on does nothing; a fresh press pops it.
  const deep = f.stepTargets().find(t => t.stage === 2)!
  for (let k = 0; k < 40 && deep.stage === 2; k++) f.apply({ k: 'hold', s: pop, x: deep.x, y: deep.y, dt: 0.1 })
  check('deep: first squeeze brings it to a head', deep.stage === 1 && !deep.done && f.drain().some(e => e.e === 'targetStage'))
  for (let k = 0; k < 40; k++) f.apply({ k: 'hold', s: pop, x: deep.x, y: deep.y, dt: 0.1 })
  check('deep: holding on is not enough', !deep.done)
  f.apply({ k: 'tap', s: pop, x: deep.x, y: deep.y })
  for (let k = 0; k < 40 && !deep.done; k++) f.apply({ k: 'hold', s: pop, x: deep.x, y: deep.y, dt: 0.1 })
  check('deep: a second squeeze pops it', deep.done)
  const before = f.popped
  f.apply({ k: 'hold', s: pop - 1, x: w.x, y: w.y, dt: 0.2 })
  check('stale ops ignored', f.popped === before)
  // Skipping lowers thoroughness.
  const skip = new TreatmentSession({ treatment: 'facial', seed: 9 })
  while (!skip.finished) skip.apply({ k: 'advance', s: skip.step, skip: true })
  check('skipping everything is not thorough', skip.result().thoroughness < 0.1 && skip.result().skipped > 5)

  // Auto-complete: an erase step is ready at 95% and the rest settles on advance.
  const r2 = new TreatmentSession({ treatment: 'facial', seed: 3 })
  r2.apply({ k: 'advance', s: 0 })
  playStep(r2)
  r2.apply({ k: 'advance', s: 1 })
  check('foam fills on advance', r2.layers.foam.some(v => v === 1))
  playStep(r2)
  check('rinse ready below 100%', r2.ready && r2.progress() >= 0.95)
  r2.apply({ k: 'advance', s: 2 })
  check('rinse clears foam and grime', r2.layers.foam.every(v => v === 0) && r2.layers.grime.every(v => v === 0))

  // Peel: it sticks first, then follows slowly, then releases.
  const peel = stepIndex('facial', 'peel')
  const p = new TreatmentSession({ treatment: 'facial', seed: 5, startStep: peel })
  check('resume at a later step', p.current?.id === 'peel' && p.status.slice(0, peel).every(x => x === 'done' || x === 'na'))
  p.apply({ k: 'peel', s: peel, v: 0.05, dt: 0.1 })
  check('peel sticks at first', p.peel.progress === 0)
  p.apply({ k: 'peel', s: peel, v: 0.3, dt: 0.1 })
  check('peel unsticks past the slack', p.peel.unstuck && p.peel.progress > 0)
  p.apply({ k: 'peel', s: peel, v: 1, dt: 0.1 })
  check('peel cannot be yanked', p.peel.progress < 0.3, p.peel.progress)
  for (let k = 0; k < 40 && !p.peel.released; k++) p.apply({ k: 'peel', s: peel, v: 1, dt: 0.1 })
  check('peel releases', p.peel.released && p.ready)

  // Tool tiers make coverage faster.
  const slow = new TreatmentSession({ treatment: 'facial', seed: 11, startStep: 1, tier: 1 })
  const fast = new TreatmentSession({ treatment: 'facial', seed: 11, startStep: 1, tier: 3 })
  for (const s of [slow, fast]) for (let k = 0; k < 20; k++) s.apply({ k: 'stroke', s: 1, x0: 300, y0: 400 + k * 20, x1: 720, y1: 400 + k * 20 })
  check('higher tier covers faster', fast.progress() > slow.progress(), [slow.progress(), fast.progress()])

  // Snapshot for a late joiner.
  const snap = f.snapshot()
  const joiner = new TreatmentSession({ treatment: 'facial', seed: popSeed })
  joiner.restore(JSON.parse(JSON.stringify(snap)))
  check('snapshot restores step', joiner.step === f.step && joiner.popped === f.popped)
  const size = JSON.stringify(snap).length
  check('snapshot fits one co-op frame easily', size < 40000, size)
  const disasterSnap = JSON.stringify(new TreatmentSession({ treatment: 'facial', seed: 77, disaster: true }).snapshot()).length
  check('even a disaster snapshot is small', disasterSnap < 60000, disasterSnap)
  near('snapshot restores marks', joiner.layers.marks.reduce((x, y) => x + y, 0), f.layers.marks.reduce((x, y) => x + y, 0), 2)

  // Nails: the colour wish, and the tips to clip follow the profile.
  const n = new TreatmentSession({ treatment: 'nails', seed: 21, wish: 4 })
  while (!n.finished) {
    if (n.current!.choice) n.apply({ k: 'choose', s: n.step, i: 4 })
    n.apply({ k: 'advance', s: n.step })
  }
  check('nails: wish matched', n.result().wishMatched === true)
  check('nails: one tip per long nail', n.targets.filter(t => t.kind === 'tip').length === handProfile(21, false).grown.filter(x => x > 0).length)
  // Lamp (four hands) doubles the loop's speed.
  const lampSeed = seedWhere(seed => faceProfile(seed, false).blackheads >= 6)
  const extract = stepIndex('facial', 'extract')
  const solo = new TreatmentSession({ treatment: 'facial', seed: lampSeed, startStep: extract })
  const duo = new TreatmentSession({ treatment: 'facial', seed: lampSeed, startStep: extract })
  const bh = solo.stepTargets()[0]
  duo.apply({ k: 'lamp', x: bh.x, y: bh.y, on: true })
  solo.apply({ k: 'stroke', s: extract, x0: bh.x - 5, y0: bh.y, x1: bh.x + 5, y1: bh.y })
  duo.apply({ k: 'stroke', s: extract, x0: bh.x - 5, y0: bh.y, x1: bh.x + 5, y1: bh.y })
  check('lamp speeds extraction', duo.stepTargets()[0].progress > solo.stepTargets()[0].progress)
}
