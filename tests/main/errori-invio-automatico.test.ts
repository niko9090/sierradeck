import { describe, it, expect } from 'vitest'
import { ATTESA_MASSIMA_MS, INTERVALLO_MIN_MS, QUIETE_INVIO_MS, decidiInvio, giroInvioErrori, pcSviluppoDi, vistaErrori, vociDaInviare, vociNuove, type StatoInvio } from '../../src/main/errori-invio-automatico'
import { leggiInvioErrori, type StoricoErrori, type VoceErrore } from '@shared/storico-errori'

const T0 = Date.parse('2026-10-30T10:00:00.000Z')
const voce = (ultima: string, messaggio = 'boom'): VoceErrore => ({ quando: ultima, ultima, dove: 'pc', volte: 1, messaggio })

type Esito = { ok: boolean; messaggio: string; quante?: number }

function prova(over: { storico?: () => StoricoErrori; adesso?: () => number; esiti?: Esito[]; eSviluppo?: boolean; pc?: string | undefined; stato?: StatoInvio } = {}) {
  const c = { stato: over.stato as StatoInvio | undefined, mandati: [] as StoricoErrori[], tempo: T0, scritture: 0 }
  const esiti = over.esiti ?? []
  const d = {
    storico: over.storico ?? ((): StoricoErrori => ({ voci: [] })),
    stato: { leggi: () => c.stato, scrivi: (s: StatoInvio) => { c.stato = s; c.scritture += 1 } },
    pcSviluppo: () => ('pc' in over ? over.pc : 'pc-fisso'),
    eSviluppo: () => over.eSviluppo === true,
    adesso: over.adesso ?? (() => c.tempo),
    manda: async (s: StoricoErrori): Promise<Esito> => { c.mandati.push(s); return esiti.shift() ?? { ok: true, messaggio: 'Mandati' } },
    log: () => undefined
  }
  return { c, d }
}

