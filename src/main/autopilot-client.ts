import { randomUUID } from 'node:crypto'
import type { VoceRiparazione } from '@shared/autoriparazione'
import type { DomandaRisolta } from '@shared/domande-telefono'
import { leggiPostiChat, type PostiChat } from '@shared/posti-chat'
import type { Autopilota } from '@shared/autopilota'
import type { TipoSegnaleVero } from '@shared/indicatore-autopilota'
import type { AggiornamentoInCorso } from '@shared/fasi-aggiornamento'
import type { PuntoProposto, VistaCoda } from '@shared/coda-richieste'
import { ATTESA_CAMBI_MS } from '@shared/spinta-specialisti'
import type { MossaAttesa, VistaAttesa } from '@shared/attesa-specialisti'
import type { TrascrizioneSpecialista, VistaOrchestratore } from '@shared/piano-orchestratore'
import type { RichiestaDoppioni } from '@shared/autopiloti-doppioni'
import type { LimitiPc, VistaLimiti } from '@shared/limiti-pc'
import type { PermessiScelti } from '@shared/permessi-nicholas'

/**
 * Il primo messaggio a un workspace (P4): l'autopilota del workspace nasce se
 * non c'è ancora, e il messaggio va in coda e a lui. Un solo autopilota per
 * workspace: un secondo «crea» nello stesso workspace è un messaggio in più.
 */
export type NuovoAutopilota = {
  obiettivo: string
  cwd: string
  /** Il workspace da cui arriva: è lì che le sue chat devono nascere. */
  workspace?: string
  /** Dalle versioni di prima: si ignora (il nome lo decide il workspace). */
  nome?: string
  /**
   * 11/11: lo scrive il programma, non Nicholas («Controllo di tutti i PC…»,
   * «Errori arrivati…»). Non chiude le domande aperte: lui non ha scritto niente.
   */
  daProgramma?: boolean
}

export type DomandaAperta = {
  id: string
  autopilotaId: string
  testo: string
  apertaIl: number
  scadeIl: number
  /** Le risposte da toccare, quando chi chiede le propone (domande iniziali, «Pubblico adesso?»). */
  opzioni?: string[]
}

/**
 * La ricevuta di una battuta del dialogo.
 *
 * Il servizio risponde subito: la tua battuta e' nell'archivio, la sua
 * arrivera' nello stesso archivio quando il supervisore avra' finito di
 * pensare (minuti). Chi mostra la scheda la vede rileggendo l'autopilota.
 */
export type RicevutaDialogo = {
  ricevuto: boolean
  autopilota?: Autopilota
}

/** Quello che legge Nicholas se il servizio non conferma un messaggio. */
export const MESSAGGIO_SERVIZIO_OCCUPATO =
  'Il servizio dell’autopilota è occupato e non ha confermato il messaggio. Non risulta arrivato: aspetta qualche secondo e riscrivilo. Se compare due volte nella conversazione, il secondo è un doppione.'

/** Quello che legge Nicholas se l'autopilota a cui scrive non esiste più e il programma non sa di quale workspace fosse. */
export const MESSAGGIO_AUTOPILOTA_SPARITO =
  'Questo autopilota non c’è più (il workspace è stato eliminato o riunito). Il messaggio non è partito: chiudi la scheda, riaprila dal workspace e riscrivilo.'

