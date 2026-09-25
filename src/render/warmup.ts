import { Container, RenderTexture, Sprite, Texture, type Renderer } from 'pixi.js'
import { warmFacialBackdrop } from '../art/assets.ts'
import { layerMesh, skinMesh } from './shaders.ts'
import { bits } from '../art/bits.ts'
import { toolArt } from '../art/tools.ts'
import { TREATMENTS } from '../core/treatments/registry.ts'

/**
 * Warm the close-ups while the title screen is up, so the first treatment opens fast: paint the shared facial
 * backdrop and upload it, compile the skin and layer shaders by drawing each once into a tiny texture, and
 * paint the shared sprites (bits) and every tool with its tray icon. Runs in idle time, one piece per idle
 * slot, and only once per page.
 */
let started = false
export function warmCloseUps(renderer: Renderer) {
  if (started) return
  started = true
  const idle = (fn: () => void) => {
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback
    if (ric) ric(fn, { timeout: 1500 }); else setTimeout(fn, 60)
  }
  const target = RenderTexture.create({ width: 8, height: 8 })
  const draw = (c: Container) => renderer.render({ container: c, target, clear: true })
  const steps: (() => void)[] = [
    // The GPU upload of the painted backdrop is what costs, so draw it once too.
    () => { const holder = new Container(); holder.addChild(new Sprite(warmFacialBackdrop())); draw(holder); holder.destroy({ children: true }) },
    () => {
      const skin = skinMesh(Texture.WHITE, Texture.WHITE, Texture.WHITE.source, [1, 0.3, 0.3], 0)
      const layer = layerMesh(Texture.WHITE, Texture.WHITE, Texture.WHITE.source, { gloss: 0.5, relief: 1 }, 8, 0)
      const holder = new Container()
      holder.addChild(skin.mesh, layer.mesh)
      draw(holder)
      skin.mesh.shader?.destroy(); layer.mesh.shader?.destroy()
      holder.destroy({ children: true })
    },
    () => { for (const make of Object.values(bits)) make() },
    ...[...new Set(Object.values(TREATMENTS).flatMap(t => t.steps.map(s => s.tool)))].map(id => () => { toolArt(id) }),
    () => target.destroy(true),
  ]
  const next = () => { const s = steps.shift(); if (!s) return; s(); idle(next) }
  idle(next)
}
