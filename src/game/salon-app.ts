import type { Application } from 'pixi.js'
import { music } from '../audio/music.ts'
import { sfx } from '../audio/sfx.ts'
import { handleGuestMessage, parseGuestMessage, publicState, routeOps, type GuestMessage, type HostMessage, type PublicState } from '../core/coop/protocol.ts'
import { ambienceStars, arrivals, ITEM_BY_ID, toolTier } from '../core/economy.ts'
import { spawnPoint, stationSpot } from '../core/floor.ts'
import { goalTally } from '../core/goals.ts'
import { average } from '../core/reviews.ts'
import { awards, newSave, reduce, startDay, tick, toSave, type Action, type SalonState } from '../core/salon.ts'
import { ext } from '../core/salon-ext.ts'
import { exportCode, importCode, loadSave, writeSave, type Store } from '../core/save.ts'
import type { Op, SessionSnapshot, TreatmentResult } from '../core/treatments/session.ts'
import { CoopLink, type CoopStatus } from '../net/coop-link.ts'
import { FloorView, type FloorCustomer, type FloorState } from '../render/floor-view.ts'
import { openTreatment } from './treatment-glue.ts'
import { warmCloseUps } from '../render/warmup.ts'
import { Computer } from '../ui/computer.ts'
import { FloorHud } from '../ui/floor-hud.ts'
import { Lobby, openSettings } from '../ui/lobby.ts'
import { Receipt, type ReceiptData } from '../ui/receipt.ts'
import { applySettings, saveSettings, settings } from '../ui/settings.ts'

/**
 * The salon side of Glow Salon, start to finish: the title screen over a live salon, solo play and co-op
 * (host or guest, through the relay), the salon floor with its HUD, the salon computer, the hand-off to a
 * treatment close-up and back, the end-of-day receipt and reviews, saves and the music. `startSalon` is
 * the one entry point; the treatment close-up is the TreatmentView unless the caller supplies its own.
 */
export type TreatmentHandoff = {
  stationId: string
  customer: FloorCustomer
  role: 'lead' | 'helper'
  playerId: number
  leadName: string
  tier: number
  ambience: number
  startStep: number
  /** Send treatment ops to the rest of the station's crew. */
  sendOps: (ops: Op[]) => void
  /** A helper joining late asks the lead for the treatment so far (the answer arrives as applySnapshot). */
  requestSync: () => void
  /** Report progress (the lead only), shown on the floor. */
  progress: (step: number, steps: number, progress: number) => void
  /** The treatment is done: pays, reviews, back to the floor. */
  finish: (result: TreatmentResult, foam: number) => void
  /** Back to the floor without finishing (the customer waits). */
  leave: () => void
}

/** What a treatment close-up must do for the salon to drive it. */
export type TreatmentScreen = {
  update: (dt: number) => void
  resize: (w: number, h: number) => void
  destroy: () => void
  applyRemote?: (ops: Op[], by: number) => void
  snapshot?: () => SessionSnapshot
  applySnapshot?: (snap: SessionSnapshot) => void
  /** The lead left: this helper now leads the treatment. */
  promote?: () => void
}

type HostLink = CoopLink<HostMessage, GuestMessage & { from?: number }>
type GuestLink = CoopLink<GuestMessage, HostMessage>

export type SalonOptions = {
  /** Open a treatment close-up. The default opens the TreatmentView on the same canvas. */
  openTreatment?: (handoff: TreatmentHandoff) => TreatmentScreen
}

type Mode = 'title' | 'floor' | 'treatment'

const store: Store | null = (() => { try { return window.localStorage } catch { return null } })()

export async function startSalon(app: Application, ui: HTMLElement, opts: SalonOptions = {}) {
  const game = new SalonGame(app, ui, opts)
  await game.boot()
  return game
}

export class SalonGame {
  private mode: Mode = 'title'
  private host: SalonState | null = null
  private snap: PublicState | null = null
  private me = 0
  private hostLink: HostLink | null = null
  private guestLink: GuestLink | null = null
  private joined = false
  private floor: FloorView | null = null
  private demo: { view: FloorView; state: SalonState } | null = null
  private hud: FloorHud | null = null
  private computer: Computer | null = null
  private receipt: Receipt | null = null
  private receiptDay = -1
  private lobby: Lobby
  private screen: { view: TreatmentScreen; station: string; customer: number; role: 'lead' | 'helper' } | null = null
  private snapTimer = 0
  private saveTimer = 0
  private app: Application
  private ui: HTMLElement
  private opts: SalonOptions

