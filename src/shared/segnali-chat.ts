/**
 * I segnali di Claude Code al posto della lettura dello schermo (0.45.0).
 *
 * Nicholas (02/10, punto 3 della lista): lo stato di una chat, le domande e i
 * permessi, la partenza e la fine del turno e gli errori si prendono dagli
 * **hook documentati** di Claude Code, non dallo schermo. Ogni chat aperta da
 * SierraDeck riceve con `--settings` degli hook che mandano il loro JSON al
 * PC (`POST /api/segnale`, solo da questo computer, come la riga di stato):
 *
 * - `SessionStart` (avvio, ripresa): la chat c'è e aspetta il primo messaggio;
 * - `UserPromptSubmit`: è partito un turno → al lavoro;
 * - `PermissionRequest` (2.0.45): chiede un permesso, con lo strumento e
 *   l'input → «aspetta che tu scelga»;
 * - `Notification`: `permission_prompt` (permesso), `idle_prompt` (ferma da
 *   un po' ad aspettarti), `elicitation_dialog` (una domanda);
 * - `Stop`: il turno è finito → aspetta te, con l'ultimo messaggio;
 * - `StopFailure` (2.1.78): il turno è morto per un errore dell'API (limiti,
 *   accesso) → errore, con il motivo;
 * - `SessionEnd`: la chat si è chiusa.
 *
 * La lettura dello schermo resta **solo come riserva**, quando una chat non
 * ha mai mandato un segnale (una chat aperta prima di questa versione, o un
 * Claude Code troppo vecchio), e il registro lo dice.
 *
 * I JSON veri, presi da Claude Code 2.1.287, sono in
 * `tests/fixtures/hook-claude-2.1.287/`.
 */

export type EventoHook = 'SessionStart' | 'UserPromptSubmit' | 'PermissionRequest' | 'Notification' | 'Stop' | 'StopFailure' | 'SessionEnd' | 'PreToolUse' | 'PostToolUse'

export const EVENTI_SEGNALI: readonly EventoHook[] = ['SessionStart', 'UserPromptSubmit', 'PermissionRequest', 'Notification', 'Stop', 'StopFailure', 'SessionEnd', 'PreToolUse', 'PostToolUse']
/**
 * Gli strumenti per cui serve `PreToolUse` (0.76.0): la domanda a scelte. Per
 * gli altri basta `PostToolUse` (dopo una risposta, la chat lavora di nuovo).
 * Dalla 0.79.0 anche quelli lunghi (comandi, agenti): il riassunto della
 * dashboard dice «fa girare i test» mentre girano, non quando sono finiti.
 */
const PRE_TOOL_MATCHER = 'AskUserQuestion|Bash|PowerShell|Task|Agent'

export type Segnale = {
  sessione: string
  evento: EventoHook
  quando: string
  cwd?: string
  /** Notification: il tipo (`permission_prompt`, `idle_prompt`, …) e il messaggio. */
  tipoNotifica?: string
  messaggio?: string
  /** PermissionRequest: lo strumento e cosa vuole fare. */
  strumento?: string
  dettaglio?: string
  /** Bash/PowerShell: il comando, per dire cosa fa in parole semplici (0.79.0). */
  comando?: string
  /** StopFailure: il tipo d'errore e la spiegazione. */
  errore?: string
  /** Stop: l'ultimo messaggio della chat (per le Domande e le notifiche). */
  ultimoMessaggio?: string
  /** SessionStart: `startup`, `resume`, …; SessionEnd: il motivo. */
  origine?: string
}

const testo = (x: unknown): string | undefined => (typeof x === 'string' && x.trim() !== '' ? x : undefined)

