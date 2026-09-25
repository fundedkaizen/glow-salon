import { makeRng } from '../../core/rng.ts'
import { blob, rgba, shade, type Ctx, type RGB } from '../paint.ts'
import { box, cushion, floorShadow, piece, type Piece } from './furniture.ts'

/**
 * The regulars' gifts, each its own small painted piece for the gift spots on the salon floor (about 60 to 80
 * world px, anchored at the floor point, lit from the top left like the rest of the room). Pictures and posters
 * stand on a little easel so they work as floor pieces. `paintGift` returns null for a regular with no gift art.
 */
const W = 72, H = 84, AX = 36, AY = 78

type Painter = (c: Ctx) => void

function hgrad(c: Ctx, x0: number, x1: number, a: RGB, b: RGB) { const g = c.createLinearGradient(x0, 0, x1, 0); g.addColorStop(0, rgba(a)); g.addColorStop(1, rgba(b)); return g }
const line = (c: Ctx, col: RGB, a = 0.6, w = 1) => { c.strokeStyle = rgba(shade(col, -0.4), a); c.lineWidth = w; c.stroke() }

/** A little wooden easel holding a framed picture (its canvas painted by `art`). */
function easel(c: Ctx, frame: RGB, art: (x: number, y: number, w: number, h: number) => void) {
  floorShadow(c, AX, AY - 2, 22, 4)
  c.strokeStyle = '#c99a6a'; c.lineWidth = 3; c.lineCap = 'round'
  c.beginPath(); c.moveTo(AX - 16, AY - 1); c.lineTo(AX - 4, 18); c.moveTo(AX + 16, AY - 1); c.lineTo(AX + 4, 18); c.moveTo(AX, AY - 4); c.lineTo(AX, 30); c.stroke()
  c.fillStyle = rgba(frame); c.beginPath(); c.roundRect(AX - 24, 14, 48, 40, 4); c.fill(); line(c, frame)
  c.save(); c.beginPath(); c.rect(AX - 20, 18, 40, 32); c.clip(); art(AX - 20, 18, 40, 32); c.restore()
  blob(c, AX - 12, 20, 8, 3, [255, 255, 255], 0.35)
  c.fillStyle = '#b8875a'; c.fillRect(AX - 20, 54, 40, 3)
}

function pot(c: Ctx, col: RGB, y = 62, w = 26, h = 16) {
  c.fillStyle = hgrad(c, AX - w / 2, AX + w / 2, shade(col, 0.2), shade(col, -0.15))
  c.beginPath(); c.moveTo(AX - w / 2, y); c.lineTo(AX + w / 2, y); c.lineTo(AX + w / 2 - 4, y + h); c.lineTo(AX - w / 2 + 4, y + h); c.closePath(); c.fill(); line(c, col, 0.5)
  c.fillStyle = rgba(shade(col, 0.25)); c.beginPath(); c.roundRect(AX - w / 2 - 2, y - 3, w + 4, 5, 2); c.fill()
}

