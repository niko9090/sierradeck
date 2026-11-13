import { describe, expect, it } from 'vitest'
import {
  chiaveProgetto, collega, collegamentiVuoti, collegaPerNome, decidiProgettoWorkspace, NOME_MAX, nomeCartellaDi, nomeComune, nomeWorkspaceNuovo,
  parseCollegamenti, pianoNomiWorkspace, pianoTornaComePrima, progettoDelWorkspace, rinominaInCollegamenti, scollega, stessoProgetto, ultimoPezzo,
  type Collegamenti
} from '../../src/shared/progetti-identita'
import { NOME_WORKSPACE_MAX } from '../../src/main/validation'

/**
 * Gestione progetti (13/11): una regola sola per «è lo stesso progetto», il
 * collegamento workspace → progetto per id, e «il workspace si chiama come la
 * cartella».
 */
describe('la regola unica di «stesso progetto»', () => {
  it('maiuscole, spazi, trattini, punti, accenti e suffissi delle copie non contano', () => {
    expect(chiaveProgetto('Sito Web')).toBe(chiaveProgetto('sito-web'))
    expect(chiaveProgetto('sito_web')).toBe(chiaveProgetto('SitoWeb'))
    expect(chiaveProgetto('Città')).toBe(chiaveProgetto('citta'))
    expect(stessoProgetto('Wdeck (2)', 'wdeck')).toBe(true)
    expect(stessoProgetto('Wdeck - copia', 'WDeck')).toBe(true)
    expect(stessoProgetto('Gestionale', 'Gestionale-dev')).toBe(false)
  })

  it('il nome della cartella: l’ultimo pezzo del percorso, con barre di Windows o Unix', () => {
    expect(ultimoPezzo('C:\\Progetti\\Sito\\')).toBe('Sito')
    expect(ultimoPezzo('/home/x/Sito')).toBe('Sito')
    expect(nomeCartellaDi({ nome: 'sito', percorso: 'D:\\Lavoro\\Sito Web' })).toBe('Sito Web')
    expect(nomeCartellaDi({ nome: 'sito' })).toBe('sito')
  })

  it('il nome comune è valido per una cartella e per un workspace, e dice se è cambiato', () => {
    expect(nomeComune('Sito')).toEqual({ ok: true, nome: 'Sito', cambiato: false })
    expect(nomeComune('A:B?')).toEqual({ ok: true, nome: 'A-B-', cambiato: true })
    expect(nomeComune('Nome con punto finale.')).toEqual({ ok: true, nome: 'Nome con punto finale', cambiato: true })
    expect(nomeComune('x'.repeat(90))).toMatchObject({ ok: true, cambiato: true })
    expect((nomeComune('x'.repeat(90)) as { nome: string }).nome).toHaveLength(NOME_MAX)
    expect(nomeComune('   ').ok).toBe(false)
    expect(nomeComune('...').ok).toBe(false)
    expect(nomeComune('Documents').ok).toBe(false)
  })

  it('la lunghezza massima è la stessa dei workspace', () => {
    expect(NOME_MAX).toBe(NOME_WORKSPACE_MAX)
  })
})

describe('i collegamenti workspace → progetto', () => {
  it('si leggono senza mai sollevare e scartano le voci storte', () => {
    expect(parseCollegamenti(null)).toEqual(collegamentiVuoti())
    expect(parseCollegamenti({ collegati: { A: { id: 'p1', nome: 'A' }, B: { nome: 'x' }, '': { id: 'p2' } }, scollegati: ['C', 3, 'C'] }))
      .toEqual({ versione: 1, collegati: { A: { id: 'p1', nome: 'A' } }, scollegati: ['C'] })
  })

  it('seguono il nome del workspace, e spariscono con lui', () => {
    let c = collega(collegamentiVuoti(), 'Vecchio', { id: 'p1', nome: 'Vecchio' })
    c = rinominaInCollegamenti(c, 'Vecchio', 'Nuovo')
    expect(c.collegati).toEqual({ Nuovo: { id: 'p1', nome: 'Vecchio' } })
    c = scollega(c, 'Nuovo')
    expect(c.collegati).toEqual({})
    expect(c.scollegati).toEqual(['Nuovo'])
    c = rinominaInCollegamenti(c, 'Nuovo', 'Altro')
    expect(c.scollegati).toEqual(['Altro'])
    c = rinominaInCollegamenti(c, 'Altro', undefined)
    expect(c.scollegati).toBeUndefined()
    // Ricollegare toglie dagli scollegati.
    expect(collega(scollega(collegamentiVuoti(), 'X'), 'X', { id: 'p', nome: 'X' }).scollegati).toBeUndefined()
  })

  const progetti = [
    { id: 'p1', nome: 'Sito', proprietario: 'A', percorso: 'C:\\P\\Sito' },
    { id: 'p2', nome: 'Wdeck', proprietario: 'A', percorso: 'C:\\P\\Wdeck' },
    { id: 'p3', nome: 'wdeck (2)', proprietario: 'B', percorso: 'D:\\Wdeck' }
  ]

  it('prima l’id, poi il nome; lo scollegato non ha progetto; due progetti con la stessa chiave sono ambigui', () => {
    const c: Collegamenti = { versione: 1, collegati: { 'Nome a caso': { id: 'p1', nome: 'Sito' }, Perso: { id: 'via', nome: 'Perso' } }, scollegati: ['sito'] }
    expect(progettoDelWorkspace('Nome a caso', c, progetti)).toMatchObject({ tipo: 'collegato', progetto: { id: 'p1' } })
    expect(progettoDelWorkspace('Perso', c, progetti)).toEqual({ tipo: 'tolto', id: 'via' })
    expect(progettoDelWorkspace('sito', c, progetti)).toEqual({ tipo: 'scollegato' })
    expect(progettoDelWorkspace('SITO', c, progetti)).toMatchObject({ tipo: 'nome', progetto: { id: 'p1' } })
    expect(progettoDelWorkspace('WDeck', c, progetti)).toMatchObject({ tipo: 'ambiguo' })
    expect(progettoDelWorkspace('Altro', c, progetti)).toEqual({ tipo: 'nessuno' })
  })

  it('collegaPerNome collega una volta i workspace con un solo progetto, e dimentica quelli spariti', () => {
    const c: Collegamenti = { versione: 1, collegati: { Sparito: { id: 'p2', nome: 'Wdeck' } } }
    const e = collegaPerNome(c, ['sito', 'Wdeck', 'Nuovo'], progetti)
    expect(e.nuovi).toEqual([{ ws: 'sito', id: 'p1' }])
    expect(e.collegamenti.collegati).toEqual({ sito: { id: 'p1', nome: 'Sito' } })
  })
})

