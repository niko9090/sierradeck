/**
 * Il trasloco di un progetto (0.65.0): «Sposta progetto» e «Rendi residente»
 * sono lo stesso passaggio, automatico, con l'analisi prima e le copie
 * vecchie nel recupero solo alla fine.
 *
 * Il caso di Nicholas: «Sposta progetto» (0.42) metteva le chat del vecchio
 * PC nel recupero senza il confronto della tappa 3 (rimozione sicura) e della
 * 0.60 (residenza): lo ha vissuto come «cancella tutto».
 *
 * Gira sul PC che diventa residente. I passi, ognuno salvato su disco prima e
 * dopo, così un'interruzione (PC che non risponde, riavvio) riprende da dove
 * era e non lascia stati a metà:
 * 1. **raccolta** — gli altri PC con una copia la salvano sul Drive;
 * 2. **analisi** — si confrontano tutte le copie (cartelle di qui e Drive);
 * 3. **unione** — qui: i file che mancano, le versioni diverse nei recuperati,
 *    le chat sotto la cartella che resta, un workspace solo, la casa qui;
 * 4. **vecchie** — su ogni altro PC la copia si confronta con quella di qui,
 *    quello che c'è solo là viene copiato qui (nei recuperati), e poi la copia
 *    vecchia va nel recupero di quel PC (30 giorni);
 * 5. **fine** — il riassunto, con «Annulla tutto» per 30 giorni.
 * Mai una cancellazione.
 */

export type IdPasso = 'raccolta' | 'analisi' | 'unione' | 'vecchie' | 'fine'

export const PASSI_TRASLOCO: { id: IdPasso; titolo: string; spiega: string }[] = [
  { id: 'raccolta', titolo: 'Raccolgo le copie', spiega: 'Gli altri PC che hanno il progetto lo salvano sul Drive, così il confronto vede anche le loro ultime modifiche.' },
  { id: 'analisi', titolo: 'Confronto i file', spiega: 'Ogni file di ogni copia, per impronta: uguali, mancanti, più recenti, diversi.' },
  { id: 'unione', titolo: 'Unisco qui', spiega: 'I file che mancano entrano; le versioni diverse vanno nei recuperati; le chat passano sotto la cartella che resta; un workspace solo; la casa delle chat diventa questo PC.' },
  { id: 'vecchie', titolo: 'Copie vecchie nel recupero', spiega: 'Su ogni altro PC la copia si confronta con quella di qui: quello che c’è solo là viene copiato qui, nei recuperati. Poi la copia vecchia va nel recupero di quel PC per 30 giorni.' },
  { id: 'fine', titolo: 'Riassunto', spiega: 'Cosa è cambiato, con «Annulla tutto» per 30 giorni.' }
]

export type StatoPasso = 'da-fare' | 'in-corso' | 'fatto' | 'fermo'

export type PassoTrasloco = {
  stato: StatoPasso
  /** Cosa sta facendo adesso, o cosa ha fatto: «Confronto i file… 34/120». */
  dettaglio?: string
  fatto?: number
  totale?: number
  il?: string
}

/** Un altro PC con una copia del progetto, e cosa ne è stato. */
export type CopiaAltrove = {
  pc: string
  nome: string
  salvata?: boolean
  /** La copia vecchia: nel recupero, niente da togliere, o ferma con il motivo. */
  esito?: 'nel-recupero' | 'niente' | 'fermo'
  messaggio?: string
}

export type Trasloco = {
  id: string
  progetto: string
  nome: string
  /** Il PC che diventa residente (quello dove gira il trasloco). */
  verso: { pc: string; nome: string }
  /** Chi l'ha chiesto e da dove: «Sposta progetto» da un altro PC, o «Rendi residente qui». */
  chiesto: { da: string; come: 'sposta' | 'residente' }
  avviatoIl: string
  passi: Record<IdPasso, PassoTrasloco>
  altrove: CopiaAltrove[]
  /** Il residente di prima, se era un altro PC: «Annulla tutto» gli ridà la casa. */
  casaPrima?: { pc: string; nome: string }
  /** Il motivo per cui è fermo; riprende dal passo fermo. */
  fermo?: { passo: IdPasso; motivo: string; il: string; riprovaDaSolo: boolean }
  /** L'unione fatta qui (per «Annulla tutto»). */
  unione?: string
  riassunto?: string[]
  finitoIl?: string
  /** Fino a quando «Annulla tutto» si può fare. */
  scadeIl?: string
  annullatoIl?: string
  annullamento?: string[]
}

