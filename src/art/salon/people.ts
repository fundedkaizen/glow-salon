import { Texture } from 'pixi.js'
import type { Look } from '../../core/customers.ts'
import { HAIR, OUTFIT, SKIN } from '../palette.ts'
import { hairPalette } from '../hair.ts'
import { SENIOR_AGE, lookFigure } from '../../core/figure.ts'
import { blob, blurred, rgba, shade, type Ctx, type RGB } from '../paint.ts'
import { hexRGB } from './furniture.ts'
import { canvasTexture, worldCanvas } from './room.ts'

/**
 * Chibi people for the salon floor, painted from a Look: a big soft head with a face that changes with
 * mood, one of six hairstyles with a sheen, an outfit (a dress, a jumper and trousers, or a tee and
 * dungarees), and separate arms and legs so they can walk, sit and wave. Players wear an apron in their
 * colour; staff wear a mint smock. Every texture is cached by look and made once.
 */
export type Expr = 'smile' | 'happy' | 'neutral' | 'meh' | 'sleepy' | 'blink' | 'wow'
export type Role = 'customer' | 'player' | 'staff'

export type PersonTextures = { hairBack: Texture | null; body: Texture; arm: Texture; leg: Texture; legSit: Texture; head: (e: Expr) => Texture }

/** Character geometry in world units, feet at (0, 0). */
export const P = {
  headY: -66,
  headR: 22,
  shoulderY: -46,
  shoulderX: 12,
  hipY: -15,
  legX: 6,
  height: 92,
}

const cache = new Map<string, Texture>()
function tex(key: string, w: number, h: number, draw: (ctx: Ctx) => void): Texture {
  let t = cache.get(key)
  if (!t) {
    const [c, ctx] = worldCanvas(w, h)
    draw(ctx)
    t = canvasTexture(c)
    cache.set(key, t)
  }
  return t
}

/** Anchors (in the texture's own units) for placing each part. */
export const ANCHOR = {
  head: { w: 70, h: 76, x: 35, y: 44 },
  body: { w: 48, h: 44, x: 24, y: 40 },
  arm: { w: 14, h: 26, x: 7, y: 4 },
  leg: { w: 14, h: 22, x: 7, y: 2 },
  hairBack: { w: 70, h: 90, x: 35, y: 44 },
}

const lookKey = (l: Look) => `${l.skin}.${l.hair}.${l.hairStyle}.${l.outfit}.${l.accessory}.${l.freckles ? 1 : 0}.${`${lookFigure(l).masc ? 1 : 0}${lookFigure(l).age >= SENIOR_AGE ? 1 : 0}`}`

export function outfitStyle(l: Look) { return l.outfit % 3 }

export function personTextures(look: Look, role: Role = 'customer', tint = 0xe7799c): PersonTextures {
  const key = `${lookKey(look)}|${role}|${tint}`
  const skin = SKIN[look.skin % SKIN.length]
  const hair = hairPalette(HAIR[look.hair % HAIR.length], lookFigure(look))
  const outfit = hexRGB(OUTFIT[look.outfit % OUTFIT.length])
  const style = outfitStyle(look)
  const pants: RGB = style === 1 ? shade(hexRGB(OUTFIT[(look.outfit + 3) % OUTFIT.length]), -0.18) : style === 2 ? [120, 150, 200] : skin.base
  const long = look.hairStyle === 0 || look.hairStyle === 5 || look.hairStyle === 6
  return {
    hairBack: long ? tex(`hb|${key}`, ANCHOR.hairBack.w, ANCHOR.hairBack.h, ctx => paintHairBack(ctx, look, hair)) : null,
    body: tex(`b|${key}`, ANCHOR.body.w, ANCHOR.body.h, ctx => paintBody(ctx, look, outfit, skin.base, role, tint)),
    arm: tex(`a|${key}`, ANCHOR.arm.w, ANCHOR.arm.h, ctx => paintArm(ctx, role === 'staff' ? [178, 228, 210] : style === 0 ? skin.base : outfit, skin.base, skin.shadow)),
    leg: tex(`l|${key}`, ANCHOR.leg.w, ANCHOR.leg.h, ctx => paintLeg(ctx, pants, skin.shadow, look.outfit, false)),
    legSit: tex(`ls|${key}`, ANCHOR.leg.w, ANCHOR.leg.h, ctx => paintLeg(ctx, pants, skin.shadow, look.outfit, true)),
    head: (e: Expr) => tex(`h|${key}|${e}`, ANCHOR.head.w, ANCHOR.head.h, ctx => paintHead(ctx, look, skin, hair, e)),
  }
}

