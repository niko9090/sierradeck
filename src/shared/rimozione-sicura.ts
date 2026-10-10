import { relativoSicuro } from './file-telefono'

/**
 * Togliere un progetto da un PC che non ne è il residente, senza perdere
 * niente (0.58.0, tappa 3). Le regole pure; il lavoro sul disco e in rete sta
 * in `src/main/rimozione-sicura.ts`. Vedi la scheda `pannello-chat-drive-0-58.md`.
 *
 * 1. Il PC che deve rendere il progetto solo cloud manda al **residente** cosa
 *    ha: i file (percorso relativo, dimensione, data, impronta) e le chat.
 * 2. Il residente confronta con le sue copie e classifica ogni voce:
 *    `uguale`, `doppione` (più vecchio del suo), `utile` (solo lì, o più nuovo,
 *    o una chat più lunga).
 * 3. Le voci utili si copiano sul residente, in
 *    `<progetto>/.sierradeck/recuperati/<PC>-<data>/`: **mai sopra i suoi file**.
 * 4. Riassunto a Nicholas; conferma automatica solo con zero voci utili e zero
 *    errori.
 * 5. La cartella si **sposta** nella cartella di recupero per 30 giorni,
 *    ripristinabile. Mai una cancellazione definitiva da sola.
 */

export type VoceFile = { percorso: string; size: number; mtime: number; sha: string }
export type VoceChat = { sessione: string; size: number; mtime: number }

export type Classe = 'uguale' | 'doppione' | 'utile'
export type MotivoUtile = 'manca' | 'piu-recente' | 'chat-piu-lunga'

export type Classificata =
  | { tipo: 'file'; voce: VoceFile; classe: Classe; motivo?: MotivoUtile }
  | { tipo: 'chat'; voce: VoceChat; classe: Classe; motivo?: MotivoUtile }

/** Le cartelle che non si confrontano: si rifanno da sole, o sono già un recupero. */
export const ESCLUSE = ['node_modules', '.sierradeck/recuperati']

export function esclusa(percorso: string): boolean {
  const p = percorso.replace(/\\/g, '/').toLowerCase()
  return ESCLUSE.some((e) => p === e || p.startsWith(`${e}/`) || p.includes(`/${e}/`))
}

/** Il confronto del residente: ogni voce di chi toglie, contro le sue copie. */
export function classifica(
  lontano: { file: VoceFile[]; chat: VoceChat[] },
  residente: { file: VoceFile[]; chat: VoceChat[] }
): Classificata[] {
  const fileRes = new Map(residente.file.map((f) => [f.percorso.replace(/\\/g, '/').toLowerCase(), f]))
  const shaRes = new Set(residente.file.map((f) => f.sha))
  const chatRes = new Map(residente.chat.map((c) => [c.sessione, c]))
  const fuori: Classificata[] = []
  for (const f of lontano.file) {
    if (esclusa(f.percorso)) continue
    const r = fileRes.get(f.percorso.replace(/\\/g, '/').toLowerCase())
    if (r === undefined) {
      // Lo stesso contenuto altrove nel residente (un file spostato): niente si perde.
      fuori.push(shaRes.has(f.sha) ? { tipo: 'file', voce: f, classe: 'uguale' } : { tipo: 'file', voce: f, classe: 'utile', motivo: 'manca' })
      continue
    }
    if (r.sha === f.sha) fuori.push({ tipo: 'file', voce: f, classe: 'uguale' })
    else if (f.mtime <= r.mtime) fuori.push({ tipo: 'file', voce: f, classe: 'doppione' })
    else fuori.push({ tipo: 'file', voce: f, classe: 'utile', motivo: 'piu-recente' })
  }
  for (const c of lontano.chat) {
    const r = chatRes.get(c.sessione)
    if (r === undefined) fuori.push({ tipo: 'chat', voce: c, classe: 'utile', motivo: 'manca' })
    else if (c.size > r.size) fuori.push({ tipo: 'chat', voce: c, classe: 'utile', motivo: 'chat-piu-lunga' })
    else fuori.push({ tipo: 'chat', voce: c, classe: c.size === r.size ? 'uguale' : 'doppione' })
  }
  return fuori
}

/** La cartella dei recuperati di un giro, dentro il progetto del residente. */
export function cartellaRecuperati(pcNome: string, quando: string): string {
  const pc = pcNome.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'PC'
  const data = quando.slice(0, 19).replace(/[:T]/g, '-')
  return `.sierradeck/recuperati/${pc}-${data}`
}

/**
 * Dove va un file recuperato, relativo al progetto del residente: sempre dentro
 * la cartella dei recuperati, mai fuori, mai un percorso strano. `undefined` se
 * il percorso non è sicuro (risalite, assoluti, nomi riservati di Windows).
 */
