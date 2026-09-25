import type { Look } from '../core/customers.ts'
import type { Shape } from '../core/geometry.ts'
import { makeRng } from '../core/rng.ts'
import { HAND, SHAPES, fingerDir, nailOf, type Finger } from '../core/treatments/anatomy.ts'
import { POLISH_COLORS } from '../core/treatments/types.ts'
import type { HandProfile } from '../core/treatments/profile.ts'
import { SKIN, type SkinTone } from './palette.ts'
import { blob, blurred, canvas, dots, fbm, hex, mixRGB, packHeight, rgba, shade, smoothPath, softBatch, tintedByNoise, warm, type Ctx, type RGB } from './paint.ts'
import { makeRng as rng2 } from '../core/rng.ts'
import type { Crop } from './face.ts'
import { SENIOR_AGE, lookFigure } from '../core/figure.ts'

/**
 * The hand close-up for the manicure, painted in code on the anatomy in core/treatments/anatomy.ts: the
 * hand (skin, knuckles, natural nails), its height map, the layer sheets (old polish, cuticles, scrub,
 * base, colour, top coat...) and the overgrown nail tips that get clipped.
 */
export type HandArt = { base: HTMLCanvasElement; height: HTMLCanvasElement; layers: Record<string, HTMLCanvasElement>; tips: Crop[]; skin: SkinTone
  /** Other looks for a layer during particular steps (step id to layer and painter): golden cuticle oil on 'wet'. */
  variants: Record<string, { layer: string; paint: () => HTMLCanvasElement }> }

const S = 1024

export function shapePath(ctx: Ctx, s: Shape) {
  if (s.t === 'ellipse') { ctx.moveTo(s.cx + s.rx, s.cy); ctx.ellipse(s.cx, s.cy, s.rx, s.ry, s.rot ?? 0, 0, Math.PI * 2) }
  else if (s.t === 'poly') { ctx.moveTo(s.pts[0], s.pts[1]); for (let i = 2; i < s.pts.length; i += 2) ctx.lineTo(s.pts[i], s.pts[i + 1]); ctx.closePath() }
  else {
    const a = Math.atan2(s.y1 - s.y0, s.x1 - s.x0)
    const l = Math.hypot(s.x1 - s.x0, s.y1 - s.y0)
    const n = { x: -Math.sin(a), y: Math.cos(a) }
    ctx.moveTo(s.x0 + n.x * s.r0, s.y0 + n.y * s.r0)
    ctx.lineTo(s.x1 + n.x * s.r1, s.y1 + n.y * s.r1)
    ctx.arc(s.x1, s.y1, s.r1, a + Math.PI / 2, a - Math.PI / 2, true)
    ctx.lineTo(s.x0 - n.x * s.r0, s.y0 - n.y * s.r0)
    ctx.arc(s.x0, s.y0, s.r0, a - Math.PI / 2, a + Math.PI / 2, true)
    ctx.closePath()
    void l
  }
}

function fillShapes(ctx: Ctx, shapes: Shape[], style: string) {
  ctx.fillStyle = style
  for (const s of shapes) { ctx.beginPath(); shapePath(ctx, s); ctx.fill() }
}

/**
 * A finger's outline: it tapers from the knuckle to the tip, bulges a little at each joint and bows
 * slightly, ending in a round pad. The tip stays where the anatomy puts it, so the nail lines up.
 */
/**
 * How much wider this hand is painted than the shared geometry (masculine hands: broader fingers and palm, about
 * the same centre lines). The nails and every logic region stay where anatomy.ts puts them; only the painted
 * skin reaches a little past the 'hand' region. Set while a hand is painted, like face.ts's OUTLINE.
 */
let WIDE = 1

/** A finger's painted frame: its centre line (bowed) and half-width at t (0 the knuckle, 1 the tip). */
function fingerFrame(f: Finger, bow = BOW[f.name] ?? 0) {
  const d = fingerDir(f), n = { x: -d.y, y: d.x }
  const len = Math.hypot(f.tip.x - f.base.x, f.tip.y - f.base.y)
  const joints = f.name === 'thumb' ? [0.5] : [0.42, 0.72]
  const width = (t: number) => {
    let w = f.r0 + (f.r1 - f.r0) * Math.pow(Math.max(0, t), 0.9) + (t < 0 ? -t * 30 : 0)
    for (const j of joints) w += 3.2 * Math.exp(-(((t - j) / 0.05) ** 2))
    w -= 2.2 * Math.exp(-(((t - 0.58) / 0.08) ** 2))
    return w * WIDE
  }
  const center = (t: number) => {
    const off = bow * Math.sin(Math.PI * t) * (1 - t)
    return { x: f.base.x + d.x * len * t + n.x * off, y: f.base.y + d.y * len * t + n.y * off }
  }
  /** A point on the finger's side: side +1 along n, -1 against it. */
  const edge = (t: number, side: number) => { const c = center(t), w = width(t); return { x: c.x + n.x * w * side, y: c.y + n.y * w * side } }
  return { d, n, len, width, center, edge }
}

export function fingerOutline(f: Finger, bow = 0): number[] {
  const { n, len, width, center } = fingerFrame(f, bow)
  const left: number[] = [], right: number[] = []
  const tEnd = 1 - f.r1 / len
  const t0 = f.name === 'thumb' ? -0.35 : -0.12
  for (let k = 0; k <= 16; k++) {
    const t = t0 + (k / 16) * (tEnd - t0)
    const c = center(t), w = width(t)
    left.push(c.x + n.x * w, c.y + n.y * w)
    right.push(c.x - n.x * w, c.y - n.y * w)
  }
  const tip = center(tEnd)
  const cap: number[] = []
  const a0 = Math.atan2(n.y, n.x)
  for (let k = 1; k < 8; k++) {
    const a = a0 - (k / 8) * Math.PI
    cap.push(tip.x + Math.cos(a) * f.r1 * 1.02 * WIDE, tip.y + Math.sin(a) * f.r1 * 1.02 * WIDE)
  }
  const pts = [...left, ...cap]
  for (let k = right.length - 2; k >= 0; k -= 2) pts.push(right[k], right[k + 1])
  return pts
}

const BOW: Record<string, number> = { thumb: -6, index: 5, middle: 2, ring: -4, pinky: -8 }

type P = { x: number; y: number }
type Frame = ReturnType<typeof fingerFrame>

/** Which side of a finger (+1 along its n, -1 against) faces a point. */
const sideToward = (fr: Frame, f: Finger, o: P) => Math.sign(fr.n.x * (o.x - f.base.x) + fr.n.y * (o.y - f.base.y)) || 1

/**
 * The webs of skin between neighbouring fingers: each a U whose sides run up the two fingers' facing sides and
 * whose bottom dips between the knuckles. `top` is where it leaves each finger, `low` its lowest point.
 */
function webs(): { top: [P, P]; low: P; ctl: P; d: P }[] {
  const out: { top: [P, P]; low: P; ctl: P; d: P }[] = []
  for (let i = 1; i < HAND.fingers.length - 1; i++) {
    const a = HAND.fingers[i], b = HAND.fingers[i + 1]
    const fa = fingerFrame(a), fb = fingerFrame(b)
    const A = fa.edge(0.2, sideToward(fa, a, b.base)), B = fb.edge(0.2, sideToward(fb, b, a.base))
    const d = { x: (fa.d.x + fb.d.x) / 2, y: (fa.d.y + fb.d.y) / 2 }
    const low = { x: (a.base.x + b.base.x) / 2 + d.x * 34, y: (a.base.y + b.base.y) / 2 + d.y * 34 }
    // The quadratic that passes through `low` at its middle.
    const ctl = { x: 2 * low.x - (A.x + B.x) / 2, y: 2 * low.y - (A.y + B.y) / 2 }
    out.push({ top: [A, B], low, ctl, d })
  }
  return out
}

/** Between the thumb and the index finger: the web's concave curve, from the thumb's side to the index finger's. */
function thumbWeb() {
  const th = HAND.fingers[0], ix = HAND.fingers[1]
  const thumb = fingerFrame(th), index = fingerFrame(ix)
  const T = thumb.edge(0.34, sideToward(thumb, th, ix.base))
  const I = index.edge(0.12, sideToward(index, ix, th.base))
  // A curve that leaves each side along it (down the thumb, down the index finger), so the edges flow into it.
  const c1 = { x: T.x - thumb.d.x * 70, y: T.y - thumb.d.y * 70 }, c2 = { x: I.x - index.d.x * 80, y: I.y - index.d.y * 80 }
  const low = { x: 0.125 * T.x + 0.375 * c1.x + 0.375 * c2.x + 0.125 * I.x, y: 0.125 * T.y + 0.375 * c1.y + 0.375 * c2.y + 0.125 * I.y }
  const path = (k: Ctx) => { k.moveTo(T.x, T.y); k.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, I.x, I.y) }
  return { T, I, low, path }
}

/** The thenar pad: the fleshy base of the thumb, where it grows out of the side of the palm. */
function thenar(): { x: number; y: number; rx: number; ry: number; rot: number } {
  const f = HAND.fingers[0], fr = fingerFrame(f)
  const c = fr.center(-0.1)
  const inward = sideToward(fr, f, { x: 520, y: 760 })
  return { x: c.x + fr.n.x * 12 * inward, y: c.y + fr.n.y * 12 * inward, rx: fr.len * 0.4, ry: f.r0 * 1.15 * WIDE, rot: Math.atan2(fr.d.y, fr.d.x) }
}

/**
 * The hand's silhouette as one form (white on transparent): the palm, the thumb growing from its side over the
 * thenar pad, the fingers, the webs between them and the concave web between the thumb and the index finger.
 */