type SkinT = (typeof SKIN)[number]
type HairT = (typeof HAIR)[number]

function outline(ctx: Ctx, col: RGB, a = 0.6, w = 1.2) { ctx.strokeStyle = rgba(shade(col, -0.45), a); ctx.lineWidth = w; ctx.stroke() }

function paintHead(ctx: Ctx, look: Look, skin: SkinT, hair: HairT, e: Expr) {
  const cx = ANCHOR.head.x, cy = ANCHOR.head.y, R = P.headR
  // Ears.
  for (const s of [-1, 1]) {
    ctx.fillStyle = rgba(skin.base); ctx.beginPath(); ctx.ellipse(cx + s * (R - 1), cy + 3, 5, 6.5, 0, 0, Math.PI * 2); ctx.fill(); outline(ctx, skin.shadow, 0.5)
    ctx.fillStyle = rgba(skin.blush, 0.45); ctx.beginPath(); ctx.ellipse(cx + s * (R - 1), cy + 3, 2.5, 3.5, 0, 0, Math.PI * 2); ctx.fill()
  }
  // Face: soft round with a fuller cheek line, lit from the top left.
  ctx.beginPath()
  ctx.moveTo(cx - R, cy - 2)
  ctx.bezierCurveTo(cx - R, cy - R * 1.15, cx + R, cy - R * 1.15, cx + R, cy - 2)
  ctx.bezierCurveTo(cx + R, cy + R * 0.75, cx + R * 0.45, cy + R * 0.98, cx, cy + R * 0.98)
  ctx.bezierCurveTo(cx - R * 0.45, cy + R * 0.98, cx - R, cy + R * 0.75, cx - R, cy - 2)
  const g = ctx.createRadialGradient(cx - 7, cy - 9, 3, cx, cy, R * 1.25)
  g.addColorStop(0, rgba(skin.light)); g.addColorStop(0.6, rgba(skin.base)); g.addColorStop(1, rgba(shade(skin.shadow, 0.2)))
  ctx.fillStyle = g
  ctx.fill()
  outline(ctx, skin.shadow, 0.55)
  // Cheeks.
  blob(ctx, cx - 12, cy + 7, 6, 4, skin.blush, 0.55)
  blob(ctx, cx + 13, cy + 7, 6, 4, skin.blush, 0.55)
  if (look.freckles) { ctx.fillStyle = rgba(skin.deep, 0.5); for (const [fx, fy] of [[-14, 3], [-10, 5], [-12, 8], [12, 3], [15, 5], [11, 8]]) { ctx.beginPath(); ctx.arc(cx + fx, cy + fy, 0.8, 0, Math.PI * 2); ctx.fill() } }
  paintFace(ctx, cx + 1.5, cy, e, skin)
  paintHairFront(ctx, look, hair, cx, cy)
  // No bow for masculine customers (glasses and flower clips stay).
  paintAccessory(ctx, lookFigure(look).masc && look.accessory === 1 ? { ...look, accessory: 0 } : look, cx, cy)
}

