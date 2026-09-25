import { WORLD_DATA } from '../content/world.ts'

/**
 * Marketing campaigns from the world content: flyers, social media, local radio, a beauty magazine, loyalty
 * cards and an influencer visit. A campaign is bought on the computer and brings extra customers for some
 * days (and more of the kinds of people it reaches); loyalty cards are for good. A campaign can run again
 * once it has finished.
 */
export type CampaignDef = {
  id: string
  label: string
  price: number
  /** Archetypes it reaches. */
  brings: string[]
  /** Extra customers on each day it runs (day 1 first). */
  perDay: number[]
  permanent: boolean
  /** What it does, in plain words for the shop card. */
  blurb: string
  /** The day it can first be run. */
  unlockDay: number
}

export type ActiveCampaign = { id: string; day: number }

/** One unit of the content's relative cost. */
export const CAMPAIGN_UNIT = 55
/** Campaigns together never add more than this many customers a day (the salon stays cozy). */
export const MAX_EXTRA = 6

const RUNS: Record<string, { perDay: number[]; blurb: string; permanent?: boolean; unlockDay: number }> = {
  flyers: { perDay: [2, 2, 2], unlockDay: 1, blurb: '+2 customers a day for 3 days, mostly neighbours: grandmas, students, teachers.' },
  social: { perDay: [3, 3, 3, 3, 3], unlockDay: 7, blurb: '+3 young customers a day for 5 days.' },
  radio: { perDay: [4, 4, 4], unlockDay: 10, blurb: '+4 customers a day for 3 days: office workers, mechanics, chefs, nurses.' },
  magazine: { perDay: [2, 2, 2, 2, 2, 2, 2], unlockDay: 13, blurb: '+2 customers a day for a week, the kind who love a treat: models, lawyers, brides.' },
  loyalty: { perDay: [1], permanent: true, unlockDay: 4, blurb: '+1 customer every day, for good. Your regulars pop in more often.' },
  influencer: { perDay: [1, 3, 3], unlockDay: 16, blurb: 'An influencer visits tomorrow, then +3 customers a day for 2 days from the video.' },
}

export const CAMPAIGNS: CampaignDef[] = WORLD_DATA.marketing.map(m => {
  const run = RUNS[m.id] ?? { perDay: [1], blurb: m.effect, unlockDay: 1 }
  return { id: m.id, label: m.label, price: m.cost * CAMPAIGN_UNIT, brings: [...m.brings], perDay: run.perDay, permanent: !!run.permanent, blurb: run.blurb, unlockDay: run.unlockDay }
})
export const CAMPAIGN_BY_ID: Record<string, CampaignDef> = Object.fromEntries(CAMPAIGNS.map(c => [c.id, c]))

/** Extra customers today from running campaigns and loyalty cards. `day` counts from 0 on the first day. */
export function campaignCustomers(active: readonly ActiveCampaign[], loyalty: boolean): number {
  let n = loyalty ? 1 : 0
  for (const a of active) n += CAMPAIGN_BY_ID[a.id]?.perDay[a.day] ?? 0
  return Math.min(MAX_EXTRA, n)
}

/** Archetypes today's campaigns reach, for who walks in. */
export function campaignBias(active: readonly ActiveCampaign[]): string[] {
  return active.flatMap(a => CAMPAIGN_BY_ID[a.id]?.brings ?? [])
}

/** Move running campaigns on to the next day, dropping finished ones. */
export function advanceCampaigns(active: readonly ActiveCampaign[]): ActiveCampaign[] {
  return active.map(a => ({ id: a.id, day: a.day + 1 })).filter(a => a.day < (CAMPAIGN_BY_ID[a.id]?.perDay.length ?? 0))
}

export type CampaignCheck = { ok: true } | { ok: false; reason: string }

export function canRunCampaign(id: string, active: readonly ActiveCampaign[], loyalty: boolean, money: number, day = Infinity): CampaignCheck {
  const c = CAMPAIGN_BY_ID[id]
  if (!c) return { ok: false, reason: 'Unknown campaign' }
  if (day < c.unlockDay) return { ok: false, reason: `Arrives on day ${c.unlockDay}` }
  if (c.permanent && loyalty) return { ok: false, reason: 'Owned' }
  const running = active.find(a => a.id === id)
  if (running) { const left = c.perDay.length - running.day; return { ok: false, reason: `Running, ${left} day${left === 1 ? '' : 's'} left` } }
  if (money < c.price) return { ok: false, reason: `Needs $${c.price - money} more` }
  return { ok: true }
}