function silhouette(): HTMLCanvasElement {
  const [c, ctx] = canvas(S)
  ctx.fillStyle = '#fff'
  // The palm, widened about its middle for a broader hand.
  ctx.beginPath(); smoothPath(ctx, HAND.palm.map((v, i) => (i % 2 ? v : 530 + (v - 530) * WIDE))); ctx.fill()
  const th = thenar()
  ctx.beginPath(); ctx.ellipse(th.x, th.y, th.rx, th.ry, th.rot, 0, Math.PI * 2); ctx.fill()
  // The pinky's outer side runs smoothly down into the edge of the palm.
  {
    const pk = HAND.fingers[4], fr = fingerFrame(pk)
    const P0 = fr.edge(0.18, sideToward(fr, pk, { x: 1024, y: pk.base.y })), P1 = { x: 530 + (716 - 530) * WIDE, y: 760 }
    ctx.beginPath(); ctx.moveTo(P0.x, P0.y); ctx.quadraticCurveTo(P1.x + 4, (P0.y + P1.y) / 2, P1.x, P1.y); ctx.lineTo(pk.base.x - 40, 760); ctx.lineTo(pk.base.x, pk.base.y); ctx.closePath(); ctx.fill()
  }
  for (const w of webs()) {
    const [A, B] = w.top
    ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.quadraticCurveTo(w.ctl.x, w.ctl.y, B.x, B.y)
    ctx.lineTo(B.x - w.d.x * 90, B.y - w.d.y * 90); ctx.lineTo(A.x - w.d.x * 90, A.y - w.d.y * 90); ctx.closePath(); ctx.fill()
  }
  // The thumb web: take away the palm's corner outside its concave curve, then fill up to the curve.
  const tw = thumbWeb()
  ctx.globalCompositeOperation = 'destination-out'
  ctx.beginPath(); tw.path(ctx)
  // On up the index finger's side (refilled below), so no corner of the palm is left standing beside it.
  const ixF = HAND.fingers[1], ixR = fingerFrame(ixF), up = ixR.edge(0.4, sideToward(ixR, ixF, HAND.fingers[0].base))
  ctx.lineTo(up.x, up.y); ctx.lineTo(up.x - 160, up.y); ctx.lineTo(tw.T.x - 140, tw.T.y - 80); ctx.closePath(); ctx.fill()
  ctx.globalCompositeOperation = 'source-over'
  ctx.beginPath(); tw.path(ctx); ctx.lineTo(tw.low.x + 70, tw.low.y + 30); ctx.closePath(); ctx.fill()
  for (const f of HAND.fingers) { ctx.beginPath(); smoothPath(ctx, fingerOutline(f, BOW[f.name])); ctx.fill() }
  // The fingers' flared bases must not poke past the thumb web: clear a band just outside its curve, then put the
  // thumb (which the band crosses at its root) back.
  const mx = (tw.T.x + tw.I.x) / 2 - tw.low.x, my = (tw.T.y + tw.I.y) / 2 - tw.low.y, ml = Math.hypot(mx, my) || 1
  const ox = (mx / ml) * 40, oy = (my / ml) * 40
  ctx.globalCompositeOperation = 'destination-out'
  ctx.beginPath(); tw.path(ctx); ctx.lineTo(tw.I.x + ox, tw.I.y + oy); ctx.lineTo(tw.low.x + ox * 1.5, tw.low.y + oy * 1.5); ctx.lineTo(tw.T.x + ox, tw.T.y + oy); ctx.closePath(); ctx.fill()
  ctx.globalCompositeOperation = 'source-over'
  ctx.beginPath(); smoothPath(ctx, fingerOutline(HAND.fingers[0], BOW.thumb)); ctx.fill()
  return c
}

function clipTo(ctx: Ctx, mask: HTMLCanvasElement) {
  ctx.globalCompositeOperation = 'destination-in'
  ctx.drawImage(mask, 0, 0)
  ctx.globalCompositeOperation = 'source-over'
}

function shapesCanvas(shapes: Shape[]) { const [c, ctx] = canvas(S); fillShapes(ctx, shapes, '#fff'); return c }

/**
 * A customer's hand. Masculine hands are broader; older hands get deeper knuckle creases and a few soft age
 * spots; a disaster hand (very dirty, overgrown cuticles) gets yellowed nails under its dark, chipped old polish,
 * red, sore cuticles and grime in the knuckle creases, all inside the layers the steps clear.
 */
export function paintHand(look: Look, seed: number, profile: HandProfile): HandArt {
  const fig = lookFigure(look)
  WIDE = fig.masc ? 1.13 : 1
  try {
    const art = paintHandArt(look, seed, profile, fig.masc)
    const skin = SKIN[look.skin % SKIN.length]
    if (fig.age >= SENIOR_AGE) ageHand(art.base, skin, seed)
    if (profile.dirt >= 0.7 && profile.cuticle >= 0.8) roughHand(art, skin, seed)
    return art
  } finally { WIDE = 1 }
}

/** Older hands: deeper creases across the knuckles and a few soft brown age spots on the back of the hand. */
function ageHand(base: HTMLCanvasElement, skin: SkinTone, seed: number) {
  const ctx = base.getContext('2d')!
  const r = rng2(seed + 905)
  softBatch(ctx, 0.8, c => {
    c.strokeStyle = rgba(mixRGB(skin.shadow, skin.deep, 0.5), 0.45); c.lineWidth = 1.6; c.lineCap = 'round'
    for (const f of HAND.fingers) for (const t of f.name === 'thumb' ? [0.5] : [0.42, 0.7]) {
      const d = fingerDir(f), n = { x: -d.y, y: d.x }, w = (f.r0 + (f.r1 - f.r0) * t) * WIDE * 0.7
      const jx = f.base.x + (f.tip.x - f.base.x) * t, jy = f.base.y + (f.tip.y - f.base.y) * t
      for (let k = -1; k <= 1; k++) { const o = k * 5; c.beginPath(); c.moveTo(jx - n.x * w + d.x * o, jy - n.y * w + d.y * o); c.quadraticCurveTo(jx + d.x * (o - 5), jy + d.y * (o - 5), jx + n.x * w + d.x * o, jy + n.y * w + d.y * o); c.stroke() }
    }
  }, 'multiply')
  softBatch(ctx, 3, c => { for (let i = 0; i < 9; i++) { c.fillStyle = rgba(mixRGB(skin.deep, [150, 100, 60], 0.3), r.range(0.12, 0.24)); c.beginPath(); c.ellipse(r.range(410, 650), r.range(700, 930), r.range(5, 11), r.range(4, 9), r(), 0, Math.PI * 2); c.fill() } }, 'multiply')
}

/** A disaster hand, in its layers: yellowed nails, sore red cuticles, darker chipped polish, grimy creases. */
function roughHand(art: HandArt, skin: SkinTone, seed: number) {
  const r = rng2(seed + 906)
  const onTop = (canvasEl: HTMLCanvasElement | undefined, draw: (c: Ctx) => void, op: GlobalCompositeOperation = 'source-atop') => {
    if (!canvasEl) return
    const c = canvasEl.getContext('2d')!
    c.save(); c.globalCompositeOperation = op; draw(c); c.restore()
  }
  // Two or three nails yellowed under the polish, darkest at the free edge (the buffer takes it off).
  const stained = [0, 1, 2, 3, 4].sort(() => r() - 0.5).slice(0, 2 + (r() < 0.5 ? 1 : 0))
  onTop(art.layers.dull, c => {
    for (const i of stained) {
      const nl = nailOf(HAND.fingers[i])
      const g = c.createLinearGradient(nl.base.x, nl.base.y, nl.tip.x, nl.tip.y)
      g.addColorStop(0, 'rgba(214,176,92,0.15)'); g.addColorStop(0.55, 'rgba(206,160,70,0.7)'); g.addColorStop(1, 'rgba(160,112,44,0.9)')
      c.fillStyle = g
      c.beginPath(); shapePath(c, SHAPES.nailShapes[i]); c.fill()
      c.strokeStyle = 'rgba(120,80,30,0.4)'; c.lineWidth = 1.2
      for (let k = 0; k < 4; k++) { const sd = r.range(-0.7, 0.7) * nl.halfWidth; c.beginPath(); c.moveTo(nl.base.x + (nl.tip.x - nl.base.x) * 0.3 - nl.dir.y * sd, nl.base.y + (nl.tip.y - nl.base.y) * 0.3 + nl.dir.x * sd); c.lineTo(nl.tip.x - nl.dir.y * sd, nl.tip.y + nl.dir.x * sd); c.stroke() }
    }
  })
  // Sore cuticles: an angry red flush round each nail's base (the pusher clears it with the cuticle).
  onTop(art.layers.cuticle, c => {
    for (const f of HAND.fingers) {
      const nl = nailOf(f)
      const g = c.createRadialGradient(nl.base.x, nl.base.y, 2, nl.base.x, nl.base.y, nl.halfWidth * 1.5)
      g.addColorStop(0, 'rgba(214,72,84,0.75)'); g.addColorStop(1, 'rgba(214,72,84,0)')
      c.fillStyle = g
      c.fillRect(nl.base.x - 60, nl.base.y - 60, 120, 120)
    }
  })
  // The old polish, darker and scuffed.
  onTop(art.layers.oldPolish, c => {
    c.globalCompositeOperation = 'multiply'
    c.fillStyle = 'rgba(150,120,120,1)'; c.fillRect(0, 0, S, S)
    c.globalCompositeOperation = 'source-atop'
    c.strokeStyle = 'rgba(255,255,255,0.3)'; c.lineWidth = 1.4
    for (let i = 0; i < 140; i++) { const x = r.range(180, 760), y = r.range(220, 700); c.beginPath(); c.moveTo(x, y); c.lineTo(x + r.range(-16, 16), y + r.range(-6, 6)); c.stroke() }
  })
  // Grime ground into the knuckle creases (the scrub and the massage clear the dry skin it sits in).
  onTop(art.layers.dry, c => {
    c.strokeStyle = rgba(mixRGB(skin.deep, [70, 52, 36], 0.6), 0.6); c.lineWidth = 2.2; c.lineCap = 'round'
    for (const f of HAND.fingers) for (const t of f.name === 'thumb' ? [0.5, -0.1] : [0.42, 0.7, -0.08]) {
      const d = fingerDir(f), n = { x: -d.y, y: d.x }, w = f.r0 * 0.6
      const jx = f.base.x + (f.tip.x - f.base.x) * t, jy = f.base.y + (f.tip.y - f.base.y) * t + (t < 0 ? 30 : 0)
      for (let k = 0; k < 2; k++) { const o = k * 6 - 3; c.beginPath(); c.moveTo(jx - n.x * w + d.x * o, jy - n.y * w + d.y * o); c.quadraticCurveTo(jx + d.x * (o - 4), jy + d.y * (o - 4), jx + n.x * w + d.x * o, jy + n.y * w + d.y * o); c.stroke() }
    }
  }, 'source-over')
}

