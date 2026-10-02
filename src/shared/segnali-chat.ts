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

export type EventoHook = 'SessionStart' | 'UserPromptSubmit' | 'PermissionRequest' | 'Notification' | 'Stop' | 'StopFailure' | 'SessionEnd'

export const EVENTI_SEGNALI: readonly EventoHook[] = ['SessionStart', 'UserPromptSubmit', 'PermissionRequest', 'Notification', 'Stop', 'StopFailure', 'SessionEnd']

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
      case 'Stop': s = { fase: 'aspetta', dal: g.quando }; break
      case 'StopFailure': s = { fase: 'errore', dal: g.quando, ...(g.errore !== undefined ? { errore: g.errore } : {}) }; break
      case 'SessionEnd': s = { fase: 'chiusa', dal: g.quando }; break
    }
  }
  return s === undefined ? undefined : { ...s, ...(ultimoMessaggio !== undefined ? { ultimoMessaggio } : {}) }
}

/**
 * Cosa vale per il resto del programma: dai segnali se ce ne sono, dallo
 * schermo come riserva. `fonte` dice da dove viene (il registro lo annota
 * quando è lo schermo).
 */
export function statoChat(p: { segnali?: StatoSegnali; schermo: { aspetta: boolean; chiede: boolean } }): { aspetta: boolean; chiede: boolean; lavora: boolean; errore?: string; fonte: 'segnali' | 'schermo' } {
  const s = p.segnali
  if (s === undefined) return { aspetta: p.schermo.aspetta, chiede: p.schermo.chiede, lavora: !p.schermo.aspetta && !p.schermo.chiede, fonte: 'schermo' }
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
  for (const e of EVENTI_SEGNALI) hooks[e] = [{ matcher: '', hooks: [{ type: 'http', url: `http://127.0.0.1:${porta}/api/segnale`, timeout: 5 }] }]
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
 * La consegna e' partita? Dai segnali: un turno cominciato (`UserPromptSubmit`)
 * o un permesso chiesto da poco. `undefined` = i segnali non lo dicono.
 */
export function partitaDaSegnali(f: FaseSessione | undefined, adesso: number): boolean | undefined {
  if (f === undefined) return undefined
  if ((f.fase === 'lavora' || f.fase === 'chiede') && adesso - Date.parse(f.dal) < PARTITA_ENTRO_MS) return true
  return undefined
}
