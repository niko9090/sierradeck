import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { creaServer, type ServerAutopiloti } from '../../src/autopilot-host/server'
import { apriArchivio, type Archivio } from '../../src/autopilot-host/archivio'
import { creaRegistroDomande } from '../../src/autopilot-host/domande'
import { apriMemoria } from '../../src/autopilot-host/memoria'
import { argomentoDi, risoltaDalloStato, type StatoVero } from '../../src/autopilot-host/domande-doppie'
import { creaStatoVero, releaseConMemoria, statoDellaFlotta, versioniPubblicate } from '../../src/autopilot-host/stato-vero'
import type { Git } from '../../src/autopilot-host/worktree'
import { nuovoAutopilota, type Autopilota } from '@shared/autopilota'
import { conversazione } from '@shared/chat-autopilota'

/**
 * Le domande controllate contro lo stato vero (0.82.0).
 *
 * Il caso vero, 20/10: a Nicholas è arrivato «Pubblico adesso una 0.81.1 con
 * le correzioni di c-310?» quando la 0.81.1 era già pubblicata (non bozza) e
 * già installata sul suo PC. Il programma guardava solo la versione in uso, e
 * «una 0.81.1» non la riconosceva nemmeno come versione.
 */

const VERA = 'Pubblico adesso una 0.81.1 con le correzioni di c-310 (le chat chiuse non ricevono più giri)?'
const DOPO = { versioneInstallata: '0.81.1', releasePubblicate: ['0.81.1', '0.81.0', '0.80.1', '0.80.0'] }

describe('pubblicare una versione già pubblicata', () => {
  it('il caso vero del 20/10: la 0.81.1 già pubblicata e installata non si chiede', () => {
    expect(argomentoDi(VERA)).toEqual({ installa: false, pubblica: true, versioni: ['0.81.1'] })
    expect(risoltaDalloStato(VERA, DOPO)).toBe('la 0.81.1 è già pubblicata')
  })

  it('le forme di tutti i giorni: «pubblico la», «release», «publish», «faccio uscire la v»', () => {
    for (const d of ['Pubblico la 0.81.1?', 'Faccio la release 0.81.1 adesso?', 'Should I publish 0.81.1 now?', 'Rilascio la v0.81.1 su GitHub?']) {
      expect(risoltaDalloStato(d, DOPO), d).toBeDefined()
    }
  })

  it('una versione non ancora uscita, o senza l elenco delle release, si chiede', () => {
    expect(risoltaDalloStato('Pubblico adesso la 0.82.0?', DOPO)).toBeUndefined()
    expect(risoltaDalloStato(VERA, { versioneInstallata: '0.81.1' })).toBeUndefined()
    expect(risoltaDalloStato('Pubblico adesso?', DOPO)).toBeUndefined()
    // Due versioni: tutte e due devono essere fuori.
    expect(risoltaDalloStato('Pubblico la 0.81.1 e poi la 0.82.0?', DOPO)).toBeUndefined()
  })

  it('pubblicare e installare insieme: devono essere vere tutte e due', () => {
    expect(risoltaDalloStato('Pubblico la 0.81.1 e la installi tu?', DOPO)).toBe('la 0.81.1 è già pubblicata, e su questo PC è già installata la 0.81.1')
    expect(risoltaDalloStato('La 0.81.1 è pubblicata: la installi tu?', { ...DOPO, versioneInstallata: '0.81.0' })).toBeUndefined()
  })

  it('un numero di pacchetto resta fuori', () => {
    expect(risoltaDalloStato('Pubblico il pacchetto con vitest 0.34.6?', { releasePubblicate: ['0.34.6'] })).toBeUndefined()
  })
})

