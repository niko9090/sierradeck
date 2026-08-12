import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { apriIstantaneeStore } from '../../src/main/istantanee-store'
import type { Istantanea } from '@shared/istantanea'

function dir(): string {
  return mkdtempSync(join(tmpdir(), 'istantanee-'))
}

function esempio(over: Partial<Istantanea> = {}): Istantanea {
  return {
    nome: 'Lavoro',
    salvataIl: '2026-08-09T20:00:00.000Z',
    finestre: [{
      monitor: 'm1',
      layout: {
        root: { type: 'pane', id: 'pane-1' },
        panes: [{ id: 'pane-1', sessionUuid: 'u-1', cwd: 'C:\\p', title: 'Una chat' }]
      }
    }],
    autopiloti: [],
    ...over
  }
}

describe('apriIstantaneeStore', () => {
  it('elenca vuoto su una cartella nuova', () => {
    expect(apriIstantaneeStore(dir()).elenca()).toEqual([])
  })

  it('rilegge cio che ha salvato', () => {
    const s = apriIstantaneeStore(dir())
    s.salva(esempio())
    expect(s.elenca()[0]?.finestre[0]?.layout.panes[0]?.title).toBe('Una chat')
  })

  it('salvare con lo stesso nome sostituisce invece di accumulare', () => {
    const s = apriIstantaneeStore(dir())
    s.salva(esempio({ salvataIl: '2026-08-01T10:00:00.000Z' }))
    s.salva(esempio({ salvataIl: '2026-08-09T10:00:00.000Z' }))
    const tutte = s.elenca()
    expect(tutte).toHaveLength(1)
    expect(tutte[0]?.salvataIl).toBe('2026-08-09T10:00:00.000Z')
  })

  it('tiene istantanee con nomi diversi', () => {
    const s = apriIstantaneeStore(dir())
    s.salva(esempio({ nome: 'Lavoro' }))
    s.salva(esempio({ nome: 'Ricerca' }))
    expect(s.elenca().map((i) => i.nome).sort()).toEqual(['Lavoro', 'Ricerca'])
  })

  it('elimina per nome', () => {
    const s = apriIstantaneeStore(dir())
    s.salva(esempio({ nome: 'Lavoro' }))
    s.salva(esempio({ nome: 'Ricerca' }))
    expect(s.elimina('Lavoro').map((i) => i.nome)).toEqual(['Ricerca'])
  })

  it('non lascia file temporanei', () => {
    const d = dir()
    apriIstantaneeStore(d).salva(esempio())
    expect(readdirSync(d).filter((f) => f.endsWith('.tmp'))).toEqual([])
  })

  it('conserva un file illeggibile invece di cancellarlo', () => {
    // Contiene quali chat erano aperte e con quali autopiloti: non e'
    // ricostruibile da nessuna altra sorgente.
    const d = dir()
    writeFileSync(join(d, 'istantanee.json'), '{ non sono JSON', 'utf8')
    expect(apriIstantaneeStore(d).elenca()).toEqual([])
    const salvati = readdirSync(d).filter((f) => f.includes('.illeggibile'))
    expect(salvati).toHaveLength(1)
    expect(readFileSync(join(d, salvati[0]!), 'utf8')).toBe('{ non sono JSON')
  })

  it('salva anche gli autopiloti insieme alle chat', () => {
    const s = apriIstantaneeStore(dir())
    s.salva(esempio({
      autopiloti: [{
        nome: 'Test verdi', obiettivo: 'Fai passare la suite', cwd: 'C:\\p',
        criteri: [{ descrizione: 'i test passano', comando: 'npm test' }]
      }]
    }))
    expect(s.elenca()[0]?.autopiloti[0]?.obiettivo).toBe('Fai passare la suite')
  })
})

describe('un archivio piu nuovo di questa versione', () => {
  it('non viene sovrascritto: viene messo da parte com era', () => {
    // Aprendo una versione precedente del programma, i salvataggi scritti da
    // una piu' recente non si leggono. Finora l'elenco tornava vuoto e il primo
    // salvataggio successivo — quello automatico alla chiusura — riscriveva il
    // file: tutti i salvataggi persi, senza che niente lo dicesse.
    const d = dir()
    const f = join(d, 'istantanee.json')
    writeFileSync(f, JSON.stringify({ versione: 999, istantanee: [{ nome: 'preziosa' }] }), 'utf8')

    const s = apriIstantaneeStore(d)
    expect(s.elenca()).toEqual([])
    s.salva(esempio({ nome: 'nuova' }))

    const messiDaParte = readdirSync(d).filter((x) => x.includes('.illeggibile'))
    expect(messiDaParte).toHaveLength(1)
    const conservato = JSON.parse(readFileSync(join(d, messiDaParte[0]!), 'utf8'))
    expect(conservato.versione).toBe(999)
    expect(s.elenca().map((x) => x.nome)).toEqual(['nuova'])
  })
})
