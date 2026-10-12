import type { Salute, VoceSalute } from './salute'
import { stato, type StatoVista } from './stato-vista'

/**
 * La Salute riprogettata (0.70.0): ogni voce con una parola e un colore, i
 * gruppi (Da sistemare · Computer · Drive · Errori · Tutto) e un titolo corto.
 * Prima ogni problema aveva il suo paragrafo e il suo «Cosa fare» sempre a
 * vista, e le cose importanti finivano sotto la mappa dei PC.
 */

export type GruppoSalute = 'sistemare' | 'computer' | 'drive' | 'errori' | 'tutto'

export const GRUPPI_SALUTE: { id: GruppoSalute; testo: string }[] = [
  { id: 'sistemare', testo: 'Da sistemare' },
  { id: 'computer', testo: 'Computer' },
  { id: 'drive', testo: 'Drive' },
  { id: 'errori', testo: 'Errori' },
  { id: 'tutto', testo: 'Tutto' }
]

/** La parola di una voce, dal suo tono e dal suo gruppo. */
export function statoVoce(v: Pick<VoceSalute, 'tono' | 'gruppo' | 'chiave'>): StatoVista {
  if (v.tono === 'ok') return stato('ok', v.gruppo === 'drive' ? 'collegato' : v.gruppo === 'pc' ? 'a posto' : 'a posto', 'verde')
  if (v.gruppo === 'drive') return v.tono === 'guasto' ? stato('scollegato', 'scollegato', 'rosso') : stato('drive', 'da guardare', 'ambra')
  if (v.gruppo === 'aggiornamento') return stato('fallito', 'non installato', 'rosso')
  if (v.gruppo === 'consegne') return stato('persa', 'non partita', 'rosso')
  if (v.chiave.startsWith('chat-errore:')) return stato('ferma', 'ferma', 'rosso')
  if (v.gruppo === 'errori') return stato('errore', 'errore', 'ambra')
  return v.tono === 'guasto' ? stato('guasto', 'da sistemare', 'rosso') : stato('guardare', 'da guardare', 'ambra')
}

export function gruppiVoce(v: Pick<VoceSalute, 'tono' | 'gruppo'>): Exclude<GruppoSalute, 'tutto'>[] {
  const g: Exclude<GruppoSalute, 'tutto'>[] = []
  if (v.tono !== 'ok') g.push('sistemare')
  if (v.gruppo === 'pc') g.push('computer')
  if (v.gruppo === 'drive') g.push('drive')
  if (v.gruppo === 'errori' || v.gruppo === 'consegne' || v.gruppo === 'aggiornamento') g.push('errori')
  return g
}

export function nelGruppoSalute(v: Pick<VoceSalute, 'tono' | 'gruppo'>, g: GruppoSalute): boolean {
  return g === 'tutto' || gruppiVoce(v).includes(g)
}

export function contaGruppiSalute(voci: Pick<VoceSalute, 'tono' | 'gruppo'>[]): Record<GruppoSalute, number> {
  const n: Record<GruppoSalute, number> = { sistemare: 0, computer: 0, drive: 0, errori: 0, tutto: voci.length }
  for (const v of voci) for (const g of gruppiVoce(v)) n[g] += 1
  return n
}

/** Si apre su «Da sistemare» quando c'è qualcosa, se no su «Computer». */
export function gruppoIniziale(s: Pick<Salute, 'voci'> | undefined): GruppoSalute {
  if (s === undefined) return 'sistemare'
  return s.voci.some((v) => v.tono !== 'ok') ? 'sistemare' : 'computer'
}

/** Un titolo corto, al più `max` caratteri, tagliato su una parola. */
export function breve(testo: string, max = 80): string {
  const t = testo.replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  const taglio = t.slice(0, max - 1)
  const spazio = taglio.lastIndexOf(' ')
  return `${(spazio > max * 0.6 ? taglio.slice(0, spazio) : taglio).trimEnd()}…`
}

/** Il PC mette parola e titolo corto su ogni voce: pagina e app li disegnano. */
export function conVistaSalute<S extends Salute>(s: S): S & { voci: Array<VoceSalute & { stato: StatoVista; breve: string }> } {
  return { ...s, voci: s.voci.map((v) => ({ ...v, stato: statoVoce(v), breve: breve(v.titolo) })) }
}
