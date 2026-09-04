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
    silenzioMassimoMs?: number
    adesso?: () => string
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
    ...(opts.silenzioMassimoMs !== undefined ? { silenzioMassimoMs: opts.silenzioMassimoMs } : {}),
    adesso: opts.adesso ?? (() => '2026-08-09T10:05:00.000Z')
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

  it('l attesa da notifica ha una via d uscita: apre una domanda e rispondere riprende il lavoro', async () => {
    // Prima la notifica lasciava 'attesa' senza domanda: il guardiano guarda solo
    // le chat «in lavoro», la ripresa al riavvio pure, e nessuno la sbloccava piu'.
    server = ambiente()
    await avvia(server)
    const id = await creaAp()
    const avviatiPrima = avviati.length
    await chiama('POST', `/hook/notification?ap=${id}`, {
      session_id: 's-1', hook_event_name: 'Notification',
      notification_type: 'permission_prompt', message: 'quale chiave uso?'
    })
    // La notifica avvisa e apre una domanda vera.
    expect(avvisi.some((v) => v.tipo === 'domanda')).toBe(true)
    const domande = (await chiama('GET', `/domande?ap=${id}`)).dati
    expect(domande.length).toBe(1)
    // Rispondere fa riprendere il lavoro, invece di lasciare la chat parcheggiata.
    const esito = await chiama('POST', `/domande/${domande[0].id}/risposta`, { risposta: 'usa la chiave A', da: 'modale' })
    expect(esito.stato).toBe(200)
    const stato = (await chiama('GET', '/autopiloti')).dati[0]
    expect(stato.stato).toBe('lavoro')
    expect(avviati.length).toBeGreaterThan(avviatiPrima)
    expect(messaggiDiRipresa.some((m) => m.includes('usa la chiave A'))).toBe(true)
  })

  it('non ricrea un autopilota eliminato mentre verificava i criteri', async () => {
    // I criteri durano minuti: se l'utente elimina l'autopilota nel frattempo, il
    // salvataggio finale — che parte dalla copia letta all'inizio — non deve farlo
    // rinascere (con la chat ancora governata).
    let idAp = ''
    server = ambiente({
      esegui: async () => {
        if (idAp !== '') await chiama('DELETE', `/autopiloti/${idAp}`)
        return { codice: 0, uscita: 'ok' }
      }
    })
    await avvia(server)
    idAp = await creaAp()
    await chiama('POST', `/hook/stop?ap=${idAp}`, eventoStop())
    const elenco = (await chiama('GET', '/autopiloti')).dati
    expect(elenco.find((a: any) => a.id === idAp)).toBeUndefined()
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

  it('la chat sola manda il proprio id come chat, e la sessione resta sull autopilota', async () => {
    // Visto sul campo: `ap-a78e774e-…` con `chats: []` e l'URL dell'hook che
    // portava `chat=ap-a78e774e-…`, cioe' l'id dell'autopilota. Cercandolo fra
    // le chat della flotta il giro finiva su un elenco vuoto: sessione mai
    // scritta — quindi nessuna ripresa possibile — e contatore per chat che non
    // poteva salire per costruzione.
    server = ambiente({ esegui: () => Promise.resolve({ codice: 1, uscita: 'ancora rosso' }) })
    await avvia(server)
    const id = await creaAp()

    await chiama('POST', `/hook/stop?ap=${id}&chat=${id}`, eventoStop())

    const stato = (await chiama('GET', '/autopiloti')).dati[0]
    expect(stato.sessionId).toBe('s-1')
    expect(stato.cicli).toBe(1)
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
      if ((await chiama('GET', '/autopiloti')).dati[0].stato === 'pronto') break
      await new Promise((r) => setTimeout(r, 25))
    }
    const stato = (await chiama('GET', '/autopiloti')).dati[0]
    // La risposta tardiva fa **finire la preparazione**, non partire il lavoro:
    // quello aspetta il via, come ogni autopilota appena configurato.
    expect(stato.stato).toBe('pronto')
    expect(stato.criteri).toHaveLength(1)
    expect(stato.intervista[0]).toMatchObject({ risposta: 'YAML' })
    expect(stato.id).toBe(dati.id)
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
      testo: prompt.includes('va diviso fra')
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
    expect(prompt.some((p) => p.includes('va diviso fra'))).toBe(false)
    expect(chatAvviate).toEqual([])
  })

  it('con tetto a due apre due chat, e non tiene una coda oltre il tetto', async () => {
    server = ambiente({ interroga: SCOMPONE })
    await avvia(server)
    const id = await creaAp({ tettoChat: 2 })
    await attendi(() => chatAvviate.length >= 2)

    expect(chatAvviate.map((c) => c.compito)).toEqual(['scrivi i test', 'aggiorna i documenti'])
    const stato = (await chiama('GET', '/autopiloti')).dati[0]
    expect(stato.chats).toHaveLength(2)
    // Le chat lavorano tutte verso lo stesso obiettivo (criteri globali): un
    // compito oltre il tetto non avrebbe mai una chat che lo apre e resterebbe
    // in coda finché il «finito» globale non lo butta — «il compito si perdeva».
    // Si tiene al più `tettoChat` compiti: la coda resta vuota, niente da perdere.
    expect(stato.compitiDaFare).toEqual([])
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

  it('il supervisore e uno per chat: due fermate insieme non si rubano la sessione', async () => {
    // Prima la sessione del supervisore stava sull'autopilota: due chat della
    // stessa flotta che si fermavano insieme leggevano `a` all'inizio e
    // ognuna scriveva la sua, l'ultima vinceva e l'altra restava orfana.
    let n = 0
    const viste: (string | undefined)[] = []
    server = ambiente({
      interroga: (prompt, _cwd, sessione) => {
        if (prompt.includes('va diviso fra')) return SCOMPONE(prompt, _cwd, sessione)
        viste.push(sessione)
        n += 1
        return Promise.resolve({ testo: '{"azione": "prosegui", "perche": "avanti"}', sessionId: sessione ?? `sup-${n}` })
      },
      esegui: () => Promise.resolve({ codice: 1, uscita: 'ancora rosso' })
    })
    await avvia(server)
    const id = await creaAp({ tettoChat: 2 })
    await attendi(() => chatAvviate.length >= 2)

    await Promise.all([
      chiama('POST', `/hook/stop?ap=${id}&chat=c-1`, eventoStop({ session_id: 's-uno' })),
      chiama('POST', `/hook/stop?ap=${id}&chat=c-2`, eventoStop({ session_id: 's-due' }))
    ])
    const stato = (await chiama('GET', '/autopiloti')).dati[0]
    const c1 = stato.chats.find((c: any) => c.id === 'c-1')
    const c2 = stato.chats.find((c: any) => c.id === 'c-2')
    expect(c1.sessioneSupervisore).toBeDefined()
    expect(c2.sessioneSupervisore).toBeDefined()
    expect(c1.sessioneSupervisore).not.toBe(c2.sessioneSupervisore)
    expect(stato.sessioneSupervisore).toBeUndefined()

    // Alla fermata dopo, ognuna riprende la **sua** conversazione.
    viste.length = 0
    await chiama('POST', `/hook/stop?ap=${id}&chat=c-1`, eventoStop({ session_id: 's-uno' }))
    expect(viste).toEqual([c1.sessioneSupervisore])
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
      interroga: (p) => Promise.resolve({ testo: p.includes('va diviso fra') ? 'non ho capito' : '{"azione": "finito"}' })
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

  // Fase 1: una domanda (o notifica) di UNA chat non congela le sorelle. Prima
  // metteva l'intero autopilota in `attesa`, e la guardia scartava lo Stop di
  // tutte le altre — un solo bivio fermava la flotta.
  const CHIEDE_FLOTTA: Interrogazione = (p) => Promise.resolve({
    testo: p.includes('va diviso fra')
      ? '{"compiti": ["scrivi i test", "aggiorna i documenti"]}'
      : '{"azione": "chiedi", "domanda": "Quale chiave uso?"}'
  })

  it('una domanda ferma solo la chat che l ha posta, non la flotta', async () => {
    server = ambiente({ interroga: CHIEDE_FLOTTA, scadenzaDomandaMs: 120 })
    await avvia(server)
    const id = await creaAp({ tettoChat: 2 })
    await attendi(() => chatAvviate.length >= 2)

    // c-2 chiede e nessuno risponde in tempo: la SUA chat si ferma.
    const r = await chiama('POST', `/hook/stop?ap=${id}&chat=c-2`, eventoStop())
    expect(r.dati).toEqual({})

    const stato = (await chiama('GET', '/autopiloti')).dati[0]
    // L'autopilota resta AL LAVORO — non 'attesa' — quindi la guardia non scarta
    // piu' lo Stop delle sorelle: la flotta non e' congelata.
    expect(stato.stato).toBe('lavoro')
    expect(stato.chats.find((c: any) => c.id === 'c-2').stato).toBe('bloccata')
    expect(stato.chats.find((c: any) => c.id === 'c-1').stato).toBe('lavoro')
  })

  it('lo Stop di una sorella viene lavorato mentre un altra chat e bloccata', async () => {
    server = ambiente({ interroga: CHIEDE_FLOTTA, scadenzaDomandaMs: 120 })
    await avvia(server)
    const id = await creaAp({ tettoChat: 2 })
    await attendi(() => chatAvviate.length >= 2)

    await chiama('POST', `/hook/stop?ap=${id}&chat=c-2`, eventoStop()) // c-2 bloccata
    // Ora c-1 chiude un turno: prima veniva scartato ({}), il suo giro perso.
    await chiama('POST', `/hook/stop?ap=${id}&chat=c-1`, eventoStop({ session_id: 's-uno' }))

    const stato = (await chiama('GET', '/autopiloti')).dati[0]
    const c1 = stato.chats.find((c: any) => c.id === 'c-1')
    // Il suo Stop e' stato lavorato: il ciclo per-chat e' salito e la sessione
    // e' stata registrata. Con il congelamento sarebbe rimasto a zero.
    expect(c1.cicli).toBe(1)
    expect(c1.sessionId).toBe('s-uno')
  })

  it('la risposta tardiva riprende solo la chat che aveva chiesto', async () => {
    server = ambiente({ interroga: CHIEDE_FLOTTA, scadenzaDomandaMs: 100 })
    await avvia(server)
    const id = await creaAp({ tettoChat: 2 })
    await attendi(() => chatAvviate.length >= 2)
    await chiama('POST', `/hook/stop?ap=${id}&chat=c-2`, eventoStop()) // timeout -> c-2 bloccata
    chatAvviate.length = 0
    messaggiDiRipresa.length = 0

    const domanda = (await chiama('GET', '/domande')).dati[0]
    await chiama('POST', `/domande/${domanda.id}/risposta`, { risposta: 'usa la chiave X' })
    await attendi(() => chatAvviate.length > 0)

    // Solo c-2 viene rilanciata, con la risposta; c-1 non si tocca.
    expect(chatAvviate.map((c) => c.id)).toEqual(['c-2'])
    expect(messaggiDiRipresa[0]).toContain('usa la chiave X')
    expect((await chiama('GET', '/autopiloti')).dati[0].chats.find((c: any) => c.id === 'c-2').stato).toBe('lavoro')
  })

  it('due chat che chiudono un turno insieme non si perdono la sessione', async () => {
    // Il difetto #4: due chat entravano in suStop insieme, leggevano la stessa
    // copia e salvavano l'una sull'altra — la sessione appena scritta da una
    // spariva e quella chat restava orfana. Ora la sezione rilettura→salva e'
    // atomica e riparte dalle chat fresche.
    const porte: Array<() => void> = []
    server = ambiente({
      esegui: () => Promise.resolve({ codice: 1, uscita: 'ancora rosso' }),
      interroga: (p) =>
        p.includes('va diviso fra')
          ? Promise.resolve({ testo: '{"compiti": ["scrivi i test", "aggiorna i documenti"]}' })
          : new Promise((r) => porte.push(() => r({ testo: '{"azione": "prosegui", "istruzioni": "vai"}' })))
    })
    await avvia(server)
    const id = await creaAp({ tettoChat: 2 })
    await attendi(() => chatAvviate.length >= 2)

    // Le due chiudono un turno "insieme": entrambe entrano in suStop e si fermano
    // al supervisore, ciascuna con la propria sessione.
    const s1 = chiama('POST', `/hook/stop?ap=${id}&chat=c-1`, eventoStop({ session_id: 'sess-uno' }))
    const s2 = chiama('POST', `/hook/stop?ap=${id}&chat=c-2`, eventoStop({ session_id: 'sess-due' }))
    await attendi(() => porte.length >= 2)

    porte.forEach((p) => p())
    await Promise.all([s1, s2])

    const stato = (await chiama('GET', '/autopiloti')).dati[0]
    expect(stato.chats.find((c: any) => c.id === 'c-1').sessionId).toBe('sess-uno')
    expect(stato.chats.find((c: any) => c.id === 'c-2').sessionId).toBe('sess-due')
  })
})

describe('modificare a mano mentre un turno si chiude', () => {
  it('un modifica arrivato durante suStop non viene sovrascritto (RMW)', async () => {
    // suStop legge l'autopilota all'inizio e salva minuti dopo (criteri seriali,
    // supervisore). In quella finestra l'utente puo' aver cambiato l'obiettivo con
    // «modifica»: se suStop salvasse la sua fotografia vecchia, la modifica
    // sparirebbe in silenzio. Si blocca il supervisore, si modifica, si rilascia.
    let rilascia: () => void = () => {}
    const bloccato = new Promise<void>((r) => { rilascia = r })
    server = ambiente({
      interroga: async (p) => {
        if (p.includes('va diviso fra')) return { testo: '{"azione": "finito"}' }
        await bloccato
        return { testo: '{"azione": "finito"}' }
      }
    })
    await avvia(server)
    const id = await creaAp()

    // Lo Stop entra in suStop e si ferma dentro il supervisore (interroga bloccato).
    const stop = chiama('POST', `/hook/stop?ap=${id}`, eventoStop())
    await new Promise((r) => setTimeout(r, 80))

    // Nel frattempo l'utente cambia l'obiettivo a mano.
    const m = await chiama('PATCH', `/autopiloti/${id}`, { obiettivo: 'obiettivo nuovo dell utente' })
    expect(m.stato).toBe(200)

    // Ora suStop finisce e salva: NON deve cancellare la modifica.
    rilascia()
    await stop

    expect((await chiama('GET', '/autopiloti')).dati[0].obiettivo).toBe('obiettivo nuovo dell utente')
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

  it('dopo la risposta si configura da se e aspetta il tuo via', async () => {
    server = ambiente({ interroga: intervistatore(), scadenzaInterviataMs: 5000 })
    await avvia(server)
    const { dati } = await chiama('POST', '/autopiloti', {
      obiettivo: 'Sistema il lettore', cwd: process.cwd(), criteri: []
    })

    await attendi(async () => (await chiama('GET', '/domande')).dati.length > 0)
    const domanda = (await chiama('GET', '/domande')).dati[0]
    await chiama('POST', `/domande/${domanda.id}/risposta`, { risposta: 'Sì, anche YAML' })

    await attendi(async () => (await chiama('GET', '/autopiloti')).dati[0].stato === 'pronto')
    const stato = (await chiama('GET', '/autopiloti')).dati[0]
    expect(stato.id).toBe(dati.id)
    expect(stato.nome).toBe('Lettore')
    expect(stato.criteri[0]).toMatchObject({ descrizione: 'i test passano', comando: 'npm test' })
    // La risposta resta negli atti: un riavvio non deve rifare la stessa domanda.
    expect(stato.intervista[0]).toMatchObject({ risposta: 'Sì, anche YAML' })
    // **Non parte da solo.** Sono ore di lavoro che comincerebbero su criteri
    // che l'utente non ha mai letto: si ferma qui, e lo dice.
    expect(avviati).toEqual([])
    expect(avvisi.map((a) => a.tipo)).toContain('pronto')
  })

  it('e con il tuo via parte, una volta sola', async () => {
    server = ambiente({ interroga: intervistatore(), scadenzaInterviataMs: 5000 })
    await avvia(server)
    const { dati } = await chiama('POST', '/autopiloti', {
      obiettivo: 'Sistema il lettore', cwd: process.cwd(), criteri: []
    })
    await attendi(async () => (await chiama('GET', '/domande')).dati.length > 0)
    const domanda = (await chiama('GET', '/domande')).dati[0]
    await chiama('POST', `/domande/${domanda.id}/risposta`, { risposta: 'Sì' })
    await attendi(async () => (await chiama('GET', '/autopiloti')).dati[0].stato === 'pronto')

    const r = await chiama('POST', `/autopiloti/${dati.id}/vai`)

    expect(r.stato).toBe(200)
    expect(r.dati.stato).toBe('lavoro')
    expect(avviati).toEqual([dati.id])
  })

  it('il via a chi non e pronto non fa niente, e lo dice', async () => {
    // Un secondo clic, o un tasto rimasto su una schermata vecchia: deve
    // rispondere di no, non far ripartire una chat che sta gia' lavorando.
    server = ambiente()
    await avvia(server)
    const id = await creaAp()
    avviati.length = 0

    const r = await chiama('POST', `/autopiloti/${id}/vai`)

    expect(r.stato).toBe(400)
    expect(avviati).toEqual([])
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
      if ((await chiama('GET', '/autopiloti')).dati[0].stato === 'pronto') break
      await new Promise((r) => setTimeout(r, 25))
    }
    const stato = (await chiama('GET', '/autopiloti')).dati[0]
    expect(stato.stato).toBe('pronto')
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

  it('dopo la risposta smette di dire che sta chiedendo', async () => {
    // La domanda aperta vive nel motivo, ed e' da li' che il pannello capisce
    // se l'autopilota aspetta l'utente. Lasciarcela dopo la risposta significa
    // un LED ambra che lampeggia mentre lui sta gia' lavorando - e
    // l'interrogazione successiva puo' durare minuti.
    let riparti: () => void = () => undefined
    const lunga = new Promise<{ testo: string }>((r) => {
      riparti = () => r({ testo: '{"pronto": true, "criteri": [{"descrizione": "fatto"}]}' })
    })
    let giro = 0
    server = ambiente({
      interroga: (prompt) => {
        if (!prompt.includes('Stai preparando')) return Promise.resolve({ testo: '{"azione": "finito"}' })
        giro += 1
        return giro === 1 ? Promise.resolve({ testo: '{"domanda": "Anche YAML?"}' }) : lunga
      },
      scadenzaInterviataMs: 5000
    })
    await avvia(server)
    await chiama('POST', '/autopiloti', { obiettivo: 'x', cwd: process.cwd(), criteri: [] })

    await attendi(async () => (await chiama('GET', '/domande')).dati.length > 0)
    const domanda = (await chiama('GET', '/domande')).dati[0]
    await chiama('POST', `/domande/${domanda.id}/risposta`, { risposta: 'si' })

    await attendi(async () => (await chiama('GET', '/autopiloti')).dati[0].intervista.length === 1)
    const stato = (await chiama('GET', '/autopiloti')).dati[0]
    expect(stato.stato).toBe('intervista')
    expect(stato.motivoSospensione).toBeUndefined()
    riparti()
  })

  it('la preparazione chiede il tempo di leggersi il progetto', async () => {
    // Sul campo e' stata uccisa a cinque minuti tre volte di fila, e l'utente
    // leggeva «la preparazione si e guastata». Non era guasta: cinque minuti
    // sono il tempo di un giudizio - dove c'e' una chat ferma che aspetta - e
    // qui invece bisogna leggersi un progetto mai visto.
    const tempi: (number | undefined)[] = []
    server = ambiente({
      interroga: (prompt, _cwd, _sessione, opzioni) => {
        if (!prompt.includes('Stai preparando')) return Promise.resolve({ testo: '{"azione": "finito"}' })
        tempi.push(opzioni?.timeoutMs)
        return Promise.resolve({
          testo: '{"pronto": true, "criteri": [{"descrizione": "fatto", "comando": "npm test"}]}'
        })
      }
    })
    await avvia(server)
    await chiama('POST', '/autopiloti', { obiettivo: 'x', cwd: process.cwd(), criteri: [] })

    await attendi(async () => (await chiama('GET', '/autopiloti')).dati[0].stato === 'pronto')
    expect(tempi[0]).toBeGreaterThanOrEqual(15 * 60_000)
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

describe('il workspace di destinazione', () => {
  beforeEach(async () => { server = ambiente(); await avvia(server) })

  it('si ricorda quello da cui l autopilota e stato avviato', async () => {
    // Serve alla consegna: e' l'autopilota a sapere dove deve andare il lavoro,
    // non chi lo cerca dentro `workspaces.json` quando la chat non e' ancora
    // nata da nessuna parte.
    const { dati } = await chiama('POST', '/autopiloti', {
      obiettivo: 'x', cwd: process.cwd(), criteri: [{ descrizione: 'y' }], workspace: 'lavoro'
    })
    expect(dati.workspace).toBe('lavoro')
    expect((await chiama('GET', '/autopiloti')).dati[0].workspace).toBe('lavoro')
  })

  it('senza workspace resta senza, e non e un errore', async () => {
    const { stato, dati } = await chiama('POST', '/autopiloti', {
      obiettivo: 'x', cwd: process.cwd(), criteri: [{ descrizione: 'y' }]
    })
    expect(stato).toBe(200)
    expect(dati.workspace).toBeUndefined()
  })
})

describe('il ciclo si vede subito', () => {
  it('e non alla fine dei criteri', async () => {
    // Il conto era calcolato all'arrivo dell'hook e scritto su disco **dopo**
    // i criteri. Con un criterio lento — e ce n'erano da dieci minuti — per
    // tutto quel tempo l'autopilota diceva «al lavoro, 0 interventi»: e' la
    // riga che l'utente ha guardato per un pomeriggio credendo che fosse fermo.
    let sblocca: () => void = () => {}
    const inCorso = new Promise<void>((ris) => { sblocca = ris })
    server = ambiente({
      esegui: async () => {
        await inCorso
        return { codice: 1, uscita: 'rosso' }
      }
    })
    await avvia(server)
    const id = await creaAp()

    // L'hook non si aspetta: e' esattamente il tempo in cui i criteri girano.
    const hook = chiama('POST', `/hook/stop?ap=${id}`, eventoStop())
    // Un giro dell'event loop perche' la richiesta arrivi al server e il
    // salvataggio avvenga, prima che i criteri finiscano.
    await new Promise((ris) => setTimeout(ris, 150))

    expect((await chiama('GET', '/autopiloti')).dati[0].cicli).toBe(1)
    sblocca()
    await hook
  })
})

describe('la chat viva che non finisce mai', () => {
  // Il difetto che tre correzioni non hanno visto: l'hook `Stop` scatta solo
  // alla fine di un turno, e una chat ferma ad aspettare una shell che ha
  // lanciato lei un turno non lo chiude mai. Nessun `Stop`, nessun ciclo, e
  // l'autopilota resta «al lavoro, 0 interventi» **per sempre** — 34 minuti
  // veri, misurati su una trascrizione, senza che nessuno se ne accorgesse.
  let ora = Date.parse('2026-08-09T10:00:00.000Z')
  const adesso = (): string => new Date(ora).toISOString()

  it('viene sospesa e detta, invece di restare al lavoro per sempre', async () => {
    ora = Date.parse('2026-08-09T10:00:00.000Z')
    server = ambiente({ silenzioMassimoMs: 30 * 60_000, adesso })
    await avvia(server)
    const id = await creaAp()

    // Mezz'ora di silenzio: nessun hook, nessun segnale.
    ora += 31 * 60_000
    server.controllaChatFerme()

    const stato = (await chiama('GET', '/autopiloti')).dati[0]
    expect(stato.stato).toBe('sospeso')
    expect(stato.motivoSospensione).toMatch(/nessun segnale|ferma/i)
    expect(avvisi.some((v) => v.tipo === 'sospeso' && v.id === id)).toBe(true)
  })

  it('una chat che parla non viene toccata', async () => {
    ora = Date.parse('2026-08-09T10:00:00.000Z')
    server = ambiente({
      silenzioMassimoMs: 30 * 60_000,
      adesso,
      esegui: () => Promise.resolve({ codice: 1, uscita: 'rosso' })
    })
    await avvia(server)
    const id = await creaAp()

    ora += 20 * 60_000
    await chiama('POST', `/hook/stop?ap=${id}`, eventoStop())
    ora += 20 * 60_000
    server.controllaChatFerme()

    // Venti minuti dall'ultimo `Stop`: sta lavorando, e un turno lungo e' la
    // cosa normale in questo mestiere.
    expect((await chiama('GET', '/autopiloti')).dati[0].stato).toBe('lavoro')
  })

  it('il battito del Gestore vale come segno di vita: un turno lungo che non chiude non sospende', async () => {
    // Una chat dentro una compilazione da un'ora non manda hook, ma il
    // Gestore la vede lavorare («esc to interrupt») e lo dice ogni minuto.
    // Prima di questa misura il guardiano la sospendeva mentre lavorava.
    ora = Date.parse('2026-08-09T10:00:00.000Z')
    server = ambiente({ silenzioMassimoMs: 30 * 60_000, adesso })
    await avvia(server)
    const id = await creaAp()
    const chatId = (await chiama('GET', '/autopiloti')).dati[0].chats?.[0]?.id as string | undefined
    ora += 25 * 60_000
    const r = await chiama('POST', '/battiti', { segni: [{ autopilota: id, ...(chatId !== undefined ? { chat: chatId } : {}) }] })
    expect(r.dati.contati).toBe(1)
    ora += 25 * 60_000
    server.controllaChatFerme()
    // Cinquanta minuti senza hook, ma un battito venticinque minuti fa: vive.
    expect((await chiama('GET', '/autopiloti')).dati[0].stato).toBe('lavoro')
    // Poi il silenzio vero: trentuno minuti dall'ultimo battito.
    ora += 7 * 60_000
    server.controllaChatFerme()
    expect((await chiama('GET', '/autopiloti')).dati[0].stato).toBe('sospeso')
  })

  it('IL DIFETTO: rispondere di mattina non fa sospendere un istante dopo', async () => {
    // Una chat chiude un turno a mezzanotte, poi fa una domanda e aspetta.
    // L'utente risponde alle otto: la chat riparte, ma l'ultimo turno **chiuso**
    // e' di otto ore prima — e il primo giro del guardiano, un minuto dopo, la
    // sospendeva dando la colpa a lei. L'orologio del silenzio riparte quando un
    // turno comincia.
    //
    // Serve un `Stop` prima: senza, la mappa e' vuota e si ricade su
    // `ultimoEvento`, che il salvataggio della risposta ha appena rinfrescato.
    ora = Date.parse('2026-08-09T00:00:00.000Z')
    server = ambiente({
      silenzioMassimoMs: 30 * 60_000,
      adesso,
      esegui: () => Promise.resolve({ codice: 1, uscita: 'rosso' })
    })
    await avvia(server)
    const id = await creaAp()
    await chiama('POST', `/hook/stop?ap=${id}`, eventoStop())

    await chiama('POST', `/hook/notification?ap=${id}`, {
      session_id: 's-1', hook_event_name: 'Notification',
      notification_type: 'permission_prompt', message: 'quale chiave uso?'
    })
    const domande = (await chiama('GET', `/domande?ap=${id}`)).dati

    // Otto ore di attesa: e' l'utente che dorme, non la chat che si e' fermata.
    ora += 8 * 60 * 60_000
    await chiama('POST', `/domande/${domande[0].id}/risposta`, { risposta: 'la chiave A', da: 'modale' })

    // Un minuto dopo la ripresa il guardiano gira.
    ora += 60_000
    server.controllaChatFerme()
    expect((await chiama('GET', '/autopiloti')).dati[0].stato).toBe('lavoro')
  })

  it('non sospende chi sta verificando i criteri', async () => {
    // I criteri sono seriali e possono durare minuti: sono lavoro, non
    // silenzio. Sospendere qui vorrebbe dire fermare un autopilota **perche**
    // sta facendo quello che gli abbiamo chiesto.
    ora = Date.parse('2026-08-09T10:00:00.000Z')
    let sblocca: () => void = () => {}
    const inCorso = new Promise<void>((ris) => { sblocca = ris })
    server = ambiente({
      silenzioMassimoMs: 30 * 60_000,
      adesso,
      esegui: async () => { await inCorso; return { codice: 1, uscita: 'rosso' } }
    })
    await avvia(server)
    const id = await creaAp()
    const hook = chiama('POST', `/hook/stop?ap=${id}`, eventoStop())
    await new Promise((ris) => setTimeout(ris, 150))

    ora += 60 * 60_000
    server.controllaChatFerme()
    expect((await chiama('GET', '/autopiloti')).dati[0].stato).toBe('lavoro')

    sblocca()
    await hook
  })
})

describe('metterci le mani: modificare a mano', () => {
  beforeEach(async () => { server = ambiente(); await avvia(server) })

  it('cambia obiettivo, criteri e compiti', async () => {
    const id = await creaAp()

    const r = await chiama('PATCH', `/autopiloti/${id}`, {
      obiettivo: 'Fai partire l installer',
      criteri: [
        { descrizione: 'l installer risponde 200', comando: 'curl -sI x' },
        { descrizione: 'lo dice il supervisore' }
      ],
      compitiDaFare: ['caricare il file', 'controllare il latest.yml']
    })

    expect(r.stato).toBe(200)
    const a = (await chiama('GET', '/autopiloti')).dati[0]
    expect(a.obiettivo).toBe('Fai partire l installer')
    expect(a.criteri.map((c: any) => c.descrizione)).toEqual([
      'l installer risponde 200', 'lo dice il supervisore'
    ])
    // Un criterio senza comando e' legittimo: lo giudica il supervisore.
    expect(a.criteri[1].comando).toBeUndefined()
    expect(a.compitiDaFare).toEqual(['caricare il file', 'controllare il latest.yml'])
    // Resta scritto che ci hai messo mano: il diario e' la memoria di chi
    // torna a guardare domani.
    expect(JSON.stringify(a.decisioni)).toContain('mano')
  })

  it('un criterio che cambia riparte da non soddisfatto', async () => {
    // Tenere la spunta di prima direbbe che una cosa mai misurata e' gia'
    // vera, ed e' esattamente cosi' che un autopilota si dichiara finito
    // senza aver fatto niente.
    const id = await creaAp()
    await chiama('PATCH', `/autopiloti/${id}`, {
      criteri: [{ descrizione: 'i test passano', comando: 'npm run test:ci', soddisfatto: true }]
    })
    const a = (await chiama('GET', '/autopiloti')).dati[0]
    expect(a.criteri[0].soddisfatto).toBe(false)
  })

  it('rifiuta di lasciarlo senza una fine da raggiungere', async () => {
    const id = await creaAp()
    const r = await chiama('PATCH', `/autopiloti/${id}`, { criteri: [] })
    expect(r.stato).toBe(400)
    expect((await chiama('GET', '/autopiloti')).dati[0].criteri).toHaveLength(1)
  })

  it('rifiuta un criterio senza descrizione invece di scriverne uno vuoto', async () => {
    const id = await creaAp()
    const r = await chiama('PATCH', `/autopiloti/${id}`, { criteri: [{ comando: 'npm test' }] })
    expect(r.stato).toBe(400)
  })

  it('quello che non nomini resta com era', async () => {
    const id = await creaAp()
    await chiama('PATCH', `/autopiloti/${id}`, { compitiDaFare: ['solo questo'] })
    const a = (await chiama('GET', '/autopiloti')).dati[0]
    expect(a.obiettivo).toBe('Fai passare la suite')
    expect(a.criteri).toHaveLength(1)
  })
})

describe('parlargli, e disfare', () => {
  /** Un supervisore che capisce la richiesta e restituisce il cambio. */
  function capisce(cambio: unknown): Interrogazione {
    return (prompt) =>
      Promise.resolve({
        testo: prompt.includes('ti ha scritto')
          ? JSON.stringify(cambio)
          : '{"azione": "continua"}'
      })
  }

  it('applica subito, e racconta cosa ha capito', async () => {
    server = ambiente({
      interroga: capisce({
        capito: 'tolto i test, aggiunto l installer',
        criteri: [{ descrizione: 'l installer risponde 200', comando: 'curl -sI x' }],
        compitiDaFare: ['sistemare l installer']
      })
    })
    await avvia(server)
    const id = await creaAp()

    const r = await chiama('POST', `/autopiloti/${id}/parla`, {
      testo: 'lascia stare i test, pensa all installer'
    })

    expect(r.stato).toBe(200)
    expect(r.dati.capito).toContain('installer')
    const a = (await chiama('GET', '/autopiloti')).dati[0]
    expect(a.criteri.map((c: any) => c.descrizione)).toEqual(['l installer risponde 200'])
    expect(a.compitiDaFare).toEqual(['sistemare l installer'])
    // La fotografia di prima: e' cio' che rende «disfa» un tasto vero.
    expect(a.modifiche).toHaveLength(1)
    expect(a.modifiche[0].testo).toBe('lascia stare i test, pensa all installer')
    expect(a.modifiche[0].prima.criteri[0].descrizione).toBe('i test passano')
  })

  it('se non ha capito non tocca niente, e lo dice', async () => {
    // Meglio una domanda in piu' che un autopilota che cambia strada per un
    // fraintendimento: qui «applica subito» sarebbe un danno.
    server = ambiente({ interroga: () => Promise.resolve({ testo: 'boh, non ho capito' }) })
    await avvia(server)
    const id = await creaAp()

    const r = await chiama('POST', `/autopiloti/${id}/parla`, { testo: 'fai la cosa giusta' })

    expect(r.stato).toBe(200)
    expect(r.dati.applicato).toBe(false)
    const a = (await chiama('GET', '/autopiloti')).dati[0]
    expect(a.criteri.map((c: any) => c.descrizione)).toEqual(['i test passano'])
    expect(a.modifiche).toEqual([])
  })

  it('disfa rimette esattamente com era', async () => {
    server = ambiente({
      interroga: capisce({
        capito: 'cambiato tutto',
        obiettivo: 'Un altro obiettivo',
        criteri: [{ descrizione: 'un altro criterio' }],
        compitiDaFare: ['un altro compito']
      })
    })
    await avvia(server)
    const id = await creaAp()
    await chiama('POST', `/autopiloti/${id}/parla`, { testo: 'cambia tutto' })

    const r = await chiama('POST', `/autopiloti/${id}/disfa`)

    expect(r.stato).toBe(200)
    const a = (await chiama('GET', '/autopiloti')).dati[0]
    expect(a.obiettivo).toBe('Fai passare la suite')
    expect(a.criteri.map((c: any) => c.descrizione)).toEqual(['i test passano'])
    expect(a.compitiDaFare).toEqual([])
    // La modifica disfatta se ne va: lasciarla lascerebbe un tasto che disfa
    // due volte la stessa cosa.
    expect(a.modifiche).toEqual([])
  })

  it('disfare quando non c e niente da disfare non rompe niente', async () => {
    server = ambiente()
    await avvia(server)
    const id = await creaAp()
    const r = await chiama('POST', `/autopiloti/${id}/disfa`)
    expect(r.stato).toBe(400)
  })

  it('un messaggio vuoto non arriva al supervisore', async () => {
    let interrogato = false
    server = ambiente({
      interroga: () => { interrogato = true; return Promise.resolve({ testo: '{}' }) }
    })
    await avvia(server)
    const id = await creaAp()
    const r = await chiama('POST', `/autopiloti/${id}/parla`, { testo: '   ' })
    expect(r.stato).toBe(400)
    expect(interrogato).toBe(false)
  })
})

describe('la prova di ogni criterio, scritta accanto al criterio', () => {
  it('dopo un giro si sa com e andata, non solo se e passata', async () => {
    // E' la riga che insegna cosa sia un criterio: sotto «i test passano» si
    // legge il comando e cosa ha risposto l'ultima volta.
    server = ambiente({ esegui: () => Promise.resolve({ codice: 1, uscita: '3 test rossi' }) })
    await avvia(server)
    const id = await creaAp()

    await chiama('POST', `/hook/stop?ap=${id}`, eventoStop())

    const a = (await chiama('GET', '/autopiloti')).dati[0]
    expect(a.criteri[0].ultimaVerifica.codice).toBe(1)
    expect(a.criteri[0].ultimaVerifica.uscita).toContain('3 test rossi')
    expect(a.criteri[0].ultimaVerifica.quando).toBeTruthy()
  })
})

describe('cosa ha capito, e cosa ha raggiunto', () => {
  it('conserva le tue parole anche dopo che la preparazione le riscrive', async () => {
    // La preparazione riformula l'obiettivo con parole sue. Senza le tue
    // accanto non c'e' modo di giudicare se ha capito bene o se sta andando a
    // fare un'altra cosa.
    server = ambiente({
      interroga: (prompt) => Promise.resolve({
        testo: prompt.includes('Stai preparando')
          ? '{"pronto": true, "obiettivo": "Rendere verde la suite senza saltare test", "criteri": [{"descrizione": "i test passano", "comando": "npm test"}]}'
          : '{"azione": "finito"}'
      }),
      scadenzaInterviataMs: 5000
    })
    await avvia(server)
    await chiama('POST', '/autopiloti', {
      obiettivo: 'fai passare i test', cwd: process.cwd(), criteri: []
    })

    for (let i = 0; i < 120; i += 1) {
      if ((await chiama('GET', '/autopiloti')).dati[0].stato === 'pronto') break
      await new Promise((r) => setTimeout(r, 25))
    }
    const a = (await chiama('GET', '/autopiloti')).dati[0]
    expect(a.obiettivo).toContain('Rendere verde la suite')
    expect(a.obiettivoTuo).toBe('fai passare i test')
  })

  it('segna quando un criterio viene raggiunto, e lo toglie se torna indietro', async () => {
    // Una spunta senza data non dice se e' successo adesso o tre ore fa. Il
    // secondo criterio resta rosso di proposito: serve a tenere l'autopilota al
    // lavoro, cosi' il giro successivo avviene davvero.
    let passa = true
    server = ambiente({
      esegui: (comando) => Promise.resolve(
        comando === 'npm test'
          ? (passa ? { codice: 0, uscita: 'ok' } : { codice: 1, uscita: '2 rossi' })
          : { codice: 1, uscita: 'lint sporco' }
      )
    })
    await avvia(server)
    const id = await creaAp({
      criteri: [
        { descrizione: 'i test passano', comando: 'npm test' },
        { descrizione: 'lint pulito', comando: 'npm run lint' }
      ]
    })

    await chiama('POST', `/hook/stop?ap=${id}`, eventoStop())
    const dopoIlVerde = (await chiama('GET', '/autopiloti')).dati[0]
    expect(dopoIlVerde.criteri[0].soddisfatto).toBe(true)
    expect(dopoIlVerde.criteri[0].raggiuntoIl).toBeTruthy()
    // Quello rosso non ha nessuna data addosso.
    expect(dopoIlVerde.criteri[1].raggiuntoIl).toBeUndefined()

    passa = false
    await chiama('POST', `/hook/stop?ap=${id}`, eventoStop())
    const dopoIlRosso = (await chiama('GET', '/autopiloti')).dati[0]
    expect(dopoIlRosso.criteri[0].soddisfatto).toBe(false)
    // Se non e' piu' vero, la data se ne va: «raggiunto alle 14:32» accanto a
    // una cosa adesso rossa e' una bugia.
    expect(dopoIlRosso.criteri[0].raggiuntoIl).toBeUndefined()
  })
})