const GIFTS: Record<string, Painter> = {
  // A little lemon tree in a terracotta pot.
  rosa: c => {
    floorShadow(c, AX, AY - 1, 18, 4)
    c.strokeStyle = '#8a6040'; c.lineWidth = 3; c.beginPath(); c.moveTo(AX, 64); c.lineTo(AX, 36); c.stroke()
    for (const [x, y, r] of [[AX - 10, 28, 12], [AX + 9, 26, 12], [AX, 16, 13], [AX - 2, 34, 11]] as const) { c.fillStyle = rgba(r > 12 ? [120, 190, 110] : [96, 170, 96]); c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill() }
    for (const [x, y] of [[AX - 9, 30], [AX + 10, 22], [AX + 2, 12], [AX - 3, 38]] as const) { c.fillStyle = '#fbe16a'; c.beginPath(); c.ellipse(x, y, 4, 3.3, 0.4, 0, Math.PI * 2); c.fill(); blob(c, x - 1, y - 1, 1.5, 1, [255, 255, 255], 0.8) }
    pot(c, [226, 142, 104])
  },
  // A big rose gold polish bottle on a little mirrored stand.
  maya: c => {
    floorShadow(c, AX, AY - 1, 20, 4)
    box(c, AX - 20, 66, 40, 10, 5, [246, 232, 236], 3)
    c.fillStyle = hgrad(c, AX - 14, AX + 14, [246, 196, 176], [196, 128, 110]); c.beginPath(); c.roundRect(AX - 14, 34, 28, 34, 9); c.fill(); line(c, [210, 140, 120])
    c.fillStyle = '#3c3048'; c.beginPath(); c.roundRect(AX - 6, 16, 12, 20, 3); c.fill()
    blob(c, AX - 7, 46, 3, 10, [255, 255, 255], 0.8)
    for (let i = 0; i < 6; i++) blob(c, AX - 8 + (i * 5) % 14, 40 + i * 4, 1.2, 1.2, [255, 240, 220], 0.9)
  },
  // A sporty electric foot rasp on its charging dock.
  leo: c => {
    floorShadow(c, AX, AY - 1, 18, 4)
    box(c, AX - 18, 64, 36, 12, 5, [220, 236, 246], 4)
    c.fillStyle = hgrad(c, AX - 9, AX + 9, [120, 200, 240], [60, 140, 200]); c.beginPath(); c.roundRect(AX - 9, 24, 18, 42, 8); c.fill(); line(c, [80, 150, 200])
    c.fillStyle = '#f4f0e8'; c.beginPath(); c.ellipse(AX, 22, 10, 7, 0, 0, Math.PI * 2); c.fill()
    c.fillStyle = 'rgba(160,150,140,0.6)'; for (let i = 0; i < 12; i++) { c.beginPath(); c.arc(AX - 6 + (i % 4) * 4, 19 + Math.floor(i / 4) * 3, 0.9, 0, Math.PI * 2); c.fill() }
    c.fillStyle = '#ffe36a'; c.beginPath(); c.moveTo(AX + 1, 38); c.lineTo(AX - 3, 46); c.lineTo(AX, 46); c.lineTo(AX - 2, 53); c.lineTo(AX + 3, 44); c.lineTo(AX, 44); c.closePath(); c.fill()
  },
  // A ring light on a tripod.
  jade: c => {
    floorShadow(c, AX, AY - 1, 18, 4)
    c.strokeStyle = '#9c8ea0'; c.lineWidth = 2; c.beginPath(); c.moveTo(AX - 14, AY - 1); c.lineTo(AX, 52); c.lineTo(AX + 14, AY - 1); c.moveTo(AX, 52); c.lineTo(AX, 36); c.stroke()
    c.strokeStyle = '#ffffff'; c.lineWidth = 7; c.beginPath(); c.arc(AX, 22, 16, 0, Math.PI * 2); c.stroke()
    c.strokeStyle = 'rgba(255,236,200,0.9)'; c.lineWidth = 3; c.beginPath(); c.arc(AX, 22, 16, 0, Math.PI * 2); c.stroke()
    blob(c, AX, 22, 26, 26, [255, 244, 214], 0.25)
    c.fillStyle = '#5a4a62'; c.beginPath(); c.roundRect(AX - 4, 16, 8, 13, 2); c.fill()
  },
  // A tall grandfather clock.
  gus: c => {
    floorShadow(c, AX, AY - 1, 16, 4)
    c.fillStyle = hgrad(c, AX - 13, AX + 13, [176, 112, 72], [120, 70, 44]); c.beginPath(); c.roundRect(AX - 13, 6, 26, 72, [12, 12, 3, 3]); c.fill(); line(c, [140, 90, 60])
    c.fillStyle = '#fbf3e4'; c.beginPath(); c.arc(AX, 20, 9, 0, Math.PI * 2); c.fill(); line(c, [200, 160, 120], 0.8)
    c.strokeStyle = '#3c3048'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(AX, 20); c.lineTo(AX, 14); c.moveTo(AX, 20); c.lineTo(AX + 5, 22); c.stroke()
    c.fillStyle = 'rgba(40,24,20,0.5)'; c.beginPath(); c.roundRect(AX - 7, 34, 14, 32, 3); c.fill()
    c.strokeStyle = '#e8c06a'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(AX, 36); c.lineTo(AX + 2, 56); c.stroke(); c.fillStyle = '#e8c06a'; c.beginPath(); c.arc(AX + 2, 58, 3.5, 0, Math.PI * 2); c.fill()
  },
  // A tub of blue cooling gel with a snowflake.
  priya: c => {
    floorShadow(c, AX, AY - 1, 18, 4)
    c.fillStyle = hgrad(c, AX - 17, AX + 17, [196, 232, 250], [120, 184, 226]); c.beginPath(); c.roundRect(AX - 17, 44, 34, 32, 8); c.fill(); line(c, [140, 190, 230])
    c.fillStyle = '#ffffff'; c.beginPath(); c.roundRect(AX - 19, 36, 38, 10, 5); c.fill(); line(c, [200, 210, 220], 0.5)
    c.strokeStyle = '#ffffff'; c.lineWidth = 1.6
    for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI; c.beginPath(); c.moveTo(AX + Math.cos(a) * 7, 60 + Math.sin(a) * 7); c.lineTo(AX - Math.cos(a) * 7, 60 - Math.sin(a) * 7); c.stroke() }
    blob(c, AX - 10, 52, 3, 8, [255, 255, 255], 0.6)
  },
  // A surfboard standing on its tail.
  kai: c => {
    floorShadow(c, AX, AY - 1, 14, 3)
    c.save(); c.translate(AX, 44); c.rotate(0.12)
    c.fillStyle = hgrad(c, -11, 11, [120, 214, 214], [60, 170, 186]); c.beginPath(); c.ellipse(0, 0, 11, 36, 0, 0, Math.PI * 2); c.fill(); line(c, [80, 170, 180])
    c.fillStyle = '#ffffff'; c.fillRect(-1.2, -34, 2.4, 68)
    c.fillStyle = '#f7a86a'; c.beginPath(); c.ellipse(0, -14, 11, 4, 0, 0, Math.PI * 2); c.fill()
    blob(c, -4, -12, 3, 14, [255, 255, 255], 0.5)
    c.restore()
  },
  // A painting of pastel hills on an easel.
  mira: c => easel(c, [232, 196, 120], (x, y, w, h) => { c.fillStyle = '#bfe4f6'; c.fillRect(x, y, w, h); c.fillStyle = '#9fd6a8'; c.beginPath(); c.ellipse(x + 10, y + h, 20, 14, 0, 0, Math.PI * 2); c.fill(); c.fillStyle = '#7cc49a'; c.beginPath(); c.ellipse(x + 32, y + h + 2, 18, 12, 0, 0, Math.PI * 2); c.fill(); c.fillStyle = '#fbe16a'; c.beginPath(); c.arc(x + 30, y + 8, 4, 0, Math.PI * 2); c.fill() }),
  // A little espresso machine with a cup.
  tomas: c => {
    floorShadow(c, AX, AY - 1, 22, 4)
    box(c, AX - 20, 26, 40, 50, 8, [220, 220, 228], 6)
    c.fillStyle = '#3c3048'; c.beginPath(); c.roundRect(AX - 14, 38, 28, 10, 3); c.fill()
    c.fillStyle = '#9c9aa8'; c.fillRect(AX - 3, 48, 6, 8)
    c.fillStyle = '#ffffff'; c.beginPath(); c.roundRect(AX - 7, 58, 14, 12, [2, 2, 5, 5]); c.fill(); line(c, [200, 190, 200], 0.6)
    c.fillStyle = '#8a5a3a'; c.fillRect(AX - 5, 59, 10, 2)
    c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(AX - 2, 55); c.quadraticCurveTo(AX + 2, 50, AX - 1, 46); c.stroke()
    blob(c, AX - 12, 32, 6, 3, [255, 255, 255], 0.6)
  },
  // A white orchid in a ceramic pot.
  hazel: c => {
    floorShadow(c, AX, AY - 1, 14, 3)
    c.strokeStyle = '#6a8a50'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(AX, 62); c.quadraticCurveTo(AX + 4, 30, AX + 16, 18); c.stroke()
    for (const [x, y] of [[AX + 4, 34], [AX + 10, 24], [AX + 16, 16], [AX + 2, 44]] as const) {
      for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; c.fillStyle = k % 2 ? '#fdf2f8' : '#ffffff'; c.beginPath(); c.ellipse(x + Math.cos(a) * 4, y + Math.sin(a) * 4, 4, 3, a, 0, Math.PI * 2); c.fill() }
      c.fillStyle = '#e874a8'; c.beginPath(); c.arc(x, y, 2, 0, Math.PI * 2); c.fill()
    }
    c.fillStyle = '#6fae70'; c.beginPath(); c.ellipse(AX - 8, 60, 12, 4, -0.4, 0, Math.PI * 2); c.fill(); c.beginPath(); c.ellipse(AX + 8, 61, 12, 4, 0.4, 0, Math.PI * 2); c.fill()
    pot(c, [240, 240, 246], 62, 22, 14)
  },
  // A championship belt on a stand.
  rex: c => {
    floorShadow(c, AX, AY - 1, 22, 4)
    box(c, AX - 22, 64, 44, 12, 5, [120, 90, 70], 3)
    c.fillStyle = '#3c3048'; c.beginPath(); c.roundRect(AX - 30, 34, 60, 14, 6); c.fill()
    c.fillStyle = hgrad(c, AX - 16, AX + 16, [255, 226, 130], [206, 150, 50]); c.beginPath(); c.ellipse(AX, 41, 17, 14, 0, 0, Math.PI * 2); c.fill(); line(c, [200, 150, 50])
    c.fillStyle = '#e84a5f'; c.beginPath(); c.arc(AX, 41, 5, 0, Math.PI * 2); c.fill()
    blob(c, AX - 7, 35, 5, 3, [255, 255, 255], 0.7)
  },
  // A pair of pink ballet shoes with their ribbons.
  elise: c => {
    floorShadow(c, AX, AY - 1, 22, 4)
    for (const [dx, rot] of [[-9, -0.3], [9, 0.25]] as const) {
      c.save(); c.translate(AX + dx, 62); c.rotate(rot)
      c.fillStyle = hgrad(c, -8, 8, [252, 206, 220], [230, 150, 176]); c.beginPath(); c.ellipse(0, 0, 8, 15, 0, 0, Math.PI * 2); c.fill(); line(c, [220, 150, 176])
      c.fillStyle = '#fbe8ee'; c.beginPath(); c.ellipse(0, 3, 4.5, 8, 0, 0, Math.PI * 2); c.fill()
      c.restore()
    }
    c.strokeStyle = '#f49ac0'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(AX - 9, 52); c.bezierCurveTo(AX - 20, 30, AX + 4, 24, AX - 2, 14); c.moveTo(AX + 9, 52); c.bezierCurveTo(AX + 20, 34, AX, 26, AX + 8, 16); c.stroke()
  },
  // A mini arcade cabinet with a glowing screen.
  dev: c => {
    floorShadow(c, AX, AY - 1, 20, 4)
    c.fillStyle = hgrad(c, AX - 18, AX + 18, [150, 120, 230], [100, 80, 180]); c.beginPath(); c.moveTo(AX - 18, AY - 1); c.lineTo(AX - 18, 14); c.lineTo(AX + 18, 8); c.lineTo(AX + 18, AY - 1); c.closePath(); c.fill(); line(c, [110, 90, 200])
    c.fillStyle = '#1e1a34'; c.beginPath(); c.roundRect(AX - 13, 18, 26, 22, 3); c.fill()
    c.fillStyle = '#7af0d8'; c.fillRect(AX - 9, 24, 6, 6); c.fillStyle = '#ff7ab0'; c.fillRect(AX + 2, 28, 5, 5)
    blob(c, AX, 29, 16, 14, [140, 255, 230], 0.25)
    box(c, AX - 16, 44, 32, 8, 4, [240, 230, 250], 2)
    c.fillStyle = '#e84a5f'; c.beginPath(); c.arc(AX - 6, 46, 2.4, 0, Math.PI * 2); c.fill(); c.fillStyle = '#fbe16a'; c.beginPath(); c.arc(AX + 4, 46, 2.4, 0, Math.PI * 2); c.fill()
  },
  // A jar of honey mask with a wooden dipper.
  bea: c => {
    floorShadow(c, AX, AY - 1, 17, 4)
    c.fillStyle = hgrad(c, AX - 16, AX + 16, [252, 206, 96], [220, 150, 40]); c.beginPath(); c.roundRect(AX - 16, 40, 32, 36, 10); c.fill(); line(c, [210, 150, 50])
    c.fillStyle = '#f6e7cc'; c.beginPath(); c.roundRect(AX - 18, 34, 36, 9, 4); c.fill()
    c.fillStyle = '#fff8e4'; c.beginPath(); c.roundRect(AX - 10, 50, 20, 14, 3); c.fill(); c.fillStyle = '#e8a93a'; c.font = '700 7px sans-serif'; c.textAlign = 'center'; c.fillText('HONEY', AX, 59)
    c.strokeStyle = '#b8875a'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(AX + 6, 38); c.lineTo(AX + 14, 12); c.stroke()
    c.fillStyle = '#b8875a'; c.beginPath(); c.ellipse(AX + 15, 10, 4, 5, 0.3, 0, Math.PI * 2); c.fill()
    blob(c, AX - 9, 48, 3, 9, [255, 255, 255], 0.55)
  },
  // A silver straight razor in an open box.
  otto: c => {
    floorShadow(c, AX, AY - 1, 22, 4)
    box(c, AX - 22, 52, 44, 24, 6, [90, 60, 80], 4)
    c.fillStyle = '#e8d8ec'; c.fillRect(AX - 18, 56, 36, 14)
    c.fillStyle = hgrad(c, AX - 14, AX + 14, [250, 250, 255], [176, 180, 196]); c.beginPath(); c.moveTo(AX - 14, 60); c.lineTo(AX + 6, 58); c.lineTo(AX + 6, 66); c.lineTo(AX - 14, 64); c.closePath(); c.fill()
    c.fillStyle = '#3c3048'; c.beginPath(); c.roundRect(AX + 6, 58, 10, 7, 2); c.fill()
    blob(c, AX - 4, 60, 6, 1.4, [255, 255, 255], 0.9)
  },
  // A soft plushie bunny.
  lulu: c => {
    floorShadow(c, AX, AY - 1, 18, 4)
    c.fillStyle = '#fbe6ee'
    for (const dx of [-7, 7]) { c.beginPath(); c.ellipse(AX + dx, 18, 5, 14, dx * 0.03, 0, Math.PI * 2); c.fill() }
    c.fillStyle = '#f7c6d4'; for (const dx of [-7, 7]) { c.beginPath(); c.ellipse(AX + dx, 19, 2.4, 9, 0, 0, Math.PI * 2); c.fill() }
    cushion(c, AX - 17, 44, 34, 32, [251, 230, 238], 15)
    c.fillStyle = '#fbe6ee'; c.beginPath(); c.arc(AX, 36, 14, 0, Math.PI * 2); c.fill(); line(c, [240, 200, 214], 0.5)
    c.fillStyle = '#3c3048'; c.beginPath(); c.arc(AX - 5, 35, 1.8, 0, Math.PI * 2); c.arc(AX + 5, 35, 1.8, 0, Math.PI * 2); c.fill()
    blob(c, AX - 8, 40, 3, 2, [246, 150, 170], 0.7); blob(c, AX + 8, 40, 3, 2, [246, 150, 170], 0.7)
    c.fillStyle = '#e874a8'; c.beginPath(); c.arc(AX, 39, 1.4, 0, Math.PI * 2); c.fill()
  },
  // A vintage enamel sign on a stand.
  ivan: c => {
    floorShadow(c, AX, AY - 1, 20, 4)
    c.fillStyle = '#9c8ea0'; c.fillRect(AX - 1.5, 46, 3, 32)
    c.fillStyle = '#2f6b8a'; c.beginPath(); c.roundRect(AX - 26, 14, 52, 32, 6); c.fill(); line(c, [40, 100, 130])
    c.strokeStyle = '#fbe7b0'; c.lineWidth = 1.6; c.beginPath(); c.roundRect(AX - 22, 18, 44, 24, 4); c.stroke()
    c.fillStyle = '#fbe7b0'; c.font = '800 9px sans-serif'; c.textAlign = 'center'; c.fillText('OPEN', AX, 34)
    blob(c, AX - 14, 20, 8, 3, [255, 255, 255], 0.3)
  },
  // A record player spinning Sol's song.
  sol: c => {
    floorShadow(c, AX, AY - 1, 24, 4)
    box(c, AX - 24, 52, 48, 24, 8, [200, 140, 96], 5)
    c.fillStyle = '#2a2230'; c.beginPath(); c.ellipse(AX - 4, 54, 17, 6, 0, 0, Math.PI * 2); c.fill()
    c.strokeStyle = 'rgba(255,255,255,0.18)'; c.lineWidth = 0.8; for (const r of [6, 10, 14]) { c.beginPath(); c.ellipse(AX - 4, 54, r, r * 0.35, 0, 0, Math.PI * 2); c.stroke() }
    c.fillStyle = '#f07aa0'; c.beginPath(); c.ellipse(AX - 4, 54, 4, 1.6, 0, 0, Math.PI * 2); c.fill()
    c.strokeStyle = '#d8d8e0'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(AX + 16, 50); c.lineTo(AX + 8, 56); c.stroke()
    for (const [x, y] of [[AX + 10, 32], [AX + 18, 22], [AX - 2, 26]] as const) { c.fillStyle = '#9c86d9'; c.beginPath(); c.ellipse(x, y + 5, 2.4, 1.8, -0.3, 0, Math.PI * 2); c.fill(); c.fillRect(x + 1.6, y - 3, 1.1, 8) }
  },
  // A little vanity with a round mirror.
  yuki: c => {
    floorShadow(c, AX, AY - 1, 24, 4)
    c.fillStyle = '#fdf4f7'; c.beginPath(); c.arc(AX, 22, 15, 0, Math.PI * 2); c.fill(); line(c, [220, 190, 200])
    c.fillStyle = '#dfeaf2'; c.beginPath(); c.arc(AX, 22, 12, 0, Math.PI * 2); c.fill(); blob(c, AX - 4, 18, 4, 6, [255, 255, 255], 0.7)
    box(c, AX - 24, 40, 48, 18, 6, [252, 232, 240], 4)
    c.fillStyle = '#f2d8e2'; c.fillRect(AX - 20, 58, 3, 20); c.fillRect(AX + 17, 58, 3, 20)
    c.fillStyle = '#e8c06a'; c.beginPath(); c.arc(AX, 50, 1.6, 0, Math.PI * 2); c.fill()
    c.fillStyle = '#f7b7cc'; c.beginPath(); c.roundRect(AX + 10, 32, 6, 9, 2); c.fill()
  },
  // A stack of goat milk soap bars tied with twine.
  bruno: c => {
    floorShadow(c, AX, AY - 1, 20, 4)
    for (let k = 0; k < 3; k++) box(c, AX - 18 + k * 2, 62 - k * 13, 36 - k * 4, 13, 5, ([[248, 240, 226], [240, 228, 206], [250, 244, 234]] as RGB[])[k], 3)
    c.strokeStyle = '#b8875a'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(AX, 36); c.lineTo(AX, 76); c.stroke()
    c.beginPath(); c.moveTo(AX, 36); c.quadraticCurveTo(AX - 8, 28, AX - 2, 30); c.moveTo(AX, 36); c.quadraticCurveTo(AX + 8, 28, AX + 2, 30); c.stroke()
    c.fillStyle = '#b0d68c'; c.beginPath(); c.ellipse(AX + 6, 34, 4, 2, 0.4, 0, Math.PI * 2); c.fill()
  },
  // A small crystal chandelier.
  celeste: c => {
    c.strokeStyle = '#e8c06a'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(AX, 4); c.lineTo(AX, 22); c.stroke()
    c.strokeStyle = '#e8c06a'; c.lineWidth = 2; c.beginPath(); c.ellipse(AX, 30, 22, 7, 0, 0, Math.PI); c.stroke()
    for (let k = -2; k <= 2; k++) { const x = AX + k * 9; c.fillStyle = '#fff6e0'; c.beginPath(); c.roundRect(x - 2, 20, 4, 8, 1); c.fill(); blob(c, x, 18, 4, 5, [255, 230, 160], 0.7); c.fillStyle = 'rgba(220,240,255,0.95)'; c.beginPath(); c.moveTo(x, 34); c.lineTo(x - 2.5, 40); c.lineTo(x, 46); c.lineTo(x + 2.5, 40); c.closePath(); c.fill() }
    c.strokeStyle = '#c99a6a'; c.lineWidth = 2; c.beginPath(); c.moveTo(AX, 46); c.lineTo(AX, AY - 2); c.stroke()
    floorShadow(c, AX, AY - 1, 12, 3)
    blob(c, AX, 30, 30, 18, [255, 240, 200], 0.2)
  },
  // A rainbow hammock on its stand.
  pip: c => {
    floorShadow(c, AX, AY - 1, 30, 4)
    c.strokeStyle = '#b8875a'; c.lineWidth = 3; c.beginPath(); c.moveTo(AX - 32, AY - 2); c.lineTo(AX - 26, 24); c.moveTo(AX + 32, AY - 2); c.lineTo(AX + 26, 24); c.moveTo(AX - 32, AY - 2); c.lineTo(AX + 32, AY - 2); c.stroke()
    const cols = ['#f49ac0', '#fbe16a', '#94dcc0', '#8ec5f2', '#b79ce6']
    cols.forEach((col, k) => { c.strokeStyle = col; c.lineWidth = 3; c.beginPath(); c.moveTo(AX - 26, 26 + k * 2); c.quadraticCurveTo(AX, 60 + k * 2, AX + 26, 26 + k * 2); c.stroke() })
  },
  // A small bookshelf of pastel books.
  noor: c => {
    floorShadow(c, AX, AY - 1, 24, 4)
    box(c, AX - 24, 12, 48, 66, 6, [236, 214, 196], 4)
    for (const y of [36, 58]) { c.fillStyle = 'rgba(160,120,100,0.5)'; c.fillRect(AX - 21, y, 42, 2.5) }
    const r = makeRng(7)
    for (const y of [18, 40, 62]) { let x = AX - 20; while (x < AX + 16) { const w = r.range(4, 7), h = r.range(12, 17); c.fillStyle = rgba(([[247, 183, 204], [169, 227, 207], [205, 189, 242], [251, 217, 160], [159, 208, 242]] as RGB[])[r.int(0, 4)]); c.fillRect(x, y + 17 - h, w, h); x += w + 1 } }
  },
  // A mountain poster on an easel.
  finn: c => easel(c, [240, 240, 244], (x, y, w, h) => { c.fillStyle = '#fbe0d0'; c.fillRect(x, y, w, h); c.fillStyle = '#7c9cc4'; c.beginPath(); c.moveTo(x - 2, y + h); c.lineTo(x + 14, y + 10); c.lineTo(x + 24, y + 20); c.lineTo(x + 30, y + 12); c.lineTo(x + w + 2, y + h); c.closePath(); c.fill(); c.fillStyle = '#ffffff'; c.beginPath(); c.moveTo(x + 10, y + 14); c.lineTo(x + 14, y + 10); c.lineTo(x + 18, y + 14); c.closePath(); c.fill(); c.fillStyle = '#f7a86a'; c.beginPath(); c.arc(x + 32, y + 6, 3, 0, Math.PI * 2); c.fill() }),
  // A neon heart on a little stand.
  stella: c => {
    floorShadow(c, AX, AY - 1, 16, 4)
    box(c, AX - 14, 64, 28, 12, 5, [60, 50, 70], 3)
    blob(c, AX, 36, 30, 28, [255, 120, 180], 0.35)
    const heartPath = () => { c.beginPath(); c.moveTo(AX, 54); c.bezierCurveTo(AX - 26, 36, AX - 14, 12, AX, 26); c.bezierCurveTo(AX + 14, 12, AX + 26, 36, AX, 54) }
    heartPath(); c.strokeStyle = '#ff7ab8'; c.lineWidth = 5; c.stroke()
    heartPath(); c.strokeStyle = '#ffe4f0'; c.lineWidth = 2; c.stroke()
  },
  // A globe on a brass stand.
  ahmed: c => {
    floorShadow(c, AX, AY - 1, 16, 4)
    c.fillStyle = '#c99a6a'; c.beginPath(); c.moveTo(AX - 12, AY - 1); c.lineTo(AX + 12, AY - 1); c.lineTo(AX + 3, 62); c.lineTo(AX - 3, 62); c.closePath(); c.fill()
    c.fillStyle = hgrad(c, AX - 20, AX + 20, [150, 210, 240], [80, 150, 200]); c.beginPath(); c.arc(AX, 38, 20, 0, Math.PI * 2); c.fill()
    c.fillStyle = '#9fd6a8'; for (const [x, y, rx, ry] of [[AX - 8, 30, 8, 6], [AX + 7, 40, 7, 9], [AX - 5, 48, 5, 3]] as const) { c.beginPath(); c.ellipse(x, y, rx, ry, 0.3, 0, Math.PI * 2); c.fill() }
    c.strokeStyle = '#e8c06a'; c.lineWidth = 2; c.beginPath(); c.arc(AX, 38, 23, -Math.PI * 0.8, Math.PI * 0.6); c.stroke()
    blob(c, AX - 8, 28, 5, 7, [255, 255, 255], 0.45)
  },
  // A pile of knitted cushions.
  greta: c => {
    floorShadow(c, AX, AY - 1, 26, 4)
    const knit = (x: number, y: number, w: number, h: number, col: RGB) => {
      cushion(c, x, y, w, h, col, 9)
      c.strokeStyle = rgba(shade(col, -0.15), 0.6); c.lineWidth = 1
      for (let k = x + 5; k < x + w - 3; k += 5) { c.beginPath(); c.moveTo(k, y + 3); c.lineTo(k + 2, y + h / 2); c.lineTo(k, y + h - 3); c.stroke() }
    }
    knit(AX - 28, 54, 38, 22, [247, 183, 204]); knit(AX - 6, 56, 34, 20, [169, 227, 207]); knit(AX - 18, 36, 36, 22, [251, 217, 160])
  },
  // A pastel electric guitar on a stand.
  zane: c => {
    floorShadow(c, AX, AY - 1, 16, 4)
    c.save(); c.translate(AX, 44); c.rotate(-0.18)
    c.fillStyle = '#3c3048'; c.fillRect(-2.5, -40, 5, 34)
    c.fillStyle = '#5a4a62'; c.beginPath(); c.roundRect(-4, -46, 8, 8, 2); c.fill()
    c.fillStyle = hgrad(c, -16, 16, [252, 170, 200], [220, 110, 150]); c.beginPath(); c.ellipse(0, 12, 14, 16, 0, 0, Math.PI * 2); c.ellipse(0, -2, 10, 10, 0, 0, Math.PI * 2); c.fill()
    c.fillStyle = '#fbf3e4'; c.beginPath(); c.roundRect(-6, 4, 12, 16, 3); c.fill()
    c.fillStyle = '#3c3048'; c.fillRect(-4, 8, 8, 1.5); c.fillRect(-4, 14, 8, 1.5)
    c.restore()
    c.strokeStyle = '#9c8ea0'; c.lineWidth = 2; c.beginPath(); c.moveTo(AX - 12, AY - 1); c.lineTo(AX, 58); c.lineTo(AX + 12, AY - 1); c.stroke()
  },
  // A cheerful desk plant in a striped pot.
  iris: c => {
    floorShadow(c, AX, AY - 1, 14, 3)
    for (let k = 0; k < 7; k++) { const a = -Math.PI / 2 + (k - 3) * 0.35; c.fillStyle = k % 2 ? '#8fd0a8' : '#6fbf8c'; c.beginPath(); c.ellipse(AX + Math.cos(a) * 12, 46 + Math.sin(a) * 14, 5, 13, a + Math.PI / 2, 0, Math.PI * 2); c.fill() }
    pot(c, [247, 183, 204], 56, 24, 20)
    c.fillStyle = 'rgba(255,255,255,0.7)'; c.fillRect(AX - 10, 64, 20, 2.5)
  },
  // A framed diploma on an easel.
  marco: c => easel(c, [196, 150, 96], (x, y, w, h) => { c.fillStyle = '#fbf6e8'; c.fillRect(x, y, w, h); c.fillStyle = 'rgba(90,70,60,0.6)'; for (let k = 0; k < 4; k++) c.fillRect(x + 6, y + 6 + k * 5, w - 12 - (k % 2) * 8, 1.5); c.fillStyle = '#e84a5f'; c.beginPath(); c.arc(x + w - 8, y + h - 7, 4, 0, Math.PI * 2); c.fill() }),
  // A royal portrait in a gilded frame on an easel.
  'lady-v': c => easel(c, [232, 190, 90], (x, y, w, h) => { c.fillStyle = '#6a4a82'; c.fillRect(x, y, w, h); c.fillStyle = '#f3d0b8'; c.beginPath(); c.arc(x + w / 2, y + 12, 6, 0, Math.PI * 2); c.fill(); c.fillStyle = '#b79ce6'; c.beginPath(); c.moveTo(x + w / 2 - 12, y + h); c.quadraticCurveTo(x + w / 2, y + 14, x + w / 2 + 12, y + h); c.fill(); c.fillStyle = '#fbe16a'; c.beginPath(); c.moveTo(x + w / 2 - 5, y + 6); c.lineTo(x + w / 2 - 5, y + 2); c.lineTo(x + w / 2 - 2, y + 4); c.lineTo(x + w / 2, y + 1); c.lineTo(x + w / 2 + 2, y + 4); c.lineTo(x + w / 2 + 5, y + 2); c.lineTo(x + w / 2 + 5, y + 6); c.closePath(); c.fill() }),
}

/** The painted gift of a regular, or null when there is none. */
export function paintGift(regular: string): Piece | null {
  const draw = GIFTS[regular]
  if (!draw) return null
  return piece(W, H, AX, AY, ctx => draw(ctx))
}
