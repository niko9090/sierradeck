import { delimiter, isAbsolute, join } from 'node:path'

/**
 * Ciò che serve sapere del computer per decidere. Iniettato invece che letto:
 * la parte che può sbagliare è *dove si cerca e in che ordine*, e quella si
 * verifica senza dipendere da com'è messa questa macchina.
 */
export type Sistema = {
  env: Record<string, string | undefined>
  /** La cartella dell'utente. */
  casa: string
  esiste: (percorso: string) => boolean
}

export type StatoPreparazione = {
  /** Dove sta `claude.exe`, quando l'abbiamo trovato. */
  claude?: string
  /**
   * Cosa manca e **non** tocca a noi installare, già scritto per chi legge.
   *
   * Installare un runtime di sistema al posto di qualcuno è un gesto che si fa
   * solo se lo si è chiesto: qui si dice e basta.
   */
  avvisi: string[]
}

export type Comando = { command: string; args: string[] }

/**
 * Il nome del file, con l'estensione, non negoziabile.
 *
 * node-pty su Windows non usa la risoluzione di sistema: implementa la propria
 * ricerca sul PATH e non consulta mai PATHEXT. Con `claude` cercherebbe un file
 * senza estensione, non lo troverebbe, e fallirebbe con un percorso vuoto — un
 * fallimento insidioso, perché la finestra si apre e il riquadro resta vuoto.
 * È la stessa ragione già scritta in `config.ts`.
 */
const ESEGUIBILE = 'claude.exe'

/**
 * Dove cercare Claude Code, in ordine di fiducia.
 *
 * L'ordine è quello della certezza, non della comodità: prima ciò che l'utente
 * ha scelto esplicitamente, poi il posto in cui lo mette l'installatore
 * ufficiale, poi il PATH, e infine i posti dei gestori di pacchetti. Un
 * percorso scelto a mano non deve mai perdere contro uno indovinato.
 *
 * `GESTORE_CLAUDE_PATH` entra solo se è un percorso assoluto: un valore
 * relativo verrebbe risolto rispetto alla cartella di lavoro del processo, che
 * non è quella di nessuna chat.
 */
export function candidatiClaude(s: Sistema): string[] {
  const candidati: string[] = []

  const scelto = s.env.GESTORE_CLAUDE_PATH
  if (scelto !== undefined && scelto.trim() !== '' && isAbsolute(scelto)) candidati.push(scelto)

  // L'installatore nativo di Windows: `irm https://claude.ai/install.ps1 | iex`
  // scrive qui, e ci scrive anche l'aggiornamento automatico.
  candidati.push(join(s.casa, '.local', 'bin', ESEGUIBILE))

  const percorso = s.env.Path ?? s.env.PATH ?? ''
  for (const cartella of percorso.split(delimiter)) {
    const pulita = cartella.trim().replace(/^"|"$/g, '')
    if (pulita === '') continue
    candidati.push(join(pulita, ESEGUIBILE))
  }

  // I due gestori di pacchetti che mettono un collegamento fuori dal PATH
  // quando il PATH non è stato ricaricato: succede a chi ha installato Claude
  // Code e non ha ancora riaperto la sessione di Windows.
  const localAppData = s.env.LOCALAPPDATA
  if (localAppData !== undefined && localAppData !== '') {
    candidati.push(join(localAppData, 'Microsoft', 'WinGet', 'Links', ESEGUIBILE))
  }
  const appData = s.env.APPDATA
  if (appData !== undefined && appData !== '') {
    candidati.push(join(appData, 'npm', ESEGUIBILE))
  }

  // Senza duplicati: il PATH contiene spesso due volte la stessa cartella, e
  // ogni candidato costa una statistica di file all'avvio.
  return [...new Set(candidati)]
}

/** Il primo candidato che esiste davvero. */
export function trovaClaude(s: Sistema): string | undefined {
  return candidatiClaude(s).find((p) => s.esiste(p))
}

/**
 * Cerca un eseguibile nel solo PATH. Serve ai runtime di sistema, che non
 * hanno un posto «nostro» in cui guardare.
 */
function nelPath(s: Sistema, nomeFile: string): boolean {
  const percorso = s.env.Path ?? s.env.PATH ?? ''
  return percorso
    .split(delimiter)
    .some((c) => c.trim() !== '' && s.esiste(join(c.trim().replace(/^"|"$/g, ''), nomeFile)))
}

/**
 * Ciò che manca e va soltanto detto.
 *
 * Nessuno dei due impedisce di lavorare, ed è per questo che sono avvisi e non
 * blocchi: si scrive cosa costa non averli, così chi legge decide se gliene
 * importa.
 */
export function avvisiDiSistema(s: Sistema): string[] {
  const avvisi: string[] = []
  if (!nelPath(s, 'node.exe')) {
    avvisi.push(
      'Node.js non risulta installato. SierraDeck funziona lo stesso — porta con sé il proprio — ' +
      'ma i criteri di verifica degli autopiloti che lanciano «npm» o «node» falliranno.'
    )
  }
  if (!nelPath(s, 'git.exe')) {
    avvisi.push(
      'Git per Windows non risulta installato. Senza, Claude Code esegue i comandi con PowerShell ' +
      'invece che con Bash: molti comandi scritti per Linux non funzioneranno.'
    )
  }
  return avvisi
}

/**
 * Cosa c'è e cosa manca, al primo avvio come a tutti gli altri.
 *
 * Chi installa SierraDeck non deve sapere cos'è un PATH: il programma guarda
 * cosa manca e fa quello che può fare al posto suo. Trovare `claude.exe` è la
 * parte che può fare da solo; il resto lo dice.
 */
export function preparaAmbiente(s: Sistema): StatoPreparazione {
  const claude = trovaClaude(s)
  return { ...(claude !== undefined ? { claude } : {}), avvisi: avvisiDiSistema(s) }
}

/**
 * Il comando che installa Claude Code su Windows.
 *
 * È l'installatore ufficiale documentato da Anthropic, eseguito in memoria: per
 * questo non serve toccare la politica di esecuzione degli script, che è una
 * difesa del sistema e non va allentata per comodità nostra. `-NoProfile`
 * perché il profilo dell'utente non ha niente a che fare con
 * un'installazione, e un profilo rotto non deve farla fallire.
 *
 * Si ferma dove è giusto che si fermi: l'accesso lo fa l'utente nel browser,
 * con le sue credenziali.
 */
export const INSTALLA_CLAUDE: Comando = {
  command: 'powershell.exe',
  args: ['-NoProfile', '-Command', 'irm https://claude.ai/install.ps1 | iex']
}

/**
 * Il comando che porta all'accesso.
 *
 * Nessun argomento: lanciato senza, Claude Code apre il browser e aspetta. È il
 * modo documentato di fare il login, ed è l'unico pezzo che resta all'utente.
 */
export function comandoAccesso(percorsoClaude: string): Comando {
  return { command: percorsoClaude, args: [] }
}
