import { removePane } from './layout-tree'
import type { LayoutSalvato, PaneSalvato } from './workspace'

/**
 * I riquadri da non far ripartire all'avvio (0.86.2).
 *
 * Un registro di Nicholas: a ogni apertura 15 `pty:spawn` rifiutati con
 * `CHAT_CHIUSA_SENZA_CARTELLA` e 27 «cwd non accessibile» (ENOENT). Erano le
 * chat che l'autopilota aveva gia' chiuso, con la loro copia di lavoro
 * (`<progetto>.sierradeck-wt/…`) tolta dopo l'unione: il layout salvato le
 * teneva, il mosaico le rimontava, e ognuna provava a partire in una cartella
 * che non c'era piu'. Qui si decide, prima di montarle, quali togliere.
 *
 * Si tolgono:
 * - le chat con la cartella sparita che sono chiuse, nel recupero o finite
 *   (la regola della 0.84.1, `chiusa-senza-cartella.ts`);
 * - le chat con la cartella sparita che vivevano in una copia di lavoro di un
 *   autopilota: quella cartella non torna;
 * - le chat di un autopilota che il servizio dice finite, anche se la copia
 *   c'e' ancora: non hanno piu' niente da fare.
 *
 * Restano le chat normali con la cartella sparita (la diagnosi con «Scegli la
 * cartella», magari e' un disco staccato) e i riquadri remoti, la cui cartella
 * vive su un altro PC.
 */

export type DecisoriRiquadri = {
  cartellaEsiste: (cwd: string) => boolean
  /** Il motivo della 0.84.1 (chiusa, recupero, finita), chiesto solo per una cartella che manca. */
  motivoChiusa: (sessionUuid: string, cwd: string) => string | undefined
  /** Il servizio degli autopiloti dice finita la chat di questa sessione. */
  finitaDiAutopilota: (sessionUuid: string) => boolean
}

export type RiquadroDaTogliere = { sessionUuid: string; perche: string }

/** Una cartella dentro `<progetto>.sierradeck-wt`, la copia di lavoro di una chat di autopilota. */
export function eCopiaDiLavoro(cwd: string): boolean {
  return /\.sierradeck-wt(?:[\\/]|$)/i.test(cwd)
}

export function riquadriDaTogliere(
  panes: readonly Pick<PaneSalvato, 'sessionUuid' | 'cwd' | 'autopilota' | 'remoto'>[],
  d: DecisoriRiquadri
): RiquadroDaTogliere[] {
  const via: RiquadroDaTogliere[] = []
  for (const p of panes) {
    if (p.remoto !== undefined || p.sessionUuid === '' || p.cwd === '') continue
    if (!d.cartellaEsiste(p.cwd)) {
      const motivo = d.motivoChiusa(p.sessionUuid, p.cwd)
      if (motivo !== undefined) { via.push({ sessionUuid: p.sessionUuid, perche: motivo }); continue }
      if (eCopiaDiLavoro(p.cwd)) { via.push({ sessionUuid: p.sessionUuid, perche: 'la copia di lavoro dell’autopilota non c’è più' }); continue }
      continue
    }
    if (p.autopilota !== undefined && d.finitaDiAutopilota(p.sessionUuid)) {
      via.push({ sessionUuid: p.sessionUuid, perche: 'l’autopilota l’ha già chiusa' })
    }
  }
  return via
}

/**
 * Il caricamento del layout all'avvio, senza i riquadri morti: chiede al Core
 * quali togliere, li congeda (cosi' il primo salvataggio puo' farli uscire
 * dall'archivio) e restituisce il layout ripulito. Se il Core non risponde, il
 * layout com'era: meglio una diagnosi in piu' che un riquadro perso.
 */
export async function caricaSenzaRiquadriMorti(d: {
  carica: () => Promise<LayoutSalvato>
  daTogliere: (panes: Pick<PaneSalvato, 'sessionUuid' | 'cwd' | 'autopilota' | 'remoto'>[]) => Promise<RiquadroDaTogliere[]>
  congeda: (sessioni: string[]) => void
}): Promise<LayoutSalvato> {
  const l = await d.carica()
  if (l.panes.length === 0) return l
  let via: RiquadroDaTogliere[]
  try {
    via = await d.daTogliere(l.panes.map((p) => ({
      sessionUuid: p.sessionUuid,
      cwd: p.cwd,
      ...(p.autopilota !== undefined ? { autopilota: p.autopilota } : {}),
      ...(p.remoto !== undefined ? { remoto: p.remoto } : {})
    })))
  } catch {
    return l
  }
  if (via.length === 0) return l
  const sessioni = via.map((v) => v.sessionUuid)
  d.congeda(sessioni)
  return togliDalLayout(l, new Set(sessioni))
}

/** Il layout senza i riquadri di quelle sessioni: dall'elenco e dall'albero. */
export function togliDalLayout(l: LayoutSalvato, sessioni: ReadonlySet<string>): LayoutSalvato {
  if (sessioni.size === 0) return l
  let root = l.root
  const panes: PaneSalvato[] = []
  for (const p of l.panes) {
    if (!sessioni.has(p.sessionUuid)) { panes.push(p); continue }
    if (root !== undefined) root = removePane(root, p.id)
  }
  return { root, panes }
}

/**
 * La risposta del servizio con pazienza (0.88). Prima si aspettavano due
 * secondi e poi si rimontava tutto: con il servizio lento (appena sostituito
 * dopo un aggiornamento) le chat finite partivano lo stesso e il registro si
 * riempiva di `CHAT_CHIUSA_SENZA_CARTELLA`. Ora, se `serve()` dice che senza
 * il servizio si sbaglierebbe, si aspetta ancora `poiMs` la stessa risposta
 * (o una seconda, se la prima è fallita). Senza risposta: `undefined`, e chi
 * chiama non toglie niente — meglio una diagnosi in più che un riquadro vivo
 * trattato da morto.
 */
export async function rispostaConPazienza<T>(
  chiedi: () => Promise<T>,
  p: { primaMs: number; poiMs: number; serve: () => boolean; dormi?: (ms: number) => Promise<void> }
): Promise<T | undefined> {
  type Esito = { ok: true; v: T } | { ok: false; fallita: boolean }
  const dormi = p.dormi ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const avvia = (): Promise<Esito> => chiedi().then((v): Esito => ({ ok: true, v }), (): Esito => ({ ok: false, fallita: true }))
  const entro = (q: Promise<Esito>, ms: number): Promise<Esito> => Promise.race([q, dormi(ms).then((): Esito => ({ ok: false, fallita: false }))])
  let corrente = avvia()
  const primo = await entro(corrente, p.primaMs)
  if (primo.ok) return primo.v
  if (!p.serve()) return undefined
  if (primo.fallita) corrente = avvia()
  const secondo = await entro(corrente, p.poiMs)
  return secondo.ok ? secondo.v : undefined
}
