import { describe, it, expect } from 'vitest'
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, symlinkSync, utimesSync, writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  CARTELLA_RECUPERO_RIASSETTO, EDIZIONE_RIASSETTO, compattaErrori, componiRiepilogo, daFare, giornaleNuovo,
  leggiEsitoServizio, leggiGiornale, percentuale, rigaRiepilogo, saltatiPerMotivo, type EsitoPassoServizio, type PassoDelServizio
} from '../../src/shared/riassetto'
import {
  apriRecuperoPasso, liberaRecuperoRiassetto, manifesti, ripristinaRiassetto, scadenzeRecuperoRiassetto
} from '../../src/main/riassetto/recupero'
import { RimandaPasso, caricaGiornale, creaMotore, passoDaFunzione, type Passo } from '../../src/main/riassetto/motore'
import { costruisciPassi, doppioniIdentici, noteDelQuaderno } from '../../src/main/riassetto/passi'
import { creaRiassetto, copiaDiVersionePresente } from '../../src/main/riassetto/riassetto'
import { mettiAlSicuroLoStato } from '../../src/main/copie-di-versione'

const ORA = Date.parse('2026-11-05T10:00:00Z')
const GIORNO = 86_400_000

function cartella(prefisso = 'sd-riassetto-'): string {
  return mkdtempSync(join(tmpdir(), prefisso))
}

/** Scrive un file e lo invecchia di `giorni` rispetto a ORA. */
function file(p: string, testo = 'x', giorni = 30): string {
  mkdirSync(join(p, '..'), { recursive: true })
  writeFileSync(p, testo)
  const t = new Date(ORA - giorni * GIORNO)
  utimesSync(p, t, t)
  return p
}

function invecchia(p: string, giorni: number): void {
  const t = new Date(ORA - giorni * GIORNO)
  utimesSync(p, t, t)
}

