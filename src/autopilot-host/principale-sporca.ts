import type { PartiDomanda } from '@shared/domanda-strutturata'

/**
 * **I file non salvati della cartella principale che fermano un'unione** (11/11).
 *
 * L'unione di prova si ferma solo se il ramo tocca un file che nella cartella
 * principale è modificato e non salvato (`iniziaProvaPassi`). In quel caso
 * nessuno poteva sbloccarla: gli specialisti lavorano nella loro copia,
 * l'autopilota non lancia comandi e non può chiedere a Nicholas un lavoro a
 * mano. La fila restava ferma per ore e Nicholas non lo sapeva.
 *
 * Adesso, dopo `CHIEDI_SALVA_DOPO_MS`, glielo chiede **il programma**, una
 * volta sola, con i nomi dei file e due scelte. Col suo sì il programma fa un
 * commit di quei file e basta (`salvaFileAsincrono`): mai stash, mai reset,
 * mai checkout. La domanda non si chiude mai con una scelta automatica: un
 * commit dei suoi file si fa solo col suo sì.
 */

/** Dopo quanto il programma chiede a Nicholas se salvare lui i file. */
export const CHIEDI_SALVA_DOPO_MS = 5 * 60_000
/** Dopo quanto un'unione ferma lascia passare le altre: va in fondo alla fila. */
export const SPORCA_IN_FONDO_DOPO_MS = 10 * 60_000
/**
 * Quanto il programma resta in attesa della risposta prima di rimettersi in
 * attesa da capo: venti giorni (un timer di Node non regge oltre 24). Finché
 * qualcuno la aspetta, il registro delle domande non la chiude da solo.
 */
export const DOMANDA_SALVA_VALE_MS = 20 * 24 * 60 * 60_000
/** Oltre così tanti file non si chiede: sono troppi per leggerli e dire sì. */
export const FILE_DA_CHIEDERE_MAX = 60

export const SCELTA_SALVA = 'Salvali e unisci'
export const SCELTA_ASPETTA = 'Aspetta, li sistemo io'
/** Il messaggio del commit fatto col suo sì. */
export const COMMIT_SALVA = 'lavoro in corso nella cartella principale, salvato col consenso per far passare le unioni'

/** I file, uno per riga: i nomi contano, è su quelli che Nicholas dice sì. */
const elenco = (file: readonly string[]): string => file.map((f) => `• ${f}`).join('\n')

/** Le cinque parti della domanda. `cosa`: il lavoro da unire, a parole. */
export function partiDomandaSalva(file: readonly string[], cosa: string): PartiDomanda {
  const quanti = file.length === 1 ? 'un file modificato e non salvato' : `${file.length} file modificati e non salvati`
  // Il nome del lavoro, corto: la domanda deve restare una frase.
  const nome = cosa.length > 60 ? `${cosa.slice(0, 59)}…` : cosa
  const chi = nome !== '' ? `Il lavoro finito «${nome}»` : 'Un lavoro finito, da unire,'
  return {
    staFacendo: `unisce un lavoro finito${cosa !== '' ? `: «${cosa}»` : ''}`,
    domanda: `${chi} tocca ${quanti} della cartella principale: ${file.length === 1 ? 'lo' : 'li'} salvo io con un commit?`,
    perche: `Finché non sono salvati l’unione aspetta. I file:\n${elenco(file)}`,
    scelte: [
      { scelta: SCELTA_SALVA, conseguenza: 'faccio un commit di questi file così come sono, e solo di questi, poi unisco', consigliata: true },
      { scelta: SCELTA_ASPETTA, conseguenza: 'non tocco niente: l’unione parte da sola quando li hai salvati o annullati' }
    ],
    seNonRispondi: 'aspetto: non salvo niente da solo, e questa domanda resta aperta finché non rispondi'
  }
}

/**
 * La risposta è un sì a salvare? Vale la scelta, o una risposta scritta che
 * comincia con un sì e non nega né rimanda. Nel dubbio, no: un commit dei
 * file di Nicholas non si fa per un malinteso.
 */
export function rispostaSalva(risposta: string): boolean {
  const t = risposta.trim().toLowerCase().replace(/\s+/gu, ' ')
  if (t === '') return false
  if (t === SCELTA_SALVA.toLowerCase() || t === `${SCELTA_SALVA.toLowerCase()} (consigliata)`) return true
  if (/(^|[\s,.;:!?'’"«(])(no|non|nega|niente|mai|aspetta|ferma|dopo|annulla|not|don'?t)(?=$|[\s,.;:!?])/u.test(t)) return false
  return /^(salvali|salva|s[iì]|ok|okay|va bene|vai|certo|yes)(?=$|[\s,.;:!?])/u.test(t)
}

/** Lo stesso elenco di file, comunque ordinato: serve a riconoscere la domanda già aperta. */
export function stessiFile(a: readonly string[], b: readonly string[]): boolean {
  const n = (x: readonly string[]): string => [...x].map((f) => f.replace(/\\/gu, '/').toLowerCase()).sort().join('\n')
  return n(a) === n(b)
}
