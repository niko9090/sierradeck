import { delimiter, isAbsolute, join } from 'node:path'
import { RUNTIME, doveSta } from '@shared/runtime-noti'
import type { StatoRuntime } from './installa-runtime'

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
   * Cosa manca, già scritto per chi legge. Node.js e Git li installa il
   * programma da solo all'avvio (0.91.0, Nicholas 04/11): qui si dice a che
   * punto è.
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
 * Node.js e Git: cosa manca e a che punto è la loro installazione.
 *
 * Nessuno dei due impedisce di aprire le chat, ed è per questo che sono avvisi
 * e non blocchi.
 */
export function avvisiDiSistema(s: Sistema, stati: StatoRuntime[] = []): string[] {
  const avvisi: string[] = []
  for (const r of RUNTIME) {
    if (doveSta(r, s.env, s.esiste) !== undefined) continue
    const st = stati.find((x) => x.nome === r.nome)
    const cosa = r.nome === 'Git' ? 'Git per Windows' : 'Node.js'
    const costo = r.nome === 'Git'
      ? 'senza, gli autopiloti non hanno copie di lavoro e Claude Code usa PowerShell invece di Bash'
      : 'senza, i criteri che lanciano «npm» o «node» falliscono'
    if (st?.stato === 'fallito') avvisi.push(`${cosa} manca e l’installazione automatica non è riuscita (${st.dettaglio ?? 'motivo sconosciuto'}): ${costo}. Premi «Installa Node.js e Git» per riprovare.`)
    else if (st?.stato === 'installato') avvisi.push(`${cosa} è stato installato: riavvia SierraDeck se qualcosa non lo trova ancora.`)
    else avvisi.push(`${cosa} manca: lo sto installando da solo${r.nome === 'Node.js' ? ' (Windows può chiederti il sì per l’amministratore)' : ''}. Intanto ${costo}.`)
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
export function preparaAmbiente(s: Sistema, stati: StatoRuntime[] = []): StatoPreparazione {
  const claude = trovaClaude(s)
  return { ...(claude !== undefined ? { claude } : {}), avvisi: avvisiDiSistema(s, stati) }
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
