import { check } from './harness.ts'
import { TreatmentSession, type Op } from '../src/core/treatments/session.ts'
import { planTreatment } from '../src/core/treatments/plan.ts'
import { COMING_SOON, COMING_SOON_TEASER } from '../src/core/treatments/registry.ts'
import { handProfile } from '../src/core/treatments/profile.ts'
import { regionMask } from '../src/core/treatments/session.ts'
import { GRID, CELL } from '../src/core/treatments/grid.ts'
import { firstNameOf, planDay, DISASTER_CHANCE } from '../src/core/customers.ts'
import { genderOfName } from '../src/core/names.ts'
import { newSave, reduce, startDay, tick, type SalonState } from '../src/core/salon.ts'
import { candidates, CLAIM_SECONDS, ext, playerHolds, ROAM_GRACE, staffCountdown } from '../src/core/salon-ext.ts'
import { hire, staffDuration, STAFF_GRACE, STAFF_ID_BASE, type StaffMember } from '../src/core/staff.ts'
import { stationSpot } from '../src/core/floor.ts'
import { ambienceStars, AMBIENCE_GOAL, canBuy, ITEM_BY_ID, tipFor } from '../src/core/economy.ts'
import { DECOR_SETS, GIFT_BY_REGULAR, setPayMult, setStarBonus, setTipMult } from '../src/core/decor.ts'
import { goalFor, goalTally } from '../src/core/goals.ts'
import { writeGoogleReview, type ReviewInput } from '../src/core/review-writer.ts'
import { REVIEWS_DATA } from '../src/content/reviews.ts'
import { starsFor } from '../src/core/reviews.ts'
import type { TreatmentResult } from '../src/core/treatments/session.ts'

/** Play a whole treatment with ops only (as the session tests do). Returns the ops. */
function playAll(s: TreatmentSession): Op[] {
  const ops: Op[] = []
  const push = (op: Op) => { ops.push(op); s.apply(op) }
  for (let guard = 0; !s.finished && guard < 60; guard++) {
    const step = s.current!
    const i = s.step
    if (step.choice) push({ k: 'choose', s: i, i: 1 })
    for (let k = 0; !s.ready && k < 4000; k++) {
      if (step.gesture === 'hold') push({ k: 'hold', s: i, x: 512, y: 540, dt: 0.1 })
      else if (step.gesture === 'peel') push({ k: 'peel', s: i, v: Math.min(1, s.peel.progress + 0.15), dt: 0.1 })
      else if (step.gesture === 'targets' || step.gesture === 'sweep') {
        const t = s.stepTargets().find(x => !x.done)
        if (!t) break
        if (step.gesture === 'sweep') push({ k: 'stroke', s: i, x0: t.x - 20, y0: t.y, x1: t.x + 20, y1: t.y })
        else if (t.kind === 'whitehead' || t.kind === 'hangnail' || t.kind === 'corn' || t.kind === 'ingrown' || t.kind === 'splinter') { push({ k: 'tap', s: i, x: t.x, y: t.y }); for (let h = 0; h < 30 && !t.done && !(t.stage === 1 && !t.gripped); h++) push({ k: 'hold', s: i, x: t.x, y: t.y, dt: 0.1 }) }
        else push({ k: 'tap', s: i, x: t.x, y: t.y })
        if (step.optional) break
      } else {
        const mask = regionMask(step.region)
        for (let c = 0; c < mask.length && !s.ready; c += 3) if (mask[c]) { const x = (c % GRID + 0.5) * CELL, y = (Math.floor(c / GRID) + 0.5) * CELL; push({ k: 'stroke', s: i, x0: x - 6, y0: y, x1: x + 6, y1: y }) }
      }
    }
    if (!step.optional && !s.ready) check(`step ${step.id} of seed ${s.seed} reaches ready`, false, s.progress())
    push({ k: 'advance', s: s.step })
  }
  return ops
}

const result = (over: Partial<TreatmentResult> = {}): TreatmentResult => ({ treatment: 'facial', seconds: 150, par: 170, required: 12, done: 12, skipped: 0, optionalDone: 1, popped: 6, extracted: 12, fourHands: false, wishMatched: null, disaster: false, thoroughness: 0.96, ...over })
const input = (over: Partial<ReviewInput> = {}): ReviewInput => ({
  id: 'r', day: 1, name: 'Ada K.', stars: 5, result: result(), mood: 0.9, regular: false, disaster: false, ambience: 5, seed: 42,
  voice: 'casual', archetype: 'student', budget: 1, price: 38, look: null, salon: 'Glow Salon', staff: 'Mia', cat: false, recent: [], ...over,
})

