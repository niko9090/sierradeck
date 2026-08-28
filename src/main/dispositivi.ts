import { randomBytes, timingSafeEqual, createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
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
/**
 * Quanti codici sbagliati si tollerano prima di chiudere la finestra.
 *
 * Sei cifre sono un milione di possibilità, e tre minuti bastano a provarne
 * moltissime se nessuno conta i tentativi: chi è sulla stessa rete potrebbe
 * indovinare il codice a forza bruta e ottenere una chiave permanente. Dieci
 * tentativi lasciano spazio a chi sbaglia a digitare, e chiudono la porta a chi
 * tira a indovinare — che deve aspettare una nuova finestra aperta a mano.
 */
export const MAX_TENTATIVI = 10
/**
 * Ogni quanto si riscrive l'ora dell'ultimo accesso di un dispositivo.
 *
 * Serve a riconoscere il telefono che non si usa da mesi: un minuto di
 * approssimazione non toglie niente a quella domanda, e toglie migliaia di
 * riscritture al giorno a un file che deve soprattutto stare fermo.
 */
export const PASSO_ACCESSO_MS = 60_000
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
  // Codici sbagliati contati per la finestra corrente: si azzera a ogni apertura.
  let tentativiFalliti = 0

  /**
   * L'ultimo elenco letto per intero.
   *
   * Non è un'ottimizzazione: è la differenza fra «questo telefono non è dei
   * nostri» e «in questo istante non riesco a leggere il file». Le due cose
   * finivano nello stesso posto — un elenco vuoto — e un elenco vuoto risponde
   * 401, che sul telefono voleva dire **buttare via l'accoppiamento**. Bastava
   * un istante sfortunato, con il file preso da una rinomina, per far
   * ricominciare tutto dal codice QR.
   */
  let ricordati: Dispositivo[] | undefined
  /** Firma del file all'ultima lettura riuscita: dimensione e data di scrittura. */
  let firma = ''

  const interpreta = (testo: string): Dispositivo[] => {
    const grezzo = JSON.parse(testo) as Record<string, unknown>
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
  }

  /**
   * L'elenco dei dispositivi, riletto dal disco solo quando il file è cambiato.
   *
   * Ogni richiesta che arriva da fuori passa di qui, e sono parecchie al
   * secondo: rileggere — e riscrivere — ogni volta teneva il file in movimento
   * perpetuo, e prima o poi una lettura cadeva dentro una rinomina. Adesso si
   * rilegge quando dimensione o data dicono che c'è qualcosa di nuovo, e se la
   * lettura non riesce si risponde con quello che si sapeva.
   */
  const leggi = (): Dispositivo[] => {
    let attuale: string
    try {
      if (!existsSync(percorso)) {
        // Il file che non c'è è una risposta certa, non un incidente: nessuno
        // si è mai accoppiato, o sono stati revocati tutti.
        ricordati = []
        firma = ''
        return []
      }
      const s = statSync(percorso)
      attuale = `${s.size}:${s.mtimeMs}`
    } catch (err) {
      if (ricordati !== undefined) return ricordati
      console.error(`[dispositivi] ${percorso} non e raggiungibile:`, err)
      return []
    }

    if (attuale === firma && ricordati !== undefined) return ricordati

    let testo: string
    try {
      testo = readFileSync(percorso, 'utf8')
    } catch (err) {
      // Lettura caduta mentre il file veniva sostituito. Il contenuto di prima
      // vale ancora: rispondere «nessun dispositivo» qui scollegava il
      // telefono per sempre.
      if (ricordati !== undefined) return ricordati
      console.error(`[dispositivi] ${percorso} non e leggibile:`, err)
      return []
    }

    try {
      const elenco = interpreta(testo)
      ricordati = elenco
      firma = attuale
      return elenco
    } catch (err) {
      // Questo invece è un file **rotto**, non un file occupato: il contenuto
      // c'è e non è JSON. Qui la posizione prudente resta quella di sempre —
      // nessun accesso da fuori — perché non si sa più chi sia autorizzato.
      console.error(`[dispositivi] ${percorso} non e leggibile, nessun dispositivo attivo:`, err)
      ricordati = []
      firma = attuale
      return []
    }
  }

  const salva = (d: Dispositivo[]): void => {
    const scritto = scriviJsonAtomico(
      percorso,
      { versione: VERSIONE, dispositivi: d },
      'dispositivi',
      { mode: 0o600 }
    )
    // Quello che si è appena scritto è la verità: si aggiorna il ricordo
    // subito, e si azzera la firma perché la prossima lettura vada comunque a
    // vedere il file vero.
    if (scritto) {
      ricordati = d
      firma = ''
    }
  }

  const senzaSegno = (d: Dispositivo): Omit<Dispositivo, 'segno'> => {
    const { segno: _, ...resto } = d
    return resto
  }

  return {
    elenca: () => leggi().map(senzaSegno),

    apriAccoppiamento() {
      accoppiamento = { codice: nuovoCodice(), scadeIl: adesso() + DURATA_CODICE_MS }
      tentativiFalliti = 0
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
      if (!confronta(codice.trim(), aperto.codice)) {
        // Ogni errore avvicina la chiusura: raggiunta la soglia la finestra si
        // chiude, così una raffica di tentativi non può setacciare il milione di
        // codici. Va riaperta a mano dallo schermo del PC.
        tentativiFalliti += 1
        if (tentativiFalliti >= MAX_TENTATIVI) {
          accoppiamento = undefined
          console.error(`[dispositivi] finestra di accoppiamento chiusa dopo ${MAX_TENTATIVI} codici errati`)
        }
        return undefined
      }

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
      // L'ora dell'ultimo accesso serve a riconoscere il dispositivo che non si
      // usa più: al minuto è già una precisione superflua. Prima si riscriveva
      // il file **a ogni richiesta** — più di una al secondo con l'app aperta —
      // e quel viavai era esattamente ciò che faceva cadere le letture.
      const ora = adesso()
      const ultimo = Date.parse(trovato.ultimoAccesso ?? '')
      if (Number.isNaN(ultimo) || ora - ultimo >= PASSO_ACCESSO_MS) {
        salva(tutti.map((d) =>
          d.id === trovato.id ? { ...d, ultimoAccesso: new Date(ora).toISOString() } : d
        ))
      }
      return senzaSegno(trovato)
    },

    revoca(id) {
      if (!ID_VALIDO.test(id)) return
      salva(leggi().filter((d) => d.id !== id))
    }
  }
}
