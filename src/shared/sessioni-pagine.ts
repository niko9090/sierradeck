/**
 * `/api/sessioni` a pagine e con la ricerca (m-collegamento).
 *
 * L'elenco «Riprendi» del telefono dava le prime 30 conversazioni su circa
 * 1500, senza modo di arrivare alle altre. Adesso `pagina` (da 0) sfoglia,
 * `cerca` filtra per titolo, cartella o id: tutte le parole, senza badare a
 * maiuscole e accenti. Senza i due parametri la risposta è quella di prima
 * (la prima pagina), più il conto per chi lo vuole leggere.
 */

export const SESSIONI_PER_PAGINA = 30
const CERCA_MAX = 200

export type RichiestaSessioni = { pagina: number; cerca: string }

/** Dal corpo (che passa intatto dal ponte) o dai parametri dell'indirizzo. */
export function leggiRichiestaSessioni(corpo: unknown, cerca?: URLSearchParams): RichiestaSessioni {
  const c = typeof corpo === 'object' && corpo !== null ? (corpo as Record<string, unknown>) : {}
  const p = c.pagina !== undefined ? c.pagina : cerca?.get('pagina') ?? undefined
  const n = typeof p === 'number' ? p : typeof p === 'string' && /^\d{1,6}$/.test(p.trim()) ? Number(p) : 0
  const t = c.cerca !== undefined ? c.cerca : cerca?.get('cerca') ?? ''
  return { pagina: Number.isInteger(n) && n >= 0 ? n : 0, cerca: typeof t === 'string' ? t.trim().slice(0, CERCA_MAX) : '' }
}

/** Minuscolo e senza accenti: «Perché» si trova scrivendo «perche». */
function piano(testo: string): string {
  return testo.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/** Le sessioni che hanno tutte le parole cercate nel titolo, nella cartella o nell'id. */
export function filtraSessioni<T extends { id: string; titolo: string; cwd: string }>(tutte: T[], cerca: string): T[] {
  const parole = piano(cerca).split(/\s+/).filter((p) => p !== '')
  if (parole.length === 0) return tutte
  return tutte.filter((s) => {
    const dove = piano(`${s.titolo} ${s.cwd} ${s.id}`)
    return parole.every((p) => dove.includes(p))
  })
}

export type PaginaSessioni<T> = { voci: T[]; conto: { totale: number; pagina: number; pagine: number; altre: boolean } }

/** Una pagina dell'elenco già filtrato, con il conto. Una pagina oltre la fine è vuota. */
export function paginaDi<T>(elenco: T[], pagina: number, perPagina = SESSIONI_PER_PAGINA): PaginaSessioni<T> {
  const inizio = pagina * perPagina
  return {
    voci: elenco.slice(inizio, inizio + perPagina),
    conto: { totale: elenco.length, pagina, pagine: Math.ceil(elenco.length / perPagina), altre: inizio + perPagina < elenco.length }
  }
}
