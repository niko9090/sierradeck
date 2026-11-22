/**
 * **I dati del pannello a destra, per ogni agente al lavoro** (k-176b, 22/11).
 *
 * Il pannello (interfaccia: k-176a) mostra per ogni agente: su che PC gira, quali
 * file sta modificando, cosa sta facendo, quanti token ha consumato e, per un
 * agente di un altro PC che ha finito, che sta rimandando il ramo. Tutto arriva
 * dallo stesso canale di «Al lavoro adesso» (`VistaAttesa`): ogni voce di
 * `alLavoro` porta il suo {@link DatiPannelloAgente} in `pannello`, e la vista
 * porta i contatori del workspace in `pannelloTotali`. Una sola fonte: chi
 * disegna la testa della chat e chi disegna il pannello leggono la stessa lista.
 *
 * Qui solo tipi e funzioni pure (niente disco, niente git). **Estendibile**: ogni
 * campo nuovo (unioni, durata, consumo per PC: k-176h) è facoltativo, così i client
 * vecchi lo ignorano e le voci vecchie restano valide.
 */

/** Quanti file al più si portano per agente: il resto si dice con `fileAltri`. */
export const FILE_PANNELLO_MAX = 12
/** Quanti file al più si ricordano per specialista nel flusso. */
export const FILE_RICORDATI_MAX = 200

/** Da dove vengono i file: le chiamate dell'agente, quanto manda l'altro PC, il diff del ramo tornato. */
export type OrigineFile = 'chiamate' | 'remoto' | 'diff-ramo'

/** Dove gira un agente. */
export type PcAgente = {
  /** Gira su questo PC. */
  questoPc: boolean
  /** Il nome dell'altro PC (Aiuta la rete), quando non è questo. Mai il nome di questo PC. */
  nome?: string
  /** Gira qui ma lavora per un altro PC (lavoro ospitato): il nome di quel PC. */
  perConto?: string
}

/** Cosa fa, in italiano semplice. */
export type AzioneAgente = {
  /** Il titolo del compito, breve. */
  titolo: string
  /** L'ultima azione, in una riga; assente se non si sa. */
  ultima?: string
}

/** Token consumati da un agente (somma di ingresso, uscita e cache, come li conta la CLI). */
export type TokenAgente = { totale: number }

/**
 * La fase di invio di un agente di un altro PC che ha finito: `invio` = sta rimandando
 * il ramo («Invio dati – fine lavori»). Dura finché il ramo non è arrivato qui.
 */
export type FaseInvio = 'invio'

export type DatiPannelloAgente = {
  pc: PcAgente
  /** I file che modifica (percorsi relativi al progetto, in ordine di prima modifica), al più {@link FILE_PANNELLO_MAX}. */
  file: string[]
  /** Quanti altri file oltre a quelli elencati. */
  fileAltri?: number
  /** Da dove vengono i file; assente se non se ne conosce nessuno. */
  origineFile?: OrigineFile
  azione: AzioneAgente
  /** Assente se non si sa (una chat adottata non ha un conto proprio). */
  token?: TokenAgente
  /** «Invio dati – fine lavori»: solo per un agente di un altro PC che ha finito e rimanda il ramo. */
  invio?: FaseInvio
}

/** I contatori del workspace, accanto all'elenco degli agenti. */
export type TotaliPannello = {
  /** Token del workspace: turni dell'orchestratore ricordati più gli specialisti noti. */
  tokenTotali: number
  /** Token di oggi (giorno di calendario del programma). */
  tokenOggi: number
}

const STRUMENTI_FILE: readonly string[] = ['Edit', 'Write', 'MultiEdit']

/** Il file che una chiamata a Edit, Write o MultiEdit modifica; niente per gli altri strumenti. */
export function fileDaChiamata(nome: string, input: unknown): string | undefined {
  if (!STRUMENTI_FILE.includes(nome)) return undefined
  if (typeof input !== 'object' || input === null) return undefined
  const f = (input as Record<string, unknown>).file_path
  return typeof f === 'string' && f.trim() !== '' ? f.trim() : undefined
}

const barre = (p: string): string => p.replace(/\\/gu, '/')

