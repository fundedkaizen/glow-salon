import { BufferAttribute, BufferGeometry, Color, type Group, type Mesh, type MeshStandardMaterial } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { MODEL_BY_ID, MODELS, type ModelEntry, type NodeInfo } from '../art3d/catalog.ts'
import { tf, type Kit, type Tier } from './kit.ts'

/**
 * Helper B's furniture, plants, garden pieces and gifts (src/art3d/catalog.ts). Every model is flat-coloured by
 * material with soft occlusion in its vertex colours, so it bakes straight into the kit's batch: each mesh's
 * vertices move to where the piece stands, its material colour (or a style's or set's override) times its
 * occlusion becomes the vertex colour, and its material's role picks the finish (gold trim is metal, glass is glass,
 * lamps glow). A whole salon of models stays a handful of draw calls, and the mesh layout check sees every mesh.
 */
type Baked = { geo: BufferGeometry; tier: Tier; material: string; color: Color }
const baked = new Map<string, Baked[]>()
const pending = new Map<string, Promise<void>>()

/** The finish a material's role gets. */
export function tierFor(material: string): Tier {
  if (material === 'Glass' || material === 'Lens') return 'glass'
  if (/^(Lamp|Glow|Glow2|Screen)$/.test(material)) return 'glow'
  if (material === 'Trim' || material === 'Silver') return 'metal'
  if (/^(Marble|Water|Bottle[a-d])$/.test(material)) return 'gloss'
  if (/^(Leaf|Leafdark|Soil|Wood|Wooddark|Woodlight|Stone|Flower|Flower2|Paper|Fur|Fur2)$/.test(material)) return 'matte'
  return 'satin'
}

/** A model's meshes as plain float geometry in the model's own frame, with its occlusion as vertex colours. */
function bake(scene: Group): Baked[] {
  scene.updateMatrixWorld(true)
  const out: Baked[] = []
  scene.traverse(o => {
    const m = o as Mesh
    if (!m.isMesh) return
    const src = m.geometry
    const n = src.getAttribute('position').count
    const g = new BufferGeometry()
    const copy = (name: string, size: number) => { const a = src.getAttribute(name); const arr = new Float32Array(n * size); if (a) for (let i = 0; i < n; i++) for (let k = 0; k < size; k++) arr[i * size + k] = a.getComponent(i, k); return arr }
    g.setAttribute('position', new BufferAttribute(copy('position', 3), 3))
    g.setAttribute('normal', new BufferAttribute(copy('normal', 3), 3))
    const ao = src.getAttribute('color')
    const col = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) { col[i * 3] = ao ? ao.getX(i) : 1; col[i * 3 + 1] = ao ? ao.getY(i) : 1; col[i * 3 + 2] = ao ? ao.getZ(i) : 1 }
    g.setAttribute('color', new BufferAttribute(col, 3))
    if (src.index) g.setIndex(Array.from(src.index.array as ArrayLike<number>))
    const ng = g.index ? g.toNonIndexed() : g
    ng.applyMatrix4(m.matrixWorld)
    const mat = m.material as MeshStandardMaterial
    out.push({ geo: ng, tier: tierFor(mat.name), material: mat.name, color: mat.color.clone() })
  })
  return out
}

let loader: GLTFLoader | null = null
/** Load model files (paths under public/models/), once each. `read` fetches the bytes (the game: over HTTP; the tests: from disk). */
export function loadModelFiles(files: readonly string[], read: (file: string) => Promise<ArrayBuffer>): Promise<void> {
  loader ??= (() => { const l = new GLTFLoader(); l.setMeshoptDecoder(MeshoptDecoder); return l })()
  const l = loader
  return Promise.all(files.map(file => {
    if (baked.has(file)) return Promise.resolve()
    let p = pending.get(file)
    if (!p) {
      p = read(file).then(buf => l.parseAsync(buf, '')).then(g => { baked.set(file, bake(g.scene)) }).catch(error => { console.warn('3D model unavailable', file, error) })
      pending.set(file, p)
    }
    return p
  })).then(() => undefined)
}

/** Every furniture, plant and garden file in the catalogue (not the gifts: those load when owned). */
export function furnitureFiles(): string[] {
  const files = new Set<string>()
  for (const m of MODELS) {
    if (m.kind === 'gift' || m.kind === 'room') continue
    files.add(m.file)
    for (const s of m.styles ?? []) files.add(s.file)
  }
  return [...files]
}

export const hasModel = (file: string) => baked.has(file)
export const model = (id: string): ModelEntry | undefined => MODEL_BY_ID[id]

/** The file and colour overrides of an item's style (0, 1, 2; the default when it has none). */
export function styleOf(m: ModelEntry, style = 0): { file: string; overrides: Record<string, number> } {
  const s = m.styles?.[style] ?? m.styles?.[0]
  return { file: s?.file ?? m.file, overrides: s?.materialOverrides ?? {} }
}

/**
 * Bake a model into the kit at (x, z), turned `ry`, scaled `k` (or [kx, ky, kz]). `tint`: colours by material name
 * over the model's own. Returns false when the model has not loaded (the caller builds its stand-in).
 */
export function bakeModel(kit: Kit, file: string, x: number, z: number, ry = 0, k: number | [number, number, number] = 1, tint: Record<string, number> = {}, y = 0): boolean {
  const parts = baked.get(file)
  if (!parts) return false
  const [sx, sy, sz] = typeof k === 'number' ? [k, k, k] : k
  const frame = tf(x, y, z, 0, ry, 0, sx, sy, sz)
  for (const p of parts) {
    const c = tint[p.material] !== undefined ? new Color(tint[p.material]) : p.color
    kit.addColoured(p.geo, c, p.tier, frame)
  }
  return true
}

/** A helper node of a model placed at (x, z) turned `ry` and scaled `k`: its point in the room and its facing. */
export function nodeAt(n: NodeInfo, x: number, z: number, ry: number, k = 1): { x: number; y: number; z: number; yaw: number } {
  const [nx, ny, nz] = n.pos
  const c = Math.cos(ry), s = Math.sin(ry)
  return { x: x + (nx * c + nz * s) * k, y: ny * k, z: z + (-nx * s + nz * c) * k, yaw: ry + (n.rotY * Math.PI) / 180 }
}

