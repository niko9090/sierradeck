import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { creaServer, type ServerAutopiloti } from '../../src/autopilot-host/server'
import { apriArchivio, type Archivio } from '../../src/autopilot-host/archivio'
import { creaRegistroDomande, type RegistroDomande } from '../../src/autopilot-host/domande'
import { apriMemoria } from '../../src/autopilot-host/memoria'
import { eDomandaRifacimenti } from '../../src/autopilot-host/oltre-rifacimenti'
import { nuovoAutopilota, type Autopilota } from '@shared/autopilota'
import { partiDaTesto } from '@shared/domanda-strutturata'

/**
 * 0.85.1: le domande arrivate a Nicholas il 23/10, rilette una per una dal
 * registro. Ognuna che non doveva arrivare ha qui il suo caso.
 */

let server: ServerAutopiloti | undefined
let archivio: Archivio
let registro: RegistroDomande
let scritti: { chat?: string; messaggio?: string }[]
afterEach(() => { server?.close(); server = undefined })

function avvia(a: Autopilota): void {
  archivio = apriArchivio(mkdtempSync(join(tmpdir(), 'ap-23-10-')))
  registro = creaRegistroDomande({ adesso: () => Date.now() })
  scritti = []
  server = creaServer({
    archivio,
    memoria: apriMemoria(undefined),
    esegui: () => Promise.resolve({ codice: 0, uscita: 'ok' }),
    interroga: () => Promise.reject(new Error('spawn ENAMETOOLONG')),
    avviaLavoro: (_a, messaggio, chat) => { scritti.push({ ...(chat !== undefined ? { chat: chat.id } : {}), ...(messaggio !== undefined ? { messaggio } : {}) }); return Promise.resolve() },
    fermaLavoro: () => {},
    avvisa: () => Promise.resolve(),
    domande: registro,
    scadenzaDomandaMs: 5000,
    scadenzaInterviataMs: 5000,
    adesso: () => new Date().toISOString()
  })
  archivio.scrivi(a)
}

const documento = (x: Partial<Autopilota>): Autopilota => ({
  ...nuovoAutopilota({ id: 'ap-doc', nome: 'Punto situazione', obiettivo: 'Un documento di analisi', cwd: process.cwd(), criteri: [{ descrizione: 'il documento esiste', soddisfatto: true }], iniziatoIl: '2026-10-23T19:00:00.000Z' }),
  stato: 'finito',
  pubblicazione: 'stabile',
  chats: [{ id: 'c-1', compito: 'scrivi il documento', stato: 'finita', cicli: 3, sessionId: 's-c-1' }],
  ...x
})

describe('«Pubblico adesso?» a lavoro finito non sparisce da sola (23/10, 19:14 → 19:19)', () => {
  it('il ricontrollo non la chiude come «superata» mentre la pubblicazione aspetta il sì', async () => {
    // Il 23/10: alle 19:14 «finito» e la domanda; alle 19:19:29 «la pubblicazione aspetta il tuo sì
    // nella scheda Domande»; alle 19:19:50 «domanda chiusa perché superata: il lavoro è già finito».
    avvia(documento({ pubblicazioneInAttesa: true }))
    const d = registro.apri({ autopilotaId: 'ap-doc', testo: 'Pubblico adesso?', scadenzaMs: 5000, opzioni: ['sì', 'no'] })
    registro.ricorda(d.id, { autopilotaId: 'ap-doc', testo: d.testo, chatId: 'c-1', pubblica: true })
    expect(await server!.ricontrollaDomande()).toBe(0)
    expect(registro.aperte('ap-doc')).toHaveLength(1)
    expect(archivio.leggi('ap-doc')!.decisioni.some((x) => x.cosa.includes('superata'))).toBe(false)
  })

  it('il sì che arriva dopo riapre il lavoro per pubblicare', async () => {
    avvia(documento({ pubblicazioneInAttesa: true }))
    const d = registro.apri({ autopilotaId: 'ap-doc', testo: 'Pubblico adesso?', scadenzaMs: 5000, opzioni: ['sì', 'no'] })
    registro.ricorda(d.id, { autopilotaId: 'ap-doc', testo: d.testo, chatId: 'c-1', pubblica: true })
    await server!.ricontrollaDomande()
    registro.rispondi(d.id, 'sì', 'modale')
    await new Promise((r) => setTimeout(r, 50))
    const a = archivio.leggi('ap-doc')!
    expect(a.stato).toBe('lavoro')
    expect(a.pubblicazioneIstruita).toBe(true)
    expect(a.decisioni.some((x) => x.cosa.startsWith('pubblicazione: hai detto sì'))).toBe(true)
  })

  it('a pubblicazione già decisa (niente più in attesa) la domanda rimasta si chiude come prima', async () => {
    avvia(documento({}))
    const d = registro.apri({ autopilotaId: 'ap-doc', testo: 'Pubblico adesso?', scadenzaMs: 5000 })
    registro.ricorda(d.id, { autopilotaId: 'ap-doc', testo: d.testo, chatId: 'c-1', pubblica: true })
    expect(await server!.ricontrollaDomande()).toBe(1)
    expect(registro.aperte('ap-doc')).toEqual([])
  })
})

describe('«Come vado avanti con …, che la Revisione ha già rimandato indietro N volte?» (23/10, 7 volte)', () => {
  // Arrivata alle 03:49, 05:05, 06:39, 07:00, 07:23, 07:33 (3, 4 e 5 volte), anche da un altro PC alle 11:42.
  const DEL_23 = 'Come vado avanti con «0.84.3 — Correggi i 4 difetti del collaudo del «Punto» (scheda…», che la Revisione ha già rimandato indietro 5 volte?'

  it('si riconosce, e il programma non la scrive più', () => {
    expect(eDomandaRifacimenti(partiDaTesto(DEL_23))).toBe(true)
    // La riga «rimandato indietro N volte, chiedo a te» non esiste più nel servizio (0.84.4, 21727a1f).
    expect(readFileSync('src/autopilot-host/server.ts', 'utf8')).not.toContain('chiedo a te')
  })

  it('se è ancora aperta (da prima, o da un altro PC) si chiude e decide il programma', async () => {
    avvia({ ...documento({}), id: 'ap-doc', stato: 'lavoro', chats: [{ id: 'c-106', compito: '0.84.3 — Correggi i 4 difetti del collaudo del «Punto» (scheda Autopiloti)', stato: 'bloccata', cicli: 5, sessionId: 's-c-106' }] })
    const d = registro.apri({ autopilotaId: 'ap-doc', testo: DEL_23, scadenzaMs: 5000 })
    registro.ricorda(d.id, { autopilotaId: 'ap-doc', testo: d.testo, chatId: 'c-106' })
    expect(await server!.ricontrollaDomande()).toBe(1)
    expect(registro.aperte('ap-doc')).toEqual([])
    expect(archivio.leggi('ap-doc')!.decisioni.some((x) => x.cosa.includes('ora decide il programma'))).toBe(true)
  })
})
