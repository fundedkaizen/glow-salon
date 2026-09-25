import { PLAYER_CSS } from '../art/palette.ts'
import { music } from '../audio/music.ts'
import { sfx } from '../audio/sfx.ts'
import { esc, h, money } from './dom.ts'
import { ICON } from './salon-icons.ts'
import { saveSettings, settings } from './settings.ts'
import './salon.css'

/**
 * The menus: the title screen over the live salon backdrop (Continue, New game, Play together, Settings,
 * Save transfer), the co-op panel (host with an invite link and the players list, or join with a code),
 * the settings panel (volumes, music, controls, your name) and the save transfer panel (export a code,
 * import one). The game decides what each choice does through hooks.
 */
export type SaveInfo = { day: number; money: number; salonName: string } | null

export type LobbyHooks = {
  saveInfo: () => SaveInfo
  onContinue: () => void
  onNewGame: () => void
  onHost: () => void
  onJoin: (code: string) => void
  exportCode: () => string | null
  importCode: (code: string) => { ok: true } | { ok: false; reason: string }
}

export type CoopView = { code: string; link: string; players: { id: number; name: string }[]; role: 'host' | 'guest'; me: number; status: string; canStart: boolean }

const sparkle = `<svg class="gs-sparkle" viewBox="0 0 20 20"><path d="M10 0c1 6 4 9 10 10-6 1-9 4-10 10-1-6-4-9-10-10 6-1 9-4 10-10z" fill="#fff"/></svg>`

export class Lobby {
  readonly el = h('div', 'gs')
  private hooks: LobbyHooks
  private host: HTMLElement
  private coopPanel: HTMLElement | null = null
  onCoopStart: () => void = () => {}
  onCoopCancel: () => void = () => {}

  constructor(host: HTMLElement, hooks: LobbyHooks) {
    this.host = host
    this.hooks = hooks
    host.append(this.el)
  }

  private clear() { this.el.innerHTML = ''; this.coopPanel = null }

  showTitle() {
    this.clear()
    const t = h('div', 'gs-title')
    t.innerHTML = `<div class="gs-logo"><h1>Glow${sparkle}Salon</h1><p>A cozy beauty salon you run together</p></div>`
    const menu = h('div', 'gs-menu')
    const info = this.hooks.saveInfo()
    if (info) {
      const cont = h('button', 'gs-btn pink big', `Continue <span class="gs-continue-meta">Day ${info.day}, ${money(info.money)}</span>`)
      cont.onclick = () => { this.press(); this.hooks.onContinue() }
      menu.append(cont)
    }
    const fresh = h('button', `gs-btn ${info ? '' : 'pink'} big`, 'New salon')
    fresh.onclick = () => {
      this.press()
      if (!info) { this.hooks.onNewGame(); return }
      const { veil, panel } = this.panel('A fresh start?', `<p>${esc(info.salonName)} (day ${info.day}, ${money(info.money)}) will be replaced by a new little salon. Copy its save code first if you want to keep it.</p>`)
      const actions = h('div', 'gs-actions')
      const keep = h('button', 'gs-btn', 'Keep my salon')
      keep.onclick = () => { sfx.click(); veil.remove() }
      const go = h('button', 'gs-btn pink', 'Start fresh')
      go.onclick = () => { sfx.click(); veil.remove(); this.hooks.onNewGame() }
      actions.append(keep, go)
      panel.append(actions)
    }
    const coop = h('button', 'gs-btn lilac big', `${ICON.users.replace('<svg', '<svg style="width:26px;height:26px"')} Play together`)
    coop.onclick = () => { this.press(); this.showCoopChoice() }
    const row = h('div', 'gs-menu-row')
    const set = h('button', 'gs-btn', `${ICON.gear.replace('<svg', '<svg style="width:22px;height:22px"')} Settings`)
    set.onclick = () => { this.press(); openSettings(this.host) }
    const sv = h('button', 'gs-btn', `${ICON.save.replace('<svg', '<svg style="width:22px;height:22px"')} Save code`)
    sv.onclick = () => { this.press(); this.showSaveTransfer() }
    row.append(set, sv)
    menu.append(fresh, coop, row)
    t.append(menu)
    t.append(h('div', 'gs-foot', 'Music: tad, omfgdude, Tarush Singhal, cynicmusic (CC0). Sounds: Joseph Sardin, BigSoundBank (CC0).'))
    this.el.append(t)
  }

