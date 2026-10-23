import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Server } from 'node:http'
import { creaServer, type ServerAutopiloti } from '../../src/autopilot-host/server'
import { apriArchivio, type Archivio } from '../../src/autopilot-host/archivio'
import { creaRegistroDomande } from '../../src/autopilot-host/domande'
import { nuovoAutopilota, type Autopilota, type ChatGovernata } from '@shared/autopilota'
import type { MisuraPc } from '@shared/posti-chat'
import { leggiProcessi, piuPesante, prossimaGuardia, rigaPcCarico, PROCESSORE_PER_MS, type StatoGuardia } from '@shared/guardia-pc'
import { indicatoreDi } from '@shared/indicatore-autopilota'

/**
 * 0.85.1, Guardia del PC (Nicholas, 23/10 sera): prima di aprire una chat o di
 * lanciare compilazioni e test pesanti si guarda il PC. Processore sopra l'85%
 * per un minuto, o memoria libera sotto il 15%: il passo si rimanda, e
 * l'indicatore dice «PC carico: aspetto» con il programma che consuma di più.
 * Mai chiudere programmi di Nicholas.
 */

const ORA = Date.parse('2026-10-23T20:00:00.000Z')
const iso = (ms: number): string => new Date(ms).toISOString()
const pc = (carico: number, liberaMb = 8_000, totaleMb = 16_384): MisuraPc => ({ processori: 8, memoriaLiberaMb: liberaMb, memoriaTotaleMb: totaleMb, caricoPercento: carico })

describe('quando il PC è carico (puro)', () => {
  it('il processore deve restare sopra l\'85% per un minuto: un picco non basta', () => {
    let g: StatoGuardia = prossimaGuardia({}, pc(95), ORA)
    expect(g.carico).toBeUndefined()
    g = prossimaGuardia(g, pc(92), ORA + 30_000)
    expect(g.carico).toBeUndefined()
    g = prossimaGuardia(g, pc(91), ORA + PROCESSORE_PER_MS)
    expect(g.carico).toMatchObject({ per: 'processore', misura: 'processore al 91%', dal: iso(ORA + PROCESSORE_PER_MS) })
    // Scende sotto la soglia: si riparte, e il minuto ricomincia da capo.
    g = prossimaGuardia(g, pc(60), ORA + 2 * PROCESSORE_PER_MS)
    expect(g).toEqual({})
    g = prossimaGuardia(g, pc(90), ORA + 3 * PROCESSORE_PER_MS)
    expect(g.carico).toBeUndefined()
  })

  it('all\'85% esatto non è carico', () => {
    const g = prossimaGuardia(prossimaGuardia({}, pc(85), ORA), pc(85), ORA + 2 * PROCESSORE_PER_MS)
    expect(g.carico).toBeUndefined()
  })

  it('memoria libera sotto il 15%: si rimanda subito', () => {
    const g = prossimaGuardia({}, pc(10, 2_000, 16_384), ORA)
    expect(g.carico).toMatchObject({ per: 'memoria', misura: 'memoria libera al 12%' })
    expect(prossimaGuardia({}, pc(10, 2_500, 16_384), ORA).carico).toBeUndefined()
  })

  it('lo stesso episodio tiene il suo inizio e il programma già letto', () => {
    const prima: StatoGuardia = { carico: { per: 'memoria', misura: 'memoria libera al 10%', dal: iso(ORA), programma: 'chrome (5,1 GB)' } }
    const dopo = prossimaGuardia(prima, pc(10, 1_000, 16_384), ORA + 60_000)
    expect(dopo.carico).toEqual({ per: 'memoria', misura: 'memoria libera al 6%', dal: iso(ORA), programma: 'chrome (5,1 GB)' })
  })

  it('la riga dice cosa aspetta, la misura e chi consuma di più', () => {
    expect(rigaPcCarico({ per: 'processore', misura: 'processore al 93%', dal: iso(ORA), programma: 'chrome (41% del processore)' }))
      .toBe('PC carico: aspetto · processore al 93% · consuma di più chrome (41% del processore)')
    expect(rigaPcCarico({ per: 'memoria', misura: 'memoria libera al 9%', dal: iso(ORA) })).toBe('PC carico: aspetto · memoria libera al 9%')
  })
})

