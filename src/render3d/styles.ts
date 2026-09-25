import { DECOR_ITEM_BY_ID, DECOR_SET_BY_ID } from '../core/decor.ts'
import { ITEM_BY_ID } from '../core/economy.ts'
import { styleOf } from '../core/unlocks.ts'

/**
 * The three looks of every piece in the 3D salon (core/unlocks.ts keeps which one each piece wears). Until the
 * modelled variants arrive, a style is a colourway: the stations' upholstery, the lounge's velvet, the reception's
 * band, a decor set piece's palette turned round.
 */
export const STYLE_COLORS: Record<string, [number, number, number]> = {
  facial: [0xf2798f, 0xa78be8, 0x4fc3c0],
  feet: [0xa78be8, 0xf58aa0, 0x6fb3ec],
  nails: [0xffc94d, 0x6fd6bf, 0xf59ab8],
  lounge: [0x6fd0c0, 0xf4a3bd, 0xf7c96b],
  desk: [0xf8cad8, 0xa9e3cf, 0xcdbdf2],
  pot: [0xf2e6df, 0xf6b6c8, 0xa9e3cf],
  rug: [0xf3c9da, 0xa9e3cf, 0xfbd9a0],
}

/** The names of the three looks, for the style cards. */
export const STYLE_NAMES: Record<string, [string, string, string]> = {
  facial: ['Rose', 'Lilac', 'Lagoon'],
  feet: ['Lavender', 'Coral', 'Sky'],
  nails: ['Sunshine', 'Mint', 'Candy'],
  lounge: ['Teal', 'Blush', 'Honey'],
  desk: ['Blush', 'Mint', 'Lilac'],
  pot: ['Cream', 'Pink', 'Mint'],
  rug: ['Blush', 'Mint', 'Butter'],
}

/** Which family of looks a styleable piece uses. */
export function styleFamily(key: string): string {
  if (key === 'desk' || key === 'lounge') return key
  if (key === 'facial-chair-1') return 'facial'
  const e = ITEM_BY_ID[key]?.effect
  if (e?.kind === 'station') return e.station
  if (DECOR_ITEM_BY_ID[key]) return 'set'
  if (key === 'rug') return 'rug'
  return 'pot'
}

/** A piece's colour for its chosen style. */
export function styleColor(styles: Record<string, number> | undefined, key: string): number {
  const fam = styleFamily(key)
  return (STYLE_COLORS[fam] ?? STYLE_COLORS.pot)[styleOf(styles, key)]
}

/** A decor set piece's palette, turned round by its style (main, second, accent; the trim stays). */
export function setPalette(styles: Record<string, number> | undefined, id: string): number[] {
  const set = DECOR_SET_BY_ID[DECOR_ITEM_BY_ID[id]?.set ?? '']
  const p = set ? set.palette : [0xf7b7cc, 0xa9e3cf, 0xcdbdf2, 0xfbe0a0]
  const s = styleOf(styles, id)
  return s === 0 ? p : s === 1 ? [p[1], p[2], p[0], p[3]] : [p[2], p[0], p[1], p[3]]
}

/** The label of a style, for its card. */
export function styleName(key: string, style: number): string {
  const fam = styleFamily(key)
  if (fam === 'set') return ['Classic', 'Twist', 'Bold'][style] ?? 'Classic'
  return (STYLE_NAMES[fam] ?? STYLE_NAMES.pot)[style] ?? ''
}
