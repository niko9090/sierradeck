import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Server } from 'node:http'
import {
  ATTESA_IN_UN_HOOK_MS, ATTESA_MASSIMA_MS, CARICO_MASSIMO_MS, creaGuardiaPc, dentroUnHook, giudicaMisura,
  giudicaPesanteDellaChat, MEMORIA_LIBERA_MIN_A_LUNGO, PROCESSORE_PER_MS, RILASCIO_PER_MS, rendiTurnoDopoComando
} from '../../src/autopilot-host/guardia-pc'
import { creaTurni } from '../../src/autopilot-host/turni-criteri'
import { apriArchivio } from '../../src/autopilot-host/archivio'
import { creaServer, type ServerAutopiloti } from '../../src/autopilot-host/server'
import { unicoFinto } from '../setup/unico-finto'
import { creaRegistroDomande } from '../../src/autopilot-host/domande'
import { nuovoAutopilota } from '@shared/autopilota'
import type { MisuraPc } from '@shared/posti-chat'
import { TIMEOUT_HOOK_S } from '@shared/hook-autopilota'

/**
 * 0.86.1 — il turno dei pesanti e la guardia, dopo la revisione della 0.86.0:
 * il turno di una chat restava preso fino a 10 minuti dopo la fine del suo
 * comando; i criteri della sua stessa fermata aspettavano dietro di lei; una
 * chat che rinnovava il turno lasciava i criteri in fila per sempre; la
 * guardia restava «carico» fra il 60 e il 75%, e un criterio la aspettava
 * tenendo il turno, fino a un'ora, cioè fino a far scadere l'hook.
 */

const ORA = Date.parse('2026-10-30T20:00:00.000Z')
const pc = (caricoPercento: number, memoriaLiberaMb = 9_000, memoriaTotaleMb = 16_384): MisuraPc => ({ processori: 8, memoriaLiberaMb, memoriaTotaleMb, caricoPercento })
const bash = (command: string, extra: Record<string, unknown> = {}) => ({ tool_name: 'Bash', tool_input: { command, ...extra }, cwd: 'C:/p' })

