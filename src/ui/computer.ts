import { decorPiece } from '../art/salon/decor-art.ts'
import { paintAquarium, paintCandles, paintChandelier, paintCloudRug, paintFacialChair, paintFairyLights, paintNailDesk, paintNeonGlow, paintPlant, paintWallArt, type Piece } from '../art/salon/furniture.ts'
import { portrait } from '../art/salon/people.ts'
import { RES } from '../art/salon/room.ts'
import { sfx } from '../audio/sfx.ts'
import { DECOR_SETS, DECOR_ITEM_BY_ID, completeSets, placeDecor, SET_BONUS } from '../core/decor.ts'
import { ambienceStars, canBuy, CONFIRM_PRICE, ITEM_BY_ID, ITEMS, type Item, type ShopTab } from '../core/economy.ts'
import { CAMPAIGNS, canRunCampaign, CAMPAIGN_BY_ID } from '../core/marketing.ts'
import type { Action, Pending, Player, Station } from '../core/salon.ts'
import type { SalonExt } from '../core/salon-ext.ts'
import { candidatesFor, levelName, MAX_STAFF, STAFF_TRAIT_BY_ID, traitLabel, weekOf, xpToLevel, type Candidate, type StaffMember } from '../core/staff.ts'
import { COMING_SOON } from '../core/treatments/registry.ts'
import { confetti } from './confetti.ts'
import { esc, h, money } from './dom.ts'
import { ICON } from './salon-icons.ts'
import './salon.css'

/**
 * The salon computer: a pastel "GlowOS" window where the players spend the shared wallet. Six tabs (tools,
 * stations, treatments, decor sets, marketing campaigns and staff), each card showing its price, what it
 * does and whether it can be bought yet. Buying rings the register and pops confetti; in co-op, big
 * purchases (and big hires) go to a vote everyone must agree to. Staff can be renamed right on their card.
 */
export type ComputerState = {
  day: number
  seed: number
  money: number
  owned: string[]
  stations: Station[]
  players: Player[]
  pending: Pending | null
  ext?: SalonExt
}

export type ComputerHooks = { onAction: (a: Action) => void; onClose: () => void }

type Tab = ShopTab
const TABS: { id: Tab; label: string; icon: keyof typeof ICON }[] = [
  { id: 'tools', label: 'Tools', icon: 'tools' },
  { id: 'stations', label: 'Stations', icon: 'chair' },
  { id: 'treatments', label: 'Treatments', icon: 'sparkle' },
  { id: 'decor', label: 'Decor', icon: 'plant' },
  { id: 'marketing', label: 'Marketing', icon: 'megaphone' },
  { id: 'staff', label: 'Staff', icon: 'staff' },
]

const TAB_INTRO: Record<Tab, string> = {
  tools: 'Better tools make every treatment quicker and prettier.',
  stations: 'More stations, more customers at once. Great for co-op and staff.',
  treatments: 'New treatments bring new customers and new tools to play with.',
  decor: 'Decor raises ambience: happier customers, more stars, bigger tips.',
  marketing: 'Campaigns bring extra customers for a few days. They start tomorrow.',
  staff: 'Hire help for your extra stations. Tap a name to rename them.',
}

// ------------------------------------------------------------------ painted previews for the cards

const previewCache = new Map<string, string>()
function previewOf(key: string, make: () => Piece | null): string {
  let url = previewCache.get(key)
  if (url === undefined) {
    const p = make()
    if (!p) url = ''
    else {
      const c = document.createElement('canvas')
      const box = 180
      c.width = box; c.height = box * 0.55
      const ctx = c.getContext('2d')!
      const s = Math.min((c.width * 0.86) / (p.w * RES), (c.height * 0.86) / (p.h * RES))
      const w = p.w * RES * s, hh = p.h * RES * s
      ctx.drawImage(p.canvas, (c.width - w) / 2, (c.height - hh) / 2, w, hh)
      url = c.toDataURL()
    }
    previewCache.set(key, url)
  }
  return url
}

const STARTER_ART: Record<string, () => Piece> = {
  plant: () => paintPlant(), candles: paintCandles, rug: paintCloudRug, lights: () => { const p = paintFairyLights(); return { ...p, w: 320 } }, art: paintWallArt,
  neon: () => paintNeonGlow().tube, aquarium: paintAquarium, chandelier: () => paintChandelier().body,
}

