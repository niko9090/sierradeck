import type { Autopilota, ChatGovernata } from './autopilota'
import { vistaAutopilota } from './autopiloti-vista'
import { RUOLI, RUOLI_ORDINE, type Ruolo } from './ruoli-agenti'
import { compitoBreve, nomeChi } from './chat-autopilota'

/**
 * La Panoramica del workspace dell'autopilota (0.77.0). Nicholas, 16/10:
 * «vedere tutto in una vista». La prima linguetta è la dashboard del progetto
 * (l'autopilota in una riga, il dialogo, una scheda per chat, le domande
 * brevi); poi una linguetta per chat, a tutta larghezza. Qui le regole pure,
 * le stesse per il PC, la pagina e l'app (`Panoramica.kt`).
 */

/** Lo stato di una scheda: dall'indicatore unico della 0.76.0 (`indicatoreChat`), più «finita». */
export type StatoScheda = 'chiede' | 'lavora' | 'ferma' | 'finita'

/** I gruppi, nell'ordine in cui si vedono: prima chi aspetta te. */
export const GRUPPI_SCHEDE: readonly StatoScheda[] = ['chiede', 'lavora', 'ferma', 'finita']

/** Il simbolo accanto al colore (revisione UI/UX): lo stato si legge anche senza i colori. */
export const SIMBOLO_STATO: Record<StatoScheda, string> = { chiede: '◆', lavora: '●', ferma: '■', finita: '✓' }

/** Quanto deve durare un cambio di gruppo, tranne «aspetta te», prima che la scheda si sposti. */
export const QUIETE_GRUPPO_MS = 8000

/**
 * Il gruppo di una scheda, senza sfarfallio (revisione UI/UX): in «aspetta
 * te» si entra subito; negli altri gruppi solo se il nuovo stato dura da
 * almeno 8 secondi, altrimenti resta dov'era. Chi chiama ricorda, per ogni
 * chat, il gruppo mostrato e da quando c'è lo stato nuovo.
 */
export function gruppoStabile(adesso: StatoScheda, prima: StatoScheda | undefined, statoDal: number, ora: number): StatoScheda {
  if (prima === undefined || adesso === prima || adesso === 'chiede') return adesso
  return ora - statoDal >= QUIETE_GRUPPO_MS ? adesso : prima
}

export const NOME_GRUPPO: Record<StatoScheda, string> = {
  chiede: 'Aspettano te',
  lavora: 'Al lavoro',
  ferma: 'Ferme',
  finita: 'Finite'
}

export type SchedaChat = {
  id: string
  titolo: string
  /** Il ruolo dello specialista; assente per una chat normale. */
  ruolo?: Ruolo
  stato: StatoScheda
  /** Quando è nata (ms): con il ruolo, l'ordine fisso dentro ogni gruppo. */
  nataIl: number
}

const postoRuolo = (r: Ruolo | undefined): number => (r === undefined ? RUOLI_ORDINE.length : RUOLI_ORDINE.indexOf(r))

/**
 * L'ordine fisso di una chat, senza il gruppo: per ruolo (Sviluppo,
 * Interfaccia, Collaudo, Revisione, Rilascio, poi le chat normali), poi per
 * data di nascita, poi per id. Non dipende dall'ordine in cui arrivano le
 * chat né dal loro stato: fra un aggiornamento e l'altro non salta niente.
 */
export function confrontaFisso(a: Pick<SchedaChat, 'id' | 'ruolo' | 'nataIl'>, b: Pick<SchedaChat, 'id' | 'ruolo' | 'nataIl'>): number {
  return postoRuolo(a.ruolo) - postoRuolo(b.ruolo) || a.nataIl - b.nataIl || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}

/**
 * Le schede in gruppi: aspettano te → al lavoro → ferme → finite; dentro ogni
 * gruppo l'ordine fisso. Una scheda cambia posto solo se cambia gruppo. I
 * gruppi vuoti non ci sono.
 */
