import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { scriviJsonAtomico } from '@shared/scrittura-atomica'

/**
 * I server a cui un progetto si collega.
 *
 * Un progetto non vive solo sul disco: c'è quasi sempre un posto **dove va a
 * finire** — un server, un NAS, una macchina di prova. Fino a ieri quel pezzo
 * di lavoro stava fuori da SierraDeck: si apriva FileZilla, si ricordava a
 * memoria quale server apparteneva a quale cartella, e si trascinava.
 *
 * Le destinazioni stanno **per progetto** e non in un elenco unico, ed è la
 * differenza che conta: aprendo una chat in `E:\Progetti\SitoX` si vedono i
 * server di SitoX e nessun altro. Un elenco globale di venti connessioni
 * rimette addosso proprio il lavoro che si voleva togliere — ricordarsi quale
 * riga va con quale cartella.
 *
 * ## Le password non stanno qui
 *
 * Questo file contiene host, utente, porta: cose che si scrivono in chiaro
 * senza pensarci. La password e la passphrase della chiave **no**: quelle vanno
 * al portachiavi del sistema operativo (`safeStorage` di Electron, che su
 * Windows usa DPAPI legato all'utente). Qui resta solo il segno cifrato, che
 * fuori da questo account Windows non vale niente.
 *
 * Il modulo non conosce Electron di proposito: il cifratore arriva da fuori.
 * Così tutta la logica — quale destinazione appartiene a quale progetto, cosa
 * si sovrascrive, cosa si cancella — si prova senza avviare un'applicazione.
 */

export type MetodoAccesso = 'password' | 'chiave' | 'agente'

export type Destinazione = {
  id: string
  /** Come la chiami tu: «produzione», «il NAS». Non l'host. */
  nome: string
  /** Il progetto a cui appartiene: la cartella della chat. */
  cwd: string
  host: string
  porta: number
  utente: string
  metodo: MetodoAccesso
  /** Il file della chiave privata, quando il metodo è `chiave`. */
  chiaveFile?: string
  /** Da dove partire sul server: senza, la cartella dell'utente. */
  cartellaRemota?: string
  /** Da dove partire in locale: senza, la cartella del progetto. */
  cartellaLocale?: string
  /**
   * L'impronta della chiave del server vista la prima volta.
   *
   * È il pezzo che rende il collegamento davvero sicuro invece che solo
   * cifrato: senza, chiunque si metta in mezzo può presentarsi come il server e
   * la connessione riuscirebbe lo stesso. Alla prima connessione si chiede
   * conferma; dalle volte dopo, un'impronta diversa è un allarme, non un
   * dettaglio.
   */
  improntaServer?: string
}

/** Il segreto di una destinazione, in chiaro. Vive il tempo di una connessione. */
export type Segreto = { password?: string; passphrase?: string }

/**
 * Chi mette al sicuro i segreti.
 *
 * Su Electron è `safeStorage`; nei test è una finta che non cifra niente. Il
 * punto di averlo come parametro è che la parte che si può sbagliare — quale
 * segreto va con quale destinazione, e cosa succede quando se ne cancella una —
 * si prova senza portachiavi di sistema.
 */
export type Cassetta = {
  disponibile: () => boolean
  cifra: (chiaro: string) => string
  decifra: (cifrato: string) => string
}

export type ArchivioDestinazioni = {
  perProgetto: (cwd: string) => Destinazione[]
  tutte: () => Destinazione[]
  trova: (id: string) => Destinazione | undefined
  /** Crea o aggiorna. Il segreto è opzionale: assente vuol dire «lascia quello che c'è». */
  salva: (d: Omit<Destinazione, 'id'> & { id?: string }, segreto?: Segreto) => Destinazione
  elimina: (id: string) => void
  /** Il segreto in chiaro, se c'è e se il portachiavi funziona. */
  segretoDi: (id: string) => Segreto
  /** Ricorda l'impronta del server: si fa dopo che l'utente l'ha accettata. */
  fidatiDi: (id: string, impronta: string) => void
}

const NOME_FILE = 'destinazioni.json'
const VERSIONE = 1

function stringa(o: Record<string, unknown>, campo: string): string {
  const v = o[campo]
  return typeof v === 'string' ? v : ''
}

function metodo(v: unknown): MetodoAccesso {
  return v === 'chiave' || v === 'agente' ? v : 'password'
}

