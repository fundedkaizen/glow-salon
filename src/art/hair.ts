import type { Figure } from '../core/figure.ts'
import { SENIOR_AGE } from '../core/figure.ts'
import { makeRng, type Rng } from '../core/rng.ts'
import { bandEdge } from '../core/treatments/anatomy.ts'
import { blob, mixRGB, rgba, shade, smoothPath, softBatch, type Ctx, type RGB } from './paint.ts'

/**
 * Hair for the face close-up (the customer lies face up on a pillow, a spa band holding the hair back). One
 * style per floor-sprite style, so the close-up matches the person who walked in: long, bob, bun, curls,
 * crop, ponytail, braids (Look.hairStyle 0 to 6).
 *
 * Hair is painted as clumps (tapered locks, each shaded across its width) with hundreds of fine strands
 * following them, and an anisotropic sheen: a ring of light around the crown where the strands turn toward
 * the key light, broken up strand by strand. Strands are batched into a few paths by tone and width, and
 * every soft pass is a single blur, so a full head costs a few tens of milliseconds.
 */
export type HairPal = { base: RGB; light: RGB; dark: RGB }
export type HairStyle = 'long' | 'bob' | 'bun' | 'curly' | 'crop' | 'pony' | 'braids'
export const HAIR_STYLES: HairStyle[] = ['long', 'bob', 'bun', 'curly', 'crop', 'pony', 'braids']
export const styleOf = (n: number): HairStyle => HAIR_STYLES[((n % HAIR_STYLES.length) + HAIR_STYLES.length) % HAIR_STYLES.length]

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

/**
 * A few fine flyaways lifting off the outline: short, the hair's own colour fading to a light tip, low
 * contrast (long dark ones read as insect legs).
 */
function flyaways(ctx: Ctx, pal: HairPal, r: Rng, at: () => { p: P; dir: number }, count: number) {
  const S = new Strands()
  const root = rgba(pal.base, 0.3), tip = rgba(pal.light, 0.3)
  for (let i = 0; i < count; i++) {
    const { p, dir } = at()
    const len = r.range(16, 34), bend = r.range(-0.5, 0.5)
    const pts: P[] = []
    for (let j = 0; j <= 6; j++) {
      const t = j / 6, a = dir + bend * t
      pts.push(clampP({ x: p.x + Math.cos(a) * len * t, y: p.y + Math.sin(a) * len * t }))
    }
    S.add(pts.slice(0, 4), root, 0.6)
    S.add(pts.slice(3), tip, 0.6)
  }
  S.flush(ctx)
}

// ---------------------------------------------------------------- flow

/**
 * Fine strands filling an area, each flowing toward a target (the crown, a bun, a tie) with a gentle bend:
 * the texture that stops a cap of hair reading as a smooth helmet. Mostly the darker tones, so the locks on
 * top stand out; the sheen still catches them.
 */
function flowStrands(ctx: Ctx, pal: HairPal, r: Rng, count: number, place: () => P, target: P, sheen: Sheen, len: [number, number] = [60, 150]) {
  const T = tones(pal)
  const S = new Strands()
  for (let i = 0; i < count; i++) {
    let p = place()
    const pts: P[] = [p]
    const bend = r.range(-0.35, 0.35), L = r.range(len[0], len[1])
    for (let run = 0; run < L;) {
      const dx = target.x - p.x, dy = target.y - p.y, d = Math.hypot(dx, dy)
      if (d < 24) break
      const a = Math.atan2(dy, dx) + bend * (1 - run / L)
      p = { x: p.x + Math.cos(a) * 9, y: p.y + Math.sin(a) * 9 }
      pts.push(p)
      run += 9
    }
    const own = r() < 0.45 ? 0 : r() < 0.6 ? 1 : r() < 0.8 ? 2 : 3
    strand(S, pts, own, T, WIDTHS[r.int(0, 1)], sheen, r.range(-20, 20))
  }
  S.flush(ctx)
}

// ---------------------------------------------------------------- curls

