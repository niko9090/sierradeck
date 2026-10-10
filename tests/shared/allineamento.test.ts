import { describe, it, expect } from 'vitest'
import { cartellaDiProgettoValida, casaProgetto, chiaveProgetto, pianoAllineamento, rigaPiano, sceltaProgetto } from '../../src/shared/allineamento'
import { leggiCase, unisciCase, type CaseChat } from '../../src/shared/una-casa'
import { pianoTrasloco } from '../../src/shared/ospite-chat'

// 0.58.0, tappa 2: l'allineamento dei PC. Dati d'esempio.
const HOME = 'C:\\Users\\Esempio'
const progetti: { id: string; nome: string; percorsi: Record<string, string> }[] = [
  { id: 'p-qui', nome: 'Gestionale', percorsi: { 'pc-qui': 'C:\\Progetti\\Gestionale', 'pc-port': 'D:\\Lavoro\\Gestionale' } },
  { id: 'p-port', nome: 'Sito', percorsi: { 'pc-qui': 'C:\\Progetti\\Sito', 'pc-port': 'D:\\Lavoro\\Sito' } },
  { id: 'p-nuovo', nome: 'Nuovo', percorsi: { 'pc-port': 'D:\\Lavoro\\Nuovo' } },
  { id: 'p-libero', nome: 'Libero', percorsi: { 'pc-qui': 'C:\\Progetti\\Libero' } }
]
const scelta = (id: string, pc: string, quando = '2026-10-10T10:00:00Z') => sceltaProgetto({ id, nome: id, pc: { id: pc, nome: pc.toUpperCase() }, chi: { id: 'pc-qui', nome: 'PC-ESEMPIO' }, quando })
const cc = (...voci: Record<string, unknown>[]): CaseChat => leggiCase({ versione: 1, case: Object.assign({}, ...voci) })

describe('lo stato voluto dei progetti sta in case-chat', () => {
  it('si scrive, si legge e si unisce come le case delle chat (vince la scelta più recente)', () => {
    const a = cc(scelta('p-qui', 'pc-qui', '2026-10-10T10:00:00Z'))
    const b = cc(scelta('p-qui', 'pc-port', '2026-10-10T11:00:00Z'))
    expect(casaProgetto(unisciCase(a, b), 'p-qui')?.pc).toBe('pc-port')
    expect(casaProgetto(unisciCase(b, a), 'p-qui')?.pc).toBe('pc-port')
  })
  it('un PC vecchio la porta avanti senza saperlo, e il trasloco delle chat la ignora', () => {
    // leggiCase di sempre accetta qualunque chiave; pianoTrasloco guarda solo le chat che ha.
    const c = cc(scelta('p-port', 'pc-port'))
    expect(Object.keys(c.case)).toEqual([chiaveProgetto('p-port')])
    expect(pianoTrasloco({ case: c, io: 'pc-qui', copieQui: ['s-1'], aperte: [] })).toEqual({ sposta: [], chiudi: [], aspetta: [] })
  })
})

describe('il piano di allineamento', () => {
  const esiste = (p: string): boolean => ['C:\\Progetti\\Gestionale', 'C:\\Progetti\\Sito', 'C:\\Progetti\\Libero'].includes(p)
  const piano = pianoAllineamento({
    io: 'pc-qui', home: HOME, esiste, progetti,
    case: cc(scelta('p-qui', 'pc-qui'), scelta('p-port', 'pc-port'), scelta('p-nuovo', 'pc-qui'))
  })
  it('residente qui e presente: niente; residente altrove e presente qui: «solo cloud»; residente qui e assente: «porta qui» da solo', () => {
    expect(piano.azioni.map((a) => `${a.tipo}:${a.progetto}`).sort()).toEqual(['porta-qui:p-nuovo', 'solo-cloud:p-port'])
    const porta = piano.azioni.find((a) => a.tipo === 'porta-qui')
    expect(porta?.tipo === 'porta-qui' && porta.automatica).toBe(true)
    expect(piano.senzaScelta).toBe(1)
  })
  it('nessuna azione distruttiva: solo «porta qui» e «solo cloud», e «solo cloud» dice che per ora resta', () => {
    for (const a of piano.azioni) expect(['porta-qui', 'solo-cloud']).toContain(a.tipo)
    const cloud = piano.azioni.find((a) => a.tipo === 'solo-cloud')
    expect(cloud?.perche).toContain('per ora resta')
    expect(rigaPiano(piano)).toContain('solo mostrato: nessuna rimozione')
  })
  it('una cartella registrata male (radice del disco, profilo utente) non entra mai nel piano', () => {
    const male = [{ id: 'p-male', nome: 'Male', percorsi: { 'pc-qui': 'C:\\' } }, { id: 'p-casa', nome: 'Casa', percorsi: { 'pc-qui': HOME } }]
    const p = pianoAllineamento({ io: 'pc-qui', home: HOME, esiste: () => true, progetti: male, case: cc(scelta('p-male', 'pc-port'), scelta('p-casa', 'pc-port')) })
    expect(p.azioni).toEqual([])
    expect(cartellaDiProgettoValida('C:\\', HOME)).toBe(false)
    expect(cartellaDiProgettoValida('C:\\Users', HOME)).toBe(false)
    expect(cartellaDiProgettoValida(HOME, HOME)).toBe(false)
    expect(cartellaDiProgettoValida('C:\\Users\\Esempio\\Progetti\\X', HOME)).toBe(true)
  })
  it('residente qui ma con una cartella che non va bene: «porta qui» chiede', () => {
    const p = pianoAllineamento({ io: 'pc-qui', home: HOME, esiste: () => true, progetti: [{ id: 'p', nome: 'P', percorsi: { 'pc-qui': 'C:\\' } }], case: cc(scelta('p', 'pc-qui')) })
    expect(p.azioni[0]).toMatchObject({ tipo: 'porta-qui', automatica: false })
  })
})
