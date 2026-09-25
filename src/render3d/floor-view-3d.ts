import { Container, Graphics, Sprite as PixiSprite, Text, type Application, type FederatedPointerEvent } from 'pixi.js'
import { AdditiveBlending, Box3, CanvasTexture, Color, DirectionalLight, Fog, Group, HemisphereLight, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, OrthographicCamera, PlaneGeometry, Points, PointsMaterial, BufferGeometry, Float32BufferAttribute, Quaternion, Raycaster, Scene, Sprite, SpriteMaterial, Vector2, Vector3, type Texture } from 'three'
import { bits } from '../art/bits.ts'
import { treatmentIcon, icons } from '../art/salon/icons.ts'
import { paintGift } from '../art/salon/gift-art.ts'
import { paintFillerFrame, paintWallArt, type Piece } from '../art/salon/furniture.ts'
import { PLAYER_COLORS } from '../art/palette.ts'
import { purr, softPop } from '../audio/salon-sfx.ts'
import { sfx } from '../audio/sfx.ts'
import { DECOR_ITEM_BY_ID, GIFT_BY_ID, GIFT_SLOTS, placeDecor } from '../core/decor.ts'
import { canBuy, ITEM_BY_ID, ITEMS, STATION_NAME, type Item } from '../core/economy.ts'
import { ghostPicks, levelProgress, salonLevel, starsOwned, STYLE_COUNT, tierOf } from '../core/unlocks.ts'
import { confetti } from '../ui/confetti.ts'
import { blockedGrid, CELL, COLS, COMPUTER_SPOT, DESK, findPath, FIXTURES, FLOOR_H, FLOOR_W, PROP_BLOCK, PROP_SPOTS, ROWS, SOFA, SOFA_SEATS, stationSpot, SLOTS, type Pt } from '../core/floor.ts'
import { personaFor, storyBeat } from '../core/persona.ts'
import { withFigure } from '../core/figure.ts'
import type { Action } from '../core/salon.ts'
import { staffCountdown } from '../core/salon-ext.ts'
import { STAFF_ID_BASE, type StaffMember } from '../core/staff.ts'
import { playerLook, type FloorHooks, type FloorState } from '../render/floor-view.ts'
import { Particles, easeOutBack } from '../render/particles.ts'
import { CameraRig } from './camera.ts'
import { Cat3D } from './cat3d.ts'
import { aquarium, bigPlant, decorItem, desk, facialChair, floorDecal, floorLamp, fountainGarden, giftStand, glowSign, lounge, nailDesk, pedicureChair, pendantLight, soonScreen, succulent, teaCart, topiary, trophyShelf, waitingCorner, welcomeSign, type Build, type Node3, type StationNodes } from './furniture.ts'
import { buildAt, buildThumb, ghostable, spotFor, stationKeys, stationOf, stylable, type SpotCtx } from './pieces.ts'
import { randomLook } from '../core/customers.ts'
import { makeRng } from '../core/rng.ts'
import { AQUARIUM_SPOT, ART, BOTTLES, decorSpot, STREET, FLOOR_SLOTS, FRONT_LAMP, GIFT_SPOTS, LIGHTS, NEON, onWall, PLANT_SPOT, TEA_CART, TOPIARIES, TROPHY, WALL_SLOTS, WELCOME, WIN, WINDOW_SPOTS } from './layout.ts'
import { ProgressUi } from './progress-ui.ts'
import { setPalette, styleColor, styleName } from './styles.ts'
import { disposeGroup, G, Kit, tf } from './kit.ts'
import { lenX, lenZ, ROOM3, toSim, toWorld, turnTo, yawFor } from './mapping.ts'
import { moodBubble, nameTag, speech, toolBubble, waitDots } from './overlay.ts'
import { Person3D, type Tool3 } from './person3d.ts'
import { buildRoom, type RoomParts } from './room.ts'
import { stageFor, type Stage } from './stage.ts'
import { blobTexture, fromCanvas, glowTexture, padTexture, plaqueTexture, ringTexture, rugTexture, slotTexture, tex } from './textures.ts'

/**
 * The salon floor in 3D: the same salon state, hooks and public API as the 2D FloorView (src/render/floor-view.ts),
 * drawn as a real room seen from above at an angle. Three.js draws the room, the furniture and the people into
 * Pixi's canvas first; Pixi then draws the overlays (bubbles, tags, prompts, coins) on top, each placed by
 * projecting a 3D point. It moves the local player (keys, or tap to walk), shows the prompt at a station, the
 * computer or the cat, and reports what the player does through the hooks. It never changes the salon state.
 */
type Target = { kind: 'station'; id: string; x: number; y: number } | { kind: 'computer'; x: number; y: number } | { kind: 'cat'; x: number; y: number }

type CustomerView = { person: Person3D; x: number; y: number; yaw: number; bubble: Container; ring: Graphics; say: Container | null; sayT: number; said: boolean; lastState: string; alpha: number; dots: Container; waitT: number; seatK: number; head: Vector3 }
type PlayerView = { person: Person3D; tag: Container; x: number; y: number; yaw: number; name: string; workK: number; head: Vector3 }
type StaffView = { person: Person3D; tag: Container; x: number; y: number; yaw: number; path: Pt[]; goal: Pt; tea: Container; tool: { root: Container; icon: PixiSprite }; puff: number; name: string; workK: number; head: Vector3 }
type StationView = { nodes: StationNodes; box: Box3; center: Vector3; glow: Mesh; ring: Graphics; label: Container; text: Text }
/** A grey ghost of something to buy next: where it stands, what a tap hits, and its price badge. */
type BuyGhost = { item: Item; slot: number; box: Box3; anchor: Vector3; badge: Container; ph: number }
/** A piece Decorate can restyle: its style key, what a tap hits, and where it pops from. */
type StylePiece = { key: string; box: Box3; at: Vector3 }

/** The grey the ghosts are made of: soft, light and a little see-through, as in Serenity's. */
const GHOST_MAT = new MeshStandardMaterial({ color: 0xe6e2ea, roughness: 0.85, metalness: 0, transparent: true, opacity: 0.55, emissive: 0xffffff, emissiveIntensity: 0.1 })

const { w: RW, d: RD } = ROOM3
const _v = new Vector3()
const _v2 = new Vector3()

export class FloorView3D {
  /** The overlay layer (Pixi) over the 3D scene; hidden while a close-up is open (then the 3D pauses too). */
  readonly root = new Container()
  readonly demo: boolean
  private stage: Stage
  private scene = new Scene()
  private rig = new CameraRig()
  private room: RoomParts
  private key: DirectionalLight
  private furniture: Group | null = null
  private furnitureKey = ''
  private stations = new Map<string, StationView>()
  private deskBox = new Box3()
  /** The reception counter's centre on the floor (metres). */
  private deskTop = { x: 0, z: 0 }
  private sofaSeats: Node3[] = []
  private uiLayer = new Container()
  private fxLayer = new Container()
  private fx = new Particles()
  private cat: Cat3D
  private doorOpen = 0
  private bellSwing = 0
  private customers = new Map<number, CustomerView>()
  private players = new Map<number, PlayerView>()
  private staff = new Map<number, StaffView>()
  private floats: { t: Text; wx: Vector3; life: number; age: number }[] = []
  private state: FloorState | null = null
  private lastSeq = -1
  private t = 0
  private grid: Uint8Array = new Uint8Array(COLS * ROWS)
  private gridKey = ''
  private view = { w: 1280, h: 800 }
  private ui = 1
  // local player
  private me = { x: 240, y: 420, facing: 1 as 1 | -1, moving: false }
  private meYaw = 0
  private path: Pt[] = []
  private keys = new Set<string>()
  private sendTimer = 0
  private lastSent = ''
  private goal: Target | null = null
  private prompt = new Container()
  private promptText = new Text({ text: '', style: { fontFamily: 'Nunito, system-ui, sans-serif', fontSize: 15, fontWeight: '800', fill: 0x5a3a52 }, resolution: 3 })
  private promptKey = new Text({ text: 'F', style: { fontFamily: 'Nunito, system-ui, sans-serif', fontSize: 13, fontWeight: '800', fill: 0xffffff }, resolution: 3 })
  private promptBg = new Graphics()
  private target: Target | null = null
  private promptPop = 0
  private inputOn = true
  private destroyed = false
  private marker: Mesh
  private markerT = 0
  private highlight: Mesh
  private hover: Target | null = null
  private ghosts: { slot: number; mesh: Mesh; ph: number }[] = []
  private nextTab: 'stations' | undefined
  private ghostLabel: Container | null = null
  private neon: Mesh | null = null
  private glows: { s: Sprite; base: number; ph: number; flicker?: boolean }[] = []
  private fish: InstancedMesh | null = null
  private twinkle: Points | null = null
  private fishAt = new Vector3()
  private motes: Points
  private blobs: InstancedMesh
  /** Passers-by strolling the pavement outside now and then. */
  private passers: { person: Person3D; z: number; dir: 1 | -1; wait: number; speed: number }[] = []
  private raycaster = new Raycaster()
  private playerId: number
  private hooks: FloorHooks
  private app: Application
  // Progression (core/unlocks.ts): the ghosts, the level bar, the buy card and the style strip.
  private progress: ProgressUi | null = null
  private buyGhosts: BuyGhost[] = []
  private ghostGroup: Group | null = null
  private ghostKey = ''
  private stylePieces: StylePiece[] = []
  private decorating = false
  /** A station bought from its ghost in the morning waits for its slot: place it there as soon as it exists. */
  private placeInto: { item: string; slot: number } | null = null
  /** The piece that just changed style, for its squash-and-stretch pop. */
  private popAt: { at: Vector3; t: number } | null = null
  private thumbs = new Map<string, string>()
  /** The piece on the style strip, built on its own pivot, and the style it wore last build. */
  private isoKey: string | null = null
  private isoPivot: Group | null = null
  private isoStyle: number | null = null

