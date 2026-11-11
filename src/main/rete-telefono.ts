import { createHash } from 'node:crypto'
import { daReteLocale } from '@shared/rete-locale'

/**
 * Come il telefono ritrova questo PC senza VPN (k-50).
 *
 * Il server del Client ascolta già su tutte le interfacce, e il muro per rete
 * locale + gettone c'è già (`daReteLocale`, `autorizzata`): quello che mancava
 * era dire all'app **dove** bussare. Qui il PC le racconta i suoi indirizzi di
 * rete locale e quello Tailscale, e un'impronta con cui l'app si assicura, prima
 * di mandare la chiave, che dall'altra parte ci sia proprio questo PC.
 */

/**
 * Un'impronta stabile di questo PC, non reversibile: l'app la tiene per
 * riconoscerlo da qualunque indirizzo risponda, e il PC la mette in `/api/ciao`
 * e nell'annuncio in rete. Non è un segreto né una credenziale: serve solo a non
 * confondere due reti di casa che usano gli stessi numeri (192.168.1.x).
 */
export function improntaPc(idPc: string): string {
  return createHash('sha256').update('sierradeck-rete:' + idPc).digest('hex').slice(0, 16)
}

/** Un indirizzo che si può annunciare: IPv4 privato o Tailscale, mai pubblico né loopback. */
export function annunciabile(ip: string): boolean {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return false
  if (ip.startsWith('127.')) return false
  return daReteLocale(ip)
}

/** Tailscale e le VPN a maglia: 100.64.0.0/10. */
export function eTailscale(ip: string): boolean {
  const [a, b] = ip.split('.').map(Number)
  return a === 100 && b !== undefined && b >= 64 && b <= 127
}

export type IndirizziPc = {
  impronta: string
  porta: number
  /** Indirizzi completi (`http://ip:porta`): prima la rete di casa, in fondo Tailscale. */
  indirizzi: string[]
}

/** Un indirizzo con il suo tipo: l'app prova `casa` solo sul wifi, `tailscale` solo con la VPN accesa. */
export type IndirizzoConTipo = { indirizzo: string; tipo: 'casa' | 'tailscale' }

/**
 * Impronta e indirizzi come li vuole l'app nuova: in `/api/accoppia` (li impara
 * subito, senza un secondo giro) e sotto `pc` in `/api/stato` (li rilegge a
 * ogni cambio di rete del PC). `indirizzo` è completo: `http://<ip>:<porta>`.
 */
export function pcPerApp(rete: IndirizziPc | undefined): { impronta: string; indirizzi: IndirizzoConTipo[] } | undefined {
  if (rete === undefined || rete.impronta === '') return undefined
  return {
    impronta: rete.impronta,
    indirizzi: rete.indirizzi.map((indirizzo) => {
      const ip = indirizzo.replace(/^https?:\/\//, '').replace(/:\d+$/, '')
      return { indirizzo, tipo: eTailscale(ip) ? 'tailscale' as const : 'casa' as const }
    })
  }
}

/** Gli indirizzi da raccontare all'app, ordinati: la rete di casa prima della VPN. */
export function indirizziPerApp(ip: string[], porta: number, idPc: string): IndirizziPc {
  const buoni = [...new Set(ip.filter(annunciabile))]
  const ordinati = [...buoni.filter((i) => !eTailscale(i)), ...buoni.filter(eTailscale)]
  // Senza identità (il programma sta ancora partendo) niente impronta: quella
  // di un id vuoto sarebbe uguale su tutti i PC, e l'app li confonderebbe.
  return { impronta: idPc === '' ? '' : improntaPc(idPc), porta, indirizzi: ordinati.map((i) => `http://${i}:${porta}`) }
}
