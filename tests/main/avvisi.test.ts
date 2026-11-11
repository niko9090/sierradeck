import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { AVVISI_TENUTI, apriAvvisi } from '../../src/main/avvisi'
import { bozzaDomanda, bozzaFatto, bozzaFile, bozzaProva } from '@shared/avvisi-telefono'

/** Un orologio a mano e dei timer a mano: le attese scattano quando lo dice la prova. */
function banco(file?: string) {
  let ora = new Date(2026, 10, 11, 12, 0, 0).getTime()
  const righe: string[] = []
  const timer: { a: number; f: () => void; vivo: boolean }[] = []
  const registro = apriAvvisi({
    ...(file !== undefined ? { file } : {}),
    adesso: () => ora,
    log: (r) => righe.push(r),
    dopo: (ms, f) => { const t = { a: ora + ms, f, vivo: true }; timer.push(t); return () => { t.vivo = false } }
  })
  const avanti = (ms: number): void => {
    ora += ms
    for (const t of timer) if (t.vivo && t.a <= ora) { t.vivo = false; t.f() }
  }
  return { registro, righe, avanti }
}

const domanda = (id: string) => bozzaDomanda({ cosa: 'domanda', id, workspace: 'Negozio', domanda: `Domanda ${id}?`, scelte: [{ scelta: 'Sì', consigliata: true }, { scelta: 'No' }] })

