import type { VistaAttesa } from '@shared/attesa-specialisti'
import type { EsitoUnione, StatoDopoLavoro } from '@shared/dati-pannello-agenti'
import { daQuanto, nomeWorkspace } from '@shared/attesa-vista'
import { chiaveWorkspace } from '@shared/coda-richieste'
import { statoUnione } from '@shared/menu-specialisti'

/**
 * **Il pannello degli agenti** (k-176a): la parte pura, senza DOM. Filtri,
 * raggruppamenti ed etichette stanno qui e li provano i test; `PannelloAgenti.tsx`
 * li disegna soltanto. Tutto arriva da `VistaAttesa` (stessa fonte della lista).
 */

type Voce = VistaAttesa['alLavoro'][number]

const norma = (t: string): string => String(t).replace(/\\/g, '/').replace(/\/+$/, '').replace(/^cartella:/, '').toLowerCase()

/** Il workspace è uno di quelli dell'autopilota scelto? Senza riferimenti, tutti. */
export function delWorkspace(workspace: string, riferimenti: readonly string[]): boolean {
  const miei = riferimenti.filter((r) => r !== '').map(norma)
  return miei.length === 0 || miei.includes(norma(workspace))
}

/** Quanto è durato o dura, in parole corte: «meno di 1 min», «12 min», «2 h 10 min». */
export function testoDurata(ms: number | undefined): string {
  if (ms === undefined || !Number.isFinite(ms)) return ''
  const min = Math.floor(Math.max(0, ms) / 60_000)
  if (min < 1) return 'meno di 1 min'
  if (min < 60) return `${min} min`
  const ore = Math.floor(min / 60)
  const resto = min % 60
  return `${ore} h${resto > 0 ? ` ${resto} min` : ''}`
}

/** Dove lavora, senza mai dire il nome di questo PC. */
export function testoPc(v: Pick<Voce, 'perPc' | 'suPc' | 'pannello'>): string {
  const p = v.pannello?.pc
  const altro = v.suPc ?? p?.nome
  if (altro !== undefined && altro !== '') return `su ${altro}`
  const per = v.perPc ?? p?.perConto
  if (per !== undefined && per !== '') return `qui, per ${per}`
  return 'questo PC'
}

export type RigaAgente = {
  id: string
  /** Il ruolo (tipo di specialista). */
  ruolo: string
  /** Il compito del piano («k-40»), se c'è. */
  compito?: string
  /** Cosa deve fare, in parole semplici. */
  titolo: string
  file: string[]
  fileAltri: number
  pc: string
  durata: string
  /** L'ultima cosa fatta (l'ultimo strumento usato); vuoto se non si sa. */
  adesso: string
  /** Il tasto «Ferma» vale solo per un Agent del flusso o un lavoro affidato: non per una chat, non per un lavoro ospitato. */
  puoFermare: boolean
  fermaRichiesta: boolean
  /** Ha finito e sta rimandando il ramo qui. */
  invio: boolean
}

/**
 * Solo chi lavora davvero adesso, del workspace scelto: via chi sta arrivando o
 * si prepara (non lavora ancora) e via chi è in fila. Le chat compaiono solo se
 * il servizio le dà come vive (una chat adottata ferma non è nell'elenco);
 * `chatAperte`, se c'è, tiene solo quelle.
 */
