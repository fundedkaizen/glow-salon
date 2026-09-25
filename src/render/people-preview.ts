import { Container, Graphics, Text, type Application } from 'pixi.js'
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
 */
export function peoplePreview(app: Application, params: URLSearchParams) {
  const zoom = Number(params.get('zoom') ?? 3)
  const seed = Number(params.get('seed') ?? 3)
  const pose = params.get('pose') as Pose | null
  const root = new Container()
  app.stage.addChild(root)
  const bg = new Graphics().rect(0, 0, 4000, 3000).fill(0xf6e3d6)
  root.addChild(bg)
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
    root.addChild(p.root)
    const label = new Text({ text: c.label, style: { fontFamily: 'Nunito, sans-serif', fontSize: 11, fontWeight: '700', fill: 0x8a6a80 } })
    label.anchor.set(0.5, 0)
    label.position.set(x, y + 4 * zoom)
    root.addChild(label)
    people.push(p)
  })
  app.ticker.add(t => { for (const p of people) p.update(Math.min(0.05, t.deltaMS / 1000)) })
}
