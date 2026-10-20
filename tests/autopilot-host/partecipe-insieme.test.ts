import { describe, it, expect, afterEach, vi } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { creaServer, type ServerAutopiloti } from '../../src/autopilot-host/server'
import { apriArchivio, type Archivio } from '../../src/autopilot-host/archivio'
import { creaRegistroDomande } from '../../src/autopilot-host/domande'
import { apriMemoria } from '../../src/autopilot-host/memoria'
import { conversazione } from '@shared/chat-autopilota'
import { adessoDi } from '@shared/adesso'
import { nuovoAutopilota, type Autopilota } from '@shared/autopilota'

/**
 * «Nicholas partecipe» tutto insieme (0.81.0), passando dalle rotte vere del
 * servizio: una chat chiede, Nicholas risponde dal pannello delle domande, la
 * conversazione dice «Hai risposto: …» e chi l'ha ricevuta, la stessa domanda
 * di nuovo dalla stessa chat si scarta con una riga nel registro, e «Adesso»
 * ha una riga per chat.
 *
 * I pezzi hanno i loro test (domande-doppie, partecipe); questo controlla che
 * le frasi che il servizio scrive davvero siano quelle che la conversazione
 * riconosce.
 */

let server: ServerAutopiloti | undefined
let porta: number
let archivio: Archivio
let scritti: { chat?: string; messaggio?: string }[]
let giudizio: string

const DOMANDA = {
  staFacendo: 'Sto preparando la prova sul server del progetto.',
  domanda: 'Quale chiave SSH uso per il server di prova del progetto?',
  perche: 'Ce ne sono due nella cartella e non so quale è attiva.',
  scelte: [{ scelta: 'Quella nuova', conseguenza: 'provo con la nuova', consigliata: true }, { scelta: 'Quella vecchia', conseguenza: 'provo con la vecchia' }],
  seNonRispondi: 'Aspetto e intanto vado avanti con il resto.'
}

function flotta(): Autopilota {
  return {
    ...nuovoAutopilota({
      id: 'ap-insieme',
      nome: 'Prova',
      obiettivo: 'Prepara la prova sul server',
      cwd: process.cwd(),
      criteri: [{ descrizione: 'test verdi', comando: 'npm test', soddisfatto: false }],
      iniziatoIl: '2026-10-20T06:00:00.000Z'
    }),
    stato: 'lavoro',
    chats: ['c-1', 'c-2'].map((id) => ({ id, compito: `compito di ${id}`, stato: 'lavoro' as const, cicli: 1, sessionId: id }))
  }
}

async function avvia(): Promise<void> {
  archivio = apriArchivio(mkdtempSync(join(tmpdir(), 'ap-insieme-')))
  scritti = []
  giudizio = JSON.stringify({ azione: 'chiedi', domanda: DOMANDA })
  const s = creaServer({
    archivio,
    memoria: apriMemoria(mkdtempSync(join(tmpdir(), 'ap-insieme-mem-'))),
    versione: '0.81.0',
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
  await new Promise<void>((ris) => s.listen(0, '127.0.0.1', () => { porta = (s.address() as { port: number }).port; ris() }))
}

afterEach(() => { server?.close(); server = undefined; vi.restoreAllMocks() })

const url = (p: string): string => `http://127.0.0.1:${porta}${p}`
const notifica = (chat: string): Promise<Response> => fetch(url(`/hook/notification?ap=ap-insieme&chat=${chat}`), {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ notification_type: 'attesa', message: 'Claude is waiting for your input' })
})
const aperte = async (): Promise<{ id: string; testo: string }[]> => (await (await fetch(url('/domande'))).json()) as { id: string; testo: string }[]
async function attendi(cond: () => boolean): Promise<void> {
  for (let i = 0; i < 120 && !cond(); i += 1) await new Promise((r) => setTimeout(r, 25))
}

describe('Nicholas partecipe, tutto il giro', () => {
  it('domanda, risposta, «Hai risposto» con chi l’ha ricevuta, la stessa domanda scartata', async () => {
    const registro: string[] = []
    vi.spyOn(console, 'log').mockImplementation((...x: unknown[]) => { registro.push(x.map(String).join(' ')) })
    await avvia()
    archivio.scrivi(flotta())

    // 1. La chat c-2 chiede: la domanda arriva a Nicholas, in italiano.
    await notifica('c-2')
    const [d] = await aperte()
    expect(d?.testo).toContain('Quale chiave SSH uso')

    // 2. Nicholas risponde dal pannello delle domande.
    await fetch(url(`/domande/${d!.id}/risposta`), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ risposta: 'quella nuova' })
    })
    await attendi(() => scritti.length > 0)
    // Arriva davvero a chi ha chiesto.
    expect(scritti).toEqual([expect.objectContaining({ chat: 'c-2' })])
    expect(scritti[0]?.messaggio).toContain('quella nuova')

    // 3. Nella conversazione: «Hai risposto: …» e sotto chi l'ha ricevuta,
    // non il «la porto alla chat» di quando ancora niente l'ha usata.
    const ap = archivio.leggi('ap-insieme')!
    const mia = conversazione(ap).filter((b) => b.da === 'tu' && b.testo === 'Hai risposto: quella nuova')
    expect(mia).toHaveLength(1)
    expect(mia[0]?.dettaglio).toContain('l’ha ricevuta')
    expect(mia[0]?.dettaglio).toContain('compito di c-2')

    // 4. La stessa domanda dalla stessa chat: non torna a Nicholas, si scarta
    // con una riga nel registro e la chat riceve la risposta già data.
    scritti.length = 0
    await notifica('c-2')
    expect(await aperte()).toEqual([])
    await attendi(() => scritti.length > 0)
    expect(scritti[0]?.messaggio).toContain('quella nuova')
    expect(registro.some((r) => r.includes('[domande] ap-insieme') && r.includes('scartata'))).toBe(true)
    // Nella conversazione la risposta resta una sola: lo scarto non è una tua risposta nuova.
    expect(conversazione(archivio.leggi('ap-insieme')!).filter((b) => b.testo.startsWith('Hai risposto:'))).toHaveLength(1)

    // 5. «Adesso»: una riga per chat, nessuna ferma.
    const adesso = adessoDi(archivio.leggi('ap-insieme')!, Date.now())
    expect(adesso.righe).toHaveLength(2)
    expect(adesso.righe.map((r) => r.tono)).not.toContain('ferma')
  })
})
