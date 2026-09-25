import { check } from './harness.ts'
import { TreatmentSession, holdTime, type Op } from '../src/core/treatments/session.ts'
import { planTreatment } from '../src/core/treatments/plan.ts'
import { viewOf } from '../src/core/treatments/feet.ts'
import { footProfile, toeFreeEdge, footAnatomy } from '../src/core/foot.ts'
import { GRID, CELL, sumIn } from '../src/core/treatments/grid.ts'
import { newSave, reduce, startDay, tick } from '../src/core/salon.ts'
import { canBuy, stationCount, treatmentsUnlocked } from '../src/core/economy.ts'
import { planDay } from '../src/core/customers.ts'
import { writeGoogleReview } from '../src/core/review-writer.ts'
import { candidatesFor } from '../src/core/staff.ts'
import type { TreatmentResult } from '../src/core/treatments/session.ts'

/** Every cell centre of one of this customer's regions. */
function cells(s: TreatmentSession, region: Parameters<TreatmentSession['mask']>[0]) {
  const mask = s.mask(region)
  const pts: [number, number][] = []
  for (let i = 0; i < mask.length; i++) if (mask[i]) pts.push([((i % GRID) + 0.5) * CELL, (Math.floor(i / GRID) + 0.5) * CELL])
  return pts
}

/** Play the current step with ops only, as a player would. */
function playStep(s: TreatmentSession, ops: Op[]) {
  const step = s.current!
  const i = s.step
  const push = (op: Op) => { ops.push(op); s.apply(op) }
  if (step.choice) push({ k: 'choose', s: i, i: 3 })
  let guard = 0
  while (!s.ready && guard++ < 3000) {
    if (step.gesture === 'hold') push({ k: 'hold', s: i, x: 512, y: 560, dt: 0.1 })
    else if (step.gesture === 'peel') push({ k: 'peel', s: i, v: Math.min(1, s.peel.progress + 0.15), dt: 0.1 })
    else if (step.gesture === 'targets') {
      const t = s.stepTargets().find(x => !x.done)
      if (!t) break
      push({ k: 'tap', s: i, x: t.x, y: t.y })
      if (holdTime(t) > 0) for (let k = 0; k < 40 && !t.done; k++) push({ k: 'hold', s: i, x: t.x, y: t.y, dt: 0.1 })
    } else {
      const pts = cells(s, step.region)
      for (let k = 0; k < pts.length && !s.ready; k += 2) push({ k: 'stroke', s: i, x0: pts[k][0] - 6, y0: pts[k][1], x1: pts[k][0] + 6, y1: pts[k][1] })
      if (!pts.length) break
    }
  }
}

function playAll(s: TreatmentSession) {
  const ops: Op[] = []
  let guard = 0
  const stuck: string[] = []
  while (!s.finished && guard++ < 40) {
    playStep(s, ops)
    if (!s.ready && !s.current?.optional) stuck.push(`${s.current?.id}@${s.progress().toFixed(2)}`)
    const op: Op = { k: 'advance', s: s.step }
    ops.push(op)
    s.apply(op)
  }
  return { ops, stuck }
}

const seedWhere = (ok: (seed: number) => boolean) => { for (let seed = 1; seed < 20000; seed++) if (ok(seed)) return seed; throw new Error('no seed') }

