import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Terminal } from '@xterm/headless'
import type { HostToCore } from '../../src/shared/protocol'
import { creaSottofondo, ATTESA_PRONTA_MAX_MS, type TerminaleMuto } from '../../src/main/sottofondo'
import { idChatSottofondo, testoAvvio, testoConsegnato, leggiElencoSottofondo, accodaTesto, segnaConsegnato } from '../../src/shared/sottofondo'

/**
 * Le chat in sottofondo (0.58.4) con un terminale senza finestra vero
 * (`@xterm/headless`) e un pty finto che fa Claude Code: disegna il campo,
 * riceve il testo, all'Invio lo sposta fra i messaggi mandati e lavora.
 */
const SESSIONE = '11111111-2222-4333-8444-555555555555'
const PC = { id: 'pc-esempio-2', nome: 'PORTATILE-ESEMPIO' }

function finto() {
  let ora = 1_000_000
  const ascolti = new Map<string, (m: HostToCore) => void>()
  const scritto: { id: string; data: string }[] = []
  const avviati: { sessionUuid: string; cwd: string }[] = []
  const fermati: string[] = []
  const log: string[] = []
  let n = 0
  const dati = mkdtempSync(join(tmpdir(), 'sd-sottofondo-'))
  const manda = (id: string, data: string): void => ascolti.get(id)?.({ id, kind: 'data', data })
  /** Claude Code finto: il campo, e all'Invio il messaggio sale fra i mandati. */
  let campo = ''
  const disegnaCampo = (id: string): void => manda(id, `\x1b[2J\x1b[H Benvenuto\r\n\r\n❯ ${campo}\r\n  ? for shortcuts`)
  const crea = (): ReturnType<typeof creaSottofondo> => creaSottofondo({
    dati,
    avviaPty: (r) => { n += 1; avviati.push({ sessionUuid: r.sessionUuid, cwd: r.cwd }); return `pty-${n}` },
    ascolta: (id, cb) => { ascolti.set(id, cb) },
    smetti: (id) => { ascolti.delete(id) },
    scrivi: (id, data) => {
      scritto.push({ id, data })
      if (data === '\r') {
        if (campo !== '') { const t = campo; campo = ''; manda(id, `\x1b[2J\x1b[H Benvenuto\r\n❯ ${t}\r\n\r\n✻ Pensando… (2s · thinking)\r\n❯ \r\n`) }
      } else {
        // Come Claude Code: il testo letto si vede nel campo (l'eco, 0.75.4).
        campo += data.replace(/\x1b\[20[01]~/g, '')
        manda(id, `\x1b[2J\x1b[H Benvenuto\r\n\r\n❯ ${campo}\r\n  ? for shortcuts`)
      }
    },
    ferma: (id) => { fermati.push(id) },
    creaTerminale: (cols, rows) => new Terminal({ cols, rows, allowProposedApi: true }) as unknown as TerminaleMuto,
    log: (m) => { log.push(m) },
    adesso: () => ora,
    timer: (f) => f()
  })
  /** xterm headless scrive in modo asincrono: si aspetta che abbia digerito. */
  const digerisci = (): Promise<void> => new Promise((r) => setTimeout(r, 20))
  return { crea, ascolti, scritto, avviati, fermati, log, dati, disegnaCampo, digerisci, avanti: (ms: number) => { ora += ms }, campo: () => campo, perdiCampo: () => { campo = '' } }
}

describe('le chat in sottofondo sul PC di casa', () => {
  let f: ReturnType<typeof finto>
  beforeEach(() => { f = finto() })

  it('avvia senza finestra, tiene il testo in coda e lo scrive quando la chat è pronta', async () => {
    const s = f.crea()
    const st = s.avvia({ sessione: SESSIONE, cwd: 'C:\\Progetti\\Prova', titolo: 'Prova', perChi: PC, testo: 'ciao dal fisso', idMessaggio: 'm-1' })
    expect(f.avviati).toEqual([{ sessionUuid: SESSIONE, cwd: 'C:\\Progetti\\Prova' }])
    expect(st.fase).toBe('avvio')
    expect(st.inCoda).toBe(1)
    // Claude Code non ha ancora disegnato niente: non si scrive.
    s.giro()
    expect(f.scritto).toEqual([])
    f.disegnaCampo('pty-1')
    await f.digerisci()
    // Il campo c'è, ma serve un secondo e mezzo di quiete.
    f.avanti(1000)
    s.giro()
    expect(f.scritto).toEqual([])
    f.avanti(1000)
    s.giro()
    // 0.75.4: prima il testo; l'Invio solo quando il testo si vede nel campo e lo schermo tace.
    expect(f.scritto.map((x) => x.data)).toEqual(['ciao dal fisso'])
    s.giro()
    expect(f.scritto.map((x) => x.data)).toEqual(['ciao dal fisso'])
    await f.digerisci()
    f.avanti(400)
    s.giro()
    expect(f.scritto.map((x) => x.data)).toEqual(['ciao dal fisso', '\r'])
    await f.digerisci()
    f.avanti(3500)
    s.giro()
    const dopo = s.stato(SESSIONE)!
    expect(testoConsegnato(dopo, 'm-1')).toBe(true)
    expect(dopo.inCoda).toBe(0)
    expect(f.log.some((l) => l.includes('testo consegnato (m-1)'))).toBe(true)
  })

  it('la domanda di fiducia non è il campo: si aspetta il campo vero (visto dal vero il 10/10)', async () => {
    const s = f.crea()
    s.avvia({ sessione: SESSIONE, cwd: 'C:\\P', titolo: 'P', perChi: PC, testo: 'ciao', idMessaggio: 'm-6' })
    f.ascolti.get('pty-1')?.({ id: 'pty-1', kind: 'data', data: '\x1b[2J\x1b[H Quick safety check: trust this folder?\r\n\r\n ❯ No, exit\r\n   Yes, I trust this folder\r\n\r\n Enter to confirm · Esc to cancel' })
    await f.digerisci()
    f.avanti(5000)
    s.giro()
    expect(f.scritto).toEqual([])
    expect(s.stato(SESSIONE)?.fase).toBe('scelta')
  })

  it('un testo che Claude Code perde torna in coda e si riscrive: mai «consegnato» senza esserlo', async () => {
    const s = f.crea()
    s.avvia({ sessione: SESSIONE, cwd: 'C:\\P', titolo: 'P', perChi: PC, testo: 'non perdermi', idMessaggio: 'm-7' })
    f.disegnaCampo('pty-1')
    await f.digerisci()
    f.avanti(2000)
    s.giro()
    await f.digerisci()
    f.avanti(400)
    s.giro()
    expect(f.scritto.map((x) => x.data)).toEqual(['non perdermi', '\r'])
    // Claude Code stava ancora caricando: il campo torna vuoto e il testo è sparito.
    f.perdiCampo()
    f.disegnaCampo('pty-1')
    await f.digerisci()
    f.avanti(3500)
    s.giro()
    expect(testoConsegnato(s.stato(SESSIONE), 'm-7')).toBe(false)
    expect(s.stato(SESSIONE)?.inCoda).toBe(1)
    expect(f.log.some((l) => l.includes('si è perso'))).toBe(true)
    // Al giro dopo, con il campo pronto e la quiete, lo riscrive.
    f.avanti(2000)
    s.giro()
    expect(f.scritto.filter((x) => x.data === 'non perdermi')).toHaveLength(2)
  })

  it('lo stesso testo mandato due volte (una caduta di linea) si scrive una volta sola', async () => {
    const s = f.crea()
    s.avvia({ sessione: SESSIONE, cwd: 'C:\\P', titolo: 'P', perChi: PC, testo: 'uno', idMessaggio: 'm-2' })
    s.avvia({ sessione: SESSIONE, cwd: 'C:\\P', titolo: 'P', perChi: PC, testo: 'uno', idMessaggio: 'm-2' })
    expect(f.avviati).toHaveLength(1)
    expect(s.stato(SESSIONE)!.inCoda).toBe(1)
  })

  it('l’elenco sta su disco: dopo un riavvio la chat riparte con il testo ancora in coda', () => {
    const s = f.crea()
    s.avvia({ sessione: SESSIONE, cwd: 'C:\\P', titolo: 'P', perChi: PC, testo: 'dopo il riavvio', idMessaggio: 'm-3' })
    const file = join(f.dati, 'sottofondo.json')
    expect(existsSync(file)).toBe(true)
    const voci = leggiElencoSottofondo(JSON.parse(readFileSync(file, 'utf8')))
    expect(voci[0]?.coda.map((t) => t.id)).toEqual(['m-3'])
    const dopo = f.crea()
    expect(dopo.riprendi(() => undefined)).toBe(1)
    expect(f.avviati).toHaveLength(2)
    expect(dopo.stato(SESSIONE)?.inCoda).toBe(1)
  })

  it('una chat la cui casa non è più qui non riparte, e lo scrive', () => {
    f.crea().avvia({ sessione: SESSIONE, cwd: 'C:\\P', titolo: 'P', perChi: PC })
    const dopo = f.crea()
    expect(dopo.riprendi(() => 'la sua casa adesso è PC-ESEMPIO')).toBe(0)
    expect(f.log.some((l) => l.includes('non riparte: la sua casa adesso è PC-ESEMPIO'))).toBe(true)
  })

  it('«Mostra qui» la cede a un riquadro senza fermarla; «Chiudi» la ferma', () => {
    const s = f.crea()
    s.avvia({ sessione: SESSIONE, cwd: 'C:\\P', titolo: 'P', perChi: PC })
    const c = s.cedi(SESSIONE)
    expect(c?.ptyId).toBe('pty-1')
    expect(f.fermati).toEqual([])
    expect(f.ascolti.has('pty-1')).toBe(false)
    expect(s.ha(SESSIONE)).toBe(false)
    s.avvia({ sessione: SESSIONE, cwd: 'C:\\P', titolo: 'P', perChi: PC })
    expect(s.chiudi(SESSIONE)).toBe(true)
    expect(f.fermati).toEqual(['pty-2'])
    expect(s.stato(SESSIONE)?.fase).toBe('chiusa')
  })

  it('compare fra le chat del PC con il suo id, chi la usa e lo schermo', async () => {
    const s = f.crea()
    s.avvia({ sessione: SESSIONE, cwd: 'C:\\P', titolo: 'Prova', perChi: PC })
    f.disegnaCampo('pty-1')
    await f.digerisci()
    const [c] = s.chat()
    expect(c?.id).toBe(idChatSottofondo(SESSIONE))
    expect(c?.sottofondo).toEqual(PC)
    expect(c?.coda.some((r) => r.includes('Benvenuto'))).toBe(true)
    expect(s.perId(idChatSottofondo(SESSIONE))).toBe(SESSIONE)
    const r = s.righe(SESSIONE, -1, 10)
    expect(r?.colonne).toBe(120)
  })

  it('se esce, la chat si toglie e il testo non consegnato resta per il prossimo avvio', () => {
    const s = f.crea()
    s.avvia({ sessione: SESSIONE, cwd: 'C:\\P', titolo: 'P', perChi: PC, testo: 'resta', idMessaggio: 'm-4' })
    f.ascolti.get('pty-1')?.({ id: 'pty-1', kind: 'exit', code: 1 })
    expect(s.ha(SESSIONE)).toBe(false)
    expect(s.stato(SESSIONE)?.fase).toBe('chiusa')
    s.avvia({ sessione: SESSIONE, cwd: 'C:\\P', titolo: 'P', perChi: PC })
    expect(s.stato(SESSIONE)?.inCoda).toBe(1)
  })

  it('una chat che non diventa mai pronta lo dice, non resta muta', () => {
    const s = f.crea()
    s.avvia({ sessione: SESSIONE, cwd: 'C:\\P', titolo: 'P', perChi: PC })
    f.avanti(ATTESA_PRONTA_MAX_MS + 1)
    s.giro()
    expect(s.stato(SESSIONE)?.fase).toBe('lenta')
  })
})

describe('le parti condivise', () => {
  it('i testi del campo dicono cosa succede, sempre', () => {
    expect(testoAvvio('avvio', 'PORTATILE-ESEMPIO', true)).toContain('La sto avviando su PORTATILE-ESEMPIO')
    expect(testoAvvio('avvio', 'PORTATILE-ESEMPIO', true)).toContain('parte appena è pronta')
    for (const f of ['chiedo', 'avvio', 'pronta', 'consegna', 'lavora', 'aspetta', 'scelta', 'lenta', 'chiusa', 'errore'] as const) expect(testoAvvio(f, 'X', false)).not.toBe('')
  })
  it('la coda: una volta per id, e i consegnati ricordati', () => {
    const v0 = { sessione: 's', cwd: 'c', titolo: 't', perChi: PC, dal: '', coda: [], consegnati: [] }
    const v1 = accodaTesto(accodaTesto(v0, { id: 'a', testo: 'x', quando: '' }), { id: 'a', testo: 'x', quando: '' })
    expect(v1.coda).toHaveLength(1)
    const v2 = segnaConsegnato(v1, 'a')
    expect(v2.coda).toHaveLength(0)
    expect(accodaTesto(v2, { id: 'a', testo: 'x', quando: '' }).coda).toHaveLength(0)
  })
})
