import { describe, it, expect } from 'vitest'
import { costruisciCatalogo, scelteDiPortaQui, statoDi, cartellaDaSlug } from '../../src/main/cassaforte/catalogo'
import type { Manifesto } from '../../src/main/cassaforte/incrementale'

/**
 * Il catalogo del Drive: cosa c'e' lassu', per progetto, e come sta rispetto a
 * questo PC. Nicholas: «non c'e' una vera sezione dove posso navigare sui
 * progetti presenti nel Drive e importarli».
 */

const manifesto = (file: Record<string, { size: number; mtime: number }>): Manifesto => ({
  versione: 1, creatoIl: 'x',
  file: Object.fromEntries(Object.entries(file).map(([p, f]) => [p, { nome: `f_${p}`, ...f }]))
})

describe('lo stato di una voce', () => {
  it('uguale, indietro, avanti, solo di qua o di la', () => {
    expect(statoDi({ size: 10, mtime: 100 }, { size: 10, mtime: 101 })).toBe('uguale')
    expect(statoDi({ size: 10, mtime: 100 }, { size: 12, mtime: 200 })).toBe('indietro')
    expect(statoDi({ size: 12, mtime: 300 }, { size: 10, mtime: 100 })).toBe('avanti')
    expect(statoDi(undefined, { size: 1, mtime: 1 })).toBe('soloDrive')
    expect(statoDi({ size: 1, mtime: 1 }, undefined)).toBe('soloQui')
  })
  it('lo slug di Claude Code torna un percorso', () => {
    expect(cartellaDaSlug('E--Users-nikof-Documents-SierraDeck')).toBe('E:\\Users\\nikof\\Documents\\SierraDeck')
  })
})

describe('il catalogo per progetto', () => {
  const drive = manifesto({
    'chat/E--Users-tecnico-Documents-Wdeck/u1.jsonl': { size: 100, mtime: 1000 },
    'chat/E--Users-tecnico-Documents-Wdeck/u2.jsonl': { size: 200, mtime: 2000 },
    'chat/E--Users-nikof-Documents-SierraDeck/u3.jsonl': { size: 300, mtime: 3000 },
    'progetto-p1/src/a.ts': { size: 5, mtime: 10 },
    'sierradeck/workspaces.json': { size: 1, mtime: 1 }
  })
  const firmaPc = new Map([
    ['chat/E--Users-nikof-Documents-SierraDeck/u3.jsonl', { size: 300, mtime: 3000 }],
    ['chat/E--Users-nikof-Documents-SierraDeck/u4.jsonl', { size: 50, mtime: 4000 }]
  ])
  const registroDrive = { versione: 1 as const, progetti: [{ id: 'p1', nome: 'Wdeck', percorsi: { PORTATILE: 'E:\\Users\\tecnico\\Documents\\Wdeck' }, aggiuntoIl: '' }] }

  it('raggruppa le chat per cartella, riconosce i progetti del registro e dice lo stato', () => {
    const c = costruisciCatalogo({
      manifestoDrive: drive, firmaPc, registroPc: { versione: 1, progetti: [] }, registroDrive, pcId: 'FISSO',
      cartellaEsiste: (p) => p.startsWith('E:\\Users\\nikof'),
      titoliIndice: new Map([['u3', { titolo: 'Il fisso', cwd: 'E:\\Users\\nikof\\Documents\\SierraDeck', quando: '2026-09-09T10:00:00.000Z', messaggi: 12 }]]),
      adesso: 'T'
    })
    expect(c.progetti.map((g) => g.nome).sort()).toEqual(['SierraDeck', 'Wdeck'])
    const w = c.progetti.find((g) => g.nome === 'Wdeck')!
    expect(w.id).toBe('p1')
    expect(w.cartellaSulDrive).toBe(true)
    expect(w.quiEsiste).toBe(false)
    expect(w.origine).toBe('altrove')
    expect(w.chat.map((x) => x.stato)).toEqual(['soloDrive', 'soloDrive'])
    expect(w.file).toMatchObject({ totale: 1, soloDrive: 1 })
    expect(w.stato).toBe('daPortare')
    const s = c.progetti.find((g) => g.nome === 'SierraDeck')!
    expect(s.id).toBeUndefined()
    expect(s.quiEsiste).toBe(true)
    expect(s.chat.find((x) => x.sessione === 'u3')).toMatchObject({ titolo: 'Il fisso', stato: 'uguale', messaggi: 12 })
    expect(s.chat.find((x) => x.sessione === 'u4')?.stato).toBe('soloQui')
    expect(s.stato).toBe('soloQui')
    expect(c.totali).toMatchObject({ progetti: 2, chat: 4, daPortare: 2, soloQui: 1, uguali: 1 })
  })

  it('«porta qui» sceglie le chat che mancano o sono indietro, e i file della cartella se viaggia', () => {
    const c = costruisciCatalogo({
      manifestoDrive: drive, firmaPc, registroPc: { versione: 1, progetti: [] }, registroDrive, pcId: 'FISSO',
      cartellaEsiste: () => false
    })
    const w = c.progetti.find((g) => g.nome === 'Wdeck')!
    expect(scelteDiPortaQui(w, drive, firmaPc)).toEqual({
      'chat/E--Users-tecnico-Documents-Wdeck/u1.jsonl': 'scarica',
      'chat/E--Users-tecnico-Documents-Wdeck/u2.jsonl': 'scarica',
      'progetto-p1/src/a.ts': 'scarica'
    })
    const s = c.progetti.find((g) => g.nome === 'SierraDeck')!
    expect(scelteDiPortaQui(s, drive, firmaPc)).toEqual({})
  })

  it('i workspace che esistono solo sul Drive si vedono', () => {
    const c = costruisciCatalogo({
      manifestoDrive: drive, firmaPc, registroPc: { versione: 1, progetti: [] }, registroDrive, pcId: 'FISSO',
      cartellaEsiste: () => false,
      archivioPc: { attivo: 'casa', workspace: [{ nome: 'casa', perSlot: {} }] },
      archivioDrive: { attivo: 'lavoro', workspace: [{ nome: 'lavoro', perSlot: { '1': { root: undefined, panes: [{ id: 'a', sessionUuid: 'u1', cwd: 'E:\\Users\\tecnico\\Documents\\Wdeck', title: 'A' }, { id: 'b', sessionUuid: 'u2', cwd: 'E:\\Users\\tecnico\\Documents\\Wdeck', title: 'B' }] } } }] }
    } as unknown as Parameters<typeof costruisciCatalogo>[0])
    expect(c.workspaceSoloDrive).toEqual([{ nome: 'lavoro', chat: 2 }])
    expect(c.progetti.find((g) => g.nome === 'Wdeck')?.chat[0]?.workspace).toBe('lavoro')
  })
})

