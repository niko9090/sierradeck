/**
 * Il flusso di un terminale, con i suoi colori, dentro una pagina.
 *
 * Dal telefono si vedevano le righe ripulite: il testo giusto, senza niente di
 * quello che al computer permette di capire a colpo d'occhio com'è andata — il
 * verde di un test passato, il rosso di uno fallito, il grigio di ciò che è
 * già stato. Togliere i colori era la scelta comoda: le sequenze di controllo
 * mostrate come sono riempiono lo schermo di parentesi quadre. Interpretarle è
 * poco più lavoro, e restituisce il terminale com'è davvero.
 *
 * **Vive qui, in una funzione sola e senza dipendenze**, perché la pagina del
 * Client è una stringa: la funzione le viene incollata dentro con `toString()`,
 * e quello che va nel telefono è esattamente ciò che i test hanno verificato.
 */

/**
 * Converte in HTML un pezzo di flusso ANSI.
 *
 * Legge le sole sequenze SGR — quelle che dicono «da qui in poi scrivi così» —
 * e butta via tutte le altre: spostamenti del cursore e cancellazioni servono a
 * chi ridisegna uno schermo, e qui lo schermo è un elenco di righe che scorre.
 *
 * Il testo viene sempre reso innocuo prima di entrare: quello che arriva è
 * l'uscita di un programma qualunque, e un `<script>` scritto da lui non deve
 * poter diventare un `<script>` nella pagina.
 */
export function ansiInHtml(grezzo: string): string {
  const COLORI = [
    '#2b2f33', '#dc5f5f', '#54c07a', '#e0a33c', '#5b9bd5', '#b48ead', '#4db6ac', '#c8ced4',
    '#5a6169', '#e87d7d', '#7fd3a0', '#f0bc63', '#7fb8e8', '#cba6c3', '#6fd0c6', '#eef2f6'
  ]
  const esc = (t: string): string =>
    t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

  let colore = ''
  let sfondo = ''
  let grassetto = false
  let tenue = false
  let corsivo = false
  let sottolineato = false
  let inverso = false
  let aperti = 0
  // 0.92.0: i colori a 24 bit (`38;2;r;g;b`) che Claude Code usa per tutto.
  // Prima si perdevano e il «2» del modo diventava «tenue»: ogni riga sbiadita,
  // il logo arancione e la barra grigia del prompt spariti.
  const hex = (r: number, g: number, b: number): string =>
    '#' + [r, g, b].map((x) => Math.max(0, Math.min(255, x)).toString(16).padStart(2, '0')).join('')
  // La tavolozza a 256 com'è davvero: i sedici di sopra, il cubo 6×6×6, i grigi.
  const tavolozza = (i: number): string => {
    if (i < 16) return COLORI[i]!
    if (i < 232) {
      const LIV = [0, 95, 135, 175, 215, 255]
      const c = i - 16
      return hex(LIV[Math.floor(c / 36)]!, LIV[Math.floor(c / 6) % 6]!, LIV[c % 6]!)
    }
    const g = 8 + (i - 232) * 10
    return hex(g, g, g)
  }
  let fuori = ''

  const stile = (): string => {
    const parti: string[] = []
    const testo = inverso ? (sfondo !== '' ? sfondo : 'var(--sfondo-terminale, #1e1e1e)') : colore
    const dietro = inverso ? (colore !== '' ? colore : 'var(--testo-terminale, #dddddd)') : sfondo
    if (testo !== '') parti.push(`color:${testo}`)
    if (dietro !== '') parti.push(`background:${dietro}`)
    if (grassetto) parti.push('font-weight:600')
    if (tenue) parti.push('opacity:.65')
    if (corsivo) parti.push('font-style:italic')
    if (sottolineato) parti.push('text-decoration:underline')
    return parti.join(';')
  }

  const apri = (): void => {
    const s = stile()
    if (s === '') return
    fuori += `<span style="${s}">`
    aperti += 1
  }
  const chiudi = (): void => {
    while (aperti > 0) { fuori += '</span>'; aperti -= 1 }
  }

  // Ogni sequenza di controllo, e il testo che sta prima.
  const parti = grezzo.split(/\[/)
  fuori += esc(parti[0] ?? '')
  for (let i = 1; i < parti.length; i += 1) {
    const pezzo = parti[i] ?? ''
    const fine = /[a-zA-Z]/.exec(pezzo)
    if (fine === null) { fuori += esc(pezzo); continue }
    const comando = pezzo[fine.index]
    const codici = pezzo.slice(0, fine.index)
    const resto = pezzo.slice(fine.index + 1)

    // Solo il vestito: `m`. Tutto il resto — cursore, cancellazioni — riguarda
    // uno schermo da ridisegnare, che qui non c'è.
    if (comando === 'm') {
      chiudi()
      const numeri = codici === '' ? [0] : codici.split(';').map((n) => Number.parseInt(n, 10) || 0)
      for (let k = 0; k < numeri.length; k += 1) {
        const n = numeri[k]!
        if (n === 0) { colore = ''; sfondo = ''; grassetto = false; tenue = false; corsivo = false; sottolineato = false; inverso = false }
        else if (n === 1) grassetto = true
        else if (n === 2) tenue = true
        else if (n === 3) corsivo = true
        else if (n === 4) sottolineato = true
        else if (n === 7) inverso = true
        else if (n === 22) { grassetto = false; tenue = false }
        else if (n === 23) corsivo = false
        else if (n === 24) sottolineato = false
        else if (n === 27) inverso = false
        else if (n === 39) colore = ''
        else if (n === 49) sfondo = ''
        else if (n >= 30 && n <= 37) colore = COLORI[n - 30]!
        else if (n >= 90 && n <= 97) colore = COLORI[n - 90 + 8]!
        else if (n >= 40 && n <= 47) sfondo = COLORI[n - 40]!
        else if (n >= 100 && n <= 107) sfondo = COLORI[n - 100 + 8]!
        else if ((n === 38 || n === 48) && numeri[k + 1] === 5) {
          const scelto = tavolozza(numeri[k + 2] ?? 0)
          if (n === 38) colore = scelto
          else sfondo = scelto
          k += 2
        } else if ((n === 38 || n === 48) && numeri[k + 1] === 2) {
          const scelto = hex(numeri[k + 2] ?? 0, numeri[k + 3] ?? 0, numeri[k + 4] ?? 0)
          if (n === 38) colore = scelto
          else sfondo = scelto
          k += 4
        }
      }
      apri()
    }
    fuori += esc(resto)
  }
  chiudi()
  return fuori
}
