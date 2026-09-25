import { portrait } from '../art/salon/people.ts'
import { PLAYER_CSS } from '../art/palette.ts'
import { tick } from '../audio/salon-sfx.ts'
import { sfx } from '../audio/sfx.ts'
import type { Look } from '../core/customers.ts'
import { arrivals, nextUnlock } from '../core/economy.ts'
import { ARCHETYPE_BY_ID } from '../core/persona.ts'
import type { Review } from '../core/reviews.ts'
import { salonTags, type GoogleReview } from '../core/review-writer.ts'
import type { Player } from '../core/salon.ts'
import { confetti } from './confetti.ts'
import { esc, h, money } from './dom.ts'
import { ICON } from './salon-icons.ts'
import './salon.css'

/**
 * The end of the day. A paper receipt prints and its lines count up with soft ticks (treatments, tips,
 * product costs, wages) to the day's profit. Beside it, the salon's Google-style listing: the average
 * rating rolls up or down to its new value, the category tags, and today's reviews popping in one by one,
 * each with the customer's face, stars and words. Then the players' awards, any news (a regular's
 * friendship, a staff level-up), a teaser of what to save for next, and "Next day".
 */
export type ReceiptData = {
  day: number
  salonName: string
  revenue: number
  tips: number
  costs: number
  wages: number
  net: number
  served: number
  ratingBefore: number
  ratingAfter: number
  reviewsTotal: number
  /** Star histogram before today (index 0 is one star). */
  histBefore: number[]
  reviews: Review[]
  allReviews: Review[]
  awards: { title: string; name: string; value: string }[]
  players: Player[]
  owned: string[]
  money: number
  news: string[]
  /** Today's relaxed goal, and whether it paid out. */
  goal: { text: string; reward: number; done: boolean } | null
}

export type ReceiptHooks = { onNext: () => void }

const wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

function starsHtml(v: number) {
  let out = ''
  for (let i = 0; i < 5; i++) out += `<i class="${v >= i + 0.75 ? 'on' : v >= i + 0.25 ? 'half' : ''}">&#9733;</i>`
  return `<span class="gs-stars">${out}</span>`
}

const AWARD_ICON: Record<string, string> = { 'Most pimples popped': ICON.heart, 'Tip magnet': ICON.coin, 'Busiest hands': ICON.trophy, 'Speedy hands': ICON.star, 'Nail artist': ICON.sparkle, 'Foam artist': ICON.cup, 'Blackhead hunter': ICON.tools }

export class Receipt {
  readonly el = h('div', 'gs gs-veil gs-veil-top')
  private fast = false
  private nextBtn: HTMLButtonElement
  private hooks: ReceiptHooks
  private host: HTMLElement

  constructor(host: HTMLElement, data: ReceiptData, hooks: ReceiptHooks) {
    this.host = host
    this.hooks = hooks
    this.nextBtn = h('button', 'gs-btn pink big', 'Next day')
    this.nextBtn.disabled = true
    this.nextBtn.onclick = () => { sfx.click(); this.close(); this.hooks.onNext() }
    host.append(this.el)
    // A tap anywhere hurries the show along (never skips the button).
    this.el.addEventListener('pointerdown', e => { if (!(e.target instanceof HTMLButtonElement)) this.fast = true })
    void this.play(data)
  }

  private pause(ms: number) { return wait(this.fast ? Math.min(60, ms) : ms) }

  private async countUp(el: HTMLElement, to: number, ms: number, sign = '') {
    const steps = this.fast ? 4 : Math.max(8, Math.min(30, Math.round(ms / 40)))
    for (let i = 1; i <= steps; i++) {
      const v = Math.round((to * i) / steps)
      el.textContent = `${sign}${money(v)}`
      if (i % 2 === 0) tick(1 + i / steps / 2)
      await wait(this.fast ? 10 : ms / steps)
    }
  }

