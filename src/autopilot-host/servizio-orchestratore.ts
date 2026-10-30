import { randomUUID } from 'node:crypto'
import {
  DIALOGO_RICORDATO, idChatNuova,
  type Autopilota, type ChatGovernata, type Traguardo
} from '@shared/autopilota'
import {
  aggiungi, avanzamentoCoda, candidatiUnione, chiaveWorkspace, daSeguire,
  type Coda, type MisuraCompito, type Modifica, type VistaCoda
} from '@shared/coda-richieste'
import {
  allineaConPiano, comandoDelCriterio, conCompito, conPercento, misuraDalPiano, misuraUnita,
  type CompitoPiano, type PercentoWs, type Piano
} from '@shared/piano-orchestratore'
import { preamboloRuolo, RUOLI, type Ruolo } from '@shared/ruoli-agenti'
import { REGOLA_RAPPORTO } from '@shared/rapporti-chat'
import { REGOLA_SEGNALE } from '@shared/segnali-flotta'
import { REGOLA_LEZIONI } from '@shared/lezioni-chat'
import { esaminaComando } from '@shared/controllo-comandi'
import { domandaControllataSubito, domandaPerRegistro } from '@shared/domanda-strutturata'
import type { ArchivioCode } from './coda-store'
import { autopilotiDel, migraAutopiloti, misuraDaAutopiloti } from './coda-autopiloti'
import type { ContestoDomanda, RegistroDomande } from './domande'
import { aperteSulloStesso } from './domande-doppie'
import { conMessaggioPerLaChat } from './dialogo'
import { fallitiDavvero, nonMisurati } from './rete-sicurezza'
import { misuraCriteri, type MemoriaCriteri } from './criteri-veloci'
import type { Esecutore } from './verifiche'
import type { Memoria } from './memoria'
import type { TipoAvviso } from './telegram'
import {
  comeAsincrono, creaWorktreeAsincrono, ramoCorrente, ramoGiaChiusoAsincrono, salvaLavoroAsincrono,
  type Git, type GitAsincrono
} from './worktree'
import {
  creaGettoniOrchestratore, configMcpOrchestratore, rispondiMcpOrchestratore, specialistiVivi, SPECIALISTI_PC_MAX,
  type AmbienteOrchestratore, type EsitoAmbiente
} from './mcp-orchestratore'
import {
  creaOrchestratore, SILENZIO_SPECIALISTA_MS,
  type EsecutoreClaude, type EventoOrchestratore, type Orchestratore
} from './orchestratore'
import type { ArchivioOrchestratori, ImpostazioniOrchestratore, RigaDialogo } from './orchestratore-store'
import { TETTO_SPECIALISTI_MAX } from './orchestratore-store'
import { fermataSpecialista } from './stop-specialista'
import { hookAdottato, nuovoUnico, obiettiviInCoda, passaAllUnico } from './migra-orchestratore'
import { riassuntoOrchestratore } from './riassunto-orchestratore'

/**
 * **L'autopilota unico dentro il servizio** (P3): lega l'orchestratore
 * (`orchestratore.ts`), i suoi strumenti (`mcp-orchestratore.ts`), lo Stop
 * veloce, la migrazione e la percentuale al servizio degli autopiloti
 * (`server.ts`), che gli presta quello che ha già: salvare, annotare,
 * consegnare nel mosaico, l'unione di prova nel principale, i posti del PC.
 *
 * Tutto dietro l'interruttore del workspace (`orchestratore.json`): spento,
 * il workspace va con gli autopiloti di prima, come sempre.
 */

export type EsitoAvvioUnico = { consegna?: string; rifiutata?: string }

/** Quello che il servizio presta all'autopilota unico. */
export type ContestoUnico = {
  archivio: { leggi: (id: string) => Autopilota | undefined; elenca: () => Autopilota[]; scrivi: (a: Autopilota) => void }
  code: ArchivioCode
  orchestratori: ArchivioOrchestratori
  esecutoreClaude: EsecutoreClaude
  porta: number
  versione: string
  adesso: () => string
  domande: RegistroDomande
  memoria?: Memoria
  avvisa: (tipo: TipoAvviso, a: Autopilota, testo?: string) => Promise<void>
  lezioni?: (cwd: string, voci: { tag?: string; testo: string }[], quando: string) => { nuove: number; confermate: number }
  indiceQuaderno?: (cwd: string) => string
  ultimoDetto?: (cwd: string, sessionId: string) => string | undefined
  git?: Git
  gitAsincrono?: GitAsincrono
  esegui: Esecutore
  scadenzaDomandaMs: number
  salva: (a: Autopilota) => void
  annota: (a: Autopilota, cosa: string, traguardo?: Traguardo) => void
  avviaLavoro: (a: Autopilota, messaggio: string | undefined, chat: ChatGovernata) => Promise<EsitoAvvioUnico>
  fermaLavoro: (id: string, chatId?: string, chi?: { sessionId: string; workspace?: string }) => void
  /** Porta i messaggi in coda alle chat ferme (lo Stop li porta a fine turno). */
  consegnaAlleFerme: (autopilotaId: string) => void
  /** Fa avanzare la fine delle chat chiuse (P2). */
  avanzaFinite: () => void
  posti: () => number
  chatAlLavoroSulPc: () => number
  /** L'unione di prova nel principale con i criteri dell'autopilota (`provaNelPrincipale`). */
  provaNelPrincipale: (a: Autopilota, ramo: string) => Promise<{ unito: true } | { unito: false; motivo: string }>
  ricordaContesto: (idDomanda: string, c: ContestoDomanda) => void
  /** L'ultimo segno di vita di una chat (hook, battiti), in ms. */
  ultimoSegnale: (autopilotaId: string, chatId: string) => number | undefined
  /** Per i test: la raccolta degli eventi. */
  raccoltaEventiMs?: number
  /** Per i test: le chiamate su tutto il PC. */
  chiamateMax?: number
}

