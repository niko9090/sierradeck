import { describe, it, expect, afterEach, vi } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { creaServer, type ServerAutopiloti } from '../../src/autopilot-host/server'
import { apriArchivio, type Archivio } from '../../src/autopilot-host/archivio'
import { creaRegistroDomande } from '../../src/autopilot-host/domande'
import { creaConsegne } from '../../src/autopilot-host/consegne'
import { esecutoreNelMosaico, regoleDiConsegna } from '../../src/autopilot-host/nel-mosaico'
import { nuovoAutopilota, type Autopilota, type ChatGovernata } from '@shared/autopilota'
import { attendi } from '../setup/attendi'

/** P2 (30/10): le righe LEZIONI: a fine turno finiscono nel quaderno; l'indice entra nel primo messaggio. */

const ORA = Date.parse('2026-10-30T10:00:00.000Z')
const iso = (ms: number): string => new Date(ms).toISOString()

function autopilota(over: Partial<Autopilota> & { id: string; cwd: string }): Autopilota {
  return {
    ...nuovoAutopilota({ id: over.id, nome: over.id, obiettivo: 'o', cwd: over.cwd, criteri: [{ descrizione: 'i test passano', comando: 'npm test', soddisfatto: false }], iniziatoIl: iso(ORA - 3_600_000) }),
    stato: 'lavoro',
    ultimoEvento: iso(ORA),
    ...over
  }
}
const chat = (id: string, over: Partial<ChatGovernata> = {}): ChatGovernata => ({ id, compito: `compito ${id}`, stato: 'lavoro', cicli: 1, sessionId: `s-${id}`, ...over })

describe('le lezioni dal servizio', () => {
  let server: ServerAutopiloti | undefined
  let archivio: Archivio
  let porta = 0
  afterEach(() => { server?.close(); server = undefined; vi.restoreAllMocks() })

  it('a fine turno le righe LEZIONI: si annotano una volta, anche se la chat è già finita', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
    archivio = apriArchivio(mkdtempSync(join(tmpdir(), 'ap-lezioni-')))
    const cwd = mkdtempSync(join(tmpdir(), 'ap-lezioni-cwd-'))
    const annotate: { cwd: string; tag: string; testo: string }[] = []
    server = creaServer({
      archivio,
      esegui: () => Promise.resolve({ codice: 1, uscita: 'rosso' }),
      interroga: () => Promise.resolve({ testo: '{"azione": "prosegui", "istruzioni": "vai"}', sessionId: 'sup' }),
      avviaLavoro: () => Promise.resolve(),
      fermaLavoro: () => {},
      avvisa: () => Promise.resolve(),
      domande: creaRegistroDomande({ adesso: () => ORA }),
      scadenzaDomandaMs: 5000,
      scadenzaInterviataMs: 5000,
      adesso: () => iso(ORA),
      lezioni: (c, voci) => { for (const v of voci) annotate.push({ cwd: c, tag: v.tag ?? '', testo: v.testo }); return { nuove: voci.length, confermate: 0 } }
    })
    const s = server
    await new Promise<void>((ris) => { s.listen(0, '127.0.0.1', () => { porta = (s.address() as { port: number }).port; ris() }) })
    archivio.scrivi(autopilota({ id: 'ap-a', cwd, chats: [chat('c-1', { stato: 'finita' }), chat('c-2')] }))
    const testo = 'Fatto.\nRAPPORTO: finita — commit abc\nLEZIONI: [build] il build vuole la cartella dist pulita prima\nLEZIONI: i test di rete vanno nel progetto lenti'
    const stop = (): Promise<Response> => fetch(`http://127.0.0.1:${porta}/hook/stop?ap=ap-a&chat=c-1`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: 's-c-1', stop_hook_active: false, last_assistant_message: testo, hook_event_name: 'Stop', cwd })
    })
    await stop()
    await attendi(() => annotate.length === 2)
    expect(annotate).toEqual([
      { cwd, tag: 'build', testo: 'il build vuole la cartella dist pulita prima' },
      { cwd, tag: 'generale', testo: 'i test di rete vanno nel progetto lenti' }
    ])
    // La stessa fermata arrivata due volte: niente doppie.
    await stop()
    await new Promise((r) => setTimeout(r, 100))
    expect(annotate).toHaveLength(2)
  })
})

describe('le istruzioni della chat', () => {
  it('ogni chat riceve la regola delle LEZIONI', () => {
    const a = autopilota({ id: 'ap-a', cwd: 'C:\\progetto' })
    expect(regoleDiConsegna(a, chat('c-1')).join('\n')).toContain('LEZIONI:')
  })

  it('l’indice del quaderno entra solo nel primo messaggio di una conversazione nuova', async () => {
    const consegne = creaConsegne()
    let n = 0
    const chiesti: string[] = []
    const e = esecutoreNelMosaico({
      consegne,
      nuovaSessione: () => { n += 1; return `sessione-${n}` },
      ricorda: () => {},
      indiceQuaderno: (cwd) => { chiesti.push(cwd); return 'INDICE DEL QUADERNO' }
    })
    const a = autopilota({ id: 'ap-1', cwd: 'C:\\progetto' })
    await e.avvia(a)
    const [prima] = consegne.preleva()
    expect(prima?.testo).toContain('INDICE DEL QUADERNO')
    expect(chiesti).toEqual(['C:\\progetto'])
    // La stessa conversazione ripresa: l'indice l'ha già letto.
    await e.avvia({ ...a, sessionId: prima?.sessionId }, 'prosegui')
    const [seconda] = consegne.preleva()
    expect(seconda?.testo ?? '').not.toContain('INDICE DEL QUADERNO')
  })
})
