import type { TreatmentId } from './treatments/types.ts'
import { DECOR_SET_ITEMS, GIFT_ITEMS, setBonus } from './decor.ts'

/**
 * The shop on the salon computer, and every number that turns purchases into income. Linear and readable:
 * something affordable every day, a bigger item about every third day.
 */
export type ShopTab = 'tools' | 'stations' | 'treatments' | 'decor' | 'marketing' | 'staff'

export type Item = {
  id: string
  tab: ShopTab
  name: string
  blurb: string
  price: number
  /** Items that must be owned first. */
  needs?: string[]
  /** What it does. */
  effect:
    | { kind: 'toolTier'; treatment: TreatmentId; tier: number }
    | { kind: 'station'; station: StationKind }
    | { kind: 'treatment'; treatment: TreatmentId }
    | { kind: 'decor'; ambience: number; prop: string }
    | { kind: 'marketing'; customers: number; wealth: number }
    | { kind: 'staff' }
  /** Phase 2: shown but not for sale yet. */
  soon?: boolean
  /** A regular's gift: never for sale, owned when their friendship reaches 5. */
  gift?: boolean
  /** Also given when bought (the nail bar comes with its desk). */
  includes?: string[]
  /** The day it arrives in the shop: something new turns up every few days. */
  unlockDay?: number
}

export type StationKind = 'facial' | 'nails'

/** Items at or above this price need every player in the salon to agree. */
export const CONFIRM_PRICE = 200
export const START_MONEY = 60
/** Customers on day 1 (day 2 brings one more, then the salon grows with its stations). */
export const BASE_CUSTOMERS = 4

