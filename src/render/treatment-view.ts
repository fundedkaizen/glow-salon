import { Container, Graphics, Matrix, RenderTexture, Sprite, Text, type Application } from 'pixi.js'
import type { Look } from '../core/customers.ts'
import { FACE, HAND, fingerDir, nailOf } from '../core/treatments/anatomy.ts'
import { GRID, CELL } from '../core/treatments/grid.ts'
import { PEEL_FROM, PEEL_TO, TreatmentSession, WET, type Op, type SessionEvent, type SessionSnapshot, type Target, type TreatmentResult } from '../core/treatments/session.ts'
import { POLISH_COLORS, type StepDef, type TreatmentId } from '../core/treatments/types.ts'
import { starsFor } from '../core/reviews.ts'
import { assetsFor, type PartAssets } from '../art/assets.ts'
import { BACKDROP_OFFSET } from '../art/backdrop.ts'
import { bits } from '../art/bits.ts'
import { toolArt } from '../art/tools.ts'
import { PLAYER_COLORS } from '../art/palette.ts'
import { sfx, type LoopName, type LoopVoice } from '../audio/sfx.ts'
import { TreatmentHud } from '../ui/treatment-hud.ts'
import { FoamField } from './foam.ts'
import { Particles, easeInOut, easeOutBack } from './particles.ts'
import { Surface } from './surface.ts'

/**
 * One treatment close-up: the body part (lit skin plus layers), the tool in your hand, the targets, the
 * customer's face reacting, particles and sounds, and a camera that pushes in for detail and pulls back for
 * the before/after reveal. All the rules live in the pure TreatmentSession; this class turns pointer input
 * into ops and the session's events into pictures and sound.
 */
export type TreatmentCustomer = { name: string; look: Look; seed: number; disaster: boolean; wish: number }

export type TreatmentViewOptions = {
  app: Application
  overlay: HTMLElement
  treatment: TreatmentId
  customer: TreatmentCustomer
  tier: number
  startStep: number
  role: 'lead' | 'helper'
  leadName: string
  playerId: number
  mood: number
  ambience: number
  onOps: (ops: Op[]) => void
  onProgress: (step: number, steps: number, progress: number) => void
  onFinish: (result: TreatmentResult, foam: number) => void
  onLeave: () => void
}

type TargetView = { t: Target; root: Container; parts: Sprite[]; flash: number; gone: boolean }

const LOOP_FOR: Record<string, LoopName> = { foam: 'foam', water: 'water', steam: 'steam', fan: 'fan', uv: 'hum', rasp: 'rasp', push: 'scrape', loop: 'scrape', brush: 'brushWet' }
const EXPRESSIONS = { neutral: ['open', 'relaxed', 'neutral'], content: ['closed', 'relaxed', 'smile'], flinch: ['squeeze', 'worried', 'wince'], tickle: ['happy', 'happy', 'o'], beam: ['open', 'happy', 'beam'], worry: ['wide', 'worried', 'neutral'], giggle: ['happy', 'happy', 'smile'] } as const
type Expr = keyof typeof EXPRESSIONS

export class TreatmentView {
  readonly root = new Container()
  readonly session: TreatmentSession
  private world = new Container()
  private photoRoot = new Container()
  private artRoot = new Container()
  private targetsLayer = new Container()
  private featuresLayer = new Container()
  private overFx = new Container()
  private toolLayer = new Container()
  private revealLayer = new Container()
  private surface: Surface
  private assets: PartAssets
  private fx = new Particles()
  private foam: FoamField
  private hud: TreatmentHud
  private tool = new Sprite()
  private partner = new Graphics()
  private lampSprite = new Container()
  private towel: Sprite | null = null
  private uvLamp: Sprite | null = null
  private uvGlow: Sprite | null = null
  private flap = new Graphics()
  private flying: { g: Container; t: number; vx: number; vy: number; spin: number }[] = []
  private hint = new Sprite(bits.ring())
  private targets = new Map<number, TargetView>()
  private features: Record<'eyes' | 'brows' | 'mouth', Record<string, Sprite>> = { eyes: {}, brows: {}, mouth: {} }
  private expr: Expr = 'neutral'
  private exprBase: Expr = 'neutral'
  private exprTimer = 0
  // camera
  private cam = { x: 512, y: 540, zoom: 1, punch: 0, shakeX: 0, shakeY: 0, shake: 0 }
  private camGoal = { x: 512, y: 540, zoom: 1 }
  private fit = 1
  private view = { w: 800, h: 600, top: 90, bottom: 150 }
  // input
  private pointers = new Map<number, { x: number; y: number }>()
  private down = false
  private pos = { x: 512, y: 540 }
  private last = { x: 512, y: 540 }
  private screen = { x: 0, y: 0, lastX: 0, lastY: 0, speed: 0 }
  private hovering = false
  private touched = false
  private grabbing = false
  private toolPos = { x: 512, y: 540, vx: 0 }
  private press = 0
  private outbox: Op[] = []
  private sendTimer = 0
  private progressTimer = 0
  private advanceAt = -1
  private idle = 0
  private loop: LoopVoice | null = null
  private loopLevel = 0
  private flush = 0
  private peelShown = 0
  private peelTension = 0
  private lampTimer = 0
  private myLamp: { x: number; y: number } | null = null
  private beforeRT: RenderTexture | null = null
  private afterRT: RenderTexture | null = null
  private captureIn = 2
  private revealT = -1
  private reveal: { before: Sprite; mask: Graphics; divider: Graphics; labels: Container; div: number; dragging: boolean } | null = null
  private result: TreatmentResult | null = null
  private time = 0
  private destroyed = false
  private onPointer = (e: PointerEvent) => this.pointer(e)
  private onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') this.opts.onLeave() }

  private opts: TreatmentViewOptions
  constructor(opts: TreatmentViewOptions) {
    this.opts = opts
    const { app, treatment, customer } = opts
    this.session = new TreatmentSession({ treatment, seed: customer.seed, disaster: customer.disaster, tier: opts.tier, wish: treatment === 'nails' ? customer.wish : undefined, startStep: opts.startStep })
    const order = this.session.def.layers.map(l => l.id)
    this.assets = assetsFor(treatment, customer.look, customer.seed, order, this.session.profile)
    this.surface = new Surface(app.renderer, this.assets.surface, 0)
    this.foam = new FoamField(this.fx, (x, y) => this.coverage('foam', x, y))

    const backdrop = new Sprite(this.assets.backdrop)
    backdrop.position.set(-BACKDROP_OFFSET, -BACKDROP_OFFSET)
    this.photoRoot.addChild(backdrop, this.artRoot)
    this.artRoot.addChild(this.surface.root, this.targetsLayer, this.foam.root, this.featuresLayer)
    this.world.addChild(this.photoRoot, this.overFx, this.flap, this.fx.root, this.revealLayer, this.toolLayer)
    this.root.addChild(this.world)
    this.hint.anchor.set(0.5)
    this.hint.visible = false
    this.toolLayer.addChild(this.hint, this.partner, this.lampSprite, this.tool)
    this.tool.visible = false
    this.buildLamp()
    this.buildFeatures()
    this.buildTargets()
    for (const [id, grid] of Object.entries(this.session.layers)) this.surface.initFromGrid(id, grid)

    this.hud = new TreatmentHud(opts.overlay, this.session.def, {
      customer: customer.name, wish: treatment === 'nails' ? customer.wish : null, role: opts.role, leadName: opts.leadName,
      actions: {
        skip: () => { if (this.opts.role === 'lead' && !this.session.finished) { sfx.click(); this.local({ k: 'advance', s: this.session.step, skip: true }) } },
        finish: () => { if (this.opts.role === 'lead') { sfx.click(); this.local({ k: 'advance', s: this.session.step }) } },
        leave: () => { sfx.click(); this.opts.onLeave() },
        choose: i => { sfx.click(); this.local({ k: 'choose', s: this.session.step, i }) },
        photo: () => this.savePhoto(),
        done: () => { sfx.click(); if (this.result) this.opts.onFinish(this.result, this.foam.made) },
      },
    })
    // Steps this customer will never need drop off the tray up front.
    this.session.def.steps.forEach((s, i) => {
      const noTargets = s.need === 'targets' && s.targets !== 'patch' && !this.session.targets.some(t => t.kind === s.targets)
      if ((s.need === 'disaster' && !this.session.disaster) || noTargets || this.session.status[i] === 'na') this.hud.hideStep(i)
    })
    this.enterStep(true)
    app.canvas.addEventListener('pointerdown', this.onPointer)
    app.canvas.addEventListener('pointermove', this.onPointer)
    window.addEventListener('pointerup', this.onPointer)
    window.addEventListener('pointercancel', this.onPointer)
    app.canvas.addEventListener('pointerleave', this.onPointer)
    window.addEventListener('keydown', this.onKey)
    sfx.preload(['pop', 'bell', 'sparkle', 'drip', 'suction', 'cloth', 'horsehair', 'hands', 'tapeShort', 'peelSnap', 'paperRip', 'bubbleTiny', 'foamHiss', 'snip', 'glass', 'reveal', 'gel', 'spray'], ['foam', 'water', 'steam', 'fan', 'soak'])
    this.resize(app.screen.width, app.screen.height)
    const c = this.cam
    Object.assign(c, this.camGoal)
    // Debug handle for browser checks.
    ;(window as unknown as { __treatment?: TreatmentView }).__treatment = this
  }

