import { comandoVocale, type ComandoVocale } from './voce-autopilota'

/**
 * **«Parlato»: la conversazione a mani libere con l'autopilota** (Nicholas,
 * 13/11). Due modi, scelti da lui:
 * - **Normale**: come prima. 🎤 apre la dettatura di Windows, il testo va nel
 *   campo e parte solo quando premi «Manda». Niente parte da solo.
 * - **Parlato**: il microfono resta aperto, le risposte nuove si leggono in
 *   breve, e quello che dici dopo la parola di sveglia («Sierra», cambiabile)
 *   va all'autopilota. Il riconoscimento è Whisper sul PC: l'audio non esce.
 *
 * Qui le regole pure: il taglio dei pezzi di voce (VAD), quali pezzi si
 * scartano, la parola di sveglia, cosa fare con una frase trascritta. Il
 * microfono vero sta in `renderer/ascolto.ts`, Whisper in `main/voce-locale.ts`.
 */

export type ModoVoce = 'normale' | 'parlato'

export const PAROLA_SVEGLIA_PREDEFINITA = 'Sierra'

/** Le regole di ogni modo: dove si decide se qualcosa parte da solo. */
export function regoleModo(modo: ModoVoce): {
  /** Il testo dettato con 🎤 (Win+H) parte da solo dopo una pausa: MAI, in nessun modo. */
  dettatoParteDaSolo: false
  /** Il microfono resta aperto e ascolta di continuo. */
  microfonoAperto: boolean
  /** Le risposte nuove si leggono ad alta voce senza accendere «A voce». */
  leggeRisposte: boolean
  /** Si prende solo quello che comincia con la parola di sveglia. */
  serveParolaSveglia: boolean
} {
  const parlato = modo === 'parlato'
  return { dettatoParteDaSolo: false, microfonoAperto: parlato, leggeRisposte: parlato, serveParolaSveglia: parlato }
}

// ------------------------------------------------------------- il taglio (VAD)

/** Durata di un passo di ascolto (1024 campioni a 16 kHz). */
export const PASSO_MS = 64
/** Quanta quiete chiude la frase. */
export const FINE_SILENZIO_MS = 1500
/** Oltre questa durata la frase si chiude comunque (Whisper lavora a finestre di 30 s; più corta è più veloce). */
export const FRASE_MAX_MS = 15_000
/** Quanta voce di fila serve per dire che qualcuno parla (un colpo di tosse no). */
export const ATTACCO_MS = 128
/** Quanto audio prima dell'attacco si tiene, per non perdere la prima sillaba. */
export const PRIMA_MS = 320
/** Volume minimo (RMS, 0–1) sotto cui non è voce, qualunque sia il rumore. */
export const RMS_MIN = 0.012
/** Quanto sopra il rumore di fondo deve stare la voce. */
export const SOPRA_RUMORE = 3

export type Vad = {
  fase: 'quiete' | 'voce'
  /** Il rumore di fondo stimato (RMS), aggiornato solo nella quiete. */
  rumore: number
  /** Da quanti ms la voce supera la soglia (attacco, nella quiete). */
  attacco: number
  /** Durata della frase in corso, ms. */
  durata: number
  /** ms di voce vera dentro la frase. */
  parlato: number
  /** ms di quiete in coda. */
  silenzio: number
  picco: number
  /** Somma dei quadrati e passi della parte parlata, per l'RMS medio. */
  somma: number
  passi: number
}

export const VAD_INIZIO: Vad = { fase: 'quiete', rumore: RMS_MIN / 2, attacco: 0, durata: 0, parlato: 0, silenzio: 0, picco: 0, somma: 0, passi: 0 }

export type FineFrase = { durataMs: number; parlatoMs: number; rmsMedio: number; picco: number; rumore: number; motivo: 'silenzio' | 'lunga' }

/** L'RMS di un passo di audio. */
export function rms(campioni: ArrayLike<number>): number {
  let s = 0
  for (let i = 0; i < campioni.length; i += 1) { const x = campioni[i] ?? 0; s += x * x }
  return campioni.length === 0 ? 0 : Math.sqrt(s / campioni.length)
}

export function sogliaVoce(rumore: number): number {
  return Math.max(RMS_MIN, rumore * SOPRA_RUMORE)
}

/**
 * Un passo dell'ascolto: dice quando comincia una frase (`inizio`) e quando
 * finisce (`fine`, con le misure per decidere se tenerla). Con isteresi: per
 * restare «voce» basta il 70% della soglia.
 */