describe('il programma che consuma di più (puro)', () => {
  it('memoria: somma i processi con lo stesso nome, salta quelli del sistema', () => {
    const l = leggiProcessi(['chrome|1073741824', 'chrome|2147483648', 'Code|2684354560', 'Memory Compression|9000000000', 'riga storta', 'Idle|0'].join('\r\n'))
    expect(piuPesante('memoria', { dopo: l })).toBe('chrome (3 GB)')
  })

  it('processore: dai secondi usati fra due letture, sul totale dei processori', () => {
    const prima = leggiProcessi('node|100\nchrome|500\nIdle|9000')
    const dopo = leggiProcessi('node|103,2\nchrome|500,5\nIdle|9008\nnuovo|7')
    // node: 3,2 secondi in 1 secondo su 8 processori = 40%. Chi è nato fra le due letture non conta.
    expect(piuPesante('processore', { prima, dopo, intervalloMs: 1000, processori: 8 })).toBe('node (40% del processore)')
  })

  it('senza letture non inventa un nome', () => {
    expect(piuPesante('memoria', { dopo: [] })).toBeUndefined()
    expect(piuPesante('processore', { prima: [], dopo: leggiProcessi('node|5') })).toBeUndefined()
  })
})

describe('l\'indicatore', () => {
  it('col PC carico dice «PC carico: aspetto», in giallo', () => {
    const a: Autopilota = { ...nuovoAutopilota({ id: 'ap-1', nome: 'Gestionale', obiettivo: 'o', cwd: 'C:/progetto', criteri: [], iniziatoIl: iso(ORA) }), stato: 'lavoro' }
    const i = indicatoreDi({ ...a, pcCarico: { per: 'memoria', misura: 'memoria libera al 9%', dal: iso(ORA), programma: 'chrome (5,1 GB)' } }, ORA)
    expect(i.andamento.colore).toBe('ambra')
    expect(i.andamento.testo).toContain('PC carico: aspetto · memoria libera al 9% · consuma di più chrome (5,1 GB)')
    expect(indicatoreDi(a, ORA).andamento.testo).not.toContain('PC carico')
  })
})