function paintFace(ctx: Ctx, cx: number, cy: number, e: Expr, skin: SkinT) {
  const ink = 'rgba(70,40,55,1)'
  const eyeY = cy + 1, ex = 8.5
  ctx.lineCap = 'round'
  const closedArc = (x: number, up: boolean) => { ctx.strokeStyle = ink; ctx.lineWidth = 1.8; ctx.beginPath(); if (up) ctx.arc(x, eyeY + 2, 3.6, Math.PI * 1.15, Math.PI * 1.85); else ctx.arc(x, eyeY - 1.5, 3.6, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke() }
  if (e === 'happy') { closedArc(cx - ex, true); closedArc(cx + ex, true) }
  else if (e === 'sleepy' || e === 'blink') { closedArc(cx - ex, false); closedArc(cx + ex, false) }
  else {
    for (const s of [-1, 1]) {
      const x = cx + s * ex
      const h = e === 'wow' ? 6.4 : 5.6
      const ig = ctx.createLinearGradient(0, eyeY - h, 0, eyeY + h)
      ig.addColorStop(0, '#3b2436'); ig.addColorStop(1, '#7a4d6a')
      ctx.fillStyle = ig
      ctx.beginPath(); ctx.ellipse(x, eyeY, 3.6, h, 0, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x - 1.2, eyeY - 2.4, 1.5, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.arc(x + 1.3, eyeY + 2, 0.8, 0, Math.PI * 2); ctx.fill()
      if (e === 'meh') { ctx.fillStyle = rgba(skin.base); ctx.fillRect(x - 4, eyeY - h - 1, 8, h * 0.8) ; ctx.strokeStyle = ink; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x - 3.6, eyeY - h * 0.25); ctx.lineTo(x + 3.6, eyeY - h * 0.25); ctx.stroke() }
    }
  }
  // Brows: soft, raised when happy, tilted when meh.
  ctx.strokeStyle = 'rgba(90,55,70,0.75)'; ctx.lineWidth = 1.5
  for (const s of [-1, 1]) {
    const x = cx + s * ex, y = eyeY - 9 - (e === 'happy' || e === 'wow' ? 1.5 : 0)
    ctx.beginPath()
    if (e === 'meh') { ctx.moveTo(x - 3, y + (s < 0 ? -1 : 1.5)); ctx.lineTo(x + 3, y + (s < 0 ? 1.5 : -1)) }
    else { ctx.moveTo(x - 3, y + 0.8); ctx.quadraticCurveTo(x, y - 1.2, x + 3, y + 0.8) }
    ctx.stroke()
  }
  // Nose: a tiny highlight and shadow.
  ctx.fillStyle = rgba(skin.shadow, 0.5); ctx.beginPath(); ctx.ellipse(cx + 0.8, cy + 7.5, 1.3, 0.9, 0, 0, Math.PI * 2); ctx.fill()
  // Mouth.
  const my = cy + 12
  ctx.strokeStyle = 'rgba(120,50,70,0.9)'; ctx.lineWidth = 1.5
  if (e === 'happy' || e === 'wow') {
    ctx.fillStyle = e === 'wow' ? '#9a3f5a' : '#b04a66'
    ctx.beginPath()
    if (e === 'wow') ctx.ellipse(cx, my + 1, 2.4, 3, 0, 0, Math.PI * 2)
    else { ctx.moveTo(cx - 4, my - 0.5); ctx.quadraticCurveTo(cx, my + 6, cx + 4, my - 0.5); ctx.closePath() }
    ctx.fill()
    if (e === 'happy') { ctx.fillStyle = '#f39aa9'; ctx.beginPath(); ctx.ellipse(cx, my + 2.6, 2, 1.1, 0, 0, Math.PI * 2); ctx.fill() }
  } else if (e === 'meh') { ctx.beginPath(); ctx.moveTo(cx - 2.5, my + 1); ctx.quadraticCurveTo(cx, my - 0.5, cx + 2.5, my + 1); ctx.stroke() }
  else if (e === 'sleepy') { ctx.beginPath(); ctx.ellipse(cx, my + 0.5, 1.6, 1.2, 0, 0, Math.PI * 2); ctx.stroke() }
  else { ctx.beginPath(); ctx.moveTo(cx - 3, my - 0.2); ctx.quadraticCurveTo(cx, my + 2.6, cx + 3, my - 0.2); ctx.stroke() }
}

/** Hair colour gradient with a sheen band, for a region. */
function hairFill(ctx: Ctx, hair: HairT, x0: number, y0: number, x1: number, y1: number) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1)
  g.addColorStop(0, rgba(hair.light)); g.addColorStop(0.35, rgba(hair.base)); g.addColorStop(1, rgba(hair.dark))
  return g
}

