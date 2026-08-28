import type { Esito } from './client-server'
import type { Dispositivi } from './dispositivi'
import type { Autopilota } from '@shared/autopilota'
import { paginaClient, ICONA_SVG, MANIFESTO } from './client-pagina'
import { ledDi, misuraPasso, passaggi } from '@shared/autopilota-vista'
import { PREFERENZE_PREDEFINITE, tavolozza, type Preferenze } from '@shared/preferenze'
import { validateNomeWorkspace } from './validation'

/**
 * Cosa può fare il Client, e cosa no.
 *
 * Non è una copia di SierraDeck sul telefono: da un dispositivo con lo schermo
 * piccolo, in piedi, con una mano sola, servono **poche cose fatte bene**.
 * Guardare come vanno i lavori, rispondere a una domanda che blocca tutto,
 * mandare due parole a una chat. Tutto il resto si fa al computer.
 *
 * Manca di proposito qualunque cosa distrugga: niente chiusura di chat, niente
 * eliminazione, niente cambio di cartella. Un tocco sbagliato in tram non deve
 * poter buttare via il lavoro della notte.
 */

export type Chat = {
  id: string
  titolo: string
  cwd: string
  /**
   * La conversazione che c'è dentro.
   *
   * Serve al Core per sapere **quale finestra** ospita già una certa chat, e
   * quindi a chi consegnare le istruzioni di un autopilota: mandarle a tutte
   * significherebbe scrivere lo stesso messaggio due volte.
   */
  sessione?: string
  /**
   * Ha finito di scrivere e aspetta te.
   *
   * Il prompt si è visto e poi c’è stato silenzio: è lo stesso giudizio con
   * cui l’autopilota decide quando può parlare a una chat. Da un telefono è
   * la sola notizia che valga una notifica — «sta lavorando» non chiede
   * niente a nessuno.
   */
  aspetta?: boolean
  /** Se la governa un autopilota: allora è lui ad avvisare, non lei. */
  governata?: boolean
  /** L'ultima riga vista nel terminale: dice a colpo d'occhio se si muove. */
  ultimaRiga?: string
  /**
   * Le ultime righe, per chi vuole guardare dentro.
   *
   * Non viaggiano con l'elenco: si chiedono per **una** chat, quando la si
   * apre. Mandarle tutte ogni due secondi vorrebbe dire spedire qualche decina
   * di kilobyte al minuto sulla rete del telefono per righe che nessuno sta
   * guardando.
   */
  coda?: string[]
  /**
   * Le stesse righe come le ha scritte il terminale, colori compresi.
   *
   * Costano pochi byte in piu' delle ripulite e viaggiano per la stessa strada
   * — una chat sola, quando la si apre — ma dall'altra parte fanno la
   * differenza fra un terminale e la sua trascrizione sbiancata.
   */
  codaGrezza?: string[]
}

