import { existsSync, mkdirSync, readFileSync, renameSync } from 'node:fs'
import { scriviJsonAtomico } from '@shared/scrittura-atomica'
import { join } from 'node:path'

export type Etichette = Record<string, string>

export type EtichetteStore = {
  leggi: () => Etichette
  imposta: (uuid: string, testo: string) => Etichette
}

const VERSIONE = 1
/** Un'etichetta è un nome, non una descrizione: deve stare in una riga. */
const ETICHETTA_MAX = 80
/** La stessa forma degli identificatori di sessione e di autopilota. */
const ID_VALIDO = /^[A-Za-z0-9_-]{1,64}$/
const MAX_MESSI_DA_PARTE = 20

/**
 * I nomi che l'utente dà alle sue chat.
 *
 * Claude Code battezza le conversazioni da sé, e i suoi titoli descrivono il
 * primo argomento toccato: «Debug multiple issues in Home Assistant
 * controller» è esatto e inutile quando quella chat, per chi la usa, è «casa».
 * Qui vive il nome scelto dall'utente, che vince su quello generato.
 *
 * Sta in un file suo e non nell'indice: l'indice è una cache ricostruibile dai
 * `.jsonl` e viene buttato senza pensarci, mentre questo è l'unico posto in cui
 * quel nome esiste.
 */
export function apriEtichetteStore(cartella: string): EtichetteStore {
  mkdirSync(cartella, { recursive: true })
  const percorso = join(cartella, 'etichette.json')

  const mettiDaParte = (): void => {
    for (let n = 1; n <= MAX_MESSI_DA_PARTE; n += 1) {
      const destinazione = `${percorso}.illeggibile-${n}`
      if (existsSync(destinazione)) continue
      try {
        renameSync(percorso, destinazione)
        console.error(`[etichette] file precedente conservato in ${destinazione}`)
      } catch (err) {
        console.error(`[etichette] ${percorso} non conservato:`, err)
      }
      return
    }
    console.error(`[etichette] troppi file .illeggibile accanto a ${percorso}`)
  }

  const leggi = (): Etichette => {
    if (!existsSync(percorso)) return {}
    let grezzo: unknown
    try {
      grezzo = JSON.parse(readFileSync(percorso, 'utf8'))
    } catch (err) {
      console.error(`[etichette] ${percorso} non e leggibile:`, err)
      mettiDaParte()
      return {}
    }
    if (typeof grezzo !== 'object' || grezzo === null) return {}
    const dentro = (grezzo as Record<string, unknown>).etichette
    if (typeof dentro !== 'object' || dentro === null) return {}

    const buone: Etichette = {}
    for (const [uuid, testo] of Object.entries(dentro as Record<string, unknown>)) {
      // Una voce malformata si scarta senza portarsi via le altre: sono nomi
      // scritti a mano, e perderli tutti per una riga sbagliata sarebbe assurdo.
      if (typeof testo !== 'string' || testo.trim() === '') continue
      buone[uuid] = testo.slice(0, ETICHETTA_MAX)
    }
    return buone
  }

  return {
    leggi,

    imposta(uuid, testo) {
      if (!ID_VALIDO.test(uuid)) {
        throw new Error(`richiesta IPC non valida: identificatore di sessione non valido (${uuid})`)
      }
      const tutte = leggi()
      const pulito = testo.replace(/\s+/g, ' ').trim().slice(0, ETICHETTA_MAX)
      // Svuotare il campo vuol dire «togli il nome mio»: si torna a quello che
      // Claude aveva dato, non si scrive una riga vuota.
      if (pulito === '') delete tutte[uuid]
      else tutte[uuid] = pulito

      scriviJsonAtomico(percorso, { versione: VERSIONE, etichette: tutte }, 'etichette')
      return tutte
    }
  }
}
