import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { cancellaSicura } from '@shared/cancella-sicura'
import { scriviJsonAtomico } from '@shared/scrittura-atomica'
import { cartellaMittente, leggiInvioErrori, nomeFileArrivo, storicoPerLInvio, type InvioErrori, type StoricoErrori } from '@shared/storico-errori'
import { decidiLavoroErrori, lavoroPerErrori, type ArrivoErrori, type DecisioneErrori, type LavoroErrori, type StatoLavoriErrori } from '@shared/errori-lavoro'

/**
 * Gli errori che arrivano da un altro PC o dal telefono (0.81.0), sul PC di
 * sviluppo: in `<cartella di SierraDeck>/.sierradeck/errori-arrivati/<mittente>/`,
 * un file per arrivo. La cartella è esclusa da git: gli errori restano qui.
 */

export const CARTELLA_ARRIVI = join('.sierradeck', 'errori-arrivati')

/** Il nome nel `package.json` che dice «questa è la cartella di SierraDeck». */
const NOME_PACCHETTO = 'sierradeck'

function eSierraDeck(cartella: string): boolean {
  try {
    const pkg = JSON.parse(readFileSync(join(cartella, 'package.json'), 'utf8')) as { name?: unknown }
    return pkg.name === NOME_PACCHETTO
  } catch {
    return false
  }
}

/**
 * La cartella di SierraDeck su questo PC, fra quelle candidate (il progetto
 * nel registro, le cartelle delle chat e degli autopiloti). Le copie di lavoro
 * degli autopiloti (`….sierradeck-wt/…`) no: sparirebbero con il ramo. Prima
 * quella che si chiama proprio «SierraDeck».
 */
export function cartellaDiSierraDeck(candidati: readonly string[], controlla: (c: string) => boolean = eSierraDeck): string | undefined {
  const buone = [...new Set(candidati.filter((c) => c !== ''))].filter((c) => !/\.sierradeck-wt([\\/]|$)/i.test(c) && controlla(c))
  return buone.find((c) => basename(c).toLowerCase() === NOME_PACCHETTO) ?? buone[0]
}

/**
 * Scrive un arrivo. Il nome del file è l'ora; se c'è già un file con quel nome
 * (due invii nello stesso secondo) si aggiunge `-2`, `-3`…: `wx` non
 * sovrascrive mai niente.
 */
export function salvaErroriArrivati(radice: string, invio: InvioErrori, quando: Date = new Date()): { ok: true; file: string } | { ok: false; errore: string } {
  const cartella = join(radice, CARTELLA_ARRIVI, cartellaMittente(invio.da))
  try {
    mkdirSync(cartella, { recursive: true })
  } catch (err) {
    return { ok: false, errore: `Non riesco a creare la cartella degli errori arrivati: ${err instanceof Error ? err.message : String(err)}` }
  }
  const testo = JSON.stringify({ da: invio.da, ...(invio.versione !== undefined ? { versione: invio.versione } : {}), arrivato: quando.toISOString(), voci: invio.voci }, null, 2)
  for (let n = 1; n <= 100; n += 1) {
    const file = join(cartella, nomeFileArrivo(quando, n))
    if (existsSync(file)) continue
    try {
      writeFileSync(file, testo, { encoding: 'utf8', flag: 'wx' })
      return { ok: true, file }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EEXIST') continue
      return { ok: false, errore: `Non riesco a scrivere gli errori arrivati: ${err instanceof Error ? err.message : String(err)}` }
    }
  }
  return { ok: false, errore: 'Troppi arrivi nello stesso secondo: riprova.' }
}

/** Dove vanno gli arrivi già corretti: 30 giorni, poi via. */
export const CARTELLA_RECUPERO_ARRIVI = '.recupero'
export const GIORNI_RECUPERO_ARRIVI = 30

/**
 * Dopo la correzione (0.81.0): l'arrivo va nel recupero di 30 giorni, con
 * `cancellaSicura`, e torna la riga per il rapporto («errore X corretto nella
 * versione Y»). Solo file dentro la cartella degli arrivi.
 */
