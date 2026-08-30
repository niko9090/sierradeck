import { randomBytes } from 'node:crypto'
import { mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import type { ArchivioDestinazioni, Destinazione, Segreto } from './destinazioni'
import { apriSessione, ImprontaSconosciuta, suRemoto, unisciRemoto, type GuscioRemoto, type Sessione } from './sftp'
import { creaCoda, type Coda, type Richiesta, type StatoCoda } from './coda'
import { creaModificheRemote, type FileInModifica, type ModificheRemote } from './modifica-remota'

/**
 * Le connessioni aperte, e i comandi che l'interfaccia può dare.
 *
 * Sta fra il pannello e il motore, e fa la cosa che nessuno dei due può fare da
 * solo: **tenere aperte le sessioni**. Aprire un canale SSH costa un secondo
 * abbondante fra scambio di chiavi e autenticazione, e sfogliare cartelle ne fa
 * una decina di richieste: riaprirlo ogni volta renderebbe il pannello
 * inutilizzabile senza che nessun errore lo spieghi.
 *
 * Si chiudono da sole dopo un po' che nessuno le usa. Un canale lasciato aperto
 * per sempre non resta aperto per sempre: lo chiude il server, per conto suo, e
 * quasi sempre nel momento in cui stavi per usarlo.
 */

export type Aperta = { sessione: Sessione; ultimoUso: number }

export type EsitoLocale = {
  percorso: string
  su?: string
  voci: { nome: string; percorso: string; cartella: boolean; dimensione: number; quando: number }[]
}

export type Trasferimenti = {
  destinazioni: (cwd: string) => Destinazione[]
  /**
   * Si collega, o dice cosa manca.
   *
   * `impronta` torna quando il server non è ancora fidato: non è un guasto, è
   * la domanda «sei tu?» che va fatta una volta sola per server.
   */
  collega: (id: string) => Promise<{ ok: boolean; impronta?: string; cambiata?: boolean; errore?: string }>
  fidati: (id: string, impronta: string) => void
  elencaRemoto: (id: string, percorso: string) => Promise<{ percorso: string; su: string; voci: unknown[] }>
  elencaLocale: (percorso: string) => EsitoLocale
  scarica: (id: string, remoto: string, cartellaLocale: string) => Promise<void>
  carica: (id: string, locale: string, cartellaRemota: string) => Promise<void>
  creaCartellaRemota: (id: string, percorso: string) => Promise<void>
  eliminaRemoto: (id: string, percorso: string, cartella: boolean) => Promise<void>
  rinominaRemoto: (id: string, da: string, a: string) => Promise<void>
  /** I permessi di un file sul server. `modo` e' il numero ottale di `chmod`. */
  permessiRemoti: (id: string, percorso: string, modo: number) => Promise<void>
  /**
   * Le stesse tre cose, ma di qua.
   *
   * Le due colonne devono comportarsi **identiche**: per chi le usa sono lo
   * stesso gesto fatto da due parti, e una differenza fra i due lati si paga
   * in dubbi ogni volta - «di la' si puo' rinominare, di qua non ricordo».
   * Erano gia' tutte e tre dalla parte del server, e mancavano da questa.
   */
  creaCartellaLocale: (percorso: string) => void
  eliminaLocale: (percorso: string) => void
  rinominaLocale: (da: string, a: string) => void
  /**
   * Apre un file del server nel programma con cui lo apriresti qui, e da quel
   * momento ogni salvataggio risale.
   *
   * E' la funzione per cui si tiene aperto un client SFTP tutto il giorno:
   * senza, cambiare una riga in un file di configurazione remoto sono cinque
   * passi, e i due in mezzo sono quelli in cui si sbaglia cartella.
   */
  apriInModifica: (id: string, remoto: string, nome: string) => Promise<FileInModifica>
  chiudiModifica: (id: string, remoto: string) => void
  modificheAperte: () => FileInModifica[]
  /**
   * Apre una shell sul server e torna il suo numero.
   *
   * E' l'altra meta' di FileZilla: sfogliare i file di un server e non poterci
   * dare un comando vuol dire aprire comunque un'altra finestra, che era
   * esattamente la cosa da togliere.
   */
  apriGuscio: (id: string, colonne: number, righe: number) => Promise<string>
  scriviGuscio: (guscio: string, testo: string) => void
  ridimensionaGuscio: (guscio: string, colonne: number, righe: number) => void
  chiudiGuscio: (guscio: string) => void
  /** Mette in coda file e cartelle: è la parte che si usa davvero. */
  accoda: (richieste: Richiesta[]) => Promise<void>
  statoCoda: () => StatoCoda
  annullaLavoro: (id: string) => void
  annullaCoda: () => void
  pulisciCoda: (ancheErrori: boolean) => void
  riprovaLavoro: (id: string) => void
  scollega: (id: string) => void
  /** Chiude tutto: si chiama quando il programma esce. */
  chiudiTutto: () => void
}

/** Dopo tanto che non la usi, una sessione si chiude da sola. */
export const INATTIVA_MS = 5 * 60_000

export function creaTrasferimenti(
  archivio: ArchivioDestinazioni,
  /** L'avanzamento di una copia, per la barra nel pannello. */
  avvisa?: (evento: { id: string; cosa: string; fatti: number; totale: number; finito?: boolean; errore?: string }) => void,
  /** Lo stato della coda, per la lista in fondo al pannello. */
  avvisaCoda?: (stato: StatoCoda) => void,
  /** Quello che il terminale remoto stampa, e quando si chiude. */
  avvisaGuscio?: (evento: { guscio: string; dati?: string; finito?: boolean }) => void,
  /**
   * Quello che serve per aprire un file remoto in un programma vero.
   *
   * Arriva da fuori perche' e' roba di Electron e del disco, e questo modulo
   * deve restare provabile senza avviare un'applicazione - la stessa regola
   * dell'archivio delle destinazioni, che si fa passare il cifratore.
   */
  modifiche?: {
    apriFuori: (locale: string) => Promise<void>
    cartellaDiLavoro: (destinazione: string, remoto: string) => string
    sorveglia: (cartella: string, nome: string, quando: () => void) => () => void
    impronta: (locale: string) => { dimensione: number; quando: number } | undefined
    cambiato?: (aperti: FileInModifica[]) => void
  }
): Trasferimenti {
  const aperte = new Map<string, Aperta>()
  /** I terminali aperti: `guscio -> destinazione`, piu' il canale. */
  const gusci = new Map<string, { destinazione: string; canale: GuscioRemoto }>()

  const potatura = setInterval(() => {
    const adesso = Date.now()
    for (const [id, a] of aperte) {
      if (adesso - a.ultimoUso < INATTIVA_MS) continue
      // Un terminale aperto **e'** un uso, anche se non passa un byte da
      // mezz'ora: chiuderlo sotto le mani di chi lo sta guardando sarebbe la
      // sessione che sparisce da sola mentre stai per scrivere un comando.
      if ([...gusci.values()].some((g) => g.destinazione === id)) { a.ultimoUso = adesso; continue }
      try { a.sessione.chiudi() } catch { /* già a terra */ }
      aperte.delete(id)
    }
  }, 60_000)
  // Un timer che tiene vivo il processo all'uscita è il modo classico di far
  // sembrare che il programma non si chiuda mai.
  potatura.unref?.()

  /**
   * Le aperture **in corso**, per non farne due dello stesso server.
   *
   * Aprire un canale SSH costa un secondo abbondante, e in quel secondo la mappa
   * `aperte` non contiene ancora niente: due chiamate vicine — la coda che
   * lavora mentre tu sfogli, che e' il caso normale — passavano tutt'e due il
   * controllo e aprivano **due sessioni**. La seconda sovrascriveva la prima
   * nella mappa, e la prima restava aperta e invisibile: la potatura non la
   * vedeva piu', e nemmeno `chiudiTutto`. Un canale per ogni doppia richiesta,
   * finche' il server non si stancava.
   */
  const inApertura = new Map<string, Promise<Sessione>>()

  const dammi = async (id: string): Promise<Sessione> => {
    const gia = aperte.get(id)
    if (gia !== undefined) {
      gia.ultimoUso = Date.now()
      return gia.sessione
    }
    const inCorso = inApertura.get(id)
    if (inCorso !== undefined) return inCorso

    const apertura = (async (): Promise<Sessione> => {
      const destinazione = archivio.trova(id)
      if (destinazione === undefined) throw new Error('destinazione sconosciuta')
      const segreto: Segreto = archivio.segretoDi(id)
      const sessione = await apriSessione(destinazione, segreto)
      aperte.set(id, { sessione, ultimoUso: Date.now() })
      return sessione
    })()
    inApertura.set(id, apertura)
    try {
      return await apertura
    } finally {
      // Anche quando fallisce: un'apertura andata male non deve restare a
      // rispondere «sto arrivando» a tutti i tentativi successivi.
      inApertura.delete(id)
    }
  }

  /**
   * Il lato locale del pannello.
   *
   * Sta qui e non nel renderer perché il renderer non ha il disco: è la stessa
   * ragione per cui le chiavi private non passano da una pagina web.
   */
  const elencaLocale = (percorso: string): EsitoLocale => {
    const su = dirname(percorso)
    const voci: EsitoLocale['voci'] = []
    let dentro: string[] = []
    try {
      dentro = readdirSync(percorso)
    } catch {
      return { percorso, ...(su !== percorso ? { su } : {}), voci: [] }
    }
    for (const nome of dentro) {
      const intero = join(percorso, nome)
      try {
        const st = statSync(intero)
        voci.push({
          nome,
          percorso: intero,
          cartella: st.isDirectory(),
          dimensione: st.size,
          quando: st.mtimeMs
        })
      } catch {
        // Un file che sparisce fra `readdir` e `stat` esiste davvero: un
        // compilatore che lavora nella stessa cartella lo fa di continuo.
      }
    }
    voci.sort((a, b) =>
      a.cartella !== b.cartella ? (a.cartella ? -1 : 1) : a.nome.localeCompare(b.nome, 'it')
    )
    return { percorso, ...(su !== percorso ? { su } : {}), voci }
  }

  const coda: Coda = creaCoda(
    {
      elencaRemoto: async (id, percorso) => (await (await dammi(id)).elenca(percorso)).voci,
      elencaLocale: (percorso) => elencaLocale(percorso).voci,
      scarica: async (id, remoto, locale, avanza) => {
        await (await dammi(id)).scarica(remoto, locale, (p) => avanza(p.fatti))
      },
      carica: async (id, locale, remoto, avanza) => {
        await (await dammi(id)).carica(locale, remoto, (p) => avanza(p.fatti))
      },
      creaCartellaRemota: async (id, percorso) => {
        await (await dammi(id)).creaCartella(percorso)
      }
    },
    avvisaCoda
  )

  /**
   * I file remoti aperti in modifica.
   *
   * Assente quando chi ci ha costruiti non ha passato il necessario - i test,
   * per esempio - e allora i tre comandi rispondono che non si puo', invece di
   * cadere.
   */
  const modificheRemote: ModificheRemote | undefined = modifiche === undefined
    ? undefined
    : creaModificheRemote({
      scarica: async (id, remoto, locale) => { await (await dammi(id)).scarica(remoto, locale) },
      carica: async (id, locale, remoto) => { await (await dammi(id)).carica(locale, remoto) },
      apriFuori: modifiche.apriFuori,
      cartellaDiLavoro: modifiche.cartellaDiLavoro,
      sorveglia: modifiche.sorveglia,
      impronta: modifiche.impronta,
      ...(modifiche.cambiato !== undefined ? { cambiato: modifiche.cambiato } : {})
    })

  return {
    destinazioni: (cwd) => archivio.perProgetto(cwd),

    apriInModifica(id, remoto, nome) {
      if (modificheRemote === undefined) {
        return Promise.reject(new Error('la modifica al volo non e disponibile'))
      }
      return modificheRemote.apri(id, remoto, nome)
    },
    chiudiModifica(id, remoto) { modificheRemote?.chiudi(id, remoto) },
    modificheAperte: () => modificheRemote?.aperti() ?? [],
    accoda: (richieste) => coda.accoda(richieste),
    statoCoda: () => coda.stato(),
    annullaLavoro: (id) => coda.annulla(id),
    annullaCoda: () => coda.annullaTutto(),
    pulisciCoda: (ancheErrori) => coda.pulisci(ancheErrori),
    riprovaLavoro: (id) => coda.riprova(id),

    async collega(id) {
      try {
        await dammi(id)
        return { ok: true }
      } catch (err) {
        if (err instanceof ImprontaSconosciuta) {
          return { ok: false, impronta: err.impronta, cambiata: err.cambiata }
        }
        return { ok: false, errore: err instanceof Error ? err.message : String(err) }
      }
    },

    fidati: (id, impronta) => archivio.fidatiDi(id, impronta),

    async elencaRemoto(id, percorso) {
      const s = await dammi(id)
      const dove = percorso.trim() === '' ? await s.casa() : percorso
      const elenco = await s.elenca(dove)
      return { percorso: elenco.percorso, su: suRemoto(elenco.percorso), voci: elenco.voci }
    },

    elencaLocale,

    async scarica(id, remoto, cartellaLocale) {
      const s = await dammi(id)
      const nome = remoto.split('/').filter((x) => x !== '').pop() ?? 'scaricato'
      const destinazione = join(cartellaLocale, nome)
      try {
        await s.scarica(remoto, destinazione, (p) =>
          avvisa?.({ id, cosa: nome, fatti: p.fatti, totale: p.totale }))
        avvisa?.({ id, cosa: nome, fatti: 1, totale: 1, finito: true })
      } catch (err) {
        avvisa?.({ id, cosa: nome, fatti: 0, totale: 0, finito: true, errore: String(err) })
        throw err
      }
    },

    async carica(id, locale, cartellaRemota) {
      const s = await dammi(id)
      const nome = basename(locale)
      try {
        await s.carica(locale, unisciRemoto(cartellaRemota, nome), (p) =>
          avvisa?.({ id, cosa: nome, fatti: p.fatti, totale: p.totale }))
        avvisa?.({ id, cosa: nome, fatti: 1, totale: 1, finito: true })
      } catch (err) {
        avvisa?.({ id, cosa: nome, fatti: 0, totale: 0, finito: true, errore: String(err) })
        throw err
      }
    },

    async apriGuscio(id, colonne, righe) {
      const s = await dammi(id)
      const numero = randomBytes(6).toString('hex')
      const canale = await s.guscio(
        colonne,
        righe,
        (dati) => avvisaGuscio?.({ guscio: numero, dati }),
        () => { gusci.delete(numero); avvisaGuscio?.({ guscio: numero, finito: true }) }
      )
      gusci.set(numero, { destinazione: id, canale })
      return numero
    },

    scriviGuscio(guscio, testo) {
      gusci.get(guscio)?.canale.scrivi(testo)
    },

    ridimensionaGuscio(guscio, colonne, righe) {
      gusci.get(guscio)?.canale.ridimensiona(colonne, righe)
    },

    chiudiGuscio(guscio) {
      const g = gusci.get(guscio)
      if (g === undefined) return
      gusci.delete(guscio)
      try { g.canale.chiudi() } catch { /* gia' a terra */ }
    },

    async creaCartellaRemota(id, percorso) {
      await (await dammi(id)).creaCartella(percorso)
    },

    async eliminaRemoto(id, percorso, cartella) {
      await (await dammi(id)).elimina(percorso, cartella)
    },

    async rinominaRemoto(id, da, a) {
      await (await dammi(id)).rinomina(da, a)
    },

    async permessiRemoti(id, percorso, modo) {
      await (await dammi(id)).permessi(percorso, modo)
    },

    creaCartellaLocale(percorso) {
      mkdirSync(percorso)
    },

    /**
     * Cancella, cartelle comprese.
     *
     * Qui `recursive` c'e' e dalla parte del server no, e non e' una svista.
     * Di la' una cancellazione ricorsiva dietro un tasto solo e' il disastro
     * che non si annulla: un percorso sbagliato su un server di produzione non
     * ha nessun cestino dietro. Di qua il disastro e' lo stesso ma il terreno
     * e' il tuo, il percorso e' quello che stai guardando, e senza `recursive`
     * una cartella non si potrebbe cancellare affatto - cioe' l'unica strada
     * sarebbe uscire dal programma e aprire Esplora risorse.
     */
    eliminaLocale(percorso) {
      rmSync(percorso, { recursive: true, force: false })
    },

    rinominaLocale(da, a) {
      renameSync(da, a)
    },

    scollega(id) {
      // I terminali di quel server se ne vanno con lui: la connessione sotto
      // sta per chiudersi, e lasciarli aperti darebbe riquadri vivi su un
      // canale morto — che non dicono niente e non si chiudono.
      for (const [numero, g] of [...gusci]) {
        if (g.destinazione !== id) continue
        gusci.delete(numero)
        try { g.canale.chiudi() } catch { /* gia' a terra */ }
        avvisaGuscio?.({ guscio: numero, finito: true })
      }
      const a = aperte.get(id)
      if (a === undefined) return
      try { a.sessione.chiudi() } catch { /* già a terra */ }
      aperte.delete(id)
    },

    chiudiTutto() {
      clearInterval(potatura)
      // I sorveglianti dei file aperti in modifica: ognuno tiene un handle sul
      // filesystem, e su un programma che sta giorni acceso se ne accumula uno
      // per ogni file mai aperto.
      modificheRemote?.chiudiTutto()
      for (const [, g] of gusci) {
        try { g.canale.chiudi() } catch { /* gia' a terra */ }
      }
      gusci.clear()
      for (const [, a] of aperte) {
        try { a.sessione.chiudi() } catch { /* già a terra */ }
      }
      aperte.clear()
    }
  }
}
