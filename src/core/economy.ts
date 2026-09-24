import type { TreatmentId } from './treatments/types.ts'

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
}

export type StationKind = 'facial' | 'nails'

/** Items at or above this price need every player in the salon to agree. */
export const CONFIRM_PRICE = 200
export const START_MONEY = 60
export const BASE_CUSTOMERS = 3

export const ITEMS: Item[] = [
  // Tools: faster, prettier.
  { id: 'facial-kit-2', tab: 'tools', name: 'Pro facial kit', blurb: 'Bigger brushes and a stronger loop. Facials go 50% faster and look prettier.', price: 140, effect: { kind: 'toolTier', treatment: 'facial', tier: 2 } },
  { id: 'facial-kit-3', tab: 'tools', name: 'Luxe facial kit', blurb: 'Rose-gold tools. Facials go twice as fast, with sparkle trails.', price: 420, needs: ['facial-kit-2'], effect: { kind: 'toolTier', treatment: 'facial', tier: 3 } },
  { id: 'nail-kit-2', tab: 'tools', name: 'Pro nail kit', blurb: 'Precision files and brushes. Manicures go 50% faster.', price: 120, needs: ['treat-nails'], effect: { kind: 'toolTier', treatment: 'nails', tier: 2 } },
  { id: 'nail-kit-3', tab: 'tools', name: 'Luxe nail kit', blurb: 'Salon-grade everything. Manicures go twice as fast.', price: 360, needs: ['nail-kit-2'], effect: { kind: 'toolTier', treatment: 'nails', tier: 3 } },
  // Stations.
  { id: 'facial-chair-2', tab: 'stations', name: 'Second facial chair', blurb: 'Two facials at once, or one each in co-op.', price: 300, effect: { kind: 'station', station: 'facial' } },
  { id: 'nail-desk', tab: 'stations', name: 'Nail desk', blurb: 'A pastel desk for manicures.', price: 220, needs: ['treat-nails'], effect: { kind: 'station', station: 'nails' } },
  { id: 'nail-desk-2', tab: 'stations', name: 'Second nail desk', blurb: 'More manicures, shorter waits.', price: 380, needs: ['nail-desk'], effect: { kind: 'station', station: 'nails' } },
  { id: 'facial-chair-3', tab: 'stations', name: 'Third facial chair', blurb: 'For a busy salon.', price: 520, needs: ['facial-chair-2'], effect: { kind: 'station', station: 'facial' } },
  // Treatments.
  { id: 'treat-nails', tab: 'treatments', name: 'Nails and hands', blurb: 'Soak, clip, file, polish and gems. Buy a nail desk to start.', price: 250, effect: { kind: 'treatment', treatment: 'nails' } },
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
]

export const ITEM_BY_ID: Record<string, Item> = Object.fromEntries(ITEMS.map(item => [item.id, item]))

export type Owned = readonly string[]

export function owns(owned: Owned, id: string) { return owned.includes(id) }

export type BuyCheck = { ok: true } | { ok: false; reason: string }

export function canBuy(owned: Owned, money: number, id: string): BuyCheck {
  const item = ITEM_BY_ID[id]
  if (!item) return { ok: false, reason: 'Unknown item' }
  if (item.soon) return { ok: false, reason: 'Coming soon' }
  if (owns(owned, id)) return { ok: false, reason: 'Owned' }
  const missing = (item.needs ?? []).filter(n => !owns(owned, n))
  if (missing.length) return { ok: false, reason: `Needs ${ITEM_BY_ID[missing[0]].name}` }
  if (money < item.price) return { ok: false, reason: `Needs $${item.price - money} more` }
  return { ok: true }
}

export function needsConfirm(id: string) { return (ITEM_BY_ID[id]?.price ?? 0) >= CONFIRM_PRICE }

/** Ambience points from decor; 0 to 12. */
export function ambiencePoints(owned: Owned) {
  let points = 0
  for (const id of owned) { const e = ITEM_BY_ID[id]?.effect; if (e?.kind === 'decor') points += e.ambience }
  return points
}

/** Ambience stars, 1 to 5 in half steps, shown on the floor and the receipt. */
export function ambienceStars(owned: Owned) { return Math.min(5, 1 + Math.round(ambiencePoints(owned) / 3 * 2) / 2 * 1) }

export function customersPerDay(owned: Owned) {
  let n = BASE_CUSTOMERS
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
 * Tips reward quality: how thorough, how quick, how long they waited (mood), and how pretty the salon is.
 * Stars are 1 to 5; mood and thoroughness 0 to 1.
 */
export function tipFor(price: number, stars: number, mood: number, owned: Owned) {
  const rate = 0.04 * (stars - 1) + 0.08 * mood + 0.015 * ambiencePoints(owned)
  return Math.max(0, Math.round(price * Math.min(0.45, rate)))
}

/** The next thing worth saving for, for the receipt's teaser: the cheapest item not yet owned that can be bought after its needs. */
export function nextUnlock(owned: Owned): Item | null {
  const candidates = ITEMS.filter(i => !i.soon && !owns(owned, i.id) && (i.needs ?? []).every(n => owns(owned, n)))
  candidates.sort((a, b) => b.price - a.price)
  // The biggest affordable-soon goal: the most exciting item within reach of about three days.
  const big = candidates.filter(i => i.tab === 'stations' || i.tab === 'treatments' || i.tab === 'tools').sort((a, b) => a.price - b.price)
  return big[0] ?? candidates[candidates.length - 1] ?? null
}
