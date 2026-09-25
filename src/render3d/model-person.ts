import { AnimationMixer, BufferAttribute, BufferGeometry, CanvasTexture, Color, Group, Material, MeshStandardMaterial, SRGBColorSpace, SkinnedMesh, Vector3, type AnimationAction, type Bone, type Mesh, type Object3D, type Texture } from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { PEOPLE } from '../art3d/catalog.ts'
import { HAIR, OUTFIT, SKIN } from '../art/palette.ts'
import { IRIS, irisForSeed } from '../art/face.ts'
import { hairPalette } from '../art/hair.ts'
import { accessoryFor, outfitOf, paintFaceFrame, type Expr, type Role } from '../art/salon/people.ts'
import type { Look } from '../core/customers.ts'
import { lookFigure } from '../core/figure.ts'
import { makeRng } from '../core/rng.ts'
import { people, type PeopleFile } from './people-models.ts'
import type { Pose3, SeatKind3, Tool3 } from './person3d.ts'

/**
 * A modelled person on the floor (Helper B's bodies, src/art3d/catalog.ts PEOPLE): a clone of the body with its
 * look's parts shown (outfit, hair, accessory) and its colours from the same Look and outfit rules as the 2D floor
 * and the close-up. The visible parts are merged into four skinned meshes on the body's skeleton (textured skin,
 * hair and brows, eyes, and every flat-coloured piece with its colour baked into vertex colours), drawn with four
 * materials shared by everyone: about four draw calls a person. B's clips play through a mixer with soft crossfades.
 * Same fields and methods as the stand-in (person3d.ts), so the floor drives either.
 */
type Group4 = 'skin' | 'hair' | 'eyes' | 'flat' | 'face'

const SHARED: Record<Group4, MeshStandardMaterial> = {
  skin: new MeshStandardMaterial({ vertexColors: true, roughness: 0.62 }),
  hair: new MeshStandardMaterial({ vertexColors: true, roughness: 0.5 }),
  eyes: new MeshStandardMaterial({ vertexColors: true, roughness: 0.18 }),
  flat: new MeshStandardMaterial({ vertexColors: true, roughness: 0.66 }),
  // Never drawn: each person's face has its own material with their painted face (faceMat).
  face: new MeshStandardMaterial({ roughness: 0.6 }),
}
let texturesSet = false

const rgbHex = (c: readonly number[]) => (Math.round(c[0]) << 16) | (Math.round(c[1]) << 8) | Math.round(c[2])

export class ModelPerson {
  readonly root = new Group()
  private inner: Object3D
  private meshes: SkinnedMesh[] = []
  private groups: Group4[] = []
  private mixer: AnimationMixer
  private actions = new Map<string, AnimationAction>()
  private current: AnimationAction | null = null
  private oneShot: { action: AnimationAction; left: number } | null = null
  private head: Bone | null = null
  private walkSpeed: number
  private fadeMats: MeshStandardMaterial[] | null = null
  private y = 0
  pose: Pose3 = 'stand'
  seat: SeatKind3 = 'sofa'
  seatY = 0.5
  speed = 0
  tool: Tool3 = null
  private expr: Expr = 'smile'
  private shown: Expr = 'smile'
  private faceCanvas!: HTMLCanvasElement
  private faceTex!: CanvasTexture
  private faceMat!: MeshStandardMaterial
  private paintFace!: (e: Expr) => void
  private blinkIn = 3
  private idleT = 4
  private blinkT = 0

