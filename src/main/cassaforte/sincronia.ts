import { existsSync, readFileSync, rmSync, renameSync } from 'node:fs'
import { scriviAtomico } from '@shared/scrittura-atomica'
import { join } from 'node:path'
import { creaCassaforte, sblocca as sbloccaCassaforte, sbloccaConRecupero as sbloccaConRecuperoCassaforte, cambiaPassphrase as cambiaPassphraseCassaforte, type Cassaforte, cifra, decifra } from './cifratura'
import type { Progresso } from './motore'
import { pesaRadici, radiciDaSincronizzare, percorsoSicuro, type Radice } from './raccolta'
import type { Magazzino } from './magazzino'
import type { Archivio } from './archivio'
import { salvaIncrementale, ripristinaIncrementale, manifestoVuoto, type Manifesto, prefissoDi, togliPrefisso, leggiManifesto } from './incrementale'
import { applicaBlocco } from './lavoro'
import type { Lavoro, Presa, TipoLavoro } from './lavoro-in-corso'
import type { Scatola } from '../progetti/presenza'
import { parseRegistro, prefissoProgetto, type RegistroProgetti } from '../progetti/registro'
import { parseArchivio, type Archivio as ArchivioWorkspace } from '@shared/workspace'
import { firmaRadici } from './raccolta'
import {
  pianifica, eseguiFusione, fondiArchivi, fondiRegistri, leggiJsonDalDrive,
  type PianoFusione, type ScelteFusione, type EsitoFusione
} from './fusione'

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
  /**
   * La cassaforte di questo PC non e' quella del Drive collegato: un altro
   * account, o un PC che ne aveva creata una sua. Con due cassaforti i dati
   * non si aprono: si adotta quella del Drive, o si cambia Drive.
   */
  cassaforteDiversa?: boolean
  versione?: string
  ultimoSalvataggio?: string
  /** Com'e' andata l'ultima fusione: se interrotta, si riapre e si rifa' il resto. */
  ultimaFusione?: UltimaFusione
}

/**
 * L'ultima fusione con il Drive, per riprenderla.
 *
 * Interrotta a meta' (annullata, o chiusa con il programma), il piano
 * successivo trova gia' uguali le voci fatte e ripropone le scelte di allora
 * per quelle rimaste: si preme di nuovo e si finisce.
 */
