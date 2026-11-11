import { describe, expect, it } from 'vitest'
import { apriAvvisi } from '../../src/main/avvisi'
import { conAvvisi, creaVersioneStato, visoreDi, type RichiestaRotta } from '../../src/main/rotte-avvisi'
import type { Esito } from '../../src/main/client-server'
import { bozzaDaAltroPc, bozzaDomanda, bozzaFile, type Avviso } from '@shared/avvisi-telefono'

const domanda = (id: string) => bozzaDomanda({ cosa: 'domanda', id, workspace: 'Negozio', domanda: `Domanda ${id}?` })

/** Le rotte di prova: `/api/stato` risponde con quello che c'è in `stato`, il resto dice chi è passato. */
function banco() {
  const righe: string[] = []
  const registro = apriAvvisi({ log: (r) => righe.push(r) })
  const stato: { corpo: Record<string, unknown> } = { corpo: { pc: 'PC', chat: [] } }
  const passate: string[] = []
  const interna = async (r: RichiestaRotta): Promise<Esito> => {
    if (r.percorso === '/api/stato') return { stato: 200, corpo: { ...stato.corpo } }
    passate.push(`${r.metodo} ${r.percorso}`)
    return { stato: 200, corpo: { ok: true } }
  }
  const rotta = conAvvisi(interna, {
    registro,
    stato: () => ({ riga: 'Il telefono è in ascolto adesso.', inAscolto: true }),
    nomeDispositivo: (id) => (id === 'tel-1' ? 'Telefono di prova' : undefined),
    rileggiStatoMs: 20
  })
  const chiedi = (metodo: string, percorso: string, o: { corpo?: unknown; dispositivo?: string; cerca?: string } = {}) =>
    rotta({ metodo, percorso, corpo: o.corpo, ...(o.dispositivo !== undefined ? { dispositivo: o.dispositivo } : {}), cerca: new URLSearchParams(o.cerca ?? '') })
  return { registro, righe, stato, passate, chiedi }
}

const corpo = (e: Esito) => e.corpo as { ultimo: number; stato: number; avvisi: Avviso[] }

describe('la versione dello stato', () => {
  it('cresce solo quando lo stato cambia; i file in coda di chi chiede non contano', () => {
    let ora = 5_000_000
    const v = creaVersioneStato(() => ora)
    const a = v.vedi({ chat: [1] })
    expect(a).toBe(5000)
    expect(v.vedi({ chat: [1], consegne: ['x'], versione: 99 })).toBe(a)
    ora = 5_000_400
    expect(v.vedi({ chat: [2] })).toBe(a + 1)
    expect(v.versione()).toBe(a + 1)
  })

  it('/api/stato porta la versione in cima, e le altre rotte passano com’erano', async () => {
    const b = banco()
    const e1 = await b.chiedi('GET', '/api/stato')
    expect(Object.keys(e1.corpo as object)[0]).toBe('versione')
    const v1 = (e1.corpo as { versione: number }).versione
    expect(((await b.chiedi('GET', '/api/stato')).corpo as { versione: number }).versione).toBe(v1)
    b.stato.corpo = { pc: 'PC', chat: ['nuova'] }
    expect(((await b.chiedi('GET', '/api/stato')).corpo as { versione: number }).versione).toBeGreaterThan(v1)
    await b.chiedi('POST', '/api/rispondi', { corpo: {} })
    await b.chiedi('GET', '/api/avvisi/altro')
    expect(b.passate).toEqual(['POST /api/rispondi', 'GET /api/avvisi/altro'])
  })
})

