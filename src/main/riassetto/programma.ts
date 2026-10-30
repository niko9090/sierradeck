import { execFile } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { request as httpRequest } from 'node:http'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { BrowserWindow, ipcMain, session } from 'electron'
import {
  CARTELLA_RECUPERO_RIASSETTO, leggiEsitoServizio, compattaErrori,
  type EsitoPassoServizio, type PassoDelServizio, type StatoRiassetto
} from '@shared/riassetto'
import { scriviJsonAtomico } from '@shared/scrittura-atomica'
import type { StoricoSuFile } from '../storico-errori-file'
import { rimuoviSessioni, type Db } from '../db'
import type { EsitoCopia } from '../copie-di-versione'
import { riordinaQuaderno } from '../quaderno-lezioni-store'
import { misuraAlbero, scadenzeRecuperoRiassetto } from './recupero'
import { creaRiassetto, type Riassetto } from './riassetto'
import type { Passo } from './motore'
import type { EsitoGitRiassetto } from './passi'

/**
 * Il riassetto collegato al programma vero: Electron (finestre, cache), il
 * servizio degli autopiloti in HTTP, git, l'indice. `index.ts` lo crea dopo
 * la copia di versione con **una riga**, ne chiama la fase A subito e, quando
 * il servizio è pronto, `collegaServizio`. I passi di chi integra entrano
 * da `passiAggiunti`.
 */

/** Quanto può durare un passo del servizio (l'autopulizia con git su tanti rami). */
const TETTO_PASSO_SERVIZIO_MS = 10 * 60_000
/** Dopo quanto dall'avvio parte la fase B: prima si lascia aprire tutto. */
const ATTESA_FASE_B_MS = 60_000

export type OpzioniProgramma = {
  dati: string
  versione: string
  copia: Pick<EsitoCopia, 'fatta' | 'da'>
  log: (m: string) => void
  errore: (m: string) => void
  porta: () => number
  storicoApp?: Pick<StoricoSuFile, 'leggi' | 'sostituisci'>
  /** L'indice delle sessioni (`index.db`): le trascrizioni andate nel recupero ne escono, poi VACUUM. */
  indice?: () => Db | undefined
  cartellaProgetti?: () => string | undefined
  /** I segni delle migrazioni il cui codice è stato tolto (vedi `passi.ts`). */
  marcatoriSenzaCodice?: readonly string[]
  passiAggiunti?: readonly Passo[]
}

export type RiassettoProgramma = Riassetto & {
  /** Il servizio è pronto: fra un minuto la fase B. */
  collegaServizio: (s: { assicura: () => Promise<boolean>; cwdAutopiloti: () => Promise<string[]> }) => void
  /** Il giro delle sei ore: il recupero oltre i 30 giorni. */
  giroScadenze: () => void
}

function postaRiassetto(porta: number, corpo: unknown): Promise<unknown> {
  return new Promise((risolvi, rifiuta) => {
    const dati = Buffer.from(JSON.stringify(corpo), 'utf8')
    const r = httpRequest({
      host: '127.0.0.1', port: porta, path: '/riassetto/passo', method: 'POST', timeout: TETTO_PASSO_SERVIZIO_MS,
      headers: { 'Content-Type': 'application/json', 'Content-Length': dati.length }
    }, (res) => {
      let testo = ''
      res.on('data', (c) => { testo += c })
      res.on('end', () => {
        if ((res.statusCode ?? 500) >= 400) { rifiuta(new Error(`HTTP ${res.statusCode ?? '?'}: ${testo.slice(0, 120)}`)); return }
        try { risolvi(JSON.parse(testo)) } catch (err) { rifiuta(err instanceof Error ? err : new Error('risposta illeggibile')) }
      })
    })
    r.on('error', rifiuta)
    r.on('timeout', () => { r.destroy(); rifiuta(new Error('scaduto')) })
    r.end(dati)
  })
}

function gitRiassetto(args: string[], cwd: string): Promise<EsitoGitRiassetto> {
  return new Promise((ris) => {
    execFile('git', args, { cwd, windowsHide: true, timeout: 60_000, maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
      ris({ codice: err === null ? 0 : (typeof (err as { code?: unknown }).code === 'number' ? (err as { code: number }).code : 1), uscita: `${stdout}${stderr}` })
    })
  })
}

/** Le cartelle delle cache di Chromium nella cartella dei dati, per misurarle. */
const CACHE = ['Cache', 'Code Cache', 'GPUCache', 'DawnGraphiteCache', 'DawnWebGPUCache']

