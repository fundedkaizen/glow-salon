// Imports use full CDN URLs (the index.html import map resolves the addons' own bare 'three'), so Vite leaves
// them alone and the worktree needs no three.js install.
// A tiny three.js viewer for every model in src/art3d/catalog.ts: proves each .glb loads (meshopt and all), shows it
// from the floor camera's angle (yaw 45, pitch 35, orthographic), plays the people's clips, and previews the grey
// "ghost" look A uses for items not yet bought. Served by Vite from the worktree root:
//   npx vite --host 127.0.0.1 --port 5203 --strictPort   then open /assets-src/viewer/
// window.__viewer reports { loaded, failed, clips } for scripted checks.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.module.js'
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.186.1/examples/jsm/loaders/GLTFLoader.js'
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.186.1/examples/jsm/controls/OrbitControls.js'
import { MeshoptDecoder } from 'https://cdn.jsdelivr.net/npm/three@0.186.1/examples/jsm/libs/meshopt_decoder.module.js'
import * as SkeletonUtils from 'https://cdn.jsdelivr.net/npm/three@0.186.1/examples/jsm/utils/SkeletonUtils.js'
import { MODELS, PEOPLE } from '/src/art3d/catalog.ts'

const app = document.getElementById('app')
const status = document.getElementById('status')
const viewSel = document.getElementById('view')
const clipSel = document.getElementById('clip')
const report = { loaded: [], failed: [], clips: {} }
window.__viewer = report

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(Math.min(2, devicePixelRatio))
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.05
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
app.appendChild(renderer.domElement)

const scene = new THREE.Scene()
scene.background = new THREE.Color(0xf4e9e2)
scene.add(new THREE.HemisphereLight(0xfff4ee, 0xc9a48e, 1.4))
const sun = new THREE.DirectionalLight(0xfff1e0, 2.4)
sun.position.set(-4, 8, 5)
sun.castShadow = true
sun.shadow.mapSize.set(2048, 2048)
Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 0.5, far: 40 })
sun.shadow.radius = 4
scene.add(sun)
const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: 0xe8c9ae, roughness: 0.8 }))
ground.rotation.x = -Math.PI / 2
ground.receiveShadow = true
scene.add(ground)

// The floor camera: yaw 45, pitch 35, orthographic.
const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 200)
const yaw = THREE.MathUtils.degToRad(45), pitch = THREE.MathUtils.degToRad(35)
function aim(target, span) {
  const d = 40
  camera.position.set(target.x + Math.sin(yaw) * Math.cos(pitch) * d, target.y + Math.sin(pitch) * d, target.z + Math.cos(yaw) * Math.cos(pitch) * d)
  controls.target.copy(target)
  camera.userData.span = span
  resize()
}
const controls = new OrbitControls(camera, renderer.domElement)
function resize() {
  const w = innerWidth, h = innerHeight, s = (camera.userData.span || 8) / 2, a = w / h
  camera.left = -s * a; camera.right = s * a; camera.top = s; camera.bottom = -s
  camera.updateProjectionMatrix()
  renderer.setSize(w, h)
}
addEventListener('resize', resize)

const loader = new GLTFLoader()
loader.setMeshoptDecoder(MeshoptDecoder)
const cache = new Map()
function load(file) {
  if (!cache.has(file)) {
    cache.set(file, loader.loadAsync('/models/' + file).then(g => { report.loaded.push(file); return g }, e => { report.failed.push(file + ': ' + e.message); throw e }))
  }
  return cache.get(file)
}

const world = new THREE.Group()
scene.add(world)
const mixers = []
let ghost = false

function shadowsOn(o) { o.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true } }) }

function applyGhost(root) {
  root.traverse(m => {
    if (!m.isMesh) return
    if (!m.userData.mats) m.userData.mats = m.material
    m.material = ghost ? new THREE.MeshStandardMaterial({ color: 0xd8d4d6, roughness: 0.9, transparent: true, opacity: 0.55, vertexColors: false }) : m.userData.mats
  })
}

// A sample Look, tinted the way the floor engine does it: by material name.
const LOOKS = [
  { Skin: 0xf3ccb2, Hair: 0x523428, Top: 0xf7b7c9, Bottom: 0x6e8ec4, Shoes: 0xfafafc, Shirt: 0xfcf6ec, Detail: 0xcdbdf2, Accessory: 0xa9e3cf },
  { Skin: 0x9e6846, Hair: 0x30242a, Top: 0xa9e3cf, Bottom: 0x565470, Shoes: 0x46343a, Shirt: 0xfcf6ec, Detail: 0xfbd9a0, Accessory: 0xf5a99a },
  { Skin: 0xe6b490, Hair: 0xe0ba76, Top: 0xcdbdf2, Bottom: 0xc4aa80, Shoes: 0xc8788c, Shirt: 0xfcf6ec, Detail: 0x9fd0f2, Accessory: 0xf7b7c9 },
  { Skin: 0xcc926a, Hair: 0xa84c30, Top: 0xfbd9a0, Bottom: 0x6e8ec4, Shoes: 0xfafafc, Shirt: 0xfcf6ec, Detail: 0xf5a99a, Accessory: 0xb6e39c },
]
function tint(root, look) {
  root.traverse(m => {
    if (!m.isMesh) return
    const mats = Array.isArray(m.material) ? m.material : [m.material]
    m.material = mats.map(mt => {
      const c = look[mt.name]
      if (c === undefined) return mt
      const n = mt.clone(); n.color.setHex(c); return n
    })
    if (m.material.length === 1) m.material = m.material[0]
  })
}

