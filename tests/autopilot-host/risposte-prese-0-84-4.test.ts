import { describe, it, expect, afterEach, vi } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { creaServer, type ServerAutopiloti } from '../../src/autopilot-host/server'
import { apriArchivio, type Archivio } from '../../src/autopilot-host/archivio'
import { creaRegistroDomande, type RegistroDomande } from '../../src/autopilot-host/domande'
import { apriMemoria } from '../../src/autopilot-host/memoria'
import { conversazione } from '@shared/chat-autopilota'
import { nuovoAutopilota, parseAutopilota, VERSIONE_AUTOPILOTA, type Autopilota } from '@shared/autopilota'
import { leggiRigaRisposta } from '@shared/risposte-in-viaggio'

/**
 * Le risposte di Nicholas prese davvero (0.84.4).
 *
 * Il caso vero del 23/10: due chat di «App Android» (c-95 e c-106) ferme sulla
 * domanda del programma «Come vado avanti con …, che la Revisione ha già
 * rimandato indietro 3 volte?». Nicholas risponde «rifallo ancora» dopo che
 * l'attesa della chat è scaduta (06:39 e 06:40, poi di nuovo alle 07:22). Le
 * risposte comparivano nella conversazione con «l’ha ricevuta», ma nel
 * registro non c'era una riga che dicesse che la chat le aveva prese; e la
 * consegna per c-106 portava il perché della risposta a c-95.
 */

const DOMANDA_95 = '«App Android: analisi, correzioni e allineamento» ti chiede:\n\nCome vado avanti con «0.84.3 — Domande scritte dal programma che si capiscono da sole e mai gesti a…», che la Revisione ha già rimandato indietro 3 volte?\n\nLe scelte:\n• rifallo ancora (consigliata) → La chat corregge di nuovo e la Revisione la rivede.\n• uniscilo così → Unisco il ramo anche senza l’ok della Revisione.\n• lascialo fuori → Il pezzo non entra; gli altri continuano.'
const DOMANDA_106 = DOMANDA_95.replace('Domande scritte dal programma che si capiscono da sole e mai gesti a…', 'Correggi i 4 difetti del collaudo del «Punto» (scheda…')

let server: ServerAutopiloti | undefined
let porta: number
let archivio: Archivio
let registro: string[]
let scritti: { chat?: string; messaggio?: string; perche?: string }[]
let prompt: string[]
let numero: number

function flotta(stato95: 'bloccata' | 'lavoro' = 'bloccata'): Autopilota {
  return {
    ...nuovoAutopilota({
      id: 'ap-android',
      nome: 'App Android: analisi, correzioni e allineamento',
      obiettivo: 'Correggere l’app Android',
      cwd: process.cwd(),
      criteri: [{ descrizione: 'test verdi', comando: 'npm test', soddisfatto: false }],
      iniziatoIl: '2026-10-23T06:00:00.000Z'
    }),
    stato: 'lavoro',
    chats: [
      { id: 'c-95', compito: '0.84.3 — Domande scritte dal programma', stato: stato95, cicli: 3, sessionId: 's-95', ruolo: 'sviluppo' as const },
      { id: 'c-106', compito: '0.84.3 — Correggi i 4 difetti del Punto', stato: 'bloccata' as const, cicli: 3, sessionId: 's-106', ruolo: 'sviluppo' as const }
    ]
  }
}

/** Le due domande aperte, con l'attesa della chat già scaduta (il turno non è più trattenuto). */
function domandeAperte(domande: RegistroDomande, anche106: boolean): { d95: string; d106?: string } {
  const apri = (chatId: string, testo: string): string => {
    const d = domande.apri({ autopilotaId: 'ap-android', testo, scadenzaMs: 60_000 })
    domande.ricorda(d.id, { autopilotaId: 'ap-android', testo, grezza: testo, chatId, trattenuta: false })
    return d.id
  }
  return { d95: apri('c-95', DOMANDA_95), ...(anche106 ? { d106: apri('c-106', DOMANDA_106) } : {}) }
}

