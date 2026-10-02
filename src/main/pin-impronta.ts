import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import type { ImprontaPin } from '@shared/pin-chat'

/**
 * L'impronta del PIN delle chat (0.49.0): scrypt con un sale a caso. Il PIN
 * non si salva mai, né in chiaro né cifrato in modo reversibile; si confronta
 * l'impronta a tempo costante. Con quattro cifre l'impronta da sola si
 * indovina in fretta da chi ha il file: per questo il vero freno sono le
 * attese crescenti dopo i tentativi sbagliati (src/shared/pin-chat.ts), e il
 * pannello dice cosa il PIN protegge e cosa no.
 */
const N = 16384
const R = 8
const P = 1
const LUNG = 32

export function improntaPin(pin: string, sale: Buffer = randomBytes(16)): ImprontaPin {
  return { algo: 'scrypt', N, r: R, p: P, sale: sale.toString('base64'), hash: scryptSync(pin, sale, LUNG, { N, r: R, p: P }).toString('base64') }
}

export function verificaPin(pin: string, i: ImprontaPin | undefined): boolean {
  if (i === undefined || i.algo !== 'scrypt') return false
  let atteso: Buffer
  let calcolato: Buffer
  try {
    atteso = Buffer.from(i.hash, 'base64')
    calcolato = scryptSync(pin, Buffer.from(i.sale, 'base64'), atteso.length || LUNG, { N: i.N, r: i.r, p: i.p, maxmem: 64 * 1024 * 1024 })
  } catch {
    return false
  }
  return atteso.length > 0 && atteso.length === calcolato.length && timingSafeEqual(atteso, calcolato)
}
