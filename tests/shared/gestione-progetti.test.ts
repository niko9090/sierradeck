import { describe, expect, it } from 'vitest'
import { controllaNomeNuovo, costruisciGestione, TESTI_AZIONI, type IngressoGestione } from '../../src/shared/gestione-progetti'
import { collega, collegamentiVuoti, scollega } from '../../src/shared/progetti-identita'

/** La vista di Gestione progetti: una riga per progetto (per chiave), con copie, workspace e problemi. */
const base = (extra: Partial<IngressoGestione> = {}): IngressoGestione => ({
  io: { id: 'A', nome: 'Primo' },
  pc: [{ id: 'B', nome: 'Secondo', acceso: true }, { id: 'C', nome: 'Terzo', acceso: false }],
  progetti: [],
  locali: {},
  copieQui: [],
  esisteQui: () => true,
  workspaceQui: [],
  collegamenti: collegamentiVuoti(),
  adesso: Date.parse('2026-11-13T10:00:00Z'),
  ...extra
})

describe('costruisciGestione', () => {
  it('un progetto in ordine: una riga, nessun problema', () => {
    const v = costruisciGestione(base({
      progetti: [{ id: 'p1', nome: 'Sito', proprietario: 'A', percorso: 'C:\\P\\Sito' }],
      workspaceQui: ['Sito']
    }))
    expect(v.righe).toHaveLength(1)
    expect(v.righe[0]).toMatchObject({ id: 'p1', nome: 'Sito', nomeCartella: 'Sito', cartellaQui: true, proprietario: { pc: 'A', qui: true } })
    expect(v.righe[0]?.problemi).toEqual([])
    expect(v.righe[0]?.workspace).toEqual([expect.objectContaining({ nome: 'Sito', qui: true, nomeDiverso: false })])
    expect(v.workspaceSoli).toEqual([])
  })

  it('doppioni su PC diversi: una riga sola, «proprietari-diversi», il principale è quello con la cartella qui', () => {
    const v = costruisciGestione(base({
      progetti: [
        { id: 'b1', nome: 'sito', proprietario: 'B', percorso: 'D:\\Sito', aggiuntoIl: '2026-09-01' },
        { id: 'a1', nome: 'Sito', proprietario: 'A', percorso: 'C:\\Sito', aggiuntoIl: '2026-10-01' }
      ],
      workspaceQui: ['Sito']
    }))
    expect(v.righe).toHaveLength(1)
    const r = v.righe[0]
    expect(r?.id).toBe('a1')
    expect(r?.ids).toEqual(['a1', 'b1'])
    expect(r?.problemi.map((x) => x.tipo)).toContain('proprietari-diversi')
    expect(r?.candidatiProprietario.map((c) => c.pc)).toEqual(['A', 'B'])
  })

  it('doppioni sullo stesso PC: «doppioni»', () => {
    const v = costruisciGestione(base({
      progetti: [{ id: 'x', nome: 'Sito', proprietario: 'A', percorso: 'C:\\Sito' }, { id: 'y', nome: 'SITO', proprietario: 'A', percorso: 'E:\\Sito' }],
      workspaceQui: ['Sito']
    }))
    expect(v.righe[0]?.problemi.map((x) => x.tipo)).toContain('doppioni')
    // Il doppione con la cartella qui è una copia rimasta.
    expect(v.righe[0]?.copie.map((c) => c.percorso)).toEqual(['E:\\Sito'])
  })

  it('cartella mancante, senza workspace, proprietario sconosciuto, senza proprietario', () => {
    const v = costruisciGestione(base({
      progetti: [
        { id: 'm', nome: 'Manca', proprietario: 'A', percorso: 'C:\\Manca' },
        { id: 's', nome: 'Strano', proprietario: 'ZZZZZZZZ', percorso: 'C:\\Strano' },
        { id: 'n', nome: 'Nessuno' }
      ],
      esisteQui: (x) => !x.includes('Manca')
    }))
    const tipi = (nome: string): string[] => v.righe.find((r) => r.nome === nome)?.problemi.map((x) => x.tipo) ?? []
    expect(tipi('Manca')).toEqual(expect.arrayContaining(['cartella-mancante', 'senza-workspace']))
    expect(tipi('Strano')).toEqual(['proprietario-sconosciuto'])
    expect(tipi('Nessuno')).toEqual(['senza-proprietario'])
  })

  it('le copie rimaste dagli altri PC e da qui, una volta sola; la cartella del proprietario non è una copia', () => {
    const v = costruisciGestione(base({
      progetti: [{ id: 'p', nome: 'Sito', proprietario: 'B', percorso: 'D:\\Sito' }],
      locali: {
        B: { progetti: [{ id: 'p', percorso: 'D:\\Sito' }], copie: [{ id: 'p', percorso: 'D:\\Sito' }] },
        C: { copie: [{ id: 'p', percorso: 'C:\\Vecchio\\Sito' }, { id: 'p', percorso: 'c:\\vecchio\\sito' }] }
      },
      copieQui: [{ id: 'p', percorso: 'C:\\Sito' }]
    }))
    const r = v.righe[0]
    expect(r?.copie.map((c) => `${c.pc}:${c.percorso}`)).toEqual(['A:C:\\Sito', 'C:C:\\Vecchio\\Sito'])
    expect(r?.problemi.find((x) => x.tipo === 'copia-rimasta')?.testo).toContain('2 copie rimaste')
    expect(r?.proprietario).toMatchObject({ pc: 'B', qui: false, acceso: true })
  })

  it('i workspace di tutti i PC, con il nome diverso dalla cartella segnalato', () => {
    let c = collegamentiVuoti()
    c = collega(c, 'Vecchio nome', { id: 'p', nome: 'Sito' })
    const v = costruisciGestione(base({
      progetti: [{ id: 'p', nome: 'Sito', proprietario: 'A', percorso: 'C:\\Sito' }],
      workspaceQui: ['Vecchio nome'],
      collegamenti: c,
      locali: { B: { workspace: [{ nome: 'Sito', progetto: 'p' }, { nome: 'Altro' }] } }
    }))
    const r = v.righe[0]
    expect(r?.workspace).toEqual([
      expect.objectContaining({ nome: 'Vecchio nome', qui: true, collegato: true, nomeDiverso: true }),
      expect.objectContaining({ nome: 'Sito', pc: 'B', pcNome: 'Secondo', qui: false, nomeDiverso: false })
    ])
    expect(r?.problemi.map((x) => x.tipo)).toEqual(['nome-diverso'])
  })

  it('i workspace senza progetto, col motivo; i progetti da sistemare vengono prima', () => {
    const c = scollega(collegamentiVuoti(), 'Staccato')
    const v = costruisciGestione(base({
      progetti: [{ id: 'z', nome: 'Zeta', proprietario: 'A', percorso: 'C:\\Zeta' }, { id: 'b', nome: 'Beta', proprietario: 'A', percorso: 'C:\\Manca' }],
      workspaceQui: ['Zeta', 'Staccato', 'Libero'],
      collegamenti: c,
      esisteQui: (x) => !x.includes('Manca')
    }))
    expect(v.righe.map((r) => r.nome)).toEqual(['Beta', 'Zeta'])
    expect(v.workspaceSoli).toEqual([{ nome: 'Staccato', perche: 'scollegato' }, { nome: 'Libero', perche: 'nessuno' }])
  })

  it('le collisioni della sistemazione dei nomi finiscono sulla riga del workspace', () => {
    const v = costruisciGestione(base({
      progetti: [{ id: 'p', nome: 'Sito', proprietario: 'A', percorso: 'C:\\Sito' }],
      workspaceQui: ['Sito'],
      migrazione: { fattaIl: 'x', rinominati: [], collisioni: [{ workspace: ['Sito'], nome: 'Sito', perche: 'prova' }] }
    }))
    expect(v.righe[0]?.problemi.map((x) => x.tipo)).toContain('collisione')
  })

  it('ultimo uso e spazio sul Drive sommati sui doppioni; le richieste del progetto', () => {
    const v = costruisciGestione(base({
      progetti: [{ id: 'a', nome: 'Sito', proprietario: 'A', percorso: 'C:\\Sito' }, { id: 'b', nome: 'sito', proprietario: 'B', percorso: 'D:\\Sito' }],
      workspaceQui: ['Sito'],
      ultimoUso: { a: '2026-11-01', b: '2026-11-10' },
      spazioDrive: { a: { file: 2, byte: 10 }, b: { file: 3, byte: 5 } },
      richieste: [{ id: 'r', tipo: 'progetto-rinomina', progetto: 'b', nome: 'Sito', pc: 'B', pcNome: 'Secondo', stato: 'attesa', quando: 'x' }]
    }))
    expect(v.righe[0]).toMatchObject({ ultimoUso: '2026-11-10', spazioDrive: { file: 5, byte: 15 } })
    expect(v.righe[0]?.richieste).toHaveLength(1)
  })
})

