import { existsSync, readFileSync } from 'node:fs'
import type { BozzaAvviso } from '@shared/avvisi-telefono'
import type { StatoAccesso as StatoGettone } from '@shared/accesso-claude'
import { scriviJsonAtomico } from '@shared/scrittura-atomica'
import type { DiagnosiDrive } from './cassaforte/conto-drive'
import type { EsitoChiaveRicordata } from './cassaforte/sincronia'
import type { StatoAccesso as StatoLogin } from './accesso'

/**
 * **La traccia degli accessi** (25/11).
 *
 * Dopo la 0.119.0, su almeno un PC, il Drive (e forse l'accesso a Claude) si
 * sono ritrovati scollegati e Nicholas ha dovuto rifare tutto. Nel registro
 * non c'era il perché: le righe che lo dicevano («non si decifra», «maestra
 * illeggibile, la butto») andavano solo nella console, che nel programma
 * installato non si vede, e ricollegare cancella il segno dello scollegamento.
 *
 * Qui:
 * - all'avvio una riga per ciascun accesso (Drive, cassaforte, Claude Code,
 *   accesso di un anno) con l'esito e, quando manca, il motivo preciso;
 * - un file **per questo PC** (`accessi-visti.json`, fuori dalla sincronia:
 *   l'elenco dei file che viaggiano è chiuso, vedi `raccolta.ts`) con gli
 *   accessi visti l'ultima volta: **solo sì/no e date, mai token**;
 * - se un accesso che c'era ora manca, un avviso «da sapere» con il motivo.
 *
 * La parte pura (motivi, testi, confronto) è qui sopra; sotto, la guardia
 * che la usa con il disco e l'orologio.
 */

export const FILE_ACCESSI_VISTI = 'accessi-visti.json'

export type ChiaveAccesso = 'drive' | 'cassaforte' | 'claude' | 'gettoneClaude'
export const ACCESSI: readonly ChiaveAccesso[] = ['drive', 'cassaforte', 'claude', 'gettoneClaude']
export const NOMI_ACCESSI: Record<ChiaveAccesso, string> = {
  drive: 'Drive',
  cassaforte: 'cassaforte',
  claude: 'Claude Code',
  gettoneClaude: 'accesso di un anno'
}

/**
 * `in-attesa`: adesso non si sa (il portachiavi di Windows non risponde
 * ancora, succede appena acceso). Non è un accesso perso: si tiene quello di
 * prima e si riguarda al giro dopo.
 */
export type EsitoAccesso = { stato: 'presente' | 'assente' | 'in-attesa'; motivo: string; voluto?: true }
export type FotoAccessi = Record<ChiaveAccesso, EsitoAccesso>

/** Il portachiavi di Windows rispetto all'ultima volta (con la parola di prova cifrata). */
export type ProvaPortachiavi = 'uguale' | 'nuova' | 'cambiata' | 'non-disponibile'

export type AccessiVisti = {
  versione: string
  /** ISO: l'ultima volta che si è guardato. */
  quando: string
  /** Per ciascun accesso: c'era? Da quando è così (ISO)? */
  accessi: Partial<Record<ChiaveAccesso, { presente: boolean; dal: string }>>
  /**
   * Una parola fissa («sierradeck»), cifrata col portachiavi di Windows: non
   * è un segreto. Se la volta dopo non si decifra più, la chiave del
   * portachiavi è cambiata, e con lei tutti i token cifrati prima.
   */
  provaPortachiavi?: string
}

export const PAROLA_DI_PROVA = 'sierradeck'

