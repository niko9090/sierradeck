import { describe, it, expect, afterEach, vi } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Server } from 'node:http'
import {
  ATTESA_MASSIMA_MS, COMANDO_PROCESSI, creaGuardiaPc, giudicaMisura, giudicaPesanteConPcCarico, leggiProcessi, piuPesante,
  PROCESSORE_PER_MS, RILASCIO_PER_MS, type GuardiaPc
} from '../../src/autopilot-host/guardia-pc'
import { conTurni, creaTurni } from '../../src/autopilot-host/turni-criteri'
import { ePesante } from '../../src/autopilot-host/criteri-veloci'
import { creaServer, type ServerAutopiloti } from '../../src/autopilot-host/server'
import { unicoFinto } from '../setup/unico-finto'
import { apriArchivio, type Archivio } from '../../src/autopilot-host/archivio'
import { creaRegistroDomande } from '../../src/autopilot-host/domande'
import type { PcCarico } from '@shared/indicatore-autopilota'
import { nuovoAutopilota, type Autopilota, type ChatGovernata } from '@shared/autopilota'
import type { MisuraPc } from '@shared/posti-chat'
import { attendi } from '../setup/attendi'

/**
 * 0.85.1 — la guardia del PC. Il 23/10 sera il processore era al 100%, con 15
 * processi `claude` e un programma esterno pesante: le chat nuove, le
 * compilazioni e le suite complete partivano lo stesso.
 */

const ORA = Date.parse('2026-10-23T20:00:00.000Z')
const iso = (ms: number): string => new Date(ms).toISOString()
const pc = (caricoPercento: number, memoriaLiberaMb = 9_000, memoriaTotaleMb = 16_384): MisuraPc => ({ processori: 8, memoriaLiberaMb, memoriaTotaleMb, caricoPercento })

describe('quando il PC è carico', () => {
  // 0.85.2: la soglia è scesa al 75% per 20 s (era 85% per un minuto).
  it('processore sopra il 75%: carico solo dopo 20 secondi, non per un picco', () => {
    const a = giudicaMisura(pc(100), {}, ORA)
    expect(a.carico).toBeUndefined()
    expect(a.sopraDal).toBe(ORA)
    expect(giudicaMisura(pc(97), a, ORA + 10_000).carico).toBeUndefined()
    const b = giudicaMisura(pc(97), a, ORA + PROCESSORE_PER_MS)
    expect(b.carico).toMatchObject({ risorsa: 'processore', dal: ORA })
    expect(b.carico?.motivo).toMatch(/^processore al 97% da meno di un minuto/)
    // Prima di entrare, una misura sotto soglia fa ricominciare il conto.
    expect(giudicaMisura(pc(60), a, ORA + 15_000)).toEqual({})
    // Il 75% preciso non è «sopra».
    expect(giudicaMisura(pc(75), {}, ORA)).toEqual({})
  })

  it('memoria libera sotto il 15%: carico subito', () => {
    const g = giudicaMisura(pc(20, 2_000, 16_384), {}, ORA)
    expect(g.carico).toMatchObject({ risorsa: 'memoria' })
    expect(g.carico?.motivo).toBe('memoria libera al 12% (2000 MB su 16384)')
    expect(giudicaMisura(pc(20, 2_600, 16_384), {}, ORA).carico).toBeUndefined()
  })
})

describe('il programma che consuma di più', () => {
  const csv = [
    '"Name","PercentProcessorTime","WorkingSetPrivate"',
    '"_Total","800","9000000000"',
    '"Idle","0","8192"',
    '"claude","120","600000000"',
    '"claude#1","100","500000000"',
    '"claude#2","60","400000000"',
    '"programma-esterno","350","3000000000"',
    '"node","40","300000000"'
  ].join('\r\n')

  it('legge l’elenco di Windows, somma le istanze e salta _Total e Idle', () => {
    const elenco = leggiProcessi(csv, 8)
    expect(elenco.map((p) => p.nome).sort()).toEqual(['claude', 'node', 'programma-esterno'])
    expect(elenco.find((p) => p.nome === 'claude')).toEqual({ nome: 'claude', processore: 35, memoriaMb: 1431 })
  })

  it('il più pesante per la risorsa che manca', () => {
    const elenco = leggiProcessi(csv, 8)
    expect(piuPesante(elenco, 'processore')?.nome).toBe('programma-esterno')
    expect(piuPesante(elenco, 'memoria')?.nome).toBe('programma-esterno')
    expect(piuPesante([], 'memoria')).toBeUndefined()
  })

  it('mai chiudere programmi: il comando legge e basta', () => {
    expect(COMANDO_PROCESSI).not.toMatch(/Stop-Process|taskkill|kill|Remove|Set-|priority/i)
    expect(COMANDO_PROCESSI).toMatch(/^Get-CimInstance /)
  })
})