/** An elliptical patch of curly hair: centre, radii, and how far down it may go. */
type CurlArea = { cx: number; cy: number; rx: number; ry: number; yMax: number }

/**
 * Curly hair as a volume, the way a painter builds it: inside one soft silhouette, clumps of S-shaped ringlets
 * grouped in clusters. Each clump is shaded as a lump (dark at its base, lighter on top), its ringlets drawn as
 * little S coils with a lit upper edge; a broad soft sheen lies across the upper part of the whole mass; and
 * small coils sit only along the edge to break the outline. `clip` keeps everything inside the silhouette.
 */
function paintCurlyVolume(ctx: Ctx, pal: HairPal, r: Rng, area: CurlArea, clumps: number, clip: (c: Ctx) => void, edge = true) {
  const inside = (x: number, y: number, k = 1) => ((x - area.cx) / area.rx) ** 2 + ((y - area.cy) / area.ry) ** 2 < k && y < area.yMax
  const centres: { x: number; y: number; r: number }[] = []
  for (let i = 0; i < clumps * 4 && centres.length < clumps; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 0.95
    const x = area.cx + Math.cos(a) * area.rx * d, y = area.cy + Math.sin(a) * area.ry * d
    if (inside(x, y)) centres.push({ x, y, r: r.range(30, 48) })
  }
  centres.sort((p, q) => p.y - q.y)
  // S-shaped ringlets: two opposite arcs joined, turned along the clump's flow (outward from the head).
  const back = new Path2D(), body = new Path2D(), lit = [new Path2D(), new Path2D()]
  const sCoil = (x: number, y: number, sz: number, ang: number, bright: boolean) => {
    const dx = Math.cos(ang), dy = Math.sin(ang)
    for (const [k, dir] of [[-0.5, 1], [0.5, -1]] as const) {
      const cx = x + dx * sz * k, cy = y + dy * sz * k, a0 = ang + (dir > 0 ? Math.PI * 0.5 : -Math.PI * 0.5)
      back.moveTo(cx + Math.cos(a0) * sz * 0.5 + 1.5, cy + Math.sin(a0) * sz * 0.5 + 2.5); back.arc(cx + 1.5, cy + 2.5, sz * 0.5, a0, a0 + dir * Math.PI * 1.1, dir < 0)
      body.moveTo(cx + Math.cos(a0) * sz * 0.5, cy + Math.sin(a0) * sz * 0.5); body.arc(cx, cy, sz * 0.5, a0, a0 + dir * Math.PI * 1.1, dir < 0)
      // The lit edge: the upper part of each loop.
      const l0 = Math.PI * 1.05, l1 = Math.PI * 1.65
      const lp = lit[bright ? 1 : 0]
      lp.moveTo(cx + Math.cos(l0) * sz * 0.47, cy + Math.sin(l0) * sz * 0.47); lp.arc(cx, cy, sz * 0.47, l0, l1)
    }
  }
  ctx.save()
  clip(ctx)
  // The undercoat: small, darker coils packed across the whole mass, so no part of it reads as a smooth fill.
  {
    const ub = new Path2D(), ul = new Path2D()
    const n = Math.round((area.rx * area.ry) / 260)
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r())
      const x = area.cx + Math.cos(a) * area.rx * d, y = area.cy + Math.sin(a) * area.ry * d
      if (y > area.yMax) continue
      const sz = r.range(6, 10), a0 = r() * Math.PI * 2
      ub.moveTo(x + Math.cos(a0) * sz, y + Math.sin(a0) * sz); ub.arc(x, y, sz, a0, a0 + Math.PI * 1.3)
      ul.moveTo(x + Math.cos(Math.PI * 1.1) * sz * 0.9, y + Math.sin(Math.PI * 1.1) * sz * 0.9); ul.arc(x, y, sz * 0.9, Math.PI * 1.1, Math.PI * 1.55)
    }
    ctx.lineCap = 'round'
    ctx.strokeStyle = rgba(shade(pal.dark, -0.2), 0.8); ctx.lineWidth = 3.4; ctx.stroke(ub)
    ctx.strokeStyle = rgba(mixRGB(pal.dark, pal.base, 0.55), 0.7); ctx.lineWidth = 1.6; ctx.stroke(ul)
  }
  // Each clump as a lump: shade tucked under its lower right, light over its upper left.
  softBatch(ctx, 12, c => { for (const q of centres) { c.fillStyle = rgba(shade(pal.dark, -0.25), 0.6); c.beginPath(); c.ellipse(q.x + q.r * 0.25, q.y + q.r * 0.35, q.r * 0.95, q.r * 0.75, 0, 0, Math.PI * 2); c.fill() } })
  softBatch(ctx, 10, c => { for (const q of centres) { c.fillStyle = rgba(mixRGB(pal.base, pal.light, 0.25), 0.55); c.beginPath(); c.ellipse(q.x - q.r * 0.2, q.y - q.r * 0.25, q.r * 0.7, q.r * 0.55, 0, 0, Math.PI * 2); c.fill() } })
  for (const q of centres) {
    const flow = Math.atan2(q.y - area.cy, q.x - area.cx) + Math.PI / 2
    const n = r.int(14, 22)
    for (let k = 0; k < n; k++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * q.r * 0.92
      const x = q.x + Math.cos(a) * d, y = q.y + Math.sin(a) * d
      // Lighter ringlets toward the top of the clump.
      sCoil(x, y, r.range(10, 17), flow + r.range(-0.6, 0.6), y < q.y - q.r * 0.15)
    }
  }
  const w = 4.6
  ctx.lineCap = 'round'
  ctx.strokeStyle = rgba(shade(pal.dark, -0.35), 0.7); ctx.lineWidth = w + 1.5; ctx.stroke(back)
  ctx.strokeStyle = rgba(mixRGB(pal.dark, pal.base, 0.6)); ctx.lineWidth = w; ctx.stroke(body)
  ctx.strokeStyle = rgba(mixRGB(pal.base, pal.light, 0.45)); ctx.lineWidth = w * 0.5; ctx.stroke(lit[0])
  ctx.strokeStyle = rgba(mixRGB(pal.light, [255, 250, 244], 0.3)); ctx.lineWidth = w * 0.55; ctx.stroke(lit[1])
  // A broad soft sheen across the upper part of the mass.
  softBatch(ctx, 30, c => {
    c.strokeStyle = rgba(mixRGB(pal.light, [255, 250, 244], 0.2), 0.3); c.lineWidth = area.ry * 0.28
    c.beginPath(); c.ellipse(area.cx, area.cy + area.ry * 0.1, area.rx * 0.72, area.ry * 0.62, 0, Math.PI * 1.08, Math.PI * 1.72); c.stroke()
  }, 'screen')
  ctx.restore()
  if (!edge) return
  // Small coils along the edge, attached to it, breaking the outline (none float free).
  const eb = new Path2D(), ef = new Path2D()
  for (let i = 0; i < Math.round((area.rx + area.ry) / 7); i++) {
    const a = r() * Math.PI * 2
    const x = area.cx + Math.cos(a) * area.rx * 0.985, y = area.cy + Math.sin(a) * area.ry * 0.985
    if (y > area.yMax - 6) continue
    const sz = r.range(6, 10), a0 = a + r.range(-1, 1)
    eb.moveTo(x + Math.cos(a0) * sz + 1, y + Math.sin(a0) * sz + 2); eb.arc(x + 1, y + 2, sz, a0, a0 + Math.PI * 1.4)
    ef.moveTo(x + Math.cos(a0) * sz, y + Math.sin(a0) * sz); ef.arc(x, y, sz, a0, a0 + Math.PI * 1.4)
  }
  ctx.save()
  ctx.lineCap = 'round'
  ctx.strokeStyle = rgba(shade(pal.dark, -0.3), 0.6); ctx.lineWidth = 5; ctx.stroke(eb)
  ctx.strokeStyle = rgba(mixRGB(pal.dark, pal.base, 0.7)); ctx.lineWidth = 3.6; ctx.stroke(ef)
  ctx.restore()
}

