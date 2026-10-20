import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Server } from 'node:http'
import { creaServer, type ServerAutopiloti } from '../../src/autopilot-host/server'
import { apriArchivio, type Archivio } from '../../src/autopilot-host/archivio'
import { creaRegistroDomande } from '../../src/autopilot-host/domande'
import { caricoFra, creaMisuratore, tempiDa } from '../../src/autopilot-host/misura-pc'
import { chatAlLavoroSulPc, daChiudereDaSole, FERMO_SI_CHIUDE_MS, FINITA_SI_CHIUDE_MS, tettoNeiPosti } from '../../src/autopilot-host/posti'
import { nuovoAutopilota, type Autopilota, type ChatGovernata } from '@shared/autopilota'
import type { MisuraPc } from '@shared/posti-chat'

// 0.82.0: quante chat lavorano insieme lo decide il PC, per tutti gli
// autopiloti insieme; le altre aspettano in fila; le finite si chiudono da sole.

const ORA = Date.parse('2026-10-21T12:00:00.000Z')
const iso = (ms: number): string => new Date(ms).toISOString()

function autopilota(over: Partial<Autopilota> & { id: string }): Autopilota {
  return {
    ...nuovoAutopilota({ id: over.id, nome: over.id, obiettivo: 'o', cwd: 'C:\\Progetti\\Esempio', criteri: [{ descrizione: 'i test passano', comando: 'npm test', soddisfatto: false }], iniziatoIl: iso(ORA - 3_600_000) }),
    stato: 'lavoro',
    ultimoEvento: iso(ORA),
    ...over
  }
}
const chat = (id: string, stato: ChatGovernata['stato'], over: Partial<ChatGovernata> = {}): ChatGovernata =>
  ({ id, compito: `compito ${id}`, stato, cicli: 1, sessionId: `s-${id}`, ...over })

describe('chat al lavoro sul PC e tetto nei posti (puro)', () => {
  it('conta le chat al lavoro di tutti gli autopiloti, non chi aspetta, è in pausa o è fermo', () => {
    const a = autopilota({ id: 'a', chats: [chat('c-1', 'lavoro'), chat('c-2', 'bloccata'), chat('c-3', 'pausa'), chat('c-4', 'finita')] })
    const b = autopilota({ id: 'b', sessionId: 's-b' })
    const flottaSenzaChat = autopilota({ id: 'c', compitiDaFare: ['uno'] })
    const fermo = autopilota({ id: 'f', stato: 'sospeso', chats: [chat('c-1', 'lavoro')] })
    const archiviato = autopilota({ id: 'x', archiviato: true })
    expect(chatAlLavoroSulPc([a, b, flottaSenzaChat, fermo, archiviato])).toBe(2)
  })

  it('un autopilota apre solo nei posti liberi del PC', () => {
    expect(tettoNeiPosti(8, 0, 2, 2)).toBe(0)
    expect(tettoNeiPosti(8, 2, 2, 4)).toBe(4)
    expect(tettoNeiPosti(3, 0, 0, 6)).toBe(3)
    // Il PC è sceso sotto le chat che lavorano: nessuna si ferma, nessuna nuova parte.
    expect(tettoNeiPosti(8, 4, 6, 3)).toBe(4)
  })
})

