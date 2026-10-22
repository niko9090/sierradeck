import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { creaServer, type ServerAutopiloti } from '../../src/autopilot-host/server'
import { apriArchivio, type Archivio } from '../../src/autopilot-host/archivio'
import { creaRegistroDomande } from '../../src/autopilot-host/domande'
import type { Git } from '../../src/autopilot-host/worktree'
import { nuovoAutopilota, type Autopilota } from '@shared/autopilota'
import { conversazione } from '@shared/chat-autopilota'

/**
 * Dopo l'aggiornamento (0.84.3): la versione nuova manda al servizio le fasi
 * scritte dalla vecchia, e ogni autopilota fermato per l'aggiornamento trova
 * in conversazione una riga di riepilogo e riprende da solo.
 *
 * (Banco preso da nessuna-consegna-dopo-installa.test.ts.) Dopo «Installa» l'autopilota non dà nuove consegne (0.84.1). Prima la pausa
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

describe('dopo l’aggiornamento: ripresa automatica con una riga di riepilogo', () => {
  const aggiornamento = {
    daVersione: '0.84.2',
    aVersione: '0.84.3',
    fasi: [
      { passo: 'scarico', dal: '2026-10-22T08:40:00.000Z', fino: '2026-10-22T08:40:40.000Z' },
      { passo: 'salvo', dal: '2026-10-22T08:50:00.000Z', fino: '2026-10-22T08:55:00.000Z' },
      { passo: 'installo', dal: '2026-10-22T08:55:00.000Z', fino: '2026-10-22T08:58:00.000Z' },
      { passo: 'riparto', dal: '2026-10-22T08:58:00.000Z' }
    ],
    salvate: 2,
    provate: 2,
    interrotte: 0
  }

  it('l’autopilota fermato per l’aggiornamento riparte e lo dice nella sua conversazione', async () => {
    archivio.scrivi(autopilota())
    await posta('/pausa-aggiornamento')
    expect(archivio.leggi('ap-prova')?.fermatoPerAggiornamento).toBe(true)
    // La versione nuova è partita: «riparto» si chiude adesso (09:00).
    await posta('/gestore-avviato', { aggiornamento })
    await new Promise((r) => { setTimeout(r, 50) })
    expect(ripartite).toEqual(['ap-prova'])
    const a = archivio.leggi('ap-prova') as Autopilota
    expect(a.fermatoPerAggiornamento).toBeUndefined()
    const riga = a.dialogo.at(-1)
    expect(riga?.da).toBe('lui')
    expect(riga?.testo).toBe(
      'Aggiornato dalla 0.84.2 alla 0.84.3 in 10 min (scaricato prima, chat salvate in 5 min, installato in 3 min, ripartito in 2 min).' +
      ' Lavoro di 2 chat salvato sul loro ramo. Riprendo il lavoro da dove eravamo.'
    )
    // Si legge nella conversazione (la stessa di PC, pagina e app).
    expect(conversazione(a).some((b) => b.testo === riga?.testo)).toBe(true)
  })

  it('senza aggiornamento (un riavvio qualunque) nessuna riga', async () => {
    archivio.scrivi(autopilota())
    await posta('/pausa-aggiornamento')
    await posta('/gestore-avviato')
    await new Promise((r) => { setTimeout(r, 50) })
    expect(archivio.leggi('ap-prova')?.dialogo).toEqual([])
    expect(ripartite).toEqual(['ap-prova'])
  })

  it('un autopilota fermo da prima (sospeso da te) non riceve la riga e non riparte', async () => {
    archivio.scrivi(autopilota())
    archivio.scrivi(autopilota({ id: 'ap-fermo', stato: 'sospeso' }))
    await posta('/pausa-aggiornamento')
    await posta('/gestore-avviato', { aggiornamento })
    await new Promise((r) => { setTimeout(r, 50) })
    expect(archivio.leggi('ap-fermo')?.dialogo).toEqual([])
    expect(ripartite).toEqual(['ap-prova'])
  })
})
