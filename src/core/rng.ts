/** A small seeded random generator (mulberry32), so a day, a customer or a face can be rebuilt from a seed. */
export type Rng = {
  (): number
  int(min: number, max: number): number
  range(min: number, max: number): number
  pick<T>(items: readonly T[]): T
  chance(p: number): boolean
  seed(): number
}

export function makeRng(seed: number): Rng {
  let s = seed >>> 0
  const next = (() => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }) as Rng
  next.int = (min, max) => min + Math.floor(next() * (max - min + 1))
  next.range = (min, max) => min + next() * (max - min)
  next.pick = items => items[Math.floor(next() * items.length)]
  next.chance = p => next() < p
  next.seed = () => Math.floor(next() * 2 ** 31)
  return next
}

/** A stable hash of a string, for seeds. */
export function hashString(text: string) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}
