import type { Application } from 'pixi.js'
import { startSalon } from './salon-app.ts'

/** The game: title, salon floor, treatments, co-op (salon-app.ts runs it all; treatments open through treatment-glue.ts). */
export async function startGame(app: Application, ui: HTMLElement) {
  const game = await startSalon(app, ui)
  ;(window as unknown as { salonGame: unknown }).salonGame = game
}