export type DipendenzeRotte = {
  dispositivi: Dispositivi
  /** Le chat aperte adesso, in tutte le finestre. */
  chat: () => Chat[]
  autopiloti: () => Promise<Autopilota[]>
  /** Risponde alla domanda di un autopilota. */
  rispondi: (idDomanda: string, risposta: string) => Promise<void>
  /** Le domande in attesa di risposta. */
  domande: () => Promise<{ id: string; autopilotaId: string; testo: string }[]>
  /** Manda del testo a una chat, come se fosse stato digitato. */
  scriviAChat: (idChat: string, testo: string) => void
  /**
   * Apre una chat nuova in una cartella già conosciuta.
   *
   * Aprire non distrugge niente: nel peggiore dei casi resta un riquadro in
   * più, che si chiude al computer. È per questo che c'è, mentre chiudere no.
   */
  apriChat: (cartella: string, modello?: string) => void
  workspace: () => Promise<{ nomi: string[]; attivo: string }>
  cambiaWorkspace: (nome: string) => Promise<void>
  /** Ferma o riprende un autopilota: due gesti reversibili, quindi ammessi. */
  fermaAutopilota: (id: string) => Promise<void>
  riprendiAutopilota: (id: string) => Promise<void>
  /** Il via a un autopilota che si e preparato e aspetta di essere letto. */
  vaiAutopilota: (id: string) => Promise<void>
  /**
   * Affida un lavoro nuovo a un autopilota.
   *
   * È l'unica cosa che *crea* qualcosa da qui, e ci sta: delegare è il gesto
   * che ha più senso da fermi, in piedi, con una mano sola — e non distrugge
   * niente, perché l'autopilota prima di partire chiede. Le sue domande
   * arrivano su questo stesso telefono.
   */
  creaAutopilota: (obiettivo: string, cartella: string) => Promise<{ id: string }>
  /**
   * Elimina un autopilota. È la prima cosa che *disfa* qualcosa da qui.
   *
   * Prima non c'era, per la regola «un tocco sbagliato in tram non deve buttare
   * via il lavoro della notte». Ma un telefono da cui si governa tutto e da cui
   * non si può togliere niente è mezzo strumento: il muro giusto è il gesto —
   * la pagina lo chiede due volte — non l'assenza del comando.
   */
  eliminaAutopilota: (id: string) => Promise<void>
  /** Se quell'autopilota debba ripartire da solo dopo un riavvio. */
  riprendiAlRiavvio: (id: string, riprendi: boolean) => Promise<void>
  /** Chiude una chat del mosaico: la conversazione resta su disco. */
  chiudiChat: (idChat: string) => void
  /** Il nome che dai tu a una chat, che vince su quello di Claude Code. */
  rinominaChat: (idChat: string, nome: string) => void
  /**
   * Le conversazioni che si possono riprendere.
   *
   * Al computer è il tasto «Riprendi»; dal telefono non c'era, e si apriva una
   * conversazione nuova nella cartella — con tutto quello che c'era dentro
   * rimasto da un'altra parte.
   */
  sessioni: () => Promise<{ id: string; cwd: string; titolo: string; quando: string }[]>
  /** Riapre **quella** conversazione, con la sua storia. */
  riprendiSessione: (cwd: string, sessione: string) => void
  creaWorkspace: (nome: string) => Promise<void>
  eliminaWorkspace: (nome: string) => Promise<void>
  /** I salvataggi: insiemi di chat da rimettere in piedi tutti insieme. */
  salvataggi: () => Promise<{ nome: string; quando: string; chat: number }[]>
  caricaIstantanea: (nome: string) => Promise<void>
  /** Quanto si è consumato: una delle cose che si guardano più volentieri da fuori. */
  consumi: () => Promise<unknown>
  /** Le schede del quaderno di una cartella: il resoconto che l'autopilota lascia. */
  quaderno: (cwd: string) => { file: string; titolo: string; quando: string }[]
  scheda: (cwd: string, file: string) => { file: string; titolo: string; corpo: string; quando: string } | undefined
  /** Cambiare le preferenze da fuori: i colori del computer si scelgono anche da qui. */
  impostaPreferenze: (parziali: Record<string, unknown>) => Promise<void>
  /** L'aggiornamento del **computer**: a che punto è, e i due comandi. */
  /**
   * Un pezzo di cronologia di una chat: `da` righe in giù, `quante` righe.
   *
   * Serve a scorrere **tutta** la conversazione da un telefono, non solo le
   * ultime che stanno a schermo. Assente vuol dire che nessuna finestra ha
   * quella chat: si torna a quello che c’è nell’elenco invece di far
   * aspettare.
   */
  righeDi?: (idChat: string, da: number, quante: number) => Promise<unknown>
  aggiornamento: () => { fase: string; versione?: string; percento?: number; errore?: string }
  /**
   * Cercare un aggiornamento **adesso**.
   *
   * Il computer guarda da se' ogni sei ore, che va bene finche' non hai appena
   * pubblicato e vuoi sapere se e' arrivato. Da un telefono l'attesa e' cieca:
   * non si vede il tasto del computer e non si sa nemmeno se stia guardando.
   */
  cercaAggiornamento: () => void
  scaricaAggiornamento: () => void
  installaAggiornamento: () => void
  /** Le cartelle in cui si può aprire una chat: quelle già viste da Claude Code. */
  cartelle: () => Promise<string[]>
  /**
   * Il negozio, da un telefono.
   *
   * Sul computer è un pannello a schede; qui è meno, e di proposito: si
   * **guarda** cosa c’è installato e si accende o si spegne. Installare un
   * plugin passa dal CLI di Claude Code e ci mette qualche secondo, ma resta
   * un gesto reversibile — disinstallare no dal telefono, quello si fa al
   * computer, dove vedi cosa stai togliendo.
   */
  negozio?: () => Promise<{
    plugin: unknown[]
    skill: unknown[]
    agenti: unknown[]
    mcp: unknown[]
    /** Il negozio non ha potuto rispondere. Diverso da «non c'è niente». */
    errore?: string
    /** La spiegazione di un vuoto legittimo, tipo «nessuna chat aperta». */
    nota?: string
  }>
  installaPlugin?: (id: string) => Promise<{ ok: boolean; messaggio?: string }>
  commutaPlugin?: (id: string, attivo: boolean) => Promise<{ ok: boolean; messaggio?: string }>
  commutaSkill?: (nome: string, attivo: boolean) => { ok: boolean; messaggio?: string }
  commutaMcp?: (nome: string, attivo: boolean) => { ok: boolean; messaggio?: string }
  /**
   * Chi è entrato.
   *
   * Era in sola lettura, e il ragionamento era che entrare da un telefono
   * vuol dire scrivere una password su una tastiera che qualcuno guarda.
   * Regge per l'inizio, non per il seguito: un account in cui **non si può
   * uscire** non è prudenza, è una trappola — e chi ne ha due non ha nessun
   * modo di passare dall'uno all'altro se non alzarsi e andare al computer.
   * La prudenza vera è chiedere conferma prima di uscire, non togliere il
   * comando.
   */
  account?: () => Promise<{ email?: string; entrato: boolean }>
  /** Entra con questo account: la stessa chiamata del pannello sul computer. */
  entraAccount?: (email: string, password: string) => Promise<{ ok: boolean; messaggio?: string }>
  /** Esce. Vale per il computer, non solo per il telefono che l'ha chiesto. */
  esciAccount?: () => Promise<void>
  versione: string
  /** Qual è l'ultimo APK dell'app, per il tasto «Scarica». */
  apk?: () => Promise<{ versione: string; url: string } | undefined>
  /**
   * Le preferenze del computer: da lì il telefono prende i suoi colori.
   *
   * Non una tavolozza scritta a mano nella pagina — che invecchierebbe da sola
   * e mostrerebbe un programma diverso da quello che hai davanti — ma la
   * stessa, con lo stesso chiarore e lo stesso stile.
   */
  preferenze?: () => Preferenze
}

