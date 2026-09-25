import type { Figure } from '../core/figure.ts'
import { SENIOR_AGE } from '../core/figure.ts'
import { makeRng, type Rng } from '../core/rng.ts'
import { bandEdge } from '../core/treatments/anatomy.ts'
import { blob, mixRGB, rgba, shade, smoothPath, softBatch, type Ctx, type RGB } from './paint.ts'

/**
 * Hair for the face close-up (the customer lies face up on a pillow, a spa band holding the hair back). One
 * style per floor-sprite style, so the close-up matches the person who walked in: long, bob, bun, curls,
 * crop, ponytail (Look.hairStyle 0 to 5).
 *
 * Hair is painted as clumps (tapered locks, each shaded across its width) with hundreds of fine strands
 * following them, and an anisotropic sheen: a ring of light around the crown where the strands turn toward
 * the key light, broken up strand by strand. Strands are batched into a few paths by tone and width, and
 * every soft pass is a single blur, so a full head costs a few tens of milliseconds.
 */
export type HairPal = { base: RGB; light: RGB; dark: RGB }
export type HairStyle = 'long' | 'bob' | 'bun' | 'curly' | 'crop' | 'pony'
export const HAIR_STYLES: HairStyle[] = ['long', 'bob', 'bun', 'curly', 'crop', 'pony']
export const styleOf = (n: number): HairStyle => HAIR_STYLES[((n % 6) + 6) % 6]

type P = { x: number; y: number }

/** Grey with age: silver strands through the customer's own colour (salt and pepper), then fully silver. */
export function hairPalette(hair: HairPal, figure: Figure): HairPal {
  if (figure.age < SENIOR_AGE) return hair
  const silver: HairPal = { base: [188, 186, 192], light: [246, 246, 250], dark: [118, 114, 124] }
  const k = 0.7 + (figure.age - SENIOR_AGE) * 1.5
  return { base: mixRGB(hair.base, silver.base, k), light: mixRGB(hair.light, silver.light, k), dark: mixRGB(hair.dark, silver.dark, k) }
}

/** Strand paths grouped by colour and width: one stroke per group. */
class Strands {
  private groups = new Map<string, { path: Path2D; width: number; color: string }>()
  add(pts: P[], color: string, width: number) {
    if (pts.length < 2) return
    const key = `${color}|${width}`
    let g = this.groups.get(key)
    if (!g) { g = { path: new Path2D(), width, color }; this.groups.set(key, g) }
    g.path.moveTo(pts[0].x, pts[0].y)
    for (let i = 1; i < pts.length; i++) g.path.lineTo(pts[i].x, pts[i].y)
  }
  flush(ctx: Ctx) {
    ctx.save()
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    for (const g of this.groups.values()) { ctx.strokeStyle = g.color; ctx.lineWidth = g.width; ctx.stroke(g.path) }
    ctx.restore()
    this.groups.clear()
  }
}

/** Six strand tones, dark to the sheen highlight. */
function tones(p: HairPal) {
  return [
    rgba(p.dark, 0.55), rgba(mixRGB(p.dark, p.base, 0.5), 0.45), rgba(shade(p.base, 0.05), 0.4),
    rgba(mixRGB(p.base, p.light, 0.5), 0.42), rgba(p.light, 0.5), rgba(mixRGB(p.light, [255, 250, 244], 0.45), 0.72),
  ]
}
const WIDTHS = [0.9, 1.4, 2.1]

/**
 * The sheen: a ring of light around the crown (and a second one across the spread hair for long styles),
 * strongest on the side toward the key light (top left), with a jitter per strand so its edge breaks up.
 */
function sheenFn(rings: { cx: number; cy: number; r: number; w: number }[]) {
  return (x: number, y: number, jitter: number) => {
    let s = 0
    for (const g of rings) {
      const d = Math.hypot(x - g.cx, (y - g.cy) * 1.2)
      const a = Math.atan2(y - g.cy, x - g.cx)
      const lit = 0.35 + 0.65 * Math.max(0, Math.cos(a + 2.2))
      s = Math.max(s, Math.exp(-(((d - g.r - jitter) / g.w) ** 2)) * lit)
    }
    return s
  }
}
type Sheen = ReturnType<typeof sheenFn>

