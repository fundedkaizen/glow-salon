import { Container, Graphics, Sprite, Text, type Application } from 'pixi.js'
import type { Look } from '../core/customers.ts'
import { footProfileLevel, toeNail, type FootProfile, type FootView } from '../core/foot.ts'
import type { Region, Shape } from '../core/geometry.ts'
import { POLISH_COLORS } from '../core/treatments/types.ts'
import { footAssetsFor, type FootAssets } from '../art/assets.ts'
import { BACKDROP, BACKDROP_OFFSET } from '../art/backdrop.ts'
import { FOOT_LAYERS } from '../art/foot.ts'
import { Surface } from './surface.ts'

/**
 * A dev view of the pedicure art (`?view=feet`): the foot on its towel, lit by the skin shader, with its
 * condition layers laid on in full. The steps are not wired yet, so this is the only place to see it.
 *
 *   &side=top|sole   which view (top: toes and nails; sole: heel, ball, arch)
 *   &sev=0..3        severity: 0 clean, 1 mild, 2 bad, 3 disaster (default 2)
 *   &layers=a,b      exactly these layers, full (default: the conditions this customer has)
 *   &after           the finished foot: clean, nails painted (&polish=N picks the colour)
 *   &pins            debug pins: every anatomy region outlined and labelled, the toe axes and nails
 *   &seed, &skin     as for the other close-ups
 *
 * `window.__foot` holds { assets, profile, buildMs, firstFrameMs } for checks.
 */
export function footPreview(app: Application, look: Look, params: URLSearchParams) {
  const seed = Number(params.get('seed') ?? 7)
  const view: FootView = params.get('side') === 'sole' ? 'sole' : 'top'
  const after = params.has('after')
  const sev = (after ? 0 : Math.max(0, Math.min(3, Number(params.get('sev') ?? 2)))) as 0 | 1 | 2 | 3
  const profile = footProfileLevel(seed, sev)
  const t0 = performance.now()
  const assets = footAssetsFor(look, seed, profile, view)
  const buildMs = Math.round(performance.now() - t0)
  const surface = new Surface(app.renderer, assets.surface, 0)
  const world = new Container()
  const backdrop = new Sprite(assets.backdrop)
  backdrop.position.set(-BACKDROP_OFFSET, -BACKDROP_OFFSET)
  backdrop.scale.set(BACKDROP / assets.backdrop.width)
  const spots = new Container()
  world.addChild(backdrop, surface.root, spots)
  app.stage.addChild(world)

  const want = params.get('layers')?.split(',').filter(Boolean) ?? (after ? ['color', 'top'] : conditionLayers(profile, view))
  for (const id of want) surface.resolve(id, 1)
  // After the treatment the skin is moisturised: a soft dewy sheen.
  if (after) surface.skin.uniforms.uniforms.uSkin[3] = 0.9
  if (after) surface.setLayerTint('color', POLISH_COLORS[Number(params.get('polish') ?? 0) % POLISH_COLORS.length].hex)
  if (!after && sev > 0) placeSpots(spots, assets, profile, view)
  if (params.has('pins')) world.addChild(pins(assets, view))

  const fit = () => {
    const w = app.screen.width, h = app.screen.height
    const k = Math.min((0.94 * h) / 1024, (0.98 * w) / 820)
    world.scale.set(k)
    world.position.set(w / 2 - 512 * k, h / 2 - 512 * k)
  }
  fit()
  window.addEventListener('resize', fit)
  let frames = 0
  const info = { assets, profile, buildMs, firstFrameMs: 0 }
  ;(window as unknown as { __foot: typeof info }).__foot = info
  app.ticker.add(t => {
    if (++frames === 2) info.firstFrameMs = Math.round(performance.now() - t0)
    surface.update(Math.min(0.05, t.deltaMS / 1000))
    if (frames > 3) surface.warmOne()
  })
}

/** The layers a customer arrives with, for this view. */
export function conditionLayers(p: FootProfile, view: FootView): string[] {
  if (view === 'sole') return [p.calluses > 0.05 && 'callus', p.dry > 0.05 && 'dry', p.cracks > 0.05 && 'cracks', p.dirt > 0.05 && 'dirt'].filter(Boolean) as string[]
  const fungal = p.fungus.some(f => f > 0)
  return [
    (fungal || p.ingrown || p.corns.length) && 'redness', p.ingrown && 'swelling', p.calluses > 0.05 && 'callus', fungal && 'fungus', p.polish && 'oldPolish',
    p.cuticle > 0.3 && 'cuticle', p.dirt > 0.05 && 'dirt', p.hair > 0.05 && 'hair',
  ].filter(Boolean) as string[]
}

