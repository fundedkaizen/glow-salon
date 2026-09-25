import { PLAYER_CSS } from '../art/palette.ts'
import { ITEM_BY_ID } from '../core/economy.ts'
import type { GameEvent, Pending, Phase, Player } from '../core/salon.ts'
import type { ExtVote } from '../core/salon-ext.ts'
import { esc, h, money } from './dom.ts'
import { ICON } from './salon-icons.ts'
import { settings } from './settings.ts'
import './salon.css'

/**
 * The floor's heads-up display, in the DOM over the canvas: the day and how far through it the salon is,
 * the shared wallet, the Google rating, the music (track name and a next button), settings, the big "Open
 * the salon" button before the day starts, little toasts for arrivals and purchases, and co-op votes for
 * big purchases. Everything is at least 44 px tall for thumbs.
 */
export type HudView = {
  day: number
  phase: Phase
  money: number
  rating: number
  reviews: number
  arrived: number
  total: number
  served: number
  players: Player[]
  events: GameEvent[]
  pending: Pending | null
  vote: ExtVote | null
  /** Players ready to open (co-op). */
  ready: number[]
  me: number
}

export type HudHandlers = {
  onOpen: () => void
  onNextTrack: () => void
  onToggleMusic: () => void
  onSettings: () => void
  onVote: (id: number, yes: boolean) => void
  onExtVote: (yes: boolean) => void
}

function stars(v: number) {
  let out = ''
  for (let i = 0; i < 5; i++) out += `<i class="${v >= i + 0.75 ? 'on' : v >= i + 0.25 ? 'half' : ''}">&#9733;</i>`
  return `<span class="gs-stars">${out}</span>`
}

export class FloorHud {
  readonly el = h('div', 'gs gs-hud')
  private dayEl: HTMLElement
  private moneyEl: HTMLElement
  private rateEl: HTMLElement
  private trackEl: HTMLElement
  private eqEl: HTMLElement
  private openBtn: HTMLButtonElement
  private hint: HTMLElement
  private toasts = h('div', 'gs-toasts')
  private voteEl: HTMLElement | null = null
  private voteKey = ''
  private lastSeq = -1
  private shownMoney: number | null = null
  private moneyAnim = 0
  private lastKey = ''
  private readyKey = '-'
  private readyRow = h('div', 'gs-ready-row')
  private h: HudHandlers

  constructor(host: HTMLElement, handlers: HudHandlers) {
    this.h = handlers
    const top = h('div', 'gs-hud-top')
    this.dayEl = h('div', 'gs-chip gs-day')
    this.moneyEl = h('div', 'gs-chip money', `<span class="gs-dot" style="background:#fff3cf">${ICON.coin}</span><div><small>Wallet</small><b>$0</b></div>`)
    this.rateEl = h('div', 'gs-chip gs-rating-chip', `<span class="gs-dot" style="background:#fff3cf">${ICON.star}</span><div><small>Rating</small><b></b></div>`)
    const musicChip = h('div', 'gs-chip gs-music')
    this.eqEl = h('span', 'gs-eq', '<i></i><i></i><i></i>')
    const toggle = h('button', '', ICON.music)
    toggle.title = 'Music on or off'
    toggle.onclick = () => handlers.onToggleMusic()
    this.trackEl = h('span', 'gs-track', 'Lo-fi radio')
    const next = h('button', '', ICON.next)
    next.title = 'Next track'
    next.onclick = () => handlers.onNextTrack()
    musicChip.append(toggle, this.eqEl, this.trackEl, next)
    const gear = h('button', 'gs-icon-btn', ICON.gear)
    gear.title = 'Settings'
    gear.style.pointerEvents = 'auto'
    gear.onclick = () => handlers.onSettings()
    top.append(this.dayEl, this.moneyEl, this.rateEl, h('div', 'gs-spacer'), musicChip, gear)
    const bottom = h('div', 'gs-hud-bottom')
    this.openBtn = h('button', 'gs-btn pink big gs-open', 'Open the salon')
    this.openBtn.onclick = () => handlers.onOpen()
    this.readyRow.hidden = true
    bottom.append(this.readyRow, this.openBtn)
    this.hint = h('div', 'gs-hint', '')
    this.el.append(top, this.toasts, bottom, this.hint)
    host.append(this.el)
  }

  setTrack(title: string) { this.trackEl.textContent = title }
  setMusicOn(on: boolean) { this.eqEl.classList.toggle('off', !on) }

