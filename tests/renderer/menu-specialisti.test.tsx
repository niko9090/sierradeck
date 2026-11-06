import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement, ReactNode } from 'react'
import { ElencoMenuSpecialisti } from '../../src/renderer/components/MenuSpecialisti'
import type { VistaAttesa } from '../../src/shared/attesa-specialisti'

/**
 * k-54: il menu Specialisti in testa alla chat dell'autopilota. Come in
 * pannello-specialisti: niente DOM, i tasti si trovano nell'albero.
 */
const ORA = '2026-11-06T12:00:00.000Z'
const vista: VistaAttesa = {
  posti: { usati: 2, tetto: 4 },
  alLavoro: [
    { posto: 1, id: 'a1', workspace: 'C:\\Lavori\\Altro', descrizione: 'prova', tipo: 'ui', dal: ORA, titolo: 'Prova di lettura', cosaFa: 'Legge i file', percentuale: 40, minutiStimati: 12 },
    { posto: 2, id: 'a2', workspace: 'C:\\Lavori\\Mio', descrizione: 'tabella', tipo: 'ui', dal: ORA, titolo: 'Rifà la tabella', percentuale: 95, minutiStimati: 3, inRitardo: true },
    { posto: 3, id: 'a3', workspace: 'C:\\Lavori\\Mio', descrizione: 'altro', tipo: 'ui', dal: ORA, titolo: 'In fermata', fermaRichiesta: true }
  ],
  inFila: [
    { id: 'f1', posizione: 1, workspace: 'C:\\Lavori\\Altro', descrizione: 'ricerca', tipo: 'r', dal: ORA, priorita: 0, prenotata: false, titolo: 'Ricerca file', minutiStimati: 20 },
    { id: 'f2', posizione: 2, workspace: 'C:\\Lavori\\Mio', descrizione: 'ultima', tipo: 'r', dal: ORA, priorita: 0, prenotata: false, titolo: 'Ultima richiesta' }
  ],
  totale: { minuti: 45, compiti: 5 }
}

const nulla = (): void => undefined
type Fn = Parameters<typeof ElencoMenuSpecialisti>[0]
const props = (p: Partial<Fn> = {}): Fn => ({ vista, riferimenti: ['C:\\Lavori\\Mio'], onMossa: nulla, onFerma: nulla, onAnnullaFerma: nulla, onApriSezione: nulla, ...p })
const html = (p: Partial<Fn> = {}): string => renderToStaticMarkup(<ElencoMenuSpecialisti {...props(p)} />)

function elementi(n: ReactNode, fuori: ReactElement[] = []): ReactElement[] {
  if (Array.isArray(n)) { n.forEach((x) => elementi(x as ReactNode, fuori)); return fuori }
  if (n === null || typeof n !== 'object') return fuori
  const e = n as ReactElement<{ children?: ReactNode }>
  fuori.push(e)
  elementi(e.props.children, fuori)
  return fuori
}
const testo = (n: ReactNode): string => Array.isArray(n) ? n.map((x) => testo(x as ReactNode)).join('') : typeof n === 'string' || typeof n === 'number' ? String(n) : n !== null && typeof n === 'object' ? testo((n as ReactElement<{ children?: ReactNode }>).props.children) : ''
function tasto(p: Fn, idVoce: string, nome: string): ReactElement<{ onClick: () => void; disabled?: boolean }> | undefined {
  const riga = elementi(ElencoMenuSpecialisti(p)).find((e) => e.type === 'li' && e.key === idVoce)
  expect(riga, `riga ${idVoce}`).toBeDefined()
  return elementi(riga as ReactElement).find((e) => e.type === 'button' && testo(e as ReactElement) === nome) as ReactElement<{ onClick: () => void; disabled?: boolean }> | undefined
}