  constructor(file: PeopleFile, kind: 'fem' | 'masc', look: Look, role: Role, tint: number, archetype?: string, seed?: number) {
    this.walkSpeed = PEOPLE.walkSpeed[kind]
    const scene = cloneSkinned(file.scene)
    const fig = lookFigure(look)
    const outfit = outfitOf(look, fig, role, tint, archetype)
    const outfitKind = role === 'player' ? 'player' : outfit.kind
    const style = PEOPLE.hair[((look.hairStyle % 7) + 7) % 7]
    const acc = accessoryFor(look, archetype)
    const accPart = acc === 1 && !fig.masc ? `bow_${style}` : acc === 2 ? 'glasses' : acc === 3 ? `flower_${style}` : ''
    const show = new Set([`head_${kind}`, `outfit_${(PEOPLE.outfits[kind] as readonly string[]).includes(outfitKind) ? outfitKind : 'jumper'}`, `hair_${style}`, accPart].filter(Boolean))
    // Colours from the Look (catalog.ts PEOPLE.tints and outfitTints).
    const hair = hairPalette(HAIR[look.hair % HAIR.length], fig)
    const iris = seed !== undefined ? irisForSeed(seed) : IRIS[makeRng(look.skin * 31 + look.hair * 7 + look.outfit).int(0, IRIS.length - 1)]
    const lighter = (c: readonly number[]) => c.map(v => v + (255 - v) * 0.35)
    const pick = (ref: string): number => {
      if (ref.startsWith('#')) return parseInt(ref.slice(1), 16)
      if (ref === 'main') return rgbHex(outfit.main)
      if (ref === 'main+') return rgbHex(lighter(outfit.main))
      if (ref === 'second') return rgbHex(outfit.second)
      if (ref === 'pants') return rgbHex(outfit.pants)
      if (ref === 'shoes') return rgbHex(outfit.shoes)
      return 0xffffff
    }
    const outfitTints = (PEOPLE.outfitTints as Record<string, Record<string, string>>)[outfitKind] ?? {}
    const colourOf = (mat: string, base: Color): { group: Group4; color: Color } | null => {
      if (mat === 'Skin') return { group: 'skin', color: new Color(rgbHex(SKIN[look.skin % SKIN.length].base)) }
      if (mat === 'Face') return { group: 'face', color: new Color(0xffffff) }
      if (mat === 'Hair') return { group: 'hair', color: new Color(rgbHex(hair.base)) }
      if (mat === 'Brows') return { group: 'hair', color: new Color(rgbHex(hair.dark)) }
      if (mat === 'Eyes') return { group: 'eyes', color: new Color(rgbHex(iris)) }
      if (mat === 'EyeWhite') return { group: 'eyes', color: new Color(0xffffff) }
      if (mat === 'Lens') return null
      if (mat === 'Accessory') return { group: 'flat', color: new Color(OUTFIT[(look.outfit + 5) % OUTFIT.length]) }
      if (outfitTints[mat]) return { group: 'flat', color: new Color(pick(outfitTints[mat])) }
      return { group: 'flat', color: base.clone() }
    }
    // Gather the visible parts' meshes, sorted into the four groups.
    const parts: Record<Group4, BufferGeometry[]> = { skin: [], hair: [], eyes: [], flat: [], face: [] }
    let skinned: SkinnedMesh | null = null
    const texture: Partial<Record<Group4, Texture>> = {}
    const shown = (o: Object3D): boolean => { for (let p: Object3D | null = o; p && p !== scene; p = p.parent) if (show.has(p.name)) return true; return false }
    scene.traverse(o => {
      const m = o as SkinnedMesh
      if (!m.isSkinnedMesh) return
      const mat = m.material as MeshStandardMaterial
      if (!shown(m)) return
      const c = colourOf(mat.name, mat.color)
      if (!c) return
      skinned ??= m
      if (mat.map && !texture[c.group]) texture[c.group] = mat.map
      parts[c.group].push(floatGeometry(m.geometry, c.color, c.group !== 'flat'))
    })
    if (!texturesSet) {
      texturesSet = true
      for (const g of ['skin', 'hair', 'eyes'] as const) if (texture[g]) { SHARED[g].map = texture[g]!; SHARED[g].needsUpdate = true }
    }
    // The body's own meshes go; the merged ones take their place on the same skeleton.
    const drop: Object3D[] = []
    scene.traverse(o => { if ((o as Mesh).isMesh) drop.push(o) })
    const base = skinned as SkinnedMesh | null
    // The painted face: this person's own canvas, repainted for blinks and expressions.
    this.faceCanvas = document.createElement('canvas')
    this.faceCanvas.width = this.faceCanvas.height = PEOPLE.faces.frame.size
    this.faceTex = new CanvasTexture(this.faceCanvas)
    this.faceTex.flipY = false
    this.faceTex.colorSpace = SRGBColorSpace
    this.faceMat = new MeshStandardMaterial({ map: this.faceTex, roughness: 0.6 })
    this.paintFace = (e: Expr) => { const ctx = this.faceCanvas.getContext('2d')!; paintFaceFrame(ctx, PEOPLE.faces.frame.size, PEOPLE.faces.frame, look, e, archetype, seed); this.faceTex.needsUpdate = true }
    this.paintFace('smile')
    this.blinkIn = 2 + Math.random() * 3
    for (const g of ['skin', 'hair', 'eyes', 'flat', 'face'] as const) {
      if (!parts[g].length || !base) continue
      const geo = mergeGeometries(parts[g], false)
      for (const p of parts[g]) p.dispose()
      if (!geo) continue
      const mesh = new SkinnedMesh(geo, g === 'face' ? this.faceMat : SHARED[g])
      mesh.bind(base.skeleton, base.bindMatrix)
      mesh.castShadow = g !== 'eyes'
      mesh.frustumCulled = false
      base.parent!.add(mesh)
      this.meshes.push(mesh)
      this.groups.push(g)
    }
    for (const o of drop) o.removeFromParent()
    this.inner = scene
    this.root.add(scene)
    scene.traverse(o => { if ((o as Bone).isBone && o.name === 'Head') this.head = o as Bone })
    this.mixer = new AnimationMixer(scene)
    for (const clip of file.clips) this.actions.set(clip.name, this.mixer.clipAction(clip))
    this.play('idle', 0)
  }

