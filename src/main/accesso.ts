import { join } from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'

export type StatoAccesso = {
  autenticato: boolean
  /** Perché non lo è, in parole che dicono cosa fare. */
  motivo?: string
  email?: string
  organizzazione?: string
  /** Il piano, quando Claude Code lo riporta: serve a leggere i consumi. */
  piano?: string
}

/**
 * Dice se Claude Code ha già fatto l'accesso su questa macchina.
 *
 * Serve perché il gestore lancia `claude.exe` dentro riquadri che l'utente
 * magari non sta guardando: senza accesso quelle chat si fermano su una
 * schermata di login, e chi ha appena aperto sei riquadri vede sei terminali
 * che «non fanno niente» senza sapere perché.
 *
 * Si legge dai file, non lanciando `claude`: un lancio costerebbe l'avvio
 * completo (decine di secondi su questa macchina) per una domanda a cui due
 * file rispondono subito.
 */
export function leggiAccesso(casa: string = homedir()): StatoAccesso {
  const credenziali = join(casa, '.claude', '.credentials.json')
  const configurazione = join(casa, '.claude.json')

  let config: Record<string, unknown> | undefined
  try {
    if (existsSync(configurazione)) {
      const letto: unknown = JSON.parse(readFileSync(configurazione, 'utf8'))
      if (typeof letto === 'object' && letto !== null) config = letto as Record<string, unknown>
    }
  } catch (err) {
    // Un file illeggibile non è un accesso mancante, ma non è nemmeno una
    // conferma: si prosegue trattandolo come assente, e lo si registra.
    console.warn('[accesso] .claude.json non leggibile:', err)
  }

  if (config === undefined && !existsSync(credenziali)) {
    return {
      autenticato: false,
      motivo: 'Claude Code non risulta mai avviato su questo computer: aprilo una volta da un terminale per fare l’accesso.'
    }
  }

  if (!existsSync(credenziali)) {
    return {
      autenticato: false,
      motivo: 'Manca l’accesso a Claude Code: apri un terminale, lancia «claude» e completa il login.'
    }
  }

  if (config?.hasCompletedOnboarding !== true) {
    return {
      autenticato: false,
      motivo: 'Claude Code non ha ancora completato la configurazione della prima volta: aprilo da un terminale e finiscila.'
    }
  }

  const account = typeof config.oauthAccount === 'object' && config.oauthAccount !== null
    ? (config.oauthAccount as Record<string, unknown>)
    : {}
  const testo = (v: unknown): string | undefined =>
    typeof v === 'string' && v.trim() !== '' ? v : undefined

  // Solo il livello dell'abbonamento, in parole leggibili: `billingType` vale
  // «stripe_subscription», che è il nome interno di un sistema di pagamento e
  // non dice niente a chi lo legge.
  const tier = testo(account.seatTier)
  const piano = tier !== undefined ? tier : undefined

  return {
    autenticato: true,
    ...(testo(account.emailAddress) !== undefined ? { email: testo(account.emailAddress)! } : {}),
    ...(testo(account.organizationName) !== undefined
      ? { organizzazione: testo(account.organizationName)! }
      : {}),
    ...(piano !== undefined ? { piano } : {})
  }
}
