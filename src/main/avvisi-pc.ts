import { statSync } from 'node:fs'
import {
  CHAT_FERMA_MS, bozzaChatFerma, bozzaDaAltroPc, bozzaDomandaDelProgramma, bozzaFile, bozzaVersione, idDaAltroPc, rigaStatoAvvisi,
  COME_CHIUSO, TIPI_AVVISO, type Avviso, type DomandaDelProgramma
} from '@shared/avvisi-telefono'
import { leggiGiornaleAvvisi } from '../autopilot-host/giornale-avvisi'
import type { RegistroAvvisi } from './avvisi'
import type { VistaStatoAvvisi } from './rotte-avvisi'

/**
 * **Le fonti degli avvisi sul PC** (11/11): tutto quello che fa nascere o
 * chiudere un avviso, in un posto solo. Il registro è uno; qui si decide
 * quando ci entra qualcosa.
 *
 * - il giornale del servizio degli autopiloti (domande, «Fatta», lavoro fermo),
 *   letto dal disco appena cambia;
 * - le domande del programma: il sì a un file per il telefono, il consenso a
 *   un dato del quaderno personale;
 * - la versione nuova scaricata, i file pronti per un telefono;
 * - una chat tua ferma da tre minuti (solo se «Chat ferma» è accesa);
 * - gli avvisi degli autopiloti degli altri PC, chiesti a loro ogni minuto.
 */

/** Una chat come la vede il programma: quello che serve a «Chat ferma». */
export type ChatPerAvvisi = {
  id: string; titolo: string; governata?: boolean; viva?: boolean; aspetta?: boolean
  chiedeSegnale?: boolean; sceltaAperta?: boolean; domanda?: string
}
/** Un file in coda per un telefono. */
export type ConsegnaPerAvvisi = { id: string; nome: string; a: string; stato: string }

export type DipendenzeAvvisiPc = {
  registro: RegistroAvvisi
  /** Il giornale del servizio, `autopiloti/servizio/giornale-avvisi.json`. */
  fileGiornale: string
  log?: (riga: string) => void
  adesso?: () => number
  chat?: () => readonly ChatPerAvvisi[]
  aggiornamento?: () => { fase: string; versione?: string } | undefined
  /** Le domande del programma aperte adesso, e come si riconosce il loro id. */
  domandeDelProgramma?: () => readonly DomandaDelProgramma[]
  delProgramma?: (id: string) => boolean
  consegne?: () => readonly ConsegnaPerAvvisi[]
  /** Gli altri PC della cassaforte, e come chiedere a uno di loro. */
  altriPc?: () => Promise<readonly { pcId: string; nome: string }[]>
  chiamaPc?: (pcId: string, percorso: string) => Promise<unknown>
}

/** Ogni quanto si guardano giornale, chat, versione e file (in memoria e uno stat: niente di pesante). */
export const GIRO_AVVISI_MS = 1500
/** Ogni quanto si chiede agli altri PC. */
export const GIRO_ALTRI_PC_MS = 60_000

const FASI_VERSIONE_APERTA = new Set(['pronto', 'attendo', 'installo'])
const BERSAGLI_DA_ALTRI_PC = new Set(['domanda', 'workspace'])

function avvisoDaAltroPcValido(x: unknown): x is Avviso {
  const a = x as Partial<Avviso> | null
  return typeof a === 'object' && a !== null && typeof a.n === 'number' && typeof a.id === 'string' && typeof a.titolo === 'string'
    && typeof a.testo === 'string' && (TIPI_AVVISO as readonly unknown[]).includes(a.tipo)
    && typeof a.bersaglio === 'object' && a.bersaglio !== null && typeof a.bersaglio.id === 'string'
    && (a.chiuso === undefined || (COME_CHIUSO as readonly unknown[]).includes(a.chiuso.come))
}

