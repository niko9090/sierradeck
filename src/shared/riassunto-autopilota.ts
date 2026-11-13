import type { Autopilota, Decisione } from './autopilota'
import type { VistaCoda } from './coda-richieste'
import { fraseStatoOrchestratore, type VistaOrchestratore } from './piano-orchestratore'
import { rigaTraguardo, senzaSigle } from './chat-autopilota'

/**
 * **Il riassunto dell'autopilota** (Nicholas, 13/11: «un riassunto, scritto e
 * parlato, delle operazioni fatte dal mio ultimo messaggio, o generale se lo
 * chiedo»).
 *
 * Lo scrive il programma dai dati che ha già (le righe del diario con i
 * traguardi, il dialogo, la coda e la vista dell'avanzamento): subito, uguale
 * su ogni PC e senza spendere un turno dell'autopilota. Pura: si prova senza
 * servizio, e vale per l'autopilota di qui e per quello di un altro PC.
 */

export type TipoRiassunto = 'da-ultimo' | 'generale'

export type Riassunto = {
  tipo: TipoRiassunto
  /** La riga di testa: «Dal tuo ultimo messaggio (alle 14:20)», «Il punto sul workspace». */
  titolo: string
  /** Le righe da leggere, corte, in parole semplici. */
  righe: string[]
  /** Lo stesso, da dire a voce: frasi intere, niente simboli. */
  parlato: string
}

export type DatiRiassuntoAutopilota = {
  autopilota: Pick<Autopilota, 'dialogo' | 'decisioni' | 'chats'>
  vista?: VistaOrchestratore
  coda?: VistaCoda
  adesso: number
}

/** Senza un tuo messaggio, quanto indietro guarda il riassunto «dall'ultimo messaggio». */
export const SENZA_MESSAGGIO_MS = 24 * 3_600_000
/** Quante cose per gruppo si nominano; le altre si contano. */
const NOMINATE = 3

const FORMATO_ORA = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' })
const FORMATO_GIORNO = new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Rome' })

/** «alle 14:20», «il 12/11 alle 09:05». */
export function quandoBreve(t: number, adesso: number): string {
  const ora = FORMATO_ORA.format(new Date(t))
  return FORMATO_GIORNO.format(new Date(t)) === FORMATO_GIORNO.format(new Date(adesso)) ? `alle ${ora}` : `il ${FORMATO_GIORNO.format(new Date(t))} alle ${ora}`
}

/** «5 minuti fa», «2 ore fa». */
export function quantoFa(t: number, adesso: number): string {
  const m = Math.max(0, Math.round((adesso - t) / 60_000))
  if (m < 1) return 'meno di un minuto fa'
  if (m < 60) return m === 1 ? '1 minuto fa' : `${m} minuti fa`
  const h = Math.round(m / 60)
  if (h < 48) return h === 1 ? 'un’ora fa' : `${h} ore fa`
  return `${Math.round(h / 24)} giorni fa`
}

/** Il momento del tuo ultimo messaggio all'autopilota (anche una risposta a una sua domanda). */
export function ultimoTuoMessaggio(a: Pick<Autopilota, 'dialogo'>): number | undefined {
  for (let i = a.dialogo.length - 1; i >= 0; i -= 1) {
    const s = a.dialogo[i]
    if (s?.da !== 'tu') continue
    const t = Date.parse(s.quando)
    if (!Number.isNaN(t)) return t
  }
  return undefined
}

const corto = (t: string, n: number): string => {
  const x = senzaSigle(t.replace(/\s+/gu, ' ').trim())
  return x.length > n ? `${x.slice(0, n - 1).replace(/[\s,;:]+$/u, '')}…` : x
}

/** ««a», «b» e altri 2». */
function elenco(nomi: string[]): string {
  const visti = [...new Set(nomi.filter((x) => x !== ''))]
  const primi = visti.slice(0, NOMINATE).map((x) => `«${x}»`)
  const altri = visti.length - primi.length
  if (primi.length === 0) return ''
  if (altri > 0) return `${primi.join(', ')} e ${altri === 1 ? 'un altro' : `altri ${altri}`}`
  if (primi.length === 1) return primi[0]!
  return `${primi.slice(0, -1).join(', ')} e ${primi[primi.length - 1]!}`
}

