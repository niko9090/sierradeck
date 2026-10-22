import type { PartiDomanda } from './domanda-strutturata'
import type { OpzioneScelta } from './domande-telefono'

/**
 * Una domanda come la vede chi deve rispondere (0.72.1).
 *
 * Nicholas, 15/10: «le domande non si capiscono, scrive troppe cose ed è una
 * chat a sé stante; deve esserci la domanda e le risposte eventuali». Una
 * scheda per domanda, uguale su PC, pagina e app:
 * - `chi`, in piccolo: la chat o l'autopilota, e il progetto;
 * - `domanda`, in grande: **una frase**;
 * - `scelte`: i tasti, con la consigliata segnata;
 * - il campo «Scrivi tu» (con il suo `segnaposto`);
 * - `dettagli`: tutto il resto (cosa sta facendo, perché, cosa succede con
 *   ogni scelta, lo schermo della chat), dietro un «?» chiuso.
 * Niente cronologia: la storia con l'autopilota resta nella sua scheda.
 *
 * Pura: la calcola il PC (`/api/domande`, dettaglio dell'autopilota), pagina e
 * app la disegnano così com'è.
 */

export type SceltaScheda = {
  testo: string
  consigliata?: true
  /** Le scelte di una chat (elenco di Claude Code): il numero nell'elenco. */
  numero?: number
  /** «Type something.»: si risponde scrivendo. */
  libera?: true
  spuntata?: boolean
  invio?: true
  /**
   * Il testo da mostrare, in italiano (0.84.1), quando è diverso da `testo`:
   * «Type something.» → «Scrivo io la risposta». Al tocco si manda sempre
   * `testo`, che è quello sullo schermo della chat.
   */
  etichetta?: string
}

/**
 * Una domanda di una chat di un altro PC arrivata senza il testo (0.84.1):
 * un PC più vecchio non lo mette nel battito. Il tasto «Apri la chat su <PC>»
 * porta alla chat dal vivo, dove la domanda si legge.
 */
export type ApriChatAltrove = { pcId: string; pc: string; sessione: string; cwd: string; titolo: string }

export type DettaglioScheda = { etichetta: string; testo: string }

export type SchedaDomanda = {
  chi: string
  domanda: string
  scelte: SceltaScheda[]
  dettagli: DettaglioScheda[]
  segnaposto: string
  /** L'autopilota ha già risposto da solo (la domanda era della sua chat). */
  risposta?: string
  /**
   * La domanda è stata chiusa senza risposta perché non serve più (0.84.1):
   * il motivo. Al posto di `risposta`, che diceva «risposta dall'autopilota».
   */
  superata?: string
  /** Quante altre domande aspettano dopo questa. */
  poi?: number
  /** Il testo non è arrivato (0.84.1): il tasto «Apri la chat su <PC>». */
  apri?: ApriChatAltrove
}

/** Oltre questa lunghezza una frase si taglia: il resto è nei dettagli. */
export const FRASE_MAX = 200

/** Righe di cornice dello schermo (bordi, frecce, elenchi numerati): non sono la domanda. */
const CORNICE = /^[\s─━│┃╭╮╰╯┌┐└┘├┤┬┴┼═║╔╗╚╝▔▁·•❯>›*-]*$/

function taglia(t: string): string {
  const s = t.replace(/\s+/g, ' ').trim()
  return s.length > FRASE_MAX ? `${s.slice(0, FRASE_MAX - 1).trimEnd()}…` : s
}

/**
 * La domanda in una frase, da un testo lungo o dallo schermo di una chat:
 * l'ultima frase che finisce con «?»; se non ce n'è, l'ultima riga di testo.
 */
export function fraseDomanda(testo: string): string {
  const righe = testo
    .split(/\r?\n/)
    .map((r) => r.replace(/^[\s│┃║❯>›•*-]+|[\s│┃║]+$/g, '').trim())
    .filter((r) => r !== '' && !CORNICE.test(r))
    // «X» ti chiede: — l'intestazione del testo composto, non la domanda.
    .filter((r) => !/^«.*» ti chiede:$/.test(r))
    // Le opzioni numerate dell'elenco di Claude Code stanno nei tasti.
    .filter((r) => !/^\d+[.)]\s/.test(r))
  for (let i = righe.length - 1; i >= 0; i -= 1) {
    const r = righe[i]!
    const fine = r.lastIndexOf('?')
    if (fine === -1) continue
    // Dall'inizio della frase (dopo l'ultimo . ! : prima del «?») fino al «?».
    const prima = r.slice(0, fine)
    const inizio = Math.max(prima.lastIndexOf('. '), prima.lastIndexOf('! '), prima.lastIndexOf(': '))
    let frase = r.slice(inizio === -1 ? 0 : inizio + 2, fine + 1)
    // Una domanda spezzata su due righe dello schermo: si riprende la riga sopra.
    // Solo se questa riga comincia in minuscolo: una maiuscola apre una frase nuova.
    if (inizio === -1 && i > 0 && /^[a-zà-ù]/.test(frase) && !/[.!:?]$/.test(righe[i - 1]!)) frase = `${righe[i - 1]!} ${frase}`
    return taglia(frase)
  }
  return taglia(righe.at(-1) ?? '')
}

/** Il progetto dalla cartella: l'ultimo pezzo del percorso. */
export function progettoDi(cwd: string | undefined): string {
  if (cwd === undefined) return ''
  return cwd.replace(/[\\/]+$/, '').split(/[\\/]/).at(-1) ?? ''
}

/** «autopilota «Notte» · SierraDeck», «chat «Prova» · SierraDeck». */
export function chiDi(tipo: 'autopilota' | 'chat', titolo: string, cwd?: string, suPc?: string): string {
  const progetto = progettoDi(cwd)
  return [`${tipo} «${titolo}»`, progetto !== '' && progetto !== titolo ? progetto : '', suPc !== undefined ? `su ${suPc}` : '']
    .filter((x) => x !== '')
    .join(' · ')
}