/** Add one strand, split into runs by how much sheen each part catches. */
function strand(S: Strands, pts: P[], own: number, T: string[], width: number, sheen: Sheen, jitter: number) {
  let run: P[] = []
  let cls = -1
  for (const p of pts) {
    const s = sheen(p.x, p.y, jitter)
    const c = s > 0.55 ? 5 : s > 0.28 ? Math.max(4, own) : own
    if (c !== cls && run.length) { run.push(p); S.add(run, T[cls], width); run = [] }
    cls = c
    run.push(p)
  }
  if (run.length) S.add(run, T[cls], width)
}

// ---------------------------------------------------------------- locks

type Lock = { c: [P, P, P, P]; width: number; wave: number; phase: number; side: number; end?: number }

function lockAt(L: Lock, u: number): P {
  const [a, b, c, d] = L.c
  const v = 1 - u
  const w = Math.sin(u * Math.PI * 3 + L.phase) * 18 * L.wave * u
  return { x: v ** 3 * a.x + 3 * v * v * u * b.x + 3 * v * u * u * c.x + u ** 3 * d.x + w * L.side, y: v ** 3 * a.y + 3 * v * v * u * b.y + 3 * v * u * u * c.y + u ** 3 * d.y }
}

function lockWidth(L: Lock, u: number) {
  const end = L.end ?? 0.85
  return L.width * (0.3 + Math.sin(Math.PI * Math.min(1, u * 1.1 + 0.08)) * 0.7) * (u > end ? ((1 - u) / (1 - end)) * 0.75 + 0.25 : 1)
}

/** Keep hair inside the art sheet: past a knee, ease the reach in so ends stay round (never cut straight). */
function soft(v: number, lo: number, hi: number) {
  const mid = (lo + hi) / 2, half = (hi - lo) / 2, knee = half * 0.78
  const d = v - mid, a = Math.abs(d)
  return a <= knee ? v : mid + Math.sign(d) * (knee + (half - knee) * Math.tanh((a - knee) / (half - knee)))
}
const clampP = (p: P): P => ({ x: soft(p.x, 14, 1010), y: Math.min(p.y, 1010) })

function paintLocks(ctx: Ctx, locks: Lock[], pal: HairPal, sheen: Sheen, r: Rng, strandsPer = 12) {
  const T = tones(pal)
  const S = new Strands()
  for (const L of locks) {
    const left: P[] = [], right: P[] = [], mid: P[] = []
    for (let k = 0; k <= 24; k++) {
      const u = k / 24, p = lockAt(L, u), q = lockAt(L, Math.min(1, u + 0.02))
      const dx = q.x - p.x, dy = q.y - p.y, l = Math.hypot(dx, dy) || 1
      const w = lockWidth(L, u) / 2
      left.push(clampP({ x: p.x - (dy / l) * w, y: p.y + (dx / l) * w }))
      right.push(clampP({ x: p.x + (dy / l) * w, y: p.y - (dx / l) * w }))
      mid.push(clampP(p))
    }
    ctx.beginPath()
    ctx.moveTo(left[0].x, left[0].y)
    for (const p of left) ctx.lineTo(p.x, p.y)
    for (let k = right.length - 1; k >= 0; k--) ctx.lineTo(right[k].x, right[k].y)
    ctx.closePath()
    const m = mid[11], lw = L.width
    const lg = ctx.createLinearGradient(m.x - L.side * lw, m.y, m.x + L.side * lw, m.y)
    lg.addColorStop(0, rgba(pal.dark)); lg.addColorStop(0.42, rgba(pal.base)); lg.addColorStop(0.6, rgba(shade(pal.base, 0.04))); lg.addColorStop(1, rgba(mixRGB(pal.base, pal.dark, 0.65)))
    ctx.fillStyle = lg
    ctx.fill()
    // A darker line along one edge separates this clump from the one beneath.
    S.add(right.slice(2, 22), T[0], 2.4)
    for (let k = 0; k < strandsPer; k++) {
      const off = r.range(-0.46, 0.46)
      const pts: P[] = []
      for (let j = 0; j <= 18; j++) {
        const u = j / 18, p = lockAt(L, u), q = lockAt(L, Math.min(1, u + 0.02))
        const dx = q.x - p.x, dy = q.y - p.y, l = Math.hypot(dx, dy) || 1
        const o = off * lockWidth(L, u)
        pts.push(clampP({ x: p.x - (dy / l) * o, y: p.y + (dx / l) * o }))
      }
      const own = r() < 0.3 ? 0 : r() < 0.45 ? 1 : r() < 0.7 ? 2 : 3
      strand(S, pts, own, T, WIDTHS[r.int(0, 2)], sheen, r.range(-22, 22))
    }
  }
  S.flush(ctx)
}