export function run() {
  // ---------------------------------------------------------------- plans
  const variants = new Map<string, number>()
  const orders = new Set<string>()
  for (let seed = 1; seed <= 400; seed++) {
    const plan = planTreatment('feet', seed, false)
    variants.set(plan.variant!, (variants.get(plan.variant!) ?? 0) + 1)
    orders.add(plan.def.steps.map(st => st.id).join(','))
    const ids = plan.def.steps.map(st => st.id)
    const p = footProfile(seed, false)
    if (ids[0] !== 'bath') { check(`feet ${seed}: the bath comes first`, false, ids); break }
    if (!p.fungus.some(f => f > 0) && (ids.includes('fungusFile') || ids.includes('fungusCream'))) { check(`feet ${seed}: no antifungal for healthy nails`, false, ids); break }
    if (p.grown.every(g => g < 4) && ids.includes('clip')) { check(`feet ${seed}: no clipping for short nails`, false, ids); break }
    if (!p.polish && ids.includes('remove')) { check(`feet ${seed}: no remover without old polish`, false, ids); break }
    if (plan.variant === 'spa' && !(ids.includes('towel') && ids.indexOf('mask') < ids.indexOf('peel'))) { check(`feet ${seed}: the spa has its mask, towel and peel`, false, ids); break }
    // Colour and top coat go on last.
    const colour = ids.indexOf('color')
    if (colour >= 0 && colour < ids.length - 2) { check(`feet ${seed}: colour comes at the end`, false, ids); break }
    // Every plan works both sides of the foot, with at most three turns.
    const views = plan.def.steps.map(viewOf)
    const turns = views.filter((v, k) => k > 0 && v !== views[k - 1]).length
    if (!views.includes('sole') || turns > 3) { check(`feet ${seed}: both sides, few turns`, false, { ids, views }); break }
  }
  check('feet: all three pedicures turn up', ['classic', 'clinic', 'spa'].every(v => (variants.get(v) ?? 0) > 20), Object.fromEntries(variants))
  check('feet: plans vary from customer to customer', orders.size > 60, orders.size)
  check('feet: plans are deterministic', JSON.stringify(planTreatment('feet', 77, true).def.steps.map(s => s.id)) === JSON.stringify(planTreatment('feet', 77, true).def.steps.map(s => s.id)))
  const clinicPrice = planTreatment('feet', seedWhere(sd => planTreatment('feet', sd, false).variant === 'clinic'), false).def.basePrice
  const classicPrice = planTreatment('feet', seedWhere(sd => planTreatment('feet', sd, false).variant === 'classic'), false).def.basePrice
  check('feet: the foot clinic pays more than the classic', clinicPrice > classicPrice * 1.5, { clinicPrice, classicPrice })
  // Problems call for the clinic.
  let sore = 0, soreClinic = 0
  for (let seed = 1; seed <= 400; seed++) { const p = footProfile(seed, false); if (p.corns.length + p.splinters.length >= 2 || p.ingrown) { sore++; if (planTreatment('feet', seed, false).variant === 'clinic') soreClinic++ } }
  check('feet: sore feet mostly go to the clinic', soreClinic > sore * 0.5, { sore, soreClinic })
  // Disaster cases get their extra steps.
  const dSeed = seedWhere(sd => planTreatment('feet', sd, true).variant !== 'spa')
  const dIds = planTreatment('feet', dSeed, true).def.steps.map(s => s.id)
  check('feet: a disaster scrubs twice and smooths the cracked heels', dIds.includes('scrub2') && dIds.includes('smooth') && dIds.includes('rasp'), dIds)

  // ---------------------------------------------------------------- conditions to layers and targets
  const fSeed = seedWhere(sd => { const p = footProfile(sd, false); return p.fungus[0] > 0 && p.fungus[4] === 0 && !!p.polish })
  const fs = new TreatmentSession({ treatment: 'feet', seed: fSeed, tier: 1 })
  const fp = fs.foot!
  const fungal = sumIn(fs.layers['top.fungus'], fs.mask('top.fungal'))
  check('conditions: fungus seeds only the fungal nails', fungal > 3 && sumIn(fs.layers['top.fungus'], fs.mask('top.nails')) === fungal)
  check('conditions: dirt and calluses follow the profile', (fp.dirt > 0) === (sumIn(fs.layers['top.dirt'], fs.mask('top.foot')) > 0) && (fp.calluses > 0.05) === (sumIn(fs.layers['sole.callus'], fs.mask('sole.calluses')) > 0))
  check('conditions: the arch has no dirt on it', (() => { const a = footAnatomy(fSeed); const x = Math.floor((512 + (430 - 512) * a.shape.width) / CELL), y = Math.floor(620 / CELL); return fs.layers['sole.dirt'][y * GRID + x] < 0.5 })())
  const tSeed = seedWhere(sd => { const p = footProfile(sd, false); return p.corns.length > 0 && p.splinters.length > 0 && p.ingrown !== 0 && p.grown.filter(g => g >= 4).length >= 2 })
  const ts = new TreatmentSession({ treatment: 'feet', seed: tSeed, tier: 1 })
  const tp = ts.foot!
  check('targets: one tip per overgrown toenail', ts.targets.filter(t => t.kind === 'tip').length === tp.grown.filter(g => g >= 4).length)
  check('targets: tips sit at the free edge', ts.targets.filter(t => t.kind === 'tip').every(t => { const e = toeFreeEdge(footAnatomy(tSeed).shape.toes[t.n!], tp.grown[t.n!]); return Math.hypot(e.x - t.x, e.y - t.y) < 1 }))
  check('targets: corns, the ingrown edge and splinters', ts.targets.filter(t => t.kind === 'corn').length === tp.corns.length && ts.targets.some(t => t.kind === 'ingrown') && ts.targets.filter(t => t.kind === 'splinter' && t.view === 'sole').length === tp.splinters.length)

  // ---------------------------------------------------------------- play every kind of pedicure through with ops
  const seen = new Set<string>()
  let stuckAll: string[] = []
  for (const [seed, disaster] of [[fSeed, false], [tSeed, false], [dSeed, true], [11, false], [23, false], [42, true], [99, false], [1234, false]] as [number, boolean][]) {
    const s = new TreatmentSession({ treatment: 'feet', seed, disaster, tier: 1, wish: 2 })
    for (const st of s.def.steps) seen.add(st.id)
    const { ops, stuck } = playAll(s)
    stuckAll = stuckAll.concat(stuck.map(x => `${seed}:${x}`))
    const r = s.result()
    check(`feet ${seed}: plays to the end`, s.finished && r.done === r.required && r.skipped === 0, r)
    check(`feet ${seed}: the foot is clean at the end`, sumIn(s.layers['top.dirt'], s.mask('top.foot')) < 1 && sumIn(s.layers['sole.dirt'], s.mask('sole.sole')) < 1)
    if (s.def.steps.some(st => st.id === 'rasp') && s.status[s.def.steps.findIndex(st => st.id === 'rasp')] === 'done') check(`feet ${seed}: the calluses are rasped off`, sumIn(s.layers['sole.callus'], s.mask('sole.calluses')) < 1)
    if (s.targets.some(t => t.kind === 'tip')) check(`feet ${seed}: every long toenail is clipped`, s.targets.filter(t => t.kind === 'tip').every(t => t.done))
    // Co-op: a partner's session fed the same ops ends the same, and a late joiner's snapshot matches.
    const mirror = new TreatmentSession({ treatment: 'feet', seed, disaster, tier: 1, wish: 2 })
    for (const op of ops) mirror.apply(op)
    const same = Object.keys(s.layers).every(id => s.layers[id].every((v, i) => Math.abs(v - mirror.layers[id][i]) < 1e-6))
    check(`feet ${seed}: a co-op partner mirrors every layer`, same && mirror.finished && JSON.stringify(mirror.status) === JSON.stringify(s.status))
  }
  check('feet: no step gets stuck', stuckAll.length === 0, stuckAll)
  check('feet: the play-throughs cover the steps', ['bath', 'scrub', 'scrubSole', 'rasp', 'clip', 'file', 'cuticles', 'corn', 'ingrown', 'splinter', 'plaster', 'plasterSole', 'antiseptic', 'mask', 'peel', 'creamSole', 'color'].every(id => seen.has(id)), [...seen])

  // A late joiner halfway through: the snapshot rebuilds the same treatment, turned to the same side.
  const half = new TreatmentSession({ treatment: 'feet', seed: tSeed, tier: 1 })
  const hops: Op[] = []
  for (let k = 0; k < 5 && !half.finished; k++) { playStep(half, hops); const op: Op = { k: 'advance', s: half.step }; hops.push(op); half.apply(op) }
  const late = new TreatmentSession({ treatment: 'feet', seed: tSeed, tier: 1 })
  late.restore(JSON.parse(JSON.stringify(half.snapshot())))
  check('sync: a late joiner lands on the same step and side', late.step === half.step && late.view === half.view && late.targets.length === half.targets.length)
  check('sync: layers survive the snapshot', Object.keys(half.layers).every(id => Math.abs(sumIn(half.layers[id], half.mask('everywhere')) - sumIn(late.layers[id], late.mask('everywhere'))) < 40))
  check('sync: a feet snapshot is small', JSON.stringify(half.snapshot()).length < 60000, JSON.stringify(half.snapshot()).length)
  // The bath: the water comes in, the dirt loosens, the water drains, the foot stays wet.
  const bath = new TreatmentSession({ treatment: 'feet', seed: seedWhere(sd => footProfile(sd, false).dirt > 0.4), tier: 1 })
  const dirt0 = sumIn(bath.layers['top.dirt'], bath.mask('top.foot'))
  check('bath: the water is in when it starts', sumIn(bath.layers['top.water'], bath.mask('everywhere')) > 1000)
  for (let k = 0; k < 40 && !bath.ready; k++) bath.apply({ k: 'hold', s: 0, x: 512, y: 560, dt: 0.1 })
  check('bath: soaking loosens the dirt', sumIn(bath.layers['top.dirt'], bath.mask('top.foot')) < dirt0 * 0.7, { dirt0 })
  bath.apply({ k: 'advance', s: 0 })
  check('bath: the water drains after', sumIn(bath.layers['top.water'], bath.mask('everywhere')) === 0 && bath.current?.id !== 'bath')

  // ---------------------------------------------------------------- the salon side
  check('shop: the foot spa arrives on day 5', !canBuy([], 1e6, 'treat-feet', 4).ok && canBuy([], 1e6, 'treat-feet', 5).ok)
  check('shop: the foot spa brings its chair', treatmentsUnlocked(['treat-feet', 'pedi-chair']).includes('feet'))
  check('shop: no station past the floor space', !canBuy(['treat-nails', 'nail-desk', 'nail-desk-2', 'nail-desk-3', 'facial-chair-2', 'facial-chair-3', 'facial-chair-4', 'treat-feet', 'pedi-chair'], 1e6, 'pedi-chair-2', 30).ok && stationCount(['treat-feet', 'pedi-chair']) === 2)
  const day = planDay({ day: 6, seed: 5, count: 30, treatments: ['facial', 'nails', 'feet'], met: [] })
  check('customers: some come for a pedicure', day.filter(p => p.treatment === 'feet').length >= 4)
  const state = startDay({ ...newSave(9), day: 6, money: 1000 })
  reduce(state, 0, { a: 'join', name: 'Kai' })
  check('salon: buying the foot spa adds a pedicure chair', reduce(state, 0, { a: 'buy', item: 'treat-feet' }) && state.stations.some(s => s.kind === 'feet'))
  check('salon: bought before opening, customers can book a pedicure that same day',state.schedule.some(p => p.treatment === 'feet'), state.schedule.map(p => p.treatment))
  const chair = state.stations.find(s => s.kind === 'feet')!
  reduce(state, 0, { a: 'place', station: chair.id, slot: 3 })
  const next = startDay({ ...state, day: 7, ext: state.ext }, state.players)
  reduce(next, 0, { a: 'open' })
  let feetCustomer = null as null | number
  for (let t = 0; t < 6000 && feetCustomer === null; t++) { tick(next, 0.1); const st = next.stations.find(s => s.kind === 'feet')!; const c = next.customers.find(x => x.id === st.customer); if (c && c.state === 'seated') feetCustomer = c.id }
  check('salon: a pedicure customer sits down at the pedicure chair', feetCustomer !== null)
  const pst = next.stations.find(s => s.kind === 'feet')!
  const pc = next.customers.find(c => c.id === pst.customer)!
  check('salon: the chair counts the customer\'s own steps', pst.steps === planTreatment('feet', pc.plan.seed, pc.plan.disaster).def.steps.length)
  reduce(next, 0, { a: 'work', station: pst.id })
  const result: TreatmentResult = { treatment: 'feet', seconds: 200, par: 210, required: 10, done: 10, skipped: 0, optionalDone: 0, popped: 0, extracted: 0, fourHands: false, wishMatched: true, disaster: pc.plan.disaster, thoroughness: 0.95 }
  const before = next.money
  check('salon: a pedicure pays', reduce(next, 0, { a: 'finish', station: pst.id, result }) && next.money > before && next.stats.byPlayer[0].feet === 1)
  const review = next.stats.reviews[next.stats.reviews.length - 1] as unknown as { text: string; tags: string[] }
  check('reviews: a pedicure review speaks of feet', /pedicure|feet|foot|heel|toe|sandal/i.test(review.text) || review.tags.includes('Great for pedicures'), review)
  // The review grammar has lines of its own for feet, with the right verbs for them.
  const texts = Array.from({ length: 40 }, (_, k) => writeGoogleReview({ id: `r${k}`, day: 3, name: 'Ana', stars: 5, result: { ...result, thoroughness: 0.97 }, mood: 1, regular: false, disaster: false, ambience: 2, seed: 100 + k, voice: 'polite', archetype: 'nurse', budget: 3, price: 30, look: null, salon: 'Glow Salon', staff: 'Mia', cat: false, recent: [] }).text)
  check('reviews: feet lines turn up', texts.some(t => /heel|toe|sandal|feet|foot/i.test(t)), texts.slice(0, 5))
  check('reviews: no "feet has" or "feet is"', texts.every(t => !/feet (has|is|feels)\b/i.test(t)))
  // Staff have a pedicure skill.
  check('staff: candidates have a pedicure skill', candidatesFor(77, 0).every(c => c.skills.feet >= 1 && c.skills.feet <= 5) && Array.from({ length: 10 }, (_, w) => candidatesFor(77, w)).flat().some(c => c.skills.feet >= 3))
}
