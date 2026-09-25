import { check } from './harness.ts'
import { newSave, startDay, reduce, tick, receipt, toSave, type SalonState } from '../src/core/salon.ts'
import { ITEM_BY_ID, ambiencePoints, canBuy } from '../src/core/economy.ts'
import { DECOR_SETS, DECOR_SET_ITEMS, completeSets, placeDecor, SET_BONUS } from '../src/core/decor.ts'
import { CAMPAIGNS, campaignCustomers, advanceCampaigns, canRunCampaign, MAX_EXTRA } from '../src/core/marketing.ts'
import { candidatesFor, hire, gainXp, staffResult, xpToLevel } from '../src/core/staff.ts'
import { personaFor } from '../src/core/persona.ts'
import { writeGoogleReview, salonTags, type ReviewInput } from '../src/core/review-writer.ts'
import { ext, extraCustomers, hireCheck, validateExt, personaOf } from '../src/core/salon-ext.ts'
import { importCode, exportCode, validate } from '../src/core/save.ts'
import { PEOPLE_DATA } from '../src/content/people.ts'
import { REVIEWS_DATA } from '../src/content/reviews.ts'
import type { TreatmentResult } from '../src/core/treatments/session.ts'

const result = (over: Partial<TreatmentResult> = {}): TreatmentResult => ({ treatment: 'facial', seconds: 150, par: 170, required: 12, done: 12, skipped: 0, optionalDone: 1, popped: 6, extracted: 12, fourHands: false, wishMatched: null, disaster: false, thoroughness: 0.96, ...over })

const input = (over: Partial<ReviewInput> = {}): ReviewInput => ({
  id: 'r', day: 1, name: 'Ada K.', stars: 5, result: result(), mood: 0.9, regular: false, disaster: false, ambience: 1, seed: 42,
  voice: 'casual', archetype: 'student', budget: 1, price: 38, look: null, salon: 'Glow Salon', staff: 'Mia', cat: false, recent: [], ...over,
})

function runUntil(state: SalonState, done: () => boolean, seconds = 900) {
  for (let t = 0; t < seconds && !done(); t += 0.1) tick(state, 0.1)
}

