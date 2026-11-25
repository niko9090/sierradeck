/**
 * **Le unioni che scadono** (23/11, k-191a: «errori ancora», workspace con uno schema
 * pieno di file grandi). Le unioni di un workspace passano una alla volta; quando una
 * scade il programma la rimette in fila e riprova. Tre difetti rendevano la cosa
 * invisibile e lenta:
 *
 * 1. **La fila non guardava quante volte un lavoro era già scaduto.** Un lavoro che
 *    scade torna pronto dopo pochi secondi e, ripetuto, ogni suo tentativo (fino a
 *    un'ora) teneva ferme le unioni nuove, mai tentate, che stavano dietro. Adesso
 *    prima passa chi non ha ancora scaduto (`scegliProssima`).
 * 2. **Il tempo di un passo git era sempre lo stesso.** Con file grandi un passo lento
 *    (non appeso) scadeva uguale a ogni tentativo. Adesso ogni scadenza dà più tempo
 *    al tentativo dopo, fino a un tetto (`piuTempoPerTentativo`).
 * 3. **Dopo la scadenza il lavoro spariva dallo stato**: né «in corso» né «in fila»,
 *    e l'autopilota scriveva «nessuno sta lavorando». Adesso lo stato dice cosa unisce
 *    il programma (`rigaUnioneAttiva`) e quante unioni sono scadute e riprovano da sole.
 *    Dopo qualche scadenza l'autopilota riceve un esito con il motivo concreto
 *    (`fraseScadenzeRipetute`), una volta sola per soglia.
 */

/** Quanto un tentativo dopo una scadenza può durare in più: ×2 al secondo, ×3 dal terzo. */
export const TEMPO_TENTATIVO_MAX_FATTORE = 3

/** Moltiplicatore del tempo dei passi git al tentativo `tentativi` + 1 (0 scadenze = 1). */
export function piuTempoPerTentativo(tentativi: number): number {
  return Math.min(1 + Math.max(0, Math.floor(tentativi)), TEMPO_TENTATIVO_MAX_FATTORE)
}

export type VoceDiFila = { inCorso: boolean; nonPrima?: number; tentativi: number }

/**
 * Il lavoro a cui tocca adesso: tra quelli pronti (il loro momento è arrivato) chi è scaduto
 * meno volte; a parità, l'ordine della fila. `undefined` se nessuno può partire ora.
 */
export function scegliProssima<T extends VoceDiFila>(fila: readonly T[], ora: number): T | undefined {
  let scelta: T | undefined
  for (const l of fila) {
    if ((l.nonPrima ?? 0) > ora) continue
    if (scelta === undefined || l.tentativi < scelta.tentativi) scelta = l
  }
  return scelta
}

export type FaseUnione = 'prova' | 'criterio' | undefined

/** In che punto era l'unione quando il tempo è finito, in parole. */
export function doveEraScaduta(fase: FaseUnione): string {
  if (fase === 'prova') return 'durante l’unione di prova (passi di git sulla cartella principale e prove del criterio)'
  if (fase === 'criterio') return 'durante la misura del criterio, dopo l’unione'
  return 'prima dell’unione di prova (salvataggi e controlli dei rami)'
}

/** Il motivo di una scadenza della fila: quanto tempo, e in che punto. */
export function motivoScadenzaFila(maxMs: number, fase: FaseUnione): string {
  return `ha superato i ${Math.max(1, Math.round(maxMs / 60_000))} minuti ${doveEraScaduta(fase)}`
}

/** Le soglie in cui l'autopilota viene svegliato con un esito: dopo `soglia` scadenze, poi di nuovo al doppio. */
export function sogliaScadenze(tentativi: number, soglia: number): 'prima' | 'seconda' | undefined {
  if (soglia <= 0) return undefined
  if (tentativi === soglia) return 'prima'
  if (tentativi === soglia * 2) return 'seconda'
  return undefined
}

/**
 * Il testo dell'esito dopo scadenze ripetute: dice cosa è successo davvero, cosa fa il programma
 * e, alla seconda soglia, che non è un caso e cosa guardare. Mai «aspetta e basta».
 */
