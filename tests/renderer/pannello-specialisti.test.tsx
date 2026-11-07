import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement, ReactNode } from 'react'
import { ListaSpecialisti } from '../../src/renderer/components/PannelloSpecialisti'
import type { VistaAttesa } from '../../src/shared/attesa-specialisti'

/**
 * k-49 (06/11). «Voglio vedere la lista degli specialisti che hanno chiesto
 * uno slot per operare, e volendo cambiare la priorità». La sezione
 * «Specialisti»: posti, chi lavora, chi è in fila, i tasti per muoverli.
 *
 * Nei test non c'è un DOM: i tasti si trovano nell'albero degli elementi e se
 * ne chiama `onClick`, come farebbe il clic.
 */
const ORA = Date.parse('2026-11-06T12:00:00Z')
const iso = (minFa: number): string => new Date(ORA - minFa * 60_000).toISOString()

const vista: VistaAttesa = {
  posti: { usati: 3, tetto: 4 },
  alLavoro: [
    { posto: 1, id: 'a1', workspace: 'Nexora', compito: 'k-40', descrizione: 'k-40: rifai la tabella', tipo: 'specialista-ui', dal: iso(12) },
    { posto: 2, id: 'a2', workspace: 'C:\\Lavoro\\Altro', descrizione: 'prova di lettura', tipo: 'revisore', dal: iso(130) }
  ],
  inFila: [
    { id: 'f1', posizione: 1, workspace: 'Nexora', compito: 'k-50', descrizione: 'k-50: nuova scheda', tipo: 'specialista-ui', dal: iso(5), priorita: 0, prenotata: true, prenotataFino: new Date(ORA + 3 * 60_000).toISOString() },
    { id: 'f2', posizione: 2, workspace: 'Altro', descrizione: 'ricerca nei file', tipo: 'ricerca', dal: iso(2), priorita: 2, prenotata: false },
    { id: 'f3', posizione: 3, workspace: 'Altro', descrizione: 'ultima richiesta', tipo: 'ricerca', dal: iso(1), priorita: 0, prenotata: false }
  ]
}

const vuota: VistaAttesa = { posti: { usati: 1, tetto: 4 }, alLavoro: [], inFila: [] }

const nulla = (): void => undefined
type Fn = Parameters<typeof ListaSpecialisti>[0]
const props = (p: Partial<Fn> = {}): Fn => ({ vista, adesso: ORA, onMossa: nulla, onTogli: nulla, onAnnullaTogli: nulla, onConfermaTogli: nulla, ...p })
const html = (p: Partial<Fn> = {}): string => renderToStaticMarkup(<ListaSpecialisti {...props(p)} />)

/** Tutti gli elementi dell'albero, in ordine. Le funzioni-componente non ci sono: ListaSpecialisti disegna solo elementi di base e <Aiuto>. */
function elementi(n: ReactNode, fuori: ReactElement[] = []): ReactElement[] {
  if (Array.isArray(n)) { n.forEach((x) => elementi(x as ReactNode, fuori)); return fuori }
  if (n === null || typeof n !== 'object') return fuori
  const e = n as ReactElement<{ children?: ReactNode }>
  fuori.push(e)
  elementi(e.props.children, fuori)
  return fuori
}
const testo = (n: ReactNode): string => Array.isArray(n) ? n.map((x) => testo(x as ReactNode)).join('') : typeof n === 'string' || typeof n === 'number' ? String(n) : n !== null && typeof n === 'object' ? testo((n as ReactElement<{ children?: ReactNode }>).props.children) : ''
/** Il tasto con quel testo (o aria-label) dentro la riga di quella voce. */
function tasto(p: Fn, idVoce: string, nome: string): ReactElement<{ onClick: () => void; disabled?: boolean }> {
  const albero = ListaSpecialisti(p)
  const righe = elementi(albero).filter((e) => e.type === 'li')
  const riga = righe.find((r) => r.key === idVoce)
  expect(riga, `riga ${idVoce}`).toBeDefined()
  const t = elementi(riga as ReactElement).find((e) => e.type === 'button' && (testo(e as ReactElement) === nome || (e.props as { 'aria-label'?: string })['aria-label'] === nome))
  expect(t, `tasto ${nome} di ${idVoce}`).toBeDefined()
  return t as ReactElement<{ onClick: () => void; disabled?: boolean }>
}

