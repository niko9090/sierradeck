import { createHash } from 'node:crypto'
import { bozzaProva, leggiRichiestaEventi, type Avviso, type VistaAvvisi, type VistaStatoAvvisi } from '@shared/avvisi-telefono'
import type { Esito } from './client-server'
import type { RegistroAvvisi } from './avvisi'

/**
 * **Le rotte degli avvisi** (11/11), davanti alle rotte del telefono: non
 * cambiano niente delle altre, e ne aggiungono quattro.
 *
 * - `GET /api/eventi?avvisi=N&stato=V&attesa=S`: l'attesa lunga. Risponde
 *   subito se c'è un avviso dopo N o (solo con `stato`) se lo stato non è più
 *   alla versione V; altrimenti tiene la richiesta fino a S secondi (al più 50)
 *   e risponde vuoto. `{ ultimo, stato, avvisi }`.
 * - `POST /api/avvisi/visto { fino }`: fin dove il telefono ha ricevuto (la
 *   riga con il ritardo nel registro del PC).
 * - `POST /api/avvisi/prova`: un avviso di prova che suona.
 * - `GET | POST /api/avvisi/impostazioni`, e `GET /api/avvisi/stato` per la
 *   schermata «Notifiche» (impostazioni, riga di stato, ultime 20).
 *
 * E in cima a `/api/stato` il campo `versione`, che cresce solo quando lo
 * stato cambia davvero: l'app in primo piano aspetta su `/api/eventi` con la
 * sua versione, invece di rileggere tutto ogni due secondi.
 */

export type RichiestaRotta = { metodo: string; percorso: string; corpo: unknown; dispositivo?: string; cerca?: URLSearchParams }
export type RottaClient = (r: RichiestaRotta) => Promise<Esito>

/** Mentre qualcuno aspetta con `stato`, ogni quanto si ricompone lo stato per vedere se è cambiato. */
export const RILEGGI_STATO_MS = 2000

export type { VistaAvvisi, VistaStatoAvvisi }

export type DipendenzeRotteAvvisi = {
  registro: RegistroAvvisi
  /** La riga di stato della schermata «Notifiche». */
  stato: () => VistaStatoAvvisi
  /** Il nome di un dispositivo accoppiato, per la riga della consegna. */
  nomeDispositivo?: (id: string) => string | undefined
  adesso?: () => number
  rileggiStatoMs?: number
}

/**
 * La versione dello stato: l'impronta del corpo di `/api/stato` senza le
 * parti di chi lo chiede (i file in coda per quel telefono). Cambia
 * l'impronta, cresce il numero; parte dai secondi dell'orologio, così dopo un
 * riavvio del programma non torna a un numero che un telefono ha già visto.
 */
export function creaVersioneStato(adesso: () => number = Date.now): { vedi: (corpo: Record<string, unknown>) => number; versione: () => number } {
  let impronta = ''
  let versione = 0
  return {
    vedi(corpo) {
      const { consegne: _c, versione: _v, ...resto } = corpo
      const i = createHash('sha1').update(JSON.stringify(resto)).digest('hex')
      if (i !== impronta) {
        impronta = i
        versione = Math.max(versione + 1, Math.floor(adesso() / 1000))
      }
      return versione
    },
    versione: () => versione
  }
}

const daAltroPc = (d: string | undefined): boolean => d === 'pc' || (d?.startsWith('pc:') ?? false)
/** Chi chiede, con lo stesso nome delle rotte del telefono: `locale`, `pc:…`, `tel:<dispositivo>`. */
export const visoreDi = (d: string | undefined): string => (d === undefined || d === 'locale' ? 'locale' : daAltroPc(d) ? d : `tel:${d}`)

const OK = (corpo: unknown): Esito => ({ stato: 200, corpo })
const oggetto = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)

