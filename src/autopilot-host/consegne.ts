/**
 * Quello che l'autopilota chiede alle chat di fare.
 *
 * Prima l'autopilota **eseguiva**: lanciava un `claude.exe` suo, headless, e di
 * tutto quel lavoro si vedeva un riassunto in una riga. Chi guardava non poteva
 * né seguire il ragionamento né mettere una parola.
 *
 * Adesso coordina. Le istruzioni le scrive **dentro le chat**, quelle vere del
 * mosaico, e sono loro a lavorare: si vede tutto quello che scrivono, si può
 * intervenire scrivendo a propria volta, e l'autopilota resta quello che decide
 * cosa fare dopo — non quello che lo fa.
 *
 * Il servizio però non può parlare al Gestore: è il Gestore a chiamare lui, e
 * fra i due c'è un confine di processo che va in una direzione sola. Quindi le
 * istruzioni si mettono qui, in una coda, e il Gestore le ritira quando passa.
 * È anche la ragione per cui questo modulo non sa niente né di finestre né di
 * terminali: da qui si dice *cosa* va consegnato, mai *come*.
 */

export type Consegna = {
  id: string
  autopilotaId: string
  /** Quale chat governata: con una flotta, ognuna ha il suo pezzo di lavoro. */
  chatId: string
  cwd: string
  /**
   * L'identificatore della sessione, deciso da noi.
   *
   * È ciò che permette al Gestore di aprire **quella** conversazione e non una
   * qualunque: se esiste già la riprende, se non esiste la crea con quest'id.
   */
  sessionId: string
  /** Il titolo del riquadro, quando va aperto. */
  titolo: string
  /** `chiudi` (0.82.0): chiude la chat finita, ferma al prompt; la conversazione resta. */
  cosa: 'scrivi' | 'interrompi' | 'chiudi'
  /** Il testo da scrivere nella chat. Vuoto per «interrompi» e «chiudi». */
  testo: string
  /**
   * Il workspace in cui la chat deve stare, deciso dall'autopilota.
   *
   * Da qui il Gestore sa dove andare **prima** di consegnare. Assente per gli
   * autopiloti nati senza: la chat nasce dove si sta guardando.
   */
  workspace?: string
  /**
   * Il perché della mossa (0.41.0): la decisione del supervisore che l'ha
   * fatta nascere. Non arriva nella chat: va nella linguetta «Istruzioni».
   */
  perche?: string
  /**
   * Da scrivere anche se la chat sta lavorando (0.69.0): messaggi in coda da più
   * di due minuti. Il Gestore non aspetta la fine del turno.
   */
  ancheAlLavoro?: boolean
  /** Nicholas ha chiesto che questa chat lavori in sottofondo, senza riquadro (0.72.0). */
  sottofondo?: boolean
}

/** Chi vuole sapere cosa succede alle consegne (0.41.0: la linguetta «Istruzioni»). */
export type OsservatoreConsegne = {
  messa?: (c: Consegna) => void
  confermata?: (id: string) => void
  /** Lasciata andare dopo `TENTATIVI_MAX`: non è mai arrivata. */
  persa?: (id: string) => void
  /**
   * Tolta dalla coda prima di essere ritirata, perché per la stessa chat ne è
   * arrivata una più nuova (0.57.1). I messaggi che portava non sono nella
   * nuova: devono tornare in coda, non sparire.
   */
  sostituita?: (id: string, da: string) => void
}

export type Consegne = {
  metti: (c: Omit<Consegna, 'id'>) => Consegna
  /**
   * Consegna quello che c'è, **senza svuotare**.
   *
   * Prima si svuotava qui, e la coda si fidava della rete: una risposta persa
   * per strada, il Gestore chiuso un istante dopo, o una consegna arrivata
   * quando non c'era nessuna finestra dove metterla, e l'istruzione spariva —
   * con l'autopilota fermo ad aspettare la risposta a un messaggio che nessuno
   * ha mai scritto. Adesso resta in coda finché chi l'ha presa non conferma.
   *
   * Il prezzo è che una consegna può arrivare **due volte** (presa, confermata
   * mai, riconsegnata): per questo ognuna ha un `id`, e chi la riceve scarta
   * quelli che ha già visto. Consegnare due volte si rimedia con una riga;
   * perdere un'istruzione no.
   */
  ritira: (adesso?: number) => Consegna[]
  /** «Sono arrivate»: solo adesso escono dalla coda. */
  conferma: (ids: string[]) => number
  /** Ritira e conferma in un colpo: comodo dove non c'è rete di mezzo. */
  preleva: () => Consegna[]
  inAttesa: () => number
  /** Toglie le consegne di un autopilota: fermarlo non deve lasciargli ordini in coda. */
  dimentica: (autopilotaId: string, chatId?: string) => void
}