export function ordinaSchede<T extends SchedaChat>(schede: readonly T[]): { gruppo: StatoScheda; nome: string; schede: T[] }[] {
  const fuori: { gruppo: StatoScheda; nome: string; schede: T[] }[] = []
  for (const g of GRUPPI_SCHEDE) {
    const dentro = schede.filter((s) => s.stato === g).sort(confrontaFisso)
    if (dentro.length > 0) fuori.push({ gruppo: g, nome: NOME_GRUPPO[g], schede: dentro })
  }
  return fuori
}

/** Le misure delle linguette (revisione UI/UX): 150 px l'una, 120 px per la Panoramica e «Altre ▾», fra 4 e 10 in tutto. */
// 0.81.0: 190 (era 150), con il nome tagliato su una parola intera da `nomeLinguetta`:
// a 150 «Sviluppo · Spiega …» si tagliava a metà.
export const LARGHEZZA_LINGUETTA = 190
/** Quanti caratteri del nome stanno in una linguetta larga `LARGHEZZA_LINGUETTA`. */
export const NOME_LINGUETTA_MAX = 22

/**
 * Il nome di una linguetta della Panoramica: «Ruolo · titolo», tagliato su una
 * parola intera con «…» se è più lungo di `max`, mai a metà parola. Il titolo
 * intero resta nel `title` della linguetta.
 */
export function nomeLinguetta(nomeRuolo: string | undefined, titolo: string, max = NOME_LINGUETTA_MAX): string {
  const base = titolo.replace(/^[^·]+ · /, '').replace(/\s+/g, ' ').trim()
  const prima = nomeRuolo !== undefined ? `${nomeRuolo} · ` : ''
  const tutto = `${prima}${base}`
  if (tutto.length <= max) return tutto
  const taglio = tutto.slice(0, max)
  const spazio = taglio.lastIndexOf(' ')
  // Una parola sola più lunga della linguetta: si taglia lei, non c'è altro modo.
  if (spazio <= prima.length) return `${taglio.slice(0, max - 1)}…`
  return `${taglio.slice(0, spazio).replace(/ ·$/, '')}…`
}
export const LARGHEZZA_FISSA = 120
export const LINGUETTE_MIN = 4
export const LINGUETTE_MAX = 10

/**
 * Le linguette delle chat che stanno nella larghezza, dopo la Panoramica, e
 * quelle che vanno in «Altre ▾». Sempre visibili: chi aspetta te, chi lavora
 * e la chat aperta, anche se non ci stanno. Le altre riempiono i posti che
 * restano, in ordine fisso. Le visibili sono mostrate in ordine fisso (non per
 * gruppo): una linguetta non si sposta quando la sua chat cambia stato.
 */
export function linguetteVisibili<T extends SchedaChat>(larghezza: number, chat: readonly T[], aperta?: string): { visibili: T[]; altre: T[] } {
  const inOrdine = [...chat].sort(confrontaFisso)
  // Le linguette in tutto, Panoramica compresa: fra 4 e 10.
  const inTutto = Math.min(LINGUETTE_MAX, Math.max(LINGUETTE_MIN, Math.floor((larghezza - LARGHEZZA_FISSA) / LARGHEZZA_LINGUETTA)))
  const posti = inTutto - 1
  if (inOrdine.length <= posti) return { visibili: inOrdine, altre: [] }
  // Sempre in vista la chat aperta, chi aspetta te e chi lavora, ma non oltre il tetto delle linguette:
  // con 26 chat che chiedevano (copia dei dati veri, 16/10) diventavano 26 linguette di un carattere.
  const priorita = (c: T): number => (c.id === aperta ? 0 : c.stato === 'chiede' ? 1 : 2)
  const sempre = new Set(inOrdine.filter((c) => c.stato === 'chiede' || c.stato === 'lavora' || c.id === aperta)
    .sort((x, y) => priorita(x) - priorita(y) || confrontaFisso(x, y))
    .slice(0, LINGUETTE_MAX - 1)
    .map((c) => c.id))
  let liberi = posti - sempre.size
  const scelte = new Set(sempre)
  for (const c of inOrdine) {
    if (liberi <= 0) break
    if (scelte.has(c.id)) continue
    scelte.add(c.id)
    liberi -= 1
  }
  return { visibili: inOrdine.filter((c) => scelte.has(c.id)), altre: inOrdine.filter((c) => !scelte.has(c.id)) }
}

