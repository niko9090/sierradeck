import { describe, it, expect } from 'vitest'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { percentualeProcedura, type ApiLiberaSpazio, type VistaLiberaApp } from '@shared/libera-spazio'
import { TIPI_SPAZIO, type Proposta, type QuotaMisurata, type StatoSpazio, type TipoSpazio } from '@shared/spazio-drive'
import { ROTTE_PONTE } from '@shared/ponte-telefono'
import { creaLiberaSpazioApp } from '../../src/main/libera-spazio-app'
import { rotteClient, type DipendenzeRotte } from '../../src/main/client-rotte'
import { apriDispositivi } from '../../src/main/dispositivi'

/**
 * «Libera spazio sul Drive» nell'app Android (k-310): la procedura la tiene il
 * PC (`creaLiberaSpazioApp`), l'app la disegna (`Procedure.kt`). Qui: la
 * procedura con un Drive finto, le rotte, e che i campi letti dall'app siano
 * quelli che il PC manda.
 */

const GB = 1024 ** 3
const MB = 1024 ** 2
const KT = join(__dirname, '..', '..', 'android', 'app', 'src', 'main', 'java', 'it', 'ferrariconsulenze', 'sierradeck')

const perTipo = (byte: number): QuotaMisurata['sierraDeck']['perTipo'] =>
  Object.fromEntries(TIPI_SPAZIO.map((t: TipoSpazio) => [t, { file: t === 'chat' ? 1 : 0, byte: t === 'chat' ? byte : 0 }])) as QuotaMisurata['sierraDeck']['perTipo']
const quota = (usato: number, limite: number, sierra: number): QuotaMisurata => ({
  usato, limite, percentuale: Math.round((usato / limite) * 1000) / 10,
  sierraDeck: { file: 10, byte: sierra, perTipo: perTipo(sierra) }, misuratoIl: '2026-11-09T10:00:00.000Z'
})
const proposta = (tipo: Proposta['tipo'], byte: number): Proposta => ({ tipo, titolo: `Titolo ${tipo}`, breve: `breve ${tipo}`, spiega: `spiega ${tipo}`, voci: [{ nome: 'f_1', byte }], byte })

/** Un Drive finto: SierraDeck usa `byte`; togliere le chat ne libera 200 MB. */
function driveFinto(o: { fallisci?: number } = {}) {
  let byte = 600 * MB
  let chat = true
  let fallimenti = o.fallisci ?? 0
  let sblocca: (() => void) | undefined
  let fermo = false
  const chiamate: string[] = []
  const api: ApiLiberaSpazio = {
    quota: async () => quota(15 * GB, 15 * GB, byte),
    stato: async (): Promise<StatoSpazio> => ({
      misura: { totale: { file: 10, byte }, perTipo: perTipo(byte), inRecupero: { file: 0, byte: 0 }, misuratoIl: '2026-11-09T10:00:00.000Z' },
      proposte: [], ...(chat ? { chatNonUsate: proposta('chat-non-usate', 200 * MB) } : {}), pulizie: []
    }),
    azione: async (c) => {
      chiamate.push(`${c.azione}:${c.tipo ?? ''}`)
      if (fermo) await new Promise<void>((r) => { sblocca = r })
      if (c.azione === 'spazio-versioni-conta') return { ok: true, messaggio: 'Contate.' }
      if (fallimenti > 0) { fallimenti -= 1; return { ok: false, messaggio: 'Il Drive non risponde: riprova fra un minuto.' } }
      if (c.azione === 'spazio-pulisci' && c.tipo === 'chat-non-usate') { byte -= 200 * MB; chat = false; return { ok: true, messaggio: 'Cancellate dal Drive.' } }
      return { ok: false, messaggio: 'Niente da pulire.' }
    }
  }
  return { api, chiamate, ferma: () => { fermo = true }, sblocca: () => { fermo = false; sblocca?.() } }
}

