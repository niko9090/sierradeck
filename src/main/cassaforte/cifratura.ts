import {
  randomBytes,
  scryptSync,
  createCipheriv,
  createDecipheriv,
  timingSafeEqual
} from 'node:crypto'
import { setImmediate as cediControllo } from 'node:timers/promises'

/**
 * La cifratura end-to-end della cassaforte.
 *
 * Il modello è quello dei gestori di password, ed è deliberato: i dati di un
 * utente — chat, quaderno, workspace — contengono codice e a volte segreti, e la
 * piattaforma li custodisce senza poterli leggere. Chi tiene la cassaforte (il
 * provider, noi) vede solo blocchi cifrati; solo il PC dell'utente, dopo lo
 * sblocco, li decifra.
 *
 * **Chiave-maestra avvolta due volte.** Una chiave casuale (`master`) cifra i
 * dati. La `master` non deriva mai dalla passphrase: viene *avvolta* — cifrata —
 * con una chiave derivata dalla passphrase, e in parallelo con una derivata da
 * una **chiave di recupero** casuale. Così:
 *
 * - cambiare passphrase ri-avvolge la `master`, senza ri-cifrare i dati;
 * - chi perde la passphrase sblocca con la chiave di recupero;
 * - chi perde **entrambe** non recupera nulla, e nemmeno noi possiamo — è il
 *   prezzo, esplicito, del non poter leggere i dati altrui.
 *
 * Niente qui è di nostra invenzione: `scrypt` per derivare le chiavi dalle
 * parole (lento apposta, così un tentativo a forza bruta costa), `AES-256-GCM`
 * per cifrare **e** autenticare (un blocco manomesso non si decifra, si rifiuta).
 * Reinventare la crittografia è il modo classico di sbagliarla: qui si compongono
 * solo primitive standard di Node.
 */

/** La forma su disco/nel cloud: solo materiale non segreto (sali e chiavi avvolte). */
export type Cassaforte = {
  versione: 1
  /** Il sale della derivazione dalla passphrase, base64. Non è segreto. */
  sale: string
  /** Il sale della derivazione dalla chiave di recupero, base64. */
  saleRecupero: string
  /** La chiave-maestra avvolta con la passphrase (iv+tag+cifrato), base64. */
  maestraDaPassphrase: string
  /** La chiave-maestra avvolta con la chiave di recupero, base64. */
  maestraDaRecupero: string
}

/** Cosa esce quando si crea una cassaforte nuova. La `chiaveRecupero` si mostra UNA volta. */
export type NuovaCassaforte = {
  cassaforte: Cassaforte
  /** Da mostrare all'utente una sola volta, perché la conservi: non si può rileggere. */
  chiaveRecupero: string
  /** La chiave-maestra, in chiaro e solo in memoria: serve a cifrare/decifrare finché la sessione è sbloccata. */
  maestra: Buffer
}

const N = 32768 // 2^15: lento quanto basta a rendere caro un tentativo, non tanto da pesare all'accesso.
const R = 8
const P = 1
const MAXMEM = 96 * 1024 * 1024 // 128*N*r ≈ 33.5 MB: 96 MB tiene margine.
const LUNG_CHIAVE = 32 // AES-256.
const LUNG_IV = 12 // il nonce di GCM.
const LUNG_TAG = 16 // il tag di autenticazione di GCM.
const LUNG_SALE = 16
const LUNG_MAESTRA = 32
const LUNG_RECUPERO = 20 // 160 bit di entropia: più che sufficiente, e sta in un codice leggibile.

function deriva(parola: string, sale: Buffer): Buffer {
  return scryptSync(parola.normalize('NFKC'), sale, LUNG_CHIAVE, { N, r: R, p: P, maxmem: MAXMEM })
}

/**
 * Avvolge (cifra) dei byte con una chiave, in un blocco `iv+tag+cifrato`.
 *
 * Vale sia per la chiave-maestra (avvolta con la passphrase o col recupero) sia
 * per i dati veri: è la stessa AES-256-GCM, cambia solo cosa ci si mette dentro.
 */