export function run() {
  // ---------------------------------------------------------------- the review grammar
  const allOpeners = Object.values(REVIEWS_DATA.openers).flat()
  const allClosers = Object.values(REVIEWS_DATA.closers).flat()
  const r1 = writeGoogleReview(input())
  check('review has no unfilled placeholders', !/[{}]/.test(r1.text), r1.text)
  check('review starts with an opener from the grammar', allOpeners.some(o => r1.text.startsWith(o.replace('{salon}', 'Glow Salon'))), r1.text)
  check('review ends with a closer (or an emoji after it)', allClosers.some(c => r1.text.includes(c)), r1.text)
  check('review is the same from the same seed', writeGoogleReview(input()).text === r1.text)
  check('5 stars tagged for its treatment', r1.tags.includes('Great for facials'))
  const nails = writeGoogleReview(input({ result: result({ treatment: 'nails' }), seed: 9 }))
  check('nails review tagged', nails.tags.includes('Great for nails'))
  // Reviews in a row avoid repeating lines.
  const recent: string[] = []
  const texts = Array.from({ length: 6 }, (_, i) => writeGoogleReview(input({ seed: 100 + i, voice: 'polite', recent })).text)
  const openers = texts.map(t => REVIEWS_DATA.openers.polite.find(o => t.startsWith(o.replace('{salon}', 'Glow Salon'))))
  check('five polite reviews in a row use five different openers', new Set(openers.slice(0, 5)).size === 5, openers)
  const low = writeGoogleReview(input({ stars: 2, seed: 7, voice: 'plain' }))
  check('a 2-star review uses a 2-star remark', REVIEWS_DATA.remarks['2'].some(rm => low.text.includes(rm)), low.text)
  check('a 2-star review earns no category tag for the treatment', !low.tags.includes('Great for facials'))
  const disaster = writeGoogleReview(input({ disaster: true, seed: 3 }))
  check('a turned-around disaster is mentioned', REVIEWS_DATA.extras.disaster.some(l => disaster.text.includes(l.replace('{part}', 'skin'))) && disaster.tags.includes('Miracle workers'), disaster.text)
  const loud = writeGoogleReview(input({ voice: 'loud', seed: 5 }))
  check('the loud voice shouts', loud.text === loud.text.toUpperCase())
  const four = writeGoogleReview(input({ result: result({ fourHands: true }), seed: 11 }))
  check('four hands are mentioned', REVIEWS_DATA.extras['four-hands'].some(l => four.text.includes(l)), four.text)
  const unnamed = Array.from({ length: 30 }, (_, i) => writeGoogleReview(input({ seed: 500 + i, staff: 'You', voice: 'polite' })).text)
  check('an unnamed player is never "You was"', unnamed.every(t => !/\bYou was\b|\byou was\b/.test(t)), unnamed.find(t => /You was/i.test(t)))
  const tags = salonTags([{ tags: ['Great for nails', 'Relaxing'] }, { tags: ['Great for nails'] }, { tags: ['Relaxing', 'Great for nails'] }, { tags: ['A bit pricey'] }])
  check('salon tags count and sort', tags[0].tag === 'Great for nails' && tags[0].count === 3 && tags[1].tag === 'Relaxing' && tags.length === 3, tags)

  // ---------------------------------------------------------------- personas
  const p1 = personaFor({ seed: 1234, regular: null, treatment: 'facial' }, { rating: 0 })
  check('persona is stable for a seed', JSON.stringify(p1) === JSON.stringify(personaFor({ seed: 1234, regular: null, treatment: 'facial' }, { rating: 0 })))
  const early = Array.from({ length: 200 }, (_, i) => personaFor({ seed: i, regular: null, treatment: 'facial' }, { rating: 0 }))
  check('a new salon only sees starter archetypes', early.every(p => ['student', 'office', 'grandma', 'athlete', 'teen', 'farmer'].includes(p.archetype)))
  check('customers vary', new Set(early.map(p => p.archetype)).size >= 5)
  const rosa = personaFor({ seed: 5, regular: 'rosa', treatment: 'nails' }, { rating: 0 })
  check('a story regular keeps their archetype and beats', rosa.archetype === 'grandma' && !!rosa.story && rosa.story.beats.length === 5)
  const biased = Array.from({ length: 100 }, (_, i) => personaFor({ seed: i, regular: null, treatment: 'facial' }, { rating: 0, bias: ['influencer'] }))
  check('a campaign brings its people', biased.filter(p => p.archetype === 'influencer').length > 25)

  // ---------------------------------------------------------------- staff candidates
  const week0 = candidatesFor(77, 0)
  check('three candidates a week', week0.length === 3)
  check('candidates are the same for everyone', JSON.stringify(week0) === JSON.stringify(candidatesFor(77, 0)))
  check('a new week brings new people', JSON.stringify(week0) !== JSON.stringify(candidatesFor(77, 1)))
  check('candidate names come from the people list', week0.every(c => PEOPLE_DATA.firstNames.includes(c.name)))
  check('candidates have traits and skills', week0.every(c => c.traits.length >= 1 && c.skills.facial >= 1 && c.skills.nails >= 1 && c.wage > 0 && c.fee > c.wage))
  const member = hire(week0[0], 100)
  let levels = 0
  for (let i = 0; i < 30; i++) if (gainXp(member, 'facial')) levels++
  check('staff level up with practice', member.level > 1 && levels === member.level - 1 && member.xp < xpToLevel(member.level) + 1)
  const sr = staffResult(member, 'nails', 190, 5, [])
  check('staff results are sane', sr.thoroughness > 0.5 && sr.thoroughness <= 0.97 && sr.seconds > 0)

  // ---------------------------------------------------------------- decor sets
  check('seven sets of six', DECOR_SETS.length === 7 && DECOR_SETS.every(s => s.items.length === 6))
  check('set items are shop items', DECOR_SET_ITEMS.every(i => ITEM_BY_ID[i.id] && i.tab === 'decor' && i.price > 0))
  const pastel = DECOR_SETS[0].items.map(i => i.id)
  check('the first set is open from the start', canBuy([], 9999, pastel[0]).ok)
  const second = DECOR_SETS[1].items[0].id
  check('the next set opens after one item of the one before', !canBuy([], 9999, second).ok && canBuy(ITEM_BY_ID[second].needs!, 9999, second).ok)
  check('a full set adds a bonus', completeSets(pastel).length === 1 && ambiencePoints(pastel) === pastel.reduce((n, id) => n + (ITEM_BY_ID[id].effect as { ambience: number }).ambience, 0) + SET_BONUS)
  const shown = placeDecor(pastel, [])
  check('owned decor is placed in slots', shown.length === 6 && shown.every(p => Number.isFinite(p.x)))
  const twoRugs = [DECOR_SETS[0].items[3].id, DECOR_SETS[6].items[0].id]
  check('placing an item brings it to the front', placeDecor(twoRugs, [twoRugs[0]]).find(p => p.id === twoRugs[0])?.slot === 0)

  // ---------------------------------------------------------------- campaigns
  check('six campaigns from the content', CAMPAIGNS.length === 6 && CAMPAIGNS.every(c => c.price > 0 && c.perDay.length > 0))
  check('campaign customers add up and cap', campaignCustomers([{ id: 'flyers', day: 0 }], false) === 2 && campaignCustomers([{ id: 'radio', day: 0 }, { id: 'social', day: 0 }], true) === MAX_EXTRA)
  check('campaigns run their days then end', advanceCampaigns(advanceCampaigns(advanceCampaigns([{ id: 'flyers', day: 0 }]))).length === 0)
  check('a running campaign cannot be bought twice', !canRunCampaign('flyers', [{ id: 'flyers', day: 1 }], false, 999).ok)

  // ---------------------------------------------------------------- inside the salon day
  let state = startDay({ ...newSave(4242), money: 5000 }, [])
  reduce(state, 0, { a: 'join', name: 'Kai' })
  check('ext is created for a new save', !!state.ext && state.ext.salonName === 'Glow Salon')
  check('hiring waits for a second station', !hireCheck(state, 0).ok)
  reduce(state, 0, { a: 'buy', item: 'facial-chair-2' })
  check('second chair bought', state.stations.length === 2)
  const moneyBefore = state.money
  check('hire', reduce(state, 0, { a: 'hire', idx: 0 }) && ext(state).staff.length === 1)
  const staff = ext(state).staff[0]
  check('hire costs the fee', state.money === moneyBefore - candidatesFor(state.seed, 0)[0].fee)
  check('a candidate is hired once', !reduce(state, 0, { a: 'hire', idx: 0 }))
  check('a new hire takes the second chair', staff.station === 's1')
  check('staff can be renamed', reduce(state, 0, { a: 'renameStaff', id: staff.id, name: '  Bubbles <3 ' }) && staff.name === 'Bubbles 3')
  check('empty names are refused', !reduce(state, 0, { a: 'renameStaff', id: staff.id, name: '   ' }))
  check('campaign bought', reduce(state, 0, { a: 'campaign', id: 'flyers' }) && ext(state).campaigns.length === 1)
  reduce(state, 0, { a: 'petCat' })
  // Play the day with nobody at the chairs: staff take the second chair's customers.
  reduce(state, 0, { a: 'open' })
  runUntil(state, () => state.stats.served >= 1)
  check('staff finish treatments on their own', state.stats.served >= 1 && staff.served >= 1, { served: state.stats.served })
  check('staff stay off the players’ awards', !state.stats.byPlayer[staff.id])
  const rv = state.stats.reviews[0] as unknown as { staff: string; tags: string[]; voice: string }
  check('the review names who treated them', rv.staff === 'Bubbles 3' && Array.isArray(rv.tags) && typeof rv.voice === 'string')
  // Let the player's chair customers be finished by the player so the day can end.
  for (let i = 0; i < 4000 && state.phase !== 'receipt'; i++) {
    const s0 = state.stations[0]
    if (s0.customer !== null && s0.lead === null) {
      const c = state.customers.find(cu => cu.id === s0.customer)
      if (c && c.state === 'seated') reduce(state, 0, { a: 'work', station: 's0' })
    }
    if (s0.lead === 0) reduce(state, 0, { a: 'finish', station: 's0', result: result() })
    tick(state, 0.25)
  }
  check('the day ends', state.phase === 'receipt')
  const rec = receipt(state)
  check('the star histogram counts every review', ext(state).stars.reduce((a, b) => a + b, 0) === state.stats.served)
  check('wages are on the receipt', rec.wages === staff.wage && rec.net === rec.revenue + rec.tips - rec.costs - rec.wages)
  const persona = personaOf(state, state.schedule[0])
  check('persona readable from state', typeof persona.voice === 'string')

  // Saves carry the ext, and the next day advances campaigns once.
  const code = exportCode(toSave(state))
  const back = importCode(code)
  check('save code keeps staff and campaigns', back.ok && back.save.ext!.staff[0].name === 'Bubbles 3' && back.save.ext!.campaigns.length === 1)
  check('flyers bring customers tomorrow', extraCustomers(state) === 2)
  reduce(state, 0, { a: 'next' })
  check('next day plans the extra customers', state.schedule.length >= 5, state.schedule.length)
  check('campaign moved on a day', ext(state).campaigns[0]?.day === 1)
  const again = startDay(toSave(state), [])
  check('reloading the same day does not advance campaigns again', ext(again).campaigns[0]?.day === 1)
  check('an old save without ext still loads', validate({ ...toSave(state), ext: undefined })!.ext!.staff.length === 0)
  check('a broken ext is cleaned', validateExt({ staff: [{ nope: 1 }], campaigns: [{ id: 'bogus', day: 0 }], salonName: '<b>' }).staff.length === 0)

  // Walking away from a treatment leaves the customer seated for someone else.
  state = startDay({ ...newSave(7), money: 100 }, [])
  reduce(state, 0, { a: 'join', name: 'A' })
  reduce(state, 0, { a: 'open' })
  runUntil(state, () => state.customers.some(c => c.state === 'seated'))
  reduce(state, 0, { a: 'work', station: 's0' })
  reduce(state, 0, { a: 'stopWork', station: 's0' })
  tick(state, 0.1)
  check('a left treatment waits, seated', state.customers.find(c => c.station === 's0')?.state === 'seated')

  // Co-op: big hires wait for everyone.
  state = startDay({ ...newSave(99), money: 5000, owned: ['facial-chair-2'] }, [])
  reduce(state, 0, { a: 'join', name: 'A' })
  reduce(state, 1, { a: 'join', name: 'B' })
  const bigIdx = candidatesFor(99, 0).findIndex(c => c.fee >= 200)
  if (bigIdx >= 0) {
    reduce(state, 0, { a: 'hire', idx: bigIdx })
    check('a big hire asks the other player', ext(state).staff.length === 0 && ext(state).vote?.kind === 'hire')
    reduce(state, 1, { a: 'extVote', yes: true })
    check('both said yes: hired', ext(state).staff.length === 1 && ext(state).vote === null)
  }
  reduce(state, 0, { a: 'campaign', id: 'magazine' })
  check('a big campaign asks too', ext(state).vote?.kind === 'campaign')
  reduce(state, 1, { a: 'extVote', yes: false })
  check('a no cancels it', ext(state).vote === null && ext(state).campaigns.length === 0)
}