export function run() {
  // ---------------------------------------------------------------- facials are never the same twice
  const facials = Array.from({ length: 60 }, (_, i) => planTreatment('facial', 1000 + i, false))
  const orders = new Set(facials.map(p => p.def.steps.map(s => s.id).join(',')))
  check('facials: 60 customers, at least 40 different step lists', orders.size >= 40, orders.size)
  check('facials: every mask appears', new Set(facials.map(p => p.mask)).size === 4, [...new Set(facials.map(p => p.mask))])
  check('facials: every extra appears', ['brows', 'lips', 'eyePatches', 'jade'].every(x => facials.some(p => p.extras.includes(x))))
  check('facials: one or two extras each', facials.every(p => p.extras.length >= 1 && p.extras.length <= 2))
  check('facials: steam comes first for some, the cleanse for others', facials.some(p => p.def.steps[0].id === 'steam') && facials.some(p => p.def.steps[0].id === 'cleanse'))
  check('facials: plans are deterministic', JSON.stringify(planTreatment('facial', 1234, false).def.steps.map(s => s.id)) === JSON.stringify(planTreatment('facial', 1234, false).def.steps.map(s => s.id)))
  check('facials: the jade roller always follows the serum, before the moisturiser', facials.filter(p => p.extras.includes('jade')).every(p => { const ids = p.def.steps.map(s => s.id); return ids.indexOf('jade') === ids.indexOf('serum') + 1 && ids.indexOf('jade') < ids.indexOf('moisturize') }))
  check('facials: the lip scrub comes before the moisturiser clears it', facials.filter(p => p.extras.includes('lips')).every(p => { const ids = p.def.steps.map(s => s.id); return ids.indexOf('lips') < ids.indexOf('moisturize') }))
  check('disaster facials get the second cleanse', planTreatment('facial', 55, true).def.steps.some(s => s.id === 'cleanse2') && !planTreatment('facial', 55, false).def.steps.some(s => s.id === 'cleanse2'))
  // Every kind of facial plays through with ops, and a partner replaying the ops ends identical.
  const byMask = new Map<string, number>()
  for (let seed = 1; byMask.size < 4 && seed < 400; seed++) { const m = planTreatment('facial', seed, false).mask!; if (!byMask.has(m)) byMask.set(m, seed) }
  const extraSeeds = ['brows', 'lips', 'eyePatches', 'jade'].map(x => { for (let seed = 1; seed < 400; seed++) if (planTreatment('facial', seed, false).extras.includes(x)) return seed; return 1 })
  for (const seed of [...byMask.values(), ...extraSeeds]) {
    const s = new TreatmentSession({ treatment: 'facial', seed })
    const ops = playAll(s)
    s.time(200)
    const r = s.result()
    check(`facial ${s.plan.mask} seed ${seed}: finishes with every step done`, s.finished && r.done === r.required && r.skipped === 0, r)
    const mirror = new TreatmentSession({ treatment: 'facial', seed })
    for (const op of ops) mirror.apply(op)
    check(`facial ${s.plan.mask} seed ${seed}: the partner mirror matches`, mirror.finished && mirror.status.join() === s.status.join())
  }
  // Under-eye patches are their own targets: the pimple patches still come after them.
  const eyeSeed = extraSeeds[2]
  const eye = new TreatmentSession({ treatment: 'facial', seed: eyeSeed })
  playAll(eye)
  check('under-eye patches placed under both eyes', eye.targets.filter(t => t.tag === 'eye' && t.done).length === 2)
  check('pimple patches still offered after the eye patches', !eye.targets.some(t => t.kind === 'whitehead' && t.done) || eye.targets.some(t => t.kind === 'patch' && !t.tag))

  // ---------------------------------------------------------------- manicures too
  const nails = Array.from({ length: 60 }, (_, i) => planTreatment('nails', 2000 + i, false))
  check('nails: at least 25 different step lists in 60', new Set(nails.map(p => p.def.steps.map(s => s.id).join(','))).size >= 25)
  check('nails: gel and classic both appear', nails.some(p => p.polish === 'gel') && nails.some(p => p.polish === 'classic'))
  check('nails: every extra appears', ['scrub', 'oil', 'massage', 'gems'].every(x => nails.some(p => p.extras.includes(x))))
  check('nails: there is always a colour choice', nails.every(p => p.def.steps.some(s => s.choice === 'polish')))
  const brokenSeed = (() => { for (let seed = 1; seed < 2000; seed++) if (handProfile(seed, false).broken.length) return seed; return 1 })()
  const broken = handProfile(brokenSeed, false).broken
  check('a broken nail gets a repair step for that finger', broken.every(f => planTreatment('nails', brokenSeed, false).def.steps.some(s => s.id === `repair${f}`)))
  for (const seed of [brokenSeed, 2001, 2002, 2003, 2004]) {
    const s = new TreatmentSession({ treatment: 'nails', seed, wish: 1 })
    playAll(s)
    s.time(200)
    const r = s.result()
    check(`manicure ${s.plan.polish} seed ${seed}: finishes with every step done`, s.finished && r.done === r.required, r)
  }
  const dis = new TreatmentSession({ treatment: 'nails', seed: 9, disaster: true })
  playAll(dis)
  check('a disaster manicure plays through', dis.finished)

  // ---------------------------------------------------------------- 5 stars for doing everything
  check('every step done is 5 stars, however slow and long the wait', starsFor({ ...result(), seconds: 900 }, 0.2, 1) === 5)
  check('skipping steps is not', starsFor({ ...result(), done: 8, skipped: 4, thoroughness: 0.6, seconds: 400 }, 0.3, 1) < 5)

  // ---------------------------------------------------------------- customers: who they are agrees
  const week: string[] = []
  let disasters = 0, total = 0, mismatched = 0, repeats = 0
  for (let day = 1; day <= 21; day++) {
    const recent = week.slice(-60)
    const plans = planDay({ day, seed: 777, count: 8, treatments: ['facial', 'nails'], met: [], avoidNames: recent })
    for (const p of plans) {
      total++
      if (p.disaster) disasters++
      if (p.regular) continue
      const first = firstNameOf(p.name)
      if (recent.includes(first)) repeats++
      week.push(first)
      const g = genderOfName(first)
      if (g && g !== p.look.gender) mismatched++
      if ((p.archetype === 'grandma' && (p.look.gender !== 'female' || p.look.age !== 'older')) || (p.archetype === 'grandpa' && (p.look.gender !== 'male' || p.look.age !== 'older'))) mismatched++
      if ((p.archetype === 'student' || p.archetype === 'teen') && p.look.age !== 'young') mismatched++
    }
  }
  check('names, gender and age agree with the archetype', mismatched === 0, mismatched)
  check('no first name twice in a week', repeats === 0, repeats)
  check(`about ${DISASTER_CHANCE * 100}% disaster cases`, disasters / total > 0.08 && disasters / total < 0.24, disasters / total)
  check('every look has a gender and an age', planDay({ day: 3, seed: 5, count: 10, treatments: ['facial'], met: [] }).every(p => (p.look.gender === 'female' || p.look.gender === 'male') && ['young', 'adult', 'older'].includes(p.look.age ?? '') && !!p.look.figure && p.look.figure.masc === (p.look.gender === 'male')))
  const withRegulars = Array.from({ length: 20 }, (_, d) => planDay({ day: d + 2, seed: 3, count: 8, treatments: ['facial', 'nails'], met: ['rosa', 'jade', 'maya'], rating: 4.6 })).flat()
  check('met regulars come back, with their own name', withRegulars.some(p => p.regular === 'rosa' && p.name === 'Nonna Rosa'))
  check('regulars only book what the salon offers', withRegulars.filter(p => p.regular).every(p => p.treatment === 'facial' || p.treatment === 'nails'))

  // ---------------------------------------------------------------- staff take the staffed station, and earn less than you
  const st = startDay({ ...newSave(31), day: 5, money: 5000, owned: ['facial-chair-2'] }, [])
  reduce(st, 0, { a: 'join', name: 'P' })
  reduce(st, 0, { a: 'hire', idx: 0 })
  const staff = ext(st).staff[0]
  check('the hire works the second chair', staff.station === 's1')
  reduce(st, 0, { a: 'open' })
  for (let t = 0; t < 300 && !st.stations.some(s => s.customer !== null); t++) tick(st, 0.1)
  check('the first customer is seated where the staff member is ready', st.stations[1].customer !== null && st.stations[0].customer === null)
  for (let t = 0; t < 3000 && staff.served < 1; t++) tick(st, 0.1)
  check('staff serve them on their own', staff.served === 1)
  const staffReview = st.stats.reviews[0]
  const staffPaid = st.stats.revenue + st.stats.tips
  const playerPrice = 38, playerTip = tipFor(38, 5, 1, st.owned)
  check('a staff treatment earns the salon less than doing it yourself', staffPaid < playerPrice + playerTip && staffReview.stars <= 5, { staffPaid, playerPrice, playerTip })
  // A staff member helps at another station they are skilled for when theirs is quiet.
  const away = startDay({ ...newSave(8), day: 5, money: 5000, owned: ['facial-chair-2'] }, [])
  reduce(away, 0, { a: 'join', name: 'P' })
  const skilled = candidates(away).findIndex(c => c.skills.facial >= 2)
  check('a facial-skilled candidate this week', skilled >= 0)
  if (skilled >= 0 && reduce(away, 0, { a: 'hire', idx: skilled })) {
    const member = ext(away).staff[0]
    reduce(away, 0, { a: 'assignStaff', id: member.id, station: null })
    reduce(away, 0, { a: 'open' })
    for (let t = 0; t < 3000 && member.served < 1; t++) tick(away, 0.1)
    check('a skilled staff member with no station of their own still serves', member.served >= 1)
  }

  // ---------------------------------------------------------------- staff balance (C2-04)
  const trainee = { ...hire(candidates(away)[0], STAFF_ID_BASE), skills: { facial: 2, nails: 2, feet: 2 }, traits: [] }
  check('staff take about par: a two-star trainee on a facial takes 90% of par', staffDuration(trainee, 'facial', 100, 170) === Math.round(170 * 0.9))
  check('staff take about par: a five-star expert still takes more than half of par', staffDuration({ ...trainee, skills: { facial: 5, nails: 5, feet: 5 } }, 'facial', 100, 170) > 170 * 0.55)
  // A salon with two facial chairs and one hire on the second: the first customer sits at the player's chair.
  const balance = (setup: (s: SalonState, member: StaffMember) => void) => {
    const s = startDay({ ...newSave(77), day: 6, money: 5000, owned: ['facial-chair-2'] }, [])
    reduce(s, 0, { a: 'join', name: 'P' })
    const idx = candidates(s).findIndex(c => c.skills.facial >= 2)
    reduce(s, 0, { a: 'hire', idx })
    const member = ext(s).staff[0]
    setup(s, member)
    reduce(s, 0, { a: 'open' })
    return { s, member }
  }
  const seatAt = (s: SalonState, id: string, seconds = 400) => { for (let t = 0; t < seconds * 10 && !s.stations.some(x => x.id === id && x.customer !== null && s.customers.find(c => c.id === x.customer)?.state === 'seated'); t++) tick(s, 0.1) }
  // Staff with a station of their own never leave it for another one.
  {
    const { s, member } = balance((s, m) => { reduce(s, 0, { a: 'assignStaff', id: m.id, station: 's1' }) })
    // The player keeps the staff member's own chair for themselves: the staff member waits rather than roam.
    const spot1 = stationSpot(s.stations[1].slot)
    reduce(s, 0, { a: 'pos', x: spot1.x, y: spot1.y, f: 1, m: false })
    seatAt(s, 's0')
    for (let t = 0; t < 600; t++) tick(s, 0.1)
    check('staff with a station stay at it (the player’s chair is left to the player)', s.stations[0].lead === null && member.task === null, { lead: s.stations[0].lead })
  }
  // Staff set to "Anywhere" wait for the players first, then help.
  {
    const { s, member } = balance((s, m) => { reduce(s, 0, { a: 'assignStaff', id: m.id, station: null }) })
    seatAt(s, 's0')
    const seatedAt = s.clock
    for (let t = 0; t < 400 && s.stations[0].lead === null; t++) tick(s, 0.1)
    check('staff set to Anywhere wait about 30 s for a player', s.stations[0].lead === null || s.clock - seatedAt >= ROAM_GRACE - 0.5, { waited: s.clock - seatedAt })
    for (let t = 0; t < 400 && s.stations[0].lead === null; t++) tick(s, 0.1)
    check('staff set to Anywhere then take a waiting customer', s.stations[0].lead === member.id)
  }
  // Never a station a player is at, standing by or walking to.
  {
    const { s } = balance((s, m) => { reduce(s, 0, { a: 'assignStaff', id: m.id, station: 's0' }) })
    const spot = stationSpot(s.stations[0].slot)
    reduce(s, 0, { a: 'pos', x: spot.x + 30, y: spot.y, f: 1, m: false })
    seatAt(s, 's0')
    for (let t = 0; t < 600; t++) tick(s, 0.1)
    check('staff leave a station to a player standing at it', s.stations[0].lead === null)
    check('no countdown while a player is there', staffCountdown(s, 's0') === null)
    reduce(s, 0, { a: 'pos', x: 200, y: 700, f: 1, m: false })
    reduce(s, 0, { a: 'claim', station: 's0' })
    for (let t = 0; t < 100; t++) tick(s, 0.1)
    check('staff leave a station to a player walking over to it', s.stations[0].lead === null && playerHolds(s, 's0'))
    reduce(s, 0, { a: 'claim', station: null })
    tick(s, 0.1)
    check('the wait starts again when the player goes elsewhere', s.stations[0].lead === null && (staffCountdown(s, 's0') ?? 0) > STAFF_GRACE - 0.5, staffCountdown(s, 's0'))
    for (let t = 0; t < 80; t++) tick(s, 0.1)
    check('then the staff member steps in', s.stations[0].lead !== null && s.stations[0].lead >= STAFF_ID_BASE)
    // A claim runs out: a player who wandered off does not hold a chair forever.
    const other = startDay({ ...newSave(78), day: 6 }, [])
    reduce(other, 0, { a: 'join', name: 'Q' })
    reduce(other, 0, { a: 'claim', station: 's0' })
    reduce(other, 0, { a: 'open' })
    for (let t = 0; t < (CLAIM_SECONDS + 1) * 10; t++) tick(other, 0.1)
    check('a claim runs out', !playerHolds(other, 's0'))
    check('a claim for a station that does not exist is refused', !reduce(other, 0, { a: 'claim', station: 's9' }))
  }

  // ---------------------------------------------------------------- the step counter is planned up front (C2-21)
  const drops: string[] = []
  let plays = 0
  for (const treatment of ['facial', 'nails', 'feet'] as const) {
    for (let seed = 200; seed < 216; seed++) {
      const s = new TreatmentSession({ treatment, seed, disaster: seed % 5 === 0 })
      const planned = s.status.map((st, i) => (st === 'na' ? -1 : i)).filter(i => i >= 0)
      playAll(s)
      plays++
      const dropped = planned.filter(i => s.status[i] === 'na')
      if (dropped.length) drops.push(`${treatment}:${seed}:${dropped.map(i => s.def.steps[i].id).join('+')}`)
    }
  }
  check('step counter: played in full, the planned steps are the steps played (the total never changes)', drops.length === 0 && plays === 48, drops)
  const skipper = new TreatmentSession({ treatment: 'facial', seed: 4 })
  const plannedCount = skipper.status.filter(st => st !== 'na').length
  check('step counter: steps a customer will never need are out from the start', plannedCount < skipper.def.steps.length || skipper.def.steps.every(st => !st.need), { plannedCount, all: skipper.def.steps.length })

  // ---------------------------------------------------------------- the shop's coming treatments are real cards (C2-18)
  check('every coming treatment says what it is', COMING_SOON.every(n => (COMING_SOON_TEASER[n] ?? '').length > 20) && new Set(Object.values(COMING_SOON_TEASER)).size === COMING_SOON.length)
  check('pedicures are no longer "coming": the foot spa is in the shop', !COMING_SOON.some(n => /pedicure|feet|foot/i.test(n)) && ITEM_BY_ID['treat-feet']?.tab === 'treatments')

  // ---------------------------------------------------------------- purchases feel weighty
  check('ambience goal is 15 points', AMBIENCE_GOAL === 15 && ambienceStars([]) === 1)
  const lots = DECOR_SETS.flatMap(s => s.items.map(i => i.id))
  check('decor never stops adding tips (no hard cap)', tipFor(40, 5, 1, lots) > tipFor(40, 5, 1, lots.slice(0, 12)) && tipFor(40, 5, 1, lots.slice(0, 12)) > tipFor(40, 5, 1, []))
  const pastel = DECOR_SETS[0].items.map(i => i.id), zen = DECOR_SETS.find(s => s.id === 'zen-garden')!.items.map(i => i.id)
  const tropical = DECOR_SETS.find(s => s.id === 'tropical')!.items.map(i => i.id), cottage = DECOR_SETS.find(s => s.id === 'cottagecore')!.items.map(i => i.id)
  check('Pastel Pop: +10% tips from students and teens', setTipMult(pastel, 'student', false) === 1.1 && setTipMult(pastel, 'lawyer', false) === 1)
  check('Cottagecore: grandmas and gardeners tip double', setTipMult(cottage, 'grandma', false) === 2 && setTipMult(cottage, 'gardener', false) === 2)
  check('Zen Garden: spa treatments (facials) +1 star', setStarBonus(zen, 'facial') === 1 && setStarBonus(zen, 'nails') === 0)
  check('Tropical: +15% pay in summer', setPayMult(tropical, 30) === 1.15 && setPayMult(tropical, 5) === 1)
  check('the nail bar is about $200 and comes with its desk', ITEM_BY_ID['treat-nails'].price <= 220 && ITEM_BY_ID['treat-nails'].includes?.includes('nail-desk'))
  check('shop items arrive over time', !canBuy([], 9999, 'facial-chair-2', 1).ok && canBuy([], 9999, 'facial-chair-2', 4).ok)
  // A regular's level-5 gift is a real item.
  const gs = startDay({ ...newSave(12), day: 3 }, [])
  reduce(gs, 0, { a: 'join', name: 'P' })
  ext(gs).friends.rosa = 4
  reduce(gs, 0, { a: 'open' })
  for (let t = 0; t < 400 && !gs.customers.some(c => c.state === 'seated'); t++) tick(gs, 0.1)
  const seated = gs.customers.find(c => c.state === 'seated')!
  seated.plan = { ...seated.plan, regular: 'rosa', name: 'Nonna Rosa', treatment: 'facial' }
  reduce(gs, 0, { a: 'work', station: 's0' })
  reduce(gs, 0, { a: 'finish', station: 's0', result: result() })
  check('a level-5 friend leaves a real gift', gs.owned.includes(GIFT_BY_REGULAR.rosa.id) && ITEM_BY_ID[GIFT_BY_REGULAR.rosa.id].effect.kind === 'decor' && gs.events.some(e => e.kind === 'gift'))

  // ---------------------------------------------------------------- one relaxed goal a day
  const g1 = goalFor(1, 1, 4, false), g2 = goalFor(1, 9, 8, true)
  check('day 1 goal is gentle', g1.kind === 'served' && g1.target === 3 && g1.reward > 0)
  check('goals vary by day', new Set(Array.from({ length: 12 }, (_, d) => goalFor(1, d + 2, 8, true).kind)).size >= 4)
  check('goal text has no placeholders', !/[{}]/.test(g2.text) && g2.text.length > 5)
  check('goal tally counts the day', goalTally({ stats: { byPlayer: { 0: { popped: 4, extracted: 2 }, 1: { popped: 3, extracted: 0 } }, reviews: [{ stars: 5, treatment: 'nails' }, { stars: 4, treatment: 'facial' }], served: 2, tips: 20 }, ext: { today: { pets: 1 } } }).popped === 7)

  // ---------------------------------------------------------------- reviews match reality
  const decorLines = REVIEWS_DATA.extras.decor
  const bare = Array.from({ length: 80 }, (_, i) => writeGoogleReview(input({ seed: i, owned: [], ambience: 5 })))
  check('no decor, no decor praise', bare.every(r => !decorLines.some(l => r.text.includes(l)) && !r.tags.includes('Gorgeous decor')), bare.find(r => decorLines.some(l => r.text.includes(l)))?.text)
  const plantsOnly = Array.from({ length: 80 }, (_, i) => writeGoogleReview(input({ seed: i, owned: ['plant'], ambience: 5 })))
  check('no "plants and lights" without lights', plantsOnly.every(r => !r.text.includes('plants and lights')))
  const players = Array.from({ length: 40 }, (_, i) => writeGoogleReview(input({ seed: i, staff: 'Kaizen', byStaff: false })))
  check('no "Friendly staff" tag without staff', players.every(r => !r.tags.includes('Friendly staff')))
  const hired = Array.from({ length: 60 }, (_, i) => writeGoogleReview(input({ seed: i, staff: 'Mia', byStaff: true })))
  check('staff can earn the tag', hired.some(r => r.tags.includes('Friendly staff')))
  void ({} as SalonState)
}