/** Una domanda con le cinque parti: la frase e le scelte a vista, il resto nei dettagli. */
export function schedaDaParti(chi: string, p: PartiDomanda, opzioni: { avvertenza?: string; segnaposto?: string } = {}): SchedaDomanda {
  const dettagli: DettaglioScheda[] = []
  if (p.staFacendo !== '') dettagli.push({ etichetta: 'Cosa sta facendo', testo: p.staFacendo })
  if (p.perche !== '') dettagli.push({ etichetta: 'Perché te lo chiede', testo: p.perche })
  const conConseguenza = p.scelte.filter((s) => s.conseguenza !== '')
  if (conConseguenza.length > 0) {
    dettagli.push({ etichetta: 'Cosa succede con ogni scelta', testo: conConseguenza.map((s) => `${s.scelta} → ${s.conseguenza}`).join('\n') })
  }
  if (p.seNonRispondi !== '') dettagli.push({ etichetta: 'Se non rispondi', testo: p.seNonRispondi })
  if (opzioni.avvertenza !== undefined && opzioni.avvertenza !== '') dettagli.push({ etichetta: 'Attenzione', testo: opzioni.avvertenza })
  return {
    chi,
    domanda: p.domanda !== '' ? taglia(p.domanda) : '(la domanda non è stata scritta: guarda il «?»)',
    scelte: p.scelte.map((s) => ({ testo: s.scelta, ...(s.consigliata === true ? { consigliata: true as const } : {}) })),
    dettagli,
    segnaposto: opzioni.segnaposto ?? 'Scrivi tu la risposta'
  }
}

/** Una domanda senza parti (testo libero, con o senza risposte da toccare). */
export function schedaDaTesto(chi: string, testo: string, scelte: SceltaScheda[], segnaposto: string, etichettaTesto = 'Il testo intero'): SchedaDomanda {
  const domanda = fraseDomanda(testo)
  const intero = testo.trim()
  return {
    chi,
    domanda: domanda !== '' ? domanda : '(nessun testo)',
    scelte,
    // Il testo intero solo se dice più della frase.
    dettagli: intero !== '' && intero.replace(/\s+/g, ' ') !== domanda ? [{ etichetta: etichettaTesto, testo: intero }] : [],
    segnaposto
  }
}

/** La consigliata di Claude Code («(Recommended)») si segna come le nostre. */
const RACCOMANDATA = /\((recommended|consigliat[ao])\)/i

/**
 * Le opzioni fisse di Claude Code dette in italiano (0.84.1). Nicholas
 * (22/10): «Scrivo io la risposta», «Ne parlo nella chat». Solo da mostrare:
 * al tocco si manda il testo inglese, che è quello sullo schermo. Le opzioni
 * scritte da Claude per la domanda restano come sono.
 */
const IN_ITALIANO: [RegExp, string | ((m: RegExpExecArray) => string)][] = [
  [/^chat about this\.?$/i, 'Ne parlo nella chat'],
  [/^submit( answers)?\.?$/i, 'Manda le scelte spuntate'],
  [/^yes\.?$/i, 'Sì'],
  [/^no\.?$/i, 'No'],
  [/^yes, and don[’']t ask again(?: for (.+?))?\.?$/i, (m) => (m[1] !== undefined ? `Sì, e non chiedere più per ${m[1]}` : 'Sì, e non chiedere più')],
  [/^yes, allow all edits during this session\b.*$/i, 'Sì, e permetti tutte le modifiche per questa sessione'],
  [/^no, and tell claude what to do differently\b.*$/i, 'No, e dico a Claude cosa fare invece']
]

/** Il testo di un'opzione di una chat in italiano, se è una di quelle fisse di Claude Code; se no `undefined`. */
export function opzioneInItaliano(o: Pick<OpzioneScelta, 'testo' | 'libera' | 'invio'>): string | undefined {
  if (o.libera === true) return 'Scrivo io la risposta'
  const t = o.testo.trim()
  for (const [re, it] of IN_ITALIANO) {
    const m = re.exec(t)
    if (m !== null) return typeof it === 'string' ? it : it(m)
  }
  if (o.invio === true) return 'Manda le scelte spuntate'
  return undefined
}

/** Le opzioni dell'elenco di una chat come tasti; le spiegazioni vanno nei dettagli. */
export function scelteDiChat(opzioni: OpzioneScelta[]): { scelte: SceltaScheda[]; spiegazioni?: DettaglioScheda } {
  const scelte = opzioni.map((o) => ({
    testo: o.testo,
    numero: o.numero,
    ...(opzioneInItaliano(o) !== undefined && opzioneInItaliano(o) !== o.testo ? { etichetta: opzioneInItaliano(o) as string } : {}),
    ...(RACCOMANDATA.test(o.testo) || RACCOMANDATA.test(o.descrizione ?? '') ? { consigliata: true as const } : {}),
    ...(o.libera === true ? { libera: true as const } : {}),
    ...(o.spuntata !== undefined ? { spuntata: o.spuntata } : {}),
    ...(o.invio === true ? { invio: true as const } : {})
  }))
  const conSpiegazione = opzioni.filter((o) => (o.descrizione ?? '').trim() !== '')
  return {
    scelte,
    ...(conSpiegazione.length > 0
      ? { spiegazioni: { etichetta: 'Le scelte, spiegate', testo: conSpiegazione.map((o) => `${opzioneInItaliano(o) ?? o.testo} —${(o.descrizione ?? '').trim()}`).join('\n') } }
      : {})
  }
}
