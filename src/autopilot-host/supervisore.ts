import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { NON_EREDITATE } from '../pty-host/pty-manager'
import { gitPerLeChat } from '../main/git-nel-path'
import type { Autopilota } from '@shared/autopilota'
import type { Giudizio } from './decisione'

export type Interrogazione = (
  prompt: string,
  cwd: string,
  sessionId: string | undefined,
  opzioni?: {
    /** L'id con cui far nascere la sessione, quando la si vuole poter guardare. */
    nuovaSessione?: string
    /**
     * Quanto la si aspetta. Assente vale il tempo di un giudizio: pochi minuti,
     * perché di là c'è una chat ferma. Chi non ha nessuno che aspetta — la
     * preparazione — chiede il suo, e lo chiede esplicitamente.
     */
    timeoutMs?: number
    /**
     * **Una decisione di routine** (29/10): un turno della chat da giudicare con
     * i fatti già nel prompt. Modello leggero, senza sessione (niente
     * `--resume` su una conversazione da 967k token), senza strumenti e al più
     * `TURNI_ROUTINE` turni. Scomposizione e preparazione restano come prima.
     */
    routine?: boolean
  }
) => Promise<{ testo: string; sessionId?: string }>

/** Il modello delle decisioni di routine, se nessuno ne sceglie un altro (`SIERRADECK_MODELLO_SUPERVISORE`). */
export const MODELLO_ROUTINE = 'sonnet'
/** I turni concessi a una decisione di routine: senza strumenti ne basta uno, tre per sicurezza. */
export const TURNI_ROUTINE = 3

/** Il modello delle decisioni di routine: quello dell'ambiente, o `MODELLO_ROUTINE`. */
export function modelloRoutine(env: NodeJS.ProcessEnv = process.env): string {
  const m = env.SIERRADECK_MODELLO_SUPERVISORE?.trim() ?? ''
  return m !== '' ? m : MODELLO_ROUTINE
}

const TIMEOUT_MS = 5 * 60_000
/** Quanto dell'ultimo messaggio della chat entra nel prompt di giudizio. */
const MESSAGGIO_MAX = 4000

/**
 * Interroga davvero una sessione di giudizio.
 *
 * Ripresa con `--resume` quando ne esiste già una: così il supervisore ricorda
 * il compito invece di ricostruirlo da capo a ogni fermata, ed è anche il modo
 * per accorgersi che «ci ha già provato due volte così».
 */
/**
 * Gli argomenti con cui parte la sessione di giudizio, e il suo avvio.
 *
 * Estratta per poter verificare **quali** argomenti riceve: il permesso è la
 * differenza fra un giudizio che arriva e uno che scade nel silenzio, e non si
 * può controllare avviando davvero `claude.exe` in un test.
 */
export function argomentiSupervisore(
  claudeCmd: string,
  cwd: string,
  sessionId: string | undefined,
  avvia: (comando: string, args: string[]) => void,
  /**
   * L'id da dare a una sessione che nasce adesso.
   *
   * Serve a poterla **guardare mentre lavora**: senza, la sessione si conosce
   * solo dalla risposta finale, e nel frattempo — minuti, durante la
   * preparazione — non c'è nessuna trascrizione da mostrare. È la stessa
   * tecnica delle chat governate, che l'id se lo danno da sé alla nascita.
   */
  nuovaSessione?: string,
  /** 29/10: una decisione di routine, con il suo modello (vedi `Interrogazione`). */
  routine?: { modello: string }
): void {
  if (routine !== undefined) {
    avvia(claudeCmd, [
      '-p',
      '--output-format', 'json',
      '--model', routine.modello,
      '--max-turns', String(TURNI_ROUTINE),
      // Niente sessione da riprendere né da salvare: le ultime mosse sono già
      // nel prompt, e una conversazione che cresce a ogni giro costava ~820k
      // token a prompt.
      '--no-session-persistence',
      // Nessuno strumento, e quindi nessun permesso da saltare: i fatti li ha
      // già misurati il programma (`fattiVerificati`).
      '--tools', ''
    ])
    return
  }
  avvia(claudeCmd, [
    // **Il prompt non è qui: arriva dall'ingresso** (0.85.1). Come argomento
    // superava il limite della riga di comando di Windows (32.767 caratteri)
    // appena l'obiettivo e i criteri crescevano, e ogni interrogazione falliva
    // con «spawn ENAMETOOLONG» prima ancora di partire: 239 volte il 23/10,
    // 124 di fila, con l'autopilota fermo e domande nate dal supervisore muto.
    // `-p` senza testo legge il prompt dallo stdin, che non ha limiti.
    '-p',
    '--output-format', 'json',
    // Gli stessi permessi delle chat governate, e per la stessa ragione: il
    // supervisore deve poter leggere i file e rieseguire un comando per
    // giudicare. Con `acceptEdits` un comando shell aprirebbe una richiesta di
    // permesso che nessuno è lì a concedere, e il giudizio arriverebbe solo
    // allo scadere del timeout — cioè mai, e l'autopilota si sospenderebbe per
    // un giudizio mancato invece che per un problema vero.
    '--dangerously-skip-permissions',
    // O si riprende quella che c'è, o se ne apre una con l'id che abbiamo
    // scelto: tutte e due insieme sarebbero due sessioni per un discorso solo.
    ...(sessionId !== undefined
      ? ['--resume', sessionId]
      : nuovaSessione !== undefined ? ['--session-id', nuovaSessione] : [])
  ])
}

