import { CanvasSource, Texture } from 'pixi.js'
import { FLOOR_H, FLOOR_W, WALL_H } from '../../core/floor.ts'
import { makeRng } from '../../core/rng.ts'
import { blob, blurred, canvas, rgba, shade, type Ctx, type RGB } from '../paint.ts'

/**
 * The salon room, painted once: the blush back wall with its wainscot, arched windows and product shelves,
 * a warm herringbone floor, thick cream wall tops framing the room like a dollhouse cut-away, and the soft
 * light and shadow that tie it together. One warm key light from the top left, as in every Glow Salon
 * picture. World units are the floor's 1280 x 800 pixels; canvases are painted at RES times that.
 */
export const RES = 2
export const WALL_T = 16
export const DOOR_Y0 = 556
export const DOOR_Y1 = 664
export const WINDOWS = [{ x: 760, w: 116 }, { x: 1160, w: 116 }]

export const ROOM = {
  wall: [243, 192, 207] as RGB,
  wallLight: [252, 226, 232] as RGB,
  cream: [255, 246, 240] as RGB,
  trim: [255, 251, 247] as RGB,
  wood: [236, 202, 168] as RGB,
  woodLight: [245, 220, 192] as RGB,
  shadow: [120, 60, 84] as RGB,
  slab: [255, 244, 238] as RGB,
  slabEdge: [233, 186, 200] as RGB,
}

export function worldCanvas(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const [c, ctx] = canvas(Math.ceil(w * RES), Math.ceil(h * RES))
  ctx.scale(RES, RES)
  return [c, ctx]
}

/** Everything behind the furniture: the back wall, the floor and the wall tops (except the front one). */
export function paintRoom(): HTMLCanvasElement {
  const [c, ctx] = worldCanvas(FLOOR_W, FLOOR_H)
  paintFloor(ctx)
  paintBackWall(ctx)
  paintSideWalls(ctx)
  return c
}

