import { existsSync, readFileSync, rmSync } from 'node:fs'
import { scriviAtomico } from '@shared/scrittura-atomica'
import { join } from 'node:path'
import { creaCassaforte, sblocca as sbloccaCassaforte, sbloccaConRecupero as sbloccaConRecuperoCassaforte, cambiaPassphrase as cambiaPassphraseCassaforte, type Cassaforte, cifra, decifra } from './cifratura'
import type { Progresso } from './motore'
import { pesaRadici, radiciDaSincronizzare, type Radice } from './raccolta'
import type { Magazzino } from './magazzino'
import type { Archivio } from './archivio'
import { salvaIncrementale, ripristinaIncrementale, manifestoVuoto, type Manifesto, prefissoDi } from './incrementale'
import { applicaBlocco } from './lavoro'
import type { Scatola } from '../progetti/presenza'
import { prefissoProgetto } from '../progetti/registro'

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

/**
 * Il portachiavi del sistema, dove la chiave-maestra puo' dormire fra una
 * sessione e l'altra.
 *
 * Fino alla 0.12.54 la maestra viveva **solo in memoria**: a ogni riavvio —
 * ogni aggiornamento — serviva la passphrase, e finche' nessuno la inseriva il
 * salvataggio automatico restava fermo in silenzio. Per un programma che si
 * aggiorna da solo e lavora di notte, vuol dire che l'automatico non c'era.
 *
 * Scelta di Nicholas (2026-09-04): la maestra si conserva avvolta dal
 * portachiavi di Windows (`safeStorage`, cioe' DPAPI legata a **questo**
 * account), cosi' l'automatico riparte da solo. Il costo e' esplicito: chi
 * entra in questo profilo Windows apre la cassaforte senza passphrase. Su un
 * altro PC il file non vale niente, e la passphrase resta necessaria.
 *
 * Iniettabile, come per le destinazioni SFTP: cosi' il modulo non dipende da
 * Electron e la regola si prova.
 */
export type Portachiavi = {
  disponibile: () => boolean
  cifra: (chiaro: Buffer) => string
  decifra: (cifrato: string) => Buffer
}

