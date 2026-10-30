import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, renameSync } from 'node:fs'
import { basename, join, relative } from 'node:path'
import { cancellaSicura } from '@shared/cancella-sicura'
import type { VoceErrore } from '@shared/storico-errori'
import { CARTELLA_ARRIVI } from './errori-arrivati'

/**
 * «Errori arrivati» (0.81.0, rifatto nella 0.88.4 per l'autopilota unico):
 * sul PC di sviluppo, gli errori che arrivano dagli altri PC diventano da soli
 * una richiesta nella coda dell'autopilota del workspace SierraDeck, che li
 * analizza, trova i difetti veri e li corregge.
 *
 * Nicholas (30/10): «voglio che gli errori arrivino in automatico e
 * l'autopilota li analizza per trovare bug e fix da applicare».
 *
 * Il giro:
 * 1. un arrivo nuovo aspetta `QUIETE_MS` senza altri arrivi: quelli vicini
 *    finiscono in **un solo** lotto;
 * 2. con la settimana del piano oltre l'80% non si parte: lo dice una volta;
 * 3. gli errori di tutti gli arrivi si **raggruppano per causa** (stesso posto,
 *    stesso messaggio a meno di numeri e id): cento righe dello stesso difetto
 *    sono un gruppo con il conteggio, i PC e le versioni;
 * 4. fuori dal lotto: gli errori visti solo su versioni più vecchie di questa
 *    (le parti di prima, spesso già tolte o corrette) e i gruppi già affidati
 *    negli ultimi giorni, **tranne** quelli che si ripresentano su una versione
 *    nuova: la correzione non è bastata, e si dice;
 * 5. il lotto si scrive in `lotto-<id>.md` e va all'autopilota come una
 *    richiesta: la coda la unisce a quelle simili, l'autopilota ne parla con
 *    Nicholas e affida il lavoro agli specialisti;
 * 6. i file degli arrivi vanno subito nel recupero (`.recupero/`, 30 giorni):
 *    il lotto ha tutto. I lotti vecchi ci vanno dopo 30 giorni.
 *
 * Lo stato sta in `.lavori.json` nella cartella degli arrivi, che è fuori da
 * git: scriverlo non sporca la cartella principale.
 */

/** Quanto deve stare zitta la cartella prima di partire: gli arrivi vicini vanno insieme. */
export const QUIETE_MS = 5 * 60_000
/** Oltre questa percentuale della settimana non si parte. */
export const TETTO_SETTIMANA = 80
/** Quanto restano i file nel recupero, e i lotti nella cartella. */
export const GIORNI_RECUPERO = 30
/** Un gruppo già affidato non si riaffida per tanto, se non si ripresenta su una versione nuova. */
export const GIORNI_GIA_AFFIDATO = 7
export const NOME_LAVORO = 'Errori arrivati'
export const CARTELLA_RECUPERO_ARRIVI = '.recupero'
const FILE_STATO = '.lavori.json'

export type StatoErroriArrivati = {
  versione: 2
  /** I gruppi affidati: chiave → quando e su che versione l'ultima volta. */
  affidati: Record<string, { il: string; versione?: string }>
  /** I lotti mandati, i più recenti in fondo (gli ultimi 50). */
  lotti: Array<{ id: string; il: string; gruppi: number; file: number }>
  /** L'ultima attesa detta, per non ripeterla a ogni giro. */
  attesa?: { testo: string; dal: string }
}

export type ArrivoInAttesa = { file: string; il: number }

export type Decisione =
  | { azione: 'niente' }
  | { azione: 'aspetta'; testo: string }
  | { azione: 'avvia'; file: string[] }

/**
 * Cosa fare adesso. Pura: la usa il giro e la provano i test. Una settimana
 * non letta non ferma niente: non si sa, e lo si scrive nel registro.
 */