const OK = (corpo: unknown): Esito => ({ stato: 200, corpo })
const TESTO = (corpo: string, tipo: string): Esito => ({ stato: 200, corpo, tipo })

/** Il testo che si può mandare a una chat: due parole, non un romanzo. */
const TESTO_MAX = 2000

function stringa(corpo: unknown, campo: string): string {
  if (typeof corpo !== 'object' || corpo === null) return ''
  const v = (corpo as Record<string, unknown>)[campo]
  return typeof v === 'string' ? v.trim() : ''
}

/** Un numero dal corpo di una richiesta, con il suo ripiego. */
function numero(corpo: unknown, campo: string, ripiego: number): number {
  if (typeof corpo !== 'object' || corpo === null) return ripiego
  const v = (corpo as Record<string, unknown>)[campo]
  return typeof v === 'number' && Number.isFinite(v) ? v : ripiego
}

/**
 * Le rotte aperte: l'ingresso.
 *
 * `/api/ciao` risponde senza chiave perché serve a capire di essere nel posto
 * giusto — è quello che il telefono chiede per primo, quando ancora non ha
 * niente. Dice il nome e la versione, e nient'altro: chi non è accoppiato non
 * deve poter sapere cosa sta girando qui dentro.
 */
export function rotteLibere(deps: DipendenzeRotte) {
  return async (r: { metodo: string; percorso: string; corpo: unknown }): Promise<Esito> => {
    // La pagina prima di tutto: è l'unica strada per arrivare al campo dove si
    // scrive il codice di accoppiamento.
    if (r.percorso === '/' || r.percorso === '/index.html') {
      return TESTO(paginaClient(), 'text/html; charset=utf-8')
    }
    if (r.percorso === '/manifest.json') {
      return TESTO(JSON.stringify(MANIFESTO), 'application/manifest+json; charset=utf-8')
    }
    if (r.percorso === '/favicon.ico') {
      // Il cristallo, come icona della scheda del browser.
      return TESTO(ICONA_SVG, 'image/svg+xml; charset=utf-8')
    }

    // Qual e' l'app da scaricare: si chiede senza chiave perche' e' la stessa
    // informazione che sta su una pagina pubblica, e serve **prima** di
    // essersi collegati - e' li' che si propone l'app.
    if (r.percorso === '/api/app') {
      const app = await deps.apk?.()
      return app === undefined ? OK({}) : OK(app)
    }

    if (r.percorso === '/api/ciao') {
      // Solo chi è: nome e versione. **Non** se la finestra di accoppiamento è
      // aperta — dirlo a chi non ha la chiave significa dire a un estraneo sulla
      // rete quando vale la pena provare a indovinare il codice. Il telefono
      // legittimo tenta l'accoppiamento e basta: è /api/accoppia a dirgli com'è
      // andata, ed è protetto dal limite sui tentativi.
      return OK({
        programma: 'SierraDeck',
        versione: deps.versione
      })
    }

    if (r.percorso === '/api/accoppia' && r.metodo === 'POST') {
      const codice = stringa(r.corpo, 'codice')
      const nome = stringa(r.corpo, 'nome')
      const esito = deps.dispositivi.accoppia(codice, nome === '' ? 'dispositivo' : nome)
      if (esito === undefined) {
        return { stato: 403, corpo: { errore: 'codice non valido o scaduto' } }
      }
      console.log(`[client] dispositivo accoppiato: ${nome}`)
      return OK(esito)
    }

    return { stato: 404, corpo: { errore: 'non trovato' } }
  }
}

