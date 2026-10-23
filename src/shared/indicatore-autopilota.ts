import type { Autopilota, ChatGovernata, Criterio } from './autopilota'
import { durata } from './adesso'
import { attivitaComando } from './attivita-chat'
import { compitoBreve, nomeChi, senzaSigle } from './chat-autopilota'
import { pianoAutopilota } from './panoramica'
import type { Segnale } from './segnali-chat'
import { riassuntoVelocita, tempiRichieste } from './velocita-richieste'

/**
 * **L'indicatore a colpo d'occhio** (0.85.0) in cima all'autopilota, sopra il
 * Punto, uguale su PC, pagina e app.
 *
 * Nicholas, 23/10: «continuo a chiederti a che punto siamo cento volte perché
 * non capisco». Tre righe:
 * 1. la prossima versione: pezzi pronti su totale, cosa manca, tempo stimato
 *    dai tempi misurati (la velocità della 0.85.0; senza, la cadenza delle
 *    ultime release);
 * 2. la fine del lavoro: criteri soddisfatti su totale, compiti in coda, chat
 *    al lavoro, con la barra;
 * 3. va / lento / fermo, **solo dai segnali veri** (commit, test, file
 *    cambiati, uscita del terminale: gli hook di Claude Code, e le unioni e
 *    aperture fatte dal programma), mai dallo stato dichiarato dalle chat. Il
 *    23/10 una chat è rimasta muta 21 minuti e una notte intera è passata
 *    ferma per 7 ore con le chat scritte «al lavoro» e il segnale «avanti».
 *
 * Pura: la calcola il PC (dentro `puntoDi`), la pagina e l'app mostrano le
 * righe come arrivano.
 */

/** Il tipo di un segnale vero, dal più parlante al più generico. */
export type TipoSegnaleVero = 'commit' | 'test' | 'file' | 'terminale'
export type SegnaleVero = { tipo: TipoSegnaleVero; quando: string }

/** Quello che il servizio aggiunge all'elenco: l'ultimo segnale vero per chat (la chat sola con l'id dell'autopilota). */
export type SegniVeri = { segniVeri?: Record<string, SegnaleVero> }

/**
 * Il supervisore che fallisce di fila (0.85.1): lo manda il servizio
 * nell'elenco quando i fallimenti sono almeno 3, con il motivo dell'ultimo.
 */
export type SupervisoreMuto = { volte: number; motivo: string; dal: string }

/** La riga dell'allarme, uguale nell'indicatore e nel registro. */
export function rigaAllarme(s: SupervisoreMuto): string {
  return `Allarme: il supervisore non risponde (${s.volte} volte di fila): ${s.motivo}`
}

const PAROLA_SEGNALE: Record<TipoSegnaleVero, string> = { commit: 'commit', test: 'test', file: 'file cambiati', terminale: 'terminale' }

const istante = (s: string | undefined): number | undefined => {
  const t = Date.parse(s ?? '')
  return Number.isNaN(t) ? undefined : t
}

/**
 * L'ultimo segnale vero di una chat dai suoi hook: uno strumento usato
 * (`PreToolUse`/`PostToolUse`) o un turno chiuso (`Stop`, `StopFailure`).
 * Non contano `UserPromptSubmit` e `SessionStart`, che arrivano quando il
 * servizio le consegna un messaggio, né le notifiche.
 */
export function segnaleVeroDa(segnali: readonly Segnale[]): SegnaleVero | undefined {
  for (let i = segnali.length - 1; i >= 0; i -= 1) {
    const s = segnali[i]!
    if (s.evento === 'Stop' || s.evento === 'StopFailure') return { tipo: 'terminale', quando: s.quando }
    if (s.evento !== 'PreToolUse' && s.evento !== 'PostToolUse') continue
    const st = s.strumento ?? ''
    if (st === 'Bash' || st === 'PowerShell') {
      const comando = s.comando ?? s.dettaglio ?? ''
      if (/\bgit\s+(-C\s+\S+\s+)?commit\b/i.test(comando)) return { tipo: 'commit', quando: s.quando }
      if (attivitaComando(comando) === 'fa girare i test') return { tipo: 'test', quando: s.quando }
      return { tipo: 'terminale', quando: s.quando }
    }
    if (st === 'Edit' || st === 'Write' || st === 'MultiEdit' || st === 'NotebookEdit') return { tipo: 'file', quando: s.quando }
    return { tipo: 'terminale', quando: s.quando }
  }
  return undefined
}