/** «1 lavoro», «3 lavori». */
const conta = (n: number, uno: string, piu: string): string => (n === 1 ? `1 ${uno}` : `${n} ${piu}`)

type Gruppo = 'partiti' | 'finiti' | 'uniti' | 'problemi' | 'rilasci' | 'fatte' | 'altro'

/** La cosa di cui parla una riga: quello fra «…», o dopo il trattino, o la riga intera. */
function cosaDi(testo: string): string {
  const fra = /«([^»]+)»/u.exec(testo)?.[1]
  if (fra !== undefined) return corto(fra, 70)
  const dopo = /\s—\s(.+)$/u.exec(testo)?.[1] ?? /:\s(.+)$/u.exec(testo)?.[1] ?? testo
  return corto(dopo.split(/\.(?:\s|$)/u)[0] ?? dopo, 70)
}

/**
 * Di che gruppo è una riga del diario con un traguardo. Le note «avanzamento»
 * le scrive il servizio con poche forme fisse (servizio-orchestratore.ts):
 * si riconoscono da quelle; quello che non si riconosce resta «altro».
 */
export function gruppoDi(d: Decisione): Gruppo | undefined {
  const t = d.traguardo
  if (t === undefined) return undefined
  switch (t.esito) {
    case 'aperta': return 'partiti'
    case 'finito': case 'in-revisione': case 'nel-recupero': return 'finiti'
    case 'approvato': case 'unito': return 'uniti'
    case 'da-rifare': case 'chiede-te': case 'bloccata': case 'ferma': case 'muta': case 'da-parte': case 'mai-partita': return 'problemi'
    case 'gia-fatto': return 'altro'
    case 'avanzamento': break
    default: return 'altro'
  }
  const n = (t.nota ?? '').trim()
  if (n === '') return undefined
  if (/^Al lavoro:/u.test(n)) return 'partiti'
  if (/non è riuscito|è stato fermato|non passa le prove|non risponde|bloccat/iu.test(n)) return 'problemi'
  if (/\b(pubblicat[aoie]|rilascio|release)\b/iu.test(n)) return 'rilasci'
  if (/ha finito/iu.test(n)) return 'finiti'
  if (/^Unito il lavoro/iu.test(n)) return 'uniti'
  if (/^Fatt[ae] /u.test(n)) return 'fatte'
  return 'altro'
}

/** Le cose successe dopo `da`, per gruppo, dal diario. */
function eventiDopo(a: DatiRiassuntoAutopilota['autopilota'], da: number): Record<Gruppo, string[]> {
  const g: Record<Gruppo, string[]> = { partiti: [], finiti: [], uniti: [], problemi: [], rilasci: [], fatte: [], altro: [] }
  for (const d of a.decisioni) {
    const t = Date.parse(d.quando)
    if (Number.isNaN(t) || t <= da) continue
    const gruppo = gruppoDi(d)
    if (gruppo === undefined) continue
    const riga = rigaTraguardo(a, d.traguardo!)
    if (riga === undefined) continue
    g[gruppo].push(gruppo === 'problemi' || gruppo === 'altro' || gruppo === 'rilasci' ? corto(riga, 140) : cosaDi(riga))
  }
  return g
}

/** Le sue domande ancora aperte nella chat, dalla più vecchia. */
function domandeAperte(a: DatiRiassuntoAutopilota['autopilota']): string[] {
  return a.dialogo.filter((s) => s.da === 'lui' && s.domanda !== undefined && s.domanda.chiusa !== true).map((s) => corto(s.testo, 140))
}

/** Le righe sulle domande che aspettano te: sempre, in tutti e due i riassunti. */
function righeDomande(d: DatiRiassuntoAutopilota): string[] {
  const inChat = domandeAperte(d.autopilota)
  const n = Math.max(inChat.length, d.vista?.domandeAperte ?? 0)
  if (n === 0) return []
  const prima = inChat[0]
  return [`Aspetta ${n === 1 ? 'una tua risposta' : `${n} tue risposte`}${prima !== undefined ? `: ${prima}` : '.'}`]
}