function paintBackWall(ctx: Ctx) {
  const H = WALL_H
  // Base: blush, lit from the top left.
  const g = ctx.createLinearGradient(0, 0, FLOOR_W, H)
  g.addColorStop(0, rgba(shade(ROOM.wall, 0.22)))
  g.addColorStop(0.55, rgba(ROOM.wall))
  g.addColorStop(1, rgba(shade(ROOM.wall, -0.04)))
  ctx.fillStyle = g
  ctx.fillRect(0, 0, FLOOR_W, H)
  // Wallpaper: a soft trellis of cream lines with little four-petal flowers at the crossings.
  ctx.save()
  ctx.beginPath(); ctx.rect(0, 11, FLOOR_W, 100); ctx.clip()
  ctx.strokeStyle = 'rgba(255,245,248,0.42)'; ctx.lineWidth = 1.2
  for (let x = -120; x < FLOOR_W + 120; x += 36) {
    ctx.beginPath(); ctx.moveTo(x, 11); ctx.lineTo(x + 100, 111); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(x + 100, 11); ctx.lineTo(x, 111); ctx.stroke()
  }
  for (let row = 0; row < 4; row++) {
    for (let x = (row % 2) * 18; x < FLOOR_W + 36; x += 36) {
      const fx = x, fy = 11 + row * 18 * 1.55 + 13
      for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2; ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); ctx.ellipse(fx + Math.cos(a) * 2.4, fy + Math.sin(a) * 2.4, 2, 2, 0, 0, Math.PI * 2); ctx.fill() }
      ctx.fillStyle = 'rgba(247,206,120,0.8)'; ctx.beginPath(); ctx.arc(fx, fy, 1.2, 0, Math.PI * 2); ctx.fill()
    }
  }
  ctx.restore()
  // Crown molding.
  const cg = ctx.createLinearGradient(0, 0, 0, 12)
  cg.addColorStop(0, rgba(ROOM.trim)); cg.addColorStop(1, rgba(shade(ROOM.cream, -0.06)))
  ctx.fillStyle = cg
  ctx.fillRect(0, 0, FLOOR_W, 11)
  ctx.fillStyle = 'rgba(160,90,110,0.18)'
  ctx.fillRect(0, 11, FLOOR_W, 2)
  // Wainscot: cream panels below a chair rail.
  const railY = 112
  const wg = ctx.createLinearGradient(0, railY, 0, H)
  wg.addColorStop(0, rgba(ROOM.cream)); wg.addColorStop(1, rgba(shade(ROOM.cream, -0.05)))
  ctx.fillStyle = wg
  ctx.fillRect(0, railY, FLOOR_W, H - railY)
  // Raised panels: a bevelled frame (lit top and left, shaded bottom and right) around a flat field.
  for (let x = 12; x < FLOOR_W - 30; x += 66) {
    const px = x, py = railY + 10, pw = 56, ph = H - railY - 26
    ctx.fillStyle = 'rgba(160,100,110,0.16)'
    ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 5); ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.95)'
    ctx.beginPath(); ctx.roundRect(px, py, pw - 1.6, ph - 1.6, 5); ctx.fill()
    const fg = ctx.createLinearGradient(px, py, px + pw, py + ph)
    fg.addColorStop(0, rgba(shade(ROOM.cream, 0.1))); fg.addColorStop(1, rgba(shade(ROOM.cream, -0.06)))
    ctx.fillStyle = fg
    ctx.beginPath(); ctx.roundRect(px + 4, py + 4, pw - 8, ph - 8, 3); ctx.fill()
    ctx.strokeStyle = 'rgba(170,110,120,0.22)'; ctx.lineWidth = 1; ctx.stroke()
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.moveTo(px + 5, py + ph - 5); ctx.lineTo(px + 5, py + 5); ctx.lineTo(px + pw - 5, py + 5); ctx.stroke()
  }
  // Chair rail: a highlight on top and a soft shadow under it.
  ctx.fillStyle = rgba(ROOM.trim)
  ctx.fillRect(0, railY - 4, FLOOR_W, 7)
  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  ctx.fillRect(0, railY - 4, FLOOR_W, 1.6)
  blurred(ctx, 3, () => { ctx.fillStyle = 'rgba(150,80,100,0.22)'; ctx.fillRect(0, railY + 3, FLOOR_W, 4) })
  // Skirting board: a taller moulded board with a rounded top bead.
  const sg = ctx.createLinearGradient(0, H - 13, 0, H)
  sg.addColorStop(0, rgba(ROOM.trim)); sg.addColorStop(1, rgba(shade(ROOM.cream, -0.1)))
  ctx.fillStyle = sg
  ctx.fillRect(0, H - 13, FLOOR_W, 13)
  ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fillRect(0, H - 13, FLOOR_W, 1.6)
  ctx.fillStyle = 'rgba(160,100,110,0.2)'; ctx.fillRect(0, H - 9.5, FLOOR_W, 1)
  ctx.fillStyle = 'rgba(160,100,110,0.3)'
  ctx.fillRect(0, H - 1.5, FLOOR_W, 1.5)
  for (const w of WINDOWS) paintWindow(ctx, w.x, w.w)
  paintShelves(ctx)
}