export type RiassuntoAutopilota = {
  obiettivo: string
  stato: { parola: string; colore: string }
  criteri: { fatti: number; totali: number; testo: string }
}

/** La riga in alto della Panoramica: obiettivo, stato in una parola con il suo colore, criteri. */
export function riassuntoAutopilota(a: Autopilota, ora: number): RiassuntoAutopilota {
  const v = vistaAutopilota(a, ora)
  const prima = a.obiettivo.split(/\r?\n/).map((r) => r.trim()).find((r) => r !== '') ?? ''
  return {
    obiettivo: prima.length > 160 ? `${prima.slice(0, 159).trimEnd()}…` : prima,
    stato: { parola: v.stato.parola, colore: v.stato.colore },
    criteri: v.criteri
  }
}

/** I codici ANSI (colori, cursore) e i caratteri di controllo. */
const ANSI = /\u001b\[[0-?]*[ -/]*[@-~]|\u001b\][^\u0007]*(\u0007|\u001b\\)|\u001b[@-Z\\-_]|[\u0000-\u0008\u000b-\u001f\u007f]/g
/** Righe che non dicono niente: cornici, il campo vuoto, i suggerimenti e la barra dei permessi di Claude Code. */
const RUMORE = [
  /^[\s─━│┃╭╮╰╯┌┐└┘├┤┬┴┼═║╔╗╚╝▔▁▏▕·•…_-]*$/,
  /^\s*[│|]?\s*❯\s*$/,
  /^\s*[│|]?\s*❯\s*Try "/,
  /\? for shortcuts/,
  /⏵⏵|bypass permissions|shift\+tab to cycle/i,
  /^\s*◐.*\/effort/,
  /Your login expires/i,
  /Transcript saving is off/i,
  // La riga di stato di Claude Code (modello, contesto, limiti del piano): vista nella prova del 16/10.
  /contesto \d+%|context \d+%|\b5 ore \d+%|settimana \d+%|week \d+%/i,
  // La testata di Claude Code (0.78.0): il logo, la versione, il piano.
  /[▐▛▜▌▝▘]{2}/,
  /Claude Code v\d/,
  // L'uscita ripiegata di Claude Code (prova del 16/10): «… +18 lines (ctrl+o to expand)».
  /^\s*… \+\d+ lines?\b/,
  // Una cornice con un titolo lungo dentro («──── ciao, una domanda ──»): tratti ai due capi.
  /^\s*[─━═]{4,}.*[─━═]{2,}\s*$/,
  /· Claude (Max|Pro|Team|Enterprise)\b/
]
/** I tratti delle cornici: una riga fatta per lo più di questi è una cornice, anche con un titolo dentro (0.78.0). */
const TRATTI = /[─━═╌╍┄┅┈┉]/g
const eCornice = (r: string): boolean => {
  const piena = r.replace(/\s/g, '')
  return piena.length > 0 && (piena.match(TRATTI)?.length ?? 0) / piena.length >= 0.6
}
/** Pezzi di codici colore rimasti senza ESC (un flusso tagliato a metà): «;2;153;153m». */
const ANSI_SPEZZATO = /;?(?:\d{1,3};)+\d{1,3}m/g
/** La riga d'attività (spinner): «✻ Pouncing… (12s · ↓ 231 tokens)». */
const ATTIVITA = /^\s*[✻✶✳✢·*⏺◐◓◑◒]?\s*\S+…\s*\(/
/** Il riepilogo di fine turno: «✻ Cooked for 5s · done 17:41». */
const RIEPILOGO = /^\s*[✻✶✳✢·*]\s*\S+ for [\dhms ]+(·|$)/

/**
 * Le ultime righe dal vivo di una chat per la sua scheda: pulite dai codici
 * ANSI, senza cornici, campo vuoto e suggerimenti in grigio. Al più `quante`.
 */
export function righeDalVivo(righe: readonly string[], quante = 4): string[] {
  const pulite = righe
    .flatMap((r) => r.split(/\r?\n/))
    .map((r) => r.replace(ANSI, '').replace(ANSI_SPEZZATO, '').replace(/\s+$/, ''))
    // Il bordo di una casella intorno al testo («│ testo │»): resta il testo (0.78.0).
    .map((r) => r.replace(/^\s*[│┃║]\s?/, '').replace(/\s*[│┃║]\s*$/, ''))
    .filter((r) => r.trim() !== '' && !RUMORE.some((x) => x.test(r)) && !eCornice(r))
    // Due righe uguali di fila sono una (0.78.0).
    .filter((r, i, tutte) => i === 0 || r.trim() !== tutte[i - 1]!.trim())
  return pulite.slice(-quante).map((r) => (r.length > 160 ? `${r.slice(0, 159)}…` : r))
}

/** «da 3 min», «da 2 h», «adesso»: da quanto la scheda è in quello stato. */
export function daQuanto(dalMs: number | undefined, ora: number): string {
  if (dalMs === undefined || !Number.isFinite(dalMs)) return ''
  const s = Math.max(0, Math.round((ora - dalMs) / 1000))
  if (s < 60) return 'adesso'
  const m = Math.round(s / 60)
  if (m < 60) return `da ${m} min`
  const h = Math.round(m / 60)
  return h < 48 ? `da ${h} h` : `da ${Math.round(h / 24)} giorni`
}

/**
 * L'ultima azione di una chat normale (senza lo specialista che la racconta):
 * l'ultima riga dal vivo che non sia la riga d'attività né uno spinner
 * ripetuto («Pouncing…Pouncing…», visto nella prova del 16/10).
 */
export function ultimaAzioneDalVivo(righe: readonly string[]): string {
  // Anche il riepilogo del turno («✻ Churned for 22s · done 17:31», prova del 16/10): non è un'azione.
  const pulite = righeDalVivo(righe, 12).filter((r) => !ATTIVITA.test(r) && !RIEPILOGO.test(r) && !/(\S+…)\1/.test(r.replace(/\s+/g, '')))
  return (pulite[pulite.length - 1] ?? '').trim()
}

// ─── Panoramica 2 (0.78.0) ───────────────────────────────────────────────
// Nicholas, 16/10, sulla 0.77.0: «puoi fare meglio». Le finite occupavano
// tutto, le schede erano vuote, il dialogo era un registro tecnico, in alto
// «finito» stava accanto a «Criteri 0/2». Rivista da un agente UI/UX prima
// del codice. In alto la situazione; al centro «Adesso» (solo chi lavora o
// aspetta te), il «Piano» a colonne, «Finite: N ▸»; a sinistra la
// conversazione, gli eventi tecnici in «Cosa è successo ▸».

/** Lo stato coerente con i criteri: «finito» solo se lo sono tutti (revisione UI/UX). */
export type StatoSituazione = { id: string; parola: string; colore: string; simbolo: string; ragione?: string }

const SIMBOLO_SITUAZIONE: Record<string, string> = {
  guasto: '✗', aspetta: '◆', 'senza-segni': '◐', 'al-lavoro': '●', prepara: '○', pronto: '◆', fermo: '■', finito: '✓', 'da-verificare': '◐'
}

/**
 * Lo stato dell'autopilota in una parola, coerente con i criteri: se dice di
 * aver finito ma i criteri non sono tutti soddisfatti è «da verificare» in
 * ambra; senza criteri è «finito» in grigio, mai verde. Il verde con ✓ vale
 * solo per «tutti i criteri soddisfatti».
 */
export function statoCoerente(a: Autopilota, ora: number): StatoSituazione {
  const v = vistaAutopilota(a, ora)
  const { fatti, totali } = v.criteri
  if (v.stato.id === 'finito') {
    if (totali === 0) return { id: 'finito', parola: 'finito', colore: 'quieto', simbolo: '✓', ragione: 'senza criteri da misurare' }
    if (fatti < totali) return { id: 'da-verificare', parola: 'da verificare', colore: 'ambra', simbolo: '◐', ragione: `dice di aver finito, ma i criteri soddisfatti sono ${fatti} su ${totali}` }
  }
  return { id: v.stato.id, parola: v.stato.parola, colore: v.stato.colore, simbolo: SIMBOLO_SITUAZIONE[v.stato.id] ?? '●', ...(v.stato.ragione !== undefined ? { ragione: v.stato.ragione } : {}) }
}

/** Un criterio per l'elenco che si apre dalla barra: ✓ soddisfatto, ✗ no, ○ mai controllato. */
export type CriterioVista = { descrizione: string; esito: 'si' | 'no' | 'mai'; quando?: string; prova?: string }

export function criteriVista(a: Autopilota): CriterioVista[] {
  return a.criteri.map((c) => {
    const v = c.ultimaVerifica
    const esito: CriterioVista['esito'] = c.soddisfatto ? 'si' : v !== undefined ? 'no' : 'mai'
    const quando = c.raggiuntoIl ?? v?.quando
    const riga = (v?.uscita ?? '').split(/\r?\n/).map((r) => r.replace(ANSI, '').trim()).filter((r) => r !== '').pop()
    const prova = c.comando !== undefined ? `${c.comando}${riga !== undefined ? `: ${riga}` : ''}` : riga
    return { descrizione: c.descrizione, esito, ...(quando !== undefined ? { quando } : {}), ...(prova !== undefined && prova !== '' ? { prova } : {}) }
  })
}

/** La situazione in alto: l'obiettivo intero (lo taglia a 2 righe chi disegna), lo stato coerente, i criteri. */
export type Situazione = { obiettivo: string; stato: StatoSituazione; criteri: { fatti: number; totali: number; testo: string; elenco: CriterioVista[] } }

export function situazioneAutopilota(a: Autopilota, ora: number): Situazione {
  const elenco = criteriVista(a)
  const fatti = elenco.filter((c) => c.esito === 'si').length
  return {
    // Tutto l'obiettivo in una riga sola: le 2 righe le fa chi disegna, con il resto dietro «Mostra tutto».
    obiettivo: a.obiettivo.split(/\r?\n/).map((r) => r.trim()).filter((r) => r !== '').join(' '),
    stato: statoCoerente(a, ora),
    criteri: { fatti, totali: elenco.length, testo: elenco.length === 0 ? '—' : `${fatti}/${elenco.length}`, elenco }
  }
}

/** Le fasi del Piano, nell'ordine delle colonne. */
export type FaseCompito = 'da-fare' | 'in-corso' | 'in-revisione' | 'fatto'
export const FASI_PIANO: readonly { id: FaseCompito; nome: string }[] = [
  { id: 'da-fare', nome: 'Da fare' },
  { id: 'in-corso', nome: 'In corso' },
  { id: 'in-revisione', nome: 'In revisione' },
  { id: 'fatto', nome: 'Fatto' }
]

/** Un compito del Piano, con lo specialista che ce l'ha in mano adesso. */
export type CompitoPiano = {
  id: string
  testo: string
  fase: FaseCompito
  /** Lo specialista assegnato: in revisione è la Revisione. */
  ruolo?: Ruolo
  /** Lo specialista che l'ha fatto, quando ora ce l'ha la Revisione. */
  autore?: Ruolo
  /** La sessione della chat da aprire al clic: quella che ci lavora adesso. */
  sessione?: string
  /** «aspetta una risposta», «in pausa»: solo quando non lavora. */
  nota?: string
  /** Quante volte la Revisione l'ha rimandato indietro. */
  giri?: number
}

const numeroDi = (id: string): number => { const n = Number(/(\d+)$/.exec(id)?.[1] ?? NaN); return Number.isFinite(n) ? n : 0 }

/**
 * I compiti dell'autopilota in fasi, dal suo stato (niente testo da
 * interpretare): i compiti non ancora affidati sono «da fare»; una chat che
 * lavora (o aspetta, o è in pausa) è «in corso»; una chat finita che deve
 * passare dalla Revisione e non è ancora unita è «in revisione»; approvata, o
 * senza revisione, o con l'autopilota finito, è «fatto». Le chat di Revisione
 * non sono compiti: stanno sul compito che rivedono. Un compito rifatto da
 * più chat compare una volta sola, con la chat più recente.
 */
export function pianoAutopilota(a: Autopilota): CompitoPiano[] {
  const fuori: CompitoPiano[] = []
  if (a.chats.length === 0) {
    // La chat unica: un compito, l'obiettivo.
    if (a.sessionId !== undefined && a.stato !== 'intervista' && a.stato !== 'pronto') {
      fuori.push({
        id: a.id, testo: a.nome.trim() !== '' ? a.nome : a.obiettivo.split(/\r?\n/)[0] ?? '',
        fase: a.stato === 'finito' ? 'fatto' : 'in-corso', sessione: a.sessionId,
        ...(a.stato === 'attesa' ? { nota: 'aspetta te' } : a.stato === 'sospeso' || a.stato === 'fallito' ? { nota: 'fermo' } : {})
      })
    }
  } else {
    const revisioni = a.chats.filter((c) => c.ruolo === 'revisione' && c.revisioneDi !== undefined)
    const ultimaPerTesto = new Map<string, ChatGovernata>()
    for (const c of a.chats) {
      if (c.ruolo === 'revisione' && c.revisioneDi !== undefined) continue
      const prima = ultimaPerTesto.get(c.compito)
      if (prima === undefined || numeroDi(c.id) > numeroDi(prima.id)) ultimaPerTesto.set(c.compito, c)
    }
    for (const c of ultimaPerTesto.values()) {
      const giri = c.rifacimenti !== undefined && c.rifacimenti > 0 ? { giri: c.rifacimenti } : {}
      const base = { id: c.id, testo: c.compito, ...giri }
      if (c.stato !== 'finita') {
        fuori.push({
          ...base, fase: 'in-corso', ...(c.ruolo !== undefined ? { ruolo: c.ruolo } : {}), ...(c.sessionId !== undefined ? { sessione: c.sessionId } : {}),
          ...(c.stato === 'bloccata' ? { nota: 'aspetta una risposta' } : c.stato === 'pausa' ? { nota: 'in pausa' } : {})
        })
        continue
      }
      const conRevisione = c.ruolo !== undefined && RUOLI[c.ruolo].conRevisione
      if (a.stato === 'finito' || c.approvata === true || !conRevisione) {
        fuori.push({ ...base, fase: 'fatto', ...(c.ruolo !== undefined ? { ruolo: c.ruolo } : {}), ...(c.sessionId !== undefined ? { sessione: c.sessionId } : {}) })
        continue
      }
      // In revisione: al clic la Revisione che lo sta leggendo, se c'è; altrimenti la chat che l'ha fatto.
      const rev = revisioni.filter((r) => r.revisioneDi === c.id).sort((x, y) => numeroDi(y.id) - numeroDi(x.id))[0]
      const sessione = rev !== undefined && rev.stato !== 'finita' && rev.sessionId !== undefined ? rev.sessionId : c.sessionId
      fuori.push({ ...base, fase: 'in-revisione', ruolo: 'revisione', ...(c.ruolo !== undefined ? { autore: c.ruolo } : {}), ...(sessione !== undefined ? { sessione } : {}) })
    }
  }
  const presi = new Set(fuori.map((c) => c.testo))
  a.compitiDaFare.forEach((t, i) => {
    if (presi.has(t)) return
    const r = a.ruoliCompiti?.[t]?.ruolo
    fuori.push({ id: `da-fare-${i}`, testo: t, fase: 'da-fare', ...(r !== undefined ? { ruolo: r } : {}) })
  })
  return fuori
}

/** Le 4 colonne del Piano, sempre tutte e 4; dentro, per ruolo e poi come sono nati: l'ordine non salta. */
export function colonnePiano(compiti: readonly CompitoPiano[]): { fase: FaseCompito; nome: string; compiti: CompitoPiano[] }[] {
  const ordine = (c: CompitoPiano): number => postoRuolo(c.autore ?? c.ruolo)
  return FASI_PIANO.map((f) => ({
    fase: f.id,
    nome: f.nome,
    compiti: compiti.filter((c) => c.fase === f.id).sort((x, y) => ordine(x) - ordine(y) || numeroDi(x.id) - numeroDi(y.id) || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0))
  }))
}