/** Il file, accanto alla cassaforte, con la maestra avvolta dal portachiavi. */
export const FILE_MAESTRA_RICORDATA = 'maestra-portachiavi.json'

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
  /**
   * Un solo progetto, dal Drive alla sua cartella di qui: quello che serve al
   * passaggio di testimone. Scarica solo cio' che e' cambiato e toglie cio'
   * che l'altro PC ha cancellato. Non tocca chat e assetto.
   */
  ripristinaProgetto: (id: string) => Promise<{ ok: boolean; scritti?: number; messaggio?: string }>
  /** Piccoli oggetti cifrati sul Drive (presenze, staffette); assente se chiuso o scollegato. */
  scatola: () => Scatola | undefined
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
  /** Il portachiavi del sistema: senza, la maestra vive solo in memoria. */
  portachiavi?: Portachiavi
  /**
   * I progetti sul Drive. `radiciLocali` sono quelli con una cartella su
   * questo PC (si salvano e si pesano); `preparaRipristino` da' una cartella a
   * chi non ce l'ha e restituisce le radici di tutti, per il secondo tempo del
   * ripristino; `eDiProgetto` distingue i loro prefissi nel manifesto.
   */
  progetti?: {
    radiciLocali: () => Radice[]
    preparaRipristino: () => Radice[]
    eDiProgetto: (prefisso: string) => boolean
  }
}): Sincronia {
  const adesso = deps.adesso ?? ((): string => new Date().toISOString())
  const log = deps.log ?? ((): void => {})
  const radici = (): Radice[] =>
    radiciDaSincronizzare(deps.dati, deps.radiceClaude, deps.progetti?.radiciLocali() ?? [])
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

  // La sola cosa in chiaro. In memoria, e — se c'e' un portachiavi — avvolta
  // su disco perche' l'automatico riparta da solo dopo un riavvio.
  let maestra: Buffer | undefined

  const fileMaestra = join(deps.dati, FILE_MAESTRA_RICORDATA)
  const dimenticaMaestra = (): void => {
    try {
      if (existsSync(fileMaestra)) rmSync(fileMaestra)
    } catch (err) {
      console.error('[sync] maestra ricordata non rimossa:', err)
    }
  }
  const ricordaMaestra = (m: Buffer): void => {
    const p = deps.portachiavi
    if (p === undefined || !p.disponibile()) return
    try {
      scriviAtomico(fileMaestra, JSON.stringify({ maestra: p.cifra(m) }), 'sync')
    } catch (err) {
      // Senza portachiavi si lavora come prima: solo in memoria.
      console.error('[sync] maestra non ricordata:', err)
    }
  }
  /** La maestra della volta scorsa, se il portachiavi la riapre. */
  const maestraRicordata = (): Buffer | undefined => {
    const p = deps.portachiavi
    if (p === undefined || !existsSync(fileMaestra)) return undefined
    try {
      const j = JSON.parse(readFileSync(fileMaestra, 'utf8')) as { maestra?: unknown }
      if (typeof j.maestra !== 'string') throw new Error('forma sconosciuta')
      const m = p.decifra(j.maestra)
      if (m.length === 0) throw new Error('vuota')
      return m
    } catch (err) {
      // Un file di un altro account, o di un altro PC, non si apre: non vale
      // niente e non deve restare li' a fallire a ogni avvio.
      console.error('[sync] maestra ricordata illeggibile, la butto:', err)
      dimenticaMaestra()
      return undefined
    }
  }
  const adotta = (m: Buffer): void => {
    maestra = m
    ricordaMaestra(m)
  }
  maestra = maestraRicordata()
  if (maestra !== undefined) log('cassaforte sbloccata dal portachiavi del sistema')

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
      return pesaRadici(radici())
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
      adotta(m)
      return { ok: true, chiaveRecupero }
    },

    async sblocca(passphrase) {
      const c = await ottieniCassaforte()
      if (c === undefined) return { ok: false, messaggio: 'Nessuna cassaforte: crea prima una passphrase.' }
      const m = sbloccaCassaforte(c, passphrase)
      if (m === undefined) return { ok: false, messaggio: 'Passphrase errata.' }
      adotta(m)
      return { ok: true }
    },

    async sbloccaConRecupero(codice) {
      const c = await ottieniCassaforte()
      if (c === undefined) return { ok: false, messaggio: 'Nessuna cassaforte.' }
      const m = sbloccaConRecuperoCassaforte(c, codice)
      if (m === undefined) return { ok: false, messaggio: 'Chiave di recupero non valida.' }
      adotta(m)
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
      adotta(m)
      return { ok: true }
    },

    // Bloccare e' una scelta: vale anche per la prossima sessione.
    blocca() {
      maestra = undefined
      dimenticaMaestra()
    },

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
          radici: radici(),
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

    async ripristinaProgetto(id) {
      if (maestra === undefined) return { ok: false, messaggio: 'Sblocca prima con la passphrase.' }
      if (!deps.driveConnesso()) return { ok: false, messaggio: 'Collega prima Google Drive.' }
      if (deps.progetti === undefined) return { ok: false, messaggio: 'Nessun progetto sul Drive.' }
      const prefisso = prefissoProgetto(id)
      const radici = deps.progetti.preparaRipristino().filter((r) => r.prefisso === prefisso)
      if (radici.length === 0) return { ok: false, messaggio: 'Progetto senza cartella su questo PC.' }
      try {
        const precedente = leggiManifestoLocale()
        const esito = await ripristinaIncrementale({
          radici, maestra, archivio: deps.archivio(),
          soloPrefissi: (p) => p === prefisso,
          manifestoPrec: precedente,
          elimina: true,
          ...(deps.emettiProgresso !== undefined ? { onProgresso: deps.emettiProgresso } : {})
        })
        if (!esito.trovato || esito.manifesto === undefined) return { ok: false, messaggio: 'Niente sul Drive.' }
        // Il manifesto locale sa del progetto quello che sa il Drive; del resto
        // resta quello che sapeva: cosi' il prossimo salvataggio non rimanda
        // tutto, e non crede sparito cio' che non ha guardato.
        const nuovo: Manifesto = { ...precedente, file: { ...precedente.file } }
        for (const k of Object.keys(nuovo.file)) if (prefissoDi(k) === prefisso) delete nuovo.file[k]
        for (const [k, v] of Object.entries(esito.manifesto.file)) if (prefissoDi(k) === prefisso) nuovo.file[k] = v
        scriviManifestoLocale(nuovo)
        log(`RIPRISTINA progetto ${id}: ${esito.scritti} scritti, ${esito.invariati} invariati, ${esito.eliminati} tolti`)
        return { ok: true, scritti: esito.scritti }
      } catch (e) {
        log(`RIPRISTINA progetto ${id} fallito: ${messaggioDi(e)}`)
        return { ok: false, messaggio: messaggioDi(e) }
      }
    },

    scatola() {
      if (maestra === undefined || !deps.driveConnesso()) return undefined
      const m = maestra
      const a = deps.archivio()
      return {
        async leggi(nome) {
          const blob = await a.scarica(nome)
          if (blob === undefined) return undefined
          const chiaro = await decifra(m, blob)
          if (chiaro === undefined) return undefined
          try { return JSON.parse(chiaro.toString('utf8')) } catch { return undefined }
        },
        async scrivi(nome, oggetto) {
          await a.carica(nome, await cifra(m, Buffer.from(JSON.stringify(oggetto), 'utf8')))
        },
        async cancella(nome) {
          try { await a.cancella(nome) } catch { /* gia' sparito */ }
        }
      }
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
        // Primo tempo: l'assetto e le chat. Dentro c'e' il registro dei
        // progetti, senza il quale i progetti non saprebbero dove andare.
        const eDiProgetto = deps.progetti?.eDiProgetto ?? ((): boolean => false)
        const esito = await ripristinaIncrementale({
          radici: radiciDaSincronizzare(deps.dati, deps.radiceClaude),
          maestra,
          archivio: deps.archivio(),
          soloPrefissi: (p) => !eDiProgetto(p),
          manifestoPrec: leggiManifestoLocale(),
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
        // Secondo tempo: i progetti, ognuno nella sua cartella di qui.
        let scritti = esito.scritti
        if (deps.progetti !== undefined) {
          const radiciProgetti = deps.progetti.preparaRipristino()
          if (radiciProgetti.length > 0) {
            const secondo = await ripristinaIncrementale({
              radici: radiciProgetti,
              maestra,
              archivio: deps.archivio(),
              soloPrefissi: eDiProgetto,
              manifestoPrec: leggiManifestoLocale(),
              elimina: true,
              ...(deps.emettiProgresso !== undefined ? { onProgresso: deps.emettiProgresso } : {})
            })
            scritti += secondo.scritti
            log(`RIPRISTINA progetti: ${secondo.scritti} file in ${radiciProgetti.length} progetti`)
          }
        }
        log(`RIPRISTINA ok (${scritti} file scritti)`)
        return { ok: true, scritti }
      } catch (e) {
        log(`RIPRISTINA fallito: ${messaggioDi(e)}`)
        return { ok: false, messaggio: messaggioDi(e) }
      }
    }
  }
}
