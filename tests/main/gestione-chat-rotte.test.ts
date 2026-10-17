import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { rotteClient, type DipendenzeRotte } from '../../src/main/client-rotte'
import { apriDispositivi } from '../../src/main/dispositivi'
import { ROTTE_PONTE } from '@shared/ponte-telefono'
import { propostaChatEliminate } from '@shared/spazio-drive'
import type { RichiestaAzione } from '../../src/main/gestione-chat'

// 0.79.0: la gestione delle chat dalla pagina, dall'app e dal ponte. Il
// motore è finto: qui si prova che le rotte passano le richieste giuste e
// restituiscono le stesse risposte del PC.

const S1 = '11111111-1111-4111-8111-111111111111'
const S2 = '22222222-2222-4222-8222-222222222222'

function finto() {
  const chiamate: { azioni: RichiestaAzione[]; svuota: unknown[]; ripristina: string[] } = { azioni: [], svuota: [], ripristina: [] }
  const gc: NonNullable<DipendenzeRotte['gestioneChat']> = {
    spazio: async () => ({
      chat: [
        { sessione: S2, titolo: 'Grande', slug: 'p', byte: 300, parti: {}, archiviata: false, aperta: false },
        { sessione: S1, titolo: 'Piccola', slug: 'p', byte: 10, parti: {}, archiviata: false, aperta: true, nonEliminabile: '«Piccola» sta lavorando: aspetta che finisca, poi chiudila.' }
      ],
      totale: 310, eliminabili: 300, recupero: { chat: 0, byte: 0 }
    }),
    azione: async (r) => { chiamate.azioni.push(r); return { azione: r.azione, esiti: [], fatte: r.sessioni.length, rifiutate: 0, messaggio: 'ok' } },
    archiviate: () => [{ sessione: S1, il: '2026-10-17T10:00:00Z' }],
    eArchiviata: (s) => s === S1,
    recupero: () => ({ chat: [], byte: 0 }),
    ripristinaDalRecupero: async (id) => { chiamate.ripristina.push(id); return id === 'r-1' ? { ok: true, messaggio: 'rimessa' } : { ok: false, messaggio: 'Questa chat non è più nel recupero.' } },
    chiediSvuota: (anche) => ({ ok: true, messaggio: anche ? 'anche Drive' : 'solo PC', gettone: 'g-1', chat: 1, byte: 10, frase: 'SVUOTA' }),
    svuota: async (p) => { chiamate.svuota.push(p); return p.frase === 'SVUOTA' ? { ok: true, messaggio: 'svuotato', byte: 10 } : { ok: false, messaggio: 'Per svuotare davvero scrivi SVUOTA.' } }
  }
  return { gc, chiamate }
}

function deps(over: Partial<DipendenzeRotte> = {}): DipendenzeRotte {
  return {
    dispositivi: apriDispositivi(mkdtempSync(join(tmpdir(), 'sd-rotte-gc-'))),
    chat: () => [],
    autopiloti: () => Promise.resolve([]),
    rispondi: () => Promise.resolve(),
    domande: () => Promise.resolve([]),
    scriviAChat: () => undefined,
    apriChat: () => undefined,
    cartelle: () => Promise.resolve([]),
    workspace: () => Promise.resolve({ nomi: ['lavoro'], attivo: 'lavoro' }),
    cambiaWorkspace: () => Promise.resolve(),
    fermaAutopilota: () => Promise.resolve(),
    riprendiAutopilota: () => Promise.resolve(),
    vaiAutopilota: () => Promise.resolve(),
    creaAutopilota: () => Promise.resolve({ id: 'ap-9' }),
    eliminaAutopilota: () => Promise.resolve(),
    riprendiAlRiavvio: () => Promise.resolve(),
    chiudiChat: () => undefined,
    rinominaChat: () => undefined,
    sessioni: () => Promise.resolve([
      { id: S1, cwd: 'C:\\lavoro', titolo: 'Archiviata', quando: '2026-10-13T10:00:00.000Z' },
      { id: S2, cwd: 'C:\\lavoro', titolo: 'Normale', quando: '2026-10-13T10:00:00.000Z' }
    ]),
    riprendiSessione: () => undefined,
    creaWorkspace: () => Promise.resolve(),
    eliminaWorkspace: () => Promise.resolve(),
    salvataggi: () => Promise.resolve([]),
    caricaIstantanea: () => Promise.resolve(),
    consumi: () => Promise.resolve({}),
    quaderno: () => [],
    scheda: () => undefined,
    impostaPreferenze: () => Promise.resolve(),
    aggiornamento: () => ({ fase: 'fermo' as const }),
    cercaAggiornamento: () => undefined,
    scaricaAggiornamento: () => undefined,
    installaAggiornamento: () => undefined,
    versione: '0.79.0',
    apk: () => Promise.resolve(undefined),
    ...over
  } as DipendenzeRotte
}

