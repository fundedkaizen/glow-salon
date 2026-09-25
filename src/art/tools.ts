import type { Texture } from 'pixi.js'
import { canvasTexture, trimmed } from './tex.ts'
import { makeRng } from '../core/rng.ts'
import { blob, blurred, canvas, rgba, shade, terry, type Ctx, type RGB } from './paint.ts'

/**
 * Every tool, painted in code on a 256 canvas: the sprite that follows the pointer in a close-up and its icon
 * on the tool tray. `tip` is the point (in canvas pixels) that touches the skin.
 */
export type ToolArt = { texture: Texture; icon: string; tip: [number, number]; size: number }

const TOOL = 256
const cache = new Map<string, ToolArt>()

const pinkHandle: RGB = [246, 172, 196]
const mintHandle: RGB = [150, 214, 190]
const lilacHandle: RGB = [190, 170, 236]
const metal: RGB = [206, 210, 222]

function handle(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, w: number, color: RGB) {
  ctx.save()
  const a = Math.atan2(y1 - y0, x1 - x0), l = Math.hypot(x1 - x0, y1 - y0)
  ctx.translate(x0, y0)
  ctx.rotate(a)
  const g = ctx.createLinearGradient(0, -w / 2, 0, w / 2)
  g.addColorStop(0, rgba(shade(color, 0.45))); g.addColorStop(0.4, rgba(color)); g.addColorStop(1, rgba(shade(color, -0.25)))
  ctx.fillStyle = g
  ctx.beginPath(); ctx.roundRect(0, -w / 2, l, w, w / 2); ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ctx.beginPath(); ctx.roundRect(w * 0.4, -w / 2 + 3, l - w * 0.8, w * 0.22, 3); ctx.fill()
  ctx.restore()
}

function dropShadow(ctx: Ctx, draw: () => void) {
  blurred(ctx, 6, () => { ctx.globalAlpha = 0.28; ctx.translate(6, 8); ctx.filter = 'blur(6px) brightness(0)'; draw() })
  draw()
}

function glove(ctx: Ctx, x: number, y: number, angle: number, len = 150, w = 46) {
  // A lilac nitrile fingertip.
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(angle)
  const g = ctx.createLinearGradient(0, -w / 2, 0, w / 2)
  g.addColorStop(0, '#e6dcfb'); g.addColorStop(0.45, '#c9b8f2'); g.addColorStop(1, '#9c86d9')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.moveTo(len, -w / 2)
  ctx.lineTo(w / 2, -w / 2)
  ctx.arc(w / 2, 0, w / 2, -Math.PI / 2, Math.PI / 2, true)
  ctx.lineTo(len, w / 2)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.6)'
  ctx.beginPath(); ctx.ellipse(w * 0.9, -w * 0.22, w * 0.5, w * 0.1, 0, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = 'rgba(120,100,180,0.35)'; ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(w * 1.6, -w / 2 + 4); ctx.quadraticCurveTo(w * 1.7, 0, w * 1.6, w / 2 - 4); ctx.stroke()
  ctx.restore()
}

function pad(ctx: Ctx, x: number, y: number, r: number, tint: RGB, seed: number) {
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 2, x, y, r)
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.8, rgba(tint)); g.addColorStop(1, rgba(shade(tint, -0.08)))
  ctx.fillStyle = g
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
  ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip()
  terry(ctx, x - r, y - r, r * 2, r * 2, tint, seed, 0.03)
  ctx.strokeStyle = 'rgba(200,190,200,0.4)'; ctx.lineWidth = 1.5
  for (let k = -r; k < r; k += 12) { ctx.beginPath(); ctx.moveTo(x - r, y + k); ctx.lineTo(x + r, y + k + r * 0.3); ctx.stroke() }
  ctx.restore()
  ctx.strokeStyle = 'rgba(220,210,220,0.9)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, r - 1, 0, Math.PI * 2); ctx.stroke()
}

