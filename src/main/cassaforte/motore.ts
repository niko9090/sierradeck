import { cifra, decifra } from './cifratura'
import { componiPacchetto, leggiPacchetto } from './pacchetto'
import { raccogli, ripristina, type Radice } from './raccolta'
import { ConflittoMagazzino, type Magazzino } from './magazzino'

/**
 * Il motore: mette in fila cifratura, pacchetto, raccolta e magazzino nei due
 * gesti che contano — **caricare** il proprio stato, e **ripristinarlo** su
 * un'altra macchina.
 *
 * È volutamente **senza stato**: prende la chiave-maestra (già sbloccata dalla
 * passphrase, fuori di qui), le radici e il magazzino, e restituisce l'esito. La
 * *politica* — quando caricare (alla chiusura), quando ripristinare (all'accesso
 * su un PC nuovo) — non sta qui: sta sopra, dove c'è l'interfaccia. Così il
 * motore si prova per intero con un magazzino in memoria e due cartelle
 * temporanee, senza né cloud né login.
 *
 * **I conflitti affiorano, non si nascondono.** `caricaStato` passa al magazzino
 * l'ultima versione vista da questo PC; se un altro dispositivo ha caricato nel
 * frattempo, il magazzino solleva `ConflittoMagazzino` e il motore lo lascia
 * passare: sovrascrivere in silenzio il lavoro dell'altro PC sarebbe il difetto
 * peggiore. Chi chiama decide — riscaricare, fondere, riprovare.
 */

/**
 * A che punto è un caricamento o un ripristino, per l'interfaccia. Le fasi con
 * `fatto`/`totale` hanno una percentuale vera (leggere/scrivere file); le altre —
 * comprimere, cifrare, la rete — sono passaggi singoli, si mostrano come «in
 * corso», non come una barra che finge di avanzare.
 */
export type Progresso =
  | { fase: 'raccolgo'; fatto: number; totale: number }
  | { fase: 'comprimo'; fatto?: number; totale?: number; unita?: UnitaProgresso }
  | { fase: 'cifro'; fatto?: number; totale?: number; unita?: UnitaProgresso }
  | { fase: 'carico'; fatto?: number; totale?: number; unita?: UnitaProgresso }
  | { fase: 'scarico'; fatto?: number; totale?: number; unita?: UnitaProgresso }
  | { fase: 'decifro'; fatto?: number; totale?: number; unita?: UnitaProgresso }
  | { fase: 'ripristino'; fatto: number; totale: number }

/**
 * In cosa sono contati `fatto` e `totale`.
 *
 * Il blocco unico di prima contava i **byte**, e il pannello li mostrava in
 * MB. La sincronizzazione incrementale conta i **file** — un file alla volta,
 * cifrato e caricato — e usava le stesse fasi: il pannello divideva «3 di 40
 * file» per un milione e scriveva «0,0 MB / 0,0 MB» con la barra che
 * avanzava. Senza l'unita' non c'e' modo di distinguere i due casi.
 */
export type UnitaProgresso = 'byte' | 'file'

export type EsitoCarica = {
  /** La versione nuova sul magazzino: chi chiama la ricorda per il prossimo caricamento. */
  versione: string
  /** Quanti file sono stati impacchettati. */
  voci: number
}

export type EsitoRipristina = {
  /** `false` se questo account non ha ancora caricato niente: niente da ripristinare. */
  trovato: boolean
  scritti: number
  /** Voci saltate (prefisso ignoto o percorso non sicuro): un ripristino parziale ma detto. */
  saltati: string[]
  /** Quando era stato composto il pacchetto ripristinato, in ISO. */
  creatoIl: string
}

/** Sollevato quando lo scaricato non si decifra con questa maestra: dati corrotti o chiave che non combacia. */
export class CassaforteIlleggibile extends Error {
  constructor() {
    super('i dati della cassaforte non si decifrano con questa chiave: corrotti, o di un altro account')
    this.name = 'CassaforteIlleggibile'
  }
}

