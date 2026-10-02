import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * La chiave di casa fra PC senza farla viaggiare (0.47.0).
 *
 * Regola di Nicholas (02/10): «un PC può vedere, comandare o aggiornare solo
 * i PC dello STESSO Drive di SierraDeck, cioè stesso account e stessa
 * cassaforte, provato dalla chiave di casa». Fino alla 0.46 il PC che bussava
 * mandava la chiave **in chiaro** a ogni indirizzo candidato — anche a quelli
 * che Tailscale trova per nome, che possono essere dispositivi della tailnet
 * che non sono SierraDeck — e prendeva per buono chiunque rispondesse 2xx o
 * 404. Adesso:
 *
 * 1. **Chi risponde prova di avere la chiave** prima di ricevere qualunque
 *    cosa: `GET /api/casa?sfida=<a caso>` → `prova = HMAC(chiave, sfida)`. Un
 *    PC di un'altra cassaforte, o un dispositivo qualunque, non sa farla.
 * 2. **Chi chiede firma ogni richiesta** (`x-sierradeck-casa`): ora, numero a
 *    caso, metodo e percorso sotto HMAC. La chiave non viaggia mai; una firma
 *    vecchia o ripetuta non vale.
 *
 * Con i PC prima della 0.47 (che non hanno `/api/casa`) si usa ancora la
 * chiave in chiaro, ma solo agli indirizzi del loro battito, mai a quelli
 * trovati per nome: vedi `pc-remoto.ts`.
 */

export const INTESTAZIONE_FIRMA = 'x-sierradeck-casa'
/** Quanto vale una firma: gli orologi di due PC di casa non sono mai lontani di più. */
export const FIRMA_VALE_MS = 5 * 60_000

const hmac = (chiave: string, testo: string): string => createHmac('sha256', chiave).update(testo).digest('base64url')

function uguali(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y)
}

export function nuovaSfida(): string {
  return randomBytes(18).toString('base64url')
}

/** La prova di chi risponde: solo chi ha la chiave di casa di quel PC sa farla. */
export function provaCasa(chiave: string, sfida: string): string {
  return hmac(chiave, `sierradeck-casa-risponde|${sfida}`)
}

export function provaValida(chiave: string, sfida: string, prova: unknown): boolean {
  return typeof prova === 'string' && sfida.length >= 16 && uguali(prova, provaCasa(chiave, sfida))
}

/** La firma di una richiesta: `<ms>.<numero a caso>.<hmac>`. */
export function firmaRichiesta(chiave: string, metodo: string, percorso: string, adesso = Date.now(), nonce = randomBytes(12).toString('base64url')): string {
  return `${adesso}.${nonce}.${hmac(chiave, `sierradeck-casa-chiede|${metodo.toUpperCase()}|${percorso}|${adesso}|${nonce}`)}`
}

/**
 * Il controllo di chi riceve. `visti` ricorda i numeri a caso già usati
 * (finché la firma varrebbe): una richiesta ripetuta da chi l'ha intercettata
 * non passa.
 */
export function creaControlloFirme(adesso: () => number = Date.now): (chiave: string | undefined, firma: string, metodo: string, percorso: string) => boolean {
  const visti = new Map<string, number>()
  return (chiave, firma, metodo, percorso) => {
    if (chiave === undefined || chiave === '') return false
    const [ms, nonce, mac, ...resto] = firma.split('.')
    if (ms === undefined || nonce === undefined || mac === undefined || resto.length > 0 || nonce.length < 8) return false
    const quando = Number(ms)
    const ora = adesso()
    if (!Number.isFinite(quando) || Math.abs(ora - quando) > FIRMA_VALE_MS) return false
    const atteso = hmac(chiave, `sierradeck-casa-chiede|${metodo.toUpperCase()}|${percorso}|${quando}|${nonce}`)
    if (!uguali(mac, atteso)) return false
    for (const [n, scade] of visti) if (scade < ora) visti.delete(n)
    if (visti.has(nonce)) return false
    visti.set(nonce, ora + 2 * FIRMA_VALE_MS)
    return true
  }
}
