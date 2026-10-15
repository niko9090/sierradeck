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
 */
export default function preparaCartelleFinte(): () => void {
  const veri = {
    casa: homedir(),
    temp: tmpdir(),
    appdata: process.env.APPDATA,
    localappdata: process.env.LOCALAPPDATA,
    userprofile: process.env.USERPROFILE,
    home: process.env.HOME
  }
  const radice = mkdtempSync(join(veri.temp, 'sierradeck-test-finta-'))
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
