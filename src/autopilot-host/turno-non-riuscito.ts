/**
 * **«turno non riuscito», in italiano e una volta sola** (11/11).
 *
 * Il 09/11 nella chat dell'autopilota è comparsa 11 volte in 70 minuti la
 * stessa riga in inglese: «turno non riuscito: You've hit your weekly limit ·
 * resets 1am (Europe/Rome)», una per tentativo. Da qui passerebbe anche
 * «Login expired · Please run /login». Nicholas non deve tradurre, né leggere
 * dieci volte la stessa cosa.
 *
 * Qui solo il testo: i casi noti della CLI detti in italiano, e il confronto
 * con la riga di prima. Quando riprovare lo decide `orchestratore.ts`.
 */

/** La coda che cambia a ogni tentativo: «— riprovo fra 30 s». */
const RIPROVO = /\s+—\s+riprovo fra\s+.+$/u

/** Il testo senza «— riprovo fra N», per confrontare due righe. */
export function senzaRiprovo(testo: string): string {
  return testo.replace(RIPROVO, '').trim()
}

/** «1am», «1:30 pm», «13:00» → «01:00», «13:30», «13:00». `undefined` se non si legge. */
function oraDiRipristino(motivo: string): string | undefined {
  const m = /resets?\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?(?![\p{L}\d])/iu.exec(motivo)
  if (m === null) return undefined
  let ore = Number(m[1])
  const minuti = m[2] ?? '00'
  const meta = m[3]?.toLowerCase()
  if (meta === 'pm' && ore < 12) ore += 12
  if (meta === 'am' && ore === 12) ore = 0
  if (ore > 23 || Number(minuti) > 59) return undefined
  return `${String(ore).padStart(2, '0')}:${minuti}`
}

/**
 * Il motivo come lo legge Nicholas. I casi noti in italiano, con quello che
 * succede dopo; un motivo sconosciuto resta com'è (meglio l'originale che una
 * traduzione inventata). La coda «— riprovo fra N» resta in fondo.
 */
export function motivoInItaliano(motivo: string): string {
  const coda = RIPROVO.exec(motivo)?.[0] ?? ''
  const m = motivo.slice(0, motivo.length - coda.length).trim()
  let detto = m
  if (/hit your (?:[\w-]+\s+){0,2}limit|usage limit|limit reached/iu.test(m)) {
    const quale = /weekly/iu.test(m) ? 'limite settimanale' : 'limite di utilizzo'
    const alle = oraDiRipristino(m)
    detto = alle !== undefined
      ? `${quale} di Claude raggiunto, si sblocca alle ${alle}: fino ad allora non posso lavorare, poi riparto da solo`
      : `${quale} di Claude raggiunto: riparto da solo appena si sblocca`
  } else if (/login expired|please run \/login|not logged in|oauth token (?:has )?expired|invalid api key|authentication_error/iu.test(m)) {
    // L'account è di Nicholas: è l'unica cosa che deve fare lui, e si dice una volta.
    detto = 'l’accesso a Claude è scaduto: va rifatto da te (in una chat qualsiasi scrivi /login). Appena torna riparto da solo'
  } else if (/overloaded|(?<!\d)529(?!\d)/iu.test(m)) {
    detto = 'i server di Claude sono sovraccarichi: non dipende da te, riparto da solo'
  }
  return `${detto}${coda}`
}

/**
 * La riga nuova dice la stessa cosa dell'ultima del dialogo (a parte «riprovo
 * fra N»)? Allora non si riscrive: resta quella di prima, finché in mezzo non
 * succede altro (un messaggio di Nicholas, una risposta dell'autopilota).
 */
export function stessaRigaDiPrima(ultima: { da: string; testo: string } | undefined, riga: string): boolean {
  return ultima !== undefined && ultima.da === 'evento' && senzaRiprovo(ultima.testo) === senzaRiprovo(riga)
}