/** Il JSON di un hook (come lo manda Claude Code), letto. `undefined` se non è un evento che ci interessa. */
export function leggiSegnale(x: unknown, quando: string): Segnale | undefined {
  if (typeof x !== 'object' || x === null) return undefined
  const o = x as Record<string, unknown>
  const evento = o.hook_event_name
  const sessione = testo(o.session_id)
  if (sessione === undefined || typeof evento !== 'string' || !(EVENTI_SEGNALI as readonly string[]).includes(evento)) return undefined
  const ti = o.tool_input as Record<string, unknown> | undefined
  const dettaglio = ti !== undefined && typeof ti === 'object'
    ? testo(ti.description) ?? testo(ti.command) ?? testo(ti.file_path) ?? testo(JSON.stringify(ti).slice(0, 300))
    : undefined
  return {
    sessione, evento: evento as EventoHook, quando,
    ...(testo(o.cwd) !== undefined ? { cwd: o.cwd as string } : {}),
    ...(testo(o.notification_type) !== undefined ? { tipoNotifica: o.notification_type as string } : {}),
    ...(testo(o.message) !== undefined ? { messaggio: (o.message as string).slice(0, 500) } : {}),
    ...(testo(o.tool_name) !== undefined ? { strumento: o.tool_name as string } : {}),
    ...(dettaglio !== undefined ? { dettaglio: dettaglio.slice(0, 300) } : {}),
    ...(ti !== undefined && typeof ti === 'object' && testo(ti.command) !== undefined ? { comando: (ti.command as string).slice(0, 300) } : {}),
    ...(testo(o.error) !== undefined ? { errore: [o.error as string, testo(o.error_details)].filter((v) => v !== undefined).join(': ').slice(0, 500) } : {}),
    ...(testo(o.last_assistant_message) !== undefined ? { ultimoMessaggio: (o.last_assistant_message as string).slice(-2000) } : {}),
    ...(testo(o.source) !== undefined ? { origine: o.source as string } : testo(o.reason) !== undefined ? { origine: o.reason as string } : {})
  }
}

/** Com'è una chat secondo i segnali. */
export type StatoSegnali = {
  fase: 'lavora' | 'aspetta' | 'chiede' | 'errore' | 'chiusa'
  /** Quando è arrivato il segnale che decide. */
  dal: string
  /** Se chiede: un permesso (con lo strumento) o una domanda. */
  chiede?: { tipo: 'permesso' | 'domanda'; strumento?: string; dettaglio?: string; messaggio?: string }
  errore?: string
  ultimoMessaggio?: string
}

/**
 * Lo stato dai segnali di una chat, dal più vecchio al più nuovo. Vince
 * l'ultimo segnale che dice qualcosa sullo stato (una notifica `idle_prompt`
 * dopo uno `Stop` non cambia niente: era già ferma).
 */
export function statoDaSegnali(segnali: Segnale[]): StatoSegnali | undefined {
  let s: StatoSegnali | undefined
  let ultimoMessaggio: string | undefined
  for (const g of segnali) {
    if (g.ultimoMessaggio !== undefined) ultimoMessaggio = g.ultimoMessaggio
    switch (g.evento) {
      case 'SessionStart': s = { fase: 'aspetta', dal: g.quando }; break
      case 'UserPromptSubmit': s = { fase: 'lavora', dal: g.quando }; break
      case 'PermissionRequest':
        s = { fase: 'chiede', dal: g.quando, chiede: { tipo: 'permesso', ...(g.strumento !== undefined ? { strumento: g.strumento } : {}), ...(g.dettaglio !== undefined ? { dettaglio: g.dettaglio } : {}) } }
        break
      case 'Notification':
        if (g.tipoNotifica === 'permission_prompt') {
          // Arriva dopo PermissionRequest: tiene lo strumento che quello aveva detto.
          s = { fase: 'chiede', dal: s?.fase === 'chiede' ? s.dal : g.quando, chiede: { ...(s?.chiede ?? { tipo: 'permesso' }), ...(g.messaggio !== undefined ? { messaggio: g.messaggio } : {}) } }
        } else if (g.tipoNotifica === 'elicitation_dialog') {
          s = { fase: 'chiede', dal: g.quando, chiede: { tipo: 'domanda', ...(g.messaggio !== undefined ? { messaggio: g.messaggio } : {}) } }
        } else if (g.tipoNotifica === 'idle_prompt' && s?.fase !== 'chiede' && s?.fase !== 'errore') {
          s = { fase: 'aspetta', dal: s?.fase === 'aspetta' ? s.dal : g.quando }
        }
        break
      // La domanda a scelte sullo schermo (0.76.0): AskUserQuestion non chiede un permesso.
      case 'PreToolUse':
        if (g.strumento === 'AskUserQuestion') s = { fase: 'chiede', dal: g.quando, chiede: { tipo: 'domanda', strumento: g.strumento, ...(g.dettaglio !== undefined ? { dettaglio: g.dettaglio } : {}) } }
        break
      // Uno strumento finito (0.76.0): dopo una risposta o un permesso la chat lavora di
      // nuovo. Prima restava «chiede» fino alla fine del turno.
      case 'PostToolUse':
        if (s?.fase !== 'chiusa') s = { fase: 'lavora', dal: s?.fase === 'lavora' ? s.dal : g.quando }
        break
      case 'Stop': s = { fase: 'aspetta', dal: g.quando }; break
      case 'StopFailure': s = { fase: 'errore', dal: g.quando, ...(g.errore !== undefined ? { errore: g.errore } : {}) }; break
      case 'SessionEnd': s = { fase: 'chiusa', dal: g.quando }; break
    }
  }
  return s === undefined ? undefined : { ...s, ...(ultimoMessaggio !== undefined ? { ultimoMessaggio } : {}) }
}

