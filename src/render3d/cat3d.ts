import { Bone, BufferAttribute, BufferGeometry, Color, Group, Matrix4, Skeleton, SkinnedMesh } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { findPath, type Pt } from '../core/floor.ts'
import { G, tf } from './kit.ts'
import { PERSON_MAT } from './person3d.ts'

/**
 * The salon cat in 3D: an orange tabby that strolls between its favourite spots (the cloud rug, a sunny patch,
 * the sofa arm, the reception desk), sits and swishes its tail, curls up to doze, and loves being petted. The
 * same little life as the 2D cat, in sim units; the floor turns its position into the room.
 */
type Spot = Pt & { up?: number; sleep?: boolean }

const SPOTS: Spot[] = [
  { x: 430, y: 560, sleep: true },
  { x: 960, y: 488, sleep: true },
  { x: 560, y: 430 },
  { x: 1100, y: 470 },
  { x: 250, y: 470 },
  { x: 402, y: 244, up: 0.64 },
  { x: 128, y: 296, up: 1.06, sleep: true },
]

const FUR = 0xf3b270, CREAM = 0xfff0de, STRIPE = 0xd6844a, PINK = 0xf7b7c4
const CB = { root: 0, body: 1, head: 2, tail1: 3, tail2: 4, fl: 5, fr: 6, bl: 7, br: 8 }

export class Cat3D {
  readonly root = new Group()
  private mesh: SkinnedMesh
  private bones: Bone[] = []
  x = 430
  y = 560
  private path: Pt[] = []
  state: 'walk' | 'sit' | 'sleep' | 'happy' = 'sit'
  private timer = 3
  private t = 0
  /** Which way it faces (radians about Y). */
  yaw = 0.4
  private spot: Spot = SPOTS[0]
  /** How high it is sitting (on furniture), in metres, eased through a hop. */
  up = 0
  private hopT = -1
  private hopFrom = 0
  private hopTo = 0
  onZ: (text: string) => void = () => {}
  private grid: () => Uint8Array