/** Fine flyaway hairs lifting off the outline of the hair. */
function flyaways(ctx: Ctx, pal: HairPal, r: Rng, at: () => { p: P; dir: number }, count: number) {
  const S = new Strands()
  const T = [rgba(pal.light, 0.4), rgba(pal.base, 0.45)]
  for (let i = 0; i < count; i++) {
    const { p, dir } = at()
    const len = r.range(30, 90), bend = r.range(-0.6, 0.6)
    const pts: P[] = []
    for (let j = 0; j <= 8; j++) {
      const t = j / 8, a = dir + bend * t
      pts.push(clampP({ x: p.x + Math.cos(a) * len * t, y: p.y + Math.sin(a) * len * t + Math.sin(t * 3) * 4 }))
    }
    S.add(pts, T[i % 2], 0.8)
  }
  S.flush(ctx)
}

// ---------------------------------------------------------------- curls

/**
 * A cloud of coils: each curl a spiral of hair (a turn and a half), dark in its hollow, with the part of the
 * spiral facing the key light lit, lighter where the sheen ring passes. Batched by tone.
 */
function paintCurls(ctx: Ctx, pal: HairPal, r: Rng, count: number, place: () => P, size: [number, number], sheen: Sheen) {
  const hollows = new Path2D()
  const coils = [new Path2D(), new Path2D()]
  const lit = [new Path2D(), new Path2D(), new Path2D()]
  const curls: { p: P; s: number }[] = []
  for (let i = 0; i < count; i++) curls.push({ p: place(), s: r.range(size[0], size[1]) })
  curls.sort((a, b) => a.p.y - b.p.y)
  for (const { p, s } of curls) {
    hollows.moveTo(p.x + s * 0.7, p.y + 2)
    hollows.arc(p.x, p.y + 2, s * 0.7, 0, Math.PI * 2)
    const a0 = r() * Math.PI * 2, turn = r() < 0.5 ? 1 : -1
    const c = coils[r.int(0, 1)]
    const k = sheen(p.x, p.y, r.range(-20, 20))
    const hl = lit[k > 0.5 ? 2 : k > 0.22 ? 1 : 0]
    let first = true, inLit = false
    for (let j = 0; j <= 22; j++) {
      const t = j / 22, a = a0 + turn * t * Math.PI * 3, rad = s * (0.35 + 0.65 * t)
      const x = p.x + Math.cos(a) * rad, y = p.y + Math.sin(a) * rad * 0.85
      if (first) { c.moveTo(x, y); first = false } else c.lineTo(x, y)
      // The stretch of the spiral facing up-left catches the light.
      const facing = Math.cos(a + 2.3) > 0.45 && t > 0.3
      if (facing && !inLit) { hl.moveTo(x, y); inLit = true } else if (facing) hl.lineTo(x, y); else inLit = false
    }
  }
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.fillStyle = rgba(shade(pal.dark, -0.35), 0.55)
  ctx.fill(hollows)
  ctx.strokeStyle = rgba(pal.dark); ctx.lineWidth = 5.5; ctx.stroke(coils[0])
  ctx.strokeStyle = rgba(mixRGB(pal.dark, pal.base, 0.5)); ctx.lineWidth = 4.5; ctx.stroke(coils[1])
  const litCol = [rgba(pal.base, 0.9), rgba(mixRGB(pal.base, pal.light, 0.6), 0.95), rgba(mixRGB(pal.light, [255, 250, 244], 0.35), 1)]
  lit.forEach((path, i) => { ctx.strokeStyle = litCol[i]; ctx.lineWidth = 2.4; ctx.stroke(path) })
  ctx.restore()
}

// ---------------------------------------------------------------- the back (behind the face)

/** The scalp's outline: the round of the head around the face. */
const SCALP = { cx: 512, cy: 340, rx: 336, ry: 300 }
export function scalpPath(ctx: Ctx, grow = 0) { ctx.ellipse(SCALP.cx, SCALP.cy, SCALP.rx + grow, SCALP.ry + grow, 0, 0, Math.PI * 2) }

