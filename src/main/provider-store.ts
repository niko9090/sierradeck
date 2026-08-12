import { existsSync, mkdirSync, readFileSync, renameSync } from 'node:fs'
import { scriviJsonAtomico } from '@shared/scrittura-atomica'
import { join } from 'node:path'

/** Come la configurazione sta su disco: qui il token c'è. */
export type Provider = {
  attivo: boolean
  baseUrl: string
  token: string
  modello: string
}

/** Come la vede l'interfaccia: il token non torna indietro, si sa solo se c'è. */
export type ProviderVisibile = {
  attivo: boolean
  baseUrl: string
  modello: string
  haToken: boolean
}

export type ProviderStore = {
  leggi: () => ProviderVisibile
  imposta: (p: Provider & { togliToken?: boolean }) => ProviderVisibile
  /** Le variabili d'ambiente da dare a ogni chat. Vuoto se non è configurato. */
  env: () => Record<string, string>
}

const VERSIONE = 1

/**
 * L'ambiente che dirotta Claude Code su un'altra API.
 *
 * Claude Code parla con qualunque servizio che ne rispetti il protocollo: gli
 * si dice dove andare (`ANTHROPIC_BASE_URL`), con quale chiave
 * (`ANTHROPIC_AUTH_TOKEN`) e — se il servizio ha nomi suoi — quale modello
 * (`ANTHROPIC_MODEL`). Non c'è niente da tradurre: è la stessa strada che si
 * userebbe da riga di comando.
 *
 * Senza indirizzo non c'è configurazione, e senza `attivo` non si applica:
 * spegnere deve bastare a tornare a Claude, senza cancellare quello che si era
 * scritto.
 */
export function ambienteDelProvider(p: Provider): Record<string, string> {
  if (!p.attivo || p.baseUrl.trim() === '') return {}
  return {
    ANTHROPIC_BASE_URL: p.baseUrl.trim(),
    ...(p.token !== '' ? { ANTHROPIC_AUTH_TOKEN: p.token } : {}),
    ...(p.modello.trim() !== '' ? { ANTHROPIC_MODEL: p.modello.trim() } : {})
  }
}

const VUOTO: Provider = { attivo: false, baseUrl: '', token: '', modello: '' }

/**
 * Dove si configura un'API diversa da quella di Anthropic.
 *
 * Il file contiene una chiave e sta accanto agli altri dati del Gestore, sul
 * disco locale — come fa Claude Code con le proprie credenziali. Il token non
 * viene mai restituito a chi legge: all'interfaccia serve sapere che c'è, non
 * qual è, e farlo passare per il renderer sarebbe una copia in più in un
 * processo che non ne ha bisogno.
 */
export function apriProviderStore(cartella: string): ProviderStore {
  mkdirSync(cartella, { recursive: true })
  const percorso = join(cartella, 'provider.json')

  const leggiTutto = (): Provider => {
    if (!existsSync(percorso)) return VUOTO
    try {
      const grezzo = JSON.parse(readFileSync(percorso, 'utf8')) as Record<string, unknown>
      const testo = (v: unknown): string => (typeof v === 'string' ? v : '')
      return {
        attivo: grezzo.attivo === true,
        baseUrl: testo(grezzo.baseUrl),
        token: testo(grezzo.token),
        modello: testo(grezzo.modello)
      }
    } catch (err) {
      // Una configurazione illeggibile non deve impedire di lavorare: si torna
      // a Claude, che è il caso normale, e lo si dice nel log.
      console.error(`[provider] ${percorso} non e leggibile, uso Claude:`, err)
      return VUOTO
    }
  }

  const visibile = (p: Provider): ProviderVisibile => ({
    attivo: p.attivo,
    baseUrl: p.baseUrl,
    modello: p.modello,
    haToken: p.token !== ''
  })

  return {
    leggi: () => visibile(leggiTutto()),

    imposta(nuovo) {
      const prima = leggiTutto()
      // Il campo del token parte vuoto perché non si rilegge: se il vuoto
      // cancellasse, salvare il solo indirizzo porterebbe via la chiave.
      // Toglierla resta possibile, ma va chiesto.
      const token = nuovo.togliToken === true ? '' : nuovo.token !== '' ? nuovo.token : prima.token
      const finale: Provider = {
        attivo: nuovo.attivo,
        baseUrl: nuovo.baseUrl.trim(),
        token,
        modello: nuovo.modello.trim()
      }

      // I permessi stretti nascono con il file: dentro c'e' il token dell'API.
      scriviJsonAtomico(percorso, { versione: VERSIONE, ...finale }, 'provider', { mode: 0o600 })
      return visibile(finale)
    },

    env: () => ambienteDelProvider(leggiTutto())
  }
}
