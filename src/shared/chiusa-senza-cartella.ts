/**
 * Una chat chiusa con la cartella cancellata non si riavvia (0.84.1).
 *
 * Il 21-22/10 la chat di un agente finito (la sua copia di lavoro tolta dopo
 * l'unione) era rimasta nel layout salvato di un workspace: ogni volta che
 * Nicholas passava a quel workspace il riquadro provava a farla partire nella
 * cartella che non c'era più, e il registro riempiva righe rosse
 * («cwd non accessibile», 18 volte in un giorno). Una chat chiusa da te, finita
 * o nel recupero, con la cartella sparita, non ha niente da riprendere qui: il
 * riquadro si toglie, la conversazione resta dov'è (fra le chiuse o nel
 * recupero, da cui si rimette con un tocco).
 *
 * Una chat **non** chiusa con la cartella sparita resta com'era: la diagnosi
 * «La cartella di questa chat qui non c'è più» con «Scegli la cartella».
 */

export const PREFISSO_CHIUSA_SENZA_CARTELLA = 'CHAT_CHIUSA_SENZA_CARTELLA:'

export type ChiusaSenzaCartella = { sessionUuid: string; cwd: string; perche: string }

/** Perche' non si avvia, oppure `undefined`: si avvia (o si fa la diagnosi di sempre). */
export function motivoChiusaSenzaCartella(s: {
  cartellaEsiste: boolean
  /** Fra le chiuse da te (la ×, «Chiudi», l'agente finito). */
  chiusa: boolean
  /** Nel recupero di 30 giorni. */
  nelRecupero: boolean
  /** La chat di un autopilota che ha finito il suo compito (il caso vero del 21/10: c-34). */
  finitaDiAutopilota: boolean
}): string | undefined {
  if (s.cartellaEsiste) return undefined
  if (s.nelRecupero) return 'è nel recupero e la sua cartella non c’è più'
  if (s.finitaDiAutopilota) return 'aveva finito il suo compito e la sua copia di lavoro è stata tolta'
  if (s.chiusa) return 'era chiusa e la sua cartella non c’è più'
  return undefined
}

/** La chat di quella sessione e' una chat finita di un autopilota? Dall'elenco del servizio. */
export function eFinitaDiAutopilota(
  autopiloti: readonly { chats?: readonly { sessionId?: string; stato?: string }[] }[],
  sessione: string
): boolean {
  return autopiloti.some((a) => (a.chats ?? []).some((c) => c.sessionId === sessione && c.stato === 'finita'))
}

export function messaggioChiusaSenzaCartella(c: ChiusaSenzaCartella): string {
  return PREFISSO_CHIUSA_SENZA_CARTELLA + JSON.stringify(c)
}

/** Da un errore qualunque (anche quello di un invoke Electron) al caso, se e' questo. */
export function leggiChiusaSenzaCartella(err: unknown): ChiusaSenzaCartella | undefined {
  const testo = err instanceof Error ? err.message : typeof err === 'string' ? err : ''
  const i = testo.indexOf(PREFISSO_CHIUSA_SENZA_CARTELLA)
  if (i < 0) return undefined
  try {
    const o = JSON.parse(testo.slice(i + PREFISSO_CHIUSA_SENZA_CARTELLA.length)) as Partial<ChiusaSenzaCartella>
    if (typeof o.sessionUuid !== 'string' || typeof o.cwd !== 'string') return undefined
    return { sessionUuid: o.sessionUuid, cwd: o.cwd, perche: typeof o.perche === 'string' ? o.perche : '' }
  } catch { return undefined }
}
