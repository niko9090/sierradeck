import { describe, it, expect, vi } from 'vitest'
import { mkdtempSync, writeFileSync, readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { apriArchivio } from '../../src/autopilot-host/archivio'
import { nuovoAutopilota, type Autopilota } from '@shared/autopilota'

function dir(): string {
  return mkdtempSync(join(tmpdir(), 'autopiloti-'))
}

function esempio(id = 'ap-1'): Autopilota {
  return nuovoAutopilota({
    id, nome: 'Test verdi', obiettivo: 'Fai passare la suite', cwd: 'C:\\p',
    criteri: [{ descrizione: 'i test passano', comando: 'npm test', soddisfatto: false }],
    iniziatoIl: '2026-08-09T10:00:00.000Z'
  })
}

describe('apriArchivio', () => {
  it('elenca vuoto su una cartella nuova', () => {
    expect(apriArchivio(dir()).elenca()).toEqual([])
  })

  it('rilegge cio che ha scritto', () => {
    const a = apriArchivio(dir())
    a.scrivi(esempio())
    expect(a.leggi('ap-1')?.obiettivo).toBe('Fai passare la suite')
  })

  it('elenca piu autopiloti', () => {
    const a = apriArchivio(dir())
    a.scrivi(esempio('ap-1'))
    a.scrivi(esempio('ap-2'))
    expect(a.elenca().map((x) => x.id).sort()).toEqual(['ap-1', 'ap-2'])
  })

  it('non lascia file temporanei dopo una scrittura', () => {
    const d = dir()
    apriArchivio(d).scrivi(esempio())
    expect(readdirSync(d).filter((f) => f.endsWith('.tmp'))).toEqual([])
  })

  it('conserva un file illeggibile spostandolo di lato invece di cancellarlo', () => {
    // Lo stato di un autopilota non e' ricostruibile da niente: contiene il
    // lavoro fatto. Vale la regola di workspaces.json, non quella di index.db.
    const d = dir()
    writeFileSync(join(d, 'ap-rotto.json'), '{ non sono JSON', 'utf8')
    expect(apriArchivio(d).elenca()).toEqual([])
    const salvati = readdirSync(d).filter((f) => f.includes('.illeggibile'))
    expect(salvati).toHaveLength(1)
    expect(readFileSync(join(d, salvati[0]!), 'utf8')).toBe('{ non sono JSON')
  })

  it('salta un file valido come JSON ma non come autopilota, conservandolo', () => {
    const d = dir()
    writeFileSync(join(d, 'ap-vuoto.json'), JSON.stringify({ versione: 1 }), 'utf8')
    apriArchivio(d).scrivi(esempio('ap-buono'))
    expect(apriArchivio(d).elenca().map((x) => x.id)).toEqual(['ap-buono'])
    expect(readdirSync(d).filter((f) => f.includes('.illeggibile'))).toHaveLength(1)
  })

  it('non ripete lo stesso avviso a ogni lettura', () => {
    // L'elenco viene riletto ogni cinque secondi finche' il pannello e' aperto:
    // un file che il parser corregge — per esempio uno rimasto senza criteri —
    // scriverebbe la stessa riga diciassettemila volte al giorno, e il log
    // smetterebbe di essere il posto dove si guarda quando qualcosa non va.
    const d = dir()
    const a = apriArchivio(d)
    a.scrivi({ ...esempio('ap-1'), stato: 'lavoro', criteri: [] })
    const avvisi = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      a.elenca()
      const dopoIlPrimo = avvisi.mock.calls.length
      a.elenca()
      a.elenca()
      expect(dopoIlPrimo).toBeGreaterThan(0)
      expect(avvisi.mock.calls.length).toBe(dopoIlPrimo)
    } finally {
      avvisi.mockRestore()
    }
  })

  it('torna a segnalare se il file cambia', () => {
    // Silenziare per sempre nasconderebbe un problema nuovo dietro uno vecchio.
    const d = dir()
    const a = apriArchivio(d)
    a.scrivi({ ...esempio('ap-1'), stato: 'lavoro', criteri: [] })
    const avvisi = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      a.elenca()
      const primi = avvisi.mock.calls.length
      writeFileSync(join(d, 'ap-1.json'), JSON.stringify({ versione: 1, id: 'ap-1', obiettivo: 'o', cwd: 'C:\p', stato: 'attesa', criteri: [{ descrizione: '' }] }), 'utf8')
      a.elenca()
      expect(avvisi.mock.calls.length).toBeGreaterThan(primi)
    } finally {
      avvisi.mockRestore()
    }
  })

  it('ignora i file che non sono di autopiloti', () => {
    const d = dir()
    writeFileSync(join(d, 'appunti.txt'), 'niente', 'utf8')
    expect(apriArchivio(d).elenca()).toEqual([])
    expect(readdirSync(d).filter((f) => f.includes('.illeggibile'))).toHaveLength(0)
  })

  it('elimina un autopilota', () => {
    const d = dir()
    const a = apriArchivio(d)
    a.scrivi(esempio())
    a.elimina('ap-1')
    expect(a.leggi('ap-1')).toBeUndefined()
    expect(existsSync(join(d, 'ap-1.json'))).toBe(false)
  })

  it('rifiuta un id che uscirebbe dalla cartella', () => {
    // L'id arriva dal Gestore attraverso HTTP: senza questo controllo un id come
    // ..\\..\\settings scriverebbe fuori dall'archivio.
    const a = apriArchivio(dir())
    expect(() => a.scrivi({ ...esempio(), id: '..\\fuori' })).toThrow(/id/)
    expect(() => a.leggi('../fuori')).toThrow(/id/)
  })

  it('crea la cartella se manca', () => {
    const d = join(dir(), 'non', 'esiste')
    apriArchivio(d).scrivi(esempio())
    expect(existsSync(join(d, 'ap-1.json'))).toBe(true)
  })
})
