/**
 * **Gli avvisi per il telefono**: le regole, senza disco e senza rete.
 *
 * Fino alla 0.100.0 il PC non mandava niente: l'app rileggeva `/api/stato` e
 * ricavava le notifiche dal confronto fra due fotografie, tre volte con tre
 * regole (app, pagina, Telegram). In dodici giorni: 7 domande passate nelle
 * Domande senza una notifica, 4 «il computer è di nuovo raggiungibile» falsi,
 * notifiche a raffica all'apertura dell'app.
 *
 * Adesso l'avviso nasce sul PC, una volta, con un numero progressivo, e chi
 * lo mostra (app, pagina, Telegram) legge lo stesso registro. Qui c'è la
 * forma dell'avviso (il contratto fra PC e app), i testi, quando suona e
 * cosa si manda a chi chiede «dopo il numero N».
 */

export type TipoAvviso = 'domanda' | 'fermo' | 'fatto' | 'sapere'
export const TIPI_AVVISO: readonly TipoAvviso[] = ['domanda', 'fermo', 'fatto', 'sapere']

/** Com'è finito un avviso: ha risposto lui, ha scelto il programma, non serve più, è scaduto. */
export type ComeChiuso = 'risposta' | 'programma' | 'ritirata' | 'scaduta'
export const COME_CHIUSO: readonly ComeChiuso[] = ['risposta', 'programma', 'ritirata', 'scaduta']

/** Dove porta il tocco. `autopilota`: il suo id, quando l'avviso viene da lui. */
export type Bersaglio = {
  cosa: 'domanda' | 'workspace' | 'chat' | 'aggiornamenti' | 'file'
  id: string
  /** L'avviso viene da un altro PC: il suo id, come nel ponte. */
  pc?: string
  autopilota?: string
}

export type AzioneAvviso = { etichetta: string; risposta: string }

export type Avviso = {
  /** Progressivo: cresce a ogni cambiamento (nascita o chiusura). */
  n: number
  /** Stabile: lo stesso avviso, chiuso, ha lo stesso id. */
  id: string
  tipo: TipoAvviso
  titolo: string
  /** La cosa, in una frase: la domanda, il motivo, il titolo della richiesta. */
  testo: string
  sotto?: string
  /** ISO: quando è nato sul PC. */
  quando: string
  /** ISO: quando il programma decide da solo, se lo fa. */
  scadeIl?: string
  bersaglio: Bersaglio
  /** Al più tre, la consigliata per prima. */
  azioni?: AzioneAvviso[]
  /** Già filtrato con le impostazioni, le ore di silenzio e i suoni vicini. */
  suona: boolean
  chiuso?: { quando: string; come: ComeChiuso; testo?: string }
}

/** Un avviso prima di nascere: numero, momento e suono li mette il registro. */
export type BozzaAvviso = Omit<Avviso, 'n' | 'quando' | 'suona' | 'chiuso'> & {
  /** Solo per quel telefono (un file mandato a lui): gli altri non lo ricevono. */
  per?: string
  /** La prova: suona qualunque cosa dicano le impostazioni. */
  suonaComunque?: boolean
}

// ── Le impostazioni: uguali su PC, pagina e app, tenute dal PC ──

export type ModoAvviso = 'suona' | 'silenziosa' | 'spenta'
export const MODI_AVVISO: readonly ModoAvviso[] = ['suona', 'silenziosa', 'spenta']

export type ImpostazioniAvvisi = {
  tipi: Record<TipoAvviso, ModoAvviso>
  /** Anche una chat tua (senza autopilota) ferma da tre minuti. */
  chatFerma: boolean
  /** Le ore di silenzio, «HH:MM» nell'ora del PC: gli avvisi nascono, ma non suonano. */
  silenzio: { da: string; a: string } | null
}

export const IMPOSTAZIONI_AVVISI_PREDEFINITE: ImpostazioniAvvisi = {
  tipi: { domanda: 'suona', fermo: 'suona', fatto: 'silenziosa', sapere: 'silenziosa' },
  chatFerma: false,
  silenzio: null
}

