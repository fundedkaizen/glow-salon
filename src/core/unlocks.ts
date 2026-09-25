import type { Item } from './economy.ts'

/**
 * Serenity's Spa-style progression: the salon levels up as it earns, and every level opens something new to buy.
 *
 * - The salon level comes from lifetime earnings (`totals.earned`, already saved and shared in co-op): the top-left
 *   bar is the cash earned toward the next level. There is always a next level: past the authored list, levels are
 *   generated with a steadily rising target (about 100 hours of play to reach level 30).
 * - Each authored level opens one upgrade: a better reception, lounge, stations, floor, lights and walls, then a
 *   salon star for the trophy shelf at every level after. Upgrades are ordinary shop items (the Decor tab and the
 *   grey ghosts on the floor both sell them), each worth some ambience.
 * - Every piece of furniture has three cosmetic styles (`styleKeys`), chosen per piece and saved.
 * - The ghosts: the next few things worth buying, shown on the floor where they would stand (`ghostPicks`).
 * Pure data and functions, tested in tests/unlocks.test.ts.
 */
export type SalonLevel = { level: number; name: string; target: number; opens: string | null }

/** Authored levels: name, the lifetime earnings that reach it, and the upgrade it opens. */
const AUTHORED: [string, number, string | null][] = [
  ['Little salon', 0, null],
  ['Reception glow-up', 400, 'up-desk-2'],
  ['Cosy lounge', 1000, 'up-lounge-2'],
  ['Garden corner', 2000, 'up-fountain'],
  ['Plush chairs', 3300, 'up-facial-2'],
  ['Nail bar glam', 5000, 'up-nails-2'],
  ['Foot spa glam', 7000, 'up-feet-2'],
  ['Sunlit floor', 9500, 'up-floor-2'],
  ['Crystal lights', 12500, 'up-lights-2'],
  ['Gold reception', 16000, 'up-desk-3'],
  ['Grand lounge', 20500, 'up-lounge-3'],
  ['Luxe facial beds', 26000, 'up-facial-3'],
  ['Crystal nail bar', 33000, 'up-nails-3'],
  ['Royal foot thrones', 41000, 'up-feet-3'],
  ['Marble floor', 51000, 'up-floor-3'],
  ['Silk walls', 63000, 'up-walls-2'],
]
/** Past the authored levels, each target is this much bigger than the last. */
const GROWTH = 1.22
/** Salon stars (trophies) for the levels after the authored ones, up to this level. */
export const LAST_STAR_LEVEL = 40

const round = (n: number, to: number) => Math.round(n / to) * to

/** The level `n` (1-based): its name, target and what it opens. Defined for every n. */
export function levelInfo(n: number): SalonLevel {
  const k = Math.max(1, Math.floor(n))
  if (k <= AUTHORED.length) { const [name, target, opens] = AUTHORED[k - 1]; return { level: k, name, target, opens } }
  const last = AUTHORED[AUTHORED.length - 1][1]
  const target = round(last * GROWTH ** (k - AUTHORED.length), 500)
  return { level: k, name: `Salon star ${k - AUTHORED.length}`, target, opens: k <= LAST_STAR_LEVEL ? `up-star-${k}` : null }
}

/** The salon's level for its lifetime earnings. */
export function salonLevel(earned: number): number {
  let n = 1
  while (levelInfo(n + 1).target <= earned) n++
  return n
}

/** Progress toward the next level: earned so far in this level, the step size, and the next level. */
export function levelProgress(earned: number): { level: number; next: SalonLevel; have: number; need: number } {
  const level = salonLevel(earned)
  const from = levelInfo(level).target
  const next = levelInfo(level + 1)
  return { level, next, have: Math.max(0, earned - from), need: next.target - from }
}

// ------------------------------------------------------------------ the upgrades

type UpgradeDef = { id: string; name: string; blurb: string; price: number; ambience: number; needs?: string }

const UPGRADES: UpgradeDef[] = [
  { id: 'up-desk-2', name: 'Marble reception', blurb: 'A marble-topped reception counter with a gold rail.', price: 150, ambience: 1 },
  { id: 'up-lounge-2', name: 'Velvet lounge', blurb: 'Deep velvet cushions in the waiting lounge, and a coffee table.', price: 220, ambience: 1 },
  { id: 'up-fountain', name: 'Fountain garden', blurb: 'A little indoor garden with a trickling fountain.', price: 380, ambience: 2 },
  { id: 'up-facial-2', name: 'Plush facial chairs', blurb: 'Every facial chair gets tufted cushions and a gold frame.', price: 450, ambience: 1 },
  { id: 'up-nails-2', name: 'Nail desks with ring lights', blurb: 'Ring lights and velvet hand rests at every nail desk.', price: 520, ambience: 1 },
  { id: 'up-feet-2', name: 'Jet pedicure thrones', blurb: 'Bubbling jet basins and high padded backs.', price: 600, ambience: 1 },
  { id: 'up-floor-2', name: 'Sunlit oak floor', blurb: 'A pale herringbone oak floor.', price: 800, ambience: 2 },
  { id: 'up-lights-2', name: 'Crystal pendant lights', blurb: 'Pendant lights over the stations.', price: 1000, ambience: 2 },
  { id: 'up-desk-3', name: 'Gold reception', blurb: 'A curved gold-trimmed reception with a flower wall.', price: 1300, ambience: 2, needs: 'up-desk-2' },
  { id: 'up-lounge-3', name: 'Grand lounge', blurb: 'A grand tufted lounge with brass lamps.', price: 1600, ambience: 2, needs: 'up-lounge-2' },
  { id: 'up-facial-3', name: 'Luxe facial beds', blurb: 'Heated luxe beds with rose-gold frames.', price: 2000, ambience: 2, needs: 'up-facial-2' },
  { id: 'up-nails-3', name: 'Crystal nail bar', blurb: 'Crystal-topped nail desks that catch the light.', price: 2400, ambience: 2, needs: 'up-nails-2' },
  { id: 'up-feet-3', name: 'Royal foot thrones', blurb: 'Carved thrones with golden basins.', price: 2800, ambience: 2, needs: 'up-feet-2' },
  { id: 'up-floor-3', name: 'Marble floor', blurb: 'Polished blush marble underfoot.', price: 3400, ambience: 2, needs: 'up-floor-2' },
  { id: 'up-walls-2', name: 'Silk walls', blurb: 'Silk wallpaper with gilded panels.', price: 4000, ambience: 2 },
]

