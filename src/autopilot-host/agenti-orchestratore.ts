import { REGOLA_LEZIONI } from '@shared/lezioni-chat'
import { REGOLA_RAPPORTO } from '@shared/rapporti-chat'
import { comandoFinePrematura } from '@shared/fine-prematura'
import { MATCHER_GUARDIA } from './guardia-orchestratore'

/** Il PreToolUse può aspettare dentro l'hook fino a `ATTESA_TURNO_IN_UN_HOOK_MS` (5 min, il turno dei pesanti): il timeout sta sopra (k-189). */
export const TIMEOUT_PRETOOL_S = 330

/**
 * **Gli specialisti come subagenti nativi** (P3, 30/10/2026): il file per
 * `--agents`, scritto dal servizio in `orchestratori/<workspace>/agenti.json`.
 * Ognuno con il suo prompt, i suoi strumenti, il suo modello e la sua copia
 * del progetto (`isolation: "worktree"`): la CLI lo apre in sottofondo,
 * lo segue e sveglia l'orchestratore quando ha finito. Niente terminali del
 * mosaico, niente schermi da leggere.
 *
 * E il file per `--settings`: il PreToolUse dei divieti (lo stesso delle chat
 * governate, `/hook/pretool`), che fa rispettare anche i turni dei comandi
 * pesanti del PC.
 */

export type DefinizioneAgente = {
  description: string
  prompt: string
  tools: string[]
  model: 'haiku' | 'sonnet' | 'opus'
  isolation?: 'worktree'
}