/** Le rotte che richiedono un dispositivo riconosciuto. */
export function rotteClient(deps: DipendenzeRotte) {
  return async (r: {
    metodo: string
    percorso: string
    corpo: unknown
    dispositivo?: string
  }): Promise<Esito> => {
    if (r.percorso === '/api/stato') {
      const [autopiloti, domande, workspace] = await Promise.all([
        deps.autopiloti().catch(() => [] as Autopilota[]),
        deps.domande().catch(() => []),
        deps.workspace().catch(() => ({ nomi: [], attivo: '' }))
      ])
      return OK({
        // Senza la coda delle righe: l'elenco si chiede ogni due secondi, e
        // quello che si guarda dentro è una chat sola, quando la si apre.
        chat: deps.chat().map(({ coda: _coda, codaGrezza: _grezza, ...resto }) => resto),
        // Solo quello che serve a una piastrella: mandare tutto lo stato di un
        // autopilota su una rete di casa, ogni due secondi, sarebbe spedire un
        // libro per leggerne il titolo.
        autopiloti: autopiloti.map((a) => ({
          id: a.id,
          nome: a.nome !== '' ? a.nome : a.obiettivo,
          stato: a.stato,
          // Il colore del suo LED, deciso dalla **stessa** funzione della
          // console. Il telefono ne aveva una sua, scritta a mano, e sbagliava
          // dove conta: fallito e finito avevano lo stesso puntino grigio.
          led: ledDi(a).classe,
          cicli: a.cicli,
          strategia: a.strategia,
          // Perche' si e' fermato. «Sospeso» da solo manda a cercare altrove:
          // la parte utile e' sempre stata il motivo, e dal telefono non
          // arrivava.
          motivo: a.motivoSospensione,
          // Dove lavora: serve al Quaderno, che e' quello che **lui** produce.
          // Dal telefono si leggeva la cartella della prima chat dell'elenco,
          // che con piu' progetti aperti e' semplicemente un'altra cosa.
          cwd: a.cwd,
          fatti: a.criteri.filter((c) => c.soddisfatto).length,
          criteri: a.criteri.length
        })),
        domande,
        workspace,
        // **Anche l'aggiornamento**, che costa niente: e' gia' in memoria. Senza
        // di lui il telefono non puo' accorgersi che il computer si sta per
        // chiudere, e un'installazione avviata dallo schermo del computer, vista
        // da fuori, e' indistinguibile da un cavo staccato.
        aggiornamento: deps.aggiornamento()
      })
    }

    // I colori del computer, per vestire la pagina con la stessa grafica.
    if (r.percorso === '/api/stile') {
      const p = deps.preferenze?.() ?? PREFERENZE_PREDEFINITE
      return OK({ token: tavolozza(p), stile: p.stile })
    }

    // Tutto di un autopilota, come lo vede il pannello del computer: dove si
    // trova nel suo percorso, quanto manca, i criteri che si e' dato e cosa ha
    // deciso. L'elenco ne manda un riassunto perche' viaggia ogni due secondi;
    // questo si chiede quando se ne apre uno.
    if (r.metodo === 'POST' && r.percorso === '/api/autopilota') {
      const id = stringa(r.corpo, 'autopilota')
      const tutti = await deps.autopiloti().catch(() => [] as Autopilota[])
      const a = tutti.find((x) => x.id === id)
      if (a === undefined) return { stato: 404, corpo: { errore: 'autopilota inesistente' } }
      return OK({
        ...a,
        // Calcolati qui e non nella pagina: sono le stesse funzioni che
        // disegnano il pannello al computer, e due copie divergerebbero.
        passaggi: passaggi(a),
        misura: misuraPasso(a)
      })
    }

    if (r.metodo === 'POST' && r.percorso === '/api/rispondi') {
      const id = stringa(r.corpo, 'domanda')
      const risposta = stringa(r.corpo, 'risposta')
      if (id === '' || risposta === '') {
        return { stato: 400, corpo: { errore: 'servono la domanda e la risposta' } }
      }
      await deps.rispondi(id, risposta.slice(0, TESTO_MAX))
      return OK({ fatto: true })
    }

    if (r.metodo === 'POST' && r.percorso === '/api/scrivi') {
      const chat = stringa(r.corpo, 'chat')
      const testo = stringa(r.corpo, 'testo')
      if (chat === '' || testo === '') return { stato: 400, corpo: { errore: 'servono chat e testo' } }
      deps.scriviAChat(chat, testo.slice(0, TESTO_MAX))
      return OK({ fatto: true })
    }

    // Guardare dentro una chat: le ultime righe del suo terminale. È la
    // differenza fra sapere che «si muove» e sapere **cosa** sta facendo —
    // l'unica cosa che da fuori permette di decidere se serve intervenire.
    if (r.metodo === 'POST' && r.percorso === '/api/dentro') {
      const id = stringa(r.corpo, 'chat')
      const trovata = deps.chat().find((c) => c.id === id)
      if (trovata === undefined) return { stato: 404, corpo: { errore: 'chat non trovata' } }
      return OK({
        chat: trovata.id,
        titolo: trovata.titolo,
        righe: trovata.coda ?? [],
        // Le righe vestite. Restano anche quelle ripulite: una versione vecchia
        // dell'app Android legge quelle, e non deve trovarsi lo schermo vuoto.
        grezze: trovata.codaGrezza ?? []
      })
    }

    // La cronologia di una chat, a finestre.
    //
    // `/api/dentro` da’ lo schermo di adesso, che è quello che serve entrando.
    // Questa da’ **qualunque** pezzo, e con esso il totale: è ciò che permette
    // di risalire una conversazione dal telefono invece di vederne la coda.
    if (r.metodo === 'POST' && r.percorso === '/api/storia') {
      const id = stringa(r.corpo, 'chat')
      const trovata = deps.chat().find((c) => c.id === id)
      if (trovata === undefined) return { stato: 404, corpo: { errore: 'chat non trovata' } }
      // Quello che l'elenco ha gia': e' il ripiego se nessuna finestra
      // risponde — una chat appena chiusa, una finestra che sta partendo — ed
      // e' meglio di un errore per una cosa che si guarda scorrendo.
      const pulite = trovata?.coda ?? []
      const vestite = trovata?.codaGrezza ?? []
      const da = numero(r.corpo, 'da', -1)
      const quante = Math.max(1, Math.min(numero(r.corpo, 'quante', 120), 400))
      const finestra = (await deps.righeDi?.(id, da, quante)) as
        | { totale: number; da: number; pulite: string[]; grezze: string[] }
        | undefined
      return OK({
        chat: id,
        totale: finestra?.totale ?? vestite.length,
        da: finestra?.da ?? 0,
        righe: finestra?.pulite ?? pulite,
        grezze: finestra?.grezze ?? vestite
      })
    }

    // Le cartelle in cui si può aprire: si chiedono solo quando servono, non
    // ogni due secondi come lo stato — è una lettura del disco.
    if (r.percorso === '/api/cartelle') {
      return OK({ cartelle: await deps.cartelle().catch(() => [] as string[]) })
    }

    // Aprire una chat nuova. La cartella deve essere **una di quelle già
    // conosciute**: un percorso qualunque arrivato dalla rete aprirebbe una
    // sessione dove capita, e da un telefono nessuno se ne accorgerebbe.
    if (r.metodo === 'POST' && r.percorso === '/api/apri') {
      const cartella = stringa(r.corpo, 'cartella')
      if (cartella === '') return { stato: 400, corpo: { errore: 'serve la cartella' } }
      const ammesse = await deps.cartelle().catch(() => [] as string[])
      if (!ammesse.includes(cartella)) {
        return { stato: 403, corpo: { errore: 'cartella non conosciuta' } }
      }
      const modello = stringa(r.corpo, 'modello')
      deps.apriChat(cartella, modello === '' ? undefined : modello)
      return OK({ fatto: true })
    }

    // Fermare e riprendere sono reversibili: un tocco sbagliato costa un
    // secondo tocco, non il lavoro della notte. Per questo ci sono, mentre
    // chiudere ed eliminare no.
    if (r.metodo === 'POST' && r.percorso === '/api/autopilota/ferma') {
      const id = stringa(r.corpo, 'autopilota')
      if (id === '') return { stato: 400, corpo: { errore: 'serve l autopilota' } }
      await deps.fermaAutopilota(id)
      return OK({ fatto: true })
    }

    if (r.metodo === 'POST' && r.percorso === '/api/autopilota/riprendi') {
      const id = stringa(r.corpo, 'autopilota')
      if (id === '') return { stato: 400, corpo: { errore: 'serve l autopilota' } }
      await deps.riprendiAutopilota(id)
      return OK({ fatto: true })
    }

    // Il via a chi si è preparato. Sta qui perché è dal telefono che si scopre
    // di averlo pronto: l'avviso arriva mentre si è altrove, e senza questo
    // tasto il lavoro resterebbe fermo fino al ritorno alla scrivania.
    if (r.metodo === 'POST' && r.percorso === '/api/autopilota/vai') {
      const id = stringa(r.corpo, 'autopilota')
      if (id === '') return { stato: 400, corpo: { errore: 'serve l autopilota' } }
      await deps.vaiAutopilota(id)
      return OK({ fatto: true })
    }

    // Affidare un lavoro. La cartella passa dallo stesso muro di «apri»: un
    // percorso qualunque arrivato dalla rete manderebbe un agente a lavorare
    // dove capita, e con un autopilota nessuno se ne accorgerebbe per ore.
    if (r.metodo === 'POST' && r.percorso === '/api/autopilota/crea') {
      const obiettivo = stringa(r.corpo, 'obiettivo')
      const cartella = stringa(r.corpo, 'cartella')
      if (obiettivo === '' || cartella === '') {
        return { stato: 400, corpo: { errore: 'servono l obiettivo e la cartella' } }
      }
      const ammesse = await deps.cartelle().catch(() => [] as string[])
      if (!ammesse.includes(cartella)) {
        return { stato: 403, corpo: { errore: 'cartella non conosciuta' } }
      }
      const creato = await deps.creaAutopilota(obiettivo.slice(0, TESTO_MAX), cartella)
      return OK({ fatto: true, autopilota: creato.id })
    }

    // Il negozio: cosa c'è, e cosa è acceso.
    if (r.percorso === '/api/negozio') {
      const dati = await deps.negozio?.().catch(() => undefined)
      return OK(dati ?? { plugin: [], skill: [], agenti: [], mcp: [] })
    }

    if (r.metodo === 'POST' && r.percorso === '/api/negozio/installa') {
      const id = stringa(r.corpo, 'id')
      if (id === '') return { stato: 400, corpo: { errore: 'serve l id' } }
      const esito = await deps.installaPlugin?.(id)
      return OK(esito ?? { ok: false, messaggio: 'questo computer non sa installare da qui' })
    }

    // Accendere e spegnere: tre cose diverse dietro lo stesso gesto, e da qui
    // si distinguono solo per il «cosa».
    if (r.metodo === 'POST' && r.percorso === '/api/negozio/commuta') {
      const cosa = stringa(r.corpo, 'cosa')
      const nome = stringa(r.corpo, 'nome')
      const corpo = r.corpo as Record<string, unknown> | undefined
      const attivo = corpo?.attivo === true
      if (nome === '') return { stato: 400, corpo: { errore: 'serve il nome' } }
      const esito =
        cosa === 'plugin' ? await deps.commutaPlugin?.(nome, attivo)
        : cosa === 'skill' ? deps.commutaSkill?.(nome, attivo)
        : cosa === 'mcp' ? deps.commutaMcp?.(nome, attivo)
        : undefined
      return OK(esito ?? { ok: false, messaggio: 'non so accendere questa cosa' })
    }

    if (r.percorso === '/api/account') {
      const chi = await deps.account?.().catch(() => undefined)
      return OK(chi ?? { entrato: false })
    }

    // Entrare da lontano. Cambiare account è questo più «esci» prima: non
    // serve un comando a parte, e uno in meno è uno in meno che può sbagliare.
    if (r.metodo === 'POST' && r.percorso === '/api/account/entra') {
      if (deps.entraAccount === undefined) {
        return { stato: 501, corpo: { errore: 'questo computer non sa ancora entrare da fuori' } }
      }
      const email = stringa(r.corpo, 'email')
      const password = stringa(r.corpo, 'password')
      if (email === '' || password === '') {
        return { stato: 400, corpo: { errore: 'servono email e password' } }
      }
      const esito = await deps.entraAccount(email, password).catch((err: unknown) => ({
        ok: false,
        messaggio: String(err)
      }))
      return OK(esito)
    }

    if (r.metodo === 'POST' && r.percorso === '/api/account/esci') {
      if (deps.esciAccount === undefined) {
        return { stato: 501, corpo: { errore: 'questo computer non sa ancora uscire da fuori' } }
      }
      await deps.esciAccount().catch(() => undefined)
      return OK({ fatto: true })
    }

    if (r.percorso === '/api/consumi') {
      return OK(await deps.consumi().catch(() => ({})))
    }

    // Il quaderno di una cartella: le schede che l'autopilota lascia accanto al
    // codice. Solo per le cartelle conosciute, come tutto il resto.
    if (r.metodo === 'POST' && r.percorso === '/api/quaderno') {
      const cartella = stringa(r.corpo, 'cartella')
      if (cartella === '') return { stato: 400, corpo: { errore: 'serve la cartella' } }
      const ammesse = await deps.cartelle().catch(() => [] as string[])
      if (!ammesse.includes(cartella)) return { stato: 403, corpo: { errore: 'cartella non conosciuta' } }
      return OK({ schede: deps.quaderno(cartella) })
    }

    if (r.metodo === 'POST' && r.percorso === '/api/quaderno/scheda') {
      const cartella = stringa(r.corpo, 'cartella')
      const file = stringa(r.corpo, 'file')
      if (cartella === '' || file === '') return { stato: 400, corpo: { errore: 'servono cartella e scheda' } }
      const ammesse = await deps.cartelle().catch(() => [] as string[])
      if (!ammesse.includes(cartella)) return { stato: 403, corpo: { errore: 'cartella non conosciuta' } }
      const s = deps.scheda(cartella, file)
      return s === undefined ? { stato: 404, corpo: { errore: 'scheda inesistente' } } : OK(s)
    }

    if (r.percorso === '/api/preferenze' && r.metodo !== 'POST') {
      return OK({ preferenze: deps.preferenze?.() ?? PREFERENZE_PREDEFINITE })
    }

    // Cambiarne una non deve poter cancellare le altre: arriva un pezzo, e il
    // computer lo mescola con quelle che ha gia'.
    if (r.metodo === 'POST' && r.percorso === '/api/preferenze') {
      const corpo = r.corpo
      if (typeof corpo !== 'object' || corpo === null) {
        return { stato: 400, corpo: { errore: 'servono le preferenze da cambiare' } }
      }
      // Le impostazioni che governano la RETE non si cambiano DALLA rete. Un
      // dispositivo accoppiato che potesse impostare `clientOltreLaRete=true`
      // toglierebbe il primo muro (accettazione dai soli IP locali) all'intero
      // server, lasciando la sola chiave a difesa di un programma che esegue
      // codice; e spostare le porte lo renderebbe irraggiungibile. Aprire il muro
      // o cambiare porta deve passare dal computer, con la scelta davanti. Le
      // altre preferenze — tema, viste, comodità — restano cambiabili dal telefono.
      const parziali = corpo as Record<string, unknown>
      const ammesse: Record<string, unknown> = {}
      for (const [chiave, valore] of Object.entries(parziali)) {
        if (chiave === 'clientOltreLaRete' || chiave === 'portaClient' || chiave === 'portaAutopiloti') {
          continue
        }
        ammesse[chiave] = valore
      }
      await deps.impostaPreferenze(ammesse)
      return OK({ fatto: true })
    }

    if (r.percorso === '/api/aggiornamento') {
      return OK(deps.aggiornamento())
    }

    // Cercare non scarica e non installa: e' la piu' innocua delle tre, e non
    // chiede conferme.
    if (r.metodo === 'POST' && r.percorso === '/api/aggiornamento/cerca') {
      deps.cercaAggiornamento()
      return OK({ fatto: true })
    }

    if (r.metodo === 'POST' && r.percorso === '/api/aggiornamento/scarica') {
      deps.scaricaAggiornamento()
      return OK({ fatto: true })
    }

    // Installare **riavvia il computer di casa**: e' la cosa piu' invasiva che
    // si possa chiedere da un telefono, e la pagina la chiede due volte.
    if (r.metodo === 'POST' && r.percorso === '/api/aggiornamento/installa') {
      deps.installaAggiornamento()
      return OK({ fatto: true })
    }

    if (r.percorso === '/api/sessioni') {
      return OK({ sessioni: await deps.sessioni().catch(() => []) })
    }

    // Riprendere una conversazione: la stessa regola di «apri» sulla cartella,
    // perche' un percorso qualunque arrivato dalla rete aprirebbe una sessione
    // dove capita.
    if (r.metodo === 'POST' && r.percorso === '/api/sessioni/riprendi') {
      const cartella = stringa(r.corpo, 'cartella')
      const sessione = stringa(r.corpo, 'sessione')
      if (cartella === '' || sessione === '') {
        return { stato: 400, corpo: { errore: 'servono la cartella e la conversazione' } }
      }
      const ammesse = await deps.cartelle().catch(() => [] as string[])
      if (!ammesse.includes(cartella)) {
        return { stato: 403, corpo: { errore: 'cartella non conosciuta' } }
      }
      deps.riprendiSessione(cartella, sessione)
      return OK({ fatto: true })
    }

    if (r.metodo === 'POST' && r.percorso === '/api/workspace/crea') {
      // Stessa validazione del percorso desktop (IPC): il nome viene dalla rete,
      // e finora questa rotta lo passava grezzo — lunghezza illimitata e caratteri
      // di controllo che il percorso IPC invece rifiuta. È anche la precondizione
      // che, insieme all'escaping degli onclick, toglie ogni residuo all'XSS via
      // nome workspace.
      let nome: string
      try { nome = validateNomeWorkspace(stringa(r.corpo, 'nome')) }
      catch { return { stato: 400, corpo: { errore: 'nome non valido' } } }
      await deps.creaWorkspace(nome)
      return OK({ fatto: true })
    }

    if (r.metodo === 'POST' && r.percorso === '/api/workspace/elimina') {
      let nome: string
      try { nome = validateNomeWorkspace(stringa(r.corpo, 'nome')) }
      catch { return { stato: 400, corpo: { errore: 'nome non valido' } } }
      await deps.eliminaWorkspace(nome)
      return OK({ fatto: true })
    }

    if (r.percorso === '/api/salvataggi') {
      return OK({ salvataggi: await deps.salvataggi().catch(() => []) })
    }

    if (r.metodo === 'POST' && r.percorso === '/api/salvataggi/carica') {
      const nome = stringa(r.corpo, 'nome')
      if (nome === '') return { stato: 400, corpo: { errore: 'serve il nome' } }
      await deps.caricaIstantanea(nome)
      return OK({ fatto: true })
    }

    if (r.metodo === 'POST' && r.percorso === '/api/autopilota/elimina') {
      const id = stringa(r.corpo, 'autopilota')
      if (id === '') return { stato: 400, corpo: { errore: 'serve l autopilota' } }
      await deps.eliminaAutopilota(id)
      return OK({ fatto: true })
    }

    if (r.metodo === 'POST' && r.percorso === '/api/autopilota/riavvio') {
      const id = stringa(r.corpo, 'autopilota')
      if (id === '') return { stato: 400, corpo: { errore: 'serve l autopilota' } }
      const corpo = r.corpo as Record<string, unknown> | undefined
      await deps.riprendiAlRiavvio(id, corpo?.riprendi === true)
      return OK({ fatto: true })
    }

    // Chiudere una chat non chiude la conversazione: quella resta su disco e si
    // riprende. È la ragione per cui questo comando può stare su un telefono.
    if (r.metodo === 'POST' && r.percorso === '/api/chat/chiudi') {
      const id = stringa(r.corpo, 'chat')
      if (id === '') return { stato: 400, corpo: { errore: 'serve la chat' } }
      deps.chiudiChat(id)
      return OK({ fatto: true })
    }

    if (r.metodo === 'POST' && r.percorso === '/api/chat/nome') {
      const id = stringa(r.corpo, 'chat')
      const nome = stringa(r.corpo, 'nome')
      if (id === '' || nome === '') return { stato: 400, corpo: { errore: 'servono chat e nome' } }
      deps.rinominaChat(id, nome.slice(0, 80))
      return OK({ fatto: true })
    }

    if (r.metodo === 'POST' && r.percorso === '/api/workspace') {
      const nome = stringa(r.corpo, 'nome')
      if (nome === '') return { stato: 400, corpo: { errore: 'serve il nome' } }
      await deps.cambiaWorkspace(nome)
      return OK({ fatto: true })
    }

    return { stato: 404, corpo: { errore: 'non trovato' } }
  }
}