export function agentiAlLavoro(vista: VistaAttesa, riferimenti: readonly string[], adesso: number, chatAperte?: ReadonlySet<string>): RigaAgente[] {
  return vista.alLavoro
    .filter((v) => v.fase === undefined && delWorkspace(v.workspace, riferimenti))
    .filter((v) => v.chat !== true || chatAperte === undefined || chatAperte.has(v.id))
    .map((v) => {
      const durata = v.pannello?.durataMs !== undefined ? testoDurata(v.pannello.durataMs) : daQuanto(v.dal, adesso)
      const adessoTesto = (v.pannello?.azione.ultima ?? v.cosaFa ?? '').trim()
      return {
        id: v.id,
        ruolo: v.tipo,
        ...(v.compito !== undefined ? { compito: v.compito } : {}),
        titolo: (v.titolo ?? v.pannello?.azione.titolo ?? v.descrizione).trim(),
        file: v.pannello?.file ?? [],
        fileAltri: v.pannello?.fileAltri ?? 0,
        pc: testoPc(v),
        durata,
        adesso: adessoTesto,
        puoFermare: v.chat !== true && v.perPc === undefined && v.fermaRichiesta !== true,
        fermaRichiesta: v.fermaRichiesta === true,
        invio: v.pannello?.invio === 'invio'
      }
    })
}

/** I file in una riga corta: i primi tre e «+ N altri». */
export function testoFile(file: readonly string[], altri: number): string {
  if (file.length === 0) return ''
  const mostrati = file.slice(0, 3)
  const resto = file.length - mostrati.length + altri
  return `${mostrati.join(', ')}${resto > 0 ? ` + ${resto} altri` : ''}`
}

export type RigaFilaUnione = {
  id: string; titolo: string; inCorso: boolean; posizione: number
  /** La parola dello stato: «in prova adesso», «in fila», «riprova da sola», «ferma». */
  parole: string
  /** 25/11: la riga piccola sotto, da quanto e perché («in fila da 40 min»); vuota con un servizio di prima. */
  sotto: string
  tono: 'blu' | 'ambra' | 'rosso'
  /** Il motivo per esteso (per il title), o vuoto. */
  motivo: string
  aspettaTe: boolean
}
export type RigaEsito = {
  id: string; titolo: string; verde: boolean; parole: string; quando: string; comando: string
  /** 25/11: perché non è verde, intero (per il title), e accorciato per la riga. */
  motivo: string
  motivoCorto: string
}

/** Quanto resta del motivo di un esito nella riga; il resto è nel title. */
export const MOTIVO_CORTO_MAX = 70

const accorcia = (t: string, max: number): string => {
  const s = t.replace(/\s+/g, ' ').trim()
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s
}

/**
 * La fila delle unioni: quella in corso per prima, poi le successive in ordine. 25/11: ogni riga dice
 * anche da quanto aspetta, perché, i tentativi e se aspetta Nicholas (`statoUnione`, la stessa del telefono).
 */
export function filaUnioni(vista: VistaAttesa, riferimenti: readonly string[], adesso: number = Date.now()): RigaFilaUnione[] {
  return (vista.inUnione ?? [])
    .filter((u) => delWorkspace(u.workspace, riferimenti))
    .map((u, i) => ({ u, i }))
    .sort((a, b) => Number(b.u.inCorso) - Number(a.u.inCorso) || (a.u.posizione ?? 999) - (b.u.posizione ?? 999) || a.i - b.i)
    .map(({ u }, n) => {
      const s = statoUnione(u, adesso)
      return { id: u.id, titolo: u.titolo, inCorso: u.inCorso, posizione: n + 1, parole: s.parole, sotto: s.sotto, tono: s.tono, motivo: s.motivo, aspettaTe: s.aspettaTe }
    })
}

/** Dopo quanto i dati di un altro PC si dicono vecchi. */
export const DATI_VECCHI_MS = 30_000

/**
 * 25/11: i dati di un altro PC che non si aggiornano più. Restano a vista, ma una riga lo dice:
 * «Dati di 12 min fa: NOME non risponde». Vuoto se sono freschi, se si legge da questo PC, o se non si è mai letto.
 */
export function testoDatiVecchi(o: { pcNome?: string | undefined; lettoIl?: number | undefined; nonRisponde: boolean; adesso: number }): string {
  if (o.pcNome === undefined || o.lettoIl === undefined) return ''
  const eta = o.adesso - o.lettoIl
  if (!o.nonRisponde && eta < DATI_VECCHI_MS) return ''
  return `Dati di ${eta < 60_000 ? 'meno di 1 min' : testoDurata(eta)} fa: ${o.pcNome} ${o.nonRisponde ? 'non risponde' : 'non si aggiorna'}`
}

