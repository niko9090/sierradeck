import { describe, it, expect } from 'vitest'
import { nuovoAutopilota, type Autopilota } from '@shared/autopilota'
import { aggiungi, codaVuota } from '@shared/coda-richieste'
import { hookAdottato, nuovoUnico, obiettiviInCoda, passaAllUnico } from '../../src/autopilot-host/migra-orchestratore'
import { fermataSpecialista } from '../../src/autopilot-host/stop-specialista'
import { conMessaggioPerLaChat } from '../../src/autopilot-host/dialogo'
import { leggiWorktree, ramoDelloSpecialista } from '../../src/autopilot-host/servizio-orchestratore'

/**
 * P3: il passaggio all'autopilota unico (le chat vive adottate con worktree e
 * ramo, «solo mia» compresa, i precedenti in sola lettura, gli hook con l'id
 * di prima), lo Stop delle chat adottate senza modello, e il ramo del
 * worktree di un subagente per il cancello.
 */

const ADESSO = '2026-10-30T09:00:00.000Z'

function ap(id: string, p: Partial<Autopilota> = {}): Autopilota {
  return {
    ...nuovoAutopilota({ id, nome: `Lavoro ${id}`, obiettivo: `obiettivo di ${id}`, cwd: 'E:/progetto', criteri: [{ descrizione: 'test', comando: 'npm test', soddisfatto: false }], iniziatoIl: '2026-10-29T08:00:00.000Z', workspace: 'Lavoro' }),
    stato: 'lavoro',
    ...p
  }
}

describe('passaggio all’autopilota unico', () => {
  it('adotta le chat vive con worktree e ramo, i messaggi in coda le seguono, i vecchi vanno fra i precedenti', () => {
    const a1 = conMessaggioPerLaChat(ap('ap-1', {
      ramoBase: 'main',
      chats: [
        { id: 'c-1', compito: 'la barra', stato: 'lavoro', cicli: 2, sessionId: 's-1', cartella: 'E:/progetto/.wt/c-1', ramo: 'ap/ap-1/c-1' },
        { id: 'c-2', compito: 'finita', stato: 'finita', cicli: 1 }
      ],
      adottate: [{ sessionId: 's-mia', titolo: 'la mia chat', soloMia: true, adottataIl: ADESSO }]
    }), 'ricordati i test', ADESSO, ['c-1'], 'm-1')
    const a2 = ap('ap-2', { chats: [{ id: 'c-1', compito: 'il pannello', stato: 'lavoro', cicli: 1, sessionId: 's-2' }] })
    const e = passaAllUnico({ ws: 'Lavoro', autopiloti: [a1, a2], id: 'ap-unico', adesso: ADESSO })
    expect(e.unico.unico).toBe(true)
    expect(e.unico.ramoBase).toBe('main')
    expect(e.unico.chats.map((c) => c.id)).toEqual(['c-1', 'c-2'])
    expect(e.unico.chats[0]).toMatchObject({ cartella: 'E:/progetto/.wt/c-1', ramo: 'ap/ap-1/c-1', sessionId: 's-1', origine: { autopilota: 'ap-1', chat: 'c-1' } })
    expect(e.unico.chats[1]).toMatchObject({ sessionId: 's-2', origine: { autopilota: 'ap-2', chat: 'c-1' } })
    expect(e.unico.daConsegnare).toEqual([{ id: 'm-1', quando: ADESSO, testo: 'ricordati i test', chats: ['c-1'] }])
    expect(e.unico.adottate).toEqual([{ sessionId: 's-mia', titolo: 'la mia chat', soloMia: true, adottataIl: ADESSO }])
    expect(e.adottate).toEqual([{ da: 'ap-1', chat: 'c-1', nuova: 'c-1' }, { da: 'ap-2', chat: 'c-1', nuova: 'c-2' }])
    for (const p of e.precedenti) {
      expect(p).toMatchObject({ archiviato: true, passatoA: 'ap-unico', riprendiAlRiavvio: false, stato: 'sospeso', daConsegnare: [] })
      expect(p.chats.every((c) => c.stato === 'finita')).toBe(true)
    }
  })

  it('gli hook con gli id di prima arrivano alla chat adottata', () => {
    const a2 = ap('ap-2', { chats: [{ id: 'c-1', compito: 'il pannello', stato: 'lavoro', cicli: 1, sessionId: 's-2' }] })
    const e = passaAllUnico({ ws: 'Lavoro', autopiloti: [ap('ap-1', { chats: [{ id: 'c-1', compito: 'x', stato: 'lavoro', cicli: 0 }] }), a2], id: 'ap-unico', adesso: ADESSO })
    const prima = e.precedenti.find((p) => p.id === 'ap-2')
    expect(hookAdottato(prima, e.unico, 'c-1')).toEqual({ id: 'ap-unico', chat: 'c-2' })
    expect(hookAdottato(prima, e.unico, 'c-9')).toBeUndefined()
  })

  it('gli obiettivi di chi si stava ancora preparando entrano in coda, una volta sola', () => {
    const pronto = ap('ap-3', { stato: 'intervista', obiettivo: 'rifai la pagina del telefono', obiettivoTuo: 'rifai la pagina del telefono' })
    const m = obiettiviInCoda(codaVuota('Lavoro'), [pronto])
    expect(m.coda.richieste.map((r) => r.testo)).toEqual(['rifai la pagina del telefono'])
    expect(obiettiviInCoda(m.coda, [pronto]).coda.richieste).toHaveLength(1)
    expect(obiettiviInCoda(aggiungi(codaVuota('Lavoro'), { testo: 'x', quando: ADESSO }).coda, [ap('ap-4')]).coda.richieste).toHaveLength(1)
  })

  it('un workspace nuovo ha un autopilota unico al lavoro, senza chat', () => {
    const u = nuovoUnico({ id: 'ap-n', ws: 'Nuovo', cwd: 'E:/nuovo', adesso: ADESSO })
    expect(u).toMatchObject({ unico: true, workspace: 'Nuovo', stato: 'lavoro', chats: [] })
  })
})