export function creaRiassettoDelProgramma(o: OpzioniProgramma): RiassettoProgramma {
  let servizio: { assicura: () => Promise<boolean>; cwdAutopiloti: () => Promise<string[]> } | undefined
  const finestre = (): BrowserWindow[] => BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed() && !w.webContents.isDestroyed())
  const cartelleProgetti = (): string[] => {
    const c = new Set<string>()
    try { const x = o.cartellaProgetti?.(); if (x !== undefined && x !== '') c.add(x) } catch { /* identità non pronta */ }
    // Le vecchie copie `ap-…-c-N` stavano nella cartella dei progetti di prima, nella cartella dell'utente.
    for (const p of [join(homedir(), 'Progetti SierraDeck'), join(homedir(), 'Documents', 'Progetti SierraDeck')]) c.add(p)
    return [...c].filter((p) => existsSync(p))
  }

  const r = creaRiassetto({
    dati: o.dati,
    versione: o.versione,
    copia: o.copia,
    log: o.log,
    ...(o.marcatoriSenzaCodice !== undefined ? { marcatoriSenzaCodice: o.marcatoriSenzaCodice } : {}),
    ...(o.passiAggiunti !== undefined ? { passiAggiunti: o.passiAggiunti } : {}),
    annuncia: (s: StatoRiassetto) => { for (const w of finestre()) w.webContents.send('riassetto:progresso', s) },
    ...(o.storicoApp !== undefined ? {
      compattaErroriApp: (cartellaRecupero: () => string) => {
        const st = o.storicoApp!
        const { tolte } = compattaErrori(st.leggi().voci, o.versione, Date.now())
        if (tolte.length === 0) return { tolte: 0, byte: 0 }
        scriviJsonAtomico(join(cartellaRecupero(), 'errori-programma-tolti.json'), { voci: tolte }, 'riassetto')
        st.sostituisci((s) => ({ ...s, voci: compattaErrori(s.voci, o.versione, Date.now()).tenute }))
        return { tolte: tolte.length, byte: Buffer.byteLength(JSON.stringify(tolte), 'utf8') }
      }
    } : {}),
    servizio: async (passo: PassoDelServizio, corpo: Record<string, unknown>): Promise<EsitoPassoServizio> => {
      if (servizio === undefined || !(await servizio.assicura())) throw new Error('servizio non pronto')
      const e = leggiEsitoServizio(await postaRiassetto(o.porta(), { ...corpo, passo, versione: o.versione }))
      if (e === undefined) throw new Error('risposta del servizio illeggibile')
      return e
    },
    cartelleProgetti,
    pulisciIndice: (sessioni: string[]) => {
      const db = o.indice?.()
      if (db === undefined) return 0
      const file = join(o.dati, 'index.db')
      const prima = existsSync(file) ? statSync(file).size : 0
      rimuoviSessioni(db, sessioni)
      db.exec('VACUUM')
      return Math.max(0, prima - (existsSync(file) ? statSync(file).size : 0))
    },
    progetti: async () => (servizio === undefined ? [] : servizio.cwdAutopiloti().catch(() => [])),
    git: gitRiassetto,
    riordinaQuaderno: (cwd: string) => riordinaQuaderno(cwd, o.dati),
    svuotaCache: async () => {
      const prima = CACHE.reduce((s, n) => s + misuraAlbero(join(o.dati, n)).byte, 0)
      await session.defaultSession.clearCache()
      await session.defaultSession.clearCodeCaches({}).catch(() => undefined)
      const dopo = CACHE.reduce((s, n) => s + misuraAlbero(join(o.dati, n)).byte, 0)
      return Math.max(0, prima - dopo)
    }
  })

  ipcMain.handle('riassetto:stato', () => r.stato() ?? null)
  ipcMain.handle('riassetto:annulla', () => r.annulla())
  ipcMain.handle('riassetto:liberaSubito', () => r.liberaSubito())
  ipcMain.handle('riassetto:chiudi', () => { r.chiudi() })

  return {
    ...r,
    collegaServizio: (s) => {
      servizio = s
      if (!r.attivo) return
      const t = setTimeout(() => {
        void r.faseB().catch((err: unknown) => o.errore(`[riassetto] fase B non riuscita: ${String(err)}`))
      }, ATTESA_FASE_B_MS)
      t.unref?.()
    },
    giroScadenze: () => {
      try {
        if (!existsSync(join(o.dati, CARTELLA_RECUPERO_RIASSETTO)) || !statSync(join(o.dati, CARTELLA_RECUPERO_RIASSETTO)).isDirectory()) return
        const e = scadenzeRecuperoRiassetto(o.dati)
        if (e.passi > 0) o.log(`[riassetto] recupero oltre i 30 giorni svuotato: ${e.passi} passi${e.errori.length > 0 ? `, errori: ${e.errori.slice(0, 2).join('; ')}` : ''}`)
      } catch (err) { o.log(`[riassetto] recupero non svuotato: ${String(err)}`) }
    }
  }
}