describe('il progetto di un workspace, senza doppioni (decidiProgettoWorkspace)', () => {
  const opz = { io: 'A', esiste: (p: string) => p !== 'C:\\P\\Mancante', diSistema: (n: string) => n === 'Documents' }
  const progetti = [
    { id: 'p1', nome: 'Sito', proprietario: 'A', percorso: 'C:\\P\\Sito' },
    { id: 'p2', nome: 'Mancante', proprietario: 'A', percorso: 'C:\\P\\Mancante' },
    { id: 'p3', nome: 'Lontano', proprietario: 'B', percorso: 'D:\\Lontano' }
  ]

  it('un workspace rinominato tiene il suo progetto: niente cartella nuova', () => {
    const c = collega(collegamentiVuoti(), 'Sito rinominato', { id: 'p1', nome: 'Sito' })
    expect(decidiProgettoWorkspace('Sito rinominato', c, progetti, opz)).toEqual({ tipo: 'usa', id: 'p1', percorso: 'C:\\P\\Sito', collega: false })
  })

  it('trovato per nome: si usa e va collegato', () => {
    expect(decidiProgettoWorkspace('sito', collegamentiVuoti(), progetti, opz)).toEqual({ tipo: 'usa', id: 'p1', percorso: 'C:\\P\\Sito', collega: true })
  })

  it('la cartella di un progetto di questo PC che manca non fa nascere un progetto nuovo', () => {
    expect(decidiProgettoWorkspace('Mancante', collegamentiVuoti(), progetti, opz).tipo).toBe('niente')
  })

  it('il progetto di un altro PC resta suo', () => {
    expect(decidiProgettoWorkspace('lontano', collegamentiVuoti(), progetti, opz)).toEqual({ tipo: 'altrove', id: 'p3', pc: 'B' })
  })

  it('un collegamento a un progetto tolto non lo fa rinascere', () => {
    const c = collega(collegamentiVuoti(), 'Eliminato', { id: 'tolto', nome: 'Eliminato' })
    expect(decidiProgettoWorkspace('Eliminato', c, progetti, opz).tipo).toBe('niente')
  })

  it('doppioni: si usa quello di qui con la cartella, se no niente', () => {
    const doppi = [...progetti, { id: 'p4', nome: 'sito (2)', proprietario: 'B', percorso: 'D:\\Sito' }]
    expect(decidiProgettoWorkspace('Sito', collegamentiVuoti(), doppi, opz)).toMatchObject({ tipo: 'usa', id: 'p1' })
    const soloAltrove = [{ id: 'x1', nome: 'Doppio', proprietario: 'B' }, { id: 'x2', nome: 'doppio', proprietario: 'C' }]
    expect(decidiProgettoWorkspace('Doppio', collegamentiVuoti(), soloAltrove, opz).tipo).toBe('niente')
  })

  it('nessun progetto con quella chiave: si crea con il nome comune; mai per una cartella di sistema', () => {
    expect(decidiProgettoWorkspace('Nuovo: bello', collegamentiVuoti(), progetti, opz)).toEqual({ tipo: 'crea', nomeCartella: 'Nuovo- bello' })
    expect(decidiProgettoWorkspace('Documents', collegamentiVuoti(), progetti, opz).tipo).toBe('niente')
  })

  it('«A:B» trova il progetto della cartella «A-B»', () => {
    const p = [{ id: 'ab', nome: 'A-B', proprietario: 'A', percorso: 'C:\\P\\A-B' }]
    expect(decidiProgettoWorkspace('A:B', collegamentiVuoti(), p, { ...opz, esiste: () => true })).toMatchObject({ tipo: 'usa', id: 'ab' })
  })
})