function itemArt(item: Item): string {
  if (item.effect.kind === 'decor') {
    if (DECOR_ITEM_BY_ID[item.id]) return img(previewOf(item.id, () => decorPiece(item.id)))
    const make = STARTER_ART[item.id]
    if (make) return img(previewOf(item.id, make))
  }
  if (item.effect.kind === 'station') return img(previewOf(`st-${item.effect.station}`, () => (item.effect.kind === 'station' && item.effect.station === 'nails' ? paintNailDesk().front : paintFacialChair().back)))
  if (item.tab === 'tools') return ICON.tools
  if (item.tab === 'treatments') return ICON.sparkle
  return ICON.bag
}
const img = (url: string) => (url ? `<img src="${url}" alt="">` : ICON.bag)

const starsRow = (n: number, max = 5) => `<span class="gs-stars">${Array.from({ length: max }, (_, i) => `<i class="${i < n ? 'on' : ''}">&#9733;</i>`).join('')}</span>`

export class Computer {
  readonly el = h('div', 'gs gs-veil')
  private win = h('div', 'gs-os')
  private main = h('div', 'gs-os-main')
  private tabsEl = h('div', 'gs-os-tabs')
  private moneyEl = h('div', 'gs-os-money')
  private tab: Tab = 'decor'
  private state: ComputerState | null = null
  private key = ''
  private lastMoney = -1
  private justBought = ''
  private hooks: ComputerHooks
  private host: HTMLElement

  constructor(host: HTMLElement, hooks: ComputerHooks, tab: Tab = 'tools') {
    this.host = host
    this.hooks = hooks
    this.tab = tab
    const bar = h('div', 'gs-os-bar', `<div class="gs-os-dots"><i></i><i></i><i></i></div><div class="gs-os-title">GlowOS<span>Salon shop</span></div>`)
    const close = h('button', 'gs-os-close', '&times;')
    close.title = 'Close (Esc)'
    close.onclick = () => this.close()
    bar.append(this.moneyEl, close)
    const body = h('div', 'gs-os-body')
    body.append(this.tabsEl, this.main)
    this.win.append(bar, body)
    this.el.append(this.win)
    this.el.addEventListener('pointerdown', e => { if (e.target === this.el) this.close() })
    window.addEventListener('keydown', this.onKey)
    host.append(this.el)
    sfx.click()
  }

