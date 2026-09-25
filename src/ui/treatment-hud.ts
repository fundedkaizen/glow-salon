import { POLISH_COLORS, type TreatmentDef } from '../core/treatments/types.ts'
import type { StepStatus } from '../core/treatments/session.ts'
import { toolArt } from '../art/tools.ts'
import { esc, h } from './dom.ts'

/**
 * The treatment's DOM layer: the step name and hint at the top, the tool tray along the bottom with a
 * progress ring on the current tool, the polish swatches, and the reveal card with Save photo and Done.
 */
export type HudActions = {
  skip: () => void
  finish: () => void
  leave: () => void
  choose: (i: number) => void
  photo: () => void
  done: () => void
}

export class TreatmentHud {
  readonly el: HTMLElement
  private tray: HTMLElement
  private title: HTMLElement
  private hint: HTMLElement
  private ring: SVGCircleElement | null = null
  private choice: HTMLElement
  private finishBtn: HTMLButtonElement
  private skipBtn: HTMLButtonElement
  private card: HTMLElement
  private chip: HTMLElement
  private lastStep = -1

  private def: TreatmentDef
  private opts: { customer: string; wish: number | null; role: 'lead' | 'helper'; leadName: string; actions: HudActions }
  constructor(parent: HTMLElement, def: TreatmentDef, opts: { customer: string; wish: number | null; role: 'lead' | 'helper'; leadName: string; actions: HudActions }) {
    this.def = def
    this.opts = opts
    this.el = h('div', 'thud')
    this.el.innerHTML = `
      <div class="thud-top">
        <button class="thud-leave round-btn" aria-label="Leave this treatment">&#x2039;</button>
        <div class="thud-head">
          <div class="thud-title"></div>
          <div class="thud-hint"></div>
        </div>
        <div class="thud-side">
          <div class="thud-chip"></div>
          <button class="pill thud-skip">Skip step</button>
        </div>
      </div>
      <div class="thud-choice" hidden></div>
      <div class="thud-bottom">
        <div class="thud-actions">
          <button class="pill pill-main thud-finish" hidden>Finish</button>
        </div>
        <div class="thud-tray"></div>
      </div>
      <div class="thud-card" hidden></div>`
    parent.append(this.el)
    this.tray = this.el.querySelector('.thud-tray')!
    this.title = this.el.querySelector('.thud-title')!
    this.hint = this.el.querySelector('.thud-hint')!
    this.choice = this.el.querySelector('.thud-choice')!
    this.finishBtn = this.el.querySelector('.thud-finish')!
    this.skipBtn = this.el.querySelector('.thud-skip')!
    this.card = this.el.querySelector('.thud-card')!
    this.chip = this.el.querySelector('.thud-chip')!
    const helper = opts.role === 'helper'
    this.chip.innerHTML = helper ? `Helping <b>${esc(opts.leadName)}</b>` : `<b>${esc(opts.customer)}</b>${opts.wish !== null ? ` wants <span class="swatch-dot" style="--c:#${POLISH_COLORS[opts.wish].hex.toString(16).padStart(6, '0')}"></span>${POLISH_COLORS[opts.wish].name}` : ''}`
    this.skipBtn.hidden = helper
    this.el.querySelector('.thud-leave')!.addEventListener('click', () => opts.actions.leave())
    this.skipBtn.addEventListener('click', () => opts.actions.skip())
    this.finishBtn.addEventListener('click', () => opts.actions.finish())
    this.tray.innerHTML = def.steps.map((s, i) => `<div class="tool" data-i="${i}" title="${esc(s.label)}"><svg class="tool-ring" viewBox="0 0 64 64"><circle cx="32" cy="32" r="29" /></svg><img alt="" src="${toolArt(s.tool).icon}"><span class="tool-check">&#10003;</span><span class="tool-name">${esc(s.label)}</span>${s.optional ? '<span class="tool-opt">extra</span>' : ''}</div>`).join('')
    this.choice.innerHTML = `<span>Pick a colour</span>` + POLISH_COLORS.map((c, i) => `<button class="swatch${opts.wish === i ? ' wish' : ''}" data-i="${i}" style="--c:#${c.hex.toString(16).padStart(6, '0')}" aria-label="${c.name}"></button>`).join('')
    this.choice.querySelectorAll<HTMLButtonElement>('.swatch').forEach(b => b.addEventListener('click', () => opts.actions.choose(Number(b.dataset.i))))
  }