export type HairBackOut = { ponySide: number }

/** Everything behind the face and ears: the mass, its shadow on the pillow, locks, a bun or a ponytail. */
export function paintHairBack(ctx: Ctx, hair: HairPal, styleIndex: number, seed: number, figure: Figure) {
  const style = styleOf(styleIndex)
  const pal = hairPalette(hair, figure)
  const r = makeRng(seed + 900)
  const long = style === 'long', bob = style === 'bob'
  const bottom = long ? 960 + r.range(-30, 40) : bob ? 800 : 700
  const volume = long ? r.range(0.98, 1.1) : bob ? 1.06 : 1
  const wave = long ? r.pick([0.1, 0.35, 0.8]) : bob ? 0.05 : 0
  const ringR = long ? 330 : bob ? 320 : 250
  const sheen = sheenFn([{ cx: 512, cy: 330, r: 205, w: 34 }, { cx: 512, cy: 380, r: ringR, w: 40 }])
  const ponySide = r() < 0.5 ? -1 : 1
  // The silhouette of everything behind, for the fill and the shadow on the pillow.
  const silhouette = (c: Ctx, grow = 0) => {
    c.beginPath()
    if (long || bob) {
      const v = volume
      const pts = [512, 40, 700, 62, 850, 170, 930, 370, 950, 580, 920, bottom - 140, 840, bottom, 640, bottom + 20, 384, bottom + 20, 184, bottom, 104, bottom - 140, 74, 580, 94, 370, 174, 170, 324, 62]
        .map((val, i) => (i % 2 === 0 ? soft(512 + (val - 512) * v * (bob ? 0.96 : 1), 30, 994) : val))
      smoothPath(c, grow ? pts.map((val, i) => (i % 2 === 0 ? 512 + (val - 512) * (1 + grow / 400) : 540 + (val - 540) * (1 + grow / 400))) : pts)
    } else if (style === 'curly') {
      const pts: number[] = []
      for (let k = 0; k < 28; k++) {
        const a = (k / 28) * Math.PI * 2
        const rr = 1 + Math.sin(a * 7 + seed) * 0.03
        pts.push(soft(512 + Math.cos(a) * 440 * rr, 24, 1000), Math.min(900, 430 + Math.sin(a) * 410 * rr))
      }
      smoothPath(c, pts)
    } else {
      scalpPath(c, grow + (style === 'crop' ? -14 : 0))
      if (style === 'bun') { c.moveTo(512 + 94, 104); c.arc(512, 104, 94, 0, Math.PI * 2) }
    }
  }
  // Shadow on the pillow, down and right.
  softBatch(ctx, 20, c => { c.translate(14, 22); c.fillStyle = 'rgba(96,52,70,0.34)'; silhouette(c); c.fill() })
  // The mass, darker toward the back.
  ctx.save()
  silhouette(ctx)
  const hg = ctx.createRadialGradient(512, 360, 120, 512, 480, 620)
  hg.addColorStop(0, rgba(mixRGB(pal.base, pal.dark, 0.3))); hg.addColorStop(1, rgba(pal.dark))
  ctx.fillStyle = hg
  ctx.fill()
  ctx.restore()

  if (long || bob) {
    const locks: Lock[] = []
    for (let i = 0; i < 34; i++) {
      const side = i % 2 ? 1 : -1, t = r()
      const spread = 0.35 + t * 0.65
      const x0 = 512 + side * r.range(0, 40), y0 = 120 + r.range(-10, 20)
      const c1 = { x: 512 + side * (260 + 150 * spread) * volume, y: 300 + t * 120 }
      const c2 = { x: 512 + side * (330 + 140 * spread) * volume, y: 520 + t * 140 }
      const end = bob
        ? { x: 512 + side * (300 + 40 * spread + r.range(-20, 10)), y: bottom - r.range(10, 60) }
        : { x: 512 + side * (250 + 200 * spread + r.range(-30, 30)) * volume, y: bottom - r.range(0, 80) }
      if (bob) c2.x = 512 + side * (350 + 60 * spread)
      locks.push({ c: [{ x: x0, y: y0 }, c1, c2, end], width: r.range(40, 76) * volume, wave, phase: t * 6, side })
    }
    locks.sort((a, b) => Math.abs(b.c[3].x - 512) - Math.abs(a.c[3].x - 512))
    paintLocks(ctx, locks, pal, sheen, r)
  } else if (style === 'curly') {
    paintCurls(ctx, pal, r, 520, () => {
      const a = r() * Math.PI * 2, d = Math.sqrt(r())
      return { x: soft(512 + Math.cos(a) * 420 * d, 30, 994), y: Math.min(890, 430 + Math.sin(a) * 390 * d) }
    }, [14, 26], sheen)
  } else {
    // Sleek: the hair lies close over the scalp, drawn toward the bun, the ponytail tie, or (a crop) back and down.
    const target: P = style === 'bun' ? { x: 512, y: 110 } : style === 'pony' ? { x: 512 + ponySide * 20, y: 96 } : { x: 512, y: 60 }
    const locks: Lock[] = []
    for (let i = 0; i < 22; i++) {
      const side = i % 2 ? 1 : -1
      const a = r.range(0.05, 1.25)
      const start = { x: 512 + side * Math.cos(a) * (SCALP.rx - 8), y: SCALP.cy + Math.sin(a) * (SCALP.ry - 30) }
      const len = style === 'crop' ? r.range(0.35, 0.55) : 1
      const endP = { x: start.x + (target.x - start.x) * len, y: start.y + (target.y - start.y) * len }
      const bulge = side * 60
      locks.push({ c: [start, { x: start.x + side * 20, y: start.y - 80 }, { x: endP.x + bulge, y: endP.y + 80 }, endP], width: r.range(46, 70), wave: 0, phase: 0, side, end: 0.8 })
    }
    paintLocks(ctx, locks, pal, sheen, r, 10)
    if (style === 'bun') paintBun(ctx, pal, r, sheen)
    if (style === 'pony') paintPony(ctx, pal, r, ponySide, sheen)
  }
  // Soft light across the crown, one blur.
  ctx.save()
  silhouette(ctx)
  ctx.clip()
  softBatch(ctx, 18, c => {
    c.strokeStyle = rgba(pal.light, 0.22)
    c.lineWidth = 30
    c.beginPath(); c.ellipse(512, 330, 205, 170, 0, Math.PI * 1.05, Math.PI * 1.75); c.stroke()
  }, 'screen')
  ctx.restore()
  // Flyaways off the outline.
  if (style !== 'curly') flyaways(ctx, pal, r, () => {
    const a = r.range(Math.PI * 1.02, Math.PI * 1.98)
    const rx = long || bob ? 410 * volume : SCALP.rx, ry = long || bob ? 300 : SCALP.ry
    return { p: { x: 512 + Math.cos(a) * rx * 0.97, y: (long || bob ? 360 : SCALP.cy) + Math.sin(a) * ry * 0.97 }, dir: a + r.range(-0.5, 0.5) }
  }, style === 'crop' ? 10 : 24)
}

