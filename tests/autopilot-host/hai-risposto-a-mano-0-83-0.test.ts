import { describe, it, expect, afterEach, vi } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { creaServer, type ServerAutopiloti } from '../../src/autopilot-host/server'
import { apriArchivio, type Archivio } from '../../src/autopilot-host/archivio'
import { creaRegistroDomande } from '../../src/autopilot-host/domande'
import { apriMemoria } from '../../src/autopilot-host/memoria'
import { conversazione } from '@shared/chat-autopilota'
import { TESTO_VIA, domandaInSospeso } from '@shared/domande-autopilota'
import { nuovoAutopilota, type Autopilota } from '@shared/autopilota'

/**
 * «Hai risposto: …» anche quando Nicholas scrive a mano (0.83.0).
 *
 * Il difetto (Nicholas, dal 20/10): una risposta scritta nella casella a una
 * domanda dell'autopilota («gli dai il via?», o una domanda del registro)
 * compariva come un messaggio qualunque e la domanda spariva. Adesso il testo
 * scritto a mano è la risposta a quella domanda, e nella conversazione — la
 * stessa per PC, pagina e app — c'è la domanda intera e sotto «Hai risposto: …».
 */

let server: ServerAutopiloti | undefined
let porta: number
let archivio: Archivio
let scritti: { chat?: string; messaggio?: string }[]

const DOMANDA = {
  staFacendo: 'Sto preparando la prova sul server del progetto.',
  domanda: 'Quale chiave SSH uso per il server di prova del progetto?',
  perche: 'Ce ne sono due nella cartella e non so quale è attiva.',
  scelte: [{ scelta: 'Quella nuova', conseguenza: 'provo con la nuova', consigliata: true }, { scelta: 'Quella vecchia', conseguenza: 'provo con la vecchia' }],
  seNonRispondi: 'Aspetto e intanto vado avanti con il resto.'
}

function ap(stato: Autopilota['stato'], dialogo: Autopilota['dialogo'] = []): Autopilota {
  return {
    ...nuovoAutopilota({
      id: 'ap-mano',
      nome: 'Prova',
      obiettivo: 'Prepara la prova sul server',
      cwd: process.cwd(),
      criteri: [{ descrizione: 'test verdi', comando: 'npm test', soddisfatto: false }],
      iniziatoIl: '2026-10-21T06:00:00.000Z'
    }),
    stato,
    dialogo,
    chats: stato === 'lavoro' ? ['c-1', 'c-2'].map((id) => ({ id, compito: `compito di ${id}`, stato: 'lavoro' as const, cicli: 1, sessionId: id })) : []
  }
}

async function avvia(): Promise<void> {
  archivio = apriArchivio(mkdtempSync(join(tmpdir(), 'ap-mano-')))
  scritti = []
  const s = creaServer({
    archivio,
    memoria: apriMemoria(mkdtempSync(join(tmpdir(), 'ap-mano-mem-'))),
    versione: '0.83.0',
    esegui: () => Promise.resolve({ codice: 0, uscita: 'ok' }),
    interroga: () => Promise.resolve({ testo: JSON.stringify({ azione: 'chiedi', domanda: DOMANDA }) }),
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
const scrivi = (testo: string): Promise<Response> => fetch(url('/autopiloti/ap-mano/dialogo'), {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ testo })
})
const aperte = async (): Promise<{ id: string; testo: string }[]> => (await (await fetch(url('/domande'))).json()) as { id: string; testo: string }[]
async function attendi(cond: () => boolean): Promise<void> {
  for (let i = 0; i < 120 && !cond(); i += 1) await new Promise((r) => setTimeout(r, 25))
}

describe('scritto a mano a una domanda del registro', () => {
  it('è la risposta: la domanda si chiude, la chat la riceve, «Hai risposto» sotto la domanda intera', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    await avvia()
    archivio.scrivi(ap('lavoro'))
    await fetch(url('/hook/notification?ap=ap-mano&chat=c-2'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notification_type: 'attesa', message: 'Claude is waiting for your input' })
    })
    const [d] = await aperte()
    expect(d?.testo).toContain('Quale chiave SSH uso')

    const r = await scrivi('quella nuova')
    expect(r.status).toBe(202)
    expect(await r.json()).toMatchObject({ ricevuto: true, risposta: true })
    expect(await aperte()).toEqual([])
    await attendi(() => scritti.length > 0)
    expect(scritti[0]).toMatchObject({ chat: 'c-2' })
    expect(scritti[0]?.messaggio).toContain('quella nuova')

    const righe = conversazione(archivio.leggi('ap-mano')!)
    const i = righe.findIndex((b) => b.da === 'tu' && b.testo === 'Hai risposto: quella nuova')
    expect(i).toBeGreaterThan(0)
    expect(righe[i - 1]).toMatchObject({ da: 'lui', testo: d!.testo })
    // Una sola volta, non anche come messaggio qualunque.
    expect(righe.filter((b) => b.testo.includes('quella nuova'))).toHaveLength(1)
  })
})

