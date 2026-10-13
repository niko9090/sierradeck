import { describe, it, expect } from 'vitest'
import { paginaClient } from '../../src/main/client-pagina'
import { vistaAccount } from '../../src/shared/account-vista'

/** La catena di Account e Drive nella pagina del telefono (0.70.0): le tessere che manda il PC. */
const html = paginaClient()
const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'))
const estrai = (nome: string): string => {
  const inizio = script.indexOf(`function ${nome}(`)
  let profondita = 0
  for (let i = script.indexOf('{', inizio); i < script.length; i++) {
    if (script[i] === '{') profondita++
    else if (script[i] === '}' && --profondita === 0) return script.slice(inizio, i + 1)
  }
  throw new Error('non si chiude')
}
const riga = (inizio: string): string => script.split('\n').find((r) => r.startsWith(inizio)) ?? ''
const catenaAccountHtml = new Function(`${riga('const esc =')}\n${estrai('catenaAccountHtml')}\nreturn catenaAccountHtml`)() as (a: unknown) => string
const ORA = Date.parse('2026-10-13T10:00:00Z')

describe('Account e Drive nella pagina', () => {
  it('senza catena (un PC di prima) non mostra niente', () => {
    expect(catenaAccountHtml(null)).toBe('')
    expect(catenaAccountHtml({ entrato: true, email: 'p@esempio.it' })).toBe('')
  })

  it('mostra le quattro tessere con la parola e il prossimo passo', () => {
    const catena = vistaAccount({ utente: { email: 'p@esempio.it' }, drive: { configurato: true, connesso: false }, sync: { haCassaforte: true, sbloccato: false }, ora: ORA })
    const h = catenaAccountHtml(JSON.parse(JSON.stringify({ entrato: true, catena })))
    for (const t of ['Account', 'Drive', 'Cassaforte', 'Salvataggio', 'entrato', 'scollegato', 'chiusa']) expect(h).toContain(t)
    expect(h).toContain('Prossimo passo, sul computer: <b>Collega il Drive</b>')
  })

  it('il Drive che scade a sette giorni si dice in ambra, con il perché', () => {
    const catena = vistaAccount({ utente: { email: 'p@esempio.it' }, drive: { configurato: true, connesso: true, collegatoIl: new Date(ORA - 6.5 * 86_400_000).toISOString() }, sync: { haCassaforte: true, sbloccato: true }, ora: ORA })
    const h = catenaAccountHtml(JSON.parse(JSON.stringify({ entrato: true, catena })))
    expect(h).toContain('scade')
    expect(h).toContain('⚠ collegato 6 giorni fa')
  })
})
