import type { VoceErrore } from './storico-errori'

/**
 * «Errori arrivati» (0.81.0): sul PC di sviluppo, gli errori mandati dagli
 * altri PC, dalla pagina o dall'app fanno partire da soli un lavoro
 * dell'autopilota su SierraDeck. Qui la parte pura: quando partire, quando
 * no e perché, e cosa chiedere all'autopilota.
 */

/** Un file arrivato in `.sierradeck/errori-arrivati/<mittente>/`. */
export type ArrivoErrori = {
  /** Percorso del file. */
  file: string
  /** Chi l'ha mandato (il nome del PC). */
  da: string
  /** Quando è arrivato (ms). */
  arrivato: number
  voci: VoceErrore[]
}

/** Un lavoro avviato per degli arrivi: si ricorda per non avviarlo due volte. */
export type LavoroErrori = {
  autopilota: string
  file: string[]
  avviatoIl: string
  /** Messo quando il lavoro è finito (o fallito) e gli arrivi sono stati sistemati. */
  chiusoIl?: string
}

export type StatoLavoriErrori = {
  lavori: LavoroErrori[]
  /** Gli arrivi per cui si è già detto «non parto», con il motivo: si dice una volta sola. */
  nonPartiti?: { file: string[]; motivo: string }
}

/** Errori vicini nel tempo vanno in un lavoro solo: si aspetta che smettano di arrivare. */
export const ATTESA_ERRORI_VICINI_MS = 10 * 60_000

/** Gli stati di un autopilota che vogliono dire «c'è già un lavoro». */
const STATI_ATTIVI = new Set(['intervista', 'pronto', 'lavoro', 'attesa', 'sospeso'])

export type DecisioneErrori =
  | { azione: 'niente' }
  | { azione: 'aspetta'; finoA: number }
  | { azione: 'non-parte'; motivo: string; file: string[]; giaDetto: boolean }
  | { azione: 'avvia'; arrivi: ArrivoErrori[] }

const stessa = (a: string, b: string): boolean =>
  a.replace(/[\\/]+$/, '').replace(/\\/g, '/').toLowerCase() === b.replace(/[\\/]+$/, '').replace(/\\/g, '/').toLowerCase()

export function decidiLavoroErrori(p: {
  arrivi: readonly ArrivoErrori[]
  stato: StatoLavoriErrori
  /** La cartella di SierraDeck su questo PC. */
  radice: string
  autopiloti: ReadonlyArray<{ id: string; nome: string; stato: string; cwd: string; archiviato?: boolean }>
  /** Il freno dei limiti del piano: con «una» o «fermo» il piano è quasi finito. */
  freno: { livello: string; motivo: string }
  adesso: number
  attesaMs?: number
}): DecisioneErrori {
  const giaAvviati = new Set(p.stato.lavori.flatMap((l) => l.file))
  const nuovi = p.arrivi.filter((a) => !giaAvviati.has(a.file) && a.voci.length > 0)
  if (nuovi.length === 0) return { azione: 'niente' }
  const ultimo = Math.max(...nuovi.map((a) => a.arrivato))
  const finoA = ultimo + (p.attesaMs ?? ATTESA_ERRORI_VICINI_MS)
  if (p.adesso < finoA) return { azione: 'aspetta', finoA }
  const file = nuovi.map((a) => a.file).sort()
  const giaDetto = (motivo: string): boolean =>
    p.stato.nonPartiti?.motivo === motivo && p.stato.nonPartiti.file.length === file.length && p.stato.nonPartiti.file.every((f, i) => f === file[i])
  const occupato = p.autopiloti.find((a) => a.archiviato !== true && STATI_ATTIVI.has(a.stato) && stessa(a.cwd, p.radice))
  if (occupato !== undefined) {
    const motivo = `c’è già un lavoro su SierraDeck («${occupato.nome}»): gli errori arrivati aspettano che finisca`
    return { azione: 'non-parte', motivo, file, giaDetto: giaDetto(motivo) }
  }
  if (p.freno.livello === 'una' || p.freno.livello === 'fermo') {
    const motivo = `i limiti del piano sono quasi finiti (${p.freno.motivo}): gli errori arrivati aspettano`
    return { azione: 'non-parte', motivo, file, giaDetto: giaDetto(motivo) }
  }
  return { azione: 'avvia', arrivi: nuovi }
}