  private press() { sfx.unlock(); music.start(); sfx.click() }

  private panel(title: string, body: string): { veil: HTMLElement; panel: HTMLElement } {
    const veil = h('div', 'gs-veil')
    const panel = h('div', 'gs-panel', `<h2>${title}</h2>${body}`)
    const x = h('button', 'gs-os-close', '&times;')
    x.onclick = () => { sfx.click(); veil.remove(); this.onCoopCancel() }
    panel.querySelector('h2')!.append(x)
    veil.append(panel)
    veil.addEventListener('pointerdown', e => { if (e.target === veil) { veil.remove() } })
    this.el.append(veil)
    return { veil, panel }
  }

  /** Host or join. */
  showCoopChoice(prefill = '') {
    const { veil, panel } = this.panel('Play together', `<p>Up to four friends share one salon and one wallet. Big purchases need everyone to agree.</p>`)
    panel.append(nameField())
    const hostBtn = h('button', 'gs-btn pink big', 'Host my salon')
    hostBtn.style.width = '100%'
    hostBtn.onclick = () => { sfx.click(); veil.remove(); this.hooks.onHost() }
    panel.append(hostBtn)
    panel.insertAdjacentHTML('beforeend', `<div class="gs-section" style="justify-content:center">or join a friend</div>`)
    const f = h('div', 'gs-link')
    const input = h('input') as HTMLInputElement
    input.type = 'text'; input.placeholder = 'Room code'; input.maxLength = 5; input.value = prefill
    input.style.cssText = 'border:2px solid var(--gs-line);border-radius:14px;padding:10px 12px;font:800 18px Nunito;letter-spacing:3px;text-transform:uppercase;text-align:center'
    const join = h('button', 'gs-btn lilac', 'Join')
    join.onclick = () => { const c = input.value.trim().toUpperCase(); if (c.length < 5) { input.focus(); return } sfx.click(); veil.remove(); this.hooks.onJoin(c) }
    input.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') join.click() })
    f.append(input, join)
    panel.append(f)
    if (prefill) setTimeout(() => (panel.querySelector('input') as HTMLInputElement | null)?.focus(), 50)
  }

