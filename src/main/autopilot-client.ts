import type { Autopilota } from '@shared/autopilota'

export type NuovoAutopilota = {
  nome: string
  obiettivo: string
  cwd: string
  criteri: { descrizione: string; comando?: string }[]
  /** Quante chat può aprire insieme. Uno è il caso normale. */
  tettoChat?: number
  /**
   * Il workspace da cui viene avviato: è lì che le sue chat devono nascere.
   *
   * Lo dice chi lo avvia, perché è l'unico che lo sa nel momento in cui conta.
   * Cercarlo dopo, quando la consegna arriva, vuol dire cercare una chat che
   * non esiste ancora — e farla nascere nel workspace sbagliato.
   */
  workspace?: string
}

export type DomandaAperta = {
  id: string
  autopilotaId: string
  testo: string
  apertaIl: number
  scadeIl: number
}

/**
 * Un cambio a un autopilota. Ciò che non è nominato resta com'era.
 *
 * Vale per tutt'e due le strade — le mani sulla scheda e le parole scritte nel
 * campo — perché è lo stesso cambio: cambia solo chi lo ha composto.
 */
export type CambioAutopilota = {
  obiettivo?: string
  criteri?: { descrizione: string; comando?: string }[]
  compitiDaFare?: string[]
}

/** Cosa risponde quando gli parli: cosa ha capito, e se l'ha applicato. */
export type RispostaParlata = {
  applicato: boolean
  capito: string
  errore?: string
  autopilota?: Autopilota
}

export type ClientAutopilota = {
  elenca: () => Promise<Autopilota[]>
  crea: (p: NuovoAutopilota) => Promise<Autopilota>
  /** Il via, dopo aver letto cosa ha deciso in preparazione. */
  vai: (id: string) => Promise<Autopilota>
  /** Cambia obiettivo, criteri o compiti mettendoci le mani. */
  modifica: (id: string, cambio: CambioAutopilota) => Promise<Autopilota>
  /** Glielo dici a parole: è lui a tradurlo in criteri e compiti. */
  parla: (id: string, testo: string) => Promise<RispostaParlata>
  /** Rimette com'era prima dell'ultima cosa che gli hai detto. */
  disfa: (id: string) => Promise<Autopilota>
  ferma: (id: string) => Promise<void>
  riprendi: (id: string) => Promise<void>
  /** Se questo autopilota debba ripartire da solo dopo un riavvio. */
  riprendiAlRiavvio: (id: string, riprendi: boolean) => Promise<void>
  elimina: (id: string) => Promise<void>
  domande: () => Promise<DomandaAperta[]>
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
  gestoreAvviato: () => Promise<number>
}

const ATTESA_PREDEFINITA_MS = 3000

export function creaClientAutopilota(p: {
  porta: number
  avviaServizio: () => void
  attesaMs?: number
  /**
   * La versione di **questa** applicazione.
   *
   * Serve a riconoscere un servizio rimasto indietro. Senza, il comportamento
   * è quello di prima: un servizio vivo va bene com'è.
   */
  versione?: string
}): ClientAutopilota {
  const attesaMs = p.attesaMs ?? ATTESA_PREDEFINITA_MS
  const base = `http://127.0.0.1:${p.porta}`

  const chiama = async (percorso: string, metodo: string, corpo?: unknown): Promise<unknown> => {
    let risposta: Response
    try {
      risposta = await fetch(`${base}${percorso}`, {
        method: metodo,
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(attesaMs),
        ...(corpo !== undefined ? { body: JSON.stringify(corpo) } : {})
      })
    } catch (err) {
      // Il messaggio nomina il servizio e la porta: il pannello lo mostra
      // all'utente, e «fetch failed» non gli direbbe niente su cosa riavviare.
      throw new Error(`il servizio autopilota non risponde sulla porta ${p.porta}: ${String(err)}`)
    }

    const testo = await risposta.text()
    const dati: unknown = testo === '' ? undefined : JSON.parse(testo)
    if (!risposta.ok) {
      const motivo = (dati as { errore?: string } | undefined)?.errore ?? `stato ${risposta.status}`
      throw new Error(`il servizio autopilota ha rifiutato la richiesta: ${motivo}`)
    }
    return dati
  }

  return {
    elenca: async () => (await chiama('/autopiloti', 'GET')) as Autopilota[],
    crea: async (nuovo) => (await chiama('/autopiloti', 'POST', nuovo)) as Autopilota,
    vai: async (id) =>
      (await chiama(`/autopiloti/${encodeURIComponent(id)}/vai`, 'POST')) as Autopilota,
    modifica: async (id, cambio) =>
      (await chiama(`/autopiloti/${encodeURIComponent(id)}`, 'PATCH', cambio)) as Autopilota,
    parla: async (id, testo) =>
      (await chiama(`/autopiloti/${encodeURIComponent(id)}/parla`, 'POST', { testo })) as RispostaParlata,
    disfa: async (id) =>
      (await chiama(`/autopiloti/${encodeURIComponent(id)}/disfa`, 'POST')) as Autopilota,
    ferma: async (id) => { await chiama(`/autopiloti/${encodeURIComponent(id)}/ferma`, 'POST') },
    riprendi: async (id) => { await chiama(`/autopiloti/${encodeURIComponent(id)}/riprendi`, 'POST') },
    riprendiAlRiavvio: async (id, riprendi) => {
      await chiama(`/autopiloti/${encodeURIComponent(id)}/riavvio`, 'POST', { riprendi })
    },
    elimina: async (id) => { await chiama(`/autopiloti/${encodeURIComponent(id)}`, 'DELETE') },
    domande: async () => (await chiama('/domande', 'GET')) as DomandaAperta[],
    rispondi: async (idDomanda, risposta) => {
      // `da: 'modale'` dice al servizio da dove è arrivata: serve al registro
      // delle domande, dove vale la prima risposta fra schermo e Telegram.
      await chiama(`/domande/${encodeURIComponent(idDomanda)}/risposta`, 'POST', { risposta, da: 'modale' })
    },

    async gestoreAvviato() {
      const esito = (await chiama('/gestore-avviato', 'POST')) as { ripresi?: unknown } | undefined
      return typeof esito?.ripresi === 'number' ? esito.ripresi : 0
    },

    async assicuraServizio() {
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
      p.avviaServizio()
      // Un solo tentativo di riavvio: se non risale, insistere non cambierebbe
      // niente e il pannello deve poterlo dire subito invece di restare in
      // caricamento.
      await new Promise((r) => setTimeout(r, attesaMs))
      return vivo()
    }
  }
}