/**
 * «Adesso» e «Finite»: in «Adesso» solo chi lavora o aspetta te (prima chi
 * aspetta te), tutto il resto in «Finite: N ▸», in ordine fisso.
 */
export function adessoEFinite<T extends SchedaChat>(schede: readonly T[]): { adesso: T[]; finite: T[] } {
  const g = ordinaSchede(schede)
  const di = (x: StatoScheda): T[] => g.find((y) => y.gruppo === x)?.schede ?? []
  return { adesso: [...di('chiede'), ...di('lavora')], finite: [...di('ferma'), ...di('finita')] }
}

/**
 * La conversazione e gli eventi: a sinistra solo le battute fra te e
 * l'autopilota (`tu`, `lui`); le note di lavoro (rami, revisioni, «ha
 * deciso») vanno in «Cosa è successo ▸», dalla più recente. Si separa dal
 * campo `da` della battuta, mai dal testo.
 */
export function separaConversazione<B extends { da: 'tu' | 'lui' | 'nota'; tono?: string }>(battute: readonly B[]): { messaggi: B[]; eventi: B[] } {
  // Le righe corte dei traguardi (0.79.0: «Revisione: ha approvato …, unito.») stanno nella conversazione.
  const inConversazione = (b: B): boolean => b.da !== 'nota' || b.tono === 'traguardo'
  return { messaggi: battute.filter(inConversazione), eventi: battute.filter((b) => !inConversazione(b)).reverse() }
}

