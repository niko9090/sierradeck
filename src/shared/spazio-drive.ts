/**
 * Lo spazio sul Drive (0.65.0): quanto occupa SierraDeck, per tipo, e le
 * proposte di pulizia. Regole pure: niente rete, niente disco.
 *
 * Tutto vive nella cartella privata dell'app (appDataFolder). I file dei dati
 * si chiamano `f_<hash del percorso>`: il tipo lo dice il manifesto (il
 * percorso di ogni voce). Gli altri hanno un nome parlante: battiti e posta
 * dei PC (`pc-`, `posta-`, `presenza-`…), le copie di sicurezza del
 * manifesto (`sierradeck.manifesto.<qualcosa>`), l'indice e le chiavi.
 *
 * **Una pulizia non cancella subito.** Le voci tolte dal manifesto vanno nel
 * registro delle pulizie (sul Drive, cifrato): i file restano dove sono per
 * 30 giorni, e «Annulla» rimette le voci nel manifesto. Solo dopo i 30 giorni
 * (o con «Svuota adesso», confermato) i file si cancellano davvero.
 */

export type TipoSpazio = 'chat' | 'progetti' | 'battiti' | 'recupero' | 'sistema' | 'orfani'

export const TIPI_SPAZIO: TipoSpazio[] = ['chat', 'progetti', 'battiti', 'recupero', 'sistema', 'orfani']

export const ETICHETTA_SPAZIO: Record<TipoSpazio, string> = {
  chat: 'Chat',
  progetti: 'Progetti',
  battiti: 'Battiti e posta dei PC',
  recupero: 'Recupero e copie di sicurezza',
  sistema: 'Indice, chiavi e workspace',
  orfani: 'File senza voce nell’indice'
}

/** Un file della cartella dell'app, con la sua dimensione vera sul Drive. */
export type FileDrive = { nome: string; byte: number; modificato?: string }

/** Una voce del manifesto (percorso → file cifrato). */
export type VoceIndice = { nome: string; size: number; mtime: number; sha?: string; pc?: string }
export type IndiceDrive = Record<string, VoceIndice>

/** Quanto ci sta nell'account Google, da `about.storageQuota` (byte). */
export type QuotaDrive = { limite?: number; usato: number; usatoNelDrive?: number; nelCestino?: number }

export type MisuraSpazio = {
  quota?: QuotaDrive
  /** Tutto quello che SierraDeck tiene sul Drive. */
  totale: { file: number; byte: number }
  perTipo: Record<TipoSpazio, { file: number; byte: number }>
  /** Di cui già in una pulizia (in recupero, si libera alla scadenza). */
  inRecupero: { file: number; byte: number }
  misuratoIl: string
  /** Lo spazio di ogni progetto (0.69.0), con i suoi file oltre `FILE_GRANDE_BYTE`. */
  perProgetto?: Record<string, { file: number; byte: number; grandi: { percorso: string; byte: number }[] }>
  /** I file più grandi, con il perché stanno lì (0.69.0, l'inventario). */
  piuGrandi?: { nome: string; byte: number; tipo: TipoSpazio; percorso?: string; perche: string }[]
}

/** Oltre questo un file di un progetto si segnala (0.69.0): spesso è un binario che si rigenera. */
export const FILE_GRANDE_BYTE = 20 * 1024 * 1024

/** Perché un file sta sul Drive, in una riga (l'inventario dello spazio). */
export function percheSulDrive(tipo: TipoSpazio, percorso?: string): string {
  if (tipo === 'chat') return `la trascrizione di una chat (${(percorso ?? '').split('/').slice(1, 2).join('')}): serve a riprenderla su un altro PC`
  if (tipo === 'progetti') return `un file del progetto ${(percorso ?? '').split('/')[0]?.replace('progetto-', '') ?? ''}: viaggia con il progetto`
  if (tipo === 'recupero') return 'nel recupero (30 giorni, annullabile), poi si svuota da solo'
  if (tipo === 'orfani') return 'senza voce nell’indice: resto di un salvataggio interrotto o di una chat tolta'
  if (tipo === 'battiti') return 'battiti, posta e presenze fra i PC'
  return 'l’assetto: indice, impostazioni, registro dei progetti'
}

