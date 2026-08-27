/**
 * Lo schermo di un terminale, letto com'è **disegnato**.
 *
 * Il flusso che esce da un pty non è un testo: è una sequenza di istruzioni per
 * dipingere uno schermo. Claude Code, come ogni interfaccia a tutto schermo,
 * torna indietro con il carrello, cancella una riga e la riscrive, sposta il
 * cursore due righe più su e ridisegna la cornice. Spezzare quel flusso agli «a
 * capo» e incollarne i pezzi in fila produce **esattamente** ciò che si vedeva
 * dal telefono: le riscritture diventano righe nuove invece di sostituire le
 * vecchie, e un ritorno a capo senza a capo (`\r` da solo) incolla il testo
 * vecchio e quello nuovo sulla stessa riga. Le scritte mischiate erano quello.
 *
 * Un emulatore di terminale quel lavoro lo fa già, e ne abbiamo uno vero
 * davanti agli occhi: `xterm.js`, quello che disegna il riquadro sul computer.
 * Invece di reinterpretare il flusso una seconda volta si legge il
 * **risultato**: la griglia di celle che l'utente sta guardando. Il telefono
 * vede così la stessa cosa che vede il computer, e non esiste una seconda
 * implementazione che possa divergere dalla prima.
 *
 * Qui dentro `xterm` non si importa: si descrivono soltanto le poche cose che
 * servono di una cella e di una riga. Così questo modulo si prova con una
 * griglia finta, senza un DOM e senza un terminale vero.
 */

/** Il carattere che apre ogni sequenza di controllo. */
const ESC = String.fromCharCode(27)

/** Una cella dello schermo: un carattere e come è vestito. */
export type Cella = {
  getChars: () => string
  getWidth: () => number
  isFgDefault: () => boolean
  isFgPalette: () => boolean
  isFgRGB: () => boolean
  getFgColor: () => number
  isBgDefault: () => boolean
  isBgPalette: () => boolean
  isBgRGB: () => boolean
  getBgColor: () => number
  isBold: () => number
  isDim: () => number
  isItalic: () => number
  isUnderline: () => number
  isInverse: () => number
  isStrikethrough: () => number
}

export type RigaSchermo = {
  readonly length: number
  getCell: (x: number) => Cella | undefined
}

export type Schermo = {
  /** Quante righe ha in tutto, cronologia compresa. */
  readonly length: number
  /** La prima riga di quelle che si vedono adesso. */
  readonly baseY: number
  getLine: (y: number) => RigaSchermo | undefined
}

/** I vestiti di una cella, ridotti a ciò che la distingue dalla vicina. */
type Vestito = {
  fg: string
  bg: string
  bold: boolean
  dim: boolean
  italic: boolean
  underline: boolean
  inverse: boolean
  strike: boolean
}

function coloreDi(cella: Cella, quale: 'fg' | 'bg'): string {
  const predefinito = quale === 'fg' ? cella.isFgDefault() : cella.isBgDefault()
  if (predefinito) return ''
  const tavolozza = quale === 'fg' ? cella.isFgPalette() : cella.isBgPalette()
  const pieno = quale === 'fg' ? cella.isFgRGB() : cella.isBgRGB()
  const n = quale === 'fg' ? cella.getFgColor() : cella.getBgColor()
  const base = quale === 'fg' ? '38' : '48'
  if (tavolozza) return `${base};5;${n}`
  // Il colore pieno sta impacchettato in un intero: tre byte, uno per canale.
  if (pieno) return `${base};2;${(n >> 16) & 255};${(n >> 8) & 255};${n & 255}`
  return ''
}

function vestitoDi(cella: Cella): Vestito {
  return {
    fg: coloreDi(cella, 'fg'),
    bg: coloreDi(cella, 'bg'),
    bold: cella.isBold() !== 0,
    dim: cella.isDim() !== 0,
    italic: cella.isItalic() !== 0,
    underline: cella.isUnderline() !== 0,
    inverse: cella.isInverse() !== 0,
    strike: cella.isStrikethrough() !== 0
  }
}

function ugualiVestiti(a: Vestito, b: Vestito): boolean {
  return (
    a.fg === b.fg &&
    a.bg === b.bg &&
    a.bold === b.bold &&
    a.dim === b.dim &&
    a.italic === b.italic &&
    a.underline === b.underline &&
    a.inverse === b.inverse &&
    a.strike === b.strike
  )
}

/**
 * La sequenza che veste il testo che segue.
 *
 * Si riparte sempre da zero invece di scrivere solo la differenza rispetto alla
 * cella precedente: costa qualche byte in più su una manciata di righe, e in
 * cambio ogni pezzo di riga è leggibile **da solo**. Chi riceve non deve aver
 * visto tutto quello che è venuto prima per sapere di che colore è.
 */
