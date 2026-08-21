import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_ANON } from '@shared/supabase-config'

/**
 * L'accesso, appoggiato a Supabase.
 *
 * Un involucro sottile: qui non c'è logica nostra, solo i quattro gesti —
 * registrarsi, entrare, uscire, sapere chi c'è — nella forma che il resto
 * dell'app capisce, senza dover conoscere Supabase. Se un domani cambiassimo
 * provider dell'accesso, cambia solo questo file.
 *
 * La sessione la conserva Supabase da sé (in `localStorage` del renderer): chi ha
 * fatto l'accesso resta dentro anche dopo aver chiuso il programma, finché non
 * esce. Nota: Supabase, appena creato, chiede di **confermare l'email** dopo la
 * registrazione — allora `registra` restituisce `confermaEmail` invece di far
 * entrare subito. Si può togliere la conferma dalle impostazioni del progetto per
 * le prove.
 */

let cliente: SupabaseClient | undefined
function client(): SupabaseClient {
  cliente ??= createClient(SUPABASE_URL, SUPABASE_ANON)
  return cliente
}

export type Utente = { id: string; email: string }

export type EsitoAccesso =
  | { stato: 'entrato'; utente: Utente }
  | { stato: 'confermaEmail' }
  | { stato: 'errore'; messaggio: string }

function utenteDa(u: { id: string; email?: string } | null | undefined): Utente | undefined {
  if (u === null || u === undefined) return undefined
  return { id: u.id, email: u.email ?? '' }
}

export async function registra(email: string, password: string): Promise<EsitoAccesso> {
  const { data, error } = await client().auth.signUp({ email, password })
  if (error !== null) return { stato: 'errore', messaggio: error.message }
  const utente = utenteDa(data.user)
  if (data.session !== null && utente !== undefined) return { stato: 'entrato', utente }
  return { stato: 'confermaEmail' }
}

export async function entra(email: string, password: string): Promise<EsitoAccesso> {
  const { data, error } = await client().auth.signInWithPassword({ email, password })
  if (error !== null) return { stato: 'errore', messaggio: error.message }
  const utente = utenteDa(data.user)
  return utente !== undefined
    ? { stato: 'entrato', utente }
    : { stato: 'errore', messaggio: 'accesso non riuscito' }
}

export async function esci(): Promise<void> {
  await client().auth.signOut()
}

export async function utenteCorrente(): Promise<Utente | undefined> {
  const { data } = await client().auth.getSession()
  return utenteDa(data.session?.user)
}

/** Avvisa quando l'accesso cambia (entra/esce/token rinnovato). Restituisce come disiscriversi. */
export function suCambioAccesso(cb: (utente: Utente | undefined) => void): () => void {
  const { data } = client().auth.onAuthStateChange((_evento, sessione) => cb(utenteDa(sessione?.user)))
  return () => data.subscription.unsubscribe()
}
