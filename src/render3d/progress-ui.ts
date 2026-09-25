import { esc, money } from '../ui/dom.ts'

/**
 * The progression UI over the 3D salon, in the game's own pastel style: the level bar at the top left (cash earned
 * toward the next unlock, like Serenity's "0/640"), the buy card for a ghost, the style strip (a "Customize!" ribbon
 * and three style cards with rendered thumbnails), and the Decorate button for restyling pieces in the morning.
 * DOM only; the floor tells it what to show and hears back through the hooks.
 */
export type ProgressHooks = {
  onBuy: (id: string) => void
  onCancelBuy: () => void
  onStyle: (key: string, style: number) => void
  onStylesDone: () => void
  onDecorate: (on: boolean) => void
}

export type StyleCard = { name: string; thumb: string }

const CSS = `
.g3-bar{position:absolute;left:12px;top:150px;pointer-events:none;display:flex;align-items:center;gap:8px;padding:6px 12px 6px 6px;border-radius:999px;background:rgba(255,255,255,.95);box-shadow:0 6px 18px rgba(160,90,120,.18);font:800 13px Nunito,system-ui,sans-serif;color:#5a3a52;transition:transform .25s}
.g3-bar.bump{animation:g3-bump .7s cubic-bezier(.3,1.6,.5,1)}
.g3-lv{display:grid;place-items:center;min-width:34px;height:34px;padding:0 6px;border-radius:999px;background:linear-gradient(180deg,#f8a3bf,#e2729a);color:#fff;font:700 15px Fredoka,Nunito,sans-serif;box-shadow:inset 0 -2px 0 rgba(160,40,80,.25)}
.g3-bar-main{display:flex;flex-direction:column;gap:3px;min-width:150px}
.g3-bar-top{display:flex;justify-content:space-between;gap:10px;font-size:11px;color:#8a6a80}
.g3-bar-top b{color:#5a3a52;font-size:12px}
.g3-track{height:10px;border-radius:99px;background:#f6e3ea;overflow:hidden;box-shadow:inset 0 1px 2px rgba(120,60,84,.15)}
.g3-track i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,#8fe0c4,#45b890);transition:width .6s}
.g3-num{font-size:11px;color:#5a3a52}
.g3-ribbon{position:absolute;left:50%;top:10px;transform:translateX(-50%);padding:8px 38px 10px;border-radius:0 0 22px 22px;background:linear-gradient(180deg,#f7a6c3,#c69bf0);color:#fff;font:700 30px Fredoka,Nunito,sans-serif;letter-spacing:.5px;text-shadow:0 2px 0 rgba(120,50,110,.35);box-shadow:0 8px 20px rgba(150,80,140,.3);pointer-events:none;white-space:nowrap;animation:g3-drop .45s cubic-bezier(.3,1.5,.5,1)}
.g3-ribbon small{display:block;font:800 12px Nunito,sans-serif;text-align:center;text-shadow:none;opacity:.95}
.g3-strip{position:absolute;left:50%;bottom:calc(14px + env(safe-area-inset-bottom));transform:translateX(-50%);display:flex;gap:12px;align-items:flex-end;pointer-events:auto;animation:g3-rise .35s cubic-bezier(.3,1.4,.5,1)}
.g3-card{width:118px;padding:6px 6px 8px;border-radius:18px;background:#fff8ec;border:3px solid #fff;box-shadow:0 8px 20px rgba(150,90,110,.25);display:flex;flex-direction:column;align-items:center;gap:2px;cursor:pointer;font:800 13px Nunito,sans-serif;color:#5a3a52;transition:transform .15s}
.g3-card img{width:104px;height:78px;object-fit:contain}
.g3-card.on{border-color:#f0c36a;background:#fff3d6;transform:translateY(-6px) scale(1.04);box-shadow:0 0 0 3px rgba(240,195,106,.45),0 12px 26px rgba(200,140,60,.35)}
.g3-card.pop{animation:g3-pop .45s cubic-bezier(.3,1.8,.5,1)}
.g3-done{width:56px;height:56px;border-radius:50%;background:linear-gradient(180deg,#8fe0c4,#45b890);color:#fff;font:800 26px Nunito,sans-serif;display:grid;place-items:center;box-shadow:0 8px 18px rgba(69,184,144,.4);cursor:pointer;margin-left:4px}
.g3-buy{position:absolute;left:50%;bottom:calc(16px + env(safe-area-inset-bottom));transform:translateX(-50%);width:min(420px,calc(100vw - 24px));display:flex;gap:12px;align-items:center;padding:12px;border-radius:24px;background:#fff;box-shadow:0 14px 34px rgba(150,80,110,.3);pointer-events:auto;animation:g3-rise .3s cubic-bezier(.3,1.4,.5,1);font:700 13px Nunito,sans-serif;color:#5a3a52}
.g3-buy img{width:96px;height:72px;object-fit:contain;flex:none;border-radius:14px;background:#fbf1f5}
.g3-buy h3{margin:0 0 2px;font:700 18px Fredoka,Nunito,sans-serif;color:#d9577f}
.g3-buy p{margin:0 0 8px;font-weight:700;color:#8a6a80;line-height:1.3}
.g3-buy .g3-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.g3-price{display:inline-flex;align-items:center;gap:5px;font:800 16px Nunito,sans-serif;color:#b8812b}
.g3-price i{width:18px;height:18px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#ffe9a6,#f0b840);box-shadow:inset 0 -2px 0 rgba(160,110,20,.35)}
.g3-need{font-size:12px;color:#c0607a}
.g3-deco{position:absolute;left:12px;bottom:calc(16px + env(safe-area-inset-bottom));pointer-events:auto;display:inline-flex;align-items:center;gap:8px;min-height:46px;padding:0 18px 0 14px;border-radius:999px;background:linear-gradient(180deg,#c6b5f4,#9580dc);color:#fff;font:800 15px Nunito,sans-serif;box-shadow:0 10px 22px rgba(149,128,220,.38),inset 0 -3px 0 rgba(80,60,150,.22);cursor:pointer}
.g3-deco.on{background:linear-gradient(180deg,#8fe0c4,#45b890);box-shadow:0 10px 22px rgba(69,184,144,.38)}
@keyframes g3-bump{40%{transform:scale(1.12)}}
@keyframes g3-pop{40%{transform:translateY(-10px) scale(1.14)}}
@keyframes g3-drop{from{transform:translate(-50%,-80px)}}
@keyframes g3-rise{from{opacity:0;transform:translate(-50%,40px)}}
@media (max-width:520px){.g3-deco{bottom:calc(88px + env(safe-area-inset-bottom));min-height:40px;padding:0 14px 0 10px;font-size:14px}.g3-card{width:92px}.g3-card img{width:80px;height:60px}.g3-ribbon{font-size:24px;padding:6px 26px 8px}.g3-bar-main{min-width:118px}}
`