describe('il workspace si chiama come la cartella', () => {
  const progetti = [
    { id: 'p1', nome: 'Sito Web', proprietario: 'A', percorso: 'C:\\P\\Sito Web' },
    { id: 'p2', nome: 'gestionale', proprietario: 'B', percorso: 'D:\\Gestionale' },
    { id: 'p3', nome: 'Lungo', proprietario: 'A', percorso: `C:\\P\\${'L'.repeat(70)}` },
    { id: 'p4', nome: 'Doppio', proprietario: 'A', percorso: 'C:\\P\\Doppio' }
  ]
  const coll = (x: Record<string, string>): Collegamenti => ({ versione: 1, collegati: Object.fromEntries(Object.entries(x).map(([ws, id]) => [ws, { id, nome: ws }])) })

  it('rinomina i workspace collegati con un nome diverso dalla cartella', () => {
    const p = pianoNomiWorkspace({ workspace: ['sito web', 'Gestionale'], collegamenti: coll({ 'sito web': 'p1', Gestionale: 'p2' }), progetti })
    expect(p.rinomine).toEqual([{ da: 'sito web', a: 'Sito Web', progetto: 'p1' }])
    expect(p.collisioni).toEqual([])
    expect(p.collegamenti.collegati['Sito Web']).toEqual({ id: 'p1', nome: 'Sito Web' })
    expect(p.collegamenti.collegati['sito web']).toBeUndefined()
  })

  it('due workspace che vorrebbero lo stesso nome: nessuno si rinomina, si segnala', () => {
    const p = pianoNomiWorkspace({ workspace: ['doppio', 'DOPPIO!'], collegamenti: coll({ doppio: 'p4', 'DOPPIO!': 'p4' }), progetti })
    expect(p.rinomine).toEqual([])
    expect(p.collisioni).toHaveLength(1)
    expect(p.collisioni[0]?.workspace.sort()).toEqual(['DOPPIO!', 'doppio'])
  })

  it('il nome c’è già (un altro workspace): non si rinomina, si segnala', () => {
    const p = pianoNomiWorkspace({ workspace: ['sito', 'Sito Web'], collegamenti: coll({ sito: 'p1' }), progetti })
    expect(p.rinomine).toEqual([])
    expect(p.collisioni[0]).toMatchObject({ nome: 'Sito Web', workspace: ['sito', 'Sito Web'] })
  })

  it('una cartella con un nome che un workspace non può avere, e la casa di un autopilota, si segnalano', () => {
    const p = pianoNomiWorkspace({ workspace: ['Lungo', 'sito'], collegamenti: coll({ Lungo: 'p3', sito: 'p1' }), progetti, fermi: { sito: 'è la casa di un autopilota' } })
    expect(p.rinomine).toEqual([])
    expect(p.collisioni.map((c) => c.workspace[0]).sort()).toEqual(['Lungo', 'sito'])
  })

  it('nel tempo segue solo i progetti rinominati, e non disfa un «Torna come prima»', () => {
    // Il progetto si chiamava «Sito»: il collegamento lo ricorda, il workspace aveva quel nome.
    const c: Collegamenti = { versione: 1, collegati: { Sito: { id: 'p1', nome: 'Sito' }, 'nome mio': { id: 'p2', nome: 'Gestionale' } } }
    const p = pianoNomiWorkspace({ workspace: ['Sito', 'nome mio'], collegamenti: c, progetti, soloCambiati: true })
    expect(p.rinomine).toEqual([{ da: 'Sito', a: 'Sito Web', progetto: 'p1' }])
  })

  it('«Torna come prima» al contrario, solo dove si può', () => {
    expect(pianoTornaComePrima([{ da: 'a', a: 'A' }, { da: 'b', a: 'B' }, { da: 'c', a: 'C' }], ['A', 'B', 'b', 'x']))
      .toEqual([{ da: 'A', a: 'a' }])
    // Solo maiuscole: si può sempre.
    expect(pianoTornaComePrima([{ da: 'sito', a: 'Sito' }], ['Sito'])).toEqual([{ da: 'Sito', a: 'sito' }])
  })

  it('il nome di un workspace nuovo: quello della cartella scelta, o quello chiesto valido per la cartella', () => {
    expect(nomeWorkspaceNuovo('Mio', 'C:\\P\\Sito Web', [])).toBe('Sito Web')
    expect(nomeWorkspaceNuovo('Mio', 'C:\\P\\Sito Web', ['sito web'])).toBe('Mio')
    expect(nomeWorkspaceNuovo('A:B', undefined, [])).toBe('A-B')
    expect(nomeWorkspaceNuovo('Sito', undefined, [])).toBe('Sito')
    expect(nomeWorkspaceNuovo('Documents', undefined, [])).toBe('Documents')
  })
})
