import { gzipSync, gunzipSync } from 'node:zlib'

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

/** Un campo con la lunghezza (uint32 big-endian) davanti: così in lettura si sa dove finisce. */
function campo(byte: Buffer): Buffer {
  const testa = Buffer.allocUnsafe(4)
  testa.writeUInt32BE(byte.length, 0)
  return Buffer.concat([testa, byte])
}

/** Impacchetta le voci in un blocco compresso. `creatoIl` arriva da fuori (niente orologio qui). */
export function componiPacchetto(voci: Voce[], creatoIl: string): Buffer {
  const conta = Buffer.allocUnsafe(4)
  conta.writeUInt32BE(voci.length, 0)
  const pezzi: Buffer[] = [MAGIC, campo(Buffer.from(creatoIl, 'utf8')), conta]
  for (const v of voci) {
    pezzi.push(campo(Buffer.from(v.percorso, 'utf8')))
    pezzi.push(campo(v.contenuto))
  }
  return gzipSync(Buffer.concat(pezzi))
}

/**
 * Rilegge un pacchetto. `undefined` se il blocco non è un pacchetto valido —
 * corrotto, di una versione futura, o non nostro. Non solleva: chi ripristina
 * decide cosa fare di un pacchetto illeggibile, non lo scopre da un'eccezione.
 */
export function leggiPacchetto(blocco: Buffer): Pacchetto | undefined {
  let dati: Buffer
  try {
    dati = gunzipSync(blocco)
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
  if (pos + 4 > dati.length) return undefined
  const quante = dati.readUInt32BE(pos)
  pos += 4

  const voci: Voce[] = []
  for (let i = 0; i < quante; i++) {
    const percorsoB = leggiCampo()
    const contenuto = leggiCampo()
    if (percorsoB === undefined || contenuto === undefined) return undefined
    // Copia il contenuto: `subarray` è una vista sul buffer decompresso, e
    // tenerne viva una fetta terrebbe vivo tutto il blocco.
    voci.push({ percorso: percorsoB.toString('utf8'), contenuto: Buffer.from(contenuto) })
  }
  return { versione: 1, creatoIl: creatoIlB.toString('utf8'), voci }
}
