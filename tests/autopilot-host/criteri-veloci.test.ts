import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ePesante, guardaFuori, improntaCodice, misuraCriteri, turnoCompleto, VALIDITA_MS, type MemoriaCriteri } from '../../src/autopilot-host/criteri-veloci'
import { gitReale } from '../../src/autopilot-host/worktree'

/**
 * 0.71.0: i criteri non si rimisurano a vuoto. Sul PC vero un giro dell'hook
 * Stop durava 155 s di mediana, quasi tutti nei criteri rilanciati in fila.
 */
const criteri = [
  { descrizione: 'tipi', comando: 'npm run typecheck', soddisfatto: false },
  { descrizione: 'test', comando: 'npm test', soddisfatto: false },
  { descrizione: 'release', comando: 'gh release view v1', soddisfatto: false }
]

function ambiente() {
  let ora = 1_000_000
  const eseguiti: string[] = []
  let attivi = 0
  let picco = 0
  const esegui = async (comando: string): Promise<{ codice: number; uscita: string }> => {
    eseguiti.push(comando)
    attivi += 1; picco = Math.max(picco, attivi)
    await new Promise((r) => setTimeout(r, 5))
    ora += 1000
    attivi -= 1
    return { codice: 0, uscita: `ok ${comando}` }
  }
  return { esegui, eseguiti, adesso: () => ora, avanti: (ms: number) => { ora += ms }, picco: () => picco }
}

describe('criteri veloci', () => {
  it('riconosce i comandi pesanti e quelli che guardano fuori', () => {
    expect(ePesante('npm test')).toBe(true)
    expect(ePesante('cd android && gradle testDebugUnitTest assembleDebug --no-daemon')).toBe(true)
    expect(ePesante('npm run typecheck')).toBe(false)
    expect(guardaFuori("node -e \"require('child_process').execSync('gh release view v1')\"")).toBe(true)
    expect(guardaFuori('npm run typecheck')).toBe(false)
  })

  it('codice invariato: riusa gli esiti, tranne chi guarda fuori', async () => {
    const a = ambiente()
    const memoria: MemoriaCriteri = new Map()
    const m1 = await misuraCriteri(criteri, 'C:/p', a.esegui, { memoria, adesso: a.adesso, impronta: 'x1', tutti: true })
    expect(m1.esiti.map((e) => e.descrizione)).toEqual(['tipi', 'test', 'release'])
    expect(a.eseguiti).toHaveLength(3)
    const m2 = await misuraCriteri(criteri, 'C:/p', a.esegui, { memoria, adesso: a.adesso, impronta: 'x1', tutti: true })
    expect(m2.daCache).toEqual(['tipi', 'test'])
    expect(a.eseguiti.slice(3)).toEqual(['gh release view v1'])
  })

  it('codice cambiato: rimisura i veloci, i pesanti aspettano il turno completo (e lo dicono)', async () => {
    const a = ambiente()
    const memoria: MemoriaCriteri = new Map()
    await misuraCriteri(criteri, 'C:/p', a.esegui, { memoria, adesso: a.adesso, impronta: 'x1', tutti: true })
    const m = await misuraCriteri(criteri, 'C:/p', a.esegui, { memoria, adesso: a.adesso, impronta: 'x2', tutti: false })
    expect(m.rimandati).toEqual(['test'])
    expect(m.esiti.find((e) => e.descrizione === 'test')?.rimandatoDal).toBeTruthy()
    expect(a.eseguiti.slice(3).sort()).toEqual(['gh release view v1', 'npm run typecheck'])
    const pieno = await misuraCriteri(criteri, 'C:/p', a.esegui, { memoria, adesso: a.adesso, impronta: 'x2', tutti: true })
    expect(pieno.rimandati).toEqual([])
    expect(a.eseguiti).toContain('npm test')
  })

  it('la cache scade, e senza impronta (non git) non vale', async () => {
    const a = ambiente()
    const memoria: MemoriaCriteri = new Map()
    await misuraCriteri(criteri.slice(0, 1), 'C:/p', a.esegui, { memoria, adesso: a.adesso, impronta: 'x', tutti: true })
    a.avanti(VALIDITA_MS + 1)
    expect((await misuraCriteri(criteri.slice(0, 1), 'C:/p', a.esegui, { memoria, adesso: a.adesso, impronta: 'x', tutti: true })).daCache).toEqual([])
    expect((await misuraCriteri(criteri.slice(0, 1), 'C:/p', a.esegui, { memoria, adesso: a.adesso, tutti: true })).daCache).toEqual([])
  })

  it('due comandi insieme al massimo', async () => {
    const a = ambiente()
    const tanti = Array.from({ length: 6 }, (_, i) => ({ descrizione: `c${i}`, comando: `node c${i}.js`, soddisfatto: false }))
    await misuraCriteri(tanti, 'C:/p', a.esegui, { memoria: new Map(), adesso: a.adesso, tutti: true })
    expect(a.picco()).toBe(2)
  })

  it('il turno completo: il primo e poi ogni tre', () => {
    expect([1, 2, 3, 4, 5, 6].map(turnoCompleto)).toEqual([true, false, true, false, false, true])
  })

  it('l’impronta cambia con un file cambiato, anche non tracciato', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sd-impronta-'))
    gitReale(['init', '-q'], dir)
    gitReale(['-c', 'user.email=p@esempio.it', '-c', 'user.name=prova', 'commit', '-q', '--allow-empty', '-m', 'primo'], dir)
    const i1 = improntaCodice(gitReale, dir)
    expect(i1).toBeTruthy()
    expect(improntaCodice(gitReale, dir)).toBe(i1)
    writeFileSync(join(dir, 'nuovo.txt'), 'a')
    const i2 = improntaCodice(gitReale, dir)
    expect(i2).not.toBe(i1)
    writeFileSync(join(dir, 'nuovo.txt'), 'abc')
    expect(improntaCodice(gitReale, dir)).not.toBe(i2)
    // Una cartella fuori da git: si crea dentro Temp e git non risale oltre Temp (con TEMP dentro un
    // repository, come nei criteri lanciati con TEMP nel progetto, tmpdir() stessa era git: 18/10).
    const fuori = mkdtempSync(join(tmpdir(), 'sd-nogit-'))
    const prima = process.env.GIT_CEILING_DIRECTORIES
    process.env.GIT_CEILING_DIRECTORIES = tmpdir()
    try {
      expect(improntaCodice(gitReale, fuori)).toBeUndefined()
    } finally {
      if (prima === undefined) delete process.env.GIT_CEILING_DIRECTORIES
      else process.env.GIT_CEILING_DIRECTORIES = prima
    }
  }, 60_000) // quattro giri di git: a suite intera, con le altre chat al lavoro, passavano i 20 s
})