describe('la stessa conversazione sotto due cartelle', () => {
  it('se qui c e gia da una parte, dall altra non e «solo sul Drive» e «porta qui» non la riporta', () => {
    const drive = manifesto({
      'chat/E--Users-tecnico-Documents-Wdeck/u1.jsonl': { size: 100, mtime: 1000 },
      'chat/C--Users-nikof-Documents-Progetti-SierraDeck-Wdeck/u1.jsonl': { size: 100, mtime: 1000 }
    })
    const firmaPc = new Map([['chat/C--Users-nikof-Documents-Progetti-SierraDeck-Wdeck/u1.jsonl', { size: 100, mtime: 1000 }]])
    const c = costruisciCatalogo({
      manifestoDrive: drive, firmaPc, registroPc: { versione: 1, progetti: [] }, registroDrive: { versione: 1, progetti: [] }, pcId: 'FISSO',
      cartellaEsiste: (p) => p.startsWith('C:')
    })
    const altrove = c.progetti.find((g) => g.cartellaOrigine.startsWith('E:'))!
    expect(altrove.chat[0]).toMatchObject({ sessione: 'u1', stato: 'uguale', altroveQui: 'C:\\Users\\nikof\\Documents\\Progetti\\SierraDeck\\Wdeck' })
    expect(altrove.stato).toBe('allineato')
    expect(scelteDiPortaQui(altrove, drive, firmaPc)).toEqual({})
    expect(c.totali.daPortare).toBe(0)
  })
})

describe('i workspace del Drive con le loro chat', () => {
  it('ogni workspace elenca le sue chat con il progetto, e quante mancano qui', () => {
    const drive = manifesto({
      'chat/E--Users-tecnico-Documents-Wdeck/u1.jsonl': { size: 100, mtime: 1000 },
      'chat/E--Users-tecnico-Documents-FLUX/u2.jsonl': { size: 200, mtime: 2000 },
      'chat/E--Users-nikof-Documents-SierraDeck/u3.jsonl': { size: 300, mtime: 3000 }
    })
    const firmaPc = new Map([['chat/E--Users-nikof-Documents-SierraDeck/u3.jsonl', { size: 300, mtime: 3000 }]])
    const pane = (id: string, u: string, cwd: string): { id: string; sessionUuid: string; cwd: string; title: string } => ({ id, sessionUuid: u, cwd, title: u })
    const c = costruisciCatalogo({
      manifestoDrive: drive, firmaPc, registroPc: { versione: 1, progetti: [] }, registroDrive: { versione: 1, progetti: [] }, pcId: 'FISSO',
      cartellaEsiste: (p: string) => p.startsWith('E:\\Users\\nikof'),
      archivioPc: { attivo: 'casa', workspace: [{ nome: 'casa', perSlot: { '1': { root: undefined, panes: [pane('c', 'u3', 'E:\\Users\\nikof\\Documents\\SierraDeck')] } } }] },
      archivioDrive: { attivo: 'lavoro', workspace: [
        { nome: 'lavoro', perSlot: { '1': { root: undefined, panes: [pane('a', 'u1', 'E:\\Users\\tecnico\\Documents\\Wdeck'), pane('b', 'u2', 'E:\\Users\\tecnico\\Documents\\FLUX')] } } },
        { nome: 'casa', perSlot: { '1': { root: undefined, panes: [pane('c', 'u3', 'E:\\Users\\nikof\\Documents\\SierraDeck')] } } }
      ] }
    } as unknown as Parameters<typeof costruisciCatalogo>[0])
    expect(c.workspace.map((w) => w.nome)).toEqual(['lavoro', 'casa'])
    const lavoro = c.workspace[0]!
    expect(lavoro.quiEsiste).toBe(false)
    expect(lavoro.daPortare).toBe(2)
    expect(lavoro.progetti.length).toBe(2)
    expect(lavoro.chat.map((x) => x.progetto).sort()).toEqual(['FLUX', 'Wdeck'])
    const casa = c.workspace[1]!
    expect(casa.quiEsiste).toBe(true)
    expect(casa.daPortare).toBe(0)
    // «Porta qui il workspace» prende solo le chat di quel workspace, progetto per progetto.
    const wdeck = c.progetti.find((g) => g.nome === 'Wdeck')!
    expect(scelteDiPortaQui(wdeck, drive, firmaPc, new Set(lavoro.chat.map((x) => x.sessione)))).toEqual({ 'chat/E--Users-tecnico-Documents-Wdeck/u1.jsonl': 'scarica' })
    expect(scelteDiPortaQui(wdeck, drive, firmaPc, new Set(['nessuna']))).toEqual({})
  })
})
