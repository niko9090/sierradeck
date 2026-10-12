import { describe, it, expect } from 'vitest'
import { eSessioneInterna, sessioniInterne, togliInterneAggiunte, workspaceDaAltroPc, workspaceDaCreare } from '@shared/workspace-riparazioni'
import { chatDelProgetto, comeAprireChat, type RigaChat } from '@shared/pannello-drive'
import type { Archivio } from '@shared/workspace'

/**
 * «Workspace = progetto» (0.67.0). Il caso di Nicholas del 12/10, con nomi
 * d'esempio: il progetto «fionda» vive su un altro PC, ha 5 chat, non è in nessun
 * workspace, e dalla barra non lo si trovava su nessun PC.
 */
const qui = (nomi: string[], sessioni: Record<string, string[]> = {}): Archivio => ({
  versione: 1, attivo: nomi[0] ?? '',
  workspace: nomi.map((n) => ({ nome: n, perSlot: { 1: { root: undefined, panes: (sessioni[n] ?? []).map((s) => ({ id: `p-${s}`, sessionUuid: s, cwd: 'C:\\x', title: s })) } } }))
} as unknown as Archivio)

describe('ogni progetto ha il suo workspace sul PC dove vive', () => {
  const chat = [{ sessione: 's1', titolo: 'Fionda: app', cwd: 'E:\\Progetti\\fionda' }, { sessione: 's2', titolo: 'Fionda: errore', cwd: 'E:\\Progetti\\fionda' }]
  it('il progetto che vive qui senza workspace lo riceve, con le sue chat', () => {
    const r = workspaceDaCreare([{ nome: 'fionda', residenteQui: true, chat }], qui(['Lavoro']), [])
    expect(r).toEqual([{ nome: 'fionda', panes: [
      { id: 'pane-s1', sessionUuid: 's1', cwd: 'E:\\Progetti\\fionda', title: 'Fionda: app' },
      { id: 'pane-s2', sessionUuid: 's2', cwd: 'E:\\Progetti\\fionda', title: 'Fionda: errore' }
    ] }])
  })
  it('non si crea: se c’è già (stesso nome, maiuscole a parte), se vive su un altro PC, se Nicholas l’ha eliminato', () => {
    expect(workspaceDaCreare([{ nome: 'fionda', residenteQui: true, chat }], qui(['Fionda']), [])).toEqual([])
    expect(workspaceDaCreare([{ nome: 'fionda', residenteQui: false, chat }], qui(['Lavoro']), [])).toEqual([])
    expect(workspaceDaCreare([{ nome: 'fionda', residenteQui: true, chat }], qui(['Lavoro']), ['Fionda'])).toEqual([])
  })
  it('una chat che sta già in «Predefinito» resta lì: una chat, un workspace', () => {
    const r = workspaceDaCreare([{ nome: 'fionda', residenteQui: true, chat }], qui(['Predefinito'], { Predefinito: ['s1'] }), [])
    expect(r[0]?.panes.map((p) => p.sessionUuid)).toEqual(['s2'])
  })
  it('niente doppioni (0.67.2): stesso nome a parte spazi e trattini, o le sue chat già in un altro workspace', () => {
    // «NAS-film» accanto a «Nas film», e «HomeAssistant» accanto a «HA» che ne aveva già la chat (12/10).
    expect(workspaceDaCreare([{ nome: 'NAS-film', residenteQui: true, chat }], qui(['Nas film']), [])).toEqual([])
    expect(workspaceDaCreare([{ nome: 'Home_Assistant', residenteQui: true, chat }], qui(['home assistant']), [])).toEqual([])
    expect(workspaceDaCreare([{ nome: 'HomeAssistant', residenteQui: true, chat }], qui(['HA'], { HA: ['s1'] }), [])).toEqual([])
  })
})

describe('«Su altri PC» → «Apri»', () => {
  it('il workspace di quel PC, qui, con un riquadro dal vivo verso di lui per ogni sua chat', () => {
    const w = workspaceDaAltroPc('fionda', { id: 'pc-desk', nome: 'DESK-ESEMPIO' }, [
      { workspace: 'fionda', sessione: 's1', cwd: 'E:\\Progetti\\fionda', titolo: 'Fionda: app' },
      { workspace: 'altro', sessione: 's9', cwd: 'E:\\x', titolo: 'x' },
      { workspace: 'fionda', cwd: 'E:\\Progetti\\fionda', titolo: 'senza conversazione' }
    ])
    expect(w.panes).toEqual([{ id: 'pane-s1', sessionUuid: 's1', cwd: 'E:\\Progetti\\fionda', title: 'Fionda: app', remoto: { pcId: 'pc-desk', pcNome: 'DESK-ESEMPIO', cwd: 'E:\\Progetti\\fionda', sessione: 's1' } }])
  })
})