/**
 * A ponytail: one thick, rounded tail of hair, not a flat sweep. It leaves the tie, arcs out over the pillow and
 * falls beside the head, thickest in the middle and tapering to wispy ends. Shaded across its width like a tube
 * (lit edge toward the light, dark underside), strands running along it, the sheen crossing it where it bends.
 */
function paintTail(ctx: Ctx, pal: HairPal, r: Rng, side: number, tie: P) {
  const spine: P[] = []
  const c0 = tie, c1 = { x: 512 + side * 240, y: 20 }, c2 = { x: 512 + side * 470, y: 150 }, c3 = { x: 512 + side * 430, y: 640 }
  for (let k = 0; k <= 40; k++) {
    const t = k / 40, v = 1 - t
    spine.push({ x: v ** 3 * c0.x + 3 * v * v * t * c1.x + 3 * v * t * t * c2.x + t ** 3 * c3.x, y: v ** 3 * c0.y + 3 * v * v * t * c1.y + 3 * v * t * t * c2.y + t ** 3 * c3.y })
  }
  const width = (t: number) => (t < 0.12 ? 34 + t * 280 : 68 * (1 - Math.max(0, t - 0.55) / 0.45) ** 0.8 + 6) * (0.95 + 0.1 * Math.sin(t * 9))
  const edge = (sideK: number) => spine.map((p, k) => {
    const q = spine[Math.min(40, k + 1)], o = spine[Math.max(0, k - 1)], dx = q.x - o.x, dy = q.y - o.y, l = Math.hypot(dx, dy) || 1
    const w = width(k / 40) * sideK
    return { x: p.x - (dy / l) * w, y: p.y + (dx / l) * w }
  })
  const L = edge(1), R = edge(-1)
  const outline = (c: Ctx) => { c.beginPath(); c.moveTo(L[0].x, L[0].y); for (const q of L) c.lineTo(q.x, q.y); for (let k = R.length - 1; k >= 0; k--) c.lineTo(R[k].x, R[k].y); c.closePath() }
  // Its soft shadow on the pillow.
  softBatch(ctx, 18, c => { c.translate(14, 22); c.fillStyle = 'rgba(96,52,70,0.34)'; outline(c) ; c.fill() })
  ctx.save()
  outline(ctx)
  ctx.fillStyle = rgba(pal.base)
  ctx.fill()
  ctx.clip()
  // Across the width: which edge faces the light depends on the side the tail falls to.
  softBatch(ctx, 14, c => {
    c.lineCap = 'round'; c.lineJoin = 'round'
    const band = (off: number, col: RGB, a: number, w: number) => { c.strokeStyle = rgba(col, a); c.lineWidth = w; c.beginPath(); spine.forEach((p, k) => { const q = L[k], m = R[k]; const x = p.x + (off > 0 ? q.x - p.x : m.x - p.x) * Math.abs(off), y = p.y + (off > 0 ? q.y - p.y : m.y - p.y) * Math.abs(off); if (k === 0) c.moveTo(x, y); else c.lineTo(x, y) }); c.stroke() }
    band(side > 0 ? 0.55 : -0.55, pal.light, 0.55, 26)
    band(side > 0 ? -0.75 : 0.75, pal.dark, 0.85, 36)
  })
  // Strands along the tail.
  const T = tones(pal)
  const S = new Strands()
  const sheen = sheenFn([{ cx: 512 + side * 380, cy: 170, r: 110, w: 46 }])
  for (let i = 0; i < 90; i++) {
    const off = r.range(-1, 1), t0 = r.range(0, 0.15), t1 = r.range(0.7, 1)
    const pts: P[] = []
    for (let k = Math.round(t0 * 40); k <= Math.round(t1 * 40); k++) { const a = L[k], b = R[k], u = (off + 1) / 2; pts.push({ x: b.x + (a.x - b.x) * u, y: b.y + (a.y - b.y) * u }) }
    const own = Math.abs(off) > 0.7 ? 0 : r.int(1, 3)
    strand(S, pts, own, T, WIDTHS[r.int(0, 2)], sheen, r.range(-20, 20))
  }
  S.flush(ctx)
  ctx.restore()
  // Wispy ends past the tip.
  const tip = spine[40], pre = spine[36]
  const ang = Math.atan2(tip.y - pre.y, tip.x - pre.x)
  flyaways(ctx, pal, r, () => ({ p: { x: tip.x + r.range(-10, 10), y: tip.y + r.range(-14, 0) }, dir: ang + r.range(-0.5, 0.5) }), 7)
}

