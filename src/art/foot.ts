import type { Look } from '../core/customers.ts'
import type { Shape } from '../core/geometry.ts'
import { makeRng } from '../core/rng.ts'
import { CUFF_Y, alongToe, drapeY, footAnatomy, toeDir, toeNail, type FootAnatomy, type FootProfile, type FootView, type Toe } from '../core/foot.ts'
import { POLISH_COLORS } from '../core/treatments/types.ts'
import type { Crop } from './face.ts'
import { shapePath } from './hand.ts'
import { HAIR, OUTFIT, SKIN, type SkinTone } from './palette.ts'
import { blob, blurred, canvas, dots, fbm, hex, mixRGB, packHeight, rgba, shade, smoothPath, softBatch, terry, tintedByNoise, type Ctx, type RGB } from './paint.ts'

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
  top: ['redness', 'swelling', 'callus', 'fungus', 'oldPolish', 'cuticle', 'dirt', 'hair', 'wet', 'antiseptic', 'cream', 'antifungal', 'oil', 'mask', 'scrub', 'salt', 'base', 'color', 'top', 'water'],
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
  const k = 0.3 + (1 - fairOf(skin)) * 0.8
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

/**
 * A toe seen from below: round pads (the tip's big one, and one over the middle joint; two on the big toe),
 * each an ellipse along the toe, joined by a slimmer neck. Returns the pads, tip last.
 */
function soleToePads(t: Toe) {
  const ang = Math.atan2(t.tip.y - t.base.y, t.tip.x - t.base.x) + Math.PI / 2
  const big = t.name === 'big'
  const pad = (u: number, rx: number, ry: number) => { const c = alongToe(t, u); return { x: c.x, y: c.y, rx, ry, rot: ang } }
  return big
    ? [pad(0.34, t.r0 * 1.06, t.r0 * 0.68), pad(0.72, t.r1 * 1.2, t.r1 * 0.95)]
    : [pad(0.42, t.r0 * 0.98, t.r0 * 0.7), pad(0.76, t.r1 * 1.12, t.r1 * 0.98)]
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
  for (const t of toes) {
    if (view === 'top') { ctx.beginPath(); smoothPath(ctx, toeOutline(t)); ctx.fill(); continue }
    // From below: round pads on a slimmer neck.
    ctx.beginPath(); shapePath(ctx, { t: 'capsule', x0: t.base.x, y0: t.base.y, x1: alongToe(t, 0.8).x, y1: alongToe(t, 0.8).y, r0: t.r0 * 0.93, r1: t.r1 * 0.92 }); ctx.fill()
    for (const pd of soleToePads(t)) { ctx.beginPath(); ctx.ellipse(pd.x, pd.y, pd.rx, pd.ry, pd.rot, 0, Math.PI * 2); ctx.fill() }
  }
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
  // Lit from the top left: the outer (left) slope of the instep catches it, the arch side (right) turns away.
  const lg = s.createLinearGradient(180, 0, 840, 900)
  lg.addColorStop(0, rgba(mixRGB(skin.base, skin.light, 0.35))); lg.addColorStop(0.5, rgba(skin.base)); lg.addColorStop(1, rgba(mixRGB(skin.base, skin.shadow, 0.4)))
  s.fillStyle = lg
  s.fillRect(0, 0, S, S)
  s.globalCompositeOperation = 'soft-light'
  s.globalAlpha = 0.16
  s.drawImage(fbm(S, 70, 4, seed + 1), 0, 0)
  s.globalAlpha = 1
  s.globalCompositeOperation = 'source-over'
  skinDabs(s, skin, seed, 190, 840, 0, 980, 380)
  const ao = aoOf(skin)
  // The instep is a dome: a broad light down its outer slope, shade down the arch side and toward the ankle.
  softBatch(s, 50, c => {
    c.fillStyle = rgba(skin.light, 0.5); c.beginPath(); c.ellipse(370, 320, 120, 300, -0.1, 0, Math.PI * 2); c.fill()
  })
  softBatch(s, 44, c => {
    c.fillStyle = rgba(ao, 0.6); c.beginPath(); c.ellipse(790, 330, 80, 320, -0.08, 0, Math.PI * 2); c.fill()
    c.fillStyle = rgba(ao, 0.3); c.beginPath(); c.ellipse(210, 360, 50, 260, 0.1, 0, Math.PI * 2); c.fill()
  }, 'multiply')
  // Extensor tendons fanning from under the towel to each toe; the big toe's stands out most.
  const tendon = (c: Ctx, t: Toe, dx: number) => {
    const wx = 520 + (t.base.x - 512) * 0.3, bow = (t.base.x - 512) * 0.08
    c.beginPath(); c.moveTo(wx + dx, -20); c.quadraticCurveTo((wx + t.base.x) / 2 + bow + dx, 330, t.base.x + dx, t.base.y - t.r0 * 0.9); c.stroke()
  }
  softBatch(s, 16, c => { for (const [i, t] of toes.entries()) { c.strokeStyle = rgba(ao, i === 0 ? 0.32 : 0.13); c.lineWidth = i === 0 ? 24 : 13; tendon(c, t, i === 0 ? 18 : 12) } }, 'multiply')
  softBatch(s, 12, c => { for (const [i, t] of toes.entries()) { c.strokeStyle = rgba(skin.light, i === 0 ? 0.42 : 0.18); c.lineWidth = i === 0 ? 20 : 12; tendon(c, t, 0) } })
  // Veins: a few soft, wide branches under the skin, faintly blue-green on fair skin, just deeper on deep skin.
  const veinCol = mixRGB(skin.shadow, [100, 124, 160], 0.45 * fair)
  const vr = makeRng(seed + 88)
  softBatch(s, 8, c => {
    c.strokeStyle = rgba(veinCol, 0.08 + 0.07 * fair); c.lineWidth = 12
    for (let k = 0; k < 3; k++) {
      let x = vr.range(360, 680), y = vr.range(520, 580)
      c.beginPath(); c.moveTo(x, y)
      for (let j = 0; j < 4; j++) { const nx = x + vr.range(-50, 50), ny = y - vr.range(100, 150); c.quadraticCurveTo(x + vr.range(-25, 25), (y + ny) / 2, nx, ny); x = nx; y = ny }
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
    blob(s, p.x - 8, p.y - 12, 26, 22, skin.light, 0.25)
  }
  // The ball joints at the toe roots: a lit bump each, shade tucked below and to the right.
  softBatch(s, 12, c => { for (const t of toes) { const q = alongToe(t, -0.2); c.fillStyle = rgba(skin.light, 0.4); c.beginPath(); c.ellipse(q.x - t.r0 * 0.15, q.y - t.r0 * 0.2, t.r0 * 0.75, t.r0 * 0.5, 0, 0, Math.PI * 2); c.fill() } })
  softBatch(s, 12, c => { for (const t of toes) { const q = alongToe(t, -0.08); c.fillStyle = rgba(ao, 0.2); c.beginPath(); c.ellipse(q.x + t.r0 * 0.4, q.y + t.r0 * 0.2, t.r0 * 0.6, t.r0 * 0.4, 0, 0, Math.PI * 2); c.fill() } }, 'multiply')
  // Where the ankle flexes, just under the towel: a few soft creases, each with a lit ridge.
  const cr = makeRng(seed + 64)
  softBatch(s, 5, c => {
    for (let k = 0; k < 3; k++) {
      const y = 200 + k * 22 + cr.range(-6, 6), x0 = 330 + cr.range(-30, 30), x1 = 700 + cr.range(-30, 30)
      c.strokeStyle = rgba(ao, 0.2); c.lineWidth = 4
      c.beginPath(); c.moveTo(x0, y + 10); c.quadraticCurveTo((x0 + x1) / 2, y - 12, x1, y + 8); c.stroke()
      c.strokeStyle = rgba(skin.light, 0.35); c.lineWidth = 2.5
      c.beginPath(); c.moveTo(x0, y + 15); c.quadraticCurveTo((x0 + x1) / 2, y - 7, x1, y + 13); c.stroke()
    }
  })
  // Warm where the toes join the foot.
  softBatch(s, 18, c => { for (const t of toes) { const q = alongToe(t, 0.05); c.fillStyle = rgba(skin.blush, 0.2); c.beginPath(); c.ellipse(q.x, q.y, t.r0 * 1.1, t.r0 * 0.7, 0, 0, Math.PI * 2); c.fill() } })
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
  paintDrape(ctx, look)
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
  const endR = shape === 'square' ? 0.55 : shape === 'round' ? 0.95 : 0.75
  const little = i === 4
  const pts: number[] = []
  // The base: a shallow curve under the cuticle.
  for (const [u, sd] of [[0.14, -0.95], [0.03, -0.66], [-0.04, 0], [0.03, 0.66], [0.14, 0.95]] as const) { const p = at(u, sd); pts.push(p.x, p.y) }
  // Up the right side, round the free edge, back down the left.
  const e = little ? 0.8 : endR
  for (const [u, sd] of [[0.5, 1.0 * (1 + (fan - 1) * 0.5)], [1 - e * 0.22, fan], [1 - e * 0.05, fan * (1 - e * 0.45)], [1, 0], [1 - e * 0.05, -fan * (1 - e * 0.45)], [1 - e * 0.22, -fan], [0.5, -1.0 * (1 + (fan - 1) * 0.5)]] as const) { const p = at(u, sd); pts.push(p.x, p.y) }
  return pts
}

/**
 * A soft terry towel draped over the ankle at the top of the top view: cream, with a pastel stripe near its hem,
 * hanging in a few soft folds, its hem rolled, and its shadow falling on the foot and the towel below.
 */
function paintDrape(ctx: Ctx, look: Look) {
  const col: RGB = [252, 246, 240]
  const stripe = shade(hex(OUTFIT[(look.outfit + 1) % OUTFIT.length]), 0.1)
  const r = makeRng(look.outfit * 7 + 3)
  const hem = (k: Ctx, dy = 0) => { k.beginPath(); k.moveTo(-40, -80); k.lineTo(1064, -80); for (let x = 1064; x >= -40; x -= 8) k.lineTo(x, drapeY(x) + dy); k.closePath() }
  const hemLine = (k: Ctx, dy: number) => { k.beginPath(); for (let x = -40; x <= 1064; x += 8) (x === -40 ? k.moveTo(x, drapeY(x) + dy) : k.lineTo(x, drapeY(x) + dy)) }
  softBatch(ctx, 18, k => { k.fillStyle = 'rgba(110,64,100,0.42)'; k.translate(8, 26); hem(k); k.fill() })
  softBatch(ctx, 5, k => { k.strokeStyle = 'rgba(110,64,100,0.35)'; k.lineWidth = 10; hemLine(k, 8) })
  ctx.save()
  hem(ctx)
  const g = ctx.createLinearGradient(0, -80, 0, 220)
  g.addColorStop(0, rgba(shade(col, -0.08))); g.addColorStop(1, rgba(col))
  ctx.fillStyle = g
  ctx.fill()
  ctx.clip()
  terry(ctx, -40, -80, 1104, 320, col, 77, 0.02)
  // Hanging folds: each a shaded valley beside a lit ridge, running down to the hem.
  softBatch(ctx, 9, k => {
    for (let i = 0; i < 9; i++) {
      const x = 40 + i * 118 + r.range(-30, 30)
      k.strokeStyle = rgba(shade(col, -0.22), 0.55); k.lineWidth = r.range(12, 22)
      k.beginPath(); k.moveTo(x + r.range(-30, 30), -60); k.quadraticCurveTo(x + r.range(-20, 20), 60, x, drapeY(x) + 6); k.stroke()
      k.strokeStyle = rgba([255, 255, 255], 0.75); k.lineWidth = r.range(8, 14)
      k.beginPath(); k.moveTo(x - 30 + r.range(-20, 20), -60); k.quadraticCurveTo(x - 26, 60, x - 22, drapeY(x - 22) + 4); k.stroke()
    }
  })
  // A woven pastel stripe near the hem, following it.
  softBatch(ctx, 1.2, k => { k.strokeStyle = rgba(stripe, 0.85); k.lineWidth = 12; hemLine(k, -34) })
  ctx.globalAlpha = 0.5
  ctx.strokeStyle = rgba(shade(stripe, 0.4)); ctx.lineWidth = 2; hemLine(ctx, -38); ctx.stroke()
  ctx.globalAlpha = 1
  terry(ctx, -40, 60, 1104, 180, stripe, 78, 0.004)
  ctx.restore()
  // The rolled hem: lit on top, tucked into shade underneath.
  softBatch(ctx, 2, k => {
    k.strokeStyle = rgba(shade(col, 0.2), 0.95); k.lineWidth = 7; hemLine(k, -5); k.stroke()
    k.strokeStyle = rgba(shade(col, -0.3), 0.6); k.lineWidth = 4; hemLine(k, 1); k.stroke()
  })
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
    for (const [i, t] of toes.entries()) { const wx = 520 + (t.base.x - 512) * 0.3; k.lineWidth = i === 0 ? 22 : 12; k.beginPath(); k.moveTo(wx, -20); k.quadraticCurveTo((wx + t.base.x) / 2 + (t.base.x - 512) * 0.08, 330, t.base.x, t.base.y - t.r0 * 0.9); k.stroke() }
  })
  const nails = shapesCanvas(a.shapes.nailShapes)
  blurred(c, 1.5, () => { c.globalAlpha = 0.45; c.drawImage(nails, 0, 0) })
  c.globalAlpha = 1
  // Pores and fine texture, and short creases across the toe joints.
  dots(c, [0, 0, 0], 14000, () => ({ a: r.range(0.08, 0.22), x: r.range(180, 850), y: r.range(0, 1000), r: r.range(0.8, 1.6) }))
  // Gloss: a soft sheen over the top of the foot, more on the knuckles, toe tips and ankle bones; nails shine most.
  const [gl, g] = canvas(S)
  g.fillStyle = '#000'
  g.fillRect(0, 0, S, S)
  g.globalAlpha = 0.2
  g.drawImage(sil, 0, 0)
  g.globalAlpha = 1
  for (const [i, t] of toes.entries()) { const kn = alongToe(t, i === 0 ? 0.48 : 0.44, -0.2); blob(g, kn.x, kn.y, t.r0 * 0.5, t.r0 * 0.4, [255, 255, 255], 0.45) }
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
  // Shadows on the sole stay warm and a little red (a grey shadow reads as mud on deep tones).
  const ao = mixRGB(aoOf(sole), [240, 160, 140], 0.3)
  const lg = s.createLinearGradient(300, 80, 740, 980)
  lg.addColorStop(0, rgba(mixRGB(sole.base, sole.light, 0.3))); lg.addColorStop(0.55, rgba(sole.base)); lg.addColorStop(1, rgba(mixRGB(sole.base, sole.shadow, 0.3)))
  s.fillStyle = lg
  s.fillRect(0, 0, S, S)
  s.globalCompositeOperation = 'soft-light'
  s.globalAlpha = 0.16
  s.drawImage(fbm(S, 50, 4, seed + 2), 0, 0)
  s.globalAlpha = 1
  s.globalCompositeOperation = 'source-over'
  skinDabs(s, sole, seed + 1, 320, 740, 80, 990, 160)
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
    softBatch(s, Math.max(16, rx * 0.36), c => { c.fillStyle = rgba(mixRGB(mixRGB(sole.light, sole.blush, 0.15), [255, 238, 224], 0.3), 0.7 * lift); c.beginPath(); c.ellipse(x - rx * 0.2, y - ry * 0.22, rx * 0.62, ry * 0.52, rot, 0, Math.PI * 2); c.fill() })
    softBatch(s, Math.max(8, rx * 0.14), c => { c.fillStyle = rgba(sole.blush, 0.18 * lift); c.beginPath(); c.ellipse(x, y, rx * 0.8, ry * 0.75, rot, 0, Math.PI * 2); c.fill() })
    softBatch(s, Math.max(10, rx * 0.16), c => { c.strokeStyle = rgba(ao, 0.42 * lift); c.lineWidth = rx * 0.26; c.beginPath(); c.ellipse(x + rx * 0.06, y + ry * 0.1, rx * 0.98, ry * 0.95, rot, -0.2, Math.PI * 1.1); c.stroke() }, 'multiply')
  }
  pad(sx(552), 862, 132 * w, 118, 0, 1)
  pad(sx(540), 392, 190 * w, 72, 0.12, 0.8)
  pad(sx(392) - a.shape.bunion * 10, 392, 70 * w, 62, 0, 0.45)
  // The outer edge carries weight: a lighter, flatter band; the arch is thin, pinker, unworn skin.
  softBatch(s, 20, c => { c.fillStyle = rgba(sole.light, 0.35); c.beginPath(); c.ellipse(sx(684), 650, 30 * w, 200, 0.05, 0, Math.PI * 2); c.fill() })
  blob(s, sx(452), 640, 50 * w, 140, mixRGB(sole.blush, sole.light, 0.3), 0.26)
  // Toes from below: round pads, each lit at its top left with a soft shine, warm where the blood shows, shaded
  // round its lower right; a crease where each meets the next; faded toward the root, where the toe tucks
  // into the ball in one fold.
  const [tc, tx] = canvas(S)
  for (const [i, t] of toes.entries()) {
    tx.clearRect(0, 0, S, S)
    // The neck between the pads, a little darker.
    tx.fillStyle = rgba(mixRGB(sole.base, ao, 0.25))
    tx.beginPath(); shapePath(tx, { t: 'capsule', x0: t.base.x, y0: t.base.y, x1: alongToe(t, 0.8).x, y1: alongToe(t, 0.8).y, r0: t.r0 * 0.93, r1: t.r1 * 0.92 }); tx.fill()
    const pads = soleToePads(t)
    for (const [j, pd] of pads.entries()) {
      // A soft shadow under the pad on the one below it.
      softBatch(tx, 4, c => { c.fillStyle = rgba(ao, 0.3); c.beginPath(); c.ellipse(pd.x + 2, pd.y + pd.ry * 0.25, pd.rx * 0.98, pd.ry * 0.95, pd.rot, 0, Math.PI * 2); c.fill() }, 'multiply')
      const g = tx.createRadialGradient(pd.x - pd.rx * 0.3, pd.y - pd.ry * 0.35, pd.rx * 0.1, pd.x, pd.y, Math.max(pd.rx, pd.ry) * 1.05)
      g.addColorStop(0, rgba(mixRGB(sole.base, sole.light, 0.7))); g.addColorStop(0.55, rgba(mixRGB(sole.base, sole.blush, 0.15))); g.addColorStop(0.9, rgba(mixRGB(sole.base, ao, 0.2))); g.addColorStop(1, rgba(mixRGB(sole.base, ao, 0.3)))
      tx.fillStyle = g
      tx.beginPath(); tx.ellipse(pd.x, pd.y, pd.rx, pd.ry, pd.rot, 0, Math.PI * 2); tx.fill()
      blob(tx, pd.x - pd.rx * 0.28, pd.y - pd.ry * 0.3, pd.rx * 0.42, pd.ry * 0.26, sole.light, j === pads.length - 1 ? 0.4 : 0.28)
    }
    // The creases at the joints: a dark fold under each pad, lit just below.
    const d = toeDir(t), n = { x: -d.y, y: d.x }
    for (const pd of pads) {
      const q = { x: pd.x - d.x * pd.ry * 0.95, y: pd.y - d.y * pd.ry * 0.95 }, cw = pd.rx * 0.8
      tx.lineCap = 'round'
      tx.strokeStyle = rgba(ao, 0.5); tx.lineWidth = i === 0 ? 3 : 2.2
      tx.beginPath(); tx.moveTo(q.x - n.x * cw, q.y - n.y * cw + 2); tx.quadraticCurveTo(q.x - d.x * 5, q.y - d.y * 5, q.x + n.x * cw, q.y + n.y * cw + 2); tx.stroke()
    }
    const p0 = alongToe(t, -0.1), p1 = alongToe(t, 0.2)
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
      c.strokeStyle = rgba(ao, 0.4); c.lineWidth = 5
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
  for (const t of a.shape.soleToes) { for (const pd of soleToePads(t)) blob(c, pd.x, pd.y, pd.rx, pd.ry, [255, 255, 255], 0.4); const q = alongToe(t, 0.04); blob(c, q.x, q.y, t.r0 * 0.9, 8, [0, 0, 0], 0.45) }
  dots(c, [0, 0, 0], 7000, () => ({ a: r.range(0.06, 0.18), x: r.range(300, 760), y: r.range(80, 1000), r: r.range(0.7, 1.3) }))
  const [gl, g] = canvas(S)
  g.fillStyle = '#000'
  g.fillRect(0, 0, S, S)
  g.globalAlpha = 0.14
  g.drawImage(sil, 0, 0)
  g.globalAlpha = 1
  blob(g, sx(530), 830, 100 * w, 80, [255, 255, 255], 0.55)
  blob(g, sx(520), 380, 170 * w, 56, [255, 255, 255], 0.45)
  blob(g, sx(392), 390, 50 * w, 44, [255, 255, 255], 0.4)
  for (const t of a.shape.soleToes) for (const pd of soleToePads(t)) blob(g, pd.x - pd.rx * 0.2, pd.y - pd.ry * 0.25, pd.rx * 0.6, pd.ry * 0.5, [255, 255, 255], 0.28)
  return packHeight(h, gl)
}


