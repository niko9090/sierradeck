import { describe, it, expect } from 'vitest'
import { dimenticaIRossi, misuraCriteri, SCADENZA_ASSENTE_MS, type MemoriaCriteri } from '../../src/autopilot-host/criteri-veloci'

/** 23/11: un programma che manca sul PC non si rilancia a ogni giro e a ogni unione. */
const ghAssente = [{ descrizione: 'release', comando: 'gh release view v1', soddisfatto: false }]

function prova(risposta: { codice: number; uscita: string }) {
  let ora = 5_000_000
  const eseguiti: string[] = []
  const esegui = async (comando: string): Promise<{ codice: number; uscita: string }> => { eseguiti.push(comando); return risposta }
  return { esegui, eseguiti, adesso: () => ora, avanti: (ms: number) => { ora += ms } }
}

describe('criteri non misurabili ricordati', () => {
  it('gh assente: il comando gira una volta, poi risponde «non misurato» dalla memoria', async () => {
    const p = prova({ codice: 127, uscita: 'bash: gh: command not found' })
    const memoria: MemoriaCriteri = new Map()
    const opz = { memoria, adesso: p.adesso, impronta: 'x1', tutti: true }
    const m1 = await misuraCriteri(ghAssente, 'C:/p', p.esegui, opz)
    p.avanti(5 * 60 * 1000)
    const m2 = await misuraCriteri(ghAssente, 'C:/p', p.esegui, { ...opz, impronta: 'x2' })
    expect(p.eseguiti).toHaveLength(1)
    expect(m1.esiti[0]?.misurato).toBe(false)
    expect(m2.esiti[0]?.misurato).toBe(false)
    expect(m2.esiti[0]?.passato).toBe(false)
    expect(m2.daCache).toEqual(['release'])
    expect(m2.esiti[0]?.uscita).toContain('non misurabile su questo PC')
    // Un'unione dimentica i rossi, non questo.
    dimenticaIRossi(memoria)
    await misuraCriteri(ghAssente, 'C:/p', p.esegui, opz)
    expect(p.eseguiti).toHaveLength(1)
  })

  it('dopo la scadenza si rimisura', async () => {
    const p = prova({ codice: 127, uscita: 'bash: gh: command not found' })
    const opz = { memoria: new Map() as MemoriaCriteri, adesso: p.adesso, impronta: 'x1', tutti: true }
    await misuraCriteri(ghAssente, 'C:/p', p.esegui, opz)
    p.avanti(SCADENZA_ASSENTE_MS + 1000)
    await misuraCriteri(ghAssente, 'C:/p', p.esegui, opz)
    expect(p.eseguiti).toHaveLength(2)
  })

  it('gh presente con esito rosso: si rimisura come oggi', async () => {
    const p = prova({ codice: 1, uscita: 'HTTP 404: release not found' })
    const opz = { memoria: new Map() as MemoriaCriteri, adesso: p.adesso, impronta: 'x1', tutti: true }
    const m1 = await misuraCriteri(ghAssente, 'C:/p', p.esegui, opz)
    await misuraCriteri(ghAssente, 'C:/p', p.esegui, opz)
    expect(p.eseguiti).toHaveLength(2)
    expect(m1.esiti[0]?.misurato).not.toBe(false)
  })

  it('tsc non trovato (node_modules mancanti): non si ricorda come programma assente', async () => {
    const p = prova({ codice: 127, uscita: 'sh: tsc: command not found' })
    const opz = { memoria: new Map() as MemoriaCriteri, adesso: p.adesso, impronta: undefined, tutti: true }
    const c = [{ descrizione: 'tipi', comando: 'tsc --noEmit', soddisfatto: false }]
    await misuraCriteri(c, 'C:/p', p.esegui, opz)
    await misuraCriteri(c, 'C:/p', p.esegui, opz)
    expect(p.eseguiti).toHaveLength(2)
  })
})
