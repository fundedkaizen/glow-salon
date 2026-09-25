import type { Texture } from 'pixi.js'
import { blob, type Ctx } from '../paint.ts'
import { heart } from './people.ts'
import { canvasTexture, worldCanvas } from './room.ts'

/**
 * Little painted icons for the floor's bubbles: what a customer came for (a facial, a manicure or a pedicure), a cup of
 * tea for a staff break, a heart. Each is 32 x 32 world units.
 */
const cache = new Map<string, Texture>()
function icon(key: string, draw: (ctx: Ctx) => void): Texture {
  let t = cache.get(key)
  if (!t) { const [c, ctx] = worldCanvas(32, 32); draw(ctx); t = canvasTexture(c); cache.set(key, t) }
  return t
}

export const icons = {
  facial: () => icon('facial', ctx => {
    // A face with a mint mask and cucumber eyes.
    ctx.fillStyle = '#fbd9c4'; ctx.beginPath(); ctx.ellipse(16, 17, 11, 12, 0, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = 'rgba(180,110,90,0.6)'; ctx.lineWidth = 1; ctx.stroke()
    ctx.fillStyle = '#a9e3cf'; ctx.beginPath(); ctx.ellipse(16, 18, 9.4, 9.6, 0, 0, Math.PI * 2); ctx.fill()
    for (const x of [12, 20]) { ctx.fillStyle = '#8fd07a'; ctx.beginPath(); ctx.arc(x, 16, 3.2, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#e8f8d8'; ctx.beginPath(); ctx.arc(x, 16, 2.2, 0, Math.PI * 2); ctx.fill() }
    ctx.strokeStyle = '#c0607a'; ctx.lineWidth = 1.3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(16, 21, 3, 0.3, Math.PI - 0.3); ctx.stroke()
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.roundRect(5, 4, 22, 7, 3.5); ctx.fill()
    ctx.strokeStyle = 'rgba(200,170,185,0.8)'; ctx.stroke()
  }),
  nails: () => icon('nails', ctx => {
    // A polish bottle with a glossy highlight.
    ctx.fillStyle = '#4a3a52'; ctx.beginPath(); ctx.roundRect(12, 3, 8, 11, 2); ctx.fill()
    const g = ctx.createLinearGradient(7, 12, 25, 29); g.addColorStop(0, '#fbb6ca'); g.addColorStop(1, '#e2729a')
    ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(7, 12, 18, 17, 5); ctx.fill()
    ctx.strokeStyle = 'rgba(160,60,100,0.6)'; ctx.lineWidth = 1; ctx.stroke()
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.roundRect(10, 15, 3, 10, 1.5); ctx.fill()
    blob(ctx, 21, 25, 2, 1.2, [255, 255, 255], 0.5)
  }),
  feet: () => icon('feet', ctx => {
    // A little bare foot with painted toenails, over a bubble of bath water.
    ctx.fillStyle = '#bfeef0'; ctx.beginPath(); ctx.ellipse(16, 25, 12, 5, 0, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.9)'; for (const [x, y, r] of [[7, 22, 1.4], [25, 23, 1.2], [21, 27, 1]]) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill() }
    ctx.fillStyle = '#fbd9c4'
    ctx.beginPath(); ctx.moveTo(10, 25); ctx.bezierCurveTo(8, 17, 9, 11, 13, 8); ctx.lineTo(23, 9); ctx.bezierCurveTo(25, 13, 24, 19, 21, 25); ctx.closePath(); ctx.fill()
    ctx.strokeStyle = 'rgba(180,110,90,0.6)'; ctx.lineWidth = 1; ctx.stroke()
    const toes: [number, number, number][] = [[12.5, 7.2, 3.1], [16.6, 5.8, 2.3], [19.6, 6, 2.1], [22.2, 7, 1.9], [24.3, 8.8, 1.7]]
    for (const [x, y, r] of toes) { ctx.fillStyle = '#fbd9c4'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = 'rgba(180,110,90,0.55)'; ctx.stroke(); ctx.fillStyle = '#f07aa0'; ctx.beginPath(); ctx.arc(x, y - r * 0.2, r * 0.55, 0, Math.PI * 2); ctx.fill() }
    blob(ctx, 14, 15, 3, 5, [255, 255, 255], 0.45)
  }),
  tea: () => icon('tea', ctx => {
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.roundRect(7, 13, 16, 13, [2, 2, 7, 7]); ctx.fill()
    ctx.strokeStyle = 'rgba(160,120,140,0.7)'; ctx.lineWidth = 1; ctx.stroke()
    ctx.beginPath(); ctx.arc(24, 18, 3.5, -1.2, 1.2); ctx.stroke()
    ctx.fillStyle = '#e9a86a'; ctx.fillRect(8.5, 14.5, 13, 3)
    ctx.strokeStyle = 'rgba(200,190,200,0.9)'; ctx.lineWidth = 1.4
    for (const x of [12, 17]) { ctx.beginPath(); ctx.moveTo(x, 10); ctx.quadraticCurveTo(x + 3, 7, x, 4); ctx.stroke() }
  }),
  heart: () => icon('heart', ctx => heart(ctx, 16, 17, 8, '#f07aa0')),
}

/** The icon for what a customer came for. */
export const treatmentIcon = (t: string) => (t === 'nails' ? icons.nails() : t === 'feet' ? icons.feet() : icons.facial())