function paintBun(ctx: Ctx, pal: HairPal, r: Rng, sheen: Sheen) {
  const bx = 512, by = 104, R = 92
  softBatch(ctx, 8, c => { c.fillStyle = rgba(shade(pal.dark, -0.3), 0.5); c.beginPath(); c.ellipse(bx + 8, by + 40, R * 0.9, R * 0.5, 0, 0, Math.PI * 2); c.fill() })
  ctx.beginPath(); ctx.arc(bx, by, R, 0, Math.PI * 2)
  const g = ctx.createRadialGradient(bx - 24, by - 26, 10, bx, by, R)
  g.addColorStop(0, rgba(mixRGB(pal.base, pal.light, 0.3))); g.addColorStop(0.6, rgba(pal.base)); g.addColorStop(1, rgba(pal.dark))
  ctx.fillStyle = g
  ctx.fill()
  // Coiled strands wrapping around the bun.
  const T = tones(pal)
  const S = new Strands()
  for (let i = 0; i < 60; i++) {
    const rad = r.range(14, R - 4), a0 = r() * Math.PI * 2, span = r.range(1.2, 3.2)
    const pts: P[] = []
    for (let j = 0; j <= 14; j++) { const a = a0 + (span * j) / 14; pts.push({ x: bx + Math.cos(a) * rad, y: by + Math.sin(a) * rad * 0.92 }) }
    strand(S, pts, r.int(0, 3), T, WIDTHS[r.int(0, 2)], sheen, r.range(-15, 15))
  }
  S.flush(ctx)
  blob(ctx, bx - 30, by - 34, 34, 18, mixRGB(pal.light, [255, 250, 244], 0.3), 0.45)
}

