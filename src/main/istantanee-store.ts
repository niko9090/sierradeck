import { join } from 'node:path'
import { existsSync, mkdirSync, readFileSync, renameSync } from 'node:fs'
import { scriviJsonAtomico } from '@shared/scrittura-atomica'
import { parseIstantanee, VERSIONE_ISTANTANEE, type Istantanea } from '@shared/istantanea'

export type IstantaneeStore = {
  percorso: string
  elenca: () => Istantanea[]
  salva: (i: Istantanea) => Istantanea[]
  elimina: (nome: string) => Istantanea[]
}

const NOME_FILE = 'istantanee.json'

/**
 * L'archivio delle istantanee del gestore.
 *
 * Stesse regole di `workspaces.json`, per la stessa ragione: qui dentro c'è il
 * lavoro dell'utente — quali chat aveva aperte, con che disposizione, con quali
 * autopiloti — e non è ricostruibile da nessun'altra sorgente. Scrittura
 * atomica, e un file illeggibile si mette da parte invece di cancellarlo.
 */
export function apriIstantaneeStore(dir: string): IstantaneeStore {
  mkdirSync(dir, { recursive: true })
  const percorso = join(dir, NOME_FILE)

  const mettiDaParte = (): void => {
    for (let n = 1; n < 1000; n += 1) {
      const destinazione = `${percorso}.illeggibile-${n}`
      if (existsSync(destinazione)) continue
      try {
        renameSync(percorso, destinazione)
        console.error(`[istantanee] file illeggibile conservato in ${destinazione}`)
      } catch (err) {
        console.error(`[istantanee] impossibile conservare ${percorso}:`, err)
      }
      return
    }
    console.error(`[istantanee] troppi file .illeggibile accanto a ${percorso}`)
  }

  const elenca = (): Istantanea[] => {
    if (!existsSync(percorso)) return []
    let grezzo: unknown
    try {
      grezzo = JSON.parse(readFileSync(percorso, 'utf8'))
    } catch (err) {
      console.error(`[istantanee] ${percorso} non e leggibile:`, err)
      mettiDaParte()
      return []
    }
    const { istantanee, scartati } = parseIstantanee(grezzo)
    for (const motivo of scartati) console.warn(`[istantanee] scartato: ${motivo}`)

    // Un archivio scritto da una versione più recente non si legge, ma **non è
    // rotto**: contiene i salvataggi dell'utente. Lasciarlo lì significherebbe
    // che il primo salvataggio successivo — quello automatico alla chiusura —
    // ci scrive sopra e li porta via tutti in silenzio. Messo da parte, il
    // programma riparte da un archivio vuoto e quello vecchio resta recuperabile.
    if (scartati.some((m) => m.startsWith('versione non gestita'))) {
      console.error(`[istantanee] ${percorso} viene da una versione più recente: lo metto da parte`)
      mettiDaParte()
    }
    return istantanee
  }

  /**
   * Scrive, e **verifica di aver scritto**.
   *
   * `scriviJsonAtomico` non solleva mai: registra e torna `false`. Qui il
   * valore veniva buttato via, e una scrittura non riuscita — un file occupato,
   * un disco pieno, un antivirus che tiene aperto il file un istante di troppo —
   * era indistinguibile da una riuscita: l'interfaccia diceva «salvato» e sul
   * disco restava il salvataggio di prima. Chi poi lo ricaricava ritrovava il
   * lavoro di **due ore prima** senza nessuna spiegazione possibile.
   *
   * La rilettura costa niente (il file è piccolo) e chiude anche il caso in cui
   * la scrittura riesce ma il contenuto non è quello: e' l'unica prova che
   * quello che si voleva salvare c'e' davvero.
   */
  const scriviTutte = (istantanee: Istantanea[]): void => {
    const scritto = scriviJsonAtomico(
      percorso, { versione: VERSIONE_ISTANTANEE, istantanee }, 'istantanee'
    )
    if (!scritto) throw new Error('il salvataggio non e stato scritto su disco')
    const riletto = elenca()
    for (const attesa of istantanee) {
      if (!riletto.some((i) => i.nome === attesa.nome && i.salvataIl === attesa.salvataIl)) {
        throw new Error(`il salvataggio «${attesa.nome}» non si rilegge da ${percorso}`)
      }
    }
  }

  return {
    percorso,
    elenca,

    salva(i) {
      // Lo stesso nome sostituisce: salvare due volte «Lavoro» è un
      // aggiornamento, e l'elenco al riavvio deve restare corto.
      const altre = elenca().filter((x) => x.nome !== i.nome)
      const tutte = [i, ...altre]
      scriviTutte(tutte)
      return tutte
    },

    elimina(nome) {
      const rimaste = elenca().filter((x) => x.nome !== nome)
      scriviTutte(rimaste)
      return rimaste
    }
  }
}