const post = (percorso: string, corpo: unknown, dispositivo?: string) => ({ metodo: 'POST', percorso, corpo, ...(dispositivo !== undefined ? { dispositivo } : {}) })

describe('/api/chat/gestione', () => {
  it('un PC che non lo sa ancora lo dice', async () => {
    const r = await rotteClient(deps())(post('/api/chat/gestione/spazio', {}))
    expect(r.stato).toBe(409)
    expect((r.corpo as { errore: string }).errore).toMatch(/0\.79\.0/)
  })

  it('lo spazio, dalla più grande, con la selezione e il suo totale', async () => {
    const { gc } = finto()
    const r = await rotteClient(deps({ gestioneChat: gc }))(post('/api/chat/gestione/spazio', { sessioni: [S1, S2] }))
    expect(r.stato).toBe(200)
    const c = r.corpo as { chat: { sessione: string }[]; selezione: { byte: number; eliminabili: number; escluse: { motivo: string }[] } }
    expect(c.chat.map((x) => x.sessione)).toEqual([S2, S1])
    expect(c.selezione.byte).toBe(310)
    expect(c.selezione.eliminabili).toBe(1)
    expect(c.selezione.escluse[0]?.motivo).toMatch(/sta lavorando/)
  })

  it('le azioni: chi chiede (telefono, altro PC) e chi guarda arrivano al motore', async () => {
    const { gc, chiamate } = finto()
    const rotte = rotteClient(deps({ gestioneChat: gc }))
    expect((await rotte(post('/api/chat/gestione/azione', { azione: 'elimina', sessioni: [S1], ancheDalDrive: true }, 'tel-1'))).stato).toBe(200)
    expect((await rotte(post('/api/chat/gestione/azione', { azione: 'archivia', sessioni: [S2] }, 'pc:pc-esempio'))).stato).toBe(200)
    expect((await rotte(post('/api/chat/gestione/azione', { azione: 'rinomina', sessioni: [S2], nome: 'x'.repeat(200) }))).stato).toBe(200)
    expect(chiamate.azioni[0]).toMatchObject({ azione: 'elimina', sessioni: [S1], ancheDalDrive: true, da: 'telefono', visore: 'tel:tel-1' })
    expect(chiamate.azioni[1]).toMatchObject({ azione: 'archivia', ancheDalDrive: false, da: 'altro PC', visore: 'pc:pc-esempio' })
    expect(chiamate.azioni[2]?.nome).toHaveLength(80)
  })

  it('azioni sconosciute o senza chat: no', async () => {
    const { gc, chiamate } = finto()
    const rotte = rotteClient(deps({ gestioneChat: gc }))
    expect((await rotte(post('/api/chat/gestione/azione', { azione: 'cancella-tutto', sessioni: [S1] }))).stato).toBe(400)
    expect((await rotte(post('/api/chat/gestione/azione', { azione: 'elimina', sessioni: [] }))).stato).toBe(400)
    expect((await rotte(post('/api/chat/gestione/azione', { azione: 'elimina', sessioni: 'tutte' }))).stato).toBe(400)
    expect((await rotte(post('/api/chat/gestione/boh', {}))).stato).toBe(404)
    expect(chiamate.azioni).toEqual([])
  })

  it('«Svuota adesso» in due passi: prima il gettone, poi la parola', async () => {
    const { gc, chiamate } = finto()
    const rotte = rotteClient(deps({ gestioneChat: gc }))
    const primo = await rotte(post('/api/chat/gestione/svuota', { ancheDalDrive: true }))
    expect(primo.corpo).toMatchObject({ ok: true, gettone: 'g-1', frase: 'SVUOTA', messaggio: 'anche Drive' })
    expect(chiamate.svuota).toEqual([])
    const no = await rotte(post('/api/chat/gestione/svuota', { ancheDalDrive: true, gettone: 'g-1', frase: 'sì' }))
    expect(no.stato).toBe(409)
    const si = await rotte(post('/api/chat/gestione/svuota', { ancheDalDrive: true, gettone: 'g-1', frase: 'SVUOTA' }))
    expect(si.stato).toBe(200)
    expect(chiamate.svuota[1]).toMatchObject({ gettone: 'g-1', frase: 'SVUOTA', ancheDalDrive: true })
  })

  it('archiviate, recupero e ripristino', async () => {
    const { gc } = finto()
    const rotte = rotteClient(deps({ gestioneChat: gc }))
    expect((await rotte(post('/api/chat/gestione/archiviate', {}))).corpo).toEqual({ archiviate: [{ sessione: S1, il: '2026-10-17T10:00:00Z' }] })
    expect((await rotte(post('/api/chat/gestione/recupero', {}))).corpo).toEqual({ chat: [], byte: 0 })
    expect((await rotte(post('/api/chat/gestione/ripristina', { id: 'r-1' }))).stato).toBe(200)
    expect((await rotte(post('/api/chat/gestione/ripristina', { id: 'r-9' }))).stato).toBe(409)
    expect((await rotte(post('/api/chat/gestione/ripristina', {}))).stato).toBe(400)
  })

  it('passano dal ponte, verso gli altri PC della stessa cassaforte', () => {
    for (const p of ['spazio', 'azione', 'archiviate', 'recupero', 'ripristina', 'svuota']) expect(ROTTE_PONTE).toContain(`/api/chat/gestione/${p}`)
  })
})

