import { describe, it, expect } from 'vitest'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { compresoIn, ePesante, guardaFuori, improntaCodice, misuraCriteri, turnoCompleto, ESITI_RICORDATI, type MemoriaCriteri } from '../../src/autopilot-host/criteri-veloci'
import { gitFinto, usaGitFinto } from '../setup/git-finto'

// git vero, con date e configurazione sempre uguali (vedi `git-finto.ts`).
usaGitFinto()

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

  it('0.82.1: l’esito vale per commit e comando, senza scadenza; senza impronta (non git) non vale', async () => {
    const a = ambiente()
    const memoria: MemoriaCriteri = new Map()
    await misuraCriteri(criteri.slice(0, 1), 'C:/p', a.esegui, { memoria, adesso: a.adesso, impronta: 'abc1234', tutti: true })
    // Ore dopo, stesso commit: niente da rimisurare (fino alla 0.82.0 la cache scadeva in 10 minuti).
    a.avanti(6 * 3600_000)
    expect((await misuraCriteri(criteri.slice(0, 1), 'C:/p', a.esegui, { memoria, adesso: a.adesso, impronta: 'abc1234', tutti: true })).daCache).toEqual(['tipi'])
    // Lo stesso comando sullo stesso commit in un'altra cartella (la copia della Revisione): vale lo stesso esito.
    expect((await misuraCriteri(criteri.slice(0, 1), 'C:/altra', a.esegui, { memoria, adesso: a.adesso, impronta: 'abc1234', tutti: true })).daCache).toEqual(['tipi'])
    expect(a.eseguiti).toHaveLength(1)
    expect((await misuraCriteri(criteri.slice(0, 1), 'C:/p', a.esegui, { memoria, adesso: a.adesso, tutti: true })).daCache).toEqual([])
  })

  it('0.82.1: «non misurato» e «scaduto per tempo» non si ricordano per il commit', async () => {
    const memoria: MemoriaCriteri = new Map()
    let volte = 0
    const scade = async (): Promise<{ codice: number; uscita: string }> => { volte += 1; return { codice: 1, uscita: 'lento\n[comando interrotto dopo 1200s]' } }
    const uno = [{ descrizione: 'test', comando: 'npm test', soddisfatto: false }]
    await misuraCriteri(uno, 'C:/p', scade, { memoria, adesso: () => 1, impronta: 'abc1234', tutti: true })
    const prima = volte
    await misuraCriteri(uno, 'C:/p', scade, { memoria, adesso: () => 2, impronta: 'abc1234', tutti: true })
    expect(volte).toBeGreaterThan(prima)
  })

  it('0.82.1: due chat sullo stesso commit insieme: il comando gira una volta sola', async () => {
    const a = ambiente()
    const memoria: MemoriaCriteri = new Map()
    const uno = criteri.slice(1, 2)
    const [m1, m2] = await Promise.all([
      misuraCriteri(uno, 'C:/p', a.esegui, { memoria, adesso: a.adesso, impronta: 'def5678', tutti: true }),
      misuraCriteri(uno, 'C:/p', a.esegui, { memoria, adesso: a.adesso, impronta: 'def5678', tutti: true })
    ])
    expect(a.eseguiti).toEqual(['npm test'])
    expect(m1.esiti[0]?.passato).toBe(true)
    expect(m2.esiti[0]?.passato).toBe(true)
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

  it('0.94.0: l’impronta è il codice: cambia col contenuto, non con un commit vuoto né con un file non tracciato', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sd-impronta-'))
    gitFinto(['init', '-q'], dir)
    const committa = (m: string): void => { gitFinto(['-c', 'user.email=p@esempio.it', '-c', 'user.name=prova', 'commit', '-q', '--allow-empty', '-m', m], dir) }
    writeFileSync(join(dir, 'base.ts'), 'a')
    gitFinto(['add', '.'], dir)
    committa('primo')
    const i1 = improntaCodice(gitFinto, dir)
    expect(i1).toMatch(/^[0-9a-f]{40}$/)
    // Le consegne e i file del programma nella cartella principale non sono codice.
    writeFileSync(join(dir, 'nuovo.txt'), 'a')
    expect(improntaCodice(gitFinto, dir)).toBe(i1)
    // Un commit senza codice nuovo (la nota del quaderno prima di unire): stesso esito.
    committa('secondo')
    expect(improntaCodice(gitFinto, dir)).toBe(i1)
    // L'unione di prova (codice nell'indice, non ancora un commit) e il suo commit: la stessa impronta.
    writeFileSync(join(dir, 'base.ts'), 'b')
    gitFinto(['add', 'base.ts'], dir)
    const prova = improntaCodice(gitFinto, dir)
    expect(prova).not.toBe(i1)
    committa('unione')
    expect(improntaCodice(gitFinto, dir)).toBe(prova)
    const i2 = improntaCodice(gitFinto, dir)
    expect(i2).not.toBe(i1)
    // Un file tracciato cambiato e non salvato conta (chi lavora senza commit);
    // uno tracciato sotto .sierradeck (quaderno scritto dal programma) no.
    mkdirSync(join(dir, '.sierradeck'))
    writeFileSync(join(dir, 'codice.ts'), 'a')
    writeFileSync(join(dir, '.sierradeck', 'scheda.md'), 'a')
    gitFinto(['add', '.'], dir)
    committa('terzo')
    const i3 = improntaCodice(gitFinto, dir)
    writeFileSync(join(dir, '.sierradeck', 'scheda.md'), 'b')
    expect(improntaCodice(gitFinto, dir)).toBe(i3)
    writeFileSync(join(dir, 'codice.ts'), 'b')
    expect(improntaCodice(gitFinto, dir)).not.toBe(i3)
    // Una cartella fuori da git: si crea dentro Temp e git non risale oltre Temp (con TEMP dentro un
    // repository, come nei criteri lanciati con TEMP nel progetto, tmpdir() stessa era git: 18/10).
    const fuori = mkdtempSync(join(tmpdir(), 'sd-nogit-'))
    const prima = process.env.GIT_CEILING_DIRECTORIES
    process.env.GIT_CEILING_DIRECTORIES = tmpdir()
    try {
      expect(improntaCodice(gitFinto, fuori)).toBeUndefined()
    } finally {
      if (prima === undefined) delete process.env.GIT_CEILING_DIRECTORIES
      else process.env.GIT_CEILING_DIRECTORIES = prima
    }
  }) // git vero: i 60 s del progetto «lenti» (vitest.config.ts)
})

