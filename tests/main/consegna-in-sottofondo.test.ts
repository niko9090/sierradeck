import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Terminal } from '@xterm/headless'
import type { HostToCore } from '../../src/shared/protocol'
import { creaSottofondo, type TerminaleMuto } from '../../src/main/sottofondo'
import { doveConsegnare, idTestoConsegna, type Consegna } from '../../src/main/autopilota-consegne'
import { testoConsegnato, leggiElencoSottofondo } from '../../src/shared/sottofondo'
import { eseguiConsegna, liberaTurno, type Ponte, type Consegna as ConsegnaFinestra } from '../../src/renderer/consegne-autopilota'

/**
 * 0.60.8, decisione di Nicholas: la chat dell'autopilota «la deve aprire senza
 * visualizzarla… andiamo avanti nei PC in progetti diversi». Una consegna non
 * cambia mai il workspace sullo schermo: se il suo workspace non si vede, la
 * chat lavora in sottofondo, e il riquadro la adotta quando lo si apre.
 */
const SESSIONE = '11111111-2222-4333-8444-555555555555'
const AP = { id: 'ap-prova', chat: 'chat-1' }
const consegna: Consegna = { id: 'c-7', autopilotaId: AP.id, chatId: AP.chat, cwd: 'C:\\Progetti\\Prova', sessionId: SESSIONE, titolo: 'Prova', cosa: 'scrivi', testo: 'Leggi ed esegui le istruzioni', workspace: 'Prova' }

describe('dove va una consegna', () => {
  it('nel sottofondo se il suo workspace non è sullo schermo; nella finestra se si vede', () => {
    expect(doveConsegnare({ workspace: 'Prova', inFinestra: false, inSottofondo: false, accesaNascosta: false, visibili: ['MT5'] })).toBe('sottofondo')
    expect(doveConsegnare({ workspace: 'Prova', inFinestra: false, inSottofondo: false, accesaNascosta: false, visibili: ['MT5', 'Prova'] })).toBe('finestra')
    // La chat è in un riquadro che si vede: lì, sempre.
    expect(doveConsegnare({ workspace: 'Prova', inFinestra: true, inSottofondo: false, accesaNascosta: false, visibili: ['MT5'] })).toBe('finestra')
    // Già in sottofondo, o accesa in un workspace nascosto: sottofondo, mai un secondo avvio.
    expect(doveConsegnare({ workspace: 'Prova', inFinestra: false, inSottofondo: true, accesaNascosta: false, visibili: ['Prova'] })).toBe('sottofondo')
    expect(doveConsegnare({ inFinestra: false, inSottofondo: false, accesaNascosta: true, visibili: ['MT5'] })).toBe('sottofondo')
    // Senza un workspace suo: la finestra, come sempre.
    expect(doveConsegnare({ inFinestra: false, inSottofondo: false, accesaNascosta: false, visibili: ['MT5'] })).toBe('finestra')
  })
  it('l’id del testo è lo stesso per la stessa istruzione, diverso per un’altra', () => {
    expect(idTestoConsegna(consegna)).toBe(idTestoConsegna({ ...consegna }))
    expect(idTestoConsegna(consegna)).not.toBe(idTestoConsegna({ ...consegna, testo: 'altro' }))
    expect(idTestoConsegna(consegna)).toMatch(/^[A-Za-z0-9_-]{1,80}$/)
  })
})

describe('nella finestra: il riquadro non c’è più → in sottofondo, mai un cambio di workspace', () => {
  beforeEach(() => liberaTurno())
  it('passa al sottofondo e non chiama «torna nel suo workspace»', () => {
    let ora = 0
    const coda: { quando: number; f: () => void }[] = []
    const dopo = (ms: number, f: () => void): void => { coda.push({ quando: ora + ms, f }) }
    const passate: string[] = []
    const tornate: string[] = []
    const passi: string[] = []
    const ponte: Ponte = {
      riquadroDi: () => undefined,
      apri: () => 'p-nuovo',
      scrivi: () => {},
      prontoARicevere: () => true,
      registra: (x) => { passi.push(x) },
      tornaNelSuoWorkspace: (c) => { tornate.push(c.id) },
      passaAlSottofondo: (c) => { passate.push(c.id) }
    }
    eseguiConsegna(consegna as ConsegnaFinestra, ponte, dopo)
    for (let i = 0; i < 10_000 && coda.length > 0; i += 1) { coda.sort((a, b) => a.quando - b.quando); const x = coda.shift()!; ora = x.quando; x.f() }
    expect(passate).toEqual(['c-7'])
    expect(tornate).toEqual([])
    expect(passi.join('\n')).toContain('passa in sottofondo, senza cambiare lo schermo')
    expect(passi.join('\n')).not.toContain('resa dopo')
  })
})