describe('scritto a mano al via', () => {
  it('«Hai risposto» sotto «Mi dai il via?», e il supervisore lo legge comunque', async () => {
    await avvia()
    archivio.scrivi(ap('pronto'))
    const r = await scrivi('prima togli il criterio sui test lenti')
    expect(r.status).toBe(202)
    const a = archivio.leggi('ap-mano')!
    const mia = a.dialogo.find((s) => s.da === 'tu')
    expect(mia).toMatchObject({ testo: 'prima togli il criterio sui test lenti', risponde: TESTO_VIA })
    // Non è una traccia: il supervisore la elabora come un messaggio normale.
    expect(mia?.traccia).toBeUndefined()
    const righe = conversazione(a)
    const i = righe.findIndex((b) => b.testo === 'Hai risposto: prima togli il criterio sui test lenti')
    expect(righe[i - 1]).toMatchObject({ da: 'lui', testo: TESTO_VIA, tono: 'domanda' })
  })
})

describe('domandaInSospeso e la conversazione (pure)', () => {
  const lui = (testo: string): Autopilota['dialogo'][number] => ({ quando: '2026-10-21T07:00:00.000Z', da: 'lui', testo })

  it('la sua ultima battuta con «?», altrimenti il via, altrimenti niente', () => {
    expect(domandaInSospeso(ap('lavoro', [lui('Uso la chiave nuova o quella vecchia?')]))).toBe('Uso la chiave nuova o quella vecchia?')
    expect(domandaInSospeso(ap('pronto', [lui('Ho cambiato il criterio.')]))).toBe(TESTO_VIA)
    expect(domandaInSospeso(ap('lavoro', [lui('Ho cambiato il criterio.')]))).toBeUndefined()
    expect(domandaInSospeso(ap('lavoro', [lui('Va bene?'), { quando: '2026-10-21T07:01:00.000Z', da: 'tu', testo: 'sì' }]))).toBeUndefined()
  })

  it('la domanda già scritta appena sopra non si ripete', () => {
    const a = ap('lavoro', [
      lui('Uso la chiave nuova o quella vecchia?'),
      { quando: '2026-10-21T07:01:00.000Z', da: 'tu', testo: 'la nuova', risponde: 'Uso la chiave nuova o quella vecchia?' }
    ])
    const righe = conversazione(a).slice(1)
    expect(righe.map((b) => [b.da, b.testo])).toEqual([
      ['lui', 'Uso la chiave nuova o quella vecchia?'],
      ['tu', 'Hai risposto: la nuova']
    ])
  })

  it('«risponde» resta dopo il salvataggio su disco', () => {
    const a = ap('pronto', [{ quando: '2026-10-21T07:01:00.000Z', da: 'tu', testo: 'aspetta', risponde: TESTO_VIA }])
    const disco = apriArchivio(mkdtempSync(join(tmpdir(), 'ap-mano-disco-')))
    disco.scrivi(a)
    const riletto = disco.leggi('ap-mano')
    expect(riletto?.dialogo[0]).toMatchObject({ risponde: TESTO_VIA })
  })
})