// ---------------------------------------------------------------- layer sheets

/** A layer sheet: paint, then keep it inside the mask (feathered by `feather` px). */
function sheet(mask: HTMLCanvasElement, draw: (c: Ctx) => void, feather = 0) {
  const [c, ctx] = canvas(S)
  draw(ctx)
  if (feather) {
    const [m, mctx] = canvas(S)
    mctx.filter = `blur(${feather}px)`
    mctx.drawImage(mask, 0, 0)
    clipTo(ctx, m)
  } else clipTo(ctx, mask)
  return c
}

/** The painted nails' own outlines as a mask (layers on the nails follow the art, not the region capsules). */
function nailMask(a: FootAnatomy, grow = 0) {
  const [c, ctx] = canvas(S)
  ctx.fillStyle = '#fff'
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = grow * 2
  ctx.lineJoin = 'round'
  a.shape.toes.forEach((t, i) => { ctx.beginPath(); smoothPath(ctx, nailOutline(toeNail(t), a.shape.nailShape, i)); ctx.fill(); if (grow) ctx.stroke() })
  return c
}

/** The mask minus a hole (skin-only layers: the foot minus the nails). */
function without(mask: HTMLCanvasElement, hole: HTMLCanvasElement) {
  const [c, ctx] = canvas(S)
  ctx.drawImage(mask, 0, 0)
  ctx.globalCompositeOperation = 'destination-out'
  ctx.drawImage(hole, 0, 0)
  return c
}

function whole() { const [c, ctx] = canvas(S); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, S, S); return c }