describe('riassetto: le parti pure', () => {
  it('la percentuale va con i pesi, 100 solo a giornale chiuso', () => {
    const g = giornaleNuovo('0.88.0', [{ id: 'a', titolo: 'A' }, { id: 'b', titolo: 'B' }, { id: 'c', titolo: 'C' }], new Date(ORA).toISOString())
    const pesi = new Map([['a', 1], ['b', 3], ['c', 6]])
    expect(percentuale(g, pesi)).toBe(0)
    g.passi[0]!.stato = 'fatto'
    expect(percentuale(g, pesi)).toBe(10)
    expect(percentuale(g, pesi, { id: 'b', frazione: 0.5 })).toBe(25)
    g.passi[1]!.stato = 'fatto'
    g.passi[2]!.stato = 'fatto'
    expect(percentuale(g, pesi)).toBe(99)
    expect(percentuale({ ...g, fatto: new Date(ORA).toISOString() }, pesi)).toBe(100)
  })

  it('gira dopo un aggiornamento, non al primo avvio, una volta sola per edizione', () => {
    expect(daFare(undefined, { versione: '0.88.0', copiaAppenaFatta: true, primoAvvio: false })).toBe(true)
    expect(daFare(undefined, { versione: '0.88.0', copiaAppenaFatta: true, primoAvvio: true })).toBe(false)
    expect(daFare(undefined, { versione: '0.88.0', copiaAppenaFatta: false, primoAvvio: false })).toBe(false)
    const g = giornaleNuovo('0.88.0', [], new Date(ORA).toISOString())
    // Un giornale non finito della stessa versione: si riprende anche senza copia nuova.
    expect(daFare(g, { versione: '0.88.0', copiaAppenaFatta: false, primoAvvio: false })).toBe(true)
    expect(daFare({ ...g, fatto: 'x' }, { versione: '0.89.0', copiaAppenaFatta: true, primoAvvio: false })).toBe(false)
    expect(daFare({ ...g, edizione: EDIZIONE_RIASSETTO - 1, fatto: 'x' }, { versione: '0.89.0', copiaAppenaFatta: true, primoAvvio: false })).toBe(true)
  })

  it('il giornale si legge con prudenza', () => {
    expect(leggiGiornale(null)).toBeUndefined()
    expect(leggiGiornale({ versione: 1 })).toBeUndefined()
    const g = leggiGiornale({ versione: '0.88.0', passi: [{ id: 'a', stato: 'boh', fatti: ['x', 3] }, { niente: true }] })
    expect(g?.passi).toHaveLength(1)
    expect(g?.passi[0]?.stato).toBe('da-fare')
    expect(g?.passi[0]?.fatti).toEqual(['x'])
  })

  it('il riepilogo somma i passi e la riga dice tutto in una riga', () => {
    const g = giornaleNuovo('0.88.0', [{ id: 'a', titolo: 'A' }, { id: 'b', titolo: 'B' }], '2026-11-05T10:00:00.000Z')
    g.passi[0] = { ...g.passi[0]!, stato: 'fatto', fatti: ['1', '2'], byteInRecupero: 535 * 1024 * 1024, saltati: [{ cosa: 'x', perche: 'in uso o bloccata (EBUSY)' }] }
    g.passi[1] = { ...g.passi[1]!, stato: 'fatto', fatti: ['3'], byteLiberati: 2 * 1024 * 1024, errori: ['boh'], proposte: ['riordina'] }
    const r = componiRiepilogo({ ...g, fatto: '2026-11-05T10:00:00.000Z' }, { cartellaRecupero: 'C:\\dati\\recupero-riassetto\\0.88.0' })
    expect(r.byteInRecupero).toBe(535 * 1024 * 1024)
    expect(r.annullabileFino.slice(0, 10)).toBe('2026-12-05')
    expect(r.errori).toEqual(['B: boh'])
    const riga = rigaRiepilogo(r)
    expect(riga).toContain('3 cose sistemate')
    expect(riga).toContain('535 MB nel recupero')
    expect(riga).toContain('2,0 MB liberati')
    expect(riga).toContain('1 saltati')
    expect(saltatiPerMotivo(r.saltati)).toEqual([{ perche: 'in uso o bloccata (EBUSY)', quanti: 1, esempi: ['x'] }])
  })

  it('lo storico degli errori: escono solo quelli vecchi di versioni passate', () => {
    const voci = [
      { versione: '0.84.4', ultima: new Date(ORA - 4 * GIORNO).toISOString(), m: 'ENAMETOOLONG' },
      { versione: '0.84.4', ultima: new Date(ORA - 3600_000).toISOString(), m: 'recente' },
      { versione: '0.88.0', ultima: new Date(ORA - 40 * GIORNO).toISOString(), m: 'di questa' }
    ]
    const r = compattaErrori(voci, '0.88.0', ORA)
    expect(r.tolte.map((v) => v.m)).toEqual(['ENAMETOOLONG'])
    expect(r.tenute.map((v) => v.m)).toEqual(['recente', 'di questa'])
  })

  it('la risposta del servizio si legge con prudenza', () => {
    expect(leggiEsitoServizio('x')).toBeUndefined()
    expect(leggiEsitoServizio({ rimandato: 'PC carico' })?.rimandato).toBe('PC carico')
    const e = leggiEsitoServizio({ fatti: ['a', 1], saltati: [{ cosa: 'b', perche: 'c' }, { cosa: 1 }], byteInRecupero: -5, sessioniTolte: ['s'] })
    expect(e).toMatchObject({ fatti: ['a'], saltati: [{ cosa: 'b', perche: 'c' }], byteInRecupero: 0, sessioniTolte: ['s'] })
  })
})

