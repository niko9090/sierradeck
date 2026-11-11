/**
 * `/api/storia`: la cronologia di una chat, anche a incrementi (m-collegamento).
 *
 * L'app la rilegge ogni due secondi mentre una chat è aperta, e ogni volta
 * riceveva tutta la finestra, due volte (`righe` ripulite e `grezze` con i
 * colori). Adesso può chiedere solo quello che non ha:
 *
 * - `dopo: N` (numero assoluto di riga, quello di `da`): solo le righe con
 *   numero più grande di N. Se dopo N ce ne sono più di `tetto`, arrivano le
 *   ultime `tetto` e `da` dice da dove partono (più grande di N + 1 = un salto).
 *   ATTENZIONE: lo schermo in fondo si ridisegna (la chat scrive, il riquadro
 *   delle scelte compare e sparisce): l'app chieda con un margine, per esempio
 *   `dopo` = la sua ultima riga meno 80, e sostituisca da `da` in poi.
 * - `grezze: 1`: anche le righe con i colori. Senza, nella forma nuova non
 *   arrivano.
 * - `tetto` nella risposta: quante righe al più dà una finestra.
 *
 * Senza `dopo` e senza `grezze` la risposta è quella di sempre (con `righe` e
 * `grezze`), più `tetto`: le app di prima non si accorgono di niente.
 *
 * Il tetto è 600 come le richieste dell'app 2.99.0: il PC ne dava 400, e al
 * terzo «più sopra» l'app chiedeva 600, riceveva la stessa finestra di prima e
 * restava su «Risalgo…» per sempre.
 */

/** Quante righe al più dà una finestra della cronologia. */
export const RIGHE_STORIA_MAX = 600
/** Quante righe di serie, se la richiesta non lo dice: come prima. */
export const RIGHE_STORIA_PREDEFINITE = 120

export type RichiestaStoria = {
  /** L'indice della prima riga da dare; -1 = le ultime `quante`. */
  da: number
  quante: number
  /** Solo le righe dopo questa (forma nuova). */
  dopo?: number
  /** Anche le righe con i colori. */
  grezze: boolean
  /** È la forma nuova (c'è `dopo` o `grezze`): niente `grezze` se non chieste. */
  nuova: boolean
}

function intero(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^-?\d{1,9}$/.test(v.trim()) ? Number(v) : Number.NaN
  return Number.isInteger(n) ? n : undefined
}

function vero(v: unknown): boolean {
  return v === true || v === 1 || v === '1' || v === 'true'
}

/** Dal corpo (che passa intatto anche dal ponte) o dai parametri dell'indirizzo. */
export function leggiRichiestaStoria(corpo: unknown, cerca?: URLSearchParams): RichiestaStoria {
  const c = typeof corpo === 'object' && corpo !== null ? (corpo as Record<string, unknown>) : {}
  const prendi = (k: string): unknown => (c[k] !== undefined ? c[k] : cerca?.get(k) ?? undefined)
  const dopo = intero(prendi('dopo'))
  const grezzeChieste = prendi('grezze')
  const nuova = (dopo !== undefined && dopo >= -1) || grezzeChieste !== undefined
  const quante = Math.max(1, Math.min(intero(prendi('quante')) ?? RIGHE_STORIA_PREDEFINITE, RIGHE_STORIA_MAX))
  if (dopo !== undefined && dopo >= -1) {
    // Le ultime righe, poi si tiene solo quello che viene dopo `dopo`.
    return { da: -1, quante: RIGHE_STORIA_MAX, dopo, grezze: vero(grezzeChieste), nuova: true }
  }
  return { da: intero(prendi('da')) ?? -1, quante, grezze: nuova ? vero(grezzeChieste) : true, nuova }
}

export type FinestraStoria = { totale: number; da: number; pulite: string[]; grezze: string[]; continua?: boolean[]; colonne?: number }

/**
 * La risposta, dalla finestra letta (o dal ripiego dell'elenco). `scelte` le
 * mette chi chiama: si leggono sempre dallo schermo di adesso.
 */
export function rispostaStoria(chat: string, f: FinestraStoria, r: RichiestaStoria): Record<string, unknown> {
  let { da, pulite, grezze } = f
  let continua = f.continua
  if (r.dopo !== undefined) {
    const salta = Math.max(0, Math.min(pulite.length, r.dopo + 1 - da))
    pulite = pulite.slice(salta)
    grezze = grezze.slice(salta)
    continua = continua?.slice(salta)
    da += salta
  }
  return {
    chat,
    totale: f.totale,
    da,
    righe: pulite,
    ...(r.grezze ? { grezze } : {}),
    ...(continua !== undefined && continua.length > 0 ? { continua } : {}),
    ...(f.colonne !== undefined ? { colonne: f.colonne } : {}),
    tetto: RIGHE_STORIA_MAX
  }
}