function paintWindow(ctx: Ctx, cx: number, w: number) {
  const top = 20, bottom = 104, x0 = cx - w / 2
  const arch = (inset: number) => {
    const r = w / 2 - inset
    ctx.beginPath()
    ctx.moveTo(x0 + inset, bottom)
    ctx.lineTo(x0 + inset, top + w / 2)
    ctx.arc(cx, top + w / 2, r, Math.PI, 0)
    ctx.lineTo(x0 + w - inset, bottom)
    ctx.closePath()
  }
  // Recess shadow.
  blurred(ctx, 5, () => { ctx.fillStyle = 'rgba(140,70,95,0.3)'; arch(-3); ctx.fill() })
  // Frame.
  ctx.fillStyle = rgba(ROOM.trim); arch(-4); ctx.fill()
  // Sky: a warm late-morning gradient, a soft cloud and treetops.
  ctx.save()
  arch(5); ctx.clip()
  const sky = ctx.createLinearGradient(0, top, 0, bottom)
  sky.addColorStop(0, '#bfe3f7'); sky.addColorStop(0.6, '#e6f1f4'); sky.addColorStop(1, '#fde6d2')
  ctx.fillStyle = sky
  ctx.fillRect(x0, top, w, bottom - top)
  const r = makeRng(cx)
  blurred(ctx, 3, () => {
    for (let i = 0; i < 3; i++) blob(ctx, cx + r.range(-30, 30), top + r.range(30, 50), r.range(16, 26), r.range(7, 10), [255, 255, 255], 0.9, 0.3)
  })
  blurred(ctx, 1.5, () => {
    for (let i = 0; i < 7; i++) {
      const tx = x0 + r.range(0, w), ty = bottom - r.range(4, 22)
      const col: RGB = r.chance(0.5) ? [152, 206, 160] : [126, 188, 150]
      blob(ctx, tx, ty, r.range(14, 22), r.range(12, 18), col, 1, 0.75)
    }
  })
  // Glass sheen.
  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  ctx.beginPath(); ctx.moveTo(x0 + 18, bottom); ctx.lineTo(x0 + 44, top + 20); ctx.lineTo(x0 + 56, top + 20); ctx.lineTo(x0 + 30, bottom); ctx.fill()
  ctx.restore()
  // Mullions.
  ctx.fillStyle = rgba(ROOM.trim)
  ctx.fillRect(cx - 2, top + 8, 4, bottom - top - 8)
  ctx.fillRect(x0 + 5, top + 58, w - 10, 3.5)
  // Sill with a little pot.
  ctx.fillStyle = rgba(ROOM.trim)
  ctx.beginPath(); ctx.roundRect(x0 - 8, bottom - 2, w + 16, 8, 3); ctx.fill()
  ctx.fillStyle = 'rgba(160,100,110,0.22)'
  ctx.fillRect(x0 - 8, bottom + 5, w + 16, 2)
  const px = cx + (cx > 900 ? 34 : -34)
  ctx.fillStyle = '#f2a7b9'; ctx.beginPath(); ctx.roundRect(px - 8, bottom - 16, 16, 14, 3); ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(px - 6, bottom - 14, 3, 10)
  for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i - 2) * 0.45; blob(ctx, px + Math.cos(a) * 9, bottom - 18 + Math.sin(a) * 9, 6, 4, [120, 190, 140], 1, 0.7) }
}

/** Floating shelves behind the reception desk, full of pastel bottles, jars and rolled towels. */
function paintShelves(ctx: Ctx) {
  const r = makeRng(31)
  for (const y of [52, 92]) {
    // Bottles first, standing on the shelf.
    let x = 26
    while (x < 318) {
      const kind = r.int(0, 3)
      const col: RGB = r.pick([[247, 183, 204], [169, 227, 207], [205, 189, 242], [251, 224, 160], [255, 255, 255], [242, 160, 180]] as RGB[])
      if (kind === 0) { // tall bottle
        const bw = 10, bh = r.range(20, 26)
        bottle(ctx, x, y, bw, bh, col)
        x += bw + r.range(3, 6)
      } else if (kind === 1) { // round jar
        const jw = 16, jh = 12
        ctx.fillStyle = rgba(col); ctx.beginPath(); ctx.roundRect(x, y - jh, jw, jh, 4); ctx.fill()
        ctx.fillStyle = rgba(shade(col, -0.2)); ctx.beginPath(); ctx.roundRect(x - 1, y - jh - 4, jw + 2, 5, 2); ctx.fill()
        ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillRect(x + 3, y - jh + 2, 2.5, jh - 4)
        x += jw + r.range(4, 7)
      } else if (kind === 2) { // rolled towels
        for (let i = 0; i < 3; i++) {
          const tx = x + i * 11, ty = y - 6 - (i === 1 ? 9 : 0)
          const tc: RGB = i % 2 ? [255, 255, 255] : col
          ctx.fillStyle = rgba(shade(tc, -0.08)); ctx.beginPath(); ctx.arc(tx + 5, ty, 6, 0, Math.PI * 2); ctx.fill()
          ctx.strokeStyle = rgba(shade(tc, -0.2), 0.7); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(tx + 5, ty, 3, 0.3, 5.5); ctx.stroke()
        }
        x += 36
      } else { // pump bottle
        bottle(ctx, x, y, 12, 18, col, true)
        x += 16
      }
    }
    // The shelf board with a highlight and a soft shadow on the wall.
    blurred(ctx, 3, () => { ctx.fillStyle = 'rgba(140,70,90,0.25)'; ctx.fillRect(20, y + 4, 304, 5) })
    ctx.fillStyle = '#f7ead9'; ctx.beginPath(); ctx.roundRect(18, y, 308, 6, 2); ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fillRect(18, y, 308, 1.4)
    ctx.fillStyle = 'rgba(170,120,90,0.35)'; ctx.fillRect(18, y + 5, 308, 1)
  }
}