  private async play(d: ReceiptData) {
    const wrap = h('div', 'gs-end')
    // ---------------------------------------------------------------- the paper receipt
    const paper = h('div', 'gs-receipt')
    paper.innerHTML = `<h2>${esc(d.salonName)}</h2><div class="gs-sub">Day ${d.day} receipt</div><hr class="gs-rule">`
    const line = (label: string, cls: string) => { const l = h('div', `gs-line ${cls}`, `<span>${label}</span><span>$0</span>`); paper.append(l); return l }
    const lines: [HTMLElement, number, string][] = [
      [line('Treatments', 'plus'), d.revenue, '+'],
      [line('Tips', 'plus'), d.tips, '+'],
    ]
    if (d.goal?.done) lines.push([line('Daily goal', 'plus'), d.goal.reward, '+'])
    lines.push([line('Products used', 'minus'), d.costs, '-'])
    if (d.wages) lines.push([line('Staff wages', 'minus'), d.wages, '-'])
    paper.append(h('hr', 'gs-rule'))
    const net = h('div', 'gs-net', `<span>Profit</span><b>$0</b>`)
    paper.append(net)
    paper.append(h('div', 'gs-served', `${d.served} happy customer${d.served === 1 ? '' : 's'} today`))
    const stamp = h('div', 'gs-stamp', d.net > 0 ? 'GREAT DAY' : 'THANK YOU')
    paper.append(stamp)
    // ---------------------------------------------------------------- the Google-style listing
    const side = h('div', 'gs-reviews')
    const card = h('div', 'gs-gcard')
    const countBefore = Math.max(0, d.reviewsTotal - d.reviews.length)
    const hist = [...d.histBefore]
    const bars = [5, 4, 3, 2, 1].map(n => `<div class="gs-hist-row"><span>${n}</span><div class="gs-hist-bar"><i data-n="${n}"></i></div></div>`).join('')
    card.innerHTML = `<div class="gs-g-name">${esc(d.salonName)}<small>Reviews</small></div><div class="gs-g-body"><div class="gs-hist">${bars}</div><div class="gs-g-side"><div class="gs-g-score">${d.ratingBefore ? d.ratingBefore.toFixed(1) : '0.0'}</div><div class="gs-g-stars">${starsHtml(d.ratingBefore)}</div><div class="gs-g-count">${countBefore} review${countBefore === 1 ? '' : 's'}</div></div></div><span class="gs-g-delta"></span><div class="gs-g-tags"></div>`
    side.append(card)
    const drawHist = () => {
      const max = Math.max(1, ...hist)
      for (const i of card.querySelectorAll<HTMLElement>('.gs-hist-bar i')) i.style.width = `${(hist[Number(i.dataset.n) - 1] / max) * 100}%`
    }
    drawHist()
    // The paper column holds the Next day button, stuck to the bottom of the screen while the page scrolls.
    const col = h('div', 'gs-paper-col')
    const row = h('div', 'gs-next-row')
    row.append(this.nextBtn)
    col.append(paper, row)
    wrap.append(col, side)
    this.el.append(wrap)
    sfx.shutter()

    await this.pause(700)
    for (const [el, v, sign] of lines) {
      el.classList.add('in')
      await this.countUp(el.lastElementChild as HTMLElement, v, 380, v ? sign : '')
      if (sign === '+' && v > 0) sfx.cash()
      await this.pause(120)
    }
    net.classList.add('in')
    const netEl = net.querySelector('b')!
    if (d.net < 0) netEl.classList.add('neg')
    await this.countUp(netEl, Math.abs(d.net), 700, d.net < 0 ? '-' : '')
    sfx.cash()
    stamp.classList.add('in')
    if (d.net > 0) confetti(this.host, rectCentre(paper), 50)
    await this.pause(500)

    // Today's reviews land one by one: each pops in, fills its bar and nudges the rating.
    const score = card.querySelector('.gs-g-score') as HTMLElement
    const starsEl = card.querySelector('.gs-g-stars') as HTMLElement
    const count = card.querySelector('.gs-g-count') as HTMLElement
    let sum = d.ratingBefore * countBefore, n = countBefore
    let shown = d.ratingBefore
    const roll = async (to: number) => {
      const from = shown
      for (let i = 1; i <= 10; i++) { const v = from + ((to - from) * i) / 10; score.textContent = v.toFixed(1); starsEl.innerHTML = starsHtml(v); await wait(this.fast ? 4 : 28) }
      shown = to
    }
    if (!d.reviews.length) side.append(h('div', 'gs-empty', 'No reviews today. Tomorrow is a new day.'))
    for (const [i, r] of d.reviews.entries()) {
      await this.pause(i ? 600 : 250)
      side.append(reviewCard(r as GoogleReview))
      sfx.reviewPop(i)
      side.lastElementChild?.scrollIntoView({ block: 'nearest', behavior: this.fast ? 'auto' : 'smooth' })
      hist[Math.max(1, Math.min(5, r.stars)) - 1]++
      drawHist()
      sum += r.stars; n++
      count.textContent = `${n} review${n === 1 ? '' : 's'}`
      await roll(i === d.reviews.length - 1 ? d.ratingAfter : Math.round((sum / n) * 10) / 10)
    }
    const delta = card.querySelector('.gs-g-delta') as HTMLElement
    const diff = Math.round((d.ratingAfter - d.ratingBefore) * 10) / 10
    if (d.ratingBefore && diff !== 0) { delta.textContent = `${diff > 0 ? '+' : ''}${diff.toFixed(1)} today`; delta.classList.add('in', diff > 0 ? 'up' : 'down') }
    else if (!d.ratingBefore && d.reviewsTotal) { delta.textContent = 'Your first reviews'; delta.classList.add('in', 'up') }
    else if (d.reviews.length) { delta.textContent = 'Holding steady'; delta.classList.add('in', 'up') }
    sfx.star(d.ratingAfter >= 4.5 ? 4 : d.ratingAfter >= 4 ? 3 : 2)
    const tags = card.querySelector('.gs-g-tags') as HTMLElement
    for (const t of salonTags(d.allReviews as Partial<GoogleReview>[], 5)) tags.insertAdjacentHTML('beforeend', `<span class="gs-g-tag">${esc(t.tag)}<b>${t.count}</b></span>`)

    // Awards for the players.
    if (d.awards.length) {
      await this.pause(500)
      side.append(h('div', 'gs-section', 'Today’s awards'))
      const grid = h('div', 'gs-awards')
      side.append(grid)
      for (const a of d.awards) {
        const p = d.players.find(pl => pl.name === a.name)
        const col = p ? PLAYER_CSS[p.id % 4] : '#9a6a10'
        grid.append(h('div', 'gs-award', `${AWARD_ICON[a.title] ?? ICON.trophy}<b>${esc(a.title)}</b><span style="color:${col}">${esc(a.name)}</span><small>${esc(a.value)}</small>`))
        sfx.star(2)
        await this.pause(260)
      }
    }
    // News: friendships, level ups, gifts.
    if (d.news.length) {
      side.append(h('div', 'gs-section', 'Salon news'))
      const box = h('div', 'gs-news')
      for (const n of d.news) box.append(h('div', '', esc(n)))
      side.append(box)
    }
    // What arrives in the shop tomorrow, and what to save for next.
    const tomorrow = arrivals(d.day + 1)
    if (tomorrow.length) {
      await this.pause(300)
      side.append(h('div', 'gs-teaser', `${ICON.sparkle}<div><b>New in the shop tomorrow</b>${esc(tomorrow.map(i => i.name).join(', '))}</div>`))
    }
    const next = nextUnlock(d.owned, d.day + 1)
    if (next) {
      await this.pause(300)
      const gap = next.price - d.money
      side.append(h('div', 'gs-teaser', `${ICON.gift}<div><b>Next up: ${esc(next.name)}</b>${esc(next.blurb)} ${gap > 0 ? `You are ${money(gap)} away.` : 'You can afford it now, at the salon computer.'}</div>`))
    }
    this.nextBtn.disabled = false
    this.nextBtn.classList.add('ready')
  }

