import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, renameSync } from 'node:fs'
import { basename, join, relative, resolve } from 'node:path'
import { cancellaSicura } from '@shared/cancella-sicura'
import { CARTELLA_ARRIVI } from './errori-arrivati'

/**
 * «Errori arrivati» (0.81.0): sul PC di sviluppo, gli errori che arrivano
 * diventano da soli un lavoro dell'autopilota nel progetto SierraDeck.
 *
 * Il giro:
 * 1. un arrivo nuovo aspetta `QUIETE_MS` senza altri arrivi: quelli vicini
 *    finiscono in **un solo** lavoro, e quindi in una sola release;
 * 2. non parte se la settimana del piano è oltre l'80% o se un altro autopilota
 *    lavora già su SierraDeck: lo dice una volta («li correggo appena finisce
 *    X») e riprova da solo al giro dopo;
 * 3. il primo passo della chat è il riepilogo per Nicholas, scritto in
 *    `riepilogo-<lavoro>.md`: il PC lo mette nella conversazione
 *    dell'autopilota con **una** notifica, prima di qualunque modifica;
 * 4. a lavoro finito i file di quel lavoro vanno nel recupero
 *    (`.recupero/`, 30 giorni) con `cancellaSicura`, mai cancellati subito.
 *
 * Lo stato sta in `.lavori.json` nella cartella degli arrivi, che è fuori da
 * git: scriverlo non sporca la cartella principale dove si uniscono i rami.
 */

/** Quanto deve stare zitta la cartella prima di partire: gli arrivi vicini vanno insieme. */
export const QUIETE_MS = 5 * 60_000
/** Oltre questa percentuale della settimana non si parte. */
export const TETTO_SETTIMANA = 80
/** Quanto restano i file nel recupero. */
export const GIORNI_RECUPERO = 30
export const NOME_LAVORO = 'Errori arrivati'
export const CARTELLA_RECUPERO_ARRIVI = '.recupero'
const FILE_STATO = '.lavori.json'

export type LavoroErrori = {
  /** Il nostro id (`ea-…`): dà il nome al file del riepilogo. */
  id: string
  autopilota: string
  /** I file degli arrivi, relativi alla cartella degli arrivi, con `/`. */
  file: string[]
  creatoIl: string
  riepilogoMandato?: string
  /** Quando si è chiuso, e come. */
  chiuso?: { il: string; come: 'finito' | 'fallito' | 'sparito' }
}

export type StatoErroriArrivati = {
  versione: 1
  lavori: LavoroErrori[]
  /** L'ultima attesa detta, per non ripeterla a ogni giro. */
  attesa?: { testo: string; dal: string }
}

export type ArrivoInAttesa = { file: string; il: number }

export type AutopilotaVisto = { id: string; nome: string; stato: string; cwd: string; archiviato?: boolean }

export type Decisione =
  | { azione: 'niente' }
  | { azione: 'aspetta'; testo: string }
  | { azione: 'avvia'; file: string[] }

const STATI_AL_LAVORO = new Set(['intervista', 'pronto', 'lavoro', 'attesa'])

function norma(p: string): string {
  return resolve(p).replace(/[\\/]+$/, '').toLowerCase()
}

/** Lavora su SierraDeck: nella sua cartella, o in una copia `<cartella>.sierradeck-wt/…`. */
export function suSierraDeck(cwd: string, radice: string): boolean {
  if (cwd === '') return false
  const c = norma(cwd)
  const r = norma(radice)
  return c === r || c.startsWith(r + '\\') || c.startsWith(r + '/') || c.startsWith(r + '.sierradeck-wt')
}

/**
 * Cosa fare adesso. Pura: la usa il giro e la provano i test.
 * Una settimana non letta non ferma niente: non si sa, e lo si scrive nel registro.
 */