  constructor(app: Application, playerId: number, hooks: FloorHooks, opts: { demo?: boolean } = {}) {
    this.app = app
    this.playerId = playerId
    this.hooks = hooks
    this.demo = !!opts.demo
    this.stage = stageFor(app)
    // ---- scene, light and air
    const bg = new Color(0xf3d9e3)
    this.scene.background = bg
    this.scene.fog = new Fog(0xf3d9e3, 42, 90)
    this.stage.onEnv(env => { this.scene.environment = env; this.scene.environmentIntensity = 0.4 })
    this.scene.add(new HemisphereLight(0xfff2ee, 0xd9a896, 0.55))
    const key = new DirectionalLight(0xffeedd, 1.9)
    // High and a little to the front left: short, soft shadows under things, as at midday.
    key.position.set(-5, 17, RD / 2 + 4.5)
    key.target.position.set(0.5, 0, RD / 2)
    key.castShadow = true
    const hi = this.stage.quality === 'high'
    key.shadow.mapSize.set(hi ? 2048 : 1024, hi ? 2048 : 1024)
    const sc = key.shadow.camera
    sc.left = -12; sc.right = 12; sc.top = 9; sc.bottom = -9; sc.near = 4; sc.far = 34
    key.shadow.radius = hi ? 6 : 3
    key.shadow.bias = -0.0004
    key.shadow.normalBias = 0.025
    this.scene.add(key, key.target)
    this.key = key
    // A soft fill from the camera's side, no shadows: walls and faces turned to the viewer stay bright and even.
    const fill = new DirectionalLight(0xfff3ec, 0.85)
    fill.position.set(-8, 7, RD / 2 + 8)
    fill.target.position.set(0, 0, RD / 2)
    this.scene.add(fill, fill.target)
    // ---- the room
    this.room = buildRoom()
    this.scene.add(this.room.group)
    // Soft contact shadows under people (one instanced draw).
    this.blobs = new InstancedMesh(new PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, toneMapped: false }), 40)
    this.blobs.count = 0
    this.blobs.renderOrder = 1
    this.blobs.frustumCulled = false
    this.scene.add(this.blobs)
    // The walk marker and the target highlight (rings on the floor).
    this.marker = new Mesh(new PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new MeshBasicMaterial({ map: ringTexture(), transparent: true, depthWrite: false, toneMapped: false, color: PLAYER_COLORS[Math.max(0, playerId) % 4] }))
    this.marker.visible = false
    this.marker.renderOrder = 2
    this.highlight = new Mesh(new PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new MeshBasicMaterial({ map: padTexture(), transparent: true, depthWrite: false, toneMapped: false, blending: AdditiveBlending, color: 0xffffff }))
    this.highlight.visible = false
    this.highlight.renderOrder = 2
    this.scene.add(this.marker, this.highlight)
    // Dust motes drifting in the window light.
    const mg = new BufferGeometry()
    const mp: number[] = []
    for (let i = 0; i < 26; i++) mp.push(1 + Math.random() * 7, 0.6 + Math.random() * 1.8, 0.4 + Math.random() * 3.5)
    mg.setAttribute('position', new Float32BufferAttribute(mp, 3))
    this.motes = new Points(mg, new PointsMaterial({ map: glowTexture(), size: 0.07, transparent: true, depthWrite: false, blending: AdditiveBlending, color: 0xffe2b8, opacity: 0.55, toneMapped: false }))
    this.scene.add(this.motes)
    // ---- passers-by on the pavement
    const pr = makeRng(this.demo ? 11 : 29)
    for (let i = 0; i < 2; i++) {
      const person = new Person3D(randomLook(pr), 'customer')
      person.root.visible = false
      this.scene.add(person.root)
      this.passers.push({ person, z: 0, dir: 1, wait: 2 + i * 7, speed: 1.1 + pr() * 0.4 })
    }
    // ---- the cat
    this.cat = new Cat3D(() => this.grid)
    this.cat.onZ = text => { const p = this.catWorld(); this.float(text, _v.set(p.x - 0.1, p.y + 0.45, p.z), 0x9c86d9, 16) }
    this.scene.add(this.cat.root)
    // ---- overlays
    this.root.addChild(this.fxLayer, this.uiLayer)
    this.fxLayer.addChild(this.fx.root)
    this.promptBg.eventMode = 'static'
    this.promptBg.cursor = 'pointer'
    this.promptText.anchor.set(0, 0.5)
    this.promptKey.anchor.set(0.5)
    this.prompt.addChild(this.promptBg, this.promptKey, this.promptText)
    this.prompt.visible = false
    this.prompt.eventMode = 'static'
    this.prompt.on('pointertap', (e: FederatedPointerEvent) => { e.stopPropagation(); this.interact() })
    this.uiLayer.addChild(this.prompt)
    // Progression UI (not on the title screen).
    const host = document.getElementById('ui')
    if (!this.demo && host) this.progress = new ProgressUi(host, {
      onBuy: id => this.buyFromGhost(id),
      onCancelBuy: () => softPop(0.8),
      onStyle: (key, style) => { sfx.pop(0.9); this.hooks.onAction({ a: 'style', item: key, style } as Action) },
      onStylesDone: () => { sfx.click(); this.closeStyles() },
      onDecorate: on => { sfx.click(); this.decorating = on; if (!on && this.isoKey) this.closeStyles() },
    })
    // Input.
    this.root.eventMode = 'static'
    this.root.on('pointertap', e => this.onTap(e))
    if (!this.demo) {
      this.root.on('pointermove', e => this.onHover(e))
      window.addEventListener('keydown', this.onKeyDown)
      window.addEventListener('keyup', this.onKeyUp)
      window.addEventListener('blur', this.onBlur)
    }
    this.resize(app.screen.width, app.screen.height)
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
    this.syncGhosts(state)
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
    for (const d of placeDecor(state.owned, state.ext?.decorOrder ?? [])) {
      if (d.place !== 'floor') continue
      const r = { x: d.x - 30, y: d.y - 24, w: 60, h: 30 }
      for (let y = Math.floor(r.y / CELL); y <= Math.floor((r.y + r.h) / CELL); y++) for (let x = Math.floor(r.x / CELL); x <= Math.floor((r.x + r.w) / CELL); x++) if (x >= 0 && y >= 0 && x < COLS && y < ROWS) this.grid[y * COLS + x] = 1
    }
  }

  private syncFurniture(state: FloorState) {
    const decor = placeDecor(state.owned, state.ext?.decorOrder ?? [])
    const styles = state.ext?.styles ?? {}
    const key = state.stations.map(s => `${s.id}:${s.kind}:${s.slot}`).join(',') + '|' + state.owned.filter(id => ITEM_BY_ID[id]?.tab === 'decor').join(',') + '|' + decor.map(d => d.id + d.slot).join(',') + '|' + (state.ext?.salonName ?? '') + '|' + JSON.stringify(styles) + '|' + (this.isoKey ?? '')
    if (key === this.furnitureKey) return
    this.furnitureKey = key
    if (this.furniture) disposeGroup(this.furniture)
    for (const st of this.stations.values()) { st.ring.destroy(); st.label.destroy() }
    this.stations.clear()
    this.ghosts = []
    this.ghostLabel?.destroy()
    this.ghostLabel = null
    this.neon = null
    this.glows = []
    this.fish = null
    this.twinkle = null
    this.stylePieces = []
    const b: Build = { kit: new Kit(), extra: new Group(), blobs: [] }
    const w = (x: number, y: number) => toWorld(x, y)
    const owned = new Set(state.owned)
    // The piece being restyled is built on its own pivot, so it can squash and stretch as its style changes.
    const iso: Build = { kit: new Kit(), extra: new Group(), blobs: b.blobs }
    let isoAt: Vector3 | null = null
    const into = <T>(key: string, x: number, z: number, box: Box3, fn: (bb: Build) => T): T => {
      if (stylable(key)) this.stylePieces.push({ key, box, at: new Vector3(x, 0, z) })
      if (key !== this.isoKey) return fn(b)
      isoAt = new Vector3(x, 0, z)
      return fn(iso)
    }
    const boxAt = (x: number, z: number, rx: number, rz: number, h: number) => new Box3(new Vector3(x - rx, 0, z - rz), new Vector3(x + rx, h, z + rz))
    // ---- front of house: the reception out from the wall (the computer faces the staff gap behind it)
    const deskC = w(DESK.x + DESK.w / 2, DESK.y + DESK.h / 2)
    const deskW = lenX(DESK.w) - 0.1, deskD = Math.min(0.85, lenZ(DESK.h) - 0.1)
    into('desk', deskC.x, deskC.z, boxAt(deskC.x, deskC.z, deskW / 2, deskD / 2, 1.4), bb => desk(bb, deskC.x, deskC.z, deskW, deskD, styleColor(styles, 'desk'), tierOf(state.owned, 'desk')))
    this.deskBox.set(new Vector3(deskC.x - deskW / 2 - 0.1, 0, deskC.z - deskD / 2 - 0.1), new Vector3(deskC.x + deskW / 2 + 0.1, 1.5, deskC.z + deskD / 2 + 0.1))
    this.deskTop = { x: deskC.x, z: deskC.z }
    const plaque = plaqueTexture(state.ext?.salonName ?? 'Glow Salon')
    const pw = Math.min(deskW - 0.8, 0.2 * plaque.aspect)
    const pm = new Mesh(new PlaneGeometry(pw, pw / plaque.aspect), new MeshBasicMaterial({ map: plaque.tex, transparent: true, toneMapped: false }))
    pm.position.set(deskC.x - 0.35, 0.8, deskC.z + deskD / 2 + 0.012)
    b.extra.add(pm)
    // The waiting lounge: a teal cloud sofa in an arc on a round rug, plants at its ends.
    const sofaZ = 0.62
    const lc = w(SOFA.x + SOFA.w / 2, 0)
    this.sofaSeats = into('lounge', lc.x, sofaZ, boxAt(lc.x, sofaZ + 0.3, lenX(SOFA.w) / 2, 0.6, 1.1), bb => lounge(bb, sofaZ, SOFA_SEATS.map(s => w(s.x, s.y).x), styleColor(styles, 'lounge'), tierOf(state.owned, 'lounge')))
    floorDecal(b, rugTexture('round', '#bfeee4', '#7fd4c2', '#ffffff'), lc.x, sofaZ + 0.55, lenX(SOFA.w) + 0.4, 1.9, 0.004)
    teaCart(b, TEA_CART.x, TEA_CART.z, TEA_CART.ry)
    welcomeSign(b, WELCOME.x, WELCOME.z, 1.1)
    floorLamp(b, FRONT_LAMP.x, FRONT_LAMP.z, 0xfbe0e8)
    this.lampGlow(b, FRONT_LAMP.x, 1.5, FRONT_LAMP.z, 0.6)
    // The waiting corner: armchairs round a coffee table on a rug, and the little fountain planter.
    const wc = FIXTURES.waiting, wa = w(wc.x + wc.w / 2, wc.y + wc.h / 2)
    waitingCorner(b, wa.x, wa.z, lenX(wc.w), lenZ(wc.h))
    floorDecal(b, rugTexture('round', '#fbe3ea', '#f5b3c6', '#ffffff'), wa.x, wa.z, lenX(wc.w) + 0.7, lenZ(wc.h) + 0.6, 0.004)
    const pc = FIXTURES.planter, pa = w(pc.x + pc.w / 2, pc.y + pc.h / 2)
    fountainGarden(b, pa.x, pa.z, lenX(pc.w), lenZ(pc.h))
    // A wall shelf of bottles on the right wall, and topiaries along the walls and at the partitions' ends.
    { const p = onWall(BOTTLES.wall, BOTTLES.u); decorItem(b, 'shelf', [0xffffff, 0xcdbdf2, 0xf6a9c2, 0xfbe0a0], p.x, BOTTLES.y, p.z, p.ry) }
    for (const t of TOPIARIES) topiary(b, t.x, t.z, t.k)
    // A runner by the front.
    const runner = w(440, 700)
    floorDecal(b, rugTexture('runner', '#fff3e6', '#ffc94d', '#f7a9bd'), runner.x, runner.z, 3.4, 1.1, 0.005)
    // ---- stations and the empty slots
    const usedSlots = new Set(state.stations.map(s => s.slot))
    const unplaced = this.demo ? undefined : state.stations.find(s => s.slot < 0)
    let firstEmpty = true
    SLOTS.forEach((p, i) => {
      if (usedSlots.has(i)) return
      const at = w(p.x, p.y)
      if (unplaced) {
        const m = floorDecal(b, slotTexture(true), at.x, at.z, lenX(160), lenZ(112), 0.012, 0, true)
        this.ghosts.push({ slot: i, mesh: m, ph: i * 0.7 })
        return
      }
      // The title's salon keeps its folding screen; in play, the next station stands there as a grey ghost.
      if (firstEmpty && i < 6 && this.demo) soonScreen(b, at.x, at.z - 0.2)
      firstEmpty = false
    })
    if (unplaced && this.ghosts.length) {
      const label = speech(`Tap a glowing spot for your new ${STATION_NAME[unplaced.kind]}`)
      this.uiLayer.addChild(label)
      this.ghostLabel = label
    }
    const pad = padTexture()
    const keys = stationKeys(state.owned)
    for (const st of state.stations) {
      if (st.slot < 0) continue
      const p = SLOTS[st.slot]
      const at = w(p.x, p.y)
      const skey = keys[Number(st.id.slice(1))] ?? 'facial-chair-1'
      const color = styleColor(styles, skey), tier = tierOf(state.owned, st.kind)
      const nodes = into(skey, at.x, at.z, boxAt(at.x, at.z, 1.0, 0.7, 1.4), bb => st.kind === 'facial' ? facialChair(bb, at.x, at.z, color, tier) : st.kind === 'feet' ? pedicureChair(bb, at.x, at.z, color, tier) : nailDesk(bb, at.x, at.z, color, tier))
      if (tierOf(state.owned, 'lights') >= 2) pendantLight(b, at.x + 0.1, at.z)
      const glow = new Mesh(new PlaneGeometry(lenX(190), lenZ(150)).rotateX(-Math.PI / 2), new MeshBasicMaterial({ map: pad, transparent: true, depthWrite: false, toneMapped: false, blending: AdditiveBlending, color: 0xf28db0, opacity: 0 }))
      glow.position.set(at.x - 0.1, 0.014, at.z + 0.1)
      glow.renderOrder = 2
      b.extra.add(glow)
      const ring = new Graphics()
      const label = new Container()
      const text = new Text({ text: '', style: { fontFamily: 'Nunito, system-ui, sans-serif', fontSize: 12, fontWeight: '800', fill: 0x5a3a52 }, resolution: 3 })
      text.anchor.set(0.5)
      label.addChild(new Graphics(), text)
      this.uiLayer.addChildAt(ring, 0)
      this.uiLayer.addChildAt(label, 0)
      const box = new Box3(new Vector3(at.x - 1.15, 0, at.z - 0.75), new Vector3(at.x + 1.15, 1.5, at.z + 0.75))
      this.stations.set(st.id, { nodes, box, center: new Vector3(at.x, 0, at.z), glow, ring, label, text })
    }
    // ---- empty decor slots get a little filler until something is bought for them
    const taken = new Set(decor.map(d => `${d.place}:${d.slot}`))
    /** A painted picture flat on the back wall at `u`, no wider than `maxW`. */
    const wallPic = (piece: Piece, u: number, y: number, maxW: number) => {
      const k = Math.min(maxW / (lenX(piece.w) * 1.1), 1.6)
      const m = new Mesh(new PlaneGeometry(lenX(piece.w) * 1.1 * k, lenX(piece.h) * 1.1 * k), new MeshBasicMaterial({ map: fromCanvas(piece.canvas), transparent: true, toneMapped: false }))
      ;(m.material as MeshBasicMaterial).color.setScalar(0.94)
      m.position.set(onWall('back', u).x, y, 0.012)
      b.extra.add(m)
    }
    WALL_SLOTS.forEach((u, i) => { if (!taken.has(`wall:${i}`)) wallPic(cachedPiece(`filler${i}`, () => paintFillerFrame(i)), u, 1.7, 0.7) })
    FLOOR_SLOTS.forEach((s, i) => { if (!taken.has(`floor:${i}`) && i !== 3) succulent(b, s.x, s.z) })
    // ---- starter decor
    if (owned.has('rug')) { const a = w(420, 560); const c = css(styleColor(styles, 'rug')); into('rug', a.x, a.z, boxAt(a.x, a.z, 1.2, 0.85, 0.2), bb => floorDecal(bb, rugTexture('cloud', '#fdf6fb', c, c), a.x, a.z, 2.6, 1.9, 0.006)) }
    if (owned.has('plant')) into('plant', PLANT_SPOT.x, PLANT_SPOT.z, boxAt(PLANT_SPOT.x, PLANT_SPOT.z, 0.45, 0.45, 1.9), bb => bigPlant(bb, PLANT_SPOT.x, PLANT_SPOT.z, styleColor(styles, 'plant'), 1.1))
    // ---- the salon's upgrades (core/unlocks.ts): the fountain garden and the trophy shelf of stars
    if (owned.has('up-fountain')) {
      const r = PROP_BLOCK['up-fountain'], a = w(r.x + r.w / 2, r.y + r.h / 2)
      fountainGarden(b, a.x, a.z, lenX(r.w), lenZ(r.h))
    }
    const stars = starsOwned(state.owned)
    if (stars) { const p = onWall(TROPHY.wall, TROPHY.u); trophyShelf(b, p.x, TROPHY.y, p.z, p.ry, stars) }
    this.room.setTiers(tierOf(state.owned, 'floor'), tierOf(state.owned, 'walls'))
    if (owned.has('candles')) {
      const a = { x: this.deskTop.x + 0.75, z: this.deskTop.z + 0.12 }
      for (const [dx, h] of [[0, 0.16], [0.08, 0.11], [-0.07, 0.09]] as const) {
        b.kit.add(G.cyl(0.03, 0.03, h, 10), 0xfff4e6, 'satin', tf(a.x + dx, 1.055 + h / 2, a.z))
        b.kit.add(G.sphere(0.014, 6), 0xffc27a, 'glow', tf(a.x + dx, 1.07 + h, a.z, 0, 0, 0, 0.8, 1.4, 0.8))
      }
      this.lampGlow(b, a.x, 1.25, a.z, 0.25)
    }
    if (owned.has('art')) wallPic(cachedPiece('art', paintWallArt), ART.u, (ART.y0 + ART.y1) / 2, ART.w)
    if (owned.has('lights')) {
      // Fairy lights swag along the top of the back wall; each bulb's halo twinkles on its own.
      const halo: number[] = [], tw: number[] = []
      for (let i = 0; i <= 40; i++) {
        const x = -RW / 2 + 0.3 + (i / 40) * (RW - 0.6)
        const sag = 0.18 * Math.sin(((i % 8) / 8) * Math.PI)
        b.kit.add(G.sphere(0.028, 6), i % 3 ? 0xffd9a0 : 0xffc0d0, 'glow', tf(x, LIGHTS.y1 - 0.02 - sag * 0.25, 0.05))
        halo.push(x, LIGHTS.y1 - 0.02 - sag * 0.25, 0.07)
        tw.push(Math.random() * 10)
      }
      const hg = new BufferGeometry()
      hg.setAttribute('position', new Float32BufferAttribute(halo, 3))
      this.twinkle = new Points(hg, new PointsMaterial({ map: glowTex(), size: 0.22, transparent: true, depthWrite: false, blending: AdditiveBlending, color: 0xffc27a, opacity: 0.5, toneMapped: false }))
      b.extra.add(this.twinkle)
    }
    if (owned.has('neon')) {
      const a = w(505, 0)
      void a
      this.neon = glowSign(b, neonTexture(), onWall('back', NEON.u).x, (NEON.y0 + NEON.y1) / 2, 0.01, NEON.w, NEON.y1 - NEON.y0)
    }
    if (owned.has('aquarium')) {
      const a = { x: AQUARIUM_SPOT.x - 0.1, z: AQUARIUM_SPOT.z }
      aquarium(b, a.x + 0.1, a.z, Math.PI / 2)
      const fish = new InstancedMesh(G.sphere(0.03, 8), new MeshBasicMaterial({ toneMapped: false }), 3)
      ;[0xffa46b, 0xffd35a, 0xf48fb1].forEach((c, i) => fish.setColorAt(i, new Color(c)))
      this.fish = fish
      this.fishAt.set(a.x + 0.1, 0.98, a.z)
      b.extra.add(fish)
    }
    if (owned.has('chandelier')) {
      const a = w(PROP_SPOTS.chandelier.x, 0)
      decorItem(b, 'chandelier', [0xf7c6d4, 0xffffff, 0xffffff, 0xfbe0a0], a.x, 2.45, 1.7)
      const s = this.glowSprite(0xfff0d0, 0.5)
      s.scale.setScalar(1.4)
      s.position.set(a.x, 2.45, 1.7)
      b.extra.add(s)
      this.glows.push({ s, base: 0.5, ph: 1 })
    }
    // ---- decor sets, in their slots
    for (const d of decor) {
      const item = DECOR_ITEM_BY_ID[d.id]
      const pal = setPalette(styles, d.id)
      const sp = decorSpot(item.place, d.slot, item.kind)
      const hung = item.place === 'wall' || item.place === 'window'
      const bx = hung ? boxAt(sp.x, 0.15, 0.6, 0.3, 2.6) : item.place === 'ceiling' ? boxAt(sp.x, sp.z, 0.5, 0.5, 2.8) : boxAt(sp.x, sp.z, 0.6, 0.5, 1.6)
      this.stylePieces.push({ key: d.id, box: bx, at: new Vector3(sp.x, 0, hung ? 0.2 : sp.z) })
      if (item.place === 'window') for (const wsp of WINDOW_SPOTS) { const p = onWall(wsp.wall, wsp.u); decorItem(b, 'curtains', pal, p.x, WIN.bottom + WIN.h + WIN.w / 2 + 0.08, p.z, p.ry) }
      else if (item.place === 'rug') floorDecal(b, rugTexture(item.kind === 'sand' ? 'plain' : 'round', css(pal[0]), css(pal[1]), css(pal[2])), sp.x, sp.z, item.size === 2 ? 3.0 : 2.3, item.size === 2 ? 2.0 : 1.5, 0.007)
      else decorItem(b, item.kind, pal, sp.x, sp.y, sp.z, sp.ry, sp.k)
    }
    // ---- gifts from friends, on little stands in the gift spots
    state.owned.filter(id => GIFT_BY_ID[id]).slice(0, GIFT_SPOTS.length).forEach((id, i) => {
      const spot = GIFT_SPOTS[i]
      const regular = GIFT_BY_ID[id]?.regular ?? ''
      const piece = cachedPiece(`gift:${regular}`, () => paintGift(regular) ?? paintFillerFrame(i))
      giftStand(b, fromCanvas(piece.canvas), spot.x, spot.z, spot.ry)
    })
    this.room.garden.setName(state.ext?.salonName ?? 'Glow Salon')
    const group = new Group()
    group.add(b.kit.build(), b.extra)
    this.isoPivot = null
    if (isoAt && !iso.kit.empty) {
      const at = isoAt as Vector3
      const inner = iso.kit.build()
      inner.add(iso.extra)
      inner.position.set(-at.x, 0, -at.z)
      const pivot = new Group()
      pivot.position.copy(at)
      pivot.add(inner)
      group.add(pivot)
      this.isoPivot = pivot
      // The style just changed: pop it.
      const style = styles[this.isoKey!] ?? 0
      if (this.isoStyle !== null && style !== this.isoStyle) this.stylePop(at)
      this.isoStyle = style
    }
    this.furniture = group
    this.scene.add(group)
    this.room.setShade(b.blobs)
  }

  private glowSprite(color: number, opacity: number): Sprite {
    const s = new Sprite(new SpriteMaterial({ map: glowTex(), color, transparent: true, opacity, depthWrite: false, blending: AdditiveBlending, toneMapped: false }))
    s.renderOrder = 3
    return s
  }

  private lampGlow(b: Build, x: number, y: number, z: number, size: number) {
    const s = this.glowSprite(0xffe2b0, 0.55)
    s.scale.setScalar(size)
    s.position.set(x, y, z)
    b.extra.add(s)
  }

  /** Where something the salon owns stands, for the camera and the sparkles (sim units, as the 2D floor). */
  itemSpot(id: string): Pt | null {
    const state = this.state
    if (!state) return null
    const d = placeDecor(state.owned, state.ext?.decorOrder ?? []).find(x => x.id === id)
    if (d) return { x: d.x, y: d.place === 'ceiling' ? 260 : d.place === 'window' ? 200 : d.place === 'wall' ? 190 : d.y - 20 }
    const gi = state.owned.filter(o => GIFT_BY_ID[o]).indexOf(id)
    if (gi >= 0 && gi < GIFT_SLOTS.length) return { x: GIFT_SLOTS[gi].x, y: GIFT_SLOTS[gi].y - 20 }
    const e = ITEM_BY_ID[id]?.effect
    if (e?.kind === 'decor' && PROP_SPOTS[e.prop]) return { x: PROP_SPOTS[e.prop].x, y: Math.max(200, PROP_SPOTS[e.prop].y) }
    return null
  }

  /** Move the camera to a spot for a moment, with a sparkle burst: something new is here. */
  focusOn(x: number, y: number, pan = true) {
    const p = toWorld(x, y)
    if (pan) this.rig.focus(p.x, p.z)
    this.burst(_v.set(p.x, 0.9, p.z), 'sparkle', 16)
    this.burst(_v.set(p.x, 0.9, p.z), 'heart', 4)
    sfx.unlockChime()
  }

  private syncPeople(state: FloorState) {
    const seen = new Set<number>()
    for (const c of state.customers) {
      seen.add(c.id)
      if (this.customers.has(c.id)) continue
      const persona = personaFor(c.plan, { rating: state.stats.ratingBefore, bias: state.ext?.today.bias })
      const person = new Person3D(withFigure(c.plan.look, c.plan.name, persona.archetype, c.plan.seed), 'customer', undefined, persona.archetype)
      const { bubble, ring } = moodBubble(c.plan.treatment)
      const dots = waitDots()
      this.uiLayer.addChild(bubble, dots)
      this.scene.add(person.root)
      this.customers.set(c.id, { person, x: c.x, y: c.y, yaw: Math.PI / 2, bubble, ring, say: null, sayT: 0, said: false, lastState: '', alpha: 0, dots, waitT: 0, seatK: 0, head: new Vector3() })
    }
    for (const [id, v] of this.customers) if (!seen.has(id)) { v.person.destroy(); v.bubble.destroy(); v.dots.destroy(); v.say?.destroy(); this.customers.delete(id) }
    const pseen = new Set<number>()
    for (const p of state.players) {
      pseen.add(p.id)
      let v = this.players.get(p.id)
      if (!v || v.name !== p.name) {
        if (v) { v.person.destroy(); v.tag.destroy() }
        const col = PLAYER_COLORS[p.id % PLAYER_COLORS.length]
        const person = new Person3D(playerLook(p.id, p.name), 'player', col)
        const tag = nameTag(p.name, col, p.id === this.playerId)
        tag.visible = !this.demo
        this.uiLayer.addChild(tag)
        this.scene.add(person.root)
        v = { person, tag, x: p.x, y: p.y, yaw: 0, name: p.name, workK: 0, head: new Vector3() }
        this.players.set(p.id, v)
      }
    }
    for (const [id, v] of this.players) if (!pseen.has(id)) { v.person.destroy(); v.tag.destroy(); this.players.delete(id) }
    const sseen = new Set<number>()
    for (const s of state.ext?.staff ?? []) {
      sseen.add(s.id)
      let v = this.staff.get(s.id)
      if (!v || v.name !== s.name) {
        const pos = v ? { x: v.x, y: v.y } : { x: 360, y: 330 }
        if (v) { v.person.destroy(); v.tag.destroy(); v.tea.destroy(); v.tool.root.destroy() }
        const person = new Person3D(s.look, 'staff')
        const tag = nameTag(s.name, 0x4fbf98, false, 'staff')
        tag.visible = !this.demo
        const tea = new Container()
        const ts = new PixiSprite(icons.tea())
        ts.anchor.set(0.5)
        tea.addChild(ts)
        tea.visible = false
        const tool = toolBubble()
        this.uiLayer.addChild(tag, tea, tool.root)
        this.scene.add(person.root)
        v = { person, tag, x: pos.x, y: pos.y, yaw: 0, path: [], goal: pos, tea, tool, puff: 0, name: s.name, workK: 0, head: new Vector3() }
        this.staff.set(s.id, v)
      }
    }
    for (const [id, v] of this.staff) if (!sseen.has(id)) { v.person.destroy(); v.tag.destroy(); v.tea.destroy(); v.tool.root.destroy(); this.staff.delete(id) }
  }

  private syncEvents(state: FloorState) {
    for (const e of state.events) {
      if (e.seq <= this.lastSeq) continue
      this.lastSeq = e.seq
      if (e.kind === 'arrive') { sfx.door(); this.doorOpen = Math.max(this.doorOpen, 0.2); this.bellSwing = 1 }
      else if (e.kind === 'bought' && e.item) {
        const ghost = state.stations.some(st => st.slot < 0) ? SLOTS[state.stations.find(st => st.slot < 0) ? SLOTS.findIndex((_, i) => !state.stations.some(st => st.slot === i)) : 0] : null
        const spot = this.itemSpot(e.item) ?? (ghost ? { x: ghost.x, y: ghost.y } : null)
        if (!spot) continue
        const mine = e.player === this.playerId
        if (mine) this.hooks.onBoughtHere?.(e.item)
        setTimeout(() => { if (!this.destroyed) this.focusOn(spot.x, spot.y, mine) }, mine ? 450 : 0)
        // Bought here: pick its look straight away (a treatment's look is its station's).
        const got = ITEM_BY_ID[e.item]
        const styleKey = got?.effect.kind === 'treatment' ? got.includes?.find(i => ITEM_BY_ID[i]?.effect.kind === 'station') : e.item
        if (mine && styleKey && stylable(styleKey) && this.progress) setTimeout(() => { if (!this.destroyed && this.state?.owned.includes(styleKey)) this.openStyles(styleKey) }, 1300)
      } else if (e.kind === 'placed' && e.x !== undefined && e.y !== undefined) this.focusOn(e.x, e.y - 30, e.player === this.playerId)
      else if (e.kind === 'gift' && e.item) { const spot = this.itemSpot(e.item); if (spot) this.focusOn(spot.x, spot.y, false) }
      else if (e.kind === 'unlock' && !this.demo) this.celebrate(e.amount ?? salonLevel(this.earned(state)), e.item)
      else if (e.kind === 'paid') {
        sfx.cash()
        const p = toWorld(e.x ?? 600, e.y ?? 400)
        this.float(`+$${e.amount ?? 0}`, _v.set(p.x, 2.0, p.z), 0xe2a33a, 22)
        this.burst(_v.set(p.x, 1.8, p.z), 'heart', 7)
        this.burst(_v.set(p.x, 1.8, p.z), 'coin', 5)
      }
    }
  }

  // ------------------------------------------------------------------ progression: ghosts, styles, the level bar

  /** The salon's lifetime earnings (the level bar), from the state the floor was given. */
  private earned(state: FloorState) { return (state as { totals?: { earned: number } }).totals?.earned ?? 0 }

  private buyCheck(state: FloorState, id: string) { return canBuy(state.owned, state.money ?? 0, id, state.day, salonLevel(this.earned(state))) }

  /** Where things stand now, for the ghosts. */
  private spotCtx(state: FloorState): SpotCtx {
    const used = new Set(state.stations.map(s => s.slot))
    const stationSlots: SpotCtx['stationSlots'] = {}
    for (const s of state.stations) if (s.slot >= 0 && stationSlots[s.kind] === undefined) stationSlots[s.kind] = s.slot
    const decor = placeDecor(state.owned, state.ext?.decorOrder ?? [])
    return { freeSlots: SLOTS.map((_, i) => i).filter(i => !used.has(i)), takenDecor: new Set(decor.map(d => `${d.place}:${d.slot}`)), stationSlots, owned: state.owned }
  }

  /**
   * The grey ghosts: the next few things to buy (core/unlocks.ts ghostPicks), standing where they would go, each
   * with its price badge. Rebuilt only when the picks or their places change.
   */
  private syncGhosts(state: FloorState) {
    if (this.demo || !this.progress) return
    // A station bought from its ghost this morning goes straight into the ghost's slot.
    const waiting = state.stations.find(s => s.slot < 0)
    if (this.placeInto && waiting && !state.stations.some(s => s.slot === this.placeInto!.slot)) { this.hooks.onAction({ a: 'place', station: waiting.id, slot: this.placeInto.slot }); this.placeInto = null }
    const picks = ghostPicks(ITEMS, state.money ?? 0, id => this.buyCheck(state, id), ghostable, this.view.h > this.view.w * 1.2 ? 3 : 4)
    const ctx = this.spotCtx(state)
    const placed: { item: Item; spot: NonNullable<ReturnType<typeof spotFor>> }[] = []
    let nth = 0
    for (const item of picks) {
      // A station waiting for its spot shows the glowing slots instead of a station ghost.
      if (stationOf(item) && waiting) continue
      const spot = spotFor(item, ctx, stationOf(item) ? nth : 0)
      if (!spot) continue
      if (spot.kind === 'station') nth++
      placed.push({ item, spot })
    }
    const key = placed.map(p => `${p.item.id}@${JSON.stringify(p.spot)}`).join('|') + `|${state.owned.length}`
    if (key === this.ghostKey) return
    this.ghostKey = key
    this.clearGhosts()
    const b: Build = { kit: new Kit(), extra: new Group(), blobs: [] }
    for (const { item, spot } of placed) {
      const r = buildAt(b, spot, ctx)
      const inPlace = spot.kind === 'upgrade' && !['star', 'lights', 'fountain'].includes(spot.family)
      const badge = this.makeBadge(item, inPlace)
      this.uiLayer.addChild(badge)
      this.buyGhosts.push({ item, slot: spot.kind === 'station' ? spot.slot : -1, box: inPlace ? new Box3() : r.box, anchor: r.anchor, badge, ph: Math.random() * 6 })
    }
    const group = new Group()
    if (!b.kit.empty) group.add(b.kit.build(false, GHOST_MAT))
    b.extra.traverse(o => { if (o instanceof Mesh) { const m = o.material as MeshStandardMaterial; m.transparent = true; m.opacity = 0.55; if ('color' in m) m.color.setRGB(0.92, 0.9, 0.95) } })
    group.add(b.extra)
    this.ghostGroup = group
    this.scene.add(group)
  }

  private clearGhosts() {
    for (const g of this.buyGhosts) g.badge.destroy({ children: true })
    this.buyGhosts = []
    if (this.ghostGroup) { disposeGroup(this.ghostGroup); this.ghostGroup = null }
  }

  /** A ghost's price tag: a white pill with a coin (and an arrow for an upgrade of something already here). */
  private makeBadge(item: Item, upgrade: boolean): Container {
    const c = new Container()
    const bg = new Graphics()
    const t = new Text({ text: `$${item.price.toLocaleString('en-US')}`, style: { fontFamily: 'Nunito, system-ui, sans-serif', fontSize: 14, fontWeight: '800', fill: 0x5a3a52 }, resolution: 3 })
    t.anchor.set(0, 0.5)
    const w = t.width + (upgrade ? 58 : 42)
    c.addChild(bg, t)
    t.position.set(-w / 2 + 34, 0)
    const draw = (ok: boolean) => {
      bg.clear()
      bg.roundRect(-w / 2, -15, w, 30, 15).fill({ color: ok ? 0xffffff : 0xf4eef2 }).stroke({ width: 2, color: ok ? 0x6fc9a9 : 0xd9c8d2 })
      bg.poly([-6, 13, 6, 13, 0, 21]).fill({ color: ok ? 0xffffff : 0xf4eef2 })
      bg.circle(-w / 2 + 17, 0, 10).fill({ color: ok ? 0xf0b840 : 0xd8c9a8 }).circle(-w / 2 + 15, -2, 4).fill({ color: 0xffffff, alpha: 0.5 })
      if (upgrade) bg.poly([w / 2 - 20, 5, w / 2 - 12, -6, w / 2 - 4, 5]).fill({ color: ok ? 0x45b890 : 0xc8b8c2 })
      t.style.fill = ok ? 0x5a3a52 : 0x9a8494
    }
    ;(c as Container & { draw?: (ok: boolean) => void; ok?: boolean }).draw = draw
    draw(false)
    c.eventMode = 'static'
    c.cursor = 'pointer'
    c.on('pointertap', (e: FederatedPointerEvent) => { e.stopPropagation(); if (this.inputOn) this.openBuy(item) })
    return c
  }

  /** The buy card for a ghost. */
  private openBuy(item: Item) {
    const state = this.state
    if (!state || !this.progress) return
    sfx.click()
    const check = this.buyCheck(state, item.id)
    const reason = check.ok ? null : check.reason
    this.progress.showBuy(item.id, item.name, item.blurb, item.price, this.thumbFor(item), reason)
  }

  private buyFromGhost(id: string) {
    const g = this.buyGhosts.find(x => x.item.id === id)
    if (g && g.slot >= 0) this.placeInto = { item: id, slot: g.slot }
    sfx.buy()
    this.hooks.onAction({ a: 'buy', item: id })
  }

  /** The style strip for a piece: its three looks as cards, the piece on its own pivot so it can pop. */
  private openStyles(key: string) {
    const state = this.state
    if (!state || !this.progress || !stylable(key)) return
    const style = state.ext?.styles?.[key] ?? 0
    this.isoKey = key
    this.isoStyle = style
    this.furnitureKey = ''
    this.syncFurniture(state)
    const cards = Array.from({ length: STYLE_COUNT }, (_, i) => ({ name: styleName(key, i), thumb: this.thumb(key, i) }))
    const name = key === 'desk' ? 'Reception' : key === 'lounge' ? 'Waiting lounge' : key === 'facial-chair-1' ? 'Facial chair' : ITEM_BY_ID[key]?.name ?? ''
    this.progress.showStyles(key, `${name}: pick a look`, cards, style)
    const piece = this.stylePieces.find(p => p.key === key)
    if (piece) this.rig.focus(piece.at.x, piece.at.z, 1.6)
  }

  private closeStyles() {
    this.progress?.hideStyles()
    this.isoKey = null
    this.isoStyle = null
    this.furnitureKey = ''
    if (this.state) this.syncFurniture(this.state)
  }

  /** A style just changed: sparkles, a pop and a squash and stretch. */
  private stylePop(at: Vector3) {
    this.popAt = { at: at.clone(), t: 0 }
    this.burst(_v.set(at.x, 0.9, at.z), 'sparkle', 14)
    this.burst(_v.set(at.x, 0.9, at.z), 'heart', 3)
    sfx.sparkle()
  }

  /** A picture of a piece in one of its styles, for the style cards (cached). */
  private thumb(key: string, style: number): string {
    const owned = this.state?.owned ?? []
    const id = `${key}|${style}|${['desk', 'lounge', 'facial', 'nails', 'feet'].map(f => tierOf(owned, f as 'desk')).join('')}`
    const hit = this.thumbs.get(id)
    if (hit) return hit
    const url = this.picture(bb => buildThumb(bb, key, style, owned))
    this.thumbs.set(id, url)
    return url
  }

  /** A picture of an item before it is bought, for its buy card. */
  private thumbFor(item: Item): string {
    const state = this.state!
    const owned = [...state.owned, item.id]
    const st = stationOf(item)
    const key = st ? (item.effect.kind === 'station' ? item.id : item.includes?.find(i => ITEM_BY_ID[i]?.effect.kind === 'station') ?? item.id) : item.id
    if (stylable(key) || st) return this.picture(bb => buildThumb(bb, key, 0, owned))
    const fam = item.id.replace(/^up-/, '').replace(/-\d$/, '')
    if (fam === 'desk' || fam === 'lounge') return this.picture(bb => buildThumb(bb, fam, state.ext?.styles?.[fam] ?? 0, owned))
    if (fam === 'facial' || fam === 'nails' || fam === 'feet') return this.picture(bb => buildThumb(bb, fam === 'facial' ? 'facial-chair-1' : fam === 'nails' ? 'nail-desk' : 'pedi-chair', 0, owned))
    const spot = spotFor(item, this.spotCtx(state), 0)
    return spot ? this.picture(bb => buildAt(bb, spot, this.spotCtx(state))) : ''
  }

  /** Render what `build` makes, alone, at the salon's angle, into a small transparent picture. */
  private picture(build: (b: Build) => void): string {
    const b: Build = { kit: new Kit(), extra: new Group(), blobs: [] }
    build(b)
    const group = new Group()
    if (!b.kit.empty) group.add(b.kit.build(false))
    group.add(b.extra)
    const scene = new Scene()
    scene.add(group, new HemisphereLight(0xfff4f0, 0xd9a896, 1.1))
    const key = new DirectionalLight(0xffeedd, 1.8)
    key.position.set(-3, 6, 4)
    const fill = new DirectionalLight(0xfff3ec, 0.8)
    fill.position.set(-5, 3, 6)
    scene.add(key, fill)
    scene.environment = this.scene.environment
    scene.environmentIntensity = 0.5
    const box = new Box3().setFromObject(group)
    if (box.isEmpty()) return ''
    const centre = box.getCenter(new Vector3())
    const cam = new OrthographicCamera(-1, 1, 1, -1, 0.1, 100)
    const yaw = this.rig.yaw, pitch = this.rig.pitch
    cam.position.set(centre.x + Math.sin(yaw) * Math.cos(pitch) * 20, centre.y + Math.sin(pitch) * 20, centre.z + Math.cos(yaw) * Math.cos(pitch) * 20)
    cam.lookAt(centre)
    cam.updateMatrixWorld(true)
    let mx = 0.1, my = 0.1
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
      const p = new Vector3(x, y, z).applyMatrix4(cam.matrixWorldInverse)
      mx = Math.max(mx, Math.abs(p.x)); my = Math.max(my, Math.abs(p.y))
    }
    const aspect = 4 / 3
    const half = Math.max(my, mx / aspect) * 1.12
    cam.left = -half * aspect; cam.right = half * aspect; cam.top = half; cam.bottom = -half
    cam.updateProjectionMatrix()
    const url = this.stage.snapshot(scene, cam, 208, 156).toDataURL()
    group.traverse(o => { if (o instanceof Mesh) o.geometry.dispose() })
    return url
  }

  /** The level bar, the Decorate button and the ghosts' badges, every frame. */
  private updateProgress(state: FloorState, dt: number) {
    const ui = this.progress
    if (!ui) return
    ui.visible = this.root.visible
    const lp = levelProgress(this.earned(state))
    ui.setLevel(lp.level, lp.next.name, lp.have, lp.need)
    this.barT -= dt
    if (this.barT <= 0) {
      this.barT = 0.5
      const hud = document.querySelector('.gs-goal:not([hidden])') ?? document.querySelector('.gs-hud-left')
      const r = hud?.getBoundingClientRect()
      if (r && r.height) ui.place(r.bottom + 8, r.left)
    }
    const inTreatment = !!state.players.find(p => p.id === this.playerId)?.station
    if (state.phase !== 'prep' && this.decorating) { this.decorating = false; if (this.isoKey) this.closeStyles() }
    ui.setDecorate(state.phase === 'prep' && !inTreatment && this.inputOn, this.decorating)
    // Badges: over their ghost, bobbing gently; bright when there is money for it.
    for (const g of this.buyGhosts) {
      g.ph += dt
      const b = g.badge as Container & { draw?: (ok: boolean) => void; ok?: boolean }
      const ok = this.buyCheck(state, g.item.id).ok
      if (ok !== b.ok) { b.ok = ok; b.draw?.(ok) }
      b.visible = this.root.visible && !this.decorating
      this.pin(b, g.anchor, 0, (ok ? Math.sin(g.ph * 3) * 3 : 0) - 18)
      // Never lost off the edge of the screen (or under the HUD).
      b.x = Math.max(60, Math.min(this.view.w - 60, b.x))
      b.y = Math.max(this.view.h > this.view.w * 1.2 ? 130 : 90, Math.min(this.view.h - 80, b.y))
      b.scale.set(this.ui * (ok ? 1 + Math.max(0, Math.sin(g.ph * 3)) * 0.04 : 0.92))
    }
    if (this.ghostGroup) this.ghostGroup.visible = !this.decorating
    GHOST_MAT.emissiveIntensity = 0.1 + Math.sin(this.t * 2.2) * 0.06
    GHOST_MAT.opacity = 0.52 + Math.sin(this.t * 2.2) * 0.07
    // The squash and stretch of a piece that just changed its look.
    if (this.popAt && this.isoPivot) {
      this.popAt.t += dt
      const k = this.popAt.t / 0.5
      const s = k >= 1 ? 1 : 1 + Math.sin(k * Math.PI * 2.5) * 0.18 * (1 - k)
      this.isoPivot.scale.set(1 / Math.sqrt(s), s, 1 / Math.sqrt(s))
      if (k >= 1) this.popAt = null
    }
  }
  private barT = 0

  /** A salon level up: confetti, a chime, and a look at what just opened. */
  private celebrate(level: number, item: string | undefined) {
    const host = document.getElementById('ui')
    if (host) confetti(host, { x: this.view.w / 2, y: this.view.h * 0.35 }, 90)
    sfx.unlockChime()
    this.float(`Level ${level}!`, _v.set(0, 2.4, ROOM3.d / 2), 0x9c86d9, 30)
    setTimeout(() => {
      if (this.destroyed) return
      const g = this.buyGhosts.find(x => x.item.id === item) ?? this.buyGhosts[this.buyGhosts.length - 1]
      if (g) this.rig.focus(g.anchor.x, g.anchor.z, 2.4)
    }, 700)
  }

  // ------------------------------------------------------------------ input

  private onKeyDown = (e: KeyboardEvent) => {
    if (!this.inputOn || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
    const k = e.key.toLowerCase()
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) { this.keys.add(k); this.path = []; this.goal = null; this.claim(null); e.preventDefault() }
    if ((k === 'f' || k === 'e' || k === 'enter' || k === ' ') && !e.repeat) { if (this.target) { e.preventDefault(); this.interact() } }
  }
  private onKeyUp = (e: KeyboardEvent) => { this.keys.delete(e.key.toLowerCase()) }
  private onBlur = () => this.keys.clear()

  /** What is under a screen point: a station, the desk, the cat, or a spot on the floor (sim units). */
  private pick(sx: number, sy: number): { target: Target | null; floor: Pt | null; slot: number; ghost: BuyGhost | null; piece: StylePiece | null } {
    const ndc = new Vector2((sx / this.view.w) * 2 - 1, -(sy / this.view.h) * 2 + 1)
    this.raycaster.setFromCamera(ndc, this.rig.camera)
    const ray = this.raycaster.ray
    let best: { t: Target; d: number } | null = null
    const consider = (t: Target, d: number | null) => { if (d !== null && (!best || d < best.d)) best = { t, d } }
    const cat = this.catWorld()
    const catHit = ray.distanceSqToPoint(_v.set(cat.x, cat.y + 0.2, cat.z)) < 0.35 * 0.35
    if (catHit) consider({ kind: 'cat', x: this.cat.x, y: this.cat.y }, ray.origin.distanceTo(_v))
    const dh = ray.intersectBox(this.deskBox, _v2)
    if (dh) consider({ kind: 'computer', ...COMPUTER_SPOT }, ray.origin.distanceTo(dh))
    for (const st of this.state?.stations ?? []) {
      if (st.slot < 0) continue
      const view = this.stations.get(st.id)
      const hit = view && ray.intersectBox(view.box, _v2)
      if (hit) consider({ kind: 'station', id: st.id, ...stationSpot(st.slot) }, ray.origin.distanceTo(hit))
    }
    // The floor.
    let floor: Pt | null = null
    if (Math.abs(ray.direction.y) > 1e-4) {
      const t = -ray.origin.y / ray.direction.y
      if (t > 0) { const p = ray.at(t, _v2); floor = toSim(p.x, p.z) }
    }
    let slot = -1
    if (floor) for (const g of this.ghosts) { const at = SLOTS[g.slot]; if (Math.abs(floor.x - at.x) < 80 && Math.abs(floor.y - at.y) < 60) slot = g.slot }
    // The grey ghosts, and (while decorating) the pieces that can change their look: the nearest hit.
    const nearest = <T extends { box: Box3 }>(list: T[]) => { let hit: T | null = null, hd = Infinity; for (const g of list) { if (g.box.isEmpty()) continue; const p = ray.intersectBox(g.box, _v2); if (p) { const d = ray.origin.distanceTo(p); if (d < hd) { hd = d; hit = g } } } return hit }
    return { target: (best as { t: Target } | null)?.t ?? null, floor, slot, ghost: nearest(this.buyGhosts), piece: this.decorating ? nearest(this.stylePieces) : null }
  }

  private onTap(e: FederatedPointerEvent) {
    if (!this.inputOn || this.demo || !this.state) return
    sfx.unlock()
    const hit = this.pick(e.global.x, e.global.y)
    if (this.decorating) { if (hit.piece) { sfx.click(); this.openStyles(hit.piece.key) } return }
    if (this.progress?.buying) this.progress.hideBuy()
    if (hit.ghost && !hit.target) { this.openBuy(hit.ghost.item); return }
    const unplaced = this.state.stations.find(s => s.slot < 0)
    if (hit.slot >= 0 && unplaced && this.ghosts.some(g => g.slot === hit.slot)) { sfx.click(); this.hooks.onAction({ a: 'place', station: unplaced.id, slot: hit.slot }); return }
    if (hit.target) { this.goTo(hit.target); return }
    if (!hit.floor) return
    this.goal = null
    this.claim(null)
    this.walkTo(hit.floor)
  }

  private onHover(e: FederatedPointerEvent) {
    if (!this.inputOn || !this.state || e.pointerType !== 'mouse') { this.hover = null; return }
    const hit = this.pick(e.global.x, e.global.y)
    this.hover = hit.target
    this.root.cursor = hit.target || hit.slot >= 0 ? 'pointer' : 'default'
  }

  private claimed: string | null = null
  private claim(station: string | null) {
    if (station === this.claimed) return
    this.claimed = station
    this.hooks.onAction({ a: 'claim', station })
  }

  private walkTo(p: Pt) {
    const x = Math.max(24, Math.min(FLOOR_W - 24, p.x)), y = Math.max(186, Math.min(FLOOR_H - 22, p.y))
    this.path = findPath(this.grid, this.me, { x, y })
    this.markerT = 1
    const m = toWorld(x, y)
    this.marker.position.set(m.x, 0.02, m.z)
  }

  private goTo(t: Target) {
    const here = Math.hypot(this.me.x - t.x, this.me.y - t.y)
    this.goal = t
    this.claim(t.kind === 'station' ? t.id : null)
    if (here < 30) { this.goal = null; this.interactWith(t); return }
    this.walkTo(t.kind === 'cat' ? { x: t.x + (this.me.x < t.x ? -40 : 40), y: t.y + 6 } : t)
  }

  /** Act on whatever the prompt shows (F, Enter, or a tap on the prompt). */
  interact() { if (this.target) this.interactWith(this.target) }

  private interactWith(t: Target) {
    if (!this.state) return
    sfx.unlock()
    if (t.kind === 'computer') { sfx.click(); const tab = this.nextTab; this.nextTab = undefined; this.hooks.onOpenComputer(tab); return }
    if (t.kind === 'cat') {
      this.cat.pet()
      purr()
      const p = this.catWorld()
      this.burst(_v.set(p.x, p.y + 0.45, p.z), 'heart', 6)
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
    // Pixi applies a window resize on its next frame, after the game's resize call: follow the real size.
    const sw = this.app.screen.width, sh = this.app.screen.height
    if (sw !== this.view.w || sh !== this.view.h) this.resize(sw, sh)
    const state = this.state
    this.moveLocal(dt)
    this.cat.update(dt)
    const cw = this.catWorld()
    this.cat.root.position.set(cw.x, cw.y, cw.z)
    this.cat.root.rotation.y = this.cat.yaw
    let blobs = 0
    const blob = (x: number, z: number, r: number, y = 0.012) => { if (blobs < 40) { this.blobs.setMatrixAt(blobs++, new Matrix4().compose(_v.set(x, y, z), QI, _v2.set(r, 1, r))) } }
    if (this.cat.up < 0.05) blob(cw.x, cw.z, 0.5)
    // Passers-by walk the pavement end to end, then rest a while out of sight.
    const px = (STREET.paveIn + STREET.paveOut) / 2
    for (const p of this.passers) {
      if (p.wait > 0) { p.wait -= dt; if (p.wait <= 0) { p.dir = Math.random() < 0.5 ? 1 : -1; p.z = p.dir > 0 ? -9 : RD + 9 } else { p.person.root.visible = false; continue } }
      p.z += p.dir * p.speed * dt
      if (p.z < -9.5 || p.z > RD + 9.5) { p.wait = 8 + Math.random() * 16; continue }
      const person = p.person
      person.root.visible = true
      person.pose = 'walk'
      person.speed = p.speed
      person.root.position.set(px + (p.dir > 0 ? 0.35 : -0.35), 0, p.z)
      person.root.rotation.y = p.dir > 0 ? 0 : Math.PI
      person.update(dt)
      blob(person.root.position.x, p.z, 0.7)
    }
    if (state) {
      this.updateCustomers(state, dt, blob)
      this.updatePlayers(state, dt, blob)
      this.updateStaff(state, dt, blob)
    }
    this.blobs.count = blobs
    this.blobs.instanceMatrix.needsUpdate = true
    // Spare slots glow a little when a new station is affordable today.
    for (const g of this.ghosts) { g.ph += dt; const k = 1 + Math.sin(g.ph * 3) * 0.035; g.mesh.scale.set(k, k, 1); (g.mesh.material as MeshBasicMaterial).opacity = 0.75 + 0.25 * Math.sin(g.ph * 3) }
    this.updateDoor(dt)
    this.updateAmbient(dt)
    // The camera follows the local player on small screens.
    const follow = this.demo ? null : toWorld(this.me.x, this.me.y)
    this.rig.update(dt, follow)
    // Only the far lawn fades into the pink: the fog starts past the room, however far the long lens stands.
    const fog = this.scene.fog as Fog
    const cd = this.rig.camera.position.distanceTo(this.rig.focusPoint)
    fog.near = cd + 12
    fog.far = cd + 60
    // Overlays, now that the camera has moved.
    if (state) {
      this.placeCustomerUi(state, dt)
      this.placePeopleUi(state)
      this.updateStations(state)
      this.updatePrompt(state, dt)
      this.updateProgress(state, dt)
    }
    if (this.ghostLabel && this.ghosts.length) { const at = SLOTS[this.ghosts[0].slot]; const p = toWorld(at.x, at.y); this.pin(this.ghostLabel, _v.set(p.x, 1.2, p.z), 0, Math.sin(this.t * 2.2) * 3) }
    this.fx.update(dt)
    this.updateFloats(dt)
    if (this.markerT > 0) {
      this.markerT = Math.max(0, this.markerT - dt * 1.6)
      const k = 1 - this.markerT
      this.marker.visible = true
      this.marker.scale.setScalar(0.35 + k * 0.45)
      ;(this.marker.material as MeshBasicMaterial).opacity = this.markerT
    } else this.marker.visible = false
    // Draw: the 3D first (Pixi's overlays follow this frame), or nothing while a close-up is open.
    if (this.root.visible) this.stage.render(this.scene, this.rig.camera)
    else this.stage.idle()
  }

  private catWorld() {
    const p = toWorld(this.cat.x, this.cat.y)
    return { x: p.x, y: this.cat.up, z: p.z }
  }

  private moveLocal(dt: number) {
    if (this.demo || !this.state) return
    const inTreatment = this.state.players.find(p => p.id === this.playerId)?.station
    let dx = 0, dy = 0
    if (this.inputOn && !inTreatment) {
      // Keys move along the screen: up is into the room, as the camera sees it.
      if (this.keys.has('a') || this.keys.has('arrowleft')) dx -= 1
      if (this.keys.has('d') || this.keys.has('arrowright')) dx += 1
      if (this.keys.has('w') || this.keys.has('arrowup')) dy -= 1
      if (this.keys.has('s') || this.keys.has('arrowdown')) dy += 1
    }
    const speed = 230
    let moving = false
    if (dx || dy) {
      // Turn the screen direction into the room's axes (the camera is turned by its yaw).
      const c = Math.cos(this.rig.yaw), s = Math.sin(this.rig.yaw)
      const wx = dx * c + dy * s, wz = -dx * s + dy * c
      const l = Math.hypot(wx, wz)
      const mx = (wx / l) * speed * dt, my = ((wz / l) * speed * dt) / 1.12
      const nx = this.me.x + mx, ny = this.me.y + my
      if (this.open(nx, this.me.y)) { this.me.x = nx; moving = true }
      if (this.open(this.me.x, ny)) { this.me.y = ny; moving = true }
      if (Math.abs(mx) > 0.01) this.me.facing = mx < 0 ? -1 : 1
      this.meYaw = yawFor(mx, my)
    } else if (this.path.length && !inTreatment) {
      const next = this.path[0]
      const ddx = next.x - this.me.x, ddy = next.y - this.me.y, d = Math.hypot(ddx, ddy)
      const step = speed * dt
      if (Math.abs(ddx) > 2) this.me.facing = ddx < 0 ? -1 : 1
      if (d > 1) this.meYaw = yawFor(ddx, ddy)
      if (d <= step) { this.me.x = next.x; this.me.y = next.y; this.path.shift() } else { this.me.x += (ddx / d) * step; this.me.y += (ddy / d) * step }
      moving = true
      if (!this.path.length && this.goal) { const g = this.goal; this.goal = null; this.interactWith(g) }
    }
    this.me.moving = moving
    this.sendTimer -= dt
    const key = `${Math.round(this.me.x)},${Math.round(this.me.y)},${this.me.facing},${moving ? 1 : 0}`
    if (this.sendTimer <= 0 && key !== this.lastSent) {
      this.sendTimer = 0.1
      this.lastSent = key
      this.hooks.onAction({ a: 'pos', x: Math.round(this.me.x), y: Math.round(this.me.y), f: this.me.facing, m: moving } as Action)
    }
  }

  private open(x: number, y: number) {
    if (x < 22 || x > FLOOR_W - 22 || y < 184 || y > FLOOR_H - 18) return false
    return !this.grid[Math.floor(y / CELL) * COLS + Math.floor(x / CELL)]
  }

  /** Turn smoothly towards an angle. */
  private static turn(cur: number, to: number, dt: number, rate = 10) { return cur + turnTo(cur, to) * Math.min(1, dt * rate) }

  private updateCustomers(state: FloorState, dt: number, blob: (x: number, z: number, r: number) => void) {
    const k = Math.min(1, dt * 10)
    for (const c of state.customers) {
      const v = this.customers.get(c.id)
      if (!v) continue
      const px = v.x, py = v.y
      v.x += (c.x - v.x) * k
      v.y += (c.y - v.y) * k
      const dxs = v.x - px, dys = v.y - py
      const speed = Math.hypot(dxs, dys) / Math.max(dt, 1e-3)
      const moving = speed > 12
      const p = v.person
      const atStation = (c.state === 'seated' || c.state === 'treating') && !moving
      const onSofa = c.state === 'waiting' && !moving && c.seat !== null && c.seat < SOFA_SEATS.length
      const st = atStation && c.station ? this.stations.get(c.station) : null
      const seat: Node3 | null = st ? st.nodes.seat : onSofa ? this.sofaSeats[c.seat!] ?? null : null
      p.pose = moving ? 'walk' : seat ? 'sit' : 'stand'
      p.seat = onSofa ? 'sofa' : st?.nodes.seatKind ?? 'stool'
      if (seat) p.seatY = seat.y
      p.speed = (speed / 75) * 1.05
      v.seatK += ((seat ? 1 : 0) - v.seatK) * Math.min(1, dt * 6)
      if (moving && speed > 20) v.yaw = FloorView3D.turn(v.yaw, yawFor(dxs, dys), dt)
      else if (seat) v.yaw = FloorView3D.turn(v.yaw, seat.yaw, dt, 8)
      const wp = toWorld(v.x, v.y)
      const x = seat ? wp.x + (seat.x - wp.x) * v.seatK : wp.x
      const z = seat ? wp.z + (seat.z - wp.z) * v.seatK : wp.z
      p.root.position.set(x, 0, z)
      p.root.rotation.y = v.yaw
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
      p.opacity = v.alpha
      p.update(dt)
      p.headTop(v.head)
      if (v.alpha > 0.5) blob(x, z, seat ? 0.9 : 0.7)
      // Sparkles while being treated.
      if (c.state === 'treating' && Math.random() < dt * 3) this.burst(_v.set(v.head.x + (Math.random() - 0.5) * 0.4, v.head.y - 0.2, v.head.z), 'sparkle', 1)
    }
  }

  private placeCustomerUi(state: FloorState, dt: number) {
    for (const c of state.customers) {
      const v = this.customers.get(c.id)
      if (!v) continue
      const wantsBubble = (c.state === 'waiting' || c.state === 'seated' || c.state === 'toStation') && v.alpha > 0.9
      const target = wantsBubble ? 1 : 0
      const cur = v.bubble.scale.x / this.ui
      const next = cur + (target - cur) * Math.min(1, dt * 9)
      const sc = target ? easeOutBack(Math.min(1, next)) * 0.9 + next * 0.1 : next
      v.bubble.visible = next > 0.02
      this.pin(v.bubble, _v.copy(v.head).setY(v.head.y + 0.12), 2, -22 + Math.sin(this.t * 2.4 + c.id) * 2.5)
      v.bubble.scale.set(sc * this.ui)
      if (v.bubble.visible) {
        const mood = c.mood
        const col = mood > 0.72 ? 0x6fd3ad : mood > 0.45 ? 0xf2c76b : 0xf08aa8
        v.ring.clear().moveTo(0, -18).arc(0, -2, 16, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.05, mood)).stroke({ width: 3, color: col, cap: 'round' })
      }
      const st = c.station ? state.stations.find(x => x.id === c.station) : null
      const moving = v.person.pose === 'walk'
      const unserved = (c.state === 'waiting' || (c.state === 'seated' && !!st && st.lead === null)) && !moving
      v.waitT = unserved ? v.waitT + dt : 0
      v.dots.visible = v.bubble.visible && v.waitT > 4
      if (v.dots.visible) {
        v.dots.position.set(v.bubble.x + 30 * this.ui, v.bubble.y - 14 * this.ui)
        v.dots.scale.set(this.ui)
        v.dots.alpha = Math.min(1, (v.waitT - 4) * 2)
        v.dots.children.slice(1).forEach((d, k) => { d.y = Math.sin(this.t * 4 - k * 0.8) * 2; d.alpha = 0.45 + 0.55 * Math.max(0, Math.sin(this.t * 4 - k * 0.8)) })
      }
      // A story regular says their line once they sit down (not on the title screen).
      const persona = personaFor(c.plan, { rating: state.stats.ratingBefore, bias: state.ext?.today.bias })
      if (!v.said && !this.demo && (c.state === 'seated' || c.state === 'treating') && persona.story && !moving) {
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
        this.pin(v.say, _v.copy(v.head).setY(v.head.y + 0.12), 8, -52)
        v.say.alpha = Math.min(1, v.sayT)
        v.say.scale.set((Math.min(1, (7 - v.sayT) * 5) * 0.2 + 0.8) * this.ui)
        if (v.sayT <= 0) { v.say.destroy(); v.say = null }
      }
    }
  }

  private updatePlayers(state: FloorState, dt: number, blob: (x: number, z: number, r: number) => void) {
    for (const p of state.players) {
      const v = this.players.get(p.id)
      if (!v) continue
      const mine = p.id === this.playerId
      const st = p.station ? state.stations.find(s => s.id === p.station) : null
      let tx = mine ? this.me.x : p.x, ty = mine ? this.me.y : p.y
      const helperIdx = st ? st.helpers.indexOf(p.id) : -1
      if (st && !mine) { const spots = this.asideSpots(st.slot); const spot = helperIdx < 0 ? stationSpot(st.slot) : spots[helperIdx % spots.length]; tx = spot.x; ty = spot.y }
      const px = v.x, py = v.y
      if (mine) { v.x = tx; v.y = ty } else { const k = Math.min(1, dt * 12); v.x += (tx - v.x) * k; v.y += (ty - v.y) * k }
      const dxs = v.x - px, dys = v.y - py
      const speed = Math.hypot(dxs, dys) / Math.max(dt, 1e-3)
      const moving = mine ? this.me.moving : speed > 14 || p.moving
      const person = v.person
      person.pose = st ? 'work' : moving ? 'walk' : 'stand'
      person.speed = speed / 75
      const job = st ? state.customers.find(x => x.id === st.customer)?.plan.treatment : undefined
      person.tool = toolFor(job)
      person.setExpr(st ? 'happy' : 'smile')
      // The lead works at the station's work spot; a helper stands beside, facing the customer.
      const sv = st ? this.stations.get(st.id) : null
      const work = sv && helperIdx < 0 ? sv.nodes.work : null
      v.workK += ((work ? 1 : 0) - v.workK) * Math.min(1, dt * 6)
      const wp = toWorld(v.x, v.y)
      const x = work ? wp.x + (work.x - wp.x) * v.workK : wp.x, z = work ? wp.z + (work.z - wp.z) * v.workK : wp.z
      if (sv) v.yaw = FloorView3D.turn(v.yaw, work ? work.yaw : Math.atan2(sv.nodes.seat.x - x, sv.nodes.seat.z - z), dt, 8)
      else if (mine && moving) v.yaw = FloorView3D.turn(v.yaw, this.meYaw, dt, 12)
      // At the computer: face its screen.
      else if (mine && Math.hypot(v.x - COMPUTER_SPOT.x, v.y - COMPUTER_SPOT.y) < 30) v.yaw = FloorView3D.turn(v.yaw, 0, dt, 8)
      else if (moving && speed > 20) v.yaw = FloorView3D.turn(v.yaw, yawFor(dxs, dys), dt)
      person.root.position.set(x, 0, z)
      person.root.rotation.y = v.yaw
      person.update(dt)
      person.headTop(v.head)
      blob(x, z, 0.7)
    }
  }

  private asideSpots(slot: number): Pt[] {
    const spot = stationSpot(slot)
    const out: Pt[] = []
    for (const [dx, dy] of [[-44, 52], [-70, 4], [0, -70], [30, 60]]) {
      const p = { x: spot.x + dx, y: spot.y + dy }
      if (p.x < 24 || p.x > FLOOR_W - 24 || p.y < 186 || p.y > FLOOR_H - 22) continue
      if (!this.grid[Math.floor(p.y / CELL) * COLS + Math.floor(p.x / CELL)]) out.push(p)
    }
    if (!out.length) out.push({ x: spot.x - 34, y: spot.y + 18 })
    return out
  }

  private updateStaff(state: FloorState, dt: number, blob: (x: number, z: number, r: number) => void) {
    const staff = state.ext?.staff ?? []
    staff.forEach((s: StaffMember, i) => {
      const v = this.staff.get(s.id)
      if (!v) return
      const where = s.task?.station ?? s.station
      const st = where ? state.stations.find(x => x.id === where && x.slot >= 0) : null
      const onBreak = s.breakLeft > 0
      const aside = st ? this.asideSpots(st.slot) : []
      const goal: Pt = onBreak || !st ? { x: 356 + i * 34, y: 336 + (i % 2) * 12 } : s.task ? stationSpot(st.slot) : aside[st.helpers.length % aside.length]
      if (Math.hypot(goal.x - v.goal.x, goal.y - v.goal.y) > 2) { v.goal = goal; v.path = findPath(this.grid, v, goal) }
      let moving = false
      let dirYaw = v.yaw
      if (v.path.length) {
        const next = v.path[0]
        const dx = next.x - v.x, dy = next.y - v.y, d = Math.hypot(dx, dy), step = 150 * dt
        if (d > 1) dirYaw = yawFor(dx, dy)
        if (d <= step) { v.x = next.x; v.y = next.y; v.path.shift() } else { v.x += (dx / d) * step; v.y += (dy / d) * step }
        moving = true
      }
      const working = !!s.task && !moving && !!st
      v.person.pose = moving ? 'walk' : s.task ? 'work' : 'stand'
      v.person.speed = 2
      const job = st ? state.customers.find(x => x.id === st.customer)?.plan.treatment : undefined
      v.person.tool = toolFor(job)
      v.person.setExpr(onBreak ? 'sleepy' : s.task ? 'happy' : 'smile')
      const sv = st ? this.stations.get(st.id) : null
      const work = working && sv ? sv.nodes.work : null
      v.workK += ((work ? 1 : 0) - v.workK) * Math.min(1, dt * 6)
      const wp = toWorld(v.x, v.y)
      const x = work ? wp.x + (work.x - wp.x) * v.workK : wp.x, z = work ? wp.z + (work.z - wp.z) * v.workK : wp.z
      if (moving) v.yaw = FloorView3D.turn(v.yaw, dirYaw, dt)
      else if (work) v.yaw = FloorView3D.turn(v.yaw, work.yaw, dt, 8)
      else if (sv && !onBreak) v.yaw = FloorView3D.turn(v.yaw, Math.atan2(sv.nodes.seat.x - x, sv.nodes.seat.z - z), dt, 6)
      else v.yaw = FloorView3D.turn(v.yaw, 0.4, dt, 3)
      v.person.root.position.set(x, 0, z)
      v.person.root.rotation.y = v.yaw
      v.person.update(dt)
      v.person.headTop(v.head)
      blob(x, z, 0.7)
      v.tea.visible = onBreak
      v.tool.root.visible = working
      if (working && st && sv) {
        const c = state.customers.find(x => x.id === st.customer)
        v.tool.icon.texture = treatmentIcon(c?.plan.treatment ?? 'facial')
        v.puff -= dt
        if (v.puff <= 0 && c) {
          v.puff = 0.35 + Math.random() * 0.3
          const nails = c.plan.treatment === 'nails', feet = c.plan.treatment === 'feet'
          const n = sv.nodes
          const at = feet && n.feet ? _v.set(n.feet.x, 0.45, n.feet.z) : nails ? _v.set(n.seat.x - 0.6, 0.9, n.seat.z) : _v.set(n.seat.x - 0.55, 1.05, n.seat.z)
          at.x += (Math.random() - 0.5) * 0.3
          at.z += (Math.random() - 0.5) * 0.2
          const sp = this.project(at)
          if (!sp) return
          if (nails) this.burst(at, 'sparkle', 1)
          else if (feet) this.fx.spawn({ texture: bits.bubble(), x: sp.x, y: sp.y, vx: (Math.random() - 0.5) * 10, vy: -16 - Math.random() * 12, life: 1, scale: 0.05 * this.ui, scaleEnd: 0.12 * this.ui, alpha: 0.9, alphaEnd: 0 })
          else this.fx.spawn({ texture: bits.glow(), x: sp.x, y: sp.y, vx: (Math.random() - 0.5) * 16, vy: -18 - Math.random() * 14, life: 1.1, scale: 0.12 * this.ui, scaleEnd: 0.32 * this.ui, alpha: 0.85, alphaEnd: 0, tint: 0xffffff })
        }
      }
    })
  }

  /** Tags, tea and tool bubbles over players and staff. */
  private placePeopleUi(state: FloorState) {
    for (const p of state.players) {
      const v = this.players.get(p.id)
      if (v) this.pin(v.tag, _v.copy(v.head), 0, -4)
    }
    for (const s of state.ext?.staff ?? []) {
      const v = this.staff.get(s.id)
      if (!v) continue
      this.pin(v.tag, _v.copy(v.head), 0, -4)
      if (v.tea.visible) this.pin(v.tea, _v.copy(v.head).setY(v.head.y - 0.55), 26, Math.sin(this.t * 2) * 2)
      if (v.tool.root.visible) { this.pin(v.tool.root, _v.copy(v.head), -38, -18 + Math.sin(this.t * 2.6) * 2.5); v.tool.root.rotation = Math.sin(this.t * 3) * 0.06 }
    }
  }

  private updateStations(state: FloorState) {
    for (const st of state.stations) {
      const info = this.stations.get(st.id)
      if (!info || st.slot < 0) continue
      const c = st.customer !== null ? state.customers.find(cu => cu.id === st.customer) : null
      const waitingForYou = !!c && c.state === 'seated' && st.lead === null
      const gm = info.glow.material as MeshBasicMaterial
      gm.opacity = waitingForYou ? 0.75 + Math.sin(this.t * 3.2) * 0.25 : Math.max(0, gm.opacity - 0.05)
      info.glow.visible = gm.opacity > 0.01
      // Progress ring while someone works here.
      info.ring.clear()
      const working = !!c && c.state === 'treating'
      if (working) {
        const staffLed = st.lead !== null && st.lead >= STAFF_ID_BASE
        const done = staffLed ? st.progress : Math.min(1, (st.step + st.progress) / Math.max(1, st.steps))
        info.ring.circle(0, 0, 13).fill({ color: 0xffffff, alpha: 0.95 }).stroke({ width: 1.2, color: 0xe9c2d0 })
        info.ring.moveTo(0, -13).arc(0, 0, 13, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.02, done)).stroke({ width: 4, color: staffLed ? 0x4fbf98 : PLAYER_COLORS[(st.lead ?? 0) % 4], cap: 'round' })
        info.ring.circle(0, 0, 4).fill({ color: 0xf5b83d })
        this.pin(info.ring, _v.set(info.center.x + 0.3, 2.05, info.center.z), 0, 0)
      }
      let label = ''
      if (c && c.state === 'seated' && st.lead === null) {
        const s = state.ext?.staff.find(m => m.station === st.id && !m.task && m.breakLeft <= 0)
        const left = staffCountdown(state, st.id)
        if (s && left !== null) label = `${s.name} takes over in ${Math.ceil(left)}s`
      }
      info.text.text = label
      const bg = info.label.children[0] as Graphics
      bg.clear()
      if (label) {
        const w = info.text.width + 18
        bg.roundRect(-w / 2, -11, w, 22, 11).fill({ color: 0xffffff, alpha: 0.94 }).stroke({ width: 1.2, color: 0xbfeadb })
      }
      info.label.visible = !!label && !this.demo
      if (info.label.visible) this.pin(info.label, _v.set(info.center.x, 0, info.center.z + 0.95), 0, 0)
    }
  }

  private updatePrompt(state: FloorState, dt: number) {
    const pick: { best: Target | null; label: string; d: number } = { best: null, label: '', d: 78 }
    if (!this.demo && this.inputOn && !state.players.find(p => p.id === this.playerId)?.station) {
      const consider = (t: Target, text: string) => { const d = Math.hypot(this.me.x - t.x, this.me.y - t.y); if (d < pick.d) { pick.d = d; pick.best = t; pick.label = text } }
      consider({ kind: 'computer', ...COMPUTER_SPOT }, 'Salon computer')
      consider({ kind: 'cat', x: this.cat.x, y: this.cat.y }, `Pet ${state.ext?.catName ?? 'the cat'}`)
      for (const st of state.stations) {
        if (st.slot < 0) continue
        const c = st.customer !== null ? state.customers.find(cu => cu.id === st.customer) : null
        if (!c || (c.state !== 'seated' && c.state !== 'treating')) continue
        if (st.lead !== null && st.lead >= STAFF_ID_BASE) continue
        consider({ kind: 'station', id: st.id, ...stationSpot(st.slot) }, st.lead === null ? 'Start treatment' : 'Help (four hands)')
      }
    }
    const best = pick.best
    const prev = this.target
    const changed = best?.kind !== prev?.kind || (best?.kind === 'station' && prev?.kind === 'station' && best.id !== prev.id)
    this.target = best
    // The highlight under what the prompt (or the mouse) points at.
    this.placeHighlight(best ?? this.hover, !!best)
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
    const anchor = best.kind === 'station' ? _v.copy(this.stations.get(best.id)?.center ?? _v2.set(0, 0, 0)).setY(2.55) : best.kind === 'computer' ? _v.set(this.deskTop.x, 2.25, this.deskTop.z) : (() => { const p = this.catWorld(); return _v.set(p.x, p.y + 0.85, p.z) })()
    this.pin(this.prompt, anchor, 0, Math.sin(this.t * 3) * 2)
    this.prompt.scale.set(easeOutBack(this.promptPop) * Math.max(0.85, this.ui))
    this.prompt.visible = true
    this.promptKey.text = matchMedia('(pointer: coarse)').matches ? '→' : 'F'
  }

  private placeHighlight(t: Target | null, strong: boolean) {
    const h = this.highlight
    const m = h.material as MeshBasicMaterial
    if (!t) { m.opacity = Math.max(0, m.opacity - 0.08); h.visible = m.opacity > 0.01; return }
    if (t.kind === 'station') { const c = this.stations.get(t.id)?.center; if (!c) return; h.position.set(c.x, 0.016, c.z); h.scale.set(2.7, 1, 1.9) }
    else if (t.kind === 'computer') { h.position.set(this.deskTop.x, 0.016, this.deskTop.z - 0.2); h.scale.set(3.1, 1, 1.9) }
    else { const p = this.catWorld(); h.position.set(p.x, p.y + 0.016, p.z); h.scale.set(0.8, 1, 0.8) }
    m.color.setHex(PLAYER_COLORS[Math.max(0, this.playerId) % 4])
    const want = strong ? 0.55 + Math.sin(this.t * 4) * 0.12 : 0.35
    m.opacity += (want - m.opacity) * 0.2
    h.visible = true
  }

  private updateDoor(dt: number) {
    let near = false
    const check = (x: number, y: number) => { if (x < 90 && y > 556 - 30 && y < 664 + 30) near = true }
    for (const v of this.customers.values()) check(v.x, v.y)
    for (const v of this.players.values()) check(v.x, v.y)
    this.doorOpen += ((near ? 1 : 0) - this.doorOpen) * Math.min(1, dt * (near ? 7 : 3))
    this.room.door.rotation.y = this.doorOpen * 1.25
    this.bellSwing *= Math.exp(-dt * 2.2)
    this.room.bell.rotation.x = Math.sin(this.t * 14) * 0.5 * this.bellSwing
  }

  private updateAmbient(dt: number) {
    const pos = this.motes.geometry.getAttribute('position') as Float32BufferAttribute
    for (let i = 0; i < pos.count; i++) {
      let y = pos.getY(i) + dt * (0.04 + (i % 5) * 0.01)
      if (y > 2.6) y = 0.5
      pos.setY(i, y)
      pos.setX(i, pos.getX(i) + Math.sin(this.t * 0.6 + i) * dt * 0.05)
    }
    pos.needsUpdate = true
    ;(this.motes.material as PointsMaterial).opacity = 0.35 + 0.15 * Math.sin(this.t * 0.9)
    for (const g of this.glows) (g.s.material as SpriteMaterial).opacity = g.base * (0.8 + 0.2 * Math.sin(this.t * 2.1 + g.ph))
    if (this.twinkle) (this.twinkle.material as PointsMaterial).opacity = 0.42 + 0.18 * Math.sin(this.t * 2.1)
    if (this.neon) (this.neon.material as MeshBasicMaterial).opacity = 0.88 + Math.sin(this.t * 1.7) * 0.08 + (Math.random() < 0.01 ? -0.35 : 0)
    if (this.fish) {
      const m = new Matrix4()
      for (let i = 0; i < 3; i++) {
        const ph = this.t * (0.5 + i * 0.13) + i * 2
        m.compose(_v.set(this.fishAt.x + Math.sin(ph * 0.9) * 0.08, this.fishAt.y - 0.1 + i * 0.09 + Math.sin(ph * 1.7) * 0.02, this.fishAt.z + Math.sin(ph) * 0.36), QI, _v2.set(1, 0.7, 1.5))
        this.fish.setMatrixAt(i, m)
      }
      this.fish.instanceMatrix.needsUpdate = true
    }
    this.room.garden.update(this.t)
    // The key light breathes a touch, like sun through leaves.
    this.key.intensity = 1.9 + Math.sin(this.t * 0.35) * 0.04
  }

  // ------------------------------------------------------------------ overlays and effects

  /** A 3D point on screen (CSS pixels), or null when behind the camera. */
  private project(p: Vector3): { x: number; y: number } | null {
    _v2.copy(p).project(this.rig.camera)
    if (_v2.z > 1) return null
    return { x: (_v2.x * 0.5 + 0.5) * this.view.w, y: (-_v2.y * 0.5 + 0.5) * this.view.h }
  }

  /** Put an overlay at a 3D point, nudged by (dx, dy) screen pixels at the overlay scale. */
  private pin(o: Container, p: Vector3, dx: number, dy: number) {
    const s = this.project(p)
    if (!s) { o.visible = false; return }
    o.position.set(s.x + dx * this.ui, s.y + dy * this.ui)
    if (o.scale.x !== this.ui && o !== this.prompt && !this.customersBubble(o)) o.scale.set(this.ui)
  }

  private customersBubble(o: Container) { for (const v of this.customers.values()) if (v.bubble === o || v.say === o) return true; return false }

  private burst(at: Vector3, kind: 'heart' | 'coin' | 'sparkle', n: number) {
    const s = this.project(at)
    if (!s) return
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2
      const sp = (60 + Math.random() * 90) * this.ui
      this.fx.spawn({
        texture: kind === 'heart' ? bits.heart() : kind === 'coin' ? bits.coin() : bits.sparkle(),
        x: s.x, y: s.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, gravity: (kind === 'coin' ? 260 : 40) * this.ui, drag: 1.4,
        life: 0.9 + Math.random() * 0.5, scale: (kind === 'sparkle' ? 0.18 : 0.26) * this.ui, scaleEnd: (kind === 'sparkle' ? 0.02 : 0.2) * this.ui,
        alpha: 1, alphaEnd: 0, spin: (Math.random() - 0.5) * 4, blend: kind === 'sparkle' ? 'add' : 'normal', tint: kind === 'heart' ? 0xf07aa0 : 0xffffff,
      })
    }
  }

  private float(text: string, at: Vector3, color: number, size: number) {
    const t = new Text({ text, style: { fontFamily: 'Fredoka, Nunito, sans-serif', fontSize: size, fontWeight: '700', fill: color, stroke: { color: 0xffffff, width: 4 } }, resolution: 3 })
    t.anchor.set(0.5)
    this.uiLayer.addChild(t)
    this.floats.push({ t, wx: at.clone(), life: 1.6, age: 0 })
  }

  private updateFloats(dt: number) {
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i]
      f.age += dt
      const s = this.project(f.wx)
      if (s) f.t.position.set(s.x, s.y - f.age * 34 * this.ui)
      f.t.alpha = f.age < 0.15 ? f.age / 0.15 : Math.max(0, 1 - (f.age - f.life * 0.5) / (f.life * 0.5))
      f.t.scale.set((f.age < 0.2 ? easeOutBack(f.age / 0.2) : 1) * this.ui)
      if (f.age >= f.life) { f.t.destroy(); this.floats.splice(i, 1) }
    }
  }

  // ------------------------------------------------------------------ camera

  resize(w: number, h: number) {
    this.view = { w, h }
    this.root.hitArea = { contains: () => true }
    const portrait = h > w * 1.2
    this.rig.frame({ w, h, top: this.demo ? 0 : portrait ? Math.round(h * 0.13) : 62, bottom: this.demo ? 0 : portrait ? 70 : 12, side: this.demo ? 0 : 10 }, this.demo)
    this.rig.update(1, this.demo ? null : toWorld(this.me.x, this.me.y))
    // Overlays keep the size they have on the 2D floor at its usual zoom.
    this.ui = Math.max(0.78, Math.min(1.05, Math.min(w, h) / 760))
  }

  /** Screen position of a floor point (sim units in, CSS pixels out), for DOM overlays. */
  toScreen(x: number, y: number) {
    const p = toWorld(x, y)
    return this.project(_v.set(p.x, 0, p.z)) ?? { x: -9999, y: -9999 }
  }

  /** Draw calls and triangles of the last 3D frame, for the performance checks. */
  get stats() { return { calls: this.stage.lastCalls, tris: this.stage.lastTris, quality: this.stage.quality } }

  destroy() {
    this.destroyed = true
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('blur', this.onBlur)
    for (const v of this.customers.values()) v.person.destroy()
    for (const v of this.players.values()) v.person.destroy()
    for (const v of this.staff.values()) v.person.destroy()
    this.cat.destroy()
    for (const p of this.passers) p.person.destroy()
    this.clearGhosts()
    this.progress?.destroy()
    if (this.furniture) disposeGroup(this.furniture)
    this.scene.traverse(o => { if (o instanceof Mesh) o.geometry.dispose() })
    this.stage.idle()
    this.root.destroy({ children: true })
  }
}