describe('chiuse da sole (puro)', () => {
  const tutteFerme = (a: Autopilota[]): { sessione: string; ferma: boolean }[] =>
    a.flatMap((x) => [...x.chats.map((c) => ({ sessione: c.sessionId ?? '', ferma: true })), ...(x.sessionId !== undefined ? [{ sessione: x.sessionId, ferma: true }] : [])])

  it('una chat finita da 5 minuti e ferma al prompt si chiude; prima no', () => {
    const a = autopilota({ id: 'a', chats: [chat('c-1', 'finita', { dal: iso(ORA - FINITA_SI_CHIUDE_MS) }), chat('c-2', 'finita', { dal: iso(ORA - 60_000) })] })
    const fuori = daChiudereDaSole({ autopiloti: [a], accese: tutteFerme([a]), ora: ORA, domandeAperte: () => 0 })
    expect(fuori.map((f) => f.chatId)).toEqual(['c-1'])
    expect(fuori[0]!.motivo).toContain('ha finito da 5 minuti')
  })

  it('mai una chat al lavoro, mai una che non è ferma al prompt, mai una adottata', () => {
    const a = autopilota({
      id: 'a',
      chats: [chat('c-1', 'lavoro'), chat('c-2', 'finita', { dal: iso(ORA - 3_600_000) }), chat('c-3', 'finita', { dal: iso(ORA - 3_600_000) })],
      adottate: [{ sessionId: 's-c-3', titolo: 'di Nicholas', adottataIl: iso(ORA - 3_600_000) }]
    })
    const accese = [{ sessione: 's-c-1', ferma: true }, { sessione: 's-c-2', ferma: false }, { sessione: 's-c-3', ferma: true }]
    expect(daChiudereDaSole({ autopiloti: [a], accese, ora: ORA, domandeAperte: () => 0 })).toEqual([])
  })

  it('una chat già spenta non si chiude: non c è niente da chiudere', () => {
    const a = autopilota({ id: 'a', chats: [chat('c-1', 'finita', { dal: iso(ORA - 3_600_000) })] })
    expect(daChiudereDaSole({ autopiloti: [a], accese: [], ora: ORA, domandeAperte: () => 0 })).toEqual([])
  })

  it('autopilota fermo da mezz ora senza domande: le sue chat ferme si chiudono, chi aspetta Nicholas no', () => {
    const fermo = autopilota({ id: 'f', stato: 'sospeso', fermatoIl: iso(ORA - FERMO_SI_CHIUDE_MS), chats: [chat('c-1', 'lavoro'), chat('c-2', 'bloccata')] })
    expect(daChiudereDaSole({ autopiloti: [fermo], accese: tutteFerme([fermo]), ora: ORA, domandeAperte: () => 0 }).map((f) => f.chatId)).toEqual(['c-1'])
    expect(daChiudereDaSole({ autopiloti: [fermo], accese: tutteFerme([fermo]), ora: ORA, domandeAperte: () => 1 })).toEqual([])
    // In pausa per i limiti del piano riparte da solo: non si tocca.
    const inPausa = { ...fermo, pausaLimitiFinoA: iso(ORA + 3_600_000) }
    expect(daChiudereDaSole({ autopiloti: [inPausa], accese: tutteFerme([inPausa]), ora: ORA, domandeAperte: () => 0 })).toEqual([])
    // Fermo da poco: chi l ha fermato ha ancora tempo per guardare.
    const daPoco = { ...fermo, fermatoIl: iso(ORA - 60_000) }
    expect(daChiudereDaSole({ autopiloti: [daPoco], accese: tutteFerme([daPoco]), ora: ORA, domandeAperte: () => 0 })).toEqual([])
  })

  it('un autopilota con una chat sola, finito da mezz ora', () => {
    const finito = autopilota({ id: 'u', stato: 'finito', sessionId: 's-u', fermatoIl: iso(ORA - FERMO_SI_CHIUDE_MS - 1) })
    expect(daChiudereDaSole({ autopiloti: [finito], accese: tutteFerme([finito]), ora: ORA, domandeAperte: () => 0 })).toEqual([
      { autopilotaId: 'u', sessionId: 's-u', motivo: "l'autopilota è finito da 30 minuti" }
    ])
  })
})

describe('misura del PC (Windows: niente loadavg)', () => {
  const cpu = (occupato: number, idle: number) => ({ times: { user: occupato, nice: 0, sys: 0, idle, irq: 0 } })

  it('il carico viene dai tempi dei processori fra due letture', () => {
    const prima = tempiDa([cpu(100, 900), cpu(100, 900)])
    const dopo = tempiDa([cpu(190, 910), cpu(190, 910)])
    expect(caricoFra(prima, dopo)).toBe(90)
    expect(caricoFra(dopo, dopo)).toBeUndefined()
  })

  it('media mobile: un picco solo non porta il carico al 100%', () => {
    let t = 0
    const letture: Array<[number, number]> = [[0, 0], [10, 90], [110, 90], [120, 180]]
    const misura = creaMisuratore({
      cpus: () => { const [o, i] = letture[Math.min(t++, letture.length - 1)]!; return [cpu(o, i)] },
      libera: () => 4 * 1024 * 1024 * 1024,
      totale: () => 16 * 1024 * 1024 * 1024
    })
    expect(misura()).toEqual({ processori: 1, memoriaLiberaMb: 4096, memoriaTotaleMb: 16384, caricoPercento: 0 })
    expect(misura().caricoPercento).toBe(10)
    // 100% per un giro: 10·0,6 + 100·0,4 = 46.
    expect(misura().caricoPercento).toBe(46)
    expect(misura().caricoPercento).toBe(32)
  })
})