/** Water droplets and a wet film (after the bath or a rinse). */
function paintWet(l: Ctx, seed: number, x0: number, x1: number, y0: number, y1: number) {
  const r = makeRng(seed + 2)
  l.drawImage(tintedByNoise(S, [240, 248, 255], fbm(S, 40, 3, seed + 2), 0.05, 0.18), 0, 0)
  const drops = Array.from({ length: 150 }, () => ({ x: r.range(x0, x1), y: r.range(y0, y1), r: r() < 0.85 ? r.range(2.5, 6) : r.range(7, 12) }))
  softBatch(l, 1.2, c => { c.fillStyle = 'rgba(120,90,110,0.18)'; for (const d of drops) { c.beginPath(); c.ellipse(d.x + d.r * 0.25, d.y + d.r * 0.35, d.r, d.r * 1.1, 0, 0, Math.PI * 2); c.fill() } }, 'multiply')
  for (const d of drops) {
    const g = l.createRadialGradient(d.x - d.r * 0.3, d.y - d.r * 0.3, d.r * 0.1, d.x, d.y, d.r * 1.1)
    g.addColorStop(0, 'rgba(255,255,255,0.35)'); g.addColorStop(0.6, 'rgba(236,246,255,0.18)'); g.addColorStop(0.92, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)')
    l.fillStyle = g
    l.beginPath(); l.ellipse(d.x, d.y, d.r, d.r * 1.1, 0, 0, Math.PI * 2); l.fill()
    blob(l, d.x - d.r * 0.35, d.y - d.r * 0.4, d.r * 0.3, d.r * 0.24, [255, 255, 255], 0.95)
  }
}

/** Foam: thousands of bubbles, each a soft shadowed rim, a white body and a glint, in a few batched fills. */
function paintFoam(l: Ctx, seed: number, x0: number, x1: number, y0: number, y1: number) {
  const r = makeRng(seed + 101)
  l.fillStyle = 'rgba(252,250,255,0.9)'
  l.fillRect(0, 0, S, S)
  for (let batch = 0; batch < 4; batch++) {
    const bubbles = Array.from({ length: 1100 }, () => { const rr = r() < 0.88 ? r.range(2.5, 9) : r.range(10, 22); return { x: r.range(x0, x1), y: r.range(y0, y1), r: rr } })
    dots(l, [214, 214, 236], bubbles.length, i => ({ ...bubbles[i], a: r.range(0.3, 0.65) }), 3)
    dots(l, [255, 255, 255], bubbles.length, i => ({ x: bubbles[i].x - bubbles[i].r * 0.25, y: bubbles[i].y - bubbles[i].r * 0.25, r: bubbles[i].r * 0.7, a: r.range(0.7, 1) }), 3)
    dots(l, [255, 255, 255], bubbles.length, i => ({ x: bubbles[i].x - bubbles[i].r * 0.4, y: bubbles[i].y - bubbles[i].r * 0.4, r: bubbles[i].r * 0.22, a: 1 }), 1)
  }
  // A few big clear bubbles with a faint rainbow rim, as in the scrub foam of the reference.
  for (let i = 0; i < 26; i++) {
    const x = r.range(x0, x1), y = r.range(y0, y1), rr = r.range(9, 18)
    l.strokeStyle = 'rgba(200,210,240,0.7)'; l.lineWidth = 1.6
    l.beginPath(); l.arc(x, y, rr, 0, Math.PI * 2); l.stroke()
    l.strokeStyle = 'rgba(255,220,240,0.5)'; l.lineWidth = 1.2
    l.beginPath(); l.arc(x, y, rr - 1.5, Math.PI * 0.1, Math.PI * 0.9); l.stroke()
    blob(l, x - rr * 0.4, y - rr * 0.45, rr * 0.28, rr * 0.18, [255, 255, 255], 1)
  }
}

/** Thick white cream spread with soft swirls where it was scooped (foot cream; the antifungal cream is whiter). */
function paintCream(l: Ctx, seed: number, x0: number, x1: number, y0: number, y1: number, tint: RGB = [255, 250, 244]) {
  l.fillStyle = rgba(tint)
  l.fillRect(0, 0, S, S)
  l.globalCompositeOperation = 'multiply'
  l.globalAlpha = 0.22
  l.drawImage(fbm(S, 60, 3, seed + 90), 0, 0)
  l.globalAlpha = 1
  l.globalCompositeOperation = 'source-over'
  const r = makeRng(seed + 91)
  softBatch(l, 2.5, c => {
    for (let i = 0; i < 90; i++) {
      const x = r.range(x0, x1), y = r.range(y0, y1), rr = r.range(12, 36)
      c.strokeStyle = r() < 0.5 ? 'rgba(226,214,208,0.55)' : 'rgba(255,255,255,0.85)'
      c.lineWidth = r.range(3, 7)
      c.beginPath(); c.arc(x, y, rr, r() * 6, r() * 6 + r.range(1.2, 2.4)); c.stroke()
    }
  })
}

/** Pink salt scrub: coarse translucent crystals in a light oily base. */
function paintSalt(l: Ctx, seed: number, x0: number, x1: number, y0: number, y1: number) {
  const r = makeRng(seed + 131)
  l.fillStyle = 'rgba(252,226,232,0.55)'
  l.fillRect(0, 0, S, S)
  const cols: RGB[] = [[246, 176, 196], [252, 214, 222], [255, 244, 246], [236, 150, 176]]
  const grains = Array.from({ length: 2600 }, () => ({ x: r.range(x0, x1), y: r.range(y0, y1), s: r.range(2.5, 7), a: r.range(0, Math.PI), c: r.int(0, 3) }))
  softBatch(l, 1.5, c => { c.fillStyle = 'rgba(140,70,100,0.25)'; for (const g of grains) { c.beginPath(); c.ellipse(g.x + 1.5, g.y + 2, g.s, g.s * 0.8, g.a, 0, Math.PI * 2); c.fill() } }, 'multiply')
  // One path per colour: facetted crystals.
  for (let ci = 0; ci < cols.length; ci++) {
    const path = new Path2D()
    for (const g of grains) {
      if (g.c !== ci) continue
      for (let k = 0; k < 5; k++) { const aa = g.a + (k / 5) * Math.PI * 2, d = g.s * (0.7 + (k % 3) * 0.12); if (k === 0) path.moveTo(g.x + Math.cos(aa) * d, g.y + Math.sin(aa) * d); else path.lineTo(g.x + Math.cos(aa) * d, g.y + Math.sin(aa) * d) }
      path.closePath()
    }
    l.fillStyle = rgba(cols[ci], 0.95)
    l.fill(path)
  }
  dots(l, [255, 255, 255], grains.length, i => ({ x: grains[i].x - grains[i].s * 0.3, y: grains[i].y - grains[i].s * 0.3, r: grains[i].s * 0.25, a: 0.9 }), 1)
}

/** A peel-off gel mask: lavender, glossy, brush-streaked, with tiny caught bubbles and a sheen. */
function paintGelMask(l: Ctx, seed: number, x0: number, x1: number, y0: number, y1: number) {
  const r = makeRng(seed + 111)
  const base: RGB = [196, 172, 238]
  l.fillStyle = rgba(base, 0.92)
  l.fillRect(0, 0, S, S)
  for (let i = 0; i < 700; i++) {
    const x = r.range(x0, x1), y = r.range(y0, y1), a = r.range(-0.6, 0.6) + Math.PI / 2, len = r.range(30, 100)
    l.strokeStyle = rgba(shade(base, r.range(-0.12, 0.14)), r.range(0.15, 0.4))
    l.lineWidth = r.range(3, 9)
    l.beginPath(); l.moveTo(x, y); l.quadraticCurveTo(x + len * 0.5 * Math.cos(a) + 8, y + len * 0.5 * Math.sin(a), x + len * Math.cos(a), y + len * Math.sin(a)); l.stroke()
  }
  l.globalCompositeOperation = 'soft-light'
  l.drawImage(fbm(S, 30, 4, seed + 112), 0, 0)
  l.globalCompositeOperation = 'source-over'
  for (let i = 0; i < 180; i++) { const x = r.range(x0, x1), y = r.range(y0, y1), rr = r.range(1.5, 4.5); blob(l, x, y, rr, rr, [240, 230, 255], 0.7, 0.4); blob(l, x - rr * 0.3, y - rr * 0.3, rr * 0.35, rr * 0.3, [255, 255, 255], 0.95) }
  blob(l, 440, 300, 180, 260, [240, 232, 255], 0.25)
}

/**
 * The foot bath: looking down through warm water. An aqua tint that deepens away from the light, a net of
 * caustic light over everything, streams of rising bubbles, rafts of foam at the edges and a soft glint.
 */
function paintWater(l: Ctx, seed: number) {
  const r = makeRng(seed + 141)
  const g = l.createLinearGradient(0, 0, S, S)
  g.addColorStop(0, 'rgba(150,222,226,0.38)'); g.addColorStop(1, 'rgba(96,180,204,0.5)')
  l.fillStyle = g
  l.fillRect(0, 0, S, S)
  softBatch(l, 1.6, c => {
    c.strokeStyle = 'rgba(236,255,255,0.5)'
    for (let i = 0; i < 260; i++) {
      const x = r.range(-20, S + 20), y = r.range(-20, S + 20), rr = r.range(18, 46)
      c.lineWidth = r.range(1.5, 3.5)
      c.beginPath()
      for (let k = 0; k <= 7; k++) { const aa = (k / 7) * Math.PI * 2, d = rr * r.range(0.7, 1.15); if (k === 0) c.moveTo(x + Math.cos(aa) * d, y + Math.sin(aa) * d); else c.quadraticCurveTo(x + Math.cos(aa - 0.45) * d * 1.1, y + Math.sin(aa - 0.45) * d * 1.1, x + Math.cos(aa) * d, y + Math.sin(aa) * d) }
      c.stroke()
    }
  }, 'screen')
  softBatch(l, 14, c => {
    for (let i = 0; i < 9; i++) {
      const y = r.range(0, S), bend = r.range(-60, 60)
      c.strokeStyle = i % 2 ? 'rgba(255,255,255,0.22)' : 'rgba(40,110,140,0.14)'; c.lineWidth = r.range(14, 30)
      c.beginPath(); c.moveTo(-20, y); c.quadraticCurveTo(S / 2, y + bend, S + 20, y + r.range(-40, 40)); c.stroke()
    }
  })
  const bubbles: { x: number; y: number; r: number }[] = []
  for (let s2 = 0; s2 < 8; s2++) {
    let x = r.range(120, 900), y = r.range(80, 960)
    for (let k = 0; k < 16; k++) { bubbles.push({ x, y, r: r.range(2, 7) }); x += r.range(-10, 10); y += r.range(8, 20) }
  }
  for (let i = 0; i < 420; i++) bubbles.push({ x: r.range(0, S), y: r.range(0, S), r: r() < 0.9 ? r.range(1.2, 3.5) : r.range(5, 10) })
  const rims = new Path2D()
  for (const b of bubbles) { rims.moveTo(b.x + b.r, b.y); rims.arc(b.x, b.y, b.r, 0, Math.PI * 2) }
  l.strokeStyle = 'rgba(255,255,255,0.75)'; l.lineWidth = 1.2
  l.stroke(rims)
  dots(l, [255, 255, 255], bubbles.length, i => ({ x: bubbles[i].x - bubbles[i].r * 0.35, y: bubbles[i].y - bubbles[i].r * 0.4, r: bubbles[i].r * 0.32, a: 1 }), 1)
  for (let i = 0; i < 7; i++) {
    const edge = r.int(0, 3), t = r.range(0.1, 0.9)
    const x = edge === 0 ? t * S : edge === 1 ? S - r.range(10, 80) : edge === 2 ? t * S : r.range(10, 80)
    const y = edge === 0 ? r.range(10, 80) : edge === 1 ? t * S : edge === 2 ? S - r.range(10, 80) : t * S
    dots(l, [255, 255, 255], 40, () => ({ x: x + r.range(-60, 60), y: y + r.range(-30, 30), r: r.range(3, 10), a: r.range(0.6, 0.9) }), 2)
  }
  blob(l, 300, 220, 160, 60, [255, 255, 255], 0.3)
}

