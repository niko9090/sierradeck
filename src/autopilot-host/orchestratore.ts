import { spawn } from 'node:child_process'
import { modelloAutopilotaAmmesso } from '@shared/modelli'
import { existsSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { createInterface } from 'node:readline'
import { gitPerLeChat } from '../main/git-nel-path'
import { POSTI_MAX } from '@shared/posti-chat'
import { uccidiAlberi } from '@shared/uccidi-alberi'
import { separaAvvisiNode } from '@shared/avvisi-node'
import { eErroreDiRete } from '@shared/errori-rete'
import { attesaLimiteMs, azzeramentoDalTesto, eLimiteDelPiano } from '@shared/limite-del-piano'
import { NON_EREDITATE } from '../pty-host/pty-manager'
import { applicaRiga, flussoVuoto, specialistiAlLavoro, type EffettoFlusso, type StatoFlusso } from '@shared/flusso-orchestratore'
import type { ImpostazioniOrchestratore, RigaDialogo } from './orchestratore-store'

/**
 * L'ambiente per il processo `claude`, senza le variabili che il PTY host
 * toglie già alle chat (`NON_EREDITATE`): `ELECTRON_RUN_AS_NODE` ereditata dal
 * servizio farebbe partire `claude.exe` come Node puro.
 */
export function ambientePulito(base: NodeJS.ProcessEnv): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [nome, valore] of Object.entries(base)) {
    if (valore === undefined || NON_EREDITATE.includes(nome)) continue
    env[nome] = valore
  }
  return env
}


/**
 * **L'orchestratore unico** (P3, 30/10/2026). Nicholas: «l'autopilota deve
 * essere UNO che parla con me dentro il workspace, come fa Claude Code con me
 * mentre lancia agenti specializzati; mi mostra l'avanzamento, anche in
 * percentuale, e la cosa si fa».
 *
 * Un processo `claude -p` **lungo** per workspace, in stream-json in entrata
 * e in uscita (provato il 30/10 con la CLI 2.1.314 e il login
 * dell'abbonamento):
 * - il servizio scrive sul suo ingresso i messaggi di Nicholas e gli eventi
 *   esterni (l'esito di un'unione, una risposta, una chat adottata);
 * - gli specialisti sono subagenti nativi (`--agents`, ognuno nel suo
 *   worktree): li lancia lui con lo strumento Agent, in sottofondo; la CLI lo
 *   sveglia quando finiscono. Al più `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`
 *   insieme (il tetto del workspace, dentro i posti del PC);
 * - `--permission-mode acceptEdits`, i divieti dal PreToolUse (`--settings`),
 *   e quello che chiede ancora un permesso passa da `--permission-prompt-tool`
 *   (lo strumento `permesso` del nostro MCP): diventa una domanda nel riquadro.
 *   **Mai** `bypassPermissions`, mai `--dangerously-skip-permissions`, mai
 *   `--bare` (ignorerebbe il login dell'abbonamento), e niente
 *   `ANTHROPIC_API_KEY` nell'ambiente del figlio;
 * - il processo si spegne dopo 10 minuti senza turni né specialisti al
 *   lavoro, e riparte con `--resume`; quando il contesto cresce troppo sopra il
 *   primo turno della sessione (`sogliaDiRotazione`, 11/11) la sessione ruota
 *   (quella nuova riceve lo stato e le ultime 10 battute);
 * - un turno alla volta per workspace e al più 2 su tutto il PC: quello che
 *   arriva durante un turno aspetta e parte insieme, alla fine del turno.
 */

// ---------------------------------------------------------------- tipi

export type TipoEvento = 'finito' | 'bloccato' | 'domanda' | 'silenzio' | 'unione' | 'fermo' | 'risposta' | 'adozione' | 'domanda-scaduta' | 'posto' | 'sveglia'
export type EventoOrchestratore = { tipo: TipoEvento; quando: string; testo: string; chat?: string }
export type MessaggioUtente = { quando: string; testo: string }

/** Un processo `claude` vivo: sostituibile, i test non avviano mai la CLI vera. */
export type ProcessoClaude = {
  scrivi: (riga: string) => void
  uccidi: () => void
  suRiga: (f: (riga: string) => void) => void
  suUscita: (f: (codice: number | null, stderr: string) => void) => void
}
export type AvviaProcesso = (p: { args: string[]; cwd: string; env: Record<string, string> }) => ProcessoClaude

// ---------------------------------------------------------------- costanti

/** 0.89.2: chi coordina usa il modello migliore (Nicholas, 01/11). */
export const MODELLO_ORCHESTRATORE = 'opus'
/** Gli eventi esterni (non i messaggi) si raccolgono un poco, per partire insieme. */
export const RACCOLTA_EVENTI_MS = 30_000
/** Quanti autopiloti (uno per workspace) possono avere un turno aperto insieme sul PC. 11/11: da 2 a 3, con tre workspace vivi il terzo aspettava il turno degli altri. */
export const CHIAMATE_PC_MAX = 3
export const ROTAZIONE_TOKEN = 80_000
/**
 * 11/11: la soglia vale **sopra la base della sessione**. Una sessione nuova parte già da 52-63k token (regole,
 * agenti, strumenti, stato): con 80k fissi ruotava ogni 3-8 turni (76 rotazioni in dodici giorni), e ogni volta
 * rileggeva tutto e perdeva il filo. Ora ruota quando il contesto cresce di tre quarti della soglia sopra il
 * primo turno della sessione (60k con la soglia di serie), mai sotto la soglia e mai oltre il doppio.
 */
export const MARGINE_ROTAZIONE = 0.75
export function sogliaDiRotazione(soglia: number, base: number | undefined): number {
  return Math.min(2 * soglia, Math.max(soglia, (base ?? 0) + Math.round(MARGINE_ROTAZIONE * soglia)))
}
export const BATTUTE_SEMINA = 10
export const INATTIVO_MS = 10 * 60_000
export const SILENZIO_SPECIALISTA_MS = 20 * 60_000
/** Un turno senza nessuna riga in uscita per tanto (fuori da un permesso in attesa) è appeso: si uccide e si riprova. */
export const TURNO_MUTO_MS = 20 * 60_000
/** Rete assente: la prima attesa prima di riprovare, che raddoppia a ogni errore fino al tetto. */
export const RIPROVA_RETE_MS = 30_000
export const RIPROVA_RETE_MAX_MS = 10 * 60_000
/** Altro guasto (processo, risposta vuota, strumento, uscita inattesa): il primo si riprova subito, poi 30 s, 1, 2, 5 min, poi 5 min fissi. */
export const RIPROVA_GUASTO_PASSI_MS = [30_000, 60_000, 120_000, 300_000]
export const attesaGuastoMs = (n: number): number => RIPROVA_GUASTO_PASSI_MS[Math.min(n - 2, RIPROVA_GUASTO_PASSI_MS.length - 1)] ?? 300_000
const tra = (ms: number): string => (ms < 60_000 ? `${Math.round(ms / 1000)} s` : `${Math.round(ms / 60_000)} min`)
/** Lo strumento MCP che risponde alle richieste di permesso. */
export const STRUMENTO_PERMESSO = 'mcp__sierradeck__permesso'

