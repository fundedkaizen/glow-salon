import type { Look } from '../core/customers.ts'
import type { Shape } from '../core/geometry.ts'
import { makeRng } from '../core/rng.ts'
import { CUFF_Y, alongToe, footAnatomy, toeDir, toeNail, type FootAnatomy, type FootProfile, type FootView, type Toe } from '../core/foot.ts'
import { POLISH_COLORS } from '../core/treatments/types.ts'
import type { Crop } from './face.ts'
import { shapePath } from './hand.ts'
import { HAIR, OUTFIT, SKIN, type SkinTone } from './palette.ts'
import { blob, blurred, canvas, dots, fbm, hex, mixRGB, packHeight, rgba, shade, smoothPath, softBatch, tintedByNoise, warm, type Ctx, type RGB } from './paint.ts'

/**
 * The pedicure close-ups, painted in code on the geometry in core/foot.ts, in the same asset-layer shape as
 * face.ts and hand.ts: a base (the foot on its towel), a height map for the skin shader (form, pores, creases;
 * gloss in green), one sheet per treatment layer (painted when first needed), and the small spot art (corns,
 * splinters, a plaster), the overgrown nail tips to clip and the shards they drop.
 *
 *   top   toes, nails, knuckles, the instep and the ankle under a rolled trouser cuff
 *   sole  toe pads, the ball, the arch and the heel (paler than the top on every tone, as real soles are)
 *
 * The layer ids and the steps they serve are listed in docs/FEET-WIRING.md.
 */
export type FootArt = {
  view: FootView
  base: HTMLCanvasElement
  height: HTMLCanvasElement
  layers: Record<string, () => HTMLCanvasElement>
  /** Top view: the overgrown free edge of each toenail (null where it is already short). */
  tips: (Crop | null)[]
  /** Spot art, each centred on its canvas. */
  spots: Record<'corn' | 'cornCore' | 'cornMark' | 'splinter' | 'splinterHalo' | 'splinterMark' | 'plaster', HTMLCanvasElement>
  /** Clipped bits of nail for the particles: clean and fungal. */
  shards: { clean: HTMLCanvasElement[]; fungal: HTMLCanvasElement[] }
  skin: SkinTone
  /** The sole's own tone (lighter and pinker than the top). */
  soleSkin: SkinTone
  anatomy: FootAnatomy
}

/** The layer ids of each view, bottom to top. */
export const FOOT_LAYERS: Record<FootView, string[]> = {
  top: ['redness', 'swelling', 'fungus', 'oldPolish', 'cuticle', 'dirt', 'hair', 'wet', 'antiseptic', 'cream', 'antifungal', 'oil', 'mask', 'scrub', 'salt', 'base', 'color', 'top', 'water'],
  sole: ['callus', 'dry', 'cracks', 'dirt', 'wet', 'antiseptic', 'cream', 'oil', 'mask', 'scrub', 'salt', 'water'],
}

const S = 1024

/** How fair a tone is, 0 (deepest) to 1 (fairest). */
const fairOf = (skin: SkinTone) => Math.min(1, (skin.base[0] + skin.base[1] + skin.base[2]) / 3 / 215)
const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

/** The tone's warm occlusion colour, for multiplied contact shadows that deepen the colour, never grey it. */
function aoOf(skin: SkinTone): RGB {
  const k = [1.08, 0.97, 0.9]
  return [0, 1, 2].map(i => Math.min(255, (skin.deep[i] / skin.base[i]) * 255 * k[i])) as RGB
}

/** Soles (and palms) are lighter, pinker and less saturated than the top of the foot, most of all on deep skin. */
function soleTone(skin: SkinTone): SkinTone {
  const k = 0.25 + (1 - fairOf(skin)) * 0.45
  const pale: RGB = [240, 202, 184]
  const m = (c: RGB, t = k) => mixRGB(c, mixRGB(pale, c, 0.35), t)
  return { base: m(skin.base), light: m(skin.light), shadow: m(skin.shadow, k * 0.8), blush: m(skin.blush, k * 0.6), lip: skin.lip, deep: m(skin.deep, k * 0.7) }
}

const inflamedOf = (skin: SkinTone): RGB => mixRGB(skin.blush, [226, 88, 96], 0.35 + 0.35 * fairOf(skin))

// ---------------------------------------------------------------- outlines

/**
 * A toe's outline: from its root, a knuckle bulge, a slight waist, then the round, slightly bulbous tip.
 * The tip stays where the anatomy puts it, so the nail lines up.
 */
function toeOutline(t: Toe, rootExtend = 0.25): number[] {
  const d = toeDir(t), n = { x: -d.y, y: d.x }
  const len = Math.hypot(t.tip.x - t.base.x, t.tip.y - t.base.y)
  const big = t.name === 'big'
  const width = (u: number) => {
    let w = t.r0 + (t.r1 - t.r0) * Math.max(0, u)
    w += (big ? 3 : 2.6) * Math.exp(-(((u - (big ? 0.5 : 0.44)) / 0.07) ** 2))
    w -= (big ? 3 : 2) * Math.exp(-(((u - 0.64) / 0.08) ** 2))
    w += (big ? 2 : 1.6) * Math.exp(-(((u - 0.86) / 0.08) ** 2))
    return w
  }
  const left: number[] = [], right: number[] = []
  const uEnd = 1 - t.r1 / len
  const u0 = -rootExtend
  for (let k = 0; k <= 16; k++) {
    const u = u0 + (k / 16) * (uEnd - u0)
    const c = { x: t.base.x + d.x * len * u, y: t.base.y + d.y * len * u }, w = width(u)
    left.push(c.x + n.x * w, c.y + n.y * w)
    right.push(c.x - n.x * w, c.y - n.y * w)
  }
  const tip = { x: t.base.x + d.x * len * uEnd, y: t.base.y + d.y * len * uEnd }
  const a0 = Math.atan2(n.y, n.x), rr = width(uEnd)
  const cap: number[] = []
  for (let k = 1; k < 9; k++) {
    const a = a0 - (k / 9) * Math.PI
    // Toe tips are a little squarer than fingertips.
    const sq = 1 + 0.06 * Math.sin((k / 9) * Math.PI) ** 6
    cap.push(tip.x + Math.cos(a) * rr * sq, tip.y + Math.sin(a) * rr * sq)
  }
  const pts = [...left, ...cap]
  for (let k = right.length - 2; k >= 0; k -= 2) pts.push(right[k], right[k + 1])
  return pts
}

