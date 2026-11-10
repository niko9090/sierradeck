import { describe, it, expect, vi } from 'vitest'
import { aspettaDipendenze, compitiSbloccati, dipendenzeNonUnite, righeDopoUnione, rigaUnioneEPoi } from '../../src/autopilot-host/dipendenze'
import { ramoDelloSpecialistaFinito, senzaRamo } from '../../src/autopilot-host/servizio-orchestratore'
import { lavoroFermo } from '../../src/autopilot-host/lavoro-fermo'
import { ripresaDopoRiavvio } from '../../src/autopilot-host/ripresa-riavvio'
import { giudicaGuardiaOrchestratore } from '../../src/autopilot-host/guardia-orchestratore'
import { creaOrchestratore, type ProcessoClaude } from '../../src/autopilot-host/orchestratore'
import { codaVuota, type Coda } from '../../src/shared/coda-richieste'
import type { CompitoPiano, Piano } from '../../src/shared/piano-orchestratore'

const k = (id: string, o: Partial<CompitoPiano> = {}): CompitoPiano => ({ id, richiesta: 'r-1', titolo: `lavoro ${id}`, criterio: 'c', dopo: [], peso: 1, stato: 'da-fare', creato: '2026-11-10T08:00:00.000Z', ...o })
const piano = (...compiti: CompitoPiano[]): Piano => ({ versione: 1, compiti })

