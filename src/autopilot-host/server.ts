import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { existsSync, statSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { nuovoAutopilota, type Autopilota, type ChatGovernata, type Criterio } from '@shared/autopilota'
import type { Archivio } from './archivio'
import {
  decidi, decidiConGiudizio, nonMisurati, ripetizioniFinali, traccia, type EsitoVerifica
} from './decisione'
import { chiediDecisione } from './decisione-supervisore'
import { applicaRete } from './rete-sicurezza'
import { corpoScheda, tagScheda, titoloScheda } from './scheda-lavoro'
import { STRATEGIE } from './strategie'
import { eseguiCriteri, type Esecutore } from './verifiche'
import {
  chiediGiudizio, componiPromptScomposizione, leggiCompiti, riparaComando, type Interrogazione
} from './supervisore'
import { pianificaFlotta } from './flotta'
import {
  componiPromptIntervista, giaChiesta, leggiEsitoIntervista, SCAMBI_MAX, TEMPO_PREPARAZIONE_MS
} from './intervista'
import { intervisteDaRiprendere } from './ripresa'
import type { RegistroDomande } from './domande'
import type { TipoAvviso } from './telegram'

export type Dipendenze = {
  archivio: Archivio
  esegui: Esecutore
  interroga: Interrogazione
  /**
   * Avvia la chat governata. Con `messaggio`, riprende una sessione ferma
   * consegnandole quel testo — è la strada della risposta tardiva.
   */
  avviaLavoro: (a: Autopilota, messaggio?: string, chat?: ChatGovernata) => Promise<void>
  fermaLavoro: (id: string, chatId?: string) => void
  /**
   * Le istruzioni che aspettano di essere portate dentro una chat.
   *
   * Il servizio non puo' chiamare il Gestore - fra i due il confine va in una
   * direzione sola - quindi le mette qui e il Gestore le ritira quando passa.
   * Assente quando l'autopilota lavora ancora per conto suo.
   */
  consegne?: { preleva: () => unknown[]; inAttesa: () => number }
  domande: RegistroDomande
  /** Quanto la chat resta ferma ad aspettare una risposta prima di lasciar perdere. */
  scadenzaDomandaMs: number
  /**
   * Quanto si attende una risposta durante l'intervista.
   *
   * Molto più a lungo della domanda di lavoro: lì c'è una chat ferma che
   * consuma, qui non c'è ancora niente in moto e l'utente che ha appena
   * delegato può essersi alzato dalla scrivania.
   */
  scadenzaInterviataMs: number
  /** Avvisa l'utente dove non è davanti allo schermo. Non deve mai sollevare. */
  avvisa: (tipo: TipoAvviso, a: Autopilota, domanda?: string) => Promise<void>
  /** Il momento attuale in ISO. Iniettato perché i test non aspettino sei ore. */
  adesso: () => string
  /**
   * La versione dell'applicazione che ha avviato questo servizio.
   *
   * Il servizio sopravvive alla chiusura del Gestore: senza questo dato, dopo
   * un aggiornamento resterebbe in memoria la versione vecchia — che risponde,
   * quindi nessuno la rimpiazza — e le correzioni installate non entrerebbero
   * mai in funzione.
   */
  versione?: string
  /**
   * Scrive una scheda nel quaderno della cartella di lavoro. Facoltativa: senza,
   * l'autopilota lavora identico e non lascia il suo resoconto.
   */
  quaderno?: (
    cwd: string,
    scheda: { titolo: string; corpo: string; tag?: string[]; sessione?: string }
  ) => void
}

/** La stessa forma che l'archivio accetta: qui si ferma prima di arrivarci. */
const ID_VALIDO = /^[A-Za-z0-9_-]{1,64}$/
/** Quanto del testo di una domanda si conserva nello stato. */
const MOTIVO_MAX = 500

function rispondi(res: ServerResponse, stato: number, corpo: unknown): void {
  res.writeHead(stato, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(corpo))
}

function leggiCorpo(req: IncomingMessage): Promise<unknown> {
  return new Promise((risolvi) => {
    let dati = ''
    req.on('data', (c) => { dati += c })
    req.on('end', () => {
      if (dati === '') {
        risolvi(undefined)
        return
      }
      try {
        risolvi(JSON.parse(dati))
      } catch {
        // Un corpo illeggibile non è un motivo per far cadere il servizio: chi
        // ha chiamato riceve la risposta prudente prevista per il suo caso.
        console.warn('[autopilota] corpo della richiesta non leggibile, ignorato')
        risolvi(undefined)
      }
    })
  })
}

/** Il testo con cui la risposta dell'utente torna alla chat, con la sua domanda accanto. */
function componiRisposta(domanda: string, risposta: string): string {
  return `Hai chiesto: «${domanda}»\n\nL'utente risponde: ${risposta}\n\nProsegui con questa indicazione.`
}

function criteriDa(raw: unknown): Criterio[] {
  if (!Array.isArray(raw)) return []
  const criteri: Criterio[] = []
  for (const c of raw) {
    if (typeof c !== 'object' || c === null) continue
    const o = c as Record<string, unknown>
    if (typeof o.descrizione !== 'string' || o.descrizione.trim() === '') continue
    criteri.push({
      descrizione: o.descrizione,
      ...(typeof o.comando === 'string' && o.comando.trim() !== '' ? { comando: o.comando } : {}),
      soddisfatto: false
    })
  }
  return criteri
}

/**
 * Il server, più l'unica cosa che si può chiedergli dall'esterno oltre alle
 * rotte: far ripartire le preparazioni che uno spegnimento ha interrotto.
 */
export type ServerAutopiloti = Server & { riprendiInterviste: () => void }

export function creaServer(deps: Dipendenze): ServerAutopiloti {
  const salva = (a: Autopilota): void => deps.archivio.scrivi({ ...a, ultimoEvento: deps.adesso() })

  /** Di chi è ogni domanda, e cosa chiedeva: serve alla risposta tardiva. */
  const contesto = new Map<string, { autopilotaId: string; testo: string }>()

  /**
   * Una risposta arrivata dopo che la chat si era già fermata.
   *
   * Qui non basta rispondere all'hook — non c'è più nessun hook in attesa — e
   * la chat va ripresa con `--resume`, pagando l'avvio di `claude.exe`. È il
   * prezzo del ritardo, e il motivo per cui l'attesa dell'hook esiste.
   */
  deps.domande.suRispostaTardiva((idDomanda, risposta) => {
    const dati = contesto.get(idDomanda)
    contesto.delete(idDomanda)
    if (dati === undefined) return
    const a = deps.archivio.leggi(dati.autopilotaId)
    if (a === undefined) return

    // Una risposta arrivata tardi durante la preparazione riprende la
    // preparazione, non il lavoro: qui non c'è nessuna chat da riavviare e non
    // ci sono ancora criteri. Senza questo ramo la risposta veniva accettata e
    // poi ignorata, e l'autopilota restava fermo per sempre in attesa di una
    // domanda a cui l'utente aveva già risposto.
    if (a.stato === 'intervista') {
      const ripreso: Autopilota = {
        ...a,
        motivoSospensione: undefined,
        intervista: [...a.intervista, { domanda: dati.testo, risposta }]
      }
      salva(ripreso)
      void conduciIntervista(ripreso).catch((err: unknown) => {
        console.error(`[autopilota] ripresa dell intervista di ${dati.autopilotaId} fallita:`, err)
      })
      return
    }

    if (a.stato !== 'attesa') return
    salva({
      ...a,
      stato: 'lavoro',
      motivoSospensione: undefined,
      decisioni: [...a.decisioni, { quando: deps.adesso(), cosa: `risposta tardiva: ${risposta}` }]
    })
    void deps.avviaLavoro(
      { ...a, stato: 'lavoro' },
      componiRisposta(dati.testo, risposta)
    ).catch((err: unknown) => {
      console.error(`[autopilota] ripresa di ${dati.autopilotaId} fallita:`, err)
    })
  })

  /**
   * Apre le chat che mancano, secondo il piano della flotta.
   *
   * Salva **prima** di avviare i processi: se il servizio morisse fra le due
   * cose, uno stato che non conosce una chat viva è peggio di una chat
   * registrata che non gira — la prima resta orfana per sempre, la seconda
   * riparte alla ripresa.
   */
  const apriChatMancanti = async (a: Autopilota): Promise<Autopilota> => {
    const piano = pianificaFlotta({
      chats: a.chats,
      compitiDaFare: a.compitiDaFare,
      tetto: a.tettoChat
    })
    if (piano.daAprire.length === 0) return a

    const nuove: ChatGovernata[] = piano.daAprire.map((compito, i) => ({
      id: `c-${a.chats.length + i + 1}`,
      compito,
      stato: 'lavoro',
      cicli: 0,
      // Come per la chat singola: l'id lo decide l'autopilota, così la sua
      // conversazione è visibile dal primo istante.
      sessionId: randomUUID()
    }))
    const aggiornato: Autopilota = {
      ...a,
      chats: [...a.chats, ...nuove],
      compitiDaFare: a.compitiDaFare.slice(piano.daAprire.length)
    }
    salva(aggiornato)

    for (const chat of nuove) {
      await deps.avviaLavoro(aggiornato, undefined, chat).catch((err: unknown) => {
        console.error(`[autopilota] avvio della chat ${chat.id} fallito:`, err)
      })
    }
    return aggiornato
  }

  /**
   * Conduce l'intervista che precede il lavoro.
   *
   * L'utente ha descritto cosa vuole e basta: qui l'autopilota guarda il
   * progetto, fa le domande che gli servono — una per volta, attraverso lo
   * stesso meccanismo che usa quando è già al lavoro, quindi visibili nella
   * modale **e** su Telegram — e alla fine si configura da solo.
   *
   * Le domande dell'intervista non hanno scadenza breve come quelle del lavoro:
   * qui non c'è nessuna chat ferma ad aspettare, e l'utente che ha appena
   * delegato può benissimo essersi alzato.
   */
  const conduciIntervista = async (iniziale: Autopilota): Promise<void> => {
    try {
      await svolgiIntervista(iniziale)
    } catch (err) {
      // Un guasto qui non deve restare fra il servizio e sé stesso. Sul campo è
      // successo — claude.exe che non partiva — e l'autopilota è rimasto «sta
      // preparando» per un'ora: nessuno raccoglieva l'errore, e senza una
      // domanda aperta non c'era niente su cui l'utente potesse agire.
      console.error(`[autopilota] preparazione di ${iniziale.id} fallita:`, err)
      const rotto = deps.archivio.leggi(iniziale.id)
      if (rotto === undefined || rotto.stato !== 'intervista') return
      const motivo = err instanceof Error ? err.message : String(err)
      const sospeso: Autopilota = {
        ...rotto,
        stato: 'sospeso',
        motivoSospensione: `la preparazione si e guastata: ${motivo}`.slice(0, MOTIVO_MAX)
      }
      salva(sospeso)
      void deps.avvisa('sospeso', sospeso)
    }
  }

  /**
   * Rimette in moto le preparazioni che uno spegnimento ha interrotto.
   *
   * Sta qui e non in `index.ts` — dove si riprende il lavoro — perché
   * l'intervista si conduce da dentro il server: riprenderla come fosse lavoro
   * avvierebbe una chat senza criteri, cioè un autopilota che non sa quando
   * fermarsi.
   */
  const riprendiInterviste = (): void => {
    const fermi = intervisteDaRiprendere(deps.archivio.elenca())
    if (fermi.length === 0) return
    console.info(`[autopilota] riprendo ${fermi.length} preparazioni interrotte`)
    for (const a of fermi) void conduciIntervista(a)
  }

  const svolgiIntervista = async (iniziale: Autopilota): Promise<void> => {
    let corrente = iniziale

    for (let giro = 0; giro <= SCAMBI_MAX; giro += 1) {
      // All'ultimo giro non si chiede più: si decide. Un'intervista che può
      // sempre fare un'altra domanda è un'intervista che non finisce, e chi ha
      // delegato si ritrova a rispondere a tutto — cioè a fare il lavoro che
      // aveva delegato.
      const senzaDomande = giro >= SCAMBI_MAX
      // Ogni giro apre la sua sessione, e l'id lo decidiamo qui: è ciò che la
      // rende visibile **mentre** lavora. Un'interrogazione dura minuti in cui
      // legge il progetto, e senza un nome saputo in anticipo non c'è nulla da
      // mostrare a chi guarda il pannello.
      const sessione = randomUUID()
      corrente = { ...corrente, sessioneIntervista: sessione }
      salva(corrente)
      const { testo } = await deps.interroga(
        componiPromptIntervista(corrente.obiettivo, corrente.cwd, corrente.intervista, { senzaDomande }),
        corrente.cwd,
        undefined,
        // Il tempo di leggersi un progetto, non quello di dare un giudizio: qui
        // non c'e' nessuna chat ferma che aspetta.
        { nuovaSessione: sessione, timeoutMs: TEMPO_PREPARAZIONE_MS }
      )
      const esito = leggiEsitoIntervista(testo)

      if (esito === undefined) {
        // Non aver capito la propria intervista è un guasto dell'autopilota,
        // non dell'utente: si ferma e lo dice, invece di partire a caso.
        salva({
          ...corrente,
          stato: 'sospeso',
          motivoSospensione: 'la preparazione non ha prodotto una configurazione leggibile'
        })
        void deps.avvisa('sospeso', corrente)
        return
      }

      if (esito.tipo === 'pronto') {
        const configurato: Autopilota = {
          ...corrente,
          stato: 'lavoro',
          ...(esito.nome !== undefined ? { nome: esito.nome } : {}),
          ...(esito.obiettivo !== undefined ? { obiettivo: esito.obiettivo } : {}),
          criteri: esito.criteri.map((c) => ({ ...c, soddisfatto: false })),
          motivoSospensione: undefined,
          decisioni: [
            ...corrente.decisioni,
            { quando: deps.adesso(), cosa: `configurato da sé: ${esito.criteri.map((c) => c.descrizione).join(' · ')}` }
          ]
        }
        salva(configurato)
        await avviaAutopilota(configurato)
        return
      }

      // Una domanda già fatta non si gira all'utente una seconda volta: la
      // risposta ce l'ha già sotto gli occhi nella storia dell'intervista, e
      // rifargliela è il modo più rapido per fargli dire «ti ho già risposto».
      // Si rifà il giro imponendo di decidere.
      if (giaChiesta(corrente.intervista, esito.testo)) {
        console.warn(`[autopilota] ${corrente.id} ha ripetuto una domanda: gli impongo di decidere`)
        const { testo: secondo } = await deps.interroga(
          componiPromptIntervista(corrente.obiettivo, corrente.cwd, corrente.intervista, { senzaDomande: true }),
          corrente.cwd,
          undefined,
          { nuovaSessione: randomUUID(), timeoutMs: TEMPO_PREPARAZIONE_MS }
        )
        const forzato = leggiEsitoIntervista(secondo)
        if (forzato !== undefined && forzato.tipo === 'pronto') {
          const configurato: Autopilota = {
            ...corrente,
            stato: 'lavoro',
            ...(forzato.nome !== undefined ? { nome: forzato.nome } : {}),
            ...(forzato.obiettivo !== undefined ? { obiettivo: forzato.obiettivo } : {}),
            criteri: forzato.criteri.map((c) => ({ ...c, soddisfatto: false })),
            motivoSospensione: undefined,
            decisioni: [
              ...corrente.decisioni,
              { quando: deps.adesso(), cosa: `configurato da sé: ${forzato.criteri.map((c) => c.descrizione).join(' · ')}` }
            ]
          }
          salva(configurato)
          await avviaAutopilota(configurato)
          return
        }
        // Nemmeno così ne è uscita una configurazione: meglio fermarsi e dirlo
        // che continuare a chiedere.
        salva({
          ...corrente,
          stato: 'sospeso',
          motivoSospensione: 'la preparazione continuava a rifare la stessa domanda'
        })
        void deps.avvisa('sospeso', corrente)
        return
      }

      // Una domanda: la si apre e si aspetta, senza tenere occupato nessuno.
      const domanda = deps.domande.apri({
        autopilotaId: corrente.id,
        testo: esito.testo,
        scadenzaMs: deps.scadenzaInterviataMs
      })
      contesto.set(domanda.id, { autopilotaId: corrente.id, testo: esito.testo })
      salva({ ...corrente, motivoSospensione: esito.testo.slice(0, MOTIVO_MAX) })
      void deps.avvisa('domanda', corrente, esito.testo)

      const risposta = await deps.domande.attendi(domanda.id)
      if (risposta === undefined) {
        // Nessuna risposta: l'autopilota resta in intervista, con la domanda
        // ancora aperta. Rispondendo più tardi — anche da Telegram — riprende.
        console.warn(`[autopilota] ${corrente.id} attende una risposta per prepararsi`)
        return
      }

      const dopo = deps.archivio.leggi(corrente.id)
      if (dopo === undefined || dopo.stato !== 'intervista') return
      corrente = {
        ...dopo,
        // La domanda è stata risposta: toglierla dal motivo è ciò che spegne il
        // LED ambra. Restandoci, il pannello continuerebbe a dire «ti sta
        // chiedendo» per tutta l'interrogazione successiva — che dura minuti.
        motivoSospensione: undefined,
        intervista: [...dopo.intervista, { domanda: esito.testo, risposta: risposta.risposta }]
      }
      salva(corrente)
    }

    // Sei giri senza arrivare a una configurazione: continuare sarebbe un
    // interrogatorio, e l'utente sta delegando proprio per non subirlo.
    salva({
      ...corrente,
      stato: 'sospeso',
      motivoSospensione: `dopo ${SCAMBI_MAX} domande non ho una configurazione: riprova con un obiettivo più preciso`
    })
    void deps.avvisa('sospeso', corrente)
  }

  /**
   * Mette al lavoro un autopilota appena creato.
   *
   * Con `tettoChat` a 1 parte una chat sola e non si consulta nessuno: è il caso
   * normale, e chiedere una scomposizione costerebbe un minuto di attesa per
   * sapere che il lavoro è uno solo.
   */
  const avviaAutopilota = async (a: Autopilota): Promise<void> => {
    if (a.tettoChat <= 1) {
      // L'id della sessione lo decidiamo noi, prima di partire: è così che il
      // Gestore sa quale trascrizione seguire e può **mostrare** la
      // conversazione mentre accade. Aspettando che lo dica il primo hook Stop
      // si resta ciechi per tutto il primo turno, che può durare dieci minuti.
      const conSessione: Autopilota = a.sessionId === undefined
        ? { ...a, sessionId: randomUUID() }
        : a
      if (conSessione !== a) salva(conSessione)
      await deps.avviaLavoro(conSessione)
      return
    }
    const { testo } = await deps.interroga(componiPromptScomposizione(a, a.tettoChat), a.cwd, undefined)
    // Una scomposizione illeggibile non deve impedire di lavorare: si ripiega
    // sull'obiettivo intero, che è esattamente il comportamento a una chat.
    const compiti = leggiCompiti(testo) ?? [a.obiettivo]
    const conCompiti: Autopilota = { ...a, compitiDaFare: compiti }
    salva(conCompiti)
    await apriChatMancanti(conCompiti)
  }

  /**
   * Il ciclo completo di una fermata.
   *
   * Restituisce ciò che va risposto a Claude Code: `{decision, reason}` per far
   * proseguire la chat, `{}` per lasciarla fermare. È l'unico punto in cui lo
   * stato di un autopilota cambia per effetto della chat che governa.
   */
  const suStop = async (id: string, chatId: string | undefined, corpo: Record<string, unknown>): Promise<unknown> => {
    const a = deps.archivio.leggi(id)
    // Una chat sopravvissuta al proprio autopilota — eliminato, fermato, finito —
    // deve potersi fermare, non restare appesa a un padrone che non comanda più.
    if (a === undefined || a.stato !== 'lavoro') return {}

    const sessionId = typeof corpo.session_id === 'string' ? corpo.session_id : undefined
    const ultimoMessaggio = typeof corpo.last_assistant_message === 'string' ? corpo.last_assistant_message : ''
    // La sessione appartiene alla chat che si e' fermata: con una flotta,
    // scriverla sull'autopilota farebbe riprendere tutte le chat dalla
    // conversazione dell'ultima che ha parlato.
    const chats = chatId === undefined
      ? a.chats
      : a.chats.map((c) =>
          c.id === chatId
            ? { ...c, cicli: c.cicli + 1, ...(sessionId !== undefined ? { sessionId } : {}) }
            : c
        )
    const conSessione: Autopilota = {
      ...a,
      chats,
      ...(sessionId !== undefined && chatId === undefined ? { sessionId } : {}),
      cicli: a.cicli + 1
    }

    let esiti: EsitoVerifica[] = await eseguiCriteri(conSessione.criteri, conSessione.cwd, deps.esegui)

    // Un comando che non parte non dice niente sul lavoro: dice che la domanda
    // è rotta. Prima si ripeteva il giro all'infinito con la chat che cercava
    // nel codice un difetto che stava nel comando — ore buttate, sul campo.
    // Ora il comando si fa riparare e si riprova subito, una volta per giro.
    const riparabili = nonMisurati(esiti)
    if (riparabili.length > 0) {
      const riparati = new Map<string, string>()
      for (const rotto of riparabili) {
        const criterio = conSessione.criteri.find((c) => c.descrizione === rotto.descrizione)
        if (criterio === undefined) continue
        const nuovo = await riparaComando(conSessione, criterio, rotto.uscita, deps.interroga)
        if (nuovo !== undefined && nuovo !== criterio.comando) riparati.set(rotto.descrizione, nuovo)
      }
      if (riparati.size > 0) {
        conSessione.criteri = conSessione.criteri.map((c) => {
          const nuovo = riparati.get(c.descrizione)
          return nuovo === undefined ? c : { ...c, comando: nuovo }
        })
        conSessione.decisioni = [
          ...conSessione.decisioni,
          ...[...riparati].map(([descrizione, comando]) => ({
            quando: deps.adesso(),
            cosa: `comando di verifica riparato per «${descrizione}»: ${comando}`
          }))
        ]
        salva(conSessione)
        esiti = await eseguiCriteri(conSessione.criteri, conSessione.cwd, deps.esegui)
      }
    }

    const criteri = conSessione.criteri.map((c) => {
      const esito = esiti.find((e) => e.descrizione === c.descrizione)
      return esito === undefined ? c : { ...c, soddisfatto: esito.passato }
    })
    const aggiornato: Autopilota = { ...conSessione, criteri }

    let decisione = decidi(aggiornato, {
      sessionId: sessionId ?? '',
      stopHookActive: corpo.stop_hook_active === true,
      ultimoMessaggio,
      adesso: deps.adesso()
    }, esiti)

    // Fin qui hanno parlato le regole, e per i tetti è giusto così: quelli li ha
    // messi l'utente e non si discutono. Tutto il resto lo decide il
    // supervisore, che è una sessione Claude Code viva e vede il quadro intero —
    // criteri, storia, uscite, progetto. Le regole restano sotto come rete:
    // `applicaRete` non lo lascia chiudere un lavoro che i comandi bocciano, né
    // proseguire senza dire cosa fare.
    if (decisione.tipo !== 'sospendi') {
      const inCerchioDa = ripetizioniFinali(aggiornato.decisioni, traccia(esiti))
      const { decisione: suggerita, sessionId: sessioneNuova } = await chiediDecisione(
        aggiornato, esiti, ultimoMessaggio, inCerchioDa, deps.interroga, aggiornato.sessioneSupervisore
      )
      if (sessioneNuova !== undefined) aggiornato.sessioneSupervisore = sessioneNuova

      const { mossa, nota } = applicaRete({ a: aggiornato, esiti, inCerchioDa }, suggerita)
      decisione = mossa
      const perche = nota ?? suggerita?.perche
      if (perche !== undefined) {
        console.log(`[autopilota] ${id} — ${mossa.tipo}: ${perche}`)
        aggiornato.decisioni = [
          ...aggiornato.decisioni,
          { quando: deps.adesso(), cosa: `supervisore → ${mossa.tipo}: ${perche}` }
        ]
      }
    }

    // Il supervisore ha visto che un comando misura la cosa sbagliata e ne ha
    // scritto uno giusto: si sostituisce e si riprende dal giro dopo, che lo
    // eseguirà davvero. È la differenza fra correggere il lavoro e correggere
    // la domanda.
    if (decisione.tipo === 'correggiCriterio') {
      const { descrizione, comando } = decisione
      const conNuovoCriterio: Autopilota = {
        ...aggiornato,
        criteri: aggiornato.criteri.map((c) =>
          c.descrizione === descrizione ? { ...c, comando, soddisfatto: false } : c
        ),
        decisioni: [
          ...aggiornato.decisioni,
          { quando: deps.adesso(), cosa: `criterio corretto — «${descrizione}»: ${comando}` }
        ]
      }
      salva(conNuovoCriterio)
      return {
        decision: 'block',
        reason:
          `Il criterio «${descrizione}» era misurato male: il comando è stato sostituito con ` +
          `\`${comando}\`.\n\nProsegui verso l'obiettivo: ${aggiornato.obiettivo}`
      }
    }

    if (decisione.tipo === 'chiediUtente') {
      // La chat resta ferma qui dentro finché l'utente non risponde o finché la
      // scadenza non libera l'hook. Tenerla ferma è il caso migliore: se la
      // risposta arriva in tempo, la conversazione riprende senza che
      // claude.exe venga rilanciato.
      const domanda = deps.domande.apri({
        autopilotaId: aggiornato.id,
        testo: decisione.domanda,
        scadenzaMs: deps.scadenzaDomandaMs
      })
      contesto.set(domanda.id, { autopilotaId: aggiornato.id, testo: decisione.domanda })
      salva({ ...aggiornato, stato: 'attesa', motivoSospensione: decisione.domanda.slice(0, MOTIVO_MAX) })
      // L'avviso parte **prima** dell'attesa: mandarlo dopo significherebbe
      // avvisare l'utente quando l'attesa e' gia' finita, cioe' quando la
      // risposta costa una ripresa invece di una continuazione.
      void deps.avvisa('domanda', aggiornato, decisione.domanda)

      const risposta = await deps.domande.attendi(domanda.id)
      if (risposta === undefined) {
        // Nessuno ha risposto in tempo: la chat si ferma, ma la domanda resta
        // aperta e una risposta tardiva farà riprendere il lavoro.
        console.warn(`[autopilota] ${id} in attesa di risposta: ${decisione.domanda}`)
        return {}
      }

      const dopoRisposta = deps.archivio.leggi(id) ?? aggiornato
      salva({
        ...dopoRisposta,
        stato: 'lavoro',
        motivoSospensione: undefined,
        decisioni: [
          ...dopoRisposta.decisioni,
          { quando: deps.adesso(), cosa: `risposta dell utente (${risposta.da}): ${risposta.risposta}` }
        ]
      })
      return { decision: 'block', reason: componiRisposta(decisione.domanda, risposta.risposta) }
    }

    if (decisione.tipo === 'prosegui') {
      const inCerchio: Autopilota = {
        ...aggiornato,
        // La strategia in corso non entra nella traccia: la traccia e' cio' su
        // cui si riconosce il cerchio, e cambiarla a ogni strategia azzererebbe
        // il conteggio proprio mentre serve.
        strategia: decisione.strategia,
        decisioni: [...aggiornato.decisioni, { quando: deps.adesso(), cosa: traccia(esiti) }]
      }
      salva(inCerchio)
      if (decisione.strategia !== undefined) {
        console.warn(`[autopilota] ${id} in difficolta, provo: ${decisione.strategia}`)
        // Una volta sola, all'ingresso nel recupero: un messaggio per ogni
        // strategia sarebbe la raffica di notifiche che nessuno vuole.
        if (decisione.strategia === STRATEGIE[0].nome) void deps.avvisa('stallo', inCerchio)
      }
      return { decision: 'block', reason: decisione.istruzioni }
    }

    if (decisione.tipo === 'sospendi') {
      const sospeso: Autopilota = { ...aggiornato, stato: 'sospeso', motivoSospensione: decisione.motivo }
      salva(sospeso)
      console.warn(`[autopilota] ${id} sospeso: ${decisione.motivo}`)
      void deps.avvisa(decisione.motivo.startsWith('stallo') ? 'stallo' : 'sospeso', sospeso)
      return {}
    }

    const finito: Autopilota = {
      ...aggiornato,
      stato: 'finito',
      chats: aggiornato.chats.map((c) => ({ ...c, stato: 'finita' as const }))
    }
    salva(finito)
    // La scheda si scrive adesso, che il lavoro e' ancora tutto qui e nessuno
    // l'ha dimenticato: domani la stessa ricostruzione costerebbe una rilettura
    // della chat, cioe' token pagati per sapere una cosa scrivibile in dieci
    // righe. Un quaderno che non si riesce a scrivere non ferma niente.
    try {
      deps.quaderno?.(finito.cwd, {
        titolo: titoloScheda(finito),
        corpo: corpoScheda(finito),
        tag: tagScheda(finito),
        ...(finito.sessionId !== undefined ? { sessione: finito.sessionId } : {})
      })
    } catch (err) {
      console.error(`[autopilota] scheda di ${id} non scritta:`, err)
    }
    // Le altre chat della flotta stanno ancora lavorando a pezzi di un obiettivo
    // gia' raggiunto: lasciarle andare consumerebbe per niente.
    if (aggiornato.chats.length > 0) deps.fermaLavoro(id)
    // Il messaggio di fine lavoro e' la ragione per cui l'utente puo' andarsene:
    // e' cosi' che scopre che puo' tornare.
    void deps.avvisa('finito', finito)
    return {}
  }

  /**
   * Una domanda della chat.
   *
   * In questa tappa mette l'autopilota in attesa e ne conserva il testo, che il
   * pannello mostra. La modale con il timeout e il passaggio a Telegram sono
   * delle tappe successive: inventare qui una risposta sarebbe peggio che
   * aspettare, perché deciderebbe al posto dell'utente proprio nel caso in cui
   * si è stabilito di chiederglielo.
   */
  const suNotification = (id: string, corpo: Record<string, unknown>): unknown => {
    const a = deps.archivio.leggi(id)
    if (a === undefined || a.stato !== 'lavoro') return {}
    const tipo = typeof corpo.notification_type === 'string' ? corpo.notification_type : 'sconosciuta'
    const messaggio = typeof corpo.message === 'string' ? corpo.message : ''
    salva({ ...a, stato: 'attesa', motivoSospensione: `${tipo}: ${messaggio}`.slice(0, MOTIVO_MAX) })
    return {}
  }

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    const percorso = url.pathname
    const metodo = req.method ?? 'GET'

    void (async () => {
      try {
        if (metodo === 'GET' && percorso === '/salute') {
          // Quante istruzioni aspettano: il Gestore lo chiede prima di
          // ritirare, perche' senza una finestra non avrebbe dove metterle -
          // e ritirandole le perderebbe.
          rispondi(res, 200, {
            vivo: true,
            consegneInAttesa: deps.consegne?.inAttesa() ?? 0,
            // Con quale versione dell'applicazione è nato: è così che il
            // Gestore riconosce un servizio rimasto indietro a un
            // aggiornamento e lo sostituisce, invece di lasciarlo lì perché
            // «risponde».
            ...(deps.versione !== undefined ? { versione: deps.versione } : {})
          })
          return
        }

        // Il congedo. Il servizio deve sopravvivere alla chiusura del Gestore,
        // ma non a un aggiornamento: questa è l'unica porta da cui esce, e la
        // apre soltanto chi gira sulla stessa macchina.
        if (metodo === 'POST' && percorso === '/spegni') {
          rispondi(res, 200, { spengo: true })
          console.info('[autopilota] mi spengo: il Gestore ha una versione più nuova')
          // Dopo la risposta, non prima: chi ha chiesto deve sapere che è
          // stata accolta, altrimenti aspetta un servizio che è già morto.
          setTimeout(() => process.exit(0), 150)
          return
        }

        if (metodo === 'GET' && percorso === '/autopiloti') {
          rispondi(res, 200, deps.archivio.elenca())
          return
        }

        if (metodo === 'POST' && percorso === '/autopiloti') {
          const corpo = (await leggiCorpo(req)) as Record<string, unknown> | undefined
          const obiettivo = typeof corpo?.obiettivo === 'string' ? corpo.obiettivo.trim() : ''
          const cwd = typeof corpo?.cwd === 'string' ? corpo.cwd : ''
          const criteri = criteriDa(corpo?.criteri)
          if (obiettivo === '') {
            rispondi(res, 400, { errore: 'serve un obiettivo' })
            return
          }
          // Meglio rifiutare adesso che scoprirlo quando claude.exe non parte in
          // una cartella che non esiste.
          if (cwd === '' || !existsSync(cwd) || !statSync(cwd).isDirectory()) {
            rispondi(res, 400, { errore: `cartella non utilizzabile: ${cwd}` })
            return
          }
          const a = nuovoAutopilota({
            id: `ap-${randomUUID()}`,
            nome: typeof corpo?.nome === 'string' && corpo.nome.trim() !== '' ? corpo.nome : obiettivo.slice(0, 40),
            obiettivo,
            cwd,
            criteri,
            // Senza criteri si comincia dall'intervista: sarà lei a produrli,
            // guardando il progetto e facendo all'utente solo le domande a cui
            // il codice non risponde da solo.
            stato: criteri.length === 0 ? 'intervista' : 'lavoro',
            iniziatoIl: deps.adesso(),
            // Un valore assurdo torna a 1 dentro `nuovoAutopilota`: qui basta
            // passarlo, la normalizzazione sta dove sta il tipo.
            ...(typeof corpo?.tettoChat === 'number' ? { tettoChat: corpo.tettoChat } : {})
          })
          deps.archivio.scrivi(a)
          // La risposta parte subito: con una flotta, la scomposizione chiede un
          // giudizio al supervisore e costa un minuto — troppo per tenere in
          // attesa chi ha appena premuto «Avvia».
          rispondi(res, 200, a)
          void (a.stato === 'intervista' ? conduciIntervista(a) : avviaAutopilota(a)).catch((err: unknown) => {
            console.error(`[autopilota] avvio di ${a.id} fallito:`, err)
            const rotto = deps.archivio.leggi(a.id)
            if (rotto !== undefined) {
              salva({ ...rotto, stato: 'fallito', motivoSospensione: `avvio fallito: ${String(err)}` })
            }
          })
          return
        }

        // La scelta «riprendi al riavvio», per questo autopilota soltanto.
        const alRiavvio = /^\/autopiloti\/([^/]+)\/riavvio$/.exec(percorso)
        if (metodo === 'POST' && alRiavvio !== null) {
          const id = decodeURIComponent(alRiavvio[1]!)
          const a = ID_VALIDO.test(id) ? deps.archivio.leggi(id) : undefined
          if (a === undefined) {
            rispondi(res, 404, { errore: 'autopilota inesistente' })
            return
          }
          const corpo = await leggiCorpo(req)
          const voluto = typeof corpo === 'object' && corpo !== null
            ? (corpo as Record<string, unknown>).riprendi === true
            : false
          salva({ ...a, riprendiAlRiavvio: voluto })
          rispondi(res, 200, deps.archivio.leggi(id))
          return
        }

        const comando = /^\/autopiloti\/([^/]+)\/(ferma|riprendi)$/.exec(percorso)
        if (metodo === 'POST' && comando !== null) {
          const id = decodeURIComponent(comando[1]!)
          const a = ID_VALIDO.test(id) ? deps.archivio.leggi(id) : undefined
          if (a === undefined) {
            rispondi(res, 404, { errore: 'autopilota inesistente' })
            return
          }
          if (comando[2] === 'ferma') {
            deps.fermaLavoro(id)
            // Le sue domande non hanno più nessuno che attende la risposta: chi
            // è appeso va liberato, altrimenti l'hook resterebbe fermo fino alla
            // scadenza per un autopilota che non lavora più.
            deps.domande.chiudiDi(id)
            salva({ ...a, stato: 'sospeso', motivoSospensione: 'fermato dall utente' })
          } else if (a.criteri.length === 0) {
            // Un autopilota senza criteri non ha finito di prepararsi: sono i
            // criteri a dirgli quando ha finito, e li produce l'intervista.
            // Mandarlo a «lavoro» lo lascerebbe senza una fine da raggiungere e
            // renderebbe il suo stesso file irrileggibile. Riprenderlo vuol
            // dire quindi riprendere **la preparazione** — che è precisamente
            // ciò che gli manca, e per cui l'obiettivo scritto dall'utente basta.
            const ripreso: Autopilota = { ...a, stato: 'intervista', motivoSospensione: undefined }
            salva(ripreso)
            rispondi(res, 200, ripreso)
            void conduciIntervista(ripreso).catch((err: unknown) => {
              console.error(`[autopilota] ripresa dell intervista di ${id} fallita:`, err)
            })
            return
          } else {
            // Senza togliere il motivo, un autopilota ripreso resta con scritto
            // addosso perche' si era fermato la volta prima, e il pannello - o una
            // notifica - lo raccontano come se fosse successo adesso.
            const ripreso: Autopilota = { ...a, stato: 'lavoro', motivoSospensione: undefined }
            salva(ripreso)
            if (ripreso.chats.length === 0) await deps.avviaLavoro(ripreso)
            else {
              for (const chat of ripreso.chats.filter((c) => c.stato !== 'finita')) {
                await deps.avviaLavoro(ripreso, undefined, chat)
              }
            }
          }
          rispondi(res, 200, deps.archivio.leggi(id))
          return
        }

        // Il Gestore passa a ritirare: quello che si porta via lo scrive dentro
        // le chat, ed e' l'unico che puo' farlo.
        if (metodo === 'GET' && percorso === '/consegne') {
          rispondi(res, 200, { consegne: deps.consegne?.preleva() ?? [] })
          return
        }

        if (metodo === 'GET' && percorso === '/domande') {
          rispondi(res, 200, deps.domande.aperte(url.searchParams.get('ap') ?? undefined))
          return
        }

        const risposta = /^\/domande\/([^/]+)\/risposta$/.exec(percorso)
        if (metodo === 'POST' && risposta !== null) {
          const corpo = (await leggiCorpo(req)) as Record<string, unknown> | undefined
          const testo = typeof corpo?.risposta === 'string' ? corpo.risposta.trim() : ''
          // Una risposta vuota girata alla chat la manderebbe a indovinare
          // proprio sul punto per cui si è fermata.
          if (testo === '') {
            rispondi(res, 400, { errore: 'la risposta non puo essere vuota' })
            return
          }
          const da = corpo?.da === 'telegram' ? 'telegram' : 'modale'
          if (!deps.domande.rispondi(decodeURIComponent(risposta[1]!), testo, da)) {
            rispondi(res, 404, { errore: 'domanda inesistente o gia risposta' })
            return
          }
          rispondi(res, 200, { accettata: true })
          return
        }

        const eliminazione = /^\/autopiloti\/([^/]+)$/.exec(percorso)
        if (metodo === 'DELETE' && eliminazione !== null) {
          const id = decodeURIComponent(eliminazione[1]!)
          const a = ID_VALIDO.test(id) ? deps.archivio.leggi(id) : undefined
          if (a === undefined) {
            rispondi(res, 404, { errore: 'autopilota inesistente' })
            return
          }
          // Prima si fermano le chat, poi si dimentica l'autopilota: nell'ordine
          // opposto resterebbe un claude.exe vivo che nessuno sa più di avere,
          // e nessuna strada per fermarlo se non il Task Manager.
          deps.fermaLavoro(id)
          deps.domande.chiudiDi(id)
          deps.archivio.elimina(id)
          rispondi(res, 200, { eliminato: id })
          return
        }

        const hook = /^\/hook\/(stop|notification)$/.exec(percorso)
        if (metodo === 'POST' && hook !== null) {
          const id = url.searchParams.get('ap') ?? ''
          const corpo = ((await leggiCorpo(req)) ?? {}) as Record<string, unknown>
          // L'id sta nell'URL che abbiamo scritto noi nelle impostazioni della
          // chat: una forma diversa non deve arrivare all'archivio, che
          // solleverebbe, e la chat deve comunque potersi fermare.
          if (!ID_VALIDO.test(id)) {
            rispondi(res, 200, {})
            return
          }
          const chatGrezza = url.searchParams.get('chat') ?? undefined
          const chatId = chatGrezza !== undefined && ID_VALIDO.test(chatGrezza) ? chatGrezza : undefined
          rispondi(
            res,
            200,
            hook[1] === 'stop' ? await suStop(id, chatId, corpo) : suNotification(id, corpo)
          )
          return
        }

        rispondi(res, 404, { errore: 'rotta sconosciuta' })
      } catch (err) {
        // Nessun errore deve arrivare a Claude Code come 500: un hook fallito
        // lascerebbe la chat ferma senza spiegazione. Si risponde prudente — che
        // per un hook significa «fermati pure» — e si registra.
        console.error(`[autopilota] errore su ${metodo} ${percorso}:`, err)
        if (!res.headersSent) rispondi(res, percorso.startsWith('/hook/') ? 200 : 500, {})
      }
    })()
  })

  return Object.assign(server, { riprendiInterviste })
}
