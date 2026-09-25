import { Container, Graphics, Sprite, Text, type Application } from 'pixi.js'
import { paintGift } from '../art/salon/gift-art.ts'
import { canvasTexture } from '../art/salon/room.ts'
import { REGULARS_DATA } from '../content/regulars.ts'
import { randomLook, type Look } from '../core/customers.ts'
import { makeRng } from '../core/rng.ts'
import { PLAYER_COLORS } from '../art/palette.ts'
import { Person, type Pose } from './floor-person.ts'

/**
 * A dev view of the floor people (`?view=people`): a lineup at a large zoom, for judging proportions, faces,
 * hair and outfits side by side. Rows: players and staff; then customers of many archetypes, every hair style.
 *
 *   &zoom=N    how large (default 3)
 *   &pose=walk|stand|sit|work   one pose for everyone (default: a mix)
 *   &seed=N    other customers
 *   &gifts     the regulars' gift pieces instead, each with its giver's name
 */
export function peoplePreview(app: Application, params: URLSearchParams) {
  const zoom = Number(params.get('zoom') ?? 3)
  const seed = Number(params.get('seed') ?? 3)
  const pose = params.get('pose') as Pose | null
  const root = new Container()
  app.stage.addChild(root)
  const bg = new Graphics().rect(0, 0, 4000, 3000).fill(0xf6e3d6)
  root.addChild(bg)
  if (params.has('gifts')) {
    const cols = Math.max(4, Math.floor(app.screen.width / (80 * zoom * 0.7)))
    REGULARS_DATA.regulars.forEach((reg, i) => {
      const p = paintGift(reg.id)
      if (!p) return
      const s = new Sprite(canvasTexture(p.canvas))
      s.anchor.set(p.ax / p.w, p.ay / p.h)
      const x = (i % cols) * 80 * zoom * 0.7 + 40 * zoom * 0.7, y = Math.floor(i / cols) * 100 * zoom * 0.7 + 86 * zoom * 0.7
      s.position.set(x, y); s.scale.set(zoom * 0.7)
      const label = new Text({ text: reg.id, style: { fontFamily: 'Nunito, sans-serif', fontSize: 11, fontWeight: '700', fill: 0x8a6a80 } })
      label.anchor.set(0.5, 0); label.position.set(x, y + 4)
      root.addChild(s, label)
    })
    return
  }
  const people: Person[] = []
  const archetypes = ['student', 'businessman', 'grandma', 'athlete', 'nurse', 'chef', 'rocker', 'bride', 'farmer', 'gamer', 'teacher', 'grandpa', 'influencer', 'pilot']
  const r = makeRng(seed)
  const cells: { look: Look; role: 'player' | 'staff' | 'customer'; tint?: number; arch?: string; label: string }[] = []
  for (let i = 0; i < 4; i++) cells.push({ look: { ...randomLook(r, { gender: i % 2 ? 'male' : 'female', age: 'adult' }), hairStyle: i * 2 }, role: 'player', tint: PLAYER_COLORS[i], label: `player ${i + 1}` })
  for (let i = 0; i < 3; i++) cells.push({ look: { ...randomLook(r, { gender: i === 1 ? 'male' : 'female', age: 'adult' }), hairStyle: 1 + i * 2 }, role: 'staff', label: 'staff' })
  archetypes.forEach((arch, i) => {
    const gender = arch === 'businessman' || arch === 'grandpa' || arch === 'pilot' ? 'male' : arch === 'grandma' || arch === 'bride' ? 'female' : i % 3 === 1 ? 'male' : 'female'
    const age = arch === 'grandma' || arch === 'grandpa' ? 'older' : arch === 'student' || arch === 'gamer' ? 'young' : 'adult'
    cells.push({ look: { ...randomLook(r, { gender, age }), hairStyle: i % 7 }, role: 'customer', arch, label: arch })
  })
  const cols = Math.max(4, Math.floor(app.screen.width / (40 * zoom)))
  cells.forEach((c, i) => {
    const p = new Person(c.look, c.role, c.tint, c.arch)
    const x = (i % cols) * 40 * zoom + 24 * zoom, y = Math.floor(i / cols) * 118 * zoom + 108 * zoom
    p.root.position.set(x, y)
    p.root.scale.set(zoom)
    p.pose = pose ?? (['stand', 'walk', 'stand', 'work', 'sit'] as Pose[])[i % 5]
    p.facing = i % 4 === 3 ? -1 : 1
    p.tool = (['brush', 'file', 'footBrush'] as const)[i % 3]
    root.addChild(p.root)
    const label = new Text({ text: c.label, style: { fontFamily: 'Nunito, sans-serif', fontSize: 11, fontWeight: '700', fill: 0x8a6a80 } })
    label.anchor.set(0.5, 0)
    label.position.set(x, y + 4 * zoom)
    root.addChild(label)
    people.push(p)
  })
  app.ticker.add(t => { for (const p of people) p.update(Math.min(0.05, t.deltaMS / 1000)) })
}
