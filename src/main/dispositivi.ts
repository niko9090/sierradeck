import { randomBytes, timingSafeEqual, createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { scriviJsonAtomico } from '@shared/scrittura-atomica'

/**
 * I dispositivi che possono comandare SierraDeck da fuori.
 *
 * L'accoppiamento è un gesto solo e volontario: il PC mostra un codice di sei
 * cifre, il telefono lo inserisce, e da quel momento ha una chiave sua. Non una
 * parola d'ordine condivisa da digitare ogni volta — quella si dimentica, si
 * riusa altrove, e non si può togliere a un dispositivo solo.
 *
 * Ogni chiave si revoca dall'elenco senza toccare le altre: il telefono perso
 * si spegne, il tablet in mensola continua a funzionare.
 */

export type Dispositivo = {
  id: string
  /** Il nome che si legge nell'elenco: lo sceglie chi si collega. */
  nome: string
  /** Solo il segno della chiave: se qualcuno legge il file, non entra. */
  segno: string
  collegatoIl: string
  /** L'ultima volta che si è fatto vivo: serve a riconoscere chi non usi più. */
  ultimoAccesso?: string
}

export type CodiceAccoppiamento = {
  /** Le sei cifre da leggere sullo schermo del PC. */
  codice: string
  /** Fino a quando vale, in millisecondi epoch. */
  scadeIl: number
}

export type Dispositivi = {
  elenca: () => Omit<Dispositivo, 'segno'>[]
  /** Apre una finestra di accoppiamento e restituisce il codice da mostrare. */
  apriAccoppiamento: () => CodiceAccoppiamento
  /** Chiude la finestra: nessun dispositivo nuovo può entrare. */
  chiudiAccoppiamento: () => void
  /** C'è una finestra aperta adesso? Serve a mostrarlo nell'interfaccia. */
  accoppiamentoAperto: () => CodiceAccoppiamento | undefined
  /**
   * Presenta un dispositivo. Con il codice giusto restituisce la chiave, che
   * **si vede una volta sola**: da lì in poi sul disco resta solo il suo segno.
   */
  accoppia: (codice: string, nome: string) => { id: string; chiave: string } | undefined
  /** Riconosce una chiave. Aggiorna l'ultimo accesso quando la trova. */
  riconosci: (chiave: string) => Omit<Dispositivo, 'segno'> | undefined
  revoca: (id: string) => void
}

const VERSIONE = 1
/** Quanto resta aperta la finestra di accoppiamento: il tempo di prendere il telefono. */
export const DURATA_CODICE_MS = 3 * 60_000
const ID_VALIDO = /^[A-Za-z0-9_-]{1,64}$/
const NOME_MAX = 40

/** Il segno di una chiave. SHA-256 basta: la chiave è casuale e lunga, non una parola scelta. */
export function segnoDi(chiave: string): string {
  return createHash('sha256').update(chiave).digest('hex')
}

export function nuovoCodice(): string {
  // Sei cifre da leggere ad alta voce e digitare sul telefono, prese dal
  // generatore crittografico e non da Math.random: vale per tre minuti, ma in
  // quei tre minuti è l'unica cosa che separa un estraneo dal tuo computer.
  return String(randomBytes(4).readUInt32BE(0) % 1_000_000).padStart(6, '0')
}

function confronta(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  if (x.length !== y.length || x.length === 0) return false
  return timingSafeEqual(x, y)
}

export function apriDispositivi(
  cartella: string,
  adesso: () => number = () => Date.now()
): Dispositivi {
  mkdirSync(cartella, { recursive: true })
  const percorso = join(cartella, 'dispositivi.json')
  let accoppiamento: CodiceAccoppiamento | undefined

  const leggi = (): Dispositivo[] => {
    if (!existsSync(percorso)) return []
    try {
      const grezzo = JSON.parse(readFileSync(percorso, 'utf8')) as Record<string, unknown>
      const elenco = Array.isArray(grezzo.dispositivi) ? grezzo.dispositivi : []
      return elenco.flatMap((d): Dispositivo[] => {
        if (typeof d !== 'object' || d === null) return []
        const o = d as Record<string, unknown>
        if (typeof o.id !== 'string' || typeof o.segno !== 'string' || o.segno === '') return []
        return [{
          id: o.id,
          nome: typeof o.nome === 'string' ? o.nome : o.id,
          segno: o.segno,
          collegatoIl: typeof o.collegatoIl === 'string' ? o.collegatoIl : '',
          ...(typeof o.ultimoAccesso === 'string' ? { ultimoAccesso: o.ultimoAccesso } : {})
        }]
      })
    } catch (err) {
      // Un elenco illeggibile vale come nessun dispositivo: si torna a nessun
      // accesso da fuori, che è la posizione prudente.
      console.error(`[dispositivi] ${percorso} non e leggibile, nessun dispositivo attivo:`, err)
      return []
    }
  }

  const salva = (d: Dispositivo[]): void => {
    scriviJsonAtomico(percorso, { versione: VERSIONE, dispositivi: d }, 'dispositivi', { mode: 0o600 })
  }

  const senzaSegno = (d: Dispositivo): Omit<Dispositivo, 'segno'> => {
    const { segno: _, ...resto } = d
    return resto
  }

  return {
    elenca: () => leggi().map(senzaSegno),

    apriAccoppiamento() {
      accoppiamento = { codice: nuovoCodice(), scadeIl: adesso() + DURATA_CODICE_MS }
      return accoppiamento
    },

    chiudiAccoppiamento() { accoppiamento = undefined },

    accoppiamentoAperto() {
      if (accoppiamento === undefined) return undefined
      if (adesso() > accoppiamento.scadeIl) { accoppiamento = undefined; return undefined }
      return accoppiamento
    },

    accoppia(codice, nome) {
      const aperto = accoppiamento
      // Scaduto vale come chiuso: il codice di ieri non apre niente.
      if (aperto === undefined || adesso() > aperto.scadeIl) return undefined
      if (!confronta(codice.trim(), aperto.codice)) return undefined

      // Un codice serve per un dispositivo solo: se restasse valido, chi lo ha
      // visto sullo schermo potrebbe collegarne altri quando gli pare.
      accoppiamento = undefined

      const chiave = randomBytes(32).toString('base64url')
      const dispositivo: Dispositivo = {
        id: randomBytes(8).toString('hex'),
        nome: nome.trim().slice(0, NOME_MAX) || 'dispositivo',
        segno: segnoDi(chiave),
        collegatoIl: new Date(adesso()).toISOString()
      }
      salva([...leggi(), dispositivo])
      // La chiave si vede adesso e mai più: sul disco resta solo il suo segno.
      return { id: dispositivo.id, chiave }
    },

    riconosci(chiave) {
      if (chiave === '') return undefined
      const segno = segnoDi(chiave)
      const tutti = leggi()
      const trovato = tutti.find((d) => confronta(d.segno, segno))
      if (trovato === undefined) return undefined
      salva(tutti.map((d) =>
        d.id === trovato.id ? { ...d, ultimoAccesso: new Date(adesso()).toISOString() } : d
      ))
      return senzaSegno(trovato)
    },

    revoca(id) {
      if (!ID_VALIDO.test(id)) return
      salva(leggi().filter((d) => d.id !== id))
    }
  }
}