function topLayers(look: Look, skin: SkinTone, seed: number, a: FootAnatomy, sil: HTMLCanvasElement, p: FootProfile): Record<string, () => HTMLCanvasElement> {
  const toes = a.shape.toes
  const nails = nailMask(a)
  // The foot below the cuff.
  const foot = (() => { const [c, ctx] = canvas(S); ctx.drawImage(sil, 0, 0); ctx.globalCompositeOperation = 'destination-out'; ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(S, -10); for (let x = S; x >= 0; x -= 16) ctx.lineTo(x, drapeY(x) + 4); ctx.closePath(); ctx.fill(); return c })()
  const skinOnly = without(foot, nails)
  const toesMask = (() => { const [c, ctx] = canvas(S); ctx.fillStyle = '#fff'; for (const t of toes) { ctx.beginPath(); smoothPath(ctx, toeOutline(t, 0.1)); ctx.fill() } return c })()
  const inflamed = inflamedOf(skin)
  const bigNail = toeNail(toes[0])
  const ingrownSide = p.ingrown || 1
  const X0 = 180, X1 = 850, Y0 = CUFF_Y, Y1 = 990
  const polishCol = hex(POLISH_COLORS[(p.polish?.color ?? 1) % POLISH_COLORS.length].hex)
  const hair = HAIR[look.hair % HAIR.length]
  return {
    // Angry skin around sick nails, an ingrown edge, corns and between the toes: blotchy, never flat.
    redness: () => sheet(skinOnly, l => {
      softBatch(l, 12, c => {
        toes.forEach((t, i) => {
          const k = Math.max(p.fungus[i], i === 0 && p.ingrown ? 0.8 : 0, 0.25)
          const nl = toeNail(t), m = alongToe(t, 0.78)
          c.fillStyle = rgba(inflamed, 0.35 + 0.5 * k)
          c.beginPath(); c.ellipse(m.x, m.y, t.r1 * 1.25, Math.hypot(nl.tip.x - nl.base.x, nl.tip.y - nl.base.y) * 0.8, Math.atan2(nl.dir.y, nl.dir.x) + Math.PI / 2, 0, Math.PI * 2); c.fill()
          const root = alongToe(t, 0.1)
          c.fillStyle = rgba(inflamed, 0.3 * k); c.beginPath(); c.ellipse(root.x, root.y, t.r0 * 0.9, t.r0 * 0.7, 0, 0, Math.PI * 2); c.fill()
        })
        for (const cn of p.corns) { c.fillStyle = rgba(inflamed, 0.5); c.beginPath(); c.arc(cn.x, cn.y, cn.size * 1.6, 0, Math.PI * 2); c.fill() }
        for (let i = 0; i < 4; i++) { const q = alongToe(toes[i], 0.15), n2 = alongToe(toes[i + 1], 0.15); c.fillStyle = rgba(inflamed, 0.5); c.beginPath(); c.ellipse((q.x + n2.x) / 2, (q.y + n2.y) / 2 + 28, 26, 70, 0, 0, Math.PI * 2); c.fill() }
      })
      l.globalCompositeOperation = 'destination-in'
      l.drawImage(tintedByNoise(S, [255, 255, 255], fbm(S, 26, 3, seed + 51), 0.45, 1), 0, 0)
      l.globalCompositeOperation = 'source-over'
      const r = makeRng(seed + 52)
      toes.forEach((t, i) => { if (!p.fungus[i]) return; dots(l, mixRGB(inflamed, [200, 60, 80], 0.4), 30, () => { const q = alongToe(t, r.range(0.55, 1), r.range(-1, 1)); return { x: q.x, y: q.y, r: r.range(1, 2.4), a: r.range(0.2, 0.5) } }, 2) })
    }),
    // An ingrown nail: the fold along one side of the big toenail swells, red and shiny, over the nail's edge.
    swelling: () => sheet(foot, l => {
      const nx = -bigNail.dir.y * ingrownSide, ny = bigNail.dir.x * ingrownSide, hw = bigNail.halfWidth
      const at = (u: number, o: number) => ({ x: bigNail.base.x + (bigNail.tip.x - bigNail.base.x) * u + nx * o, y: bigNail.base.y + (bigNail.tip.y - bigNail.base.y) * u + ny * o })
      const path = (c: Ctx, o0: number, o1: number) => {
        c.beginPath()
        const p0 = at(0.15, o0), p1 = at(0.55, o0 - 6), p2 = at(0.95, o0 - 2), q2 = at(0.95, o1), q1 = at(0.55, o1 + 6), q0 = at(0.15, o1)
        c.moveTo(p0.x, p0.y); c.quadraticCurveTo(p1.x, p1.y, p2.x, p2.y); c.lineTo(q2.x, q2.y); c.quadraticCurveTo(q1.x, q1.y, q0.x, q0.y); c.closePath()
      }
      softBatch(l, 9, c => { c.fillStyle = rgba(inflamed, 0.75); path(c, hw * 0.65, hw * 1.55); c.fill() })
      const g0 = at(0.5, hw * 0.75), g1 = at(0.5, hw * 1.35)
      softBatch(l, 3, c => {
        const g = c.createLinearGradient(g0.x, g0.y, g1.x, g1.y)
        g.addColorStop(0, rgba(shade(inflamed, -0.2), 0.95)); g.addColorStop(0.5, rgba(mixRGB(inflamed, skin.light, 0.25), 0.95)); g.addColorStop(1, rgba(inflamed, 0.5))
        c.fillStyle = g; path(c, hw * 0.78, hw * 1.3); c.fill()
      })
      // The shine of stretched skin, and the dark line where it presses into the nail.
      const s0 = at(0.3, hw * 1.02), s1 = at(0.8, hw * 1.0)
      blurred(l, 2, () => { l.strokeStyle = 'rgba(255,240,240,0.75)'; l.lineWidth = 3; l.lineCap = 'round'; l.beginPath(); l.moveTo(s0.x, s0.y); l.lineTo(s1.x, s1.y); l.stroke() })
      const e0 = at(0.2, hw * 0.8), e1 = at(0.92, hw * 0.78)
      blurred(l, 1, () => { l.strokeStyle = rgba(shade(inflamed, -0.45), 0.7); l.lineWidth = 2.2; l.beginPath(); l.moveTo(e0.x, e0.y); l.lineTo(e1.x, e1.y); l.stroke() })
    }),
    // Fungus: thick, yellow, crumbling nails. The plate is broken into pieces by dark cracks (each piece a little
    // raised, lit on its upper edge), stained brown toward the base, chalky and missing chunks at the free edge.
    fungus: () => sheet(nailMask(a, 2), l => {
      toes.forEach((t, i) => {
        const k = p.fungus[i]
        if (!k) return
        const nl = toeNail(t), hw = nl.halfWidth, dir = nl.dir, nx = -dir.y, ny = dir.x
        const len = Math.hypot(nl.tip.x - nl.base.x, nl.tip.y - nl.base.y)
        const along = (u: number, side = 0) => ({ x: nl.base.x + (nl.tip.x - nl.base.x) * u + nx * side * hw, y: nl.base.y + (nl.tip.y - nl.base.y) * u + ny * side * hw })
        const r = makeRng(seed + 700 + i)
        const outline = nailOutline(nl, a.shape.nailShape, i)
        l.save()
        l.beginPath(); smoothPath(l, outline); l.clip()
        // The gaps between the pieces.
        l.fillStyle = rgba([112, 74, 30], 0.55 + 0.45 * k)
        l.fillRect(0, 0, S, S)
        // The pieces: Voronoi cells around scattered points, each inset a little to open the crack.
        const n = i === 0 ? Math.round(5 + 13 * k) : Math.round(2 + 4 * k)
        const pts = Array.from({ length: n }, () => along(r.range(0.02, 1.05), r.range(-1, 1)))
        const gap = (i === 0 ? 1.4 : 0.9) + 1.4 * k
        for (const [pi, c] of pts.entries()) {
          const poly: number[] = []
          for (let j = 0; j < 20; j++) {
            const ang = (j / 20) * Math.PI * 2, dx = Math.cos(ang), dy = Math.sin(ang)
            let reach = hw * 3
            for (const [qi, q] of pts.entries()) {
              if (qi === pi) continue
              const vx = q.x - c.x, vy = q.y - c.y, dot = vx * dx + vy * dy
              if (dot > 1e-3) reach = Math.min(reach, (vx * vx + vy * vy) / (2 * dot))
            }
            reach = Math.max(0, reach - gap)
            poly.push(c.x + dx * reach, c.y + dy * reach)
          }
          const tone: RGB = mixRGB(mixRGB([236, 202, 108], [214, 166, 72], r()), [250, 234, 180], 0.25 * (1 - k))
          const gg = l.createLinearGradient(c.x - hw * 0.4, c.y - hw * 0.4, c.x + hw * 0.4, c.y + hw * 0.4)
          gg.addColorStop(0, rgba(mixRGB(tone, [255, 246, 214], 0.45))); gg.addColorStop(0.55, rgba(tone)); gg.addColorStop(1, rgba(shade(tone, -0.18)))
          l.fillStyle = gg
          l.beginPath(); smoothPath(l, poly); l.fill()
          // Its raised, lit upper edge.
          l.strokeStyle = 'rgba(255,248,222,0.55)'; l.lineWidth = i === 0 ? 1.6 : 1
          l.beginPath(); for (let j = 11; j <= 17; j++) { const x = poly[j * 2], y = poly[j * 2 + 1]; if (j === 11) l.moveTo(x, y); else l.lineTo(x, y) } l.stroke()
        }
        // Brown stain from the base, mottling, and chalky crumbs toward the free edge.
        const b0 = along(0.02), b1 = along(0.6)
        const bg = l.createLinearGradient(b0.x, b0.y, b1.x, b1.y)
        bg.addColorStop(0, rgba([150, 96, 40], 0.45 * k)); bg.addColorStop(1, rgba([150, 96, 40], 0))
        l.fillStyle = bg
        l.fillRect(0, 0, S, S)
        l.globalCompositeOperation = 'multiply'
        l.globalAlpha = 0.35 * k
        l.drawImage(fbm(256, 8, 3, seed + i * 3), along(0.5).x - 128, along(0.5).y - 128)
        l.globalAlpha = 1
        l.globalCompositeOperation = 'source-over'
        dots(l, [255, 248, 222], Math.round(30 * k * (hw / 16)), () => { const q = along(r.range(0.7, 1.05), r.range(-1, 1)); return { x: q.x, y: q.y, r: r.range(0.8, hw * 0.08 + 1), a: r.range(0.5, 0.95) } }, 2)
        // Missing chunks at the crumbling free edge.
        l.globalCompositeOperation = 'destination-out'
        for (let c2 = 0; c2 < Math.round(1 + 3 * k); c2++) {
          const q = along(r.range(0.92, 1.08), r.range(-0.9, 0.9)), rr = hw * r.range(0.12, 0.28)
          l.beginPath()
          for (let j = 0; j < 7; j++) { const aa = (j / 7) * Math.PI * 2, d = rr * r.range(0.6, 1.2); if (j === 0) l.moveTo(q.x + Math.cos(aa) * d, q.y + Math.sin(aa) * d); else l.lineTo(q.x + Math.cos(aa) * d, q.y + Math.sin(aa) * d) }
          l.closePath(); l.fill()
        }
        l.globalCompositeOperation = 'source-over'
        l.restore()
        // Thick: a dark line under the lifted free edge.
        const e = along(1.0)
        softBatch(l, 1.2, c => { c.strokeStyle = rgba([90, 56, 24], 0.55 * k); c.lineWidth = Math.max(2, hw * 0.14); c.beginPath(); c.ellipse(e.x, e.y, hw * 0.9, hw * 0.28, Math.atan2(dir.y, dir.x) + Math.PI / 2, Math.PI * 0.08, Math.PI * 0.92); c.stroke() })
        void len
      })
    }),
    // Calluses where shoes rub: yellowish, rough, thick skin on the inner side of the big toe and its joint, and
    // on the outer side of the little toe.
    callus: () => sheet(skinOnly, l => {
      const k = p.calluses
      const yel: RGB = mixRGB(mixRGB(skin.base, [236, 210, 150], 0.55), skin.light, 0.12)
      const big = toes[0], little = toes[4]
      softBatch(l, 12, c => {
        c.fillStyle = rgba(yel, 0.5 + 0.45 * k)
        const q0 = alongToe(big, 0.55, 0.85); c.beginPath(); c.ellipse(q0.x, q0.y, big.r0 * 0.35, big.r0 * (0.6 + 0.4 * k), -0.1, 0, Math.PI * 2); c.fill()
        const q1 = alongToe(big, -0.15, 0.9); c.beginPath(); c.ellipse(q1.x + 6, q1.y, big.r0 * 0.4, big.r0 * 0.7, 0, 0, Math.PI * 2); c.fill()
        const q2 = alongToe(little, 0.45, -0.85); c.beginPath(); c.ellipse(q2.x, q2.y, little.r0 * 0.45, little.r0 * (0.6 + 0.3 * k), 0.2, 0, Math.PI * 2); c.fill()
      })
      l.globalCompositeOperation = 'destination-in'
      l.drawImage(tintedByNoise(S, [255, 255, 255], fbm(S, 16, 3, seed + 95), 0.5, 1), 0, 0)
      l.globalCompositeOperation = 'source-over'
      const r = makeRng(seed + 96)
      l.save()
      l.globalCompositeOperation = 'source-atop'
      const lines = new Path2D()
      for (let i = 0; i < 220; i++) { const x = r.range(200, 860), y = r.range(500, 960), ln = r.range(4, 10), tl = r.range(-0.5, 0.5); lines.moveTo(x - ln, y - tl * ln); lines.lineTo(x + ln, y + tl * ln) }
      l.strokeStyle = rgba(shade(yel, -0.3), 0.3); l.lineWidth = 1; l.stroke(lines)
      dots(l, mixRGB(yel, [255, 250, 236], 0.6), 400, () => ({ x: r.range(200, 860), y: r.range(500, 960), r: r.range(0.8, 1.8), a: r.range(0.3, 0.6) }), 2)
      l.restore()
    }),
    oldPolish: () => sheet(nails, l => {
      if (!p.polish) return
      const r = makeRng(seed + 72)
      toes.forEach((t, i) => {
        // Polish has flaked right off a crumbling fungal nail.
        if (p.fungus[i] > 0.3) return
        const nl = toeNail(t), hw = nl.halfWidth
        l.save()
        l.beginPath(); smoothPath(l, nailOutline(nl, a.shape.nailShape, i)); l.clip()
        const mid = alongToe(t, 0.85)
        const g = l.createLinearGradient(mid.x - hw, mid.y, mid.x + hw, mid.y)
        g.addColorStop(0, rgba(shade(polishCol, 0.1))); g.addColorStop(0.5, rgba(shade(polishCol, -0.05))); g.addColorStop(1, rgba(shade(polishCol, -0.25)))
        l.fillStyle = g
        l.fillRect(0, 0, S, S)
        // Dulled and scuffed: faint scratches and a tired sheen.
        l.strokeStyle = 'rgba(255,255,255,0.2)'; l.lineWidth = 1
        for (let k = 0; k < 14; k++) { const q = alongToe(t, r.range(0.6, 1), r.range(-0.8, 0.8)); l.beginPath(); l.moveTo(q.x, q.y); l.lineTo(q.x + r.range(-10, 10), q.y + r.range(-4, 4)); l.stroke() }
        const g0 = alongToe(t, 0.7, 0.35), g1 = alongToe(t, 0.9, 0.3)
        blurred(l, 2, () => { l.strokeStyle = 'rgba(255,255,255,0.35)'; l.lineWidth = Math.max(2, hw * 0.12); l.lineCap = 'round'; l.beginPath(); l.moveTo(g0.x, g0.y); l.lineTo(g1.x, g1.y); l.stroke() })
        l.restore()
      })
      // Chips: bites out of the polish at the free edge, and a bare band grown out at the cuticle.
      const bites = new Path2D()
      toes.forEach(t => {
        const nl = toeNail(t), hw = nl.halfWidth
        for (let k = 0; k < 2 + Math.round(p.polish!.chips * 5); k++) {
          const side = r.range(-1, 1), u = r() < 0.6 ? r.range(0.78, 1.1) : r.range(0.15, 0.7)
          const cx = nl.base.x + (nl.tip.x - nl.base.x) * u - nl.dir.y * side * hw, cy = nl.base.y + (nl.tip.y - nl.base.y) * u + nl.dir.x * side * hw
          const rr = r.range(0.22, 0.55) * hw + 2
          bites.moveTo(cx + rr, cy)
          for (let j = 1; j <= 8; j++) { const aa = (j / 8) * Math.PI * 2, d = rr * r.range(0.6, 1.2); bites.lineTo(cx + Math.cos(aa) * d, cy + Math.sin(aa) * d) }
          bites.closePath()
        }
        const b0 = { x: nl.base.x - nl.dir.x * 2, y: nl.base.y - nl.dir.y * 2 }
        bites.ellipse(b0.x, b0.y, hw * 1.2, hw * 0.24 + 2 + p.polish!.chips * 3, Math.atan2(nl.dir.y, nl.dir.x) + Math.PI / 2, 0, Math.PI * 2)
      })
      l.save(); l.strokeStyle = 'rgba(255,255,255,0.45)'; l.lineWidth = 2; l.stroke(bites); l.restore()
      l.save(); l.globalCompositeOperation = 'destination-out'; l.fill(bites); l.restore()
    }),
    // Overgrown cuticles: a thin, pale, papery crescent creeping up from the nail fold onto the nail's base.
    cuticle: () => sheet(foot, l => {
      const r = makeRng(seed + 5)
      toes.forEach((t, i) => {
        const nl = toeNail(t), hw = nl.halfWidth, ang = Math.atan2(nl.dir.y, nl.dir.x) + Math.PI / 2
        const reach = hw * (0.18 + 0.22 * p.cuticle)
        const c0 = { x: nl.base.x - nl.dir.x * hw * 0.1, y: nl.base.y - nl.dir.y * hw * 0.1 }
        const film = mixRGB(skin.light, [250, 232, 224], 0.5)
        l.save()
        l.translate(c0.x, c0.y); l.rotate(ang)
        // A crescent: the outer arc follows the fold; the inner (ragged) edge reaches onto the nail.
        l.beginPath()
        l.ellipse(0, 0, hw * 1.02, hw * 0.42, 0, Math.PI, 0, true)
        const steps = 10
        for (let k = steps; k >= 0; k--) { const u = k / steps, x = -hw * 0.95 + u * hw * 1.9, y = hw * 0.28 + reach * Math.sin(u * Math.PI) * r.range(0.7, 1.1); l.lineTo(x, y) }
        l.closePath()
        l.fillStyle = rgba(film, 0.8)
        l.fill()
        l.strokeStyle = rgba(mixRGB(skin.shadow, skin.base, 0.3), 0.35); l.lineWidth = 0.8
        for (let k = 0; k < (i === 0 ? 8 : 3); k++) { const x = r.range(-hw * 0.7, hw * 0.7), y = r.range(0, hw * 0.3 + reach * 0.6); l.beginPath(); l.moveTo(x, y); l.lineTo(x + r.range(-4, 4), y + r.range(1, 4)); l.stroke() }
        l.restore()
      })
    }, 1),
    // Dirt: grows with how dirty they are, from a little dust on the toes to grime everywhere. Earthy brown,
    // never green: patches with darker cores (heaviest toward the toes and the outer edge), dragged smudges,
    // grime ground into the toe creases and clefts, and dark crescents under the nails.
    dirt: () => sheet(foot, l => {
      const r = makeRng(seed + 31)
      const k = p.dirt
      const kf = clamp01((fairOf(skin) - 0.45) / 0.4)
      const mud = mixRGB([88, 58, 38], [122, 86, 60], kf)
      // A light dusting (more on the toes).
      l.drawImage(tintedByNoise(S, mud, fbm(S, 44, 3, seed + 31), 0, 0.08 + 0.2 * k), 0, 0)
      // Patches: soft brown clouds with darker cores, more and bigger as it gets worse.
      const patches = Array.from({ length: Math.round(3 + 16 * k) }, () => {
        const toward = r() < 0.55
        const x = toward ? r.range(260, 800) : r.range(X0 + 20, X0 + 170), y = toward ? r.range(560, 900) : r.range(200, 800)
        return { x: r() < 0.5 ? x : r.range(260, 800), y: r() < 0.5 ? y : r.range(200, 900), rx: r.range(50, 120) * (0.7 + 0.5 * k), ry: r.range(34, 70) * (0.7 + 0.5 * k), a: r.range(0, Math.PI) }
      })
      softBatch(l, 26, c => { for (const pt of patches) { c.fillStyle = rgba(mud, 0.22 + 0.3 * k); c.beginPath(); c.ellipse(pt.x, pt.y, pt.rx, pt.ry, pt.a, 0, Math.PI * 2); c.fill() } })
      softBatch(l, 14, c => { for (const pt of patches) { c.fillStyle = rgba(shade(mud, -0.15), 0.1 + 0.2 * k); c.beginPath(); c.ellipse(pt.x + pt.rx * 0.1, pt.y + pt.ry * 0.1, pt.rx * 0.45, pt.ry * 0.45, pt.a, 0, Math.PI * 2); c.fill() } })
      l.save()
      l.globalCompositeOperation = 'destination-in'
      l.drawImage(tintedByNoise(S, [255, 255, 255], fbm(S, 18, 3, seed + 34), 0.55, 1), 0, 0)
      l.restore()
      // The toes: grime over their tops and packed into the clefts and the joint creases.
      softBatch(l, 12, c => {
        for (const t of toes) { const q = alongToe(t, 0.6); c.fillStyle = rgba(mud, 0.15 + 0.4 * k); c.beginPath(); c.ellipse(q.x, q.y, t.r0 * 1.05, t.r0 * 1.5, 0, 0, Math.PI * 2); c.fill() }
        for (let i = 0; i < 4; i++) { const q = alongToe(toes[i], 0.2), n2 = alongToe(toes[i + 1], 0.2); c.fillStyle = rgba(shade(mud, -0.35), 0.3 + 0.5 * k); c.beginPath(); c.ellipse((q.x + n2.x) / 2, (q.y + n2.y) / 2, 16, 60, 0, 0, Math.PI * 2); c.fill() }
      })
      softBatch(l, 1.6, c => {
        for (const [i, t] of toes.entries()) {
          const d = toeDir(t), n = { x: -d.y, y: d.x }, kn = alongToe(t, i === 0 ? 0.48 : 0.44)
          c.strokeStyle = rgba(shade(mud, -0.3), 0.15 + 0.3 * k); c.lineWidth = 2.2
          for (const j of [-0.5, 0.5]) { const cw = t.r0 * (i === 0 ? 0.5 : 0.52), off = j * (i === 0 ? 6 : 5), bow = i === 0 ? 7 : 5; c.beginPath(); c.moveTo(kn.x + d.x * off - n.x * cw, kn.y + d.y * off - n.y * cw); c.quadraticCurveTo(kn.x + d.x * (off + bow), kn.y + d.y * (off + bow), kn.x + d.x * off + n.x * cw, kn.y + d.y * off + n.y * cw); c.stroke() }
        }
      })
      // Dragged smudges, darker at the end where the dirt gathered.
      softBatch(l, 7, c => {
        for (let i = 0; i < Math.round(3 + 12 * k); i++) {
          const x = r.range(X0 + 80, X1 - 80), y = r.range(220, 880), len = r.range(40, 100), ang = r.range(-0.6, 0.6) + Math.PI / 2
          const g = c.createLinearGradient(x - Math.cos(ang) * len / 2, y - Math.sin(ang) * len / 2, x + Math.cos(ang) * len / 2, y + Math.sin(ang) * len / 2)
          g.addColorStop(0, rgba(mud, 0)); g.addColorStop(1, rgba(shade(mud, -0.2), 0.2 + 0.25 * k))
          c.strokeStyle = g; c.lineWidth = r.range(14, 26); c.lineCap = 'round'
          c.beginPath(); c.moveTo(x - Math.cos(ang) * len / 2, y - Math.sin(ang) * len / 2); c.lineTo(x + Math.cos(ang) * len / 2, y + Math.sin(ang) * len / 2); c.stroke()
        }
      })
      // Grit: fine dark specks where it is worst.
      dots(l, shade(mud, -0.3), Math.round(900 * k), () => ({ x: r.range(220, 820), y: r.range(420, 960), r: r.range(0.8, 1.8), a: r.range(0.25, 0.6) }), 2)
      toes.forEach((t, i) => {
        const nl = toeNail(t), hw = nl.halfWidth, ang = Math.atan2(nl.dir.y, nl.dir.x) + Math.PI / 2
        blurred(l, 1.5, () => {
          l.strokeStyle = rgba(shade(mud, -0.45), 0.5 + 0.45 * k); l.lineWidth = Math.max(3, hw * (0.18 + 0.15 * k)); l.lineCap = 'round'
          l.beginPath(); l.ellipse(nl.tip.x - nl.dir.x * hw * 0.25, nl.tip.y - nl.dir.y * hw * 0.25, hw * 0.85, hw * 0.3, ang, Math.PI * 0.08, Math.PI * 0.92); l.stroke()
          l.strokeStyle = rgba(shade(mud, -0.3), 0.3 + 0.35 * k); l.lineWidth = 2
          l.beginPath(); smoothPath(l, nailOutline(nl, a.shape.nailShape, i)); l.stroke()
        })
        dots(l, shade(mud, -0.2), Math.round(10 + 30 * k), () => { const q = alongToe(t, r.range(0.85, 1.05), r.range(-0.9, 0.9)); return { x: q.x, y: q.y, r: r.range(0.8, 2.2), a: r.range(0.4, 0.9) } }, 2)
      })
    }),
    // Hair: a tuft on the big toe, a few on the smaller toes, and fine hair over the top toward the ankle,
    // denser the hairier they are. Close to the skin's deep tone, with a faint light edge, so it reads as hair.
    hair: () => sheet(foot, l => {
      const r = makeRng(seed + 61)
      const col = mixRGB(mixRGB(hair.dark, hair.base, 0.3), skin.deep, 0.4)
      const put: { x: number; y: number; a: number; len: number }[] = []
      const n = p.hair
      const tuft = (t: Toe, count: number, u0: number, u1: number) => { const d = toeDir(t); for (let k = 0; k < count; k++) { const sd = r.range(-0.7, 0.7), q = alongToe(t, r.range(u0, u1), sd); put.push({ x: q.x, y: q.y, a: Math.atan2(d.y, d.x) - sd * 0.5 + r.range(-0.3, 0.3), len: r.range(7, 13) }) } }
      tuft(toes[0], Math.round(60 * n), 0.04, 0.42)
      for (const t of toes.slice(1, 4)) tuft(t, Math.round(14 * n), 0.06, 0.36)
      for (let k = 0; k < Math.round(420 * n); k++) {
        const y = CUFF_Y + 10 + (r() ** 1.2) * 480, x = r.range(240, 790)
        put.push({ x, y, a: Math.PI / 2 + (x - 512) / 500 + r.range(-0.35, 0.35), len: r.range(7, 12) * (y < 320 ? 1.25 : 1) })
      }
      const dark = new Path2D(), lit = new Path2D()
      for (const h of put) {
        const ex = h.x + Math.cos(h.a) * h.len, ey = h.y + Math.sin(h.a) * h.len, cx = h.x + Math.cos(h.a + 0.3) * h.len * 0.5, cy = h.y + Math.sin(h.a + 0.3) * h.len * 0.5
        dark.moveTo(h.x, h.y); dark.quadraticCurveTo(cx, cy, ex, ey)
        lit.moveTo(h.x - 0.7, h.y - 0.7); lit.quadraticCurveTo(cx - 0.7, cy - 0.7, ex - 0.7, ey - 0.7)
      }
      l.lineCap = 'round'
      l.strokeStyle = rgba(col, 0.55); l.lineWidth = 1.25; l.stroke(dark)
      l.strokeStyle = rgba(mixRGB(hair.light, skin.light, 0.6), 0.22); l.lineWidth = 0.6; l.stroke(lit)
    }),
    wet: () => sheet(foot, l => paintWet(l, seed, X0, X1, Y0, Y1)),
    // Antiseptic: an amber wash of iodine, darker where it pooled at its edges.
    antiseptic: () => sheet(foot, l => {
      l.drawImage(tintedByNoise(S, [214, 128, 48], fbm(S, 40, 3, seed + 81), 0.28, 0.45), 0, 0)
      const r = makeRng(seed + 82)
      softBatch(l, 3, c => { c.strokeStyle = 'rgba(170,86,30,0.35)'; c.lineWidth = 4; for (let i = 0; i < 20; i++) { c.beginPath(); c.arc(r.range(X0, X1), r.range(300, 980), r.range(20, 60), r() * 6, r() * 6 + 2); c.stroke() } })
    }, 3),
    cream: () => sheet(foot, l => paintCream(l, seed, X0, X1, Y0, Y1), 6),
    // Antifungal cream: dense and white, over the toes and nails.
    antifungal: () => sheet(toesMask, l => paintCream(l, seed + 7, X0, X1, 600, Y1, [252, 252, 250]), 4),
    oil: () => sheet(foot, l => {
      l.drawImage(tintedByNoise(S, [250, 226, 160], fbm(S, 36, 3, seed + 41), 0.06, 0.22), 0, 0)
      const r = makeRng(seed + 42)
      softBatch(l, 4, c => { c.strokeStyle = 'rgba(255,248,220,0.5)'; c.lineWidth = 5; for (let i = 0; i < 26; i++) { const x = r.range(X0, X1), y = r.range(200, 960); c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + r.range(-20, 20), y + 30, x + r.range(-30, 30), y + r.range(50, 90)); c.stroke() } })
    }),
    mask: () => sheet(foot, l => paintGelMask(l, seed, X0, X1, Y0, Y1), 3),
    scrub: () => sheet(foot, l => paintFoam(l, seed, X0, X1, Y0, Y1), 8),
    salt: () => sheet(foot, l => paintSalt(l, seed, X0, X1, Y0, Y1), 3),
    base: () => sheet(nails, l => { l.fillStyle = 'rgba(255,250,252,0.3)'; l.fillRect(0, 0, S, S) }),
    // Colour: painted at 90% grey; the layer shader maps it to the chosen colour (as for the hand).
    color: () => sheet(nails, l => {
      l.fillStyle = 'rgb(230,230,230)'
      l.fillRect(0, 0, S, S)
      toes.forEach((t, i) => {
        const nl = toeNail(t), hw = nl.halfWidth, outline = nailOutline(nl, a.shape.nailShape, i)
        l.save()
        l.beginPath(); smoothPath(l, outline); l.clip()
        blurred(l, i === 0 ? 5 : 3, () => { l.strokeStyle = 'rgb(170,170,170)'; l.lineWidth = i === 0 ? 12 : 7; l.beginPath(); smoothPath(l, outline); l.stroke() })
        const at = (u: number, side: number) => ({ x: nl.base.x + (nl.tip.x - nl.base.x) * u - nl.dir.y * side * hw, y: nl.base.y + (nl.tip.y - nl.base.y) * u + nl.dir.x * side * hw })
        const g0 = at(0.18, 0.4), g1 = at(0.72, 0.36)
        blurred(l, i === 0 ? 2.5 : 1.5, () => { l.strokeStyle = 'rgb(255,255,255)'; l.lineWidth = i === 0 ? 6 : 3.5; l.lineCap = 'round'; l.beginPath(); l.moveTo(g0.x, g0.y); l.lineTo(g1.x, g1.y); l.stroke() })
        const gd = at(0.25, -0.3)
        blob(l, gd.x, gd.y, i === 0 ? 3.5 : 2, i === 0 ? 2.5 : 1.5, [255, 255, 255], 1)
        l.restore()
      })
    }),
    top: () => sheet(nails, l => {
      l.fillStyle = 'rgba(255,255,255,0.07)'; l.fillRect(0, 0, S, S)
      toes.forEach(t => {
        const nl = toeNail(t), hw = nl.halfWidth
        const at = (u: number, side: number) => ({ x: nl.base.x + (nl.tip.x - nl.base.x) * u - nl.dir.y * side * hw, y: nl.base.y + (nl.tip.y - nl.base.y) * u + nl.dir.x * side * hw })
        const g0 = at(0.12, 0.3), g1 = at(0.8, 0.28)
        blurred(l, 2.5, () => { l.strokeStyle = 'rgba(255,255,255,0.55)'; l.lineWidth = Math.max(2, hw * 0.12); l.lineCap = 'round'; l.beginPath(); l.moveTo(g0.x, g0.y); l.lineTo(g1.x, g1.y); l.stroke() })
      })
    }),
    water: () => sheet(whole(), l => paintWater(l, seed)),
  }
}