export function apriDestinazioni(cartella: string, cassetta: Cassetta): ArchivioDestinazioni {
  mkdirSync(cartella, { recursive: true })
  const percorso = join(cartella, NOME_FILE)

  type SuDisco = Destinazione & { password?: string; passphrase?: string }

  const leggi = (): SuDisco[] => {
    if (!existsSync(percorso)) return []
    try {
      const grezzo = JSON.parse(readFileSync(percorso, 'utf8')) as Record<string, unknown>
      const elenco = Array.isArray(grezzo.destinazioni) ? grezzo.destinazioni : []
      return elenco.flatMap((x): SuDisco[] => {
        if (typeof x !== 'object' || x === null) return []
        const o = x as Record<string, unknown>
        const id = stringa(o, 'id')
        const host = stringa(o, 'host')
        if (id === '' || host === '') return []
        const porta = typeof o.porta === 'number' && o.porta > 0 && o.porta < 65536 ? o.porta : 22
        return [{
          id,
          nome: stringa(o, 'nome') || host,
          cwd: stringa(o, 'cwd'),
          host,
          porta,
          utente: stringa(o, 'utente'),
          metodo: metodo(o.metodo),
          ...(stringa(o, 'chiaveFile') !== '' ? { chiaveFile: stringa(o, 'chiaveFile') } : {}),
          ...(stringa(o, 'cartellaRemota') !== '' ? { cartellaRemota: stringa(o, 'cartellaRemota') } : {}),
          ...(stringa(o, 'cartellaLocale') !== '' ? { cartellaLocale: stringa(o, 'cartellaLocale') } : {}),
          ...(stringa(o, 'improntaServer') !== '' ? { improntaServer: stringa(o, 'improntaServer') } : {}),
          ...(stringa(o, 'password') !== '' ? { password: stringa(o, 'password') } : {}),
          ...(stringa(o, 'passphrase') !== '' ? { passphrase: stringa(o, 'passphrase') } : {})
        }]
      })
    } catch (err) {
      console.error(`[destinazioni] ${percorso} non e leggibile:`, err)
      return []
    }
  }

  const scrivi = (tutte: SuDisco[]): void => {
    scriviJsonAtomico(percorso, { versione: VERSIONE, destinazioni: tutte }, 'destinazioni', { mode: 0o600 })
  }

  const senzaSegreti = (d: SuDisco): Destinazione => {
    const { password: _p, passphrase: _f, ...resto } = d
    return resto
  }

  return {
    tutte: () => leggi().map(senzaSegreti),

    // Il confronto è sulla stringa esatta: due percorsi che puntano alla stessa
    // cartella scritti in modo diverso sono, per adesso, due progetti. Il
    // giorno in cui darà fastidio si normalizza qui, in un posto solo.
    perProgetto: (cwd) => leggi().filter((d) => d.cwd === cwd).map(senzaSegreti),

    trova: (id) => leggi().map(senzaSegreti).find((d) => d.id === id),

    salva(d, segreto) {
      const tutte = leggi()
      const id = d.id !== undefined && d.id !== '' ? d.id : randomBytes(8).toString('hex')
      const vecchia = tutte.find((x) => x.id === id)
      const nuova: SuDisco = {
        ...d,
        id,
        porta: d.porta > 0 && d.porta < 65536 ? d.porta : 22,
        nome: d.nome.trim() !== '' ? d.nome.trim() : d.host,
        // I segreti si conservano quando non se ne passano di nuovi: chi
        // rinomina una destinazione non si aspetta di doverne ridigitare la
        // password, e chiedergliela sarebbe il modo piu' rapido di far
        // scrivere «password1» a tutti.
        ...(segreto?.password !== undefined
          ? (segreto.password === '' ? {} : { password: cassetta.cifra(segreto.password) })
          : (vecchia?.password !== undefined ? { password: vecchia.password } : {})),
        ...(segreto?.passphrase !== undefined
          ? (segreto.passphrase === '' ? {} : { passphrase: cassetta.cifra(segreto.passphrase) })
          : (vecchia?.passphrase !== undefined ? { passphrase: vecchia.passphrase } : {}))
      }
      scrivi([...tutte.filter((x) => x.id !== id), nuova])
      return senzaSegreti(nuova)
    },

    elimina(id) {
      // Il segreto se ne va con lei: una password cifrata che resta per una
      // destinazione che non esiste piu' e' una cosa che nessuno cancellera'
      // mai, perche' nessuno sa che c'e'.
      scrivi(leggi().filter((d) => d.id !== id))
    },

    segretoDi(id) {
      const d = leggi().find((x) => x.id === id)
      if (d === undefined) return {}
      const apri = (cifrato?: string): string | undefined => {
        if (cifrato === undefined) return undefined
        try {
          return cassetta.decifra(cifrato)
        } catch (err) {
          // Il portachiavi legge solo per l'utente che ha cifrato: un profilo
          // Windows diverso, o dati copiati da un altro computer, danno
          // esattamente questo. Non e' un guasto da urlare — e' una password
          // da ridigitare.
          console.warn(`[destinazioni] segreto di ${id} non decifrabile:`, err)
          return undefined
        }
      }
      const password = apri(d.password)
      const passphrase = apri(d.passphrase)
      return {
        ...(password !== undefined ? { password } : {}),
        ...(passphrase !== undefined ? { passphrase } : {})
      }
    },

    fidatiDi(id, impronta) {
      const tutte = leggi()
      const d = tutte.find((x) => x.id === id)
      if (d === undefined) return
      scrivi(tutte.map((x) => (x.id === id ? { ...x, improntaServer: impronta } : x)))
    }
  }
}