  private play(name: string, fade = 0.25) {
    const next = this.actions.get(name)
    if (!next || next === this.current) return
    next.reset().setEffectiveWeight(1).play()
    if (this.current && fade > 0) next.crossFadeFrom(this.current, fade, false)
    else if (this.current) this.current.stop()
    this.current = next
  }

  setExpr(e: Expr) { this.expr = e }
  /** A hop of joy (the cheer clip, once). */
  jump() { this.once('cheer') }
  /** A wave (once). */
  greet() { this.once('wave') }

  private once(name: string) {
    const a = this.actions.get(name)
    if (!a || this.pose === 'sit') return
    a.reset().setEffectiveWeight(1).play()
    if (this.current) a.crossFadeFrom(this.current, 0.15, false)
    this.oneShot = { action: a, left: (PEOPLE.clipSeconds as Record<string, number>)[name] ?? 1 }
  }

  set opacity(a: number) {
    if (a >= 0.995) { if (this.fadeMats) { this.meshes.forEach((m, i) => { m.material = this.groups[i] === 'face' ? this.faceMat : SHARED[this.groups[i]]; m.castShadow = this.groups[i] !== 'eyes' }); for (const f of this.fadeMats) f.dispose(); this.fadeMats = null } return }
    if (!this.fadeMats) {
      this.fadeMats = this.meshes.map(m => { const c = (m.material as MeshStandardMaterial).clone(); c.transparent = true; return c })
      this.meshes.forEach((m, i) => { m.material = this.fadeMats![i] })
    }
    for (const m of this.fadeMats) m.opacity = Math.max(0, a)
    for (const m of this.meshes) m.castShadow = a > 0.6
  }

  /** The top of the head in the world (for what floats above it). */
  headTop(out: Vector3): Vector3 {
    if (!this.head) return out.copy(this.root.position).setY(2)
    this.head.updateWorldMatrix(true, false)
    return out.setFromMatrixPosition(this.head.matrixWorld).add(_up)
  }

