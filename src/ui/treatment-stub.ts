import { portrait } from '../art/salon/people.ts'
import { sfx } from '../audio/sfx.ts'
import { TREATMENTS } from '../core/treatments/registry.ts'
import type { TreatmentResult } from '../core/treatments/session.ts'
import type { TreatmentHandoff, TreatmentScreen } from '../game/salon-app.ts'
import { esc, h } from './dom.ts'
import './salon.css'

/**
 * A stand-in treatment for testing the salon on its own (salon.html): hold the button to work, then
 * finish. It goes through exactly the same hand-off as the real close-up (progress, finish, leave), so
 * the floor, pay, reviews and the receipt all behave as in the real game.
 */
export function stubTreatment(ui: HTMLElement) {
  return (hd: TreatmentHandoff): TreatmentScreen => {
    const def = TREATMENTS[hd.customer.plan.treatment]
    const el = h('div', 'gs gs-veil')
    const panel = h('div', 'gs-panel')
    panel.style.textAlign = 'center'
    panel.innerHTML = `<h2 style="justify-content:center">${esc(def.name)}</h2><p>Stand-in treatment for salon testing. Hold to treat ${esc(hd.customer.plan.name)}, then finish.</p>`
    const img = h('img')
    img.src = portrait(hd.customer.plan.look, 160)
    img.style.cssText = 'width:120px;height:120px;border-radius:50%;box-shadow:0 8px 20px rgba(140,70,110,.25);margin:4px auto 12px;display:block'
    const bar = h('div', 'gs-progress', '<i style="width:0%"></i>')
    bar.style.height = '14px'
    const fill = bar.firstElementChild as HTMLElement
    const hold = h('button', 'gs-btn pink big', 'Hold to treat')
    const done = h('button', 'gs-btn mint big', 'Finish')
    done.disabled = true
    const leave = h('button', 'gs-btn', 'Back to the floor')
    const row = h('div', 'gs-actions')
    row.style.justifyContent = 'center'
    row.append(leave, hold, done)
    panel.append(img, bar, row)
    el.append(panel)
    ui.append(el)
    let progress = hd.startStep / Math.max(1, def.steps.length)
    let holding = false
    let seconds = 0
    let sendIn = 0
    hold.onpointerdown = () => { holding = true; sfx.unlock() }
    const stop = () => { holding = false }
    hold.onpointerup = stop; hold.onpointerleave = stop
    done.onclick = () => {
      const result: TreatmentResult = { treatment: def.id, seconds: Math.round(seconds), par: def.parSeconds, required: 12, done: 12, skipped: 0, optionalDone: 1, popped: def.id === 'facial' ? 7 : 0, extracted: def.id === 'facial' ? 10 : 0, fourHands: hd.role === 'helper', wishMatched: def.id === 'nails' ? true : null, disaster: hd.customer.plan.disaster, thoroughness: 0.97 }
      sfx.reveal()
      hd.finish(result, 40)
    }
    leave.onclick = () => hd.leave()
    return {
      update(dt) {
        seconds += dt
        if (holding && progress < 1) { progress = Math.min(1, progress + dt / 2.2); if (Math.random() < dt * 8) sfx.pop(0.6 + Math.random() * 0.5) }
        fill.style.width = `${progress * 100}%`
        done.disabled = progress < 1
        sendIn -= dt
        if (sendIn <= 0 && hd.role === 'lead') { sendIn = 0.5; hd.progress(Math.floor(progress * def.steps.length), def.steps.length, progress) }
      },
      resize() {},
      destroy() { el.remove() },
    }
  }
}
