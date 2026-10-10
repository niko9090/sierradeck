import { describe, it, expect } from 'vitest'
import { workspaceDiApertura } from '../../src/shared/workspace-apertura'

/**
 * Il workspace giusto di una chat che si apre a schermo (0.59.0): mai quello
 * attivo. Il caso del 10/10: sul PC di casa la chat non era salvata in nessun
 * workspace, il PC che chiedeva l'aveva nel suo «Trading», e la chat finiva
 * nel workspace che la finestra aveva davanti.
 */
const S = 's-esempio'
const vuoto = { workspace: [{ nome: 'Predefinito', perSlot: {} }] }
const con = (nome: string, panes: { sessionUuid?: string; cwd?: string }[]) => ({ nome, perSlot: { '1': { panes } } })

describe('in quale workspace si apre una chat', () => {
  it('prima quello dell’autopilota che la governa', () => {
    const s = workspaceDiApertura({ sessione: S, cwd: 'C:\\Prove\\a', autopiloti: [{ nome: 'Lavoro', workspace: 'Autopiloti', sessionId: S, cwd: 'C:\\Prove\\a' }], archivio: { workspace: [con('Altro', [{ sessionUuid: S }])] }, chiesto: 'Trading' })
    expect(s).toMatchObject({ nome: 'Autopiloti', fonte: 'autopilota', creare: true })
  })
  it('poi quello dove il riquadro è salvato su questo PC', () => {
    const s = workspaceDiApertura({ sessione: S, cwd: 'C:\\Prove\\a', autopiloti: [], archivio: { workspace: [con('Lavoro', [{ sessionUuid: S }])] }, chiesto: 'Trading' })
    expect(s).toMatchObject({ nome: 'Lavoro', fonte: 'riquadro', creare: false })
  })
  it('il caso del 10/10: qui non è salvata, vale il workspace del riquadro di chi chiede, e si crea', () => {
    const s = workspaceDiApertura({ sessione: S, cwd: 'C:\\Prove\\Trading', autopiloti: [], archivio: vuoto, chiesto: 'Trading' })
    expect(s).toMatchObject({ nome: 'Trading', fonte: 'richiesta', creare: true })
  })
  it('poi il workspace del progetto: dove stanno le altre chat della stessa cartella', () => {
    const s = workspaceDiApertura({ sessione: S, cwd: 'C:\\Prove\\Trading\\', autopiloti: [], archivio: { workspace: [con('Mercati', [{ sessionUuid: 'altra', cwd: 'c:/prove/trading' }])] } })
    expect(s).toMatchObject({ nome: 'Mercati', fonte: 'progetto', creare: false })
  })
  it('o quello dell’autopilota della stessa cartella', () => {
    const s = workspaceDiApertura({ sessione: S, cwd: 'C:\\Prove\\b', autopiloti: [{ nome: 'B', workspace: 'Progetto B', cwd: 'C:\\Prove\\b' }], archivio: vuoto })
    expect(s.fonte).toBe('progetto')
    expect(s.nome).toBe('Progetto B')
  })
  it('se nessuno la conosce: il nome della cartella, mai il workspace attivo', () => {
    const s = workspaceDiApertura({ sessione: S, cwd: 'D:\\Lavoro\\Gestionale', autopiloti: [], archivio: vuoto })
    expect(s).toMatchObject({ nome: 'Gestionale', fonte: 'cartella', creare: true })
    expect(s.perche).toContain('nome della sua cartella')
  })
})
