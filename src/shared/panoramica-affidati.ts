import type { VistaOrchestratore } from './piano-orchestratore'
import { RUOLI, RUOLI_ORDINE, type Ruolo } from './ruoli-agenti'

/**
 * k-s3: i lavori affidati a un altro PC («Aiuta la rete») e gli specialisti di un
 * workspace di un altro PC non hanno riquadro né chat qui: la Panoramica li
 * prende dalla vista dell'autopilota (la stessa della colonna degli specialisti),
 * come schede «al lavoro» con «su NOME-PC».
 */

type Spec = VistaOrchestratore['specialisti'][number]

/** La scheda minima: la Panoramica la completa con i campi che le servono. */
export type SchedaAffidata = {
  id: string
  titolo: string
  stato: 'lavora'
  nataIl: number
  ruolo?: Ruolo
  nomeRuolo?: string
  coloreRuolo?: string
  ultimaAzione: string
  righe: string[]
  suPc: string
  specialista: true
}

const alLavoro = (s: Spec): boolean => s.stato === 'lavoro' || s.stato === 'avviato'
const numero = (id: string): number => Number(/(\d+)$/.exec(id)?.[1] ?? 0)

/**
 * Pura: le schede dei lavori che girano su un altro PC. In un workspace di qui
 * contano solo gli specialisti con `pc`; in uno di un altro PC (`pcDelWorkspace`)
 * ogni specialista al lavoro è di là. Una vista di un altro workspace non dà niente.
 */
export function schedeAffidate(v: VistaOrchestratore | undefined, workspace: string, pcDelWorkspace?: string): SchedaAffidata[] {
  if (v === undefined) return []
  if (typeof v.workspace === 'string' && v.workspace.trim() !== workspace.trim()) return []
  const fuori: SchedaAffidata[] = []
  for (const s of v.specialisti ?? []) {
    const pc = s.pc ?? pcDelWorkspace
    if (pc === undefined || s.adottata === true || !alLavoro(s)) continue
    const ruolo = RUOLI_ORDINE.find((k) => RUOLI[k].nome === s.ruolo)
    fuori.push({
      id: `affidato-${s.id}`, titolo: s.compito, stato: 'lavora', nataIl: numero(s.id), specialista: true, suPc: pc,
      ...(ruolo !== undefined ? { ruolo, nomeRuolo: RUOLI[ruolo].nome, coloreRuolo: RUOLI[ruolo].colore } : {}),
      ultimaAzione: s.attivita ?? '', righe: []
    })
  }
  return fuori
}
