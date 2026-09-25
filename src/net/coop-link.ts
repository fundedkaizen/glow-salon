/**
 * The co-op connection: a WebSocket to the room relay (server/coop-relay.mjs, the same protocol as Dead
 * Ink's). Players are numbered: the host 0, guests 1 to 3. Guests' messages reach the host marked with
 * `from`; the host sends to one guest (`to`), all but one (`skip`), or everyone.
 *
 * The relay URL comes from VITE_COOP_URL at build time (production: wss://coop.kaizenbot.cloud/coop, shared
 * by several games and kept apart by room codes), falling back to this page's own host at /coop (dev and
 * preview, where the relay rides on the Vite server).
 */
export type CoopRole = 'host' | 'guest'

export type CoopStatus =
  | { kind: 'idle' }
  | { kind: 'connecting' }
  | { kind: 'waiting'; code: string; link: string }
  | { kind: 'paired'; code: string; link: string; role: CoopRole }
  | { kind: 'alone'; code: string; link: string; role: CoopRole }
  | { kind: 'error'; reason: string }

export type CoopRoute = { to?: number; skip?: number }

/** The largest frame this client sends; the relay's limit is 256 KB. */
export const MAX_FRAME = 200_000

export function relayUrl(): string {
  const configured = (import.meta.env?.VITE_COOP_URL as string | undefined) || ''
  if (configured) return configured
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws'
  return `${scheme}://${location.host}/coop`
}

/** The invite link for a room: this page with ?join=CODE. */
export function inviteLink(code: string) {
  const url = new URL(location.href)
  url.search = ''
  url.hash = ''
  url.searchParams.set('join', code)
  return url.toString()
}

export class CoopLink<Out extends { t: string }, In extends { t: string } = Out & { from?: number }> {
  role: CoopRole | null = null
  /** This player's number: the host 0, guests 1 to 3. */
  id = 0
  code = ''
  link = ''
  /** Who else is connected: on the host its guests' numbers, on a guest 0 (the host) while it is there. */
  readonly peers = new Set<number>()
  private socket: WebSocket | null = null
  private closed = false
  /** The relay's key for this seat: coming back with it takes the same room and number (server/coop-relay.mjs). */
  private key = ''
  /** When the socket dropped (0 while connected), and the next try to come back. */
  private droppedAt = 0
  private retry: ReturnType<typeof setTimeout> | null = null
  private watching = false
  private onMessage: (message: In) => void
  private onStatus: (status: CoopStatus) => void
  private onPeer: (id: number, joined: boolean) => void

  constructor(onMessage: (message: In) => void, onStatus: (status: CoopStatus) => void, onPeer: (id: number, joined: boolean) => void = () => {}) {
    this.onMessage = onMessage
    this.onStatus = onStatus
    this.onPeer = onPeer
  }

  get paired() { return this.peers.size > 0 }
  get active() { return !!this.socket && !this.closed }

  /** Open a room as the host, or join `code` as a guest. */
  open(code?: string) {
    this.close()
    this.closed = false
    this.key = ''
    this.watchVisibility()
    this.connect(code ?? '', '')
  }