  /** Opened from an invite link: one friendly screen, a name and a big Join button (Enter joins too). */
  showInvite(code: string, from: string) {
    const host = from.replace(/[<>&"]/g, '').trim().slice(0, 16)
    const { veil, panel } = this.panel(host ? `${esc(host)} invited you!` : 'You are invited!', `<p>Come and run ${host ? `${esc(host)}’s` : 'a'} cosy salon together in Glow Salon. What should the customers call you?</p>`)
    panel.classList.add('gs-invite')
    const f = h('div', 'gs-field')
    const input = h('input') as HTMLInputElement
    input.type = 'text'; input.maxLength = 16; input.placeholder = 'Your name'
    // One computer, two tabs: never offer the host's own name.
    input.value = settings.name && settings.name !== host ? settings.name : ''
    input.setAttribute('aria-label', 'Your name')
    f.append(input)
    const join = h('button', 'gs-btn pink big', 'Join the salon')
    join.style.width = '100%'
    const go = () => {
      this.press()
      const name = input.value.trim()
      if (!name) { input.focus(); input.classList.add('gs-shake'); setTimeout(() => input.classList.remove('gs-shake'), 400); return }
      saveSettings({ name })
      veil.remove()
      this.hooks.onJoin(code)
    }
    join.onclick = go
    input.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') go() })
    panel.append(f, join)
    panel.insertAdjacentHTML('beforeend', `<p style="text-align:center;margin:12px 0 0;font:700 12px Nunito;color:var(--gs-ink-soft)">Room ${esc(code.toUpperCase())}</p>`)
    setTimeout(() => input.focus(), 60)
  }

  /** The room: invite link and who is here. Updated as people come and go. */
  showCoop(v: CoopView) {
    if (!this.coopPanel || !this.coopPanel.isConnected) {
      const { panel } = this.panel(v.role === 'host' ? 'Your salon is open' : 'Joining', '')
      this.coopPanel = panel
    }
    const panel = this.coopPanel
    panel.querySelectorAll(':scope > :not(h2)').forEach(n => n.remove())
    if (v.role === 'host') {
      panel.insertAdjacentHTML('beforeend', `<p>Send this link to friends. They can join now or any time during the day.</p>`)
      const row = h('div', 'gs-link')
      const input = h('input') as HTMLInputElement
      input.type = 'text'; input.readOnly = true; input.value = v.link
      input.style.cssText = 'border:2px solid var(--gs-line);border-radius:14px;padding:10px 12px;font:700 14px Nunito'
      const copy = h('button', 'gs-btn mint', `Copy`)
      const msg = h('div', 'gs-msg')
      copy.onclick = async () => { try { await navigator.clipboard.writeText(v.link); msg.textContent = 'Link copied.'; msg.className = 'gs-msg ok' } catch { input.select(); msg.textContent = 'Select the link and copy it.'; msg.className = 'gs-msg' } sfx.click() }
      row.append(input, copy)
      panel.append(row, msg)
      panel.insertAdjacentHTML('beforeend', `<div class="gs-section">Room ${esc(v.code)}</div>`)
    }
    const list = h('div', 'gs-players')
    for (const p of v.players) list.append(h('div', 'gs-player', `<i style="background:${PLAYER_CSS[p.id % 4]}"></i>${esc(p.name)}<small>${p.id === 0 ? 'host' : `player ${p.id + 1}`}${p.id === v.me ? ', you' : ''}</small>`))
    panel.append(list)
    if (v.status) panel.append(h('div', 'gs-msg', esc(v.status)))
    if (v.canStart) {
      const actions = h('div', 'gs-actions')
      const start = h('button', 'gs-btn pink big', 'Go to the salon')
      start.onclick = () => { sfx.click(); this.clear(); this.onCoopStart() }
      actions.append(start)
      panel.append(actions)
    }
  }

  showSaveTransfer() {
    const code = this.hooks.exportCode()
    const { panel } = this.panel('Save code', `<p>Move your salon to another browser or phone: copy your code there and load it.</p>`)
    const out = h('div', 'gs-field', `<label>Your save code</label>`)
    const ta = h('textarea') as HTMLTextAreaElement
    ta.readOnly = true
    ta.value = code ?? 'No salon saved yet. Play a day first.'
    const copy = h('button', 'gs-btn mint small', `${ICON.copy.replace('<svg', '<svg style="width:18px;height:18px"')} Copy code`)
    const cmsg = h('div', 'gs-msg')
    copy.disabled = !code
    copy.onclick = async () => { try { await navigator.clipboard.writeText(ta.value); cmsg.textContent = 'Copied.'; cmsg.className = 'gs-msg ok' } catch { ta.select(); cmsg.textContent = 'Select the code and copy it.'; cmsg.className = 'gs-msg' } sfx.click() }
    out.append(ta, copy, cmsg)
    const inp = h('div', 'gs-field', `<label>Load a save code</label>`)
    const ta2 = h('textarea') as HTMLTextAreaElement
    ta2.placeholder = 'Paste a GLOW1- code here'
    ta2.addEventListener('keydown', e => e.stopPropagation())
    const load = h('button', 'gs-btn pink small', 'Load this salon')
    const msg = h('div', 'gs-msg')
    load.onclick = () => {
      sfx.click()
      const r = this.hooks.importCode(ta2.value)
      if (r.ok) { msg.textContent = 'Loaded. Welcome back!'; msg.className = 'gs-msg ok'; setTimeout(() => this.showTitle(), 700) }
      else { msg.textContent = r.reason; msg.className = 'gs-msg err' }
    }
    inp.append(ta2, load, msg)
    panel.append(out, inp)
  }

  /** A short message over the title (a lost connection, a full room). */
  notice(text: string) {
    const { veil, panel } = this.panel('Oh!', `<p>${esc(text)}</p>`)
    const actions = h('div', 'gs-actions')
    const ok = h('button', 'gs-btn pink', 'Okay')
    ok.onclick = () => { sfx.click(); veil.remove() }
    actions.append(ok)
    panel.append(actions)
  }

  hide() { this.clear() }
}

function nameField(): HTMLElement {
  const f = h('div', 'gs-field', `<label>Your name</label>`)
  const input = h('input') as HTMLInputElement
  input.type = 'text'; input.maxLength = 16; input.placeholder = 'Your name'; input.value = settings.name
  input.addEventListener('keydown', e => e.stopPropagation())
  input.addEventListener('input', () => saveSettings({ name: input.value.trim() }))
  f.append(input)
  return f
}

/** The settings panel, from the title or the floor. */
export function openSettings(host: HTMLElement, extra?: { onQuit?: () => void; onRename?: (name: string) => void }) {
  const veil = h('div', 'gs gs-veil')
  const panel = h('div', 'gs-panel', `<h2>Settings</h2>`)
  const x = h('button', 'gs-os-close', '&times;')
  const close = () => { sfx.click(); veil.classList.add('out'); setTimeout(() => veil.remove(), 250) }
  x.onclick = close
  panel.querySelector('h2')!.append(x)
  const slider = (label: string, key: 'music' | 'sfx' | 'ding', test?: () => void) => {
    const f = h('div', 'gs-field', `<label><span>${label}</span><span class="v">${Math.round(settings[key] * 100)}%</span></label>`)
    const r = h('input', 'gs-range') as HTMLInputElement
    r.type = 'range'; r.min = '0'; r.max = '100'; r.value = String(Math.round(settings[key] * 100))
    r.style.setProperty('--v', `${r.value}%`)
    r.oninput = () => { r.style.setProperty('--v', `${r.value}%`); f.querySelector('.v')!.textContent = `${r.value}%`; saveSettings({ [key]: Number(r.value) / 100 }) }
    r.onchange = () => test?.()
    f.append(r)
    return f
  }
  panel.append(slider('Music', 'music'), slider('Sound effects', 'sfx', () => sfx.click()), slider('Completion ding', 'ding', () => sfx.ding()))
  const tog = (label: string, options: [string, string][], value: string, set: (v: string) => void) => {
    const f = h('div', 'gs-field', `<label>${label}</label>`)
    const t = h('div', 'gs-toggle')
    for (const [v, text] of options) {
      const b = h('button', v === value ? 'on' : '', text)
      b.onclick = () => { sfx.click(); t.querySelectorAll('button').forEach(x => x.classList.remove('on')); b.classList.add('on'); set(v) }
      t.append(b)
    }
    f.append(t)
    return f
  }
  panel.append(tog('Music', [['on', 'On'], ['off', 'Off']], settings.musicOn ? 'on' : 'off', v => saveSettings({ musicOn: v === 'on' })))
  panel.append(tog('Controls', [['mouse', 'Keys and mouse'], ['touch', 'Touch']], settings.control, v => saveSettings({ control: v as 'mouse' | 'touch' })))
  const nf = nameField()
  if (extra?.onRename) nf.querySelector('input')!.addEventListener('change', e => extra.onRename!((e.target as HTMLInputElement).value.trim()))
  panel.append(nf)
  panel.insertAdjacentHTML('beforeend', `<p style="font:700 13px/1.4 Nunito;color:var(--gs-ink-soft);margin:10px 0 0">${settings.control === 'touch' ? 'Tap the floor to walk, tap a station or the computer to use it.' : 'WASD or arrows to walk, F to use what is in front of you. Clicking works too.'}</p>`)
  const actions = h('div', 'gs-actions')
  if (extra?.onQuit) { const q = h('button', 'gs-btn', 'Save and go to title'); q.onclick = () => { close(); extra.onQuit!() }; actions.append(q) }
  const done = h('button', 'gs-btn pink', 'Done')
  done.onclick = close
  actions.append(done)
  panel.append(actions)
  veil.append(panel)
  veil.addEventListener('pointerdown', e => { if (e.target === veil) close() })
  host.append(veil)
}