describe('Stop di una chat adottata (senza modello, senza criteri)', () => {
  const unico = (): Autopilota => ({ ...ap('ap-u'), unico: true, chats: [{ id: 'c-1', compito: 'la barra', stato: 'lavoro', cicli: 3, sessionId: 's-1' }] })

  it('con un messaggio in coda lo consegna con la fine del turno (block), senza evento', () => {
    const a = conMessaggioPerLaChat(unico(), 'aggiungi anche il colore', ADESSO, ['c-1'], 'm-1')
    const f = fermataSpecialista(a, 'c-1', { last_assistant_message: 'fatto metà', session_id: 's-1' }, ADESSO)
    expect(f.risposta).toMatchObject({ decision: 'block' })
    expect(String(f.risposta.reason)).toContain('aggiungi anche il colore')
    expect(f.evento).toBeUndefined()
    expect(f.autopilota.daConsegnare).toHaveLength(0)
    expect(f.autopilota.chats[0]!.cicli).toBe(4)
  })

  it('senza messaggi: {} e un evento con il rapporto', () => {
    const f = fermataSpecialista(unico(), 'c-1', { last_assistant_message: 'Ho finito la barra.\nRAPPORTO: finita — la barra mostra il numero\nSEGNALE: fatto' }, ADESSO)
    expect(f.risposta).toEqual({})
    expect(f.evento).toMatchObject({ tipo: 'finito', chat: 'c-1' })
  })

  it('una chat che non è sua (o finita) si lascia fermare', () => {
    expect(fermataSpecialista(unico(), 'c-9', {}, ADESSO).risposta).toEqual({})
  })
})

describe('il ramo del subagente per il cancello', () => {
  const porcelain = [
    'worktree E:/progetto', 'HEAD aaa', 'branch refs/heads/main', '',
    'worktree E:/progetto/.claude/worktrees/agent-a1b2', 'HEAD bbb', 'branch refs/heads/worktree-agent-a1b2', '',
    'worktree E:/progetto/.claude/worktrees/agent-c3d4', 'HEAD ccc', 'branch refs/heads/worktree-agent-c3d4', ''
  ].join('\n')
  const voci = leggiWorktree(porcelain)
  const nati: Record<string, number> = { 'E:/progetto/.claude/worktrees/agent-a1b2': Date.parse('2026-10-30T08:00:00.000Z'), 'E:/progetto/.claude/worktrees/agent-c3d4': Date.parse('2026-10-30T09:01:00.000Z') }
  const nato = (c: string): number | undefined => nati[c]

  it('legge git worktree list --porcelain', () => {
    expect(voci).toEqual([
      { cartella: 'E:/progetto', ramo: 'main' },
      { cartella: 'E:/progetto/.claude/worktrees/agent-a1b2', ramo: 'worktree-agent-a1b2' },
      { cartella: 'E:/progetto/.claude/worktrees/agent-c3d4', ramo: 'worktree-agent-c3d4' }
    ])
  })

  it('dagli eventi, dall’id dell’agente, o l’unico worktree nato dopo la partenza', () => {
    expect(ramoDelloSpecialista({ ramo: 'r-x', inizio: ADESSO }, voci, { presi: new Set(), nato })).toEqual({ ok: true, ramo: 'r-x' })
    expect(ramoDelloSpecialista({ agente: 'a1b2', inizio: ADESSO }, voci, { presi: new Set(), nato })).toMatchObject({ ok: true, ramo: 'worktree-agent-a1b2' })
    expect(ramoDelloSpecialista({ inizio: ADESSO }, voci, { presi: new Set(), nato })).toMatchObject({ ok: true, ramo: 'worktree-agent-c3d4' })
    expect(ramoDelloSpecialista({ inizio: ADESSO }, voci, { presi: new Set(['worktree-agent-c3d4']), nato }).ok).toBe(false)
    expect(ramoDelloSpecialista({ inizio: '2026-10-30T07:00:00.000Z' }, voci, { presi: new Set(), nato }).ok).toBe(false)
  })
})