function clipTo(ctx: Ctx, mask: HTMLCanvasElement) {
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalCompositeOperation = 'destination-in'
  ctx.drawImage(mask, 0, 0)
  ctx.restore()
}

function shapesCanvas(shapes: Shape[]) {
  const [c, ctx] = canvas(S)
  ctx.fillStyle = '#fff'
  for (const s of shapes) { ctx.beginPath(); shapePath(ctx, s); ctx.fill() }
  return c
}

/** The view's silhouette, white on transparent, with the toes joined smoothly by webbing. */
function silhouette(a: FootAnatomy, view: FootView): HTMLCanvasElement {
  const [c, ctx] = canvas(S)
  ctx.fillStyle = '#fff'
  const toes = view === 'top' ? a.shape.toes : a.shape.soleToes
  ctx.beginPath(); smoothPath(ctx, view === 'top' ? a.shapes.topOut.t === 'poly' ? a.shapes.topOut.pts : [] : a.shapes.soleOut.t === 'poly' ? a.shapes.soleOut.pts : []); ctx.fill()
  for (const t of toes) { ctx.beginPath(); smoothPath(ctx, toeOutline(t)); ctx.fill() }
  // Webbing: the skin between the toe roots.
  for (let i = 0; i < toes.length - 1; i++) {
    const p = alongToe(toes[i], 0.05), q = alongToe(toes[i + 1], 0.05)
    ctx.beginPath(); ctx.ellipse((p.x + q.x) / 2, (p.y + q.y) / 2, Math.hypot(p.x - q.x, p.y - q.y) * 0.45, 26, Math.atan2(q.y - p.y, q.x - p.x), 0, Math.PI * 2); ctx.fill()
  }
  // A bunion: the big toe's joint bulges out on the inner edge.
  const b = a.shape.bunion
  if (b) {
    const t = toes[0], d = toeDir(t), side = view === 'top' ? 1 : -1
    const p = { x: t.base.x + side * t.r0 * 0.72, y: t.base.y - d.y * 6 }
    ctx.beginPath(); ctx.ellipse(p.x, p.y, 22 + b * 16, 38 + b * 8, 0, 0, Math.PI * 2); ctx.fill()
  }
  return c
}

// ---------------------------------------------------------------- the whole foot

export function paintFoot(look: Look, seed: number, profile: FootProfile, view: FootView): FootArt {
  const skin = SKIN[look.skin % SKIN.length]
  const sole = soleTone(skin)
  const a = footAnatomy(seed)
  const sil = silhouette(a, view)
  const base = view === 'top' ? paintTopBase(look, skin, seed, a, sil, profile) : paintSoleBase(sole, skin, seed, a, sil)
  const height = view === 'top' ? paintTopHeight(seed, a, sil) : paintSoleHeight(seed, a, sil)
  const layers = view === 'top' ? topLayers(look, skin, seed, a, sil, profile) : soleLayers(sole, seed, a, sil, profile)
  return {
    view, base, height, layers,
    tips: view === 'top' ? paintTips(a, profile) : [],
    spots: paintSpots(view === 'top' ? skin : sole),
    shards: paintShards(seed),
    skin, soleSkin: sole, anatomy: a,
  }
}

/** The shadow the foot casts on the towel, down and right, soft. */
function castShadow(ctx: Ctx, sil: HTMLCanvasElement, dx = 16, dy = 26) {
  softBatch(ctx, 24, c => { c.globalAlpha = 0.4; c.drawImage(sil, dx, dy); c.globalCompositeOperation = 'source-in'; c.fillStyle = 'rgb(112,72,110)'; c.fillRect(0, 0, S, S) })
  softBatch(ctx, 6, c => { c.globalAlpha = 0.3; c.drawImage(sil, dx * 0.3, dy * 0.3); c.globalCompositeOperation = 'source-in'; c.fillStyle = 'rgb(96,56,90)'; c.fillRect(0, 0, S, S) })
}

/** A soft darker rim just inside the silhouette, for roundness. */
function rimShade(ctx: Ctx, sil: HTMLCanvasElement, color: RGB, blur: number, alpha: number) {
  const [rim, rctx] = canvas(S)
  rctx.drawImage(sil, 0, 0)
  rctx.globalCompositeOperation = 'source-out'
  rctx.fillStyle = rgba(color)
  rctx.fillRect(0, 0, S, S)
  blurred(ctx, blur, () => { ctx.globalAlpha = alpha; ctx.drawImage(rim, 0, 0) })
  ctx.globalAlpha = 1
}

/** Soft painterly dabs laid along the form, low contrast, so the skin reads as brushwork rather than flat fill. */
function skinDabs(ctx: Ctx, skin: SkinTone, seed: number, x0: number, x1: number, y0: number, y1: number, count: number) {
  const r = makeRng(seed + 808)
  const red = mixRGB(skin.base, skin.blush, 0.55)
  softBatch(ctx, 10, c => {
    for (let i = 0; i < count; i++) {
      const x = r.range(x0, x1), y = r.range(y0, y1), k = r()
      const col = k < 0.35 ? skin.light : k < 0.6 ? red : k < 0.8 ? skin.shadow : mixRGB(skin.base, skin.light, 0.5)
      const rx = r.range(14, 40)
      c.fillStyle = rgba(col, r.range(0.05, 0.1))
      c.beginPath(); c.ellipse(x, y, rx, rx * r.range(0.35, 0.6), r.range(-0.4, 0.4) + Math.PI / 2, 0, Math.PI * 2); c.fill()
    }
  })
}

// ---------------------------------------------------------------- top view

