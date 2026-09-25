import { type AnimationClip, type Group } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { PEOPLE } from '../art3d/catalog.ts'

/**
 * The modelled people (Helper B's, src/art3d/catalog.ts PEOPLE): the two bodies, loaded once and shared. Each person
 * on the floor is a clone with its own parts shown and its own colours (model-person.ts).
 */
export type PeopleFile = { scene: Group; clips: AnimationClip[] }
export type PeopleFiles = { fem: PeopleFile; masc: PeopleFile }

let loading: Promise<PeopleFiles | null> | null = null
let loaded: PeopleFiles | null = null

/** Start loading the people (once); resolves null when they cannot load (the stand-ins stay). */
export function loadPeople(read?: (file: string) => Promise<ArrayBuffer>): Promise<PeopleFiles | null> {
  if (loading) return loading
  const loader = new GLTFLoader()
  loader.setMeshoptDecoder(MeshoptDecoder)
  const base = `${import.meta.env?.BASE_URL ?? '/'}models/`
  // `read`: the bytes from elsewhere (the tests read them from disk).
  const one = (file: string) => (read ? read(file).then(buf => loader.parseAsync(buf, '')) : loader.loadAsync(base + file)).then(g => ({ scene: g.scene, clips: g.animations }))
  loading = Promise.all([one(PEOPLE.files.fem), one(PEOPLE.files.masc)])
    .then(([fem, masc]) => (loaded = { fem, masc }))
    .catch(error => { console.warn('3D people unavailable, using stand-ins', error); return null })
  return loading
}

let catLoading: Promise<PeopleFile | null> | null = null
/** Helper B's rigged cat (life/cat.glb), loaded once. */
export function loadCat(): Promise<PeopleFile | null> {
  if (catLoading) return catLoading
  const loader = new GLTFLoader()
  loader.setMeshoptDecoder(MeshoptDecoder)
  catLoading = loader.loadAsync(`${import.meta.env?.BASE_URL ?? '/'}models/life/cat.glb`).then(g => ({ scene: g.scene, clips: g.animations })).catch(error => { console.warn('3D cat unavailable, using the stand-in', error); return null })
  return catLoading
}

/** The people, if they have loaded. */
export function people(): PeopleFiles | null { return loaded }