function bottle(ctx: Ctx, x: number, base: number, w: number, h: number, col: RGB, pump = false) {
  const g = ctx.createLinearGradient(x, 0, x + w, 0)
  g.addColorStop(0, rgba(shade(col, 0.25))); g.addColorStop(1, rgba(shade(col, -0.12)))
  ctx.fillStyle = g
  ctx.beginPath(); ctx.roundRect(x, base - h, w, h, 3); ctx.fill()
  ctx.fillStyle = pump ? '#ffffff' : rgba(shade(col, -0.3))
  ctx.beginPath(); ctx.roundRect(x + w * 0.3, base - h - 5, w * 0.4, 6, 1.5); ctx.fill()
  if (pump) { ctx.fillRect(x + w * 0.45, base - h - 9, w * 0.5, 2) }
  ctx.fillStyle = 'rgba(255,255,255,0.6)'
  ctx.fillRect(x + 2, base - h + 3, 1.8, h - 6)
  ctx.fillStyle = 'rgba(255,255,255,0.75)'
  ctx.fillRect(x + 1, base - h * 0.55, w - 2, h * 0.22)
}

function paintFloor(ctx: Ctx) {
  const top = WALL_H
  const r = makeRng(7)
  ctx.save()
  ctx.beginPath(); ctx.rect(0, top, FLOOR_W, FLOOR_H - top); ctx.clip()
  ctx.fillStyle = rgba(ROOM.wood)
  ctx.fillRect(0, top, FLOOR_W, FLOOR_H - top)
  // Chevron parquet: columns of slanted planks that meet in soft V's, each plank a slightly different tone.
  const CW = 30, PH = 15
  ctx.lineWidth = 0.9
  for (let col = 0; col * CW < FLOOR_W; col++) {
    const X = col * CW, up = col % 2 === 0
    for (let y0 = top - CW - PH; y0 < FLOOR_H + CW; y0 += PH) {
      const tone = shade(ROOM.wood, r.range(-0.06, 0.1))
      const yl = up ? y0 : y0 - CW, yr = up ? y0 - CW : y0
      ctx.beginPath()
      ctx.moveTo(X, yl); ctx.lineTo(X + CW, yr); ctx.lineTo(X + CW, yr + PH); ctx.lineTo(X, yl + PH); ctx.closePath()
      const pg = ctx.createLinearGradient(X, 0, X + CW, 0)
      pg.addColorStop(0, rgba(shade(tone, up ? 0.05 : -0.01))); pg.addColorStop(1, rgba(shade(tone, up ? -0.01 : 0.05)))
      ctx.fillStyle = pg
      ctx.fill()
      ctx.strokeStyle = 'rgba(160,105,80,0.13)'
      ctx.stroke()
    }
  }
  // A satin sheen that follows the light: brighter at the top left, deeper at the bottom right.
  const lg = ctx.createLinearGradient(0, top, FLOOR_W * 0.8, FLOOR_H)
  lg.addColorStop(0, 'rgba(255,240,225,0.35)')
  lg.addColorStop(0.5, 'rgba(255,240,225,0.05)')
  lg.addColorStop(1, 'rgba(150,80,90,0.16)')
  ctx.fillStyle = lg
  ctx.fillRect(0, top, FLOOR_W, FLOOR_H - top)
  // Contact shadow where the floor meets the back wall and the side walls.
  const ao = ctx.createLinearGradient(0, top, 0, top + 46)
  ao.addColorStop(0, 'rgba(120,60,84,0.32)'); ao.addColorStop(1, 'rgba(120,60,84,0)')
  ctx.fillStyle = ao
  ctx.fillRect(0, top, FLOOR_W, 46)
  const al = ctx.createLinearGradient(WALL_T, 0, WALL_T + 30, 0)
  al.addColorStop(0, 'rgba(120,60,84,0.22)'); al.addColorStop(1, 'rgba(120,60,84,0)')
  ctx.fillStyle = al
  ctx.fillRect(WALL_T, top, 30, FLOOR_H - top)
  const ar = ctx.createLinearGradient(FLOOR_W - WALL_T, 0, FLOOR_W - WALL_T - 30, 0)
  ar.addColorStop(0, 'rgba(120,60,84,0.22)'); ar.addColorStop(1, 'rgba(120,60,84,0)')
  ctx.fillStyle = ar
  ctx.fillRect(FLOOR_W - WALL_T - 30, top, 30, FLOOR_H - top)
  // A doormat inside the door.
  ctx.save()
  ctx.translate(WALL_T + 46, (DOOR_Y0 + DOOR_Y1) / 2 + 4)
  blurred(ctx, 3, () => { ctx.fillStyle = 'rgba(120,60,84,0.25)'; ctx.beginPath(); ctx.roundRect(-40, -24, 84, 52, 12); ctx.fill() })
  ctx.fillStyle = '#f4b9c8'; ctx.beginPath(); ctx.roundRect(-42, -26, 84, 50, 12); ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.setLineDash([4, 3]); ctx.lineWidth = 2
  ctx.beginPath(); ctx.roundRect(-37, -21, 74, 40, 9); ctx.stroke(); ctx.setLineDash([])
  ctx.fillStyle = 'rgba(255,255,255,0.97)'; ctx.font = '600 17px Fredoka, Nunito, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText('hello', 0, -1)
  ctx.restore()
  ctx.restore()
}

