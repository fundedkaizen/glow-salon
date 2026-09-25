import { Container, Graphics, Sprite, Text, type Application, type FederatedPointerEvent, type Texture } from 'pixi.js'
import { bits } from '../art/bits.ts'
import { CURTAIN_SPOTS, decorPiece } from '../art/salon/decor-art.ts'
import { fairyBulbs, paintBaseRug, paintDoorBell, paintFillerFrame, paintFloorLamp, paintLampGlow, paintMagazineTable, paintSoonScreen, paintSucculent, paintTeaCorner, paintWelcomeSign, paintAquarium, paintCandles, paintChandelier, paintCloudRug, paintDesk, paintFacialChair, paintFairyLights, paintNailDesk, paintNeonGlow, paintPlant, paintSofa, paintStationGlow, paintWallArt, type Piece } from '../art/salon/furniture.ts'
import { icons } from '../art/salon/icons.ts'
import { canvasTexture, DOOR_Y0, DOOR_Y1, OUTSIDE_W, paintFront, paintLight, paintOutside, paintRoom, paintVignette, WALL_T } from '../art/salon/room.ts'
import { PLAYER_COLORS } from '../art/palette.ts'
import { purr, softPop } from '../audio/salon-sfx.ts'
import { sfx } from '../audio/sfx.ts'
import { randomLook, type Look } from '../core/customers.ts'
import { DECOR_ITEM_BY_ID, DECOR_SLOTS, placeDecor } from '../core/decor.ts'
import { ITEM_BY_ID } from '../core/economy.ts'
import { blockedGrid, CELL, COLS, COMPUTER_SPOT, DESK, findPath, FLOOR_H, FLOOR_W, ROWS, SOFA_SEATS, stationRect, stationSpot, SLOTS, type Pt } from '../core/floor.ts'
import { personaFor, storyBeat } from '../core/persona.ts'
import { hashString, makeRng } from '../core/rng.ts'
import type { Action, Customer, DayStats, GameEvent, Pending, Phase, Player, Station } from '../core/salon.ts'
import type { SalonExt } from '../core/salon-ext.ts'
import { STAFF_GRACE, STAFF_ID_BASE, type StaffMember } from '../core/staff.ts'
import { Cat } from './floor-cat.ts'
import { Person } from './floor-person.ts'
import { Particles, easeOutBack } from './particles.ts'

/**
 * The salon floor: a cosy 3/4 room the players walk around in. It draws whatever salon state it is given
 * (the host's live state, or a guest's snapshot): customers walking in, waiting on the sofa with a mood
 * bubble, being called to a station and leaving happy; players with name tags; hired staff at work; the
 * decor the salon owns; and the cat. It moves the local player (keys, or click and tap to walk), shows
 * "Start treatment" at a station with a waiting customer, and reports what the player does through hooks.
 * It never changes the salon state itself.
 */
export type FloorCustomer = Omit<Customer, 'path'>

/** The part of the salon state the floor draws (SalonState and a guest's PublicState both fit). */
export type FloorState = {
  phase: Phase
  day: number
  clock: number
  customers: FloorCustomer[]
  stations: Station[]
  players: Player[]
  owned: string[]
  events: GameEvent[]
  stats: DayStats
  pending: Pending | null
  ext?: SalonExt
}

export type FloorHooks = {
  /** A player action for the salon (the controller applies it or sends it to the host). */
  onAction: (a: Action) => void
  /** The local player starts (or joins) the treatment at a station. */
  onStartTreatment: (stationId: string, customer: FloorCustomer) => void
  /** The local player sits down at the salon computer. */
  onOpenComputer: () => void
}

type Target = { kind: 'station'; id: string; x: number; y: number } | { kind: 'computer'; x: number; y: number } | { kind: 'cat'; x: number; y: number }

type CustomerView = { person: Person; x: number; y: number; bubble: Container; ring: Graphics; iconSprite: Sprite; say: Container | null; sayT: number; said: boolean; lastState: string; alpha: number }
type PlayerView = { person: Person; tag: Container; x: number; y: number }
type StaffView = { person: Person; tag: Container; x: number; y: number; path: Pt[]; goal: Pt; tea: Sprite }

const TAG_FONT = 'Nunito, system-ui, sans-serif'
const HEAD_TOP = 132

/** Players have no customisation yet: a look from their name, so each keeps theirs. */
export function playerLook(id: number, name: string): Look {
  const look = randomLook(makeRng(hashString(name.toLowerCase()) ^ (id * 7919)))
  return { ...look, accessory: look.accessory === 2 ? 0 : look.accessory }
}

const toTexture = (p: Piece) => canvasTexture(p.canvas)

function spriteOf(p: Piece, tex?: Texture): Sprite {
  const s = new Sprite(tex ?? toTexture(p))
  s.anchor.set(p.ax / p.w, p.ay / p.h)
  return s
}

export class FloorView {
  readonly root = new Container()
  private world = new Container()
  private rugLayer = new Container()
  private wallLayer = new Container()
  private sortLayer = new Container()
  private ceilingLayer = new Container()
  private glowLayer = new Container()
  private fxLayer = new Container()
  private uiLayer = new Container()
  private fx = new Particles()
  private cat: Cat
  private door = new Container()
  private doorOpen = 0
  private furnitureKey = ''
  private furniture: Container[] = []
  private stationGlows = new Map<string, Sprite>()
  private customers = new Map<number, CustomerView>()
  private players = new Map<number, PlayerView>()
  private staff = new Map<number, StaffView>()
  private floats: { t: Text | Container; vy: number; life: number; age: number }[] = []
  private motes: { s: Sprite; x: number; y: number; vx: number; vy: number; ph: number }[] = []
  private twinkles: { s: Sprite; ph: number }[] = []
  private neonGlow: Sprite | null = null
  private chandelierGlow: Sprite | null = null
  private fish: { g: Graphics; ph: number; y: number }[] = []
  private state: FloorState | null = null
  private lastSeq = -1
  private t = 0
  private grid: Uint8Array = new Uint8Array(COLS * ROWS)
  private gridKey = ''
  // camera
  private scale = 1
  private view = { w: 1280, h: 800 }
  private camX = 640
  // local player
  private me = { x: 240, y: 420, facing: 1 as 1 | -1, moving: false }
  private path: Pt[] = []
  private keys = new Set<string>()
  private sendTimer = 0
  private lastSent = ''
  private goal: Target | null = null
  private prompt = new Container()
  private promptText = new Text({ text: '', style: { fontFamily: TAG_FONT, fontSize: 15, fontWeight: '800', fill: 0x5a3a52 }, resolution: 3 })
  private promptKey = new Text({ text: 'F', style: { fontFamily: TAG_FONT, fontSize: 13, fontWeight: '800', fill: 0xffffff }, resolution: 3 })
  private promptBg = new Graphics()
  private target: Target | null = null
  private promptPop = 0
  private stationInfo = new Map<string, { ring: Graphics; label: Container; text: Text }>()
  private inputOn = true
  private destroyed = false
  private moveMarker = new Graphics()
  private markerT = 0
  /** Demo mode (the title screen): no local player, no input. */
  readonly demo: boolean