/** Corns and splinters where the profile puts them, and the overgrown toenail tips. */
function placeSpots(root: Container, a: FootAssets, p: FootProfile, view: FootView) {
  const put = (tex: Sprite['texture'], x: number, y: number, scale: number, rot = 0) => { const s = new Sprite(tex); s.anchor.set(0.5); s.position.set(x, y); s.scale.set(scale); s.rotation = rot; root.addChild(s); return s }
  for (const c of p.corns) if (c.view === view) { put(a.spots.corn, c.x, c.y, c.size / 40); put(a.spots.cornCore, c.x, c.y, c.size / 40) }
  for (const sp of p.splinters) if (sp.view === view) { put(a.spots.splinterHalo, sp.x, sp.y, sp.size / 40); put(a.spots.splinter, sp.x, sp.y, sp.size / 60, sp.angle) }
  if (view !== 'top') return
  a.anatomy.shape.toes.forEach((t, i) => {
    const tip = a.footTips[i]
    if (!tip) return
    const nl = toeNail(t)
    const s = new Sprite(tip.texture)
    s.anchor.set(0.5, 1 - tip.y / tip.texture.height)
    s.position.set(nl.tip.x, nl.tip.y)
    s.rotation = Math.atan2(nl.dir.y, nl.dir.x) + Math.PI / 2
    root.addChild(s)
  })
}

const PIN_COLORS = [0xe7799c, 0x4fbf98, 0x9f86e0, 0xe9b45a, 0x5aa9e6, 0xf5836b, 0x6fc9a9, 0xd9577f, 0x3b3a6e, 0x8a6a80]

/** Outline every region of the view in its own colour with its name, plus the toe axes. */
function pins(a: FootAssets, view: FootView) {
  const root = new Container()
  const regions = a.anatomy.regions[view] as Record<string, Region>
  let i = 0
  for (const [id, region] of Object.entries(regions)) {
    if (id === 'everywhere') continue
    const color = PIN_COLORS[i++ % PIN_COLORS.length]
    const g = new Graphics()
    const draw = (s: Shape, dashed: boolean) => {
      if (s.t === 'ellipse') g.ellipse(0, 0, s.rx, s.ry).stroke({ width: dashed ? 1.5 : 2.5, color, alpha: 0.9 })
      else if (s.t === 'poly') g.poly(s.pts).stroke({ width: dashed ? 1.5 : 2.5, color, alpha: 0.9 })
      else {
        const ang = Math.atan2(s.y1 - s.y0, s.x1 - s.x0), nx = -Math.sin(ang), ny = Math.cos(ang)
        g.poly([s.x0 + nx * s.r0, s.y0 + ny * s.r0, s.x1 + nx * s.r1, s.y1 + ny * s.r1, s.x1 - nx * s.r1, s.y1 - ny * s.r1, s.x0 - nx * s.r0, s.y0 - ny * s.r0]).stroke({ width: 2, color, alpha: 0.9 })
      }
    }
    for (const s of region.include) {
      if (s.t === 'ellipse') { const e = new Graphics(); e.position.set(s.cx, s.cy); e.rotation = s.rot ?? 0; e.ellipse(0, 0, s.rx, s.ry).stroke({ width: 2.5, color, alpha: 0.9 }); root.addChild(e) } else draw(s, false)
    }
    for (const s of region.exclude ?? []) if (s.t !== 'ellipse') draw(s, true)
    root.addChild(g)
    const first = region.include[0]
    const at = first.t === 'ellipse' ? { x: first.cx, y: first.cy } : first.t === 'capsule' ? { x: (first.x0 + first.x1) / 2, y: (first.y0 + first.y1) / 2 } : { x: first.pts[0] + 30, y: Math.max(20, first.pts[1] + 40) }
    const label = new Text({ text: id, style: { fontFamily: 'Nunito, sans-serif', fontSize: 18, fontWeight: '800', fill: color, stroke: { color: 0xffffff, width: 4 } } })
    label.anchor.set(0.5)
    label.position.set(at.x, at.y)
    root.addChild(label)
  }
  const toes = view === 'top' ? a.anatomy.shape.toes : a.anatomy.shape.soleToes
  const axes = new Graphics()
  for (const t of toes) axes.moveTo(t.base.x, t.base.y).lineTo(t.tip.x, t.tip.y).stroke({ width: 1.5, color: 0x3b3a6e, alpha: 0.8 }).circle(t.base.x, t.base.y, 4).fill(0x3b3a6e).circle(t.tip.x, t.tip.y, 4).fill(0xe7799c)
  root.addChild(axes)
  void FOOT_LAYERS
  return root
}
