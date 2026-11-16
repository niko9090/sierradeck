/**
 * **Le risorse di un lavoro affidato a un altro PC** (16/11).
 *
 * Un compito può nominare cose che esistono solo sul PC che lo affida: una
 * cartella, un percorso di rete (`\\server\condivisa`, `Z:\`), un programma, una
 * variabile d'ambiente. Su un altro PC lo specialista non le trova e prima
 * andava avanti alla cieca. Qui, tutto puro:
 * - `ricavaRisorse`: le risorse nominate nel messaggio (+ quelle dichiarate);
 * - `verificaRisorse`: ciascuna guardata sul PC che aiuta, con tempo massimo breve;
 * - `sezioneRisorse`: la sezione da aggiungere al prompt di sistema;
 * - `risorsaMancante`: se ne manca una indispensabile e senza alternativa, il motivo
 *   con cui il lavoro fallisce subito (causa 'risorsa': colpa del PC, non del compito).
 *
 * Mai credenziali o segreti: di una variabile si porta solo il nome, mai il valore;
 * un percorso con utente e password dentro (`user:pass@`) si scarta.
 */

export type TipoRisorsa = 'cartella' | 'percorso-rete' | 'programma' | 'variabile'

export type Risorsa = {
  tipo: TipoRisorsa
  /** Il percorso, il nome del programma o della variabile (mai il valore di una variabile). */
  valore: string
  /** Perché serve al lavoro. */
  perche: string
  /** Come ottenerla o cosa fare senza (traduzione del percorso, altro programma…). */
  alternativa?: string
  /** Senza questa il lavoro non può riuscire. Le ricavate dal testo non lo sono; le dichiarate sì (salvo `false`). */
  indispensabile?: boolean
}

export type EsitoRisorsa = 'ok' | 'manca' | 'non-risponde'
export type RisorsaVerificata = { risorsa: Risorsa; esito: EsitoRisorsa }

export const RISORSE_MAX = 20
/** Tempo massimo per guardare una risorsa (un percorso di rete spento può far attendere minuti). */
export const VERIFICA_RISORSA_MAX_MS = 3000

const TIPI: readonly TipoRisorsa[] = ['cartella', 'percorso-rete', 'programma', 'variabile']

/** I comandi che, se nominati, vale la pena trovare nel PATH (non quelli che l'Aiutante ha già: git, node, npm, claude). */
export const PROGRAMMI_NOTI: readonly string[] = [
  'docker', 'ssh', 'scp', 'rsync', 'python', 'python3', 'pip', 'java', 'mvn', 'gradle', 'dotnet', 'cargo', 'rustc', 'go',
  'ffmpeg', 'kubectl', 'terraform', 'psql', 'mysql', 'sqlcmd', 'az', 'aws', 'gcloud', 'make', 'cmake', 'robocopy', 'pwsh'
]

const eNomeVariabile = (s: string): boolean => /^[A-Za-z_][A-Za-z0-9_]{0,63}$/u.test(s)
const eNomeProgramma = (s: string): boolean => /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/u.test(s)
const conCredenziali = (s: string): boolean => /^[a-z]+:\/\/[^/\s]*@/iu.test(s) || /[?&](?:password|pwd|token|key)=/iu.test(s)

/** `\\server\condivisa\...` */
export const eUnc = (p: string): boolean => /^\\\\[^\\/\s]+[\\/][^\\/\s]+/u.test(p)
/** `Z:\...` o `Z:/...` */
const eConUnita = (p: string): boolean => /^[A-Za-z]:[\\/]/u.test(p)

/** Il tipo di un percorso: rete se UNC o su un'unità che non è C. */
export function tipoDelPercorso(p: string): 'cartella' | 'percorso-rete' {
  if (eUnc(p)) return 'percorso-rete'
  if (eConUnita(p) && !/^[Cc]:/u.test(p)) return 'percorso-rete'
  return 'cartella'
}

const normalizza = (p: string): string => p.replace(/\//gu, '\\').replace(/\\+$/u, '').toLowerCase()

/** Toglie la punteggiatura che chiude una frase attaccata al percorso. */
const ripulisci = (p: string): string => p.replace(/[.,;:!?)\]}'"»`]+$/u, '')