/** The level each upgrade opens at. */
const OPENS_AT: Record<string, number> = {}
for (let n = 2; n <= LAST_STAR_LEVEL; n++) { const o = levelInfo(n).opens; if (o) OPENS_AT[o] = n }

export const UPGRADE_ITEMS: Item[] = [
  ...UPGRADES.map(u => ({
    id: u.id, tab: 'decor' as const, name: u.name, blurb: `${u.blurb} +${u.ambience} ambience.`, price: u.price, level: OPENS_AT[u.id],
    needs: u.needs ? [u.needs] : undefined, effect: { kind: 'decor' as const, ambience: u.ambience, prop: u.id },
  })),
  // A salon star for every level after the authored ones: a trophy on the shelf, priced at 6% of the level's
  // target, so each one is a bigger save than the last.
  ...Array.from({ length: LAST_STAR_LEVEL - AUTHORED.length }, (_, i) => {
    const n = AUTHORED.length + 1 + i
    const info = levelInfo(n)
    return { id: `up-star-${n}`, tab: 'decor' as const, name: `Salon star ${n - AUTHORED.length}`, blurb: `A golden star for the trophy shelf: level ${n}. +1 ambience.`, price: round(info.target * 0.06, 50), level: n, effect: { kind: 'decor' as const, ambience: 1, prop: `up-star-${n}` } }
  }),
]

/** The upgrade tier of a family (reception, lounge, stations, floor, lights, walls) the salon owns: 1 to 3. */
export function tierOf(owned: readonly string[], family: 'desk' | 'lounge' | 'facial' | 'nails' | 'feet' | 'floor' | 'lights' | 'walls'): number {
  return owned.includes(`up-${family}-3`) ? 3 : owned.includes(`up-${family}-2`) ? 2 : 1
}

/** Salon stars on the trophy shelf. */
export function starsOwned(owned: readonly string[]): number { return owned.filter(id => id.startsWith('up-star-')).length }

// ------------------------------------------------------------------ styles

/** Three looks per piece. */
export const STYLE_COUNT = 3

/** The pieces that can be restyled: the reception, the lounge, the first facial chair, and anything bought that stands in the salon. */
export function styleKeys(owned: readonly string[], standsInSalon: (id: string) => boolean): string[] {
  return ['desk', 'lounge', 'facial-chair-1', ...owned.filter(standsInSalon)]
}

/** A piece's chosen style (0 to STYLE_COUNT - 1). */
export function styleOf(styles: Record<string, number> | undefined, key: string): number {
  const s = styles?.[key]
  return Number.isInteger(s) && s! >= 0 && s! < STYLE_COUNT ? s! : 0
}

// ------------------------------------------------------------------ ghosts

export type GhostCheck = (id: string) => { ok: true } | { ok: false; reason: string }

/**
 * The ghosts on the floor: a few things to buy next, cheapest first. An item qualifies when it stands in the salon
 * (`standsInSalon`) and could be bought now, or as soon as there is money for it; it shows when the salon can
 * nearly afford it (price at most 1.5 times the wallet plus 120). With nothing that close, the cheapest one still
 * shows, so there is always a goal on the floor. At most `max`, and at most two stations.
 */
export function ghostPicks(items: readonly Item[], money: number, check: GhostCheck, standsInSalon: (item: Item) => boolean, max = 4): Item[] {
  const open = items.filter(i => !i.gift && !i.soon && standsInSalon(i)).filter(i => { const c = check(i.id); return c.ok || c.reason.startsWith('Needs $') })
  open.sort((a, b) => a.price - b.price || a.id.localeCompare(b.id))
  const near = open.filter(i => i.price <= money * 1.5 + 120)
  const pool = near.length ? near : open.slice(0, 1)
  const out: Item[] = []
  let stations = 0
  for (const i of pool) {
    const station = i.effect.kind === 'station' || i.effect.kind === 'treatment'
    if (station && stations >= 2) continue
    if (station) stations++
    out.push(i)
    if (out.length >= max) break
  }
  return out
}
