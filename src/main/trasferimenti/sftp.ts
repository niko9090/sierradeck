import { createHash } from 'node:crypto'
import { StringDecoder } from 'node:string_decoder'
import { createReadStream, createWriteStream, mkdirSync, readFileSync, statSync } from 'node:fs'
import { dirname } from 'node:path'
import { Client, type SFTPWrapper } from 'ssh2'
import type { Destinazione, Segreto } from './destinazioni'

/**
 * Il collegamento a un server: elencare, scaricare, caricare.
 *
 * È il motore sotto il «FileZilla» dentro SierraDeck. Sta nel processo
 * principale e non nel renderer per la ragione di sempre — una chiave privata e
 * una password non passano da una pagina web, nemmeno dalla nostra.
 *
 * ## L'impronta del server, e perché blocca
 *
 * La prima connessione a un server **non riesce**, di proposito: torna
 * l'impronta della sua chiave e si ferma. Sembra scomodo, ed è l'unica cosa che
 * rende il collegamento davvero sicuro invece che solo cifrato — la cifratura
 * da sola dice «nessuno legge», non «stai parlando con chi credi». Chi si mette
 * in mezzo presenta una chiave sua, e senza questo controllo la connessione
 * riuscirebbe lo stesso, con la password consegnata a lui.
 *
 * Quindi: la prima volta si mostra l'impronta e si chiede conferma; dalle volte
 * dopo un'impronta diversa è un allarme, non un dettaglio da superare con un sì.
 *
 * ## Una connessione per destinazione
 *
 * Aprire una sessione SSH costa un secondo abbondante — scambio di chiavi,
 * autenticazione — e sfogliare cartelle ne fa una decina di richieste. Si tiene
 * aperta e si riusa, e si chiude da sola dopo un po' che nessuno la usa: un
 * canale lasciato aperto per sempre è una cosa che il server chiude per conto
 * suo, nel momento peggiore.
 */

export type VoceRemota = {
  nome: string
  /** Il percorso completo sul server, sempre con le barre in avanti. */
  percorso: string
  cartella: boolean
  dimensione: number
  /** Ultima modifica, in millisecondi epoch. */
  quando: number
  /** I permessi in ottale, come li scrive `ls`: `755`. */
  permessi: string
}

export type EsitoElenco = {
  percorso: string
  voci: VoceRemota[]
}

/** Quanto è andata avanti una copia, per la barra. */
export type Progresso = { fatti: number; totale: number }

export class ImprontaSconosciuta extends Error {
  constructor(readonly impronta: string, readonly cambiata: boolean) {
    super(cambiata ? 'la chiave del server e cambiata' : 'server mai visto')
    this.name = 'ImprontaSconosciuta'
  }
}

/**
 * Una shell aperta sul server: quello che si vede in un terminale SSH.
 *
 * Sta sulla **stessa** connessione dell'SFTP, e non e' un risparmio: e' che
 * autenticarsi due volte vuol dire chiedere due volte la password, o tenerne
 * due copie in giro. Un canale in piu' sulla connessione che c'e' gia' non
 * costa niente.
 */
export type GuscioRemoto = {
  scrivi: (testo: string) => void
  ridimensiona: (colonne: number, righe: number) => void
  chiudi: () => void
}

export type Sessione = {
  /** Apre una shell. `suFine` arriva quando il server la chiude (o `exit`). */
  guscio: (
    colonne: number,
    righe: number,
    suDati: (testo: string) => void,
    suFine: () => void
  ) => Promise<GuscioRemoto>
  elenca: (percorso: string) => Promise<EsitoElenco>
  /** Dove si parte: la cartella dell'utente sul server. */
  casa: () => Promise<string>
  scarica: (remoto: string, locale: string, avanza?: (p: Progresso) => void) => Promise<void>
  carica: (locale: string, remoto: string, avanza?: (p: Progresso) => void) => Promise<void>
  creaCartella: (percorso: string) => Promise<void>
  rinomina: (da: string, a: string) => Promise<void>
  elimina: (percorso: string, cartella: boolean) => Promise<void>
  /**
   * Cambia i permessi. `modo` è il numero ottale, quello che si scrive dopo
   * `chmod`: 0o644, 0o755.
   *
   * È la ragione per cui metà delle volte si apre una shell dopo aver caricato
   * un file: un file arrivato senza il bit di esecuzione è uno script che non
   * parte, e un file caricato leggibile da tutti dentro una cartella web è un
   * segreto pubblicato. Il pannello i permessi li mostrava già; poterli
   * cambiare è la metà che mancava.
   */
  permessi: (percorso: string, modo: number) => Promise<void>
  chiudi: () => void
}

/** Le barre in avanti, sempre: un server SSH non parla di `C:\`. */
export function unisciRemoto(base: string, nome: string): string {
  const pulita = base.replace(/\/+$/, '')
  return pulita === '' ? `/${nome}` : `${pulita}/${nome}`
}

