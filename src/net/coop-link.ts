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
    const socket = new WebSocket(`${relayUrl()}${code ? `?room=${encodeURIComponent(code)}` : ''}`)
    this.socket = socket
    this.onStatus({ kind: 'connecting' })
    const timeout = setTimeout(() => {
      if (this.socket !== socket || this.role) return
      this.close()
      this.onStatus({ kind: 'error', reason: 'Could not reach the co-op server. Check the connection and try again.' })
    }, 6000)
    socket.onmessage = event => {
      let message: { t: string; [key: string]: unknown }
      try { message = JSON.parse(String(event.data)) } catch { return }
      if (message.t === 'room') {
        clearTimeout(timeout)
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
        this.onStatus({ kind: 'error', reason: String(message.reason) })
      } else this.onMessage(message as unknown as In)
    }
    socket.onclose = () => {
      if (this.closed || this.socket !== socket) return
      for (const id of [...this.peers]) { this.peers.delete(id); this.onPeer(id, false) }
      this.onStatus({ kind: 'error', reason: 'The connection dropped.' })
    }
    socket.onerror = () => { if (this.socket === socket && !this.role) this.onStatus({ kind: 'error', reason: 'Could not reach the co-op server.' }) }
  }

  /** Send to the host (from a guest), or from the host to the guests `route` names (all of them by default). */
  send(message: Out, route?: CoopRoute) {
    if (this.socket?.readyState === WebSocket.OPEN && this.paired) this.socket.send(JSON.stringify(route ? { ...message, ...route } : message))
  }

  close() {
    this.closed = true
    for (const id of [...this.peers]) { this.peers.delete(id); this.onPeer(id, false) }
    this.role = null
    this.id = 0
    this.socket?.close()
    this.socket = null
  }
}