  // ------------------------------------------------------------------ setup

  private buildFeatures() {
    const f = this.assets.features
    if (!f) return
    for (const part of ['brows', 'eyes', 'mouth'] as const) {
      for (const [state, crop] of Object.entries(f[part])) {
        const s = new Sprite(crop.texture)
        s.position.set(crop.x, crop.y)
        s.alpha = 0
        this.featuresLayer.addChild(s)
        this.features[part][state] = s
      }
    }
    this.setExpr('neutral', true)
  }

  private buildTargets() {
    for (const t of this.session.targets) this.addTarget(t)
  }

  private addTarget(t: Target) {
    if (this.targets.has(t.id)) return
    const root = new Container()
    root.position.set(t.x, t.y)
    const parts: Sprite[] = []
    const sprite = (tex: Sprite['texture'], scale: number, anchorY = 0.5) => { const s = new Sprite(tex); s.anchor.set(0.5, anchorY); s.scale.set(scale); root.addChild(s); parts.push(s); return s }
    if (t.kind === 'whitehead') {
      const b = sprite(bits.whiteheadBase(), 0.5 * t.size)
      const head = sprite(bits.whiteheadHead(), 0.34 * t.size)
      // Deep ones sit under the skin: a bigger, redder bump with no head yet.
      if (t.stage === 2) { b.scale.set(0.62 * t.size); b.tint = 0xffd0d0; head.visible = false }
    }
    else if (t.kind === 'blackhead') { sprite(bits.blackhead(), 0.42 * t.size); const plug = sprite(bits.plug(), 0.4 * t.size, 0.1); plug.visible = false }
    else if (t.kind === 'drop' || t.kind === 'patch') { const r = sprite(bits.ring(), t.kind === 'drop' ? 0.9 : 0.7); if (t.kind === 'patch') r.tint = 0xf49ac0; r.visible = false }
    else if (t.kind === 'tip') {
      const f = HAND.fingers[t.n ?? 0]
      const tip = this.assets.tips?.[t.n ?? 0]
      const nl = nailOf(f)
      root.position.set(nl.tip.x, nl.tip.y)
      if (tip) {
        const s = new Sprite(tip.texture)
        s.anchor.set(0.5, 1 - 6 / tip.texture.height)
        s.rotation = Math.atan2(nl.dir.y, nl.dir.x) + Math.PI / 2
        const want = Math.hypot(t.x - nl.tip.x, t.y - nl.tip.y) + 8
        s.scale.set(1, want / (tip.texture.height - 30))
        root.addChild(s); parts.push(s)
      }
    } else if (t.kind === 'hangnail') { const s = sprite(bits.hangnail(), 0.7); const d = fingerDir(HAND.fingers[t.n ?? 0]); s.rotation = Math.atan2(d.y, d.x) + Math.PI / 2 }
    else if (t.kind === 'gem') { const s = sprite(bits.sparkle(), 0.35); s.blendMode = 'add'; s.visible = false }
    if (t.done && t.kind !== 'gem' && t.kind !== 'patch') root.visible = false
    if (t.done && t.kind === 'patch') this.placePatch(root, parts, true)
    if (t.done && t.kind === 'gem') this.placeGem(root, t, true)
    this.targetsLayer.addChild(root)
    this.targets.set(t.id, { t, root, parts, flash: 0, gone: t.done && t.kind !== 'gem' && t.kind !== 'patch' })
  }

  private buildLamp() {
    const glow = new Sprite(bits.glow())
    glow.anchor.set(0.5); glow.scale.set(5.2); glow.tint = 0xfff1c8; glow.alpha = 0.55; glow.blendMode = 'add'
    const ring = new Graphics().circle(0, 0, 150).stroke({ width: 18, color: 0xf7c6d4 }).circle(0, 0, 138).stroke({ width: 4, color: 0xffffff, alpha: 0.9 })
    const glint = new Graphics().ellipse(-60, -70, 40, 16).fill({ color: 0xffffff, alpha: 0.35 })
    glint.rotation = -0.6
    this.lampSprite.addChild(glow, ring, glint)
    this.lampSprite.visible = false
  }

  // ------------------------------------------------------------------ layout & camera

  resize(w: number, h: number) {
    const small = w < 700
    this.view = { w, h, top: small ? 88 : 84, bottom: small ? 150 : 150 }
    // Frame the subject to fill most of the screen's height (the face or the hand, about 800 art px),
    // never wider than the screen.
    this.fit = Math.min((0.8 * h) / 800, (0.96 * w) / (this.opts.treatment === 'facial' ? 700 : 820))
  }

  private placeCamera(dt: number) {
    const c = this.cam, g = this.camGoal
    const k = 1 - Math.exp(-dt * 3.2)
    c.x += (g.x - c.x) * k; c.y += (g.y - c.y) * k; c.zoom += (g.zoom - c.zoom) * k
    c.punch *= Math.exp(-dt * 7)
    c.shake *= Math.exp(-dt * 12)
    c.shakeX = (Math.random() - 0.5) * c.shake; c.shakeY = (Math.random() - 0.5) * c.shake
    // A gentle breath: the whole close-up drifts a hair.
    const breath = Math.sin(this.time * 1.4) * 0.004
    const scale = this.fit * c.zoom * (1 + c.punch + breath)
    const cx = this.view.w / 2, cy = this.view.top + (this.view.h - this.view.top - this.view.bottom) / 2
    this.world.scale.set(scale)
    this.world.position.set(cx - c.x * scale + c.shakeX, cy - c.y * scale + c.shakeY)
  }

  private toArt(sx: number, sy: number) { const s = this.world.scale.x; return { x: (sx - this.world.x) / s, y: (sy - this.world.y) / s } }
  private pan(x: number) { const sx = this.world.x + x * this.world.scale.x; return Math.max(-0.8, Math.min(0.8, (sx / this.view.w) * 2 - 1)) }

  // ------------------------------------------------------------------ steps

  private get step(): StepDef | undefined { return this.session.current }
  private get lampRole() { return this.opts.role === 'helper' && !!this.step?.lamp }

