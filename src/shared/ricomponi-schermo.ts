/**
 * Lo schermo di una chat ricomposto per la larghezza del telefono (0.52.6).
 *
 * Nicholas (08/10): «con certi PC nel cell si vede male la chat e l'autopilota,
 * come visualizzazione e tabulazione». La causa, provata con Claude Code
 * 2.1.294 vero a 80, 120 e 200 colonne:
 * - Claude Code **va a capo da solo** alla larghezza del terminale del PC, con
 *   a capo veri: una frase di un PC a 200 colonne arriva come righe da 200
 *   caratteri, e sul telefono ognuna andava a capo per conto suo, con un buco
 *   dove il PC aveva spezzato. Più larghe le colonne del PC, peggio.
 * - xterm segna come continuazione (`isWrapped`) solo le righe spezzate dal
 *   terminale stesso (il prompt incollato, una riga di stato lunga).
 * - Le tabelle e i riquadri, in «Adatta», andavano a capo e perdevano
 *   l'allineamento.
 *
 * Quindi, con le colonne del PC e `isWrapped` (PC 0.52.6):
 * 1. le righe che xterm segna come continuazione si attaccano alla precedente;
 * 2. due righe di testo si uniscono se la prima è stata spezzata da Claude per
 *    la larghezza: la parola che inizia la seconda non ci stava più
 *    (`lunghezza + 1 + prima parola > colonne`) e la seconda ha il rientro di
 *    continuazione. È il criterio esatto con cui Claude va a capo (misurato a
 *    80, 120 e 200 colonne);
 * 3. le righe «da terminale» (tabelle, riquadri, colonne allineate) restano
 *    come sono, in un blocco a griglia che scorre di lato.
 *
 * Un PC più vecchio non manda `colonne` né `continua`: nessuna riga si unisce
 * (com'era prima) e la griglia vale lo stesso. Non si rompe niente.
 *
 * Copie: la pagina servita (`ricomponiSchermo` in `client-pagina.ts`) e
 * `Ricomponi.kt`. I casi comuni: `tests/fixtures/schermi-larghezze/`.
 */

export type RigaRicomposta = {
  /** `testo`: va a capo sul telefono; `griglia`: monospazio, allineata, scorre di lato; `vuota`: uno spazio. */
  tipo: 'testo' | 'griglia' | 'vuota'
  /** La riga vestita (con i colori), già unita alle sue continuazioni. */
  vestita: string
  /** La stessa senza colori. */
  testo: string
}

/** Una riga che vale per il suo allineamento: tabelle, riquadri, colonne. */
export function daGriglia(testo: string): boolean {
  return ricomponiSchermo({ grezze: [testo] })[0]?.tipo === 'griglia'
}

/**
 * Tutto qui dentro, aiuti compresi: la pagina servita la riceve con
 * `toString()` (come `ansiInHtml`), quindi non deve dipendere da niente fuori.
 */