/** Una guardia con il PC finto e l'orologio finto. */
function guardiaFinta(letture: () => MisuraPc, opz: { programma?: string } = {}) {
  let t = ORA
  const cercate: string[] = []
  const g = creaGuardiaPc({
    misura: letture,
    cerca: (per) => { cercate.push(per); return Promise.resolve(opz.programma !== undefined ? { nome: opz.programma, processore: 44, memoriaMb: 3000 } : undefined) },
    ora: () => t,
    dormi: (ms) => { t += ms; return Promise.resolve() },
    riprovaMs: 15_000
  })
  return { g, avanza: (ms: number) => { t += ms }, ora: () => t, cercate }
}

describe('la guardia', () => {
  it('dice «PC carico» con il programma più pesante, e si libera da sola', async () => {
    let carico = 99
    const f = guardiaFinta(() => pc(carico), { programma: 'programma-esterno' })
    expect(f.g.valuta()).toBeUndefined()
    f.avanza(PROCESSORE_PER_MS)
    expect(f.g.valuta()?.motivo).toMatch(/^processore al 99%/)
    await Promise.resolve(); await Promise.resolve()
    expect(f.g.stato()?.programma).toBe('programma-esterno (44% del processore)')
    expect(f.cercate).toEqual(['processore'])
    carico = 30
    // 0.85.2: una misura bassa non basta, ci vuole un minuto intero sotto il 60%.
    expect(f.g.valuta()).toBeDefined()
    f.avanza(RILASCIO_PER_MS)
    expect(f.g.valuta()).toBeUndefined()
    expect(f.g.stato()).toBeUndefined()
  })

  it('un passo aspetta finché il PC si libera', async () => {
    let n = 0
    // Pieno per due minuti e mezzo, poi libero.
    const f = guardiaFinta(() => { n += 1; return pc(n <= 10 ? 98 : 40) })
    f.g.valuta()
    f.avanza(PROCESSORE_PER_MS)
    const inizio = f.ora()
    await f.g.attendi('la suite')
    expect(f.ora() - inizio).toBeGreaterThanOrEqual(2 * 60_000)
    expect(f.g.stato()).toBeUndefined()
  })

  it('mai fermo per sempre: dopo l’attesa massima il passo parte lo stesso', async () => {
    const f = guardiaFinta(() => pc(10, 1_000, 16_384))
    const inizio = f.ora()
    await f.g.attendi('la suite')
    expect(f.ora() - inizio).toBe(ATTESA_MASSIMA_MS)
  })
})

describe('compilazioni e test completi dei criteri', () => {
  it('electron-builder è un comando pesante', () => {
    expect(ePesante('npx electron-builder --win')).toBe(true)
  })

  it('0.86.1: un pesante aspetta la guardia prima di prendere il turno (non tenendolo); i comandi leggeri no', async () => {
    const partiti: string[] = []
    const inAttesa: Array<() => void> = []
    const libera = async (): Promise<void> => {
      await attendi(() => inAttesa.length > 0)
      inAttesa.shift()?.()
    }
    const guardia: GuardiaPc = {
      valuta: () => undefined,
      stato: () => undefined,
      attendi: () => new Promise<void>((r) => { inAttesa.push(r) })
    }
    const turni = creaTurni()
    const esegui = conTurni(async (c) => { partiti.push(c); return { codice: 0, uscita: '' } }, turni, guardia)
    const suite = esegui('npx vitest run', 'C:/p')
    const gradle = esegui('cd android && gradle test', 'C:/q')
    await esegui("bash -c 'test -s x'", 'C:/p')
    await new Promise((r) => setTimeout(r, 10))
    expect(partiti).toEqual(["bash -c 'test -s x'"])
    // Tutti e due aspettano la guardia, e nessuno tiene il turno intanto:
    // una chat può ancora prenderlo.
    expect(inAttesa).toHaveLength(2)
    expect(turni.stato()).toMatchObject({ inCorso: undefined, inFila: 0 })
    expect(turni.prenota('ap::c-1', 'C:/r', 60_000).ok).toBe(true)
    turni.rilascia('ap::c-1')
    await libera()
    await suite
    expect(partiti).toEqual(["bash -c 'test -s x'", 'npx vitest run'])
    await libera()
    await gradle
    expect(partiti).toHaveLength(3)
  })
})