export function arrivoCorretto(radice: string, file: string, versione: string): { ok: true; nota: string; dove: string } | { ok: false; errore: string } {
  const arrivi = join(radice, CARTELLA_ARRIVI)
  const dentro = relative(arrivi, resolve(file))
  if (dentro === '' || dentro.startsWith('..') || isAbsolute(dentro) || dentro.split(/[\\/]/)[0] === CARTELLA_RECUPERO_ARRIVI) {
    return { ok: false, errore: `Non è un arrivo degli errori: ${file}` }
  }
  let letto: { da?: unknown; arrivato?: unknown; voci?: unknown }
  try {
    letto = JSON.parse(readFileSync(file, 'utf8')) as typeof letto
  } catch (err) {
    return { ok: false, errore: `Non riesco a leggere l’arrivo: ${err instanceof Error ? err.message : String(err)}` }
  }
  const voci = Array.isArray(letto.voci) ? letto.voci as Array<{ messaggio?: unknown }> : []
  const messaggi = voci.map((v) => (typeof v.messaggio === 'string' ? (v.messaggio.split('\n')[0] ?? '').slice(0, 120) : '')).filter((m) => m !== '')
  const da = typeof letto.da === 'string' ? letto.da : basename(dirname(file))
  const il = typeof letto.arrivato === 'string' ? letto.arrivato.slice(0, 10) : '?'
  const nota = `Errori arrivati da «${da}» il ${il} (${messaggi.length}) corretti nella versione ${versione}: ${messaggi.join('; ')}`
  const cartella = join(arrivi, CARTELLA_RECUPERO_ARRIVI, dirname(dentro))
  try {
    cancellaSicura(file, { dentro: [arrivi], come: { modo: 'recupero', cartella } })
  } catch (err) {
    return { ok: false, errore: `Non l’ho messo nel recupero: ${err instanceof Error ? err.message : String(err)}` }
  }
  return { ok: true, nota, dove: cartella }
}

