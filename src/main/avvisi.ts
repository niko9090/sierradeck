import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { scriviJsonAtomico } from '@shared/scrittura-atomica'
import {
  COME_CHIUSO, IMPOSTAZIONI_AVVISI_PREDEFINITE, TIPI_AVVISO, comeNasce, daFatto, daMandare, leggiImpostazioniAvvisi, pubblico,
  rigaChiusura, rigaConsegna, rigaNascita,
  type Avviso, type AvvisoTenuto, type BozzaAvviso, type ComeChiuso, type Fatto, type ImpostazioniAvvisi
} from '@shared/avvisi-telefono'

/**
 * **Il registro degli avvisi** di questo PC: gli ultimi 200, su disco, con un
 * numero che cresce a ogni nascita e a ogni chiusura.
 *
 * È la fonte unica per chi avvisa: l'app (`/api/eventi`, con l'attesa lunga),
 * la pagina, Telegram e la schermata «Notifiche». Chi chiede dice a che numero
 * è arrivato e riceve solo quello che è cambiato dopo; se non è cambiato
 * niente la richiesta resta aperta finché nasce o si chiude un avviso.
 *
 * Ogni passaggio lascia una riga `[avviso]` nel registro del PC: la nascita,
 * la consegna (con i secondi di ritardo, quando il telefono dice fin dove ha
 * ricevuto) e la chiusura. Così i ritardi si contano anche a telefono muto.
 */

/** Quanti avvisi si tengono. Le domande ancora aperte si tolgono per ultime. */
export const AVVISI_TENUTI = 200

type Filtro = { per?: string; soloLocali?: boolean }

export type RegistroAvvisi = {
  /** Il numero dell'ultimo cambiamento. */
  ultimo: () => number
  impostazioni: () => ImpostazioniAvvisi
  /** Cambia le impostazioni: quello che non si capisce resta com'era. */
  imposta: (x: unknown) => ImpostazioniAvvisi
  /** Un avviso nuovo. `undefined`: c'era già (stesso id), o il suo tipo è spento. */
  nasce: (b: BozzaAvviso) => Avviso | undefined
  /** Chiude un avviso aperto. `undefined`: non c'è, o era già chiuso. */
  chiudi: (id: string, come: ComeChiuso, testo?: string) => Avviso | undefined
  /** Un fatto del servizio degli autopiloti: nasce o chiude. */
  fatto: (f: Fatto) => Avviso | undefined
  ha: (id: string) => boolean
  /** Gli avvisi ancora aperti il cui id comincia così. */
  aperti: (prefisso?: string) => Avviso[]
  /** Quelli per chi è arrivato al numero `n` (vedi `daMandare`). */
  dopo: (n: number, filtro?: Filtro) => Avviso[]
  /**
   * L'attesa lunga: subito se c'è qualcosa dopo `n`, altrimenti al primo
   * cambiamento, o vuoto dopo `attesaMs`. `lascia` chiude l'attesa prima.
   */
  attendi: (n: number, attesaMs: number, filtro?: Filtro) => { promessa: Promise<Avviso[]>; lascia: () => void }
  /** Chi ascolta adesso con un'attesa lunga (per la riga di stato). */
  inAttesa: () => number
  /** Il telefono dice fin dove ha ricevuto: una riga per avviso, con il ritardo. Restituisce quanti. */
  visto: (chi: string, fino: number, nome?: string) => number
  /** Gli ultimi, il più recente per primo. */
  ultimi: (quanti?: number) => Avviso[]
  /** Fin dove si è letta una fonte (il giornale del servizio, un altro PC). */
  cursore: (fonte: string) => number
  segnaCursore: (fonte: string, n: number) => void
  /** A ogni nascita e a ogni chiusura. */
  quandoCambia: (f: (a: Avviso) => void) => () => void
}

type SuDisco = {
  versione: 1
  ultimo: number
  ultimoSuono?: number
  avvisi: AvvisoTenuto[]
  impostazioni: ImpostazioniAvvisi
  cursori: Record<string, number>
  visti: Record<string, number>
}

function avvisoValido(x: unknown): x is AvvisoTenuto {
  const a = x as Partial<AvvisoTenuto> | null
  return typeof a === 'object' && a !== null && typeof a.n === 'number' && typeof a.id === 'string' && typeof a.titolo === 'string'
    && typeof a.testo === 'string' && typeof a.quando === 'string' && (TIPI_AVVISO as readonly string[]).includes(a.tipo ?? '')
    && typeof a.bersaglio === 'object' && a.bersaglio !== null && typeof a.bersaglio.id === 'string'
    && (a.chiuso === undefined || (COME_CHIUSO as readonly string[]).includes(a.chiuso.come))
}

const numeri = (x: unknown): Record<string, number> => {
  const fuori: Record<string, number> = {}
  if (typeof x !== 'object' || x === null) return fuori
  for (const [k, v] of Object.entries(x)) if (typeof v === 'number' && Number.isFinite(v)) fuori[k] = v
  return fuori
}