  private playerId: number
  private hooks: FloorHooks

  constructor(app: Application, playerId: number, hooks: FloorHooks, opts: { demo?: boolean } = {}) {
    this.playerId = playerId
    this.hooks = hooks
    this.demo = !!opts.demo
    this.root.addChild(this.world)
    const room = new Sprite(canvasTexture(paintRoom()))
    const light = new Sprite(canvasTexture(paintLight()))
    light.blendMode = 'add'
    const vignette = new Sprite(canvasTexture(paintVignette()))
    vignette.scale.set(4)
    vignette.blendMode = 'multiply'
    const front = new Sprite(canvasTexture(paintFront()))
    front.y = FLOOR_H - 24
    const outside = new Sprite(canvasTexture(paintOutside()))
    outside.x = -OUTSIDE_W
    this.world.addChildAt(outside, 0)
    this.sortLayer.sortableChildren = true
    this.world.addChild(room, this.rugLayer, this.wallLayer, this.moveMarker, this.sortLayer, this.door, light, this.ceilingLayer, this.glowLayer, front, vignette, this.fxLayer, this.uiLayer)
    this.fxLayer.addChild(this.fx.root)
    this.buildDoor()
    this.buildAmbient()
    this.cat = new Cat(() => this.grid)
    this.cat.onZ = (text, x, y) => this.float(text, x, y, 0x9c86d9, 16)
    this.sortLayer.addChild(this.cat.root)
    this.cat.root.on('pointertap', (e: FederatedPointerEvent) => { e.stopPropagation(); this.goTo({ kind: 'cat', x: this.cat.x, y: this.cat.y }) })
    // The interaction prompt: a pill with the key to press, tappable.
    this.promptBg.eventMode = 'static'
    this.promptBg.cursor = 'pointer'
    this.promptText.anchor.set(0, 0.5)
    this.promptKey.anchor.set(0.5)
    this.prompt.addChild(this.promptBg, this.promptKey, this.promptText)
    this.prompt.visible = false
    this.prompt.eventMode = 'static'
    this.prompt.on('pointertap', (e: FederatedPointerEvent) => { e.stopPropagation(); this.interact() })
    this.uiLayer.addChild(this.prompt)
    // Input.
    this.root.eventMode = 'static'
    this.root.on('pointertap', e => this.onTap(e))
    if (!this.demo) {
      window.addEventListener('keydown', this.onKeyDown)
      window.addEventListener('keyup', this.onKeyUp)
      window.addEventListener('blur', this.onBlur)
    }
    this.resize(app.screen.width, app.screen.height)
  }

  // ------------------------------------------------------------------ static pieces

  private buildDoor() {
    // A glass door hinged at the top of the doorway, swinging in when someone passes, seen from above:
    // a white frame around a pale blue pane, a brass handle, and a soft shadow on the floor.
    const leaf = new Graphics()
    const len = DOOR_Y1 - DOOR_Y0 - 4
    leaf.roundRect(-2, 4, 12, len, 4).fill({ color: 0x8a5a74, alpha: 0.12 })
    leaf.roundRect(-5, 0, 10, len, 4).fill({ color: 0xffffff }).stroke({ width: 1.4, color: 0xe3b6c6 })
    leaf.roundRect(-2.5, 6, 5, len - 12, 2).fill({ color: 0xbfe2f2, alpha: 0.95 })
    leaf.rect(-1.5, 10, 1.4, len - 30).fill({ color: 0xffffff, alpha: 0.8 })
    leaf.roundRect(3, len - 26, 6, 12, 3).fill({ color: 0xe2b456 })
    this.door.addChild(leaf)
    this.door.position.set(WALL_T / 2, DOOR_Y0 + 2)
    // The shop bell over the door.
    this.bell = spriteOf(cached('bell', paintDoorBell))
    this.bell.position.set(WALL_T / 2 + 4, DOOR_Y0 - 30)
    this.bell.zIndex = DOOR_Y0 - 30
    this.sortLayer.addChild(this.bell)
  }

  private bell!: Sprite
  private bellSwing = 0

  private buildAmbient() {
    // Dust motes drifting in the window light.
    for (let i = 0; i < 18; i++) {
      const s = new Sprite(bits.glow())
      s.anchor.set(0.5)
      s.blendMode = 'add'
      s.tint = 0xffe2b8
      const m = { s, x: 700 + Math.random() * 520, y: 190 + Math.random() * 380, vx: (Math.random() - 0.3) * 6, vy: -2 - Math.random() * 4, ph: Math.random() * 10 }
      this.motes.push(m)
      this.glowLayer.addChild(s)
    }
  }

  // ------------------------------------------------------------------ state

  setState(state: FloorState) {
    const first = !this.state
    this.state = state
    if (first) {
      this.lastSeq = state.events.length ? state.events[state.events.length - 1].seq : 0
      const me = state.players.find(p => p.id === this.playerId)
      if (me) { this.me.x = me.x; this.me.y = me.y }
    }
    this.syncGrid(state)
    this.syncFurniture(state)
    this.syncPeople(state)
    this.syncEvents(state)
  }

  /** The local player's position (the controller sends it on). */
  get localPos() { return { ...this.me } }

  /** Put the local player somewhere (a new day, back from a treatment). */
  placeMe(x: number, y: number) { this.me.x = x; this.me.y = y; this.path = []; this.goal = null }

  set inputEnabled(on: boolean) { this.inputOn = on; if (!on) { this.keys.clear(); this.path = []; this.goal = null } }
  get inputEnabled() { return this.inputOn }

  private syncGrid(state: FloorState) {
    const props = state.owned.map(id => { const e = ITEM_BY_ID[id]?.effect; return e?.kind === 'decor' ? e.prop : '' }).filter(Boolean)
    const key = state.stations.map(s => s.slot).join(',') + '|' + props.join(',')
    if (key === this.gridKey) return
    this.gridKey = key
    this.grid = blockedGrid(state.stations.map(s => s.slot), props)
    // Floor decor from the sets blocks walking too.
    for (const d of placeDecor(state.owned, state.ext?.decorOrder ?? [])) {
      if (d.place !== 'floor') continue
      const r = { x: d.x - 30, y: d.y - 24, w: 60, h: 30 }
      for (let y = Math.floor(r.y / CELL); y <= Math.floor((r.y + r.h) / CELL); y++) for (let x = Math.floor(r.x / CELL); x <= Math.floor((r.x + r.w) / CELL); x++) if (x >= 0 && y >= 0 && x < COLS && y < ROWS) this.grid[y * COLS + x] = 1
    }
  }

