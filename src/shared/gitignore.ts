/**
 * Un lettore di `.gitignore`, quanto basta per non portare sul Drive quello
 * che un progetto stesso dice di non tenere.
 *
 * Non e' git: e' la parte delle sue regole che si incontra davvero in un
 * `.gitignore` — nomi, `*`, `?`, `**`, il `/` in testa che ancora, il `/` in
 * coda che vuol dire «solo cartelle», il `!` che riammette. Ogni regola e'
 * un'espressione regolare sul percorso relativo con `/`, e vince l'**ultima**
 * che combacia, come in git.
 *
 * Perche' scriverlo invece di prendere una libreria: le dipendenze di
 * produzione sono sei e ognuna e' un impegno (vedi `ssh2` e i suoi pezzi
 * nell'asar); per trenta righe provate non vale la pena aggiungerne una.
 */
export type Regola = {
  /** Riammette invece di escludere (`!pattern`). */
  negata: boolean
  /** Vale solo per le cartelle (`pattern/`). */
  soloCartelle: boolean
  /** Combacia dall'inizio del percorso (c'era un `/` nel pattern), non a qualunque livello. */
  ancorata: boolean
  re: RegExp
}

function daGlobARegex(pattern: string): string {
  let out = ''
  for (let i = 0; i < pattern.length; i += 1) {
    const c = pattern[i] as string
    if (c === '*') {
      if (pattern[i + 1] === '*') {
        // `**/` = zero o piu' cartelle; `/**` in coda = tutto sotto; `**` da solo = tutto.
        if (pattern[i + 2] === '/') { out += '(?:.*/)?'; i += 2 }
        else { out += '.*'; i += 1 }
      } else {
        out += '[^/]*'
      }
    } else if (c === '?') {
      out += '[^/]'
    } else if (c === '[') {
      const chiusa = pattern.indexOf(']', i + 1)
      if (chiusa === -1) { out += '\\[' } else {
        let dentro = pattern.slice(i + 1, chiusa)
        if (dentro.startsWith('!')) dentro = `^${dentro.slice(1)}`
        out += `[${dentro.replace(/\\/g, '\\\\')}]`
        i = chiusa
      }
    } else if (c === '\\' && i + 1 < pattern.length) {
      out += `\\${pattern[i + 1]}`
      i += 1
    } else {
      out += /[.+^${}()|]/.test(c) ? `\\${c}` : c
    }
  }
  return out
}

/** Compila il testo di un `.gitignore` nelle sue regole, nell'ordine. */
export function compilaRegole(testo: string): Regola[] {
  const regole: Regola[] = []
  for (const grezza of testo.split(/\r?\n/)) {
    let riga = grezza.replace(/(?<!\\)\s+$/, '')
    if (riga === '' || riga.startsWith('#')) continue
    let negata = false
    if (riga.startsWith('!')) { negata = true; riga = riga.slice(1) }
    else if (riga.startsWith('\\!') || riga.startsWith('\\#')) riga = riga.slice(1)
    let soloCartelle = false
    if (riga.endsWith('/')) { soloCartelle = true; riga = riga.slice(0, -1) }
    // Un `/` in testa o in mezzo ancora il pattern alla cartella del file.
    let ancorata = riga.includes('/')
    if (riga.startsWith('/')) { riga = riga.slice(1); ancorata = true }
    // `**/x` non e' ancorato: combacia a qualunque livello.
    if (riga.startsWith('**/')) ancorata = false
    if (riga === '') continue
    const corpo = daGlobARegex(riga)
    const re = new RegExp(ancorata ? `^${corpo}(?:/.*)?$` : `^(?:.*/)?${corpo}(?:/.*)?$`)
    regole.push({ negata, soloCartelle, ancorata, re })
  }
  return regole
}

/**
 * Se `rel` (relativo alla cartella del `.gitignore`, con `/`) e' ignorato.
 *
 * `undefined` quando nessuna regola lo nomina: chi ha piu' livelli di
 * `.gitignore` chiede dal piu' esterno al piu' interno e tiene l'ultima
 * risposta, che e' la piu' vicina al file.
 */
export function giudizio(regole: Regola[], rel: string, cartella: boolean): boolean | undefined {
  let esito: boolean | undefined
  for (const r of regole) {
    if (r.soloCartelle && !cartella) {
      // Una regola «solo cartelle» copre anche i file dentro quella cartella:
      // ma quelli non arrivano mai qui, perche' la cartella si pota prima.
      continue
    }
    if (r.re.test(rel)) esito = !r.negata
  }
  return esito
}