function sheen(ctx: Ctx, hair: HairT, cx: number, cy: number, r: number) {
  ctx.save()
  ctx.strokeStyle = rgba(shade(hair.light, 0.35), 0.7); ctx.lineWidth = 2.4; ctx.lineCap = 'round'
  ctx.beginPath(); ctx.arc(cx - 2, cy - 2, r, Math.PI * 1.12, Math.PI * 1.42); ctx.stroke()
  ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(cx - 2, cy - 2, r, Math.PI * 1.5, Math.PI * 1.6); ctx.stroke()
  ctx.restore()
}

function paintHairFront(ctx: Ctx, look: Look, hair: HairT, cx: number, cy: number) {
  const R = P.headR
  const style = look.hairStyle % 7
  ctx.fillStyle = hairFill(ctx, hair, cx - R, cy - R - 6, cx + R, cy + 6)
  ctx.beginPath()
  if (style === 3) {
    // Curly puff: a cloud of curls framing the face.
    const curls: [number, number, number][] = [[-20, -8, 9], [-16, -19, 10], [-5, -25, 10], [8, -25, 10], [18, -18, 10], [22, -6, 9], [-22, 3, 7], [23, 4, 7]]
    for (const [x, y, r] of curls) { ctx.moveTo(cx + x + r, cy + y); ctx.arc(cx + x, cy + y, r, 0, Math.PI * 2) }
    ctx.fill()
    ctx.strokeStyle = rgba(hair.dark, 0.5); ctx.lineWidth = 1
    for (const [x, y, r] of curls) { ctx.beginPath(); ctx.arc(cx + x, cy + y, r * 0.55, 0.5, 2.5); ctx.stroke() }
    for (const [x, y, r] of curls.slice(1, 4)) blob(ctx, cx + x - 3, cy + y - 3, r * 0.45, r * 0.3, hair.light, 0.8)
    return
  }
  // A cap of hair over the top of the head.
  ctx.moveTo(cx - R - 2, cy + (style === 4 ? -4 : 4))
  ctx.bezierCurveTo(cx - R - 4, cy - R * 1.45, cx + R + 4, cy - R * 1.45, cx + R + 2, cy + (style === 4 ? -4 : 4))
  if (style === 1) {
    // Bob: straight fringe.
    ctx.lineTo(cx + R + 2, cy + 12)
    ctx.quadraticCurveTo(cx + R - 2, cy + 16, cx + R - 6, cy + 12)
    ctx.lineTo(cx + R - 6, cy - 8)
    ctx.lineTo(cx - R + 6, cy - 8)
    ctx.lineTo(cx - R + 6, cy + 12)
    ctx.quadraticCurveTo(cx - R + 2, cy + 16, cx - R - 2, cy + 12)
  } else if (style === 4) {
    // Short crop: a soft side part.
    ctx.quadraticCurveTo(cx + R - 4, cy - 12, cx + 4, cy - 14)
    ctx.quadraticCurveTo(cx - 10, cy - 9, cx - R + 2, cy - 6)
  } else {
    // Swept bangs: a curve from one temple to the other.
    ctx.quadraticCurveTo(cx + R - 2, cy - 4, cx + R - 7, cy - 8)
    ctx.quadraticCurveTo(cx + 4, cy - 16, cx - 6, cy - 6)
    ctx.quadraticCurveTo(cx - 12, cy - 2, cx - R + 2, cy + 6)
  }
  ctx.closePath()
  ctx.fill()
  outline(ctx, hair.dark, 0.6, 1.1)
  // Strands.
  ctx.strokeStyle = rgba(hair.dark, 0.35); ctx.lineWidth = 0.9
  for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(cx + i * 5, cy - R - 2); ctx.quadraticCurveTo(cx + i * 6 + 3, cy - 12, cx + i * 7, cy - 6); ctx.stroke() }
  sheen(ctx, hair, cx, cy - 4, R - 1)
  if (style === 6) {
    // Braids: a clean centre parting.
    ctx.strokeStyle = rgba(shade(hair.dark, -0.2), 0.7); ctx.lineWidth = 1.2
    ctx.beginPath(); ctx.moveTo(cx, cy - R - 1); ctx.quadraticCurveTo(cx + 1, cy - R * 0.6, cx, cy - 10); ctx.stroke()
  }
  if (style === 2) {
    // Top bun.
    ctx.fillStyle = hairFill(ctx, hair, cx - 10, cy - R - 20, cx + 10, cy - R)
    ctx.beginPath(); ctx.arc(cx + 2, cy - R - 10, 11, 0, Math.PI * 2); ctx.fill(); outline(ctx, hair.dark, 0.6, 1.1)
    blob(ctx, cx - 1, cy - R - 14, 5, 3, hair.light, 0.8)
    ctx.strokeStyle = rgba(hair.dark, 0.4); ctx.beginPath(); ctx.arc(cx + 2, cy - R - 10, 6, 0.3, 2.6); ctx.stroke()
  }
}

