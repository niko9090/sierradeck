import { describe, it, expect } from 'vitest'
import { gruppiValidi, filtraAltriPc, riassuntoAltriPc, statoPcBreve } from '../../src/shared/workspace-remoti'
import { alberoRete } from '../../src/shared/albero-rete'
import { adessoDi } from '../../src/shared/adesso'
import type { BattitoPc } from '../../src/shared/posta'

/**
 * 19/11, PC-Fisso: «[renderer] errore di render — TypeError: Cannot read
 * properties of undefined (reading 'length')». Pila non trovata: si rendono
 * robusti i punti che leggono `.length` su dati da fuori toccati dalla 0.110
 * (gruppi di «Altri PC» via IPC, battiti degli altri PC).
 * L'altro caso (`chats` mancante in `adessoDi`) è della 0.107.1: qui si prova che regge.
 */
describe('Altri PC: la risposta del ponte mancante o incompleta', () => {
  it('risposta undefined / non un elenco: nessun gruppo, niente crash', () => {
    expect(gruppiValidi(undefined)).toEqual([])
    expect(gruppiValidi(null)).toEqual([])
    expect(gruppiValidi({})).toEqual([])
  })
  it('gruppo senza voci o senza frase (dato di un’altra versione): si completa', () => {
    const g = gruppiValidi([{ pcId: 'pc-a', nome: 'Fisso', vivo: true }, { nome: 'senza id' }, 'x', null])
    expect(g).toHaveLength(1)
    expect(g[0]?.voci).toEqual([])
    expect(g[0]?.frase).toBe('acceso')
    expect(() => filtraAltriPc(g, 'fis')).not.toThrow()
    expect(() => filtraAltriPc(g, '')).not.toThrow()
    expect(riassuntoAltriPc(g, 'x').totale).toBe(1)
    expect(statoPcBreve(g[0]!)).toBe('acceso')
  })
  it('voci non valide si scartano', () => {
    const g = gruppiValidi([{ pcId: 'pc-a', nome: 'Fisso', vivo: false, frase: 'spento da 3 ore', voci: [{ nome: 'W', aperto: false, davanti: false }, null, { aperto: true }] }])
    expect(g[0]?.voci).toHaveLength(1)
    expect(g[0]?.frase).toBe('spento da 3 ore')
  })
})

describe('albero della rete: battito senza chat', () => {
  it('un PC il cui battito non ha `chat` non fa cadere l’albero', () => {
    const adesso = Date.parse('2026-11-19T20:00:00Z')
    const b = { pcId: 'pc-b', nome: 'Fisso', versione: '0.109.0', battito: '2026-11-19T19:59:00Z', cartelle: [] } as unknown as BattitoPc
    const a = alberoRete({ io: { id: 'io', nome: 'Qui', versione: '0.110.0' }, pc: [b], adesso })
    const riga = a.rami.flatMap((g) => g.nodi).flatMap((n) => n.righe).find((r) => r.etichetta === 'Chat')
    expect(riga?.valore).toBe('0 aperte')
  })
})

describe('adessoDi senza chats (0.107.1): regge ancora', () => {
  it('autopilota senza `chats`', () => {
    expect(() => adessoDi({ stato: 'lavoro' } as never, Date.now())).not.toThrow()
  })
})
