import { Container, Sprite } from 'pixi.js'
import { bits } from '../art/bits.ts'
import type { Particles } from './particles.ts'

/**
 * Foam as real particles: bubbles and foam clumps that appear under the brush, grow with every rub, wobble,
 * and are carried away by the rinse water (sliding down, shrinking and popping). They sit on top of the
 * foam layer's painted sheet, which gives the lather its body.
 */
type Bubble = { s: Sprite; x: number; y: number; size: number; max: number; vx: number; vy: number; washing: number; phase: number; clump: boolean }

export class FoamField {
  readonly root = new Container()
  private list: Bubble[] = []
  /** How many bubbles were made, for the "Foam artist" award. */
  made = 0

  private fx: Particles
  private covered: (x: number, y: number) => number
  private cap: number
  constructor(fx: Particles, covered: (x: number, y: number) => number, cap = 420) {
    this.fx = fx
    this.covered = covered
    this.cap = cap
  }

  /** A rub at (x, y) with radius r; energy 0 to 1 from the pointer speed. */
  rub(x: number, y: number, r: number, energy: number) {
    // Existing bubbles near the brush grow and jiggle.
    for (const b of this.list) {
      if (b.washing) continue
      const d = Math.hypot(b.x - x, b.y - y)
      if (d < r) {
        b.size = Math.min(b.max, b.size + energy * 0.09 * (1 - d / r))
        b.vx += (Math.random() - 0.5) * 40 * energy
        b.vy += (Math.random() - 0.5) * 40 * energy
      }
    }
    // New ones where the lather is.
    const count = Math.round(energy * 3 + Math.random())
    for (let i = 0; i < count && this.list.length < this.cap; i++) {
      const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * r * 0.9
      const bx = x + Math.cos(a) * d, by = y + Math.sin(a) * d
      if (this.covered(bx, by) < 0.15) continue
      const clump = Math.random() < 0.35
      const s = new Sprite(clump ? bits.foamBlob() : bits.bubble())
      s.anchor.set(0.5)
      this.root.addChild(s)
      this.list.push({ s, x: bx, y: by, size: 0.08, max: clump ? 0.42 + Math.random() * 0.35 : 0.18 + Math.random() * 0.34, vx: 0, vy: 0, washing: 0, phase: Math.random() * 6, clump })
      this.made++
    }
  }

  /** Rinse water at (x, y): bubbles there slide down with the water and pop. */
  rinse(x: number, y: number, r: number) {
    for (const b of this.list) {
      if (b.washing) continue
      if (Math.hypot(b.x - x, b.y - y) < r) { b.washing = 0.001; b.vy = 180 + Math.random() * 260; b.vx = (b.x - x) * 1.5 }
    }
  }

  /** Wash every bubble away (the rinse step settling). */
  washAll() { for (const b of this.list) if (!b.washing) { b.washing = 0.001 + Math.random() * 0.3; b.vy = 120 + Math.random() * 300 } }

  update(dt: number, t: number) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const b = this.list[i]
      b.vx *= Math.exp(-dt * 6)
      b.vy *= b.washing ? Math.exp(-dt * 0.5) : Math.exp(-dt * 6)
      if (b.washing) { b.vy += 700 * dt; b.washing += dt; b.size *= Math.exp(-dt * 1.4) }
      b.x += b.vx * dt
      b.y += b.vy * dt
      const wobble = 1 + Math.sin(t * 5 + b.phase) * 0.04
      b.s.position.set(b.x, b.y)
      b.s.scale.set(b.size * wobble, b.size / wobble)
      b.s.alpha = b.washing ? Math.max(0, 1 - b.washing * 1.4) : 1
      if (b.washing > 0.75 || (b.washing && Math.random() < dt * 1.2)) {
        this.fx.spawn({ texture: bits.dust(), x: b.x, y: b.y, life: 0.25, scale: b.size * 1.2, scaleEnd: b.size * 2.4, alpha: 0.8, alphaEnd: 0, blend: 'add' })
        b.s.destroy()
        this.list.splice(i, 1)
      }
    }
  }

  get count() { return this.list.length }

  clear() { for (const b of this.list) b.s.destroy(); this.list.length = 0 }
}