function sequenzaDi(v: Vestito): string {
  const pezzi: string[] = ['0']
  if (v.bold) pezzi.push('1')
  if (v.dim) pezzi.push('2')
  if (v.italic) pezzi.push('3')
  if (v.underline) pezzi.push('4')
  if (v.inverse) pezzi.push('7')
  if (v.strike) pezzi.push('9')
  if (v.fg !== '') pezzi.push(v.fg)
  if (v.bg !== '') pezzi.push(v.bg)
  return `${ESC}[${pezzi.join(';')}m`
}

/** Il testo di una riga, nudo. */
export function testoDiRiga(riga: RigaSchermo): string {
  let testo = ''
  for (let x = 0; x < riga.length; x += 1) {
    const cella = riga.getCell(x)
    if (cella === undefined) continue
    // Le celle di larghezza zero sono la seconda metà di un carattere largo:
    // il carattere l'ha già scritto la prima, e ripeterlo lo sdoppierebbe.
    if (cella.getWidth() === 0) continue
    const c = cella.getChars()
    testo += c === '' ? ' ' : c
  }
  return testo.replace(/\s+$/, '')
}

/** La stessa riga, vestita come la si vede sullo schermo. */
export function rigaVestita(riga: RigaSchermo): string {
  const nuda = testoDiRiga(riga)
  if (nuda === '') return ''
  let fuori = ''
  let corrente: Vestito | undefined
  let scritti = 0
  for (let x = 0; x < riga.length && scritti < nuda.length; x += 1) {
    const cella = riga.getCell(x)
    if (cella === undefined) continue
    if (cella.getWidth() === 0) continue
    const c = cella.getChars()
    const testo = c === '' ? ' ' : c
    const vestito = vestitoDi(cella)
    if (corrente === undefined || !ugualiVestiti(corrente, vestito)) {
      fuori += sequenzaDi(vestito)
      corrente = vestito
    }
    fuori += testo
    scritti += testo.length
  }
  return `${fuori}${ESC}[0m`
}

/**
 * Le ultime righe che si vedono, nude e vestite.
 *
 * Si guarda **ciò che è a schermo adesso** (da `baseY` in giù), non la
 * cronologia: è la fotografia di quello che sta davanti a chi è al computer.
 * Le righe vuote in fondo si buttano — sono lo spazio sotto l'interfaccia, e da
 * un telefono sarebbero mezzo schermo di niente — mentre quelle in mezzo
 * restano, perché lì il vuoto è composizione, e toglierlo appiccica fra loro
 * cose che sullo schermo sono separate.
 */
export function righeDaSchermo(
  schermo: Schermo,
  altezza: number,
  quante: number
): { pulite: string[]; grezze: string[] } {
  const fine = Math.min(schermo.baseY + altezza, schermo.length)
  const nude: string[] = []
  const vestite: string[] = []
  for (let y = schermo.baseY; y < fine; y += 1) {
    const riga = schermo.getLine(y)
    if (riga === undefined) continue
    nude.push(testoDiRiga(riga))
    vestite.push(rigaVestita(riga))
  }
  while (nude.length > 0 && (nude[nude.length - 1] ?? '') === '') {
    nude.pop()
    vestite.pop()
  }
  return { pulite: nude.slice(-quante), grezze: vestite.slice(-quante) }
}

/**
 * Chi sta disegnando quale terminale.
 *
 * Il riquadro ha il suo `xterm`, e chi prepara ciò che va al telefono sta da
 * un'altra parte: questo è il filo fra i due. Un terminale che se ne va si
 * toglie da qui, altrimenti si continuerebbe a leggere lo schermo di una chat
 * chiusa.
 */
const schermi = new Map<string, { schermo: () => Schermo; altezza: () => number }>()

export function registraSchermo(
  ptyId: string,
  schermo: () => Schermo,
  altezza: () => number
): void {
  schermi.set(ptyId, { schermo, altezza })
}

export function dimenticaSchermo(ptyId: string): void {
  schermi.delete(ptyId)
}

/**
 * Le ultime righe di quel terminale, lette dallo schermo disegnato.
 *
 * Assente vuol dire che quel terminale non ha (o non ha più) un riquadro che lo
 * disegna: chi chiama torna al modo di prima invece di mostrare il vuoto.
 */
export function righeDiPty(
  ptyId: string,
  quante: number
): { pulite: string[]; grezze: string[] } | undefined {
  const voce = schermi.get(ptyId)
  if (voce === undefined) return undefined
  try {
    return righeDaSchermo(voce.schermo(), voce.altezza(), quante)
  } catch {
    // Un terminale smontato a metà lettura non deve far cadere l'annuncio di
    // tutte le altre chat.
    return undefined
  }
}
