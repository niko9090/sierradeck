import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import type { Autopilota } from '@shared/autopilota'
import type { Giudizio } from './decisione'

export type Interrogazione = (
  prompt: string,
  cwd: string,
  sessionId: string | undefined
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
  avvia: (comando: string, args: string[]) => void
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
    ...(sessionId !== undefined ? ['--resume', sessionId] : [])
  ])
}

export function interrogazioneReale(claudeCmd: string): Interrogazione {
  return (prompt, cwd, sessionId) =>
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
      argomentiSupervisore(claudeCmd, prompt, cwd, sessionId, (_c, a) => { args = a })
      execFile(
        claudeCmd,
        args,
        { cwd, timeout: TIMEOUT_MS, windowsHide: true, maxBuffer: 10 * 1024 * 1024 },
        (err, stdout, stderr) => {
          if (err !== null) {
            // **Anche lo stderr.** `err.message` di execFile dice soltanto
            // «Command failed: <comando>», che è la stessa frase per una
            // cartella che non esiste, un accesso scaduto, un modello rifiutato
            // e un timeout. Il motivo vero lo scrive il comando sul suo stderr,
            // e buttarlo via lasciava l'autopilota fermo con un messaggio che
            // non permetteva di capire niente — nemmeno da dove ricominciare.
            const dettaglio = [
              err.message,
              stderr.trim() === '' ? '' : `stderr: ${stderr.trim().slice(0, 600)}`,
              stdout.trim() === '' ? '' : `uscita: ${stdout.trim().slice(0, 300)}`
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
    `Devi spezzare un obiettivo in al massimo ${quanti} compiti che possano procedere in parallelo.`,
    '',
    `Obiettivo: ${a.obiettivo}`,
    `Cartella di lavoro: ${a.cwd}`,
    '',
    'Criteri di fine dell’insieme:',
    ...a.criteri.map((c) => `- ${c.descrizione}${c.comando !== undefined ? ` (si verifica con: ${c.comando})` : ''}`),
    '',
    'Regole:',
    `- al massimo ${quanti} compiti, anche meno se il lavoro non si divide bene;`,
    '- i compiti non devono toccare gli stessi file: due chat che si sovrappongono',
    '  si sovrascrivono a vicenda e fanno perdere più tempo di quanto ne facciano guadagnare;',
    '- se il lavoro è indivisibile, restituisci un solo compito.',
    '',
    'Rispondi con un solo oggetto JSON, senza altro testo:',
    '{"compiti": ["primo compito", "secondo compito"]}'
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