/**
 * L ambiente con cui parte il supervisore.
 *
 * **Il servizio nasce con ** - serve a farlo girare
 * come Node - e quella variabile prosegue in ogni processo che lancia. Arrivata
 * a , lo fa partire come Node puro: esce con un errore, e tutto
 * quello che si vede da fuori e «Command failed».
 *
 * Le chat non ne soffrono perche il PTY host ripulisce gia lo stesso elenco -
 * la regola c era, documentata, e non era applicata a questo percorso. Un
 * difetto che non si manifesta mai eseguendo lo stesso comando a mano.
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
 * `primaDegliArgomenti`: quello che va prima di `-p` — vuoto per `claude.exe`;
 * nei test lo script finto da far girare con Node.
 */
export function interrogazioneReale(claudeCmd: string, primaDegliArgomenti: string[] = [], modello: string = modelloRoutine()): Interrogazione {
  return (prompt, cwd, sessionId, opzioni) =>
    new Promise((risolvi, rifiuta) => {
      // Una cartella che non c'è fa fallire `execFile` con lo stesso «Command
      // failed» di qualunque altro guasto, e manda a cercare dalla parte
      // sbagliata: qui si dice **quale** cartella e che è quella il problema.
      if (!existsSync(cwd)) {
        rifiuta(new Error(
          `interrogazione del supervisore fallita: la cartella «${cwd}» non esiste. ` +
          'È quella che l’autopilota ha ricevuto quando è stato creato.'
        ))
        return
      }
      let args: string[] = []
      argomentiSupervisore(
        claudeCmd, cwd, sessionId, (_c, a) => { args = a }, opzioni?.nuovaSessione,
        opzioni?.routine === true ? { modello } : undefined
      )
      const figlio = execFile(
        claudeCmd,
        [...primaDegliArgomenti, ...args],
        {
          cwd,
          timeout: opzioni?.timeoutMs ?? TIMEOUT_MS,
          windowsHide: true,
          maxBuffer: 10 * 1024 * 1024,
          // Con Git nel PATH (0.82.1), come le chat: anche il supervisore è un `claude`.
          env: { ...ambientePulito(process.env), ...gitPerLeChat() }
        },
        (err, stdout, stderr) => {
          if (err !== null) {
            // **Anche lo stderr.** `err.message` di execFile dice soltanto
            // «Command failed: <comando>», che è la stessa frase per una
            // cartella che non esiste, un accesso scaduto, un modello rifiutato
            // e un timeout. Il motivo vero lo scrive il comando sul suo stderr,
            // e buttarlo via lasciava l'autopilota fermo con un messaggio che
            // non permetteva di capire niente — nemmeno da dove ricominciare.
            // **Prima lo stderr, e senza la riga di comando.** `err.message`
            // ripete il comando intero — prompt compreso, migliaia di caratteri
            // — e di un motivo se ne leggono i primi cinquecento: si vedeva il
            // prompt, che era già noto, e mai la ragione. Del messaggio resta
            // solo la parte che dice qualcosa.
            const scaduto = err.killed === true
              ? `scaduto dopo ${Math.round((opzioni?.timeoutMs ?? TIMEOUT_MS) / 60_000)} minuti`
              : ''
            const causa = err.message.startsWith('Command failed')
              ? `${err.code !== undefined ? `uscito con ${String(err.code)}` : 'non è partito'}`
              : err.message.split('\n')[0]!.slice(0, 200)
            const dettaglio = [
              scaduto,
              stderr.trim() === '' ? '' : stderr.trim().slice(0, 400),
              stdout.trim() === '' ? '' : `uscita: ${stdout.trim().slice(0, 200)}`,
              causa
            ].filter((r) => r !== '').join(' | ')
            rifiuta(new Error(`interrogazione del supervisore fallita: ${dettaglio}`))
            return
          }
          try {
            const o = JSON.parse(stdout) as { result?: unknown; session_id?: unknown }
            risolvi({
              testo: typeof o.result === 'string' ? o.result : '',
              ...(typeof o.session_id === 'string' ? { sessionId: o.session_id } : {})
            })
          } catch {
            // Con --output-format json la risposta è JSON; se non lo è, il testo
            // grezzo è comunque l'unica cosa che abbiamo, e `leggiGiudizio` sa
            // già dire di non capirlo.
            risolvi({ testo: stdout })
          }
        }
      )
      // **Il prompt sull ingresso, e poi chiuso** (0.85.1). Chiuderlo subito
      // dopo conta quanto scriverlo: Claude Code legge fino alla fine, e senza
      // la fine resterebbe ad aspettare. Un ingresso che si rompe (il comando
      // è già uscito) lo racconta la callback di execFile, non questo errore.
      figlio.stdin?.on('error', () => { /* lo dice l uscita del comando */ })
      figlio.stdin?.end(prompt, 'utf8')
    })
}

