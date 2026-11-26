import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { assicuraUpdater, avviaUpdater, chiudiRimasti, processiUpdater, unoGiaInCorso } from '../../src/main/updater/compila'

/**
 * Il percorso di installazione non deve fermare il processo principale: le
 * chiamate sincrone (`execFileSync`, 15-60 s di tetto) tenevano muto anche
 * `/api/aggiornamento` per tutta la loro durata.
 */
const src = (p: string): string => readFileSync(join(__dirname, '../../src', p), 'utf8')

describe('il percorso di installazione non usa chiamate sincrone', () => {
  for (const file of ['main/aggiornamenti.ts', 'main/claude-versione.ts', 'main/updater/compila.ts', 'main/esegui-asincrono.ts']) {
    it(`${file} senza execFileSync / execSync / spawnSync`, () => {
      expect(src(file)).not.toMatch(/\b(execFileSync|execSync|spawnSync)\b/)
    })
  }

  it('i chiamanti attendono le versioni asincrone', () => {
    const agg = src('main/aggiornamenti.ts')
    expect(agg).toContain('await assicuraUpdater(cartellaUpdater())')
    expect(agg).toContain('await processiUpdater()')
    expect(agg).toContain('await avviaUpdater(percorso, datiAvvio')
    expect(agg).toContain('await claudeDaAggiornare?.()')
    expect(src('main/index.ts')).toContain('return await notaClaude(')
    expect(src('aiutante/index.ts')).toContain('await unoGiaInCorso()')
  })
})

describe('le funzioni dell updater sono asincrone e lasciano libero l event loop', () => {
  it('restituiscono promesse', () => {
    const elenco = processiUpdater(async () => '')
    const uno = unoGiaInCorso(async () => '')
    expect(elenco).toBeInstanceOf(Promise)
    expect(uno).toBeInstanceOf(Promise)
    return Promise.all([elenco, uno])
  })

  it('un elenco lento non blocca i timer, e il risultato e quello di prima', async () => {
    let scattato = false
    setTimeout(() => { scattato = true }, 10)
    const processi = await processiUpdater(() => new Promise<string>((r) => setTimeout(() => r('42|C:/x/SierraDeckUpdate.exe\n'), 80)))
    expect(scattato).toBe(true)
    expect(processi).toEqual([{ pid: 42, percorso: 'C:/x/SierraDeckUpdate.exe' }])
  })

  it('un elenco che fallisce resta «non lo so» (undefined) e «uno gia in corso» nel dubbio', async () => {
    expect(await processiUpdater(() => Promise.reject(new Error('scaduto')))).toBeUndefined()
    expect(await unoGiaInCorso(() => Promise.reject(new Error('scaduto')))).toBe(true)
    expect(await unoGiaInCorso(async () => 'SierraDeckUpdate.exe   123')).toBe(true)
    expect(await unoGiaInCorso(async () => 'Nessuna attivita')).toBe(false)
  })

  it('chiudiRimasti attende un elenco asincrono', async () => {
    const uccisi: number[] = []
    const r = await chiudiRimasti('C:/u/SierraDeckUpdate.exe', async () => [{ pid: 5, percorso: 'c:/u/sierradeckupdate.exe' }], (pid) => { uccisi.push(pid) })
    expect(uccisi).toEqual([5])
    expect(r.chiusi).toEqual([5])
  })

  it('assicuraUpdater e avviaUpdater sono funzioni async', () => {
    expect(assicuraUpdater.constructor.name).toBe('AsyncFunction')
    expect(avviaUpdater.constructor.name).toBe('AsyncFunction')
  })
})