export type ClientAutopilota = {
  /**
   * L'elenco **leggero** (0.85.2): di decisioni, dialogo e modifiche solo la
   * coda (`autopilotaLeggero`). Basta a tutte le viste d'elenco e a chi cerca
   * cartelle, chat e stati; la storia intera la dà `dettaglio`.
   */
  elenca: () => Promise<Autopilota[]>
  /** L'ultimo elenco ricevuto (anche se non più fresco), `undefined` se non ne è mai arrivato uno (0.94.2). */
  elencoNoto: () => Autopilota[] | undefined
  /** Un autopilota intero, con tutta la sua storia (0.85.2). `undefined` se non c'è. */
  dettaglio: (id: string) => Promise<Autopilota | undefined>
  /** L'ETag dell'ultimo dettaglio letto di quell'autopilota: due uguali, stesso autopilota. */
  versioneDettaglio: (id: string) => string | undefined
  /** Il primo messaggio a un workspace: torna il suo autopilota (nuovo, o quello che c'è). */
  crea: (p: NuovoAutopilota) => Promise<Autopilota>
  /**
   * Gli scrivi, e lui risponde con parole sue — nel suo archivio, dopo.
   *
   * La chiamata torna subito con la ricevuta: la risposta si legge con
   * `elenca` quando compare in `dialogo` con `da: 'lui'`.
   */
  dialoga: (id: string, testo: string) => Promise<RicevutaDialogo>
  /** Le chat già avviate adottate (0.78.0): torna le sessioni adottate adesso. */
  adotta: (id: string, chat: { sessionId: string; titolo: string }[], soloMie?: string[]) => Promise<string[]>
  /** Toglie chat adottate («Torna come prima» dell'adozione). */
  togliAdottate: (id: string, sessioni: string[]) => Promise<void>
  /** «Solo mia»: l'autopilota non tocca e non scrive a quella chat. */
  soloMia: (id: string, sessione: string, si: boolean) => Promise<void>
  /** I messaggi per le chat adottate scritti dal Gestore. */
  adottateScritti: (id: string, ids: string[]) => Promise<void>
  /** «Pulisci adesso» (0.85.2): l'autopulizia del servizio subito; torna la riga del riepilogo. */
  pulisci: () => Promise<string>
  /** L'autoriparazione (k-59): i workspace e le chat del servizio rimasti con l'assetto di prima. Torna le voci. */
  ripara: (id: string) => Promise<{ voci: VoceRiparazione[]; copiato: boolean }>
  /** «Torna come prima» dell'autoriparazione, dalla parte del servizio. */
  annullaRipara: (id: string) => Promise<{ ripristinati: string[]; rimandati: string[]; errori: string[] }>
  /**
   * 31/10: il registro dei progetti al servizio, che archivia gli autopiloti
   * doppioni (progetto su un altro PC, o cartella che non c'è). Torna le righe
   * di quelli archiviati adesso.
   */
  archiviaDoppioni?: (r: RichiestaDoppioni) => Promise<{ righe: string[]; errori: string[] }>
  /** Una riga nel diario dell'autopilota, scritta dal programma. */
  nota: (id: string, testo: string) => Promise<void>
  /** Un annuncio a Nicholas nella conversazione dell'autopilota, con una notifica sola (0.81.0). */
  annuncia: (id: string, titolo: string, testo: string) => Promise<void>
  domande: () => Promise<DomandaAperta[]>
  /** Le domande delle chat a cui l'autopilota ha risposto da solo (0.71.1). Un servizio vecchio non le ha: vuoto. */
  risolte: () => Promise<DomandaRisolta[]>
  /** «N di M chat» su questo PC (0.82.0). Un servizio vecchio non lo sa: `undefined`. */
  postiChat: () => Promise<PostiChat | undefined>
  /** Com'è andata una consegna dentro la chat (dai passi del PC). */
  esitoConsegna: (consegna: string, esito: 'partita' | 'non-partita') => Promise<void>
  rispondi: (idDomanda: string, risposta: string) => Promise<void>
  /** `true` se il servizio risponde; lo avvia se non c'è e riprova una volta. */
  assicuraServizio: () => Promise<boolean>
  /**
   * Dice al servizio che il Gestore è tornato su.
   *
   * Serve perché i due non muoiono insieme: il servizio sopravvive alla
   * chiusura dell'applicazione — è la ragione per cui è un processo a sé — ma
   * le chat governate no, muoiono con le finestre. Al ritorno il servizio è
   * ancora quello di prima, non riparte, e quindi non fa la ripresa che fa
   * all'avvio: gli autopiloti restano scritti «al lavoro» davanti a
   * conversazioni che non esistono più, e vanno rimessi in moto a mano.
   *
   * Torna quanti ne ha ripresi. Zero è la risposta normale quando non c'era
   * niente in corso.
   */
  gestoreAvviato: (aggiornamento?: AggiornamentoInCorso) => Promise<number>
  /**
   * Mette in pausa - o toglie dalla pausa - gli autopiloti per aggiornare.
   *
   * In pausa non vuol dire fermi adesso: vuol dire che alla fine del turno che
   * ognuno ha in mano non gli verra' detto di proseguire. E' l'unico punto in
   * cui una chat si puo' fermare senza lasciare niente a meta'.
   *
   * Torna quanti ne ha toccati.
   */
  pausaAggiornamento: (attiva: boolean) => Promise<number>
  /** «Aggiorna adesso» (0.84.1): un commit sul ramo di ogni chat prima di installare. */
  salvaPerAggiornamento: () => Promise<{ salvate: number; provate: number }>
  /**
   * Il battito delle chat governate che stanno lavorando adesso.
   *
   * Il servizio vede solo gli hook, e una chat dentro un turno lungo non ne
   * manda: per il guardiano del silenzio era ferma dopo un'ora, e la
   * sospendeva mentre lavorava. Il Gestore invece la vede — lo schermo dice
   * «esc to interrupt» — e ogni minuto lo dice al servizio.
   */
  /** `ferme` (0.56.3): le chat governate che lo schermo dice ferme ad aspettare. */
  /** `veri` (0.85.0): l'ultimo segnale vero di ogni chat governata (commit, test, file, terminale), per l'indicatore. */
  battiti: (segni: { autopilota: string; chat: string }[], ferme?: { autopilota: string; chat: string; dal?: string }[], veri?: { autopilota: string; chat: string; tipo: TipoSegnaleVero; quando: string }[]) => Promise<void>
  /**
   * Lo stato del programma, in sola lettura, per l'autopilota (T1, 0.36.0):
   * chat aperte, limiti del piano, domande in attesa, progetti, altri PC.
   */
  statoProgramma: (stato: unknown) => Promise<void>
  /**
   * P1: la coda delle richieste di un workspace, con la percentuale di ogni
   * richiesta e del workspace. Un servizio vecchio non ce l'ha: `undefined`.
   */
  coda: (ws: string) => Promise<VistaCoda | undefined>
  /** «Separa»: disfa l'ultima unione di una richiesta. Torna la coda di adesso. */
  separaCoda: (ws: string, id: string) => Promise<VistaCoda>
  /** Unisce a mano, con la stessa regola del supervisore: nessun punto si perde. */
  unisciCoda: (ws: string, u: UnioneAMano) => Promise<VistaCoda>
  /** P3: l'autopilota unico di un workspace. Un servizio vecchio non ce l'ha: `undefined`. */
  orchestratore: (ws: string) => Promise<VistaOrchestratore | undefined>
  /** 0.90.0: la conversazione di uno specialista. */
  specialista: (ws: string, id: string) => Promise<TrascrizioneSpecialista | undefined>
  impostaOrchestratore: (ws: string, p: { modello?: string; tettoSpecialisti?: number; permessi?: PermessiScelti }) => Promise<VistaOrchestratore>
  /** 11/11: i limiti del PC e i permessi «sempre» dei progetti. Un servizio vecchio non ce li ha: `undefined`. */
  limiti: () => Promise<VistaLimiti | undefined>
  /** 11/11: Nicholas cambia un limite del PC. Torna la vista di adesso. */
  impostaLimiti: (p: Partial<LimitiPc>) => Promise<VistaLimiti | undefined>
  /** k-48: la lista d'attesa degli specialisti. Un servizio vecchio non ce l'ha: `undefined`. */
  attesaSpecialisti: () => Promise<VistaAttesa | undefined>
  /** 0.103.0: una rotta `/aiuto/*` del servizio (i posti degli altri PC), così com'è. */
  aiuto: (percorso: string, corpo?: Record<string, unknown>) => Promise<unknown>
  prioritaAttesa: (id: string, mossa: MossaAttesa) => Promise<VistaAttesa | undefined>
  togliAttesa: (id: string) => Promise<VistaAttesa | undefined>
  /**
   * Spinta a evento: `f` parte appena il servizio segna che uno specialista è
   * partito, finito o ha cambiato posto in lista. Si ferma con la funzione
   * restituita. Un servizio vecchio senza la rotta: nessuna spinta, resta il giro.
   */
  suCambioSpecialisti: (f: () => void) => () => void
}