async function avvia(a: Autopilota, anche106 = false): Promise<{ d95: string; d106?: string }> {
  archivio = apriArchivio(mkdtempSync(join(tmpdir(), 'ap-prese-')))
  archivio.scrivi(a)
  registro = []
  scritti = []
  prompt = []
  numero = 850
  for (const livello of ['info', 'log', 'warn'] as const) {
    vi.spyOn(console, livello).mockImplementation((...x: unknown[]) => { registro.push(x.map(String).join(' ')) })
  }
  const domande = creaRegistroDomande({ adesso: () => Date.now() })
  const ids = domandeAperte(domande, anche106)
  const s = creaServer({
    archivio,
    memoria: apriMemoria(mkdtempSync(join(tmpdir(), 'ap-prese-mem-'))),
    versione: '0.84.4',
    esegui: () => Promise.resolve({ codice: 0, uscita: 'ok' }),
    interroga: (p) => {
      prompt.push(p)
      return Promise.resolve({ testo: JSON.stringify({ risposta: 'Nicholas ha detto di rifarlo: lo scrivo alla chat.', perLaChat: 'Nicholas dice: rifallo ancora.' }) })
    },
    avviaLavoro: (_a, messaggio, chat, perche) => {
      scritti.push({ ...(chat !== undefined ? { chat: chat.id } : {}), ...(messaggio !== undefined ? { messaggio } : {}), ...(perche !== undefined ? { perche } : {}) })
      numero += 1
      return Promise.resolve(`c-${numero}`)
    },
    fermaLavoro: () => {},
    avvisa: () => Promise.resolve(),
    domande,
    scadenzaDomandaMs: 60_000,
    scadenzaInterviataMs: 60_000,
    adesso: () => new Date().toISOString()
  })
  server = s
  await new Promise<void>((ris) => s.listen(0, '127.0.0.1', () => { porta = (s.address() as { port: number }).port; ris() }))
  return ids
}

afterEach(() => { server?.close(); server = undefined; vi.restoreAllMocks() })

const url = (p: string): string => `http://127.0.0.1:${porta}${p}`
const rispondi = (id: string, risposta: string): Promise<Response> => fetch(url(`/domande/${id}/risposta`), {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ risposta })
})
const esito = (id: string, e: 'partita' | 'non-partita' | 'non-consegnata'): Promise<Response> => fetch(url('/consegne/esito'), {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, esito: e })
})
async function attendi(cond: () => boolean): Promise<void> {
  for (let i = 0; i < 200 && !cond(); i += 1) await new Promise((r) => setTimeout(r, 25))
}
const ap = (): Autopilota => archivio.leggi('ap-android')!
const righe = (): string[] => ap().decisioni.map((d) => d.cosa)
const esitoInConversazione = (): string | undefined =>
  conversazione(ap()).filter((b) => b.da === 'tu' && b.testo === 'Hai risposto: rifallo ancora').map((b) => b.dettaglio).pop()