export type UltimaFusione = {
  quando: string
  esito: 'ok' | 'interrotta' | 'fallita'
  fatti?: number
  totale?: number
  messaggio?: string
  /** Le scelte di allora, da riproporre. Solo se non e' finita. */
  scelte?: ScelteFusione
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
  salva: (forza?: boolean) => Promise<{ ok: boolean; voci?: number; conflitto?: boolean; invariato?: boolean; messaggio?: string; conflitti?: number; annullato?: boolean }>
  /** Accende/spegne il salvataggio automatico, e dice com'è ora. */
  auto: (attivo?: boolean) => boolean
  /** Salva solo se serve (dati cambiati, sbloccato, connesso): per l'automatico. */
  salvaSeServe: () => Promise<void>
  ripristina: () => Promise<{ ok: boolean; scritti?: number; niente?: boolean; messaggio?: string; conflitti?: number; annullato?: boolean }>
  /**
   * Un solo progetto, dal Drive alla sua cartella di qui: quello che serve al
   * passaggio di testimone. Scarica solo cio' che e' cambiato e toglie cio'
   * che l'altro PC ha cancellato. Non tocca chat e assetto.
   */
  ripristinaProgetto: (id: string) => Promise<{ ok: boolean; scritti?: number; messaggio?: string; conflitti?: number }>
  /** Piccoli oggetti cifrati sul Drive (presenze, staffette); assente se chiuso o scollegato. */
  scatola: () => Scatola | undefined
  /**
   * Il piano di fusione fra questo PC e il Drive collegato: cosa c'e' di qua,
   * di la', in comune, e cosa si farebbe. Se la cassaforte del Drive e' un'altra
   * serve la sua passphrase, per leggerlo. Non tocca niente.
   */
  anteprimaFusione: (passphraseDrive?: string) => Promise<{ ok: true; piano: PianoFusione } | { ok: false; messaggio: string; servePassphrase?: boolean }>
  /**
   * Esegue le scelte. Se la cassaforte del Drive e' un'altra la adotta (con
   * la passphrase data): da qui in poi questo PC usa quella, e la propria resta
   * messa da parte. Poi carica, scarica, fonde i workspace e il registro.
   */
  eseguiFusione: (scelte: ScelteFusione, passphraseDrive?: string) => Promise<{ ok: true; esito: EsitoFusione } | { ok: false; messaggio: string }>
  /**
   * Mette da parte la cassaforte di questo PC e prende quella del Drive: da
   * qui in poi serve la passphrase di quel Drive. La vecchia resta accanto,
   * non si cancella. E si dimentica cosa si sapeva del Drive di prima.
   */
  adottaCassaforteDelDrive: () => Promise<EsitoSemplice>
  /**
   * La prova diretta: la passphrase di questo PC apre la cassaforte del Drive
   * collegato? Se la apre **e** dentro c'e' la stessa chiave-maestra, e' il
   * Drive di questo PC: si allinea la copia locale e si sblocca. Se la apre
   * ma la chiave e' un'altra, e' un'altra cassaforte con la stessa
   * passphrase. Se non la apre, non e' questo il Drive (o la passphrase e'
   * un'altra). Non cambia niente se non e' la stessa.
   */
  provaPassphraseSulDrive: (passphrase: string) => Promise<{ ok: boolean; stessa?: boolean; messaggio?: string }>
  /**
   * Il Drive collegato e' un altro (o e' vuoto): quello che questo PC sapeva
   * del Drive di prima non vale piu', e il prossimo salvataggio rimanda tutto.
   */
  cambiatoDrive: () => void
  /**
   * I nomi dei file che questo PC ha caricato sul suo Drive, secondo il suo
   * manifesto. Confrontati con quelli di un Drive appena collegato dicono se
   * e' **quello**: i nomi sono hash dei percorsi, non si indovinano.
   */
  nomiConosciuti: () => string[]
  /**
   * Toglie dal Drive i file di un progetto (e presenza e staffetta). Le
   * cartelle sui PC restano: si toglie il viaggio, non il lavoro.
   */
  togliProgettoDalDrive: (id: string) => Promise<{ ok: boolean; tolti?: number; messaggio?: string }>
}