function paintTopBase(look: Look, skin: SkinTone, seed: number, a: FootAnatomy, sil: HTMLCanvasElement, profile: FootProfile) {
  const [out, ctx] = canvas(S)
  castShadow(ctx, sil)
  const [sc, s] = canvas(S)
  const toes = a.shape.toes
  const fair = fairOf(skin)
  // Lit from the top left: the ankle and the lateral (left) slope catch it, the arch side (right) turns away.
  const lg = s.createLinearGradient(260, 120, 780, 760)
  lg.addColorStop(0, rgba(mixRGB(skin.base, skin.light, 0.35))); lg.addColorStop(0.5, rgba(skin.base)); lg.addColorStop(1, rgba(mixRGB(skin.base, skin.shadow, 0.4)))
  s.fillStyle = lg
  s.fillRect(0, 0, S, S)
  s.globalCompositeOperation = 'soft-light'
  s.globalAlpha = 0.28
  s.drawImage(fbm(S, 60, 4, seed + 1), 0, 0)
  s.globalAlpha = 1
  s.globalCompositeOperation = 'source-over'
  skinDabs(s, skin, seed, 300, 740, 100, 980, 240)
  const ao = aoOf(skin)
  // The dorsum is a dome: a broad light down its lateral slope, shade down the arch side.
  softBatch(s, 40, c => {
    c.fillStyle = rgba(skin.light, 0.5); c.beginPath(); c.ellipse(430, 420, 90, 260, -0.12, 0, Math.PI * 2); c.fill()
    c.fillStyle = rgba(skin.light, 0.35); c.beginPath(); c.ellipse(470, 170, 80, 90, 0, 0, Math.PI * 2); c.fill()
  })
  softBatch(s, 34, c => {
    c.fillStyle = rgba(ao, 0.55); c.beginPath(); c.ellipse(700, 470, 60, 250, -0.1, 0, Math.PI * 2); c.fill()
    c.fillStyle = rgba(ao, 0.35); c.beginPath(); c.ellipse(512, 60, 150, 70, 0, 0, Math.PI * 2); c.fill()
  }, 'multiply')
  // Ankle bones: the outer one (left) lower and lit, the inner one (right) higher, its underside in shade.
  const ank = (x: number, y: number, lit: number) => {
    blob(s, x, y, 38, 44, skin.light, 0.45 * lit)
    softBatch(s, 10, c => { c.fillStyle = rgba(ao, 0.4); c.beginPath(); c.ellipse(x + 10, y + 38, 34, 16, 0.2, 0, Math.PI * 2); c.fill() }, 'multiply')
    blob(s, x - 8, y - 10, 12, 10, [255, 250, 244], 0.25 * lit)
  }
  ank(372, 206, 1); ank(650, 176, 0.55)
  // Extensor tendons fanning from the front of the ankle to each toe; the big toe's stands out most.
  const tendon = (c: Ctx, t: Toe, dx: number) => {
    const wx = 500 + (t.base.x - 512) * 0.2, bow = (t.base.x - 512) * 0.1
    c.beginPath(); c.moveTo(wx + dx, 230); c.quadraticCurveTo((wx + t.base.x) / 2 + bow + dx, 470, t.base.x + dx, t.base.y - t.r0 * 0.9); c.stroke()
  }
  softBatch(s, 12, c => { for (const [i, t] of toes.entries()) { c.strokeStyle = rgba(ao, i === 0 ? 0.32 : 0.14); c.lineWidth = i === 0 ? 18 : 10; tendon(c, t, i === 0 ? 13 : 9) } }, 'multiply')
  softBatch(s, 9, c => { for (const [i, t] of toes.entries()) { c.strokeStyle = rgba(skin.light, i === 0 ? 0.4 : 0.18); c.lineWidth = i === 0 ? 14 : 9; tendon(c, t, 0) } })
  // Veins: a few soft, wide branches under the skin, faintly blue-green on fair skin, just deeper on deep skin.
  const veinCol = mixRGB(skin.shadow, [100, 124, 160], 0.45 * fair)
  const vr = makeRng(seed + 88)
  softBatch(s, 6, c => {
    c.strokeStyle = rgba(veinCol, 0.08 + 0.07 * fair); c.lineWidth = 9
    for (let k = 0; k < 3; k++) {
      let x = vr.range(420, 620), y = vr.range(620, 660)
      c.beginPath(); c.moveTo(x, y)
      for (let j = 0; j < 4; j++) { const nx = x + vr.range(-40, 40), ny = y - vr.range(70, 110); c.quadraticCurveTo(x + vr.range(-20, 20), (y + ny) / 2, nx, ny); x = nx; y = ny }
      c.stroke()
    }
  }, 'multiply')
  // The toes: soft cylinders lit from the left, warm at the tips and knuckles, creased at each joint. Each is
  // painted on its own and faded out toward its root, so it grows out of the foot with no seam.
  const [tc, tx] = canvas(S)
  for (const i of [4, 3, 2, 1, 0]) {
    const t = toes[i]
    const d = toeDir(t), n = { x: -d.y, y: d.x }
    const mid = alongToe(t, 0.5)
    const w = (t.r0 + t.r1) / 2
    const outline = toeOutline(t)
    tx.clearRect(0, 0, S, S)
    tx.save()
    tx.beginPath(); smoothPath(tx, outline); tx.clip()
    // The toes point down the screen, so n points to screen left, toward the light.
    const g = tx.createLinearGradient(mid.x + n.x * w, mid.y + n.y * w, mid.x - n.x * w, mid.y - n.y * w)
    g.addColorStop(0, rgba(mixRGB(skin.base, skin.shadow, 0.35))); g.addColorStop(0.3, rgba(mixRGB(skin.base, skin.light, 0.55))); g.addColorStop(0.62, rgba(skin.base)); g.addColorStop(1, rgba(mixRGB(skin.base, ao, 0.55)))
    tx.fillStyle = g
    tx.fillRect(0, 0, S, S)
    tx.globalCompositeOperation = 'soft-light'
    tx.globalAlpha = 0.25
    tx.drawImage(fbm(256, 20, 3, seed + i), mid.x - 128, mid.y - 128)
    tx.globalAlpha = 1
    tx.globalCompositeOperation = 'source-over'
    blurred(tx, 5, () => { tx.strokeStyle = rgba(mixRGB(skin.shadow, ao, 0.4), 0.55); tx.lineWidth = 9; tx.beginPath(); smoothPath(tx, outline); tx.stroke() })
    // Warm tip and knuckle (blood close under thin skin), a lift of light on the knuckle.
    const tipP = alongToe(t, 0.88)
    blob(tx, tipP.x, tipP.y, t.r1 * 1.25, t.r1 * 1.1, skin.blush, 0.42)
    const kn = alongToe(t, i === 0 ? 0.48 : 0.44)
    blob(tx, kn.x, kn.y, t.r0 * 0.95, t.r0 * 0.75, skin.blush, 0.3)
    blob(tx, kn.x + n.x * t.r0 * 0.25, kn.y - 4, t.r0 * 0.5, t.r0 * 0.36, skin.light, 0.45)
    // The tip curls away under the nail: a little shade at the very end.
    const end = alongToe(t, 1.02)
    blob(tx, end.x, end.y, t.r1 * 0.9, t.r1 * 0.35, ao, 0.3)
    tx.restore()
    // Joint creases: fine curved wrinkles across the knuckle (more on the big toe), each with a lit ridge.
    const kr = makeRng(seed + i * 17)
    const lines = i === 0 ? 4 : 2
    tx.save()
    tx.filter = 'blur(0.6px)'
    for (let k = 0; k < lines; k++) {
      const off = (k - (lines - 1) / 2) * (i === 0 ? 6 : 5)
      const cw = t.r0 * (i === 0 ? 0.58 : 0.6) * (1 - Math.abs(k - (lines - 1) / 2) * 0.12) * kr.range(0.85, 1.1)
      const bow = kr.range(3, 7) * (i === 0 ? 1.4 : 1)
      const path = (dd: number) => {
        tx.beginPath()
        tx.moveTo(kn.x + d.x * (off + dd) - n.x * cw, kn.y + d.y * (off + dd) - n.y * cw)
        tx.quadraticCurveTo(kn.x + d.x * (off + dd + bow), kn.y + d.y * (off + dd + bow), kn.x + d.x * (off + dd) + n.x * cw, kn.y + d.y * (off + dd) + n.y * cw)
      }
      tx.strokeStyle = rgba(skin.deep, kr.range(0.12, 0.2)); tx.lineWidth = 1.5; path(0); tx.stroke()
      tx.strokeStyle = rgba(skin.light, 0.25); tx.lineWidth = 1.3; path(2); tx.stroke()
    }
    tx.restore()
    // Fade toward the root, so the toe grows out of the foot.
    const p0 = alongToe(t, -0.22), p1 = alongToe(t, 0.16)
    const fade = tx.createLinearGradient(p0.x, p0.y, p1.x, p1.y)
    fade.addColorStop(0, 'rgba(0,0,0,1)'); fade.addColorStop(1, 'rgba(0,0,0,0)')
    tx.globalCompositeOperation = 'destination-out'
    tx.fillStyle = fade
    tx.fillRect(0, 0, S, S)
    tx.globalCompositeOperation = 'source-over'
    s.drawImage(tc, 0, 0)
  }
  // Deep occlusion in the clefts between the toes, and the knuckle ridge of the foot behind them.
  softBatch(s, 8, c => {
    c.fillStyle = rgba(ao, 0.85)
    for (let i = 0; i < toes.length - 1; i++) {
      const p = alongToe(toes[i], 0.2), q = alongToe(toes[i + 1], 0.2)
      c.beginPath(); c.ellipse((p.x + q.x) / 2, (p.y + q.y) / 2 + 6, 8, 34, Math.atan2(toes[i].tip.x - toes[i].base.x, toes[i].base.y - toes[i].tip.y), 0, Math.PI * 2); c.fill()
    }
  }, 'multiply')
  for (const t of toes) { const p = alongToe(t, -0.12); blob(s, p.x - 6, p.y - 6, t.r0 * 0.8, t.r0 * 0.5, skin.light, 0.3) }
  // A bunion's joint: a bony bulge on the inner edge, lit on top and a little red from rubbing.
  if (a.shape.bunion) {
    const t = toes[0], p = { x: t.base.x + t.r0 * 0.85, y: t.base.y - 6 }
    blob(s, p.x, p.y, 34, 40, inflamedOf(skin), 0.3 * a.shape.bunion)
    blob(s, p.x - 8, p.y - 12, 18, 16, skin.light, 0.5)
  }
  paintToenails(s, skin, a, seed)
  rimShade(s, sil, skin.shadow, 16, 0.85)
  // A warm rim of light along the lit (left) edge.
  const [lit, lctx] = canvas(S)
  lctx.drawImage(sil, 0, 0)
  lctx.globalCompositeOperation = 'destination-out'
  lctx.drawImage(sil, 5, 4)
  lctx.globalCompositeOperation = 'source-in'
  lctx.fillStyle = rgba(mixRGB(skin.light, [255, 224, 204], 0.5))
  lctx.fillRect(0, 0, S, S)
  blurred(s, 3, () => { s.globalAlpha = 0.5; s.drawImage(lit, 0, 0) })
  s.globalAlpha = 1
  clipTo(s, sil)
  ctx.drawImage(sc, 0, 0)
  paintCuff(ctx, look, skin)
  void profile
  return out
}