// ─── Il riassunto accanto alla conversazione (0.79.0) ───────────────────
// Nicholas: la conversazione con l'autopilota grande e sempre in vista, e
// accanto un riassunto che si aggiorna da solo, una riga per chat al lavoro:
// chi è, cosa fa adesso in parole semplici, da quanto, se aspetta lui. Dai
// segnali (lo stato e da quando) e dal registro dell'autopilota (ruolo e
// compito), mai dalle parole delle chat.

/** Una riga del riassunto. */
export type RigaAlLavoro = {
  id: string; chi: string; ruolo?: Ruolo; cosa: string; quanto: string; aspettaTe: boolean
  /** Cosa fa in questo momento, dai segnali (`attivita-chat.ts`): «fa girare i test», «modifica il codice (App.tsx)». */
  adesso?: string
}

/** Il titolo del riassunto: «Al lavoro · 3 · ◆ 1 aspetta te». */
export function titoloAlLavoro(righe: readonly RigaAlLavoro[]): string {
  const aspettano = righe.filter((r) => r.aspettaTe).length
  return `Al lavoro · ${righe.length}${aspettano === 0 ? '' : aspettano === 1 ? ' · ◆ 1 aspetta te' : ` · ◆ ${aspettano} aspettano te`}`
}

/** La parte quieta di una riga: «aspetta te · da 3 min». */
export function sottoAlLavoro(r: RigaAlLavoro): string {
  // «adesso» (0.79.0): quello che fa in questo momento, dai segnali; un «aspetta il tuo permesso: …» dice già «aspetta te».
  const adesso = r.adesso !== undefined && r.adesso !== '' ? [r.adesso] : []
  return [...(r.aspettaTe && adesso.length === 0 ? ['aspetta te'] : []), ...adesso, ...(r.quanto !== '' ? [r.quanto] : [])].join(' · ')
}