  constructor(app: Application, ui: HTMLElement, opts: SalonOptions) {
    this.app = app
    this.ui = ui
    this.opts = opts
    this.lobby = new Lobby(ui, {
      saveInfo: () => { const s = loadSave(store); return s ? { day: s.day, money: s.money, salonName: s.ext?.salonName ?? 'Glow Salon' } : null },
      onContinue: () => this.playSolo(loadSave(store) ?? newSave()),
      onNewGame: () => this.playSolo(newSave()),
      onHost: () => this.hostGame(),
      onJoin: code => this.joinGame(code),
      exportCode: () => { const s = this.host ? toSave(this.host) : loadSave(store); return s ? exportCode(s) : null },
      importCode: code => { const r = importCode(code); if (!r.ok) return r; writeSave(store, r.save); return { ok: true } },
    })
  }

  async boot() {
    applySettings()
    await music.load()
    music.onTrack = t => this.hud?.setTrack(t.title)
    const unlock = () => { sfx.unlock(); if (settings.musicOn) music.start() }
    window.addEventListener('pointerdown', unlock, { once: true })
    window.addEventListener('keydown', unlock, { once: true })
    window.addEventListener('resize', () => this.resize())
    window.addEventListener('beforeunload', () => this.save())
    this.app.ticker.add(t => this.frame(Math.min(0.05, t.deltaMS / 1000)))
    // A hidden tab gets no animation frames: while hosting, keep the day and the guests' snapshots going.
    let last = performance.now()
    setInterval(() => {
      const now = performance.now()
      const dt = Math.min(0.25, (now - last) / 1000)
      last = now
      // Hidden, or simply not getting frames (a background tab or window some browsers pause without hiding).
      const stalled = now - this.lastFrame > 400
      if ((!document.hidden && !stalled) || !this.host || !this.hostLink?.paired) return
      tick(this.host, dt)
      this.sendSnap()
    }, 100)
    this.toTitle()
    const params = new URLSearchParams(location.search)
    const room = params.get('join') ?? params.get('room')
    if (room) this.lobby.showInvite(room, params.get('from') ?? '')
  }

  // ------------------------------------------------------------------ modes

  private toTitle() {
    this.save()
    this.leaveTreatment(false)
    this.computer?.close(); this.computer = null
    this.receipt?.close(); this.receipt = null
    this.hud?.destroy(); this.hud = null
    this.floor?.destroy(); this.floor = null
    this.hostLink?.close(); this.hostLink = null
    this.guestLink?.close(); this.guestLink = null
    this.host = null; this.snap = null
    this.mode = 'title'
    this.demo = makeDemo(this.app)
    this.app.stage.addChild(this.demo.view.root)
    this.lobby.showTitle()
    warmCloseUps(this.app.renderer)
  }

  private enterFloor() {
    this.lobby.hide()
    if (this.demo) { this.demo.view.destroy(); this.demo = null }
    this.floor = new FloorView(this.app, this.me, {
      onAction: a => this.act(a),
      onStartTreatment: (st, c) => this.startTreatment(st, c),
      onOpenComputer: tab => this.openComputer(tab),
      // Something that stands in the salon was bought here: close the shop so the camera can show it.
      onBoughtHere: item => { const e = ITEM_BY_ID[item]?.effect; if (e && (e.kind === 'decor' || e.kind === 'station' || e.kind === 'treatment')) setTimeout(() => this.computer?.close(), 350) },
    })
    this.app.stage.addChildAt(this.floor.root, 0)
    this.hud = new FloorHud(this.ui, {
      onOpen: () => { sfx.unlock(); sfx.bellDesk(); this.act({ a: 'ready' }) },
      onNextTrack: () => { sfx.click(); music.next() },
      onToggleMusic: () => { saveSettings({ musicOn: !settings.musicOn }); if (settings.musicOn) music.start(); this.hud?.setMusicOn(settings.musicOn) },
      onSettings: () => openSettings(this.ui, { onQuit: () => this.toTitle(), onRename: name => { if (name) this.act({ a: 'rename', name }) } }),
      onVote: (id, yes) => this.act({ a: 'vote', id, yes }),
      onExtVote: yes => this.act({ a: 'extVote', yes }),
    })
    this.hud.setMusicOn(settings.musicOn)
    if (music.track) this.hud.setTrack(music.track.title)
    this.mode = 'floor'
    const s = this.view()
    if (s) this.floor.setState(s)
    this.resize()
  }

