import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ElencoMenuSpecialisti } from '../../src/renderer/components/MenuSpecialisti'
import { ColonnaSpecialistiRemoti, RigaPcGiu } from '../../src/renderer/components/ChatAutopilotaRemota'
import type { VistaAttesa } from '../../src/shared/attesa-specialisti'

/** k-60: la colonna degli specialisti di un altro PC si guarda e basta; se il PC non risponde, una riga lo dice. */
const ORA = '2026-11-06T12:00:00.000Z'
const vista: VistaAttesa = {
  posti: { usati: 1, tetto: 4 },
  alLavoro: [{ posto: 1, id: 'a1', workspace: 'cartella:prova', descrizione: 'prova', tipo: 'ui', dal: ORA, titolo: 'Prova di lettura', cosaFa: 'Legge i file', percentuale: 40, minutiStimati: 12 }],
  inFila: [{ id: 'f1', posizione: 1, workspace: 'cartella:prova', descrizione: 'ricerca', tipo: 'r', dal: ORA, priorita: 0, prenotata: false, titolo: 'Ricerca file', minutiStimati: 20 }],
  totale: { minuti: 32, compiti: 2 }
}
const nulla = (): void => undefined
const html = (soloLettura: boolean): string => renderToStaticMarkup(
  <ElencoMenuSpecialisti vista={vista} riferimenti={['cartella:prova']} soloLettura={soloLettura} onMossa={nulla} onFerma={nulla} onAnnullaFerma={nulla} onApriSezione={nulla} />
)

describe('la lista degli specialisti di un altro PC', () => {
  it('mostra chi lavora (percentuale, cosa fa, quanto manca) e chi è in fila', () => {
    const h = html(true)
    expect(h).toContain('Prova di lettura')
    expect(h).toContain('40%')
    expect(h).toContain('Legge i file')
    expect(h).toContain('mancano circa 12 min')
    expect(h).toContain('1° ')
    expect(h).toContain('attesa circa 20 min')
  })
  it('in sola lettura non ha tasti per cambiare niente su quel PC', () => {
    const h = html(true)
    expect(h).not.toContain('Precedenza')
    expect(h).not.toContain('Ferma')
    expect(h).not.toContain('Apri Specialisti')
    // La spiegazione sta dietro il «?», non scritta fissa.
    expect(h).toContain('aiuto__tasto')
  })
  it('quella di qui resta com’era, con i suoi tasti', () => {
    const h = html(false)
    expect(h).toContain('Precedenza')
    expect(h).toContain('Apri Specialisti')
  })
})

describe('il PC remoto che non risponde', () => {
  it('la riga dice il nome del PC e cosa succede', () => {
    const h = renderToStaticMarkup(<RigaPcGiu pcNome="PC-prova" />)
    expect(h).toContain('PC-prova è spento o non risponde')
    expect(h).toContain('role="status"')
  })
  it('la colonna, mentre legge, lo dice e porta il nome del PC', () => {
    const h = renderToStaticMarkup(<ColonnaSpecialistiRemoti pcId="pc-1" pcNome="PC-prova" />)
    expect(h).toContain('Specialisti · su PC-prova')
    expect(h).toContain('Leggo la lista')
  })
})