const PAROLE_ESITO: Record<EsitoUnione['esito'], string> = { verde: 'unita, criterio verde', rosso: 'criterio rosso', conflitto: 'conflitto', 'non-unita': 'non unita' }

/** Gli esiti recenti dei workspace scelti, il più recente prima; verde solo se l'unione è riuscita con il criterio verde. */
export function esitiRecenti(vista: VistaAttesa, riferimenti: readonly string[], max = 5): RigaEsito[] {
  return Object.entries(vista.esitiUnioni ?? {})
    .filter(([ws]) => delWorkspace(ws, riferimenti))
    .flatMap(([, lista]) => lista)
    .sort((a, b) => Date.parse(b.quando) - Date.parse(a.quando))
    .slice(0, max)
    .map((e) => {
      const verde = e.esito === 'verde' && e.verde !== false
      const motivo = verde ? '' : (e.motivo ?? '').trim()
      return { id: `${e.id}|${e.quando}`, titolo: e.titolo, verde, parole: PAROLE_ESITO[e.esito], quando: e.quando, comando: e.comando ?? '', motivo, motivoCorto: accorcia(motivo, MOTIVO_CORTO_MAX) }
    })
}

export type ColoreStato = 'verde' | 'ambra' | 'rosso'
const STATI_DOPO: Record<StatoDopoLavoro, { parole: string; colore: ColoreStato }> = {
  'in-fila': { parole: 'in fila per l’unione', colore: 'ambra' },
  'in-unione': { parole: 'in prova', colore: 'ambra' },
  unito: { parole: 'unito', colore: 'verde' },
  'criterio-rosso': { parole: 'rimandato indietro: criterio rosso', colore: 'rosso' },
  conflitto: { parole: 'rimandato indietro: conflitto', colore: 'rosso' }
}

export type RigaDopoFinito = { id: string; titolo: string; durata: string; stato: StatoDopoLavoro; parole: string; colore: ColoreStato }

/** Cosa è successo al lavoro dopo il «finito»: durata e dove è arrivato. */
export function dopoFinito(vista: VistaAttesa, riferimenti: readonly string[]): RigaDopoFinito[] {
  return (vista.dopoLavoro ?? [])
    .filter((d) => delWorkspace(d.workspace, riferimenti))
    .map((d) => ({ id: d.id, titolo: d.titolo, durata: testoDurata(d.durataMs), stato: d.stato, parole: STATI_DOPO[d.stato].parole, colore: STATI_DOPO[d.stato].colore }))
}

/* ───────── 23/11: il pannello a destra, completo (richieste r-174, r-176, r-177) ───────── */

/** I modi in cui un workspace si chiama (chiave, cartella): per filtrare la lista dell'autopilota davanti. */
export function riferimentiWorkspace(workspace: string, a?: { workspace?: string | undefined; cwd?: string | undefined }): string[] {
  const r = [workspace]
  if (a !== undefined) r.push(chiaveWorkspace(a), a.cwd ?? '', a.workspace ?? '')
  return r.filter((x) => x.trim() !== '')
}

/** Lo stato di un agente: un colore fisso per ognuno, sempre lo stesso in tutto il pannello. */
export type StatoAgente = 'lavora' | 'invio' | 'in-prova' | 'in-fila' | 'rimandato' | 'finito'
export type ColoreAgente = 'verde' | 'viola' | 'blu' | 'ambra' | 'rosso' | 'grigio'