describe('rami e chat', () => {
  const chat: StatoVero['chat'] = [
    { id: 'c-310', ramo: 'ap/ap-x/c-310', finita: true },
    { id: 'c-15', ramo: 'ap/ap-x/c-15', finita: true },
    { id: 'c-34', ramo: 'ap/ap-x/c-34', finita: false }
  ]
  const ramoUnito = (r: string): boolean | undefined => (r.endsWith('c-310') ? true : r.endsWith('c-34') ? false : undefined)

  it('«unisco c-310?» col ramo già nel principale non si chiede', () => {
    expect(risoltaDalloStato('Unisco il ramo di c-310 in main?', { chat, ramoUnito })).toBe('il ramo di c-310 è già nel ramo principale')
    expect(risoltaDalloStato('Faccio il merge di ap/ap-x/c-310?', { chat, ramoUnito })).toBeDefined()
  })

  it('«chiudo la c-15?» con la chat già finita non si chiede', () => {
    expect(risoltaDalloStato('Chiudo la chat c-15?', { chat, ramoUnito })).toBe('la chat c-15 è già chiusa')
  })

  it('un ramo non unito, una chat aperta, una chat che non conosco: si chiede', () => {
    expect(risoltaDalloStato('Unisco c-34 in main?', { chat, ramoUnito })).toBeUndefined()
    expect(risoltaDalloStato('Unisco c-15?', { chat, ramoUnito })).toBeUndefined()
    expect(risoltaDalloStato('Chiudo la c-34?', { chat, ramoUnito })).toBeUndefined()
    expect(risoltaDalloStato('Chiudo la c-15 e la c-99?', { chat, ramoUnito })).toBeUndefined()
    expect(risoltaDalloStato('Chiudo la c-15?', {})).toBeUndefined()
  })
})

describe('dove si legge lo stato vero', () => {
  it('gh release list: senza bozze, senza la «v», e niente se l uscita non è JSON', () => {
    expect(versioniPubblicate('[{"tagName":"v0.81.1","isDraft":false},{"tagName":"v0.82.0","isDraft":true},{"tagName":"0.81.0"}]')).toEqual(['0.81.1', '0.81.0'])
    expect(versioniPubblicate('gh: not logged in')).toBeUndefined()
  })

  it('le release si rileggono al più ogni tanto; una lettura fallita non si ricorda', async () => {
    let letture = 0
    let ora = 0
    let risposta: string[] | undefined = undefined
    const r = releaseConMemoria(() => { letture += 1; return Promise.resolve(risposta) }, 60_000, () => ora)
    expect(await r('/p')).toBeUndefined()
    risposta = ['0.81.1']
    expect(await r('/p')).toEqual(['0.81.1'])
    ora = 30_000
    expect(await r('/p')).toEqual(['0.81.1'])
    expect(letture).toBe(2)
    ora = 90_000
    await r('/p')
    expect(letture).toBe(3)
  })

  const ap = (cwd: string): Autopilota => ({
    ...nuovoAutopilota({ id: 'ap-sv', nome: 'Sv', obiettivo: 'o', cwd, criteri: [], iniziatoIl: '2026-10-20T06:00:00.000Z' }),
    ramoBase: 'main',
    chats: [
      { id: 'c-1', compito: 'a', stato: 'finita', cicli: 1, ramo: 'ap/ap-sv/c-1', approvata: true },
      { id: 'c-2', compito: 'b', stato: 'lavoro', cicli: 1, ramo: 'ap/ap-sv/c-2' },
      { id: 'c-3', compito: 'c', stato: 'lavoro', cicli: 1, ramo: 'ap/ap-sv/c-3' }
    ]
  })

  it('la versione installata vale solo per il progetto del programma', async () => {
    const stato = creaStatoVero({ versione: '0.81.1', nome: (cwd) => (cwd === '/sd' ? 'sierradeck' : 'nexora') })
    expect((await stato(ap('/sd'))).versioneInstallata).toBe('0.81.1')
    expect((await stato(ap('/altro'))).versioneInstallata).toBeUndefined()
    expect(risoltaDalloStato('Installo la 0.3.0?', await stato(ap('/altro')))).toBeUndefined()
  })

  it('un ramo approvato è unito; gli altri li dice git, e un ramo sparito non si sa', () => {
    const git: Git = (args) => ({ codice: args[2] === 'ap/ap-sv/c-2' ? 0 : args[2] === 'ap/ap-sv/c-3' ? 128 : 1, uscita: '' })
    const s = statoDellaFlotta(ap('/sd'), git)
    expect(s.chat?.map((c) => [c.id, c.finita])).toEqual([['c-1', true], ['c-2', false], ['c-3', false]])
    expect(s.ramoUnito?.('ap/ap-sv/c-1')).toBe(true)
    expect(s.ramoUnito?.('ap/ap-sv/c-2')).toBe(true)
    expect(s.ramoUnito?.('ap/ap-sv/c-3')).toBeUndefined()
    expect(statoDellaFlotta(ap('/sd'), undefined).ramoUnito?.('ap/ap-sv/c-2')).toBeUndefined()
  })

  it('gh che fallisce non ferma niente: la domanda passa', async () => {
    const stato = creaStatoVero({ release: () => Promise.reject(new Error('gh assente')) })
    expect((await stato(ap('/sd'))).releasePubblicate).toBeUndefined()
  })
})

