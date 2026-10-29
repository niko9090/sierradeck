import fs from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach } from 'vitest'
import { cartelleFinte, VARIABILI_FINTE } from './cartelle-finte-comuni'

/**
 * **I test non toccano mai le cartelle vere dell'utente** (0.72.0).
 *
 * Il 14/10/2026 il contenuto di AppData\Local è sparito mentre, fra le altre
 * cose, girava `npm test` senza nessuno davanti. Da allora ogni file di test
 * parte con HOME, USERPROFILE, APPDATA, LOCALAPPDATA, TEMP e TMP puntati su
 * una cartella finta, e ogni scrittura, spostamento o cancellazione dentro la
 * casa vera, AppData o Temp veri (fuori dalla cartella finta e dal progetto)
 * fa fallire il test: subito con un errore, e comunque alla fine del test,
 * anche se il codice provato l'errore lo inghiotte.
 */
const RADICE_PROGETTO = resolve(__dirname, '..', '..')

const veriLetti = process.env.SIERRADECK_TEST_VERI
const veri: Record<string, string | undefined> = veriLetti !== undefined
  ? JSON.parse(veriLetti) as Record<string, string | undefined>
  : { casa: homedir(), temp: tmpdir(), appdata: process.env.APPDATA, localappdata: process.env.LOCALAPPDATA, userprofile: process.env.USERPROFILE, home: process.env.HOME }

const radiceFinta = process.env.SIERRADECK_TEST_FINTA ?? fs.mkdtempSync(join(veri.temp ?? tmpdir(), 'sierradeck-test-finta-'))
process.env.SIERRADECK_TEST_FINTA = radiceFinta
const finte = cartelleFinte(radiceFinta)
for (const v of VARIABILI_FINTE) process.env[v] = finte[v]

const windows = process.platform === 'win32'
const norm = (p: string): string => { const r = resolve(p); return windows ? r.toLowerCase() : r }
const dentroOUguale = (p: string, c: string): boolean => p === c || p.startsWith(c.endsWith('\\') || c.endsWith('/') ? c : c + (windows ? '\\' : '/'))

// Anche le copie delle chat accanto al repository (0.85.2): fino al 30/10 i
// test ci lasciavano ~8.100 cartelle con dentro solo `.claude/settings.local.json`.
const PROTETTE = [veri.casa, veri.userprofile, veri.home, veri.appdata, veri.localappdata, veri.temp, `${RADICE_PROGETTO}.sierradeck-wt`]
  .filter((p): p is string => typeof p === 'string' && p !== '')
  .map(norm)
const PERMESSE = [radiceFinta, RADICE_PROGETTO].map(norm)

const toccati: string[] = []
// Per il test che prova la sorveglianza stessa: svuota l'elenco dopo averla fatta scattare apposta.
;(globalThis as Record<string, unknown>).__toccatiVeri = toccati

/** Un percorso vero dell'utente, fuori dalla cartella finta e dal progetto. */
export function percorsoVeroDellUtente(p: unknown): string | undefined {
  let s: string | undefined
  if (typeof p === 'string') s = p
  else if (p instanceof URL) s = fileURLToPath(p)
  else if (Buffer.isBuffer(p)) s = p.toString()
  if (s === undefined || s === '') return undefined
  const n = norm(s)
  if (PERMESSE.some((c) => dentroOUguale(n, c))) return undefined
  return PROTETTE.some((c) => dentroOUguale(n, c)) ? s : undefined
}

function sorveglia(obj: Record<string, unknown>, nome: string, argomenti: number[]): void {
  const originale = obj[nome]
  if (typeof originale !== 'function') return
  const f = originale as (...a: unknown[]) => unknown
  obj[nome] = function (this: unknown, ...a: unknown[]): unknown {
    for (const i of argomenti) {
      const vero = percorsoVeroDellUtente(a[i])
      if (vero !== undefined) {
        const msg = `un test ha provato a modificare un percorso vero dell'utente con ${nome}: ${vero}`
        toccati.push(msg)
        throw new Error(msg)
      }
    }
    return f.apply(this, a)
  }
}

const SUL_PRIMO = ['writeFile', 'appendFile', 'mkdir', 'mkdtemp', 'rm', 'rmdir', 'unlink', 'truncate', 'createWriteStream', 'utimes', 'chmod', 'open', 'opendir']
const SUI_DUE = ['rename', 'copyFile', 'cp', 'symlink', 'link']
for (const base of SUL_PRIMO) {
  if (base === 'open' || base === 'opendir') continue
  for (const n of [base, `${base}Sync`]) sorveglia(fs as unknown as Record<string, unknown>, n, [0])
  sorveglia(fs.promises as unknown as Record<string, unknown>, base, [0])
}
for (const base of SUI_DUE) {
  for (const n of [base, `${base}Sync`]) sorveglia(fs as unknown as Record<string, unknown>, n, [0, 1])
  sorveglia(fs.promises as unknown as Record<string, unknown>, base, [0, 1])
}
syncBuiltinESMExports()

afterEach(() => {
  if (toccati.length > 0) {
    const elenco = toccati.splice(0)
    throw new Error(`Il test ha toccato percorsi veri dell'utente:\n${elenco.join('\n')}`)
  }
})
