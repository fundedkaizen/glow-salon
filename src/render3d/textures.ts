import { CanvasTexture, ClampToEdgeWrapping, LinearMipmapLinearFilter, RepeatWrapping, SRGBColorSpace, type Texture } from 'three'

/**
 * Textures painted in code for the 3D salon: warm wood planks, the walls (blush above a cream wainscot), the
 * window view, the soft shade layer that grounds the room (corner occlusion and contact shadows), and the floor
 * decals (the station glow, the empty-slot plus, the walk marker).
 */
type Ctx = CanvasRenderingContext2D

function canvas(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return [c, c.getContext('2d')!]
}

export function tex(c: HTMLCanvasElement, opts: { repeat?: boolean; color?: boolean; aniso?: number } = {}): CanvasTexture {
  const t = new CanvasTexture(c)
  if (opts.color !== false) t.colorSpace = SRGBColorSpace
  t.wrapS = t.wrapT = opts.repeat ? RepeatWrapping : ClampToEdgeWrapping
  t.minFilter = LinearMipmapLinearFilter
  t.anisotropy = opts.aniso ?? 8
  t.generateMipmaps = true
  return t
}

// A seeded random, so the planks are the same every time.
function rng(seed: number) {
  let s = seed >>> 0
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 }
}

const rgb = (r: number, g: number, b: number, a = 1) => `rgba(${r | 0},${g | 0},${b | 0},${a})`

/** Wood planks running along X: one tile is 2 m square, boards 22 cm wide in staggered lengths. */
export function woodTexture(): CanvasTexture {
  const S = 1024
  const [c, ctx] = canvas(S, S)
  const r = rng(7)
  const rows = 9
  const ph = S / rows
  const base = [228, 168, 126]
  for (let row = 0; row < rows; row++) {
    let x = -r() * 400
    while (x < S) {
      const len = 380 + r() * 420
      const k = (r() - 0.5) * 0.16
      const warm = (r() - 0.5) * 10
      const col = base.map((v, i) => v * (1 + k) + (i === 0 ? warm : i === 2 ? -warm : 0))
      const y = row * ph
      const g = ctx.createLinearGradient(0, y, 0, y + ph)
      g.addColorStop(0, rgb(col[0] + 6, col[1] + 6, col[2] + 6))
      g.addColorStop(0.5, rgb(col[0], col[1], col[2]))
      g.addColorStop(1, rgb(col[0] - 8, col[1] - 8, col[2] - 8))
      ctx.fillStyle = g
      ctx.fillRect(x, y, len, ph)
      // Grain: long faint streaks and a knot now and then.
      for (let i = 0; i < 7; i++) {
        const gy = y + 4 + r() * (ph - 8)
        ctx.strokeStyle = rgb(col[0] - 24, col[1] - 28, col[2] - 28, 0.05 + r() * 0.06)
        ctx.lineWidth = 1 + r() * 1.5
        ctx.beginPath()
        ctx.moveTo(x, gy)
        for (let s = 0; s <= 6; s++) ctx.lineTo(x + (len * s) / 6, gy + Math.sin(s * 1.3 + r() * 2) * 2.2)
        ctx.stroke()
      }
      if (r() < 0.25) {
        const kx = x + 40 + r() * (len - 80), ky = y + ph * (0.3 + r() * 0.4)
        ctx.fillStyle = rgb(col[0] - 40, col[1] - 46, col[2] - 44, 0.25)
        ctx.beginPath(); ctx.ellipse(kx, ky, 10 + r() * 8, 3 + r() * 2, 0, 0, Math.PI * 2); ctx.fill()
      }
      // The seam at the end of the plank.
      ctx.fillStyle = rgb(150, 100, 80, 0.3)
      ctx.fillRect(x + len - 2, y, 2, ph)
      x += len
    }
    // The long seam between rows, with a highlight on the lit edge.
    ctx.fillStyle = rgb(140, 92, 74, 0.32)
    ctx.fillRect(0, row * ph, S, 3)
    ctx.fillStyle = rgb(255, 240, 225, 0.2)
    ctx.fillRect(0, row * ph + 3, S, 2)
  }
  return tex(c, { repeat: true, aniso: 16 })
}

/** A tiled paving for the pavement outside, and a lawn. */
export function pavingTexture(): CanvasTexture {
  const S = 512
  const [c, ctx] = canvas(S, S)
  const r = rng(3)
  ctx.fillStyle = rgb(226, 214, 208)
  ctx.fillRect(0, 0, S, S)
  const n = 4
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const k = (r() - 0.5) * 14
    ctx.fillStyle = rgb(238 + k, 229 + k, 224 + k)
    ctx.fillRect(x * (S / n) + 3, y * (S / n) + 3, S / n - 6, S / n - 6)
  }
  return tex(c, { repeat: true })
}

