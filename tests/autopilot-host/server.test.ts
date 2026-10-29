import { apriMemoria } from '../../src/autopilot-host/memoria'
import { apriRegistroTempi } from '../../src/autopilot-host/tempi'
import { STRATEGIE } from '../../src/autopilot-host/strategie'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { Server } from 'node:http'
import { creaServer, type ServerAutopiloti } from '../../src/autopilot-host/server'
import { apriArchivio, type Archivio } from '../../src/autopilot-host/archivio'
import type { Esecutore } from '../../src/autopilot-host/verifiche'
import type { Interrogazione } from '../../src/autopilot-host/supervisore'
import { creaRegistroDomande } from '../../src/autopilot-host/domande'
import { nuovoAutopilota, type ChatGovernata } from '@shared/autopilota'
import { statoCopia, type Git } from '../../src/autopilot-host/worktree'

/**
 * Un git finto per la flotta: un repository sul ramo `main`, dove i worktree
 * nascono e ogni ramo risulta gia' unito. Il git vero e' in `worktree.test.ts`.
 */
const gitFinto: Git = (args, cwd) => {
  const a = args.join(' ')
  if (a === 'rev-parse --show-toplevel') return { codice: 0, uscita: cwd }
  if (a === 'rev-parse --abbrev-ref HEAD') return { codice: 0, uscita: 'main' }
  if (a.startsWith('rev-parse --verify')) return { codice: 1, uscita: '' }
  if (a === 'remote -v') return { codice: 0, uscita: '' }
  if (a === 'config user.name') return { codice: 0, uscita: 'prova' }
  return { codice: 0, uscita: '' }
}
/** I limiti del piano larghi: il freno lascia aprire tutte le chat utili. */
const LIMITI_LIBERI = { cinqueOre: { percento: 10 }, settimana: { percento: 10 } }
let limitiDaSpingere: unknown

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
    git?: Git
    /** Il controllo delle copie delle chat (c-310): assente, non si controlla. */
    copia?: (cartella: string) => 'ok' | 'mancante' | 'non-git'
    limiti?: unknown
    tempi?: ReturnType<typeof apriRegistroTempi>
    /** Per simulare un riavvio del servizio: lo stesso archivio e le domande da un file. */
    cartellaArchivio?: string
    domande?: ReturnType<typeof creaRegistroDomande>
    memoria?: ReturnType<typeof apriMemoria>
    /** La versione installata, come la passa il Gestore (0.81.0: le domande già risolte). */
    versione?: string
    /** La chat non parte (il Gestore la rifiuta). */
    avvioFallisce?: boolean
  } = {}
): ServerAutopiloti {
  limitiDaSpingere = opts.limiti
  archivio = apriArchivio(opts.cartellaArchivio ?? mkdtempSync(join(tmpdir(), 'ap-server-')))
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
      return opts.avvioFallisce === true ? Promise.reject(new Error('la chat non parte')) : Promise.resolve()
    },
    fermaLavoro: (id, chatId) => { fermati.push(chatId === undefined ? id : `${id}::${chatId}`) },
    avvisa: (tipo, a, domanda) => {
      avvisi.push({ tipo, id: a.id, domanda })
      return Promise.resolve()
    },
    domande: opts.domande ?? creaRegistroDomande({ adesso: () => Date.now() }),
    scadenzaDomandaMs: opts.scadenzaDomandaMs ?? 5000,
    scadenzaInterviataMs: opts.scadenzaInterviataMs ?? 5000,
    ...(opts.silenzioMassimoMs !== undefined ? { silenzioMassimoMs: opts.silenzioMassimoMs } : {}),
    adesso: opts.adesso ?? (() => '2026-08-09T10:05:00.000Z'),
    ...(opts.git !== undefined ? { git: opts.git } : {}),
    ...(opts.copia !== undefined ? { copia: opts.copia } : {}),
    ...(opts.tempi !== undefined ? { tempi: opts.tempi } : {}),
    ...(opts.memoria !== undefined ? { memoria: opts.memoria } : {}),
    ...(opts.versione !== undefined ? { versione: opts.versione } : {})
  })
}
function creaServerCon(opts: Parameters<typeof ambiente>[0]): ServerAutopiloti {
  return ambiente(opts)
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
      // Lo stato del programma, come lo spinge il Gestore: con i limiti del
      // piano il freno sa quante chat concedere.
      if (limitiDaSpingere === undefined) { ris(); return }
      void chiama('POST', '/stato-programma', { letto: Date.now(), limiti: limitiDaSpingere }).then(() => ris())
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

  // 0.81.0: l'elenco si rilegge ogni 2-5 s da più parti; se non è cambiato, 304.
  it('l’elenco ha un ETag: lo stesso elenco risponde 304, uno cambiato no', async () => {
    await creaAp()
    const primo = await fetch(`http://127.0.0.1:${porta}/autopiloti`)
    const etag = primo.headers.get('etag')
    expect(primo.status).toBe(200)
    expect(etag).toBeTruthy()
    const di = (): Promise<Response> => fetch(`http://127.0.0.1:${porta}/autopiloti`, { headers: { 'If-None-Match': etag as string } })
    const secondo = await di()
    expect(secondo.status).toBe(304)
    expect(await secondo.text()).toBe('')
    await creaAp({ obiettivo: 'un altro obiettivo' })
    expect((await di()).status).toBe(200)
  })

  // 0.81.0, «Adesso»: senza segni una chat è muta da quando il servizio li raccoglie.
  it('l’elenco dice da quando il servizio raccoglie i segni, anche senza segni', async () => {
    await creaAp()
    const [a] = (await chiama('GET', '/autopiloti')).dati
    expect(Number.isNaN(Date.parse(a.segniDal))).toBe(false)
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

  // 29/10: prima si «rifaceva il giro» (0.80.1), ed era il cerchio di c-157
  // (531 giri in un giorno con tutto verde). Adesso la chat si lascia fermare:
  // l'autopilota resta al lavoro, non finisce e non sospende.
  it('non dichiara finito quando il giudizio e illeggibile, e non sospende: la chat si ferma (29/10)', async () => {
    let domande = 0
    server = ambiente({ interroga: () => { domande++; return Promise.resolve({ testo: 'boh' }) } })
    await avvia(server)
    const id = await creaAp()
    const r = await chiama('POST', `/hook/stop?ap=${id}`, eventoStop({ last_assistant_message: 'Fatto.' }))
    const stato = (await chiama('GET', '/autopiloti')).dati[0]
    expect(stato.stato).toBe('lavoro')
    expect(r.dati).toEqual({})
    expect(stato.decisioni.some((d: { cosa: string }) => d.cosa.includes('si ferma: i criteri passano e il supervisore non ha risposto'))).toBe(true)
    // 0.82.1: niente seconda interrogazione subito, la chat non resta ferma altri 5 minuti.
    expect(domande).toBe(1)
    expect(avvisi.some((v) => v.tipo === 'sospeso')).toBe(false)
  })

  // 29/10: con un criterio rosso. Con tutto verde e il supervisore muto la chat
  // adesso si ferma (vedi sopra): l'ultima istruzione valida serve quando c'è
  // ancora qualcosa da sistemare. L'uscita cambia a ogni giro: niente cerchio.
  it('0.82.1: supervisore scaduto: la chat prosegue con l’ultima istruzione valida, lui riprova al giro dopo', async () => {
    let domande = 0
    let risponde = true
    let giri = 0
    server = ambiente({
      esegui: () => Promise.resolve({ codice: 1, uscita: `rosso ${++giri}` }),
      interroga: () => {
        domande++
        return risponde
          ? Promise.resolve({ testo: '{"azione": "prosegui", "istruzioni": "Aggiungi il test della coda e fai commit."}' })
          : Promise.reject(new Error('interrogazione del supervisore fallita: scaduto dopo 5 minuti'))
      }
    })
    await avvia(server)
    const id = await creaAp()
    const primo = await chiama('POST', `/hook/stop?ap=${id}`, eventoStop({ last_assistant_message: 'Fatto metà.' }))
    expect(primo.dati.reason).toContain('Aggiungi il test della coda')

    risponde = false
    domande = 0
    const secondo = await chiama('POST', `/hook/stop?ap=${id}`, eventoStop({ last_assistant_message: 'Ancora un pezzo.' }))
    expect(secondo.dati.decision).toBe('block')
    expect(secondo.dati.reason).toContain('ultima istruzione valida')
    expect(secondo.dati.reason).toContain('Aggiungi il test della coda')
    expect(domande).toBe(1)
    expect((await chiama('GET', '/autopiloti')).dati[0].stato).toBe('lavoro')
    expect(avvisi.some((v) => v.tipo === 'avviso')).toBe(false)
  })

  it('0.82.1: al tetto di risposte mancate arriva una riga a Nicholas, niente si sospende, e il supervisore si riprova a giri', async () => {
    let domande = 0
    let giri = 0
    server = ambiente({ esegui: () => Promise.resolve({ codice: 1, uscita: `rosso ${++giri}` }), interroga: () => { domande++; return Promise.reject(new Error('scaduto dopo 5 minuti')) } })
    await avvia(server)
    const id = await creaAp()
    const giro = async (): Promise<any> => (await chiama('POST', `/hook/stop?ap=${id}`, eventoStop({ last_assistant_message: 'Lavoro.' }))).dati
    for (let i = 0; i < 3; i++) expect((await giro()).decision).toBe("block")
    expect(domande).toBe(3)
    const avvisiMancati = avvisi.filter((v) => v.tipo === 'avviso')
    expect(avvisiMancati).toHaveLength(1)
    expect(avvisiMancati[0]?.domanda).toContain('non risponde da 3 giri')
    expect(avvisi.some((v) => v.tipo === 'sospeso')).toBe(false)
    // Dopo il tetto: interrogato al giro 4 (multiplo del tetto), saltato al 5 e al 6.
    await giro(); await giro(); await giro()
    expect(domande).toBe(4)
    expect(avvisi.filter((v) => v.tipo === 'avviso')).toHaveLength(1)
    const stato = (await chiama('GET', '/autopiloti')).dati[0]
    expect(stato.stato).toBe('lavoro')
    expect(stato.supervisoreMancato).toBe(6)
    // 29/10: alla quinta interrogazione andata a vuoto non si riprova più
    // all'infinito: l'autopilota si sospende, con un avviso solo.
    await giro()
    expect(domande).toBe(5)
    expect((await chiama('GET', '/autopiloti')).dati[0].stato).toBe('sospeso')
    expect(avvisi.filter((v) => v.tipo === 'sospeso')).toHaveLength(1)
  })

  it('0.82.1: quando il supervisore torna a rispondere il conto riparte da zero', async () => {
    let scaduto = true
    server = ambiente({ interroga: () => (scaduto ? Promise.reject(new Error('scaduto')) : Promise.resolve({ testo: '{"azione": "prosegui", "istruzioni": "Avanti col pezzo due."}' })) })
    await avvia(server)
    const id = await creaAp()
    await chiama('POST', `/hook/stop?ap=${id}`, eventoStop({ last_assistant_message: 'Uno.' }))
    expect((await chiama('GET', '/autopiloti')).dati[0].supervisoreMancato).toBe(1)
    scaduto = false
    await chiama('POST', `/hook/stop?ap=${id}`, eventoStop({ last_assistant_message: 'Due.' }))
    const stato = (await chiama('GET', '/autopiloti')).dati[0]
    expect(stato.supervisoreMancato).toBeUndefined()
    expect(stato.ultimeIstruzioni).toContain('Avanti col pezzo due.')
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
    // Prima di avviare: la domanda puo' scadere prima ancora che il test la veda.
    const avvisi = vi.spyOn(console, 'warn')
    await avvia(server)
    const { dati } = await chiama('POST', '/autopiloti', {
      obiettivo: 'Sistema il lettore', cwd: process.cwd(), criteri: []
    })

    for (let i = 0; i < 80 && domande === 0; i += 1) await new Promise((r) => setTimeout(r, 25))
    // La domanda scade e l'autopilota resta in intervista: e' li' che l'utente
    // preme «Riprendi». Dalla 0.71 la domanda scaduta resta aperta nelle Domande
    // (si risponde anche tardi), quindi `/domande` non si svuota piu': il ciclo
    // che lo aspettava girava a vuoto 80 volte e a PC carico superava i 20 s
    // (20/10). Il segno della scadenza e' la riga del servizio.
    try {
      for (let i = 0; i < 400; i += 1) {
        if (avvisi.mock.calls.some((c) => String(c[0]).includes('attende una risposta per prepararsi'))) break
        await new Promise((r) => setTimeout(r, 25))
      }
    } finally {
      avvisi.mockRestore()
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

  it('in difficolta cambia strada senza avvisare: non aspetta Nicholas e non è un errore che blocca (0.81.0)', async () => {
    server = ambiente({ esegui: () => Promise.resolve({ codice: 1, uscita: 'sempre uguale' }) })
    await avvia(server)
    const id = await creaAp()
    for (let i = 0; i < 4; i += 1) {
      await chiama('POST', `/hook/stop?ap=${id}`, eventoStop())
    }
    expect(avvisi).toEqual([])
    // Resta al lavoro con la strategia nuova: è il punto di tutto il meccanismo.
    const dopo = (await chiama('GET', '/autopiloti')).dati as { stato: string; strategia?: string }[]
    expect(dopo.at(0)?.stato).toBe('lavoro')
    expect(dopo.at(0)?.strategia).toBe(STRATEGIE[0].nome)
    for (let i = 0; i < 2; i += 1) {
      await chiama('POST', `/hook/stop?ap=${id}`, eventoStop())
    }
    expect(avvisi).toEqual([])
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

  it('senza git non chiede nessuna scomposizione: una chat sola', async () => {
    // Senza cartelle separate piu' chat si pesterebbero i file (0.36.0).
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

  it('il numero di chat lo decide l utilita: tre pezzi indipendenti, tre chat, ognuna nel suo worktree', async () => {
    // Decisione di Nicholas (30/09): nessun tetto scelto a mano; il tettoChat
    // passato alla creazione non conta piu', conta quanti pezzi sono utili.
    server = ambiente({ git: gitFinto, limiti: LIMITI_LIBERI, interroga: SCOMPONE })
    await avvia(server)
    const id = await creaAp({ tettoChat: 2 })
    await attendi(() => chatAvviate.length >= 3)

    expect(chatAvviate.map((c) => c.compito)).toEqual(['scrivi i test', 'aggiorna i documenti', 'sistema il lettore'])
    const stato = (await chiama('GET', '/autopiloti')).dati[0]
    expect(stato.chats).toHaveLength(3)
    expect(stato.chats.map((c: any) => c.ramo)).toEqual([`ap/${id.slice(0, 11)}/c-1`, `ap/${id.slice(0, 11)}/c-2`, `ap/${id.slice(0, 11)}/c-3`])
    expect(stato.ramoBase).toBe('main')
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
    server = ambiente({ git: gitFinto, limiti: LIMITI_LIBERI,
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

  // 29/10: le decisioni di routine sono senza sessione (prima ogni chat
  // riprendeva la sua, fino a 967k token a prompt): nessuna sessione da
  // rubarsi, nessun --resume, e la richiesta è segnata «routine».
  it('le decisioni di routine sono senza sessione: due fermate insieme non ne scrivono nessuna', async () => {
    let n = 0
    const viste: (string | undefined)[] = []
    const routine: (boolean | undefined)[] = []
    server = ambiente({ git: gitFinto, limiti: LIMITI_LIBERI,
      interroga: (prompt, _cwd, sessione, opzioni) => {
        if (prompt.includes('va diviso fra')) return SCOMPONE(prompt, _cwd, sessione)
        viste.push(sessione)
        routine.push(opzioni?.routine)
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
    expect(c1.sessioneSupervisore).toBeUndefined()
    expect(c2.sessioneSupervisore).toBeUndefined()
    expect(stato.sessioneSupervisore).toBeUndefined()
    expect(viste).toEqual([undefined, undefined])
    expect(routine).toEqual([true, true])
  })

  it('0.82.1: una chat che aspetta un’altra per più di un giro fa intervenire l’autopilota: sposta il lavoro, poi la chiude e il compito riparte dopo', async () => {
    server = ambiente({ git: gitFinto, limiti: LIMITI_LIBERI,
      interroga: (prompt) => Promise.resolve({ testo: prompt.includes('va diviso fra') ? '{"compiti": ["scrivi i test", "aggiorna i documenti"]}' : '{"azione": "prosegui", "istruzioni": "Continua il tuo compito."}' }),
      esegui: () => Promise.resolve({ codice: 1, uscita: 'ancora rosso' })
    })
    await avvia(server)
    const id = await creaAp({ tettoChat: 2 })
    await attendi(() => chatAvviate.length >= 2)
    const fermata = async (): Promise<any> => (await chiama('POST', `/hook/stop?ap=${id}&chat=c-2`, eventoStop({ session_id: 's-due', last_assistant_message: 'Resto in attesa di c-1: mi serve il suo lavoro.' }))).dati
    const chat2 = async (): Promise<any> => (await chiama('GET', '/autopiloti')).dati[0].chats.find((c: any) => c.id === 'c-2')

    // Un giro solo di attesa: niente ancora.
    const primo = await fermata()
    expect(primo.reason).not.toContain('Non aspettare')
    expect((await chat2()).aspetta).toEqual({ di: 'c-1', giri: 1 })
    // Il secondo: l'autopilota le dice di fare intanto il resto.
    const secondo = await fermata()
    expect(secondo.decision).toBe('block')
    expect(secondo.reason).toContain('Non aspettare la chat c-1')
    // Il terzo: la chiude, e il suo compito torna in coda dopo quello di c-1.
    const terzo = await fermata()
    expect(terzo).toEqual({})
    const stato = (await chiama('GET', '/autopiloti')).dati[0]
    expect(stato.chats.find((c: any) => c.id === 'c-2').stato).toBe('finita')
    // Il suo compito non conta come fatto (Revisione): cambia nome.
    expect(stato.chats.find((c: any) => c.id === 'c-2').compito).toContain('rimandato')
    const ripreso =stato.compitiDaFare.find((t: string) => t.includes('Ripreso dopo'))
    expect(ripreso).toContain('aggiorna i documenti')
    expect(stato.ruoliCompiti?.[ripreso]?.dopo).toEqual(['scrivi i test'])
    expect(stato.decisioni.some((d: any) => d.cosa.includes('c-2 aspetta c-1 da 3 giri: la chiudo'))).toBe(true)
  })

  it('0.82.1: se la chat attesa ha già finito, l’autopilota sblocca chi aspetta', async () => {
    server = ambiente({ git: gitFinto, limiti: LIMITI_LIBERI,
      interroga: (prompt) => Promise.resolve({ testo: prompt.includes('va diviso fra') ? '{"compiti": ["scrivi i test", "aggiorna i documenti"]}' : '{"azione": "prosegui", "istruzioni": "Continua il tuo compito."}' }),
      esegui: () => Promise.resolve({ codice: 1, uscita: 'ancora rosso' })
    })
    await avvia(server)
    const id = await creaAp({ tettoChat: 2 })
    await attendi(() => chatAvviate.length >= 2)
    const a = archivio.leggi(id)
    if (a === undefined) throw new Error('autopilota mancante')
    archivio.scrivi({ ...a, chats: a.chats.map((c) => (c.id === "c-1" ? { ...c, stato: "finita" as const } : c)) })
    const fermata = async (): Promise<any> => (await chiama('POST', `/hook/stop?ap=${id}&chat=c-2`, eventoStop({ session_id: 's-due', last_assistant_message: 'Aspetto che c-1 abbia finito.' }))).dati
    await fermata()
    const secondo = await fermata()
    expect(secondo.reason).toContain('Non c’è più niente da aspettare')
    expect(secondo.reason).toContain('git merge main')
  })

  it('a lavoro finito ferma tutte le chat della flotta; con i ruoli, finisce solo dopo l’ok della Revisione su ogni ramo (0.71.0)', async () => {
    server = ambiente({ git: gitFinto, limiti: LIMITI_LIBERI, interroga: SCOMPONE })
    await avvia(server)
    const id = await creaAp({ tettoChat: 2 })
    await attendi(() => chatAvviate.length >= 3)
    const autori = (await chiama('GET', '/autopiloti')).dati[0].chats.map((c: any) => c.id)

    await chiama('POST', `/hook/stop?ap=${id}&chat=c-1`, eventoStop({ last_assistant_message: 'Fatto.' }))
    let stato = (await chiama('GET', '/autopiloti')).dati[0]
    // Non è finito: le altre si fermano e ogni ramo va alla Revisione.
    expect(stato.stato).toBe('lavoro')
    expect(fermati).toEqual(expect.arrayContaining([`${id}::c-2`, `${id}::c-3`]))
    await attendi(() => chatAvviate.filter((c) => c.compito.startsWith('Rivedi il ramo')).length >= 3)
    stato = (await chiama('GET', '/autopiloti')).dati[0]
    const revisori = stato.chats.filter((c: any) => c.ruolo === 'revisione')
    expect(revisori.map((c: any) => c.revisioneDi).sort()).toEqual([...autori].sort())

    // Ogni revisore approva, citando un file: il ramo si unisce.
    for (const r of revisori) {
      await chiama('POST', `/hook/stop?ap=${id}&chat=${r.id}`, eventoStop({ last_assistant_message: `Letto il diff.\nREVISIONE: OK ${r.compito.split(' ')[3]} — src/lettore.ts:12 controllato` }))
    }
    stato = (await chiama('GET', '/autopiloti')).dati[0]
    expect(stato.chats.filter((c: any) => autori.includes(c.id)).every((c: any) => c.approvata === true)).toBe(true)
    // L'ultimo giro: una chat autrice riparte, il supervisore dice finito sui criteri.
    const ultima = stato.chats.find((c: any) => autori.includes(c.id) && c.stato === 'lavoro')
    expect(ultima).toBeDefined()
    await chiama('POST', `/hook/stop?ap=${id}&chat=${ultima.id}`, eventoStop({ last_assistant_message: 'fatto' }))
    stato = (await chiama('GET', '/autopiloti')).dati[0]
    expect(stato.stato).toBe('finito')
    expect(fermati).toContain(id)
    expect(stato.chats.every((c: any) => c.stato === 'finita')).toBe(true)
  })

  // 0.81.0, dalla prova nella copia (settimana al 72%): con il freno a «niente
  // nuove» la Revisione non partiva mai e il supervisore chiedeva a Nicholas di
  // chiuderla a mano. Adesso, con nessuna chat al lavoro, se ne apre una.
  it('con il freno a «niente nuove», un lavoro finito va comunque alla Revisione, una alla volta', async () => {
    server = ambiente({ git: gitFinto, limiti: LIMITI_LIBERI, interroga: SCOMPONE })
    await avvia(server)
    const id = await creaAp({ tettoChat: 2 })
    await attendi(() => chatAvviate.length >= 3)
    await chiama('POST', '/stato-programma', { letto: Date.now(), limiti: { cinqueOre: { percento: 8 }, settimana: { percento: 72 } } })
    await chiama('POST', `/hook/stop?ap=${id}&chat=c-1`, eventoStop({ last_assistant_message: 'Fatto.' }))
    await attendi(() => chatAvviate.some((c) => c.compito.startsWith('Rivedi il ramo')))
    await new Promise((r) => setTimeout(r, 100))
    expect(chatAvviate.filter((c) => c.compito.startsWith('Rivedi il ramo'))).toHaveLength(1)
  })

  it('una scomposizione illeggibile non impedisce di lavorare', async () => {
    server = ambiente({ git: gitFinto, limiti: LIMITI_LIBERI,
      interroga: (p) => Promise.resolve({ testo: p.includes('va diviso fra') ? 'non ho capito' : '{"azione": "finito"}' })
    })
    await avvia(server)
    await creaAp({ tettoChat: 3 })
    await attendi(() => avviati.length > 0)
    // Si ripiega sull'obiettivo intero: una chat sola, nella cartella del
    // progetto, che e' meglio di zero.
    expect(avviati).toHaveLength(1)
    expect(chatAvviate).toHaveLength(0)
  })

  it('riprendere riapre tutte le chat non finite', async () => {
    server = ambiente({ git: gitFinto, limiti: LIMITI_LIBERI, interroga: SCOMPONE })
    await avvia(server)
    const id = await creaAp({ tettoChat: 2 })
    await attendi(() => chatAvviate.length >= 3)
    await chiama('POST', `/autopiloti/${id}/ferma`)
    chatAvviate.length = 0

    await chiama('POST', `/autopiloti/${id}/riprendi`)

    expect(chatAvviate.map((c) => c.id).sort()).toEqual(['c-1', 'c-2', 'c-3'])
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
    server = ambiente({ git: gitFinto, limiti: LIMITI_LIBERI, interroga: CHIEDE_FLOTTA, scadenzaDomandaMs: 120 })
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
    server = ambiente({ git: gitFinto, limiti: LIMITI_LIBERI, interroga: CHIEDE_FLOTTA, scadenzaDomandaMs: 120 })
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
    server = ambiente({ git: gitFinto, limiti: LIMITI_LIBERI, interroga: CHIEDE_FLOTTA, scadenzaDomandaMs: 100 })
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
    server = ambiente({ git: gitFinto, limiti: LIMITI_LIBERI,
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
      interroga: () => Promise.resolve({ testo: '{"azione": "chiedi", "domanda": "Quale?"}' }),
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

  it('0.80.1: viene messa da parte e detta, senza sospendere l autopilota', async () => {
    // Il 19/10 sei autopiloti si sono fermati per «una chat non da segnali».
    // Ora si mette da parte solo la chat che tace, con una riga per Nicholas.
    ora = Date.parse('2026-08-09T10:00:00.000Z')
    server = ambiente({ silenzioMassimoMs: 30 * 60_000, adesso })
    await avvia(server)
    const id = await creaAp()

    // Mezz'ora di silenzio: nessun hook, nessun segnale.
    ora += 31 * 60_000
    server.controllaChatFerme()

    const stato = (await chiama('GET', '/autopiloti')).dati[0]
    expect(stato.stato).toBe('lavoro')
    expect(stato.motivoSospensione).toBeUndefined()
    expect(stato.decisioni.some((d: { traguardo?: { esito: string } }) => d.traguardo?.esito === 'da-parte')).toBe(true)
    expect(avvisi.some((v) => v.tipo === 'sospeso' && v.id === id)).toBe(false)
    // 0.84.1: messa da parte non vuol dire abbandonata. Nello stesso giro il
    // servizio la rimette al lavoro con l'ultima istruzione.
    expect(stato.daParte).toBeUndefined()
    expect(stato.ripresa?.volte).toBe(1)
    expect(stato.decisioni.some((d: { cosa: string }) => d.cosa.startsWith('giro da solo'))).toBe(true)
    expect(messaggiDiRipresa.some((m) => m.includes('Dimmi il punto'))).toBe(true)

    // Il giro dopo non la rimette da parte e non la riprende una seconda volta.
    const prima = stato.decisioni.length
    ora += 5 * 60_000
    server.controllaChatFerme()
    expect((await chiama('GET', '/autopiloti')).dati[0].decisioni.length).toBe(prima)

    // Appena chiude un turno torna nel conto e la ripresa si dimentica.
    await chiama('POST', `/hook/stop?ap=${id}`, eventoStop())
    const dopo = (await chiama('GET', '/autopiloti')).dati[0]
    expect(dopo.daParte).toBeUndefined()
    expect(dopo.ripresa).toBeUndefined()
  })

  it('0.81.0: dopo 5 minuti di silenzio una riga per Nicholas, una volta sola finché non riparla', async () => {
    ora = Date.parse('2026-08-09T10:00:00.000Z')
    server = ambiente({ silenzioMassimoMs: 30 * 60_000, adesso })
    await avvia(server)
    const id = await creaAp()
    const mute = async (): Promise<number> =>
      (await chiama('GET', '/autopiloti')).dati[0].decisioni.filter((d: { traguardo?: { esito: string } }) => d.traguardo?.esito === 'muta').length

    ora += 4 * 60_000
    server.controllaChatFerme()
    expect(await mute()).toBe(0)
    ora += 2 * 60_000
    server.controllaChatFerme()
    expect(await mute()).toBe(1)
    // Il giro dopo non la ripete.
    ora += 2 * 60_000
    server.controllaChatFerme()
    expect(await mute()).toBe(1)
    // Riparla (un battito dal Gestore), poi tace di nuovo: si ridice.
    await chiama('POST', '/battiti', { segni: [{ autopilota: id }] })
    ora += 6 * 60_000
    server.controllaChatFerme()
    expect(await mute()).toBe(2)
    expect((await chiama('GET', '/autopiloti')).dati[0].stato).toBe('lavoro')
  })

  it('0.81.0: la riga del silenzio resta anche quando nello stesso giro la chat va da parte', async () => {
    ora = Date.parse('2026-08-09T10:00:00.000Z')
    server = ambiente({ silenzioMassimoMs: 10 * 60_000, adesso })
    await avvia(server)
    await creaAp()
    ora += 6 * 60_000
    server.controllaChatFerme()
    ora += 5 * 60_000
    server.controllaChatFerme()
    const esiti = (await chiama('GET', '/autopiloti')).dati[0].decisioni.map((d: { traguardo?: { esito: string } }) => d.traguardo?.esito).filter(Boolean)
    // 0.84.3 (il Punto): nello stesso giro la chat ferma si riprende, con la sua riga.
    expect(esiti).toEqual(['muta', 'da-parte', 'ferma'])
  })

  it('0.81.0: una consegna che nessuna finestra ritira è detta una volta («mai partita»)', async () => {
    ora = Date.parse('2026-08-09T10:00:00.000Z')
    server = ambiente({ adesso })
    await avvia(server)
    const id = await creaAp()
    const inVolo = (consegna: string): void => {
      const a = archivio.leggi(id)!
      archivio.scrivi({ ...a, inVolo: [{ consegna, quando: adesso(), messaggi: [{ id: `m-${consegna}`, quando: adesso(), testo: 'fai X', chats: [id] }] }] })
    }
    // Appena creato l'autopilota è «in lavorazione»: la rimessa in coda aspetta che finisca.
    const arrivate = async (n: number): Promise<any[]> => {
      for (let i = 0; i < 300; i += 1) {
        const d = (await chiama('GET', '/autopiloti')).dati[0].decisioni
        if (d.filter((x: { cosa: string }) => x.cosa.includes('non è arrivata nella chat')).length >= n) return d
        await new Promise((r) => setTimeout(r, 50))
      }
      return (await chiama('GET', '/autopiloti')).dati[0].decisioni
    }
    inVolo('c-91')
    server.riportaInCoda('c-91', 'nessuna finestra l ha ritirata')
    await arrivate(1)
    inVolo('c-92')
    server.riportaInCoda('c-92', 'nessuna finestra l ha ritirata')
    const decisioni = await arrivate(2)
    expect(decisioni.filter((d: { traguardo?: { esito: string } }) => d.traguardo?.esito === 'mai-partita')).toHaveLength(1)
    expect(decisioni.filter((d: { cosa: string }) => d.cosa.includes('non è arrivata nella chat'))).toHaveLength(2)
  })

  it('la Revisione: dopo un riavvio, senza segnali in memoria, nessuna riga «muta» (non torna ogni 5 minuti)', async () => {
    ora = Date.parse('2026-08-09T10:00:00.000Z')
    const cartella = mkdtempSync(join(tmpdir(), 'ap-riavvio-muta-'))
    server = ambiente({ silenzioMassimoMs: 60 * 60_000, adesso, cartellaArchivio: cartella })
    await avvia(server)
    await creaAp()
    await new Promise<void>((r) => { server.close(() => { r() }) })
    // Il servizio riparte: la memoria dei segnali è vuota.
    server = ambiente({ silenzioMassimoMs: 60 * 60_000, adesso, cartellaArchivio: cartella })
    await avvia(server)
    for (let i = 0; i < 4; i += 1) {
      ora += 6 * 60_000
      server.controllaChatFerme()
    }
    // 0.84.1: a 12 minuti dal riavvio il giro da solo la riprende; da lì in
    // poi il suo silenzio è vero (le si è appena scritto) e può essere detto.
    // Prima della ripresa, nessuna riga «muta» dal ripiego del riavvio.
    const decisioni = (await chiama('GET', '/autopiloti')).dati[0].decisioni as Array<{ cosa: string; traguardo?: { esito: string } }>
    const giro = decisioni.findIndex((d) => d.cosa.startsWith('giro da solo'))
    expect(giro).toBeGreaterThanOrEqual(0)
    expect(decisioni.slice(0, giro).filter((d) => d.traguardo?.esito === 'muta')).toHaveLength(0)
    expect(decisioni.filter((d) => d.traguardo?.esito === 'muta').length).toBeLessThanOrEqual(1)
  })

  it('la Revisione: chi aspetta una risposta di Nicholas non è detto «muto»', async () => {
    ora = Date.parse('2026-08-09T10:00:00.000Z')
    const domande = creaRegistroDomande({ adesso: () => ora })
    server = ambiente({ silenzioMassimoMs: 60 * 60_000, adesso, domande })
    await avvia(server)
    const id = await creaAp()
    domande.apri({ autopilotaId: id, testo: 'Quale versione pubblico?', scadenzaMs: 60 * 60_000 })
    ora += 6 * 60_000
    server.controllaChatFerme()
    const esiti = (await chiama('GET', '/autopiloti')).dati[0].decisioni.map((d: { traguardo?: { esito: string } }) => d.traguardo?.esito)
    expect(esiti).not.toContain('muta')
  })

  it('la Revisione: una consegna sostituita da una più nuova non è «mai partita»', async () => {
    ora = Date.parse('2026-08-09T10:00:00.000Z')
    server = ambiente({ adesso })
    await avvia(server)
    const id = await creaAp()
    const a = archivio.leggi(id)!
    archivio.scrivi({ ...a, inVolo: [{ consegna: 'c-93', quando: adesso(), messaggi: [{ id: 'm-93', quando: adesso(), testo: 'fai X', chats: [id] }] }] })
    server.riportaInCoda('c-93', 'sostituita dalla c-94 prima di essere ritirata')
    let decisioni: any[] = []
    for (let i = 0; i < 300; i += 1) {
      decisioni = (await chiama('GET', '/autopiloti')).dati[0].decisioni
      if (decisioni.some((d: { cosa: string }) => d.cosa.includes('non è arrivata nella chat'))) break
      await new Promise((r) => setTimeout(r, 50))
    }
    expect(decisioni.some((d: { cosa: string }) => d.cosa.includes('non è arrivata nella chat'))).toBe(true)
    expect(decisioni.some((d: { traguardo?: { esito: string } }) => d.traguardo?.esito === 'mai-partita')).toBe(false)
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
    // Ma venticinque minuti senza battito sono silenzio vero: il Gestore lo
    // manda ogni minuto mentre lavora. Dalla 0.84.1 il giro da solo la
    // riprende (dopo 10 minuti), invece di aspettare l'ora della messa da parte.
    const dopo = (await chiama('GET', '/autopiloti')).dati[0]
    expect(dopo.daParte).toBeUndefined()
    expect(dopo.ripresa?.volte).toBe(1)
    ora += 7 * 60_000
    server.controllaChatFerme()
    expect((await chiama('GET', '/autopiloti')).dati[0].stato).toBe('lavoro')
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

  it('rifiuta un comando che non può funzionare, con il motivo (0.44.0, la trappola del 01/10)', async () => {
    const id = await creaAp()
    const sbagliato = `bash -c "v=$(node -p \\"require('./package.json').version\\") && echo $v | grep -qE '^0\\.37\\.[0-9]+$'"`
    const r = await chiama('PATCH', `/autopiloti/${id}`, { criteri: [{ descrizione: 'la versione', comando: sbagliato }] })
    expect(r.stato).toBe(400)
    expect(String(r.dati.errore)).toContain('la trappola del 01/10')
    // Il criterio di prima resta.
    expect((await chiama('GET', '/autopiloti')).dati[0].criteri[0].comando).not.toBe(sbagliato)
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
        comando === 'node controlla.js'
          ? (passa ? { codice: 0, uscita: 'ok' } : { codice: 1, uscita: '2 rossi' })
          : { codice: 1, uscita: 'lint sporco' }
      )
    })
    await avvia(server)
    const id = await creaAp({
      criteri: [
        // Un comando leggero: i pesanti (npm test, gradle) si rimisurano a turni alterni (0.71.0).
        { descrizione: 'i test passano', comando: 'node controlla.js' },
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

describe('l harness (0.36.0): freno, divieti, mosse, domande gemelle, pubblicazione', () => {
  const SCOMPONE: Interrogazione = (prompt) =>
    Promise.resolve({
      testo: prompt.includes('va diviso fra')
        ? '{"compiti": ["scrivi i test", "aggiorna i documenti"]}'
        : '{"azione": "prosegui", "istruzioni": "avanti", "perche": "manca"}'
    })

  async function attendi(condizione: () => boolean): Promise<void> {
    for (let i = 0; i < 80 && !condizione(); i += 1) {
      await new Promise((r) => setTimeout(r, 25))
    }
  }

  async function domandeAperte(): Promise<any[]> {
    for (let i = 0; i < 80; i += 1) {
      const aperte = (await chiama('GET', '/domande')).dati
      if (aperte.length > 0) return aperte
      await new Promise((r) => setTimeout(r, 25))
    }
    return []
  }

  it('il freno: con la finestra di 5 ore all 85% una chat della flotta va in pausa a fine turno', async () => {
    server = ambiente({ git: gitFinto, limiti: LIMITI_LIBERI, interroga: SCOMPONE, esegui: () => Promise.resolve({ codice: 1, uscita: 'rosso' }) })
    await avvia(server)
    const id = await creaAp()
    await attendi(() => chatAvviate.length >= 2)
    // Il piano si riempie: il Gestore lo dice, e il freno scende a una chat.
    await chiama('POST', '/stato-programma', { letto: Date.now(), limiti: { cinqueOre: { percento: 85 } } })
    const primo = await chiama('POST', `/hook/stop?ap=${id}&chat=c-1`, eventoStop({ session_id: 's-1' }))
    const secondo = await chiama('POST', `/hook/stop?ap=${id}&chat=c-2`, eventoStop({ session_id: 's-2' }))
    const stato = (await chiama('GET', '/autopiloti')).dati[0]
    expect(stato.chats.filter((c: any) => c.stato === 'pausa')).toHaveLength(1)
    // Chi va in pausa si ferma (risposta vuota), l'altra continua.
    expect([primo.dati, secondo.dati].filter((d) => d.decision === 'block')).toHaveLength(1)
    expect(stato.decisioni.map((d: any) => d.cosa).join(' ')).toContain('in pausa')
  })

  it('il freno oltre il 95% ferma tutto e dice quando riparte', async () => {
    server = ambiente({ limiti: { cinqueOre: { percento: 97, resettaIl: Date.parse('2026-08-09T12:00:00Z') } } })
    await avvia(server)
    await creaAp()
    for (let i = 0; i < 100 && (await chiama('GET', '/autopiloti')).dati[0]?.stato !== 'sospeso'; i += 1) await new Promise((r) => setTimeout(r, 20))
    const stato = (await chiama('GET', '/autopiloti')).dati[0]
    expect(stato.stato).toBe('sospeso')
    expect(stato.motivoSospensione).toContain('97%')
    expect(stato.pausaLimitiFinoA).toBe('2026-08-09T12:00:00.000Z')
    expect(avviati).toHaveLength(0)
    // 0.81.0: riparte da solo, quindi nessuna notifica (Telegram) per questo fermo.
    expect(avvisi.some((a) => a.tipo === 'sospeso')).toBe(false)
  })

  it('0.81.0: se la ripartenza dopo la pausa per i limiti fallisce, l avviso parte', async () => {
    server = ambiente({ limiti: { cinqueOre: { percento: 97, resettaIl: Date.parse('2026-08-09T12:00:00Z') } }, avvioFallisce: true })
    await avvia(server)
    await creaAp()
    for (let i = 0; i < 100 && (await chiama('GET', '/autopiloti')).dati[0]?.stato !== 'sospeso'; i += 1) await new Promise((r) => setTimeout(r, 20))
    expect(avvisi.some((a) => a.tipo === 'sospeso')).toBe(false)
    // Il piano si libera: il freno lo fa ripartire, ma la chat non parte.
    await chiama('POST', '/stato-programma', { letto: Date.now(), limiti: LIMITI_LIBERI })
    server.controllaChatFerme()
    await attendi(() => avvisi.some((a) => a.tipo === 'sospeso'))
    expect(avvisi.filter((a) => a.tipo === 'sospeso')).toHaveLength(1)
  })

  it('i divieti: il programma nega alla chat una cancellazione fuori dalle sue cartelle', async () => {
    server = ambiente()
    await avvia(server)
    const id = await creaAp()
    const no = await chiama('POST', `/hook/pretool?ap=${id}`, { tool_name: 'Bash', tool_input: { command: 'rm -rf C:/Windows/Temp/x' }, cwd: process.cwd() })
    expect(no.dati.hookSpecificOutput.permissionDecision).toBe('deny')
    const si = await chiama('POST', `/hook/pretool?ap=${id}`, { tool_name: 'Bash', tool_input: { command: 'rm -rf dist' }, cwd: process.cwd() })
    expect(si.dati).toEqual({})
    const porta = await chiama('POST', `/hook/pretool?ap=${id}`, { tool_name: 'Bash', tool_input: { command: 'curl -X POST http://127.0.0.1:47640/api/drive/porta' }, cwd: process.cwd() })
    expect(porta.dati.hookSpecificOutput.permissionDecision).toBe('deny')
    const stato = (await chiama('GET', '/autopiloti')).dati[0]
    expect(stato.decisioni.map((d: any) => d.cosa).join(' ')).toContain('comando bloccato dal programma')
  })

  it('le mosse del supervisore: apre una chat utile, rifiuta Porta qui e le chat altrui', async () => {
    let giro = 0
    const visti: string[] = []
    server = ambiente({
      git: gitFinto, limiti: LIMITI_LIBERI,
      interroga: (prompt) => {
        if (prompt.includes('va diviso fra')) return Promise.resolve({ testo: '{"compiti": ["a", "b"]}' })
        giro += 1
        visti.push(prompt)
        return Promise.resolve({
          testo: giro === 1
            ? '{"azione": "prosegui", "istruzioni": "avanti", "mosse": [{"tipo": "apriChat", "compito": "le API"}, {"tipo": "portaQui"}, {"tipo": "chiudiChat", "chat": "c-99"}]}'
            : '{"azione": "prosegui", "istruzioni": "avanti"}'
        })
      },
      esegui: () => Promise.resolve({ codice: 1, uscita: 'rosso' })
    })
    await avvia(server)
    const id = await creaAp()
    await attendi(() => chatAvviate.length >= 2)
    await chiama('POST', `/hook/stop?ap=${id}&chat=c-1`, eventoStop())
    await attendi(() => chatAvviate.length >= 3)
    // T1: il supervisore vede lo stato del programma e le mosse permesse.
    expect(visti[0]).toContain('Stato del programma')
    expect(visti[0]).toContain('Mosse sul programma')
    const stato = (await chiama('GET', '/autopiloti')).dati[0]
    expect(chatAvviate.map((c) => c.compito)).toContain('le API')
    const diario = stato.decisioni.map((d: any) => d.cosa).join(' | ')
    expect(diario).toContain('mossa rifiutata dal programma (portaQui)')
    expect(diario).toContain('mossa rifiutata dal programma (chiudiChat)')
  })

  // 0.84.0: controllo e coordinazione. Ogni chat dice come sta, l'autopilota
  // vede tutto in un punto e nessun compito va a due chat.
  it('i segnali delle chat: partita al primo hook, bloccata con il motivo a fine turno, tutto nel quadro del supervisore (0.84.0)', async () => {
    const visti: string[] = []
    server = ambiente({
      git: gitFinto, limiti: LIMITI_LIBERI,
      interroga: (prompt) => {
        if (prompt.includes('va diviso fra')) return Promise.resolve({ testo: '{"compiti": ["scrivi i test", "aggiorna i documenti"]}' })
        visti.push(prompt)
        return Promise.resolve({ testo: '{"azione": "prosegui", "istruzioni": "avanti"}' })
      },
      esegui: () => Promise.resolve({ codice: 1, uscita: 'rosso' })
    })
    await avvia(server)
    const id = await creaAp()
    await attendi(() => chatAvviate.length >= 2)
    // Il primo hook della c-2 (un comando) è la prova che è partita.
    await chiama('POST', `/hook/pretool?ap=${id}&chat=c-2`, { tool_name: 'Bash', tool_input: { command: 'git status' }, cwd: process.cwd() })
    let stato = (await chiama('GET', '/autopiloti')).dati[0]
    expect(stato.chats.find((c: any) => c.id === 'c-2').segnale).toMatchObject({ tipo: 'parto' })
    // La c-1 chiude il turno bloccata, con il motivo.
    await chiama('POST', `/hook/stop?ap=${id}&chat=c-1`, eventoStop({ last_assistant_message: 'Ho provato a far partire i test.\n\nSEGNALE: bloccata — manca la chiave del servizio di prova' }))
    stato = (await chiama('GET', '/autopiloti')).dati[0]
    expect(stato.chats.find((c: any) => c.id === 'c-1').segnale).toMatchObject({ tipo: 'bloccata', motivo: 'manca la chiave del servizio di prova', dichiarato: true })
    expect(stato.decisioni.map((d: any) => d.cosa)).toContain('segnale da c-1: bloccata: manca la chiave del servizio di prova')
    // 0.84.3 (il Punto): «si blocca» è anche una riga per Nicholas nella conversazione.
    expect(stato.decisioni.find((d: any) => String(d.cosa).startsWith('segnale da c-1')).traguardo).toEqual({ chat: 'c-1', esito: 'bloccata', nota: 'manca la chiave del servizio di prova' })
    // Il supervisore vede tutte le chat, con i loro segnali, in un punto solo.
    const quadro = visti[visti.length - 1] ?? ''
    expect(quadro).toContain('Le tue chat, in un punto solo')
    expect(quadro).toContain('c-1 (questa)')
    expect(quadro).toContain('bloccata: manca la chiave del servizio di prova')
    expect(quadro).toMatch(/c-2[^\n]*partita/)
    // Lo stesso segnale al giro dopo non si riscrive nelle decisioni.
    await chiama('POST', `/hook/stop?ap=${id}&chat=c-1`, eventoStop({ last_assistant_message: 'SEGNALE: bloccata — manca la chiave del servizio di prova' }))
    stato = (await chiama('GET', '/autopiloti')).dati[0]
    expect(stato.decisioni.filter((d: any) => String(d.cosa).startsWith('segnale da c-1')).length).toBe(1)
  })

  it('lo stesso compito non va mai a due chat: apriChat su un compito già dato si rifiuta (0.84.0)', async () => {
    let giro = 0
    server = ambiente({
      git: gitFinto, limiti: LIMITI_LIBERI,
      interroga: (prompt) => {
        if (prompt.includes('va diviso fra')) return Promise.resolve({ testo: '{"compiti": ["scrivi i test", "aggiorna i documenti"]}' })
        giro += 1
        return Promise.resolve({
          testo: giro === 1
            ? '{"azione": "prosegui", "istruzioni": "avanti", "mosse": [{"tipo": "apriChat", "compito": "Scrivi i test."}, {"tipo": "apriChat", "compito": "le API"}, {"tipo": "apriChat", "compito": "le API"}]}'
            : '{"azione": "prosegui", "istruzioni": "avanti"}'
        })
      },
      esegui: () => Promise.resolve({ codice: 1, uscita: 'rosso' })
    })
    await avvia(server)
    const id = await creaAp()
    await attendi(() => chatAvviate.length >= 2)
    await chiama('POST', `/hook/stop?ap=${id}&chat=c-1`, eventoStop())
    await attendi(() => chatAvviate.length >= 3)
    await new Promise((r) => setTimeout(r, 100))
    expect(chatAvviate.map((c) => c.compito).sort()).toEqual(['aggiorna i documenti', 'le API', 'scrivi i test'])
    const diario = (await chiama('GET', '/autopiloti')).dati[0].decisioni.map((d: any) => d.cosa).join(' | ')
    expect(diario).toContain('ce l\'ha già la chat c-1')
    expect(diario).toContain('è già in coda')
  })

  it('prima di aprire una chat si controlla: un compito già dato esce dalla coda (0.84.0)', async () => {
    let giro = 0
    server = ambiente({ git: gitFinto, limiti: LIMITI_LIBERI,
      interroga: (prompt) => {
        if (prompt.includes('va diviso fra')) return Promise.resolve({ testo: '{"compiti": ["scrivi i test", "aggiorna i documenti"]}' })
        giro += 1
        return Promise.resolve({ testo: giro === 1 ? '{"azione": "prosegui", "istruzioni": "avanti", "mosse": [{"tipo": "apriChat", "compito": "il manuale"}]}' : '{"azione": "prosegui", "istruzioni": "avanti"}' })
      },
      esegui: () => Promise.resolve({ codice: 1, uscita: 'rosso' })
    })
    await avvia(server)
    const id = await creaAp()
    await attendi(() => chatAvviate.length >= 2)
    // Il compito della c-1 rimesso in coda da fuori (come una consegna doppia).
    const a = archivio.leggi(id)
    if (a === undefined) throw new Error('autopilota mancante')
    archivio.scrivi({ ...a, compitiDaFare: ['scrivi i test'] })
    await chiama('POST', `/hook/stop?ap=${id}&chat=c-2`, eventoStop({ session_id: 's-due' }))
    await attendi(() => chatAvviate.length >= 3)
    await new Promise((r) => setTimeout(r, 100))
    expect(chatAvviate.filter((c) => c.compito === 'scrivi i test')).toHaveLength(1)
    expect(chatAvviate.map((c) => c.compito)).toContain('il manuale')
    const dopo = (await chiama('GET', '/autopiloti')).dati[0]
    // E la chat aperta resta nell'elenco: il salvataggio del turno non la cancella.
    expect(dopo.chats.map((c: any) => c.compito)).toContain('il manuale')
    expect(dopo.compitiDaFare).not.toContain('il manuale')
    expect(dopo.compitiDaFare).not.toContain('scrivi i test')
    expect(dopo.decisioni.map((d: any) => d.cosa).join(' | ')).toContain('ce l\'ha già la chat c-1')
  })

  it('agente finito (0.84.0): chiudiChat su una chat sorella col ramo già tolto la segna conclusa', async () => {
    let giro = 0
    // Il ramo principale c'è, quello della chat no: unito e tolto.
    const gitRamoTolto: Git = (args, cwd) => (args.join(' ') === 'rev-parse --verify --quiet refs/heads/main' ? { codice: 0, uscita: 'abc' } : args[0] === 'rev-parse' && args[1] === '--verify' ? { codice: 1, uscita: '' } : gitFinto(args, cwd))
    server = ambiente({
      git: gitRamoTolto, limiti: LIMITI_LIBERI,
      interroga: (prompt) => {
        if (prompt.includes('va diviso fra')) return Promise.resolve({ testo: '{"compiti": ["a", "b"]}' })
        giro += 1
        return Promise.resolve({
          testo: giro === 1
            ? '{"azione": "prosegui", "istruzioni": "avanti", "mosse": [{"tipo": "chiudiChat", "chat": "c-2"}]}'
            : '{"azione": "prosegui", "istruzioni": "avanti"}'
        })
      },
      esegui: () => Promise.resolve({ codice: 1, uscita: 'rosso' })
    })
    await avvia(server)
    const id = await creaAp()
    await attendi(() => chatAvviate.length >= 2)
    await chiama('POST', `/hook/stop?ap=${id}&chat=c-1`, eventoStop())
    await attendi(() => archivio.leggi(id)?.chats.find((c) => c.id === 'c-2')?.stato === 'finita')
    const c2 = archivio.leggi(id)!.chats.find((c) => c.id === 'c-2')!
    expect(c2.stato).toBe('finita')
    expect(c2.conclusa).toEqual({ il: '2026-08-09T10:05:00.000Z', come: 'tolto' })
    // La chat che lavora non è toccata.
    expect(archivio.leggi(id)!.chats.find((c) => c.id === 'c-1')!.conclusa).toBeUndefined()
  })

  it('le domande gemelle di due chat sorelle arrivano una volta sola, e la risposta sblocca tutte e due', async () => {
    server = ambiente({
      git: gitFinto, limiti: LIMITI_LIBERI,
      interroga: (prompt) => Promise.resolve({
        testo: prompt.includes('va diviso fra')
          ? '{"compiti": ["a", "b"]}'
          : '{"azione": "chiedi", "domanda": "Quale chiave API devo usare per il servizio meteo?"}'
      }),
      esegui: () => Promise.resolve({ codice: 1, uscita: 'rosso' })
    })
    await avvia(server)
    const id = await creaAp()
    await attendi(() => chatAvviate.length >= 2)
    const uno = chiama('POST', `/hook/stop?ap=${id}&chat=c-1`, eventoStop())
    await attendi(() => avvisi.some((a) => a.tipo === 'domanda'))
    const due = chiama('POST', `/hook/stop?ap=${id}&chat=c-2`, eventoStop())
    await new Promise((r) => setTimeout(r, 300))
    const aperte = (await chiama('GET', '/domande')).dati
    expect(aperte).toHaveLength(1)
    expect(avvisi.filter((a) => a.tipo === 'domanda')).toHaveLength(1)
    await chiama('POST', `/domande/${aperte[0].id}/risposta`, { risposta: 'la chiave A' })
    const [r1, r2] = await Promise.all([uno, due])
    expect(r1.dati.decision).toBe('block')
    expect(r2.dati.decision).toBe('block')
  })

  it('pubblicazione beta con il cloud: a lavoro finito la chat riceve l istruzione di pubblicare, al giro dopo finisce', async () => {
    server = ambiente()
    await avvia(server)
    const id = await creaAp({ pubblicazione: 'beta', vaSulCloud: true })
    const primo = await chiama('POST', `/hook/stop?ap=${id}`, eventoStop())
    expect(primo.dati.decision).toBe('block')
    expect(primo.dati.reason).toContain('pubblica')
    const secondo = await chiama('POST', `/hook/stop?ap=${id}`, eventoStop())
    expect(secondo.dati).toEqual({})
    expect((await chiama('GET', '/autopiloti')).dati[0].stato).toBe('finito')
  })

  it('pubblicazione stabile: chiede prima, e con un «no» finisce senza pubblicare', async () => {
    server = ambiente()
    await avvia(server)
    const id = await creaAp({ pubblicazione: 'stabile', vaSulCloud: true })
    const fermata = chiama('POST', `/hook/stop?ap=${id}`, eventoStop())
    const aperte = await domandeAperte()
    expect(aperte[0].testo).toContain('Pubblico adesso?')
    await chiama('POST', `/domande/${aperte[0].id}/risposta`, { risposta: 'no, aspetta' })
    expect((await fermata).dati).toEqual({})
    const stato = (await chiama('GET', '/autopiloti')).dati[0]
    expect(stato.stato).toBe('finito')
    expect(stato.decisioni.map((d: any) => d.cosa).join(' ')).toContain('non pubblico')
  })

  it('pubblicazione stabile: con un «sì» la chat riceve l istruzione di pubblicare', async () => {
    server = ambiente()
    await avvia(server)
    const id = await creaAp({ pubblicazione: 'stabile', vaSulCloud: true })
    const fermata = chiama('POST', `/hook/stop?ap=${id}`, eventoStop())
    const aperte = await domandeAperte()
    await chiama('POST', `/domande/${aperte[0].id}/risposta`, { risposta: 'sì, vai' })
    const r = (await fermata).dati
    expect(r.decision).toBe('block')
    expect(r.reason).toContain('pubblica')
  })

  it('senza cloud non si pubblica e non si chiede niente', async () => {
    server = ambiente()
    await avvia(server)
    const id = await creaAp({ pubblicazione: 'beta' })
    expect((await chiama('POST', `/hook/stop?ap=${id}`, eventoStop())).dati).toEqual({})
    expect((await chiama('GET', '/autopiloti')).dati[0].stato).toBe('finito')
  })
})

describe('il cloud e il Drive di SierraDeck (correzione di Nicholas, 30/09)', () => {
  /** Un git con un remoto origin: serve solo a sapere dove fare il push. */
  const gitConRemoto: Git = (args, cwd) => {
    if (args.join(' ') === 'remote -v') return { codice: 0, uscita: 'origin https://github.com/x/y.git (push)' }
    return gitFinto(args, cwd)
  }

  it('con le chat del progetto sul Drive, beta pubblica senza bisogno della spunta', async () => {
    server = ambiente()
    await avvia(server)
    await chiama('POST', '/stato-programma', {
      letto: Date.now(), driveAttivo: true,
      progetti: [{ nome: 'questo', chi: 'io', inCoda: 0, percorso: process.cwd() }]
    })
    const id = await creaAp({ pubblicazione: 'beta' })
    const primo = await chiama('POST', `/hook/stop?ap=${id}`, eventoStop())
    expect(primo.dati.decision).toBe('block')
    expect(primo.dati.reason).toContain('pubblica')
    const stato = (await chiama('GET', '/autopiloti')).dati[0]
    expect(stato.cloud.segni).toEqual(['sincronizzazione Drive del progetto accesa'])
  })

  it('con la sincronizzazione spenta, o il progetto non sul Drive, niente autonomia', async () => {
    server = ambiente()
    await avvia(server)
    await chiama('POST', '/stato-programma', {
      letto: Date.now(), driveAttivo: false,
      progetti: [{ nome: 'questo', chi: 'io', inCoda: 0, percorso: process.cwd() }]
    })
    const id = await creaAp({ pubblicazione: 'beta' })
    expect((await chiama('POST', `/hook/stop?ap=${id}`, eventoStop())).dati).toEqual({})
    expect((await chiama('GET', '/autopiloti')).dati[0].stato).toBe('finito')
  })

  it('un remoto git e uno script da soli non danno autonomia: servono solo per il push', async () => {
    server = ambiente({ git: gitConRemoto })
    await avvia(server)
    const id = await creaAp({ pubblicazione: 'beta' })
    for (let i = 0; i < 40 && (await chiama('GET', '/autopiloti')).dati[0].consegna === undefined; i += 1) {
      await new Promise((r) => setTimeout(r, 25))
    }
    const prima = (await chiama('GET', '/autopiloti')).dati[0]
    expect(prima.consegna.remoto).toBe('origin')
    expect(prima.cloud.attivo).toBe(false)
    expect((await chiama('POST', `/hook/stop?ap=${id}`, eventoStop())).dati).toEqual({})
    expect((await chiama('GET', '/autopiloti')).dati[0].stato).toBe('finito')
  })

  it('in autonomia il supervisore sa che non deve fare domande', async () => {
    const visti: string[] = []
    server = ambiente({
      interroga: (p) => { visti.push(p); return Promise.resolve({ testo: '{"azione": "prosegui", "istruzioni": "avanti"}' }) },
      esegui: () => Promise.resolve({ codice: 1, uscita: 'rosso' })
    })
    await avvia(server)
    const id = await creaAp({ vaSulCloud: true })
    await chiama('POST', `/hook/stop?ap=${id}`, eventoStop())
    expect(visti.some((p) => p.includes('Autonomia completa'))).toBe(true)
  })
})

describe('le domande iniziali dell autopilota, dalle Domande (0.36.0)', () => {
  async function attendi(condizione: () => Promise<boolean>): Promise<void> {
    for (let i = 0; i < 80; i += 1) {
      if (await condizione()) return
      await new Promise((r) => setTimeout(r, 25))
    }
  }
  const pronto = '{"pronto": true, "nome": "Lettore", "criteri": [{"descrizione": "i test passano", "comando": "npm test"}]}'

  it('la domanda della preparazione porta le sue opzioni, e una risposta data dalle Domande la fa ripartire', async () => {
    let giro = 0
    server = ambiente({
      interroga: (prompt) => {
        if (!prompt.includes('Stai preparando un autopilota')) return Promise.resolve({ testo: '{"azione": "finito"}' })
        giro += 1
        return Promise.resolve({ testo: giro === 1 ? '{"domanda": "Che formato?", "opzioni": ["YAML", "JSON"]}' : pronto })
      },
      scadenzaInterviataMs: 5000
    })
    await avvia(server)
    await chiama('POST', '/autopiloti', { obiettivo: 'Sistema il lettore', cwd: process.cwd(), criteri: [] })
    await attendi(async () => (await chiama('GET', '/domande')).dati.length > 0)
    const domanda = (await chiama('GET', '/domande')).dati[0]
    expect(domanda.opzioni).toEqual(['YAML', 'JSON'])
    // E' la strada di /api/rispondi dal telefono e dal PC: il registro del servizio.
    await chiama('POST', `/domande/${domanda.id}/risposta`, { risposta: 'YAML' })
    await attendi(async () => (await chiama('GET', '/autopiloti')).dati[0].stato === 'pronto')
    const stato = (await chiama('GET', '/autopiloti')).dati[0]
    expect(stato.stato).toBe('pronto')
    expect(stato.intervista[0]).toMatchObject({ domanda: 'Che formato?', risposta: 'YAML' })
  })

  it('dopo un riavvio del servizio la domanda rimasta scritta torna nelle Domande, e la risposta fa ripartire la preparazione', async () => {
    // Il difetto del 30/09: la domanda si vedeva nella chat con lui ma non
    // era piu' nel registro (vive in memoria), quindi non si poteva rispondere.
    server = ambiente({
      interroga: (prompt) => Promise.resolve({ testo: prompt.includes('Stai preparando un autopilota') ? pronto : '{"azione": "finito"}' }),
      scadenzaInterviataMs: 5000
    })
    const a = {
      ...nuovoAutopilota({ id: 'ap-prep', nome: 'Prep', obiettivo: 'Sistema il lettore', cwd: process.cwd(), criteri: [], iniziatoIl: '2026-08-09T10:00:00.000Z', stato: 'intervista' }),
      motivoSospensione: 'Che formato deve leggere?',
      riprendiAlRiavvio: false
    }
    archivio.scrivi(a)
    await avvia(server)
    server.riprendiInterviste()
    const aperte = (await chiama('GET', '/domande')).dati
    expect(aperte).toHaveLength(1)
    expect(aperte[0]).toMatchObject({ autopilotaId: 'ap-prep', testo: 'Che formato deve leggere?' })
    await chiama('POST', `/domande/${aperte[0].id}/risposta`, { risposta: 'JSON' })
    await attendi(async () => (await chiama('GET', '/autopiloti')).dati[0].stato === 'pronto')
    const stato = (await chiama('GET', '/autopiloti')).dati[0]
    expect(stato.stato).toBe('pronto')
    expect(stato.intervista[0]).toMatchObject({ domanda: 'Che formato deve leggere?', risposta: 'JSON' })
    // Una seconda ripresa non la riapre due volte.
    server.riprendiInterviste()
    expect((await chiama('GET', '/domande')).dati).toHaveLength(0)
  })

  it('collaudo 0.84.0: dopo un riavvio la domanda a parti torna con le sue parti e passa dal controllo', async () => {
    server = ambiente({ interroga: () => Promise.resolve({ testo: '{"azione": "finito"}' }), scadenzaInterviataMs: 5000 })
    const testo = [
      '«Prep» ti chiede:', '', 'Leggo i file nel formato scelto dalla chat c-310?',
      '', 'Cosa sta facendo: Preparo il lettore dei file di configurazione.',
      '', 'Perché gli serve: Il lettore deve sapere quale formato aspettarsi.',
      '', 'Le scelte:', '• YAML (consigliata) → leggo solo file .yaml', '• JSON → leggo solo file .json',
      '', 'Se non rispondi: aspetto senza scrivere niente'
    ].join('\n')
    archivio.scrivi({
      ...nuovoAutopilota({ id: 'ap-prep', nome: 'Prep', obiettivo: 'Sistema il lettore', cwd: process.cwd(), criteri: [], iniziatoIl: '2026-08-09T10:00:00.000Z', stato: 'intervista' }),
      motivoSospensione: testo,
      riprendiAlRiavvio: false
    })
    await avvia(server)
    server.riprendiInterviste()
    const [d] = (await chiama('GET', '/domande')).dati
    expect(d.opzioni).toEqual(['YAML', 'JSON'])
    expect(d.parti).toMatchObject({ staFacendo: 'Preparo il lettore dei file di configurazione.', scelte: [{ scelta: 'YAML', conseguenza: 'leggo solo file .yaml', consigliata: true }, { scelta: 'JSON', conseguenza: 'leggo solo file .json' }] })
    // La sigla di una chat che non conosce non passa liscia: c'è l'avvertenza.
    expect(d.avvertenza).toBeDefined()
  })

  it('«Pubblico adesso?» propone le due risposte da toccare', async () => {
    server = ambiente()
    await avvia(server)
    const id = await creaAp({ pubblicazione: 'stabile', vaSulCloud: true })
    const fermata = chiama('POST', `/hook/stop?ap=${id}`, eventoStop())
    await attendi(async () => (await chiama('GET', '/domande')).dati.length > 0)
    const d = (await chiama('GET', '/domande')).dati[0]
    expect(d.opzioni).toEqual(['sì, pubblica', 'no, lascia così'])
    await chiama('POST', `/domande/${d.id}/risposta`, { risposta: 'sì, pubblica' })
    expect((await fermata).dati.decision).toBe('block')
  })
})

describe('«Archivia» e il momento del fermo (0.37.0)', () => {
  const scriviFermo = (id: string, stato: 'sospeso' | 'lavoro' = 'sospeso'): void => {
    archivio.scrivi({
      ...nuovoAutopilota({ id, nome: 'x', obiettivo: 'o', cwd: process.cwd(), criteri: [{ descrizione: 'c', soddisfatto: false }], iniziatoIl: '2026-08-09T10:00:00.000Z' }),
      stato,
      ...(stato === 'sospeso' ? { motivoSospensione: 'fermato dall utente' } : {})
    })
  }

  it('un autopilota fermo si archivia e si toglie dall archivio; uno che lavora no', async () => {
    server = ambiente()
    await avvia(server)
    scriviFermo('ap-fermo')
    const r = await chiama('POST', '/autopiloti/ap-fermo/archivia', { archivia: true })
    expect(r.stato).toBe(200)
    expect(r.dati.archiviato).toBe(true)
    // Scrivendo, il servizio segna anche il momento del fermo.
    expect(r.dati.fermatoIl).toBe('2026-08-09T10:05:00.000Z')
    const via = await chiama('POST', '/autopiloti/ap-fermo/archivia', { archivia: false })
    expect(via.dati.archiviato).toBeUndefined()
    scriviFermo('ap-vivo', 'lavoro')
    expect((await chiama('POST', '/autopiloti/ap-vivo/archivia', { archivia: true })).stato).toBe(409)
  })

  it('«Sposta in un altro workspace» cambia solo il workspace, anche mentre lavora (0.81.0)', async () => {
    server = ambiente()
    await avvia(server)
    scriviFermo('ap-vivo', 'lavoro')
    const r = await chiama('POST', '/autopiloti/ap-vivo/workspace', { workspace: ' Nuovo ' })
    expect(r.stato).toBe(200)
    expect(r.dati.workspace).toBe('Nuovo')
    expect(r.dati.stato).toBe('lavoro')
    expect(r.dati.cwd).toBe(process.cwd())
    expect((await chiama('POST', '/autopiloti/ap-vivo/workspace', { workspace: '' })).stato).toBe(400)
    expect((await chiama('POST', '/autopiloti/ap-nessuno/workspace', { workspace: 'Nuovo' })).stato).toBe(404)
  })

  it('«Ferma» scrive il momento del fermo, e riprendere lo toglie insieme all archiviazione', async () => {
    server = ambiente()
    await avvia(server)
    scriviFermo('ap-1', 'lavoro')
    await chiama('POST', '/autopiloti/ap-1/ferma')
    expect(archivio.leggi('ap-1')?.fermatoIl).toBe('2026-08-09T10:05:00.000Z')
    await chiama('POST', '/autopiloti/ap-1/archivia', { archivia: true })
    await chiama('POST', '/autopiloti/ap-1/riprendi')
    const dopo = archivio.leggi('ap-1')
    expect(dopo?.stato).toBe('lavoro')
    expect(dopo?.fermatoIl).toBeUndefined()
    expect(dopo?.archiviato).toBeUndefined()
    // 0.67.2: «Riprendi» resta nel diario, con quando e da che stato veniva.
    expect(dopo?.decisioni.some((d) => d.cosa.startsWith('ripreso su tua richiesta («Riprendi»)'))).toBe(true)
  })
})

describe('il via dalla linguetta «Domande» resta nella chat (0.38.0)', () => {
  it('dopo «Vai» la chat con lui ha la domanda del via e la risposta, come traccia', async () => {
    server = ambiente()
    await avvia(server)
    archivio.scrivi({
      ...nuovoAutopilota({ id: 'ap-v', nome: 'x', obiettivo: 'o', cwd: process.cwd(), criteri: [{ descrizione: 'c', soddisfatto: false }], iniziatoIl: '2026-08-09T10:00:00.000Z' }),
      stato: 'pronto'
    })
    expect((await chiama('POST', '/autopiloti/ap-v/vai')).stato).toBe(200)
    const d = archivio.leggi('ap-v')?.dialogo ?? []
    expect(d.slice(0, 2)).toMatchObject([{ da: 'lui', traccia: true }, { da: 'tu', testo: 'Vai', traccia: true }])
  })
})

describe('una nota del programma nel diario (0.37.5)', () => {
  it('«il compito è nella chat ma non è partito» finisce nel diario, dove il supervisore lo vede', async () => {
    server = ambiente()
    await avvia(server)
    archivio.scrivi({
      ...nuovoAutopilota({ id: 'ap-n', nome: 'x', obiettivo: 'o', cwd: process.cwd(), criteri: [{ descrizione: 'c', soddisfatto: false }], iniziatoIl: '2026-08-09T10:00:00.000Z' }),
      stato: 'lavoro'
    })
    const r = await chiama('POST', '/autopiloti/ap-n/nota', { testo: 'il compito è nella chat «Notte» ma non è partito' })
    expect(r.stato).toBe(200)
    expect(archivio.leggi('ap-n')?.decisioni.at(-1)?.cosa).toBe('programma: il compito è nella chat «Notte» ma non è partito')
    expect((await chiama('POST', '/autopiloti/ap-n/nota', { testo: '' })).stato).toBe(400)
    expect((await chiama('POST', '/autopiloti/nessuno/nota', { testo: 'x' })).stato).toBe(404)
  })
})

describe('un annuncio del programma a Nicholas (0.81.0, «Errori arrivati»)', () => {
  it('il riepilogo entra nella conversazione come battuta sua, con un id nuovo per la notifica sola', async () => {
    server = ambiente()
    await avvia(server)
    archivio.scrivi({
      ...nuovoAutopilota({ id: 'ap-e', nome: 'Errori arrivati', obiettivo: 'o', cwd: process.cwd(), criteri: [{ descrizione: 'c', soddisfatto: false }], iniziatoIl: '2026-08-09T10:00:00.000Z' }),
      stato: 'lavoro'
    })
    expect((await chiama('POST', '/autopiloti/ap-e/annuncio', { titolo: 'Errori arrivati: il riepilogo', testo: '2 errori dalla pagina, causa capita' })).stato).toBe(200)
    const a = archivio.leggi('ap-e')
    expect(a?.dialogo.at(-1)).toMatchObject({ da: 'lui', testo: '2 errori dalla pagina, causa capita', traccia: true })
    expect(a?.annuncio?.titolo).toBe('Errori arrivati: il riepilogo')
    const primo = a?.annuncio?.id
    await chiama('POST', '/autopiloti/ap-e/annuncio', { testo: 'un altro' })
    expect(archivio.leggi('ap-e')?.annuncio?.id).not.toBe(primo)
    expect((await chiama('POST', '/autopiloti/ap-e/annuncio', { testo: ' ' })).stato).toBe(400)
    expect((await chiama('POST', '/autopiloti/nessuno/annuncio', { testo: 'x' })).stato).toBe(404)
  })
})

describe('i tempi di ogni giro (0.71.0)', () => {
  it('una fermata si misura fase per fase e si legge da /tempi', async () => {
    const tempi = apriRegistroTempi(mkdtempSync(join(tmpdir(), 'ap-tempi-')))
    server = ambiente({ tempi, interroga: () => Promise.resolve({ testo: '{"azione": "prosegui", "istruzioni": "avanti", "perche": "manca"}' }) })
    await avvia(server)
    const id = await creaAp()
    await chiama('POST', `/hook/stop?ap=${id}`, eventoStop())
    const r = await chiama('GET', `/tempi?ap=${id}`)
    expect(r.dati.giri).toHaveLength(1)
    const g = r.dati.giri[0]
    expect(g.esito).toBe('prosegui')
    expect(Object.keys(g.fasi)).toEqual(expect.arrayContaining(['lettura', 'unione', 'criteri', 'supervisore', 'risposta']))
    expect(g.criteri.eseguiti).toHaveLength(1)
    expect(r.dati.riassunto.giri).toBe(1)
  })
})

describe('la domanda aperta sopravvive al riavvio del servizio (0.71.0)', () => {
  const CHIEDE = '{"azione": "chiedi", "domanda": {"staFacendo": "Sto collegando il pagamento.", "domanda": "Uso la chiave di prova o quella vera?", "perche": "Senza la chiave giusta il pagamento non parte.", "scelte": [{"scelta": "prova", "conseguenza": "Collego quella di prova."}, {"scelta": "vera", "conseguenza": "Collego quella vera."}], "seNonRispondi": "Resto fermo qui."}, "perche": "serve la chiave"}'

  it('al riavvio la domanda si ritrova (non si rifà) e la risposta riprende la chat', async () => {
    const cartella = mkdtempSync(join(tmpdir(), 'ap-riavvio-'))
    const file = join(cartella, 'servizio', 'domande-aperte.json')
    server = ambiente({ cartellaArchivio: cartella, domande: creaRegistroDomande({ adesso: () => Date.now(), file }), scadenzaDomandaMs: 100, interroga: () => Promise.resolve({ testo: CHIEDE }) })
    await avvia(server)
    const id = await creaAp()
    // La fermata aspetta la risposta per 100 ms, poi lascia andare la chat.
    expect((await chiama('POST', `/hook/stop?ap=${id}`, eventoStop())).dati).toEqual({})
    expect((await chiama('GET', '/autopiloti')).dati[0].stato).toBe('attesa')
    const prima = (await chiama('GET', '/domande')).dati
    expect(prima).toHaveLength(1)
    server.close()

    // Il servizio riparte: domande e archivio dal disco.
    server = ambiente({ cartellaArchivio: cartella, domande: creaRegistroDomande({ adesso: () => Date.now(), file }), interroga: () => Promise.resolve({ testo: CHIEDE }) })
    await avvia(server)
    server.riprendiLavori({ servizioAppenaPartito: true })
    const dopo = (await chiama('GET', '/domande')).dati
    expect(dopo.map((d: { id: string }) => d.id)).toEqual([prima[0].id])
    const a = (await chiama('GET', '/autopiloti')).dati[0]
    expect(a.stato).toBe('attesa')
    expect(a.decisioni.map((d: { cosa: string }) => d.cosa).join(' | ')).toContain('la domanda aperta è stata ritrovata')
    expect(a.decisioni.map((d: { cosa: string }) => d.cosa).join(' | ')).not.toContain('andata perduta')

    // La risposta arriva dopo il riavvio: riprende la chat con quella.
    await chiama('POST', `/domande/${prima[0].id}/risposta`, { risposta: 'prova' })
    for (let i = 0; i < 80 && messaggiDiRipresa.length === 0; i += 1) await new Promise((r) => setTimeout(r, 25))
    expect(messaggiDiRipresa.join(' ')).toContain('prova')
    expect((await chiama('GET', '/autopiloti')).dati[0].stato).toBe('lavoro')
    expect((await chiama('GET', '/domande')).dati).toHaveLength(0)
  })

  it('senza domanda salvata (servizio di prima) si torna al lavoro come prima', async () => {
    const cartella = mkdtempSync(join(tmpdir(), 'ap-riavvio-'))
    server = ambiente({ cartellaArchivio: cartella })
    archivio.scrivi({ ...nuovoAutopilota({ id: 'ap-x', nome: 'x', obiettivo: 'o', cwd: process.cwd(), criteri: [{ descrizione: 'c', soddisfatto: false }], iniziatoIl: '2026-08-09T10:00:00.000Z' }), stato: 'attesa', motivoSospensione: 'chiave?' })
    await avvia(server)
    server.riprendiLavori({ servizioAppenaPartito: true })
    // È la strada di prima: la domanda non c'è più, quindi si torna al lavoro e la si rifà.
    expect((await chiama('GET', '/autopiloti')).dati[0].decisioni.map((d: { cosa: string }) => d.cosa).join(' | ')).toContain('andata perduta')
  })
})

describe('tre chat insieme (0.71.0): ognuna il suo ordine, nessuno perso', () => {
  it('tre fermate nello stesso istante: ogni chat riceve solo le sue istruzioni, i giri si contano tutti', async () => {
    server = ambiente({ git: gitFinto, limiti: LIMITI_LIBERI,
      interroga: (prompt, _cwd, sessione) => {
        if (prompt.includes('va diviso fra')) return Promise.resolve({ testo: '{"compiti": ["scrivi i test", "aggiorna i documenti", "sistema il lettore"]}' })
        const chat = /Questa è (c-\d+)/.exec(prompt)?.[1] ?? '?'
        return new Promise((r) => setTimeout(() => r({ testo: `{"azione": "prosegui", "istruzioni": "solo per ${chat}", "perche": "avanti"}`, sessionId: sessione ?? `sup-${chat}` }), 20 + Math.random() * 40))
      },
      esegui: () => Promise.resolve({ codice: 1, uscita: 'ancora rosso' })
    })
    await avvia(server)
    const id = await creaAp({ tettoChat: 3 })
    for (let i = 0; i < 80 && chatAvviate.length < 3; i += 1) await new Promise((r) => setTimeout(r, 25))
    expect(chatAvviate).toHaveLength(3)
    const risposte = await Promise.all(['c-1', 'c-2', 'c-3'].map((c) => chiama('POST', `/hook/stop?ap=${id}&chat=${c}`, eventoStop({ session_id: `s-${c}` }))))
    expect(risposte.map((r) => r.dati.decision)).toEqual(['block', 'block', 'block'])
    expect(risposte.map((r) => String(r.dati.reason).split(String.fromCharCode(10))[0])).toEqual(['solo per c-1', 'solo per c-2', 'solo per c-3'])
    const stato = (await chiama('GET', '/autopiloti')).dati[0]
    expect(stato.chats.map((c: { cicli: number }) => c.cicli)).toEqual([1, 1, 1])
    expect(stato.cicli).toBe(3)
    // 29/10: decisioni di routine senza sessione, nessuna da tenere.
    expect(stato.chats.every((c: { sessioneSupervisore?: string }) => c.sessioneSupervisore === undefined)).toBe(true)
  })
})

describe('una fermata, una risposta (0.71.0)', () => {
  it('lo stesso Stop arrivato due volte mentre lo giudica: un solo giro di supervisore, la stessa risposta', async () => {
    let chiamate = 0
    server = ambiente({ interroga: () => { chiamate += 1; return new Promise((r) => setTimeout(() => r({ testo: '{"azione": "prosegui", "istruzioni": "avanti così", "perche": "manca"}' }), 50)) } })
    await avvia(server)
    const id = await creaAp()
    const ev = eventoStop({ session_id: 's-1', last_assistant_message: 'ho finito il pezzo A' })
    const [a, b] = await Promise.all([chiama('POST', `/hook/stop?ap=${id}`, ev), chiama('POST', `/hook/stop?ap=${id}`, ev)])
    expect(chiamate).toBe(1)
    expect(a.dati).toEqual(b.dati)
    expect((await chiama('GET', '/autopiloti')).dati[0].cicli).toBe(1)
    // Un turno nuovo (altro messaggio) è un giro nuovo.
    await chiama('POST', `/hook/stop?ap=${id}`, eventoStop({ session_id: 's-1', last_assistant_message: 'ho finito il pezzo B' }))
    expect(chiamate).toBe(2)
  })
})

/**
 * La copia del ramo rivisto, finta e vuota (0.84.4). Prima era la cartella
 * `tests` vera: `preparaCopia` di c-119 ci copiava `android/local.properties`
 * della cartella principale, con il percorso dell'SDK di quel PC, in
 * `tests/android/` (file fuori da git, a un passo da un commit).
 */
function copiaFinta(): string {
  return mkdtempSync(join(tmpdir(), 'ap-copia-ramo-'))
}

describe('la Revisione decide l’unione, il programma la controlla (0.71.0)', () => {
  const flotta = (over: Record<string, unknown> = {}) => ({
    ...nuovoAutopilota({ id: 'ap-rev', nome: 'Rev', obiettivo: 'Fai A poi B', cwd: process.cwd(), criteri: [{ descrizione: 'test', comando: 'node controlla.js', soddisfatto: false }], iniziatoIl: '2026-08-09T10:00:00.000Z' }),
    stato: 'lavoro' as const,
    ramoBase: 'main',
    tettoChat: 8,
    chats: [
      { id: 'c-1', compito: 'A', stato: 'finita' as const, cicli: 2, ruolo: 'sviluppo' as const, ramo: 'ap/ap-rev/c-1', cartella: process.cwd() },
      { id: 'c-2', compito: 'Rivedi il ramo ap/ap-rev/c-1 della chat c-1 («A»)', stato: 'lavoro' as const, cicli: 0, ruolo: 'revisione' as const, revisioneDi: 'c-1', cartella: process.cwd() }
    ],
    compitiDaFare: ['B'],
    ruoliCompiti: { A: { ruolo: 'sviluppo' as const, dopo: [] }, B: { ruolo: 'sviluppo' as const, dopo: ['A'] } },
    ...over
  })
  const attendiChe = async (f: () => boolean): Promise<void> => { for (let i = 0; i < 80 && !f(); i += 1) await new Promise((r) => setTimeout(r, 25)) }

  it('OK con un file citato e i criteri verdi: il ramo si unisce e si apre il compito che aspettava', async () => {
    server = ambiente({ git: gitFinto, limiti: LIMITI_LIBERI })
    archivio.scrivi(flotta())
    await avvia(server)
    const r = await chiama('POST', '/hook/stop?ap=ap-rev&chat=c-2', eventoStop({ last_assistant_message: 'REVISIONE: OK ap/ap-rev/c-1 — src/a.ts:3' }))
    expect(r.dati).toEqual({})
    await attendiChe(() => chatAvviate.some((c) => c.compito === 'B'))
    const a = (await chiama('GET', '/autopiloti')).dati[0]
    expect(a.chats.find((c: any) => c.id === 'c-1').approvata).toBe(true)
    expect(a.chats.find((c: any) => c.id === 'c-2').stato).toBe('finita')
    expect(chatAvviate.map((c) => c.compito)).toContain('B')
    // 0.79.0: accanto alla riga tecnica, il traguardo per la riga corta della conversazione.
    expect(a.decisioni.filter((d: any) => d.traguardo !== undefined).map((d: any) => d.traguardo)).toContainEqual({ chat: 'c-2', esito: 'approvato', di: 'c-1' })
  })

  it('senza la riga del verdetto si chiede di chiuderla; un OK che rompe un criterio vale «da rifare»', async () => {
    // 0.73.0: rosso sul ramo, verde sul ramo principale: il ramo rompe qualcosa.
    const ramo = copiaFinta()
    server = ambiente({ git: gitFinto, limiti: LIMITI_LIBERI, esegui: (_c, cwd) => Promise.resolve(cwd === ramo ? { codice: 1, uscita: '2 test rossi' } : { codice: 0, uscita: 'ok' }) })
    const base = flotta()
    archivio.scrivi({ ...base, chats: base.chats.map((c) => (c.id === 'c-1' ? { ...c, cartella: ramo } : c)) })
    await avvia(server)
    const senza = await chiama('POST', '/hook/stop?ap=ap-rev&chat=c-2', eventoStop({ last_assistant_message: 'Mi sembra a posto.' }))
    expect(senza.dati.decision).toBe('block')
    expect(senza.dati.reason).toContain('REVISIONE: OK')
    await chiama('POST', '/hook/stop?ap=ap-rev&chat=c-2', eventoStop({ last_assistant_message: 'REVISIONE: OK ap/ap-rev/c-1 — src/a.ts:3' }))
    const a = (await chiama('GET', '/autopiloti')).dati[0]
    const autore = a.chats.find((c: any) => c.id === 'c-1')
    expect(autore.approvata).toBeUndefined()
    expect(autore.stato).toBe('lavoro')
    expect(autore.rifacimenti).toBe(1)
    expect(messaggiDiRipresa.join(' ')).toContain('il ramo rompe quello che sul ramo principale passava')
    expect(a.decisioni.map((d: any) => d.traguardo).filter(Boolean)).toEqual([{ chat: 'c-2', esito: 'da-rifare', di: 'c-1' }])
  })

  it('0.73.0: un criterio dell insieme rosso anche sul ramo principale non respinge un ramo giusto', async () => {
    const ramo = copiaFinta()
    server = ambiente({ git: gitFinto, limiti: LIMITI_LIBERI, esegui: () => Promise.resolve({ codice: 1, uscita: 'b.js manca' }) })
    const base = flotta()
    archivio.scrivi({ ...base, chats: base.chats.map((c) => (c.id === 'c-1' ? { ...c, cartella: ramo } : c)) })
    await avvia(server)
    await chiama('POST', '/hook/stop?ap=ap-rev&chat=c-2', eventoStop({ last_assistant_message: 'REVISIONE: OK ap/ap-rev/c-1 — src/a.ts:3' }))
    const autore = (await chiama('GET', '/autopiloti')).dati[0].chats.find((c: any) => c.id === 'c-1')
    expect(autore.approvata).toBe(true)
  })

  it('0.84.4, caso c-106 del 23/10: rosso nella copia solo perché tsc e vitest non partono → unito, nessun rimando, nessuna domanda', async () => {
    const ramo = copiaFinta()
    server = ambiente({ git: gitFinto, limiti: LIMITI_LIBERI, esegui: (_c, cwd) => Promise.resolve(cwd === ramo ? { codice: 1, uscita: "'tsc' non è riconosciuto come comando interno o esterno, un programma eseguibile o un file batch." } : { codice: 0, uscita: 'ok' }) })
    const base = flotta()
    // Già rimandato indietro due volte, come c-106: la terza non deve diventare una domanda.
    archivio.scrivi({ ...base, chats: base.chats.map((c) => (c.id === 'c-1' ? { ...c, cartella: ramo, rifacimenti: 2 } : c)) })
    await avvia(server)
    await chiama('POST', '/hook/stop?ap=ap-rev&chat=c-2', eventoStop({ last_assistant_message: 'REVISIONE: OK ap/ap-rev/c-1 — src/a.ts:3' }))
    const a = (await chiama('GET', '/autopiloti')).dati[0]
    expect(a.chats.find((c: any) => c.id === 'c-1').approvata).toBe(true)
    expect((await chiama('GET', '/domande')).dati).toHaveLength(0)
    expect(messaggiDiRipresa.join(' ')).not.toContain('il ramo rompe')
    expect(a.decisioni.map((d: any) => d.cosa).join(' | ')).toContain('problema di ambiente nella copia di c-1')
  })

  // 0.84.4: niente più «Come vado avanti con …?» (Nicholas, 23/10: «sei tu che devi trovare le soluzioni, non io»).
  it('rimandato indietro troppe volte: nessuna domanda, il compito riparte da capo in una chat nuova con le note della Revisione', async () => {
    server = ambiente({ git: gitFinto, limiti: LIMITI_LIBERI })
    const base = flotta()
    archivio.scrivi({ ...base, chats: base.chats.map((c) => (c.id === 'c-1' ? { ...c, rifacimenti: 2 } : c)) })
    await avvia(server)
    await chiama('POST', '/hook/stop?ap=ap-rev&chat=c-2', eventoStop({ last_assistant_message: 'REVISIONE: DA RIFARE ap/ap-rev/c-1: manca il caso vuoto in src/a.ts:9, come già detto a c-1 e a c-77' }))
    for (let i = 0; i < 80 && messaggiDiRipresa.length === 0; i += 1) await new Promise((r) => setTimeout(r, 25))
    expect((await chiama('GET', '/domande')).dati).toHaveLength(0)
    const a = (await chiama('GET', '/autopiloti')).dati[0]
    expect(a.chats.find((c: any) => c.id === 'c-1').stato).toBe('finita')
    expect(a.chats.find((c: any) => c.sostituisce === 'c-1')).toMatchObject({ stato: 'lavoro', daCapo: true })
    expect(messaggiDiRipresa.join(' ')).toContain('manca il caso vuoto in src/a.ts:9')
  })

  it('la Revisione non scrive file e nessuno lancia l’installatore', async () => {
    server = ambiente({ git: gitFinto, limiti: LIMITI_LIBERI })
    archivio.scrivi(flotta())
    await avvia(server)
    const scrive = await chiama('POST', '/hook/pretool?ap=ap-rev&chat=c-2', { tool_name: 'Edit', tool_input: { file_path: 'x.ts' }, cwd: process.cwd() })
    expect(scrive.dati.hookSpecificOutput.permissionDecision).toBe('deny')
    const commit = await chiama('POST', '/hook/pretool?ap=ap-rev&chat=c-2', { tool_name: 'Bash', tool_input: { command: 'git commit -am x' }, cwd: process.cwd() })
    expect(commit.dati.hookSpecificOutput.permissionDecision).toBe('deny')
    const legge = await chiama('POST', '/hook/pretool?ap=ap-rev&chat=c-2', { tool_name: 'Bash', tool_input: { command: 'git diff main...ap/ap-rev/c-1' }, cwd: process.cwd() })
    expect(legge.dati).toEqual({})
    const installa = await chiama('POST', '/hook/pretool?ap=ap-rev&chat=c-1', { tool_name: 'PowerShell', tool_input: { command: 'Start-Process .\\dist\\SierraDeck-Setup-0.71.0.exe' }, cwd: process.cwd() })
    expect(installa.dati.hookSpecificOutput.permissionDecision).toBe('deny')
    const carica = await chiama('POST', '/hook/pretool?ap=ap-rev&chat=c-1', { tool_name: 'Bash', tool_input: { command: 'gh release upload v0.71.0 dist/SierraDeck-Setup-0.71.0.exe' }, cwd: process.cwd() })
    expect(carica.dati).toEqual({})
  })
})

describe('antiloop nel servizio (0.71.0)', () => {
  it('la stessa istruzione tre volte, criteri verdi e la chat che dice la stessa cosa: si ferma e lo spiega', async () => {
    server = ambiente({ interroga: () => Promise.resolve({ testo: '{"azione": "prosegui", "istruzioni": "Controlla di nuovo i test", "perche": "per sicurezza"}' }) })
    await avvia(server)
    const id = await creaAp()
    for (let i = 0; i < 3; i += 1) await chiama('POST', `/hook/stop?ap=${id}`, eventoStop({ last_assistant_message: 'Ho controllato: tutto verde.' }))
    const a = (await chiama('GET', '/autopiloti')).dati[0]
    expect(a.stato).toBe('sospeso')
    expect(a.motivoSospensione).toContain('antiloop')
  })

  it('se la chat dice cose nuove (lavora), non scatta', async () => {
    server = ambiente({ interroga: () => Promise.resolve({ testo: '{"azione": "prosegui", "istruzioni": "Continua con il compito", "perche": "manca"}' }) })
    await avvia(server)
    const id = await creaAp()
    for (let i = 0; i < 4; i += 1) await chiama('POST', `/hook/stop?ap=${id}`, eventoStop({ last_assistant_message: `Fatto il pezzo ${i}.` }))
    expect((await chiama('GET', '/autopiloti')).dati[0].stato).toBe('lavoro')
  })
})

describe('domande chiare nel servizio (0.71.0)', () => {
  const chiede = (domanda: string) => JSON.stringify({ azione: 'chiedi', domanda: { staFacendo: 'Sto collegando il pagamento.', domanda, perche: 'Senza la chiave il pagamento non parte.', scelte: [{ scelta: 'di prova', conseguenza: 'collego quella di prova', consigliata: true }, { scelta: 'vera', conseguenza: 'collego quella vera' }], seNonRispondi: 'Aspetto.' }, perche: 'serve' })

  it('la stessa domanda già risposta non si rifà: la chat riceve la risposta di prima', async () => {
    const memoria = apriMemoria(undefined)
    memoria.ricordaRisposta('ap-mem', 'Uso la chiave di prova o quella vera?', 'di prova', '2026-10-12T10:00:00Z')
    server = creaServerCon({ memoria, interroga: () => Promise.resolve({ testo: chiede('Uso la chiave di prova o quella vera?') }) })
    await avvia(server)
    archivio.scrivi({ ...nuovoAutopilota({ id: 'ap-mem', nome: 'Mem', obiettivo: 'o', cwd: process.cwd(), criteri: [{ descrizione: 'c', comando: 'node c.js', soddisfatto: false }], iniziatoIl: '2026-08-09T10:00:00.000Z' }), stato: 'lavoro' })
    const r = await chiama('POST', '/hook/stop?ap=ap-mem', eventoStop())
    expect(r.dati.decision).toBe('block')
    expect(r.dati.reason).toContain('di prova')
    expect((await chiama('GET', '/domande')).dati).toHaveLength(0)
  })

  it('«installi la 0.80.0?» con la 0.80.1 già installata non si chiede: la chat lo sa dal programma (0.81.0)', async () => {
    server = creaServerCon({ versione: '0.80.1', interroga: () => Promise.resolve({ testo: chiede('Installi tu la 0.80.0 su questo PC?') }) })
    await avvia(server)
    archivio.scrivi({ ...nuovoAutopilota({ id: 'ap-ver', nome: 'Ver', obiettivo: 'o', cwd: process.cwd(), criteri: [{ descrizione: 'c', comando: 'node c.js', soddisfatto: false }], iniziatoIl: '2026-08-09T10:00:00.000Z' }), stato: 'lavoro' })
    const r = await chiama('POST', '/hook/stop?ap=ap-ver', eventoStop())
    expect(r.dati.decision).toBe('block')
    expect(r.dati.reason).toContain('già installata la 0.80.1')
    expect((await chiama('GET', '/domande')).dati).toHaveLength(0)
    expect(archivio.leggi('ap-ver')!.decisioni.at(-1)?.cosa).toContain('non la chiedo')
  })

  it('la stessa domanda in un’altra lingua, già risposta, non si rifà (0.81.0)', async () => {
    const memoria = apriMemoria(undefined)
    memoria.ricordaRisposta('ap-en', 'Installi tu la 0.80.0 su questo PC?', 'sì, fatto', '2026-10-20T06:51:20Z', 'c-10')
    server = creaServerCon({ memoria, versione: '0.79.0', adesso: () => '2026-10-20T07:00:00.000Z', interroga: () => Promise.resolve({ testo: chiede('Will you install the 0.80.0 on this PC?') }) })
    await avvia(server)
    archivio.scrivi({ ...nuovoAutopilota({ id: 'ap-en', nome: 'En', obiettivo: 'o', cwd: process.cwd(), criteri: [{ descrizione: 'c', comando: 'node c.js', soddisfatto: false }], iniziatoIl: '2026-10-20T06:00:00.000Z' }), stato: 'lavoro' })
    const r = await chiama('POST', '/hook/stop?ap=ap-en', eventoStop())
    expect(r.dati.decision).toBe('block')
    expect(r.dati.reason).toContain('sì, fatto')
    expect((await chiama('GET', '/domande')).dati).toHaveLength(0)
  })

  it('la gemella a fine turno riprende anche la sorella che aveva chiesto da una notifica (0.81.0)', async () => {
    // c-10 ha chiesto da una notifica: nessun turno trattenuto. c-12 chiede la
    // stessa cosa a fine turno e aspetta con l'hook: la risposta arriva a c-12
    // «in tempo», e la via delle risposte tardive (che riprendeva c-10) non scatta.
    const domande = creaRegistroDomande({ adesso: () => Date.now() })
    const prima = domande.apri({ autopilotaId: 'ap-gem', testo: 'Installi la 0.80.0 su questo PC?', scadenzaMs: 60_000 })
    domande.ricorda(prima.id, { autopilotaId: 'ap-gem', testo: 'Installi la 0.80.0 su questo PC?', grezza: 'Installi la 0.80.0 su questo PC?', chatId: 'c-10' })
    server = creaServerCon({ domande, versione: '0.79.0', esegui: () => Promise.resolve({ codice: 1, uscita: 'rosso' }), interroga: () => Promise.resolve({ testo: chiede('Installi la 0.80.0 adesso, così chiudo le chat finite?') }) })
    await avvia(server)
    archivio.scrivi({
      ...nuovoAutopilota({ id: 'ap-gem', nome: 'Gem', obiettivo: 'o', cwd: process.cwd(), criteri: [{ descrizione: 'c', comando: 'node c.js', soddisfatto: false }], iniziatoIl: '2026-08-09T10:00:00.000Z' }),
      stato: 'lavoro',
      chats: [
        { id: 'c-10', compito: 'a', stato: 'bloccata', cicli: 1, sessionId: 's-10' },
        { id: 'c-12', compito: 'b', stato: 'lavoro', cicli: 1, sessionId: 's-12' }
      ]
    })
    const fineTurno = chiama('POST', '/hook/stop?ap=ap-gem&chat=c-12', eventoStop({ session_id: 's-12' }))
    for (let i = 0; i < 80 && archivio.leggi('ap-gem')!.chats.find((c) => c.id === 'c-12')!.stato !== 'bloccata'; i += 1) await new Promise((r) => setTimeout(r, 25))
    expect(domande.aperte('ap-gem')).toHaveLength(1)

    await chiama('POST', `/domande/${prima.id}/risposta`, { risposta: 'Sì, installo' })
    const r = await fineTurno
    expect(r.dati.decision).toBe('block')
    expect(r.dati.reason).toContain('Sì, installo')
    expect(chatAvviate.map((c) => c.id)).toEqual(['c-10'])
    expect(archivio.leggi('ap-gem')!.chats.map((c) => c.stato)).toEqual(['lavoro', 'lavoro'])
  })

  it('scaduta l’attesa della prima, la stessa domanda di una sorella non apre niente e la risposta le riprende tutte e due (0.81.0)', async () => {
    server = creaServerCon({ versione: '0.79.0', scadenzaDomandaMs: 200, esegui: () => Promise.resolve({ codice: 1, uscita: 'rosso' }), interroga: () => Promise.resolve({ testo: chiede('Installi la 0.80.0 su questo PC?') }) })
    await avvia(server)
    archivio.scrivi({
      ...nuovoAutopilota({ id: 'ap-sca', nome: 'Sca', obiettivo: 'o', cwd: process.cwd(), criteri: [{ descrizione: 'c', comando: 'node c.js', soddisfatto: false }], iniziatoIl: '2026-08-09T10:00:00.000Z' }),
      stato: 'lavoro',
      chats: [
        { id: 'c-10', compito: 'a', stato: 'lavoro', cicli: 1, sessionId: 's-10' },
        { id: 'c-12', compito: 'b', stato: 'lavoro', cicli: 1, sessionId: 's-12' }
      ]
    })
    // c-10 chiede a fine turno; nessuno risponde entro la scadenza: l'hook la lascia andare.
    expect((await chiama('POST', '/hook/stop?ap=ap-sca&chat=c-10', eventoStop({ session_id: 's-10' }))).dati).toEqual({})
    // c-12 chiede la stessa cosa: si aggancia, non si apre una seconda domanda.
    expect((await chiama('POST', '/hook/stop?ap=ap-sca&chat=c-12', eventoStop({ session_id: 's-12' }))).dati).toEqual({})
    const aperte = (await chiama('GET', '/domande')).dati
    expect(aperte).toHaveLength(1)
    expect(aperte[0].inFila ?? 0).toBe(0)
    expect(archivio.leggi('ap-sca')!.chats.map((c) => c.stato)).toEqual(['bloccata', 'bloccata'])

    await chiama('POST', `/domande/${aperte[0].id}/risposta`, { risposta: 'Sì, installo' })
    expect(chatAvviate.map((c) => c.id).sort()).toEqual(['c-10', 'c-12'])
    expect(archivio.leggi('ap-sca')!.chats.map((c) => c.stato)).toEqual(['lavoro', 'lavoro'])
  })

  it('una alla volta: due domande dello stesso autopilota, se ne vede una con quante aspettano', async () => {
    const domande = creaRegistroDomande({ adesso: () => Date.now() })
    server = ambiente({ domande })
    await avvia(server)
    domande.apri({ autopilotaId: 'ap-a', testo: 'prima', scadenzaMs: 60_000 })
    await new Promise((r) => setTimeout(r, 5))
    domande.apri({ autopilotaId: 'ap-a', testo: 'seconda', scadenzaMs: 60_000 })
    domande.apri({ autopilotaId: 'ap-b', testo: 'di un altro', scadenzaMs: 60_000 })
    const viste = (await chiama('GET', '/domande')).dati
    expect(viste.map((d: { testo: string }) => d.testo).sort()).toEqual(['di un altro', 'prima'])
    expect(viste.find((d: { testo: string }) => d.testo === 'prima').inFila).toBe(1)
  })
})

describe('mai più di un messaggio in coda in Claude Code (0.72.0)', () => {
  it('durante un turno si scrive una volta sola: gli altri messaggi aspettano la fine del turno, uniti', async () => {
    server = ambiente({ adesso: () => '2026-08-09T10:05:00.000Z' })
    await avvia(server)
    archivio.scrivi({
      ...nuovoAutopilota({ id: 'ap-coda', nome: 'Coda', obiettivo: 'o', cwd: process.cwd(), criteri: [{ descrizione: 'c', comando: 'node c.js', soddisfatto: false }], iniziatoIl: '2026-08-09T09:00:00.000Z' }),
      stato: 'lavoro',
      daConsegnare: [{ id: 'm-1', quando: '2026-08-09T10:00:00.000Z', testo: 'primo', chats: ['ap-coda'] }]
    })
    server.controllaChatFerme()
    await new Promise((r) => setTimeout(r, 20))
    expect(avviati).toEqual(['ap-coda'])
    expect(messaggiDiRipresa[0]).toContain('primo')
    // Arrivano altri due messaggi mentre la chat lavora ancora: non si scrivono.
    const a = archivio.leggi('ap-coda')!
    archivio.scrivi({ ...a, daConsegnare: [...a.daConsegnare, { id: 'm-2', quando: '2026-08-09T10:01:00.000Z', testo: 'secondo', chats: ['ap-coda'] }, { id: 'm-3', quando: '2026-08-09T10:02:00.000Z', testo: 'terzo', chats: ['ap-coda'] }] })
    server.controllaChatFerme()
    const manda = (await chiama('POST', '/autopiloti/ap-coda/manda-adesso')).dati
    expect(manda.mandate).toBe(0)
    expect(manda.messaggio).toContain('già un tuo messaggio')
    await new Promise((r) => setTimeout(r, 20))
    expect(avviati).toEqual(['ap-coda'])
    expect(archivio.leggi('ap-coda')!.daConsegnare.map((m) => m.id)).toEqual(['m-2', 'm-3'])
  })
})

describe('in sottofondo solo su richiesta (0.72.0)', () => {
  it('l’interruttore si accende e si spegne, e lo dice nel diario', async () => {
    server = ambiente()
    await avvia(server)
    archivio.scrivi({ ...nuovoAutopilota({ id: 'ap-sf', nome: 'Sf', obiettivo: 'o', cwd: process.cwd(), criteri: [{ descrizione: 'c', comando: 'node c.js', soddisfatto: false }], iniziatoIl: '2026-08-09T10:00:00.000Z' }), stato: 'finito' })
    expect(archivio.leggi('ap-sf')!.sottofondo).toBeUndefined()
    expect((await chiama('POST', '/autopiloti/ap-sf/sottofondo', { si: true })).dati.sottofondo).toBe(true)
    expect((await chiama('POST', '/autopiloti/ap-sf/sottofondo', { si: false })).dati.sottofondo).toBeUndefined()
    const diario = archivio.leggi('ap-sf')!.decisioni.map((d) => d.cosa).join(' | ')
    expect(diario).toContain('lavora in sottofondo, senza riquadro')
    expect(diario).toContain('torna a lavorare in un riquadro del suo workspace')
  })
})

describe('criteri ricontrollati solo su richiesta (0.72.0)', () => {
  it('un lavoro finito che torna rosso lo dice nel diario, ma solo se lo chiedi', async () => {
    let passa = true
    let eseguiti = 0
    server = ambiente({ esegui: () => { eseguiti += 1; return Promise.resolve(passa ? { codice: 0, uscita: 'ok' } : { codice: 1, uscita: '1 test rosso' }) }, adesso: () => '2026-08-09T12:00:00.000Z' })
    archivio.scrivi({ ...nuovoAutopilota({ id: 'ap-fin', nome: 'Fin', obiettivo: 'o', cwd: process.cwd(), criteri: [{ descrizione: 'i test', comando: 'node t.js', soddisfatto: true }], iniziatoIl: '2026-08-09T10:00:00.000Z' }), stato: 'finito', ultimoEvento: '2026-08-09T11:30:00.000Z' })
    await avvia(server)
    expect((await chiama('POST', '/autopiloti/ap-fin/ricontrolla-criteri')).stato).toBe(200)
    expect((await chiama('GET', '/autopiloti')).dati[0].criteri[0].soddisfatto).toBe(true)
    passa = false
    expect(await server.ricontrollaCriteri('ap-fin')).toBe(true)
    const a = (await chiama('GET', '/autopiloti')).dati[0]
    expect(a.criteri[0].soddisfatto).toBe(false)
    expect(a.decisioni.map((d: { cosa: string }) => d.cosa).join(' | ')).toContain('«i test» non passa più')
    expect(eseguiti).toBe(2)
  })

  it('mai da solo: il servizio non ha più nessun giro a orario che misura i criteri', () => {
    const avvio = readFileSync(join(__dirname, '..', '..', 'src', 'autopilot-host', 'index.ts'), 'utf8')
    expect(avvio).not.toMatch(/setInterval\([^\n]*ricontrollaCriteri/)
    expect(avvio).not.toMatch(/ricontrollaCriteri\(\)/)
  })

  it('un autopilota al lavoro non si rimisura da fuori, e uno che non c’è risponde 409', async () => {
    let eseguiti = 0
    server = ambiente({ esegui: () => { eseguiti += 1; return Promise.resolve({ codice: 0, uscita: 'ok' }) } })
    archivio.scrivi({ ...nuovoAutopilota({ id: 'ap-lav', nome: 'Lav', obiettivo: 'o', cwd: process.cwd(), criteri: [{ descrizione: 'c', comando: 'node c.js', soddisfatto: false }], iniziatoIl: '2026-08-09T10:00:00.000Z' }), stato: 'lavoro' })
    await avvia(server)
    expect(await server.ricontrollaCriteri('ap-lav')).toBe(false)
    expect((await chiama('POST', '/autopiloti/ap-nessuno/ricontrolla-criteri')).stato).toBe(409)
    expect(eseguiti).toBe(0)
  })
})

describe('due chat che chiudono insieme (0.71.0, visto dal vero)', () => {
  it('ognuna manda il suo ramo alla Revisione: due revisori, nessuno senza ruolo', async () => {
    const SUP = (prompt: string) => {
      if (prompt.includes('va diviso fra')) return Promise.resolve({ testo: '{"compiti": [{"compito": "Crea somma.js", "ruolo": "sviluppo"}, {"compito": "Crea saluto.js", "ruolo": "sviluppo"}]}' })
      const chat = /Questa è (c-\d+)/.exec(prompt)?.[1] ?? 'c-1'
      return new Promise<{ testo: string }>((r) => setTimeout(() => r({ testo: `{"azione": "prosegui", "istruzioni": "avanti", "perche": "fatto", "mosse": [{"tipo": "chiudiChat", "chat": "${chat}"}]}` }), 30))
    }
    server = ambiente({ git: gitFinto, limiti: LIMITI_LIBERI, interroga: SUP })
    await avvia(server)
    const id = await creaAp()
    for (let i = 0; i < 80 && chatAvviate.length < 2; i += 1) await new Promise((r) => setTimeout(r, 25))
    await Promise.all(['c-1', 'c-2'].map((c) => chiama('POST', `/hook/stop?ap=${id}&chat=${c}`, eventoStop({ session_id: `s-${c}`, last_assistant_message: `fatto ${c}` }))))
    for (let i = 0; i < 80 && chatAvviate.length < 4; i += 1) await new Promise((r) => setTimeout(r, 25))
    const a = (await chiama('GET', '/autopiloti')).dati[0]
    const revisori = a.chats.filter((c: any) => c.compito.startsWith('Rivedi il ramo'))
    expect(revisori).toHaveLength(2)
    expect(revisori.every((c: any) => c.ruolo === 'revisione')).toBe(true)
    expect(revisori.map((c: any) => c.revisioneDi).sort()).toEqual(['c-1', 'c-2'])
  })
})

describe('la notifica non cancella quello che le sorelle hanno scritto (0.71.0, visto dal vero)', () => {
  it('mentre il supervisore risponde a una domanda della chat, un’approvazione scritta da un’altra fermata resta', async () => {
    server = ambiente({ interroga: () => new Promise((r) => setTimeout(() => r({ testo: '{"esito": "rispondo", "risposta": "vai avanti", "perche": "lo dice l obiettivo"}' }), 80)) })
    await avvia(server)
    archivio.scrivi({
      ...nuovoAutopilota({ id: 'ap-not', nome: 'Not', obiettivo: 'o', cwd: process.cwd(), criteri: [{ descrizione: 'c', comando: 'node c.js', soddisfatto: false }], iniziatoIl: '2026-08-09T10:00:00.000Z' }),
      stato: 'lavoro',
      chats: [
        { id: 'c-1', compito: 'A', stato: 'finita', cicli: 2, ruolo: 'sviluppo' },
        { id: 'c-2', compito: 'B', stato: 'lavoro', cicli: 1, ruolo: 'sviluppo' }
      ]
    })
    const notifica = chiama('POST', '/hook/notification?ap=ap-not&chat=c-2', { notification_type: 'idle_prompt', message: 'Claude is waiting for your input', session_id: 's-2' })
    await new Promise((r) => setTimeout(r, 20))
    const ora = archivio.leggi('ap-not')!
    archivio.scrivi({ ...ora, cicli: 7, chats: ora.chats.map((c) => (c.id === 'c-1' ? { ...c, approvata: true } : c)) })
    await notifica
    const dopo = archivio.leggi('ap-not')!
    expect(dopo.chats.find((c) => c.id === 'c-1')?.approvata).toBe(true)
    expect(dopo.cicli).toBe(7)
  })
})

describe('le domande delle chat a cui risponde l’autopilota restano visibili (0.71.1)', () => {
  it('fine turno con una domanda, il supervisore prosegue: la domanda e la sua risposta in /domande/risolte', async () => {
    server = ambiente({
      esegui: () => Promise.resolve({ codice: 1, uscita: 'rosso' }),
      interroga: () => Promise.resolve({ testo: '{"azione": "prosegui", "perche": "l obiettivo lo dice", "istruzioni": "Usa npm: il progetto ha già il package-lock."}' })
    })
    await avvia(server)
    const id = await creaAp()
    await chiama('POST', `/hook/stop?ap=${id}`, eventoStop({ last_assistant_message: 'Ho preparato tutto.\n\nUso npm o pnpm?' }))
    const risolte = (await chiama('GET', '/domande/risolte')).dati
    expect(risolte).toHaveLength(1)
    expect(risolte[0]).toMatchObject({ autopilotaId: id, domanda: 'Uso npm o pnpm?', risposta: 'Usa npm: il progetto ha già il package-lock.' })
  })

  it('un turno senza domanda non lascia niente', async () => {
    server = ambiente({
      esegui: () => Promise.resolve({ codice: 1, uscita: 'rosso' }),
      interroga: () => Promise.resolve({ testo: '{"azione": "prosegui", "perche": "avanti", "istruzioni": "Continua."}' })
    })
    await avvia(server)
    const id = await creaAp()
    await chiama('POST', `/hook/stop?ap=${id}`, eventoStop({ last_assistant_message: 'Ho corretto il primo test.' }))
    expect((await chiama('GET', '/domande/risolte')).dati).toEqual([])
  })

  it('una domanda della chat a cui il supervisore risponde da solo resta visibile', async () => {
    server = ambiente({ interroga: () => Promise.resolve({ testo: '{"azione": "rispondo", "risposta": "Usa la chiave A", "perche": "è scritta nell obiettivo"}' }) })
    await avvia(server)
    const id = await creaAp()
    await chiama('POST', `/hook/notification?ap=${id}`, { session_id: 's-1', hook_event_name: 'Notification', notification_type: 'elicitation_dialog', message: 'quale chiave uso?' })
    const risolte = (await chiama('GET', `/domande/risolte?ap=${id}`)).dati
    expect(risolte).toHaveLength(1)
    expect(risolte[0].domanda).toContain('quale chiave uso?')
    expect(risolte[0].risposta).toBe('Usa la chiave A')
    // Non è una domanda aperta: non aspetta Nicholas.
    expect((await chiama('GET', `/domande?ap=${id}`)).dati).toEqual([])
  })
})

describe('0.76.0: gli specialisti anche per gli autopiloti che ci sono già', () => {
  async function attendi(condizione: () => boolean): Promise<void> {
    for (let i = 0; i < 80 && !condizione(); i += 1) await new Promise((r) => setTimeout(r, 25))
  }
  it('nato con una chat sola: alla ripresa con lavoro in parti distinte diventa una squadra, con i ruoli', async () => {
    let fase = 'nascita'
    server = ambiente({
      git: gitFinto, limiti: LIMITI_LIBERI,
      interroga: (prompt) => Promise.resolve({
        testo: prompt.includes('va diviso fra')
          ? (fase === 'nascita'
            ? '{"compiti": [{"compito": "tutto", "ruolo": "sviluppo"}]}'
            : '{"compiti": [{"compito": "notifiche dell app", "ruolo": "interfaccia"}, {"compito": "test delle notifiche", "ruolo": "collaudo", "dipendeDa": [0]}]}')
          : '{"azione": "finito"}'
      })
    })
    await avvia(server)
    const id = await creaAp()
    await attendi(() => archivio.leggi(id)?.sessionId !== undefined)
    expect(archivio.leggi(id)?.chats).toEqual([])
    expect(archivio.leggi(id)?.organizzazione).toContain('una chat sola')
    archivio.scrivi({ ...archivio.leggi(id)!, stato: 'finito', compitiDaFare: ['notifiche dell app e i loro test'] })
    fase = 'ripresa'
    await chiama('POST', `/autopiloti/${id}/riprendi`)
    await attendi(() => (archivio.leggi(id)?.chats.length ?? 0) > 0)
    const dopo = archivio.leggi(id)!
    expect(dopo.stato).toBe('lavoro')
    expect(dopo.chats.map((c) => c.ruolo)).toEqual(['interfaccia'])
    expect(dopo.compitiDaFare).toEqual(['test delle notifiche'])
    expect(dopo.organizzazione).toContain('Lavoro diviso fra specialisti')
    expect(dopo.decisioni.at(-1)?.cosa ?? dopo.decisioni.map((d) => d.cosa).join(' ')).toBeDefined()
    expect(dopo.decisioni.some((d) => d.cosa.startsWith('alla ripresa divido il lavoro fra specialisti'))).toBe(true)
  })

  it('lavoro piccolo alla ripresa: resta una chat sola, e la scheda dice perché', async () => {
    server = ambiente({
      git: gitFinto, limiti: LIMITI_LIBERI,
      interroga: (prompt) => Promise.resolve({ testo: prompt.includes('va diviso fra') ? '{"compiti": [{"compito": "una cosa", "ruolo": "sviluppo"}]}' : '{"azione": "finito"}' })
    })
    await avvia(server)
    const id = await creaAp()
    await attendi(() => archivio.leggi(id)?.sessionId !== undefined)
    archivio.scrivi({ ...archivio.leggi(id)!, stato: 'finito' })
    await chiama('POST', `/autopiloti/${id}/riprendi`)
    await attendi(() => archivio.leggi(id)?.stato === 'lavoro')
    expect(archivio.leggi(id)?.chats).toEqual([])
    expect(archivio.leggi(id)?.organizzazione).toBe('Lavoro piccolo: una chat sola, che fa tutto.')
  })
})

describe('chiudiChat su un ramo già unito e tolto (0.80.0, visto dal vero il 19/10)', () => {
  async function attendi(condizione: () => boolean): Promise<void> {
    for (let i = 0; i < 120 && !condizione(); i += 1) await new Promise((r) => setTimeout(r, 25))
  }
  it('la chat si chiude subito: niente Revisione, niente unione che fallisce', async () => {
    const chiesti: string[] = []
    // Il ramo principale c'è, il ramo della chat no: com'era per c-4 e c-7.
    const gitSenzaRamo: Git = (args, cwd) => {
      const a = args.join(' ')
      chiesti.push(a)
      if (a === 'rev-parse --verify --quiet refs/heads/main') return { codice: 0, uscita: 'abc' }
      if (a.startsWith('rev-parse --verify --quiet refs/heads/ap/')) return { codice: 1, uscita: '' }
      if (a.includes('merge')) return { codice: 1, uscita: 'merge: ap/ap-ch/c-4 - not something we can merge' }
      return gitFinto(args, cwd)
    }
    server = ambiente({
      git: gitSenzaRamo, limiti: LIMITI_LIBERI,
      esegui: () => Promise.resolve({ codice: 1, uscita: 'rosso' }),
      interroga: () => Promise.resolve({ testo: '{"azione": "prosegui", "istruzioni": "avanti", "perche": "fatto", "mosse": [{"tipo": "chiudiChat", "chat": "c-4"}]}' })
    })
    await avvia(server)
    archivio.scrivi({
      ...nuovoAutopilota({ id: 'ap-ch', nome: 'Ch', obiettivo: 'o', cwd: process.cwd(), criteri: [{ descrizione: 'c', comando: 'node c.js', soddisfatto: false }], iniziatoIl: '2026-08-09T10:00:00.000Z' }),
      stato: 'lavoro',
      ramoBase: 'main',
      chats: [
        { id: 'c-4', compito: 'Interfaccia', stato: 'lavoro', cicli: 3, ruolo: 'sviluppo', ramo: 'ap/ap-ch/c-4', cartella: join(process.cwd(), 'non-esiste-c-4') },
        { id: 'c-10', compito: 'Analisi', stato: 'lavoro', cicli: 1, ruolo: 'sviluppo', ramo: 'ap/ap-ch/c-10', cartella: join(process.cwd(), 'non-esiste-c-10') }
      ]
    })
    await chiama('POST', '/hook/stop?ap=ap-ch&chat=c-10', eventoStop({ session_id: 's-10', last_assistant_message: 'fatto' }))
    await attendi(() => archivio.leggi('ap-ch')!.chats.find((c) => c.id === 'c-4')?.stato === 'finita')
    const a = archivio.leggi('ap-ch')!
    const diario = a.decisioni.map((d) => d.cosa).join(' | ')
    expect(diario).toContain('chiudo la chat c-4: il suo ramo è già stato unito e tolto')
    expect(diario).not.toContain('non si chiude')
    expect(a.compitiDaFare.some((t) => t.startsWith('Rivedi il ramo'))).toBe(false)
    expect(chiesti.some((x) => x.includes('merge') && x.includes('c-4'))).toBe(false)
    expect(fermati).toContain('ap-ch::c-4')
  })
})

describe('le chat chiuse non ricevono più giri né compiti (c-310, 20/10: c-13 e c-15)', () => {
  async function attendi(condizione: () => boolean): Promise<void> {
    for (let i = 0; i < 120 && !condizione(); i += 1) await new Promise((r) => setTimeout(r, 25))
  }
  /** Le copie come sul disco vero: quelle che non esistono mancano. */
  const copiaVera = (c: string): 'ok' | 'mancante' | 'non-git' => statoCopia(gitFinto, c)
  const criterioRosso = [{ descrizione: 'I test passano', comando: 'node t.js', soddisfatto: false }]
  /** Un supervisore che conta le chiamate e dice sempre «prosegui», come il 20/10. */
  function supervisoreContato(mosse = ''): { interroga: Interrogazione; chiamate: () => number } {
    let n = 0
    return {
      interroga: () => { n += 1; return Promise.resolve({ testo: `{"azione": "prosegui", "istruzioni": "Correggi i test rossi", "perche": "rosso"${mosse}}` }) },
      chiamate: () => n
    }
  }
  function flotta(chats: ChatGovernata[]): void {
    archivio.scrivi({
      ...nuovoAutopilota({ id: 'ap-cc', nome: 'Cc', obiettivo: 'o', cwd: process.cwd(), criteri: criterioRosso, iniziatoIl: '2026-08-09T10:00:00.000Z' }),
      stato: 'lavoro',
      ramoBase: 'main',
      chats
    })
  }

  it('chat finita con un criterio rosso: la fine turno non chiama il supervisore e non misura i criteri', async () => {
    const sup = supervisoreContato()
    let misure = 0
    server = ambiente({ git: gitFinto, copia: copiaVera, limiti: LIMITI_LIBERI, interroga: sup.interroga, esegui: () => { misure += 1; return Promise.resolve({ codice: 1, uscita: 'rosso' }) } })
    await avvia(server)
    flotta([
      { id: 'c-15', compito: 'Elimina workspace', stato: 'finita', cicli: 9, ruolo: 'sviluppo', ramo: 'ap/ap-cc/c-15', cartella: process.cwd(), sessionId: 's-15' },
      { id: 'c-16', compito: 'Altro', stato: 'lavoro', cicli: 1, ruolo: 'sviluppo', ramo: 'ap/ap-cc/c-16', cartella: process.cwd() }
    ])
    for (let i = 0; i < 3; i += 1) {
      const r = await chiama('POST', '/hook/stop?ap=ap-cc&chat=c-15', eventoStop({ session_id: 's-15', last_assistant_message: 'ok' }))
      expect(r.dati).toEqual({})
    }
    expect(sup.chiamate()).toBe(0)
    expect(misure).toBe(0)
    expect(archivio.leggi('ap-cc')!.chats.find((c) => c.id === 'c-15')?.cicli).toBe(9)
  })

  it('chat al lavoro con la copia che non c’è più: si chiude, senza supervisore', async () => {
    const sup = supervisoreContato()
    server = ambiente({ git: gitFinto, copia: copiaVera, limiti: LIMITI_LIBERI, interroga: sup.interroga, esegui: () => Promise.resolve({ codice: 1, uscita: 'rosso' }) })
    await avvia(server)
    flotta([{ id: 'c-13', compito: 'Notifiche', stato: 'lavoro', cicli: 4, ruolo: 'sviluppo', ramo: 'ap/ap-cc/c-13', cartella: join(process.cwd(), 'non-esiste-c-13') }])
    const r = await chiama('POST', '/hook/stop?ap=ap-cc&chat=c-13', eventoStop({ session_id: 's-13', last_assistant_message: 'ok' }))
    expect(r.dati).toEqual({})
    expect(sup.chiamate()).toBe(0)
    const a = archivio.leggi('ap-cc')!
    expect(a.chats[0]?.stato).toBe('finita')
    expect(a.decisioni.map((d) => d.cosa).join(' | ')).toContain('chiudo la chat c-13: la sua copia del progetto non c’è più')
  })

  it('la copia che non è più un repository git conta come mancante', async () => {
    const sup = supervisoreContato()
    // git risale a un altro repository: la cartella è rimasta senza `.git`.
    const gitAltrove: Git = (args, cwd) => (args.join(' ') === 'rev-parse --show-toplevel' ? { codice: 0, uscita: join(cwd, '..') } : gitFinto(args, cwd))
    server = ambiente({ git: gitAltrove, copia: (c) => statoCopia(gitAltrove, c), limiti: LIMITI_LIBERI, interroga: sup.interroga, esegui: () => Promise.resolve({ codice: 1, uscita: 'rosso' }) })
    await avvia(server)
    flotta([{ id: 'c-13', compito: 'Notifiche', stato: 'lavoro', cicli: 4, ruolo: 'sviluppo', ramo: 'ap/ap-cc/c-13', cartella: process.cwd() }])
    await chiama('POST', '/hook/stop?ap=ap-cc&chat=c-13', eventoStop({ session_id: 's-13', last_assistant_message: 'ok' }))
    expect(sup.chiamate()).toBe(0)
    expect(archivio.leggi('ap-cc')!.decisioni.map((d) => d.cosa).join(' | ')).toContain('non è più un repository git')
  })

  it('la notifica di una chat finita non diventa un compito per lei', async () => {
    const sup = supervisoreContato()
    server = ambiente({ git: gitFinto, copia: copiaVera, limiti: LIMITI_LIBERI, interroga: sup.interroga })
    await avvia(server)
    flotta([
      { id: 'c-15', compito: 'Elimina workspace', stato: 'finita', cicli: 9, ruolo: 'sviluppo', ramo: 'ap/ap-cc/c-15', cartella: process.cwd(), sessionId: 's-15' },
      { id: 'c-16', compito: 'Altro', stato: 'lavoro', cicli: 1, ruolo: 'sviluppo', ramo: 'ap/ap-cc/c-16', cartella: process.cwd() }
    ])
    await chiama('POST', '/hook/notification?ap=ap-cc&chat=c-15', {
      session_id: 's-15', hook_event_name: 'Notification', notification_type: 'idle_prompt', message: 'Claude is waiting for your input'
    })
    expect(sup.chiamate()).toBe(0)
    expect(chatAvviate.some((c) => c.id === 'c-15')).toBe(false)
  })

  it('il lavoro che resta dopo l’ultimo giro va a una chat nuova con un ramo, mai a quella finita', async () => {
    const sup = supervisoreContato()
    server = ambiente({ git: gitFinto, copia: copiaVera, limiti: LIMITI_LIBERI, interroga: sup.interroga, esegui: () => Promise.resolve({ codice: 1, uscita: 'rosso' }) })
    await avvia(server)
    // L'ultimo giro: la chat approvata è rimessa al lavoro, ma il suo ramo è
    // unito e la sua cartella tolta.
    flotta([{ id: 'c-1', compito: 'Notifiche', stato: 'lavoro', cicli: 4, ruolo: 'sviluppo', ramo: 'ap/ap-cc/c-1', cartella: join(process.cwd(), 'non-esiste-c-1'), approvata: true }])
    const r = await chiama('POST', '/hook/stop?ap=ap-cc&chat=c-1', eventoStop({ session_id: 's-1', last_assistant_message: 'fatto' }))
    expect(r.dati).toEqual({})
    await attendi(() => archivio.leggi('ap-cc')!.chats.length === 2)
    const a = archivio.leggi('ap-cc')!
    expect(a.chats.find((c) => c.id === 'c-1')?.stato).toBe('finita')
    const nuova = a.chats.find((c) => c.id !== 'c-1')
    expect(nuova?.compito).toContain('Correggi i test rossi')
    expect(nuova?.ramo).toBeDefined()
    expect(chatAvviate.some((c) => c.id === 'c-1')).toBe(false)
  })

  it('chiudiChat su una chat già finita ferma il suo processo e lo scrive', async () => {
    const sup = supervisoreContato(', "mosse": [{"tipo": "chiudiChat", "chat": "c-15"}]')
    server = ambiente({ git: gitFinto, copia: copiaVera, limiti: LIMITI_LIBERI, interroga: sup.interroga, esegui: () => Promise.resolve({ codice: 1, uscita: 'rosso' }) })
    await avvia(server)
    flotta([
      { id: 'c-15', compito: 'Elimina workspace', stato: 'finita', cicli: 9, ruolo: 'sviluppo', ramo: 'ap/ap-cc/c-15', cartella: process.cwd(), sessionId: 's-15' },
      { id: 'c-16', compito: 'Altro', stato: 'lavoro', cicli: 1, ruolo: 'sviluppo', ramo: 'ap/ap-cc/c-16', cartella: process.cwd() }
    ])
    await chiama('POST', '/hook/stop?ap=ap-cc&chat=c-16', eventoStop({ session_id: 's-16', last_assistant_message: 'avanti' }))
    await attendi(() => fermati.includes('ap-cc::c-15'))
    expect(fermati).toEqual(['ap-cc::c-15'])
    expect(archivio.leggi('ap-cc')!.decisioni.map((d) => d.cosa).join(' | ')).toContain('c-15 era già finita: fermo il suo processo')
  })

  it('Revisione: chiusa per copia mancante, i compiti in coda partono subito', async () => {
    const sup = supervisoreContato()
    server = ambiente({ git: gitFinto, copia: copiaVera, limiti: LIMITI_LIBERI, interroga: sup.interroga })
    await avvia(server)
    flotta([{ id: 'c-13', compito: 'Notifiche', stato: 'lavoro', cicli: 4, ruolo: 'sviluppo', ramo: 'ap/ap-cc/c-13', cartella: join(process.cwd(), 'non-esiste-c-13') }])
    archivio.scrivi({ ...archivio.leggi('ap-cc')!, compitiDaFare: ['Il pezzo dopo'] })
    await chiama('POST', '/hook/stop?ap=ap-cc&chat=c-13', eventoStop({ session_id: 's-13', last_assistant_message: 'ok' }))
    await attendi(() => archivio.leggi('ap-cc')!.chats.length === 2)
    const nuova = archivio.leggi('ap-cc')!.chats.find((c) => c.id !== 'c-13')
    expect(nuova?.compito).toBe('Il pezzo dopo')
    expect(chatAvviate.some((c) => c.compito === 'Il pezzo dopo')).toBe(true)
  })

  it('Revisione: un revisore senza la cartella dell’autore dà lo stesso il suo verdetto', async () => {
    const sup = supervisoreContato()
    server = ambiente({ git: gitFinto, copia: copiaVera, limiti: LIMITI_LIBERI, interroga: sup.interroga })
    await avvia(server)
    const via = join(process.cwd(), 'non-esiste-c-1')
    flotta([
      { id: 'c-1', compito: 'A', stato: 'finita', cicli: 2, ruolo: 'sviluppo', ramo: 'ap/ap-cc/c-1', cartella: via },
      { id: 'c-2', compito: 'Rivedi il ramo ap/ap-cc/c-1 della chat c-1 («A»)', stato: 'lavoro', cicli: 0, ruolo: 'revisione', revisioneDi: 'c-1', cartella: via }
    ])
    const r = await chiama('POST', '/hook/stop?ap=ap-cc&chat=c-2', eventoStop({ session_id: 's-2', last_assistant_message: 'Guardato tutto.' }))
    // Senza la riga del verdetto la Revisione glielo chiede: non è stata chiusa per la copia.
    expect(r.dati.decision).toBe('block')
    expect(String(r.dati.reason)).toContain('REVISIONE: OK')
    expect(archivio.leggi('ap-cc')!.chats.find((c) => c.id === 'c-2')?.stato).toBe('lavoro')
  })

  it('Revisione: il «sì» tardivo alla pubblicazione arriva alla chat anche se il lavoro l’aveva chiusa', async () => {
    server = ambiente({ scadenzaDomandaMs: 150 })
    await avvia(server)
    const id = await creaAp({ pubblicazione: 'stabile', vaSulCloud: true })
    archivio.scrivi({ ...archivio.leggi(id)!, chats: [{ id: 'c-1', compito: 'tutto', stato: 'lavoro', cicli: 1, sessionId: 's-1' }] })
    await chiama('POST', `/hook/stop?ap=${id}&chat=c-1`, eventoStop())
    await attendi(() => archivio.leggi(id)?.stato === 'finito')
    expect(archivio.leggi(id)!.chats[0]?.stato).toBe('finita')
    const aperte = (await chiama('GET', '/domande')).dati
    await chiama('POST', `/domande/${aperte[0].id}/risposta`, { risposta: 'sì, vai' })
    await attendi(() => chatAvviate.some((c) => c.id === 'c-1'))
    expect(chatAvviate.some((c) => c.id === 'c-1')).toBe(true)
    expect(messaggiDiRipresa.some((m) => m.includes('pubblica'))).toBe(true)
  })
})
