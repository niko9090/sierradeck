import type { LavoroInCorso } from '../main/cassaforte/lavoro-in-corso'
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
  preparo: 'Preparo',
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

export const ETICHETTA_LAVORO_TIPO: Record<LavoroInCorso['tipo'], string> = {
  fusione: 'Fondo con il Drive',
  ripristino: 'Ripristino dal Drive',
  salvataggio: 'Salvo sul Drive'
}

/**
 * Un lavoro con il Drive raccontato per la striscia in alto e per il pannello:
 * cosa e', a che punto e', cosa sta facendo, e se si sta fermando.
 */
export function descriviLavoro(l: LavoroInCorso): { titolo: string; testo: string; perc: number | undefined; dettaglio?: string } {
  const { testo, perc } = descriviProgresso({
    fase: l.fase,
    ...(l.fatto !== undefined ? { fatto: l.fatto } : {}),
    ...(l.totale !== undefined ? { totale: l.totale } : {}),
    ...(l.unita !== undefined ? { unita: l.unita } : {})
  })
  return {
    titolo: ETICHETTA_LAVORO_TIPO[l.tipo],
    testo: l.annullamento ? `Mi fermo… (${testo})` : testo,
    perc,
    ...(l.dettaglio !== undefined ? { dettaglio: l.dettaglio } : {})
  }
}

/** Una durata detta in breve: 42s, 3m 10s, 1h 05m. */
export function durataBreve(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`
  const h = Math.floor(m / 60)
  return `${h}h ${String(m % 60).padStart(2, '0')}m`
}

/**
 * Quanto manca, a spanne: il ritmo tenuto finora sui file che restano.
 * Sotto tre file fatti non si azzarda niente: un ritmo su un file solo e'
 * una moneta lanciata.
 */
export function stimaResidua(l: LavoroInCorso, trascorsoMs: number): number | undefined {
  if (l.totale === undefined || l.fatto === undefined || l.totale <= 0 || l.fatto < 3) return undefined
  if (l.fatto >= l.totale) return 0
  return Math.round((trascorsoMs / l.fatto) * (l.totale - l.fatto))
}

export type PassoLavoro = { nome: string; spiegazione: string; stato: 'fatto' | 'corso' | 'dopo' }

/**
 * I passi di un lavoro con il Drive e a che punto e' ciascuno: tre per tutti
 * (preparazione, trasferimento, chiusura), con le parole del lavoro.
 */
export function passiDelLavoro(l: LavoroInCorso): PassoLavoro[] {
  const testi: Record<LavoroInCorso['tipo'], [string, string, string]> = {
    fusione: [
      'Leggo l’indice del Drive e l’elenco dei suoi file, e fondo workspace e registro dei progetti con quelli di qui.',
      'Porto sul Drive le voci scelte «sul Drive» e porto qui quelle scelte «qui», sei alla volta.',
      'Scrivo l’indice nuovo sul Drive e quello di questo PC. Poi riavvia SierraDeck per vedere le chat arrivate nei loro workspace.'
    ],
    salvataggio: [
      'Confronto i file di qui con l’indice del Drive per capire cosa è cambiato.',
      'Carico sul Drive solo i file cambiati, sei alla volta.',
      'Scrivo l’indice nuovo sul Drive e quello di questo PC.'
    ],
    ripristino: [
      'Leggo l’indice del Drive e confronto con i file di qui.',
      'Scarico dal Drive i file che qui mancano o sono più vecchi, sei alla volta.',
      'Scrivo i file sul disco e l’indice di questo PC. Poi riavvia SierraDeck per vedere le chat arrivate.'
    ]
  }
  const [t1, t2, t3] = testi[l.tipo]
  const inTrasferimento = l.fase !== 'preparo'
  const finito = inTrasferimento && l.totale !== undefined && l.totale > 0 && (l.fatto ?? 0) >= l.totale
  return [
    { nome: 'Preparazione', spiegazione: t1, stato: inTrasferimento ? 'fatto' : 'corso' },
    { nome: 'Trasferimento', spiegazione: t2, stato: !inTrasferimento ? 'dopo' : finito ? 'fatto' : 'corso' },
    { nome: 'Chiusura', spiegazione: t3, stato: finito ? 'corso' : 'dopo' }
  ]
}
