import { join } from 'node:path'
import {
  existsSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync
} from 'node:fs'
import { scriviJsonAtomico } from '@shared/scrittura-atomica'
import { parseAutopilota, VERSIONE_AUTOPILOTA, type Autopilota } from '@shared/autopilota'

export type Archivio = {
  cartella: string
  elenca: () => Autopilota[]
  leggi: (id: string) => Autopilota | undefined
  scrivi: (a: Autopilota) => void
  elimina: (id: string) => void
}

/**
 * Un file per autopilota, non un archivio solo.
 *
 * Con un unico file, due autopiloti che salvano nello stesso momento si
 * sovrascriverebbero a vicenda — e qui i salvataggi sono frequenti, uno per
 * ciclo. File separati eliminano il problema invece di gestirlo con un lock.
 */

/** Gli id che il servizio emette; qualunque altra forma non entra in un percorso. */
const ID_VALIDO = /^[A-Za-z0-9_-]{1,64}$/

function validaId(id: string): string {
  if (!ID_VALIDO.test(id)) {
    throw new Error(`id di autopilota non valido: ${JSON.stringify(id)}`)
  }
  return id
}

/**
 * Sposta di lato un file che non siamo riusciti a interpretare, invece di
 * cancellarlo: contiene il lavoro di un autopilota e nessuna sorgente può
 * rigenerarlo.
 *
 * Il suffisso numerato evita che un secondo avvio con lo stesso problema
 * sovrascriva il salvataggio del primo.
 */
function mettiDaParte(percorso: string): void {
  for (let n = 1; n < 1000; n += 1) {
    const destinazione = `${percorso}.illeggibile-${n}`
    if (existsSync(destinazione)) continue
    try {
      renameSync(percorso, destinazione)
      console.error(`[autopilota] file illeggibile conservato in ${destinazione}`)
    } catch (err) {
      console.error(`[autopilota] impossibile conservare ${percorso}:`, err)
    }
    return
  }
  console.error(`[autopilota] troppi file .illeggibile accanto a ${percorso}: non ne creo altri`)
}

export function apriArchivio(cartella: string): Archivio {
  mkdirSync(cartella, { recursive: true })

  const percorsoDi = (id: string): string => join(cartella, `${validaId(id)}.json`)

  /** Gli avvisi già dati, per non ripeterli a ogni rilettura. */
  const gia = new Set<string>()

  const leggiFile = (percorso: string): Autopilota | undefined => {
    let testo: string
    try {
      testo = readFileSync(percorso, 'utf8')
    } catch (err) {
      console.error(`[autopilota] lettura di ${percorso} fallita:`, err)
      return undefined
    }

    let grezzo: unknown
    try {
      grezzo = JSON.parse(testo)
    } catch (err) {
      console.error(`[autopilota] ${percorso} non e JSON valido:`, err)
      mettiDaParte(percorso)
      return undefined
    }

    const { autopilota, scartati } = parseAutopilota(grezzo)
    // L'elenco viene riletto ogni pochi secondi finché il pannello è aperto: un
    // file che il parser corregge scriverebbe la stessa riga per sempre, e un
    // log che ripete non è più il posto dove si guarda quando qualcosa non va.
    // Solo lo stesso avviso sullo stesso file tace: se il file cambia e il
    // motivo con lui, torna a parlare.
    for (const motivo of scartati) {
      const chiave = `${percorso}|${motivo}`
      if (gia.has(chiave)) continue
      gia.add(chiave)
      console.warn(`[autopilota] ${percorso}: ${motivo}`)
    }
    // Uno stato che il parser rifiuta e' indistinguibile, per l'utente, da un
    // file corrotto: in entrambi i casi il suo autopilota non c'e' piu'.
    if (autopilota === undefined) mettiDaParte(percorso)
    return autopilota
  }

  return {
    cartella,

    elenca() {
      const trovati: Autopilota[] = []
      for (const nome of readdirSync(cartella)) {
        // Solo i file che abbiamo scritto noi: accanto possono esserci i
        // .illeggibile messi da parte, e non vanno riletti a ogni giro.
        if (!nome.endsWith('.json')) continue
        const a = leggiFile(join(cartella, nome))
        if (a !== undefined) trovati.push(a)
      }
      return trovati
    },

    leggi(id) {
      const percorso = percorsoDi(id)
      if (!existsSync(percorso)) return undefined
      return leggiFile(percorso)
    },

    scrivi(a) {
      // Lo stato di un autopilota cambia a ogni giro di lavoro e si scrive
      // ogni volta: e' cio' che permette di riprenderlo dopo un riavvio, e una
      // scrittura interrotta non deve lasciare un troncone al posto suo.
      scriviJsonAtomico(percorsoDi(a.id), { ...a, versione: VERSIONE_AUTOPILOTA }, 'autopilota')
    },

    elimina(id) {
      const percorso = percorsoDi(id)
      try {
        if (existsSync(percorso)) unlinkSync(percorso)
      } catch (err) {
        console.error(`[autopilota] eliminazione di ${percorso} fallita:`, err)
      }
    }
  }
}