function slab(ctx: Ctx, x: number, y: number, w: number, h: number) {
  const g = ctx.createLinearGradient(x, y, x + w, y + h)
  g.addColorStop(0, rgba(shade(ROOM.slab, 0.3))); g.addColorStop(1, rgba(ROOM.slab))
  ctx.fillStyle = g
  ctx.fillRect(x, y, w, h)
  ctx.strokeStyle = rgba(ROOM.slabEdge, 0.9)
  ctx.lineWidth = 1.5
  ctx.strokeRect(x + 0.75, y + 0.75, w - 1.5, h - 1.5)
}

function paintSideWalls(ctx: Ctx) {
  // The tops of the left and right walls; the left one opens for the door.
  slab(ctx, 0, 0, WALL_T, DOOR_Y0)
  slab(ctx, 0, DOOR_Y1, WALL_T, FLOOR_H - DOOR_Y1)
  slab(ctx, FLOOR_W - WALL_T, 0, WALL_T, FLOOR_H)
  // Door frame posts either side of the opening.
  for (const y of [DOOR_Y0 - 6, DOOR_Y1]) {
    ctx.fillStyle = '#f3d2dc'
    ctx.beginPath(); ctx.roundRect(-2, y, WALL_T + 6, 8, 2); ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillRect(-2, y, WALL_T + 6, 1.5)
  }
  // Warm daylight spilling in through the door.
  const dg = ctx.createLinearGradient(0, 0, 90, 0)
  dg.addColorStop(0, 'rgba(255,236,200,0.5)'); dg.addColorStop(1, 'rgba(255,236,200,0)')
  ctx.fillStyle = dg
  ctx.beginPath(); ctx.moveTo(WALL_T, DOOR_Y0); ctx.lineTo(110, DOOR_Y0 + 20); ctx.lineTo(110, DOOR_Y1 + 20); ctx.lineTo(WALL_T, DOOR_Y1); ctx.fill()
}

/** How far the pavement outside the door shows, left of the room. */
export const OUTSIDE_W = 84