const DOVE: Record<string, string> = { pc: 'programma sul PC', servizio: 'servizio degli autopiloti', pagina: 'pagina del telefono', app: 'app Android' }

/** Il riassunto degli arrivi per l'obiettivo: chi, dove, quante volte, dove nel codice. */
export function elencoErrori(arrivi: readonly ArrivoErrori[], massimo = 30): string {
  const righe: string[] = []
  for (const a of arrivi) {
    for (const v of a.voci) {
      if (righe.length >= massimo) break
      const msg = v.messaggio.split('\n')[0]?.slice(0, 200) ?? ''
      righe.push(`- da «${a.da}», ${DOVE[v.dove] ?? v.dove}${v.versione !== undefined ? ` ${v.versione}` : ''}, ${v.volte} ${v.volte === 1 ? 'volta' : 'volte'}: ${msg}${v.punto !== undefined ? ` (${v.punto})` : ''}${v.cosa !== undefined ? ` — mentre: ${v.cosa.slice(0, 120)}` : ''}`)
    }
  }
  const tutte = arrivi.reduce((n, a) => n + a.voci.length, 0)
  if (tutte > righe.length) righe.push(`- … e altri ${tutte - righe.length}: sono nei file`)
  return righe.join('\n')
}

/** Il lavoro chiesto all'autopilota. Il riepilogo a Nicholas viene prima di qualunque modifica. */
export function lavoroPerErrori(arrivi: readonly ArrivoErrori[], quando: Date): { nome: string; obiettivo: string; criteri: Array<{ descrizione: string; comando?: string }> } {
  const giorno = `${String(quando.getDate()).padStart(2, '0')}/${String(quando.getMonth() + 1).padStart(2, '0')}`
  const file = arrivi.map((a) => `- ${a.file}`).join('\n')
  const obiettivo = [
    'Correggere gli errori arrivati a SierraDeck dagli altri PC, dalla pagina del telefono o dall’app.',
    '',
    'Errori:',
    elencoErrori(arrivi),
    '',
    'File con tutti i dettagli (non spostarli e non cancellarli: li mette nel recupero il programma quando il lavoro è finito):',
    file,
    '',
    'Come:',
    '1) PRIMA di modificare il codice, manda a Nicholas UN riepilogo con lo strumento AskUserQuestion (una domanda sola, così arriva una sola notifica): quali errori, da dove, se la causa è capita o no, cosa correggerai, quanto pesa il lavoro. Opzioni: «Procedi» e «Aspetta». Senza il suo «Procedi» non toccare il codice.',
    '2) Correggi ogni errore con il suo test, e fai passare il lavoro dalla Revisione.',
    '3) Pubblica una release patch: prima bozza, poi --draft=false; allega-apk solo se android/ è cambiato. Mai installarla.',
    '4) Scrivi nel rapporto quali errori hai corretto e in quale versione.',
    'Gli errori che non riesci a capire, dillo nel riepilogo invece di tirare a indovinare.'
  ].join('\n')
  return {
    nome: `Errori arrivati ${giorno}`,
    obiettivo,
    criteri: [
      { descrizione: 'Riepilogo mandato a Nicholas prima di toccare il codice, e lui ha detto «Procedi»' },
      { descrizione: 'Ogni errore corretto ha il suo test' },
      { descrizione: 'Release patch pubblicata, non bozza, mai installata' },
      { descrizione: 'I test del programma passano', comando: 'npx vitest run --maxWorkers=2' },
      { descrizione: 'Il TypeScript del programma compila senza errori', comando: 'npm run typecheck' }
    ]
  }
}