/** Dopo quanto lo schermo fermo sul campo vince su un «al lavoro» dai segnali senza fine del turno (0.73.0). */
export const SCHERMO_VINCE_DOPO_MS = 15_000

/**
 * Cosa vale per il resto del programma: dai segnali se ce ne sono, dallo
 * schermo come riserva. `fonte` dice da dove viene (il registro lo annota
 * quando è lo schermo).
 */
export function statoChat(p: { segnali?: StatoSegnali; schermo: { aspetta: boolean; chiede: boolean }; adesso?: number }): { aspetta: boolean; chiede: boolean; lavora: boolean; errore?: string; fonte: 'segnali' | 'schermo' } {
  const s = p.segnali
  if (s === undefined) return { aspetta: p.schermo.aspetta, chiede: p.schermo.chiede, lavora: !p.schermo.aspetta && !p.schermo.chiede, fonte: 'schermo' }
  // 0.73.0: un «al lavoro» o un «chiede» dai segnali senza la fine del turno
  // (uno Stop perso, un turno interrotto, un permesso a cui ha risposto
  // l'autopilota) teneva la chat «al lavoro» per sempre, e la sua coda non
  // partiva mai. Se lo schermo mostra il campo pronto da più di poco, vince lo schermo.
  // 0.76.0: lo schermo deve dire davvero «nessuna scelta aperta» (`schermo.chiede`
  // falso): una domanda a scelte ha «❯» e sembrava un campo pronto, e dopo 15
  // secondi la chat che chiedeva diventava «ferma» ovunque.
  if (p.adesso !== undefined && (s.fase === 'lavora' || s.fase === 'chiede') && p.schermo.aspetta && !p.schermo.chiede &&
    p.adesso - Date.parse(s.dal) >= SCHERMO_VINCE_DOPO_MS) {
    return { aspetta: true, chiede: false, lavora: false, fonte: 'schermo' }
  }
  return {
    aspetta: s.fase === 'aspetta' || s.fase === 'chiede' || s.fase === 'errore',
    chiede: s.fase === 'chiede',
    lavora: s.fase === 'lavora',
    ...(s.errore !== undefined ? { errore: s.errore } : {}),
    fonte: 'segnali'
  }
}

/**
 * Gli hook da mettere in `--settings` per mandare i segnali al PC: di tipo
 * **http** (Claude Code 2.1.63+, come quelli dell'autopilota), senza nessuna
 * shell in mezzo. Un comando `curl` non andava: su questo PC Claude Code
 * lancia i comandi con PowerShell, dove `curl` e' un altro programma
 * (Invoke-WebRequest) e falliva in silenzio — provato il 02/10. La rotta
 * risponde 204 senza corpo, quindi l'hook non decide niente al posto di
 * Claude Code (`PermissionRequest` senza risposta lascia la scelta allo schermo).
 */
export function hookSegnali(porta: number): Record<string, unknown> {
  const hooks: Record<string, unknown> = {}
  for (const e of EVENTI_SEGNALI) hooks[e] = [{ matcher: e === 'PreToolUse' ? PRE_TOOL_MATCHER : '', hooks: [{ type: 'http', url: `http://127.0.0.1:${porta}/api/segnale`, timeout: 5 }] }]
  return { hooks }
}

/**
 * Unisce due `--settings`: le chiavi semplici le prende la seconda, gli hook si
 * **sommano** evento per evento (quelli dell'autopilota restano, i segnali si
 * aggiungono). `fondiImpostazioni` sovrascriveva l'intera chiave `hooks`.
 */
export function unisciConHook(baseJson: string | undefined, altro: Record<string, unknown>): string {
  let base: Record<string, unknown> = {}
  if (baseJson !== undefined && baseJson.trim() !== '') {
    try { const p: unknown = JSON.parse(baseJson); if (typeof p === 'object' && p !== null) base = p as Record<string, unknown> } catch { /* si riparte da vuoto */ }
  }
  const hb = (typeof base.hooks === 'object' && base.hooks !== null ? base.hooks : {}) as Record<string, unknown[]>
  const ha = (typeof altro.hooks === 'object' && altro.hooks !== null ? altro.hooks : {}) as Record<string, unknown[]>
  const hooks: Record<string, unknown[]> = { ...hb }
  for (const [e, lista] of Object.entries(ha)) hooks[e] = [...(Array.isArray(hb[e]) ? hb[e] : []), ...(Array.isArray(lista) ? lista : [])]
  return JSON.stringify({ ...base, ...altro, hooks })
}