export function passoVad(s: Vad, livello: number, ms = PASSO_MS): { stato: Vad; evento?: 'inizio' | FineFrase } {
  const soglia = sogliaVoce(s.rumore)
  if (s.fase === 'quiete') {
    if (livello > soglia) {
      const attacco = s.attacco + ms
      if (attacco >= ATTACCO_MS) {
        return { stato: { ...s, fase: 'voce', attacco: 0, durata: attacco, parlato: attacco, silenzio: 0, picco: livello, somma: livello * livello, passi: 1 }, evento: 'inizio' }
      }
      return { stato: { ...s, attacco } }
    }
    // Il rumore segue il fondo piano piano (circa 1,3 s per adattarsi).
    return { stato: { ...s, attacco: 0, rumore: s.rumore * 0.95 + livello * 0.05 } }
  }
  const voce = livello > soglia * 0.7
  const n: Vad = {
    ...s,
    durata: s.durata + ms,
    parlato: s.parlato + (voce ? ms : 0),
    silenzio: voce ? 0 : s.silenzio + ms,
    picco: Math.max(s.picco, livello),
    somma: s.somma + (voce ? livello * livello : 0),
    passi: s.passi + (voce ? 1 : 0)
  }
  const motivo = n.silenzio >= FINE_SILENZIO_MS ? 'silenzio' : n.durata >= FRASE_MAX_MS ? 'lunga' : undefined
  if (motivo === undefined) return { stato: n }
  const fine: FineFrase = { durataMs: n.durata, parlatoMs: n.parlato, rmsMedio: n.passi > 0 ? Math.sqrt(n.somma / n.passi) : 0, picco: n.picco, rumore: s.rumore, motivo }
  return { stato: { ...VAD_INIZIO, rumore: s.rumore }, evento: fine }
}

// ------------------------------------------------------------- quali frasi si tengono

/** Meno di così non è una frase («Sierra» detto da solo dura circa mezzo secondo). */
export const PARLATO_MIN_MS = 350
/** Più piano di così è voce lontana (la TV, qualcuno nell'altra stanza). */
export const RMS_MEDIO_MIN = 0.02

export type Scarto = 'parlava SierraDeck' | 'troppo corta' | 'troppo piano' | 'solo rumore'

/**
 * Se una frase tagliata va trascritta. Si scarta: quella sentita mentre
 * parlava il programma (la sua voce), la troppo corta, la troppo piano, e
 * quella che non si stacca dal rumore di fondo.
 */
export function valutaFrase(f: Pick<FineFrase, 'parlatoMs' | 'rmsMedio' | 'rumore'> & { parlavaLaVoce: boolean }): { tieni: true } | { tieni: false; motivo: Scarto } {
  if (f.parlavaLaVoce) return { tieni: false, motivo: 'parlava SierraDeck' }
  if (f.parlatoMs < PARLATO_MIN_MS) return { tieni: false, motivo: 'troppo corta' }
  if (f.rmsMedio < RMS_MEDIO_MIN) return { tieni: false, motivo: 'troppo piano' }
  if (f.rmsMedio < f.rumore * SOPRA_RUMORE) return { tieni: false, motivo: 'solo rumore' }
  return { tieni: true }
}

/** Dopo che la voce del programma ha smesso, quanto si aspetta prima di riascoltare (l'eco nella stanza). */
export const CODA_VOCE_MS = 600

/** Se adesso si può ascoltare: solo in Parlato, mai mentre parla il programma né subito dopo, mai con la dettatura di Windows aperta. */
export function puoAscoltare(p: { modo: ModoVoce; voceParla: boolean; msDaFineVoce: number; dettaturaAperta: boolean }): boolean {
  if (!regoleModo(p.modo).microfonoAperto) return false
  if (p.voceParla || p.dettaturaAperta) return false
  return p.msDaFineVoce >= CODA_VOCE_MS
}

// ------------------------------------------------------------- la parola di sveglia

const togliAccenti = (t: string): string => t.normalize('NFD').replace(/[̀-ͯ]/gu, '')

/** La parola come la si confronta: minuscola, senza accenti, doppie unite, «ce/ci» come «se/si», senza «h». */
export function formaSveglia(parola: string): string {
  return togliAccenti(parola.toLowerCase())
    .replace(/[^a-z0-9]/gu, '')
    .replace(/h/gu, '')
    .replace(/y/gu, 'i')
    .replace(/c(?=[ei])/gu, 's')
    .replace(/(.)\1+/gu, '$1')
}

