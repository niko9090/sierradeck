/**
 * Le chat ripartono a turni, poche alla volta (0.86.2).
 *
 * All'apertura del programma il mosaico rimonta tutti i suoi riquadri insieme,
 * e ognuno lanciava subito il suo claude.exe: una quindicina di processi Node
 * che rileggono la loro trascrizione nello stesso momento, il processore al
 * 100% per un minuto, e decine di chat segnate «non si apre» che non avevano
 * niente di rotto. Qui un riquadro chiede il turno prima di avviare, e lo rende
 * quando la sua chat arriva al prompt (o fallisce, o il riquadro sparisce).
 *
 * Un turno non resta preso per sempre: dopo `tettoMs` si rende da solo, cosi'
 * una chat bloccata non ferma la fila dietro di lei.
 */

export type Turni = {
  /** Aspetta un turno libero; risolve con la funzione che lo rende (si puo' chiamare piu' volte). */
  prendi: () => Promise<() => void>
  /** Quanti turni sono presi adesso. */
  inAvvio: () => number
  /** Quanti aspettano un turno. */
  inCoda: () => number
}

type Orologio = {
  imposta: (f: () => void, ms: number) => unknown
  annulla: (t: unknown) => void
}

const OROLOGIO_VERO: Orologio = {
  imposta: (f, ms) => setTimeout(f, ms),
  annulla: (t) => clearTimeout(t as ReturnType<typeof setTimeout>)
}

export function creaTurni(quanti: number, opzioni: { tettoMs?: number; orologio?: Orologio } = {}): Turni {
  const max = Math.max(1, Math.floor(quanti))
  const tetto = opzioni.tettoMs ?? 60_000
  const orologio = opzioni.orologio ?? OROLOGIO_VERO
  let presi = 0
  const coda: ((rendi: () => void) => void)[] = []

  const assegna = (dai: (rendi: () => void) => void): void => {
    presi += 1
    let reso = false
    const rendi = (): void => {
      if (reso) return
      reso = true
      orologio.annulla(timer)
      presi -= 1
      const prossimo = coda.shift()
      if (prossimo !== undefined) assegna(prossimo)
    }
    const timer = orologio.imposta(rendi, tetto)
    dai(rendi)
  }

  return {
    prendi: () => new Promise((risolvi) => {
      if (presi < max) assegna(risolvi)
      else coda.push(risolvi)
    }),
    inAvvio: () => presi,
    inCoda: () => coda.length
  }
}

/** Quante chat partono insieme: abbastanza da non far aspettare, poche da non soffocare il PC. */
export const CHAT_INSIEME = 3

/** I turni di tutta la finestra: un riquadro e' uno dei tanti. */
export const turniAvvio: Turni = creaTurni(CHAT_INSIEME, { tettoMs: 45_000 })