export function destinazioneRecupero(cartella: string, relativo: string): string | undefined {
  const r = relativo.replace(/\\/g, '/')
  if (!relativoSicuro(r) || r === '') return undefined
  if (!cartella.startsWith('.sierradeck/recuperati/') || !relativoSicuro(cartella)) return undefined
  return `${cartella}/${r}`
}

export type EsitoRecupero = { percorso: string; tipo: 'file' | 'chat'; dove?: string; errore?: string }

export type Riassunto = {
  uguali: number
  doppioni: number
  utili: number
  recuperati: { percorso: string; tipo: 'file' | 'chat'; dove: string }[]
  nonRecuperati: { percorso: string; tipo: 'file' | 'chat'; perche: string }[]
  /** Conferma automatica: zero voci utili e zero errori. */
  automatica: boolean
  testo: string
}

export function riassunto(nome: string, residente: string, voci: Classificata[], recupero: EsitoRecupero[]): Riassunto {
  const uguali = voci.filter((v) => v.classe === 'uguale').length
  const doppioni = voci.filter((v) => v.classe === 'doppione').length
  const utili = voci.filter((v) => v.classe === 'utile').length
  const recuperati = recupero.filter((r) => r.errore === undefined && r.dove !== undefined).map((r) => ({ percorso: r.percorso, tipo: r.tipo, dove: r.dove as string }))
  const nonRecuperati = recupero.filter((r) => r.errore !== undefined).map((r) => ({ percorso: r.percorso, tipo: r.tipo, perche: r.errore as string }))
  // Una voce utile senza esito conta come non recuperata.
  const conEsito = new Set(recupero.map((r) => r.percorso))
  for (const v of voci) {
    if (v.classe !== 'utile') continue
    const p = v.tipo === 'file' ? v.voce.percorso : v.voce.sessione
    if (!conEsito.has(p)) nonRecuperati.push({ percorso: p, tipo: v.tipo, perche: 'non ancora copiata' })
  }
  const automatica = utili === 0 && nonRecuperati.length === 0
  const righe = [
    `Progetto «${nome}», confrontato da ${residente} (il residente).`,
    `${uguali} ${uguali === 1 ? 'voce è uguale' : 'voci sono uguali'} a quelle di ${residente}; ${doppioni} ${doppioni === 1 ? 'è un doppione più vecchio' : 'sono doppioni più vecchi'}.`,
    utili === 0
      ? 'Niente c’è solo qui: questo PC non ha niente che il residente non abbia già.'
      : `${utili} ${utili === 1 ? 'voce era utile solo qui' : 'voci erano utili solo qui'}: ${recuperati.length} ${recuperati.length === 1 ? 'copiata' : 'copiate'} su ${residente}${recuperati.length > 0 ? ` (in ${recuperati[0]?.dove.split('/').slice(0, 3).join('/')}/, mai sopra i suoi file)` : ''}.`,
    nonRecuperati.length > 0 ? `Non recuperate: ${nonRecuperati.slice(0, 8).map((x) => `${x.percorso} (${x.perche})`).join('; ')}${nonRecuperati.length > 8 ? ` e altre ${nonRecuperati.length - 8}` : ''}. Finché ce ne sono, la cartella non si toglie senza la tua conferma.` : '',
    automatica
      ? 'Nessuna differenza: la cartella di qui va nella cartella di recupero di SierraDeck da sola, e resta ripristinabile per 30 giorni.'
      : '«Conferma e togli da questo PC» sposta la cartella di qui nella cartella di recupero di SierraDeck (30 giorni, ripristinabile); «Annulla» lascia tutto com’è.'
  ].filter((x) => x !== '')
  return { uguali, doppioni, utili, recuperati, nonRecuperati, automatica, testo: righe.join(' ') }
}

/** Quanto resta in recupero una cartella tolta. */
export const RECUPERO_GIORNI = 30

export type CartellaInRecupero = {
  id: string
  progetto: string
  nome: string
  percorsoOriginale: string
  dove: string
  quando: string
  motivo: string
  scadeIl: string
  ripristinataIl?: string
}

export function scadenza(quando: string): string {
  return new Date(Date.parse(quando) + RECUPERO_GIORNI * 86_400_000).toISOString()
}

/** Le cartelle scadute: si avvisa Nicholas, e solo con la sua conferma vanno nel Cestino. Mai da sole. */
export function scadute(elenco: CartellaInRecupero[], adesso: number): CartellaInRecupero[] {
  return elenco.filter((c) => c.ripristinataIl === undefined && Date.parse(c.scadeIl) <= adesso)
}

export type FaseRimozione = 'analisi' | 'recupero' | 'attesa-conferma' | 'in-uso' | 'spostata' | 'annullata' | 'errore'
export type StatoRimozione = {
  progetto: string
  nome: string
  residente: string
  fase: FaseRimozione
  messaggio: string
  riassunto?: Riassunto
  quando: string
}

export const PREFISSO_DOMANDA_RIMOZIONE = 'rimozione:'
export const OPZIONI_RIMOZIONE = ['Conferma e togli da questo PC', 'Annulla'] as const