function paintHairBack(ctx: Ctx, look: Look, hair: HairT) {
  const cx = ANCHOR.hairBack.x, cy = ANCHOR.hairBack.y, R = P.headR
  ctx.fillStyle = hairFill(ctx, hair, cx - R, cy - R, cx + R, cy + 40)
  ctx.beginPath()
  if (look.hairStyle === 6) {
    // Two plaits hanging down behind the shoulders: a chain of little lobes each side, and a tie.
    ctx.arc(cx, cy - 4, R + 1, 0, Math.PI * 2)
    ctx.fill()
    outline(ctx, hair.dark, 0.55, 1.1)
    for (const sd of [-1, 1]) {
      for (let k = 0; k < 6; k++) {
        const x = cx + sd * (R - 3 + k * 0.6) + (k % 2 ? sd * 1.5 : -sd * 1.5), y = cy + 4 + k * 6.5
        ctx.fillStyle = hairFill(ctx, hair, x - 5, y - 5, x + 5, y + 5)
        ctx.beginPath(); ctx.ellipse(x, y, 5.2 - k * 0.3, 4.2, sd * (k % 2 ? 0.5 : -0.5), 0, Math.PI * 2); ctx.fill()
        outline(ctx, hair.dark, 0.5, 0.9)
        blob(ctx, x - 1.5, y - 1.5, 2, 1.2, hair.light, 0.6)
      }
      ctx.fillStyle = rgba(hexRGB(OUTFIT[(look.outfit + 5) % OUTFIT.length]))
      ctx.beginPath(); ctx.roundRect(cx + sd * (R + 1) - 3, cy + 41, 6, 3, 1.5); ctx.fill()
    }
    return
  }
  if (look.hairStyle === 5) {
    // A ponytail swinging to the side.
    ctx.arc(cx, cy - 4, R + 1, 0, Math.PI * 2)
    ctx.moveTo(cx + R - 2, cy - 12)
    ctx.bezierCurveTo(cx + R + 18, cy - 10, cx + R + 16, cy + 26, cx + R + 4, cy + 36)
    ctx.bezierCurveTo(cx + R + 2, cy + 20, cx + R - 2, cy + 6, cx + R - 8, cy - 2)
  } else {
    // Long hair falling past the shoulders.
    ctx.moveTo(cx - R - 3, cy - 4)
    ctx.bezierCurveTo(cx - R - 4, cy - R * 1.4, cx + R + 4, cy - R * 1.4, cx + R + 3, cy - 4)
    ctx.bezierCurveTo(cx + R + 6, cy + 20, cx + R + 4, cy + 34, cx + R - 2, cy + 40)
    ctx.quadraticCurveTo(cx, cy + 46, cx - R + 2, cy + 40)
    ctx.bezierCurveTo(cx - R - 4, cy + 34, cx - R - 6, cy + 20, cx - R - 3, cy - 4)
  }
  ctx.fill()
  outline(ctx, hair.dark, 0.55, 1.1)
  ctx.strokeStyle = rgba(hair.dark, 0.3); ctx.lineWidth = 1
  for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(cx + i * 8, cy + 6); ctx.quadraticCurveTo(cx + i * 9 + 2, cy + 24, cx + i * 8, cy + 38); ctx.stroke() }
}