/** Due cassaforti sono la stessa se custodiscono la stessa chiave-maestra: lo dice l'involucro di recupero, che non cambia mai. */
export function stessaCassaforte(a: Cassaforte, b: Cassaforte): boolean {
  return a.maestraDaRecupero === b.maestraDaRecupero && a.saleRecupero === b.saleRecupero
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
  /** Come si chiama questo PC: da' il nome alle copie in conflitto. */
  pcNome?: () => string
  /**
   * I progetti sul Drive. `radiciLocali` sono quelli con una cartella su
   * questo PC (si salvano e si pesano); `preparaRipristino` da' una cartella a
   * chi non ce l'ha e restituisce le radici di tutti, per il secondo tempo del
   * ripristino; `eDiProgetto` distingue i loro prefissi nel manifesto.
   */
  progetti?: {
    radiciLocali: () => Radice[]
    preparaRipristino: (soloId?: Set<string>) => Radice[]
    eDiProgetto: (prefisso: string) => boolean
  }
  /** L'archivio dei workspace di questo PC, per la fusione. */
  workspaceLocale?: { leggi: () => ArchivioWorkspace | undefined; scrivi: (a: ArchivioWorkspace) => boolean }
  /** Il registro dei progetti di questo PC, per la fusione. */
  registroProgetti?: { leggi: () => RegistroProgetti; scrivi: (r: RegistroProgetti) => void }
  /** L'indice delle conversazioni: per chiamare le chat col loro nome nel piano di fusione. */
  titoliChat?: () => Map<string, { titolo?: string; cwd?: string; quando?: string; messaggi?: number }>
  pcId?: () => string
  /** Il lavoro con il Drive: uno alla volta, visibile in ogni finestra, annullabile. */
  lavoro?: Lavoro
}): Sincronia {
  const adesso = deps.adesso ?? ((): string => new Date().toISOString())
  // Prendere il lavoro: se un altro e' in corso non si parte, e lo si dice.
  const prendiLavoro = (tipo: TipoLavoro): { presa?: Presa; errore?: string } => {
    if (deps.lavoro === undefined) return {}
    try { return { presa: deps.lavoro.avvia(tipo) } } catch (e) { return { errore: e instanceof Error ? e.message : String(e) } }
  }
  const progressoVerso = (presa: Presa | undefined) => (p: Progresso): void => {
    deps.emettiProgresso?.(p)
    presa?.aggiorna(p)
  }
  const chiudiLavoro = (presa: Presa | undefined, r: { ok: boolean; messaggio?: string; annullato?: boolean }, riassunto: string): void => {
    presa?.fine(r.annullato === true ? 'annullato' : r.ok ? 'ok' : 'errore', r.ok ? riassunto : (r.messaggio ?? riassunto))
  }
  /**
   * Il manifesto locale dopo una fusione: solo cio' che sta **davvero** su
   * questo disco. Il manifesto del Drive contiene anche le voci lasciate
   * «com'e'» solo di la': scriverlo tale e quale come «cio' che questo PC sa
   * di avere» faceva cancellare dal Drive, al salvataggio dopo, ogni chat
   * lasciata sul Drive e mai scaricata — il salvataggio la vedeva come «l'avevo
   * e non ce l'ho piu'».
   */
  const manifestoDiQui = async (m: Manifesto, radici: Radice[]): Promise<Manifesto> => {
    const suDisco = await firmaRadici(radici)
    const file: Manifesto['file'] = {}
    for (const [p, v] of Object.entries(m.file)) if (suDisco.has(p)) file[p] = v
    return { ...m, file }
  }
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
  /**
   * Il manifesto locale dice **solo cio' che sta su questo disco**.
   *
   * E' «l'idea di questo PC di cosa c'e' sul Drive» e insieme «cosa questo PC
   * ha»: il salvataggio cancella dal Drive cio' che sta nel manifesto locale
   * e non piu' su disco. Scrivere qui il manifesto del Drive **intero** — con
   * le chat degli altri PC mai scaricate — faceva cancellare quelle chat al
   * salvataggio dopo: 385 in una volta, il 2026-09-08, mentre una fusione le
   * stava ancora scaricando. Da qui passa ogni scrittura, e filtra.
   */
  const soloSuDisco = (m: Manifesto): Manifesto => {
    const perPrefisso = new Map(radici().map((r) => [r.prefisso, r.cartella]))
    const file: Manifesto['file'] = {}
    for (const [p, v] of Object.entries(m.file)) {
      const prefisso = prefissoDi(p)
      const cartella = perPrefisso.get(prefisso)
      if (cartella === undefined) continue
      const disco = percorsoSicuro(cartella, p.slice(prefisso.length + 1))
      if (disco !== undefined && existsSync(disco)) file[p] = v
    }
    return { ...m, file }
  }
  const scriviManifestoLocale = (m: Manifesto): void => {
    scriviAtomico(fileManifesto, JSON.stringify(soloSuDisco(m)), 'sync')
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
    ultimaFusione?: UltimaFusione
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
      const locale = leggiLocale()
      let ha = locale !== undefined
      let diversa = false
      if (deps.driveConnesso()) {
        const remota = await scaricaChiavi().catch(() => undefined)
        if (!ha) ha = remota !== undefined
        else if (remota !== undefined && locale !== undefined) {
          // L'identita' di una cassaforte e' la chiave-maestra, e l'unico
          // involucro che non cambia mai e' quello con la chiave di recupero:
          // un cambio di passphrase rifa' `sale` e `maestraDaPassphrase`, e
          // guardando quelli il portatile vedeva «diversa» sul Drive giusto,
          // solo perche' sul PC principale la passphrase era stata cambiata.
          diversa = !stessaCassaforte(locale, remota)
          if (!diversa && (remota.maestraDaPassphrase !== locale.maestraDaPassphrase || remota.sale !== locale.sale)) {
            // Stessa cassaforte, passphrase cambiata altrove: la copia di qui
            // si allinea, cosi' la prossima volta apre la passphrase nuova.
            scriviLocale(remota)
            log('cassaforte allineata al Drive: la passphrase e\' stata cambiata da un altro PC')
          }
        }
      }
      return {
        driveConnesso: deps.driveConnesso(),
        haCassaforte: ha,
        sbloccato: maestra !== undefined,
        ...(diversa ? { cassaforteDiversa: true } : {}),
        ...(s.versione !== undefined ? { versione: s.versione } : {}),
        ...(s.ultimoSalvataggio !== undefined ? { ultimoSalvataggio: s.ultimoSalvataggio } : {}),
        ...(s.ultimaFusione !== undefined ? { ultimaFusione: s.ultimaFusione } : {})
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
      const l = prendiLavoro('salvataggio')
      if (l.errore !== undefined) return { ok: false, messaggio: l.errore }
      const r = await (async (): Promise<{ ok: boolean; voci?: number; conflitto?: boolean; invariato?: boolean; messaggio?: string; conflitti?: number; annullato?: boolean }> => {
      const s = leggiStato()
      try {
        // Sincronizzazione **incrementale**: si mandano solo i file cambiati dal
        // manifesto locale. Niente conflitto a versione unica — non c'è più un
        // blocco solo — quindi «Salva ora» semplicemente aggiorna ciò che è nuovo.
        const esito = await salvaIncrementale({
          radici: radici(),
          maestra,
          pcNome: deps.pcNome?.() ?? 'questo-pc',
          copieDiConflitto: deps.progetti?.eDiProgetto ?? ((): boolean => false),
          archivio: deps.archivio(),
          manifestoPrec: leggiManifestoLocale(),
          adesso: adesso(),
          onProgresso: progressoVerso(l.presa),
          ...(l.presa !== undefined ? { segnale: l.presa.segnale } : {})
        })
        scriviManifestoLocale(esito.manifesto)
        const totali = Object.keys(esito.manifesto.file).length
        if (esito.annullato === true) {
          log(`SALVA annullato (${esito.caricati} caricati prima di fermarsi)`)
          return { ok: true, voci: esito.caricati, annullato: true, messaggio: `fermato: ${esito.caricati} file saliti, il resto al prossimo salvataggio` }
        }
        if (esito.caricati === 0 && esito.cancellati === 0) {
          log('niente da salvare: nessun file cambiato')
          return { ok: true, invariato: true, voci: totali }
        }
        scriviStato({ ...s, ultimoSalvataggio: adesso() })
        for (const c of esito.conflitti) {
          log(`SALVA conflitto su ${c.percorso}: vince ${c.vinto === 'mio' ? 'questo PC' : 'il Drive'}${c.copia !== undefined ? `, copia in ${c.copia}` : ''}`)
        }
        log(`SALVA ok (${esito.caricati} caricati, ${esito.cancellati} rimossi, ${totali} in tutto${esito.conflitti.length > 0 ? `, ${esito.conflitti.length} conflitti` : ''})`)
        return { ok: true, voci: esito.caricati, ...(esito.conflitti.length > 0 ? { conflitti: esito.conflitti.length } : {}) }
      } catch (e) {
        log(`SALVA fallito: ${messaggioDi(e)}`)
        return { ok: false, messaggio: messaggioDi(e) }
      }
    })()
      chiudiLavoro(l.presa, r, r.invariato === true ? 'niente da salvare' : `${r.voci ?? 0} file sul Drive`)
      return r
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
          pcNome: deps.pcNome?.() ?? 'questo-pc',
          copieDiConflitto: deps.progetti?.eDiProgetto ?? ((): boolean => false),
          adesso: adesso(),
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
        for (const c of esito.conflitti) {
          log(`RIPRISTINA conflitto su ${c.percorso}: vince ${c.vinto === 'mio' ? 'questo PC' : 'il Drive'}${c.copia !== undefined ? `, copia in ${c.copia}` : ''}`)
        }
        log(`RIPRISTINA progetto ${id}: ${esito.scritti} scritti, ${esito.invariati} invariati, ${esito.tenuti} tenuti, ${esito.eliminati} tolti, ${esito.conflitti.length} conflitti`)
        return { ok: true, scritti: esito.scritti, ...(esito.conflitti.length > 0 ? { conflitti: esito.conflitti.length } : {}) }
      } catch (e) {
        log(`RIPRISTINA progetto ${id} fallito: ${messaggioDi(e)}`)
        return { ok: false, messaggio: messaggioDi(e) }
      }
    },

    async togliProgettoDalDrive(id) {
      if (maestra === undefined) return { ok: false, messaggio: 'Sblocca prima con la passphrase.' }
      if (!deps.driveConnesso()) return { ok: false, messaggio: 'Collega prima Google Drive.' }
      const prefisso = prefissoProgetto(id)
      try {
        const esito = await togliPrefisso({ maestra, archivio: deps.archivio(), prefisso, adesso: adesso() })
        const a = deps.archivio()
        await a.cancella(`presenza-${id}`).catch(() => undefined)
        await a.cancella(`staffetta-${id}`).catch(() => undefined)
        // Anche il manifesto locale dimentica il progetto: cosi' i file sul
        // disco, che restano, non sembrano ne' «nuovi» ne' «spariti».
        const locale = leggiManifestoLocale()
        const nuovo: Manifesto = { ...locale, file: { ...locale.file } }
        for (const k of Object.keys(nuovo.file)) if (prefissoDi(k) === prefisso) delete nuovo.file[k]
        scriviManifestoLocale(nuovo)
        log(`TOGLI progetto ${id}: ${esito.tolti} file tolti dal Drive`)
        return { ok: true, tolti: esito.tolti }
      } catch (e) {
        log(`TOGLI progetto ${id} fallito: ${messaggioDi(e)}`)
        return { ok: false, messaggio: messaggioDi(e) }
      }
    },

    async provaPassphraseSulDrive(passphrase) {
      if (!deps.driveConnesso()) return { ok: false, messaggio: 'Collega prima Google Drive.' }
      const remota = await scaricaChiavi().catch(() => undefined)
      if (remota === undefined) return { ok: false, messaggio: 'Su questo Drive non c’è una cassaforte.' }
      const mR = sbloccaCassaforte(remota, passphrase)
      if (mR === undefined) {
        return { ok: false, messaggio: 'Questa passphrase non apre la cassaforte di questo Drive: o non è il Drive di questo PC, o la passphrase è un’altra.' }
      }
      const locale = leggiLocale()
      const mL = locale === undefined ? undefined : sbloccaCassaforte(locale, passphrase)
      if (mL !== undefined && !mL.equals(mR)) {
        return { ok: true, stessa: false, messaggio: 'La passphrase apre anche questo Drive, ma dentro c’è un’altra chiave: è un’altra cassaforte con la stessa passphrase, non quella di questo PC.' }
      }
      // Stessa chiave (o nessuna cassaforte locale che la contraddica): questo
      // e' il Drive di questo PC. La copia di qui si allinea e si sblocca.
      scriviLocale(remota)
      adotta(mR)
      log('la passphrase di questo PC apre il Drive collegato: e\' il suo, cassaforte allineata e sbloccata')
      return { ok: true, stessa: true }
    },

    async anteprimaFusione(passphraseDrive) {
      if (!deps.driveConnesso()) return { ok: false, messaggio: 'Collega prima Google Drive.' }
      const remota = await scaricaChiavi().catch(() => undefined)
      const locale = leggiLocale()
      if (remota === undefined) return { ok: false, messaggio: 'Su questo Drive non c’è una cassaforte: non c’è niente da fondere. Usa «Salva ora».' }
      const diversa = locale !== undefined && !stessaCassaforte(locale, remota)
      let mDrive: Buffer | undefined
      if (!diversa) {
        if (maestra === undefined) return { ok: false, messaggio: 'Sblocca prima con la passphrase.' }
        mDrive = maestra
      } else {
        if (passphraseDrive === undefined || passphraseDrive === '') return { ok: false, messaggio: 'La cassaforte di questo Drive è un’altra: serve la sua passphrase.', servePassphrase: true }
        mDrive = sbloccaCassaforte(remota, passphraseDrive)
        if (mDrive === undefined) return { ok: false, messaggio: 'Questa passphrase non apre la cassaforte del Drive.', servePassphrase: true }
      }
      try {
        const esito = await leggiManifesto(deps.archivio(), mDrive)
        if (esito.stato === 'illeggibile') return { ok: false, messaggio: 'Il manifesto sul Drive non si apre con questa chiave.' }
        const manifestoDrive = esito.stato === 'ok' ? esito.manifesto : manifestoVuoto()
        const rawArchivio = await leggiJsonDalDrive(deps.archivio(), mDrive, manifestoDrive, 'sierradeck/workspaces.json')
        const archivioDrive = rawArchivio === undefined ? undefined : parseArchivio(rawArchivio).archivio
        const registroDrive = parseRegistro(await leggiJsonDalDrive(deps.archivio(), mDrive, manifestoDrive, 'sierradeck/progetti-drive.json'))
        const firma = await firmaRadici(radici())
        const firmaPc = new Map<string, { size: number; mtime: number }>()
        for (const [k, v] of firma) firmaPc.set(k, { size: v.size, mtime: v.mtime })
        const archivioPc = deps.workspaceLocale?.leggi()
        const titoliIndice = deps.titoliChat?.()
        const piano = pianifica({
          firmaPc, manifestoDrive,
          ...(archivioPc !== undefined ? { archivioPc } : {}),
          ...(archivioDrive !== undefined ? { archivioDrive } : {}),
          ...(titoliIndice !== undefined ? { titoliIndice } : {}),
          registroPc: deps.registroProgetti?.leggi() ?? { versione: 1, progetti: [] },
          registroDrive,
          pcId: deps.pcId?.() ?? '',
          cassaforteDiversa: diversa
        })
        log(`FUSIONE anteprima: ${piano.totali.soloPc} solo PC, ${piano.totali.soloDrive} solo Drive, ${piano.totali.diverse} diverse, ${piano.totali.uguali} uguali`)
        return { ok: true, piano }
      } catch (e) {
        log(`FUSIONE anteprima fallita: ${messaggioDi(e)}`)
        return { ok: false, messaggio: messaggioDi(e) }
      }
    },

    async eseguiFusione(scelte, passphraseDrive) {
      if (!deps.driveConnesso()) return { ok: false, messaggio: 'Collega prima Google Drive.' }
      const remota = await scaricaChiavi().catch(() => undefined)
      if (remota === undefined) return { ok: false, messaggio: 'Su questo Drive non c’è una cassaforte.' }
      const locale = leggiLocale()
      if (locale !== undefined && !stessaCassaforte(locale, remota)) {
        const mR = passphraseDrive === undefined ? undefined : sbloccaCassaforte(remota, passphraseDrive)
        if (mR === undefined) return { ok: false, messaggio: 'Serve la passphrase della cassaforte del Drive.' }
        const adottata = await this.adottaCassaforteDelDrive()
        if (!adottata.ok) return { ok: false, messaggio: adottata.messaggio ?? 'cassaforte non adottata' }
        adotta(mR)
      } else if (maestra === undefined) {
        const m = passphraseDrive === undefined ? undefined : sbloccaCassaforte(remota, passphraseDrive)
        if (m === undefined) return { ok: false, messaggio: 'Sblocca prima con la passphrase.' }
        adotta(m)
      }
      const m = maestra as Buffer
      const l = prendiLavoro('fusione')
      if (l.errore !== undefined) return { ok: false, messaggio: l.errore }
      const r = await (async (): Promise<{ ok: true; esito: EsitoFusione } | { ok: false; messaggio: string }> => {
      try {
        log('FUSIONE richiesta')
        const esitoM = await leggiManifesto(deps.archivio(), m)
        const manifestoDrive = esitoM.stato === 'ok' ? esitoM.manifesto : manifestoVuoto()
        // I workspace e il registro si fondono prima, sul disco: poi salgono
        // come file qualunque, insieme alle scelte.
        const rawArchivio = await leggiJsonDalDrive(deps.archivio(), m, manifestoDrive, 'sierradeck/workspaces.json')
        const archivioDrive = rawArchivio === undefined ? undefined : parseArchivio(rawArchivio).archivio
        const archivioFuso = fondiArchivi(deps.workspaceLocale?.leggi(), archivioDrive, scelte.workspace.modo, scelte.workspace.escludi)
        if (archivioFuso !== undefined) deps.workspaceLocale?.scrivi(archivioFuso)
        const registroDrive = parseRegistro(await leggiJsonDalDrive(deps.archivio(), m, manifestoDrive, 'sierradeck/progetti-drive.json'))
        const registroFuso = fondiRegistri(deps.registroProgetti?.leggi() ?? { versione: 1, progetti: [] }, registroDrive)
        deps.registroProgetti?.scrivi(registroFuso)
        const voci: Record<string, 'carica' | 'scarica' | 'copia' | 'salta'> = {
          ...scelte.voci,
          'sierradeck/workspaces.json': 'carica',
          'sierradeck/progetti-drive.json': 'carica'
        }
        // Le cartelle dei progetti che ricevono qualcosa, create se mancano.
        const idDaRicevere = new Set<string>()
        for (const [percorso, azione] of Object.entries(voci)) {
          if ((azione === 'scarica' || azione === 'copia') && percorso.startsWith('progetto-')) {
            idDaRicevere.add(prefissoDi(percorso).slice('progetto-'.length))
          }
        }
        const radiciProgetti = deps.progetti === undefined ? [] : deps.progetti.preparaRipristino(idDaRicevere)
        const tutteLeRadici = radiciDaSincronizzare(deps.dati, deps.radiceClaude, [
          ...radiciProgetti,
          ...(deps.progetti?.radiciLocali() ?? []).filter((r) => !radiciProgetti.some((x) => x.prefisso === r.prefisso))
        ])
        const esito = await eseguiFusione({
          maestra: m, archivio: deps.archivio(), radici: tutteLeRadici, scelte: { ...scelte, voci },
          pcNome: deps.pcNome?.() ?? 'questo-pc', adesso: adesso(),
          onProgresso: (f, t, percorso) => progressoVerso(l.presa)({
            fase: 'carico', fatto: f, totale: t, unita: 'file',
            ...(percorso !== undefined ? { dettaglio: percorso.split('/').slice(-2).join('/') } : {})
          }),
          ...(l.presa !== undefined ? { segnale: l.presa.segnale } : {})
        })
        scriviManifestoLocale(await manifestoDiQui(esito.manifesto, tutteLeRadici))
        const ultimaFusione: UltimaFusione = esito.annullato === true
          ? { quando: adesso(), esito: 'interrotta', fatti: esito.fatti, totale: esito.totale, scelte }
          : { quando: adesso(), esito: 'ok', fatti: esito.fatti, totale: esito.totale }
        scriviStato({ ...leggiStato(), ultimoSalvataggio: adesso(), ultimaFusione })
        log(`FUSIONE ${esito.annullato === true ? `ANNULLATA a ${esito.fatti}/${esito.totale}` : 'ok'}: ${esito.caricati} caricati, ${esito.scaricati} scaricati, ${esito.copie} copie, ${esito.saltati} saltati${esito.saltati > 0 && esito.perche !== undefined ? ` (sul Drive manca il file: ${esito.perche.blobMancante}, qui manca il file: ${esito.perche.localeMancante}, non scrivibile: ${esito.perche.nonScritto})` : ''}`)
        return { ok: true, esito }
      } catch (e) {
        log(`FUSIONE fallita: ${messaggioDi(e)}`)
        scriviStato({ ...leggiStato(), ultimaFusione: { quando: adesso(), esito: 'fallita', messaggio: messaggioDi(e), scelte } })
        return { ok: false, messaggio: messaggioDi(e) }
      }
      })()
      chiudiLavoro(
        l.presa,
        r.ok ? { ok: true, ...(r.esito.annullato === true ? { annullato: true } : {}) } : r,
        r.ok
          ? (r.esito.annullato === true
              ? `fermata a ${r.esito.fatti} su ${r.esito.totale}: riapri «Fondi con il Drive» per finire`
              : `${r.esito.caricati} sul Drive, ${r.esito.scaricati} qui${r.esito.copie > 0 ? `, ${r.esito.copie} in due versioni` : ''}. Riavvia per vedere tutto.`)
          : ''
      )
      return r
    },

    async adottaCassaforteDelDrive() {
      if (!deps.driveConnesso()) return { ok: false, messaggio: 'Collega prima Google Drive.' }
      const remota = await scaricaChiavi().catch(() => undefined)
      if (remota === undefined) return { ok: false, messaggio: 'Su questo Drive non c’è una cassaforte.' }
      const stampo = adesso().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)
      try {
        if (existsSync(fileCassaforte)) renameSync(fileCassaforte, join(deps.dati, `cassaforte.messa-da-parte-${stampo}.json`))
      } catch (err) {
        return { ok: false, messaggio: `la cassaforte di questo PC non si è potuta mettere da parte: ${messaggioDi(err)}` }
      }
      maestra = undefined
      dimenticaMaestra()
      scriviLocale(remota)
      this.cambiatoDrive()
      log('cassaforte del Drive adottata: quella di questo PC e\' messa da parte, serve la passphrase del Drive')
      return { ok: true }
    },

    nomiConosciuti() {
      return Object.values(leggiManifestoLocale().file).map((v) => v.nome)
    },

    cambiatoDrive() {
      const stampo = adesso().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)
      try {
        if (existsSync(fileManifesto)) renameSync(fileManifesto, join(deps.dati, `sync-manifesto.precedente-${stampo}.json`))
      } catch (err) {
        console.error('[sync] manifesto precedente non messo da parte:', err)
      }
      const s = leggiStato()
      scriviStato({ ...(s.auto !== undefined ? { auto: s.auto } : {}) })
      log('Drive cambiato: dimentico cosa sapevo di quello di prima')
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
      const l = prendiLavoro('ripristino')
      if (l.errore !== undefined) return { ok: false, messaggio: l.errore }
      const r = await (async (): Promise<{ ok: boolean; scritti?: number; niente?: boolean; messaggio?: string; conflitti?: number; annullato?: boolean }> => {
      try {
        // Primo tempo: l'assetto e le chat. Dentro c'e' il registro dei
        // progetti, senza il quale i progetti non saprebbero dove andare.
        const eDiProgetto = deps.progetti?.eDiProgetto ?? ((): boolean => false)
        // Un elenco solo insegna all'archivio dove sta ogni nome: da qui in
        // poi ogni scaricamento e' una chiamata, non due.
        await deps.archivio().elenca().catch(() => undefined)
        const esito = await ripristinaIncrementale({
          radici: radiciDaSincronizzare(deps.dati, deps.radiceClaude),
          maestra,
          archivio: deps.archivio(),
          soloPrefissi: (p) => !eDiProgetto(p),
          manifestoPrec: leggiManifestoLocale(),
          pcNome: deps.pcNome?.() ?? 'questo-pc',
          copieDiConflitto: eDiProgetto,
          adesso: adesso(),
          onProgresso: progressoVerso(l.presa),
          ...(l.presa !== undefined ? { segnale: l.presa.segnale } : {})
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
        if (esito.annullato === true) {
          log(`RIPRISTINA annullato (${esito.scritti} file scritti prima di fermarsi)`)
          return { ok: true, scritti: esito.scritti, annullato: true, messaggio: `fermato: ${esito.scritti} file arrivati, il resto con un altro «Ripristina»` }
        }
        scriviStato({ ...leggiStato(), ultimoSalvataggio: adesso() })
        // Secondo tempo: i progetti, ognuno nella sua cartella di qui.
        let scritti = esito.scritti
        let conflitti = esito.conflitti.length
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
              pcNome: deps.pcNome?.() ?? 'questo-pc',
              copieDiConflitto: eDiProgetto,
              adesso: adesso(),
              onProgresso: progressoVerso(l.presa),
          ...(l.presa !== undefined ? { segnale: l.presa.segnale } : {})
            })
            scritti += secondo.scritti
            conflitti += secondo.conflitti.length
            if (secondo.annullato === true) {
              log(`RIPRISTINA annullato nei progetti (${scritti} file scritti)`)
              return { ok: true, scritti, annullato: true, messaggio: `fermato: ${scritti} file arrivati, il resto con un altro «Ripristina»` }
            }
            for (const c of secondo.conflitti) {
              log(`RIPRISTINA conflitto su ${c.percorso}: vince ${c.vinto === 'mio' ? 'questo PC' : 'il Drive'}${c.copia !== undefined ? `, copia in ${c.copia}` : ''}`)
            }
            log(`RIPRISTINA progetti: ${secondo.scritti} file in ${radiciProgetti.length} progetti, ${secondo.tenuti} tenuti, ${secondo.conflitti.length} conflitti`)
          }
        }
        log(`RIPRISTINA ok (${scritti} file scritti${conflitti > 0 ? `, ${conflitti} conflitti` : ''})`)
        return { ok: true, scritti, ...(conflitti > 0 ? { conflitti } : {}) }
      } catch (e) {
        log(`RIPRISTINA fallito: ${messaggioDi(e)}`)
        return { ok: false, messaggio: messaggioDi(e) }
      }
    })()
      chiudiLavoro(l.presa, r, r.niente === true ? 'niente sul Drive' : `${r.scritti ?? 0} file da Drive`)
      return r
    }
  }
}
