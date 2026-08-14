/**
 * Quali terminali si stanno muovendo adesso.
 *
 * Una chat che sta lavorando e una ferma sul prompt sono, sullo schermo, la
 * stessa cosa: due riquadri con dentro del testo che non cambia. Chi torna
 * dopo dieci minuti non sa se aspettare o se è successo qualcosa — e con più
 * chat aperte non sa nemmeno **quale** guardare.
 *
 * Il segnale c'è già e passa da solo: sono i dati che il terminale riceve.
 * Finché ne arrivano, quella chat si muove; quando smettono, si è fermata.
 * Nessuna nuova strada dal Core, nessun sondaggio: si guarda ciò che passa.
 *
 * La logica sta qui, fuori dai componenti, perché la parte che può sbagliare è
 * la finestra di tempo — troppo corta e il segno lampeggia a ogni pausa fra due
 * righe, troppo lunga e una chat ferma sembra viva per mezzo minuto.
 */

/**
 * Quanto silenzio serve per dire «si è fermata».
 *
 * Un secondo e mezzo: mentre una chat lavora, il terminale riceve qualcosa di
 * continuo — la riga di stato che gira, il testo che arriva a pezzi. Un vuoto
 * più lungo di così, mentre sta rispondendo, non capita.
 */
export const SILENZIO_MS = 1500

export type Battito = {
  /** Segna che da questo terminale è arrivato qualcosa. */
  segna: (id: string, quando: number) => void
  /** Quel terminale si sta muovendo, a quest'ora? */
  siMuove: (id: string, adesso: number) => boolean
  /** Tutti quelli che si muovono adesso. Serve a ridisegnare una volta sola. */
  attivi: (adesso: number) => Set<string>
  /** Quel terminale non esiste più: si smette di ricordarlo. */
  dimentica: (id: string) => void
}

export function creaBattito(): Battito {
  const ultimo = new Map<string, number>()
  return {
    segna: (id, quando) => { ultimo.set(id, quando) },
    siMuove: (id, adesso) => {
      const q = ultimo.get(id)
      return q !== undefined && adesso - q < SILENZIO_MS
    },
    attivi: (adesso) => {
      const vivi = new Set<string>()
      for (const [id, q] of ultimo) {
        if (adesso - q < SILENZIO_MS) vivi.add(id)
        // Un terminale muto da un pezzo non si tiene in memoria: i riquadri si
        // aprono e si chiudono per tutta la giornata, e questa mappa vivrebbe
        // quanto il programma.
        else if (adesso - q > SILENZIO_MS * 100) ultimo.delete(id)
      }
      return vivi
    },
    dimentica: (id) => { ultimo.delete(id) }
  }
}

/** Due insiemi con dentro le stesse cose: serve a non ridisegnare per niente. */
export function stessiAttivi(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false
  for (const x of a) if (!b.has(x)) return false
  return true
}
