import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { Server } from 'node:http'
import {
  chiaviChatVive, componiPromptDialogo, conMessaggioPerLaChat, conPreambolo, leggiEsitoDialogo,
  preambolo, prendiMessaggiPer
} from '../../src/autopilot-host/dialogo'
import { creaServer, type ServerAutopiloti } from '../../src/autopilot-host/server'
import { apriArchivio, type Archivio } from '../../src/autopilot-host/archivio'
import type { Interrogazione } from '../../src/autopilot-host/supervisore'
import { creaRegistroDomande } from '../../src/autopilot-host/domande'
import { nuovoAutopilota, type Autopilota } from '@shared/autopilota'

function ap(over: Partial<Autopilota> = {}): Autopilota {
  return {
    ...nuovoAutopilota({
      id: 'ap-1', nome: 'Notte', obiettivo: 'Fai passare la suite', cwd: 'C:\\p',
      criteri: [{ descrizione: 'i test passano', comando: 'npm test', soddisfatto: false }],
      iniziatoIl: '2026-09-14T10:00:00.000Z'
    }),
    ...over
  }
}

describe('leggere la risposta dell autopilota', () => {
  it('prende l ultimo oggetto JSON: prima puo ragionare', () => {
    const e = leggiEsitoDialogo('Vediamo... {"a": 1} e poi\n{"risposta": "Sono al secondo criterio", "perLaChat": "usa pnpm"}')
    expect(e?.risposta).toBe('Sono al secondo criterio')
    expect(e?.perLaChat).toBe('usa pnpm')
    expect(e?.cambio).toBeUndefined()
    expect(e?.comando).toBeUndefined()
  })

  it('senza risposta non e una risposta', () => {
    expect(leggiEsitoDialogo('{"perLaChat": "x"}')).toBeUndefined()
    expect(leggiEsitoDialogo('niente json')).toBeUndefined()
    expect(leggiEsitoDialogo('{"risposta": "  "}')).toBeUndefined()
  })

  it('legge il comando solo se e uno dei tre', () => {
    expect(leggiEsitoDialogo('{"risposta": "ok", "comando": "ferma"}')?.comando).toBe('ferma')
    expect(leggiEsitoDialogo('{"risposta": "ok", "comando": "riprendi"}')?.comando).toBe('riprendi')
    expect(leggiEsitoDialogo('{"risposta": "ok", "comando": "rispondi"}')?.comando).toBe('rispondi')
    expect(leggiEsitoDialogo('{"risposta": "ok", "comando": "esplodi"}')?.comando).toBeUndefined()
  })

  it('legge il cambio, scartando i criteri rotti e un elenco che si svuota', () => {
    const e = leggiEsitoDialogo(JSON.stringify({
      risposta: 'aggiungo il criterio',
      cambio: {
        criteri: [
          { descrizione: 'typecheck a zero', comando: 'npm run typecheck' },
          { descrizione: 'su due righe', comando: 'a\nb' },
          { comando: 'senza descrizione' }
        ],
        compitiDaFare: ['uno', '', 'due']
      }
    }))
    expect(e?.cambio?.criteri).toEqual([{ descrizione: 'typecheck a zero', comando: 'npm run typecheck' }])
    expect(e?.cambio?.compitiDaFare).toEqual(['uno', 'due'])
    expect(e?.cambio?.capito).toBe('aggiungo il criterio')
    // Un elenco di criteri tutto rotto non e' un cambio: e' una perdita.
    const vuoto = leggiEsitoDialogo('{"risposta": "x", "cambio": {"criteri": [{"comando": "solo"}]}}')
    expect(vuoto?.cambio).toBeUndefined()
  })
})

