import { describe, it, expect } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  CARTELLA_RECUPERO_ARRIVI, QUIETE_MS, arriviInAttesa, cartellaArrivi, criteriErroriArrivati, decidiErroriArrivati, fileRiepilogo,
  giroErroriArrivati, lavoriDaChiudere, leggiStatoArrivi, obiettivoErroriArrivati, quandoSpostato, suSierraDeck, svuotaRecuperoScaduto,
  type AutopilotaVisto, type DepsGiroErrori
} from '../../src/main/errori-arrivati-lavoro'

// Nella Temp finta della suite: la toglie la guardia alla fine (tests/setup).
const radiceNuova = (): string => {
  const r = join(mkdtempSync(join(tmpdir(), 'sierradeck-test-lavoro-')), 'SierraDeck')
  mkdirSync(r, { recursive: true })
  return r
}
const T0 = Date.parse('2026-10-20T10:00:00.000Z')
/** Un arrivo `<mittente>/<nome>.json` con l'ora `il`. */
const arrivo = (radice: string, mittente: string, nome: string, il: number): string => {
  const c = join(cartellaArrivi(radice), mittente)
  mkdirSync(c, { recursive: true })
  const f = join(c, `${nome}.json`)
  writeFileSync(f, JSON.stringify({ da: mittente, voci: [{ messaggio: 'boom' }] }))
  utimesSync(f, il / 1000, il / 1000)
  return f
}
const ap = (o: Partial<AutopilotaVisto> & { id: string }): AutopilotaVisto => ({ nome: o.id, stato: 'lavoro', cwd: 'C:\\altro', ...o })

