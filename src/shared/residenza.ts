import { esclusa, type VoceFile } from './rimozione-sicura'

/**
 * «Rendi residente» con analisi e unione (0.60.0, regola di Nicholas). Le
 * regole pure; il disco, il Drive e le chat stanno in `src/main/residenza.ts`.
 *
 * Quando Nicholas rende residente un progetto su un PC, quel PC:
 * 1. raccoglie tutte le copie: le cartelle di qui con lo stesso nome (o
 *    registrate per un id dello stesso progetto), e le copie salvate sul Drive
 *    dagli altri PC (`progetto-<id>/…`, confrontate per impronta senza
 *    scaricarle);
 * 2. sceglie la cartella che resta (`scegliDestinazione`) e confronta ogni
 *    file delle altre copie con lei (`pianoUnione`):
 *    - uguale (stessa impronta, anche a un altro percorso) → niente;
 *    - manca nella destinazione → si aggiunge;
 *    - più recente → prende il posto del file della destinazione, che va nei
 *      recuperati (in una cartella con git, invece, la versione più recente
 *      va nei recuperati e la destinazione non si tocca: un repository non si
 *      riscrive da solo);
 *    - più vecchio o diverso → nei recuperati;
 * 3. mostra un riassunto (`testoRiassunto`) con Conferma e Annulla;
 * 4. solo con la conferma unisce: file, chat, workspace, registro, casa; le
 *    cartelle doppie vanno nella cartella di recupero per 30 giorni.
 * Mai una cancellazione definitiva.
 */

/** Oltre a `node_modules` e ai recuperati: `.git` non si unisce mai file per file. */
export function esclusaDallUnione(percorso: string): boolean {
  const p = percorso.replace(/\\/g, '/').toLowerCase()
  return esclusa(p) || p === '.git' || p.startsWith('.git/') || p.includes('/.git/')
}

/** Le note e il quaderno: si contano a parte nel riassunto. */
export function eNota(percorso: string): boolean {
  const p = percorso.replace(/\\/g, '/').toLowerCase()
  return p.startsWith('.sierradeck/quaderno/') || p.startsWith('.sierradeck/note') || p.startsWith('note/') || p === 'note.md' || p === 'claude.md'
}

export type CandidataDestinazione = {
  percorso: string
  /** Registrata nel registro per questo PC (non solo trovata per nome). */
  registrata: boolean
  /** L'ultima chat di qui in quella cartella (ms), se ce n'è. */
  ultimaChat?: number
  file: number
}

/**
 * La cartella che resta: quella dove si è lavorato più di recente (le chat),
 * poi una registrata, poi la più piena. Nessuna candidata: si porta giù dal
 * Drive in una cartella nuova.
 */
export function scegliDestinazione(c: CandidataDestinazione[]): CandidataDestinazione | undefined {
  return [...c].sort((a, b) =>
    (b.ultimaChat ?? 0) - (a.ultimaChat ?? 0) ||
    (b.registrata ? 1 : 0) - (a.registrata ? 1 : 0) ||
    b.file - a.file ||
    a.percorso.localeCompare(b.percorso))[0]
}

/** Una copia da unire: una cartella di qui o i file di un id sul Drive. */
export type CopiaDaUnire = {
  chiave: string
  tipo: 'cartella' | 'drive'
  /** Come la si chiama nel riassunto: il percorso, o «Drive (salvata da PORTATILE)». */
  etichetta: string
  file: VoceFile[]
}

export type OpFile = { copia: string; voce: VoceFile; motivo?: 'piu-vecchio' | 'piu-recente-git' | 'diverso' | 'sostituito' }

export type PianoUnione = {
  uguali: number
  aggiungi: OpFile[]
  sostituisci: OpFile[]
  /** Le versioni che non entrano nella destinazione: nei recuperati, mai perse. */
  recupera: OpFile[]
  /** Per copia: quanti uguali, aggiunti, sostituiti, nei recuperati. */
  perCopia: Record<string, { uguali: number; aggiunti: number; sostituiti: number; recuperati: number; esclusi: number }>
}

const chiaveFile = (p: string): string => p.replace(/\\/g, '/').toLowerCase()

/**
 * Il confronto di tutte le copie con la destinazione. Una versione per
 * contenuto: due copie con lo stesso file contano una volta. Fra più versioni
 * di uno stesso percorso entra (o sostituisce) la più recente; le altre vanno
 * nei recuperati.
 */