describe('memoria dei criteri (Revisione 0.82.1)', () => {
  it('tiene al più ESITI_RICORDATI voci: le più vecchie escono', async () => {
    const memoria: MemoriaCriteri = new Map()
    const esegui = async (): Promise<{ codice: number; uscita: string }> => ({ codice: 0, uscita: 'ok' })
    const uno = [{ descrizione: 'tipi', comando: 'npm run typecheck', soddisfatto: false }]
    for (let i = 0; i < ESITI_RICORDATI; i++) {
      await misuraCriteri(uno, 'C:/p', esegui, { memoria, adesso: () => i, impronta: `c${String(i).padStart(7, '0')}`, tutti: true })
    }
    expect(memoria.size).toBeLessThanOrEqual(ESITI_RICORDATI)
    expect([...memoria.keys()].some((k) => k.includes('c0000000'))).toBe(false)
    expect([...memoria.keys()].some((k) => k.includes(`c${String(ESITI_RICORDATI - 1).padStart(7, '0')}`))).toBe(true)
  })
})

describe('0.94.0: le prove già comprese in un’altra', () => {
  it('compresoIn: i filtri di vitest sono pezzi di percorso', () => {
    expect(compresoIn('npx vitest run tests/main/pty-host-client.test.ts', 'npx vitest run tests/main')).toBe(true)
    expect(compresoIn('npx vitest run tests/main/a.test.ts tests/shared/b.test.ts', 'npx vitest run tests/main tests/shared')).toBe(true)
    expect(compresoIn('npx vitest run tests/main/a.test.ts', 'npx vitest run --maxWorkers=2')).toBe(true)
    expect(compresoIn('npx vitest run tests/main', 'npx vitest run tests/main/a.test.ts')).toBe(false)
    expect(compresoIn('npx vitest run tests/main/a.test.ts tests/autopilot-host/b.test.ts', 'npx vitest run tests/main')).toBe(false)
    // Opzioni che cambiano quali prove girano, o più comandi: niente deduzioni.
    expect(compresoIn('npx vitest run tests/main/a.test.ts', 'npx vitest run tests/main -t solo')).toBe(false)
    expect(compresoIn('npx vitest run tests/main/a.test.ts', 'npx vitest run tests/main && echo ok')).toBe(false)
    expect(compresoIn('npm test', 'npx vitest run')).toBe(false)
  })

  it('il largo passa: lo stretto non si rilancia; il largo non passa: lo stretto si misura', async () => {
    const lista = [
      { descrizione: 'stretto', comando: 'npx vitest run tests/main/a.test.ts', soddisfatto: false },
      { descrizione: 'largo', comando: 'npx vitest run tests/main', soddisfatto: false }
    ]
    const eseguiti: string[] = []
    let rosso = false
    const esegui = async (comando: string): Promise<{ codice: number; uscita: string }> => { eseguiti.push(comando); return { codice: rosso && comando.endsWith('tests/main') ? 1 : 0, uscita: 'x' } }
    const m = await misuraCriteri(lista, 'C:/p', esegui, { memoria: new Map(), adesso: () => 1, tutti: true })
    expect(eseguiti).toEqual(['npx vitest run tests/main'])
    expect(m.esiti.map((e) => [e.descrizione, e.passato])).toEqual([['stretto', true], ['largo', true]])
    rosso = true
    eseguiti.length = 0
    await misuraCriteri(lista, 'C:/p', esegui, { memoria: new Map(), adesso: () => 1, tutti: true })
    expect(eseguiti).toEqual(['npx vitest run tests/main', 'npx vitest run tests/main/a.test.ts'])
  })
})