  private onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !(e.target instanceof HTMLInputElement)) this.close() }

  close() {
    window.removeEventListener('keydown', this.onKey)
    this.el.classList.add('out')
    sfx.click()
    setTimeout(() => this.el.remove(), 240)
    this.hooks.onClose()
  }

  update(state: ComputerState) {
    this.state = state
    if (this.lastMoney !== state.money) {
      if (this.lastMoney >= 0) { this.moneyEl.classList.remove('bump'); void this.moneyEl.offsetWidth; this.moneyEl.classList.add('bump') }
      this.lastMoney = state.money
      this.moneyEl.textContent = money(state.money)
    }
    const e = state.ext
    const key = [this.tab, state.money, state.owned.join(','), state.stations.map(s => s.id).join(','), state.pending?.id ?? '', JSON.stringify(e?.staff.map(s => [s.name, s.station, s.level, s.xp, s.breakLeft > 0])), e?.campaigns.map(c => c.id + c.day).join(','), e?.loyalty, e?.hired.join(','), e?.vote?.ref, e?.decorOrder.slice(-8).join(','), state.day].join('|')
    if (key === this.key) return
    // Never rebuild under a name being typed.
    if (this.main.contains(document.activeElement) && document.activeElement instanceof HTMLInputElement) return
    this.key = key
    this.render()
  }

  private render() {
    const state = this.state!
    // Tabs, with a badge for what is affordable right now.
    this.tabsEl.innerHTML = ''
    for (const t of TABS) {
      const count = this.affordable(t.id)
      const b = h('button', `gs-tab${t.id === this.tab ? ' on' : ''}`, `${ICON[t.icon]}<span class="gs-tab-label">${t.label}</span>${count ? `<span class="gs-badge">${count}</span>` : ''}`)
      b.onclick = () => { if (this.tab !== t.id) { this.tab = t.id; sfx.click(); this.key = ''; this.update(state); this.main.scrollTop = 0 } }
      this.tabsEl.append(b)
    }
    const label = TABS.find(t => t.id === this.tab)!.label
    this.main.innerHTML = `<div class="gs-os-head"><div><h2>${label}</h2><p>${TAB_INTRO[this.tab]}</p></div></div>`
    if (this.tab === 'decor') this.renderDecor()
    else if (this.tab === 'marketing') this.renderMarketing()
    else if (this.tab === 'staff') this.renderStaff()
    else this.renderItems(ITEMS.filter(i => i.tab === this.tab && !i.soon))
    if (this.tab === 'treatments') {
      this.main.append(h('div', 'gs-section', 'Coming to the salon'))
      const grid = h('div', 'gs-grid')
      for (const name of COMING_SOON) grid.append(h('div', 'gs-card soon', `<div class="gs-card-art">${ICON.sparkle}</div><h3>${esc(name)}</h3><p>A whole new treatment family.</p><div class="gs-card-foot"><span class="gs-tagline">Coming soon</span></div>`))
      this.main.append(grid)
    }
  }

  private affordable(tab: Tab): number {
    const s = this.state!
    if (tab === 'marketing' || tab === 'staff') return 0
    return ITEMS.filter(i => i.tab === tab && canBuy(s.owned, s.money, i.id).ok).length
  }

  private itemCard(item: Item, extra = ''): HTMLElement {
    const s = this.state!
    const check = canBuy(s.owned, s.money, item.id)
    const owned = s.owned.includes(item.id)
    const locked = !owned && !check.ok && check.reason.startsWith('Needs') && !check.reason.includes('$')
    const card = h('div', `gs-card${owned ? ' owned' : ''}${locked ? ' locked' : ''}${this.justBought === item.id ? ' just' : ''}`)
    const vote = s.players.length > 1 && item.price >= CONFIRM_PRICE && !owned
    card.innerHTML = `<div class="gs-card-art">${itemArt(item)}</div><h3>${esc(item.name)}</h3><p>${esc(item.blurb)}</p>${extra}`
    const foot = h('div', 'gs-card-foot')
    foot.innerHTML = `<span class="gs-price">${owned ? 'Owned' : money(item.price)}</span>`
    if (!owned) {
      const btn = h('button', `gs-btn ${check.ok ? 'pink' : ''}`, check.ok ? (vote ? 'Ask to buy' : 'Buy') : esc(check.reason))
      btn.disabled = !check.ok || !!s.pending
      if (s.pending && check.ok) btn.textContent = 'Vote running'
      btn.onclick = ev => this.buy(item, ev, vote)
      foot.append(btn)
    } else if (DECOR_ITEM_BY_ID[item.id]) {
      const shown = placeDecor(s.owned, s.ext?.decorOrder ?? []).some(d => d.id === item.id)
      const btn = h('button', 'gs-btn small', shown ? 'On display' : 'Put out')
      btn.disabled = shown
      btn.onclick = () => { sfx.click(); this.hooks.onAction({ a: 'placeDecor', id: item.id }) }
      foot.append(btn)
    }
    card.append(foot)
    return card
  }

  private buy(item: Item, ev: MouseEvent, vote: boolean) {
    sfx.unlock()
    this.hooks.onAction({ a: 'buy', item: item.id })
    if (vote) { sfx.click(); return }
    sfx.cash()
    sfx.buy()
    this.justBought = item.id
    confetti(this.host, { x: ev.clientX, y: ev.clientY }, 80)
  }

  private renderItems(items: Item[]) {
    const grid = h('div', 'gs-grid')
    for (const item of items) grid.append(this.itemCard(item))
    this.main.append(grid)
  }

  private renderDecor() {
    const s = this.state!
    const amb = ambienceStars(s.owned)
    this.main.querySelector('.gs-os-head')!.insertAdjacentHTML('beforeend', `<div class="gs-chip" style="height:44px">${ICON.heart}<div><small>Ambience</small><b>${amb.toFixed(1)} / 5</b></div></div>`)
    this.main.append(h('div', 'gs-section', 'Starter touches'))
    this.renderItems(ITEMS.filter(i => i.tab === 'decor' && !DECOR_ITEM_BY_ID[i.id]))
    const complete = completeSets(s.owned)
    for (const set of DECOR_SETS) {
      const have = set.items.filter(i => s.owned.includes(i.id)).length
      const gate = ITEM_BY_ID[set.items[0].id].needs?.[0]
      const open = !gate || s.owned.includes(gate)
      const head = h('div', 'gs-section', `${esc(set.label)} <small>${have} of 6</small>${complete.includes(set.id) ? `<span class="gs-chip-lite">Set complete: +${SET_BONUS} ambience</span>` : `<small>Complete the set for +${SET_BONUS} ambience</small>`}${open ? '' : `<small>Opens after a ${esc(ITEM_BY_ID[gate!].name)}</small>`}`)
      this.main.append(head)
      const bar = h('div', 'gs-progress', `<i style="width:${(have / 6) * 100}%"></i>`)
      bar.style.margin = '-4px 0 10px'
      this.main.append(bar)
      this.renderItems(set.items.map(i => ITEM_BY_ID[i.id]))
    }
  }

  private renderMarketing() {
    const s = this.state!
    const e = s.ext
    const grid = h('div', 'gs-grid')
    for (const c of CAMPAIGNS) {
      const check = canRunCampaign(c.id, e?.campaigns ?? [], !!e?.loyalty, s.money)
      const running = e?.campaigns.find(a => a.id === c.id)
      const owned = c.permanent && e?.loyalty
      const card = h('div', `gs-card${owned || running ? ' owned' : ''}`)
      const status = owned ? 'Active for good' : running ? `Running: day ${running.day + 1} of ${c.perDay.length}` : ''
      card.innerHTML = `<div class="gs-card-art" style="background:linear-gradient(160deg,#fff6dc,#fde6ee)">${ICON.megaphone}</div><h3>${esc(c.label)}</h3><p>${esc(c.blurb)}</p>${status ? `<span class="gs-tagline">${status}</span>` : ''}`
      const foot = h('div', 'gs-card-foot', `<span class="gs-price">${owned ? 'Owned' : money(c.price)}</span>`)
      if (!owned && !running) {
        const vote = s.players.length > 1 && c.price >= CONFIRM_PRICE
        const btn = h('button', `gs-btn ${check.ok ? 'pink' : ''}`, check.ok ? (vote ? 'Ask to run' : 'Run it') : esc(check.ok ? '' : check.reason))
        btn.disabled = !check.ok || !!e?.vote
        btn.onclick = ev => {
          this.hooks.onAction({ a: 'campaign', id: c.id })
          if (vote) { sfx.click(); return }
          sfx.cash(); sfx.buy()
          confetti(this.host, { x: ev.clientX, y: ev.clientY }, 70)
        }
        foot.append(btn)
      }
      card.append(foot)
      grid.append(card)
    }
    this.main.append(grid)
    const active = (e?.campaigns ?? []).map(a => CAMPAIGN_BY_ID[a.id]?.label).filter(Boolean)
    if (active.length) this.main.append(h('div', 'gs-section', `Running now <small>${esc(active.join(', '))}</small>`))
  }

  private renderStaff() {
    const s = this.state!
    const e = s.ext
    const team = e?.staff ?? []
    this.main.append(h('div', 'gs-section', `Your team <small>${team.length} of ${Math.min(MAX_STAFF, Math.max(0, s.stations.length - 1 + Math.floor(s.stations.length / 3)))} places</small>`))
    if (!team.length) this.main.append(h('div', 'gs-empty', s.stations.length < 2 ? 'Staff work at your extra stations. Buy a second station first, then hire someone lovely.' : 'Nobody yet. Pick someone from this week’s candidates below.'))
    const grid = h('div', 'gs-grid')
    for (const m of team) grid.append(this.staffCard(m))
    this.main.append(grid)
    const week = weekOf(s.day)
    const daysLeft = 7 - ((s.day - 1) % 7)
    this.main.append(h('div', 'gs-section', `This week’s candidates <small>New faces in ${daysLeft} day${daysLeft === 1 ? '' : 's'}</small>`))
    const cgrid = h('div', 'gs-grid')
    candidatesFor(s.seed, week).forEach((c, i) => cgrid.append(this.candidateCard(c, i)))
    this.main.append(cgrid)
  }

  private skills(sk: { facial: number; nails: number }) {
    return `<div class="gs-skill">Facials ${starsRow(sk.facial)}</div><div class="gs-skill">Nails ${starsRow(sk.nails)}</div>`
  }

  private traits(ids: string[]) {
    return `<div class="gs-traits">${ids.map(t => `<span class="gs-trait" title="${esc(STAFF_TRAIT_BY_ID[t]?.effect ?? '')}">${esc(traitLabel(t))}</span>`).join('')}</div>`
  }

  private staffCard(m: StaffMember): HTMLElement {
    const s = this.state!
    const card = h('div', 'gs-card gs-staff')
    const pic = h('img')
    pic.src = portrait(m.look, 152, '#e6f7f0', 'staff')
    const info = h('div', 'gs-staff-info')
    const row = h('div', 'gs-name-row')
    const input = h('input', 'gs-name-input') as HTMLInputElement
    input.value = m.name
    input.maxLength = 14
    input.setAttribute('aria-label', 'Staff name')
    const commit = () => { const v = input.value.trim(); if (v && v !== m.name) { sfx.click(); this.hooks.onAction({ a: 'renameStaff', id: m.id, name: v }) } else input.value = m.name }
    input.addEventListener('keydown', ev => { ev.stopPropagation(); if (ev.key === 'Enter') input.blur(); if (ev.key === 'Escape') { input.value = m.name; input.blur() } })
    input.addEventListener('blur', commit)
    const pen = h('button', 'gs-pencil', ICON.pencil)
    pen.title = 'Rename'
    pen.onclick = () => { input.focus(); input.select() }
    row.append(input, pen)
    const lvl = `<div class="gs-skill">${esc(levelName(m.level))}, level ${m.level} <span style="flex:1"></span>${money(m.wage)} a day</div><div class="gs-progress"><i style="width:${Math.min(100, (m.xp / xpToLevel(m.level)) * 100)}%"></i></div>`
    info.append(row)
    info.insertAdjacentHTML('beforeend', `${this.traits(m.traits)}${this.skills(m.skills)}${lvl}`)
    const sel = h('select', 'gs-select') as HTMLSelectElement
    sel.innerHTML = `<option value="">Helping at reception</option>` + s.stations.map((st, i) => `<option value="${st.id}">${st.kind === 'facial' ? 'Facial chair' : 'Nail desk'} ${i + 1}</option>`).join('')
    sel.value = m.station ?? ''
    sel.onchange = () => { sfx.click(); this.hooks.onAction({ a: 'assignStaff', id: m.id, station: sel.value || null }) }
    const where = h('div', 'gs-skill', 'Works at ')
    where.append(sel)
    info.append(where)
    if (m.breakLeft > 0) info.insertAdjacentHTML('beforeend', `<span class="gs-tagline">On a tea break</span>`)
    card.append(pic, info)
    return card
  }

  private candidateCard(c: Candidate, idx: number): HTMLElement {
    const s = this.state!
    const e = s.ext
    const hired = e?.hired.includes(idx)
    const card = h('div', `gs-card gs-staff${hired ? ' owned' : ''}`)
    const pic = h('img')
    pic.src = portrait(c.look, 152, '#fde6ee')
    const info = h('div', 'gs-staff-info')
    info.innerHTML = `<div class="gs-g-name">${esc(c.name)}</div>${this.traits(c.traits)}${this.skills(c.skills)}<div class="gs-skill">${money(c.wage)} a day</div>`
    const foot = h('div', 'gs-card-foot', `<span class="gs-price">${hired ? 'Hired' : money(c.fee)}</span>`)
    if (!hired) {
      const staffCap = Math.min(MAX_STAFF, s.stations.length - 1 + Math.floor(s.stations.length / 3))
      const reason = s.stations.length < 2 ? 'Needs a second station' : (e?.staff.length ?? 0) >= staffCap ? 'Needs another station' : s.money < c.fee ? `Needs ${money(c.fee - s.money)} more` : ''
      const vote = s.players.length > 1 && c.fee >= CONFIRM_PRICE
      const btn = h('button', `gs-btn ${reason ? '' : 'mint'}`, reason || (vote ? 'Ask to hire' : 'Hire'))
      btn.disabled = !!reason || !!e?.vote
      btn.onclick = ev => {
        this.hooks.onAction({ a: 'hire', idx })
        if (vote) { sfx.click(); return }
        sfx.cash(); sfx.buy()
        confetti(this.host, { x: ev.clientX, y: ev.clientY }, 80)
      }
      foot.append(btn)
    }
    info.append(foot)
    card.append(pic, info)
    return card
  }
}