describe('/api/sessioni senza le archiviate', () => {
  it('le archiviate non sono nell’elenco «Riprendi»; `archiviate: true` le mostra', async () => {
    const { gc } = finto()
    const rotte = rotteClient(deps({ gestioneChat: gc }))
    const r = await rotte(post('/api/sessioni', {}))
    expect((r.corpo as { sessioni: { id: string }[] }).sessioni.map((s) => s.id)).toEqual([S2])
    expect((r.corpo as { archiviate?: number }).archiviate).toBe(1)
    const tutte = await rotte(post('/api/sessioni', { archiviate: true }))
    expect((tutte.corpo as { sessioni: { id: string }[] }).sessioni.map((s) => s.id)).toEqual([S1, S2])
  })

  it('un PC senza il motore mostra tutto come prima', async () => {
    const r = await rotteClient(deps())(post('/api/sessioni', {}))
    expect((r.corpo as { sessioni: unknown[] }).sessioni).toHaveLength(2)
  })
})

describe('«anche dal Drive»: le copie di quelle chat sul Drive', () => {
  const voce = (nome: string, size: number) => ({ nome, size, mtime: 1 })
  const indice = {
    [`chat/p/${S1}.jsonl`]: voce('f_a', 100),
    [`chat/p/${S1}/subagents/agent-1.jsonl`]: voce('f_b', 20),
    [`chat/p/${S2}.jsonl`]: voce('f_c', 50),
    'progetti/x/file.txt': voce('f_d', 7)
  }
  it('solo la trascrizione e i sotto-agenti di quelle chat', () => {
    const p = propostaChatEliminate({ file: [{ nome: 'f_a', byte: 110 }], indice, sessioni: [S1], titolo: 'Chat eliminata' })
    expect(p.tipo).toBe('chat-eliminate')
    expect(p.voci.map((v) => v.percorso).sort()).toEqual([`chat/p/${S1}.jsonl`, `chat/p/${S1}/subagents/agent-1.jsonl`])
    expect(p.byte).toBe(130)
    expect(p.breve).toBe('1 chat eliminata dal PC, anche dal Drive')
  })
  it('quelle già in un recupero del Drive non si contano due volte', () => {
    const pulizie = { versione: 1 as const, pulizie: [{ id: 'x', tipo: 'vecchie' as const, titolo: 't', quando: '2026-10-01T00:00:00Z', chi: 'PC', scadeIl: '2026-10-31T00:00:00Z', voci: [{ nome: 'f_a', byte: 100 }], byte: 100 }] }
    const p = propostaChatEliminate({ file: [], indice, sessioni: [S1, S2], titolo: 't', pulizie })
    expect(p.voci.map((v) => v.nome).sort()).toEqual(['f_b', 'f_c'])
  })
})
