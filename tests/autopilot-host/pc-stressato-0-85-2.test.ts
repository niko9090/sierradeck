import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, readFileSync, existsSync, writeFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Server } from 'node:http'
import {
  ATTESA_MASSIMA_MS, creaGuardiaPc, ePesantePerLaChat, eTscIntero, giudicaMisura, giudicaPesanteDellaChat,
  PROCESSORE_PER_MS, QUIETE_DOPO_MS, RENDI_DOPO_MS, RILASCIO_PER_MS, type GuardiaPc
} from '../../src/autopilot-host/guardia-pc'
import { conRisorse, conRisorseContenute, creaTurni } from '../../src/autopilot-host/turni-criteri'
import { conLimite, supervisoriAlLavoro, type Interrogazione } from '../../src/autopilot-host/supervisore'
import { apriArchivio, DECISIONI_SOGLIA, DECISIONI_TENUTE, type Archivio } from '../../src/autopilot-host/archivio'
import { improntaCodiceAsincrona, IMPRONTA_VALE_MS } from '../../src/autopilot-host/criteri-veloci'
import { codaDalDisco, creaServer, type ServerAutopiloti } from '../../src/autopilot-host/server'
import { creaRegistroDomande } from '../../src/autopilot-host/domande'
import type { GitAsincrono } from '../../src/autopilot-host/worktree'
import { nuovoAutopilota, VERSIONE_AUTOPILOTA, type Autopilota, type Decisione } from '@shared/autopilota'
import { POSTI_DI_SERIE, POSTI_MAX, postiDalPc, postiMassimi, type MisuraPc } from '@shared/posti-chat'

/**
 * 0.85.2 — il PC sotto sforzo. Il 27/10 il processore è rimasto fra il 92 e
 * il 100% per 17 minuti con la guardia «attiva»: chat che lanciavano suite e
 * gradle per conto loro, supervisori in parallelo, un diario di 5 MB riletto
 * a ogni strumento, git sincrono a ogni fermata.
 */

const ORA = Date.parse('2026-10-27T20:00:00.000Z')
const pc = (caricoPercento: number, memoriaLiberaMb = 9_000, memoriaTotaleMb = 16_384): MisuraPc => ({ processori: 8, memoriaLiberaMb, memoriaTotaleMb, caricoPercento })
const bash = (command: string, extra: Record<string, unknown> = {}) => ({ tool_name: 'Bash', tool_input: { command, ...extra }, cwd: 'C:/p' })