export const STATI_AGENTE: Record<StatoAgente, { parole: string; colore: ColoreAgente; spiega: string }> = {
  lavora: { parole: 'al lavoro', colore: 'verde', spiega: 'sta lavorando adesso' },
  invio: { parole: 'invio dati - fine lavori', colore: 'viola', spiega: 'ha finito su un altro PC e sta rimandando qui il suo lavoro' },
  'in-prova': { parole: 'in prova / unione', colore: 'blu', spiega: 'ha finito: il programma prova il suo lavoro e lo unisce' },
  'in-fila': { parole: 'in fila', colore: 'ambra', spiega: 'aspetta un posto o il suo turno per l’unione' },
  rimandato: { parole: 'rimandato indietro', colore: 'rosso', spiega: 'il criterio è rosso o c’è un conflitto: il lavoro torna indietro' },
  finito: { parole: 'finito', colore: 'grigio', spiega: 'ha finito e il suo lavoro è unito' }
}
const ORDINE_STATI: StatoAgente[] = ['lavora', 'invio', 'in-prova', 'in-fila', 'rimandato', 'finito']

/** La frase quando nessuno lavora: il pannello non sparisce mai. */
export const FRASE_NESSUNO = 'Nessun agente al lavoro adesso.'
/** Quanti agenti «finito» (già uniti) restano in vista. */
export const FINITI_VISIBILI = 3

export type SchedaAgente = {
  id: string
  stato: StatoAgente
  parole: string
  colore: ColoreAgente
  /** Il ruolo (tipo di specialista), se si sa. */
  ruolo: string
  compito?: string
  titolo: string
  /** Dove gira, in parole («questo PC», «su PC-DUE», «qui, per PC-TRE»); vuoto se non si sa ancora. */
  pc: string
  /** Il nome per raggruppare il consumo: «questo PC» o il nome dell'altro PC. */
  pcNome: string
  durata: string
  token: number
  file: string[]
  fileAltri: number
  adesso: string
  /** Una riga in più: perché aspetta, o a che punto è. */
  nota: string
  puoFermare: boolean
  fermaRichiesta: boolean
}

const PAROLE_FASE = { 'in-arrivo': 'in arrivo', 'in-preparazione': 'in preparazione' } as const

/**
 * Tutti gli agenti del workspace, con uno stato e un colore: chi lavora, chi ha finito e
 * rimanda i dati, chi è in prova o in unione, chi è in fila, chi è stato rimandato indietro
 * e i finiti da poco. Ordinati per stato. Le chat compaiono come agenti solo se lavorano
 * davvero (o se `chatAperte` le tiene).
 */