function paintPony(ctx: Ctx, pal: HairPal, r: Rng, side: number, sheen: Sheen) {
  const tie = { x: 512 + side * 20, y: 96 }
  // The tail sweeps out over the pillow and falls down beside the head: a thick bundle of locks.
  const locks: Lock[] = []
  for (let i = 0; i < 16; i++) {
    const t = i / 15, j = r.range(-1, 1)
    locks.push({
      c: [{ x: tie.x, y: tie.y }, { x: 512 + side * (190 + t * 50), y: 44 + t * 30 }, { x: 512 + side * (420 + t * 40 + j * 12), y: 130 + t * 60 }, { x: 512 + side * (390 + t * 80 + j * 20), y: 520 + t * 150 }],
      width: r.range(44, 66), wave: 0.25, phase: t * 5, side, end: 0.78,
    })
  }
  // One even shadow for the whole tail on the pillow (drawn opaque, laid down at a third).
  softBatch(ctx, 16, c => {
    c.strokeStyle = 'rgb(96,52,70)'; c.lineCap = 'round'
    for (const L of locks) { c.beginPath(); for (let k = 0; k <= 10; k++) { const p = lockAt(L, k / 12); if (k === 0) c.moveTo(p.x + 12, p.y + 20); else c.lineTo(p.x + 12, p.y + 20) } c.lineWidth = L.width * 0.6; c.stroke() }
  }, 'source-over', 0.3)
  paintLocks(ctx, locks, pal, sheenFn([{ cx: 512 + side * 300, cy: 260, r: 170, w: 40 }]), r, 12)
  void sheen
  // A soft scrunchie around the tie.
  const col: RGB = [246, 196, 214]
  ctx.beginPath(); ctx.ellipse(tie.x, tie.y, 30, 22, side * 0.4, 0, Math.PI * 2)
  const g = ctx.createRadialGradient(tie.x - 8, tie.y - 8, 2, tie.x, tie.y, 32)
  g.addColorStop(0, rgba(shade(col, 0.4))); g.addColorStop(1, rgba(shade(col, -0.18)))
  ctx.fillStyle = g
  ctx.fill()
  ctx.strokeStyle = rgba(shade(col, -0.25), 0.6); ctx.lineWidth = 1.5
  for (let k = 0; k < 7; k++) { const a = (k / 7) * Math.PI * 2; ctx.beginPath(); ctx.moveTo(tie.x + Math.cos(a) * 12, tie.y + Math.sin(a) * 9); ctx.lineTo(tie.x + Math.cos(a) * 28, tie.y + Math.sin(a) * 20); ctx.stroke() }
}

// ---------------------------------------------------------------- the front (over the face)

/**
 * The hair above the band (swept back from the hairline toward the crown, the bun or the tie; short and
 * textured for a crop; curls for curly hair), clipped to the face's top by the caller.
 */