export const ITEMS: Item[] = [
  // Tools: faster, prettier.
  { id: 'facial-kit-2', tab: 'tools', name: 'Pro facial kit', blurb: 'Bigger brushes and a stronger loop. Facials go 50% faster and look prettier.', price: 140, unlockDay: 3, effect: { kind: 'toolTier', treatment: 'facial', tier: 2 } },
  { id: 'facial-kit-3', tab: 'tools', name: 'Luxe facial kit', blurb: 'Rose-gold tools. Facials go twice as fast, with sparkle trails.', price: 520, needs: ['facial-kit-2'], unlockDay: 12, effect: { kind: 'toolTier', treatment: 'facial', tier: 3 } },
  { id: 'facial-kit-4', tab: 'tools', name: 'Diamond facial kit', blurb: 'The best tools money can buy. The quickest, sparkliest facials in town.', price: 1500, needs: ['facial-kit-3'], unlockDay: 27, effect: { kind: 'toolTier', treatment: 'facial', tier: 4 } },
  { id: 'nail-kit-2', tab: 'tools', name: 'Pro nail kit', blurb: 'Precision files and brushes. Manicures go 50% faster.', price: 120, needs: ['treat-nails'], unlockDay: 6, effect: { kind: 'toolTier', treatment: 'nails', tier: 2 } },
  { id: 'nail-kit-3', tab: 'tools', name: 'Luxe nail kit', blurb: 'Salon-grade everything. Manicures go twice as fast.', price: 480, needs: ['nail-kit-2'], unlockDay: 18, effect: { kind: 'toolTier', treatment: 'nails', tier: 3 } },
  { id: 'nail-kit-4', tab: 'tools', name: 'Diamond nail kit', blurb: 'Crystal files and a studio lamp. Manicures fly.', price: 1300, needs: ['nail-kit-3'], unlockDay: 30, effect: { kind: 'toolTier', treatment: 'nails', tier: 4 } },
  // Stations.
  { id: 'facial-chair-2', tab: 'stations', name: 'Second facial chair', blurb: 'Two facials at once, or one each in co-op.', price: 300, unlockDay: 4, effect: { kind: 'station', station: 'facial' } },
  { id: 'nail-desk', tab: 'stations', name: 'Nail desk', blurb: 'A pastel desk for manicures.', price: 180, needs: ['treat-nails'], effect: { kind: 'station', station: 'nails' } },
  { id: 'nail-desk-2', tab: 'stations', name: 'Second nail desk', blurb: 'More manicures, shorter waits.', price: 380, needs: ['nail-desk'], unlockDay: 9, effect: { kind: 'station', station: 'nails' } },
  { id: 'facial-chair-3', tab: 'stations', name: 'Third facial chair', blurb: 'For a busy salon.', price: 520, needs: ['facial-chair-2'], unlockDay: 15, effect: { kind: 'station', station: 'facial' } },
  { id: 'nail-desk-3', tab: 'stations', name: 'Third nail desk', blurb: 'A whole nail bar. More regulars, more gems.', price: 820, needs: ['nail-desk-2'], unlockDay: 21, effect: { kind: 'station', station: 'nails' } },
  { id: 'facial-chair-4', tab: 'stations', name: 'Fourth facial chair', blurb: 'The full spa row, in the front of the salon.', price: 1000, needs: ['facial-chair-3'], unlockDay: 24, effect: { kind: 'station', station: 'facial' } },
  // Treatments.
  { id: 'treat-nails', tab: 'treatments', name: 'Nail bar', blurb: 'Manicures, with a pastel nail desk to do them at: soak, clip, file, polish and gems.', price: 200, includes: ['nail-desk'], effect: { kind: 'treatment', treatment: 'nails' } },
  // Decor: ambience stars raise tips.
  { id: 'plant', tab: 'decor', name: 'Monstera plant', blurb: 'A big leafy friend. +1 ambience.', price: 45, effect: { kind: 'decor', ambience: 1, prop: 'plant' } },
  { id: 'candles', tab: 'decor', name: 'Scented candles', blurb: 'Vanilla and fig. +1 ambience.', price: 60, effect: { kind: 'decor', ambience: 1, prop: 'candles' } },
  { id: 'rug', tab: 'decor', name: 'Cloud rug', blurb: 'Soft underfoot. +1 ambience.', price: 90, effect: { kind: 'decor', ambience: 1, prop: 'rug' } },
  { id: 'lights', tab: 'decor', name: 'Fairy lights', blurb: 'A warm twinkle. +1 ambience.', price: 110, effect: { kind: 'decor', ambience: 1, prop: 'lights' } },
  { id: 'art', tab: 'decor', name: 'Wall art', blurb: 'Pastel prints. +1 ambience.', price: 150, effect: { kind: 'decor', ambience: 1, prop: 'art' } },
  { id: 'neon', tab: 'decor', name: 'Neon "glow" sign', blurb: 'Very Instagram. +2 ambience.', price: 240, effect: { kind: 'decor', ambience: 2, prop: 'neon' } },
  { id: 'aquarium', tab: 'decor', name: 'Aquarium', blurb: 'Tiny fish, big calm. +2 ambience.', price: 400, effect: { kind: 'decor', ambience: 2, prop: 'aquarium' } },
  { id: 'chandelier', tab: 'decor', name: 'Crystal chandelier', blurb: 'Pure luxury. +3 ambience.', price: 600, effect: { kind: 'decor', ambience: 3, prop: 'chandelier' } },
  // Marketing: more customers, richer ones.
  { id: 'flyers', tab: 'marketing', name: 'Flyers', blurb: '+1 customer a day.', price: 70, effect: { kind: 'marketing', customers: 1, wealth: 0 } },
  { id: 'social', tab: 'marketing', name: 'Social posts', blurb: '+1 customer a day, and they pay 10% more.', price: 180, needs: ['flyers'], effect: { kind: 'marketing', customers: 1, wealth: 0.1 } },
  { id: 'influencer', tab: 'marketing', name: 'Influencer visit', blurb: '+1 customer a day, and they pay 20% more.', price: 450, needs: ['social'], effect: { kind: 'marketing', customers: 1, wealth: 0.2 } },
  { id: 'billboard', tab: 'marketing', name: 'Billboard', blurb: '+2 customers a day, and they pay 15% more.', price: 800, needs: ['influencer'], effect: { kind: 'marketing', customers: 2, wealth: 0.15 } },
  // Staff: phase 2.
  { id: 'gadget-steamer', tab: 'staff', name: 'Auto steamer', blurb: 'A gadget that does the steam towel step for you.', price: 300, effect: { kind: 'staff' }, soon: true },
  { id: 'gadget-uv', tab: 'staff', name: 'Smart UV lamp', blurb: 'Cures the polish by itself.', price: 260, effect: { kind: 'staff' }, soon: true },
  { id: 'stylist', tab: 'staff', name: 'Hire a stylist', blurb: 'Runs whole treatments at slightly lower quality.', price: 900, effect: { kind: 'staff' }, soon: true },
  // Decor sets from the world content (decor.ts), and the regulars' gifts.
  ...DECOR_SET_ITEMS,
  ...GIFT_ITEMS,
]

export const ITEM_BY_ID: Record<string, Item> = Object.fromEntries(ITEMS.map(item => [item.id, item]))

export type Owned = readonly string[]

export function owns(owned: Owned, id: string) { return owned.includes(id) }

export type BuyCheck = { ok: true } | { ok: false; reason: string }