export const ANNULLA_TUTTO_GIORNI = 30

export function nuovoTrasloco(p: { id: string; progetto: string; nome: string; verso: { pc: string; nome: string }; chiesto: Trasloco['chiesto']; altrove: { pc: string; nome: string }[]; adesso: string }): Trasloco {
  const passi = Object.fromEntries(PASSI_TRASLOCO.map((x) => [x.id, { stato: 'da-fare' as StatoPasso }])) as Record<IdPasso, PassoTrasloco>
  return { id: p.id, progetto: p.progetto, nome: p.nome, verso: p.verso, chiesto: p.chiesto, avviatoIl: p.adesso, passi, altrove: p.altrove.map((a) => ({ pc: a.pc, nome: a.nome })) }
}

/** Il primo passo da fare (o da riprendere): `undefined` = finito. */
export function prossimoPasso(t: Trasloco): IdPasso | undefined {
  if (t.annullatoIl !== undefined) return undefined
  return PASSI_TRASLOCO.find((x) => t.passi[x.id].stato !== 'fatto')?.id
}

export function segna(t: Trasloco, passo: IdPasso, cambia: Partial<PassoTrasloco>, adesso: string): Trasloco {
  const passi = { ...t.passi, [passo]: { ...t.passi[passo], ...cambia, il: adesso } }
  const { fermo: _f, ...senzaFermo } = t
  return { ...(cambia.stato === 'fermo' ? t : senzaFermo), passi }
}

/**
 * Fermo con il motivo: il passo resta da rifare, niente si lascia a metà.
 * `riprovaDaSolo`: il motivo passa da solo (un PC spento che torna), e il
 * trasloco riprende da sé.
 */
export function ferma(t: Trasloco, passo: IdPasso, motivo: string, riprovaDaSolo: boolean, adesso: string): Trasloco {
  return { ...segna(t, passo, { stato: 'fermo', dettaglio: motivo }, adesso), fermo: { passo, motivo, il: adesso, riprovaDaSolo } }
}

export function finito(t: Trasloco): boolean { return t.finitoIl !== undefined || t.annullatoIl !== undefined }

/** Per la barra: passi fatti, il passo attuale con la sua frazione, la percentuale. */
export function avanzamento(t: Trasloco): { fatti: number; totale: number; percento: number; attuale?: { id: IdPasso; titolo: string; dettaglio?: string } } {
  const totale = PASSI_TRASLOCO.length
  const fatti = PASSI_TRASLOCO.filter((x) => t.passi[x.id].stato === 'fatto').length
  const id = prossimoPasso(t)
  const p = id !== undefined ? t.passi[id] : undefined
  const frazione = p?.totale !== undefined && p.totale > 0 && p.fatto !== undefined ? Math.min(1, p.fatto / p.totale) : 0
  const percento = Math.round(((fatti + (p?.stato === 'in-corso' ? frazione : 0)) / totale) * 100)
  const titolo = PASSI_TRASLOCO.find((x) => x.id === id)?.titolo
  return { fatti, totale, percento, ...(id !== undefined && titolo !== undefined ? { attuale: { id, titolo, ...(p?.dettaglio !== undefined ? { dettaglio: p.dettaglio } : {}) } } : {}) }
}

/** «Annulla tutto» si può fare: finito, non annullato, entro i 30 giorni (o fermo a metà). */
export function annullabile(t: Trasloco, adesso: number): boolean {
  if (t.annullatoIl !== undefined) return false
  if (t.scadeIl !== undefined && Date.parse(t.scadeIl) < adesso) return false
  return t.unione !== undefined || t.altrove.some((a) => a.esito === 'nel-recupero')
}

/** Un motivo che passa da solo: un PC spento o lontano, un lavoro del Drive in corso. */
export function motivoPassaggero(messaggio: string): boolean {
  return /non risponde|non si raggiunge|non raggiungibile|timeout|ECONNREFUSED|ETIMEDOUT|EHOSTUNREACH|fetch failed|LAVORO_IN_CORSO|sta gia'? girando|sta già girando|uno alla volta|in uso|aspetto che/i.test(messaggio)
}

/** Il dettaglio del passo 4 per un PC: cosa si fa con la sua copia. */
export function dettaglioVecchia(nome: string): string {
  return `Copio qui quello che c’è solo su ${nome}, poi metto la sua copia vecchia nel recupero`
}