export function lawnTexture(): CanvasTexture {
  const S = 512
  const [c, ctx] = canvas(S, S)
  const r = rng(11)
  ctx.fillStyle = rgb(178, 212, 160)
  ctx.fillRect(0, 0, S, S)
  for (let i = 0; i < 1800; i++) {
    const x = r() * S, y = r() * S
    const k = (r() - 0.5) * 30
    ctx.fillStyle = rgb(170 + k, 208 + k, 150 + k, 0.5)
    ctx.fillRect(x, y, 2, 5)
  }
  return tex(c, { repeat: true })
}

/**
 * A wall's inner face: blush plaster above a cream panelled wainscot with a chair rail, and soft occlusion
 * where it meets the floor and the other wall. `w` and `h` in metres; `cornerAt` darkens the end at that side.
 */
export function wallTexture(w: number, h: number, cornerAt: 'left' | 'right' | null, doors: { x0: number; x1: number; top: number }[] = []): CanvasTexture {
  const PX = 96
  const [c, ctx] = canvas(Math.round(w * PX), Math.round(h * PX))
  const W = c.width, H = c.height
  const y = (m: number) => H - m * PX
  // Plaster, a little lighter towards the top.
  const g = ctx.createLinearGradient(0, 0, 0, H)
  g.addColorStop(0, rgb(252, 226, 232))
  g.addColorStop(1, rgb(246, 206, 218))
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
  // A faint damask dot pattern.
  ctx.fillStyle = rgb(255, 255, 255, 0.28)
  for (let yy = 18; yy < y(1.05); yy += 36) for (let xx = (yy / 36) % 2 ? 18 : 0; xx < W; xx += 36) { ctx.beginPath(); ctx.arc(xx, yy, 2.2, 0, Math.PI * 2); ctx.fill() }
  // Wainscot: cream panels with a raised moulding.
  const top = y(1.0)
  ctx.fillStyle = rgb(255, 248, 242)
  ctx.fillRect(0, top, W, H - top)
  const pw = 0.9 * PX
  for (let x = 12; x + pw - 24 < W; x += pw) {
    ctx.strokeStyle = rgb(232, 206, 206, 0.9)
    ctx.lineWidth = 3
    ctx.strokeRect(x + 10, top + 16, pw - 24, H - top - 16 - 0.2 * PX)
    ctx.strokeStyle = rgb(255, 255, 255, 0.9)
    ctx.lineWidth = 1.5
    ctx.strokeRect(x + 12, top + 18, pw - 24, H - top - 16 - 0.2 * PX)
  }
  // The chair rail's shadow on the plaster.
  const sg = ctx.createLinearGradient(0, top - 18, 0, top)
  sg.addColorStop(0, rgb(180, 110, 130, 0))
  sg.addColorStop(1, rgb(180, 110, 130, 0.22))
  ctx.fillStyle = sg
  ctx.fillRect(0, top - 18, W, 18)
  // Soft occlusion along the floor.
  const fg = ctx.createLinearGradient(0, H - 0.5 * PX, 0, H)
  fg.addColorStop(0, rgb(120, 60, 84, 0))
  fg.addColorStop(1, rgb(120, 60, 84, 0.3))
  ctx.fillStyle = fg
  ctx.fillRect(0, H - 0.5 * PX, W, 0.5 * PX)
  // And in the corner.
  if (cornerAt) {
    const x0 = cornerAt === 'left' ? 0 : W
    const cg = ctx.createLinearGradient(x0, 0, cornerAt === 'left' ? 0.7 * PX : W - 0.7 * PX, 0)
    cg.addColorStop(0, rgb(120, 60, 84, 0.28))
    cg.addColorStop(1, rgb(120, 60, 84, 0))
    ctx.fillStyle = cg
    ctx.fillRect(cornerAt === 'left' ? 0 : W - 0.7 * PX, 0, 0.7 * PX, H)
  }
  // Occlusion around door openings.
  for (const d of doors) {
    ctx.fillStyle = rgb(120, 60, 84, 0.12)
    ctx.fillRect(d.x0 * PX - 10, y(d.top) - 10, (d.x1 - d.x0) * PX + 20, d.top * PX + 10)
  }
  return tex(c)
}