export function ricomponiSchermo(p: { grezze: string[]; continua?: boolean[]; colonne?: number }): RigaRicomposta[] {
  const ESC = String.fromCharCode(27)
  const COLORI = new RegExp(ESC + '[[][0-9;]*m', 'g')
  const COLORI_IN_TESTA = new RegExp('^((?:' + ESC + '[[][0-9;]*m)*) +')
  // Le cornici: grafica fatta con le lettere.
  const CORNICE = '─│┌┐└┘├┤┬┴┼╭╮╰╯━┃┏┓┗┛┣┫┳┻╋═║╔╗╚╝╠╣╦╩╬┄┈╌╍▏▕▁▔'
  // Gli incroci e gli angoli: una riga di sola cornice con questi è il bordo di una tabella.
  const INCROCI = '┌┐└┘├┤┬┴┼┏┓┗┛┣┫┳┻╋╔╗╚╝╠╣╦╩╬'
  // Dentro una riga, questi dicono «tabella» o «riquadro».
  const DENTRO_TABELLA = '│┃┌┐└┘├┤┬┴┼╭╮╰╯┏┓┗┛┣┫┳┻╋║╔╗╚╝╠╣╦╩╬'
  const soloCornice = (t: string): boolean => t.trim() !== '' && [...t].every((c) => c === ' ' || CORNICE.includes(c))
  const interno = (t: string): string => {
    let i = 0
    let f = t.length
    const via = (c: string): boolean => c === ' ' || CORNICE.includes(c)
    while (i < f && via(t[i] as string)) i += 1
    while (f > i && via(t[f - 1] as string)) f -= 1
    return t.slice(i, f)
  }
  const griglia = (t: string): boolean => {
    const dentro = interno(t)
    if (dentro === '') return false
    if ([...dentro].some((c) => DENTRO_TABELLA.includes(c))) return true
    // Colonne allineate con gli spazi: tre o più spazi in mezzo al testo.
    return / {3,}\S/.test(dentro)
  }
  const rientro = (t: string): number => t.length - t.trimStart().length
  // Dove comincia il testo vero di una riga che apre un messaggio («● », «⎿ », «- », «❯ »).
  const rientroCorpo = (t: string): number => {
    const m = /^(\s*)(?:[●⎿•\-*❯>]\s+)?/.exec(t)
    return m === null ? rientro(t) : (m[0] as string).length
  }
  const primaParola = (t: string): string => t.trimStart().split(' ')[0] ?? ''
  // Unisce B ad A: A, uno spazio, B senza il suo rientro (i colori restano).
  const unisci = (a: RigaRicomposta, b: { vestita: string; testo: string }): RigaRicomposta => ({
    tipo: a.tipo,
    vestita: a.vestita + ' ' + b.vestita.replace(COLORI_IN_TESTA, '$1'),
    testo: a.testo + ' ' + b.testo.trimStart()
  })

  // 1. Le continuazioni di xterm: sono la stessa riga.
  const logiche: { vestita: string; testo: string; lunghezze: number[] }[] = []
  p.grezze.forEach((g, i) => {
    const testo = g.replace(COLORI, '').replace(/\s+$/, '')
    const ultima = logiche[logiche.length - 1]
    // Una riga di sola cornice non si porta dietro la riga dopo: è xterm che
    // ha spezzato una linea larga quanto il terminale.
    if (p.continua !== undefined && p.continua[i] === true && ultima !== undefined && !soloCornice(ultima.testo)) {
      // Spezzata in mezzo a una parola: si attacca così com'è. Se la riga dopo
      // comincia con il rientro di Claude, basta uno spazio.
      if (/^\s/.test(testo)) {
        const u = unisci({ tipo: 'testo', vestita: ultima.vestita, testo: ultima.testo }, { vestita: g, testo })
        ultima.vestita = u.vestita
        ultima.testo = u.testo
      } else {
        ultima.vestita += g
        ultima.testo += testo
      }
      ultima.lunghezze.push(testo.length)
    } else logiche.push({ vestita: g, testo, lunghezze: [testo.length] })
  })
  const colonne = p.colonne !== undefined && p.colonne >= 20 ? p.colonne : undefined
  const fuori: RigaRicomposta[] = []
  // L'ultima riga di testo, com'era sul PC (per sapere se è stata spezzata).
  let ultimaFisica: string | undefined
  let corpo = 0
  for (const l of logiche) {
    const ultimo = fuori[fuori.length - 1]
    if (l.testo.trim() === '') {
      if (ultimo !== undefined && ultimo.tipo !== 'vuota') fuori.push({ tipo: 'vuota', vestita: '', testo: '' })
      ultimaFisica = undefined
      continue
    }
    // Il bordo di una tabella (con gli incroci) resta, nella griglia; una
    // linea che separa e basta se ne va.
    if (soloCornice(l.testo)) {
      if ([...l.testo].some((c) => INCROCI.includes(c))) fuori.push({ tipo: 'griglia', vestita: l.vestita, testo: l.testo })
      ultimaFisica = undefined
      continue
    }
    if (griglia(l.testo)) {
      fuori.push({ tipo: 'griglia', vestita: l.vestita, testo: l.testo })
      ultimaFisica = undefined
      continue
    }
    // 2. Spezzata da Claude per la larghezza del PC: la parola dopo non ci stava.
    if (
      colonne !== undefined && ultimo !== undefined && ultimo.tipo === 'testo' && ultimaFisica !== undefined &&
      l.lunghezze.length === 1 && rientro(l.testo) > 0 && rientro(l.testo) === corpo &&
      ultimaFisica.length <= colonne && ultimaFisica.length + 1 + primaParola(l.testo).length > colonne
    ) {
      fuori[fuori.length - 1] = unisci(ultimo, l)
      ultimaFisica = l.testo
      continue
    }
    fuori.push({ tipo: 'testo', vestita: l.vestita, testo: l.testo })
    // Per una riga già unita da xterm conta il suo ultimo pezzo.
    ultimaFisica = l.lunghezze.length === 1 ? l.testo : undefined
    corpo = rientroCorpo(l.testo)
  }
  while (fuori.length > 0 && fuori[fuori.length - 1]?.tipo === 'vuota') fuori.pop()
  return fuori
}
