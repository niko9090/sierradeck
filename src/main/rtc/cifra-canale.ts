import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto'

/**
 * La cifratura del collegamento WebRTC fra due PC (0.40.0), con la **chiave
 * di casa**: quella che i due PC ricavano dalla stessa cassaforte
 * (`chiaveDiCasa('client-pc:<id di chi risponde>')`) e che sulla rete di casa
 * apre già il Client.
 *
 * Due usi, due chiavi derivate:
 * - **la segnalazione**: la descrizione SDP che viaggia sul Drive porta
 *   l'impronta del certificato DTLS di ognuno. Cifrata e autenticata con la
 *   chiave di casa, nessuno può sostituirla: chi non ha la cassaforte non
 *   può mettersi in mezzo, nemmeno avendo il Drive;
 * - **il canale**: ogni messaggio sul canale dati è cifrato una seconda volta
 *   (il WebRTC lo cifra già con DTLS). Ogni messaggio ha un numero che
 *   cresce: uno ripetuto si scarta. Il verso entra nell'autenticazione, così
 *   un messaggio non si può rimandare indietro a chi l'ha scritto.
 *
 * AES-256-GCM: `iv (12) | etichetta (16) | testo cifrato`, in base64url.
 */

const ALGORITMO = 'aes-256-gcm'

function deriva(chiaveDiCasa: string, sale: string, uso: string): Buffer {
  return Buffer.from(hkdfSync('sha256', Buffer.from(chiaveDiCasa, 'utf8'), Buffer.from(sale, 'utf8'), Buffer.from(`sierradeck-rtc-${uso}`, 'utf8'), 32))
}

function cifra(chiave: Buffer, chiaro: string, aad: string): string {
  const iv = randomBytes(12)
  const c = createCipheriv(ALGORITMO, chiave, iv)
  c.setAAD(Buffer.from(aad, 'utf8'))
  const corpo = Buffer.concat([c.update(chiaro, 'utf8'), c.final()])
  return Buffer.concat([iv, c.getAuthTag(), corpo]).toString('base64url')
}

function decifra(chiave: Buffer, testo: string, aad: string): string | undefined {
  try {
    const b = Buffer.from(testo, 'base64url')
    if (b.length < 29) return undefined
    const d = createDecipheriv(ALGORITMO, chiave, b.subarray(0, 12))
    d.setAAD(Buffer.from(aad, 'utf8'))
    d.setAuthTag(b.subarray(12, 28))
    return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8')
  } catch {
    return undefined
  }
}

/** La descrizione SDP per il Drive: legata al giro e al verso (chi → chi). */
export function cifraSegnale(chiaveDiCasa: string, giro: string, da: string, verso: string, sdp: string): string {
  return cifra(deriva(chiaveDiCasa, giro, 'segnale'), sdp, `${da}>${verso}`)
}

/** `undefined` se la chiave non è la stessa o il file è stato toccato. */
export function decifraSegnale(chiaveDiCasa: string, giro: string, da: string, verso: string, cifrato: string): string | undefined {
  return decifra(deriva(chiaveDiCasa, giro, 'segnale'), cifrato, `${da}>${verso}`)
}

export type Sigillo = {
  /** Cifra un messaggio in uscita, con il prossimo numero. */
  chiudi: (messaggio: Record<string, unknown>) => string
  /** Decifra un messaggio in entrata: `undefined` se non è autentico o è ripetuto. */
  apri: (testo: string) => Record<string, unknown> | undefined
}

/**
 * Il sigillo di un capo del canale. `ruolo` è chi sono io: `chiama` o
 * `risponde`; i messaggi in uscita portano il mio ruolo, quelli in entrata
 * devono portare l'altro.
 */
export function creaSigillo(chiaveDiCasa: string, giro: string, ruolo: 'chiama' | 'risponde'): Sigillo {
  const chiave = deriva(chiaveDiCasa, giro, 'canale')
  const altro = ruolo === 'chiama' ? 'risponde' : 'chiama'
  let mio = 0
  let suo = -1
  return {
    chiudi(messaggio) {
      mio += 1
      return cifra(chiave, JSON.stringify({ ...messaggio, n: mio }), `${giro}:${ruolo}`)
    },
    apri(testo) {
      const chiaro = decifra(chiave, testo, `${giro}:${altro}`)
      if (chiaro === undefined) return undefined
      try {
        const m = JSON.parse(chiaro) as Record<string, unknown>
        if (typeof m.n !== 'number' || m.n <= suo) return undefined
        suo = m.n
        return m
      } catch {
        return undefined
      }
    }
  }
}