/**
 * Le regole dell'orchestratore: il suo `--append-system-prompt`. **Non
 * contengono niente che cambi** (né date, né nomi, né stato): il prefisso
 * del prompt resta in cache.
 */
export const REGOLE_ORCHESTRATORE = [
  'Sei l’autopilota di SierraDeck per questo workspace, l’unico. Parli con Nicholas, che possiede il progetto, come un collega che coordina una squadra: lui ti dice cosa vuole, tu fai in modo che venga fatto da specialisti.',
  'Non scrivi codice e non modifichi i file del progetto tu: leggi (Read, Grep, Glob, e git in sola lettura: git status, git log, git diff, git show), decidi, e affidi il lavoro agli specialisti con lo strumento Agent, in sottofondo. Gli specialisti: sviluppatore, interfaccia, android (scrivono codice), verificatore (prova), revisore ed esploratore (solo lettura), rilascio (pubblica una versione già unita, dalla cartella principale). Gli altri lavorano ognuno nella sua copia del progetto, su un ramo suo.',
  'Ogni chiamata a uno strumento sierradeck la controlla il programma: se rifiuta, leggi il motivo e cambia strada, non insistere.',
  '',
  'Ogni messaggio che ricevi comincia con lo stato scritto dal programma (coda, piano, specialisti, percentuale, eventi recenti); poi i messaggi di Nicholas e gli eventi. Lo stato è la verità di adesso.',
  '',
  'Come porti avanti il lavoro:',
  '1. Ogni cosa che Nicholas chiede è già in coda come richiesta (r-N), con le sue parole intere. Se due richieste parlano della stessa cosa (stesso obiettivo, stessi file, una che raffina o corregge l’altra), uniscile con coda_unisci e riformula: nomina ogni punto (p-N), nessuno si perde; un punto contraddetto lo dichiari superato con il perché. Tienile separate se l’obiettivo è diverso, se una è già fatta, se Nicholas ha detto «separata».',
  '1b. Non tutto quello che scrive Nicholas è lavoro. Una domanda («a che punto siamo?»), una conferma («sì», «procedi»), un ordine che esegui subito («fermati»), un doppione di una richiesta aperta, una cosa già fatta: rispondi o esegui, e nello stesso turno chiudila con coda_chiudi, con il perché. Dire «la chiudo» senza lo strumento non la chiude. Se nello stato ci sono richieste così rimaste aperte, chiudile.',
  '2. Dividi ogni richiesta aperta in compiti con piano_scrivi: piccoli, verificabili, con un criterio chiaro (meglio un comando fra apici inversi, per esempio `npx vitest run tests/coda.test.ts`), le dipendenze vere (dopo) e un peso da 1 a 3. Dividi per zone di file diverse, così i compiti corrono insieme senza toccarsi: metti «dopo» solo se un compito ha davvero bisogno del lavoro di un altro già unito.',
  // 11/11 (Nicholas: «riduci domande idiote»): via «per esempio quando pubblicare»; cosa è suo sta in una regola sola, più sotto.
  '2b. Una richiesta chiara la porti avanti subito: piano e specialisti nello stesso turno. Non chiedere «procedo?» o «vuoi che…?»: decidi tu e scrivilo in una riga. A Nicholas si chiede solo quello che è suo (vedi «Cosa è di Nicholas»).',
  // 11/11: l'08 e il 09/11 «Li correggo?» tre volte, solo perché la richiesta era già chiusa.
  '2c. I difetti trovati da un’analisi o da una revisione su un lavoro che Nicholas ha chiesto li correggi senza chiedere, e lo dici in una riga. Se la richiesta è già fatta, piano_scrivi apre da solo il suo seguito (al più due per richiesta): non ti serve un suo sì per avere una richiesta aperta.',
    // 12/11 (Nicholas): «lavora in parallelo più che puoi per abbattere i tempi». Prima: «Non più specialisti di quelli che servono» e «passi al compito dopo».
  '3. Lavora in parallelo, più che puoi: in UN SOLO messaggio lancia un Agent per ogni compito pronto e indipendente, tutti con run_in_background: true, finché ci sono posti liberi (lo stato dice i compiti pronti e i posti). Mai uno alla volta aspettando che finisca. La descrizione di ogni Agent COMINCIA con l’id del compito e due punti («k-3: …»), così il programma lo collega al piano; nel prompt metti cosa fare, dove, i vincoli e il criterio. Mentre gli sviluppatori lavorano, un esploratore può già leggere il codice del compito dopo.',
  '4. Quando uno specialista finisce, il programma unisce da solo il suo lavoro (trova il ramo, lo prova nel principale, lo unisce, misura il criterio) e l’esito ti arriva come evento «unione». Appena l’unione finisce l’esito ti arriva subito, con i compiti diventati pronti: lanciali nello stesso turno. Un compito con «dopo» non ancora unito non si lancia: il programma rifiuta l’Agent, lo mette in fila e ti avvisa lui quando è unita (non aspettare con sleep). Tu leggi il riepilogo e riempi di nuovo i posti liberi con i compiti pronti. Chiama unisci solo per quello che è rimasto fuori (una chat adottata, un ramo che dici tu). Criterio rosso o conflitto: affida subito la correzione a uno specialista, dicendo cosa non va. Se un’unione aspetta per file non salvati nella cartella principale se ne occupa il programma, che lo dice lui a Nicholas: tu non chiederlo e vai avanti con il resto.',
  '4b. Porta a termine: finché in coda c’è lavoro aperto e nessuna decisione di Nicholas lo blocca, ogni tuo turno lascia al lavoro uno specialista per ogni compito pronto, fino ai posti liberi (o un’unione in corso). Non chiudere un turno con «dimmi tu se…», «non lancio altro», «aspetto» o «parte appena arriva il via»: quello che aspetta un’unione lancialo comunque (il programma lo tiene in fila e lo fa partire lui). Quando il programma sta unendo o provando, non scrivere «nessuno al lavoro»: scrivi «il programma sta provando e unendo il lavoro di…, poi riparto da solo». se serve davvero una decisione che è sua (vedi «Cosa è di Nicholas»), chiedila con chiedi_utente (2-4 scelte, la più prudente per prima come consigliata, una frase di contesto) e intanto porta avanti il resto. Se il programma ti dice che il lavoro è fermo, riparti da lì. I permessi li decide il programma da solo, mai Nicholas: scrivere file (anche in una copia fuori dalla cartella del progetto) e leggere il web sono concessi; quello che nega (per esempio Monitor o un’attesa: l’esito ti arriva come evento, chiudi il turno) ha il suo motivo, leggilo e cambia strada.',
  // 06/11 (Nicholas): «il tuo compito è portare a termine tutti i lavori; se non sono al computer li devi finire tu».
  '4c. Sei autosufficiente: finisci tutto da solo, anche quando Nicholas non è al computer. Criterio rosso dopo un’unione: affidi la correzione nello stesso turno. Specialista rifiutato perché il tetto è pieno: non è fallito, il programma lo mette in fila col suo prompt e ti avvisa quando c’è posto, tu lo rilanci. A Nicholas chiedi solo una decisione sua o un caso davvero estremo; non chiedergli mai di riavviare il servizio, di chiudere programmi o di fare a mano lavoro tecnico (lo strumento lo rifiuta): lo risolvi tu, coordinando gli specialisti.',
  // 11/11: prima un compito usciva dal piano solo unendolo, e uno superato teneva aperta la richiesta per sempre.
  '4d. Un compito che non va più fatto (superato da un altro lavoro, o annullato) chiudilo con piano_chiudi, con il perché: non lasciarlo nel piano. Un compito fatto invece si chiude solo con unisci e il criterio verde.',
  // 11/11: le release uscite da un ramo lasciavano indietro la cartella principale, e servivano verificatori solo per far misurare i criteri.
  '4e. Quando un lavoro esce da un ramo (una release pubblicata col push), la cartella principale la rimette in pari il programma, da solo, e chiude lui i compiti il cui lavoro è già dentro misurando il criterio: non lanciare specialisti solo per questo.',
  // 11/11: «riprendo stasera alle 19» era un promemoria nella sessione, che si spegne dopo 10 minuti di quiete: non suonava mai.
  '4f. Se devi riprendere più tardi (Nicholas dice «riprendi stasera», o aspetti qualcosa che ha un orario), usa lo strumento sveglia: il programma ti richiama a quell’ora, anche se nel frattempo si riavvia. Un promemoria tenuto a mente o un’attesa con sleep si perdono. Le sveglie in attesa sono in SVEGLIE nello stato.',
  '5. Uno specialista bloccato: se la risposta sta nel codice, nel quaderno o in quello che Nicholas ha già detto, decidi tu e rilancia. A Nicholas, con chiedi_utente, solo quello che è suo, con 2-4 scelte e la consigliata per prima.',
  // 11/11: 15 Write/Edit rifiutati in quattro giorni verso la memoria di Claude (`.claude/projects/…/memory`).
  '6. Quello che conviene ricordare per i lavori futuri va nel quaderno con quaderno_annota, una riga. Le righe LEZIONI: dei riepiloghi le annota già il programma. Non scrivere nella memoria di Claude (i file MEMORY.md e simili sotto la cartella .claude): tu non modifichi file, e il programma lo rifiuta; la tua memoria è il quaderno.',
  '',
  // 11/11: la regola unica. In due settimane circa 24 domande, 6 davvero sue.
  'Cosa è di Nicholas, e solo questo si chiede: cancellare cose sue, i suoi account, i suoi dati personali, i soldi, una versione maggiore, e come deve essere una cosa che vede lui quando non si ricava da quello che ha già detto. Tutto il resto lo decidi tu, con la strada più prudente, e lo scrivi in una riga nel tuo messaggio: mai domande su unioni, rami, prove, specialisti, file non salvati o cartella principale, né su quando pubblicare una correzione, e mai su cose già successe. Installare SierraDeck è suo ma non si chiede: è un avviso (vedi sotto). Un fatto che sa solo lui (per esempio com’era collegato il telefono) lo puoi chiedere, segnando la domanda come rischiosa.',
  '',
  'Regole che non si discutono:',
  '- I fatti vincono. Un compito è fatto solo quando unisci ha misurato il suo criterio verde; una richiesta è fatta quando lo sono tutti i suoi compiti. Non dire «fatto» prima.',
  '- La percentuale la calcola il programma: riportala com’è. Se è scesa perché sono arrivati punti nuovi, dillo.',
  // 11/11: «Pubblico adesso la X?» sette volte nelle fonti, risposta sempre sì («Fai tu»). Non si chiede più.
  '- Niente lavoro che non sia in coda. Pubblicare: quando la richiesta lo chiede, oppure quando una correzione o una funzione di un progetto che esce a versioni è unita con tutte le prove verdi, pubblica senza chiedere «pubblico adesso?»: prima unisci, poi affidi push, tag e release allo specialista «rilascio» (lavora nella cartella principale e non modifica file: versione e note le prepara prima uno sviluppatore; il programma non li blocca). Mai installare. Poi scrivi a Nicholas «Pubblicata la X: installala quando vuoi». Chiedi solo per una versione maggiore, che decide lui. Niente push e niente pubblicazioni in un progetto che non esce a versioni, se la richiesta non li chiede. Se in quaderno o dialogo trovi che SierraDeck blocca il push, è superato.',
  // 0.89.5 (02/11): «niente installazioni» valeva per tutto, e l’autopilota rifiutava di installare sul Synology. La regola di Nicholas è solo su SierraDeck.
  // 11/11: «Quando la installi?» non è una domanda (prometteva «fra un giorno decido io» su una cosa che non può fare).
  '- Non installare mai una versione di SierraDeck: la installa solo Nicholas, quando vuole. Non chiedergli quando: lo strumento rifiuta la domanda e il programma gli scrive un avviso. Tu scrivi una riga («La X è pronta: quando la installi, succede Y») e vai avanti con il resto, senza aspettarlo. Tutto il resto che la richiesta chiede (installare pacchetti o programmi, mettere un servizio su un server, sul Synology o su un altro PC, configurarlo) fallo: è lavoro come un altro, non una regola da rispettare. Anche scaricare (pacchetti, programmi, installer, file per un progetto) è permesso. Se nel quaderno o nel dialogo trovi scritto che scaricare o installare «non è permesso», è superato: non citarlo e vai avanti.',
  // 11/11, Nicholas: «perché hai lasciato i limiti? devono poter essere sorpassati se decisi da me».
  '- I divieti del programma (push forzato e cancellazioni dal remoto, scrivere nei posti protetti, comandi in sottofondo e attese lunghe, strumenti negati, funzioni del programma non tue, cancellare fuori dalle cartelle, installare SierraDeck) si superano solo con il sì di Nicholas registrato dal programma. Se un rifiuto dice «si sblocca solo con il sì di Nicholas» e quell’azione l’ha chiesta lui, usa chiedi_consenso con la classe e il comando o i percorsi esatti: la domanda la scrive il programma, non scade e nessuno la decide al posto suo. Non usarlo per aggirare di tua iniziativa un divieto, e non scrivere mai «ho il permesso»: non vale. Installare SierraDeck: solo se Nicholas ha scritto lui di installare, e solo per quella volta; tu non proporlo mai.',
  '- Le chat adottate «solo mia» sono di Nicholas: non toccarle.',
  '',
  '- Le tue domande aperte sono in DOMANDE APERTE nello stato. Appena una non serve più (hai deciso tu, il lavoro è andato avanti o è finito, Nicholas ti ha risposto nel dialogo), ritirala con ritira_domanda nello stesso turno: una domanda superata che resta lì lo confonde.',
  // 11/11: la scadenza dipende dal rischio (prima: un giorno per tutte, poi «decido io»).
  '- Una domanda che non rischia niente, senza risposta, la decide il programma dopo un’ora con la consigliata, e glielo scrive: tu vai avanti con quella e non rifarla. Una che tocca cose sue resta aperta finché non risponde: non decidere al posto suo, non rifarla, e intanto porta avanti il resto.',
  '',
  // 0.92.1 (Nicholas 05/11): «gli autopiloti non mi spiegano un cazzo di quello che sta succedendo».
  'Come rispondi: il tuo testo finale di ogni turno è quello che Nicholas legge nella conversazione del workspace, sul PC e sul telefono. Deve sapere sempre cosa sta succedendo senza doverlo chiedere. In italiano semplice, come a un collega che non legge il codice (niente sigle k-N o r-N senza dire cosa sono, niente nomi di rami o di file se non servono), ogni messaggio dice:',
  '1) cosa è successo adesso e perché (per esempio «lo specialista che rifà la pagina di accesso ha finito: le prove passano e ho unito il suo lavoro»);',
  '2) chi sta lavorando in questo momento e su cosa, e cosa resta da fare;',
  '3) cosa succede dopo, e se ti serve qualcosa da lui;',
  '4) la percentuale, e il perché se è scesa.',
  'Se qualcosa è andato storto, di’ cosa, cosa fai per sistemarlo e se lo stai aspettando. Anche un evento di routine si racconta in due o tre righe, mai una sola parola. Niente elenchi lunghi: frasi brevi.'
].join('\n')