/** La riga di adesso, dalla vista dell'avanzamento. */
function rigaAdesso(d: DatiRiassuntoAutopilota): string | undefined {
  if (d.vista === undefined) return undefined
  return `Adesso: ${fraseStatoOrchestratore(d.vista, d.adesso).testo}.`
}

/** Le righe scritte, dette a voce: niente virgolette basse, frasi chiuse. */
export function perLaVoce(titolo: string, righe: string[]): string {
  return [titolo, ...righe]
    .map((r) => r.replace(/[«»]/gu, '').replace(/\s+/gu, ' ').trim())
    .filter((r) => r !== '')
    .map((r) => (/[.!?…:]$/u.test(r) ? r : `${r}.`))
    .join(' ')
}

/**
 * Cosa è successo dal tuo ultimo messaggio all'autopilota: lavori partiti,
 * finiti e uniti, cosa non è andato, richieste fatte, versioni uscite, le
 * sue risposte e le domande che ti aspettano; in fondo, cosa succede adesso.
 */
export function riassuntoDaUltimo(d: DatiRiassuntoAutopilota): Riassunto {
  const tuo = ultimoTuoMessaggio(d.autopilota)
  const da = tuo ?? d.adesso - SENZA_MESSAGGIO_MS
  const titolo = tuo !== undefined
    ? `Dal tuo ultimo messaggio (${quandoBreve(tuo, d.adesso)}, ${quantoFa(tuo, d.adesso)})`
    : 'Non gli hai ancora scritto: ecco le ultime 24 ore'
  const righe: string[] = []
  const g = eventiDopo(d.autopilota, da)

  // Le richieste: dalla coda, se c'è (più precisa del diario).
  const dopo = (iso: string | undefined): boolean => { const t = iso === undefined ? NaN : Date.parse(iso); return !Number.isNaN(t) && t > da }
  const richieste = d.coda?.richieste ?? []
  const nuove = richieste.filter((r) => dopo(r.creata) && r.chiusa === undefined)
  const fatte = richieste.filter((r) => r.stato === 'fatta' && r.chiusa === undefined && dopo(r.fattaIl))
  const versioni = [...new Set(fatte.map((r) => r.versione).filter((v): v is string => v !== undefined && v !== ''))]

  if (nuove.length > 0) righe.push(`${nuove.length === 1 ? 'Nuova richiesta in coda' : `${nuove.length} richieste nuove in coda`}: ${elenco(nuove.map((r) => corto(r.titolo, 70)))}.`)
  if (g.partiti.length > 0) righe.push(`${g.partiti.length === 1 ? 'Partito 1 lavoro' : `Partiti ${g.partiti.length} lavori`}: ${elenco(g.partiti)}.`)
  if (g.finiti.length > 0 || g.uniti.length > 0) {
    const parti: string[] = []
    if (g.finiti.length > 0) parti.push(`${g.finiti.length === 1 ? 'finito 1 lavoro' : `finiti ${g.finiti.length} lavori`}`)
    if (g.uniti.length > 0) parti.push(`${g.uniti.length === 1 ? 'unito 1' : `uniti ${g.uniti.length}`} con le prove passate`)
    const nomi = g.uniti.length > 0 ? g.uniti : g.finiti
    const testo = parti.join(', ')
    righe.push(`${testo.charAt(0).toUpperCase()}${testo.slice(1)}: ${elenco(nomi)}.`)
  }
  if (fatte.length > 0) righe.push(`${fatte.length === 1 ? 'Richiesta fatta' : `${fatte.length} richieste fatte`}: ${elenco(fatte.map((r) => corto(r.titolo, 70)))}.`)
  else if (g.fatte.length > 0) righe.push(`${g.fatte.length === 1 ? 'Richiesta fatta' : 'Richieste fatte'}: ${elenco(g.fatte)}.`)
  if (versioni.length > 0) righe.push(`${versioni.length === 1 ? `Uscita la versione ${versioni[0]!}` : `Uscite le versioni ${versioni.join(', ')}`}.`)
  for (const r of g.rilasci.slice(-2)) righe.push(r)
  if (g.problemi.length > 0) {
    righe.push(`${g.problemi.length === 1 ? 'Una cosa non è andata' : `${g.problemi.length} cose non sono andate`}: ${g.problemi[g.problemi.length - 1]!}`)
  }
  const risposte = d.autopilota.dialogo.filter((s) => s.da === 'lui' && s.domanda === undefined && dopo(s.quando))
  const ultima = risposte[risposte.length - 1]
  if (ultima !== undefined) righe.push(`${risposte.length === 1 ? 'Ti ha risposto' : `Ti ha scritto ${risposte.length} volte`}: ${corto(ultima.testo, 160)}`)
  if (righe.length === 0) righe.push(tuo !== undefined ? 'Da allora niente di nuovo: nessun lavoro partito o finito.' : 'Niente di nuovo nelle ultime 24 ore.')
  righe.push(...righeDomande(d))
  const adesso = rigaAdesso(d)
  if (adesso !== undefined) righe.push(adesso)
  return { tipo: 'da-ultimo', titolo, righe, parlato: perLaVoce(titolo, righe) }
}