/** The view through a window: a soft sky over a hedge and a blossom tree. Arched at the top when `arch`. */
export function windowView(arch: boolean): CanvasTexture {
  const [c, ctx] = canvas(256, 384)
  const W = 256, H = 384
  ctx.save()
  if (arch) {
    ctx.beginPath()
    ctx.moveTo(0, H)
    ctx.lineTo(0, W / 2)
    ctx.arc(W / 2, W / 2, W / 2, Math.PI, 0)
    ctx.lineTo(W, H)
    ctx.closePath()
    ctx.clip()
  }
  const g = ctx.createLinearGradient(0, 0, 0, H)
  g.addColorStop(0, '#bfe3f6')
  g.addColorStop(0.62, '#f3eef5')
  g.addColorStop(1, '#fbe3ea')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
  // Clouds.
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  for (const [x, y, r] of [[60, 110, 26], [88, 100, 30], [118, 112, 22], [190, 170, 18], [210, 164, 22]]) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill() }
  // A blossom tree and a hedge.
  ctx.fillStyle = '#f6b8cc'
  for (const [x, y, r] of [[40, 250, 44], [80, 226, 40], [20, 214, 30]]) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill() }
  ctx.fillStyle = '#9fcf92'
  ctx.beginPath(); ctx.roundRect(-10, 292, W + 20, 120, 40); ctx.fill()
  ctx.fillStyle = '#b6dfa8'
  for (let x = 0; x < W; x += 34) { ctx.beginPath(); ctx.arc(x + 12, 300, 22, 0, Math.PI * 2); ctx.fill() }
  // Glass sheen.
  const s = ctx.createLinearGradient(0, 0, W, H)
  s.addColorStop(0, 'rgba(255,255,255,0)')
  s.addColorStop(0.45, 'rgba(255,255,255,0)')
  s.addColorStop(0.5, 'rgba(255,255,255,0.35)')
  s.addColorStop(0.58, 'rgba(255,255,255,0)')
  ctx.fillStyle = s
  ctx.fillRect(0, 0, W, H)
  ctx.restore()
  return tex(c)
}

export type ShadeBlob = { x: number; z: number; rx: number; rz: number; a: number; rot?: number }

/**
 * The shade layer over the whole floor (multiplied onto it): soft occlusion along the two tall walls and in their
 * corner, and a soft contact shadow under each piece of furniture. Metres in, `w` x `d` room.
 */
export function paintShade(c: HTMLCanvasElement, w: number, d: number, blobs: ShadeBlob[], walls: { back: boolean; right: boolean; left: boolean }) {
  const PX = 48
  c.width = Math.round(w * PX)
  c.height = Math.round(d * PX)
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, c.width, c.height)
  const edge = (x0: number, y0: number, x1: number, y1: number, a: number) => {
    const g = ctx.createLinearGradient(x0, y0, x1, y1)
    g.addColorStop(0, `rgba(150,96,110,${a})`)
    g.addColorStop(1, 'rgba(150,96,110,0)')
    ctx.fillStyle = g
    ctx.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0) || c.width, Math.abs(y1 - y0) || c.height)
  }
  ctx.globalCompositeOperation = 'multiply'
  if (walls.back) edge(0, 0, 0, 0.8 * PX, 0.45)
  if (walls.right) edge(c.width, 0, c.width - 0.8 * PX, 0, 0.45)
  if (walls.left) edge(0, 0, 0.5 * PX, 0, 0.25)
  for (const b of blobs) {
    ctx.save()
    ctx.translate((b.x + w / 2) * PX, b.z * PX)
    ctx.rotate(b.rot ?? 0)
    ctx.scale(b.rx * PX, b.rz * PX)
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1)
    g.addColorStop(0, `rgba(140,84,100,${b.a})`)
    g.addColorStop(0.55, `rgba(140,84,100,${b.a * 0.6})`)
    g.addColorStop(1, 'rgba(140,84,100,0)')
    ctx.fillStyle = g
    ctx.beginPath(); ctx.arc(0, 0, 1, 0, Math.PI * 2); ctx.fill()
    ctx.restore()
  }
  ctx.globalCompositeOperation = 'source-over'
}

/** A soft round glow (for the station glow, the lamps and the walk marker's fill). */
export function glowTexture(): Texture {
  const [c, ctx] = canvas(128, 128)
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.35, 'rgba(255,255,255,0.55)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 128, 128)
  return tex(c)
}

