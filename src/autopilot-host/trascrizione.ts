/**
 * Leggere dalla conversazione **quello che la chat ha davvero chiesto**.
 *
 * Serve perché la notifica di Claude Code, da sola, non contiene la domanda.
 * Dice il tipo di evento e una riga di servizio — «Claude is waiting for your
 * input» — e nient'altro: la domanda vera sta nell'ultimo messaggio scritto
 * nella conversazione, che la notifica non porta con sé.
 *
 * È tutta la differenza fra chiedere all'utente «sconosciuta: Claude is waiting
 * for your input», che non è una domanda e a cui non si può rispondere, e
 * chiedergli quello che la chat ha effettivamente domandato.
 *
 * La trascrizione è un file JSONL scritto da Claude Code: una riga per evento,
 * ognuna un oggetto JSON a sé. Si legge dalla fine — la domanda è l'ultima cosa
 * detta — e senza mai sollevare: è un file di un altro programma, il suo
 * formato può cambiare sotto di noi, e un autopilota che cade perché una riga
 * non si capisce è molto peggio di uno che non sa cosa è stato chiesto.
 */

/** Oltre questo non si legge: una domanda non è mai lunga così. */
export const DOMANDA_MAX = 2000

/**
 * Il testo dell'ultimo messaggio dell'assistente, se c'è.
 *
 * Le righe arrivano nell'ordine del file e si guardano dalla fine. Il contenuto
 * di un messaggio può essere una stringa o un elenco di blocchi (testo,
 * chiamate a strumenti, risultati): si tengono solo i blocchi di testo, perché
 * gli altri non sono cose dette a qualcuno.
 */
export function ultimoMessaggioAssistente(righe: string[]): string | undefined {
  for (let i = righe.length - 1; i >= 0; i -= 1) {
    const testo = testoDiRiga(righe[i] ?? '')
    if (testo !== undefined && testo.trim() !== '') return testo.trim().slice(-DOMANDA_MAX)
  }
  return undefined
}

function testoDiRiga(riga: string): string | undefined {
  if (riga.trim() === '') return undefined
  let dato: unknown
  try {
    dato = JSON.parse(riga)
  } catch {
    // Una riga a metà: succede leggendo mentre Claude Code sta scrivendo.
    return undefined
  }
  if (typeof dato !== 'object' || dato === null) return undefined
  const o = dato as Record<string, unknown>
  // La forma è cambiata almeno una volta fra le versioni: il messaggio può
  // stare sotto `message` o essere l'oggetto stesso. Si accettano entrambe
  // invece di scommettere su quella di oggi.
  const messaggio = (typeof o.message === 'object' && o.message !== null ? o.message : o) as Record<string, unknown>
  if (messaggio.role !== 'assistant' && o.type !== 'assistant') return undefined
  const contenuto = messaggio.content
  if (typeof contenuto === 'string') return contenuto
  if (!Array.isArray(contenuto)) return undefined
  const pezzi: string[] = []
  for (const blocco of contenuto) {
    if (typeof blocco !== 'object' || blocco === null) continue
    const b = blocco as Record<string, unknown>
    if (b.type === 'text' && typeof b.text === 'string') pezzi.push(b.text)
  }
  const unito = pezzi.join('\n').trim()
  return unito === '' ? undefined : unito
}

/**
 * Quello che si mette davanti a chi deve rispondere: la notifica **e** ciò che
 * la chat aveva appena detto.
 *
 * Nessuna delle due basta da sola. La notifica dice che la chat è ferma e
 * perché — un permesso, un'attesa — ma non cosa vuole; l'ultimo messaggio dice
 * cosa vuole ma non che la chat sia ferma ad aspettarlo. Insieme sono una
 * domanda a cui si può rispondere.
 */
export function componiDomanda(notifica: string, ultimoMessaggio?: string): string {
  const pulita = notifica.trim()
  const detto = (ultimoMessaggio ?? '').trim()
  if (detto === '') return pulita
  if (pulita === '') return detto
  return `${pulita}\n\nLa chat aveva appena detto:\n${detto}`
}
