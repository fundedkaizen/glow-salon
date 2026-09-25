import { FACIAL } from './facial.ts'
import { FEET } from './feet.ts'
import { NAILS } from './nails.ts'
import type { TreatmentDef, TreatmentId } from './types.ts'

export const TREATMENTS: Record<TreatmentId, TreatmentDef> = { facial: FACIAL, nails: NAILS, feet: FEET }

/**
 * Treatments planned after phase 1: each will be a data file like facial.ts plus its art. Listed so the
 * shop can show what is coming.
 */
export const COMING_SOON = ['Nose strip', 'Body scrub and wax', 'Brows', 'Lashes', 'Makeup', 'Ear care', 'Teeth whitening', 'Hair wash', 'Beard and shave', 'Massage', 'Scalp care'] as const

export type ComingSoon = (typeof COMING_SOON)[number]

/** What each coming treatment is, one line for the shop's teaser cards (their icons live in ui/salon-icons.ts). */
export const COMING_SOON_TEASER: Record<ComingSoon, string> = {
  'Nose strip': 'Press a pore strip on, let it set, then peel every blackhead off in one go.',
  'Body scrub and wax': 'Sugar scrub for arms and legs, then warm wax strips to pull.',
  'Brows': 'Tweeze the strays, tint, and shape the perfect arch.',
  'Lashes': 'Lift, tint and curl the lashes, one by one.',
  'Makeup': 'A soft glam look: base, blush, liner and a little shimmer.',
  'Ear care': 'A gentle clean with warm drops and a soft towel.',
  'Teeth whitening': 'A whitening tray, a blue light and a brighter smile.',
  'Hair wash': 'Shampoo, a scalp rinse and a fluffy towel dry.',
  'Beard and shave': 'Hot towel, rich lather and a clean razor shave.',
  'Massage': 'Warm oil and slow strokes for tired shoulders.',
  'Scalp care': 'Flakes off, a cooling tonic in, and a head massage.',
}
