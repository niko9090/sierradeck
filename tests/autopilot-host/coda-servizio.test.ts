import { describe, it, expect, afterEach, vi } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { creaServer, type ServerAutopiloti } from '../../src/autopilot-host/server'
import { unicoFinto } from '../setup/unico-finto'
import { apriArchivio, type Archivio } from '../../src/autopilot-host/archivio'
import { creaRegistroDomande } from '../../src/autopilot-host/domande'
import { apriMemoria } from '../../src/autopilot-host/memoria'
import type { ArchivioCode } from '../../src/autopilot-host/coda-store'
import type { Vecchio } from '../../src/autopilot-host/migra-orchestratore'
import { nuovoAutopilota, type Autopilota } from '@shared/autopilota'
import type { VistaCoda } from '@shared/coda-richieste'
import { orologioDa } from '../setup/orologio'

/**
 * La coda nel servizio (P1/P4): le richieste di prima entrano al passaggio
 * all'autopilota del workspace, ogni messaggio entra nella coda con le parole
 * intere, e le rotte `/coda`, `/coda/separa`, `/coda/unisci`.
 */

let server: ServerAutopiloti | undefined
let porta: number
let archivio: Archivio
let code: ArchivioCode

const BARRA = 'la barra delle chat in alto non mostra il numero delle chat aperte'

function ap(p: Partial<Vecchio> = {}): Vecchio {
  return {
    ...nuovoAutopilota({ id: 'ap-coda', nome: 'Prova', obiettivo: 'Il programma', cwd: process.cwd(), iniziatoIl: '2026-10-29T06:00:00.000Z', workspace: 'Lavoro' }),
    stato: 'lavoro',
    ...p
  }
}

/** `unico`: l'autopilota scritto è già quello del workspace; altrimenti è uno di prima, da passare con `migraVecchi`. */
async function avvia(prima: Autopilota[], unico: boolean): Promise<void> {
  const orologio = orologioDa('2026-10-30T08:00:00.000Z')
  archivio = apriArchivio(mkdtempSync(join(tmpdir(), 'ap-coda-')))
  const finto = unicoFinto(unico ? archivio : undefined)
  code = finto.coda
  for (const a of prima) archivio.scrivi(a)
  const s = creaServer({
    ...finto,
    archivio,
    memoria: apriMemoria(mkdtempSync(join(tmpdir(), 'ap-coda-mem-'))),
    versione: '0.86.3',
    esegui: () => Promise.resolve({ codice: 1, uscita: 'non ancora' }),
    avviaLavoro: () => Promise.resolve(),
    avvisa: () => Promise.resolve(),
    domande: creaRegistroDomande({ adesso: orologio.ms }),
    ultimoDetto: () => 'sto lavorando',
    scadenzaDomandaMs: 5000,
    adesso: orologio.iso
  })
  if (!unico) s.migraVecchi()
  server = s
  await new Promise<void>((ris) => s.listen(0, '127.0.0.1', () => { porta = (s.address() as { port: number }).port; ris() }))
}

afterEach(() => { server?.close(); server = undefined; vi.restoreAllMocks() })

const zitto = (): void => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
}
const url = (p: string): string => `http://127.0.0.1:${porta}${p}`
const posta = (p: string, corpo: unknown): Promise<Response> => fetch(url(p), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
const vista = async (): Promise<VistaCoda> => (await (await fetch(url('/coda?ws=Lavoro'))).json()) as VistaCoda

const conRichiestaDiPrima = (): Vecchio => ap({
  richieste: [{ id: 'r-1', quando: '2026-10-29T08:00:00.000Z', testo: BARRA, titolo: 'La barra delle chat', criterio: 'la barra mostra il numero', compiti: ['Correggi la barra delle chat'] }],
  compitiDaFare: ['Correggi la barra delle chat', 'Il pannello lento']
})

describe('la coda nel servizio', () => {
  it('al passaggio le richieste e i compiti di prima entrano nella coda; GET /coda per workspace', async () => {
    zitto()
    await avvia([conRichiestaDiPrima()], false)
    const v = await vista()
    expect(v.workspace).toBe('Lavoro')
    expect(v.richieste.map((r) => [r.id, r.titolo])).toEqual([
      ['r-1', 'La barra delle chat'],
      ['r-2', 'Il pannello lento']
    ])
    expect(code.leggi('Lavoro').migrata).toBeDefined()
    expect((await fetch(url('/coda'))).status).toBe(400)
  })

  it('un messaggio lungo all’autopilota del workspace entra nella coda intero', async () => {
    zitto()
    const lunga = `correggi il pannello degli autopiloti: ${'deve aprirsi subito e non perdere nessuna riga. '.repeat(80)}`
    expect(lunga.length).toBeGreaterThan(3000)
    await avvia([ap()], true)
    expect((await posta('/autopiloti/ap-coda/dialogo', { testo: lunga })).status).toBe(202)
    const r = (await vista()).richieste[0]!
    // Intera: solo gli spazi ai bordi, che la rotta del dialogo toglie da sempre.
    expect(r.originali[0]!.testo).toBe(lunga.trim())
    expect(archivio.leggi('ap-coda')!.dialogo.at(-1)!.esito).toContain('in coda come r-1')
  })

  it('POST /coda/unisci a mano: rifiutata se manca un punto, fatta se li nomina tutti; /coda/separa', async () => {
    zitto()
    await avvia([conRichiestaDiPrima()], false)
    const male = await posta('/coda/unisci', { ws: 'Lavoro', ids: ['r-1', 'r-2'], testo: 'insieme', punti: [{ id: 'p-1' }], perche: 'prova' })
    expect(male.status).toBe(400)
    expect(((await male.json()) as { errore: string }).errore).toBe('unione rifiutata: si perderebbero i punti p-2')
    expect((await vista()).richieste).toHaveLength(2)
    const bene = await posta('/coda/unisci', { ws: 'Lavoro', ids: ['r-1', 'r-2'], testo: 'insieme', punti: [{ id: 'p-1' }, { id: 'p-2', superato: 'non serve più' }], perche: 'prova' })
    expect(bene.status).toBe(200)
    const v = (await bene.json()) as VistaCoda
    expect(v.richieste.map((r) => r.id)).toEqual(['r-1'])
    expect(v.richieste[0]!.punti[1]).toMatchObject({ id: 'p-2', stato: 'superato', perche: 'non serve più' })
    expect((await posta('/coda/unisci', { ws: 'Lavoro', ids: ['r-1'] })).status).toBe(400)
    expect((await posta('/coda/separa', { id: 'r-1' })).status).toBe(400)

    const s = await posta('/coda/separa', { ws: 'Lavoro', id: 'r-1' })
    expect(s.status).toBe(200)
    expect(((await s.json()) as VistaCoda).richieste.map((r) => r.id)).toEqual(['r-1', 'r-2'])
    expect((await posta('/coda/separa', { ws: 'Lavoro', id: 'r-1' })).status).toBe(400)
  })
})
