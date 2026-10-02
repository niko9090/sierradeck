import { describe, it, expect } from 'vitest'
import {
  analizzaMarkdown,
  analizzaRiga,
  daNoteAggiornamento,
  daRilasciGithub,
  linkAmmesso,
  markdownDaHtml,
  noteDaNovita,
  noteFra,
  raccogliNote,
  versioneDaTag,
  type Blocco
} from '@shared/note-aggiornamento'

/**
 * La finestra di «Installa» (0.39.0): le note di cosa cambia, della versione
 * nuova e di quelle saltate, dal Markdown delle release reso senza HTML.
 */

/** Tutto il testo dei blocchi, per cercarci dentro. */
function testoDi(blocchi: Blocco[]): string {
  return blocchi
    .map((b) => (b.tipo === 'codice' ? b.testo : b.tipo === 'elenco' ? b.voci.map((v) => v.map((p) => p.testo).join('')).join('\n') : b.pezzi.map((p) => p.testo).join('')))
    .join('\n')
}

describe('le versioni da mostrare', () => {
  const note = [
    { versione: '0.37.0', testo: 'vecchia' },
    { versione: '0.39.0', testo: 'nuova' },
    { versione: '0.38.1', testo: 'saltata 1' },
    { versione: '0.38.2', testo: 'saltata 2' },
    { versione: '0.40.0', testo: 'oltre la nuova' },
    { versione: '0.38.0', testo: 'quella installata' }
  ]

  it('dopo l installata e fino alla nuova comprese, dalla piu recente', () => {
    expect(noteFra(note, '0.38.0', '0.39.0').map((n) => n.versione)).toEqual(['0.39.0', '0.38.2', '0.38.1'])
  })
  it('confronta per numero e non per testo', () => {
    expect(noteFra([{ versione: '0.10.0', testo: 'x' }, { versione: '0.9.9', testo: 'y' }], '0.9.0', '0.10.0').map((n) => n.versione)).toEqual(['0.10.0', '0.9.9'])
  })
  it('una versione doppia vale la prima (la fonte migliore), una senza testo non c e', () => {
    const n = noteFra([{ versione: '0.39.0', testo: 'da GitHub' }, { versione: '0.39.0', testo: 'dall aggiornamento' }, { versione: '0.38.5', testo: '  ' }], '0.38.0', '0.39.0')
    expect(n).toEqual([{ versione: '0.39.0', testo: 'da GitHub' }])
  })
  it('le etichette delle release diventano versioni, le altre no', () => {
    expect(versioneDaTag('v0.39.0')).toBe('0.39.0')
    expect(versioneDaTag('0.38.2')).toBe('0.38.2')
    expect(versioneDaTag('android-2.43.0-beta')).toBeUndefined()
  })
  it('dalle release di GitHub: niente bozze e niente prove', () => {
    const r = daRilasciGithub([
      { tag_name: 'v0.39.0', body: '- **Nuovo**', draft: false, prerelease: false },
      { tag_name: 'v0.39.1', body: 'bozza', draft: true },
      { tag_name: 'v0.40.0-beta', body: 'prova', prerelease: true },
      { tag_name: 'v0.38.2', body: null },
      'rumore'
    ])
    expect(r).toEqual([{ versione: '0.39.0', testo: '- **Nuovo**' }, { versione: '0.38.2', testo: '' }])
    expect(daRilasciGithub({ message: 'API rate limit exceeded' })).toEqual([])
  })
})

