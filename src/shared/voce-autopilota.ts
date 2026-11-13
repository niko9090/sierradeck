import { senzaSigle, type Battuta } from './chat-autopilota'

/**
 * **La conversazione a voce con l'autopilota** (Nicholas, 13/11: «ascoltare
 * le risposte riassunte che mi dà l'autopilota, o eventuali domande»).
 *
 * Qui le regole pure: come si accorcia un testo per dirlo (niente codice,
 * percorsi, link, sigle), quali parole dette sono comandi, quali battute sono
 * nuove da dire, e la fila delle frasi: una alla volta, mai mentre parli tu.
 * La voce vera (speechSynthesis) sta nel renderer, `voce.ts`.
 */

/** Quanto è lunga al più una frase detta (circa 20 secondi): il resto si legge nella chat. */
export const DETTO_MAX = 320
/** Quante frasi aspettano al più: oltre, le più vecchie diventano «altre novità». */
export const FILA_MAX = 4

const CODICE = /```[\s\S]*?(```|$)/gu

/**
 * Il testo da dire: senza blocchi di codice, link, percorsi, segni del
 * markdown e sigle interne; le prime frasi fino a `max` caratteri.
 */
export function testoDaDire(testo: string, max = DETTO_MAX): string {
  let codice = false
  let t = testo.replace(CODICE, () => { codice = true; return ' ' })
  t = t
    .replace(/`([^`\n]{0,30})`/gu, '$1')
    .replace(/`[^`\n]*`/gu, () => { codice = true; return ' ' })
    .replace(/\bhttps?:\/\/\S+/giu, 'un link')
    // Percorsi Windows e Unix, nomi di file con estensione.
    .replace(/\b[a-z]:\\[^\s,;:)»]*/giu, ' ')
    .replace(/(?:^|\s)(?:\.{0,2}\/)?(?:[\w.-]+\/){1,}[\w.-]*/gu, ' ')
    .replace(/\b[\w-]+\.(?:tsx?|jsx?|mjs|json|md|css|kt|ya?ml|exe|ps1|py)\b/giu, 'un file')
    .replace(/\b[0-9a-f]{7,40}\b/giu, ' ')
    .replace(/\b[krp]-\d+\b/giu, ' ')
    .replace(/^\s{0,3}#{1,6}\s+/gmu, '')
    .replace(/^\s*[-*•]\s+/gmu, '')
    .replace(/^\s*\d+[.)]\s+/gmu, '')
    .replace(/\*\*|__|~~|\|/gu, ' ')
    .replace(/[«»]/gu, '')
    .replace(/\s*\n+\s*/gu, '. ')
  t = senzaSigle(t).replace(/\s+([,.;:!?])/gu, '$1').replace(/([.!?])\.+/gu, '$1').replace(/(?:un file[,\s]+){2,}/gu, 'alcuni file ').replace(/\s{2,}/gu, ' ').trim()
  if (t === '' && codice) return 'Ti ha scritto del codice: lo trovi nella chat.'
  if (t.length > max) {
    const frasi = t.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/gu) ?? [t]
    let fuori = ''
    for (const f of frasi) {
      if ((fuori + f).length > max) break
      fuori += f
    }
    if (fuori.trim() === '') fuori = `${t.slice(0, max).replace(/\s+\S*$/u, '')}…`
    t = `${fuori.trim()} Il resto è nella chat.`
  } else if (codice) {
    t = `${t} C’è anche del codice: lo trovi nella chat.`
  }
  return t
}

export type ComandoVocale = 'riassunto' | 'generale' | 'zitto' | 'ripeti'

const normale = (t: string): string => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/gu, '').replace(/[^a-z\s]/gu, ' ').replace(/\s+/gu, ' ').trim()

/**
 * Le parole dette che sono comandi per il programma, non messaggi
 * all'autopilota: «riassunto», «riassunto generale», «basta», «ripeti». Solo
 * frasi brevi; «fermati» resta un messaggio all'autopilota (ferma il lavoro).
 */
export function comandoVocale(testo: string): ComandoVocale | undefined {
  const t = normale(testo).replace(/^(?:ok |ehi |allora )/u, '').replace(/ (?:per favore|grazie)$/u, '')
  if (t === '' || t.split(' ').length > 5) return undefined
  if (/^(?:fammi (?:il |un )?)?(?:riassunto|punto) (?:generale|completo|di tutto)$|^(?:fammi )?il punto generale$/u.test(t)) return 'generale'
  if (/^(?:fammi (?:il |un )?|dammi (?:il |un )?)?(?:riassunto|riassumi)$|^cosa e successo$|^cosa hai fatto$/u.test(t)) return 'riassunto'
  if (/^(?:basta|stop|zitto|silenzio|smetti di (?:leggere|parlare)|non leggere)$/u.test(t)) return 'zitto'
  if (/^(?:ripeti|puoi ripetere|ripeti per favore)$/u.test(t)) return 'ripeti'
  return undefined
}

/** La chiave di una battuta, per sapere se è già stata detta. */
export function chiaveBattuta(b: Pick<Battuta, 'quando' | 'da' | 'testo'>): string {
  return `${b.quando}|${b.da}|${b.testo.slice(0, 60)}`
}