function distanza(a: string, b: string): number {
  if (a === b) return 0
  let prima = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i += 1) {
    const ora = [i]
    for (let j = 1; j <= b.length; j += 1) {
      ora[j] = Math.min((prima[j] ?? 0) + 1, (ora[j - 1] ?? 0) + 1, (prima[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prima = ora
  }
  return prima[b.length] ?? Math.max(a.length, b.length)
}

/** Quanti errori si perdonano: nessuno sulle parole corte, uno fino a 7 lettere, due oltre. */
function tolleranza(forma: string): number {
  return forma.length <= 3 ? 0 : forma.length <= 7 ? 1 : 2
}

/** Le parole di riempimento che possono precedere la parola di sveglia. */
const RIEMPITIVI = new Set(['ehi', 'ei', 'hey', 'ehy', 'ok', 'okay', 'oke', 'allora', 'ciao', 'senti', 'oh', 'o', 'eh', 'e'])

/**
 * Parole italiane vere a un errore dalla parola di sveglia (13/11): non svegliano,
 * o «la serra in giardino…» detto da qualcuno nella stanza partirebbe come messaggio.
 */
const PAROLE_VERE = new Set(['serra', 'serre', 'sera', 'sere'].map(formaSveglia))

/** Una parola di sveglia accettabile: da 2 a 20 lettere, una o due parole. */
export function parolaSvegliaValida(p: string): boolean {
  const t = p.trim()
  return /^[\p{L}][\p{L}' -]{1,19}$/u.test(t) && formaSveglia(t).length >= 2 && t.split(/\s+/u).length <= 2
}

/**
 * Se il testo comincia con la parola di sveglia, il resto (con le sue
 * maiuscole e la punteggiatura interna). Whisper la scrive in tanti modi:
 * «Sierra,» «Siera» «sierra.» «Cierra» e a volte la spezza («Si, era,»):
 * si perdona un errore, si uniscono due parole solo se dopo c'è una pausa
 * scritta (virgola, punto), così «si era detto che…» non sveglia nessuno.
 */
export function cercaParolaSveglia(testo: string, parola: string = PAROLA_SVEGLIA_PREDEFINITA): { resto: string } | undefined {
  const voluta = formaSveglia(parola)
  if (voluta === '') return undefined
  const parole = [...testo.matchAll(/[\p{L}\p{N}]+/gu)].map((m) => ({ t: m[0], da: m.index ?? 0, a: (m.index ?? 0) + m[0].length }))
  // La parola di sveglia di due parole («Ehi Sierra» come parola scelta) si confronta unita, coi riempitivi.
  const quanteParole = parola.trim().split(/\s+/u).length
  let i = 0
  while (quanteParole === 1 && i < parole.length && i < 2 && RIEMPITIVI.has(togliAccenti(parole[i]!.t.toLowerCase())) && formaSveglia(parole[i]!.t) !== voluta) i += 1
  const prima = parole[i]
  if (prima === undefined) return undefined
  const tol = tolleranza(voluta)
  const resto = (a: number): { resto: string } => ({ resto: testo.slice(a).replace(/^[\s,.;:!?…\-–—]+/u, '').trim() })
  if (quanteParole === 1 && distanza(formaSveglia(prima.t), voluta) <= tol && (formaSveglia(prima.t) === voluta || !PAROLE_VERE.has(formaSveglia(prima.t)))) return resto(prima.a)
  const seconda = parole[i + 1]
  if (seconda !== undefined) {
    const unite = formaSveglia(prima.t + seconda.t)
    const pausaDopo = /^\s*[,.;:!?…]/u.test(testo.slice(seconda.a))
    if (quanteParole > 1 && distanza(unite, voluta) <= tol) return resto(seconda.a)
    if (quanteParole === 1 && pausaDopo && prima.t.length <= 4 && distanza(unite, voluta) <= Math.max(0, tol - 1)) return resto(seconda.a)
  }
  return undefined
}

// ------------------------------------------------------------- cosa fare con una frase

/**
 * Le frasi che Whisper scrive da solo sul silenzio o sulla musica (le ha
 * imparate dai sottotitoli): non sono mai di Nicholas.
 */
export function eAllucinazione(testo: string): boolean {
  const t = togliAccenti(testo.toLowerCase()).replace(/[^a-z0-9\s]/gu, ' ').replace(/\s+/gu, ' ').trim()
  if (t === '') return true
  if (/^\s*[[(].*[\])]\s*$/u.test(testo.trim())) return true // [Musica] (applausi)
  return /amara org|sottotitoli (?:creati|a cura|e revisione|di)|grazie per la visione|grazie per l attenzione|iscriviti al canale|blank audio/u.test(t)
    || /^(?:musica|applausi|risate|silenzio|grazie|grazie a tutti|ciao|buona visione)$/u.test(t)
}

export type ComandoParlato = ComandoVocale | 'spegni'

/** I comandi detti dopo la parola di sveglia: quelli della voce («riassunto», «ripeti», «basta») e «smetti di ascoltare». */
export function comandoParlato(resto: string): ComandoParlato | undefined {
  const t = togliAccenti(resto.toLowerCase()).replace(/[^a-z\s]/gu, ' ').replace(/\s+/gu, ' ').trim()
  if (/^(?:smetti di ascoltare|basta ascoltare|spegni(?:ti)?(?: il microfono| l ascolto| parlato)?|chiudi (?:l )?ascolto|non ascoltare piu)$/u.test(t)) return 'spegni'
  return comandoVocale(resto)
}

/** Dopo «Sierra» detto da solo, per quanto la frase seguente vale anche senza la parola. */
export const ATTESA_DOPO_SVEGLIA_MS = 8000

export type DecisioneFrase =
  | { tipo: 'scarta'; motivo: 'vuota' | 'allucinazione' | 'senza parola di sveglia' }
  | { tipo: 'sveglia' }
  | { tipo: 'comando'; comando: ComandoParlato }
  | { tipo: 'manda'; testo: string }

/**
 * Cosa fare con una frase trascritta in Parlato: senza la parola di sveglia
 * si butta (a meno che sia appena stata detta da sola), con la sola parola si
 * resta in attesa, i comandi si eseguono qui, il resto va all'autopilota.
 */
export function decidiFrase(testo: string, c: { parola: string; adesso: number; svegliaFinoA?: number }): DecisioneFrase {
  const t = testo.replace(/\s+/gu, ' ').trim()
  if (t === '') return { tipo: 'scarta', motivo: 'vuota' }
  if (eAllucinazione(t)) return { tipo: 'scarta', motivo: 'allucinazione' }
  const trovata = cercaParolaSveglia(t, c.parola)
  let resto: string
  if (trovata !== undefined) resto = trovata.resto
  else if (c.svegliaFinoA !== undefined && c.adesso <= c.svegliaFinoA) resto = t
  else return { tipo: 'scarta', motivo: 'senza parola di sveglia' }
  if (resto.replace(/[\s,.;:!?…]/gu, '') === '') return { tipo: 'sveglia' }
  if (eAllucinazione(resto)) return { tipo: 'scarta', motivo: 'allucinazione' }
  const comando = comandoParlato(resto)
  if (comando !== undefined) return { tipo: 'comando', comando }
  return { tipo: 'manda', testo: resto.charAt(0).toUpperCase() + resto.slice(1) }
}

// ------------------------------------------------------------- lo stato da mostrare

export type FaseAscolto = 'spento' | 'avvio' | 'ascolta' | 'sente' | 'trascrive' | 'sveglia' | 'manda' | 'tace' | 'errore'

/** Le parole dello stato, corte: si leggono con la coda dell'occhio. */
export function testoFase(f: FaseAscolto, parola: string): string {
  switch (f) {
    case 'spento': return 'Spento'
    case 'avvio': return 'Apro il microfono…'
    case 'ascolta': return `In ascolto: di’ «${parola}…»`
    case 'sente': return 'Sento qualcuno…'
    case 'trascrive': return 'Capisco…'
    case 'sveglia': return 'Ti ascolto: parla'
    case 'manda': return 'Mando…'
    case 'tace': return 'Parla SierraDeck: non ascolto'
    case 'errore': return 'Microfono fermo'
  }
}

// ------------------------------------------------------------- la finestra

export type EventoFinestra = 'nascosta' | 'ridotta' | 'chat-chiusa'

/**
 * Cosa succede a Parlato quando la finestra cambia. Chiusa nell'area di
 * notifica (la X): si spegne, perché nessuno vede più che il microfono è
 * aperto. Ridotta a icona: resta, è il caso delle mani libere mentre si usa
 * altro, e Windows mostra comunque il suo segno del microfono sulla barra.
 * La chat chiusa (cambio di workspace): si spegne, la voce non saprebbe più
 * cosa leggere.
 */
export function dopoEventoFinestra(e: EventoFinestra): 'spegni' | 'resta' {
  return e === 'ridotta' ? 'resta' : 'spegni'
}
