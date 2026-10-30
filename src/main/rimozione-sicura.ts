import { createHash, randomUUID } from 'node:crypto'
import { createReadStream, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, appendFileSync, writeFileSync, copyFileSync } from 'node:fs'
import { dirname, join, parse, relative, resolve, sep } from 'node:path'
import { PEZZO_BYTE } from '@shared/allegati'
import {
  cartellaRecuperati, classifica, destinazioneRecupero, esclusa, OPZIONI_RIMOZIONE, PREFISSO_DOMANDA_RIMOZIONE, riassunto, scadenza, scadute,
  type CartellaInRecupero, type Classificata, type EsitoRecupero, type StatoRimozione, type VoceChat, type VoceFile
} from '@shared/rimozione-sicura'
import { scriviJsonAtomico } from '@shared/scrittura-atomica'
import type { DomandaPerDomande } from '@shared/domande-telefono'
import { cartellaDiProva } from '@shared/chat-di-prova'
import { pathToSlug } from './indexer/project-scanner'

/**
 * La rimozione sicura di un progetto da un PC che non ne è il residente
 * (0.58.0, tappa 3). Le regole in `@shared/rimozione-sicura`.
 *
 * Due lati:
 * - **il residente** (`creaLatoResidente`): confronta, e riceve i file utili a
 *   pezzi, nella cartella dei recuperati del suo progetto, mai sopra i suoi;
 * - **chi toglie** (`creaRimozione`): elenca i suoi file, chiede l'analisi,
 *   manda le voci utili, fa il riassunto, e alla conferma **sposta** la
 *   cartella nella cartella di recupero di SierraDeck (30 giorni,
 *   ripristinabile). Nessuna cancellazione: la cartella si sposta, e anche
 *   dopo la scadenza va nel Cestino solo con la conferma di Nicholas.
 */

/** Oltre questi file l'elenco non si fa: non si potrebbe garantire che niente si perda. */
export const FILE_MAX = 50_000

const sha256 = (file: string): Promise<string> => new Promise((ok, ko) => {
  const h = createHash('sha256')
  createReadStream(file).on('data', (d) => h.update(d)).on('end', () => ok(h.digest('hex'))).on('error', ko)
})

/**
 * I file di un progetto, con impronta; i collegamenti non si seguono,
 * `node_modules` e i recuperati no. `scarta` (0.60.0): altre cartelle da
 * saltare senza nemmeno leggerle (l'unione salta `.git`).
 */
export async function elencaFile(cartella: string, max = FILE_MAX, scarta?: (relativo: string) => boolean): Promise<VoceFile[] | { troppi: number }> {
  const fuori: VoceFile[] = []
  const coda = ['']
  let visti = 0
  while (coda.length > 0) {
    const rel = coda.shift() as string
    let voci: string[]
    try { voci = readdirSync(join(cartella, rel)) } catch { continue }
    for (const n of voci) {
      const r = rel === '' ? n : `${rel}/${n}`
      if (esclusa(r) || scarta?.(r) === true) continue
      const p = join(cartella, r)
      let s
      try { s = lstatSync(p) } catch { continue }
      if (s.isSymbolicLink()) continue
      if (s.isDirectory()) { coda.push(r); continue }
      if (!s.isFile()) continue
      visti += 1
      if (visti > max) return { troppi: visti }
      fuori.push({ percorso: r, size: s.size, mtime: Math.round(s.mtimeMs), sha: await sha256(p) })
    }
  }
  return fuori
}

/* ------------------------------------------------------------------ */
/* Il lato del residente.                                              */
/* ------------------------------------------------------------------ */

export type LatoResidente = {
  analizza: (corpo: unknown) => Promise<{ ok: true; voci: Classificata[]; cartella: string } | { ok: false; errore: string }>
  /** Quanti byte di quel file recuperato sono già arrivati (per riprendere). */
  stato: (corpo: unknown) => { ok: true; ricevuti: number } | { ok: false; errore: string }
  pezzo: (corpo: unknown) => Promise<{ ok: true; ricevuti: number; dove?: string } | { ok: false; errore: string }>
}