/**
 * Toenails with depth: a bed warmer toward the side walls with faint ridges, a pale lunula on the big toe,
 * an ivory free edge past the smile line, the cuticle fold arching over the base and a gloss streak. Their
 * shape follows the customer's (square, round or fan).
 */
function paintToenails(s: Ctx, skin: SkinTone, a: FootAnatomy, seed: number) {
  const shapeK = a.shape.nailShape
  const r = makeRng(seed + 3131)
  for (const [i, t] of a.shape.toes.entries()) {
    const nl = toeNail(t)
    const hw = nl.halfWidth, dir = nl.dir, nx = -dir.y, ny = dir.x
    const along = (u: number, side = 0) => ({ x: nl.base.x + (nl.tip.x - nl.base.x) * u + nx * side * hw, y: nl.base.y + (nl.tip.y - nl.base.y) * u + ny * side * hw })
    const outline = nailOutline(nl, shapeK, i)
    const path = (c: Ctx) => { c.beginPath(); smoothPath(c, outline) }
    // Toenails sit in the toe: a soft groove of shade around them.
    softBatch(s, 3, c => { c.strokeStyle = rgba(aoOf(skin), 0.55); c.lineWidth = 5; path(c); c.stroke() }, 'multiply')
    s.save()
    path(s); s.clip()
    const bed = mixRGB(mixRGB(skin.base, skin.blush, 0.35), [240, 196, 190], 0.4)
    const mid = along(0.5)
    const g = s.createLinearGradient(mid.x + nx * hw, mid.y + ny * hw, mid.x - nx * hw, mid.y - ny * hw)
    g.addColorStop(0, rgba(shade(bed, -0.1))); g.addColorStop(0.3, rgba(shade(bed, 0.1))); g.addColorStop(0.7, rgba(bed)); g.addColorStop(1, rgba(shade(bed, -0.22)))
    s.fillStyle = g
    s.fillRect(0, 0, S, S)
    s.lineWidth = i === 0 ? 1.2 : 0.9
    for (let k = -3; k <= 3; k++) {
      const p0 = along(0.05, k * 0.27), p1 = along(0.92, k * 0.25)
      s.strokeStyle = k % 2 ? 'rgba(255,255,255,0.14)' : rgba(shade(bed, -0.22), 0.14)
      s.beginPath(); s.moveTo(p0.x, p0.y); s.lineTo(p1.x, p1.y); s.stroke()
    }
    if (i === 0) {
      const lb = along(0.03)
      s.fillStyle = rgba(mixRGB(bed, [255, 244, 240], 0.45), 0.4)
      s.beginPath(); s.ellipse(lb.x, lb.y, hw * 0.55, hw * 0.3, Math.atan2(dir.y, dir.x) + Math.PI / 2, 0, Math.PI * 2); s.fill()
    }
    // The free edge past the smile line: ivory, a little yellower than a fingernail.
    const smile = 0.87, sm = along(smile), sl = along(smile - 0.08, -1.1), sr = along(smile - 0.08, 1.1)
    s.beginPath(); s.moveTo(sl.x, sl.y); s.quadraticCurveTo(sm.x + dir.x * hw * 0.35, sm.y + dir.y * hw * 0.35, sr.x, sr.y)
    const far = along(1.4); s.lineTo(far.x + nx * hw * 1.5, far.y + ny * hw * 1.5); s.lineTo(far.x - nx * hw * 1.5, far.y - ny * hw * 1.5); s.closePath()
    s.fillStyle = rgba([246, 234, 214], 0.78); s.fill()
    blurred(s, 1.2, () => { s.strokeStyle = rgba(shade(bed, -0.3), 0.4); s.lineWidth = 2.2; s.beginPath(); s.moveTo(sl.x, sl.y); s.quadraticCurveTo(sm.x + dir.x * hw * 0.35, sm.y + dir.y * hw * 0.35, sr.x, sr.y); s.stroke() })
    // Gloss: toenails are curved across, so the light sits in a streak on the lit side.
    const g0 = along(0.14, 0.36), g1 = along(0.74, 0.32)
    blurred(s, i === 0 ? 2.5 : 1.5, () => { s.strokeStyle = 'rgba(255,255,255,0.55)'; s.lineWidth = i === 0 ? 6 : 3; s.lineCap = 'round'; s.beginPath(); s.moveTo(g0.x, g0.y); s.lineTo(g1.x, g1.y); s.stroke() })
    const gd = along(0.22, -0.3)
    blob(s, gd.x, gd.y, i === 0 ? 3.5 : 2, i === 0 ? 2.5 : 1.5, [255, 255, 255], 0.75)
    s.restore()
    s.strokeStyle = rgba(skin.deep, 0.3); s.lineWidth = i === 0 ? 1.8 : 1.3
    path(s); s.stroke()
    // The cuticle fold over the base: a lit rim with a dark groove beneath.
    const cb = along(-0.02), ang = Math.atan2(dir.y, dir.x) + Math.PI / 2
    blurred(s, 0.8, () => {
      s.strokeStyle = rgba(shade(skin.deep, -0.1), 0.45); s.lineWidth = i === 0 ? 3 : 2
      s.beginPath(); s.ellipse(cb.x, cb.y, hw * 0.98, hw * 0.45, ang, Math.PI * 1.12, Math.PI * 1.88); s.stroke()
      s.strokeStyle = rgba(mixRGB(skin.light, [255, 236, 230], 0.4), 0.65); s.lineWidth = i === 0 ? 2.5 : 1.6
      s.beginPath(); s.ellipse(cb.x - dir.x * 3, cb.y - dir.y * 3, hw * 1.02, hw * 0.48, ang, Math.PI * 1.15, Math.PI * 1.85); s.stroke()
    })
    void r
  }
}

