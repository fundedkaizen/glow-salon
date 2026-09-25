import { makeRng } from '../rng.ts'
import { footProfile, type FootProfile } from '../foot.ts'
import { POLISH_COLORS } from './types.ts'

/**
 * Every customer's problem, generated from their seed so no two play the same: how dirty, how oily, how
 * many pimples and of which kinds, where they cluster; for hands, how long, what old polish, what damage.
 * The session seeds its layers and targets from this; the art draws age lines and small feature differences
 * from it; the view varies reactions and splatter with it. Pure and deterministic, so co-op partners build
 * the same customer.
 */
export type Personality = 'calm' | 'ticklish' | 'sensitive'

export type Cluster = 'forehead' | 'tzone' | 'chin' | 'cheeks' | 'scattered'

export type FaceProfile = {
  kind: 'face'
  /** 0 is clean; 2 is a disaster. */
  grime: number
  oil: number
  redness: number
  /** Dry, flaky patches. */
  flakes: number
  whiteheads: number
  /** Deep pimples that need two squeezes. */
  deep: number
  cluster: Cluster
  blackheads: number
  /** Fine lines, 0 to 1. */
  age: number
  /** How much a pop splatters. */
  juicy: number
  /** How big the foam gets. */
  foamy: number
  personality: Personality
  /** Small art differences, each 0 to 1: brow weight, lip fullness, lash length, blush, nose tip. */
  features: { brow: number; lips: number; lashes: number; blush: number; nose: number }
}

export type NailPattern = 'plain' | 'french' | 'glitter' | 'twoTone' | 'dots'

export type HandProfile = {
  kind: 'hand'
  /** Free-edge length past the fingertip, per finger; 0 means already short (nothing to clip). */
  grown: number[]
  /** Fingers with a broken, jagged nail. */
  broken: number[]
  polish: { color: number; second: number; pattern: NailPattern; chips: number } | null
  /** Dirt under the nails, 0 to 1. */
  dirt: number
  /** Cuticle overgrowth, 0.2 to 1. */
  cuticle: number
  hangnails: number
  /** Dry skin on the knuckles, 0 to 1. */
  dry: number
  personality: Personality
}

export type Profile = FaceProfile | HandProfile | FootProfile
export type { FootProfile }

const PERSONALITIES: Personality[] = ['calm', 'ticklish', 'sensitive']

export function faceProfile(seed: number, disaster: boolean): FaceProfile {
  const r = makeRng(seed ^ 0x5eed)
  const bad = disaster ? 1 : 0
  // Some customers come in nearly clean; a few are rough days.
  const clean = !disaster && r.chance(0.15)
  // About half come in with congested pores (whiteheads, blackheads) and book the Deep Pore Facial; the rest
  // have clear pores and come for a mask or a glow. Its own stream, so every other feature stays as it was.
  const congested = disaster || makeRng(seed ^ 0xc0de).chance(0.55)
  const grime = disaster ? r.range(1.6, 2) : clean ? 0 : r.range(0.35, 1.2)
  const oil = disaster ? r.range(1, 1.5) : r.range(0, 1.1)
  const redness = disaster ? r.range(0.9, 1.4) : r.range(0.1, 1)
  const flakes = disaster ? r.range(0.6, 1) : r.chance(0.4) ? r.range(0.2, 0.8) : 0
  const whiteheads = disaster ? r.int(9, 13) : r.chance(0.1) ? 0 : r.int(2, 8)
  const deep = disaster ? r.int(2, 4) : r.chance(0.45) ? r.int(1, 2) : 0
  const cluster = r.pick(['forehead', 'tzone', 'chin', 'cheeks', 'scattered'] as const)
  // Each blackhead is its own careful press of the loop, so a nose has a handful, not a crowd.
  const blackheads = disaster ? r.int(12, 16) : r.chance(0.1) ? r.int(0, 3) : r.int(5, 11)
  return {
    kind: 'face',
    grime,
    oil,
    redness,
    flakes,
    whiteheads: congested ? whiteheads : 0,
    deep: congested ? deep : 0,
    cluster,
    blackheads: congested ? blackheads : 0,
    age: r.chance(0.35) ? r.range(0.3, 1) : r.range(0, 0.2),
    juicy: r.range(0.6, 1.4) + bad * 0.2,
    foamy: r.range(0.7, 1.3),
    personality: r.pick(PERSONALITIES),
    features: { brow: r(), lips: r(), lashes: r(), blush: r(), nose: r() },
  }
}

export function handProfile(seed: number, disaster: boolean): HandProfile {
  const r = makeRng(seed ^ 0x4a11)
  const broken = disaster ? [r.int(0, 4), r.int(0, 4)] : r.chance(0.25) ? [r.int(0, 4)] : []
  const longNails = disaster || r.chance(0.8)
  const grown = [0, 1, 2, 3, 4].map(i => (broken.includes(i) || !longNails || r.chance(0.12) ? 0 : r.range(22, disaster ? 48 : 42)))
  const polished = disaster || r.chance(0.82)
  return {
    kind: 'hand',
    grown,
    broken: [...new Set(broken)],
    polish: polished ? { color: r.int(0, POLISH_COLORS.length - 1), second: r.int(0, POLISH_COLORS.length - 1), pattern: r.pick(['plain', 'plain', 'french', 'glitter', 'twoTone', 'dots'] as const), chips: disaster ? r.range(0.6, 1) : r.range(0.2, 0.8) } : null,
    dirt: disaster ? r.range(0.7, 1) : r.chance(0.35) ? r.range(0.2, 0.7) : 0,
    cuticle: disaster ? r.range(0.8, 1) : r.range(0.25, 0.9),
    hangnails: disaster ? r.int(3, 4) : r.int(0, 3),
    dry: disaster ? r.range(0.7, 1) : r.chance(0.5) ? r.range(0.2, 0.7) : 0,
    personality: r.pick(PERSONALITIES),
  }
}

export function profileFor(bodyPart: 'face' | 'hand' | 'foot', seed: number, disaster: boolean): Profile {
  return bodyPart === 'face' ? faceProfile(seed, disaster) : bodyPart === 'foot' ? footProfile(seed, disaster) : handProfile(seed, disaster)
}
