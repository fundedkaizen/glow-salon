import { Container, RenderTexture, Sprite, Texture, type Geometry, type Mesh, type Renderer, type Shader } from 'pixi.js'
import { GRID } from '../core/treatments/grid.ts'
import { canvas } from '../art/paint.ts'
import { layerMesh, skinMesh } from './shaders.ts'

/**
 * A body part on screen: the lit skin at the bottom and one mesh per treatment layer above it, each
 * showing its art through a render-texture mask. Tools change the masks with soft brush stamps (painted or
 * erased), batched so each layer renders once per frame however many stamps arrived.
 */
export const MASK_SIZE = 512
const K = MASK_SIZE / 1024

export type LayerStyle = { gloss: number; relief: number; opacity?: number; brush?: 'soft' | 'paint' }

type Layer = {
  id: string
  mesh: Mesh<Geometry, Shader>
  rt: RenderTexture
  uniforms: ReturnType<typeof layerMesh>['uniforms']
  style: LayerStyle
  pending: { x: number; y: number; r: number; a: number }[]
  /** Animated fill (1) or clear (0) in progress. */
  resolving: { to: 0 | 1; t: number } | null
  hasPaint: boolean
}

let softBrush: Texture | null = null
let paintBrush: Texture | null = null
let solid: Texture | null = null

