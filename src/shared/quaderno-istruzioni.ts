import { CARTELLA_QUADERNO, SOTTOCARTELLA } from './quaderno'
import { FILE_DECISIONI, FILE_LEZIONI } from './quaderno-lezioni'

/**
 * La regola del quaderno, iniettata nel prompt di sistema di **ogni** chat
 * aperta dal Gestore (`--append-system-prompt`), senza toccare nessun file
 * dell'utente né `~/.claude`.
 *
 * P2 (30/10): «il quaderno annota ciò che va ricordato, così le chat finite si
 * eliminano e non resta niente che non serve». Prima la regola chiedeva una
 * scheda per argomento, e il quaderno di SierraDeck era arrivato a 533 note
 * (6 MB), molte quasi uguali. Adesso il quaderno sono due file soli:
 * `lezioni.md` (una riga per lezione, una sezione per tag) e `decisioni.md`
 * (le decisioni e le regole di Nicholas). Una lezione si aggiunge come una
 * riga, mai come un file nuovo; le chat dell'autopilota la scrivono nelle righe
 * `LEZIONI:` e la annota il programma. Breve di proposito: viaggia in ogni chat.
 */
export const DIRETTIVA_QUADERNO = [
  'Stai lavorando dentro SierraDeck. Questo progetto ha un QUADERNO condiviso in',
  `\`${CARTELLA_QUADERNO}/${SOTTOCARTELLA}/\`: \`${FILE_LEZIONI}\` (una riga per lezione, una sezione \`## tag\` per argomento)`,
  `e \`${FILE_DECISIONI}\` (le decisioni e le Regole di Nicholas, che valgono sempre).`,
  'Leggili quando il compito tocca qualcosa che potrebbero già dire.',
  '',
  'Quando emerge una cosa duratura da ricordare (una trappola, un vincolo scoperto, una',
  'decisione e il perché, la causa di un errore) DEVI annotarla, in una riga sola:',
  `- in una chat dell'autopilota: nelle righe LEZIONI: alla fine del compito, come dice il primo messaggio;`,
  `- altrimenti: una riga \`- testo\` sotto la sezione giusta di \`${FILE_LEZIONI}\`, se non c'è già.`,
  'MAI file nuovi nel quaderno, mai resoconti, storici o note di giro: le chat finite si',
  'eliminano, e resta solo quello che serve.'
].join('\n')