/**
 * Oltre questo la coda non cresce: se il Gestore non ritira — perché è chiuso,
 * o perché non ha finestre — accumulare istruzioni all'infinito significherebbe
 * consegnargliene cento tutte insieme al ritorno, cioè scrivere cento messaggi
 * dentro una chat. Si tengono le più recenti, che sono quelle che contano.
 */
const TETTO = 50

/**
 * Quanto si aspetta una conferma prima di riconsegnare.
 *
 * Il Gestore passa ogni secondo e mezzo: senza questa attesa la stessa
 * istruzione gli arriverebbe tre o quattro volte prima ancora che abbia finito
 * di scriverla, e la deduplica dall'altra parte dovrebbe reggere da sola.
 */
export const RICONSEGNA_MS = 20_000

/**
 * Quante volte si riprova a consegnare la stessa cosa.
 *
 * Una consegna che non arriva mai — la chat non esiste più, la finestra non si
 * apre — resterebbe altrimenti in coda per sempre, riproposta ogni venti
 * secondi fino a spegnimento. Dopo qualche tentativo si lascia andare: è
 * un'istruzione persa, ma persa **rumorosamente**, che è tutt'altra cosa.
 */
export const TENTATIVI_MAX = 5

type InCoda = { consegna: Consegna; consegnataIl?: number; tentativi: number }

