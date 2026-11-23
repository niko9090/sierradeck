import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import type { VistaAttesa } from '../../src/shared/attesa-specialisti'
import {
  agentiAlLavoro, delWorkspace, dopoFinito, esitiRecenti, filaUnioni, testoDurata, testoFile, testoPc, SPIEGA_PANNELLO
} from '../../src/renderer/pannello-agenti-vista'

/**
 * k-176a (r-176): il pannello degli agenti. Nei test non c'è DOM: si provano le
 * funzioni pure e, dove serve, il sorgente. Niente dati veri: nomi inventati.
 */
const ORA = Date.parse('2026-11-22T12:00:00Z')
const iso = (minFa: number): string => new Date(ORA - minFa * 60_000).toISOString()
const WS = 'cartella:C:/Prova/Uno'

const vista: VistaAttesa = {
  posti: { usati: 3, tetto: 4 },
  alLavoro: [
    { posto: 1, id: 'a1', workspace: WS, compito: 'k-1', descrizione: 'k-1: rifai la tabella', titolo: 'Rifai la tabella', tipo: 'Interfaccia', dal: iso(12), cosaFa: 'Modifica Tabella.tsx',
      pannello: { pc: { questoPc: true }, file: ['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/d.ts'], fileAltri: 2, azione: { titolo: 'Rifai la tabella', ultima: 'Edit Tabella.tsx' }, durataMs: 12 * 60_000 } },
    { posto: 2, id: 'a2', workspace: 'C:\\Prova\\Uno', descrizione: 'prova', tipo: 'Collaudo', dal: iso(130), suPc: 'PC-DUE', pannello: { pc: { questoPc: false, nome: 'PC-DUE' }, file: [], azione: { titolo: 'prova' }, invio: 'invio' } },
    { posto: 3, id: 'a3', workspace: 'C:\\Prova\\Altro', descrizione: 'altrove', tipo: 'Sviluppo', dal: iso(5) },
    { posto: 4, id: 'a4', workspace: WS, descrizione: 'in arrivo', tipo: 'Sviluppo', dal: iso(1), fase: 'in-arrivo' },
    { posto: 5, id: 'c1', workspace: WS, descrizione: 'chat', tipo: 'Revisione', dal: iso(3), chat: true },
    { posto: 6, id: 'a6', workspace: WS, descrizione: 'ospite', tipo: 'Sviluppo', dal: iso(3), perPc: 'PC-TRE' },
    { posto: 7, id: 'a7', workspace: WS, descrizione: 'fermata', tipo: 'Sviluppo', dal: iso(3), fermaRichiesta: true }
  ],
  inFila: [{ id: 'f1', posizione: 1, workspace: WS, descrizione: 'in fila', tipo: 'Sviluppo', dal: iso(1), priorita: 0, prenotata: false }],
  inUnione: [
    { id: 'u2', workspace: WS, workspaceNome: 'Uno', titolo: 'Seconda', inCorso: false, posizione: 2 },
    { id: 'u1', workspace: WS, workspaceNome: 'Uno', titolo: 'Prima', inCorso: true, posizione: 1 },
    { id: 'u9', workspace: 'C:\\Prova\\Altro', workspaceNome: 'Altro', titolo: 'Di altri', inCorso: false, posizione: 3 }
  ],
  esitiUnioni: {
    [WS]: [
      { id: 'e1', titolo: 'Verde', esito: 'verde', verde: true, quando: iso(10) },
      { id: 'e2', titolo: 'Rosso', esito: 'rosso', verde: false, comando: 'npm run typecheck', quando: iso(2) }
    ],
    'C:\\Prova\\Altro': [{ id: 'e3', titolo: 'Altrui', esito: 'verde', verde: true, quando: iso(1) }]
  },
  dopoLavoro: [
    { id: 's1', workspace: WS, titolo: 'Uno', durataMs: 90 * 60_000, stato: 'in-fila', parole: 'x' },
    { id: 's2', workspace: WS, titolo: 'Due', stato: 'in-unione', parole: 'x' },
    { id: 's3', workspace: WS, titolo: 'Tre', stato: 'unito', parole: 'x' },
    { id: 's4', workspace: WS, titolo: 'Quattro', stato: 'criterio-rosso', parole: 'x' },
    { id: 's5', workspace: WS, titolo: 'Cinque', stato: 'conflitto', parole: 'x' },
    { id: 's6', workspace: 'C:\\Prova\\Altro', titolo: 'Sei', stato: 'unito', parole: 'x' }
  ]
}
const RIF = [WS, 'C:\\Prova\\Uno']