export function risorsaValida(x: unknown): Risorsa | undefined {
  if (typeof x !== 'object' || x === null) return undefined
  const o = x as Record<string, unknown>
  if (typeof o.tipo !== 'string' || !TIPI.includes(o.tipo as TipoRisorsa)) return undefined
  if (typeof o.valore !== 'string') return undefined
  const valore = o.valore.trim().slice(0, 400)
  const tipo = o.tipo as TipoRisorsa
  if (valore === '' || conCredenziali(valore)) return undefined
  if (tipo === 'variabile' && !eNomeVariabile(valore)) return undefined
  if (tipo === 'programma' && !eNomeProgramma(valore)) return undefined
  return {
    tipo, valore,
    perche: typeof o.perche === 'string' ? o.perche.trim().slice(0, 300) : '',
    ...(typeof o.alternativa === 'string' && o.alternativa.trim() !== '' ? { alternativa: o.alternativa.trim().slice(0, 400) } : {}),
    ...(typeof o.indispensabile === 'boolean' ? { indispensabile: o.indispensabile } : {})
  }
}

export function risorseValide(x: unknown): Risorsa[] {
  if (!Array.isArray(x)) return []
  return unisci(x.map(risorsaValida).filter((r): r is Risorsa => r !== undefined))
}

/** Senza doppioni (stesso tipo e stesso valore): vale la prima. */
function unisci(lista: readonly Risorsa[]): Risorsa[] {
  const viste = new Set<string>()
  const fuori: Risorsa[] = []
  for (const r of lista) {
    const k = `${r.tipo}\u0000${r.tipo === 'programma' || r.tipo === 'variabile' ? r.valore.toLowerCase() : normalizza(r.valore)}`
    if (viste.has(k)) continue
    viste.add(k)
    fuori.push(r)
    if (fuori.length >= RISORSE_MAX) break
  }
  return fuori
}

/**
 * Le risorse nominate nel messaggio: percorsi assoluti, UNC, unità di rete, comandi noti.
 * `escludi` = cartelle che il PC che aiuta ha già perché il progetto gli arriva (la cartella del progetto).
 * `dichiarate` = quelle dette esplicitamente: passano prima, e sono indispensabili salvo `indispensabile: false`.
 */