  private enterStep(first = false) {
    const step = this.step
    this.loop?.stop()
    this.loop = null
    this.idle = 0
    this.touched = false
    this.grabbing = false
    this.advanceAt = -1
    if (!step) return
    this.hud.setStep(this.session.step, this.session.status)
    if (step.choice) this.hud.chosen(this.session.choices[this.session.step])
    this.camGoal = { ...step.camera }
    const art = toolArt(step.tool)
    this.tool.texture = art.texture
    this.tool.anchor.set(art.tip[0] / art.size, art.tip[1] / art.size)
    this.tool.scale.set(step.tool === 'towel' ? 1 : 0.9)
    const loopName = LOOP_FOR[step.sound] ?? (step.id === 'soak' ? 'soak' : undefined)
    if (loopName) this.loop = sfx.loop(step.id === 'soak' ? 'soak' : loopName)
    if (!first) { sfx.toolUp(step.tool); sfx.whoosh() }
    this.exprBase = step.reaction === 'flinch' ? 'neutral' : step.reaction === 'tickle' ? 'content' : step.reaction
    if (this.exprTimer <= 0) this.setExpr(this.exprBase)
    // Step props.
    if (step.id === 'steam' && !this.towel && this.assets.towel) {
      this.towel = new Sprite(this.assets.towel)
      this.towel.anchor.set(0.5); this.towel.position.set(512, 512); this.towel.alpha = 0
      this.overFx.addChild(this.towel)
    }
    if (step.id === 'cure' && !this.uvLamp) {
      this.uvGlow = new Sprite(bits.glow()); this.uvGlow.anchor.set(0.5); this.uvGlow.position.set(500, 420); this.uvGlow.scale.set(11, 8); this.uvGlow.tint = 0xa27cff; this.uvGlow.blendMode = 'add'; this.uvGlow.alpha = 0
      this.uvLamp = new Sprite(toolArt('uvLamp').texture); this.uvLamp.anchor.set(0.5, 0.78); this.uvLamp.position.set(500, 170); this.uvLamp.scale.set(3.4, 2.4); this.uvLamp.alpha = 0
      this.overFx.addChild(this.uvGlow, this.uvLamp)
    }
    if (step.id === 'color' && this.session.choices[this.session.step] !== undefined) this.surface.setLayerTint('color', POLISH_COLORS[this.session.choices[this.session.step]].hex)
    // Targets for this step become visible (rings for drops and patches, sparkles for gems).
    for (const tv of this.targets.values()) {
      if ((tv.t.kind === 'drop' || tv.t.kind === 'patch') && !tv.t.done) tv.parts[0].visible = step.targets === tv.t.kind
      if (tv.t.kind === 'gem' && !tv.t.done) tv.parts[0].visible = step.targets === 'gem'
    }
  }

  /** Apply a local op and queue it for the partner. */
  private local(op: Op) {
    this.session.apply(op)
    const last = this.outbox[this.outbox.length - 1]
    // Merge the per-frame ops so the network sees a few messages a second.
    if (last && last.k === op.k && (op.k === 'hold' || op.k === 'tick' || op.k === 'peel') && (last as { s: number }).s === (op as { s: number }).s) {
      if (op.k === 'hold' && last.k === 'hold' && Math.hypot(last.x - op.x, last.y - op.y) < 20) { last.dt += op.dt; return }
      if (op.k === 'tick' && last.k === 'tick') { last.dt += op.dt; return }
      if (op.k === 'peel' && last.k === 'peel') { last.dt += op.dt; last.v = op.v; return }
    }
    this.outbox.push(op)
  }

  /** Ops from the co-op partner at this station. */
  applyRemote(ops: Op[], by: number) {
    for (const op of ops) {
      this.session.apply(op)
      if (op.k === 'lamp') this.partnerLamp(op.on ? op : null)
      if (op.k === 'stroke' || op.k === 'hold' || op.k === 'tap') this.partnerAt(op.k === 'stroke' ? op.x1 : op.x, op.k === 'stroke' ? op.y1 : op.y, by)
    }
  }

  snapshot(): SessionSnapshot { return this.session.snapshot() }

  /** A late join: take the lead's state and redraw everything from it. */
  applySnapshot(snap: SessionSnapshot) {
    this.session.restore(snap)
    for (const [id, grid] of Object.entries(this.session.layers)) this.surface.initFromGrid(id, grid)
    for (const tv of this.targets.values()) tv.root.destroy({ children: true })
    this.targets.clear()
    this.buildTargets()
    if (this.session.step > 7 && this.opts.treatment === 'facial') { this.surface.setLayerMix('mask', 1); this.surface.setLayerGloss('mask', 0.05) }
    this.enterStep(true)
  }

  private partnerAt(x: number, y: number, by: number) {
    this.partner.clear().circle(0, 0, 34).stroke({ width: 6, color: PLAYER_COLORS[by] ?? 0xffffff, alpha: 0.9 }).circle(0, 0, 8).fill({ color: PLAYER_COLORS[by] ?? 0xffffff, alpha: 0.9 })
    this.partner.position.set(x, y)
    this.partner.alpha = 1
  }

  private partnerLamp(p: { x: number; y: number } | null) {
    this.lampSprite.visible = !!p
    if (p) this.lampSprite.position.set(p.x, p.y)
  }

  // ------------------------------------------------------------------ input

