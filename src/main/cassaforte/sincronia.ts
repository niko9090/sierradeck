import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { creaCassaforte, sblocca as sbloccaCassaforte, sbloccaConRecupero as sbloccaConRecuperoCassaforte, cambiaPassphrase as cambiaPassphraseCassaforte, type Cassaforte } from './cifratura'
import { caricaStato, ripristinaStato, CassaforteIlleggibile, type Progresso } from './motore'
import { radiciDaSincronizzare } from './raccolta'
import { ConflittoMagazzino, type Magazzino } from './magazzino'

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
  creaPassphrase: (passphrase: string) => Promise<{ ok: boolean; chiaveRecupero?: string; messaggio?: string }>
  sblocca: (passphrase: string) => Promise<EsitoSemplice>
  sbloccaConRecupero: (codice: string) => Promise<EsitoSemplice>
  cambiaPassphrase: (vecchia: string, nuova: string) => Promise<EsitoSemplice>
  blocca: () => void
  salva: () => Promise<{ ok: boolean; voci?: number; messaggio?: string }>
  ripristina: () => Promise<{ ok: boolean; scritti?: number; niente?: boolean; messaggio?: string }>
}

export function apriSincronia(deps: {
  dati: string
  radiceClaude: string
  driveConnesso: () => boolean
  magazzino: (nomeFile?: string) => Magazzino
  adesso?: () => string
  /** Dove far arrivare il progresso di salva/ripristina (verso l'interfaccia). */
  emettiProgresso?: (p: Progresso) => void
}): Sincronia {
  const adesso = deps.adesso ?? ((): string => new Date().toISOString())
  const fileCassaforte = join(deps.dati, 'cassaforte.json')
  const fileStato = join(deps.dati, 'sync-stato.json')

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
    try { writeFileSync(fileCassaforte, JSON.stringify(c), 'utf8') } catch (err) { console.error('[sync] cassaforte non salvata:', err) }
  }
  const leggiStato = (): { versione?: string; ultimoSalvataggio?: string } => {
    if (!existsSync(fileStato)) return {}
    try {
      return JSON.parse(readFileSync(fileStato, 'utf8')) as { versione?: string; ultimoSalvataggio?: string }
    } catch {
      return {}
    }
  }
  const scriviStato = (s: { versione?: string; ultimoSalvataggio?: string }): void => {
    try { writeFileSync(fileStato, JSON.stringify(s), 'utf8') } catch (err) { console.error('[sync] stato non salvato:', err) }
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
      if (maestra === undefined) return { ok: false, messaggio: 'Sblocca prima con la passphrase.' }
      if (!deps.driveConnesso()) return { ok: false, messaggio: 'Collega prima Google Drive.' }
      const radici = radiciDaSincronizzare(deps.dati, deps.radiceClaude)
      const s = leggiStato()
      try {
        const esito = await caricaStato({
          radici, maestra, magazzino: deps.magazzino(), adesso,
          ...(s.versione !== undefined ? { versioneVista: s.versione } : {}),
          ...(deps.emettiProgresso !== undefined ? { onProgresso: deps.emettiProgresso } : {})
        })
        scriviStato({ versione: esito.versione, ultimoSalvataggio: adesso() })
        return { ok: true, voci: esito.voci }
      } catch (e) {
        if (e instanceof ConflittoMagazzino) {
          return { ok: false, messaggio: 'Un altro PC ha salvato dopo di te: ripristina prima, poi risalva.' }
        }
        return { ok: false, messaggio: messaggioDi(e) }
      }
    },

    async ripristina() {
      if (maestra === undefined) return { ok: false, messaggio: 'Sblocca prima con la passphrase.' }
      if (!deps.driveConnesso()) return { ok: false, messaggio: 'Collega prima Google Drive.' }
      const radici = radiciDaSincronizzare(deps.dati, deps.radiceClaude)
      try {
        const esito = await ripristinaStato({
          radici, maestra, magazzino: deps.magazzino(),
          ...(deps.emettiProgresso !== undefined ? { onProgresso: deps.emettiProgresso } : {})
        })
        if (!esito.trovato) return { ok: true, niente: true }
        if (esito.versione !== undefined) scriviStato({ ...leggiStato(), versione: esito.versione })
        return { ok: true, scritti: esito.scritti }
      } catch (e) {
        if (e instanceof CassaforteIlleggibile) {
          return { ok: false, messaggio: 'I dati sul Drive non si aprono con questa chiave (forse di un altro account).' }
        }
        return { ok: false, messaggio: messaggioDi(e) }
      }
    }
  }
}