export function ricavaRisorse(prompt: string, dichiarate: readonly Risorsa[] = [], escludi: readonly string[] = []): Risorsa[] {
  const fuori = (p: string): boolean => escludi.some((e) => e !== '' && (normalizza(p) === normalizza(e) || normalizza(p).startsWith(`${normalizza(e)}\\`)))
  const ricavate: Risorsa[] = []
  // Percorsi con unità o UNC: fino al primo spazio/virgolette (i percorsi con spazi vanno dichiarati).
  for (const m of prompt.matchAll(/(?:\\\\[^\\/\s"'<>|*?`]+[\\/][^\s"'<>|*?`]*|(?<![A-Za-z0-9])[A-Za-z]:[\\/][^\s"'<>|*?`]*)/gu)) {
    const p = ripulisci(m[0])
    if (p.length < 3 || conCredenziali(p) || fuori(p)) continue
    const tipo = tipoDelPercorso(p)
    // Il solo `C:\` o `C:\Users` non dice niente di specifico: si tiene ma come informazione.
    ricavate.push({
      tipo, valore: p,
      perche: 'è nominato nel compito',
      alternativa: tipo === 'percorso-rete'
        ? 'se non è raggiungibile da questo PC: lavora sulla copia del progetto e dì nel riepilogo cosa non hai potuto fare'
        : 'su questo PC il percorso può non esistere: usa la copia del progetto (percorsi relativi) e dì nel riepilogo cosa mancava'
    })
  }
  // Comandi noti: solo dentro un blocco di codice (`docker ps`) o dopo un verbo d'uso («lancia docker»): evita parole comuni («go», «make»).
  const escapa = (s: string): string => s.replace(/[+.]/gu, '\\$&')
  const codice = [...prompt.matchAll(/`([^`\n]+)`/gu)].map((m) => m[1]!).join('\n')
  for (const prog of PROGRAMMI_NOTI) {
    const parola = `(?<![\\w./\\\\-])${escapa(prog)}(?![\\w/\\\\-])`
    const inCodice = new RegExp(parola, 'u').test(codice)
    const dopoVerbo = new RegExp(`\\b(?:lancia|lanciare|esegui|eseguire|usa|usare|run|serve|servono|installa)\\s+(?:il\\s+comando\\s+|il\\s+programma\\s+)?${escapa(prog)}\\b`, 'iu').test(prompt)
    if (inCodice || dopoVerbo) ricavate.push({ tipo: 'programma', valore: prog, perche: 'il compito lo usa', alternativa: 'se manca su questo PC: installalo se il compito lo chiede (winget, scoop, apt), altrimenti dì nel riepilogo cosa non hai potuto provare' })
  }
  const dichiarateOk = dichiarate.map((r) => ({ ...r, indispensabile: r.indispensabile ?? true }))
  return unisci([...dichiarateOk, ...ricavate])
}

export type StrumentiVerifica = {
  /** La cartella o il file esiste ed è raggiungibile? */
  esiste: (percorso: string) => Promise<boolean>
  /** Il programma è nel PATH? */
  nelPath: (programma: string) => Promise<boolean>
  /** La variabile è impostata (e non vuota)? Il valore non si legge mai fuori da qui. */
  variabile: (nome: string) => boolean
  tempoMs?: number
}

const conTempo = <T>(p: Promise<T>, ms: number): Promise<T | 'tempo'> =>
  new Promise((ok) => {
    const t = setTimeout(() => ok('tempo'), ms)
    t.unref?.()
    p.then((v) => { clearTimeout(t); ok(v) }, () => { clearTimeout(t); ok('tempo') })
  })

/** Guarda ogni risorsa, tutte insieme, ciascuna con il suo tempo massimo. */
export async function verificaRisorse(risorse: readonly Risorsa[], s: StrumentiVerifica): Promise<RisorsaVerificata[]> {
  const ms = s.tempoMs ?? VERIFICA_RISORSA_MAX_MS
  return Promise.all(risorse.map(async (risorsa): Promise<RisorsaVerificata> => {
    try {
      if (risorsa.tipo === 'variabile') return { risorsa, esito: s.variabile(risorsa.valore) ? 'ok' : 'manca' }
      const r = risorsa.tipo === 'programma'
        ? await conTempo(s.nelPath(risorsa.valore), ms)
        : await conTempo(s.esiste(risorsa.valore), ms)
      if (r === 'tempo') return { risorsa, esito: 'non-risponde' }
      return { risorsa, esito: r ? 'ok' : 'manca' }
    } catch { return { risorsa, esito: 'non-risponde' } }
  }))
}

const ETICHETTA: Record<TipoRisorsa, string> = { cartella: 'cartella', 'percorso-rete': 'percorso di rete', programma: 'programma', variabile: 'variabile d’ambiente' }

/** Una risorsa che non c'è e senza la quale il lavoro non può riuscire (né c'è un'alternativa). */
export function risorsaMancante(v: readonly RisorsaVerificata[]): RisorsaVerificata | undefined {
  return v.find((x) => x.esito !== 'ok' && x.risorsa.indispensabile === true && (x.risorsa.alternativa ?? '').trim() === '')
}

/** Il motivo (italiano) del fallimento subito: la risorsa e perché serve. Il valore di una variabile non c'è mai. */
export function motivoRisorsa(v: RisorsaVerificata): string {
  const r = v.risorsa
  const stato = v.esito === 'non-risponde' ? 'non risponde' : 'non c’è'
  return `${ETICHETTA[r.tipo]} ${r.valore} ${stato} su questo PC${r.perche !== '' ? ` e serve (${r.perche})` : ''}`
}

/**
 * La sezione per il prompt di sistema: cosa c'è, cosa manca e come ottenerlo. Vuota se non ci sono risorse.
 * Mai il valore di una variabile.
 */
export function sezioneRisorse(v: readonly RisorsaVerificata[]): string {
  if (v.length === 0) return ''
  const righe = v.map(({ risorsa: r, esito }) => {
    const segno = esito === 'ok' ? 'c’è' : esito === 'non-risponde' ? 'NON RISPONDE (tempo scaduto)' : 'MANCA'
    const resto = esito === 'ok'
      ? ''
      : ` — ${r.alternativa ?? 'nessuna alternativa indicata: se ti serve davvero, fermati e dillo nel riepilogo («bloccato: …»)'}`
    return `- ${ETICHETTA[r.tipo]} ${r.valore}: ${segno}${r.perche !== '' ? ` (${r.perche})` : ''}${resto}`
  })
  const mancano = v.some((x) => x.esito !== 'ok')
  return `Risorse nominate dal compito, controllate su questo PC prima di partire:\n${righe.join('\n')}\n${mancano
    ? 'Quelle che mancano non sono un errore tuo: segui l’alternativa indicata, non cercare di aggirarle con credenziali o percorsi inventati, e nel riepilogo di’ cosa non hai potuto fare.'
    : 'Sono tutte disponibili.'}`
}
