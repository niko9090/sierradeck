import { describe, it, expect } from 'vitest'
import { datiPannello } from '../../src/main/pannello-drive-dati'
import type { Manifesto } from '../../src/main/cassaforte/incrementale'

// 0.58.0, tappa 1: le fonti del pannello messe insieme. Dati d'esempio.
const ORA = Date.parse('2026-10-10T18:00:00Z')
const voce = (pc: string, mtime: number) => ({ nome: 'x', size: 10, mtime, pc })

describe('le fonti del pannello delle chat del Drive', () => {
  const manifesto: Manifesto = {
    versione: 1, creatoIl: '',
    file: {
      // La stessa chat caricata dal portatile sotto due cartelle: conta una volta, la più recente.
      'chat/C--Progetti-Esempio/s-uno.jsonl': voce('pc-port', 100),
      'chat/D--Altro-Esempio/s-uno.jsonl': voce('pc-port', 300),
      'chat/C--Progetti-Esempio/s-due.jsonl': voce('pc-port', 200),
      'chat/C--Progetti-Esempio/s-uno/sub.jsonl': voce('pc-port', 999),
      'file/progetto-x/LEGGIMI.md': voce('pc-port', 1)
    }
  }
  const p = datiPannello({
    io: { id: 'pc-qui', nome: 'PC-ESEMPIO' },
    pc: [{ id: 'pc-port', nome: 'PORTATILE-ESEMPIO', battito: new Date(ORA).toISOString(), chat: [{ sessione: 's-due', titolo: 'Seconda', cwd: 'C:\\Progetti\\Esempio' }] }],
    case: { versione: 1, case: { 's-uno': { pc: 'pc-port', pcNome: 'PORTATILE-ESEMPIO', motivo: 'scelta', decisaIl: '2026-10-01T00:00:00Z', da: 'nicholas' } } },
    locali: [{ sessione: 's-uno', titolo: 'Prima', cwd: 'C:\\Progetti\\Esempio\\sotto', mtime: 50 }],
    manifesto,
    aperteQui: ['s-uno'],
    titoliNoti: [],
    progetti: [{ id: 'prog-1', nome: 'Esempio', percorsi: { 'pc-port': 'C:\\Progetti\\Esempio' } }],
    adesso: ORA
  })
  const r = (s: string) => p.chat.find((x) => x.sessione === s)!

  it('le copie: quella di qui e una sola per PC sul Drive (la più recente); i file non sono chat', () => {
    expect(p.chat.map((x) => x.sessione).sort()).toEqual(['s-due', 's-uno'])
    expect(r('s-uno').copie.map((c) => `${c.nome}:${c.dove}`).sort()).toEqual(['PC-ESEMPIO:qui', 'PORTATILE-ESEMPIO:drive'])
    expect(r('s-uno').ultimoUso).toBe(new Date(300).toISOString())
  })

  it('aperta qui ma con casa sul portatile: due case', () => {
    expect(r('s-uno').problemi.map((x) => x.tipo)).toContain('due-case')
  })

  it('il titolo dal battito, la cartella dallo slug, il progetto dalla cartella su qualunque PC', () => {
    expect(r('s-due').titolo).toBe('Seconda')
    expect(r('s-due').problemi.map((x) => x.tipo)).toEqual(['senza-casa'])
    expect(r('s-uno').progetto).toBe('prog-1')
    expect(p.progetti[0]?.chat).toBe(2)
  })
})

describe('le copie locali dal battito (0.58.0, tappa 2)', () => {
  const base = {
    io: { id: 'pc-qui', nome: 'PC-ESEMPIO' },
    case: { versione: 1 as const, case: {} },
    locali: [], manifesto: undefined, aperteQui: [], titoliNoti: [], progetti: [], adesso: Date.parse('2026-10-10T18:00:00Z')
  }
  it('un PC nuovo dice le sue copie sul disco; uno vecchio no, e va aggiornato', () => {
    const p = datiPannello({
      ...base,
      pc: [
        { id: 'pc-port', nome: 'PORTATILE-ESEMPIO', locali: { chat: [{ sessione: 's-1', cwd: 'D:\\Lavoro', mtime: 5 }, { nonValida: true }], progetti: [] } },
        { id: 'pc-vecchio', nome: 'PC-VECCHIO' }
      ]
    })
    expect(p.chat[0]?.copie).toEqual([{ pc: 'pc-port', nome: 'PORTATILE-ESEMPIO', dove: 'disco', quando: new Date(5).toISOString() }])
    expect(p.pcDaAggiornare).toEqual(['PC-VECCHIO'])
    expect(p.pc.find((x) => x.id === 'pc-port')?.diceLocali).toBe(true)
  })
  it('un battito vecchio o rovinato non rompe niente', () => {
    const p = datiPannello({ ...base, pc: [{ id: 'pc-x', nome: 'PC-X', locali: 'rotto' }, { id: 'pc-y', nome: 'PC-Y', locali: { chat: 'no' } }] })
    expect(p.chat).toEqual([])
    expect(p.pcDaAggiornare).toEqual(['PC-X', 'PC-Y'])
  })
})
