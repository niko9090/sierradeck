import type { Autopilota } from '@shared/autopilota'
import type { EsitoVerifica } from './decisione'
import type { Interrogazione } from './supervisore'

/**
 * Il supervisore che decide, invece del semaforo che contava i codici d'uscita.
 *
 * Prima la decisione la prendeva un `if`: comandi verdi → chiedi un giudizio,
 * comandi rossi → «correggi e riprova». Claude veniva interpellato solo alla
 * fine, quando non c'era quasi più niente da decidere. Un semaforo però non
 * capisce il lavoro che guarda: non si accorge che «i test passano» era vero da
 * ore e a fallire era la misura, non vede che il compito è cambiato strada
 * facendo, non sa che un criterio ha smesso di avere senso.
 *
 * Qui il supervisore è una sessione Claude Code viva, che a ogni giro riceve il
 * quadro intero e sceglie la mossa. Le regole non spariscono: restano sotto,
 * come rete — i fatti verificabili battono qualunque opinione, anche la sua.
 */

/** Quanto dell'ultimo messaggio della chat entra nel quadro. */
const MESSAGGIO_MAX = 4000
/** Quanto di ogni uscita: oltre, si ripete senza aggiungere. */
const USCITA_NEL_QUADRO = 900
/** Quante mosse passate mostrare: bastano a far vedere un cerchio. */
const STORIA_NEL_QUADRO = 8

export type DecisioneSupervisore = {
  azione: 'prosegui' | 'finito' | 'chiedi' | 'correggiCriterio'
  /** Cosa deve fare adesso la chat. Serve a `prosegui`. */
  istruzioni?: string
  /** La domanda per l'utente. Serve a `chiedi`. */
  domanda?: string
  /** Il criterio da correggere, con il comando nuovo. Serve a `correggiCriterio`. */
  criterio?: { descrizione: string; comando: string }
  /** Perché ha deciso così: finisce nella storia, ed è quello che si rilegge dopo. */
  perche?: string
}

/**
 * Il quadro della situazione, per chi deve decidere.
 *
 * Tutto ciò che serve e niente che si possa dedurre. In particolare l'esito
 * **vero** di ogni criterio, dove «non si è potuto misurare» è una terza cosa,
 * diversa da soddisfatto e da fallito: confonderla con «fallito» è ciò che ha
 * tenuto un autopilota a correggere per ore un codice sano.
 */
export function componiPromptDecisione(
  a: Autopilota,
  esiti: EsitoVerifica[],
  ultimoMessaggio: string,
  inCerchioDa: number
): string {
  const statoCriteri = a.criteri
    .map((c) => {
      const esito = esiti.find((e) => e.descrizione === c.descrizione)
      if (esito === undefined) return `- «${c.descrizione}» — nessun comando: lo giudichi tu`
      if (esito.misurato === false) {
        return `- «${c.descrizione}» — NON MISURABILE: \`${esito.comando}\` non parte.\n  ${esito.uscita.slice(0, USCITA_NEL_QUADRO)}`
      }
      if (esito.passato) return `- «${c.descrizione}» — soddisfatto`
      return `- «${c.descrizione}» — non soddisfatto.\n  ${esito.uscita.slice(0, USCITA_NEL_QUADRO)}`
    })
    .join('\n')

  const storia = a.decisioni
    .slice(-STORIA_NEL_QUADRO)
    .map((d) => `- ${d.quando}: ${d.cosa.slice(0, 200)}`)
    .join('\n')

  const righe = [
    'Sei il supervisore di una chat Claude Code che sta lavorando a un compito.',
    'A ogni turno della chat decidi tu cosa succede dopo. Qui sotto hai il quadro intero.',
    '',
    `## Obiettivo\n${a.obiettivo}`,
    `\n## Cartella di lavoro\n${a.cwd}`,
    `\n## Criteri di fine, con l'esito di adesso\n${statoCriteri}`,
    a.decisioni.length > 0 ? `\n## Le ultime mosse\n${storia}` : '',
    inCerchioDa >= 2
      ? `\n## Attenzione\nSono ${inCerchioDa} giri che l'esito è identico. Quello che si sta facendo non funziona: cambia strada invece di insistere.`
      : '',
    `\n## Ultimo messaggio della chat\n${ultimoMessaggio.slice(0, MESSAGGIO_MAX)}`,
    '',
    '## Cosa puoi decidere',
    '- `prosegui`: la chat continua. Scrivi istruzioni concrete — cosa fare adesso, non un incoraggiamento.',
    "  **Se l'ultimo messaggio contiene una domanda, la risposta e' compito tuo**: obiettivo, criteri e",
    "  progetto quasi sempre ce l'hanno gia'. Girarla all'utente per prudenza gli toglie proprio il tempo",
    '  che questo sistema esiste per fargli guadagnare.',
    '- `finito`: il lavoro è concluso davvero. Un criterio verificabile che fallisce vince sulla tua',
    '  opinione: dichiarare finito un lavoro incompleto è il danno peggiore che tu possa fare.',
    '- `correggiCriterio`: un comando di verifica è sbagliato o non misura quello che dice di misurare.',
    '  Dai quello giusto: gira in `bash`, esce con 0 quando il criterio è soddisfatto, sta su una riga.',
    "- `chiedi`: serve qualcosa che solo l'utente può sapere — una credenziale, una scelta sul suo",
    "  prodotto o sul suo denaro. Nient'altro: fermarsi per una domanda evitabile gli toglie proprio il",
    '  tempo che questo sistema esiste per fargli guadagnare.',
    '',
    'Prima di decidere puoi guardare: leggi i file, esegui comandi, controlla il diff. Sei nella cartella',
    'di lavoro e hai gli strumenti. Non fidarti di quello che la chat dice di aver fatto: verificalo.',
    '',
    'Quando hai deciso, chiudi con un solo oggetto JSON e nient\'altro dopo:',
    '{"azione": "prosegui|finito|correggiCriterio|chiedi", "istruzioni": "...", "domanda": "...",',
    ' "criterio": {"descrizione": "...", "comando": "..."}, "perche": "una riga: perché questa mossa"}'
  ]
  return righe.filter((r) => r !== '').join('\n')
}