  private myName() { return settings.name || (this.me === 0 ? 'You' : `Player ${this.me + 1}`) }

  private playSolo(save: ReturnType<typeof newSave>) {
    this.host = startDay(save, [])
    this.me = 0
    reduce(this.host, 0, { a: 'join', name: this.myName() })
    this.enterFloor()
    const at = spawnPoint(0)
    this.floor!.placeMe(at.x, at.y)
    this.save()
    this.newInShop(this.host.day)
  }

  private hostGame() {
    this.playSolo(loadSave(store) ?? newSave())
    const link: HostLink = new CoopLink(
      msg => { if (typeof msg.from === 'number') { const { from, ...rest } = msg; this.onGuest(rest as GuestMessage, from) } },
      status => this.onHostStatus(status),
      (id, joined) => {
        if (!this.host || joined) return
        const name = this.host.players.find(p => p.id === id)?.name
        reduce(this.host, id, { a: 'leave' })
        // A friend leaving is a toast, never a room window popping up (over the receipt or anything else).
        if (name) this.hud?.toast(`${name} left the salon`, '#cdbdf2')
        // Everyone still here was ready: open without waiting for the one who left.
        const ready = this.host.ext?.today.ready ?? []
        if (this.host.phase === 'prep' && ready.length && this.host.players.every(p => ready.includes(p.id))) reduce(this.host, 0, { a: 'open' })
        if (this.lobby.roomOpen) this.showRoom('')
      },
    )
    this.hostLink = link
    link.open()
  }

  private onHostStatus(status: CoopStatus) {
    if (status.kind === 'waiting') this.showRoom('Waiting for friends to join.')
    else if (status.kind === 'paired' && (this.lobby.roomOpen || this.host?.phase === 'prep')) this.showRoom('')
    else if (status.kind === 'error') { this.hud?.toast(`${status.reason} You are playing solo.`, '#f59ab7', 5000); this.lobby.hide() }
  }

  private showRoom(status: string) {
    const link = this.hostLink
    if (!link || !this.host || !link.code || this.mode === 'title') return
    this.lobby.onCoopStart = () => {}
    const invite = `${link.link}${link.link.includes('?') ? '&' : '?'}from=${encodeURIComponent(this.myName())}`
    this.lobby.showCoop({ code: link.code, link: invite, players: this.host.players.map(p => ({ id: p.id, name: p.name })), role: 'host', me: 0, status, canStart: true })
  }

  private joinGame(code: string) {
    this.lobby.hide()
    this.joined = false
    const link: GuestLink = new CoopLink(
      msg => this.onHost(msg),
      status => {
        if (status.kind === 'paired' && !this.joined) {
          this.joined = true
          this.me = link.id
          link.send({ t: 'hello', name: this.myName() })
          this.enterFloor()
          const at = spawnPoint(this.me)
          this.floor?.placeMe(at.x, at.y)
          this.hud?.toast('Joined! Say hi to your salon partner.', '#8fe0c4')
        } else if (status.kind === 'error' || (status.kind === 'alone' && this.joined)) {
          const reason = status.kind === 'error' ? status.reason : 'Your friend closed their salon.'
          this.toTitle()
          this.lobbyToast(reason)
        }
      },
    )
    this.guestLink = link
    link.open(code.trim().toUpperCase())
  }

  private lobbyToast(text: string) { this.lobby.notice(text) }

  // ------------------------------------------------------------------ state and actions

  /** The salon as this screen sees it. */
  private view(): (FloorState & { money: number; seed: number; rating: { sum: number; count: number }; reviews: SalonState['reviews']; spawned: number }) | null {
    return this.host ?? this.snap
  }

  private act(a: Action) {
    if (this.host) {
      const before = this.host.owned.length
      reduce(this.host, this.me, a)
      if (a.a === 'buy' && this.host.owned.length !== before) this.save()
      if (a.a === 'next' || a.a === 'hire' || a.a === 'campaign' || a.a === 'renameStaff') this.save()
    } else this.guestLink?.send({ t: 'act', a })
  }

