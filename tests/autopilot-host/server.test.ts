import { STRATEGIE } from '../../src/autopilot-host/strategie'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { Server } from 'node:http'
import { creaServer, type ServerAutopiloti } from '../../src/autopilot-host/server'
import { apriArchivio, type Archivio } from '../../src/autopilot-host/archivio'
import type { Esecutore } from '../../src/autopilot-host/verifiche'
import type { Interrogazione } from '../../src/autopilot-host/supervisore'
import { creaRegistroDomande } from '../../src/autopilot-host/domande'
import { nuovoAutopilota } from '@shared/autopilota'

let server: ServerAutopiloti
let porta: number
/** L'archivio del server in prova: serve a simulare cio che c'era su disco. */
let archivio: Archivio
let avviati: string[]
let fermati: string[]
let messaggiDiRipresa: string[]
let avvisi: { tipo: string; id: string; domanda?: string }[]
let chatAvviate: { id: string; compito: string }[]

function ambiente(
  opts: {
    esegui?: Esecutore
    interroga?: Interrogazione
    scadenzaDomandaMs?: number
    scadenzaInterviataMs?: number
  } = {}
): ServerAutopiloti {
  archivio = apriArchivio(mkdtempSync(join(tmpdir(), 'ap-server-')))
  avviati = []
  fermati = []
  messaggiDiRipresa = []
  avvisi = []
  chatAvviate = []
  return creaServer({
    archivio,
    esegui: opts.esegui ?? (() => Promise.resolve({ codice: 0, uscita: 'ok' })),
    interroga: opts.interroga ?? (() => Promise.resolve({ testo: '{"azione": "finito"}' })),
    avviaLavoro: (a, messaggio, chat) => {
      avviati.push(a.id)
      if (chat !== undefined) chatAvviate.push({ id: chat.id, compito: chat.compito })
      if (messaggio !== undefined) messaggiDiRipresa.push(messaggio)
      return Promise.resolve()
    },
    fermaLavoro: (id, chatId) => { fermati.push(chatId === undefined ? id : `${id}::${chatId}`) },
    avvisa: (tipo, a, domanda) => {
      avvisi.push({ tipo, id: a.id, domanda })
      return Promise.resolve()
    },
    domande: creaRegistroDomande({ adesso: () => Date.now() }),
    scadenzaDomandaMs: opts.scadenzaDomandaMs ?? 5000,
    scadenzaInterviataMs: opts.scadenzaInterviataMs ?? 5000,
    adesso: () => '2026-08-09T10:05:00.000Z'
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

function eventoStop(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    session_id: 's-1',
    stop_hook_active: false,
    last_assistant_message: 'Ho finito.',
    hook_event_name: 'Stop',
    cwd: process.cwd(),
    transcript_path: 'x.jsonl',
    ...over
  }
}

async function creaAp(over: Record<string, unknown> = {}): Promise<string> {
  const { dati } = await chiama('POST', '/autopiloti', {
    nome: 'Test verdi',
    obiettivo: 'Fai passare la suite',
    cwd: process.cwd(),
    criteri: [{ descrizione: 'i test passano', comando: 'npm test' }],
    ...over
  })
  return dati.id
}

afterEach(() => { server?.close() })

describe('creazione ed elenco', () => {
  beforeEach(async () => { server = ambiente(); await avvia(server) })

  it('crea un autopilota e ne avvia il lavoro', async () => {
    const id = await creaAp()
    expect(id).toBeTruthy()
    expect(avviati).toEqual([id])
    expect((await chiama('GET', '/autopiloti')).dati.map((a: any) => a.id)).toEqual([id])
  })

  it('rifiuta una creazione senza obiettivo', async () => {
    expect((await chiama('POST', '/autopiloti', {
      cwd: process.cwd(), criteri: [{ descrizione: 'x' }]
    })).stato).toBe(400)
  })

  it('senza criteri parte in intervista invece di rifiutare', async () => {
    // I criteri sono la parte che l'utente non dovrebbe scrivere: e' il lavoro
    // che stava delegando. Senza, l'autopilota li ricava lui facendo domande.
    const { stato, dati } = await chiama('POST', '/autopiloti', {
      obiettivo: 'Sistema il lettore', cwd: process.cwd(), criteri: []
    })
    expect(stato).toBe(200)
    expect(dati.stato).toBe('intervista')
  })

  it('rifiuta una cartella che non esiste', async () => {
    // Meglio dirlo adesso che scoprirlo quando claude.exe non parte.
    const { stato } = await chiama('POST', '/autopiloti', {
      obiettivo: 'x', cwd: join(process.cwd(), 'non-esiste-davvero'), criteri: [{ descrizione: 'x' }]
    })
    expect(stato).toBe(400)
  })

  it('risponde a /salute anche senza autopiloti', async () => {
    expect((await chiama('GET', '/salute')).stato).toBe(200)
  })
})

describe('hook Stop', () => {
  it('fa proseguire la chat quando un criterio fallisce', async () => {
    server = ambiente({ esegui: () => Promise.resolve({ codice: 1, uscita: '2 test rossi' }) })
    await avvia(server)
    const id = await creaAp()

    const r = await chiama('POST', `/hook/stop?ap=${id}`, eventoStop())

    expect(r.dati.decision).toBe('block')
    expect(r.dati.reason).toContain('2 test rossi')
    // Il ciclo consumato e la sessione vanno ricordati: sono cio' che permette
    // di riconoscere lo stallo e di ritrovare la chat dopo un riavvio.
    const stato = (await chiama('GET', '/autopiloti')).dati[0]
    expect(stato.cicli).toBe(1)
    expect(stato.sessionId).toBe('s-1')
  })

  it('lascia fermare la chat e dichiara finito quando tutto passa e il giudizio conferma', async () => {
    server = ambiente()
    await avvia(server)
    const id = await creaAp()

    const r = await chiama('POST', `/hook/stop?ap=${id}`, eventoStop({ last_assistant_message: 'Fatto.' }))

    expect(r.dati).toEqual({})
    expect((await chiama('GET', '/autopiloti')).dati[0].stato).toBe('finito')
  })

  it('non dichiara finito quando il giudizio e illeggibile', async () => {
    server = ambiente({ interroga: () => Promise.resolve({ testo: 'boh' }) })
    await avvia(server)
    const id = await creaAp()
    await chiama('POST', `/hook/stop?ap=${id}`, eventoStop({ last_assistant_message: 'Fatto.' }))
    expect((await chiama('GET', '/autopiloti')).dati[0].stato).toBe('sospeso')
  })

  it('una domanda della chat mette l autopilota in attesa e ne conserva il testo', async () => {
    server = ambiente()
    await avvia(server)
    const id = await creaAp()
    await chiama('POST', `/hook/notification?ap=${id}`, {
      session_id: 's-1', hook_event_name: 'Notification',
      notification_type: 'permission_prompt', message: 'quale chiave uso?'
    })
    const stato = (await chiama('GET', '/autopiloti')).dati[0]
    expect(stato.stato).toBe('attesa')
    expect(stato.motivoSospensione).toContain('quale chiave uso?')
  })

  it('risponde vuoto per un autopilota sconosciuto invece di sollevare', async () => {
    // Succede davvero: una chat sopravvissuta a un autopilota eliminato. Deve
    // potersi fermare, non restare appesa.
    server = ambiente()
    await avvia(server)
    const r = await chiama('POST', '/hook/stop?ap=mai-esistito', eventoStop({ last_assistant_message: '' }))
    expect(r.stato).toBe(200)
    expect(r.dati).toEqual({})
  })

  it('un id di autopilota malformato non arriva all archivio', async () => {
    server = ambiente()
    await avvia(server)
    const r = await chiama('POST', '/hook/stop?ap=..%5Cfuori', eventoStop())
    expect(r.stato).toBe(200)
    expect(r.dati).toEqual({})
  })

  it('un corpo malformato non fa cadere il servizio', async () => {
    server = ambiente()
    await avvia(server)
    const r = await fetch(`http://127.0.0.1:${porta}/hook/stop?ap=x`, { method: 'POST', body: 'non sono JSON' })
    expect(r.status).toBe(200)
    expect((await chiama('GET', '/salute')).stato).toBe(200)
  })

  it('una chat di un autopilota gia fermato puo fermarsi senza consumare cicli', async () => {
    server = ambiente()
    await avvia(server)
    const id = await creaAp()
    await chiama('POST', `/autopiloti/${id}/ferma`)
    const r = await chiama('POST', `/hook/stop?ap=${id}`, eventoStop({ last_assistant_message: '' }))
    expect(r.dati).toEqual({})
    expect((await chiama('GET', '/autopiloti')).dati[0].cicli).toBe(0)
  })
})

describe('ferma e riprendi', () => {
  beforeEach(async () => { server = ambiente(); await avvia(server) })

  it('fermare sospende e chiude il lavoro', async () => {
    const id = await creaAp()
    expect((await chiama('POST', `/autopiloti/${id}/ferma`)).stato).toBe(200)
    expect(fermati).toEqual([id])
    expect((await chiama('GET', '/autopiloti')).dati[0].stato).toBe('sospeso')
  })

  it('riprendere riavvia il lavoro', async () => {
    const id = await creaAp()
    await chiama('POST', `/autopiloti/${id}/ferma`)
    await chiama('POST', `/autopiloti/${id}/riprendi`)
    expect(avviati).toEqual([id, id])
    expect((await chiama('GET', '/autopiloti')).dati[0].stato).toBe('lavoro')
  })

  it('riprendere un autopilota in intervista riprende l intervista, non il lavoro', async () => {
    // Il difetto osservato sul campo: il tasto «Riprendi» compare anche durante
    // la preparazione, e portava l'autopilota a «lavoro» senza criteri. Al giro
    // dopo il suo file non era piu' rileggibile e l'autopilota spariva
    // dall'elenco: per l'utente, «va in errore e si cancella».
    let domande = 0
    server = ambiente({
      interroga: (prompt) => {
        if (!prompt.includes('Stai preparando un autopilota')) {
          return Promise.resolve({ testo: '{"azione": "finito"}' })
        }
        domande += 1
        return Promise.resolve({ testo: '{"domanda": "Quale formato?"}' })
      },
      scadenzaInterviataMs: 60
    })
    await avvia(server)
    const { dati } = await chiama('POST', '/autopiloti', {
      obiettivo: 'Sistema il lettore', cwd: process.cwd(), criteri: []
    })

    for (let i = 0; i < 80 && domande === 0; i += 1) await new Promise((r) => setTimeout(r, 25))
    // La domanda scade e l'autopilota resta in intervista: e' li' che l'utente
    // preme «Riprendi».
    for (let i = 0; i < 80; i += 1) {
      if ((await chiama('GET', '/domande')).dati.length === 0) break
      await new Promise((r) => setTimeout(r, 25))
    }
    expect((await chiama('POST', `/autopiloti/${dati.id}/riprendi`)).stato).toBe(200)

    const dopo = (await chiama('GET', '/autopiloti')).dati[0]
    expect(dopo.stato).toBe('intervista')
    expect(avviati).toEqual([])
    // E l'intervista riparte davvero, invece di lasciarlo fermo per sempre.
    expect(domande).toBeGreaterThan(1)
  })

  it('un autopilota fermo senza criteri riparte dalla preparazione', async () => {
    // Mandarlo al lavoro lo porterebbe a uno stato che il servizio stesso non sa
    // piu' rileggere. Ma non ha nemmeno senso lasciarlo fermo: quello che gli
    // manca e' la preparazione, e l'obiettivo per rifarla ce l'ha.
    let preparazioni = 0
    server = ambiente({
      interroga: (prompt) => {
        if (prompt.includes('Stai preparando un autopilota')) {
          preparazioni += 1
          return Promise.resolve({ testo: '{"domanda": "Quale formato?"}' })
        }
        return Promise.resolve({ testo: '{"azione": "finito"}' })
      },
      scadenzaInterviataMs: 60
    })
    await avvia(server)
    const { dati } = await chiama('POST', '/autopiloti', {
      obiettivo: 'x', cwd: process.cwd(), criteri: []
    })
    for (let i = 0; i < 80 && preparazioni === 0; i += 1) await new Promise((r) => setTimeout(r, 25))
    await chiama('POST', `/autopiloti/${dati.id}/ferma`)

    expect((await chiama('POST', `/autopiloti/${dati.id}/riprendi`)).stato).toBe(200)
    expect((await chiama('GET', '/autopiloti')).dati[0].stato).toBe('intervista')
    expect(avviati).toEqual([])
  })

  it('una risposta arrivata tardi durante la preparazione la fa proseguire', async () => {
    // La domanda dell'intervista puo' scadere — l'utente e' altrove, o il
    // servizio e' stato riavviato. Rispondendo piu' tardi, anche da Telegram,
    // la preparazione deve riprendere da li': prima la risposta veniva
    // accettata e poi ignorata, e l'autopilota restava fermo per sempre.
    let giro = 0
    server = ambiente({
      interroga: (prompt) => {
        if (!prompt.includes('Stai preparando un autopilota')) {
          return Promise.resolve({ testo: '{"azione": "finito"}' })
        }
        giro += 1
        return Promise.resolve({
          testo: giro === 1
            ? '{"domanda": "Quale formato?"}'
            : '{"pronto": true, "criteri": [{"descrizione": "i test passano", "comando": "npm test"}]}'
        })
      },
      scadenzaInterviataMs: 60
    })
    await avvia(server)
    const { dati } = await chiama('POST', '/autopiloti', {
      obiettivo: 'Sistema il lettore', cwd: process.cwd(), criteri: []
    })

    let domanda
    for (let i = 0; i < 80; i += 1) {
      const aperte = (await chiama('GET', '/domande')).dati
      if (aperte.length > 0) { domanda = aperte[0]; break }
      await new Promise((r) => setTimeout(r, 25))
    }
    // Si aspetta che scada: da qui in poi nessuno sta piu' ascoltando.
    await new Promise((r) => setTimeout(r, 200))
    await chiama('POST', `/domande/${domanda.id}/risposta`, { risposta: 'YAML' })

    for (let i = 0; i < 80; i += 1) {
      if ((await chiama('GET', '/autopiloti')).dati[0].stato === 'lavoro') break
      await new Promise((r) => setTimeout(r, 25))
    }
    const stato = (await chiama('GET', '/autopiloti')).dati[0]
    expect(stato.stato).toBe('lavoro')
    expect(stato.criteri).toHaveLength(1)
    expect(stato.intervista[0]).toMatchObject({ risposta: 'YAML' })
    expect(avviati).toEqual([dati.id])
  })

  it('fermare un autopilota inesistente risponde 404', async () => {
    expect((await chiama('POST', '/autopiloti/mai-esistito/ferma')).stato).toBe(404)
  })
})

describe('domande all utente', () => {
  const CHIEDE: Interrogazione = () => Promise.resolve({
    testo: '{"azione": "chiedi", "domanda": "Quale chiave API uso?"}'
  })

  it('apre una domanda, attende la risposta e la gira alla chat', async () => {
    server = ambiente({ interroga: CHIEDE, scadenzaDomandaMs: 5000 })
    await avvia(server)
    const id = await creaAp()

    // L'hook resta in attesa: la chat e' ferma e aspetta la risposta.
    const inAttesa = chiama('POST', `/hook/stop?ap=${id}`, eventoStop())

    // Il pannello vede la domanda e risponde.
    const attesaVisibile = async (): Promise<any> => {
      for (let i = 0; i < 50; i += 1) {
        const d = (await chiama('GET', '/domande')).dati
        if (d.length > 0) return d[0]
        await new Promise((r) => setTimeout(r, 50))
      }
      throw new Error('la domanda non e mai comparsa')
    }
    const domanda = await attesaVisibile()
    expect(domanda.testo).toContain('chiave API')

    expect((await chiama('POST', `/domande/${domanda.id}/risposta`, { risposta: 'usa quella di prova' })).stato).toBe(200)

    const r = await inAttesa
    // La chat riprende con la risposta dell'utente, senza essere rilanciata.
    expect(r.dati.decision).toBe('block')
    expect(r.dati.reason).toContain('usa quella di prova')
    expect((await chiama('GET', '/autopiloti')).dati[0].stato).toBe('lavoro')
  })

  it('se nessuno risponde entro la scadenza la chat si ferma e l autopilota resta in attesa', async () => {
    server = ambiente({ interroga: CHIEDE, scadenzaDomandaMs: 150 })
    await avvia(server)
    const id = await creaAp()

    const r = await chiama('POST', `/hook/stop?ap=${id}`, eventoStop())
    expect(r.dati).toEqual({})
    const stato = (await chiama('GET', '/autopiloti')).dati[0]
    expect(stato.stato).toBe('attesa')
    expect(stato.motivoSospensione).toContain('chiave API')
    // La domanda resta aperta: una risposta tardiva deve ancora valere.
    expect((await chiama('GET', '/domande')).dati).toHaveLength(1)
  })

  it('una risposta tardiva fa riprendere la chat con il messaggio dell utente', async () => {
    server = ambiente({ interroga: CHIEDE, scadenzaDomandaMs: 100 })
    await avvia(server)
    const id = await creaAp()
    await chiama('POST', `/hook/stop?ap=${id}`, eventoStop())
    avviati.length = 0

    const domanda = (await chiama('GET', '/domande')).dati[0]
    await chiama('POST', `/domande/${domanda.id}/risposta`, { risposta: 'usa la chiave di prova' })

    expect(avviati).toEqual([id])
    expect(messaggiDiRipresa[0]).toContain('usa la chiave di prova')
    expect((await chiama('GET', '/autopiloti')).dati[0].stato).toBe('lavoro')
  })

  it('rispondere a una domanda inesistente risponde 404', async () => {
    server = ambiente()
    await avvia(server)
    expect((await chiama('POST', '/domande/mai-esistita/risposta', { risposta: 'x' })).stato).toBe(404)
  })

  it('rifiuta una risposta vuota invece di girare il nulla alla chat', async () => {
    server = ambiente({ interroga: CHIEDE, scadenzaDomandaMs: 5000 })
    await avvia(server)
    const id = await creaAp()
    void chiama('POST', `/hook/stop?ap=${id}`, eventoStop())
    let domanda: any
    for (let i = 0; i < 50 && domanda === undefined; i += 1) {
      domanda = (await chiama('GET', '/domande')).dati[0]
      if (domanda === undefined) await new Promise((r) => setTimeout(r, 50))
    }
    expect((await chiama('POST', `/domande/${domanda.id}/risposta`, { risposta: '   ' })).stato).toBe(400)
  })

  it('fermare un autopilota chiude le sue domande in sospeso', async () => {
    server = ambiente({ interroga: CHIEDE, scadenzaDomandaMs: 5000 })
    await avvia(server)
    const id = await creaAp()
    const inAttesa = chiama('POST', `/hook/stop?ap=${id}`, eventoStop())
    for (let i = 0; i < 50 && (await chiama('GET', '/domande')).dati.length === 0; i += 1) {
      await new Promise((r) => setTimeout(r, 50))
    }
    await chiama('POST', `/autopiloti/${id}/ferma`)
    // L'hook non deve restare appeso per un autopilota che non lavora piu'.
    expect((await inAttesa).dati).toEqual({})
    expect((await chiama('GET', '/domande')).dati).toEqual([])
  })
})

describe('avvisi verso l esterno', () => {
  it('avvisa a lavoro finito', async () => {
    server = ambiente()
    await avvia(server)
    const id = await creaAp()
    await chiama('POST', `/hook/stop?ap=${id}`, eventoStop({ last_assistant_message: 'Fatto.' }))
    expect(avvisi.map((a) => a.tipo)).toEqual(['finito'])
  })

  it('avvisa quando entra in difficolta, ma continua a lavorare', async () => {
    server = ambiente({ esegui: () => Promise.resolve({ codice: 1, uscita: 'sempre uguale' }) })
    await avvia(server)
    const id = await creaAp()
    for (let i = 0; i < 4; i += 1) {
      await chiama('POST', `/hook/stop?ap=${id}`, eventoStop())
    }
    expect(avvisi.some((a) => a.tipo === 'stallo')).toBe(true)
    // L'avviso dice «sto cambiando strada», non «mi sono fermato»: lo stato
    // resta al lavoro, ed e' il punto di tutto il meccanismo.
    const dopo = (await chiama('GET', '/autopiloti')).dati as { stato: string; strategia?: string }[]
    expect(dopo.at(0)?.stato).toBe('lavoro')
    expect(dopo.at(0)?.strategia).toBe(STRATEGIE[0].nome)
  })

  it('avvisa una volta sola mentre prova una strategia dopo l altra', async () => {
    // Un messaggio per ogni tentativo sarebbe la raffica di notifiche che
    // l'utente ha chiesto di non ricevere.
    server = ambiente({ esegui: () => Promise.resolve({ codice: 1, uscita: 'sempre uguale' }) })
    await avvia(server)
    const id = await creaAp()
    for (let i = 0; i < 6; i += 1) {
      await chiama('POST', `/hook/stop?ap=${id}`, eventoStop())
    }
    expect(avvisi.filter((a) => a.tipo === 'stallo')).toHaveLength(1)
  })

  it('avvisa della domanda prima di mettersi ad aspettare', async () => {
    // Avvisare dopo l'attesa significherebbe scrivere all'utente quando la
    // finestra utile per rispondere e' gia' chiusa.
    server = ambiente({
      interroga: () => Promise.resolve({ testo: '{"azione": "chiedi", "domanda": "Quale chiave?"}' }),
      scadenzaDomandaMs: 150
    })
    await avvia(server)
    const id = await creaAp()
    await chiama('POST', `/hook/stop?ap=${id}`, eventoStop())
    expect(avvisi[0]?.tipo).toBe('domanda')
    expect(avvisi[0]?.domanda).toContain('Quale chiave?')
  })
})

describe('flotta di chat', () => {
  const SCOMPONE: Interrogazione = (prompt) =>
    Promise.resolve({
      testo: prompt.includes('spezzare')
        ? '{"compiti": ["scrivi i test", "aggiorna i documenti", "sistema il lettore"]}'
        : '{"azione": "finito"}'
    })

  async function attendi(condizione: () => boolean): Promise<void> {
    for (let i = 0; i < 60 && !condizione(); i += 1) {
      await new Promise((r) => setTimeout(r, 25))
    }
  }

  it('con tetto a uno non chiede nessuna scomposizione', async () => {
    const prompt: string[] = []
    server = ambiente({
      interroga: (p) => { prompt.push(p); return Promise.resolve({ testo: '{"azione": "finito"}' }) }
    })
    await avvia(server)
    await creaAp()
    await attendi(() => avviati.length > 0)
    // Chiedere come dividere un lavoro che non va diviso costerebbe un minuto
    // di attesa per sapere che la risposta e' «uno».
    expect(prompt.some((p) => p.includes('spezzare'))).toBe(false)
    expect(chatAvviate).toEqual([])
  })

  it('con tetto a due apre due chat sui primi due compiti', async () => {
    server = ambiente({ interroga: SCOMPONE })
    await avvia(server)
    const id = await creaAp({ tettoChat: 2 })
    await attendi(() => chatAvviate.length >= 2)

    expect(chatAvviate.map((c) => c.compito)).toEqual(['scrivi i test', 'aggiorna i documenti'])
    const stato = (await chiama('GET', '/autopiloti')).dati[0]
    expect(stato.chats).toHaveLength(2)
    // Il terzo compito resta in coda: le chat non superano mai il tetto.
    expect(stato.compitiDaFare).toEqual(['sistema il lettore'])
    expect(stato.id).toBe(id)
  })

  it('ricorda la sessione sulla chat che si e fermata, non sull autopilota', async () => {
    // Con una flotta, scriverla sull'autopilota farebbe riprendere tutte le
    // chat dalla conversazione dell'ultima che ha parlato.
    server = ambiente({
      interroga: SCOMPONE,
      esegui: () => Promise.resolve({ codice: 1, uscita: 'ancora rosso' })
    })
    await avvia(server)
    const id = await creaAp({ tettoChat: 2 })
    await attendi(() => chatAvviate.length >= 2)

    await chiama('POST', `/hook/stop?ap=${id}&chat=c-2`, eventoStop({ session_id: 's-due' }))

    const stato = (await chiama('GET', '/autopiloti')).dati[0]
    expect(stato.chats.find((c: any) => c.id === 'c-2').sessionId).toBe('s-due')
    // c-1 ha una sessione sua fin dalla nascita — e' cosi' che la si puo'
    // guardare mentre lavora — ma non deve prendere quella di c-2.
    expect(stato.chats.find((c: any) => c.id === 'c-1').sessionId).not.toBe('s-due')
    expect(stato.sessionId).toBeUndefined()
  })

  it('a lavoro finito ferma tutte le chat della flotta', async () => {
    server = ambiente({ interroga: SCOMPONE })
    await avvia(server)
    const id = await creaAp({ tettoChat: 2 })
    await attendi(() => chatAvviate.length >= 2)

    await chiama('POST', `/hook/stop?ap=${id}&chat=c-1`, eventoStop({ last_assistant_message: 'Fatto.' }))

    const stato = (await chiama('GET', '/autopiloti')).dati[0]
    expect(stato.stato).toBe('finito')
    // Le altre stanno lavorando a pezzi di un obiettivo gia' raggiunto.
    expect(fermati).toContain(id)
    expect(stato.chats.every((c: any) => c.stato === 'finita')).toBe(true)
  })

  it('una scomposizione illeggibile non impedisce di lavorare', async () => {
    server = ambiente({
      interroga: (p) => Promise.resolve({ testo: p.includes('spezzare') ? 'non ho capito' : '{"azione": "finito"}' })
    })
    await avvia(server)
    await creaAp({ tettoChat: 3 })
    await attendi(() => chatAvviate.length > 0)
    // Si ripiega sull'obiettivo intero: una chat sola, che e' meglio di zero.
    expect(chatAvviate).toHaveLength(1)
    expect(chatAvviate[0]?.compito).toContain('Fai passare la suite')
  })

  it('riprendere riapre tutte le chat non finite', async () => {
    server = ambiente({ interroga: SCOMPONE })
    await avvia(server)
    const id = await creaAp({ tettoChat: 2 })
    await attendi(() => chatAvviate.length >= 2)
    await chiama('POST', `/autopiloti/${id}/ferma`)
    chatAvviate.length = 0

    await chiama('POST', `/autopiloti/${id}/riprendi`)

    expect(chatAvviate.map((c) => c.id).sort()).toEqual(['c-1', 'c-2'])
  })
})

describe('eliminazione', () => {
  it('elimina un autopilota concluso', async () => {
    server = ambiente()
    await avvia(server)
    const id = await creaAp()
    await chiama('POST', `/hook/stop?ap=${id}`, eventoStop({ last_assistant_message: 'Fatto.' }))

    expect((await chiama('DELETE', `/autopiloti/${id}`)).stato).toBe(200)
    expect((await chiama('GET', '/autopiloti')).dati).toEqual([])
  })

  it('eliminare uno che lavora ne ferma prima le chat', async () => {
    // Senza questo resterebbe un claude.exe vivo per un autopilota che non
    // esiste piu': l'orfano perfetto, che nessuno sa piu' di avere.
    server = ambiente()
    await avvia(server)
    const id = await creaAp()
    await chiama('DELETE', `/autopiloti/${id}`)
    expect(fermati).toContain(id)
    expect((await chiama('GET', '/autopiloti')).dati).toEqual([])
  })

  it('eliminare chiude anche le sue domande in sospeso', async () => {
    server = ambiente({
      interroga: () => Promise.resolve({ testo: '{"finito": false, "istruzioni": "", "domandaUtente": "Quale?"}' }),
      scadenzaDomandaMs: 5000
    })
    await avvia(server)
    const id = await creaAp()
    const inAttesa = chiama('POST', `/hook/stop?ap=${id}`, eventoStop())
    for (let i = 0; i < 50 && (await chiama('GET', '/domande')).dati.length === 0; i += 1) {
      await new Promise((r) => setTimeout(r, 50))
    }
    await chiama('DELETE', `/autopiloti/${id}`)
    expect((await inAttesa).dati).toEqual({})
    expect((await chiama('GET', '/domande')).dati).toEqual([])
  })

  it('eliminare un autopilota inesistente risponde 404', async () => {
    server = ambiente()
    await avvia(server)
    expect((await chiama('DELETE', '/autopiloti/mai-esistito')).stato).toBe(404)
  })
})

describe('intervista di preparazione', () => {
  /** Un intervistatore che fa una domanda e poi si dichiara pronto. */
  function intervistatore(): Interrogazione {
    let giro = 0
    return (prompt) => {
      if (!prompt.includes('Stai preparando un autopilota')) {
        return Promise.resolve({ testo: '{"azione": "finito"}' })
      }
      giro += 1
      return Promise.resolve({
        testo: giro === 1
          ? '{"domanda": "Il lettore deve accettare anche YAML?"}'
          : '{"pronto": true, "nome": "Lettore", "criteri": [{"descrizione": "i test passano", "comando": "npm test"}]}'
      })
    }
  }

  async function attendi(condizione: () => Promise<boolean>): Promise<void> {
    for (let i = 0; i < 80; i += 1) {
      if (await condizione()) return
      await new Promise((r) => setTimeout(r, 25))
    }
  }

  it('fa la domanda all utente prima di partire', async () => {
    server = ambiente({ interroga: intervistatore(), scadenzaInterviataMs: 5000 })
    await avvia(server)
    await chiama('POST', '/autopiloti', { obiettivo: 'Sistema il lettore', cwd: process.cwd(), criteri: [] })

    await attendi(async () => (await chiama('GET', '/domande')).dati.length > 0)
    const domanda = (await chiama('GET', '/domande')).dati[0]
    expect(domanda.testo).toContain('YAML')
    // Nessuna chat e' partita: prima si capisce, poi si lavora.
    expect(avviati).toEqual([])
  })

  it('dopo la risposta si configura da se e parte', async () => {
    server = ambiente({ interroga: intervistatore(), scadenzaInterviataMs: 5000 })
    await avvia(server)
    const { dati } = await chiama('POST', '/autopiloti', {
      obiettivo: 'Sistema il lettore', cwd: process.cwd(), criteri: []
    })

    await attendi(async () => (await chiama('GET', '/domande')).dati.length > 0)
    const domanda = (await chiama('GET', '/domande')).dati[0]
    await chiama('POST', `/domande/${domanda.id}/risposta`, { risposta: 'Sì, anche YAML' })

    await attendi(async () => (await chiama('GET', '/autopiloti')).dati[0].stato === 'lavoro')
    const stato = (await chiama('GET', '/autopiloti')).dati[0]
    expect(stato.id).toBe(dati.id)
    expect(stato.nome).toBe('Lettore')
    expect(stato.criteri[0]).toMatchObject({ descrizione: 'i test passano', comando: 'npm test' })
    // La risposta resta negli atti: un riavvio non deve rifare la stessa domanda.
    expect(stato.intervista[0]).toMatchObject({ risposta: 'Sì, anche YAML' })
    expect(avviati).toEqual([dati.id])
  })

  it('non ripropone all utente una domanda gia fatta', async () => {
    // Sul campo l'utente si e' ritrovato a rispondere piu' volte sulla stessa
    // cosa e ha risposto «ti ho gia risposto prima». Se l'intervistatore
    // insiste, l'autopilota deve arrangiarsi, non girare la domanda di nuovo.
    let giri = 0
    let vistoSenzaDomande = false
    server = ambiente({
      interroga: (prompt) => {
        if (!prompt.includes('Stai preparando un autopilota')) {
          return Promise.resolve({ testo: '{"azione": "finito"}' })
        }
        giri += 1
        if (prompt.includes('NON fare domande')) {
          vistoSenzaDomande = true
          return Promise.resolve({ testo: '{"pronto": true, "criteri": [{"descrizione": "fatto", "comando": "npm test"}]}' })
        }
        // Insiste con la stessa domanda, riformulata appena.
        return Promise.resolve({
          testo: giri === 1
            ? '{"domanda": "Il limite contrattuale del contatore e 3 kW?"}'
            : '{"domanda": "Confermi che il contatore ha un limite contrattuale di 3 kW?"}'
        })
      },
      scadenzaInterviataMs: 5000
    })
    await avvia(server)
    const { dati } = await chiama('POST', '/autopiloti', { obiettivo: 'x', cwd: process.cwd(), criteri: [] })

    let domanda
    for (let i = 0; i < 80; i += 1) {
      const aperte = (await chiama('GET', '/domande')).dati
      if (aperte.length > 0) { domanda = aperte[0]; break }
      await new Promise((r) => setTimeout(r, 25))
    }
    await chiama('POST', `/domande/${domanda.id}/risposta`, { risposta: 'si, 3 kW' })

    for (let i = 0; i < 120; i += 1) {
      if ((await chiama('GET', '/autopiloti')).dati[0].stato === 'lavoro') break
      await new Promise((r) => setTimeout(r, 25))
    }
    const stato = (await chiama('GET', '/autopiloti')).dati[0]
    expect(stato.stato).toBe('lavoro')
    expect(stato.id).toBe(dati.id)
    // La seconda domanda non e' mai arrivata all'utente.
    expect((await chiama('GET', '/domande')).dati).toEqual([])
    expect(vistoSenzaDomande).toBe(true)
  })

  it('una preparazione illeggibile sospende invece di partire a caso', async () => {
    server = ambiente({
      interroga: (p) => Promise.resolve({ testo: p.includes('Stai preparando') ? 'boh' : '{"azione": "finito"}' })
    })
    await avvia(server)
    await chiama('POST', '/autopiloti', { obiettivo: 'x', cwd: process.cwd(), criteri: [] })

    await attendi(async () => (await chiama('GET', '/autopiloti')).dati[0].stato === 'sospeso')
    expect((await chiama('GET', '/autopiloti')).dati[0].motivoSospensione).toContain('configurazione')
    expect(avviati).toEqual([])
  })

  it('una preparazione interrotta riparte quando il servizio torna su', async () => {
    // Il caso vero: l'app viene riavviata mentre l'autopilota si prepara. Sul
    // disco resta «intervista», ma nessun processo la sta piu' conducendo e non
    // c'e' nemmeno una domanda aperta a cui rispondere per sbloccarlo. Restava
    // fermo per sempre, con scritto «sta preparando».
    server = ambiente({ interroga: intervistatore(), scadenzaInterviataMs: 5000 })
    await avvia(server)
    archivio.scrivi({
      ...nuovoAutopilota({
        id: 'ap-interrotto',
        nome: 'x',
        obiettivo: 'Sistema il lettore',
        cwd: process.cwd(),
        criteri: [],
        iniziatoIl: '2026-08-09T10:00:00.000Z'
      }),
      stato: 'intervista'
    })

    server.riprendiInterviste()

    await attendi(async () => (await chiama('GET', '/domande')).dati.length > 0)
    expect((await chiama('GET', '/domande')).dati[0].testo).toContain('YAML')
  })

  it('una preparazione che si guasta lo dice, invece di restare ferma per sempre', async () => {
    // Quando claude.exe non parte, l'interrogazione solleva. Nessuno lo
    // raccoglieva: l'autopilota restava «sta preparando» e l'utente non aveva
    // niente da leggere ne' a cui rispondere.
    server = ambiente({
      interroga: (p) => p.includes('Stai preparando')
        ? Promise.reject(new Error('claude.exe: File not found'))
        : Promise.resolve({ testo: '{"azione": "finito"}' })
    })
    await avvia(server)
    archivio.scrivi({
      ...nuovoAutopilota({
        id: 'ap-guasto',
        nome: 'x',
        obiettivo: 'y',
        cwd: process.cwd(),
        criteri: [],
        iniziatoIl: '2026-08-09T10:00:00.000Z'
      }),
      stato: 'intervista'
    })

    server.riprendiInterviste()

    await attendi(async () => (await chiama('GET', '/autopiloti')).dati[0].stato === 'sospeso')
    const stato = (await chiama('GET', '/autopiloti')).dati[0]
    expect(stato.motivoSospensione).toContain('File not found')
    // E l'utente lo viene a sapere anche se e' altrove.
    expect(avvisi.map((a) => a.tipo)).toContain('sospeso')
  })

  it('senza risposta resta in intervista, con la domanda aperta', async () => {
    server = ambiente({ interroga: intervistatore(), scadenzaInterviataMs: 120 })
    await avvia(server)
    await chiama('POST', '/autopiloti', { obiettivo: 'x', cwd: process.cwd(), criteri: [] })

    await attendi(async () => (await chiama('GET', '/domande')).dati.length > 0)
    await new Promise((r) => setTimeout(r, 300))
    expect((await chiama('GET', '/autopiloti')).dati[0].stato).toBe('intervista')
    // La domanda resta: rispondendo piu' tardi, anche da Telegram, riprende.
    expect((await chiama('GET', '/domande')).dati).toHaveLength(1)
  })
})
