import type { Esito } from './client-server'
import type { Dispositivi } from './dispositivi'
import type { Autopilota } from '@shared/autopilota'
import { paginaClient, ICONA_SVG, MANIFESTO } from './client-pagina'

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
  /** Le cartelle in cui si può aprire una chat: quelle già viste da Claude Code. */
  cartelle: () => Promise<string[]>
  versione: string
  /** Qual è l'ultimo APK dell'app, per il tasto «Scarica». */
  apk?: () => Promise<{ versione: string; url: string } | undefined>
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
      const accoppiamento = deps.dispositivi.accoppiamentoAperto()
      return OK({
        programma: 'SierraDeck',
        versione: deps.versione,
        // Se è aperto lo dice, ma **non dice il codice**: quello si legge sullo
        // schermo del computer, ed è tutta la sicurezza che c'è.
        accoppiamentoAperto: accoppiamento !== undefined
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
        chat: deps.chat().map(({ coda: _coda, ...resto }) => resto),
        // Solo quello che serve a una piastrella: mandare tutto lo stato di un
        // autopilota su una rete di casa, ogni due secondi, sarebbe spedire un
        // libro per leggerne il titolo.
        autopiloti: autopiloti.map((a) => ({
          id: a.id,
          nome: a.nome !== '' ? a.nome : a.obiettivo,
          stato: a.stato,
          cicli: a.cicli,
          strategia: a.strategia,
          fatti: a.criteri.filter((c) => c.soddisfatto).length,
          criteri: a.criteri.length
        })),
        domande,
        workspace
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
      return OK({ chat: trovata.id, titolo: trovata.titolo, righe: trovata.coda ?? [] })
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

    if (r.metodo === 'POST' && r.percorso === '/api/workspace') {
      const nome = stringa(r.corpo, 'nome')
      if (nome === '') return { stato: 400, corpo: { errore: 'serve il nome' } }
      await deps.cambiaWorkspace(nome)
      return OK({ fatto: true })
    }

    return { stato: 404, corpo: { errore: 'non trovato' } }
  }
}
