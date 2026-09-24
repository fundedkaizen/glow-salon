import { FACIAL } from './facial.ts'
import { NAILS } from './nails.ts'
import type { TreatmentDef, TreatmentId } from './types.ts'

export const TREATMENTS: Record<TreatmentId, TreatmentDef> = { facial: FACIAL, nails: NAILS }

/**
 * Treatments planned after phase 1: each will be a data file like facial.ts plus its art. Listed so the
 * shop can show what is coming.
 */
export const COMING_SOON = ['Foot spa', 'Nose strip', 'Body scrub and wax', 'Brows', 'Lashes', 'Makeup', 'Ear care', 'Teeth whitening', 'Hair wash', 'Beard and shave', 'Massage', 'Scalp care'] as const
