import { Container, Graphics, Sprite, Text } from 'pixi.js'
import { treatmentIcon } from '../art/salon/icons.ts'

/**
 * What floats over the 3D salon, drawn by Pixi on top of it exactly as on the 2D floor: name tags, the mood
 * bubbles with their rings, the "still waiting" dots, speech lines, station labels and the prompt pill. Each is
 * positioned every frame from a projected 3D point.
 */
export const TAG_FONT = 'Nunito, system-ui, sans-serif'

export function nameTag(name: string, color: number, me: boolean, role = ''): Container {
  const c = new Container()
  const t = new Text({ text: name, style: { fontFamily: TAG_FONT, fontSize: 13, fontWeight: '800', fill: 0xffffff }, resolution: 3 })
  t.anchor.set(0.5)
  const extra = role ? new Text({ text: role, style: { fontFamily: TAG_FONT, fontSize: 9, fontWeight: '800', fill: color }, resolution: 3 }) : null
  const w = t.width + 18 + (extra ? extra.width + 10 : 0)
  const bg = new Graphics()
  bg.roundRect(-w / 2, -11, w, 22, 11).fill({ color }).stroke({ width: me ? 2.5 : 1.5, color: 0xffffff })
  bg.poly([-4, 10, 4, 10, 0, 15]).fill({ color })
  c.addChild(bg, t)
  if (extra) {
    t.x = -w / 2 + 9 + t.width / 2
    const pill = new Graphics()
    const ex = w / 2 - 7 - extra.width / 2
    pill.roundRect(ex - extra.width / 2 - 4, -7, extra.width + 8, 14, 7).fill({ color: 0xffffff })
    extra.anchor.set(0.5)
    extra.position.set(ex, 0)
    c.addChild(pill, extra)
  }
  return c
}

export function speech(text: string): Container {
  const c = new Container()
  const t = new Text({ text, style: { fontFamily: TAG_FONT, fontSize: 13, fontWeight: '700', fill: 0x5a3a52, wordWrap: true, wordWrapWidth: 190, align: 'left', lineHeight: 17 }, resolution: 3 })
  const w = Math.min(210, t.width + 22), h = t.height + 16
  t.position.set(-w / 2 + 11, -h + 8)
  const bg = new Graphics()
  bg.roundRect(-w / 2, -h, w, h, 14).fill({ color: 0xffffff }).stroke({ width: 1.6, color: 0xf7c6d4 })
  bg.poly([-10, -1, 2, -1, -12, 10]).fill({ color: 0xffffff })
  c.addChild(bg, t)
  return c
}

/** A customer's bubble: what they came for, with a ring for their mood. */
export function moodBubble(treatment: string): { bubble: Container; ring: Graphics; icon: Sprite } {
  const bubble = new Container()
  const bg = new Graphics()
  bg.roundRect(-19, -19, 38, 34, 15).fill({ color: 0xffffff }).stroke({ width: 1.4, color: 0xe9c2d0 })
  bg.poly([-5, 14, 5, 14, 0, 21]).fill({ color: 0xffffff })
  const ring = new Graphics()
  const icon = new Sprite(treatmentIcon(treatment))
  icon.anchor.set(0.5); icon.scale.set(0.82); icon.y = -2
  bubble.addChild(bg, ring, icon)
  bubble.scale.set(0)
  return { bubble, ring, icon }
}

/** Three soft dots: nobody is looking after this customer yet. */
export function waitDots(): Container {
  const dots = new Container()
  dots.addChild(new Graphics().roundRect(-17, -9, 34, 18, 9).fill({ color: 0xffffff, alpha: 0.95 }).stroke({ width: 1.2, color: 0xe9c2d0 }))
  for (let k = 0; k < 3; k++) { const dot = new Graphics().circle(0, 0, 3).fill({ color: 0xc58aa4 }); dot.x = -9 + k * 9; dots.addChild(dot) }
  dots.visible = false
  return dots
}

/** A staff member's "what I am doing" bubble. */
export function toolBubble(): { root: Container; icon: Sprite } {
  const root = new Container()
  const tb = new Graphics().roundRect(-17, -17, 34, 32, 14).fill({ color: 0xffffff }).stroke({ width: 1.4, color: 0xbfeadb })
  tb.poly([-5, 14, 5, 14, 0, 20]).fill({ color: 0xffffff })
  const icon = new Sprite(treatmentIcon('facial')); icon.anchor.set(0.5); icon.scale.set(0.72); icon.y = -1
  root.addChild(tb, icon)
  root.visible = false
  return { root, icon }
}