  private syncFurniture(state: FloorState) {
    const decor = placeDecor(state.owned, state.ext?.decorOrder ?? [])
    const key = state.stations.map(s => `${s.id}:${s.kind}:${s.slot}`).join(',') + '|' + state.owned.filter(id => ITEM_BY_ID[id]?.tab === 'decor').join(',') + '|' + decor.map(d => d.id + d.slot).join(',') + '|' + (state.ext?.salonName ?? '')
    if (key === this.furnitureKey) return
    this.furnitureKey = key
    for (const c of this.furniture) c.destroy()
    this.furniture = []
    this.stationGlows.clear()
    for (const info of this.stationInfo.values()) { info.ring.destroy(); info.label.destroy() }
    this.stationInfo.clear()
    this.neonGlow = null
    this.chandelierGlow = null
    this.twinkles = []
    this.fish = []
    const add = (layer: Container, s: Container, x: number, y: number, z = y) => { s.position.set(x, y); s.zIndex = z; layer.addChild(s); this.furniture.push(s); return s }
    // Fixed furniture.
    add(this.sortLayer, spriteOf(cached('desk', paintDesk)), 110, 288)
    add(this.sortLayer, spriteOf(cached('sofa', paintSofa)), 380, 246)
    add(this.rugLayer, spriteOf(cached('baseRug', paintBaseRug)), 560, 430)
    add(this.sortLayer, spriteOf(cached('lamp', paintFloorLamp)), 646, 262)
    const lampGlow = spriteOf(cached('lampGlow', paintLampGlow))
    lampGlow.blendMode = 'add'
    add(this.glowLayer, lampGlow, 690, 150)
    add(this.sortLayer, spriteOf(cached('welcome', paintWelcomeSign)), 118, 704)
    add(this.sortLayer, spriteOf(cached('magazines', paintMagazineTable)), 352, 258)
    add(this.sortLayer, spriteOf(cached('tea', paintTeaCorner)), 54, 334)
    // Empty station slots wait behind a soft folding screen: more room is coming.
    const usedSlots = new Set(state.stations.map(s => s.slot))
    let firstEmpty = true
    for (let i = 0; i < SLOTS.length; i++) {
      if (usedSlots.has(i)) continue
      if (firstEmpty) add(this.sortLayer, spriteOf(cached('soon', paintSoonScreen)), SLOTS[i].x, SLOTS[i].y + 55, SLOTS[i].y)
      else { const g = new Graphics().roundRect(-75, -26, 150, 52, 18).stroke({ width: 2, color: 0xd696ac, alpha: 0.28 }); add(this.rugLayer, g, SLOTS[i].x, SLOTS[i].y + 36) }
      firstEmpty = false
    }
    // Empty decor slots get a little filler until something is bought for them.
    const taken = new Set(decor.map(d => `${d.place}:${d.slot}`))
    DECOR_SLOTS.wall.forEach((p, i) => { if (!taken.has(`wall:${i}`)) add(this.wallLayer, spriteOf(cached(`filler${i}`, () => paintFillerFrame(i))), p.x, p.y) })
    DECOR_SLOTS.floor.forEach((p, i) => { if (!taken.has(`floor:${i}`) && i !== 3) add(this.sortLayer, spriteOf(cached('succulent', paintSucculent)), p.x, p.y + 10) })
    // The salon's name on a little brass plaque on the reception desk.
    const plaque = new Container()
    const name = new Text({ text: state.ext?.salonName ?? 'Glow Salon', style: { fontFamily: 'Fredoka, Nunito, sans-serif', fontSize: 15, fontWeight: '600', fill: 0xffffff, letterSpacing: 0.5 }, resolution: 3 })
    name.anchor.set(0.5)
    const pw = name.width + 22
    const pg = new Graphics()
    pg.roundRect(-pw / 2, -12, pw, 24, 12).fill({ color: 0xe98aa8 }).stroke({ width: 2, color: 0xf0c36a })
    plaque.addChild(pg, name)
    add(this.sortLayer, plaque, 216, 256, 289)
    // Stations.
    for (const st of state.stations) {
      const p = SLOTS[st.slot]
      if (st.kind === 'facial') {
        const chair = cachedPair('facial', paintFacialChair)
        add(this.sortLayer, spriteOf(chair.back), p.x, p.y, p.y - 1)
        add(this.sortLayer, spriteOf(chair.front), p.x, p.y, p.y + 3)
      } else {
        const desk = cachedPair('nails', paintNailDesk)
        add(this.sortLayer, spriteOf(desk.back), p.x, p.y, p.y - 1)
        add(this.sortLayer, spriteOf(desk.front), p.x, p.y, p.y + 3)
      }
      const glow = spriteOf(cached('glow', paintStationGlow))
      glow.alpha = 0
      glow.tint = 0xf28db0
      add(this.rugLayer, glow, p.x - 10, p.y + 20)
      this.stationGlows.set(st.id, glow)
      // Progress ring and a label above the station.
      const ring = new Graphics()
      const label = new Container()
      const text = new Text({ text: '', style: { fontFamily: TAG_FONT, fontSize: 12, fontWeight: '800', fill: 0x5a3a52 }, resolution: 3 })
      text.anchor.set(0.5)
      label.addChild(new Graphics(), text)
      this.uiLayer.addChild(ring, label)
      this.stationInfo.set(st.id, { ring, label, text })
    }
    // Starter decor.
    const owned = new Set(state.owned)
    if (owned.has('rug')) add(this.rugLayer, spriteOf(cached('rug', paintCloudRug)), 420, 560)
    if (owned.has('plant')) add(this.sortLayer, spriteOf(cached('plant', () => paintPlant())), 1215, 248)
    if (owned.has('candles')) add(this.sortLayer, spriteOf(cached('candles', paintCandles)), 290, 222, 300)
    if (owned.has('art')) add(this.wallLayer, spriteOf(cached('art', paintWallArt)), 960, 66)
    if (owned.has('lights')) {
      add(this.wallLayer, spriteOf(cached('lights', paintFairyLights)), 640, 12)
      for (const b of fairyBulbs()) {
        const s = new Sprite(bits.glow())
        s.anchor.set(0.5); s.scale.set(0.24); s.blendMode = 'add'; s.tint = 0xffc27a
        add(this.glowLayer, s, b.x, b.y + 12)
        this.twinkles.push({ s, ph: Math.random() * 10 })
      }
    }
    if (owned.has('neon')) {
      const neon = cachedPair('neon', () => { const n = paintNeonGlow(); return { back: n.tube, front: n.glow } })
      const glow = spriteOf(neon.front)
      glow.blendMode = 'add'
      add(this.wallLayer, glow, 505, 74)
      add(this.wallLayer, spriteOf(neon.back), 505, 74)
      this.neonGlow = glow
    }
    if (owned.has('aquarium')) {
      add(this.sortLayer, spriteOf(cached('aquarium', paintAquarium)), 72, 470)
      for (let i = 0; i < 3; i++) {
        const g = new Graphics()
        const col = [0xffa46b, 0xffd35a, 0xf48fb1][i]
        g.ellipse(0, 0, 4, 2.4).fill({ color: col }).poly([-3, 0, -7, -3, -7, 3]).fill({ color: col })
        add(this.sortLayer, g, 72, 400 + i * 12, 471)
        this.fish.push({ g, ph: Math.random() * 10, y: 382 + i * 12 })
      }
    }
    if (owned.has('chandelier')) {
      const ch = cachedPair('chandelier', () => { const c = paintChandelier(); return { back: c.body, front: c.glow } })
      const glow = spriteOf(ch.front)
      glow.blendMode = 'add'
      add(this.glowLayer, glow, 640, 0)
      add(this.ceilingLayer, spriteOf(ch.back), 640, 0)
      this.chandelierGlow = glow
    }
    // Decor sets, in their slots.
    for (const d of decor) {
      const item = DECOR_ITEM_BY_ID[d.id]
      const p = decorPiece(d.id)
      if (!p) continue
      const tex = cachedTex(`decor:${d.id}`, p)
      if (item.place === 'window') { for (const w of CURTAIN_SPOTS) add(this.wallLayer, spriteOf(p, tex), w.x, w.y) }
      else if (item.place === 'wall') add(this.wallLayer, spriteOf(p, tex), d.x, d.y)
      else if (item.place === 'rug') add(this.rugLayer, spriteOf(p, tex), d.x, d.y)
      else if (item.place === 'ceiling') add(this.ceilingLayer, spriteOf(p, tex), d.x, 0)
      else if (item.place === 'table') {
        add(this.sortLayer, spriteOf(p, tex), d.x, d.y + (d.slot === 1 ? 0 : 8), d.slot === 1 ? 260 : 300)
      } else add(this.sortLayer, spriteOf(p, tex), d.x, d.y)
    }
  }

