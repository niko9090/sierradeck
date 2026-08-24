import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { configGoogle } from '../google-config'
import { connetti as connettiOAuth, creaFornitoreToken, type Gettoni } from './oauth-google'
import { creaMagazzinoDrive, creaArchivioDrive } from './google-drive'
import type { Magazzino } from './magazzino'
import type { Archivio } from './archivio'

/**
 * Il «conto Drive» del programma: tiene i token dell'utente su file e offre i
 * tre gesti che servono all'app — sapere **se** è connesso, **connettere** (il
 * consenso via browser), **disconnettere** — più il `magazzino` cifrato da dare
 * al motore di sync.
 *
 * I token vivono in un file in userData (`google-drive-token.json`), come la
 * sessione di Supabase: sono roba della macchina dell'utente. Le credenziali
 * dell'app (client_id/secret) invece arrivano da `configGoogle`. Se mancano, il
 * conto è «non configurato» e lo dice, senza rompere nulla.
 */

export type StatoDrive = {
  /** Le credenziali OAuth dell'app ci sono? Senza, il pulsante non può funzionare. */
  configurato: boolean
  /** L'utente ha già dato il consenso (c'è un refresh token salvato)? */
  connesso: boolean
}

export type ContoDrive = {
  stato: () => StatoDrive
  /** Avvia il consenso: apre il browser, aspetta, salva i token. Lancia se non configurato. */
  connetti: (apriBrowser: (url: string) => void) => Promise<void>
  /** Dimentica i token: il prossimo uso richiederà di riconnettere. */
  disconnetti: () => void
  /**
   * Un magazzino su Drive per un file dentro appDataFolder. Senza nome, il file
   * dei dati; con nome (es. le chiavi), quel file. Lancia se non configurato.
   */
  magazzino: (nomeFile?: string) => Magazzino
  /** L'archivio a più file (per la sincronizzazione incrementale). Lancia se non configurato. */
  archivio: () => Archivio
}

export function apriContoDrive(dati: string): ContoDrive {
  const fileToken = join(dati, 'google-drive-token.json')

  const leggi = (): Gettoni | undefined => {
    if (!existsSync(fileToken)) return undefined
    try {
      const g = JSON.parse(readFileSync(fileToken, 'utf8')) as Gettoni
      return typeof g.accessToken === 'string' ? g : undefined
    } catch {
      return undefined
    }
  }
  const scrivi = (g: Gettoni): void => {
    try {
      writeFileSync(fileToken, JSON.stringify(g), 'utf8')
    } catch (err) {
      console.error('[drive] token non salvato:', err)
    }
  }

  const config = (): ReturnType<typeof configGoogle> => configGoogle(dati)

  return {
    stato() {
      const g = leggi()
      return {
        configurato: config() !== undefined,
        // Serve il refresh token: un access token da solo scade in un'ora e non
        // si rinnova. È quello a dire «connesso davvero».
        connesso: g?.refreshToken !== undefined
      }
    },

    async connetti(apriBrowser) {
      const c = config()
      if (c === undefined) throw new Error('Google Drive non configurato: mancano le credenziali OAuth dell’app')
      const gettoni = await connettiOAuth({ config: c, apriBrowser })
      scrivi(gettoni)
    },

    disconnetti() {
      try {
        if (existsSync(fileToken)) rmSync(fileToken)
      } catch (err) {
        console.error('[drive] token non rimosso:', err)
      }
    },

    magazzino(nomeFile) {
      const c = config()
      if (c === undefined) throw new Error('Google Drive non configurato: mancano le credenziali OAuth dell’app')
      const token = creaFornitoreToken({ config: c, leggi, scrivi })
      return creaMagazzinoDrive({ token, ...(nomeFile !== undefined ? { nomeFile } : {}) })
    },

    archivio() {
      const c = config()
      if (c === undefined) throw new Error('Google Drive non configurato: mancano le credenziali OAuth dell’app')
      const token = creaFornitoreToken({ config: c, leggi, scrivi })
      return creaArchivioDrive({ token })
    }
  }
}
