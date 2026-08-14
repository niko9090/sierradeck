import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { NON_EREDITATE } from '../pty-host/pty-manager'
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
  }
) => Promise<{ testo: string; sessionId?: string }>

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
  prompt: string,
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
  nuovaSessione?: string
): void {
  avvia(claudeCmd, [
    '-p', prompt,
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

export function interrogazioneReale(claudeCmd: string): Interrogazione {
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
        claudeCmd, prompt, cwd, sessionId, (_c, a) => { args = a }, opzioni?.nuovaSessione
      )
      const figlio = execFile(
        claudeCmd,
        args,
        {
          cwd,
          timeout: opzioni?.timeoutMs ?? TIMEOUT_MS,
          windowsHide: true,
          maxBuffer: 10 * 1024 * 1024,
          env: ambientePulito(process.env)
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
      // **Niente da leggere sull ingresso.** Senza questa riga Claude Code
      // resta tre secondi ad aspettare che qualcuno gli scriva qualcosa, lo
      // annuncia sul suo stderr - «no stdin data received in 3s» - e quei tre
      // secondi li paga ogni interrogazione. Nessuno gli scrivera mai niente:
      // il prompt e gia negli argomenti.
      figlio.stdin?.end()
    })
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
    '**Il caso normale è una chat sola.** Dentro una conversazione puoi già lanciare i tuoi',
    'agenti e portare avanti più cose insieme: aprirne un’altra serve solo quando il lavoro',
    'ha parti che devono procedere per strade separate e non possono aspettarsi a vicenda.',
    '',
    'Regole:',
    `- da uno a ${quanti} compiti. Il numero non è un obiettivo da raggiungere: ${quanti} è`,
    '  il tetto che l’utente ha concesso, non quello che si aspetta di vedere;',
    '- dividi **solo** se ogni pezzo vale una conversazione a sé — un lavoro suo, che',
    '  procede da solo per parecchi minuti senza dover sapere cosa fa l’altro;',
    '- i compiti non devono toccare gli stessi file: due chat che si sovrappongono',
    '  si sovrascrivono a vicenda e fanno perdere più tempo di quanto ne facciano guadagnare;',
    '- nel dubbio, **un compito solo**. Una chat che si apre è una conversazione da seguire,',
    '  da leggere e da chiudere per chi guarda: se non serve, è solo rumore.',
    '',
    'Rispondi con un solo oggetto JSON, senza altro testo:',
    '{"compiti": ["il lavoro, se non va diviso"]}'
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