  private syncPeople(state: FloorState) {
    // Customers.
    const seen = new Set<number>()
    for (const c of state.customers) {
      seen.add(c.id)
      let v = this.customers.get(c.id)
      if (!v) {
        const person = new Person(c.plan.look, 'customer')
        const bubble = new Container()
        const bg = new Graphics()
        bg.roundRect(-19, -19, 38, 34, 15).fill({ color: 0xffffff }).stroke({ width: 1.4, color: 0xe9c2d0 })
        bg.poly([-5, 14, 5, 14, 0, 21]).fill({ color: 0xffffff })
        const ring = new Graphics()
        const iconSprite = new Sprite(c.plan.treatment === 'nails' ? icons.nails() : icons.facial())
        iconSprite.anchor.set(0.5); iconSprite.scale.set(0.82); iconSprite.y = -2
        bubble.addChild(bg, ring, iconSprite)
        bubble.scale.set(0)
        this.uiLayer.addChild(bubble)
        person.root.eventMode = 'none'
        v = { person, x: c.x, y: c.y, bubble, ring, iconSprite, say: null, sayT: 0, said: false, lastState: '', alpha: 0 }
        this.sortLayer.addChild(person.root)
        this.customers.set(c.id, v)
      }
    }
    for (const [id, v] of this.customers) if (!seen.has(id)) { v.person.destroy(); v.bubble.destroy(); v.say?.destroy(); this.customers.delete(id) }
    // Players.
    const pseen = new Set<number>()
    for (const p of state.players) {
      pseen.add(p.id)
      let v = this.players.get(p.id)
      if (!v || (v.tag as Container & { name2?: string }).name2 !== p.name) {
        if (v) { v.person.destroy(); v.tag.destroy() }
        const person = new Person(playerLook(p.id, p.name), 'player', PLAYER_COLORS[p.id % PLAYER_COLORS.length])
        const tag = nameTag(p.name, PLAYER_COLORS[p.id % PLAYER_COLORS.length], p.id === this.playerId)
        ;(tag as Container & { name2?: string }).name2 = p.name
        this.uiLayer.addChild(tag)
        this.sortLayer.addChild(person.root)
        v = { person, tag, x: p.x, y: p.y }
        this.players.set(p.id, v)
      }
    }
    for (const [id, v] of this.players) if (!pseen.has(id)) { v.person.destroy(); v.tag.destroy(); this.players.delete(id) }
    // Staff.
    const sseen = new Set<number>()
    for (const s of state.ext?.staff ?? []) {
      sseen.add(s.id)
      let v = this.staff.get(s.id)
      if (!v || (v.tag as Container & { name2?: string }).name2 !== s.name) {
        const pos = v ? { x: v.x, y: v.y } : { x: 360, y: 330 }
        if (v) { v.person.destroy(); v.tag.destroy(); v.tea.destroy() }
        const person = new Person(s.look, 'staff')
        const tag = nameTag(s.name, 0x4fbf98, false, 'staff')
        ;(tag as Container & { name2?: string }).name2 = s.name
        const tea = new Sprite(icons.tea())
        tea.anchor.set(0.5); tea.visible = false
        this.uiLayer.addChild(tag, tea)
        this.sortLayer.addChild(person.root)
        v = { person, tag, x: pos.x, y: pos.y, path: [], goal: pos, tea }
        this.staff.set(s.id, v)
      }
    }
    for (const [id, v] of this.staff) if (!sseen.has(id)) { v.person.destroy(); v.tag.destroy(); v.tea.destroy(); this.staff.delete(id) }
  }

  private syncEvents(state: FloorState) {
    for (const e of state.events) {
      if (e.seq <= this.lastSeq) continue
      this.lastSeq = e.seq
      if (e.kind === 'arrive') { sfx.door(); this.doorOpen = Math.max(this.doorOpen, 0.2); this.bellSwing = 1 }
      else if (e.kind === 'paid') {
        sfx.cash()
        const x = e.x ?? 600, y = (e.y ?? 400) - HEAD_TOP
        this.float(`+$${e.amount ?? 0}`, x, y - 10, 0xe2a33a, 22)
        this.burst(x, y, 'heart', 7)
        this.burst(x, y, 'coin', 5)
      }
    }
  }

  // ------------------------------------------------------------------ input

  private onKeyDown = (e: KeyboardEvent) => {
    if (!this.inputOn || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
    const k = e.key.toLowerCase()
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) { this.keys.add(k); this.path = []; this.goal = null; e.preventDefault() }
    if ((k === 'f' || k === 'e' || k === 'enter' || k === ' ') && !e.repeat) { if (this.target) { e.preventDefault(); this.interact() } }
  }
  private onKeyUp = (e: KeyboardEvent) => { this.keys.delete(e.key.toLowerCase()) }
  private onBlur = () => this.keys.clear()

  private toWorld(e: FederatedPointerEvent): Pt {
    const p = this.world.toLocal(e.global)
    return { x: p.x, y: p.y }
  }

