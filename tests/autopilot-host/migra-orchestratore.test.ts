import { describe, it, expect, afterEach } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { nuovoAutopilota, type Autopilota } from '@shared/autopilota'
import { aggiungi, codaVuota } from '@shared/coda-richieste'
import { archiviaVecchiAutopiloti, campiVecchi, hookAdottato, nuovoUnico, obiettiviInCoda, passaAllUnico, type Vecchio } from '../../src/autopilot-host/migra-orchestratore'
import { fermataSpecialista } from '../../src/autopilot-host/stop-specialista'
import { leggiWorktree, ramoDelloSpecialista } from '../../src/autopilot-host/servizio-orchestratore'

/**
 * P3/P4: il passaggio all'autopilota del workspace (le chat vive adottate con
 * worktree e ramo, «solo mia» compresa, gli hook con l'id di prima, una volta
 * sola), lo Stop delle chat adottate senza modello, il ramo del worktree di un
 * subagente per il cancello, e i file di prima nel recupero.
 */

const ADESSO = '2026-10-30T09:00:00.000Z'

function ap(id: string, p: Partial<Vecchio> = {}): Vecchio {
  return {
    ...nuovoAutopilota({ id, nome: `Lavoro ${id}`, obiettivo: `obiettivo di ${id}`, cwd: 'E:/progetto', iniziatoIl: '2026-10-29T08:00:00.000Z', workspace: 'Lavoro' }),
    stato: 'lavoro',
    ...p
  }
}

const messaggio = (a: Vecchio, testo: string, chats: string[], id: string): Vecchio => ({ ...a, daConsegnare: [...a.daConsegnare, { id, quando: ADESSO, testo, chats }] })

describe('passaggio all’autopilota del workspace', () => {
  it('adotta le chat vive con worktree e ramo, i messaggi in coda le seguono; i vecchi non si toccano', () => {
    const a1 = messaggio(ap('ap-1', {
      ramoBase: 'main',
      chats: [
        { id: 'c-1', compito: 'la barra', stato: 'lavoro', cicli: 2, sessionId: 's-1', cartella: 'E:/progetto/.wt/c-1', ramo: 'ap/ap-1/c-1' },
        { id: 'c-2', compito: 'finita', stato: 'finita', cicli: 1 }
      ],
      adottate: [{ sessionId: 's-mia', titolo: 'la mia chat', soloMia: true, adottataIl: ADESSO }]
    }), 'ricordati i test', ['c-1'], 'm-1')
    const a2 = ap('ap-2', { chats: [{ id: 'c-1', compito: 'il pannello', stato: 'lavoro', cicli: 1, sessionId: 's-2' }] })
    const e = passaAllUnico({ ws: 'Lavoro', autopiloti: [a1, a2], id: 'ap-unico', adesso: ADESSO })
    expect(e.unico.id).toBe('ap-unico')
    expect(e.unico.ramoBase).toBe('main')
    expect(e.unico.chats.map((c) => c.id)).toEqual(['c-1', 'c-2'])
    expect(e.unico.chats[0]).toMatchObject({ cartella: 'E:/progetto/.wt/c-1', ramo: 'ap/ap-1/c-1', sessionId: 's-1', origine: { autopilota: 'ap-1', chat: 'c-1' } })
    expect(e.unico.chats[1]).toMatchObject({ sessionId: 's-2', origine: { autopilota: 'ap-2', chat: 'c-1' } })
    expect(e.unico.daConsegnare).toEqual([{ id: 'm-1', quando: ADESSO, testo: 'ricordati i test', chats: ['c-1'] }])
    expect(e.unico.adottate).toEqual([{ sessionId: 's-mia', titolo: 'la mia chat', soloMia: true, adottataIl: ADESSO }])
    expect(e.adottate).toEqual([{ da: 'ap-1', chat: 'c-1', nuova: 'c-1' }, { da: 'ap-2', chat: 'c-1', nuova: 'c-2' }])
    expect(e.assorbiti).toEqual(['ap-1', 'ap-2'])
  })

  it('rifatto sullo stesso autopilota non adotta due volte né duplica i messaggi', () => {
    const a1 = messaggio(ap('ap-1', { chats: [{ id: 'c-1', compito: 'la barra', stato: 'lavoro', cicli: 2, sessionId: 's-1' }] }), 'ciao', ['c-1'], 'm-1')
    const prima = passaAllUnico({ ws: 'Lavoro', autopiloti: [a1], id: 'ap-unico', adesso: ADESSO })
    const dopo = passaAllUnico({ ws: 'Lavoro', autopiloti: [a1], id: 'ap-unico', adesso: ADESSO, unico: prima.unico })
    expect(dopo.unico.chats).toHaveLength(1)
    expect(dopo.unico.daConsegnare).toHaveLength(1)
    expect(dopo.adottate).toEqual([])
  })

  it('gli hook con gli id di prima arrivano alla chat adottata', () => {
    const a2 = ap('ap-2', { chats: [{ id: 'c-1', compito: 'il pannello', stato: 'lavoro', cicli: 1, sessionId: 's-2' }] })
    const e = passaAllUnico({ ws: 'Lavoro', autopiloti: [ap('ap-1', { chats: [{ id: 'c-1', compito: 'x', stato: 'lavoro', cicli: 0 }] }), a2], id: 'ap-unico', adesso: ADESSO })
    expect(hookAdottato([e.unico], 'ap-2', 'c-1')).toEqual({ id: 'ap-unico', chat: 'c-2' })
    expect(hookAdottato([e.unico], 'ap-2', 'c-9')).toBeUndefined()
  })

  it('gli obiettivi di chi si stava ancora preparando entrano in coda, una volta sola', () => {
    const pronto = ap('ap-3', { stato: 'intervista', obiettivo: 'rifai la pagina del telefono', obiettivoTuo: 'rifai la pagina del telefono' })
    const m = obiettiviInCoda(codaVuota('Lavoro'), [pronto])
    expect(m.coda.richieste.map((r) => r.testo)).toEqual(['rifai la pagina del telefono'])
    expect(obiettiviInCoda(m.coda, [pronto]).coda.richieste).toHaveLength(1)
    expect(obiettiviInCoda(aggiungi(codaVuota('Lavoro'), { testo: 'x', quando: ADESSO }).coda, [ap('ap-4')]).coda.richieste).toHaveLength(1)
  })

  it('i campi di prima si leggono dal JSON grezzo, tolleranti', () => {
    expect(campiVecchi({ obiettivoTuo: 'le mie parole', compitiDaFare: ['a', 3], criteri: [{ x: 1 }], richieste: 'rotto' })).toMatchObject({ obiettivoTuo: 'le mie parole', compitiDaFare: ['a'] })
    expect(campiVecchi(null)).toEqual({})
  })

  it('un workspace nuovo ha il suo autopilota al lavoro, senza chat', () => {
    const u = nuovoUnico({ id: 'ap-n', ws: 'Nuovo', cwd: 'E:/nuovo', adesso: ADESSO })
    expect(u).toMatchObject({ workspace: 'Nuovo', stato: 'lavoro', chats: [] })
    expect('unico' in u).toBe(false)
  })
})