export function fraseScadenzeRipetute(p: { chi: string; tentativi: number; motivo: string; soglia: 'prima' | 'seconda'; ognimin: number; fase: FaseUnione }): string {
  // Le parole che contano stanno all'inizio: l'elenco degli eventi nello stato taglia le righe lunghe.
  const base = `${p.chi}: unione scaduta ${p.tentativi} volte`
  if (p.soglia === 'prima') {
    return `${base}: resta in fondo alla fila e riprova da sola (al più ogni ${p.ognimin} minuti, con più tempo a ogni giro), le altre passano. Non serve un riavvio né rifare il lavoro. Motivo: ${p.motivo}.`
  }
  const dove = p.fase === 'criterio'
    ? 'è la misura del criterio che non finisce: guardare il comando del criterio'
    : p.fase === 'prova'
      ? 'sono i passi di git o le prove del ramo a essere troppo lenti (file molto grandi o antivirus sulla cartella principale?)'
      : 'il tempo se ne va prima dell’unione di prova (salvataggi dei rami o attesa del turno)'
  return `${base}, non è un caso: ${dove}. Il lavoro è salvo nel suo ramo e continua a riprovare, ma non entrerà finché questo non cambia. Ultimo motivo: ${p.motivo}.`
}

/** 25/11: «HH:MM» nell'ora del PC. */
export function oraBreve(ms: number): string {
  const d = new Date(ms)
  return Number.isNaN(d.getTime()) ? '?' : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/**
 * 25/11: la risposta a chi chiede un'unione che riposa dopo troppe scadenze (l'autopilota con unisci, la spinta
 * del lavoro fermo, il giro che riprende le unioni). Il riposo vale per tutte le strade: la si dice, non si riparte.
 */
export function fraseRiposo(p: { finoMs: number; motivo: string }): string {
  return `in riposo fino alle ${oraBreve(p.finoMs)}, motivo: ${p.motivo.replace(/\s+/gu, ' ').trim().slice(0, 200)}`
}

/**
 * 25/11: l'esito quando un'unione esce dalla fila dopo troppe scadenze. Dice quante volte, dove era lenta, che il
 * lavoro è salvo e a che ora riprova da sola (il riposo vale anche per unisci). Le parole che contano all'inizio.
 */
export function fraseUscitaDopoScadenze(p: { chi: string; tentativi: number; motivo: string; fase: FaseUnione; riposoMin: number; finoMs?: number }): string {
  const dove = p.fase === 'criterio'
    ? 'è la misura del criterio che non finisce: guarda il comando del criterio'
    : p.fase === 'prova'
      ? 'sono i passi di git o le prove del ramo a essere troppo lenti'
      : 'il tempo se ne va prima dell’unione di prova (salvataggi o controlli dei rami)'
  return `${p.chi}: unione scaduta ${p.tentativi} ${p.tentativi === 1 ? 'volta' : 'volte'}, esce dalla fila: ${dove}. Il lavoro è salvo nel suo ramo e il compito resta in revisione; riprovo da sola fra ${p.riposoMin} minuti${p.finoMs !== undefined ? ` (alle ${oraBreve(p.finoMs)})` : ''}: fino ad allora unisci non la rimette in fila, intanto togli la causa. Ultimo motivo: ${p.motivo}.`
}

/** Una riga per l'autopilota: cosa unisce adesso il programma, e da quanto. Pura. */
export function rigaUnioneAttiva(p: { chi: string; fase: FaseUnione; daMs: number; tentativi: number }): string {
  const cosa = p.fase === 'criterio' ? 'misura il criterio di' : 'sta provando e unendo'
  const min = Math.floor(Math.max(0, p.daMs) / 60_000)
  const da = min >= 1 ? `da ${min} min` : 'da meno di un minuto'
  return `- ${p.chi}: in corso — il programma ${cosa} questo lavoro (${da}${p.tentativi > 0 ? `, tentativo ${p.tentativi + 1}` : ''}): non è fermo`
}