describe('riassetto: il recupero (mai cancellare)', () => {
  it('sposta con il manifesto, e «Annulla» rimette tutto com’era', () => {
    const dati = cartella()
    const a = file(join(dati, 'workspaces.prima-di-x.json'), '{"a":1}')
    mkdirSync(join(dati, 'unioni', 'sotto'), { recursive: true })
    file(join(dati, 'unioni', 'sotto', 'u.json'), 'u')
    invecchia(join(dati, 'unioni', 'sotto'), 30)
    invecchia(join(dati, 'unioni'), 30)
    const rec = apriRecuperoPasso({ dati, versione: '0.88.0', passo: 'file-di-stato', ora: () => ORA })
    const e1 = rec.sposta(a, { motivo: 'prova' })
    const e2 = rec.sposta(join(dati, 'unioni'), { motivo: 'dismessa' })
    expect(e1.esito).toBe('spostato')
    expect(e2.esito).toBe('spostato')
    expect(existsSync(a)).toBe(false)
    const m = manifesti(dati, '0.88.0')
    expect(m).toHaveLength(1)
    expect(m[0]!.manifesto.voci.map((v) => [v.origine, v.stato, v.motivo])).toEqual([[a, 'spostato', 'prova'], [join(dati, 'unioni'), 'spostato', 'dismessa']])
    expect(m[0]!.manifesto.scadeIl.slice(0, 10)).toBe('2026-12-05')
    // Una seconda volta: non c'è più niente.
    expect(rec.sposta(a, { motivo: 'prova' }).esito).toBe('non-c-era')
    const r = ripristinaRiassetto(dati, '0.88.0')
    expect(r).toEqual({ ripristinati: 2, nonRipristinati: [] })
    expect(readFileSync(a, 'utf8')).toBe('{"a":1}')
    expect(existsSync(join(dati, 'unioni', 'sotto', 'u.json'))).toBe(true)
  })

  it('non ripristina sopra una cosa nata al suo posto', () => {
    const dati = cartella()
    const a = file(join(dati, 'x.json'), 'vecchio')
    apriRecuperoPasso({ dati, versione: '0.88.0', passo: 'p', ora: () => ORA }).sposta(a, { motivo: 'prova' })
    writeFileSync(a, 'nuovo')
    const r = ripristinaRiassetto(dati, '0.88.0')
    expect(r.ripristinati).toBe(0)
    expect(r.nonRipristinati[0]).toContain('non lo sovrascrivo')
    expect(readFileSync(a, 'utf8')).toBe('nuovo')
  })

  it('salta quello toccato da poco, i collegamenti, le cartelle non vuote quando si vogliono vuote', () => {
    const dati = cartella()
    const giovane = file(join(dati, 'giovane.json'), 'g', 1)
    const fuori = cartella('sd-riassetto-fuori-')
    file(join(fuori, 'dentro.txt'), 'non toccarmi')
    const link = join(dati, 'collegamento')
    symlinkSync(fuori, link, 'junction')
    mkdirSync(join(dati, 'piena'))
    file(join(dati, 'piena', 'f.txt'))
    invecchia(join(dati, 'piena'), 30)
    const rec = apriRecuperoPasso({ dati, versione: '0.88.0', passo: 'p', ora: () => ORA })
    expect(rec.sposta(giovane, { motivo: 'x' })).toMatchObject({ esito: 'saltato', perche: 'toccata da poco' })
    expect(rec.sposta(link, { motivo: 'x' })).toMatchObject({ esito: 'saltato', perche: 'è un collegamento: non lo seguo' })
    expect(rec.sposta(join(dati, 'piena'), { motivo: 'x', soloSeVuota: true })).toMatchObject({ esito: 'saltato', perche: 'non è vuota' })
    expect(existsSync(join(fuori, 'dentro.txt'))).toBe(true)
  })

  it('una cosa in uso o bloccata si salta e il manifesto non la conta', () => {
    const dati = cartella()
    const a = file(join(dati, 'bloccato.json'))
    const rec = apriRecuperoPasso({
      dati, versione: '0.88.0', passo: 'p', ora: () => ORA,
      rinomina: () => { throw Object.assign(new Error('busy'), { code: 'EBUSY' }) }
    })
    expect(rec.sposta(a, { motivo: 'x' })).toMatchObject({ esito: 'saltato', perche: 'in uso o bloccata (EBUSY)' })
    expect(existsSync(a)).toBe(true)
    expect(rec.manifesto().voci).toEqual([])
  })

  it('un avvio interrotto fra il manifesto e la rinomina: al giro dopo si guarda dov’è davvero', () => {
    const dati = cartella()
    const a = file(join(dati, 'a.json'))
    const b = file(join(dati, 'b.json'))
    // La rinomina «muore» dopo aver spostato a: la riga resta in corso.
    let n = 0
    const rec = apriRecuperoPasso({
      dati, versione: '0.88.0', passo: 'p', ora: () => ORA,
      rinomina: (da, x) => {
        n += 1
        if (n === 1) { renameSync(da, x); throw Object.assign(new Error('crash'), { code: 'EIO' }) }
        throw Object.assign(new Error('crash'), { code: 'EIO' })
      }
    })
    rec.sposta(a, { motivo: 'x' })
    rec.sposta(b, { motivo: 'x' })
    // Simuliamo il manifesto lasciato in corso dal crash vero.
    const f = join(rec.cartella, 'manifesto.json')
    const m = JSON.parse(readFileSync(f, 'utf8')) as { voci: unknown[] }
    const dove = join(rec.cartella, '0001-a.json')
    writeFileSync(f, JSON.stringify({ ...m, voci: [{ origine: a, dove, byte: 1, motivo: 'x', tipo: 'file', quando: 'q', stato: 'in-corso' }, { origine: b, dove: join(rec.cartella, '0002-b.json'), byte: 1, motivo: 'x', tipo: 'file', quando: 'q', stato: 'in-corso' }] }))
    const dopo = apriRecuperoPasso({ dati, versione: '0.88.0', passo: 'p', ora: () => ORA })
    expect(dopo.manifesto().voci.map((v) => [v.origine, v.stato])).toEqual([[a, 'spostato']])
    expect(existsSync(b)).toBe(true)
    expect(dopo.sposta(b, { motivo: 'x' }).esito).toBe('spostato')
  })

  it('«Libera subito» e la scadenza dei 30 giorni passano dalla guardia, dopo aver staccato i collegamenti', () => {
    const dati = cartella()
    const fuori = cartella('sd-riassetto-fuori-')
    file(join(fuori, 'prezioso.txt'), 'resta')
    mkdirSync(join(dati, 'vecchia'))
    symlinkSync(fuori, join(dati, 'vecchia', 'link'), 'junction')
    file(join(dati, 'vecchia', 'f.txt'), 'via')
    invecchia(join(dati, 'vecchia'), 30)
    const rec = apriRecuperoPasso({ dati, versione: '0.88.0', passo: 'p', ora: () => ORA })
    expect(rec.sposta(join(dati, 'vecchia'), { motivo: 'x' }).esito).toBe('spostato')
    // Prima della scadenza non si tocca.
    expect(scadenzeRecuperoRiassetto(dati, ORA + 29 * GIORNO).passi).toBe(0)
    const e = scadenzeRecuperoRiassetto(dati, ORA + 31 * GIORNO)
    expect(e.passi).toBe(1)
    expect(e.errori).toEqual([])
    expect(existsSync(join(fuori, 'prezioso.txt'))).toBe(true)
    expect(readdirSync(join(dati, CARTELLA_RECUPERO_RIASSETTO))).toEqual([])
    // E «Libera subito» su un'altra versione.
    const altro = file(join(dati, 'y.json'))
    apriRecuperoPasso({ dati, versione: '0.89.0', passo: 'p', ora: () => ORA }).sposta(altro, { motivo: 'x' })
    const l = liberaRecuperoRiassetto(dati, '0.89.0')
    expect(l.byte).toBe(1)
    expect(existsSync(join(dati, CARTELLA_RECUPERO_RIASSETTO, '0.89.0'))).toBe(false)
  })
})

