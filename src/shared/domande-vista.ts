import type { Conversazione } from './domande-conversazioni'
import { stato, type StatoVista } from './stato-vista'

/**
 * Le Domande riprogettate (0.70.0). Prima le chat che avevano solo finito il
 * turno stavano mescolate alle domande vere, tutte con lo stesso pallino: tre
 * «aspettano» si perdevano fra cinque righe. Adesso ogni conversazione ha un
 * tipo in una parola, e il filtro di partenza è «Aspettano te».
 */

export type TipoDomanda = 'permesso' | 'scelta' | 'domanda' | 'autopilota' | 'finito'

/** Le righe che dicono «ti chiedo un permesso» (Claude Code, in inglese). */
const PERMESSO = /(do you want to|allow|permission|trust this folder|bypass permissions|proceed\?|run this command|make this edit)/i

const ORDINE: Record<TipoDomanda, number> = { permesso: 0, scelta: 1, domanda: 2, autopilota: 3, finito: 4 }

export function tipoDomanda(c: Pick<Conversazione, 'tipo' | 'chiede' | 'scelte' | 'messaggi'>): StatoVista & { id: TipoDomanda } {
  if (c.tipo === 'autopilota') return { ...stato('autopilota', 'autopilota', 'blu'), id: 'autopilota' }
  if (c.scelte !== undefined) {
    const testo = c.messaggi.slice(-2).map((m) => m.testo).join('\n')
    return PERMESSO.test(testo) ? { ...stato('permesso', 'permesso', 'rosso'), id: 'permesso' } : { ...stato('scelta', 'scelta', 'ambra'), id: 'scelta' }
  }
  if (c.chiede) return { ...stato('domanda', 'domanda', 'ambra'), id: 'domanda' }
  return { ...stato('finito', 'ha finito', 'quieto'), id: 'finito' }
}

/** Aspetta davvero te: tutto tranne le chat che hanno solo finito il turno. */
export function aspettaTe(c: Pick<Conversazione, 'tipo' | 'chiede' | 'scelte' | 'messaggi'>): boolean {
  return tipoDomanda(c).id !== 'finito'
}

/** Prima i permessi, poi le scelte, le domande, gli autopiloti; le finite in fondo. Stabile. */
export function ordinaDomande<T extends Pick<Conversazione, 'tipo' | 'chiede' | 'scelte' | 'messaggi'>>(c: T[]): T[] {
  return c.map((x, i) => ({ x, i })).sort((a, b) => ORDINE[tipoDomanda(a.x).id] - ORDINE[tipoDomanda(b.x).id] || a.i - b.i).map((v) => v.x)
}

/** Dopo una risposta, la prossima che aspetta te (non quella appena risposta). */
export function prossimaDomanda<T extends Pick<Conversazione, 'chiave' | 'tipo' | 'chiede' | 'scelte' | 'messaggi'>>(c: T[], risposta: string): string | undefined {
  return ordinaDomande(c).find((x) => x.chiave !== risposta && aspettaTe(x))?.chiave
}

/** I messaggi da mostrare: gli ultimi, più quanti ne restano nascosti («2 risposte prima ▾»). */
export function messaggiInVista<T>(messaggi: T[], tutti: boolean, quanti = 4): { vista: T[]; nascosti: number } {
  if (tutti || messaggi.length <= quanti) return { vista: messaggi, nascosti: 0 }
  return { vista: messaggi.slice(-quanti), nascosti: messaggi.length - quanti }
}