/** La cartella che contiene questa, sul server. */
export function suRemoto(percorso: string): string {
  const pulita = percorso.replace(/\/+$/, '')
  const taglio = pulita.lastIndexOf('/')
  if (taglio <= 0) return '/'
  return pulita.slice(0, taglio)
}

/** L'impronta di una chiave, nella forma che stampa `ssh-keygen`. */
export function improntaDi(chiave: Buffer): string {
  return `SHA256:${createHash('sha256').update(chiave).digest('base64').replace(/=+$/, '')}`
}

/** I permessi in ottale a tre cifre, dai bit di `mode`. */
export function permessiDi(mode: number): string {
  return (mode & 0o777).toString(8).padStart(3, '0')
}

export function apriSessione(
  destinazione: Destinazione,
  segreto: Segreto
): Promise<Sessione> {
  return new Promise((risolvi, rifiuta) => {
    const cliente = new Client()
    let chiuso = false

    const fallisci = (err: Error): void => {
      if (chiuso) return
      chiuso = true
      try { cliente.end() } catch { /* già a terra */ }
      rifiuta(err)
    }

    cliente.on('error', (err) => fallisci(err instanceof Error ? err : new Error(String(err))))

    cliente.on('ready', () => {
      cliente.sftp((err, sftp) => {
        if (err !== undefined && err !== null) { fallisci(err); return }
        risolvi(costruisci(cliente, sftp, () => { chiuso = true }))
      })
    })

    let chiavePrivata: Buffer | undefined
    if (destinazione.metodo === 'chiave') {
      if (destinazione.chiaveFile === undefined || destinazione.chiaveFile === '') {
        rifiuta(new Error('serve il file della chiave privata'))
        return
      }
      try {
        chiavePrivata = readFileSync(destinazione.chiaveFile)
      } catch (err) {
        rifiuta(new Error(`la chiave ${destinazione.chiaveFile} non si legge: ${String(err)}`))
        return
      }
    }

    try {
      cliente.connect({
        host: destinazione.host,
        port: destinazione.porta,
        username: destinazione.utente,
        ...(destinazione.metodo === 'password' ? { password: segreto.password ?? '' } : {}),
        ...(chiavePrivata !== undefined ? { privateKey: chiavePrivata } : {}),
        ...(segreto.passphrase !== undefined ? { passphrase: segreto.passphrase } : {}),
        // L'agente di sistema, quando si sceglie quello: su Windows è il
        // servizio «OpenSSH Authentication Agent», che tiene le chiavi già
        // sbloccate — così non se ne conserva nessuna copia qui dentro.
        ...(destinazione.metodo === 'agente'
          ? { agent: process.env.SSH_AUTH_SOCK ?? 'pageant' }
          : {}),
        readyTimeout: 20_000,
        /**
         * Il controllo che rende sicuro tutto il resto.
         *
         * Torna `false` e la connessione si chiude prima di mandare
         * qualunque cosa — password compresa. È il punto: se non sappiamo con
         * chi stiamo parlando, non gli si dice niente.
         */
        hostVerifier: (chiave: Buffer): boolean => {
          const impronta = improntaDi(chiave)
          if (destinazione.improntaServer === undefined || destinazione.improntaServer === '') {
            fallisci(new ImprontaSconosciuta(impronta, false))
            return false
          }
          if (destinazione.improntaServer !== impronta) {
            fallisci(new ImprontaSconosciuta(impronta, true))
            return false
          }
          return true
        }
      })
    } catch (err) {
      fallisci(err instanceof Error ? err : new Error(String(err)))
    }
  })
}

