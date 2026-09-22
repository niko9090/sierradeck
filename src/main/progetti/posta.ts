import type { Scatola } from './presenza'
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

export type { ChatDiPc, BattitoPc, VocePosta, Posta } from '@shared/posta'
export {
  nomeBattitoPc, nomePosta, pcVivo, pcCheHaLaCartella, staSottoCartella,
  PC_SPENTO_DOPO_MS, BATTITO_PC_OGNI_MS, RIAPRI_DOPO_MS, VOCI_MAX, TESTO_POSTA_MAX,
} from '@shared/posta'
import type { ChatDiPc, BattitoPc, VocePosta, Posta } from '@shared/posta'
import {
  nomeBattitoPc, nomePosta, pcVivo,
  PC_SPENTO_DOPO_MS, BATTITO_PC_OGNI_MS, RIAPRI_DOPO_MS, VOCI_MAX, TESTO_POSTA_MAX,
} from '@shared/posta'


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
  /**
   * Gli altri PC come li ricordo: l'ultimo elenco letto, anche a Drive
   * spento. Serve a decidere, senza aspettare la rete, se una cartella e'
   * di un altro PC (`pcCheHaLaCartella`).
   */
  altrui: () => BattitoPc[]
  posta: (pcId: string) => Promise<Posta | undefined>
  aggiungi: (pcId: string, voce: { cwd: string; testo: string; sessione?: string }) => Promise<Posta | undefined>
  togli: (pcId: string, voceId: string) => Promise<Posta | undefined>
  /** Toglie le voci consegnate e fallite. */
  pulisci: (pcId: string) => Promise<Posta | undefined>
}

