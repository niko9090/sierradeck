import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import type { VistaAttesa } from '../../src/shared/attesa-specialisti'
import {
  FINITI_VISIBILI, FRASE_NESSUNO, SPIEGA_PANNELLO, STATI_AGENTE, consumoPerPc, contaAlLavoro, contatoriToken, esitiRecenti,
  fileInModifica, filaUnioni, riferimentiWorkspace, schedeAgenti, testoToken
} from '../../src/renderer/pannello-agenti-vista'

/**
 * 23/11 (r-174, r-176, r-177): il pannello degli agenti a destra, completo. Senza DOM: si provano
 * le funzioni pure e il sorgente. Niente dati veri: nomi inventati.
 */
const ORA = Date.parse('2026-11-23T12:00:00Z')
const iso = (minFa: number): string => new Date(ORA - minFa * 60_000).toISOString()
const WS = 'cartella:C:/Prova/Uno'
const ALTRO = 'C:\\Prova\\Altro'

const vuota: VistaAttesa = { posti: { usati: 0, tetto: 4 }, alLavoro: [], inFila: [] }

const vista: VistaAttesa = {
  posti: { usati: 3, tetto: 4 },
  alLavoro: [
    { posto: 1, id: 'a1', workspace: WS, compito: 'k-1', descrizione: 'k-1: tabella', titolo: 'Rifai la tabella', tipo: 'Interfaccia', dal: iso(12),
      pannello: { pc: { questoPc: true }, file: ['src/a.ts', 'src/b.ts'], fileAltri: 1, azione: { titolo: 'Rifai la tabella', ultima: 'Edit a.ts' }, token: { totale: 12_000 }, durataMs: 12 * 60_000 } },
    { posto: 2, id: 'a2', workspace: WS, descrizione: 'prova', tipo: 'Collaudo', dal: iso(130), suPc: 'PC-DUE',
      pannello: { pc: { questoPc: false, nome: 'PC-DUE' }, file: ['src/a.ts'], azione: { titolo: 'prova' }, token: { totale: 3_000 } } },
    { posto: 3, id: 'a3', workspace: WS, descrizione: 'chiude', tipo: 'Sviluppo', dal: iso(40), suPc: 'PC-DUE',
      pannello: { pc: { questoPc: false, nome: 'PC-DUE' }, file: [], azione: { titolo: 'chiude' }, invio: 'invio', token: { totale: 500 } } },
    { posto: 4, id: 'a4', workspace: WS, descrizione: 'in arrivo', tipo: 'Sviluppo', dal: iso(1), fase: 'in-arrivo', perPc: 'PC-TRE' },
    { posto: 5, id: 'a5', workspace: WS, descrizione: 'rilascio', tipo: 'Rilascio', dal: iso(3), titolo: 'Pubblica' },
    { posto: 6, id: 'a6', workspace: ALTRO, descrizione: 'altrove', tipo: 'Sviluppo', dal: iso(5) }
  ],
  inFila: [
    { id: 'f1', posizione: 1, workspace: WS, descrizione: 'aspetta posto', tipo: 'Sviluppo', dal: iso(1), priorita: 0, prenotata: false },
    { id: 'f2', posizione: 2, workspace: WS, compito: 'k-9', descrizione: 'aspetta unione', tipo: 'Sviluppo', dal: iso(1), priorita: 0, prenotata: false, perUnione: ['k-7', 'k-8'] }
  ],
  inUnione: [
    { id: 'u2', workspace: WS, workspaceNome: 'Uno', titolo: 'Seconda', inCorso: false, posizione: 2 },
    { id: 'u1', workspace: WS, workspaceNome: 'Uno', titolo: 'Prima', inCorso: true, posizione: 1 }
  ],
  esitiUnioni: {
    [WS]: [
      { id: 'e1', titolo: 'Verde', esito: 'verde', verde: true, quando: iso(10) },
      { id: 'e2', titolo: 'Rosso', esito: 'rosso', verde: false, quando: iso(2) }
    ]
  },
  dopoLavoro: [
    { id: 's1', workspace: WS, titolo: 'Uno', durataMs: 90 * 60_000, stato: 'in-fila', parole: 'x' },
    { id: 's2', workspace: WS, titolo: 'Due', stato: 'in-unione', parole: 'x' },
    { id: 's3', workspace: WS, titolo: 'Tre', stato: 'unito', parole: 'x' },
    { id: 's4', workspace: WS, titolo: 'Quattro', stato: 'criterio-rosso', parole: 'x' },
    { id: 's5', workspace: WS, titolo: 'Cinque', stato: 'conflitto', parole: 'x' },
    { id: 's6', workspace: WS, titolo: 'Sei', stato: 'unito', parole: 'x' },
    { id: 's7', workspace: WS, titolo: 'Sette', stato: 'unito', parole: 'x' },
    { id: 's8', workspace: WS, titolo: 'Otto', stato: 'unito', parole: 'x' },
    { id: 's9', workspace: ALTRO, titolo: 'Altrui', stato: 'unito', parole: 'x' }
  ],
  pannelloTotali: {
    [WS]: { tokenTotali: 500_000, tokenOggi: 40_000 },
    [ALTRO]: { tokenTotali: 9_000_000, tokenOggi: 900_000 }
  }
}
const RIF = riferimentiWorkspace(WS, { workspace: WS, cwd: 'C:\\Prova\\Uno' })