export function decidiErroriArrivati(p: {
  inAttesa: readonly ArrivoInAttesa[]
  adesso: number
  autopiloti: readonly AutopilotaVisto[]
  radice: string
  settimanaPercento?: number
  quieteMs?: number
}): Decisione {
  if (p.inAttesa.length === 0) return { azione: 'niente' }
  const ultimo = Math.max(...p.inAttesa.map((a) => a.il))
  if (p.adesso - ultimo < (p.quieteMs ?? QUIETE_MS)) return { azione: 'niente' }
  const quanti = `${p.inAttesa.length} ${p.inAttesa.length === 1 ? 'arrivo' : 'arrivi'}`
  if (p.settimanaPercento !== undefined && p.settimanaPercento > TETTO_SETTIMANA) {
    return { azione: 'aspetta', testo: `Errori arrivati (${quanti}): li correggo quando la settimana del piano scende sotto l’${TETTO_SETTIMANA}% (adesso ${Math.round(p.settimanaPercento)}%).` }
  }
  const occupato = p.autopiloti.find((a) => a.archiviato !== true && STATI_AL_LAVORO.has(a.stato) && suSierraDeck(a.cwd, p.radice))
  if (occupato !== undefined) return { azione: 'aspetta', testo: `Errori arrivati (${quanti}): li correggo appena finisce «${occupato.nome}».` }
  return { azione: 'avvia', file: [...p.inAttesa].sort((a, b) => a.il - b.il).map((a) => a.file) }
}

/** I lavori aperti che si chiudono adesso: il loro autopilota è finito, fallito o sparito. */
export function lavoriDaChiudere(lavori: readonly LavoroErrori[], autopiloti: readonly AutopilotaVisto[]): Array<{ lavoro: LavoroErrori; come: 'finito' | 'fallito' | 'sparito' }> {
  const fuori: Array<{ lavoro: LavoroErrori; come: 'finito' | 'fallito' | 'sparito' }> = []
  for (const l of lavori) {
    if (l.chiuso !== undefined) continue
    const a = autopiloti.find((x) => x.id === l.autopilota)
    if (a === undefined) fuori.push({ lavoro: l, come: 'sparito' })
    else if (a.stato === 'finito') fuori.push({ lavoro: l, come: 'finito' })
    else if (a.stato === 'fallito') fuori.push({ lavoro: l, come: 'fallito' })
  }
  return fuori
}

/** L'obiettivo del lavoro: i passi nell'ordine voluto da Nicholas (19/10). */
export function obiettivoErroriArrivati(p: { arrivi: string; file: readonly string[]; riepilogo: string }): string {
  const elenco = p.file.map((f) => `- ${join(p.arrivi, ...f.split('/'))}`).join('\n')
  return [
    'Correggi gli errori arrivati a SierraDeck dagli altri PC e dal telefono.',
    '',
    `I file (JSON, già senza segreti):\n${elenco}`,
    '',
    'I passi, in quest’ordine:',
    `1. PRIMA di qualunque modifica al codice, scrivi in ${p.riepilogo} un riepilogo per Nicholas, in italiano e corto: gli errori, da dove vengono (PC, servizio, pagina, app), se la causa è capita o no, cosa correggerai, quanto pesa il lavoro. Il programma lo mette nella conversazione e manda una notifica sola: non mandarne altre.`,
    '2. Correggi, con un test per ogni errore corretto, e passa dalla Revisione.',
    '3. Pubblica una sola release per tutti questi errori: prima bozza, poi --draft=false, con APK, latest.yml e app-android.json come sempre. Non installarla mai.',
    '4. Nel rapporto .sierradeck/quaderno/errori-arrivati.md scrivi per ognuno «errore X corretto nella versione Y» (X = il messaggio corto, Y = la versione pubblicata). Per un errore che non correggi scrivi perché.',
    '',
    'Non cancellare i file degli arrivi: a lavoro finito li mette il programma nel recupero di 30 giorni.'
  ].join('\n')
}

export function criteriErroriArrivati(riepilogo: string): { descrizione: string; comando?: string }[] {
  const r = riepilogo.replace(/\\/g, '/')
  return [
    { descrizione: 'Il riepilogo per Nicholas è scritto prima di toccare il codice', comando: `node -e "process.exit(require('fs').existsSync('${r}')?0:1)"` },
    // La guardia delle cancellazioni è un test della suite: qui sotto c'è già.
    { descrizione: 'I test del programma passano', comando: 'npx vitest run --maxWorkers=2' },
    { descrizione: 'Il TypeScript del programma compila senza errori', comando: 'npm run typecheck' },
    { descrizione: 'Nel rapporto .sierradeck/quaderno/errori-arrivati.md c’è «corretto nella versione» per gli errori di questo lavoro, e la release è pubblicata (non bozza, mai installata)' }
  ]
}