export function creaLatoResidente(deps: {
  io: () => { id: string }
  /** La cartella del progetto su questo PC. */
  cartellaDi: (progetto: string) => string | undefined
  /** Le chat di questo PC: dove sta il .jsonl, per sessione. */
  chatQui: (sessione: string) => string | undefined
  /** Dove mettere una chat che qui manca del tutto (cartella di Claude Code per quel progetto). */
  cartellaChat?: (progetto: string) => string | undefined
  log?: (m: string) => void
}): LatoResidente {
  const o = (x: unknown): Record<string, unknown> => (typeof x === 'object' && x !== null ? x as Record<string, unknown> : {})
  const s = (x: unknown): string => (typeof x === 'string' ? x : '')
  /** Il file dentro il progetto per una destinazione già controllata. */
  const assoluto = (radice: string, rel: string): string | undefined => {
    const p = resolve(radice, rel)
    return p.startsWith(resolve(radice) + sep) ? p : undefined
  }
  return {
    async analizza(corpo) {
      const c = o(corpo)
      const progetto = s(c.progetto)
      const radice = deps.cartellaDi(progetto)
      if (radice === undefined || !existsSync(radice)) return { ok: false, errore: 'Questo PC è il residente, ma la cartella del progetto qui non c’è: niente confronto, niente rimozione. Prima porta qui il progetto.' }
      const file = Array.isArray(c.file) ? (c.file as unknown[]).flatMap((f) => {
        const x = o(f)
        return typeof x.percorso === 'string' && typeof x.size === 'number' && typeof x.mtime === 'number' && typeof x.sha === 'string' ? [{ percorso: x.percorso, size: x.size, mtime: x.mtime, sha: x.sha }] : []
      }) : []
      const chat = Array.isArray(c.chat) ? (c.chat as unknown[]).flatMap((f) => {
        const x = o(f)
        return typeof x.sessione === 'string' && typeof x.size === 'number' && typeof x.mtime === 'number' ? [{ sessione: x.sessione, size: x.size, mtime: x.mtime }] : []
      }) : []
      const miei = await elencaFile(radice)
      if (!Array.isArray(miei)) return { ok: false, errore: `Il progetto qui ha più di ${FILE_MAX} file: il confronto non si fa, per non rischiare di perdere qualcosa.` }
      const mieChat: VoceChat[] = chat.flatMap((x) => {
        const p = deps.chatQui(x.sessione)
        if (p === undefined) return []
        try { const st = statSync(p); return [{ sessione: x.sessione, size: st.size, mtime: Math.round(st.mtimeMs) }] } catch { return [] }
      })
      const voci = classifica({ file, chat }, { file: miei, chat: mieChat })
      const cartella = cartellaRecuperati(s(c.daNome) || 'PC', new Date().toISOString())
      deps.log?.(`[rimozione] confronto per «${s(c.nome) || progetto}» chiesto da ${s(c.daNome) || 'un PC'}: ${voci.filter((v) => v.classe === 'utile').length} voci utili su ${voci.length}`)
      return { ok: true, voci, cartella }
    },

    stato(corpo) {
      const c = o(corpo)
      const radice = deps.cartellaDi(s(c.progetto))
      const dest = destinazioneRecupero(s(c.cartella), s(c.relativo))
      if (radice === undefined || dest === undefined) return { ok: false, errore: 'Destinazione non valida.' }
      const p = assoluto(radice, dest)
      if (p === undefined) return { ok: false, errore: 'Destinazione non valida.' }
      const parte = `${p}.parte`
      try { return { ok: true, ricevuti: existsSync(parte) ? statSync(parte).size : 0 } } catch { return { ok: true, ricevuti: 0 } }
    },

    async pezzo(corpo) {
      const c = o(corpo)
      const progetto = s(c.progetto)
      const radice = deps.cartellaDi(progetto)
      const dest = destinazioneRecupero(s(c.cartella), s(c.relativo))
      if (radice === undefined || dest === undefined) return { ok: false, errore: 'Destinazione non valida: il recupero va solo nella cartella dei recuperati del progetto.' }
      const p = assoluto(radice, dest)
      if (p === undefined) return { ok: false, errore: 'Destinazione fuori dal progetto.' }
      const parte = `${p}.parte`
      const da = typeof c.da === 'number' ? c.da : -1
      mkdirSync(dirname(p), { recursive: true })
      const gia = existsSync(parte) ? statSync(parte).size : 0
      if (da !== gia) return { ok: false, errore: `pezzo fuori posto (atteso da ${gia})` }
      const dati = Buffer.from(s(c.dati), 'base64')
      if (dati.length > PEZZO_BYTE) return { ok: false, errore: 'pezzo troppo grande' }
      appendFileSync(parte, dati)
      const ricevuti = gia + dati.length
      if (c.fine !== true) return { ok: true, ricevuti }
      const sha = await sha256(parte)
      if (typeof c.sha === 'string' && c.sha !== sha) {
        renameSync(parte, `${parte}.scartato-${Date.now()}`)
        return { ok: false, errore: 'impronta diversa: arrivato male, si ricomincia' }
      }
      // Mai sopra un file che c'è già: «nome (2)», «nome (3)»…
      let finale = p
      for (let i = 2; existsSync(finale); i += 1) { const q = parse(p); finale = join(q.dir, `${q.name} (${i})${q.ext}`) }
      renameSync(parte, finale)
      let dove = relative(radice, finale).split(sep).join('/')
      // Una chat che qui manca del tutto entra anche fra le chat di Claude Code (file nuovo: niente si sovrascrive).
      if (c.chat === true && typeof c.sessione === 'string' && deps.chatQui(c.sessione) === undefined) {
        const cc = deps.cartellaChat?.(progetto)
        if (cc !== undefined) {
          const nuova = join(cc, `${c.sessione}.jsonl`)
          if (!existsSync(nuova)) {
            mkdirSync(cc, { recursive: true })
            writeFileSync(nuova, readFileSync(finale))
            dove = `${dove} (e fra le chat di questo PC)`
          }
        }
      }
      return { ok: true, ricevuti, dove }
    }
  }
}

