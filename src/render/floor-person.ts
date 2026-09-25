import { Container, Sprite } from 'pixi.js'
import type { Look } from '../core/customers.ts'
import { ANCHOR, P, SEATS, handToolTexture, personTextures, shadowTexture, type Expr, type HandTool, type PersonTextures, type Role, type SeatKind } from '../art/salon/people.ts'

/**
 * One person on the salon floor, built from its painted parts: it walks with a bob, a sway and swinging limbs,
 * sits (on the sofa or a station), works with busy hands, hops for joy, blinks now and then, glances around,
 * and faces the way it is going. Position is its feet; the floor view sorts it by y.
 */
export type Pose = 'stand' | 'walk' | 'sit' | 'work'

/** People are drawn a little larger than the floor's grid units, so faces read at a glance. */
export const PERSON_SCALE = 1.28

export class Person {
  readonly root = new Container()
  readonly body = new Container()
  private shadow = new Sprite(shadowTexture())
  private hairBack: Sprite | null = null
  private torso: Sprite
  private head: Sprite
  private armL: Sprite
  private armR: Sprite
  /** The working arm with whatever it holds (the tool moves with the arm). */
  private handR = new Container()
  private toolSprite = new Sprite()
  /** A tool in the working hand while working (null: bare hands). */
  tool: HandTool | null = null
  private toolShown: HandTool | null = null
  private legL: Sprite
  private legR: Sprite
  private tex: PersonTextures
  private t = Math.random() * 10
  private blinkIn = 1 + Math.random() * 3
  private blinking = 0
  private hop = 0
  private wave = 0
  private look = 0
  private lookTo = 0
  private lookIn = 1 + Math.random() * 3
  pose: Pose = 'stand'
  facing: 1 | -1 = 1
  /** Sitting with the legs hanging down (the feet in a pedicure chair's basin). */
  feetDown = false
  /** What they sit on, which sets how low they sink and how the legs lie. */
  seat: SeatKind = 'sofa'
  /** How far the body sits below standing, in floor units (for what floats over the head). */
  seatDrop = 0
  expr: Expr = 'smile'
  /** 0 to 1: how much of the walk cycle to show (eases in and out). */
  private stride = 0

  constructor(look: Look, role: Role = 'customer', tint = 0xe7799c, archetype?: string, seed?: number) {
    this.tex = personTextures(look, role, tint, archetype, seed)
    this.shadow.anchor.set(0.5)
    this.root.addChild(this.shadow, this.body)
    this.root.scale.set(PERSON_SCALE)
    if (this.tex.hairBack) {
      this.hairBack = new Sprite(this.tex.hairBack)
      this.hairBack.anchor.set(ANCHOR.hairBack.x / ANCHOR.hairBack.w, ANCHOR.hairBack.y / ANCHOR.hairBack.h)
      this.hairBack.scale.set(P.headScale)
    }
    this.legL = this.part(this.tex.leg, ANCHOR.leg)
    this.legR = this.part(this.tex.leg, ANCHOR.leg)
    this.armL = this.part(this.tex.arm, ANCHOR.arm)
    this.armR = this.part(this.tex.arm, ANCHOR.arm)
    this.torso = this.part(this.tex.body, ANCHOR.body)
    this.head = this.part(this.tex.head('smile'), ANCHOR.head)
    this.head.scale.set(P.headScale)
    if (this.hairBack) this.body.addChild(this.hairBack)
    this.toolSprite.anchor.set(0.5, 4 / 22)
    this.toolSprite.position.set(0, ANCHOR.arm.h - ANCHOR.arm.y - 8)
    this.toolSprite.visible = false
    this.handR.addChild(this.armR, this.toolSprite)
    this.body.addChild(this.armL, this.legL, this.legR, this.torso, this.handR, this.head)
    this.layout(0)
  }

  private part(texture: PersonTextures['body'], a: { w: number; h: number; x: number; y: number }) {
    const s = new Sprite(texture)
    s.anchor.set(a.x / a.w, a.y / a.h)
    return s
  }

  setExpr(e: Expr) {
    if (e === this.expr) return
    this.expr = e
    if (!this.blinking) this.head.texture = this.tex.head(e)
  }

  /** A little hop of joy. */
  jump() { this.hop = 1 }
  /** A friendly wave with the near arm. */
  greet() { this.wave = 1.6 }