describe('il menu Specialisti: cosa mostra', () => {
  it('chi lavora, con titolo, percentuale, barretta, cosa fa e minuti', () => {
    const h = html()
    expect(h).toContain('Prova di lettura')
    expect(h).toContain('40%')
    expect(h).toContain('width:40%')
    expect(h).toContain('Legge i file')
    expect(h).toContain('mancano circa 12 min')
    expect(h).toContain('in ritardo')
  })

  it('di un altro workspace mostra il nome (mai il percorso); del corrente è in evidenza e senza nome', () => {
    const h = html()
    expect(h).toContain('· Altro')
    expect(h).not.toContain('C:\\Lavori')
    expect(h.match(/menuspec__riga--mia/g)?.length).toBe(3)
    expect(h).not.toContain('· Mio')
  })

  it('chi è in fila: posizione e attesa stimata', () => {
    const h = html()
    expect(h).toContain('1° ')
    expect(h).toContain('attesa circa 20 min')
    expect(h).toContain('2° ')
  })

  it('in fondo il totale e il tasto verso la sezione', () => {
    const h = html()
    expect(h).toContain('circa 45 min per finire tutto')
    expect(h).toContain('Apri Specialisti')
  })

  it('il «perché» sta dietro un «?»', () => {
    const h = html()
    expect(h).toContain('aiuto__tasto')
    expect(h).not.toContain('Non ferma mai chi sta già lavorando')
  })

  it('prima della lettura «Leggo la lista…»; vuota: due righe semplici', () => {
    expect(html({ vista: undefined })).toContain('Leggo la lista')
    const h = html({ vista: { posti: { usati: 0, tetto: 4 }, alLavoro: [], inFila: [] } })
    expect(h).toContain('Nessuno al lavoro')
    expect(h).toContain('Nessuno in fila')
  })
})

describe('il menu Specialisti: i tasti', () => {
  it('«↑ Precedenza» chiama la mossa «cima» su chi lavora e su chi è in fila', () => {
    const onMossa = vi.fn()
    tasto(props({ onMossa }), 'a1', '↑ Precedenza')!.props.onClick()
    tasto(props({ onMossa }), 'f2', '↑ Precedenza')!.props.onClick()
    expect(onMossa).toHaveBeenNthCalledWith(1, 'a1', 'cima')
    expect(onMossa).toHaveBeenNthCalledWith(2, 'f2', 'cima')
  })

  it('il primo della fila non ha dove salire', () => {
    expect(tasto(props(), 'f1', '↑ Precedenza')!.props.disabled).toBe(true)
    expect(tasto(props(), 'f2', '↑ Precedenza')!.props.disabled).toBeFalsy()
  })

  it('«Ferma» c’è solo su chi lavora e prima chiede conferma', () => {
    const onFerma = vi.fn()
    const onMossa = vi.fn()
    expect(tasto(props(), 'f2', 'Ferma')).toBeUndefined()
    tasto(props({ onFerma, onMossa }), 'a1', 'Ferma')!.props.onClick()
    expect(onFerma).toHaveBeenCalledWith('a1')
    expect(onMossa).not.toHaveBeenCalled()
  })

  it('la conferma dice cosa succede; «Sì, ferma» chiama la mossa «ferma»', () => {
    expect(html({ daFermare: 'a1' })).toContain('Lo fermo e lo metto in cima alla fila: il suo lavoro resta salvato')
    const onMossa = vi.fn()
    tasto(props({ daFermare: 'a1', onMossa }), 'a1', 'Sì, ferma')!.props.onClick()
    expect(onMossa).toHaveBeenCalledWith('a1', 'ferma')
    const onAnnulla = vi.fn()
    tasto(props({ daFermare: 'a1', onAnnullaFerma: onAnnulla }), 'a1', 'No')!.props.onClick()
    expect(onAnnulla).toHaveBeenCalled()
  })

  it('fermata già chiesta: «fermata chiesta…» e niente secondo «Ferma»', () => {
    expect(html()).toContain('fermata chiesta…')
    expect(tasto(props(), 'a3', 'Ferma')).toBeUndefined()
  })

  it('«Apri Specialisti» apre la sezione', () => {
    const onApriSezione = vi.fn()
    const b = elementi(ElencoMenuSpecialisti(props({ onApriSezione }))).find((e) => e.type === 'button' && testo(e as ReactElement) === 'Apri Specialisti') as ReactElement<{ onClick: () => void }>
    b.props.onClick()
    expect(onApriSezione).toHaveBeenCalled()
  })
})