describe('quando parte «Errori arrivati»', () => {
  const radice = 'E:\\Progetti\\SierraDeck'
  const inAttesa = [{ file: 'PC-a/1.json', il: T0 }, { file: 'pagina/2.json', il: T0 + 60_000 }]

  it('aspetta la quiete dopo l’ultimo arrivo: gli arrivi vicini vanno in un solo lavoro', () => {
    expect(decidiErroriArrivati({ inAttesa, adesso: T0 + 60_000 + QUIETE_MS - 1, autopiloti: [], radice })).toEqual({ azione: 'niente' })
    expect(decidiErroriArrivati({ inAttesa: [...inAttesa].reverse(), adesso: T0 + 60_000 + QUIETE_MS, autopiloti: [], radice })).toEqual({ azione: 'avvia', file: ['PC-a/1.json', 'pagina/2.json'] })
  })

  it('non parte con la settimana del piano oltre l’80%, e lo dice', () => {
    const d = decidiErroriArrivati({ inAttesa, adesso: T0 + 3_600_000, autopiloti: [], radice, settimanaPercento: 86.4 })
    expect(d).toEqual({ azione: 'aspetta', testo: expect.stringContaining('sotto l’80% (adesso 86%)') })
    expect(decidiErroriArrivati({ inAttesa, adesso: T0 + 3_600_000, autopiloti: [], radice, settimanaPercento: 80 }).azione).toBe('avvia')
  })

  it('non parte se un autopilota lavora già su SierraDeck: «li correggo appena finisce X»', () => {
    const occupato = [ap({ id: 'ap-1', nome: 'App Android', cwd: 'e:\\progetti\\sierradeck\\' })]
    expect(decidiErroriArrivati({ inAttesa, adesso: T0 + 3_600_000, autopiloti: occupato, radice })).toEqual({ azione: 'aspetta', testo: 'Errori arrivati (2 arrivi): li correggo appena finisce «App Android».' })
    // Sospeso ad aspettare Nicholas è ancora un lavoro su SierraDeck (Revisione del 20/10).
    expect(decidiErroriArrivati({ inAttesa, adesso: T0 + 3_600_000, autopiloti: [ap({ id: 'a', nome: 'Fermo', stato: 'sospeso', cwd: radice })], radice }).azione).toBe('aspetta')
    // Finito, fallito, archiviato o su un altro progetto: non conta.
    const liberi = [ap({ id: 'b', stato: 'finito', cwd: radice }), ap({ id: 'e', stato: 'fallito', cwd: radice }), ap({ id: 'c', cwd: radice, archiviato: true }), ap({ id: 'd' })]
    expect(decidiErroriArrivati({ inAttesa, adesso: T0 + 3_600_000, autopiloti: liberi, radice }).azione).toBe('avvia')
    // Un nostro lavoro ancora aperto, anche se il servizio non lo vede: mai un secondo.
    expect(decidiErroriArrivati({ inAttesa, adesso: T0 + 3_600_000, autopiloti: [], radice, lavoroAperto: true })).toEqual({ azione: 'aspetta', testo: 'Errori arrivati (2 arrivi): li correggo appena finisce «Errori arrivati».' })
  })

  it('una copia di lavoro `SierraDeck.sierradeck-wt` è SierraDeck, `SierraDeck-prova` no', () => {
    expect(suSierraDeck('E:\\Progetti\\SierraDeck.sierradeck-wt\\ap-1-c-2', radice)).toBe(true)
    expect(suSierraDeck('E:\\Progetti\\SierraDeck\\android', radice)).toBe(true)
    expect(suSierraDeck('E:\\Progetti\\SierraDeck-prova', radice)).toBe(false)
    expect(suSierraDeck('', radice)).toBe(false)
  })

  it('un lavoro si chiude quando il suo autopilota è finito, fallito o sparito', () => {
    const lavori = [
      { id: 'ea-1', autopilota: 'ap-1', file: [], creatoIl: '' },
      { id: 'ea-2', autopilota: 'ap-2', file: [], creatoIl: '' },
      { id: 'ea-3', autopilota: 'ap-3', file: [], creatoIl: '' },
      { id: 'ea-4', autopilota: 'ap-4', file: [], creatoIl: '' },
      { id: 'ea-5', autopilota: 'ap-5', file: [], creatoIl: '', chiuso: { il: '', come: 'finito' as const } }
    ]
    const r = lavoriDaChiudere(lavori, [ap({ id: 'ap-1', stato: 'finito' }), ap({ id: 'ap-2', stato: 'fallito' }), ap({ id: 'ap-4' }), ap({ id: 'ap-5', stato: 'finito' })])
    expect(r.map((x) => [x.lavoro.id, x.come])).toEqual([['ea-1', 'finito'], ['ea-2', 'fallito'], ['ea-3', 'sparito']])
  })

  it('l’obiettivo mette il riepilogo per primo, prima di qualunque modifica, e la release mai installata', () => {
    const o = obiettivoErroriArrivati({ arrivi: join('E:', 'x', '.sierradeck', 'errori-arrivati'), file: ['PC-a/1.json'], riepilogo: 'E:\\x\\r.md' })
    expect(o.indexOf('PRIMA di qualunque modifica')).toBeLessThan(o.indexOf('Correggi, con un test'))
    expect(o).toContain(join('E:', 'x', '.sierradeck', 'errori-arrivati', 'PC-a', '1.json'))
    expect(o).toContain('Non installarla mai')
    expect(o).toContain('corretto nella versione')
    expect(criteriErroriArrivati('E:\\x\\r.md')[0]?.comando).toContain("'E:/x/r.md'")
  })
})

