import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apriSincronia } from '../../src/main/cassaforte/sincronia'
import { magazzinoInMemoria, type Magazzino } from '../../src/main/cassaforte/magazzino'
import { archivioInMemoria, type Archivio } from '../../src/main/cassaforte/archivio'
import { creaLavoro } from '../../src/main/cassaforte/lavoro-in-corso'
import { TempoScadutoDrive } from '../../src/main/risorse'
import { nomeConsegna } from '../../src/renderer/consegne-autopilota'

/**
 * 23/11: tre avvisi nello stesso minuto, «salvataggio non riuscito (This
 * operation was aborted)», «SALVA fallito: This operation was aborted» e
 * «consegna : non partita». Il salvataggio era stato annullato di proposito
 * (chi installa un aggiornamento annulla il lavoro con il Drive) e la richiesta
 * in volo moriva con l'errore standard di `AbortController`: contato come guasto.
 */
function interruzione(): DOMException {
  return new DOMException('This operation was aborted', 'AbortError')
}

describe('salvataggio interrotto (23/11)', () => {
  let radice = ''
  let dati = ''
  let claude = ''
  let righe: string[] = []
  beforeEach(() => {
    radice = mkdtempSync(join(tmpdir(), 'sd-interrotto-'))
    dati = join(radice, 'dati')
    claude = join(radice, 'claude')
    mkdirSync(dati, { recursive: true })
    mkdirSync(join(claude, 'projects', 'progetto'), { recursive: true })
    writeFileSync(join(dati, 'workspaces.json'), '{"a":1}', 'utf8')
    writeFileSync(join(claude, 'projects', 'progetto', 'sessione.jsonl'), '{"riga":1}\n', 'utf8')
    righe = []
  })
  afterEach(() => { rmSync(radice, { recursive: true, force: true }) })

  /** Un Drive in memoria il cui primo `info` armato fa quello che si chiede. */
  function conGuasto(): { archivio: Archivio; arma: (cosa: () => void, volte?: number) => void } {
    const base = archivioInMemoria()
    let cosa: (() => void) | undefined
    let volte = 0
    const archivio: Archivio = {
      ...base,
      info: async (nome: string) => {
        if (cosa !== undefined && volte > 0) { volte -= 1; cosa() }
        return base.info?.(nome)
      }
    }
    return { archivio, arma: (c, v = 1) => { cosa = c; volte = v } }
  }

  async function apriPronta(archivio: Archivio) {
    const lavoro = creaLavoro()
    const mag = new Map<string, Magazzino>()
    const sync = apriSincronia({
      dati, radiceClaude: claude,
      driveConnesso: () => true,
      magazzino: (nome = 'sierradeck.cassaforte') => {
        let m = mag.get(nome)
        if (m === undefined) { m = magazzinoInMemoria(); mag.set(nome, m) }
        return m
      },
      archivio: () => archivio,
      lavoro,
      log: (m) => { righe.push(m) }
    })
    expect((await sync.creaPassphrase('passphrase-di-prova-1')).ok).toBe(true)
    sync.auto(true)
    righe = []
    return { sync, lavoro }
  }

  it('un salvataggio annullato mentre la richiesta è in volo non è un fallimento', async () => {
    const g = conGuasto()
    const { sync, lavoro } = await apriPronta(g.archivio)
    g.arma(() => { lavoro.annulla(); throw interruzione() })

    const r = await sync.salva()
    expect(r.ok).toBe(true)
    expect(r.annullato).toBe(true)
    expect(righe.join('\n')).not.toMatch(/SALVA fallito/)
    expect(righe.join('\n')).toMatch(/SALVA annullato/)
  })

  it('il giro automatico interrotto non scrive «non riuscito» e non parte con l’arrivo', async () => {
    const g = conGuasto()
    const { sync, lavoro } = await apriPronta(g.archivio)
    g.arma(() => { lavoro.annulla(); throw interruzione() })

    await sync.salvaSeServe()
    const testo = righe.join('\n')
    expect(testo).not.toMatch(/non riuscito/)
    expect(testo).not.toMatch(/fallito/)
    expect(testo).not.toMatch(/arrivo/i)
  })

  it('un\'interruzione che nessuno ha chiesto resta un errore vero', async () => {
    const g = conGuasto()
    const { sync } = await apriPronta(g.archivio)
    g.arma(() => { throw interruzione() })

    const r = await sync.salva()
    expect(r.ok).toBe(false)
    expect(righe.join('\n')).toMatch(/SALVA fallito: This operation was aborted/)
  })

  it('un tempo scaduto si riprova una volta prima di dirlo', async () => {
    const g = conGuasto()
    const { sync } = await apriPronta(g.archivio)
    g.arma(() => { throw new TempoScadutoDrive(60_000) }, 1)

    await sync.salvaSeServe({ conArrivo: false })
    const testo = righe.join('\n')
    expect(testo).toMatch(/riprovo una volta/)
    expect(testo).not.toMatch(/salvataggio non riuscito/)
    expect(testo).toMatch(/SALVA ok/)
  })

  it('un tempo scaduto due volte di fila si dice, una sola volta', async () => {
    const g = conGuasto()
    const { sync } = await apriPronta(g.archivio)
    g.arma(() => { throw new TempoScadutoDrive(60_000) }, 2)

    await sync.salvaSeServe({ conArrivo: false })
    const testo = righe.join('\n')
    expect(testo.match(/salvataggio non riuscito/g)?.length).toBe(1)
  })

  it('il nome della consegna nel registro non è mai vuoto', () => {
    expect(nomeConsegna({ id: 'c-12' })).toBe('c-12')
    expect(nomeConsegna({ id: '' })).toBe('(ripresa)')
    expect(nomeConsegna({ id: '', titolo: 'Chat di prova' })).toBe('(ripresa, Chat di prova)')
    expect(nomeConsegna(undefined)).toBe('(ripresa)')
  })
})
