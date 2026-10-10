import { describe, it, expect } from 'vitest'
import { costruisciPannello, filtraChat, filtraProgetti, testiCambioResidente, ASSENTE_DOPO_MS, type ChatIngresso } from '../../src/shared/pannello-drive'
import type { CaseChat, CasaChat } from '../../src/shared/una-casa'

// 0.58.0, tappa 1: le regole delle assegnazioni sbagliate. Nomi e id d'esempio.
const ORA = Date.parse('2026-10-10T18:00:00Z')
const IO = { id: 'pc-qui', nome: 'PC-ESEMPIO', battito: new Date(ORA).toISOString() }
const PORTATILE = { id: 'pc-port', nome: 'PORTATILE-ESEMPIO', battito: new Date(ORA - 60_000).toISOString() }
const VECCHIO = { id: 'pc-vecchio', nome: 'PC-VECCHIO', battito: new Date(ORA - ASSENTE_DOPO_MS - 86_400_000).toISOString() }
const casa = (pc: string, pcNome: string, decisaIl = '2026-10-01T10:00:00Z'): CasaChat => ({ pc, pcNome, motivo: 'scelta', decisaIl, da: 'nicholas' })
const T = (iso: string): number => Date.parse(iso)

function pannello(chat: ChatIngresso[], cc: Record<string, CasaChat>) {
  const c: CaseChat = { versione: 1, case: cc }
  return costruisciPannello({
    io: IO, pc: [PORTATILE, VECCHIO], case: c, chat, adesso: ORA,
    progetti: [{ id: 'prog-1', nome: 'Gestionale', percorsi: { 'pc-port': 'C:\\Progetti\\Esempio' } }]
  })
}
const riga = (p: ReturnType<typeof pannello>, s: string) => p.chat.find((x) => x.sessione === s)!
const tipi = (p: ReturnType<typeof pannello>, s: string) => riga(p, s).problemi.map((x) => x.tipo)

describe('le assegnazioni sbagliate', () => {
  it('una chat con la sua casa e la copia del residente: nessun problema, «residente»', () => {
    const p = pannello([{ sessione: 's1', titolo: 'Uno', copie: [{ pc: 'pc-port', dove: 'drive', mtime: T('2026-10-09T10:00:00Z') }] }], { s1: casa('pc-port', 'PORTATILE-ESEMPIO') })
    expect(tipi(p, 's1')).toEqual([])
    expect(riga(p, 's1').stato).toBe('residente')
    expect(riga(p, 's1').residente?.nome).toBe('PORTATILE-ESEMPIO')
  })

  it('senza casa: lo dice, e con due copie dice che possono divergere', () => {
    const p = pannello([{ sessione: 's2', titolo: 'Due', copie: [{ pc: 'pc-qui', dove: 'qui', mtime: 1 }, { pc: 'pc-port', dove: 'drive', mtime: 2 }] }], {})
    expect(tipi(p, 's2')).toEqual(['senza-casa'])
    expect(riga(p, 's2').problemi[0]?.spiega).toContain('PC-ESEMPIO e PORTATILE-ESEMPIO')
  })

  it('casa su un PC sconosciuto (reinstallato, id nuovo)', () => {
    const p = pannello([{ sessione: 's3', titolo: 'Tre', copie: [] }], { s3: casa('pc-fantasma', 'PC-SPARITO') })
    expect(tipi(p, 's3')).toEqual(['casa-sconosciuta'])
  })

  it('casa su un PC assente da più di 30 giorni', () => {
    const p = pannello([{ sessione: 's4', titolo: 'Quattro', copie: [] }], { s4: casa('pc-vecchio', 'PC-VECCHIO') })
    expect(tipi(p, 's4')).toEqual(['casa-assente'])
    expect(riga(p, 's4').problemi[0]?.titolo).toContain('31 giorni')
  })

  it('due case: aperta adesso su un PC che non è la casa → conflitto', () => {
    const p = pannello([{ sessione: 's5', titolo: 'Cinque', aperta: ['pc-qui'], copie: [{ pc: 'pc-port', dove: 'drive', mtime: 5 }] }], { s5: casa('pc-port', 'PORTATILE-ESEMPIO') })
    expect(tipi(p, 's5')).toContain('due-case')
    expect(riga(p, 's5').stato).toBe('conflitto')
  })

  it('due case: caricata da due PC dopo la scelta della casa', () => {
    const p = pannello([{ sessione: 's6', titolo: 'Sei', copie: [
      { pc: 'pc-port', dove: 'drive', mtime: T('2026-10-05T10:00:00Z') },
      { pc: 'pc-qui', dove: 'drive', mtime: T('2026-10-06T10:00:00Z') }
    ] }], { s6: casa('pc-port', 'PORTATILE-ESEMPIO') })
    expect(tipi(p, 's6')).toContain('due-case')
  })

  it('copia più recente fuori dalla casa (qui)', () => {
    const p = pannello([{ sessione: 's7', titolo: 'Sette', copie: [
      { pc: 'pc-port', dove: 'drive', mtime: T('2026-09-20T10:00:00Z') },
      { pc: 'pc-qui', dove: 'qui', mtime: T('2026-09-25T10:00:00Z') }
    ] }], { s7: casa('pc-port', 'PORTATILE-ESEMPIO', '2026-09-01T00:00:00Z') })
    expect(tipi(p, 's7')).toContain('copia-piu-recente')
    expect(riga(p, 's7').problemi.find((x) => x.tipo === 'copia-piu-recente')?.spiega).toContain('questo PC (PC-ESEMPIO)')
  })

  it('solo cloud: la casa c’è ma il residente non ha una copia', () => {
    const p = pannello([{ sessione: 's8', titolo: 'Otto', copie: [{ pc: 'pc-qui', dove: 'drive', mtime: 1 }] }], { s8: casa('pc-port', 'PORTATILE-ESEMPIO', '2026-10-10T00:00:00Z') })
    expect(riga(p, 's8').stato).toBe('solo-cloud')
  })
})

