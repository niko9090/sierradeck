import { describe, it, expect } from 'vitest'
import { nuovoAutopilota } from '@shared/autopilota'
import { conReleaseUscite, releaseUsciteDaGh } from '../../src/autopilot-host/release-uscite'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { creaServer } from '../../src/autopilot-host/server'
import { apriArchivio } from '../../src/autopilot-host/archivio'
import { creaRegistroDomande } from '../../src/autopilot-host/domande'
import { orologioDa } from '../setup/orologio'

// L'orologio del servizio di prova parte da un istante fisso e avanza col
// tempo vero: le attese funzionano come prima, il giorno non cambia mai.
const orologio = orologioDa('2026-10-29T10:00:00.000Z')

describe('release uscite con la data (0.85.0)', () => {
  it('da gh: senza bozze, senza «v», dalla più vecchia', () => {
    const json = JSON.stringify([
      { tagName: 'v0.84.4', isDraft: false, publishedAt: '2026-10-23T15:00:00Z' },
      { tagName: 'v0.85.0', isDraft: true, publishedAt: '2026-10-24T09:00:00Z' },
      { tagName: 'v0.84.3', isDraft: false, publishedAt: '2026-10-23T03:18:35Z' }
    ])
    expect(releaseUsciteDaGh(json)).toEqual([
      { versione: '0.84.3', quando: '2026-10-23T03:18:35.000Z' },
      { versione: '0.84.4', quando: '2026-10-23T15:00:00.000Z' }
    ])
    expect(releaseUsciteDaGh('non json')).toBeUndefined()
  })

  it('si riscrive l’autopilota solo se le release cambiano', () => {
    const a = nuovoAutopilota({ id: 'ap-1', nome: 'L', obiettivo: 'O', cwd: 'C:/progetto', criteri: [], iniziatoIl: '2026-10-23T08:00:00.000Z' })
    const uscite = [{ versione: '0.84.3', quando: '2026-10-23T03:18:35.000Z' }]
    const dopo = conReleaseUscite(a, uscite)
    expect(dopo?.releaseUscite).toEqual(uscite)
    expect(conReleaseUscite(dopo!, uscite)).toBeUndefined()
    expect(conReleaseUscite(a, [])).toBeUndefined()
  })
})

describe('il servizio salva le release uscite negli autopiloti (0.85.0)', () => {
  it('una lettura per progetto, scritte solo se cambiano, senza toccare ultimoEvento', async () => {
    const archivio = apriArchivio(mkdtempSync(join(tmpdir(), 'ap-release-')))
    const a = { ...nuovoAutopilota({ id: 'ap-1', nome: 'L', obiettivo: 'O', cwd: 'C:/progetto', criteri: [], iniziatoIl: '2026-10-23T08:00:00.000Z' }), ultimoEvento: '2026-10-23T09:00:00.000Z' }
    archivio.scrivi(a)
    archivio.scrivi({ ...a, id: 'ap-2' })
    const letture: string[] = []
    const server = creaServer({
      archivio,
      esegui: () => Promise.resolve({ codice: 0, uscita: 'ok' }),
      interroga: () => Promise.resolve({ testo: '{"azione": "finito"}' }),
      avviaLavoro: () => Promise.resolve(),
      fermaLavoro: () => undefined,
      avvisa: () => Promise.resolve(),
      domande: creaRegistroDomande({ adesso: orologio.ms }),
      scadenzaDomandaMs: 5000,
      scadenzaInterviataMs: 5000,
      adesso: () => '2026-10-23T12:00:00.000Z',
      releaseUscite: (cwd) => { letture.push(cwd); return Promise.resolve([{ versione: '0.84.4', quando: '2026-10-23T15:00:00.000Z' }]) }
    })
    expect(await server.aggiornaReleaseUscite()).toBe(2)
    expect(letture).toEqual(['C:/progetto'])
    expect(archivio.leggi('ap-1')?.releaseUscite).toEqual([{ versione: '0.84.4', quando: '2026-10-23T15:00:00.000Z' }])
    expect(archivio.leggi('ap-1')?.ultimoEvento).toBe('2026-10-23T09:00:00.000Z')
    expect(await server.aggiornaReleaseUscite()).toBe(0)
  })
})
