import { describe, it, expect } from 'vitest'
import { ansiInHtml } from '../../src/shared/ansi-html'

/** L'inizio di una sequenza di controllo, come esce da un terminale vero. */
const E = String.fromCharCode(27)

describe('ansiInHtml', () => {
  it('lascia passare il testo semplice', () => {
    expect(ansiInHtml('npm run build')).toBe('npm run build')
  })

  it('veste di verde quello che il terminale ha scritto in verde', () => {
    const html = ansiInHtml(`${E}[32m1249 test verdi${E}[0m`)
    expect(html).toContain('color:#54c07a')
    expect(html).toContain('1249 test verdi')
    expect(html).toContain('</span>')
  })

  it('chiude quello che apre, anche senza il congedo finale', () => {
    // Una riga puo' arrivare tagliata a meta': se il colore restasse aperto,
    // tutto quello che segue nel pannello ne prenderebbe il colore.
    const html = ansiInHtml(`${E}[31mrosso`)
    expect(html.match(/<span/g)?.length).toBe(html.match(/<\/span>/g)?.length)
  })

  it('rende innocuo quello che il programma ha scritto', () => {
    // Il flusso e' l'uscita di un programma qualunque: un tag scritto da lui
    // non deve diventare un tag nella pagina.
    const html = ansiInHtml('<script>alert(1)</script>')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('butta via cio che sposta il cursore, invece di stamparlo', () => {
    // Le sequenze che ridisegnano uno schermo non hanno senso in un elenco di
    // righe che scorre: mostrarle riempirebbe il telefono di parentesi quadre.
    const html = ansiInHtml(`${E}[2J${E}[Hpulito`)
    expect(html).toBe('pulito')
  })

  it('capisce il grassetto e il tenue', () => {
    expect(ansiInHtml(`${E}[1mforte${E}[0m`)).toContain('font-weight:600')
    expect(ansiInHtml(`${E}[2mquieto${E}[0m`)).toContain('opacity:.65')
  })

  it('legge anche la tavolozza a 256 colori', () => {
    const html = ansiInHtml(`${E}[38;5;2mverde${E}[0m`)
    expect(html).toContain('color:#54c07a')
    expect(html).toContain('verde')
  })

  it('lo sfondo e lo sfondo, non il testo', () => {
    const html = ansiInHtml(`${E}[41mallarme${E}[0m`)
    expect(html).toContain('background:#dc5f5f')
  })

  it('sopravvive a una sequenza tagliata a meta', () => {
    // I dati arrivano a pezzetti: una riga puo' finire dentro una sequenza.
    expect(() => ansiInHtml(`verde${E}[3`)).not.toThrow()
  })

  it('sta in piedi da sola, per poter vivere dentro la pagina del Client', () => {
    // La pagina e' una stringa e la funzione le viene incollata dentro con
    // toString(): se leggesse qualcosa da fuori, nel telefono non ci sarebbe.
    const codice = ansiInHtml.toString()
    expect(codice).not.toContain('ANSI_COLORI')
    expect(codice).not.toContain('import')
  })
})

describe('le parentesi quadre che non sono sequenze', () => {
  it('una riga di log con le quadre resta intera', () => {
    // «[autopilota] riprendo 1 preparazione» e' una riga normalissima: se la si
    // trattasse come una sequenza di controllo si mangerebbe meta' riga.
    expect(ansiInHtml('[autopilota] riprendo 1 preparazione'))
      .toBe('[autopilota] riprendo 1 preparazione')
  })

  it('e anche in mezzo a del colore', () => {
    const html = ansiInHtml(`${E}[36m[client] in ascolto${E}[0m`)
    expect(html).toContain('[client] in ascolto')
  })
})
