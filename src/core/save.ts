import { ITEM_BY_ID } from './economy.ts'
import { SLOTS } from './floor.ts'
import type { SaveData } from './salon.ts'
import { validateExt } from './salon-ext.ts'

/**
 * Saves: plain JSON in localStorage, and a save code to copy between browsers. The code is
 * "GLOW1-" + base64url(JSON) + "-" + a short checksum, so a typo is caught instead of loading junk.
 */
export const SAVE_KEY = 'glow-salon-save-v1'
const PREFIX = 'GLOW1-'

function checksum(text: string) {
  let h = 5381
  for (let i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0
  return h.toString(36).slice(-5).padStart(5, '0')
}

function toBase64Url(text: string) {
  let binary = ''
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function fromBase64Url(text: string) {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'))
  return new TextDecoder().decode(Uint8Array.from(binary, c => c.charCodeAt(0)))
}

export function exportCode(save: SaveData): string {
  const body = toBase64Url(JSON.stringify(save))
  return `${PREFIX}${body}-${checksum(body)}`
}

export type ImportResult = { ok: true; save: SaveData } | { ok: false; reason: string }

export function importCode(code: string): ImportResult {
  const text = String(code ?? '').replace(/\s+/g, '')
  if (!text.startsWith(PREFIX)) return { ok: false, reason: 'That is not a Glow Salon save code.' }
  const rest = text.slice(PREFIX.length)
  const dash = rest.lastIndexOf('-')
  if (dash < 0) return { ok: false, reason: 'The save code is cut short.' }
  const body = rest.slice(0, dash), sum = rest.slice(dash + 1)
  if (checksum(body) !== sum) return { ok: false, reason: 'The save code has a typo in it.' }
  let data: unknown
  try { data = JSON.parse(fromBase64Url(body)) } catch { return { ok: false, reason: 'The save code could not be read.' } }
  const save = validate(data)
  return save ? { ok: true, save } : { ok: false, reason: 'The save code is from a different version.' }
}

/** Check and clean a loaded save; null when it is not usable. */
export function validate(data: unknown): SaveData | null {
  if (!data || typeof data !== 'object') return null
  const d = data as Partial<SaveData>
  if (d.v !== 1) return null
  const num = (v: unknown, lo: number, hi: number, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : fallback)
  const owned = Array.isArray(d.owned) ? [...new Set(d.owned.filter(id => typeof id === 'string' && ITEM_BY_ID[id] && !ITEM_BY_ID[id].soon))] : []
  const slots = Array.isArray(d.slots) ? d.slots.filter(s => Number.isInteger(s) && s >= 0 && s < SLOTS.length) : [0]
  const rating = d.rating && typeof d.rating === 'object' ? { sum: num(d.rating.sum, 0, 1e7, 0), count: num(d.rating.count, 0, 1e6, 0) } : { sum: 0, count: 0 }
  return {
    v: 1,
    day: Math.floor(num(d.day, 1, 100000, 1)),
    money: Math.floor(num(d.money, -1e6, 1e9, 60)),
    owned,
    slots: [...new Set(slots)],
    rating,
    reviews: Array.isArray(d.reviews) ? d.reviews.filter(r => r && typeof r.name === 'string' && typeof r.text === 'string').slice(-40) : [],
    met: Array.isArray(d.met) ? d.met.filter(m => typeof m === 'string') : [],
    seed: Math.floor(num(d.seed, 0, 2 ** 31, 1)),
    totals: { served: num(d.totals?.served, 0, 1e9, 0), earned: num(d.totals?.earned, 0, 1e12, 0) },
    ext: validateExt(d.ext),
  }
}

/** Storage that may be missing (a private window): every call is guarded. */
export type Store = { getItem(key: string): string | null; setItem(key: string, value: string): void }

export function loadSave(store: Store | null): SaveData | null {
  try {
    const text = store?.getItem(SAVE_KEY)
    return text ? validate(JSON.parse(text)) : null
  } catch { return null }
}

export function writeSave(store: Store | null, save: SaveData) {
  try { store?.setItem(SAVE_KEY, JSON.stringify(save)); return true } catch { return false }
}