const VERBO_RUOLO: Record<Ruolo, string> = { sviluppo: 'lavora a', interfaccia: 'lavora a', collaudo: 'prova', revisione: 'rilegge', rilascio: 'prepara' }

/**
 * Le righe del riassunto: solo le chat al lavoro o che aspettano te, prima
 * quelle che aspettano te, poi nell'ordine fisso (per ruolo). Lo stato e «da
 * quanto» vengono dalla scheda (i segnali); chi è e cosa fa dalla chat
 * governata con la stessa sessione.
 */
export function riassuntoAlLavoro(
  a: Pick<Autopilota, 'chats' | 'sessionId'> | undefined,
  schede: readonly (SchedaChat & { sessione?: string; dal?: number; suPc?: string })[],
  ora: number,
  /** Cosa fa adesso ogni chat, dai segnali (0.79.0): `attivitaDaSegnali` sui segnali della sessione. */
  attivita?: (sessione: string) => string | undefined
): RigaAlLavoro[] {
  const alLavoro = schede.filter((s) => s.stato === 'lavora' || s.stato === 'chiede')
    .sort((x, y) => (x.stato === 'chiede' ? 0 : 1) - (y.stato === 'chiede' ? 0 : 1) || confrontaFisso(x, y))
  return alLavoro.map((s) => {
    const g = s.sessione !== undefined ? a?.chats.find((c) => c.sessionId === s.sessione) : undefined
    const ruolo = g?.ruolo ?? s.ruolo
    let cosa: string
    if (g !== undefined) {
      const autore = g.revisioneDi !== undefined ? a?.chats.find((c) => c.id === g.revisioneDi) : undefined
      if (autore !== undefined) cosa = `rilegge il lavoro di ${nomeChi(autore)}: «${compitoBreve(autore.compito)}»`
      else cosa = `${ruolo !== undefined ? VERBO_RUOLO[ruolo] : 'lavora a'}: «${compitoBreve(g.compito)}»`
    } else if (a?.sessionId !== undefined && s.sessione === a.sessionId) {
      cosa = 'lavora all’obiettivo'
    } else {
      // Una chat del workspace che l'autopilota non guida: il suo nome.
      cosa = `chat del workspace: «${compitoBreve(s.titolo.replace(/^[^·]+ · /, ''))}»`
    }
    return {
      id: s.id,
      chi: ruolo !== undefined ? RUOLI[ruolo].nome : 'Chat',
      ...(ruolo !== undefined ? { ruolo } : {}),
      cosa,
      quanto: s.suPc !== undefined ? `su ${s.suPc}` : daQuanto(s.dal, ora),
      aspettaTe: s.stato === 'chiede',
      ...(adessoDi(s) !== undefined ? { adesso: adessoDi(s) as string } : {})
    }
  })
  function adessoDi(s: { sessione?: string; suPc?: string }): string | undefined {
    // I segnali sono di questo PC: per una chat che lavora su un altro PC non ci sono.
    return s.sessione !== undefined && s.suPc === undefined ? attivita?.(s.sessione) : undefined
  }
}

/**
 * Le chat con lo stesso titolo si distinguono con «#1», «#2» nell'ordine fisso
 * (0.78.0): sui dati veri del 16/10 «Predefinito» aveva molte chat diverse che
 * cominciavano tutte con «Sei l'ANALISTA del portafoglio…», schede identiche.
 */
export function numeraUguali<T extends SchedaChat>(schede: readonly T[]): T[] {
  // Uguali per come si vedono: i primi 40 caratteri (titoli diversi solo in fondo, tagliati dal «…», sembravano uguali).
  const inizio = (t: string): string => t.replace(/s+/g, ' ').trim().slice(0, 40).toLowerCase()
  const conti = new Map<string, number>()
  const numero = new Map<string, number>()
  for (const s of [...schede].sort(confrontaFisso)) {
    const n = (conti.get(inizio(s.titolo)) ?? 0) + 1
    conti.set(inizio(s.titolo), n)
    numero.set(s.id, n)
  }
  // Il numero davanti: in fondo lo tagliava il «…» dei titoli lunghi.
  return schede.map((s) => ((conti.get(inizio(s.titolo)) ?? 1) > 1 ? { ...s, titolo: `#${numero.get(s.id) ?? 1} ${s.titolo}` } : s))
}