  constructor(grid: () => Uint8Array) {
    this.grid = grid
    const defs: [number, number, number, number][] = [
      [-1, 0, 0, 0], [CB.root, 0, 0.2, 0], [CB.body, 0, 0.09, 0.16], [CB.body, 0, 0.04, -0.17], [CB.tail1, 0, 0.13, -0.02],
      [CB.body, 0.06, -0.04, 0.1], [CB.body, -0.06, -0.04, 0.1], [CB.body, 0.06, -0.04, -0.11], [CB.body, -0.06, -0.04, -0.11],
    ]
    for (const [p, x, y, z] of defs) { const b = new Bone(); b.position.set(x, y, z); if (p >= 0) this.bones[p].add(b); this.bones.push(b) }
    this.bones[0].updateMatrixWorld(true)
    const world = this.bones.map(b => b.matrixWorld.clone())
    const parts: BufferGeometry[] = []
    const add = (geo: BufferGeometry, color: number, bone: number, local: Matrix4) => {
      const g = geo.clone()
      g.applyMatrix4(new Matrix4().multiplyMatrices(world[bone], local))
      const n = g.getAttribute('position').count
      const col = new Float32Array(n * 3), si = new Uint16Array(n * 4), sw = new Float32Array(n * 4)
      const c = new Color(color)
      for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; si[i * 4] = bone; sw[i * 4] = 1 }
      g.setAttribute('color', new BufferAttribute(col, 3))
      g.setAttribute('skinIndex', new BufferAttribute(si, 4))
      g.setAttribute('skinWeight', new BufferAttribute(sw, 4))
      parts.push(g)
    }
    // Body with a cream chest and tabby stripes.
    add(G.sphere(0.1, 14), FUR, CB.body, tf(0, 0, 0, 0, 0, 0, 0.85, 0.8, 1.55))
    add(G.sphere(0.07, 10), CREAM, CB.body, tf(0, -0.02, 0.1, 0, 0, 0, 0.9, 0.9, 0.9))
    for (const z of [-0.06, 0.0, 0.06]) add(G.box(0.17, 0.02, 0.025, 0.01), STRIPE, CB.body, tf(0, 0.075, z, 0, 0, 0))
    // Head, ears, muzzle, eyes, nose.
    add(G.sphere(0.075, 14), FUR, CB.head, tf(0, 0.02, 0, 0, 0, 0, 1.1, 0.95, 1))
    add(G.sphere(0.04, 10), CREAM, CB.head, tf(0, -0.005, 0.055, 0, 0, 0, 1.2, 0.8, 0.8))
    for (const sx of [-1, 1]) {
      add(G.cyl(0, 0.035, 0.06, 6), FUR, CB.head, tf(sx * 0.045, 0.085, -0.005, 0, 0, sx * -0.3))
      add(G.cyl(0, 0.02, 0.04, 6), PINK, CB.head, tf(sx * 0.045, 0.082, 0.004, 0, 0, sx * -0.3))
      add(G.sphere(0.013, 8), 0x3a2a2a, CB.head, tf(sx * 0.03, 0.03, 0.068, 0, 0, 0, 1, 1.2, 0.6))
    }
    add(G.sphere(0.009, 6), 0xe98aa8, CB.head, tf(0, 0.012, 0.09))
    add(G.box(0.1, 0.02, 0.02, 0.008), STRIPE, CB.head, tf(0, 0.075, 0.02, 0, 0, 0))
    // Tail (two segments) and legs with cream paws.
    add(G.capsule(0.022, 0.12, 8), FUR, CB.tail1, tf(0, 0.07, 0))
    add(G.capsule(0.02, 0.12, 8), STRIPE, CB.tail2, tf(0, 0.07, 0))
    for (const leg of [CB.fl, CB.fr, CB.bl, CB.br]) {
      add(G.capsule(0.025, 0.1, 8), FUR, leg, tf(0, -0.07, 0))
      add(G.sphere(0.027, 8), CREAM, leg, tf(0, -0.14, 0.01))
    }
    const geo = mergeGeometries(parts, false)!
    for (const g of parts) g.dispose()
    this.mesh = new SkinnedMesh(geo, PERSON_MAT)
    this.mesh.add(this.bones[0])
    this.mesh.bind(new Skeleton(this.bones))
    this.mesh.castShadow = true
    this.mesh.frustumCulled = false
    this.root.add(this.mesh)
  }

  get asleep() { return this.state === 'sleep' }

  pet() { this.state = 'happy'; this.timer = 2.2; this.path = [] }

  private goSomewhere() {
    const options = SPOTS.filter(s => s !== this.spot)
    this.spot = options[Math.floor(Math.random() * options.length)]
    if (this.up > 0.05) this.startHop(0)
    this.path = findPath(this.grid(), { x: this.x, y: this.y }, this.spot)
    this.state = 'walk'
  }

  private startHop(to: number) { this.hopT = 0; this.hopFrom = this.up; this.hopTo = to }

  update(dt: number) {
    this.t += dt
    if (this.hopT >= 0) {
      this.hopT = Math.min(1, this.hopT + dt * 2.6)
      this.up = this.hopFrom + (this.hopTo - this.hopFrom) * this.hopT + Math.sin(this.hopT * Math.PI) * 0.25
      if (this.hopT >= 1) { this.hopT = -1; this.up = this.hopTo }
    }
    let walking = false
    if (this.state === 'walk') {
      if (this.hopT < 0 && this.path.length) {
        const next = this.path[0]
        const dx = next.x - this.x, dy = next.y - this.y, d = Math.hypot(dx, dy)
        const step = 62 * dt
        if (d > 0.5) this.yaw = Math.atan2(dx, dy * 1.12)
        if (d <= step) { this.x = next.x; this.y = next.y; this.path.shift() } else { this.x += (dx / d) * step; this.y += (dy / d) * step }
        walking = true
      } else if (this.hopT < 0) {
        if (this.spot.up) this.startHop(this.spot.up)
        this.state = 'sit'
        this.timer = 5 + Math.random() * 8
        // Settle facing the room.
        this.yaw = 0.2 + Math.random() * 0.6
      }
    } else {
      this.timer -= dt
      if (this.timer <= 0) {
        if (this.state === 'sit' && this.spot.sleep && Math.random() < 0.6) { this.state = 'sleep'; this.timer = 14 + Math.random() * 16 }
        else if (this.state === 'happy') { this.state = 'sit'; this.timer = 4 + Math.random() * 4 }
        else this.goSomewhere()
      }
      if (this.state === 'sleep' && Math.random() < dt * 0.5) this.onZ('z')
    }
    // Pose the bones.
    const b = this.bones
    const gait = walking ? Math.sin(this.t * 12) : 0
    const sit = this.state === 'sit' || this.state === 'happy'
    const sleep = this.state === 'sleep'
    b[CB.body].position.y = sleep ? 0.1 : 0.2 + (walking ? Math.abs(gait) * 0.01 : 0)
    b[CB.body].rotation.x = sit ? -0.55 : 0
    b[CB.body].position.z = sit ? -0.05 : 0
    b[CB.head].rotation.x = sit ? 0.5 + (this.state === 'happy' ? Math.sin(this.t * 8) * 0.12 : 0) : sleep ? 0.35 : 0
    b[CB.head].rotation.y = sleep ? 0.9 : Math.sin(this.t * 0.7) * 0.2
    b[CB.head].position.set(sleep ? 0.04 : 0, sleep ? 0.0 : 0.09, sleep ? 0.13 : 0.16)
    b[CB.fl].rotation.x = walking ? gait * 0.6 : sit ? 0.55 : sleep ? -1.3 : 0
    b[CB.fr].rotation.x = walking ? -gait * 0.6 : sit ? 0.55 : sleep ? -1.3 : 0
    b[CB.bl].rotation.x = walking ? -gait * 0.6 : sit ? -0.9 : sleep ? 1.3 : 0
    b[CB.br].rotation.x = walking ? gait * 0.6 : sit ? -0.9 : sleep ? 1.3 : 0
    const swish = sleep ? Math.sin(this.t * 0.8) * 0.08 : Math.sin(this.t * (this.state === 'happy' ? 7 : 2.2)) * 0.35
    b[CB.tail1].rotation.set(sleep ? 1.4 : sit ? 1.2 : -0.6, 0, swish + (sleep ? 1.2 : 0))
    b[CB.tail2].rotation.set(sleep ? 0.6 : this.state === 'happy' ? -0.2 : 0.5, 0, swish * 0.8)
  }

  destroy() {
    this.mesh.geometry.dispose()
    this.mesh.skeleton.dispose()
    this.root.removeFromParent()
  }
}
