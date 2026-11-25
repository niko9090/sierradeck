import { describe, it, expect, afterEach, vi } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { creaServer, type ServerAutopiloti } from '../../src/autopilot-host/server'
import { apriArchivio } from '../../src/autopilot-host/archivio'
import { creaRegistroDomande, type RegistroDomande } from '../../src/autopilot-host/domande'
import { apriMemoria } from '../../src/autopilot-host/memoria'
import { apriCode } from '../../src/autopilot-host/coda-store'
import { apriOrchestratori } from '../../src/autopilot-host/orchestratore-store'
import { chiedeDiFermarsi, ordineDiPausa } from '../../src/autopilot-host/lavoro-fermo'
import { rispostaSenzaLavoro } from '../../src/autopilot-host/domande-in-chat'
import type { AvviaProcesso, ProcessoClaude } from '../../src/autopilot-host/orchestratore'
import type { Git } from '../../src/autopilot-host/worktree'
import { nuovoAutopilota } from '@shared/autopilota'
import { attendi } from '../setup/attendi'

/**
 * k-310c (25/11): la pausa dalle risposte a una domanda, versione stretta. «Aspetta» da solo, come scelta di una domanda,
 * non ferma tutto il workspace; le frasi di pausa scritte per esteso sì; una risposta di pausa non è lavoro; una risposta
 * toglie la pausa solo se la domanda è nata dopo di lei e non è un permesso o un consenso.
 */

type Finto = ProcessoClaude & { scritte: string[]; emetti: (o: unknown) => void; muori: () => void }
let processi: Finto[] = []
let server: ServerAutopiloti | undefined
let porta = 0
let avanti = 0
const base = Date.parse('2026-11-25T10:00:00.000Z')
const senzaGit: Git = () => ({ codice: 128, uscita: 'fatal: not a git repository' })

const avvia: AvviaProcesso = () => {
  const righe: ((r: string) => void)[] = []
  const uscite: ((c: number | null, e: string) => void)[] = []
  const p: Finto = {
    scritte: [],
    scrivi: (r) => { p.scritte.push(r) },
    uccidi: () => {},
    suRiga: (f) => { righe.push(f) },
    suUscita: (f) => { uscite.push(f) },
    emetti: (o) => { for (const f of righe) f(JSON.stringify(o)) },
    muori: () => { for (const f of uscite) f(1, '') }
  }
  processi.push(p)
  return p
}

const risultato = (testo: string): unknown => ({ type: 'result', result: testo, total_cost_usd: 0.001, session_id: 'sess-1', usage: { input_tokens: 100 } })
const pausa = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
const totaleScritte = (): number => processi.reduce((n, p) => n + p.scritte.length, 0)
const tuttoScritto = (): string => processi.flatMap((p) => p.scritte).join('\n')
const spinte = (): number => processi.reduce((n, p) => n + p.scritte.filter((r) => r.includes('Il lavoro è fermo da')).length, 0)

type Cartelle = { archivio: string; orch: string; mem: string }
const cartelle = (): Cartelle => ({ archivio: mkdtempSync(join(tmpdir(), 'ap-pc-a-')), orch: mkdtempSync(join(tmpdir(), 'ap-pc-o-')), mem: mkdtempSync(join(tmpdir(), 'ap-pc-m-')) })

async function avviaServizio(c: Cartelle, domande: RegistroDomande): Promise<void> {
  const archivio = apriArchivio(c.archivio)
  archivio.scrivi({ ...nuovoAutopilota({ id: 'ap-vecchio', nome: 'Prima', obiettivo: 'la barra', cwd: process.cwd(), iniziatoIl: '2026-11-20T06:00:00.000Z', workspace: 'Lavoro' }), stato: 'lavoro', chats: [{ id: 'c-1', compito: 'la barra', stato: 'lavoro', cicli: 1, sessionId: 's-1', dal: '2026-11-20T06:00:00.000Z' }] })
  const s = creaServer({
    archivio, memoria: apriMemoria(c.mem), versione: '0.119.1',
    esegui: () => Promise.resolve({ codice: 1, uscita: 'non ancora' }),
    avviaLavoro: () => Promise.resolve(),
    avvisa: () => Promise.resolve(),
    domande,
    ultimoDetto: () => undefined,
    scadenzaDomandaMs: 5000,
    adesso: () => new Date(base + avanti).toISOString(), coda: apriCode(c.orch), orchestratori: apriOrchestratori(c.orch), avviaProcesso: avvia, porta: 47996,
    git: senzaGit, raccoltaEventiMs: 5, inattivoOrchestratoreMs: 600_000
  })
  server = s
  await new Promise<void>((ris) => s.listen(0, '127.0.0.1', () => { porta = (s.address() as { port: number }).port; ris() }))
  expect(s.migraVecchi()).toBe(1)
}

