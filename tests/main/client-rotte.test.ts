import { rottaPermessaSulCanale } from '@shared/strada-pc'
import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { rotteClient, rotteLibere, battitoVivo, type DipendenzeRotte } from '../../src/main/client-rotte'
import { apriDispositivi } from '../../src/main/dispositivi'
import { nuovoAutopilota } from '@shared/autopilota'

function deps(over: Partial<DipendenzeRotte> = {}): DipendenzeRotte {
  return {
    dispositivi: apriDispositivi(mkdtempSync(join(tmpdir(), 'sd-rotte-'))),
    chat: () => [{ id: 'p-1', titolo: 'Gestore', cwd: 'C:\p' }],
    autopiloti: () => Promise.resolve([
      { ...nuovoAutopilota({ id: 'ap-1', nome: 'Notte', obiettivo: 'Test', cwd: 'C:\p',
        
        iniziatoIl: '2026-08-12T10:00:00.000Z' }) }
    ]),
    rispondi: () => Promise.resolve(),
    domande: () => Promise.resolve([{ id: 'd-1', autopilotaId: 'ap-1', testo: 'Quale chiave?' }]),
    scriviAChat: () => undefined,
    apriChat: () => undefined,
    cartelle: () => Promise.resolve(['C:\\lavoro', 'C:\\casa']),
    workspace: () => Promise.resolve({ nomi: ['lavoro', 'casa'], attivo: 'lavoro' }),
    cambiaWorkspace: () => Promise.resolve(),
    creaAutopilota: () => Promise.resolve({ id: 'ap-9' }),
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
    expect(c.autopiloti[0]).toMatchObject({ nome: 'Notte', fatti: 0, criteri: 0 })
    expect(c.autopiloti[0]).not.toHaveProperty('decisioni')
    expect(c.autopiloti[0]).not.toHaveProperty('sessioneSupervisore')
  })

  it('porta le domande in attesa, che sono la ragione per aprirlo', async () => {
    const r = await rotteClient(deps())({ metodo: 'GET', percorso: '/api/stato', corpo: undefined })
    expect((r.corpo as { domande: unknown[] }).domande).toHaveLength(1)
  })

  it('porta le chat chiuse da te (0.60.9), e niente campo se non ce ne sono', async () => {
    const chiuse = [{ sessione: '11111111-2222-4333-8444-555555555555', il: '2026-10-11T15:47:00.000Z' }]
    const r = await rotteClient({ ...deps(), chiuse: () => chiuse })({ metodo: 'GET', percorso: '/api/stato', corpo: undefined })
    expect((r.corpo as { chiuse?: unknown }).chiuse).toEqual(chiuse)
    const v = await rotteClient({ ...deps(), chiuse: () => [] })({ metodo: 'GET', percorso: '/api/stato', corpo: undefined })
    expect(v.corpo).not.toHaveProperty('chiuse')
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

  it('le rotte dell’autopilota di prima non ci sono più (autopilota unico)', async () => {
    for (const p of ['vai', 'correggi', 'istruzioni', 'manda-adesso', 'archivia', 'sposta', 'riavvio', 'sottofondo', 'ferma', 'riprendi', 'elimina']) {
      const r = await rotteClient(deps())({ metodo: 'POST', percorso: `/api/autopilota/${p}`, corpo: { autopilota: 'ap-1' } })
      expect(r.stato, p).toBe(404)
    }
  })

  it('l’avanzamento dell’autopilota unico: orchestratore e coda del workspace', async () => {
    const chiesti: string[] = []
    const orchestratore = { workspace: 'lavoro', attivo: true, percento: 40, specialisti: [{ id: 's1', ruolo: 'sviluppatore', compito: 'il lettore', stato: 'lavora' }] }
    const coda = { workspace: 'lavoro', totale: 40, richieste: [{ id: 'r-1', titolo: 'Il lettore', stato: 'in-corso', percento: 40 }], compattate: [] }
    const su = deps({ avanzamentoAutopilota: (ws) => { chiesti.push(ws); return Promise.resolve({ orchestratore, coda } as never) } })
    const r = await rotteClient(su)({ metodo: 'POST', percorso: '/api/autopilota/avanzamento', corpo: { workspace: 'lavoro' } })
    expect(r.stato).toBe(200)
    expect(r.corpo).toEqual({ orchestratore, coda })
    // Dall'autopilota: la chiave è la sua cartella, se non ha un workspace.
    const r2 = await rotteClient(su)({ metodo: 'POST', percorso: '/api/autopilota/avanzamento', corpo: { autopilota: 'ap-1' } })
    expect(r2.stato).toBe(200)
    expect(chiesti).toEqual(['lavoro', 'cartella:c:\p'])
    expect((await rotteClient(su)({ metodo: 'POST', percorso: '/api/autopilota/avanzamento', corpo: {} })).stato).toBe(400)
    expect((await rotteClient(su)({ metodo: 'POST', percorso: '/api/autopilota/avanzamento', corpo: { autopilota: 'ap-9' } })).stato).toBe(404)
    // Un PC senza: null, non un errore.
    expect((await rotteClient(deps())({ metodo: 'POST', percorso: '/api/autopilota/avanzamento', corpo: { workspace: 'lavoro' } })).corpo).toEqual({ orchestratore: null, coda: null })
    const guasto = deps({ avanzamentoAutopilota: () => Promise.reject(new Error('giù')) })
    expect((await rotteClient(guasto)({ metodo: 'POST', percorso: '/api/autopilota/avanzamento', corpo: { workspace: 'lavoro' } })).stato).toBe(502)
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

  it('la coda condivisa dal telefono: i progetti nello stato, e le voci si leggono, si mettono e si tolgono', async () => {
    let voci = [{ id: 'v1', testo: 'lancia i test', creataIl: 'x', daNome: 'Torre', stato: 'attesa' as const }]
    const d = deps({
      progetti: () => [{ id: 'p1', nome: 'SierraDeck', chi: 'altro', pcNome: 'Torre', inCoda: 1 }],
      coda: () => Promise.resolve({ voci }),
      codaAggiungi: (_p, testo) => { voci = [...voci, { id: 'v2', testo, creataIl: 'y', daNome: 'Portatile', stato: 'attesa' as const }]; return Promise.resolve({ voci }) },
      codaTogli: (_p, voce) => { voci = voci.filter((v) => v.id !== voce); return Promise.resolve({ voci }) }
    })
    const stato = (await rotteClient(d)({ metodo: 'GET', percorso: '/api/stato', corpo: undefined })).corpo as { progetti: unknown[] }
    expect(stato.progetti).toEqual([{ id: 'p1', nome: 'SierraDeck', chi: 'altro', pcNome: 'Torre', inCoda: 1 }])
    const lettura = await rotteClient(d)({ metodo: 'POST', percorso: '/api/coda', corpo: { progetto: 'p1' } })
    expect((lettura.corpo as { voci: unknown[] }).voci).toHaveLength(1)
    const messa = await rotteClient(d)({ metodo: 'POST', percorso: '/api/coda/aggiungi', corpo: { progetto: 'p1', testo: '  poi i documenti  ' } })
    expect((messa.corpo as { voci: { testo: string }[] }).voci.map((v) => v.testo)).toEqual(['lancia i test', 'poi i documenti'])
    const tolta = await rotteClient(d)({ metodo: 'POST', percorso: '/api/coda/togli', corpo: { progetto: 'p1', voce: 'v1' } })
    expect((tolta.corpo as { voci: { id: string }[] }).voci.map((v) => v.id)).toEqual(['v2'])
    // Senza testo, o senza progetto, non si mette niente.
    expect((await rotteClient(d)({ metodo: 'POST', percorso: '/api/coda/aggiungi', corpo: { progetto: 'p1', testo: '   ' } })).stato).toBe(400)
    // Un computer vecchio, o senza Drive: la coda non e' disponibile, ma non e' un errore.
    const senza = await rotteClient(deps())({ metodo: 'POST', percorso: '/api/coda', corpo: { progetto: 'p1' } })
    expect(senza.corpo).toEqual({ voci: [], disponibile: false })
  })

  it('porta al telefono, quieto, su quale PC e in lavoro il progetto di una chat', async () => {
    // Un'informazione sotto il titolo, non un avviso: il testimone si prende
    // dal computer. Il campo c'e' solo quando il progetto e' in mano ad altri.
    const chat = [
      { id: 'p-1', titolo: 'Gestore', cwd: 'C:\p', altrove: 'Portatile' },
      { id: 'p-2', titolo: 'Altro', cwd: 'D:/q' }
    ]
    const r = await rotteClient(deps({ chat: () => chat }))({ metodo: 'GET', percorso: '/api/stato', corpo: undefined })
    const stato = r.corpo as { chat: { id: string; altrove?: string }[] }
    expect(stato.chat.find((c) => c.id === 'p-1')?.altrove).toBe('Portatile')
    expect(stato.chat.find((c) => c.id === 'p-2')?.altrove).toBeUndefined()
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

  it('crea un autopilota con i campi della finestra del PC; mai nella radice di un disco o nella cartella dell utente', async () => {
    // Delegare un lavoro e' la cosa piu' utile che si possa fare da fermi, in
    // piedi, con una mano sola: le domande della preparazione arrivano poi
    // sullo stesso telefono, e si risponde da li'. Dalla 0.55.0 con gli stessi
    // campi del PC e la stessa validazione (`controllaBozzaAutopilota`).
    const creati: unknown[] = []
    const su = deps({
      creaAutopilota: (r) => { creati.push(r); return Promise.resolve({ id: 'ap-9' }) },
      cartellaUtente: () => 'C:\\Users\\esempio',
      cartellaEsiste: () => Promise.resolve(true)
    })
    // Un telefono di prima: obiettivo e cartella conosciuta.
    const buona = await rotteClient(su)({
      metodo: 'POST',
      percorso: '/api/autopilota/crea',
      corpo: { obiettivo: 'Sistema il lettore di CSV', cartella: 'C:\\lavoro' }
    })
    expect(buona).toMatchObject({ stato: 200, corpo: { fatto: true, autopilota: 'ap-9' } })
    expect(creati[0]).toEqual({ nome: 'Sistema il lettore di CSV', obiettivo: 'Sistema il lettore di CSV', cwd: 'C:\\lavoro', criteri: [], pubblicazione: 'stabile', partenza: 'via' })
    // Tutti i campi (app 2.55.0): una cartella mai vista ma che esiste, sfogliata.
    const piena = await rotteClient(su)({
      metodo: 'POST',
      percorso: '/api/autopilota/crea',
      corpo: { obiettivo: 'Porta i test a verde', cartella: 'D:\\Progetti\\Esempio', nome: 'Test verdi', criteri: 'npm test passa' + String.fromCharCode(10) + 'il quaderno ha la scheda', pubblicazione: 'beta', vaSulCloud: true, workspace: 'casa', partenza: 'subito' }
    })
    expect(piena.stato).toBe(200)
    expect(creati[1]).toEqual({ nome: 'Test verdi', obiettivo: 'Porta i test a verde', cwd: 'D:\\Progetti\\Esempio', criteri: [{ descrizione: 'npm test passa' }, { descrizione: 'il quaderno ha la scheda' }], pubblicazione: 'beta', vaSulCloud: true, workspace: 'casa', partenza: 'subito' })

    // La radice di un disco e la cartella dell'utente: no, con il perché.
    for (const cartella of ['C:\\', 'C:\\Users\\esempio', 'C:\\Users']) {
      const fuori = await rotteClient(su)({ metodo: 'POST', percorso: '/api/autopilota/crea', corpo: { obiettivo: 'x', cartella } })
      expect(fuori.stato, cartella).toBe(403)
      expect((fuori.corpo as { campo: string }).campo).toBe('cwd')
    }
    // Un workspace che non c'è, una regola sconosciuta, un pezzo di nome al posto della cartella.
    expect((await rotteClient(su)({ metodo: 'POST', percorso: '/api/autopilota/crea', corpo: { obiettivo: 'x', cartella: 'C:\\lavoro', workspace: 'altrove' } })).stato).toBe(404)
    expect(await rotteClient(su)({ metodo: 'POST', percorso: '/api/autopilota/crea', corpo: { obiettivo: 'x', cartella: 'C:\\lavoro', pubblicazione: 'sempre' } })).toMatchObject({ stato: 400, corpo: { campo: 'pubblicazione' } })
    expect(await rotteClient(su)({ metodo: 'POST', percorso: '/api/autopilota/crea', corpo: { obiettivo: 'x', cartella: 'lavoro' } })).toMatchObject({ stato: 400, corpo: { campo: 'cwd' } })
    // Una cartella che non esiste.
    const nonCe = await rotteClient({ ...su, cartellaEsiste: () => Promise.resolve(false) })({ metodo: 'POST', percorso: '/api/autopilota/crea', corpo: { obiettivo: 'x', cartella: 'D:\\Sparita' } })
    expect(nonCe.stato).toBe(404)
    expect(creati).toHaveLength(2)
  })

  it('senza obiettivo non crea niente', async () => {
    const creati: unknown[] = []
    const su = deps({
      creaAutopilota: (r) => { creati.push(r); return Promise.resolve({ id: 'ap-9' }) }
    })
    const r = await rotteClient(su)({
      metodo: 'POST', percorso: '/api/autopilota/crea', corpo: { cartella: 'C:\\lavoro' }
    })
    expect(r).toMatchObject({ stato: 400, corpo: { campo: 'obiettivo', errore: 'Scrivi prima cosa vuoi ottenere.' } })
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
    // L'autopilota unico (0.86.x): fasi, misura, albero, Punto e messaggi in
    // coda erano del sistema di prima; l'avanzamento ha la sua rotta.
    for (const via of ['passaggi', 'misura', 'albero', 'punto', 'messaggi', 'fermoConPromessa', 'tempi']) expect(a[via], via).toBeUndefined()
    // La chat con lui (0.29.0), composta qui una volta per pagina e app. E la
    // domanda aperta, con il suo id, cosi' si risponde dalla stessa casella.
    expect(a.chat).toBeInstanceOf(Array)
    expect(a.domandaId).toBe('d-1')
    expect(typeof a.domanda).toBe('boolean')
    expect(typeof a.pensa).toBe('boolean')
  })

  it('di un autopilota che non c e lo dice, invece di mandare niente', async () => {
    const r = await rotteClient(deps())({
      metodo: 'POST', percorso: '/api/autopilota', corpo: { autopilota: 'mai-esistito' }
    })
    expect(r.stato).toBe(404)
  })
})

describe('fare tutto, anche le cose che si disfano', () => {
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

  it('riprende anche quando il percorso ricavato dallo slug ha perso trattini e spazi: conta lo slug', async () => {
    // `cartelle()` ricava `Game\\ascensore` dal nome `C--Users-n-Documents-Game-ascensore`;
    // la chat sta in `Game_ascensore`. Per percorso era 403 dal telefono.
    const riprese: { cwd: string; sessione: string }[] = []
    const su = deps({
      cartelle: () => Promise.resolve(['C:\\Users\\n\\Documents\\Game\\ascensore']),
      riprendiSessione: (cwd, sessione) => { riprese.push({ cwd, sessione }) }
    })
    const r = await rotteClient(su)({
      metodo: 'POST', percorso: '/api/sessioni/riprendi', corpo: { cartella: 'C:\\Users\\n\\Documents\\Game_ascensore', sessione: 's-2' }
    })
    expect(r.stato).toBe(200)
    expect(riprese).toEqual([{ cwd: 'C:\\Users\\n\\Documents\\Game_ascensore', sessione: 's-2' }])
  })

  it('non riprende una conversazione in una cartella che il computer non conosce', async () => {
    // La stessa regola di «apri»: un percorso qualunque arrivato dalla rete
    // aprirebbe una sessione dove capita.
    const r = await rotteClient(deps())({
      metodo: 'POST', percorso: '/api/sessioni/riprendi', corpo: { cartella: 'C:\\Windows', sessione: 's-1' }
    })
    expect(r.stato).toBe(403)
  })

  it('crea ed elimina un workspace (senza finestre: le strade di prima, con i controlli)', async () => {
    const fatti: string[] = []
    let nomi = ['lavoro', 'casa']
    const su = deps({
      workspace: () => Promise.resolve({ nomi, attivo: 'lavoro' }),
      creaWorkspace: (n) => { fatti.push('crea:' + n); nomi = [...nomi, n]; return Promise.resolve() },
      eliminaWorkspace: (n) => { fatti.push('elimina:' + n); nomi = nomi.filter((x) => x !== n); return Promise.resolve() }
    })
    await rotteClient(su)({ metodo: 'POST', percorso: '/api/workspace/crea', corpo: { nome: 'sera' } })
    await rotteClient(su)({ metodo: 'POST', percorso: '/api/workspace/elimina', corpo: { nome: 'sera' } })
    expect(fatti).toEqual(['crea:sera', 'elimina:sera'])
    // Uno che non c'è: lo dice, invece di far finta.
    expect((await rotteClient(su)({ metodo: 'POST', percorso: '/api/workspace/elimina', corpo: { nome: 'sera' } })).stato).toBe(404)
    // L'ultimo resta, come sul PC.
    nomi = ['lavoro']
    const ultimo = await rotteClient(su)({ metodo: 'POST', percorso: '/api/workspace/elimina', corpo: { nome: 'lavoro' } })
    expect(ultimo).toMatchObject({ stato: 409, corpo: { errore: 'L’ultimo workspace non si può eliminare: non resterebbe dove salvare il layout.' } })
    expect(fatti).toHaveLength(2)
  })

  it('un workspace creato da lontano non cambia lo schermo di questo PC (0.60.7)', async () => {
    const aggiunti: string[] = []
    const finestra: unknown[] = []
    const su = deps({
      aggiungiWorkspace: (n) => { aggiunti.push(n); return Promise.resolve() },
      azioneFinestra: (a) => { finestra.push(a); return Promise.resolve({ ok: true }) }
    })
    expect((await rotteClient(su)({ metodo: 'POST', percorso: '/api/workspace/crea', corpo: { nome: 'Prova' } })).stato).toBe(200)
    expect(aggiunti).toEqual(['Prova'])
    // Non passa dai tasti della finestra, che lo creerebbero andandoci.
    expect(finestra).toEqual([])
  })

  it('con la finestra (0.55.0): crea, elimina, rinomina, dormi, sveglia, chiudi, sposta passano dai tasti del PC', async () => {
    const chieste: unknown[] = []
    let esito = { ok: true } as { ok: boolean; errore?: string }
    const su = deps({
      azioneFinestra: (a) => { chieste.push(a); return Promise.resolve(esito) },
      chat: () => [{ id: 'p-1', titolo: 'CSV', cwd: 'C:\\lavoro', coda: [] }] as never
    })
    const r = rotteClient(su)
    const vai = (percorso: string, corpo: object): ReturnType<typeof r> => r({ metodo: 'POST', percorso, corpo })
    expect((await vai('/api/workspace/crea', { nome: 'sera' })).stato).toBe(200)
    expect((await vai('/api/workspace/elimina', { nome: 'casa' })).stato).toBe(200)
    expect((await vai('/api/workspace/rinomina', { nome: 'casa', nuovo: 'Casa nuova' })).stato).toBe(200)
    expect(await vai('/api/workspace/rinomina', { nome: 'casa', nuovo: 'lavoro' })).toMatchObject({ stato: 400, corpo: { errore: '«lavoro» esiste già: scegli un altro nome.' } })
    expect((await vai('/api/chat/dormi', { chat: 'p-1' })).stato).toBe(200)
    expect((await vai('/api/chat/sveglia', { chat: 'p-1' })).stato).toBe(200)
    expect((await vai('/api/chat/chiudi', { chat: 'p-1' })).stato).toBe(200)
    expect((await vai('/api/chat/sposta', { chat: 'p-1', workspace: 'casa' })).stato).toBe(200)
    expect((await vai('/api/chat/sposta', { chat: 'p-1', workspace: 'nessuno' })).stato).toBe(404)
    expect((await vai('/api/chat/dormi', { chat: 'p-9' })).stato).toBe(404)
    expect(chieste).toEqual([
      { tipo: 'workspace', azione: 'crea', nome: 'sera' },
      { tipo: 'workspace', azione: 'elimina', nome: 'casa' },
      { tipo: 'workspace', azione: 'rinomina', nome: 'casa', nuovo: 'Casa nuova' },
      { tipo: 'chat', azione: 'dormi', chat: 'p-1' },
      { tipo: 'chat', azione: 'sveglia', chat: 'p-1' },
      { tipo: 'chat', azione: 'chiudi', chat: 'p-1' },
      { tipo: 'chat', azione: 'sposta', chat: 'p-1', workspace: 'casa' }
    ])
    // La finestra dice di no: il telefono legge il perché.
    esito = { ok: false, errore: 'il disco ha rifiutato workspaces.json' }
    expect(await vai('/api/workspace/elimina', { nome: 'casa' })).toMatchObject({ stato: 409, corpo: { errore: 'Il workspace «casa» non è stato eliminato: il disco ha rifiutato workspaces.json.' } })
  })

  it('i salvataggi con nome non esistono piu’: elenco vuoto per le app vecchie, e un rifiuto che spiega', async () => {
    const caricati: string[] = []
    const su = deps({ caricaIstantanea: (n) => { caricati.push(n); return Promise.resolve() } })
    const elenco = await rotteClient(su)({ metodo: 'GET', percorso: '/api/salvataggi', corpo: undefined })
    expect((elenco.corpo as { salvataggi: unknown[] }).salvataggi).toEqual([])
    const r = await rotteClient(su)({ metodo: 'POST', percorso: '/api/salvataggi/carica', corpo: { nome: 'Ultima chiusura' } })
    expect(r.stato).toBe(410)
    expect((r.corpo as { errore: string }).errore).toContain('Torna a com’era')
    expect(caricati).toEqual([])
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

  it('da le note di cosa cambia prima di «Installa» (0.39.0), senza installare niente', async () => {
    const fatti: string[] = []
    const note = { versione: '0.39.0', installata: '0.38.2', note: [{ versione: '0.39.0', blocchi: [{ tipo: 'paragrafo' as const, pezzi: [{ testo: 'ciao' }] }] }], fonte: 'github' as const, dove: 'https://github.com/niko9090/sierradeck/releases' }
    const su = deps({ noteAggiornamento: async () => note, installaAggiornamento: () => { fatti.push('installa') } })
    const r = await rotteClient(su)({ metodo: 'GET', percorso: '/api/aggiornamento/note', corpo: undefined })
    expect(r.stato).toBe(200)
    expect(r.corpo).toEqual(note)
    expect(fatti).toEqual([])
    // Un computer che non le sa dare lo dice, invece di un 404 muto.
    const vecchio = await rotteClient(deps())({ metodo: 'GET', percorso: '/api/aggiornamento/note', corpo: undefined })
    expect(vecchio.stato).toBe(409)
  })
})

describe('la posta per un PC, dal telefono', () => {
  it('gli altri PC con «vivo» deciso dal computer, e la cassetta che si legge, si scrive, si toglie', async () => {
    let voci = [{ id: 'a1', testo: 'fai i test', cwd: 'Z:\\gest', creataIl: 'x', daPc: 'B', daNome: 'Portatile', stato: 'attesa' as const }]
    const ora = Date.parse('2026-09-14T08:10:00.000Z')
    const d = deps({
      adesso: () => ora,
      pcIo: () => 'B',
      pc: () => Promise.resolve([
        { pcId: 'A', nome: 'Torre', versione: '0.27.0', battito: '2026-09-14T08:09:00.000Z', cartelle: ['Z:\\gest'], chat: [{ sessione: 's1', titolo: 'g', cwd: 'Z:\\gest', aspetta: true }] },
        { pcId: 'C', nome: 'Vecchio', versione: '0.27.0', battito: '2026-09-14T07:00:00.000Z', cartelle: [], chat: [] }
      ]),
      posta: () => Promise.resolve({ voci }),
      postaAggiungi: (_pc, v) => { voci = [...voci, { id: 'a2', testo: v.testo, cwd: v.cwd, creataIl: 'y', daPc: 'B', daNome: 'Portatile', stato: 'attesa' as const }]; return Promise.resolve({ voci }) },
      postaTogli: (_pc, voce) => { voci = voci.filter((v) => v.id !== voce); return Promise.resolve({ voci }) }
    })
    const elenco = (await rotteClient(d)({ metodo: 'GET', percorso: '/api/pc', corpo: undefined })).corpo as { io: string; pc: { pcId: string; vivo: boolean }[] }
    expect(elenco.io).toBe('B')
    expect(elenco.pc.map((p) => [p.pcId, p.vivo])).toEqual([['A', true], ['C', false]])
    const lettura = await rotteClient(d)({ metodo: 'POST', percorso: '/api/posta', corpo: { pc: 'A' } })
    expect((lettura.corpo as { voci: unknown[] }).voci).toHaveLength(1)
    const messa = await rotteClient(d)({ metodo: 'POST', percorso: '/api/posta/aggiungi', corpo: { pc: 'A', cwd: ' Z:\\gest ', testo: '  poi il changelog ' } })
    expect((messa.corpo as { voci: { testo: string; cwd: string }[] }).voci[1]).toMatchObject({ testo: 'poi il changelog', cwd: 'Z:\\gest' })
    const tolta = await rotteClient(d)({ metodo: 'POST', percorso: '/api/posta/togli', corpo: { pc: 'A', voce: 'a1' } })
    expect((tolta.corpo as { voci: { id: string }[] }).voci.map((v) => v.id)).toEqual(['a2'])
    expect((await rotteClient(d)({ metodo: 'POST', percorso: '/api/posta/aggiungi', corpo: { pc: 'A', testo: 'x' } })).stato).toBe(400)
    // Un computer vecchio: l'elenco dice che non e' disponibile, e mandare risponde 409 con il perche'.
    const vecchio = (await rotteClient(deps())({ metodo: 'GET', percorso: '/api/pc', corpo: undefined })).corpo as { disponibile: boolean; pc: unknown[] }
    expect(vecchio).toMatchObject({ disponibile: false, pc: [] })
    expect((await rotteClient(deps())({ metodo: 'POST', percorso: '/api/posta/aggiungi', corpo: { pc: 'A', cwd: 'x', testo: 'y' } })).stato).toBe(409)
  })
})

describe('parlare con l autopilota dal telefono', () => {
  it('passa il testo e risponde subito con la ricevuta', async () => {
    const mandati: { id: string; testo: string }[] = []
    const r = await rotteClient(deps({
      dialogaAutopilota: (id, testo) => { mandati.push({ id, testo }); return Promise.resolve({ ricevuto: true }) }
    }))({ metodo: 'POST', percorso: '/api/autopilota/dialogo', corpo: { autopilota: 'ap-1', testo: 'dove sei?' } } as never)
    expect(r?.stato).toBe(200)
    expect((r?.corpo as { fatto: boolean }).fatto).toBe(true)
    expect(mandati).toEqual([{ id: 'ap-1', testo: 'dove sei?' }])
  })

  it('senza testo o autopilota non fa niente', async () => {
    const r = await rotteClient(deps({ dialogaAutopilota: () => Promise.resolve({ ricevuto: true }) }))(
      { metodo: 'POST', percorso: '/api/autopilota/dialogo', corpo: { autopilota: 'ap-1' } } as never
    )
    expect(r?.stato).toBe(400)
  })

  it('un computer vecchio lo dice con un 409, come per il Drive', async () => {
    const r = await rotteClient(deps())(
      { metodo: 'POST', percorso: '/api/autopilota/dialogo', corpo: { autopilota: 'ap-1', testo: 'ciao' } } as never
    )
    expect(r?.stato).toBe(409)
    expect(String((r?.corpo as { errore: string }).errore)).toContain('aggiornalo')
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
      negozio: (async () => ({
        plugin: [{ id: 'a@m', nome: 'a', installato: true, abilitato: true }],
        skill: [{ nome: 's', abilitata: false }],
        agenti: [],
        mcp: []
      })) as never
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
      negozio: (async () => ({
        plugin: [{ id: 'a@b', nome: 'a' }],
        skill: [],
        agenti: [],
        mcp: []
      })) as never
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

  it('senza account non inventa nessuno', async () => {
    const su = deps({})
    const esito = await rotteClient(su)({ metodo: 'GET', percorso: '/api/account', corpo: undefined })
    expect(esito.corpo).toEqual({ entrato: false })
  })

  it('l’account del programma non c’è più (0.88.0): entrare e uscire da lontano rispondono 410', async () => {
    const rotte = rotteClient(deps({}))
    expect((await rotte({ metodo: 'POST', percorso: '/api/account/entra', corpo: { email: 'x@y.z', password: 'p' } })).stato).toBe(410)
    expect((await rotte({ metodo: 'POST', percorso: '/api/account/esci', corpo: {} })).stato).toBe(410)
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

describe('una scelta mandata dal telefono non si preme due volte', () => {
  const SCHERMO_SCELTA = ['Vuoi riprendere?', '\u276f 1. Si, riprendi', '  2. No, comincia da capo']
  const chatCon = (coda: string[]): { id: string; titolo: string; cwd: string; coda: string[] }[] =>
    [{ id: 'p-1', titolo: 'Gestore', cwd: 'C:\p', coda }]

  it('IL PUNTO: si controlla sullo schermo di adesso, non sulla foto vecchia', async () => {
    // La foto dell'elenco ha fino a due secondi: mostra ancora la domanda, ma
    // la finestra dice che il terminale e' gia' andato avanti. Non si preme.
    let scritto: string | undefined
    const r = await rotteClient(deps({
      chat: () => chatCon(SCHERMO_SCELTA),
      schermoDi: () => Promise.resolve(['\u23fa Bash(npm test)', 'in corso…']),
      scriviAChat: (_id, t) => { scritto = t }
    }))({ metodo: 'POST', percorso: '/api/scegli', corpo: { chat: 'p-1', opzione: 'Si, riprendi' } })
    expect(r.stato).toBe(409)
    expect(scritto).toBeUndefined()
  })

  it('se la finestra non risponde si ripiega sulla foto', async () => {
    let scritto: string | undefined
    const r = await rotteClient(deps({
      chat: () => chatCon(SCHERMO_SCELTA),
      schermoDi: () => Promise.resolve(undefined),
      scriviAChat: (_id, t) => { scritto = t }
    }))({ metodo: 'POST', percorso: '/api/scegli', corpo: { chat: 'p-1', opzione: 'No, comincia da capo' } })
    expect(r.stato).toBe(200)
    expect(scritto).toBe('\u001b[B')
  })

  it('la stessa domanda, subito dopo: non si rimanda e non si mostra piu', async () => {
    let ora = 1_000_000
    const scritti: string[] = []
    const rotte = rotteClient(deps({
      chat: () => chatCon(SCHERMO_SCELTA),
      adesso: () => ora,
      scriviAChat: (_id, t) => { scritti.push(t) }
    }))
    const prima = await rotte({ metodo: 'POST', percorso: '/api/scegli', corpo: { chat: 'p-1', opzione: 'Si, riprendi' } })
    expect(prima.stato).toBe(200)
    // Il terminale non si e' ancora ridisegnato: la foto mostra la stessa domanda.
    ora += 1500
    const dentro = await rotte({ metodo: 'POST', percorso: '/api/dentro', corpo: { chat: 'p-1' } })
    expect((dentro.corpo as { scelte?: unknown }).scelte).toBeUndefined()
    const storia = await rotte({ metodo: 'POST', percorso: '/api/storia', corpo: { chat: 'p-1', da: -1, quante: 20 } })
    expect((storia.corpo as { scelte?: unknown }).scelte).toBeUndefined()
    const seconda = await rotte({ metodo: 'POST', percorso: '/api/scegli', corpo: { chat: 'p-1', opzione: 'Si, riprendi' } })
    expect(seconda.stato).toBe(409)
    expect(scritti).toHaveLength(1)
  })

  it('passati otto secondi, se la domanda e ancora li e davvero li', async () => {
    let ora = 1_000_000
    const rotte = rotteClient(deps({
      chat: () => chatCon(SCHERMO_SCELTA),
      adesso: () => ora
    }))
    await rotte({ metodo: 'POST', percorso: '/api/scegli', corpo: { chat: 'p-1', opzione: 'Si, riprendi' } })
    ora += 8001
    const dentro = await rotte({ metodo: 'POST', percorso: '/api/dentro', corpo: { chat: 'p-1' } })
    expect((dentro.corpo as { scelte?: unknown }).scelte).toBeDefined()
  })

  it('una domanda diversa si mostra subito', async () => {
    const chat = chatCon(SCHERMO_SCELTA)
    const rotte = rotteClient(deps({ chat: () => chat }))
    await rotte({ metodo: 'POST', percorso: '/api/scegli', corpo: { chat: 'p-1', opzione: 'Si, riprendi' } })
    chat[0]!.coda = ['Posso scrivere il file?', '\u276f 1. Si', '  2. No']
    const dentro = await rotte({ metodo: 'POST', percorso: '/api/dentro', corpo: { chat: 'p-1' } })
    expect((dentro.corpo as { scelte?: { opzioni: { testo: string }[] } }).scelte?.opzioni[0]?.testo).toBe('Si')
  })
})

describe('il Drive dal telefono', () => {
  it('senza le dipendenze il catalogo dice «non disponibile», non un errore', async () => {
    const r = await rotteClient(deps())({ metodo: 'GET', percorso: '/api/drive/catalogo', corpo: undefined })
    expect(r.stato).toBe(200)
    expect(r.corpo).toMatchObject({ ok: false, disponibile: false })
  })
  it('mentre il computer legge il catalogo, il telefono chiede a che fase sta; senza la dipendenza risponde vuoto', async () => {
    const con = rotteClient(deps({ driveCatalogoStato: () => ({ inCorso: { fase: 'impronte', fatto: 2, totale: 5, avviato: 'T' } }) }))
    const r = await con({ metodo: 'GET', percorso: '/api/drive/catalogoStato', corpo: undefined })
    expect(r.corpo).toEqual({ inCorso: { fase: 'impronte', fatto: 2, totale: 5, avviato: 'T' } })
    const senza = await rotteClient(deps())({ metodo: 'GET', percorso: '/api/drive/catalogoStato', corpo: undefined })
    expect(senza.corpo).toEqual({})
  })

  it('il catalogo e il lavoro passano dal computer; «porta qui» dalla 0.42.0 no (una chat, una casa)', async () => {
    const portati: string[] = []
    const rotte = rotteClient(deps({
      driveCatalogo: () => Promise.resolve({ ok: true, catalogo: { progetti: [], workspace: [], totali: { progetti: 0, chat: 0, daPortare: 0, daAggiornare: 0, soloQui: 0, uguali: 0 }, letto: 'T' } }),
      drivePortaQui: (c) => { portati.push(c); return Promise.resolve({ ok: true, esito: { scaricati: 2 } }) },
      drivePortaQuiWorkspace: (n) => { portati.push('ws:' + n); return Promise.resolve({ ok: true, esito: { scaricati: 1 } }) },
      driveLavoro: () => ({ inCorso: { tipo: 'fusione', fase: 'carico', fatto: 1, totale: 3 } }),
      driveAnnulla: () => true
    }))
    const cat = await rotte({ metodo: 'GET', percorso: '/api/drive/catalogo', corpo: undefined })
    expect(cat.corpo).toMatchObject({ ok: true, disponibile: true })
    // Un progetto cambia PC solo con «Sposta su questo PC» (0.88.0): dal
    // telefono non si porta piu' niente di nascosto, e lo si dice.
    const porta = await rotte({ metodo: 'POST', percorso: '/api/drive/porta', corpo: { progetto: 'E:\\Users\\tecnico\\Wdeck' } })
    expect(porta.corpo).toMatchObject({ ok: false })
    expect((porta.corpo as { messaggio: string }).messaggio).toContain('Sposta su questo PC')
    const ws = await rotte({ metodo: 'POST', percorso: '/api/drive/portaWorkspace', corpo: { workspace: 'lavoro' } })
    expect(ws.corpo).toMatchObject({ ok: false })
    expect(portati).toEqual([])
    const lav = await rotte({ metodo: 'GET', percorso: '/api/drive/lavoro', corpo: undefined })
    expect((lav.corpo as { inCorso?: { fatto: number } }).inCorso?.fatto).toBe(1)
    const ann = await rotte({ metodo: 'POST', percorso: '/api/drive/annulla', corpo: {} })
    expect(ann.corpo).toEqual({ fatto: true })
  })
  it('«Sposta su questo PC» (0.88.0): prepara e concludi solo da un altro PC, e solo per sé', async () => {
    const chiesti: unknown[] = []
    const rotte = rotteClient(deps({
      sposta: {
        prepara: async (c) => { chiesti.push(['prepara', c]); return { ok: true, manifesto: {} } },
        concludi: async (c) => { chiesti.push(['concludi', c]); return { ok: true } }
      }
    }))
    const corpo = { progetto: 'p1', verso: 'pc-b', versoNome: 'PORTATILE' }
    // Il telefono no; un PC che chiede per un terzo no.
    expect((await rotte({ metodo: 'POST', percorso: '/api/sposta/prepara', corpo, dispositivo: 'telefono-1' })).stato).toBe(403)
    expect((await rotte({ metodo: 'POST', percorso: '/api/sposta/prepara', corpo, dispositivo: 'pc:pc-c' })).stato).toBe(403)
    expect(chiesti).toEqual([])
    expect((await rotte({ metodo: 'POST', percorso: '/api/sposta/prepara', corpo, dispositivo: 'pc:pc-b' })).corpo).toEqual({ ok: true, manifesto: {} })
    expect((await rotte({ metodo: 'POST', percorso: '/api/sposta/concludi', corpo: { progetto: 'p1', verso: 'pc-b', percorso: 'D:/P/p1', proprietarioDal: '2026-10-30T10:00:00Z' }, dispositivo: 'pc:pc-b' })).corpo).toEqual({ ok: true })
    expect(chiesti).toEqual([
      ['prepara', { progetto: 'p1', verso: 'pc-b', versoNome: 'PORTATILE' }],
      ['concludi', { progetto: 'p1', verso: 'pc-b', percorso: 'D:/P/p1', proprietarioDal: '2026-10-30T10:00:00Z' }]
    ])
    // Un errore là diventa «riprova», mai un'eccezione.
    const rotta = rotteClient(deps({ sposta: { prepara: async () => { throw new Error('disco pieno') }, concludi: async () => ({ ok: true }) } }))
    expect((await rotta({ metodo: 'POST', percorso: '/api/sposta/prepara', corpo, dispositivo: 'pc:pc-b' })).corpo).toEqual({ ok: false, messaggio: 'disco pieno', riprova: true })
    // Un computer che non sa spostare: 409.
    expect((await rotteClient(deps())({ metodo: 'POST', percorso: '/api/sposta/prepara', corpo, dispositivo: 'pc:pc-b' })).stato).toBe(409)
  })

  it('una chat la cui cartella e di un altro PC si segna «su X» e non si riapre qui (409, con la spiegazione)', async () => {
    // Nicholas (2026-09-15): dal cloud le chat si aprivano in una cartella
    // vuota, «directory non trovata». Dal telefono la chat dice di chi e'.
    const riprese: { cwd: string; sessione: string }[] = []
    const su = deps({
      sessioni: () => Promise.resolve([
        { id: 's-1', cwd: 'C:\\lavoro', titolo: 'Mia', quando: '' },
        { id: 's-2', cwd: 'E:\\Documents\\fionda apl', titolo: 'Del portatile', quando: '' }
      ]),
      cartelle: () => Promise.resolve(['C:\\lavoro', 'E:\\Documents\\fionda apl']),
      chatAltrove: (cwd) => (cwd.startsWith('E:\\') ? 'Portatile' : undefined),
      riprendiSessione: (cwd, sessione) => { riprese.push({ cwd, sessione }) }
    })
    const elenco = await rotteClient(su)({ metodo: 'GET', percorso: '/api/sessioni', corpo: undefined })
    const c = elenco.corpo as { sessioni: { id: string; altrove?: string }[] }
    expect(c.sessioni.map((s) => s.altrove)).toEqual([undefined, 'Portatile'])
    const r = await rotteClient(su)({ metodo: 'POST', percorso: '/api/sessioni/riprendi', corpo: { cartella: 'E:\\Documents\\fionda apl', sessione: 's-2' } })
    expect(r.stato).toBe(409)
    expect((r.corpo as { errore: string }).errore).toContain('Portatile')
    expect(riprese).toEqual([])
    const ok = await rotteClient(su)({ metodo: 'POST', percorso: '/api/sessioni/riprendi', corpo: { cartella: 'C:\\lavoro', sessione: 's-1' } })
    expect(ok.stato).toBe(200)
  })

  it('una chat di un altro PC dice anche se quel PC e acceso, come l elenco «Riprendi» sul computer (0.35.0)', async () => {
    // Il telefono diceva solo «su X»: non si sapeva se X fosse li' a rispondere.
    const ora = Date.parse('2026-09-30T12:00:00Z')
    const battito = (nome: string, minutiFa: number) => ({
      pcId: nome, nome, versione: '0.34.0', battito: new Date(ora - minutiFa * 60_000).toISOString(), cartelle: [], chat: []
    })
    const su = deps({
      adesso: () => ora,
      sessioni: () => Promise.resolve([
        { id: 's-1', cwd: 'C:\\lavoro', titolo: 'Mia', quando: '' },
        { id: 's-2', cwd: 'E:\\a', titolo: 'Del portatile', quando: '' },
        { id: 's-3', cwd: 'F:\\b', titolo: 'Del fisso', quando: '' },
        { id: 's-4', cwd: 'G:\\c', titolo: 'Di uno sconosciuto', quando: '' }
      ]),
      chatAltrove: (cwd) => (cwd.startsWith('E:') ? 'Portatile' : cwd.startsWith('F:') ? 'Fisso' : cwd.startsWith('G:') ? 'Vecchio' : undefined),
      pc: () => Promise.resolve([battito('Portatile', 1), battito('Fisso', 30)])
    })
    const r = await rotteClient(su)({ metodo: 'GET', percorso: '/api/sessioni', corpo: undefined })
    const c = r.corpo as { sessioni: { id: string; altrove?: string; altroveAcceso?: boolean }[] }
    expect(c.sessioni.map((s) => s.altroveAcceso)).toEqual([undefined, true, false, undefined])
    // E un computer senza battiti (versione vecchia, Drive chiuso) non perde l'elenco.
    const senza = await rotteClient(deps({ ...su, pc: () => Promise.reject(new Error('Drive chiuso')) }))({ metodo: 'GET', percorso: '/api/sessioni', corpo: undefined })
    expect((senza.corpo as { sessioni: unknown[] }).sessioni).toHaveLength(4)
  })

  it('il rifiuto di una chat di un altro PC nomina la sezione che esiste davvero', async () => {
    // Diceva «Altri PC», che non c'era ne' sul PC ne' nell'app ne' nella pagina.
    const su = deps({
      cartelle: () => Promise.resolve(['E:\\a']),
      chatAltrove: () => 'Portatile'
    })
    const r = await rotteClient(su)({ metodo: 'POST', percorso: '/api/sessioni/riprendi', corpo: { cartella: 'E:\\a', sessione: 's' } })
    expect((r.corpo as { errore: string }).errore).toContain('Altri computer')
  })

  it('una chat di un altro PC non da un errore secco: dice «su X · acceso» o «spento o non risponde» e cosa fa il computer (0.36.1)', async () => {
    // Nicholas (01/10): «devo collegarmi in remoto, non vedere l'errore».
    const ora = Date.parse('2026-10-01T12:00:00Z')
    const battito = (nome: string, minutiFa: number) => ({
      pcId: nome, nome, versione: '0.36.0', battito: new Date(ora - minutiFa * 60_000).toISOString(), cartelle: [], chat: []
    })
    const prova = async (minutiFa: number): Promise<string> => {
      const su = deps({
        adesso: () => ora,
        cartelle: () => Promise.resolve(['E:\\a']),
        chatAltrove: () => 'Portatile',
        pc: () => Promise.resolve([battito('Portatile', minutiFa)])
      })
      const r = await rotteClient(su)({ metodo: 'POST', percorso: '/api/sessioni/riprendi', corpo: { cartella: 'E:\\a', sessione: 's' } })
      return (r.corpo as { errore: string }).errore
    }
    const acceso = await prova(1)
    expect(acceso).toContain('su «Portatile» · acceso')
    expect(acceso).toContain('si collega da solo dal vivo')
    const spento = await prova(40)
    expect(spento).toContain('· spento o non risponde')
    expect(spento).toContain('appena torna acceso')
  })

  it('un battito illeggibile non e un PC acceso', () => {
    expect(battitoVivo('non una data', Date.now())).toBe(false)
    expect(battitoVivo(new Date(1000).toISOString(), 1000 + 60_000)).toBe(true)
    expect(battitoVivo(new Date(1000).toISOString(), 1000 + 6 * 60_000)).toBe(false)
  })

})

describe('la scheda «Domande» del telefono (0.30.0)', () => {
  const ESC = String.fromCharCode(27)
  const chatConScelta = {
    id: 'p-2', titolo: 'Permesso', cwd: 'D:/q', aspetta: true,
    coda: ['Do you want to proceed?', '', '1. Yes', '2. No'],
    codaGrezza: ['Do you want to proceed?', '', `${ESC}[7m1. Yes${ESC}[0m`, '2. No']
  }
  it('/api/domande raccoglie domande degli autopiloti, scelte delle chat e chat ferme', async () => {
    const r = await rotteClient(deps({
      chat: () => [{ id: 'p-1', titolo: 'Ferma', cwd: 'C:\p', aspetta: true, coda: ['ho finito', '❯'] }, chatConScelta]
    }))({ metodo: 'GET', percorso: '/api/domande', corpo: undefined })
    expect(r.stato).toBe(200)
    const voci = (r.corpo as { voci: { tipo: string; chat?: string; opzioni?: { testo: string }[]; autopilota?: string }[] }).voci
    expect(voci.map((v) => v.tipo)).toEqual(['autopilota', 'scelta', 'chat'])
    expect(voci[0]?.autopilota).toBe('Notte')
    expect(voci[1]?.chat).toBe('p-2')
    expect(voci[1]?.opzioni?.map((o) => o.testo)).toEqual(['Yes', 'No'])
    expect(voci[2]?.chat).toBe('p-1')
  })
  it('/api/stato dice per ogni chat se aspetta una scelta, senza mandare le righe', async () => {
    const r = await rotteClient(deps({ chat: () => [chatConScelta, { id: 'p-3', titolo: 'x', cwd: 'D:/x', coda: ['ciao'] }] }))(
      { metodo: 'GET', percorso: '/api/stato', corpo: undefined }
    )
    const chat = (r.corpo as { chat: { id: string; chiede: boolean; coda?: unknown }[] }).chat
    expect(chat.map((c) => [c.id, c.chiede])).toEqual([['p-2', true], ['p-3', false]])
    expect(chat[0]?.coda).toBeUndefined()
  })
})

describe('le Domande come conversazioni, dal computer (0.36.0)', () => {
  it('/api/domande porta le conversazioni, e quello che hai scritto resta nel filo', async () => {
    const ferma = { id: 'f-1', titolo: 'Ferma', cwd: 'C:/f', aspetta: true, coda: ['Ho finito il refactoring.'] }
    const rotte = rotteClient(deps({ chat: () => [ferma], scriviAChat: () => undefined, domande: () => Promise.resolve([]) }))
    await rotte({ metodo: 'POST', percorso: '/api/scrivi', corpo: { chat: 'f-1', testo: 'adesso i test' } })
    const r = await rotte({ metodo: 'GET', percorso: '/api/domande', corpo: undefined })
    const c = (r.corpo as { conversazioni: { chiave: string; messaggi: { da: string; testo: string }[] }[] }).conversazioni
    expect(c[0]?.chiave).toBe('chat:f-1')
    expect(c[0]?.messaggi.map((m) => `${m.da}:${m.testo}`)).toEqual(['tu:adesso i test', 'lui:Ho finito il refactoring.'])
    // Le voci di prima restano, per le app vecchie.
    expect((r.corpo as { voci: unknown[] }).voci).toHaveLength(1)
  })

})

describe('tutte le domande e un conteggio solo (0.37.2)', () => {
  const ora = Date.parse('2026-10-01T12:00:00Z')
  const conPronto = (): DipendenzeRotte => deps({
    adesso: () => ora,
    autopiloti: () => Promise.resolve([
      { ...nuovoAutopilota({ id: 'ap-1', nome: 'Notte', obiettivo: 'Test', cwd: 'C:\\p', iniziatoIl: '2026-08-12T10:00:00.000Z' }) },
      { ...nuovoAutopilota({ id: 'ap-2', nome: 'Pronto', obiettivo: 'Sito', cwd: 'C:\\s', iniziatoIl: '2026-08-12T10:00:00.000Z' }), stato: 'pronto' as const }
    ]),
    domande: () => Promise.resolve([
      { id: 'd-1', autopilotaId: 'ap-1', testo: 'Quale chiave?' },
      { id: 'd-2', autopilotaId: 'ap-1', testo: 'Pubblico adesso?', opzioni: ['sì, pubblica', 'no, lascia così'] }
    ]),
    pcIo: () => 'io',
    pc: () => Promise.resolve([
      { pcId: 'io', nome: 'Questo', versione: '0.37.2', battito: new Date(ora).toISOString(), cartelle: [], chat: [{ sessione: 's-0', titolo: 'Mia', cwd: 'C:\\m', aspetta: true }] },
      { pcId: 'port', nome: 'Portatile', versione: '0.37.2', battito: new Date(ora - 60_000).toISOString(), cartelle: [], chat: [{ sessione: 's-9', titolo: 'Sito', cwd: 'E:\\s', aspetta: true }] }
    ]),
    scriviAltroPc: () => Promise.resolve({ ok: true as const })
  })

  it('il tasto, la colonna e il telefono dicono lo stesso numero, compreso chi aspetta il via', async () => {
    const d = await rotteClient(conPronto())({ metodo: 'GET', percorso: '/api/domande', corpo: undefined })
    const corpo = d.corpo as { chiedono: number; conversazioni: { chiave: string; chiede: boolean }[] }
    // Due domande dello stesso autopilota nella sua conversazione (0.37.4) + il via.
    // 0.38.0: tutte le domande (le due dello stesso autopilota contano due) + il via.
    expect(corpo.chiedono).toBe(3)
    expect(corpo.conversazioni.map((c) => c.chiave)).toEqual(expect.arrayContaining(['ap:ap-1', 'ap:ap-2', 'chat:pc:port:s-9']))
    expect(corpo.conversazioni.some((c) => c.chiave.startsWith('ap:ap-1:'))).toBe(false)
    // La chat di questo stesso PC non arriva due volte dal battito.
    expect(corpo.conversazioni.some((c) => c.chiave.includes('s-0'))).toBe(false)
    const s = await rotteClient(conPronto())({ metodo: 'GET', percorso: '/api/stato', corpo: undefined })
    expect((s.corpo as { domandeInAttesa: number }).domandeInAttesa).toBe(corpo.chiedono)
  })

  it('dalla colonna si risponde anche a una chat di un altro PC: il testo va la', async () => {
    const scritti: string[] = []
    const su = deps({ ...conPronto(), scriviAltroPc: (pc, sessione, testo) => { scritti.push(`${pc}/${sessione}/${testo}`); return Promise.resolve({ ok: true as const }) } })
    const r = await rotteClient(su)({ metodo: 'POST', percorso: '/api/scrivi', corpo: { chat: 'pc:port:s-9', testo: 'continua' } })
    expect(r.stato).toBe(200)
    expect(scritti).toEqual(['port/s-9/continua'])
    const giu = deps({ ...conPronto(), scriviAltroPc: () => Promise.resolve({ ok: false as const, messaggio: 'Portatile non risponde' }) })
    const e = await rotteClient(giu)({ metodo: 'POST', percorso: '/api/scrivi', corpo: { chat: 'pc:port:s-9', testo: 'x' } })
    expect(e.stato).toBe(502)
    expect((e.corpo as { errore: string }).errore).toContain('non risponde')
  })
})

describe('la linguetta «File» dal telefono (0.38.0)', () => {
  it('elenco e diff in sola lettura; un computer vecchio lo dice', async () => {
    const su = deps({
      fileAutopilota: (id) => Promise.resolve([{ chiave: 'principale', nome: 'Cartella del progetto', cartella: 'C:\p', base: 'x', file: [{ percorso: 'a.ts', stato: 'modificato', piu: 1, meno: 0, salvato: false }] , id }]),
      diffAutopilota: (_id, chiave, percorso) => (percorso === 'a.ts' ? Promise.resolve(`diff ${chiave}`) : Promise.reject(new Error('quel file non è fra quelli cambiati')))
    })
    const f = await rotteClient(su)({ metodo: 'POST', percorso: '/api/autopilota/file', corpo: { autopilota: 'ap-1' } })
    expect((f.corpo as { gruppi: { file: unknown[] }[] }).gruppi[0]?.file).toHaveLength(1)
    const d = await rotteClient(su)({ metodo: 'POST', percorso: '/api/autopilota/diff', corpo: { autopilota: 'ap-1', chat: 'principale', percorso: 'a.ts' } })
    expect((d.corpo as { diff: string }).diff).toBe('diff principale')
    const no = await rotteClient(su)({ metodo: 'POST', percorso: '/api/autopilota/diff', corpo: { autopilota: 'ap-1', chat: 'principale', percorso: '../x' } })
    expect(no.stato).toBe(404)
    const vecchio = await rotteClient(deps())({ metodo: 'POST', percorso: '/api/autopilota/file', corpo: { autopilota: 'ap-1' } })
    expect(vecchio.stato).toBe(409)
  })
})

describe('il nome scelto del PC (0.52.4)', () => {
  const idn = (scelto: string | undefined): { nome: string; host: string; nomeScelto?: string } =>
    ({ nome: scelto ?? 'PC-ESEMPIO', host: 'PC-ESEMPIO', ...(scelto !== undefined ? { nomeScelto: scelto } : {}) })
  it('in /api/stato e /api/pc il nome scelto, con l’hostname a parte', async () => {
    const d = deps({ identitaComputer: () => idn('Studio') })
    const stato = await rotteClient(d)({ metodo: 'GET', percorso: '/api/stato', corpo: undefined })
    expect((stato.corpo as { computer: unknown }).computer).toMatchObject({ nome: 'Studio', host: 'PC-ESEMPIO', nomeScelto: 'Studio' })
    const pc = await rotteLibere(d)({ metodo: 'GET', percorso: '/api/pc', corpo: undefined })
    expect(pc.corpo).toMatchObject({ nome: 'Studio', host: 'PC-ESEMPIO' })
  })
  it('il telefono lo cambia con /api/nome-pc; un altro PC no', async () => {
    let scelto: string | undefined
    const d = deps({ identitaComputer: () => idn(scelto), impostaNomeComputer: (n) => { scelto = n === '' ? undefined : n; return idn(scelto) } })
    const r = await rotteClient(d)({ metodo: 'POST', percorso: '/api/nome-pc', corpo: { nome: 'Studio' }, dispositivo: 'telefono-1' })
    expect(r.corpo).toMatchObject({ ok: true, nome: 'Studio', host: 'PC-ESEMPIO' })
    const daPc = await rotteClient(d)({ metodo: 'POST', percorso: '/api/nome-pc', corpo: { nome: 'Altro' }, dispositivo: 'pc:pc-due' })
    expect(daPc.stato).toBe(403)
    expect(scelto).toBe('Studio')
  })
})

describe('il negozio dal telefono e dalla pagina (0.53.0)', () => {
  it('cerca nel catalogo intero; un computer che non lo sa fare dice 404, non un vuoto', async () => {
    let chiesto = ''
    const su = deps({ cercaPlugin: async (q: string) => { chiesto = q; return { plugin: [], totale: 0 } } })
    const r = await rotteClient(su)({ metodo: 'POST', percorso: '/api/negozio/cerca', corpo: { q: 'documenti' } })
    expect(r.stato).toBe(200)
    expect(chiesto).toBe('documenti')
    expect((await rotteClient(deps({}))({ metodo: 'POST', percorso: '/api/negozio/cerca', corpo: { q: 'x' } })).stato).toBe(404)
  })

  it('installa e aggiorna portano l’impronta del comando confermato; senza impronta non si passa niente', async () => {
    const chiamate: Array<[string, string, string | undefined]> = []
    const su = deps({
      installaPlugin: async (id: string, accetta?: string) => { chiamate.push(['installa', id, accetta]); return { ok: true, fatto: 'Installato.' } },
      aggiornaPlugin: async (id: string, accetta?: string) => { chiamate.push(['aggiorna', id, accetta]); return { ok: true } }
    })
    const sha = 'b'.repeat(64)
    const r1 = await rotteClient(su)({ metodo: 'POST', percorso: '/api/negozio/installa', corpo: { id: 'a@m', accetta: sha } })
    expect(r1.corpo).toEqual({ ok: true, fatto: 'Installato.' })
    await rotteClient(su)({ metodo: 'POST', percorso: '/api/negozio/aggiorna', corpo: { id: 'a@m' } })
    expect(chiamate).toEqual([['installa', 'a@m', sha], ['aggiorna', 'a@m', undefined]])
  })

  it('approvare un MCP del .mcp.json passa da «commuta» con cosa = mcp-approva', async () => {
    let visto: [string, boolean] | undefined
    const su = deps({ approvaMcp: (nome: string, si: boolean) => { visto = [nome, si]; return { ok: true } } })
    const r = await rotteClient(su)({ metodo: 'POST', percorso: '/api/negozio/commuta', corpo: { cosa: 'mcp-approva', nome: 'condiviso', attivo: true } })
    expect(r.corpo).toEqual({ ok: true })
    expect(visto).toEqual(['condiviso', true])
  })

  it('lo stato del collegamento degli MCP, a parte', async () => {
    const su = deps({ saluteMcp: async () => ({ mcp: [], errore: 'Nessuna chat aperta sul computer.' }) })
    const r = await rotteClient(su)({ metodo: 'GET', percorso: '/api/negozio/salute-mcp', corpo: undefined })
    expect(r.corpo).toEqual({ mcp: [], errore: 'Nessuna chat aperta sul computer.' })
  })
})

describe('le chat senza nome (0.60.0)', () => {
  const d = deps({
    sessioni: () => Promise.resolve([
      { id: 's-a', cwd: 'C:\\lavoro', titolo: 'Fatture', quando: '2026-10-10T10:00:00Z' },
      { id: 's-b', cwd: 'C:\\lavoro', titolo: 'lavoro', quando: '2026-10-10T09:00:00Z', senzaNome: true }
    ])
  })
  it('non sono nell’elenco, ma il conto dice quante sono nascoste', async () => {
    const r = await rotteClient(d)({ metodo: 'GET', percorso: '/api/sessioni', corpo: undefined })
    const c = r.corpo as { sessioni: { id: string }[]; nascoste: number }
    expect(c.sessioni.map((s) => s.id)).toEqual(['s-a'])
    expect(c.nascoste).toBe(1)
  })
  it('«mostra anche le senza nome» le rimette: non sono cancellate', async () => {
    const r = await rotteClient(d)({ metodo: 'POST', percorso: '/api/sessioni', corpo: { senzaNome: true } })
    const c = r.corpo as { sessioni: { id: string; senzaNome?: boolean }[]; nascoste: number }
    expect(c.sessioni.map((s) => s.id)).toEqual(['s-a', 's-b'])
    expect(c.sessioni[1]?.senzaNome).toBe(true)
    expect(c.nascoste).toBe(0)
  })
})

describe('0.74.1: la trasformazione dei workspace dalla pagina e dall’app', () => {
  it('stato, «Torna come prima» e «Rifai»; senza il servizio (PC vecchio) 404', async () => {
    let stato: unknown = { stato: 'fatta', dormienti: [] }
    const migrazione = {
      stato: () => stato,
      torna: () => { stato = { stato: 'annullata' }; return { ok: true, messaggio: 'Fatto' } },
      rifai: () => ({ ok: false, messaggio: 'Non riuscita: disco pieno' })
    }
    const r = rotteClient(deps({ migrazione }))
    expect((await r({ metodo: 'GET', percorso: '/api/migrazione', corpo: undefined })).corpo).toEqual({ stato: { stato: 'fatta', dormienti: [] } })
    expect((await r({ metodo: 'POST', percorso: '/api/migrazione/torna', corpo: {} })).stato).toBe(200)
    expect((await r({ metodo: 'GET', percorso: '/api/migrazione', corpo: undefined })).corpo).toEqual({ stato: { stato: 'annullata' } })
    expect(await r({ metodo: 'POST', percorso: '/api/migrazione/rifai', corpo: {} })).toEqual({ stato: 409, corpo: { errore: 'Non riuscita: disco pieno' } })
    expect((await rotteClient(deps())({ metodo: 'GET', percorso: '/api/migrazione', corpo: undefined })).stato).toBe(404)
  })
})

describe('0.77.0: la Panoramica del workspace per la pagina e l’app', () => {
  it('il riassunto dell’autopilota e una scheda per chat del workspace, in ordine: aspettano te, al lavoro, ferme', async () => {
    const ap = { ...nuovoAutopilota({ id: 'ap-1', nome: 'Notte', obiettivo: 'Fai passare la suite', cwd: 'C:\p', iniziatoIl: '2026-08-12T10:00:00.000Z' }), workspace: 'lavoro', stato: 'lavoro' as const }
    const r = await rotteClient(deps({
      autopiloti: () => Promise.resolve([ap]),
      chat: () => [
        { id: 'p-1', titolo: 'chat ferma', cwd: 'C:\p', workspace: 'lavoro', aspetta: true, viva: true },
        { id: 'p-2', titolo: 'Sviluppo · Notte', cwd: 'C:\p', workspace: 'lavoro', aspetta: false, viva: true, coda: ['● Scrivo il test', '❯ ', '  ? for shortcuts'] },
        { id: 'p-3', titolo: 'chiede', cwd: 'C:\p', workspace: 'lavoro', aspetta: true, viva: true, chiedeSegnale: true },
        { id: 'p-4', titolo: 'di un altro workspace', cwd: 'C:\p', workspace: 'casa', aspetta: false, viva: true }
      ] as never
    }))({ metodo: 'POST', percorso: '/api/panoramica', corpo: { workspace: 'lavoro' } })
    const c = r.corpo as { autopilota: string; riassunto: { obiettivo: string; criteri: { testo: string } }; schede: { id: string; stato: string; ruolo?: string; righe: string[] }[] }
    expect(c.autopilota).toBe('ap-1')
    expect(c.riassunto.obiettivo).toBe('Fai passare la suite')
    expect(c.riassunto.criteri.testo).toBe('—')
    expect(c.schede.map((s) => [s.id, s.stato])).toEqual([['p-3', 'chiede'], ['p-2', 'lavora'], ['p-1', 'ferma']])
    expect(c.schede[1]).toMatchObject({ ruolo: 'sviluppo', righe: ['● Scrivo il test'] })
  })
  it('senza workspace: 400; la rotta passa dal ponte', async () => {
    const r = await rotteClient(deps())({ metodo: 'POST', percorso: '/api/panoramica', corpo: {} })
    expect(r.stato).toBe(400)
    const { ROTTE_PONTE } = await import('@shared/ponte-telefono')
    expect(ROTTE_PONTE).toContain('/api/panoramica')
  })
})

// 0.81.0, voce 7 dell'analisi: /api/domande erano quattro chiamate al servizio per ogni
// richiesta, e la chiedono PC, pagina e app ogni 2-3 s ciascuno.
describe('/api/domande non moltiplica le chiamate al servizio', () => {
  it('entro un secondo, e mentre una lettura è in viaggio, si usa quella; un POST la dimentica; dopo un secondo si rilegge', async () => {
    let ora = 1_000_000
    let lette = 0
    const rotte = rotteClient(deps({
      adesso: () => ora,
      domande: () => { lette += 1; return new Promise((r) => setTimeout(() => r([{ id: 'd-1', autopilotaId: 'ap-1', testo: 'Quale chiave?' }]), 20)) }
    }))
    const get = (): Promise<unknown> => rotte({ metodo: 'GET', percorso: '/api/domande', corpo: undefined })
    const [a, b] = await Promise.all([get(), get()])
    expect(lette).toBe(1)
    expect(a).toEqual(b)
    ora += 500
    await get()
    expect(lette).toBe(1)
    await rotte({ metodo: 'POST', percorso: '/api/rispondi', corpo: { domanda: 'd-1', risposta: 'sì' } })
    await get()
    expect(lette).toBe(2)
    ora += 1001
    await get()
    expect(lette).toBe(3)
  })

  it('ogni visore ha la sua lettura: le chat chiuse dal PIN non passano da uno all’altro', async () => {
    let lette = 0
    const rotte = rotteClient(deps({ adesso: () => 5, domande: () => { lette += 1; return Promise.resolve([]) } }))
    await rotte({ metodo: 'GET', percorso: '/api/domande', corpo: undefined, dispositivo: 'tel-a' })
    await rotte({ metodo: 'GET', percorso: '/api/domande', corpo: undefined, dispositivo: 'tel-b' })
    expect(lette).toBe(2)
  })
})

describe('0.81.0: ogni notifica del telefono nel registro con la causa', () => {
  it('la pagina e l app dicono tipo, titolo, causa e il gruppo; un telefono vecchio senza causa lo dice', async () => {
    const righe: string[] = []
    const r = rotteClient(deps({ log: (riga: string) => { righe.push(riga) } }))
    await r({ metodo: 'POST', percorso: '/api/avviso-mostrato', corpo: { da: 'pagina', tipo: 'fermo', titolo: 'Sito si è fermato', causa: 'autopilota ap-1 sospeso:  la chat non parte', gruppo: 2 } })
    await r({ metodo: 'POST', percorso: '/api/avviso-mostrato', corpo: { da: 'app', tipo: 'f', titolo: 'SierraDeck ha finito un lavoro', causa: 'autopilota ap-1 finito' } })
    await r({ metodo: 'POST', percorso: '/api/avviso-mostrato', corpo: { da: 'app', tipo: 'd', titolo: 'Una domanda' } })
    expect(righe).toEqual([
      '[avviso] pagina del telefono: fermo «Sito si è fermato», causa: autopilota ap-1 sospeso: la chat non parte (in un gruppo di 2)',
      '[avviso] app del telefono: f «SierraDeck ha finito un lavoro», causa: autopilota ap-1 finito',
      '[avviso] app del telefono: d «Una domanda», causa: non detta (versione vecchia)'
    ])
  })
})