export function schedeAgenti(vista: VistaAttesa, riferimenti: readonly string[], adesso: number, chatAperte?: ReadonlySet<string>): SchedaAgente[] {
  const fuori: SchedaAgente[] = []
  for (const v of vista.alLavoro) {
    if (!delWorkspace(v.workspace, riferimenti)) continue
    if (v.chat === true && chatAperte !== undefined && !chatAperte.has(v.id)) continue
    const inFase = v.fase !== undefined
    const invio = v.pannello?.invio === 'invio'
    const stato: StatoAgente = inFase ? 'in-fila' : invio ? 'invio' : 'lavora'
    const altro = v.suPc ?? v.pannello?.pc.nome
    fuori.push({
      id: v.id,
      stato,
      parole: inFase ? PAROLE_FASE[v.fase!] : STATI_AGENTE[stato].parole,
      colore: inFase ? 'ambra' : STATI_AGENTE[stato].colore,
      ruolo: v.tipo,
      ...(v.compito !== undefined ? { compito: v.compito } : {}),
      titolo: (v.titolo ?? v.pannello?.azione.titolo ?? v.descrizione).trim(),
      pc: testoPc(v),
      pcNome: altro !== undefined && altro !== '' ? altro : 'questo PC',
      durata: v.pannello?.durataMs !== undefined ? testoDurata(v.pannello.durataMs) : daQuanto(v.dal, adesso),
      token: v.pannello?.token?.totale ?? 0,
      file: v.pannello?.file ?? [],
      fileAltri: v.pannello?.fileAltri ?? 0,
      adesso: (v.pannello?.azione.ultima ?? v.cosaFa ?? '').trim(),
      nota: invio ? 'Il ramo sta tornando qui.' : '',
      puoFermare: !inFase && v.chat !== true && v.perPc === undefined && v.fermaRichiesta !== true,
      fermaRichiesta: v.fermaRichiesta === true
    })
  }
  for (const f of vista.inFila) {
    if (!delWorkspace(f.workspace, riferimenti)) continue
    const nota = f.perUnione !== undefined && f.perUnione.length > 0
      ? `Aspetta l’unione di ${f.perUnione.join(', ')}.`
      : f.prenotata ? 'Il posto è suo: sta per partire.' : f.parcheggiata === true ? 'Riparte dal suo ramo.' : 'Aspetta un posto libero.'
    fuori.push({
      id: f.id,
      stato: 'in-fila',
      parole: STATI_AGENTE['in-fila'].parole,
      colore: 'ambra',
      ruolo: f.tipo,
      ...(f.compito !== undefined ? { compito: f.compito } : {}),
      titolo: (f.titolo ?? f.descrizione).trim(),
      pc: '',
      pcNome: 'questo PC',
      durata: daQuanto(f.dal, adesso),
      token: 0,
      file: [],
      fileAltri: 0,
      adesso: '',
      nota,
      puoFermare: false,
      fermaRichiesta: false
    })
  }
  const finiti: SchedaAgente[] = []
  for (const d of vista.dopoLavoro ?? []) {
    if (!delWorkspace(d.workspace, riferimenti)) continue
    const stato: StatoAgente = d.stato === 'in-unione' ? 'in-prova' : d.stato === 'in-fila' ? 'in-fila' : d.stato === 'unito' ? 'finito' : 'rimandato'
    const parole = d.stato === 'in-fila' ? 'in fila per l’unione' : d.stato === 'unito' ? 'finito e unito' : d.stato === 'criterio-rosso' ? 'rimandato: criterio rosso' : d.stato === 'conflitto' ? 'rimandato: conflitto' : STATI_AGENTE[stato].parole
    const s: SchedaAgente = {
      id: d.id, stato, parole, colore: STATI_AGENTE[stato].colore, ruolo: '', titolo: d.titolo.trim(),
      pc: '', pcNome: 'questo PC', durata: testoDurata(d.durataMs), token: 0, file: [], fileAltri: 0, adesso: '', nota: '',
      puoFermare: false, fermaRichiesta: false
    }
    if (stato === 'finito') { if (finiti.length < FINITI_VISIBILI) finiti.push(s) } else fuori.push(s)
  }
  fuori.push(...finiti)
  return fuori
    .map((s, i) => ({ s, i }))
    .sort((a, b) => ORDINE_STATI.indexOf(a.s.stato) - ORDINE_STATI.indexOf(b.s.stato) || a.i - b.i)
    .map(({ s }) => s)
}

/** Quanti agenti lavorano davvero (al lavoro o in invio dati). */
export const contaAlLavoro = (schede: readonly SchedaAgente[]): number => schede.filter((s) => s.stato === 'lavora' || s.stato === 'invio').length

/** Un numero di token in parole corte: «850», «12 mila», «1,2 mln». */
export function testoToken(n: number): string {
  const x = Number.isFinite(n) && n > 0 ? Math.round(n) : 0
  const c = (v: number): string => (v < 10 ? v.toFixed(1).replace(/\.0$/u, '') : String(Math.round(v))).replace('.', ',')
  if (x < 1000) return String(x)
  if (x < 1_000_000) return `${c(x / 1000)} mila`
  return `${c(x / 1_000_000)} mln`
}

/** I contatori dei token del workspace: totale e di oggi (la somma dei workspace scelti). */
export function contatoriToken(vista: VistaAttesa, riferimenti: readonly string[]): { totali: number; oggi: number } {
  let totali = 0
  let oggi = 0
  for (const [ws, t] of Object.entries(vista.pannelloTotali ?? {})) {
    if (!delWorkspace(ws, riferimenti)) continue
    totali += t.tokenTotali
    oggi += t.tokenOggi
  }
  return { totali, oggi }
}

