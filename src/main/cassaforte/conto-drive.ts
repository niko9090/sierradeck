import { existsSync, readFileSync, rmSync } from 'node:fs'
import { scriviAtomico } from '@shared/scrittura-atomica'
import { join } from 'node:path'
import { configGoogle } from '../google-config'
import { connetti as connettiOAuth, creaFornitoreToken, esaminaDrive, type Gettoni } from './oauth-google'
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
  /** L'account Google collegato, quando lo si conosce. */
  email?: string
}

/**
 * Cosa si e' trovato nel Drive appena collegato: e' cosi' che si riconosce
 * l'account giusto senza doverlo ricordare.
 */
export type Riconoscimento = {
  email?: string
  /** I file di SierraDeck nel Drive di quell'account (chiavi, elenco, chat, progetti). */
  fileSierraDeck: number
  /** Quando quel Drive e' stato salvato l'ultima volta. */
  ultimoSalvataggio?: string
  /** C'e' una cassaforte: quel Drive e' gia' stato usato da SierraDeck. */
  cassaforteSulDrive: boolean
}

export type ContoDrive = {
  stato: () => StatoDrive
  /** Avvia il consenso: apre il browser, aspetta, salva i token. Lancia se non configurato. */
  connetti: (apriBrowser: (url: string) => void) => Promise<Riconoscimento>
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
  const scarta = (): void => {
    try {
      if (existsSync(fileToken)) rmSync(fileToken)
    } catch (err) {
      console.error('[drive] token non rimosso:', err)
    }
  }
  const scrivi = (g: Gettoni): void => {
    try {
      scriviAtomico(fileToken, JSON.stringify(g), 'drive')
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
        connesso: g?.refreshToken !== undefined,
        ...(g?.email !== undefined ? { email: g.email } : {})
      }
    },

    async connetti(apriBrowser) {
      const c = config()
      if (c === undefined) throw new Error('Google Drive non configurato: mancano le credenziali OAuth dell’app')
      const gettoni = await connettiOAuth({ config: c, apriBrowser })
      scrivi(gettoni)
      // L'indirizzo e cosa c'e' dentro: per riconoscere il Drive giusto senza
      // doverlo ricordare fra dieci account.
      const esame = await esaminaDrive(gettoni.accessToken)
      if (esame.email !== undefined) scrivi({ ...gettoni, email: esame.email })
      const nomi = new Set(esame.file.map((f) => f.name))
      const elenco = esame.file.find((f) => f.name === 'sierradeck.manifesto') ?? esame.file.find((f) => f.name === 'sierradeck.cassaforte')
      return {
        ...(esame.email !== undefined ? { email: esame.email } : {}),
        fileSierraDeck: esame.file.filter((f) => f.name.startsWith('sierradeck.') || f.name.startsWith('f_')).length,
        ...(elenco?.modifiedTime !== undefined ? { ultimoSalvataggio: elenco.modifiedTime } : {}),
        cassaforteSulDrive: nomi.has('sierradeck.chiavi')
      }
    },

    disconnetti() { scarta() },

    magazzino(nomeFile) {
      const c = config()
      if (c === undefined) throw new Error('Google Drive non configurato: mancano le credenziali OAuth dell’app')
      const token = creaFornitoreToken({ config: c, leggi, scrivi, scarta })
      return creaMagazzinoDrive({ token, ...(nomeFile !== undefined ? { nomeFile } : {}) })
    },

    archivio() {
      const c = config()
      if (c === undefined) throw new Error('Google Drive non configurato: mancano le credenziali OAuth dell’app')
      const token = creaFornitoreToken({ config: c, leggi, scrivi, scarta })
      return creaArchivioDrive({ token })
    }
  }
}