// ---------------------------------------------------------------- argomenti e prompt

export function argomentiOrchestratore(p: {
  modello: string
  sessione: { id: string; nuova: boolean }
  mcpConfig: string
  agenti: string
  impostazioni: string
}): string[] {
  return [
    '-p',
    '--input-format', 'stream-json',
    '--output-format', 'stream-json',
    '--verbose',
    '--model', p.modello,
    ...(p.sessione.nuova ? ['--session-id', p.sessione.id] : ['--resume', p.sessione.id]),
    '--append-system-prompt', REGOLE_ORCHESTRATORE,
    '--agents', p.agenti,
    '--settings', p.impostazioni,
    '--mcp-config', p.mcpConfig,
    // Solo il server di SierraDeck, non quelli di Nicholas.
    '--strict-mcp-config',
    '--permission-mode', 'acceptEdits',
    '--permission-prompt-tool', STRUMENTO_PERMESSO,
    // Le regole valgono anche per i subagenti: i comandi di shell passano senza
    // chiedere (li ferma il PreToolUse dei divieti, se serve); le modifiche ai
    // file le concede acceptEdits. Il resto chiede, con lo strumento `permesso`
    // (0.89.5: che concede da solo le modifiche fuori dai posti delicati e il web;
    // 11/11: decide sempre il programma, concede o nega con il motivo, mai una domanda a Nicholas).
    '--allowedTools', STRUMENTI_CONCESSI
  ]
}

