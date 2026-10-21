import { describe, it, expect, afterEach, vi } from 'vitest'
import { mkdtempSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { creaServer, type ServerAutopiloti } from '../../src/autopilot-host/server'
import { apriArchivio, type Archivio } from '../../src/autopilot-host/archivio'
import { creaRegistroDomande } from '../../src/autopilot-host/domande'
import { apriMemoria } from '../../src/autopilot-host/memoria'
import { apriQuaderno } from '../../src/main/quaderno-store'
import { corpoStorico, fileStorico, voceDi, vociStorico } from '../../src/autopilot-host/storico'
import { nuovoAutopilota, parseAutopilota, VERSIONE_AUTOPILOTA, type Autopilota, type Decisione } from '@shared/autopilota'

/**
 * Lo storico nel quaderno (0.84.0): dal diario dell'autopilota solo le cose
 * che contano — chat aperte, consegne, unioni, chiusure, release, decisioni di
 * Nicholas — in italiano piano, una volta sola, in
 * `.sierradeck/quaderno/storico-<lavoro>.md`. Le righe del diario sono quelle
 * vere che il servizio scrive (server.ts), con nomi e rami d'esempio.
 */

const d = (quando: string, cosa: string): Decisione => ({ quando, cosa })

const DIARIO: Decisione[] = [
  d('2026-10-21T08:00:00.000Z', 'divido il lavoro in 2 compiti: Codice «la casella in basso» · Revisione «rileggi»'),
  d('2026-10-21T08:01:00.000Z', 'apro la chat c-1 (Codice) (ramo ap/x/c-1): la casella per scrivere sempre in basso'),
  d('2026-10-21T08:02:00.000Z', 'proseguito: la chat lavora'),
  d('2026-10-21T08:03:00.000Z', 'supervisore → prosegui: va bene così'),
  d('2026-10-21T08:30:00.000Z', 'c-1 ha finito il suo compito: il ramo ap/x/c-1 passa alla Revisione prima di essere unito'),
  d('2026-10-21T08:40:00.000Z', 'Revisione c-2: da rifare per c-1 — manca il test della tastiera'),
  d('2026-10-21T09:00:00.000Z', 'unito il ramo ap/x/c-1 in main'),
  d('2026-10-21T09:01:00.000Z', 'chiudo la chat c-1: il suo pezzo è fatto'),
  d('2026-10-21T09:02:00.000Z', 'chiudo la chat c-1: il suo pezzo è fatto'),
  d('2026-10-21T09:05:00.000Z', 'pubblicazione: hai detto sì (sì, pubblica)'),
  d('2026-10-21T09:05:30.000Z', 'pubblicazione: hai detto sì (sì, pubblica)'),
  d('2026-10-21T09:06:00.000Z', 'pubblico secondo la regola del progetto'),
  d('2026-10-21T09:10:00.000Z', 'risposta dell utente (modale): usa la chiave nuova'),
  d('2026-10-21T09:20:00.000Z', 'ripreso su tua richiesta («Riprendi»): era fermo (limiti del piano)'),
  d('2026-10-21T09:30:00.000Z', 'nuovo compito in coda: la pagina del telefono con le stesse quattro voci')
]

function lavoro(decisioni: Decisione[] = DIARIO, cwd = 'C:\\progetto'): Autopilota {
  return {
    ...nuovoAutopilota({
      id: 'ap-f1e6a2b3',
      nome: 'App Android: analisi e correzioni',
      obiettivo: 'Ristrutturare l’app Android',
      cwd,
      criteri: [{ descrizione: 'test verdi', comando: 'npm test', soddisfatto: false }],
      iniziatoIl: '2026-10-21T07:00:00.000Z'
    }),
    decisioni
  }
}

describe('le voci dello storico', () => {
  it('sceglie le sei cose che contano e lascia fuori i giri tecnici', () => {
    const voci = vociStorico(lavoro())
    const tipi = voci.map((v) => v.tipo)
    expect(tipi).toEqual(['consegna', 'chat', 'consegna', 'consegna', 'unione', 'chiusura', 'decisione', 'release', 'decisione', 'decisione', 'consegna'])
    expect(voci.map((v) => v.testo).join('\n')).not.toMatch(/proseguito|supervisore →/)
  })

  it('in italiano piano: la riga tecnica diventa una frase', () => {
    expect(voceDi(d('x', 'apro la chat c-1 (Codice) (ramo ap/x/c-1): la casella in basso'))).toMatchObject({ tipo: 'chat', testo: 'Aperta la chat c-1 (Codice): la casella in basso' })
    expect(voceDi(d('x', 'unito il ramo ap/x/c-1 in main'))?.testo).toBe('Unito il ramo ap/x/c-1 in main')
    expect(voceDi(d('x', 'risposta dell utente (modale): usa la chiave nuova'))?.testo).toBe('Ha risposto: «usa la chiave nuova»')
    expect(voceDi(d('x', 'non pubblico: hai risposto «aspetta domani»'))).toMatchObject({ tipo: 'decisione', testo: 'Niente pubblicazione: «aspetta domani»' })
    expect(voceDi(d('x', 'chiudo la chat c-3 da sola: finita e ferma al prompt, il suo posto si libera (la conversazione resta)'))?.tipo).toBe('chiusura')
    expect(voceDi(d('x', 'Revisione c-2: OK per c-1 (ap/x/c-1), unito in main. Tutto a posto'))).toMatchObject({ tipo: 'unione', testo: 'La Revisione approva c-1 (ap/x/c-1): unito in main' })
    expect(voceDi(d('x', 'il servizio è ripartito con 2 messaggi ancora in viaggio verso la chat: li rimetto in coda'))).toBeUndefined()
  })

  it('senza doppioni: la stessa cosa detta due volte resta una volta, alla prima', () => {
    const voci = vociStorico(lavoro())
    expect(voci.filter((v) => v.testo === 'Chiusa la chat c-1: il suo pezzo è fatto')).toHaveLength(1)
    const si = voci.filter((v) => v.testo.startsWith('Sì alla pubblicazione'))
    expect(si).toHaveLength(1)
    expect(si[0]!.quando).toBe('2026-10-21T09:05:00.000Z')
  })

  it('niente nome dell’utente nei percorsi', () => {
    const v = voceDi(d('x', 'nuovo compito in coda: controlla C:\\Users\\mario\\Documents\\x'))
    expect(v?.testo).toBe('Nuovo compito: controlla ~\\Documents\\x')
  })
})

describe('la scheda dello storico', () => {
  it('un file per lavoro: storico-<nome>-<id corto>.md', () => {
    expect(fileStorico(lavoro())).toBe('storico-app-android-analisi-e-correzioni-f1e6a2b3.md')
    expect(fileStorico({ id: 'ap-1', nome: '', obiettivo: '' })).toBe('storico-lavoro-1.md')
  })

  it('giorno per giorno, ogni riga con l’ora e il tipo in parole', () => {
    const corpo = corpoStorico(lavoro())
    expect(corpo).toContain('**Obiettivo:** Ristrutturare l’app Android')
    expect(corpo).toMatch(/^## \d\d\/\d\d\/2026$/m)
    expect(corpo).toMatch(/^- \d\d:\d\d · \*\*Unione\*\* — Unito il ramo ap\/x\/c-1 in main$/m)
    expect(corpo).toContain('**Decisione di Nicholas** — Sì alla pubblicazione: «sì, pubblica»')
    expect(corpo).toContain('**Release** — Pubblicazione avviata secondo la regola del progetto')
  })

  it('il nome del file resta nell’archivio (la pagina e l’app aprono lo storico con un tocco)', () => {
    const a = { ...lavoro(), storico: 'storico-app-f1e6a2b3.md', versione: VERSIONE_AUTOPILOTA }
    expect(parseAutopilota(JSON.parse(JSON.stringify(a)))?.autopilota?.storico).toBe('storico-app-f1e6a2b3.md')
    expect(parseAutopilota(JSON.parse(JSON.stringify({ ...a, storico: '../fuori.md' })))?.autopilota?.storico).toBeUndefined()
  })
})

let server: ServerAutopiloti | undefined
let porta: number
let archivio: Archivio

afterEach(() => { server?.close(); server = undefined; vi.restoreAllMocks() })

async function avvia(quaderno: (cwd: string, s: { titolo: string; corpo: string; tag?: string[]; file?: string }) => void): Promise<void> {
  archivio = apriArchivio(mkdtempSync(join(tmpdir(), 'ap-storico-')))
  const s = creaServer({
    archivio,
    memoria: apriMemoria(mkdtempSync(join(tmpdir(), 'ap-storico-mem-'))),
    versione: '0.84.0',
    esegui: () => Promise.resolve({ codice: 0, uscita: 'ok' }),
    interroga: () => Promise.resolve({ testo: JSON.stringify({ azione: 'prosegui', messaggio: 'vai avanti' }) }),
    avviaLavoro: () => Promise.resolve(),
    fermaLavoro: () => {},
    avvisa: () => Promise.resolve(),
    domande: creaRegistroDomande({ adesso: () => Date.now() }),
    ultimoDetto: () => '',
    scadenzaDomandaMs: 5000,
    scadenzaInterviataMs: 5000,
    adesso: () => new Date().toISOString(),
    quaderno
  })
  server = s
  await new Promise<void>((ris) => s.listen(0, '127.0.0.1', () => { porta = (s.address() as { port: number }).port; ris() }))
}

describe('l’autopilota tiene lo storico nel quaderno', () => {
  it('a ogni voce nuova riscrive la sua scheda; senza voci nuove non la tocca', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'info').mockImplementation(() => {})
    const cartella = mkdtempSync(join(tmpdir(), 'ap-storico-cwd-'))
    const q = apriQuaderno()
    const scritte: { file?: string; corpo: string }[] = []
    await avvia((cwd, s) => { scritte.push(s); q.scrivi(cwd, s) })
    archivio.scrivi({ ...lavoro(DIARIO.slice(0, 2), cartella), stato: 'sospeso', motivoSospensione: 'fermato dall utente' })

    const r = await fetch(`http://127.0.0.1:${porta}/autopiloti/ap-f1e6a2b3/riprendi`, { method: 'POST' })
    expect(r.ok).toBe(true)
    for (let i = 0; i < 80 && !scritte.some((x) => x.corpo.includes('Riprendi')); i += 1) await new Promise((ok) => setTimeout(ok, 25))

    const file = 'storico-app-android-analisi-e-correzioni-f1e6a2b3.md'
    expect(scritte.length).toBeGreaterThanOrEqual(1)
    expect(scritte.every((s) => s.file === file)).toBe(true)
    const su = readFileSync(join(cartella, '.sierradeck', 'quaderno', file), 'utf8')
    expect(su).toContain('titolo: "Storico — App Android: analisi e correzioni"')
    expect(su).toContain('Aperta la chat c-1 (Codice)')
    expect(su).toContain('**Decisione di Nicholas** — Ha ripreso il lavoro con «Riprendi»')
    // Il nome del file sta nell'archivio: pagina e app aprono lo storico da lì.
    expect(archivio.leggi('ap-f1e6a2b3')?.storico).toBe(file)
    // Una sola riscrittura per voce: i salvataggi senza voci nuove non toccano il file.
    const voci = vociStorico(archivio.leggi('ap-f1e6a2b3')!).length
    expect(scritte.length).toBeLessThanOrEqual(voci)
  })
})
