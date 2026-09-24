/** Tiny DOM helpers for the UI layer. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', html = ''): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  if (className) el.className = className
  if (html) el.innerHTML = html
  return el
}

export function esc(text: unknown) {
  return String(text ?? '').replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' })[c]!)
}

export const money = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(Math.round(n)).toLocaleString('en-US')}`

export function starsHtml(value: number, cls = 'stars') {
  const full = Math.floor(value), half = value - full >= 0.25 && value - full < 0.75, extra = value - full >= 0.75 ? 1 : 0
  let out = ''
  for (let i = 0; i < 5; i++) {
    const on = i < full + extra ? 'on' : i === full && half ? 'half' : ''
    out += `<i class="${on}">&#9733;</i>`
  }
  return `<span class="${cls}">${out}</span>`
}