  setStep(step: number, status: StepStatus[], helperCanChoose = false) {
    const s = this.def.steps[step]
    if (!s) return
    this.title.textContent = `${s.label}`
    const visible = [...this.tray.querySelectorAll<HTMLElement>('.tool:not(.gone)')]
    const pos = visible.findIndex(el => el.dataset.i === String(step))
    this.title.dataset.count = `${Math.max(1, pos + 1)} / ${visible.length || this.def.steps.length}`
    this.hint.textContent = this.opts.role === 'helper' && s.lamp ? 'Hold the magnifier lamp over the spot your partner is working on, or help with the tool' : s.hint
    this.finishBtn.hidden = !s.optional || this.opts.role === 'helper'
    this.skipBtn.hidden = this.opts.role === 'helper' || !!s.optional
    this.choice.hidden = !s.choice || (this.opts.role === 'helper' && !helperCanChoose)
    this.tray.querySelectorAll<HTMLElement>('.tool').forEach((el, i) => {
      el.classList.toggle('current', i === step)
      el.classList.toggle('done', status[i] === 'done')
      el.classList.toggle('skipped', status[i] === 'skipped')
      el.classList.toggle('future', i > step)
    })
    const cur = this.tray.querySelector<HTMLElement>(`.tool[data-i="${step}"]`)
    this.ring = cur?.querySelector('circle') ?? null
    if (cur && step !== this.lastStep) {
      cur.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
      cur.classList.remove('pop'); void cur.offsetWidth; cur.classList.add('pop')
    }
    this.lastStep = step
    this.setProgress(0)
  }

  setProgress(p: number) {
    if (!this.ring) return
    const c = 2 * Math.PI * 29
    this.ring.style.strokeDasharray = `${c}`
    this.ring.style.strokeDashoffset = `${c * (1 - Math.max(0, Math.min(1, p)))}`
  }

  chosen(i: number | undefined) {
    this.choice.querySelectorAll<HTMLElement>('.swatch').forEach((b, k) => b.classList.toggle('picked', k === i))
    if (i !== undefined) this.choice.classList.add('has-pick')
  }

  /** The step reached its goal: a little celebration on the tray. */
  ready() {
    const cur = this.tray.querySelector<HTMLElement>('.tool.current')
    cur?.classList.add('ready')
    this.setProgress(1)
  }

  hideControls() { this.el.classList.add('revealing') }

  /** A step this customer does not need: it leaves the tray. */
  hideStep(i: number) {
    this.tray.querySelector<HTMLElement>(`.tool[data-i="${i}"]`)?.classList.add('gone')
  }

  showReveal(o: { name: string; stars: number; lead: boolean }) {
    this.card.hidden = false
    this.card.innerHTML = `
      <div class="reveal-name">${esc(o.name)} is glowing!</div>
      <div class="reveal-stars">${[1, 2, 3, 4, 5].map(i => `<span class="rstar${i <= o.stars ? ' on' : ''}" style="--d:${i * 0.12}s">&#9733;</span>`).join('')}</div>
      <div class="reveal-btns">
        <button class="pill reveal-photo">Save photo</button>
        ${o.lead ? '<button class="pill pill-main reveal-done">Done</button>' : '<span class="reveal-wait">Nice teamwork!</span>'}
      </div>`
    this.card.querySelector('.reveal-photo')!.addEventListener('click', () => this.opts.actions.photo())
    this.card.querySelector('.reveal-done')?.addEventListener('click', () => this.opts.actions.done())
  }

  destroy() { this.el.remove() }
}