function paintHandArt(look: Look, seed: number, profile: HandProfile, masc: boolean): HandArt {
  const grown = profile.grown
  const skin = SKIN[look.skin % SKIN.length]
  const r = makeRng(seed + 400)
  const sil = silhouette()
  const nails = shapesCanvas(SHAPES.nailShapes)

  // ---------------------------------------------------------------- base
  const [base, ctx] = canvas(S)
  // A soft shadow on the towel under the hand.
  blurred(ctx, 26, () => { ctx.globalAlpha = 0.35; ctx.drawImage(sil, 16, 26); ctx.globalCompositeOperation = 'source-in'; ctx.fillStyle = 'rgb(120,80,110)'; ctx.fillRect(0, 0, S, S) })
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
  const [skinC, sctx] = canvas(S)
  const lg = sctx.createLinearGradient(0, 1024, 0, 220)
  lg.addColorStop(0, rgba(mixRGB(skin.base, skin.shadow, 0.35))); lg.addColorStop(0.5, rgba(skin.base)); lg.addColorStop(1, rgba(mixRGB(skin.base, skin.light, 0.3)))
  sctx.fillStyle = lg
  sctx.fillRect(0, 0, S, S)
  sctx.globalCompositeOperation = 'soft-light'
  sctx.globalAlpha = 0.3
  sctx.drawImage(fbm(S, 50, 4, seed + 1), 0, 0)
  sctx.globalAlpha = 1
  sctx.globalCompositeOperation = 'source-over'
  // The back of the hand is a low dome: lit high on the left, turning away toward the little finger's side.
  blob(sctx, 505, 730, 210, 175, skin.light, 0.4)
  // The thenar pad, rounded under the same light, with the thumb's metacarpal ridge along it.
  {
    const tn = thenar()
    sctx.save(); sctx.translate(tn.x, tn.y); sctx.rotate(tn.rot)
    blob(sctx, -tn.rx * 0.1, -tn.ry * 0.25, tn.rx * 0.8, tn.ry * 0.55, skin.light, 0.3)
    blob(sctx, tn.rx * 0.05, tn.ry * 0.55, tn.rx * 0.9, tn.ry * 0.45, skin.shadow, 0.22)
    sctx.restore()
  }
  // Fingers: rounded like cylinders under the same light, warm at the tips. The shading fades out toward the
  // knuckle, so each finger grows out of the back of the hand with no seam; the one silhouette rim (below)
  // draws every edge.
  const [fc, fctx] = canvas(S)
  for (const f of HAND.fingers) {
    const fr = fingerFrame(f)
    const d = fr.d, n = fr.n
    const mid = fr.center(0.5)
    fctx.clearRect(0, 0, S, S)
    const g = fctx.createLinearGradient(mid.x - n.x * f.r0, mid.y - n.y * f.r0, mid.x + n.x * f.r0, mid.y + n.y * f.r0)
    g.addColorStop(0, rgba(skin.shadow, 0.5)); g.addColorStop(0.35, rgba(skin.light, 0.35)); g.addColorStop(0.65, rgba(skin.base, 0)); g.addColorStop(1, rgba(skin.shadow, 0.5))
    fctx.fillStyle = g
    fctx.beginPath(); smoothPath(fctx, fingerOutline(f, BOW[f.name])); fctx.fill()
    // Fade in from the knuckle (the thumb from over its pad).
    const from = fr.center(f.name === 'thumb' ? -0.1 : -0.06), to = fr.center(f.name === 'thumb' ? 0.32 : 0.24)
    const fade = fctx.createLinearGradient(from.x, from.y, to.x, to.y)
    fade.addColorStop(0, 'rgba(0,0,0,0)'); fade.addColorStop(1, 'rgba(0,0,0,1)')
    fctx.globalCompositeOperation = 'destination-in'
    fctx.fillStyle = fade; fctx.fillRect(0, 0, S, S)
    fctx.globalCompositeOperation = 'source-over'
    sctx.drawImage(fc, 0, 0)
    blob(sctx, f.tip.x - d.x * 20, f.tip.y - d.y * 20, f.r1 * 1.1, f.r1 * 1.1, skin.blush, 0.3)
    // Knuckle creases: two joints on each finger (one on the thumb).
    const joints = f.name === 'thumb' ? [0.5] : [0.42, 0.7]
    const kr = rng2(seed + f.base.x)
    for (const [ji, t] of joints.entries()) {
      const jx = f.base.x + (f.tip.x - f.base.x) * t, jy = f.base.y + (f.tip.y - f.base.y) * t
      blob(sctx, jx, jy, f.r0 * 0.7, f.r0 * 0.45, skin.light, 0.25)
      // Knuckle creases: a set of fine curved wrinkles bowing toward the tip, longest in the middle, each
      // with a lit ridge just beside it.
      const lines = ji === 0 && f.name !== 'thumb' ? 5 : 3
      for (let k = 0; k < lines; k++) {
        const off = (k - (lines - 1) / 2) * 4.5
        const w = f.r0 * (0.62 - Math.abs(k - (lines - 1) / 2) * 0.1) * kr.range(0.85, 1.1)
        const bow = kr.range(3, 7)
        const path = (dd: number) => {
          sctx.beginPath()
          sctx.moveTo(jx + d.x * (off + dd) - n.x * w, jy + d.y * (off + dd) - n.y * w)
          sctx.quadraticCurveTo(jx + d.x * (off + dd + bow), jy + d.y * (off + dd + bow), jx + d.x * (off + dd) + n.x * w, jy + d.y * (off + dd) + n.y * w)
        }
        sctx.strokeStyle = rgba(skin.deep, kr.range(0.2, 0.34)); sctx.lineWidth = 1.3; path(0); sctx.stroke()
        sctx.strokeStyle = rgba(skin.light, 0.22); sctx.lineWidth = 1.1; path(1.8); sctx.stroke()
      }
    }
  }
  // Knuckles along the back of the hand: each a rounded rise, lit on top (the light is high on the left), turning
  // into a soft shadow on its lower right; a shallow valley between each pair.
  for (const f of HAND.fingers.slice(1)) {
    const fr = fingerFrame(f)
    const k = fr.center(-0.05)
    blob(sctx, k.x - 5, k.y + 2, f.r0 * 1.0, f.r0 * 0.66, skin.light, 0.45)
    blob(sctx, k.x - 8, k.y - 2, f.r0 * 0.5, f.r0 * 0.3, mixRGB(skin.light, [255, 250, 246], 0.3), 0.14)
    blob(sctx, k.x + 12, k.y + 24, f.r0 * 0.7, f.r0 * 0.32, skin.shadow, 0.16)
  }
  softBatch(sctx, 12, c => {
    c.fillStyle = rgba(aoOf(skin), 0.45)
    for (const w of webs()) { c.beginPath(); c.ellipse(w.low.x - w.d.x * 40, w.low.y - w.d.y * 40, 13, 42, Math.atan2(w.d.y, w.d.x) + Math.PI / 2, 0, Math.PI * 2); c.fill() }
  }, 'multiply')
  // Extensor tendons fanning from the knuckles to the wrist: a lit ridge with its shadow side to the right.
  // Extensor tendons: soft form shading that fans out from the wrist to each knuckle, bowing a little.
  const tendon = (f: typeof HAND.fingers[number], c: Ctx, dx: number) => {
    const wx = 512 + (f.base.x - 512) * 0.14, bow = (f.base.x - 512) * 0.12
    c.beginPath(); c.moveTo(wx + dx, 985)
    c.quadraticCurveTo((wx + f.base.x) / 2 + bow + dx, 830, f.base.x + dx, f.base.y + 50); c.stroke()
  }
  softBatch(sctx, 9, c => { c.strokeStyle = rgba(mixRGB(skin.shadow, skin.deep, 0.3), 0.13); c.lineWidth = 10; for (const f of HAND.fingers.slice(1)) tendon(f, c, 9) }, 'multiply')
  softBatch(sctx, 7, c => { c.strokeStyle = rgba(skin.light, 0.18); c.lineWidth = 10; for (const f of HAND.fingers.slice(1)) tendon(f, c, 0) })
  // Veins: soft, branching, faintly blue-green on fair skin, just a deeper warm line on deep skin.
  const fairH = Math.min(1, (skin.base[0] + skin.base[1] + skin.base[2]) / 3 / 215)
  const veinCol = mixRGB(skin.shadow, [96, 116, 150], 0.45 * fairH)
  const vr = rng2(seed + 88)
  const veins: [number, number][][] = []
  for (let v = 0; v < 3; v++) {
    // Mostly low on the back of the hand and over the wrist.
    const x0 = vr.range(430, 630), pts: [number, number][] = [[x0, 1000]]
    let x = x0, y = 1000
    for (let k = 0; k < 4; k++) { x += vr.range(-24, 24); y -= vr.range(30, 50); pts.push([x, y]) }
    veins.push(pts)
    const bi = vr.int(1, 3)
    veins.push([pts[bi], [pts[bi][0] + vr.range(-60, 60), pts[bi][1] - vr.range(40, 80)]])
  }
  softBatch(sctx, 2.5, c => {
    c.strokeStyle = rgba(veinCol, 0.08 + 0.07 * fairH); c.lineWidth = 5
    for (const v of veins) { c.beginPath(); c.moveTo(v[0][0], v[0][1]); for (let k = 1; k < v.length; k++) { const m = [(v[k - 1][0] + v[k][0]) / 2, (v[k - 1][1] + v[k][1]) / 2]; c.quadraticCurveTo(v[k - 1][0], v[k - 1][1], m[0], m[1]) } c.stroke() }
  }, 'multiply')
  // The same fine skin lines, just visible in the colour: the lit side of each crease a touch paler.
  {
    const lines = new Path2D(), lr = rng2(seed + 515)
    for (const ang of [0.62, -0.62, 1.45]) {
      const dx = Math.cos(ang), dy = Math.sin(ang), nx = -dy, ny = dx
      for (let o = -900; o < 900; o += lr.range(6, 10)) {
        const cx = 512 + nx * o, cy = 760 + ny * o
        let started = false
        for (let t = -500; t <= 500; t += 25) {
          const x = cx + dx * t + Math.sin(t * 0.02 + o) * 2, y = cy + dy * t + Math.cos(t * 0.021 + o) * 2
          if (!started) { lines.moveTo(x, y); started = true } else lines.lineTo(x, y)
        }
      }
    }
    sctx.save()
    sctx.globalAlpha = 0.05; sctx.strokeStyle = rgba(skin.deep); sctx.lineWidth = 1
    sctx.stroke(lines)
    sctx.translate(0.8, 0.8); sctx.globalAlpha = 0.05; sctx.strokeStyle = rgba(skin.light)
    sctx.stroke(lines)
    sctx.restore()
  }
  // Webbing: the skin between the fingers curves down between them, with a soft shadow crease along its edge
  // and deeper occlusion where the two fingers' sides meet it. The web between the thumb and the index finger too.
  softBatch(sctx, 5, c => {
    c.lineCap = 'round'
    for (const w of webs()) {
      const [A, B] = w.top
      c.strokeStyle = rgba(aoOf(skin), 0.55); c.lineWidth = 9
      c.beginPath(); c.moveTo(A.x, A.y); c.quadraticCurveTo(w.ctl.x, w.ctl.y, B.x, B.y); c.stroke()
      c.fillStyle = rgba(aoOf(skin), 0.5)
      c.beginPath(); c.ellipse(w.low.x + w.d.x * 6, w.low.y + w.d.y * 6, 14, 18, 0, 0, Math.PI * 2); c.fill()
    }
    const tw = thumbWeb()
    c.strokeStyle = rgba(aoOf(skin), 0.45); c.lineWidth = 10
    c.beginPath(); tw.path(c); c.stroke()
  }, 'multiply')
  // Just inside each web a faint lit rim, where the skin rolls over toward the gap.
  softBatch(sctx, 4, c => {
    c.strokeStyle = rgba(skin.light, 0.22); c.lineWidth = 5
    for (const w of webs()) {
      const [A, B] = w.top
      c.beginPath(); c.moveTo(A.x - w.d.x * 12, A.y - w.d.y * 12); c.quadraticCurveTo(w.ctl.x - w.d.x * 12, w.ctl.y - w.d.y * 12, B.x - w.d.x * 12, B.y - w.d.y * 12); c.stroke()
    }
  })
  // One light across the whole hand: brighter to the upper left, turning away toward the lower right.
  {
    const dl = sctx.createLinearGradient(230, 260, 800, 1000)
    dl.addColorStop(0, rgba(skin.light, 0.22)); dl.addColorStop(0.45, rgba(skin.light, 0)); dl.addColorStop(0.55, rgba(skin.shadow, 0)); dl.addColorStop(1, rgba(skin.shadow, 0.28))
    sctx.fillStyle = dl
    sctx.fillRect(0, 0, S, S)
  }
  // Natural nails with depth: a pink bed darker toward the side walls with faint ridges along it, a pale
  // lunula, the free edge beyond the smile line (white, a little translucent, with the shadow of the
  // fingertip under it), the skin fold of the cuticle arching over the base, and a gloss streak.
  for (const f of HAND.fingers) {
    const nl = nailOf(f)
    const shape: Shape = SHAPES.nailShapes[HAND.fingers.indexOf(f)]
    const a = Math.atan2(nl.dir.y, nl.dir.x)
    const nx = -nl.dir.y, ny = nl.dir.x, hw = nl.halfWidth
    const along = (t: number, side = 0) => ({ x: nl.base.x + (nl.tip.x - nl.base.x) * t + nx * side * hw, y: nl.base.y + (nl.tip.y - nl.base.y) * t + ny * side * hw })
    sctx.save()
    sctx.beginPath(); shapePath(sctx, shape); sctx.clip()
    const bed = mixRGB(skin.base, [240, 170, 176], 0.55)
    const mid = along(0.5)
    const g = sctx.createLinearGradient(mid.x - nx * hw, mid.y - ny * hw, mid.x + nx * hw, mid.y + ny * hw)
    g.addColorStop(0, rgba(shade(bed, -0.14))); g.addColorStop(0.3, rgba(shade(bed, 0.06))); g.addColorStop(0.7, rgba(bed)); g.addColorStop(1, rgba(shade(bed, -0.2)))
    sctx.fillStyle = g
    sctx.fillRect(0, 0, S, S)
    // Faint longitudinal ridges.
    sctx.lineWidth = 1
    for (let k = -3; k <= 3; k++) {
      const p0 = along(0.05, k * 0.26), p1 = along(0.9, k * 0.24)
      sctx.strokeStyle = k % 2 ? 'rgba(255,255,255,0.12)' : rgba(shade(bed, -0.2), 0.12)
      sctx.beginPath(); sctx.moveTo(p0.x, p0.y); sctx.lineTo(p1.x, p1.y); sctx.stroke()
    }
    // Lunula: a pale half-moon at the base.
    const lb = along(0.02)
    sctx.fillStyle = rgba(mixRGB(bed, [255, 244, 244], 0.65), 0.85)
    sctx.beginPath(); sctx.ellipse(lb.x, lb.y, hw * 0.62, 17, a + Math.PI / 2, 0, Math.PI * 2); sctx.fill()
    // The free edge beyond the smile line, and the darker band under it where it leaves the fingertip.
    const smile = 0.78
    const sm = along(smile), sl = along(smile - 0.1, -1.1), sr = along(smile - 0.1, 1.1)
    const edgePath = () => { sctx.beginPath(); sctx.moveTo(sl.x, sl.y); sctx.quadraticCurveTo(sm.x + nl.dir.x * 16, sm.y + nl.dir.y * 16, sr.x, sr.y); const t = along(1.25); sctx.lineTo(t.x + nx * hw * 1.4, t.y + ny * hw * 1.4); sctx.lineTo(t.x - nx * hw * 1.4, t.y - ny * hw * 1.4); sctx.closePath() }
    edgePath()
    sctx.fillStyle = rgba([250, 242, 226], 0.92)
    sctx.fill()
    blurred(sctx, 1.5, () => { sctx.strokeStyle = rgba(shade(bed, -0.3), 0.45); sctx.lineWidth = 3; sctx.beginPath(); sctx.moveTo(sl.x, sl.y); sctx.quadraticCurveTo(sm.x + nl.dir.x * 16, sm.y + nl.dir.y * 16, sr.x, sr.y); sctx.stroke() })
    // Gloss: a long soft streak and a small sharp one.
    const g0 = along(0.15, -0.38), g1 = along(0.72, -0.34)
    blurred(sctx, 2, () => { sctx.strokeStyle = 'rgba(255,255,255,0.6)'; sctx.lineWidth = 5; sctx.lineCap = 'round'; sctx.beginPath(); sctx.moveTo(g0.x, g0.y); sctx.lineTo(g1.x, g1.y); sctx.stroke() })
    const gd = along(0.2, 0.3)
    blob(sctx, gd.x, gd.y, 3, 2, [255, 255, 255], 0.8)
    sctx.restore()
    // Side walls and the outline: a fine darker groove.
    sctx.strokeStyle = rgba(skin.deep, 0.32)
    sctx.lineWidth = 2
    sctx.beginPath(); shapePath(sctx, shape); sctx.stroke()
    // The cuticle: the skin fold arching over the nail's base, lit on its rim, a dark groove beneath.
    const cb = along(-0.02)
    blurred(sctx, 1, () => {
      sctx.strokeStyle = rgba(shade(skin.deep, -0.1), 0.5); sctx.lineWidth = 3
      sctx.beginPath(); sctx.ellipse(cb.x, cb.y, hw * 0.98, 20, a + Math.PI / 2, Math.PI * 0.12, Math.PI * 0.88); sctx.stroke()
      sctx.strokeStyle = rgba(mixRGB(skin.light, [255, 236, 230], 0.4), 0.7); sctx.lineWidth = 2.5
      sctx.beginPath(); sctx.ellipse(cb.x - nl.dir.x * 4, cb.y - nl.dir.y * 4, hw * 1.02, 21, a + Math.PI / 2, Math.PI * 0.15, Math.PI * 0.85); sctx.stroke()
    })
  }
  // Broken nails: a jagged missing corner and a hairline crack.
  for (const i of profile.broken) {
    const nl = nailOf(HAND.fingers[i])
    const side = i % 2 ? 1 : -1
    const tx = nl.tip.x - nl.dir.x * 14, ty = nl.tip.y - nl.dir.y * 14
    sctx.fillStyle = rgba(mixRGB(skin.base, skin.blush, 0.35))
    sctx.beginPath()
    sctx.moveTo(tx - nl.dir.y * side * nl.halfWidth, ty + nl.dir.x * side * nl.halfWidth)
    sctx.lineTo(tx + nl.dir.x * 20 - nl.dir.y * side * nl.halfWidth, ty + nl.dir.y * 20 + nl.dir.x * side * nl.halfWidth)
    sctx.lineTo(tx + nl.dir.x * 20 + nl.dir.y * side * 4, ty + nl.dir.y * 20 - nl.dir.x * side * 4)
    sctx.lineTo(tx + nl.dir.x * 6 - nl.dir.y * side * 6, ty + nl.dir.y * 6 + nl.dir.x * side * 6)
    sctx.closePath(); sctx.fill()
    sctx.strokeStyle = rgba(skin.deep, 0.55); sctx.lineWidth = 1.6
    sctx.beginPath(); sctx.moveTo(tx - nl.dir.y * side * 4, ty + nl.dir.x * side * 4); sctx.lineTo(tx - nl.dir.x * 26 + nl.dir.y * side * 8, ty - nl.dir.y * 26 - nl.dir.x * side * 8); sctx.stroke()
  }
  // A soft darker rim around the whole hand, for roundness.
  const [rim, rctx] = canvas(S)
  rctx.drawImage(sil, 0, 0)
  rctx.globalCompositeOperation = 'source-out'
  rctx.fillStyle = rgba(skin.shadow)
  rctx.fillRect(0, 0, S, S)
  blurred(sctx, 16, () => { sctx.globalAlpha = 0.9; sctx.drawImage(rim, 0, 0) })
  clipTo(sctx, sil)
  ctx.drawImage(skinC, 0, 0)
  {
    // The sleeve: a soft knit cuff, ribbed, with a thick rolled edge, rounding away at the sides, and the
    // skin of the wrist darkening where it goes into it.
    const sleeve = shade(hex(0xf7b7c9), 0.1)
    const cuff = (k: Ctx, dy = 0) => { k.beginPath(); k.moveTo(300, 1030); k.bezierCurveTo(310, 950 + dy, 360, 930 + dy, 520, 928 + dy); k.bezierCurveTo(680, 930 + dy, 730, 950 + dy, 740, 1030); k.closePath() }
    softBatch(ctx, 10, k => { k.fillStyle = rgba(aoOf(skin), 0.55); k.translate(0, -16); cuff(k); k.fill() }, 'multiply')
    ctx.save()
    cuff(ctx)
    const sg = ctx.createLinearGradient(0, 930, 0, 1024)
    sg.addColorStop(0, rgba(shade(sleeve, 0.25))); sg.addColorStop(1, rgba(shade(sleeve, -0.06)))
    ctx.fillStyle = sg
    ctx.fill()
    ctx.clip()
    // Ribs: each a lit rounded column between shaded grooves, following the cuff's curve.
    softBatch(ctx, 1.5, k => {
      for (let x = 296; x < 750; x += 13) {
        const top = 930 + ((x - 520) / 220) ** 2 * 22
        k.strokeStyle = rgba(shade(sleeve, -0.2), 0.6); k.lineWidth = 3.5
        k.beginPath(); k.moveTo(x, top); k.lineTo(x + (x - 520) * 0.04, 1030); k.stroke()
        k.strokeStyle = rgba(shade(sleeve, 0.35), 0.55); k.lineWidth = 3
        k.beginPath(); k.moveTo(x + 6, top); k.lineTo(x + 6 + (x - 520) * 0.04, 1030); k.stroke()
      }
    })
    // Rounding away at the sides.
    const rg = ctx.createLinearGradient(300, 0, 740, 0)
    rg.addColorStop(0, rgba(shade(sleeve, -0.25), 0.5)); rg.addColorStop(0.25, rgba(sleeve, 0)); rg.addColorStop(0.75, rgba(sleeve, 0)); rg.addColorStop(1, rgba(shade(sleeve, -0.3), 0.6))
    ctx.fillStyle = rg
    ctx.fillRect(290, 920, 460, 120)
    ctx.restore()
    // The rolled edge: a soft tube along the top, lit on top, shaded beneath.
    const edge = (k: Ctx, dy: number) => { k.beginPath(); k.moveTo(306, 968 + dy); k.bezierCurveTo(330, 942 + dy, 380, 931 + dy, 520, 929 + dy); k.bezierCurveTo(660, 931 + dy, 710, 942 + dy, 734, 968 + dy) }
    ctx.lineCap = 'round'
    ctx.strokeStyle = rgba(shade(sleeve, 0.12)); ctx.lineWidth = 16; edge(ctx, 6); ctx.stroke()
    softBatch(ctx, 2, k => {
      k.strokeStyle = rgba(shade(sleeve, 0.55), 0.85); k.lineWidth = 5; edge(k, 2); k.stroke()
      k.strokeStyle = rgba(shade(sleeve, -0.25), 0.6); k.lineWidth = 4; edge(k, 13); k.stroke()
    })
  }

  const jewel = paintJewellery(ctx, skin, seed, masc)

  // ---------------------------------------------------------------- height
  const [height, hctx] = canvas(S)
  hctx.fillStyle = '#000'
  hctx.fillRect(0, 0, S, S)
  blurred(hctx, 22, () => hctx.drawImage(sil, 0, 0))
  hctx.globalCompositeOperation = 'multiply'
  hctx.drawImage(sil, 0, 0)
  hctx.globalCompositeOperation = 'source-over'
  for (const f of HAND.fingers) {
    const d = fingerDir(f)
    const joints = f.name === 'thumb' ? [0.5] : [0.42, 0.7]
    for (const t of joints) blob(hctx, f.base.x + (f.tip.x - f.base.x) * t, f.base.y + (f.tip.y - f.base.y) * t, f.r0 * 0.6, f.r0 * 0.4, [255, 255, 255], 0.25)
    blob(hctx, f.base.x, f.base.y + 20, 30, 22, [255, 255, 255], 0.3)
    void d
  }
  blurred(hctx, 1.5, () => { hctx.globalAlpha = 0.5; hctx.drawImage(nails, 0, 0) })
  hctx.globalAlpha = 1
  dots(hctx, [0, 0, 0], 9000, () => ({ a: r.range(0.1, 0.3), x: r.range(180, 780), y: r.range(220, 1024), r: r.range(0.7, 1.5) }))
  // Gloss (green channel): a soft sheen over the back of the hand, stronger on the knuckles and finger tops,
  // and the natural nails shine most.
  const [gl, glctx] = canvas(S)
  glctx.fillStyle = '#000'
  glctx.fillRect(0, 0, S, S)
  glctx.globalAlpha = 0.22
  glctx.drawImage(sil, 0, 0)
  glctx.globalAlpha = 1
  for (const f of HAND.fingers) {
    blob(glctx, f.base.x, f.base.y + 18, 30, 22, [255, 255, 255], 0.55)
    const d = fingerDir(f)
    for (const t of [0.42, 0.72]) blob(glctx, f.base.x + (f.tip.x - f.base.x) * t - d.y * 8, f.base.y + (f.tip.y - f.base.y) * t + d.x * 8, f.r0 * 0.6, f.r0 * 0.6, [255, 255, 255], 0.4)
  }
  glctx.drawImage(nails, 0, 0)
  glctx.drawImage(jewel, 0, 0)
  hctx.globalAlpha = 0.6
  hctx.drawImage(jewel, 0, 0)
  hctx.globalAlpha = 1
  // Fine skin texture: the shallow criss-cross lines of the back of the hand (a diamond mesh, strongest over
  // the back and the knuckles), bent a little so it never reads as a grid.
  const mesh = new Path2D(), mr = rng2(seed + 515)
  for (const ang of [0.62, -0.62, 1.45]) {
    const dx = Math.cos(ang), dy = Math.sin(ang), nx = -dy, ny = dx
    for (let o = -900; o < 900; o += mr.range(6, 10)) {
      const cx = 512 + nx * o, cy = 760 + ny * o
      let started = false
      for (let t = -500; t <= 500; t += 25) {
        const x = cx + dx * t + Math.sin(t * 0.02 + o) * 2, y = cy + dy * t + Math.cos(t * 0.021 + o) * 2
        if (!started) { mesh.moveTo(x, y); started = true } else mesh.lineTo(x, y)
      }
    }
  }
  hctx.save()
  hctx.globalAlpha = 0.09; hctx.strokeStyle = '#000'; hctx.lineWidth = 1.1
  hctx.stroke(mesh)
  hctx.restore()
  // Tendons stand a little proud of the back of the hand.
  softBatch(hctx, 9, c => {
    c.strokeStyle = 'rgba(255,255,255,0.16)'; c.lineWidth = 12
    for (const f of HAND.fingers.slice(1)) { const wx = 512 + (f.base.x - 512) * 0.14; c.beginPath(); c.moveTo(wx, 985); c.quadraticCurveTo((wx + f.base.x) / 2 + (f.base.x - 512) * 0.12, 830, f.base.x, f.base.y + 50); c.stroke() }
  })
  const packed = packHeight(height, gl)

  // ---------------------------------------------------------------- layers
  // Layers on the hand stop at the sleeve cuff.
  const [handMask, hmctx] = canvas(S)
  hmctx.drawImage(sil, 0, 0)
  hmctx.globalCompositeOperation = 'destination-out'
  hmctx.beginPath(); hmctx.moveTo(300, 1030); hmctx.bezierCurveTo(310, 950, 360, 930, 520, 928); hmctx.bezierCurveTo(680, 930, 730, 950, 740, 1030); hmctx.closePath(); hmctx.fill()
  hmctx.drawImage(jewel, 0, 0)
  hmctx.globalCompositeOperation = 'source-over'
  const cuticleMask = shapesCanvas(SHAPES.cuticleShapes)
  const tipsMask = shapesCanvas(SHAPES.tipShapes)
  const layer = (mask: HTMLCanvasElement, draw: (ctx: Ctx) => void) => { const [c, lctx] = canvas(S); draw(lctx); clipTo(lctx, mask); return c }
  const layers: Record<string, HTMLCanvasElement> = {
    wet: layer(handMask, l => {
      l.drawImage(tintedByNoise(S, [240, 248, 255], fbm(S, 40, 3, seed + 2), 0.04, 0.16), 0, 0)
      for (let i = 0; i < 120; i++) { const x = r.range(200, 780), y = r.range(260, 1000), rr = r.range(3, 8); blob(l, x, y, rr, rr * 1.2, [255, 255, 255], 0.55, 0.6); blob(l, x - rr * 0.3, y - rr * 0.4, rr * 0.3, rr * 0.25, [255, 255, 255], 0.95) }
    }),
    dull: layer(nails, l => {
      // Yellowed, dull plates: a stained film with a chalky haze and fine ridges.
      l.drawImage(tintedByNoise(S, [236, 214, 150], fbm(S, 16, 3, seed + 4), 0.25, 0.6), 0, 0)
      l.drawImage(tintedByNoise(S, [244, 234, 222], fbm(S, 10, 3, seed + 3), 0.2, 0.45), 0, 0)
      l.strokeStyle = 'rgba(255,255,255,0.35)'; l.lineWidth = 1
      for (let i = 0; i < 400; i++) { const x = r.range(180, 760), y = r.range(200, 700); l.beginPath(); l.moveTo(x, y); l.lineTo(x + r.range(-12, 12), y + r.range(-4, 4)); l.stroke() }
    }),
    oldPolish: layer(nails, l => {
      const p = profile.polish
      if (!p) return
      const c1 = hex(POLISH_COLORS[p.color].hex), c2 = hex(POLISH_COLORS[p.second].hex)
      HAND.fingers.forEach((f, i) => {
        const nl = nailOf(f)
        const base = p.pattern === 'french' ? mixRGB(skin.base, [250, 214, 214], 0.6) : p.pattern === 'twoTone' && i % 2 ? c2 : c1
        l.fillStyle = rgba(shade(base, -0.08))
        l.beginPath(); shapePath(l, { t: 'capsule', x0: nl.base.x, y0: nl.base.y, x1: nl.tip.x, y1: nl.tip.y, r0: nl.halfWidth + 4, r1: nl.halfWidth + 4 }); l.fill()
        if (p.pattern === 'french') { l.fillStyle = '#fbf7f2'; l.beginPath(); l.ellipse(nl.tip.x - nl.dir.x * 4, nl.tip.y - nl.dir.y * 4, nl.halfWidth + 6, 16, Math.atan2(nl.dir.y, nl.dir.x) + Math.PI / 2, 0, Math.PI * 2); l.fill() }
        if (p.pattern === 'dots') for (let k = 0; k < 7; k++) { l.fillStyle = rgba(k % 2 ? [255, 255, 255] : shade(c2, 0.2), 1); const t = 0.2 + (k / 7) * 0.7; const side = (k % 3 - 1) * nl.halfWidth * 0.45; l.beginPath(); l.arc(nl.base.x + (nl.tip.x - nl.base.x) * t - nl.dir.y * side, nl.base.y + (nl.tip.y - nl.base.y) * t + nl.dir.x * side, 3.2, 0, Math.PI * 2); l.fill() }
        if (p.pattern === 'glitter') for (let k = 0; k < 40; k++) { l.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.9)' : rgba(shade(c1, 0.5), 0.9); l.fillRect(nl.base.x + (nl.tip.x - nl.base.x) * r() + r.range(-18, 18), nl.base.y + (nl.tip.y - nl.base.y) * r() + r.range(-12, 12), 2.5, 2.5) }
      })
      l.strokeStyle = 'rgba(255,255,255,0.18)'; l.lineWidth = 1
      for (let i = 0; i < 200; i++) { const x = r.range(180, 760), y = r.range(200, 700); l.beginPath(); l.moveTo(x, y); l.lineTo(x + r.range(-14, 14), y + r.range(-6, 6)); l.stroke() }
      // Chips: bites out of the polish at the free edge and the corners, their edges a little raised.
      const cr = rng2(seed + 72)
      const bites = new Path2D()
      HAND.fingers.forEach(f => {
        const nl = nailOf(f)
        for (let k = 0; k < 1 + Math.round(p.chips * 2); k++) {
          const side = cr.range(-1, 1), t = cr.range(0.72, 1.05)
          const cx = nl.base.x + (nl.tip.x - nl.base.x) * t - nl.dir.y * side * nl.halfWidth, cy = nl.base.y + (nl.tip.y - nl.base.y) * t + nl.dir.x * side * nl.halfWidth
          const rr = cr.range(6, 14)
          bites.moveTo(cx + rr, cy)
          for (let j = 1; j <= 8; j++) { const aa = (j / 8) * Math.PI * 2; const d = rr * cr.range(0.6, 1.2); bites.lineTo(cx + Math.cos(aa) * d, cy + Math.sin(aa) * d) }
          bites.closePath()
        }
      })
      l.save(); l.strokeStyle = 'rgba(255,255,255,0.5)'; l.lineWidth = 3; l.stroke(bites); l.restore()
      l.save(); l.globalCompositeOperation = 'destination-out'; l.fill(bites); l.restore()
    }),
    dirt: layer(tipsMask, l => {
      // Grime under the free edge: a dark crescent where the nail leaves the fingertip.
      for (const f of HAND.fingers) {
        const nl = nailOf(f)
        const a = Math.atan2(nl.dir.y, nl.dir.x)
        blurred(l, 2.5, () => {
          l.strokeStyle = rgba([70, 52, 36], 0.9)
          l.lineWidth = 12
          l.lineCap = 'round'
          l.beginPath()
          l.ellipse(nl.tip.x - nl.dir.x * 4, nl.tip.y - nl.dir.y * 4, nl.halfWidth * 0.82, 10, a + Math.PI / 2, Math.PI * 0.08, Math.PI * 0.92)
          l.stroke()
        })
        dots(l, [54, 40, 28], 40, () => { const t = r.range(-0.85, 0.85), k = r.range(0, 14); return { x: nl.tip.x - nl.dir.y * t * nl.halfWidth - nl.dir.x * k, y: nl.tip.y + nl.dir.x * t * nl.halfWidth - nl.dir.y * k, r: r.range(1, 2.4), a: r.range(0.4, 0.9) } }, 2)
      }
    }),
    dry: layer(handMask, l => {
      l.drawImage(tintedByNoise(S, mixRGB(skin.light, [255, 246, 240], 0.5), fbm(S, 26, 3, seed + 7), 0.2, 0.55), 0, 0)
      // Cracked, chapped skin over the knuckles: fine dark splits with pale lifted edges.
      const cr = rng2(seed + 71)
      softBatch(l, 0.6, c => {
        for (const f of HAND.fingers) for (const t of f.name === 'thumb' ? [0.5, -0.1] : [0.42, 0.7, -0.08]) {
          const cx = f.base.x + (f.tip.x - f.base.x) * t, cy = f.base.y + (f.tip.y - f.base.y) * t + (t < 0 ? 30 : 0)
          for (let k = 0; k < 4; k++) {
            let x = cx + cr.range(-f.r0 * 0.5, f.r0 * 0.5), y = cy + cr.range(-8, 8)
            c.beginPath(); c.moveTo(x, y)
            for (let j = 0; j < 4; j++) { x += cr.range(-7, 7); y += cr.range(-4, 4); c.lineTo(x, y) }
            c.strokeStyle = rgba(shade(skin.deep, -0.2), 0.55); c.lineWidth = 1.3; c.stroke()
            c.strokeStyle = 'rgba(255,250,244,0.55)'; c.lineWidth = 1; c.translate(0, -1.5); c.stroke(); c.translate(0, 1.5)
          }
        }
      })
      for (let i = 0; i < 900; i++) {
        const x = r.range(200, 780), y = r.range(300, 1000), s = r.range(3, 7)
        l.fillStyle = rgba([255, 252, 248], r.range(0.35, 0.75))
        l.beginPath(); l.moveTo(x, y); l.lineTo(x + s, y + r.range(-1, 1)); l.lineTo(x + s * 0.5, y + s * 0.6); l.closePath(); l.fill()
      }
    }),
    rough: layer(tipsMask, l => {
      for (let i = 0; i < 900; i++) { l.fillStyle = `rgba(${r() < 0.5 ? '255,250,246' : '236,224,218'},${r.range(0.5, 1)})`; l.fillRect(r.range(160, 800), r.range(200, 640), r.range(2, 5), r.range(2, 5)) }
    }),
    cuticle: layer(cuticleMask, l => {
      l.drawImage(tintedByNoise(S, mixRGB(skin.base, [246, 214, 206], 0.5), fbm(S, 10, 3, seed + 5), 0.35, 0.7), 0, 0)
      l.strokeStyle = rgba(mixRGB(skin.shadow, skin.base, 0.4), 0.5); l.lineWidth = 1.2
      for (let i = 0; i < 160; i++) { const x = r.range(160, 800), y = r.range(200, 760); l.beginPath(); l.moveTo(x, y); l.lineTo(x + r.range(-5, 5), y + r.range(-5, 5)); l.stroke() }
    }),
    scrub: layer(handMask, l => {
      l.fillStyle = 'rgba(244,222,206,0.9)'
      l.fillRect(0, 0, S, S)
      for (let i = 0; i < 6000; i++) {
        const x = r.range(150, 820), y = r.range(200, 1024)
        l.fillStyle = r() < 0.5 ? `rgba(255,252,246,${r.range(0.6, 1)})` : `rgba(226,176,120,${r.range(0.5, 0.9)})`
        l.fillRect(x, y, r.range(2, 4.5), r.range(2, 4.5))
      }
    }),
    base: layer(nails, l => {
      l.fillStyle = 'rgba(255,250,252,0.28)'; l.fillRect(0, 0, S, S)
      // A broken nail comes out mended: the missing corner filled with smooth repair gel the colour of the nail,
      // a fine silk wrap over the tip half, and a clean gloss over the whole plate.
      for (const i of profile.broken) {
        const nl = nailOf(HAND.fingers[i]), hw = nl.halfWidth, nx = -nl.dir.y, ny = nl.dir.x
        const at = (u: number, sd = 0) => ({ x: nl.base.x + (nl.tip.x - nl.base.x) * u + nx * sd * hw, y: nl.base.y + (nl.tip.y - nl.base.y) * u + ny * sd * hw })
        l.save()
        l.beginPath(); shapePath(l, SHAPES.nailShapes[i]); l.clip()
        const bed = mixRGB(skin.base, [240, 170, 176], 0.55)
        const a0 = at(0.45), a1 = at(1.05)
        const g = l.createLinearGradient(a0.x, a0.y, a1.x, a1.y)
        g.addColorStop(0, rgba(bed, 0)); g.addColorStop(0.35, rgba(mixRGB(bed, [255, 240, 240], 0.25), 0.9)); g.addColorStop(0.78, rgba(mixRGB(bed, [255, 240, 240], 0.3), 0.95)); g.addColorStop(0.86, rgba([250, 242, 228], 0.95)); g.addColorStop(1, rgba([248, 238, 222], 0.95))
        l.fillStyle = g
        l.fillRect(0, 0, S, S)
        // The silk: a faint criss-cross weave.
        l.strokeStyle = 'rgba(255,255,255,0.22)'; l.lineWidth = 0.8
        for (let k = -8; k <= 8; k++) {
          const p0 = at(0.5, k * 0.25 - 1), p1 = at(1.05, k * 0.25 + 1), q0 = at(0.5, k * 0.25 + 1), q1 = at(1.05, k * 0.25 - 1)
          l.beginPath(); l.moveTo(p0.x, p0.y); l.lineTo(p1.x, p1.y); l.moveTo(q0.x, q0.y); l.lineTo(q1.x, q1.y); l.stroke()
        }
        const s0 = at(0.2, -0.38), s1 = at(0.85, -0.34)
        blurred(l, 2, () => { l.strokeStyle = 'rgba(255,255,255,0.7)'; l.lineWidth = 5; l.lineCap = 'round'; l.beginPath(); l.moveTo(s0.x, s0.y); l.lineTo(s1.x, s1.y); l.stroke() })
        l.restore()
      }
    }),
    color: layer(nails, l => {
      // Painted at 90% grey: the layer shader maps that back to the chosen colour, keeps pure white as a
      // white highlight, and anything darker shades the polish (its thicker, darker edge).
      l.fillStyle = 'rgb(230,230,230)'
      l.fillRect(0, 0, S, S)
      for (const [i, f] of HAND.fingers.entries()) {
        const nl = nailOf(f)
        const shape = SHAPES.nailShapes[i]
        l.save()
        l.beginPath(); shapePath(l, shape); l.clip()
        // The meniscus: polish pools a little thicker and darker along the edges.
        blurred(l, 5, () => { l.strokeStyle = 'rgb(170,170,170)'; l.lineWidth = 12; l.beginPath(); shapePath(l, shape); l.stroke() })
        // Faint brush marks along the nail.
        l.strokeStyle = 'rgba(215,215,215,0.5)'; l.lineWidth = 3
        for (let k = -2; k <= 2; k++) { const off = k * nl.halfWidth * 0.35; l.beginPath(); l.moveTo(nl.base.x - nl.dir.y * off, nl.base.y + nl.dir.x * off); l.lineTo(nl.tip.x - nl.dir.y * off, nl.tip.y + nl.dir.x * off); l.stroke() }
        // The gloss: a long soft streak and a sharp dot, pure white.
        const at = (t: number, side: number) => ({ x: nl.base.x + (nl.tip.x - nl.base.x) * t - nl.dir.y * side * nl.halfWidth, y: nl.base.y + (nl.tip.y - nl.base.y) * t + nl.dir.x * side * nl.halfWidth })
        const g0 = at(0.18, -0.4), g1 = at(0.7, -0.36)
        blurred(l, 2.5, () => { l.strokeStyle = 'rgb(255,255,255)'; l.lineWidth = 6; l.lineCap = 'round'; l.beginPath(); l.moveTo(g0.x, g0.y); l.lineTo(g1.x, g1.y); l.stroke() })
        const gd = at(0.24, 0.32)
        blob(l, gd.x, gd.y, 3.5, 2.5, [255, 255, 255], 1)
        l.restore()
      }
    }),
    // Top coat: a clear film (barely there) with its own wet streak.
    top: layer(nails, l => {
      l.fillStyle = 'rgba(255,255,255,0.07)'; l.fillRect(0, 0, S, S)
      for (const f of HAND.fingers) {
        const nl = nailOf(f)
        const at = (t: number, side: number) => ({ x: nl.base.x + (nl.tip.x - nl.base.x) * t - nl.dir.y * side * nl.halfWidth, y: nl.base.y + (nl.tip.y - nl.base.y) * t + nl.dir.x * side * nl.halfWidth })
        const g0 = at(0.12, -0.3), g1 = at(0.8, -0.28)
        blurred(l, 3, () => { l.strokeStyle = 'rgba(255,255,255,0.55)'; l.lineWidth = 4; l.lineCap = 'round'; l.beginPath(); l.moveTo(g0.x, g0.y); l.lineTo(g1.x, g1.y); l.stroke() })
      }
    }),
  }

  // ---------------------------------------------------------------- tips to clip
  // The overgrown free edge, continuing the nail plate: the same width and curve, ivory and a little
  // translucent, tapering to a rounded tip, a fine highlight along its edge and a soft shadow under it. It
  // starts inside the plate (where the plate is still full width) and fades in there, so there is no seam.
  const tips = HAND.fingers.map((f, i) => {
    const nl = nailOf(f)
    const hw = nl.halfWidth, ov = Math.round(hw * 0.8)
    const len = Math.max(12, grown[i])
    const w = hw * 2 + 24, h = len + 30 + ov
    const [c, tctx] = canvas(Math.ceil(w), Math.ceil(h))
    // Drawn pointing up; the view rotates it to the finger's direction. The nail's tip point is at (0, 0).
    tctx.translate(w / 2, h - 6 - ov)
    const outline = () => {
      tctx.beginPath()
      tctx.moveTo(-hw * 0.99, ov)
      tctx.bezierCurveTo(-hw * 1.0, -len * 0.45, -hw * 0.82, -len * 0.92, -hw * 0.3, -len)
      tctx.quadraticCurveTo(0, -len - 3, hw * 0.3, -len)
      tctx.bezierCurveTo(hw * 0.82, -len * 0.92, hw * 1.0, -len * 0.45, hw * 0.99, ov)
      tctx.closePath()
    }
    blurred(tctx, 4, () => { tctx.save(); tctx.translate(3, 5); outline(); tctx.fillStyle = 'rgba(90,60,70,0.22)'; tctx.fill(); tctx.restore() })
    outline()
    const g = tctx.createLinearGradient(0, ov, 0, -len)
    g.addColorStop(0, 'rgba(250,242,226,0)'); g.addColorStop(Math.min(0.9, ov / (ov + len) + 0.02), 'rgba(250,242,226,0.9)'); g.addColorStop(1, 'rgba(244,232,210,0.82)')
    tctx.fillStyle = g
    tctx.fill()
    tctx.save()
    outline(); tctx.clip()
    // Curved across: darker at the sides, a little yellower toward the tip.
    const sg = tctx.createLinearGradient(-hw, 0, hw, 0)
    sg.addColorStop(0, 'rgba(200,180,150,0.35)'); sg.addColorStop(0.35, 'rgba(255,255,255,0)'); sg.addColorStop(0.8, 'rgba(255,255,255,0)'); sg.addColorStop(1, 'rgba(190,170,140,0.35)')
    tctx.fillStyle = sg
    tctx.fillRect(-hw, -len - 4, hw * 2, len + 4)
    tctx.restore()
    tctx.strokeStyle = 'rgba(196,176,160,0.55)'; tctx.lineWidth = 1.5
    tctx.beginPath(); tctx.moveTo(-hw * 0.99, 0); tctx.bezierCurveTo(-hw * 1.0, -len * 0.45, -hw * 0.82, -len * 0.92, -hw * 0.3, -len); tctx.quadraticCurveTo(0, -len - 3, hw * 0.3, -len); tctx.bezierCurveTo(hw * 0.82, -len * 0.92, hw * 1.0, -len * 0.45, hw * 0.99, 0); tctx.stroke()
    blurred(tctx, 1, () => { tctx.strokeStyle = 'rgba(255,255,255,0.85)'; tctx.lineWidth = 2; tctx.lineCap = 'round'; tctx.beginPath(); tctx.moveTo(-hw * 0.62, -len * 0.1); tctx.quadraticCurveTo(-hw * 0.7, -len * 0.7, -hw * 0.2, -len * 0.93); tctx.stroke() })
    // y: how far above the canvas bottom the nail's tip point sits (the view anchors there).
    return { canvas: c, x: 0, y: 6 + ov }
  })
  // Cuticle oil: a golden film pooled along each cuticle, with round glossy drops.
  const variants: HandArt['variants'] = {
    oil: { layer: 'wet', paint: () => layer(handMask, l => {
      const ro = rng2(seed + 191)
      l.drawImage(tintedByNoise(S, [236, 184, 72], fbm(S, 30, 3, seed + 192), 0.35, 0.6), 0, 0)
      for (const f of HAND.fingers) {
        const nl = nailOf(f)
        for (let k = 0; k < 4; k++) {
          const u = ro.range(-0.1, 0.3), sd = ro.range(-0.9, 0.9), rr = ro.range(3, 7)
          const x = nl.base.x + (nl.tip.x - nl.base.x) * u - nl.dir.y * sd * nl.halfWidth, y = nl.base.y + (nl.tip.y - nl.base.y) * u + nl.dir.x * sd * nl.halfWidth
          const g = l.createRadialGradient(x - rr * 0.3, y - rr * 0.3, rr * 0.1, x, y, rr)
          g.addColorStop(0, 'rgba(255,236,170,0.9)'); g.addColorStop(0.7, 'rgba(232,170,60,0.7)'); g.addColorStop(1, 'rgba(200,130,30,0)')
          l.fillStyle = g; l.beginPath(); l.arc(x, y, rr, 0, Math.PI * 2); l.fill()
          blob(l, x - rr * 0.35, y - rr * 0.4, rr * 0.3, rr * 0.22, [255, 255, 255], 0.95)
        }
      }
    }) },
  }
  return { base, height: packed, layers, tips, skin, variants }
}