/** Quanti supervisori (`claude.exe -p`) girano insieme su questo PC, al più (0.85.2). */
export const SUPERVISORI_INSIEME = 2
/** Fra due interrogazioni sulla stessa cartella passa almeno così. */
export const STESSA_CARTELLA_DOPO_MS = 3_000

/** I supervisori al lavoro adesso, in tutto il servizio: contano come chat nei posti del PC. */
let supervisoriVivi = 0
export function supervisoriAlLavoro(): number {
  return supervisoriVivi
}

/**
 * **Pochi supervisori insieme, uno per cartella** (0.85.2).
 *
 * Il 27/10 il processore è rimasto fra il 92 e il 100% per 17 minuti: ogni
 * chat che si fermava faceva partire il suo giudizio, cioè un altro
 * `claude.exe`, e quattro fermate in pochi secondi erano quattro supervisori
 * insieme più le chat. Qui:
 * - al più `massimo` interrogazioni girano insieme (di serie
 *   `SUPERVISORI_INSIEME`); le altre aspettano in fila, nell'ordine di arrivo;
 * - sulla stessa cartella (lo stesso autopilota) una alla volta, con almeno
 *   `distanzaMs` fra la fine di una e l'inizio della dopo: più fermate di
 *   fila non diventano giudizi in parallelo sullo stesso lavoro.
 * Il tempo in fila non conta nel timeout della singola interrogazione.
 */