export const STRUMENTI_CONCESSI = 'mcp__sierradeck__*,Read,Grep,Glob,Agent,Task,TodoWrite,Bash,PowerShell'

/** Gli argomenti che non devono mai esserci (controllati anche nei test). */
export const ARGOMENTI_VIETATI = ['--dangerously-skip-permissions', '--bare', 'bypassPermissions']

const orario = (iso: string): string => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const PAROLA_EVENTO: Record<TipoEvento, string> = {
  finito: 'ha finito',
  bloccato: 'è bloccato',
  domanda: 'chiede',
  silenzio: 'tace',
  unione: 'unione',
  fermo: 'si è fermato',
  risposta: 'risposta di Nicholas',
  adozione: 'adozione',
  'domanda-scaduta': 'domanda scaduta',
  posto: 'lista d’attesa',
  sveglia: 'sveglia'
}

/** Il messaggio di un turno: stato, indice del quaderno, (le ultime battute), eventi e messaggi. */
export function componiPrompt(p: {
  riassunto: string
  indice: string
  semina?: RigaDialogo[]
  messaggi: MessaggioUtente[]
  eventi: EventoOrchestratore[]
}): string {
  const righe: string[] = ['<stato>', p.riassunto.trim(), '</stato>']
  if (p.indice.trim() !== '') righe.push('', '<quaderno>', p.indice.trim(), '</quaderno>')
  if (p.semina !== undefined && p.semina.length > 0) {
    righe.push('', '<ultime-battute>', 'Sessione nuova: le ultime battute del dialogo, per riprendere il filo.')
    for (const r of p.semina) righe.push(`[${orario(r.quando)}] ${r.da === 'tu' ? 'Nicholas' : r.da === 'lui' ? 'tu' : 'evento'}: ${r.testo.replace(/\s+/gu, ' ').slice(0, 600)}`)
    righe.push('</ultime-battute>')
  }
  if (p.eventi.length > 0) {
    righe.push('', '<eventi>')
    for (const e of p.eventi) righe.push(`[${orario(e.quando)}] ${e.chat !== undefined ? `${e.chat} ` : ''}${PAROLA_EVENTO[e.tipo]}: ${e.testo.replace(/\s+/gu, ' ').slice(0, 1500)}`)
    righe.push('</eventi>')
  }
  if (p.messaggi.length > 0) {
    righe.push('', '<nicholas>')
    for (const m of p.messaggi) righe.push(`[${orario(m.quando)}] ${m.testo}`)
    righe.push('</nicholas>')
  } else {
    righe.push('', 'Nessun messaggio nuovo di Nicholas: rispondi agli eventi.')
  }
  return righe.join('\n')
}

/** La riga stream-json di un messaggio dell'utente. */
export function rigaUtente(testo: string): string {
  return JSON.stringify({ type: 'user', message: { role: 'user', content: testo }, parent_tool_use_id: null })
}

/** La sessione non c'è più (cancellata, o di un altro PC): si ricomincia con una nuova. */
export function sessionePersa(testo: string): boolean {
  return /no conversation found|session.*not found|sessione.*non trovata/iu.test(testo)
}

/** L'ambiente del figlio: ripulito, git nel PATH, il tetto dei subagenti, e mai la chiave API (vale l'abbonamento). */
export function ambienteOrchestratore(base: NodeJS.ProcessEnv, tetto: number): Record<string, string> {
  const env: Record<string, string> = { ...ambientePulito(base), ...gitPerLeChat(), CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS: String(Math.max(1, Math.round(tetto))) }
  delete env.ANTHROPIC_API_KEY
  return env
}

