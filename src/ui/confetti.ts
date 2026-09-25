/**
 * A burst of pastel confetti over the UI: paper rectangles, little hearts and stars that pop out from a
 * point, flutter, spin and fall. One shared canvas, created on demand, removed when the last piece lands.
 */
type Bit = { x: number; y: number; vx: number; vy: number; r: number; vr: number; s: number; c: string; kind: 0 | 1 | 2; life: number; age: number; flip: number }

const COLOURS = ['#f7a3bf', '#f59ab7', '#a9e3cf', '#8fe0c4', '#cdbdf2', '#b9a5ee', '#fbe18f', '#ffffff']

let canvas: HTMLCanvasElement | null = null
let bits: Bit[] = []
let raf = 0

function frame(host: HTMLElement) {
  const c = canvas!
  const ctx = c.getContext('2d')!
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const w = host.clientWidth, h = host.clientHeight
  if (c.width !== w * dpr || c.height !== h * dpr) { c.width = w * dpr; c.height = h * dpr }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)
  const dt = 1 / 60
  for (const b of bits) {
    b.age += dt
    b.vx *= 0.985; b.vy = b.vy * 0.985 + 900 * dt * 0.55
    b.x += b.vx * dt; b.y += b.vy * dt
    b.r += b.vr * dt; b.flip += dt * 9
    const a = Math.max(0, Math.min(1, (b.life - b.age) / 0.4))
    ctx.save()
    ctx.globalAlpha = a
    ctx.translate(b.x, b.y)
    ctx.rotate(b.r)
    ctx.scale(1, Math.abs(Math.cos(b.flip)) * 0.8 + 0.2)
    ctx.fillStyle = b.c
    if (b.kind === 0) ctx.fillRect(-b.s, -b.s * 0.45, b.s * 2, b.s * 0.9)
    else if (b.kind === 1) { const s = b.s * 0.9; ctx.beginPath(); ctx.moveTo(0, s); ctx.bezierCurveTo(-s * 1.6, -s * 0.2, -s * 0.8, -s * 1.4, 0, -s * 0.5); ctx.bezierCurveTo(s * 0.8, -s * 1.4, s * 1.6, -s * 0.2, 0, s); ctx.fill() }
    else { ctx.beginPath(); for (let i = 0; i < 10; i++) { const rr = i % 2 ? b.s * 0.45 : b.s * 1.1; const an = (i / 10) * Math.PI * 2 - Math.PI / 2; ctx.lineTo(Math.cos(an) * rr, Math.sin(an) * rr) } ctx.fill() }
    ctx.restore()
  }
  bits = bits.filter(b => b.age < b.life && b.y < h + 40)
  if (bits.length) raf = requestAnimationFrame(() => frame(host))
  else { canvas?.remove(); canvas = null; raf = 0 }
}

/** Pop confetti from a screen point (default: the middle of the host). */
export function confetti(host: HTMLElement, at?: { x: number; y: number }, count = 70) {
  if (!canvas) {
    canvas = document.createElement('canvas')
    canvas.className = 'gs-confetti'
    host.append(canvas)
  }
  const rect = host.getBoundingClientRect()
  const x = at ? at.x - rect.left : rect.width / 2, y = at ? at.y - rect.top : rect.height / 2
  for (let i = 0; i < count; i++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.1
    const sp = 260 + Math.random() * 520
    bits.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: Math.random() * 6, vr: (Math.random() - 0.5) * 12, s: 4 + Math.random() * 5, c: COLOURS[Math.floor(Math.random() * COLOURS.length)], kind: Math.random() < 0.6 ? 0 : Math.random() < 0.5 ? 1 : 2, life: 1.6 + Math.random() * 1.2, age: 0, flip: Math.random() * 6 })
  }
  if (!raf) raf = requestAnimationFrame(() => frame(host))
}