function costruisci(cliente: Client, sftp: SFTPWrapper, segnaChiuso: () => void): Sessione {
  const casa = (): Promise<string> =>
    new Promise((risolvi) => {
      sftp.realpath('.', (err, percorso) => {
        // Un server che non sa dire dove siamo è raro ma esiste: la radice è
        // una risposta che funziona sempre, ed è meglio di un errore.
        risolvi(err !== undefined && err !== null ? '/' : percorso)
      })
    })

  return {
    casa,

    guscio: (colonne, righe, suDati, suFine) =>
      new Promise((risolvi, rifiuta) => {
        cliente.shell({ cols: colonne, rows: righe, term: 'xterm-256color' }, (err, canale) => {
          if (err !== undefined && err !== null) { rifiuta(err); return }
          /**
           * I byte si accumulano prima di diventare testo.
           *
           * Un pezzo di rete puo' finire **in mezzo** a una lettera accentata:
           * decodificarlo da solo darebbe una scatoletta al posto della «e`»,
           * e su un server italiano succede al primo `ls`.
           */
          const decodifica = new StringDecoder('utf8')
          canale.on('data', (d: Buffer) => suDati(decodifica.write(d)))
          canale.stderr.on('data', (d: Buffer) => suDati(decodifica.write(d)))
          canale.on('close', () => suFine())
          risolvi({
            scrivi: (testo) => { canale.write(testo) },
            // ssh2 vuole righe prima delle colonne, al contrario di tutto il
            // resto: invertirle da' un terminale che va a capo dove non deve.
            ridimensiona: (c, r) => canale.setWindow(r, c, 0, 0),
            chiudi: () => { canale.end() }
          })
        })
      }),

    elenca: (percorso) =>
      new Promise((risolvi, rifiuta) => {
        const dove = percorso.trim() === '' ? '.' : percorso
        sftp.readdir(dove, (err, lista) => {
          if (err !== undefined && err !== null) { rifiuta(err); return }
          const voci: VoceRemota[] = lista.map((v) => {
            const attributi = v.attrs
            const cartella = (attributi.mode & 0o170000) === 0o040000
            return {
              nome: v.filename,
              percorso: unisciRemoto(dove === '.' ? '' : dove, v.filename),
              cartella,
              dimensione: attributi.size,
              // I tempi SFTP sono in secondi: moltiplicare e' l'unico modo
              // perche' una data del 2026 non diventi il 1970.
              quando: attributi.mtime * 1000,
              permessi: permessiDi(attributi.mode)
            }
          })
          // Prima le cartelle, poi i file, tutto in ordine: e' come si legge un
          // elenco di file da trent'anni, e cambiarlo non aiuterebbe nessuno.
          voci.sort((a, b) =>
            a.cartella !== b.cartella
              ? (a.cartella ? -1 : 1)
              : a.nome.localeCompare(b.nome, 'it')
          )
          risolvi({ percorso: dove, voci })
        })
      }),

    scarica: (remoto, locale, avanza) =>
      new Promise((risolvi, rifiuta) => {
        try {
          mkdirSync(dirname(locale), { recursive: true })
        } catch (err) {
          rifiuta(err instanceof Error ? err : new Error(String(err)))
          return
        }
        sftp.stat(remoto, (errStat, attributi) => {
          const totale = errStat !== undefined && errStat !== null ? 0 : attributi.size
          let fatti = 0
          const lettura = sftp.createReadStream(remoto)
          const scrittura = createWriteStream(locale)
          lettura.on('data', (pezzo: Buffer | string) => {
            fatti += typeof pezzo === 'string' ? Buffer.byteLength(pezzo) : pezzo.length
            avanza?.({ fatti, totale })
          })
          lettura.on('error', rifiuta)
          scrittura.on('error', rifiuta)
          scrittura.on('close', () => risolvi())
          lettura.pipe(scrittura)
        })
      }),

    carica: (locale, remoto, avanza) =>
      new Promise((risolvi, rifiuta) => {
        let totale = 0
        try {
          totale = statSync(locale).size
        } catch (err) {
          rifiuta(err instanceof Error ? err : new Error(String(err)))
          return
        }
        let fatti = 0
        const lettura = createReadStream(locale)
        const scrittura = sftp.createWriteStream(remoto)
        lettura.on('data', (pezzo: Buffer | string) => {
          fatti += typeof pezzo === 'string' ? Buffer.byteLength(pezzo) : pezzo.length
          avanza?.({ fatti, totale })
        })
        lettura.on('error', rifiuta)
        scrittura.on('error', rifiuta)
        scrittura.on('close', () => risolvi())
        lettura.pipe(scrittura)
      }),

    creaCartella: (percorso) =>
      new Promise((risolvi, rifiuta) => {
        sftp.mkdir(percorso, (err) => (err !== undefined && err !== null ? rifiuta(err) : risolvi()))
      }),

    rinomina: (da, a) =>
      new Promise((risolvi, rifiuta) => {
        sftp.rename(da, a, (err) => (err !== undefined && err !== null ? rifiuta(err) : risolvi()))
      }),

    elimina: (percorso, cartella) =>
      new Promise((risolvi, rifiuta) => {
        const fatto = (err: unknown): void =>
          err !== undefined && err !== null
            ? rifiuta(err instanceof Error ? err : new Error(String(err)))
            : risolvi()
        // `rmdir` vuole la cartella **vuota**, e va bene cosi': cancellare un
        // albero remoto per sbaglio non si annulla, e una cancellazione
        // ricorsiva dietro un tasto solo e' il modo di farlo succedere.
        if (cartella) sftp.rmdir(percorso, fatto)
        else sftp.unlink(percorso, fatto)
      }),

    permessi: (percorso, modo) =>
      new Promise((risolvi, rifiuta) => {
        sftp.chmod(percorso, modo, (err) => (err !== undefined && err !== null ? rifiuta(err) : risolvi()))
      }),

    chiudi: () => {
      segnaChiuso()
      try { cliente.end() } catch { /* già a terra */ }
    }
  }
}