describe('la procedura tenuta dal PC', () => {
  it('misura: percentuale del Drive, passi in ordine, procedura a 0%', async () => {
    const d = driveFinto()
    const p = creaLiberaSpazioApp({ api: d.api, inSospeso: () => [] })
    const v = await p.vista({ misura: true })
    expect(v.misurata).toBe(true)
    expect(v.adesso?.percentuale).toBe(100)
    expect(v.drivePieno).toBe(true)
    expect(v.righe.map((r) => r.id)).toEqual(['versioni', 'chat-non-usate'])
    expect(v.righe.every((r) => r.stato === 'da-fare')).toBe(true)
    expect(v.percentuale).toBe(0)
    // Il grosso è di Google, non di SierraDeck.
    expect(v.grossoFuori).toMatch(/Gmail|Foto/)
  })

  it('un passo parte subito «in corso», poi è «fatto» con i byte prima e dopo', async () => {
    const d = driveFinto()
    const p = creaLiberaSpazioApp({ api: d.api, inSospeso: () => [] })
    await p.vista({ misura: true })
    d.ferma()
    const subito = await p.esegui('chat-non-usate')
    expect(subito.inCorso).toBe('chat-non-usate')
    expect(subito.righe.find((r) => r.id === 'chat-non-usate')?.stato).toBe('in-corso')
    expect(subito.percentuale).toBe(25)
    // Mentre lavora, un secondo passo no; e rileggere non rimisura.
    await expect(p.esegui('versioni')).rejects.toThrow(/già un passo in corso/)
    expect((await p.vista({ misura: true })).inCorso).toBe('chat-non-usate')
    d.sblocca()
    await p.attendi()
    const v = await p.vista()
    expect(v.inCorso).toBeUndefined()
    const r = v.righe.find((x) => x.id === 'chat-non-usate')
    expect(r).toMatchObject({ stato: 'fatto', prima: 600 * MB, dopo: 400 * MB, motivo: 'Cancellate dal Drive.' })
    expect(v.liberati).toBe(200 * MB)
    expect(v.prima?.sierraDeck).toBe(600 * MB)
    expect(v.adesso?.sierraDeck).toBe(400 * MB)
    expect(v.percentuale).toBe(50)
    expect(d.chiamate).toContain('spazio-pulisci:chat-non-usate')
  })

  it('un errore resta con il suo motivo e «Riprova» rifà il passo', async () => {
    const d = driveFinto({ fallisci: 1 })
    const p = creaLiberaSpazioApp({ api: d.api, inSospeso: () => [] })
    await p.vista({ misura: true })
    await p.esegui('chat-non-usate')
    await p.attendi()
    let r = (await p.vista()).righe.find((x) => x.id === 'chat-non-usate')
    expect(r).toMatchObject({ stato: 'errore', motivo: 'Il Drive non risponde: riprova fra un minuto.' })
    await p.esegui('chat-non-usate')
    await p.attendi()
    r = (await p.vista()).righe.find((x) => x.id === 'chat-non-usate')
    expect(r?.stato).toBe('fatto')
  })

  it('un passo che non c’è (o già fatto) si rifiuta; «ricomincia» dimentica', async () => {
    const d = driveFinto()
    const p = creaLiberaSpazioApp({ api: d.api, inSospeso: () => [{ id: 'x', titolo: 'Chat non usate', recupero: 'salta', file: 2, byte: MB, fatto: { file: true, indice: false, registro: false } }] })
    await expect(p.esegui('doppie')).rejects.toThrow(/non c’è più/)
    await p.esegui('chat-non-usate')
    await p.attendi()
    await expect(p.esegui('chat-non-usate')).rejects.toThrow(/non c’è più/)
    const v = await p.vista()
    expect(v.inSospeso).toEqual([{ titolo: 'Chat non usate', byte: MB }])
    const nuova = await p.vista({ ricomincia: true })
    expect(nuova.righe.some((x) => x.stato === 'fatto')).toBe(false)
    expect(nuova.liberati).toBe(0)
  })

  it('un Drive che non risponde è un errore detto, non un’eccezione', async () => {
    const p = creaLiberaSpazioApp({ api: { quota: async () => { throw new Error('rete giù') }, stato: async () => undefined, azione: async () => ({ ok: true, messaggio: '' }) }, inSospeso: () => [] })
    const v = await p.vista({ misura: true })
    expect(v.errore).toBe('Non riesco a misurare il Drive: rete giù')
    expect(v.righe).toEqual([])
  })

  it('la percentuale: chiusi su mostrati, in corso conta mezzo, senza passi 100', () => {
    expect(percentualeProcedura([])).toBe(100)
    expect(percentualeProcedura([{ stato: 'fatto' }, { stato: 'saltato' }, { stato: 'in-corso' }, { stato: 'errore' }])).toBe(63)
    expect(percentualeProcedura([{ stato: 'da-fare' }, { stato: 'errore' }])).toBe(0)
  })
})