function soleLayers(sole: SkinTone, seed: number, a: FootAnatomy, sil: HTMLCanvasElement, p: FootProfile): Record<string, () => HTMLCanvasElement> {
  const w = a.shape.width, sx = (x: number) => 512 + (x - 512) * w
  const toes = a.shape.soleToes
  const X0 = 300, X1 = 760, Y0 = 60, Y1 = 1000
  const heel = { x: sx(552), y: 862, rx: 132 * w, ry: 118 }
  const ball = { x: sx(540), y: 392, rx: 190 * w, ry: 72 }
  // Where the sole carries weight (calluses, dirt): the heel, the ball, the outer edge and the toe pads.
  const weight = (c: Ctx, k: number) => {
    c.beginPath(); c.ellipse(heel.x, heel.y + 10, heel.rx * 0.95, heel.ry * 0.95, 0, 0, Math.PI * 2); c.fill()
    c.beginPath(); c.ellipse(ball.x, ball.y, ball.rx * 0.95, ball.ry * 1.05, 0.12, 0, Math.PI * 2); c.fill()
    c.beginPath(); c.ellipse(sx(688), 640, 28 * w, 190, 0.05, 0, Math.PI * 2); c.fill()
    for (const t of toes) { const q = alongToe(t, 0.78); c.beginPath(); c.arc(q.x, q.y, t.r1 * 0.85 * k, 0, Math.PI * 2); c.fill() }
  }
  return {
    // Calluses: hard, thick, yellowed skin where it rubs: the heel, under the big toe's joint and across the
    // ball, the side of the big toe and the outer edge. Mottled, rough, a little raised and matte.
    callus: () => sheet(sil, l => {
      const k = p.calluses
      const yel: RGB = mixRGB(mixRGB(sole.base, [240, 212, 140], 0.62), sole.light, 0.08)
      softBatch(l, 14, c => {
        c.fillStyle = rgba(yel, 0.55 + 0.4 * k)
        c.beginPath(); c.ellipse(heel.x, heel.y + 16, heel.rx * (0.8 + 0.2 * k), heel.ry * (0.78 + 0.2 * k), 0, 0, Math.PI * 2); c.fill()
        c.beginPath(); c.ellipse(sx(410), 392, 64 * w, 52, 0, 0, Math.PI * 2); c.fill()
        c.beginPath(); c.ellipse(sx(520), 382, 90 * w, 44, 0.1, 0, Math.PI * 2); c.fill()
        c.beginPath(); c.ellipse(sx(708), 452, 30 * w, 50, 0.1, 0, Math.PI * 2); c.fill()
        const q = alongToe(toes[0], 0.6, 0.75); c.beginPath(); c.ellipse(q.x, q.y, 24, 40, 0, 0, Math.PI * 2); c.fill()
      })
      l.globalCompositeOperation = 'destination-in'
      l.drawImage(tintedByNoise(S, [255, 255, 255], fbm(S, 22, 3, seed + 91), 0.55, 1), 0, 0)
      l.globalCompositeOperation = 'source-over'
      // Thicker, yellower cores; a waxy, tone-on-tone surface with fine lines worn into it.
      softBatch(l, 8, c => { c.fillStyle = rgba(shade(yel, -0.08), 0.3 * k + 0.15); c.beginPath(); c.ellipse(heel.x, heel.y + 40, heel.rx * 0.6, heel.ry * 0.45, 0, 0, Math.PI * 2); c.fill(); c.beginPath(); c.ellipse(sx(410), 396, 36 * w, 30, 0, 0, Math.PI * 2); c.fill() }, 'source-atop')
      const r = makeRng(seed + 92)
      l.save()
      l.globalCompositeOperation = 'source-atop'
      l.globalAlpha = 0.14
      l.drawImage(fbm(S, 14, 3, seed + 93), 0, 0)
      l.globalAlpha = 1
      l.lineWidth = 1
      l.strokeStyle = rgba(shade(yel, -0.3), 0.22)
      const lines = new Path2D()
      for (let i = 0; i < 260; i++) { const c2 = r() < 0.6 ? heel : ball, ang = r.range(0, Math.PI * 2), d = Math.sqrt(r()) * 0.95, x = c2.x + Math.cos(ang) * c2.rx * d, y = c2.y + Math.sin(ang) * c2.ry * d, len = r.range(6, 16), t = r.range(-0.4, 0.4); lines.moveTo(x - len, y - t * len); lines.lineTo(x + len, y + t * len) }
      l.stroke(lines)
      l.restore()
    }),
    // Dry skin: pale, flaking patches over the heel and the ball.
    dry: () => sheet(sil, l => {
      const r = makeRng(seed + 71)
      const pale = mixRGB(sole.light, [255, 248, 240], 0.55)
      softBatch(l, 16, c => { c.fillStyle = rgba(pale, 0.3 + 0.3 * p.dry); weight(c, 0.8) })
      l.globalCompositeOperation = 'destination-in'
      l.drawImage(tintedByNoise(S, [255, 255, 255], fbm(S, 30, 3, seed + 72), 0.3, 1), 0, 0)
      l.globalCompositeOperation = 'source-over'
      const flakes = Array.from({ length: Math.round(160 + 360 * p.dry) }, () => {
        const c = r() < 0.55 ? heel : ball, ang = r.range(0, Math.PI * 2), d = Math.sqrt(r())
        return { x: c.x + Math.cos(ang) * c.rx * d, y: c.y + Math.sin(ang) * c.ry * d, s: r.range(2, 5.5) }
      })
      const tri = (path: Path2D, x: number, y: number, s: number) => { path.moveTo(x, y); path.lineTo(x + s, y - 1); path.lineTo(x + s * 0.6, y + s * 0.7); path.closePath() }
      const sh = new Path2D(), li = new Path2D()
      for (const f of flakes) { tri(sh, f.x + 1, f.y + 1.5, f.s); tri(li, f.x, f.y, f.s) }
      l.fillStyle = rgba(shade(sole.shadow, -0.1), 0.2); l.fill(sh)
      l.fillStyle = 'rgba(255,252,246,0.6)'; l.fill(li)
    }),
    // Cracked heels: thin fissures radiating in from the heel's rim, several of different lengths, some
    // branching. Each has a dark hairline core, pink-red inside where it is deepest (near the rim), and dry,
    // raised, flaky pale edges along both sides.
    cracks: () => sheet(sil, l => {
      const r = makeRng(seed + 81)
      const k = p.cracks
      type Crack = { pts: { x: number; y: number }[]; w: number }
      const cracks: Crack[] = []
      const count = Math.round(6 + 10 * k)
      for (let i = 0; i < count; i++) {
        // From the back (bottom) and sides of the heel's rim, inward.
        const ang = r.range(0.1, Math.PI - 0.1) + (r() < 0.25 ? r.range(Math.PI * 0.95, Math.PI * 1.15) : 0)
        let x = heel.x + Math.cos(ang) * heel.rx * 0.97, y = heel.y + 10 + Math.sin(ang) * heel.ry * 0.97
        let dir = Math.atan2(heel.y - y, heel.x - x) + r.range(-0.3, 0.3)
        const len = r.range(22, 50 + 60 * k)
        const pts = [{ x, y }]
        for (let run = 0; run < len;) { const st = r.range(5, 9); dir += r.range(-0.35, 0.35); x += Math.cos(dir) * st; y += Math.sin(dir) * st; run += st; pts.push({ x, y }) }
        const w = r.range(1.4, 2.2) + 1.8 * k
        cracks.push({ pts, w })
        // Some branch off partway.
        if (pts.length > 4 && r() < 0.6) {
          const from = pts[r.int(2, pts.length - 2)]
          let bx = from.x, by = from.y, bd = dir + (r() < 0.5 ? -1 : 1) * r.range(0.6, 1.1)
          const bp = [{ x: bx, y: by }]
          for (let j = 0; j < r.int(2, 4); j++) { bx += Math.cos(bd) * 7; by += Math.sin(bd) * 7; bd += r.range(-0.3, 0.3); bp.push({ x: bx, y: by }) }
          cracks.push({ pts: bp, w: w * 0.55 })
        }
      }
      // Each crack as a tapered ribbon: widest at its start (the rim), closing to a hairline.
      const ribbon = (c: Ctx, cr: Crack, scale: number, dx = 0, dy = 0) => {
        const left: number[] = [], right: number[] = [], n = cr.pts.length
        cr.pts.forEach((q, j) => {
          const a2 = cr.pts[Math.min(n - 1, j + 1)], b2 = cr.pts[Math.max(0, j - 1)]
          const ux = a2.x - b2.x, uy = a2.y - b2.y, ul = Math.hypot(ux, uy) || 1
          const wd = Math.max(0.3, cr.w * scale * (1 - j / (n - 1)) ** 0.8)
          left.push(q.x - (uy / ul) * wd + dx, q.y + (ux / ul) * wd + dy)
          right.unshift(q.x + (uy / ul) * wd + dx, q.y - (ux / ul) * wd + dy)
        })
        const all = [...left, ...right]
        c.beginPath(); for (let j = 0; j < all.length; j += 2) (j ? c.lineTo(all[j], all[j + 1]) : c.moveTo(all[j], all[j + 1])); c.closePath(); c.fill()
      }
      const margin = mixRGB(sole.light, [252, 242, 228], 0.55)
      // Dry, raised, flaky edges.
      softBatch(l, 2.5, c => { c.fillStyle = rgba(margin, 0.9); for (const cr of cracks) ribbon(c, cr, 3.2) })
      const fr = makeRng(seed + 82)
      const flakes = new Path2D()
      for (const cr of cracks) for (const q of cr.pts) if (fr() < 0.6) { const sd = fr() < 0.5 ? -1 : 1, fx = q.x + sd * fr.range(2, 5), fy = q.y + fr.range(-2, 2), sz = fr.range(1.5, 3.5); flakes.moveTo(fx, fy); flakes.lineTo(fx + sz, fy - 1); flakes.lineTo(fx + sz * 0.5, fy + sz * 0.7); flakes.closePath() }
      l.fillStyle = 'rgba(255,252,244,0.85)'; l.fill(flakes)
      // The lit lower wall, the dark core, the red of the deep part.
      softBatch(l, 0.5, c => { c.fillStyle = rgba(mixRGB(sole.light, [255, 250, 240], 0.5), 0.9); for (const cr of cracks) ribbon(c, cr, 1.1, 0.9, 1.3) })
      softBatch(l, 0.4, c => { c.fillStyle = rgba(mixRGB(sole.deep, [90, 30, 30], 0.5), 0.95); for (const cr of cracks) ribbon(c, cr, 1) })
      softBatch(l, 0.6, c => { c.fillStyle = rgba([214, 88, 96], 0.75); for (const cr of cracks) { if (cr.w < 2) continue; ribbon(c, { pts: cr.pts.slice(0, Math.max(2, Math.ceil(cr.pts.length * 0.4))), w: cr.w }, 0.45) } })
    }),
    // Dirt: grey-brown grime on everything that touches the floor; the arch stays clean.
    dirt: () => sheet(sil, l => {
      const kf = clamp01((fairOf(sole) - 0.45) / 0.4)
      const mud = mixRGB([84, 60, 46], [124, 96, 78], kf)
      softBatch(l, 22, c => { c.fillStyle = rgba(mud, 0.3 + 0.45 * p.dirt); weight(c, 1) })
      l.globalCompositeOperation = 'destination-in'
      l.drawImage(tintedByNoise(S, [255, 255, 255], fbm(S, 34, 4, seed + 33), 0.35, 1), 0, 0)
      l.globalCompositeOperation = 'source-over'
      l.drawImage(tintedByNoise(S, mud, fbm(S, 70, 3, seed + 34), 0.03, 0.12 + 0.12 * p.dirt), 0, 0)
      const r = makeRng(seed + 35)
      dots(l, shade(mud, -0.1), Math.round(300 * p.dirt + 60), () => { const c2 = r() < 0.5 ? heel : ball, ang = r.range(0, Math.PI * 2), d = Math.sqrt(r()); return { x: c2.x + Math.cos(ang) * c2.rx * d, y: c2.y + Math.sin(ang) * c2.ry * d, r: r.range(0.8, 1.8), a: r.range(0.12, 0.35) } }, 3)
      // Grime packed into the creases under the toes.
      softBatch(l, 3, c => { for (const t of toes) { const d = toeDir(t), n = { x: -d.y, y: d.x }, q = alongToe(t, 0.06), cw = t.r0 * 0.95; c.strokeStyle = rgba(shade(mud, -0.2), 0.3 * p.dirt + 0.1); c.lineWidth = 6; c.beginPath(); c.moveTo(q.x - n.x * cw, q.y - n.y * cw); c.quadraticCurveTo(q.x - d.x * 24, q.y - d.y * 24, q.x + n.x * cw, q.y + n.y * cw); c.stroke() } })
    }),
    wet: () => sheet(sil, l => paintWet(l, seed, X0, X1, Y0, Y1)),
    antiseptic: () => sheet(sil, l => l.drawImage(tintedByNoise(S, [214, 128, 48], fbm(S, 40, 3, seed + 81), 0.28, 0.45), 0, 0), 3),
    cream: () => sheet(sil, l => paintCream(l, seed, X0, X1, Y0, Y1), 6),
    oil: () => sheet(sil, l => l.drawImage(tintedByNoise(S, [250, 226, 160], fbm(S, 36, 3, seed + 41), 0.06, 0.22), 0, 0)),
    mask: () => sheet(sil, l => paintGelMask(l, seed, X0, X1, Y0, Y1), 3),
    scrub: () => sheet(sil, l => paintFoam(l, seed, X0, X1, Y0, Y1), 8),
    salt: () => sheet(sil, l => paintSalt(l, seed, X0, X1, Y0, Y1), 3),
    water: () => sheet(whole(), l => paintWater(l, seed)),
  }
}

