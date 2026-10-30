import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { scriviJsonAtomico } from '@shared/scrittura-atomica'
import {
  FILE_GIORNALE_RIASSETTO, allineaGiornale, giornaleNuovo, leggiGiornale, percentuale, saltatiInUso,
  type FaseRiassetto, type GiornaleRiassetto, type ProgressoRiassetto, type Saltato, type VocePasso
} from '@shared/riassetto'
import { apriRecuperoPasso, type EsitoSposta, type OpzioniSposta } from './recupero'

/**
 * Il motore del riassetto: i passi in fila, il giornale, la percentuale.
 *
 * Un passo è una funzione che riceve il suo contesto e lavora **cosa per
 * cosa**: prima di ogni cosa chiede se è già fatta (`fatto`), dopo la segna
 * (`segna`), e il giornale si riscrive subito. Così un avvio interrotto
 * riprende dalla cosa dopo. Un passo che non può lavorare adesso
 * (`RimandaPasso`: PC carico, servizio non pronto) resta da fare; un errore
 * non ferma gli altri passi: si annota e si va avanti.
 *
 * I passi si costruiscono **in un posto solo** (`passi.ts`, `costruisciPassi`)
 * e chi integra ne aggiunge altri con `passiAggiunti`: è lì che entrano la
 * migrazione dei proprietari e l'archivio dei vecchi autopiloti.
 */

export type ContestoPasso = {
  dati: string
  versione: string
  ora: () => number
  log: (m: string) => void
  /** La cosa è già fatta (in un avvio di prima)? */
  fatto: (chiave: string) => boolean
  /** Segna la cosa come fatta e riscrive il giornale. */
  segna: (chiave: string) => void
  /**
   * Sposta nel recupero del passo e segna. Una cosa già fatta o sparita torna
   * `non-c-era`; una saltata finisce fra i saltati con il motivo.
   */
  sposta: (percorso: string, o: OpzioniSposta) => EsitoSposta
  salta: (cosa: string, perche: string) => void
  errore: (m: string) => void
  proponi: (testo: string) => void
  /** Byte tolti davvero (cache, righe compattate), non nel recupero. */
  liberati: (byte: number) => void
  /** Byte messi nel recupero da qualcun altro (il servizio). */
  inRecupero: (byte: number) => void
  /** Quanto del passo è fatto (0..1), per la percentuale. */
  avanza: (frazione: number) => void
  /** La cartella del passo nel recupero, con il manifesto (scade con lui): per i file scritti apposta. */
  cartellaRecupero: () => string
}

export type Passo = {
  id: string
  titolo: string
  fase: FaseRiassetto
  /** Quanto pesa nella percentuale. */
  peso: number
  esegui: (c: ContestoPasso) => void | Promise<void>
}

/** Un passo che non può lavorare adesso: resta da fare, con il perché. */
export class RimandaPasso extends Error {
  readonly perche: string
  /** Ferma anche i passi dopo (lo spazio, la copia di versione). */
  readonly fermaTutto: boolean
  constructor(perche: string, fermaTutto = false) {
    super(perche)
    this.name = 'RimandaPasso'
    this.perche = perche
    this.fermaTutto = fermaTutto
  }
}

/**
 * Un passo da una funzione qualunque: per chi integra (la migrazione dei
 * proprietari, l'archivio dei vecchi autopiloti). `fai` riceve il contesto;
 * quello che torna, se è una riga, va nel registro.
 */
export function passoDaFunzione(p: { id: string; titolo: string; fase: FaseRiassetto; peso?: number; fai: (c: ContestoPasso) => unknown }): Passo {
  return {
    id: p.id,
    titolo: p.titolo,
    fase: p.fase,
    peso: p.peso ?? 2,
    esegui: async (c) => {
      const r = await p.fai(c)
      if (typeof r === 'string' && r !== '') c.log(`[riassetto] ${p.titolo}: ${r}`)
    }
  }
}

export function fileGiornale(dati: string): string { return join(dati, FILE_GIORNALE_RIASSETTO) }

export function caricaGiornale(dati: string): GiornaleRiassetto | undefined {
  try { return leggiGiornale(JSON.parse(readFileSync(fileGiornale(dati), 'utf8')) as unknown) } catch { return undefined }
}