// ---------------------------------------------------------------- il motore

export type ContestoTurno = {
  cwd: string
  riassunto: string
  indice: string
  /** I file per `--agents`, `--settings` e `--mcp-config` (scritti dal servizio). */
  agenti: string
  impostazioniCli: string
  mcpConfig: string
  /** Il tetto dei subagenti insieme (impostazione e posti del PC). */
  tetto: number
  /** k-57: il numero massimo scelto da Nicholas: diventa il limite dei subagenti del processo. */
  scelti?: number
}

export type DipendenzeOrchestratore = {
  avvia: AvviaProcesso
  impostazioni: (ws: string) => ImpostazioniOrchestratore
  cambiaImpostazioni: (ws: string, f: (i: ImpostazioniOrchestratore) => ImpostazioniOrchestratore) => void
  /** `undefined` se il workspace non è più attivo. */
  contesto: (ws: string) => ContestoTurno | undefined
  ultime: (ws: string, n: number) => RigaDialogo[]
  /** Il testo finale di un turno: nel dialogo del workspace. */
  risposta: (ws: string, testo: string) => void
  errore: (ws: string, motivo: string) => void
  /** Gli effetti del flusso (specialisti partiti e finiti, costi) e lo stato per la vista. */
  flusso?: (ws: string, effetti: EffettoFlusso[], stato: StatoFlusso) => void
  adesso?: () => string
  nuovaSessione?: () => string
  ambiente?: (tetto: number) => Record<string, string>
  raccoltaMs?: number
  /** Quanti turni insieme sul PC: un numero, o (11/11) una funzione letta a ogni uso (lo decide Nicholas). */
  globaliMax?: number | (() => number)
  sogliaRotazione?: number
  inattivoMs?: number
  /** Il cane da guardia: un turno senza righe per tanto si dà per appeso. */
  mutoMs?: number
  /** Attesa prima di riprovare dopo l'n-esimo errore di rete di fila (n da 1): cresce, ha un tetto. */
  riprovaReteMs?: (n: number) => number
  /** Attesa prima di riprovare dopo l'n-esimo guasto di fila non di rete (n da 2: il primo riprova subito). */
  riprovaGuastoMs?: (n: number) => number
  /** Nicholas sta decidendo un permesso per questo workspace: il silenzio è giusto, il cane aspetta. */
  attendeNicholas?: (ws: string) => boolean
  /**
   * 11/11: il piano ha finito la quota. Non è un guasto: si aspetta l'azzeramento e si riparte da soli.
   * `primo` è vero una volta per episodio (fino al prossimo turno riuscito). Assente: passa da `errore`.
   */
  limite?: (ws: string, p: { motivo: string; primo: boolean; riprovoIl: number; azzeraIl?: number }) => void
  /** Quando si azzera il limite secondo il programma (ms), se il messaggio della CLI non lo dice. */
  azzeramentoLimite?: (ws: string, motivo: string) => number | undefined
}

export type Orchestratore = {
  /** Un messaggio di Nicholas: parte subito, o alla fine del turno in corso. */
  messaggio: (ws: string, m: MessaggioUtente) => void
  /**
   * Un evento esterno: si raccoglie un poco con gli altri. Con `subito` (la fine
   * di un'unione: i compiti dopo di lei sono pronti) non si aspetta la raccolta:
   * il turno parte appena l'autopilota è libero, anche se aveva già chiuso il suo.
   */
  evento: (ws: string, e: EventoOrchestratore, subito?: boolean) => void
  inVolo: (ws: string) => boolean
  /** Turni in corso su tutto il PC. */
  chiamateInVolo: () => number
  inAttesa: (ws: string) => { messaggi: number; eventi: number }
  vivo: (ws: string) => boolean
  stato: (ws: string) => StatoFlusso
  /** Gli specialisti (subagenti) al lavoro su tutto il PC, in ogni workspace; `escludi`: quello che sta partendo (il suo Agent è già nel flusso quando arriva il PreToolUse). */
  specialistiSulPc: (escludi?: string) => number
  /** Per i test e lo spegnimento: si risolve quando nessun turno è in corso né pronto. */
  quiete: () => Promise<void>
  /** Interruttore spento: spegne il processo e dimentica quello che aspettava. */
  dimentica: (ws: string) => void
  /** Spegne tutto (uscita del servizio). */
  spegni: () => void
}

type StatoWs = {
  proc?: ProcessoClaude
  flusso: StatoFlusso
  messaggi: MessaggioUtente[]
  eventi: EventoOrchestratore[]
  eventiPronti: boolean
  timer?: ReturnType<typeof setTimeout>
  inattivo?: ReturnType<typeof setTimeout>
  /** Il numero scelto con cui è partito il processo (k-57). */
  sceltiUsati?: number
  /** Quello che il turno in corso ha portato: torna in attesa se il processo muore. */
  inviati?: { messaggi: MessaggioUtente[]; eventi: EventoOrchestratore[] }
  ruota: boolean
  /** 11/11: il contesto del primo turno della sessione di adesso: la soglia di rotazione si conta da lì. */
  baseContesto?: number
  /** Guasti di fila: dal secondo si aspetta sempre di più, senza fermarsi mai. */
  tentativi: number
  /** Dopo un guasto si aspetta (backoff) prima del turno dopo. */
  riprova?: ReturnType<typeof setTimeout>
  /** La sessione persa si è già rifatta una volta. */
  persa: boolean
  /** 11/11: il limite del piano è già stato detto; vale finché un turno non riesce. */
  limite?: boolean
  /** Il cane da guardia del turno: riparte a ogni riga. */
  cane?: ReturnType<typeof setTimeout>
}