  private onGuest(raw: GuestMessage, from: number) {
    if (!this.host) return
    const msg = parseGuestMessage(raw)
    if (!msg) return
    const wasNew = msg.t === 'hello' && !this.host.players.some(p => p.id === from)
    for (const d of handleGuestMessage(this.host, from, msg)) {
      if (d.to === this.me) this.deliver(d.msg)
      else this.hostLink?.send(d.msg, { to: d.to })
    }
    if (wasNew) { const name = this.host.players.find(p => p.id === from)?.name ?? 'A friend'; this.hud?.toast(`${name} joined the salon`, '#8fe0c4'); sfx.door(); if (this.lobby.roomOpen || this.host.phase === 'prep') this.showRoom(''); this.sendSnap() }
  }

  private onHost(msg: HostMessage) {
    if (msg.t === 'snap') { this.snap = msg.s; return }
    this.deliver(msg)
  }

  /** Treatment traffic for this screen's close-up. */
  private deliver(msg: HostMessage) {
    const sc = this.screen
    if (msg.t === 'ops') { if (sc && sc.station === msg.st) sc.view.applyRemote?.(msg.ops, msg.by) }
    else if (msg.t === 'syncReq') {
      if (!sc || sc.station !== msg.st || sc.role !== 'lead' || !sc.view.snapshot) return
      const snap = sc.view.snapshot()
      if (this.host) this.hostLink?.send({ t: 'sync', st: msg.st, snap }, { to: msg.by })
      else this.guestLink?.send({ t: 'sync', st: msg.st, to: msg.by, snap })
    } else if (msg.t === 'sync') { if (sc && sc.station === msg.st) sc.view.applySnapshot?.(msg.snap) }
  }

  private sendOps(station: string, ops: Op[]) {
    if (this.host) { for (const d of routeOps(this.host, station, this.me, ops)) this.hostLink?.send(d.msg, { to: d.to }) }
    else this.guestLink?.send({ t: 'ops', st: station, ops })
  }

  private requestSync(station: string) {
    const st = this.view()?.stations.find(x => x.id === station)
    if (this.host) { if (st?.lead !== null && st?.lead !== undefined && st.lead !== this.me) this.hostLink?.send({ t: 'syncReq', st: station, by: this.me }, { to: st.lead }) }
    else this.guestLink?.send({ t: 'syncReq', st: station })
  }

  private sendSnap() { if (this.host && this.hostLink?.paired) this.hostLink.send({ t: 'snap', s: publicState(this.host) }) }

  /**
   * Saves happen at day boundaries only: before opening (as is) and at closing time (as the next morning).
   * A day left half-way is replayed from its start, so its earnings are never counted twice.
   */
  private save() {
    const s = this.host
    if (!s) return
    if (s.phase === 'prep') writeSave(store, toSave(s))
    else if (s.phase === 'receipt') writeSave(store, { ...toSave(s), day: s.day + 1 })
  }

  // ------------------------------------------------------------------ the computer

  private openComputer(tab?: 'stations') {
    const s = this.view()
    if (!s || this.computer) return
    this.floor!.inputEnabled = false
    this.computer = new Computer(this.ui, { onAction: a => this.act(a), onClose: () => { this.computer = null; if (this.floor) this.floor.inputEnabled = true } }, tab)
    this.computer.update(s)
  }

  // ------------------------------------------------------------------ treatments

  private startTreatment(stationId: string, customer: FloorCustomer) {
    const s = this.view()
    if (!s || this.screen) return
    const st = s.stations.find(x => x.id === stationId)
    if (!st) return
    const role: 'lead' | 'helper' = st.lead === null || st.lead === this.me ? 'lead' : 'helper'
    const leadName = s.players.find(p => p.id === (st.lead ?? this.me))?.name ?? this.myName()
    this.computer?.close()
    const handoff: TreatmentHandoff = {
      stationId, customer, role, playerId: this.me, leadName,
      tier: toolTier(s.owned, customer.plan.treatment), ambience: ambienceStars(s.owned), startStep: st.step,
      sendOps: ops => this.sendOps(stationId, ops),
      requestSync: () => this.requestSync(stationId),
      progress: (step, steps, progress) => this.act({ a: 'progress', station: stationId, step, steps, progress }),
      finish: (result, foam) => { this.act({ a: 'finish', station: stationId, result, foam }); this.leaveTreatment(true) },
      leave: () => { this.act({ a: 'stopWork', station: stationId }); this.leaveTreatment(true) },
    }
    const view = this.opts.openTreatment ? this.opts.openTreatment(handoff) : this.defaultTreatment(handoff, s)
    if (!view) return
    this.screen = { view, station: stationId, customer: customer.id, role }
    this.mode = 'treatment'
    music.quiet(true)
    if (this.floor) { this.floor.root.visible = false; this.floor.inputEnabled = false }
    if (this.hud) this.hud.visible = false
    this.resize()
  }