/**
 * Carica lo stato di questa macchina nel magazzino, cifrato.
 *
 * `versioneVista` è l'ultima versione che questo PC ha caricato/scaricato; su un
 * magazzino ancora vuoto è `undefined`. Se non combacia con ciò che c'è, il
 * magazzino solleva `ConflittoMagazzino` (che si lascia salire).
 */
export async function caricaStato(deps: {
  radici: Radice[]
  maestra: Buffer
  magazzino: Magazzino
  adesso: () => string
  versioneVista?: string
  /**
   * Se il magazzino ha una versione diversa da quella attesa e `sovrascrivi` è
   * vero, si carica lo stesso adottando la versione presente — invece di
   * sollevare `ConflittoMagazzino`. È la scelta esplicita «il salvataggio sul
   * Drive è mio e sporco (ho chiuso male l'app): buttalo, vale questo PC». Il
   * blocco già cifrato si riusa: niente doppio lavoro.
   */
  sovrascrivi?: boolean
  onProgresso?: (p: Progresso) => void
}): Promise<EsitoCarica> {
  const voci = await raccogli(deps.radici, (fatto, totale) => deps.onProgresso?.({ fase: 'raccolgo', fatto, totale }))
  deps.onProgresso?.({ fase: 'comprimo' })
  const pacchetto = await componiPacchetto(voci, deps.adesso())
  deps.onProgresso?.({ fase: 'cifro' })
  const cifrato = await cifra(
    deps.maestra, pacchetto,
    (fatto, totale) => deps.onProgresso?.({ fase: 'cifro', fatto, totale })
  )
  deps.onProgresso?.({ fase: 'carico' })
  const suProgresso = (fatto: number, totale: number): void => deps.onProgresso?.({ fase: 'carico', fatto, totale })
  try {
    const { versione } = await deps.magazzino.carica(cifrato, deps.versioneVista, suProgresso)
    return { versione, voci: voci.length }
  } catch (e) {
    if (deps.sovrascrivi === true && e instanceof ConflittoMagazzino) {
      // Riprova adottando la versione che c'è sul magazzino: sovrascrive.
      const { versione } = await deps.magazzino.carica(cifrato, e.versioneAttuale, suProgresso)
      return { versione, voci: voci.length }
    }
    throw e
  }
}

/**
 * Ripristina nel disco lo stato più recente del magazzino.
 *
 * Restituisce anche la versione ripristinata? No: la versione la dà `scarica` e
 * chi chiama la ricorda separatamente, così un ripristino non si porta dietro la
 * responsabilità di tracciare la versione. Qui si dice **cosa** è tornato.
 */
export async function ripristinaStato(deps: {
  radici: Radice[]
  maestra: Buffer
  magazzino: Magazzino
  onProgresso?: (p: Progresso) => void
}): Promise<EsitoRipristina & { versione?: string }> {
  deps.onProgresso?.({ fase: 'scarico' })
  const contenuto = await deps.magazzino.scarica(
    (fatto, totale) => deps.onProgresso?.({ fase: 'scarico', fatto, totale })
  )
  if (contenuto === undefined) {
    return { trovato: false, scritti: 0, saltati: [], creatoIl: '' }
  }
  deps.onProgresso?.({ fase: 'decifro' })
  const inChiaro = await decifra(
    deps.maestra, contenuto.blocco,
    (fatto, totale) => deps.onProgresso?.({ fase: 'decifro', fatto, totale })
  )
  if (inChiaro === undefined) throw new CassaforteIlleggibile()
  const pacchetto = await leggiPacchetto(inChiaro)
  if (pacchetto === undefined) throw new CassaforteIlleggibile()
  const { scritti, saltati } = await ripristina(
    pacchetto.voci, deps.radici,
    (fatto, totale) => deps.onProgresso?.({ fase: 'ripristino', fatto, totale })
  )
  return { trovato: true, scritti, saltati, creatoIl: pacchetto.creatoIl, versione: contenuto.versione }
}