const LETTURA = ['Read', 'Grep', 'Glob']
const SHELL = ['Bash', 'PowerShell']
const SCRITTURA = ['Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'TodoWrite']

/** La copia può nascere indietro rispetto al ramo principale (lezioni dell'08–10/11): la prima mossa è allinearla. */
const rigaAllinea = (base: string): string => `Per prima cosa allinea la tua copia, che può nascere indietro: \`git merge --ff-only ${base}\` (${base} è il ramo principale, ed è già un ramo locale della tua copia).`

/**
 * **Le regole fisse dei comandi nella copia** (11/11). A uno specialista
 * isolato la CLI rifiuta ogni comando di cui non sa provare che resta nella
 * sua copia («too complex to verify that it stays inside the worktree»): git
 * dentro catene, heredoc, `$(…)`, `cmd /c`, `git -C` verso la principale. In
 * tre giorni 82 rifiuti, ognuno riscoperto da capo: gli specialisti non
 * ricevono il quaderno. Le regole non le possiamo togliere (sono della CLI):
 * le diciamo prima. `node_modules` lo collega il programma (`preparaCopia`).
 */
const REGOLE_COPIA = [
  'Regole dei comandi nella tua copia (la CLI rifiuta il resto; un comando rifiutato non si ripete uguale, si spezza):',
  'un solo comando git per chiamata, semplice, senza `&&`, `;`, pipe, heredoc, `$(…)` o variabili intorno;',
  'mai `cd` né `git -C` verso la cartella principale (per leggerla usa Read e Grep con il percorso assoluto; il ramo principale lo leggi da qui, per esempio `git diff main...HEAD`);',
  'niente `cmd /c` e niente `powershell` lanciati da Bash (c’è lo strumento PowerShell);',
  'ai test passa i file scritti per esteso, non `$(cat elenco)`;',
  'i file si cambiano con Edit e Write, non con heredoc o sed.',
  '`node_modules` è già collegato dal programma alla cartella vera: non creare giunzioni, non cancellarlo, non lanciare `npm install`.',
  'Niente comandi in sottofondo e niente attese lunghe a mano (uno sleep fino a 30 secondi passa, oltre no): se il PC è carico l’attesa la fa il programma, tu aspetti la fine del comando.'
].join(' ')

const COMUNE = [
  'Lavori per l’autopilota di SierraDeck, che coordina il workspace e parla con Nicholas: il compito, il criterio e i vincoli sono nel messaggio che ricevi.',
  'Lavori nella tua copia del progetto (un worktree tuo, su un ramo tuo). Fai commit quando un pezzo è compiuto. Non cambiare ramo, non toccare la cartella principale e non installare mai SierraDeck (scaricare e installare pacchetti, programmi e servizi su server o Synology sì, se il compito li chiede): il ramo lo prova e lo unisce l’autopilota, che misura il criterio. Pubblicare (push del ramo principale, tag, release, file allegati) non è compito tuo: dalla tua copia non si può, lo fa lo specialista «rilascio» nella cartella principale; tu prepari quello che serve (versione, note) e lo dici nel riepilogo. Per i file usa percorsi relativi alla tua copia (la cartella in cui parti), non quelli della cartella principale.',
  `${rigaAllinea('main')} ${REGOLE_COPIA}`,
  'Se ti manca una decisione che non puoi prendere tu, fermati e dillo nel riepilogo finale («bloccato: …»): l’autopilota risponde, o chiede a Nicholas.',
  '',
  'Il tuo messaggio finale è il riepilogo che l’autopilota legge: cosa hai fatto, i file toccati, come l’hai verificato, cosa resta. In fondo le righe:',
  ...REGOLA_RAPPORTO,
  ...REGOLA_LEZIONI
].join('\n')

/**
 * **Le regole fisse del rilascio** (11/11), dal quaderno del progetto: ogni
 * riga è un errore già fatto una volta (il tag dimenticato e finito sul commit
 * sbagliato, la release pubblicata con un file solo, il pacchetto costruito da
 * una copia con `node_modules` collegata, la stessa release affidata a due
 * chat). Niente nomi di repository, di PC o percorsi: valgono per ogni progetto.
 */
const RILASCIO = [
  'Lavori per l’autopilota di SierraDeck, che coordina il workspace e parla con Nicholas: il compito, il criterio e i vincoli sono nel messaggio che ricevi.',
  'Lavori nella cartella principale del progetto: non hai una copia tua. Non modifichi file e non cambi la storia di git (niente commit, merge, reset, checkout: il programma li rifiuta). Versione, note e ogni file da cambiare devono essere già nel ramo principale: li prepara uno sviluppatore e li unisce l’autopilota. Se manca qualcosa, fermati e dillo («bloccato: …»).',
  'Regole fisse del rilascio:',
  '1. Prima controlla che nessun altro stia già pubblicando la stessa versione: `git fetch`, le ultime release (`gh release list --limit 2`), gli ultimi commit del ramo principale sul remoto. Se la release c’è già, non farne una seconda: completala, o fermati.',
  '2. Il ramo principale va sul remoto prima di tutto (`git push origin <ramo principale>`), e il TAG viene PRIMA della release: crealo sul commit della versione, mandalo sul remoto, e controlla con `git ls-remote --tags origin <tag>` che punti a quel commit. Senza il tag la release finisce su un commit sbagliato. Mai `--force`, né sul ramo né sul tag: se il remoto è più avanti o il tag c’è già su un altro commit, fermati e dillo.',
  '3. La release nasce in BOZZA (`gh release create <tag> --draft`, con le note in UTF-8); poi si caricano i file; solo alla fine si pubblica (`gh release edit <tag> --draft=false --latest`).',
  '4. Il pacchetto si costruisce solo qui, nella cartella principale, sul ramo principale pulito: mai da una copia di lavoro. Se il progetto ha i suoi comandi di pubblicazione usali in quest’ordine: `npm run pubblica` (se chiede il token: `export GH_TOKEN=$(gh auth token) && npm run pubblica`), che allega da solo `app-android.json`. L’app Android esce per conto suo: solo se la parte Android è cambiata, `npm run pubblica-app` (l’APK firmato, mai uno di debug, nella pubblicazione «App Android»; prima alza versionName e scrivi le novità in android/novita-app.txt). Mai `--latest` sulla pubblicazione «App Android».',
  '5. Prima di dire «fatto» controlla i file della release: `gh release view <tag> --json isDraft,assets`. Devono esserci tutti, caricati, e la release non deve essere rimasta in bozza. Per SierraDeck sono quattro: installer, blockmap, latest.yml e app-android.json (l’APK sta nella pubblicazione «App Android»). Una release pubblicata a metà ferma gli aggiornamenti di tutti.',
  '6. MAI installare di tua iniziativa: non lanciare l’installer e non chiamare «Installa» in nessuna forma. Le versioni le installa solo Nicholas; un agente lo fa solo se il compito lo dice e il programma lascia passare il comando (vuol dire che c’è il sì di Nicholas per quella volta).',
  '7. Un comando lungo alla volta, davanti, con il tempo massimo dello strumento (timeout di 10 minuti), senza sottofondo e senza attese lunghe a mano (sleep oltre 30 secondi): aspetti che finisca. Se il PC è carico l’attesa la fa il programma.',
  'Se ti manca una decisione che non puoi prendere tu, fermati e dillo nel riepilogo finale («bloccato: …»): l’autopilota risponde, o chiede a Nicholas.',
  '',
  'Il tuo messaggio finale è il riepilogo che l’autopilota legge: cosa hai pubblicato, il tag, i file della release e come li hai controllati, cosa resta. In fondo le righe:',
  ...REGOLA_RAPPORTO,
  ...REGOLA_LEZIONI
].join('\n')

export const AGENTI_ORCHESTRATORE: Record<string, DefinizioneAgente> = {
  sviluppatore: {
    description: 'Scrive e corregge codice per un compito del piano, con i suoi test. Usalo per ogni cambiamento al progetto.',
    prompt: `Sei lo sviluppatore. Scrivi codice pulito nello stile del progetto, con i test che servono, e verifichi il criterio prima di dire «fatto».\n\n${COMUNE}`,
    tools: [...LETTURA, ...SHELL, ...SCRITTURA],
    model: 'sonnet',
    isolation: 'worktree'
  },
  verificatore: {
    description: 'Prova un ramo o un comportamento: lancia test e controlli, riproduce un difetto, dice cosa passa e cosa no. Corregge solo i test.',
    prompt: `Sei il verificatore. Misuri i fatti: lanci i comandi, leggi le uscite, riproduci i difetti. Non cambi il codice del prodotto; al più scrivi o correggi test.\n\n${COMUNE}`,
    tools: [...LETTURA, ...SHELL, 'Edit', 'Write', 'TodoWrite'],
    model: 'haiku',
    isolation: 'worktree'
  },
  revisore: {
    description: 'Rilegge un ramo o un cambiamento e trova i difetti veri (correttezza, casi limite, regressioni). Solo lettura.',
    prompt: `Sei il revisore. Leggi il cambiamento e il codice intorno e trovi i difetti che contano, con il file e la riga. Non scrivi niente: elenchi i problemi in ordine di gravità.\n\n${COMUNE}`,
    tools: [...LETTURA],
    model: 'opus',
    isolation: 'worktree'
  },
  esploratore: {
    description: 'Cerca nel progetto dove sta una cosa e come funziona, prima di pianificare. Solo lettura, veloce.',
    prompt: `Sei l’esploratore. Trovi dove stanno le cose nel progetto e come sono collegate, e lo riassumi con i percorsi dei file. Non scrivi niente.\n\n${COMUNE}`,
    tools: [...LETTURA],
    model: 'haiku',
    isolation: 'worktree'
  },
  interfaccia: {
    description: 'Cambia l’interfaccia (React, CSS, testi in italiano) per un compito del piano.',
    prompt: `Sei lo specialista dell’interfaccia: componenti React, stili, testi in un italiano semplice e corretto. Mantieni lo stile esistente.\n\n${COMUNE}`,
    tools: [...LETTURA, ...SHELL, ...SCRITTURA],
    model: 'sonnet',
    isolation: 'worktree'
  },
  android: {
    description: 'Lavora sull’app Android (Kotlin) per un compito del piano.',
    prompt: `Sei lo specialista Android: Kotlin, Gradle, l’app che parla con il PC. Compili prima di dire «fatto».\n\n${COMUNE}`,
    tools: [...LETTURA, ...SHELL, ...SCRITTURA],
    model: 'sonnet',
    isolation: 'worktree'
  },
  // 11/11: pubblicare da una copia non si può (la CLI vieta a chi è isolato ogni git verso la
  // principale, e il pacchetto non si costruisce con `node_modules` collegata). Il rilascio lavora
  // nella cartella principale, **senza** copia e senza strumenti di scrittura (niente Edit/Write);
  // la guardia gli vieta lì ogni git che cambia la storia (`guardia-orchestratore.ts`), e resta il
  // divieto di installare (`giudicaRuolo`). Push, tag, `gh` e i comandi di pubblicazione passano.
  rilascio: {
    description: 'Pubblica una versione già unita nel ramo principale: push, tag, release e file allegati, dalla cartella principale. Non modifica file. Usalo solo quando la richiesta chiede di pubblicare, dopo che il lavoro è unito.',
    prompt: `Sei lo specialista del rilascio. Pubblichi una versione che è già nel ramo principale.\n\n${RILASCIO}`,
    tools: [...LETTURA, ...SHELL, 'TodoWrite'],
    model: 'sonnet'
  }
}

export const RUOLI_AGENTI = Object.keys(AGENTI_ORCHESTRATORE)

/** Al posto della riga sulla copia, quando il progetto non è un repository git. */
const SENZA_GIT_RIGA = 'Il progetto non è un repository git: lavori direttamente nella cartella del progetto, e sei l’unico specialista al lavoro. Niente git (niente commit, niente init): tocca solo i file del tuo compito, e nel riepilogo elenca ogni file cambiato.'
const RIGA_COPIA = COMUNE.split('\n')[1] as string
/** La riga con l'allineamento e le regole dei comandi nella copia: senza git non c'è una copia, e la riga se ne va. */
const RIGA_REGOLE_COPIA = COMUNE.split('\n')[2] as string

/**
 * Gli specialisti per un progetto **senza git** (31/10/2026, GLOS: una
 * cartella di Obsidian): la CLI non può aprire un worktree, e ogni Agent
 * falliva. Senza `isolation` lavorano nella cartella del progetto, uno alla
 * volta (il tetto lo mette il servizio, la guardia lo fa rispettare).
 */
export function agentiSenzaGit(): Record<string, DefinizioneAgente> {
  // 11/11: senza git non c'è niente da pubblicare (push, tag, release): niente «rilascio».
  return Object.fromEntries(Object.entries(AGENTI_ORCHESTRATORE).filter(([k]) => k !== 'rilascio').map(([k, a]) => {
    const { isolation: _i, ...resto } = a
    return [k, { ...resto, prompt: a.prompt.replace(RIGA_COPIA, SENZA_GIT_RIGA).replace(`\n${RIGA_REGOLE_COPIA}`, '') }]
  }))
}

/**
 * Il contenuto di `agenti.json` per `--agents`. `ramoBase` (11/11): il nome
 * del ramo principale del progetto, per la riga che fa allineare la copia
 * (di serie `main`).
 */
export function fileAgenti(conGit = true, ramoBase?: string): string {
  if (!conGit) return JSON.stringify(agentiSenzaGit(), null, 2)
  const base = ramoBase !== undefined && /^[\w./-]{1,100}$/u.test(ramoBase) && !ramoBase.startsWith('-') ? ramoBase : 'main'
  if (base === 'main') return JSON.stringify(AGENTI_ORCHESTRATORE, null, 2)
  const conBase = Object.fromEntries(Object.entries(AGENTI_ORCHESTRATORE).map(([k, a]) => [k, { ...a, prompt: a.prompt.replace(rigaAllinea('main'), rigaAllinea(base)).replace('`git diff main...HEAD`', `\`git diff ${base}...HEAD\``) }]))
  return JSON.stringify(conBase, null, 2)
}

/** Il contenuto di `impostazioni-cli.json` per `--settings`: i divieti sui comandi, dal servizio. */
export function fileImpostazioniCli(porta: number, autopilotaId: string): string {
  return JSON.stringify({
    hooks: {
      PreToolUse: [{
        // Anche le scritture e gli Agent: la guardia dell'unico (`guardia-orchestratore.ts`).
        matcher: MATCHER_GUARDIA,
        hooks: [{ type: 'http', url: `http://127.0.0.1:${porta}/hook/pretool?ap=${encodeURIComponent(autopilotaId)}`, timeout: TIMEOUT_PRETOOL_S }]
      }],
      // k-189: uno specialista non chiude mentre aspetta un comando lasciato in
      // sottofondo (08/11: 5 casi). Al più 2 rimandi per specialista.
      SubagentStop: [{
        hooks: [{ type: 'command', command: comandoFinePrematura(), timeout: 10 }]
      }],
      // 0.89.4: la fine di un comando di shell rende il turno dei pesanti. Senza,
      // un `npm test` di mezzo secondo lo teneva 2 minuti e 15: gli altri
      // specialisti e i criteri del PC aspettavano in fila (prova dal vero del 02/11).
      PostToolUse: [{
        matcher: 'Bash|PowerShell',
        hooks: [{ type: 'http', url: `http://127.0.0.1:${porta}/hook/rapporto?ap=${encodeURIComponent(autopilotaId)}`, timeout: 10 }]
      }]
    }
  }, null, 2)
}
