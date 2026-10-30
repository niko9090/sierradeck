import { staDentro } from './registro'

/**
 * La posta per un PC: azioni che si eseguono **solo su quel computer**,
 * quando e' acceso.
 *
 * Nicholas (2026-09-14): «se sto operando su una chat su una cartella in
 * rete gli altri come fanno a operare li'? bisogna creare una sorta di azione
 * che rimane eseguibile solo in remoto su quel PC quando e' online,
 * altrimenti non funzionerebbe».
 *
 * La coda condivisa dei progetti (`presenza.ts`) risolve il caso «un
 * progetto che viaggia sul Drive»: chi ha il testimone consegna. Qui il caso
 * e' l'altro: una cartella che sta **su un PC preciso** (un disco di rete
 * montato solo li', una cartella che non viaggia) e che dagli altri PC non
 * si raggiunge. Allora non si porta il lavoro qui: si manda **il comando
 * la'**, e lo esegue quel PC nella sua chat, quando c'e'.
 *
 * Due oggetti cifrati sul Drive, nella stessa scatola delle presenze:
 * - `pc-<id>`: il **battito** di ogni PC — nome, versione, quando, le cartelle
 *   in cui ha chat aperte, le chat aperte con «aspetta te». E' cio' che
 *   permette agli altri di vedere chi c'e' e dove puo' lavorare.
 * - `posta-<id>`: la **cassetta** di quel PC — le voci in attesa, consegnate,
 *   fallite. Chiunque ci scrive; solo quel PC la legge e consegna.
 *
 * La consegna la fa il **postino** di ogni PC, un giro ogni mezzo minuto:
 * per la prima voce in attesa cerca una chat viva che aspetta nella cartella
 * (o la chat precisa, se indicata); se non c'e' nessuna chat in quella
 * cartella ne apre una e riprova al giro dopo; se la cartella non esiste su
 * quel PC la voce fallisce e lo dice. Il risultato del lavoro si legge come
 * sempre: la chat sale sul Drive con il salvataggio automatico e arriva
 * sugli altri PC, e dal telefono si guarda dentro la chat di quel PC.
 *
 * Puro dove si puo': la scelta della chat e lo stato di un PC si provano
 * senza Drive.
 */

export type { ChatDiPc, BattitoPc, VocePosta, Posta, UscitaPosta, EsitoVoce, EsitiPosta } from '@shared/posta'
export {
  nomeBattitoPc, nomePosta, nomeUscita, nomeEsiti, POSTA_PER_MITTENTE, pcVivo, pcCheHaLaCartella, staSottoCartella,
  PC_SPENTO_DOPO_MS, BATTITO_PC_OGNI_MS, RIAPRI_DOPO_MS, VOCI_MAX, TESTO_POSTA_MAX,
} from '@shared/posta'
import type { RisorsePc } from '@shared/risorse'
import {
  ESITO_PROTETTA, type ChatDiPc, type BattitoPc, type LocaliBattito, type VocePosta, type Posta,
  type UscitaPosta, type EsitoVoce, type EsitiPosta
} from '@shared/posta'
import {
  nomeBattitoPc, nomePosta, nomeUscita, nomeEsiti, pcVivo, POSTA_PER_MITTENTE,
  PC_SPENTO_DOPO_MS, BATTITO_PC_OGNI_MS, RIAPRI_DOPO_MS, VOCI_MAX, TESTO_POSTA_MAX,
} from '@shared/posta'

/**
 * I piccoli oggetti cifrati sul Drive (battiti, posta), dalla cassaforte
 * (`sincronia.scatola()`).
 */
export type Scatola = {
  leggi: <T>(nome: string) => Promise<T | undefined>
  scrivi: (nome: string, oggetto: unknown) => Promise<void>
  cancella: (nome: string) => Promise<void>
  /** I nomi degli oggetti con quel prefisso: serve a trovare i PC (`pc-*`). Facoltativa nelle prove. */
  elenca?: (prefisso: string) => Promise<string[]>
}

/**
 * La chat a cui va una voce: quella precisa se e' indicata (e aspetta), o la
 * prima viva che aspetta dentro la cartella. `undefined` quando nessuna puo'
 * riceverla adesso.
 */
export function scegliDestinataria(chat: ChatDiPc[], voce: Pick<VocePosta, 'cwd' | 'sessione'>): ChatDiPc | undefined {
  const pronte = chat.filter((c) => c.viva && c.aspetta)
  if (voce.sessione !== undefined && voce.sessione !== '') return pronte.find((c) => c.sessione === voce.sessione)
  return pronte.find((c) => staDentro(c.cwd, voce.cwd))
}