export function creaPostino(deps: {
  scatola: () => Scatola | undefined
  pcId: () => string
  pcNome: () => string
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
  cartellaEsiste: (cwd: string) => boolean
  /** Apre una chat nuova in quella cartella (in una finestra). */
  apriChat: (cwd: string) => void
  /** Riapre una conversazione precisa, nel suo workspace. */
  riprendiChat: (cwd: string, sessione: string) => void
  /** Scrive nella chat (testo + invio), come dal telefono. */
  scrivi: (idChat: string, testo: string) => void
  adesso?: () => number
  nuovoId?: () => string
  log?: (m: string) => void
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
  let ultimoBattito = ''
  let ultimoBattitoIl = 0
  let inErrore = false

  const leggiPosta = async (s: Scatola, pcId: string): Promise<Posta> => {
    const p = await s.leggi<Posta>(nomePosta(pcId))
    return p !== undefined && Array.isArray(p.voci) ? { voci: p.voci } : { voci: [] }
  }
  const scriviPosta = async (s: Scatola, pcId: string, p: Posta): Promise<void> => {
    if (p.voci.length === 0) await s.cancella(nomePosta(pcId))
    else await s.scrivi(nomePosta(pcId), { voci: p.voci.slice(-VOCI_MAX) })
  }
  const conPosta = async (pcId: string, cambia: (p: Posta) => Posta): Promise<Posta | undefined> => {
    const s = deps.scatola()
    if (s === undefined) return undefined
    const dopo = cambia(await leggiPosta(s, pcId))
    await scriviPosta(s, pcId, dopo)
    return dopo
  }

  const mioBattito = (): BattitoPc => {
    const chat = deps.chat()
    const cartelle = new Set<string>(deps.cartelle())
    for (const c of chat) cartelle.add(c.cwd)
    const rete = deps.rete?.()
    return {
      pcId: deps.pcId(),
      nome: deps.pcNome(),
      versione: deps.versione(),
      battito: iso(),
      cartelle: [...cartelle],
      chat: chat.filter((c) => c.viva).map((c) => ({
        ...(c.sessione !== undefined ? { sessione: c.sessione } : {}),
        titolo: c.titolo, cwd: c.cwd, aspetta: c.aspetta
      })),
      // Dove bussare: e' cio' che permette a un altro PC di aprire una mia
      // chat dal vivo invece di aspettare la copia dal Drive.
      ...(rete !== undefined && rete.indirizzi.length > 0 ? { indirizzi: rete.indirizzi, porta: rete.porta } : {})
    }
  }

  /** Il battito, ma solo se qualcosa e' cambiato o e' passato abbastanza: una scrittura sul Drive non e' gratis. */
  const batti = async (s: Scatola): Promise<void> => {
    const b = mioBattito()
    const { battito: _b, ...senzaOra } = b
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
    const posta = await leggiPosta(s, me)
    const voce = prossimaDaConsegnare(posta)
    if (voce === undefined) return
    const aggiorna = async (nuova: VocePosta): Promise<void> => {
      await scriviPosta(s, me, { voci: posta.voci.map((v) => (v.id === voce.id ? nuova : v)) })
    }
    if (!deps.cartellaEsiste(voce.cwd)) {
      log(`[posta] «${voce.testo.slice(0, 60)}» da ${voce.daNome}: la cartella ${voce.cwd} non esiste qui, fallita`)
      await aggiorna({ ...voce, stato: 'fallita', consegnataIl: iso(), esito: `la cartella ${voce.cwd} non esiste su questo PC` })
      return
    }
    const chat = deps.chat()
    const pronta = scegliDestinataria(chat, voce)
    if (pronta !== undefined && pronta.id !== undefined) {
      deps.scrivi(pronta.id, voce.testo)
      log(`[posta] consegnato a «${pronta.titolo}» (${voce.cwd}) il comando di ${voce.daNome}: ${voce.testo.slice(0, 60)}`)
      await aggiorna({
        ...voce, stato: 'consegnata', consegnataIl: iso(),
        ...(pronta.sessione !== undefined ? { aSessione: pronta.sessione } : {}),
        esito: `consegnato a «${pronta.titolo}»`
      })
      return
    }
    // Nessuna chat pronta. Se nella cartella (o con quella sessione) c'e' una
    // chat che lavora, si aspetta il giro dopo. Se non c'e' nessuna chat, se
    // ne apre una — una volta — e si aspetta che dica «aspetta te».
    const presenti = chatNellaCartella(chat, voce)
    if (presenti.length > 0) return
    const apertaDa = voce.apertaIl !== undefined ? adesso() - Date.parse(voce.apertaIl) : Number.POSITIVE_INFINITY
    if (apertaDa < RIAPRI_DOPO_MS) return
    if (voce.sessione !== undefined && voce.sessione !== '') deps.riprendiChat(voce.cwd, voce.sessione)
    else deps.apriChat(voce.cwd)
    log(`[posta] apro una chat in ${voce.cwd} per il comando di ${voce.daNome}`)
    await aggiorna({ ...voce, apertaIl: iso() })
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
  const ricorda = (b: BattitoPc[]): void => {
    const visti = b.map((x) => `${x.nome} ${x.versione} (${nomeBattitoPc(x.pcId)})`).sort().join(', ')
    if (visti !== altruiVisti) {
      log(`[posta] altri PC sul Drive: ${b.length === 0 ? 'nessuno' : visti}`)
      altruiVisti = visti
    }
    altrui = b
    altruiLettiIl = adesso()
    try { deps.memoria?.scrivi(b) } catch { /* la memoria e' un comodo, non un dovere */ }
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
    altrui: () => altrui,
    async posta(pcId) {
      const s = deps.scatola()
      return s === undefined ? undefined : leggiPosta(s, pcId)
    },
    aggiungi(pcId, voce) {
      const testo = voce.testo.trim().slice(0, TESTO_POSTA_MAX)
      const cwd = voce.cwd.trim()
      if (testo === '' || cwd === '') return Promise.resolve(undefined)
      return conPosta(pcId, (p) => ({
        voci: [...p.voci, {
          id: nuovoId(), testo, cwd, creataIl: iso(), daPc: deps.pcId(), daNome: deps.pcNome(), stato: 'attesa',
          ...(voce.sessione !== undefined && voce.sessione !== '' ? { sessione: voce.sessione } : {})
        }]
      }))
    },
    togli(pcId, voceId) {
      return conPosta(pcId, (p) => ({ voci: p.voci.filter((v) => v.id !== voceId) }))
    },
    pulisci(pcId) {
      return conPosta(pcId, (p) => ({ voci: p.voci.filter((v) => v.stato === 'attesa') }))
    }
  }
}
