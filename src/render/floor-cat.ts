import { Container, Sprite } from 'pixi.js'
import { CAT_SIZE, catTail, catTexture } from '../art/salon/cat.ts'
import { shadowTexture } from '../art/salon/people.ts'
import { findPath, type Pt } from '../core/floor.ts'

/**
 * The salon cat's little life: it strolls between favourite spots (the cloud rug, a sunny patch, the sofa
 * arm, the reception desk, a window sill), sits and swishes its tail, dozes off, and loves being petted.
 * Purely local and cosmetic: each screen has its own cat doing its own thing.
 */
type Spot = Pt & { up?: number; sort?: number; sleep?: boolean }

const SPOTS: Spot[] = [
  { x: 430, y: 560, sleep: true },
  { x: 960, y: 488, sleep: true },
  { x: 560, y: 430 },
  { x: 1100, y: 470 },
  { x: 250, y: 470 },
  { x: 402, y: 244, up: 26, sort: 262 },
  { x: 128, y: 206, up: 40, sort: 300, sleep: true },
]

export class Cat {
  readonly root = new Container()
  private body = new Container()
  private sprite = new Sprite(catTexture('sit'))
  private tail = new Sprite(catTail())
  private shadow = new Sprite(shadowTexture())
  x = 430
  y = 560
  private path: Pt[] = []
  private state: 'walk' | 'sit' | 'sleep' | 'happy' = 'sit'
  private timer = 3
  private t = 0
  private facing = 1
  private spot: Spot = SPOTS[0]
  /** How high it is sitting (on furniture), eased. */
  private up = 0
  private hopT = -1
  private hopFrom = 0
  private hopTo = 0
  onZ: (text: string, x: number, y: number) => void = () => {}

  private grid: () => Uint8Array

  constructor(grid: () => Uint8Array) {
    this.grid = grid
    this.shadow.anchor.set(0.5)
    this.shadow.scale.set(0.9, 0.9)
    this.sprite.anchor.set(CAT_SIZE.ax / CAT_SIZE.w, CAT_SIZE.ay / CAT_SIZE.h)
    this.tail.anchor.set(4 / 30, 30 / 34)
    this.body.addChild(this.tail, this.sprite)
    this.root.addChild(this.shadow, this.body)
    this.root.eventMode = 'static'
    this.root.cursor = 'pointer'
  }

  /** The sort key for the floor's depth order. */
  get sortY() { return this.up > 1 && this.spot.sort ? this.spot.sort : this.y }
  get pos(): Pt { return { x: this.x, y: this.y - this.up } }
  get asleep() { return this.state === 'sleep' }

  pet() {
    this.state = 'happy'
    this.timer = 2.2
    this.path = []
  }

  private goSomewhere() {
    const options = SPOTS.filter(s => s !== this.spot)
    this.spot = options[Math.floor(Math.random() * options.length)]
    // Jump down first if up on something.
    if (this.up > 1) { this.startHop(0) }
    this.path = findPath(this.grid(), { x: this.x, y: this.y }, this.spot)
    this.state = 'walk'
  }

  private startHop(to: number) { this.hopT = 0; this.hopFrom = this.up; this.hopTo = to }

  update(dt: number) {
    this.t += dt
    if (this.hopT >= 0) {
      this.hopT = Math.min(1, this.hopT + dt * 2.6)
      this.up = this.hopFrom + (this.hopTo - this.hopFrom) * this.hopT + Math.sin(this.hopT * Math.PI) * 16
      if (this.hopT >= 1) { this.hopT = -1; this.up = this.hopTo }
    }
    if (this.state === 'walk') {
      if (this.hopT < 0 && this.path.length) {
        const next = this.path[0]
        const dx = next.x - this.x, dy = next.y - this.y, d = Math.hypot(dx, dy)
        const step = 62 * dt
        if (Math.abs(dx) > 1) this.facing = dx < 0 ? 1 : -1
        if (d <= step) { this.x = next.x; this.y = next.y; this.path.shift() } else { this.x += (dx / d) * step; this.y += (dy / d) * step }
      } else if (this.hopT < 0) {
        if (this.spot.up) this.startHop(this.spot.up)
        this.state = 'sit'
        this.timer = 5 + Math.random() * 8
      }
    } else {
      this.timer -= dt
      if (this.timer <= 0) {
        if (this.state === 'sit' && this.spot.sleep && Math.random() < 0.6) { this.state = 'sleep'; this.timer = 14 + Math.random() * 16 }
        else if (this.state === 'happy') { this.state = 'sit'; this.timer = 4 + Math.random() * 4 }
        else this.goSomewhere()
      }
      if (this.state === 'sleep' && Math.random() < dt * 0.5) this.onZ('z', this.x - 10, this.y - this.up - 30)
    }
    // Pose.
    const walking = this.state === 'walk' && this.hopT < 0
    this.sprite.texture = catTexture(this.state === 'sleep' ? 'sleep' : this.state === 'happy' ? 'happy' : walking ? (Math.floor(this.t * 8) % 2 ? 'walk1' : 'walk2') : 'sit')
    this.body.scale.x = this.facing
    this.body.y = -this.up + (walking ? -Math.abs(Math.sin(this.t * 8 * Math.PI / 2)) * 1.5 : 0)
    const swish = this.state === 'sleep' ? Math.sin(this.t * 0.8) * 0.08 : Math.sin(this.t * (this.state === 'happy' ? 7 : 2.2)) * 0.35
    this.tail.position.set(walking ? 18 : 10, this.state === 'sleep' ? -8 : -10)
    this.tail.rotation = swish
    this.tail.visible = true
    if (this.state === 'sleep') this.tail.rotation = 1.2 + swish
    this.shadow.position.set(0, 0)
    this.shadow.alpha = this.up > 1 ? 0 : 0.9
    this.root.position.set(this.x, this.y)
  }
}
