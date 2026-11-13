import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { Stato } from '../../src/renderer/components/FinestraAggiornamenti'
import type { StatoAggiornamento } from '../../src/main/aggiornamenti'

/**
 * La finestra degli aggiornamenti in basso a destra (13/11): le frasi e i tasti
 * delle strisce di prima, fuori dalla faccia del programma. Installare resta
 * una scelta di chi la usa: dallo stato «pronto» si vede prima cosa cambia.
 */
const vista = (agg: StatoAggiornamento, scaricaAuto = true): string =>
  renderToStaticMarkup(<Stato agg={agg} scaricaAuto={scaricaAuto} versione="1.0.0" onVai={() => undefined} />)

describe('lo stato nella finestra degli aggiornamenti', () => {
  it('pronta: «Installa» apre le note, non c’è «Installa e riavvia» qui', () => {
    const h = vista({ fase: 'pronto', versione: '1.1.0' })
    expect(h).toContain('La versione 1.1.0 è pronta')
    expect(h).toContain('>Installa<')
    expect(h).not.toContain('Installa e riavvia')
  })
  it('disponibile: «Scarica» solo se lo scaricamento automatico è spento', () => {
    expect(vista({ fase: 'disponibile', versione: '1.1.0' }, false)).toContain('>Scarica<')
    expect(vista({ fase: 'disponibile', versione: '1.1.0' }, true)).toContain('La sto scaricando')
    expect(vista({ fase: 'disponibile', versione: '1.1.0' }, true)).not.toContain('>Scarica<')
  })
  it('scarico: percentuale e barra', () => {
    const h = vista({ fase: 'scarico', versione: '1.1.0', percento: 42 })
    expect(h).toContain('42%')
    expect(h).toContain('width:42%')
  })
  it('attendo: «Aggiorna adesso», con la spiegazione dietro il «?»', () => {
    const h = vista({ fase: 'attendo', versione: '1.1.0', chatOccupate: 2 })
    expect(h).toContain('2 chat finiscano')
    expect(h).toContain('Aggiorna adesso')
  })
  it('errore e installazione non riuscita', () => {
    expect(vista({ fase: 'errore', errore: 'rete giù' })).toContain('rete giù')
    const h = vista({ fase: 'pronto', versione: '1.1.0', tentativoFallito: { titolo: 'Non si è installata.', motivo: 'Motivo.', strade: ['Riprova'], pagina: 'https://example.invalid' } as StatoAggiornamento['tentativoFallito'] })
    expect(h).toContain('Non si è installata.')
    expect(h).toContain('Scarica a mano')
  })
  it('fermo: dice la versione e offre le novità', () => {
    const h = vista({ fase: 'fermo' })
    expect(h).toContain('hai la 1.0.0')
    expect(h).toContain('Cosa c’è di nuovo')
  })
})

describe('fuori dalla faccia del programma', () => {
  const app = readFileSync('src/renderer/App.tsx', 'utf8')
  it('App non disegna più le strisce né le finestre delle note', () => {
    expect(app).not.toContain('avviso--aggiornamento')
    expect(app).not.toContain('<ModaleNote')
    expect(app).toContain("finestraNovita?.apri({ tipo: 'installa', versione })")
  })
  it('la finestra non è una finestra di chat e non installa da sola', () => {
    const main = readFileSync('src/main/finestra-novita.ts', 'utf8')
    expect(main).toContain('segnaFinestraAccessoria(w)')
    expect(main).toContain('showInactive()')
    expect(main).not.toMatch(/aggiornamenti\.installa|installa\(\)/)
    const pannelli = readFileSync('src/main/finestre-pannello.ts', 'utf8')
    expect(pannelli).toContain('!accessorie.has(w.id)')
  })
  it('l’ingresso del renderer sceglie la finestra con ?finestra=aggiornamenti', () => {
    expect(readFileSync('src/renderer/main.tsx', 'utf8')).toContain("get('finestra') === 'aggiornamenti'")
  })
})