export type Motore = {
  giornale: () => GiornaleRiassetto
  progresso: () => ProgressoRiassetto
  /** Esegue i passi della fase ancora da fare. Non solleva mai. */
  eseguiFase: (fase: FaseRiassetto) => Promise<{ fermo?: string; rimandati: string[] }>
  /** Come `eseguiFase`, senza attese: per la fase A, prima delle finestre. */
  eseguiFaseSincrona: (fase: FaseRiassetto) => { fermo?: string; rimandati: string[] }
  /** Tutti i passi sono fatti? Allora scrive lo stampo finale (una volta). */
  chiudiSeFinito: () => boolean
  scrivi: (cambia: (g: GiornaleRiassetto) => GiornaleRiassetto) => void
}

export function creaMotore(p: {
  dati: string
  versione: string
  passi: Passo[]
  ora?: () => number
  log?: (m: string) => void
  progresso?: (pr: ProgressoRiassetto) => void
}): Motore {
  const ora = p.ora ?? Date.now
  const log = p.log ?? (() => undefined)
  const elenco = p.passi.map((x) => ({ id: x.id, titolo: x.titolo }))
  const pesi = new Map(p.passi.map((x) => [x.id, x.peso]))
  const letto = caricaGiornale(p.dati)
  let g: GiornaleRiassetto = letto !== undefined && letto.versione === p.versione
    ? allineaGiornale(letto, elenco)
    : giornaleNuovo(p.versione, elenco, new Date(ora()).toISOString())
  let inCorso: { id: string; frazione: number; titolo: string } | undefined
  let fermo: string | undefined

  const salva = (): void => { scriviJsonAtomico(fileGiornale(p.dati), g, 'riassetto') }
  const voce = (id: string): VocePasso => g.passi.find((x) => x.id === id)!
  const cambiaVoce = (id: string, f: (v: VocePasso) => VocePasso): void => {
    g = { ...g, passi: g.passi.map((x) => (x.id === id ? f(x) : x)) }
  }
  const progresso = (): ProgressoRiassetto => ({
    versione: g.versione,
    percentuale: percentuale(g, pesi, inCorso),
    ...(inCorso !== undefined ? { passo: inCorso.titolo } : {}),
    saltatiInUso: saltatiInUso(g),
    finito: g.fatto !== undefined,
    ...(fermo !== undefined ? { fermoPerche: fermo } : {})
  })
  let ultimoAnnuncio = -1
  const annuncia = (forza = false): void => {
    const pr = progresso()
    if (!forza && pr.percentuale === ultimoAnnuncio) return
    ultimoAnnuncio = pr.percentuale
    try { p.progresso?.(pr) } catch { /* la finestra non ferma il riassetto */ }
  }
  salva()

  const contesto = (passo: Passo): ContestoPasso => {
    const id = passo.id
    const recupero = apriRecuperoPasso({ dati: p.dati, versione: p.versione, passo: id, ora })
    const fatto = (chiave: string): boolean => voce(id).fatti.includes(chiave)
    const segna = (chiave: string): void => {
      if (fatto(chiave)) return
      cambiaVoce(id, (v) => ({ ...v, fatti: [...v.fatti, chiave] }))
      salva()
    }
    const salta = (cosa: string, perche: string): void => {
      const s: Saltato = { cosa, perche }
      if (voce(id).saltati.some((x) => x.cosa === cosa && x.perche === perche)) return
      cambiaVoce(id, (v) => ({ ...v, saltati: [...v.saltati, s] }))
      salva()
    }
    return {
      dati: p.dati,
      versione: p.versione,
      ora,
      log,
      fatto,
      segna,
      sposta: (percorso, o) => {
        if (fatto(percorso)) return { esito: 'non-c-era', byte: 0 }
        const e = recupero.sposta(percorso, o)
        if (e.esito === 'saltato') { salta(percorso, e.perche); return e }
        if (e.esito === 'spostato') cambiaVoce(id, (v) => ({ ...v, byteInRecupero: v.byteInRecupero + e.byte }))
        // Spostata o sparita: in tutti e due i casi è fatta.
        segna(percorso)
        return e
      },
      salta,
      errore: (m) => { cambiaVoce(id, (v) => ({ ...v, errori: [...v.errori, m] })); salva() },
      proponi: (testo) => {
        if (voce(id).proposte.includes(testo)) return
        cambiaVoce(id, (v) => ({ ...v, proposte: [...v.proposte, testo] }))
        salva()
      },
      liberati: (byte) => { if (byte > 0) { cambiaVoce(id, (v) => ({ ...v, byteLiberati: v.byteLiberati + byte })); salva() } },
      inRecupero: (byte) => { if (byte > 0) { cambiaVoce(id, (v) => ({ ...v, byteInRecupero: v.byteInRecupero + byte })); salva() } },
      cartellaRecupero: () => recupero.assicura(),
      avanza: (frazione) => {
        if (inCorso === undefined || inCorso.id !== id) return
        inCorso = { ...inCorso, frazione }
        annuncia()
      }
    }
  }

  const chiudiSeFinito = (): boolean => {
    if (g.fatto !== undefined) return true
    if (!g.passi.every((x) => x.stato === 'fatto')) return false
    // Lo stampo per ultimo: prima tutto il resto è già sul disco.
    g = { ...g, fatto: new Date(ora()).toISOString() }
    salva()
    annuncia(true)
    return true
  }

  const inizia = (passo: Passo): void => {
    inCorso = { id: passo.id, frazione: 0, titolo: passo.titolo }
    cambiaVoce(passo.id, (v) => {
      const { rimandatoPerche: _via, ...resto } = v
      return { ...resto, stato: 'in-corso', iniziato: v.iniziato ?? new Date(ora()).toISOString() }
    })
    salva()
    annuncia(true)
  }
  /** Dopo un passo: fatto, rimandato o con un errore. Torna il perché se ferma tutto. */
  const finisci = (passo: Passo, err: unknown, rimandati: string[]): string | undefined => {
    if (inCorso?.id === passo.id) inCorso = undefined
    let ferma: string | undefined
    if (err === undefined) {
      cambiaVoce(passo.id, (v) => ({ ...v, stato: 'fatto', finito: new Date(ora()).toISOString() }))
    } else if (err instanceof RimandaPasso) {
      cambiaVoce(passo.id, (v) => ({ ...v, stato: 'rimandato', rimandatoPerche: err.perche }))
      rimandati.push(passo.id)
      log(`[riassetto] «${passo.titolo}» rimandato: ${err.perche}`)
      if (err.fermaTutto) { ferma = err.perche; fermo = err.perche }
    } else {
      // Un errore non ferma il riassetto e non si ripete a ogni avvio: si annota.
      const m = err instanceof Error ? err.message : String(err)
      cambiaVoce(passo.id, (v) => ({ ...v, stato: 'fatto', finito: new Date(ora()).toISOString(), errori: [...v.errori, m.slice(0, 300)] }))
      log(`[riassetto] «${passo.titolo}»: errore ${m.slice(0, 200)}`)
    }
    salva()
    annuncia(true)
    return ferma
  }
  const daFareNellaFase = (fase: FaseRiassetto): Passo[] => p.passi.filter((x) => x.fase === fase && voce(x.id).stato !== 'fatto')

  const eseguiFase = async (fase: FaseRiassetto): Promise<{ fermo?: string; rimandati: string[] }> => {
    const rimandati: string[] = []
    fermo = undefined
    for (const passo of daFareNellaFase(fase)) {
      inizia(passo)
      let errore: unknown
      try { await passo.esegui(contesto(passo)) } catch (err) { errore = err ?? new Error('errore senza testo') }
      const ferma = finisci(passo, errore, rimandati)
      if (ferma !== undefined) return { fermo: ferma, rimandati }
    }
    return { rimandati }
  }

  /**
   * La fase A **senza attese**: gira prima delle finestre e degli archivi, e
   * nessuno deve aprire un file mentre lei lo sposta. Un passo che torna una
   * promessa qui è un errore di chi l'ha scritto: si annota e si va avanti.
   */
  const eseguiFaseSincrona = (fase: FaseRiassetto): { fermo?: string; rimandati: string[] } => {
    const rimandati: string[] = []
    fermo = undefined
    for (const passo of daFareNellaFase(fase)) {
      inizia(passo)
      let errore: unknown
      try {
        const r = passo.esegui(contesto(passo))
        if (r instanceof Promise) {
          r.catch(() => undefined)
          errore = new Error('passo asincrono nella fase sincrona')
        }
      } catch (err) { errore = err ?? new Error('errore senza testo') }
      const ferma = finisci(passo, errore, rimandati)
      if (ferma !== undefined) return { fermo: ferma, rimandati }
    }
    return { rimandati }
  }

  return {
    giornale: () => g,
    progresso,
    eseguiFase,
    eseguiFaseSincrona,
    chiudiSeFinito,
    scrivi: (cambia) => { g = cambia(g); salva() }
  }
}