/* ------------------------------------------------------------------ */
/* Il lato di chi toglie.                                              */
/* ------------------------------------------------------------------ */

export type { FaseRimozione, StatoRimozione } from '@shared/rimozione-sicura'

/** L'elenco delle cartelle in recupero, condiviso dalla rimozione sicura e dall'unione (0.60.0). */
export function fileElencoRecupero(dati: string): string { return join(dati, 'recupero-progetti', 'elenco.json') }
export function leggiElencoRecupero(dati: string): CartellaInRecupero[] {
  try { const x = JSON.parse(readFileSync(fileElencoRecupero(dati), 'utf8')) as unknown; return Array.isArray(x) ? x as CartellaInRecupero[] : [] } catch { return [] }
}
function scriviElencoRecupero(dati: string, e: CartellaInRecupero[]): void {
  const file = fileElencoRecupero(dati)
  mkdirSync(dirname(file), { recursive: true })
  // Un elenco che c'è ma non si legge (analisi 0.81.0) si leggeva come vuoto, e
  // questa scrittura lo sostituiva: le cartelle già nel recupero restavano senza
  // «Ripristina». Prima di riscriverlo se ne tiene una copia accanto, e lo si dice.
  if (existsSync(file)) {
    let leggibile = true
    try { JSON.parse(readFileSync(file, 'utf8')) } catch { leggibile = false }
    if (!leggibile) {
      const accanto = `${file}.illeggibile-${new Date().toISOString().replace(/[:.]/g, '-')}`
      try { copyFileSync(file, accanto); console.error(`[rimozione] elenco del recupero illeggibile: messo da parte in ${accanto}`) } catch (err) {
        console.error(`[rimozione] elenco del recupero illeggibile e non copiabile (${String(err)}): non lo riscrivo`)
        return
      }
    }
  }
  scriviJsonAtomico(file, e, 'rimozione')
}