export function decidiErroriArrivati(p: {
  inAttesa: readonly ArrivoInAttesa[]
  adesso: number
  settimanaPercento?: number
  quieteMs?: number
}): Decisione {
  if (p.inAttesa.length === 0) return { azione: 'niente' }
  const ultimo = Math.max(...p.inAttesa.map((a) => a.il))
  if (p.adesso - ultimo < (p.quieteMs ?? QUIETE_MS)) return { azione: 'niente' }
  if (p.settimanaPercento !== undefined && p.settimanaPercento > TETTO_SETTIMANA) {
    const quanti = `${p.inAttesa.length} ${p.inAttesa.length === 1 ? 'arrivo' : 'arrivi'}`
    return { azione: 'aspetta', testo: `Errori arrivati (${quanti}): li passo all’autopilota quando la settimana del piano scende sotto l’${TETTO_SETTIMANA}% (adesso ${Math.round(p.settimanaPercento)}%).` }
  }
  return { azione: 'avvia', file: [...p.inAttesa].sort((a, b) => a.il - b.il).map((a) => a.file) }
}

// ─── I gruppi ─────────────────────────────────────────────────────────────

export type GruppoErrori = {
  chiave: string
  dove: VoceErrore['dove']
  messaggio: string
  punto?: string
  cosa?: string
  dettagli?: string
  volte: number
  prima: string
  ultima: string
  da: string[]
  versioni: string[]
  /** Già affidato, e si ripresenta su una versione più nuova di allora. */
  ritorna?: { il: string; versione?: string }
}

/** Il messaggio senza quello che cambia ogni volta: numeri, id, percorsi dopo `‹tolto›`. */
export function normaMessaggio(m: string): string {
  return m
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '‹id›')
    .replace(/\b(?=[0-9a-f]*\d)[0-9a-f]{8,}\b/gi, '‹id›')
    .replace(/\d+/g, '#')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200)
}

export function chiaveErrore(v: Pick<VoceErrore, 'dove' | 'messaggio' | 'punto'>): string {
  return `${v.dove}|${v.punto ?? ''}|${normaMessaggio(v.messaggio)}`
}

/** `0.88.3` → `[0, 88]`; l'app del telefono ha la sua numerazione, e non si confronta. */
function minore(v: string | undefined): [number, number] | undefined {
  const m = /^(\d+)\.(\d+)\./.exec(v ?? '')
  return m === null ? undefined : [Number(m[1]), Number(m[2])]
}
const piuVecchia = (a: [number, number], b: [number, number]): boolean => a[0] < b[0] || (a[0] === b[0] && a[1] < b[1])
/** `a` più nuova di `b` (patch compresa). */
function piuNuova(a: string | undefined, b: string | undefined): boolean {
  const x = (a ?? '').split('.').map(Number)
  const y = (b ?? '').split('.').map(Number)
  for (let i = 0; i < 3; i += 1) {
    const p = x[i] ?? 0
    const q = y[i] ?? 0
    if (Number.isNaN(p) || Number.isNaN(q)) return false
    if (p !== q) return p > q
  }
  return false
}

export type ArrivoLetto = { file: string; da: string; versione?: string; voci: VoceErrore[] }

/**
 * I gruppi del lotto. Fuori: gli errori del PC su versioni più vecchie di
 * `versioneQui` (stessa 0.88 sì, 0.85 no), e i gruppi affidati da meno di
 * `GIORNI_GIA_AFFIDATO` giorni che non si sono visti su una versione più nuova.
 */