/** A polish bottle held at an angle with its brush out: body colour, cap colour, sparkle for top coat. */
function bottleBrush(ctx: Ctx, body: RGB, cap: string, sparkle: boolean) {
  ctx.save(); ctx.translate(56, 202); ctx.rotate(-0.78)
  ctx.fillStyle = rgba(shade(body, -0.1)); ctx.beginPath(); ctx.moveTo(0, -3); ctx.lineTo(34, -10); ctx.lineTo(34, 10); ctx.lineTo(0, 3); ctx.closePath(); ctx.fill()
  ctx.fillStyle = '#d4d4dc'; ctx.fillRect(34, -3, 30, 6)
  const cg = ctx.createLinearGradient(0, -16, 0, 16); cg.addColorStop(0, '#ffffff'); cg.addColorStop(0.3, cap); cg.addColorStop(1, cap)
  ctx.fillStyle = cg; ctx.beginPath(); ctx.roundRect(64, -14, 70, 28, 8); ctx.fill()
  const bg = ctx.createLinearGradient(0, -34, 0, 34); bg.addColorStop(0, rgba(shade(body, 0.45))); bg.addColorStop(0.5, rgba(body)); bg.addColorStop(1, rgba(shade(body, -0.3)))
  ctx.fillStyle = bg; ctx.beginPath(); ctx.roundRect(130, -34, 86, 68, 18); ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.roundRect(140, -26, 60, 10, 5); ctx.fill()
  if (sparkle) for (let i = 0; i < 14; i++) { ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fillRect(140 + (i * 37) % 66, -24 + (i * 23) % 48, 3, 3) }
  ctx.restore()
}