  /** The real close-up, through the treatment glue (it asks the lead for a snapshot when helping). */
  private defaultTreatment(h: TreatmentHandoff, s: NonNullable<ReturnType<SalonGame['view']>>): TreatmentScreen | null {
    // A guest's copy of the salon has not heard back yet: take the lead we just asked for.
    const stations = s.stations.map(st => (st.id === h.stationId && st.lead === null ? { ...st, lead: this.me } : st))
    return openTreatment({
      app: this.app, overlay: this.ui, state: { stations, customers: s.customers as SalonState['customers'], players: s.players, owned: s.owned, stats: s.stats, ext: s.ext },
      stationId: h.stationId, me: this.me,
      net: { sendOps: (_st, ops) => h.sendOps(ops), requestSync: () => h.requestSync() },
      onProgress: h.progress, onFinish: h.finish, onLeave: h.leave,
    })
  }

  private leaveTreatment(backToFloor: boolean) {
    const sc = this.screen
    if (!sc) return
    this.screen = null
    sc.view.destroy()
    if (!backToFloor) return
    this.mode = 'floor'
    music.quiet(false)
    const s = this.view()
    const st = s?.stations.find(x => x.id === sc.station)
    if (this.floor) {
      this.floor.root.visible = true
      this.floor.inputEnabled = true
      if (st) { const spot = stationSpot(st.slot); this.floor.placeMe(spot.x, spot.y + 26) }
    }
    if (this.hud) this.hud.visible = true
  }

  // ------------------------------------------------------------------ the end of the day

  private showReceipt(s: NonNullable<ReturnType<SalonGame['view']>>) {
    this.receiptDay = s.day
    this.computer?.close()
    const e = s.ext
    const st = s.stats
    const wages = e?.today.wages ?? 0
    const news: string[] = []
    for (const f of e?.today.friendUps ?? []) news.push(f.gift ? `${f.name} is now a close friend and left you a gift: ${f.gift}. It is on the gift shelf.` : `${f.name} likes your salon more: friendship ${f.level} of 5.`)
    for (const n of e?.today.levelUps ?? []) news.push(`${n} levelled up and got a little raise.`)
    if (s.day % 7 === 0) news.push('New staff candidates arrive tomorrow at the salon computer.')
    for (const c of e?.campaigns ?? []) if (c.day === 0) news.push('Your new campaign starts tomorrow.')
    const goal = e?.today.goal ?? null
    const bonus = goal?.done ? goal.reward : 0
    const data: ReceiptData = {
      day: s.day, salonName: e?.salonName ?? 'Glow Salon', revenue: st.revenue, tips: st.tips, costs: st.costs, wages,
      net: st.revenue + st.tips + bonus - st.costs - wages, served: st.served, ratingBefore: st.ratingBefore, ratingAfter: average(s.rating),
      reviewsTotal: s.rating.count, histBefore: histBefore(s), reviews: st.reviews, allReviews: s.reviews, awards: awards(st), players: s.players, owned: s.owned, money: s.money, news,
      goal: goal ? { text: goal.text, reward: goal.reward, done: goal.done } : null,
    }
    const tomorrow = s.day + 1
    this.receipt = new Receipt(this.ui, data, { onNext: () => { this.receipt = null; this.act({ a: 'next' }); const at = spawnPoint(this.me); this.floor?.placeMe(at.x, at.y); this.newInShop(tomorrow) } })
    this.save()
  }

  /** A morning toast for what just arrived in the shop. */
  private newInShop(day: number) {
    const fresh = arrivals(day)
    if (fresh.length) setTimeout(() => this.hud?.toast(`New in the shop: ${fresh.map(i => i.name).slice(0, 3).join(', ')}${fresh.length > 3 ? ' and more' : ''}`, '#b9a5ee', 5000), 900)
  }

  // ------------------------------------------------------------------ the frame

  private lastFrame = performance.now()