// ─── Dal vero, nel servizio ──────────────────────────────────────────────

let server: ServerAutopiloti | undefined
let porta: number
let archivio: Archivio
let scritti: { chat?: string; messaggio?: string }[]

const parti = (domanda: string): Record<string, unknown> => ({
  staFacendo: 'La Revisione ha approvato c-310 ed è unito in main.',
  domanda,
  perche: 'Senza una release nuova le correzioni non arrivano ai PC.',
  scelte: [{ scelta: 'Sì, pubblica', conseguenza: 'faccio la release adesso', consigliata: true }, { scelta: 'No', conseguenza: 'aspetto la prossima' }],
  seNonRispondi: 'Aspetto e intanto vado avanti con il resto.'
})

async function avvia(giudizio: string, stato: StatoVero | undefined): Promise<void> {
  archivio = apriArchivio(mkdtempSync(join(tmpdir(), 'ap-statovero-')))
  scritti = []
  const s = creaServer({
    archivio,
    memoria: apriMemoria(undefined),
    versione: '0.81.1',
    ...(stato !== undefined ? { statoVero: () => Promise.resolve(stato) } : {}),
    esegui: () => Promise.resolve({ codice: 0, uscita: 'ok' }),
    interroga: () => Promise.resolve({ testo: giudizio }),
    avviaLavoro: (_a, messaggio, chat) => {
      scritti.push({ ...(chat !== undefined ? { chat: chat.id } : {}), ...(messaggio !== undefined ? { messaggio } : {}) })
      return Promise.resolve()
    },
    fermaLavoro: () => {},
    avvisa: () => Promise.resolve(),
    domande: creaRegistroDomande({ adesso: () => Date.now() }),
    ultimoDetto: () => 'ho una domanda',
    scadenzaDomandaMs: 5000,
    scadenzaInterviataMs: 5000,
    adesso: () => new Date().toISOString()
  })
  server = s
  await new Promise<void>((ris) => { s.listen(0, '127.0.0.1', () => { porta = (s.address() as { port: number }).port; ris() }) })
  archivio.scrivi({
    ...nuovoAutopilota({ id: 'ap-rel', nome: 'Analisi', obiettivo: 'Chiudi la 0.81.x', cwd: process.cwd(), criteri: [{ descrizione: 'c', comando: 'node c.js', soddisfatto: false }], iniziatoIl: '2026-10-20T06:00:00.000Z' }),
    stato: 'lavoro',
    chats: [{ id: 'c-4', compito: 'Analisi e rilascio', stato: 'lavoro', cicli: 1, sessionId: 's-4' }]
  })
}

async function notifica(): Promise<void> {
  await fetch(`http://127.0.0.1:${porta}/hook/notification?ap=ap-rel&chat=c-4`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ notification_type: 'attesa', message: 'Claude is waiting for your input' })
  })
}

const aperte = async (): Promise<unknown[]> => (await (await fetch(`http://127.0.0.1:${porta}/domande`)).json()) as unknown[]

afterEach(() => { server?.close(); server = undefined })

describe('nel servizio', () => {
  it('il 20/10 dal vero: «pubblico la 0.81.1?» non arriva, il registro e la conversazione dicono «già fatto»', async () => {
    await avvia(JSON.stringify({ azione: 'chiedi', domanda: parti(VERA) }), DOPO)
    await notifica()
    expect(await aperte()).toEqual([])
    for (let i = 0; i < 80 && scritti.length === 0; i += 1) await new Promise((r) => setTimeout(r, 25))
    expect(scritti[0]?.messaggio).toContain('la 0.81.1 è già pubblicata')
    const a = archivio.leggi('ap-rel')!
    expect(a.decisioni.at(-1)?.cosa).toContain('non la chiedo: la 0.81.1 è già pubblicata')
    expect(a.decisioni.at(-1)?.traguardo).toEqual({ chat: 'c-4', esito: 'gia-fatto', nota: 'la 0.81.1 è già pubblicata' })
    const righe = conversazione(a).filter((b) => b.tono === 'traguardo').map((b) => b.testo)
    expect(righe).toContain('Già fatto: la 0.81.1 è già pubblicata. Non te lo chiedo.')
  })

  it('una release non ancora uscita arriva a Nicholas', async () => {
    await avvia(JSON.stringify({ azione: 'chiedi', domanda: parti('Pubblico adesso la 0.82.0 con le correzioni di c-310?') }), DOPO)
    await notifica()
    expect(await aperte()).toHaveLength(1)
  })
})