function paintAccessory(ctx: Ctx, look: Look, cx: number, cy: number) {
  const accent = hexRGB(OUTFIT[(look.outfit + 5) % OUTFIT.length])
  if (look.accessory === 1) {
    // A bow on the side of the head.
    const bx = cx - 14, by = cy - 20
    ctx.fillStyle = rgba(accent)
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(bx, by); ctx.quadraticCurveTo(bx + s * 10, by - 9, bx + s * 11, by + 1); ctx.quadraticCurveTo(bx + s * 8, by + 6, bx, by); ctx.fill(); outline(ctx, accent, 0.6, 1) }
    ctx.fillStyle = rgba(shade(accent, -0.1)); ctx.beginPath(); ctx.arc(bx, by, 3, 0, Math.PI * 2); ctx.fill()
    blob(ctx, bx - 5, by - 3, 3, 2, [255, 255, 255], 0.7)
  } else if (look.accessory === 2) {
    // Round glasses.
    ctx.strokeStyle = 'rgba(90,60,80,0.9)'; ctx.lineWidth = 1.4
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(cx + 1.5 + s * 8.5, cy + 1.5, 6, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fill() }
    ctx.beginPath(); ctx.moveTo(cx - 1.5, cy + 1); ctx.lineTo(cx + 4.5, cy + 1); ctx.stroke()
  } else if (look.accessory === 3) {
    // A flower clip.
    const fx = cx + 14, fy = cy - 16
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; ctx.fillStyle = rgba(shade(accent, 0.2)); ctx.beginPath(); ctx.arc(fx + Math.cos(a) * 3.6, fy + Math.sin(a) * 3.6, 3, 0, Math.PI * 2); ctx.fill() }
    ctx.fillStyle = '#fbe7b0'; ctx.beginPath(); ctx.arc(fx, fy, 2.2, 0, Math.PI * 2); ctx.fill()
  }
}