const PREFISSI_BATTITI = ['pc-', 'posta-', 'presenza-', 'staffetta-', 'coda-', 'rtc-', 'schermo-']
export const NOME_MANIFESTO = 'sierradeck.manifesto'
export const NOME_PULIZIE = 'pulizie-drive'

/** Il tipo di un file: dal percorso del manifesto se ce l'ha, se no dal nome. */
export function tipoDi(nome: string, percorso?: string): TipoSpazio {
  if (percorso !== undefined) {
    const prefisso = percorso.split('/')[0] ?? ''
    if (prefisso === 'chat') return 'chat'
    if (prefisso.startsWith('progetto-')) return 'progetti'
    return 'sistema'
  }
  if (nome.startsWith(`${NOME_MANIFESTO}.`)) return 'recupero'
  if (PREFISSI_BATTITI.some((p) => nome.startsWith(p))) return 'battiti'
  if (nome.startsWith('f_')) return 'orfani'
  return 'sistema'
}

/** Il percorso di ogni file dei dati, dal manifesto: nome → percorso. */
export function percorsiPerNome(indice: IndiceDrive): Map<string, string> {
  return new Map(Object.entries(indice).map(([p, v]) => [v.nome, p]))
}

export function misura(p: { file: FileDrive[]; indice: IndiceDrive; quota?: QuotaDrive; pulizie?: RegistroPulizie; adesso: number }): MisuraSpazio {
  const perNome = percorsiPerNome(p.indice)
  const inPulizia = nomiInRecupero(p.pulizie)
  const perTipo = Object.fromEntries(TIPI_SPAZIO.map((t) => [t, { file: 0, byte: 0 }])) as Record<TipoSpazio, { file: number; byte: number }>
  const totale = { file: 0, byte: 0 }
  const inRecupero = { file: 0, byte: 0 }
  for (const f of p.file) {
    // Un file tolto dal manifesto da una pulizia è in recupero, non «senza voce».
    const t = inPulizia.has(f.nome) ? 'recupero' : tipoDi(f.nome, perNome.get(f.nome))
    perTipo[t].file += 1
    perTipo[t].byte += f.byte
    totale.file += 1
    totale.byte += f.byte
    if (inPulizia.has(f.nome)) { inRecupero.file += 1; inRecupero.byte += f.byte }
  }
  // Per progetto (0.69.0): i file sotto `progetto-<id>/` dell'indice.
  const perProgetto: NonNullable<MisuraSpazio['perProgetto']> = {}
  const daIndice = new Map(p.file.map((f) => [f.nome, f.byte]))
  for (const [percorso, v] of Object.entries(p.indice)) {
    const prefisso = percorso.split('/')[0] ?? ''
    if (!prefisso.startsWith('progetto-')) continue
    const id = prefisso.slice('progetto-'.length)
    const byte = daIndice.get(v.nome) ?? v.size
    const x = perProgetto[id] ?? { file: 0, byte: 0, grandi: [] }
    x.file += 1
    x.byte += byte
    if (byte >= FILE_GRANDE_BYTE) x.grandi.push({ percorso: percorso.slice(prefisso.length + 1), byte })
    perProgetto[id] = x
  }
  const piuGrandi = [...p.file].sort((a, b) => b.byte - a.byte).slice(0, 30).map((f) => {
    const percorso = perNome.get(f.nome)
    const tipo = inPulizia.has(f.nome) ? 'recupero' as const : tipoDi(f.nome, percorso)
    return { nome: f.nome, byte: f.byte, tipo, ...(percorso !== undefined ? { percorso } : {}), perche: percheSulDrive(tipo, percorso) }
  })
  return { ...(p.quota !== undefined ? { quota: p.quota } : {}), totale, perTipo, inRecupero, misuratoIl: new Date(p.adesso).toISOString(), perProgetto, piuGrandi }
}

/** Quello che il pannello «Progetti» mostra (PC, pagina, app). */
export type StatoSpazio = {
  misura?: MisuraSpazio
  proposte: Proposta[]
  pulizie: Pulizia[]
  errore?: string
}