/** I segni veri da JSON (il servizio li manda così): uno illeggibile sparisce. */
export function leggiSegnaleVero(x: unknown): SegnaleVero | undefined {
  if (typeof x !== 'object' || x === null) return undefined
  const o = x as Record<string, unknown>
  const tipo = o.tipo
  if (tipo !== 'commit' && tipo !== 'test' && tipo !== 'file' && tipo !== 'terminale') return undefined
  return typeof o.quando === 'string' && istante(o.quando) !== undefined ? { tipo, quando: o.quando } : undefined
}

/** Oltre così senza segnali veri: lento (giallo). */
export const LENTO_DA_MS = 10 * 60_000
/**
 * Oltre così: fermo (rosso). Dopo i 15 minuti il giro da solo rimette al lavoro
 * la chat muta (`FERMA_DA_DIRE_MS`): a 20 non è servito.
 */
export const FERMO_DA_MS = 20 * 60_000

export type LivelloIndicatore = 'va' | 'lento' | 'fermo'

export type Indicatore = {
  /** Riga 1: «Prossima versione 0.85.0: 2 di 6 pezzi pronti · manca: … · circa 3 h». */
  versione: string
  /** Riga 2: «Fine del lavoro: 7 di 18 criteri · 3 compiti in coda · 2 chat al lavoro», con la barra. */
  fine: { testo: string; percento: number }
  /** Riga 3: va / lento / fermo, dai soli segnali veri. */
  andamento: { livello: LivelloIndicatore; colore: 'verde' | 'ambra' | 'rosso'; simbolo: string; testo: string }
  /** Una riga per chat, per il «?»: l'ultimo segnale vero e quanto tempo fa. */
  dettaglio: string[]
  aiuto: string
}

const COLORE: Record<LivelloIndicatore, Indicatore['andamento']['colore']> = { va: 'verde', lento: 'ambra', fermo: 'rosso' }
/** Per chi non distingue i colori. */
const SIMBOLO: Record<LivelloIndicatore, string> = { va: '●', lento: '◆', fermo: '■' }

const fa = (ms: number): string => (ms < 60_000 ? 'adesso' : `${durata(ms)} fa`)

/** «0.85.0 — …», «Release 0.84.4 pubblicata…»: la versione di cui il criterio è un pezzo. */
export function versioneDelCriterio(descrizione: string): string | undefined {
  return /^\s*(?:release\s+)?v?(\d+\.\d+\.\d+)\b/i.exec(descrizione)?.[1]
}

const confronta = (x: string, y: string): number => {
  const a = x.split('.').map(Number)
  const b = y.split('.').map(Number)
  for (let i = 0; i < 3; i += 1) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) - (b[i] ?? 0)
  return 0
}

/** Il pezzo che manca in poche parole: senza la versione davanti e senza sigle. */
const pezzoBreve = (c: Criterio): string =>
  senzaSigle(compitoBreve(c.descrizione.replace(/^\s*v?\d+\.\d+\.\d+\s*[—–:-]\s*/, ''), 50))

const mediana = (xs: number[]): number | undefined => {
  if (xs.length === 0) return undefined
  const o = [...xs].sort((x, y) => x - y)
  return o[Math.floor((o.length - 1) / 2)]
}

/** Le chat che lavorano adesso (non in pausa, non ad aspettare una risposta). */
function chatAlLavoro(a: Autopilota): number {
  if (a.stato !== 'lavoro' && a.stato !== 'attesa') return 0
  if (a.chats.length === 0) return a.sessionId !== undefined && a.stato === 'lavoro' ? 1 : 0
  return a.chats.filter((c) => c.stato === 'lavoro').length
}

/**
 * Il tempo che manca alla prossima versione, dai tempi misurati: con la
 * velocità della 0.85.0, il lavoro di una richiesta (dalla prima chat al ramo
 * unito, mediana) per ogni giro di pezzi mancanti, con le chat in parallelo,
 * più la pubblicazione. Senza misure, la cadenza delle ultime release.
 */