/** Il percorso relativo a una delle radici (la copia dell'agente, il progetto); fuori da tutte resta com'è, con le barre dritte. */
export function percorsoRelativo(file: string, radici: readonly (string | undefined)[]): string {
  const f = barre(file)
  const minuscolo = f.toLowerCase()
  for (const r of radici) {
    if (r === undefined || r.trim() === '') continue
    const base = barre(r).replace(/\/+$/u, '')
    if (base !== '' && minuscolo.startsWith(`${base.toLowerCase()}/`)) return f.slice(base.length + 1)
  }
  return f
}

/** Aggiunge un file all'elenco, una volta sola e senza passare {@link FILE_RICORDATI_MAX}. */
export function aggiungiFile(elenco: readonly string[] | undefined, file: string): string[] {
  const prima = elenco ?? []
  if (prima.includes(file) || prima.length >= FILE_RICORDATI_MAX) return [...prima]
  return [...prima, file]
}

/** I nomi dei file dall'uscita di `git diff --name-only` (o `--name-status`: si prende l'ultimo pezzo di ogni riga). */
export function fileDalDiff(testo: string): string[] {
  const visti = new Set<string>()
  for (const riga of testo.split(/\r?\n/u)) {
    const r = riga.trim()
    if (r === '') continue
    const nome = (r.split('\t').pop() ?? r).trim()
    if (nome !== '') visti.add(nome)
  }
  return [...visti]
}

/** I file come li mostra il pannello: i primi, e quanti altri. */
export function fileDelPannello(file: readonly string[]): { file: string[]; fileAltri?: number } {
  const primi = file.slice(0, FILE_PANNELLO_MAX)
  return { file: primi, ...(file.length > primi.length ? { fileAltri: file.length - primi.length } : {}) }
}

/** I token di un `usage` della CLI: ingresso, uscita e cache insieme. */
export function tokenDaUso(uso: unknown): number {
  if (typeof uso !== 'object' || uso === null) return 0
  const u = uso as Record<string, unknown>
  const n = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) && x > 0 ? x : 0)
  const totale = n(u.total_tokens)
  return totale > 0 ? totale : n(u.input_tokens) + n(u.output_tokens) + n(u.cache_read_input_tokens) + n(u.cache_creation_input_tokens)
}

export type OrigineDati = {
  /** Gira su un altro PC (Aiuta la rete): il suo nome. */
  suPc?: string
  /** Gira qui per conto di un altro PC: il nome di quel PC. */
  perPc?: string
  titolo: string
  ultimaAzione?: string
  /** I file noti, già relativi. */
  file?: readonly string[]
  origineFile?: OrigineFile
  token?: number
  /** Ha finito e il ramo non è ancora arrivato qui. */
  inInvio?: boolean
}

/** Compone i dati del pannello di un agente da quello che il programma sa di lui. */
export function datiPannello(o: OrigineDati): DatiPannelloAgente {
  const file = o.file ?? []
  return {
    pc: {
      questoPc: o.suPc === undefined,
      ...(o.suPc !== undefined ? { nome: o.suPc } : {}),
      ...(o.perPc !== undefined ? { perConto: o.perPc } : {})
    },
    ...fileDelPannello(file),
    ...(file.length > 0 && o.origineFile !== undefined ? { origineFile: o.origineFile } : {}),
    azione: { titolo: o.titolo, ...(o.ultimaAzione !== undefined && o.ultimaAzione !== '' ? { ultima: o.ultimaAzione } : {}) },
    ...(o.token !== undefined && o.token > 0 ? { token: { totale: o.token } } : {}),
    ...(o.inInvio === true ? { invio: 'invio' as const } : {})
  }
}

/**
 * I contatori del workspace. `turni` sono i turni dell'orchestratore già contati
 * dalla contabilità del flusso (`CostoTurno`): si usano così come sono; a questi si
 * sommano i token degli specialisti, a ciascuno nel giorno in cui è partito.
 */
export function totaliPannello(
  turni: ReadonlyArray<{ quando: string; input: number; output: number; cacheLettura: number; cacheScrittura: number }>,
  specialisti: ReadonlyArray<{ inizio: string; token?: number }>,
  oggi: string
): TotaliPannello {
  let tokenTotali = 0
  let tokenOggi = 0
  for (const t of turni) {
    const k = t.input + t.output + t.cacheLettura + t.cacheScrittura
    tokenTotali += k
    if (t.quando.slice(0, 10) === oggi) tokenOggi += k
  }
  for (const s of specialisti) {
    const k = s.token ?? 0
    tokenTotali += k
    if (s.inizio.slice(0, 10) === oggi) tokenOggi += k
  }
  return { tokenTotali, tokenOggi }
}
