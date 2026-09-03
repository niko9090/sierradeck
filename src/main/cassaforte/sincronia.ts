import { existsSync, readFileSync } from 'node:fs'
import { scriviAtomico } from '@shared/scrittura-atomica'
import { join } from 'node:path'
import { creaCassaforte, sblocca as sbloccaCassaforte, sbloccaConRecupero as sbloccaConRecuperoCassaforte, cambiaPassphrase as cambiaPassphraseCassaforte, type Cassaforte } from './cifratura'
import type { Progresso } from './motore'
import { pesaRadici, radiciDaSincronizzare } from './raccolta'
import type { Magazzino } from './magazzino'
import type { Archivio } from './archivio'
import { salvaIncrementale, ripristinaIncrementale, manifestoVuoto, type Manifesto } from './incrementale'
import { applicaBlocco } from './lavoro'

/**
 * La **politica** della sincronizzazione: mette insieme cassaforte (cifratura),
 * motore e magazzino nei gesti che l'utente compie davvero — crea la passphrase,
 * sblocca, salva, ripristina.
 *
 * Due file nel magazzino dell'utente (il suo Drive):
 *  - le **chiavi** (`sierradeck.chiavi`): la cassaforte, cioè la chiave-maestra
 *    avvolta con passphrase e con la chiave di recupero. È materiale non segreto
 *    di per sé (senza la passphrase non apre niente), ma deve viaggiare fra i PC:
 *    è ciò che permette, su una macchina nuova, di sbloccare con la sola passphrase;
 *  - i **dati** (`sierradeck.cassaforte`): il pacchetto cifrato con la maestra.
 *
 * La chiave-maestra sbloccata vive **solo in memoria**, qui nel main, finché la
 * sessione è aperta. Non la scriviamo mai su disco in chiaro.
 *
 * Disaccoppiato dal Drive vero: riceve un `magazzino(nomeFile)` e un
 * `driveConnesso()`, così si prova per intero con un magazzino in memoria.
 */

/** Il file delle chiavi nel magazzino (accanto ai dati). */
export const FILE_CHIAVI = 'sierradeck.chiavi'

export type StatoSync = {
  driveConnesso: boolean
  /** Esiste già una cassaforte (locale o sul Drive)? Se no, si crea la passphrase. */
  haCassaforte: boolean
  /** La maestra è in memoria (sessione sbloccata)? */
  sbloccato: boolean
  versione?: string
  ultimoSalvataggio?: string
}

export type EsitoSemplice = { ok: boolean; messaggio?: string }