/** The street outside the door: warm pavement, a potted flower and the shop's chalkboard. World x from -OUTSIDE_W to 0. */
export function paintOutside(): HTMLCanvasElement {
  const W = OUTSIDE_W
  const [c, ctx] = worldCanvas(W, FLOOR_H)
  // The shop's pink facade above and below the doorway, seen from above as a thick wall.
  ctx.fillStyle = '#f7dde4'; ctx.fillRect(0, 0, W, FLOOR_H)
  // Pavement: soft stone slabs, lit from the top left.
  const g = ctx.createLinearGradient(0, 0, W, FLOOR_H)
  g.addColorStop(0, '#f3ebe4'); g.addColorStop(1, '#e2d6cf')
  ctx.fillStyle = g
  ctx.fillRect(0, WALL_H - 20, W, FLOOR_H - WALL_H + 20)
  ctx.strokeStyle = 'rgba(170,140,130,0.35)'; ctx.lineWidth = 1
  for (let y = WALL_H - 20; y < FLOOR_H; y += 46) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke() }
  for (let y = WALL_H - 20, i = 0; y < FLOOR_H; y += 46, i++) { const x = i % 2 ? 30 : 58; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 46); ctx.stroke() }
  // A soft shade from the building and the awning over the door.
  const sh = ctx.createLinearGradient(W, 0, W - 40, 0)
  sh.addColorStop(0, 'rgba(120,70,90,0.22)'); sh.addColorStop(1, 'rgba(120,70,90,0)')
  ctx.fillStyle = sh; ctx.fillRect(W - 40, 0, 40, FLOOR_H)
  // Awning over the door: blush and cream stripes, scalloped.
  const ay = DOOR_Y0 - 14, ah = DOOR_Y1 - DOOR_Y0 + 28
  blurred(ctx, 4, () => { ctx.fillStyle = 'rgba(120,60,84,0.25)'; ctx.fillRect(W - 40, ay + 6, 36, ah) })
  for (let i = 0; i < 8; i++) { ctx.fillStyle = i % 2 ? '#fff6f0' : '#f59ab7'; ctx.fillRect(W - 44, ay + (i * ah) / 8, 34, ah / 8 + 0.5) }
  ctx.fillStyle = '#f59ab7'
  for (let i = 0; i < 8; i++) { ctx.beginPath(); ctx.arc(W - 44, ay + (i + 0.5) * (ah / 8), ah / 16, Math.PI / 2, Math.PI * 1.5); ctx.fill() }
  // A pot of flowers by the door.
  ctx.save(); ctx.translate(26, DOOR_Y1 + 58)
  blurred(ctx, 3, () => { ctx.fillStyle = 'rgba(110,55,80,0.3)'; ctx.beginPath(); ctx.ellipse(2, 16, 16, 5, 0, 0, Math.PI * 2); ctx.fill() })
  ctx.fillStyle = '#f7b7cc'; ctx.beginPath(); ctx.moveTo(-12, 0); ctx.lineTo(12, 0); ctx.lineTo(9, 16); ctx.lineTo(-9, 16); ctx.fill()
  for (let i = 0; i < 7; i++) { const a = -Math.PI / 2 + (i - 3) * 0.45; blob(ctx, Math.cos(a) * 10, -6 + Math.sin(a) * 9, 7, 6, [126, 188, 150], 1, 0.6) }
  for (const [fx, fy, col] of [[-6, -12, [255, 214, 120]], [5, -15, [247, 150, 180]], [0, -6, [255, 255, 255]]] as [number, number, RGB][]) { for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; blob(ctx, fx + Math.cos(a) * 3, fy + Math.sin(a) * 3, 3, 3, col, 1, 0.7) } blob(ctx, fx, fy, 1.6, 1.6, [240, 180, 60], 1, 0.8) }
  ctx.restore()
  // The chalkboard A-frame, facing the street.
  ctx.save(); ctx.translate(30, DOOR_Y0 - 70)
  blurred(ctx, 3, () => { ctx.fillStyle = 'rgba(110,55,80,0.3)'; ctx.beginPath(); ctx.ellipse(2, 40, 22, 5, 0, 0, Math.PI * 2); ctx.fill() })
  ctx.strokeStyle = '#c9a27a'; ctx.lineWidth = 3; ctx.lineCap = 'round'
  ctx.beginPath(); ctx.moveTo(-16, 40); ctx.lineTo(-11, -18); ctx.moveTo(16, 40); ctx.lineTo(11, -18); ctx.stroke()
  ctx.fillStyle = '#c9a27a'; ctx.beginPath(); ctx.roundRect(-20, -22, 40, 50, 5); ctx.fill()
  ctx.fillStyle = '#4f5d58'; ctx.beginPath(); ctx.roundRect(-17, -19, 34, 44, 3); ctx.fill()
  ctx.fillStyle = '#ffffff'; ctx.font = '600 9px Fredoka, sans-serif'; ctx.textAlign = 'center'
  ctx.fillText('OPEN', 0, -6)
  ctx.fillStyle = '#f7b7cc'; ctx.font = '600 7.5px Fredoka, sans-serif'; ctx.fillText('facials', 0, 5); ctx.fillText('& nails', 0, 14)
  ctx.restore()
  return c
}

