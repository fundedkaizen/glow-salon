import { Box3, BufferAttribute, BufferGeometry, CapsuleGeometry, Color, CylinderGeometry, Euler, Group, LatheGeometry, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, Quaternion, SphereGeometry, TorusGeometry, Vector2, Vector3, type Material } from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/**
 * A small modelling kit for the salon's stand-in furniture: rounded boxes, cylinders, spheres and lathes, each
 * painted one flat colour (a vertex colour) and sorted by finish. `build()` merges everything of one finish into
 * one mesh, so a whole room of furniture costs a handful of draw calls.
 */
export type Tier = 'matte' | 'satin' | 'gloss' | 'metal' | 'glass' | 'glow'

export const MAT: Record<Tier, Material> = {
  matte: new MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0 }),
  satin: new MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0 }),
  gloss: new MeshStandardMaterial({ vertexColors: true, roughness: 0.2, metalness: 0 }),
  metal: new MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 1 }),
  glass: new MeshStandardMaterial({ vertexColors: true, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.32, depthWrite: false }),
  glow: new MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
}
const TIERS: Tier[] = ['matte', 'satin', 'gloss', 'metal', 'glass', 'glow']

// Base shapes, cached by size.
const shapes = new Map<string, BufferGeometry>()
function shape(key: string, make: () => BufferGeometry): BufferGeometry {
  let g = shapes.get(key)
  if (!g) {
    g = make()
    if (g.index) g = g.toNonIndexed()
    g.deleteAttribute('uv')
    shapes.set(key, g)
  }
  return g
}

export const G = {
  box: (w: number, h: number, d: number, r = 0.02) => {
    const rr = Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001)
    // Small pieces get one bevel step: at the salon's size the second never shows.
    const seg = rr > 0.03 && Math.min(w, h, d) > 0.15 ? 2 : 1
    return shape(`b${w},${h},${d},${rr}`, () => (rr > 0.004 ? new RoundedBoxGeometry(w, h, d, seg, rr) : new RoundedBoxGeometry(w, h, d, 1, 0.001)))
  },
  cyl: (rt: number, rb: number, h: number, seg = 16) => shape(`c${rt},${rb},${h},${seg}`, () => new CylinderGeometry(rt, rb, h, seg)),
  sphere: (r: number, seg = 14) => shape(`s${r},${seg}`, () => new SphereGeometry(r, seg, Math.max(6, Math.round(seg * 0.7)))),
  capsule: (r: number, len: number, seg = 10) => shape(`k${r},${len},${seg}`, () => new CapsuleGeometry(r, len, 4, seg)),
  torus: (r: number, tube: number, arc = Math.PI * 2, seg = 24) => shape(`t${r},${tube},${arc},${seg}`, () => new TorusGeometry(r, tube, 8, seg, arc)),
  lathe: (key: string, pts: [number, number][], seg = 18) => shape(`l${key}`, () => new LatheGeometry(pts.map(([x, y]) => new Vector2(x, y)), seg)),
}

const _m = new Matrix4()
const _q = new Quaternion()
const _e = new Euler()
const _v = new Vector3()
const _s = new Vector3()

/** A transform: position, then rotation (x, y, z in radians), then scale. */
export function tf(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx): Matrix4 {
  _q.setFromEuler(_e.set(rx, ry, rz))
  return new Matrix4().compose(_v.set(x, y, z), _q, _s.set(sx, sy, sz))
}

const _c = new Color()

/**
 * The layout check's record of every shape the kit adds (tests/floor3d-mesh.test.ts): its box in the room, the
 * piece it belongs to and an optional tag (a worker's own stool, say). Off in the game.
 */
export type PartBox = { piece: string; tag: string; tier: Tier; box: Box3 }
export const PARTS: { on: boolean; list: PartBox[]; piece: string; tag: string } = { on: false, list: [], piece: '', tag: '' }
/** Build `fn` as one named piece (for the layout check). */
export function piece<T>(name: string, fn: () => T): T {
  const was = PARTS.piece
  PARTS.piece = name
  try { return fn() } finally { PARTS.piece = was }
}
/** Tag the shapes `fn` adds (for the layout check), e.g. the stool a worker sits on. */
export function tagged<T>(tag: string, fn: () => T): T {
  const was = PARTS.tag
  PARTS.tag = tag
  try { return fn() } finally { PARTS.tag = was }
}

export class Kit {
  private parts: Record<Tier, BufferGeometry[]> = { matte: [], satin: [], gloss: [], metal: [], glass: [], glow: [] }
  private stack: Matrix4[] = [new Matrix4()]

  /** Add a shape in the current frame at a local transform, painted one colour. */
  add(geo: BufferGeometry, color: number, tier: Tier = 'matte', local?: Matrix4): this {
    const g = geo.clone()
    _m.copy(this.stack[this.stack.length - 1])
    if (local) _m.multiply(local)
    g.applyMatrix4(_m)
    const n = g.getAttribute('position').count
    const col = new Float32Array(n * 3)
    _c.setHex(color)
    for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b }
    g.setAttribute('color', new BufferAttribute(col, 3))
    this.parts[tier].push(g)
    if (PARTS.on) { g.computeBoundingBox(); PARTS.list.push({ piece: PARTS.piece, tag: PARTS.tag, tier, box: g.boundingBox!.clone() }) }
    return this
  }

  /** Build inside a frame (a piece's position and turn): everything added in `fn` moves with it. */
  at(frame: Matrix4, fn: () => void) {
    this.stack.push(this.stack[this.stack.length - 1].clone().multiply(frame))
    try { fn() } finally { this.stack.pop() }
  }

  get empty() { return TIERS.every(t => !this.parts[t].length) }

  /**
   * One mesh per finish. Shadows: everything casts and receives except glass and glow. `override`: draw every
   * finish with this one material instead (the grey ghosts of things to buy).
   */
  build(shadows = true, override?: Material): Group {
    const group = new Group()
    for (const t of TIERS) {
      const list = this.parts[t]
      if (!list.length) continue
      const merged = mergeGeometries(list, false)
      for (const g of list) g.dispose()
      if (!merged) continue
      merged.computeBoundingSphere()
      const mesh = new Mesh(merged, override ?? MAT[t])
      mesh.name = t
      const solid = t !== 'glass' && t !== 'glow'
      mesh.castShadow = shadows && solid
      mesh.receiveShadow = solid
      if (t === 'glass') mesh.renderOrder = 2
      group.add(mesh)
    }
    this.parts = { matte: [], satin: [], gloss: [], metal: [], glass: [], glow: [] }
    return group
  }
}

/** Dispose a built group's geometry (the materials are shared and stay). */
export function disposeGroup(g: Group) {
  g.traverse(o => { if (o instanceof Mesh) o.geometry.dispose() })
  g.removeFromParent()
}

/** A colour a little lighter (k > 0) or darker (k < 0). */
export function shade(c: number, k: number): number {
  const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255
  const f = (x: number) => Math.max(0, Math.min(255, Math.round(k >= 0 ? x + (255 - x) * k : x * (1 + k))))
  return (f(r) << 16) | (f(g) << 8) | f(b)
}