/** A toenail's outline for its shape: square (straight sides, flat end), round, or fan (wider at the tip). */
export function nailOutline(nl: ReturnType<typeof toeNail>, shape: 'square' | 'round' | 'fan', i: number): number[] {
  const hw = nl.halfWidth, nx = -nl.dir.y, ny = nl.dir.x
  const L = Math.hypot(nl.tip.x - nl.base.x, nl.tip.y - nl.base.y)
  const at = (u: number, side: number) => ({ x: nl.base.x + nl.dir.x * L * u + nx * side * hw, y: nl.base.y + nl.dir.y * L * u + ny * side * hw })
  const fan = shape === 'fan' ? 1.1 : 1
  const endR = shape === 'square' ? 0.35 : shape === 'round' ? 0.9 : 0.6
  const little = i === 4
  const pts: number[] = []
  // The base: a shallow curve under the cuticle.
  for (const [u, sd] of [[0.14, -0.95], [0.03, -0.66], [-0.04, 0], [0.03, 0.66], [0.14, 0.95]] as const) { const p = at(u, sd); pts.push(p.x, p.y) }
  // Up the right side, round the free edge, back down the left.
  const e = little ? 0.8 : endR
  for (const [u, sd] of [[0.5, 1.0 * (1 + (fan - 1) * 0.5)], [1 - e * 0.22, fan], [1 - e * 0.05, fan * (1 - e * 0.45)], [1, 0], [1 - e * 0.05, -fan * (1 - e * 0.45)], [1 - e * 0.22, -fan], [0.5, -1.0 * (1 + (fan - 1) * 0.5)]] as const) { const p = at(u, sd); pts.push(p.x, p.y) }
  return pts
}

