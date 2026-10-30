import {
  eSenzaNome, gruppoDiCartella, nomeNormalizzato, raggruppaProgetti, workspaceDelGruppo, type MembroProgetto
} from '../../src/shared/progetti-unificati'

// 0.60.0: «stesso nome = stesso progetto». Dati d'esempio, nessun percorso vero.

describe('il nome normalizzato', () => {
  it('maiuscole, spazi, trattini, punti, accenti e suffissi delle copie non contano', () => {
    expect(nomeNormalizzato('Home assistant')).toBe(nomeNormalizzato('HomeAssistant'))
    expect(nomeNormalizzato('Wdeck')).toBe(nomeNormalizzato('wdeck (2)'))
    expect(nomeNormalizzato('Gestore_sessioni_ClaudeCode')).toBe(nomeNormalizzato('gestore-sessioni-claudecode'))
    expect(nomeNormalizzato('Città')).toBe(nomeNormalizzato('citta'))
    expect(nomeNormalizzato('Sito - copia')).toBe(nomeNormalizzato('Sito'))
    expect(nomeNormalizzato('Sito [3]')).toBe(nomeNormalizzato('sito'))
    expect(nomeNormalizzato('Game2')).not.toBe(nomeNormalizzato('Game'))
  })
})

describe('i gruppi del registro', () => {
  // Come nel registro vero del 10/10: quattro «Wdeck», tre con la stessa cartella qui, uno solo del portatile.
  const progetti: MembroProgetto[] = [
    { id: 'w1', nome: 'Wdeck', percorsi: { 'pc-qui': 'C:\\Progetti\\Wdeck' }, aggiuntoIl: '2026-09-01T00:00:00Z' },
    { id: 'w2', nome: 'Wdeck', percorsi: { 'pc-qui': 'C:\\Progetti\\Wdeck' }, aggiuntoIl: '2026-09-02T00:00:00Z' },
    { id: 'w3', nome: 'Wdeck', percorsi: { 'pc-port': 'C:\\Progetti\\Wdeck' }, aggiuntoIl: '2026-09-03T00:00:00Z' },
    { id: 'w4', nome: 'wdeck (2)', percorsi: { 'pc-qui': 'c:/progetti/wdeck/' }, aggiuntoIl: '2026-09-04T00:00:00Z' },
    { id: 's1', nome: 'SierraDeck', percorsi: { 'pc-port': 'C:\\Progetti\\SierraDeck' }, aggiuntoIl: '2026-09-05T00:00:00Z' },
    { id: 'x1', nome: 'Altro', percorsi: { 'pc-qui': 'C:\\Progetti\\Altro' } }
  ]
  it('stesso nome = un gruppo solo, con le cartelle senza doppioni', () => {
    const g = raggruppaProgetti(progetti)
    expect(g.map((x) => x.nome)).toEqual(['Altro', 'SierraDeck', 'Wdeck'])
    const w = g.find((x) => x.chiave === 'wdeck')
    expect(w?.ids).toEqual(['w1', 'w2', 'w3', 'w4'])
    expect(w?.percorsi.map((p) => p.pc)).toEqual(['pc-qui', 'pc-port'])
  })
  it('il principale: quello con un proprietario (0.88.0), altrimenti il più vecchio', () => {
    expect(raggruppaProgetti(progetti).find((x) => x.chiave === 'wdeck')?.id).toBe('w1')
    const conProprietario: MembroProgetto[] = [...progetti, { id: 'w5', nome: 'Wdeck', proprietario: 'pc-port', percorso: 'D:\\Wdeck', aggiuntoIl: '2026-10-01T00:00:00Z' }]
    const w = raggruppaProgetti(conProprietario).find((x) => x.chiave === 'wdeck')
    expect(w?.id).toBe('w5')
    expect(w?.percorsi[0]).toEqual({ pc: 'pc-port', percorso: 'D:\\Wdeck', id: 'w5' })
  })
  it('un id unito a mano segue il suo principale anche con un altro nome; «separato» (vuoto) no', () => {
    const conUnito: MembroProgetto[] = [...progetti, { id: 'y', nome: 'Vecchio nome', percorsi: {}, unitoIn: 'x1' }, { id: 'z', nome: 'Zeta', percorsi: {}, unitoIn: '' }]
    const g = raggruppaProgetti(conUnito)
    expect(g.find((x) => x.id === 'x1')?.ids).toEqual(['x1', 'y'])
    expect(g.find((x) => x.id === 'z')?.ids).toEqual(['z'])
  })
  it('la cartella di una chat: prima quelle registrate, poi il nome (anche se qui non è registrata)', () => {
    const g = raggruppaProgetti(progetti)
    expect(gruppoDiCartella('C:\\Progetti\\Wdeck\\src', g)?.gruppo.chiave).toBe('wdeck')
    const s = gruppoDiCartella('E:\\Documenti\\SierraDeck\\android', g)
    expect(s?.gruppo.id).toBe('s1')
    expect(s?.perNome).toBe(true)
    expect(s?.radice).toBe('E:\\Documenti\\SierraDeck')
    expect(gruppoDiCartella('E:\\Documenti\\Nessuno', g)).toBeUndefined()
  })
  it('i workspace con lo stesso nome, quello col nome esatto per primo', () => {
    expect(workspaceDelGruppo(['wdeck (2)', 'Altro', 'Wdeck', 'WDECK'], { chiave: 'wdeck', nome: 'Wdeck' })).toEqual(['Wdeck', 'WDECK', 'wdeck (2)'])
  })
})

describe('le chat senza nome', () => {
  it('nessun titolo, l’id, «chat 1a2b3c4d», «senza titolo»: senza nome; un titolo vero no', () => {
    expect(eSenzaNome(undefined)).toBe(true)
    expect(eSenzaNome('  ')).toBe(true)
    expect(eSenzaNome('senza titolo')).toBe(true)
    expect(eSenzaNome('chat 1a2b3c4d')).toBe(true)
    expect(eSenzaNome('1a2b3c4d-0000-4000-8000-000000000000')).toBe(true)
    expect(eSenzaNome('chat s-tre', 's-tre')).toBe(true)
    expect(eSenzaNome('Fatture di ottobre')).toBe(false)
  })
})