export function stimaProssima(a: Autopilota, mancanti: number, ora: number): string {
  if (mancanti <= 0) return 'manca solo la pubblicazione'
  const tempi = tempiRichieste(a, ora)
  const lavoro = mediana(tempi
    .filter((t) => t.primaChat !== undefined && t.unita !== undefined)
    .map((t) => Date.parse(t.unita!) - Date.parse(t.primaChat!))
    .filter((x) => Number.isFinite(x) && x > 0))
  if (lavoro !== undefined) {
    const giri = Math.ceil(mancanti / Math.max(1, chatAlLavoro(a)))
    const stima = giri * lavoro + (riassuntoVelocita(tempi).persi.pubblicazione ?? 0)
    return `circa ${durata(stima)}`
  }
  const uscite = (a.releaseUscite ?? []).map((r) => istante(r.quando)).filter((t): t is number => t !== undefined).sort((x, y) => x - y).slice(-6)
  if (uscite.length >= 2) {
    const passo = (uscite[uscite.length - 1]! - uscite[0]!) / (uscite.length - 1)
    const resto = passo - (ora - uscite[uscite.length - 1]!)
    return resto > 60_000 ? `circa ${durata(resto)} (una versione ogni ${durata(passo)})` : `in ritardo sulla media (una versione ogni ${durata(passo)})`
  }
  return 'tempo non ancora misurato'
}

/** Riga 1: la prossima versione. */
function rigaVersione(a: Autopilota, ora: number): string {
  const uscite = new Set((a.releaseUscite ?? []).map((r) => r.versione.replace(/^v/, '')))
  const conVersione = a.criteri.map((c) => ({ c, v: versioneDelCriterio(c.descrizione) })).filter((x): x is { c: Criterio; v: string } => x.v !== undefined)
  const aperte = [...new Set(conVersione.filter((x) => !x.c.soddisfatto && !uscite.has(x.v)).map((x) => x.v))].sort(confronta)
  const prossima = aperte[0]
  let pronti: number
  let totale: number
  let mancano: string[]
  let nome: string
  if (prossima !== undefined) {
    const pezzi = conVersione.filter((x) => x.v === prossima).map((x) => x.c)
    pronti = pezzi.filter((c) => c.soddisfatto).length
    totale = pezzi.length
    mancano = pezzi.filter((c) => !c.soddisfatto).map(pezzoBreve)
    nome = `Prossima versione ${prossima}`
  } else {
    // Criteri senza versione: i pezzi sono i compiti del piano.
    const piano = pianoAutopilota(a)
    if (piano.length === 0) return 'Prossima versione: nessun pezzo ancora in lavoro'
    pronti = piano.filter((x) => x.fase === 'fatto').length
    totale = piano.length
    mancano = piano.filter((x) => x.fase !== 'fatto').map((x) => senzaSigle(compitoBreve(x.testo, 50)))
    nome = 'Prossima versione'
  }
  const manca = mancano.length === 0 ? '' : ` · manca: ${mancano[0]}${mancano.length > 1 ? ` e altri ${mancano.length - 1}` : ''}`
  return `${nome}: ${pronti} di ${totale} pezzi pronti${manca} · ${stimaProssima(a, totale - pronti, ora)}`
}

/** Riga 2: la fine del lavoro, con la percentuale per la barra. */
function rigaFine(a: Autopilota): Indicatore['fine'] {
  const fatti = a.criteri.filter((c) => c.soddisfatto).length
  const n = a.criteri.length
  const coda = a.compitiDaFare.length
  const lavoro = chatAlLavoro(a)
  const criteri = n === 0 ? 'criteri non ancora scritti' : `${fatti} di ${n} criteri`
  const testo = `Fine del lavoro: ${criteri} · ${coda === 1 ? '1 compito' : `${coda} compiti`} in coda · ${lavoro === 1 ? '1 chat' : `${lavoro} chat`} al lavoro`
  return { testo, percento: n === 0 ? 0 : Math.round((fatti / n) * 100) }
}