describe('1. i comandi pesanti delle chat passano dai turni del PC', () => {
  it('pesanti per la chat: suite, gradle, tsc sull’intero progetto; non i test di un file', () => {
    expect(ePesantePerLaChat('npx vitest run')).toBe(true)
    expect(ePesantePerLaChat('npm test')).toBe(true)
    expect(ePesantePerLaChat('cd android && ./gradlew assembleDebug')).toBe(true)
    expect(ePesantePerLaChat('npx tsc --noEmit')).toBe(true)
    expect(ePesantePerLaChat('npm run typecheck')).toBe(true)
    expect(ePesantePerLaChat('node node_modules/typescript/bin/tsc -p tsconfig.json')).toBe(true)
    expect(ePesantePerLaChat('npx vitest run tests/autopilot-host/archivio.test.ts')).toBe(false)
    expect(ePesantePerLaChat('npx tsc --version')).toBe(false)
    expect(eTscIntero('npx tsc src/uno.ts --noEmit')).toBe(false)
    expect(ePesantePerLaChat('git status')).toBe(false)
  })

  it('la prima chat prende il turno; la seconda riceve «già in corso, riprova fra N minuti»', () => {
    let t = ORA
    const turni = creaTurni({ ora: () => t })
    const uno = giudicaPesanteDellaChat(bash('npx vitest run'), { chi: 'ap::c-1', cwd: 'C:/p', turni, ora: t })
    expect(uno.ok).toBe(true)
    const due = giudicaPesanteDellaChat(bash('npm test'), { chi: 'ap::c-2', cwd: 'C:/q', turni, ora: t })
    expect(due.ok).toBe(false)
    if (due.ok) return
    expect(due.pcCarico).toBe(true)
    expect(due.motivo).toMatch(/un comando pesante è già in corso \(un comando pesante di un'altra chat\), riprova fra 3 minuti/)
    // I leggeri passano sempre.
    expect(giudicaPesanteDellaChat(bash('git status'), { chi: 'ap::c-2', cwd: 'C:/q', turni, ora: t }).ok).toBe(true)
    // Lo strumento dopo della prima chat (oltre i 15 s) rende il turno.
    t += RENDI_DOPO_MS
    expect(giudicaPesanteDellaChat({ tool_name: 'Read', tool_input: { file_path: 'x' } }, { chi: 'ap::c-1', cwd: 'C:/p', turni, ora: t }).ok).toBe(true)
    expect(turni.prenotato()).toBeUndefined()
    expect(giudicaPesanteDellaChat(bash('npm test'), { chi: 'ap::c-2', cwd: 'C:/q', turni, ora: t }).ok).toBe(true)
    turni.rilascia('ap::c-2')
  })

  it('uno strumento chiesto insieme (subito dopo) o un comando in sottofondo non rendono il turno', () => {
    let t = ORA
    const turni = creaTurni({ ora: () => t })
    expect(giudicaPesanteDellaChat(bash('npx vitest run'), { chi: 'c-1', cwd: 'C:/p', turni, ora: t }).ok).toBe(true)
    t += 50
    giudicaPesanteDellaChat({ tool_name: 'Read', tool_input: {} }, { chi: 'c-1', cwd: 'C:/p', turni, ora: t })
    expect(turni.prenotato()?.chi).toBe('c-1')
    turni.rilascia('c-1')
    expect(giudicaPesanteDellaChat(bash('gradle build', { run_in_background: true }), { chi: 'c-1', cwd: 'C:/p', turni, ora: t }).ok).toBe(true)
    t += 60_000
    giudicaPesanteDellaChat({ tool_name: 'Read', tool_input: {} }, { chi: 'c-1', cwd: 'C:/p', turni, ora: t })
    expect(turni.prenotato()).toMatchObject({ chi: 'c-1', inSottofondo: true })
    turni.rilascia('c-1')
  })

  it('il turno di una chat scade da solo al tempo del suo comando', async () => {
    const turni = creaTurni()
    expect(turni.prenota('c-1', 'C:/p', 20).ok).toBe(true)
    expect(turni.prenota('c-2', 'C:/p', 20).ok).toBe(false)
    await new Promise((r) => setTimeout(r, 40))
    expect(turni.prenota('c-2', 'C:/p', 20).ok).toBe(true)
    turni.rilascia('c-2')
  })

  it('un criterio del servizio aspetta il turno della chat, e parte quando lo rende', async () => {
    const turni = creaTurni()
    expect(turni.prenota('c-1', 'C:/p', 60_000).ok).toBe(true)
    let partito = false
    const criterio = turni.pesante('C:/p', async () => { partito = true; return 0 })
    await new Promise((r) => setTimeout(r, 10))
    expect(partito).toBe(false)
    turni.rilascia('c-1')
    await criterio
    expect(partito).toBe(true)
    // E mentre gira un criterio la chat riceve il «no».
    let fine = (): void => {}
    const lungo = turni.pesante('C:/p', () => new Promise<void>((r) => { fine = r }))
    await new Promise((r) => setTimeout(r, 5))
    const no = turni.prenota('c-1', 'C:/p', 60_000)
    expect(no).toMatchObject({ ok: false, occupato: 'un criterio dell\'autopilota (test o compilazione)' })
    fine()
    await lungo
  })

  it('i criteri del servizio: vitest con due processi, gradle senza --no-daemon', async () => {
    expect(conRisorseContenute('npx vitest run')).toBe('npx vitest run --maxWorkers=2')
    expect(conRisorseContenute('node node_modules/vitest/vitest.mjs run tests/main')).toBe('node node_modules/vitest/vitest.mjs run --maxWorkers=2 tests/main')
    expect(conRisorseContenute('npx vitest run --maxWorkers=4')).toBe('npx vitest run --maxWorkers=4')
    expect(conRisorseContenute('cd android && gradle testDebugUnitTest assembleDebug --no-daemon')).toBe('cd android && gradle testDebugUnitTest assembleDebug')
    expect(conRisorseContenute('npm test', 'vitest run')).toBe('npm test -- --maxWorkers=2')
    expect(conRisorseContenute('npm test -- tests/x', 'vitest run')).toBe('npm test -- --maxWorkers=2 tests/x')
    expect(conRisorseContenute('npm test', 'jest')).toBe('npm test')
    const visti: string[] = []
    const esegui = conRisorse(async (c) => { visti.push(c); return { codice: 0, uscita: '' } })
    await esegui('npx vitest run', 'C:/non-esiste')
    await esegui('npm run typecheck', 'C:/non-esiste')
    expect(visti).toEqual(['npx vitest run --maxWorkers=2', 'npm run typecheck'])
  })
})

describe('2. pochi supervisori insieme', () => {
  const finto = () => {
    let vivi = 0
    let picco = 0
    const ordine: string[] = []
    const fine: Array<() => void> = []
    const interroga: Interrogazione = async (prompt, cwd) => {
      vivi += 1; picco = Math.max(picco, vivi)
      ordine.push(`${cwd}:${prompt}`)
      await new Promise<void>((r) => { fine.push(r) })
      vivi -= 1
      return { testo: prompt }
    }
    return { interroga, picco: () => picco, ordine, fine, vivi: () => vivi }
  }
  const scorri = async (): Promise<void> => { for (let i = 0; i < 5; i += 1) await new Promise((r) => setTimeout(r, 2)) }

  it('al più due insieme sul PC, nell’ordine di arrivo; contano nei posti', async () => {
    const f = finto()
    const s = conLimite(f.interroga, { distanzaMs: 0 })
    const p = ['A', 'B', 'C', 'D'].map((x) => s(x, `C:/${x}`, undefined))
    await scorri()
    expect(f.vivi()).toBe(2)
    expect(supervisoriAlLavoro()).toBe(2)
    expect(s.inFila()).toBe(2)
    while (f.fine.length > 0 || f.ordine.length < 4) { f.fine.shift()?.(); await scorri() }
    await Promise.all(p)
    expect(f.picco()).toBe(2)
    expect(f.ordine).toEqual(['C:/A:A', 'C:/B:B', 'C:/C:C', 'C:/D:D'])
    expect(supervisoriAlLavoro()).toBe(0)
  })

  it('più fermate di fila sulla stessa cartella: uno alla volta, con una pausa fra l’uno e l’altro', async () => {
    const f = finto()
    const pause: number[] = []
    const s = conLimite(f.interroga, { distanzaMs: 3_000, dormi: (ms) => { pause.push(ms); return Promise.resolve() } })
    const uno = s('uno', 'C:\\Progetto', undefined)
    const due = s('due', 'c:/progetto/', undefined)
    await scorri()
    expect(f.vivi()).toBe(1)
    f.fine.shift()!()
    await uno
    await scorri()
    expect(f.vivi()).toBe(1)
    f.fine.shift()!()
    await due
    expect(f.picco()).toBe(1)
    expect(pause).toContain(3_000)
  })

  it('un supervisore che fallisce rende il posto', async () => {
    const s = conLimite(() => Promise.reject(new Error('scaduto')), { massimo: 1, distanzaMs: 0 })
    await expect(s('x', 'C:/a', undefined)).rejects.toThrow('scaduto')
    await expect(s('y', 'C:/b', undefined)).rejects.toThrow('scaduto')
    expect(s.alLavoro()).toBe(0)
  })

  it('di serie al più quattro chat insieme; «più chat» fino a otto', () => {
    expect(postiMassimi(0)).toBe(POSTI_DI_SERIE)
    expect(postiMassimi(1)).toBe(POSTI_MAX)
    expect(postiDalPc({ processori: 32, memoriaLiberaMb: 64_000, memoriaTotaleMb: 128_000, caricoPercento: 5 }, 0).posti).toBe(4)
  })
})

describe('3. la guardia con l’isteresi', () => {
  function guardia(letture: () => MisuraPc) {
    let t = ORA
    const g = creaGuardiaPc({ misura: letture, ora: () => t, dormi: (ms) => { t += ms; return Promise.resolve() }, riprovaMs: 5_000 })
    return { g, avanza: (ms: number) => { t += ms }, ora: () => t }
  }

  it('entra con il 75% per 20 s; una misura bassa non libera, una alta rimette il conto a zero', () => {
    let carico = 80
    const f = guardia(() => pc(carico))
    expect(f.g.valuta()).toBeUndefined()
    f.avanza(PROCESSORE_PER_MS)
    expect(f.g.valuta()?.motivo).toMatch(/^processore al 80%/)
    carico = 30
    f.avanza(30_000)
    expect(f.g.valuta()).toBeDefined()
    // Torna su per una misura: il minuto sotto soglia ricomincia.
    carico = 70
    f.avanza(25_000)
    expect(f.g.valuta()).toBeDefined()
    carico = 30
    f.avanza(5_000)
    expect(f.g.valuta()).toBeDefined()
    f.avanza(RILASCIO_PER_MS - 5_000)
    expect(f.g.valuta()).toBeDefined()
    f.avanza(5_000)
    expect(f.g.valuta()).toBeUndefined()
  })

  it('nel mezzo (fra 60 e 75%) resta carico chi lo è, e non entra chi non lo è', () => {
    const fermo = giudicaMisura(pc(70), {}, ORA)
    expect(giudicaMisura(pc(70), fermo, ORA + 120_000).carico).toBeUndefined()
    const carico = { carico: { motivo: 'x', risorsa: 'processore' as const, dal: ORA } }
    expect(giudicaMisura(pc(65), carico, ORA + 120_000).carico).toBeDefined()
  })

  it('appena liberato parte un pesante solo', async () => {
    let carico = 95
    const f = guardia(() => pc(carico))
    f.g.valuta(); f.avanza(PROCESSORE_PER_MS); f.g.valuta()
    expect(f.g.passoLibero!()).toBe(false)
    carico = 20
    f.g.valuta(); f.avanza(RILASCIO_PER_MS); expect(f.g.valuta()).toBeUndefined()
    await f.g.attendi('il primo')
    const prima = f.ora()
    await f.g.attendi('il secondo')
    expect(f.ora() - prima).toBeGreaterThanOrEqual(QUIETE_DOPO_MS - 5_000)
  })

  it('mai fermo per sempre: il tetto documentato dell’attesa è un’ora', async () => {
    const f = guardia(() => pc(10, 1_000, 16_384))
    const inizio = f.ora()
    await f.g.attendi('la suite')
    expect(ATTESA_MASSIMA_MS).toBe(60 * 60_000)
    expect(f.ora() - inizio).toBe(ATTESA_MASSIMA_MS)
  })

  it('misura da sola ogni 5 s', async () => {
    let n = 0
    const g = creaGuardiaPc({ misura: () => { n += 1; return pc(10) }, campioneMs: 10 })
    const ferma = g.avvia!()
    await new Promise((r) => setTimeout(r, 55))
    ferma()
    expect(n).toBeGreaterThanOrEqual(3)
    // Con la misura da sola, `valuta` fra un campione e l'altro non rimisura.
    const prima = n
    const g2 = creaGuardiaPc({ misura: () => { n += 1; return pc(10) }, campioneMs: 60_000 })
    const ferma2 = g2.avvia!()
    g2.valuta(); g2.valuta(); g2.valuta()
    ferma2()
    expect(n - prima).toBe(1)
  })

  it('con il PC carico la chat riceve il «no» della guardia prima ancora dei turni', () => {
    const turni = creaTurni()
    const g: GuardiaPc = { valuta: () => undefined, stato: () => ({ motivo: 'processore al 90% da 1 min', dal: new Date(ORA).toISOString() }), attendi: () => Promise.resolve() }
    const r = giudicaPesanteDellaChat(bash('npx vitest run'), { chi: 'c', cwd: 'C:/p', turni, guardia: g })
    expect(r).toMatchObject({ ok: false, pcCarico: true })
    expect(turni.prenotato()).toBeUndefined()
  })
})

describe('4. il diario nel file, al più 600 voci', () => {
  const cartella = (): string => mkdtempSync(join(tmpdir(), 'ap-diario-'))
  const decisioni = (n: number, da = 0): Decisione[] => Array.from({ length: n }, (_, i) => ({ quando: new Date(ORA + (da + i) * 1000).toISOString(), cosa: `passo ${da + i}` }))
  const ap = (d: Decisione[]): Autopilota => ({ ...nuovoAutopilota({ id: 'ap-d', nome: 'd', obiettivo: 'o', cwd: 'C:/p', criteri: [], iniziatoIl: new Date(ORA).toISOString() }), decisioni: d })
  const righe = (p: string): string[] => readFileSync(p, 'utf8').split('\n').filter((r) => r !== '')

  it('oltre la soglia il file tiene le ultime 500; le altre vanno nel jsonl, senza rientri', () => {
    const c = cartella()
    const archivio = apriArchivio(c)
    archivio.scrivi(ap(decisioni(DECISIONI_SOGLIA)))
    expect(existsSync(join(c, 'ap-d.decisioni.jsonl'))).toBe(false)
    archivio.scrivi(ap(decisioni(DECISIONI_SOGLIA + 1)))
    const letto = archivio.leggi('ap-d')!
    expect(letto.decisioni).toHaveLength(DECISIONI_TENUTE)
    expect(letto.decisioni[0]!.cosa).toBe('passo 101')
    expect(letto.decisioniArchiviate).toBe(101)
    expect(righe(join(c, 'ap-d.decisioni.jsonl'))).toHaveLength(101)
    expect(readFileSync(join(c, 'ap-d.json'), 'utf8')).not.toContain('\n  ')
    expect(archivio.decisioniVecchie!('ap-d').map((d) => d.cosa).slice(0, 2)).toEqual(['passo 0', 'passo 1'])
  })

  it('un file grande di prima si accorcia alla prima scrittura, senza perdere niente', () => {
    const c = cartella()
    writeFileSync(join(c, 'ap-d.json'), JSON.stringify({ ...ap(decisioni(18_635)), versione: VERSIONE_AUTOPILOTA }, null, 2))
    const archivio = apriArchivio(c)
    const grande = archivio.leggi('ap-d')!
    expect(grande.decisioni).toHaveLength(18_635)
    archivio.scrivi({ ...grande, decisioni: [...grande.decisioni, ...decisioni(1, 18_635)] })
    expect(archivio.leggi('ap-d')!.decisioni).toHaveLength(DECISIONI_TENUTE)
    const tutte = [...archivio.decisioniVecchie!('ap-d'), ...archivio.leggi('ap-d')!.decisioni]
    expect(tutte).toHaveLength(18_636)
    expect(new Set(tutte.map((d) => d.cosa)).size).toBe(18_636)
    expect(statSync(join(c, 'ap-d.json')).size).toBeLessThan(100_000)
  })

  it('una fotografia vecchia non rimette nel jsonl quello che c’è già', () => {
    const c = cartella()
    const archivio = apriArchivio(c)
    const vecchia = ap(decisioni(590))
    archivio.scrivi(ap(decisioni(DECISIONI_SOGLIA + 1)))
    archivio.scrivi({ ...vecchia, decisioni: [...vecchia.decisioni, ...decisioni(15, 1000)] })
    const vecchie = archivio.decisioniVecchie!('ap-d')
    expect(new Set(vecchie.map((d) => d.cosa)).size).toBe(vecchie.length)
    // Un archivio riaperto (servizio riavviato) sa cosa c'è già nel jsonl.
    const riaperto = apriArchivio(c)
    riaperto.scrivi({ ...vecchia, decisioni: [...vecchia.decisioni, ...decisioni(15, 1000)] })
    expect(riaperto.decisioniVecchie!('ap-d')).toHaveLength(vecchie.length)
  })

  it('leggi usa la cache finché il file non cambia; una scrittura la rinnova', () => {
    const c = cartella()
    const archivio = apriArchivio(c)
    archivio.scrivi(ap(decisioni(3)))
    const uno = archivio.leggi('ap-d')
    expect(archivio.leggi('ap-d')).toBe(uno)
    archivio.scrivi(ap(decisioni(4)))
    expect(archivio.leggi('ap-d')!.decisioni).toHaveLength(4)
    // Cambiato da fuori: si rilegge.
    writeFileSync(join(c, 'ap-d.json'), JSON.stringify({ ...ap(decisioni(7)), versione: VERSIONE_AUTOPILOTA }))
    expect(archivio.leggi('ap-d')!.decisioni).toHaveLength(7)
    archivio.elimina('ap-d')
    expect(archivio.leggi('ap-d')).toBeUndefined()
  })

  it('la coda presa dal disco regge un diario accorciato a turno in corso', () => {
    // Il turno parte con 600 decisioni; intanto l'archivio ne sposta 101 nel jsonl.
    const inizio = { ...ap(decisioni(600)), decisioniArchiviate: 0 }
    const mie = decisioni(2, 5000)
    const giaSalvata = mie[0]!
    const calcolato = { ...inizio, decisioni: [...inizio.decisioni, ...mie] }
    const disco = { ...ap([...decisioni(600).slice(101), decisioni(1, 700)[0]!, giaSalvata]), decisioniArchiviate: 101 }
    const fuso = codaDalDisco(calcolato, disco, 'c-1', [], inizio.decisioni.length)
    expect(fuso.decisioni.filter((d) => d.cosa === giaSalvata.cosa)).toHaveLength(1)
    expect(fuso.decisioni[fuso.decisioni.length - 1]!.cosa).toBe(mie[1]!.cosa)
  })
})

describe('5. le impronte del codice con git asincrono', () => {
  it('HEAD sempre, il diff ricordato per 5 s a parità di HEAD', async () => {
    let head = 'a'.repeat(40)
    let t = ORA
    const chiamate: string[] = []
    const git: GitAsincrono = async (args) => {
      chiamate.push(args[0]!)
      if (args[0] === 'rev-parse') return { codice: 0, uscita: head }
      return { codice: 0, uscita: '' }
    }
    expect(await improntaCodiceAsincrona(git, 'C:/p', () => t)).toBe(head)
    expect(await improntaCodiceAsincrona(git, 'C:/p', () => t)).toBe(head)
    expect(chiamate.filter((c) => c === 'diff')).toHaveLength(1)
    head = 'b'.repeat(40)
    expect(await improntaCodiceAsincrona(git, 'C:/p', () => t)).toBe(head)
    expect(chiamate.filter((c) => c === 'diff')).toHaveLength(2)
    t += IMPRONTA_VALE_MS
    await improntaCodiceAsincrona(git, 'C:/p', () => t)
    expect(chiamate.filter((c) => c === 'diff')).toHaveLength(3)
    expect(await improntaCodiceAsincrona(async () => ({ codice: 128, uscita: 'fatal' }), 'C:/p')).toBeUndefined()
  })
})

describe('il servizio: due chat, una suite alla volta', () => {
  let server: ServerAutopiloti | undefined
  afterEach(() => { server?.close(); server = undefined })

  it('la seconda chat che lancia la suite riceve «riprova fra N minuti», e non va nel diario', async () => {
    const archivio: Archivio = apriArchivio(mkdtempSync(join(tmpdir(), 'ap-turni-')))
    const turni = creaTurni()
    server = creaServer({
      archivio,
      esegui: () => Promise.resolve({ codice: 0, uscita: '' }),
      interroga: () => Promise.resolve({ testo: '{}' }),
      avviaLavoro: () => Promise.resolve(),
      fermaLavoro: () => {},
      avvisa: () => Promise.resolve(),
      domande: creaRegistroDomande({ adesso: () => ORA }),
      scadenzaDomandaMs: 5000,
      scadenzaInterviataMs: 5000,
      adesso: () => new Date(ORA).toISOString(),
      turni
    })
    const s: Server = server
    const porta = await new Promise<number>((ris) => { s.listen(0, '127.0.0.1', () => { ris((s.address() as { port: number }).port) }) })
    const chats = ['c-1', 'c-2'].map((id) => ({ id, compito: id, stato: 'lavoro' as const, cicli: 1 }))
    archivio.scrivi({ ...nuovoAutopilota({ id: 'ap-a', nome: 'a', obiettivo: 'o', cwd: 'C:\\Progetti\\Esempio', criteri: [], iniziatoIl: new Date(ORA).toISOString() }), stato: 'lavoro', chats })
    const chiama = async (chat: string, command: string): Promise<any> => (await fetch(`http://127.0.0.1:${porta}/hook/pretool?ap=ap-a&chat=${chat}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tool_name: 'Bash', tool_input: { command }, cwd: 'C:\\Progetti\\Esempio' }) })).json()
    expect(await chiama('c-1', 'npx vitest run')).toEqual({})
    const no = await chiama('c-2', 'npx tsc --noEmit')
    expect(no.hookSpecificOutput).toMatchObject({ permissionDecision: 'deny' })
    expect(no.hookSpecificOutput.permissionDecisionReason).toMatch(/un comando pesante è già in corso.*riprova fra \d+ minut/)
    expect(archivio.leggi('ap-a')!.decisioni.some((d) => d.cosa.includes('già in corso'))).toBe(false)
    expect(await chiama('c-2', 'npx vitest run tests/uno.test.ts')).toEqual({})
    turni.rilascia('ap-a::c-1')
  })
})