describe('ogni stato ha le sue parole e un colore fisso', () => {
  it('sei stati, sei colori diversi', () => {
    expect(Object.keys(STATI_AGENTE)).toEqual(['lavora', 'invio', 'in-prova', 'in-fila', 'rimandato', 'finito'])
    expect(new Set(Object.values(STATI_AGENTE).map((s) => s.colore)).size).toBe(6)
    expect(STATI_AGENTE.invio.parole).toBe('invio dati - fine lavori')
  })

  const schede = schedeAgenti(vista, RIF, ORA)
  const per = (id: string) => schede.find((s) => s.id === id)!

  it('al lavoro (questo PC, un altro PC), invio dati, in arrivo, rilascio', () => {
    expect(per('a1').stato).toBe('lavora')
    expect(per('a1').pc).toBe('questo PC')
    expect(per('a2').stato).toBe('lavora')
    expect(per('a2').pc).toBe('su PC-DUE')
    expect(per('a3').stato).toBe('invio')
    expect(per('a3').parole).toBe('invio dati - fine lavori')
    expect(per('a3').colore).toBe('viola')
    expect(per('a4').stato).toBe('in-fila')
    expect(per('a4').parole).toBe('in arrivo')
    expect(per('a5').ruolo).toBe('Rilascio')
    expect(per('a5').stato).toBe('lavora')
  })

  it('in fila: per un posto e per un’altra unione', () => {
    expect(per('f1').stato).toBe('in-fila')
    expect(per('f1').nota).toBe('Aspetta un posto libero.')
    expect(per('f2').nota).toBe('Aspetta l’unione di k-7, k-8.')
  })

  it('dopo «finito»: in fila per unione, in prova/unione, rimandato (due modi), finito', () => {
    expect(per('s1').stato).toBe('in-fila')
    expect(per('s1').parole).toBe('in fila per l’unione')
    expect(per('s1').durata).toBe('1 h 30 min')
    expect(per('s2').stato).toBe('in-prova')
    expect(per('s2').colore).toBe('blu')
    expect(per('s3').stato).toBe('finito')
    expect(per('s4').parole).toBe('rimandato: criterio rosso')
    expect(per('s5').parole).toBe('rimandato: conflitto')
    expect(per('s4').colore).toBe('rosso')
  })

  it('i «finito» già uniti restano pochi; i rimandati restano tutti', () => {
    expect(schede.filter((s) => s.stato === 'finito')).toHaveLength(FINITI_VISIBILI)
    expect(schede.filter((s) => s.stato === 'rimandato')).toHaveLength(2)
  })

  it('ordinati per stato, e mai un altro workspace', () => {
    const ordine = schede.map((s) => s.stato)
    const primo = (st: string): number => ordine.indexOf(st as never)
    expect(primo('lavora')).toBeLessThan(primo('invio'))
    expect(primo('invio')).toBeLessThan(primo('in-prova'))
    expect(primo('in-prova')).toBeLessThan(primo('in-fila'))
    expect(primo('in-fila')).toBeLessThan(primo('rimandato'))
    expect(primo('rimandato')).toBeLessThan(primo('finito'))
    expect(schede.map((s) => s.id)).not.toContain('a6')
    expect(schede.map((s) => s.id)).not.toContain('s9')
  })

  it('«Ferma» solo dove si può: non per l’invio dati né per la fila', () => {
    expect(per('a1').puoFermare).toBe(true)
    expect(per('a4').puoFermare).toBe(false)
    expect(per('f1').puoFermare).toBe(false)
  })

  it('una chat compare solo se lavora o se è tenuta aperta', () => {
    const conChat: VistaAttesa = { ...vuota, alLavoro: [{ posto: 1, id: 'c1', workspace: WS, descrizione: 'chat', tipo: 'Revisione', dal: iso(3), chat: true }] }
    expect(schedeAgenti(conChat, RIF, ORA).map((s) => s.id)).toEqual(['c1'])
    expect(schedeAgenti(conChat, RIF, ORA, new Set()).map((s) => s.id)).toEqual([])
  })
})

