import { describe, it, expect } from 'vitest'
import { eseguiCriteri, esecutoreReale, type Esecutore } from '../../src/autopilot-host/verifiche'
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
  }, 30000)

  it('riporta il codice di uscita di un comando fallito', async () => {
    const esito = await esecutoreReale()('node -e "process.exit(3)"', process.cwd())
    expect(esito.codice).toBe(3)
  }, 30000)

  it('interrompe un comando che non finisce', async () => {
    // Senza questo, un test appeso terrebbe l'hook in attesa fino ai suoi 900s,
    // e la chat resterebbe immobile per un quarto d'ora.
    const esito = await esecutoreReale(1000)('node -e "setTimeout(() => {}, 60000)"', process.cwd())
    expect(esito.codice).not.toBe(0)
    expect(esito.uscita.toLowerCase()).toContain('interrotto')
  }, 30000)
})
