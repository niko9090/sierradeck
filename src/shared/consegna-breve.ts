/**
 * Le istruzioni lunghe dell'autopilota consegnate come **file più una riga
 * corta** (0.38.1).
 *
 * Nicholas (01/10): «cosa vuol dire premi invio come domanda? non va da solo?
 * deve essere automatico se no a cosa serve l'autopilota se devo premere invio
 * io!». Fino alla 0.38.0 un'istruzione lunga si incollava nel campo della chat
 * fra i marcatori dell'incolla e poi si premeva Invio. Provato con un Claude
 * Code vero (2.1.287) in un pty: l'Invio parte, ma il controllo «e' partita?»
 * dava un falso allarme — mentre lavora Claude Code scrive «(2s · thinking)» e
 * non sempre «esc to interrupt», e il messaggio incollato resta visibile come
 * «[Pasted text #1 …]» — e allora si premeva Invio altre volte e si chiedeva a
 * Nicholas di farlo.
 *
 * Ora un testo lungo (o su piu' righe) va in un file dentro la cartella in cui
 * lavora la chat, `.sierradeck/consegne/<id>.md` (escluso da git con un
 * `.gitignore` suo), e nella chat si digita **una riga sola**, senza marcatori:
 * quella parte sempre al primo Invio, e dallo schermo si vede bene se e'
 * rimasta nel campo.
 */

/** Oltre questa lunghezza, o con un a capo, il testo va in un file. */
export const SOGLIA_RIGA = 280

export const CARTELLA_CONSEGNE = '.sierradeck/consegne'

/** Il testo va consegnato come file? */
export function serveFile(testo: string): boolean {
  return testo.length > SOGLIA_RIGA || /[\r\n]/.test(testo)
}

/** Il nome del file della consegna: solo caratteri sicuri. */
export function fileConsegna(id: string): string {
  const pulito = id.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80)
  return `${CARTELLA_CONSEGNE}/${pulito !== '' ? pulito : 'consegna'}.md`
}

/** La riga che si digita nella chat. */
export function rigaCorta(relativo: string): string {
  return `Leggi ed esegui le istruzioni in ${relativo} (dal tuo supervisore).`
}

/** Il contenuto del file: le istruzioni, con una riga che dice cosa sono. */
export function contenutoConsegna(testo: string, titolo: string): string {
  return `<!-- Istruzioni del supervisore di SierraDeck per la chat «${titolo}». Questo file si può cancellare dopo averlo letto. -->\n\n${testo}\n`
}

/**
 * La consegna pronta per la chat: se il testo e' lungo, `scrivi` mette il file
 * e il testo diventa la riga corta. Se il file non si puo' scrivere si resta al
 * testo intero (meglio un incolla che niente).
 */
export function preparaConsegna<T extends { id: string; cosa: string; testo: string; titolo: string }>(
  c: T,
  scrivi: (relativo: string, contenuto: string) => boolean
): T {
  if (c.cosa !== 'scrivi' || !serveFile(c.testo)) return c
  const rel = fileConsegna(c.id)
  return scrivi(rel, contenutoConsegna(c.testo, c.titolo)) ? { ...c, testo: rigaCorta(rel) } : c
}
