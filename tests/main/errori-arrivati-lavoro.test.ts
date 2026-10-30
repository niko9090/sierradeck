import { describe, it, expect } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  CARTELLA_RECUPERO_ARRIVI, GIORNI_GIA_AFFIDATO, QUIETE_MS, cartellaArrivi, chiaveErrore, decidiErroriArrivati, giroErroriArrivati,
  leggiStatoArrivi, quandoSpostato, raggruppa, svuotaRecuperoScaduto, type ArrivoLetto, type DepsGiroErrori
} from '../../src/main/errori-arrivati-lavoro'
import type { VoceErrore } from '@shared/storico-errori'

// Nella Temp finta della suite: la toglie la guardia alla fine (tests/setup).
const radiceNuova = (): string => {
  const r = join(mkdtempSync(join(tmpdir(), 'sierradeck-test-lavoro-')), 'SierraDeck')
  mkdirSync(r, { recursive: true })
  return r
}
const T0 = Date.parse('2026-10-30T10:00:00.000Z')
const voce = (o: Partial<VoceErrore> = {}): VoceErrore => ({ quando: '2026-10-30T09:00:00.000Z', ultima: '2026-10-30T09:00:00.000Z', dove: 'pc', volte: 1, messaggio: 'boom', versione: '0.88.3', ...o })
/** Un arrivo `<mittente>/<nome>.json` con l'ora `il`. */
const arrivo = (radice: string, mittente: string, nome: string, il: number, voci: VoceErrore[] = [voce()]): string => {
  const c = join(cartellaArrivi(radice), mittente)
  mkdirSync(c, { recursive: true })
  const f = join(c, `${nome}.json`)
  writeFileSync(f, JSON.stringify({ da: mittente, versione: '0.88.3', voci }))
  utimesSync(f, il / 1000, il / 1000)
  return f
}

describe('quando parte «Errori arrivati»', () => {
  const inAttesa = [{ file: 'PC-a/1.json', il: T0 }, { file: 'pagina/2.json', il: T0 + 60_000 }]

  it('aspetta la quiete dopo l’ultimo arrivo: gli arrivi vicini vanno in un solo lotto', () => {
    expect(decidiErroriArrivati({ inAttesa, adesso: T0 + 60_000 + QUIETE_MS - 1 })).toEqual({ azione: 'niente' })
    expect(decidiErroriArrivati({ inAttesa: [...inAttesa].reverse(), adesso: T0 + 60_000 + QUIETE_MS })).toEqual({ azione: 'avvia', file: ['PC-a/1.json', 'pagina/2.json'] })
  })

  it('non parte con la settimana del piano oltre l’80%, e lo dice', () => {
    const d = decidiErroriArrivati({ inAttesa, adesso: T0 + 3_600_000, settimanaPercento: 86.4 })
    expect(d).toEqual({ azione: 'aspetta', testo: expect.stringContaining('sotto l’80% (adesso 86%)') })
    expect(decidiErroriArrivati({ inAttesa, adesso: T0 + 3_600_000, settimanaPercento: 80 }).azione).toBe('avvia')
  })
})