/** The front wall's top, drawn over everything so the room reads as a cut-away. */
export function paintFront(): HTMLCanvasElement {
  const [c, ctx] = worldCanvas(FLOOR_W, 24)
  blurred(ctx, 4, () => { ctx.fillStyle = 'rgba(120,60,84,0.3)'; ctx.fillRect(0, 6, FLOOR_W, 8) })
  slab(ctx, 0, 10, FLOOR_W, 14)
  return c
}

/** Sunlight falling from the windows across the floor, to be drawn with an additive blend. */
export function paintLight(): HTMLCanvasElement {
  const [c, ctx] = worldCanvas(FLOOR_W, FLOOR_H)
  blurred(ctx, 18, () => {
    for (const w of WINDOWS) {
      const x0 = w.x - w.w / 2 + 8, x1 = w.x + w.w / 2 - 8
      const g = ctx.createLinearGradient(0, WALL_H, 0, 620)
      g.addColorStop(0, 'rgba(255,196,130,0.16)'); g.addColorStop(1, 'rgba(255,196,130,0)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.moveTo(x0, WALL_H - 2); ctx.lineTo(x1, WALL_H - 2)
      ctx.lineTo(x1 + 150, 600); ctx.lineTo(x0 + 110, 600)
      ctx.closePath(); ctx.fill()
      // The window's shape of light on the wall above the rail.
      const wg = ctx.createRadialGradient(w.x, 60, 10, w.x, 60, 110)
      wg.addColorStop(0, 'rgba(255,220,180,0.06)'); wg.addColorStop(1, 'rgba(255,220,180,0)')
      ctx.fillStyle = wg
      ctx.fillRect(w.x - 120, 110, 240, WALL_H - 110)
    }
  })
  // The key light's warm pool, top left.
  const k = ctx.createRadialGradient(260, 250, 30, 260, 250, 620)
  k.addColorStop(0, 'rgba(255,206,160,0.09)'); k.addColorStop(1, 'rgba(255,206,160,0)')
  ctx.fillStyle = k
  ctx.fillRect(0, 0, FLOOR_W, FLOOR_H)
  return c
}

/** A soft vignette over the whole room, darker in the corners (multiply). */
export function paintVignette(): HTMLCanvasElement {
  const [c, ctx] = worldCanvas(FLOOR_W / 4, FLOOR_H / 4)
  ctx.scale(0.25, 0.25)
  const g = ctx.createRadialGradient(560, 380, 300, 640, 420, 900)
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(236,214,222,1)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, FLOOR_W, FLOOR_H)
  return c
}

/** A GPU texture from a canvas painted at RES, sized in world units, with mipmaps for small screens. */
export function canvasTexture(c: HTMLCanvasElement): Texture {
  return new Texture({ source: new CanvasSource({ resource: c, resolution: RES, autoGenerateMipmaps: true, scaleMode: 'linear' }) })
}