  private onTap(e: FederatedPointerEvent) {
    if (!this.inputOn || this.demo || !this.state) return
    const p = this.toWorld(e)
    sfx.unlock()
    // What did they tap? A station, the computer, the cat, or the floor.
    const catPos = this.cat.pos
    if (Math.hypot(p.x - catPos.x, p.y - (catPos.y - 16)) < 34) { this.goTo({ kind: 'cat', x: this.cat.x, y: this.cat.y }); return }
    if (p.x > DESK.x - 10 && p.x < DESK.x + DESK.w + 10 && p.y > DESK.y - 60 && p.y < DESK.y + DESK.h + 10) { this.goTo({ kind: 'computer', ...COMPUTER_SPOT }); return }
    for (const st of this.state.stations) {
      const r = stationRect(st.slot)
      if (p.x > r.x - 10 && p.x < r.x + r.w + 10 && p.y > r.y - 60 && p.y < r.y + r.h + 10) { const spot = stationSpot(st.slot); this.goTo({ kind: 'station', id: st.id, ...spot }); return }
    }
    this.goal = null
    this.walkTo(p)
  }

  private walkTo(p: Pt) {
    const x = Math.max(24, Math.min(FLOOR_W - 24, p.x)), y = Math.max(186, Math.min(FLOOR_H - 22, p.y))
    this.path = findPath(this.grid, this.me, { x, y })
    this.markerT = 1
    this.moveMarker.position.set(x, y)
  }

  private goTo(t: Target) {
    const here = Math.hypot(this.me.x - t.x, this.me.y - t.y)
    this.goal = t
    if (here < 30) { this.goal = null; this.interactWith(t); return }
    this.walkTo(t.kind === 'cat' ? { x: t.x + (this.me.x < t.x ? -40 : 40), y: t.y + 6 } : t)
  }

  /** Act on whatever the prompt shows (F, Enter, or a tap on the prompt). */
  interact() { if (this.target) this.interactWith(this.target) }

  private interactWith(t: Target) {
    if (!this.state) return
    sfx.unlock()
    if (t.kind === 'computer') { sfx.click(); this.hooks.onOpenComputer(); return }
    if (t.kind === 'cat') {
      this.cat.pet()
      purr()
      this.burst(this.cat.pos.x, this.cat.pos.y - 34, 'heart', 6)
      this.hooks.onAction({ a: 'petCat' })
      return
    }
    const st = this.state.stations.find(s => s.id === t.id)
    const c = st && st.customer !== null ? this.state.customers.find(cu => cu.id === st.customer) : null
    if (!st || !c || (c.state !== 'seated' && c.state !== 'treating')) { softPop(0.8); return }
    if (st.lead !== null && st.lead >= STAFF_ID_BASE) { softPop(0.8); return }
    this.me.x = t.x; this.me.y = t.y; this.me.facing = 1
    this.hooks.onAction({ a: 'work', station: st.id })
    this.hooks.onStartTreatment(st.id, c)
  }

  // ------------------------------------------------------------------ the frame

  update(dt: number) {
    if (this.destroyed) return
    this.t += dt
    const state = this.state
    this.moveLocal(dt)
    this.cat.update(dt)
    this.cat.root.zIndex = this.cat.sortY
    if (state) {
      this.updateCustomers(state, dt)
      this.updatePlayers(state, dt)
      this.updateStaff(state, dt)
      this.updateStations(state)
      this.updatePrompt(state, dt)
    }
    this.updateDoor(dt)
    this.updateAmbient(dt)
    this.fx.update(dt)
    this.updateFloats(dt)
    if (this.markerT > 0) {
      this.markerT = Math.max(0, this.markerT - dt * 1.6)
      const k = 1 - this.markerT
      this.moveMarker.clear().ellipse(0, 0, 10 + k * 16, 4 + k * 6).stroke({ width: 2.5, color: PLAYER_COLORS[this.playerId % 4], alpha: this.markerT })
    }
    this.updateCamera(dt)
  }

  private moveLocal(dt: number) {
    if (this.demo || !this.state) return
    const inTreatment = this.state.players.find(p => p.id === this.playerId)?.station
    let dx = 0, dy = 0
    if (this.inputOn && !inTreatment) {
      if (this.keys.has('a') || this.keys.has('arrowleft')) dx -= 1
      if (this.keys.has('d') || this.keys.has('arrowright')) dx += 1
      if (this.keys.has('w') || this.keys.has('arrowup')) dy -= 1
      if (this.keys.has('s') || this.keys.has('arrowdown')) dy += 1
    }
    const speed = 230
    let moving = false
    if (dx || dy) {
      const l = Math.hypot(dx, dy)
      const nx = this.me.x + (dx / l) * speed * dt, ny = this.me.y + (dy / l) * speed * dt
      if (this.open(nx, this.me.y)) { this.me.x = nx; moving = true }
      if (this.open(this.me.x, ny)) { this.me.y = ny; moving = true }
      if (dx) this.me.facing = dx < 0 ? -1 : 1
    } else if (this.path.length && !inTreatment) {
      const next = this.path[0]
      const ddx = next.x - this.me.x, ddy = next.y - this.me.y, d = Math.hypot(ddx, ddy)
      const step = speed * dt
      if (Math.abs(ddx) > 2) this.me.facing = ddx < 0 ? -1 : 1
      if (d <= step) { this.me.x = next.x; this.me.y = next.y; this.path.shift() } else { this.me.x += (ddx / d) * step; this.me.y += (ddy / d) * step }
      moving = true
      if (!this.path.length && this.goal) { const g = this.goal; this.goal = null; this.interactWith(g) }
    }
    this.me.moving = moving
    // Tell the salon where we are, a few times a second while it changes.
    this.sendTimer -= dt
    const key = `${Math.round(this.me.x)},${Math.round(this.me.y)},${this.me.facing},${moving ? 1 : 0}`
    if (this.sendTimer <= 0 && key !== this.lastSent) {
      this.sendTimer = 0.1
      this.lastSent = key
      this.hooks.onAction({ a: 'pos', x: Math.round(this.me.x), y: Math.round(this.me.y), f: this.me.facing, m: moving })
    }
  }