/**
 * Le battute nuove da dire: le sue (risposte e domande), non le tue né le
 * note di lavoro, e solo quelle non viste. Accendendo la voce si segnano
 * viste tutte quelle che ci sono: la storia vecchia non si legge.
 */
export function battuteDaDire(battute: readonly Battuta[], viste: ReadonlySet<string>): Battuta[] {
  return battute.filter((b) => b.da === 'lui' && !viste.has(chiaveBattuta(b)))
}

/** La frase per una battuta: una domanda si annuncia, con le scelte. */
export function fraseDiBattuta(b: Pick<Battuta, 'testo' | 'tono' | 'domanda'>): string {
  const detto = testoDaDire(b.testo)
  if (b.tono !== 'domanda' && b.domanda === undefined) return detto
  const scelte = b.domanda?.scelte ?? []
  const puoi = scelte.length > 0 ? ` Puoi rispondere: ${scelte.slice(0, 3).map((s) => testoDaDire(s, 60).replace(/[.!?]+$/u, '')).join(', oppure ')}.` : ''
  return `Ha una domanda per te. ${detto}${puoi}`
}

// ------------------------------------------------------------- la fila

export type Frase = { id: string; testo: string }

export type FilaVoce = {
  fila: Frase[]
  /** La frase che si sta dicendo. */
  parla?: Frase
  /** Stai parlando tu (dettatura aperta): la voce tace. */
  ascolta: boolean
  /** L'ultima detta, per «ripeti». */
  ultima?: Frase
  /** Quante volte si è ripetuto: l'id della ripetizione resta diverso dall'originale. */
  ripetute?: number
}

export const FILA_VUOTA: FilaVoce = { fila: [], ascolta: false }

/** Una frase in fondo alla fila (una già in fila non si ripete); oltre il tetto le più vecchie si riassumono. */
export function accoda(s: FilaVoce, f: Frase): FilaVoce {
  if (s.parla?.id === f.id || s.fila.some((x) => x.id === f.id)) return s
  let fila = [...s.fila, f]
  if (fila.length > FILA_MAX) {
    const tolte = fila.length - FILA_MAX + 1
    // Una «altre N» già in fila conta per N.
    const altre = fila.slice(0, tolte).reduce((n, x) => n + (x.id.startsWith('altre:') ? Number(x.id.split(':')[1]) || 1 : 1), 0)
    fila = [{ id: `altre:${altre}`, testo: `Ci sono altre ${altre} novità: le trovi nella chat.` }, ...fila.slice(tolte)]
  }
  return { ...s, fila }
}

/** Frasi da dire subito (il riassunto chiesto da te): fermano quella in corso e prendono il posto della fila. */
export function subito(s: FilaVoce, frasi: Frase[]): FilaVoce {
  return { ...s, fila: frasi, parla: undefined }
}

/**
 * Un testo lungo in pezzi da al più `max` caratteri, tagliati sulle frasi:
 * la voce di Chromium si interrompe da sola sui testi molto lunghi.
 */
export function aPezzi(testo: string, max = 240): string[] {
  const frasi = testo.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/gu) ?? [testo]
  const pezzi: string[] = []
  let ora = ''
  for (const f of frasi) {
    if (ora !== '' && (ora + f).length > max) { pezzi.push(ora.trim()); ora = '' }
    ora += f
  }
  if (ora.trim() !== '') pezzi.push(ora.trim())
  return pezzi
}

/** La prossima da dire, se si può: niente mentre parli tu o mentre un'altra è in corso. */
export function prossima(s: FilaVoce): { stato: FilaVoce; dire?: Frase } {
  if (s.ascolta || s.parla !== undefined) return { stato: s }
  const [prima, ...resto] = s.fila
  if (prima === undefined) return { stato: s }
  return { stato: { ...s, fila: resto, parla: prima }, dire: prima }
}

/** La frase in corso è finita (o non si è potuta dire). */
export function finita(s: FilaVoce, id: string): FilaVoce {
  if (s.parla?.id !== id) return s
  return { ...s, parla: undefined, ultima: s.parla }
}

/** Cominci a parlare tu: la voce tace, e la frase interrotta torna in testa alla fila. */
export function inizioAscolto(s: FilaVoce): FilaVoce {
  return { ...s, ascolta: true, parla: undefined, fila: s.parla !== undefined ? [s.parla, ...s.fila] : s.fila }
}

export function fineAscolto(s: FilaVoce): FilaVoce {
  return { ...s, ascolta: false }
}

/** «Basta»: tace e svuota la fila. */
export function zitto(s: FilaVoce): FilaVoce {
  return { ...s, fila: [], parla: undefined, ...(s.parla !== undefined ? { ultima: s.parla } : {}) }
}

/** «Ripeti»: l'ultima detta, di nuovo, per prima. */
export function ripeti(s: FilaVoce): FilaVoce {
  const u = s.parla ?? s.ultima
  if (u === undefined) return s
  return { ...s, parla: undefined, fila: [{ ...u, id: `${u.id.replace(/#ripeti\d*$/u, '')}#ripeti${(s.ripetute ?? 0) + 1}` }, ...s.fila.filter((x) => x.id !== u.id)], ripetute: (s.ripetute ?? 0) + 1 }
}
