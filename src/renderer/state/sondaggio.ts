import { useEffect, useState } from 'react'

/**
 * **Le riletture a tempo, con la finestra nascosta più rade** (0.85.2).
 *
 * Il PC restava occupato anche con SierraDeck ridotto a icona: ogni pannello
 * rileggeva per conto suo ogni due secondi cose che nessuno stava guardando.
 * Qui due attrezzi:
 *
 * - `ogni`: come `setInterval`, ma con la finestra nascosta o ridotta gira al
 *   più ogni `nascostaMs` (si salta un giro finché non è passato). Quando la
 *   finestra torna davanti, rilegge subito: chi guarda vede il dato fresco.
 * - `creaSondaggio`: una lettura sola per finestra, condivisa da tutti quelli
 *   che la vogliono (le domande degli autopiloti le volevano in quattro posti
 *   diversi, ognuno con il suo giro). Gira solo finché qualcuno ascolta.
 */

/** Con la finestra nascosta, ogni quanto si rilegge comunque. */
export const NASCOSTA_MS = 15_000

/** La finestra non si vede (ridotta a icona, dietro un'altra a tutto schermo, su un desktop virtuale spento). */
export function nascosta(): boolean {
  return typeof document !== 'undefined' && document.hidden
}

/**
 * Chiama `fn` ogni `ms`; con la finestra nascosta al più ogni `nascostaMs`
 * (`Infinity`: mai, finché non torna visibile). Torna la funzione per smettere.
 */
export function ogni(fn: () => void, ms: number, nascostaMs: number = NASCOSTA_MS): () => void {
  let fattoIl = Date.now()
  const giro = (): void => {
    if (nascosta() && Date.now() - fattoIl < nascostaMs) return
    fattoIl = Date.now()
    fn()
  }
  const h = setInterval(giro, ms)
  // Tornata davanti: subito, non al prossimo giro.
  const visibile = (): void => { if (!nascosta() && Date.now() - fattoIl >= Math.min(ms, 1000)) { fattoIl = Date.now(); fn() } }
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', visibile)
  return () => {
    clearInterval(h)
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', visibile)
  }
}

export type Sondaggio<T> = {
  /** Si abbona: riceve subito l'ultimo valore (se c'è) e ogni valore nuovo. Torna la disdetta. */
  ascolta: (f: (v: T) => void) => () => void
  /** Rilegge adesso (dopo una risposta, un cambio): tutti gli abbonati ricevono il nuovo. */
  rileggi: () => void
  ultimo: () => T | undefined
}

/** Una lettura condivisa: una richiesta per giro, qualunque sia il numero di chi ascolta. */
export function creaSondaggio<T>(leggi: () => Promise<T>, ms: number, nascostaMs: number = NASCOSTA_MS): Sondaggio<T> {
  const abbonati = new Set<(v: T) => void>()
  let valore: { v: T } | undefined
  let smetti: (() => void) | undefined
  let inViaggio = false
  let ancora = false
  const giro = (): void => {
    if (inViaggio) { ancora = true; return }
    inViaggio = true
    leggi()
      .then((v) => {
        valore = { v }
        for (const f of abbonati) f(v)
      })
      .catch(() => undefined)
      .finally(() => {
        inViaggio = false
        if (ancora) { ancora = false; giro() }
      })
  }
  return {
    ascolta(f) {
      abbonati.add(f)
      if (valore !== undefined) f(valore.v)
      if (smetti === undefined) {
        smetti = ogni(giro, ms, nascostaMs)
        giro()
      }
      return () => {
        abbonati.delete(f)
        if (abbonati.size === 0 && smetti !== undefined) { smetti(); smetti = undefined }
      }
    },
    rileggi: giro,
    ultimo: () => valore?.v
  }
}

/** Un valore letto, con il sondaggio da cui viene. */
export type LettoDa<T> = { da: Sondaggio<T>; v: T | undefined }

/**
 * Pura: il valore da mostrare per il sondaggio `s`. Quello tenuto viene da un
 * altro sondaggio (si è cambiato workspace, o PC): non vale, si usa l'ultimo
 * di `s` (o niente finché non arriva).
 *
 * 13/11 (Nicholas: «ho aperto una chat remota e nella parte a destra con gli
 * agenti c'era quello giusto e anche uno di un altro workspace»): prima lo
 * stato restava quello del workspace di prima finché il nuovo non rispondeva,
 * e per sempre se il PC remoto dava errore.
 */
export function valoreDelSondaggio<T>(tenuto: LettoDa<T>, s: Sondaggio<T>): T | undefined {
  return tenuto.da === s ? tenuto.v : s.ultimo()
}

/** Il valore di un sondaggio in un componente: `undefined` finché non arriva il primo. */
export function useSondaggio<T>(s: Sondaggio<T>): T | undefined {
  const [tenuto, setTenuto] = useState<LettoDa<T>>(() => ({ da: s, v: s.ultimo() }))
  useEffect(() => s.ascolta((v) => setTenuto({ da: s, v })), [s])
  return valoreDelSondaggio(tenuto, s)
}