describe('il turno di una chat torna libero quando il comando finisce', () => {
  it('PostToolUse di un pesante non in sottofondo della stessa chat: il turno si rende', () => {
    const turni = creaTurni()
    expect(giudicaPesanteDellaChat(bash('npx vitest run'), { chi: 'ap::c-1', cwd: 'C:/p', turni }).ok).toBe(true)
    // Un comando leggero finito insieme non rende niente; un'altra chat nemmeno.
    expect(rendiTurnoDopoComando(bash('git status'), { chi: 'ap::c-1', turni })).toBe(false)
    expect(rendiTurnoDopoComando(bash('npx vitest run'), { chi: 'ap::c-2', turni })).toBe(false)
    expect(turni.prenotato()?.chi).toBe('ap::c-1')
    expect(rendiTurnoDopoComando(bash('npx vitest run'), { chi: 'ap::c-1', turni })).toBe(true)
    expect(turni.prenotato()).toBeUndefined()
  })

  it('un comando lanciato in sottofondo tiene il turno anche dopo il suo PostToolUse (che arriva subito)', () => {
    const turni = creaTurni()
    expect(giudicaPesanteDellaChat(bash('gradle build', { run_in_background: true }), { chi: 'ap::c-1', cwd: 'C:/p', turni }).ok).toBe(true)
    expect(rendiTurnoDopoComando(bash('gradle build', { run_in_background: true }), { chi: 'ap::c-1', turni })).toBe(false)
    expect(turni.prenotato()).toMatchObject({ chi: 'ap::c-1', inSottofondo: true })
    turni.rilascia('ap::c-1')
  })

  it('con dei criteri in fila la chat che tiene il turno non lo rinnova', async () => {
    const turni = creaTurni()
    expect(turni.prenota('ap::c-1', 'C:/p', 60_000).ok).toBe(true)
    let partito = false
    const criterio = turni.pesante('C:/p', async () => { partito = true; return 0 })
    await new Promise((r) => setTimeout(r, 5))
    const no = turni.prenota('ap::c-1', 'C:/p', 60_000)
    expect(no).toMatchObject({ ok: false })
    if (!no.ok) expect(no.occupato).toMatch(/criteri dell'autopilota in fila/)
    turni.rilascia('ap::c-1')
    await criterio
    expect(partito).toBe(true)
    // Senza nessuno in fila, il rinnovo resta.
    expect(turni.prenota('ap::c-1', 'C:/p', 60_000).ok).toBe(true)
    expect(turni.prenota('ap::c-1', 'C:/p', 60_000).ok).toBe(true)
    turni.rilascia('ap::c-1')
  })
})

describe('il servizio: PostToolUse e Stop rendono il turno della chat', () => {
  let server: ServerAutopiloti | undefined
  afterEach(() => { server?.close(); server = undefined })

  const avvia = async (opz: { esegui?: (c: string, cwd: string) => Promise<{ codice: number; uscita: string }>; turni: ReturnType<typeof creaTurni> }): Promise<{ porta: number; archivio: ReturnType<typeof apriArchivio> }> => {
    const archivio = apriArchivio(mkdtempSync(join(tmpdir(), 'ap-turni-0861-')))
    server = creaServer({
      ...unicoFinto(archivio),
      archivio,
      esegui: opz.esegui ?? (() => Promise.resolve({ codice: 0, uscita: '' })),
      avviaLavoro: () => Promise.resolve(),
      avvisa: () => Promise.resolve(),
      domande: creaRegistroDomande({ adesso: () => ORA }),
      scadenzaDomandaMs: 5000,
      adesso: () => new Date().toISOString(),
      turni: opz.turni,
      // 11/11: chi trova il turno occupato aspetta nell'hook; qui al più 3 secondi, riguardando ogni 10 ms.
      attesaPesante: { tettoMs: 1_000, tettoTurnoMs: 3_000, riprovaMs: 10 }
    })
    const s: Server = server
    const porta = await new Promise<number>((ris) => { s.listen(0, '127.0.0.1', () => { ris((s.address() as { port: number }).port) }) })
    return { porta, archivio }
  }

  // 11/11: prima la seconda chat riceveva un «no» finché il turno era occupato. Adesso aspetta
  // nell'hook, e passa appena il PostToolUse della prima rende il turno.
  it('/hook/rapporto dopo la suite della chat: il turno è subito libero per un\'altra, che lo stava aspettando', async () => {
    const turni = creaTurni()
    const { porta, archivio } = await avvia({ turni })
    const chats = ['c-1', 'c-2'].map((id) => ({ id, compito: id, stato: 'lavoro' as const, cicli: 1 }))
    archivio.scrivi({ ...nuovoAutopilota({ id: 'ap-a', nome: 'a', obiettivo: 'o', cwd: 'C:\\Progetti\\Esempio', iniziatoIl: new Date(ORA).toISOString() }), stato: 'lavoro', chats })
    const pre = async (chat: string, command: string): Promise<any> => (await fetch(`http://127.0.0.1:${porta}/hook/pretool?ap=ap-a&chat=${chat}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(bash(command)) })).json()
    expect(await pre('c-1', 'npx vitest run')).toEqual({})
    let seconda: unknown
    const inizio = Date.now()
    const attesa = pre('c-2', 'npx tsc --noEmit').then((r) => { seconda = r })
    await new Promise((ris) => setTimeout(ris, 150))
    // Il turno è di c-1: c-2 aspetta, senza un sì e senza un no.
    expect(seconda).toBeUndefined()
    expect(turni.prenotato()?.chi).toBe('ap-a::c-1')
    await fetch(`http://127.0.0.1:${porta}/hook/rapporto?ap=ap-a&chat=c-1`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(bash('npx vitest run')) })
    await attesa
    expect(seconda).toEqual({})
    // Passata per il turno reso, non per il tetto dell'attesa.
    expect(Date.now() - inizio).toBeLessThan(2_000)
    expect(turni.prenotato()?.chi).toBe('ap-a::c-2')
    turni.rilascia('ap-a::c-2')
  })

  it('/hook/stop: il turno della chat si rende alla sua fermata', async () => {
    const turni = creaTurni()
    const { porta, archivio } = await avvia({ turni })
    archivio.scrivi({
      ...nuovoAutopilota({ id: 'ap-b', nome: 'b', obiettivo: 'o', cwd: 'C:\\Progetti\\Esempio', iniziatoIl: new Date(ORA).toISOString() }),
      stato: 'lavoro',
      chats: [{ id: 'c-1', compito: 'c', stato: 'lavoro' as const, cicli: 1 }]
    })
    // La chat tiene il turno per 10 minuti (un comando in sottofondo), poi si ferma.
    expect(turni.prenota('ap-b::c-1', 'C:\\Progetti\\Esempio', 10 * 60_000, true).ok).toBe(true)
    const r = await fetch(`http://127.0.0.1:${porta}/hook/stop?ap=ap-b&chat=c-1`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id: 's', last_assistant_message: 'lavoro in corso', stop_hook_active: false }), signal: AbortSignal.timeout(10_000) })
    expect(r.status).toBe(200)
    expect(turni.prenotato()).toBeUndefined()
  }, 20_000)
})