  update(dt: number) {
    // Which clip: seated ones by seat (sleepy while dozing), walking, working, or idle.
    const sit = this.pose === 'sit'
    // Standing about, people fidget: a word or a look round now and then.
    if (!sit && this.pose === 'stand' && this.speed < 0.05 && !this.oneShot) { this.idleT -= dt; if (this.idleT <= 0) { this.idleT = 5 + Math.random() * 7; this.once('talk') } }
    else this.idleT = 3 + Math.random() * 5
    const clip = sit ? (this.expr === 'sleepy' && this.seat !== 'chair' ? 'sleepy' : this.seat === 'chair' ? 'sit_chair' : this.seat === 'pedicure' ? 'sit_pedicure' : this.seat === 'stool' ? 'sit_stool' : 'sit_sofa') : this.pose === 'walk' ? 'walk' : this.pose === 'work' ? 'work' : 'idle'
    if (this.oneShot && !sit) {
      this.oneShot.left -= dt
      if (this.oneShot.left <= 0) { const a = this.oneShot.action; this.oneShot = null; this.current = a; this.play(clip, 0.2) }
    } else { this.oneShot = null; this.play(clip) }
    const walk = this.actions.get('walk')
    if (walk) walk.timeScale = Math.max(0.6, Math.min(2.6, this.speed / this.walkSpeed))
    // Seated clips put the hips on the origin: lift the body to the seat's hip height.
    this.y += ((sit ? this.seatY : 0) - this.y) * Math.min(1, dt * 10)
    this.inner.position.y = this.y
    this.mixer.update(dt)
    // The face: the current expression, with a blink now and then (not while asleep).
    this.blinkIn -= dt
    if (this.blinkIn <= 0 && this.expr !== 'sleepy') { this.blinkT = 0.14; this.blinkIn = 2.5 + Math.random() * 3.5 }
    if (this.blinkT > 0) this.blinkT -= dt
    const want: Expr = this.blinkT > 0 ? 'blink' : this.expr === 'meh' || this.expr === 'neutral' ? 'smile' : this.expr
    if (want !== this.shown) { this.shown = want; this.paintFace(want) }
  }

  destroy() {
    for (const m of this.meshes) m.geometry.dispose()
    this.faceTex.dispose()
    this.faceMat.dispose()
    for (const m of this.fadeMats ?? []) (m as Material).dispose()
    this.mixer.stopAllAction()
    this.root.removeFromParent()
  }
}

const _up = new Vector3(0, 0.56, 0)

/**
 * A mesh's geometry as plain floats with a colour per vertex (the tint, times the baked occlusion when it has
 * some), ready to merge with others on the same skeleton. Quantized positions keep their raw values: the skeleton's
 * inverse bind matrices dequantize them. `uv`: keep texture coordinates (the textured groups).
 */
function floatGeometry(src: BufferGeometry, tint: Color, uv: boolean): BufferGeometry {
  const g = new BufferGeometry()
  const n = src.getAttribute('position').count
  const copy = (name: string, size: number, Arr: Float32ArrayConstructor | Uint16ArrayConstructor = Float32Array) => {
    const a = src.getAttribute(name)
    const out = new Arr(n * size)
    for (let i = 0; i < n; i++) for (let k = 0; k < size; k++) out[i * size + k] = a ? a.getComponent(i, k) : 0
    return out
  }
  g.setAttribute('position', new BufferAttribute(copy('position', 3), 3))
  g.setAttribute('normal', new BufferAttribute(copy('normal', 3), 3))
  if (uv) g.setAttribute('uv', new BufferAttribute(copy('uv', 2), 2))
  g.setAttribute('skinIndex', new BufferAttribute(copy('skinIndex', 4, Uint16Array), 4))
  g.setAttribute('skinWeight', new BufferAttribute(copy('skinWeight', 4), 4))
  const ao = src.getAttribute('color')
  const col = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    const k = ao ? ao.getX(i) : 1
    col[i * 3] = tint.r * k; col[i * 3 + 1] = tint.g * (ao ? ao.getY(i) : 1); col[i * 3 + 2] = tint.b * (ao ? ao.getZ(i) : 1)
  }
  g.setAttribute('color', new BufferAttribute(col, 3))
  if (src.index) g.setIndex(Array.from(src.index.array as ArrayLike<number>))
  return g
}

/** A modelled person if the models have loaded (else null: the caller keeps the stand-in). */
export function modelPerson(look: Look, role: Role, tint = 0xe7799c, archetype?: string, seed?: number): ModelPerson | null {
  const files = people()
  if (!files) return null
  const kind = lookFigure(look).masc ? 'masc' : 'fem'
  return new ModelPerson(files[kind], kind, look, role, tint, archetype, seed)
}