// ---------------------------------------------------------------- tips, spots and shards

/**
 * The overgrown free edge of each toenail, to clip: the nail plate running on past the toe, ivory and a little
 * translucent (fungal ones thick, yellow and ragged), drawn pointing up with the nail's tip point at (0, 0);
 * `y` is how far above the crop's bottom that point sits, as for the hand's tips.
 */
function paintTips(a: FootAnatomy, p: FootProfile): (Crop | null)[] {
  return a.shape.toes.map((t, i) => {
    const len = p.grown[i]
    if (len < 4) return null
    const nl = toeNail(t)
    // The free edge carries on the nail's rounded end: a little narrower than the plate, curving to a round tip.
    const hw = nl.halfWidth * 0.86, ov = Math.round(nl.halfWidth * 0.5)
    const fung = p.fungus[i]
    const W = Math.ceil(hw * 2 + 24), H = Math.ceil(len + 26 + ov)
    const [c, ctx] = canvas(W, H)
    ctx.translate(W / 2, H - 6 - ov)
    const r = makeRng(Math.round(p.grown[i] * 100) + i)
    const edge: [number, number][] = []
    const steps = fung ? 9 : 8
    for (let k = 0; k <= steps; k++) {
      const u = k / steps, ang = Math.PI * (1 - u)
      const rr = fung ? r.range(0.78, 1.05) : 1
      edge.push([Math.cos(ang) * hw * rr, -len + (1 - Math.sin(ang)) * hw * 0.5 - (fung ? r.range(0, len * 0.12) : 0)])
    }
    const outline = () => {
      ctx.beginPath()
      ctx.moveTo(-hw, ov)
      ctx.lineTo(-hw, edge[0][1])
      if (fung) for (const q of edge) ctx.lineTo(q[0], q[1])
      else { ctx.moveTo(-hw, ov); ctx.lineTo(edge[0][0], edge[0][1]); for (let k = 1; k < edge.length; k++) ctx.lineTo(edge[k][0], edge[k][1]) }
      ctx.lineTo(hw, ov)
      ctx.closePath()
    }
    blurred(ctx, 3, () => { ctx.save(); ctx.translate(2, 4); outline(); ctx.fillStyle = 'rgba(90,60,70,0.25)'; ctx.fill(); ctx.restore() })
    outline()
    // The free edge is polished like the rest of the nail when there is old polish on it.
    const body: RGB = p.polish && fung <= 0.3 ? shade(hex(POLISH_COLORS[p.polish.color % POLISH_COLORS.length].hex), -0.05) : fung ? mixRGB([236, 212, 140], [208, 160, 72], fung) : [246, 238, 220]
    const g = ctx.createLinearGradient(0, ov, 0, -len)
    g.addColorStop(0, rgba(body, 0)); g.addColorStop(Math.min(0.9, ov / (ov + len)), rgba(body, 0.5)); g.addColorStop(Math.min(0.95, ov / (ov + len) + 0.12), rgba(body, p.polish || fung ? 0.96 : 0.86)); g.addColorStop(1, rgba(shade(body, -0.04), p.polish || fung ? 0.96 : 0.82))
    ctx.fillStyle = g
    ctx.fill()
    ctx.save()
    outline(); ctx.clip()
    // Curved across: lit on the left, shaded on the right.
    const sg = ctx.createLinearGradient(-hw, 0, hw, 0)
    sg.addColorStop(0, 'rgba(255,255,255,0.3)'); sg.addColorStop(0.4, 'rgba(255,255,255,0)'); sg.addColorStop(0.8, 'rgba(0,0,0,0)'); sg.addColorStop(1, 'rgba(120,90,50,0.3)')
    ctx.fillStyle = sg
    ctx.fillRect(-hw, -len - 10, hw * 2, len + 10 + ov)
    if (fung) {
      // Thick, layered keratin: stacked ochre ridges along the edge, darker in the gaps.
      ctx.strokeStyle = rgba([150, 104, 40], 0.6 * fung); ctx.lineWidth = 1.4
      for (let k = 1; k <= 3; k++) { ctx.beginPath(); for (let j = 0; j <= 8; j++) { const x = -hw + (j / 8) * hw * 2, y = -len * (1 - k * 0.22) + r.range(-2, 2); if (j === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y) } ctx.stroke() }
    }
    ctx.restore()
    // Outline only the part past the toe (over the nail it would draw a box).
    ctx.save(); ctx.beginPath(); ctx.rect(-W, -H, W * 2, H - 2); ctx.clip()
    ctx.strokeStyle = fung ? rgba([150, 110, 50], 0.65) : 'rgba(196,176,160,0.55)'; ctx.lineWidth = 1.3
    outline(); ctx.stroke()
    ctx.restore()
    blurred(ctx, 1, () => { ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 1.6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-hw * 0.55, -len * 0.1); ctx.quadraticCurveTo(-hw * 0.65, -len * 0.6, -hw * 0.2, -len * 0.85); ctx.stroke() })
    return { canvas: c, x: 0, y: 6 + ov }
  })
}