describe('riassetto: il motore (giornale, ripresa, percentuale)', () => {
  const passiDi = (fatti: string[], cose: string[], extra: Partial<Passo> = {}): Passo[] => [
    {
      id: 'uno', titolo: 'Uno', fase: 'A', peso: 1,
      esegui: (c) => {
        cose.forEach((x, i) => {
          if (c.fatto(x)) return
          fatti.push(x)
          c.segna(x)
          c.avanza((i + 1) / cose.length)
        })
      },
      ...extra
    },
    { id: 'due', titolo: 'Due', fase: 'B', peso: 3, esegui: (c) => { c.liberati(10) } }
  ]

  it('fa ogni passo una volta: un secondo giro non rifà niente', async () => {
    const dati = cartella()
    const fatti: string[] = []
    const percentuali: number[] = []
    const m = creaMotore({ dati, versione: '0.88.0', passi: passiDi(fatti, ['a', 'b']), ora: () => ORA, progresso: (p) => percentuali.push(p.percentuale) })
    m.eseguiFaseSincrona('A')
    await m.eseguiFase('B')
    expect(m.chiudiSeFinito()).toBe(true)
    expect(fatti).toEqual(['a', 'b'])
    expect(percentuali[0]).toBe(0)
    expect(percentuali).toContain(25)
    expect(percentuali.at(-1)).toBe(100)
    // Un altro motore sullo stesso giornale: niente da fare.
    const m2 = creaMotore({ dati, versione: '0.88.0', passi: passiDi(fatti, ['a', 'b']), ora: () => ORA })
    m2.eseguiFaseSincrona('A')
    await m2.eseguiFase('B')
    expect(fatti).toEqual(['a', 'b'])
    expect(caricaGiornale(dati)?.fatto).toBeDefined()
  })

  it('riprende da dove un avvio interrotto si era fermato', () => {
    const dati = cartella()
    const fatti: string[] = []
    let muori = true
    const passi = (): Passo[] => [{
      id: 'uno', titolo: 'Uno', fase: 'A', peso: 1,
      esegui: (c) => {
        for (const x of ['a', 'b', 'c']) {
          if (c.fatto(x)) continue
          if (x === 'c' && muori) throw new Error('il processo muore') // dopo a e b
          fatti.push(x)
          c.segna(x)
        }
      }
    }]
    // Simula il crash: l'eccezione esce dal passo prima che finisca.
    const m = creaMotore({ dati, versione: '0.88.0', passi: passi(), ora: () => ORA })
    const g0 = m.giornale()
    // Il crash vero non scrive «fatto»: lo si toglie a mano dal giornale.
    m.eseguiFaseSincrona('A')
    m.scrivi((g) => ({ ...g, passi: g.passi.map((p) => ({ ...p, stato: 'in-corso', errori: [] })) }))
    expect(g0.versione).toBe('0.88.0')
    muori = false
    const m2 = creaMotore({ dati, versione: '0.88.0', passi: passi(), ora: () => ORA })
    m2.eseguiFaseSincrona('A')
    expect(fatti).toEqual(['a', 'b', 'c'])
    expect(m2.giornale().passi[0]?.stato).toBe('fatto')
  })

  it('un passo rimandato resta da fare; uno che ferma tutto ferma anche i passi dopo', async () => {
    const dati = cartella()
    const fatti: string[] = []
    const m = creaMotore({
      dati, versione: '0.88.0', ora: () => ORA,
      passi: [
        { id: 'pc', titolo: 'PC', fase: 'B', peso: 1, esegui: () => { throw new RimandaPasso('PC carico') } },
        { id: 'dopo', titolo: 'Dopo', fase: 'B', peso: 1, esegui: () => { fatti.push('dopo') } },
        { id: 'spazio', titolo: 'Spazio', fase: 'A', peso: 1, esegui: () => { throw new RimandaPasso('poco spazio', true) } },
        { id: 'mai', titolo: 'Mai', fase: 'A', peso: 1, esegui: () => { fatti.push('mai') } }
      ]
    })
    const a = m.eseguiFaseSincrona('A')
    expect(a.fermo).toBe('poco spazio')
    expect(m.progresso().fermoPerche).toBe('poco spazio')
    expect(fatti).toEqual([])
    const b = await m.eseguiFase('B')
    expect(b.rimandati).toEqual(['pc'])
    expect(fatti).toEqual(['dopo'])
    expect(m.giornale().passi.find((p) => p.id === 'pc')?.stato).toBe('rimandato')
    expect(m.chiudiSeFinito()).toBe(false)
  })

  it('un errore si annota e non ferma gli altri passi; un passo asincrono nella fase A è un errore', () => {
    const dati = cartella()
    const m = creaMotore({
      dati, versione: '0.88.0', ora: () => ORA,
      passi: [
        { id: 'rotto', titolo: 'Rotto', fase: 'A', peso: 1, esegui: () => { throw new Error('boh') } },
        { id: 'asinc', titolo: 'Asinc', fase: 'A', peso: 1, esegui: async () => undefined },
        passoDaFunzione({ id: 'agg', titolo: 'Aggiunto', fase: 'A', fai: () => 'fatto' })
      ]
    })
    m.eseguiFaseSincrona('A')
    const g = m.giornale()
    expect(g.passi.map((p) => [p.id, p.stato])).toEqual([['rotto', 'fatto'], ['asinc', 'fatto'], ['agg', 'fatto']])
    expect(g.passi[0]?.errori).toEqual(['boh'])
    expect(g.passi[1]?.errori[0]).toContain('asincrono')
  })
})