type Metal = { base: RGB; light: RGB; dark: RGB }
const METALS: Metal[] = [
  { base: [222, 180, 96], light: [255, 238, 176], dark: [140, 100, 36] },
  { base: [206, 210, 218], light: [255, 255, 255], dark: [112, 116, 128] },
  { base: [226, 160, 144], light: [255, 222, 208], dark: [150, 92, 80] },
]
const GEMS: RGB[] = [[120, 190, 240], [240, 110, 150], [150, 220, 170], [190, 150, 240], [255, 255, 255]]

/**
 * Rings and a bracelet, different for every customer: a band (gold, silver or rose gold) on one or two
 * fingers, some with a gem or a pearl, and sometimes a bracelet of pearls or gold beads above the cuff.
 * Returns their silhouette (white), which lifts them in the height map, makes them shine, and keeps the
 * treatment layers off them.
 */
function paintJewellery(ctx: Ctx, skin: SkinTone, seed: number, masc = false): HTMLCanvasElement {
  const r = rng2(seed + 777)
  const [sil, sctx] = canvas(S)
  const metal = r.pick(METALS)
  // About half the hands wear a ring (fewer men); a few wear two.
  const rings = r.pick(masc ? [0, 0, 0, 0, 1] : [0, 0, 0, 1, 1, 2])
  const fingers = [2, 3, 1, 4].slice(0, rings)
  for (const fi of fingers) {
    const f = HAND.fingers[fi], d = fingerDir(f), n = { x: -d.y, y: d.x }
    const len = Math.hypot(f.tip.x - f.base.x, f.tip.y - f.base.y)
    const t = 0.2, c = { x: f.base.x + d.x * len * t, y: f.base.y + d.y * len * t }
    const w = f.r0 * 1.02, bw = r.range(9, 14)
    const band = (k: Ctx) => { k.beginPath(); k.moveTo(c.x - n.x * w, c.y - n.y * w); k.quadraticCurveTo(c.x - d.x * 10, c.y - d.y * 10, c.x + n.x * w, c.y + n.y * w) }
    // Contact shadow on the finger, toward the knuckle.
    softBatch(ctx, 3, k => { k.strokeStyle = rgba(skin.deep, 0.45); k.lineWidth = bw + 4; k.translate(-d.x * 5 + 2, -d.y * 5 + 3); band(k); k.stroke() }, 'multiply')
    const g = ctx.createLinearGradient(c.x - n.x * w, c.y - n.y * w, c.x + n.x * w, c.y + n.y * w)
    g.addColorStop(0, rgba(metal.dark)); g.addColorStop(0.3, rgba(metal.light)); g.addColorStop(0.55, rgba(metal.base)); g.addColorStop(1, rgba(metal.dark))
    ctx.lineCap = 'round'
    ctx.strokeStyle = g; ctx.lineWidth = bw; band(ctx); ctx.stroke()
    ctx.strokeStyle = rgba(metal.light, 0.8); ctx.lineWidth = 2; ctx.save(); ctx.translate(-d.x * bw * 0.25, -d.y * bw * 0.25); band(ctx); ctx.stroke(); ctx.restore()
    sctx.strokeStyle = '#fff'; sctx.lineWidth = bw + 2; sctx.lineCap = 'round'; band(sctx); sctx.stroke()
    const top = r.int(0, 2)
    const gx = c.x - d.x * 8, gy = c.y - d.y * 8
    if (top === 1) {
      // A faceted gem in a little setting, with a sparkle.
      const gem = r.pick(GEMS)
      ctx.fillStyle = rgba(metal.dark); ctx.beginPath(); ctx.arc(gx, gy, 11, 0, Math.PI * 2); ctx.fill()
      const gg = ctx.createRadialGradient(gx - 3, gy - 3, 1, gx, gy, 9)
      gg.addColorStop(0, rgba(shade(gem, 0.6))); gg.addColorStop(0.6, rgba(gem)); gg.addColorStop(1, rgba(shade(gem, -0.4)))
      ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(gx, gy, 8.5, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = rgba(shade(gem, 0.5), 0.6); ctx.lineWidth = 1
      for (let k = 0; k < 6; k++) { const aa = (k / 6) * Math.PI * 2; ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx + Math.cos(aa) * 8, gy + Math.sin(aa) * 8); ctx.stroke() }
      blob(ctx, gx - 3, gy - 3, 3, 2, [255, 255, 255], 0.95)
      sctx.fillStyle = '#fff'; sctx.beginPath(); sctx.arc(gx, gy, 12, 0, Math.PI * 2); sctx.fill()
    } else if (top === 2) {
      // A pearl.
      const pg = ctx.createRadialGradient(gx - 3, gy - 4, 1, gx, gy, 10)
      pg.addColorStop(0, '#ffffff'); pg.addColorStop(0.6, '#f4ecee'); pg.addColorStop(1, '#cbb8c4')
      ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(gx, gy, 9.5, 0, Math.PI * 2); ctx.fill()
      blob(ctx, gx + 3, gy + 3, 4, 3, [255, 214, 226], 0.5)
      sctx.fillStyle = '#fff'; sctx.beginPath(); sctx.arc(gx, gy, 10, 0, Math.PI * 2); sctx.fill()
    }
  }
  if (r() < (masc ? 0.15 : 0.55)) {
    // A bracelet resting on the sleeve's rolled rim and going round the wrist: it follows the cuff's
    // curve across the whole wrist, and the beads shrink and darken toward the sides as they turn away.
    // (A fixed straight row floated across the back of the hand once the hand was redrawn.)
    const pearls = r() < 0.5 && !masc
    const rr = pearls ? 8.5 : 7
    const cx = 520, half = 162                               // the wrist's centre and half width at the cuff
    const beads: { x: number; y: number; k: number; turn: number }[] = []
    const dT = (2 * rr * 1.02) / half
    for (let th = -1.35; th <= 1.35 + 1e-6; th += dT) {
      const x = cx + half * Math.sin(th)
      beads.push({ x, y: cuffTopAt(x) - rr * 0.55, k: 0.72 + 0.28 * Math.cos(th), turn: 1 - Math.cos(th) })
    }
    softBatch(ctx, 4, k => { k.fillStyle = rgba(skin.deep, 0.4); for (const b of beads) { k.beginPath(); k.arc(b.x + 2, b.y + 5, rr * b.k + 1, 0, Math.PI * 2); k.fill() } }, 'multiply')
    // Draw the far (side) beads first so the front ones overlap them.
    for (const b of [...beads].sort((a, c) => c.turn - a.turn)) {
      const br = rr * b.k
      const bg = ctx.createRadialGradient(b.x - 2.5 * b.k, b.y - 3 * b.k, 1, b.x, b.y, br)
      if (pearls) { bg.addColorStop(0, '#ffffff'); bg.addColorStop(0.6, '#f3eaee'); bg.addColorStop(1, '#c8b4c2') }
      else { bg.addColorStop(0, rgba(metal.light)); bg.addColorStop(0.55, rgba(metal.base)); bg.addColorStop(1, rgba(metal.dark)) }
      ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(b.x, b.y, br, 0, Math.PI * 2); ctx.fill()
      if (b.turn > 0.02) { ctx.fillStyle = `rgba(60, 40, 50, ${Math.min(0.45, b.turn * 0.6)})`; ctx.beginPath(); ctx.arc(b.x, b.y, br, 0, Math.PI * 2); ctx.fill() }
      sctx.fillStyle = '#fff'; sctx.beginPath(); sctx.arc(b.x, b.y, br + 1, 0, Math.PI * 2); sctx.fill()
    }
  }
  void warm
  return sil
}

/** The sleeve cuff's top edge at x: the same two curves the cuff is painted with (see the sleeve in paintHand). */
function cuffTopAt(x: number): number {
  const seg = x < 520 ? [300, 1030, 310, 950, 360, 930, 520, 928] : [520, 928, 680, 930, 730, 950, 740, 1030]
  let best = seg[7], bd = Infinity
  for (let i = 0; i <= 64; i++) {
    const t = i / 64, u = 1 - t
    const px = u * u * u * seg[0] + 3 * u * u * t * seg[2] + 3 * u * t * t * seg[4] + t * t * t * seg[6]
    const py = u * u * u * seg[1] + 3 * u * u * t * seg[3] + 3 * u * t * t * seg[5] + t * t * t * seg[7]
    if (Math.abs(px - x) < bd) { bd = Math.abs(px - x); best = py }
  }
  return best
}

/** The tone's warm occlusion colour (its deep shade over its base), for multiplying soft contact shadows. */
function aoOf(skin: SkinTone): RGB {
  const k = [1.08, 0.97, 0.9]
  return [0, 1, 2].map(i => Math.min(255, (skin.deep[i] / skin.base[i]) * 255 * k[i])) as RGB
}
