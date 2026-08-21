import type { Utente, EsitoAccesso } from '@shared/account'

/**
 * L'accesso, visto dal renderer: un involucro sottile sopra l'IPC.
 *
 * Il lavoro vero — parlare con Supabase, tenere la sessione — sta nel main, per
 * la CSP severa di questa pagina (che vieta la rete esterna) e perché è lì che
 * vive la cassaforte. Qui non c'è più `@supabase/supabase-js`: solo la chiamata a
 * `window.gestore.account`, così i componenti restano uguali.
 */

export type { Utente, EsitoAccesso }

export function registra(email: string, password: string): Promise<EsitoAccesso> {
  return window.gestore.account.registra(email, password)
}

export function entra(email: string, password: string): Promise<EsitoAccesso> {
  return window.gestore.account.entra(email, password)
}

export function esci(): Promise<void> {
  return window.gestore.account.esci()
}

/** Conferma la registrazione col codice ricevuto per email. */
export function verificaCodice(email: string, codice: string): Promise<EsitoAccesso> {
  return window.gestore.account.verifica(email, codice)
}

/** Rimanda il codice di conferma. */
export function reinviaCodice(email: string): Promise<{ ok: boolean; messaggio?: string }> {
  return window.gestore.account.reinvia(email)
}

export function utenteCorrente(): Promise<Utente | undefined> {
  return window.gestore.account.utente()
}

/** Avvisa quando l'accesso cambia. `null` dal canale significa «uscito». */
export function suCambioAccesso(cb: (utente: Utente | undefined) => void): () => void {
  return window.gestore.account.onCambiato((u) => cb(u ?? undefined))
}
