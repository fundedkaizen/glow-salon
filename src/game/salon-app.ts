import type { Application } from 'pixi.js'
import { music } from '../audio/music.ts'
import { sfx } from '../audio/sfx.ts'
import { handleGuestMessage, parseGuestMessage, publicState, routeOps, type GuestMessage, type HostMessage, type PublicState } from '../core/coop/protocol.ts'
import { ambienceStars, toolTier } from '../core/economy.ts'
import { stationSpot } from '../core/floor.ts'
import { average } from '../core/reviews.ts'
import { awards, newSave, reduce, startDay, tick, toSave, type Action, type SalonState } from '../core/salon.ts'
import { ext } from '../core/salon-ext.ts'
import { exportCode, importCode, loadSave, writeSave, type Store } from '../core/save.ts'
import type { Op, SessionSnapshot, TreatmentResult } from '../core/treatments/session.ts'
import { CoopLink } from '../net/coop-link.ts'
import { FloorView, type FloorCustomer, type FloorState } from '../render/floor-view.ts'
import { TreatmentView } from '../render/treatment-view.ts'
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
}

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
  private link: CoopLink | null = null
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
    this.toTitle()
    const room = new URLSearchParams(location.search).get('room')
    if (room) this.lobby.showCoopChoice(room)
  }

  // ------------------------------------------------------------------ modes

  private toTitle() {
    this.save()
    this.leaveTreatment(false)
    this.computer?.close(); this.computer = null
    this.receipt?.close(); this.receipt = null
    this.hud?.destroy(); this.hud = null
    this.floor?.destroy(); this.floor = null
    this.link?.close(); this.link = null
    this.host = null; this.snap = null
    this.mode = 'title'
    this.demo = makeDemo(this.app)
    this.app.stage.addChild(this.demo.view.root)
    this.lobby.showTitle()
  }

  private enterFloor() {
    this.lobby.hide()
    if (this.demo) { this.demo.view.destroy(); this.demo = null }
    this.floor = new FloorView(this.app, this.me, {
      onAction: a => this.act(a),
      onStartTreatment: (st, c) => this.startTreatment(st, c),
      onOpenComputer: () => this.openComputer(),
    })
    this.app.stage.addChildAt(this.floor.root, 0)
    this.hud = new FloorHud(this.ui, {
      onOpen: () => { sfx.unlock(); sfx.bellDesk(); this.act({ a: 'open' }) },
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
    this.floor!.placeMe(240, 420)
    this.save()
  }

  private hostGame() {
    this.playSolo(loadSave(store) ?? newSave())
    const link = CoopLink.host({
      onRoom: () => this.showRoom('Waiting for friends to join.'),
      onPeer: (joined, id) => {
        if (!this.host) return
        if (!joined) { const name = this.host.players.find(p => p.id === id)?.name; reduce(this.host, id, { a: 'leave' }); if (name) this.hud?.toast(`${name} left the salon`, '#cdbdf2') }
        this.showRoom('')
      },
      onGuestMessage: (raw, from) => this.onGuest(raw, from),
      onHostMessage: () => {},
      onError: reason => { this.hud?.toast(reason, '#f59ab7', 5000); this.lobby.hide() },
      onClosed: () => this.hud?.toast('The co-op connection closed. You are playing solo.', '#f59ab7', 5000),
    })
    this.link = link
  }

  private showRoom(status: string) {
    const link = this.link
    if (!link || !this.host || !link.code) return
    this.lobby.onCoopStart = () => {}
    this.lobby.showCoop({ code: link.code, link: link.inviteUrl(), players: this.host.players.map(p => ({ id: p.id, name: p.name })), role: 'host', me: 0, status, canStart: true })
  }

  private joinGame(code: string) {
    this.lobby.hide()
    const link = CoopLink.join(code, {
      onRoom: (_code, _role, id) => {
        this.me = id
        link.toHost({ t: 'hello', name: this.myName() })
        this.enterFloor()
        this.hud?.toast('Joined! Say hi to your salon partner.', '#8fe0c4')
      },
      onPeer: (_j, _id, hostLeft) => { if (hostLeft) { this.toTitle(); this.lobbyToast('The host closed the salon.') } },
      onHostMessage: msg => this.onHost(msg),
      onGuestMessage: () => {},
      onError: reason => { this.toTitle(); this.lobbyToast(reason) },
      onClosed: () => { if (this.mode !== 'title') { this.toTitle(); this.lobbyToast('Lost the connection to the salon.') } },
    })
    this.link = link
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
    } else if (this.link) this.link.toHost({ t: 'act', a })
  }

  private onGuest(raw: GuestMessage, from: number) {
    if (!this.host) return
    const msg = parseGuestMessage(raw)
    if (!msg) return
    const wasNew = msg.t === 'hello' && !this.host.players.some(p => p.id === from)
    for (const d of handleGuestMessage(this.host, from, msg)) {
      if (d.to === this.me) this.deliver(d.msg)
      else this.link?.toGuest(d.msg, d.to)
    }
    if (wasNew) { const name = this.host.players.find(p => p.id === from)?.name ?? 'A friend'; this.hud?.toast(`${name} joined the salon`, '#8fe0c4'); sfx.door(); this.showRoom('') ; this.sendSnap() }
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
      if (this.host) this.link?.toGuest({ t: 'sync', st: msg.st, snap }, msg.by)
      else this.link?.toHost({ t: 'sync', st: msg.st, to: msg.by, snap })
    } else if (msg.t === 'sync') { if (sc && sc.station === msg.st) sc.view.applySnapshot?.(msg.snap) }
  }

  private sendOps(station: string, ops: Op[]) {
    if (this.host) { for (const d of routeOps(this.host, station, this.me, ops)) this.link?.toGuest(d.msg, d.to) }
    else this.link?.toHost({ t: 'ops', st: station, ops })
  }

  private sendSnap() { if (this.host && this.link?.open) this.link.toGuest({ t: 'snap', s: publicState(this.host) }) }

  private save() { if (this.host) writeSave(store, toSave(this.host)) }

  // ------------------------------------------------------------------ the computer

  private openComputer() {
    const s = this.view()
    if (!s || this.computer) return
    this.floor!.inputEnabled = false
    this.computer = new Computer(this.ui, { onAction: a => this.act(a), onClose: () => { this.computer = null; if (this.floor) this.floor.inputEnabled = true } })
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
      progress: (step, steps, progress) => this.act({ a: 'progress', station: stationId, step, steps, progress }),
      finish: (result, foam) => { this.act({ a: 'finish', station: stationId, result, foam }); this.leaveTreatment(true) },
      leave: () => { this.act({ a: 'stopWork', station: stationId }); this.leaveTreatment(true) },
    }
    const view = this.opts.openTreatment ? this.opts.openTreatment(handoff) : this.defaultTreatment(handoff)
    this.screen = { view, station: stationId, customer: customer.id, role }
    this.mode = 'treatment'
    music.quiet(true)
    if (this.floor) { this.floor.root.visible = false; this.floor.inputEnabled = false }
    if (this.hud) this.hud.visible = false
    // A helper joining late asks the lead for the treatment so far.
    if (role === 'helper' && st.lead !== null) {
      if (this.host) this.link?.toGuest({ t: 'syncReq', st: stationId, by: this.me }, st.lead)
      else this.link?.toHost({ t: 'syncReq', st: stationId })
    }
    this.resize()
  }

  private defaultTreatment(h: TreatmentHandoff): TreatmentScreen {
    const c = h.customer
    const tv = new TreatmentView({
      app: this.app, overlay: this.ui, treatment: c.plan.treatment,
      customer: { name: c.plan.name, look: c.plan.look, seed: c.plan.seed, disaster: c.plan.disaster, wish: c.plan.wish },
      tier: h.tier, startStep: h.startStep, role: h.role, leadName: h.leadName, playerId: h.playerId, mood: c.mood, ambience: h.ambience,
      onOps: h.sendOps, onProgress: h.progress, onFinish: h.finish, onLeave: h.leave,
    })
    this.app.stage.addChild(tv.root)
    return tv
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
    for (const f of e?.today.friendUps ?? []) news.push(f.gift ? `${f.name} is now a close friend and left you a gift: ${f.gift.split(':')[1].replace(/-/g, ' ')}.` : `${f.name} likes your salon more: friendship ${f.level} of 5.`)
    for (const n of e?.today.levelUps ?? []) news.push(`${n} levelled up and got a little raise.`)
    if (s.day % 7 === 0) news.push('New staff candidates arrive tomorrow at the salon computer.')
    for (const c of e?.campaigns ?? []) if (c.day === 0) news.push('Your new campaign starts tomorrow.')
    const data: ReceiptData = {
      day: s.day, salonName: e?.salonName ?? 'Glow Salon', revenue: st.revenue, tips: st.tips, costs: st.costs, wages,
      net: st.revenue + st.tips - st.costs - wages, served: st.served, ratingBefore: st.ratingBefore, ratingAfter: average(s.rating),
      reviewsTotal: s.rating.count, reviews: st.reviews, allReviews: s.reviews, awards: awards(st), players: s.players, owned: s.owned, money: s.money, news,
    }
    this.receipt = new Receipt(this.ui, data, { onNext: () => { this.receipt = null; this.act({ a: 'next' }); this.floor?.placeMe(240, 420) } })
    this.save()
  }

  // ------------------------------------------------------------------ the frame

  private frame(dt: number) {
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
      this.hud.update({ day: s.day, phase: s.phase, money: s.money, rating: average(s.rating), reviews: s.rating.count, arrived: s.spawned, total: this.host ? this.host.schedule.length : (s as PublicState).scheduled, served: s.stats.served, players: s.players, events: s.events, pending, vote: s.ext?.vote ?? null, me: this.me }, dt)
    }
    this.computer?.update(s)
    // The close-up: keep it running; a helper's view closes when the lead finishes.
    const sc = this.screen
    if (sc) {
      sc.view.update(dt)
      const st = s.stations.find(x => x.id === sc.station)
      if (sc.role === 'helper' && (!st || st.customer !== sc.customer)) this.leaveTreatment(true)
    }
    // The day's end, and the next day for everyone.
    if (s.phase === 'receipt' && !this.receipt && this.receiptDay !== s.day && !this.screen) this.showReceipt(s)
    if (s.phase !== 'receipt' && this.receipt) { this.receipt.close(); this.receipt = null }
    if (s.phase !== 'receipt') this.receiptDay = -1
    // Host duties: snapshots for guests, and a save now and then.
    if (this.host) {
      this.snapTimer -= dt
      if (this.snapTimer <= 0 && this.link?.open) { this.snapTimer = 0.1; this.sendSnap() }
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
