// Dev page: every seat kind with a modelled person sitting in it, exactly as the floor places them, from the floor's
// camera angle and close up. http://127.0.0.1:5202/dev/seats.html  (window.__seats reports the hip-to-seat gaps.)
import { AmbientLight, Box3, Color, DirectionalLight, Group, OrthographicCamera, Scene, SkinnedMesh, Vector3, WebGLRenderer, NeutralToneMapping, SRGBColorSpace } from 'three'
import { randomLook } from '../src/core/customers.ts'
import { makeRng } from '../src/core/rng.ts'
import { newBuild } from '../src/render3d/furnish.ts'
import { loungeModel, stationModel } from '../src/render3d/model-pieces.ts'
import { furnitureFiles, loadModelFiles } from '../src/render3d/models.ts'
import { loadPeople } from '../src/render3d/people-models.ts'
import { ModelPerson, modelPerson } from '../src/render3d/model-person.ts'
import type { Node3 } from '../src/render3d/furniture.ts'

const read = (f: string) => fetch(`/models/${f}`).then(r => r.arrayBuffer())
const renderer = new WebGLRenderer({ antialias: true })
renderer.setSize(innerWidth, innerHeight)
renderer.outputColorSpace = SRGBColorSpace
renderer.toneMapping = NeutralToneMapping
document.body.appendChild(renderer.domElement)
const scene = new Scene()
scene.background = new Color(0xf3d9e3)
scene.add(new AmbientLight(0xffffff, 1.2))
const key = new DirectionalLight(0xffffff, 2)
key.position.set(-5, 10, 6)
scene.add(key)

await Promise.all([loadModelFiles(furnitureFiles(), read), loadPeople()])
const b = newBuild()
const r = makeRng(Number(new URLSearchParams(location.search).get('seed') ?? 3))
const seats: { name: string; node: Node3; kind: 'chair' | 'stool' | 'pedicure' | 'sofa'; person: ModelPerson }[] = []
const put = (name: string, node: Node3, kind: 'chair' | 'stool' | 'pedicure' | 'sofa') => {
  const p = modelPerson(randomLook(r), 'customer')!
  p.pose = 'sit'; p.seat = kind; p.seatY = node.y
  p.root.position.set(node.x, 0, node.z)
  p.root.rotation.y = node.yaw
  scene.add(p.root)
  seats.push({ name, node, kind, person: p })
}
const f = stationModel(b, 'facial', -3, 0, 0, 1)!; put('facial', f.seat, 'chair')
const n = stationModel(b, 'nails', 0, 0, 0, 1)!; put('nails', n.seat, 'stool')
const pd = stationModel(b, 'feet', 3, 0, 0, 1)!; put('feet', pd.seat, 'pedicure')
const s = loungeModel(b, 0, 2.5, 0, 1)!; put('sofa', s[1], 'sofa')
scene.add(b.kit.build(false))

// The floor's camera: yaw -45, pitch 35, orthographic.
const cam = new OrthographicCamera(-1, 1, 1, -1, 0.1, 200)
const zoom = Number(new URLSearchParams(location.search).get('zoom') ?? 4.2)
const target = new Vector3(Number(new URLSearchParams(location.search).get('x') ?? 0), 0.6, Number(new URLSearchParams(location.search).get('z') ?? 1))
const place = () => {
  const a = innerWidth / innerHeight
  cam.left = -zoom * a; cam.right = zoom * a; cam.top = zoom; cam.bottom = -zoom
  const yaw = -Math.PI / 4, pitch = (35 * Math.PI) / 180
  cam.position.set(target.x + Math.sin(yaw) * Math.cos(pitch) * 50, target.y + Math.sin(pitch) * 50, target.z + Math.cos(yaw) * Math.cos(pitch) * 50)
  cam.lookAt(target); cam.updateProjectionMatrix()
}
place()
let last = performance.now()
const tick = (now: number) => { const dt = Math.min(0.05, (now - last) / 1000); last = now; for (const s of seats) s.person.update(dt); renderer.render(scene, cam); requestAnimationFrame(tick) }
requestAnimationFrame(tick)

// Hip height over the seat node after the clips settle.
;(window as unknown as Record<string, unknown>).__seats = () => seats.map(s => {
  const hips = new Vector3()
  s.person.root.traverse(o => { if (o.name === 'pelvis') o.getWorldPosition(hips) })
  const box = new Box3()
  s.person.root.traverse(o => { if ((o as SkinnedMesh).isSkinnedMesh) box.expandByObject(o) })
  return `${s.name}: node y ${s.node.y.toFixed(2)} hips (${hips.x.toFixed(2)}, ${hips.y.toFixed(2)}, ${hips.z.toFixed(2)}) node (${s.node.x.toFixed(2)}, ${s.node.z.toFixed(2)})`
}).join('\n')
void Group
