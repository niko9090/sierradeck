import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { creaServer, type ServerAutopiloti } from '../../src/autopilot-host/server'
import { apriArchivio, type Archivio } from '../../src/autopilot-host/archivio'
import { creaRegistroDomande } from '../../src/autopilot-host/domande'
import type { Git } from '../../src/autopilot-host/worktree'
import { nuovoAutopilota, type Autopilota, type ChatGovernata } from '@shared/autopilota'

/**
 * Dopo «Installa» l'autopilota non dà nuove consegne (0.84.1). Prima la pausa
 * valeva solo per gli autopiloti «al lavoro» in quel momento e solo alla fine
 * del turno: un autopilota in pausa per i limiti ripartiva col freno, uno
 * appena ripreso riceveva il suo giro, e l'attesa della quiete ricominciava.
 * E «Aggiorna adesso» salva il lavoro di ogni chat con un commit sul suo ramo.
 */
let server: ServerAutopiloti
let porta: number
let archivio: Archivio
let ripartite: string[]
let commit: string[]
let orologio: number
const ora = (): string => new Date(orologio).toISOString()

/** Un git finto: ogni cartella è un worktree sul suo ramo `ap/…` con qualcosa da salvare. */
const git: Git = (args, cwd) => {
  if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return { codice: 0, uscita: cwd }
  if (args[0] === 'rev-parse' && args[1] === '--abbrev-ref') return { codice: 0, uscita: 'ap/ap-prova/c-1' }
  if (args[0] === 'config') return { codice: 0, uscita: 'Prova' }
  if (args[0] === 'diff') return { codice: 1, uscita: '' }
  if (args[0] === 'commit') { commit.push(`${cwd}|${args[args.indexOf('-m') + 1] ?? ''}`); return { codice: 0, uscita: '' } }
  return { codice: 0, uscita: '' }
}

function autopilota(over: Partial<Autopilota> = {}): Autopilota {
  return {
    ...nuovoAutopilota({
      id: 'ap-prova',
      nome: 'Prova',
      obiettivo: 'Fai passare i test',
      cwd: process.cwd(),
      criteri: [{ descrizione: 'test verdi', comando: 'npm test', soddisfatto: false }],
      iniziatoIl: '2026-10-22T01:00:00.000Z'
    }),
    stato: 'lavoro',
    cicli: 3,
    sessionId: 's-1',
    ...over
  }
}

async function posta(percorso: string, corpo?: unknown): Promise<unknown> {
  const r = await fetch(`http://127.0.0.1:${porta}${percorso}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    ...(corpo !== undefined ? { body: JSON.stringify(corpo) } : {})
  })
  const testo = await r.text()
  return testo === '' ? {} : JSON.parse(testo)
}

beforeEach(async () => {
  archivio = apriArchivio(mkdtempSync(join(tmpdir(), 'ap-installa-')))
  ripartite = []
  commit = []
  orologio = Date.parse('2026-10-22T09:00:00.000Z')
  server = creaServer({
    archivio,
    esegui: () => Promise.resolve({ codice: 0, uscita: 'ok' }),
    interroga: () => Promise.resolve({ testo: '{"azione": "prosegui", "istruzione": "vai avanti"}' }),
    avviaLavoro: (a) => { ripartite.push(a.id); return Promise.resolve() },
    fermaLavoro: () => {},
    avvisa: () => Promise.resolve(),
    domande: creaRegistroDomande({ adesso: () => Date.now() }),
    scadenzaDomandaMs: 5000,
    scadenzaInterviataMs: 5000,
    git,
    adesso: ora
  })
  await new Promise<void>((ris) => {
    server.listen(0, '127.0.0.1', () => {
      porta = (server.address() as { port: number }).port
      ris()
    })
  })
})

afterEach(() => { server.close() })

describe('dopo «Installa» nessuna consegna nuova', () => {
  it('un autopilota in pausa per i limiti non riparte finché si installa', async () => {
    archivio.scrivi(autopilota({ stato: 'sospeso', pausaLimitiFinoA: '2026-10-22T08:00:00.000Z' }))
    await posta('/pausa-aggiornamento')
    server.controllaChatFerme()
    await new Promise((r) => { setTimeout(r, 50) })
    expect(ripartite).toEqual([])
    expect(archivio.leggi('ap-prova')?.stato).toBe('sospeso')
  })

  it('un giro mandato mentre si installa non parte: l’autopilota resta segnato e riparte al ritorno del programma', async () => {
    archivio.scrivi(autopilota())
    await posta('/pausa-aggiornamento')
    // Una ripresa chiesta mentre si installa non manda giri e non toglie il segno.
    server.riprendiLavori()
    await new Promise((r) => { setTimeout(r, 50) })
    expect(ripartite).toEqual([])
    expect(archivio.leggi('ap-prova')?.fermatoPerAggiornamento).toBe(true)
    // Il programma è tornato (installato o no): si riprende da soli.
    await posta('/gestore-avviato')
    await new Promise((r) => { setTimeout(r, 50) })
    expect(ripartite).toEqual(['ap-prova'])
  })

  it('una chat che non era «al lavoro» al momento di «Installa» si ferma lo stesso a fine turno', async () => {
    await posta('/pausa-aggiornamento')
    // Rimesso al lavoro dopo il tasto (per esempio da una risposta): non segnato.
    archivio.scrivi(autopilota())
    const risposta = await posta('/hook/stop?ap=ap-prova', { session_id: 's-1', last_assistant_message: 'fatto' })
    expect(risposta).toEqual({})
    expect(archivio.leggi('ap-prova')?.fermatoPerAggiornamento).toBe(true)
  })

  it('tolta la pausa (installazione non partita) tutto torna come prima', async () => {
    archivio.scrivi(autopilota({ stato: 'sospeso', pausaLimitiFinoA: '2026-10-22T08:00:00.000Z' }))
    await posta('/pausa-aggiornamento')
    await posta('/pausa-aggiornamento', { attiva: false })
    server.controllaChatFerme()
    await new Promise((r) => { setTimeout(r, 50) })
    expect(ripartite).toEqual(['ap-prova'])
  })
})

describe('«Aggiorna adesso»: il lavoro di ogni chat salvato sul suo ramo', () => {
  it('un commit per copia, mai per le chat finite', async () => {
    const base = mkdtempSync(join(tmpdir(), 'ap-copie-'))
    const c1 = join(base, 'c-1')
    const c2 = join(base, 'c-2')
    mkdirSync(c1)
    mkdirSync(c2)
    const chat = (id: string, cartella: string, stato: ChatGovernata['stato'] = 'lavoro'): ChatGovernata => ({ id, compito: `compito ${id}`, stato, cicli: 1, cartella })
    archivio.scrivi(autopilota({ chats: [chat('c-1', c1), chat('c-2', c2, 'finita')] }))
    expect(await posta('/salva-per-aggiornamento')).toEqual({ salvate: 1, provate: 1 })
    expect(commit).toHaveLength(1)
    expect(commit[0]).toContain(c1)
    expect(commit[0]).toContain("salvato prima dell'aggiornamento")
  })
})
