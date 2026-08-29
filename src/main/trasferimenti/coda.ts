import { randomBytes } from 'node:crypto'
import { basename, join } from 'node:path'
import { unisciRemoto } from './sftp'

/**
 * La coda dei trasferimenti: più file insieme, cartelle intere.
 *
 * Il pannello sa copiare **un** file per volta, ed è abbastanza per provare che
 * il collegamento funziona ma non per lavorarci: quello che si fa davvero con
 * un client SFTP è prendere una cartella e mandarla di là. La coda esiste per
 * quello, e le tre decisioni che la rendono usabile sono queste.
 *
 * ## Le cartelle si contano prima
 *
 * Quando accodi una cartella, viene **camminata** e trasformata nei suoi file,
 * uno per riga. Costa qualche secondo su un albero grosso — durante i quali la
 * coda dice «sto contando» — e in cambio dà l'unica cosa che rende un'attesa
 * sopportabile: sapere quanto manca. Una barra che avanza su un totale ignoto
 * non è un'informazione, è un'animazione.
 *
 * ## Un file per volta, per destinazione
 *
 * Su un solo canale SFTP le copie in parallelo non vanno più veloci: si
 * dividono la stessa banda e si rubano i turni, e quando una fallisce non si
 * capisce più quale. Server diversi invece camminano insieme, perché lì il
 * canale è un altro davvero.
 *
 * ## Un errore non ferma la fila
 *
 * Un file senza permessi in mezzo a cinquecento segna sé stesso e basta. È
 * quello che fa qualunque client serio, e la ragione è semplice: chi ha
 * lanciato una copia da mezz'ora vuole i 499 file, non un elenco vuoto e la
 * spiegazione del primo intoppo.
 */

export type Verso = 'giu' | 'su'
export type StatoLavoro = 'attesa' | 'corso' | 'fatto' | 'errore' | 'annullato'

export type Lavoro = {
  id: string
  /** La destinazione (il server) a cui questo trasferimento appartiene. */
  destinazione: string
  verso: Verso
  /** Il percorso sul server. */
  remoto: string
  /** Il percorso sul disco di questo computer. */
  locale: string
  /** Come si chiama nella coda: il pezzo di albero sotto la cartella accodata. */
  nome: string
  dimensione: number
  stato: StatoLavoro
  /** Byte già passati. */
  fatti: number
  errore?: string
}

/** Cosa si chiede di trasferire: un file o una cartella intera. */
export type Richiesta = {
  destinazione: string
  verso: Verso
  /** Il file o la cartella di partenza, percorso intero. */
  origine: string
  /** La **cartella** di arrivo, dall'altra parte. */
  arrivo: string
  cartella: boolean
}

export type VoceCamminata = {
  nome: string
  percorso: string
  cartella: boolean
  dimensione: number
}

/**
 * Quello che la coda deve saper fare col mondo di fuori.
 *
 * Sta come parametro e non come import per la ragione di sempre: la parte che
 * si sbaglia — l'ordine, cosa succede a un errore, come si conta una cartella —
 * si prova senza un server SSH acceso.
 */
export type MotoreCoda = {
  elencaRemoto: (destinazione: string, percorso: string) => Promise<VoceCamminata[]>
  elencaLocale: (percorso: string) => VoceCamminata[]
  scarica: (destinazione: string, remoto: string, locale: string, avanza: (fatti: number) => void) => Promise<void>
  carica: (destinazione: string, locale: string, remoto: string, avanza: (fatti: number) => void) => Promise<void>
  creaCartellaRemota: (destinazione: string, percorso: string) => Promise<void>
}

export type StatoCoda = {
  lavori: Lavoro[]
  /** Quante cartelle si stanno ancora camminando. */
  contando: number
}

export type Coda = {
  accoda: (richieste: Richiesta[]) => Promise<void>
  stato: () => StatoCoda
  /** Toglie dalla fila. Vedi la nota qui sotto: quello in corso finisce. */
  annulla: (id: string) => void
  annullaTutto: () => void
  /** Ripulisce le righe finite: quelle in errore restano finché non le togli tu. */
  pulisci: (ancheErrori: boolean) => void
  /** Rimette in fila un lavoro fallito. */
  riprova: (id: string) => void
}

