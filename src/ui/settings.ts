import { music } from '../audio/music.ts'
import { sfx } from '../audio/sfx.ts'

/**
 * Player settings, kept in this browser: volumes (music, effects, the completion ding), the player's name,
 * and how they move (keys and mouse, or tap to walk). Applied to the audio buses as they change.
 */
export type Settings = { music: number; sfx: number; ding: number; name: string; control: 'mouse' | 'touch'; musicOn: boolean }

const KEY = 'glow-salon-settings-v1'

const defaults = (): Settings => ({ music: 0.55, sfx: 0.9, ding: 0.7, name: '', control: matchMedia?.('(pointer: coarse)').matches ? 'touch' : 'mouse', musicOn: true })

function load(): Settings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (raw && typeof raw === 'object') {
      const d = defaults()
      const n = (v: unknown, f: number) => (typeof v === 'number' && v >= 0 && v <= 1 ? v : f)
      return { music: n(raw.music, d.music), sfx: n(raw.sfx, d.sfx), ding: n(raw.ding, d.ding), name: typeof raw.name === 'string' ? raw.name.slice(0, 16) : '', control: raw.control === 'touch' ? 'touch' : 'mouse', musicOn: raw.musicOn !== false }
    }
  } catch { /* storage blocked: use defaults */ }
  return defaults()
}

export const settings: Settings = load()

export function saveSettings(patch: Partial<Settings>) {
  Object.assign(settings, patch)
  try { localStorage.setItem(KEY, JSON.stringify(settings)) } catch { /* private window */ }
  applySettings()
}

export function applySettings() {
  sfx.setVolumes({ music: settings.musicOn ? settings.music : 0, sfx: settings.sfx, ding: settings.ding })
  void music
}