describe('il servizio: fila, «N di M chat», chiusura da sole (0.82.0)', () => {
  let server: ServerAutopiloti | undefined
  let porta = 0
  let archivio: Archivio
  let avviate: string[]
  let chiuse: Array<{ id: string; chat?: string; sessione: string }>
  let misura: MisuraPc

  afterEach(() => { server?.close(); server = undefined })

  function ambiente(): ServerAutopiloti {
    archivio = apriArchivio(mkdtempSync(join(tmpdir(), 'ap-posti-')))
    avviate = []
    chiuse = []
    return creaServer({
      archivio,
      esegui: () => Promise.resolve({ codice: 1, uscita: 'rosso' }),
      interroga: () => Promise.resolve({ testo: '{}', sessionId: 'sup' }),
      avviaLavoro: (a, _m, c) => { avviate.push(`${a.id}::${c?.id ?? '-'}`); return Promise.resolve() },
      fermaLavoro: () => {},
      avvisa: () => Promise.resolve(),
      domande: creaRegistroDomande({ adesso: () => ORA }),
      scadenzaDomandaMs: 5000,
      scadenzaInterviataMs: 5000,
      adesso: () => iso(ORA),
      misuraPc: () => misura,
      chiudiChat: (id, chatId, chi) => { chiuse.push({ id, ...(chatId !== undefined ? { chat: chatId } : {}), sessione: chi.sessionId }) }
    })
  }
  async function chiama(metodo: string, percorso: string, corpo?: unknown): Promise<any> {
    const r = await fetch(`http://127.0.0.1:${porta}${percorso}`, { method: metodo, headers: { 'Content-Type': 'application/json' }, ...(corpo !== undefined ? { body: JSON.stringify(corpo) } : {}) })
    return r.json()
  }
  // Il piano quasi vuoto: il freno dà via libera e a decidere sono i posti del PC.
  const avvia = async (s: Server): Promise<void> => {
    await new Promise<void>((ris) => { s.listen(0, '127.0.0.1', () => { porta = (s.address() as { port: number }).port; ris() }) })
    await chiama('POST', '/stato-programma', { letto: ORA, chat: [], domandeAperte: 0, progetti: [], altriPc: [], limiti: { cinqueOre: { percento: 5, lettoIl: ORA }, settimana: { percento: 5, lettoIl: ORA } } })
  }
  const attendi = async (c: () => boolean): Promise<void> => { for (let i = 0; i < 200 && !c(); i += 1) await new Promise((r) => setTimeout(r, 10)) }
  const conCompiti = (id: string, n: number): Autopilota => autopilota({ id, ramoBase: 'main', tettoChat: 8, compitiDaFare: Array.from({ length: n }, (_, i) => `pezzo ${i + 1}`) })

  it('PC piccolo: di quattro compiti ne partono due, gli altri in fila e lo dice una volta', async () => {
    misura = { processori: 4, memoriaLiberaMb: 3_000, memoriaTotaleMb: 8_192, caricoPercento: 10 }
    server = ambiente()
    await avvia(server)
    archivio.scrivi(conCompiti('ap-a', 4))
    server.controllaChatFerme()
    await attendi(() => avviate.length >= 2)
    await new Promise((r) => setTimeout(r, 50))
    expect(avviate).toHaveLength(2)
    const a = archivio.leggi('ap-a')!
    expect(a.chats.filter((c) => c.stato === 'lavoro')).toHaveLength(2)
    expect(a.compitiDaFare).toEqual(['pezzo 3', 'pezzo 4'])
    expect(a.decisioni.filter((d) => d.cosa.includes('in fila: parte quando si libera un posto'))).toHaveLength(1)
    expect((await chiama('GET', '/posti-chat'))).toMatchObject({ attive: 2, posti: 2, inFila: 2, perche: 'minimo' })

    // Il giro dopo non lo ripete.
    server.controllaChatFerme()
    await new Promise((r) => setTimeout(r, 50))
    expect(archivio.leggi('ap-a')!.decisioni.filter((d) => d.cosa.includes('in fila'))).toHaveLength(1)

    // Una chat finisce: il suo posto va al primo in fila.
    const ora = archivio.leggi('ap-a')!
    archivio.scrivi({ ...ora, chats: ora.chats.map((c, i) => (i === 0 ? { ...c, stato: 'finita' as const } : c)) })
    server.controllaChatFerme()
    await attendi(() => avviate.length >= 3)
    expect(avviate).toHaveLength(3)
    expect(archivio.leggi('ap-a')!.compitiDaFare).toEqual(['pezzo 4'])
  })

  it('i posti sono del PC, non dell autopilota: il secondo aspetta il primo', async () => {
    // Le due chat del primo hanno già preso la memoria: ne restano 2,5 GB, sotto la riserva più una chat.
    misura = { processori: 4, memoriaLiberaMb: 2_500, memoriaTotaleMb: 8_192, caricoPercento: 10 }
    server = ambiente()
    await avvia(server)
    archivio.scrivi(autopilota({ id: 'ap-a', ramoBase: 'main', chats: [chat('c-1', 'lavoro'), chat('c-2', 'lavoro')] }))
    archivio.scrivi(conCompiti('ap-b', 2))
    server.controllaChatFerme()
    await new Promise((r) => setTimeout(r, 80))
    expect(avviate).toEqual([])
    expect(archivio.leggi('ap-b')!.decisioni.some((d) => d.cosa.includes('2 compiti in fila'))).toBe(true)
  })

  it('PC grande: partono tutti, fino al massimo', async () => {
    misura = { processori: 24, memoriaLiberaMb: 48_000, memoriaTotaleMb: 65_536, caricoPercento: 5 }
    server = ambiente()
    await avvia(server)
    archivio.scrivi(conCompiti('ap-a', 5))
    server.controllaChatFerme()
    await attendi(() => avviate.length >= 5)
    expect(avviate).toHaveLength(5)
    expect(archivio.leggi('ap-a')!.decisioni.some((d) => d.cosa.includes('in fila'))).toBe(false)
    expect((await chiama('GET', '/posti-chat'))).toMatchObject({ attive: 5, posti: 8, inFila: 0 })
  })

  it('sotto carico non parte niente di nuovo, ma chi lavora non si ferma', async () => {
    misura = { processori: 8, memoriaLiberaMb: 9_000, memoriaTotaleMb: 16_384, caricoPercento: 95 }
    server = ambiente()
    await avvia(server)
    archivio.scrivi({ ...conCompiti('ap-a', 2), chats: [chat('c-1', 'lavoro'), chat('c-2', 'lavoro'), chat('c-3', 'lavoro'), chat('c-4', 'lavoro')] })
    server.controllaChatFerme()
    await new Promise((r) => setTimeout(r, 80))
    expect(avviate).toEqual([])
    expect(archivio.leggi('ap-a')!.chats.filter((c) => c.stato === 'lavoro')).toHaveLength(4)
    expect((await chiama('GET', '/posti-chat'))).toMatchObject({ attive: 4, posti: 3, perche: 'carico', inFila: 2 })
  })

  it('la chat finita e ferma si chiude da sola, una volta, con la riga nella conversazione', async () => {
    misura = { processori: 8, memoriaLiberaMb: 9_000, memoriaTotaleMb: 16_384, caricoPercento: 10 }
    server = ambiente()
    await avvia(server)
    archivio.scrivi(autopilota({ id: 'ap-a', chats: [chat('c-1', 'finita', { dal: iso(ORA - 10 * 60_000) }), chat('c-2', 'lavoro')] }))
    const stato = { letto: ORA, limiti: { cinqueOre: { percento: 5, lettoIl: ORA } }, chat: [{ titolo: 'c-1', cwd: 'x', stato: 'lavoro', governata: true, sessione: 's-c-1', ferma: true }, { titolo: 'c-2', cwd: 'x', stato: 'lavoro', governata: true, sessione: 's-c-2', ferma: true }], domandeAperte: 0, progetti: [], altriPc: [] }
    await chiama('POST', '/stato-programma', stato)
    server.controllaChatFerme()
    expect(chiuse).toEqual([{ id: 'ap-a', chat: 'c-1', sessione: 's-c-1' }])
    expect(archivio.leggi('ap-a')!.decisioni.some((d) => d.cosa.includes('chiudo la chat c-1 da sola'))).toBe(true)
    server.controllaChatFerme()
    expect(chiuse).toHaveLength(1)
  })

  it('«più chat» dalle Impostazioni vale subito', async () => {
    misura = { processori: 8, memoriaLiberaMb: 9_000, memoriaTotaleMb: 16_384, caricoPercento: 10 }
    server = ambiente()
    await avvia(server)
    server.controllaChatFerme()
    expect((await chiama('GET', '/posti-chat')).posti).toBe(6)
    await chiama('POST', '/stato-programma', { letto: ORA, chat: [], domandeAperte: 0, progetti: [], altriPc: [], regolazionePosti: 1, limiti: { cinqueOre: { percento: 5, lettoIl: ORA } } })
    server.controllaChatFerme()
    expect((await chiama('GET', '/posti-chat'))).toMatchObject({ posti: 8, regolazione: 1 })
  })
})