describe('il servizio rimanda le chat nuove, non chiude niente', () => {
  let server: ServerAutopiloti | undefined
  let porta = 0
  let archivio: Archivio
  let avviate: string[]
  let chiuse: string[]
  let fermate: string[]
  let misura: MisuraPc
  let ora = ORA
  let letturePesante: string[]

  afterEach(() => { server?.close(); server = undefined })

  const chat = (id: string, stato: ChatGovernata['stato']): ChatGovernata => ({ id, compito: `compito ${id}`, stato, cicli: 1, sessionId: `s-${id}` })
  function ambiente(): ServerAutopiloti {
    archivio = apriArchivio(mkdtempSync(join(tmpdir(), 'ap-guardia-')))
    avviate = []; chiuse = []; fermate = []; letturePesante = []
    ora = ORA
    return creaServer({
      archivio,
      esegui: () => Promise.resolve({ codice: 1, uscita: 'rosso' }),
      interroga: () => Promise.resolve({ testo: '{}', sessionId: 'sup' }),
      avviaLavoro: (a, _m, c) => { avviate.push(`${a.id}::${c?.id ?? '-'}`); return Promise.resolve() },
      fermaLavoro: (id, c) => { fermate.push(`${id}::${c ?? '-'}`) },
      avvisa: () => Promise.resolve(),
      domande: creaRegistroDomande({ adesso: () => ORA }),
      scadenzaDomandaMs: 5000,
      scadenzaInterviataMs: 5000,
      adesso: () => iso(ora),
      misuraPc: () => misura,
      programmaPiuPesante: (per) => { letturePesante.push(per); return Promise.resolve(per === 'memoria' ? 'chrome (5,1 GB)' : 'node (60% del processore)') },
      chiudiChat: (_id, chatId) => { chiuse.push(chatId ?? '-') }
    })
  }
  async function chiama(metodo: string, percorso: string, corpo?: unknown): Promise<any> {
    const r = await fetch(`http://127.0.0.1:${porta}${percorso}`, { method: metodo, headers: { 'Content-Type': 'application/json' }, ...(corpo !== undefined ? { body: JSON.stringify(corpo) } : {}) })
    return r.json()
  }
  const avvia = async (s: Server): Promise<void> => {
    await new Promise<void>((ris) => { s.listen(0, '127.0.0.1', () => { porta = (s.address() as { port: number }).port; ris() }) })
    await chiama('POST', '/stato-programma', { letto: ORA, chat: [], domandeAperte: 0, progetti: [], altriPc: [], limiti: { cinqueOre: { percento: 5, lettoIl: ORA }, settimana: { percento: 5, lettoIl: ORA } } })
  }
  const attendi = async (c: () => boolean): Promise<void> => { for (let i = 0; i < 200 && !c(); i += 1) await new Promise((r) => setTimeout(r, 10)) }
  const conCompiti = (n: number): Autopilota => ({
    ...nuovoAutopilota({ id: 'ap-a', nome: 'ap-a', obiettivo: 'o', cwd: 'C:\\Progetti\\Esempio', criteri: [{ descrizione: 'i test passano', comando: 'npm test', soddisfatto: false }], iniziatoIl: iso(ORA - 3_600_000) }),
    stato: 'lavoro', ultimoEvento: iso(ORA), ramoBase: 'main', tettoChat: 8,
    chats: [chat('c-1', 'lavoro')],
    compitiDaFare: Array.from({ length: n }, (_, i) => `pezzo ${i + 1}`)
  })

  it('memoria quasi finita: nessuna chat nuova, la chat al lavoro continua, l\'indicatore dice chi consuma', async () => {
    // Un PC grande, ma con il 9% di memoria libera: senza la guardia i posti ci sarebbero.
    misura = { processori: 24, memoriaLiberaMb: 6_000, memoriaTotaleMb: 65_536, caricoPercento: 20 }
    server = ambiente()
    await avvia(server)
    archivio.scrivi(conCompiti(3))
    server.controllaChatFerme()
    await attendi(() => letturePesante.length > 0)
    await new Promise((r) => setTimeout(r, 80))
    expect(avviate).toEqual([])
    expect(chiuse).toEqual([])
    expect(fermate).toEqual([])
    expect(archivio.leggi('ap-a')!.chats.filter((c) => c.stato === 'lavoro')).toHaveLength(1)
    expect(letturePesante).toEqual(['memoria'])
    const posti = await chiama('GET', '/posti-chat')
    expect(posti).toMatchObject({ attive: 1, posti: 1, pcCarico: { per: 'memoria', programma: 'chrome (5,1 GB)' } })
    const elenco = await chiama('GET', '/autopiloti')
    const a = (Array.isArray(elenco) ? elenco : elenco.autopiloti).find((x: Autopilota) => x.id === 'ap-a')
    expect(indicatoreDi(a, ora).andamento.testo).toContain('PC carico: aspetto · memoria libera al 9% · consuma di più chrome (5,1 GB)')

    // Il giro dopo, ancora carico: il programma non si rilegge.
    ora += 60_000
    server.controllaChatFerme()
    await new Promise((r) => setTimeout(r, 50))
    expect(letturePesante).toEqual(['memoria'])
    expect(avviate).toEqual([])

    // La memoria si libera: le chat in fila partono.
    misura = { ...misura, memoriaLiberaMb: 40_000 }
    ora += 60_000
    server.controllaChatFerme()
    await attendi(() => avviate.length >= 3)
    expect(avviate).toHaveLength(3)
    expect((await chiama('GET', '/posti-chat')).pcCarico).toBeUndefined()
    expect(chiuse).toEqual([])
  })

  it('processore pieno: al primo giro ancora no, dopo un minuto sì', async () => {
    misura = { processori: 24, memoriaLiberaMb: 40_000, memoriaTotaleMb: 65_536, caricoPercento: 95 }
    server = ambiente()
    await avvia(server)
    // Il primo giro misura il 95% ma non è ancora un minuto: la guardia non c'è ancora.
    server.controllaChatFerme()
    expect((await chiama('GET', '/posti-chat')).pcCarico).toBeUndefined()
    ora += PROCESSORE_PER_MS
    server.controllaChatFerme()
    await attendi(() => letturePesante.length > 0)
    expect((await chiama('GET', '/posti-chat')).pcCarico).toMatchObject({ per: 'processore', misura: 'processore al 95%', programma: 'node (60% del processore)' })
    archivio.scrivi(conCompiti(2))
    server.controllaChatFerme()
    await new Promise((r) => setTimeout(r, 80))
    expect(avviate).toEqual([])
    expect(chiuse).toEqual([])
  })
})