/**
 * Legge la decisione dal testo del supervisore.
 *
 * Prende l'**ultimo** oggetto JSON: il supervisore ragiona prima di decidere, e
 * un JSON citato a metà ragionamento non è la sua conclusione. La ricerca
 * all'indietro bilancia le parentesi, perché `criterio` è annidato e un
 * `indexOf('{')` prenderebbe l'oggetto sbagliato.
 */
export function leggiDecisioneSupervisore(testo: string): DecisioneSupervisore | undefined {
  const chiusura = testo.lastIndexOf('}')
  if (chiusura === -1) return undefined

  let profondita = 0
  for (let i = chiusura; i >= 0; i -= 1) {
    const ch = testo[i]
    if (ch === '}') profondita += 1
    else if (ch === '{') {
      profondita -= 1
      if (profondita !== 0) continue
      return interpreta(testo.slice(i, chiusura + 1))
    }
  }
  return undefined
}

function interpreta(json: string): DecisioneSupervisore | undefined {
  let g: Record<string, unknown>
  try {
    g = JSON.parse(json) as Record<string, unknown>
  } catch {
    return undefined
  }

  const azione = g.azione
  if (azione !== 'prosegui' && azione !== 'finito' && azione !== 'chiedi' && azione !== 'correggiCriterio') {
    return undefined
  }

  const testoDi = (v: unknown): string | undefined =>
    typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined

  const c = g.criterio
  // Un comando su più righe si scarta: un ritorno a capo dentro la stringa è
  // esattamente ciò che rompeva i comandi che ci hanno fatto perdere una notte.
  const criterio =
    typeof c === 'object' && c !== null &&
    typeof (c as Record<string, unknown>).descrizione === 'string' &&
    typeof (c as Record<string, unknown>).comando === 'string' &&
    ((c as Record<string, unknown>).comando as string).trim() !== '' &&
    !((c as Record<string, unknown>).comando as string).includes('\n')
      ? {
          descrizione: (c as Record<string, unknown>).descrizione as string,
          comando: ((c as Record<string, unknown>).comando as string).trim()
        }
      : undefined

  const istruzioni = testoDi(g.istruzioni)
  const domanda = testoDi(g.domanda)
  const perche = testoDi(g.perche)
  return {
    azione,
    ...(istruzioni !== undefined ? { istruzioni } : {}),
    ...(domanda !== undefined ? { domanda } : {}),
    ...(criterio !== undefined ? { criterio } : {}),
    ...(perche !== undefined ? { perche } : {})
  }
}

/**
 * Chiede al supervisore cosa fare, nella **sua** sessione.
 *
 * La sessione si riusa giro dopo giro: così ricorda cosa aveva già provato e
 * perché, invece di ricostruire il compito da capo a ogni fermata. È la
 * differenza fra qualcuno che segue il lavoro e qualcuno che lo vede per la
 * prima volta ogni volta.
 */
export async function chiediDecisione(
  a: Autopilota,
  esiti: EsitoVerifica[],
  ultimoMessaggio: string,
  inCerchioDa: number,
  interroga: Interrogazione,
  sessioneSupervisore: string | undefined
): Promise<{ decisione: DecisioneSupervisore | undefined; sessionId?: string }> {
  try {
    const { testo, sessionId } = await interroga(
      componiPromptDecisione(a, esiti, ultimoMessaggio, inCerchioDa),
      a.cwd,
      sessioneSupervisore
    )
    return {
      decisione: leggiDecisioneSupervisore(testo),
      ...(sessionId !== undefined ? { sessionId } : {})
    }
  } catch (err) {
    // Un guasto del supervisore non decide niente: sotto ci sono ancora le
    // regole, e quelle non dipendono da nessun modello.
    console.error('[autopilota] decisione del supervisore non ottenuta:', err)
    return { decisione: undefined }
  }
}
