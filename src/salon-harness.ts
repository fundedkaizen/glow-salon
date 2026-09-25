import { Application } from 'pixi.js'
import { startSalon } from './game/salon-app.ts'
import { stubTreatment } from './ui/treatment-stub.ts'

/**
 * salon.html: the salon side on its own (title, floor, computer, treatments, receipt, co-op), until the
 * main game wires it in. `window.salonGame` is exposed for browser checks.
 */
async function boot() {
  await Promise.all([document.fonts.load('600 40px Fredoka'), document.fonts.load('800 16px Nunito')]).catch(() => {})
  const app = new Application()
  await app.init({ resizeTo: window, antialias: true, preference: 'webgl', resolution: Math.min(window.devicePixelRatio || 1, 2), autoDensity: true, background: 0xf3d9e3 })
  document.getElementById('app')!.append(app.canvas)
  const ui = document.getElementById('ui')!
  // ?real uses the real treatment close-up; by default a stand-in keeps the salon testable on its own.
  const real = new URLSearchParams(location.search).has('real')
  const game = await startSalon(app, ui, real ? {} : { openTreatment: stubTreatment(ui) })
  ;(window as unknown as { salonGame: unknown }).salonGame = game
}
boot().catch(error => { console.error(error); document.body.insertAdjacentHTML('beforeend', `<p style="position:fixed;top:40%;width:100%;text-align:center;font:700 16px sans-serif">Could not start: ${String(error?.message ?? error)}</p>`) })
