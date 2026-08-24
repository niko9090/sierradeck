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

export interface Archivio {
  /** Tutti i file presenti: nome → identità (id Drive e versione). */
  elenca: () => Promise<Map<string, VoceArchivio>>
  /** Il contenuto di un file, o `undefined` se non c'è. */
  scarica: (nome: string, onProgresso?: (fatto: number, totale: number) => void) => Promise<Buffer | undefined>
  /** Crea o riscrive un file. */
  carica: (nome: string, blocco: Buffer, onProgresso?: (fatto: number, totale: number) => void) => Promise<void>
  /** Rimuove un file. Se non c'è, non è un errore. */
  cancella: (nome: string) => Promise<void>
}

/** Un archivio in memoria: per i test e lo sviluppo, con la stessa interfaccia. */
export function archivioInMemoria(): Archivio {
  const files = new Map<string, { blocco: Buffer; versione: number }>()
  let contatore = 0
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
      contatore += 1
      files.set(nome, { blocco: Buffer.from(blocco), versione: contatore })
      onProgresso?.(blocco.length, blocco.length)
      return Promise.resolve()
    },
    cancella: (nome) => { files.delete(nome); return Promise.resolve() }
  }
}