/**
 * Sposta una cartella nella cartella di recupero di SierraDeck (30 giorni,
 * ripristinabile da «Cartelle in recupero»). Sullo stesso disco, così è un
 * rename: niente copie a metà. Un file in uso → `in-uso`, la cartella resta.
 */
export function spostaCartellaInRecupero(dati: string, cartella: string, info: { progetto: string; nome: string; motivo: string; quando: string }):
  { ok: true; id: string; dove: string } | { ok: false; inUso: boolean; messaggio: string } {
  const stessoDisco = parse(resolve(cartella)).root.toLowerCase() === parse(resolve(dati)).root.toLowerCase()
  const id = `${info.nome.replace(/[^A-Za-z0-9_-]+/g, '-')}-${info.quando.replace(/[:.]/g, '-')}`
  const dove = stessoDisco ? join(dati, 'recupero-progetti', id) : join(dirname(resolve(cartella)), '.sierradeck-recupero', id)
  try {
    mkdirSync(dirname(dove), { recursive: true })
    renameSync(cartella, dove)
  } catch (err) {
    const codice = (err as { code?: string }).code ?? ''
    if (codice === 'EBUSY' || codice === 'EPERM' || codice === 'EACCES') return { ok: false, inUso: true, messaggio: `un programma usa un file della cartella (${codice}): chiudi quello che la usa (un editor, un terminale, un server) e riprova` }
    return { ok: false, inUso: false, messaggio: `non sono riuscito a spostarla: ${String(err)}; è ancora al suo posto` }
  }
  scriviElencoRecupero(dati, [...leggiElencoRecupero(dati), {
    id, progetto: info.progetto, nome: info.nome, percorsoOriginale: cartella, dove, quando: info.quando, scadeIl: scadenza(info.quando), motivo: info.motivo
  }])
  return { ok: true, id, dove }
}

/**
 * Le storie di Claude Code di un progetto di prova (0.75.2): quando chi
 * collauda toglie un progetto «SierraDeck-prova-…», le sue conversazioni in
 * `~/.claude/projects` restavano, e il salvataggio le teneva sul Drive. Vanno
 * nel recupero con la cartella: quella della cartella di qui, e le copie
 * arrivate dagli altri PC (stesso nome di prova in fondo, altro percorso).
 * Solo per un nome di prova: per i progetti veri le storie non si toccano.
 */
export function storieDiProvaInRecupero(dati: string, radiceProjects: string, cartella: string, info: { progetto: string; nome: string; quando: string }):
  { spostate: string[]; nonSpostate: string[] } {
  const esito = { spostate: [] as string[], nonSpostate: [] as string[] }
  if (!cartellaDiProva(info.nome) || !existsSync(radiceProjects)) return esito
  const dellaCartella = pathToSlug(resolve(cartella)).toLowerCase()
  const finale = `-${pathToSlug(info.nome)}`.toLowerCase()
  let voci: string[] = []
  try { voci = readdirSync(radiceProjects) } catch { return esito }
  for (const v of voci) {
    const basso = v.toLowerCase()
    if (basso !== dellaCartella && !basso.endsWith(finale)) continue
    const percorso = join(radiceProjects, v)
    try { if (!statSync(percorso).isDirectory()) continue } catch { continue }
    const e = spostaCartellaInRecupero(dati, percorso, { progetto: info.progetto, nome: v, motivo: `storia delle chat del progetto di prova «${info.nome}»`, quando: info.quando })
    if (e.ok) esito.spostate.push(v)
    else esito.nonSpostate.push(`${v}: ${e.messaggio}`)
  }
  return esito
}

/** Rimette al suo posto una cartella in recupero: mai sopra un'altra cartella. */
/**
 * I progetti con una cartella di questo PC ancora nella cartella di recupero
 * (0.60.7): per l'allineamento vogliono dire «qui no», finché non si
 * ripristinano. Quelle già rimesse al loro posto non contano.
 */