export function creaOrchestratore(d: DipendenzeOrchestratore): Orchestratore {
  const stati = new Map<string, StatoWs>()
  const fila: string[] = []
  const raccoltaMs = d.raccoltaMs ?? RACCOLTA_EVENTI_MS
  // 11/11: il tetto dei turni lo decide Nicholas (limiti-pc.ts): si legge a ogni uso, vale subito.
  const globali = (): number => { const g = typeof d.globaliMax === 'function' ? d.globaliMax() : d.globaliMax; return Math.max(1, g ?? CHIAMATE_PC_MAX) }
  const soglia = d.sogliaRotazione ?? ROTAZIONE_TOKEN
  const inattivoMs = d.inattivoMs ?? INATTIVO_MS
  const mutoMs = d.mutoMs ?? TURNO_MUTO_MS
  const riprovaReteMs = d.riprovaReteMs ?? ((n: number): number => Math.min(RIPROVA_RETE_MAX_MS, RIPROVA_RETE_MS * 2 ** (n - 1)))
  const riprovaGuastoMs = d.riprovaGuastoMs ?? attesaGuastoMs
  const nuova = d.nuovaSessione ?? ((): string => randomUUID())
  const adesso = d.adesso ?? ((): string => new Date().toISOString())
  const ambiente = d.ambiente ?? ((t: number) => ambienteOrchestratore(process.env, t))
  let attese: (() => void)[] = []

  const di = (ws: string): StatoWs => {
    let s = stati.get(ws)
    if (s === undefined) { s = { flusso: flussoVuoto(), messaggi: [], eventi: [], eventiPronti: false, ruota: false, tentativi: 0, persa: false }; stati.set(ws, s) }
    return s
  }
  const inTurno = (s: StatoWs): boolean => s.proc !== undefined && s.flusso.inTurno
  const turniPc = (): number => [...stati.values()].filter(inTurno).length
  const pronto = (s: StatoWs): boolean => !inTurno(s) && s.riprova === undefined && (s.messaggi.length > 0 || (s.eventiPronti && s.eventi.length > 0))
  const forseQuiete = (): void => {
    if (turniPc() > 0 || [...stati.values()].some(pronto)) return
    const a = attese
    attese = []
    for (const r of a) r()
  }
  const avanza = (): void => {
    for (const ws of [...fila]) {
      if (turniPc() >= globali()) break
      const s = di(ws)
      if (!pronto(s)) { if (!inTurno(s)) fila.splice(fila.indexOf(ws), 1); continue }
      fila.splice(fila.indexOf(ws), 1)
      manda(ws, s)
    }
    forseQuiete()
  }
  /** Quello che il turno portava torna in testa all'attesa (il processo è morto o il turno è fallito). */
  const rimettiInAttesa = (s: StatoWs): void => {
    const persi = s.inviati
    s.inviati = undefined
    if (persi === undefined) return
    s.messaggi = [...persi.messaggi, ...s.messaggi]
    s.eventi = [...persi.eventi, ...s.eventi]
    if (s.eventi.length > 0) s.eventiPronti = true
  }
  const metti = (ws: string): void => {
    if (!fila.includes(ws)) fila.push(ws)
    avanza()
  }
  /**
   * 11/11: il turno è fallito perché il piano ha finito la quota («You've hit your weekly limit · resets 1am»).
   * Non è un guasto e non si conta: fino all'azzeramento riprovare ogni 5 minuti non serve a niente. Si aspetta
   * fino a lì (al più un'ora per volta; un quarto d'ora se l'ora non si sa) e lo si dice una volta per episodio.
   */
  const limiteDelPiano = (ws: string, s: StatoWs, motivo: string): void => {
    const letto = Date.parse(adesso())
    const ora = Number.isNaN(letto) ? Date.now() : letto
    let azzeraIl = azzeramentoDalTesto(motivo, ora)
    if (azzeraIl === undefined) { try { azzeraIl = d.azzeramentoLimite?.(ws, motivo) } catch { azzeraIl = undefined } }
    const attesa = attesaLimiteMs(azzeraIl, ora)
    const primo = s.limite !== true
    s.limite = true
    if (d.limite !== undefined) d.limite(ws, { motivo, primo, riprovoIl: ora + attesa, ...(azzeraIl !== undefined && azzeraIl > ora ? { azzeraIl } : {}) })
    else d.errore(ws, `${motivo} — riprovo fra ${tra(attesa)}`)
    if (s.riprova !== undefined) clearTimeout(s.riprova)
    s.riprova = setTimeout(() => { s.riprova = undefined; metti(ws) }, attesa)
    s.riprova.unref?.()
  }
  /**
   * Un turno è fallito (messaggi già rimessi in attesa): si conta il guasto e si riparte da soli.
   * Il primo guasto non di rete riprova subito; poi l'attesa cresce (con un tetto), mai uno stop.
   * Nicholas ne vede una riga sola («riprovo fra N min»), senza domande.
   */
  const guasto = (ws: string, s: StatoWs, motivo: string, rete: boolean): void => {
    if (eLimiteDelPiano(motivo)) { limiteDelPiano(ws, s, motivo); return }
    s.tentativi += 1
    const attesa = rete ? riprovaReteMs(s.tentativi) : s.tentativi < 2 ? 0 : riprovaGuastoMs(s.tentativi)
    d.errore(ws, attesa > 0 ? `${motivo} — riprovo fra ${tra(attesa)}` : motivo)
    if (s.riprova !== undefined) { clearTimeout(s.riprova); s.riprova = undefined }
    if (attesa > 0) {
      s.riprova = setTimeout(() => { s.riprova = undefined; metti(ws) }, attesa)
      s.riprova.unref?.()
    } else metti(ws)
  }

  const spegniSe = (ws: string, s: StatoWs, perche: string): void => {
    if (s.proc === undefined) return
    console.info(`[orchestratore] ${ws} — spengo il processo: ${perche}`)
    const p = s.proc
    s.proc = undefined
    s.flusso = { ...s.flusso, inTurno: false }
    if (s.cane !== undefined) { clearTimeout(s.cane); s.cane = undefined }
    try { p.uccidi() } catch { /* già uscito */ }
  }

  /**
   * 11/11: col processo muoiono anche i suoi specialisti. Prima, dopo un turno appeso (il processo lo spegne
   * il programma, e la sua uscita non si guarda più) restavano «al lavoro» per sempre: occupavano i posti del
   * PC, il rilancio era rifiutato come doppione, niente spinte del lavoro fermo e niente autopulizia, fino al
   * riavvio del servizio. E quando il processo usciva da solo erano «fermati», ma nessuno lo diceva al piano.
   * `diLo`: lo si dice al servizio (il compito torna da fare); senza, si segnano soltanto.
   */
  const fermaSpecialisti = (ws: string, s: StatoWs, diLo: boolean): void => {
    const vivi = specialistiAlLavoro(s.flusso)
    if (vivi.length === 0) return
    const quando = adesso()
    const fermati = vivi.map((y) => ({ ...y, stato: 'fermato' as const, fine: quando }))
    s.flusso = { ...s.flusso, specialisti: s.flusso.specialisti.map((y) => fermati.find((f) => f.id === y.id) ?? y) }
    if (!diLo) return
    // Subito dopo, non adesso: chi chiama sta ancora sistemando il turno e il processo.
    queueMicrotask(() => {
      try { d.flusso?.(ws, fermati.map((specialista) => ({ tipo: 'specialista-finito' as const, specialista })), s.flusso) } catch (err) { console.error(`[orchestratore] ${ws} — specialisti fermati non registrati:`, err) }
    })
  }

  /**
   * Il cane da guardia del turno: una CLI appesa (nessuna riga da 20 minuti,
   * e nessun permesso che aspetta Nicholas) terrebbe per sempre uno dei due
   * turni del PC. Si spegne, quello che il turno portava torna in attesa e si
   * riprova una volta con `--resume`.
   */
  const armaCane = (ws: string, s: StatoWs): void => {
    if (s.cane !== undefined) clearTimeout(s.cane)
    s.cane = undefined
    if (s.proc === undefined) return
    s.cane = setTimeout(() => {
      s.cane = undefined
      if (s.proc === undefined || !inTurno(s)) return
      if (d.attendeNicholas?.(ws) === true) { armaCane(ws, s); return }
      rimettiInAttesa(s)
      const minuti = Math.round(mutoMs / 60_000)
      console.error(`[orchestratore] ${ws} — turno appeso: nessuna riga da ${minuti} minuti`)
      spegniSe(ws, s, `turno appeso (nessuna riga da ${minuti} minuti)`)
      fermaSpecialisti(ws, s, true)
      guasto(ws, s, `il turno era appeso (nessuna risposta dalla CLI da ${minuti} minuti): l’ho fermato`, false)
    }, mutoMs)
    s.cane.unref?.()
  }

  /** A riposo (nessun turno, nessuno specialista): ruota subito se serve, se no si spegne dopo 10 minuti. */
  const riposo = (ws: string, s: StatoWs): void => {
    if (s.inattivo !== undefined) { clearTimeout(s.inattivo); s.inattivo = undefined }
    if (s.proc === undefined || inTurno(s) || specialistiAlLavoro(s.flusso).length > 0 || pronto(s)) return
    if (s.ruota) {
      s.ruota = false
      const limite = sogliaDiRotazione(soglia, s.baseContesto)
      s.baseContesto = undefined
      d.cambiaImpostazioni(ws, (i) => ({ ...i, sessione: undefined, daSeminare: true, rotazioni: (i.rotazioni ?? 0) + 1 }))
      spegniSe(ws, s, `contesto oltre ${limite} token: la prossima volta una sessione nuova, con lo stato e le ultime ${BATTUTE_SEMINA} battute`)
      return
    }
    s.inattivo = setTimeout(() => { s.inattivo = undefined; if (!inTurno(s) && specialistiAlLavoro(s.flusso).length === 0) spegniSe(ws, s, `fermo da ${Math.round(inattivoMs / 60_000)} minuti; riparte con --resume`) }, inattivoMs)
    s.inattivo.unref?.()
  }

  const suEffetti = (ws: string, s: StatoWs, effetti: EffettoFlusso[]): void => {
    for (const e of effetti) {
      if (e.tipo === 'sessione') d.cambiaImpostazioni(ws, (i) => ({ ...i, sessione: e.id, daSeminare: undefined }))
      else if (e.tipo === 'costo') {
        if (e.costo.contesto > 0) d.cambiaImpostazioni(ws, (i) => ({ ...i, contesto: e.costo.contesto }))
        // 11/11: la soglia si conta dal primo turno della sessione, non da zero (vedi `sogliaDiRotazione`).
        if (s.baseContesto === undefined && e.costo.contesto > 0) s.baseContesto = e.costo.contesto
        if (e.costo.contesto > sogliaDiRotazione(soglia, s.baseContesto)) s.ruota = true
      } else if (e.tipo === 'risposta') {
        if (e.errore !== undefined) {
          // Il turno è fallito: i messaggi non si perdono, e si riparte da soli con attesa crescente.
          rimettiInAttesa(s)
          guasto(ws, s, e.errore, eErroreDiRete(e.errore))
        } else {
          s.inviati = undefined
          s.tentativi = 0
          s.persa = false
          s.limite = false
          if (e.testo !== '') d.risposta(ws, e.testo)
        }
      }
    }
    try { d.flusso?.(ws, effetti, s.flusso) } catch (err) { console.error(`[orchestratore] ${ws} — effetti del flusso:`, err) }
    if (effetti.some((e) => e.tipo === 'risposta' || e.tipo === 'specialista-finito')) {
      // Fine del turno: quello che aspettava parte adesso, o si va a riposo.
      if (pronto(s)) metti(ws)
      else { avanza(); riposo(ws, s) }
    }
  }

  const avviaProcesso = (ws: string, s: StatoWs, ctx: ContestoTurno): { nuovaSess: boolean } => {
    const imp = d.impostazioni(ws)
    const nuovaSess = imp.sessione === undefined
    const id = imp.sessione ?? nuova()
    const args = argomentiOrchestratore({
      modello: modelloAutopilotaAmmesso(imp.modello) && imp.modello !== 'opus' ? imp.modello : MODELLO_ORCHESTRATORE,
      sessione: { id, nuova: nuovaSess },
      mcpConfig: ctx.mcpConfig, agenti: ctx.agenti, impostazioni: ctx.impostazioniCli
    })
    if (nuovaSess) d.cambiaImpostazioni(ws, (i) => ({ ...i, sessione: id }))
    const p = d.avvia({ args, cwd: ctx.cwd, env: ambiente(ctx.scelti ?? ctx.tetto) })
    s.proc = p
    s.sceltiUsati = ctx.scelti
    console.info(`[orchestratore] ${ws} — processo avviato (${nuovaSess ? 'sessione nuova' : `ripresa ${id.slice(0, 8)}`}, al più ${ctx.tetto} specialisti insieme)`)
    p.suRiga((riga) => {
      if (s.proc !== p) return
      const r = applicaRiga(s.flusso, riga, adesso())
      s.flusso = r.stato
      if (s.flusso.inTurno) armaCane(ws, s)
      else if (s.cane !== undefined) { clearTimeout(s.cane); s.cane = undefined }
      if (r.effetti.length > 0) suEffetti(ws, s, r.effetti)
      else try { d.flusso?.(ws, [], s.flusso) } catch { /* solo la vista */ }
    })
    p.suUscita((codice, stderr) => {
      if (s.proc !== p) return
      s.proc = undefined
      if (s.cane !== undefined) { clearTimeout(s.cane); s.cane = undefined }
      const eraInTurno = s.flusso.inTurno
      s.flusso = { ...s.flusso, inTurno: false }
      // 11/11: gli specialisti morti col processo si dicono anche al piano (prima restavano «in corso» fino alla spinta del lavoro fermo).
      fermaSpecialisti(ws, s, true)
      if (s.inattivo !== undefined) { clearTimeout(s.inattivo); s.inattivo = undefined }
      if (eraInTurno || s.inviati !== undefined) {
        // Quello che il turno portava non si perde: torna in attesa.
        rimettiInAttesa(s)
        // Gli avvisi di Node (DeprecationWarning…) non sono il motivo dell'uscita.
        const motivo = separaAvvisiNode(stderr).resto.slice(-400) || `uscito con ${String(codice)}`
        if (!nuovaSess && sessionePersa(motivo) && !s.persa) {
          d.cambiaImpostazioni(ws, (i) => ({ ...i, sessione: undefined, daSeminare: true, rotazioni: (i.rotazioni ?? 0) + 1 }))
          s.baseContesto = undefined
          s.persa = true
          metti(ws)
          return
        }
        guasto(ws, s, motivo, eErroreDiRete(motivo))
      }
      try { d.flusso?.(ws, [], s.flusso) } catch { /* solo la vista */ }
      avanza()
    })
    return { nuovaSess }
  }

  const manda = (ws: string, s: StatoWs): void => {
    const ctx = d.contesto(ws)
    if (ctx === undefined) { s.messaggi = []; s.eventi = []; s.eventiPronti = false; return }
    if (s.inattivo !== undefined) { clearTimeout(s.inattivo); s.inattivo = undefined }
    const messaggi = s.messaggi
    const eventi = s.eventiPronti ? s.eventi : []
    s.messaggi = []
    if (s.eventiPronti) { s.eventi = []; s.eventiPronti = false }
    if (s.timer !== undefined && eventi.length > 0) { clearTimeout(s.timer); s.timer = undefined }
    // k-57: il numero scelto è cambiato. Il limite dei subagenti è una variabile del processo:
    // si riparte (--resume) ma solo a turno finito e senza specialisti al lavoro.
    if (s.proc !== undefined && s.sceltiUsati !== ctx.scelti && !inTurno(s) && specialistiAlLavoro(s.flusso).length === 0) {
      spegniSe(ws, s, 'è cambiato il numero massimo di chat: riparto col nuovo limite')
    }
    const appena = s.proc === undefined ? avviaProcesso(ws, s, ctx) : undefined
    const imp = d.impostazioni(ws)
    const semina = appena?.nuovaSess === true || imp.daSeminare === true ? d.ultime(ws, BATTUTE_SEMINA) : undefined
    const testo = componiPrompt({ riassunto: ctx.riassunto, indice: ctx.indice, ...(semina !== undefined ? { semina } : {}), messaggi, eventi })
    s.inviati = { messaggi, eventi }
    s.flusso = { ...s.flusso, inTurno: true }
    armaCane(ws, s)
    try {
      s.proc!.scrivi(`${rigaUtente(testo)}\n`)
    } catch (err) {
      d.errore(ws, `ingresso del processo chiuso: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return {
    messaggio(ws, m) {
      const s = di(ws)
      s.messaggi.push(m)
      // Gli eventi in raccolta partono con il messaggio: un turno solo.
      if (s.eventi.length > 0) s.eventiPronti = true
      metti(ws)
    },
    evento(ws, e, subito) {
      const s = di(ws)
      s.eventi.push(e)
      if (subito === true) {
        if (s.timer !== undefined) { clearTimeout(s.timer); s.timer = undefined }
        s.eventiPronti = true
        metti(ws)
        return
      }
      if (s.timer !== undefined || s.eventiPronti) return
      s.timer = setTimeout(() => {
        s.timer = undefined
        s.eventiPronti = true
        metti(ws)
      }, raccoltaMs)
      s.timer.unref?.()
    },
    inVolo: (ws) => { const s = stati.get(ws); return s !== undefined && inTurno(s) },
    chiamateInVolo: turniPc,
    inAttesa: (ws) => ({ messaggi: stati.get(ws)?.messaggi.length ?? 0, eventi: stati.get(ws)?.eventi.length ?? 0 }),
    vivo: (ws) => stati.get(ws)?.proc !== undefined,
    stato: (ws) => stati.get(ws)?.flusso ?? flussoVuoto(),
    specialistiSulPc: (escludi) => [...stati.values()].reduce((n, s) => n + (s.proc !== undefined ? specialistiAlLavoro(s.flusso).filter((x) => x.id !== escludi).length : 0), 0),
    quiete: () => new Promise<void>((r) => { attese.push(r); forseQuiete() }),
    dimentica(ws) {
      const s = stati.get(ws)
      if (s === undefined) return
      if (s.timer !== undefined) clearTimeout(s.timer)
      if (s.inattivo !== undefined) clearTimeout(s.inattivo)
      if (s.riprova !== undefined) clearTimeout(s.riprova)
      s.riprova = undefined
      s.tentativi = 0
      s.limite = false
      s.messaggi = []
      s.eventi = []
      s.eventiPronti = false
      s.timer = undefined
      s.inattivo = undefined
      s.inviati = undefined
      spegniSe(ws, s, 'interruttore spento')
      // 11/11: spento l'interruttore non resta nessuno «al lavoro» (senza dirlo al piano: l'autopilota è fermo apposta).
      fermaSpecialisti(ws, s, false)
      forseQuiete()
    },
    spegni() {
      for (const [ws, s] of stati) {
        if (s.timer !== undefined) clearTimeout(s.timer)
        if (s.inattivo !== undefined) clearTimeout(s.inattivo)
        if (s.riprova !== undefined) clearTimeout(s.riprova)
        spegniSe(ws, s, 'il servizio si spegne')
      }
    }
  }
}

// ---------------------------------------------------------------- la CLI vera

/**
 * `claude` davvero, lungo: righe JSON in entrata e in uscita. Non solleva:
 * una cartella che non c'è o un avvio fallito tornano come uscita.
 */
export function avviaProcessoReale(claudeCmd: string, uccidi: (pids: number[]) => Promise<void> = (p) => uccidiAlberi(p)): AvviaProcesso {
  return ({ args, cwd, env }) => {
    const righe: ((r: string) => void)[] = []
    const uscite: ((c: number | null, e: string) => void)[] = []
    let stderr = ''
    let uscito: { codice: number | null; e: string } | undefined
    const esci = (codice: number | null, e: string): void => {
      if (uscito !== undefined) return
      uscito = { codice, e }
      for (const f of uscite) f(codice, e)
    }
    if (!existsSync(cwd)) {
      setImmediate(() => esci(1, `la cartella «${cwd}» non esiste`))
      return { scrivi: () => {}, uccidi: () => {}, suRiga: (f) => { righe.push(f) }, suUscita: (f) => { uscite.push(f) } }
    }
    const figlio = spawn(claudeCmd, args, { cwd, env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
    createInterface({ input: figlio.stdout }).on('line', (r) => { for (const f of righe) f(r) })
    figlio.stderr.on('data', (b: Buffer) => { stderr = (stderr + b.toString('utf8')).slice(-4000) })
    figlio.on('error', (err) => esci(1, `${stderr}\n${err.message}`))
    figlio.on('close', (codice) => esci(codice, stderr))
    figlio.stdin.on('error', () => { /* lo dice l'uscita */ })
    return {
      scrivi: (r) => { figlio.stdin.write(r, 'utf8') },
      // Tutto l'albero: su Windows `kill()` lascia vivi i figli (npm, i test, i subagenti).
      uccidi: () => {
        try { figlio.stdin.end() } catch { /* già chiuso */ }
        if (figlio.pid !== undefined && uscito === undefined) void uccidi([figlio.pid])
        else figlio.kill()
      },
      suRiga: (f) => { righe.push(f) },
      suUscita: (f) => { if (uscito !== undefined) f(uscito.codice, uscito.e); else uscite.push(f) }
    }
  }
}
