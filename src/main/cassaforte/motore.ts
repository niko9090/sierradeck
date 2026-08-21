import { cifra, decifra } from './cifratura'
import { componiPacchetto, leggiPacchetto } from './pacchetto'
import { raccogli, ripristina, type Radice } from './raccolta'
import type { Magazzino } from './magazzino'

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
}): Promise<EsitoCarica> {
  const voci = await raccogli(deps.radici)
  const cifrato = cifra(deps.maestra, componiPacchetto(voci, deps.adesso()))
  const { versione } = await deps.magazzino.carica(cifrato, deps.versioneVista)
  return { versione, voci: voci.length }
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
}): Promise<EsitoRipristina & { versione?: string }> {
  const contenuto = await deps.magazzino.scarica()
  if (contenuto === undefined) {
    return { trovato: false, scritti: 0, saltati: [], creatoIl: '' }
  }
  const inChiaro = decifra(deps.maestra, contenuto.blocco)
  if (inChiaro === undefined) throw new CassaforteIlleggibile()
  const pacchetto = leggiPacchetto(inChiaro)
  if (pacchetto === undefined) throw new CassaforteIlleggibile()
  const { scritti, saltati } = await ripristina(pacchetto.voci, deps.radici)
  return { trovato: true, scritti, saltati, creatoIl: pacchetto.creatoIl, versione: contenuto.versione }
}