describe('nel sottofondo: hook dell’autopilota, testo consegnato, adozione all’apertura', () => {
  function finto() {
    let ora = 1_000_000
    const ascolti = new Map<string, (m: HostToCore) => void>()
    const scritto: { id: string; data: string }[] = []
    const avviati: { sessionUuid: string; autopilota?: { id: string; chat: string } }[] = []
    const agganciati: string[] = []
    const consegnati: string[] = []
    let campo = ''
    const manda = (id: string, data: string): void => ascolti.get(id)?.({ id, kind: 'data', data })
    const s = creaSottofondo({
      dati: mkdtempSync(join(tmpdir(), 'sd-consegna-sf-')),
      avviaPty: (r) => { avviati.push({ sessionUuid: r.sessionUuid, ...(r.autopilota !== undefined ? { autopilota: r.autopilota } : {}) }); return 'pty-1' },
      aggancia: (id) => { agganciati.push(id); ascolti.get(id)?.({ id, kind: 'scrollback', data: '\x1b[2J\x1b[H Già accesa\r\n\r\n❯ \r\n  ? for shortcuts' }) },
      consegnato: (voce, id) => { consegnati.push(`${voce.autopilota?.id ?? '-'}:${id}`) },
      ascolta: (id, cb) => { ascolti.set(id, cb) },
      smetti: (id) => { ascolti.delete(id) },
      scrivi: (id, data) => {
        scritto.push({ id, data })
        if (data === '\r') { if (campo !== '') { const t = campo; campo = ''; manda(id, `\x1b[2J\x1b[H Benvenuto\r\n❯ ${t}\r\n\r\n✻ Pensando… (2s · thinking)\r\n❯ \r\n`) } } else campo += data
      },
      ferma: () => {},
      creaTerminale: (cols, rows) => new Terminal({ cols, rows, allowProposedApi: true }) as unknown as TerminaleMuto,
      log: () => {},
      adesso: () => ora,
      timer: (f) => f()
    })
    const digerisci = (): Promise<void> => new Promise((r) => setTimeout(r, 20))
    return { s, manda, scritto, avviati, agganciati, consegnati, digerisci, avanti: (ms: number) => { ora += ms } }
  }

  it('il terminale nasce con gli hook dell’autopilota, il testo parte quando la chat è pronta, e lo dice', async () => {
    const f = finto()
    const id = idTestoConsegna(consegna)
    f.s.avvia({ sessione: SESSIONE, cwd: consegna.cwd, titolo: 'Prova', perChi: { id: `autopilota:${AP.id}`, nome: 'il suo autopilota' }, testo: consegna.testo, idMessaggio: id, workspace: 'Prova', autopilota: AP })
    expect(f.avviati).toEqual([{ sessionUuid: SESSIONE, autopilota: AP }])
    f.manda('pty-1', '\x1b[2J\x1b[H Benvenuto\r\n\r\n❯ \r\n  ? for shortcuts')
    await f.digerisci()
    f.avanti(2000); f.s.giro()
    expect(f.scritto.map((x) => x.data)).toEqual([consegna.testo, '\r'])
    await f.digerisci()
    f.avanti(3500); f.s.giro()
    expect(testoConsegnato(f.s.stato(SESSIONE)!, id)).toBe(true)
    expect(f.consegnati).toEqual([`${AP.id}:${id}`])
    // Dopo un riavvio la chat riparte con lo stesso autopilota (gli hook).
    expect(f.s.chat()[0]?.autopilota).toEqual(AP)
  })

  it('aprendo il workspace il riquadro la prende senza riavviarla, con i testi ancora in coda e il suo autopilota', () => {
    const f = finto()
    f.s.avvia({ sessione: SESSIONE, cwd: consegna.cwd, titolo: 'Prova', perChi: { id: 'autopilota:x', nome: 'il suo autopilota' }, testo: 'secondo compito', idMessaggio: 'ap-c-8', workspace: 'Prova', autopilota: AP })
    expect(f.s.sessioneDelPty('pty-1')).toBe(SESSIONE)
    const ceduta = f.s.cedi(SESSIONE)!
    expect(ceduta.ptyId).toBe('pty-1')
    expect(ceduta.coda).toEqual([{ id: 'ap-c-8', testo: 'secondo compito' }])
    expect(ceduta.autopilota).toEqual(AP)
    expect(f.s.ha(SESSIONE)).toBe(false)
  })

  it('accesa in un workspace nascosto: il sottofondo prende quel terminale, niente secondo avvio', async () => {
    const f = finto()
    f.s.avvia({ sessione: SESSIONE, cwd: consegna.cwd, titolo: 'Prova', perChi: { id: 'autopilota:x', nome: 'il suo autopilota' }, testo: 'terzo', idMessaggio: 'ap-c-9', autopilota: AP, ptyGia: 'pty-nascosto' })
    expect(f.avviati).toEqual([])
    expect(f.agganciati).toEqual(['pty-nascosto'])
    expect(f.s.sessioneDelPty('pty-nascosto')).toBe(SESSIONE)
    await f.digerisci()
    f.avanti(2000); f.s.giro()
    expect(f.scritto.map((x) => `${x.id}:${x.data}`)).toEqual(['pty-nascosto:terzo', 'pty-nascosto:\r'])
  })

  it('l’elenco su disco tiene l’autopilota (riprese dopo un riavvio)', () => {
    const lette = leggiElencoSottofondo({ versione: 1, chat: [{ sessione: SESSIONE, cwd: 'C:\\x', titolo: 'Prova', perChi: { id: 'a', nome: 'b' }, dal: '', coda: [], consegnati: [], autopilota: AP }] })
    expect(lette[0]?.autopilota).toEqual(AP)
  })
})
