import { describe, it, expect } from 'vitest'
import { conDivieti, eseguiCriteri, esecutoreReale, tempoDelCriterio, TIMEOUT_SUITE_TEST_MS, type Esecutore } from '../../src/autopilot-host/verifiche'
import type { Criterio } from '@shared/autopilota'

const CON_COMANDO: Criterio = { descrizione: 'i test passano', comando: 'npm test', soddisfatto: false }
const SENZA_COMANDO: Criterio = { descrizione: 'la documentazione e chiara', soddisfatto: false }

describe('eseguiCriteri', () => {
  it('esegue solo i criteri che hanno un comando', async () => {
    const eseguiti: string[] = []
    const finto: Esecutore = (c) => {
      eseguiti.push(c)
      return Promise.resolve({ codice: 0, uscita: 'ok' })
    }
    const esiti = await eseguiCriteri([CON_COMANDO, SENZA_COMANDO], 'C:\\p', finto)
    expect(eseguiti).toEqual(['npm test'])
    expect(esiti).toHaveLength(1)
    expect(esiti[0]?.passato).toBe(true)
  })

  it('0.80.1: un rosso per tempo scaduto si rimisura una volta, e il secondo esito vale', async () => {
    let volte = 0
    const finto: Esecutore = () => {
      volte++
      return Promise.resolve(volte === 1
        ? { codice: 1, uscita: 'compilo...\n[comando interrotto dopo 600s]' }
        : { codice: 0, uscita: 'tutto verde' })
    }
    const esiti = await eseguiCriteri([CON_COMANDO], 'C:\\p', finto)
    expect(volte).toBe(2)
    expect(esiti[0]?.passato).toBe(true)
    expect(esiti[0]?.uscita).toBe('tutto verde')
  })

  it('0.80.1: se scade di nuovo è rosso davvero, rimisurato una volta sola', async () => {
    let volte = 0
    const finto: Esecutore = () => {
      volte++
      return Promise.resolve({ codice: 1, uscita: '[comando interrotto dopo 600s]' })
    }
    const esiti = await eseguiCriteri([CON_COMANDO], 'C:\\p', finto)
    expect(volte).toBe(2)
    expect(esiti[0]?.passato).toBe(false)
    expect(esiti[0]?.uscita).toContain('rimisurato una volta')
  })

  it('0.80.1: un rosso vero (non per tempo) non si rimisura', async () => {
    let volte = 0
    const finto: Esecutore = () => { volte++; return Promise.resolve({ codice: 1, uscita: '2 test rossi' }) }
    await eseguiCriteri([CON_COMANDO], 'C:\\p', finto)
    expect(volte).toBe(1)
  })

  it('0.80.1: con l esecutore vero il tempo scaduto si riconosce e si rimisura', async () => {
    const vero = esecutoreReale(300)
    let volte = 0
    const contato: Esecutore = (c, cwd) => { volte++; return vero(c, cwd) }
    const esiti = await eseguiCriteri([{ descrizione: 'lento', comando: 'node -e "setTimeout(()=>{},5000)"', soddisfatto: false }], process.cwd(), contato)
    expect(volte).toBe(2)
    expect(esiti[0]?.passato).toBe(false)
  })

  it('0.81.0: la suite dei test ha 20 minuti, gli altri criteri il tempo di prima', () => {
    expect(tempoDelCriterio('npx vitest run --maxWorkers=2')).toBe(TIMEOUT_SUITE_TEST_MS)
    expect(tempoDelCriterio('npm test')).toBe(TIMEOUT_SUITE_TEST_MS)
    expect(tempoDelCriterio('npm run test -- --run')).toBe(TIMEOUT_SUITE_TEST_MS)
    expect(TIMEOUT_SUITE_TEST_MS).toBe(20 * 60_000)
    expect(tempoDelCriterio('npm run typecheck')).toBeUndefined()
    expect(tempoDelCriterio('cd android && gradle testDebugUnitTest assembleDebug --no-daemon')).toBeUndefined()
    expect(tempoDelCriterio('bash -c \'! git grep -nE "rmSync" -- src\'')).toBeUndefined()
  })

  it('0.81.0: eseguiCriteri passa il tempo lungo solo alla suite', async () => {
    const tempi: Record<string, number | undefined> = {}
    const finto: Esecutore = (c, _cwd, t) => { tempi[c] = t; return Promise.resolve({ codice: 0, uscita: 'ok' }) }
    await eseguiCriteri([
      { descrizione: 'test', comando: 'npx vitest run --maxWorkers=2', soddisfatto: false },
      { descrizione: 'tipi', comando: 'npm run typecheck', soddisfatto: false }
    ], 'C:\\p', finto)
    expect(tempi['npx vitest run --maxWorkers=2']).toBe(TIMEOUT_SUITE_TEST_MS)
    expect('npm run typecheck' in tempi).toBe(true)
    expect(tempi['npm run typecheck']).toBeUndefined()
  })

  it('0.81.0: con l esecutore vero, la suite lenta entro il suo tempo è verde e un altro criterio lento resta rosso', async () => {
    // Tempi in scala: il tetto dell'esecutore 300 ms, quello della suite 40 s (il PC carico può metterci secondi solo ad avviare node).
    const vero = esecutoreReale(300)
    const lento = 'node -e "setTimeout(()=>{},1500)"'
    let volte = 0
    const inScala: Esecutore = (_c, cwd, t) => { volte++; return vero(lento, cwd, t === undefined ? undefined : t / 30) }
    const [suite] = await eseguiCriteri([{ descrizione: 'test', comando: 'npx vitest run', soddisfatto: false }], process.cwd(), inScala)
    expect(suite?.passato).toBe(true)
    expect(volte).toBe(1)
    const [tipi] = await eseguiCriteri([{ descrizione: 'tipi', comando: 'npm run typecheck', soddisfatto: false }], process.cwd(), inScala)
    expect(tipi?.passato).toBe(false)
    expect(tipi?.uscita).toContain('[comando interrotto dopo 0s]')
  }, 120_000)

  it('0.81.0: la suite che fallisce davvero resta rossa e non si rimisura', async () => {
    let volte = 0
    const finto: Esecutore = () => { volte++; return Promise.resolve({ codice: 1, uscita: 'Tests  2 failed | 4328 passed' }) }
    const [e] = await eseguiCriteri([{ descrizione: 'test', comando: 'npx vitest run --maxWorkers=2', soddisfatto: false }], 'C:\\p', finto)
    expect(e?.passato).toBe(false)
    expect(e?.uscita).toContain('2 failed')
    expect(volte).toBe(1)
  })

  it('0.81.0: conDivieti porta il tempo del criterio fino all esecutore', async () => {
    let ricevuto: number | undefined
    const esegui = conDivieti((_c, _cwd, t) => { ricevuto = t; return Promise.resolve({ codice: 0, uscita: 'ok' }) })
    await eseguiCriteri([{ descrizione: 'test', comando: 'npx vitest run', soddisfatto: false }], process.cwd(), esegui)
    expect(ricevuto).toBe(TIMEOUT_SUITE_TEST_MS)
  })

  it('un codice diverso da zero e un criterio non soddisfatto', async () => {
    const finto: Esecutore = () => Promise.resolve({ codice: 1, uscita: '2 test rossi' })
    const esiti = await eseguiCriteri([CON_COMANDO], 'C:\\p', finto)
    expect(esiti[0]?.passato).toBe(false)
    expect(esiti[0]?.uscita).toContain('2 test rossi')
  })

  it('un esecutore che solleva diventa un criterio non soddisfatto, non un errore', async () => {
    // Un comando inesistente o una cartella sparita non devono far cadere il
    // servizio: sono informazioni sul lavoro, e la chat deve riceverle.
    const finto: Esecutore = () => Promise.reject(new Error('comando non trovato'))
    const esiti = await eseguiCriteri([CON_COMANDO], 'C:\\p', finto)
    expect(esiti[0]?.passato).toBe(false)
    expect(esiti[0]?.uscita).toContain('comando non trovato')
  })

  it('esegue i criteri nell ordine dichiarato', async () => {
    const eseguiti: string[] = []
    const finto: Esecutore = (c) => {
      eseguiti.push(c)
      return Promise.resolve({ codice: 0, uscita: '' })
    }
    await eseguiCriteri(
      [CON_COMANDO, { descrizione: 'compila', comando: 'npm run build', soddisfatto: false }],
      'C:\\p',
      finto
    )
    expect(eseguiti).toEqual(['npm test', 'npm run build'])
  })
})

