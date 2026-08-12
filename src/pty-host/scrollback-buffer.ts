/**
 * Quanto output conservare per riquadro, per poterlo riproporre a chi si
 * riaggancia.
 *
 * 256 KB sono circa un migliaio di righe piene: abbastanza per capire dove si
 * era, poco abbastanza da restare trascurabile con sei riquadri (1,5 MB nel
 * caso peggiore). Il tetto è in byte e non in righe perché è la memoria che va
 * limitata, e una riga di output di Claude Code può essere lunghissima.
 */
export const SCROLLBACK_MAX_BYTE = 256 * 1024

/**
 * Ripristino degli attributi, anteposto a ogni scrollback restituito: se il
 * tampone e' stato tagliato, la sequenza che aveva impostato colore o grassetto
 * puo' essere finita fuori, e senza reset il resto arriverebbe colorato a caso.
 *
 * Non e' output conservato e non entra nel tetto: e' una costante che
 * `leggi` aggiunge al momento della lettura.
 */
export const PREFISSO_RESET = '\x1b[0m'

export type Tampone = {
  aggiungi: (data: string) => void
  leggi: () => string
}

/**
 * Un tampone di scrollback, puro e senza I/O: accumula pezzi di testo,
 * scartando dalla testa quando supera il tetto.
 *
 * Il taglio avviene per pezzi interi e non per byte: tagliare a metà una
 * sequenza UTF-8 produrrebbe caratteri corrotti. Resta comunque possibile
 * recidere a metà una sequenza di escape ANSI, e con essa perdere lo stato
 * dello schermo — colori attivi, posizione del cursore, modalità alternata.
 *
 * Non è risolvibile conservando più byte: servirebbe emulare il terminale qui
 * dentro. La mitigazione vive dal lato del riquadro, che dopo il riaggancio
 * manda comunque un `resize`: un'applicazione a tutto schermo come Claude Code
 * ridisegna su cambio di dimensione, e il disegno nuovo copre quello parziale.
 *
 * L'ultimo pezzo non viene mai scartato, anche se da solo supera il tetto:
 * meglio superare la soglia che restituire un tampone vuoto.
 */
export function creaTampone(maxByte: number = SCROLLBACK_MAX_BYTE): Tampone {
  const pezzi: string[] = []
  let byte = 0

  return {
    aggiungi(data: string): void {
      pezzi.push(data)
      byte += Buffer.byteLength(data, 'utf8')
      while (byte > maxByte && pezzi.length > 1) {
        const via = pezzi.shift()
        if (via === undefined) break
        byte -= Buffer.byteLength(via, 'utf8')
      }
    },

    leggi(): string {
      return `${PREFISSO_RESET}${pezzi.join('')}`
    }
  }
}
