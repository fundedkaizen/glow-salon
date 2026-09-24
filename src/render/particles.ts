import { Container, Sprite, type Texture } from 'pixi.js'

/**
 * A small pooled particle system: every burst, drip, bubble and sparkle is a sprite with velocity, gravity,
 * drag, spin and a life, easing its scale and alpha over that life.
 */
export type ParticleSpec = {
  texture: Texture
  x: number
  y: number
  vx?: number
  vy?: number
  gravity?: number
  drag?: number
  life: number
  scale?: number
  scaleEnd?: number
  /** Squash along the velocity (1 = round). */
  stretch?: number
  alpha?: number
  alphaEnd?: number
  rotation?: number
  spin?: number
  tint?: number
  blend?: 'normal' | 'add' | 'screen'
  /** Fade in over this share of the life. */
  fadeIn?: number
  /** Called when the particle dies (a drop that lands and splats). */
  onDeath?: (p: Particle) => void
  anchorY?: number
}

export type Particle = ParticleSpec & { sprite: Sprite; age: number; vx: number; vy: number }

export class Particles {
  readonly root = new Container()
  private live: Particle[] = []
  private pool: Sprite[] = []

  spawn(spec: ParticleSpec): Particle {
    const sprite = this.pool.pop() ?? new Sprite()
    sprite.texture = spec.texture
    sprite.anchor.set(0.5, spec.anchorY ?? 0.5)
    sprite.tint = spec.tint ?? 0xffffff
    sprite.blendMode = spec.blend ?? 'normal'
    sprite.visible = true
    this.root.addChild(sprite)
    const p: Particle = { ...spec, sprite, age: 0, vx: spec.vx ?? 0, vy: spec.vy ?? 0 }
    this.place(p)
    this.live.push(p)
    return p
  }

  get count() { return this.live.length }

  private place(p: Particle) {
    const t = Math.min(1, p.age / p.life)
    const s = (p.scale ?? 1) + ((p.scaleEnd ?? p.scale ?? 1) - (p.scale ?? 1)) * easeOut(t)
    const fadeIn = p.fadeIn ? Math.min(1, t / p.fadeIn) : 1
    const a = ((p.alpha ?? 1) + ((p.alphaEnd ?? 0) - (p.alpha ?? 1)) * t * t) * fadeIn
    const sp = p.sprite
    sp.position.set(p.x, p.y)
    sp.alpha = Math.max(0, a)
    if (p.stretch && p.stretch !== 1) {
      const speed = Math.hypot(p.vx, p.vy)
      const k = 1 + Math.min(p.stretch - 1, speed / 900)
      sp.rotation = Math.atan2(p.vy, p.vx) + Math.PI / 2
      sp.scale.set(s / Math.sqrt(k), s * k)
    } else {
      sp.rotation = p.rotation ?? 0
      sp.scale.set(s)
    }
  }

  update(dt: number) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i]
      p.age += dt
      if (p.age >= p.life) {
        p.onDeath?.(p)
        p.sprite.visible = false
        p.sprite.removeFromParent()
        this.pool.push(p.sprite)
        this.live.splice(i, 1)
        continue
      }
      const drag = p.drag ?? 0
      p.vx *= Math.exp(-drag * dt)
      p.vy = p.vy * Math.exp(-drag * dt) + (p.gravity ?? 0) * dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      if (p.spin) p.rotation = (p.rotation ?? 0) + p.spin * dt
      this.place(p)
    }
  }

  clear() {
    for (const p of this.live) { p.sprite.removeFromParent(); this.pool.push(p.sprite) }
    this.live.length = 0
  }
}

export const easeOut = (t: number) => 1 - (1 - t) ** 3
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)
export const easeOutBack = (t: number) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2 }
