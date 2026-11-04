import { aggiungiRuntimeAlPath, argomentiWinget, runtimeMancanti, type Runtime } from '@shared/runtime-noti'

/**
 * Installa Node.js e Git quando mancano (0.91.0), con winget, all'avvio.
 *
 * Nicholas, 04/11: «io voglio che il sistema installi anche node.js e git se
 * non trovati». Gira in sottofondo: non ferma l'avvio. Node chiede il sì di
 * Windows per l'amministratore (il suo installatore è solo per tutta la
 * macchina); Git si installa per l'utente, senza domande.
 */

export type StatoRuntime = { nome: Runtime['nome']; stato: 'installo' | 'installato' | 'fallito'; dettaglio?: string }

export type Esecutore = (file: string, args: string[]) => Promise<{ codice: number; uscita: string }>

/** winget: «già installato» non è un errore (APPINSTALLER_CLI_ERROR_PACKAGE_ALREADY_INSTALLED e simili). */
const GIA_INSTALLATO = /already installed|già installat|No available upgrade|Nessun aggiornamento disponibile/iu

let stati: StatoRuntime[] = []
let inCorso: Promise<StatoRuntime[]> | undefined

export const statoRuntime = (): StatoRuntime[] => stati

/**
 * Installa ciò che manca, una cosa alla volta (due installatori insieme si
 * bloccano a vicenda). Una sola corsa per volta: chi chiama di nuovo riceve
 * quella in corso.
 */
export function installaRuntimeMancanti(d: {
  env: Record<string, string | undefined>
  esiste: (p: string) => boolean
  esegui: Esecutore
  log?: (riga: string) => void
}): Promise<StatoRuntime[]> {
  if (inCorso !== undefined) return inCorso
  const log = d.log ?? (() => undefined)
  inCorso = (async () => {
    aggiungiRuntimeAlPath(d.env, d.esiste)
    const mancano = runtimeMancanti(d.env, d.esiste)
    stati = mancano.map((r) => ({ nome: r.nome, stato: 'installo' }))
    for (const r of mancano) {
      let fatto = false
      let ultimo = ''
      for (const ambito of r.ambiti) {
        log(`[runtime] installo ${r.nome} con winget${ambito !== undefined ? ` (per ${ambito === 'user' ? 'l’utente' : 'la macchina'})` : ''}`)
        try {
          const e = await d.esegui('winget', argomentiWinget(r, ambito))
          ultimo = e.uscita.trim().split(/\r?\n/u).filter((x) => x.trim() !== '').slice(-1)[0] ?? `codice ${e.codice}`
          if (e.codice === 0 || GIA_INSTALLATO.test(e.uscita)) { fatto = true; break }
        } catch (err) {
          ultimo = String(err).slice(0, 200)
          // Senza winget non c'è un secondo ambito da provare.
          if (/ENOENT/u.test(ultimo)) { ultimo = 'winget non c’è su questo PC (si installa con «Programma di installazione app» dal Microsoft Store)'; break }
        }
      }
      aggiungiRuntimeAlPath(d.env, d.esiste)
      const trovato = runtimeMancanti(d.env, d.esiste).every((x) => x.nome !== r.nome)
      const s: StatoRuntime = fatto && trovato
        ? { nome: r.nome, stato: 'installato' }
        : { nome: r.nome, stato: 'fallito', dettaglio: fatto ? 'winget dice installato, ma il programma non si trova nelle cartelle solite' : ultimo }
      log(`[runtime] ${r.nome}: ${s.stato}${s.dettaglio !== undefined ? ` — ${s.dettaglio}` : ''}`)
      stati = stati.map((x) => (x.nome === r.nome ? s : x))
    }
    return stati
  })().finally(() => { inCorso = undefined })
  return inCorso
}

/** Per i test. */
export function _azzeraRuntime(): void { stati = []; inCorso = undefined }

/** L'esecutore vero: winget senza finestra, fino a 15 minuti (Git e Node si scaricano). */
export const eseguiDavvero: Esecutore = async (file, args) => {
  const { execFile } = await import('node:child_process')
  return new Promise((ok, ko) => {
    execFile(file, args, { windowsHide: true, timeout: 15 * 60_000, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
      const uscita = `${String(stdout)}\n${String(stderr)}`
      if (err !== null && (err as NodeJS.ErrnoException).code === 'ENOENT') { ko(err); return }
      const codice = err === null ? 0 : typeof (err as { code?: unknown }).code === 'number' ? (err as { code: number }).code : 1
      ok({ codice, uscita })
    })
  })
}