/** Una cartella dei dati come la lascia la 0.87: copia di versione appena fatta e i resti dei mesi. */
function datiDaRiassettare(): string {
  const dati = cartella()
  file(join(dati, 'workspaces.json'), '{"versione":1}', 0)
  file(join(dati, 'workspaces.prima-dei-progetti.json'), '{"vecchia":1}', 20)
  file(join(dati, 'workspaces.prima-dell-aggiornamento.json'), '{"recente":1}', 1)
  file(join(dati, 'sync-manifesto.precedente-20260908-143615.json'), '{}', 50)
  file(join(dati, 'cassaforte.messa-da-parte-20260908-143615.json'), '{}', 50)
  file(join(dati, 'workspaces.json.bak-recupero'), '{}', 60)
  file(join(dati, 'migrazione-una-casa.json'), '{}', 30)
  file(join(dati, 'unioni', 'u.json'), 'u', 20)
  invecchia(join(dati, 'unioni'), 20)
  file(join(dati, 'scambio', 'dal-telefono.txt'), 't', 60)
  invecchia(join(dati, 'scambio'), 60)
  file(join(dati, 'provider.json'), '{}', 20)
  file(join(dati, 'destinazioni.json'), '{}', 20)
  file(join(dati, 'modifiche', 'srv', 'pagina.php'), 'p', 20)
  invecchia(join(dati, 'modifiche', 'srv'), 20)
  invecchia(join(dati, 'modifiche'), 20)
  file(join(dati, 'recupero-riordino', 'ospite-1', 'grosso.bin'), 'g'.repeat(1000), 5)
  invecchia(join(dati, 'recupero-riordino', 'ospite-1'), 5)
  invecchia(join(dati, 'recupero-riordino'), 5)
  mkdirSync(join(dati, 'workspaces-recupero-cartelle', 'vuota'), { recursive: true })
  invecchia(join(dati, 'workspaces-recupero-cartelle', 'vuota'), 20)
  file(join(dati, 'recupero-progetti', 'elenco.json'), JSON.stringify([{ id: 'nota-1', dove: join(dati, 'recupero-progetti', 'nota-1') }]), 20)
  file(join(dati, 'recupero-progetti', 'nota-1', 'f.txt'), 'f', 20)
  file(join(dati, 'recupero-progetti', 'collaudo-orfano', 'f.txt'), 'f', 20)
  invecchia(join(dati, 'recupero-progetti', 'collaudo-orfano'), 20)
  file(join(dati, 'versione-installata.json'), JSON.stringify({ versione: '0.87.0', quando: new Date(ORA - 30 * GIORNO).toISOString() }), 30)
  // Copie di versione vecchie (oltre le tre da tenere) e quella dell'aggiornamento.
  for (const n of ['0.84.2-20261023-064430', '0.84.3-20261023-150947', '0.84.4-20261027-135328']) file(join(dati, 'copie-di-versione', n, 'workspaces.json'), '{}', 10)
  const copia = mettiAlSicuroLoStato(dati, '0.88.0', new Date(ORA))
  expect(copia.fatta).toBe(true)
  return dati
}