  private open(x: number, y: number) {
    if (x < 22 || x > FLOOR_W - 22 || y < 184 || y > FLOOR_H - 18) return false
    const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL)
    return !this.grid[cy * COLS + cx]
  }

  private updateCustomers(state: FloorState, dt: number) {
    const k = Math.min(1, dt * 10)
    for (const c of state.customers) {
      const v = this.customers.get(c.id)
      if (!v) continue
      const px = v.x, py = v.y
      v.x += (c.x - v.x) * k
      v.y += (c.y - v.y) * k
      const speed = Math.hypot(v.x - px, v.y - py) / Math.max(dt, 1e-3)
      const moving = speed > 12
      const p = v.person
      if (moving && Math.abs(v.x - px) > 0.2) p.facing = v.x < px ? -1 : 1
      const atStation = (c.state === 'seated' || c.state === 'treating') && !moving
      const onSofa = c.state === 'waiting' && !moving && c.seat !== null && c.seat < SOFA_SEATS.length
      p.pose = moving ? 'walk' : atStation || onSofa ? 'sit' : 'stand'
      if (atStation) p.facing = -1
      else if (onSofa) p.facing = c.seat! % 2 ? -1 : 1
      // Faces follow the mood; a treatment is bliss; paid customers beam.
      const persona = personaFor(c.plan, { rating: state.stats.ratingBefore, bias: state.ext?.today.bias })
      if (c.state === 'leaving') p.setExpr('happy')
      else if (c.state === 'treating') p.setExpr(persona.traits.includes('sleepy') ? 'sleepy' : Math.sin(this.t * 0.7 + c.id) > 0.2 ? 'happy' : 'smile')
      else p.setExpr(c.mood > 0.72 ? 'smile' : c.mood > 0.45 ? 'neutral' : 'meh')
      if (c.state !== v.lastState) {
        if (c.state === 'leaving') { p.jump(); if (Math.random() < 0.6) p.greet() }
        if (c.state === 'seated') { p.jump(); softPop(1.2) }
        if (c.state === 'waiting' && v.lastState === 'entering') softPop(1)
        v.lastState = c.state
      }
      // Fade in and out at the door.
      v.alpha = c.state === 'leaving' ? Math.max(0, Math.min(v.alpha, (v.x + 32) / 30)) : Math.min(1, v.alpha + dt * 3)
      p.root.alpha = v.alpha
      p.root.position.set(v.x, v.y)
      p.root.zIndex = v.y + (atStation ? 0 : 0.5)
      p.update(dt)
      // The mood bubble: what they came for, and a ring showing how happy they still are.
      const wantsBubble = (c.state === 'waiting' || c.state === 'seated' || c.state === 'toStation') && v.alpha > 0.9
      const target = wantsBubble ? 1 : 0
      const cur = v.bubble.scale.x
      const next = cur + (target - cur) * Math.min(1, dt * 9)
      v.bubble.scale.set(target ? easeOutBack(Math.min(1, next)) * 0.9 + next * 0.1 : next)
      v.bubble.visible = next > 0.02
      const sitDrop = p.pose === 'sit' ? 9 : 0
      v.bubble.position.set(v.x + 2, v.y - HEAD_TOP + sitDrop - 6 + Math.sin(this.t * 2.4 + c.id) * 2.5)
      if (v.bubble.visible) {
        const mood = c.mood
        const col = mood > 0.72 ? 0x6fd3ad : mood > 0.45 ? 0xf2c76b : 0xf08aa8
        v.ring.clear().moveTo(0, -18).arc(0, -2, 16, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.05, mood)).stroke({ width: 3, color: col, cap: 'round' })
      }
      // A story regular says their line once they sit down.
      if (!v.said && (c.state === 'seated' || c.state === 'treating') && persona.story && !moving) {
        v.said = true
        const level = state.ext?.friends[persona.story.id] ?? 0
        const fits = persona.story.favourite === c.plan.treatment
        const small = ['Back again! I missed this place.', 'Something different today. Surprise me!', `How is ${state.ext?.catName ?? 'the cat'}? Still the boss?`, 'This chair is my happy place.']
        v.say = speech(fits ? storyBeat(persona.story, level) : small[c.plan.seed % small.length])
        v.sayT = 7
        this.uiLayer.addChild(v.say)
        softPop(1.3)
      }
      if (v.say) {
        v.sayT -= dt
        v.say.position.set(v.x + 8, v.y - HEAD_TOP - 30 + sitDrop)
        v.say.alpha = Math.min(1, v.sayT)
        v.say.scale.set(Math.min(1, (7 - v.sayT) * 5) * 0.2 + 0.8)
        if (v.sayT <= 0) { v.say.destroy(); v.say = null }
      }
      // Sparkles while being treated.
      if (c.state === 'treating' && Math.random() < dt * 3) this.burst(v.x + (Math.random() - 0.5) * 30, v.y - 70 + sitDrop, 'sparkle', 1)
    }
  }

  private updatePlayers(state: FloorState, dt: number) {
    for (const p of state.players) {
      const v = this.players.get(p.id)
      if (!v) continue
      const mine = p.id === this.playerId
      const st = p.station ? state.stations.find(s => s.id === p.station) : null
      let tx = mine ? this.me.x : p.x, ty = mine ? this.me.y : p.y
      if (st && !mine) { const spot = stationSpot(st.slot); tx = spot.x; ty = spot.y }
      const px = v.x, py = v.y
      if (mine) { v.x = tx; v.y = ty } else { const k = Math.min(1, dt * 12); v.x += (tx - v.x) * k; v.y += (ty - v.y) * k }
      const moving = mine ? this.me.moving : Math.hypot(v.x - px, v.y - py) / Math.max(dt, 1e-3) > 14 || p.moving
      const person = v.person
      person.pose = st ? 'work' : moving ? 'walk' : 'stand'
      person.facing = st ? 1 : mine ? this.me.facing : p.facing
      person.setExpr(st ? 'happy' : 'smile')
      person.root.position.set(v.x, v.y)
      person.root.zIndex = v.y + 0.7
      person.update(dt)
      v.tag.position.set(v.x, v.y - HEAD_TOP - 8)
    }
  }

  private updateStaff(state: FloorState, dt: number) {
    const staff = state.ext?.staff ?? []
    staff.forEach((s: StaffMember, i) => {
      const v = this.staff.get(s.id)
      if (!v) return
      const st = s.station ? state.stations.find(x => x.id === s.station) : null
      const onBreak = s.breakLeft > 0
      const goal: Pt = onBreak || !st ? { x: 356 + i * 34, y: 336 + (i % 2) * 12 } : stationSpot(st.slot)
      if (Math.hypot(goal.x - v.goal.x, goal.y - v.goal.y) > 2) { v.goal = goal; v.path = findPath(this.grid, v, goal) }
      let moving = false
      if (v.path.length) {
        const next = v.path[0]
        const dx = next.x - v.x, dy = next.y - v.y, d = Math.hypot(dx, dy), step = 150 * dt
        if (Math.abs(dx) > 1) v.person.facing = dx < 0 ? -1 : 1
        if (d <= step) { v.x = next.x; v.y = next.y; v.path.shift() } else { v.x += (dx / d) * step; v.y += (dy / d) * step }
        moving = true
      }
      v.person.pose = moving ? 'walk' : s.task ? 'work' : 'stand'
      if (!moving && st && !onBreak) v.person.facing = 1
      v.person.setExpr(onBreak ? 'sleepy' : s.task ? 'happy' : 'smile')
      v.person.root.position.set(v.x, v.y)
      v.person.root.zIndex = v.y + 0.6
      v.person.update(dt)
      v.tag.position.set(v.x, v.y - HEAD_TOP - 8)
      v.tea.visible = onBreak
      v.tea.position.set(v.x + 26, v.y - 60 + Math.sin(this.t * 2) * 2)
    })
  }

  private updateStations(state: FloorState) {
    for (const st of state.stations) {
      const info = this.stationInfo.get(st.id)
      const glow = this.stationGlows.get(st.id)
      if (!info || !glow) continue
      const c = st.customer !== null ? state.customers.find(cu => cu.id === st.customer) : null
      const waitingForYou = !!c && c.state === 'seated' && st.lead === null
      glow.alpha = waitingForYou ? 0.75 + Math.sin(this.t * 3.2) * 0.25 : Math.max(0, glow.alpha - 0.05)
      const p = SLOTS[st.slot]
      // Progress ring while someone works here.
      info.ring.clear()
      const working = !!c && c.state === 'treating'
      if (working) {
        const cx = p.x + 10, cy = p.y - 118
        info.ring.circle(cx, cy, 13).fill({ color: 0xffffff, alpha: 0.95 }).stroke({ width: 1.2, color: 0xe9c2d0 })
        info.ring.moveTo(cx, cy - 13).arc(cx, cy, 13, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.02, st.progress)).stroke({ width: 4, color: st.lead !== null && st.lead >= STAFF_ID_BASE ? 0x4fbf98 : PLAYER_COLORS[(st.lead ?? 0) % 4], cap: 'round' })
        info.ring.circle(cx, cy, 4).fill({ color: 0xf5b83d })
      }
      // A label: who is on it, or a staff member about to step in.
      let label = ''
      if (c && c.state === 'seated' && st.lead === null) {
        const s = state.ext?.staff.find(m => m.station === st.id && !m.task && m.breakLeft <= 0)
        const since = state.ext?.today.seatedAt[st.id]
        if (s && since !== undefined) label = `${s.name} takes over in ${Math.max(0, Math.ceil(STAFF_GRACE - (state.clock - since)))}s`
      }
      info.text.text = label
      const bg = info.label.children[0] as Graphics
      bg.clear()
      if (label) {
        const w = info.text.width + 18
        bg.roundRect(-w / 2, -11, w, 22, 11).fill({ color: 0xffffff, alpha: 0.94 }).stroke({ width: 1.2, color: 0xbfeadb })
      }
      info.label.position.set(p.x + 10, p.y + 72)
      info.label.visible = !!label
    }
  }

  private updatePrompt(state: FloorState, dt: number) {
    const pick: { best: Target | null; label: string; d: number } = { best: null, label: '', d: 78 }
    if (!this.demo && this.inputOn && !state.players.find(p => p.id === this.playerId)?.station) {
      const consider = (t: Target, text: string) => { const d = Math.hypot(this.me.x - t.x, this.me.y - t.y); if (d < pick.d) { pick.d = d; pick.best = t; pick.label = text } }
      consider({ kind: 'computer', ...COMPUTER_SPOT }, 'Salon computer')
      const catName = state.ext?.catName ?? 'the cat'
      consider({ kind: 'cat', x: this.cat.x, y: this.cat.y }, `Pet ${catName}`)
      for (const st of state.stations) {
        const c = st.customer !== null ? state.customers.find(cu => cu.id === st.customer) : null
        if (!c || (c.state !== 'seated' && c.state !== 'treating')) continue
        if (st.lead !== null && st.lead >= STAFF_ID_BASE) continue
        const spot = stationSpot(st.slot)
        consider({ kind: 'station', id: st.id, ...spot }, st.lead === null ? 'Start treatment' : 'Help (four hands)')
      }
    }
    const best = pick.best
    const prev = this.target
    const changed = best?.kind !== prev?.kind || (best?.kind === 'station' && prev?.kind === 'station' && best.id !== prev.id)
    this.target = best
    if (!best) { this.prompt.visible = false; this.promptPop = 0; return }
    if (changed) { this.promptPop = 0; softPop(1.1) }
    this.promptPop = Math.min(1, this.promptPop + dt * 5)
    this.promptText.text = pick.label
    const w = this.promptText.width + 50
    this.promptBg.clear()
    this.promptBg.roundRect(-w / 2, -20, w, 40, 20).fill({ color: 0xffffff }).stroke({ width: 2, color: 0xf7c6d4 })
    this.promptBg.circle(-w / 2 + 20, 0, 13).fill({ color: 0xe98aa8 })
    this.promptKey.position.set(-w / 2 + 20, 0)
    this.promptText.position.set(-w / 2 + 40, 0)
    const slotOf = (id: string) => SLOTS[state.stations.find(s => s.id === id)?.slot ?? 0]
    const anchor = best.kind === 'station' ? { x: slotOf(best.id).x + 10, y: slotOf(best.id).y - 150 } : best.kind === 'computer' ? { x: DESK.x + 105, y: DESK.y - 70 } : { x: this.cat.pos.x, y: this.cat.pos.y - 70 }
    this.prompt.position.set(anchor.x, anchor.y + Math.sin(this.t * 3) * 2)
    this.prompt.scale.set(easeOutBack(this.promptPop))
    this.prompt.visible = true
    // Touch screens get no key: the whole pill is the button.
    this.promptKey.text = matchMedia('(pointer: coarse)').matches ? '→' : 'F'
  }

  private updateDoor(dt: number) {
    let near = false
    const check = (x: number, y: number) => { if (x < 90 && y > DOOR_Y0 - 30 && y < DOOR_Y1 + 30) near = true }
    for (const v of this.customers.values()) check(v.x, v.y)
    for (const v of this.players.values()) check(v.x, v.y)
    const target = near ? 1 : 0
    this.doorOpen += (target - this.doorOpen) * Math.min(1, dt * (near ? 7 : 3))
    this.door.rotation = -this.doorOpen * 1.15
    this.bellSwing *= Math.exp(-dt * 2.2)
    this.bell.rotation = Math.sin(this.t * 14) * 0.5 * this.bellSwing
  }

  private updateAmbient(dt: number) {
    for (const m of this.motes) {
      m.ph += dt
      m.x += m.vx * dt + Math.sin(m.ph * 0.7) * 3 * dt
      m.y += m.vy * dt
      if (m.y < 180) { m.y = 580; m.x = 700 + Math.random() * 520 }
      m.s.position.set(m.x, m.y)
      m.s.scale.set(0.12 + 0.06 * Math.sin(m.ph))
      m.s.alpha = 0.25 + 0.25 * Math.sin(m.ph * 1.3)
    }
    for (const tw of this.twinkles) { tw.ph += dt; tw.s.alpha = 0.35 + 0.25 * Math.sin(tw.ph * 2.1) }
    if (this.neonGlow) this.neonGlow.alpha = 0.8 + Math.sin(this.t * 1.7) * 0.08 + (Math.random() < 0.01 ? -0.3 : 0)
    if (this.chandelierGlow) this.chandelierGlow.alpha = 0.85 + Math.sin(this.t * 1.1) * 0.1
    for (const f of this.fish) {
      f.ph += dt
      const x = 72 + Math.sin(f.ph * 0.6) * 22
      f.g.position.set(x, f.y + Math.sin(f.ph * 1.7) * 3)
      f.g.scale.x = Math.cos(f.ph * 0.6) > 0 ? 1 : -1
    }
  }

  private burst(x: number, y: number, kind: 'heart' | 'coin' | 'sparkle', n: number) {
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2
      const sp = 60 + Math.random() * 90
      this.fx.spawn({
        texture: kind === 'heart' ? bits.heart() : kind === 'coin' ? bits.coin() : bits.sparkle(),
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, gravity: kind === 'coin' ? 260 : 40, drag: 1.4,
        life: 0.9 + Math.random() * 0.5, scale: kind === 'sparkle' ? 0.18 : 0.26, scaleEnd: kind === 'sparkle' ? 0.02 : 0.2,
        alpha: 1, alphaEnd: 0, spin: (Math.random() - 0.5) * 4, blend: kind === 'sparkle' ? 'add' : 'normal', tint: kind === 'heart' ? 0xf07aa0 : 0xffffff,
      })
    }
  }

  private float(text: string, x: number, y: number, color: number, size: number) {
    const t = new Text({ text, style: { fontFamily: 'Fredoka, Nunito, sans-serif', fontSize: size, fontWeight: '700', fill: color, stroke: { color: 0xffffff, width: 4 } }, resolution: 3 })
    t.anchor.set(0.5)
    t.position.set(x, y)
    this.uiLayer.addChild(t)
    this.floats.push({ t, vy: -34, life: 1.6, age: 0 })
  }

  private updateFloats(dt: number) {
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i]
      f.age += dt
      f.t.y += f.vy * dt
      f.t.alpha = f.age < 0.15 ? f.age / 0.15 : Math.max(0, 1 - (f.age - f.life * 0.5) / (f.life * 0.5))
      f.t.scale.set(f.age < 0.2 ? easeOutBack(f.age / 0.2) : 1)
      if (f.age >= f.life) { f.t.destroy(); this.floats.splice(i, 1) }
    }
  }

  // ------------------------------------------------------------------ camera

  resize(w: number, h: number) {
    this.view = { w, h }
    this.root.hitArea = { contains: () => true }
    this.updateCamera(1)
  }

  private updateCamera(dt: number) {
    const { w, h } = this.view
    // The room plus the strip of pavement outside the door.
    const spanW = FLOOR_W + OUTSIDE_W
    const fit = Math.min(w / spanW, h / FLOOR_H)
    // Small screens zoom in and follow the player, so people stay a readable size.
    const readable = Math.min((h / FLOOR_H) * 0.86, 0.8)
    // The title backdrop covers a tall phone screen instead of sitting in a thin strip.
    const cover = Math.max(w / spanW, h / FLOOR_H)
    const s = this.demo ? (fit < 0.5 ? cover : fit) : fit < 0.5 ? Math.max(fit, readable) : fit
    this.scale = s
    this.world.scale.set(s)
    const worldW = spanW * s, worldH = FLOOR_H * s
    if (worldW <= w) this.world.x = (w - worldW) / 2 + OUTSIDE_W * s
    else {
      const focus = this.demo ? 640 : this.me.x
      this.camX += (focus - this.camX) * Math.min(1, dt * 4)
      this.world.x = Math.max(w - FLOOR_W * s, Math.min(OUTSIDE_W * s, w / 2 - this.camX * s))
    }
    // Tall phone screens: the room sits low, leaving the top for the HUD.
    this.world.y = worldH <= h ? (h > w * 1.3 && !this.demo ? Math.max((h - worldH) / 2, h - worldH - 24) : (h - worldH) / 2) : 0
  }

  /** Screen position of a world point (for DOM overlays). */
  toScreen(x: number, y: number) { return { x: this.world.x + x * this.scale, y: this.world.y + y * this.scale } }

  destroy() {
    this.destroyed = true
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('blur', this.onBlur)
    this.root.destroy({ children: true })
  }
}