export function progettiInRecupero(dati: string): Set<string> {
  return new Set(leggiElencoRecupero(dati).filter((c) => c.ripristinataIl === undefined && c.progetto !== '').map((c) => c.progetto))
}

export function ripristinaDaRecupero(dati: string, id: string, quando: string): { ok: boolean; messaggio: string; nome?: string; percorso?: string } {
  const e = leggiElencoRecupero(dati)
  const c = e.find((x) => x.id === id)
  if (c === undefined || c.ripristinataIl !== undefined) return { ok: false, messaggio: 'Questa cartella non è più in recupero.' }
  if (existsSync(c.percorsoOriginale)) return { ok: false, messaggio: `Al suo posto (${c.percorsoOriginale}) adesso c’è un’altra cartella: non la sovrascrivo. Spostala o rinominala, poi riprova.` }
  try {
    mkdirSync(dirname(c.percorsoOriginale), { recursive: true })
    renameSync(c.dove, c.percorsoOriginale)
  } catch (err) { return { ok: false, messaggio: `Non riesco a rimetterla: ${String(err)}. È ancora in ${c.dove}.` } }
  scriviElencoRecupero(dati, e.map((x) => (x.id === id ? { ...x, ripristinataIl: quando } : x)))
  return { ok: true, messaggio: `Rimessa al suo posto: ${c.percorsoOriginale}.`, nome: c.nome, percorso: c.percorsoOriginale }
}

export type Rimozione = {
  avvia: (progetto: string) => Promise<StatoRimozione>
  conferma: (progetto: string) => StatoRimozione
  annulla: (progetto: string) => StatoRimozione
  stati: () => StatoRimozione[]
  inRecupero: () => CartellaInRecupero[]
  ripristina: (id: string) => { ok: boolean; messaggio: string }
  /** Solo per le scadute, solo su conferma: nel Cestino di Windows, non cancellata. */
  cestina: (id: string) => Promise<{ ok: boolean; messaggio: string }>
  domande: () => DomandaPerDomande[]
  rispondi: (idDomanda: string, risposta: string) => boolean
}