export function apriAvvisi(deps: {
  /** Dove tenerlo. Senza, solo in memoria (le prove). */
  file?: string
  adesso?: () => number
  log?: (riga: string) => void
  /** Il timer delle attese, per le prove: restituisce come disarmarlo. */
  dopo?: (ms: number, f: () => void) => () => void
}): RegistroAvvisi {
  const adesso = deps.adesso ?? (() => Date.now())
  const dopo = deps.dopo ?? ((ms: number, f: () => void) => { const t = setTimeout(f, ms); t.unref?.(); return () => clearTimeout(t) })
  const log = (riga: string): void => { try { deps.log?.(riga) } catch { /* il registro non ferma gli avvisi */ } }

  let stato: SuDisco = { versione: 1, ultimo: 0, avvisi: [], impostazioni: IMPOSTAZIONI_AVVISI_PREDEFINITE, cursori: {}, visti: {} }
  if (deps.file !== undefined && existsSync(deps.file)) {
    try {
      const letto = JSON.parse(readFileSync(deps.file, 'utf8')) as Partial<SuDisco>
      const avvisi = (Array.isArray(letto.avvisi) ? letto.avvisi : []).filter(avvisoValido)
      stato = {
        versione: 1,
        // Mai indietro: un numero già dato a un telefono non si ridà a un altro avviso.
        ultimo: Math.max(typeof letto.ultimo === 'number' && Number.isFinite(letto.ultimo) ? letto.ultimo : 0, ...avvisi.map((a) => a.n), 0),
        ...(typeof letto.ultimoSuono === 'number' ? { ultimoSuono: letto.ultimoSuono } : {}),
        avvisi,
        impostazioni: leggiImpostazioniAvvisi(letto.impostazioni),
        cursori: numeri(letto.cursori),
        visti: numeri(letto.visti)
      }
    } catch (err) {
      log(`[avviso] registro illeggibile, riparto vuoto: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const salva = (): void => {
    if (deps.file === undefined) return
    try {
      mkdirSync(dirname(deps.file), { recursive: true })
      scriviJsonAtomico(deps.file, stato, 'avvisi')
    } catch (err) { log(`[avviso] registro non salvato: ${err instanceof Error ? err.message : String(err)}`) }
  }

  const ascolti = new Set<(a: Avviso) => void>()
  type Attesa = { n: number; filtro: Filtro; /** Da capo: aspetta ogni avviso dopo questo numero, non solo le domande. */ dopo?: number; risolvi: (a: Avviso[]) => void; disarma: () => void }
  const attese = new Set<Attesa>()

  const leggi = (n: number, filtro: Filtro = {}): Avviso[] => daMandare(stato.avvisi, stato.ultimo, n, filtro)
  const leggiDopo = (base: number, filtro: Filtro): Avviso[] => stato.avvisi
    .filter((a) => a.n > base && (a.per === undefined || a.per === filtro.per) && (filtro.soloLocali !== true || a.bersaglio.pc === undefined))
    .sort((x, y) => x.n - y.n)
    .map(pubblico)

  const cambiato = (a: AvvisoTenuto): void => {
    salva()
    for (const x of [...attese]) {
      const pronti = x.dopo !== undefined ? leggiDopo(x.dopo, x.filtro) : leggi(x.n, x.filtro)
      if (pronti.length === 0) continue
      attese.delete(x)
      x.disarma()
      x.risolvi(pronti)
    }
    for (const f of [...ascolti]) { try { f(pubblico(a)) } catch (err) { log(`[avviso] chi ascolta ha sbagliato: ${String(err)}`) } }
  }

  /** Oltre il tetto se ne vanno i più vecchi: prima i chiusi e quelli che non sono domande. */
  const accorcia = (): void => {
    if (stato.avvisi.length <= AVVISI_TENUTI) return
    const perEta = [...stato.avvisi].sort((x, y) => x.n - y.n)
    const via = new Set<string>()
    for (const a of perEta) {
      if (stato.avvisi.length - via.size <= AVVISI_TENUTI) break
      if (a.chiuso !== undefined || a.tipo !== 'domanda') via.add(a.id)
    }
    for (const a of perEta) {
      if (stato.avvisi.length - via.size <= AVVISI_TENUTI) break
      via.add(a.id)
    }
    stato.avvisi = stato.avvisi.filter((a) => !via.has(a.id))
  }

  const nasce = (b: BozzaAvviso): Avviso | undefined => {
    if (stato.avvisi.some((a) => a.id === b.id)) return undefined
    const ora = adesso()
    const come = comeNasce(b, stato.impostazioni, new Date(ora), stato.ultimoSuono)
    if (!come.nasce) return undefined
    const { suonaComunque: _s, ...resto } = b
    const a: AvvisoTenuto = { ...resto, n: stato.ultimo + 1, quando: new Date(ora).toISOString(), suona: come.suona }
    stato.ultimo = a.n
    if (come.suona) stato.ultimoSuono = ora
    stato.avvisi.push(a)
    accorcia()
    log(rigaNascita(a))
    cambiato(a)
    return pubblico(a)
  }

  const chiudi = (id: string, come: ComeChiuso, testo?: string): Avviso | undefined => {
    const i = stato.avvisi.findIndex((a) => a.id === id)
    const prima = stato.avvisi[i]
    if (prima === undefined || prima.chiuso !== undefined) return undefined
    const a: AvvisoTenuto = {
      ...prima, n: stato.ultimo + 1, suona: false,
      chiuso: { quando: new Date(adesso()).toISOString(), come, ...(testo !== undefined && testo.trim() !== '' ? { testo: testo.trim() } : {}) }
    }
    stato.ultimo = a.n
    stato.avvisi[i] = a
    log(rigaChiusura(a))
    cambiato(a)
    return pubblico(a)
  }

  return {
    ultimo: () => stato.ultimo,
    impostazioni: () => stato.impostazioni,
    imposta(x) {
      const nuove = leggiImpostazioniAvvisi(x, stato.impostazioni)
      if (JSON.stringify(nuove) === JSON.stringify(stato.impostazioni)) return stato.impostazioni
      stato.impostazioni = nuove
      salva()
      log(`[avviso] impostazioni: ${TIPI_AVVISO.map((t) => `${t} ${nuove.tipi[t]}`).join(', ')}, chat ferma ${nuove.chatFerma ? 'sì' : 'no'}, silenzio ${nuove.silenzio === null ? 'no' : `${nuove.silenzio.da}–${nuove.silenzio.a}`}`)
      return nuove
    },
    nasce,
    chiudi,
    fatto(f) {
      const e = daFatto(f)
      if ('chiude' in e) return chiudi(e.chiude.id, e.chiude.come, e.chiude.testo)
      // Una richiesta fatta nel workspace: il suo «Lavoro fermo» di prima non vale più.
      if (f.cosa === 'fatto') {
        for (const a of stato.avvisi.filter((x) => x.tipo === 'fermo' && x.chiuso === undefined && x.bersaglio.pc === undefined && x.bersaglio.id === f.workspace)) chiudi(a.id, 'ritirata')
      }
      return nasce(e.nasce)
    },
    ha: (id) => stato.avvisi.some((a) => a.id === id),
    aperti: (prefisso = '') => stato.avvisi.filter((a) => a.chiuso === undefined && a.id.startsWith(prefisso)).map(pubblico),
    dopo: leggi,
    attendi(n, attesaMs, filtro = {}) {
      const subito = leggi(n, filtro)
      if (subito.length > 0 || attesaMs <= 0) return { promessa: Promise.resolve(subito), lascia: () => undefined }
      let mia: Attesa | undefined
      const promessa = new Promise<Avviso[]>((risolvi) => {
        // Da capo (n a zero o oltre l'ultimo): le domande aperte non c'erano, quindi si aspetta da qui
        // in avanti, e sveglia anche un avviso che non è una domanda (prima si perdeva il primo, 11/11).
        const daCapo = !Number.isFinite(n) || n <= 0 || n > stato.ultimo
        const a: Attesa = { n, filtro, ...(daCapo ? { dopo: stato.ultimo } : {}), risolvi, disarma: () => undefined }
        a.disarma = dopo(attesaMs, () => { attese.delete(a); risolvi([]) })
        attese.add(a)
        mia = a
      })
      return {
        promessa,
        lascia: () => {
          if (mia === undefined || !attese.has(mia)) return
          attese.delete(mia)
          mia.disarma()
          mia.risolvi([])
        }
      }
    },
    inAttesa: () => attese.size,
    visto(chi, fino, nome) {
      const prima = stato.visti[chi] ?? 0
      const tetto = Math.min(Math.floor(fino), stato.ultimo)
      if (!Number.isFinite(tetto) || tetto <= prima) return 0
      const ora = adesso()
      const arrivati = stato.avvisi.filter((a) => a.n > prima && a.n <= tetto && (a.per === undefined || a.per === chi)).sort((x, y) => x.n - y.n)
      for (const a of arrivati) log(rigaConsegna(a, nome !== undefined && nome.trim() !== '' ? nome : chi, ora))
      stato.visti[chi] = tetto
      salva()
      return arrivati.length
    },
    ultimi: (quanti = 20) => [...stato.avvisi].sort((x, y) => y.n - x.n).slice(0, quanti).map(pubblico),
    cursore: (fonte) => stato.cursori[fonte] ?? 0,
    segnaCursore(fonte, n) {
      if (stato.cursori[fonte] === n) return
      stato.cursori[fonte] = n
      salva()
    },
    quandoCambia(f) { ascolti.add(f); return () => { ascolti.delete(f) } }
  }
}
