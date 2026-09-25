/**
 * Small pastel SVG icons for the salon UI (tabs, chips, awards). Filled shapes with a soft darker outline,
 * matching the painted art; no emoji anywhere in the interface.
 */
const svg = (body: string, vb = '0 0 32 32') => `<svg viewBox="${vb}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body}</svg>`
const line = 'stroke="#8a5a74" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"'

export const ICON = {
  coin: svg(`<circle cx="16" cy="16" r="12" fill="#f7cf62" ${line}/><circle cx="16" cy="16" r="8" fill="#fbe18f"/><path d="M16 11v10M13 13.5c0-1.4 1.3-2 3-2s3 .8 3 2-1.3 1.7-3 2.2-3 .9-3 2.3 1.3 2 3 2 3-.7 3-2" fill="none" stroke="#c28a16" stroke-width="1.6" stroke-linecap="round"/>`),
  star: svg(`<path d="M16 4l3.6 7.4 8.1 1.1-5.9 5.7 1.4 8L16 22.4 8.8 26.2l1.4-8-5.9-5.7 8.1-1.1z" fill="#f7c948" ${line}/><path d="M12 12.5l2.6-.4" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".8"/>`),
  sun: svg(`<circle cx="16" cy="16" r="7" fill="#fbd46a" ${line}/>${[0, 45, 90, 135, 180, 225, 270, 315].map(a => `<path d="M16 3.5v3" transform="rotate(${a} 16 16)" stroke="#f0a92e" stroke-width="2" stroke-linecap="round"/>`).join('')}`),
  moon: svg(`<path d="M21 5a11 11 0 1 0 6 16A9 9 0 0 1 21 5z" fill="#cdbdf2" ${line}/>`),
  music: svg(`<path d="M12 22V8l13-3v14" fill="none" stroke="#8f78d6" stroke-width="2.4" stroke-linecap="round"/><circle cx="9" cy="22" r="3.6" fill="#b9a5ee"/><circle cx="22" cy="19" r="3.6" fill="#b9a5ee"/>`),
  next: svg(`<path d="M8 7l11 9-11 9z" fill="#8f78d6"/><rect x="21" y="7" width="3.4" height="18" rx="1.7" fill="#8f78d6"/>`),
  gear: svg(`<path d="M16 5l2 .3.7 2.6 2.2 1.2 2.5-1 1.5 1.4-1 2.5 1.2 2.2 2.6.7.3 2-.3 2-2.6.7-1.2 2.2 1 2.5-1.5 1.4-2.5-1-2.2 1.2-.7 2.6-2 .3-2-.3-.7-2.6-2.2-1.2-2.5 1-1.5-1.4 1-2.5-1.2-2.2L5.3 18 5 16l.3-2 2.6-.7 1.2-2.2-1-2.5 1.5-1.4 2.5 1 2.2-1.2.7-2.6z" fill="#f7b7cc" ${line}/><circle cx="16" cy="16" r="4" fill="#fff" ${line}/>`),
  close: svg(`<path d="M9 9l14 14M23 9L9 23" stroke="#d9577f" stroke-width="3" stroke-linecap="round"/>`),
  pencil: svg(`<path d="M7 25l1.5-5.5L21 7l4 4L12.5 23.5z" fill="#fbe18f" ${line}/><path d="M19 9l4 4" ${line}/><path d="M7 25l1.5-5.5 4 4z" fill="#f7b7cc"/>`),
  tools: svg(`<rect x="6" y="14" width="8" height="14" rx="3" fill="#f7b7cc" ${line}/><path d="M10 14V5" stroke="#b7a6c9" stroke-width="3" stroke-linecap="round"/><circle cx="22" cy="10" r="5" fill="none" stroke="#9580dc" stroke-width="2.6"/><path d="M22 15v13" stroke="#9580dc" stroke-width="3" stroke-linecap="round"/>`),
  chair: svg(`<rect x="8" y="4" width="16" height="15" rx="7" fill="#f7b7cc" ${line}/><rect x="6" y="16" width="20" height="7" rx="3.5" fill="#fbd3de" ${line}/><path d="M16 23v4M10 28h12" stroke="#e2b456" stroke-width="2.4" stroke-linecap="round"/>`),
  sparkle: svg(`<path d="M14 4c1 6 3 8 9 9-6 1-8 3-9 9-1-6-3-8-9-9 6-1 8-3 9-9z" fill="#cdbdf2" ${line}/><path d="M24 18c.5 3 1.5 4 4.5 4.5-3 .5-4 1.5-4.5 4.5-.5-3-1.5-4-4.5-4.5 3-.5 4-1.5 4.5-4.5z" fill="#f7b7cc" ${line}/>`),
  plant: svg(`<path d="M10 20h12l-2 8h-8z" fill="#f7b7cc" ${line}/><path d="M16 20c0-6-6-8-9-7 1 4 4 7 9 7zM16 20c0-7 5-11 10-10-1 5-5 10-10 10z" fill="#9fd8a8" ${line}/>`),
  megaphone: svg(`<path d="M6 13h5l12-6v18l-12-6H6z" fill="#fbe18f" ${line}/><path d="M9 19l2 7h3l-1-7" fill="#f7b7cc" ${line}/><path d="M26 12c1.5 1 1.5 7 0 8" fill="none" stroke="#9580dc" stroke-width="2" stroke-linecap="round"/>`),
  staff: svg(`<circle cx="16" cy="11" r="6" fill="#fbd9c4" ${line}/><path d="M10 9c1-4 11-5 12 1-3-2-8-2-12-1z" fill="#8a5a74"/><path d="M6 28c0-6 4-9 10-9s10 3 10 9z" fill="#a9e3cf" ${line}/><rect x="17.5" y="22" width="5" height="3" rx="1" fill="#fff"/>`),
  heart: svg(`<path d="M16 27C4 19 5 9 11 8c3 0 4.5 2 5 3 .5-1 2-3 5-3 6 1 7 11-5 19z" fill="#f48fb1" ${line}/><path d="M10 12c1-1.5 2.5-1.8 3.5-1.4" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".8"/>`),
  trophy: svg(`<path d="M10 5h12v6a6 6 0 0 1-12 0z" fill="#f7c948" ${line}/><path d="M10 7H6c0 4 2 6 4.5 6M22 7h4c0 4-2 6-4.5 6" fill="none" ${line}/><path d="M14 17h4l1 5h-6z" fill="#f0ad2e"/><rect x="10" y="22" width="12" height="5" rx="2" fill="#cdbdf2" ${line}/>`),
  gift: svg(`<rect x="6" y="13" width="20" height="14" rx="3" fill="#f7b7cc" ${line}/><rect x="5" y="9" width="22" height="6" rx="2" fill="#fbd3de" ${line}/><path d="M16 9v18" stroke="#9580dc" stroke-width="3"/><path d="M16 9c-2-5-8-5-7-1 1 2 5 1 7 1zM16 9c2-5 8-5 7-1-1 2-5 1-7 1z" fill="#cdbdf2" ${line}/>`),
  cup: svg(`<path d="M7 12h15v7a6 6 0 0 1-6 6h-3a6 6 0 0 1-6-6z" fill="#fff" ${line}/><path d="M22 14h2a3 3 0 0 1 0 6h-2" fill="none" ${line}/><path d="M12 5c-1 2 1 3 0 5M16 5c-1 2 1 3 0 5" stroke="#cdbdf2" stroke-width="1.6" stroke-linecap="round"/>`),
  users: svg(`<circle cx="11" cy="11" r="4.5" fill="#f7b7cc" ${line}/><circle cx="22" cy="12" r="4" fill="#a9e3cf" ${line}/><path d="M3 26c0-5 3.5-8 8-8s8 3 8 8z" fill="#f7b7cc" ${line}/><path d="M17 25c.5-4 2.5-6.5 5-6.5 3.5 0 6.5 2.5 6.5 6.5z" fill="#a9e3cf" ${line}/>`),
  save: svg(`<rect x="6" y="5" width="20" height="22" rx="4" fill="#cdbdf2" ${line}/><rect x="10" y="5" width="12" height="7" rx="1.5" fill="#fff" ${line}/><rect x="10" y="17" width="12" height="7" rx="2" fill="#f7b7cc" ${line}/>`),
  copy: svg(`<rect x="10" y="9" width="15" height="17" rx="3" fill="#fff" ${line}/><path d="M7 21V8a2 2 0 0 1 2-2h11" fill="none" ${line}/>`),
  cat: svg(`<path d="M8 12l1-7 5 4h4l5-4 1 7c2 2 3 5 2 8-1 5-6 7-10 7s-9-2-10-7c-1-3 0-6 2-8z" fill="#f3b270" ${line}/><circle cx="12.5" cy="17" r="1.4" fill="#4a2c38"/><circle cx="19.5" cy="17" r="1.4" fill="#4a2c38"/><path d="M15 20.5h2l-1 1z" fill="#e98aa0"/>`),
  bag: svg(`<path d="M7 11h18l-1.5 15h-15z" fill="#f7b7cc" ${line}/><path d="M12 11V9a4 4 0 0 1 8 0v2" fill="none" ${line}/>`),
}

export type IconName = keyof typeof ICON