function servizioFinto(chiamate: string[], esiti: Partial<Record<PassoDelServizio, EsitoPassoServizio>> = {}): (p: PassoDelServizio) => Promise<EsitoPassoServizio> {
  return async (p) => {
    chiamate.push(p)
    return esiti[p] ?? { fatti: [], saltati: [], errori: [], proposte: [], byteLiberati: 0, byteInRecupero: 0 }
  }
}

describe('riassetto: i passi del programma su una cartella dei dati finta', () => {
  it('fase A: file di scorta, cartelle dismesse, recupero del riordino, copie in eccesso; poi la fase B', async () => {
    const dati = datiDaRiassettare()
    const chiamate: string[] = []
    const tolte: string[] = []
    const r = creaRiassetto({
      dati, versione: '0.88.0', copia: { fatta: true, da: '0.87.0' }, log: () => undefined, ora: () => ORA,
      spazioLibero: () => 10 * 1024 * 1024 * 1024,
      servizio: servizioFinto(chiamate, { trascrizioni: { fatti: ['t'], saltati: [], errori: [], proposte: [], byteLiberati: 0, byteInRecupero: 2048, sessioniTolte: ['s1'] } }),
      pulisciIndice: (s) => { tolte.push(...s); return 100 },
      svuotaCache: async () => 5000,
      aspetta: async () => undefined
    })
    expect(r.attivo).toBe(true)
    r.faseA()
    // Spostati: i vecchi file di scorta (presenti nella copia di versione), le dismesse, il riordino.
    expect(existsSync(join(dati, 'workspaces.prima-dei-progetti.json'))).toBe(false)
    expect(existsSync(join(dati, 'sync-manifesto.precedente-20260908-143615.json'))).toBe(false)
    expect(existsSync(join(dati, 'workspaces.json.bak-recupero'))).toBe(false)
    expect(existsSync(join(dati, 'unioni'))).toBe(false)
    expect(existsSync(join(dati, 'scambio'))).toBe(false)
    expect(existsSync(join(dati, 'provider.json'))).toBe(false)
    expect(existsSync(join(dati, 'destinazioni.json'))).toBe(false)
    expect(existsSync(join(dati, 'modifiche'))).toBe(false)
    expect(existsSync(join(dati, 'recupero-riordino'))).toBe(false)
    expect(existsSync(join(dati, 'workspaces-recupero-cartelle', 'vuota'))).toBe(false)
    expect(existsSync(join(dati, 'recupero-progetti', 'collaudo-orfano'))).toBe(false)
    // Restano: quello recente, quello nell'elenco, il segno di migrazione (il suo codice c'è ancora), lo stato vero.
    expect(existsSync(join(dati, 'workspaces.prima-dell-aggiornamento.json'))).toBe(true)
    expect(existsSync(join(dati, 'recupero-progetti', 'nota-1'))).toBe(true)
    expect(existsSync(join(dati, 'migrazione-una-casa.json'))).toBe(true)
    expect(existsSync(join(dati, 'workspaces.json'))).toBe(true)
    // Le copie di versione: le tre più recenti, quella appena fatta compresa.
    expect(readdirSync(join(dati, 'copie-di-versione'))).toHaveLength(3)
    expect(r.stato()?.progresso.finito).toBe(false)
    await r.faseB()
    expect(chiamate).toEqual(['consegne', 'worktree', 'trascrizioni', 'errori'])
    expect(tolte).toEqual(['s1'])
    const s = r.stato()
    expect(s?.progresso.percentuale).toBe(100)
    expect(s?.riepilogo?.byteLiberati).toBe(5100)
    expect(s?.riepilogo?.passi.every((p) => p.stato === 'fatto')).toBe(true)
    // Il riepilogo pesa quello che c'è davvero nel recupero.
    expect(s?.riepilogo?.byteInRecupero).toBeGreaterThanOrEqual(1000)

    // Un avvio dopo: non gira più.
    const r2 = creaRiassetto({ dati, versione: '0.88.0', copia: { fatta: false, da: '0.88.0' }, log: () => undefined })
    expect(r2.attivo).toBe(false)
    expect(r2.stato()?.riepilogo).toBeDefined()

    // «Annulla»: tutto torna.
    const a = r2.annulla()
    expect(a.ok).toBe(true)
    expect(existsSync(join(dati, 'recupero-riordino', 'ospite-1', 'grosso.bin'))).toBe(true)
    expect(existsSync(join(dati, 'unioni', 'u.json'))).toBe(true)
    expect(existsSync(join(dati, 'scambio', 'dal-telefono.txt'))).toBe(true)
    expect(existsSync(join(dati, 'modifiche', 'srv', 'pagina.php'))).toBe(true)
    expect(existsSync(join(dati, 'workspaces.prima-dei-progetti.json'))).toBe(true)
    expect(r2.stato()?.annullato).toBe(true)
    expect(r2.annulla().ok).toBe(false)
    r2.chiudi()
    expect(r2.stato()?.chiuso).toBe(true)
  })

  it('i segni di migrazione si spostano solo se chi integra dice che il codice non c’è più', () => {
    const dati = datiDaRiassettare()
    const r = creaRiassetto({
      dati, versione: '0.88.0', copia: { fatta: true, da: '0.87.0' }, log: () => undefined, ora: () => ORA,
      spazioLibero: () => 10 * 1024 * 1024 * 1024, marcatoriSenzaCodice: ['migrazione-una-casa.json']
    })
    r.faseA()
    expect(existsSync(join(dati, 'migrazione-una-casa.json'))).toBe(false)
  })

  it('senza spazio o senza copia di versione si ferma e riprova al prossimo avvio', () => {
    const dati = datiDaRiassettare()
    const r = creaRiassetto({ dati, versione: '0.88.0', copia: { fatta: true, da: '0.87.0' }, log: () => undefined, ora: () => ORA, spazioLibero: () => 1024 })
    r.faseA()
    expect(r.stato()?.progresso.fermoPerche).toContain('spazio libero')
    expect(existsSync(join(dati, 'recupero-riordino'))).toBe(true)
    // Al prossimo avvio (nessuna copia nuova) riprende.
    const r2 = creaRiassetto({ dati, versione: '0.88.0', copia: { fatta: false, da: '0.88.0' }, log: () => undefined, ora: () => ORA, spazioLibero: () => 10 * 1024 * 1024 * 1024 })
    expect(r2.attivo).toBe(true)
    r2.faseA()
    expect(existsSync(join(dati, 'recupero-riordino'))).toBe(false)
    // Senza la copia di versione: fermo.
    const vuota = cartella()
    file(join(vuota, 'versione-installata.json'), JSON.stringify({ versione: '0.88.0', quando: 'x', precedente: '0.87.0' }), 0)
    expect(copiaDiVersionePresente(vuota, '0.88.0')).toBe(false)
    const r3 = creaRiassetto({ dati: vuota, versione: '0.88.0', copia: { fatta: true, da: '0.87.0' }, log: () => undefined, spazioLibero: () => 10 * 1024 * 1024 * 1024 })
    r3.faseA()
    expect(r3.stato()?.progresso.fermoPerche).toContain('copia di versione')
  })

  it('la fase B riprova quando il servizio rimanda (PC carico), poi lascia al prossimo avvio', async () => {
    const dati = datiDaRiassettare()
    let volte = 0
    const r = creaRiassetto({
      dati, versione: '0.88.0', copia: { fatta: true, da: '0.87.0' }, log: () => undefined, ora: () => ORA,
      spazioLibero: () => 10 * 1024 * 1024 * 1024, tentativiB: 3, aspetta: async () => undefined,
      servizio: async () => { volte += 1; return { fatti: [], saltati: [], errori: [], proposte: [], byteLiberati: 0, byteInRecupero: 0, rimandato: 'PC carico' } }
    })
    r.faseA()
    await r.faseB()
    // Quattro passi del servizio, tre tentativi.
    expect(volte).toBe(12)
    expect(r.stato()?.progresso.finito).toBe(false)
    expect(caricaGiornale(dati)?.passi.find((p) => p.id === 'worktree')?.rimandatoPerche).toBe('PC carico')
  })

  it('«Libera subito» svuota il recupero e poi «Annulla» non c’è più', async () => {
    const dati = datiDaRiassettare()
    const r = creaRiassetto({
      dati, versione: '0.88.0', copia: { fatta: true, da: '0.87.0' }, log: () => undefined, ora: () => ORA,
      spazioLibero: () => 10 * 1024 * 1024 * 1024, servizio: servizioFinto([]), aspetta: async () => undefined
    })
    r.faseA()
    await r.faseB()
    const l = r.liberaSubito()
    expect(l.ok).toBe(true)
    expect(existsSync(join(dati, CARTELLA_RECUPERO_RIASSETTO, '0.88.0'))).toBe(false)
    expect(r.stato()?.liberato).toBe(true)
    expect(r.annulla().ok).toBe(false)
  })
})