function messaggioDi(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

export type Sincronia = {
  stato: () => Promise<StatoSync>
  /** Quanto si sincronizza: numero di file (chat + assetto) e byte totali. */
  info: () => Promise<{ file: number; byte: number }>
  creaPassphrase: (passphrase: string) => Promise<{ ok: boolean; chiaveRecupero?: string; messaggio?: string }>
  sblocca: (passphrase: string) => Promise<EsitoSemplice>
  sbloccaConRecupero: (codice: string) => Promise<EsitoSemplice>
  cambiaPassphrase: (vecchia: string, nuova: string) => Promise<EsitoSemplice>
  blocca: () => void
  salva: (forza?: boolean) => Promise<{ ok: boolean; voci?: number; conflitto?: boolean; invariato?: boolean; messaggio?: string }>
  /** Accende/spegne il salvataggio automatico, e dice com'è ora. */
  auto: (attivo?: boolean) => boolean
  /** Salva solo se serve (dati cambiati, sbloccato, connesso): per l'automatico. */
  salvaSeServe: () => Promise<void>
  ripristina: () => Promise<{ ok: boolean; scritti?: number; niente?: boolean; messaggio?: string }>
}

export function apriSincronia(deps: {
  dati: string
  radiceClaude: string
  driveConnesso: () => boolean
  /** Il magazzino a blocco unico, per le CHIAVI (la cassaforte). */
  magazzino: (nomeFile?: string) => Magazzino
  /** L'archivio a più file, per i DATI (sincronizzazione incrementale). */
  archivio: () => Archivio
  adesso?: () => string
  /** Dove far arrivare il progresso di salva/ripristina (verso l'interfaccia). */
  emettiProgresso?: (p: Progresso) => void
  /** Dove annotare cosa succede, per il registro della sessione. */
  log?: (m: string) => void
}): Sincronia {
  const adesso = deps.adesso ?? ((): string => new Date().toISOString())
  const log = deps.log ?? ((): void => {})
  const fileCassaforte = join(deps.dati, 'cassaforte.json')
  const fileStato = join(deps.dati, 'sync-stato.json')
  const fileManifesto = join(deps.dati, 'sync-manifesto.json')

  // Il manifesto locale: l'idea di questo PC di cosa c'è già sul Drive. Serve a
  // sapere, al prossimo salvataggio, quali file sono cambiati — è ciò che rende
  // la sincronizzazione incrementale.
  const leggiManifestoLocale = (): Manifesto => {
    if (!existsSync(fileManifesto)) return manifestoVuoto()
    try {
      const m = JSON.parse(readFileSync(fileManifesto, 'utf8')) as Partial<Manifesto> | null
      // Un manifesto di forma sbagliata non deve far cadere «Salva ora» con un
      // TypeError da dentro: vale come «non so cosa c'e' sul Drive», e il
      // salvataggio dopo rimanda tutto — costa banda, non dati.
      if (typeof m !== 'object' || m === null || typeof m.file !== 'object' || m.file === null) return manifestoVuoto()
      return { versione: 1, creatoIl: typeof m.creatoIl === 'string' ? m.creatoIl : '', file: m.file }
    } catch { return manifestoVuoto() }
  }
  const scriviManifestoLocale = (m: Manifesto): void => {
    scriviAtomico(fileManifesto, JSON.stringify(m), 'sync')
  }

  // La sola cosa in chiaro, e sola in memoria: sparisce alla chiusura o con `blocca`.
  let maestra: Buffer | undefined

  const leggiLocale = (): Cassaforte | undefined => {
    if (!existsSync(fileCassaforte)) return undefined
    try {
      return JSON.parse(readFileSync(fileCassaforte, 'utf8')) as Cassaforte
    } catch {
      return undefined
    }
  }
  const scriviLocale = (c: Cassaforte): void => {
    scriviAtomico(fileCassaforte, JSON.stringify(c), 'sync')
  }
  type StatoFile = {
    versione?: string
    ultimoSalvataggio?: string
    /** La «firma» dei dati all'ultimo salvataggio: se non cambia, non si risalva. */
    firma?: { file: number; byte: number }
    /** L'utente ha acceso il salvataggio automatico? */
    auto?: boolean
  }
  const leggiStato = (): StatoFile => {
    if (!existsSync(fileStato)) return {}
    try {
      return JSON.parse(readFileSync(fileStato, 'utf8')) as StatoFile
    } catch {
      return {}
    }
  }
  const scriviStato = (s: StatoFile): void => {
    scriviAtomico(fileStato, JSON.stringify(s), 'sync')
  }

  const scaricaChiavi = async (): Promise<Cassaforte | undefined> => {
    const c = await deps.magazzino(FILE_CHIAVI).scarica()
    if (c === undefined) return undefined
    try { return JSON.parse(c.blocco.toString('utf8')) as Cassaforte } catch { return undefined }
  }
  const caricaChiavi = async (c: Cassaforte): Promise<void> => {
    const mag = deps.magazzino(FILE_CHIAVI)
    // Le chiavi cambiano di rado (creazione, cambio passphrase): niente gara,
    // si allinea alla versione presente e si sovrascrive.
    const esistente = await mag.scarica().catch(() => undefined)
    await mag.carica(Buffer.from(JSON.stringify(c), 'utf8'), esistente?.versione)
  }

  /** La cassaforte: quella locale, o — su un PC nuovo — quella scaricata dal Drive (e poi tenuta in locale). */
  const ottieniCassaforte = async (): Promise<Cassaforte | undefined> => {
    const locale = leggiLocale()
    if (locale !== undefined) return locale
    if (deps.driveConnesso()) {
      const remota = await scaricaChiavi().catch(() => undefined)
      if (remota !== undefined) { scriviLocale(remota); return remota }
    }
    return undefined
  }

  return {
    async stato() {
      const s = leggiStato()
      let ha = leggiLocale() !== undefined
      if (!ha && deps.driveConnesso()) {
        ha = (await scaricaChiavi().catch(() => undefined)) !== undefined
      }
      return {
        driveConnesso: deps.driveConnesso(),
        haCassaforte: ha,
        sbloccato: maestra !== undefined,
        ...(s.versione !== undefined ? { versione: s.versione } : {}),
        ...(s.ultimoSalvataggio !== undefined ? { ultimoSalvataggio: s.ultimoSalvataggio } : {})
      }
    },

    info() {
      return pesaRadici(radiciDaSincronizzare(deps.dati, deps.radiceClaude))
    },

    async creaPassphrase(passphrase) {
      if ((await ottieniCassaforte()) !== undefined) {
        return { ok: false, messaggio: 'Esiste già una cassaforte: sbloccala con la passphrase.' }
      }
      const { cassaforte, chiaveRecupero, maestra: m } = creaCassaforte(passphrase)
      scriviLocale(cassaforte)
      if (deps.driveConnesso()) {
        try {
          await caricaChiavi(cassaforte)
        } catch (e) {
          // Senza le chiavi sul Drive, un altro PC non potrebbe sbloccare: è un
          // fallimento vero, meglio dirlo che lasciarlo credere a metà.
          return { ok: false, messaggio: `cassaforte creata ma non caricata sul Drive: ${messaggioDi(e)}` }
        }
      }
      maestra = m
      return { ok: true, chiaveRecupero }
    },

    async sblocca(passphrase) {
      const c = await ottieniCassaforte()
      if (c === undefined) return { ok: false, messaggio: 'Nessuna cassaforte: crea prima una passphrase.' }
      const m = sbloccaCassaforte(c, passphrase)
      if (m === undefined) return { ok: false, messaggio: 'Passphrase errata.' }
      maestra = m
      return { ok: true }
    },

    async sbloccaConRecupero(codice) {
      const c = await ottieniCassaforte()
      if (c === undefined) return { ok: false, messaggio: 'Nessuna cassaforte.' }
      const m = sbloccaConRecuperoCassaforte(c, codice)
      if (m === undefined) return { ok: false, messaggio: 'Chiave di recupero non valida.' }
      maestra = m
      return { ok: true }
    },

    async cambiaPassphrase(vecchia, nuova) {
      const c = await ottieniCassaforte()
      if (c === undefined) return { ok: false, messaggio: 'Nessuna cassaforte da cambiare.' }
      // La vecchia passphrase deve aprire davvero: ri-avvolgere la maestra senza
      // verificarla lascerebbe cambiare la parola a chi non la sa.
      const m = sbloccaCassaforte(c, vecchia)
      if (m === undefined) return { ok: false, messaggio: 'La passphrase attuale non è corretta.' }
      const nuovaCassaforte = cambiaPassphraseCassaforte(c, m, nuova)
      scriviLocale(nuovaCassaforte)
      if (deps.driveConnesso()) {
        try {
          await caricaChiavi(nuovaCassaforte)
        } catch (e) {
          return { ok: false, messaggio: `passphrase cambiata in locale ma non sul Drive: ${messaggioDi(e)}` }
        }
      }
      maestra = m
      return { ok: true }
    },

    blocca() { maestra = undefined },

    async salva() {
      log('SALVA richiesto')
      if (maestra === undefined) return { ok: false, messaggio: 'Sblocca prima con la passphrase.' }
      if (!deps.driveConnesso()) return { ok: false, messaggio: 'Collega prima Google Drive.' }
      const s = leggiStato()
      try {
        // Sincronizzazione **incrementale**: si mandano solo i file cambiati dal
        // manifesto locale. Niente conflitto a versione unica — non c'è più un
        // blocco solo — quindi «Salva ora» semplicemente aggiorna ciò che è nuovo.
        const esito = await salvaIncrementale({
          radici: radiciDaSincronizzare(deps.dati, deps.radiceClaude),
          maestra,
          archivio: deps.archivio(),
          manifestoPrec: leggiManifestoLocale(),
          adesso: adesso(),
          ...(deps.emettiProgresso !== undefined ? { onProgresso: deps.emettiProgresso } : {})
        })
        scriviManifestoLocale(esito.manifesto)
        const totali = Object.keys(esito.manifesto.file).length
        if (esito.caricati === 0 && esito.cancellati === 0) {
          log('niente da salvare: nessun file cambiato')
          return { ok: true, invariato: true, voci: totali }
        }
        scriviStato({ ...s, ultimoSalvataggio: adesso() })
        log(`SALVA ok (${esito.caricati} caricati, ${esito.cancellati} rimossi, ${totali} in tutto)`)
        return { ok: true, voci: esito.caricati }
      } catch (e) {
        log(`SALVA fallito: ${messaggioDi(e)}`)
        return { ok: false, messaggio: messaggioDi(e) }
      }
    },

    auto(attivo?: boolean) {
      const s = leggiStato()
      if (attivo !== undefined && attivo !== (s.auto ?? false)) {
        scriviStato({ ...s, auto: attivo })
        log(`salvataggio automatico ${attivo ? 'ACCESO' : 'spento'}`)
        return attivo
      }
      return s.auto ?? false
    },

    async salvaSeServe() {
      // L'automatico non disturba mai: se non è sbloccato, non connesso, o i dati
      // non sono cambiati, `salva` se ne accorge e non fa nulla di pesante.
      if (maestra === undefined || !deps.driveConnesso()) return
      const s = leggiStato()
      if (s.auto !== true) return
      const r = await this.salva()
      if (!r.ok && r.conflitto !== true) log(`automatico: salvataggio non riuscito (${r.messaggio ?? '?'})`)
    },

    async ripristina() {
      log('RIPRISTINA richiesto')
      if (maestra === undefined) return { ok: false, messaggio: 'Sblocca prima con la passphrase.' }
      if (!deps.driveConnesso()) return { ok: false, messaggio: 'Collega prima Google Drive.' }
      try {
        const esito = await ripristinaIncrementale({
          radici: radiciDaSincronizzare(deps.dati, deps.radiceClaude),
          maestra,
          archivio: deps.archivio(),
          ...(deps.emettiProgresso !== undefined ? { onProgresso: deps.emettiProgresso } : {})
        })
        if (esito.illeggibile === true) {
          log('RIPRISTINA: il manifesto sul Drive non si decifra con questa chiave')
          return { ok: false, messaggio: 'I dati sul Drive non si aprono con questa chiave (forse di un altro account).' }
        }
        if (!esito.trovato) {
          // **La forma di prima.** Dalla 0.9.50 alla 0.9.64 il salvataggio era un
          // blocco unico (`sierradeck.cassaforte`), non il manifesto a piu' file:
          // chi ha salvato per l'ultima volta con quelle versioni — tipicamente il
          // secondo PC, che ripristina e non salva — qui si sentiva dire «niente
          // sul Drive» con tutto il suo backup intatto a un metro. Si prova il
          // blocco vecchio; il prossimo salvataggio lo riscrive nella forma nuova.
          const vecchio = await deps.magazzino().scarica().catch(() => undefined)
          if (vecchio === undefined) { log('RIPRISTINA: niente sul Drive'); return { ok: true, niente: true } }
          log('RIPRISTINA: manifesto assente, trovato il blocco unico delle versioni precedenti')
          const applicato = await applicaBlocco(
            { dati: deps.dati, radiceClaude: deps.radiceClaude, maestra, blocco: vecchio.blocco },
            deps.emettiProgresso
          )
          if (applicato.illeggibile) {
            log('RIPRISTINA: il blocco vecchio non si decifra con questa chiave')
            return { ok: false, messaggio: 'I dati sul Drive non si aprono con questa chiave (forse di un altro account).' }
          }
          scriviStato({ ...leggiStato(), ultimoSalvataggio: adesso() })
          log(`RIPRISTINA ok dal blocco unico (${applicato.scritti} file scritti, salvato il ${applicato.creatoIl})`)
          return { ok: true, scritti: applicato.scritti }
        }
        // Da qui questo PC sa cosa c'è sul Drive: i prossimi salvataggi sono incrementali.
        if (esito.manifesto !== undefined) scriviManifestoLocale(esito.manifesto)
        scriviStato({ ...leggiStato(), ultimoSalvataggio: adesso() })
        log(`RIPRISTINA ok (${esito.scritti} file scritti)`)
        return { ok: true, scritti: esito.scritti }
      } catch (e) {
        log(`RIPRISTINA fallito: ${messaggioDi(e)}`)
        return { ok: false, messaggio: messaggioDi(e) }
      }
    }
  }
}