export function pianoUnione(destinazione: { file: VoceFile[]; git: boolean }, copie: CopiaDaUnire[]): PianoUnione {
  const dest = new Map(destinazione.file.map((f) => [chiaveFile(f.percorso), f]))
  const shaDest = new Set(destinazione.file.map((f) => f.sha))
  const perCopia: PianoUnione['perCopia'] = {}
  for (const c of copie) perCopia[c.chiave] = { uguali: 0, aggiunti: 0, sostituiti: 0, recuperati: 0, esclusi: 0 }
  // Per percorso: le versioni diverse da quelle della destinazione, una per impronta.
  const versioni = new Map<string, OpFile[]>()
  let uguali = 0
  for (const c of copie) {
    const conto = perCopia[c.chiave] as PianoUnione['perCopia'][string]
    for (const f of c.file) {
      if (esclusaDallUnione(f.percorso)) { conto.esclusi += 1; continue }
      const k = chiaveFile(f.percorso)
      const d = dest.get(k)
      if ((d !== undefined && d.sha === f.sha) || (d === undefined && shaDest.has(f.sha))) { uguali += 1; conto.uguali += 1; continue }
      const gia = versioni.get(k) ?? []
      if (gia.some((x) => x.voce.sha === f.sha)) { conto.uguali += 1; continue }
      versioni.set(k, [...gia, { copia: c.chiave, voce: f }])
    }
  }
  const aggiungi: OpFile[] = []
  const sostituisci: OpFile[] = []
  const recupera: OpFile[] = []
  const conta = (op: OpFile, campo: 'aggiunti' | 'sostituiti' | 'recuperati'): void => { const c = perCopia[op.copia]; if (c !== undefined) c[campo] += 1 }
  for (const [k, vv] of versioni) {
    const ordinate = [...vv].sort((a, b) => b.voce.mtime - a.voce.mtime || a.copia.localeCompare(b.copia))
    const prima = ordinate[0] as OpFile
    const altre = ordinate.slice(1)
    const d = dest.get(k)
    if (d === undefined) {
      aggiungi.push(prima); conta(prima, 'aggiunti')
      for (const x of altre) { const o = { ...x, motivo: 'diverso' as const }; recupera.push(o); conta(o, 'recuperati') }
      continue
    }
    if (prima.voce.mtime > d.mtime) {
      if (destinazione.git) { const o = { ...prima, motivo: 'piu-recente-git' as const }; recupera.push(o); conta(o, 'recuperati') }
      else { sostituisci.push({ ...prima, motivo: 'sostituito' }); conta(prima, 'sostituiti') }
    } else { const o = { ...prima, motivo: 'piu-vecchio' as const }; recupera.push(o); conta(o, 'recuperati') }
    for (const x of altre) { const o = { ...x, motivo: x.voce.mtime > d.mtime ? 'diverso' as const : 'piu-vecchio' as const }; recupera.push(o); conta(o, 'recuperati') }
  }
  return { uguali, aggiungi, sostituisci, recupera, perCopia }
}

/** Dove va nei recuperati una versione: `<recuperati>/<copia>/<percorso>`. */
export function nomeCartellaCopia(etichetta: string): string {
  return etichetta.replace(/^[A-Za-z]:/, '').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(-60) || 'copia'
}

/* ------------------------------------------------------------------ */
/* Il riassunto e lo stato.                                            */
/* ------------------------------------------------------------------ */

export type RiassuntoResidenza = {
  nome: string
  pcNome: string
  destinazione: string
  /** La cartella non c'è: si crea e si riempie dal Drive. */
  nuova: boolean
  git: boolean
  copie: { chiave: string; tipo: 'cartella' | 'drive'; etichetta: string; uguali: number; aggiunti: number; sostituiti: number; recuperati: number; esclusi: number; vaInRecupero: boolean }[]
  file: { uguali: number; aggiunti: number; sostituiti: number; recuperati: number; note: number }
  chat: { daSpostare: number; delProgetto: number; daAltriPc: number }
  workspace: { tiene: string; uniti: string[]; aperti: string[] }
  registro: { principale: string; uniti: string[] }
  /** Le cartelle che vanno nella cartella di recupero per 30 giorni. */
  recupero: string[]
  /** Cartelle in uso adesso: si aspetta che si liberino. */
  inUso: string[]
  recuperati: string
  righe: string[]
}

export type FaseResidenza = 'analisi' | 'attesa-conferma' | 'unisco' | 'fatta' | 'annullata' | 'errore' | 'in-uso'

export type StatoResidenza = {
  progetto: string
  nome: string
  fase: FaseResidenza
  messaggio: string
  riassunto?: RiassuntoResidenza
  quando: string
  /** Dopo l'unione: l'id per «Annulla l'unione» (30 giorni). */
  unione?: string
}

const n = (x: number, uno: string, tanti: string): string => `${x} ${x === 1 ? uno : tanti}`