function paintBody(ctx: Ctx, look: Look, outfit: RGB, skinBase: RGB, role: Role, tint: number) {
  const cx = ANCHOR.body.x, top = 6, bottom = ANCHOR.body.y
  const style = outfitStyle(look)
  // Neck.
  ctx.fillStyle = rgba(shade(skinBase, -0.1)); ctx.beginPath(); ctx.roundRect(cx - 4, top - 4, 8, 8, 3); ctx.fill()
  const main: RGB = role === 'staff' ? [178, 228, 210] : outfit
  ctx.beginPath()
  if (style === 0 && role === 'customer') {
    // A dress with a flared skirt.
    ctx.moveTo(cx - 11, top); ctx.quadraticCurveTo(cx, top - 3, cx + 11, top)
    ctx.lineTo(cx + 13, top + 16); ctx.lineTo(cx + 19, bottom - 2); ctx.quadraticCurveTo(cx, bottom + 3, cx - 19, bottom - 2); ctx.lineTo(cx - 13, top + 16)
  } else {
    ctx.moveTo(cx - 12, top); ctx.quadraticCurveTo(cx, top - 3, cx + 12, top)
    ctx.quadraticCurveTo(cx + 16, top + 14, cx + 15, bottom - 3); ctx.quadraticCurveTo(cx, bottom + 1, cx - 15, bottom - 3); ctx.quadraticCurveTo(cx - 16, top + 14, cx - 12, top)
  }
  ctx.closePath()
  const g = ctx.createLinearGradient(cx - 16, top, cx + 16, bottom)
  g.addColorStop(0, rgba(shade(main, 0.3))); g.addColorStop(0.55, rgba(main)); g.addColorStop(1, rgba(shade(main, -0.14)))
  ctx.fillStyle = g
  ctx.fill()
  outline(ctx, main, 0.55)
  ctx.save(); ctx.clip()
  if (style === 1 && role === 'customer') {
    // Jumper ribbing at the hem and cuffs.
    ctx.strokeStyle = rgba(shade(main, -0.18), 0.6); ctx.lineWidth = 0.9
    for (let x = cx - 16; x < cx + 16; x += 3) { ctx.beginPath(); ctx.moveTo(x, bottom - 7); ctx.lineTo(x, bottom); ctx.stroke() }
  } else if (style === 2 && role === 'customer') {
    // Dungarees over a tee.
    ctx.fillStyle = 'rgba(120,150,200,1)'; ctx.fillRect(cx - 10, top + 14, 20, bottom)
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(cx - 10, top + 14, 20, 2)
    ctx.fillStyle = 'rgba(120,150,200,1)'; ctx.fillRect(cx - 9, top + 2, 3, 13); ctx.fillRect(cx + 6, top + 2, 3, 13)
    ctx.fillStyle = '#f3d27a'; ctx.beginPath(); ctx.arc(cx - 7.5, top + 13, 1.4, 0, Math.PI * 2); ctx.arc(cx + 7.5, top + 13, 1.4, 0, Math.PI * 2); ctx.fill()
  }
  blob(ctx, cx - 7, top + 8, 7, 9, [255, 255, 255], 0.22)
  ctx.restore()
  // A little collar.
  ctx.fillStyle = rgba(shade(main, 0.45))
  ctx.beginPath(); ctx.moveTo(cx - 7, top - 1); ctx.lineTo(cx, top + 5); ctx.lineTo(cx + 7, top - 1); ctx.quadraticCurveTo(cx, top + 1, cx - 7, top - 1); ctx.fill()
  if (role === 'player') {
    // An apron in the player's colour, with a pocket and a heart.
    const col = hexRGB(tint)
    ctx.beginPath()
    ctx.moveTo(cx - 9, top + 6); ctx.lineTo(cx + 9, top + 6); ctx.lineTo(cx + 12, bottom - 1); ctx.quadraticCurveTo(cx, bottom + 2, cx - 12, bottom - 1); ctx.closePath()
    const ag = ctx.createLinearGradient(cx - 12, 0, cx + 12, 0)
    ag.addColorStop(0, rgba(shade(col, 0.3))); ag.addColorStop(1, rgba(shade(col, -0.05)))
    ctx.fillStyle = ag; ctx.fill(); outline(ctx, col, 0.6)
    ctx.strokeStyle = rgba(shade(col, 0.5)); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(cx - 9, top + 6); ctx.lineTo(cx - 6, top - 1); ctx.moveTo(cx + 9, top + 6); ctx.lineTo(cx + 6, top - 1); ctx.stroke()
    ctx.fillStyle = rgba(shade(col, -0.12)); ctx.beginPath(); ctx.roundRect(cx - 6, top + 20, 12, 8, 2); ctx.fill()
    heart(ctx, cx, top + 12, 3.2, '#ffffff')
  } else if (role === 'staff') {
    // Smock details: a name badge and buttons.
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.roundRect(cx + 3, top + 9, 9, 5, 1.5); ctx.fill()
    ctx.fillStyle = '#e98aa8'; ctx.fillRect(cx + 4.5, top + 10.5, 6, 1.2)
    ctx.fillStyle = 'rgba(80,140,120,0.8)'; for (const y of [top + 12, top + 20, top + 28]) { ctx.beginPath(); ctx.arc(cx - 2, y, 1.2, 0, Math.PI * 2); ctx.fill() }
  }
}

export function heart(ctx: Ctx, x: number, y: number, s: number, color: string) {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(x, y + s * 0.9)
  ctx.bezierCurveTo(x - s * 1.6, y - s * 0.2, x - s * 0.8, y - s * 1.4, x, y - s * 0.5)
  ctx.bezierCurveTo(x + s * 0.8, y - s * 1.4, x + s * 1.6, y - s * 0.2, x, y + s * 0.9)
  ctx.fill()
}

