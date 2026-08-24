import { createGzip, gunzip } from 'node:zlib'
import { once } from 'node:events'
import { promisify } from 'node:util'

// La decompressione la fa la versione asincrona (sul pool di libuv, non blocca).
const decomprimi = promisify(gunzip)

/**
 * Il pacchetto: tutto ciò che di un utente si porta da un PC all'altro, in un
 * blocco solo.
 *
 * È volutamente **generico**: un elenco di voci `percorso → contenuto`, non uno
 * schema rigido. Cosa ci vada dentro — le trascrizioni delle chat, il quaderno,
 * i workspace, le impostazioni — lo decide chi lo compone leggendo i file giusti;
 * qui si tiene solo il contenitore.
 *
 * Formato **binario**, non JSON. La prima versione impacchettava in JSON con i
 * contenuti in base64: elegante, ma costruiva **una sola stringa gigante** con
 * dentro tutto, e con molte trascrizioni si superava il limite massimo di una
 * stringa JavaScript (~512 MB) → «Invalid string length», e il salvataggio
 * falliva. Qui si concatenano Buffer con lunghezze davanti: nessuna stringa da
 * far crescere, nessun base64 (che gonfiava del 33%), e il tetto diventa quello
 * dei Buffer (ordine dei GB), non dei mezzo giga.
 *
 * Compresso (gzip) prima di cifrare, perché trascrizioni e note sono testo e si
 * stringono parecchio — e comprimere **dopo** aver cifrato non servirebbe (il
 * cifrato è incomprimibile).
 */

export type Voce = {
  /** Un percorso **relativo**, con `/` come separatore. Chi ripristina lo valida prima di scrivere. */
  percorso: string
  contenuto: Buffer
}

export type Pacchetto = {
  versione: 1
  /** Quando è stato composto, in ISO. Passato da fuori: il modulo non guarda l'orologio. */
  creatoIl: string
  voci: Voce[]
}

// Un marcatore che dice «questo è un pacchetto SierraDeck, versione 1»: leggerlo
// per primo scarta subito un blocco che non è nostro senza tentare di
// interpretarlo. La cifra è la versione del formato.
const MAGIC = Buffer.from('SDPK\x01', 'binary')

/** Una lunghezza uint32 big-endian, come intestazione di un campo. */
function testa(lung: number): Buffer {
  const b = Buffer.allocUnsafe(4)
  b.writeUInt32BE(lung, 0)
  return b
}

/**
 * Impacchetta le voci in un blocco compresso. `creatoIl` arriva da fuori.
 *
 * Scrive i dati **a flusso dentro la gzip**, un file alla volta, invece di
 * concatenare prima tutto in un unico buffer gigante: quel `Buffer.concat` era
 * sincrono e con centinaia di MB **bloccava** il processo per secondi. Qui ogni
 * `write` cede il controllo quando la gzip è piena (`drain`), così l'interfaccia
 * resta viva e i contenuti dei file non vengono nemmeno ricopiati.
 */
export async function componiPacchetto(
  voci: Iterable<Voce> | AsyncIterable<Voce>,
  creatoIl: string
): Promise<Buffer> {
  const gz = createGzip()
  const usciti: Buffer[] = []
  gz.on('data', (c: Buffer) => usciti.push(c))
  const finito = once(gz, 'end')

  // Scrive rispettando la contropressione: se il buffer della gzip è pieno,
  // aspetta che si svuoti — ed è lì che l'event loop respira.
  const scrivi = async (b: Buffer): Promise<void> => {
    if (!gz.write(b)) await once(gz, 'drain')
  }
  const scriviCampo = async (b: Buffer): Promise<void> => { await scrivi(testa(b.length)); await scrivi(b) }

  await scrivi(MAGIC)
  await scriviCampo(Buffer.from(creatoIl, 'utf8'))
  // Niente conteggio a monte: le voci arrivano **una alla volta** (anche da un
  // generatore che le legge pigramente dal disco), così non serve tenerle tutte
  // in memoria insieme. In lettura si va avanti finché il blocco finisce.
  for await (const v of voci as AsyncIterable<Voce>) {
    await scriviCampo(Buffer.from(v.percorso, 'utf8'))
    await scriviCampo(v.contenuto)
  }
  gz.end()
  await finito
  return Buffer.concat(usciti)
}

/**
 * Rilegge un pacchetto. `undefined` se il blocco non è un pacchetto valido —
 * corrotto, di una versione futura, o non nostro. Non solleva: chi ripristina
 * decide cosa fare di un pacchetto illeggibile, non lo scopre da un'eccezione.
 */
export async function leggiPacchetto(blocco: Buffer): Promise<Pacchetto | undefined> {
  let dati: Buffer
  try {
    dati = await decomprimi(blocco)
  } catch {
    return undefined
  }
  if (dati.length < MAGIC.length || !dati.subarray(0, MAGIC.length).equals(MAGIC)) return undefined

  let pos = MAGIC.length
  // Legge un campo lunghezza+byte, controllando di non uscire dal buffer: un
  // blocco corrotto non deve leggere memoria a caso, deve arrendersi.
  const leggiCampo = (): Buffer | undefined => {
    if (pos + 4 > dati.length) return undefined
    const lung = dati.readUInt32BE(pos)
    pos += 4
    if (pos + lung > dati.length) return undefined
    const b = dati.subarray(pos, pos + lung)
    pos += lung
    return b
  }

  const creatoIlB = leggiCampo()
  if (creatoIlB === undefined) return undefined

  // Si legge finché il blocco finisce: niente conteggio davanti (il pacchetto si
  // scrive in streaming e non lo conosce). Un campo troncato = blocco corrotto.
  const voci: Voce[] = []
  while (pos < dati.length) {
    const percorsoB = leggiCampo()
    const contenuto = leggiCampo()
    if (percorsoB === undefined || contenuto === undefined) return undefined
    // Copia il contenuto: `subarray` è una vista sul buffer decompresso, e
    // tenerne viva una fetta terrebbe vivo tutto il blocco.
    voci.push({ percorso: percorsoB.toString('utf8'), contenuto: Buffer.from(contenuto) })
  }
  return { versione: 1, creatoIl: creatoIlB.toString('utf8'), voci }
}
