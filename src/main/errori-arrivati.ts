import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { cancellaSicura } from '@shared/cancella-sicura'
import { cartellaMittente, nomeFileArrivo, storicoPerLInvio, type InvioErrori, type StoricoErrori } from '@shared/storico-errori'

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