/* ------------------------------------------------------------------ */
/* Le proposte di pulizia.                                             */
/* ------------------------------------------------------------------ */

/** `chat-eliminate` (0.79.0): «Elimina dal PC … anche dal Drive», non una proposta del giro. */
export type TipoProposta = 'doppie' | 'vecchie' | 'recupero-scaduto' | 'prove' | 'chat-eliminate'

/** Un file che una pulizia toglie: con la sua voce del manifesto, se ce l'ha, per rimetterla. */
export type VocePulita = { nome: string; byte: number; percorso?: string; voce?: VoceIndice }

export type Proposta = {
  tipo: TipoProposta
  titolo: string
  /** Una riga corta; il resto dietro «?». */
  breve: string
  spiega: string
  voci: VocePulita[]
  byte: number
}

/** Le chat ferme da più di questo, già sul disco di un PC, si possono togliere dal Drive. */
export const VECCHIE_DOPO_MS = 60 * 86_400_000
/** Le copie di sicurezza del manifesto più vecchie di così sono scadute. */
export const RECUPERO_SCADE_MS = 30 * 86_400_000
/** Un file senza voce più giovane di così può essere un caricamento in corso: non si tocca. */
const ORFANO_DOPO_MS = 2 * 86_400_000

/** La conversazione e la radice di un percorso di chat: `chat/<slug>/<uuid>.jsonl` e i suoi sotto-agenti. */
function chatDi(percorso: string): { slug: string; sessione: string; principale: boolean } | undefined {
  const parti = percorso.split('/')
  if (parti[0] !== 'chat' || parti.length < 3) return undefined
  const slug = parti[1] as string
  if (parti.length === 3) {
    const n = parti[2] as string
    if (!n.endsWith('.jsonl')) return undefined
    return { slug, sessione: n.slice(0, -'.jsonl'.length), principale: true }
  }
  return { slug, sessione: parti[2] as string, principale: false }
}

/**
 * Le chat delle prove (0.75.3): quelle di una cartella «SierraDeck-prova-…» e
 * quelle avviate nello scratchpad di una sessione di Claude Code (le prove
 * degli hook). Il salvataggio non toglie mai una chat dal Drive perché è
 * sparita dal disco, quindi restavano lì anche dopo «togli progetto di prova».
 * Lo slug perde i separatori: per questo è solo una proposta, che conferma
 * Nicholas, e va nel recupero annullabile.
 */
export function slugDiProva(slug: string): boolean {
  return /-SierraDeck-prova-[A-Za-z0-9][A-Za-z0-9-]*$/i.test(slug) || /-AppData-Local-Temp-claude-.+-scratchpad(-|$)/i.test(slug)
}

/**
 * Le proposte, ognuna con i suoi file e i byte che libera. Non tocca niente.
 * `copieSuiPc`: per conversazione, i PC che ce l'hanno sul disco e quanto è
 * lunga lì (battiti 0.58 e questo PC).
 */