describe('controllaNomeNuovo', () => {
  const progetti = [{ id: 'a', nome: 'Sito' }, { id: 'b', nome: 'Altro' }]
  const riga = { ids: ['a'], chiave: 'sito' }
  it('mai la chiave di un altro progetto', () => {
    expect(controllaNomeNuovo('ALTRO', riga, progetti, [], [])).toContain('C’è già un progetto «Altro»')
  })
  it('mai il nome di un altro workspace di qui; quello del progetto stesso va bene', () => {
    expect(controllaNomeNuovo('Nuovo', riga, progetti, ['nuovo'], [])).toContain('C’è già un workspace «nuovo»')
    expect(controllaNomeNuovo('Sito', riga, progetti, ['Sito'], ['Sito'])).toBeUndefined()
  })
})

describe('TESTI_AZIONI', () => {
  it('titoli corti, spiegazione dietro il «?», le azioni che tolgono qualcosa segnate', () => {
    for (const t of Object.values(TESTI_AZIONI)) {
      expect(t.titolo.length).toBeLessThanOrEqual(25)
      expect(t.spiega.length).toBeGreaterThan(10)
    }
    expect(TESTI_AZIONI['elimina-ovunque'].distruttiva).toBe(true)
    expect(TESTI_AZIONI['apri'].distruttiva).toBeUndefined()
  })
})
