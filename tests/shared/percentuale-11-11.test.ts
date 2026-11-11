import { describe, it, expect } from 'vitest'
import { aggiungi, avanzamentoCoda, codaVuota, conRichiesta, type Coda, type CompitoMisurato, type MisuraCompito } from '@shared/coda-richieste'

/**
 * 11/11: la percentuale scendeva proprio quando un lavoro finiva (dialogo del 06/11: «è sceso
 * di un punto solo per come il programma ricalcola dopo un'unione»). Due motivi nella formula:
 * una richiesta fatta pesava quanti erano i suoi compiti e non quanto pesavano, e la finestra
 * del «lavoro di adesso» saltava in avanti quando si chiudeva la richiesta aperta più vecchia.
 */

const ora = (minuti: number): string => new Date(Date.parse('2026-11-11T08:00:00.000Z') + minuti * 60_000).toISOString()

function coda(...richieste: { nata: number; compiti: string[] }[]): Coda {
  let c = codaVuota('Lavoro')
  for (const r of richieste) c = aggiungi(c, { testo: `richiesta nata a ${r.nata}`, quando: ora(r.nata), compiti: r.compiti }).coda
  return c
}
const fatta = (c: Coda, id: string, quando: number): Coda => conRichiesta(c, id, (r) => ({ ...r, stato: 'fatta', fattaIl: ora(quando) }))
const misuraDa = (stati: Record<string, CompitoMisurato>): MisuraCompito => (k) => stati[k]

describe('finire un lavoro non fa mai scendere la percentuale', () => {
  it('un compito pesante che si chiude: la richiesta fatta pesa quanto pesavano i suoi compiti', () => {
    const c = coda({ nata: 0, compiti: ['grosso'] }, { nata: 1, compiti: ['piccolo'] })
    const quasi = misuraDa({ grosso: { stato: 'in-revisione', peso: 3 }, piccolo: { stato: 'da-fare', peso: 1 } })
    const prima = avanzamentoCoda(c, quasi)
    expect(prima).toBe(60)
    const finito = misuraDa({ grosso: { stato: 'unito', peso: 3 }, piccolo: { stato: 'da-fare', peso: 1 } })
    const dopo = avanzamentoCoda(fatta(c, 'r-1', 10), finito)
    // Con il conto dei compiti era (1 + 0) / (1 + 1) = 50: scendeva di dieci punti a lavoro finito.
    expect(dopo).toBe(75)
    expect(dopo!).toBeGreaterThanOrEqual(prima!)
  })

  it('si chiude la richiesta aperta più vecchia: le fatte di prima restano nel conto', () => {
    // r-1 nasce a 0 e finisce a 15, mentre r-2 (nata a 10) è aperta; r-3 nasce a 20.
    let c = coda({ nata: 0, compiti: ['a'] }, { nata: 10, compiti: ['b'] }, { nata: 20, compiti: ['c'] })
    c = fatta(c, 'r-1', 15)
    const prima = avanzamentoCoda(c, misuraDa({ a: { stato: 'unito' }, b: { stato: 'in-revisione' }, c: { stato: 'da-fare' } }))
    expect(prima).toBe(60)
    // r-2 finisce a 30: prima la finestra partiva da r-3 (nata a 20), r-1 usciva e si scendeva a 50.
    const dopo = avanzamentoCoda(fatta(c, 'r-2', 30), misuraDa({ a: { stato: 'unito' }, b: { stato: 'unito' }, c: { stato: 'da-fare' } }))
    expect(dopo).toBe(67)
    expect(dopo!).toBeGreaterThanOrEqual(prima!)
  })

  it('quando tutto è fatto si arriva a 100, e il lavoro che arriva dopo riparte da capo', () => {
    let c = coda({ nata: 0, compiti: ['a'] }, { nata: 10, compiti: ['b'] })
    c = fatta(fatta(c, 'r-1', 15), 'r-2', 30)
    const m = misuraDa({ a: { stato: 'unito' }, b: { stato: 'unito' }, c: { stato: 'da-fare' } })
    expect(avanzamentoCoda(c, m)).toBe(100)
    // Una richiesta nata dopo che tutto era finito: le fatte di prima non la annacquano.
    c = aggiungi(c, { testo: 'lavoro nuovo', quando: ora(40), compiti: ['c'] }).coda
    expect(avanzamentoCoda(c, m)).toBe(0)
  })

  it('una fatta che non si accavalla con il lavoro di adesso resta fuori; una che si accavalla, entra', () => {
    let c = coda({ nata: 0, compiti: ['a'] }, { nata: 10, compiti: ['b'] }, { nata: 50, compiti: ['c'] })
    // r-1 finita a 5, prima che nascesse r-2: fuori. r-2 finita a 60, con r-3 già aperta: dentro.
    c = fatta(fatta(c, 'r-1', 5), 'r-2', 60)
    expect(avanzamentoCoda(c, misuraDa({ a: { stato: 'unito' }, b: { stato: 'unito' }, c: { stato: 'da-fare' } }))).toBe(50)
  })
})
