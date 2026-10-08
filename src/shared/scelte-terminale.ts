/**
 * Le scelte che un terminale sta aspettando, riconosciute da fuori.
 *
 * ## Il difetto
 *
 * Dal telefono, dentro una chat, c'era una cosa sola: un campo di testo e
 * «Invia». Va bene finché Claude Code aspetta delle parole. Ma quando disegna
 * un riquadro di scelta — «vuoi riprendere questa conversazione?», «posso
 * scrivere questo file?» — non aspetta parole: aspetta una **freccia e un
 * invio**. Sul telefono quelle frecce non esistono, e non c'è niente da
 * toccare: si vede la domanda, si legge la risposta giusta, e non c'è modo di
 * darla. La chat resta ferma finché non si torna al computer.
 *
 * ## La lettura
 *
 * Un riquadro di scelta si riconosce da poche righe numerate consecutive, e da
 * un cursore (`❯`) su quella attualmente evidenziata:
 *
 *     ╭─────────────────────────────────────╮
 *     │ Vuoi riprendere la conversazione?   │
 *     │                                     │
 *     │ ❯ 1. Sì, riprendi                   │
 *     │   2. No, comincia da capo           │
 *     ╰─────────────────────────────────────╯
 *
 * Si legge **l'ultimo** blocco dello schermo: un terminale conserva anche le
 * scelte già fatte più in alto, e rispondere a una domanda vecchia vorrebbe
 * dire premere invio su qualcosa di completamente diverso.
 *
 * ## Cosa NON si fa
 *
 * Non si manda il numero dell'opzione. In un elenco il numero è spesso anche
 * una scorciatoia, ma non sempre, e dove non lo è finirebbe scritto nel campo
 * di testo. Le frecce e l'invio invece muovono **qualunque** elenco: da qui si
 * dice solo di quanto spostarsi, e chi ha il terminale sotto mano preme i
 * tasti. Se non si riconosce niente, non si mostra niente — mai un pulsante
 * che indovina.
 */

export type Opzione = {
  /** Il numero stampato, così com'è: serve a mostrarlo, non a premerlo. 0 = «Submit» di una scelta multipla. */
  numero: number
  testo: string
  /** Quella su cui è fermo il cursore adesso. */
  scelta: boolean
  /**
   * La riga di spiegazione sotto l'opzione (0.52.5). Le domande di Claude Code
   * (AskUserQuestion) ne hanno una per opzione.
   */
  descrizione?: string
  /**
   * L'opzione «Type something.» di Claude Code (0.52.5): ci si arriva con le
   * frecce e si **scrive** la risposta, poi Invio. Toccarla senza testo non
   * risponde niente.
   */
  libera?: boolean
  /** In una scelta multipla: la casella è spuntata. */
  spuntata?: boolean
  /** In una scelta multipla: la riga «Submit», che manda le caselle spuntate. */
  invio?: boolean
}

export type Scelta = {
  /** Le fermate del cursore, dall'alto: le opzioni e, in una scelta multipla, «Submit». */
  opzioni: Opzione[]
  /** Su quale fermata è il cursore: serve per contare le frecce. */
  corrente: number
  /** Una scelta multipla (caselle): Invio spunta, «Submit» manda (0.52.5). */
  multipla?: boolean
}

