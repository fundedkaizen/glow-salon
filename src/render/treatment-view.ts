import { Container, Graphics, Matrix, RenderTexture, Sprite, Text, type Application } from 'pixi.js'
import type { Look } from '../core/customers.ts'
import { FACE, HAND, fingerDir, nailOf } from '../core/treatments/anatomy.ts'
import { GRID, CELL } from '../core/treatments/grid.ts'
import { PEEL_FROM, PEEL_TO, TreatmentSession, WET, peelCurve, regionMask, type Op, type SessionEvent, type SessionSnapshot, type Target, type TreatmentResult } from '../core/treatments/session.ts'
import { POLISH_COLORS, type StepDef, type TreatmentId } from '../core/treatments/types.ts'
import { starsFor } from '../core/reviews.ts'
import { assetsFor, destroyAssets, type PartAssets } from '../art/assets.ts'
import { BACKDROP, BACKDROP_OFFSET } from '../art/backdrop.ts'
import { bits } from '../art/bits.ts'
import { toolArt } from '../art/tools.ts'
import { PLAYER_COLORS } from '../art/palette.ts'
import { sfx, type LoopName, type LoopVoice } from '../audio/sfx.ts'
import { music } from '../audio/music.ts'
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

/** The magnifier lens: radius in art units, magnification, texture size. */
const LENS_R = 136, LENS_ZOOM = 1.8, LENS_PX = 384
const LOOP_FOR: Record<string, LoopName> = { foam: 'foam', water: 'water', steam: 'steam', fan: 'fan', uv: 'hum', rasp: 'rasp', push: 'scrape', loop: 'scrape', brush: 'brushWet' }
const EXPRESSIONS = { neutral: ['open', 'relaxed', 'neutral'], uneasy: ['open', 'worried', 'pout'], uneasyWide: ['wide', 'worried', 'pout'], uneasyCalm: ['open', 'worried', 'neutral'], content: ['closed', 'relaxed', 'smile'], flinch: ['squeeze', 'worried', 'wince'], tickle: ['happy', 'happy', 'o'], beam: ['open', 'happy', 'beam'], worry: ['wide', 'worried', 'neutral'], giggle: ['happy', 'happy', 'smile'] } as const
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
  // idle life: blinks, a slow head sway, and small head moves on reactions (a spring on tilt and bob)
  private blinkIn = 2 + Math.random() * 2
  private blinkT = -1
  private tilt = { a: 0, v: 0, goal: 0, bob: 0, bobT: 0 }
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
  private peelGrip: { x: number; y: number } | null = null
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
    const t0 = performance.now()
    // Paint now only the layers that start with something on them; the rest follow in the next frames.
    const eager = new Set(Object.entries(this.session.layers).filter(([, g]) => g.some(v => v > 0)).map(([id]) => id))
    this.assets = assetsFor(treatment, customer.look, customer.seed, order, this.session.profile, eager)
    this.buildMs = Math.round(performance.now() - t0)
    this.builtAt = t0
    this.surface = new Surface(app.renderer, this.assets.surface, 0)
    this.foam = new FoamField(this.fx, (x, y) => this.coverage('foam', x, y))

    const backdrop = new Sprite(this.assets.backdrop)
    backdrop.position.set(-BACKDROP_OFFSET, -BACKDROP_OFFSET)
    backdrop.scale.set(BACKDROP / this.assets.backdrop.width)
    this.photoRoot.addChild(backdrop, this.artRoot)
    // Squash and wobble around the middle of the face, not the sheet's corner.
    this.artRoot.pivot.set(512, 540)
    this.artRoot.position.set(512, 540)
    this.artRoot.addChild(this.surface.root, this.foam.root, this.featuresLayer)
    if (this.assets.robe) {
      // The robe sits over the skin and its layers (it covers the neck's lower edge), under the foam.
      const robe = new Sprite(this.assets.robe.texture)
      robe.position.set(this.assets.robe.x, this.assets.robe.y)
      this.artRoot.addChildAt(robe, this.artRoot.getChildIndex(this.surface.root) + 1)
    }
    // Facial targets (pimples) sit under the foam, cream and clay; nail targets (gems) sit on top of the polish.
    if (treatment === 'facial') this.surface.insertBelow('cream', this.targetsLayer)
    else this.artRoot.addChildAt(this.targetsLayer, this.artRoot.getChildIndex(this.surface.root) + 1)
    this.world.addChild(this.photoRoot, this.overFx, this.flap, this.fx.root, this.revealLayer, this.toolLayer)
    this.root.addChild(this.world)
    this.hint.anchor.set(0.5)
    this.hint.visible = false
    this.toolLayer.addChild(this.hint, this.partner, this.lampSprite, this.tool)
    this.tool.visible = false
    this.buildLamp()
    this.buildFeatures()
    this.buildTargets()
    for (const [id, grid] of Object.entries(this.session.layers)) this.surface.initFromGrid(id, grid, this.crispLayer(id))

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
    // Colours already chosen (a resumed treatment) tint their layer.
    this.session.def.steps.forEach((st, i) => { if (st.choice && this.session.choices[i] !== undefined && st.layer) this.surface.setLayerTint(st.layer, POLISH_COLORS[this.session.choices[i]].hex) })
    // Resumed after the mask dried: it is dry clay now.
    const dryIndex = this.session.def.steps.findIndex(st => st.id === 'dry')
    if (dryIndex >= 0 && this.session.status[dryIndex] === 'done') { this.surface.setLayerMix('mask', 1); this.surface.setLayerGloss('mask', 0.05) }
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
    // No music during a treatment: only the close, dry tool sounds.
    music.quiet(true)
    const c = this.cam
    Object.assign(c, this.camGoal)
    // Debug handle for browser checks.
    ;(window as unknown as { __treatment?: TreatmentView }).__treatment = this
  }

  // ------------------------------------------------------------------ setup

  /** Layers seeded as whole shapes, drawn with crisp edges. */
  private crispLayer(id: string) {
    const seed = this.session.def.layers.find(l => l.id === id)?.seed
    return seed === 'full' || seed === 'polish' || seed === 'cuticle' || seed === 'dirt'
  }

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
      const p = this.assets.pimples
      const red = 0.65 + ((t.id * 2654435761) % 1000) / 1000 * 0.5
      const deep = t.stage === 2
      const halo = sprite(p?.halo ?? bits.whiteheadBase(), (deep ? 0.62 : 0.46) * t.size)
      halo.alpha = Math.min(1, 0.55 * red + (deep ? 0.3 : 0))
      sprite(p ? (deep ? p.deepDome : p.dome) : bits.whiteheadBase(), (deep ? 0.52 : 0.42) * t.size)
      const blanch = sprite(p?.blanch ?? bits.glow(), 0.4 * t.size)
      blanch.alpha = 0
      // Deep ones sit under the skin: a bigger, redder bump with no head yet.
      const head = sprite(p?.head ?? bits.whiteheadHead(), 0.3 * t.size)
      head.visible = !deep
    }
    else if (t.kind === 'blackhead') { sprite(bits.blackhead(), 0.44 * t.size); const plug = sprite(bits.plug(), 0.4 * t.size, 0.1); plug.visible = false }
    else if (t.kind === 'drop' || t.kind === 'patch') { const r = sprite(bits.ring(), t.kind === 'drop' ? 0.9 : 0.7); if (t.kind === 'patch') r.tint = 0xf49ac0; r.visible = false }
    else if (t.kind === 'tip') {
      const f = HAND.fingers[t.n ?? 0]
      const tip = this.assets.tips?.[t.n ?? 0]
      const nl = nailOf(f)
      root.position.set(nl.tip.x, nl.tip.y)
      if (tip) {
        const s = new Sprite(tip.texture)
        // tip.y: how far above the crop's bottom the nail's tip point sits (the free edge starts inside the plate).
        s.anchor.set(0.5, 1 - tip.y / tip.texture.height)
        s.rotation = Math.atan2(nl.dir.y, nl.dir.x) + Math.PI / 2
        const want = Math.hypot(t.x - nl.tip.x, t.y - nl.tip.y) + 8
        s.scale.set(1, want / (tip.texture.height - 24 - tip.y))
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

  /**
   * The magnifier lamp: a real 1.8x view of the face through a round lens (the photo layer rendered again,
   * magnified, into a texture each frame it shows), warm light spilling around it, a pastel rim with a
   * bright inner edge, and a curved glint across the glass.
   */
  private buildLamp() {
    const glow = new Sprite(bits.glow())
    glow.anchor.set(0.5); glow.scale.set(5.2); glow.tint = 0xfff1c8; glow.alpha = 0.45; glow.blendMode = 'add'
    this.lensRT = RenderTexture.create({ width: LENS_PX, height: LENS_PX })
    const view = new Sprite(this.lensRT)
    view.anchor.set(0.5)
    view.scale.set((LENS_R * 2 + 8) / LENS_PX)
    const mask = new Graphics().circle(0, 0, LENS_R).fill(0xffffff)
    view.mask = mask
    const shade = new Graphics().circle(0, 0, LENS_R).stroke({ width: 22, color: 0x6a3a4a, alpha: 0.18 })
    const ring = new Graphics().circle(0, 0, 150).stroke({ width: 18, color: 0xf7c6d4 }).circle(0, 0, 141).stroke({ width: 3, color: 0xffffff, alpha: 0.95 }).circle(0, 0, 159).stroke({ width: 2, color: 0xb8859a, alpha: 0.6 })
    const glint = new Graphics().arc(0, 0, 118, Math.PI * 1.08, Math.PI * 1.42).stroke({ width: 10, color: 0xffffff, alpha: 0.5, cap: 'round' }).circle(-44, -96, 6).fill({ color: 0xffffff, alpha: 0.7 })
    this.lampSprite.addChild(glow, view, mask, shade, ring, glint)
    this.lampSprite.visible = false
  }
  private lensRT: RenderTexture | null = null

  /** Render the magnified face into the lens (only while the lamp shows). */
  private drawLens() {
    if (!this.lampSprite.visible || !this.lensRT) return
    const lx = this.lampSprite.x, ly = this.lampSprite.y
    const k = LENS_PX / (LENS_R * 2 + 8) * LENS_ZOOM
    const parent = this.photoRoot.parent
    const index = parent ? parent.getChildIndex(this.photoRoot) : 0
    this.photoRoot.removeFromParent()
    this.opts.app.renderer.render({ container: this.photoRoot, target: this.lensRT, clear: true, transform: new Matrix().translate(-lx, -ly).scale(k, k).translate(LENS_PX / 2, LENS_PX / 2) })
    parent?.addChildAt(this.photoRoot, index)
  }

  // ------------------------------------------------------------------ layout & camera

  resize(w: number, h: number) {
    const small = w < 700
    this.view = { w, h, top: small ? 88 : 84, bottom: small ? 150 : 150 }
    // Frame the subject to fill most of the screen's height (the face or the hand, about 800 art px),
    // never wider than the screen.
    this.fit = Math.min((0.76 * h) / 800, (0.96 * w) / (this.opts.treatment === 'facial' ? 700 : 660))
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
    // While the face is still dirty the customer watches, a little worried; once clean they relax.
    const pop = this.session.def.steps.findIndex(st => st.id === 'pop')
    const dirty = this.opts.treatment === 'facial' && pop > this.session.step
    const uneasy = this.personality === 'sensitive' ? 'uneasyWide' : this.personality === 'calm' ? 'uneasyCalm' : 'uneasy'
    this.exprBase = dirty ? uneasy : step.reaction === 'flinch' ? 'neutral' : step.reaction === 'tickle' ? 'content' : step.reaction
    if (this.exprTimer <= 0) this.setExpr(this.exprBase)
    // Step props.
    if (step.id === 'steam' && !this.towel && this.assets.towel) {
      // Its art is painted a few frames in (see update), so the close-up opens without waiting for it.
      this.towel = new Sprite()
      this.towel.anchor.set(0.5); this.towel.position.set(512, 512); this.towel.alpha = 0
      this.overFx.addChild(this.towel)
    }
    if (step.id === 'cure' && !this.uvLamp) {
      this.uvGlow = new Sprite(bits.glow()); this.uvGlow.anchor.set(0.5); this.uvGlow.position.set(500, 400); this.uvGlow.scale.set(9, 6); this.uvGlow.tint = 0x8a6cff; this.uvGlow.blendMode = 'add'; this.uvGlow.alpha = 0
      this.uvLamp = new Sprite(toolArt('uvLamp').texture); this.uvLamp.anchor.set(0.5, 0.78); this.uvLamp.position.set(490, 250); this.uvLamp.scale.set(2.7, 1.9); this.uvLamp.alpha = 0
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

  /** The lead left and this helper takes over the treatment (drop-out never stalls a customer). */
  promote() {
    if (this.opts.role === 'lead') return
    this.opts.role = 'lead'
    this.hud.setRole('lead')
    this.hud.setStep(this.session.step, this.session.status)
    if (this.session.ready) this.advanceAt = this.time + 0.4
    // Already at the reveal: the new lead needs the Done button, or the customer would wait forever.
    if (this.cardShown) {
      const stars = this.result ? starsFor(this.result, this.opts.mood, this.opts.ambience) : 5
      this.hud.showReveal({ name: this.opts.customer.name, stars, lead: true })
    }
  }

  /** For browser checks: art-space centres of grid cells the current step still needs worked. */
  cellsToWork(limit = 400): [number, number][] {
    const step = this.step
    if (!step?.layer) return []
    const grid = this.session.layers[step.layer]
    const region = regionMask(step.region)
    const out: [number, number][] = []
    for (let i = 0; i < grid.length && out.length < limit; i++) {
      if (!region[i]) continue
      const need = step.gesture === 'erase' ? grid[i] > 0.05 : grid[i] < 0.8
      if (need) out.push([((i % GRID) + 0.5) * CELL, (Math.floor(i / GRID) + 0.5) * CELL])
    }
    return out
  }

  /** For browser checks: where an art-space point is on screen (CSS pixels). */
  artToScreen(x: number, y: number) {
    const rect = this.opts.app.canvas.getBoundingClientRect()
    return { x: rect.left + this.world.x + x * this.world.scale.x, y: rect.top + this.world.y + y * this.world.scale.y }
  }

  /** A late join: take the lead's state and redraw everything from it. */
  applySnapshot(snap: SessionSnapshot) {
    this.session.restore(snap)
    for (const [id, grid] of Object.entries(this.session.layers)) this.surface.initFromGrid(id, grid, this.crispLayer(id))
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
        case 'zone':
          // A nail or an area of the face is done: a little glint and a soft chime.
          sfx.sparkle(this.pan(e.x))
          this.burstSparkles(e.x, e.y, 6, 180)
          this.fx.spawn({ texture: bits.glow(), x: e.x, y: e.y, life: 0.45, scale: 0.5, scaleEnd: 2.4, alpha: 0.5, alphaEnd: 0, blend: 'add', tint: 0xfff4f8 })
          break
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
        const p = this.assets.pimples
        if (p) {
          this.fx.spawn({ texture: p.mark, x: e.x, y: e.y, life: 3.5, scale: 0.42 * e.size, scaleEnd: 0.3 * e.size, alpha: 0.95, alphaEnd: 0 })
          this.fx.spawn({ texture: p.dab, x: e.x + (Math.random() - 0.5) * 6, y: e.y + 2, life: 1.6, scale: 0.55 * e.size, scaleEnd: 0.45 * e.size, alpha: 1, alphaEnd: 0 })
        }
        if (tv) this.hideTarget(tv, 0.03)
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
    const head = tv.parts[3]
    head.visible = true
    head.scale.set(0.01)
    this.animate(0.3, k => head.scale.set(0.3 * t.size * easeOutBack(k)))
    if (this.assets.pimples) tv.parts[1].texture = this.assets.pimples.dome
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
    s.scale.set(instant ? 0.42 : 0.01)
    s.rotation = (Math.random() - 0.5) * 0.6
    root.addChild(s)
    if (!instant) this.animate(0.35, t => s.scale.set(0.42 * easeOutBack(t)))
  }

  private placeGem(root: Container, t: Target, instant: boolean) {
    const colors = [0xffc0da, 0xc8b4ff, 0xa8f0dc, 0xfff0a8, 0xb0e0ff]
    const s = new Sprite(bits.gem())
    s.anchor.set(0.5)
    s.tint = colors[(t.n ?? 0) % colors.length]
    s.scale.set(instant ? 0.68 : 0.01)
    root.removeChildren()
    root.addChild(s)
    if (!instant) this.animate(0.3, k => s.scale.set(0.68 * easeOutBack(k)))
  }

  private animations: { t: number; dur: number; fn: (t: number) => void }[] = []
  private animate(dur: number, fn: (t: number) => void) { this.animations.push({ t: 0, dur, fn }) }

  private onReady() {
    const step = this.step
    if (!step) return
    this.hud.ready()
    const done = this.session.status.filter(st => st === 'done').length
    sfx.ding(this.pan(step.camera.x), done)
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
    this.flap.clear(); this.flap.visible = false
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
    if (e.released) { sfx.peelSnap(); this.flinch(1); this.cam.punch += 0.03; this.cam.shake += 6; if (this.flap.visible) this.releaseFlap() }
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
    this.surface.clearBelow('mask', lineY + 4, peelCurve)
    const speed = (this.peelShown - prev) / Math.max(dt, 1e-3)
    const stuck = this.down && this.grabbing && !this.session.peel.unstuck
    sfx.peelCreep(speed, stuck && this.peelTension > 0.03, this.pan(512))
    const g = this.flap
    g.visible = true
    g.clear()
    const [lo0, hi0] = this.faceSpan(lineY)
    if (hi0 - lo0 < 20) return
    const wob = stuck ? Math.sin(this.time * 38) * this.peelTension * 10 : 0
    const thick = 10 + this.peelShown * 22 + (stuck ? this.peelTension * 14 : 0)
    const front = (x: number) => lineY + peelCurve(x)
    // Fresh skin behind the front: dewy, a little flushed.
    if (this.peelShown > 0.02) {
      for (let x = lo0 + 50; x < hi0 - 50; x += 70) this.surface.stamp(WET, x, front(x) + 30, 60, 0.12)
      const skinU = this.surface.skin.uniforms.uniforms.uSkin
      skinU[0] = Math.max(skinU[0], 0.16)
    }
    // The peeled part folds back over the mask still on the face, its paler underside toward us. Row by
    // row it is the face below the front, mirrored up over it: as wide as the face was where it came from,
    // so its sides follow the face outline and taper where the jaw does; the top rolls into a lip.
    const peeled = PEEL_FROM - lineY
    const H = Math.min(peeled * 0.9, 34 + (this.down ? 30 : 12) + this.peelShown * 50)
    if (H < 6) return
    const ROWS = 12
    const rows: { l: number; r: number; y: (x: number) => number }[] = []
    for (let k = 0; k <= ROWS; k++) {
      const t = k / ROWS
      const [l, r] = this.faceSpan(Math.min(PEEL_FROM + 20, lineY + t * H))
      const inset = 6 + t * 4
      const lift = t * H * 0.86 + Math.sin(Math.PI * t) * 6
      rows.push({ l: l + inset, r: r - inset, y: (x: number) => front(x) - lift + (t > 0.7 ? Math.sin(x * 0.045 + this.time * 2.2) * 2.5 * t + wob * t : 0) })
    }
    const edge = (row: { l: number; r: number; y: (x: number) => number }, from: number, to: number, out: number[]) => {
      const n = 14
      for (let i = 0; i <= n; i++) { const x = from + ((to - from) * i) / n; out.push(x, row.y(x)) }
    }
    // Soft shadow the fold casts on the fresh skin below the front.
    for (let k = 0; k < 4; k++) {
      const band: number[] = []
      edge({ l: lo0, r: hi0, y: x => front(x) + 2 }, lo0 + 14, hi0 - 14, band)
      const back: number[] = []
      edge({ l: lo0, r: hi0, y: x => front(x) + 10 + k * 8 }, hi0 - 20, lo0 + 20, back)
      g.poly([...band, ...back]).fill({ color: 0x5a2e40, alpha: 0.07 })
    }
    // The underside, strip by strip: darker in the fold, lighter toward the lip, darker at the sides.
    for (let k = 0; k < ROWS; k++) {
      const a = rows[k], b = rows[k + 1]
      const strip: number[] = []
      edge(a, a.l, a.r, strip)
      const top: number[] = []
      edge(b, b.r, b.l, top)
      const shadeK = 0.8 + 0.2 * ((k + 1) / ROWS)
      const c = (Math.round(0xd6 * shadeK) << 16) | (Math.round(0xef * shadeK) << 8) | Math.round(0xe4 * shadeK)
      g.poly([...strip, ...top]).fill({ color: c, alpha: 0.98 })
    }
    // The sides turn away: a soft darker edge along each.
    for (const side of [0, 1]) {
      const pts: number[] = []
      for (const row of rows) { const x = side ? row.r : row.l; pts.push(x, row.y(x)) }
      g.moveTo(pts[0], pts[1])
      for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1])
      g.stroke({ width: 5, color: 0x8fbfa9, alpha: 0.6, cap: 'round' })
    }
    // The fold line where it leaves the face.
    const foldPts: number[] = []
    edge(rows[0], rows[0].l, rows[0].r, foldPts)
    g.moveTo(foldPts[0], foldPts[1]); for (let i = 2; i < foldPts.length; i += 2) g.lineTo(foldPts[i], foldPts[i + 1])
    g.stroke({ width: 3, color: 0x7aa892, alpha: 0.7, cap: 'round' })
    // What it pulled out of the pores: dark specks and little creamy plugs, more the further it goes.
    const count = Math.round(20 + this.peelShown * 50)
    for (let i = 0; i < count; i++) {
      const k = 1 + ((i * 37) % (ROWS - 2))
      const row = rows[k]
      const fx = row.l + 8 + ((i * 97 + 13) % Math.max(1, Math.floor(row.r - row.l - 16)))
      const fy = row.y(fx)
      if (i % 3 === 0) {
        g.ellipse(fx, fy, 1.8, 4.2).fill({ color: 0xf7ecc4, alpha: 0.95 })
        g.circle(fx, fy - 3.4, 1.6).fill({ color: 0x5a4636, alpha: 0.9 })
      } else g.circle(fx, fy, 1.2 + (i % 4) * 0.5).fill({ color: 0x5e4a3a, alpha: 0.55 })
    }
    // The rolled lip: a soft tube along the top row, light on top and shaded beneath, its ends rounded.
    const lipRow = rows[ROWS]
    const tube = (dy: number, w: number, color: number, alpha: number) => {
      const pts: number[] = []
      edge(lipRow, lipRow.l + 4, lipRow.r - 4, pts)
      g.moveTo(pts[0], pts[1] + dy)
      for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1] + dy)
      g.stroke({ width: w, color, alpha, cap: 'round' })
    }
    tube(0, thick, 0x9fd8bf, 1)
    tube(-thick * 0.24, thick * 0.34, 0xe9fbf2, 0.95)
    tube(thick * 0.26, thick * 0.24, 0x6fb497, 0.75)
    // The fingers hold the lip where the pointer is.
    this.peelGrip = { x: Math.max(lipRow.l + 20, Math.min(lipRow.r - 20, this.pos.x)), y: lipRow.y(this.pos.x) }
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
    this.peelGrip = null
    // The face gives a little wobble as the sheet lets go.
    this.animate(0.5, t => { const k = Math.sin(t * Math.PI * 3) * (1 - t) * 0.012; this.artRoot.scale.set(1 - k, 1 + k) })
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
    if (e === 'flinch') { this.artRoot.scale.set(1, 0.994); this.animate(0.2, t => this.artRoot.scale.set(1, 0.994 + 0.006 * t)); this.tilt.v += (Math.random() < 0.5 ? -1 : 1) * 0.06 }
    if (e === 'giggle' || e === 'tickle') { this.tilt.bobT = Math.max(this.tilt.bobT, e === 'giggle' ? 0.7 : 0.45); this.tilt.v += 0.03 }
    if (e === 'worry') this.tilt.v -= 0.02
  }

  /**
   * Idle life: a blink every few seconds (open, half, closed, half, open: about a fifth of a second, now and
   * then a double blink), a slow sway of the head, a small tilt toward a smile, a jolt on a wince and a
   * little bob on a giggle. Settles to still for the before/after photos.
   */
  private idleLife(dt: number) {
    const eyes = this.features.eyes
    const want = EXPRESSIONS[this.expr][0]
    const canBlink = (want === 'open' || want === 'wide') && !!eyes.half
    if (this.blinkT < 0) {
      this.blinkIn -= dt
      if (this.blinkIn <= 0 && canBlink && this.captureIn === 0) { this.blinkT = 0; this.blinkIn = Math.random() < 0.15 ? 0.3 : 2.4 + Math.random() * 3.8 }
    } else {
      this.blinkT += dt
      const t = this.blinkT
      const phase = t < 0.045 ? 'half' : t < 0.11 ? 'closed' : t < 0.17 ? 'half' : null
      if (!phase || !canBlink) {
        this.blinkT = -1
        for (const [k, sp] of Object.entries(eyes)) sp.alpha = k === want ? 1 : 0
      } else for (const [k, sp] of Object.entries(eyes)) sp.alpha = k === phase ? 1 : 0
    }
    const tl = this.tilt
    const still = this.revealT >= 0
    tl.goal = still ? 0 : this.expr === 'beam' || this.expr === 'content' ? 0.008 : this.expr === 'flinch' ? -0.006 : 0
    const sway = still ? 0 : Math.sin(this.time * 0.37) * 0.004 + Math.sin(this.time * 0.23 + 1.3) * 0.003
    // A soft spring toward the goal.
    tl.v += ((tl.goal - tl.a) * 40 - tl.v * 9) * dt
    tl.a += tl.v * dt
    if (still) { tl.a *= Math.exp(-dt * 8); tl.v *= Math.exp(-dt * 8) }
    tl.bobT = Math.max(0, tl.bobT - dt)
    tl.bob = tl.bobT > 0 ? Math.sin(this.time * 24) * 3 * Math.min(1, tl.bobT * 3) : tl.bob * Math.exp(-dt * 12)
    this.artRoot.rotation = tl.a + sway
    this.artRoot.position.set(512, 540 + tl.bob)
    // The key light sways a hair with the breath, so the highlights on the skin drift with it.
    const breath = Math.sin(this.time * 1.4)
    this.surface.setLight(-0.32 + breath * 0.035, -0.5 + breath * 0.045, 0.8)
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
    // The second update comes after the first frame drew (and uploaded every painted canvas).
    if (++this.frames === 2) this.firstFrameMs = Math.round(performance.now() - this.builtAt)
    this.time += dt
    this.handleInput(dt)
    // Everyone keeps the clock, so a helper who takes over reports the real time.
    this.session.time(dt)
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
    this.idleLife(dt)
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
    // Paint one waiting layer sheet per frame once the close-up is up.
    if (this.frames > 3 && !this.surface.warmOne() && this.towel && this.assets.towel && !this.assets.towel.made) this.towel.texture = this.assets.towel.get()
    this.placeCamera(dt)
    this.drawLens()
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
      // It drops the last little way onto the face as it appears.
      this.towel.y = 512 - (1 - this.towel.alpha) * 26
      // Wisps curl up off the warm cloth.
      if (on && Math.random() < dt * (holding ? 9 : 3)) this.fx.spawn({ texture: bits.wisp(), x: 300 + Math.random() * 430, y: 600 + Math.random() * 180, vx: (Math.random() - 0.5) * 30, vy: -60 - Math.random() * 50, life: 2.2, scale: 0.8 + Math.random() * 0.5, scaleEnd: 1.8, alpha: 0.45, alphaEnd: 0, fadeIn: 0.4, spin: (Math.random() - 0.5) * 0.3 })
      skinU[0] = Math.max(skinU[0], this.session.hold * 1.2)
      if (on && Math.random() < dt * (holding ? 26 : 8)) this.fx.spawn({ texture: bits.steam(), x: 260 + Math.random() * 500, y: 380 + Math.random() * 480, vx: (Math.random() - 0.5) * 50, vy: -90 - Math.random() * 90, life: 2, scale: 0.8, scaleEnd: 2.8, alpha: 0.5, alphaEnd: 0, fadeIn: 0.25, spin: (Math.random() - 0.5) * 0.6 })
    }
    if (step.id === 'dry') {
      const d = this.session.hold
      this.surface.setLayerMix('mask', d)
      this.surface.setLayerGloss('mask', 0.8 - 0.75 * d)
      if (holding && Math.random() < dt * 30) this.fx.spawn({ texture: bits.streak(), x: this.pos.x + (Math.random() - 0.5) * 200, y: this.pos.y - 150, vx: (Math.random() - 0.5) * 60, vy: 700, life: 0.4, scale: 0.6, alpha: 0.35, alphaEnd: 0, stretch: 2, tint: 0xffffff })
    }
    if (step.id === 'moisturize') skinU[3] = Math.min(0.9, this.session.progress())
    if (step.id === 'cure' && this.uvLamp && this.uvGlow) {
      this.uvLamp.alpha += (0.92 - this.uvLamp.alpha) * Math.min(1, dt * 6)
      this.uvGlow.alpha += ((holding ? 0.42 + Math.sin(this.time * 20) * 0.03 : 0.08) - this.uvGlow.alpha) * Math.min(1, dt * 10)
      if (holding && Math.random() < dt * 10) this.twinkle(300 + Math.random() * 450, 250 + Math.random() * 300, 0.25, 0xd8c8ff)
    }
    // A hint after a few idle seconds at the start of a step, only where there is a spot to go to (targets,
    // the peel's edge): a ring floating over the middle of the hand or face just looks like a mark.
    if (!this.touched && this.idle > 2.5 && !this.reveal && this.opts.role === 'lead' && (step.targets || step.gesture === 'peel')) {
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
        const deep = t.stage === 2
        const jig = pressed ? Math.sin(this.time * 55) * 0.05 * p : 0
        const [halo, dome, blanch, head] = tv.parts
        dome.scale.set((deep ? 0.52 : 0.42) * t.size * (1 + p * 0.35 + jig), (deep ? 0.52 : 0.42) * t.size * (1 + p * 0.3 - jig))
        halo.scale.set((deep ? 0.62 : 0.46) * t.size * (1 + p * 0.25))
        blanch.alpha = pressed ? p * 0.85 : blanch.alpha * 0.9
        blanch.scale.set(0.4 * t.size * (1 + p * 0.4))
        if (head.visible) { head.scale.set(0.3 * t.size * (1 + p * 0.55 + jig), 0.3 * t.size * (1 + p * 0.5 - jig)); head.alpha = 0.85 + p * 0.15 }
        tv.root.position.set(t.x + (pressed ? (Math.random() - 0.5) * 1.6 * p : 0), t.y + (pressed ? (Math.random() - 0.5) * 1.6 * p : 0))
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
    this.hud.toolAt(show ? this.world.y + (this.toolPos.y + 140) * this.world.scale.x : null)
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
    // Peeling: the fingers pinch the rolled lip of the sheet instead of floating at the pointer.
    if (step?.gesture === 'peel' && this.grabbing && this.peelGrip) { this.tool.position.set(this.peelGrip.x, this.peelGrip.y); rot = -0.2 }
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
    // Everything dries for the photo: no droplets, no wet film, just a dewy glow.
    this.surface.resolve('wet', 0)
    this.surface.dryAll()
    this.camGoal = this.opts.treatment === 'facial' ? { x: 512, y: 540, zoom: 0.9 } : { x: 480, y: 560, zoom: 0.92 }
    this.setExpr('beam')
    this.exprTimer = 0
    this.blinkT = -1
    // The finished look glows: a dewier skin and a soft bloom (seen on the After side of the wipe).
    this.surface.skin.uniforms.uniforms.uSkin[3] = 0.6
    const bloom = new Sprite(bits.glow())
    bloom.anchor.set(0.5)
    bloom.position.set(this.camGoal.x, this.camGoal.y)
    bloom.scale.set(13, 15)
    // Warm and faint: a white additive bloom greys deep skin and blows fair skin out to cream.
    bloom.tint = 0xffe6d8
    bloom.blendMode = 'add'
    bloom.alpha = 0
    this.overFx.addChild(bloom)
    this.animate(1.4, t => { bloom.alpha = 0.04 * t })
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
  /** How long painting this customer's art took (ms), for performance checks. */
  buildMs = 0
  /** From the start of painting to the first frame drawn, uploads included (ms): the real wait. */
  firstFrameMs = 0
  private builtAt = 0
  private frames = 0

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
    music.quiet(false)
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
    this.lensRT?.destroy(true)
    this.afterRT?.destroy(true)
    this.root.destroy({ children: true })
    destroyAssets(this.assets)
    const w = window as unknown as { __treatment?: TreatmentView }
    if (w.__treatment === this) delete w.__treatment
  }
}
