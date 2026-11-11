/**
 * **Il diario del telefono** (11/11, `POST /api/telefono/diario`). L'app tiene
 * i suoi tentativi di collegamento (strada, esito, tempo) e li manda al PC
 * appena si ricollega: così un «non trova il PC sul wifi» lascia traccia nel
 * registro del PC, anche se dal PC non si è visto arrivare niente.
 *
 * Nel registro va una riga per tentativo fallito, saltato o estraneo, e una
 * riga di riassunto. Nessuna chiave viaggia nel diario.
 */
export type RigaDiario = { quando: number; pc: string; strada: string; esito: string; ms: number; motivo?: string }

const STRADE = new Set(['casa', 'tailscale', 'ponte'])
const ESITI = new Set(['riuscito', 'fallito', 'saltato', 'estraneo', 'non-mi-conosce'])
/** Quante righe al massimo per una chiamata: il diario dell'app ne tiene 200. */
export const RIGHE_DIARIO_MAX = 200

const corto = (t: unknown, n: number): string => String(t ?? '').replace(/[\r\n\t]+/gu, ' ').slice(0, n)

export function leggiDiario(corpo: unknown): RigaDiario[] {
  const righe = (corpo as { righe?: unknown } | undefined)?.righe
  if (!Array.isArray(righe)) return []
  const fuori: RigaDiario[] = []
  for (const r of righe.slice(-RIGHE_DIARIO_MAX)) {
    if (typeof r !== 'object' || r === null) continue
    const x = r as Record<string, unknown>
    if (typeof x.quando !== 'number' || !Number.isFinite(x.quando)) continue
    if (typeof x.strada !== 'string' || !STRADE.has(x.strada)) continue
    if (typeof x.esito !== 'string' || !ESITI.has(x.esito)) continue
    fuori.push({
      quando: x.quando, pc: corto(x.pc, 40), strada: x.strada, esito: x.esito,
      ms: typeof x.ms === 'number' && Number.isFinite(x.ms) ? Math.max(0, Math.round(x.ms)) : 0,
      ...(typeof x.motivo === 'string' && x.motivo.trim() !== '' ? { motivo: corto(x.motivo, 160) } : {})
    })
  }
  return fuori
}

/** Le righe per il registro del PC: i tentativi non riusciti uno per uno, poi il conto. */
export function righeDelDiario(righe: readonly RigaDiario[]): string[] {
  if (righe.length === 0) return []
  const out: string[] = []
  for (const r of righe) {
    if (r.esito === 'riuscito') continue
    out.push(`[telefono] ${new Date(r.quando).toISOString()} ${r.strada}: ${r.esito} in ${r.ms} ms${r.motivo !== undefined ? ` (${r.motivo})` : ''}`)
  }
  const riusciti = righe.filter((r) => r.esito === 'riuscito').length
  out.push(`[telefono] diario: ${righe.length} tentativi, ${riusciti} riusciti, ${righe.length - riusciti} no`)
  return out
}

export function riceviDiario(corpo: unknown, scrivi: (riga: string) => void = (r) => console.info(r)): { stato: number; corpo: unknown } {
  const righe = leggiDiario(corpo)
  for (const r of righeDelDiario(righe)) scrivi(r)
  return { stato: 200, corpo: { ricevute: righe.length } }
}
