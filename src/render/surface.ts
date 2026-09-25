import { Container, Graphics, RenderTexture, Sprite, Texture, type Geometry, type Mesh, type Renderer, type Shader } from 'pixi.js'
import { GRID } from '../core/treatments/grid.ts'
import { canvas } from '../art/paint.ts'
import { gridGeometry, layerMesh, skinMesh } from './shaders.ts'

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
  /** Animated fill (1) or clear (0) in progress; a fill stays inside `mask` (the session's coverage) when given. */
  resolving: { to: 0 | 1; t: number; mask?: Texture } | null
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
  /** Greyscale height (form and pores); the skin shader lights it. */
  height: Texture
  bump?: number
  sss: [number, number, number]
  /** A layer's art, or a painter for it (lazy) that the surface calls when the layer is first needed. */
  layers: Record<string, { art?: Texture; art2?: Texture; lazy?: () => { art: Texture; art2?: Texture }; style: LayerStyle }>
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
  private art: SurfaceArt
  /** A bendable sheet (set when the surface is made with a grid): see deform(). */
  private grid: ReturnType<typeof gridGeometry> | null = null
  constructor(renderer: Renderer, art: SurfaceArt, flipMask = 0, grid = 0) {
    this.renderer = renderer
    this.art = art
    this.wet = RenderTexture.create({ width: MASK_SIZE, height: MASK_SIZE })
    if (grid > 0) this.grid = gridGeometry(grid)
    const geometry = this.grid?.geometry
    this.skin = skinMesh(art.base, art.height, this.wet.source, art.sss, flipMask, art.bump, geometry)
    this.fineBump = this.skin.uniforms.uniforms.uBump[1]
    this.root.addChild(this.skin.mesh)
    for (const id of art.order) {
      const def = art.layers[id]
      if (!def) continue
      const rt = RenderTexture.create({ width: MASK_SIZE, height: MASK_SIZE })
      const art0 = def.art ?? Texture.EMPTY
      const { mesh, uniforms } = layerMesh(art0, def.art2 ?? art0, rt.source, def.style, MASK_SIZE, flipMask, geometry)
      mesh.visible = false
      this.root.addChild(mesh)
      this.layers.set(id, { id, mesh, rt, uniforms, style: def.style, pending: [], resolving: null, hasPaint: false })
    }
    this.stampSprite = new Sprite(Texture.WHITE)
  }

  /** Paint a lazy layer's art now (its first stamp, or a quiet frame) and bind it. */
  ensure(id: string) {
    const def = this.art.layers[id], layer = this.layers.get(id)
    if (!def?.lazy || !layer) return
    const made = def.lazy()
    def.lazy = undefined
    def.art = made.art
    def.art2 = made.art2
    const res = layer.mesh.shader!.resources as Record<string, unknown>
    res.uArt = made.art.source
    res.uArt2 = (made.art2 ?? made.art).source
  }

  /**
   * Bend the sheet (surfaces made with a grid only): every vertex moves by `offset` of its rest position, in art
   * space. The skin, the layers and their masks all move together, since they share the sheet.
   */
  deform(offset: (x: number, y: number) => [number, number]) {
    const g = this.grid
    if (!g) return
    for (let k = 0; k < g.rest.length; k += 2) {
      const [dx, dy] = offset(g.rest[k], g.rest[k + 1])
      g.positions[k] = g.rest[k] + dx; g.positions[k + 1] = g.rest[k + 1] + dy
    }
    const buf = g.geometry.getBuffer('aPosition')
    buf.data = g.positions
    buf.update()
  }

  /** Show a layer with other art (a step's own look for it), or its own art again with null. */
  setLayerArt(id: string, art: Texture | null) {
    const def = this.art.layers[id], layer = this.layers.get(id)
    if (!def || !layer) return
    this.ensure(id)
    const res = layer.mesh.shader!.resources as Record<string, unknown>
    const use = art ?? def.art ?? Texture.EMPTY
    res.uArt = use.source
    res.uArt2 = (art ? art : def.art2 ?? use).source
  }

  /** Paint the next lazy layer, if any (one per call, to spread the work over frames). */
  warmOne() {
    for (const id of this.layers.keys()) if (this.art.layers[id]?.lazy) { this.ensure(id); return true }
    return false
  }

  /** Start a layer from the session's coverage grid (seeded grime, a resumed treatment...). */
  initFromGrid(id: string, grid: Float32Array, crisp = false) {
    const layer = this.layers.get(id) ?? (id === '$wet' ? null : null)
    const target = id === '$wet' ? this.wet : layer?.rt
    if (!target) return
    const { tex, any } = gridTexture(grid, crisp)
    const sprite = new Sprite(tex)
    this.renderer.render({ container: sprite, target, clear: true })
    tex.destroy(true)
    if (layer) { if (any) this.ensure(id); layer.hasPaint = any; layer.mesh.visible = any }
  }

  /**
   * Settle a layer: fade it fully in (1) or out (0). A fill given the session's coverage grid stays inside it (the
   * step's region), so a finished mask never spills into the corners of the sheet.
   */
  resolve(id: string, to: 0 | 1, grid?: Float32Array) {
    const layer = this.layers.get(id)
    if (!layer) return
    layer.resolving?.mask?.destroy(true)
    layer.resolving = { to, t: 0, mask: to === 1 && grid ? gridTexture(grid, false).tex : undefined }
    if (to === 1) { this.ensure(id); layer.hasPaint = true; layer.mesh.visible = true }
  }

  /** Queue a brush stamp in art space: amount > 0 paints, < 0 erases. */
  stamp(id: string, x: number, y: number, r: number, amount: number) {
    if (id === '$wet') { this.wetPending.push({ x, y, r, a: amount }); return }
    const layer = this.layers.get(id)
    if (!layer) return
    layer.pending.push({ x, y, r, a: amount })
    if (amount > 0) { this.ensure(id); layer.hasPaint = true; layer.mesh.visible = true }
  }

  /** Remove a layer below a line (the peel). */
  clearBelow(id: string, y: number, curve: (x: number) => number = () => 0) {
    const layer = this.layers.get(id)
    if (!layer) return
    const g = this.eraser
    g.clear()
    g.moveTo(0, MASK_SIZE + 4)
    for (let x = 0; x <= 1024; x += 8) g.lineTo(x * K, (y + curve(x)) * K)
    g.lineTo(MASK_SIZE, MASK_SIZE + 4)
    g.closePath()
    g.fill({ color: 0xffffff })
    g.blendMode = 'erase'
    const holder = this.stampBatch
    holder.removeChildren()
    holder.addChild(g)
    this.renderer.render({ container: holder, target: layer.rt, clear: false })
    holder.removeChildren()
  }
  private eraser = new Graphics()

  /** Put a container (the targets) between the layers, just under `id`. */
  insertBelow(id: string, child: Container) {
    const layer = this.layers.get(id)
    const index = layer ? this.root.getChildIndex(layer.mesh) : this.root.children.length
    this.root.addChildAt(child, index)
  }

  /**
   * Render one sprite into a render texture. It goes inside a container because Pixi renders a root
   * container without its own position, so a lone sprite would ignore where it was placed.
   */
  private renderOne(sprite: Sprite, target: RenderTexture) {
    const holder = this.stampBatch
    holder.removeChildren()
    holder.addChild(sprite)
    this.renderer.render({ container: holder, target, clear: false })
    holder.removeChildren()
  }

  private fineBump = 1
  /**
   * How many screen pixels one texel of the height map covers (the camera's zoom times the pixel ratio). The fine
   * pore normals are sampled a texel apart, so when the sheet is magnified their bilinear steps would show as a
   * woven grain: their strength eases off as the texels grow.
   */
  setZoomDetail(pxPerTexel: number) { this.skin.uniforms.uniforms.uBump[1] = this.fineBump / Math.max(1, pxPerTexel) }

  /** Dry the skin at once (before the reveal photo). */
  dryAll() { this.renderer.render({ container: new Container(), target: this.wet, clear: true }); this.wetPending.length = 0 }

  /** Move the key light (the skin and every layer), for the breathing sway of the highlights. */
  setLight(x: number, y: number, z: number) {
    const set = (u: Float32Array) => { u[0] = x; u[1] = y; u[2] = z }
    set(this.skin.uniforms.uniforms.uLight)
    for (const l of this.layers.values()) set(l.uniforms.uniforms.uLight)
  }

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
        s.texture = res.mask ?? Texture.WHITE
        s.anchor.set(0)
        s.position.set(0, 0)
        s.width = s.height = MASK_SIZE
        s.alpha = Math.min(1, dt * 7)
        s.blendMode = res.to === 0 ? 'erase' : 'normal'
        this.renderOne(s, layer.rt)
        s.blendMode = 'normal'
        if (res.t > 0.7) {
          if (res.to === 0) { this.renderer.render({ container: new Container(), target: layer.rt, clear: true }); layer.hasPaint = false; layer.mesh.visible = false }
          s.texture = Texture.WHITE
          res.mask?.destroy(true)
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
      this.renderOne(s, this.wet)
      s.blendMode = 'normal'
      this.dryTimer = 0
    }
    this.skin.uniforms.uniforms.uSkin[2] = this.time
  }

  destroy() {
    // Shaders first: they hold the textures, and freeing a texture a shader still holds warns.
    this.skin.mesh.shader?.destroy()
    this.grid?.geometry.destroy()
    for (const layer of this.layers.values()) layer.mesh.shader?.destroy()
    for (const layer of this.layers.values()) layer.rt.destroy(true)
    this.wet.destroy(true)
    this.root.destroy({ children: true })
  }
}

