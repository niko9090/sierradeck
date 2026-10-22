import type { Conversazione } from './domande-conversazioni'
import { stato, type StatoVista } from './stato-vista'

/**
 * Le Domande riprogettate (0.70.0). Prima le chat che avevano solo finito il
 * turno stavano mescolate alle domande vere, tutte con lo stesso pallino: tre
 * «aspettano» si perdevano fra cinque righe. Adesso ogni conversazione ha un
 * tipo in una parola, e il filtro di partenza è «Aspettano te».
 */

export type TipoDomanda = 'permesso' | 'scelta' | 'domanda' | 'autopilota' | 'risposta' | 'finito'

/** Le righe che dicono «ti chiedo un permesso» (Claude Code, in inglese). */
const PERMESSO = /(do you want to|allow|permission|trust this folder|bypass permissions|proceed\?|run this command|make this edit)/i

const ORDINE: Record<TipoDomanda, number> = { permesso: 0, scelta: 1, domanda: 2, autopilota: 3, risposta: 4, finito: 5 }

export function tipoDomanda(c: Pick<Conversazione, 'tipo' | 'chiede' | 'scelte' | 'messaggi'> & Partial<Pick<Conversazione, 'scheda'>>): StatoVista & { id: TipoDomanda } {
  // Una domanda della sua chat chiusa perché non serve più (0.84.1): nessuno ha risposto.
  if (c.tipo === 'autopilota' && !c.chiede && c.scheda?.superata !== undefined) return { ...stato('risposta', 'non serve più', 'quieto'), id: 'risposta' }
  // Senza la scheda, dall'ultimo messaggio della conversazione (collaudo 0.84.0).
  if (c.tipo === 'autopilota' && !c.chiede && c.messaggi.at(-1)?.testo.startsWith('chiusa senza risposta, non serve più') === true) return { ...stato('risposta', 'non serve più', 'quieto'), id: 'risposta' }
  // Una domanda della sua chat a cui ha risposto lui (0.71.1): si vede, non aspetta te.
  if (c.tipo === 'autopilota' && !c.chiede) return { ...stato('risposta', 'risposta dall’autopilota', 'blu'), id: 'risposta' }
  if (c.tipo === 'autopilota') return { ...stato('autopilota', 'autopilota', 'blu'), id: 'autopilota' }
  if (c.scelte !== undefined) {
    const testo = c.messaggi.slice(-2).map((m) => m.testo).join('\n')
    return PERMESSO.test(testo) ? { ...stato('permesso', 'permesso', 'rosso'), id: 'permesso' } : { ...stato('scelta', 'scelta', 'ambra'), id: 'scelta' }
  }
  if (c.chiede) return { ...stato('domanda', 'domanda', 'ambra'), id: 'domanda' }
  return { ...stato('finito', 'ha finito', 'quieto'), id: 'finito' }
}

/**
 * Sta in «Aspettano te»: tutto tranne le chat che hanno solo finito il turno.
 * Le risposte date dall'autopilota (0.71.1) ci stanno: sono domande, e
 * Nicholas le vuole vedere; non contano nel numero (`chiede` è falso).
 */
export function aspettaTe(c: Pick<Conversazione, 'tipo' | 'chiede' | 'scelte' | 'messaggi'>): boolean {
  return tipoDomanda(c).id !== 'finito'
}

/**
 * Il numero di «Aspettano te» (0.73.1): solo chi aspetta davvero una tua
 * risposta. Le domande a cui ha già risposto l'autopilota stanno nella lista
 * ma non nel numero, come diceva la 0.71.1: il 15/10 la linguetta ambra
 * diceva «Aspettano te 2» con due risposte già date e niente da fare.
 */
export function contaAspettanoTe(c: Pick<Conversazione, 'tipo' | 'chiede' | 'scelte' | 'messaggi'>[]): number {
  return c.filter((x) => { const id = tipoDomanda(x).id; return id !== 'finito' && id !== 'risposta' }).length
}

/** Prima i permessi, poi le scelte, le domande, gli autopiloti; le finite in fondo. Stabile. */
export function ordinaDomande<T extends Pick<Conversazione, 'tipo' | 'chiede' | 'scelte' | 'messaggi'>>(c: T[]): T[] {
  return c.map((x, i) => ({ x, i })).sort((a, b) => ORDINE[tipoDomanda(a.x).id] - ORDINE[tipoDomanda(b.x).id] || a.i - b.i).map((v) => v.x)
}

/** Dopo una risposta, la prossima che aspetta te (non quella appena risposta). */
export function prossimaDomanda<T extends Pick<Conversazione, 'chiave' | 'tipo' | 'chiede' | 'scelte' | 'messaggi'>>(c: T[], risposta: string): string | undefined {
  return ordinaDomande(c).find((x) => x.chiave !== risposta && x.chiede)?.chiave
}

/** I messaggi da mostrare: gli ultimi, più quanti ne restano nascosti («2 risposte prima ▾»). */
export function messaggiInVista<T>(messaggi: T[], tutti: boolean, quanti = 4): { vista: T[]; nascosti: number } {
  if (tutti || messaggi.length <= quanti) return { vista: messaggi, nascosti: 0 }
  return { vista: messaggi.slice(-quanti), nascosti: messaggi.length - quanti }
}
