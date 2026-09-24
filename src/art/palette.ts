import type { RGB } from './paint.ts'

/**
 * The look of Glow Salon: one pastel palette for the UI and the salon, and the character palettes the
 * customers' looks index into. Consistency is what reads as premium, so every colour comes from here.
 */
export const UI = {
  blush: 0xf7c6d4,
  blushDeep: 0xe98aa8,
  rose: 0xd9577f,
  mint: 0xbfeadb,
  mintDeep: 0x6fc9a9,
  lilac: 0xd9ccf5,
  lilacDeep: 0x9c86d9,
  cream: 0xfff7ee,
  butter: 0xfbe7b0,
  ink: 0x5a3a52,
  inkSoft: 0x8a6a80,
  white: 0xffffff,
}

export type SkinTone = { base: RGB; light: RGB; shadow: RGB; blush: RGB; lip: RGB; deep: RGB }

/** Six skin tones, light to deep, each with its own shadow, blush and lip colours. */
export const SKIN: SkinTone[] = [
  { base: [250, 222, 206], light: [255, 238, 228], shadow: [222, 168, 150], blush: [246, 150, 150], lip: [226, 128, 132], deep: [180, 110, 100] },
  { base: [243, 204, 178], light: [252, 226, 206], shadow: [212, 148, 122], blush: [240, 136, 128], lip: [214, 112, 112], deep: [168, 96, 80] },
  { base: [230, 180, 144], light: [244, 206, 174], shadow: [192, 128, 96], blush: [228, 122, 104], lip: [196, 98, 94], deep: [150, 84, 62] },
  { base: [204, 146, 106], light: [224, 174, 134], shadow: [160, 100, 70], blush: [206, 104, 84], lip: [172, 84, 78], deep: [122, 66, 46] },
  { base: [158, 104, 70], light: [186, 132, 94], shadow: [118, 72, 46], blush: [170, 86, 70], lip: [132, 68, 62], deep: [88, 50, 34] },
  { base: [112, 72, 48], light: [140, 96, 68], shadow: [80, 48, 32], blush: [134, 66, 56], lip: [102, 54, 50], deep: [62, 36, 24] },
]

/** Hair colours: base and highlight. */
export const HAIR: { base: RGB; light: RGB; dark: RGB }[] = [
  { base: [48, 36, 42], light: [104, 86, 96], dark: [24, 16, 22] },
  { base: [82, 52, 40], light: [150, 104, 80], dark: [44, 26, 20] },
  { base: [128, 80, 50], light: [196, 142, 98], dark: [76, 44, 26] },
  { base: [168, 76, 48], light: [226, 138, 96], dark: [104, 40, 24] },
  { base: [224, 186, 118], light: [250, 226, 170], dark: [170, 130, 70] },
  { base: [236, 224, 206], light: [255, 250, 240], dark: [190, 174, 150] },
  { base: [240, 160, 190], light: [255, 210, 226], dark: [198, 108, 146] },
  { base: [182, 160, 226], light: [222, 208, 250], dark: [126, 104, 178] },
]

/** Outfit and headband colours, pastel. */
export const OUTFIT: number[] = [0xf7b7c9, 0xa9e3cf, 0xcdbdf2, 0xfbd9a0, 0x9fd0f2, 0xf5a99a, 0xb6e39c, 0xf2c4e8]

/** Players' colours by number (host first): rose, mint, lilac, butter. */
export const PLAYER_COLORS = [0xe7799c, 0x4fbf98, 0x9f86e0, 0xe9b45a]
export const PLAYER_CSS = PLAYER_COLORS.map(c => `#${c.toString(16).padStart(6, '0')}`)

export const css = (c: number) => `#${c.toString(16).padStart(6, '0')}`