/** Quello che `GET /orchestratore?ws=` manda alla vista. */
export type VistaOrchestratore = {
  workspace: string
  attivo: boolean
  /** Il workspace ha già autopiloti: l'interruttore si accende con «Attiva». */
  conAutopiloti: boolean
  autopilota?: string
  modello: 'sonnet' | 'opus'
  tettoSpecialisti: number
  percento?: number
  calo?: PercentoWs['calo']
  /** Una chiamata è in volo adesso (la vista dice «sta pensando»). */
  pensa: boolean
  specialisti: { id: string; ruolo?: string; compito: string; stato: string; compitoId?: string }[]
  piano: { totale: number; uniti: number }
  /** Gli autopiloti di prima, in sola lettura. */
  precedenti: { id: string; nome: string; stato: string; iniziatoIl: string }[]
}

export type ServizioUnico = {
  attivo: (ws: string) => boolean
  unicoDi: (ws: string) => Autopilota | undefined
  /** La misura dei compiti del workspace con il piano, se l'interruttore è acceso. */
  misura: (ws: string) => MisuraCompito | undefined
  /** Lo stato delle richieste dal piano (dopo quello dagli autopiloti). */
  allinea: (ws: string, coda: Coda, adesso: string) => Modifica | undefined
  vistaCoda: (ws: string, v: VistaCoda) => VistaCoda
  vista: (ws: string) => VistaOrchestratore
  attiva: (ws: string, p?: { cwd?: string; obiettivo?: string }) => { ok: true; unico: Autopilota } | { ok: false; motivo: string }
  disattiva: (ws: string) => boolean
  imposta: (ws: string, p: { modello?: unknown; tettoSpecialisti?: unknown }) => ImpostazioniOrchestratore
  /** Un workspace nuovo (nessun autopilota, mai visto) parte con l'autopilota unico. */
  nuovoWorkspace: (ws: string) => boolean
  messaggio: (a: Autopilota, testo: string, quando?: string) => Autopilota
  fermata: (a: Autopilota, chatId: string, corpo: Record<string, unknown>) => Record<string, unknown>
  notifica: (a: Autopilota, chatId: string | undefined, corpo: Record<string, unknown>) => void
  /** Una risposta di Nicholas a una domanda dell'unico: torna `true` se l'ha presa. */
  risposta: (autopilotaId: string, domanda: string, risposta: string) => boolean
  guardia: () => void
  riprendi: (a: Autopilota) => number
  reindirizza: (id: string, chatId: string | undefined) => { id: string; chat: string } | undefined
  mcp: (p: { metodo: string; ws: string; autorizzazione: string | undefined; corpo: unknown }) => Promise<{ stato: number; corpo?: unknown }>
  orchestratore: Orchestratore
  ambiente: AmbienteOrchestratore
}

const EVENTI_RICORDATI = 30