function deps(over: Partial<DipendenzeRotte> = {}): DipendenzeRotte {
  return {
    dispositivi: apriDispositivi(mkdtempSync(join(tmpdir(), 'sd-rotte-libera-'))),
    chat: () => [], autopiloti: () => Promise.resolve([]), rispondi: () => Promise.resolve(), domande: () => Promise.resolve([]),
    scriviAChat: () => undefined, apriChat: () => undefined, cartelle: () => Promise.resolve([]),
    workspace: () => Promise.resolve({ nomi: ['lavoro'], attivo: 'lavoro' }), cambiaWorkspace: () => Promise.resolve(),
    versione: '0.99.0', apk: () => Promise.resolve(undefined),
    ...over
  } as DipendenzeRotte
}
const post = (percorso: string, corpo: unknown, dispositivo?: string) => ({ metodo: 'POST', percorso, corpo, ...(dispositivo !== undefined ? { dispositivo } : {}) })

describe('le rotte per l’app', () => {
  it('procedura e passo arrivano alla procedura del PC; un altro PC no', async () => {
    const d = driveFinto()
    const p = creaLiberaSpazioApp({ api: d.api, inSospeso: () => [] })
    const rotte = rotteClient(deps({ liberaSpazioApp: { vista: (o) => p.vista(o), esegui: (x) => p.esegui(x) } }))
    const v = await rotte(post('/api/drive/spazio/procedura', { misura: true }))
    expect(v.stato).toBe(200)
    expect((v.corpo as VistaLiberaApp).righe.length).toBe(2)
    const e = await rotte(post('/api/drive/spazio/passo', { passo: 'chat-non-usate' }))
    expect((e.corpo as VistaLiberaApp).inCorso).toBe('chat-non-usate')
    await p.attendi()
    expect((await rotte(post('/api/drive/spazio/passo', { passo: 'chat-non-usate' }))).stato).toBe(409)
    expect((await rotte(post('/api/drive/spazio/passo', {}))).stato).toBe(400)
    expect((await rotte(post('/api/drive/spazio/procedura', {}, 'pc:pc-esempio'))).stato).toBe(403)
  })
  it('un PC senza la procedura lo dice (409), e le rotte passano dal ponte', async () => {
    const r = await rotteClient(deps())(post('/api/drive/spazio/procedura', {}))
    expect(r.stato).toBe(409)
    for (const x of ['procedura', 'passo', 'riprendi']) expect(ROTTE_PONTE).toContain(`/api/drive/spazio/${x}`)
  })
})

describe('l’app legge quello che il PC manda', () => {
  const kt = readFileSync(join(KT, 'Procedure.kt'), 'utf8')
  /** I nomi dei campi di una data class Kotlin. */
  const campi = (classe: string): string[] => {
    const corpo = new RegExp(`data class ${classe}\\(([\\s\\S]*?)\\n?\\)\\s*(\\n|$)`).exec(kt)?.[1] ?? ''
    return [...corpo.matchAll(/val (\w+):/g)].map((m) => m[1] as string)
  }

  it('ogni campo della vista e dei passi ha il suo posto nell’app', async () => {
    const d = driveFinto()
    const p = creaLiberaSpazioApp({ api: d.api, inSospeso: () => [{ id: 'x', titolo: 't', recupero: 'salta', file: 1, byte: 1, fatto: { file: true, indice: false, registro: false } }] })
    await p.vista({ misura: true })
    await p.esegui('chat-non-usate')
    await p.attendi()
    const v = await p.vista()
    expect(Object.keys(v).filter((k) => !campi('VistaLiberaApp').includes(k))).toEqual([])
    for (const r of v.righe) expect(Object.keys(r).filter((k) => !campi('RigaPassoApp').includes(k))).toEqual([])
    expect(Object.keys(v.adesso ?? {}).filter((k) => !campi('QuotaVistaApp').includes(k))).toEqual([])
    expect(campi('SospesaApp')).toEqual(['titolo', 'byte'])
  })

  it('l’app chiama le rotte giuste e il pannello apre la procedura', () => {
    const api = readFileSync(join(KT, 'Api.kt'), 'utf8')
    for (const r of ['/api/drive/spazio/procedura', '/api/drive/spazio/passo', '/api/drive/spazio/riprendi']) expect(api).toContain(`"${r}"`)
    const pannello = readFileSync(join(KT, 'PannelloDrive.kt'), 'utf8')
    expect(pannello).toContain('LiberaSpazioVista(api')
    expect(pannello).toContain('Libera spazio…')
  })

  it('testi corti, la spiegazione lunga dietro il «?»', () => {
    expect(kt).toMatch(/Aiuto\(LiberaRegole\.SPIEGA/)
    expect(kt).toMatch(/Aiuto\(SpostaRegole\.SPIEGA/)
    // Nessun dato privato: niente indirizzi o percorsi scritti nel codice.
    expect(kt).not.toMatch(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/)
    expect(kt).not.toMatch(/[A-Z]:\\\\/)
  })
})