/** Le sequenze con cui il terminale colora e sposta: qui sono solo rumore. */
function senzaColori(grezzo: string): string {
  return grezzo
    .replace(/\u001b\[[0-9;?]*[a-zA-Z]/g, '')
    .replace(/\u001b\][^\u0007\u001b]*(\u0007|\u001b\\)/g, '')
    .replace(/\u001b[()][A-Za-z0-9]/g, '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
}

/** Il bordo del riquadro non fa parte della risposta. */
function nuda(riga: string): string {
  return riga
    .replace(/^[\s\u2502\u2503\u250a\u250b|]+/, '')
    .replace(/[\s\u2502\u2503\u250a\u250b|]+$/, '')
}

/** Quanti spazi prima del testo, tolto un eventuale bordo di riquadro. */
function rientro(riga: string): number {
  const senzaBordo = riga.replace(/^[\u2502\u2503\u250a\u250b|]/, '')
  return senzaBordo.length - senzaBordo.replace(/^\s+/, '').length
}

/** Il cursore, in tutte le forme con cui i vari elenchi lo disegnano. */
const CURSORE = /^[\u276f>\u25b6\u2023\u2192*]\s+/

/**
 * Il video inverso, l'altro modo di dire «sei qui».
 *
 * Un elenco su tre non disegna nessun glifo davanti alla riga corrente: la gira
 * e basta. Il 7 puo' stare da solo (`ESC[7m`) o in mezzo ad altri attributi
 * (`ESC[1;7;36m`), e va cercato come **numero intero**: dentro `ESC[17m` c'e' un
 * 7 che non vuol dire niente.
 */
function inVideoInverso(riga: string): boolean {
  for (const m of riga.matchAll(/\u001b\[([0-9;]*)m/g)) {
    if ((m[1] ?? '').split(';').includes('7')) return true
  }
  return false
}

const NUMERATA = /^(\d{1,2})[.)]\s+(\S.*)$/
/** La casella di una scelta multipla di Claude Code: «[ ] Lunedi», «[✔] Martedi». */
const CASELLA = /^\[([ x\u2714\u2713\u2715\u25a0X])\]\s*(.*)$/
/** Una riga di sola cornice, come quella che separa «Type something.» da «Chat about this». */
const SEPARATORE = /^[\u2500\u2501\u2550\u254c\u254d\u2504\u2508-]{10,}$/
/** La riga di spiegazione sotto un'opzione è più rientrata dell'opzione. */
const RIENTRO_SPIEGAZIONE = 4
/** Quante righe (vuote, spiegazioni, cornici) possono stare fra due opzioni. */
const RIGHE_FRA_OPZIONI = 8
const SCRIVI_QUALCOSA = /^type something\.?$/i
const PARLANE = /^chat about this$/i

type Riga = { nuda: string; rientro: number; cursore: boolean }

/**
 * Le scelte in fondo allo schermo, se ce ne sono.
 *
 * Servono almeno due opzioni numerate da 1 in poi, consecutive, e il cursore
 * su una di loro: una riga sola non è una scelta, numeri sparsi o senza
 * cursore sono un elenco dentro una risposta scritta, non qualcosa che aspetta
 * un tasto.
 *
 * Fra un'opzione e l'altra possono stare (0.52.5) righe vuote, la riga di
 * spiegazione dell'opzione (più rientrata), una cornice, e la riga «Submit»
 * di una scelta multipla. È com'è fatta una domanda di Claude Code
 * (AskUserQuestion) dalla 2.1: fino alla 0.52.4 le opzioni dovevano essere
 * attaccate, e quelle domande non si riconoscevano mai. Dal telefono, dalla
 * pagina e dalla colonna Domande restava solo il campo di testo, e il testo
 * scritto lì finiva nel selettore: Invio sceglieva la prima opzione.
 */
export function scelteDiTerminale(schermo: string): Scelta | undefined {
  // Le righe si guardano due volte: pulite per leggerle, com'erano per capire
  // quale e' evidenziata. Non tutti gli elenchi disegnano un glifo davanti alla
  // riga corrente — parecchi la girano in video inverso, e li' il testo e'
  // identico a quello delle altre.
  const grezze = schermo.split(/\r?\n/)
  const righe: Riga[] = grezze.map((g) => {
    const pulita = senzaColori(g)
    const n = nuda(pulita)
    const cursore = CURSORE.test(n) || inVideoInverso(g)
    return { nuda: CURSORE.test(n) ? n.replace(CURSORE, '') : n, rientro: rientro(pulita), cursore }
  })
  const numerata = (r: Riga | undefined): RegExpExecArray | null => r === undefined || r.rientro >= RIENTRO_SPIEGAZIONE ? null : NUMERATA.exec(r.nuda)

  // Dal fondo: l'ultimo blocco è quello vivo.
  for (let i = righe.length - 1; i >= 0; i -= 1) {
    if (numerata(righe[i]) === null) continue
    const blocco = bloccoDa(righe, i, numerata)
    if (blocco !== undefined) return blocco
    // Non era un elenco di scelte: si riprende da sopra il blocco provato.
  }
  return undefined
}

type Grezza = Opzione & { separatoPrima: boolean; invioDopo?: { scelta: boolean } }

function bloccoDa(righe: Riga[], fondo: number, numerata: (r: Riga | undefined) => RegExpExecArray | null): Scelta | undefined {
  const raccolte: Grezza[] = []
  // Le righe viste salendo dopo l'ultima opzione trovata: sono la spiegazione
  // dell'opzione che sta sopra (e le cornici e il «Submit» che le separano).
  let fra: Riga[] = []
  // La spiegazione dell'ultima opzione sta sotto di lei.
  const sottoUltima: string[] = []
  for (let k = fondo + 1; k < righe.length; k += 1) {
    const r = righe[k] as Riga
    if (r.nuda === '' || r.rientro < RIENTRO_SPIEGAZIONE) break
    sottoUltima.push(r.nuda)
  }
  for (let j = fondo; j >= 0; j -= 1) {
    const r = righe[j] as Riga
    const m = numerata(r)
    if (m !== null) {
      const sotto = raccolte[0]
      const separato = fra.some((x) => SEPARATORE.test(x.nuda))
      if (sotto !== undefined) sotto.separatoPrima = separato
      const invio = fra.find((x) => x.nuda === 'Submit')
      const spiegazione = (raccolte.length === 0 ? sottoUltima : fra.filter((x) => x !== invio && x.nuda !== '' && !SEPARATORE.test(x.nuda) && x.rientro >= RIENTRO_SPIEGAZIONE).reverse().map((x) => x.nuda))
      let testo = (m[2] ?? '').trim()
      let spuntata: boolean | undefined
      const c = CASELLA.exec(testo)
      if (c !== null) { spuntata = (c[1] ?? ' ') !== ' '; testo = (c[2] ?? '').trim() }
      raccolte.unshift({
        numero: Number(m[1]), testo, scelta: r.cursore, separatoPrima: false,
        ...(spiegazione.length > 0 ? { descrizione: spiegazione.join(' ') } : {}),
        ...(spuntata !== undefined ? { spuntata } : {}),
        ...(invio !== undefined ? { invioDopo: { scelta: invio.cursore } } : {})
      })
      fra = []
      continue
    }
    const tra = r.nuda === '' || SEPARATORE.test(r.nuda) || r.rientro >= RIENTRO_SPIEGAZIONE || r.nuda === 'Submit'
    if (!tra || raccolte.length === 0) break
    fra.push(r)
    if (fra.length > RIGHE_FRA_OPZIONI) break
  }
  if (raccolte.length < 2 || !raccolte.every((o, k) => o.numero === k + 1)) return undefined
  const multipla = raccolte.some((o) => o.spuntata !== undefined)
  // «Type something.» (o il testo che ci si è già scritto): l'opzione subito
  // sopra la cornice che la separa da «Chat about this».
  const ultima = raccolte[raccolte.length - 1]
  const conParlane = ultima !== undefined && PARLANE.test(ultima.testo) && ultima.separatoPrima
  const opzioni: Opzione[] = []
  raccolte.forEach((o, k) => {
    const libera = SCRIVI_QUALCOSA.test(o.testo) || (conParlane && k === raccolte.length - 2)
    const { separatoPrima: _s, invioDopo, ...pulita } = o
    opzioni.push({ ...pulita, ...(libera ? { libera: true } : {}) })
    if (multipla && invioDopo !== undefined) opzioni.push({ numero: 0, testo: 'Submit', scelta: invioDopo.scelta, invio: true })
  })
  const corrente = opzioni.findIndex((o) => o.scelta)
  // Una riga deve essere quella corrente: un elenco che aspetta un tasto ha
  // sempre il cursore (o il video inverso) su una voce. Un elenco senza e'
  // una risposta scritta - «1. fai questo, 2. poi quello» - e mostrarla come
  // scelta metteva sul telefono pulsanti che mandavano frecce e invio nel
  // campo di testo: freccia su richiama l'ultimo messaggio, e l'invio lo
  // rimanda.
  if (corrente < 0) return undefined
  return { opzioni, corrente, ...(multipla ? { multipla: true } : {}) }
}

/** Su o giù, tante volte quante servono per arrivare all'opzione voluta. */
export const GIU = '\u001b[B'
export const SU = '\u001b[A'

/**
 * I tasti da premere per scegliere la riga `voluta` partendo da `corrente`.
 *
 * L'invio non è qui dentro: chi manda questa sequenza lo aggiunge dopo una
 * pausa, come farebbe un dito. Frecce e invio nello stesso blocco sono un
 * incollato, e un elenco che riceve un incollato spesso non lo legge come
 * tasti premuti.
 */
export function tastiPerScegliere(corrente: number, voluta: number): string {
  const passi = voluta - corrente
  return (passi >= 0 ? GIU : SU).repeat(Math.abs(passi))
}

/** L'invio, come tasto a sé. */
export const INVIO = '\r'

/** Cosa ha deciso chi risponde: un'opzione toccata, o una risposta scritta. */
export type Risposta = { tipo: 'opzione'; testo: string } | { tipo: 'libera'; testo: string }

/**
 * I tasti per una risposta (0.52.5), a **pezzi**: chi li manda li scrive uno
 * alla volta con una pausa in mezzo, come un dito. Le frecce tutte insieme
 * vanno bene (provato con Claude Code 2.1.293); il testo e l'invio no, devono
 * arrivare dopo.
 *
 * - un'opzione: frecce fino a lei, Invio. In una scelta multipla Invio spunta
 *   o toglie la casella; «Submit» manda.
 * - una risposta scritta: frecce fino a «Type something.», il testo, Invio. In
 *   una scelta multipla niente Invio (spunterebbe di nuovo): poi «Submit».
 * - «Type something.» toccata senza testo: non si manda niente, si dice di
 *   scriverla. Prima un Invio lì non rispondeva niente.
 *
 * Mai il numero dell'opzione: in Claude Code è anche una scorciatoia che
 * risponde **subito**, e l'Invio che segue finirebbe nella domanda dopo.
 */
export function tastiPerRisposta(s: Scelta, r: Risposta): { pezzi: string[] } | { errore: string } {
  if (r.tipo === 'opzione') {
    const dove = s.opzioni.findIndex((o) => o.testo === r.testo)
    if (dove < 0) return { errore: 'la scelta e cambiata: guarda di nuovo' }
    if (s.opzioni[dove]?.libera === true) {
      return { errore: 'Per rispondere con parole tue scrivi la risposta nel campo di testo e mandala: arriva a Claude come risposta libera («Type something»).' }
    }
    return { pezzi: [tastiPerScegliere(s.corrente, dove), INVIO].filter((x) => x !== '') }
  }
  const dove = s.opzioni.findIndex((o) => o.libera === true)
  if (dove < 0) return { errore: `Questa domanda non accetta una risposta scritta: scegli una delle opzioni (${elencoOpzioni(s)}).` }
  const testo = r.testo.replace(/[\r\n\t]+/g, ' ').trim().slice(0, 2000)
  if (testo === '') return { errore: 'La risposta scritta è vuota.' }
  return { pezzi: [tastiPerScegliere(s.corrente, dove), testo, ...(s.multipla === true ? [] : [INVIO])].filter((x) => x !== '') }
}

/** Le opzioni in una riga, per dirle a chi ha scritto qualcosa che non si capisce. */
export function elencoOpzioni(s: Scelta): string {
  return s.opzioni.filter((o) => o.libera !== true).map((o) => o.invio === true ? 'Submit' : `${o.numero}. ${o.testo}`).join(', ')
}

const SI = new Set(['si', 'sì', 'ok', 'yes', 'y', 's', 'va bene', 'certo', 'procedi'])
const NO = new Set(['no', 'n'])

function norma(t: string): string {
  return t.trim().toLowerCase().replace(/[.!]+$/, '').replace(/\s+/g, ' ')
}

/**
 * Un testo scritto mentre la chat aspetta una scelta (0.52.5): cosa vuol dire.
 *
 * Il difetto vero (provato con Claude Code 2.1.293): la domanda non si
 * riconosceva, dal telefono e dalla colonna restava solo il campo di testo, e
 * «Verde» + Invio finiva nel selettore, che con Invio sceglieva **la prima
 * opzione**: Claude riceveva «Rosso». Ora un testo che arriva a una chat ferma
 * su una scelta si legge così:
 * - il testo di un'opzione (senza badare a maiuscole e punto finale) o il suo
 *   numero → quell'opzione;
 * - «sì / ok / yes» e «no» → l'opzione «Yes» / «No» di un permesso;
 * - «invia» / «submit» in una scelta multipla → «Submit»;
 * - altrimenti, se la domanda ha «Type something.», è la risposta libera;
 * - altrimenti non si scrive niente e si dice quali sono le opzioni.
 */
export function rispostaDaTesto(s: Scelta, testo: string): Risposta | { errore: string } {
  const t = norma(testo)
  const vere = s.opzioni.filter((o) => o.libera !== true && o.invio !== true)
  const uguale = vere.find((o) => norma(o.testo) === t)
  if (uguale !== undefined) return { tipo: 'opzione', testo: uguale.testo }
  if (/^\d{1,2}$/.test(t)) {
    const n = vere.find((o) => o.numero === Number(t))
    if (n !== undefined) return { tipo: 'opzione', testo: n.testo }
  }
  const si = vere.filter((o) => norma(o.testo) === 'yes')
  const no = vere.filter((o) => norma(o.testo) === 'no')
  if (SI.has(t) && si.length === 1) return { tipo: 'opzione', testo: (si[0] as Opzione).testo }
  if (NO.has(t) && no.length === 1) return { tipo: 'opzione', testo: (no[0] as Opzione).testo }
  const invio = s.opzioni.find((o) => o.invio === true)
  if (invio !== undefined && (t === 'invia' || t === 'submit' || t === 'manda')) return { tipo: 'opzione', testo: invio.testo }
  if (s.opzioni.some((o) => o.libera === true)) return { tipo: 'libera', testo }
  return { errore: `La chat aspetta che tu scelga fra: ${elencoOpzioni(s)}. Tocca un'opzione, oppure scrivi il suo numero o il suo testo.` }
}

/**
 * La stessa domanda (0.52.5 anche le caselle): le stesse opzioni nello stesso
 * ordine, con le stesse spunte. Il cursore no: si muove prima dell'invio. In
 * una scelta multipla ogni tocco cambia una spunta, quindi è una domanda
 * «nuova» e non si nasconde come già risposta.
 */
export function firmaScelte(s: { opzioni: { testo: string; spuntata?: boolean }[] }): string {
  return s.opzioni.map((o) => (o.spuntata === true ? '[x] ' : '') + o.testo).join(String.fromCharCode(10))
}