  private frame(dt: number) {
    this.lastFrame = performance.now()
    if (this.mode === 'title' && this.demo) {
      const d = this.demo
      tick(d.state, dt)
      if (d.state.phase === 'receipt') { reduce(d.state, 0, { a: 'next' }); reduce(d.state, 0, { a: 'open' }) }
      d.view.setState(d.state)
      d.view.update(dt)
      return
    }
    if (this.host) tick(this.host, dt)
    const s = this.view()
    if (!s) return
    if (this.floor) { this.floor.setState(s); this.floor.update(dt) }
    if (this.hud) {
      const pending = s.pending
      const goal = s.ext?.today.goal ?? null
      this.hud.update({ day: s.day, phase: s.phase, money: s.money, rating: average(s.rating), reviews: s.rating.count, arrived: s.spawned, total: this.host ? this.host.schedule.length : (s as PublicState).scheduled, served: s.stats.served, players: s.players, events: s.events, pending, vote: s.ext?.vote ?? null, ready: s.ext?.today.ready ?? [], me: this.me, goal: goal ? { text: goal.text, target: goal.target, reward: goal.reward, done: goal.done, now: goalTally(s)[goal.kind] } : null }, dt)
    }
    this.computer?.update(s)
    // The close-up: keep it running; a helper's view closes when the lead finishes.
    const sc = this.screen
    if (sc) {
      sc.view.update(dt)
      const st = s.stations.find(x => x.id === sc.station)
      if (sc.role === 'helper' && (!st || st.customer !== sc.customer)) this.leaveTreatment(true)
      // The lead left and this helper took over.
      else if (sc.role === 'helper' && st?.lead === this.me) { sc.role = 'lead'; sc.view.promote?.() }
    }
    // The day's end, and the next day for everyone.
    if (s.phase === 'receipt' && !this.receipt && this.receiptDay !== s.day && !this.screen) this.showReceipt(s)
    if (s.phase !== 'receipt' && this.receipt) { this.receipt.close(); this.receipt = null }
    if (s.phase !== 'receipt') this.receiptDay = -1
    // Host duties: snapshots for guests, and a save now and then.
    if (this.host) {
      this.snapTimer -= dt
      if (this.snapTimer <= 0 && this.hostLink?.paired) { this.snapTimer = 0.1; this.sendSnap() }
      this.saveTimer -= dt
      if (this.saveTimer <= 0) { this.saveTimer = 20; this.save() }
    }
  }

  private resize() {
    const w = this.app.screen.width, h = this.app.screen.height
    this.floor?.resize(w, h)
    this.demo?.view.resize(w, h)
    this.screen?.view.resize(w, h)
  }
}

/** The star histogram as it was this morning: the saved counts minus today's reviews (older saves: from the kept reviews). */
function histBefore(s: { ext?: { stars: number[] }; reviews: { stars: number }[]; stats: { reviews: { stars: number }[] }; rating: { count: number } }): number[] {
  const total = s.ext?.stars.reduce((a, b) => a + b, 0) ?? 0
  const hist = total >= s.rating.count && s.ext ? [...s.ext.stars] : [0, 0, 0, 0, 0]
  if (!(total >= s.rating.count && s.ext)) for (const r of s.reviews) hist[Math.max(1, Math.min(5, r.stars)) - 1]++
  for (const r of s.stats.reviews) { const i = Math.max(1, Math.min(5, r.stars)) - 1; hist[i] = Math.max(0, hist[i] - 1) }
  return hist
}

/** The title screen's backdrop: a busy little salon running itself, with staff at every station. */
function makeDemo(app: Application): { view: FloorView; state: SalonState } {
  const save = newSave(20260925)
  save.money = 99999
  save.owned = ['treat-nails', 'nail-desk', 'facial-chair-2', 'plant', 'rug', 'lights', 'candles', 'art', 'neon', 'flyers', 'social', 'pastel-pop:candy-sofa', 'pastel-pop:heart-mirror', 'pastel-pop:bubble-lamp']
  save.rating = { sum: 46, count: 10 }
  const state = startDay(save, [])
  for (const idx of [0, 1, 2]) reduce(state, 0, { a: 'hire', idx })
  const e = ext(state)
  const free = e.staff.find(s => s.station === null)
  if (free) reduce(state, 0, { a: 'assignStaff', id: free.id, station: 's0' })
  reduce(state, 0, { a: 'open' })
  for (let t = 0; t < 30; t += 0.1) tick(state, 0.1)
  const view = new FloorView(app, -1, { onAction: () => {}, onStartTreatment: () => {}, onOpenComputer: () => {} }, { demo: true })
  view.setState(state)
  view.resize(app.screen.width, app.screen.height)
  return { view, state }
}
