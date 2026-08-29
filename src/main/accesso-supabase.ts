import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { existsSync, readFileSync } from 'node:fs'
import { scriviAtomico } from '@shared/scrittura-atomica'
import { join } from 'node:path'
import { SUPABASE_URL, SUPABASE_ANON } from '@shared/supabase-config'
import type { Utente, EsitoAccesso } from '@shared/account'

/**
 * L'accesso, nel **processo principale**.
 *
 * Sta qui e non nel renderer per una ragione di sicurezza precisa: la pagina del
 * renderer ha una CSP severa (`connect-src 'self'`) che le vieta ogni chiamata di
 * rete esterna — ed è giusto così, perché in quel processo confluisce output di
 * terminale non fidato. La rete verso Supabase la fa il main, che non ha quel
 * vincolo ed è dove vive già tutto il resto della cassaforte (cifratura, sync,
 * Drive). Il renderer chiede via IPC; qui si parla con Supabase.
 *
 * La sessione la conserva Supabase, ma in un file nostro (non c'è `localStorage`
 * nel main): un piccolo archivio chiave-valore in `userData`, così chi ha fatto
 * l'accesso resta dentro anche dopo aver chiuso il programma. Il token è come
 * quello che un browser tiene nel suo storage — sta sulla macchina dell'utente.
 */

export type { Utente, EsitoAccesso }

/** Un archivio chiave-valore su file: è la «memoria» della sessione per Supabase. */
function archivioSessione(cartella: string): {
  getItem: (k: string) => string | null
  setItem: (k: string, v: string) => void
  removeItem: (k: string) => void
} {
  const file = join(cartella, 'accesso-supabase.json')
  const leggi = (): Record<string, string> => {
    try {
      return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Record<string, string>) : {}
    } catch {
      return {}
    }
  }
  const scrivi = (o: Record<string, string>): void => {
    try {
      scriviAtomico(file, JSON.stringify(o), 'accesso')
    } catch (err) {
      console.error('[accesso] sessione non salvata:', err)
    }
  }
  return {
    getItem: (k) => leggi()[k] ?? null,
    setItem: (k, v) => { const o = leggi(); o[k] = v; scrivi(o) },
    removeItem: (k) => { const o = leggi(); delete o[k]; scrivi(o) }
  }
}

let cliente: SupabaseClient | undefined

/** Avvia il client Supabase con la sessione persistita in `cartella` (userData). Una volta all'avvio. */
export function avviaAccesso(cartella: string): void {
  cliente = createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: {
      storage: archivioSessione(cartella),
      persistSession: true,
      autoRefreshToken: true,
      // Nessun browser da cui leggere un token nell'URL: qui è un programma.
      detectSessionInUrl: false
    }
  })
}

function c(): SupabaseClient {
  if (cliente === undefined) throw new Error('accesso non avviato: avviaAccesso() prima')
  return cliente
}

function utenteDa(u: { id: string; email?: string } | null | undefined): Utente | undefined {
  if (u === null || u === undefined) return undefined
  return { id: u.id, email: u.email ?? '' }
}

export async function registra(email: string, password: string): Promise<EsitoAccesso> {
  const { data, error } = await c().auth.signUp({ email, password })
  if (error !== null) return { stato: 'errore', messaggio: error.message }
  const utente = utenteDa(data.user)
  if (data.session !== null && utente !== undefined) return { stato: 'entrato', utente }
  // Email già registrata: Supabase, per non rivelarlo, risponde «ok» ma con
  // `identities` VUOTE — nessun utente nuovo, nessuna mail. Se non lo dicessimo,
  // l'utente resterebbe su un passo-codice per una mail che non arriverà mai
  // (era esattamente il sintomo «nada, nessun messaggio»).
  if (utente !== undefined && (data.user?.identities?.length ?? 0) === 0) {
    return { stato: 'errore', messaggio: 'Questa email è già registrata: prova a entrare.' }
  }
  return { stato: 'confermaEmail' }
}

/**
 * Conferma la registrazione con il **codice** ricevuto per email.
 *
 * È la via giusta per un'app desktop: niente link da aprire in un browser (che
 * per noi punterebbe a `localhost`, nessun posto), ma un codice a sei cifre che
 * l'utente digita qui dentro. Il template della mail su Supabase mostra
 * `{{ .Token }}` invece di un link, e questo lo verifica.
 */
export async function verificaCodice(email: string, codice: string): Promise<EsitoAccesso> {
  const { data, error } = await c().auth.verifyOtp({ email, token: codice.trim(), type: 'signup' })
  if (error !== null) return { stato: 'errore', messaggio: error.message }
  const utente = utenteDa(data.user)
  return utente !== undefined
    ? { stato: 'entrato', utente }
    : { stato: 'errore', messaggio: 'codice non valido' }
}

/** Rimanda il codice, se il primo non è arrivato o è scaduto. */
export async function reinviaCodice(email: string): Promise<{ ok: boolean; messaggio?: string }> {
  const { error } = await c().auth.resend({ type: 'signup', email })
  return error === null ? { ok: true } : { ok: false, messaggio: error.message }
}

export async function entra(email: string, password: string): Promise<EsitoAccesso> {
  const { data, error } = await c().auth.signInWithPassword({ email, password })
  if (error !== null) return { stato: 'errore', messaggio: error.message }
  const utente = utenteDa(data.user)
  return utente !== undefined
    ? { stato: 'entrato', utente }
    : { stato: 'errore', messaggio: 'accesso non riuscito' }
}

export async function esci(): Promise<void> {
  await c().auth.signOut()
}

export async function utenteCorrente(): Promise<Utente | undefined> {
  const { data } = await c().auth.getSession()
  return utenteDa(data.session?.user)
}

/** Avvisa quando l'accesso cambia (entra/esce/token rinnovato). Restituisce come disiscriversi. */
export function suCambioAccesso(cb: (utente: Utente | undefined) => void): () => void {
  const { data } = c().auth.onAuthStateChange((_evento, sessione) => cb(utenteDa(sessione?.user)))
  return () => data.subscription.unsubscribe()
}

/**
 * Un access token valido per le API di Google? No — questo è il token di
 * **Supabase**, l'identità. Serve dove un domani vorremo che il nostro backend
 * sappia chi sei (abbonamento). Il token per il Drive è un'altra cosa (OAuth
 * Google). Esposto qui perché è il main a custodire la sessione.
 */
export async function tokenAccesso(): Promise<string | undefined> {
  const { data } = await c().auth.getSession()
  return data.session?.access_token ?? undefined
}