  private pointer(e: PointerEvent) {
    if (this.destroyed) return
    const rect = this.opts.app.canvas.getBoundingClientRect()
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top
    if (e.type === 'pointerdown') {
      if (e.button > 0) return
      sfx.unlock()
      this.pointers.set(e.pointerId, { x: sx, y: sy })
      try { this.opts.app.canvas.setPointerCapture(e.pointerId) } catch { /* synthetic events */ }
      this.touched = true
      this.hint.visible = false
      if (this.reveal) { this.reveal.dragging = true; this.moveTo(sx, sy); return }
      this.down = true
      this.moveTo(sx, sy, true)
      this.last = { ...this.pos }
      this.onPress()
    } else if (e.type === 'pointermove') {
      if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, { x: sx, y: sy })
      this.hovering = e.pointerType === 'mouse'
      // Two fingers (a pinch): work the point between them.
      if (this.pointers.size >= 2) {
        const [a, b] = [...this.pointers.values()]
        this.moveTo((a.x + b.x) / 2, (a.y + b.y) / 2)
      } else this.moveTo(sx, sy)
    } else {
      if (!this.pointers.has(e.pointerId) && e.type !== 'pointerleave') return
      if (e.type === 'pointerleave') { this.hovering = false; if (this.pointers.size) return }
      this.pointers.delete(e.pointerId)
      if (this.pointers.size === 0) {
        this.down = false
        this.grabbing = false
        if (this.reveal) this.reveal.dragging = false
        if (this.myLamp) { this.myLamp = null; this.local({ k: 'lamp', x: 0, y: 0, on: false }); this.lampSprite.visible = false }
      }
    }
  }

  private moveTo(sx: number, sy: number, jump = false) {
    this.screen.x = sx; this.screen.y = sy
    if (jump) { this.screen.lastX = sx; this.screen.lastY = sy }
    this.pos = this.toArt(sx, sy)
    if (jump) this.toolPos = { ...this.pos, vx: 0 }
  }

  private onPress() {
    const step = this.step
    if (!step || this.session.finished) return
    if (this.lampRole) return
    // A press on a target: taps finish tap targets; on a pimple it is a fresh grip (deep ones need two).
    if (step.gesture === 'targets') this.local({ k: 'tap', s: this.session.step, x: this.pos.x, y: this.pos.y })
    if (step.gesture === 'peel') {
      const line = PEEL_FROM + (PEEL_TO - PEEL_FROM) * this.session.peel.progress
      this.grabbing = Math.abs(this.pos.y - line) < 110 || this.pos.y > line
      if (!this.grabbing) sfx.miss(this.pan(this.pos.x))
    }
  }

  private nearestTarget(x: number, y: number) {
    let best: Target | null = null, bd = Infinity
    for (const t of this.session.stepTargets()) { if (t.done) continue; const d = Math.hypot(t.x - x, t.y - y); if (d < bd) { bd = d; best = t } }
    return best && bd < 90 ? best : null
  }

  /** Per-frame input: strokes, holds, the peel, the lamp. */
  private handleInput(dt: number) {
    const step = this.step
    const s = this.session.step
    const dx = this.screen.x - this.screen.lastX, dy = this.screen.y - this.screen.lastY
    const speedPx = Math.hypot(dx, dy) / Math.max(dt, 1 / 240)
    this.screen.speed += (speedPx - this.screen.speed) * Math.min(1, dt * 12)
    this.screen.lastX = this.screen.x; this.screen.lastY = this.screen.y
    const energy = Math.min(1, this.screen.speed / 1400)
    let level = 0
    if (step && !this.session.finished && !this.reveal && this.down) {
      this.idle = 0
      if (this.lampRole) {
        this.myLamp = { ...this.pos }
        this.lampSprite.visible = true
        this.lampSprite.position.set(this.pos.x, this.pos.y)
        this.lampTimer -= dt
        if (this.lampTimer <= 0) { this.lampTimer = 0.08; this.local({ k: 'lamp', x: this.pos.x, y: this.pos.y, on: true }) }
      } else switch (step.gesture) {
        case 'erase': case 'paint': case 'rub': case 'sweep': {
          const moved = Math.hypot(this.pos.x - this.last.x, this.pos.y - this.last.y)
          const water = step.sound === 'water'
          if (moved > 1.5 || (water && (this.flush = (this.flush + 1) % 3) === 0)) {
            this.local({ k: 'stroke', s, x0: this.last.x, y0: this.last.y, x1: this.pos.x, y1: this.pos.y })
            this.last = { ...this.pos }
          }
          level = water ? 0.55 + energy * 0.45 : energy
          sfx.stroke(step.sound, energy, this.pan(this.pos.x))
          if (water) this.spray(dt)
          break
        }
        case 'hold':
          this.local({ k: 'hold', s, x: this.pos.x, y: this.pos.y, dt })
          level = 1
          break
        case 'targets': {
          const t = this.nearestTarget(this.pos.x, this.pos.y)
          if (t && (t.kind === 'whitehead' || t.kind === 'hangnail')) this.local({ k: 'hold', s, x: this.pos.x, y: this.pos.y, dt })
          break
        }
        case 'peel':
          if (this.grabbing) {
            const v = (PEEL_FROM - this.pos.y) / (PEEL_FROM - PEEL_TO)
            this.local({ k: 'peel', s, v, dt })
          }
          break
      }
    } else this.idle += dt
    // Passive progress (a mask drying by itself): the lead's clock only.
    if (step?.gesture === 'hold' && step.passive && this.opts.role === 'lead' && !this.down && !this.session.ready) this.local({ k: 'tick', s, dt })
    this.loopLevel += (level - this.loopLevel) * Math.min(1, dt * 10)
    this.loop?.set(this.loopLevel, this.pan(this.pos.x))
  }

  // ------------------------------------------------------------------ events

  private handleEvents(events: SessionEvent[]) {
    for (const e of events) {
      switch (e.e) {
        case 'stamp': this.onStamp(e); break
        case 'target': this.onTargetProgress(e.id, e.progress); break
        case 'targetDone': this.onTargetDone(e); break
        case 'targetStage': this.onTargetStage(e.id); break
        case 'miss': sfx.miss(this.pan(e.x)); break
        case 'ready': this.onReady(); break
        case 'resolve':
          this.surface.resolve(e.layer, e.to)
          if (e.layer === 'foam' && e.to === 0) this.foam.washAll()
          break
        case 'peel': this.onPeel(e); break
        case 'choose':
          this.surface.setLayerTint('color', POLISH_COLORS[e.index].hex)
          this.hud.chosen(e.index)
          sfx.toolUp('polishBrush')
          break
        case 'advance':
          if (e.na) { this.hud.hideStep(e.from); break }
          this.onAdvanced(e.from, e.skipped)
          break
        case 'setup': break
        case 'done': this.startReveal(); break
      }
    }
  }

  private onStamp(e: Extract<SessionEvent, { e: 'stamp' }>) {
    this.surface.stamp(e.layer, e.x, e.y, e.r, e.amount)
    const step = this.step
    if (!step || e.layer === WET) return
    const main = e.layer === step.layer
    const foamy = this.session.face?.foamy ?? 1
    if (e.layer === 'foam' && e.amount > 0) this.foam.rub(e.x, e.y, e.r * foamy, Math.min(1, (0.3 + this.screen.speed / 1600) * foamy))
    if (this.personality === 'ticklish' && step.gesture === 'rub' && Math.random() < 0.004) this.flashExpr('giggle', 0.7)
    if (e.layer === 'foam' && e.amount < 0) this.foam.rinse(e.x, e.y, e.r * 1.1)
    if (!main || Math.random() > 0.5) return
    const r = e.r
    const at = () => ({ x: e.x + (Math.random() - 0.5) * r, y: e.y + (Math.random() - 0.5) * r })
    switch (step.tool) {
      case 'cottonPad': case 'tonerPad': case 'towel':
        if (e.changed > 0.2) { const p = at(); this.fx.spawn({ texture: bits.dust(), ...p, vx: (Math.random() - 0.5) * 60, vy: -30, life: 0.5, scale: 0.4, scaleEnd: 0.1, alpha: 0.7, tint: e.layer === 'oldPolish' ? 0xd06080 : 0xffffff }) }
        break
      case 'file': { const p = at(); this.fx.spawn({ texture: bits.dust(), ...p, vx: (Math.random() - 0.5) * 160, vy: 40 + Math.random() * 80, gravity: 300, life: 0.6, scale: 0.25, scaleEnd: 0.05, alpha: 0.9, tint: 0xfff8f2 }); break }
      case 'scrub': { const p = at(); this.fx.spawn({ texture: bits.dust(), ...p, vx: (Math.random() - 0.5) * 120, vy: -40, gravity: 500, life: 0.5, scale: 0.18, alpha: 1, tint: Math.random() < 0.5 ? 0xffffff : 0xe8b878 }); break }
      case 'buffer': if (Math.random() < 0.3) this.twinkle(at().x, at().y, 0.25); break
      case 'maskBrush': case 'polishBrush': if (this.opts.tier >= 3 && Math.random() < 0.3) this.twinkle(e.x, e.y, 0.2); break
      case 'cream': if (Math.random() < 0.25) this.twinkle(at().x, at().y, 0.22); break
    }
    if (this.opts.tier >= 3 && Math.random() < 0.15) this.twinkle(e.x, e.y, 0.18)
  }

  private twinkle(x: number, y: number, scale = 0.3, tint = 0xffffff) {
    this.fx.spawn({ texture: bits.sparkle(), x, y, life: 0.6 + Math.random() * 0.3, scale: 0.05, scaleEnd: scale, alpha: 1, alphaEnd: 0, spin: (Math.random() - 0.5) * 4, blend: 'add', tint })
  }

  private burstSparkles(x: number, y: number, count: number, spread: number) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2, sp = spread * (0.4 + Math.random() * 0.8)
      this.fx.spawn({ texture: bits.sparkle(), x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 3, life: 0.7 + Math.random() * 0.5, scale: 0.3 + Math.random() * 0.25, scaleEnd: 0, alpha: 1, alphaEnd: 0.2, spin: (Math.random() - 0.5) * 6, blend: 'add' })
    }
  }

  private onTargetProgress(id: number, progress: number) {
    const tv = this.targets.get(id)
    if (!tv) return
    if (tv.t.kind === 'whitehead') {
      sfx.squeeze(progress, this.pan(tv.t.x))
      if (progress > 0.35) this.flashExpr('worry', 0.25)
    }
    if (tv.t.kind === 'blackhead') {
      const plug = tv.parts[1]
      plug.visible = true
      plug.scale.set(0.4 * tv.t.size * (0.4 + progress * 0.9))
      plug.position.y = -progress * 6
    }
  }

  private onTargetDone(e: Extract<SessionEvent, { e: 'targetDone' }>) {
    const tv = this.targets.get(e.id)
    const pan = this.pan(e.x)
    switch (e.kind) {
      case 'whitehead': {
        sfx.pop(e.size, pan)
        this.flinch(e.size)
        this.cam.punch += 0.02 + 0.015 * e.size
        this.cam.shake += 5 * e.size
        // Every pop splatters its own way: how juicy this customer is, which way it squirts, its colour.
        const juicy = (this.session.face?.juicy ?? 1) * (0.8 + Math.random() * 0.4)
        const dir = -Math.PI / 2 + (Math.random() - 0.5) * 1.4
        const spread = 1.2 + Math.random() * 1.6
        const tint = [0xffffff, 0xfff4d6, 0xfff9ec, 0xf8f0ff][Math.floor(Math.random() * 4)]
        const n = Math.round((6 + 10 * e.size) * juicy)
        for (let i = 0; i < n; i++) {
          const a = dir + (Math.random() - 0.5) * spread, sp = (160 + Math.random() * 420 * e.size) * juicy
          this.fx.spawn({ texture: bits.pus(), x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, gravity: 1400, drag: 1.5, life: 0.5 + Math.random() * 0.35, scale: (0.22 + Math.random() * 0.35) * e.size, scaleEnd: 0.1, alpha: 1, alphaEnd: 0.6, stretch: 1.8, tint })
        }
        // One big satisfying blob arcs up and lands.
        this.fx.spawn({ texture: bits.pus(), x: e.x, y: e.y, vx: Math.cos(dir) * 140, vy: -520 * e.size * juicy, gravity: 1500, life: 0.6, scale: 0.55 * e.size, scaleEnd: 0.3, alpha: 1, alphaEnd: 0.8, stretch: 1.5, tint })
        this.fx.spawn({ texture: bits.glow(), x: e.x, y: e.y, life: 0.35, scale: 0.6 * e.size, scaleEnd: 2.2 * e.size, alpha: 0.9, alphaEnd: 0, blend: 'add', tint: 0xfff4d8 })
        this.twinkle(e.x + 20, e.y - 20, 0.35)
        if (tv) this.hideTarget(tv, 0.08)
        break
      }
      case 'blackhead': {
        sfx.extract(pan)
        this.cam.punch += 0.008
        if (tv) {
          const plug = tv.parts[1]
          this.fx.spawn({ texture: bits.plug(), x: e.x, y: e.y - 6, vx: (Math.random() - 0.5) * 240, vy: -380 - Math.random() * 200, gravity: 1300, spin: (Math.random() - 0.5) * 14, life: 0.8, scale: 0.4 * e.size, scaleEnd: 0.3 * e.size, alpha: 1, alphaEnd: 0.4, anchorY: 0.3 })
          plug.visible = false
          this.hideTarget(tv, 0.05)
        }
        this.twinkle(e.x, e.y, 0.2)
        if (Math.random() < 0.35) this.flinch(0.5)
        break
      }
      case 'drop': {
        // The drop falls from the dropper, lands and spreads into a glossy pool.
        const from = { x: e.x + 20, y: e.y - 150 }
        this.fx.spawn({ texture: bits.drop(), x: from.x, y: from.y, vx: -40, vy: 200, gravity: 2400, life: 0.18, scale: 0.7, scaleEnd: 0.8, alpha: 1, tint: 0xffe2a0, stretch: 1.6, onDeath: () => {
          sfx.drip(pan)
          for (let i = 0; i < 7; i++) { const a = Math.random() * Math.PI * 2; this.fx.spawn({ texture: bits.drop(), x: e.x, y: e.y, vx: Math.cos(a) * 160, vy: Math.sin(a) * 160 - 80, gravity: 900, life: 0.35, scale: 0.18, scaleEnd: 0.05, alpha: 0.9, tint: 0xffe2a0 }) }
          this.fx.spawn({ texture: bits.glow(), x: e.x, y: e.y, life: 0.6, scale: 0.4, scaleEnd: 3.5, alpha: 0.6, alphaEnd: 0, blend: 'add', tint: 0xffe6b0 })
        } })
        if (tv) this.hideTarget(tv, 0.2)
        break
      }
      case 'patch': sfx.patch(pan); if (tv) this.placePatch(tv.root, tv.parts, false); this.twinkle(e.x, e.y, 0.4); break
      case 'tip': {
        sfx.snip(pan)
        this.cam.punch += 0.01
        if (tv) {
          tv.gone = true
          const f = HAND.fingers[e.n ?? 0], d = fingerDir(f)
          this.flying.push({ g: tv.root, t: 0, vx: d.x * 260 + (Math.random() - 0.5) * 200, vy: -380, spin: (Math.random() - 0.5) * 10 })
        }
        for (let i = 0; i < 5; i++) this.fx.spawn({ texture: bits.dust(), x: e.x, y: e.y, vx: (Math.random() - 0.5) * 200, vy: -Math.random() * 200, gravity: 600, life: 0.5, scale: 0.2, alpha: 1, tint: 0xfff6f0 })
        break
      }
      case 'hangnail': sfx.snip(pan); if (tv) { tv.gone = true; this.flying.push({ g: tv.root, t: 0, vx: (Math.random() - 0.5) * 300, vy: -300, spin: 8 }) }; break
      case 'gem': sfx.gem(pan); if (tv) this.placeGem(tv.root, tv.t, false); this.burstSparkles(e.x, e.y, 8, 160); break
    }
    if (tv) tv.flash = 1
  }

  /** A deep pimple's first squeeze: it comes to a head (and a little clear fluid). Let go and squeeze again. */
  private onTargetStage(id: number) {
    const tv = this.targets.get(id)
    if (!tv) return
    const t = tv.t
    sfx.pop(0.5, this.pan(t.x))
    this.flinch(0.6)
    tv.parts[1].visible = true
    tv.parts[1].scale.set(0.01)
    this.animate(0.25, k => tv.parts[1].scale.set(0.34 * t.size * easeOutBack(k)))
    tv.parts[0].tint = 0xffffff
    for (let i = 0; i < 6; i++) { const a = Math.random() * Math.PI * 2; this.fx.spawn({ texture: bits.drop(), x: t.x, y: t.y, vx: Math.cos(a) * 140, vy: Math.sin(a) * 140 - 60, gravity: 900, life: 0.35, scale: 0.14, alpha: 0.8, alphaEnd: 0 }) }
  }

  private hideTarget(tv: TargetView, delay: number) {
    tv.gone = true
    setTimeout(() => { if (!this.destroyed) tv.root.visible = false }, delay * 1000)
  }

  private placePatch(root: Container, parts: Sprite[], instant: boolean) {
    for (const p of parts) p.visible = false
    const s = new Sprite(bits.patch())
    s.anchor.set(0.5)
    s.scale.set(instant ? 0.62 : 0.01)
    s.rotation = (Math.random() - 0.5) * 0.6
    root.addChild(s)
    if (!instant) this.animate(0.35, t => s.scale.set(0.62 * easeOutBack(t)))
  }

  private placeGem(root: Container, t: Target, instant: boolean) {
    const colors = [0xffc0da, 0xc8b4ff, 0xa8f0dc, 0xfff0a8, 0xb0e0ff]
    const s = new Sprite(bits.gem())
    s.anchor.set(0.5)
    s.tint = colors[(t.n ?? 0) % colors.length]
    s.scale.set(instant ? 0.5 : 0.01)
    root.removeChildren()
    root.addChild(s)
    if (!instant) this.animate(0.3, k => s.scale.set(0.5 * easeOutBack(k)))
  }

  private animations: { t: number; dur: number; fn: (t: number) => void }[] = []
  private animate(dur: number, fn: (t: number) => void) { this.animations.push({ t: 0, dur, fn }) }

  private onReady() {
    const step = this.step
    if (!step) return
    this.hud.ready()
    sfx.ding(this.pan(step.camera.x))
    const c = step.camera
    this.burstSparkles(c.x, c.y, 14, 420)
    this.fx.spawn({ texture: bits.glow(), x: c.x, y: c.y, life: 0.6, scale: 1, scaleEnd: 7, alpha: 0.35, alphaEnd: 0, blend: 'add', tint: 0xfff0f6 })
    this.cam.punch += 0.012
    if (this.opts.role === 'lead') this.advanceAt = this.time + 0.75
  }

  private onAdvanced(from: number, skipped: boolean) {
    const prev = this.session.def.steps[from]
    if (prev?.id === 'steam' && this.towel) {
      // Lift the towel away: the skin underneath is flushed and dewy.
      const tw = this.towel
      tw.alpha = 1
      this.animate(0.7, t => { tw.alpha = 1 - t; tw.y = 512 - t * 260; tw.rotation = -t * 0.08 })
      this.surface.skin.uniforms.uniforms.uSkin[0] = 1
      for (let i = 0; i < 16; i++) this.fx.spawn({ texture: bits.steam(), x: 280 + Math.random() * 460, y: 400 + Math.random() * 420, vx: (Math.random() - 0.5) * 60, vy: -140 - Math.random() * 120, life: 1.6, scale: 1, scaleEnd: 3, alpha: 0.55, alphaEnd: 0 })
    }
    if (prev?.id === 'dry') { this.surface.setLayerMix('mask', 1); this.surface.setLayerGloss('mask', 0.05) }
    if (prev?.id === 'peel' && this.flap.visible) this.releaseFlap()
    if (prev?.id === 'cure' && this.uvLamp) { const l = this.uvLamp, g = this.uvGlow!; this.animate(0.5, t => { l.alpha = 1 - t; g.alpha = 0; l.y = 170 - t * 200 }) }
    if (skipped) sfx.click()
    for (const tv of this.targets.values()) {
      // Targets of the finished step settle (a skip pops the rest quietly).
      if (tv.t.done && !tv.gone && tv.t.kind !== 'gem' && tv.t.kind !== 'patch') this.hideTarget(tv, 0)
      if ((tv.t.kind === 'drop' || tv.t.kind === 'patch' || tv.t.kind === 'gem') && !tv.t.done) tv.parts[0].visible = false
    }
    // Patches are created when their step begins.
    for (const t of this.session.targets) if (!this.targets.has(t.id)) this.addTarget(t)
    this.enterStep()
  }

  // ------------------------------------------------------------------ peel

  private onPeel(e: Extract<SessionEvent, { e: 'peel' }>) {
    this.peelTension = e.tension
    if (e.unstuck) { sfx.peelCreep(0, false); this.cam.punch += 0.01; this.flashExpr('tickle', 0.8) }
    if (e.released) { sfx.peelSnap(); this.flinch(1); this.cam.punch += 0.03; this.cam.shake += 6 }
    else if (this.personality === 'ticklish' && e.progress > 0.1 && Math.random() < 0.04) this.flashExpr('giggle', 0.5)
  }

  private faceSpan(y: number): [number, number] {
    const o = FACE.outline
    let lo = 1024, hi = 0
    for (let i = 0, j = o.length - 2; i < o.length; j = i, i += 2) {
      const y0 = o[j + 1], y1 = o[i + 1]
      if ((y0 > y) !== (y1 > y)) { const x = o[j] + ((y - y0) / (y1 - y0)) * (o[i] - o[j]); lo = Math.min(lo, x); hi = Math.max(hi, x) }
    }
    return lo < hi ? [lo, hi] : [512, 512]
  }

  private drawPeel(dt: number) {
    const step = this.step
    const peeling = step?.gesture === 'peel' && !this.session.peel.released
    if (!peeling) return
    const target = this.session.peel.progress
    const prev = this.peelShown
    this.peelShown += (target - this.peelShown) * Math.min(1, dt * 12)
    const lineY = PEEL_FROM + (PEEL_TO - PEEL_FROM) * this.peelShown
    this.surface.clearBelow('mask', lineY + 4)
    const speed = (this.peelShown - prev) / Math.max(dt, 1e-3)
    const stuck = this.down && this.grabbing && !this.session.peel.unstuck
    sfx.peelCreep(speed, stuck && this.peelTension > 0.03, this.pan(512))
    const [lo, hi] = this.faceSpan(lineY)
    const g = this.flap
    g.visible = true
    g.clear()
    if (hi - lo < 20) return
    const wob = stuck ? Math.sin(this.time * 38) * this.peelTension * 10 : 0
    const thick = 12 + this.peelShown * 30 + (stuck ? this.peelTension * 18 : 0)
    const x0 = lo + 30, x1 = hi - 30
    // The sheet being pulled: the underside, with little specks of gunk it lifted out.
    const hang = 16 + (this.down ? 20 : 6)
    g.moveTo(x0, lineY).lineTo(x1, lineY).lineTo(x1 - 10, lineY - hang - thick).lineTo(x0 + 10, lineY - hang - thick).closePath().fill({ color: 0xc2e4d5, alpha: 0.96 })
    for (let i = 0; i < 26; i++) {
      const fx = x0 + ((i * 97) % Math.max(1, Math.floor(x1 - x0))), fy = lineY - 6 - ((i * 53) % Math.max(1, Math.floor(hang)))
      g.circle(fx, fy, 2 + (i % 3)).fill({ color: 0x6b5a48, alpha: 0.55 })
    }
    // The rolled edge: a tube, light on top, dark underneath.
    const ty = lineY - hang - thick / 2 + wob
    g.roundRect(x0 - 6, ty - thick / 2, x1 - x0 + 12, thick, thick / 2).fill({ color: 0xa9d9c4 })
    g.roundRect(x0, ty - thick / 2 + 2, x1 - x0, thick * 0.4, thick * 0.2).fill({ color: 0xe6f7ef, alpha: 0.9 })
    g.roundRect(x0, ty + thick * 0.12, x1 - x0, thick * 0.3, thick * 0.15).fill({ color: 0x7fb9a2, alpha: 0.8 })
    // Before it is lifted: a curled corner at the chin to grab.
    if (!this.session.peel.unstuck) {
      const cy = PEEL_FROM - 12
      g.moveTo(470, cy).quadraticCurveTo(512, cy - 40 - Math.sin(this.time * 4) * 6, 554, cy).closePath().fill({ color: 0xe6f7ef })
    }
  }

  private releaseFlap() {
    const piece = new Container()
    const g = this.flap
    const copy = new Graphics(g.context)
    piece.addChild(copy)
    this.world.addChild(piece)
    g.clear(); g.visible = false
    this.flying.push({ g: piece, t: 0, vx: 60, vy: -1100, spin: 0.8 })
    for (let i = 0; i < 26; i++) this.fx.spawn({ texture: bits.flake(), x: 300 + Math.random() * 424, y: 300 + Math.random() * 200, vx: (Math.random() - 0.5) * 500, vy: -300 - Math.random() * 500, gravity: 1400, spin: (Math.random() - 0.5) * 12, life: 1, scale: 0.3 + Math.random() * 0.4, alpha: 1, alphaEnd: 0.5 })
    this.burstSparkles(512, 520, 18, 600)
  }

  // ------------------------------------------------------------------ water

  private spray(dt: number) {
    const count = Math.ceil(dt * 90)
    const nozzle = { x: this.pos.x + 70, y: this.pos.y - 200 }
    for (let i = 0; i < count; i++) {
      const tx = this.pos.x + (Math.random() - 0.5) * 60, ty = this.pos.y + (Math.random() - 0.5) * 40
      const t = 0.12
      this.fx.spawn({ texture: bits.streak(), x: nozzle.x + (Math.random() - 0.5) * 30, y: nozzle.y, vx: (tx - nozzle.x) / t, vy: (ty - nozzle.y) / t, life: t, scale: 0.7, alpha: 0.75, alphaEnd: 0.6, stretch: 2.2, onDeath: p => {
        if (Math.random() < 0.5) this.fx.spawn({ texture: bits.drop(), x: p.x, y: p.y, vx: (Math.random() - 0.5) * 260, vy: -Math.random() * 220, gravity: 1300, life: 0.35, scale: 0.16 + Math.random() * 0.14, alpha: 0.9, alphaEnd: 0.3 })
      } })
    }
    // Runoff trickling down the skin.
    if (Math.random() < dt * 14) this.fx.spawn({ texture: bits.drop(), x: this.pos.x + (Math.random() - 0.5) * 90, y: this.pos.y + 20, vx: 0, vy: 60, gravity: 420, drag: 1.2, life: 1.1, scale: 0.2 + Math.random() * 0.15, alpha: 0.85, alphaEnd: 0.2, stretch: 1.6 })
  }

  // ------------------------------------------------------------------ expressions

  private setExpr(e: Expr, instant = false) {
    this.expr = e
    if (instant) for (const part of ['eyes', 'brows', 'mouth'] as const) {
      const want = EXPRESSIONS[e][part === 'eyes' ? 0 : part === 'brows' ? 1 : 2]
      for (const [k, s] of Object.entries(this.features[part])) s.alpha = k === want ? 1 : 0
    }
  }

  private get personality() { return this.session.profile.personality }

  /** A flinch, scaled by the customer's personality: calm ones often shrug it off, sensitive ones never do. */
  private flinch(strength: number) {
    const p = this.personality
    if (p === 'calm' && Math.random() < 0.5) { this.flashExpr('worry', 0.3); return }
    const k = p === 'sensitive' ? 1.6 : 1
    this.flashExpr('flinch', 0.45 * k)
    this.cam.shake += 4 * strength * k
    if (p === 'sensitive') sfx.flinch()
  }

  private flashExpr(e: Expr, seconds: number) {
    if (this.revealT >= 0) return
    this.setExpr(e)
    this.exprTimer = seconds
    if (e === 'flinch') { this.artRoot.scale.set(1, 0.994); this.animate(0.2, t => this.artRoot.scale.set(1, 0.994 + 0.006 * t)) }
  }

  private updateExpr(dt: number) {
    if (this.exprTimer > 0) { this.exprTimer -= dt; if (this.exprTimer <= 0) this.setExpr(this.revealT >= 0 ? 'beam' : this.exprBase) }
    const k = Math.min(1, dt * 12)
    for (const part of ['eyes', 'brows', 'mouth'] as const) {
      const want = EXPRESSIONS[this.expr][part === 'eyes' ? 0 : part === 'brows' ? 1 : 2]
      // The dominant state fades in on top of the old one, which then fades out.
      for (const [key, s] of Object.entries(this.features[part])) {
        const goal = key === want ? 1 : 0
        s.alpha += (goal - s.alpha) * (goal ? k * 1.4 : k * 0.8)
      }
    }
  }

  // ------------------------------------------------------------------ frame

  update(dt: number) {
    if (this.destroyed) return
    this.time += dt
    this.handleInput(dt)
    if (this.opts.role === 'lead') this.session.time(dt)
    this.handleEvents(this.session.drain())
    if (this.advanceAt >= 0 && this.time >= this.advanceAt && this.session.ready) { this.advanceAt = -1; this.local({ k: 'advance', s: this.session.step }) }
    this.handleEvents(this.session.drain())
    // Network: send the batched ops a few times a second.
    this.sendTimer -= dt
    if (this.outbox.length && (this.sendTimer <= 0 || this.outbox.length > 30)) { this.opts.onOps(this.outbox); this.outbox = []; this.sendTimer = 0.06 }
    this.progressTimer -= dt
    if (this.progressTimer <= 0 && this.opts.role === 'lead' && !this.session.finished) { this.progressTimer = 0.5; this.opts.onProgress(this.session.step, this.session.def.steps.length, this.session.progress()) }
    this.hud.setProgress(this.session.progress() / Math.max(0.01, this.session.threshold()))
    this.stepVisuals(dt)
    this.drawPeel(dt)
    this.updateTargets(dt)
    this.updateTool(dt)
    this.updateExpr(dt)
    this.updateReveal(dt)
    for (let i = this.animations.length - 1; i >= 0; i--) { const a = this.animations[i]; a.t += dt; a.fn(Math.min(1, a.t / a.dur)); if (a.t >= a.dur) this.animations.splice(i, 1) }
    for (let i = this.flying.length - 1; i >= 0; i--) {
      const f = this.flying[i]
      f.t += dt; f.vy += 1500 * dt
      f.g.x += f.vx * dt; f.g.y += f.vy * dt; f.g.rotation += f.spin * dt; f.g.alpha = Math.max(0, 1 - f.t * 1.2)
      if (f.t > 1.2) { f.g.destroy({ children: true }); this.flying.splice(i, 1) }
    }
    this.partner.alpha *= Math.exp(-dt * 1.5)
    this.foam.update(dt, this.time)
    this.fx.update(dt)
    this.surface.update(dt)
    this.placeCamera(dt)
    if (this.captureIn > 0 && --this.captureIn === 0) this.beforeRT = this.capture()
  }

  private stepVisuals(dt: number) {
    const step = this.step
    const skinU = this.surface.skin.uniforms.uniforms.uSkin
    // Warmth from the steam fades slowly; the dewy sheen stays after the moisturiser.
    skinU[0] = Math.max(0, skinU[0] - dt * 0.03)
    if (!step) return
    const holding = this.down && !this.lampRole
    if (step.id === 'steam' && this.towel) {
      // The towel drops onto the face while held (a little settle), steam curls up from it.
      const on = holding || this.session.hold > 0.02
      this.towel.alpha += ((on ? 1 : 0) - this.towel.alpha) * Math.min(1, dt * 7)
      const settle = holding ? 1 : 1.03
      this.towel.scale.set(this.towel.scale.x + (settle - this.towel.scale.x) * Math.min(1, dt * 10))
      skinU[0] = Math.max(skinU[0], this.session.hold * 1.2)
      if (on && Math.random() < dt * (holding ? 26 : 8)) this.fx.spawn({ texture: bits.steam(), x: 260 + Math.random() * 500, y: 380 + Math.random() * 480, vx: (Math.random() - 0.5) * 50, vy: -90 - Math.random() * 90, life: 2, scale: 0.8, scaleEnd: 2.8, alpha: 0.5, alphaEnd: 0, fadeIn: 0.25, spin: (Math.random() - 0.5) * 0.6 })
    }
    if (step.id === 'dry') {
      const d = this.session.hold
      this.surface.setLayerMix('mask', d)
      this.surface.setLayerGloss('mask', 0.55 - 0.5 * d)
      if (holding && Math.random() < dt * 30) this.fx.spawn({ texture: bits.streak(), x: this.pos.x + (Math.random() - 0.5) * 200, y: this.pos.y - 150, vx: (Math.random() - 0.5) * 60, vy: 700, life: 0.4, scale: 0.6, alpha: 0.35, alphaEnd: 0, stretch: 2, tint: 0xffffff })
    }
    if (step.id === 'moisturize') skinU[3] = Math.min(0.9, this.session.progress())
    if (step.id === 'cure' && this.uvLamp && this.uvGlow) {
      this.uvLamp.alpha += (1 - this.uvLamp.alpha) * Math.min(1, dt * 6)
      this.uvGlow.alpha += ((holding ? 0.8 + Math.sin(this.time * 20) * 0.05 : 0.15) - this.uvGlow.alpha) * Math.min(1, dt * 10)
      if (holding && Math.random() < dt * 10) this.twinkle(300 + Math.random() * 450, 250 + Math.random() * 300, 0.25, 0xd8c8ff)
    }
    // A hint after a few idle seconds at the start of a step.
    if (!this.touched && this.idle > 2.5 && !this.reveal && this.opts.role === 'lead') {
      const spot = this.hintSpot(step)
      this.hint.visible = true
      this.hint.position.set(spot.x, spot.y)
      const pulse = (this.time * 1.3) % 1
      this.hint.scale.set(0.5 + pulse * 0.7)
      this.hint.alpha = 1 - pulse
    }
  }

  private hintSpot(step: StepDef) {
    if (step.gesture === 'peel') return { x: 512, y: PEEL_FROM - 20 }
    const t = this.session.stepTargets().find(x => !x.done)
    if (t) return t
    return { x: step.camera.x, y: step.camera.y }
  }

  private updateTargets(dt: number) {
    const pressing = this.down && this.step?.gesture === 'targets' && !this.lampRole ? this.nearestTarget(this.pos.x, this.pos.y) : null
    for (const tv of this.targets.values()) {
      if (tv.gone) continue
      const t = tv.t
      tv.flash = Math.max(0, tv.flash - dt * 3)
      if (t.kind === 'whitehead') {
        const p = t.progress
        const pressed = pressing?.id === t.id
        const jig = pressed ? Math.sin(this.time * 50) * 0.04 * p : 0
        if (tv.parts[1].visible) tv.parts[1].scale.set(0.34 * t.size * (1 + p * 0.6 + jig), 0.34 * t.size * (1 + p * 0.5 - jig))
        tv.parts[0].scale.set((t.stage === 2 ? 0.62 : 0.5) * t.size * (1 + p * 0.35 + jig))
        tv.parts[0].alpha = 0.8 + p * 0.2
        if (!pressed && p > 0 && p < 1) t.progress = Math.max(0, p - dt * 0.05)
      } else if (t.kind === 'drop' || t.kind === 'patch') {
        const r = tv.parts[0]
        if (r.visible) { const k = (this.time * 1.4 + t.id * 0.3) % 1; r.alpha = 0.9 - k * 0.6; r.scale.set((t.kind === 'drop' ? 0.75 : 0.6) * (0.85 + k * 0.3)) }
      } else if (t.kind === 'gem' && !t.done) {
        const s = tv.parts[0]
        if (s.visible) { s.rotation += dt; s.alpha = 0.5 + Math.sin(this.time * 4 + t.id) * 0.4 }
      }
    }
  }

  private updateTool(dt: number) {
    const step = this.step
    const hideFor = step?.gesture === 'hold' && (step.tool === 'towel' || step.tool === 'uvLamp')
    const show = !!step && !this.reveal && !this.session.finished && !hideFor && !this.lampRole && (this.down || this.hovering)
    this.tool.visible = show
    if (!show) return
    const k = 1 - Math.exp(-dt * 30)
    const nx = this.toolPos.x + (this.pos.x - this.toolPos.x) * k
    this.toolPos.vx = (nx - this.toolPos.x) / Math.max(dt, 1e-3)
    this.toolPos.x = nx
    this.toolPos.y += (this.pos.y - this.toolPos.y) * k
    this.press += ((this.down ? 1 : 0) - this.press) * Math.min(1, dt * 18)
    let rot = Math.max(-0.35, Math.min(0.35, this.toolPos.vx * 0.0004))
    if (step?.tool === 'fan' && this.down) rot += Math.sin(this.time * 18) * 0.25
    if (step?.tool === 'foamBrush' && this.down) rot += Math.sin(this.time * 12) * 0.08
    const base = step?.tool === 'towel' ? 1 : 0.9
    const pinch = step?.gesture === 'targets' && this.down ? 0.08 : 0
    this.tool.position.set(this.toolPos.x, this.toolPos.y)
    this.tool.rotation = rot
    this.tool.scale.set(base * (1 + this.press * 0.04 - pinch), base * (1 - this.press * 0.07))
    this.tool.alpha = this.down ? 1 : 0.85
  }

  // ------------------------------------------------------------------ reveal & photo

  private capture(): RenderTexture {
    const rt = RenderTexture.create({ width: 768, height: 768 })
    const parent = this.photoRoot.parent
    const index = parent ? parent.getChildIndex(this.photoRoot) : 0
    this.photoRoot.removeFromParent()
    this.opts.app.renderer.render({ container: this.photoRoot, target: rt, clear: true, transform: new Matrix().scale(0.75, 0.75) })
    parent?.addChildAt(this.photoRoot, index)
    return rt
  }

  private startReveal() {
    if (this.revealT >= 0) return
    this.revealT = 0
    this.loop?.stop(); this.loop = null
    this.hud.hideControls()
    this.tool.visible = false
    this.lampSprite.visible = false
    this.foam.clear()
    this.result = this.session.result()
    this.camGoal = this.opts.treatment === 'facial' ? { x: 512, y: 540, zoom: 0.9 } : { x: 480, y: 560, zoom: 0.92 }
    this.setExpr('beam')
    this.exprTimer = 0
  }

  private updateReveal(dt: number) {
    if (this.revealT < 0) return
    this.revealT += dt
    const t = this.revealT
    if (t > 0.9 && !this.reveal && this.beforeRT) {
      this.afterRT = this.capture()
      const before = new Sprite(this.beforeRT)
      before.scale.set(1024 / 768)
      const mask = new Graphics()
      before.mask = mask
      const divider = new Graphics()
      const labels = new Container()
      const label = (text: string, x: number) => {
        const tx = new Text({ text, style: { fontFamily: 'Fredoka, Nunito, sans-serif', fontSize: 34, fontWeight: '600', fill: 0xffffff, dropShadow: { color: 0x9a4a6a, blur: 6, distance: 0, alpha: 0.8 } } })
        tx.anchor.set(0.5); tx.position.set(x, 90); labels.addChild(tx)
      }
      label('Before', 256); label('After', 768)
      labels.alpha = 0
      this.revealLayer.addChild(before, mask, divider, labels)
      this.reveal = { before, mask, divider, labels, div: 1024, dragging: false }
      sfx.reveal()
    }
    const r = this.reveal
    if (!r) return
    const sweepStart = 1.0, sweep = 2.4
    const st = (t - sweepStart) / sweep
    if (r.dragging) r.div = Math.max(0, Math.min(1024, this.pos.x))
    else if (st < 1) r.div = 1024 * (1 - easeInOut(Math.max(0, st)))
    else if (st < 1.35) r.div = 0
    else r.div += (512 - r.div) * Math.min(1, dt * 3)
    r.mask.clear().rect(-300, -300, r.div + 300, 1624).fill(0xffffff)
    r.divider.clear().rect(r.div - 3, -40, 6, 1104).fill({ color: 0xffffff, alpha: 0.95 }).circle(r.div, 540, 26).fill({ color: 0xffffff }).circle(r.div, 540, 20).fill({ color: 0xf7c6d4 })
    if (st > 0 && st < 1 && Math.random() < dt * 40) this.twinkle(r.div + (Math.random() - 0.5) * 30, 100 + Math.random() * 900, 0.35)
    if (st > 0 && st < 1 && Math.random() < dt * 6) sfx.sparkle(((r.div / 1024) * 2 - 1) * 0.6)
    if (st > 1 && Math.random() < dt * 5) this.twinkle(r.div + 60 + Math.random() * (1000 - r.div), 150 + Math.random() * 800, 0.3)
    r.labels.alpha = Math.min(1, Math.max(0, (st - 1.3) * 3))
    if (st > 1.3 && !this.cardShown) {
      this.cardShown = true
      const stars = this.result ? starsFor(this.result, this.opts.mood, this.opts.ambience) : 5
      this.hud.showReveal({ name: this.opts.customer.name, stars, lead: this.opts.role === 'lead' })
      for (let i = 0; i < stars; i++) setTimeout(() => sfx.star(i), 120 * (i + 1))
    }
  }
  private cardShown = false

  private savePhoto() {
    sfx.shutter()
    const renderer = this.opts.app.renderer
    const before = this.beforeRT ? renderer.extract.canvas(this.beforeRT) as HTMLCanvasElement : null
    const after = this.afterRT ? renderer.extract.canvas(this.afterRT) as HTMLCanvasElement : null
    const W = 1400, H = 860
    const c = document.createElement('canvas')
    c.width = W; c.height = H
    const ctx = c.getContext('2d')!
    const g = ctx.createLinearGradient(0, 0, W, H)
    g.addColorStop(0, '#fde7ee'); g.addColorStop(1, '#e7defa')
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
    const card = (img: HTMLCanvasElement | null, x: number, label: string) => {
      ctx.save()
      ctx.shadowColor = 'rgba(120,60,90,0.25)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 10
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.roundRect(x, 110, 620, 680, 28); ctx.fill()
      ctx.restore()
      if (img) { ctx.save(); ctx.beginPath(); ctx.roundRect(x + 20, 130, 580, 580, 18); ctx.clip(); ctx.drawImage(img, x + 20, 130, 580, 580); ctx.restore() }
      ctx.fillStyle = '#8a4a6a'; ctx.font = '600 34px Fredoka, Nunito, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(label, x + 310, 758)
    }
    card(before, 60, 'Before')
    card(after, 720, 'After')
    ctx.fillStyle = '#d9577f'; ctx.font = '700 46px Fredoka, Nunito, sans-serif'; ctx.textAlign = 'left'; ctx.fillText('Glow Salon', 60, 74)
    ctx.fillStyle = '#8a6a80'; ctx.font = '500 28px Nunito, sans-serif'; ctx.textAlign = 'right'; ctx.fillText(`${this.opts.customer.name}, ${this.session.def.name}`, W - 60, 72)
    const a = document.createElement('a')
    a.download = `glow-salon-${this.opts.customer.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`
    a.href = c.toDataURL('image/png')
    a.click()
  }

  /** Coverage of a layer at a point, from the session grid. */
  private coverage(layer: string, x: number, y: number) {
    const grid = this.session.layers[layer]
    if (!grid) return 0
    const gx = Math.max(0, Math.min(GRID - 1, Math.floor(x / CELL))), gy = Math.max(0, Math.min(GRID - 1, Math.floor(y / CELL)))
    return grid[gy * GRID + gx]
  }

  destroy() {
    this.destroyed = true
    this.loop?.stop()
    const canvas = this.opts.app.canvas
    canvas.removeEventListener('pointerdown', this.onPointer)
    canvas.removeEventListener('pointermove', this.onPointer)
    canvas.removeEventListener('pointerleave', this.onPointer)
    window.removeEventListener('pointerup', this.onPointer)
    window.removeEventListener('pointercancel', this.onPointer)
    window.removeEventListener('keydown', this.onKey)
    this.hud.destroy()
    this.surface.destroy()
    this.beforeRT?.destroy(true)
    this.afterRT?.destroy(true)
    this.root.destroy({ children: true })
    const w = window as unknown as { __treatment?: TreatmentView }
    if (w.__treatment === this) delete w.__treatment
  }
}