/** A rolled-up trouser cuff at the top of the top view: soft cotton, ribbed folds, its shadow on the ankle. */
function paintCuff(ctx: Ctx, look: Look, skin: SkinTone) {
  const col = shade(hex(OUTFIT[(look.outfit + 1) % OUTFIT.length]), 0.12)
  const L = 338, R = 690, B = CUFF_Y
  const cuff = (k: Ctx, dy = 0) => { k.beginPath(); k.moveTo(L + 6, -60); k.lineTo(R - 6, -60); k.quadraticCurveTo(R + 4, B * 0.5, R - 2, B - 8 + dy); k.bezierCurveTo(R - 60, B + 16 + dy, L + 60, B + 16 + dy, L + 2, B - 8 + dy); k.quadraticCurveTo(L - 4, B * 0.5, L + 6, -60); k.closePath() }
  softBatch(ctx, 12, k => { k.fillStyle = rgba(aoOf(skin), 0.6); k.translate(4, 18); cuff(k); k.fill() }, 'multiply')
  ctx.save()
  cuff(ctx)
  const g = ctx.createLinearGradient(L, 0, R, 0)
  g.addColorStop(0, rgba(shade(col, -0.05))); g.addColorStop(0.3, rgba(shade(col, 0.3))); g.addColorStop(0.7, rgba(shade(col, 0.12))); g.addColorStop(1, rgba(shade(col, -0.25)))
  ctx.fillStyle = g
  ctx.fill()
  ctx.clip()
  // Two rolled bands: each a soft tube, lit on top, shaded where it tucks under the next.
  softBatch(ctx, 3, k => {
    for (const y of [4, 50]) {
      k.strokeStyle = rgba(shade(col, 0.45), 0.8); k.lineWidth = 8
      k.beginPath(); k.moveTo(L, y + 6); k.bezierCurveTo(L + 100, y + 20, R - 100, y + 20, R, y + 6); k.stroke()
      k.strokeStyle = rgba(shade(col, -0.3), 0.6); k.lineWidth = 6
      k.beginPath(); k.moveTo(L, y + 34); k.bezierCurveTo(L + 100, y + 48, R - 100, y + 48, R, y + 34); k.stroke()
    }
    // A few soft creases where the fabric bunches at the sides.
    for (const [x, dx] of [[372, 10], [654, -10]] as const) { k.strokeStyle = rgba(shade(col, -0.2), 0.35); k.lineWidth = 5; k.beginPath(); k.moveTo(x, 8); k.quadraticCurveTo(x + dx, 40, x + dx * 0.4, B - 10); k.stroke() }
  })
  ctx.restore()
  softBatch(ctx, 2, k => { k.strokeStyle = rgba(shade(col, 0.5), 0.9); k.lineWidth = 4; k.beginPath(); k.moveTo(L + 4, B - 6); k.bezierCurveTo(L + 60, B + 12, R - 60, B + 12, R - 4, B - 6); k.stroke() })
}

function paintTopHeight(seed: number, a: FootAnatomy, sil: HTMLCanvasElement) {
  const [h, c] = canvas(S)
  const r = makeRng(seed + 5)
  c.fillStyle = '#000'
  c.fillRect(0, 0, S, S)
  // The form: the silhouette blurred (a dome), with the toes as their own cylinders.
  blurred(c, 26, () => c.drawImage(sil, 0, 0))
  c.globalCompositeOperation = 'multiply'
  c.drawImage(sil, 0, 0)
  c.globalCompositeOperation = 'source-over'
  const toes = a.shape.toes
  for (const [i, t] of toes.entries()) {
    const kn = alongToe(t, i === 0 ? 0.48 : 0.44)
    blob(c, kn.x, kn.y, t.r0 * 0.7, t.r0 * 0.5, [255, 255, 255], 0.3)
    const tip = alongToe(t, 0.85)
    blob(c, tip.x, tip.y, t.r1 * 0.8, t.r1 * 0.7, [255, 255, 255], 0.2)
  }
  // Tendons and ankle bones stand proud; the clefts between the toes sink.
  softBatch(c, 9, k => {
    k.strokeStyle = 'rgba(255,255,255,0.18)'
    for (const [i, t] of toes.entries()) { const wx = 500 + (t.base.x - 512) * 0.2; k.lineWidth = i === 0 ? 16 : 9; k.beginPath(); k.moveTo(wx, 230); k.quadraticCurveTo((wx + t.base.x) / 2 + (t.base.x - 512) * 0.1, 470, t.base.x, t.base.y - t.r0 * 0.9); k.stroke() }
  })
  blob(c, 372, 206, 40, 46, [255, 255, 255], 0.35)
  blob(c, 650, 176, 40, 46, [255, 255, 255], 0.3)
  const nails = shapesCanvas(a.shapes.nailShapes)
  blurred(c, 1.5, () => { c.globalAlpha = 0.45; c.drawImage(nails, 0, 0) })
  c.globalAlpha = 1
  // Pores and fine texture, and short creases across the toe joints.
  dots(c, [0, 0, 0], 9000, () => ({ a: r.range(0.08, 0.24), x: r.range(260, 780), y: r.range(100, 1000), r: r.range(0.7, 1.4) }))
  // Gloss: a soft sheen over the top of the foot, more on the knuckles, toe tips and ankle bones; nails shine most.
  const [gl, g] = canvas(S)
  g.fillStyle = '#000'
  g.fillRect(0, 0, S, S)
  g.globalAlpha = 0.2
  g.drawImage(sil, 0, 0)
  g.globalAlpha = 1
  for (const [i, t] of toes.entries()) { const kn = alongToe(t, i === 0 ? 0.48 : 0.44, -0.2); blob(g, kn.x, kn.y, t.r0 * 0.5, t.r0 * 0.4, [255, 255, 255], 0.45) }
  blob(g, 372, 200, 30, 30, [255, 255, 255], 0.5)
  blob(g, 650, 170, 30, 30, [255, 255, 255], 0.35)
  g.drawImage(nails, 0, 0)
  return packHeight(h, gl)
}

// ---------------------------------------------------------------- sole view

