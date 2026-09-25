import { WORLD_DATA } from '../content/world.ts'
import type { Item } from './economy.ts'

/**
 * Decor sets from the world content (Pastel Pop, Zen Garden, Luxe Gold...): six items each, bought one by
 * one from the computer, placed in the salon's decor slots, and worth ambience (tips and stars). A full set
 * adds a bonus. Each set opens once one item of the set before it is owned, so decor is a path to walk.
 */
export type DecorPlace = 'wall' | 'floor' | 'rug' | 'ceiling' | 'table' | 'window'

/** How an item is drawn: a shape, painted in its set's palette. */
export type DecorKind =
  | 'armchair' | 'sofa' | 'bench' | 'lamp' | 'lantern' | 'chandelier' | 'disco' | 'shelf' | 'mirror' | 'neon'
  | 'frame' | 'wreath' | 'clock' | 'rug' | 'sand' | 'screen' | 'fountain' | 'plant' | 'palm' | 'bonsai'
  | 'counter' | 'cart' | 'hammock' | 'bowl' | 'teapot' | 'cabinet' | 'jukebox' | 'curtains' | 'vinyl' | 'sign'

export type DecorItemDef = { id: string; set: string; label: string; kind: DecorKind; place: DecorPlace; size: 1 | 2 }

export type DecorSet = { id: string; label: string; bonus: string; palette: number[]; basePrice: number; items: DecorItemDef[] }

/** The shape and place of every item in the content, by name. */
const SHAPES: Record<string, [DecorKind, DecorPlace, 1 | 2]> = {
  'candy sofa': ['sofa', 'floor', 2], 'bubble lamp': ['lamp', 'floor', 1], 'macaron shelf': ['shelf', 'wall', 1], 'pastel rug': ['rug', 'rug', 1], 'heart mirror': ['mirror', 'wall', 1], 'cloud neon': ['neon', 'wall', 1],
  'bamboo screen': ['screen', 'floor', 1], 'stone fountain': ['fountain', 'floor', 2], 'bonsai': ['bonsai', 'table', 1], 'tatami bench': ['bench', 'floor', 1], 'paper lantern': ['lantern', 'ceiling', 1], 'sand garden': ['sand', 'rug', 1],
  'velvet armchair': ['armchair', 'floor', 1], 'gold mirror': ['mirror', 'wall', 1], 'chandelier': ['chandelier', 'ceiling', 2], 'marble counter': ['counter', 'floor', 2], 'champagne cart': ['cart', 'floor', 1], 'gilded frame': ['frame', 'wall', 1],
  'palm plant': ['palm', 'floor', 1], 'rattan chair': ['armchair', 'floor', 1], 'surf sign': ['sign', 'wall', 1], 'hammock': ['hammock', 'floor', 2], 'fruit bowl': ['bowl', 'table', 1], 'tiki lamp': ['lamp', 'floor', 1],
  'jukebox': ['jukebox', 'floor', 2], 'checker floor': ['rug', 'rug', 2], 'red booth': ['sofa', 'floor', 2], 'neon clock': ['clock', 'wall', 1], 'milkshake counter': ['counter', 'floor', 2], 'vinyl wall': ['vinyl', 'wall', 1],
  'floral armchair': ['armchair', 'floor', 1], 'dried flower wreath': ['wreath', 'wall', 1], 'wooden dresser': ['counter', 'floor', 1], 'lace curtains': ['curtains', 'window', 1], 'herb shelf': ['shelf', 'wall', 1], 'teapot set': ['teapot', 'table', 1],
  'neon sign': ['neon', 'wall', 1], 'led mirror': ['mirror', 'wall', 1], 'glossy black chair': ['armchair', 'floor', 1], 'holo rug': ['rug', 'rug', 1], 'arcade cabinet': ['cabinet', 'floor', 2], 'disco ball': ['disco', 'ceiling', 1],
}

/** Each set's colours: main, second, accent, trim. */
const PALETTES: Record<string, number[]> = {
  'pastel-pop': [0xf7b7cc, 0xa9e3cf, 0xcdbdf2, 0xfbe0a0],
  'zen-garden': [0xb9cfa4, 0xd9c29a, 0xa9a39b, 0xf6efe0],
  'luxe-gold': [0x8e4a78, 0xe6c068, 0xf4efe9, 0xf1dcae],
  'tropical': [0x6cc08e, 0xd8b27c, 0xf59a82, 0x7fd4d4],
  'retro-diner': [0xe25a64, 0xfbeedd, 0x7fd0c0, 0xcfd6de],
  'cottagecore': [0xf3dde0, 0xa9c49a, 0xb88a64, 0xc7b3e6],
  'neon-night': [0x3a2f4d, 0xff5fa8, 0x5fe3f0, 0xa98bff],
}

