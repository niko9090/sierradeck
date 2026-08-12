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
  /** L'ultima riga vista nel terminale: dice a colpo d'occhio se si muove. */
  ultimaRiga?: string
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
  workspace: () => Promise<{ nomi: string[]; attivo: string }>
  cambiaWorkspace: (nome: string) => Promise<void>
  /** Ferma o riprende un autopilota: due gesti reversibili, quindi ammessi. */
  fermaAutopilota: (id: string) => Promise<void>
  riprendiAutopilota: (id: string) => Promise<void>
  versione: string
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
        chat: deps.chat(),
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