export function creaConsegne(
  osserva: OsservatoreConsegne = {},
  /**
   * Il numero da cui ripartire e dove ricordarlo (0.57.1). Prima ogni avvio del
   * servizio ripartiva da c-1: il Gestore, che ricorda gli id già scritti,
   * scambiava la c-3 nuova per la c-3 di prima e la confermava **senza
   * scriverla** — e il file c-3.md di prima veniva sovrascritto. Il 10/10 due
   * istruzioni sul portatile sono sparite così.
   */
  numeri: { primo?: number; ricorda?: (ultimo: number) => void } = {},
  /**
   * Dove tenere la coda (0.71.0). Prima stava solo in memoria: un'istruzione
   * messa e non ancora ritirata spariva con il servizio, e l'autopilota
   * aspettava la fine di un turno che nessuno aveva cominciato. Al ritorno le
   * consegne ripartono da capo (come mai ritirate): il Gestore scarta quelle
   * già scritte per chiave, quindi riconsegnare non le fa eseguire due volte.
   */
  disco: { leggi?: () => unknown; scrivi?: (coda: Consegna[]) => void } = {}
): Consegne {
  const avvisa = (f: (() => void) | undefined): void => { try { f?.() } catch (err) { console.error('[consegne] osservatore:', err) } }
  const coda: InCoda[] = []
  let prossimo = Math.max(0, Math.floor(numeri.primo ?? 0))
  const salva = (): void => { try { disco.scrivi?.(coda.map((x) => x.consegna)) } catch (err) { console.error('[consegne] coda non salvata:', err) } }
  try {
    const lette = disco.leggi?.()
    for (const c of Array.isArray(lette) ? lette : []) {
      if (typeof c !== 'object' || c === null) continue
      const x = c as Partial<Consegna>
      if (typeof x.id !== 'string' || typeof x.autopilotaId !== 'string' || typeof x.sessionId !== 'string' || typeof x.cwd !== 'string' || (x.cosa !== 'scrivi' && x.cosa !== 'interrompi' && x.cosa !== 'chiudi')) continue
      coda.push({ consegna: { chatId: '', titolo: '', testo: '', ...x } as Consegna, tentativi: 0 })
      // Il numero non torna indietro: c-N dopo il riavvio è sempre nuovo.
      const n = /^c-(\d+)$/.exec(x.id)?.[1]
      if (n !== undefined) prossimo = Math.max(prossimo, Number(n))
    }
    if (coda.length > 0) console.info(`[consegna] ${coda.length} consegne ritrovate dopo il riavvio: ripartono`)
  } catch (err) { console.error('[consegne] coda illeggibile, riparto senza:', err) }

  return {
    metti(c) {
      prossimo += 1
      try { numeri.ricorda?.(prossimo) } catch (err) { console.error('[consegne] numero non ricordato:', err) }
      const consegna: Consegna = { ...c, id: `c-${prossimo}` }
      // Una scrittura nuova per la stessa chat sostituisce quella non ancora
      // ritirata: sono istruzioni successive dello stesso ragionamento, e
      // consegnarle entrambe farebbe lavorare la chat su un ordine già
      // superato prima ancora di leggere quello buono.
      const vecchia = coda.findIndex(
        (x) => x.consegna.chatId === c.chatId
          && x.consegna.autopilotaId === c.autopilotaId
          && x.consegna.cosa === c.cosa
          // Già presa da una finestra (0.57.1): la sta scrivendo, non si toglie.
          && x.consegnataIl === undefined
      )
      if (vecchia !== -1) {
        const tolta = coda.splice(vecchia, 1)[0]
        if (tolta !== undefined) avvisa(osserva.sostituita === undefined ? undefined : () => osserva.sostituita?.(tolta.consegna.id, consegna.id))
      }
      coda.push({ consegna, tentativi: 0 })
      if (coda.length > TETTO) coda.splice(0, coda.length - TETTO)
      salva()
      avvisa(osserva.messa === undefined ? undefined : () => osserva.messa?.(consegna))
      return consegna
    },

    ritira(adesso = Date.now()) {
      const fuori: Consegna[] = []
      for (let i = coda.length - 1; i >= 0; i -= 1) {
        const riga = coda[i]
        if (riga === undefined) continue
        // Consegnata da poco e non ancora confermata: si aspetta. Chi l'ha
        // presa sta probabilmente ancora scrivendola dentro la chat.
        if (riga.consegnataIl !== undefined && adesso - riga.consegnataIl < RICONSEGNA_MS) continue
        if (riga.tentativi >= TENTATIVI_MAX) {
          console.warn(
            `[consegne] ${riga.consegna.id} lasciata andare dopo ${riga.tentativi} tentativi: ` +
            `nessuno l'ha confermata`
          )
          coda.splice(i, 1)
          salva()
          avvisa(osserva.persa === undefined ? undefined : () => osserva.persa?.(riga.consegna.id))
          continue
        }
        riga.consegnataIl = adesso
        riga.tentativi += 1
        fuori.unshift(riga.consegna)
      }
      return fuori
    },

    conferma(ids) {
      let tolte = 0
      for (let i = coda.length - 1; i >= 0; i -= 1) {
        const id = coda[i]?.consegna.id ?? ''
        if (!ids.includes(id)) continue
        coda.splice(i, 1)
        tolte += 1
        avvisa(osserva.confermata === undefined ? undefined : () => osserva.confermata?.(id))
      }
      if (tolte > 0) salva()
      return tolte
    },

    preleva() {
      const tutte = coda.map((x) => x.consegna)
      coda.length = 0
      salva()
      return tutte
    },

    // «chiudi» non conta: senza finestre aperte non c'è niente da chiudere, e
    // non si apre una finestra solo per chiuderne una chat (0.82.0).
    inAttesa: () => coda.filter((x) => x.consegna.cosa !== 'chiudi').length,

    dimentica(autopilotaId, chatId) {
      for (let i = coda.length - 1; i >= 0; i -= 1) {
        const c = coda[i]?.consegna
        if (c?.autopilotaId === autopilotaId && (chatId === undefined || c.chatId === chatId)) coda.splice(i, 1)
      }
      salva()
    }
  }
}
