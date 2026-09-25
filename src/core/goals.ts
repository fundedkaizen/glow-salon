import { makeRng } from './rng.ts'

/**
 * One relaxed goal a day ("Pop 12 pimples", "Earn three 5-star reviews"): optional, shown on the floor with
 * its progress, and worth a small cash reward when it is reached. Picked from the salon seed and the day,
 * so every player sees the same one, and sized to the day's customers so it is always within reach.
 */
export type GoalKind = 'popped' | 'extracted' | 'served' | 'fiveStars' | 'manicures' | 'tips' | 'pets'

export type DailyGoal = { kind: GoalKind; target: number; reward: number; text: string; done: boolean }

/** What the goals measure, read from the salon's day. */
export type GoalTally = Record<GoalKind, number>

/** The day so far, in the goals' terms (the host and every guest can work it out from the salon state). */
export function goalTally(state: {
  stats: { byPlayer: Record<number, { popped: number; extracted: number }>; reviews: readonly { stars: number; treatment: string }[]; served: number; tips: number }
  ext?: { today: { pets: number } }
}): GoalTally {
  const players = Object.values(state.stats.byPlayer)
  return {
    popped: players.reduce((a, p) => a + p.popped, 0),
    extracted: players.reduce((a, p) => a + p.extracted, 0),
    served: state.stats.served,
    fiveStars: state.stats.reviews.filter(r => r.stars >= 5).length,
    manicures: state.stats.reviews.filter(r => r.treatment === 'nails').length,
    tips: state.stats.tips,
    pets: state.ext?.today.pets ?? 0,
  }
}

export function goalFor(seed: number, day: number, customers: number, hasNails: boolean): DailyGoal {
  const r = makeRng((seed ^ Math.imul(day, 0x2c1b3c6d)) >>> 0)
  const kinds: GoalKind[] = ['popped', 'extracted', 'served', 'fiveStars', 'tips', 'pets']
  if (hasNails) kinds.push('manicures', 'manicures')
  // Day 1 keeps it simple: look after everyone.
  const kind: GoalKind = day === 1 ? 'served' : r.pick(kinds)
  const c = Math.max(3, customers)
  const target = kind === 'popped' ? 6 + 2 * Math.min(8, c - 2)
    : kind === 'extracted' ? 10 + 3 * Math.min(8, c - 2)
    : kind === 'served' ? c - 1
    : kind === 'fiveStars' ? Math.max(2, Math.round(c * 0.45))
    : kind === 'manicures' ? Math.max(1, Math.round(c * 0.3))
    : kind === 'tips' ? Math.round((c * 8) / 5) * 5
    : 3
  const reward = Math.round((20 + 4 * Math.min(20, day)) / 5) * 5
  return { kind, target, reward, text: goalText(kind, target), done: false }
}

export function goalText(kind: GoalKind, n: number): string {
  switch (kind) {
    case 'popped': return `Pop ${n} pimples`
    case 'extracted': return `Lift out ${n} blackheads`
    case 'served': return `Pamper ${n} customers`
    case 'fiveStars': return `Earn ${n} five-star reviews`
    case 'manicures': return n === 1 ? 'Paint a manicure' : `Paint ${n} manicures`
    case 'tips': return `Collect $${n} in tips`
    case 'pets': return `Pet the cat ${n} times`
  }
}
