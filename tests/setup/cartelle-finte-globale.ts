import { mkdtempSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { cancellaSicura } from '../../src/shared/cancella-sicura'
import { cartelleFinte, VARIABILI_FINTE } from './cartelle-finte-comuni'

/**
 * Prima di tutta la suite (0.72.0): una cartella finta che fa da casa, AppData
 * e Temp per tutti i test, e le variabili che la indicano. I processi dei
 * test (e i loro figli: git, bash, node) nascono già con queste.
 * Alla fine la cartella finta se ne va, dalla guardia, e solo lei.
 *
 * Una volta sola per tutta la suite (0.85.1): con i progetti «veloci» e
 * «lenti» vitest chiama questa preparazione una volta per progetto, nello
 * stesso processo. La seconda volta le variabili puntavano già sulla prima
 * cartella finta: ne nasceva una dentro l'altra (percorsi oltre il limite di
 * Windows, «Filename too long» da git) e la guardia prendeva la prima finta
 * per la casa vera. Chi arriva dopo usa quella che c'è.
 */
const GIA_PRONTA = Symbol.for('sierradeck.test.cartelle-finte')

export default function preparaCartelleFinte(): () => void {
  const globale = globalThis as Record<symbol, unknown>
  if (typeof globale[GIA_PRONTA] === 'string') return () => {}
  const veri = {
    casa: homedir(),
    temp: tmpdir(),
    appdata: process.env.APPDATA,
    localappdata: process.env.LOCALAPPDATA,
    userprofile: process.env.USERPROFILE,
    home: process.env.HOME
  }
  const radice = mkdtempSync(join(veri.temp, 'sierradeck-test-finta-'))
  globale[GIA_PRONTA] = radice
  process.env.SIERRADECK_TEST_FINTA = radice
  process.env.SIERRADECK_TEST_VERI = JSON.stringify(veri)
  const finte = cartelleFinte(radice)
  for (const v of VARIABILI_FINTE) process.env[v] = finte[v]
  return () => {
    try {
      cancellaSicura(radice, {
        dentro: [veri.temp],
        ambiente: {
          windows: process.platform === 'win32',
          casa: veri.casa,
          temp: veri.temp,
          env: { APPDATA: veri.appdata, LOCALAPPDATA: veri.localappdata, USERPROFILE: veri.userprofile, HOME: veri.home, TEMP: veri.temp, TMP: veri.temp }
        }
      })
    } catch (err) {
      console.warn(`[test] cartella finta non tolta (${radice}): ${String(err)}`)
    }
  }
}