/** Gli ultimi passi veri del programma: chat aperte e rami uniti. */
function ultimoDelProgramma(a: Autopilota): { quando: number; testo: string } | undefined {
  for (let i = a.decisioni.length - 1; i >= 0; i -= 1) {
    const d = a.decisioni[i]!
    const esito = d.traguardo?.esito
    if (esito !== 'aperta' && esito !== 'unito') continue
    const t = istante(d.quando)
    if (t !== undefined) return { quando: t, testo: esito === 'unito' ? 'l’autopilota ha unito un ramo' : 'l’autopilota ha aperto una chat' }
  }
  return undefined
}

/** Cosa fa l'autopilota adesso: l'ultima mossa del suo registro, senza sigle. */
export function azioneAutopilota(a: Autopilota, ora: number): string {
  if (a.stato === 'attesa') return 'aspetta una tua risposta'
  if (a.stato === 'sospeso' || a.stato === 'fallito') return 'aspetta che tu lo riprenda'
  const d = a.decisioni[a.decisioni.length - 1]
  if (d === undefined) return 'nessuna mossa ancora'
  const t = istante(d.quando)
  return `${senzaSigle(compitoBreve(d.cosa, 70))}${t !== undefined ? ` (${fa(ora - t)})` : ''}`
}

type Vista = { c: ChatGovernata | undefined; chi: string; vero: SegnaleVero | undefined; silenzio: number | undefined; lavora: boolean }

/**
 * Riga 3 e il dettaglio. Il silenzio di una chat si misura dal suo ultimo
 * segnale vero; senza, da quando il servizio raccoglie i segni o da quando è
 * al lavoro (se è dopo): dopo un riavvio nessuno ne ha ancora.
 */