/**
 * Il punto generale sul workspace: quanto è fatto del lavoro aperto, le
 * richieste aperte, chi lavora, le domande che ti aspettano, le ultime cose
 * finite.
 */
export function riassuntoGenerale(d: DatiRiassuntoAutopilota): Riassunto {
  const titolo = 'Il punto sul workspace'
  const righe: string[] = []
  const v = d.vista
  const richieste = d.coda?.richieste ?? []
  const aperte = richieste.filter((r) => r.stato !== 'fatta' && r.chiusa === undefined)
  if (v?.percento !== undefined) {
    righe.push(`Lavoro aperto fatto al ${v.percento}%${v.piano.totale > 0 ? `: ${conta(v.piano.uniti, 'compito unito', 'compiti uniti')} su ${v.piano.totale}` : ''}.`)
  }
  if (aperte.length > 0) righe.push(`${aperte.length === 1 ? '1 richiesta aperta' : `${aperte.length} richieste aperte`}: ${elenco(aperte.map((r) => corto(r.titolo, 70)))}.`)
  else if (d.coda !== undefined) righe.push('Nessuna richiesta aperta.')
  else if (v?.richieste !== undefined && v.richieste.aperte > 0) righe.push(`${conta(v.richieste.aperte, 'richiesta aperta', 'richieste aperte')}.`)
  const adesso = rigaAdesso(d)
  if (adesso !== undefined) righe.push(adesso)
  righe.push(...righeDomande(d))
  const fatte = richieste
    .filter((r) => r.stato === 'fatta' && r.chiusa === undefined && r.fattaIl !== undefined)
    .sort((x, y) => Date.parse(y.fattaIl!) - Date.parse(x.fattaIl!))
  const compattate = (d.coda?.compattate ?? []).slice().sort((x, y) => Date.parse(y.fattaIl) - Date.parse(x.fattaIl))
  const ultime = [...fatte.map((r) => ({ titolo: r.titolo, versione: r.versione, il: r.fattaIl! })), ...compattate.map((r) => ({ titolo: r.titolo, versione: r.versione, il: r.fattaIl }))]
    .sort((x, y) => Date.parse(y.il) - Date.parse(x.il))
    .slice(0, NOMINATE)
  if (ultime.length > 0) {
    righe.push(`Ultime fatte: ${ultime.map((r) => `«${corto(r.titolo, 60)}»${r.versione !== undefined ? ` (versione ${r.versione})` : ''}`).join(', ')}.`)
  }
  const problemi = eventiDopo(d.autopilota, d.adesso - 6 * 3_600_000).problemi
  if (problemi.length > 0) righe.push(`Nelle ultime 6 ore ${problemi.length === 1 ? 'una cosa non è andata' : `${problemi.length} cose non sono andate`}: ${problemi[problemi.length - 1]!}`)
  if (righe.length === 0) righe.push('Non ho ancora dati su questo workspace.')
  return { tipo: 'generale', titolo, righe, parlato: perLaVoce(titolo, righe) }
}

export function riassunto(tipo: TipoRiassunto, d: DatiRiassuntoAutopilota): Riassunto {
  return tipo === 'generale' ? riassuntoGenerale(d) : riassuntoDaUltimo(d)
}