function avvolgi(chiave: Buffer, dati: Buffer): Buffer {
  const iv = randomBytes(LUNG_IV)
  const cifratore = createCipheriv('aes-256-gcm', chiave, iv)
  const cifrato = Buffer.concat([cifratore.update(dati), cifratore.final()])
  const tag = cifratore.getAuthTag()
  return Buffer.concat([iv, tag, cifrato])
}

/**
 * Svolge (decifra) un blocco `iv+tag+cifrato`. `undefined` se la chiave è
 * sbagliata o il blocco è stato manomesso: GCM rifiuta, non indovina.
 */
function svolgi(chiave: Buffer, blocco: Buffer): Buffer | undefined {
  if (blocco.length < LUNG_IV + LUNG_TAG) return undefined
  const iv = blocco.subarray(0, LUNG_IV)
  const tag = blocco.subarray(LUNG_IV, LUNG_IV + LUNG_TAG)
  const cifrato = blocco.subarray(LUNG_IV + LUNG_TAG)
  try {
    const decifratore = createDecipheriv('aes-256-gcm', chiave, iv)
    decifratore.setAuthTag(tag)
    return Buffer.concat([decifratore.update(cifrato), decifratore.final()])
  } catch {
    return undefined
  }
}

/** Un codice di recupero leggibile: gruppi di lettere/numeri senza caratteri che si confondono. */
function formattaRecupero(byte: Buffer): string {
  // Base32 di Crockford (niente I, L, O, U): un codice che si può leggere ad alta
  // voce e ricopiare senza sbagliare.
  const alfabeto = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
  let bit = 0
  let valore = 0
  let fuori = ''
  for (const b of byte) {
    valore = (valore << 8) | b
    bit += 8
    while (bit >= 5) {
      bit -= 5
      fuori += alfabeto[(valore >>> bit) & 31]
    }
  }
  if (bit > 0) fuori += alfabeto[(valore << (5 - bit)) & 31]
  // A gruppi di quattro, con il trattino: si copia a occhio.
  return (fuori.match(/.{1,4}/g) ?? []).join('-')
}

function leggiRecupero(codice: string): Buffer | undefined {
  const alfabeto = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
  const pulito = codice.toUpperCase().replace(/[^0-9A-Z]/g, '')
  let bit = 0
  let valore = 0
  const byte: number[] = []
  for (const c of pulito) {
    const v = alfabeto.indexOf(c)
    if (v === -1) return undefined
    valore = (valore << 5) | v
    bit += 5
    if (bit >= 8) {
      bit -= 8
      byte.push((valore >>> bit) & 0xff)
    }
  }
  return Buffer.from(byte)
}

/**
 * Crea una cassaforte nuova: chiave-maestra e chiave di recupero casuali,
 * maestra avvolta con la passphrase e con il recupero.
 *
 * Restituisce anche la maestra in chiaro (la sessione nasce già sbloccata) e la
 * chiave di recupero da mostrare all'utente una volta sola.
 */
export function creaCassaforte(passphrase: string): NuovaCassaforte {
  const maestra = randomBytes(LUNG_MAESTRA)
  const sale = randomBytes(LUNG_SALE)
  const saleRecupero = randomBytes(LUNG_SALE)
  const byteRecupero = randomBytes(LUNG_RECUPERO)
  const chiaveRecupero = formattaRecupero(byteRecupero)

  const cassaforte: Cassaforte = {
    versione: 1,
    sale: sale.toString('base64'),
    saleRecupero: saleRecupero.toString('base64'),
    maestraDaPassphrase: avvolgi(deriva(passphrase, sale), maestra).toString('base64'),
    maestraDaRecupero: avvolgi(deriva(chiaveRecupero, saleRecupero), maestra).toString('base64')
  }
  return { cassaforte, chiaveRecupero, maestra }
}

/** Sblocca con la passphrase: restituisce la chiave-maestra, o `undefined` se è sbagliata. */
export function sblocca(cassaforte: Cassaforte, passphrase: string): Buffer | undefined {
  const sale = Buffer.from(cassaforte.sale, 'base64')
  return svolgi(deriva(passphrase, sale), Buffer.from(cassaforte.maestraDaPassphrase, 'base64'))
}