describe('solo gli agenti al lavoro', () => {
  const righe = agentiAlLavoro(vista, RIF, ORA)

  it('niente fila, niente in arrivo, niente altri workspace', () => {
    expect(righe.map((r) => r.id)).toEqual(['a1', 'a2', 'c1', 'a6', 'a7'])
  })

  it('una chat compare solo se è aperta a parte', () => {
    expect(agentiAlLavoro(vista, RIF, ORA, new Set()).map((r) => r.id)).not.toContain('c1')
    expect(agentiAlLavoro(vista, RIF, ORA, new Set(['c1'])).map((r) => r.id)).toContain('c1')
  })

  it('senza riferimenti si vedono tutti i workspace', () => {
    expect(agentiAlLavoro(vista, [], ORA).map((r) => r.id)).toContain('a3')
    expect(delWorkspace('C:\\Prova\\Uno\\', RIF)).toBe(true)
    expect(delWorkspace('C:\\Prova\\Altro', RIF)).toBe(false)
  })

  it('per ognuno: ruolo, compito, file, PC, durata, ultima azione', () => {
    const a = righe[0]!
    expect(a.ruolo).toBe('Interfaccia')
    expect(a.compito).toBe('k-1')
    expect(a.titolo).toBe('Rifai la tabella')
    expect(a.pc).toBe('questo PC')
    expect(a.durata).toBe('12 min')
    expect(a.adesso).toBe('Edit Tabella.tsx')
    expect(testoFile(a.file, a.fileAltri)).toBe('src/a.ts, src/b.ts, src/c.ts + 3 altri')
    const b = righe[1]!
    expect(b.pc).toBe('su PC-DUE')
    expect(b.invio).toBe(true)
    expect(b.durata).toBe('2 h 10 min')
  })

  it('«Ferma» solo dove la parte del programma sa fermare', () => {
    const per = Object.fromEntries(righe.map((r) => [r.id, r.puoFermare]))
    expect(per).toEqual({ a1: true, a2: true, c1: false, a6: false, a7: false })
    expect(righe.find((r) => r.id === 'a7')!.fermaRichiesta).toBe(true)
  })

  it('il PC: questo, un altro, o ospitato; mai il nome di questo PC', () => {
    expect(testoPc({})).toBe('questo PC')
    expect(testoPc({ suPc: 'X' })).toBe('su X')
    expect(testoPc({ perPc: 'Y' })).toBe('qui, per Y')
  })

  it('durata e file in parole corte', () => {
    expect(testoDurata(undefined)).toBe('')
    expect(testoDurata(10_000)).toBe('meno di 1 min')
    expect(testoDurata(60 * 60_000)).toBe('1 h')
    expect(testoFile([], 0)).toBe('')
  })
})

describe('Unioni', () => {
  it('la fila: quella in corso per prima, poi le successive; solo del workspace', () => {
    const f = filaUnioni(vista, RIF)
    expect(f.map((u) => u.id)).toEqual(['u1', 'u2'])
    expect(f.map((u) => u.posizione)).toEqual([1, 2])
    expect(f[0]!.parole).toBe('in prova adesso')
    expect(f[1]!.parole).toBe('aspetta il suo turno')
  })

  it('gli esiti: il più recente prima, verde o rosso', () => {
    const e = esitiRecenti(vista, RIF)
    expect(e.map((x) => x.titolo)).toEqual(['Rosso', 'Verde'])
    expect(e.map((x) => x.verde)).toEqual([false, true])
    expect(e[0]!.comando).toBe('npm run typecheck')
    expect(esitiRecenti(vista, RIF, 1)).toHaveLength(1)
  })

  it('senza dati: liste vuote', () => {
    const v: VistaAttesa = { posti: { usati: 0, tetto: 4 }, alLavoro: [], inFila: [] }
    expect(filaUnioni(v, RIF)).toEqual([])
    expect(esitiRecenti(v, RIF)).toEqual([])
    expect(dopoFinito(v, RIF)).toEqual([])
  })
})

describe('dopo «finito»', () => {
  const d = dopoFinito(vista, RIF)
  it('cinque stati, con parole e colori', () => {
    expect(d.map((x) => [x.parole, x.colore])).toEqual([
      ['in fila per l’unione', 'ambra'],
      ['in prova', 'ambra'],
      ['unito', 'verde'],
      ['rimandato indietro: criterio rosso', 'rosso'],
      ['rimandato indietro: conflitto', 'rosso']
    ])
  })
  it('la durata c’è se si sa', () => {
    expect(d[0]!.durata).toBe('1 h 30 min')
    expect(d[1]!.durata).toBe('')
  })
})

describe('nel sorgente', () => {
  const comp = readFileSync('src/renderer/components/PannelloAgenti.tsx', 'utf8')
  const pannello = readFileSync('src/renderer/components/PannelloAutopiloti.tsx', 'utf8')

  it('«Ferma» usa la funzione già unita, non ne rifà una', () => {
    expect(comp).toContain('window.gestore.autopilota.fermaSpecialista(id)')
    expect(comp).toContain('onConfermaFerma')
  })
  it('la scheda Specialisti mostra il pannello nuovo', () => {
    expect(pannello).toContain('<PannelloAgenti ')
    expect(pannello).not.toContain('<SpecialistiVista ')
  })
  it('la spiegazione sta dietro il «?», non in un paragrafo fisso', () => {
    expect(comp).toContain('<Aiuto di="gli agenti">{SPIEGA_PANNELLO}</Aiuto>')
    expect(comp).toContain('<Aiuto di="le unioni">{SPIEGA_UNIONI}</Aiuto>')
    expect(SPIEGA_PANNELLO.length).toBeGreaterThan(100)
    expect(comp).not.toContain('Una chat compare solo')
  })
  it('i dati veri non ci sono nel codice', () => {
    expect(comp + readFileSync('src/renderer/pannello-agenti-vista.ts', 'utf8')).not.toMatch(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}|C:\\Users/)
  })
})