  update(v: HudView, dt: number) {
    // The day line.
    const phaseText = v.phase === 'prep' ? 'Getting ready' : v.phase === 'open' ? 'Open' : v.phase === 'closing' ? 'Last customers' : 'Closed'
    const key = `${v.day}|${phaseText}|${v.served}|${v.total}|${v.rating}|${v.reviews}`
    if (key !== this.lastKey) {
      this.lastKey = key
      const pct = v.total ? Math.round((v.served / v.total) * 100) : 0
      this.dayEl.innerHTML = `<div class="gs-day-line"><b>Day ${v.day}</b><span>${phaseText}</span></div><div class="gs-day-line"><span>${v.served} of ${v.total} customers</span></div><div class="gs-dayline-bar"><i style="width:${pct}%"></i></div>`
      ;(this.rateEl.querySelector('b') as HTMLElement).innerHTML = v.reviews ? `${v.rating.toFixed(1)} ${stars(v.rating)}` : `<span style="font:700 13px Nunito">No reviews yet</span>`
    }
    // The wallet rolls to its new value.
    if (this.shownMoney === null) this.shownMoney = v.money
    if (this.shownMoney !== v.money) {
      const diff = v.money - this.shownMoney
      const step = Math.sign(diff) * Math.max(1, Math.abs(diff) * Math.min(1, dt * 6))
      this.shownMoney = Math.abs(diff) <= Math.abs(step) ? v.money : this.shownMoney + step
      if (this.moneyAnim <= 0) { this.moneyEl.classList.remove('bump'); void this.moneyEl.offsetWidth; this.moneyEl.classList.add('bump'); this.moneyAnim = 0.5 }
    }
    this.moneyAnim -= dt
    ;(this.moneyEl.querySelector('b') as HTMLElement).textContent = money(this.shownMoney)
    this.openBtn.hidden = v.phase !== 'prep'
    // Co-op: everyone taps "Ready"; the day opens when the last one does.
    const coop = v.players.length > 1
    const meReady = v.ready.includes(v.me)
    const readyKey = v.phase === 'prep' && coop ? `${v.players.map(p => `${p.id}:${p.name}:${v.ready.includes(p.id)}`).join(',')}|${v.me}` : ''
    if (readyKey !== this.readyKey) {
      this.readyKey = readyKey
      if (!coop) { this.openBtn.textContent = 'Open the salon'; this.openBtn.disabled = false }
      else if (!meReady) { this.openBtn.textContent = 'Ready to open'; this.openBtn.disabled = false }
      else { const waiting = v.players.filter(p => !v.ready.includes(p.id)).map(p => p.name); this.openBtn.textContent = `Waiting for ${waiting.join(' and ')}`; this.openBtn.disabled = true }
      this.readyRow.innerHTML = readyKey ? v.players.map(p => `<span class="gs-ready${v.ready.includes(p.id) ? ' on' : ''}"><i style="background:${PLAYER_CSS[p.id % 4]}"></i>${esc(p.name)}<b>${v.ready.includes(p.id) ? '&#10003;' : ''}</b></span>`).join('') : ''
      this.readyRow.hidden = !readyKey
    }
    const touch = settings.control === 'touch' || matchMedia('(pointer: coarse)').matches
    this.hint.textContent = v.phase === 'prep' ? (touch ? 'Tap the floor to walk. Tap the desk for the salon computer.' : 'Walk with WASD, arrows or a tap. The salon computer is at the desk.') : ''
    this.hint.style.opacity = v.phase === 'prep' && v.players.length < 2 ? '1' : '0'
    // Toasts from new events.
    for (const e of v.events) {
      if (e.seq <= this.lastSeq) continue
      if (this.lastSeq >= 0) this.eventToast(e, v)
    }
    const last = v.events[v.events.length - 1]
    if (last) this.lastSeq = Math.max(this.lastSeq, last.seq)
    else if (this.lastSeq < 0) this.lastSeq = 0
    this.updateVote(v)
  }

  private eventToast(e: GameEvent, v: HudView) {
    const colour = e.kind === 'arrive' ? '#8fe0c4' : e.kind === 'paid' ? '#f7c948' : e.kind === 'bought' ? '#b9a5ee' : e.kind === 'declined' ? '#f59ab7' : '#f7b7cc'
    if (e.kind === 'vote') return
    if (e.kind === 'paid' && v.players.length > 1 && e.player !== undefined && e.player >= 100) return
    this.toast(e.text, colour)
  }

  toast(text: string, colour = '#f7b7cc', ms = 3200) {
    const t = h('div', 'gs-toast', `<i class="gs-swatch" style="background:${colour}"></i><span>${esc(text)}</span>`)
    this.toasts.append(t)
    while (this.toasts.children.length > 3) this.toasts.firstElementChild?.remove()
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 400) }, ms)
  }

  private updateVote(v: HudView) {
    const nameOf = (id: number) => v.players.find(p => p.id === id)?.name ?? 'Someone'
    let key = ''
    let html = ''
    let canVote = false
    let isExt = false
    if (v.pending) {
      const item = ITEM_BY_ID[v.pending.item]
      key = `p${v.pending.id}|${v.pending.yes.join(',')}`
      canVote = !v.pending.yes.includes(v.me)
      const waiting = v.players.filter(p => !v.pending!.yes.includes(p.id)).map(p => esc(p.name)).join(' and ')
      html = `<span><b style="color:${PLAYER_CSS[v.pending.by % 4]}">${esc(nameOf(v.pending.by))}</b> wants to buy <b>${esc(item?.name ?? v.pending.item)}</b> for ${money(item?.price ?? 0)}. ${canVote ? 'Agree?' : `Waiting for ${waiting}.`}</span>`
    } else if (v.vote) {
      isExt = true
      key = `e${v.vote.ref}|${v.vote.yes.join(',')}`
      canVote = !v.vote.yes.includes(v.me)
      const waiting = v.players.filter(p => !v.vote!.yes.includes(p.id)).map(p => esc(p.name)).join(' and ')
      html = `<span><b style="color:${PLAYER_CSS[v.vote.by % 4]}">${esc(nameOf(v.vote.by))}</b> wants to ${esc(v.vote.label)}. ${canVote ? 'Agree?' : `Waiting for ${waiting}.`}</span>`
    }
    if (key === this.voteKey) return
    this.voteKey = key
    this.voteEl?.remove()
    this.voteEl = null
    if (!key) return
    const el = h('div', 'gs-toast vote', html)
    if (canVote) {
      const yes = h('button', 'gs-btn mint', 'Yes, buy it')
      const no = h('button', 'gs-btn', 'Not yet')
      const id = v.pending?.id ?? 0
      yes.onclick = () => (isExt ? this.h.onExtVote(true) : this.h.onVote(id, true))
      no.onclick = () => (isExt ? this.h.onExtVote(false) : this.h.onVote(id, false))
      el.append(yes, no)
    }
    this.toasts.prepend(el)
    this.voteEl = el
  }

  set visible(on: boolean) { this.el.hidden = !on }

  destroy() { this.el.remove() }
}