describe('le chat di un progetto nel pannello, e come si aprono', () => {
  const riga = (x: Partial<RigaChat>): RigaChat => ({ sessione: 's', titolo: 't', copie: [], stato: 'residente', copiaQui: false, problemi: [], ...x })
  it('tutte le chat dei suoi id, con nome, le più recenti prima', () => {
    const c = [
      riga({ sessione: 'a', progetto: 'p1', ultimoUso: '2026-10-01' }),
      riga({ sessione: 'b', progetto: 'p2', ultimoUso: '2026-10-05' }),
      riga({ sessione: 'c', progetto: 'p1', senzaNome: true }),
      riga({ sessione: 'd', progetto: 'altro' })
    ]
    expect(chatDelProgetto(c, { ids: ['p1', 'p2'] }).map((x) => x.sessione)).toEqual(['b', 'a'])
  })
  it('qui se vive qui; altrimenti dal vivo sul PC dove vive, nella sua cartella di là', () => {
    const progetto = { cartelle: [{ pc: 'pc-desk', percorso: 'E:\\Progetti\\fionda' }] }
    expect(comeAprireChat(riga({ cwd: 'C:\\qui', residente: { pc: 'pc-qui', nome: 'QUI', fonte: 'regola', motivo: '', qui: true } }), progetto)).toEqual({ tipo: 'qui', cwd: 'C:\\qui' })
    expect(comeAprireChat(riga({ cwd: 'C:\\copia', residente: { pc: 'pc-desk', nome: 'DESK-ESEMPIO', fonte: 'regola', motivo: '', qui: false } }), progetto)).toEqual({ tipo: 'altrove', pc: 'pc-desk', nome: 'DESK-ESEMPIO', cwd: 'E:\\Progetti\\fionda' })
    expect(comeAprireChat(riga({}), progetto)).toBeUndefined()
  })
})

describe('le sessioni interne degli autopiloti non sono chat (0.67.3)', () => {
  it('si riconoscono dall’id (supervisore, preparazione) o dal primo messaggio fisso', () => {
    const interne = sessioniInterne([{ sessioneSupervisore: 'sup', sessioneIntervista: 'int', chats: [{ sessioneSupervisore: 'sup2' }] }])
    expect([...interne].sort()).toEqual(['int', 'sup', 'sup2'])
    expect(eSessioneInterna({ sessione: 'x', titolo: 'Sei l\'autopilota che sta portando avanti questo lavoro. Chi te lo ha…' }, new Set())).toBe(true)
    expect(eSessioneInterna({ sessione: 'x', titolo: 'Stai preparando un autopilota: un agente…' }, new Set())).toBe(true)
    expect(eSessioneInterna({ sessione: 'sup', titolo: 'qualunque' }, interne)).toBe(true)
    expect(eSessioneInterna({ sessione: 'x', titolo: 'Fionda: errore sul telefono' }, interne)).toBe(false)
  })
  it('«Apri» da un altro PC non porta le sessioni interne', () => {
    const w = workspaceDaAltroPc('fionda', { id: 'pc-desk', nome: 'DESK-ESEMPIO' }, [
      { workspace: 'fionda', sessione: 's1', cwd: 'E:\\Progetti\\fionda', titolo: 'Fionda: app' },
      { workspace: 'fionda', sessione: 's2', cwd: 'E:\\Progetti\\fionda', titolo: 'Stai preparando un autopilota: …' }
    ])
    expect(w.panes.map((p) => p.sessionUuid)).toEqual(['s1'])
  })
  it('si tolgono solo i riquadri interni aggiunti dopo la copia «prima dei progetti», anche dall’albero del layout', () => {
    const pane = (s: string, t: string) => ({ id: `p-${s}`, sessionUuid: s, cwd: 'C:\\x', title: t })
    const ora = {
      versione: 1, attivo: 'fionda',
      workspace: [{ nome: 'fionda', perSlot: { 1: {
        root: { type: 'split', id: 'sp', direction: 'horizontal', sizes: [0.5, 0.5], children: [{ type: 'pane', id: 'p-s1' }, { type: 'pane', id: 'p-s2' }] },
        panes: [pane('s1', 'Fionda: app'), pane('s2', 'Stai preparando un autopilota: …')]
      } } }, { nome: 'Vecchio', perSlot: { 1: { root: { type: 'pane', id: 'p-s3' }, panes: [pane('s3', 'Sei il supervisore di una chat che…')] } } }]
    } as unknown as Archivio
    const prima = { versione: 1, attivo: 'Vecchio', workspace: [{ nome: 'Vecchio', perSlot: { 1: { root: { type: 'pane', id: 'p-s3' }, panes: [pane('s3', 'Sei il supervisore di una chat che…')] } } }] } as unknown as Archivio
    const r = togliInterneAggiunte(ora, prima, new Set())
    expect(r.tolti).toEqual([{ workspace: 'fionda', titolo: 'Stai preparando un autopilota: …' }])
    const f = r.archivio.workspace[0]?.perSlot[1]
    expect(f?.panes.map((p) => p.sessionUuid)).toEqual(['s1'])
    expect(JSON.stringify(f?.root)).not.toContain('p-s2')
    // Quello che c'era prima resta com'era.
    expect(r.archivio.workspace[1]).toBe(ora.workspace[1])
  })
})
