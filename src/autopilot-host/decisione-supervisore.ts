import type { Autopilota } from '@shared/autopilota'
import type { EsitoVerifica } from './decisione'
import type { Interrogazione } from './supervisore'
import { FORMA_DOMANDA, REGOLE_DOMANDA, leggiParti, type PartiDomanda } from '@shared/domanda-strutturata'

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
const MESSAGGIO_MAX = 1500
/** Quanto di ogni uscita (29/10: da 900 a 300): oltre, si ripete senza aggiungere. */
const USCITA_NEL_QUADRO = 300
/** Quanto dell'obiettivo: il resto lo dicono i criteri e il compito della chat. */
const OBIETTIVO_NEL_QUADRO = 1200
/**
 * **Il tetto del prompt intero** (29/10). Il supervisore riceveva ~820k token a
 * prompt fra sessione ripresa e quadro: adesso ogni decisione di routine sta
 * in circa 8.000 caratteri. Se si sfora, si accorcia lo stato del programma.
 */
export const PROMPT_MAX = 8000
/** Quante mosse passate mostrare: bastano a far vedere un cerchio. */
const STORIA_NEL_QUADRO = 8

export type DecisioneSupervisore = {
  azione: 'prosegui' | 'finito' | 'chiedi' | 'correggiCriterio'
  /** Cosa deve fare adesso la chat. Serve a `prosegui`. */
  istruzioni?: string
  /** La domanda per l'utente. Serve a `chiedi`. */
  domanda?: string
  /** Le sue cinque parti (0.41.0): cosa sta facendo, domanda, perché, scelte, se non rispondi. */
  parti?: PartiDomanda
  /** Il criterio da correggere, con il comando nuovo. Serve a `correggiCriterio`. */
  criterio?: { descrizione: string; comando: string }
  /** Perché ha deciso così: finisce nella storia, ed è quello che si rilegge dopo. */
  perche?: string
  /**
   * Le mosse sul programma che chiede (0.36.0): aprire o chiudere una sua chat,
   * scrivere nel quaderno. Grezze: le legge e le giudica `divieti.ts`, e il
   * programma rifiuta quelle vietate qualunque cosa il modello scriva.
   */
  mosse?: unknown
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
  inCerchioDa: number,
  /**
   * Quello che chi ha affidato il lavoro ha scritto dalla scheda, e che la
   * chat riceverà insieme alle istruzioni di questo turno. Il supervisore
   * deve saperlo: un'istruzione che lo contraddice farebbe lavorare la chat
   * contro chi l'ha chiesta.
   */
  messaggiTuoi: string[] = [],
  /** Lo stato del programma e le mosse permesse (harness, 0.36.0). Vuoto = come prima. */
  harness = ''
): string {
  const statoCriteri = a.criteri
    .map((c) => {
      const esito = esiti.find((e) => e.descrizione === c.descrizione)
      if (esito === undefined) return `- «${c.descrizione}» — nessun comando: lo giudichi tu`
      if (esito.misurato === false) {
        return `- «${c.descrizione}» — NON MISURABILE: \`${esito.comando}\` non parte.\n  ${esito.uscita.slice(0, USCITA_NEL_QUADRO)}`
      }
      // Un comando lungo non rimisurato in questo turno (0.71.0): lo si dice, non è un esito fresco.
      const vecchio = esito.rimandatoDal !== undefined ? ` (esito delle ${esito.rimandatoDal.slice(11, 16)} UTC, non rimisurato in questo turno)` : ''
      if (esito.passato) return `- «${c.descrizione}» — soddisfatto${vecchio}`
      return `- «${c.descrizione}» — non soddisfatto${vecchio}.\n  ${esito.uscita.slice(0, USCITA_NEL_QUADRO)}`
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
    `## Obiettivo\n${a.obiettivo.length <= OBIETTIVO_NEL_QUADRO ? a.obiettivo : `${a.obiettivo.slice(0, OBIETTIVO_NEL_QUADRO - 1)}…`}`,
    `\n## Cartella di lavoro\n${a.cwd}`,
    `\n## Criteri di fine, con l'esito di adesso\n${statoCriteri}`,
    a.decisioni.length > 0 ? `\n## Le ultime mosse\n${storia}` : '',
    inCerchioDa >= 2
      ? `\n## Attenzione\nSono ${inCerchioDa} giri che l'esito è identico. Quello che si sta facendo non funziona: cambia strada invece di insistere.`
      : '',
    `\n## Ultimo messaggio della chat\n${ultimoMessaggio.slice(0, MESSAGGIO_MAX)}`,
    messaggiTuoi.length > 0
      ? `\n## Chi ha affidato il lavoro ha scritto (la chat lo riceverà davanti alle tue istruzioni)\n${messaggiTuoi.map((m) => `- ${m.slice(0, 600)}`).join('\n')}\nLe tue istruzioni devono tenerne conto, non contraddirlo.`
      : '',
    harness !== '' ? `\n${HARNESS_SEGNO}` : '',
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
    ...REGOLE_DOMANDA,
    '',
    // 29/10: niente strumenti. I fatti li ha misurati il programma (criteri,
    // git, `fattiVerificati` nello stato del programma): si decide su quelli.
    'Decidi sui fatti qui sopra: li ha misurati il programma (criteri, git, stato delle chat). Non fidarti',
    'di quello che la chat dice di aver fatto se i fatti dicono altro.',
    'Non chiedere mai alle chat di scrivere note, rapporti o liste in un file: il rapporto è una riga nel testo.',
    '',
    'Quando hai deciso, chiudi con un solo oggetto JSON e nient\'altro dopo:',
    `{"azione": "prosegui|finito|correggiCriterio|chiedi", "istruzioni": "...", "domanda": ${FORMA_DOMANDA},`,
    ' "criterio": {"descrizione": "...", "comando": "..."}, "perche": "una riga: perché questa mossa"' +
      (harness !== ''
        ? ',\n "mosse": [{"tipo": "apriChat", "compito": "..."}, {"tipo": "chiudiChat", "chat": "c-2"}, {"tipo": "quaderno", "titolo": "...", "corpo": "..."}]}'
        : '}')
  ]
  const senza = righe.filter((r) => r !== '').join('\n')
  if (harness === '') return senza
  // Lo stato del programma prende lo spazio che resta sotto `PROMPT_MAX`.
  const spazio = Math.max(600, PROMPT_MAX - (senza.length - HARNESS_SEGNO.length))
  const quadro = harness.length <= spazio ? harness : `${harness.slice(0, spazio - 20)}\n[…accorciato…]`
  return senza.replace(HARNESS_SEGNO, () => quadro)
}

/** Il posto dello stato del programma nel prompt, riempito per ultimo (29/10). */
const HARNESS_SEGNO = '\u0000QUADRO-DEL-PROGRAMMA\u0000'

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
  // La domanda con le sue parti (0.41.0); una stringa sola vale «solo la domanda».
  const parti = g.domanda !== undefined && g.domanda !== null ? leggiParti(g.domanda) : undefined
  const domanda = parti !== undefined && parti.domanda !== '' ? parti.domanda : undefined
  const perche = testoDi(g.perche)
  return {
    azione,
    ...(istruzioni !== undefined ? { istruzioni } : {}),
    ...(domanda !== undefined ? { domanda } : {}),
    ...(parti !== undefined && domanda !== undefined ? { parti } : {}),
    ...(criterio !== undefined ? { criterio } : {}),
    ...(perche !== undefined ? { perche } : {}),
    ...(Array.isArray(g.mosse) ? { mosse: g.mosse } : {})
  }
}

/**
 * Chiede al supervisore cosa fare.
 *
 * 30/10: **sempre senza sessione**, anche se gliene si dà una. Prima una
 * sessione data si riprendeva con `--resume`, e la conversazione cresceva a
 * ogni giro senza fine; le ultime mosse e lo stato sono già nel prompt
 * (`componiPromptDecisione`). `sessioneSupervisore` resta per chi la passa
 * ancora, e non si usa.
 */
export async function chiediDecisione(
  a: Autopilota,
  esiti: EsitoVerifica[],
  ultimoMessaggio: string,
  inCerchioDa: number,
  interroga: Interrogazione,
  _sessioneSupervisore: string | undefined,
  messaggiTuoi: string[] = [],
  harness = ''
): Promise<{ decisione: DecisioneSupervisore | undefined; sessionId?: string }> {
  try {
    // 29/10: una decisione di routine (modello leggero, niente strumenti, al
    // più tre turni, senza sessione).
    const { testo, sessionId } = await interroga(
      componiPromptDecisione(a, esiti, ultimoMessaggio, inCerchioDa, messaggiTuoi, harness),
      a.cwd,
      undefined,
      { routine: true }
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
