import { describe, it, expect, afterEach, vi } from 'vitest'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { creaServer, type ServerAutopiloti } from '../../src/autopilot-host/server'
import { apriArchivio } from '../../src/autopilot-host/archivio'
import { creaRegistroDomande } from '../../src/autopilot-host/domande'
import { apriMemoria } from '../../src/autopilot-host/memoria'
import { apriCode } from '../../src/autopilot-host/coda-store'
import { apriOrchestratori } from '../../src/autopilot-host/orchestratore-store'
import { apriAttesa } from '../../src/autopilot-host/attesa-store'
import type { AvviaProcesso, ProcessoClaude } from '../../src/autopilot-host/orchestratore'
import { nuovoAutopilota, type Autopilota } from '@shared/autopilota'
import type { VistaAttesa } from '@shared/attesa-specialisti'
import type { LavoroAffidato } from '@shared/aiuto-rete'
import {
  aggiungiEsitoUnione, datiPannello, durataAgenteMs, ESITI_UNIONE_MAX, esitoDelRifiuto, PAROLE_STATO_DOPO, statoDopoLavoro,
  type EsitoUnione
} from '@shared/dati-pannello-agenti'
import { attendi } from '../setup/attendi'
import { orologioDa } from '../setup/orologio'

/**
 * 22/11 (k-176h). Il pannello a destra: la fila delle unioni con la posizione, gli esiti recenti col criterio
 * misurato, la durata di ogni agente e lo stato del lavoro dopo la fine dello specialista.
 */

describe('durata di un agente', () => {
  it('da quando è partito, o quanto è durato se ha finito', () => {
    expect(durataAgenteMs('2026-11-22T08:00:00.000Z', undefined, '2026-11-22T08:05:00.000Z')).toBe(300_000)
    expect(durataAgenteMs('2026-11-22T08:00:00.000Z', '2026-11-22T08:02:00.000Z', '2026-11-22T09:00:00.000Z')).toBe(120_000)
    // Mai negativa; date rotte o assenti: niente.
    expect(durataAgenteMs('2026-11-22T08:10:00.000Z', undefined, '2026-11-22T08:00:00.000Z')).toBe(0)
    expect(durataAgenteMs('boh', undefined, '2026-11-22T08:00:00.000Z')).toBeUndefined()
    expect(durataAgenteMs(undefined, undefined, '2026-11-22T08:00:00.000Z')).toBeUndefined()
  })

  it('la durata sta nei dati del pannello solo se si conosce l’inizio', () => {
    expect(datiPannello({ titolo: 'T', dal: '2026-11-22T08:00:00.000Z', adesso: '2026-11-22T08:01:00.000Z' }).durataMs).toBe(60_000)
    expect(datiPannello({ titolo: 'T', dal: '2026-11-22T08:00:00.000Z', fine: '2026-11-22T08:00:30.000Z', adesso: '2026-11-22T09:00:00.000Z' }).durataMs).toBe(30_000)
    expect('durataMs' in datiPannello({ titolo: 'T' })).toBe(false)
    // I dati di prima restano com'erano.
    expect(datiPannello({ titolo: 'T' })).toEqual({ pc: { questoPc: true }, file: [], azione: { titolo: 'T' } })
  })
})

describe('esiti delle unioni', () => {
  const esito = (i: number): EsitoUnione => ({ id: `W|k-${i}`, titolo: `Compito ${i}`, esito: 'verde', verde: true, comando: 'npm test', quando: '2026-11-22T08:00:00.000Z' })

  it('il più recente prima, e non più di quelli ricordati', () => {
    let l: EsitoUnione[] = []
    for (let i = 1; i <= ESITI_UNIONE_MAX + 3; i++) l = aggiungiEsitoUnione(l, esito(i))
    expect(l).toHaveLength(ESITI_UNIONE_MAX)
    expect(l[0]!.id).toBe(`W|k-${ESITI_UNIONE_MAX + 3}`)
  })

  it('un conflitto si riconosce dal motivo, il resto è «non unita»', () => {
    expect(esitoDelRifiuto('conflitto su src/a.ts')).toBe('conflitto')
    expect(esitoDelRifiuto('il criterio dei compiti già uniti non passa')).toBe('non-unita')
  })
})

describe('stato del lavoro dopo la fine dello specialista', () => {
  it('in unione e in fila vengono prima di tutto', () => {
    expect(statoDopoLavoro({ unione: { inCorso: true }, compito: { stato: 'unito', criterioVerde: false } })).toBe('in-unione')
    expect(statoDopoLavoro({ unione: { inCorso: false } })).toBe('in-fila')
  })

  it('unito: verde o criterio rosso', () => {
    expect(statoDopoLavoro({ compito: { stato: 'unito', criterioVerde: true } })).toBe('unito')
    expect(statoDopoLavoro({ compito: { stato: 'unito', criterioVerde: false } })).toBe('criterio-rosso')
    expect(statoDopoLavoro({ compito: { stato: 'unito' } })).toBe('criterio-rosso')
  })

  it('conflitto dall’ultimo tentativo; senza notizie, niente', () => {
    expect(statoDopoLavoro({ compito: { stato: 'in-revisione' }, ultimoEsito: 'conflitto' })).toBe('conflitto')
    // 23/11: un compito ancora «in revisione» non sparisce dal pannello: il programma deve ancora unirlo.
    // 25/11: ma fuori dalla fila con un'unione non riuscita non è «in fila»: è da riprovare (prima lo diceva in fila per sempre).
    expect(statoDopoLavoro({ compito: { stato: 'in-revisione' }, ultimoEsito: 'non-unita' })).toBe('da-riprovare')
    expect(statoDopoLavoro({ compito: { stato: 'in-revisione', esito: 'unione ferma: scaduta 3 volte' } })).toBe('da-riprovare')
    expect(statoDopoLavoro({ compito: { stato: 'in-revisione', esito: 'unione non fatta: senza ramo principale non si può unire' } })).toBe('da-riprovare')
    expect(statoDopoLavoro({ compito: { stato: 'in-revisione' } })).toBe('in-fila')
    expect(statoDopoLavoro({ compito: { stato: 'da-fare' }, ultimoEsito: 'non-unita' })).toBeUndefined()
    expect(statoDopoLavoro({})).toBeUndefined()
  })

  it('le parole sono per tutti gli stati, in italiano semplice', () => {
    expect(Object.values(PAROLE_STATO_DOPO).every((p) => p.length > 0)).toBe(true)
    expect(PAROLE_STATO_DOPO['criterio-rosso']).toBe('criterio rosso')
  })
})