export function proposteDiPulizia(p: {
  file: FileDrive[]
  indice: IndiceDrive
  copieSuiPc: Map<string, { nome: string; size: number }[]>
  pulizie?: RegistroPulizie
  adesso: number
}): Proposta[] {
  const byteDi = new Map(p.file.map((f) => [f.nome, f.byte]))
  const giaFuori = nomiInRecupero(p.pulizie)
  const voce = (percorso: string, v: VoceIndice): VocePulita => ({ nome: v.nome, byte: byteDi.get(v.nome) ?? v.size, percorso, voce: v })
  const fuori: Proposta[] = []

  // Le chat per conversazione e per cartella (slug); quelle delle prove a parte.
  const perSessione = new Map<string, Map<string, { principale?: [string, VoceIndice]; altri: [string, VoceIndice][] }>>()
  const prove: VocePulita[] = []
  for (const [percorso, v] of Object.entries(p.indice)) {
    if (giaFuori.has(v.nome)) continue
    const c = chatDi(percorso)
    if (c === undefined) continue
    if (slugDiProva(c.slug)) { prove.push(voce(percorso, v)); continue }
    const s = perSessione.get(c.sessione) ?? new Map()
    const g = s.get(c.slug) ?? { altri: [] }
    if (c.principale) g.principale = [percorso, v]
    else g.altri.push([percorso, v])
    s.set(c.slug, g)
    perSessione.set(c.sessione, s)
  }

  if (prove.length > 0) {
    fuori.push({
      tipo: 'prove',
      titolo: 'Chat delle prove',
      breve: `${contaChat(prove)} chat usate per collaudare SierraDeck`,
      spiega: 'Chat avviate nelle prove del programma: in una cartella «SierraDeck-prova-…» o nella cartella di lavoro temporanea di una sessione di Claude Code. Non servono a niente di vero. Vanno nel recupero per 30 giorni e «Annulla» le rimette.',
      voci: prove,
      byte: somma(prove)
    })
  }

  // 1. Copie doppie: la stessa conversazione salvata sotto due cartelle (lo
  // slug di due PC diversi). Resta la più lunga (a pari lunghezza la più nuova).
  const doppie: VocePulita[] = []
  for (const slugs of perSessione.values()) {
    const conChat = [...slugs.entries()].filter(([, g]) => g.principale !== undefined)
    if (conChat.length < 2) continue
    conChat.sort(([, a], [, b]) => (b.principale?.[1].size ?? 0) - (a.principale?.[1].size ?? 0) || (b.principale?.[1].mtime ?? 0) - (a.principale?.[1].mtime ?? 0))
    for (const [, g] of conChat.slice(1)) {
      if (g.principale !== undefined) doppie.push(voce(...g.principale))
      for (const a of g.altri) doppie.push(voce(...a))
    }
  }
  if (doppie.length > 0) {
    fuori.push({
      tipo: 'doppie',
      titolo: 'Copie doppie',
      breve: `${contaChat(doppie)} chat salvate due volte`,
      spiega: 'La stessa conversazione è sul Drive sotto due cartelle, una per PC. Resta la copia più lunga; l’altra va nel recupero per 30 giorni e si può rimettere con «Annulla».',
      voci: doppie,
      byte: somma(doppie)
    })
  }

  // 2. Chat vecchie già sui PC: ferme da più di 60 giorni e sul disco di un PC
  // con almeno la stessa lunghezza. Il Drive non è l'unica copia.
  const nomiDoppie = new Set(doppie.map((d) => d.nome))
  const vecchie: VocePulita[] = []
  for (const [sessione, slugs] of perSessione) {
    for (const g of slugs.values()) {
      if (g.principale === undefined || nomiDoppie.has(g.principale[1].nome)) continue
      const [percorso, v] = g.principale
      if (p.adesso - v.mtime < VECCHIE_DOPO_MS) continue
      const sulPc = (p.copieSuiPc.get(sessione) ?? []).some((c) => c.size >= v.size)
      if (!sulPc) continue
      vecchie.push(voce(percorso, v))
      for (const a of g.altri) vecchie.push(voce(...a))
    }
  }
  if (vecchie.length > 0) {
    fuori.push({
      tipo: 'vecchie',
      titolo: 'Chat vecchie già sui PC',
      breve: `${contaChat(vecchie)} chat ferme da più di 60 giorni, già su un PC`,
      spiega: 'Chat che nessuno tocca da più di 60 giorni e che sono intere sul disco di almeno un PC. Tolte dal Drive restano su quel PC; se una riprende a lavorare, risale da sola. Per 30 giorni stanno nel recupero e «Annulla» le rimette.',
      voci: vecchie,
      byte: somma(vecchie)
    })
  }

  // 3. Recupero scaduto: copie di sicurezza del manifesto più vecchie di 30
  // giorni, e file dei dati che nessuna voce usa più (vecchi di due giorni).
  const perNome = percorsiPerNome(p.indice)
  const scaduti: VocePulita[] = []
  for (const f of p.file) {
    if (giaFuori.has(f.nome)) continue
    const eta = f.modificato !== undefined ? p.adesso - Date.parse(f.modificato) : 0
    if (f.nome.startsWith(`${NOME_MANIFESTO}.`) && eta > RECUPERO_SCADE_MS) scaduti.push({ nome: f.nome, byte: f.byte })
    else if (f.nome.startsWith('f_') && !perNome.has(f.nome) && eta > ORFANO_DOPO_MS) scaduti.push({ nome: f.nome, byte: f.byte })
  }
  if (scaduti.length > 0) {
    fuori.push({
      tipo: 'recupero-scaduto',
      titolo: 'Recupero scaduto',
      breve: `${scaduti.length} file di recupero vecchi o senza voce`,
      spiega: 'Copie di sicurezza dell’indice più vecchie di 30 giorni, e file che l’indice non usa più (resti di salvataggi interrotti). Nessuna chat o progetto li legge. Restano 30 giorni nel recupero prima di sparire.',
      voci: scaduti,
      byte: somma(scaduti)
    })
  }
  return fuori
}