/**
 * A plait: three strands crossed over and over, drawn as a chain of plump lobes leaning left and right in turn
 * (a herringbone), each lobe shaded round, a dark notch between, the sheen catching the lobes it crosses,
 * ending in a soft tie and a little brush of loose hair.
 */
function paintPlait(ctx: Ctx, pal: HairPal, r: Rng, spine: P[], w0: number, tie: RGB) {
  const n = spine.length
  const at = (t: number) => { const f = t * (n - 1), k = Math.min(n - 2, Math.floor(f)), u = f - k; return { x: spine[k].x + (spine[k + 1].x - spine[k].x) * u, y: spine[k].y + (spine[k + 1].y - spine[k].y) * u } }
  const dirAt = (t: number) => { const a = at(Math.max(0, t - 0.01)), b = at(Math.min(1, t + 0.01)); return Math.atan2(b.y - a.y, b.x - a.x) }
  let len = 0
  for (let k = 1; k < n; k++) len += Math.hypot(spine[k].x - spine[k - 1].x, spine[k].y - spine[k - 1].y)
  const endT = 0.9
  // Its shadow on the pillow.
  softBatch(ctx, 12, c => { c.strokeStyle = 'rgba(96,52,70,0.32)'; c.lineWidth = w0 * 1.9; c.lineCap = 'round'; c.beginPath(); spine.forEach((p, k) => (k ? c.lineTo(p.x + 10, p.y + 16) : c.moveTo(p.x + 10, p.y + 16))); c.stroke() })
  const lobeLen = w0 * 1.15
  const count = Math.floor((len * endT) / (lobeLen * 0.62))
  const sheen = sheenFn([{ cx: at(0.3).x, cy: at(0.3).y, r: 30, w: 70 }])
  for (let i = 0; i < count; i++) {
    const t = (i / count) * endT
    const p = at(t), a = dirAt(t), w = w0 * (1 - t * 0.35)
    const lean = i % 2 ? 1 : -1
    ctx.save()
    ctx.translate(p.x, p.y); ctx.rotate(a)
    // A lobe: an egg leaning across the plait.
    ctx.rotate(lean * 0.55)
    ctx.translate(lean * w * 0.18, 0)
    const g = ctx.createLinearGradient(0, -w * 0.5, 0, w * 0.5)
    const lit = sheen(p.x, p.y, 0) > 0.4
    g.addColorStop(0, rgba(lit ? mixRGB(pal.light, [255, 250, 244], 0.2) : mixRGB(pal.base, pal.light, 0.5))); g.addColorStop(0.5, rgba(pal.base)); g.addColorStop(1, rgba(pal.dark))
    ctx.fillStyle = g
    ctx.beginPath(); ctx.ellipse(0, 0, lobeLen * 0.62, w * 0.46, 0, 0, Math.PI * 2); ctx.fill()
    // Strands along the lobe, and its dark notch.
    ctx.strokeStyle = rgba(pal.dark, 0.55); ctx.lineWidth = 1
    for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.moveTo(-lobeLen * 0.5, k * w * 0.08); ctx.quadraticCurveTo(0, k * w * 0.1 - 2, lobeLen * 0.5, k * w * 0.08); ctx.stroke() }
    ctx.strokeStyle = rgba(mixRGB(pal.light, [255, 250, 244], 0.3), lit ? 0.7 : 0.35); ctx.lineWidth = 1.2
    ctx.beginPath(); ctx.moveTo(-lobeLen * 0.35, -w * 0.22); ctx.quadraticCurveTo(0, -w * 0.3, lobeLen * 0.35, -w * 0.2); ctx.stroke()
    ctx.fillStyle = rgba(shade(pal.dark, -0.3), 0.6)
    ctx.beginPath(); ctx.ellipse(-lobeLen * 0.55, 0, 3, w * 0.3, 0, 0, Math.PI * 2); ctx.fill()
    ctx.restore()
  }
  // The tie and the brush of loose ends.
  const e = at(endT), ea = dirAt(endT)
  const brush: Lock[] = []
  for (let k = 0; k < 5; k++) {
    const sp = (k - 2) * 0.18
    brush.push({ c: [e, { x: e.x + Math.cos(ea + sp) * 16, y: e.y + Math.sin(ea + sp) * 16 }, { x: e.x + Math.cos(ea + sp * 1.6) * 34, y: e.y + Math.sin(ea + sp * 1.6) * 34 }, { x: e.x + Math.cos(ea + sp * 2) * 52, y: e.y + Math.sin(ea + sp * 2) * 52 }], width: w0 * 0.35, wave: 0.1, phase: k, side: 1, end: 0.5 })
  }
  paintLocks(ctx, brush, pal, sheenFn([]), r, 4)
  ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(ea)
  const tg = ctx.createLinearGradient(0, -w0 * 0.4, 0, w0 * 0.4)
  tg.addColorStop(0, rgba(shade(tie, 0.4))); tg.addColorStop(1, rgba(shade(tie, -0.2)))
  ctx.fillStyle = tg
  ctx.beginPath(); ctx.roundRect(-6, -w0 * 0.38, 12, w0 * 0.76, 5); ctx.fill()
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
        const rr = 1 + Math.sin(a * 7 + seed) * 0.02 + Math.sin(a * 13 + seed * 0.3) * 0.012
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
    paintCurlyVolume(ctx, pal, r, { cx: 512, cy: 430, rx: 430, ry: 400, yMax: 900 }, 190, c => { silhouette(c); c.clip() })
  } else {
    // Sleek: the hair lies close over the scalp, drawn toward the bun, the ponytail tie, or (a crop) back and down.
    const target: P = style === 'bun' ? { x: 512, y: 110 } : style === 'pony' ? { x: 512 + ponySide * 20, y: 96 } : style === 'braids' ? { x: 512, y: 70 } : { x: 512, y: 60 }
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
    if (style === 'braids') {
      // Two plaits from behind the ears, lying out over the pillow.
      const tieCol: RGB = r.pick([[246, 196, 214], [198, 226, 246], [250, 226, 170]] as const) as unknown as RGB
      for (const sd of [-1, 1]) {
        const spine: P[] = []
        for (let k = 0; k <= 12; k++) { const t = k / 12; spine.push({ x: 512 + sd * (318 + 70 * Math.sin(t * 1.4) + r.range(-2, 2)), y: 470 + t * 470 }) }
        paintPlait(ctx, pal, r, spine, 78, tieCol)
      }
    }
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
    // Near the crown and the upper sides only.
    const a = r() < 0.5 ? r.range(Math.PI * 1.1, Math.PI * 1.35) : r.range(Math.PI * 1.55, Math.PI * 1.85)
    const rx = long || bob ? 410 * volume : SCALP.rx, ry = long || bob ? 300 : SCALP.ry
    return { p: { x: 512 + Math.cos(a) * rx * 0.97, y: (long || bob ? 360 : SCALP.cy) + Math.sin(a) * ry * 0.97 }, dir: a + r.range(-0.5, 0.5) }
  }, style === 'crop' ? 3 : 3 + r.int(0, 3))
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
  // The tail: one thick, rounded tube of hair arcing out over the pillow and falling beside the head.
  paintTail(ctx, pal, r, side, tie)
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
export function paintHairCap(ctx: Ctx, hair: HairPal, styleIndex: number, seed: number, figure: Figure, clipFace: (c: Ctx) => void) {
  const style = styleOf(styleIndex)
  const pal = hairPalette(hair, figure)
  const r = makeRng(seed + 950)
  const sheen = sheenFn([{ cx: 512, cy: 330, r: 205, w: 30 }])
  // The base fill covers the top of the face in the same gradient as the mass behind, so no seam shows where
  // they meet; the locks and curls on top cross that line freely.
  ctx.save()
  clipFace(ctx)
  const cg = ctx.createRadialGradient(512, 360, 120, 512, 480, 620)
  cg.addColorStop(0, rgba(mixRGB(pal.base, pal.dark, 0.3))); cg.addColorStop(1, rgba(pal.dark))
  ctx.fillStyle = cg
  ctx.beginPath()
  ctx.moveTo(0, 0); ctx.lineTo(1024, 0)
  for (let k = 40; k >= 0; k--) { const p = bandEdge('top', k / 40); ctx.lineTo(p.x < 512 ? p.x - 40 * (1 - k / 20) : p.x, p.y + 16) }
  ctx.lineTo(0, 470)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
  if (style === 'curly') {
    // Above the band only (inside the face's top).
    const aboveBand = (c: Ctx) => { clipFace(c); c.beginPath(); c.moveTo(0, 0); c.lineTo(1024, 0); for (let k = 40; k >= 0; k--) { const q = bandEdge('top', k / 40); c.lineTo(q.x, q.y + 14) } c.closePath(); c.clip() }
    paintCurlyVolume(ctx, pal, r, { cx: 512, cy: 270, rx: 380, ry: 250, yMax: 460 }, 90, aboveBand, false)
    return
  }
  const target: P = style === 'bun' ? { x: 512, y: 110 } : style === 'pony' ? { x: 512, y: 96 } : style === 'braids' ? { x: 512, y: 70 } : { x: 512, y: 40 }
  const part = 512 + (r() < 0.5 ? -1 : 1) * r.range(40, 90)
  // Texture first: fine strands over the whole cap, flowing toward the crown (or the part, for a crop).
  const inCap = () => {
    for (let k = 0; k < 12; k++) {
      const x = r.range(160, 864), y = r.range(30, 470)
      const band = bandEdge('top', (x - 176) / 672).y + 10
      if (y < band && ((x - SCALP.cx) / SCALP.rx) ** 2 + ((y - SCALP.cy) / SCALP.ry) ** 2 < 1) return { x, y }
    }
    return { x: 512, y: 200 }
  }
  ctx.save()
  clipFace(ctx)
  flowStrands(ctx, pal, r, style === 'crop' ? 700 : 520, inCap, style === 'crop' ? { x: part, y: 20 } : target, sheen, style === 'crop' ? [40, 90] : [70, 170])
  ctx.restore()
  if (style === 'braids') {
    // A clean centre parting down to the band, the scalp just showing.
    ctx.save(); clipFace(ctx)
    softBatch(ctx, 1.5, c => { c.strokeStyle = rgba(mixRGB(pal.dark, [236, 196, 180], 0.35), 0.8); c.lineWidth = 4; c.beginPath(); c.moveTo(512, 60); c.quadraticCurveTo(514, 150, 512, bandEdge('top', 0.5).y + 4); c.stroke() })
    ctx.restore()
  }
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
    for (const side of [-1, 1]) {
      const area = { cx: 512 + side * 318, cy: 440, rx: 38, ry: 82, yMax: 540 }
      ctx.save()
      ctx.beginPath(); ctx.ellipse(area.cx, area.cy, area.rx, area.ry, 0, 0, Math.PI * 2)
      ctx.fillStyle = rgba(mixRGB(pal.base, pal.dark, 0.4)); ctx.fill()
      ctx.restore()
      paintCurlyVolume(ctx, pal, r, area, 6, c => { c.beginPath(); c.ellipse(area.cx, area.cy, area.rx, area.ry, 0, 0, Math.PI * 2); c.clip() })
    }
    void sheen
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
