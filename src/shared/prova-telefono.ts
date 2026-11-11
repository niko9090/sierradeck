import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

/**
 * La prova che il PC dà al telefono **prima** di ricevere la sua chiave.
 *
 * Fino alla 0.100.0 l'app mandava la chiave (`x-sierradeck-chiave`) a
 * qualunque indirizzo rispondesse: bastava che il router ridesse a un altro
 * computer l'indirizzo di ieri, o che un indirizzo Tailscale finisse sulla rete
 * dell'operatore, perché la chiave arrivasse a chi non c'entrava. E quel
 * computer rispondeva 401: cinque di fila e l'app proponeva di rifare
 * l'accoppiamento con il PC sbagliato.
 *
 * Adesso il telefono chiede prima `GET /api/ciao?sfida=<a caso>&chi=<chi>`, e
 * manda la chiave solo se la `prova` torna. La prova la sa fare soltanto chi
 * tiene il **segno** di quella chiave, cioè il PC con cui il telefono si è
 * accoppiato:
 *
 * - `segno` = SHA-256(chiave), in esadecimale minuscolo. È quello che il PC
 *   scrive in `dispositivi.json` al posto della chiave (la chiave non la tiene).
 * - `chi`   = i primi 16 caratteri esadecimali di SHA-256("chi|" + segno).
 *   Dice al PC **quale** telefono chiede, senza dire né la chiave né il segno.
 *   Si ricava dal segno, non dalla chiave, perché il PC ha solo quello.
 * - `prova` = HMAC-SHA256(i 32 byte del segno, "ciao|" + sfida), esadecimale
 *   minuscolo.
 *
 * Cosa NON protegge: chi sta in mezzo e inoltra la sfida al PC vero ottiene una
 * prova buona. Il traffico è in chiaro: contro chi ascolta la rete serve
 * firmare ogni richiesta (o HTTPS), ed è un passo dopo. Questo chiude il caso
 * vero e frequente: la chiave mandata, per sbaglio, a un altro computer.
 *
 * Puro: gli stessi casi (`tests/fixtures/prova-telefono-casi.json`) li legge
 * anche l'app, così le due parti non divergono.
 */

/** La sfida: 32 byte a caso, 64 caratteri esadecimali minuscoli. */
export const SFIDA_VALIDA = /^[0-9a-f]{64}$/
/** Chi chiede: 16 caratteri esadecimali minuscoli. */
export const CHI_VALIDO = /^[0-9a-f]{16}$/
const SEGNO_VALIDO = /^[0-9a-f]{64}$/

/** Il segno di una chiave: lo stesso di `segnoDi` in `dispositivi.ts`. */
export function segnoDellaChiave(chiave: string): string {
  return createHash('sha256').update(chiave, 'utf8').digest('hex')
}

/** Chi chiede, dal segno della sua chiave. */
export function chiDelSegno(segno: string): string {
  return createHash('sha256').update(`chi|${segno}`, 'utf8').digest('hex').slice(0, 16)
}

/** Chi chiede, dalla chiave: è il conto che fa il telefono. */
export function chiDellaChiave(chiave: string): string {
  return chiDelSegno(segnoDellaChiave(chiave))
}

/** La prova di chi tiene il segno. `undefined` se segno o sfida non hanno la forma giusta. */
export function provaCiao(segno: string, sfida: string): string | undefined {
  if (!SEGNO_VALIDO.test(segno) || !SFIDA_VALIDA.test(sfida)) return undefined
  return createHmac('sha256', Buffer.from(segno, 'hex')).update(`ciao|${sfida}`, 'utf8').digest('hex')
}

/** Il controllo che fa il telefono (qui per i test e per chi bussa da un PC). */
export function provaCiaoValida(chiave: string, sfida: string, prova: unknown): boolean {
  if (typeof prova !== 'string') return false
  const attesa = provaCiao(segnoDellaChiave(chiave), sfida)
  if (attesa === undefined) return false
  const a = Buffer.from(prova)
  const b = Buffer.from(attesa)
  return a.length === b.length && timingSafeEqual(a, b)
}