const quandoBreve = (iso: string): string => {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return iso
  const d = new Date(t)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// ── I motivi ──

export function motivoDrive(d: DiagnosiDrive, prova?: ProvaPortachiavi): EsitoAccesso {
  if (!d.configurato) return { stato: 'assente', motivo: 'mancano le credenziali Google del programma (versione costruita senza)' }
  if (d.lettura === 'ok') {
    return d.rinnovo
      ? { stato: 'presente', motivo: 'collegato' }
      : { stato: 'assente', motivo: 'token del Drive senza rinnovo (refresh token mancante)' }
  }
  if (d.lettura === 'portachiavi-non-pronto') return { stato: 'in-attesa', motivo: 'token del Drive presente, il portachiavi di Windows non risponde ancora' }
  if (d.lettura === 'non-si-decifra') {
    return { stato: 'assente', motivo: `token del Drive presente ma il portachiavi di Windows non lo decifra${prova === 'cambiata' ? ' (la chiave del portachiavi è cambiata dall’ultima volta)' : ''}` }
  }
  if (d.lettura === 'illeggibile') return { stato: 'assente', motivo: 'il file del token del Drive è rovinato' }
  // Assente: lo dice il segno dello scollegamento, se c'è.
  const s = d.scollegamento
  if (s?.motivo === 'revocata') return { stato: 'assente', motivo: `Google risponde invalid_grant: accesso revocato o scaduto (dal ${quandoBreve(s.quando)})` }
  if (s?.motivo === 'a-mano') return { stato: 'assente', motivo: `scollegato da te in Account (dal ${quandoBreve(s.quando)})`, voluto: true }
  return { stato: 'assente', motivo: `token del Drive assente: file google-drive-token.json mancante${d.messoDaParte ? ' (c’è quello rifiutato da Google, messo da parte)' : ''}` }
}

export function motivoCassaforte(c: { haCassaforte: boolean; aperta: boolean; chiave?: EsitoChiaveRicordata }, prova?: ProvaPortachiavi): EsitoAccesso {
  if (!c.haCassaforte) return { stato: 'assente', motivo: 'nessuna cassaforte su questo PC' }
  if (c.aperta) return { stato: 'presente', motivo: 'aperta' }
  switch (c.chiave) {
    case 'portachiavi-non-pronto': return { stato: 'in-attesa', motivo: 'chiave ricordata presente, il portachiavi di Windows non risponde ancora' }
    case 'non-si-decifra':
    case 'messa-da-parte':
      return { stato: 'assente', motivo: `chiave ricordata presente ma il portachiavi di Windows non la decifra${prova === 'cambiata' ? ' (la chiave del portachiavi è cambiata dall’ultima volta)' : ''}: serve la passphrase` }
    case 'illeggibile': return { stato: 'assente', motivo: 'il file della chiave ricordata è rovinato: serve la passphrase' }
    case 'ok': return { stato: 'in-attesa', motivo: 'chiave ricordata letta, la cassaforte si sta aprendo' }
    default: return { stato: 'assente', motivo: 'chiave ricordata assente (file maestra-portachiavi.json mancante): serve la passphrase' }
  }
}

export function motivoClaude(login: Pick<StatoLogin, 'autenticato' | 'motivo'>): EsitoAccesso {
  if (login.autenticato) return { stato: 'presente', motivo: 'accesso fatto' }
  // I motivi di `leggiAccesso` dicono anche cosa fare: qui basta il perché.
  const m = login.motivo ?? ''
  if (m.startsWith('Manca l’accesso')) return { stato: 'assente', motivo: 'file .claude/.credentials.json mancante' }
  if (m.includes('mai avviato')) return { stato: 'assente', motivo: 'Claude Code non risulta mai avviato qui (manca anche .claude.json)' }
  if (m.includes('prima volta')) return { stato: 'assente', motivo: 'la configurazione della prima volta di Claude Code non è finita' }
  return { stato: 'assente', motivo: m.replace(/[.:]\s.*$/u, '').trim() || 'motivo non riferito' }
}

export function motivoGettone(g: StatoGettone): EsitoAccesso {
  switch (g.stato) {
    case 'valido':
    case 'in-scadenza':
      return { stato: 'presente', motivo: `valido fino al ${quandoBreve(new Date(g.scadeIl).toISOString())}` }
    case 'assente': return { stato: 'assente', motivo: 'mai salvato' }
    case 'illeggibile': return { stato: 'assente', motivo: g.perche }
    case 'scaduto': return { stato: 'assente', motivo: `scaduto il ${quandoBreve(new Date(g.scadeIl).toISOString())}` }
    case 'rifiutato': return { stato: 'assente', motivo: `Claude l’ha rifiutato${g.rifiutatoPerche !== undefined ? ` (${g.rifiutatoPerche.replace(/\s+/gu, ' ').slice(0, 120)})` : ''}` }
  }
}

/** La parola di prova di prima si apre ancora? */
export function esitoProvaPortachiavi(salvata: string | undefined, p: { disponibile: boolean; decifra: (s: string) => string }): ProvaPortachiavi {
  if (!p.disponibile) return 'non-disponibile'
  if (salvata === undefined || salvata === '') return 'nuova'
  try { return p.decifra(salvata) === PAROLA_DI_PROVA ? 'uguale' : 'cambiata' } catch { return 'cambiata' }
}

// ── Il registro e il confronto ──

const TESTO_PROVA: Record<ProvaPortachiavi, string> = {
  uguale: 'come l’ultima volta',
  nuova: 'prima prova',
  cambiata: 'CAMBIATO dall’ultima volta: i token cifrati prima non si aprono più',
  'non-disponibile': 'non risponde'
}

/** La riga del registro: un pezzo per accesso, il motivo quando manca. */
export function rigaAccessi(foto: FotoAccessi, c: { versione: string; da?: string; prova?: ProvaPortachiavi; momento?: string }): string {
  const pezzi = ACCESSI.map((k) => {
    const e = foto[k]
    return e.stato === 'presente' ? `${NOMI_ACCESSI[k]} sì` : `${NOMI_ACCESSI[k]} ${e.stato === 'in-attesa' ? 'in attesa' : 'no'} (${e.motivo})`
  })
  const testa = `[accessi] ${c.momento ?? 'avvio'} della ${c.versione}${c.da !== undefined ? ` (prima volta, venivo dalla ${c.da})` : ''}`
  return `${testa}: ${pezzi.join(' · ')}${c.prova !== undefined ? ` · portachiavi di Windows: ${TESTO_PROVA[c.prova]}` : ''}`
}

/** Gli accessi che c'erano l'ultima volta e adesso mancano (non per scelta tua, non «in attesa»). */
export function accessiPersi(prima: AccessiVisti | undefined, foto: FotoAccessi): Array<{ chiave: ChiaveAccesso; motivo: string }> {
  if (prima === undefined) return []
  return ACCESSI
    .filter((k) => prima.accessi[k]?.presente === true && foto[k].stato === 'assente' && foto[k].voluto !== true)
    .map((k) => ({ chiave: k, motivo: foto[k].motivo }))
}

const RIMEDIO: Record<ChiaveAccesso, string> = {
  drive: 'Ricollegalo da Account.',
  cassaforte: 'Aprila da Account con la passphrase.',
  claude: 'Rifallo con «claude» in un terminale.',
  gettoneClaude: 'Rinnovalo da Account.'
}
const COSA: Record<ChiaveAccesso, { dopo: string; ora: string }> = {
  drive: { dopo: 'il Drive si è scollegato', ora: 'Il Drive si è scollegato' },
  cassaforte: { dopo: 'la cassaforte è rimasta chiusa', ora: 'La cassaforte è rimasta chiusa' },
  claude: { dopo: 'l’accesso a Claude Code manca', ora: 'L’accesso a Claude Code manca' },
  gettoneClaude: { dopo: 'l’accesso a Claude di un anno non vale più', ora: 'L’accesso a Claude di un anno non vale più' }
}

/** Il testo dell'avviso: corto, il motivo, cosa fare. */
export function testoAccessoPerso(chiave: ChiaveAccesso, motivo: string, dopoAggiornamento: boolean): string {
  const cosa = dopoAggiornamento ? `Dopo l’aggiornamento ${COSA[chiave].dopo}` : COSA[chiave].ora
  return `${cosa}: ${motivo}. ${RIMEDIO[chiave]}`
}

export function bozzaAccessoPerso(chiave: ChiaveAccesso, motivo: string, dopoAggiornamento: boolean, quando: number): BozzaAvviso {
  return {
    id: `accesso-perso:${chiave}:${quando}`,
    tipo: 'sapere',
    titolo: dopoAggiornamento ? 'Accesso perso dopo l’aggiornamento' : 'Accesso perso',
    testo: testoAccessoPerso(chiave, motivo, dopoAggiornamento),
    bersaglio: { cosa: 'workspace', id: '' }
  }
}

/** Lo stato da scrivere: «in attesa» tiene quello di prima; `dal` cambia solo quando cambia il sì/no. */
export function prossimiVisti(prima: AccessiVisti | undefined, foto: FotoAccessi, versione: string, adesso: number, provaPortachiavi?: string): AccessiVisti {
  const ora = new Date(adesso).toISOString()
  const accessi: AccessiVisti['accessi'] = {}
  for (const k of ACCESSI) {
    const vecchio = prima?.accessi[k]
    const e = foto[k]
    if (e.stato === 'in-attesa') { if (vecchio !== undefined) accessi[k] = vecchio; continue }
    const presente = e.stato === 'presente'
    accessi[k] = vecchio !== undefined && vecchio.presente === presente ? vecchio : { presente, dal: ora }
  }
  const prova = provaPortachiavi ?? prima?.provaPortachiavi
  return { versione, quando: ora, accessi, ...(prova !== undefined ? { provaPortachiavi: prova } : {}) }
}

export function leggiAccessiVisti(file: string): AccessiVisti | undefined {
  try {
    if (!existsSync(file)) return undefined
    const o = JSON.parse(readFileSync(file, 'utf8')) as Partial<AccessiVisti> | null
    if (o === null || typeof o !== 'object' || typeof o.accessi !== 'object' || o.accessi === null) return undefined
    const accessi: AccessiVisti['accessi'] = {}
    for (const k of ACCESSI) {
      const v = (o.accessi as Record<string, unknown>)[k] as { presente?: unknown; dal?: unknown } | undefined
      if (v !== undefined && typeof v.presente === 'boolean' && typeof v.dal === 'string') accessi[k] = { presente: v.presente, dal: v.dal }
    }
    return {
      versione: typeof o.versione === 'string' ? o.versione : '?',
      quando: typeof o.quando === 'string' ? o.quando : new Date(0).toISOString(),
      accessi,
      ...(typeof o.provaPortachiavi === 'string' ? { provaPortachiavi: o.provaPortachiavi } : {})
    }
  } catch { return undefined }
}

// ── La guardia: disco, orologio, avvisi ──

export type GuardiaAccessi = {
  /** `avvio`: la riga c'è sempre. `giro`: solo se qualcosa è cambiato. `chiusura`: si scrive e basta. */
  controlla: (momento: 'avvio' | 'giro' | 'chiusura') => void
  /** Il registro degli avvisi nasce dopo: gli avvisi dell'avvio aspettano lui. */
  collegaAvvisi: (nasce: (b: BozzaAvviso) => void) => void
}

export function creaGuardiaAccessi(d: {
  file: string
  versione: string
  /** La versione di prima, se questo è il primo avvio dopo un aggiornamento. */
  da?: string
  /** La foto: riceve com'è il portachiavi, per dire «è cambiato» nei motivi. */
  foto: (prova: ProvaPortachiavi | undefined) => FotoAccessi
  portachiavi?: { disponibile: () => boolean; cifra: (s: string) => string; decifra: (s: string) => string }
  log: (riga: string) => void
  adesso?: () => number
}): GuardiaAccessi {
  const adesso = d.adesso ?? Date.now
  let prova: ProvaPortachiavi | undefined
  let provaNuova: string | undefined
  let ultimaRiga = ''
  let nasce: ((b: BozzaAvviso) => void) | undefined
  const inCoda: BozzaAvviso[] = []
  const avvisa = (b: BozzaAvviso): void => {
    if (nasce === undefined) { inCoda.push(b); return }
    try { nasce(b) } catch (err) { d.log(`[accessi] avviso non nato: ${String(err)}`) }
  }
  const disponibile = (): boolean => { try { return d.portachiavi?.disponibile() === true } catch { return false } }

  const controlla = (momento: 'avvio' | 'giro' | 'chiusura'): void => {
    const prima = leggiAccessiVisti(d.file)
    // La parola di prova: una volta per sessione, appena il portachiavi risponde.
    if (d.portachiavi !== undefined && (prova === undefined || prova === 'non-disponibile')) {
      prova = esitoProvaPortachiavi(prima?.provaPortachiavi, { disponibile: disponibile(), decifra: d.portachiavi.decifra })
      if (prova === 'nuova' || prova === 'cambiata') {
        try { provaNuova = d.portachiavi.cifra(PAROLA_DI_PROVA) } catch { provaNuova = undefined }
      }
    }
    let foto: FotoAccessi
    try { foto = d.foto(prova) } catch (err) { d.log(`[accessi] non riesco a guardare gli accessi: ${String(err)}`); return }
    const riga = rigaAccessi(foto, { versione: d.versione, ...(momento === 'avvio' && d.da !== undefined ? { da: d.da } : {}), ...(prova !== undefined ? { prova } : {}), momento })
    // Il confronto con quella di prima, senza la testa (cambia col momento).
    const corpo = riga.slice(riga.indexOf(': ') + 2)
    if (momento === 'avvio' || (momento === 'giro' && corpo !== ultimaRiga)) d.log(riga)
    ultimaRiga = corpo
    if (momento !== 'chiusura') {
      const dopo = momento === 'avvio' && d.da !== undefined
      for (const p of accessiPersi(prima, foto)) {
        d.log(`[accessi] ${NOMI_ACCESSI[p.chiave]} c’era (${prima?.accessi[p.chiave]?.dal ?? '?'}) e adesso manca: ${p.motivo}`)
        avvisa(bozzaAccessoPerso(p.chiave, p.motivo, dopo, adesso()))
      }
    }
    if (!scriviJsonAtomico(d.file, prossimiVisti(prima, foto, d.versione, adesso(), provaNuova), 'accessi')) d.log('[accessi] stato degli accessi non scritto')
    provaNuova = undefined
  }

  return {
    controlla,
    collegaAvvisi(f) {
      nasce = f
      for (const b of inCoda.splice(0)) avvisa(b)
    }
  }
}
