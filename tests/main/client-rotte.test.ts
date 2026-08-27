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

  it('non manda le righe nell elenco, che si chiede ogni due secondi', async () => {
    // Quattordici righe per chat ogni due secondi sono decine di kilobyte al
    // minuto sulla rete del telefono, per righe che nessuno sta guardando.
    const chat = [{ id: 'p-1', titolo: 'Gestore', cwd: 'C:\\p', coda: ['segreto lunghissimo'] }]
    const r = await rotteClient(deps({ chat: () => chat }))(
      { metodo: 'GET', percorso: '/api/stato', corpo: undefined }
    )
    expect(JSON.stringify(r.corpo)).not.toContain('segreto lunghissimo')
  })

  it('apre una chat solo in una cartella gia conosciuta', async () => {
    // Un percorso qualunque arrivato dalla rete aprirebbe una sessione dove
    // capita, e da un telefono nessuno se ne accorgerebbe.
    let aperta = ''
    const su = deps({ apriChat: (c) => { aperta = c } })
    const buona = await rotteClient(su)(
      { metodo: 'POST', percorso: '/api/apri', corpo: { cartella: 'C:\\lavoro' } }
    )
    expect(buona.stato).toBe(200)
    expect(aperta).toBe('C:\\lavoro')

    const cattiva = await rotteClient(su)(
      { metodo: 'POST', percorso: '/api/apri', corpo: { cartella: 'C:\\Windows\\System32' } }
    )
    expect(cattiva.stato).toBe(403)
    expect(aperta).toBe('C:\\lavoro')
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