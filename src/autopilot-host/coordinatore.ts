import type { ChatGovernata } from '@shared/autopilota'
import type { Freno, LimitiPiano } from '@shared/harness'
import { dentro } from './divieti'

/**
 * Il coordinatore (T1, T5): quello che l'autopilota sa del programma, e le
 * regole pure con cui guida le sue sotto-chat.
 */

// ─── T1: lo stato del programma, in sola lettura ─────────────────────────

/**
 * L'estratto che il Gestore spinge al servizio ogni pochi secondi
 * (`POST /stato-programma`). Solo lettura: l'autopilota lo usa per decidere,
 * non per comandare. Ogni campo e' facoltativo: un Gestore piu' vecchio non lo
 * manda, e il servizio lavora come prima.
 */
export type StatoProgramma = {
  /** Quando il Gestore l'ha composto (ms). */
  letto: number
  /** Tutte le chat aperte, anche quelle di Nicholas. */
  chat: { titolo: string; cwd: string; stato: string; governata: boolean }[]
  /** I limiti del piano dall'ultima riga di stato (`/api/polso`). */
  limiti?: LimitiPiano
  /** Quante cose aspettano gia' Nicholas nella scheda Domande. */
  domandeAperte: number
  /**
   * I progetti con la loro coda condivisa e chi li ha in mano. `percorso` e' la
   * loro cartella su questo PC: serve a sapere se un autopilota lavora dentro
   * un progetto sul Drive.
   */
  progetti: { nome: string; chi: string; pcNome?: string; inCoda: number; percorso?: string }[]
  /**
   * La sincronizzazione con il Drive di SierraDeck e' accesa: Drive connesso,
   * cassaforte aperta, salvataggio automatico acceso (0.36.0).
   */
  driveAttivo?: boolean
  /** Gli altri PC sul Drive: acceso o no. */
  altriPc: { nome: string; vivo: boolean }[]
  /** Il workspace davanti. */
  workspace?: string
}

export function leggiStatoProgramma(raw: unknown, adesso: number): StatoProgramma | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const o = raw as Record<string, unknown>
  const lista = <T>(v: unknown, f: (x: Record<string, unknown>) => T | undefined): T[] =>
    Array.isArray(v) ? v.flatMap((x) => (typeof x === 'object' && x !== null ? (f(x as Record<string, unknown>) ?? []) : [])) as T[] : []
  const s = (v: unknown): string => (typeof v === 'string' ? v : '')
  const finestra = (v: unknown): { percento: number; resettaIl?: number } | undefined => {
    if (typeof v !== 'object' || v === null) return undefined
    const f = v as Record<string, unknown>
    if (typeof f.percento !== 'number') return undefined
    return { percento: f.percento, ...(typeof f.resettaIl === 'number' ? { resettaIl: f.resettaIl } : {}) }
  }
  const lim = (typeof o.limiti === 'object' && o.limiti !== null ? o.limiti : {}) as Record<string, unknown>
  const cinque = finestra(lim.cinqueOre)
  const sett = finestra(lim.settimana)
  return {
    letto: typeof o.letto === 'number' ? o.letto : adesso,
    chat: lista(o.chat, (c) => ({ titolo: s(c.titolo), cwd: s(c.cwd), stato: s(c.stato), governata: c.governata === true })).slice(0, 40),
    ...(cinque !== undefined || sett !== undefined
      ? { limiti: { ...(cinque !== undefined ? { cinqueOre: cinque } : {}), ...(sett !== undefined ? { settimana: sett } : {}) } }
      : {}),
    domandeAperte: typeof o.domandeAperte === 'number' ? o.domandeAperte : 0,
    progetti: lista(o.progetti, (p) => ({
      nome: s(p.nome), chi: s(p.chi), inCoda: typeof p.inCoda === 'number' ? p.inCoda : 0,
      ...(typeof p.pcNome === 'string' ? { pcNome: p.pcNome } : {}),
      ...(typeof p.percorso === 'string' && p.percorso !== '' ? { percorso: p.percorso } : {})
    })).slice(0, 30),
    ...(typeof o.driveAttivo === 'boolean' ? { driveAttivo: o.driveAttivo } : {}),
    altriPc: lista(o.altriPc, (p) => ({ nome: s(p.nome), vivo: p.vivo === true })).slice(0, 10),
    ...(typeof o.workspace === 'string' ? { workspace: o.workspace } : {})
  }
}

/**
 * Le chat di questa cartella stanno sul Drive di SierraDeck? Si': la
 * sincronizzazione e' accesa e la cartella sta dentro un progetto sul Drive.
 * E' il «cloud» che da' all'autopilota l'autonomia completa (Nicholas, 30/09).
 * Un estratto vecchio non conta: meglio chiedere che credersi in autonomia.
 */