/** I nomi a schermo dei quattro tipi, con la riga del «?». */
export const NOMI_TIPI: Record<TipoAvviso, { titolo: string; spiega: string }> = {
  domanda: { titolo: 'Domande', spiega: 'Una domanda che aspetta te: una scelta che non decido io, una conferma, un consenso. Con i tasti per rispondere dalla notifica.' },
  fermo: { titolo: 'Lavoro fermo', spiega: 'Un lavoro che si è fermato e non riparte da solo, dopo che il programma ha già provato a smuoverlo.' },
  fatto: { titolo: 'Fatto', spiega: 'Una tua richiesta è finita: unita e verificata.' },
  sapere: { titolo: 'Da sapere', spiega: 'Cose che non chiedono niente: «ho scelto io» dopo un’ora senza risposta, una versione pronta, un file per il telefono, i lavori automatici finiti.' }
}
export const NOMI_MODI: Record<ModoAvviso, string> = { suona: 'Suona', silenziosa: 'Silenziosa', spenta: 'Spenta' }

const ORA = /^([01]\d|2[0-3]):[0-5]\d$/u

/**
 * Le impostazioni da quello che arriva (dal disco, dalla pagina, dall'app):
 * quello che manca o non si capisce resta com'era in `base`.
 */
export function leggiImpostazioniAvvisi(x: unknown, base: ImpostazioniAvvisi = IMPOSTAZIONI_AVVISI_PREDEFINITE): ImpostazioniAvvisi {
  const o = typeof x === 'object' && x !== null ? x as Record<string, unknown> : {}
  const t = typeof o.tipi === 'object' && o.tipi !== null ? o.tipi as Record<string, unknown> : {}
  const tipi = { ...base.tipi }
  for (const tipo of TIPI_AVVISO) {
    const v = t[tipo]
    if (typeof v === 'string' && (MODI_AVVISO as readonly string[]).includes(v)) tipi[tipo] = v as ModoAvviso
  }
  let silenzio = base.silenzio
  if (o.silenzio === null) silenzio = null
  else if (typeof o.silenzio === 'object') {
    const s = o.silenzio as Record<string, unknown>
    if (typeof s.da === 'string' && typeof s.a === 'string' && ORA.test(s.da) && ORA.test(s.a)) silenzio = { da: s.da, a: s.a }
  }
  return { tipi, chatFerma: typeof o.chatFerma === 'boolean' ? o.chatFerma : base.chatFerma, silenzio }
}

const minuti = (hhmm: string): number => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))

/** Dentro le ore di silenzio? Anche a cavallo della mezzanotte (23:00–07:00). Uguali = mai. */
export function inSilenzio(silenzio: ImpostazioniAvvisi['silenzio'], quando: Date): boolean {
  if (silenzio === null) return false
  const da = minuti(silenzio.da)
  const a = minuti(silenzio.a)
  if (da === a) return false
  const ora = quando.getHours() * 60 + quando.getMinutes()
  return da < a ? ora >= da && ora < a : ora >= da || ora < a
}

/** Suoni più vicini di così sono uno solo (come dalla 0.81.0 su pagina, app e Telegram). */
export const SUONI_VICINI_MS = 20_000

/**
 * Nasce? Suona? `spenta`: l'avviso non nasce. `suona`: solo fuori dalle ore di
 * silenzio e se l'ultimo suono è più vecchio di `SUONI_VICINI_MS`.
 */
export function comeNasce(
  bozza: Pick<BozzaAvviso, 'tipo' | 'suonaComunque'>, imp: ImpostazioniAvvisi, quando: Date, ultimoSuono: number | undefined
): { nasce: boolean; suona: boolean } {
  if (bozza.suonaComunque === true) return { nasce: true, suona: true }
  const modo = imp.tipi[bozza.tipo]
  if (modo === 'spenta') return { nasce: false, suona: false }
  if (modo !== 'suona' || inSilenzio(imp.silenzio, quando)) return { nasce: true, suona: false }
  return { nasce: true, suona: ultimoSuono === undefined || quando.getTime() - ultimoSuono >= SUONI_VICINI_MS }
}