export function conLimite(
  interroga: Interrogazione,
  opz: { massimo?: number; distanzaMs?: number; dormi?: (ms: number) => Promise<void> } = {}
): Interrogazione & { alLavoro: () => number; inFila: () => number } {
  const massimo = Math.max(1, opz.massimo ?? SUPERVISORI_INSIEME)
  const distanza = Math.max(0, opz.distanzaMs ?? STESSA_CARTELLA_DOPO_MS)
  const dormi = opz.dormi ?? ((ms: number) => new Promise<void>((r) => { setTimeout(r, ms).unref?.() }))
  let attivi = 0
  let inAttesa = 0
  const fila: Array<() => void> = []
  const perCartella = new Map<string, Promise<void>>()
  const prendi = async (): Promise<void> => {
    if (attivi < massimo) { attivi += 1; return }
    // Il posto lo passa direttamente chi finisce: `attivi` non scende e risale.
    await new Promise<void>((r) => { fila.push(r) })
  }
  const rendi = (): void => {
    const prossimo = fila.shift()
    if (prossimo !== undefined) prossimo()
    else attivi -= 1
  }
  const avvolta = (async (prompt, cwd, sessionId, opzioni) => {
    const k = cwd.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
    const prima = perCartella.get(k) ?? Promise.resolve()
    let fine = (): void => {}
    const mia = new Promise<void>((r) => { fine = r })
    const catena = prima.then(() => mia)
    perCartella.set(k, catena)
    inAttesa += 1
    let contato = true
    try {
      await prima
      await prendi()
      inAttesa -= 1
      contato = false
      supervisoriVivi += 1
      try {
        return await interroga(prompt, cwd, sessionId, opzioni)
      } finally {
        supervisoriVivi -= 1
        rendi()
      }
    } finally {
      if (contato) inAttesa -= 1
      void dormi(distanza).then(() => {
        fine()
        if (perCartella.get(k) === catena) perCartella.delete(k)
      })
    }
  }) as Interrogazione & { alLavoro: () => number; inFila: () => number }
  avvolta.alLavoro = () => attivi
  avvolta.inFila = () => inAttesa
  return avvolta
}

/** Dopo quanti fallimenti di fila il supervisore si dice muto (0.85.1). */
export const ALLARME_DOPO = 3

export type AllarmeSupervisore = { volte: number; motivo: string; dal: string; cwd: string }

/**
 * Conta i fallimenti **di fila** del supervisore (0.85.1).
 *
 * Il 23/10 ha fallito 124 volte di seguito con lo stesso «spawn ENAMETOOLONG»
 * e da fuori non se ne accorgeva nessuno: ogni chiamata ingoia il suo errore
 * e ricade sulle regole, giustamente, ma così un supervisore muto per ore
 * sembrava solo un autopilota lento che faceva domande strane. Al terzo di
 * fila `allarme` lo dice una volta, con il motivo; una risposta riuscita
 * azzera il conto e lo dice con `ripreso`.
 */
export function conAllarme(
  interroga: Interrogazione,
  opz: {
    adesso: () => string
    allarme: (a: AllarmeSupervisore) => void
    ripreso?: (dopo: number) => void
  }
): Interrogazione & { muto: () => AllarmeSupervisore | undefined } {
  let volte = 0
  let dal = ''
  let ultimo: AllarmeSupervisore | undefined
  const avvolta = (async (prompt, cwd, sessionId, opzioni) => {
    try {
      const r = await interroga(prompt, cwd, sessionId, opzioni)
      if (volte >= ALLARME_DOPO) opz.ripreso?.(volte)
      volte = 0
      ultimo = undefined
      return r
    } catch (err) {
      if (volte === 0) dal = opz.adesso()
      volte += 1
      const motivo = (err instanceof Error ? err.message : String(err))
        .replace(/^interrogazione del supervisore fallita:\s*/, '').split('\n')[0]!.slice(0, 300)
      ultimo = { volte, motivo, dal, cwd }
      if (volte === ALLARME_DOPO) opz.allarme(ultimo)
      throw err
    }
  }) as Interrogazione & { muto: () => AllarmeSupervisore | undefined }
  avvolta.muto = () => (volte >= ALLARME_DOPO ? ultimo : undefined)
  return avvolta
}

/** La riga dell'allarme, uguale nel registro del servizio e in quello dell'autopilota. */
export function rigaAllarme(a: Pick<AllarmeSupervisore, 'volte' | 'motivo'>): string {
  return `supervisore muto: ${a.volte} interrogazioni fallite di fila — ${a.motivo}`
}