/** A contact shadow for people (a soft dark disc). */
export function blobTexture(): Texture {
  const [c, ctx] = canvas(64, 64)
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  g.addColorStop(0, 'rgba(80,40,56,0.55)')
  g.addColorStop(0.5, 'rgba(80,40,56,0.3)')
  g.addColorStop(1, 'rgba(80,40,56,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 64, 64)
  return tex(c)
}

/** The station glow on the floor: a soft rounded pad with a bright rim. */
export function padTexture(): Texture {
  const [c, ctx] = canvas(256, 192)
  ctx.filter = 'blur(10px)'
  ctx.strokeStyle = 'rgba(255,255,255,0.95)'
  ctx.lineWidth = 16
  ctx.beginPath(); ctx.roundRect(24, 24, 208, 144, 56); ctx.stroke()
  ctx.filter = 'blur(22px)'
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.beginPath(); ctx.roundRect(40, 40, 176, 112, 44); ctx.fill()
  return tex(c)
}

/** An empty slot on the floor: a rounded outline and a plus. `strong`: glowing (a new station waits to be placed). */
export function slotTexture(strong: boolean): Texture {
  const [c, ctx] = canvas(256, 176)
  ctx.fillStyle = strong ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.22)'
  ctx.strokeStyle = strong ? 'rgba(233,138,168,0.95)' : 'rgba(214,150,172,0.6)'
  ctx.lineWidth = strong ? 7 : 4
  ctx.setLineDash(strong ? [] : [14, 10])
  ctx.beginPath(); ctx.roundRect(8, 8, 240, 160, 40); ctx.fill(); ctx.stroke()
  ctx.setLineDash([])
  ctx.fillStyle = strong ? '#e98aa8' : 'rgba(233,138,168,0.6)'
  ctx.beginPath(); ctx.arc(128, 88, strong ? 32 : 26, 0, Math.PI * 2); ctx.fill()
  if (strong) { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 5; ctx.stroke() }
  ctx.fillStyle = '#ffffff'
  const a = strong ? 18 : 14, b = strong ? 5 : 4
  ctx.beginPath(); ctx.roundRect(128 - b, 88 - a, b * 2, a * 2, b); ctx.fill()
  ctx.beginPath(); ctx.roundRect(128 - a, 88 - b, a * 2, b * 2, b); ctx.fill()
  return tex(c)
}

/** The walk-to marker: a ring. */
export function ringTexture(): Texture {
  const [c, ctx] = canvas(128, 128)
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 9
  ctx.beginPath(); ctx.arc(64, 64, 50, 0, Math.PI * 2); ctx.stroke()
  return tex(c)
}

/** A texture from a painted 2D canvas (the gifts, the wall art, the filler frames). */
export function fromCanvas(c: HTMLCanvasElement): CanvasTexture { return tex(c) }

/** A brass plaque with the salon's name, for the reception desk. */
export function plaqueTexture(name: string): { tex: CanvasTexture; aspect: number } {
  const [m, mctx] = canvas(8, 8)
  void m
  mctx.font = '600 44px Fredoka, Nunito, sans-serif'
  const tw = Math.ceil(mctx.measureText(name).width)
  const [c, ctx] = canvas(tw + 70, 80)
  ctx.fillStyle = '#e98aa8'
  ctx.strokeStyle = '#f0c36a'
  ctx.lineWidth = 6
  ctx.beginPath(); ctx.roundRect(4, 4, c.width - 8, 72, 36); ctx.fill(); ctx.stroke()
  ctx.font = '600 44px Fredoka, Nunito, sans-serif'
  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(name, c.width / 2, 43)
  return { tex: tex(c), aspect: c.width / c.height }
}

/** A rug: a rounded pad with a border and a simple motif, in the given colours. */
export function rugTexture(kind: 'round' | 'runner' | 'cloud' | 'plain', main: string, border: string, motif: string): CanvasTexture {
  const [c, ctx] = canvas(512, kind === 'runner' ? 192 : 384)
  const W = c.width, H = c.height
  ctx.fillStyle = main
  ctx.strokeStyle = border
  ctx.lineWidth = 14
  if (kind === 'round' || kind === 'cloud') {
    ctx.beginPath(); ctx.ellipse(W / 2, H / 2, W / 2 - 10, H / 2 - 10, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    ctx.lineWidth = 4
    ctx.strokeStyle = motif
    ctx.beginPath(); ctx.ellipse(W / 2, H / 2, W / 2 - 40, H / 2 - 40, 0, 0, Math.PI * 2); ctx.stroke()
    if (kind === 'cloud') {
      ctx.fillStyle = motif
      for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; ctx.beginPath(); ctx.arc(W / 2 + Math.cos(a) * (W / 2 - 70), H / 2 + Math.sin(a) * (H / 2 - 70), 12, 0, Math.PI * 2); ctx.fill() }
    }
  } else {
    ctx.beginPath(); ctx.roundRect(8, 8, W - 16, H - 16, 26); ctx.fill(); ctx.stroke()
    ctx.fillStyle = motif
    const step = kind === 'runner' ? 64 : 72
    for (let x = step / 2 + 20; x < W - 20; x += step) for (let y = step / 2 + 14; y < H - 20; y += step) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4); ctx.fillRect(-9, -9, 18, 18); ctx.restore()
    }
  }
  // A little fibre noise.
  const r = rng(5)
  for (let i = 0; i < 1400; i++) { ctx.fillStyle = `rgba(255,255,255,${r() * 0.08})`; ctx.fillRect(r() * W, r() * H, 2, 2) }
  return tex(c)
}