describe('compiti che aspettano un’unione (10/11)', () => {
  it('le dipendenze non unite: quelle unite o sparite dal piano non contano', () => {
    const p = piano(k('a', { stato: 'in-revisione' }), k('b', { stato: 'unito' }), k('c', { dopo: ['a', 'b', 'zz'] }))
    expect(dipendenzeNonUnite(p, 'c')).toEqual(['a'])
  })

  it('un compito da fare con il «dopo» in revisione o in corso si rifiuta, col motivo chiaro', () => {
    const p = piano(k('k-119', { stato: 'in-revisione' }), k('k-120', { dopo: ['k-119'] }))
    const q = aspettaDipendenze(p, 'k-120')
    expect(q?.aspetta).toEqual(['k-119'])
    expect(q?.motivo).toContain('aspetta l’unione di k-119: ti avviso io quando è unita')
    // Il motivo non deve far credere al flusso che l'Agent sia partito in sottofondo.
    expect(q?.motivo).not.toMatch(/background|sottofondo|async/iu)
  })

  it('passa: compito sconosciuto, già in corso, o con le dipendenze unite', () => {
    const p = piano(k('a', { stato: 'unito' }), k('b', { dopo: ['a'] }), k('c', { stato: 'in-corso', dopo: ['x'] }), k('x', { stato: 'in-revisione' }))
    expect(aspettaDipendenze(p, undefined)).toBeUndefined()
    expect(aspettaDipendenze(p, 'nonc')).toBeUndefined()
    expect(aspettaDipendenze(p, 'b')).toBeUndefined()
    expect(aspettaDipendenze(p, 'c')).toBeUndefined()
  })

  it('il compito segnato «in corso» dallo stesso Agent che chiama conta come da fare (il flusso arriva prima dell’hook)', () => {
    const p = piano(k('a', { stato: 'in-revisione' }), k('b', { stato: 'in-corso', chat: 'tu-1', dopo: ['a'] }))
    expect(aspettaDipendenze(p, 'b', 'tu-1')?.aspetta).toEqual(['a'])
    expect(aspettaDipendenze(p, 'b', 'tu-2')).toBeUndefined()
  })

  it('a unione finita: pronti quelli con le dipendenze unite, a parte quelli dopo un criterio rosso', () => {
    const p = piano(
      k('a', { stato: 'unito', criterioVerde: true }), k('r', { stato: 'unito', criterioVerde: false }),
      k('b', { dopo: ['a'] }), k('c', { dopo: ['r'] }), k('d', { dopo: ['a', 'b'] })
    )
    const s = compitiSbloccati(p)
    expect(s.pronti.map((c) => c.id)).toEqual(['b'])
    expect(s.daCorreggere.map((d) => [d.compito.id, d.rossi])).toEqual([['c', ['r']]])
    const righe = righeDopoUnione(p, 'a')
    expect(righe[0]).toContain('Adesso sono pronti da lanciare: b')
    expect(righe[0]).toContain('ORA')
    expect(righeDopoUnione(p, 'r')[0]).toContain('c aspetta la correzione di r')
    expect(righeDopoUnione(piano(k('x', { dopo: ['y'] }), k('y', { stato: 'in-revisione' })), 'y')).toEqual([])
  })

  // Correzioni del revisore (10/11)
  it('4: a unione finita si elencano solo i compiti il cui «dopo» contiene quello unito', () => {
    const p = piano(k('a', { stato: 'unito', criterioVerde: true }), k('b', { dopo: ['a'] }), k('senza'), k('altro', { dopo: ['zz'] }), k('zz', { stato: 'in-revisione' }))
    const righe = righeDopoUnione(p, 'a')
    expect(righe).toHaveLength(1)
    expect(righe[0]).toContain('b («lavoro b»)')
    expect(righe[0]).not.toContain('senza')
  })

  it('4: niente righe se l’unione non è riuscita, e niente per i compiti nella lista d’attesa dei posti', () => {
    const p = piano(k('a', { stato: 'unito', criterioVerde: true }), k('b', { dopo: ['a'] }), k('c', { dopo: ['a'] }))
    expect(righeDopoUnione(p, 'a', { riuscita: false })).toEqual([])
    const righe = righeDopoUnione(p, 'a', { inAttesa: new Set(['b']) })
    expect(righe[0]).toContain('c («lavoro c»)')
    expect(righe[0]).not.toContain('b («')
  })

  it('5: una dipendenza da un compito di una richiesta chiusa non blocca', () => {
    const p = piano(k('a', { stato: 'in-revisione', richiesta: 'r-9' }), k('b', { dopo: ['a'] }))
    expect(dipendenzeNonUnite(p, 'b')).toEqual(['a'])
    expect(dipendenzeNonUnite(p, 'b', new Set(['r-9']))).toEqual([])
    expect(aspettaDipendenze(p, 'b', undefined, new Set(['r-9']))).toBeUndefined()
    expect(aspettaDipendenze(p, 'b')?.aspetta).toEqual(['a'])
  })

  it('8: criterio non misurato non è rosso: «da misurare», con il suo messaggio', () => {
    const p = piano(k('a', { stato: 'unito' }), k('r', { stato: 'unito', criterioVerde: false }), k('b', { dopo: ['a'] }), k('c', { dopo: ['r'] }))
    const s = compitiSbloccati(p)
    expect(s.daMisurare.map((d) => [d.compito.id, d.ignote])).toEqual([['b', ['a']]])
    expect(s.daCorreggere.map((d) => d.compito.id)).toEqual(['c'])
    const righe = righeDopoUnione(p, 'a')
    expect(righe.join('\n')).toContain('b aspetta la misura del criterio di a')
    expect(righe.join('\n')).not.toContain('correzione')
  })

  it('9: «poi parte X» solo se X non aspetta altre dipendenze', () => {
    const p = piano(k('a', { stato: 'in-revisione' }), k('altra', { stato: 'in-corso' }), k('x', { dopo: ['a', 'altra'] }), k('y', { dopo: ['a'] }))
    const riga = rigaUnioneEPoi(p, ['a'])!
    expect(riga).toContain('poi parte y.')
    expect(riga).not.toContain('x')
  })

  it('2: il ramo dello specialista finito si ricava dall’agente; senza ramo né agente non c’è', () => {
    expect(ramoDelloSpecialistaFinito({ ramo: 'ap/x' })).toBe('ap/x')
    expect(ramoDelloSpecialistaFinito({ agente: 'a1b2c3' })).toBe('worktree-agent-a1b2c3')
    expect(ramoDelloSpecialistaFinito({ agente: 'agent-a1b2c3' })).toBe('worktree-agent-a1b2c3')
    expect(ramoDelloSpecialistaFinito({})).toBeUndefined()
    expect(senzaRamo(k('a', { ramo: 'worktree-agent-x', stato: 'in-revisione' }))).not.toHaveProperty('ramo')
  })

  it('la riga di stato: «unione in corso, poi parte k-120»', () => {
    const p = piano(k('k-119', { stato: 'in-revisione' }), k('k-120', { dopo: ['k-119'] }))
    expect(rigaUnioneEPoi(p, ['k-119'])).toContain('Unione in corso: k-119, poi parte k-120')
    expect(rigaUnioneEPoi(p, ['k-119'])).toContain('Non è un lavoro fermo')
    expect(rigaUnioneEPoi(piano(k('solo', { stato: 'in-revisione' })), ['solo'])).toContain('Non è un lavoro fermo')
    expect(rigaUnioneEPoi(p, [])).toBeUndefined()
  })
})

