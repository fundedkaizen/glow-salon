import { Bone, BufferAttribute, BufferGeometry, Color, Group, Matrix4, MeshStandardMaterial, Skeleton, SkinnedMesh, Vector3 } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { HAIR, OUTFIT, SKIN } from '../art/palette.ts'
import { accessoryFor, outfitOf, type Expr, type Role } from '../art/salon/people.ts'
import { hairPalette } from '../art/hair.ts'
import type { Look } from '../core/customers.ts'
import { lookFigure, SENIOR_AGE } from '../core/figure.ts'
import { G, tf } from './kit.ts'

/**
 * A stand-in person for the 3D floor until the modelled characters arrive: rounded capsules on a small skeleton,
 * dressed and coloured from the same Look (and the same outfit rules) as the 2D floor and the close-up, one draw
 * call each. It walks with a real stride, sits on the sofa and the stool, reclines in the facial chair, sits up
 * with its feet in the pedicure basin, works with busy hands, waves, hops for joy and blinks.
 * Its root is its feet; rotation.y turns it (0 faces the front of the room).
 */
export type Pose3 = 'stand' | 'walk' | 'sit' | 'work'
export type SeatKind3 = 'sofa' | 'chair' | 'stool' | 'pedicure'
export type Tool3 = 'brush' | 'file' | 'footBrush' | null

/** People stand a little taller than life against the furniture, as game characters do, so faces read. */
export const GAME_SCALE = 1.22

export const PERSON_MAT = new MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0 })

const hex = (c: readonly number[]) => (Math.round(c[0]) << 16) | (Math.round(c[1]) << 8) | Math.round(c[2])

const B = { root: 0, hips: 1, spine: 2, chest: 3, neck: 4, head: 5, eyes: 6, mouth: 7, armL: 8, foreL: 9, armR: 10, foreR: 11, thighL: 12, shinL: 13, thighR: 14, shinR: 15, tool: 16 }
const NB = 17

type Rot = [number, number, number]

export class Person3D {
  readonly root = new Group()
  private mesh: SkinnedMesh
  private bones: Bone[] = []
  private rest: Vector3[] = []
  private cur: Rot[] = []
  private tgt: Rot[] = []
  pose: Pose3 = 'stand'
  seat: SeatKind3 = 'sofa'
  /** Metres per second, set by the floor each frame, so the stride matches the ground. */
  speed = 0
  tool: Tool3 = null
  /** The body's size (1 = an adult woman) and the hips' rest height in metres. */
  readonly scale: number
  readonly hipY: number
  private expr: Expr = 'smile'
  private t = Math.random() * 10
  private phase = 0
  private stride = 0
  private blinkIn = 1 + Math.random() * 3
  private blinking = 0
  private hop = 0
  private wave = 0
  private lookT = 0
  private lookTo = 0
  private lookIn = 1 + Math.random() * 3
  /** 0 standing to 1 fully in the seat, eased, so sitting down is a motion. */
  private sitK = 0
  /** The seat's hip height in metres (the seat node's y). */
  seatY = 0.5
  private fadeMat: MeshStandardMaterial | null = null

