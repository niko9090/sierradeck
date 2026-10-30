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
  /**
   * La copia vecchia: nel recupero, niente da togliere, ferma con il motivo, o
   * `dopo` (0.71.1): il PC era spento e si è scelto «Vai avanti senza», la sua
   * copia resta dov'è e quando torna si confronta, si unisce qui quello che ha
   * solo lui (nei recuperati) e va nel recupero di quel PC.
   */
  esito?: 'nel-recupero' | 'niente' | 'fermo' | 'dopo'
  messaggio?: string
  /** Quando si è scelto «Vai avanti senza» per questo PC (0.71.1). */
  senza?: string
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
  fermo?: { passo: IdPasso; motivo: string; il: string; riprovaDaSolo: boolean; pc?: string }
  /** L'unione fatta qui (per «Annulla tutto»). */
  unione?: string
  riassunto?: string[]
  finitoIl?: string
  /** Fino a quando «Annulla tutto» si può fare. */
  scadeIl?: string
  annullatoIl?: string
  annullamento?: string[]
  /** Solo per mostrarlo (0.71.1): il fermo in chiaro, scritto dal PC per PC, pagina e app. */
  fermoChiaro?: FermoChiaro
}

/** Il fermo in chiaro: il testo, il PC spento e se si può scegliere fra aspettarlo e andare avanti senza. */
export type FermoChiaro = { testo: string; pc?: { pc: string; nome: string }; scelte: boolean }

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
export function ferma(t: Trasloco, passo: IdPasso, motivo: string, riprovaDaSolo: boolean, adesso: string, pc?: string): Trasloco {
  return { ...segna(t, passo, { stato: 'fermo', dettaglio: motivo }, adesso), fermo: { passo, motivo, il: adesso, riprovaDaSolo, ...(pc !== undefined ? { pc } : {}) } }
}

/**
 * Il PC per cui il trasloco è fermo, se è fermo perché un PC non risponde
 * (0.71.1). Nei traslochi di prima il PC non era scritto: si riconosce dal
 * nome in testa al motivo («LAPTOP-… non risponde (…)»).
 */
export function pcFermo(t: Trasloco): CopiaAltrove | undefined {
  const f = t.fermo
  if (f === undefined) return undefined
  if (f.pc !== undefined) return t.altrove.find((a) => a.pc === f.pc)
  if (!/non risponde/i.test(f.motivo)) return undefined
  return t.altrove.find((a) => f.motivo.startsWith(a.nome))
}

/**
 * Il fermo detto in chiaro, con il nome scelto del PC (0.71.1). Nicholas
 * (13/10): «ho provato a spostare un progetto ma rimane fermo»; il motivo era
 * «LAPTOP-… non risponde (Con il collegamento lento via Drive non si può fare
 * questa operazione…», tagliato a metà sullo schermo. Con un PC spento le
 * scelte sono due: «Aspetta quel PC» (riparte da solo quando torna) o «Vai
 * avanti senza» (la sua copia resta dov'è e si unisce quando torna).
 */
export function fermoChiaro(t: Trasloco, nomeDi: (pc: string) => string | undefined = () => undefined, io?: string): FermoChiaro | undefined {
  if (t.fermo === undefined) return undefined
  const a = pcFermo(t)
  // Un trasloco che gira su un altro PC (0.86.2, audit M5): il suo errore si
  // dice con il nome di quel PC. «Collega prima Google Drive» compariva qui
  // come se fosse di questo PC, ed era dell'altro.
  const su = suAltroPc(t, nomeDi, io)
  if (a === undefined) return { testo: su + t.fermo.motivo, scelte: false }
  const nome = nomeDi(a.pc) ?? a.nome
  const perche = t.fermo.passo === 'raccolta'
    ? `Mi serve la sua copia aggiornata del progetto per confrontarla con le altre.`
    : `Devo confrontare la sua copia vecchia con questa prima di metterla nel recupero.`
  return {
    testo: `${su}«${nome}» è spento o non si raggiunge${su === '' ? ' da qui' : ''}. ${perche} Puoi aspettarlo (riparto da solo quando si riaccende) o andare avanti senza: la sua copia resta dov’è e, quando torna, quello che ha solo lui entra qui nei recuperati. Niente si perde.`,
    pc: { pc: a.pc, nome },
    scelte: a.senza === undefined
  }
}