describe('il prompt del dialogo', () => {
  it('porta il quadro intero: obiettivo, criteri, diario, dialogo, chat, domanda aperta', () => {
    const a = ap({
      decisioni: [{ quando: '2026-09-14T10:01:00.000Z', cosa: 'supervisore → prosegui: manca il typecheck' }],
      dialogo: [{ quando: '2026-09-14T10:02:00.000Z', da: 'tu', testo: 'dove sei?' },
                { quando: '2026-09-14T10:03:00.000Z', da: 'lui', testo: 'al secondo criterio' }],
      daConsegnare: [{ id: 'm-1', quando: '2026-09-14T10:02:00.000Z', testo: 'usa pnpm', chats: ['ap-1'] }]
    })
    const p = componiPromptDialogo(a, 'fermati un attimo', { ultimoDetto: 'Sto lanciando i test.', domandaAperta: 'Quale chiave?' })
    for (const pezzo of [
      'Fai passare la suite', 'i test passano', 'manca il typecheck', 'dove sei?', 'al secondo criterio',
      'usa pnpm', 'Sto lanciando i test.', 'Quale chiave?', 'fermati un attimo', '"comando": "ferma|riprendi|rispondi"'
    ]) expect(p).toContain(pezzo)
  })

  it('senza contesto non inventa sezioni', () => {
    const p = componiPromptDialogo(ap(), 'ciao')
    expect(p).not.toContain('ultima cosa che ha scritto')
    expect(p).not.toContain('una tua domanda aperta a cui aspetti risposta')
    expect(p).not.toContain('Il dialogo finora')
  })
})

describe('i messaggi per la chat, al momento giusto', () => {
  it('la chat singola riceve con la chiave dell autopilota; una flotta chat per chat', () => {
    expect(chiaviChatVive(ap())).toEqual(['ap-1'])
    const flotta = ap({ chats: [
      { id: 'c-1', compito: 'a', stato: 'lavoro', cicli: 1 },
      { id: 'c-2', compito: 'b', stato: 'finita', cicli: 1 },
      { id: 'c-3', compito: 'c', stato: 'bloccata', cicli: 1 }
    ] })
    expect(chiaviChatVive(flotta)).toEqual(['c-1', 'c-3'])
    // Tutte finite: allora tutte, e' il caso della ripresa di un lavoro finito.
    const finite = ap({ chats: [{ id: 'c-1', compito: 'a', stato: 'finita', cicli: 1 }] })
    expect(chiaviChatVive(finite)).toEqual(['c-1'])
  })

  it('ogni chat prende il suo, e il messaggio sparisce quando nessuna lo aspetta piu', () => {
    let a = conMessaggioPerLaChat(ap(), 'usa pnpm', '2026-09-14T10:00:00.000Z', ['c-1', 'c-2'], 'm-1')
    a = conMessaggioPerLaChat(a, 'niente push', '2026-09-14T10:00:01.000Z', ['c-1'], 'm-2')
    const primo = prendiMessaggiPer(a, 'c-1')
    expect(primo.testi).toEqual(['usa pnpm', 'niente push'])
    expect(primo.autopilota.daConsegnare).toEqual([{ id: 'm-1', quando: '2026-09-14T10:00:00.000Z', testo: 'usa pnpm', chats: ['c-2'] }])
    const secondo = prendiMessaggiPer(primo.autopilota, 'c-2')
    expect(secondo.testi).toEqual(['usa pnpm'])
    expect(secondo.autopilota.daConsegnare).toEqual([])
    // Chi non ha niente non cambia niente.
    const niente = prendiMessaggiPer(secondo.autopilota, 'c-1')
    expect(niente.testi).toEqual([])
    expect(niente.autopilota).toBe(secondo.autopilota)
  })

  it('senza destinatari non si mette in coda', () => {
    expect(conMessaggioPerLaChat(ap(), 'x', 'q', [], 'm').daConsegnare).toEqual([])
  })

  it('il preambolo dichiara di chi sono le parole, e vale piu delle istruzioni', () => {
    expect(preambolo([])).toBe('')
    expect(preambolo(['usa pnpm'])).toContain('Chi ti ha dato il compito ti scrive: «usa pnpm»')
    const due = preambolo(['a', 'b'])
    expect(due).toContain('- «a»')
    expect(due).toContain('- «b»')
    expect(conPreambolo([], 'vai')).toBe('vai')
    expect(conPreambolo(['x'], 'vai')).toMatch(/^Chi ti ha dato il compito[\s\S]*\n\nvai$/)
  })
})

// ───────────────────────── il server ─────────────────────────

let server: ServerAutopiloti
let porta: number
let archivio: Archivio
let avviati: { id: string; messaggio?: string; chat?: string }[]
let fermati: string[]