/** Le chat (vive o no) che stanno nella cartella della voce, o quella precisa. */
export function chatNellaCartella(chat: ChatDiPc[], voce: Pick<VocePosta, 'cwd' | 'sessione'>): ChatDiPc[] {
  if (voce.sessione !== undefined && voce.sessione !== '') return chat.filter((c) => c.sessione === voce.sessione)
  return chat.filter((c) => staDentro(c.cwd, voce.cwd))
}

export function prossimaDaConsegnare(p: Posta): VocePosta | undefined {
  return p.voci.find((v) => v.stato === 'attesa')
}

export type Postino = {
  /** Un giro: il battito, poi la prima voce in attesa della mia cassetta. */
  giro: () => Promise<void>
  /** Il mio id: per non elencarmi fra «gli altri PC». */
  io: () => string
  /** Gli altri PC sul Drive, con il battito. */
  pc: () => Promise<BattitoPc[]>
  /** Come `pc`, ma subito: i battiti in memoria (un minuto), riletti in sottofondo (0.68.0). */
  pcSubito: () => Promise<BattitoPc[]>
  /**
   * Gli altri PC come li ricordo: l'ultimo elenco letto, anche a Drive
   * spento. Serve a decidere, senza aspettare la rete, se una cartella e'
   * di un altro PC (`pcCheHaLaCartella`).
   */
  altrui: () => BattitoPc[]
  posta: (pcId: string) => Promise<Posta | undefined>
  aggiungi: (pcId: string, voce: { id?: string; comando?: VocePosta['comando']; cwd: string; testo: string; sessione?: string; origine?: 'umano' | 'autopilota'; daVisore?: string }) => Promise<Posta | undefined>
  togli: (pcId: string, voceId: string) => Promise<Posta | undefined>
  /** Toglie le voci consegnate e fallite. */
  pulisci: (pcId: string) => Promise<Posta | undefined>
}

/** Quanto valgono i battiti già letti per chi li chiede (0.68.0). */
export const MEMORIA_BATTITI_MS = 60_000
/** Quante voci tolte ricorda una cassetta d'uscita (0.86.2). */
export const TOLTE_MAX = 200
/** Quanti id consegnati ricorda questo PC, per non riscrivere mai due volte lo stesso comando (0.86.2). */
export const CONSEGNATE_MAX = 500
/** Un esito di una voce che non c'e' piu' in nessuna cassetta si dimentica dopo tanto (0.86.2). */
export const ESITI_SCADONO_MS = 30 * 24 * 60 * 60_000

/** Solo le voci con la forma giusta: la cassetta viene dal Drive. */
function vociValide(x: unknown): VocePosta[] {
  if (!Array.isArray(x)) return []
  return x.filter((v): v is VocePosta => typeof v === 'object' && v !== null &&
    typeof (v as VocePosta).id === 'string' && typeof (v as VocePosta).testo === 'string' && typeof (v as VocePosta).cwd === 'string')
}

/**
 * La cassetta di un PC come la vede chiunque (0.86.2): la cassetta unica di
 * prima, piu' le cassette d'uscita dei mittenti, con gli esiti scritti dal
 * destinatario sopra, senza le voci tolte; in ordine di creazione.
 */
export function unisciCassetta(p: { vecchia: Posta; uscite: UscitaPosta[]; esiti: Record<string, EsitoVoce> }): Posta {
  const tolte = new Set(p.uscite.flatMap((u) => u.tolte ?? []))
  const perId = new Map<string, VocePosta>()
  for (const v of p.vecchia.voci) perId.set(v.id, v)
  for (const u of p.uscite) for (const v of u.voci) if (!perId.has(v.id)) perId.set(v.id, v)
  const voci = [...perId.values()]
    .filter((v) => !tolte.has(v.id))
    .map((v) => {
      const e = p.esiti[v.id]
      if (e === undefined) return v
      const { il: _il, ...resto } = e
      return { ...v, ...resto }
    })
    .sort((a, b) => (a.creataIl ?? '').localeCompare(b.creataIl ?? ''))
  return { voci }
}