function paintSoleBase(sole: SkinTone, top: SkinTone, seed: number, a: FootAnatomy, sil: HTMLCanvasElement) {
  const [out, ctx] = canvas(S)
  castShadow(ctx, sil, 14, 22)
  const [sc, s] = canvas(S)
  const toes = a.shape.soleToes
  const w = a.shape.width, sx = (x: number) => 512 + (x - 512) * w
  const ao = aoOf(sole)
  const lg = s.createLinearGradient(300, 80, 740, 980)
  lg.addColorStop(0, rgba(mixRGB(sole.base, sole.light, 0.3))); lg.addColorStop(0.55, rgba(sole.base)); lg.addColorStop(1, rgba(mixRGB(sole.base, sole.shadow, 0.3)))
  s.fillStyle = lg
  s.fillRect(0, 0, S, S)
  s.globalCompositeOperation = 'soft-light'
  s.globalAlpha = 0.3
  s.drawImage(fbm(S, 50, 4, seed + 2), 0, 0)
  s.globalAlpha = 1
  s.globalCompositeOperation = 'source-over'
  skinDabs(s, sole, seed + 1, 320, 740, 80, 990, 260)
  // Broad form first: the sole dips between the ball and the heel (the arch lifts on the inner side), and
  // everything rounds away at the edges.
  softBatch(s, 46, c => {
    c.fillStyle = rgba(ao, 0.5); c.beginPath(); c.ellipse(sx(430), 640, 70 * w, 190, 0.22, 0, Math.PI * 2); c.fill()
    c.fillStyle = rgba(ao, 0.22); c.beginPath(); c.ellipse(sx(560), 560, 150 * w, 90, 0, 0, Math.PI * 2); c.fill()
    c.fillStyle = rgba(ao, 0.2); c.beginPath(); c.ellipse(sx(560), 1000, 200 * w, 60, 0, 0, Math.PI * 2); c.fill()
  }, 'multiply')
  // The pads: heel, ball and the pad under the big toe's joint are domes, lit at the top left, warm and pink
  // where the blood shows through, each with its rim turning into shade.
  const pad = (x: number, y: number, rx: number, ry: number, rot: number, lift: number) => {
    softBatch(s, Math.max(16, rx * 0.36), c => { c.fillStyle = rgba(mixRGB(sole.light, sole.blush, 0.2), 0.55 * lift); c.beginPath(); c.ellipse(x - rx * 0.2, y - ry * 0.22, rx * 0.62, ry * 0.52, rot, 0, Math.PI * 2); c.fill() })
    softBatch(s, Math.max(8, rx * 0.14), c => { c.fillStyle = rgba(sole.blush, 0.18 * lift); c.beginPath(); c.ellipse(x, y, rx * 0.8, ry * 0.75, rot, 0, Math.PI * 2); c.fill() })
    softBatch(s, Math.max(10, rx * 0.16), c => { c.strokeStyle = rgba(ao, 0.42 * lift); c.lineWidth = rx * 0.26; c.beginPath(); c.ellipse(x + rx * 0.06, y + ry * 0.1, rx * 0.98, ry * 0.95, rot, -0.2, Math.PI * 1.1); c.stroke() }, 'multiply')
  }
  pad(sx(552), 862, 132 * w, 118, 0, 1)
  pad(sx(540), 392, 190 * w, 72, 0.12, 0.8)
  pad(sx(392) - a.shape.bunion * 10, 392, 70 * w, 62, 0, 0.45)
  // The outer edge carries weight: a lighter, flatter band; the arch is thin, pinker, unworn skin.
  softBatch(s, 20, c => { c.fillStyle = rgba(sole.light, 0.35); c.beginPath(); c.ellipse(sx(684), 650, 30 * w, 200, 0.05, 0, Math.PI * 2); c.fill() })
  blob(s, sx(452), 640, 50 * w, 140, mixRGB(sole.blush, sole.light, 0.3), 0.26)
  // Toes from below: each a round pad with a crease across its middle joint, painted on its own and faded
  // toward its root, where it tucks into the ball in one deep fold.
  const [tc, tx] = canvas(S)
  for (const [i, t] of toes.entries()) {
    const d = toeDir(t), n = { x: -d.y, y: d.x }
    const mid = alongToe(t, 0.55), wd = (t.r0 + t.r1) / 2
    const outline = toeOutline(t, 0.1)
    tx.clearRect(0, 0, S, S)
    tx.save()
    tx.beginPath(); smoothPath(tx, outline); tx.clip()
    // The toes point up the screen, so n points to screen right, away from the light.
    const g = tx.createLinearGradient(mid.x + n.x * wd, mid.y + n.y * wd, mid.x - n.x * wd, mid.y - n.y * wd)
    g.addColorStop(0, rgba(mixRGB(sole.base, ao, 0.5))); g.addColorStop(0.45, rgba(sole.base)); g.addColorStop(0.75, rgba(mixRGB(sole.base, sole.light, 0.5))); g.addColorStop(1, rgba(mixRGB(sole.base, sole.shadow, 0.3)))
    tx.fillStyle = g
    tx.fillRect(0, 0, S, S)
    blurred(tx, 5, () => { tx.strokeStyle = rgba(mixRGB(sole.shadow, ao, 0.4), 0.5); tx.lineWidth = 9; tx.beginPath(); smoothPath(tx, outline); tx.stroke() })
    const p = alongToe(t, 0.78)
    blob(tx, p.x, p.y, t.r1 * 1.05, t.r1 * 0.95, sole.blush, 0.3)
    blob(tx, p.x - t.r1 * 0.25, p.y - t.r1 * 0.3, t.r1 * 0.45, t.r1 * 0.35, sole.light, 0.7)
    const q = alongToe(t, 0.5)
    blob(tx, q.x, q.y + 4, t.r0 * 0.8, t.r0 * 0.3, ao, 0.25)
    tx.restore()
    // The crease across the middle joint.
    const cw = t.r0 * 0.72
    tx.lineCap = 'round'
    tx.strokeStyle = rgba(ao, 0.45); tx.lineWidth = i === 0 ? 3 : 2.4
    tx.beginPath(); tx.moveTo(q.x - n.x * cw, q.y - n.y * cw); tx.quadraticCurveTo(q.x - d.x * 6, q.y - d.y * 6, q.x + n.x * cw, q.y + n.y * cw); tx.stroke()
    tx.strokeStyle = rgba(sole.light, 0.4); tx.lineWidth = 1.6
    tx.beginPath(); tx.moveTo(q.x - n.x * cw, q.y - n.y * cw + 3); tx.quadraticCurveTo(q.x - d.x * 3, q.y - d.y * 3 + 3, q.x + n.x * cw, q.y + n.y * cw + 3); tx.stroke()
    const p0 = alongToe(t, -0.1), p1 = alongToe(t, 0.26)
    const fade = tx.createLinearGradient(p0.x, p0.y, p1.x, p1.y)
    fade.addColorStop(0, 'rgba(0,0,0,1)'); fade.addColorStop(1, 'rgba(0,0,0,0)')
    tx.globalCompositeOperation = 'destination-out'
    tx.fillStyle = fade
    tx.fillRect(0, 0, S, S)
    tx.globalCompositeOperation = 'source-over'
    s.drawImage(tc, 0, 0)
  }
  // Where each toe tucks into the ball: a crease curving under its pad, lit just below.
  softBatch(s, 2.5, c => {
    for (const t of toes) {
      const d = toeDir(t), n = { x: -d.y, y: d.x }, q = alongToe(t, 0.06), cw = t.r0 * 0.95
      c.strokeStyle = rgba(ao, 0.6); c.lineWidth = 4
      c.beginPath(); c.moveTo(q.x - n.x * cw, q.y - n.y * cw); c.quadraticCurveTo(q.x - d.x * 24, q.y - d.y * 24, q.x + n.x * cw, q.y + n.y * cw); c.stroke()
    }
  }, 'multiply')
  softBatch(s, 3, c => {
    for (const t of toes) {
      const d = toeDir(t), n = { x: -d.y, y: d.x }, q = alongToe(t, 0.06), cw = t.r0 * 0.85
      c.strokeStyle = rgba(sole.light, 0.4); c.lineWidth = 4
      c.beginPath(); c.moveTo(q.x - n.x * cw - d.x * 7, q.y - n.y * cw - d.y * 7); c.quadraticCurveTo(q.x - d.x * 24, q.y - d.y * 24, q.x + n.x * cw - d.x * 7, q.y + n.y * cw - d.y * 7); c.stroke()
    }
  })
  softBatch(s, 7, c => {
    c.fillStyle = rgba(ao, 0.85)
    for (let i = 0; i < toes.length - 1; i++) {
      const p = alongToe(toes[i], 0.2), q = alongToe(toes[i + 1], 0.2)
      c.beginPath(); c.ellipse((p.x + q.x) / 2, (p.y + q.y) / 2 - 4, 6, 30, Math.atan2(toes[i].tip.x - toes[i].base.x, toes[i].base.y - toes[i].tip.y), 0, Math.PI * 2); c.fill()
    }
  }, 'multiply')
  // Skin lines: faint arcs following the pads, soft enough to read as skin, never as scratches.
  const r = makeRng(seed + 44)
  softBatch(s, 1.1, c => {
    c.lineWidth = 1.2
    for (let k = 0; k < 60; k++) {
      const heel = r() < 0.5
      const cx = heel ? sx(552) : sx(540), cy = heel ? 862 : 392, rx = heel ? 132 * w : 190 * w, ry = heel ? 118 : 72
      const rad = r.range(0.25, 0.92), a0 = r.range(0, Math.PI * 2), span = r.range(0.2, 0.5)
      c.strokeStyle = rgba(ao, r.range(0.07, 0.13))
      c.beginPath(); c.ellipse(cx, cy, rx * rad, ry * rad, heel ? 0 : 0.12, a0, a0 + span); c.stroke()
    }
  }, 'multiply')
  // The top of the foot wraps round the edges: a thin rim of the darker top skin, strongest on deep tones.
  const [rim, rctx] = canvas(S)
  rctx.drawImage(sil, 0, 0)
  rctx.globalCompositeOperation = 'source-out'
  rctx.fillStyle = rgba(mixRGB(top.base, top.shadow, 0.3))
  rctx.fillRect(0, 0, S, S)
  blurred(s, 9, () => { s.globalAlpha = 0.9; s.drawImage(rim, 0, 0) })
  s.globalAlpha = 1
  rimShade(s, sil, sole.shadow, 18, 0.4)
  clipTo(s, sil)
  ctx.drawImage(sc, 0, 0)
  return out
}