/** A coverage grid as a soft (or, for whole shapes, crisp-edged) mask texture at the mask's size. */
function gridTexture(grid: Float32Array, crisp: boolean) {
  const [c, ctx] = canvas(GRID)
  const img = ctx.createImageData(GRID, GRID)
  let any = false
  for (let i = 0; i < grid.length; i++) {
    const v = Math.round(grid[i] * 255)
    if (v > 0) any = true
    img.data[i * 4] = 255; img.data[i * 4 + 1] = 255; img.data[i * 4 + 2] = 255; img.data[i * 4 + 3] = v
  }
  ctx.putImageData(img, 0, 0)
  // Upscale smoothly (the mask is soft anyway).
  const [big, bctx] = canvas(MASK_SIZE)
  bctx.imageSmoothingEnabled = true
  bctx.imageSmoothingQuality = 'high'
  bctx.filter = 'blur(3px)'
  bctx.drawImage(c, 0, 0, MASK_SIZE, MASK_SIZE)
  // Layers that fill whole shapes (old polish, cuticles) get crisp edges instead of a soft grid blur.
  if (crisp) {
    const img2 = bctx.getImageData(0, 0, MASK_SIZE, MASK_SIZE)
    const d = img2.data
    for (let i = 3; i < d.length; i += 4) { const a = d[i] / 255; const t = Math.max(0, Math.min(1, (a - 0.3) / 0.35)); d[i] = Math.round(t * t * (3 - 2 * t) * 255) }
    bctx.putImageData(img2, 0, 0)
  }
  return { tex: Texture.from(big), any }
}
