/**
 * Le risposte di Nicholas **in viaggio** verso la chat che le aspettava (0.84.4).
 *
 * Il 23/10 ha risposto tre volte «rifallo ancora»: le risposte comparivano
 * nella conversazione con «l’ha ricevuta e riprende il lavoro», ma nel
 * registro non c’era una riga che dicesse che la chat le aveva prese. La riga
 * «risposta tardiva» si scriveva **prima** della consegna: diceva «presa»
 * quando la risposta era appena partita.
 *
 * Una risposta conta solo quando la chat la riceve: l’hook che la aspettava
 * la restituisce, oppure la consegna che la porta risulta partita. Fino ad
 * allora è in viaggio, qui, salvata con l’autopilota (sopravvive al riavvio
 * del servizio). Se la consegna non parte si riprova **una** volta; se non
 * parte neanche la seconda, o la chat non aspetta più, la risposta va al
 * supervisore come istruzione: non si perde.
 *
 * Qui le regole pure: la forma, la lettura dal disco, le righe del diario.
 */

export type RispostaInViaggio = {
  /** Le consegne che l’hanno portata, la più recente in fondo: una partita basta. */
  consegne: string[]
  /** La chat che l’aspettava; assente con una chat sola (è l’autopilota). */
  chatId?: string
  domanda: string
  risposta: string
  /** Il testo consegnato alla chat, per la riconsegna. */
  testo: string
  /** 1 = primo invio, 2 = riconsegna. Dopo la seconda va al supervisore. */
  tentativo: 1 | 2
  quando: string
}

/** Quante se ne tengono per autopilota: più di così è un guasto, non un viaggio. */
export const IN_VIAGGIO_MAX = 20

export function leggiRisposteInViaggio(x: unknown): RispostaInViaggio[] {
  if (!Array.isArray(x)) return []
  return x.flatMap((v: unknown) => {
    if (typeof v !== 'object' || v === null) return []
    const r = v as Record<string, unknown>
    const consegne = Array.isArray(r.consegne) ? r.consegne.filter((c): c is string => typeof c === 'string' && c !== '') : []
    if (consegne.length === 0 || typeof r.risposta !== 'string' || typeof r.testo !== 'string') return []
    return [{
      consegne,
      ...(typeof r.chatId === 'string' && r.chatId !== '' ? { chatId: r.chatId } : {}),
      domanda: typeof r.domanda === 'string' ? r.domanda : '',
      risposta: r.risposta,
      testo: r.testo,
      tentativo: r.tentativo === 2 ? 2 as const : 1 as const,
      quando: typeof r.quando === 'string' ? r.quando : ''
    }]
  }).slice(-IN_VIAGGIO_MAX)
}

/** La risposta in viaggio portata da questa consegna, con la sua posizione. */
export function inViaggioPer(lista: RispostaInViaggio[] | undefined, consegna: string): RispostaInViaggio | undefined {
  return (lista ?? []).find((r) => r.consegne.includes(consegna))
}

/** Le righe del diario: le legge `esitoRisposta` per dire «presa» o «non presa». */
export const rigaPresa = (chi: string, risposta: string, come: string): string =>
  `risposta presa (${chi}): ${risposta} — ${come}`
export const rigaNonPresa = (chi: string, risposta: string, motivo: string): string =>
  `risposta non presa (${chi}): ${risposta} — ${motivo}: la riconsegno una volta`
export const rigaAlSupervisore = (chi: string, risposta: string, motivo: string): string =>
  `risposta al supervisore (${chi}): ${risposta} — ${motivo}: gliela do come istruzione, non va persa`

/** Riconosce una delle tre righe: chi, la risposta (con il resto) e cosa è successo. */
export function leggiRigaRisposta(cosa: string): { esito: 'presa' | 'non-presa' | 'al-supervisore'; chi: string; resto: string } | undefined {
  const m = /^risposta (presa|non presa|al supervisore) \(([^)]+)\):\s*([\s\S]*)$/.exec(cosa)
  if (m === null) return undefined
  const esito = m[1] === 'presa' ? 'presa' : m[1] === 'non presa' ? 'non-presa' : 'al-supervisore'
  return { esito, chi: m[2] ?? '', resto: m[3] ?? '' }
}

/**
 * Il testo per il supervisore quando la risposta non è arrivata alla chat:
 * un'istruzione di Nicholas, da eseguire con il quadro intero davanti.
 */
export function istruzioneDallaRisposta(p: { chi: string; domanda: string; risposta: string; motivo: string }): string {
  return [
    `Nicholas ha risposto «${p.risposta}» alla domanda di ${p.chi}:`,
    `«${p.domanda.slice(0, 1500)}»`,
    '',
    `La risposta non è arrivata a ${p.chi}: ${p.motivo}.`,
    'È un’istruzione di Nicholas e non va persa: eseguila tu, con un messaggio alla chat giusta, un compito in coda o un cambio. Non chiedergliela di nuovo.'
  ].join('\n')
}
