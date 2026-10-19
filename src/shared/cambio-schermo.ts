/**
 * **Il workspace sullo schermo cambia solo quando lo sceglie Nicholas** (0.80.0).
 *
 * Nicholas, 19/10: «il workspace sullo schermo cambia da solo». Le strade erano
 * tante e nessuna lasciava una riga nel registro: le consegne di un autopilota
 * portavano la finestra nel workspace della chat dopo 45 s di tastiera ferma,
 * il ponte delle consegne ci tornava quando il riquadro spariva, le aperture e
 * le riprese di una chat ci andavano senza dire perché. Adesso ogni cambio
 * passa da qui: la causa decide se si fa, e ogni decisione va nel registro.
 */
export type CausaCambio =
  /** Un clic o un tasto di Nicholas sul PC (barra, pannello, «Guarda»). */
  | 'nicholas'
  /** Nicholas dal telefono (cambia workspace, crea, elimina). */
  | 'telefono'
  /** Una chat riaperta su richiesta di Nicholas (Riprendi, «Mostra qui», telefono, un altro PC). */
  | 'ripresa'
  /** Il workspace davanti non c'è più (eliminato): si va su quello rimasto. */
  | 'eliminato'
  /** Un autopilota che apre o riprende una sua chat. */
  | 'autopilota'
  /** La consegna di un messaggio di un autopilota a una sua chat. */
  | 'consegna'
  /** Una chat adottata da un autopilota. */
  | 'adozione'

const DA_AUTOPILOTA: ReadonlySet<CausaCambio> = new Set(['autopilota', 'consegna', 'adozione'])

const PAROLE: Record<CausaCambio, string> = {
  nicholas: 'scelto da te sul PC',
  telefono: 'scelto da te dal telefono',
  ripresa: 'una chat riaperta da te',
  eliminato: 'il workspace davanti è stato eliminato',
  autopilota: 'un autopilota apre una sua chat',
  consegna: 'un autopilota scrive a una sua chat',
  adozione: 'un autopilota adotta una chat'
}

/** Vero se la causa viene da un autopilota: allora lo schermo resta dov'è. */
export function causaDaAutopilota(causa: CausaCambio): boolean {
  return DA_AUTOPILOTA.has(causa)
}

/** Le cause che una finestra accetta da fuori: il resto vale come «autopilota». */
export function leggiCausa(raw: unknown, ripiego: CausaCambio): CausaCambio {
  return typeof raw === 'string' && raw in PAROLE ? (raw as CausaCambio) : ripiego
}

export function decidiCambioSchermo(p: { davanti: string | undefined; voluto: string; causa: CausaCambio; dettaglio?: string }): { cambia: boolean; riga: string } {
  const dove = `«${p.davanti ?? '?'}» → «${p.voluto}»`
  const perche = `${PAROLE[p.causa]}${p.dettaglio !== undefined && p.dettaglio !== '' ? `: ${p.dettaglio}` : ''}`
  if (p.davanti === p.voluto) return { cambia: false, riga: `[schermo] resta su «${p.voluto}» (${perche}): è già quello davanti` }
  if (causaDaAutopilota(p.causa)) return { cambia: false, riga: `[schermo] ${dove} rifiutato (${perche}): lo schermo cambia solo quando lo scegli tu` }
  return { cambia: true, riga: `[schermo] ${dove} (${perche})` }
}