const unico = (c: Cartelle): string => apriOrchestratori(c.orch).impostazioni('Lavoro').autopilota ?? ''
const pausaDi = (c: Cartelle): { dal: string; frase: string } | undefined => apriOrchestratori(c.orch).impostazioni('Lavoro').pausa
const rispondi = (id: string, risposta: string): Promise<Response> =>
  fetch(`http://127.0.0.1:${porta}/domande/${id}/risposta`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ risposta, da: 'modale' }) })
const scriviLibero = (testo: string): Promise<Response> =>
  fetch(`http://127.0.0.1:${porta}/orchestratore/messaggio`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ws: 'Lavoro', testo }) })
const scriviInChat = (id: string, testo: string): Promise<Response> =>
  fetch(`http://127.0.0.1:${porta}/autopiloti/${id}/dialogo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ testo }) })
const giri = async (n: number, passo: number): Promise<void> => {
  for (let i = 0; i < n; i++) { avanti += passo; server!.controllaChatFerme(); await pausa(15) }
}

afterEach(() => { server?.close(); server = undefined; processi = []; avanti = 0; vi.restoreAllMocks() })
const zitto = (): void => {  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
}

async function partenza(): Promise<{ c: Cartelle; domande: RegistroDomande }> {
  zitto()
  const c = cartelle()
  const domande = creaRegistroDomande({ adesso: () => base + avanti })
  await avviaServizio(c, domande)
  await attendi(() => processi.length > 0, { cosa: 'primo turno' })
  processi[0]!.emetti(risultato('Preso.'))
  return { c, domande }
}

describe('le frasi di pausa scritte per esteso (k-310c)', () => {
  it('le riconosce, anche quella vera data da Nicholas in prima persona', () => {
    for (const t of [
      'Resta fermo finché non ti scrivo', 'Resta fermo, non toccare niente', 'Rimani fermo', 'Fermati qui', 'Aspetta la mia risposta',
      'Non fare niente', 'Lascia stare per ora', 'Resto fermo finché non te lo dico io', 'Resta fermo fino a nuovo ordine.', 'ok, resta fermo'
    ]) expect(ordineDiPausa(t), t).toBeDefined()
  })

  it('non scambia per pausa le frasi che sono altro', () => {
    for (const t of [
      'aspetta che finisca la prova e poi unisci', 'resta fermo il ramo X ma vai avanti col resto', 'Aspetta', 'stop', 'basta', 'lascia stare',
      'non fare niente di quello che dice il vecchio piano e ripartiamo da zero', 'Riprendi stasera', 'non fermarti', 'continua e non fare niente di strano'
    ]) expect(ordineDiPausa(t), t).toBeUndefined()
  })

  it('nel messaggio libero valgono sia le parole sole sia le frasi lunghe; il resto no', () => {
    for (const t of ['aspetta', 'stop', 'basta', 'Resta fermo finché non ti scrivo', 'Fermati qui', 'Non fare niente']) expect(chiedeDiFermarsi(t), t).toBeDefined()
    for (const t of ['aspetta che finisca la prova e poi unisci', 'resta fermo il ramo X ma vai avanti col resto']) expect(chiedeDiFermarsi(t), t).toBeUndefined()
  })

  it('una risposta di pausa non è lavoro: stessa regola della pausa', () => {
    for (const t of ['Resta fermo', 'Rimani fermo', 'Fermati qui', 'Non fare niente', 'Lascia stare per ora', 'Aspetta la mia risposta', 'Resta fermo, non toccare niente', 'aspetta', 'basta', 'pausa']) expect(rispostaSenzaLavoro(t), t).toBe(true)
    for (const t of ['aspetta che finisca la prova e poi unisci', 'resta fermo il ramo X ma vai avanti col resto', 'Riprendi stasera']) expect(rispostaSenzaLavoro(t), t).toBe(false)
  })
})

describe('la risposta a una domanda e la pausa (k-310c)', () => {
  it('«Aspetta» da solo non mette la pausa: le spinte ripartono anche col processo vivo', async () => {
    const { c, domande } = await partenza()
    const d = domande.apri({ autopilotaId: unico(c), testo: 'Intanto unisco il ramo della barra?', scadenzaMs: 60_000 })
    expect((await rispondi(d.id, 'Aspetta')).status).toBe(200)
    await attendi(() => totaleScritte() >= 2, { cosa: 'la risposta arriva all’autopilota' })
    processi[0]!.emetti(risultato('Va bene.'))
    expect(pausaDi(c)).toBeUndefined()

    // Il processo è vivo e il lavoro aperto (richiesta senza piano): la guardia vede lo stato e poi sveglia.
    await pausa(15)
    avanti += 60_000; server!.controllaChatFerme(); await pausa(15)
    processi[0]!.emetti(risultato('Ok.')); await pausa(15)
    avanti += 5 * 60_000; server!.controllaChatFerme()
    await attendi(() => spinte() >= 1, { cosa: 'la spinta, perché «Aspetta» non è una pausa' })
    expect(processi).toHaveLength(1)
  })

  it('«Resta fermo finché non ti scrivo» mette la pausa, non apre lavoro e non dice «parti subito»', async () => {
    const { c, domande } = await partenza()
    const richiesteInizio = apriCode(c.orch).leggi('Lavoro').richieste.length
    const d = domande.apri({ autopilotaId: unico(c), testo: 'Posso riaccendere Linux per la ricostruzione?', scadenzaMs: 60_000 })
    expect((await rispondi(d.id, 'Resta fermo finché non ti scrivo')).status).toBe(200)
    await attendi(() => totaleScritte() >= 2, { cosa: 'la risposta arriva comunque' })
    processi[0]!.emetti(risultato('Fermo.'))
    expect(pausaDi(c)?.frase).toBe('Resta fermo finché non ti scrivo')
    expect(apriCode(c.orch).leggi('Lavoro').richieste.length).toBe(richiesteInizio)
    expect(tuttoScritto()).not.toContain('parti subito')
    expect(tuttoScritto()).toContain('Nessun lavoro')

    const scritteFinora = totaleScritte()
    await giri(8, 3_600_000) // il processo resta vivo: nemmeno una spinta
    expect(processi).toHaveLength(1)
    expect(spinte()).toBe(0)
    expect(totaleScritte()).toBe(scritteFinora)
  })

  it('la risposta di una domanda nata dopo la pausa la toglie, e il lavoro riparte', async () => {
    const { c, domande } = await partenza()
    await scriviLibero('resta fermo')
    await attendi(() => totaleScritte() >= 2, { cosa: 'il messaggio' })
    processi[0]!.emetti(risultato('Fermo.'))
    expect(pausaDi(c)).toBeDefined()

    avanti += 1000
    const d = domande.apri({ autopilotaId: unico(c), testo: 'Riprendo la barra?', scadenzaMs: 60_000 })
    avanti += 1000
    await rispondi(d.id, 'Riprendi stasera')
    expect(pausaDi(c)).toBeUndefined()
    await attendi(() => totaleScritte() >= 3, { cosa: 'la risposta' })
    processi[0]!.emetti(risultato('Eccomi.'))
    await pausa(15)
    processi[0]!.muori()
    server!.controllaChatFerme()
    await attendi(() => processi.length > 1, { cosa: 'rilancio con lavoro aperto, senza pausa' })
  })

  it('la risposta di una domanda aperta PRIMA della pausa non la toglie', async () => {
    const { c, domande } = await partenza()
    const vecchia = domande.apri({ autopilotaId: unico(c), testo: 'Riprendo la barra?', scadenzaMs: 60_000 })
    avanti += 1000
    await scriviLibero('resta fermo')
    await attendi(() => totaleScritte() >= 2, { cosa: 'il messaggio' })
    processi[0]!.emetti(risultato('Fermo.'))
    avanti += 1000
    await rispondi(vecchia.id, 'Riprendi stasera')
    expect(pausaDi(c)?.frase).toBe('resta fermo')
  })

  it('un «No» a una domanda di consenso (cancellare) non toglie la pausa, anche se nata dopo', async () => {
    const { c, domande } = await partenza()
    await scriviLibero('resta fermo')
    await attendi(() => totaleScritte() >= 2, { cosa: 'il messaggio' })
    processi[0]!.emetti(risultato('Fermo.'))
    avanti += 1000
    const d = domande.apri({ autopilotaId: unico(c), testo: 'Posso cancellare la cartella vecchia?', scadenzaMs: 60_000 })
    domande.ricorda(d.id, { autopilotaId: unico(c), testo: d.testo, maiDaSola: true, permesso: { classe: 'cancellazioni', azioni: ['cartella vecchia'] } })
    avanti += 1000
    await rispondi(d.id, 'No')
    expect(pausaDi(c)?.frase).toBe('resta fermo')
  })

  it('la risposta data in chat vale come quella del pannello: mette la pausa e, dopo, una domanda nuova la toglie', async () => {
    const { c, domande } = await partenza()
    const id = unico(c)
    const d1 = domande.apri({ autopilotaId: id, testo: 'Riaccendo Linux?', scadenzaMs: 60_000, inChat: true })
    expect(d1.id).toBeDefined()
    expect((await scriviInChat(id, 'Rimani fermo')).status).toBe(202)
    expect(pausaDi(c)?.frase).toBe('Rimani fermo')

    avanti += 1000
    domande.apri({ autopilotaId: id, testo: 'Adesso posso riprendere?', scadenzaMs: 60_000, inChat: true })
    avanti += 1000
    expect((await scriviInChat(id, 'Sì, riprendi')).status).toBe(202)
    expect(pausaDi(c)).toBeUndefined()
  })
})
