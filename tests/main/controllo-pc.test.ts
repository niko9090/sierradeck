import { describe, it, expect } from 'vitest'
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { criticitaDi, firmaCriticita, giroControlloPc } from '../../src/main/controllo-pc'
import type { Salute } from '@shared/salute'
import type { AutopilotiDiPc } from '@shared/autopiloti-altri'

const salute = (voci: Salute['voci'] = []): Salute => ({ scritto: '', tono: voci.some((v) => v.tono !== 'ok') ? 'attenzione' : 'ok', riassunto: voci.length === 0 ? 'tutto bene' : `${voci.length} voci`, voci })
const voce = (tono: 'ok' | 'attenzione' | 'guasto', titolo: string): Salute['voci'][number] => ({ chiave: titolo, gruppo: 'pc', tono, titolo, spiegazione: `perché ${titolo}`, azioni: [] })

describe('il controllo di tutti i PC (0.88.9)', () => {
  it('criticità: voci non «ok», PC che non risponde, autopiloti bloccati', () => {
    const c = criticitaDi(
      [
        { pcId: 'a', nome: 'PC-Fisso', salute: salute([voce('ok', 'Drive'), voce('attenzione', 'Aggiornamento in sospeso')]) },
        { pcId: 'b', nome: 'DESKTOP', errore: 'nessuna risposta su 3 strade' }
      ],
      [
        { pcId: 'c', nome: 'LAPTOP', autopiloti: [{ id: '1', nome: 'Money', stato: 'lavoro' }, { id: '2', nome: 'serverDSM', stato: 'bloccata', motivo: 'la cartella non c’è' }] },
        { pcId: 'b', nome: 'DESKTOP', autopiloti: [], errore: 'non risponde' }
      ] as AutopilotiDiPc[]
    )
    expect(c.map((x) => `${x.pc}: ${x.cosa}`)).toEqual([
      'PC-Fisso: attenzione · Aggiornamento in sospeso',
      'DESKTOP: non risponde',
      'LAPTOP: autopilota «serverDSM» bloccata'
    ])
    expect(c[2]?.dettaglio).toBe('la cartella non c’è')
  })

  it('la firma non cambia con i dettagli (orari, conteggi), cambia con le criticità', () => {
    const a = [{ pc: 'X', cosa: 'non risponde', dettaglio: 'da 5 min' }]
    expect(firmaCriticita(a)).toBe(firmaCriticita([{ pc: 'X', cosa: 'non risponde', dettaglio: 'da 50 min' }]))
    expect(firmaCriticita(a)).not.toBe(firmaCriticita([...a, { pc: 'Y', cosa: 'non risponde', dettaglio: '' }]))
  })

  it('il giro: rapporto e affido la prima volta; le stesse criticità non si riaffidano', async () => {
    const radice = mkdtempSync(join(tmpdir(), 'sd-controllo-'))
    const affidati: string[] = []
    const d: Parameters<typeof giroControlloPc>[0] = {
      radice: () => radice,
      io: () => ({ id: 'a', nome: 'PC-Fisso' }),
      altri: () => [{ pcId: 'b', nome: 'DESKTOP' }],
      saluteQui: () => Promise.resolve(salute()),
      saluteDi: () => Promise.reject(new Error('nessuna risposta')),
      autopiloti: () => Promise.resolve([]),
      affida: (p) => { affidati.push(p.testo); return Promise.resolve() },
      adesso: () => Date.parse('2026-10-31T22:00:00.000Z'),
      log: () => undefined
    }
    expect(await giroControlloPc(d)).toEqual({ criticita: 1, affidato: true })
    const cartella = join(radice, '.sierradeck', 'errori-arrivati')
    const rapporto = readdirSync(cartella).find((f) => f.startsWith('controllo-'))!
    expect(readFileSync(join(cartella, rapporto), 'utf8')).toContain('**DESKTOP** · non risponde')
    expect(affidati[0]).toContain('1 criticità')
    expect(await giroControlloPc(d)).toEqual({ criticita: 1, affidato: false })
    expect(affidati).toHaveLength(1)
    expect(existsSync(join(cartella, '.controllo-pc.json'))).toBe(true)
  })

  it('senza la cartella di SierraDeck (non è il PC di sviluppo) non fa niente', async () => {
    let chiesto = false
    const r = await giroControlloPc({
      radice: () => undefined, io: () => ({ id: 'a', nome: 'A' }), altri: () => [],
      saluteQui: () => { chiesto = true; return Promise.resolve(salute()) }, saluteDi: () => Promise.resolve(salute()),
      autopiloti: () => Promise.resolve([]), affida: () => Promise.resolve(), adesso: () => 0, log: () => undefined
    })
    expect(r).toEqual({ criticita: 0, affidato: false })
    expect(chiesto).toBe(false)
  })
  it('0.89.0: la stessa criticità da più PC è una riga; le righe del registro non entrano', () => {
    const voce = (titolo: string, gruppo = 'pc') => ({ chiave: titolo, gruppo, tono: 'attenzione', titolo, spiegazione: 's', azioni: [] })
    const salute = (voci: unknown[]) => ({ tono: 'attenzione', riassunto: 'r', voci }) as never
    const c = criticitaDi([
      { pcId: 'a', nome: 'A', salute: salute([voce('Portatile · non so se è acceso'), voce('5 minuti fa: SALVA fallito', 'errori')]) },
      { pcId: 'b', nome: 'B', salute: salute([voce('Portatile · non so se è acceso')]) }
    ], [])
    expect(c).toEqual([{ pc: 'A, B', cosa: 'attenzione · Portatile · non so se è acceso', dettaglio: 's' }])
  })

  it('0.89.0: anche gli autopiloti di questo PC', async () => {
    const radice = mkdtempSync(join(tmpdir(), 'sd-controllo-qui-'))
    const affidati: string[] = []
    const r = await giroControlloPc({
      radice: () => radice, io: () => ({ id: 'qui', nome: 'Qui' }), altri: () => [],
      saluteQui: async () => ({ tono: 'ok', riassunto: 'ok', voci: [] }) as never,
      saluteDi: async () => { throw new Error('nessuno') },
      autopiloti: async () => [],
      autopilotiQui: async () => [{ id: 'ap-1', nome: 'Autopilota · X', stato: 'fallito', motivo: 'tre giri a vuoto' }],
      affida: async (p) => { affidati.push(p.testo) }, adesso: () => Date.parse('2026-10-31T23:00:00.000Z'), log: () => {}
    })
    expect(r).toEqual({ criticita: 1, affidato: true })
    const file = readdirSync(join(radice, '.sierradeck', 'errori-arrivati')).find((n) => n.startsWith('controllo-'))!
    expect(readFileSync(join(radice, '.sierradeck', 'errori-arrivati', file), 'utf8')).toContain('**Qui** · autopilota «Autopilota · X» fallito')
  })
})