function paintSoleHeight(seed: number, a: FootAnatomy, sil: HTMLCanvasElement) {
  const [h, c] = canvas(S)
  const r = makeRng(seed + 6)
  c.fillStyle = '#000'
  c.fillRect(0, 0, S, S)
  blurred(c, 30, () => c.drawImage(sil, 0, 0))
  c.globalCompositeOperation = 'multiply'
  c.drawImage(sil, 0, 0)
  c.globalCompositeOperation = 'source-over'
  const w = a.shape.width, sx = (x: number) => 512 + (x - 512) * w
  blob(c, sx(552), 862, 130 * w, 116, [255, 255, 255], 0.4)
  blob(c, sx(520), 388, 200 * w, 76, [255, 255, 255], 0.35)
  blob(c, sx(430), 630, 60 * w, 150, [0, 0, 0], 0.35)
  for (const t of a.shape.soleToes) { const p = alongToe(t, 0.76); blob(c, p.x, p.y, t.r1, t.r1, [255, 255, 255], 0.35); const q = alongToe(t, 0.04); blob(c, q.x, q.y, t.r0 * 0.9, 8, [0, 0, 0], 0.45) }
  dots(c, [0, 0, 0], 7000, () => ({ a: r.range(0.06, 0.18), x: r.range(300, 760), y: r.range(80, 1000), r: r.range(0.7, 1.3) }))
  const [gl, g] = canvas(S)
  g.fillStyle = '#000'
  g.fillRect(0, 0, S, S)
  g.globalAlpha = 0.14
  g.drawImage(sil, 0, 0)
  g.globalAlpha = 1
  blob(g, sx(520), 820, 60, 50, [255, 255, 255], 0.35)
  for (const t of a.shape.soleToes) { const p = alongToe(t, 0.8); blob(g, p.x - 4, p.y - 6, t.r1 * 0.5, t.r1 * 0.4, [255, 255, 255], 0.35) }
  return packHeight(h, gl)
}

// ---------------------------------------------------------------- layers (filled in below)

function topLayers(look: Look, skin: SkinTone, seed: number, a: FootAnatomy, sil: HTMLCanvasElement, profile: FootProfile): Record<string, () => HTMLCanvasElement> {
  void look; void skin; void seed; void a; void sil; void profile
  return {}
}

function soleLayers(sole: SkinTone, seed: number, a: FootAnatomy, sil: HTMLCanvasElement, profile: FootProfile): Record<string, () => HTMLCanvasElement> {
  void sole; void seed; void a; void sil; void profile
  return {}
}

function paintTips(a: FootAnatomy, profile: FootProfile): (Crop | null)[] {
  void a; void profile
  return []
}

function paintSpots(skin: SkinTone): FootArt['spots'] {
  const one = (size: number) => canvas(size)[0]
  void skin
  return { corn: one(8), cornCore: one(8), cornMark: one(8), splinter: one(8), splinterHalo: one(8), splinterMark: one(8), plaster: one(8) }
}

function paintShards(seed: number): FootArt['shards'] {
  void seed
  return { clean: [], fungal: [] }
}

void HAIR; void POLISH_COLORS; void tintedByNoise; void warm; void clamp01