async function person(kind, parts, look, clip, x, z, rot = 0) {
  const g = await load(PEOPLE.files[kind])
  const root = SkeletonUtils.clone(g.scene)
  const keep = new Set(parts)
  // show or hide each named part node: a part's meshes (one per material) hang under it, possibly in nested groups
  const PART = /^(outfit_|hair_|bow_|flower_|head_|glasses$|eyes$|brows$)/
  root.traverse(o => { if (PART.test(o.name)) o.visible = keep.has(o.name) })
  tint(root, look)
  shadowsOn(root)
  root.position.set(x, 0, z)
  root.rotation.y = rot
  const mixer = new THREE.AnimationMixer(root)
  const c = THREE.AnimationClip.findByName(g.animations, clip)
  report.clips[kind] = g.animations.map(a => a.name)
  if (c) mixer.clipAction(c).play()
  if (PEOPLE.seatedClips.includes(clip)) root.position.y = 0.45
  mixers.push(mixer)
  world.add(root)
  return root
}

async function showPeople() {
  const clip = clipSel.value || 'idle'
  const cast = [
    ['fem', 'dress', 'long', 'bow'], ['masc', 'suit', 'crop', 'glasses'], ['fem', 'player', 'ponytail', null], ['fem', 'cardigan', 'bun', 'glasses'],
    ['masc', 'hoodie', 'curly', null], ['fem', 'scrubs', 'braids', null], ['fem', 'dungarees', 'bob', 'flower'], ['masc', 'jacket', 'bun', null],
    ['fem', 'sporty', 'curly', null], ['masc', 'chef', 'crop', null], ['fem', 'jumper', 'bob', null],
  ]
  const n = cast.length
  await Promise.all(cast.map(([kind, outfit, hair, acc], i) => {
    const parts = [`outfit_${outfit}`, `head_${kind}`, `hair_${hair}`]
    if (acc) parts.push(acc === 'glasses' ? 'glasses' : `${acc}_${hair}`)
    const t = (i - (n - 1) / 2) * 0.62
    return person(kind, parts, LOOKS[i % LOOKS.length], clip, t * 0.7071, t * 0.7071 * -1 + 0, -0.3)
  }))
  aim(new THREE.Vector3(0, 0.8, 0), 4.2)
}

async function showModels(filter) {
  const list = MODELS.filter(filter)
  const cols = Math.ceil(Math.sqrt(list.length * 1.6))
  let x = 0, z = 0, rowDepth = 0
  const placed = []
  for (const [i, m] of list.entries()) {
    const files = [m.file, ...(m.styles || []).filter(s => s.file && s.file !== m.file).map(s => s.file)]
    for (const f of files) {
      try {
        const g = await load(f)
        const root = g.scene.clone(true)
        shadowsOn(root)
        applyGhost(root)
        const w = Math.max(m.footprint[0], 0.6), d = Math.max(m.footprint[1], 0.6)
        root.position.set(x + w / 2, 0, z + d / 2)
        world.add(root)
        placed.push(root)
        x += w + 0.4
        rowDepth = Math.max(rowDepth, d)
      } catch { /* reported */ }
      if ((placed.length % cols) === 0) { x = 0; z += rowDepth + 0.5; rowDepth = 0 }
    }
  }
  const box = new THREE.Box3().setFromObject(world)
  const c = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())
  aim(c, Math.max(size.x, size.z) * 0.9 + 1)
}

async function show(v) {
  world.clear()
  mixers.length = 0
  status.textContent = 'loading...'
  if (v === 'people') await showPeople()
  else await showModels(m => v === 'all' || m.kind === v)
  status.textContent = `${report.loaded.length} loaded, ${report.failed.length} failed` + (report.failed.length ? ': ' + report.failed.join('; ') : '')
  status.className = report.failed.length ? 'bad' : ''
}

const kinds = ['people', 'all', ...new Set(MODELS.map(m => m.kind))]
for (const k of kinds) viewSel.add(new Option(k, k))
for (const c of PEOPLE.animations) clipSel.add(new Option(c, c))
const q = new URLSearchParams(location.search)
viewSel.value = q.get('view') || 'people'
clipSel.value = q.get('clip') || 'idle'
viewSel.onchange = () => show(viewSel.value)
clipSel.onchange = () => show(viewSel.value)
document.getElementById('ghost').onclick = () => { ghost = !ghost; world.children.forEach(applyGhost) }

const clock = new THREE.Clock()
renderer.setAnimationLoop(() => {
  const dt = clock.getDelta()
  for (const m of mixers) m.update(dt)
  controls.update()
  renderer.render(scene, camera)
})
resize()
show(viewSel.value)
