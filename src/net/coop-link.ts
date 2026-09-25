import type { GuestMessage, HostMessage } from '../core/coop/protocol.ts'

/**
 * The browser side of the co-op relay (server/coop-relay.mjs): one WebSocket to /coop on the same server
 * that serves the game. The host opens a room and gets a five-letter code; guests join with it (the invite
 * link carries it as ?room=CODE). The relay numbers everyone (host 0, guests 1 to 3), forwards guests'
 * messages to the host with `from` set, and the host's messages to one guest (`to`) or all of them.
 */
export type LinkEvents = {
  onRoom: (code: string, role: 'host' | 'guest', id: number) => void
  onPeer: (joined: boolean, id: number, hostLeft: boolean) => void
  onHostMessage: (msg: HostMessage) => void
  onGuestMessage: (msg: GuestMessage, from: number) => void
  onError: (reason: string) => void
  onClosed: () => void
}

export class CoopLink {
  private ws: WebSocket
  role: 'host' | 'guest' | null = null
  id = -1
  code = ''
  private ev: LinkEvents
  private closedByUs = false

  private constructor(url: string, ev: LinkEvents) {
    this.ev = ev
    this.ws = new WebSocket(url)
    this.ws.onmessage = e => this.receive(String(e.data))
    this.ws.onerror = () => ev.onError('Could not reach the co-op server.')
    this.ws.onclose = () => { if (!this.closedByUs) ev.onClosed() }
  }

  private static url(room?: string) {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    return `${proto}://${location.host}/coop${room ? `?room=${encodeURIComponent(room)}` : ''}`
  }

  static host(ev: LinkEvents) { return new CoopLink(CoopLink.url(), ev) }
  static join(code: string, ev: LinkEvents) { return new CoopLink(CoopLink.url(code.trim().toUpperCase()), ev) }

  /** The link friends open to join this room. */
  inviteUrl() {
    const u = new URL(location.href)
    u.search = ''
    u.searchParams.set('room', this.code)
    return u.toString()
  }

  private receive(text: string) {
    let m: Record<string, unknown>
    try { m = JSON.parse(text) } catch { return }
    if (!m || typeof m !== 'object') return
    if (m.t === 'room') { this.code = String(m.code); this.role = m.you === 'host' ? 'host' : 'guest'; this.id = Number(m.id); this.ev.onRoom(this.code, this.role, this.id); return }
    if (m.t === 'error') { this.ev.onError(String(m.reason ?? 'Something went wrong.')); return }
    if (m.t === 'peer') { this.ev.onPeer(!!m.joined, Number(m.id), !!m.hostLeft); return }
    if (this.role === 'host' && typeof m.from === 'number') { const { from, ...rest } = m; this.ev.onGuestMessage(rest as unknown as GuestMessage, from as number); return }
    if (this.role === 'guest') this.ev.onHostMessage(m as unknown as HostMessage)
  }

  /** A guest's message to the host. */
  toHost(msg: GuestMessage) { this.raw(msg) }
  /** A host's message to one guest, or to every guest. */
  toGuest(msg: HostMessage, to?: number) { this.raw(to === undefined ? msg : { ...msg, to }) }

  private raw(msg: unknown) { if (this.ws.readyState === 1) this.ws.send(JSON.stringify(msg)) }

  get open() { return this.ws.readyState === 1 }

  close() { this.closedByUs = true; this.ws.close() }
}