/** Le righe del riassunto, per esteso: cosa unisce, cosa tiene, cosa va in recupero, cosa non succede. */
export function testoRiassunto(r: Omit<RiassuntoResidenza, 'righe'>): string[] {
  const righe: string[] = []
  righe.push(r.nuova
    ? `Qui «${r.nome}» non c’è: lo creo in ${r.destinazione} e ci porto le copie.`
    : `Resta la cartella ${r.destinazione}${r.git ? ' (è un repository git: i suoi file non vengono sostituiti, le versioni più recenti delle altre copie vanno nei recuperati da guardare)' : ''}.`)
  if (r.copie.length === 0) righe.push('Non ci sono altre copie da unire: cambia solo il residente.')
  for (const c of r.copie) {
    righe.push(`${c.tipo === 'cartella' ? 'Cartella' : 'Copia'} ${c.etichetta}: ${n(c.uguali, 'file uguale', 'file uguali')}, ${n(c.aggiunti, 'aggiunto', 'aggiunti')}, ${n(c.sostituiti, 'più recente al posto del vecchio', 'più recenti al posto dei vecchi')}, ${n(c.recuperati, 'versione nei recuperati', 'versioni nei recuperati')}${c.esclusi > 0 ? ` (${c.esclusi} di .git e node_modules non si uniscono)` : ''}.${c.vaInRecupero ? ' Poi la cartella va nella cartella di recupero per 30 giorni.' : ''}`)
  }
  if (r.file.note > 0) righe.push(`Fra questi, ${n(r.file.note, 'è una nota o una scheda del quaderno', 'sono note e schede del quaderno')}: stessa regola, niente si perde.`)
  if (r.file.recuperati + r.file.sostituiti > 0) righe.push(`Le versioni che non restano al loro posto vanno in ${r.destinazione}\\${r.recuperati.replace(/\//g, '\\')}, divise per copia di provenienza.`)
  righe.push(`Chat: ${n(r.chat.delProgetto, 'chat del progetto lavora', 'chat del progetto lavorano')} su ${r.pcNome}${r.chat.daSpostare > 0 ? `; ${n(r.chat.daSpostare, 'chat di qui passa', 'chat di qui passano')} nella cartella che resta (la trascrizione vecchia va con la sua cartella nel recupero)` : ''}${r.chat.daAltriPc > 0 ? `; ${n(r.chat.daAltriPc, 'chat sta', 'chat stanno')} solo su altri PC o sul Drive: scendono qui al prossimo salvataggio` : ''}.`)
  if (r.workspace.uniti.length > 0) righe.push(`Workspace: ${r.workspace.uniti.map((w) => `«${w}»`).join(', ')} ${r.workspace.uniti.length === 1 ? 'entra' : 'entrano'} in «${r.workspace.tiene}» con le loro chat; ${r.workspace.uniti.length === 1 ? 'il doppio si toglie' : 'i doppi si tolgono'} (salvati per «Annulla l’unione»).`)
  else righe.push(`Workspace: «${r.workspace.tiene}».`)
  if (r.workspace.aperti.length > 0) righe.push(`${r.workspace.aperti.map((w) => `«${w}»`).join(', ')} ${r.workspace.aperti.length === 1 ? 'è aperto' : 'sono aperti'} in una finestra: non ${r.workspace.aperti.length === 1 ? 'lo tocco' : 'li tocco'}; chiudilo e rifai «Unisci qui le copie».`)
  if (r.registro.uniti.length > 0) righe.push(`Registro del Drive: ${n(r.registro.uniti.length, 'doppione unito', 'doppioni uniti')} al progetto principale; i loro file sul Drive restano dove sono.`)
  if (r.inUso.length > 0) righe.push(`In uso adesso: ${r.inUso.join('; ')}. Quelle cartelle aspettano che si liberino.`)
  righe.push('Non succede: nessun file cancellato; nessuna chat chiusa a metà turno; gli altri PC non perdono la loro copia finché lì non confermi «Rendi solo cloud».')
  righe.push('«Conferma e unisci» fa tutto questo; «Annulla» lascia tutto com’è. Dopo, per 30 giorni, «Annulla l’unione» rimette le cartelle, i file sostituiti e i workspace com’erano.')
  return righe
}

/**
 * Gli id del progetto i cui file sul Drive vanno confrontati (0.66.1). I file
 * di un id con una cartella di qui **che c'è davvero** sono il salvataggio di
 * quella cartella e non contano due volte; una cartella registrata ma sparita
 * (nel recupero) non salva niente, e la copia sul Drive si confronta.
 */
export function idsDaConfrontareSulDrive(ids: string[], registrate: { id: string; percorso: string }[], esiste: (p: string) => boolean): string[] {
  const conCartellaQui = new Set(registrate.filter((x) => esiste(x.percorso)).map((x) => x.id))
  return ids.filter((x) => !conCartellaQui.has(x))
}