describe('il Markdown reso in modo sicuro', () => {
  it('grassetto, corsivo, codice, in pezzi di testo semplice', () => {
    expect(analizzaRiga('**Installa** apre la *finestra* con `note`')).toEqual([
      { testo: 'Installa', grassetto: true },
      { testo: ' apre la ' },
      { testo: 'finestra', corsivo: true },
      { testo: ' con ' },
      { testo: 'note', codice: true }
    ])
  })
  it('gli asterischi spaiati e le moltiplicazioni restano testo', () => {
    expect(analizzaRiga('5 * 3 e un ** solo')).toEqual([{ testo: '5 * 3 e un ** solo' }])
  })
  it('niente HTML: le etichette spariscono, uno script non arriva mai a nessuno schermo', () => {
    const b = analizzaMarkdown('Prima <script>alert(1)</script> dopo <img src=x onerror=alert(2)> <b>grosso</b>\n<!-- nascosto -->')
    const t = testoDi(b)
    expect(t).not.toContain('<')
    expect(t).not.toContain('nascosto')
    expect(t).toContain('Prima alert(1) dopo')
    expect(JSON.stringify(b)).not.toMatch(/<script|onerror=|<img/)
  })
  it('solo i link a github.com sono cliccabili', () => {
    expect(linkAmmesso('https://github.com/niko9090/sierradeck/releases')).toBe('https://github.com/niko9090/sierradeck/releases')
    expect(linkAmmesso('http://github.com/x')).toBeUndefined()
    expect(linkAmmesso('https://github.com.cattivo.it/x')).toBeUndefined()
    expect(linkAmmesso('https://utente@github.com/x')).toBeUndefined()
    expect(linkAmmesso('javascript:alert(1)')).toBeUndefined()
    const pezzi = analizzaRiga('Vedi [le versioni](https://github.com/niko9090/sierradeck/releases) e [questo](https://esempio.it/x) e [quello](javascript:alert(1))')
    expect(pezzi.filter((p) => p.link !== undefined).map((p) => p.testo)).toEqual(['le versioni'])
    expect(pezzi.map((p) => p.testo).join('')).toContain('questo')
    expect(JSON.stringify(pezzi)).not.toContain('esempio.it')
    expect(JSON.stringify(pezzi)).not.toContain('javascript')
  })
  it('un indirizzo nudo di GitHub e cliccabile, senza la punteggiatura che lo segue', () => {
    const p = analizzaRiga('Le trovi su https://github.com/niko9090/sierradeck/releases.')
    expect(p.find((x) => x.link !== undefined)?.link).toBe('https://github.com/niko9090/sierradeck/releases')
    expect(p[p.length - 1]?.testo).toBe('.')
  })
  it('le voci di una release separate da righe vuote restano un elenco solo', () => {
    const corpo = '- **Primo.** Spiegato.\n\n- **Secondo.** Anche.\n\nApp Android invariata: 2.42.0.'
    const b = analizzaMarkdown(corpo)
    expect(b.map((x) => x.tipo)).toEqual(['elenco', 'paragrafo'])
    expect(b[0]?.tipo === 'elenco' ? b[0].voci.length : 0).toBe(2)
  })
  it('titoli, righe che continuano una voce, codice', () => {
    const b = analizzaMarkdown('## Cosa cambia\n- uno\n  che continua\n\n```\n<b>codice</b>\n```')
    expect(b[0]).toEqual({ tipo: 'titolo', pezzi: [{ testo: 'Cosa cambia' }] })
    expect(b[1]).toEqual({ tipo: 'elenco', voci: [[{ testo: 'uno che continua' }]] })
    expect(b[2]?.tipo).toBe('codice')
  })
  it('l HTML di electron-updater torna Markdown semplice', () => {
    const md = markdownDaHtml('<ul>\n<li><strong>Installa</strong> apre le note &amp; i tasti.</li>\n<li>Vedi <a href="https://github.com/niko9090/sierradeck">qui</a></li>\n</ul><p>&lt;script&gt;x&lt;/script&gt;</p>')
    expect(md).toContain('- **Installa** apre le note & i tasti.')
    expect(md).toContain('[qui](https://github.com/niko9090/sierradeck)')
    const t = testoDi(analizzaMarkdown(md))
    expect(t).not.toContain('<script')
  })
  it('le releaseNotes: stringa per la sola nuova, elenco per tutte', () => {
    expect(daNoteAggiornamento('<p>ciao</p>', '0.39.0')).toEqual([{ versione: '0.39.0', testo: 'ciao' }])
    expect(daNoteAggiornamento([{ version: '0.39.0', note: '<p>a</p>' }, { version: '0.38.2', note: null }], '0.39.0')).toEqual([{ versione: '0.39.0', testo: 'a' }, { versione: '0.38.2', testo: '' }])
    expect(daNoteAggiornamento(undefined, '0.39.0')).toEqual([])
  })
})

describe('le note raccolte per la finestra di «Installa»', () => {
  const rilasci = [
    { tag_name: 'v0.39.0', body: '- **Installa apre le note.**' },
    { tag_name: 'v0.38.2', body: '- **Consegne mai mute.**' },
    { tag_name: 'v0.38.1', body: '- **Niente Invio da premere.**' }
  ]
  it('da GitHub, con le versioni saltate', async () => {
    const n = await raccogliNote({ installata: '0.38.1', nuova: '0.39.0', rilasci: async () => rilasci })
    expect(n.fonte).toBe('github')
    expect(n.note.map((x) => x.versione)).toEqual(['0.39.0', '0.38.2'])
    expect(n.avviso).toBeUndefined()
  })
  it('GitHub non risponde: valgono le note dell aggiornamento', async () => {
    const n = await raccogliNote({ installata: '0.38.1', nuova: '0.39.0', rilasci: async () => { throw new Error('rete') }, releaseNotes: [{ version: '0.39.0', note: '<p><strong>Dall aggiornamento</strong></p>' }] })
    expect(n.fonte).toBe('aggiornamento')
    expect(n.note[0]?.blocchi[0]).toEqual({ tipo: 'paragrafo', pezzi: [{ testo: 'Dall aggiornamento', grassetto: true }] })
  })
  it('niente da nessuna parte: un avviso chiaro con la pagina dove leggerle, mai vuota e muta', async () => {
    const n = await raccogliNote({ installata: '0.38.1', nuova: '0.39.0', rilasci: async () => { throw new Error('rete') } })
    expect(n.fonte).toBe('nessuna')
    expect(n.note).toEqual([])
    expect(n.avviso).toContain('https://github.com/niko9090/sierradeck/releases')
    expect(n.avviso).toContain('Puoi installare lo stesso')
  })
  it('la nuova senza note ma quelle saltate si: lo dice', async () => {
    const n = await raccogliNote({ installata: '0.38.0', nuova: '0.39.0', rilasci: async () => rilasci.slice(1) })
    expect(n.note.map((x) => x.versione)).toEqual(['0.38.2', '0.38.1'])
    expect(n.avviso).toContain('Della 0.39.0 non ho trovato le note')
  })
  it('le novita della versione installata, dal menu, nella stessa forma', () => {
    const r = noteDaNovita([{ versione: '0.39.0', righe: ['**Uno.** a', '**Due.** b'] }])
    expect(r[0]?.blocchi).toEqual([{ tipo: 'elenco', voci: [[{ testo: 'Uno.', grassetto: true }, { testo: ' a' }], [{ testo: 'Due.', grassetto: true }, { testo: ' b' }]] }])
  })
})