// ------------------------------------------------------------------ small helpers

const QI = new Quaternion()

const toolFor = (job: string | undefined): Tool3 => (job === 'nails' ? 'file' : job === 'feet' ? 'footBrush' : job ? 'brush' : null)

const css = (c: number) => `#${c.toString(16).padStart(6, '0')}`

const pieceCache = new Map<string, Piece>()
function cachedPiece(key: string, make: () => Piece): Piece { let p = pieceCache.get(key); if (!p) { p = make(); pieceCache.set(key, p) } return p }

let glowT: Texture | null = null
const glowTex = () => (glowT ??= glowTexture())

/** The neon sign: "glow" in a pink tube with a soft halo. */
function neonTexture(): CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 512; c.height = 256
  const ctx = c.getContext('2d')!
  ctx.font = 'italic 700 150px Fredoka, Nunito, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.shadowColor = 'rgba(255,110,170,0.95)'
  ctx.shadowBlur = 40
  ctx.strokeStyle = '#ff8cc0'
  ctx.lineWidth = 12
  ctx.strokeText('glow', 256, 132)
  ctx.shadowBlur = 12
  ctx.strokeStyle = '#ffe3f0'
  ctx.lineWidth = 4
  ctx.strokeText('glow', 256, 132)
  return tex(c)
}