export function creaFontiAvvisi(deps: DipendenzeAvvisiPc): { giro: () => void; giroAltriPc: () => Promise<void> } {
  const { registro } = deps
  const adesso = deps.adesso ?? (() => Date.now())
  const log = (r: string): void => { try { deps.log?.(r) } catch { /* il registro non ferma gli avvisi */ } }
  let firmaGiornale = ''
  const fermeDal = new Map<string, number>()

  const leggiGiornale = (): void => {
    let firma: string
    try { const st = statSync(deps.fileGiornale); firma = `${st.mtimeMs}|${st.size}` } catch { return }
    if (firma === firmaGiornale) return
    const g = leggiGiornaleAvvisi(deps.fileGiornale)
    if (g === undefined) return
    firmaGiornale = firma
    let da = registro.cursore('servizio')
    // Il giornale è ripartito (perso, o rifatto): si rilegge da capo. Gli avvisi hanno l'id della domanda, niente doppioni.
    if (g.ultimo < da) { log(`[avviso] il giornale del servizio è ripartito (${g.ultimo} < ${da}): lo rileggo da capo`); da = 0 }
    for (const n of g.notizie) {
      if (n.n <= da) continue
      try { registro.fatto(n) } catch (err) { log(`[avviso] notizia ${n.n} del servizio non letta: ${String(err)}`) }
    }
    registro.segnaCursore('servizio', g.ultimo)
  }

  const versione = (): void => {
    const a = deps.aggiornamento?.()
    if (a === undefined) return
    if (a.fase === 'pronto' && a.versione !== undefined && a.versione !== '') registro.nasce(bozzaVersione(a.versione))
    if (!FASI_VERSIONE_APERTA.has(a.fase)) for (const v of registro.aperti('versione:')) registro.chiudi(v.id, 'ritirata')
  }

  const domandeDelProgramma = (): void => {
    if (deps.domandeDelProgramma === undefined || deps.delProgramma === undefined) return
    const ora = deps.domandeDelProgramma()
    const aperte = new Set(ora.map((d) => `domanda:${d.id}`))
    for (const d of ora) registro.nasce(bozzaDomandaDelProgramma(d))
    for (const a of registro.aperti('domanda:')) {
      if (a.bersaglio.pc === undefined && deps.delProgramma(a.bersaglio.id) && !aperte.has(a.id)) registro.chiudi(a.id, 'risposta')
    }
  }

  const consegne = (): void => {
    if (deps.consegne === undefined) return
    for (const c of deps.consegne()) {
      const id = `file:${c.id}`
      if (c.stato === 'attesa') registro.nasce(bozzaFile({ id: c.id, nome: c.nome, per: c.a }))
      else if (c.stato === 'consegnata') registro.chiudi(id, 'risposta')
      else if (c.stato === 'annullata' || c.stato === 'rifiutata' || c.stato === 'scaduta') registro.chiudi(id, 'ritirata')
    }
  }

  const chatFerme = (): void => {
    if (deps.chat === undefined) return
    const ora = adesso()
    const accesa = registro.impostazioni().chatFerma
    const viste = new Set<string>()
    for (const c of deps.chat()) {
      const chiede = c.chiedeSegnale === true || c.sceltaAperta === true
      const ferma = c.governata !== true && c.viva !== false && (c.aspetta === true || chiede)
      if (!ferma) continue
      viste.add(c.id)
      const dal = fermeDal.get(c.id) ?? ora
      fermeDal.set(c.id, dal)
      if (accesa && ora - dal >= CHAT_FERMA_MS) registro.nasce(bozzaChatFerma({ id: c.id, nome: c.titolo, chiede, ...(c.domanda !== undefined ? { domanda: c.domanda } : {}), dal }))
    }
    for (const id of [...fermeDal.keys()]) if (!viste.has(id)) fermeDal.delete(id)
    // Ripartita o chiusa: l'avviso non serve più.
    for (const a of registro.aperti('chat:')) if (!viste.has(a.bersaglio.id) || a.id !== `chat:${a.bersaglio.id}:${fermeDal.get(a.bersaglio.id) ?? ''}`) registro.chiudi(a.id, 'risposta')
  }

  const giro = (): void => {
    for (const [nome, passo] of [['giornale', leggiGiornale], ['versione', versione], ['domande del programma', domandeDelProgramma], ['file', consegne], ['chat ferme', chatFerme]] as const) {
      try { passo() } catch (err) { log(`[avviso] giro (${nome}) non riuscito: ${err instanceof Error ? err.message : String(err)}`) }
    }
  }

  const giroAltriPc = async (): Promise<void> => {
    if (deps.altriPc === undefined || deps.chiamaPc === undefined) return
    const pcs = await deps.altriPc().catch(() => [] as { pcId: string; nome: string }[])
    await Promise.all(pcs.map(async (pc) => {
      const fonte = `pc:${pc.pcId}`
      const da = registro.cursore(fonte)
      let r: unknown
      // Un PC spento, lontano o di una versione di prima (404): niente avvisi da lui, per ora.
      try { r = await deps.chiamaPc!(pc.pcId, `/api/eventi?avvisi=${da}&attesa=0`) } catch { return }
      const o = typeof r === 'object' && r !== null ? r as { ultimo?: unknown; avvisi?: unknown } : {}
      if (typeof o.ultimo !== 'number' || !Array.isArray(o.avvisi)) return
      if (o.ultimo < da) { registro.segnaCursore(fonte, 0); return }
      for (const a of o.avvisi) {
        if (!avvisoDaAltroPcValido(a) || a.bersaglio.pc !== undefined || !BERSAGLI_DA_ALTRI_PC.has(a.bersaglio.cosa)) continue
        if (a.chiuso !== undefined) registro.chiudi(idDaAltroPc(pc.pcId, a.id), a.chiuso.come, a.chiuso.testo)
        else registro.nasce(bozzaDaAltroPc(a, pc.pcId, pc.nome))
      }
      registro.segnaCursore(fonte, o.ultimo)
    }))
  }

  return { giro, giroAltriPc }
}

/** La riga di stato della schermata «Notifiche», dai telefoni accoppiati e da chi ascolta adesso. */
export function statoAvvisi(registro: RegistroAvvisi, telefoni: readonly { ultimoAccesso?: string }[], ora: number): VistaStatoAvvisi {
  const ultimi = telefoni.map((t) => Date.parse(t.ultimoAccesso ?? '')).filter((x) => !Number.isNaN(x))
  const ultimoContatto = ultimi.length > 0 ? Math.max(...ultimi) : undefined
  const inAscolto = registro.inAttesa() > 0
  return {
    riga: rigaStatoAvvisi({ telefoni: telefoni.length, inAscolto, ...(ultimoContatto !== undefined ? { ultimoContatto } : {}), ora }),
    inAscolto,
    ...(ultimoContatto !== undefined ? { ultimoContatto: new Date(ultimoContatto).toISOString() } : {})
  }
}