type Finto = ProcessoClaude & { emetti: (o: unknown) => void }

let server: ServerAutopiloti | undefined
let porta = 0
let processi: Finto[] = []

const avvia: AvviaProcesso = () => {
  const righe: ((r: string) => void)[] = []
  const p: Finto = {
    scrivi: () => {}, uccidi: () => {},
    suRiga: (f) => { righe.push(f) }, suUscita: () => {},
    emetti: (o) => { for (const f of righe) f(JSON.stringify(o)) }
  }
  processi.push(p)
  return p
}

const WS = 'Lavoro'

function vecchio(): Autopilota {
  return {
    ...nuovoAutopilota({ id: 'ap-vecchio', nome: 'Prima', obiettivo: 'la barra', cwd: process.cwd(), iniziatoIl: '2026-11-22T06:00:00.000Z', workspace: WS }),
    stato: 'lavoro',
    chats: [{ id: 'c-1', compito: 'rifare la barra', stato: 'lavoro', cicli: 1, sessionId: 's-1', ultimaAzione: 'Sto rifacendo la barra' }]
  }
}

const AFFIDATO: LavoroAffidato = {
  id: 'r0123456789ab', workspace: WS, cwd: process.cwd(), pcId: 'pc-1', pcNome: 'PC-PROVA', ruolo: 'sviluppatore', descrizione: 'k-9: lavoro remoto',
  prompt: 'p', sistema: 's', modello: 'sonnet', strumenti: [], stato: 'spedito', inizio: '2026-11-22T07:50:00.000Z'
}

async function avviaServizio(): Promise<void> {
  const orologio = orologioDa('2026-11-22T08:00:00.000Z')
  const dati = mkdtempSync(join(tmpdir(), 'ap-unioni-'))
  const archivio = apriArchivio(mkdtempSync(join(tmpdir(), 'ap-unioni-arc-')))
  archivio.scrivi(vecchio())
  mkdirSync(join(archivio.cartella, 'servizio'), { recursive: true })
  writeFileSync(join(archivio.cartella, 'servizio', 'aiuti-affidati.json'), JSON.stringify([AFFIDATO]), 'utf8')
  const cartella = join(dati, 'orch')
  const orch = apriOrchestratori(cartella)
  processi = []
  const s = creaServer({
    archivio,
    memoria: apriMemoria(mkdtempSync(join(tmpdir(), 'ap-unioni-mem-'))),
    versione: '0.96.0',
    esegui: () => Promise.resolve({ codice: 1, uscita: 'non ancora' }),
    avviaLavoro: () => Promise.resolve(),
    avvisa: () => Promise.resolve(),
    domande: creaRegistroDomande({ adesso: orologio.ms }),
    ultimoDetto: () => undefined,
    scadenzaDomandaMs: 5000,
    adesso: () => new Date(orologio.ms()).toISOString(),
    coda: apriCode(cartella),
    orchestratori: orch,
    avviaProcesso: avvia,
    porta: 47997,
    raccoltaEventiMs: 5,
    attesa: apriAttesa(join(dati, 'attesa-specialisti.json'))
  })
  server = s
  await new Promise<void>((ris) => s.listen(0, '127.0.0.1', () => { porta = (s.address() as { port: number }).port; ris() }))
  expect(s.migraVecchi()).toBe(1)
  await attendi(() => processi.length > 0, { cosa: 'il processo dell’autopilota' })
}

afterEach(() => { server?.close(); server = undefined; vi.restoreAllMocks() })

describe('la vista porta durata e campi nuovi sullo stesso canale', () => {
  it('durata di chi lavora, e le liste nuove ci sono (vuote) senza rompere le vecchie', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await avviaServizio()
    const v = (await (await fetch(`http://127.0.0.1:${porta}/orchestratore/attesa`)).json()) as VistaAttesa
    const r = v.alLavoro.find((x) => x.id === AFFIDATO.id)!
    // Partito alle 07:50, adesso sono le 08:00: dieci minuti (l'orologio di prova avanza di pochi millisecondi).
    expect(r.pannello?.durataMs).toBeGreaterThanOrEqual(600_000)
    expect(r.pannello?.durataMs).toBeLessThan(610_000)
    expect(r.pannello?.pc).toEqual({ questoPc: false, nome: 'PC-PROVA' })
    expect(v.inUnione ?? []).toEqual([])
    expect(v.esitiUnioni ?? {}).toEqual({})
    expect(v.dopoLavoro ?? []).toEqual([])
  })
})
