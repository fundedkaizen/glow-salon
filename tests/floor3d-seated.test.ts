import './dom-stub.ts'
import { check } from './harness.ts'
import { readFileSync } from 'node:fs'
import { Box3, Triangle, Vector3, type Object3D } from 'three'
import { randomLook } from '../src/core/customers.ts'
import type { StationKind } from '../src/core/economy.ts'
import { withFigure } from '../src/core/figure.ts'
import { makeRng } from '../src/core/rng.ts'
import { newBuild } from '../src/render3d/furnish.ts'
import type { Node3 } from '../src/render3d/furniture.ts'
import { PARTS, type PartBox } from '../src/render3d/kit.ts'
import { loungeModel, stationModel } from '../src/render3d/model-pieces.ts'
import { modelPerson, type ModelPerson } from '../src/render3d/model-person.ts'
import { furnitureFiles, loadModelFiles } from '../src/render3d/models.ts'
import { loadPeople } from '../src/render3d/people-models.ts'
import { withoutImages } from './glb.ts'

/**
 * Seated people, posed by the real clips on the real models: a customer sits in every seat (the facial recliner,
 * the nail stool, the pedicure throne, the sofa) as the floor seats them, after a wave and a word on the way (the
 * one-shots that once left a customer floating above her chair with her arms spread). Her hips must land on the seat
 * node (within 3 cm), and no bone of her posed body may sink into the furniture (a magnifier pole through her, say):
 * each bone is a capsule a little slimmer than the body, and it may touch a surface by up to 3 cm, no deeper. The
 * hips and legs may rest on whatever holds them up (anything up to 10 cm above the hips); the back, arms and head
 * are checked against everything, though an arm may lie on a surface that faces up (an armrest, a reclined back).
 */
const SLACK = 0.03

/** The body as capsules between joints (radius a little under the modelled body's). */
const CAPSULES: [string, string, number][] = [
  ['pelvis', 'spine_02', 0.08], ['spine_02', 'neck_01', 0.08], ['neck_01', 'Head', 0.045],
  ['upperarm_l', 'lowerarm_l', 0.035], ['lowerarm_l', 'hand_l', 0.03], ['upperarm_r', 'lowerarm_r', 0.035], ['lowerarm_r', 'hand_r', 0.03],
  ['thigh_l', 'calf_l', 0.055], ['calf_l', 'foot_l', 0.04], ['thigh_r', 'calf_r', 0.055], ['calf_r', 'foot_r', 0.04],
]

function bones(root: Object3D): Record<string, Vector3> {
  root.updateMatrixWorld(true)
  const out: Record<string, Vector3> = {}
  root.traverse(o => { if ((o as { isBone?: boolean }).isBone) out[o.name] = o.getWorldPosition(new Vector3()) })
  return out
}

/** How deep a posed body sinks into the parts (0 when it only touches them), and where. */
function sink(person: ModelPerson, parts: PartBox[], node: Node3): { depth: number; where: string } {
  const b = bones(person.root)
  const tris: Triangle[] = []
  const reach = new Box3()
  for (const v of Object.values(b)) reach.expandByPoint(v)
  reach.expandByScalar(0.3)
  for (const p of parts) {
    if (!p.box.intersectsBox(reach)) continue
    const pos = p.geo.getAttribute('position')
    for (let i = 0; i + 2 < pos.count; i += 3) tris.push(new Triangle(new Vector3().fromBufferAttribute(pos, i), new Vector3().fromBufferAttribute(pos, i + 1), new Vector3().fromBufferAttribute(pos, i + 2)))
  }
  let depth = 0, where = ''
  const q = new Vector3(), c = new Vector3()
  const nrm = new Vector3()
  const test = (pt: Vector3, r: number, name: string, rests: 'legs' | 'arms' | null) => {
    for (const t of tris) {
      t.closestPointToPoint(pt, c)
      // What the hips and legs rest on (the seat, its front edge, a leg rest, the foot basin, the floor: anything up to
      // 10 cm above the hips) is an intended contact; the upper body is checked against everything.
      if (rests === 'legs' && c.y < node.y + 0.1) continue
      t.getNormal(nrm)
      // Arms may lie on what faces up (an armrest, the reclined back); a pole or an edge through them may not.
      if (rests === 'arms' && nrm.y > 0.3) continue
      const d = r - c.distanceTo(pt)
      if (d > depth) { depth = d; where = `${name} at (${(c.x - node.x).toFixed(2)}, ${(c.y - node.y).toFixed(2)}, ${(c.z - node.z).toFixed(2)}) n.y ${nrm.y.toFixed(2)}` }
    }
  }
  for (const [a, e, r] of CAPSULES) {
    if (!b[a] || !b[e]) continue
    const n = Math.max(2, Math.ceil(b[a].distanceTo(b[e]) / 0.03))
    for (let i = 0; i <= n; i++) test(q.lerpVectors(b[a], b[e], i / n).clone(), r, `${a}-${e}`, a === 'pelvis' || a.startsWith('thigh') || a.startsWith('calf') ? 'legs' : /arm/.test(a) ? 'arms' : null)
  }
  // The big cartoon head: a ball a little smaller than it, above the head joint.
  if (b.Head) test(b.Head.clone().add(new Vector3(0, 0.14, 0)), 0.11, 'head', null)
  return { depth, where }
}