function brushes() {
  if (!softBrush) {
    const [c, ctx] = canvas(128)
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
    g.addColorStop(0, 'rgba(255,255,255,1)')
    g.addColorStop(0.45, 'rgba(255,255,255,0.9)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 128, 128)
    softBrush = Texture.from(c)
  }
  if (!paintBrush) {
    // A paint brush: a solid core with a feathered, slightly bristly edge.
    const [c, ctx] = canvas(128)
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
    g.addColorStop(0, 'rgba(255,255,255,1)')
    g.addColorStop(0.72, 'rgba(255,255,255,1)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 128, 128)
    ctx.globalCompositeOperation = 'destination-out'
    for (let i = 0; i < 90; i++) {
      const a = Math.random() * Math.PI * 2, d = 44 + Math.random() * 20
      ctx.fillStyle = `rgba(0,0,0,${0.3 + Math.random() * 0.5})`
      ctx.beginPath(); ctx.arc(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 2 + Math.random() * 4, 0, Math.PI * 2); ctx.fill()
    }
    paintBrush = Texture.from(c)
  }
  solid ??= Texture.WHITE
  return { soft: softBrush, paint: paintBrush, solid }
}

export type SurfaceArt = {
  base: Texture
  normal: Texture
  sss: [number, number, number]
  layers: Record<string, { art: Texture; art2?: Texture; style: LayerStyle }>
  /** Bottom to top. */
  order: string[]
}

export class Surface {
  readonly root = new Container()
  readonly layers = new Map<string, Layer>()
  readonly wet: RenderTexture
  readonly skin: ReturnType<typeof skinMesh>
  private stampSprite: Sprite
  private stampBatch = new Container()
  private pool: Sprite[] = []
  private wetPending: { x: number; y: number; r: number; a: number }[] = []
  private dryTimer = 0
  time = 0

  private renderer: Renderer
  constructor(renderer: Renderer, art: SurfaceArt, flipMask = 0) {
    this.renderer = renderer
    this.wet = RenderTexture.create({ width: MASK_SIZE, height: MASK_SIZE })
    this.skin = skinMesh(art.base, art.normal, this.wet.source, art.sss, flipMask)
    this.root.addChild(this.skin.mesh)
    for (const id of art.order) {
      const def = art.layers[id]
      if (!def) continue
      const rt = RenderTexture.create({ width: MASK_SIZE, height: MASK_SIZE })
      const { mesh, uniforms } = layerMesh(def.art, def.art2 ?? def.art, rt.source, def.style, MASK_SIZE, flipMask)
      mesh.visible = false
      this.root.addChild(mesh)
      this.layers.set(id, { id, mesh, rt, uniforms, style: def.style, pending: [], resolving: null, hasPaint: false })
    }
    this.stampSprite = new Sprite(Texture.WHITE)
  }

  /** Start a layer from the session's coverage grid (seeded grime, a resumed treatment...). */
  initFromGrid(id: string, grid: Float32Array) {
    const layer = this.layers.get(id) ?? (id === '$wet' ? null : null)
    const target = id === '$wet' ? this.wet : layer?.rt
    if (!target) return
    const [c, ctx] = canvas(GRID)
    const img = ctx.createImageData(GRID, GRID)
    let any = false
    for (let i = 0; i < grid.length; i++) {
      const v = Math.round(grid[i] * 255)
      if (v > 0) any = true
      img.data[i * 4] = 255; img.data[i * 4 + 1] = 255; img.data[i * 4 + 2] = 255; img.data[i * 4 + 3] = v
    }
    ctx.putImageData(img, 0, 0)
    // Upscale smoothly (the mask is soft anyway) into the render texture.
    const [big, bctx] = canvas(MASK_SIZE)
    bctx.imageSmoothingEnabled = true
    bctx.imageSmoothingQuality = 'high'
    bctx.filter = 'blur(3px)'
    bctx.drawImage(c, 0, 0, MASK_SIZE, MASK_SIZE)
    const tex = Texture.from(big)
    const sprite = new Sprite(tex)
    this.renderer.render({ container: sprite, target, clear: true })
    tex.destroy(true)
    if (layer) { layer.hasPaint = any; layer.mesh.visible = any }
  }

  /** Queue a brush stamp in art space: amount > 0 paints, < 0 erases. */
  stamp(id: string, x: number, y: number, r: number, amount: number) {
    if (id === '$wet') { this.wetPending.push({ x, y, r, a: amount }); return }
    const layer = this.layers.get(id)
    if (!layer) return
    layer.pending.push({ x, y, r, a: amount })
    if (amount > 0) { layer.hasPaint = true; layer.mesh.visible = true }
  }

  /** Settle a layer: fade it fully in (1) or out (0). */
  resolve(id: string, to: 0 | 1) {
    const layer = this.layers.get(id)
    if (!layer) return
    layer.resolving = { to, t: 0 }
    if (to === 1) { layer.hasPaint = true; layer.mesh.visible = true }
  }

  /** Remove a layer below a line (the peel). */
  clearBelow(id: string, y: number) {
    const layer = this.layers.get(id)
    if (!layer) return
    const s = this.stampSprite
    s.texture = Texture.WHITE
    s.anchor.set(0)
    s.position.set(0, y * K)
    s.width = MASK_SIZE
    s.height = Math.max(0, MASK_SIZE - y * K)
    s.alpha = 1
    s.blendMode = 'erase'
    this.renderer.render({ container: s, target: layer.rt, clear: false })
    s.blendMode = 'normal'
  }

  /** Put a container (the targets) between the layers, just under `id`. */
  insertBelow(id: string, child: Container) {
    const layer = this.layers.get(id)
    const index = layer ? this.root.getChildIndex(layer.mesh) : this.root.children.length
    this.root.addChildAt(child, index)
  }

  /** Dry the skin at once (before the reveal photo). */
  dryAll() { this.renderer.render({ container: new Container(), target: this.wet, clear: true }); this.wetPending.length = 0 }

  setLayerMix(id: string, mix: number) { const l = this.layers.get(id); if (l) l.uniforms.uniforms.uP[0] = mix }
  setLayerTint(id: string, color: number, amount = 1) {
    const l = this.layers.get(id)
    if (!l) return
    const t = l.uniforms.uniforms.uTint
    t[0] = ((color >> 16) & 255) / 255; t[1] = ((color >> 8) & 255) / 255; t[2] = (color & 255) / 255; t[3] = amount
  }
  setLayerOpacity(id: string, opacity: number) { const l = this.layers.get(id); if (l) l.uniforms.uniforms.uP[3] = opacity }
  setLayerGloss(id: string, gloss: number) { const l = this.layers.get(id); if (l) l.uniforms.uniforms.uP[1] = gloss }

  private flushStamps(target: RenderTexture, stamps: { x: number; y: number; r: number; a: number }[], brush: Texture) {
    if (!stamps.length) return
    const batch = this.stampBatch
    batch.removeChildren()
    let i = 0
    for (const st of stamps) {
      const s = (this.pool[i] ??= new Sprite())
      i++
      s.texture = brush
      s.anchor.set(0.5)
      s.position.set(st.x * K, st.y * K)
      s.width = s.height = st.r * 2 * K * 1.12
      s.alpha = Math.min(1, Math.abs(st.a) * 1.6)
      s.blendMode = st.a < 0 ? 'erase' : 'normal'
      batch.addChild(s)
    }
    this.renderer.render({ container: batch, target, clear: false })
    batch.removeChildren()
    stamps.length = 0
  }

  update(dt: number) {
    this.time += dt
    const b = brushes()
    for (const layer of this.layers.values()) {
      this.flushStamps(layer.rt, layer.pending, layer.style.brush === 'paint' ? b.paint : b.soft)
      if (layer.resolving) {
        const res = layer.resolving
        res.t += dt
        const s = this.stampSprite
        s.texture = Texture.WHITE
        s.anchor.set(0)
        s.position.set(0, 0)
        s.width = s.height = MASK_SIZE
        s.alpha = Math.min(1, dt * 7)
        s.blendMode = res.to === 0 ? 'erase' : 'normal'
        this.renderer.render({ container: s, target: layer.rt, clear: false })
        s.blendMode = 'normal'
        if (res.t > 0.7) {
          if (res.to === 0) { this.renderer.render({ container: new Container(), target: layer.rt, clear: true }); layer.hasPaint = false; layer.mesh.visible = false }
          layer.resolving = null
        }
      }
    }
    this.flushStamps(this.wet, this.wetPending, b.soft)
    // The skin dries slowly.
    this.dryTimer += dt
    if (this.dryTimer > 0.1) {
      const s = this.stampSprite
      s.texture = Texture.WHITE
      s.anchor.set(0)
      s.position.set(0, 0)
      s.width = s.height = MASK_SIZE
      s.alpha = this.dryTimer * 0.045
      s.blendMode = 'erase'
      this.renderer.render({ container: s, target: this.wet, clear: false })
      s.blendMode = 'normal'
      this.dryTimer = 0
    }
    this.skin.uniforms.uniforms.uSkin[2] = this.time
  }

  destroy() {
    for (const layer of this.layers.values()) layer.rt.destroy(true)
    this.wet.destroy(true)
    this.root.destroy({ children: true })
  }
}
