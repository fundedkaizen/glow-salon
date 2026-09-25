import { POLISH_COLORS, type TreatmentDef } from '../core/treatments/types.ts'
import type { StepStatus } from '../core/treatments/session.ts'
import { revealTitle } from '../core/reviews.ts'
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
  private scores: HTMLElement
  private four: HTMLElement
  private lastStep = -1
  /** The steps counted in "3 / 12", fixed when the treatment starts: a step that drops out later never changes the total. */
  private planned: number[] | null = null

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
          <div class="thud-scores" hidden style="display:flex;gap:10px;flex-wrap:wrap;margin-top:4px;font:700 13px var(--font)"></div>
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
      <div class="thud-card" hidden></div>
      <div class="thud-four" aria-live="polite" style="position:absolute;left:50%;top:132px;transform:translate(-50%,-8px) scale(0.9);opacity:0;pointer-events:none;transition:opacity .25s,transform .25s;background:linear-gradient(90deg,#e7799c,#9f86e0);color:#fff;font:800 16px var(--font);padding:7px 16px;border-radius:999px;box-shadow:0 4px 14px rgba(120,60,90,.28);white-space:nowrap">Four hands!</div>`
    parent.append(this.el)
    this.tray = this.el.querySelector('.thud-tray')!
    this.title = this.el.querySelector('.thud-title')!
    this.hint = this.el.querySelector('.thud-hint')!
    this.choice = this.el.querySelector('.thud-choice')!
    this.finishBtn = this.el.querySelector('.thud-finish')!
    this.skipBtn = this.el.querySelector('.thud-skip')!
    this.card = this.el.querySelector('.thud-card')!
    this.chip = this.el.querySelector('.thud-chip')!
    this.scores = this.el.querySelector('.thud-scores')!
    this.four = this.el.querySelector('.thud-four')!
    const helper = opts.role === 'helper'
    this.chip.innerHTML = helper ? `Helping <b>${esc(opts.leadName)}</b>` : `<b>${esc(opts.customer)}</b>${opts.wish !== null ? ` wants <span class="swatch-dot" style="--c:#${POLISH_COLORS[opts.wish].hex.toString(16).padStart(6, '0')}"></span>${POLISH_COLORS[opts.wish].name}` : ''}`
    this.skipBtn.hidden = helper
    this.el.querySelector('.thud-leave')!.addEventListener('click', () => opts.actions.leave())
    this.skipBtn.addEventListener('click', () => opts.actions.skip())
    this.finishBtn.addEventListener('click', () => opts.actions.finish())
    this.tray.innerHTML = def.steps.map((s, i) => `<div class="tool" data-i="${i}" title="${esc(s.label)}"><svg class="tool-ring" viewBox="0 0 64 64"><circle cx="32" cy="32" r="29" /></svg><img alt="" src="${toolArt(s.tool).icon}"><span class="tool-check">&#10003;</span><span class="tool-name">${esc(s.label)}</span>${s.optional ? '<span class="tool-opt">extra</span>' : ''}</div>`).join('')
    this.choice.innerHTML = `<span>Pick a colour</span>` + POLISH_COLORS.map((c, i) => `<button class="swatch${opts.wish === i ? ' wish' : ''}" data-i="${i}" style="--c:#${c.hex.toString(16).padStart(6, '0')}" aria-label="${c.name}"></button>`).join('')
    this.choice.querySelectorAll<HTMLButtonElement>('.swatch').forEach(b => b.addEventListener('click', () => {
      // Tapping the tucked-away colour opens the palette again; any other swatch picks it.
      if (this.choice.classList.contains('tucked') && b.classList.contains('picked')) { this.choice.classList.remove('tucked'); return }
      opts.actions.choose(Number(b.dataset.i))
    }))
  }

  setStep(step: number, status: StepStatus[], helperCanChoose = false) {
    const s = this.def.steps[step]
    if (!s) return
    this.title.textContent = `${s.label}`
    this.planned ??= [...this.tray.querySelectorAll<HTMLElement>('.tool:not(.gone)')].map(el => Number(el.dataset.i))
    const total = this.planned.length || this.def.steps.length
    this.title.dataset.count = `${Math.min(total, Math.max(1, this.planned.filter(i => i <= step).length))} / ${total}`
    this.hint.textContent = s.hint
    // Each player's count shows on the steps with spots to do.
    this.scores.hidden = !s.targets || !this.scores.childElementCount
    this.finishBtn.hidden = !s.optional || this.opts.role === 'helper'
    this.skipBtn.hidden = this.opts.role === 'helper' || !!s.optional
    this.choice.hidden = !s.choice || (this.opts.role === 'helper' && !helperCanChoose)
    this.tray.querySelectorAll<HTMLElement>('.tool').forEach((el, i) => {
      el.classList.toggle('current', i === step)
      el.classList.toggle('done', status[i] === 'done')
      el.classList.toggle('skipped', status[i] === 'skipped')
      el.classList.toggle('future', i > step)
    })
    // Only a few tools at a time: the one just used, this one and the next three.
    const shown = [...this.tray.querySelectorAll<HTMLElement>('.tool:not(.gone)')]
    const at = shown.findIndex(el => el.dataset.i === String(step))
    shown.forEach((el, k) => el.classList.toggle('far', k < at - 1 || k > at + 3))
    const cur = this.tray.querySelector<HTMLElement>(`.tool[data-i="${step}"]`)
    this.ring = cur?.querySelector('circle') ?? null
    if (cur && step !== this.lastStep) {
      cur.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
      cur.classList.remove('pop'); void cur.offsetWidth; cur.classList.add('pop')
    }
    this.lastStep = step
    this.setProgress(0)
  }

  /** The step card's line under the title (the helper's gets what they can do: "Help: pop the ones near the chin"). */
  setHint(text: string) { if (text && this.hint.textContent !== text) this.hint.textContent = text }

  /** Co-op: how many spots each player has done, in their colours. */
  setScores(list: { name: string; color: number; n: number }[]) {
    this.scores.innerHTML = list.map(p => `<span style="color:#${p.color.toString(16).padStart(6, '0')}">${esc(p.name)} ${p.n}</span>`).join('')
    this.scores.hidden = !list.length || !this.def.steps[this.lastStep]?.targets
  }

  /** The "Four hands!" badge while both players work at once. */
  fourHands(on: boolean) {
    this.four.style.opacity = on ? '1' : '0'
    this.four.style.transform = `translate(-50%, ${on ? 0 : -8}px) scale(${on ? 1 : 0.9})`
  }

  setProgress(p: number) {
    if (!this.ring) return
    const c = 2 * Math.PI * 29
    this.ring.style.strokeDasharray = `${c}`
    this.ring.style.strokeDashoffset = `${c * (1 - Math.max(0, Math.min(1, p)))}`
  }

  chosen(i: number | undefined) {
    this.choice.querySelectorAll<HTMLElement>('.swatch').forEach((b, k) => b.classList.toggle('picked', k === i))
    if (i !== undefined) { this.choice.classList.add('has-pick'); setTimeout(() => this.choice.classList.add('tucked'), 350) }
  }

  /** The step reached its goal: a little celebration on the tray. */
  ready() {
    const cur = this.tray.querySelector<HTMLElement>('.tool.current')
    cur?.classList.add('ready')
    this.setProgress(1)
  }

  hideControls() { this.el.classList.add('revealing') }
  /** Fade the tray while the tool in hand passes behind it (screen y of the tool's lowest point, CSS px). */
  toolAt(bottom: number | null) {
    const top = bottom === null ? Infinity : this.tray.getBoundingClientRect().top
    this.tray.classList.toggle('under-tool', bottom !== null && bottom > top + 6)
  }

  /** A helper who takes over becomes the lead: they get Skip, Finish and the choices. */
  setRole(role: 'lead' | 'helper') {
    this.opts.role = role
    this.chip.innerHTML = role === 'helper' ? `Helping <b>${esc(this.opts.leadName)}</b>` : `<b>${esc(this.opts.customer)}</b>`
  }

  /** A step this customer does not need: it leaves the tray. */
  hideStep(i: number) {
    this.tray.querySelector<HTMLElement>(`.tool[data-i="${i}"]`)?.classList.add('gone')
  }

  showReveal(o: { name: string; stars: number; lead: boolean }) {
    this.card.hidden = false
    this.card.innerHTML = `
      <div class="reveal-name">${esc(revealTitle(o.name, o.stars))}</div>
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