export function componiPromptGiudizio(a: Autopilota, ultimoMessaggio: string): string {
  const criteri = a.criteri
    .map((c) => `- ${c.descrizione}${c.comando !== undefined ? ` (verificato da \`${c.comando}\`, che ora passa)` : ''}`)
    .join('\n')

  return [
    'Sei il supervisore di una chat che lavora a un compito. Tutti i criteri verificabili con un comando passano.',
    'Devi dire se il lavoro è concluso davvero, oppure cosa manca.',
    '',
    `Obiettivo: ${a.obiettivo}`,
    '',
    'Criteri di fine:',
    criteri,
    '',
    'Ultimo messaggio della chat che sta lavorando:',
    ultimoMessaggio.slice(0, MESSAGGIO_MAX),
    '',
    'Rispondi con un solo oggetto JSON, senza altro testo:',
    '{"finito": true|false, "istruzioni": "cosa deve fare adesso la chat, se non è finito", "domandaUtente": "solo se indispensabile"}',
    'Se non è finito, le istruzioni devono essere concrete e verificabili. Se è finito, lascia istruzioni vuote.',
    '',
    'Usa "domandaUtente" **solo** se manca un dato che nessuno tranne l\'utente può fornire',
    '(una credenziale, una scelta che riguarda il suo prodotto o il suo denaro). Per tutto il resto',
    'scegli tu la strada più ragionevole e mettila nelle istruzioni: fermare il lavoro per una domanda',
    'evitabile toglie all\'utente esattamente il tempo che questo sistema esiste per fargli guadagnare.'
  ].join('\n')
}

/**
 * Chiede come spezzare l'obiettivo in pezzi lavorabili in parallelo.
 *
 * Il vincolo forte è che i pezzi non si tocchino: due chat che modificano gli
 * stessi file si sovrascrivono a vicenda, e il tempo risparmiato dal
 * parallelismo torna indietro moltiplicato in conflitti da sbrogliare.
 */
export function componiPromptScomposizione(a: Autopilota, quanti: number): string {
  return [
    'Devi decidere **se** questo lavoro va diviso fra piu chat, e in caso quante.',
    '',
    `Obiettivo: ${a.obiettivo}`,
    `Cartella di lavoro: ${a.cwd}`,
    '',
    'Criteri di fine dell’insieme:',
    ...a.criteri.map((c) => `- ${c.descrizione}${c.comando !== undefined ? ` (si verifica con: ${c.comando})` : ''}`),
    '',
    '**Decidi tu gli specialisti che servono** (Nicholas, 15/10): ogni specialista lavora in una',
    'chat sua, visibile nel workspace del progetto, con il ruolo nel nome.',
    '- **Lavoro piccolo** (una modifica, un file, pochi minuti): un compito solo, una chat sola.',
    '- **Lavoro con parti distinte** (pezzi indipendenti, o codice più collaudo): un compito per',
    '  parte, ognuno con il suo ruolo. Due pezzi che non si toccano sono due compiti.',
    '',
    'Regole:',
    `- da uno a ${quanti} compiti; ${quanti} è il tetto tecnico, non un obiettivo. Ogni chat lavora`,
    '  nella sua copia del progetto (un git worktree, su un suo ramo) e il suo lavoro viene unito',
    '  al ramo principale dopo la revisione; il consumo lo governa il freno sui limiti del piano;',
    '- i compiti non devono toccare gli stessi file: due chat che si sovrappongono',
    '  si sovrascrivono a vicenda e fanno perdere più tempo di quanto ne facciano guadagnare;',
    '- non inventare compiti per riempire: una chat che non serve è solo rumore per chi guarda.',
    '',
    '',
    '**Agenti specializzati** (0.71.0): a ogni compito dai un ruolo.',
    '- `sviluppo`: scrive il codice di una parte;',
    '- `interfaccia`: quello che vede la persona (PC, pagina del telefono, app), allineato;',
    '- `collaudo`: test e prove dal vero di una parte già scritta;',
    '- `rilascio`: versione, novità, controlli finali, dopo tutti gli altri. Non pubblica e non installa da solo.',
    'La revisione non la chiedi tu: il programma fa rivedere ogni ramo prima di unirlo.',
    'Con `dipendeDa` dici quali compiti (per posizione, da 0) devono essere finiti e uniti prima.',
    '',
    'Rispondi con un solo oggetto JSON, senza altro testo:',
    '{"compiti": [{"compito": "il lavoro, se non va diviso", "ruolo": "sviluppo", "dipendeDa": []}]}'
  ].join('\n')
}

/**
 * Legge l'elenco dei compiti.
 *
 * `undefined` significa «non ho capito», e per chi chiama vale «lavora con una
 * chat sola»: nel dubbio si fa la cosa semplice, non zero chat.
 */
export function leggiCompiti(testo: string): string[] | undefined {
  const inizio = testo.indexOf('{')
  const fine = testo.lastIndexOf('}')
  if (inizio === -1 || fine <= inizio) return undefined
  let o: unknown
  try {
    o = JSON.parse(testo.slice(inizio, fine + 1))
  } catch {
    return undefined
  }
  if (typeof o !== 'object' || o === null) return undefined
  const grezzi = (o as Record<string, unknown>).compiti
  if (!Array.isArray(grezzi)) return undefined
  const compiti = grezzi
    .filter((c): c is string => typeof c === 'string' && c.trim() !== '')
    .map((c) => c.trim())
  return compiti.length > 0 ? compiti : undefined
}

/**
 * Estrae il giudizio dal testo del supervisore.
 *
 * Cerca un oggetto JSON, non parole nel discorso: «sembra finito» e «non è
 * finito» condividono quasi tutte le parole, e una lettura per parole chiave
 * sbaglierebbe proprio nel caso che conta. In mancanza di un oggetto leggibile
 * restituisce `undefined`, che per il chiamante vale «non so» — mai «finito».
 */
export function leggiGiudizio(testo: string): Giudizio | undefined {
  const inizio = testo.indexOf('{')
  const fine = testo.lastIndexOf('}')
  if (inizio === -1 || fine <= inizio) return undefined

  let o: unknown
  try {
    o = JSON.parse(testo.slice(inizio, fine + 1))
  } catch {
    return undefined
  }
  if (typeof o !== 'object' || o === null) return undefined

  const r = o as Record<string, unknown>
  // `finito` deve essere un booleano vero: la stringa "si" verrebbe letta come
  // vera da qualunque conversione, e chiuderebbe un lavoro su un refuso.
  if (typeof r.finito !== 'boolean') return undefined
  const domandaUtente = typeof r.domandaUtente === 'string' ? r.domandaUtente : undefined
  return {
    finito: r.finito,
    istruzioni: typeof r.istruzioni === 'string' ? r.istruzioni : '',
    ...(domandaUtente !== undefined ? { domandaUtente } : {})
  }
}

export async function chiediGiudizio(
  a: Autopilota,
  ultimoMessaggio: string,
  interroga: Interrogazione
): Promise<{ giudizio: Giudizio | undefined; sessionId?: string }> {
  try {
    const { testo, sessionId } = await interroga(
      componiPromptGiudizio(a, ultimoMessaggio),
      a.cwd,
      undefined
    )
    return {
      giudizio: leggiGiudizio(testo),
      ...(sessionId !== undefined ? { sessionId } : {})
    }
  } catch (err) {
    // Un guasto del supervisore non deve mai diventare «finito»: chiuderebbe da
    // solo un lavoro incompleto, ed è il fallimento silenzioso peggiore che
    // questo sistema possa produrre.
    console.error('[autopilota] giudizio non ottenuto:', err)
    return { giudizio: undefined }
  }
}

/**
 * Il prompt che chiede un comando di verifica che funzioni.
 *
 * Nasce dal muro trovato sul campo: un criterio il cui comando non partiva
 * nemmeno — sintassi rotta dalla shell — teneva l'autopilota a correggere per
 * ore un codice che non aveva niente che non andasse. La chat non poteva
 * accorgersene, perché l'errore era nella domanda, non nella risposta.
 *
 * Si chiede una cosa sola e piccola: lo stesso criterio, misurato meglio.
 */
export function componiPromptRiparazione(
  criterio: { descrizione: string; comando?: string },
  uscita: string
): string {
  return [
    'Un comando di verifica non è nemmeno partito: la shell non è riuscita a eseguirlo.',
    '',
    `Criterio: «${criterio.descrizione}»`,
    `Comando: ${criterio.comando ?? ''}`,
    'Errore:',
    uscita.slice(0, 1500),
    '',
    'Scrivi un comando che verifichi **lo stesso criterio** e che funzioni davvero.',
    'Vincoli: gira su Windows dentro `bash` (Git Bash); deve uscire con 0 quando il',
    'criterio è soddisfatto e con un codice diverso quando non lo è; una riga sola;',
    'niente virgolette non chiuse e niente ritorni a capo dentro le stringhe.',
    'Provalo prima di rispondere.',
    '',
    'Rispondi **solo** con questo JSON, senza altro testo:',
    '{"comando": "..."}'
  ].join('\n')
}

/** Legge il comando riparato. Una riga vuota o un JSON storto valgono «non ci sono riuscito». */
export function leggiComandoRiparato(testo: string): string | undefined {
  const apertura = testo.indexOf('{')
  const chiusura = testo.lastIndexOf('}')
  if (apertura === -1 || chiusura <= apertura) return undefined
  try {
    const grezzo = JSON.parse(testo.slice(apertura, chiusura + 1)) as Record<string, unknown>
    const comando = typeof grezzo.comando === 'string' ? grezzo.comando.trim() : ''
    // Un comando su più righe è proprio il difetto da cui veniamo: un ritorno a
    // capo dentro una stringa è ciò che aveva rotto il comando originale.
    return comando === '' || comando.includes('\n') ? undefined : comando
  } catch {
    return undefined
  }
}

/**
 * Chiede un comando che funzioni al posto di uno che non parte.
 *
 * Come per il giudizio, un guasto qui non deve diventare una decisione: senza
 * risposta si torna indietro con `undefined`, e chi ha chiamato tiene il
 * comando che aveva.
 */
export async function riparaComando(
  a: Autopilota,
  criterio: { descrizione: string; comando?: string },
  uscita: string,
  interroga: Interrogazione
): Promise<string | undefined> {
  try {
    const { testo } = await interroga(componiPromptRiparazione(criterio, uscita), a.cwd, undefined)
    return leggiComandoRiparato(testo)
  } catch (err) {
    console.error('[autopilota] comando di verifica non riparato:', err)
    return undefined
  }
}

/**
 * Quello che l'utente ha chiesto a parole, tradotto in un cambio da applicare.
 *
 * `capito` è la parte che conta quanto le altre: è quella che si legge nella
 * scheda, e che insegna cosa sia un criterio a chi non lo sapeva. I tre campi
 * assenti vogliono dire «questo lascialo com'era» — chiedere di riscrivere
 * tutto per aggiungere un compito farebbe perdere per strada quello che c'era.
 */
export type CambioChiesto = {
  capito: string
  obiettivo?: string
  criteri?: { descrizione: string; comando?: string }[]
  compitiDaFare?: string[]
}

export function componiPromptCambio(a: Autopilota, testo: string): string {
  return [
    'Sei l autopilota che sta portando avanti questo lavoro. Chi te lo ha affidato',
    'ti ha scritto adesso, mentre lavori, e vuole cambiare qualcosa.',
    '',
    `Obiettivo attuale: ${a.obiettivo}`,
    `Cartella: ${a.cwd}`,
    'Finisce quando:',
    ...a.criteri.map((c) => `- ${c.descrizione}${c.comando !== undefined ? ` (si misura con: ${c.comando})` : ' (lo giudichi tu, guardando)'}`),
    ...(a.compitiDaFare.length > 0
      ? ['Compiti ancora in coda:', ...a.compitiDaFare.map((c) => `- ${c}`)]
      : []),
    '',
    'Ti ha scritto:',
    testo.slice(0, 2000),
    '',
    'Rispondi **solo** con questo JSON, senza altro testo. Metti soltanto i campi che',
    'cambiano: quelli che ometti restano come sono. Gli elenchi vanno scritti **interi**,',
    'non a pezzi — quello che non riscrivi sparisce.',
    '{',
    '  "capito": "una frase in italiano che dice cosa hai cambiato, per chi legge",',
    '  "obiettivo": "...",',
    '  "criteri": [{"descrizione": "...", "comando": "..."}],',
    '  "compitiDaFare": ["..."]',
    '}',
    '',
    'Niente compiti che chiedono di scrivere note, rapporti o liste in un file (`.sierradeck/`,',
    '`docs/`): il rapporto di una chat è una riga nel suo testo, una volta per turno.',
    'Un criterio non può misurare solo file sotto `.sierradeck/`: misura il lavoro, non le note.',
    'Regole: un criterio senza `comando` è legittimo e vuol dire che lo giudichi tu',
    'guardando il lavoro. I comandi girano su Windows dentro `bash` (Git Bash), su una',
    'riga sola, ed escono con 0 quando il criterio è soddisfatto. Non lasciare mai',
    'l elenco dei criteri vuoto: senza, non sapresti quando hai finito.',
    'Se non hai capito cosa vuole, rispondi solo con {"capito": "...", "dubbio": true}',
    'e non cambiare niente.'
  ].join('\n')
}

/**
 * Legge il cambio chiesto. `undefined` vale «non ho capito», e allora non si
 * tocca niente: applicare un fraintendimento costa più di una domanda in più.
 */
export function leggiCambio(testo: string): CambioChiesto | undefined {
  const apertura = testo.indexOf('{')
  const chiusura = testo.lastIndexOf('}')
  if (apertura === -1 || chiusura <= apertura) return undefined
  let grezzo: Record<string, unknown>
  try {
    grezzo = JSON.parse(testo.slice(apertura, chiusura + 1)) as Record<string, unknown>
  } catch {
    return undefined
  }
  const capito = typeof grezzo.capito === 'string' ? grezzo.capito.trim() : ''
  if (capito === '') return undefined
  // Il dubbio dichiarato è una risposta valida, e la sua conseguenza è non
  // cambiare niente: si restituisce solo ciò che ha capito, da mostrare.
  if (grezzo.dubbio === true) return { capito }

  const criteri = leggiCriteriChiesti(grezzo.criteri)
  const compiti = Array.isArray(grezzo.compitiDaFare)
    ? grezzo.compitiDaFare.filter((c): c is string => typeof c === 'string' && c.trim() !== '')
    : undefined
  const obiettivo = typeof grezzo.obiettivo === 'string' && grezzo.obiettivo.trim() !== ''
    ? grezzo.obiettivo.trim()
    : undefined
  return {
    capito,
    ...(obiettivo !== undefined ? { obiettivo } : {}),
    ...(criteri !== undefined ? { criteri } : {}),
    ...(compiti !== undefined ? { compitiDaFare: compiti } : {})
  }
}

function leggiCriteriChiesti(
  raw: unknown
): { descrizione: string; comando?: string }[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const criteri: { descrizione: string; comando?: string }[] = []
  for (const c of raw) {
    if (typeof c !== 'object' || c === null) continue
    const o = c as Record<string, unknown>
    const descrizione = typeof o.descrizione === 'string' ? o.descrizione.trim() : ''
    if (descrizione === '') continue
    const comando = typeof o.comando === 'string' ? o.comando.trim() : ''
    criteri.push({ descrizione, ...(comando !== '' ? { comando } : {}) })
  }
  // Un elenco che si svuota per strada non è un cambio: è una perdita. Meglio
  // lasciare i criteri di prima che un autopilota senza una fine.
  return criteri.length === 0 ? undefined : criteri
}

/**
 * Chiede al supervisore di tradurre in un cambio quello che gli hai scritto.
 *
 * Un guasto non deve diventare una modifica: senza risposta si torna indietro
 * con `undefined`, e l'autopilota resta esattamente com'era.
 */
export async function chiediCambio(
  a: Autopilota,
  testo: string,
  interroga: Interrogazione
): Promise<CambioChiesto | undefined> {
  try {
    const risposta = await interroga(
      componiPromptCambio(a, testo),
      a.cwd,
      a.sessioneSupervisore
    )
    return leggiCambio(risposta.testo)
  } catch (err) {
    console.error('[autopilota] cambio non capito:', err)
    return undefined
  }
}
