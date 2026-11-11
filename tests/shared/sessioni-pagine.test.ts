import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { filtraSessioni, leggiRichiestaSessioni, paginaDi, SESSIONI_PER_PAGINA } from '@shared/sessioni-pagine'
import { rotteClient, type DipendenzeRotte } from '../../src/main/client-rotte'
import { apriDispositivi } from '../../src/main/dispositivi'

/** `/api/sessioni` a pagine e con la ricerca: prima arrivavano le prime 30 su ~1500. Nomi inventati. */

const TUTTE = Array.from({ length: 100 }, (_, i) => ({
  id: `sess-${i}`, cwd: i % 2 === 0 ? 'C:\\progetti\\Gestionale' : 'C:\\progetti\\Sito', titolo: i === 42 ? 'Perché il menù non si apre' : `Chat numero ${i}`,
  quando: new Date(Date.UTC(2026, 9, 1) - i * 60_000).toISOString(), ...(i % 10 === 9 ? { senzaNome: true } : {})
}))

const chiedi = async (corpo?: Record<string, unknown>): Promise<Record<string, unknown>> => {
  const deps = { dispositivi: apriDispositivi(mkdtempSync(join(tmpdir(), 'sd-sess-'))), sessioni: () => Promise.resolve(TUTTE) } as unknown as DipendenzeRotte
  return ((await rotteClient(deps)({ metodo: 'POST', percorso: '/api/sessioni', corpo, dispositivo: 't1' })) as { corpo: Record<string, unknown> }).corpo
}

describe('/api/sessioni', () => {
  it('senza parametri: le prime 30 come prima, più il conto', async () => {
    const r = await chiedi({})
    expect((r.sessioni as unknown[]).length).toBe(SESSIONI_PER_PAGINA)
    expect((r.sessioni as { id: string }[])[0]!.id).toBe('sess-0')
    expect(r.nascoste).toBe(10)
    expect(r).toMatchObject({ totale: 90, pagina: 0, pagine: 3, altre: true })
  })

  it('pagina 2: le ultime, e non ce ne sono altre', async () => {
    const r = await chiedi({ pagina: 2 })
    expect((r.sessioni as unknown[]).length).toBe(30)
    expect(r.altre).toBe(false)
    expect((await chiedi({ pagina: 9 })).sessioni).toEqual([])
  })

  it('cerca: tutte le parole, senza maiuscole né accenti, anche nella cartella', async () => {
    const r = await chiedi({ cerca: 'PERCHE menu' })
    expect((r.sessioni as { id: string }[]).map((s) => s.id)).toEqual(['sess-42'])
    expect(r.totale).toBe(1)
    // Le dispari stanno nel Sito: 50, meno le 10 senza nome.
    expect((await chiedi({ cerca: 'sito' })).totale).toBe(40)
  })

  it('le senza nome restano fuori anche cercando, se non le chiedi', async () => {
    expect((await chiedi({ cerca: 'sess-99' })).totale).toBe(0)
    expect((await chiedi({ cerca: 'sess-99', senzaNome: true })).totale).toBe(1)
  })
})

describe('le funzioni', () => {
  it('leggiRichiestaSessioni: dal corpo o dall’indirizzo, con i valori strani a zero', () => {
    expect(leggiRichiestaSessioni({ pagina: 3, cerca: ' x ' })).toEqual({ pagina: 3, cerca: 'x' })
    expect(leggiRichiestaSessioni({}, new URLSearchParams('pagina=2&cerca=y'))).toEqual({ pagina: 2, cerca: 'y' })
    expect(leggiRichiestaSessioni({ pagina: -1 }).pagina).toBe(0)
    expect(leggiRichiestaSessioni({ pagina: 'tre' }).pagina).toBe(0)
    expect(leggiRichiestaSessioni(undefined)).toEqual({ pagina: 0, cerca: '' })
  })

  it('filtraSessioni senza parole: tutte; paginaDi: il conto giusto', () => {
    expect(filtraSessioni(TUTTE, '   ')).toHaveLength(100)
    expect(paginaDi([1, 2, 3], 0, 2)).toEqual({ voci: [1, 2], conto: { totale: 3, pagina: 0, pagine: 2, altre: true } })
  })
})
