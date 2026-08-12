import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  CARTELLA_QUADERNO, SOTTOCARTELLA, componiScheda, leggiScheda, nomeFile, ordinaSchede,
  type Scheda
} from '@shared/quaderno'

/**
 * Il quaderno vive **dentro la cartella di lavoro**, non nei dati del programma.
 *
 * È una scelta, non una comodità: le schede raccontano quel progetto, e devono
 * seguirlo. Si copiano con lui, si mettono in git accanto al codice che
 * descrivono, e restano leggibili il giorno in cui questo programma non c'è più.
 * Tenerle in `%APPDATA%` le avrebbe legate a una macchina e a un'installazione.
 */

export type QuadernoStore = {
  cartella: (cwd: string) => string
  elenca: (cwd: string) => Scheda[]
  leggi: (cwd: string, file: string) => Scheda | undefined
  /** Scrive una scheda nuova, o riscrive quella con lo stesso nome. */
  scrivi: (cwd: string, s: { titolo: string; corpo: string; tag?: string[]; sessione?: string; file?: string }) => Scheda
}

/** Solo file `.md` senza percorso dentro: un nome che risale le cartelle non è un nome. */
const NOME_VALIDO = /^[A-Za-z0-9._-]+\.md$/

export function apriQuaderno(adesso: () => string = () => new Date().toISOString()): QuadernoStore {
  const cartella = (cwd: string): string => join(cwd, CARTELLA_QUADERNO, SOTTOCARTELLA)

  const percorsoDi = (cwd: string, file: string): string => {
    if (!NOME_VALIDO.test(file)) throw new Error(`nome di scheda non valido: ${JSON.stringify(file)}`)
    const dentro = cartella(cwd)
    const percorso = resolve(dentro, file)
    // Cintura oltre alle bretelle: la forma del nome è già controllata, ma un
    // percorso che esce dalla cartella non deve poter essere scritto nemmeno se
    // un giorno quella regola cambiasse.
    if (!percorso.startsWith(resolve(dentro))) throw new Error('percorso fuori dal quaderno')
    return percorso
  }

  return {
    cartella,

    elenca(cwd) {
      const dentro = cartella(cwd)
      if (!existsSync(dentro)) return []
      const schede: Scheda[] = []
      for (const nome of readdirSync(dentro)) {
        if (!nome.toLowerCase().endsWith('.md')) continue
        try {
          schede.push(leggiScheda(nome, readFileSync(join(dentro, nome), 'utf8')))
        } catch (err) {
          // Una scheda illeggibile non porta via le altre: sono appunti scritti
          // anche a mano, e perderli tutti per un file rotto sarebbe assurdo.
          console.error(`[quaderno] ${nome} non e leggibile:`, err)
        }
      }
      return ordinaSchede(schede)
    },

    leggi(cwd, file) {
      const percorso = percorsoDi(cwd, file)
      if (!existsSync(percorso)) return undefined
      return leggiScheda(file, readFileSync(percorso, 'utf8'))
    },

    scrivi(cwd, s) {
      const dentro = cartella(cwd)
      mkdirSync(dentro, { recursive: true })
      const quando = adesso()
      const file = s.file ?? nomeFile(s.titolo, quando)
      const scheda: Scheda = {
        file,
        titolo: s.titolo,
        quando,
        tag: s.tag ?? [],
        ...(s.sessione !== undefined ? { sessione: s.sessione } : {}),
        corpo: s.corpo
      }
      writeFileSync(percorsoDi(cwd, file), componiScheda(scheda), 'utf8')
      return scheda
    }
  }
}