const BRUSH = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18.4 2.6a2 2 0 0 1 3 3L12 15l-4 1 1-4z"/><path d="M7 16c-2 0-3 1.5-3 3s-1 2-2 2c1.5 1 5 1 6.5-.5S10 17 7 16z"/></svg>'

export class ProgressUi {
  private root: HTMLDivElement
  private bar: HTMLDivElement
  private ribbon: HTMLDivElement | null = null
  private strip: HTMLDivElement | null = null
  private buy: HTMLDivElement | null = null
  private deco: HTMLButtonElement
  private hooks: ProgressHooks
  private barKey = ''
  private level = 0
  private decorating = false
  styleKey: string | null = null

  constructor(host: HTMLElement, hooks: ProgressHooks) {
    this.hooks = hooks
    if (!document.getElementById('g3-css')) { const s = document.createElement('style'); s.id = 'g3-css'; s.textContent = CSS; document.head.append(s) }
    this.root = document.createElement('div')
    this.root.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:4'
    this.bar = document.createElement('div')
    this.bar.className = 'g3-bar'
    this.deco = document.createElement('button')
    this.deco.className = 'g3-deco'
    this.deco.innerHTML = `${BRUSH}<span>Decorate</span>`
    this.deco.hidden = true
    this.deco.onclick = () => this.hooks.onDecorate(!this.decorating)
    this.root.append(this.bar, this.deco)
    host.append(this.root)
  }