// ── I testi ──

const unaRiga = (t: string, max: number): string => {
  const r = t.replace(/\s+/gu, ' ').trim()
  return r.length > max ? `${r.slice(0, max - 1).replace(/\s+\S*$/u, '')}…` : r
}

/** «18:40», nell'ora del PC. */
export function oraBreve(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Il nome del workspace come si legge in un titolo; senza nome, il programma. */
const chi = (workspace: string): string => {
  const w = workspace.replace(/^Autopilota\s*·\s*/u, '').trim()
  return w === '' || w.startsWith('cartella:') ? 'SierraDeck' : unaRiga(w, 40)
}

export type SceltaAvviso = { scelta: string; consigliata?: boolean; libera?: boolean }

export type FattoDomanda = {
  cosa: 'domanda'
  /** L'id della domanda, quello a cui si risponde. */
  id: string
  workspace: string
  autopilota?: string
  /** La domanda in una frase. */
  domanda: string
  scelte?: SceltaAvviso[]
  /** Rischiosa o «mai da sola»: resta aperta, nessuno decide al posto suo. */
  aspettaTe?: boolean
  /** Millisecondi: quando il programma sceglie la consigliata (domanda non rischiosa). */
  scadeIl?: number
}
export type FattoDomandaChiusa = { cosa: 'domanda-chiusa'; id: string; come: ComeChiuso; testo?: string }
export type FattoFermo = { cosa: 'fermo'; id: string; workspace: string; autopilota?: string; motivo: string }
export type FattoFatto = { cosa: 'fatto'; id: string; workspace: string; autopilota?: string; titolo: string; tutte?: boolean }

/** Quello che il servizio degli autopiloti scrive nel suo giornale: fatti, non avvisi. */
export type Fatto = FattoDomanda | FattoDomandaChiusa | FattoFermo | FattoFatto
export type Notizia = Fatto & { n: number; quando: string }

/** Quante azioni entrano in una notifica di Android. */
export const AZIONI_MAX = 3

export function bozzaDomanda(f: FattoDomanda): BozzaAvviso {
  const scelte = (f.scelte ?? []).filter((s) => s.libera !== true && s.scelta.trim() !== '')
  const consigliata = scelte.find((s) => s.consigliata === true)
  const ordinate = consigliata !== undefined ? [consigliata, ...scelte.filter((s) => s !== consigliata)] : scelte
  const azioni = ordinate.slice(0, AZIONI_MAX).map((s) => ({ etichetta: unaRiga(s.scelta, 40), risposta: s.scelta.trim() }))
  const c = consigliata !== undefined ? unaRiga(consigliata.scelta, 80) : undefined
  let sotto: string | undefined
  if (f.scadeIl !== undefined) {
    const entro = oraBreve(new Date(f.scadeIl))
    sotto = c !== undefined ? `Consigliata: ${c}. Se non rispondi entro le ${entro} scelgo ${c}` : `Se non rispondi entro le ${entro} scelgo io la strada più prudente`
  } else if (f.aspettaTe === true) sotto = c !== undefined ? `Consigliata: ${c}. Aspetto te: non decido io` : 'Aspetto te: non decido io'
  else if (c !== undefined) sotto = `Consigliata: ${c}`
  return {
    id: `domanda:${f.id}`,
    tipo: 'domanda',
    titolo: `${chi(f.workspace)} chiede`,
    testo: unaRiga(f.domanda, 300) || 'Una domanda aspetta te.',
    ...(sotto !== undefined ? { sotto } : {}),
    ...(f.scadeIl !== undefined ? { scadeIl: new Date(f.scadeIl).toISOString() } : {}),
    bersaglio: { cosa: 'domanda', id: f.id, ...(f.autopilota !== undefined ? { autopilota: f.autopilota } : {}) },
    ...(azioni.length > 0 ? { azioni } : {})
  }
}

export function bozzaFermo(f: FattoFermo): BozzaAvviso {
  return {
    id: `fermo:${f.id}`,
    tipo: 'fermo',
    titolo: `Lavoro fermo · ${chi(f.workspace)}`,
    testo: unaRiga(f.motivo, 300) || 'Serve una tua occhiata.',
    bersaglio: { cosa: 'workspace', id: f.workspace, ...(f.autopilota !== undefined ? { autopilota: f.autopilota } : {}) }
  }
}

/**
 * I lavori che il programma si dà da solo: finiti, sono «da sapere», non un
 * «fatto» di Nicholas. Si riconoscono dall'inizio del titolo della richiesta,
 * che è il testo scritto dal programma (un test lo tiene in pari con chi lo scrive).
 */
export const LAVORI_AUTOMATICI: readonly string[] = ['Errori arrivati', 'Controllo di tutti i PC', 'Scelta consigliata, presa dal programma']

/** Di chi è la richiesta finita: sua, o un lavoro automatico. */
export function origineRichiesta(titolo: string): 'tua' | 'automatica' {
  const t = titolo.replace(/^\s*Fatta:\s*/iu, '').trim().toLowerCase()
  return LAVORI_AUTOMATICI.some((p) => t.startsWith(p.toLowerCase())) ? 'automatica' : 'tua'
}

export function bozzaFatto(f: FattoFatto): BozzaAvviso {
  const cosa = unaRiga(f.titolo.replace(/^\s*Fatta:\s*/iu, ''), 240)
  return {
    id: `fatto:${f.id}`,
    tipo: origineRichiesta(f.titolo) === 'tua' ? 'fatto' : 'sapere',
    titolo: `Fatto · ${chi(f.workspace)}`,
    testo: `${cosa !== '' ? cosa : 'Una richiesta è finita.'}${f.tutte === true ? ' Non resta altro in coda.' : ''}`,
    bersaglio: { cosa: 'workspace', id: f.workspace, ...(f.autopilota !== undefined ? { autopilota: f.autopilota } : {}) }
  }
}

/**
 * Com'è finita una domanda chiusa senza la risposta di Nicholas, dal motivo
 * che il servizio scrive (`servizio-orchestratore.ts`, `chiudiDomandeVecchie`;
 * un test tiene in pari le frasi): la consigliata scelta dal programma dopo
 * un'ora, la strada prudente decisa dall'autopilota, un giorno senza
 * risposta, o non serve più.
 */
export function chiusuraDaMotivo(motivo: string): { come: ComeChiuso; testo?: string } {
  const m = motivo.trim()
  const scelta = /^nessuna risposta in un’ora: scelta la consigliata, «(.+)»$/u.exec(m)
  if (scelta !== null) return { come: 'programma', testo: scelta[1]! }
  if (m.startsWith('nessuna risposta in un’ora')) return { come: 'programma' }
  if (m.startsWith('nessuna risposta in un giorno')) return { come: 'scaduta' }
  return { come: 'ritirata' }
}

const testoValido = (x: unknown): x is string => typeof x === 'string'

/** Una notizia del giornale del servizio, letta dal disco: quella buona, o niente. */
export function notiziaValida(x: unknown): x is Notizia {
  const o = typeof x === 'object' && x !== null ? x as Record<string, unknown> : undefined
  if (o === undefined || typeof o.n !== 'number' || !Number.isFinite(o.n) || !testoValido(o.quando) || !testoValido(o.id) || o.id === '') return false
  switch (o.cosa) {
    case 'domanda': return testoValido(o.workspace) && testoValido(o.domanda) && (o.scelte === undefined || Array.isArray(o.scelte))
    case 'domanda-chiusa': return (COME_CHIUSO as readonly unknown[]).includes(o.come)
    case 'fermo': return testoValido(o.workspace) && testoValido(o.motivo)
    case 'fatto': return testoValido(o.workspace) && testoValido(o.titolo)
    default: return false
  }
}

/** Da un fatto del servizio: l'avviso che nasce, o quello che si chiude. */
export function daFatto(f: Fatto): { nasce: BozzaAvviso } | { chiude: { id: string; come: ComeChiuso; testo?: string } } {
  if (f.cosa === 'domanda') return { nasce: bozzaDomanda(f) }
  if (f.cosa === 'fermo') return { nasce: bozzaFermo(f) }
  if (f.cosa === 'fatto') return { nasce: bozzaFatto(f) }
  return { chiude: { id: `domanda:${f.id}`, come: f.come, ...(f.testo !== undefined && f.testo.trim() !== '' ? { testo: unaRiga(f.testo, 200) } : {}) } }
}

/** Una chat tua (senza autopilota) ferma da tre minuti: solo se «Chat ferma» è accesa. */
export const CHAT_FERMA_MS = 3 * 60_000
export function bozzaChatFerma(c: { id: string; nome: string; chiede: boolean; domanda?: string; dal: number }): BozzaAvviso {
  return {
    id: `chat:${c.id}:${c.dal}`,
    tipo: c.chiede ? 'domanda' : 'fatto',
    titolo: `${unaRiga(c.nome, 40) || 'Una chat'} aspetta te`,
    testo: c.domanda !== undefined && c.domanda.trim() !== '' ? unaRiga(c.domanda, 300) : c.chiede ? 'Chiede una scelta.' : 'Ha finito il turno.',
    bersaglio: { cosa: 'chat', id: c.id }
  }
}

export function bozzaVersione(versione: string): BozzaAvviso {
  return {
    id: `versione:${versione}`,
    tipo: 'sapere',
    titolo: 'Versione pronta',
    testo: `SierraDeck ${versione} è scaricata. La installi tu, quando vuoi.`,
    bersaglio: { cosa: 'aggiornamenti', id: versione }
  }
}

export function bozzaFile(f: { id: string; nome: string; per: string }): BozzaAvviso {
  return {
    id: `file:${f.id}`,
    tipo: 'sapere',
    titolo: 'File per il telefono',
    testo: unaRiga(f.nome, 120),
    bersaglio: { cosa: 'file', id: f.id },
    per: f.per
  }
}

/**
 * Una domanda che apre il programma, non un autopilota: il sì a un file da
 * mandare al telefono, il consenso a un dato del quaderno personale. Il testo
 * è il primo capoverso; le scelte sono i tasti.
 */
export type DomandaDelProgramma = { id: string; testo: string; opzioni?: readonly string[]; da?: string; sotto?: string; scadeIl?: number }
export function bozzaDomandaDelProgramma(d: DomandaDelProgramma): BozzaAvviso {
  const capoverso = d.testo.split(/\n\s*\n/u)[0] ?? d.testo
  const azioni = (d.opzioni ?? []).slice(0, AZIONI_MAX).map((s) => ({ etichetta: unaRiga(s, 40), risposta: s }))
  return {
    id: `domanda:${d.id}`,
    tipo: 'domanda',
    titolo: `${unaRiga(d.da ?? '', 50) || 'SierraDeck'} chiede`,
    testo: unaRiga(capoverso, 300) || 'Una domanda aspetta te.',
    ...(d.sotto !== undefined && d.sotto.trim() !== '' ? { sotto: unaRiga(d.sotto, 120) } : {}),
    ...(d.scadeIl !== undefined && Number.isFinite(d.scadeIl) ? { scadeIl: new Date(d.scadeIl).toISOString() } : {}),
    bersaglio: { cosa: 'domanda', id: d.id },
    ...(azioni.length > 0 ? { azioni } : {})
  }
}

/** «Prova notifica»: suona sempre, perché serve a sapere se arriva. */
export function bozzaProva(quando: Date): BozzaAvviso {
  return {
    id: `prova:${quando.getTime()}`,
    tipo: 'sapere',
    titolo: 'Prova di SierraDeck',
    testo: `Se la leggi, gli avvisi arrivano. Partita alle ${oraBreve(quando)}.`,
    bersaglio: { cosa: 'workspace', id: '' },
    suonaComunque: true
  }
}

/** Un avviso arrivato da un altro PC: stesso contenuto, con il suo PC nel bersaglio e nell'id. */
export function bozzaDaAltroPc(a: Avviso, pc: string, nomePc: string): BozzaAvviso {
  const { n: _n, quando: _q, suona: _s, chiuso: _c, ...resto } = a
  return {
    ...resto,
    id: idDaAltroPc(pc, a.id),
    titolo: nomePc.trim() !== '' ? `${a.titolo} · ${unaRiga(nomePc, 24)}` : a.titolo,
    bersaglio: { ...a.bersaglio, pc }
  }
}
export const idDaAltroPc = (pc: string, id: string): string => `pc:${pc}:${id}`

// ── Cosa si manda a chi chiede ──

/** Quanto può restare aperta una richiesta a `/api/eventi`, in secondi. */
export const ATTESA_MAX_S = 50

/** Un avviso con quello che serve solo al PC (per quale telefono è). */
export type AvvisoTenuto = Avviso & { per?: string }

export function pubblico(a: AvvisoTenuto): Avviso {
  const { per: _per, ...resto } = a
  return resto
}

/**
 * Gli avvisi per chi è arrivato al numero `n`.
 * - quelli cambiati dopo `n`, in ordine;
 * - con `n` a zero, o più avanti dell'ultimo (registro rifatto, app appena
 *   accoppiata): solo le domande ancora aperte, non tutta la storia;
 * - `per`: il telefono che chiede (gli avvisi di un altro telefono no);
 * - `soloLocali`: a un altro PC non si rimandano gli avvisi presi da altri PC.
 */
export function daMandare(avvisi: readonly AvvisoTenuto[], ultimo: number, n: number, opz: { per?: string; soloLocali?: boolean } = {}): Avviso[] {
  const miei = avvisi.filter((a) => (a.per === undefined || a.per === opz.per) && (opz.soloLocali !== true || a.bersaglio.pc === undefined))
  const daCapo = !Number.isFinite(n) || n <= 0 || n > ultimo
  return miei
    .filter((a) => (daCapo ? a.chiuso === undefined && a.tipo === 'domanda' : a.n > n))
    .sort((x, y) => x.n - y.n)
    .map(pubblico)
}

/** I parametri di `/api/eventi`: `avvisi`, `stato` (solo se dato), `attesa` in secondi (0–50). */
export function leggiRichiestaEventi(cerca: URLSearchParams | undefined): { avvisi: number; stato?: number; attesaMs: number } {
  const num = (k: string): number | undefined => {
    const v = cerca?.get(k)
    if (v === null || v === undefined || v.trim() === '') return undefined
    const x = Number(v)
    return Number.isFinite(x) ? x : undefined
  }
  const stato = num('stato')
  const attesa = Math.min(ATTESA_MAX_S, Math.max(0, num('attesa') ?? 0))
  return { avvisi: Math.floor(num('avvisi') ?? 0), ...(stato !== undefined ? { stato } : {}), attesaMs: Math.round(attesa * 1000) }
}

// ── Le righe del registro del PC ──

const breve = (a: Pick<Avviso, 'tipo' | 'titolo'>): string => `${a.tipo} «${unaRiga(a.titolo, 60)}»`

export function rigaNascita(a: Avviso): string {
  return `[avviso] nato n=${a.n} ${breve(a)}: ${unaRiga(a.testo, 80)}${a.suona ? ' (suona)' : ' (silenzioso)'}`
}
export function rigaChiusura(a: Avviso): string {
  return `[avviso] chiuso n=${a.n} ${breve(a)}: ${a.chiuso?.come ?? '?'}${a.chiuso?.testo !== undefined ? ` («${unaRiga(a.chiuso.testo, 60)}»)` : ''}`
}
/** La consegna, con i secondi passati da quando è nato (o è stato chiuso). */
export function rigaConsegna(a: Avviso, chi: string, ora: number): string {
  const da = Date.parse(a.chiuso?.quando ?? a.quando)
  const secondi = Number.isNaN(da) ? '?' : String(Math.max(0, Math.round((ora - da) / 1000)))
  return `[avviso] consegnato n=${a.n} ${breve(a)}${a.chiuso !== undefined ? ' (la chiusura)' : ''} a ${chi} dopo ${secondi} s`
}

/** La riga di stato della schermata «Notifiche»: chi ascolta, e l'ultimo contatto di un telefono (ISO). */
export type VistaStatoAvvisi = { riga: string; inAscolto: boolean; ultimoContatto?: string }
/** Un avviso nell'elenco «Ultime notifiche»: con l'ora e com'è andata, scritte dal PC (le stesse parole ovunque). */
export type AvvisoVisto = Avviso & { ora: string; esito: string }
/** Quello che serve alla schermata «Notifiche», uguale su PC, pagina e app (`GET /api/avvisi/stato`). */
export type VistaAvvisi = VistaStatoAvvisi & { impostazioni: ImpostazioniAvvisi; ultimi: AvvisoVisto[] }

/** Com'è andata, in due parole: aperta (suonata o no, aspetta te) o chiusa (risposta, scelta del programma…). */
export function esitoAvviso(a: Avviso): string {
  const c = a.chiuso
  if (c === undefined) return [a.suona ? 'Suonata' : 'Silenziosa', a.tipo === 'domanda' ? 'aspetta te' : ''].filter((x) => x !== '').join(' · ')
  switch (c.come) {
    case 'programma': return c.testo !== undefined ? `Ho scelto io: ${unaRiga(c.testo, 60)}` : 'Ho scelto io'
    case 'scaduta': return 'Scaduta senza risposta'
    case 'ritirata': return 'Non serve più'
    case 'risposta': return a.bersaglio.cosa === 'file' ? 'Ritirato dal telefono' : a.bersaglio.cosa === 'chat' ? 'La chat è ripartita' : a.tipo === 'domanda' ? 'Risposta data' : 'Chiusa'
  }
}

/** L'ora di un avviso: «18:40» se è di oggi, «10/11 18:40» se no (nell'ora del PC). */
export function oraAvviso(iso: string, adesso: Date): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const oggi = d.toDateString() === adesso.toDateString()
  return oggi ? oraBreve(d) : `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${oraBreve(d)}`
}
export const avvisoVisto = (a: Avviso, adesso: Date): AvvisoVisto => ({ ...a, ora: oraAvviso(a.quando, adesso), esito: esitoAvviso(a) })

/** La riga di stato in cima a «Notifiche»: chi ascolta, o da quanto non si fa vivo. */
export function rigaStatoAvvisi(p: { telefoni: number; inAscolto: boolean; ultimoContatto?: number; ora: number }): string {
  if (p.telefoni === 0) return 'Nessun telefono accoppiato: gli avvisi restano qui.'
  if (p.inAscolto) return 'Il telefono è in ascolto adesso.'
  if (p.ultimoContatto === undefined) return 'Il telefono non si è ancora fatto vivo da quando il programma è aperto.'
  const min = Math.floor((p.ora - p.ultimoContatto) / 60_000)
  if (min < 1) return 'Ultimo contatto del telefono: meno di un minuto fa.'
  if (min < 120) return `Ultimo contatto del telefono: ${min} min fa.`
  const ore = Math.floor(min / 60)
  return ore < 48 ? `Ultimo contatto del telefono: ${ore} ore fa.` : `Ultimo contatto del telefono: ${Math.floor(ore / 24)} giorni fa.`
}
