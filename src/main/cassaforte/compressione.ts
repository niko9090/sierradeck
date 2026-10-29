import { gunzipSync, gzipSync } from 'node:zlib'

/**
 * Le chat compresse sul Drive (0.69.0). «Perché occupiamo così tanto sul
 * Drive?» (Nicholas, 12/10): le chat sono 4,5 GB su 6,4, e una trascrizione
 * (JSONL) misurata sulle chat vere si riduce a meno della metà (2,3 volte). Si comprime **prima** di cifrare (dopo, i
 * byte cifrati non si comprimono più).
 *
 * Un segno in testa dice che il contenuto è compresso: chi legge riconosce le
 * due forme, così i file di prima restano leggibili e uno compresso non viene
 * mai scritto così com'è dentro una chat. Comprimere si accende solo quando
 * tutti i PC visti sanno leggere (vedi `compressioneAccesa`).
 */
export const SEGNO = Buffer.from('SDZ1\0', 'latin1')

export function impacchetta(contenuto: Buffer): Buffer {
  return Buffer.concat([SEGNO, gzipSync(contenuto, { level: 6 })])
}

/** Il contenuto in chiaro: scompresso se ha il segno, così com'è se no. */
export function spacchetta(b: Buffer): Buffer
export function spacchetta(b: Buffer | undefined): Buffer | undefined
export function spacchetta(b: Buffer | undefined): Buffer | undefined {
  if (b === undefined) return undefined
  if (b.length >= SEGNO.length && b.subarray(0, SEGNO.length).equals(SEGNO)) return gunzipSync(b.subarray(SEGNO.length))
  return b
}

/** Quali file si comprimono: le chat (le trascrizioni). I file dei progetti restano come sono. */
export function daComprimere(percorso: string): boolean {
  return percorso.startsWith('chat/') && percorso.endsWith('.jsonl')
}

/**
 * Si comprime solo se ogni PC visto nei battiti ha una versione che sa leggere
 * (0.69.0 o più): un PC più vecchio scaricherebbe una chat compressa e la
 * scriverebbe così, rovinandola.
 */
export function compressioneAccesa(versioniAltri: string[], minima = '0.69.0'): boolean {
  const n = (v: string): number[] => v.split('.').map((x) => Number.parseInt(x, 10) || 0)
  const m = n(minima)
  return versioniAltri.every((v) => {
    const a = n(v)
    for (let i = 0; i < 3; i += 1) { if ((a[i] ?? 0) !== (m[i] ?? 0)) return (a[i] ?? 0) > (m[i] ?? 0) }
    return true
  })
}
