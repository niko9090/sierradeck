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
    apriChat: () => undefined,
    cartelle: () => Promise.resolve(['C:\\lavoro', 'C:\\casa']),
    workspace: () => Promise.resolve({ nomi: ['lavoro', 'casa'], attivo: 'lavoro' }),
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
      { id: 's-1', cwd: 'C:\\lavoro', titolo: 'Il lettore di CSV', quando: '2026-08-13T10:00:00.000Z' }
    ]),
    riprendiSessione: () => undefined,
    creaWorkspace: () => Promise.resolve(),
    eliminaWorkspace: () => Promise.resolve(),
    salvataggi: () => Promise.resolve([{ nome: 'Ultima chiusura', quando: '2026-08-13T09:32:00.000Z', chat: 8 }]),
    caricaIstantanea: () => Promise.resolve(),
    consumi: () => Promise.resolve({ oggi: { costo: 3.2, token: 120000 } }),
    quaderno: () => [{ file: 'notte.md', titolo: 'Come e andata la notte', quando: '2026-08-13T06:00:00.000Z' }],
    scheda: () => ({ file: 'notte.md', titolo: 'Come e andata la notte', corpo: 'tutto verde alle 4', quando: '' }),
    impostaPreferenze: () => Promise.resolve(),
    aggiornamento: () => ({ fase: 'fermo' as const }),
    cercaAggiornamento: () => undefined,
    scaricaAggiornamento: () => undefined,
    installaAggiornamento: () => undefined,
    versione: '0.5.0',
    apk: () => Promise.resolve({ versione: '1.0.2', url: 'https://x/SierraDeck-1.0.2.apk' }),
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

  it('non rivela mai il codice di accoppiamento ne se la finestra e aperta', async () => {
    // Il codice si legge sullo schermo del computer: e' tutta la sicurezza che
    // c'e', e servirlo dalla rete la annullerebbe. Nemmeno il fatto che la
    // finestra sia aperta va detto: e' il segnale a un estraneo di quando provare.
    const d = deps()
    const { codice } = d.dispositivi.apriAccoppiamento()
    const r = await rotteLibere(d)({ metodo: 'GET', percorso: '/api/ciao', corpo: undefined })
    expect(JSON.stringify(r.corpo)).not.toContain(codice)
    expect((r.corpo as Record<string, unknown>).accoppiamentoAperto).toBeUndefined()
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

describe('l app da scaricare', () => {
  it('si chiede senza chiave, perche' + "'" + ' serve prima di collegarsi', async () => {
    const r = await rotteLibere(deps())({ metodo: 'GET', percorso: '/api/app', corpo: undefined })
    expect(r.stato).toBe(200)
    expect((r.corpo as Record<string, unknown>).versione).toBe('1.0.2')
  })

  it('senza APK risponde vuoto invece di rompersi', async () => {
    const r = await rotteLibere(deps({ apk: () => Promise.resolve(undefined) }))(
      { metodo: 'GET', percorso: '/api/app', corpo: undefined }
    )
    expect(r.corpo).toEqual({})
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

  it('non lascia cambiare dalla rete le preferenze di rete', async () => {
    // Un dispositivo accoppiato non deve poter aprire il muro (clientOltreLaRete)
    // o spostare le porte: sono le impostazioni che difendono un programma che
    // esegue codice, e si cambiano solo dal computer. Le altre — tema, viste —
    // restano libere.
    let ricevute: Record<string, unknown> | undefined
    const r = await rotteClient(deps({
      impostaPreferenze: (p) => { ricevute = p; return Promise.resolve() }
    }))({
      metodo: 'POST',
      percorso: '/api/preferenze',
      corpo: { tema: 'scuro', clientOltreLaRete: true, portaClient: 1, portaAutopiloti: 2 }
    })
    expect(r.stato).toBe(200)
    expect(ricevute).toEqual({ tema: 'scuro' })
  })

  it('fa guardare dentro una chat, non solo il titolo', async () => {
    // Sapere che «si muove» non basta per decidere se serve intervenire:
    // servono le righe.
    const chat = [{ id: 'p-1', titolo: 'Gestore', cwd: 'C:\\p', coda: ['npm test', '3 falliti'] }]
    const r = await rotteClient(deps({ chat: () => chat }))(
      { metodo: 'POST', percorso: '/api/dentro', corpo: { chat: 'p-1' } }
    )
    expect((r.corpo as { righe: string[] }).righe).toEqual(['npm test', '3 falliti'])
  })

  // ── Rispondere a un riquadro di scelta, dal telefono ────────────────────
  //
  // Il difetto: dentro una chat c'era un campo di testo e basta. Quando Claude
  // Code disegna un elenco di scelte non aspetta parole, aspetta frecce e
  // invio — e su un telefono quei tasti non esistono. Si leggeva la domanda,
  // si sapeva la risposta, e non c'era niente da toccare.

  const SCHERMO = [
    'Vuoi riprendere la conversazione?',
    '',
    '❯ 1. Si, riprendi',
    '  2. No, comincia da capo'
  ]

  it('le scelte arrivano insieme alle righe: dal telefono diventano pulsanti', async () => {
    const chat = [{ id: 'p-1', titolo: 'Gestore', cwd: 'C:\p', coda: SCHERMO }]
    const r = await rotteClient(deps({ chat: () => chat }))(
      { metodo: 'POST', percorso: '/api/dentro', corpo: { chat: 'p-1' } }
    )
    const scelte = (r.corpo as { scelte?: { opzioni: { testo: string }[] } }).scelte
    expect(scelte?.opzioni.map((o) => o.testo)).toEqual(['Si, riprendi', 'No, comincia da capo'])
  })

  it('un terminale che non chiede niente non offre pulsanti', async () => {
    const chat = [{ id: 'p-1', titolo: 'Gestore', cwd: 'C:\p', coda: ['npm test', '3 falliti'] }]
    const r = await rotteClient(deps({ chat: () => chat }))(
      { metodo: 'POST', percorso: '/api/dentro', corpo: { chat: 'p-1' } }
    )
    expect((r.corpo as { scelte?: unknown }).scelte).toBeUndefined()
  })

  it('scegliere manda le frecce e l invio, contati sullo schermo di adesso', async () => {
    const chat = [{ id: 'p-1', titolo: 'Gestore', cwd: 'C:\p', coda: SCHERMO }]
    let scritto: string | undefined
    const r = await rotteClient(deps({
      chat: () => chat,
      scriviAChat: (_id, t) => { scritto = t }
    }))({ metodo: 'POST', percorso: '/api/scegli', corpo: { chat: 'p-1', opzione: 'No, comincia da capo' } })
    expect(r.stato).toBe(200)
    // Una freccia giu': il cursore era sulla prima. L'invio lo aggiunge chi
    // scrive nel terminale, dopo una pausa — frecce e invio nello stesso blocco
    // sono un incollato, e un elenco non legge un incollato come tasti premuti.
    expect(scritto).toBe('[B')
  })

  it('gia sull opzione giusta: nessuna freccia, resta il solo invio', async () => {
    const chat = [{ id: 'p-1', titolo: 'Gestore', cwd: 'C:\p', coda: SCHERMO }]
    let scritto: string | undefined
    await rotteClient(deps({
      chat: () => chat,
      scriviAChat: (_id, t) => { scritto = t }
    }))({ metodo: 'POST', percorso: '/api/scegli', corpo: { chat: 'p-1', opzione: 'Si, riprendi' } })
    expect(scritto).toBe('')
  })

  it('IL PUNTO: se la domanda e cambiata non si preme niente', async () => {
    // Fra quando la pagina ha letto le opzioni e quando il pollice arriva
    // possono passare secondi. Contare le frecce sulla domanda vecchia vorrebbe
    // dire premere invio su un'opzione che nessuno ha scelto — e quelle opzioni,
    // quasi sempre, concedono un permesso.
    const chat = [{ id: 'p-1', titolo: 'Gestore', cwd: 'C:\p', coda: [
      '  1. Cancello tutto',
      '❯ 2. Non cancellare niente'
    ] }]
    let scritto: string | undefined
    const r = await rotteClient(deps({
      chat: () => chat,
      scriviAChat: (_id, t) => { scritto = t }
    }))({ metodo: 'POST', percorso: '/api/scegli', corpo: { chat: 'p-1', opzione: 'Si, riprendi' } })
    expect(r.stato).toBe(409)
    expect(scritto).toBeUndefined()
  })

  it('una chat che non c e piu non fa premere niente', async () => {
    const r = await rotteClient(deps())(
      { metodo: 'POST', percorso: '/api/scegli', corpo: { chat: 'mai-esistita', opzione: 'Si' } }
    )
    expect(r.stato).toBe(404)
  })

  it('non manda le righe nell elenco, che si chiede ogni due secondi', async () => {
    // Quattordici righe per chat ogni due secondi sono decine di kilobyte al
    // minuto sulla rete del telefono, per righe che nessuno sta guardando.
    const chat = [{ id: 'p-1', titolo: 'Gestore', cwd: 'C:\\p', coda: ['segreto lunghissimo'] }]
    const r = await rotteClient(deps({ chat: () => chat }))(
      { metodo: 'GET', percorso: '/api/stato', corpo: undefined }
    )
    expect(JSON.stringify(r.corpo)).not.toContain('segreto lunghissimo')
  })

  it('apre una chat in una cartella conosciuta, e rifiuta quelle che non esistono', async () => {
    // **La regola e' cambiata di proposito.** Prima erano ammesse solo le
    // cartelle gia' conosciute, e la motivazione era che un percorso qualunque
    // arrivato dalla rete aprirebbe una sessione dove capita. A guardarla bene
    // non reggeva: chi ha la chiave puo' gia' scrivere in una chat, cioe' far
    // eseguire qualunque comando in qualunque cartella. Non era un muro, era un
    // impaccio — e impediva di aprire un progetto nuovo dal telefono.
    //
    // Il muro resta l'accoppiamento. Qui si controlla quello che si puo'
    // controllare davvero: che la cartella esista.
    let aperta = ''
    const su = deps({ apriChat: (c) => { aperta = c } })
    const conosciuta = 'C:' + String.fromCharCode(92) + 'lavoro'
    const inventata = 'C:' + String.fromCharCode(92) + 'non-esiste'
    const buona = await rotteClient(su)(
      { metodo: 'POST', percorso: '/api/apri', corpo: { cartella: conosciuta } }
    )
    expect(buona.stato).toBe(200)
    expect(aperta).toBe(conosciuta)

    // Senza `cartellaEsiste` fra le dipendenze una cartella non conosciuta non
    // si puo' verificare: non si apre, e si dice che non c'e'.
    const cattiva = await rotteClient(su)(
      { metodo: 'POST', percorso: '/api/apri', corpo: { cartella: inventata } }
    )
    expect(cattiva.stato).toBe(404)
    expect(aperta).toBe(conosciuta)
  })

  it('crea un autopilota, nella sola cartella che il computer conosce', async () => {
    // Delegare un lavoro e' la cosa piu' utile che si possa fare da fermi, in
    // piedi, con una mano sola: le domande della preparazione arrivano poi
    // sullo stesso telefono, e si risponde da li'.
    const creati: { obiettivo: string; cartella: string }[] = []
    const su = deps({
      creaAutopilota: (obiettivo, cartella) => {
        creati.push({ obiettivo, cartella })
        return Promise.resolve({ id: 'ap-9' })
      }
    })
    const buona = await rotteClient(su)({
      metodo: 'POST',
      percorso: '/api/autopilota/crea',
      corpo: { obiettivo: 'Sistema il lettore di CSV', cartella: 'C:\\lavoro' }
    })
    expect(buona.stato).toBe(200)
    expect(creati).toEqual([{ obiettivo: 'Sistema il lettore di CSV', cartella: 'C:\\lavoro' }])

    // La stessa regola di «apri»: una cartella qualunque arrivata dalla rete
    // manderebbe un agente a lavorare dove capita.
    const fuori = await rotteClient(su)({
      metodo: 'POST',
      percorso: '/api/autopilota/crea',
      corpo: { obiettivo: 'x', cartella: 'C:\Windows\System32' }
    })
    expect(fuori.stato).toBe(403)
    expect(creati).toHaveLength(1)
  })

  it('senza obiettivo non crea niente', async () => {
    const creati: string[] = []
    const su = deps({
      creaAutopilota: (o) => { creati.push(o); return Promise.resolve({ id: 'ap-9' }) }
    })
    const r = await rotteClient(su)({
      metodo: 'POST', percorso: '/api/autopilota/crea', corpo: { cartella: 'C:\lavoro' }
    })
    expect(r.stato).toBe(400)
    expect(creati).toEqual([])
  })

  it('non cancella niente che non si possa riavere', async () => {
    // La regola e' cambiata, e non e' un cedimento: da un telefono adesso si
    // governa tutto - si chiude una chat, si elimina un autopilota - perche' un
    // telefono da cui non si puo' togliere niente e' mezzo strumento. Il muro
    // sta nel gesto, che la pagina chiede due volte.
    //
    // Quello che resta impossibile e' cio' che non si puo' riavere: nessuna
    // rotta cancella una conversazione dal disco, e chiudere una chat la lascia
    // li' dov'e' - la si riprende quando si vuole.
    for (const percorso of ['/api/sessione/elimina', '/api/cancella', '/api/chat/distruggi']) {
      const r = await rotteClient(deps())({ metodo: 'POST', percorso, corpo: { chat: 'p-1' } })
      expect(r.stato, percorso).toBe(404)
    }
  })
})

describe('vedere le stesse cose, con gli stessi colori', () => {
  it('dice al telefono i colori del computer', async () => {
    // «Voglio vedere TUTTO nello stesso modo e con la stessa grafica»: i colori
    // non si riscrivono a mano nella pagina, si chiedono. Cosi' il telefono
    // segue il chiarore e lo stile scelti nelle impostazioni, invece di essere
    // una copia somigliante che invecchia da sola.
    const r = await rotteClient(deps())({ metodo: 'GET', percorso: '/api/stile', corpo: undefined })
    const c = r.corpo as Record<string, unknown>
    expect(r.stato).toBe(200)
    const token = c.token as Record<string, string>
    expect(token['--fondo']).toMatch(/^#[0-9a-f]{6}$/)
    expect(token['--verde']).toBeDefined()
    expect(c.stile).toBeDefined()
  })

  it('manda lo stato intero di un autopilota, non solo il titolo', async () => {
    // Sul telefono si vedeva nome, stato e due numeri. Per capire davvero cosa
    // sta succedendo servono i criteri, cosa ha deciso e a che punto e': le
    // stesse cose che il pannello mostra al computer.
    const r = await rotteClient(deps())({
      metodo: 'POST', percorso: '/api/autopilota', corpo: { autopilota: 'ap-1' }
    })
    const a = r.corpo as Record<string, unknown>
    expect(r.stato).toBe(200)
    expect(a.criteri).toBeInstanceOf(Array)
    expect(a.decisioni).toBeInstanceOf(Array)
    expect(a.passaggi).toBeInstanceOf(Array)
    expect(a.misura).toMatchObject({ percento: expect.any(Number) })
  })

  it('di un autopilota che non c e lo dice, invece di mandare niente', async () => {
    const r = await rotteClient(deps())({
      metodo: 'POST', percorso: '/api/autopilota', corpo: { autopilota: 'mai-esistito' }
    })
    expect(r.stato).toBe(404)
  })
})

describe('fare tutto, anche le cose che si disfano', () => {
  it('elimina un autopilota', async () => {
    // Prima non si poteva: «un tocco sbagliato in tram non deve buttare via il
    // lavoro della notte». Adesso si puo', ma la pagina lo chiede due volte —
    // il muro sta nel gesto, non nell'assenza del comando.
    const eliminati: string[] = []
    const r = await rotteClient(deps({ eliminaAutopilota: (id) => { eliminati.push(id); return Promise.resolve() } }))(
      { metodo: 'POST', percorso: '/api/autopilota/elimina', corpo: { autopilota: 'ap-1' } }
    )
    expect(r.stato).toBe(200)
    expect(eliminati).toEqual(['ap-1'])
  })

  it('decide se un autopilota riparte da solo dopo un riavvio', async () => {
    const scelte: { id: string; riprendi: boolean }[] = []
    const su = deps({ riprendiAlRiavvio: (id, riprendi) => { scelte.push({ id, riprendi }); return Promise.resolve() } })
    await rotteClient(su)({ metodo: 'POST', percorso: '/api/autopilota/riavvio', corpo: { autopilota: 'ap-1', riprendi: false } })
    expect(scelte).toEqual([{ id: 'ap-1', riprendi: false }])
  })

  it('chiude una chat', async () => {
    const chiuse: string[] = []
    const su = deps({ chiudiChat: (id) => { chiuse.push(id) } })
    const r = await rotteClient(su)({ metodo: 'POST', percorso: '/api/chat/chiudi', corpo: { chat: 'p-1' } })
    expect(r.stato).toBe(200)
    expect(chiuse).toEqual(['p-1'])
  })

  it('da un nome a una chat', async () => {
    const nomi: { chat: string; nome: string }[] = []
    const su = deps({ rinominaChat: (chat, nome) => { nomi.push({ chat, nome }) } })
    await rotteClient(su)({ metodo: 'POST', percorso: '/api/chat/nome', corpo: { chat: 'p-1', nome: 'Il gioco' } })
    expect(nomi).toEqual([{ chat: 'p-1', nome: 'Il gioco' }])
  })

  it('senza il pezzo che serve, rifiuta invece di fare danni', async () => {
    for (const [percorso, corpo] of [
      ['/api/autopilota/elimina', {}],
      ['/api/chat/chiudi', {}],
      ['/api/chat/nome', { chat: 'p-1' }]
    ] as [string, unknown][]) {
      const r = await rotteClient(deps())({ metodo: 'POST', percorso, corpo })
      expect(r.stato, percorso).toBe(400)
    }
  })
})

describe('riprendere una conversazione, e i workspace per intero', () => {
  it('elenca le conversazioni che si possono riprendere', async () => {
    // Al computer si riprende una chat esistente con «Riprendi». Dal telefono
    // non si poteva: si apriva una conversazione nuova nella cartella, e tutto
    // quello che c'era dentro restava da un'altra parte.
    const r = await rotteClient(deps())({ metodo: 'GET', percorso: '/api/sessioni', corpo: undefined })
    const c = r.corpo as { sessioni: { id: string; cwd: string; titolo: string }[] }
    expect(r.stato).toBe(200)
    expect(c.sessioni[0]).toMatchObject({ id: 's-1', cwd: 'C:\\lavoro' })
  })

  it('riprende una conversazione in una cartella conosciuta', async () => {
    const riprese: { cwd: string; sessione: string }[] = []
    const su = deps({
      riprendiSessione: (cwd, sessione) => { riprese.push({ cwd, sessione }) }
    })
    const r = await rotteClient(su)({
      metodo: 'POST', percorso: '/api/sessioni/riprendi', corpo: { cartella: 'C:\\lavoro', sessione: 's-1' }
    })
    expect(r.stato).toBe(200)
    expect(riprese).toEqual([{ cwd: 'C:\\lavoro', sessione: 's-1' }])
  })

  it('non riprende una conversazione in una cartella che il computer non conosce', async () => {
    // La stessa regola di «apri»: un percorso qualunque arrivato dalla rete
    // aprirebbe una sessione dove capita.
    const r = await rotteClient(deps())({
      metodo: 'POST', percorso: '/api/sessioni/riprendi', corpo: { cartella: 'C:\\Windows', sessione: 's-1' }
    })
    expect(r.stato).toBe(403)
  })

  it('crea ed elimina un workspace', async () => {
    const fatti: string[] = []
    const su = deps({
      creaWorkspace: (n) => { fatti.push('crea:' + n); return Promise.resolve() },
      eliminaWorkspace: (n) => { fatti.push('elimina:' + n); return Promise.resolve() }
    })
    await rotteClient(su)({ metodo: 'POST', percorso: '/api/workspace/crea', corpo: { nome: 'sera' } })
    await rotteClient(su)({ metodo: 'POST', percorso: '/api/workspace/elimina', corpo: { nome: 'sera' } })
    expect(fatti).toEqual(['crea:sera', 'elimina:sera'])
  })

  it('elenca i salvataggi e ne carica uno', async () => {
    const caricati: string[] = []
    const su = deps({ caricaIstantanea: (n) => { caricati.push(n); return Promise.resolve() } })
    const elenco = await rotteClient(su)({ metodo: 'GET', percorso: '/api/salvataggi', corpo: undefined })
    expect((elenco.corpo as { salvataggi: unknown[] }).salvataggi).toBeInstanceOf(Array)
    await rotteClient(su)({ metodo: 'POST', percorso: '/api/salvataggi/carica', corpo: { nome: 'Ultima chiusura' } })
    expect(caricati).toEqual(['Ultima chiusura'])
  })
})

describe('i consumi, il quaderno, le preferenze e l aggiornamento', () => {
  it('dice quanto si e consumato', async () => {
    // È una delle cose che si guardano più volentieri da fuori: quanto sta
    // costando la giornata mentre gli autopiloti lavorano da soli.
    const r = await rotteClient(deps())({ metodo: 'GET', percorso: '/api/consumi', corpo: undefined })
    expect(r.stato).toBe(200)
    expect(r.corpo).toMatchObject({ oggi: expect.anything() })
  })

  it('elenca le schede del quaderno di una cartella conosciuta', async () => {
    const r = await rotteClient(deps())({
      metodo: 'POST', percorso: '/api/quaderno', corpo: { cartella: 'C:\\lavoro' }
    })
    const c = r.corpo as { schede: { titolo: string }[] }
    expect(r.stato).toBe(200)
    expect(c.schede[0]).toMatchObject({ titolo: 'Come e andata la notte' })
  })

  it('e ne legge una', async () => {
    const r = await rotteClient(deps())({
      metodo: 'POST', percorso: '/api/quaderno/scheda', corpo: { cartella: 'C:\\lavoro', file: 'notte.md' }
    })
    expect(r.stato).toBe(200)
    expect((r.corpo as { corpo: string }).corpo).toContain('tutto verde')
  })

  it('il quaderno solo delle cartelle che il computer conosce', async () => {
    const r = await rotteClient(deps())({
      metodo: 'POST', percorso: '/api/quaderno', corpo: { cartella: 'C:\\Windows' }
    })
    expect(r.stato).toBe(403)
  })

  it('legge e cambia le preferenze', async () => {
    const cambi: unknown[] = []
    const su = deps({ impostaPreferenze: (p) => { cambi.push(p); return Promise.resolve() } })
    const letto = await rotteClient(su)({ metodo: 'GET', percorso: '/api/preferenze', corpo: undefined })
    expect((letto.corpo as { preferenze: { stile: string } }).preferenze.stile).toBeDefined()
    await rotteClient(su)({ metodo: 'POST', percorso: '/api/preferenze', corpo: { stile: 'foglio', chiarore: 40 } })
    expect(cambi[0]).toMatchObject({ stile: 'foglio', chiarore: 40 })
  })

  it('dice se il computer ha un aggiornamento, e lo installa', async () => {
    const fatti: string[] = []
    const su = deps({
      aggiornamento: () => ({ fase: 'disponibile', versione: '0.9.20' }),
      cercaAggiornamento: () => { fatti.push('cerca') },
      scaricaAggiornamento: () => { fatti.push('scarica') },
      installaAggiornamento: () => { fatti.push('installa') }
    })
    const stato = await rotteClient(su)({ metodo: 'GET', percorso: '/api/aggiornamento', corpo: undefined })
    expect(stato.corpo).toMatchObject({ fase: 'disponibile', versione: '0.9.20' })
    // Cercare a comando: il computer guarda da se' ogni sei ore, ma da un
    // telefono quell'attesa e' cieca — non si vede il tasto del computer, e
    // non si sa nemmeno se stia guardando.
    await rotteClient(su)({ metodo: 'POST', percorso: '/api/aggiornamento/cerca', corpo: {} })
    await rotteClient(su)({ metodo: 'POST', percorso: '/api/aggiornamento/scarica', corpo: {} })
    await rotteClient(su)({ metodo: 'POST', percorso: '/api/aggiornamento/installa', corpo: {} })
    expect(fatti).toEqual(['cerca', 'scarica', 'installa'])
  })
})

describe('il via dal telefono', () => {
  it('da il via a un autopilota pronto', async () => {
    // L'avviso «pronto, aspetto il tuo via» arriva mentre si e' fuori: senza
    // questo tasto il lavoro resterebbe fermo fino al ritorno alla scrivania.
    let partito: string | undefined
    const r = await rotteClient(deps({ vaiAutopilota: (id) => { partito = id; return Promise.resolve() } }))(
      { metodo: 'POST', percorso: '/api/autopilota/vai', corpo: { autopilota: 'ap-1' } } as never
    )
    expect(r?.stato).toBe(200)
    expect(partito).toBe('ap-1')
  })

  it('senza autopilota non fa niente', async () => {
    let chiamato = false
    const r = await rotteClient(deps({ vaiAutopilota: () => { chiamato = true; return Promise.resolve() } }))(
      { metodo: 'POST', percorso: '/api/autopilota/vai', corpo: {} } as never
    )
    expect(r?.stato).toBe(400)
    expect(chiamato).toBe(false)
  })
})


describe('la storia di una chat', () => {
  it('da la finestra chiesta, con il totale', async () => {
    const su = deps({
      chat: () => [{ id: 'c1', titolo: 'x', cwd: '/p' }],
      righeDi: async (_id: string, da: number, quante: number) => ({
        totale: 900,
        da: da < 0 ? 900 - quante : da,
        pulite: ['una', 'due'],
        grezze: ['una', 'due']
      })
    })
    const esito = await rotteClient(su)({
      metodo: 'POST',
      percorso: '/api/storia',
      corpo: { chat: 'c1', da: -1, quante: 150 }
    })
    expect(esito.stato).toBe(200)
    expect(esito.corpo).toMatchObject({ totale: 900, da: 750, righe: ['una', 'due'] })
  })

  it('senza una finestra che risponda, torna quello che ha l elenco', async () => {
    // Nessuna finestra ha quella chat: e meglio le ultime righe gia note che
    // un errore, per una cosa che si guarda scorrendo.
    const su = deps({
      chat: () => [{ id: 'c1', titolo: 'x', cwd: '/p', coda: ['ultima'], codaGrezza: ['ultima'] }],
      righeDi: async () => undefined
    })
    const esito = await rotteClient(su)({
      metodo: 'POST',
      percorso: '/api/storia',
      corpo: { chat: 'c1' }
    })
    expect(esito.corpo).toMatchObject({ totale: 1, da: 0, righe: ['ultima'] })
  })

  it('una chat che non c e non si inventa', async () => {
    const su = deps({ chat: () => [] })
    const esito = await rotteClient(su)({
      metodo: 'POST',
      percorso: '/api/storia',
      corpo: { chat: 'mai-vista' }
    })
    expect(esito.stato).toBe(404)
  })
})

describe('il negozio e l account, da un telefono', () => {
  it('dice cosa c e in dotazione', async () => {
    const su = deps({
      negozio: async () => ({
        plugin: [{ id: 'a@m', nome: 'a', installato: true, abilitato: true }],
        skill: [{ nome: 's', abilitata: false }],
        agenti: [],
        mcp: []
      })
    })
    const esito = await rotteClient(su)({ metodo: 'GET', percorso: '/api/negozio', corpo: undefined })
    expect(esito.stato).toBe(200)
    expect((esito.corpo as { plugin: unknown[] }).plugin).toHaveLength(1)
  })

  it('senza negozio non esplode: torna quattro elenchi vuoti', async () => {
    // Un computer piu vecchio non conosce questa strada, e il telefono deve
    // trovarsi una schermata vuota, non un errore.
    const su = deps({})
    const esito = await rotteClient(su)({ metodo: 'GET', percorso: '/api/negozio', corpo: undefined })
    expect(esito.corpo).toEqual({ plugin: [], skill: [], agenti: [], mcp: [] })
  })

  it('accende la cosa giusta a seconda del «cosa»', async () => {
    const fatti: string[] = []
    const su = deps({
      commutaPlugin: async (nome: string, attivo: boolean) => { fatti.push(`plugin:${nome}:${attivo}`); return { ok: true } },
      commutaSkill: (nome: string, attivo: boolean) => { fatti.push(`skill:${nome}:${attivo}`); return { ok: true } },
      commutaMcp: (nome: string, attivo: boolean) => { fatti.push(`mcp:${nome}:${attivo}`); return { ok: true } }
    })
    await rotteClient(su)({ metodo: 'POST', percorso: '/api/negozio/commuta', corpo: { cosa: 'plugin', nome: 'a@m', attivo: true } })
    await rotteClient(su)({ metodo: 'POST', percorso: '/api/negozio/commuta', corpo: { cosa: 'skill', nome: 's', attivo: false } })
    await rotteClient(su)({ metodo: 'POST', percorso: '/api/negozio/commuta', corpo: { cosa: 'mcp', nome: 'm', attivo: true } })
    expect(fatti).toEqual(['plugin:a@m:true', 'skill:s:false', 'mcp:m:true'])
  })

  it('senza nome non tocca niente', async () => {
    const su = deps({ commutaSkill: () => ({ ok: true }) })
    const esito = await rotteClient(su)({ metodo: 'POST', percorso: '/api/negozio/commuta', corpo: { cosa: 'skill', attivo: true } })
    expect(esito.stato).toBe(400)
  })

  /**
   * La forma della risposta del negozio.
   *
   * `elencoPlugin` del modulo torna `{ plugin, errore }`, non un elenco: il CLI
   * puo' fallire e il modulo lo dice invece di fingere un negozio vuoto. Quel
   * oggetto finiva **intero** dentro il campo `plugin`, e un `as unknown[]`
   * nascondeva lo scambio al compilatore. Dall'altra parte il telefono aspetta
   * una lista: la conversione saltava, e con lei tutta la risposta — non solo i
   * plugin. Il negozio sul telefono era vuoto per questo, e nessun test lo
   * vedeva perche' nessuno guardava la **forma**.
   */
  /**
   * Aprire una chat in una cartella **nuova**.
   *
   * L'elenco chiuso delle cartelle note sembrava un muro di sicurezza e non lo
   * era: chi ha la chiave di questo computer puo' gia' scrivere in una chat,
   * cioe' far eseguire qualunque comando in qualunque cartella. Era solo un
   * impaccio, e impediva la cosa piu' normale del mondo — aprire un progetto
   * nuovo dal telefono. Il muro vero e' l'accoppiamento; qui si controlla
   * quello che si puo' controllare davvero, cioe' che la cartella esista.
   */
  it('apre anche una cartella non ancora conosciuta, se esiste', async () => {
    const su = deps({ cartelle: async () => [], cartellaEsiste: async () => true })
    const esito = await rotteClient(su)({
      metodo: 'POST', percorso: '/api/apri', corpo: { cartella: 'E:/Progetti/Nuovo' }
    })
    expect(esito.stato).toBe(200)
  })

  it('una cartella che non esiste non apre niente', async () => {
    let aperta = false
    const su = deps({
      cartelle: async () => [],
      cartellaEsiste: async () => false,
      apriChat: () => { aperta = true }
    })
    const esito = await rotteClient(su)({
      metodo: 'POST', percorso: '/api/apri', corpo: { cartella: 'E:/non/esiste' }
    })
    expect(esito.stato).toBe(404)
    expect(aperta).toBe(false)
  })

  it('sfogliare senza percorso torna i punti di partenza', async () => {
    const su = deps({
      sfoglia: async (dove) => ({
        percorso: dove,
        voci: [{ nome: 'La tua cartella', percorso: 'C:/Users/x' }],
        radici: dove === ''
      })
    })
    const esito = await rotteClient(su)({ metodo: 'POST', percorso: '/api/sfoglia', corpo: {} })
    expect((esito.corpo as { radici?: boolean }).radici).toBe(true)
  })

  it('un computer che non sa sfogliare non finge un disco vuoto', async () => {
    const esito = await rotteClient(deps({}))({ metodo: 'POST', percorso: '/api/sfoglia', corpo: {} })
    expect(esito.corpo).toEqual({ percorso: '', voci: [], radici: true })
  })

  it('il negozio manda elenchi, non oggetti travestiti da elenchi', async () => {
    const su = deps({
      negozio: async () => ({
        plugin: [{ id: 'a@b', nome: 'a' }],
        skill: [],
        agenti: [],
        mcp: []
      })
    })
    const esito = await rotteClient(su)({ metodo: 'GET', percorso: '/api/negozio', corpo: undefined })
    const corpo = esito.corpo as Record<string, unknown>
    for (const campo of ['plugin', 'skill', 'agenti', 'mcp']) {
      expect(Array.isArray(corpo[campo])).toBe(true)
    }
  })

  it('senza negozio non finge uno scaffale pieno', async () => {
    const esito = await rotteClient(deps({}))({ metodo: 'GET', percorso: '/api/negozio', corpo: undefined })
    expect(esito.corpo).toEqual({ plugin: [], skill: [], agenti: [], mcp: [] })
  })

  it('dice con quale account lavora il computer', async () => {
    const su = deps({ account: async () => ({ entrato: true, email: 'x@y.z' }) })
    const esito = await rotteClient(su)({ metodo: 'GET', percorso: '/api/account', corpo: undefined })
    expect(esito.corpo).toEqual({ entrato: true, email: 'x@y.z' })
  })

  it('senza account non inventa nessuno', async () => {
    const su = deps({})
    const esito = await rotteClient(su)({ metodo: 'GET', percorso: '/api/account', corpo: undefined })
    expect(esito.corpo).toEqual({ entrato: false })
  })

  it('si esce da lontano', async () => {
    let uscito = false
    const su = deps({ esciAccount: async () => { uscito = true } })
    const esito = await rotteClient(su)({ metodo: 'POST', percorso: '/api/account/esci', corpo: {} })
    expect(esito.stato).toBe(200)
    expect(uscito).toBe(true)
  })

  it('si entra da lontano', async () => {
    const visti: string[] = []
    const su = deps({
      entraAccount: async (email, password) => {
        visti.push(email, password)
        return { ok: true }
      }
    })
    const esito = await rotteClient(su)({
      metodo: 'POST',
      percorso: '/api/account/entra',
      corpo: { email: 'x@y.z', password: 'segreta' }
    })
    expect(esito.stato).toBe(200)
    expect(esito.corpo).toEqual({ ok: true })
    expect(visti).toEqual(['x@y.z', 'segreta'])
  })

  it('senza email o password non prova nemmeno', async () => {
    let provato = false
    const su = deps({ entraAccount: async () => { provato = true; return { ok: true } } })
    const esito = await rotteClient(su)({
      metodo: 'POST',
      percorso: '/api/account/entra',
      corpo: { email: 'x@y.z' }
    })
    expect(esito.stato).toBe(400)
    expect(provato).toBe(false)
  })

  it('una password sbagliata torna il motivo, non un errore di rete', async () => {
    // Il telefono deve poter distinguere «non sei tu» da «non ti sento»: la
    // prima si corregge digitando meglio, la seconda no.
    const su = deps({ entraAccount: async () => ({ ok: false, messaggio: 'credenziali non valide' }) })
    const esito = await rotteClient(su)({
      metodo: 'POST',
      percorso: '/api/account/entra',
      corpo: { email: 'x@y.z', password: 'sbagliata' }
    })
    expect(esito.stato).toBe(200)
    expect(esito.corpo).toEqual({ ok: false, messaggio: 'credenziali non valide' })
  })

  it('un computer piu vecchio lo dice invece di fingere', async () => {
    // Le rotte nuove arrivano prima sull'app che sul computer di chi non ha
    // ancora aggiornato: senza questo l'app mostrerebbe un errore di rete per
    // una funzione che semplicemente non c'e' ancora.
    const su = deps({})
    for (const percorso of ['/api/account/entra', '/api/account/esci']) {
      const esito = await rotteClient(su)({
        metodo: 'POST',
        percorso,
        corpo: { email: 'x@y.z', password: 'p' }
      })
      expect(esito.stato).toBe(501)
    }
  })
})

describe('/api/stato — le chat di tutti i workspace viaggiano col workspace', () => {
  it('passa `workspace.chat` cosi com e, accanto alle chat vive', async () => {
    const r = await rotteClient(deps({
      workspace: () => Promise.resolve({
        nomi: ['lavoro', 'casa'], attivo: 'lavoro',
        chat: [{ workspace: 'casa', sessione: 'u9', cwd: 'C:\\casa', titolo: 'la chat di casa' }]
      })
    }))({ metodo: 'GET', percorso: '/api/stato', corpo: undefined, dispositivo: 'd1' })
    const corpo = r.corpo as { chat: unknown[]; workspace: { chat?: { sessione: string }[] } }
    expect(corpo.workspace.chat?.map((c) => c.sessione)).toEqual(['u9'])
    expect(corpo.chat).toHaveLength(1)
  })
})