// ------------------------------------------------------------------ small helpers

const pieceCache = new Map<string, Piece>()
const texCache = new Map<string, Texture>()
function cached(key: string, make: () => Piece): Piece { let p = pieceCache.get(key); if (!p) { p = make(); pieceCache.set(key, p) } return p }
function cachedTex(key: string, p: Piece): Texture { let t = texCache.get(key); if (!t) { t = canvasTexture(p.canvas); texCache.set(key, t) } return t }
const pairCache = new Map<string, { back: Piece; front: Piece }>()
function cachedPair(key: string, make: () => { back: Piece; front: Piece }) { let p = pairCache.get(key); if (!p) { p = make(); pairCache.set(key, p) } return p }

function nameTag(name: string, color: number, me: boolean, role = ''): Container {
  const c = new Container()
  const t = new Text({ text: name, style: { fontFamily: TAG_FONT, fontSize: 13, fontWeight: '800', fill: 0xffffff }, resolution: 3 })
  t.anchor.set(0.5)
  const extra = role ? new Text({ text: role, style: { fontFamily: TAG_FONT, fontSize: 9, fontWeight: '800', fill: color }, resolution: 3 }) : null
  const w = t.width + 18 + (extra ? extra.width + 10 : 0)
  const bg = new Graphics()
  bg.roundRect(-w / 2, -11, w, 22, 11).fill({ color }).stroke({ width: me ? 2.5 : 1.5, color: 0xffffff })
  bg.poly([-4, 10, 4, 10, 0, 15]).fill({ color })
  c.addChild(bg, t)
  if (extra) {
    t.x = -w / 2 + 9 + t.width / 2
    const pill = new Graphics()
    const ex = w / 2 - 7 - extra.width / 2
    pill.roundRect(ex - extra.width / 2 - 4, -7, extra.width + 8, 14, 7).fill({ color: 0xffffff })
    extra.anchor.set(0.5)
    extra.position.set(ex, 0)
    c.addChild(pill, extra)
  }
  return c
}

function speech(text: string): Container {
  const c = new Container()
  const t = new Text({ text, style: { fontFamily: TAG_FONT, fontSize: 13, fontWeight: '700', fill: 0x5a3a52, wordWrap: true, wordWrapWidth: 190, align: 'left', lineHeight: 17 }, resolution: 3 })
  const w = Math.min(210, t.width + 22), h = t.height + 16
  t.position.set(-w / 2 + 11, -h + 8)
  const bg = new Graphics()
  bg.roundRect(-w / 2, -h, w, h, 14).fill({ color: 0xffffff }).stroke({ width: 1.6, color: 0xf7c6d4 })
  bg.poly([-10, -1, 2, -1, -12, 10]).fill({ color: 0xffffff })
  c.addChild(bg, t)
  return c
}