  update(dt: number) {
    this.t += dt
    const target = this.pose === 'walk' ? 1 : 0
    this.stride += (target - this.stride) * Math.min(1, dt * 12)
    // Blink: a quick closed-eye frame every few seconds, unless asleep or beaming.
    this.blinkIn -= dt
    if (this.blinking > 0) {
      this.blinking -= dt
      if (this.blinking <= 0) this.head.texture = this.tex.head(this.expr)
    } else if (this.blinkIn <= 0 && this.expr !== 'sleepy' && this.expr !== 'happy') {
      this.blinking = 0.12
      this.blinkIn = 2.5 + Math.random() * 3.5
      this.head.texture = this.tex.head('blink')
    }
    // Idle glances: now and then the head turns a little to look around the salon.
    this.lookIn -= dt
    if (this.lookIn <= 0) { this.lookTo = this.pose === 'walk' ? 0 : Math.random() < 0.35 ? 0 : Math.random() * 2 - 1; this.lookIn = 1.8 + Math.random() * 3.5 }
    this.look += (this.lookTo - this.look) * Math.min(1, dt * 6)
    if (this.hop > 0) this.hop = Math.max(0, this.hop - dt * 2.4)
    if (this.wave > 0) this.wave = Math.max(0, this.wave - dt)
    this.layout(dt)
  }

  private layout(_dt: number) {
    const sit = this.pose === 'sit'
    const work = this.pose === 'work'
    const cycle = this.t * 9.5
    const s = this.stride
    const bob = -Math.abs(Math.sin(cycle)) * 3 * s
    const breathe = Math.sin(this.t * 2.2) * 0.7 * (1 - s)
    const hopY = -Math.sin(this.hop * Math.PI) * 14
    const seatLeg = sit && !this.feetDown
    const sitDrop = !sit ? 0 : seatLeg ? SEATS[this.seat].hip - P.hipY : 10
    this.seatDrop = sitDrop * PERSON_SCALE
    this.body.y = bob + hopY + sitDrop
    this.body.scale.x = this.facing
    // A little side-to-side sway in the walk.
    this.body.rotation = Math.sin(cycle) * 0.035 * s
    // Squash and stretch on the hop.
    const squash = this.hop > 0 ? 1 + Math.sin(this.hop * Math.PI) * 0.06 : 1
    this.body.scale.y = squash
    this.shadow.scale.set(1 - Math.min(0.3, -hopY / 40), 1)
    this.shadow.alpha = 1 - Math.min(0.4, -hopY / 30)
    // Legs: a stride with a lift, swinging from the hip.
    const legSwing = Math.sin(cycle) * s
    this.legL.texture = seatLeg ? this.tex.legSeat(this.seat) : this.tex.leg
    this.legR.texture = this.legL.texture
    const legY = P.hipY - (seatLeg ? 1 : sit ? 2 : 0)
    this.legL.position.set(-P.legX, legY - Math.max(0, Math.sin(cycle)) * 2.2 * s)
    this.legR.position.set(P.legX, legY - Math.max(0, -Math.sin(cycle)) * 2.2 * s)
    this.legL.rotation = legSwing * 0.32
    this.legR.rotation = -legSwing * 0.32
    this.legL.visible = this.legR.visible = true
    // Torso, neck and head: the head rides a hair behind the body's bob, so it feels soft.
    this.torso.position.set(0, P.shoulderY + breathe * 0.3)
    this.torso.scale.y = 1 + breathe * 0.01
    const headTilt = work ? Math.sin(this.t * 3) * 0.05 : Math.sin(this.t * 1.3) * 0.02
    const headLag = Math.abs(Math.sin(cycle - 0.5)) * 0.8 * s
    this.head.position.set(this.look * 1.6, P.headY + breathe * 0.5 + headLag)
    this.head.rotation = headTilt + Math.sin(cycle) * 0.03 * s + this.look * 0.07
    if (this.hairBack) { this.hairBack.position.set(this.look * 1.2, P.headY + breathe * 0.5 + headLag); this.hairBack.rotation = this.head.rotation * 0.6 - Math.sin(cycle) * 0.04 * s }
    // Arms: swing when walking, busy when working, a wave when greeting.
    const armSwing = Math.sin(cycle) * 0.5 * s
    this.armL.position.set(-P.shoulderX, P.shoulderY + 2 + breathe * 0.3)
    this.handR.position.set(P.shoulderX, P.shoulderY + 2 + breathe * 0.3)
    this.armL.rotation = 0.14 + armSwing
    this.handR.rotation = -0.14 - armSwing
    if (work) {
      this.handR.rotation = -0.88 + Math.sin(this.t * 9) * 0.28
      this.armL.rotation = -0.5 + Math.sin(this.t * 7 + 1) * 0.2
    }
    // Seated: hands on the chair's arm rests, or resting on the seat beside the lap.
    if (sit) { const a = this.seat === 'chair' || this.feetDown ? 0.5 : 0.16; this.armL.rotation = a; this.handR.rotation = -a }
    if (this.wave > 0) this.handR.rotation = -2.5 + Math.sin(this.t * 14) * 0.4
    // At work, the tool for the job in the working hand.
    const tool = work ? this.tool : null
    if (tool !== this.toolShown) { this.toolShown = tool; this.toolSprite.visible = !!tool; if (tool) this.toolSprite.texture = handToolTexture(tool) }
  }

  destroy() { this.root.destroy({ children: true }) }
}