describe('/api/eventi, l’attesa lunga', () => {
  it('da zero: solo le domande aperte, subito', async () => {
    const b = banco()
    b.registro.nasce(domanda('d-1'))
    b.registro.nasce(domanda('d-2'))
    b.registro.chiudi('domanda:d-2', 'risposta')
    const e = corpo(await b.chiedi('GET', '/api/eventi', { cerca: 'avvisi=0&attesa=30', dispositivo: 'tel-1' }))
    expect(e.ultimo).toBe(3)
    expect(e.avvisi.map((a) => a.id)).toEqual(['domanda:d-1'])
  })

  it('tiene la richiesta finché nasce un avviso, poi risponde con quello', async () => {
    const b = banco()
    b.registro.nasce(domanda('d-1'))
    const attesa = b.chiedi('GET', '/api/eventi', { cerca: 'avvisi=1&attesa=30', dispositivo: 'tel-1' })
    await new Promise((r) => setTimeout(r, 10))
    expect(b.registro.inAttesa()).toBe(1)
    b.registro.nasce(domanda('d-2'))
    const e = corpo(await attesa)
    expect(e.avvisi.map((a) => a.id)).toEqual(['domanda:d-2'])
    expect(e.ultimo).toBe(2)
    expect(b.registro.inAttesa()).toBe(0)
  })

  it('senza niente di nuovo risponde vuoto allo scadere', async () => {
    const b = banco()
    b.registro.nasce(domanda('d-1'))
    const e = corpo(await b.chiedi('GET', '/api/eventi', { cerca: 'avvisi=1&attesa=0.05' }))
    expect(e.avvisi).toEqual([])
    expect(e.ultimo).toBe(1)
  })

  it('con `stato`: risponde appena lo stato non è più a quella versione', async () => {
    const b = banco()
    const v = corpo(await b.chiedi('GET', '/api/eventi', { cerca: 'avvisi=0&attesa=0' })).stato
    expect(v).toBeGreaterThan(0)
    const attesa = b.chiedi('GET', '/api/eventi', { cerca: `avvisi=0&stato=${v}&attesa=30` })
    await new Promise((r) => setTimeout(r, 30))
    b.stato.corpo = { pc: 'PC', chat: ['cambiata'] }
    const e = corpo(await attesa)
    expect(e.stato).toBeGreaterThan(v)
    expect(e.avvisi).toEqual([])
  })

  it('a un altro PC non si rimandano gli avvisi presi da altri PC', async () => {
    const b = banco()
    b.registro.nasce(domanda('d-1'))
    const fuori = b.registro.nasce(domanda('d-9'))!
    b.registro.nasce(bozzaDaAltroPc(fuori, 'pc-b', 'Portatile'))
    const per = async (dispositivo: string) => corpo(await b.chiedi('GET', '/api/eventi', { cerca: 'avvisi=0&attesa=0', dispositivo })).avvisi.map((a) => a.id)
    expect(await per('tel-1')).toEqual(['domanda:d-1', 'domanda:d-9', 'pc:pc-b:domanda:d-9'])
    expect(await per('pc:pc-c')).toEqual(['domanda:d-1', 'domanda:d-9'])
    expect(visoreDi(undefined)).toBe('locale')
    expect(visoreDi('pc')).toBe('pc')
    expect(visoreDi('tel-1')).toBe('tel:tel-1')
  })

  it('il file per un telefono arriva solo a lui (anche quando passa dal ponte di un altro PC)', async () => {
    const b = banco()
    b.registro.nasce(domanda('d-1'))
    b.registro.nasce(bozzaFile({ id: 'f-1', nome: 'foto.jpg', per: 'tel:tel-1' }))
    b.registro.nasce(bozzaFile({ id: 'f-2', nome: 'nota.pdf', per: 'pc:tel:tel-7@pc-b' }))
    const ids = async (dispositivo: string) => corpo(await b.chiedi('GET', '/api/eventi', { cerca: 'avvisi=1&attesa=0', dispositivo })).avvisi.map((a) => a.id)
    expect(await ids('tel-1')).toEqual(['file:f-1'])
    expect(await ids('tel-2')).toEqual([])
    expect(await ids('pc:tel:tel-7@pc-b')).toEqual(['file:f-2'])
  })
})

describe('le altre rotte degli avvisi', () => {
  it('visto: serve «fino»; poi una riga di consegna col nome del telefono', async () => {
    const b = banco()
    b.registro.nasce(domanda('d-1'))
    expect((await b.chiedi('POST', '/api/avvisi/visto', { corpo: {}, dispositivo: 'tel-1' })).stato).toBe(400)
    const e = await b.chiedi('POST', '/api/avvisi/visto', { corpo: { fino: 1 }, dispositivo: 'tel-1' })
    expect(e).toEqual({ stato: 200, corpo: { consegnati: 1 } })
    expect(b.righe.some((r) => r.startsWith('[avviso] consegnato n=1') && r.includes('Telefono di prova'))).toBe(true)
  })

  it('una risposta presa chiude subito l’avviso della domanda', async () => {
    const b = banco()
    b.registro.nasce(domanda('d-1'))
    await b.chiedi('POST', '/api/rispondi', { corpo: { domanda: 'd-1', risposta: 'Sì' }, dispositivo: 'tel-1' })
    expect(b.registro.aperti()).toEqual([])
    expect(b.registro.ultimi(1)[0]!.chiuso?.come).toBe('risposta')
    expect(b.passate).toEqual(['POST /api/rispondi'])
  })

  it('prova: un avviso che suona anche con «Da sapere» silenziosa', async () => {
    const b = banco()
    const e = (await b.chiedi('POST', '/api/avvisi/prova', { dispositivo: 'tel-1' })).corpo as { avviso: Avviso }
    expect(e.avviso).toMatchObject({ tipo: 'sapere', suona: true, titolo: 'Prova di SierraDeck' })
  })

  it('impostazioni: si leggono da tutti, si cambiano da qui, dal telefono e dalla pagina; non da un altro PC', async () => {
    const b = banco()
    expect(((await b.chiedi('GET', '/api/avvisi/impostazioni')).corpo as { chatFerma: boolean }).chatFerma).toBe(false)
    const no = await b.chiedi('POST', '/api/avvisi/impostazioni', { corpo: { chatFerma: true }, dispositivo: 'pc:pc-b' })
    expect(no.stato).toBe(403)
    expect(b.registro.impostazioni().chatFerma).toBe(false)
    const si = await b.chiedi('POST', '/api/avvisi/impostazioni', { corpo: { chatFerma: true, tipi: { fatto: 'spenta' } }, dispositivo: 'tel-1' })
    expect(si.corpo).toMatchObject({ chatFerma: true, tipi: { fatto: 'spenta', domanda: 'suona' } })
  })

  it('stato: riga, impostazioni e le ultime 20, la più nuova prima', async () => {
    const b = banco()
    for (let i = 0; i < 25; i += 1) b.registro.nasce(domanda(`d-${i}`))
    const v = (await b.chiedi('GET', '/api/avvisi/stato')).corpo as { riga: string; inAscolto: boolean; impostazioni: unknown; ultimi: Avviso[] }
    expect(v.riga).toBe('Il telefono è in ascolto adesso.')
    expect(v.inAscolto).toBe(true)
    expect(v.impostazioni).toEqual(b.registro.impostazioni())
    expect(v.ultimi).toHaveLength(20)
    expect(v.ultimi[0]!.id).toBe('domanda:d-24')
  })
})
