import { CanvasTexture, Color, DoubleSide, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, Quaternion, Vector3 } from 'three'
import { G, Kit, piece, shade, tf } from './kit.ts'
import { outsideItems, STREET, type OutsideItem } from './layout.ts'
import { ROOM3 } from './mapping.ts'
import { pavingTexture, tex } from './textures.ts'

/**
 * The street-front garden, built from the layout's outside items (layout.ts) so the validator checks what shows:
 * flower beds, topiaries flanking the door, pavers to the gate, a bench and a lamp post,
 * round trees, stepping stones, a low fence with gold caps, the lit salon sign, a mailbox, the kerbed pavement
 * with streetlamps and a bike, and a hint of road. Static pieces merge into a few meshes; the tree canopies and two
 * butterflies are instanced so they can sway and flutter for the cost of two draw calls.
 */
const LEAF = [0x7cc06e, 0x62ad5c, 0x8fcf7c, 0x6fb865]
const FLOWERS = [0xf48fb1, 0xffffff, 0xf7b7cc, 0xffd35a, 0xcdbdf2, 0xf5a99a]
const GOLD = 0xe6bd6a

export type Garden = { group: Group; update: (t: number) => void; setName: (name: string) => void }

export function buildGarden(): Garden {
  const group = new Group()
  group.name = 'garden'
  const { w: W, d: D, wallT: T } = ROOM3
  const kit = new Kit()
  const items = outsideItems()
  let s = 7
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647 }

  // ---- ground: lawn with gentle colour, the pavement and kerb, the road
  const lawn = new Mesh(new PlaneGeometry(90, 90), new MeshStandardMaterial({ map: lawnVaried(), roughness: 1 }))
  ;(lawn.material as MeshStandardMaterial).map!.repeat.set(9, 9)
  lawn.rotation.x = -Math.PI / 2
  lawn.position.set(-8, -0.06, D / 2 + 4)
  lawn.receiveShadow = true
  group.add(lawn)
  const pave = pavingTexture()
  pave.repeat.set(3, 40)
  const paveW = STREET.paveIn - STREET.paveOut
  const pavement = new Mesh(new PlaneGeometry(paveW, 60), new MeshStandardMaterial({ map: pave, roughness: 0.9 }))
  pavement.rotation.x = -Math.PI / 2
  pavement.position.set((STREET.paveIn + STREET.paveOut) / 2, -0.03, D / 2)
  pavement.receiveShadow = true
  group.add(pavement)
  piece('ground', () => kit.add(G.box(0.16, 0.14, 60, 0.03), 0xd9d2d6, 'matte', tf(STREET.paveOut - 0.08, -0.02, D / 2)))
  const road = new Mesh(new PlaneGeometry(STREET.paveOut - STREET.roadOut, 60), new MeshStandardMaterial({ color: 0x8c8594, roughness: 0.95 }))
  road.rotation.x = -Math.PI / 2
  road.position.set((STREET.paveOut + STREET.roadOut) / 2, -0.08, D / 2)
  road.receiveShadow = true
  group.add(road)
  piece('ground', () => {
    for (let z = -24; z < 30; z += 3) kit.add(G.box(0.14, 0.01, 1.4, 0.004), 0xf5f1e8, 'matte', tf(STREET.paveOut - 3.2, -0.07, z))
    // The salon's plinth.
    kit.add(G.box(W + 2 * T + 0.3, 0.1, D + 2 * T + 0.3, 0.03), 0xe9dcd6, 'matte', tf(0, -0.05, D / 2))
  })

  // ---- the pieces
  const canopies: { x: number; y: number; z: number; r: number; c: number }[] = []
  let signAt: OutsideItem | null = null
  for (const it of items) piece(it.id, () => {
    const x = (it.x0 + it.x1) / 2, z = (it.z0 + it.z1) / 2, w = it.x1 - it.x0, d = it.z1 - it.z0
    switch (it.kind) {
      case 'bed': {
        kit.add(G.box(w, 0.24, d, 0.06), 0xfff4ee, 'satin', tf(x, 0.12, z))
        kit.add(G.box(w - 0.12, 0.08, d - 0.12, 0.03), 0x6a4a3e, 'matte', tf(x, 0.21, z))
        const n = Math.floor(w * d * 6)
        for (let i = 0; i < n; i++) {
          const fx = x + (rnd() - 0.5) * (w - 0.25), fz = z + (rnd() - 0.5) * (d - 0.25)
          const r = 0.1 + rnd() * 0.09
          kit.add(G.sphere(r, 6), LEAF[Math.floor(rnd() * 4)], 'matte', tf(fx, 0.28 + r * 0.5, fz, 0, 0, 0, 1, 0.8, 1))
          if (rnd() < 0.8) kit.add(G.sphere(0.035 + rnd() * 0.025, 5), FLOWERS[Math.floor(rnd() * FLOWERS.length)], 'matte', tf(fx + (rnd() - 0.5) * 0.1, 0.36 + r, fz + (rnd() - 0.5) * 0.1))
        }
        break
      }
      case 'topiary':
        kit.add(G.lathe('gpot', [[0, 0], [0.18, 0], [0.22, 0.4], [0.24, 0.43], [0, 0.43]], 12), 0xf6efe9, 'gloss', tf(x, 0, z))
        kit.add(G.torus(0.23, 0.02, Math.PI * 2, 14), GOLD, 'metal', tf(x, 0.42, z, Math.PI / 2, 0, 0))
        kit.add(G.cyl(0.025, 0.025, 0.4, 6), 0x9c6f52, 'matte', tf(x, 0.62, z))
        kit.add(G.sphere(0.26, 10), LEAF[1], 'satin', tf(x, 0.95, z))
        kit.add(G.sphere(0.19, 10), LEAF[0], 'satin', tf(x, 1.33, z))
        break
      case 'paver':
        kit.add(G.box(w, 0.04, d, 0.02), 0xefe6df, 'matte', tf(x, 0.0, z))
        break
      case 'stone':
        kit.add(G.cyl(w / 2, w / 2, 0.04, 10), 0xe8e0dc, 'matte', tf(x, 0.0, z, 0, 0, 0, 1, 1, d / w))
        break
      case 'bench':
        kit.add(G.box(w, 0.06, d, 0.02), 0xc99a74, 'matte', tf(x, 0.45, z))
        kit.add(G.box(0.06, 0.4, d, 0.02), 0xc99a74, 'matte', tf(it.x0 + 0.03, 0.72, z, 0, 0, 0.15))
        for (const pz of [it.z0 + 0.12, it.z1 - 0.12]) kit.add(G.box(w - 0.06, 0.44, 0.05, 0.015), 0x5a4a52, 'metal', tf(x, 0.22, pz))
        break
      case 'lamp': {
        // A garden lamp: a slim cream post with a glowing globe.
        const h = it.h
        kit.add(G.cyl(0.13, 0.16, 0.1, 14), 0xfff6ef, 'satin', tf(x, 0.05, z))
        kit.add(G.cyl(0.035, 0.045, h - 0.2, 10), 0xfff6ef, 'satin', tf(x, (h - 0.2) / 2 + 0.05, z))
        kit.add(G.cyl(0.09, 0.07, 0.06, 12), GOLD, 'metal', tf(x, h - 0.12, z))
        kit.add(G.sphere(0.15, 14), 0xfff0cf, 'glow', tf(x, h + 0.04, z))
        break
      }
      case 'streetlamp': {
        // A street lamp on the kerb: a fluted post on a stepped base, a curled arm and a lantern hung from it.
        const h = it.h
        kit.add(G.cyl(0.17, 0.2, 0.18, 14), 0x5d6b66, 'metal', tf(x, 0.09, z))
        kit.add(G.cyl(0.11, 0.15, 0.2, 14), 0x5d6b66, 'metal', tf(x, 0.27, z))
        kit.add(G.cyl(0.05, 0.07, h, 12), 0x5d6b66, 'metal', tf(x, h / 2, z))
        kit.add(G.sphere(0.08, 10), GOLD, 'metal', tf(x, h + 0.04, z))
        kit.add(G.box(0.05, 0.05, 0.62, 0.02), 0x5d6b66, 'metal', tf(x, h - 0.2, z + 0.3))
        kit.add(G.cyl(0.13, 0.08, 0.12, 12), 0x5d6b66, 'metal', tf(x, h - 0.32, z + 0.58))
        kit.add(G.cyl(0.1, 0.07, 0.26, 12), 0xfff0cf, 'glow', tf(x, h - 0.51, z + 0.58))
        kit.add(G.cyl(0.05, 0.1, 0.06, 12), 0x5d6b66, 'metal', tf(x, h - 0.67, z + 0.58))
        break
      }
      case 'tree': {
        kit.add(G.cyl(0.08, 0.12, it.h * 0.55, 8), 0x9c6f52, 'matte', tf(x, it.h * 0.27, z))
        const r = 0.75
        canopies.push({ x, y: it.h * 0.6, z, r, c: LEAF[2] }, { x: x + 0.35, y: it.h * 0.5, z: z + 0.2, r: r * 0.7, c: LEAF[0] }, { x: x - 0.3, y: it.h * 0.52, z: z - 0.25, r: r * 0.65, c: LEAF[1] })
        break
      }
      case 'fence': {
        const len = Math.max(w, d), along = d > w
        const n = Math.max(2, Math.round(len / 0.7))
        for (let i = 0; i <= n; i++) {
          const f = -len / 2 + (len / n) * i
          const px = along ? x : x + f, pz = along ? z + f : z
          kit.add(G.box(0.1, it.h, 0.1, 0.02), 0xffffff, 'satin', tf(px, it.h / 2, pz))
          kit.add(G.sphere(0.06, 8), GOLD, 'metal', tf(px, it.h + 0.04, pz))
        }
        for (const y of [0.25, 0.55]) kit.add(along ? G.box(0.05, 0.06, len, 0.015) : G.box(len, 0.06, 0.05, 0.015), 0xffffff, 'satin', tf(x, y, z))
        break
      }
      case 'post':
        kit.add(G.box(w, it.h, d, 0.03), 0xffffff, 'satin', tf(x, it.h / 2, z))
        kit.add(G.sphere(0.09, 10), GOLD, 'metal', tf(x, it.h + 0.07, z))
        break
      case 'sign':
        signAt = it
        for (const pz of [it.z0 + 0.1, it.z1 - 0.1]) kit.add(G.cyl(0.03, 0.03, it.h, 8), GOLD, 'metal', tf(x, it.h / 2, pz))
        kit.add(G.box(0.08, 0.5, d, 0.04), 0xffffff, 'satin', tf(x, it.h - 0.3, z))
        break
      case 'mailbox':
        kit.add(G.cyl(0.03, 0.03, 0.9, 8), 0x4a4552, 'metal', tf(x, 0.45, z))
        kit.add(G.box(0.26, 0.24, 0.34, 0.1), 0xf29bb8, 'satin', tf(x, 0.98, z))
        kit.add(G.box(0.02, 0.12, 0.03, 0.005), GOLD, 'metal', tf(x + 0.14, 1.08, z + 0.12))
        break
      case 'rack': {
        for (let i = 0; i < 3; i++) kit.add(G.torus(0.25, 0.025, Math.PI, 12), 0x8a8494, 'metal', tf(x, 0, it.z0 + 0.25 + i * 0.5, 0, Math.PI / 2, 0))
        // A pastel bike leaning in the first loop.
        const bz = it.z0 + 0.4
        for (const off of [-0.45, 0.45]) kit.add(G.torus(0.3, 0.03, Math.PI * 2, 18), 0x3f3a46, 'matte', tf(x + 0.15, 0.32, bz + off, 0, Math.PI / 2, 0))
        kit.add(G.box(0.05, 0.05, 0.9, 0.02), 0x8fd3c0, 'satin', tf(x + 0.15, 0.55, bz, 0.25, 0, 0))
        kit.add(G.box(0.05, 0.4, 0.05, 0.02), 0x8fd3c0, 'satin', tf(x + 0.15, 0.55, bz - 0.25, 0.4, 0, 0))
        kit.add(G.box(0.12, 0.04, 0.2, 0.02), 0x5a4a52, 'satin', tf(x + 0.15, 0.78, bz - 0.3))
        kit.add(G.cyl(0.14, 0.1, 0.12, 10), 0xf6d2a0, 'matte', tf(x + 0.15, 0.78, bz + 0.45))
        break
      }
      case 'hedge': {
        // A hedge of clustered leafy balls in a few greens: a low row, a fuller row and a crown, of its own length.
        const c = LEAF[it.seed % 4]
        const r = Math.min(d, it.h) * 0.5
        const n = Math.max(2, Math.round(w / (r * 1.1)))
        for (let i = 0; i < n; i++) {
          const hx = it.x0 + r + ((w - 2 * r) * i) / (n - 1)
          for (const row of [-0.18, 0.18]) {
            const rr = r * (0.9 + rnd() * 0.2)
            kit.add(G.sphere(rr, 12), shade(c, (rnd() - 0.5) * 0.14), 'matte', tf(hx + (rnd() - 0.5) * 0.1, rr * 0.85, z + row * d, 0, 0, 0, 1, (it.h / (2 * r)) * 0.95, 1))
          }
          if (i % 2 === 0 || rnd() < 0.4) { const rr = r * 0.7; kit.add(G.sphere(rr, 12), shade(c, 0.06 + rnd() * 0.06), 'matte', tf(hx + (rnd() - 0.5) * 0.2, it.h - rr * 0.55, z + (rnd() - 0.5) * 0.12)) }
        }
        break
      }
      case 'shrub':
        kit.add(G.sphere(w / 2, 9), LEAF[it.seed % 4], 'satin', tf(x, w * 0.4, z, 0, 0, 0, 1, 0.85, 1))
        for (let i = 0; i < 4; i++) kit.add(G.sphere(0.04, 5), FLOWERS[(it.seed + i) % FLOWERS.length], 'matte', tf(x + (rnd() - 0.5) * w * 0.6, w * 0.7, z + (rnd() - 0.5) * w * 0.6))
        break
    }
  })
  const built = kit.build()
  built.traverse(o => { if (o instanceof Mesh) o.castShadow = true })
  group.add(built)

  // ---- tree canopies: instanced, so they can sway
  const leaves = new InstancedMesh(G.sphere(1, 10), new MeshStandardMaterial({ roughness: 0.75 }), canopies.length)
  canopies.forEach((c, i) => leaves.setColorAt(i, new Color(c.c)))
  leaves.castShadow = true
  leaves.receiveShadow = true
  group.add(leaves)

  // ---- butterflies: two pairs of wings flapping over the beds
  const wing = new PlaneGeometry(0.1, 0.07).translate(0.05, 0, 0)
  const flies = new InstancedMesh(wing, new MeshBasicMaterial({ color: 0xffffff, side: DoubleSide, transparent: true, opacity: 0.95, toneMapped: false }), 4)
  ;[0xf7a6c3, 0xf7a6c3, 0xfbd38a, 0xfbd38a].forEach((c, i) => flies.setColorAt(i, new Color(c)))
  flies.frustumCulled = false
  group.add(flies)

  // ---- the lit sign with the salon's name
  const signMat = new MeshBasicMaterial({ transparent: true, toneMapped: false })
  const signMesh = new Mesh(new PlaneGeometry(1, 0.34), signMat)
  const sa = signAt as OutsideItem | null
  if (sa) {
    signMesh.position.set(sa.x0 - 0.05, sa.h - 0.3, (sa.z0 + sa.z1) / 2)
    signMesh.rotation.y = -Math.PI / 2
    group.add(signMesh)
  }
  const setName = (name: string) => {
    const c = document.createElement('canvas')
    c.width = 512; c.height = 176
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#fff8fb'
    ctx.beginPath(); ctx.roundRect(4, 4, 504, 168, 40); ctx.fill()
    ctx.strokeStyle = '#f0c36a'; ctx.lineWidth = 8; ctx.stroke()
    ctx.shadowColor = 'rgba(255,120,170,0.8)'; ctx.shadowBlur = 18
    ctx.fillStyle = '#e2729a'
    ctx.font = '600 76px Fredoka, Nunito, sans-serif'
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(name, 256, 92, 470)
    signMat.map?.dispose()
    signMat.map = tex(c) as CanvasTexture
    signMat.needsUpdate = true
  }
  setName('Glow Salon')

  const m = new Matrix4(), q = new Quaternion(), v = new Vector3(), sc = new Vector3()
  const update = (t: number) => {
    // Canopies sway a little in the breeze.
    canopies.forEach((c, i) => {
      const sway = Math.sin(t * 0.9 + i * 1.7) * 0.04
      m.compose(v.set(c.x + sway, c.y + Math.sin(t * 1.3 + i) * 0.015, c.z + sway * 0.5), q.identity(), sc.set(c.r, c.r * 0.85, c.r))
      leaves.setMatrixAt(i, m)
    })
    leaves.instanceMatrix.needsUpdate = true
    // Butterflies loop over the flower beds by the door and the front.
    for (let b = 0; b < 2; b++) {
      const ph = t * (0.35 + b * 0.1) + b * 3
      const bx = b === 0 ? -W / 2 - T - 0.6 + Math.sin(ph) * 0.5 : Math.sin(ph) * 4, bz = b === 0 ? 2 + Math.cos(ph * 0.8) * 1.4 : D + T + 0.6 + Math.cos(ph * 1.3) * 0.4
      const by = 0.7 + Math.sin(ph * 3) * 0.15
      const heading = Math.atan2(Math.cos(ph), -Math.sin(ph * 0.8))
      const flap = Math.sin(t * 22 + b) * 1.1
      for (const side of [0, 1]) {
        q.setFromAxisAngle(v.set(0, 1, 0), heading).multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), side ? Math.PI - flap : flap)).multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2))
        m.compose(v.set(bx, by, bz), q, sc.set(1, 1, 1))
        flies.setMatrixAt(b * 2 + side, m)
      }
    }
    flies.instanceMatrix.needsUpdate = true
  }
  update(0)
  return { group, update, setName }
}

/** Grass with gentle colour: two greens in soft patches and fine blades. */
function lawnVaried(): CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 512; c.height = 512
  const ctx = c.getContext('2d')!
  ctx.fillStyle = 'rgb(172,210,152)'
  ctx.fillRect(0, 0, 512, 512)
  let s = 13
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647 }
  for (let i = 0; i < 40; i++) {
    const x = rnd() * 512, y = rnd() * 512, r = 30 + rnd() * 70
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    const k = rnd() < 0.5 ? 'rgba(150,196,132,0.45)' : 'rgba(192,224,168,0.45)'
    g.addColorStop(0, k)
    g.addColorStop(1, 'rgba(172,210,152,0)')
    ctx.fillStyle = g
    // Wrap the patch so the tile repeats without seams.
    for (const ox of [-512, 0, 512]) for (const oy of [-512, 0, 512]) { ctx.save(); ctx.translate(ox, oy); ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.restore() }
  }
  for (let i = 0; i < 2600; i++) { const k = (rnd() - 0.5) * 36; ctx.fillStyle = `rgba(${160 + k},${204 + k},${140 + k},0.5)`; ctx.fillRect(rnd() * 512, rnd() * 512, 1.5, 4) }
  return tex(c, { repeat: true })
}