/** Un'unione fatta a mano: ogni punto delle richieste unite va nominato. */
export type UnioneAMano = { ids: string[]; testo: string; titolo?: string; punti: PuntoProposto[]; perche: string }

const vistaAttesaValida = (r: unknown): VistaAttesa | undefined => (typeof r === 'object' && r !== null && Array.isArray((r as VistaAttesa).inFila) && Array.isArray((r as VistaAttesa).alLavoro) ? r as VistaAttesa : undefined)

const vistaLimitiValida = (r: unknown): VistaLimiti | undefined => (typeof r === 'object' && r !== null && typeof (r as VistaLimiti).limiti === 'object' && (r as VistaLimiti).limiti !== null ? { ...(r as VistaLimiti), sempre: Array.isArray((r as VistaLimiti).sempre) ? (r as VistaLimiti).sempre : [] } : undefined)

const ATTESA_PREDEFINITA_MS = 3000
/** Le POST che scrivono (dialogo, nota, adozione): un servizio occupato ci mette di piu' di una lettura (k-42). */
const ATTESA_SCRITTURA_MS = 30_000
/** Per quanto un elenco appena letto si ridà senza richiederlo (0.85.2). */
const ELENCO_FRESCO_MS = 1500
/** Dopo un avvio che non ha riportato su il servizio, il prossimo aspetta tanto (0.84.0). */
const MINUTO_FRA_AVVII_MS = 60_000