/** Corns, splinters and a plaster, each centred on its own small canvas and painted for this skin. */
function paintSpots(skin: SkinTone): FootArt['spots'] {
  const one = (size: number, draw: (c: Ctx, m: number) => void) => { const [c, ctx] = canvas(size); draw(ctx, size / 2); return c }
  const inflamed = inflamedOf(skin)
  const hard = mixRGB(skin.base, [214, 186, 120], 0.5)
  return {
    // A corn: a hard, raised, yellowish dome, lit from the top left, on a red-rimmed base.
    corn: one(96, (c, m) => {
      blob(c, m, m + 2, 46, 42, inflamed, 0.35)
      blob(c, m + 8, m + 12, 34, 26, shade(skin.shadow, -0.15), 0.3)
      // A thick, hard bump growing out of the skin: skin-toned at its foot, waxy and yellow-grey on top.
      const g = c.createRadialGradient(m - 6, m - 8, 2, m, m, 38)
      g.addColorStop(0, rgba(mixRGB(hard, skin.light, 0.3))); g.addColorStop(0.4, rgba(hard, 0.95)); g.addColorStop(0.75, rgba(mixRGB(hard, skin.base, 0.65), 0.8)); g.addColorStop(1, rgba(skin.base, 0))
      c.fillStyle = g
      c.beginPath(); c.arc(m, m, 38, 0, Math.PI * 2); c.fill()
      // Rough, layered skin: flaky rings and a matte light on its upper side.
      c.strokeStyle = rgba(shade(hard, -0.22), 0.28); c.lineWidth = 1.4
      for (const rr of [24, 17]) { c.beginPath(); c.arc(m + 1, m + 1, rr, Math.PI * 0.05, Math.PI * 1.6); c.stroke() }
      blob(c, m - 9, m - 11, 14, 8, mixRGB(hard, [255, 250, 236], 0.5), 0.4)
    }),
    // Its core: the hard, glassy plug in the middle that the tool lifts out.
    cornCore: one(48, (c, m) => {
      const g = c.createRadialGradient(m - 3, m - 3, 1, m, m, 11)
      g.addColorStop(0, 'rgba(226,200,140,0.85)'); g.addColorStop(0.55, 'rgba(176,142,88,0.8)'); g.addColorStop(1, 'rgba(150,120,70,0)')
      c.fillStyle = g
      c.beginPath(); c.arc(m, m, 11, 0, Math.PI * 2); c.fill()
      blob(c, m - 3, m - 4, 3, 2, [255, 248, 230], 0.5)
    }),
    // Where a corn was: a soft pink, smooth little hollow.
    cornMark: one(96, (c, m) => { blob(c, m, m, 28, 26, mixRGB(skin.blush, [240, 150, 150], 0.4), 0.6); blob(c, m + 2, m + 3, 12, 11, mixRGB(skin.blush, [220, 110, 120], 0.4), 0.45) }),
    // A splinter under the skin: a thin sliver of wood, seen through the skin where it is buried, its end out and lit.
    splinter: one(128, (c, m) => {
      c.save(); c.translate(m, m)
      softBatch(c, 2, k => { k.strokeStyle = 'rgba(90,50,40,0.35)'; k.lineWidth = 7; k.lineCap = 'round'; k.beginPath(); k.moveTo(-40, 3); k.lineTo(34, 3); k.stroke() })
      c.strokeStyle = rgba(mixRGB([120, 80, 50], skin.base, 0.45), 0.9); c.lineWidth = 5; c.lineCap = 'round'
      c.beginPath(); c.moveTo(-38, 0); c.lineTo(10, 0); c.stroke()
      const g = c.createLinearGradient(0, -4, 0, 4)
      g.addColorStop(0, '#d9a870'); g.addColorStop(0.5, '#a8743f'); g.addColorStop(1, '#6f4a28')
      c.fillStyle = g
      c.beginPath(); c.moveTo(6, -3.5); c.lineTo(40, -2); c.lineTo(46, 0); c.lineTo(40, 2.5); c.lineTo(6, 3.5); c.closePath(); c.fill()
      c.strokeStyle = 'rgba(255,236,200,0.8)'; c.lineWidth = 1; c.beginPath(); c.moveTo(10, -2.5); c.lineTo(40, -1.5); c.stroke()
      c.strokeStyle = 'rgba(90,56,30,0.6)'; c.beginPath(); c.moveTo(14, 1); c.lineTo(36, 1.2); c.stroke()
      c.restore()
    }),
    splinterHalo: one(128, (c, m) => { blob(c, m, m, 58, 30, inflamed, 0.4); blob(c, m + 8, m, 16, 12, mixRGB(inflamed, [210, 70, 90], 0.3), 0.45) }),
    splinterMark: one(64, (c, m) => { blob(c, m, m, 14, 12, [226, 80, 96], 0.7); blob(c, m, m, 5, 5, [190, 50, 70], 0.8) }),
    // A round plaster: a soft beige patch with a padded middle and tiny breathing holes.
    plaster: one(128, (c, m) => {
      blob(c, m + 4, m + 7, 50, 50, [120, 70, 60], 0.35)
      c.fillStyle = '#f2d2b8'
      c.beginPath(); c.arc(m, m, 46, 0, Math.PI * 2); c.fill()
      const g = c.createRadialGradient(m - 6, m - 8, 4, m, m, 24)
      g.addColorStop(0, '#fffaf4'); g.addColorStop(1, '#f1e4da')
      c.fillStyle = g
      c.beginPath(); c.arc(m, m, 22, 0, Math.PI * 2); c.fill()
      c.fillStyle = 'rgba(170,120,100,0.35)'
      for (let k = 0; k < 16; k++) { const aa = (k / 16) * Math.PI * 2; c.beginPath(); c.arc(m + Math.cos(aa) * 34, m + Math.sin(aa) * 34, 1.3, 0, Math.PI * 2); c.fill() }
      blob(c, m - 18, m - 22, 14, 7, [255, 255, 255], 0.6)
    }),
  }
}