function ambiente(interroga: Interrogazione): ServerAutopiloti {
  archivio = apriArchivio(mkdtempSync(join(tmpdir(), 'ap-dialogo-')))
  avviati = []
  fermati = []
  return creaServer({
    archivio,
    esegui: () => Promise.resolve({ codice: 1, uscita: '1 test rosso' }),
    interroga,
    avviaLavoro: (a, messaggio, chat) => {
      avviati.push({ id: a.id, ...(messaggio !== undefined ? { messaggio } : {}), ...(chat !== undefined ? { chat: chat.id } : {}) })
      return Promise.resolve()
    },
    fermaLavoro: (id) => { fermati.push(id) },
    avvisa: () => Promise.resolve(),
    domande: creaRegistroDomande({ adesso: () => Date.now() }),
    scadenzaDomandaMs: 5000,
    scadenzaInterviataMs: 5000,
    ultimoDetto: () => 'Sto lanciando la suite.',
    adesso: () => new Date().toISOString()
  })
}

async function chiama(metodo: string, percorso: string, corpo?: unknown): Promise<{ stato: number; dati: any }> {
  const r = await fetch(`http://127.0.0.1:${porta}${percorso}`, {
    method: metodo,
    headers: { 'Content-Type': 'application/json' },
    ...(corpo !== undefined ? { body: JSON.stringify(corpo) } : {})
  })
  const testo = await r.text()
  return { stato: r.status, dati: testo === '' ? undefined : JSON.parse(testo) }
}

function avvia(s: Server): Promise<void> {
  return new Promise((ris) => {
    s.listen(0, '127.0.0.1', () => {
      porta = (s.address() as { port: number }).port
      ris()
    })
  })
}

async function creaAp(): Promise<string> {
  const { dati } = await chiama('POST', '/autopiloti', {
    nome: 'Notte', obiettivo: 'Fai passare la suite', cwd: process.cwd(),
    criteri: [{ descrizione: 'i test passano', comando: 'npm test' }]
  })
  return dati.id
}

async function attendi(condizione: () => boolean): Promise<void> {
  for (let i = 0; i < 200 && !condizione(); i += 1) await new Promise((r) => setTimeout(r, 10))
}

/** Un supervisore che al dialogo risponde con `esito` e ai turni con `prosegui`. */
function supervisore(esito: unknown): Interrogazione {
  return (prompt) => Promise.resolve({
    testo: prompt.includes('Ti scrive adesso')
      ? JSON.stringify(esito)
      : '{"azione": "prosegui", "istruzioni": "sistema il test rosso", "perche": "manca uno"}',
    sessionId: 'sup-1'
  })
}

function eventoStop(): Record<string, unknown> {
  return { session_id: 's-1', stop_hook_active: false, last_assistant_message: 'Ho fatto un giro.', hook_event_name: 'Stop', cwd: process.cwd() }
}

afterEach(() => { server?.close() })

