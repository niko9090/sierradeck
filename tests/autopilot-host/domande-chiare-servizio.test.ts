import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { creaServer, type ServerAutopiloti } from '../../src/autopilot-host/server'
import { apriArchivio, type Archivio } from '../../src/autopilot-host/archivio'
import { creaRegistroDomande, type RegistroDomande } from '../../src/autopilot-host/domande'
import { apriMemoria } from '../../src/autopilot-host/memoria'
import type { StatoVero } from '../../src/autopilot-host/domande-doppie'
import { nuovoAutopilota, type ChatGovernata } from '@shared/autopilota'
import { sigleIn } from '@shared/domanda-chiara'
import { orologioDa } from '../setup/orologio'

// L'orologio del servizio di prova parte da un istante fisso e avanza col
// tempo vero: le attese funzionano come prima, il giorno non cambia mai.
const orologio = orologioDa('2026-10-29T10:00:00.000Z')

/**
 * Domande chiare nel servizio (0.84.0), con i casi veri del 21/10:
 * - due domande «idle_prompt: Claude is waiting for your input» con
 *   «⚠ Domanda incompleta», di chat che avevano solo finito («la chat la chiudi tu»);
 * - le stesse due rimaste nella scheda Domande quando le chat erano già chiuse;
 * - 19 risposte dell'autopilota mostrate sotto «Claude is waiting for your input»
 *   invece che sotto la domanda vera.
 */

const DETTO = 'Nella mia cartella di lavoro non c’era niente da salvare: nessun file modificato fuori dal commit già fatto. Quindi non ho fatto nuovi commit e mi fermo qui, come chiesto; la chat la chiudi tu.'
const COMPITO = 'Ristrutturazione dell’app Android: le quattro voci in basso'

let server: ServerAutopiloti | undefined
let porta: number
let archivio: Archivio
let registro: RegistroDomande
let scritti: { chat?: string; messaggio?: string }[]

async function avvia(p: { interroga: () => Promise<{ testo: string }>; chats: ChatGovernata[]; stato?: StatoVero; detto?: string }): Promise<void> {
  archivio = apriArchivio(mkdtempSync(join(tmpdir(), 'ap-chiare-')))
  registro = creaRegistroDomande({ adesso: orologio.ms })
  scritti = []
  const s = creaServer({
    archivio,
    memoria: apriMemoria(undefined),
    ...(p.stato !== undefined ? { statoVero: () => Promise.resolve(p.stato!) } : {}),
    esegui: () => Promise.resolve({ codice: 0, uscita: 'ok' }),
    interroga: p.interroga,
    avviaLavoro: (_a, messaggio, chat) => {
      scritti.push({ ...(chat !== undefined ? { chat: chat.id } : {}), ...(messaggio !== undefined ? { messaggio } : {}) })
      return Promise.resolve()
    },
    fermaLavoro: () => {},
    avvisa: () => Promise.resolve(),
    domande: registro,
    ultimoDetto: () => p.detto ?? DETTO,
    scadenzaDomandaMs: 5000,
    scadenzaInterviataMs: 5000,
    adesso: orologio.iso
  })
  server = s
  await new Promise<void>((ris) => { s.listen(0, '127.0.0.1', () => { porta = (s.address() as { port: number }).port; ris() }) })
  archivio.scrivi({
    ...nuovoAutopilota({ id: 'ap-and', nome: 'App Android', obiettivo: '0.83.0 (minor), una sola release', cwd: process.cwd(), criteri: [{ descrizione: 'c', comando: 'node c.js', soddisfatto: false }], iniziatoIl: '2026-10-21T06:00:00.000Z' }),
    stato: 'lavoro',
    chats: p.chats
  })
}

const chat = (id: string, compito: string, stato: ChatGovernata['stato'] = 'lavoro'): ChatGovernata => ({ id, compito, stato, cicli: 1, sessionId: `s-${id}` })