export function conAvvisi(interna: RottaClient, deps: DipendenzeRotteAvvisi): RottaClient {
  const adesso = deps.adesso ?? (() => Date.now())
  const rileggi = deps.rileggiStatoMs ?? RILEGGI_STATO_MS
  const versione = creaVersioneStato(adesso)
  const { registro } = deps

  const statoCon = async (r: RichiestaRotta): Promise<Esito> => {
    const e = await interna(r)
    if (e.stato !== 200 || !oggetto(e.corpo)) return e
    return { ...e, corpo: { versione: versione.vedi(e.corpo), ...e.corpo } }
  }

  const eventi = async (r: RichiestaRotta): Promise<Esito> => {
    const q = leggiRichiestaEventi(r.cerca)
    const visore = visoreDi(r.dispositivo)
    // `per`: i file in coda sono per un telefono solo (`tel:<id>`, o `pc:tel:<id>@<PC>` se passa dal ponte).
    const filtro = { ...(visore !== 'locale' ? { per: visore } : {}), ...(daAltroPc(r.dispositivo) ? { soloLocali: true } : {}) }
    let avvisi: Avviso[]
    const statoOra = async (): Promise<number> => {
      await statoCon({ metodo: 'GET', percorso: '/api/stato', corpo: undefined, ...(r.dispositivo !== undefined ? { dispositivo: r.dispositivo } : {}), cerca: new URLSearchParams() }).catch(() => undefined)
      return versione.versione()
    }
    if (q.stato === undefined) {
      avvisi = await registro.attendi(q.avvisi, q.attesaMs, filtro).promessa
      // Nessuno ha ancora chiesto lo stato da quando il programma è aperto: una volta, per dare un numero vero.
      if (versione.versione() === 0) await statoOra()
    } else {
      const fine = adesso() + q.attesaMs
      let v = await statoOra()
      avvisi = registro.dopo(q.avvisi, filtro)
      while (avvisi.length === 0 && v === q.stato && adesso() < fine) {
        avvisi = await registro.attendi(q.avvisi, Math.max(1, Math.min(rileggi, fine - adesso())), filtro).promessa
        if (avvisi.length > 0) break
        v = await statoOra()
      }
    }
    return OK({ ultimo: registro.ultimo(), stato: versione.versione(), avvisi })
  }

  return async (r) => {
    if (r.percorso === '/api/stato' && r.metodo === 'GET') return statoCon(r)
    if (r.percorso === '/api/eventi' && r.metodo === 'GET') return eventi(r)
    if (r.percorso === '/api/rispondi' && r.metodo === 'POST') {
      // Risposta presa: l'avviso si chiude adesso, su tutti, senza aspettare il giro del giornale.
      const e = await interna(r)
      const id = oggetto(r.corpo) && typeof r.corpo.domanda === 'string' ? r.corpo.domanda.trim() : ''
      if (e.stato === 200 && id !== '') registro.chiudi(`domanda:${id}`, 'risposta')
      return e
    }
    if (!r.percorso.startsWith('/api/avvisi/')) return interna(r)
    const visore = visoreDi(r.dispositivo)
    if (r.percorso === '/api/avvisi/visto' && r.metodo === 'POST') {
      const fino = oggetto(r.corpo) && typeof r.corpo.fino === 'number' ? r.corpo.fino : Number.NaN
      if (!Number.isFinite(fino)) return { stato: 400, corpo: { errore: 'serve «fino», il numero dell’ultimo avviso ricevuto' } }
      const nome = r.dispositivo !== undefined && !daAltroPc(r.dispositivo) ? deps.nomeDispositivo?.(r.dispositivo) : undefined
      return OK({ consegnati: registro.visto(visore, fino, nome) })
    }
    if (r.percorso === '/api/avvisi/prova' && r.metodo === 'POST') {
      return OK({ avviso: registro.nasce(bozzaProva(new Date(adesso()))) })
    }
    if (r.percorso === '/api/avvisi/impostazioni') {
      if (r.metodo === 'GET') return OK(registro.impostazioni())
      if (daAltroPc(r.dispositivo)) return { stato: 403, corpo: { errore: 'Le notifiche di questo computer si scelgono da lui, dal suo telefono o dalla sua pagina.' } }
      return OK(registro.imposta(r.corpo))
    }
    if (r.percorso === '/api/avvisi/stato' && r.metodo === 'GET') {
      return OK(vistaAvvisi(registro, deps.stato()))
    }
    return interna(r)
  }
}

export function vistaAvvisi(registro: RegistroAvvisi, stato: VistaStatoAvvisi): VistaAvvisi {
  return { ...stato, impostazioni: registro.impostazioni(), ultimi: registro.ultimi(20) }
}