describe('il registro degli avvisi', () => {
  it('ogni nascita e ogni chiusura ha un numero nuovo; lo stesso id non nasce due volte', () => {
    const { registro, righe } = banco()
    const a = registro.nasce(domanda('d-1'))
    expect(a).toMatchObject({ n: 1, id: 'domanda:d-1', suona: true })
    expect(registro.nasce(domanda('d-1'))).toBeUndefined()
    const c = registro.chiudi('domanda:d-1', 'programma', ' Sì ')
    expect(c).toMatchObject({ n: 2, id: 'domanda:d-1', suona: false, chiuso: { come: 'programma', testo: 'Sì' } })
    expect(registro.chiudi('domanda:d-1', 'risposta')).toBeUndefined()
    expect(registro.chiudi('domanda:mai', 'risposta')).toBeUndefined()
    expect(registro.ultimo()).toBe(2)
    expect(righe).toEqual([
      '[avviso] nato n=1 domanda «Negozio chiede»: Domanda d-1? (suona)',
      '[avviso] chiuso n=2 domanda «Negozio chiede»: programma («Sì»)'
    ])
  })

  it('i fatti del servizio: la domanda nasce, la chiusura la chiude', () => {
    const { registro } = banco()
    registro.fatto({ cosa: 'domanda', id: 'd-1', workspace: 'Negozio', domanda: 'Vado?' })
    expect(registro.aperti('domanda:').map((a) => a.id)).toEqual(['domanda:d-1'])
    registro.fatto({ cosa: 'domanda-chiusa', id: 'd-1', come: 'risposta', testo: 'Sì' })
    expect(registro.aperti()).toEqual([])
    expect(registro.ha('domanda:d-1')).toBe(true)
  })

  it('due avvisi a meno di 20 secondi fanno un suono solo', () => {
    const { registro, avanti } = banco()
    expect(registro.nasce(domanda('a'))?.suona).toBe(true)
    avanti(5_000)
    expect(registro.nasce(domanda('b'))?.suona).toBe(false)
    avanti(20_000)
    expect(registro.nasce(domanda('c'))?.suona).toBe(true)
  })

  it('le impostazioni filtrano alla fonte: spenta non nasce, silenziosa non suona', () => {
    const { registro, righe } = banco()
    registro.imposta({ tipi: { domanda: 'silenziosa', fatto: 'spenta' } })
    expect(registro.nasce(domanda('a'))?.suona).toBe(false)
    expect(registro.nasce(bozzaFatto({ cosa: 'fatto', id: 'f', workspace: 'w', titolo: 'Fatta: una cosa' }))).toBeUndefined()
    expect(registro.ha('fatto:f')).toBe(false)
    // La prova suona comunque.
    expect(registro.nasce(bozzaProva(new Date(0)))?.suona).toBe(true)
    expect(righe[0]).toBe('[avviso] impostazioni: domanda silenziosa, fermo suona, fatto spenta, sapere silenziosa, chat ferma no, silenzio no')
    // Le stesse impostazioni non riscrivono niente.
    registro.imposta({ tipi: { domanda: 'silenziosa' } })
    expect(righe.filter((r) => r.includes('impostazioni'))).toHaveLength(1)
  })

  it('chi è al numero N riceve solo il dopo; chi parte da zero solo le domande aperte', () => {
    const { registro } = banco()
    registro.nasce(domanda('a'))
    registro.nasce(bozzaFatto({ cosa: 'fatto', id: 'f', workspace: 'w', titolo: 'Fatta: x' }))
    registro.nasce(domanda('b'))
    registro.chiudi('domanda:a', 'risposta')
    expect(registro.dopo(2).map((a) => [a.n, a.id])).toEqual([[3, 'domanda:b'], [4, 'domanda:a']])
    expect(registro.dopo(0).map((a) => a.id)).toEqual(['domanda:b'])
    expect(registro.ultimi(2).map((a) => a.n)).toEqual([4, 3])
  })

  it('l’attesa lunga risponde alla nascita, non prima; scaduta, risponde vuoto', async () => {
    const { registro, avanti } = banco()
    registro.nasce(domanda('a'))
    const subito = registro.attendi(0, 50_000)
    expect((await subito.promessa).map((a) => a.id)).toEqual(['domanda:a'])

    const attesa = registro.attendi(1, 50_000)
    let arrivati: unknown
    void attesa.promessa.then((x) => { arrivati = x })
    avanti(10_000)
    await Promise.resolve()
    expect(arrivati).toBeUndefined()
    expect(registro.inAttesa()).toBe(1)
    registro.nasce(domanda('b'))
    expect((await attesa.promessa).map((a) => a.id)).toEqual(['domanda:b'])
    expect(registro.inAttesa()).toBe(0)

    const vuota = registro.attendi(2, 50_000)
    avanti(50_000)
    expect(await vuota.promessa).toEqual([])

    const lasciata = registro.attendi(2, 50_000)
    lasciata.lascia()
    expect(await lasciata.promessa).toEqual([])
    expect(registro.inAttesa()).toBe(0)
  })

  it('da capo, senza domande aperte: il primo avviso che non è una domanda sveglia l’attesa (11/11)', async () => {
    const { registro } = banco()
    // Telefono appena aggiornato o accoppiato: chiede avvisi=0 e non c’è niente di aperto.
    const attesa = registro.attendi(0, 50_000)
    expect(registro.inAttesa()).toBe(1)
    registro.nasce(bozzaProva(new Date(0)))
    expect((await attesa.promessa).map((x) => x.tipo)).toEqual(['sapere'])
    expect(registro.inAttesa()).toBe(0)
  })

  it('da capo con registro già pieno: aspetta solo quello che nasce dopo, non la storia', async () => {
    const { registro } = banco()
    registro.nasce(bozzaProva(new Date(1)))
    registro.nasce(bozzaProva(new Date(2)))
    const attesa = registro.attendi(0, 50_000)
    registro.nasce(bozzaProva(new Date(3)))
    expect((await attesa.promessa).map((x) => x.n)).toEqual([3])
  })

  it('un file per un telefono sveglia solo lui', async () => {
    const { registro } = banco()
    const altro = registro.attendi(0, 50_000, { per: 'tel:b' })
    const suo = registro.attendi(0, 50_000, { per: 'tel:a' })
    // Da capo si mandano solo le domande: il file arriva a chi è già in pari.
    altro.lascia(); suo.lascia()
    registro.nasce(domanda('x'))
    const b = registro.attendi(1, 50_000, { per: 'tel:b' })
    const a = registro.attendi(1, 50_000, { per: 'tel:a' })
    registro.nasce(bozzaFile({ id: 'f1', nome: 'foto.png', per: 'tel:a' }))
    expect((await a.promessa).map((x) => x.id)).toEqual(['file:f1'])
    expect(registro.inAttesa()).toBe(1)
    b.lascia()
  })

  it('«visto» scrive una riga di consegna per avviso, con il ritardo, una volta sola', () => {
    const { registro, righe, avanti } = banco()
    registro.nasce(domanda('a'))
    avanti(4_000)
    registro.nasce(domanda('b'))
    avanti(3_000)
    expect(registro.visto('tel:a', 2, 'telefono di prova')).toBe(2)
    expect(righe.filter((r) => r.includes('consegnato'))).toEqual([
      '[avviso] consegnato n=1 domanda «Negozio chiede» a telefono di prova dopo 7 s',
      '[avviso] consegnato n=2 domanda «Negozio chiede» a telefono di prova dopo 3 s'
    ])
    expect(registro.visto('tel:a', 2)).toBe(0)
    // Un numero più avanti dell'ultimo non inventa consegne.
    expect(registro.visto('tel:a', 99)).toBe(0)
  })

  it('resta su disco: avvisi, numero, impostazioni, cursori', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'avvisi-')), 'avvisi.json')
    const primo = banco(file)
    primo.registro.nasce(domanda('a'))
    primo.registro.imposta({ chatFerma: true, silenzio: { da: '23:00', a: '07:00' } })
    primo.registro.segnaCursore('servizio', 12)
    const secondo = banco(file)
    expect(secondo.registro.ultimo()).toBe(1)
    expect(secondo.registro.aperti().map((a) => a.id)).toEqual(['domanda:a'])
    expect(secondo.registro.impostazioni()).toMatchObject({ chatFerma: true, silenzio: { da: '23:00', a: '07:00' } })
    expect(secondo.registro.cursore('servizio')).toBe(12)
    expect(secondo.registro.nasce(domanda('b'))?.n).toBe(2)
    expect((JSON.parse(readFileSync(file, 'utf8')) as { avvisi: unknown[] }).avvisi).toHaveLength(2)
  })

  it('un file rotto non ferma niente: si riparte vuoti', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'avvisi-')), 'avvisi.json')
    writeFileSync(file, '{ rotto')
    const { registro, righe } = banco(file)
    expect(registro.ultimo()).toBe(0)
    expect(righe[0]).toMatch(/^\[avviso\] registro illeggibile/)
    expect(registro.nasce(domanda('a'))?.n).toBe(1)
  })

  it(`oltre ${AVVISI_TENUTI} se ne vanno i più vecchi, ma una domanda aperta resta`, () => {
    const { registro } = banco()
    registro.nasce(domanda('vecchia'))
    for (let i = 0; i < AVVISI_TENUTI + 5; i += 1) registro.nasce(bozzaFatto({ cosa: 'fatto', id: `f${i}`, workspace: 'w', titolo: `Fatta: ${i}` }))
    expect(registro.ultimi(1000)).toHaveLength(AVVISI_TENUTI)
    expect(registro.ha('domanda:vecchia')).toBe(true)
    expect(registro.ha('fatto:f0')).toBe(false)
  })

  it('chi ascolta i cambiamenti li riceve tutti', () => {
    const { registro } = banco()
    const visti: string[] = []
    const smetti = registro.quandoCambia((a) => visti.push(`${a.id}${a.chiuso !== undefined ? ' chiuso' : ''}`))
    registro.nasce(domanda('a'))
    registro.chiudi('domanda:a', 'ritirata')
    smetti()
    registro.nasce(domanda('b'))
    expect(visti).toEqual(['domanda:a', 'domanda:a chiuso'])
  })
})