describe('la sezione «Specialisti»: le due liste', () => {
  it('in alto i posti usati sul totale', () => {
    expect(html()).toContain('3 di 4 posti occupati')
    expect(html({ vista: { ...vista, posti: { usati: 1, tetto: 1 } } })).toContain('1 di 1 posto occupato')
  })

  it('«Al lavoro adesso»: posto, workspace leggibile (mai il percorso), compito, tipo, da quanto lavora', () => {
    const h = html()
    expect(h).toContain('Al lavoro adesso')
    expect(h).toContain('Posto 1')
    expect(h).toContain('k-40')
    expect(h).toContain('specialista-ui')
    expect(h).toContain('lavora da 12 min')
    expect(h).toContain('lavora da 2 h 10 min')
    expect(h).toContain('Altro')
    expect(h).not.toContain('C:\\Lavoro')
    expect(h).not.toContain('Lavoro\\Altro')
  })

  it('«In fila»: posizione, workspace, compito, descrizione, da quanto aspetta, priorità', () => {
    const h = html()
    expect(h).toContain('1°')
    expect(h).toContain('3°')
    expect(h).toContain('k-50')
    expect(h).toContain('ricerca nei file')
    expect(h).toContain('aspetta da 5 min')
    expect(h).toContain('priorità normale')
    expect(h).toContain('priorità alta 2')
  })

  it('chi ha il posto prenotato: «tocca a lui» e quanto manca; gli altri no', () => {
    const h = html()
    expect(h).toContain('tocca a lui')
    expect(h).toContain('ancora 3 min')
    expect(h.match(/tocca a lui/g)).toHaveLength(1)
    expect(html({ adesso: ORA + 10 * 60_000 })).toContain('(scaduta)')
  })

  it('il «perché» della fila sta dietro un «?», non in un paragrafo fisso', () => {
    const h = html()
    expect(h).toContain('aiuto__tasto')
    expect(h).not.toContain('prenotato per qualche minuto')
  })

  it('fila vuota: una riga semplice; nessuno al lavoro: anche', () => {
    const h = html({ vista: vuota })
    expect(h).toContain('Nessuno in fila')
    expect(h).toContain('Nessuno al lavoro')
    expect(h).not.toContain('Togli')
  })

  it('servizio vecchio: una riga sola; prima della lettura: «Leggo la lista…»', () => {
    const h = html({ vista: 'vecchio' })
    expect(h).toContain('Serve la versione nuova del servizio')
    expect(h).not.toContain('posti occupati')
    expect(html({ vista: undefined })).toContain('Leggo la lista')
  })
})

describe('la sezione «Specialisti»: i tasti', () => {
  it('↑, ↓ e «In cima» chiamano la mossa giusta sulla voce giusta', () => {
    const onMossa = vi.fn()
    const p = props({ onMossa })
    tasto(p, 'f2', 'Sposta più in alto').props.onClick()
    tasto(p, 'f2', 'Sposta più in basso').props.onClick()
    tasto(p, 'f3', 'In cima').props.onClick()
    expect(onMossa.mock.calls).toEqual([['f2', 'su'], ['f2', 'giu'], ['f3', 'cima']])
  })

  it('il primo non va più su né in cima; l’ultimo non va più giù', () => {
    const p = props()
    expect(tasto(p, 'f1', 'Sposta più in alto').props.disabled).toBe(true)
    expect(tasto(p, 'f1', 'In cima').props.disabled).toBe(true)
    expect(tasto(p, 'f3', 'Sposta più in basso').props.disabled).toBe(true)
    expect(tasto(p, 'f2', 'In cima').props.disabled).toBe(false)
  })

  it('«Togli» non toglie subito: chiede, e toglie solo dopo il «Sì»', () => {
    const onTogli = vi.fn()
    const onConfermaTogli = vi.fn()
    const onAnnullaTogli = vi.fn()
    tasto(props({ onTogli, onConfermaTogli }), 'f2', 'Togli').props.onClick()
    expect(onTogli).toHaveBeenCalledWith('f2')
    expect(onConfermaTogli).not.toHaveBeenCalled()
    // Con la conferma aperta su quella voce: la domanda e i due tasti, al posto delle mosse.
    const p = props({ daTogliere: 'f2', onConfermaTogli, onAnnullaTogli })
    expect(html({ daTogliere: 'f2' })).toContain('Toglierla dalla fila?')
    tasto(p, 'f2', 'Sì, togli').props.onClick()
    expect(onConfermaTogli).toHaveBeenCalledWith('f2')
    tasto(p, 'f2', 'No').props.onClick()
    expect(onAnnullaTogli).toHaveBeenCalledTimes(1)
    // Le altre voci hanno ancora i loro tasti.
    expect(tasto(p, 'f3', 'Togli')).toBeDefined()
  })
})

const ricca: VistaAttesa = {
  posti: { usati: 2, tetto: 4 },
  alLavoro: [
    { posto: 1, id: 'a1', workspace: 'Nexora', workspaceNome: 'Nexora', compito: 'k-40', descrizione: 'k-40: rifai la tabella', titolo: 'Rifai la tabella', cosaFa: 'Modifica Tabella.tsx', percentuale: 40, minutiStimati: 12, tipo: 'specialista-ui', dal: iso(12), precedenza: 1 },
    { posto: 2, id: 'a2', workspace: 'Altro', workspaceNome: 'Altro', descrizione: 'prova', titolo: 'Prova lunga', percentuale: 95, minutiStimati: 1, inRitardo: true, tipo: 'revisore', dal: iso(90), fermaRichiesta: true }
  ],
  inFila: [
    { id: 'f1', posizione: 1, workspace: 'Altro', workspaceNome: 'Altro', descrizione: 'ricerca', titolo: 'Ricerca nei file', minutiStimati: 75, tipo: 'ricerca', dal: iso(2), priorita: 0, prenotata: false, parcheggiata: true },
    { id: 'f2', posizione: 2, workspace: 'Nexora', workspaceNome: 'Nexora', descrizione: 'scheda', tipo: 'ricerca', dal: iso(1), priorita: 0, prenotata: false }
  ],
  totale: { minuti: 90, compiti: 4 }
}