// ─── Su disco ─────────────────────────────────────────────────────────────

export function cartellaArrivi(radice: string): string {
  return join(radice, CARTELLA_ARRIVI)
}

export function leggiStatoArrivi(arrivi: string): StatoErroriArrivati {
  try {
    const o = JSON.parse(readFileSync(join(arrivi, FILE_STATO), 'utf8')) as Partial<StatoErroriArrivati>
    if (o.versione === 1 && Array.isArray(o.lavori)) return { versione: 1, lavori: o.lavori, ...(o.attesa !== undefined ? { attesa: o.attesa } : {}) }
  } catch { /* non c'è ancora */ }
  return { versione: 1, lavori: [] }
}

export function scriviStatoArrivi(arrivi: string, s: StatoErroriArrivati): void {
  const file = join(arrivi, FILE_STATO)
  writeFileSync(`${file}.tmp`, JSON.stringify(s, null, 2), 'utf8')
  renameSync(`${file}.tmp`, file)
}

/** Gli arrivi che nessun lavoro ha ancora preso: `<mittente>/<ora>.json`. */
export function arriviInAttesa(arrivi: string, stato: StatoErroriArrivati): ArrivoInAttesa[] {
  if (!existsSync(arrivi)) return []
  const presi = new Set(stato.lavori.flatMap((l) => l.file))
  const fuori: ArrivoInAttesa[] = []
  for (const mittente of readdirSync(arrivi, { withFileTypes: true })) {
    if (!mittente.isDirectory() || mittente.name.startsWith('.')) continue
    for (const f of readdirSync(join(arrivi, mittente.name), { withFileTypes: true })) {
      if (!f.isFile() || !f.name.endsWith('.json')) continue
      const rel = `${mittente.name}/${f.name}`
      if (presi.has(rel)) continue
      try { fuori.push({ file: rel, il: statSync(join(arrivi, mittente.name, f.name)).mtimeMs }) } catch { /* sparito nel frattempo */ }
    }
  }
  return fuori
}

export function fileRiepilogo(arrivi: string, lavoro: string): string {
  return join(arrivi, `riepilogo-${lavoro}.md`)
}

/** I file di un lavoro finito nel recupero: `.recupero/<mittente>/<file>.<ora>`. */
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

/**
 * Toglie dal recupero quello che ci sta da più di 30 giorni. L'età è quella
 * dello spostamento, scritta nel nome da `cancellaSicura` (`<file>.<ISO con ->`):
 * `rename` non cambia la data del file, che è quella dell'arrivo.
 */
export function svuotaRecuperoScaduto(arrivi: string, adesso: number, giorni = GIORNI_RECUPERO): string[] {
  const recupero = join(arrivi, CARTELLA_RECUPERO_ARRIVI)
  if (!existsSync(recupero)) return []
  const tolti: string[] = []
  // I file del recupero: dentro `.recupero/<mittente>/`, o in cima (i riepiloghi).
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
  autopiloti: () => Promise<AutopilotaVisto[]>
  settimanaPercento: () => number | undefined
  crea: (p: { nome: string; obiettivo: string; cwd: string; criteri: { descrizione: string; comando?: string }[] }) => Promise<{ id: string }>
  /** Il riepilogo nella conversazione dell'autopilota, con una notifica sola. */
  annuncia: (autopilota: string, titolo: string, testo: string) => Promise<void>
  log: (riga: string) => void
  nuovoId?: () => string
}

/**
 * Un giro: chiude i lavori finiti, manda i riepiloghi pronti, decide se
 * partire. Torna la riga per le Impostazioni, o niente. Non solleva mai: un
 * errore qui finirebbe nello storico che sta cercando di correggere.
 */