describe('il giro sul disco', () => {
  const deps = (radice: string, o: Partial<DepsGiroErrori> = {}) => {
    const creati: Array<{ nome: string; cwd: string; obiettivo: string }> = []
    const annunci: Array<{ id: string; testo: string }> = []
    const righe: string[] = []
    let adesso = T0
    const d: DepsGiroErrori = {
      radice: () => radice,
      adesso: () => adesso,
      autopiloti: async () => [],
      settimanaPercento: () => 10,
      crea: async (p) => { creati.push(p); return { id: `ap-${creati.length}` } },
      annuncia: async (id, _t, testo) => { annunci.push({ id, testo }) },
      log: (r) => righe.push(r),
      nuovoId: () => `ea-${creati.length + 1}`,
      ...o
    }
    return { d, creati, annunci, righe, vai: (ms: number) => { adesso = ms } }
  }

  it('dall’arrivo al recupero: un lavoro solo, un riepilogo solo, i file nel recupero solo a lavoro finito', async () => {
    const radice = radiceNuova()
    arrivo(radice, 'PC-a', '2026-10-20T10-00-00Z', T0)
    arrivo(radice, 'pagina', '2026-10-20T10-01-00Z', T0 + 60_000)
    const lista: AutopilotaVisto[] = []
    const g = deps(radice, { autopiloti: async () => lista })
    const arrivi = cartellaArrivi(radice)

    // Subito dopo: aspetta la quiete, non crea niente.
    g.vai(T0 + 120_000)
    expect(await giroErroriArrivati(g.d)).toContain('parto fra qualche minuto')
    expect(g.creati).toHaveLength(0)

    // Dopo la quiete: un lavoro solo con tutti e due, nel progetto SierraDeck.
    g.vai(T0 + 60_000 + QUIETE_MS)
    expect(await giroErroriArrivati(g.d)).toBe('Errori arrivati: al lavoro su 2 arrivi.')
    expect(g.creati).toHaveLength(1)
    expect(g.creati[0]).toMatchObject({ nome: 'Errori arrivati', cwd: radice })
    lista.push(ap({ id: 'ap-1', nome: 'Errori arrivati', cwd: radice }))

    // Un arrivo durante il lavoro aspetta che finisca: niente secondo lavoro.
    arrivo(radice, 'PC-a', '2026-10-20T11-00-00Z', T0 + 3_600_000)
    g.vai(T0 + 3_600_000 + QUIETE_MS)
    expect(await giroErroriArrivati(g.d)).toBe('Errori arrivati (1 arrivo): li correggo appena finisce «Errori arrivati».')
    expect(g.creati).toHaveLength(1)

    // Il riepilogo scritto dalla chat va a Nicholas una volta sola.
    writeFileSync(fileRiepilogo(arrivi, 'ea-1'), 'Due errori: uno dalla pagina, causa capita. Correggo X. Peso: piccolo.')
    await giroErroriArrivati(g.d)
    await giroErroriArrivati(g.d)
    expect(g.annunci).toEqual([{ id: 'ap-1', testo: 'Due errori: uno dalla pagina, causa capita. Correggo X. Peso: piccolo.' }])

    // Finito: i suoi due file e il riepilogo nel recupero, l'arrivo nuovo no.
    lista[0] = { ...lista[0]!, stato: 'finito' }
    g.vai(T0 + 7_200_000)
    await giroErroriArrivati(g.d)
    expect(existsSync(join(arrivi, 'PC-a', '2026-10-20T10-00-00Z.json'))).toBe(false)
    expect(existsSync(join(arrivi, 'pagina', '2026-10-20T10-01-00Z.json'))).toBe(false)
    expect(readdirSync(join(arrivi, CARTELLA_RECUPERO_ARRIVI, 'PC-a'))[0]).toMatch(/^2026-10-20T10-00-00Z\.json\.\d{4}-/)
    expect(readdirSync(join(arrivi, CARTELLA_RECUPERO_ARRIVI)).some((n) => n.startsWith('riepilogo-ea-1.md.'))).toBe(true)
    expect(existsSync(join(arrivi, 'PC-a', '2026-10-20T11-00-00Z.json'))).toBe(true)
    // E l'arrivo rimasto parte da solo, in un lavoro nuovo.
    expect(g.creati).toHaveLength(2)
    expect(leggiStatoArrivi(arrivi).lavori.map((l) => [l.id, l.file, l.chiuso?.come])).toEqual([
      ['ea-1', ['PC-a/2026-10-20T10-00-00Z.json', 'pagina/2026-10-20T10-01-00Z.json'], 'finito'],
      ['ea-2', ['PC-a/2026-10-20T11-00-00Z.json'], undefined]
    ])
    expect(arriviInAttesa(arrivi, leggiStatoArrivi(arrivi))).toEqual([])
  })

  it('un lavoro fallito non mette i file nel recupero; riparte al massimo due volte, poi lo dice', async () => {
    const radice = radiceNuova()
    const f = arrivo(radice, 'PC-a', 'x', T0)
    const lista: AutopilotaVisto[] = []
    const g = deps(radice, { autopiloti: async () => lista })
    g.vai(T0 + QUIETE_MS)
    await giroErroriArrivati(g.d)
    lista.push(ap({ id: 'ap-1', stato: 'fallito', cwd: radice }))
    await giroErroriArrivati(g.d)
    expect(existsSync(f)).toBe(true)
    expect(g.creati).toHaveLength(2)
    lista.push(ap({ id: 'ap-2', stato: 'fallito', cwd: radice }))
    expect(await giroErroriArrivati(g.d)).toBe('Errori arrivati: 1 arrivo non corretti dopo 2 tentativi: guardali tu in .sierradeck/errori-arrivati.')
    expect(g.creati).toHaveLength(2)
    expect(existsSync(f)).toBe(true)
  })

  it('lo stato è su disco appena creato l’autopilota, non solo a fine giro', async () => {
    const radice = radiceNuova()
    arrivo(radice, 'PC-a', 'x', T0)
    // Nel momento in cui il giro dice «avviato», il lavoro deve già essere nel file:
    // se il giro cadesse lì, al giro dopo gli stessi file non ripartirebbero.
    let suDisco = -1
    const g = deps(radice, { log: (r) => { if (r.includes('avviato')) suDisco = leggiStatoArrivi(cartellaArrivi(radice)).lavori.length } })
    g.vai(T0 + QUIETE_MS)
    await giroErroriArrivati(g.d)
    expect(suDisco).toBe(1)
  })

  it('l’attesa si scrive nel registro una volta, non a ogni giro', async () => {
    const radice = radiceNuova()
    arrivo(radice, 'PC-a', 'x', T0)
    const g = deps(radice, { settimanaPercento: () => 95 })
    g.vai(T0 + QUIETE_MS)
    await giroErroriArrivati(g.d)
    await giroErroriArrivati(g.d)
    expect(g.righe.filter((r) => r.includes('sotto l’80%'))).toHaveLength(1)
    expect(g.creati).toHaveLength(0)
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
    writeFileSync(join(rec, 'b.json.2026-10-01T10-00-00-000Z'), '{}')
    expect(quandoSpostato('a.json.2026-09-01T10-00-00-000Z')).toBe(Date.parse('2026-09-01T10:00:00.000Z'))
    expect(svuotaRecuperoScaduto(arrivi, T0)).toEqual([join('PC-a', 'a.json.2026-09-01T10-00-00-000Z')])
    expect(readdirSync(rec)).toEqual(['b.json.2026-10-01T10-00-00-000Z'])
  })
})

describe('lo storico non si riempie di un falso guasto a ogni avvio', () => {
  it('i `before-quit` del main stanno sotto il tetto alzato: niente MaxListenersExceededWarning', async () => {
    const { readFileSync } = await import('node:fs')
    const src = ['src/main/index.ts', 'src/main/finestre-pannello.ts'].map((f) => readFileSync(f, 'utf8')).join('\n')
    const tetto = Number(/app\.setMaxListeners\((\d+)\)/.exec(readFileSync('src/main/index.ts', 'utf8'))?.[1] ?? 10)
    const quanti = (src.match(/\.(on|once)\('before-quit'/g) ?? []).length
    expect(quanti).toBeGreaterThan(10)
    expect(quanti).toBeLessThan(tetto)
  })
})