export function raggruppa(p: {
  arrivi: readonly ArrivoLetto[]
  versioneQui: string
  affidati: StatoErroriArrivati['affidati']
  adesso: number
}): { gruppi: GruppoErrori[]; vecchie: number; giaAffidati: number } {
  const qui = minore(p.versioneQui)
  const perChiave = new Map<string, GruppoErrori>()
  let vecchie = 0
  for (const a of p.arrivi) {
    for (const v of a.voci) {
      if (typeof v?.messaggio !== 'string') continue
      const ver = v.versione ?? a.versione
      const m = minore(ver)
      if (v.dove !== 'app' && qui !== undefined && m !== undefined && piuVecchia(m, qui)) { vecchie += 1; continue }
      const chiave = chiaveErrore(v)
      const g = perChiave.get(chiave)
      if (g === undefined) {
        perChiave.set(chiave, {
          chiave, dove: v.dove, messaggio: v.messaggio, volte: v.volte ?? 1, prima: v.quando, ultima: v.ultima ?? v.quando,
          da: [a.da], versioni: ver !== undefined ? [ver] : [],
          ...(v.punto !== undefined ? { punto: v.punto } : {}),
          ...(v.cosa !== undefined ? { cosa: v.cosa } : {}),
          ...(v.dettagli !== undefined ? { dettagli: v.dettagli } : {})
        })
        continue
      }
      g.volte += v.volte ?? 1
      if (v.quando < g.prima) g.prima = v.quando
      if ((v.ultima ?? v.quando) > g.ultima) { g.ultima = v.ultima ?? v.quando; if (v.cosa !== undefined) g.cosa = v.cosa }
      if (!g.da.includes(a.da)) g.da.push(a.da)
      if (ver !== undefined && !g.versioni.includes(ver)) g.versioni.push(ver)
      if (g.dettagli === undefined && v.dettagli !== undefined) g.dettagli = v.dettagli
    }
  }
  let giaAffidati = 0
  const gruppi: GruppoErrori[] = []
  for (const g of perChiave.values()) {
    const prima = p.affidati[g.chiave]
    if (prima !== undefined) {
      const recente = p.adesso - Date.parse(prima.il) < GIORNI_GIA_AFFIDATO * 86_400_000
      const dopo = g.versioni.some((v) => piuNuova(v, prima.versione))
      if (!dopo) {
        if (recente) { giaAffidati += 1; continue }
      } else {
        g.ritorna = prima
      }
    }
    gruppi.push(g)
  }
  // Prima i più frequenti: sono quelli che pesano.
  gruppi.sort((a, b) => b.volte - a.volte || b.ultima.localeCompare(a.ultima))
  return { gruppi, vecchie, giaAffidati }
}

