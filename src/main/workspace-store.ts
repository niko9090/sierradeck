import { join } from 'node:path'
import { existsSync, mkdirSync, readFileSync, renameSync } from 'node:fs'
import { scriviJsonAtomico } from '@shared/scrittura-atomica'
import { parseArchivio, archivioVuoto, type Archivio } from '@shared/workspace'

export type WorkspaceStore = {
  percorso: string
  leggi: () => Archivio
  scrivi: (a: Archivio) => void
}

const NOME_FILE = 'workspaces.json'

/**
 * Sposta di lato un file che non siamo riusciti a interpretare, invece di
 * cancellarlo.
 *
 * `index.db` in caso di corruzione si cancella, perché è una cache ricostruibile
 * dai `.jsonl`. Questo file no: contiene layout che l'utente ha composto a mano
 * e che nessuna sorgente può rigenerare. Cancellarlo per ripristinare
 * l'avviabilità sarebbe un difetto peggiore di quello che risolve, e silenzioso.
 *
 * Il suffisso numerato evita che un secondo avvio con lo stesso problema
 * sovrascriva il salvataggio del primo.
 */
function mettiDaParte(percorso: string): string | undefined {
  for (let n = 1; n < 1000; n += 1) {
    const destinazione = `${percorso}.illeggibile-${n}`
    if (existsSync(destinazione)) continue
    try {
      renameSync(percorso, destinazione)
      return destinazione
    } catch (err) {
      console.error(`[workspace] impossibile conservare ${percorso}:`, err)
      return undefined
    }
  }
  console.error(`[workspace] troppi file .illeggibile accanto a ${percorso}: non ne creo altri`)
  return undefined
}

export function apriWorkspaceStore(dir: string): WorkspaceStore {
  mkdirSync(dir, { recursive: true })
  const percorso = join(dir, NOME_FILE)

  return {
    percorso,

    leggi(): Archivio {
      if (!existsSync(percorso)) return archivioVuoto()

      let testo: string
      try {
        testo = readFileSync(percorso, 'utf8')
      } catch (err) {
        console.error(`[workspace] lettura di ${percorso} fallita:`, err)
        return archivioVuoto()
      }

      let grezzo: unknown
      try {
        grezzo = JSON.parse(testo)
      } catch (err) {
        console.error(`[workspace] ${percorso} non e JSON valido:`, err)
        const salvato = mettiDaParte(percorso)
        if (salvato !== undefined) {
          console.error(`[workspace] il file precedente e stato conservato in ${salvato}`)
        }
        return archivioVuoto()
      }

      const { archivio, scartati } = parseArchivio(grezzo)
      for (const motivo of scartati) console.warn(`[workspace] scartato: ${motivo}`)

      // Un archivio interamente scartato e' indistinguibile da un file corrotto
      // dal punto di vista dell'utente: in entrambi i casi i suoi layout non ci
      // sono. Conservarlo e' l'unico modo di poterlo recuperare a mano.
      if (scartati.length > 0 && archivio.workspace.length === 0) {
        const salvato = mettiDaParte(percorso)
        if (salvato !== undefined) {
          console.error(`[workspace] archivio inutilizzabile, conservato in ${salvato}`)
        }
      }
      return archivio
    },

    scrivi(a: Archivio): void {
      // Il layout dell'utente e' composto a mano e nessuna sorgente puo'
      // rigenerarlo: si scrive per intero o non si scrive. Il come sta in
      // `scriviAtomico`, che da qui in poi vale per tutti i file dei dati.
      scriviJsonAtomico(percorso, a, 'workspace')
    }
  }
}