describe('la guardia: niente «carico» per sempre, niente attese oltre l\'hook', () => {
  it('carico da più di 10 minuti: si libera con un minuto sotto il 75% (prima, fra 60 e 75, mai)', () => {
    const carico = { carico: { motivo: 'x', risorsa: 'processore' as const, dal: ORA } }
    // Prima dei 10 minuti l'isteresi resta: il 70% non libera.
    let s = giudicaMisura(pc(70), carico, ORA + 5 * 60_000)
    s = giudicaMisura(pc(70), s, ORA + 5 * 60_000 + RILASCIO_PER_MS)
    expect(s.carico).toBeDefined()
    // Dopo i 10 minuti, il 70% per un minuto intero libera.
    s = giudicaMisura(pc(70), s, ORA + CARICO_MASSIMO_MS)
    expect(s.carico).toBeDefined()
    s = giudicaMisura(pc(70), s, ORA + CARICO_MASSIMO_MS + RILASCIO_PER_MS)
    expect(s.carico).toBeUndefined()
    // Sopra il 75% resta carico anche dopo i 10 minuti.
    expect(giudicaMisura(pc(80), carico, ORA + 2 * CARICO_MASSIMO_MS).carico).toBeDefined()
  })

  // 11/11: per la memoria non c'era nessuna uscita: sotto il 15% libero il PC restava «carico» per sempre.
  it('l’uscita anche per la memoria: dopo 10 minuti fra l’8 e il 15% libero il PC si libera, e non rientra subito; sotto l’8% resta carico', () => {
    const libera = (parte: number): MisuraPc => pc(10, Math.round(16_384 * parte), 16_384)
    let s = giudicaMisura(libera(0.12), {}, ORA)
    expect(s.carico?.risorsa).toBe('memoria')
    // Prima dei 10 minuti vale il 15%: resta carico.
    s = giudicaMisura(libera(0.12), s, ORA + 5 * 60_000)
    expect(s.carico?.risorsa).toBe('memoria')
    // Dopo 10 minuti conta l'8%: col processore basso, un minuto intero e si libera.
    s = giudicaMisura(libera(0.12), s, ORA + CARICO_MASSIMO_MS)
    expect(s.carico).toBeDefined()
    s = giudicaMisura(libera(0.12), s, ORA + CARICO_MASSIMO_MS + RILASCIO_PER_MS)
    expect(s).toEqual({ memoriaTollerata: true })
    // Non rientra alla misura dopo, con la stessa memoria.
    s = giudicaMisura(libera(0.12), s, ORA + CARICO_MASSIMO_MS + RILASCIO_PER_MS + 5_000)
    expect(s.carico).toBeUndefined()
    // Sotto l'8% sì: lì il PC è davvero al limite, anche da tollerato e anche dopo 10 minuti.
    expect(giudicaMisura(libera(0.05), s, ORA + CARICO_MASSIMO_MS + RILASCIO_PER_MS + 10_000).carico?.risorsa).toBe('memoria')
    let basso = giudicaMisura(libera(0.05), {}, ORA)
    basso = giudicaMisura(libera(0.05), basso, ORA + 2 * CARICO_MASSIMO_MS)
    expect(basso.carico?.risorsa).toBe('memoria')
    expect(MEMORIA_LIBERA_MIN_A_LUNGO).toBeLessThan(0.15)
    // Risalita sopra il 15% la tolleranza finisce: da lì vale di nuovo il 15%.
    const risalita = giudicaMisura(libera(0.5), { memoriaTollerata: true }, ORA)
    expect(risalita).toEqual({})
    expect(giudicaMisura(libera(0.12), risalita, ORA + 5_000).carico?.risorsa).toBe('memoria')
  })

  it('con la guardia vera: un PC al 70% dopo 10 minuti di carico torna libero', () => {
    let t = ORA
    let carico = 90
    const g = creaGuardiaPc({ misura: () => pc(carico), ora: () => t })
    g.valuta(); t += PROCESSORE_PER_MS
    expect(g.valuta()).toBeDefined()
    carico = 70
    for (let i = 0; i < 30; i += 1) { t += 30_000; g.valuta() }
    expect(g.valuta()).toBeUndefined()
  })

  // 11/11: fuori da un hook l'attesa massima è scesa da mezz'ora a due minuti (le unioni scadevano):
  // dentro un hook vale il più corto dei due tetti.
  it('dentro un hook un passo aspetta al più il tetto dell\'hook, ben sotto il suo timeout; fuori al più due minuti', async () => {
    expect(ATTESA_IN_UN_HOOK_MS).toBeLessThan(TIMEOUT_HOOK_S * 1000 / 2)
    expect(ATTESA_MASSIMA_MS).toBeLessThanOrEqual(2 * 60_000)
    let t = ORA
    const g = creaGuardiaPc({ misura: () => pc(10, 1_000, 16_384), ora: () => t, dormi: (ms) => { t += ms; return Promise.resolve() }, riprovaMs: 5_000 })
    await dentroUnHook(() => g.attendi('la suite'))
    expect(t - ORA).toBe(Math.min(ATTESA_IN_UN_HOOK_MS, ATTESA_MASSIMA_MS))
    const fuori = t
    await g.attendi('la suite')
    expect(t - fuori).toBe(ATTESA_MASSIMA_MS)
  })
})