/** Clipped bits of nail: thin ivory crescents, and chunky yellow crumbs from fungal nails. */
function paintShards(seed: number): FootArt['shards'] {
  const r = makeRng(seed + 999)
  const piece = (fungal: boolean) => {
    const [c, ctx] = canvas(48)
    const col: RGB = fungal ? mixRGB([232, 196, 110], [206, 160, 80], r()) : [246, 238, 222]
    ctx.translate(24, 24)
    ctx.rotate(r.range(0, Math.PI * 2))
    ctx.beginPath()
    if (fungal) {
      const n = r.int(5, 7)
      for (let k = 0; k < n; k++) { const aa = (k / n) * Math.PI * 2, d = r.range(7, 15); if (k === 0) ctx.moveTo(Math.cos(aa) * d, Math.sin(aa) * d); else ctx.lineTo(Math.cos(aa) * d, Math.sin(aa) * d * 0.8) }
      ctx.closePath()
    } else { ctx.arc(0, 6, 16, Math.PI * 1.15, Math.PI * 1.85); ctx.arc(0, 10, 14, Math.PI * 1.8, Math.PI * 1.2, true); ctx.closePath() }
    const g = ctx.createLinearGradient(-12, -12, 12, 12)
    g.addColorStop(0, rgba(shade(col, 0.3))); g.addColorStop(1, rgba(shade(col, -0.2)))
    ctx.fillStyle = g
    ctx.fill()
    ctx.strokeStyle = rgba(shade(col, -0.4), 0.7); ctx.lineWidth = 1
    ctx.stroke()
    if (fungal) { ctx.strokeStyle = rgba([120, 80, 30], 0.6); ctx.beginPath(); ctx.moveTo(-6, -2); ctx.lineTo(3, 4); ctx.stroke() }
    return c
  }
  return { clean: Array.from({ length: 5 }, () => piece(false)), fungal: Array.from({ length: 6 }, () => piece(true)) }
}
