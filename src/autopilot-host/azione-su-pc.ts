import { capacitaRichiesta, validaAzione, type AzionePc, type RisultatoAzione } from '../shared/azione-pc'
import type { CapacitaPc } from '../shared/capacita-pc'
import { valutaPrimaDiAffidare, type CandidatoPc, type RequisitiCompito } from './affida-valuta'

/**
 * Lo strumento `azione_su_pc` dell'autopilota e degli specialisti (k-166n10):
 * una sola azione dell'elenco chiuso (`shared/azione-pc.ts`) su un altro PC,
 * scelto dal programma fra quelli accesi e capaci (battito). Mai un'eccezione:
 * il risultato, o il motivo del no in italiano.
 */

export type DipendenzeAzioneSuPc = {
  /** Gli altri PC della rete, come dal battito (capacità e stato). */
  candidati: () => readonly CandidatoPc[] | Promise<readonly CandidatoPc[]>
  /** Chiede l'azione a quel PC (`chiediAzionePc` sul client verso gli altri PC). */
  chiedi: (pcId: string, azione: AzionePc, opz: { capacitaDi?: CapacitaPc | undefined }) => Promise<RisultatoAzione>
  adesso: () => number
}

export type EsitoAzioneSuPc = { ok: true; testo: string } | { ok: false; motivo: string }

/** Cosa deve avere il PC, per la valutazione. */
export function requisitiAzione(a: AzionePc): RequisitiCompito | undefined {
  const c = capacitaRichiesta(a)
  if (c === undefined) return undefined
  return c === 'telefono' ? { telefono: true } : { programmi: [c] }
}

/** Il risultato di un'azione, detto a parole per chi lo legge nella chat. */
export function raccontaRisultato(a: AzionePc, pc: string, valore: unknown): string {
  const v = (typeof valore === 'object' && valore !== null ? valore : {}) as Record<string, unknown>
  switch (a.tipo) {
    case 'stato-programma': return `${pc}: «${a.programma}» ${v.installato === true ? 'è installato' : 'non è installato'}.`
    case 'versione-programma': return `${pc}: «${a.programma}» è alla versione ${typeof v.versione === 'string' ? v.versione : 'sconosciuta'}.`
    case 'raggiungibile': return `${pc}: ${a.host}:${a.porta} ${v.raggiungibile === true ? `è raggiungibile (${typeof v.ms === 'number' ? v.ms : '?'} ms)` : 'non è raggiungibile'}.`
    case 'manda-file-telefono': return `${pc}: il file è in coda verso il telefono (${typeof v.stato === 'string' ? v.stato : 'in attesa'}); parte solo con la conferma di chi sta a quel PC.`
  }
}

export async function azioneSuPc(d: DipendenzeAzioneSuPc, arg: unknown): Promise<EsitoAzioneSuPc> {
  const v = validaAzione(arg)
  if (!v.ok) return { ok: false, motivo: v.motivo }
  const a = v.azione
  let candidati: readonly CandidatoPc[]
  try { candidati = await d.candidati() } catch { return { ok: false, motivo: 'non riesco a leggere l’elenco degli altri PC: riprova fra poco.' } }
  // I posti per i lavori qui non contano: un'azione singola non occupa uno specialista.
  const valutazione = valutaPrimaDiAffidare(requisitiAzione(a), candidati.map((c) => ({ ...c, liberi: 1 })), d.adesso())
  if (valutazione.tipo === 'resta-qui') {
    return { ok: false, motivo: `nessun PC può fare questa azione: ${valutazione.motivo.replace(/: il compito resta qui$/u, '')}.` }
  }
  const pc = valutazione.pc
  const r = await d.chiedi(pc.pcId, a, { capacitaDi: pc.capacita }).catch((err: unknown): RisultatoAzione => ({ ok: false, motivo: `l’azione è fallita: ${err instanceof Error ? err.message : String(err)}`.slice(0, 300) }))
  return r.ok ? { ok: true, testo: raccontaRisultato(a, pc.nome, r.valore) } : { ok: false, motivo: `${pc.nome}: ${r.motivo}` }
}