/**
 * Il prefisso per un trasloco che gira su un altro PC: «Su «Torre»: ». Vuoto
 * se gira qui, o se non si sa chi guarda.
 */
export function suAltroPc(t: Trasloco, nomeDi: (pc: string) => string | undefined = () => undefined, io?: string): string {
  if (io === undefined || t.verso.pc === io) return ''
  return `Su «${nomeDi(t.verso.pc) ?? t.verso.nome}»: `
}

/**
 * Il trasloco come lo vede un PC dove **non** gira (0.86.2, audit M5): il
 * dettaglio del passo fermo con il nome del PC che lo dice. Il motivo nel
 * fermo resta com'è (serve a riconoscere il PC spento nei traslochi di prima).
 */
export function vistoDa(t: Trasloco, io: string, nomeDi: (pc: string) => string | undefined = () => undefined): Trasloco {
  const su = suAltroPc(t, nomeDi, io)
  if (su === '' || t.fermo === undefined) return t
  const p = t.passi[t.fermo.passo]
  if (p.dettaglio === undefined || p.dettaglio.startsWith(su)) return t
  return { ...t, passi: { ...t.passi, [t.fermo.passo]: { ...p, dettaglio: su + p.dettaglio } } }
}

/** Dopo quanto un trasloco finito o fallito si toglie dalla cartella `traslochi` (0.86.2, audit M5). */
export const PULISCI_TRASLOCHI_GIORNI = 7

/** L'ultima volta che il trasloco ha fatto qualcosa. */
export function ultimaAttivita(t: Trasloco): number {
  const date = [t.avviatoIl, t.finitoIl, t.annullatoIl, t.fermo?.il, ...Object.values(t.passi).map((p) => p.il)]
    .filter((x): x is string => typeof x === 'string')
    .map((x) => Date.parse(x))
    .filter((x) => !Number.isNaN(x))
  return date.length === 0 ? 0 : Math.max(...date)
}

/**
 * Il record si può togliere dalla cartella `traslochi` (0.86.2, audit M5):
 * finito, annullato o fallito (fermo per un motivo che non passa da solo), e
 * fermo da più di `PULISCI_TRASLOCHI_GIORNI`. Mai se «Annulla tutto» si può
 * ancora fare (30 giorni dalla fine) o se ci sono copie da sistemare quando il
 * loro PC torna: il record è quello che serve a farlo.
 */
export function daTogliere(t: Trasloco, adesso: number, giorni = PULISCI_TRASLOCHI_GIORNI): boolean {
  const chiuso = finito(t) || (t.fermo !== undefined && !t.fermo.riprovaDaSolo)
  if (!chiuso) return false
  if (adesso - ultimaAttivita(t) < giorni * 86_400_000) return false
  if (annullabile(t, adesso) || copieDopo(t).length > 0) return false
  return true
}

/** «Vai avanti senza» quel PC (0.71.1): il passo fermo riparte, senza aspettarlo. */
export function vaiAvantiSenza(t: Trasloco, pc: string, adesso: string): Trasloco {
  const altrove = t.altrove.map((a) => (a.pc === pc ? { ...a, senza: adesso } : a))
  if (t.fermo === undefined) return { ...t, altrove }
  const { fermo, ...resto } = t
  return { ...resto, altrove, passi: { ...t.passi, [fermo.passo]: { ...t.passi[fermo.passo], stato: 'da-fare', dettaglio: undefined, il: adesso } } }
}

/** Le copie da sistemare quando il loro PC torna (0.71.1): il trasloco è finito, loro no. */
export function copieDopo(t: Trasloco): CopiaAltrove[] {
  return t.annullatoIl !== undefined ? [] : t.altrove.filter((a) => a.esito === 'dopo')
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