describe('la sezione «Specialisti»: stime e workspace', () => {
  it('in alto il totale accanto ai posti; senza totale non c’è', () => {
    const h = html({ vista: ricca })
    expect(h).toContain('2 di 4 posti occupati')
    expect(h).toContain('Circa 1 h 30 min per finire tutto · 4 compiti')
    expect(html()).not.toContain('per finire tutto')
    expect(html({ vista: { ...ricca, totale: { minuti: 12, compiti: 1 } } })).toContain('Circa 12 min per finire tutto · 1 compito')
  })

  it('chi lavora: workspace, titolo breve, cosa fa, percentuale, minuti, in ritardo', () => {
    const h = html({ vista: ricca })
    expect(h).toContain('Rifai la tabella')
    expect(h).toContain('Modifica Tabella.tsx')
    expect(h).toContain('value="40"')
    expect(h).toContain('40%')
    expect(h).toContain('mancano circa 12 min')
    expect(h.match(/in ritardo/g)).toHaveLength(1)
  })

  it('chi è in fila: minuti stimati e «parcheggiato» solo se serve', () => {
    const h = html({ vista: ricca })
    expect(h).toContain('circa 1 h 15 min per finire')
    expect(h.match(/· parcheggiato/g)).toHaveLength(1)
  })

  it('il «?» delle stime c’è', () => {
    expect(html({ vista: ricca }).match(/aiuto__tasto/g)?.length).toBeGreaterThanOrEqual(2)
  })
})

describe('la sezione «Specialisti»: Precedenza e Ferma', () => {
  it('«↑ Precedenza» manda la mossa cima, senza chiedere', () => {
    const onMossa = vi.fn()
    tasto(props({ vista: ricca, onMossa }), 'a1', '↑ Precedenza').props.onClick()
    expect(onMossa).toHaveBeenCalledWith('a1', 'cima')
  })

  it('«Ferma» chiede prima; la mossa parte solo dopo il «Sì»', () => {
    const onMossa = vi.fn()
    const onFerma = vi.fn()
    tasto(props({ vista: ricca, onMossa, onFerma }), 'a1', 'Ferma').props.onClick()
    expect(onFerma).toHaveBeenCalledWith('a1')
    expect(onMossa).not.toHaveBeenCalled()
    expect(html({ vista: ricca, daFermare: 'a1' })).toContain('Lo fermo e lo metto in cima alla fila: il suo lavoro resta salvato')
    tasto(props({ vista: ricca, onMossa, daFermare: 'a1' }), 'a1', 'Sì, ferma').props.onClick()
    expect(onMossa).toHaveBeenCalledWith('a1', 'ferma')
  })

  it('fermata già chiesta: «fermata chiesta…» e niente tasti', () => {
    const h = html({ vista: ricca })
    expect(h).toContain('fermata chiesta…')
    expect(h.match(/>Ferma</g)).toHaveLength(1)
  })
})

describe('la sezione «Specialisti»: nel programma', () => {
  const console_ = readFileSync('src/renderer/components/Console.tsx', 'utf8')
  const app = readFileSync('src/renderer/App.tsx', 'utf8')
  const pannello = readFileSync('src/renderer/components/PannelloSpecialisti.tsx', 'utf8')

  it('sta nel menu principale dopo Domande, con il numero di chi è in fila', () => {
    expect(console_).toContain('vociDellaFascia(')
    expect(console_).toContain("v.id === 'specialisti' ? specialistiInFila")
    expect(console_).toMatch(/findIndex\(\(v\) => v\.id === 'domande'\) \+ 1/)
    expect(console_).toContain("'specialisti' | undefined")
    // k-160: Specialisti è una colonna a destra, aperta da specialistiLato (non più da «aperto»).
    expect(app).toContain('{specialistiLato.aperto ? (')
    expect(app).toContain('<PannelloSpecialisti')
    expect(app).toContain('specialistiInFila={specialistiInFila}')
  })

  it('legge la lista ogni pochi secondi e usa le tre funzioni del servizio', () => {
    expect(pannello).toContain('RILETTURA_MS = 4000')
    expect(pannello).toContain('window.gestore.autopilota.attesaSpecialisti()')
    expect(pannello).toContain('window.gestore.autopilota.prioritaAttesa(id, m)')
    expect(pannello).toContain('window.gestore.autopilota.togliAttesa(id)')
    // Niente sfarfallio: si cambia lo stato solo se la lista è cambiata.
    expect(pannello).toContain('JSON.stringify(prima) === JSON.stringify(nuova) ? prima : nuova')
  })
})
