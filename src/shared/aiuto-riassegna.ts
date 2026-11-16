import { causaRiassegnabile, fraseCausa, motivoBreve, type CausaFallimento } from './aiuto-esito'
import type { Aiutante } from './aiuto-rete'
import type { Risorsa } from './aiuto-risorse'
import type { EventoAiuto } from './eventi-aiuto'

/**
 * **Cambiare PC quando quello scelto non riesce ad agire** (16/11).
 *
 * Un lavoro affidato a un altro PC che fallisce per colpa del PC (risorsa
 * mancante o non raggiungibile, rete, PC in silenzio) passa a un altro PC della
 * rete con posti liberi, al più `MAX_RIASSEGNAZIONI` volte; poi resta fallito
 * con il motivo chiaro. Un fallimento del lavoro stesso (prove rosse, errore
 * nel codice) non si riassegna. I PC già provati per quel lavoro non tornano.
 *
 * Tutto puro: lo spedizioniere dà i fatti, qui si decide.
 */

export const MAX_RIASSEGNAZIONI = 2

export type MossaRiassegna =
  | { tipo: 'riassegna'; a: Aiutante }
  | { tipo: 'resta-fallito'; motivo: string; /** true se va scritto «arreso» nel registro (c'era una causa del PC). */ arreso: boolean }

export type DatiRiassegna = {
  causa: CausaFallimento
  /** Quante volte il lavoro è già passato di mano. */
  riassegnazioni: number
  /** I PC già provati per questo lavoro, compreso quello che ha appena fallito. */
  provati: readonly string[]
  /** Gli altri PC con i posti (come li ha detti `aggiornaPosti`). */
  aiutanti: readonly Aiutante[]
  /** I PC messi «fuori» fino a un certo istante (ms), e l'istante di adesso. */
  fuori?: ReadonlyMap<string, number>
  adesso?: number
}

/** Chi riceve: libero, mai provato, non fuori; gli Aiutanti dedicati prima, poi chi ha più posti. */
export function scegliAltroPc(d: Pick<DatiRiassegna, 'aiutanti' | 'provati' | 'fuori' | 'adesso'>): Aiutante | undefined {
  const ora = d.adesso ?? Date.now()
  return d.aiutanti
    .filter((a) => a.liberi > 0 && !d.provati.includes(a.pcId) && (d.fuori?.get(a.pcId) ?? 0) <= ora)
    .sort((a, b) => Number(b.programma === 'aiutante') - Number(a.programma === 'aiutante') || b.liberi - a.liberi || a.pcId.localeCompare(b.pcId))[0]
}

export function decidiRiassegna(d: DatiRiassegna): MossaRiassegna {
  if (!causaRiassegnabile(d.causa)) return { tipo: 'resta-fallito', motivo: fraseCausa(d.causa), arreso: false }
  if (d.riassegnazioni >= MAX_RIASSEGNAZIONI) {
    return { tipo: 'resta-fallito', motivo: `già passato di mano ${MAX_RIASSEGNAZIONI} volte: ${fraseCausa(d.causa)}`, arreso: true }
  }
  const a = scegliAltroPc(d)
  if (a === undefined) return { tipo: 'resta-fallito', motivo: `nessun altro PC con posti liberi: ${fraseCausa(d.causa)}`, arreso: true }
  return { tipo: 'riassegna', a }
}

/** La riga del registro «Passaggi di mano» per una riassegnazione. */
export function eventoRiassegnato(p: { quando: string; lavoroId: string; compito: string; daPc: string; aPc: string; motivo: string; causa: CausaFallimento }): EventoAiuto {
  return {
    quando: p.quando, lavoroId: p.lavoroId, compito: p.compito, daPc: p.daPc, aPc: p.aPc, tipo: 'riassegnato',
    motivo: motivoBreve(p.motivo),
    ...(p.causa === 'risorsa' ? { risorsa: 'una risorsa del lavoro' } : {})
  }
}

type BaseEvento = { quando: string; lavoroId: string; compito: string; daPc: string; aPc: string }

/** La riga per un lavoro mandato a un altro PC. */
export function eventoAffidato(p: BaseEvento): EventoAiuto {
  return { quando: p.quando, lavoroId: p.lavoroId, compito: p.compito, daPc: p.daPc, aPc: p.aPc, tipo: 'affidato', motivo: `mandato a ${p.aPc}` }
}

/** La riga per un PC che rifiuta il lavoro (niente posto, niente accesso a Claude, versione diversa…). */
export function eventoRifiutato(p: BaseEvento & { motivo: string }): EventoAiuto {
  return { quando: p.quando, lavoroId: p.lavoroId, compito: p.compito, daPc: p.daPc, aPc: p.aPc, tipo: 'rifiutato', motivo: motivoBreve(p.motivo) }
}

/**
 * Le risorse mancanti, da scrivere nella riga. Solo le dichiarate esplicitamente sono indispensabili
 * (un percorso ricavato dal testo è solo informativo): si cercano nel motivo; se nessuna c'è, il testo del motivo.
 */
export function risorseMancantiDelMotivo(motivo: string, dichiarate: readonly Risorsa[] = []): string {
  const nominate = dichiarate.filter((r) => r.indispensabile !== false && motivo.toLowerCase().includes(r.valore.toLowerCase())).map((r) => r.valore)
  if (nominate.length > 0) return nominate.join(', ').slice(0, 300)
  const i = motivo.indexOf(' — ')
  return (i >= 0 ? motivo.slice(i + 3) : 'una risorsa del lavoro').slice(0, 300)
}

/** La riga per un PC a cui manca una risorsa dichiarata indispensabile (rete, cartella, programma). */
export function eventoRisorsaMancante(p: BaseEvento & { motivo: string; dichiarate?: readonly Risorsa[] }): EventoAiuto {
  return {
    quando: p.quando, lavoroId: p.lavoroId, compito: p.compito, daPc: p.daPc, aPc: p.aPc, tipo: 'risorsa-mancante',
    motivo: motivoBreve(p.motivo),
    risorsa: risorseMancantiDelMotivo(p.motivo, p.dichiarate)
  }
}

/** La riga per un lavoro che resta fallito dopo i tentativi. */
export function eventoArreso(p: { quando: string; lavoroId: string; compito: string; daPc: string; motivo: string }): EventoAiuto {
  return { quando: p.quando, lavoroId: p.lavoroId, compito: p.compito, daPc: p.daPc, aPc: p.daPc, tipo: 'arreso', motivo: motivoBreve(p.motivo) }
}