export async function giroErroriArrivati(d: DepsGiroErrori): Promise<string | undefined> {
  const radice = d.radice()
  if (radice === undefined) return undefined
  const arrivi = cartellaArrivi(radice)
  if (!existsSync(arrivi)) return undefined
  const stato = leggiStatoArrivi(arrivi)
  const adesso = d.adesso()
  const ora = new Date(adesso).toISOString()
  const arriviDi = (n: number): string => `${n} ${n === 1 ? 'arrivo' : 'arrivi'}`
  let cambiato = false
  let riga: string | undefined
  try {
    const autopiloti = await d.autopiloti()
    // 1. I lavori chiusi: i file nel recupero solo se il lavoro è finito davvero.
    for (const { lavoro, come } of lavoriDaChiudere(stato.lavori, autopiloti)) {
      lavoro.chiuso = { il: ora, come }
      cambiato = true
      if (come === 'finito') {
        const riepilogo = `riepilogo-${lavoro.id}.md`
        const r = arriviNelRecupero(arrivi, existsSync(join(arrivi, riepilogo)) ? [...lavoro.file, riepilogo] : lavoro.file)
        d.log(`[errori arrivati] ${lavoro.id} finito: ${r.spostati.length} file nel recupero di ${GIORNI_RECUPERO} giorni${r.nonSpostati.length > 0 ? `, non spostati: ${r.nonSpostati.join('; ')}` : ''}`)
      } else {
        d.log(`[errori arrivati] ${lavoro.id} ${come === 'fallito' ? 'fallito' : 'non c’è più'}: i ${lavoro.file.length} file restano dove sono, non riparto da solo`)
      }
    }
    // 2. I riepiloghi pronti: nella conversazione, una volta.
    for (const l of stato.lavori) {
      if (l.chiuso !== undefined || l.riepilogoMandato !== undefined) continue
      const f = fileRiepilogo(arrivi, l.id)
      if (!existsSync(f)) continue
      const testo = readFileSync(f, 'utf8').trim()
      if (testo === '') continue
      await d.annuncia(l.autopilota, `${NOME_LAVORO}: il riepilogo`, testo.slice(0, 4000))
      l.riepilogoMandato = ora
      cambiato = true
      d.log(`[errori arrivati] riepilogo di ${l.id} mandato a Nicholas (una notifica)`)
    }
    // 3. Gli arrivi nuovi.
    const inAttesa = arriviInAttesa(arrivi, stato)
    const settimana = d.settimanaPercento()
    const dec = decidiErroriArrivati({ inAttesa, adesso, autopiloti, radice, ...(settimana !== undefined ? { settimanaPercento: settimana } : {}) })
    if (dec.azione === 'aspetta') {
      if (stato.attesa?.testo !== dec.testo) {
        stato.attesa = { testo: dec.testo, dal: ora }
        cambiato = true
        d.log(`[errori arrivati] ${dec.testo}`)
      }
      riga = dec.testo
    } else if (dec.azione === 'avvia') {
      const id = d.nuovoId?.() ?? `ea-${ora.replace(/[-:.TZ]/g, '').slice(0, 14)}`
      const riepilogo = fileRiepilogo(arrivi, id)
      if (settimana === undefined) d.log('[errori arrivati] limiti della settimana non letti: parto lo stesso')
      const a = await d.crea({ nome: NOME_LAVORO, obiettivo: obiettivoErroriArrivati({ arrivi, file: dec.file, riepilogo }), cwd: radice, criteri: criteriErroriArrivati(riepilogo) })
      stato.lavori.push({ id, autopilota: a.id, file: dec.file, creatoIl: ora })
      delete stato.attesa
      cambiato = true
      d.log(`[errori arrivati] avviato «${NOME_LAVORO}» (${a.id}) con ${arriviDi(dec.file.length)}`)
      riga = `${NOME_LAVORO}: al lavoro su ${arriviDi(dec.file.length)}.`
    } else {
      if (stato.attesa !== undefined) { delete stato.attesa; cambiato = true }
      const aperto = stato.lavori.find((l) => l.chiuso === undefined)
      if (aperto !== undefined) riga = `${NOME_LAVORO}: al lavoro su ${arriviDi(aperto.file.length)}${aperto.riepilogoMandato !== undefined ? '' : ', il riepilogo arriva prima delle correzioni'}.`
      else if (inAttesa.length > 0) riga = `${NOME_LAVORO}: ${arriviDi(inAttesa.length)}, parto fra qualche minuto.`
    }
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