/**
 * «Elimina dal PC … anche dal Drive» (0.79.0): le copie sul Drive di quelle
 * conversazioni (la trascrizione e i suoi sotto-agenti), come una pulizia:
 * nel recupero del Drive per 30 giorni, annullabile. Quelle già in un
 * recupero non si contano due volte.
 */
export function propostaChatEliminate(p: { file: FileDrive[]; indice: IndiceDrive; sessioni: readonly string[]; titolo: string; pulizie?: RegistroPulizie }): Proposta {
  const byteDi = new Map(p.file.map((f) => [f.nome, f.byte]))
  const giaFuori = nomiInRecupero(p.pulizie)
  const volute = new Set(p.sessioni.map((s) => s.toLowerCase()))
  const voci: VocePulita[] = []
  for (const [percorso, v] of Object.entries(p.indice)) {
    const c = chatDi(percorso)
    if (c === undefined || !volute.has(c.sessione.toLowerCase()) || giaFuori.has(v.nome)) continue
    voci.push({ nome: v.nome, byte: byteDi.get(v.nome) ?? v.size, percorso, voce: v })
  }
  const n = new Set(voci.map((v) => chatDi(v.percorso as string)?.sessione)).size
  return {
    tipo: 'chat-eliminate',
    titolo: p.titolo,
    breve: `${n === 1 ? '1 chat eliminata' : `${n} chat eliminate`} dal PC, anche dal Drive`,
    spiega: 'Le copie sul Drive delle chat eliminate dal PC. Restano 30 giorni nel recupero del Drive: «Annulla» le rimette.',
    voci,
    byte: somma(voci)
  }
}

function somma(v: VocePulita[]): number { return v.reduce((t, x) => t + x.byte, 0) }
function contaChat(v: VocePulita[]): number { return v.filter((x) => x.percorso !== undefined && chatDi(x.percorso)?.principale === true).length }

/* ------------------------------------------------------------------ */
/* Il registro delle pulizie: recupero e annullamento.                 */
/* ------------------------------------------------------------------ */

export type Pulizia = {
  id: string
  tipo: TipoProposta
  titolo: string
  quando: string
  /** Il PC dove Nicholas l'ha confermata. */
  chi: string
  scadeIl: string
  voci: VocePulita[]
  byte: number
  annullataIl?: string
  svuotataIl?: string
}

export type RegistroPulizie = { versione: 1; pulizie: Pulizia[] }

export function puliziaVuota(): RegistroPulizie { return { versione: 1, pulizie: [] } }

export function leggiPulizie(x: unknown): RegistroPulizie {
  if (typeof x !== 'object' || x === null || !Array.isArray((x as { pulizie?: unknown }).pulizie)) return puliziaVuota()
  const pulizie = ((x as { pulizie: unknown[] }).pulizie).filter((p): p is Pulizia => {
    if (typeof p !== 'object' || p === null) return false
    const o = p as Record<string, unknown>
    return typeof o.id === 'string' && typeof o.quando === 'string' && typeof o.scadeIl === 'string' && Array.isArray(o.voci)
  })
  return { versione: 1, pulizie }
}

/** Una pulizia nuova da una proposta confermata. */
export function nuovaPulizia(pr: Proposta, p: { id: string; chi: string; adesso: number }): Pulizia {
  return {
    id: p.id, tipo: pr.tipo, titolo: pr.titolo, quando: new Date(p.adesso).toISOString(), chi: p.chi,
    scadeIl: new Date(p.adesso + RECUPERO_SCADE_MS).toISOString(), voci: pr.voci, byte: pr.byte
  }
}

