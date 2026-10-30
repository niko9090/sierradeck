import { createHash } from 'node:crypto'

/**
 * L'**archivio**: un magazzino a **più file** dentro lo spazio privato dell'app
 * (la cartella appDataFolder del Drive). È ciò che rende possibile la
 * sincronizzazione **incrementale**: invece di un unico blocco che va riscritto
 * per intero a ogni salvataggio, ogni trascrizione è un file a sé, e si tocca
 * solo quello che è cambiato.
 *
 * Interfaccia volutamente minima — elenca, scarica, carica, cancella — così ha
 * un'implementazione vera (Drive) e una in memoria per i test, e la logica
 * incrementale si prova senza rete.
 */

export type VoceArchivio = { id: string; versione: string }

/**
 * Chi e' un file adesso (0.86.2): l'id, la `version` di Drive (sale a ogni
 * scrittura), l'impronta md5 del contenuto cifrato e l'ultima modifica.
 * Serve al manifesto: sapere se e' cambiato senza scaricarlo, e scriverlo
 * solo se nessuno l'ha riscritto nel frattempo.
 */
export type InfoFile = { id: string; versione: string; md5?: string; modificato?: string }

/** La scrittura condizionale ha trovato il file in un'altra versione: un altro PC ha scritto. */
export class ConflittoArchivio extends Error {
  constructor(readonly attuale: string | undefined) {
    super(`ARCHIVIO_CONFLITTO: il file e' stato riscritto da un altro PC (versione ${attuale ?? 'assente'})`)
    this.name = 'ConflittoArchivio'
  }
}

export interface Archivio {
  /** Tutti i file presenti: nome → identità (id Drive e versione). */
  elenca: () => Promise<Map<string, VoceArchivio>>
  /** Il contenuto di un file, o `undefined` se non c'è. */
  scarica: (nome: string, onProgresso?: (fatto: number, totale: number) => void) => Promise<Buffer | undefined>
  /** Crea o riscrive un file. */
  carica: (nome: string, blocco: Buffer, onProgresso?: (fatto: number, totale: number) => void) => Promise<void>
  /** Rimuove un file. Se non c'è, non è un errore. */
  cancella: (nome: string) => Promise<void>
  /** Tutti i file con la loro dimensione vera e l'ultima modifica (0.65.0, lo spazio sul Drive). */
  elencaConDimensioni?: () => Promise<{ nome: string; byte: number; modificato?: string }[]>
  /** Lo spazio dell'account (0.65.0). */
  quota?: () => Promise<{ limite?: number; usato: number; usatoNelDrive?: number; nelCestino?: number }>
  /**
   * Chi e' un file adesso, chiesto **fresco** (mai dalla memoria dei «non
   * c'e'»): una chiamata piccola, senza scaricare il contenuto. `undefined`
   * se non c'e'. Va insieme a `caricaSe`.
   */
  info?: (nome: string) => Promise<InfoFile | undefined>
  /**
   * Scrive solo se il file e' ancora alla versione `attesa` (`null` = solo se
   * non esiste). Altrimenti solleva `ConflittoArchivio` senza scrivere.
   */
  caricaSe?: (nome: string, blocco: Buffer, attesa: string | null) => Promise<InfoFile>
  /**
   * Quanto dura la finestra fra il controllo della versione e la scrittura
   * (ms). Drive non ha una scrittura condizionale vera: chi scrive rilegge
   * dopo questo tempo per accorgersi di un altro PC entrato nella finestra.
   * Assente = la scrittura condizionale e' atomica (l'archivio in memoria).
   */
  finestraConflittoMs?: number
  /**
   * Toglie un file preciso, per id (0.86.2): un doppione del manifesto nato
   * da due creazioni insieme, dopo che il suo contenuto e' stato riportato in
   * quello che vale. Solo gli archivi dove i doppioni possono nascere.
   */
  cancellaId?: (id: string) => Promise<void>
}

/** Un archivio in memoria: per i test e lo sviluppo, con la stessa interfaccia. */
export function archivioInMemoria(): Archivio {
  const files = new Map<string, { blocco: Buffer; versione: number }>()
  let contatore = 0
  const infoDi = (nome: string): InfoFile | undefined => {
    const f = files.get(nome)
    return f === undefined
      ? undefined
      : { id: nome, versione: String(f.versione), md5: createHash('md5').update(f.blocco).digest('hex') }
  }
  const scrivi = (nome: string, blocco: Buffer): void => {
    contatore += 1
    files.set(nome, { blocco: Buffer.from(blocco), versione: contatore })
  }
  return {
    elenca: () =>
      Promise.resolve(new Map(
        [...files.entries()].map(([nome, f]) => [nome, { id: nome, versione: String(f.versione) }])
      )),
    scarica: (nome, onProgresso) => {
      const f = files.get(nome)
      if (f === undefined) return Promise.resolve(undefined)
      onProgresso?.(f.blocco.length, f.blocco.length)
      return Promise.resolve(Buffer.from(f.blocco))
    },
    carica: (nome, blocco, onProgresso) => {
      scrivi(nome, blocco)
      onProgresso?.(blocco.length, blocco.length)
      return Promise.resolve()
    },
    cancella: (nome) => { files.delete(nome); return Promise.resolve() },
    elencaConDimensioni: () => Promise.resolve([...files.entries()].map(([nome, f]) => ({ nome, byte: f.blocco.length }))),
    quota: () => Promise.resolve({ usato: [...files.values()].reduce((t, f) => t + f.blocco.length, 0) }),
    info: (nome) => Promise.resolve(infoDi(nome)),
    caricaSe: (nome, blocco, attesa) => {
      const ora = infoDi(nome)?.versione ?? null
      if (ora !== attesa) return Promise.reject(new ConflittoArchivio(ora ?? undefined))
      scrivi(nome, blocco)
      return Promise.resolve(infoDi(nome) as InfoFile)
    }
  }
}