async function notifica(chatId: string): Promise<void> {
  await fetch(`http://127.0.0.1:${porta}/hook/notification?ap=ap-and&chat=${chatId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ notification_type: 'idle_prompt', message: 'Claude is waiting for your input' })
  })
}

afterEach(() => { server?.close(); server = undefined })

/** Un ultimo messaggio che finisce davvero con una domanda: «idle_prompt» allora è una domanda (0.86.2). */
const DETTO_CHIEDE = `${DETTO}

Per le prove uso la chiave di prova o quella vera?`

describe('la chat ferma quando il supervisore non risponde', () => {
  it('21/10 dal vero: niente «Claude is waiting», niente avvertenza, la domanda è quella della chat', async () => {
    await avvia({ interroga: () => Promise.reject(new Error('scaduto')), chats: [chat('c-23', COMPITO)], detto: DETTO_CHIEDE })
    await notifica('c-23')
    const [d] = registro.aperte('ap-and')
    expect(d).toBeDefined()
    expect(d!.testo).not.toContain('Claude is waiting')
    expect(d!.testo).not.toContain('idle_prompt')
    expect(d!.avvertenza).toBeUndefined()
    expect(d!.testo).toContain('Per le prove uso la chiave di prova o quella vera?')
  })
  it('0.86.2: una chat che ha solo finito («idle_prompt» senza domanda) non diventa una domanda', async () => {
    let chiamate = 0
    await avvia({ interroga: () => { chiamate += 1; return Promise.reject(new Error('scaduto')) }, chats: [chat('c-23', COMPITO)] })
    await notifica('c-23')
    expect(registro.aperte('ap-and')).toEqual([])
    expect(registro.risolte('ap-and')).toEqual([])
    expect(chiamate).toBe(0)
  })
})

describe('le sigle nelle domande del supervisore', () => {
  it('«Installi tu la 0.80.0…, così chiudo le chat finite c-7 e c-12?» arriva con i compiti, non con le sigle', async () => {
    const domanda = {
      staFacendo: 'Sto chiudendo il lavoro della versione 0.80.0.',
      domanda: 'Installi tu la 0.80.0 su questo PC, così chiudo le chat finite c-7 e c-12?',
      perche: 'Le chat finite si chiudono da sole solo con la versione nuova.',
      scelte: [{ scelta: 'la installo io', conseguenza: 'aspetto e poi chiudo le chat finite', consigliata: true }, { scelta: 'non adesso', conseguenza: 'lascio tutto com’è' }],
      seNonRispondi: 'aspetto senza chiudere niente'
    }
    await avvia({
      interroga: () => Promise.resolve({ testo: JSON.stringify({ azione: 'chiedi', domanda }) }),
      chats: [chat('c-23', COMPITO), chat('c-7', 'Collaudo della gestione delle chat', 'finita'), chat('c-12', 'Rilascio 0.80.0', 'finita')],
      detto: DETTO_CHIEDE
    })
    await notifica('c-23')
    const [d] = registro.aperte('ap-and')
    expect(d).toBeDefined()
    expect(sigleIn(d!.testo)).toEqual([])
    expect(d!.parti?.domanda).toBe('Installi tu la 0.80.0 su questo PC, così chiudo le chat finite «Collaudo della gestione delle chat» e «Rilascio 0.80.0»?')
  })
})

describe('la risposta dell’autopilota accanto alla domanda intera', () => {
  it('senza «?» in fondo non c’è una domanda: niente risolta con «Claude is waiting for your input» (0.86.2)', async () => {
    await avvia({ interroga: () => Promise.resolve({ testo: JSON.stringify({ azione: 'rispondo', risposta: 'Va bene così: hai finito, fermati.' }) }), chats: [chat('c-23', COMPITO)] })
    await notifica('c-23')
    expect(registro.risolte('ap-and')).toEqual([])
  })
  it('con la domanda in fondo, la risolta porta la domanda vera', async () => {
    await avvia({ interroga: () => Promise.resolve({ testo: JSON.stringify({ azione: 'rispondo', risposta: 'Chiudila tu.' }) }), chats: [chat('c-23', COMPITO)], detto: DETTO_CHIEDE })
    await notifica('c-23')
    const [r] = registro.risolte('ap-and')
    expect(r?.domanda).toBe('Per le prove uso la chiave di prova o quella vera?')
    expect(r?.risposta).toBe('Chiudila tu.')
  })
})

describe('le domande già nella scheda, ricontrollate', () => {
  it('21/10 dal vero: la domanda di una chat già chiusa si chiude, con la domanda intera e il motivo', async () => {
    await avvia({ interroga: () => Promise.reject(new Error('no')), chats: [chat('c-22', COMPITO, 'finita'), chat('c-24', 'Esito dei test di main')] })
    const d = registro.apri({ autopilotaId: 'ap-and', testo: 'idle_prompt: Claude is waiting for your input\n\nLa chat aveva appena detto:\nla chat la chiudi tu', scadenzaMs: 5000 })
    registro.ricorda(d.id, { autopilotaId: 'ap-and', testo: d.testo, grezza: d.testo, chatId: 'c-22' })
    const viva = registro.apri({ autopilotaId: 'ap-and', testo: 'Uso la porta 8080 per l’emulatore?', scadenzaMs: 5000 })
    registro.ricorda(viva.id, { autopilotaId: 'ap-and', testo: viva.testo, chatId: 'c-24' })

    expect(await server!.ricontrollaDomande()).toBe(1)
    expect(registro.aperte('ap-and').map((x) => x.id)).toEqual([viva.id])
    const [r] = registro.risolte('ap-and')
    expect(r?.domanda).toContain('la chat la chiudi tu')
    expect(r?.risposta).toBe(`Superata, non serve più: la chat che lavorava a «${COMPITO}» è finita`)
    expect(archivio.leggi('ap-and')!.decisioni.at(-1)?.cosa).toContain('domanda chiusa perché superata')
    // Una seconda passata non trova più niente.
    expect(await server!.ricontrollaDomande()).toBe(0)
  })

  it('una domanda agganciata da più chat resta finché una di loro lavora ancora', async () => {
    await avvia({ interroga: () => Promise.reject(new Error('no')), chats: [chat('c-22', COMPITO, 'finita'), chat('c-44', 'Velocità dell’app', 'bloccata')] })
    const d = registro.apri({ autopilotaId: 'ap-and', testo: 'Riavvio la sessione con Git nel PATH?', scadenzaMs: 5000 })
    registro.ricorda(d.id, { autopilotaId: 'ap-and', testo: d.testo, chatId: 'c-22', ancheChat: ['c-44'] })
    expect(await server!.ricontrollaDomande()).toBe(0)
    expect(registro.aperte('ap-and')).toHaveLength(1)
  })

  it('una domanda già risolta dallo stato vero si chiude e la chat ferma riparte sapendolo', async () => {
    await avvia({
      interroga: () => Promise.reject(new Error('no')),
      chats: [chat('c-29', 'Correzione delle chat chiuse', 'bloccata')],
      stato: { releasePubblicate: ['0.81.1'], versioneInstallata: '0.81.1' }
    })
    const d = registro.apri({ autopilotaId: 'ap-and', testo: 'Pubblico adesso una 0.81.1 con la correzione delle chat chiuse?', scadenzaMs: 5000 })
    registro.ricorda(d.id, { autopilotaId: 'ap-and', testo: d.testo, grezza: d.testo, chatId: 'c-29' })
    expect(await server!.ricontrollaDomande()).toBe(1)
    expect(registro.aperte('ap-and')).toEqual([])
    expect(registro.risolte('ap-and')[0]?.risposta).toContain('la 0.81.1 è già pubblicata')
    expect(scritti.find((x) => x.chat === 'c-29')?.messaggio).toContain('Non serve più chiederlo')
    expect(archivio.leggi('ap-and')!.chats.find((c) => c.id === 'c-29')?.stato).toBe('lavoro')
  })

  it('una domanda che un hook sta ancora aspettando non si tocca', async () => {
    await avvia({ interroga: () => Promise.reject(new Error('no')), chats: [chat('c-22', COMPITO, 'finita')] })
    const d = registro.apri({ autopilotaId: 'ap-and', testo: 'Uso la porta 8080?', scadenzaMs: 5000 })
    registro.ricorda(d.id, { autopilotaId: 'ap-and', testo: d.testo, chatId: 'c-22', trattenuta: true })
    expect(await server!.ricontrollaDomande()).toBe(0)
  })
})

describe('le correzioni della Revisione (0.84.0)', () => {
  it('una domanda che un hook sta aspettando non si chiude come superata', async () => {
    await avvia({ interroga: () => Promise.reject(new Error('no')), chats: [chat('c-22', COMPITO, 'finita')] })
    const d = registro.apri({ autopilotaId: 'ap-and', testo: 'Pubblico adesso?', scadenzaMs: 5000 })
    registro.ricorda(d.id, { autopilotaId: 'ap-and', testo: d.testo, chatId: 'c-22', pubblica: true })
    const attesa = registro.attendi(d.id)
    expect(await server!.ricontrollaDomande()).toBe(0)
    expect(registro.aperte('ap-and')).toHaveLength(1)
    registro.rispondi(d.id, 'sì', 'modale')
    expect(await attesa).toEqual({ risposta: 'sì', da: 'modale' })
  })

  it('la domanda generica del programma non riceve da sola un «fermati» di prima', async () => {
    const memoria = apriMemoria(undefined)
    memoria.ricordaRisposta('ap-and', `Cosa deve fare adesso la chat che lavora a «${COMPITO}»?`, 'fermati', orologio.iso(), 'c-23')
    archivio = apriArchivio(mkdtempSync(join(tmpdir(), 'ap-chiare-')))
    registro = creaRegistroDomande({ adesso: orologio.ms })
    const s = creaServer({
      archivio, memoria,
      esegui: () => Promise.resolve({ codice: 0, uscita: 'ok' }),
      interroga: () => Promise.reject(new Error('no')),
      avviaLavoro: () => Promise.resolve(),
      fermaLavoro: () => {},
      avvisa: () => Promise.resolve(),
      domande: registro,
      ultimoDetto: () => `Ho finito la parte delle foto e mi fermo.

Passo alla parte dei video?`,
      scadenzaDomandaMs: 5000,
      scadenzaInterviataMs: 5000,
      adesso: orologio.iso
    })
    server = s
    await new Promise<void>((ris) => { s.listen(0, '127.0.0.1', () => { porta = (s.address() as { port: number }).port; ris() }) })
    archivio.scrivi({
      ...nuovoAutopilota({ id: 'ap-and', nome: 'App Android', obiettivo: 'x', cwd: process.cwd(), criteri: [{ descrizione: 'c', comando: 'node c.js', soddisfatto: false }], iniziatoIl: '2026-10-21T06:00:00.000Z' }),
      stato: 'lavoro',
      chats: [chat('c-23', COMPITO)]
    })
    await notifica('c-23')
    expect(registro.aperte('ap-and')).toHaveLength(1)
  })

  it('due chat che chiedono la stessa cosa con le sigle: una domanda sola', async () => {
    const domanda = {
      staFacendo: 'Sto chiudendo il lavoro della versione 0.80.0.',
      domanda: 'Chiudo adesso le chat finite c-7 e c-12, che hanno il ramo già in main?',
      perche: 'Restano nell’elenco e confondono.',
      scelte: [{ scelta: 'sì, chiudile', conseguenza: 'le chiudo e la conversazione va nel recupero', consigliata: true }, { scelta: 'no', conseguenza: 'restano aperte' }],
      seNonRispondi: 'le lascio aperte'
    }
    await avvia({
      interroga: () => Promise.resolve({ testo: JSON.stringify({ azione: 'chiedi', domanda }) }),
      chats: [chat('c-23', COMPITO), chat('c-24', 'Velocità dell’app'), chat('c-7', 'Collaudo della gestione delle chat'), chat('c-12', 'Rilascio 0.80.0')],
      detto: DETTO_CHIEDE
    })
    await notifica('c-23')
    await notifica('c-24')
    expect(registro.aperte('ap-and')).toHaveLength(1)
  })
})