/** Una pulizia ancora in recupero: né annullata né svuotata. */
export function inRecupero(x: Pulizia): boolean { return x.annullataIl === undefined && x.svuotataIl === undefined }

/** I file di tutte le pulizie in recupero. */
export function nomiInRecupero(r: RegistroPulizie | undefined): Set<string> {
  return new Set((r?.pulizie ?? []).filter(inRecupero).flatMap((x) => x.voci.map((v) => v.nome)))
}

/** Il manifesto senza le voci di una pulizia. */
export function indiceSenza(indice: IndiceDrive, voci: VocePulita[]): IndiceDrive {
  const togli = new Set(voci.map((v) => v.percorso).filter((x): x is string => x !== undefined))
  return Object.fromEntries(Object.entries(indice).filter(([p]) => !togli.has(p)))
}

/**
 * «Annulla»: le voci tornano nel manifesto, **se** il file c'è ancora e se
 * nel frattempo nessuno ha scritto un'altra voce sullo stesso percorso (una
 * chat ripresa e risalita: quella nuova vince).
 */
export function indiceConDiNuovo(indice: IndiceDrive, voci: VocePulita[], esiste: (nome: string) => boolean): { indice: IndiceDrive; rimesse: number; restano: number } {
  const fuori: IndiceDrive = { ...indice }
  let rimesse = 0
  let restano = 0
  for (const v of voci) {
    if (v.percorso === undefined || v.voce === undefined) continue
    if (fuori[v.percorso] !== undefined || !esiste(v.nome)) { restano += 1; continue }
    fuori[v.percorso] = v.voce
    rimesse += 1
  }
  return { indice: fuori, rimesse, restano }
}

/**
 * Le proposte che vanno nel recupero da sole (0.69.0), senza chiedere: solo il
 * «recupero scaduto» (copie dell'indice più vecchie di 30 giorni, file che
 * nessuna voce usa). Resta comunque 30 giorni nel recupero, annullabile, poi
 * si svuota da solo. Le doppie no: si mostrano a Nicholas e decide lui.
 */
export const PULIZIE_DA_SOLE: readonly TipoProposta[] = ['recupero-scaduto']
/** Ogni quanto al massimo il giro guarda se c'è del recupero scaduto da mettere da parte. */
export const PULIZIA_DA_SOLA_OGNI_MS = 24 * 60 * 60_000
export function pulizieDaSole(proposte: Proposta[]): Proposta[] {
  return proposte.filter((p) => PULIZIE_DA_SOLE.includes(p.tipo) && p.voci.length > 0)
}

/** Le pulizie scadute: i loro file si cancellano davvero. */
export function daSvuotare(r: RegistroPulizie, adesso: number): Pulizia[] {
  return r.pulizie.filter((x) => inRecupero(x) && Date.parse(x.scadeIl) <= adesso)
}

/**
 * Un percorso tolto dal Drive con una pulizia non risale finché è uguale a
 * come era: la copia di un PC lo ricaricherebbe al primo salvataggio. Se la
 * chat cambia (più lunga), risale come ogni altra.
 */
export function restaFuori(r: RegistroPulizie | undefined, percorso: string, size: number | undefined): boolean {
  for (const x of r?.pulizie ?? []) {
    if (x.annullataIl !== undefined) continue
    const v = x.voci.find((y) => y.percorso === percorso)
    if (v?.voce !== undefined && (size === undefined || size <= v.voce.size)) return true
  }
  return false
}

/** Byte leggibili: 1,2 GB, 340 MB, 12 KB. */
export function byteLeggibili(n: number): string {
  const u = ['byte', 'KB', 'MB', 'GB', 'TB']
  let x = n
  let i = 0
  while (x >= 1024 && i < u.length - 1) { x /= 1024; i += 1 }
  return `${i === 0 ? String(x) : x.toFixed(x < 10 ? 1 : 0).replace('.', ',')} ${u[i]}`
}
