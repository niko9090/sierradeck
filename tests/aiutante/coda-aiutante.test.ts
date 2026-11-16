import { describe, it, expect, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { creaNucleo, type Nucleo } from '../../src/aiutante/nucleo'
import { creaLavoratoreAiuto } from '../../src/autopilot-host/aiuto-lavoratore'
import { CODA_AIUTO_MAX } from '../../src/shared/aiuto-rete'

/**
 * La coda dell'Aiutante: con i posti pieni il lavoro nuovo aspetta (fino a 10),
 * parte quando si libera un posto, e si può fermare o chiudere anche in coda.
 * Un posto è occupato da un lavoro «in ricezione» (arrivato a metà): non serve
 * far partire niente per riempire l'Aiutante.
 */
const cartelle: string[] = []
afterEach(() => {
  for (const c of cartelle.splice(0)) rmSync(c, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
})

const misura = () => ({ processori: 8, memoriaLiberaMb: 32_000, memoriaTotaleMb: 64_000, caricoPercento: 5 })
const id = (n: number): string => `r${n.toString(16).padStart(12, '0')}`

function aiutante(posti = 1): Nucleo {
  const cartella = mkdtempSync(join(tmpdir(), 'coda-aiutante-'))
  cartelle.push(cartella)
  const n: Nucleo = creaNucleo({
    cartella, avvia: () => { throw new Error('nessun processo nelle prove') }, misura,
    regolazione: () => ({ postiScelti: posti }), pronto: () => true, inScarico: () => false,
    log: () => {}, errore: () => {},
    lavoratore: creaLavoratoreAiuto({ cartella, avvia: () => { throw new Error('nessun processo nelle prove') }, log: () => {}, pulisciOgniMs: 0 })
  })
  return n
}

/** Un lavoro che occupa un posto senza partire: il progetto arriva, ma `avvia` non è ancora stato chiamato. */
const occupa = (n: Nucleo, numero: number): Promise<unknown> => n.servizio('/aiuto/pezzo', { lavoro: id(numero), n: 0, totale: 1, dati: 'eA==' })
const avvia = (n: Nucleo, numero: number): Promise<unknown> => n.servizio('/aiuto/avvia', {
  lavoro: id(numero), progetto: 'prova', ramoBase: 'main', base: 'a'.repeat(40), prompt: 'fai la prova', ruolo: 'sviluppatore', descrizione: `lavoro ${numero}`, daNome: 'PC di prova'
})
const arriva = async (n: Nucleo, numero: number): Promise<void> => { await occupa(n, numero); await avvia(n, numero) }
const stato = async (n: Nucleo, numero: number): Promise<string> => ((await n.servizio('/aiuto/stato', { lavoro: id(numero) })) as { stato: string }).stato

describe('la coda dell’Aiutante', () => {
  it('con i posti pieni il lavoro aspetta in coda, con la sua posizione', async () => {
    const n = aiutante(1)
    await occupa(n, 1) // il solo posto è preso
    await arriva(n, 2)
    await arriva(n, 3)
    expect(await stato(n, 2)).toBe('in-coda')
    expect(n.inCoda().map((l) => [l.id, l.posizione, l.descrizione, l.perPc])).toEqual([[id(2), 1, 'lavoro 2', 'PC di prova'], [id(3), 2, 'lavoro 3', 'PC di prova']])
    expect(n.ospitati().map((l) => l.id)).toEqual([id(1)])
  })

  it('con un posto libero il lavoro parte subito, senza coda', async () => {
    const n = aiutante(2)
    await occupa(n, 1)
    await arriva(n, 2)
    expect(n.inCoda()).toEqual([])
    expect(await stato(n, 2)).not.toBe('in-coda')
    await vi.waitFor(async () => expect(await stato(n, 2)).toBe('fallito')) // niente processo nelle prove: finisce da solo
  })

  it('parte appena si libera un posto, in ordine di arrivo', async () => {
    const n = aiutante(1)
    await occupa(n, 1)
    await arriva(n, 2)
    await arriva(n, 3)
    await n.servizio('/aiuto/ferma', { lavoro: id(1) }) // il posto si libera
    expect(await stato(n, 2)).not.toBe('in-coda')
    expect(await stato(n, 3)).toBe('in-coda')
    expect(n.inCoda().map((l) => [l.id, l.posizione])).toEqual([[id(3), 1]])
    await vi.waitFor(async () => expect(await stato(n, 2)).toBe('fallito'))
    n.avanzaCoda()
    expect(await stato(n, 3)).not.toBe('in-coda')
    await vi.waitFor(async () => expect(await stato(n, 3)).toBe('fallito'))
  })

  it('oltre il tetto il lavoro si rifiuta come prima', async () => {
    const n = aiutante(1)
    await occupa(n, 1)
    for (let i = 0; i < CODA_AIUTO_MAX; i += 1) await arriva(n, 2 + i)
    expect(n.inCoda()).toHaveLength(CODA_AIUTO_MAX)
    await expect(occupa(n, 100)).rejects.toThrow(/non ha posti liberi/u)
  })

  it('un Aiutante che non è pieno per un altro motivo non accoda: rifiuta', async () => {
    const cartella = mkdtempSync(join(tmpdir(), 'coda-aiutante-'))
    cartelle.push(cartella)
    const n = creaNucleo({
      cartella, avvia: () => { throw new Error('mai') }, misura, regolazione: () => ({ postiScelti: 2 }),
      pronto: () => false, inScarico: () => false, log: () => {}, errore: () => {},
      lavoratore: creaLavoratoreAiuto({ cartella, avvia: () => { throw new Error('mai') }, log: () => {}, pulisciOgniMs: 0 })
    })
    await expect(occupa(n, 1)).rejects.toThrow(/non ha posti liberi/u)
  })

  it('un lavoro in coda si ferma: esce dalla coda e risulta fermato', async () => {
    const n = aiutante(1)
    await occupa(n, 1)
    await arriva(n, 2)
    await arriva(n, 3)
    expect(await n.servizio('/aiuto/ferma', { lavoro: id(2) })).toEqual({ fatto: true })
    expect(await stato(n, 2)).toBe('fermato')
    expect(n.inCoda().map((l) => [l.id, l.posizione])).toEqual([[id(3), 1]])
  })

  it('un lavoro in coda si chiude (ritira): sparisce, e chi aspettava dietro scala', async () => {
    const n = aiutante(1)
    await occupa(n, 1)
    await arriva(n, 2)
    await arriva(n, 3)
    expect(await n.servizio('/aiuto/chiudi', { lavoro: id(2) })).toEqual({ fatto: true })
    await expect(n.servizio('/aiuto/stato', { lavoro: id(2) })).rejects.toThrow(/lavoro sconosciuto/u)
    expect(n.inCoda().map((l) => [l.id, l.posizione])).toEqual([[id(3), 1]])
  })
})