describe('i comandi pesanti delle chat', () => {
  const carico: PcCarico = { motivo: 'processore al 100% da 3 min', dal: iso(ORA), programma: 'programma-esterno (60% del processore)' }
  const bash = (command: string) => ({ tool_name: 'Bash', tool_input: { command }, cwd: 'C:/p' })

  it('con il PC carico una suite completa è rimandata, con il motivo e senza chiudere niente', () => {
    const g = giudicaPesanteConPcCarico(bash('node node_modules/vitest/vitest.mjs run tests/main --maxWorkers=2'), carico)
    expect(g.ok).toBe(false)
    if (g.ok) return
    expect(g.pcCarico).toBe(true)
    expect(g.motivo).toContain('PC carico: aspetto — processore al 100% da 3 min; consuma di più programma-esterno')
    expect(g.motivo).toContain('Non chiudere nessun programma')
  })

  it('il resto passa sempre; senza carico passa tutto', () => {
    expect(giudicaPesanteConPcCarico(bash('git status'), carico).ok).toBe(true)
    expect(giudicaPesanteConPcCarico({ tool_name: 'Edit', tool_input: { file_path: 'x' } }, carico).ok).toBe(true)
    expect(giudicaPesanteConPcCarico(bash('cd android && gradle assembleDebug'), undefined).ok).toBe(true)
  })
})

describe('il servizio con la guardia', () => {
  let server: ServerAutopiloti | undefined
  let porta = 0
  let archivio: Archivio
  let stato: PcCarico | undefined
  let ora = ORA

  afterEach(() => { server?.close(); server = undefined; vi.restoreAllMocks() })

  async function ambiente(): Promise<void> {
    archivio = apriArchivio(mkdtempSync(join(tmpdir(), 'ap-guardia-')))
    ora = ORA
    const valuta = vi.fn(() => stato)
    server = creaServer({
      ...unicoFinto(archivio),
      archivio,
      esegui: () => Promise.resolve({ codice: 1, uscita: 'rosso' }),
      avviaLavoro: () => Promise.resolve(),
      avvisa: () => Promise.resolve(),
      domande: creaRegistroDomande({ adesso: () => ORA }),
      scadenzaDomandaMs: 5000,
      adesso: () => iso(ora),
      misuraPc: () => pc(10),
      guardiaPc: { valuta, stato: () => stato, attendi: () => Promise.resolve() }
    })
    const s: Server = server
    await new Promise<void>((ris) => { s.listen(0, '127.0.0.1', () => { porta = (s.address() as { port: number }).port; ris() }) })
    await chiama('POST', '/stato-programma', { letto: ORA, chat: [], domandeAperte: 0, progetti: [], altriPc: [], limiti: { cinqueOre: { percento: 5, lettoIl: ORA }, settimana: { percento: 5, lettoIl: ORA } } })
  }
  async function chiama(metodo: string, percorso: string, corpo?: unknown): Promise<any> {
    const r = await fetch(`http://127.0.0.1:${porta}${percorso}`, { method: metodo, headers: { 'Content-Type': 'application/json' }, ...(corpo !== undefined ? { body: JSON.stringify(corpo) } : {}) })
    return r.json()
  }
  const chat = (id: string): ChatGovernata => ({ id, compito: `compito ${id}`, stato: 'lavoro', cicli: 1, sessionId: `s-${id}` })
  const conChat = (id: string, chats: ChatGovernata[] = []): Autopilota => ({
    ...nuovoAutopilota({ id, nome: id, obiettivo: 'o', cwd: 'C:\\Progetti\\Esempio', iniziatoIl: iso(ORA - 3_600_000) }),
    stato: 'lavoro', ultimoEvento: iso(ORA), ramoBase: 'main', tettoChat: 8, chats
  })

  it('una chat che lancia la suite completa col PC carico riceve un «no» con il motivo', async () => {
    stato = { motivo: 'processore al 99% da 5 min', dal: iso(ORA - 300_000) }
    await ambiente()
    archivio.scrivi(conChat('ap-a', [chat('c-1')]))
    const r = await chiama('POST', '/hook/pretool?ap=ap-a&chat=c-1', { tool_name: 'Bash', tool_input: { command: 'npx vitest run' }, cwd: 'C:\\Progetti\\Esempio' })
    expect(r.hookSpecificOutput).toMatchObject({ permissionDecision: 'deny' })
    expect(r.hookSpecificOutput.permissionDecisionReason).toContain('PC carico: aspetto')
    // Non è un divieto: non finisce nelle decisioni dell'autopilota.
    expect(archivio.leggi('ap-a')!.decisioni.some((d) => d.cosa.includes('PC carico'))).toBe(false)
    expect(await chiama('POST', '/hook/pretool?ap=ap-a&chat=c-1', { tool_name: 'Bash', tool_input: { command: 'git status' }, cwd: 'C:\\Progetti\\Esempio' })).toEqual({})
  })
})