  /** The level bar: earned toward the next level, and what that level opens. */
  setLevel(level: number, nextName: string, have: number, need: number) {
    const key = `${level}|${Math.floor(have)}|${need}`
    if (key === this.barKey) return
    const up = this.level && level > this.level
    this.barKey = key
    this.level = level
    const pct = Math.max(0, Math.min(100, (have / Math.max(1, need)) * 100))
    this.bar.innerHTML = `<span class="g3-lv">${level}</span><div class="g3-bar-main"><div class="g3-bar-top"><b>Level ${level + 1}: ${esc(nextName)}</b></div><div class="g3-track"><i style="width:${pct}%"></i></div><span class="g3-num">${money(have)} / ${money(need)}</span></div>`
    if (up) { this.bar.classList.remove('bump'); void this.bar.offsetWidth; this.bar.classList.add('bump') }
  }

  /** Keep the bar just under the HUD's left column. */
  place(top: number, left: number) { this.bar.style.top = `${Math.round(top)}px`; this.bar.style.left = `${Math.round(left)}px` }

  set visible(on: boolean) { this.root.style.display = on ? '' : 'none' }

  /** The Decorate button shows in the morning; `on` while decorating. */
  setDecorate(available: boolean, on: boolean) {
    this.decorating = on
    this.deco.hidden = !available || !!this.strip || !!this.buy
    this.deco.classList.toggle('on', on)
    this.deco.querySelector('span')!.textContent = on ? 'Done' : 'Decorate'
    if (on && !this.strip) this.showRibbon('Decorate!', 'Tap a piece to change its look')
    else if (!on && !this.strip) this.hideRibbon()
  }

  private showRibbon(text: string, sub = '') {
    this.hideRibbon()
    this.ribbon = document.createElement('div')
    this.ribbon.className = 'g3-ribbon'
    this.ribbon.innerHTML = `${esc(text)}${sub ? `<small>${esc(sub)}</small>` : ''}`
    this.root.append(this.ribbon)
  }
  private hideRibbon() { this.ribbon?.remove(); this.ribbon = null }

  /** The buy card for a ghost. */
  showBuy(id: string, name: string, blurb: string, price: number, thumb: string, reason: string | null) {
    this.hideBuy()
    const card = document.createElement('div')
    card.className = 'g3-buy'
    card.innerHTML = `<img alt="" src="${thumb}"><div style="flex:1;min-width:0"><h3>${esc(name)}</h3><p>${esc(blurb)}</p><div class="g3-row"><span class="g3-price"><i></i>${money(price)}</span>${reason ? `<span class="g3-need">${esc(reason)}</span>` : ''}<span style="flex:1"></span><button class="gs-btn small">Not now</button><button class="gs-btn small pink"${reason ? ' disabled' : ''}>Buy</button></div></div>`
    const [no, yes] = card.querySelectorAll('button')
    no.onclick = () => { this.hideBuy(); this.hooks.onCancelBuy() }
    yes.onclick = () => { this.hideBuy(); this.hooks.onBuy(id) }
    this.root.append(card)
    this.buy = card
    this.deco.hidden = true
  }
  hideBuy() { this.buy?.remove(); this.buy = null }
  get buying() { return !!this.buy }

  /** The style strip: a ribbon and three cards; `on` is the chosen one. */
  showStyles(key: string, title: string, cards: StyleCard[], on: number) {
    this.hideStyles()
    this.styleKey = key
    this.showRibbon('Customize!', title)
    const strip = document.createElement('div')
    strip.className = 'g3-strip'
    cards.forEach((c, i) => {
      const card = document.createElement('button')
      card.className = `g3-card${i === on ? ' on' : ''}`
      card.innerHTML = `<img alt="" src="${c.thumb}"><span>${esc(c.name)}</span>`
      card.onclick = () => {
        strip.querySelectorAll('.g3-card').forEach((el, k) => el.classList.toggle('on', k === i))
        card.classList.remove('pop'); void card.offsetWidth; card.classList.add('pop')
        this.hooks.onStyle(key, i)
      }
      strip.append(card)
    })
    const done = document.createElement('button')
    done.className = 'g3-done'
    done.textContent = '✓'
    done.onclick = () => this.hooks.onStylesDone()
    strip.append(done)
    this.root.append(strip)
    this.strip = strip
    this.deco.hidden = true
  }
  hideStyles() { this.strip?.remove(); this.strip = null; this.styleKey = null; if (!this.decorating) this.hideRibbon(); else this.showRibbon('Decorate!', 'Tap a piece to change its look') }

  destroy() { this.root.remove() }
}