/** Il lotto per l'autopilota, in markdown: un gruppo per sezione. */
export function testoLotto(p: { id: string; gruppi: readonly GruppoErrori[]; versioneQui: string; vecchie: number; giaAffidati: number }): string {
  const righe = [
    `# ${NOME_LAVORO} — lotto ${p.id}`,
    '',
    `${p.gruppi.length} ${p.gruppi.length === 1 ? 'gruppo' : 'gruppi'} di errori (gli stessi errori ripetuti sono un gruppo solo, con il conteggio). Il PC di sviluppo è alla ${p.versioneQui}.`,
    ...(p.vecchie > 0 ? [`Lasciati fuori: ${p.vecchie} errori visti solo su versioni più vecchie.`] : []),
    ...(p.giaAffidati > 0 ? [`Lasciati fuori: ${p.giaAffidati} gruppi già affidati negli ultimi ${GIORNI_GIA_AFFIDATO} giorni e non più visti su una versione nuova.`] : []),
    ''
  ]
  p.gruppi.forEach((g, i) => {
    righe.push(`## ${i + 1}. ${g.messaggio.slice(0, 160)}`)
    righe.push('')
    righe.push(`- dove: ${g.dove}${g.punto !== undefined ? ` · punto: \`${g.punto}\`` : ''}`)
    righe.push(`- volte: ${g.volte} · dal ${g.prima} al ${g.ultima}`)
    righe.push(`- da: ${g.da.join(', ')} · versioni: ${g.versioni.length > 0 ? g.versioni.join(', ') : 'non dette'}`)
    if (g.ritorna !== undefined) righe.push(`- **si ripresenta**: affidato il ${g.ritorna.il.slice(0, 10)}${g.ritorna.versione !== undefined ? ` (alla ${g.ritorna.versione})` : ''}, ma c’è ancora su una versione più nuova: la correzione non è bastata`)
    if (g.cosa !== undefined) righe.push(`- cosa si stava facendo: ${g.cosa}`)
    if (g.messaggio.length > 160) righe.push('', '```', g.messaggio, '```')
    if (g.dettagli !== undefined) righe.push('', '```', g.dettagli, '```')
    righe.push('')
  })
  return righe.join('\n')
}

/** La richiesta per l'autopilota: corta, il resto è nel lotto. */
export function richiestaLotto(p: { lotto: string; gruppi: number; ritornano: number }): string {
  return [
    `${NOME_LAVORO}: ${p.gruppi} ${p.gruppi === 1 ? 'gruppo' : 'gruppi'} di errori dagli altri PC${p.ritornano > 0 ? ` (${p.ritornano} si ripresentano dopo una correzione)` : ''}, raggruppati in ${p.lotto}.`,
    'Analizzali: per ogni gruppo trova la causa nel codice e separa i difetti veri da quello che non lo è (avvisi, casi attesi, parti già tolte o già corrette).',
    'Prima di correggere, dimmi in breve cosa hai trovato e cosa correggerai. Poi correggi i difetti veri, ognuno con un test.',
    'Alla fine scrivi in .sierradeck/quaderno/errori-arrivati.md, per ogni gruppo, «corretto nella versione X» o perché no. La release segue il quaderno (pubblicare-una-release.md): una sola, mai installata.'
  ].join('\n')
}

// ─── Su disco ─────────────────────────────────────────────────────────────

export function cartellaArrivi(radice: string): string {
  return join(radice, CARTELLA_ARRIVI)
}

export function leggiStatoArrivi(arrivi: string): StatoErroriArrivati {
  try {
    const o = JSON.parse(readFileSync(join(arrivi, FILE_STATO), 'utf8')) as Partial<StatoErroriArrivati>
    if (o.versione === 2 && typeof o.affidati === 'object' && o.affidati !== null) {
      return { versione: 2, affidati: o.affidati, lotti: Array.isArray(o.lotti) ? o.lotti : [], ...(o.attesa !== undefined ? { attesa: o.attesa } : {}) }
    }
  } catch { /* non c'è ancora */ }
  // Anche la versione 1 (i lavori dell'autopilota di prima): si riparte da capo.
  return { versione: 2, affidati: {}, lotti: [] }
}

export function scriviStatoArrivi(arrivi: string, s: StatoErroriArrivati): void {
  const file = join(arrivi, FILE_STATO)
  writeFileSync(`${file}.tmp`, JSON.stringify(s, null, 2), 'utf8')
  renameSync(`${file}.tmp`, file)
}

/** Gli arrivi nella cartella: `<mittente>/<ora>.json`. Quelli affidati sono già nel recupero. */
export function arriviInAttesa(arrivi: string): ArrivoInAttesa[] {
  if (!existsSync(arrivi)) return []
  const fuori: ArrivoInAttesa[] = []
  for (const mittente of readdirSync(arrivi, { withFileTypes: true })) {
    if (!mittente.isDirectory() || mittente.name.startsWith('.')) continue
    for (const f of readdirSync(join(arrivi, mittente.name), { withFileTypes: true })) {
      if (!f.isFile() || !f.name.endsWith('.json')) continue
      try { fuori.push({ file: `${mittente.name}/${f.name}`, il: statSync(join(arrivi, mittente.name, f.name)).mtimeMs }) } catch { /* sparito nel frattempo */ }
    }
  }
  return fuori
}

/** Un arrivo letto; illeggibile → `undefined` (va nel recupero lo stesso, e lo si dice). */
export function leggiArrivo(arrivi: string, file: string): ArrivoLetto | undefined {
  try {
    const o = JSON.parse(readFileSync(join(arrivi, ...file.split('/')), 'utf8')) as { da?: unknown; versione?: unknown; voci?: unknown }
    if (!Array.isArray(o.voci)) return undefined
    return {
      file,
      da: typeof o.da === 'string' ? o.da : (file.split('/')[0] ?? 'sconosciuto'),
      ...(typeof o.versione === 'string' ? { versione: o.versione } : {}),
      voci: o.voci as VoceErrore[]
    }
  } catch {
    return undefined
  }
}

export function fileLotto(arrivi: string, id: string): string {
  return join(arrivi, `lotto-${id}.md`)
}

/** I file nel recupero: `.recupero/<mittente>/<file>.<ora>`. */
export function arriviNelRecupero(arrivi: string, file: readonly string[]): { spostati: string[]; nonSpostati: string[] } {
  const spostati: string[] = []
  const nonSpostati: string[] = []
  for (const f of file) {
    const mittente = f.includes('/') ? (f.split('/')[0] ?? '') : ''
    try {
      const e = cancellaSicura(join(arrivi, ...f.split('/')), { dentro: [arrivi], come: { modo: 'recupero', cartella: join(arrivi, CARTELLA_RECUPERO_ARRIVI, mittente) } })
      if (e === 'spostata') spostati.push(f)
    } catch (err) {
      nonSpostati.push(`${f}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  return { spostati, nonSpostati }
}

/** I lotti più vecchi di 30 giorni nel recupero: l'autopilota li ha avuti da un pezzo. */
export function lottiScaduti(arrivi: string, adesso: number, giorni = GIORNI_RECUPERO): string[] {
  if (!existsSync(arrivi)) return []
  return readdirSync(arrivi).filter((n) => /^lotto-.+\.md$/.test(n)).filter((n) => {
    try { return adesso - statSync(join(arrivi, n)).mtimeMs > giorni * 86_400_000 } catch { return false }
  })
}

/**
 * Toglie dal recupero quello che ci sta da più di 30 giorni. L'età è quella
 * dello spostamento, scritta nel nome da `cancellaSicura` (`<file>.<ISO con ->`):
 * `rename` non cambia la data del file, che è quella dell'arrivo.
 */
export function svuotaRecuperoScaduto(arrivi: string, adesso: number, giorni = GIORNI_RECUPERO): string[] {
  const recupero = join(arrivi, CARTELLA_RECUPERO_ARRIVI)
  if (!existsSync(recupero)) return []
  const tolti: string[] = []
  // I file del recupero: dentro `.recupero/<mittente>/`, o in cima (i lotti).
  const voci = readdirSync(recupero, { withFileTypes: true }).flatMap((x) => (x.isDirectory() ? readdirSync(join(recupero, x.name)).map((n) => join(recupero, x.name, n)) : [join(recupero, x.name)]))
  for (const p of voci) {
    try {
      const spostato = quandoSpostato(basename(p)) ?? statSync(p).mtimeMs
      if (adesso - spostato <= giorni * 86_400_000) continue
      if (cancellaSicura(p, { dentro: [recupero] }) === 'cancellata') tolti.push(relative(recupero, p))
    } catch { /* la prossima volta */ }
  }
  return tolti
}

/** `x.json.2026-10-20T12-00-00-000Z` → l'ora dello spostamento (ms). */
export function quandoSpostato(nome: string): number | undefined {
  const m = /\.(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/.exec(nome)
  if (m === null) return undefined
  const t = Date.parse(`${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z`)
  return Number.isNaN(t) ? undefined : t
}

// ─── Il giro ──────────────────────────────────────────────────────────────

export type DepsGiroErrori = {
  /** La cartella di SierraDeck su questo PC, se c'è. */
  radice: () => string | undefined
  adesso: () => number
  /** La versione di questo programma: gli errori di versioni più vecchie restano fuori. */
  versione: () => string
  settimanaPercento: () => number | undefined
  /** La richiesta nella coda dell'autopilota del workspace di SierraDeck. */
  affida: (p: { testo: string; cwd: string }) => Promise<void>
  log: (riga: string) => void
  nuovoId?: () => string
}

/**
 * Un giro: decide se partire, fa il lotto, lo affida. Torna la riga per le
 * Impostazioni, o niente. Non solleva mai: un errore qui finirebbe nello
 * storico che sta cercando di correggere.
 */
export async function giroErroriArrivati(d: DepsGiroErrori): Promise<string | undefined> {
  const radice = d.radice()
  if (radice === undefined) return undefined
  const arrivi = cartellaArrivi(radice)
  if (!existsSync(arrivi)) return undefined
  const stato = leggiStatoArrivi(arrivi)
  const adesso = d.adesso()
  const ora = new Date(adesso).toISOString()
  let cambiato = false
  let riga: string | undefined
  try {
    const inAttesa = arriviInAttesa(arrivi)
    const settimana = d.settimanaPercento()
    const dec = decidiErroriArrivati({ inAttesa, adesso, ...(settimana !== undefined ? { settimanaPercento: settimana } : {}) })
    if (dec.azione === 'aspetta') {
      if (stato.attesa?.testo !== dec.testo) {
        stato.attesa = { testo: dec.testo, dal: ora }
        cambiato = true
        d.log(`[errori arrivati] ${dec.testo}`)
      }
      riga = dec.testo
    } else if (dec.azione === 'avvia') {
      if (settimana === undefined) d.log('[errori arrivati] limiti della settimana non letti: parto lo stesso')
      const letti = dec.file.map((f) => leggiArrivo(arrivi, f))
      const illeggibili = dec.file.filter((_f, i) => letti[i] === undefined)
      if (illeggibili.length > 0) d.log(`[errori arrivati] illeggibili, vanno nel recupero: ${illeggibili.join(', ')}`)
      const versioneQui = d.versione()
      const { gruppi, vecchie, giaAffidati } = raggruppa({ arrivi: letti.filter((x): x is ArrivoLetto => x !== undefined), versioneQui, affidati: stato.affidati, adesso })
      if (gruppi.length > 0) {
        const id = d.nuovoId?.() ?? ora.replace(/[-:.TZ]/g, '').slice(0, 14)
        const lotto = fileLotto(arrivi, id)
        writeFileSync(lotto, testoLotto({ id, gruppi, versioneQui, vecchie, giaAffidati }), 'utf8')
        const ritornano = gruppi.filter((g) => g.ritorna !== undefined).length
        // Prima la richiesta, poi lo stato: se l'autopilota non la prende, al giro dopo si riprova.
        await d.affida({ testo: richiestaLotto({ lotto, gruppi: gruppi.length, ritornano }), cwd: radice })
        for (const g of gruppi) {
          const ultima = [...g.versioni].sort((a, b) => (piuNuova(a, b) ? -1 : piuNuova(b, a) ? 1 : 0))[0]
          stato.affidati[g.chiave] = { il: ora, ...(ultima !== undefined ? { versione: ultima } : {}) }
        }
        stato.lotti = [...stato.lotti, { id, il: ora, gruppi: gruppi.length, file: dec.file.length }].slice(-50)
        d.log(`[errori arrivati] lotto ${id}: ${gruppi.length} gruppi da ${dec.file.length} arrivi affidati all'autopilota${vecchie > 0 ? `, ${vecchie} errori di versioni vecchie lasciati fuori` : ''}${giaAffidati > 0 ? `, ${giaAffidati} gruppi già affidati` : ''}`)
        riga = `${NOME_LAVORO}: ${gruppi.length} ${gruppi.length === 1 ? 'gruppo affidato' : 'gruppi affidati'} all’autopilota (${ora.slice(0, 16).replace('T', ' ')}).`
      } else {
        d.log(`[errori arrivati] ${dec.file.length} arrivi senza niente di nuovo (${vecchie} errori di versioni vecchie, ${giaAffidati} gruppi già affidati): nel recupero`)
        riga = `${NOME_LAVORO}: niente di nuovo negli ultimi arrivi.`
      }
      delete stato.attesa
      cambiato = true
      // Il lotto ha tutto: gli arrivi vanno nel recupero, e non ripartono.
      const r = arriviNelRecupero(arrivi, dec.file)
      if (r.nonSpostati.length > 0) d.log(`[errori arrivati] non spostati nel recupero: ${r.nonSpostati.join('; ')}`)
    } else {
      if (stato.attesa !== undefined) { delete stato.attesa; cambiato = true }
      const l = stato.lotti[stato.lotti.length - 1]
      if (inAttesa.length > 0) riga = `${NOME_LAVORO}: ${inAttesa.length} ${inAttesa.length === 1 ? 'arrivo' : 'arrivi'}, li passo all’autopilota fra qualche minuto.`
      else if (l !== undefined) riga = `${NOME_LAVORO}: l’ultimo lotto (${l.gruppi} ${l.gruppi === 1 ? 'gruppo' : 'gruppi'}) affidato il ${l.il.slice(0, 16).replace('T', ' ')}.`
    }
    const vecchiLotti = lottiScaduti(arrivi, adesso)
    if (vecchiLotti.length > 0) arriviNelRecupero(arrivi, vecchiLotti)
    const tolti = svuotaRecuperoScaduto(arrivi, adesso)
    if (tolti.length > 0) d.log(`[errori arrivati] tolti dal recupero dopo ${GIORNI_RECUPERO} giorni: ${tolti.length} file`)
  } catch (err) {
    d.log(`[errori arrivati] giro non riuscito: ${err instanceof Error ? err.message : String(err)}`)
  } finally {
    if (cambiato) {
      try { scriviStatoArrivi(arrivi, stato) } catch (err) { d.log(`[errori arrivati] stato non scritto: ${err instanceof Error ? err.message : String(err)}`) }
    }
  }
  return riga
}