/** Più giù di così un albero di progetto non va: è un ciclo di link. */
export const PROFONDITA_MASSIMA = 40

/** Ogni quanto si racconta l'avanzamento: più spesso è solo lavoro sprecato. */
export const PASSO_AVVISO_MS = 200

function nuovoId(): string {
  return randomBytes(6).toString('hex')
}

/** L'ultimo pezzo di un percorso remoto: `basename` qui non serve, le barre sono altre. */
function nomeRemoto(percorso: string): string {
  return percorso.split('/').filter((p) => p !== '').pop() ?? ''
}

export function creaCoda(motore: MotoreCoda, avvisa?: (stato: StatoCoda) => void): Coda {
  const lavori: Lavoro[] = []
  /** Le destinazioni che stanno già lavorando: una copia per volta ciascuna. */
  const attive = new Set<string>()
  let contando = 0
  let ultimoAvviso = 0

  const stato = (): StatoCoda => ({ lavori: lavori.map((l) => ({ ...l })), contando })

  /** Un cambiamento che si vede: arriva subito. */
  const racconta = (): void => {
    ultimoAvviso = Date.now()
    avvisa?.(stato())
  }

  /** L'avanzamento dei byte: a passi, o si passa il tempo a disegnare. */
  const raccontaPiano = (): void => {
    const adesso = Date.now()
    if (adesso - ultimoAvviso < PASSO_AVVISO_MS) return
    ultimoAvviso = adesso
    avvisa?.(stato())
  }

  /**
   * Cammina una cartella remota e ne tira fuori i file, col pezzo di percorso
   * che avranno sotto la cartella di arrivo.
   */
  const camminaRemoto = async (
    destinazione: string,
    radice: string,
    prefisso: string,
    profondita: number,
    dentro: { remoto: string; relativo: string; dimensione: number }[]
  ): Promise<void> => {
    if (profondita > PROFONDITA_MASSIMA) return
    const voci = await motore.elencaRemoto(destinazione, radice)
    for (const v of voci) {
      const relativo = prefisso === '' ? v.nome : `${prefisso}/${v.nome}`
      if (v.cartella) await camminaRemoto(destinazione, v.percorso, relativo, profondita + 1, dentro)
      else dentro.push({ remoto: v.percorso, relativo, dimensione: v.dimensione })
    }
  }

  const camminaLocale = (
    radice: string,
    prefisso: string,
    profondita: number,
    dentro: { locale: string; relativo: string; dimensione: number }[]
  ): void => {
    if (profondita > PROFONDITA_MASSIMA) return
    for (const v of motore.elencaLocale(radice)) {
      const relativo = prefisso === '' ? v.nome : `${prefisso}/${v.nome}`
      if (v.cartella) camminaLocale(v.percorso, relativo, profondita + 1, dentro)
      else dentro.push({ locale: v.percorso, relativo, dimensione: v.dimensione })
    }
  }

  const aggiungi = (l: Omit<Lavoro, 'id' | 'stato' | 'fatti'>): void => {
    lavori.push({ ...l, id: nuovoId(), stato: 'attesa', fatti: 0 })
  }

  /** La cartella locale che conterrà un file dell'albero. */
  const localeDi = (arrivo: string, relativo: string): string => join(arrivo, ...relativo.split('/'))

  /**
   * Caricare un file dentro una cartella che sul server non esiste ancora.
   *
   * Mandare su una cartella intera vuol dire ricostruirne l'albero dall'altra
   * parte: `mkdir` di una cartella che c'è già torna errore, e qui è un
   * risultato buono — non c'è modo di sapere prima quali dei mille rami
   * esistono, e chiederlo file per file raddoppierebbe le richieste per niente.
   */
  const caricaCreandoLaStrada = async (l: Lavoro): Promise<void> => {
    const pezzi = l.remoto.split('/').filter((p) => p !== '')
    pezzi.pop()
    let corrente = ''
    for (const p of pezzi) {
      corrente = unisciRemoto(corrente, p)
      try {
        await motore.creaCartellaRemota(l.destinazione, corrente)
      } catch {
        // Esiste già, quasi sempre. Se invece è un permesso negato lo dirà la
        // scrittura del file, con un messaggio che parla del file.
      }
    }
    await motore.carica(l.destinazione, l.locale, l.remoto, (fatti) => {
      l.fatti = fatti
      raccontaPiano()
    })
  }

  const pompa = (destinazione: string): void => {
    if (attive.has(destinazione)) return
    const prossimo = lavori.find((l) => l.destinazione === destinazione && l.stato === 'attesa')
    if (prossimo === undefined) return
    attive.add(destinazione)
    prossimo.stato = 'corso'
    prossimo.fatti = 0
    racconta()

    const finita = (): void => {
      attive.delete(destinazione)
      racconta()
      pompa(destinazione)
    }

    const lavoro =
      prossimo.verso === 'giu'
        ? motore.scarica(destinazione, prossimo.remoto, prossimo.locale, (fatti) => {
            prossimo.fatti = fatti
            raccontaPiano()
          })
        : caricaCreandoLaStrada(prossimo)

    lavoro.then(
      () => {
        prossimo.stato = 'fatto'
        prossimo.fatti = prossimo.dimensione
        finita()
      },
      (err: unknown) => {
        prossimo.stato = 'errore'
        prossimo.errore = err instanceof Error ? err.message : String(err)
        finita()
      }
    )
  }

  return {
    async accoda(richieste) {
      const destinazioni = new Set<string>()
      for (const r of richieste) {
        destinazioni.add(r.destinazione)
        if (!r.cartella) {
          const nome = r.verso === 'giu' ? nomeRemoto(r.origine) : basename(r.origine)
          aggiungi({
            destinazione: r.destinazione,
            verso: r.verso,
            remoto: r.verso === 'giu' ? r.origine : unisciRemoto(r.arrivo, nome),
            locale: r.verso === 'giu' ? join(r.arrivo, nome) : r.origine,
            nome,
            dimensione: 0
          })
          continue
        }
        contando += 1
        racconta()
        try {
          const radice = r.verso === 'giu' ? nomeRemoto(r.origine) : basename(r.origine)
          if (r.verso === 'giu') {
            const dentro: { remoto: string; relativo: string; dimensione: number }[] = []
            await camminaRemoto(r.destinazione, r.origine, radice, 0, dentro)
            for (const f of dentro) {
              aggiungi({
                destinazione: r.destinazione,
                verso: 'giu',
                remoto: f.remoto,
                locale: localeDi(r.arrivo, f.relativo),
                nome: f.relativo,
                dimensione: f.dimensione
              })
            }
          } else {
            const dentro: { locale: string; relativo: string; dimensione: number }[] = []
            camminaLocale(r.origine, radice, 0, dentro)
            for (const f of dentro) {
              aggiungi({
                destinazione: r.destinazione,
                verso: 'su',
                remoto: unisciRemoto(r.arrivo, f.relativo),
                locale: f.locale,
                nome: f.relativo,
                dimensione: f.dimensione
              })
            }
          }
        } finally {
          contando -= 1
        }
      }
      racconta()
      for (const d of destinazioni) pompa(d)
    },

    stato,

    /**
     * Si toglie dalla fila quello che non è ancora partito.
     *
     * Quello **in corso** finisce. Interrompere una copia a metà lascia sul
     * disco un file troncato che sembra buono, ed è un danno peggiore
     * dell'attesa di un file solo: è proprio il caso in cui poi si sovrascrive
     * l'originale con la metà.
     */
    annulla(id) {
      const l = lavori.find((x) => x.id === id)
      if (l === undefined || l.stato !== 'attesa') return
      l.stato = 'annullato'
      racconta()
    },

    annullaTutto() {
      for (const l of lavori) if (l.stato === 'attesa') l.stato = 'annullato'
      racconta()
    },

    pulisci(ancheErrori) {
      for (let i = lavori.length - 1; i >= 0; i -= 1) {
        const s = lavori[i]?.stato
        if (s === 'fatto' || s === 'annullato' || (ancheErrori && s === 'errore')) {
          lavori.splice(i, 1)
        }
      }
      racconta()
    },

    riprova(id) {
      const l = lavori.find((x) => x.id === id)
      if (l === undefined || (l.stato !== 'errore' && l.stato !== 'annullato')) return
      l.stato = 'attesa'
      l.fatti = 0
      delete l.errore
      racconta()
      pompa(l.destinazione)
    }
  }
}