export function driveDelProgetto(e: StatoProgramma | undefined, cwd: string, adesso: number): boolean {
  if (e === undefined || e.driveAttivo !== true || adesso - e.letto > STATO_PROGRAMMA_VALIDO_MS) return false
  return e.progetti.some((p) => p.percorso !== undefined && dentro(cwd, p.percorso))
}

/** Quanto e' vecchio un estratto prima di non contare piu' (il Gestore lo manda ogni 10 s). */
export const STATO_PROGRAMMA_VALIDO_MS = 2 * 60_000

/**
 * Lo stato del programma scritto per il supervisore: una sezione del prompt.
 * Vuota se non c'e' un estratto recente.
 */
export function riassuntoProgramma(e: StatoProgramma | undefined, freno: Freno, adesso: number): string {
  const righe = ['## Stato del programma (sola lettura)']
  righe.push(`- Limiti del piano: ${freno.motivo}.`)
  if (e === undefined || adesso - e.letto > STATO_PROGRAMMA_VALIDO_MS) {
    righe.push('- Il resto del programma non è leggibile adesso (SierraDeck chiuso o più vecchio): decidi con quello che hai.')
    return righe.join('\n')
  }
  const aspettano = e.chat.filter((c) => c.stato === 'aspetta' || c.stato === 'sceglie')
  righe.push(`- Chat aperte: ${e.chat.length} (${e.chat.filter((c) => c.governata).length} governate da autopiloti, ${aspettano.length} aspettano Nicholas).`)
  righe.push(`- Nella scheda Domande aspettano già ${e.domandeAperte} risposte: chiedi solo se è indispensabile.`)
  const inCoda = e.progetti.filter((p) => p.inCoda > 0)
  if (inCoda.length > 0) righe.push(`- Code dei progetti: ${inCoda.map((p) => `${p.nome} ${p.inCoda}`).join(', ')}.`)
  const altrove = e.progetti.filter((p) => p.chi === 'altro')
  if (altrove.length > 0) righe.push(`- Progetti in mano a un altro PC (non lavorarci da qui): ${altrove.map((p) => `${p.nome} su ${p.pcNome ?? '?'}`).join(', ')}.`)
  if (e.altriPc.length > 0) righe.push(`- Altri PC: ${e.altriPc.map((p) => `${p.nome} ${p.vivo ? 'acceso' : 'spento'}`).join(', ')}.`)
  if (e.workspace !== undefined) righe.push(`- Workspace davanti: ${e.workspace}.`)
  righe.push(`- Drive di SierraDeck: ${e.driveAttivo === true ? 'sincronizzazione accesa' : 'sincronizzazione spenta'}.`)
  return righe.join('\n')
}

// ─── T5: il filtro delle domande delle sotto-chat ─────────────────────────

function parole(t: string): Set<string> {
  return new Set(t.toLowerCase().normalize('NFD').replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((p) => p.length > 3))
}

/** Quanto si somigliano due domande (0..1, parole in comune). */
export function somiglianza(a: string, b: string): number {
  const pa = parole(a)
  const pb = parole(b)
  if (pa.size === 0 || pb.size === 0) return 0
  let comuni = 0
  for (const p of pa) if (pb.has(p)) comuni += 1
  return comuni / Math.min(pa.size, pb.size)
}

/**
 * C'e' gia' una domanda uguale di una chat sorella, ancora aperta? Allora la
 * nuova si aggancia a quella invece di arrivare a Nicholas una seconda volta:
 * «tre chat chiedono la stessa cosa» deve essere una domanda, non tre.
 */
export function domandaGemella(
  aperte: { id: string; autopilotaId: string; testo: string }[],
  autopilotaId: string,
  testo: string
): string | undefined {
  return aperte.find((d) => d.autopilotaId === autopilotaId && somiglianza(d.testo, testo) >= 0.6)?.id
}

// ─── T2: quali chat fermare quando il freno scende ────────────────────────

/**
 * Le chat al lavoro oltre il tetto del freno, da mettere in pausa a fine turno.
 * Si tengono quelle che hanno lavorato di piu' (sono piu' avanti), a parita' le
 * prime aperte.
 */
export function daMettereInPausa(chats: ChatGovernata[], tetto: number): string[] {
  const attive = chats.filter((c) => c.stato === 'lavoro')
  if (attive.length <= tetto) return []
  const tenute = [...attive].sort((x, y) => y.cicli - x.cicli || x.id.localeCompare(y.id)).slice(0, Math.max(0, tetto))
  return attive.filter((c) => !tenute.includes(c)).map((c) => c.id)
}

/** Le chat in pausa che il freno lascia ripartire adesso. */
export function daRiprendere(chats: ChatGovernata[], tetto: number): string[] {
  const attive = chats.filter((c) => c.stato === 'lavoro').length
  const posti = Math.max(0, tetto - attive)
  return chats.filter((c) => c.stato === 'pausa').slice(0, posti).map((c) => c.id)
}
