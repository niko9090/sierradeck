import { join } from 'node:path'
import { existsSync, mkdirSync, readFileSync, renameSync, statSync } from 'node:fs'
import { scriviJsonAtomico } from '@shared/scrittura-atomica'
import { parseArchivio, archivioVuoto, type Archivio } from '@shared/workspace'

export type WorkspaceStore = {
  percorso: string
  leggi: () => Archivio
  /** Ha scritto davvero? Un `false` è lavoro che sul disco non è arrivato. */
  scrivi: (a: Archivio) => boolean
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

/**
 * La forma su disco: `perSlot`, **più una copia sotto il vecchio nome**.
 *
 * Serve a una cosa sola, e vale la mezza riga: se questa versione dovesse
 * tornare indietro, quella precedente cerca `perMonitor` e senza troverebbe un
 * archivio vuoto — cioè tutte le chat sparite, che è esattamente il danno che
 * questo lavoro esiste per chiudere. Con la copia le ritrova: le chiavi `1`,
 * `2` le legge come chiavi di monitor e il suo `unicoLayout` le raccoglie da
 * sé. E riscrivendo `perMonitor`, questa versione le rilegge e le rimigra.
 *
 * La regola che il registro ha insegnato dopo la terza perdita: quando si tocca
 * il modo in cui il lavoro è archiviato, la prima cosa da garantire non è che
 * vada bene — è che si possa tornare indietro.
 */
function perDisco(a: Archivio): unknown {
  return {
    ...a,
    workspace: a.workspace.map((w) => ({ ...w, perMonitor: w.perSlot }))
  }
}

export function apriWorkspaceStore(dir: string): WorkspaceStore {
  mkdirSync(dir, { recursive: true })
  const percorso = join(dir, NOME_FILE)

  // `workspaces.json` viene riletto di continuo — a ogni `/api/stato` del telefono
  // (2s) e a ogni consegna d'autopilota (~1,5s) — ma cambia di rado. Senza cache,
  // ogni giro rifaceva `readFileSync`+`JSON.parse`+`parseArchivio` sul thread main.
  // Si riusa il parsed finché `mtime`+`size` non cambiano; le scritture sono
  // atomiche (temp + rename → l'mtime cambia), così la cache si invalida da sola e
  // regge anche una modifica esterna. Restituire il riferimento condiviso è sicuro:
  // le operazioni sui workspace sono tutte pure (creano un nuovo archivio, non
  // mutano quello letto).
  let cache: { mtimeMs: number; size: number; archivio: Archivio } | undefined

  return {
    percorso,

    leggi(): Archivio {
      if (!existsSync(percorso)) { cache = undefined; return archivioVuoto() }

      // Se il file non è cambiato dall'ultima lettura, si riusa il parsed.
      let st: ReturnType<typeof statSync> | undefined
      try {
        st = statSync(percorso)
      } catch {
        st = undefined
      }
      if (st !== undefined && cache !== undefined && cache.mtimeMs === st.mtimeMs && cache.size === st.size) {
        return cache.archivio
      }

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
        // Il file è stato spostato: niente da mettere in cache (al prossimo giro
        // esistsSync sarà falso e si tornerà l'archivio vuoto).
        cache = undefined
        return archivio
      }
      // Si mette in cache solo un file valido e ancora al suo posto.
      if (st !== undefined) cache = { mtimeMs: st.mtimeMs, size: st.size, archivio }
      return archivio
    },

    /**
     * Scrive, e **dice se ha scritto**.
     *
     * Prima l'esito si buttava via. `scriviJsonAtomico` non solleva mai per
     * progetto — chi salva è dentro un canale a senso unico e non ha dove far
     * risalire un'eccezione — quindi un salvataggio non riuscito era
     * indistinguibile da uno riuscito: nessun errore, nessuna riga, e sul disco
     * restava la versione di prima. Su Windows non è un caso di scuola: la
     * rinomina sopra un file aperto da qualcun altro fallisce, e
     * `workspaces.json` viene riletto ogni paio di secondi dal Client e dalle
     * consegne d'autopilota. La perdita si scopriva al riavvio successivo,
     * quando non c'era più modo di ricostruire cosa fosse successo.
     *
     * La cache si invalida **sempre**, riuscita o no: dopo una scrittura fallita
     * tenere in memoria l'archivio nuovo mentre sul disco c'è il vecchio è la
     * differenza fra un guasto che si vede e uno che si scopre domani.
     */
    scrivi(a: Archivio): boolean {
      // Il layout dell'utente e' composto a mano e nessuna sorgente puo'
      // rigenerarlo: si scrive per intero o non si scrive. Il come sta in
      // `scriviAtomico`, che da qui in poi vale per tutti i file dei dati.
      const fatto = scriviJsonAtomico(percorso, perDisco(a), 'workspace')
      cache = undefined
      if (!fatto) {
        console.error(`[workspace] ${percorso} NON scritto: quello che c'e' sul disco e' la versione di prima`)
      }
      return fatto
    }
  }
}