function paintArm(ctx: Ctx, sleeve: RGB, skin: RGB, skinShadow: RGB) {
  const cx = ANCHOR.arm.x
  ctx.beginPath(); ctx.roundRect(cx - 4, 1, 8, 17, 4)
  const g = ctx.createLinearGradient(cx - 4, 0, cx + 4, 0)
  g.addColorStop(0, rgba(shade(sleeve, 0.2))); g.addColorStop(1, rgba(shade(sleeve, -0.12)))
  ctx.fillStyle = g; ctx.fill(); outline(ctx, sleeve, 0.5, 1)
  ctx.fillStyle = rgba(skin); ctx.beginPath(); ctx.arc(cx, 20, 4.4, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = rgba(shade(skinShadow, -0.2), 0.5); ctx.lineWidth = 1; ctx.stroke()
}

function paintLeg(ctx: Ctx, pants: RGB, skinShadow: RGB, outfit: number, sitting: boolean) {
  const cx = ANCHOR.leg.x
  const len = sitting ? 9 : 13
  ctx.beginPath(); ctx.roundRect(cx - 3.8, 1, 7.6, len, 3.5)
  const g = ctx.createLinearGradient(cx - 4, 0, cx + 4, 0)
  g.addColorStop(0, rgba(shade(pants, 0.15))); g.addColorStop(1, rgba(shade(pants, -0.12)))
  ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = rgba(shade(skinShadow, -0.3), 0.45); ctx.lineWidth = 1; ctx.stroke()
  // Shoes: a rounded toe in a colour from the outfit set.
  const shoe = shade(hexRGB(OUTFIT[(outfit + 4) % OUTFIT.length]), -0.25)
  const sy = len + 1
  ctx.fillStyle = rgba(shoe); ctx.beginPath(); ctx.roundRect(cx - 4.6, sy - 3, 10, 6.4, 3.2); ctx.fill()
  ctx.strokeStyle = rgba(shade(shoe, -0.4), 0.6); ctx.lineWidth = 1; ctx.stroke()
  ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(cx - 2.6, sy - 2, 3, 1.2)
}

/** A round portrait for review cards and staff cards (a DOM image). */
export function portrait(look: Look, size = 96, bg = '#fbe0e8', role: Role = 'customer', tint = 0xe7799c): string {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')!
  const s = size / 70
  ctx.fillStyle = bg
  ctx.beginPath(); ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2); ctx.fill()
  ctx.save()
  ctx.beginPath(); ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2); ctx.clip()
  const skin = SKIN[look.skin % SKIN.length], hair = hairPalette(HAIR[look.hair % HAIR.length], lookFigure(look)), outfit = hexRGB(OUTFIT[look.outfit % OUTFIT.length])
  ctx.scale(s, s)
  ctx.translate(0, -6)
  if (look.hairStyle === 0 || look.hairStyle === 5 || look.hairStyle === 6) paintHairBack(ctx, look, hair)
  ctx.save(); ctx.translate(35 - ANCHOR.body.x, 58); paintBody(ctx, look, outfit, skin.base, role, tint); ctx.restore()
  paintHead(ctx, look, skin, hair, 'happy')
  ctx.restore()
  return c.toDataURL()
}

/** A soft shadow texture under a character. */
export function shadowTexture(): Texture {
  return tex('shadow', 50, 16, ctx => {
    blurred(ctx, 3, () => { ctx.fillStyle = 'rgba(110,55,80,0.28)'; ctx.beginPath(); ctx.ellipse(25, 8, 19, 5.5, 0, 0, Math.PI * 2); ctx.fill() })
    blurred(ctx, 1.2, () => { ctx.fillStyle = 'rgba(100,45,70,0.3)'; ctx.beginPath(); ctx.ellipse(25, 8, 11, 3, 0, 0, Math.PI * 2); ctx.fill() })
  })
}
