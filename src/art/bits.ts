import type { Texture } from 'pixi.js'
import { canvasTexture } from './tex.ts'
import { blob, blurred, canvas, rgba, type Ctx } from './paint.ts'

/**
 * Small painted textures shared by the close-ups and the floor: particles (sparkles, bubbles, drops, pus,
 * steam, flakes), treatment targets (whiteheads, blackheads, patches, gems) and little icons. Made once.
 */
const cache = new Map<string, Texture>()

function make(key: string, w: number, h: number, draw: (ctx: Ctx) => void): Texture {
  let t = cache.get(key)
  if (!t) {
    const [c, ctx] = canvas(w, h)
    draw(ctx)
    t = canvasTexture(c)
    cache.set(key, t)
  }
  return t
}

export const bits = {
  sparkle: () => make('sparkle', 96, 96, ctx => {
    blob(ctx, 48, 48, 30, 30, [255, 255, 255], 0.55)
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2
      const r = i % 2 === 0 ? 46 : 7
      ctx.lineTo(48 + Math.cos(a) * r, 48 + Math.sin(a) * r)
    }
    ctx.closePath()
    ctx.fill()
    blob(ctx, 48, 48, 12, 12, [255, 255, 255], 1)
  }),
  glow: () => make('glow', 64, 64, ctx => blob(ctx, 32, 32, 32, 32, [255, 255, 255], 1)),
  bubble: () => make('bubble', 96, 96, ctx => {
    // A soap bubble: clear middle, iridescent rim, a sharp window highlight.
    const g = ctx.createRadialGradient(48, 48, 20, 48, 48, 46)
    g.addColorStop(0, 'rgba(255,255,255,0.06)')
    g.addColorStop(0.75, 'rgba(236,240,255,0.22)')
    g.addColorStop(0.92, 'rgba(200,210,240,0.75)')
    g.addColorStop(1, 'rgba(180,190,230,0)')
    ctx.fillStyle = g
    ctx.beginPath(); ctx.arc(48, 48, 46, 0, Math.PI * 2); ctx.fill()
    ctx.globalCompositeOperation = 'source-atop'
    const ir = ctx.createLinearGradient(10, 10, 86, 86)
    ir.addColorStop(0, 'rgba(255,170,220,0.35)'); ir.addColorStop(0.5, 'rgba(170,240,255,0.25)'); ir.addColorStop(1, 'rgba(255,230,160,0.35)')
    ctx.fillStyle = ir
    ctx.fillRect(0, 0, 96, 96)
    ctx.globalCompositeOperation = 'source-over'
    ctx.fillStyle = 'rgba(255,255,255,0.95)'
    ctx.beginPath(); ctx.ellipse(33, 30, 11, 7, -0.7, 0, Math.PI * 2); ctx.fill()
    blob(ctx, 64, 68, 8, 5, [255, 255, 255], 0.7)
  }),
  foamBlob: () => make('foamBlob', 96, 96, ctx => {
    // A clump of foam: a few bubbles fused, white with soft grey undersides.
    const parts: [number, number, number][] = [[48, 50, 26], [30, 56, 18], [66, 56, 19], [40, 36, 16], [60, 36, 15], [48, 66, 17]]
    for (const [x, y, r] of parts) { ctx.fillStyle = 'rgba(210,212,230,1)'; ctx.beginPath(); ctx.arc(x, y + 2, r, 0, Math.PI * 2); ctx.fill() }
    for (const [x, y, r] of parts) {
      const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, 1, x, y, r)
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.7, '#f7f7fd'); g.addColorStop(1, '#dfe0ee')
      ctx.fillStyle = g
      ctx.beginPath(); ctx.arc(x, y, r - 1.5, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,1)'
      ctx.beginPath(); ctx.ellipse(x - r * 0.35, y - r * 0.42, r * 0.28, r * 0.18, -0.6, 0, Math.PI * 2); ctx.fill()
    }
  }),
  drop: () => make('drop', 40, 56, ctx => {
    ctx.beginPath()
    ctx.moveTo(20, 2)
    ctx.bezierCurveTo(26, 16, 36, 26, 36, 36)
    ctx.arc(20, 36, 16, 0, Math.PI)
    ctx.bezierCurveTo(4, 26, 14, 16, 20, 2)
    const g = ctx.createRadialGradient(15, 32, 2, 20, 38, 22)
    g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.4, 'rgba(200,232,255,0.6)'); g.addColorStop(1, 'rgba(120,180,230,0.75)')
    ctx.fillStyle = g
    ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.95)'
    ctx.beginPath(); ctx.ellipse(14, 32, 4, 7, -0.3, 0, Math.PI * 2); ctx.fill()
  }),
  streak: () => make('streak', 16, 64, ctx => {
    const g = ctx.createLinearGradient(0, 0, 0, 64)
    g.addColorStop(0, 'rgba(200,235,255,0)'); g.addColorStop(0.6, 'rgba(210,240,255,0.8)'); g.addColorStop(1, 'rgba(255,255,255,1)')
    ctx.fillStyle = g
    ctx.beginPath(); ctx.ellipse(8, 32, 5, 31, 0, 0, Math.PI * 2); ctx.fill()
  }),
  pus: () => make('pus', 48, 48, ctx => {
    const g = ctx.createRadialGradient(18, 18, 2, 24, 24, 22)
    g.addColorStop(0, '#fffdf0'); g.addColorStop(0.5, '#fbeeb8'); g.addColorStop(1, '#efd68a')
    ctx.fillStyle = g
    ctx.beginPath(); ctx.arc(24, 24, 20, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.95)'
    ctx.beginPath(); ctx.ellipse(17, 16, 6, 4, -0.6, 0, Math.PI * 2); ctx.fill()
  }),
  steam: () => make('steam', 128, 128, ctx => blurred(ctx, 14, () => blob(ctx, 64, 64, 44, 44, [255, 255, 255], 0.9))),
  /** A curling wisp of steam: a soft S of vapour, thicker at the bottom, fading as it rises. */
  wisp: () => make('wisp', 96, 192, ctx => blurred(ctx, 6, () => {
    for (let k = 0; k < 3; k++) {
      const g = ctx.createLinearGradient(0, 190, 0, 0)
      g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.strokeStyle = g; ctx.lineWidth = 16 - k * 5; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(48 + k * 3, 184); ctx.bezierCurveTo(10, 140, 86, 90, 48, 50); ctx.quadraticCurveTo(26, 26, 44, 8); ctx.stroke()
    }
  })),
  flake: () => make('flake', 48, 48, ctx => {
    ctx.fillStyle = '#d6f0e4'
    ctx.beginPath(); ctx.moveTo(6, 20); ctx.lineTo(22, 4); ctx.lineTo(42, 12); ctx.lineTo(40, 34); ctx.lineTo(20, 44); ctx.lineTo(8, 34); ctx.closePath(); ctx.fill()
    ctx.fillStyle = 'rgba(150,190,172,0.8)'
    ctx.beginPath(); ctx.moveTo(8, 34); ctx.lineTo(20, 44); ctx.lineTo(40, 34); ctx.lineTo(38, 38); ctx.lineTo(20, 47); ctx.lineTo(6, 37); ctx.closePath(); ctx.fill()
  }),
  plug: () => make('plug', 32, 64, ctx => {
    // A sebum plug squeezed from a pore: a little worm with a dark tip.
    const g = ctx.createLinearGradient(0, 0, 32, 0)
    g.addColorStop(0, '#e8d49c'); g.addColorStop(0.45, '#fff6d8'); g.addColorStop(1, '#dcc58a')
    ctx.fillStyle = g
    ctx.beginPath(); ctx.moveTo(10, 62); ctx.bezierCurveTo(4, 40, 8, 18, 12, 8); ctx.quadraticCurveTo(16, 2, 20, 8); ctx.bezierCurveTo(24, 20, 28, 42, 22, 62); ctx.closePath(); ctx.fill()
    ctx.fillStyle = '#4b3526'
    ctx.beginPath(); ctx.ellipse(16, 9, 5.5, 5, 0, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.8)'
    ctx.beginPath(); ctx.ellipse(13, 30, 2, 10, 0, 0, Math.PI * 2); ctx.fill()
  }),
  dust: () => make('dust', 24, 24, ctx => blob(ctx, 12, 12, 11, 11, [255, 255, 255], 0.9)),
  heart: () => make('heart', 64, 64, ctx => {
    ctx.fillStyle = '#f07aa0'
    ctx.beginPath(); ctx.moveTo(32, 56); ctx.bezierCurveTo(4, 36, 6, 10, 22, 10); ctx.bezierCurveTo(28, 10, 32, 16, 32, 20); ctx.bezierCurveTo(32, 16, 36, 10, 42, 10); ctx.bezierCurveTo(58, 10, 60, 36, 32, 56); ctx.fill()
    blob(ctx, 22, 22, 7, 5, [255, 255, 255], 0.8)
  }),
  coin: () => make('coin', 48, 48, ctx => {
    const g = ctx.createRadialGradient(18, 16, 2, 24, 24, 22)
    g.addColorStop(0, '#fff6c4'); g.addColorStop(0.6, '#f5cf5c'); g.addColorStop(1, '#d9a431')
    ctx.fillStyle = g
    ctx.beginPath(); ctx.arc(24, 24, 20, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = '#c38f22'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(24, 24, 14, 0, Math.PI * 2); ctx.stroke()
    ctx.fillStyle = '#c38f22'; ctx.font = 'bold 18px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('$', 24, 25)
  }),
  star: () => make('star', 64, 64, ctx => {
    ctx.beginPath()
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 - Math.PI / 2, r = i % 2 ? 13 : 30; ctx.lineTo(32 + Math.cos(a) * r, 34 + Math.sin(a) * r) }
    ctx.closePath()
    ctx.fillStyle = '#ffcf4a'; ctx.fill()
    ctx.lineJoin = 'round'; ctx.strokeStyle = '#f0a92a'; ctx.lineWidth = 3; ctx.stroke()
    blob(ctx, 26, 24, 7, 5, [255, 255, 255], 0.8)
  }),
  // ---------------------------------------------------------------- targets
  whiteheadBase: () => make('whiteheadBase', 128, 128, ctx => {
    blob(ctx, 64, 64, 60, 60, [236, 110, 120], 0.55)
    blob(ctx, 64, 64, 36, 36, [226, 90, 104], 0.6)
  }),
  whiteheadHead: () => make('whiteheadHead', 96, 96, ctx => {
    // A cute, pearly dome: cream centre, warm edge, a glossy highlight.
    const g = ctx.createRadialGradient(40, 38, 3, 48, 50, 34)
    g.addColorStop(0, '#fffef6'); g.addColorStop(0.45, '#fff3cf'); g.addColorStop(0.8, '#f4d9a2'); g.addColorStop(1, 'rgba(236,170,140,0)')
    ctx.fillStyle = g
    ctx.beginPath(); ctx.arc(48, 50, 34, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.95)'
    ctx.beginPath(); ctx.ellipse(38, 38, 9, 6, -0.6, 0, Math.PI * 2); ctx.fill()
    blob(ctx, 58, 60, 6, 4, [255, 255, 255], 0.5)
  }),
  blackhead: () => make('blackhead', 64, 64, ctx => {
    // A slightly raised pore: light on its top-left rim, shaded below, with a dark plug in the opening.
    blob(ctx, 34, 36, 22, 20, [90, 50, 40], 0.22)
    ctx.lineWidth = 3
    ctx.strokeStyle = 'rgba(255,245,235,0.45)'; ctx.beginPath(); ctx.arc(32, 32, 11, Math.PI * 0.9, Math.PI * 1.9); ctx.stroke()
    ctx.strokeStyle = 'rgba(90,50,40,0.35)'; ctx.beginPath(); ctx.arc(32, 32, 11, Math.PI * -0.1, Math.PI * 0.9); ctx.stroke()
    const g = ctx.createRadialGradient(30, 30, 1, 32, 32, 8)
    g.addColorStop(0, '#6a4e3a'); g.addColorStop(0.6, '#3b2a20'); g.addColorStop(1, 'rgba(59,42,32,0)')
    ctx.fillStyle = g
    ctx.beginPath(); ctx.arc(32, 32, 8, 0, Math.PI * 2); ctx.fill()
    blob(ctx, 29, 29, 2.4, 1.8, [255, 240, 220], 0.7)
  }),
  ring: () => make('ring', 128, 128, ctx => {
    blurred(ctx, 4, () => { ctx.strokeStyle = 'rgba(255,215,140,0.95)'; ctx.lineWidth = 7; ctx.beginPath(); ctx.arc(64, 64, 46, 0, Math.PI * 2); ctx.stroke() })
    ctx.strokeStyle = 'rgba(255,250,235,1)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(64, 64, 46, 0, Math.PI * 2); ctx.stroke()
    blob(ctx, 64, 64, 18, 18, [255, 230, 170], 0.6)
  }),
  patch: () => make('patch', 128, 128, ctx => {
    // Hydrocolloid patch: a small, soft, milky pink star with rounded points.
    const star = () => {
      ctx.beginPath()
      for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 - Math.PI / 2, r = i % 2 ? 32 : 52; ctx.lineTo(64 + Math.cos(a) * r, 66 + Math.sin(a) * r) }
      ctx.closePath()
    }
    ctx.lineJoin = 'round'
    ctx.filter = 'blur(1.5px)'
    star()
    ctx.strokeStyle = 'rgba(246,190,214,0.55)'; ctx.lineWidth = 12; ctx.stroke()
    ctx.fillStyle = 'rgba(255,232,242,0.6)'; ctx.fill()
    ctx.filter = 'none'
    star()
    ctx.save(); ctx.clip()
    blob(ctx, 50, 48, 24, 12, [255, 255, 255], 0.55)
    ctx.restore()
  }),
  // An under-eye gel patch: a soft pink crescent of jelly, glittery, with a wet highlight along its top.
  eyePatch: () => make('eyePatch', 200, 112, ctx => {
    const path = () => { ctx.beginPath(); ctx.moveTo(14, 30); ctx.quadraticCurveTo(100, 92, 186, 30); ctx.quadraticCurveTo(190, 58, 168, 76); ctx.quadraticCurveTo(100, 118, 32, 76); ctx.quadraticCurveTo(10, 58, 14, 30); ctx.closePath() }
    ctx.save(); ctx.filter = 'blur(4px)'; ctx.translate(3, 6); path(); ctx.fillStyle = 'rgba(150,70,100,0.25)'; ctx.fill(); ctx.restore()
    path()
    const g = ctx.createLinearGradient(0, 30, 0, 100)
    g.addColorStop(0, 'rgba(255,214,228,0.92)'); g.addColorStop(1, 'rgba(244,150,184,0.9)')
    ctx.fillStyle = g
    ctx.fill()
    ctx.save(); path(); ctx.clip()
    for (let i = 0; i < 70; i++) { const x = 20 + ((i * 53) % 160), y = 40 + ((i * 37) % 52); ctx.fillStyle = i % 3 ? 'rgba(255,255,255,0.85)' : 'rgba(255,226,160,0.9)'; ctx.fillRect(x, y, 2, 2) }
    ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 5; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(34, 44); ctx.quadraticCurveTo(100, 84, 166, 44); ctx.stroke()
    ctx.restore()
    ctx.strokeStyle = 'rgba(226,120,160,0.6)'; ctx.lineWidth = 1.5; path(); ctx.stroke()
  }),
  gem: () => make('gem', 64, 64, ctx => {
    const pts = [32, 4, 56, 22, 32, 60, 8, 22]
    ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]); ctx.closePath()
    ctx.fillStyle = '#ffffff'; ctx.fill()
    ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.moveTo(32, 60); ctx.lineTo(56, 22); ctx.lineTo(32, 26); ctx.closePath(); ctx.fill()
    ctx.fillStyle = 'rgba(0,0,0,0.08)'; ctx.beginPath(); ctx.moveTo(8, 22); ctx.lineTo(32, 26); ctx.lineTo(32, 60); ctx.closePath(); ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.beginPath(); ctx.moveTo(32, 4); ctx.lineTo(44, 16); ctx.lineTo(32, 22); ctx.lineTo(20, 16); ctx.closePath(); ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(8, 22); ctx.lineTo(56, 22); ctx.stroke()
  }),
  hangnail: () => make('hangnail', 40, 40, ctx => {
    ctx.fillStyle = '#f3c9b8'
    ctx.beginPath(); ctx.moveTo(8, 30); ctx.quadraticCurveTo(16, 10, 34, 6); ctx.quadraticCurveTo(22, 18, 18, 34); ctx.closePath(); ctx.fill()
    ctx.strokeStyle = 'rgba(200,120,110,0.7)'; ctx.lineWidth = 1.5; ctx.stroke()
  }),
  shadow: () => make('shadow', 128, 64, ctx => blob(ctx, 64, 32, 60, 26, [70, 40, 60], 0.35)),
}

export function rgbaCss(c: number, a = 1) { return rgba(c, a) }