/** `day`: today, for items that arrive in the shop later (left out, everything counts as arrived). */
export function canBuy(owned: Owned, money: number, id: string, day = Infinity): BuyCheck {
  const item = ITEM_BY_ID[id]
  if (!item) return { ok: false, reason: 'Unknown item' }
  if (item.soon) return { ok: false, reason: 'Coming soon' }
  if (owns(owned, id)) return { ok: false, reason: 'Owned' }
  if (item.gift) return { ok: false, reason: 'A gift from a friend' }
  if (item.unlockDay && day < item.unlockDay) return { ok: false, reason: `Arrives on day ${item.unlockDay}` }
  const missing = (item.needs ?? []).filter(n => !owns(owned, n))
  if (missing.length) return { ok: false, reason: `Needs ${ITEM_BY_ID[missing[0]].name}` }
  if (money < item.price) return { ok: false, reason: `Needs $${item.price - money} more` }
  return { ok: true }
}

export function needsConfirm(id: string) { return (ITEM_BY_ID[id]?.price ?? 0) >= CONFIRM_PRICE }

/** Ambience points from decor, gifts and complete sets. */
export function ambiencePoints(owned: Owned) {
  let points = 0
  for (const id of owned) { const e = ITEM_BY_ID[id]?.effect; if (e?.kind === 'decor') points += e.ambience }
  return points + setBonus(owned)
}

/** The ambience goal shown in the shop ("2 / 15"): five ambience stars. Decor past it still adds tips. */
export const AMBIENCE_GOAL = 15

/** Ambience stars, 1 to 5 in half steps, shown on the floor and the receipt: 5 at AMBIENCE_GOAL points. */
export function ambienceStars(owned: Owned) { return Math.min(5, 1 + Math.round((Math.min(AMBIENCE_GOAL, ambiencePoints(owned)) / AMBIENCE_GOAL) * 8) / 2) }

/**
 * Customers a day: 4 on day 1, 5 on day 2, then one more every other day while the salon has room (about
 * two customers per station past the first chair), plus any marketing items.
 */
export function customersPerDay(owned: Owned, day = 1, stations = 1) {
  let n = Math.min(BASE_CUSTOMERS + Math.floor(Math.max(1, day) / 2), BASE_CUSTOMERS + 1 + 2 * Math.max(0, stations - 1))
  for (const id of owned) { const e = ITEM_BY_ID[id]?.effect; if (e?.kind === 'marketing') n += e.customers }
  return n
}

/** How much more customers pay, from marketing: 1 is the base. */
export function wealth(owned: Owned) {
  let w = 1
  for (const id of owned) { const e = ITEM_BY_ID[id]?.effect; if (e?.kind === 'marketing') w += e.wealth }
  return Math.round(w * 100) / 100
}

export function toolTier(owned: Owned, treatment: TreatmentId) {
  let tier = 1
  for (const id of owned) { const e = ITEM_BY_ID[id]?.effect; if (e?.kind === 'toolTier' && e.treatment === treatment) tier = Math.max(tier, e.tier) }
  return tier
}

export function treatmentsUnlocked(owned: Owned): TreatmentId[] {
  const list: TreatmentId[] = ['facial']
  if (owns(owned, 'treat-nails')) list.push('nails')
  return list
}

/** What a finished treatment earns. Pure arithmetic, shown on the receipt line by line. */
export function payFor(basePrice: number, owned: Owned, disaster: boolean) {
  return Math.round(basePrice * wealth(owned) * (disaster ? 1.8 : 1))
}

/**
 * Tips reward quality (stars), a happy wait (mood) and a pretty salon. The service part tops out at 30% of
 * the price; ambience adds on top with gently shrinking returns and no hard cap, so every piece of decor
 * still adds a little (about +5% for the first two points, +25% at 15, +35% for a salon full of it).
 */
export function tipFor(price: number, stars: number, mood: number, owned: Owned, mult = 1) {
  const service = Math.min(0.3, 0.05 * (Math.max(1, stars) - 1) + 0.1 * Math.max(0, Math.min(1, mood)))
  const decor = 0.38 * (1 - Math.exp(-ambiencePoints(owned) / 14))
  return Math.max(0, Math.round(price * (service + decor) * mult))
}

/** Items that arrive in the shop on this day (the morning's "new in the shop"). */
export function arrivals(day: number): Item[] { return ITEMS.filter(i => i.unlockDay === day && !i.soon && !i.gift) }

/** The next thing worth saving for, for the receipt's teaser: the cheapest item not yet owned that can be bought after its needs. */
export function nextUnlock(owned: Owned, day = Infinity): Item | null {
  const candidates = ITEMS.filter(i => !i.soon && !i.gift && i.tab !== 'marketing' && !owns(owned, i.id) && (i.needs ?? []).every(n => owns(owned, n)) && (i.unlockDay ?? 0) <= day)
  candidates.sort((a, b) => b.price - a.price)
  // The biggest affordable-soon goal: the most exciting item within reach of about three days.
  const big = candidates.filter(i => i.tab === 'stations' || i.tab === 'treatments' || i.tab === 'tools').sort((a, b) => a.price - b.price)
  return big[0] ?? candidates[candidates.length - 1] ?? null
}