describe('il dialogo con l autopilota', () => {
  it('risponde subito con la ricevuta, poi scrive la sua battuta nell archivio', async () => {
    server = ambiente(supervisore({ risposta: 'Sono al primo criterio: la suite ha un test rosso.' }))
    await avvia(server)
    const id = await creaAp()

    const r = await chiama('POST', `/autopiloti/${id}/dialogo`, { testo: 'dove sei?' })
    expect(r.stato).toBe(202)
    expect(r.dati.ricevuto).toBe(true)
    // La tua battuta e' gia' li', prima che lui pensi.
    expect(r.dati.autopilota.dialogo).toEqual([expect.objectContaining({ da: 'tu', testo: 'dove sei?' })])

    await attendi(() => (archivio.leggi(id)?.dialogo.length ?? 0) === 2)
    const dopo = archivio.leggi(id)!
    expect(dopo.dialogo[1]).toMatchObject({ da: 'lui', testo: 'Sono al primo criterio: la suite ha un test rosso.', esito: 'nessun cambio' })
    // Il supervisore e' il suo: la sessione si ricorda per il giro dopo.
    expect(dopo.sessioneSupervisore).toBe('sup-1')
    expect(avviati.map((x) => x.messaggio)).toEqual([undefined])
  })

  it('rifiuta il vuoto e chi non esiste', async () => {
    server = ambiente(supervisore({ risposta: 'x' }))
    await avvia(server)
    const id = await creaAp()
    expect((await chiama('POST', `/autopiloti/${id}/dialogo`, { testo: '  ' })).stato).toBe(400)
    expect((await chiama('POST', '/autopiloti/ap-nessuno/dialogo', { testo: 'ciao' })).stato).toBe(404)
  })

  it('un istruzione per la chat aspetta la fine del turno, e il supervisore la vede nel quadro', async () => {
    const quadri: string[] = []
    const interroga: Interrogazione = (prompt) => {
      if (prompt.includes('Ti scrive adesso')) {
        return Promise.resolve({ testo: JSON.stringify({ risposta: 'Va bene, glielo dico.', perLaChat: 'Usa pnpm, non npm.' }) })
      }
      quadri.push(prompt)
      return Promise.resolve({ testo: '{"azione": "prosegui", "istruzioni": "sistema il test rosso", "perche": "manca uno"}' })
    }
    server = ambiente(interroga)
    await avvia(server)
    const id = await creaAp()

    await chiama('POST', `/autopiloti/${id}/dialogo`, { testo: 'usa pnpm' })
    await attendi(() => (archivio.leggi(id)?.dialogo.length ?? 0) === 2)
    const inCoda = archivio.leggi(id)!
    expect(inCoda.daConsegnare).toEqual([expect.objectContaining({ testo: 'Usa pnpm, non npm.', chats: [id] })])
    expect(inCoda.dialogo[1]?.esito).toBe('per la chat, a fine turno')
    // Niente e' entrato nella chat mentre lavorava.
    expect(avviati).toHaveLength(1)

    // Alla fine del turno il messaggio entra davanti alle istruzioni.
    const r = await chiama('POST', `/hook/stop?ap=${id}`, eventoStop())
    expect(r.dati.decision).toBe('block')
    expect(r.dati.reason).toMatch(/^Chi ti ha dato il compito ti scrive: «Usa pnpm, non npm\.»/)
    expect(r.dati.reason).toContain('sistema il test rosso')
    expect(quadri[0]).toContain('Usa pnpm, non npm.')
    // E non entra due volte.
    expect(archivio.leggi(id)?.daConsegnare).toEqual([])
    const r2 = await chiama('POST', `/hook/stop?ap=${id}`, eventoStop())
    expect(r2.dati.reason).not.toContain('Chi ti ha dato il compito')
  })

  it('«fermati» ferma; «riprendi» riparte con quello che aspettava davanti al testo di ripresa', async () => {
    let giro = 0
    const interroga: Interrogazione = (prompt) => {
      if (!prompt.includes('Ti scrive adesso')) return Promise.resolve({ testo: '{"azione": "prosegui", "istruzioni": "x"}' })
      giro += 1
      return Promise.resolve({
        testo: JSON.stringify(giro === 1
          ? { risposta: 'Mi fermo.', comando: 'ferma' }
          : { risposta: 'Riparto e provo con pnpm.', comando: 'riprendi', perLaChat: 'Riparti usando pnpm.' })
      })
    }
    server = ambiente(interroga)
    await avvia(server)
    const id = await creaAp()
    // Un turno chiuso: cosi' la ripresa e' una ripresa, non una partenza.
    await chiama('POST', `/hook/stop?ap=${id}`, eventoStop())

    await chiama('POST', `/autopiloti/${id}/dialogo`, { testo: 'fermati' })
    await attendi(() => archivio.leggi(id)?.stato === 'sospeso')
    expect(fermati).toEqual([id])
    expect(archivio.leggi(id)?.dialogo.at(-1)).toMatchObject({ da: 'lui', esito: 'fermato' })

    await chiama('POST', `/autopiloti/${id}/dialogo`, { testo: 'riprendi con pnpm' })
    await attendi(() => archivio.leggi(id)?.stato === 'lavoro')
    const ripresa = avviati.at(-1)
    expect(ripresa?.messaggio).toContain('Chi ti ha dato il compito ti scrive: «Riparti usando pnpm.»')
    expect(ripresa?.messaggio).toContain('Riprendi da dove eri')
    expect(archivio.leggi(id)?.daConsegnare).toEqual([])
    expect(archivio.leggi(id)?.dialogo.at(-1)?.esito).toContain('ripreso')
  })

  it('un cambio si applica e si puo disfare', async () => {
    server = ambiente(supervisore({
      risposta: 'Aggiungo il typecheck ai criteri.',
      cambio: { criteri: [{ descrizione: 'i test passano', comando: 'npm test' }, { descrizione: 'typecheck a zero', comando: 'npm run typecheck' }] }
    }))
    await avvia(server)
    const id = await creaAp()
    await chiama('POST', `/autopiloti/${id}/dialogo`, { testo: 'aggiungi il typecheck' })
    await attendi(() => (archivio.leggi(id)?.criteri.length ?? 0) === 2)
    const a = archivio.leggi(id)!
    expect(a.criteri.map((c) => c.descrizione)).toEqual(['i test passano', 'typecheck a zero'])
    expect(a.modifiche.at(-1)).toMatchObject({ testo: 'aggiungi il typecheck', capito: 'Aggiungo il typecheck ai criteri.' })
    await attendi(() => (archivio.leggi(id)?.dialogo.length ?? 0) === 2)
    expect(archivio.leggi(id)?.dialogo[1]?.esito).toBe('cambio applicato')
    await chiama('POST', `/autopiloti/${id}/disfa`)
    expect(archivio.leggi(id)?.criteri.map((c) => c.descrizione)).toEqual(['i test passano'])
  })

  it('quando il supervisore non risponde lo dice, senza toccare niente', async () => {
    server = ambiente((prompt) => prompt.includes('Ti scrive adesso')
      ? Promise.reject(new Error('claude.exe non parte'))
      : Promise.resolve({ testo: '{"azione": "prosegui", "istruzioni": "x"}' }))
    await avvia(server)
    const id = await creaAp()
    await chiama('POST', `/autopiloti/${id}/dialogo`, { testo: 'ci sei?' })
    await attendi(() => (archivio.leggi(id)?.dialogo.length ?? 0) === 2)
    const battuta = archivio.leggi(id)?.dialogo[1]
    expect(battuta?.esito).toBe('senza risposta')
    expect(battuta?.testo).toContain('claude.exe non parte')
    expect(archivio.leggi(id)?.stato).toBe('lavoro')
  })

  it('due messaggi di fila ricevono due risposte, in ordine', async () => {
    let n = 0
    server = ambiente((prompt) => {
      if (!prompt.includes('Ti scrive adesso')) return Promise.resolve({ testo: '{"azione": "prosegui", "istruzioni": "x"}' })
      n += 1
      const mio = n
      return new Promise((r) => setTimeout(() => r({ testo: JSON.stringify({ risposta: `risposta ${mio}` }) }), mio === 1 ? 60 : 5))
    })
    await avvia(server)
    const id = await creaAp()
    await chiama('POST', `/autopiloti/${id}/dialogo`, { testo: 'uno' })
    await chiama('POST', `/autopiloti/${id}/dialogo`, { testo: 'due' })
    await attendi(() => (archivio.leggi(id)?.dialogo.length ?? 0) === 4)
    expect(archivio.leggi(id)?.dialogo.map((b) => b.testo)).toEqual(['uno', 'due', 'risposta 1', 'risposta 2'])
  })

  it('a lavoro finito i messaggi in coda non restano appesi: lo scrive nel diario', async () => {
    server = ambiente((prompt) => Promise.resolve({
      testo: prompt.includes('Ti scrive adesso')
        ? JSON.stringify({ risposta: 'ok', perLaChat: 'ricordati il changelog' })
        : '{"azione": "finito"}'
    }))
    await avvia(server)
    const id = await creaAp()
    await chiama('POST', `/autopiloti/${id}/dialogo`, { testo: 'ricorda il changelog' })
    await attendi(() => (archivio.leggi(id)?.daConsegnare.length ?? 0) === 1)
    // I criteri passano e il supervisore dichiara finito.
    server.close()
    server = creaServer({
      archivio,
      esegui: () => Promise.resolve({ codice: 0, uscita: 'ok' }),
      interroga: () => Promise.resolve({ testo: '{"azione": "finito"}' }),
      avviaLavoro: () => Promise.resolve(),
      fermaLavoro: () => undefined,
      avvisa: () => Promise.resolve(),
      domande: creaRegistroDomande({ adesso: () => Date.now() }),
      scadenzaDomandaMs: 5000,
      scadenzaInterviataMs: 5000,
      adesso: () => new Date().toISOString()
    })
    await avvia(server)
    await chiama('POST', `/hook/stop?ap=${id}`, eventoStop())
    const a = archivio.leggi(id)!
    expect(a.stato).toBe('finito')
    expect(a.daConsegnare).toEqual([])
    expect(a.decisioni.at(-1)?.cosa).toContain('non sono stati consegnati')
  })
})
