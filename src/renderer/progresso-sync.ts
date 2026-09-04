/**
 * Come si racconta il progresso di un salvataggio o di un ripristino.
 *
 * Fuori dal componente perche' e' una regola di lettura, non di disegno: le
 * fasi di trasferimento contano i **byte** e si mostrano in MB — tranne
 * quando chi le emette dice che conta i **file**. La sincronizzazione
 * incrementale conta i file, e prima della 0.12.54 il pannello li divideva per
 * un milione: «Scarico dal Drive — 0,0 MB / 0,0 MB (7%)», con la barra che
 * avanzava e i MB fermi a zero.
 */
export type ProgressoSync = {
  fase: string
  fatto?: number
  totale?: number
  unita?: 'byte' | 'file'
}

export const ETICHETTA_FASE: Record<string, string> = {
  raccolgo: 'Raccolgo i file',
  comprimo: 'Comprimo',
  cifro: 'Cifro',
  carico: 'Carico sul Drive',
  scarico: 'Scarico dal Drive',
  decifro: 'Decifro',
  ripristino: 'Ripristino i file'
}

/** Le fasi che, se non dicono altro, contano byte. */
const IN_BYTE = new Set(['carico', 'scarico', 'cifro', 'decifro'])

export function descriviProgresso(p: ProgressoSync): { testo: string; perc: number | undefined } {
  const etichetta = ETICHETTA_FASE[p.fase] ?? p.fase
  const haQuota = p.totale !== undefined && p.fatto !== undefined && p.totale > 0
  if (!haQuota) return { testo: `${etichetta}…`, perc: undefined }
  const fatto = p.fatto as number
  const totale = p.totale as number
  const perc = Math.round((fatto / totale) * 100)
  const inByte = p.unita === 'byte' || (p.unita === undefined && IN_BYTE.has(p.fase))
  const quota = (n: number): string => (inByte ? `${(n / 1048576).toFixed(1)} MB` : String(n))
  const coda = p.unita === 'file' ? ' file' : ''
  return { testo: `${etichetta} — ${quota(fatto)} / ${quota(totale)}${coda} (${perc}%)`, perc }
}