function andamentoDi(a: Autopilota & SegniVeri & { segniDal?: string; supervisoreMuto?: SupervisoreMuto }, ora: number): Pick<Indicatore, 'andamento' | 'dettaglio'> {
  const dal = istante(a.segniDal)
  const viste: Vista[] = (a.chats.length === 0 ? (a.sessionId !== undefined ? [undefined] : []) : a.chats.filter((c) => c.stato !== 'finita')).map((c) => {
    const vero = a.segniVeri?.[c?.id ?? a.id]
    const tVero = istante(vero?.quando)
    const rif = tVero ?? (dal !== undefined ? Math.max(dal, istante(c?.dal) ?? dal) : istante(c?.dal))
    const lavora = c === undefined ? a.stato === 'lavoro' : c.stato === 'lavoro'
    return { c, chi: c === undefined ? 'La chat' : nomeChi(c), vero, silenzio: rif === undefined ? undefined : ora - rif, lavora }
  })
  const dettaglio = viste.map((v) => {
    const compito = v.c !== undefined ? ` («${senzaSigle(compitoBreve(v.c.compito, 40))}»)` : ''
    const t = istante(v.vero?.quando)
    const cosa = v.c?.stato === 'bloccata' ? 'aspetta la tua risposta'
      : v.c?.stato === 'pausa' ? 'in pausa per i limiti del piano'
        : v.vero !== undefined && t !== undefined ? `${PAROLA_SEGNALE[v.vero.tipo]} ${fa(ora - t)}`
          : v.silenzio !== undefined ? `nessun segnale vero da ${durata(v.silenzio)}` : 'nessun segnale vero'
    return `${v.chi}${compito}: ${cosa}`
  })

  const riga = (livello: LivelloIndicatore, testo: string): Indicatore['andamento'] => ({ livello, colore: COLORE[livello], simbolo: SIMBOLO[livello], testo })
  const azione = (): string => `l’autopilota: ${azioneAutopilota(a, ora)}`

  // 0.85.1: il supervisore muto prima di tutto il resto, finché il lavoro non è chiuso:
  // senza di lui i blocchi e le domande sbagliate arrivano lo stesso.
  if (a.supervisoreMuto !== undefined && a.stato !== 'finito') {
    return { andamento: riga('fermo', `${rigaAllarme(a.supervisoreMuto)} · ${azione()}`), dettaglio }
  }

  switch (a.stato) {
    case 'finito': return { andamento: riga('va', 'Finito: tutti i criteri soddisfatti'), dettaglio }
    case 'pronto': return { andamento: riga('lento', 'Aspetta il tuo via per cominciare'), dettaglio }
    case 'intervista': return { andamento: riga('va', 'Prepara: guarda il progetto e scrive i criteri'), dettaglio }
    case 'sospeso':
    case 'fallito': {
      const motivo = a.motivoSospensione !== undefined && a.motivoSospensione.trim() !== '' ? senzaSigle(compitoBreve(a.motivoSospensione, 80)) : 'si è fermato'
      return { andamento: riga('fermo', `Fermo: ${motivo} · ${azione()}`), dettaglio }
    }
    default: break
  }

  // L'ultimo segnale vero di tutto il lavoro: delle chat o del programma.
  const programma = ultimoDelProgramma(a)
  let ultimo: { quando: number; testo: string } | undefined = programma
  for (const v of viste) {
    const t = istante(v.vero?.quando)
    if (v.vero !== undefined && t !== undefined && (ultimo === undefined || t > ultimo.quando)) ultimo = { quando: t, testo: `${v.chi}, ${PAROLA_SEGNALE[v.vero.tipo]}` }
  }
  const lavorano = viste.filter((v) => v.lavora)
  if (lavorano.length === 0) {
    if (a.stato === 'attesa') return { andamento: riga('lento', `Aspetta te: una risposta nella linguetta «Domande» · ${azione()}`), dettaglio }
  }
  // Dopo un riavvio senza segnali: il silenzio conta da quando li si raccoglie.
  const silenzio = ultimo !== undefined ? ora - ultimo.quando : dal !== undefined ? ora - dal : undefined
  if (silenzio !== undefined && silenzio >= FERMO_DA_MS) {
    return { andamento: riga('fermo', `Fermo: nessun segnale vero da ${durata(silenzio)} · ${azione()}`), dettaglio }
  }
  if (silenzio !== undefined && silenzio >= LENTO_DA_MS) {
    return { andamento: riga('lento', `Lento: nessun segnale vero da ${durata(silenzio)} · ${azione()}`), dettaglio }
  }
  // Il lavoro va, ma una chat che dovrebbe lavorare è muta da tanto: lento, col suo nome.
  const muta = lavorano.filter((v) => v.silenzio !== undefined && v.silenzio >= FERMO_DA_MS).sort((x, y) => y.silenzio! - x.silenzio!)[0]
  if (muta !== undefined) {
    return { andamento: riga('lento', `Lento: ${muta.chi} muta da ${durata(muta.silenzio!)} · ${azione()}`), dettaglio }
  }
  if (ultimo === undefined) return { andamento: riga('va', 'Va: appena partito, nessun segnale ancora'), dettaglio }
  return { andamento: riga('va', `Va: ${ultimo.testo} ${fa(ora - ultimo.quando)}`), dettaglio }
}

/** Il «?» dell'indicatore, uguale dappertutto. */
export const AIUTO_INDICATORE = 'Tre righe per capire a colpo d’occhio. La prima: la prossima versione, quanti pezzi sono pronti, cosa manca e quanto ci vorrà, stimato dai tempi misurati (il lavoro di una richiesta dalla prima chat al ramo unito, con le chat in parallelo, più la pubblicazione; senza misure, la cadenza delle ultime versioni). La seconda: quanto manca alla fine del lavoro, con i criteri soddisfatti, i compiti in coda e le chat al lavoro. La terza: va, lento o fermo, solo dai segnali veri (commit, test, file cambiati, uscita del terminale, rami uniti), mai da quello che le chat dicono di sé. Verde con l’ultimo segnale; giallo oltre 10 minuti senza segnali, o con una chat muta da 20; rosso oltre 20 minuti, o con l’autopilota fermo, con il motivo e cosa sta facendo.'

/** L'indicatore dell'autopilota. */
export function indicatoreDi(a: Autopilota & SegniVeri & { segniDal?: string; supervisoreMuto?: SupervisoreMuto }, ora: number): Indicatore {
  return { versione: rigaVersione(a, ora), fine: rigaFine(a), ...andamentoDi(a, ora), aiuto: AIUTO_INDICATORE }
}