const PAINTERS: Record<string, { tip: [number, number]; draw: (ctx: Ctx) => void }> = {
  towel: { tip: [128, 128], draw: ctx => {
    ctx.fillStyle = '#fbf7f4'
    ctx.beginPath(); ctx.roundRect(28, 60, 200, 136, 30); ctx.fill()
    ctx.save(); ctx.beginPath(); ctx.roundRect(28, 60, 200, 136, 30); ctx.clip()
    terry(ctx, 28, 60, 200, 136, [236, 228, 226], 5, 0.04)
    ctx.fillStyle = 'rgba(247,183,201,0.8)'; ctx.fillRect(28, 170, 200, 10)
    ctx.restore()
    blurred(ctx, 4, () => { ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 6; for (const x of [90, 128, 166]) { ctx.beginPath(); ctx.moveTo(x, 50); ctx.bezierCurveTo(x - 14, 34, x + 14, 24, x, 6); ctx.stroke() } })
  } },
  foamBrush: { tip: [78, 176], draw: ctx => {
    handle(ctx, 110, 150, 230, 40, 40, pinkHandle)
    ctx.fillStyle = '#f2a0bd'
    ctx.beginPath(); ctx.arc(78, 176, 62, 0, Math.PI * 2); ctx.fill()
    const r = makeRng(3)
    for (let i = 0; i < 260; i++) { const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 52; ctx.fillStyle = `rgba(255,255,255,${r.range(0.6, 1)})`; ctx.beginPath(); ctx.arc(78 + Math.cos(a) * d, 176 + Math.sin(a) * d, r.range(2, 4.5), 0, Math.PI * 2); ctx.fill() }
    blob(ctx, 60, 156, 26, 16, [255, 255, 255], 0.6)
  } },
  shower: { tip: [70, 200], draw: ctx => {
    handle(ctx, 100, 120, 220, 20, 34, [220, 226, 236])
    ctx.save(); ctx.translate(70, 150); ctx.rotate(-0.7)
    const g = ctx.createLinearGradient(-50, 0, 50, 0); g.addColorStop(0, '#f4f6fb'); g.addColorStop(0.5, '#ffffff'); g.addColorStop(1, '#c8cedc')
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, 56, 30, 0, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#b8e2f2'; ctx.beginPath(); ctx.ellipse(0, 10, 46, 18, 0, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = 'rgba(80,130,170,0.6)'; for (let i = -3; i <= 3; i++) for (let j = -1; j <= 1; j++) { ctx.beginPath(); ctx.arc(i * 11, 10 + j * 7, 2, 0, Math.PI * 2); ctx.fill() }
    ctx.restore()
  } },
  fingers: { tip: [96, 160], draw: ctx => { glove(ctx, 80, 150, -0.5, 170, 50); glove(ctx, 106, 186, -0.95, 150, 44) } },
  loop: { tip: [52, 204], draw: ctx => {
    handle(ctx, 90, 166, 236, 22, 18, metal)
    ctx.strokeStyle = '#aab2c4'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(90, 166); ctx.lineTo(62, 194); ctx.stroke()
    ctx.strokeStyle = '#dfe4ee'; ctx.lineWidth = 5; ctx.beginPath(); ctx.ellipse(52, 204, 16, 12, -0.7, 0, Math.PI * 2); ctx.stroke()
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(52, 204, 16, 12, -0.7, Math.PI, Math.PI * 1.6); ctx.stroke()
    handle(ctx, 150, 106, 200, 58, 26, lilacHandle)
  } },
  cottonPad: { tip: [110, 150], draw: ctx => { pad(ctx, 110, 150, 72, [248, 246, 250], 7); glove(ctx, 150, 110, -0.9, 150, 44) } },
  tonerPad: { tip: [110, 150], draw: ctx => { pad(ctx, 110, 150, 72, [252, 226, 236], 8); glove(ctx, 150, 110, -0.9, 150, 44) } },
  maskBrush: { tip: [64, 196], draw: ctx => {
    handle(ctx, 104, 146, 236, 20, 22, mintHandle)
    ctx.fillStyle = '#d9dee8'; ctx.save(); ctx.translate(96, 154); ctx.rotate(-0.78); ctx.fillRect(-10, -18, 26, 36); ctx.restore()
    ctx.save(); ctx.translate(64, 190); ctx.rotate(-0.78)
    ctx.beginPath(); ctx.moveTo(40, -20); ctx.lineTo(40, 20); ctx.quadraticCurveTo(-20, 44, -34, 0); ctx.quadraticCurveTo(-20, -44, 40, -20); ctx.closePath()
    const g = ctx.createLinearGradient(-34, 0, 40, 0); g.addColorStop(0, '#93d6bd'); g.addColorStop(0.5, '#f1e6d6'); g.addColorStop(1, '#e8dccb')
    ctx.fillStyle = g; ctx.fill()
    ctx.fillStyle = 'rgba(150,215,190,0.95)'; ctx.beginPath(); ctx.ellipse(-18, 0, 18, 30, 0, 0, Math.PI * 2); ctx.fill()
    ctx.restore()
  } },
  fan: { tip: [128, 150], draw: ctx => {
    ctx.save(); ctx.translate(128, 200)
    for (let i = -6; i <= 6; i++) {
      ctx.save(); ctx.rotate(i * 0.13)
      ctx.fillStyle = i % 2 ? '#f7c6d4' : '#fde8ee'
      ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(-13, -150); ctx.lineTo(13, -150); ctx.lineTo(6, 0); ctx.closePath(); ctx.fill()
      ctx.restore()
    }
    ctx.fillStyle = '#e98aa8'; ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.fill()
    ctx.restore()
    handle(ctx, 128, 200, 128, 250, 16, [233, 138, 168])
  } },
  dropper: { tip: [60, 214], draw: ctx => {
    ctx.save(); ctx.translate(60, 214); ctx.rotate(-0.72)
    const g = ctx.createLinearGradient(-12, 0, 12, 0); g.addColorStop(0, 'rgba(255,230,160,0.8)'); g.addColorStop(0.5, 'rgba(255,248,220,0.9)'); g.addColorStop(1, 'rgba(240,196,110,0.85)')
    ctx.fillStyle = g
    ctx.beginPath(); ctx.moveTo(-3, 0); ctx.lineTo(-12, -40); ctx.lineTo(-12, -120); ctx.lineTo(12, -120); ctx.lineTo(12, -40); ctx.lineTo(3, 0); ctx.closePath(); ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 2; ctx.stroke()
    ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillRect(-8, -110, 4, 60)
    const bulb = ctx.createLinearGradient(-22, 0, 22, 0); bulb.addColorStop(0, '#f7b3c8'); bulb.addColorStop(0.5, '#fbd3df'); bulb.addColorStop(1, '#e27d9e')
    ctx.fillStyle = bulb; ctx.beginPath(); ctx.roundRect(-20, -190, 40, 74, 18); ctx.fill()
    ctx.fillStyle = '#e8c890'; ctx.fillRect(-16, -124, 32, 10)
    ctx.restore()
  } },
  cream: { tip: [84, 170], draw: ctx => {
    glove(ctx, 84, 170, -0.75, 190, 52)
    blob(ctx, 84, 168, 30, 22, [255, 250, 244], 1, 0.6)
    ctx.fillStyle = '#fffaf4'; ctx.beginPath(); ctx.ellipse(80, 166, 26, 18, -0.4, 0, Math.PI * 2); ctx.fill()
    blob(ctx, 72, 158, 10, 6, [255, 255, 255], 1)
  } },
  patch: { tip: [128, 128], draw: ctx => {
    ctx.beginPath()
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 - Math.PI / 2, r = i % 2 ? 26 : 50; ctx.lineTo(128 + Math.cos(a) * r, 128 + Math.sin(a) * r) }
    ctx.closePath(); ctx.lineJoin = 'round'; ctx.fillStyle = 'rgba(255,238,246,0.9)'; ctx.fill(); ctx.strokeStyle = '#f0a0c4'; ctx.lineWidth = 4; ctx.stroke()
  } },
  sponge: { tip: [110, 150], draw: ctx => {
    ctx.fillStyle = '#fbe7b0'; ctx.beginPath(); ctx.roundRect(40, 90, 150, 110, 36); ctx.fill()
    ctx.save(); ctx.beginPath(); ctx.roundRect(40, 90, 150, 110, 36); ctx.clip()
    const r = makeRng(9)
    for (let i = 0; i < 90; i++) { ctx.fillStyle = `rgba(226,190,110,${r.range(0.3, 0.7)})`; ctx.beginPath(); ctx.ellipse(r.range(40, 190), r.range(90, 200), r.range(2, 7), r.range(2, 5), r() * 3, 0, Math.PI * 2); ctx.fill() }
    ctx.restore()
    blob(ctx, 90, 112, 40, 14, [255, 255, 255], 0.5)
    ctx.fillStyle = 'rgba(140,200,240,0.5)'; ctx.beginPath(); ctx.roundRect(40, 176, 150, 24, 12); ctx.fill()
  } },
  nailBrush: { tip: [70, 190], draw: ctx => {
    handle(ctx, 100, 160, 230, 40, 30, mintHandle)
    ctx.save(); ctx.translate(70, 190); ctx.rotate(-0.75)
    ctx.fillStyle = '#f4f1ea'; ctx.beginPath(); ctx.roundRect(-40, -22, 80, 26, 8); ctx.fill()
    ctx.strokeStyle = '#e9dfcf'; ctx.lineWidth = 3
    for (let x = -34; x <= 34; x += 7) { ctx.beginPath(); ctx.moveTo(x, 4); ctx.lineTo(x, 22); ctx.stroke() }
    ctx.restore()
  } },
  clipper: { tip: [58, 196], draw: ctx => {
    ctx.save(); ctx.translate(58, 196); ctx.rotate(-0.75)
    const g = ctx.createLinearGradient(0, -20, 0, 20); g.addColorStop(0, '#f1f3f8'); g.addColorStop(0.5, '#c5cad6'); g.addColorStop(1, '#8f96a8')
    ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(-6, -18, 150, 36, 12); ctx.fill()
    ctx.fillStyle = '#f7b7c9'; ctx.beginPath(); ctx.roundRect(60, -26, 110, 14, 7); ctx.fill()
    ctx.fillStyle = '#6f7688'; ctx.fillRect(-6, -2, 20, 4)
    ctx.restore()
  } },
  file: { tip: [60, 196], draw: ctx => {
    ctx.save(); ctx.translate(60, 196); ctx.rotate(-0.8)
    ctx.fillStyle = '#f5a9c0'; ctx.beginPath(); ctx.roundRect(-10, -14, 220, 28, 14); ctx.fill()
    const r = makeRng(12)
    for (let i = 0; i < 300; i++) { ctx.fillStyle = `rgba(255,255,255,${r.range(0.2, 0.8)})`; ctx.fillRect(r.range(-6, 206), r.range(-12, 12), 1.5, 1.5) }
    ctx.fillStyle = '#fbe0e8'; ctx.fillRect(90, -14, 34, 28)
    ctx.restore()
  } },
  pusher: { tip: [54, 202], draw: ctx => {
    handle(ctx, 80, 176, 230, 26, 20, metal)
    ctx.fillStyle = '#e6eaf2'; ctx.save(); ctx.translate(54, 202); ctx.rotate(-0.78); ctx.beginPath(); ctx.ellipse(0, 0, 18, 11, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore()
    handle(ctx, 120, 136, 180, 76, 26, lilacHandle)
  } },
  nipper: { tip: [60, 196], draw: ctx => {
    ctx.save(); ctx.translate(60, 196); ctx.rotate(-0.78)
    ctx.fillStyle = '#c7ccd8'; ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(40, -14); ctx.lineTo(40, 14); ctx.lineTo(0, 6); ctx.closePath(); ctx.fill()
    ctx.restore()
    handle(ctx, 90, 166, 210, 90, 22, pinkHandle)
    handle(ctx, 90, 166, 180, 40, 22, pinkHandle)
  } },
  buffer: { tip: [100, 160], draw: ctx => {
    ctx.save(); ctx.translate(120, 140); ctx.rotate(-0.8)
    const colors = ['#f7c6d4', '#d9ccf5', '#bfeadb', '#fbe7b0']
    colors.forEach((c, i) => { ctx.fillStyle = c; ctx.beginPath(); ctx.roundRect(-110, -34 + i * 17, 220, 17, 6); ctx.fill() })
    ctx.restore()
  } },
  scrub: { tip: [84, 170], draw: ctx => {
    glove(ctx, 84, 170, -0.75, 190, 52)
    const r = makeRng(4)
    for (let i = 0; i < 90; i++) { const a = r() * 6.28, d = Math.sqrt(r()) * 26; ctx.fillStyle = r() < 0.5 ? 'rgba(255,248,236,1)' : 'rgba(240,210,170,1)'; ctx.fillRect(82 + Math.cos(a) * d, 166 + Math.sin(a) * d * 0.7, 3.5, 3.5) }
  } },
  polishBrush: { tip: [56, 202], draw: ctx => bottleBrush(ctx, [240, 120, 160], '#3c3048', false) },
  baseCoat: { tip: [56, 202], draw: ctx => bottleBrush(ctx, [250, 236, 240], '#f4f0f2', false) },
  topCoat: { tip: [56, 202], draw: ctx => bottleBrush(ctx, [214, 236, 252], '#e9c46a', true) },
  uvLamp: { tip: [128, 150], draw: ctx => {
    const g = ctx.createLinearGradient(0, 60, 0, 200); g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#e4def0')
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(20, 200); ctx.quadraticCurveTo(20, 60, 128, 60); ctx.quadraticCurveTo(236, 60, 236, 200); ctx.closePath(); ctx.fill()
    ctx.fillStyle = '#b89cf0'; ctx.beginPath(); ctx.roundRect(40, 190, 176, 14, 7); ctx.fill()
    blob(ctx, 128, 205, 90, 20, [190, 150, 255], 0.8)
    ctx.fillStyle = '#9c86d9'; ctx.beginPath(); ctx.arc(128, 100, 10, 0, Math.PI * 2); ctx.fill()
  } },
  gems: { tip: [60, 196], draw: ctx => {
    handle(ctx, 70, 186, 220, 40, 14, metal)
    handle(ctx, 80, 196, 230, 56, 14, shade(metal, -0.1))
    ctx.save(); ctx.translate(60, 196); ctx.rotate(0.4)
    ctx.fillStyle = '#e8f6ff'; ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(13, 0); ctx.lineTo(0, 14); ctx.lineTo(-13, 0); ctx.closePath(); ctx.fill()
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(6, -3); ctx.lineTo(-6, -3); ctx.closePath(); ctx.fill()
    ctx.restore()
  } },
}

export function toolArt(id: string): ToolArt {
  let art = cache.get(id)
  if (art) return art
  const painter = PAINTERS[id] ?? PAINTERS.fingers
  const [c, ctx] = canvas(TOOL)
  dropShadow(ctx, () => painter.draw(ctx))
  // The tray icon: the same art, trimmed so the tool fills its button.
  const [clean, cctx] = canvas(TOOL)
  painter.draw(cctx)
  art = { texture: canvasTexture(c), icon: trimmed(clean, 112, 4).toDataURL(), tip: painter.tip, size: TOOL }
  cache.set(id, art)
  return art
}
