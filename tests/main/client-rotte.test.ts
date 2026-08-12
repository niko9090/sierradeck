import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { rotteClient, rotteLibere, type DipendenzeRotte } from '../../src/main/client-rotte'
import { apriDispositivi } from '../../src/main/dispositivi'
import { nuovoAutopilota } from '@shared/autopilota'

function deps(over: Partial<DipendenzeRotte> = {}): DipendenzeRotte {
  return {
    dispositivi: apriDispositivi(mkdtempSync(join(tmpdir(), 'sd-rotte-'))),
    chat: () => [{ id: 'p-1', titolo: 'Gestore', cwd: 'C:\p' }],
    autopiloti: () => Promise.resolve([
      { ...nuovoAutopilota({ id: 'ap-1', nome: 'Notte', obiettivo: 'Test', cwd: 'C:\p',
        criteri: [{ descrizione: 'x', soddisfatto: true }, { descrizione: 'y', soddisfatto: false }],
        iniziatoIl: '2026-08-12T10:00:00.000Z' }) }
    ]),
    rispondi: () => Promise.resolve(),
    domande: () => Promise.resolve([{ id: 'd-1', autopilotaId: 'ap-1', testo: 'Quale chiave?' }]),
    scriviAChat: () => undefined,
    workspace: () => Promise.resolve({ nomi: ['lavoro', 'casa'], attivo: 'lavoro' }),
    cambiaWorkspace: () => Promise.resolve(),
    fermaAutopilota: () => Promise.resolve(),
    riprendiAutopilota: () => Promise.resolve(),
    versione: '0.5.0',
    ...over
  }
}

describe('l ingresso', () => {
  it('dice chi e, e nient altro', async () => {
    // Chi non e' accoppiato non deve poter sapere cosa sta girando qui dentro.
    const r = await rotteLibere(deps())({ metodo: 'GET', percorso: '/api/ciao', corpo: undefined })
    const c = r.corpo as Record<string, unknown>
    expect(c.programma).toBe('SierraDeck')
    expect(JSON.stringify(c)).not.toContain('codice')
  })

  it('non rivela mai il codice di accoppiamento', async () => {
    // Il codice si legge sullo schermo del computer: e' tutta la sicurezza che
    // c'e', e servirlo dalla rete la annullerebbe.
    const d = deps()
    const { codice } = d.dispositivi.apriAccoppiamento()
    const r = await rotteLibere(d)({ metodo: 'GET', percorso: '/api/ciao', corpo: undefined })
    expect(JSON.stringify(r.corpo)).not.toContain(codice)
    expect((r.corpo as Record<string, unknown>).accoppiamentoAperto).toBe(true)
  })

  it('accoppia con il codice giusto e rifiuta gli altri', async () => {
    const d = deps()
    const { codice } = d.dispositivi.apriAccoppiamento()
    const no = await rotteLibere(d)({ metodo: 'POST', percorso: '/api/accoppia', corpo: { codice: '000000', nome: 'x' } })
    expect(no.stato).toBe(403)
    const si = await rotteLibere(d)({ metodo: 'POST', percorso: '/api/accoppia', corpo: { codice, nome: 'telefono' } })
    expect((si.corpo as Record<string, unknown>).chiave).toBeDefined()
  })
})

describe('la pagina', () => {
  it('si apre senza chiave, o non ci si potrebbe mai accoppiare', async () => {
    // E' il cerchio chiuso in cui ero caduto: per accoppiarsi serve il campo
    // dove scrivere il codice, e quel campo sta nella pagina. Chi apriva
    // l'indirizzo leggeva solo «dispositivo non riconosciuto».
    const r = await rotteLibere(deps())({ metodo: 'GET', percorso: '/', corpo: undefined })
    expect(r.stato).toBe(200)
    expect(String(r.corpo)).toContain('SierraDeck')
    expect(r.tipo).toContain('text/html')
  })

  it('il manifesto pure: senza, non si aggiunge alla schermata Home', async () => {
    const r = await rotteLibere(deps())({ metodo: 'GET', percorso: '/manifest.json', corpo: undefined })
    expect(r.stato).toBe(200)
  })

  it('ma i dati restano dietro la chiave', async () => {
    // La pagina e' un'interfaccia vuota: quello che conta - chat, autopiloti,
    // comandi - non deve uscire senza essersi fatti riconoscere.
    const r = await rotteLibere(deps())({ metodo: 'GET', percorso: '/api/stato', corpo: undefined })
    expect(r.stato).toBe(404)
  })
})

describe('lo stato', () => {
  it('manda solo quello che serve a una piastrella', async () => {
    // Mandare tutto lo stato di un autopilota ogni due secondi sarebbe spedire
    // un libro per leggerne il titolo.
    const r = await rotteClient(deps())({ metodo: 'GET', percorso: '/api/stato', corpo: undefined })
    const c = r.corpo as { autopiloti: Record<string, unknown>[] }
    expect(c.autopiloti[0]).toMatchObject({ nome: 'Notte', fatti: 1, criteri: 2 })
    expect(c.autopiloti[0]).not.toHaveProperty('decisioni')
    expect(c.autopiloti[0]).not.toHaveProperty('sessioneSupervisore')
  })

  it('porta le domande in attesa, che sono la ragione per aprirlo', async () => {
    const r = await rotteClient(deps())({ metodo: 'GET', percorso: '/api/stato', corpo: undefined })
    expect((r.corpo as { domande: unknown[] }).domande).toHaveLength(1)
  })
})

describe('quello che il Client puo fare', () => {
  it('risponde a una domanda', async () => {
    let visto = ''
    const r = await rotteClient(deps({ rispondi: (_id, testo) => { visto = testo; return Promise.resolve() } }))(
      { metodo: 'POST', percorso: '/api/rispondi', corpo: { domanda: 'd-1', risposta: 'usa la chiave X' } }
    )
    expect(r.stato).toBe(200)
    expect(visto).toBe('usa la chiave X')
  })

  it('rifiuta una risposta vuota invece di girare il nulla', async () => {
    const r = await rotteClient(deps())({ metodo: 'POST', percorso: '/api/rispondi', corpo: { domanda: 'd-1', risposta: '   ' } })
    expect(r.stato).toBe(400)
  })

  it('manda due parole a una chat', async () => {
    let dove = ''
    await rotteClient(deps({ scriviAChat: (id) => { dove = id } }))(
      { metodo: 'POST', percorso: '/api/scrivi', corpo: { chat: 'p-1', testo: 'continua' } }
    )
    expect(dove).toBe('p-1')
  })

  it('ferma e riprende un autopilota, che sono gesti reversibili', async () => {
    // Un tocco sbagliato costa un secondo tocco, non il lavoro della notte:
    // per questo ci sono, mentre chiudere ed eliminare no.
    let fermato = ''
    await rotteClient(deps({ fermaAutopilota: (id) => { fermato = id; return Promise.resolve() } }))(
      { metodo: 'POST', percorso: '/api/autopilota/ferma', corpo: { autopilota: 'ap-1' } }
    )
    expect(fermato).toBe('ap-1')
  })

  it('non puo distruggere niente', async () => {
    // Un tocco sbagliato in tram non deve poter buttare via il lavoro della
    // notte: le rotte che chiudono o cancellano non esistono proprio.
    for (const percorso of ['/api/chiudi', '/api/elimina', '/api/chat/chiudi']) {
      const r = await rotteClient(deps())({ metodo: 'POST', percorso, corpo: {} })
      expect(r.stato).toBe(404)
    }
  })
})
