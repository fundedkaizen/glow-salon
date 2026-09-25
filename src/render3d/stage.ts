import type { Application, WebGLRenderer as PixiGL } from 'pixi.js'
import { ACESFilmicToneMapping, AgXToneMapping, EquirectangularReflectionMapping, NeutralToneMapping, PCFShadowMap, PMREMGenerator, SRGBColorSpace, WebGLRenderer, WebGLRenderTarget, type Camera, type Scene, type Texture } from 'three'
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js'
import { TEX } from './textures.ts'

/**
 * The one three.js renderer, drawing into Pixi's own canvas and WebGL2 context (the pattern Pixi documents for
 * mixing the two): three draws the 3D salon first, then Pixi draws its overlays (bubbles, tags, prompts) on top
 * without clearing. One canvas, one context and one MSAA buffer; the close-ups keep using Pixi alone.
 * Shared by every 3D floor (the title backdrop, then the game), so the context is never created twice.
 */
export type Quality = 'high' | 'low'

export class Stage {
  readonly renderer: WebGLRenderer
  readonly quality: Quality
  private pixi: PixiGL
  private env: Texture | null = null
  private envWaiters: ((t: Texture) => void)[] = []
  /** Draw calls and triangles of the last 3D frame (three's own count, shadow passes included). */
  lastCalls = 0
  lastTris = 0

  constructor(app: Application) {
    const r = app.renderer as PixiGL
    const gl = (r as { gl?: WebGL2RenderingContext }).gl
    if (!gl || typeof WebGL2RenderingContext === 'undefined' || !(gl instanceof WebGL2RenderingContext)) throw new Error('The 3D salon needs WebGL2')
    this.pixi = r
    this.renderer = new WebGLRenderer({ canvas: app.canvas, context: gl, antialias: true })
    this.renderer.setPixelRatio(1)
    this.renderer.outputColorSpace = SRGBColorSpace
    const tm = new URLSearchParams(location.search).get('tm')
    this.renderer.toneMapping = tm === 'agx' ? AgXToneMapping : tm === 'aces' ? ACESFilmicToneMapping : NeutralToneMapping
    this.renderer.toneMappingExposure = Number(new URLSearchParams(location.search).get('exp') ?? 1)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = PCFShadowMap
    this.renderer.info.autoReset = true
    TEX.maxAniso = this.renderer.capabilities.getMaxAnisotropy()
    // Small screens and weak GPUs: smaller shadow maps and fewer lights.
    const small = Math.min(window.innerWidth, window.innerHeight) < 600
    const cores = navigator.hardwareConcurrency ?? 8
    this.quality = new URLSearchParams(location.search).get('q3d') === 'low' || (small && cores <= 4) ? 'low' : 'high'
    this.loadEnv()
  }

  /** The studio HDRI (Poly Haven, CC0), prefiltered for the gold and gloss. */
  private loadEnv() {
    const url = `${import.meta.env.BASE_URL}env/studio_512.hdr`
    new HDRLoader().load(url, hdr => {
      hdr.mapping = EquirectangularReflectionMapping
      const pmrem = new PMREMGenerator(this.renderer)
      this.renderer.resetState()
      this.env = pmrem.fromEquirectangular(hdr).texture
      pmrem.dispose()
      hdr.dispose()
      this.pixi.resetState()
      for (const w of this.envWaiters) w(this.env)
      this.envWaiters = []
    }, undefined, () => { /* no env map: the lights alone still work */ })
  }

  onEnv(cb: (t: Texture) => void) { if (this.env) cb(this.env); else this.envWaiters.push(cb) }

  /** Draw the 3D scene into the whole canvas; Pixi then draws on top of it this frame. */
  render(scene: Scene, camera: Camera) {
    const canvas = this.renderer.domElement
    this.renderer.resetState()
    this.renderer.setViewport(0, 0, canvas.width, canvas.height)
    this.renderer.render(scene, camera)
    this.lastCalls = this.renderer.info.render.calls
    this.lastTris = this.renderer.info.render.triangles
    this.pixi.resetState()
    this.pixi.background.clearBeforeRender = false
  }

  /** Render a small picture offscreen (the style cards' thumbnails) into a 2D canvas. */
  snapshot(scene: Scene, camera: Camera, w: number, h: number): HTMLCanvasElement {
    const rt = new WebGLRenderTarget(w, h, { samples: 4, colorSpace: SRGBColorSpace })
    const r = this.renderer
    r.resetState()
    const shadows = r.shadowMap.enabled
    r.shadowMap.enabled = false
    r.setRenderTarget(rt)
    r.setViewport(0, 0, w, h)
    r.setClearColor(0x000000, 0)
    r.clear()
    r.render(scene, camera)
    const px = new Uint8Array(w * h * 4)
    r.readRenderTargetPixels(rt, 0, 0, w, h, px)
    r.setRenderTarget(null)
    r.shadowMap.enabled = shadows
    rt.dispose()
    this.pixi.resetState()
    const c = document.createElement('canvas')
    c.width = w; c.height = h
    const ctx = c.getContext('2d')!
    const img = ctx.createImageData(w, h)
    // WebGL rows run bottom to top.
    for (let y = 0; y < h; y++) img.data.set(px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4)
    ctx.putImageData(img, 0, 0)
    return c
  }

  /** No 3D this frame (a close-up is open): Pixi clears the canvas itself again. */
  idle() { this.pixi.background.clearBeforeRender = true }

  /** Pixels on screen per CSS pixel (the canvas is drawn at the device's resolution, capped at 2). */
  get resolution() { return this.pixi.resolution }
}

let shared: Stage | null = null

export function stageFor(app: Application): Stage {
  if (!shared) shared = new Stage(app)
  return shared
}
