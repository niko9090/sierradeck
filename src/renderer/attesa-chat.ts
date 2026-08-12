/**
 * Quanto manca prima che una chat sia davvero a schermo.
 *
 * Una conversazione lunga ci mette: `claude.exe` deve leggere la sua
 * trascrizione — che può essere di parecchi megabyte — prima di disegnare
 * qualcosa. Nel frattempo il riquadro resta nero, e un riquadro nero per otto
 * secondi non si legge come «sto caricando»: si legge come «è rotto».
 *
 * Non esiste una percentuale vera da mostrare — nessuno ci dice a che punto è
 * la lettura — e inventarne una sarebbe mentire. Si mostra invece **quanto è
 * ragionevole aspettare**, misurato su ciò che si sa: quanto è grossa quella
 * conversazione. È una stima, e viene detto che è una stima.
 */

/** Il tempo minimo che ci mette comunque: avvio del processo e primo disegno. */
const BASE_MS = 1200
/** Quanto tempo in più per ogni megabyte di trascrizione, misurato sul campo. */
const PER_MB_MS = 900
/** Oltre questo non si promette più niente: la barra si ferma e aspetta. */
export const TETTO_PERCENTO = 95

export function attesaPrevistaMs(byteTrascrizione: number): number {
  const mb = Math.max(0, byteTrascrizione) / (1024 * 1024)
  return BASE_MS + mb * PER_MB_MS
}

/**
 * A che punto è, da 0 a 95.
 *
 * Non arriva mai a 100 da sola: al 100 ci si va solo quando la chat compare
 * davvero. Una barra che dice «fatto» mentre lo schermo è ancora nero è peggio
 * di una barra che dice «quasi».
 */
export function avanzamento(trascorsoMs: number, previstoMs: number): number {
  if (previstoMs <= 0) return TETTO_PERCENTO
  const quota = Math.max(0, trascorsoMs) / previstoMs
  return Math.min(TETTO_PERCENTO, Math.round(quota * 100))
}

/**
 * Cosa scrivere sotto la barra.
 *
 * Il peso della conversazione è l'unica cosa onesta da dire: spiega **perché**
 * ci mette, che è quello che l'utente vuole sapere quando aspetta.
 */
export function descriviAttesa(byteTrascrizione: number, trascorsoMs: number): string {
  const mb = byteTrascrizione / (1024 * 1024)
  const peso = mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.round(byteTrascrizione / 1024)} KB`
  if (byteTrascrizione <= 0) return 'Apro la chat…'
  // Passata l'attesa prevista, dire ancora «un momento» sarebbe una bugia che
  // si allunga: si ammette che sta impiegando più del previsto.
  if (trascorsoMs > attesaPrevistaMs(byteTrascrizione) * 1.5) {
    return `Sto ancora rileggendo la conversazione (${peso}): è più lunga del previsto.`
  }
  return `Rileggo la conversazione (${peso})…`
}
