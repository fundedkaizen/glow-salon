import type { Application } from 'pixi.js'
import { ambienceStars, toolTier } from '../core/economy.ts'
import type { SalonState } from '../core/salon.ts'
import type { Op, TreatmentResult } from '../core/treatments/session.ts'
import { TreatmentView } from '../render/treatment-view.ts'

/**
 * The thin glue between the salon and a treatment close-up. The floor code calls openTreatment() when a
 * player starts (or joins) work at a station; it then forwards co-op traffic to the returned view:
 *
 *   ops from a partner at this station   -> view.applyRemote(ops, by)
 *   a partner asks for a snapshot        -> send view.snapshot() to them (only the lead is asked)
 *   a snapshot arrives (late joiner)     -> view.applySnapshot(snap)
 *
 * and closes it (view.destroy()) when the station's customer has gone or the player left.
 */
export type TreatmentNet = {
  /** Send this player's ops to the rest of the station's crew (host: route them; guest: send to the host). */
  sendOps: (stationId: string, ops: Op[]) => void
  /** A helper joining late asks the lead for the treatment as it is now. */
  requestSync: (stationId: string) => void
}

export type OpenTreatment = {
  app: Application
  overlay: HTMLElement
  state: Pick<SalonState, 'stations' | 'customers' | 'players' | 'owned'>
  stationId: string
  /** This player's number. */
  me: number
  net: TreatmentNet
  onProgress: (step: number, steps: number, progress: number) => void
  onFinish: (result: TreatmentResult, foam: number) => void
  onLeave: () => void
}

export function openTreatment(o: OpenTreatment): TreatmentView | null {
  const station = o.state.stations.find(s => s.id === o.stationId)
  const customer = station && o.state.customers.find(c => c.id === station.customer)
  if (!station || !customer) return null
  const role = station.lead === o.me ? 'lead' : 'helper'
  const leadName = o.state.players.find(p => p.id === station.lead)?.name ?? 'your partner'
  const view = new TreatmentView({
    app: o.app,
    overlay: o.overlay,
    treatment: customer.plan.treatment,
    customer: { name: customer.plan.name, look: customer.plan.look, seed: customer.plan.seed, disaster: customer.plan.disaster, wish: customer.plan.wish },
    tier: toolTier(o.state.owned, customer.plan.treatment),
    startStep: station.step,
    role,
    leadName,
    playerId: o.me,
    mood: customer.mood,
    ambience: ambienceStars(o.state.owned),
    onOps: ops => o.net.sendOps(o.stationId, ops),
    onProgress: o.onProgress,
    onFinish: o.onFinish,
    onLeave: o.onLeave,
  })
  o.app.stage.addChild(view.root)
  view.resize(o.app.screen.width, o.app.screen.height)
  if (role === 'helper') o.net.requestSync(o.stationId)
  return view
}
