import './ui/style.css'
import { Application } from 'pixi.js'
import { randomLook } from './core/customers.ts'
import { makeRng } from './core/rng.ts'
import { TreatmentView } from './render/treatment-view.ts'
import { sfx, Sfx } from './audio/sfx.ts'
import { startGame } from './game/game.ts'

/**
 * Boot: one WebGL canvas for the salon and the close-ups, a DOM layer on top for the UI. `?view=facial` or
 * `?view=nails` (with `&seed=`) opens a close-up directly, for checks and screenshots.
 */
async function boot() {
  const app = new Application()
  await app.init({ resizeTo: window, antialias: true, preference: 'webgl', resolution: Math.min(window.devicePixelRatio || 1, 2), autoDensity: true, background: 0xf3d9e3 })
  document.getElementById('app')!.append(app.canvas)
  const ui = document.getElementById('ui')!
  const params = new URLSearchParams(location.search)
  const view = params.get('view')
  if (view === 'facial' || view === 'nails') {
    const seed = Number(params.get('seed') ?? 7)
    const r = makeRng(seed)
    const tv = new TreatmentView({
      app, overlay: ui, treatment: view, customer: { name: 'Mira', look: randomLook(r), seed, disaster: params.has('disaster'), wish: 2 },
      tier: Number(params.get('tier') ?? 1), startStep: Number(params.get('step') ?? 0), role: 'lead', leadName: 'You', playerId: 0, mood: 1, ambience: 2,
      onOps: () => {}, onProgress: () => {}, onFinish: () => location.reload(), onLeave: () => location.reload(),
    })
    app.stage.addChild(tv.root)
    app.ticker.add(t => tv.update(Math.min(0.05, t.deltaMS / 1000)))
    window.addEventListener('resize', () => tv.resize(app.screen.width, app.screen.height))
    window.addEventListener('pointerdown', () => sfx.unlock(), { once: true })
    ;(window as unknown as { __sfx: typeof sfx; __Sfx: typeof Sfx }).__sfx = sfx
    ;(window as unknown as { __Sfx: typeof Sfx }).__Sfx = Sfx
  } else {
    await startGame(app, ui)
  }
  document.getElementById('boot')?.classList.add('done')
}

boot().catch(error => {
  console.error(error)
  const boot = document.getElementById('boot')
  if (boot) boot.innerHTML = `<div class="boot-logo">Glow Salon</div><p style="font:700 16px Nunito,sans-serif;text-align:center;max-width:320px">Something went wrong starting the game. Try reloading. (${String(error?.message ?? error)})</p>`
})