describe('esecutoreReale', () => {
  it('esegue davvero un comando e ne riporta l uscita', async () => {
    const esito = await esecutoreReale()('node -e "console.log(42)"', process.cwd())
    expect(esito.codice).toBe(0)
    expect(esito.uscita).toContain('42')
  })

  it('riporta il codice di uscita di un comando fallito', async () => {
    const esito = await esecutoreReale()('node -e "process.exit(3)"', process.cwd())
    expect(esito.codice).toBe(3)
  })

  it('di un uscita sterminata tiene l inizio e la fine (27/10)', async () => {
    // 60.000 caratteri e poi il riepilogo: prima arrivava solo l'inizio.
    const comando = `node -e "console.log('INIZIO'); for (let i = 0; i < 2000; i++) console.log('riga di log numero ' + i + '.......'); console.log('RIEPILOGO 1 failed'); process.exit(1)"`
    const esito = await esecutoreReale()(comando, process.cwd())
    expect(esito.codice).toBe(1)
    expect(esito.uscita).toContain('INIZIO')
    expect(esito.uscita).toContain('RIEPILOGO 1 failed')
    expect(esito.uscita.length).toBeLessThan(25_000)
  })

  it('il criterio riporta la fine dell uscita, non solo l inizio', async () => {
    const lunga = `RUN\n${'log\n'.repeat(5000)}Tests  1 failed | 1950 passed`
    const finto: Esecutore = () => Promise.resolve({ codice: 1, uscita: lunga })
    const esiti = await eseguiCriteri([CON_COMANDO], '.', finto)
    expect(esiti[0]?.uscita).toContain('1 failed | 1950 passed')
    expect(esiti[0]?.uscita.length).toBeLessThanOrEqual(4000)
  })

  it('interrompe un comando che non finisce', async () => {
    // Senza questo, un test appeso terrebbe l'hook in attesa fino ai suoi 900s,
    // e la chat resterebbe immobile per un quarto d'ora.
    const esito = await esecutoreReale(1000)('node -e "setTimeout(() => {}, 60000)"', process.cwd())
    expect(esito.codice).not.toBe(0)
    expect(esito.uscita.toLowerCase()).toContain('interrotto')
  })
})
