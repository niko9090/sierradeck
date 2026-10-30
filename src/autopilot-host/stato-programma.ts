import type { LimitiPiano } from '@shared/harness'
import { leggiRegolazione, type RegolazionePosti } from '@shared/posti-chat'

/**
 * L'estratto che il Gestore spinge al servizio ogni pochi secondi
 * (`POST /stato-programma`). Solo lettura: l'autopilota lo usa per decidere,
 * non per comandare. Ogni campo e' facoltativo: un Gestore piu' vecchio non lo
 * manda, e il servizio lavora come prima.
 */
export type StatoProgramma = {
  /** Quando il Gestore l'ha composto (ms). */
  letto: number
  /**
   * Tutte le chat aperte, anche quelle di Nicholas. `sessione` e `ferma`
   * (0.82.0): la conversazione e se è ferma al prompt; servono a chiudere da
   * sole le chat finite, mai una che lavora.
   */
  chat: { titolo: string; cwd: string; stato: string; governata: boolean; sessione?: string; ferma?: boolean }[]
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
  /** «Più chat / meno chat» dalle Impostazioni (0.82.0). */
  regolazionePosti?: RegolazionePosti
}

export function leggiStatoProgramma(raw: unknown, adesso: number): StatoProgramma | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const o = raw as Record<string, unknown>
  const lista = <T>(v: unknown, f: (x: Record<string, unknown>) => T | undefined): T[] =>
    Array.isArray(v) ? v.flatMap((x) => (typeof x === 'object' && x !== null ? (f(x as Record<string, unknown>) ?? []) : [])) as T[] : []
  const s = (v: unknown): string => (typeof v === 'string' ? v : '')
  // Il quadro dei limiti come lo manda il Gestore (`limiti-piano.ts`): la
  // percentuale *letta* (non lo 0 di una finestra azzerata) con il suo
  // azzeramento e il momento della lettura; lo stato lo ricalcola il freno,
  // all'ora del servizio, con la stessa funzione.
  const finestra = (v: unknown): { percento: number; resettaIl?: number; lettoIl?: number } | undefined => {
    if (typeof v !== 'object' || v === null) return undefined
    const f = v as Record<string, unknown>
    const percento = typeof f.percentoLetto === 'number' ? f.percentoLetto : f.percento
    if (typeof percento !== 'number') return undefined
    return {
      percento,
      ...(typeof f.resettaIl === 'number' ? { resettaIl: f.resettaIl } : {}),
      ...(typeof f.lettoIl === 'number' ? { lettoIl: f.lettoIl } : {})
    }
  }
  const lim = (typeof o.limiti === 'object' && o.limiti !== null ? o.limiti : {}) as Record<string, unknown>
  const cinque = finestra(lim.cinqueOre)
  const sett = finestra(lim.settimana)
  return {
    letto: typeof o.letto === 'number' ? o.letto : adesso,
    chat: lista(o.chat, (c) => ({
      titolo: s(c.titolo), cwd: s(c.cwd), stato: s(c.stato), governata: c.governata === true,
      ...(typeof c.sessione === 'string' && c.sessione !== '' ? { sessione: c.sessione } : {}),
      ...(typeof c.ferma === 'boolean' ? { ferma: c.ferma } : {})
    })).slice(0, 80),
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
    ...(typeof o.workspace === 'string' ? { workspace: o.workspace } : {}),
    ...(o.regolazionePosti !== undefined ? { regolazionePosti: leggiRegolazione(o.regolazionePosti) } : {})
  }
}

/** Quanto e' vecchio un estratto prima di non contare piu' (il Gestore lo manda ogni 10 s). */
export const STATO_PROGRAMMA_VALIDO_MS = 2 * 60_000
