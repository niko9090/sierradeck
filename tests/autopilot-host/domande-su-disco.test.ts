import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { creaRegistroDomande } from '../../src/autopilot-host/domande'

/** 0.71.0: il registro delle domande su disco, ricaricato al riavvio del servizio. */
describe('le domande aperte su disco', () => {
  it('una domanda aperta e il suo contesto tornano dopo il riavvio; la risposta va per la strada tardiva', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'sd-dom-')), 'servizio', 'domande-aperte.json')
    const r1 = creaRegistroDomande({ adesso: () => 1000, file })
    const d = r1.apri({ autopilotaId: 'ap-1', testo: 'Quale chiave?', scadenzaMs: 50, opzioni: ['A', 'B'] })
    r1.ricorda(d.id, { autopilotaId: 'ap-1', testo: 'Quale chiave?', chatId: 'c-2' })

    const r2 = creaRegistroDomande({ adesso: () => 2000, file })
    expect(r2.aperte()).toHaveLength(1)
    expect(r2.aperte()[0]).toMatchObject({ id: d.id, opzioni: ['A', 'B'], contesto: { chatId: 'c-2' } })
    const tardive: string[] = []
    r2.suRispostaTardiva((id, risposta) => tardive.push(`${id}:${risposta}`))
    expect(r2.rispondi(d.id, 'A', 'modale')).toBe(true)
    expect(tardive).toEqual([`${d.id}:A`])
    // Risposta data: al riavvio dopo non c'è più.
    expect(creaRegistroDomande({ adesso: () => 3000, file }).aperte()).toHaveLength(0)
  })

  it('un file rotto non ferma il servizio', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'sd-dom-')), 'domande-aperte.json')
    writeFileSync(file, '{rotto')
    expect(creaRegistroDomande({ adesso: () => 0, file }).aperte()).toEqual([])
  })
})
