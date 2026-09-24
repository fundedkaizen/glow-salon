import { clamp } from './geometry.ts'
import { makeRng } from './rng.ts'
import type { TreatmentResult } from './treatments/session.ts'

/** A Google-style review card on the end-of-day receipt. */
export type Review = {
  id: string
  day: number
  name: string
  stars: number
  text: string
  treatment: string
  regular: boolean
  disaster: boolean
}

export type Rating = { sum: number; count: number }

/** The average, to one decimal, as Google shows it. 0 when there are no reviews yet. */
export function average(rating: Rating) { return rating.count ? Math.round((rating.sum / rating.count) * 10) / 10 : 0 }

export function addReview(rating: Rating, stars: number): Rating { return { sum: rating.sum + stars, count: rating.count + 1 } }

/**
 * Stars from how the visit went: thoroughness counts most, then speed against par, then the wait (mood),
 * then the salon itself. 1 to 5, whole stars.
 */
export function starsFor(result: Pick<TreatmentResult, 'thoroughness' | 'seconds' | 'par'>, mood: number, ambience: number) {
  const speed = speedScore(result.seconds, result.par)
  const score = 0.55 * result.thoroughness + 0.2 * speed + 0.17 * clamp(mood) + 0.08 * clamp((ambience - 1) / 4)
  return clamp(Math.round(1 + score * 4.35), 1, 5)
}

/** 1 when at or under par, falling off gently to 0 at three times par. */
export function speedScore(seconds: number, par: number) {
  if (seconds <= par) return 1
  return clamp(1 - (seconds - par) / (2 * par))
}

const TREATMENT_WORD: Record<string, string> = { facial: 'facial', nails: 'manicure' }

/** A short review in the customer's voice, reacting to how thorough and how fast the visit was. */
export function writeReview(options: { id: string; day: number; name: string; stars: number; result: TreatmentResult; mood: number; regular: boolean; disaster: boolean; ambience: number; seed: number }): Review {
  const r = makeRng(options.seed)
  const { result, stars } = options
  const word = TREATMENT_WORD[result.treatment] ?? 'treatment'
  const speed = speedScore(result.seconds, result.par)
  const parts: string[] = []
  if (options.disaster) parts.push(r.pick([`I walked in a total mess and walked out glowing.`, `My skin was a disaster and they didn't even blink.`, `Honestly a miracle worker.`]))
  else if (options.regular) parts.push(r.pick([`Back again, and it never gets old.`, `My usual spot, and still the best.`, `Came back for my regular ${word}.`]))
  if (stars >= 5) parts.push(r.pick([`The ${word} was perfect, every single step.`, `Best ${word} of my life.`, `Ten out of ten, I'm glowing.`, `Absolute perfection, I felt so pampered.`]))
  else if (stars === 4) parts.push(r.pick([`Lovely ${word}, I left very happy.`, `Really good ${word}, cozy vibes.`, `Great job, I'd happily come back.`]))
  else if (stars === 3) parts.push(r.pick([`A decent ${word}.`, `Nice enough, a few things missed.`, `Okay ${word}, not the full glow-up.`]))
  else parts.push(r.pick([`Not quite what I hoped for.`, `It felt a bit rushed.`, `They skipped a lot.`]))
  if (result.skipped >= 2) parts.push(r.pick([`They skipped a few steps.`, `Felt rushed, some steps got skipped.`]))
  else if (result.thoroughness >= 0.95) parts.push(r.pick([`So thorough, they didn't miss a single pore.`, `Every detail done properly.`]))
  if (result.popped >= 6) parts.push(r.pick([`The extractions were SO satisfying.`, `Every pimple, gone.`]))
  if (result.fourHands) parts.push(r.pick([`Two people worked on me at once. Luxury!`, `Four hands on one face, amazing teamwork.`]))
  if (result.wishMatched === true) parts.push(`Got exactly the colour I asked for.`)
  else if (result.wishMatched === false) parts.push(r.pick([`Not the colour I asked for, but still cute.`, `Different colour than I wanted, oh well.`]))
  if (speed >= 1 && result.thoroughness >= 0.85) parts.push(r.pick([`Quick too!`, `And super quick.`]))
  else if (speed < 0.5) parts.push(r.pick([`Took a long time though.`, `A bit slow, but worth it.`]))
  if (options.mood < 0.45) parts.push(r.pick([`The wait on the sofa was long.`, `Waited quite a while first.`]))
  if (options.ambience >= 4 && r.chance(0.6)) parts.push(r.pick([`The salon is gorgeous.`, `Such a pretty little salon.`]))
  const text = parts.slice(0, 3).join(' ')
  return { id: options.id, day: options.day, name: options.name, stars, text, treatment: result.treatment, regular: options.regular, disaster: options.disaster }
}
