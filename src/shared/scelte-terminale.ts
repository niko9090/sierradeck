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
  /** Il numero stampato, così com'è: serve a mostrarlo, non a premerlo. */
  numero: number
  testo: string
  /** Quella su cui è fermo il cursore adesso. */
  scelta: boolean
}

export type Scelta = {
  opzioni: Opzione[]
  /** Quante righe separano il cursore dalla prima: serve per contare le frecce. */
  corrente: number
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

/**
 * Le scelte in fondo allo schermo, se ce ne sono.
 *
 * Servono almeno due opzioni numerate da 1 in poi, consecutive e attaccate: una
 * riga sola non è una scelta, e numeri sparsi sono quasi sempre un elenco
 * dentro una risposta scritta — non qualcosa che aspetta un tasto.
 */
export function scelteDiTerminale(schermo: string): Scelta | undefined {
  // Le righe si guardano due volte: pulite per leggerle, com'erano per capire
  // quale e' evidenziata. Non tutti gli elenchi disegnano un glifo davanti alla
  // riga corrente — parecchi la girano in video inverso, e li' il testo e'
  // identico a quello delle altre.
  const grezze = schermo.split(/\r?\n/)
  const righe = grezze.map((r) => nuda(senzaColori(r)))
  const evidenziata = grezze.map(inVideoInverso)

  let opzioni: Opzione[] = []
  let corrente = 0

  // Dal fondo: l'ultimo blocco è quello vivo.
  let i = righe.length - 1
  while (i >= 0) {
    const raccolte: Opzione[] = []
    let j = i
    while (j >= 0) {
      const riga = righe[j] ?? ''
      const scelta = CURSORE.test(riga) || (evidenziata[j] ?? false)
      const corpo = scelta ? riga.replace(CURSORE, '') : riga
      const m = NUMERATA.exec(corpo)
      if (m === null) break
      raccolte.unshift({ numero: Number(m[1]), testo: (m[2] ?? '').trim(), scelta })
      j -= 1
    }
    if (raccolte.length >= 2 && numerazioneSana(raccolte)) {
      opzioni = raccolte
      corrente = Math.max(0, raccolte.findIndex((o) => o.scelta))
      break
    }
    i = j < i ? j : i - 1
  }

  if (opzioni.length === 0) return undefined
  return { opzioni, corrente }
}

/** Da 1 in su, uno alla volta: qualunque altra cosa non è un elenco di scelte. */
function numerazioneSana(opzioni: Opzione[]): boolean {
  return opzioni.every((o, k) => o.numero === k + 1)
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
