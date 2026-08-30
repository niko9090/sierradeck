/**
 * Quanto va, e quanto manca.
 *
 * Una barra che avanza dice che qualcosa succede; non dice se ci vogliono
 * quaranta secondi o quaranta minuti, che è la sola cosa che serve sapere per
 * decidere se restare a guardare o andare a fare altro. È il motivo per cui
 * ogni client di trasferimento del mondo mostra due numeri, e non uno.
 */

/** Un'istantanea: quanti byte erano passati, e quando. */
export type Campione = { fatti: number; quando: number }

/**
 * Quanto si guarda indietro per misurare la velocità.
 *
 * **Non dall'inizio**: una copia che parte piano — negoziazione, primo blocco,
 * un file piccolo prima di uno grande — trascinerebbe la media verso il basso
 * per tutto il resto del trasferimento, e la stima di fine resterebbe sbagliata
 * anche quando la rete va a pieno regime da dieci minuti. Cinque secondi è
 * abbastanza da non ballare a ogni pacchetto e abbastanza poco da accorgersi
 * subito che la rete è cambiata.
 */
export const FINESTRA_MS = 5000

/**
 * Byte al secondo, o `undefined` se non c'è ancora abbastanza per dirlo.
 *
 * Meglio non dire niente che dire un numero inventato: una velocità calcolata
 * su due campioni a dieci millisecondi di distanza è rumore moltiplicato per
 * cento, e produce quei «1,4 GB/s» che nessuno crede e che fanno dubitare del
 * resto dello schermo.
 */
export function velocita(campioni: Campione[], adesso: number): number | undefined {
  const dentro = campioni.filter((c) => adesso - c.quando <= FINESTRA_MS)
  const primo = dentro[0]
  const ultimo = dentro.at(-1)
  if (primo === undefined || ultimo === undefined || primo === ultimo) return undefined
  const secondi = (ultimo.quando - primo.quando) / 1000
  const byte = ultimo.fatti - primo.fatti
  // Mezzo secondo di distanza almeno: sotto, il rumore vince sul segnale.
  if (secondi < 0.5 || byte <= 0) return undefined
  return byte / secondi
}

/** Quanti secondi mancano, se si può dirlo. */
export function quantoManca(fatti: number, totale: number, byteAlSecondo?: number): number | undefined {
  if (byteAlSecondo === undefined || byteAlSecondo <= 0) return undefined
  if (totale <= 0 || fatti >= totale) return undefined
  return (totale - fatti) / byteAlSecondo
}

/**
 * Tiene gli ultimi campioni, buttando quelli vecchi.
 *
 * Senza la potatura la lista cresce di un elemento per ogni notifica di
 * avanzamento — molte al secondo, per ogni file di una coda da cinquecento — e
 * un pannello lasciato aperto una notte accumula centinaia di migliaia di
 * oggetti che nessuno guarderà mai.
 */
export function aggiungiCampione(campioni: Campione[], c: Campione): Campione[] {
  return [...campioni, c].filter((x) => c.quando - x.quando <= FINESTRA_MS * 2)
}

/** «1,2 MB/s». Vuoto quando non si sa ancora: meglio niente di un numero finto. */
export function scriviVelocita(byteAlSecondo?: number): string {
  if (byteAlSecondo === undefined) return ''
  if (byteAlSecondo < 1024) return `${Math.round(byteAlSecondo)} B/s`
  if (byteAlSecondo < 1024 * 1024) return `${Math.round(byteAlSecondo / 1024)} kB/s`
  return `${(byteAlSecondo / (1024 * 1024)).toFixed(1).replace('.', ',')} MB/s`
}

/**
 * «2 min», «45 s», «1 h 20 min».
 *
 * Arrotondato, e di proposito: una stima al secondo di un tempo che dipende
 * dalla rete è una precisione che non esiste, e mostrarla la fa sembrare una
 * promessa. Oltre il giorno non si scrive un numero: si dice che non finisce
 * oggi, che è l'unica informazione vera e utile.
 */
export function scriviQuantoManca(secondi?: number): string {
  if (secondi === undefined || !Number.isFinite(secondi)) return ''
  if (secondi < 60) return `${Math.max(1, Math.round(secondi))} s`
  if (secondi < 3600) return `${Math.round(secondi / 60)} min`
  if (secondi < 86400) {
    const ore = Math.floor(secondi / 3600)
    const min = Math.round((secondi - ore * 3600) / 60)
    return min === 0 ? `${ore} h` : `${ore} h ${min} min`
  }
  return 'più di un giorno'
}