describe('i gruppi', () => {
  const a = (da: string, voci: VoceErrore[]): ArrivoLetto => ({ file: `${da}/x.json`, da, versione: '0.88.3', voci })

  it('lo stesso errore con numeri e id diversi è un gruppo solo, con il conteggio, i PC e le versioni', () => {
    const { gruppi } = raggruppa({ versioneQui: '0.88.3', affidati: {}, adesso: T0, arrivi: [
      a('PC-a', [voce({ messaggio: 'chat 988034a7-5b6c-4a43-ac0e-c86b413a220c: cwd di 67 caratteri', volte: 3 })]),
      a('PC-b', [voce({ messaggio: 'chat 506aed0d-6058-46f9-949f-f405eac22449: cwd di 70 caratteri', volte: 2, versione: '0.88.2', ultima: '2026-10-30T09:30:00.000Z' }), voce({ messaggio: 'altro', volte: 9 })])
    ] })
    expect(gruppi.map((g) => [g.volte, g.da, g.versioni])).toEqual([[9, ['PC-b'], ['0.88.3']], [5, ['PC-a', 'PC-b'], ['0.88.3', '0.88.2']]])
    expect(gruppi[1]?.ultima).toBe('2026-10-30T09:30:00.000Z')
  })

  it('fuori gli errori del programma di versioni più vecchie; l’app del telefono ha la sua numerazione', () => {
    const r = raggruppa({ versioneQui: '0.88.3', affidati: {}, adesso: T0, arrivi: [a('PC-a', [voce({ versione: '0.85.1' }), voce({ messaggio: 'telefono', dove: 'app', versione: '2.88.0' }), voce({ messaggio: 'ok', versione: '0.88.0' })])] })
    expect(r.vecchie).toBe(1)
    expect(r.gruppi.map((g) => g.messaggio).sort()).toEqual(['ok', 'telefono'])
  })

  it('un gruppo già affidato resta fuori per una settimana, tranne se si ripresenta su una versione più nuova', () => {
    const chiave = chiaveErrore(voce())
    const affidati = { [chiave]: { il: new Date(T0 - 86_400_000).toISOString(), versione: '0.88.3' } }
    expect(raggruppa({ versioneQui: '0.88.3', affidati, adesso: T0, arrivi: [a('PC-a', [voce()])] })).toMatchObject({ gruppi: [], giaAffidati: 1 })
    const dopo = raggruppa({ versioneQui: '0.88.4', affidati, adesso: T0, arrivi: [a('PC-a', [voce({ versione: '0.88.4' })])] })
    expect(dopo.gruppi[0]?.ritorna).toEqual(affidati[chiave])
    // Dopo la settimana torna come nuovo.
    expect(raggruppa({ versioneQui: '0.88.3', affidati, adesso: T0 + GIORNI_GIA_AFFIDATO * 86_400_000, arrivi: [a('PC-a', [voce()])] }).gruppi).toHaveLength(1)
  })
})