export function creaRimozione(deps: {
  dati: string
  io: () => { id: string; nome: string }
  progetto: (id: string) => { id: string; nome: string; cartella?: string; residente?: { pc: string; nome: string } } | undefined
  /** Le chat di questo PC dentro quella cartella. */
  chatDi: (cartella: string) => { sessione: string; jsonl: string }[]
  /** Una chat è aperta (riquadro vivo) su quella cartella, o ci lavora un autopilota. */
  inUso: (cartella: string) => string | undefined
  /** Una chiamata al residente, firmata e sulle strade che ci sono (rete di casa, Tailscale). */
  chiama: (pc: string, percorso: string, corpo: unknown) => Promise<unknown>
  cestino?: (percorso: string) => Promise<void>
  log?: (m: string) => void
  avvisa?: () => void
  adesso?: () => number
}): Rimozione {
  const adesso = deps.adesso ?? (() => Date.now())
  const iso = (): string => new Date(adesso()).toISOString()
  const stati = new Map<string, StatoRimozione>()
  const leggiElenco = (): CartellaInRecupero[] => leggiElencoRecupero(deps.dati)
  const scriviElenco = (e: CartellaInRecupero[]): void => scriviElencoRecupero(deps.dati, e)
  const metti = (s: StatoRimozione): StatoRimozione => { stati.set(s.progetto, s); deps.avvisa?.(); return s }

  const sposta = (st: StatoRimozione): StatoRimozione => {
    const g = deps.progetto(st.progetto)
    const cartella = g?.cartella
    if (g === undefined || cartella === undefined || !existsSync(cartella)) return metti({ ...st, fase: 'errore', messaggio: 'La cartella di questo PC non c’è più: niente da spostare.' })
    const uso = deps.inUso(cartella)
    if (uso !== undefined) return metti({ ...st, fase: 'in-uso', messaggio: `Non la tolgo adesso: ${uso}. Aspetto: riprova quando ha finito.` })
    const quando = iso()
    // Uno spostamento, mai una cancellazione. Se un programma tiene aperto un file, Windows lo rifiuta.
    const r = spostaCartellaInRecupero(deps.dati, cartella, {
      progetto: g.id, nome: g.nome, quando,
      motivo: `solo cloud: il residente è ${st.residente}; confronto fatto, ${st.riassunto?.recuperati.length ?? 0} voci recuperate là`
    })
    if (!r.ok) return metti({ ...st, fase: r.inUso ? 'in-uso' : 'errore', messaggio: `Non la tolgo adesso: ${r.messaggio}.` })
    const dove = r.dove
    deps.log?.(`[rimozione] «${g.nome}» tolto da questo PC: la cartella è in ${dove} per 30 giorni, ripristinabile`)
    return metti({ ...st, fase: 'spostata', messaggio: `Tolto da questo PC. La cartella è nella cartella di recupero di SierraDeck fino al ${new Date(Date.parse(scadenza(quando))).toLocaleDateString('it-IT')}: «Ripristina» la rimette dov’era.` })
  }

  return {
    async avvia(progetto) {
      const g = deps.progetto(progetto)
      const base = { progetto, nome: g?.nome ?? progetto, residente: g?.residente?.nome ?? '?', quando: iso() }
      if (g === undefined || g.cartella === undefined || !existsSync(g.cartella)) return metti({ ...base, fase: 'errore', messaggio: 'Su questo PC il progetto non ha una cartella: non c’è niente da togliere.' })
      if (g.residente === undefined) return metti({ ...base, fase: 'errore', messaggio: 'Il progetto non ha un PC residente: scegline uno prima, così so con chi confrontare.' })
      if (g.residente.pc === deps.io().id) return metti({ ...base, fase: 'errore', messaggio: 'Questo PC è il residente: il progetto resta qui.' })
      const uso = deps.inUso(g.cartella)
      if (uso !== undefined) return metti({ ...base, fase: 'in-uso', messaggio: `Non comincio adesso: ${uso}. Riprova quando ha finito.` })
      metti({ ...base, fase: 'analisi', messaggio: `Elenco i file di qui e chiedo a ${g.residente.nome} di confrontarli…` })
      const file = await elencaFile(g.cartella)
      if (!Array.isArray(file)) return metti({ ...base, fase: 'errore', messaggio: `Il progetto qui ha più di ${FILE_MAX} file: non lo confronto e non lo tolgo, per non rischiare di perdere qualcosa.` })
      const chatQui = deps.chatDi(g.cartella)
      const chat = chatQui.flatMap((c) => { try { const s = statSync(c.jsonl); return [{ sessione: c.sessione, size: s.size, mtime: Math.round(s.mtimeMs) }] } catch { return [] } })
      let analisi: { ok?: boolean; voci?: Classificata[]; cartella?: string; errore?: string }
      try {
        analisi = await deps.chiama(g.residente.pc, '/api/rimozione/analisi', { progetto, nome: g.nome, daNome: deps.io().nome, file, chat }) as typeof analisi
      } catch (err) {
        const perche = (err instanceof Error ? err.message : String(err)).replace(/^Questo PC /, 'Quel PC ').replace(/[.\s]+$/, '')
        return metti({ ...base, fase: 'errore', messaggio: `${g.residente.nome} (il residente) non si raggiunge: ${perche}. Senza il suo confronto non tolgo niente: riprova quando è acceso e raggiungibile.` })
      }
      if (analisi.ok !== true || !Array.isArray(analisi.voci) || typeof analisi.cartella !== 'string') {
        return metti({ ...base, fase: 'errore', messaggio: `${g.residente.nome} non ha potuto confrontare: ${analisi.errore ?? 'risposta non valida'}. Non tolgo niente.` })
      }
      const voci = analisi.voci
      metti({ ...base, fase: 'recupero', messaggio: `Copio su ${g.residente.nome} quello che c’è solo qui…` })
      const esiti: EsitoRecupero[] = []
      for (const v of voci.filter((x) => x.classe === 'utile')) {
        const percorso = v.tipo === 'file' ? v.voce.percorso : v.voce.sessione
        const sorgente = v.tipo === 'file' ? join(g.cartella, v.voce.percorso) : chatQui.find((c) => c.sessione === v.voce.sessione)?.jsonl
        const relativo = v.tipo === 'file' ? v.voce.percorso : `chat/${v.voce.sessione}.jsonl`
        if (sorgente === undefined) { esiti.push({ percorso, tipo: v.tipo, errore: 'il file qui non si trova più' }); continue }
        try {
          const st = await deps.chiama(g.residente.pc, '/api/rimozione/stato', { progetto, cartella: analisi.cartella, relativo }) as { ricevuti?: number }
          const tutto = readFileSync(sorgente)
          const sha = createHash('sha256').update(tutto).digest('hex')
          let da = typeof st.ricevuti === 'number' && st.ricevuti <= tutto.length ? st.ricevuti : 0
          let dove: string | undefined
          do {
            const pezzo = tutto.subarray(da, da + PEZZO_BYTE)
            const fine = da + pezzo.length >= tutto.length
            const r = await deps.chiama(g.residente.pc, '/api/rimozione/pezzo', {
              progetto, cartella: analisi.cartella, relativo, da, dati: pezzo.toString('base64'), fine, sha,
              ...(v.tipo === 'chat' ? { chat: true, sessione: v.voce.sessione } : {})
            }) as { ok?: boolean; ricevuti?: number; dove?: string; errore?: string }
            if (r.ok !== true) throw new Error(r.errore ?? 'rifiutato')
            da = r.ricevuti ?? da + pezzo.length
            if (fine) dove = r.dove
          } while (dove === undefined && da < tutto.length)
          if (dove === undefined && tutto.length === 0) dove = `${analisi.cartella}/${relativo}`
          esiti.push({ percorso, tipo: v.tipo, ...(dove !== undefined ? { dove } : { errore: 'non confermato' }) })
        } catch (err) {
          esiti.push({ percorso, tipo: v.tipo, errore: err instanceof Error ? err.message : String(err) })
        }
      }
      const r = riassunto(g.nome, g.residente.nome, voci, esiti)
      deps.log?.(`[rimozione] «${g.nome}»: ${r.uguali} uguali, ${r.doppioni} doppioni, ${r.recuperati.length} recuperati su ${g.residente.nome}, ${r.nonRecuperati.length} non recuperati`)
      const st: StatoRimozione = { ...base, fase: 'attesa-conferma', messaggio: r.testo, riassunto: r }
      // La conferma automatica: solo con zero voci utili e zero errori.
      return r.automatica ? sposta(st) : metti(st)
    },
    conferma(progetto) {
      const st = stati.get(progetto)
      if (st === undefined || (st.fase !== 'attesa-conferma' && st.fase !== 'in-uso')) return st ?? { progetto, nome: progetto, residente: '?', fase: 'errore', messaggio: 'Prima serve il confronto con il residente.', quando: iso() }
      return sposta(st)
    },
    annulla(progetto) {
      const st = stati.get(progetto)
      return metti({ ...(st ?? { progetto, nome: progetto, residente: '?', quando: iso() }), fase: 'annullata', messaggio: 'Annullato: la cartella di questo PC resta dov’è. Quello che è stato copiato sul residente resta nei suoi recuperati.' })
    },
    stati: () => [...stati.values()],
    inRecupero: () => leggiElenco(),
    ripristina(id) {
      const r = ripristinaDaRecupero(deps.dati, id, iso())
      if (!r.ok) return { ok: false, messaggio: r.messaggio }
      deps.log?.(`[rimozione] «${r.nome ?? id}» ripristinato in ${r.percorso ?? '?'}`)
      deps.avvisa?.()
      return { ok: true, messaggio: r.messaggio }
    },
    async cestina(id) {
      const c = leggiElenco().find((x) => x.id === id)
      if (c === undefined || c.ripristinataIl !== undefined) return { ok: false, messaggio: 'Questa cartella non è più in recupero.' }
      if (Date.parse(c.scadeIl) > adesso()) return { ok: false, messaggio: `Non è ancora scaduta: resta in recupero fino al ${new Date(Date.parse(c.scadeIl)).toLocaleDateString('it-IT')}.` }
      if (deps.cestino === undefined) return { ok: false, messaggio: 'Il Cestino di Windows non è disponibile.' }
      try { await deps.cestino(c.dove) } catch (err) { return { ok: false, messaggio: `Non riesco a metterla nel Cestino: ${String(err)}.` } }
      scriviElenco(leggiElenco().filter((x) => x.id !== id))
      deps.log?.(`[rimozione] «${c.nome}»: recupero scaduto, messo nel Cestino di Windows su conferma di Nicholas`)
      return { ok: true, messaggio: 'Messa nel Cestino di Windows: da lì si può ancora riprendere finché non lo svuoti.' }
    },
    domande() {
      const fuori: DomandaPerDomande[] = [...stati.values()].filter((s) => s.fase === 'attesa-conferma' && s.riassunto !== undefined).map((s) => ({
        id: `${PREFISSO_DOMANDA_RIMOZIONE}${s.progetto}`, autopilotaId: 'sierradeck:rimozione', testo: s.messaggio,
        apertaIl: Date.parse(s.quando), opzioni: [...OPZIONI_RIMOZIONE], da: `Togli «${s.nome}» da questo PC`, sotto: `confronto fatto da ${s.residente}`
      }))
      for (const c of scadute(leggiElenco(), adesso())) {
        fuori.push({
          id: `${PREFISSO_DOMANDA_RIMOZIONE}scaduta:${c.id}`, autopilotaId: 'sierradeck:rimozione',
          testo: `La cartella di «${c.nome}» tolta il ${new Date(c.quando).toLocaleDateString('it-IT')} è in recupero da 30 giorni (${c.dove}). Vuoi metterla nel Cestino di Windows? Da lì si può ancora riprendere finché non lo svuoti. «Tienila» la lascia in recupero.`,
          apertaIl: Date.parse(c.scadeIl), opzioni: ['Mettila nel Cestino', 'Tienila'], da: 'Cartella in recupero scaduta', sotto: c.percorsoOriginale
        })
      }
      return fuori
    },
    rispondi(idDomanda, risposta) {
      if (!idDomanda.startsWith(PREFISSO_DOMANDA_RIMOZIONE)) return false
      const resto = idDomanda.slice(PREFISSO_DOMANDA_RIMOZIONE.length)
      const t = risposta.trim().toLowerCase()
      if (resto.startsWith('scaduta:')) {
        const id = resto.slice('scaduta:'.length)
        if (t.startsWith('mettila')) void this.cestina(id)
        else scriviElenco(leggiElenco().map((x) => (x.id === id ? { ...x, scadeIl: scadenza(iso()) } : x)))
        return true
      }
      if (t.startsWith('conferma')) this.conferma(resto)
      else this.annulla(resto)
      return true
    }
  }
}

/** Un id per i test e per i registri. */
export function nuovoIdRimozione(): string { return randomUUID() }

/**
 * Le cartelle di chat (in `~/.claude/projects`) che stanno nel recupero di
 * questo PC e non sono state rimesse a posto (0.76.0). L'arrivo dal Drive non
 * le riporta: il 16/10 alle 07:36, tre minuti dopo aver mandato nel recupero
 * le storie delle chat di prova, la sincronia le ha riscaricate tutte («ARRIVO:
 * 10 chat da portare qui»), perché erano ancora sul Drive.
 */
export function slugChatInRecupero(dati: string, radiceProjects: string): Set<string> {
  const radice = resolve(radiceProjects).toLowerCase()
  const slugs = new Set<string>()
  for (const c of leggiElencoRecupero(dati)) {
    if (c.ripristinataIl !== undefined) continue
    const originale = resolve(c.percorsoOriginale)
    if (dirname(originale).toLowerCase() === radice) slugs.add(originale.slice(dirname(originale).length + 1))
  }
  return slugs
}