export function creaPostino(deps: {
  scatola: () => Scatola | undefined
  pcId: () => string
  pcNome: () => string
  /** L'hostname e il nome scelto (0.52.4), per il battito: gli altri mostrano il nome, l'hostname piccolo sotto. */
  identita?: () => { host: string; nomeScelto?: string }
  versione: () => string
  /** Le chat aperte su questo PC, adesso. */
  chat: () => ChatDiPc[]
  /** Le cartelle in cui questo PC puo' lavorare: progetti collegati qui e simili. Le chat aperte si aggiungono da sole. */
  cartelle: () => string[]
  /**
   * Dove gli altri PC possono bussare al mio Client per guardare una chat dal
   * vivo: gli indirizzi (il migliore per primo) e la porta. Senza, il battito
   * non li porta e da fuori la chat si vede solo dalla copia sul Drive.
   */
  rete?: () => { indirizzi: string[]; porta: number }
  /** Le chat e i progetti sul disco di questo PC (0.58.0). */
  locali?: () => LocaliBattito | undefined
  /** I workspace di questo PC (0.65.1): gli altri li mostrano a parte, «Su altri PC». */
  workspace?: () => string[] | undefined
  /** Lo stato del Client di questo PC (0.58.1). */
  client?: () => { inAscolto: boolean; errore?: string } | undefined
  /** Quanto lavora SierraDeck qui (0.69.0): va nel battito, ma non lo fa riscrivere. */
  risorse?: () => RisorsePc | undefined
  cartellaEsiste: (cwd: string) => boolean
  /**
   * Esegue un comando arrivato per posta (0.88.0, «Sposta su questo PC»):
   * l'esito, già in testo, va negli esiti. Senza, un comando fallisce e lo dice.
   */
  comando?: (c: NonNullable<VocePosta['comando']>, voce: VocePosta) => Promise<{ ok: boolean; esito: string }>
  /** Apre una chat nuova in quella cartella (in una finestra). */
  apriChat: (cwd: string) => void
  /** Riapre una conversazione precisa, nel suo workspace. */
  riprendiChat: (cwd: string, sessione: string) => void
  /** Scrive nella chat (testo + invio), come dal telefono. */
  scrivi: (idChat: string, testo: string) => void
  /**
   * Il PIN delle chat (0.49.1): questa chat è protetta e chiusa per chi ha
   * scritto la voce? Allora una voce scritta da una persona non si consegna.
   */
  chiusaPer?: (chat: ChatDiPc, voce: VocePosta) => boolean
  adesso?: () => number
  nuovoId?: () => string
  log?: (m: string) => void
  /**
   * Dove ricordare gli id delle voci gia' scritte nelle chat (0.86.2): la
   * chiave contro i doppioni, anche dopo un riavvio.
   */
  consegnate?: { leggi: () => string[]; scrivi: (ids: string[]) => void }
  /** Dove ricordare i battiti degli altri PC fra un avvio e l'altro. */
  memoria?: { leggi: () => BattitoPc[]; scrivi: (b: BattitoPc[]) => void }
}): Postino {
  const adesso = deps.adesso ?? ((): number => Date.now())
  const log = deps.log ?? ((): void => {})
  const nuovoId = deps.nuovoId ?? ((): string => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`)
  const iso = (): string => new Date(adesso()).toISOString()
  let inGiro = false
  let altrui: BattitoPc[] = deps.memoria?.leggi() ?? []
  let altruiLettiIl = 0
  /** La rilettura dei battiti in corso, una sola alla volta (0.68.0). */
  let inLettura: Promise<BattitoPc[]> | undefined
  let ultimoBattito = ''
  let ultimoBattitoIl = 0
  let inErrore = false

  /*
   * La posta fra i PC (0.86.2, audit I1). Prima c'era una cassetta sola per PC,
   * letta, cambiata e riscritta da chiunque senza lucchetto: due PC che
   * scrivevano insieme si cancellavano i messaggi. Adesso ogni file ha **un
   * solo scrittore**:
   * - `posta-<dest>-da-<mitt>`: le voci che `mitt` manda a `dest`, scritte solo da `mitt`;
   * - `posta-<dest>-esiti`: come sono andate, scritto solo da `dest`.
   * La cassetta unica di prima (`posta-<dest>`) si legge ancora: un PC fermo a
   * una versione vecchia ci scrive. E a un PC che non dice `posta` nel battito
   * si scrive ancora li', perche' non sa leggere altro.
   */
  const leggiVecchia = async (s: Scatola, pcId: string): Promise<Posta> => {
    const p = await s.leggi<Posta>(nomePosta(pcId))
    return p !== undefined && p !== null ? { voci: vociValide(p.voci) } : { voci: [] }
  }
  const scriviVecchia = async (s: Scatola, pcId: string, p: Posta): Promise<void> => {
    if (p.voci.length === 0) await s.cancella(nomePosta(pcId))
    else await s.scrivi(nomePosta(pcId), { voci: p.voci.slice(-VOCI_MAX) })
  }
  /** La cassetta unica, per i PC vecchi: si rilegge subito prima di riscriverla, per stringere la finestra. */
  const conVecchia = async (s: Scatola, pcId: string, cambia: (p: Posta) => Posta): Promise<void> => {
    await scriviVecchia(s, pcId, cambia(await leggiVecchia(s, pcId)))
  }
  const leggiUscita = async (s: Scatola, dest: string, mitt: string): Promise<UscitaPosta> => {
    const u = await s.leggi<UscitaPosta>(nomeUscita(dest, mitt))
    if (u === undefined || u === null) return { voci: [] }
    const tolte = Array.isArray(u.tolte) ? u.tolte.filter((t): t is string => typeof t === 'string') : []
    return { voci: vociValide(u.voci), ...(tolte.length > 0 ? { tolte } : {}) }
  }
  const scriviUscita = async (s: Scatola, dest: string, u: UscitaPosta): Promise<void> => {
    const tolte = (u.tolte ?? []).slice(-TOLTE_MAX)
    if (u.voci.length === 0 && tolte.length === 0) await s.cancella(nomeUscita(dest, deps.pcId()))
    else await s.scrivi(nomeUscita(dest, deps.pcId()), { voci: u.voci.slice(-VOCI_MAX), ...(tolte.length > 0 ? { tolte } : {}) })
  }
  const leggiEsiti = async (s: Scatola, dest: string): Promise<Record<string, EsitoVoce>> => {
    const e = await s.leggi<EsitiPosta>(nomeEsiti(dest))
    return e !== undefined && e !== null && typeof e.esiti === 'object' && e.esiti !== null ? e.esiti : {}
  }
  /** Legge il formato nuovo quel PC? Io si'; gli altri lo dicono nel battito. */
  const leggeLeUscite = (pcId: string): boolean =>
    pcId === deps.pcId() || (altrui.find((b) => b.pcId === pcId)?.posta ?? 0) >= POSTA_PER_MITTENTE
  /** Chi puo' avermi scritto: io, il destinatario, e gli altri PC che conosco. */
  const mittenti = (dest: string): string[] => [...new Set([deps.pcId(), dest, ...altrui.map((b) => b.pcId)])]

  type Cassetta = { vista: Posta; vecchia: Posta; uscite: Map<string, UscitaPosta>; esiti: Record<string, EsitoVoce> }
  const leggiCassetta = async (s: Scatola, dest: string): Promise<Cassetta> => {
    const chi = leggeLeUscite(dest) ? mittenti(dest) : []
    const [vecchia, esiti, lette] = await Promise.all([
      leggiVecchia(s, dest),
      chi.length > 0 ? leggiEsiti(s, dest) : Promise.resolve({}),
      Promise.all(chi.map((m) => leggiUscita(s, dest, m)))
    ])
    const uscite = new Map<string, UscitaPosta>(chi.map((m, i) => [m, lette[i] ?? { voci: [] }]))
    return { vista: unisciCassetta({ vecchia, uscite: [...uscite.values()], esiti }), vecchia, uscite, esiti }
  }

  /** Le scritture di questo PC sulla posta, una alla volta: due invii insieme non si pestano la cassetta d'uscita. */
  let fila: Promise<unknown> = Promise.resolve()
  const inFila = <T,>(lavoro: () => Promise<T>): Promise<T> => {
    const giro = fila.then(lavoro, lavoro)
    fila = giro.catch(() => undefined)
    return giro
  }

  /**
   * Gli id gia' consegnati qui (0.86.2): la chiave che impedisce di scrivere
   * due volte lo stesso comando nella chat, anche se il Drive rilegge una
   * cassetta vecchia. Ricordati anche fra un avvio e l'altro, se c'e' dove.
   */
  const consegnateQui: string[] = (() => { try { return [...(deps.consegnate?.leggi() ?? [])] } catch { return [] } })()
  const giaConsegnata = (id: string): boolean => consegnateQui.includes(id)
  const ricordaConsegnata = (id: string): void => {
    if (giaConsegnata(id)) return
    consegnateQui.push(id)
    if (consegnateQui.length > CONSEGNATE_MAX) consegnateQui.splice(0, consegnateQui.length - CONSEGNATE_MAX)
    try { deps.consegnate?.scrivi([...consegnateQui]) } catch { /* la memoria in sessione basta */ }
  }

  const mioBattito = (): BattitoPc => {
    const chat = deps.chat()
    const cartelle = new Set<string>(deps.cartelle())
    for (const c of chat) cartelle.add(c.cwd)
    const rete = deps.rete?.()
    return {
      pcId: deps.pcId(),
      nome: deps.pcNome(),
      ...(() => {
        const i = deps.identita?.()
        return i === undefined ? {} : { host: i.host, ...(i.nomeScelto !== undefined ? { nomeScelto: i.nomeScelto } : {}) }
      })(),
      versione: deps.versione(),
      // So leggere le cassette d'uscita (0.86.2): chi lo vede mi scrive li'.
      posta: POSTA_PER_MITTENTE,
      battito: iso(),
      cartelle: [...cartelle],
      chat: chat.filter((c) => c.viva).map((c) => ({
        ...(c.sessione !== undefined ? { sessione: c.sessione } : {}),
        titolo: c.titolo, cwd: c.cwd, aspetta: c.aspetta,
        // Le opzioni di una domanda ferma (0.52.6): i pulsanti nelle Domande degli altri PC.
        ...(c.scelte !== undefined && c.scelte.length > 0 ? { scelte: c.scelte.slice(0, 12) } : {}),
        ...(c.domanda !== undefined && c.domanda !== '' ? { domanda: c.domanda.slice(0, 1200) } : {}),
        // Qualche riga prima della domanda (0.84.1), per le Domande degli altri PC.
        ...(c.contesto !== undefined && c.contesto.length > 0 ? { contesto: c.contesto.slice(-6).map((r) => r.slice(0, 200)) } : {})
      })),
      // Dove bussare: e' cio' che permette a un altro PC di aprire una mia
      // chat dal vivo invece di aspettare la copia dal Drive.
      ...(rete !== undefined && rete.indirizzi.length > 0 ? { indirizzi: rete.indirizzi, porta: rete.porta } : {}),
      ...(() => { const l = deps.locali?.(); return l === undefined ? {} : { locali: l } })(),
      ...(() => { const w = deps.workspace?.(); return w === undefined ? {} : { workspace: w } })(),
      ...(() => { const c = deps.client?.(); return c === undefined ? {} : { client: c } })(),
      ...(() => { const r = deps.risorse?.(); return r === undefined ? {} : { risorse: r } })()
    }
  }

  /** Il battito, ma solo se qualcosa e' cambiato o e' passato abbastanza: una scrittura sul Drive non e' gratis. */
  const batti = async (s: Scatola): Promise<void> => {
    const b = mioBattito()
    // Le risorse cambiano a ogni misura: se contassero, il battito si riscriverebbe a ogni giro.
    const { battito: _b, risorse: _r, ...senzaOra } = b
    const firma = JSON.stringify(senzaOra)
    if (firma === ultimoBattito && adesso() - ultimoBattitoIl < BATTITO_PC_OGNI_MS) return
    await s.scrivi(nomeBattitoPc(b.pcId), b)
    // La prima volta si dice: e' l'unico modo, dal registro, di sapere se
    // questo PC si fa vedere dagli altri (il 17/09 nessuno vedeva nessuno e
    // il registro taceva).
    if (ultimoBattito === '') log(`[posta] battito scritto sul Drive come ${nomeBattitoPc(b.pcId)} («${b.nome}», ${b.versione}, ${b.cartelle.length} cartelle)`)
    ultimoBattito = firma
    ultimoBattitoIl = adesso()
  }

  /** La prima voce in attesa della mia cassetta: consegnata, aperta, o fallita. */
  const consegna = async (s: Scatola): Promise<void> => {
    const me = deps.pcId()
    const cassetta = await leggiCassetta(s, me)
    // Una voce gia' scritta qui non si riscrive, anche se il Drive la mostra ancora in attesa.
    const voce = cassetta.vista.voci.find((v) => v.stato === 'attesa' && !giaConsegnata(v.id))
    if (voce === undefined) return
    /**
     * L'esito va nel file degli esiti, che scrivo solo io. Se la voce viene
     * dalla cassetta unica di un PC vecchio, la si aggiorna anche li' (per chi
     * la guarda da quel PC): riletta subito prima, cambiando solo questa voce.
     */
    const aggiorna = async (nuova: VocePosta): Promise<void> => {
      const esito: EsitoVoce = {
        stato: nuova.stato, il: iso(),
        ...(nuova.consegnataIl !== undefined ? { consegnataIl: nuova.consegnataIl } : {}),
        ...(nuova.aSessione !== undefined ? { aSessione: nuova.aSessione } : {}),
        ...(nuova.esito !== undefined ? { esito: nuova.esito } : {}),
        ...(nuova.apertaIl !== undefined ? { apertaIl: nuova.apertaIl } : {})
      }
      const viste = new Set(cassetta.vista.voci.map((v) => v.id))
      const limite = adesso() - ESITI_SCADONO_MS
      const tenuti = Object.entries(cassetta.esiti).filter(([id, e]) => id !== voce.id && (viste.has(id) || Date.parse(e.il) > limite))
      const esiti: Record<string, EsitoVoce> = Object.fromEntries([...tenuti, [voce.id, esito]])
      await s.scrivi(nomeEsiti(me), { esiti })
      cassetta.esiti = esiti
      if (cassetta.vecchia.voci.some((v) => v.id === voce.id)) {
        try {
          await conVecchia(s, me, (p) => ({ voci: p.voci.map((v) => (v.id === voce.id ? { ...v, ...nuova } : v)) }))
        } catch (err) {
          log(`[posta] esito di «${voce.testo.slice(0, 60)}» non riportato nella cassetta vecchia (resta nel file degli esiti): ${String(err)}`)
        }
      }
    }
    if (voce.comando !== undefined) {
      // Un comando per il programma, non per una chat. I comandi si possono
      // rifare senza danni: se l'esito non si scrive, si rifà al giro dopo.
      let r: { ok: boolean; esito: string }
      try {
        r = deps.comando === undefined
          ? { ok: false, esito: 'questo PC non sa eseguire comandi dalla posta' }
          : await deps.comando(voce.comando, voce)
      } catch (err) {
        r = { ok: false, esito: String(err) }
      }
      await aggiorna({ ...voce, stato: r.ok ? 'consegnata' : 'fallita', consegnataIl: iso(), esito: r.esito })
      ricordaConsegnata(voce.id)
      log(`[posta] comando «${voce.comando.tipo}» da ${voce.daNome}: ${r.ok ? 'fatto' : 'non riuscito'}`)
      return
    }
    if (!deps.cartellaEsiste(voce.cwd)) {
      log(`[posta] «${voce.testo.slice(0, 60)}» da ${voce.daNome}: la cartella ${voce.cwd} non esiste qui, fallita`)
      await aggiorna({ ...voce, stato: 'fallita', consegnataIl: iso(), esito: `la cartella ${voce.cwd} non esiste su questo PC` })
      return
    }
    const chat = deps.chat()
    const pronta = scegliDestinataria(chat, voce)
    if (pronta !== undefined && pronta.id !== undefined) {
      // L'input di una persona verso una chat protetta passa dal PIN (0.49.1).
      if ((voce.origine ?? 'umano') === 'umano' && deps.chiusaPer?.(pronta, voce) === true) {
        log(`[posta] «${voce.testo.slice(0, 60)}» da ${voce.daNome}: la chat «${pronta.titolo}» è protetta dal PIN e chiusa per chi l'ha scritta, non consegnata`)
        await aggiorna({ ...voce, stato: 'fallita', consegnataIl: iso(), esito: ESITO_PROTETTA })
        return
      }
      // Prima si segna consegnata, poi si scrive nella chat (0.86.2, audit I1):
      // se il Drive non prende l'esito non si scrive niente e si riprova al
      // giro dopo; se lo prende, il comando non si riscrive mai piu'.
      await aggiorna({
        ...voce, stato: 'consegnata', consegnataIl: iso(),
        ...(pronta.sessione !== undefined ? { aSessione: pronta.sessione } : {}),
        esito: `consegnato a «${pronta.titolo}»`
      })
      ricordaConsegnata(voce.id)
      try {
        deps.scrivi(pronta.id, voce.testo)
      } catch (err) {
        log(`[posta] «${voce.testo.slice(0, 60)}» da ${voce.daNome}: non scritto in «${pronta.titolo}»: ${String(err)}`)
        await aggiorna({ ...voce, stato: 'fallita', consegnataIl: iso(), esito: `non scritto nella chat «${pronta.titolo}»: ${String(err)}` })
        return
      }
      log(`[posta] consegnato a «${pronta.titolo}» (${voce.cwd}) il comando di ${voce.daNome}: ${voce.testo.slice(0, 60)}`)
      return
    }
    // Nessuna chat pronta. Se nella cartella (o con quella sessione) c'e' una
    // chat che lavora, si aspetta il giro dopo. Se non c'e' nessuna chat, se
    // ne apre una — una volta — e si aspetta che dica «aspetta te».
    const presenti = chatNellaCartella(chat, voce)
    if (presenti.length > 0) return
    const apertaDa = voce.apertaIl !== undefined ? adesso() - Date.parse(voce.apertaIl) : Number.POSITIVE_INFINITY
    if (apertaDa < RIAPRI_DOPO_MS) return
    // Anche qui prima l'esito: se il Drive non lo prende, non si apre una chat che verrebbe riaperta al giro dopo.
    await aggiorna({ ...voce, apertaIl: iso() })
    if (voce.sessione !== undefined && voce.sessione !== '') deps.riprendiChat(voce.cwd, voce.sessione)
    else deps.apriChat(voce.cwd)
    log(`[posta] apro una chat in ${voce.cwd} per il comando di ${voce.daNome}`)
  }

  const leggiAltrui = async (s: Scatola): Promise<BattitoPc[]> => {
    if (s.elenca === undefined) return []
    const nomi = await s.elenca('pc-')
    const me = deps.pcId()
    const letti = await Promise.all(nomi.map((n) => s.leggi<BattitoPc>(n)))
    return letti
      .filter((b): b is BattitoPc => b !== undefined && typeof b.pcId === 'string' && b.pcId !== me)
      .map(({ indirizzi, porta, ...b }) => ({
        ...b, cartelle: Array.isArray(b.cartelle) ? b.cartelle : [], chat: Array.isArray(b.chat) ? b.chat : [],
        // Il battito viene dal Drive: si tiene solo cio' che ha la forma giusta.
        ...(Array.isArray(indirizzi) ? { indirizzi: indirizzi.filter((i): i is string => typeof i === 'string') } : {}),
        ...(typeof porta === 'number' && Number.isInteger(porta) && porta > 0 && porta < 65536 ? { porta } : {})
      }))
      .sort((a, b) => b.battito.localeCompare(a.battito))
  }
  let altruiVisti = ''
  let altruiScritti = ''
  const ricorda = (b: BattitoPc[]): void => {
    const visti = b.map((x) => `${x.nome} ${x.versione} (${nomeBattitoPc(x.pcId)})`).sort().join(', ')
    if (visti !== altruiVisti) {
      log(`[posta] altri PC sul Drive: ${b.length === 0 ? 'nessuno' : visti}`)
      altruiVisti = visti
    }
    altrui = b
    altruiLettiIl = adesso()
    // Sul disco solo se è cambiato (0.69.0): si rileggono ogni minuto, ma un battito cambia ogni due.
    const testo = JSON.stringify(b)
    if (testo === altruiScritti) return
    try { deps.memoria?.scrivi(b); altruiScritti = testo } catch { /* la memoria e' un comodo, non un dovere */ }
  }

  return {
    async giro() {
      if (inGiro) return
      const s = deps.scatola()
      if (s === undefined) return
      inGiro = true
      try {
        await batti(s)
        // Gli altri PC si rileggono con calma: le loro cartelle non cambiano
        // ogni mezzo minuto, e ogni lettura e' una richiesta al Drive.
        if (adesso() - altruiLettiIl >= BATTITO_PC_OGNI_MS) ricorda(await leggiAltrui(s))
        await consegna(s)
        if (inErrore) { inErrore = false; log('[posta] il Drive risponde di nuovo') }
      } catch (err) {
        if (!inErrore) { inErrore = true; log(`[posta] giro fallito (non lo ripeto finche' non torna a rispondere): ${String(err)}`) }
      } finally {
        inGiro = false
      }
    },
    io: () => deps.pcId(),
    async pc() {
      const s = deps.scatola()
      if (s === undefined) return altrui
      const letti = await leggiAltrui(s)
      ricorda(letti)
      return letti
    },
    pcSubito() {
      const s = deps.scatola()
      if (s === undefined) return Promise.resolve(altrui)
      // Rileggere i battiti dal Drive ci mette anche 20 secondi (controllo del
      // 12/10, 0.68.0): «Domande» e la lista dei PC del telefono aspettavano
      // ogni volta. Un minuto di memoria; poi si risponde con quelli che ci sono
      // e si rilegge in sottofondo. Si aspetta il Drive solo se non c'è niente.
      if (altruiLettiIl > 0 && adesso() - altruiLettiIl < MEMORIA_BATTITI_MS) return Promise.resolve(altrui)
      if (inLettura === undefined) {
        inLettura = leggiAltrui(s)
          .then((letti) => { ricorda(letti); return letti })
          .finally(() => { inLettura = undefined })
      }
      if (altrui.length > 0) { void inLettura.catch(() => undefined); return Promise.resolve(altrui) }
      return inLettura
    },
    altrui: () => altrui,
    async posta(pcId) {
      const s = deps.scatola()
      return s === undefined ? undefined : (await leggiCassetta(s, pcId)).vista
    },
    aggiungi: (pcId, voce) => inFila(async () => {
      const testo = voce.testo.trim().slice(0, TESTO_POSTA_MAX)
      const cwd = voce.cwd.trim()
      if (testo === '' || cwd === '') return undefined
      const s = deps.scatola()
      if (s === undefined) return undefined
      const nuova: VocePosta = {
        id: voce.id !== undefined && voce.id !== '' ? voce.id : nuovoId(), testo, cwd, creataIl: iso(), daPc: deps.pcId(), daNome: deps.pcNome(), stato: 'attesa',
        ...(voce.sessione !== undefined && voce.sessione !== '' ? { sessione: voce.sessione } : {}),
        ...(voce.comando !== undefined ? { comando: voce.comando } : {}),
        origine: voce.origine ?? 'umano',
        daVisore: voce.daVisore ?? deps.pcId()
      }
      if (leggeLeUscite(pcId)) {
        // La mia cassetta d'uscita verso quel PC: la scrivo solo io, nessuno me la cancella.
        const u = await leggiUscita(s, pcId, deps.pcId())
        await scriviUscita(s, pcId, { ...u, voci: [...u.voci, nuova] })
      } else {
        // Un PC che non legge le cassette d'uscita (prima della 0.86.2): la cassetta unica.
        await conVecchia(s, pcId, (p) => ({ voci: [...p.voci, nuova] }))
      }
      return (await leggiCassetta(s, pcId)).vista
    }),
    togli: (pcId, voceId) => inFila(async () => {
      const s = deps.scatola()
      if (s === undefined) return undefined
      const c = await leggiCassetta(s, pcId)
      const mia = c.uscite.get(deps.pcId())
      if (mia !== undefined && mia.voci.some((v) => v.id === voceId)) {
        await scriviUscita(s, pcId, { ...mia, voci: mia.voci.filter((v) => v.id !== voceId) })
      } else if (c.vecchia.voci.some((v) => v.id === voceId)) {
        await conVecchia(s, pcId, (p) => ({ voci: p.voci.filter((v) => v.id !== voceId) }))
      } else if (c.vista.voci.some((v) => v.id === voceId)) {
        // Una voce di un altro mittente: la sua cassetta non la tocco, la segno tolta nella mia.
        const u = mia ?? { voci: [] }
        await scriviUscita(s, pcId, { ...u, tolte: [...(u.tolte ?? []), voceId] })
      }
      return (await leggiCassetta(s, pcId)).vista
    }),
    pulisci: (pcId) => inFila(async () => {
      const s = deps.scatola()
      if (s === undefined) return undefined
      const c = await leggiCassetta(s, pcId)
      const finite = new Set(c.vista.voci.filter((v) => v.stato !== 'attesa').map((v) => v.id))
      if (finite.size === 0) return c.vista
      const mia = c.uscite.get(deps.pcId()) ?? { voci: [] }
      const mie = new Set(mia.voci.map((v) => v.id))
      const vecchie = new Set(c.vecchia.voci.map((v) => v.id))
      const diAltri = [...finite].filter((id) => !mie.has(id) && !vecchie.has(id))
      if (mia.voci.some((v) => finite.has(v.id)) || diAltri.length > 0) {
        await scriviUscita(s, pcId, {
          voci: mia.voci.filter((v) => !finite.has(v.id)),
          tolte: [...(mia.tolte ?? []), ...diAltri]
        })
      }
      if (c.vecchia.voci.some((v) => finite.has(v.id))) {
        await conVecchia(s, pcId, (p) => ({ voci: p.voci.filter((v) => !finite.has(v.id) && v.stato === 'attesa') }))
      }
      return (await leggiCassetta(s, pcId)).vista
    })
  }
}