describe('contatori, per PC e file', () => {
  const schede = schedeAgenti(vista, RIF, ORA)

  it('token del workspace: totale e di oggi, mai di un altro workspace', () => {
    expect(contatoriToken(vista, RIF)).toEqual({ totali: 500_000, oggi: 40_000 })
    expect(contatoriToken(vuota, RIF)).toEqual({ totali: 0, oggi: 0 })
  })

  it('i numeri in parole corte', () => {
    expect(testoToken(0)).toBe('0')
    expect(testoToken(850)).toBe('850')
    expect(testoToken(1_200)).toBe('1,2 mila')
    expect(testoToken(12_000)).toBe('12 mila')
    expect(testoToken(2_500_000)).toBe('2,5 mln')
  })

  it('consumo per PC: solo chi lavora, il maggiore prima', () => {
    const r = consumoPerPc(schede)
    expect(r.map((p) => p.pc)).toEqual(['questo PC', 'PC-DUE'])
    expect(r.find((p) => p.pc === 'PC-DUE')).toEqual({ pc: 'PC-DUE', agenti: 2, token: 3_500 })
    expect(r.find((p) => p.pc === 'questo PC')).toEqual({ pc: 'questo PC', agenti: 2, token: 12_000 })
  })

  it('i file in modifica, con chi li tocca (senza doppioni)', () => {
    const f = fileInModifica(schede)
    expect(f.righe.map((x) => x.file)).toEqual(['src/a.ts', 'src/b.ts'])
    expect(f.righe[0]!.chi).toEqual(['k-1', 'Collaudo'])
    expect(f.altri).toBe(1)
  })

  it('agenti al lavoro: quelli che lavorano o inviano', () => {
    expect(contaAlLavoro(schede)).toBe(4)
  })
})

describe('le unioni', () => {
  it('la fila (quella in corso per prima) e gli esiti', () => {
    expect(filaUnioni(vista, RIF).map((u) => [u.id, u.inCorso, u.posizione])).toEqual([['u1', true, 1], ['u2', false, 2]])
    expect(esitiRecenti(vista, RIF).map((e) => [e.titolo, e.verde])).toEqual([['Rosso', false], ['Verde', true]])
  })
})

describe('nessuno al lavoro', () => {
  it('la lista è vuota e c’è la frase', () => {
    expect(schedeAgenti(vuota, RIF, ORA)).toEqual([])
    expect(contaAlLavoro([])).toBe(0)
    expect(FRASE_NESSUNO).toBe('Nessun agente al lavoro adesso.')
  })
})

describe('nel sorgente', () => {
  const comp = readFileSync('src/renderer/components/PannelloAgenti.tsx', 'utf8')
  const app = readFileSync('src/renderer/App.tsx', 'utf8')
  const pan = readFileSync('src/renderer/components/WorkspacePanoramica.tsx', 'utf8')
  const remoto = readFileSync('src/renderer/components/AutopilotaRemotoScelto.tsx', 'utf8')
  const css = readFileSync('src/renderer/console.css', 'utf8')

  it('il pannello mostra la frase, i contatori, i file, le unioni e «Ferma» con conferma', () => {
    expect(comp).toContain('{FRASE_NESSUNO}')
    expect(comp).toContain('contatoriToken')
    expect(comp).toContain('consumoPerPc')
    expect(comp).toContain('fileInModifica')
    expect(comp).toContain('filaUnioni')
    expect(comp).toContain('TESTO_FERMA.si')
    expect(comp).toContain('window.gestore.autopilota.fermaSpecialista(id)')
  })

  it('un workspace di un altro PC si legge dalla sua sorgente, in sola lettura', () => {
    expect(comp).toContain('useSorgente()')
    expect(comp).toContain('soloLettura={remoto !== undefined}')
    expect(remoto).toContain('sorgenteRemota(pcId, pcNome)')
  })

  it('c’è in ogni vista del workspace con autopilota: Panoramica e colonna di destra, anche remoto', () => {
    expect(pan).toContain('autopilota !== undefined || remoto !== undefined ? <PannelloAgenti')
    expect(app).toContain('(autopilotaVisto !== undefined || remotoDelWorkspace !== undefined) && !(vistaElenco !== undefined && linguetta === PANORAMICA)')
    expect(app).toContain('<PannelloAgenti riferimenti=')
    expect(app).not.toContain('<ChatSpecialisti')
  })

  it('un colore fisso per ogni stato nello stile', () => {
    for (const c of ['verde', 'viola', 'blu', 'ambra', 'rosso', 'grigio']) expect(css).toContain(`.agenti-st--${c}`)
  })

  it('la spiegazione lunga sta dietro il «?»', () => {
    expect(comp).toContain('<Aiuto di="gli agenti">{SPIEGA_PANNELLO}</Aiuto>')
    expect(comp).toContain('<Aiuto di="i token">{SPIEGA_TOKEN}</Aiuto>')
    expect(SPIEGA_PANNELLO).toContain('invio dati - fine lavori')
  })

  it('i dati veri non ci sono nel codice', () => {
    expect(comp + readFileSync('src/renderer/pannello-agenti-vista.ts', 'utf8')).not.toMatch(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}|C:\\Users/)
  })
})