function seatAndPose(node: Node3, kind: 'chair' | 'stool' | 'pedicure' | 'sofa', masc: boolean, seed: number): ModelPerson {
  const r = makeRng(seed)
  const look = withFigure(randomLook(r, { gender: masc ? 'male' : 'female' }), masc ? 'Tom' : 'Ann', null, seed)
  const p = modelPerson(look, 'customer')!
  // On the way in: a wave and a word, then straight into the seat.
  p.root.position.set(node.x - 0.8, 0, node.z + 0.5)
  p.pose = 'stand'
  p.greet()
  for (let i = 0; i < 10; i++) p.update(1 / 30)
  p.root.position.set(node.x, 0, node.z)
  p.root.rotation.y = node.yaw
  p.pose = 'sit'; p.seat = kind; p.seatY = node.y
  for (let i = 0; i < 90; i++) p.update(1 / 30)
  return p
}

export async function run() {
  const read = async (file: string) => { const b = readFileSync(`public/models/${file}`); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer }
  await loadModelFiles(furnitureFiles(), read)
  const files = await loadPeople(async file => withoutImages(readFileSync(`public/models/${file}`)))
  check('seated: the people load', !!files)
  if (!files) return
  const seats: { name: string; kind: 'chair' | 'stool' | 'pedicure' | 'sofa'; node: Node3; parts: PartBox[] }[] = []
  for (const [kind, seatKind] of [['facial', 'chair'], ['nails', 'stool'], ['feet', 'pedicure']] as [StationKind, 'chair' | 'stool' | 'pedicure'][]) {
    for (const tier of [1, 3]) for (const style of [0, 1, 2]) {
      PARTS.on = true; PARTS.list = []
      const nodes = stationModel(newBuild(), kind, 0, 0, style, tier)
      PARTS.on = false
      if (nodes) seats.push({ name: `${kind} style ${style} tier ${tier}`, kind: seatKind, node: nodes.seat, parts: PARTS.list })
    }
  }
  PARTS.on = true; PARTS.list = []
  const sofa = loungeModel(newBuild(), 0, 0.8, 0, 1)
  PARTS.on = false
  if (sofa) sofa.forEach((node, i) => seats.push({ name: `sofa seat ${i}`, kind: 'sofa', node, parts: PARTS.list }))
  check('seated: every seat builds from its model', seats.length === 18 + 4, seats.length)
  // Nobody glides: a person who starts walking mid-gesture (a wave, a word) walks at once.
  {
    const p = modelPerson(randomLook(makeRng(4)), 'player')!
    p.pose = 'stand'
    for (let i = 0; i < 5; i++) p.update(1 / 30)
    p.greet()
    for (let i = 0; i < 3; i++) p.update(1 / 30)
    p.pose = 'walk'; p.speed = 3
    for (let i = 0; i < 9; i++) p.update(1 / 30)
    const walk = (p as unknown as { actions: Map<string, { getEffectiveWeight(): number; isRunning(): boolean }> }).actions.get('walk')!
    check('walking: a wave never keeps a walker gliding (the walk clip takes over within 0.3 s)', walk.isRunning() && walk.getEffectiveWeight() > 0.9, walk.getEffectiveWeight())
    p.destroy()
  }
  const gaps: string[] = [], sinks: string[] = []
  for (const s of seats) for (const masc of [false, true]) {
    const p = seatAndPose(s.node, s.kind, masc, 7)
    const b = bones(p.root)
    const hips = b.pelvis
    const off = Math.hypot(hips.x - s.node.x, hips.z - s.node.z), dy = Math.abs(hips.y - s.node.y)
    if (off > SLACK || dy > SLACK) gaps.push(`${s.name} (${masc ? 'masc' : 'fem'}): hips ${dy.toFixed(3)} m off the seat height, ${off.toFixed(3)} m off its spot`)
    const k = sink(p, s.parts, s.node)
    if (k.depth > SLACK) sinks.push(`${s.name} (${masc ? 'masc' : 'fem'}): ${k.where} ${k.depth.toFixed(3)} m into the furniture`)
    p.destroy()
  }
  check('seated: hips sit on the seat (within 3 cm)', gaps.length === 0, gaps.slice(0, 6))
  if (process.env.SEAT_DEBUG) console.log(sinks.join(' | '))
  check('seated: no posed body sinks into its furniture (more than 3 cm)', sinks.length === 0, sinks.slice(0, 8))
}