/** Sblocca con la chiave di recupero. Il codice si può scrivere come lo si è salvato, spazi e trattini compresi. */
export function sbloccaConRecupero(cassaforte: Cassaforte, chiaveRecupero: string): Buffer | undefined {
  const byte = leggiRecupero(chiaveRecupero)
  if (byte === undefined || byte.length === 0) return undefined
  const codice = formattaRecupero(byte)
  const sale = Buffer.from(cassaforte.saleRecupero, 'base64')
  return svolgi(deriva(codice, sale), Buffer.from(cassaforte.maestraDaRecupero, 'base64'))
}

/**
 * Cambia la passphrase: ri-avvolge la **stessa** chiave-maestra con la nuova
 * parola, con un sale nuovo. I dati non si toccano — restano cifrati con la
 * maestra, che non è cambiata. Il recupero resta valido.
 */
export function cambiaPassphrase(cassaforte: Cassaforte, maestra: Buffer, nuova: string): Cassaforte {
  const sale = randomBytes(LUNG_SALE)
  return {
    ...cassaforte,
    sale: sale.toString('base64'),
    maestraDaPassphrase: avvolgi(deriva(nuova, sale), maestra).toString('base64')
  }
}

/** Quanto AES si fa in un colpo prima di cedere il controllo: 4 MB tiene fluida la barra senza pesare. */
const PEZZO_AES = 4 * 1024 * 1024

/**
 * Cifra dei dati con la chiave-maestra, **a pezzi e cedendo il controllo**.
 *
 * `avvolgi` (sincrono) va bene per la chiave-maestra, che è piccola; ma i dati
 * veri possono essere centinaia di MB, e cifrarli in un unico `update` sincrono
 * **bloccava** il processo. Qui si procede a blocchi da 4 MB, restituendo il
 * controllo all'event loop fra uno e l'altro: l'app resta viva e mostra il
 * progresso. Il formato è identico (`iv+tag+cifrato`), così `decifra` non cambia
 * logica.
 */
export async function cifra(
  maestra: Buffer, dati: Buffer, onProgresso?: (fatto: number, totale: number) => void
): Promise<Buffer> {
  const iv = randomBytes(LUNG_IV)
  const cifratore = createCipheriv('aes-256-gcm', maestra, iv)
  const pezzi: Buffer[] = []
  let off = 0
  while (off < dati.length) {
    const fine = Math.min(off + PEZZO_AES, dati.length)
    pezzi.push(cifratore.update(dati.subarray(off, fine)))
    off = fine
    onProgresso?.(off, dati.length)
    await cediControllo()
  }
  pezzi.push(cifratore.final())
  const tag = cifratore.getAuthTag()
  return Buffer.concat([iv, tag, ...pezzi])
}

/** Decifra un blocco con la chiave-maestra, a pezzi. `undefined` se manomesso o con la chiave sbagliata. */
export async function decifra(
  maestra: Buffer, blocco: Buffer, onProgresso?: (fatto: number, totale: number) => void
): Promise<Buffer | undefined> {
  if (blocco.length < LUNG_IV + LUNG_TAG) return undefined
  const iv = blocco.subarray(0, LUNG_IV)
  const tag = blocco.subarray(LUNG_IV, LUNG_IV + LUNG_TAG)
  const cifrato = blocco.subarray(LUNG_IV + LUNG_TAG)
  try {
    const decifratore = createDecipheriv('aes-256-gcm', maestra, iv)
    decifratore.setAuthTag(tag)
    const pezzi: Buffer[] = []
    let off = 0
    while (off < cifrato.length) {
      const fine = Math.min(off + PEZZO_AES, cifrato.length)
      pezzi.push(decifratore.update(cifrato.subarray(off, fine)))
      off = fine
      onProgresso?.(off, cifrato.length)
      await cediControllo()
    }
    pezzi.push(decifratore.final()) // solleva se il tag non combacia (dati manomessi o chiave sbagliata)
    return Buffer.concat(pezzi)
  } catch {
    return undefined
  }
}

/** Vero se due chiavi-maestra sono la stessa, in tempo costante: per i test e per i controlli di coerenza. */
export function stessaMaestra(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b)
}