  close() {
    this.el.classList.add('out')
    setTimeout(() => this.el.remove(), 260)
  }
}

function rectCentre(el: HTMLElement) { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height * 0.6 } }

const portraitCache = new Map<string, string>()
function avatar(look: Look | null, name: string): string {
  if (!look) return ''
  const key = JSON.stringify(look)
  let url = portraitCache.get(key)
  if (!url) { url = portrait(look, 92, ['#fde6ee', '#e6f7f0', '#f1ecfd', '#fff3d6'][name.length % 4]); portraitCache.set(key, url) }
  return url
}

export function reviewCard(r: GoogleReview): HTMLElement {
  const el = h('div', 'gs-review')
  const pic = avatar(r.look ?? null, r.name)
  const what = r.treatment === 'nails' ? 'Manicure' : r.treatment === 'feet' ? 'Pedicure' : 'Facial'
  el.innerHTML = `${pic ? `<img src="${pic}" alt="">` : ''}<div class="gs-review-main"><div class="gs-review-top"><b>${esc(r.name)}</b>${r.regular ? '<span class="gs-badge-reg">Regular</span>' : ''}<span>${r.archetype ? esc(labelOf(r.archetype)) + ' · ' : ''}${what}</span></div><div class="gs-review-stars">${starsHtml(r.stars)}<small>today</small></div><p>${esc(r.text)}</p><div class="gs-review-foot"><span>Helpful</span><span>Share</span>${r.staff ? `<span>Treated by ${esc(r.staff)}</span>` : ''}</div></div>`
  return el
}

function labelOf(archetype: string) { return ARCHETYPE_BY_ID[archetype]?.label ?? archetype }