describe('l’invio automatico degli errori (0.88.4, 0.95.5)', () => {
  it('manda solo gli errori non ancora inviati, dopo una breve quiete, mai troppo spesso', () => {
    const s: StoricoErrori = { voci: [voce('2026-10-30T08:00:00.000Z', 'vecchio'), voce('2026-10-30T09:50:00.000Z', 'nuovo')] }
    const nuove = vociNuove(s, '2026-10-30T09:00:00.000Z')
    expect(nuove.map((v) => v.messaggio)).toEqual(['nuovo'])
    const ultima = Date.parse('2026-10-30T09:50:00.000Z')
    expect(QUIETE_INVIO_MS).toBeLessThanOrEqual(2 * 60_000)
    expect(decidiInvio({ nuove, stato: {}, adesso: ultima + QUIETE_INVIO_MS - 1, pcSviluppo: 'pc-1' }).manda).toBe(false)
    expect(decidiInvio({ nuove, stato: {}, adesso: ultima + QUIETE_INVIO_MS, pcSviluppo: 'pc-1' })).toEqual({ manda: true, fino: '2026-10-30T09:50:00.000Z' })
    expect(decidiInvio({ nuove, stato: { il: new Date(T0 - INTERVALLO_MIN_MS + 1).toISOString() }, adesso: T0, pcSviluppo: 'pc-1' }).manda).toBe(false)
    expect(decidiInvio({ nuove, stato: {}, adesso: T0, pcSviluppo: undefined }).manda).toBe(false)
    expect(decidiInvio({ nuove: [], stato: {}, adesso: T0, pcSviluppo: 'pc-1' }).manda).toBe(false)
  })

  it('un errore che si ripete ogni pochi minuti parte lo stesso dopo l’attesa massima (0.88.8)', () => {
    const nuove: VoceErrore[] = [{ ...voce('2026-10-30T09:59:00.000Z', 'turno non riuscito'), quando: '2026-10-30T09:00:00.000Z', volte: 30 }]
    const stato: StatoInvio = { il: '2026-10-30T08:00:00.000Z' }
    const da = Date.parse('2026-10-30T09:00:00.000Z')
    expect(decidiInvio({ nuove, stato, adesso: da + ATTESA_MASSIMA_MS - 1, pcSviluppo: 'pc-1' }).manda).toBe(false)
    expect(decidiInvio({ nuove, stato, adesso: da + ATTESA_MASSIMA_MS, pcSviluppo: 'pc-1' }).manda).toBe(true)
  })

  it('il PC di sviluppo: quello scelto, o il proprietario di SierraDeck', () => {
    const progetti = [{ nome: 'GLOS', proprietario: 'pc-2' }, { nome: 'SierraDeck', proprietario: 'pc-fisso' }]
    expect(pcSviluppoDi('pc-scelto', progetti)).toBe('pc-scelto')
    expect(pcSviluppoDi(undefined, progetti)).toBe('pc-fisso')
    expect(pcSviluppoDi(undefined, [{ nome: 'GLOS' }])).toBeUndefined()
  })

  it('invio automatico: la prima volta parte da un giorno fa, e manda da solo gli errori nuovi', async () => {
    const { c, d } = prova({ storico: () => ({ voci: [voce('2026-10-20T08:00:00.000Z', 'di dieci giorni fa'), voce('2026-10-30T09:00:00.000Z', 'di oggi')] }) })
    const e = await giroInvioErrori(d)
    expect(e.ok).toBe(true)
    expect(c.mandati).toHaveLength(1)
    expect(c.mandati[0]?.voci.map((v) => v.messaggio)).toEqual(['di oggi'])
  })

  it('segnato inviato: ogni voce ricorda conteggio e data, e non si rimanda (niente doppioni)', async () => {
    const { c, d } = prova({ storico: () => ({ voci: [voce('2026-10-30T09:00:00.000Z', 'di oggi')] }) })
    await giroInvioErrori(d)
    expect(c.stato?.il).toBe(new Date(T0).toISOString())
    expect(Object.values(c.stato?.inviati ?? {})).toEqual([{ volte: 1, il: new Date(T0).toISOString() }])
    c.tempo = T0 + 60 * 60_000
    await giroInvioErrori(d)
    await giroInvioErrori({ ...d, forza: true })
    expect(c.mandati).toHaveLength(1)
  })

  it('sparisce dalla lista: le voci inviate vanno sotto «già inviati», con la data', async () => {
    const storico: StoricoErrori = { voci: [voce('2026-10-30T09:00:00.000Z', 'mandato'), voce('2026-10-30T09:30:00.000Z', 'altro')] }
    const { c, d } = prova({ storico: () => ({ voci: [storico.voci[0] as VoceErrore] }) })
    await giroInvioErrori(d)
    const vista = vistaErrori(storico, c.stato)
    expect(vista.voci.map((v) => v.messaggio)).toEqual(['altro'])
    expect(vista.inviate.map((v) => [v.messaggio, v.inviatoIl])).toEqual([['mandato', new Date(T0).toISOString()]])
    // Senza stato (mai mandato niente) tutto resta in lista.
    expect(vistaErrori(storico, undefined).voci).toHaveLength(2)
  })

  it('se la stessa voce si ripete dopo l’invio, si manda solo il nuovo conteggio', async () => {
    let volte = 3
    const { c, d } = prova({ storico: () => ({ voci: [{ ...voce('2026-10-30T09:00:00.000Z', 'ripetuto'), volte, ultima: volte === 3 ? '2026-10-30T09:00:00.000Z' : '2026-10-30T10:30:00.000Z' }] }) })
    await giroInvioErrori(d)
    expect(c.mandati[0]?.voci[0]?.volte).toBe(3)
    volte = 5
    c.tempo = T0 + 2 * 60 * 60_000
    await giroInvioErrori(d)
    expect(c.mandati).toHaveLength(2)
    expect(c.mandati[1]?.voci[0]?.volte).toBe(2)
    expect(Object.values(c.stato?.inviati ?? {})[0]?.volte).toBe(5)
    // Nella lista, prima dell’invio, compare con le sole volte nuove.
    const vista = vistaErrori({ voci: [{ ...voce('2026-10-30T10:30:00.000Z', 'ripetuto'), quando: '2026-10-30T09:00:00.000Z', volte: 7 }] }, c.stato)
    expect(vista.voci.map((v) => v.volte)).toEqual([2])
    expect(vistaErrori({ voci: [{ ...voce('2026-10-30T09:00:00.000Z', 'ripetuto'), volte: 5 }] }, c.stato).voci).toEqual([])
  })

  it('nuovo tentativo: se il PC di sviluppo non risponde non si segna niente e si riprova con gli stessi errori', async () => {
    const { c, d } = prova({ storico: () => ({ voci: [voce('2026-10-30T09:00:00.000Z', 'di oggi')] }), esiti: [{ ok: false, messaggio: 'Drive spento' }] })
    const e1 = await giroInvioErrori(d)
    expect(e1.ok).toBe(false)
    expect(c.stato?.inviati).toBeUndefined()
    expect(c.stato?.il).toBeUndefined()
    c.tempo = T0 + 60_000
    const e2 = await giroInvioErrori(d)
    expect(e2.ok).toBe(true)
    expect(c.mandati.map((s) => s.voci.map((v) => v.messaggio))).toEqual([['di oggi'], ['di oggi']])
    expect(Object.keys(c.stato?.inviati ?? {})).toHaveLength(1)
  })

  it('se il tetto di peso lascia fuori delle voci, quelle restano da mandare', async () => {
    const storico: StoricoErrori = { voci: [voce('2026-10-30T09:30:00.000Z', 'recente'), voce('2026-10-30T09:00:00.000Z', 'più vecchia')] }
    const { c, d } = prova({ storico: () => storico, esiti: [{ ok: true, messaggio: 'Mandati', quante: 1 }] })
    await giroInvioErrori(d)
    expect(vistaErrori(storico, c.stato).voci.map((v) => v.messaggio)).toEqual(['più vecchia'])
  })

  it('aspetta la quiete: con un errore appena successo non parte, con «forza» sì', async () => {
    const { c, d } = prova({ storico: () => ({ voci: [voce(new Date(T0 - 1000).toISOString(), 'appena')] }), stato: { fino: '2026-10-29T00:00:00.000Z' } })
    await giroInvioErrori(d)
    expect(c.mandati).toHaveLength(0)
    await giroInvioErrori({ ...d, forza: true })
    expect(c.mandati).toHaveLength(1)
  })

  it('il PC di sviluppo non manda a se stesso, e senza PC di sviluppo non parte niente', async () => {
    const storico = (): StoricoErrori => ({ voci: [voce('2026-10-30T09:00:00.000Z', 'di oggi')] })
    const a = prova({ storico, eSviluppo: true })
    expect((await giroInvioErrori({ ...a.d, forza: true })).ok).toBe(true)
    expect(a.c.mandati).toHaveLength(0)
    expect(a.c.stato).toBeUndefined()
    const b = prova({ storico, pc: undefined })
    expect((await giroInvioErrori(b.d)).ok).toBe(false)
    expect(b.c.mandati).toHaveLength(0)
  })

  it('stato di prima (solo «fino» e «il»): niente doppioni, le voci già coperte vanno fra le inviate', () => {
    const stato: StatoInvio = { fino: '2026-10-30T09:00:00.000Z', il: '2026-10-30T09:05:00.000Z' }
    const storico: StoricoErrori = { voci: [voce('2026-10-30T09:30:00.000Z', 'dopo'), voce('2026-10-30T08:00:00.000Z', 'prima')] }
    expect(vociDaInviare(storico, stato).map((x) => x.voce.messaggio)).toEqual(['dopo'])
    expect(vistaErrori(storico, stato).inviate.map((v) => v.messaggio)).toEqual(['prima'])
  })

  it('il ricevente accetta ancora il formato di prima: voci senza «ultima» né «volte»', () => {
    const vecchio = { da: 'PC vecchio', voci: [{ quando: '2026-10-01T10:00:00.000Z', messaggio: 'errore di una versione vecchia' }] }
    const r = leggiInvioErrori(vecchio)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.invio.voci[0]).toMatchObject({ messaggio: 'errore di una versione vecchia', volte: 1, ultima: '2026-10-01T10:00:00.000Z' })
  })
})