describe('23/10 dal vero: «rifallo ancora» due volte, dopo l’attesa', () => {
  it('ogni passaggio ha la sua riga; la risposta conta solo quando la consegna parte', async () => {
    const { d95, d106 } = await avvia(flotta(), true)

    await rispondi(d95, 'rifallo ancora')
    await attendi(() => scritti.length >= 1 && (ap().risposteInViaggio ?? []).length >= 1)
    await rispondi(d106!, 'rifallo ancora')
    await attendi(() => scritti.length >= 2 && (ap().risposteInViaggio ?? []).length >= 2)

    // Arrivano a chi le aspettava, ognuna con il suo perché (prima c-106 aveva quello di c-95).
    expect(scritti.map((s) => s.chat)).toEqual(['c-95', 'c-106'])
    expect(scritti[0]?.messaggio).toContain('L\'utente risponde: rifallo ancora')
    expect(scritti[0]?.perche).toBe('risposta tardiva (c-95): rifallo ancora')
    expect(scritti[1]?.perche).toBe('risposta tardiva (c-106): rifallo ancora')

    // In viaggio, non ancora prese: la conversazione non promette niente.
    expect(ap().risposteInViaggio?.map((r) => [r.chatId, r.consegne])).toEqual([['c-95', ['c-851']], ['c-106', ['c-852']]])
    expect(righe().some((c) => c.startsWith('risposta presa'))).toBe(false)
    expect(esitoInConversazione()).toContain('la sto portando')
    expect(esitoInConversazione()).not.toContain('l’ha ricevuta')

    // Il registro: arrivo, in viaggio.
    expect(registro.some((r) => r.includes('[domande] ap-android') && r.includes('«rifallo ancora»') && r.includes('ricevuta, la porto alla chat'))).toBe(true)
    expect(registro.some((r) => r.includes('per c-95: in viaggio con la consegna c-851'))).toBe(true)
    expect(registro.some((r) => r.includes('per c-106: in viaggio con la consegna c-852'))).toBe(true)

    // Il PC dice che le consegne sono partite: adesso sono prese.
    await esito('c-851', 'partita')
    await esito('c-852', 'partita')
    await attendi(() => (ap().risposteInViaggio ?? []).length === 0)
    const prese = righe().map(leggiRigaRisposta).filter((r) => r?.esito === 'presa')
    expect(prese.map((r) => r?.chi)).toEqual(['c-95', 'c-106'])
    expect(registro.some((r) => r.includes('«rifallo ancora» presa da c-95: la consegna c-851 è partita'))).toBe(true)
    expect(registro.some((r) => r.includes('«rifallo ancora» presa da c-106: la consegna c-852 è partita'))).toBe(true)
    expect(esitoInConversazione()).toMatch(/^Presa: .* l’ha ricevuta e riprende il lavoro\.$/)
    // Nessun doppione nella conversazione: la riga «presa» non è un'altra tua
    // risposta. Una sola «Hai risposto»: la prima vale anche per la domanda
    // uguale di c-106 (0.81.0), che la riceve senza che Nicholas la ripeta.
    expect(conversazione(ap()).filter((b) => b.testo.startsWith('Hai risposto:'))).toHaveLength(1)
    // Nessuno ha dovuto chiedere niente al supervisore.
    expect(prompt).toEqual([])
  })

  it('non presa: una riconsegna; non presa di nuovo: al supervisore come istruzione, non persa', async () => {
    const { d95 } = await avvia(flotta())
    await rispondi(d95, 'rifallo ancora')
    await attendi(() => (ap().risposteInViaggio ?? []).length === 1)

    await esito('c-851', 'non-partita')
    await attendi(() => scritti.length === 2 && ap().risposteInViaggio?.[0]?.tentativo === 2)
    expect(scritti[1]).toEqual(expect.objectContaining({ chat: 'c-95' }))
    expect(scritti[1]?.messaggio).toBe(scritti[0]?.messaggio)
    expect(ap().risposteInViaggio?.[0]?.consegne).toEqual(['c-851', 'c-852'])
    expect(righe().some((c) => c.startsWith('risposta non presa (c-95): rifallo ancora'))).toBe(true)
    expect(esitoInConversazione()).toContain('la riconsegno')
    expect(registro.some((r) => r.includes('non presa da c-95') && r.includes('la riconsegno una volta'))).toBe(true)
    expect(registro.some((r) => r.includes('per c-95: riconsegnata con la consegna c-852'))).toBe(true)

    // Anche la seconda non arriva: niente terza consegna, la riceve il supervisore.
    await esito('c-852', 'non-consegnata')
    await attendi(() => prompt.length === 1)
    expect(scritti).toHaveLength(2)
    expect(prompt[0]).toContain('Nicholas ha risposto «rifallo ancora» alla domanda di la chat c-95')
    expect(prompt[0]).toContain('non va persa')
    expect(ap().risposteInViaggio ?? []).toEqual([])
    expect(righe().some((c) => c.startsWith('risposta al supervisore (c-95): rifallo ancora'))).toBe(true)
    expect(esitoInConversazione()).toContain('l’ho data al supervisore come istruzione')
    expect(registro.some((r) => r.includes('al supervisore come istruzione'))).toBe(true)
    // Il supervisore l'ha eseguita: il messaggio per la chat è in coda, e la sua battuta nella conversazione.
    await attendi(() => ap().dialogo.some((s) => s.da === 'lui'))
    expect(ap().dialogo.some((s) => s.da === 'lui' && s.testo.includes('lo scrivo alla chat'))).toBe(true)
  })

  it('una consegna partita tardi dopo la riconsegna vale lo stesso: presa', async () => {
    const { d95 } = await avvia(flotta())
    await rispondi(d95, 'rifallo ancora')
    await attendi(() => (ap().risposteInViaggio ?? []).length === 1)
    await esito('c-851', 'non-partita')
    await attendi(() => ap().risposteInViaggio?.[0]?.tentativo === 2)
    await esito('c-851', 'partita')
    await attendi(() => (ap().risposteInViaggio ?? []).length === 0)
    expect(righe().map(leggiRigaRisposta).filter((r) => r?.esito === 'presa')).toHaveLength(1)
    expect(prompt).toEqual([])
  })

  it('06:44 dal vero: la chat era già ripartita senza aspettarla, la risposta va al supervisore', async () => {
    const { d95 } = await avvia(flotta('lavoro'))
    await rispondi(d95, 'rifallo ancora')
    await attendi(() => prompt.length === 1)
    expect(scritti).toEqual([])
    expect(prompt[0]).toContain('la chat era già ripartita senza aspettarla')
    expect(righe().some((c) => c.startsWith('risposta al supervisore (c-95): rifallo ancora'))).toBe(true)
    expect(registro.some((r) => r.includes('al supervisore come istruzione: la chat era già ripartita'))).toBe(true)
    expect(esitoInConversazione()).toContain('supervisore')
  })

  it('le risposte in viaggio restano scritte con l’autopilota: sopravvivono al riavvio del servizio', async () => {
    const { d95 } = await avvia(flotta())
    await rispondi(d95, 'rifallo ancora')
    await attendi(() => (ap().risposteInViaggio ?? []).length === 1)
    const riletto = parseAutopilota(JSON.parse(JSON.stringify({ ...ap(), versione: VERSIONE_AUTOPILOTA })))
    expect(riletto.autopilota?.risposteInViaggio).toEqual(ap().risposteInViaggio)
  })
})