export type RigaPc = { pc: string; agenti: number; token: number }

/** Il consumo per PC degli agenti che lavorano adesso: questo PC e gli altri, il maggiore prima. */
export function consumoPerPc(schede: readonly SchedaAgente[]): RigaPc[] {
  const per = new Map<string, RigaPc>()
  for (const s of schede) {
    if (s.stato !== 'lavora' && s.stato !== 'invio') continue
    const r = per.get(s.pcNome) ?? { pc: s.pcNome, agenti: 0, token: 0 }
    r.agenti += 1
    r.token += s.token
    per.set(s.pcNome, r)
  }
  return [...per.values()].sort((a, b) => b.token - a.token || b.agenti - a.agenti || a.pc.localeCompare(b.pc))
}

export const FILE_IN_MODIFICA_MAX = 12
export type RigaFile = { file: string; chi: string[] }

/** I file che gli agenti stanno modificando adesso, con chi li tocca (compito o ruolo). */
export function fileInModifica(schede: readonly SchedaAgente[]): { righe: RigaFile[]; altri: number } {
  const per = new Map<string, string[]>()
  let extra = 0
  for (const s of schede) {
    if (s.stato !== 'lavora' && s.stato !== 'invio') continue
    const chi = s.compito ?? s.ruolo
    for (const f of s.file) {
      const l = per.get(f) ?? []
      if (!l.includes(chi)) l.push(chi)
      per.set(f, l)
    }
    extra += s.fileAltri
  }
  const tutti = [...per.entries()].map(([file, chi]) => ({ file, chi }))
  return { righe: tutti.slice(0, FILE_IN_MODIFICA_MAX), altri: Math.max(0, tutti.length - FILE_IN_MODIFICA_MAX) + extra }
}

/** Il nome corto del workspace, per chi ne guarda più d'uno. */
export const nomeCorto = nomeWorkspace

/** L'etichetta del tasto «Ferma» e la domanda di conferma. */
export const TESTO_FERMA = { tasto: 'Ferma', domanda: 'Fermarlo? Il lavoro fatto resta salvato.', si: 'Sì, ferma', no: 'No' } as const

/** Il «?» spiega tutto: nel pannello restano frasi corte. */
export const SPIEGA_PANNELLO =
  'Ogni agente del workspace, con uno stato e sempre lo stesso colore: verde al lavoro, viola invio dati - fine lavori (un agente di un altro PC che rimanda il suo ramo), blu in prova / unione, ambra in fila, rosso rimandato indietro, grigio finito. Per ognuno: cosa fa, dove gira, da quanto e quanti token ha consumato. «Ferma» lo interrompe, con conferma: il lavoro già fatto non si cancella e il compito resta da fare. Le chat si aprono a parte, dalle linguette.'

export const SPIEGA_TOKEN =
  'I token sono il consumo dell’intelligenza artificiale: quelli di oggi e quelli di sempre per questo workspace, più quelli degli agenti che lavorano adesso, divisi per PC.'

export const SPIEGA_UNIONI =
  'Quando uno specialista finisce, il programma prova il suo lavoro e lo unisce, una unione alla volta. In fila: quella in corso e le successive. Gli esiti recenti sono verdi se il criterio è passato, rossi se no: in quel caso il lavoro torna indietro. ' +
  'Sotto ogni riga: da quanto aspetta e perché. «Scaduta» vuol dire che la prova ci ha messo troppo: riprova da sola più tardi e intanto passano le altre. ' +
  '«Ferma» vuol dire che nella cartella principale ci sono file non salvati (o un’operazione lasciata a metà) che il programma non tocca: riparte da sola appena sono a posto. ' +
  '«Aspetta te» vuol dire che il programma ti ha fatto una domanda («li salvo?»): finché non rispondi resta lì. Una riga rossa aspetta da più di un’ora. Passa sopra una riga per leggere il motivo intero.'