  /** A phone that comes back to the page reconnects at once, instead of waiting for the next try. */
  private watchVisibility() {
    if (this.watching || typeof document === 'undefined') return
    this.watching = true
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.droppedAt && !this.closed) this.resume()
    })
  }

  /** Take this seat back after a drop (the relay holds it for about 90 s). */
  private resume() {
    if (this.retry) { clearTimeout(this.retry); this.retry = null }
    if (Date.now() - this.droppedAt > 85000) {
      this.droppedAt = 0
      this.close()
      this.onStatus({ kind: 'error', reason: 'The connection dropped.' })
      return
    }
    this.connect(this.code, this.key)
  }

  private connect(code: string, key: string) {
    const query = code ? `?room=${encodeURIComponent(code)}${key ? `&key=${encodeURIComponent(key)}` : ''}` : ''
    const socket = new WebSocket(`${relayUrl()}${query}`)
    this.socket = socket
    const resuming = !!key
    let answered = false
    if (!resuming) this.onStatus({ kind: 'connecting' })
    const timeout = setTimeout(() => {
      if (this.socket !== socket || answered) return
      if (resuming) { try { socket.close() } catch { /* gone */ } return }
      this.close()
      this.onStatus({ kind: 'error', reason: 'Could not reach the co-op server. Check the connection and try again.' })
    }, 6000)
    socket.onmessage = event => {
      let message: { t: string; [key: string]: unknown }
      try { message = JSON.parse(String(event.data)) } catch { return }
      if (message.t === 'room') {
        clearTimeout(timeout)
        answered = true
        this.droppedAt = 0
        if (typeof message.key === 'string') this.key = message.key
        if (message.resumed) { this.onStatus(this.paired ? { kind: 'paired', code: this.code, link: this.link, role: this.role! } : this.role === 'host' ? { kind: 'waiting', code: this.code, link: this.link } : { kind: 'alone', code: this.code, link: this.link, role: 'guest' }); return }
        this.role = message.you as CoopRole
        this.id = Number(message.id ?? 0)
        this.code = String(message.code)
        this.link = inviteLink(this.code)
        this.onStatus(this.role === 'host' ? { kind: 'waiting', code: this.code, link: this.link } : { kind: 'alone', code: this.code, link: this.link, role: 'guest' })
      } else if (message.t === 'peer') {
        const id = Number(message.id ?? 0)
        if (message.joined) this.peers.add(id); else this.peers.delete(id)
        this.onPeer(id, !!message.joined)
        this.onStatus(this.paired ? { kind: 'paired', code: this.code, link: this.link, role: this.role! }
          : message.hostLeft ? { kind: 'error', reason: 'Your friend closed their salon.' }
          : this.role === 'host' ? { kind: 'waiting', code: this.code, link: this.link } : { kind: 'alone', code: this.code, link: this.link, role: 'guest' })
      } else if (message.t === 'error') {
        // The relay closes after an error; keep its reason rather than "the connection dropped".
        this.closed = true
        this.onStatus({ kind: 'error', reason: String(message.reason) })
      } else this.onMessage(message as unknown as In)
    }
    socket.onclose = () => {
      if (this.closed || this.socket !== socket) return
      // Before the room existed: nothing to come back to.
      if (!this.key || !this.code) {
        for (const id of [...this.peers]) { this.peers.delete(id); this.onPeer(id, false) }
        this.onStatus({ kind: 'error', reason: 'The connection dropped.' })
        return
      }
      // A drop (a phone leaving the page, a hiccup): keep the room and the players, and come back to the same seat.
      if (!this.droppedAt) this.droppedAt = Date.now()
      this.retry = setTimeout(() => this.resume(), 2000)
    }
    socket.onerror = () => { if (this.socket === socket && !this.role && !resuming) this.onStatus({ kind: 'error', reason: 'Could not reach the co-op server.' }) }
  }

  /** Send to the host (from a guest), or from the host to the guests `route` names (all of them by default). */
  send(message: Out, route?: CoopRoute) {
    if (this.socket?.readyState !== WebSocket.OPEN || !this.paired) return
    const text = JSON.stringify(route ? { ...message, ...route } : message)
    // The relay drops (and may be shared by other games): never send a frame near its 256 KB limit.
    if (text.length > MAX_FRAME) { console.warn(`co-op: dropped a ${message.t} message of ${text.length} bytes`); return }
    this.socket.send(text)
  }

  close() {
    this.closed = true
    if (this.retry) { clearTimeout(this.retry); this.retry = null }
    this.droppedAt = 0
    for (const id of [...this.peers]) { this.peers.delete(id); this.onPeer(id, false) }
    this.role = null
    this.id = 0
    this.socket?.close()
    this.socket = null
  }
}