describe('i progetti', () => {
  it('la casa è quella della maggior parte delle chat; diviso se sono su PC diversi', () => {
    const p = pannello([
      { sessione: 'a', titolo: 'A', progetto: 'prog-1', copie: [{ pc: 'pc-port', dove: 'drive', mtime: 1 }] },
      { sessione: 'b', titolo: 'B', progetto: 'prog-1', copie: [{ pc: 'pc-port', dove: 'drive', mtime: 2 }] },
      { sessione: 'c', titolo: 'C', progetto: 'prog-1', copie: [{ pc: 'pc-qui', dove: 'qui', mtime: 3 }] }
    ], { a: casa('pc-port', 'PORTATILE-ESEMPIO'), b: casa('pc-port', 'PORTATILE-ESEMPIO'), c: casa('pc-qui', 'PC-ESEMPIO') })
    const g = p.progetti[0]!
    expect(g.residente?.pc).toBe('pc-port')
    expect(g.problemi.map((x) => x.tipo)).toContain('progetto-diviso')
    expect(g.cartellaQui).toBe(false)
    expect(g.chat).toBe(3)
  })

  it('progetto senza casa', () => {
    const p = pannello([{ sessione: 'a', titolo: 'A', progetto: 'prog-1', copie: [] }], {})
    expect(p.progetti[0]?.problemi.map((x) => x.tipo)).toEqual(['progetto-senza-casa'])
  })
})

describe('i filtri e la ricerca', () => {
  const p = pannello([
    { sessione: 'ok', titolo: 'Fatture', copie: [{ pc: 'pc-qui', dove: 'qui', mtime: 1 }] },
    { sessione: 'no', titolo: 'Sito', copie: [{ pc: 'pc-port', dove: 'drive', mtime: 1 }] },
    { sessione: 'nube', titolo: 'Note', copie: [{ pc: 'pc-port', dove: 'drive', mtime: 1 }] }
  ], { ok: casa('pc-qui', 'PC-ESEMPIO'), nube: casa('pc-port', 'PORTATILE-ESEMPIO') })
  it('sbagliati, di questo PC, solo cloud', () => {
    expect(filtraChat(p.chat, 'sbagliati').map((x) => x.sessione)).toEqual(['no'])
    expect(filtraChat(p.chat, 'questo-pc').map((x) => x.sessione)).toEqual(['ok'])
    expect(filtraChat(p.chat, 'solo-cloud').map((x) => x.sessione).sort()).toEqual(['no', 'nube'])
    expect(filtraChat(p.chat, 'tutti', 'portatile note').map((x) => x.sessione)).toEqual(['nube'])
    expect(filtraProgetti(p.progetti, 'solo-cloud')).toHaveLength(1)
  })
})

describe('i testi della conferma', () => {
  it('dicono cosa succede, cosa no, e cosa fare; per un progetto senza cartella là lo avvisano', () => {
    const t = testiCambioResidente({ cosa: 'progetto', nome: 'Gestionale', da: { pc: 'pc-port', nome: 'PORTATILE-ESEMPIO' }, verso: { pc: 'pc-qui', nome: 'PC-ESEMPIO' }, io: 'pc-qui', chat: 3, cartellaLa: false })
    expect(t.titolo).toBe('Rendi questo PC (PC-ESEMPIO) residente')
    expect(t.succede.join(' ')).toContain('cartella di recupero')
    expect(t.nonSuccede.join(' ')).toContain('Non si cancella niente')
    expect(t.nonSuccede.join(' ')).toContain('la cartella non c\'è')
    expect(t.seNonTorna.length).toBeGreaterThan(0)
  })
})