/** Sets in the order they open, with the price of a medium item. */
const ORDER: [string, number][] = [['pastel-pop', 60], ['cottagecore', 75], ['tropical', 90], ['zen-garden', 105], ['retro-diner', 120], ['neon-night', 140], ['luxe-gold', 170]]

const slug = (label: string) => label.toLowerCase().replace(/[^a-z0-9]+/g, '-')

export const DECOR_SETS: DecorSet[] = ORDER.map(([id, basePrice]) => {
  const set = WORLD_DATA.decorSets.find(s => s.id === id)!
  return {
    id, label: set.label, bonus: set.bonus, palette: PALETTES[id], basePrice,
    items: set.items.map(label => {
      const [kind, place, size] = SHAPES[label] ?? ['plant', 'floor', 1]
      return { id: `${id}:${slug(label)}`, set: id, label, kind, place, size }
    }),
  }
})

export const DECOR_ITEM_BY_ID: Record<string, DecorItemDef> = Object.fromEntries(DECOR_SETS.flatMap(s => s.items.map(i => [i.id, i])))
export const DECOR_SET_BY_ID: Record<string, DecorSet> = Object.fromEntries(DECOR_SETS.map(s => [s.id, s]))

/** Ambience a completed set adds on top of its items. */
export const SET_BONUS = 3

function priceOf(set: DecorSet, item: DecorItemDef) {
  const mult = item.size === 2 ? 1.6 : item.place === 'table' || item.place === 'wall' ? 0.8 : item.place === 'ceiling' || item.place === 'rug' ? 1.2 : 1
  return Math.round((set.basePrice * mult) / 5) * 5
}

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** The shop items for every set item. Opening a set needs its cheapest-item gateway from the set before. */
export const DECOR_SET_ITEMS: Item[] = DECOR_SETS.flatMap((set, i) => {
  const prev = DECOR_SETS[i - 1]
  const gateway = prev ? prev.items.reduce((a, b) => (priceOf(prev, b) < priceOf(prev, a) ? b : a)) : null
  return set.items.map(item => ({
    id: item.id,
    tab: 'decor' as const,
    name: titleCase(item.label),
    blurb: `${set.label} set. +${item.size} ambience.`,
    price: priceOf(set, item),
    needs: gateway ? [gateway.id] : undefined,
    effect: { kind: 'decor' as const, ambience: item.size, prop: item.id },
  }))
})

/** Sets the salon owns every item of. */
export function completeSets(owned: readonly string[]): string[] {
  return DECOR_SETS.filter(s => s.items.every(i => owned.includes(i.id))).map(s => s.id)
}

/** Bonus ambience from completed sets. */
export function setBonus(owned: readonly string[]) { return completeSets(owned).length * SET_BONUS }

/** Where each kind of item can go on the salon floor (world pixels of the 1280 x 800 room). */
export const DECOR_SLOTS: Record<DecorPlace, { x: number; y: number }[]> = {
  wall: [{ x: 402, y: 66 }, { x: 612, y: 66 }, { x: 862, y: 68 }, { x: 1058, y: 68 }],
  floor: [{ x: 700, y: 222 }, { x: 862, y: 222 }, { x: 1060, y: 222 }, { x: 600, y: 766 }, { x: 44, y: 752 }, { x: 1236, y: 764 }],
  rug: [{ x: 960, y: 486 }, { x: 212, y: 470 }, { x: 600, y: 700 }],
  ceiling: [{ x: 862, y: 58 }, { x: 330, y: 58 }, { x: 1060, y: 58 }],
  table: [{ x: 150, y: 206 }, { x: 352, y: 226 }],
  window: [{ x: 0, y: 0 }],
}

/**
 * Which owned set items are on show, slot by slot: the most recently placed (or bought) of each kind wins
 * a slot; the rest wait in storage until placed again. `order` is the placement history, newest last.
 */
export function placeDecor(owned: readonly string[], order: readonly string[]): { id: string; place: DecorPlace; slot: number; x: number; y: number }[] {
  const items = owned.filter(id => DECOR_ITEM_BY_ID[id])
  // Newest first: placed items by their last placement, then bought items by purchase order.
  const rank = (id: string) => { const p = order.lastIndexOf(id); return p >= 0 ? 10000 + p : owned.indexOf(id) }
  items.sort((a, b) => rank(b) - rank(a))
  const used: Record<string, number> = {}
  const out: { id: string; place: DecorPlace; slot: number; x: number; y: number }[] = []
  for (const id of items) {
    const place = DECOR_ITEM_BY_ID[id].place
    const n = used[place] ?? 0
    const slots = DECOR_SLOTS[place]
    if (n >= slots.length) continue
    used[place] = n + 1
    out.push({ id, place, slot: n, ...slots[n] })
  }
  return out
}