describe('il lavoro fermo non vede le unioni in corso (10/11)', () => {
  const coda: Coda = { ...codaVuota('Lavoro'), richieste: [{ id: 'r-1', stato: 'pianificata', titolo: 'la release', compiti: ['k-119', 'k-120'] }] as unknown as Coda['richieste'] }
  const p = piano(k('k-119', { stato: 'in-revisione', esito: 'finito' }), k('k-120', { dopo: ['k-119'] }))

  it('senza dirlo, un compito in revisione è «finito e non unito»', () => {
    expect(lavoroFermo({ coda, piano: p, alLavoro: new Set() })?.righe.join('\n')).toContain('k-119 finito e non unito')
  })

  it('con l’unione in corso o in fila non è fermo, e non lo diventa', () => {
    expect(lavoroFermo({ coda, piano: p, alLavoro: new Set(), inUnione: new Set(['k-119']) })).toBeUndefined()
  })

  it('la ripresa dopo il riavvio non lo conta fermo, ma dice che l’unione è ripartita', () => {
    const orfano = piano(k('k-119', { stato: 'in-revisione' }), k('k-130', { stato: 'in-corso' }))
    const conOrfano: Coda = { ...coda, richieste: [{ ...coda.richieste[0]!, compiti: ['k-119', 'k-130'] }] }
    const r = ripresaDopoRiavvio({ coda: conOrfano, piano: orfano, dialogo: [], adesso: 0, inUnione: new Set(['k-119']) })
    expect(r?.testo).toContain('k-130 risulta in corso ma nessuno specialista ci lavora più')
    expect(r?.testo).not.toContain('k-119 finito e non unito')
    expect(r?.testo).toContain('Le unioni di k-119 le ho rimesse in marcia io')
    // Solo l'unione in corso: niente da dire all'autopilota, lo sveglia la fine dell'unione.
    expect(ripresaDopoRiavvio({ coda, piano: p, dialogo: [], adesso: 0, inUnione: new Set(['k-119']) })).toBeUndefined()
  })
})

describe('la guardia rifiuta l’Agent che aspetta un’unione (10/11)', () => {
  const ctx = { radice: '/p', specialistiSulPc: 0, tettoPc: 4, tipiSpecialisti: ['sviluppatore'] }
  const agent = { tool_name: 'Agent', tool_input: { subagent_type: 'sviluppatore', description: 'k-120: la release', prompt: 'fai' } }

  it('rifiuta col motivo, prima di prendere un posto in fila', () => {
    const fila = vi.fn(() => ({ passa: true as const }))
    const g = giudicaGuardiaOrchestratore(agent, { ...ctx, fila, dipendenze: () => 'aspetta l’unione di k-119: ti avviso io quando è unita.' })
    expect(g.ok).toBe(false)
    expect(!g.ok && g.motivo).toContain('aspetta l’unione di k-119')
    expect(fila).not.toHaveBeenCalled()
  })

  it('senza dipendenze passa', () => {
    expect(giudicaGuardiaOrchestratore(agent, { ...ctx, dipendenze: () => undefined })).toEqual({ ok: true })
  })
})

describe('un evento «subito» non aspetta la raccolta (10/11)', () => {
  function banco(raccoltaMs: number) {
    const scritte: string[] = []
    const righe: ((r: string) => void)[] = []
    const proc: ProcessoClaude = { scrivi: (r) => { scritte.push(r) }, uccidi: () => {}, suRiga: (f) => { righe.push(f) }, suUscita: () => {} }
    const o = creaOrchestratore({
      avvia: () => proc,
      impostazioni: () => ({ attivo: true, tettoSpecialisti: 3 } as never),
      cambiaImpostazioni: () => {},
      contesto: () => ({ cwd: process.cwd(), riassunto: 'stato', indice: '', agenti: '', impostazioniCli: '', mcpConfig: '', tetto: 3 }),
      ultime: () => [],
      risposta: () => {},
      errore: () => {},
      adesso: () => '2026-11-10T08:00:00.000Z',
      raccoltaMs
    })
    const chiudiTurno = (): void => { for (const f of righe) f(JSON.stringify({ type: 'result', result: 'ok', session_id: 's', usage: { input_tokens: 1 } })) }
    return { o, scritte, chiudiTurno }
  }

  it('con la raccolta lunga, l’evento normale aspetta; quello subito parte', async () => {
    const { o, scritte, chiudiTurno } = banco(60_000)
    o.evento('ws', { tipo: 'fermo', quando: '2026-11-10T08:00:00.000Z', testo: 'normale' })
    await new Promise((ris) => setTimeout(ris, 30))
    expect(scritte).toHaveLength(0)
    o.evento('ws', { tipo: 'unione', quando: '2026-11-10T08:00:01.000Z', testo: 'unione finita, k-120 pronto' }, true)
    expect(scritte).toHaveLength(1)
    expect(scritte[0]).toContain('unione finita, k-120 pronto')
    expect(scritte[0]).toContain('normale')
    chiudiTurno()
    o.spegni()
  })

  it('durante un turno in corso aspetta la fine del turno, poi parte', () => {
    const { o, scritte, chiudiTurno } = banco(60_000)
    o.messaggio('ws', { quando: '2026-11-10T08:00:00.000Z', testo: 'ciao' })
    expect(scritte).toHaveLength(1)
    o.evento('ws', { tipo: 'unione', quando: '2026-11-10T08:00:01.000Z', testo: 'unione finita' }, true)
    expect(scritte).toHaveLength(1)
    chiudiTurno()
    expect(scritte).toHaveLength(2)
    expect(scritte[1]).toContain('unione finita')
    o.spegni()
  })
})