describe('riassetto: il quaderno', () => {
  it('fuori da git: via le copie identiche, poi il riordino se le note sono troppe; dentro git: solo una proposta', async () => {
    const dati = datiDaRiassettare()
    const libero = cartella('sd-progetto-libero-')
    const tracciato = cartella('sd-progetto-git-')
    for (const p of [libero, tracciato]) {
      const q = join(p, '.sierradeck', 'quaderno')
      for (let i = 0; i < 45; i += 1) file(join(q, `nota-${i}.md`), `# nota ${i}`, 10)
      file(join(q, 'nota-1-2.md'), '# nota 1', 10)
      file(join(q, 'nota-3-2.md'), '# diversa', 10)
      file(join(q, 'lezioni.md'), '# lezioni', 10)
    }
    const q = join(libero, '.sierradeck', 'quaderno')
    expect(doppioniIdentici(q, noteDelQuaderno(q))).toEqual([{ copia: 'nota-1-2.md', di: 'nota-1.md' }])
    const riordinati: string[] = []
    const r = creaRiassetto({
      dati, versione: '0.88.0', copia: { fatta: true, da: '0.87.0' }, log: () => undefined, ora: () => ORA,
      spazioLibero: () => 10 * 1024 * 1024 * 1024, servizio: servizioFinto([]), aspetta: async () => undefined,
      progetti: async () => [libero, tracciato],
      git: async (args, cwd) => (args[0] === 'ls-files' && cwd === tracciato ? { codice: 0, uscita: '.sierradeck/quaderno/nota-1.md\n' } : { codice: 128, uscita: 'not a git repository' }),
      riordinaQuaderno: (cwd) => { riordinati.push(cwd); return { ok: true, spostate: 45, messaggio: 'fatto' } }
    })
    r.faseA()
    await r.faseB()
    expect(existsSync(join(q, 'nota-1-2.md'))).toBe(false)
    expect(existsSync(join(q, 'nota-3-2.md'))).toBe(true)
    expect(riordinati).toEqual([libero])
    expect(existsSync(join(tracciato, '.sierradeck', 'quaderno', 'nota-1-2.md'))).toBe(true)
    expect(r.stato()?.riepilogo?.proposte[0]).toContain('è nel repository')
  })
})

describe('riassetto: i passi di chi integra', () => {
  it('entrano dopo quelli della loro fase', () => {
    const passi = costruisciPassi({
      copiaDiVersione: () => true,
      passiAggiunti: [
        passoDaFunzione({ id: 'proprietari', titolo: 'Proprietari', fase: 'A', fai: () => undefined }),
        passoDaFunzione({ id: 'vecchi-autopiloti', titolo: 'Vecchi autopiloti', fase: 'B', fai: () => undefined })
      ]
    })
    const ids = passi.map((p) => p.id)
    expect(ids.indexOf('proprietari')).toBeGreaterThan(ids.indexOf('errori-programma'))
    expect(ids.indexOf('proprietari')).toBeLessThan(ids.indexOf('consegne'))
    expect(ids.at(-1)).toBe('vecchi-autopiloti')
  })
})