export function creaClientAutopilota(p: {
  porta: number
  avviaServizio: () => void
  /**
   * La porta del servizio accetta connessioni? (0.56.2) Se sì il servizio c'è,
   * solo lento a rispondere alla salute: non se ne avvia un doppione. Senza,
   * il comportamento di prima.
   */
  portaInAscolto?: () => Promise<boolean>
  /** Dove raccontare cosa si è deciso (il registro del Gestore). */
  log?: (m: string) => void
  attesaMs?: number
  /** L'attesa delle POST che scrivono (predefinita 30 s). */
  attesaScritturaMs?: number
  /**
   * La versione di **questa** applicazione.
   *
   * Serve a riconoscere un servizio rimasto indietro. Senza, il comportamento
   * è quello di prima: un servizio vivo va bene com'è.
   */
  versione?: string
  /** L'orologio, per i test. */
  adesso?: () => number
  /**
   * Per quanto un elenco appena letto vale senza richiederlo (0.85.2). Lo
   * chiedono una ventina di parti del Gestore e ogni finestra: dentro questo
   * tempo tutte ricevono lo stesso, con una richiesta sola.
   */
  elencoFrescoMs?: number
}): ClientAutopilota {
  const attesaMs = p.attesaMs ?? ATTESA_PREDEFINITA_MS
  const attesaScrittura = p.attesaScritturaMs ?? ATTESA_SCRITTURA_MS
  const adesso = p.adesso ?? Date.now
  let inVerifica: Promise<boolean> | undefined
  /** Quando un avvio non ha riportato su il servizio (0.84.0). */
  let avvioInutile: number | undefined
  const base = `http://127.0.0.1:${p.porta}`

  // Timeout = servizio lento (`scaduto`); connessione rifiutata o caduta =
  // servizio spento o in riavvio (`spento`, 0.107.1). Entrambi attesi.
  const erroreNonRisponde = (err: unknown): Error => {
    const scaduto = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')
    const causa = (err as { cause?: { code?: string } } | null)?.cause?.code
    const spento = !scaduto && (
      (err instanceof Error && err.message === 'fetch failed') ||
      causa === 'ECONNREFUSED' || causa === 'ECONNRESET' || causa === 'UND_ERR_SOCKET'
    )
    // Il messaggio nomina il servizio e la porta: il pannello lo mostra
    // all'utente, e «fetch failed» non gli direbbe niente su cosa riavviare.
    return Object.assign(new Error(`il servizio autopilota non risponde sulla porta ${p.porta}: ${String(err)}`), scaduto ? { scaduto: true } : spento ? { spento: true } : {})
  }

  const chiama = async (
    percorso: string,
    metodo: string,
    corpo?: unknown,
    attesa: number = attesaMs
  ): Promise<unknown> => {
    // Chi cambia qualcosa poi rilegge l'elenco e deve vedere il cambio: niente
    // elenco «fresco» tenuto da prima (0.85.2).
    if (metodo !== 'GET') segnaElencoVecchio()
    let risposta: Response
    try {
      risposta = await fetch(`${base}${percorso}`, {
        method: metodo,
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(attesa),
        ...(corpo !== undefined ? { body: JSON.stringify(corpo) } : {})
      })
    } catch (err) {
      // Il messaggio nomina il servizio e la porta: il pannello lo mostra
      // all'utente, e «fetch failed» non gli direbbe niente su cosa riavviare.
      throw erroreNonRisponde(err)
    }

    const testo = await risposta.text()
    if (metodo !== 'GET') segnaElencoVecchio()
    const dati: unknown = testo === '' ? undefined : JSON.parse(testo)
    if (!risposta.ok) {
      const motivo = (dati as { errore?: string } | undefined)?.errore ?? `stato ${risposta.status}`
      throw Object.assign(new Error(`il servizio autopilota ha rifiutato la richiesta: ${motivo}`), { stato: risposta.status, motivo })
    }
    return dati
  }

  /**
   * L'elenco (0.81.0): l'ultimo ricevuto resta qui con il suo ETag, e il
   * servizio risponde 304 se non è cambiato; le richieste che arrivano mentre
   * una è in viaggio ne aspettano la risposta. Chi lo riceve non lo cambia.
   */
  const elencoFrescoMs = p.elencoFrescoMs ?? ELENCO_FRESCO_MS
  let elencoTenuto: { etag: string | null; dati: Autopilota[]; il: number } | undefined
  function segnaElencoVecchio(): void { if (elencoTenuto !== undefined) elencoTenuto = { ...elencoTenuto, il: -Infinity } }
  let elencoInViaggio: Promise<Autopilota[]> | undefined
  /**
   * Una GET con l'ETag di quello che si ha già: con 304 torna quello tenuto.
   * Un servizio vecchio non conosce `?leggero=1` e manda l'elenco intero: va
   * bene lo stesso, è solo più pesante.
   */
  const chiediConEtag = async <T>(percorso: string, tenuto: { etag: string; dati: T } | undefined, attesa: number = attesaMs): Promise<{ dati: T; etag: string | null; stato: number }> => {
    let risposta: Response
    try {
      risposta = await fetch(`${base}${percorso}`, {
        headers: tenuto !== undefined ? { 'If-None-Match': tenuto.etag } : {},
        signal: AbortSignal.timeout(attesa)
      })
    } catch (err) {
      throw erroreNonRisponde(err)
    }
    if (risposta.status === 304 && tenuto !== undefined) return { dati: tenuto.dati, etag: tenuto.etag, stato: 304 }
    const testo = await risposta.text()
    const dati: unknown = testo === '' ? undefined : JSON.parse(testo)
    if (!risposta.ok) {
      const motivo = (dati as { errore?: string } | undefined)?.errore ?? `stato ${risposta.status}`
      throw Object.assign(new Error(`il servizio autopilota ha rifiutato la richiesta: ${motivo}`), { stato: risposta.status, motivo })
    }
    return { dati: dati as T, etag: risposta.headers.get('etag'), stato: risposta.status }
  }
  /**
   * k-148: dove stava ogni autopilota visto (cartella e workspace), anche dopo
   * che sparisce dall'elenco: serve a non perdere un messaggio scritto a un id
   * che il servizio non conosce più.
   */
  const casaDegliId = new Map<string, { cwd: string; workspace?: string }>()
  const ricordaCasa = (a: Autopilota): void => {
    if (typeof a.id !== 'string' || typeof a.cwd !== 'string') return
    casaDegliId.set(a.id, { cwd: a.cwd, ...(a.workspace !== undefined ? { workspace: a.workspace } : {}) })
    if (casaDegliId.size > 500) casaDegliId.delete(casaDegliId.keys().next().value as string)
  }
  const chiediElenco = async (): Promise<Autopilota[]> => {
    const tenuto = elencoTenuto?.etag != null ? { etag: elencoTenuto.etag, dati: elencoTenuto.dati } : undefined
    const r = await chiediConEtag<Autopilota[]>('/autopiloti?leggero=1', tenuto)
    elencoTenuto = Array.isArray(r.dati) ? { etag: r.etag, dati: r.dati, il: adesso() } : undefined
    if (Array.isArray(r.dati)) for (const a of r.dati) ricordaCasa(a)
    return r.dati
  }

  /**
   * Il dettaglio e' l'autopilota intero (qualche MB): un servizio occupato lo
   * serve piu' lentamente dell'elenco, e con i 3 s dell'elenco scadeva di
   * continuo (0.88.10). Cinque volte l'attesa normale.
   */
  const attesaDettaglioMs = attesaMs * 5
  /** Il dettaglio di ogni autopilota chiesto, con il suo ETag (0.85.2). */
  const dettagliTenuti = new Map<string, { etag: string; dati: Autopilota }>()
  const dettagliInViaggio = new Map<string, Promise<Autopilota | undefined>>()
  const chiediDettaglio = async (id: string): Promise<Autopilota | undefined> => {
    try {
      const r = await chiediConEtag<Autopilota>(`/autopiloti/${encodeURIComponent(id)}`, dettagliTenuti.get(id), attesaDettaglioMs)
      if (r.dati !== undefined) ricordaCasa(r.dati)
      if (r.etag !== null && r.dati !== undefined) dettagliTenuti.set(id, { etag: r.etag, dati: r.dati })
      else dettagliTenuti.delete(id)
      return r.dati
    } catch (err) {
      const e = err as { stato?: number; motivo?: string }
      if (e.stato !== 404) throw err
      dettagliTenuti.delete(id)
      if (e.motivo === 'autopilota inesistente') return undefined
      // Un servizio di prima della 0.85.2 non ha la rotta: l'elenco intero, come allora.
      const tutti = (await chiama('/autopiloti', 'GET')) as Autopilota[] | undefined
      return (tutti ?? []).find((a) => a.id === id)
    }
  }

  return {
    elenca: () => {
      if (elencoTenuto !== undefined && adesso() - elencoTenuto.il < elencoFrescoMs) return Promise.resolve(elencoTenuto.dati)
      elencoInViaggio ??= chiediElenco().finally(() => { elencoInViaggio = undefined })
      return elencoInViaggio
    },
    elencoNoto: () => elencoTenuto?.dati,
    dettaglio: (id) => {
      let inViaggio = dettagliInViaggio.get(id)
      if (inViaggio === undefined) {
        inViaggio = chiediDettaglio(id).finally(() => { dettagliInViaggio.delete(id) })
        dettagliInViaggio.set(id, inViaggio)
      }
      return inViaggio
    },
    versioneDettaglio: (id) => dettagliTenuti.get(id)?.etag,
    crea: async (nuovo) => (await chiama('/orchestratore/messaggio', 'POST', { testo: nuovo.obiettivo, cwd: nuovo.cwd, ...(nuovo.workspace !== undefined ? { workspace: nuovo.workspace } : {}), ...(nuovo.daProgramma === true ? { daProgramma: true } : {}) }, attesaScrittura)) as Autopilota,
    dialoga: async (id, testo) => {
      const percorso = `/autopiloti/${encodeURIComponent(id)}/dialogo`
      // Lo stesso id a ogni tentativo: il servizio scarta il doppione (k-42).
      const corpo = { testo, idMessaggio: randomUUID() }
      const inizio = adesso()
      let ultimo: unknown
      for (let tentativo = 0; tentativo < 2; tentativo++) {
        try {
          return (await chiama(percorso, 'POST', corpo, attesaScrittura)) as RicevutaDialogo
        } catch (err) {
          const e = err as { scaduto?: boolean; stato?: number; motivo?: string }
          if (e.stato === 404 && e.motivo === 'autopilota inesistente') {
            // k-148: l'id non c'è più (workspace riunito, pulizia, servizio ripartito).
            // Il messaggio non si perde: va al workspace di quell'autopilota, e il
            // servizio usa quello che c'è già o ne fa nascere uno (mai un doppione).
            const noto = casaDegliId.get(id)
            dettagliTenuti.delete(id)
            if (noto === undefined) throw new Error(MESSAGGIO_AUTOPILOTA_SPARITO)
            const a = (await chiama('/orchestratore/messaggio', 'POST', { testo, cwd: noto.cwd, ...(noto.workspace !== undefined ? { workspace: noto.workspace } : {}) }, attesaScrittura)) as Autopilota
            return { ricevuto: true, autopilota: a }
          }
          if (e.scaduto !== true) throw err
          ultimo = err
        }
      }
      // Nessuna conferma: se il messaggio e' gia' nella conversazione, e' arrivato.
      const arrivato = await chiediDettaglio(id).then(
        (a) => a?.dialogo.some((s) => s.da === 'tu' && s.testo === testo && Date.parse(s.quando) >= inizio - 1000) === true,
        () => false
      )
      if (arrivato) return { ricevuto: true }
      p.log?.(`[autopilota] dialogo: nessuna conferma dal servizio dopo due tentativi (${String(ultimo)})`)
      throw Object.assign(new Error(MESSAGGIO_SERVIZIO_OCCUPATO), { scaduto: true })
    },
    adotta: async (id, chat, soloMie = []) => {
      const r = (await chiama(`/autopiloti/${encodeURIComponent(id)}/adotta`, 'POST', { chat, soloMie }, attesaScrittura)) as { nuove?: unknown } | undefined
      return Array.isArray(r?.nuove) ? r.nuove.filter((x): x is string => typeof x === 'string') : []
    },
    togliAdottate: async (id, sessioni) => { await chiama(`/autopiloti/${encodeURIComponent(id)}/adotta/togli`, 'POST', { sessioni }, attesaScrittura) },
    soloMia: async (id, sessione, si) => { await chiama(`/autopiloti/${encodeURIComponent(id)}/solo-mia`, 'POST', { sessione, si }, attesaScrittura) },
    adottateScritti: async (id, ids) => { await chiama(`/autopiloti/${encodeURIComponent(id)}/adottate/scritti`, 'POST', { ids }, attesaScrittura) },
    ripara: async (id) => {
      const r = (await chiama('/autoriparazione', 'POST', { id }, 10 * 60_000)) as { voci?: VoceRiparazione[]; copiato?: boolean } | undefined
      return { voci: Array.isArray(r?.voci) ? r.voci : [], copiato: r?.copiato === true }
    },
    annullaRipara: async (id) => {
      const r = (await chiama('/autoriparazione/annulla', 'POST', { id }, 60_000)) as { ripristinati?: string[]; rimandati?: string[]; errori?: string[] } | undefined
      return { ripristinati: r?.ripristinati ?? [], rimandati: r?.rimandati ?? [], errori: r?.errori ?? [] }
    },
    // Copie, rami e note: può metterci qualche minuto.
    pulisci: async () => {
      const r = (await chiama('/autopulizia', 'POST', {}, 10 * 60_000)) as { riga?: unknown } | undefined
      return typeof r?.riga === 'string' ? r.riga : 'autopulizia fatta'
    },
    archiviaDoppioni: async (richiesta) => {
      const r = (await chiama('/orchestratore/doppioni', 'POST', richiesta, attesaScrittura)) as { archiviati?: unknown; errori?: unknown } | undefined
      const righe = Array.isArray(r?.archiviati)
        ? r.archiviati.flatMap((x) => (typeof (x as { riga?: unknown }).riga === 'string' ? [(x as { riga: string }).riga] : []))
        : []
      const errori = Array.isArray(r?.errori) ? r.errori.filter((x): x is string => typeof x === 'string') : []
      return { righe, errori }
    },
    nota: async (id, testo) => {
      await chiama(`/autopiloti/${encodeURIComponent(id)}/nota`, 'POST', { testo }, attesaScrittura)
    },
    annuncia: async (id, titolo, testo) => {
      await chiama(`/autopiloti/${encodeURIComponent(id)}/annuncio`, 'POST', { titolo, testo }, attesaScrittura)
    },
    domande: async () => (await chiama('/domande', 'GET')) as DomandaAperta[],
    risolte: async () => {
      const r = await chiama('/domande/risolte', 'GET').catch(() => [])
      return Array.isArray(r) ? (r as DomandaRisolta[]) : []
    },
    postiChat: async () => leggiPostiChat(await chiama('/posti-chat', 'GET').catch(() => undefined)),
    esitoConsegna: async (consegna, esito) => { await chiama('/consegne/esito', 'POST', { id: consegna, esito }, attesaScrittura) },
    rispondi: async (idDomanda, risposta) => {
      // `da: 'modale'` dice al servizio da dove è arrivata: serve al registro
      // delle domande, dove vale la prima risposta fra schermo e Telegram.
      try {
        await chiama(`/domande/${encodeURIComponent(idDomanda)}/risposta`, 'POST', { risposta, da: 'modale' }, attesaScrittura)
      } catch (err) {
        if ((err as { scaduto?: boolean }).scaduto !== true) throw err
        // Il servizio scrive su disco prima di rispondere: se la domanda non
        // e' piu' aperta, la risposta e' arrivata e non e' un errore.
        const ancoraAperta = await chiama('/domande', 'GET').then(
          (l) => Array.isArray(l) && (l as DomandaAperta[]).some((d) => d.id === idDomanda),
          () => true
        )
        if (!ancoraAperta) return
        p.log?.(`[autopilota] risposta: nessuna conferma dal servizio (${String(err)})`)
        throw Object.assign(new Error(MESSAGGIO_SERVIZIO_OCCUPATO), { scaduto: true })
      }
    },

    async pausaAggiornamento(attiva) {
      const esito = (await chiama('/pausa-aggiornamento', 'POST', { attiva }, attesaScrittura)) as
        { toccati?: unknown } | undefined
      return typeof esito?.toccati === 'number' ? esito.toccati : 0
    },

    async salvaPerAggiornamento() {
      const esito = (await chiama('/salva-per-aggiornamento', 'POST', {}, 60_000)) as
        { salvate?: unknown; provate?: unknown } | undefined
      return {
        salvate: typeof esito?.salvate === 'number' ? esito.salvate : 0,
        provate: typeof esito?.provate === 'number' ? esito.provate : 0
      }
    },

    async battiti(segni, ferme = [], veri = []) {
      await chiama('/battiti', 'POST', { segni, ferme, veri })
    },

    async statoProgramma(stato) {
      await chiama('/stato-programma', 'POST', stato)
    },

    async coda(ws) {
      try {
        const r = (await chiama(`/coda?ws=${encodeURIComponent(ws)}`, 'GET')) as VistaCoda | undefined
        return r !== undefined && Array.isArray(r.richieste) ? r : undefined
      } catch (err) {
        // Un servizio di prima della coda la rifiuta (404): niente coda, non è un guasto.
        if (err instanceof Error && err.message.includes('ha rifiutato la richiesta')) return undefined
        throw err
      }
    },
    separaCoda: async (ws, id) => (await chiama('/coda/separa', 'POST', { ws, id }, attesaScrittura)) as VistaCoda,
    unisciCoda: async (ws, u) => (await chiama('/coda/unisci', 'POST', { ws, ...u }, attesaScrittura)) as VistaCoda,
    async specialista(ws, id) {
      try {
        const r = (await chiama(`/orchestratore/specialista?ws=${encodeURIComponent(ws)}&id=${encodeURIComponent(id)}`, 'GET')) as TrascrizioneSpecialista | undefined
        return r !== undefined && Array.isArray(r.righe) ? r : undefined
      } catch {
        // Un servizio di prima della 0.90.0 non conosce la rotta.
        return undefined
      }
    },
    async orchestratore(ws) {
      try {
        const r = (await chiama(`/orchestratore?ws=${encodeURIComponent(ws)}`, 'GET')) as VistaOrchestratore | undefined
        return r !== undefined && typeof r.workspace === 'string' ? r : undefined
      } catch (err) {
        // Un servizio di prima della P3 non conosce la rotta.
        if (err instanceof Error && err.message.includes('ha rifiutato la richiesta')) return undefined
        throw err
      }
    },
    impostaOrchestratore: async (ws, p) => (await chiama('/orchestratore/impostazioni', 'POST', { ws, ...p }, attesaScrittura)) as VistaOrchestratore,
    // 11/11: un servizio di prima dei limiti non conosce la rotta: niente sezione, non un errore.
    limiti: async () => { try { return vistaLimitiValida(await chiama('/limiti', 'GET')) } catch { return undefined } },
    impostaLimiti: async (p) => vistaLimitiValida(await chiama('/limiti', 'POST', p, attesaScrittura)),
    async attesaSpecialisti() {
      try { return vistaAttesaValida(await chiama('/orchestratore/attesa', 'GET')) } catch { return undefined }
    },
    // 0.103.0: un pezzo del progetto (fino a 4 MB) o un `git bundle` da preparare chiedono più del solito.
    aiuto: (percorso, corpo) => chiama(percorso, corpo === undefined ? 'GET' : 'POST', corpo, 60_000),
    // Voce già partita o tolta (404): la lista com'è adesso.
    prioritaAttesa: async (id, mossa) => { try { return vistaAttesaValida(await chiama('/orchestratore/attesa/priorita', 'POST', { id, mossa }, attesaScrittura)) } catch { return vistaAttesaValida(await chiama('/orchestratore/attesa', 'GET').catch(() => undefined)) } },
    suCambioSpecialisti(f) {
      let fermo = false
      let versione = 0
      const ciclo = async (): Promise<void> => {
        while (!fermo) {
          try {
            const r = await fetch(`${base}/orchestratore/cambi?da=${versione}`, { signal: AbortSignal.timeout(ATTESA_CAMBI_MS + 10_000) })
            if (!r.ok) { await new Promise((ok) => setTimeout(ok, 30_000)); continue }
            const v = ((await r.json()) as { versione?: unknown }).versione
            if (typeof v !== 'number') { await new Promise((ok) => setTimeout(ok, 30_000)); continue }
            // La prima risposta fissa solo il punto di partenza.
            if (versione !== 0 && v !== versione && !fermo) { segnaElencoVecchio(); f() }
            versione = v
          } catch {
            // Servizio non pronto o riavviato: si riprova fra poco; il giro periodico copre il frattempo.
            await new Promise((ok) => setTimeout(ok, 5000))
            versione = 0
          }
        }
      }
      void ciclo()
      return () => { fermo = true }
    },
    togliAttesa: async (id) => { try { return vistaAttesaValida(await chiama('/orchestratore/attesa/togli', 'POST', { id }, attesaScrittura)) } catch { return vistaAttesaValida(await chiama('/orchestratore/attesa', 'GET').catch(() => undefined)) } },

    async gestoreAvviato(aggiornamento) {
      // 0.84.3: le fasi dell'aggiornamento appena fatto, per la riga di riepilogo.
      const esito = (await chiama('/gestore-avviato', 'POST', aggiornamento !== undefined ? { aggiornamento } : undefined, attesaScrittura)) as { ripresi?: unknown } | undefined
      return typeof esito?.ripresi === 'number' ? esito.ripresi : 0
    },

    assicuraServizio() {
      // Una sola verifica alla volta (0.56.2): due chiamate insieme avviavano
      // due servizi nello stesso istante (registro del 09/10, 07:45:02).
      if (inVerifica !== undefined) return inVerifica
      inVerifica = verifica().finally(() => { inVerifica = undefined })
      return inVerifica
    }
  }

  async function verifica(): Promise<boolean> {
      const salute = async (): Promise<{ vivo?: unknown; versione?: unknown } | undefined> => {
        try {
          return (await chiama('/salute', 'GET')) as { vivo?: unknown; versione?: unknown }
        } catch {
          return undefined
        }
      }
      const vivo = async (): Promise<boolean> => (await salute())?.vivo === true

      const stato = await salute()
      if (stato?.vivo === true) {
        avvioInutile = undefined
        // **Un servizio rimasto indietro va cambiato.** Sopravvive alla
        // chiusura dell'applicazione — è tutto il suo mestiere — e l'app lo
        // riavviava solo quando la porta era libera: dopo un aggiornamento
        // restava in memoria quello vecchio, per giorni, e le correzioni
        // appena installate non entravano mai in funzione. Il caso peggiore è
        // proprio quello che si è visto: si aggiorna per riparare l'autopilota
        // e l'autopilota continua a comportarsi come prima.
        if (p.versione === undefined || stato.versione === p.versione) return true
        console.info(
          `[autopilota] il servizio è alla versione ${String(stato.versione ?? 'sconosciuta')},` +
          ` questa è la ${p.versione}: lo sostituisco`
        )
        try {
          await chiama('/spegni', 'POST')
        } catch {
          // Un servizio così vecchio da non conoscere questa rotta: nulla da
          // fare qui, si prova comunque a rifarlo — se la porta resta occupata
          // il nuovo esce da solo, e resta quello di prima.
        }
        await new Promise((r) => setTimeout(r, 800))
        p.avviaServizio()
        await new Promise((r) => setTimeout(r, attesaMs))
        return vivo()
      }
      // Il servizio c'è ma non ha risposto in tempo (0.56.2): era occupato,
      // non morto. Avviarne un altro faceva solo nascere un doppione che
      // trovava la porta presa e usciva — nel registro sembrava un riavvio.
      if (p.portaInAscolto !== undefined && (await p.portaInAscolto().catch(() => false))) {
        p.log?.(`[autopilota] il servizio non ha risposto alla salute in ${Math.round(attesaMs / 1000)} s ma è in ascolto: è occupato, non ne avvio un altro`)
        return vivo()
      }
      // **Un avvio alla volta, al più uno al minuto** (0.84.0). Il 20/10 alle
      // 14:33 e il 21/10 alle 07:27 il servizio era vivo ma fermo su git: la
      // porta non accettava in mezzo secondo e ogni chiamata del pannello ne
      // avviava un altro, che trovava la porta presa e usciva — 62 avvii il
      // 20/10, a decine nello stesso minuto, su un PC già al limite.
      if (avvioInutile !== undefined && adesso() - avvioInutile < MINUTO_FRA_AVVII_MS) {
        p.log?.('[autopilota] il servizio non risponde e l\'ultimo avvio non l\'ha riportato su: aspetto prima di riprovare')
        return false
      }
      p.log?.('[autopilota] il servizio non è in ascolto: lo avvio')
      p.avviaServizio()
      // Un solo tentativo di riavvio: se non risale, insistere non cambierebbe
      // niente e il pannello deve poterlo dire subito invece di restare in
      // caricamento.
      await new Promise((r) => setTimeout(r, attesaMs))
      const risalito = await vivo()
      avvioInutile = risalito ? undefined : adesso()
      return risalito
  }
}