export function paintHairCap(ctx: Ctx, hair: HairPal, styleIndex: number, seed: number, figure: Figure) {
  const style = styleOf(styleIndex)
  const pal = hairPalette(hair, figure)
  const r = makeRng(seed + 950)
  const sheen = sheenFn([{ cx: 512, cy: 330, r: 205, w: 30 }])
  const cg = ctx.createLinearGradient(0, 60, 0, 330)
  cg.addColorStop(0, rgba(pal.dark)); cg.addColorStop(0.6, rgba(pal.base)); cg.addColorStop(1, rgba(mixRGB(pal.base, pal.dark, 0.4)))
  ctx.fillStyle = cg
  ctx.beginPath()
  ctx.moveTo(0, 0); ctx.lineTo(1024, 0)
  for (let k = 40; k >= 0; k--) { const p = bandEdge('top', k / 40); ctx.lineTo(p.x < 512 ? p.x - 40 * (1 - k / 20) : p.x, p.y + 16) }
  ctx.lineTo(0, 470)
  ctx.closePath()
  ctx.fill()
  if (style === 'curly') {
    paintCurls(ctx, pal, r, 170, () => ({ x: r.range(150, 874), y: r.range(60, 340) }), [12, 20], sheen)
    return
  }
  const target: P = style === 'bun' ? { x: 512, y: 110 } : style === 'pony' ? { x: 512, y: 96 } : { x: 512, y: 40 }
  const part = 512 + (r() < 0.5 ? -1 : 1) * r.range(40, 90)
  const locks: Lock[] = []
  for (let i = 0; i < 26; i++) {
    const x = r.range(170, 854)
    const y0 = bandEdge('top', (x - 176) / 672).y + 14
    const side = x < 512 ? -1 : 1
    if (style === 'crop') {
      // Short hair falling away from a side part.
      const away = x < part ? -1 : 1
      const len = r.range(60, 110)
      locks.push({ c: [{ x: part + (x - part) * 0.2, y: 90 + r.range(0, 60) }, { x: x - away * 10, y: y0 - len }, { x: x + away * 12, y: y0 - len * 0.4 }, { x: x + away * 16, y: y0 }], width: r.range(34, 52), wave: 0, phase: 0, side: away, end: 0.7 })
      continue
    }
    const tx = target.x + (x - 512) * 0.45, ty = target.y + r.range(0, 40)
    const sway = r.range(-30, 30)
    locks.push({ c: [{ x, y: y0 }, { x: x + (tx - x) * 0.15 + sway, y: y0 - 100 }, { x: tx + (x - 512) * 0.2 - sway, y: ty + 90 }, { x: tx, y: ty }], width: r.range(44, 70), wave: 0, phase: 0, side, end: 0.7 })
  }
  locks.sort((a, b) => Math.abs(b.c[0].x - 512) - Math.abs(a.c[0].x - 512))
  paintLocks(ctx, locks, pal, sheen, r, 9)
}

/**
 * Hair at the sides, over the band ends: long and bob styles fall over the tops of the ears and down past
 * the jaw (with a soft shadow on the temple); curls bunch there; sleek styles show only a short sideburn,
 * the ears fully visible.
 */
export function paintHairSides(ctx: Ctx, hair: HairPal, styleIndex: number, seed: number, figure: Figure, shadow: RGB) {
  const style = styleOf(styleIndex)
  const pal = hairPalette(hair, figure)
  const r = makeRng(seed + 970)
  const sheen = sheenFn([{ cx: 512, cy: 380, r: 330, w: 40 }])
  if (style === 'curly') {
    for (const side of [-1, 1]) paintCurls(ctx, pal, r, 34, () => ({ x: 512 + side * r.range(262, 330), y: r.range(380, 520) }), [12, 20], sheen)
    return
  }
  if (style === 'long' || style === 'bob') {
    const bottom = style === 'bob' ? 790 : 930
    const locks: Lock[] = []
    for (const side of [-1, 1]) {
      for (let k = 0; k < 3; k++) {
        const o = k * 16
        const end = style === 'bob' ? { x: 512 + side * (262 - k * 6), y: bottom - k * 16 } : { x: 512 + side * (300 + r.range(-10, 30)), y: bottom - k * 40 }
        locks.push({ c: [{ x: 512 + side * (250 + o), y: 330 + k * 10 }, { x: 512 + side * (345 + o * 0.5), y: 420 }, { x: 512 + side * (350 - k * 4), y: 640 }, end], width: 54 - k * 8, wave: 0.15, phase: k, side, end: 0.8 })
      }
    }
    // Their shadow on the temple and cheek.
    softBatch(ctx, 12, c => {
      c.fillStyle = rgba(shadow, 0.3)
      for (const side of [-1, 1]) { c.beginPath(); c.ellipse(512 + side * 262, 520, 30, 120, side * 0.08, 0, Math.PI * 2); c.fill() }
    }, 'multiply')
    paintLocks(ctx, locks, pal, sheen, r, 12)
    return
  }
  // Sleek styles: the ears stay clear; a man's crop keeps a short sideburn in front of each ear.
  if (!(style === 'crop' && figure.masc)) return
  const locks: Lock[] = []
  for (const side of [-1, 1]) {
    for (let k = 0; k < 2; k++) {
      const x = 512 + side * (286 - k * 10)
      locks.push({ c: [{ x: 512 + side * (290 - k * 8), y: 450 }, { x: x + side * 2, y: 470 }, { x: x - side * 4, y: 496 }, { x: x - side * 8, y: 536 }], width: 16 - k * 5, wave: 0, phase: 0, side, end: 0.5 })
    }
  }
  paintLocks(ctx, locks, pal, sheen, r, 6)
}