  constructor(look: Look, role: Role = 'customer', tint = 0xe7799c, archetype?: string) {
    const fig = lookFigure(look)
    const old = fig.age >= SENIOR_AGE
    const young = fig.age < 0.2
    this.scale = GAME_SCALE * (fig.masc ? 1.04 : 0.98) * (young ? 0.93 : old ? 0.96 : 1)
    const s = this.scale
    const wide = fig.masc ? 1.12 : 1
    const skin = SKIN[look.skin % SKIN.length]
    const hairPal = hairPalette(HAIR[look.hair % HAIR.length], fig)
    const outfit = outfitOf(look, fig, role, tint, archetype)
    const acc = accessoryFor(look, archetype)
    const C = {
      skin: hex(skin.base), skinShade: hex(skin.shadow), blush: hex(skin.blush), lip: hex(skin.lip),
      hair: hex(hairPal.base), hairDark: hex(hairPal.dark), hairLight: hex(hairPal.light),
      top: hex(outfit.main), second: hex(outfit.second), pants: hex(outfit.pants), shoes: hex(outfit.shoes),
      sleeve: outfit.sleeve ? hex(outfit.sleeve) : hex(skin.base), accent: OUTFIT[(look.outfit + 5) % OUTFIT.length],
    }
    // ---- skeleton (rest pose, metres, facing +Z; the character's left is +X)
    const hipY = 0.86 * s
    this.hipY = hipY
    const defs: [number, number, number, number][] = [
      [-1, 0, 0, 0],
      [B.root, 0, hipY, 0],
      [B.hips, 0, 0.1 * s, 0],
      [B.spine, 0, 0.17 * s, 0],
      [B.chest, 0, 0.21 * s, 0],
      [B.neck, 0, 0.06 * s, 0],
      [B.head, 0, 0.145 * s, 0.15 * s],
      [B.head, 0, 0.06 * s, 0.14 * s],
      [B.chest, 0.165 * s * wide, 0.17 * s, 0],
      [B.armL, 0, -0.26 * s, 0],
      [B.chest, -0.165 * s * wide, 0.17 * s, 0],
      [B.armR, 0, -0.26 * s, 0],
      [B.hips, 0.085 * s * wide, -0.04 * s, 0],
      [B.thighL, 0, -0.39 * s, 0],
      [B.hips, -0.085 * s * wide, -0.04 * s, 0],
      [B.thighR, 0, -0.39 * s, 0],
      [B.foreR, 0, -0.24 * s, 0.03 * s],
    ]
    for (let i = 0; i < NB; i++) {
      const [parent, x, y, z] = defs[i]
      const bone = new Bone()
      bone.position.set(x, y, z)
      this.rest.push(bone.position.clone())
      if (parent >= 0) this.bones[parent].add(bone)
      this.bones.push(bone)
      this.cur.push([0, 0, 0])
      this.tgt.push([0, 0, 0])
    }
    this.bones[B.root].updateMatrixWorld(true)
    const world = this.bones.map(b => b.matrixWorld.clone())
    // ---- the body, part by part
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
    const hr = 0.155 * s
    // Head and face.
    add(G.sphere(hr, 18), C.skin, B.head, tf(0, 0.13 * s, 0, 0, 0, 0, 1, 1.06, 0.98))
    add(G.sphere(0.034 * s, 8), C.skin, B.head, tf(-hr * 0.98, 0.12 * s, 0, 0, 0, 0, 0.6, 1, 1))
    add(G.sphere(0.034 * s, 8), C.skin, B.head, tf(hr * 0.98, 0.12 * s, 0, 0, 0, 0, 0.6, 1, 1))
    add(G.sphere(0.022 * s, 8), C.skinShade, B.head, tf(0, 0.105 * s, hr * 0.98, 0, 0, 0, 1, 0.9, 0.9))
    for (const sx of [-1, 1]) {
      add(G.sphere(0.03 * s, 8), C.blush, B.head, tf(sx * 0.085 * s, 0.085 * s, hr * 0.82, 0, sx * 0.5, 0, 1, 0.55, 0.3))
      // Brows.
      add(G.box(0.045 * s, 0.011 * s, 0.012 * s, 0.004), C.hairDark, B.head, tf(sx * 0.052 * s, 0.2 * s, hr * 0.94, 0, sx * 0.3, sx * -0.08))
    }
    // Eyes (their own bone, for blinks) and mouth (for smiles).
    for (const sx of [-1, 1]) {
      add(G.sphere(0.026 * s, 10), 0x2b2130, B.eyes, tf(sx * 0.052 * s, 0, -0.004 * s, 0, 0, 0, 1, 1.3, 0.55))
      add(G.sphere(0.008 * s, 6), 0xffffff, B.eyes, tf(sx * 0.052 * s + 0.008 * s, 0.012 * s, 0.01 * s))
    }
    add(G.sphere(0.024 * s, 8), C.lip, B.mouth, tf(0, 0, -0.005 * s, 0, 0, 0, 1.2, 0.45, 0.4))
    // Neck, torso, hips.
    add(G.cyl(0.045 * s, 0.05 * s, 0.1 * s, 10), C.skin, B.neck, tf(0, 0.02 * s, 0))
    add(G.capsule(0.13 * s, 0.13 * s, 12), C.top, B.chest, tf(0, 0.06 * s, 0, 0, 0, 0, 1.12 * wide, 1, 0.78))
    add(G.capsule(0.125 * s, 0.08 * s, 12), outfit.skirt ? C.top : outfit.kind === 'dungarees' ? C.second : C.pants, B.hips, tf(0, 0.02 * s, 0, 0, 0, 0, 1.12 * wide, 1, 0.78))
    add(G.capsule(0.12 * s, 0.1 * s, 12), outfit.kind === 'dungarees' ? C.second : C.top, B.spine, tf(0, 0.04 * s, 0, 0, 0, 0, 1.1 * wide, 1, 0.76))
    // Outfit details on the chest.
    if (role === 'player') add(G.box(0.2 * s * wide, 0.36 * s, 0.03 * s, 0.03 * s), tint, B.spine, tf(0, 0.08 * s, 0.1 * s))
    else if (outfit.kind === 'suit' || outfit.kind === 'jacket') add(G.box(0.07 * s, 0.2 * s, 0.02 * s, 0.01 * s), outfit.kind === 'suit' ? 0xffffff : C.second, B.chest, tf(0, 0.05 * s, 0.105 * s, -0.08, 0, 0))
    else if (outfit.kind === 'cardigan') add(G.box(0.08 * s, 0.26 * s, 0.02 * s, 0.01 * s), C.second, B.chest, tf(0, 0.02 * s, 0.107 * s, -0.08, 0, 0))
    else if (outfit.kind === 'chef') add(G.box(0.16 * s, 0.05 * s, 0.03 * s, 0.015 * s), C.second, B.chest, tf(0, 0.17 * s, 0.085 * s))
    else if (outfit.kind === 'hoodie') add(G.torus(0.09 * s, 0.03 * s, Math.PI * 2, 14), C.top, B.chest, tf(0, 0.2 * s, -0.04 * s, Math.PI / 2 - 0.3, 0, 0))
    else if (outfit.kind === 'dungarees') add(G.box(0.18 * s, 0.14 * s, 0.03 * s, 0.02 * s), C.second, B.chest, tf(0, -0.02 * s, 0.1 * s))
    if (outfit.skirt) add(G.cyl(0.14 * s, 0.26 * s, 0.4 * s, 16), C.top, B.hips, tf(0, -0.17 * s, 0))
    // Arms: sleeve, then skin (or sleeve down to the wrist), and a hand.
    for (const [arm, fore, sx] of [[B.armL, B.foreL, 1], [B.armR, B.foreR, -1]] as const) {
      void sx
      add(G.capsule(0.048 * s, 0.17 * s, 8), C.sleeve, arm, tf(0, -0.12 * s, 0))
      add(G.capsule(0.041 * s, 0.15 * s, 8), outfit.sleeve && outfit.kind !== 'sporty' ? C.sleeve : C.skin, fore, tf(0, -0.1 * s, 0))
      add(G.sphere(0.045 * s, 10), C.skin, fore, tf(0, -0.23 * s, 0.005, 0, 0, 0, 0.85, 1.1, 0.7))
    }
    // Legs: trousers (or bare legs under a skirt, shorts for sport), and shoes.
    const legCol = outfit.skirt || outfit.kind === 'sporty' ? C.skin : C.pants
    for (const [thigh, shin] of [[B.thighL, B.shinL], [B.thighR, B.shinR]] as const) {
      add(G.capsule(0.066 * s, 0.28 * s, 10), outfit.kind === 'sporty' ? C.pants : legCol, thigh, tf(0, -0.19 * s, 0))
      add(G.capsule(0.052 * s, 0.28 * s, 10), legCol, shin, tf(0, -0.19 * s, 0))
      add(G.box(0.1 * s, 0.075 * s, 0.21 * s, 0.035 * s), C.shoes, shin, tf(0, -0.36 * s, 0.045 * s))
    }
    // Hair, by style (the same seven styles as the 2D art).
    this.addHair(add, look.hairStyle, fig.masc, hr, s, C.hair, C.hairLight, C.hairDark)
    // Accessories.
    if (acc === 1 && !fig.masc) for (const sx of [-1, 1]) add(G.sphere(0.035 * s, 8), C.accent, B.head, tf(-0.1 * s + sx * 0.035 * s, 0.27 * s, 0.02 * s, 0, 0, sx * 0.6, 1, 0.6, 0.5))
    if (acc === 2) {
      for (const sx of [-1, 1]) add(G.torus(0.034 * s, 0.006 * s, Math.PI * 2, 16), 0x56384c, B.head, tf(sx * 0.052 * s, 0.145 * s, hr * 1.0))
      add(G.box(0.03 * s, 0.006 * s, 0.006 * s, 0.002), 0x56384c, B.head, tf(0, 0.15 * s, hr * 1.01))
    }
    if (acc === 3) for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; add(G.sphere(0.02 * s, 6), C.accent, B.head, tf(0.1 * s + Math.cos(a) * 0.022 * s, 0.26 * s + Math.sin(a) * 0.022 * s, 0.05 * s)) }
    // The tools, on their own bone in the working hand (scaled away when not working).
    add(G.cyl(0.012 * s, 0.012 * s, 0.14 * s, 6), 0xf6e3ea, B.tool, tf(0, 0, 0.04 * s, Math.PI / 2, 0, 0))
    add(G.sphere(0.03 * s, 8), 0xf3a9c0, B.tool, tf(0, 0, 0.12 * s, 0, 0, 0, 1, 1, 1.4))
    const geo = mergeGeometries(parts, false)!
    for (const g of parts) g.dispose()
    this.mesh = new SkinnedMesh(geo, PERSON_MAT)
    this.mesh.add(this.bones[B.root])
    this.mesh.bind(new Skeleton(this.bones))
    this.mesh.castShadow = true
    this.mesh.frustumCulled = false
    this.root.add(this.mesh)
    this.bones[B.tool].scale.setScalar(0.001)
  }

  private addHair(add: (g: BufferGeometry, c: number, b: number, m: Matrix4) => void, styleN: number, masc: boolean, hr: number, s: number, hair: number, light: number, dark: number) {
    const style = ((styleN % 7) + 7) % 7
    const H = B.head
    const cy = 0.13 * s
    // The shell over the crown and the back (the face stays clear at the front).
    const shell = (k: number, drop = 0) => add(G.sphere(hr * k, 16), hair, H, tf(0, cy + 0.025 * s - drop, -0.035 * s, 0, 0, 0, 1, 1, 1))
    const fringe = () => add(G.sphere(hr * 0.78, 12), hair, H, tf(0.02 * s, cy + 0.11 * s, 0.07 * s, -0.5, 0, -0.2, 1.1, 0.42, 0.62))
    if (masc && style !== 3 && style !== 0) {
      // Short hair for the men who wear it short: a close shell and a side part.
      add(G.sphere(hr * 1.04, 16), hair, H, tf(0, cy + 0.035 * s, -0.03 * s, 0, 0, 0, 1, 0.94, 1))
      add(G.sphere(hr * 0.7, 12), hair, H, tf(0.03 * s, cy + 0.12 * s, 0.06 * s, -0.4, 0, -0.25, 1.1, 0.38, 0.6))
      return
    }
    switch (style) {
      case 0: // long: a shell and a curtain down the back to the shoulder blades
        shell(1.08)
        fringe()
        add(G.box(0.28 * s, 0.34 * s, 0.1 * s, 0.05 * s), hair, H, tf(0, cy - 0.16 * s, -0.08 * s))
        for (const sx of [-1, 1]) add(G.capsule(0.045 * s, 0.2 * s, 8), hair, H, tf(sx * 0.13 * s, cy - 0.1 * s, 0.0, 0.1, 0, sx * 0.08))
        break
      case 1: // bob: a round shell to the jaw
        add(G.sphere(hr * 1.12, 16), hair, H, tf(0, cy - 0.005 * s, -0.04 * s, 0, 0, 0, 1.02, 1, 1))
        fringe()
        break
      case 2: // bun on top
        shell(1.05)
        fringe()
        add(G.sphere(0.075 * s, 12), hair, H, tf(0, cy + 0.19 * s, -0.05 * s))
        add(G.torus(0.05 * s, 0.012 * s, Math.PI * 2, 12), light, H, tf(0, cy + 0.15 * s, -0.04 * s, Math.PI / 2, 0, 0))
        break
      case 3: { // curly: a cloud of curls
        shell(1.04)
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * Math.PI * 2
          const up = 0.07 + Math.abs(Math.sin(a * 1.5)) * 0.05
          add(G.sphere(0.056 * s, 8), i % 3 ? hair : light, H, tf(Math.cos(a) * hr * 0.98, cy + up * s, Math.sin(a) * hr * 0.9 - 0.03 * s))
        }
        for (let i = 0; i < 5; i++) add(G.sphere(0.06 * s, 8), hair, H, tf((i - 2) * 0.05 * s, cy + 0.16 * s, (i % 2 ? -0.02 : 0.03) * s))
        break
      }
      case 4: // crop: close to the head
        add(G.sphere(hr * 1.04, 16), hair, H, tf(0, cy + 0.03 * s, -0.03 * s, 0, 0, 0, 1, 0.96, 1))
        add(G.sphere(hr * 0.7, 12), hair, H, tf(0.03 * s, cy + 0.12 * s, 0.06 * s, -0.4, 0, -0.25, 1.1, 0.38, 0.6))
        break
      case 5: // ponytail
        shell(1.06)
        fringe()
        add(G.sphere(0.03 * s, 8), light, H, tf(0, cy + 0.08 * s, -0.17 * s))
        add(G.capsule(0.05 * s, 0.22 * s, 8), hair, H, tf(0, cy - 0.06 * s, -0.2 * s, -0.25, 0, 0))
        break
      case 6: // braids
        shell(1.06)
        fringe()
        for (const sx of [-1, 1]) {
          for (let k = 0; k < 4; k++) add(G.sphere(0.035 * s, 8), k % 2 ? hair : dark, H, tf(sx * 0.12 * s, cy - 0.07 * s - k * 0.055 * s, 0.02 * s))
          add(G.sphere(0.018 * s, 6), light, H, tf(sx * 0.12 * s, cy - 0.3 * s, 0.02 * s))
        }
        break
    }
  }

  setExpr(e: Expr) { this.expr = e }

  /** Fade in or out (at the door): a see-through copy of the shared material while fading. */
  set opacity(a: number) {
    if (a >= 0.995) { this.mesh.material = PERSON_MAT; this.mesh.castShadow = true; return }
    if (!this.fadeMat) { this.fadeMat = PERSON_MAT.clone(); this.fadeMat.transparent = true }
    this.fadeMat.opacity = Math.max(0, a)
    this.mesh.material = this.fadeMat
    this.mesh.castShadow = a > 0.6
  }
  jump() { this.hop = 1 }
  greet() { this.wave = 1.6 }

  /** The top of the head in the world (for what floats above it). */
  headTop(out: Vector3): Vector3 {
    this.bones[B.head].updateWorldMatrix(true, false)
    return out.setFromMatrixPosition(this.bones[B.head].matrixWorld).add(new Vector3(0, 0.36 * this.scale, 0))
  }

  update(dt: number) {
    this.t += dt
    const walking = this.pose === 'walk'
    this.stride += ((walking ? 1 : 0) - this.stride) * Math.min(1, dt * 10)
    // A step every 0.62 m: the stride follows the ground speed, never skating.
    this.phase += (walking ? Math.max(1.2, this.speed) : 0) * dt * (Math.PI / 0.62)
    this.sitK += ((this.pose === 'sit' ? 1 : 0) - this.sitK) * Math.min(1, dt * 7)
    if (this.hop > 0) this.hop = Math.max(0, this.hop - dt * 2.4)
    if (this.wave > 0) this.wave = Math.max(0, this.wave - dt)
    // Blinks and glances.
    this.blinkIn -= dt
    if (this.blinking > 0) this.blinking -= dt
    else if (this.blinkIn <= 0) { this.blinking = 0.12; this.blinkIn = 2.5 + Math.random() * 3.5 }
    this.lookIn -= dt
    if (this.lookIn <= 0) { this.lookTo = walking ? 0 : Math.random() < 0.35 ? 0 : Math.random() * 2 - 1; this.lookIn = 1.8 + Math.random() * 3.5 }
    this.lookT += (this.lookTo - this.lookT) * Math.min(1, dt * 5)
    this.solve()
    const k = Math.min(1, dt * 14)
    for (let i = 0; i < NB; i++) {
      const c = this.cur[i], g = this.tgt[i]
      c[0] += (g[0] - c[0]) * k; c[1] += (g[1] - c[1]) * k; c[2] += (g[2] - c[2]) * k
      this.bones[i].rotation.set(c[0], c[1], c[2])
    }
    // The walk's bob, the hop and the seat.
    const bob = Math.abs(Math.sin(this.phase)) * 0.035 * this.stride
    const hopY = Math.sin(this.hop * Math.PI) * 0.22
    const sitDrop = this.sitDrop()
    this.bones[B.hips].position.set(this.rest[B.hips].x, this.rest[B.hips].y + bob + hopY - sitDrop * this.sitK, this.rest[B.hips].z)
    // Face: blinks, sleepy lids, smiles.
    const eyes = this.bones[B.eyes], mouth = this.bones[B.mouth]
    const closed = this.blinking > 0 || this.expr === 'sleepy' || this.expr === 'blink'
    eyes.scale.set(1, closed ? 0.12 : this.expr === 'happy' ? 0.45 : this.expr === 'wow' ? 1.25 : 1, 1)
    mouth.scale.set(this.expr === 'happy' ? 1.6 : this.expr === 'meh' ? 0.7 : this.expr === 'wow' ? 0.9 : 1.15, this.expr === 'wow' ? 2.2 : this.expr === 'happy' ? 1.6 : 1, 1)
    this.bones[B.tool].scale.setScalar(this.pose === 'work' && this.tool ? 1 : 0.001)
  }

  /** How far the hips come down when seated (so they land on the seat), in metres. */
  private sitDrop() { return this.hipY - this.seatY }

  /** Target rotations for this frame's pose. */
  private solve() {
    const T = this.tgt
    for (const r of T) { r[0] = 0; r[1] = 0; r[2] = 0 }
    const sw = Math.sin(this.phase) * this.stride
    const breathe = Math.sin(this.t * 2.2) * 0.02
    // Walk: legs swing from the hip, the back knee bends, arms swing opposite.
    T[B.thighL][0] = -sw * 0.55
    T[B.thighR][0] = sw * 0.55
    T[B.shinL][0] = Math.max(0, Math.sin(this.phase + 1.4)) * 0.8 * this.stride
    T[B.shinR][0] = Math.max(0, Math.sin(this.phase + 1.4 + Math.PI)) * 0.8 * this.stride
    T[B.armL][0] = sw * 0.45
    T[B.armR][0] = -sw * 0.45
    T[B.armL][2] = 0.08
    T[B.armR][2] = -0.08
    T[B.foreL][0] = -0.2 - this.stride * 0.2
    T[B.foreR][0] = -0.2 - this.stride * 0.2
    T[B.spine][0] = breathe + this.stride * 0.06
    T[B.hips][1] = Math.sin(this.phase) * 0.12 * this.stride
    T[B.chest][1] = -Math.sin(this.phase) * 0.14 * this.stride
    T[B.head][1] = this.lookT * 0.5
    T[B.head][0] = Math.sin(this.t * 1.3) * 0.03
    if (this.pose === 'sit') {
      const seat = this.seat
      if (seat === 'chair') {
        // Reclined in the facial chair: the back laid down, legs straight along the leg rest.
        T[B.hips][0] = -1.0
        T[B.thighL][0] = T[B.thighR][0] = -0.62
        T[B.shinL][0] = T[B.shinR][0] = 0.05
        T[B.spine][0] = 0.05
        T[B.head][0] = 0.25
        T[B.armL][0] = T[B.armR][0] = -0.35
        T[B.foreL][0] = T[B.foreR][0] = -0.6
      } else {
        // Upright: thighs forward, shins down (in the basin, a little forward).
        T[B.hips][0] = seat === 'sofa' ? -0.18 : seat === 'pedicure' ? -0.14 : 0
        T[B.thighL][0] = T[B.thighR][0] = -Math.PI / 2 + (seat === 'sofa' ? 0.18 : 0.14)
        T[B.shinL][0] = T[B.shinR][0] = seat === 'pedicure' ? 1.05 : Math.PI / 2 - 0.1
        T[B.spine][0] = seat === 'sofa' ? 0.04 : 0
        T[B.armL][0] = T[B.armR][0] = -0.4
        T[B.foreL][0] = T[B.foreR][0] = -0.8
        if (seat === 'stool') { T[B.armL][0] = T[B.armR][0] = -0.75; T[B.foreL][0] = T[B.foreR][0] = -0.9 }
      }
      T[B.thighL][2] = 0.06
      T[B.thighR][2] = -0.06
    }
    if (this.pose === 'work') {
      const busy = Math.sin(this.t * 9)
      T[B.armR][0] = -0.9 + busy * 0.2
      T[B.foreR][0] = -0.9 + Math.sin(this.t * 7) * 0.25
      T[B.armL][0] = -0.6 + Math.sin(this.t * 6 + 1) * 0.12
      T[B.foreL][0] = -0.9
      T[B.spine][0] = 0.14
      T[B.head][0] = 0.3 + Math.sin(this.t * 3) * 0.05
    }
    if (this.wave > 0) {
      T[B.armR][2] = -2.6
      T[B.armR][0] = 0
      T[B.foreR][2] = Math.sin(this.t * 14) * 0.5
      T[B.foreR][0] = 0
    }
    if (this.hop > 0) {
      const k = Math.sin(this.hop * Math.PI)
      T[B.armL][2] = 0.08 + k * 1.8
      T[B.armR][2] = -0.08 - k * 1.8
    }
  }

  destroy() {
    this.fadeMat?.dispose()
    this.mesh.geometry.dispose()
    this.mesh.skeleton.dispose()
    this.root.removeFromParent()
  }
}
