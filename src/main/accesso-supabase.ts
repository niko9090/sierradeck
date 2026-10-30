import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { join } from 'node:path'
import { leggiSegreto, leggiSegretoConStato, scriviSegreto, type Portachiavi } from './segreti-su-file'
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

/** Il file della sessione, nella cartella dei dati (le copie di versione non lo copiano più dalla 0.86.2). */
export const FILE_ACCESSO_SUPABASE = 'accesso-supabase.json'

/**
 * Un archivio chiave-valore su file: è la «memoria» della sessione per Supabase.
 * Dalla 0.86.2 (audit I5) cifrato con il portachiavi del sistema, se c'è; il
 * file in chiaro di prima (e le sue copie di versione) si cifra alla prima lettura.
 */
export function archivioSessione(cartella: string, portachiavi?: Portachiavi): {
  getItem: (k: string) => string | null
  setItem: (k: string, v: string) => void
  removeItem: (k: string) => void
} {
  const file = join(cartella, FILE_ACCESSO_SUPABASE)
  // Le copie di versione non si cifrano (S3): con loro una versione di prima riparte con l'accesso.
  // Un file cifrato con il portachiavi non pronto non si riscrive (`scriviSegreto`), anche se qui sembra vuoto.
  const leggi = (): Record<string, string> => {
    const testo = leggiSegreto(file, portachiavi, 'accesso')
    if (testo === undefined) return {}
    try {
      const o = JSON.parse(testo) as unknown
      return o !== null && typeof o === 'object' ? (o as Record<string, string>) : {}
    } catch {
      return {}
    }
  }
  const scrivi = (o: Record<string, string>): void => {
    try {
      scriviSegreto(file, JSON.stringify(o), portachiavi, 'accesso')
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
export function avviaAccesso(cartella: string, portachiavi?: Portachiavi): void {
  const crea = (): SupabaseClient => createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: {
      storage: archivioSessione(cartella, portachiavi),
      persistSession: true,
      autoRefreshToken: true,
      // Nessun browser da cui leggere un token nell'URL: qui è un programma.
      detectSessionInUrl: false
    }
  })
  cliente = crea()
  // S3: la sessione è cifrata ma il portachiavi non risponde ancora. Non è
  // un'uscita: il file resta intatto (`scriviSegreto` non lo tocca) e, appena
  // il portachiavi è pronto, il client riparte e la ritrova.
  if (portachiaviNonProntoPer(cartella, portachiavi)) {
    console.warn('[accesso] portachiavi non pronto: la sessione resta dov\'è, riprovo fra poco')
    let giri = 0
    const timer = setInterval(() => {
      giri += 1
      if (!portachiaviNonProntoPer(cartella, portachiavi)) {
        clearInterval(timer)
        cliente = crea()
        console.warn('[accesso] portachiavi pronto: sessione riletta')
      } else if (giri >= RIPROVE_PORTACHIAVI) clearInterval(timer)
    }, ATTESA_PORTACHIAVI_MS)
    timer.unref?.()
  }
}

const ATTESA_PORTACHIAVI_MS = 5_000
/** Dieci minuti: poi resta per il prossimo avvio, sempre senza toccare il file. */
const RIPROVE_PORTACHIAVI = 120

/** La sessione su disco è cifrata e il portachiavi non risponde (S3). */
export function portachiaviNonProntoPer(cartella: string, portachiavi?: Portachiavi): boolean {
  return leggiSegretoConStato(join(cartella, FILE_ACCESSO_SUPABASE), portachiavi, 'accesso', { migra: false }).stato === 'portachiavi-non-pronto'
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
