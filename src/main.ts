import './ui/style.css'
import { Application } from 'pixi.js'
import { randomLook, type Look } from './core/customers.ts'
import { makeRng } from './core/rng.ts'
import type { Op, SessionSnapshot } from './core/treatments/session.ts'
import { TreatmentView } from './render/treatment-view.ts'
import { sfx, Sfx } from './audio/sfx.ts'
import { CoopLink } from './net/coop-link.ts'
import { startGame } from './game/game.ts'

/**
 * Boot: one WebGL canvas for the salon and the close-ups, a DOM layer on top for the UI.
 *
 * Checks and screenshots: `?view=facial` or `?view=nails` (with `&seed=`, `&step=`, `&tier=`, `&disaster`)
 * opens a close-up directly. Add `&coop=host` in one tab and `&coop=<CODE>` in another to try four hands
 * through the relay: the host leads, the guest helps (the magnifier lamp on extraction steps).
 */
async function boot() {
  const app = new Application()
  await app.init({ resizeTo: window, antialias: true, preference: 'webgl', resolution: Math.min(window.devicePixelRatio || 1, 2), autoDensity: true, background: 0xf3d9e3 })
  document.getElementById('app')!.append(app.canvas)
  const ui = document.getElementById('ui')!
  const params = new URLSearchParams(location.search)
  const view = params.get('view')
  if (view === 'facial' || view === 'nails') closeUp(app, ui, view, params)
  else await startGame(app, ui)
  document.getElementById('boot')?.classList.add('done')
}

/** `&skin=N&hair=N&style=N` pin parts of the look (for side-by-side checks of every tone). */
function debugLook(look: Look, params: URLSearchParams): Look {
  const pin = (k: string) => (params.has(k) ? Number(params.get(k)) : undefined)
  return { ...look, skin: pin('skin') ?? look.skin, hair: pin('hair') ?? look.hair, hairStyle: pin('style') ?? look.hairStyle }
}

type DebugMsg = { t: 'ops'; ops: Op[]; from?: number } | { t: 'syncReq'; from?: number } | { t: 'sync'; snap: SessionSnapshot; from?: number }

function closeUp(app: Application, ui: HTMLElement, view: 'facial' | 'nails', params: URLSearchParams) {
  const seed = Number(params.get('seed') ?? 7)
  const r = makeRng(seed)
  const coop = params.get('coop')
  const helper = !!coop && coop !== 'host'
  let link: CoopLink<DebugMsg> | null = null
  const tv = new TreatmentView({
    app, overlay: ui, treatment: view, customer: { name: 'Mira', look: debugLook(randomLook(r), params), seed, disaster: params.has('disaster'), wish: 2 },
    tier: Number(params.get('tier') ?? 1), startStep: Number(params.get('step') ?? 0), role: helper ? 'helper' : 'lead', leadName: 'Host', playerId: helper ? 1 : 0, mood: 1, ambience: 2,
    onOps: ops => link?.send({ t: 'ops', ops }), onProgress: () => {}, onFinish: () => location.reload(), onLeave: () => location.reload(),
  })
  app.stage.addChild(tv.root)
  app.ticker.add(t => tv.update(Math.min(0.05, t.deltaMS / 1000)))
  window.addEventListener('resize', () => tv.resize(app.screen.width, app.screen.height))
  window.addEventListener('pointerdown', () => sfx.unlock(), { once: true })
  const w = window as unknown as Record<string, unknown>
  w.__sfx = sfx
  w.__Sfx = Sfx
  if (coop) {
    const badge = document.createElement('div')
    badge.className = 'chip'
    badge.style.cssText = 'position:absolute;left:12px;bottom:12px;pointer-events:auto;font-size:13px'
    ui.append(badge)
    link = new CoopLink<DebugMsg>(msg => {
      if (msg.t === 'ops') tv.applyRemote(msg.ops, msg.from ?? 0)
      else if (msg.t === 'syncReq') link!.send({ t: 'sync', snap: tv.snapshot() })
      else if (msg.t === 'sync') tv.applySnapshot(msg.snap)
    }, status => {
      badge.textContent = status.kind === 'waiting' || status.kind === 'paired' || status.kind === 'alone' ? `${status.kind} ${status.code}` : status.kind === 'error' ? status.reason : status.kind
      w.__coopStatus = status
      if (helper && status.kind === 'paired') link!.send({ t: 'syncReq' })
    })
    link.open(helper ? coop : undefined)
    w.__link = link
  }
}

boot().catch(error => {
  console.error(error)
  const boot = document.getElementById('boot')
  if (boot) boot.innerHTML = `<div class="boot-logo">Glow Salon</div><p style="font:700 16px Nunito,sans-serif;text-align:center;max-width:320px">Something went wrong starting the game. Try reloading. (${String(error?.message ?? error)})</p>`
})