export function creaServizioUnico(x: ContestoUnico): ServizioUnico {
  const gettoni = creaGettoniOrchestratore()
  const recenti = new Map<string, EventoOrchestratore[]>()
  const silenzioDetto = new Map<string, number>()
  const notificheDette = new Map<string, number>()
  const cancelliInCorso = new Set<string>()
  const apertureInCorso = new Map<string, Promise<unknown>>()
  const memoriaCriteri: MemoriaCriteri = new Map()
  const gitA = (): GitAsincrono | undefined => x.gitAsincrono ?? (x.git !== undefined ? comeAsincrono(x.git) : undefined)

  const imp = (ws: string): ImpostazioniOrchestratore => x.orchestratori.impostazioni(ws)
  const attivo = (ws: string): boolean => imp(ws).attivo
  const unicoDi = (ws: string): Autopilota | undefined => {
    const i = imp(ws)
    if (!i.attivo || i.autopilota === undefined) return undefined
    const a = x.archivio.leggi(i.autopilota)
    return a?.unico === true ? a : undefined
  }
  const wsDi = (a: Autopilota): string => chiaveWorkspace(a)

  const misura = (ws: string): MisuraCompito | undefined => {
    if (!attivo(ws)) return undefined
    const u = unicoDi(ws)
    return misuraUnita(misuraDalPiano(x.orchestratori.piano(ws), u?.chats ?? []), misuraDaAutopiloti(autopilotiDel(ws, x.archivio.elenca())))
  }
  const coda = (ws: string): Coda => x.code.leggi(ws)
  const allineaOra = (ws: string): Coda => x.code.cambia(ws, (c) => allineaConPiano(c, x.orchestratori.piano(ws), x.adesso()))

  const ricordaEvento = (ws: string, e: EventoOrchestratore): void => {
    recenti.set(ws, [...(recenti.get(ws) ?? []), e].slice(-EVENTI_RICORDATI))
  }
  const evento = (ws: string, e: EventoOrchestratore): void => {
    ricordaEvento(ws, e)
    orchestratore.evento(ws, e)
  }

  /** La percentuale nuova, col perché se scende; e gli annunci delle richieste appena fatte. */
  const ricalcola = (ws: string, perche: string): void => {
    const prima = coda(ws)
    const c = allineaOra(ws)
    const m = misura(ws)
    const valore = m === undefined ? undefined : avanzamentoCoda(c, m)
    x.orchestratori.cambiaImpostazioni(ws, (i) => ({ ...i, percento: conPercento(i.percento, valore, perche, x.adesso()) }))
    const appena = c.richieste.filter((r) => r.stato === 'fatta' && prima.richieste.find((y) => y.id === r.id)?.stato !== 'fatta')
    const u = unicoDi(ws)
    if (u === undefined || appena.length === 0) return
    const quando = x.adesso()
    const titolo = appena.length === 1 ? `Fatta: ${appena[0]!.titolo}` : `${appena.length} richieste fatte`
    const tutte = c.richieste.every((r) => r.stato === 'fatta')
    const dopo: Autopilota = { ...u, annuncio: { id: randomUUID(), titolo: titolo.slice(0, 120), quando } }
    x.annota(dopo, `${appena.map((r) => r.id).join(', ')} ${appena.length === 1 ? 'è fatta' : 'sono fatte'}: criteri verdi, rami uniti`)
    x.salva(dopo)
    void x.avvisa(tutte ? 'finito' : 'avviso', dopo, tutte ? 'Tutte le richieste del workspace sono fatte.' : titolo)
  }

  /** Una riga nel dialogo del workspace: nel file (intero) e nella scheda (la coda). */
  const nelDialogo = (ws: string, riga: RigaDialogo): void => {
    x.orchestratori.aggiungiDialogo(ws, riga)
    if (riga.da === 'evento') return
    const u = unicoDi(ws)
    if (u === undefined) return
    x.salva({ ...u, dialogo: [...u.dialogo, { quando: riga.quando, da: riga.da, testo: riga.testo }].slice(-DIALOGO_RICORDATO) })
  }

  const contestoChiamata = (ws: string): { cwd: string; riassunto: string; indice: string } | undefined => {
    const u = unicoDi(ws)
    if (u === undefined) return undefined
    let indice = ''
    try { indice = x.indiceQuaderno?.(u.cwd) ?? '' } catch { indice = '' }
    return { cwd: u.cwd, riassunto: riassunto(ws), indice }
  }

  const riassunto = (ws: string): string => {
    const u = unicoDi(ws)
    const m = misura(ws) ?? misuraDaAutopiloti(autopilotiDel(ws, x.archivio.elenca()))
    const i = imp(ws)
    return riassuntoOrchestratore({
      ws, coda: coda(ws), piano: x.orchestratori.piano(ws), unico: u, misura: m,
      ...(i.percento !== undefined ? { percento: i.percento } : {}),
      eventi: recenti.get(ws) ?? [],
      tetti: { ws: i.tettoSpecialisti, pc: Math.min(x.posti(), SPECIALISTI_PC_MAX), alLavoroPc: x.chatAlLavoroSulPc() },
      domandeAperte: u === undefined ? 0 : x.domande.aperte(u.id).length,
      adesso: Date.parse(x.adesso())
    })
  }

  const orchestratore = creaOrchestratore({
    esegui: x.esecutoreClaude,
    impostazioni: imp,
    cambiaImpostazioni: (ws, f) => { x.orchestratori.cambiaImpostazioni(ws, f) },
    contesto: contestoChiamata,
    ultime: (ws, n) => x.orchestratori.ultimeDialogo(ws, n).filter((r) => r.da !== 'evento'),
    mcpConfig: (ws) => configMcpOrchestratore(x.porta, ws, gettoni.di(ws)),
    risposta: (ws, testo) => {
      console.info(`[orchestratore] ${ws} — risponde: ${testo.replace(/\s+/gu, ' ').slice(0, 200)}`)
      nelDialogo(ws, { quando: x.adesso(), da: 'lui', testo })
    },
    errore: (ws, motivo) => {
      console.error(`[orchestratore] ${ws} — chiamata non riuscita: ${motivo}`)
      const u = unicoDi(ws)
      if (u === undefined) return
      x.orchestratori.aggiungiDialogo(ws, { quando: x.adesso(), da: 'evento', testo: `chiamata non riuscita: ${motivo}` })
      const dopo = { ...u }
      x.annota(dopo, `l’autopilota non ha potuto rispondere (${motivo.slice(0, 200)}): i tuoi messaggi restano in attesa e partono con la prossima chiamata`)
      x.salva(dopo)
    },
    ...(x.raccoltaEventiMs !== undefined ? { raccoltaMs: x.raccoltaEventiMs } : {}),
    ...(x.chiamateMax !== undefined ? { globaliMax: x.chiamateMax } : {})
  })

  // ---------------------------------------------------------------- gli specialisti

  const primoMessaggio = (a: Autopilota, chat: ChatGovernata, compito: CompitoPiano, istruzioni: string): string => {
    const r = coda(wsDi(a)).richieste.find((y) => y.id === compito.richiesta)
    const indice = (() => { try { return x.indiceQuaderno?.(a.cwd) ?? '' } catch { return '' } })()
    return [
      ...preamboloRuolo(chat.ruolo),
      `Il tuo compito (${compito.id}${r !== undefined ? `, per la richiesta ${r.id} «${r.titolo}»` : ''}): ${compito.titolo}`,
      `Si dice fatto quando: ${compito.criterio}`,
      '',
      'Le istruzioni dell’autopilota del workspace:',
      istruzioni,
      ...(chat.cartella !== undefined && chat.ramo !== undefined
        ? ['', `Lavori nella tua copia del progetto (${chat.cartella}), sul ramo ${chat.ramo}: altre chat lavorano in parallelo, ognuna nella sua copia. Fai commit quando un pezzo è compiuto. Non cambiare ramo, non lavorare nella cartella principale e non fare push: quando dici di aver finito l’autopilota prova il tuo ramo nel principale, lo unisce e misura il criterio.`]
        : []),
      '',
      ...REGOLA_RAPPORTO,
      '',
      ...REGOLA_SEGNALE,
      '',
      ...REGOLA_LEZIONI,
      '',
      'Se ti serve una decisione che non puoi prendere tu, chiudi il turno con SEGNALE: bloccata e il motivo: l’autopilota ti risponde, o lo chiede a Nicholas.',
      ...(indice !== '' ? ['', indice] : [])
    ].join('\n')
  }

  const apriOra = async (ws: string, p: { compito: CompitoPiano; ruolo: Ruolo; istruzioni: string }): Promise<EsitoAmbiente> => {
    const a0 = unicoDi(ws)
    if (a0 === undefined) return { ok: false, motivo: 'l’autopilota unico non c’è' }
    const id = idChatNuova(a0)
    let dove: { cartella?: string; ramo?: string } = {}
    const g = gitA()
    if (g !== undefined && a0.ramoBase !== undefined && p.ruolo !== 'revisione' && p.ruolo !== 'rilascio') {
      const wt = await creaWorktreeAsincrono(g, { cwd: a0.cwd, autopilota: a0.id, chat: id, base: a0.ramoBase })
      // Mai uno specialista che scrive codice nella cartella principale, dove si uniscono i rami.
      if (!wt.ok) return { ok: false, motivo: `la copia del progetto per ${id} non si è potuta creare: ${wt.motivo}` }
      dove = { cartella: wt.cartella, ramo: wt.ramo }
    }
    const a = unicoDi(ws) ?? a0
    if (a.chats.some((c) => c.id === id)) return { ok: false, motivo: `l’id ${id} è già preso: riprova` }
    const chat: ChatGovernata = { id, compito: p.compito.titolo, stato: 'lavoro', cicli: 0, sessionId: randomUUID(), ruolo: p.ruolo, compitoId: p.compito.id, ...dove }
    x.orchestratori.scriviPiano(ws, conCompito(x.orchestratori.piano(ws), p.compito.id, (c) => ({ ...c, stato: 'in-corso', chat: id })))
    const dopo: Autopilota = { ...a, chats: [...a.chats, chat] }
    x.annota(dopo, `apro ${id} (${RUOLI[p.ruolo].nome})${dove.ramo !== undefined ? ` sul ramo ${dove.ramo}` : ''}: ${p.compito.titolo.slice(0, 120)}`, { chat: id, esito: 'aperta' })
    x.salva(dopo)
    ricalcola(ws, `${p.compito.id} parte`)
    const e = await x.avviaLavoro(dopo, primoMessaggio(dopo, chat, p.compito, p.istruzioni), chat)
    if (e.rifiutata !== undefined) return { ok: false, motivo: `la chat ${id} non è partita: ${e.rifiutata}` }
    return { ok: true, testo: `Aperta ${id} (${RUOLI[p.ruolo].nome})${dove.ramo !== undefined ? ` sul ramo ${dove.ramo}` : ', nella cartella principale'}, sul compito ${p.compito.id}. Ti arriva un evento quando finisce o si blocca.` }
  }

  /** Il cancello: prova, unione, criterio. Gira in sottofondo; l'esito è un evento. */
  const cancello = async (ws: string, chatId: string): Promise<void> => {
    const testo = await cancelloOra(ws, chatId).catch((err: unknown) => `${chatId}: unione non riuscita per un errore (${err instanceof Error ? err.message : String(err)})`)
    evento(ws, { tipo: 'unione', quando: x.adesso(), chat: chatId, testo })
  }
  const cancelloOra = async (ws: string, chatId: string): Promise<string> => {
    const a = unicoDi(ws)
    const c = a?.chats.find((y) => y.id === chatId)
    if (a === undefined || c === undefined || c.ramo === undefined) return `${chatId}: non c’è più niente da unire`
    const compito = c.compitoId !== undefined ? x.orchestratori.piano(ws).compiti.find((k) => k.id === c.compitoId) : undefined
    const g = gitA()
    if (g === undefined || a.ramoBase === undefined) return `${chatId}: senza git (o senza ramo principale) non si può unire`
    if (c.cartella !== undefined) await salvaLavoroAsincrono(g, c.cartella, `specialista ${c.id}: ${(compito?.titolo ?? c.compito).slice(0, 60)}`)
    const chiuso = await ramoGiaChiusoAsincrono(g, { cwd: a.cwd, ramo: c.ramo, base: a.ramoBase })
    let motivo: string | undefined
    if (chiuso === 'mancante') motivo = `il ramo ${c.ramo} non c’è più`
    else if (chiuso === undefined) {
      const r = await x.provaNelPrincipale(unicoDi(ws) ?? a, c.ramo)
      if (!r.unito) motivo = r.motivo
    }
    const il = x.adesso()
    if (motivo !== undefined) {
      if (compito !== undefined) x.orchestratori.scriviPiano(ws, conCompito(x.orchestratori.piano(ws), compito.id, (k) => ({ ...k, esito: `unione non fatta: ${motivo}` })))
      return `${chatId}: unione NON fatta — ${motivo}. Il ramo resta com’è: scrivi allo specialista cosa sistemare (specialista_scrivi).`
    }
    // I fatti vincono: il criterio del compito si misura sul principale, dopo l'unione.
    const comando = compito !== undefined ? comandoDelCriterio(compito.criterio) : undefined
    let verde = true
    let dettaglio = compito === undefined ? 'nessun compito del piano: vale l’unione senza regressioni' : 'il criterio non ha un comando: vale l’unione senza regressioni'
    if (comando !== undefined) {
      const esame = esaminaComando(comando)
      if (!esame.ok) {
        verde = false
        dettaglio = `il comando del criterio non è accettato (${esame.problemi.map((q) => q.messaggio).join('; ').slice(0, 300)}): riscrivi il criterio con piano_scrivi`
      } else {
        const m = await misuraCriteri([{ descrizione: compito!.criterio, comando, soddisfatto: false }], a.cwd, x.esegui, { memoria: memoriaCriteri, adesso: Date.now, tutti: true })
        const falliti = fallitiDavvero(m.esiti)
        const ignoti = nonMisurati(m.esiti)
        verde = m.esiti.length > 0 && falliti.length === 0 && ignoti.length === 0
        const uscita = m.esiti[0]?.uscita.trim().split(/\r?\n/u).slice(-6).join(' | ').slice(0, 400) ?? ''
        dettaglio = verde ? `\`${comando}\` passa` : ignoti.length > 0 ? `\`${comando}\` non si è potuto misurare: ${uscita}` : `\`${comando}\` non passa: ${uscita}`
      }
    }
    if (compito !== undefined) {
      x.orchestratori.scriviPiano(ws, conCompito(x.orchestratori.piano(ws), compito.id, (k) => ({ ...k, stato: 'unito', criterioVerde: verde, unitoIl: il, esito: dettaglio })))
    }
    const fresco = unicoDi(ws)
    if (fresco !== undefined) {
      const dopo: Autopilota = { ...fresco, chats: fresco.chats.map((y) => (y.id === chatId ? { ...y, approvata: true, conclusa: { il, come: 'unito' as const } } : y)) }
      x.annota(dopo, `${chatId}: ramo ${c.ramo} unito nel principale; criterio ${verde ? 'verde' : 'rosso'} (${dettaglio.slice(0, 200)})`, { chat: chatId, esito: 'unito' })
      x.salva(dopo)
    }
    ricalcola(ws, `${compito?.id ?? chatId} unito${verde ? '' : ' con il criterio rosso'}`)
    return `${chatId}: ramo unito nel principale. Criterio ${verde ? 'VERDE' : 'ROSSO'}: ${dettaglio}.${verde ? ' Puoi chiudere la chat con specialista_chiudi «unita».' : ' Il compito resta in revisione: scrivi allo specialista cosa correggere.'}`
  }

  // ---------------------------------------------------------------- l'ambiente degli strumenti

  const ambiente: AmbienteOrchestratore = {
    adesso: x.adesso,
    coda,
    cambiaCoda: (ws, f) => x.code.cambia(ws, f),
    piano: (ws) => x.orchestratori.piano(ws),
    scriviPiano: (ws, p: Piano) => { x.orchestratori.scriviPiano(ws, p) },
    unico: unicoDi,
    tettoWs: (ws) => imp(ws).tettoSpecialisti,
    posti: x.posti,
    chatAlLavoroSulPc: x.chatAlLavoroSulPc,
    apriSpecialista: (ws, p) => {
      // Una apertura alla volta per workspace: due worktree nello stesso istante si pestano.
      const prima = apertureInCorso.get(ws) ?? Promise.resolve()
      const questa = prima.catch(() => undefined).then(() => apriOra(ws, p))
      apertureInCorso.set(ws, questa)
      return questa
    },
    scriviSpecialista(ws, chat, testo) {
      const a = unicoDi(ws)
      if (a === undefined) return { ok: false, motivo: 'l’autopilota unico non c’è' }
      const dopo = conMessaggioPerLaChat(a, testo, x.adesso(), [chat], `o-${randomUUID()}`)
      x.annota(dopo, `messaggio per ${chat}, parte quando è ferma: ${testo.replace(/\s+/gu, ' ').slice(0, 160)}`)
      x.salva(dopo)
      // Se è già ferma parte adesso; se lavora, con la fine del suo turno.
      x.consegnaAlleFerme(a.id)
      return { ok: true, testo: `Messaggio per ${chat} in coda: arriva appena la chat è ferma, senza interromperla.` }
    },
    chiudiSpecialista(ws, chatId, esito, lezioni) {
      const a = unicoDi(ws)
      const c = a?.chats.find((y) => y.id === chatId)
      if (a === undefined || c === undefined) return { ok: false, motivo: `la chat ${chatId} non c’è` }
      const il = x.adesso()
      let scritte = { nuove: 0, confermate: 0 }
      if (lezioni.length > 0 && x.lezioni !== undefined) {
        try { scritte = x.lezioni(a.cwd, lezioni.map((t) => ({ tag: c.ruolo ?? 'specialista', testo: t })), il) } catch (err) { console.error(`[orchestratore] lezioni di ${chatId} non scritte:`, err) }
      }
      const chiusa: ChatGovernata = {
        ...c,
        stato: 'finita',
        ...(esito === 'unita'
          ? { approvata: true, conclusa: c.conclusa ?? { il, come: 'unito' as const } }
          : { lasciataFuori: { il, perche: 'chiusa dall’autopilota senza unire il ramo' } }),
        fine: { esito, il, passo: 'chiudi' }
      }
      const dopo: Autopilota = {
        ...a,
        chats: a.chats.map((y) => (y.id === chatId ? chiusa : y)),
        daConsegnare: a.daConsegnare.flatMap((m) => { const chats = m.chats.filter((k) => k !== chatId); return chats.length > 0 ? [{ ...m, chats }] : [] })
      }
      x.annota(dopo, `chiudo ${chatId} (${esito}): si elimina da sola${lezioni.length > 0 ? `; ${scritte.nuove} lezioni nuove nel quaderno, ${scritte.confermate} confermate` : ''}`, { chat: chatId, esito: esito === 'unita' ? 'unito' : 'nel-recupero' })
      x.salva(dopo)
      // Abbandonata: il compito torna da fare, per un altro specialista.
      if (esito === 'abbandonata' && c.compitoId !== undefined) {
        x.orchestratori.scriviPiano(ws, conCompito(x.orchestratori.piano(ws), c.compitoId, (k) => {
          if (k.stato === 'unito') return k
          const { chat: _c, ...resto } = k
          return { ...resto, stato: 'da-fare', esito: `${chatId} chiusa senza unire` }
        }))
        ricalcola(ws, `${c.compitoId} torna da fare`)
      }
      x.avanzaFinite()
      return { ok: true, testo: `${chatId} chiusa (${esito}). ${lezioni.length > 0 ? `Lezioni: ${scritte.nuove} nuove, ${scritte.confermate} già note. ` : ''}La chat si elimina da sola (riquadro, copia, ramo, trascrizione).` }
    },
    unisci(ws, chatId) {
      const k = `${ws}|${chatId}`
      if (cancelliInCorso.has(k)) return { ok: false, motivo: `l’unione di ${chatId} è già in corso: l’esito arriva come evento` }
      cancelliInCorso.add(k)
      void cancello(ws, chatId).finally(() => { cancelliInCorso.delete(k) })
      return { ok: true, testo: `Unione di ${chatId} avviata: prova nel principale, unione, criterio. L’esito ti arriva come evento.` }
    },
    chiedi(ws, domanda, scelte) {
      const a = unicoDi(ws)
      if (a === undefined) return { ok: false, motivo: 'l’autopilota unico non c’è' }
      const aperte = x.domande.aperte(a.id).map((d) => ({ ...d, testo: d.parti?.domanda ?? d.testo }))
      const uguale = aperteSulloStesso(aperte, a.id, domanda)[0]
      if (uguale !== undefined) return { ok: false, motivo: `una domanda sulla stessa cosa è già aperta: «${uguale.testo.slice(0, 160)}». Aspetta la risposta` }
      const gia = x.memoria?.rispostaPer(a.id, domanda)
      const giaData = gia?.esatta ?? gia?.simile
      if (giaData !== undefined) return { ok: true, testo: `Nicholas ha già risposto a questa domanda (${giaData.quando.slice(0, 10)}): «${giaData.risposta}». Non la rifaccio.` }
      const pronta = domandaControllataSubito(a.nome, {
        staFacendo: 'coordino gli specialisti del workspace',
        domanda,
        perche: 'è una decisione tua',
        scelte: scelte.map((s, i) => ({ scelta: s, conseguenza: '', ...(i === 0 ? { consigliata: true } : {}) })),
        seNonRispondi: 'aspetto la tua risposta e intanto porto avanti il resto'
      })
      const d = x.domande.apri({ autopilotaId: a.id, testo: pronta.testo, scadenzaMs: x.scadenzaDomandaMs, ...domandaPerRegistro(pronta) })
      x.ricordaContesto(d.id, { autopilotaId: a.id, testo: pronta.testo, grezza: domanda })
      x.orchestratori.cambiaImpostazioni(ws, (i) => ({ ...i, domande: [...(i.domande ?? []), x.adesso()].slice(-20) }))
      void x.avvisa('domanda', a, domanda)
      return { ok: true, testo: `Domanda aperta per Nicholas (${d.id}): la risposta ti arriva come suo messaggio. Intanto vai avanti con il resto.` }
    },
    domandeUltimaOra(ws) {
      const ora = Date.parse(x.adesso())
      return (imp(ws).domande ?? []).filter((q) => ora - Date.parse(q) < 3_600_000).length
    },
    annota(ws, testo, tag) {
      const a = unicoDi(ws)
      if (a === undefined || x.lezioni === undefined) return { ok: false, motivo: 'il quaderno non è disponibile' }
      const r = x.lezioni(a.cwd, [{ tag, testo }], x.adesso())
      return { ok: true, testo: r.nuove > 0 ? 'Annotata nel quaderno.' : 'C’era già nel quaderno: confermata.' }
    },
    ricalcola,
    riassunto
  }

  // ---------------------------------------------------------------- il servizio

  const attiva = (ws: string, p: { cwd?: string; obiettivo?: string } = {}): { ok: true; unico: Autopilota } | { ok: false; motivo: string } => {
    const gia = unicoDi(ws)
    const loro = autopilotiDel(ws, x.archivio.elenca())
    const quando = x.adesso()
    // P1 l'ha già fatto per gli autopiloti di allora; quelli nati dopo entrano adesso.
    x.code.cambia(ws, (c) => migraAutopiloti(c, loro.filter((a) => a.unico !== true), quando))
    x.code.cambia(ws, (c) => obiettiviInCoda(c, loro))
    const cwd = p.cwd ?? gia?.cwd
    if (gia === undefined && cwd === undefined && loro.length === 0) return { ok: false, motivo: 'serve la cartella del progetto' }
    const passo = passaAllUnico({ ws, autopiloti: loro, id: `ap-${randomUUID()}`, adesso: quando, ...(gia !== undefined ? { unico: gia } : {}) })
    let unico = cwd !== undefined && gia === undefined && loro.length === 0 ? nuovoUnico({ id: passo.unico.id, ws, cwd, adesso: quando }) : passo.unico
    if (unico.ramoBase === undefined && x.git !== undefined) {
      const ramo = ramoCorrente(x.git, unico.cwd)
      if (ramo !== undefined) unico = { ...unico, ramoBase: ramo }
    }
    for (const prima of passo.precedenti) {
      // Le domande della preparazione o del supervisore di prima: le rifà l'unico, se servono.
      const sue = x.domande.aperte(prima.id)
      for (const d of sue) x.domande.superata(d.id, 'il workspace è passato all’autopilota unico: se serve ancora, te la rifà lui')
      if (sue.length > 0) {
        const testo = sue.map((d) => `«${(d.parti?.domanda ?? d.testo).replace(/\s+/gu, ' ').slice(0, 300)}»`).join('; ')
        ricordaEvento(ws, { tipo: 'adozione', quando, testo: `domande aperte di «${prima.nome}» chiuse nel passaggio: ${testo}. Rifalle con chiedi_utente solo se servono ancora.` })
        orchestratore.evento(ws, { tipo: 'adozione', quando, testo: `domande aperte di «${prima.nome}» chiuse nel passaggio: ${testo}. Rifalle con chiedi_utente solo se servono ancora.` })
      }
      x.archivio.scrivi(prima)
    }
    if (passo.adottate.length > 0) {
      evento(ws, { tipo: 'adozione', quando, testo: `adottate come specialisti: ${passo.adottate.map((y) => `${y.chat} di ${y.da} → ${y.nuova}`).join(', ')}. Lavorano su compiti di prima (testo, non id del piano): uniscile con unisci quando finiscono.` })
    }
    x.archivio.scrivi(unico)
    x.salva(unico)
    x.orchestratori.cambiaImpostazioni(ws, (i) => ({ ...i, attivo: true, autopilota: unico.id, attivatoIl: i.attivatoIl ?? quando }))
    ricalcola(ws, 'autopilota unico acceso')
    console.info(`[orchestratore] ${ws} — autopilota unico acceso (${unico.id}): ${passo.adottate.length} chat adottate, ${passo.precedenti.length} autopiloti fra i precedenti`)
    const fresco = x.archivio.leggi(unico.id) ?? unico
    if (p.obiettivo !== undefined && p.obiettivo.trim() !== '') return { ok: true, unico: messaggio(fresco, p.obiettivo.trim(), quando) }
    if (loro.length > 0) orchestratore.messaggio(ws, { quando, testo: 'L’interruttore «Autopilota unico» è stato acceso adesso su questo workspace. Guarda la coda e lo stato, e dimmi in poche righe da dove riparti.' })
    return { ok: true, unico: fresco }
  }

  const messaggio = (a: Autopilota, testo: string, quando: string = x.adesso()): Autopilota => {
    const ws = wsDi(a)
    // Ogni richiesta in coda (le parole intere), con le candidate all'unione in vista: le unisce l'orchestratore.
    let riga = ''
    x.code.cambia(ws, (c) => {
      const candidati = candidatiUnione(c, testo)
      const aperte = candidati.filter((k) => !k.fatta).map((k) => k.id)
      const segue = daSeguire(candidati)
      const m = aggiungi(c, { testo, quando, ...(segue !== undefined && aperte.length === 0 ? { segue } : {}), candidati: aperte })
      riga = `in coda come ${m.richiesta.id}${aperte.length > 0 ? ` (forse la stessa di ${aperte.join(', ')})` : ''}`
      return m
    })
    const conTua: Autopilota = { ...a, dialogo: [...a.dialogo, { quando, da: 'tu' as const, testo, ...(riga !== '' ? { esito: riga } : {}) }].slice(-DIALOGO_RICORDATO) }
    x.salva(conTua)
    x.orchestratori.aggiungiDialogo(ws, { quando, da: 'tu', testo })
    ricalcola(ws, `richiesta nuova: «${testo.replace(/\s+/gu, ' ').slice(0, 60)}»`)
    orchestratore.messaggio(ws, { quando, testo })
    return x.archivio.leggi(a.id) ?? conTua
  }

  const fermata = (a: Autopilota, chatId: string, corpo: Record<string, unknown>): Record<string, unknown> => {
    const f = fermataSpecialista(a, chatId, corpo, x.adesso())
    if (f.autopilota !== a) x.salva(f.autopilota)
    if (f.evento !== undefined) {
      const ws = wsDi(a)
      evento(ws, f.evento)
      ricalcola(ws, `${chatId} ha chiuso un turno`)
    }
    return f.risposta
  }

  const notifica = (a: Autopilota, chatId: string | undefined, corpo: Record<string, unknown>): void => {
    const tipo = typeof corpo.notification_type === 'string' ? corpo.notification_type : ''
    // «idle_prompt» arriva dopo lo Stop, che ha già detto tutto.
    if (chatId === undefined || tipo === 'idle_prompt') return
    const c = a.chats.find((y) => y.id === chatId)
    if (c === undefined || c.stato === 'finita') return
    const messaggioNotifica = typeof corpo.message === 'string' ? corpo.message : ''
    const detto = c.sessionId !== undefined ? x.ultimoDetto?.(c.cartella ?? a.cwd, c.sessionId) : undefined
    const testo = [messaggioNotifica, detto ?? ''].filter((t) => t.trim() !== '').join(' — ').slice(0, 1500)
    if (testo === '') return
    const k = `${a.id}|${chatId}|${testo.slice(0, 200)}`
    const ora = Date.parse(x.adesso())
    if (ora - (notificheDette.get(k) ?? -Infinity) < 10 * 60_000) return
    notificheDette.set(k, ora)
    evento(wsDi(a), { tipo: 'domanda', quando: x.adesso(), chat: chatId, testo })
  }

  const risposta = (autopilotaId: string, domanda: string, testo: string): boolean => {
    const a = x.archivio.leggi(autopilotaId)
    if (a?.unico !== true) return false
    const ws = wsDi(a)
    const quando = x.adesso()
    x.orchestratori.aggiungiDialogo(ws, { quando, da: 'tu', testo: `Hai risposto a «${domanda.slice(0, 200)}»: ${testo}` })
    orchestratore.messaggio(ws, { quando, testo: `Risposta alla tua domanda «${domanda.replace(/\s+/gu, ' ').slice(0, 300)}»: ${testo}` })
    return true
  }

  /** Ogni minuto: gli specialisti zitti da 20 minuti diventano un evento (una volta per silenzio). */
  const guardia = (): void => {
    const ora = Date.parse(x.adesso())
    for (const a of x.archivio.elenca()) {
      if (a.unico !== true || a.archiviato === true || !attivo(wsDi(a))) continue
      for (const c of specialistiVivi(a)) {
        if (c.stato !== 'lavoro') continue
        const ultimo = x.ultimoSegnale(a.id, c.id) ?? (c.dal !== undefined ? Date.parse(c.dal) : undefined)
        if (ultimo === undefined || Number.isNaN(ultimo) || ora - ultimo < SILENZIO_SPECIALISTA_MS) continue
        const k = `${a.id}|${c.id}`
        if (silenzioDetto.get(k) === ultimo) continue
        silenzioDetto.set(k, ultimo)
        evento(wsDi(a), { tipo: 'silenzio', quando: x.adesso(), chat: c.id, testo: `nessun segno da ${Math.round((ora - ultimo) / 60_000)} minuti${c.rapporto !== undefined ? `; l’ultimo rapporto: ${c.rapporto.tipo} — ${c.rapporto.testo}` : ''}` })
      }
    }
  }

  /** Dopo un riavvio del programma: le specialiste vive riprendono da dove erano. */
  const riprendi = (a: Autopilota): number => {
    let n = 0
    for (const c of specialistiVivi(a)) {
      if (c.stato !== 'lavoro' || c.sessionId === undefined) continue
      void x.avviaLavoro(a, undefined, c).catch((err: unknown) => { console.error(`[orchestratore] ${a.id}::${c.id} non ripresa:`, err) })
      n += 1
    }
    return n
  }

  return {
    attivo,
    unicoDi,
    misura,
    allinea: (ws, c, adesso) => (attivo(ws) ? allineaConPiano(c, x.orchestratori.piano(ws), adesso) : undefined),
    vistaCoda(ws, v) {
      if (!attivo(ws)) return v
      const i = imp(ws)
      return { ...v, unico: true, ...(i.percento?.calo !== undefined ? { calo: i.percento.calo } : {}) }
    },
    vista(ws) {
      const i = imp(ws)
      const u = unicoDi(ws)
      const loro = autopilotiDel(ws, x.archivio.elenca())
      const piano = x.orchestratori.piano(ws)
      const m = misura(ws)
      const valore = m !== undefined ? avanzamentoCoda(coda(ws), m) : undefined
      return {
        workspace: ws,
        attivo: i.attivo,
        conAutopiloti: loro.some((a) => a.unico !== true),
        ...(u !== undefined ? { autopilota: u.id } : {}),
        modello: i.modello,
        tettoSpecialisti: i.tettoSpecialisti,
        ...(valore !== undefined ? { percento: valore } : {}),
        ...(i.percento?.calo !== undefined ? { calo: i.percento.calo } : {}),
        pensa: orchestratore.inVolo(ws) || orchestratore.inAttesa(ws).messaggi > 0,
        specialisti: specialistiVivi(u).map((c) => ({ id: c.id, ...(c.ruolo !== undefined ? { ruolo: RUOLI[c.ruolo].nome } : {}), compito: c.compito, stato: c.stato, ...(c.compitoId !== undefined ? { compitoId: c.compitoId } : {}) })),
        piano: { totale: piano.compiti.length, uniti: piano.compiti.filter((c) => c.stato === 'unito' && c.criterioVerde === true).length },
        precedenti: loro.filter((a) => a.unico !== true && (a.passatoA !== undefined || a.archiviato === true || a.stato === 'finito')).map((a) => ({ id: a.id, nome: a.nome, stato: a.stato, iniziatoIl: a.iniziatoIl }))
      }
    },
    attiva,
    disattiva(ws) {
      if (!attivo(ws)) return false
      x.orchestratori.cambiaImpostazioni(ws, (i) => ({ ...i, attivo: false }))
      orchestratore.dimentica(ws)
      console.info(`[orchestratore] ${ws} — autopilota unico spento: le sue chat restano dove sono`)
      return true
    },
    imposta(ws, p) {
      return x.orchestratori.cambiaImpostazioni(ws, (i) => ({
        ...i,
        ...(p.modello === 'opus' || p.modello === 'sonnet' ? { modello: p.modello } : {}),
        ...(typeof p.tettoSpecialisti === 'number' && Number.isInteger(p.tettoSpecialisti) ? { tettoSpecialisti: Math.min(TETTO_SPECIALISTI_MAX, Math.max(1, p.tettoSpecialisti)) } : {})
      }))
    },
    nuovoWorkspace: (ws) => !x.orchestratori.conosciuto(ws) && autopilotiDel(ws, x.archivio.elenca()).length === 0,
    messaggio,
    fermata,
    notifica,
    risposta,
    guardia,
    riprendi,
    reindirizza(id, chatId) {
      const prima = x.archivio.leggi(id)
      if (prima?.passatoA === undefined) return undefined
      return hookAdottato(prima, x.archivio.leggi(prima.passatoA), chatId)
    },
    mcp: (p) => rispondiMcpOrchestratore(ambiente, gettoni, x.versione, p),
    orchestratore,
    ambiente
  }
}