/** Toglie dal recupero gli arrivi corretti da più di 30 giorni (l'ora è nel nome, la mette `cancellaSicura`). */
export function svuotaRecuperoArrivi(radice: string, adesso: Date = new Date()): string[] {
  const recupero = join(radice, CARTELLA_ARRIVI, CARTELLA_RECUPERO_ARRIVI)
  if (!existsSync(recupero)) return []
  const limite = adesso.getTime() - GIORNI_RECUPERO_ARRIVI * 24 * 60 * 60 * 1000
  const tolti: string[] = []
  for (const mittente of readdirSync(recupero)) {
    const c = join(recupero, mittente)
    if (!statSync(c).isDirectory()) continue
    for (const nome of readdirSync(c)) {
      const m = /\.(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/.exec(nome)
      if (m === null) continue
      const quando = Date.parse(`${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z`)
      if (Number.isNaN(quando) || quando > limite) continue
      cancellaSicura(join(c, nome), { dentro: [recupero] })
      tolti.push(join(mittente, nome))
    }
  }
  return tolti
}

/**
 * «Manda al PC di sviluppo» (0.81.0), dal lato di chi manda: lo storico,
 * stretto per stare nel tetto del server, al PC scelto. Se il PC scelto è
 * questo, si salva qui senza passare dalla rete.
 */
export async function mandaErrori(p: {
  pcSviluppo: string | undefined
  io: { id: string; nome: string }
  versione: string
  storico: StoricoErrori
  /** Il nome da mostrare di un altro PC, se si conosce. */
  nomeDi: (pcId: string) => string | undefined
  chiama: (pcId: string, percorso: string, corpo: InvioErrori) => Promise<unknown>
  salvaQui: (invio: InvioErrori) => { ok: true; file: string } | { ok: false; errore: string }
  log: (riga: string) => void
}): Promise<{ ok: boolean; messaggio: string }> {
  if (p.pcSviluppo === undefined) return { ok: false, messaggio: 'Prima scegli il PC di sviluppo.' }
  const storico = storicoPerLInvio(p.storico)
  if (storico.voci.length === 0) return { ok: false, messaggio: 'Non c’è nessun errore da mandare.' }
  const invio: InvioErrori = { da: p.io.nome || p.io.id, versione: p.versione, voci: storico.voci }
  const quanti = `${invio.voci.length} ${invio.voci.length === 1 ? 'errore' : 'errori'}`
  if (p.pcSviluppo === p.io.id) {
    const e = p.salvaQui(invio)
    return e.ok ? { ok: true, messaggio: `Fatto: ${quanti} nella cartella degli errori arrivati di questo PC.` } : { ok: false, messaggio: e.errore }
  }
  const chiamato = p.nomeDi(p.pcSviluppo) ?? 'il PC di sviluppo'
  try {
    await p.chiama(p.pcSviluppo, '/api/errori/arrivati', invio)
    p.log(`[errori] mandati ${quanti} a ${chiamato}`)
    return { ok: true, messaggio: `Mandati a ${chiamato}: ${quanti}.` }
  } catch (err) {
    const perche = err instanceof Error ? err.message : String(err)
    p.log(`[errori] NON mandati a ${chiamato}: ${perche}`)
    return { ok: false, messaggio: `Non mandati a ${chiamato}: ${perche}` }
  }
}

// ── «Errori arrivati» (0.81.0): il lavoro dell'autopilota che parte da solo ──

/** Il registro dei lavori avviati per gli arrivi, accanto agli arrivi (esclusi da git con loro). */
export function fileLavoriErrori(radice: string): string { return join(radice, CARTELLA_ARRIVI, '.lavori.json') }

export function leggiLavoriErrori(radice: string): StatoLavoriErrori {
  try {
    const o = JSON.parse(readFileSync(fileLavoriErrori(radice), 'utf8')) as Partial<StatoLavoriErrori>
    const lavori = Array.isArray(o.lavori)
      ? o.lavori.filter((l): l is LavoroErrori => typeof l === 'object' && l !== null && typeof l.autopilota === 'string' && Array.isArray(l.file) && typeof l.avviatoIl === 'string')
      : []
    const np = o.nonPartiti
    return { lavori, ...(np !== undefined && Array.isArray(np.file) && typeof np.motivo === 'string' ? { nonPartiti: np } : {}) }
  } catch {
    return { lavori: [] }
  }
}

function scriviLavoriErrori(radice: string, s: StatoLavoriErrori): void {
  mkdirSync(join(radice, CARTELLA_ARRIVI), { recursive: true })
  scriviJsonAtomico(fileLavoriErrori(radice), s, 'errori')
}

/** Gli arrivi ancora da sistemare: un file per arrivo, fuori dal recupero. */
export function leggiArrivi(radice: string): ArrivoErrori[] {
  const cartella = join(radice, CARTELLA_ARRIVI)
  if (!existsSync(cartella)) return []
  const arrivi: ArrivoErrori[] = []
  for (const mittente of readdirSync(cartella)) {
    if (mittente.startsWith('.')) continue
    const c = join(cartella, mittente)
    try { if (!statSync(c).isDirectory()) continue } catch { continue }
    for (const nome of readdirSync(c)) {
      if (!nome.endsWith('.json')) continue
      const file = join(c, nome)
      try {
        const o = JSON.parse(readFileSync(file, 'utf8')) as { arrivato?: unknown }
        const letto = leggiInvioErrori(o)
        if (!letto.ok) continue
        const quando = typeof o.arrivato === 'string' ? Date.parse(o.arrivato) : NaN
        arrivi.push({ file, da: letto.invio.da, arrivato: Number.isNaN(quando) ? statSync(file).mtimeMs : quando, voci: letto.invio.voci })
      } catch { /* un file a metà si legge al giro dopo */ }
    }
  }
  return arrivi
}

/** La nota nel rapporto degli errori corretti, in fondo a una scheda del quaderno. */
export const SCHEDA_ERRORI_CORRETTI = join('.sierradeck', 'quaderno', 'errori-arrivati-corretti.md')

function annotaNelRapporto(radice: string, righe: string[], quando: string): void {
  const file = join(radice, SCHEDA_ERRORI_CORRETTI)
  mkdirSync(dirname(file), { recursive: true })
  const testa = existsSync(file) ? '' : `---\ntitolo: "Errori arrivati e corretti"\nquando: ${quando}\ntag: ["errori", "errori arrivati"]\n---\n\nScritta dal programma: ogni riga è un arrivo corretto, messo nel recupero di 30 giorni.\n\n`
  appendFileSync(file, `${testa}${righe.map((r) => `- ${quando.slice(0, 10)}: ${r}`).join('\n')}\n`, 'utf8')
}

/**
 * Un giro: chiude i lavori finiti (arrivi nel recupero, nota nel rapporto),
 * poi decide se avviarne uno per gli arrivi nuovi. Chiamato all'arrivo e a
 * intervalli, solo sul PC dove c'è la cartella di SierraDeck.
 */
export async function giroErroriArrivati(d: {
  radice: string
  autopiloti: () => Promise<Array<{ id: string; nome: string; stato: string; cwd: string; archiviato?: boolean }>>
  freno: () => { livello: string; motivo: string }
  /** Avvia l'autopilota e restituisce il suo id. */
  avvia: (lavoro: ReturnType<typeof lavoroPerErrori>) => Promise<string>
  /** Una riga per Nicholas (registro e una notifica): solo per «non parto». */
  dici: (riga: string) => void
  log: (riga: string) => void
  adesso?: Date
}): Promise<DecisioneErrori> {
  const adesso = d.adesso ?? new Date()
  let stato = leggiLavoriErrori(d.radice)
  const autopiloti = await d.autopiloti()
  // 1) I lavori finiti: gli arrivi nel recupero, la nota nel rapporto.
  let cambiato = false
  const versione = (): string => {
    try { return String((JSON.parse(readFileSync(join(d.radice, 'package.json'), 'utf8')) as { version?: unknown }).version ?? '?') } catch { return '?' }
  }
  const lavori = stato.lavori.map((l) => {
    if (l.chiusoIl !== undefined) return l
    const a = autopiloti.find((x) => x.id === l.autopilota)
    const finito = a?.stato === 'finito'
    if (a !== undefined && !finito && a.stato !== 'fallito' && a.archiviato !== true) return l
    cambiato = true
    if (!finito) {
      d.log(`[errori] il lavoro ${l.autopilota} non è finito bene (${a === undefined ? 'tolto' : a.archiviato === true ? 'archiviato' : a.stato}): i suoi ${l.file.length} arrivi restano dove sono`)
      return { ...l, chiusoIl: adesso.toISOString() }
    }
    const v = versione()
    const note: string[] = []
    for (const f of l.file) {
      const e = arrivoCorretto(d.radice, f, v)
      if (e.ok) note.push(e.nota)
      else d.log(`[errori] ${e.errore}`)
    }
    if (note.length > 0) annotaNelRapporto(d.radice, note, adesso.toISOString())
    d.log(`[errori] lavoro ${l.autopilota} finito: ${note.length} arrivi nel recupero di 30 giorni, nota in ${SCHEDA_ERRORI_CORRETTI}`)
    return { ...l, chiusoIl: adesso.toISOString() }
  })
  if (cambiato) stato = { ...stato, lavori }
  // 2) Gli arrivi nuovi.
  const decisione = decidiLavoroErrori({
    arrivi: leggiArrivi(d.radice), stato, radice: d.radice, autopiloti, freno: d.freno(), adesso: adesso.getTime()
  })
  if (decisione.azione === 'avvia') {
    const lavoro = lavoroPerErrori(decisione.arrivi, adesso)
    const id = await d.avvia(lavoro)
    const file = decisione.arrivi.map((a) => a.file)
    d.log(`[errori] avviato «${lavoro.nome}» (${id}) per ${file.length} arrivi`)
    const { nonPartiti: _vecchio, ...resto } = stato
    stato = { ...resto, lavori: [...stato.lavori, { autopilota: id, file, avviatoIl: adesso.toISOString() }] }
    cambiato = true
  } else if (decisione.azione === 'non-parte' && !decisione.giaDetto) {
    d.dici(`Errori arrivati: non parto, ${decisione.motivo}.`)
    stato = { ...stato, nonPartiti: { file: decisione.file, motivo: decisione.motivo } }
    cambiato = true
  }
  if (cambiato) scriviLavoriErrori(d.radice, stato)
  return decisione
}