/** Quanti segnali si tengono per chat: bastano gli ultimi. */
export const SEGNALI_PER_CHAT = 40

/** Lo stato essenziale che il main manda alle finestre a ogni segnale. */
export type FaseSessione = { sessione: string; fase: StatoSegnali['fase']; dal: string }

/** Dopo quanto un «aspetta» dai segnali vale come campo pronto (il disegno del prompt arriva un attimo dopo). */
export const PRONTA_DOPO_MS = 1500
/** Un «al lavoro» dai segnali vale come partenza della consegna se e' di cosi' poco fa. */
export const PARTITA_ENTRO_MS = 60_000

/**
 * La chat e' pronta a ricevere una consegna? Dai segnali: «aspetta» da almeno
 * un attimo. `undefined` = i segnali non lo sanno (riserva: lo schermo).
 */
export function prontaDaSegnali(f: FaseSessione | undefined, adesso: number): boolean | undefined {
  if (f === undefined) return undefined
  if (f.fase === 'aspetta') return adesso - Date.parse(f.dal) >= PRONTA_DOPO_MS
  if (f.fase === 'lavora' || f.fase === 'chiede') return false
  return undefined
}

/**
 * Sta lavorando? Dai segnali (0.57.1): un turno cominciato da meno di dieci
 * minuti e non ancora finito. Oltre, un «lavora» senza fine può essere un
 * segnale perso: decide lo schermo.
 */
export function lavoraDaSegnali(f: FaseSessione | undefined, adesso: number): boolean | undefined {
  if (f === undefined) return undefined
  if (f.fase === 'aspetta') return false
  if (f.fase === 'lavora' && adesso - Date.parse(f.dal) < 10 * 60_000) return true
  return undefined
}

/**
 * La consegna e' partita? Dai segnali: un turno cominciato (`UserPromptSubmit`)
 * o un permesso chiesto da poco. `undefined` = i segnali non lo dicono.
 *
 * `scrittaIl` (0.86.2): quando il testo è stato scritto. Allora conta solo un
 * turno cominciato **dopo**: prima un turno di 50 s fa valeva come la partenza
 * del messaggio appena scritto, e uno partito davvero dopo non bastava se lo
 * schermo diceva altro. Un «lavora» di prima non dice niente: decide lo schermo.
 */
export function partitaDaSegnali(f: FaseSessione | undefined, adesso: number, scrittaIl?: number): boolean | undefined {
  if (f === undefined) return undefined
  if (f.fase !== 'lavora' && f.fase !== 'chiede') return undefined
  const dal = Date.parse(f.dal)
  if (scrittaIl !== undefined) return dal >= scrittaIl - SCARTO_OROLOGI_MS && adesso - dal < PARTITA_ENTRO_MS ? true : undefined
  if (adesso - dal < PARTITA_ENTRO_MS) return true
  return undefined
}

/** Il segnale nasce nel main e la scrittura nella finestra: un margine per i due orologi. */
const SCARTO_OROLOGI_MS = 500

/**
 * L'indicatore «al lavoro / ferma» di una chat (0.76.0). Nicholas, 16/10:
 * l'indicatore «va a caso». Sul PC veniva dal solo flusso del terminale
 * («ha scritto qualcosa da poco»): un comando lungo che tace sembrava fermo, un
 * ridisegno sembrava lavoro. Adesso la fonte è una, come per la pagina e l'app:
 * i segnali degli hook (inizio e fine turno, domanda, strumento finito). Lo
 * schermo vale solo quando mancano, e quando dice da più di 15 secondi che il
 * campo è pronto mentre i segnali dicono «lavora» (uno Stop perso).
 */
export function indicatoreChat(p: {
  fase?: { fase: StatoSegnali['fase']; dal: string }
  /** Lo schermo mostra il campo pronto e nessuna riga d'attività. */
  campoPronto: boolean
  /** Il flusso del terminale si muove (la riserva di sempre). */
  attivoDalFlusso: boolean
  adesso: number
}): 'lavora' | 'chiede' | 'ferma' {
  const f = p.fase
  if (f === undefined) return p.attivoDalFlusso && !p.campoPronto ? 'lavora' : 'ferma'
  if (f.fase === 'chiede') return 'chiede'
  if (f.fase === 'lavora') return p.campoPronto && p.adesso - Date.parse(f.dal) >= SCHERMO_VINCE_DOPO_MS ? 'ferma' : 'lavora'
  return 'ferma'
}
