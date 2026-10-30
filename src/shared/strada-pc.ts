/**
 * Per quale strada si raggiunge un altro PC (0.40.0, ridotte nella 0.88.0).
 *
 * Due strade dirette, provate in quest'ordine:
 *
 * 1. **rete di casa**: l'indirizzo locale di quel PC risponde (la più veloce);
 * 2. **Tailscale**: un indirizzo 100.64/10 risponde.
 *
 * La 0.88.0 ha tolto il canale WebRTC e lo schermo che viaggiava nella
 * cassetta sul Drive: se nessuna delle due risponde, i messaggi aspettano
 * nella posta sul Drive (`manda-a-chat`, `posta`).
 *
 * Qui le regole pure: quale indirizzo preferire fra quelli che rispondono e
 * come raccontare la strada.
 */

import { eIndirizzoTailscale } from './pc-remoto'

export type Strada = 'lan' | 'tailscale' | 'drive'

/** L'ordine dei tentativi, deciso da Nicholas: dalla più veloce alla più lenta. */
export const ORDINE_STRADE: readonly Strada[] = ['lan', 'tailscale', 'drive']

/** La strada in uso verso un PC, come la mostra il riquadro. */
export type InfoStrada = {
  strada: Strada
  /** L'indirizzo, per la rete di casa e Tailscale. */
  indirizzo?: string
  /** Da quando si usa questa strada, ISO. */
  dal?: string
}

/** La strada diretta di un indirizzo: Tailscale (100.64/10) o rete di casa. */
export function stradaDiIndirizzo(indirizzo: string): 'lan' | 'tailscale' {
  return eIndirizzoTailscale(indirizzo) ? 'tailscale' : 'lan'
}

/**
 * Fra gli indirizzi che hanno risposto al bussare, quello da usare: prima la
 * rete di casa, poi Tailscale, rispettando l'ordine in cui sono arrivati
 * dentro lo stesso tipo. Il bussare va su tutti insieme, e Tailscale a volte
 * risponde prima della rete di casa: senza questa scelta si userebbe la
 * strada più lenta.
 */
export function indirizzoPreferito(rispondono: string[]): string | undefined {
  return rispondono.find((i) => stradaDiIndirizzo(i) === 'lan') ?? rispondono.find((i) => stradaDiIndirizzo(i) === 'tailscale')
}

/** La strada in due parole, per il telefono e la pagina («SU LAPTOP · Tailscale»). */
export function stradaBreve(s: Strada): string {
  return s === 'lan' ? 'rete di casa' : s === 'tailscale' ? 'Tailscale' : 'Drive, lento'
}

/**
 * Come si racconta la strada nel riquadro: una parola breve per la testata,
 * una frase per chi passa sopra con il mouse, e se è lenta.
 */
export function etichettaStrada(s: InfoStrada | undefined, nomePc: string): { breve: string; testo: string; lento: boolean } | undefined {
  if (s === undefined) return undefined
  if (s.strada === 'lan') {
    return {
      breve: `rete di casa${s.indirizzo !== undefined ? ` · ${s.indirizzo}` : ''}`,
      testo: `Collegato a ${nomePc} sulla rete di casa${s.indirizzo !== undefined ? ` (${s.indirizzo})` : ''}: la strada più veloce.`,
      lento: false
    }
  }
  if (s.strada === 'tailscale') {
    return {
      breve: `Tailscale${s.indirizzo !== undefined ? ` · ${s.indirizzo}` : ''}`,
      testo: `Collegato a ${nomePc} via Tailscale${s.indirizzo !== undefined ? ` (${s.indirizzo})` : ''}: la rete di casa non risponde, la rete privata di Tailscale sì.`,
      lento: false
    }
  }
  return {
    breve: 'collegamento lento via Drive',
    testo: `Collegamento lento via Drive: ${nomePc} non si raggiunge né in rete di casa né con Tailscale. I messaggi aspettano nella posta sul Drive, e ${nomePc} li consegna al suo prossimo giro.`,
    lento: true
  }
}