describe('il giro sul disco', () => {
  const deps = (radice: string, o: Partial<DepsGiroErrori> = {}) => {
    let ora = T0
    const affidate: Array<{ testo: string; cwd: string }> = []
    const righe: string[] = []
    const d: DepsGiroErrori = {
      radice: () => radice,
      adesso: () => ora,
      versione: () => '0.88.3',
      settimanaPercento: () => 10,
      affida: async (p) => { affidate.push(p) },
      log: (r) => { righe.push(r) },
      nuovoId: () => 'L1',
      ...o
    }
    return { d, affidate, righe, vai: (t: number) => { ora = t } }
  }

  it('dagli arrivi al lotto: una richiesta sola all’autopilota, gli arrivi nel recupero, i gruppi ricordati', async () => {
    const radice = radiceNuova()
    arrivo(radice, 'PC-a', '1', T0, [voce({ volte: 4 })])
    arrivo(radice, 'DESKTOP', '2', T0 + 1000, [voce({ volte: 2 }), voce({ messaggio: 'altro guaio', punto: 'src/main/x.ts:12' })])
    const g = deps(radice)
    g.vai(T0 + 1000 + QUIETE_MS - 1)
    await giroErroriArrivati(g.d)
    expect(g.affidate).toHaveLength(0)
    g.vai(T0 + 1000 + QUIETE_MS)
    const riga = await giroErroriArrivati(g.d)
    expect(riga).toContain('2 gruppi affidati')
    expect(g.affidate).toHaveLength(1)
    expect(g.affidate[0]?.cwd).toBe(radice)
    const lotto = join(cartellaArrivi(radice), 'lotto-L1.md')
    expect(g.affidate[0]?.testo).toContain(lotto)
    expect(g.affidate[0]?.testo).toContain('dimmi in breve')
    const testo = readFileSync(lotto, 'utf8')
    expect(testo).toContain('volte: 6')
    expect(testo).toContain('da: PC-a, DESKTOP')
    expect(testo).toContain('`src/main/x.ts:12`')
    // Gli arrivi nel recupero; lo stato ricorda i gruppi.
    expect(readdirSync(join(cartellaArrivi(radice), 'PC-a'))).toEqual([])
    expect(readdirSync(join(cartellaArrivi(radice), CARTELLA_RECUPERO_ARRIVI, 'PC-a'))).toHaveLength(1)
    expect(Object.keys(leggiStatoArrivi(cartellaArrivi(radice)).affidati)).toHaveLength(2)
    // Gli stessi errori di nuovo: niente richiesta, nel recupero.
    arrivo(radice, 'PC-a', '3', T0 + 10 * QUIETE_MS, [voce({ volte: 7 })])
    g.vai(T0 + 12 * QUIETE_MS)
    expect(await giroErroriArrivati(g.d)).toContain('niente di nuovo')
    expect(g.affidate).toHaveLength(1)
  })

  it('se l’autopilota non prende la richiesta, gli arrivi restano e si riprova', async () => {
    const radice = radiceNuova()
    arrivo(radice, 'PC-a', '1', T0)
    const g = deps(radice, { affida: async () => { throw new Error('servizio spento') } })
    g.vai(T0 + QUIETE_MS)
    await giroErroriArrivati(g.d)
    expect(readdirSync(join(cartellaArrivi(radice), 'PC-a'))).toEqual(['1.json'])
    expect(leggiStatoArrivi(cartellaArrivi(radice)).affidati).toEqual({})
    expect(g.righe.some((r) => r.includes('servizio spento'))).toBe(true)
  })

  it('l’attesa si scrive nel registro una volta, non a ogni giro', async () => {
    const radice = radiceNuova()
    arrivo(radice, 'PC-a', 'x', T0)
    const g = deps(radice, { settimanaPercento: () => 95 })
    g.vai(T0 + QUIETE_MS)
    await giroErroriArrivati(g.d)
    await giroErroriArrivati(g.d)
    expect(g.righe.filter((r) => r.includes('sotto l’80%'))).toHaveLength(1)
    expect(g.affidate).toHaveLength(0)
  })

  it('lo stato della versione di prima (i lavori dell’autopilota vecchio) riparte da capo', () => {
    const radice = radiceNuova()
    const arrivi = cartellaArrivi(radice)
    mkdirSync(arrivi, { recursive: true })
    writeFileSync(join(arrivi, '.lavori.json'), JSON.stringify({ versione: 1, lavori: [{ id: 'ea-1', autopilota: 'ap', file: [], creatoIl: '' }] }))
    expect(leggiStatoArrivi(arrivi)).toEqual({ versione: 2, affidati: {}, lotti: [] })
    expect(existsSync(arrivi)).toBe(true)
  })

  it('senza cartella di SierraDeck o senza arrivi non fa niente', async () => {
    expect(await giroErroriArrivati(deps('x', { radice: () => undefined }).d)).toBeUndefined()
    expect(await giroErroriArrivati(deps(radiceNuova()).d)).toBeUndefined()
  })

  it('il recupero si svuota da solo dopo 30 giorni dallo spostamento', () => {
    const radice = radiceNuova()
    const arrivi = cartellaArrivi(radice)
    const rec = join(arrivi, CARTELLA_RECUPERO_ARRIVI, 'PC-a')
    mkdirSync(rec, { recursive: true })
    writeFileSync(join(rec, 'a.json.2026-09-01T10-00-00-000Z'), '{}')
    writeFileSync(join(rec, 'b.json.2026-10-15T10-00-00-000Z'), '{}')
    expect(quandoSpostato('a.json.2026-09-01T10-00-00-000Z')).toBe(Date.parse('2026-09-01T10:00:00.000Z'))
    expect(svuotaRecuperoScaduto(arrivi, T0)).toEqual([join('PC-a', 'a.json.2026-09-01T10-00-00-000Z')])
    expect(readdirSync(rec)).toEqual(['b.json.2026-10-15T10-00-00-000Z'])
  })
})

describe('lo storico non si riempie di un falso guasto a ogni avvio', () => {
  it('i `before-quit` del main stanno sotto il tetto alzato: niente MaxListenersExceededWarning', async () => {
    const src = ['src/main/index.ts', 'src/main/finestre-pannello.ts'].map((f) => readFileSync(f, 'utf8')).join('\n')
    const tetto = Number(/app\.setMaxListeners\((\d+)\)/.exec(readFileSync('src/main/index.ts', 'utf8'))?.[1] ?? 10)
    const quanti = (src.match(/\.(on|once)\('before-quit'/g) ?? []).length
    expect(quanti).toBeGreaterThan(10)
    expect(quanti).toBeLessThan(tetto)
  })
})