describe('Stop di una chat adottata (senza modello, senza criteri)', () => {
  const unico = (): Autopilota => ({ ...ap('ap-u'), chats: [{ id: 'c-1', compito: 'la barra', stato: 'lavoro', cicli: 3, sessionId: 's-1' }] })

  it('con un messaggio in coda lo consegna con la fine del turno (block), senza evento', () => {
    const a = { ...unico(), daConsegnare: [{ id: 'm-1', quando: ADESSO, testo: 'aggiungi anche il colore', chats: ['c-1'] }] }
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

describe('i file degli autopiloti di prima nel recupero (P4)', () => {
  let radice = ''
  afterEach(() => { if (radice !== '') rmSync(radice, { recursive: true, force: true }) })

  it('sposta solo quelli già passati all’autopilota del workspace, con i file accanto; il resto resta', () => {
    radice = mkdtempSync(join(tmpdir(), 'sd-archivia-'))
    const autopiloti = join(radice, 'autopiloti')
    const orchestratori = join(radice, 'orchestratori')
    const recupero = join(radice, 'recupero')
    mkdirSync(join(autopiloti, 'istruzioni'), { recursive: true })
    mkdirSync(join(autopiloti, 'servizio'), { recursive: true })
    mkdirSync(join(orchestratori, 'ws-1'), { recursive: true })
    for (const n of ['ap-vecchio.json', 'ap-vecchio.decisioni.jsonl', 'ap-unico.json', 'ap-nuovo.json', 'consegne-numero.json']) writeFileSync(join(autopiloti, n), '{}')
    writeFileSync(join(autopiloti, 'istruzioni', 'ap-vecchio.jsonl'), '')
    writeFileSync(join(autopiloti, 'servizio', 'tempi.jsonl'), '')
    writeFileSync(join(autopiloti, 'servizio', 'domande-aperte.json'), '[]')
    writeFileSync(join(orchestratori, 'ws-1', 'orchestratore.json'), JSON.stringify({ autopilota: 'ap-unico', assorbiti: ['ap-vecchio'] }))

    const r = archiviaVecchiAutopiloti(autopiloti, recupero)
    expect(r.errori).toEqual([])
    expect(r.autopiloti).toEqual(['ap-vecchio'])
    expect(r.tenuti).toEqual(['ap-nuovo'])
    expect(r.altri.sort()).toEqual(['ap-vecchio.decisioni.jsonl', 'istruzioni', 'servizio/tempi.jsonl'])
    expect(readdirSync(autopiloti).sort()).toEqual(['ap-nuovo.json', 'ap-unico.json', 'consegne-numero.json', 'servizio'])
    expect(existsSync(join(autopiloti, 'servizio', 'domande-aperte.json'))).toBe(true)
    expect(existsSync(join(recupero, 'ap-vecchio.json'))).toBe(true)
    expect(existsSync(join(recupero, 'istruzioni', 'ap-vecchio.jsonl'))).toBe(true)

    // Una seconda volta non c'è più niente da spostare.
    expect(archiviaVecchiAutopiloti(autopiloti, recupero)).toMatchObject({ autopiloti: [], altri: [], errori: [] })
  })

  it('senza la cartella degli autopiloti non fa niente', () => {
    radice = mkdtempSync(join(tmpdir(), 'sd-archivia-'))
    expect(archiviaVecchiAutopiloti(join(radice, 'non-c-e'), join(radice, 'recupero'))).toMatchObject({ autopiloti: [], altri: [], tenuti: [], errori: [] })
  })
})
