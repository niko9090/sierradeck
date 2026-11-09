import { describe, it, expect } from 'vitest'
import {
  FRASE_GROSSO_FUORI, drivePienoDa, eseguiPasso, grossoFuoriDaSierraDeck, passiDa, percentualeDrive, ripartizioneDrive, righeDa, riepilogoFinale,
  type ApiLiberaSpazio, type EsitoMemoria, type OpzioniPassi
} from '@shared/libera-spazio'
import { TIPI_SPAZIO, type Proposta, type Pulizia, type QuotaMisurata, type StatoSpazio, type TipoSpazio } from '@shared/spazio-drive'
import { componiSalute, type IngressiSalute } from '@shared/salute'
import { paginaClient } from '../../src/main/client-pagina'
import { ROTTE_PONTE } from '../../src/shared/ponte-telefono'

const GB = 1024 ** 3
const MB = 1024 ** 2

const perTipo = (x: Partial<Record<TipoSpazio, number>> = {}): QuotaMisurata['sierraDeck']['perTipo'] =>
  Object.fromEntries(TIPI_SPAZIO.map((t) => [t, { file: x[t] === undefined ? 0 : 1, byte: x[t] ?? 0 }])) as QuotaMisurata['sierraDeck']['perTipo']

const quota = (usato: number, limite: number | undefined, sierra: number, extra: Partial<QuotaMisurata> = {}): QuotaMisurata => ({
  usato,
  ...(limite !== undefined ? { limite, percentuale: Math.round((usato / limite) * 1000) / 10 } : {}),
  sierraDeck: { file: 10, byte: sierra, perTipo: perTipo({ chat: sierra }) },
  misuratoIl: '2026-11-09T10:00:00.000Z',
  ...extra
})

const proposta = (tipo: Proposta['tipo'], byte: number, extra: Partial<Proposta> = {}): Proposta => ({
  tipo, titolo: `Titolo ${tipo}`, breve: `breve ${tipo}`, spiega: `spiega ${tipo}`, voci: [{ nome: 'f_1', byte }], byte, ...extra
})

const stato = (x: { proposte?: Proposta[]; chat?: Proposta; inRecupero?: number; pulizie?: Pulizia[] } = {}): StatoSpazio => ({
  misura: {
    totale: { file: 10, byte: 5 * GB }, perTipo: perTipo({ chat: 5 * GB }), inRecupero: { file: x.inRecupero ? 3 : 0, byte: x.inRecupero ?? 0 }, misuratoIl: '2026-11-09T10:00:00.000Z'
  },
  proposte: x.proposte ?? [],
  ...(x.chat !== undefined ? { chatNonUsate: x.chat } : {}),
  pulizie: x.pulizie ?? []
})

const normale: OpzioniPassi = { contate: false, drivePieno: false, recupero: 'salta' }
const piena: OpzioniPassi = { contate: false, drivePieno: true, recupero: 'salta' }
const ids = (p: { id: string }[]): string[] => p.map((x) => x.id)

describe('la misura: percentuale, ripartizione, grosso fuori', () => {
  it('la percentuale sta fra 0 e 100 e manca se il limite non si sa', () => {
    expect(percentualeDrive(quota(15 * GB, 15 * GB, GB))).toBe(100)
    expect(percentualeDrive(quota(7.5 * GB, 15 * GB, GB))).toBe(50)
    expect(percentualeDrive(quota(16 * GB, 15 * GB, GB, { percentuale: 106.7 }))).toBe(100)
    expect(percentualeDrive(quota(GB, undefined, MB))).toBeUndefined()
    expect(percentualeDrive(undefined)).toBeUndefined()
  })
  it('Google contro SierraDeck: il resto è fuori', () => {
    const r = ripartizioneDrive(quota(10 * GB, 15 * GB, 2 * GB, { usatoNelDrive: 3 * GB, nelCestino: GB }))
    expect(r.fuori).toBe(8 * GB)
    expect(r.sierraDeck).toBe(2 * GB)
    expect(r.percSierraDeck).toBe(20)
    expect(r.percFuori).toBe(80)
    expect(r.nelDrive).toBe(3 * GB)
    expect(r.nelCestino).toBe(GB)
    // SierraDeck non può superare il totale: niente numeri negativi.
    expect(ripartizioneDrive(quota(GB, 15 * GB, 2 * GB)).fuori).toBe(0)
  })
  it('Drive pieno: lo dice il programma o la quota', () => {
    expect(drivePienoDa(quota(15 * GB, 15 * GB, GB))).toBe(true)
    expect(drivePienoDa(quota(14.99 * GB, 15 * GB, GB))).toBe(true)
    expect(drivePienoDa(quota(10 * GB, 15 * GB, GB))).toBe(false)
    expect(drivePienoDa(quota(10 * GB, 15 * GB, GB), true)).toBe(true)
    expect(drivePienoDa(undefined)).toBe(false)
  })
  it('il grosso fuori da SierraDeck: quando SierraDeck non arriva alla metà di quello che si usa', () => {
    expect(grossoFuoriDaSierraDeck(quota(14 * GB, 15 * GB, GB))).toBe(true)
    expect(grossoFuoriDaSierraDeck(quota(14 * GB, 15 * GB, 8 * GB))).toBe(false)
    expect(grossoFuoriDaSierraDeck(quota(14 * GB, 15 * GB, 7 * GB))).toBe(false)
    expect(grossoFuoriDaSierraDeck(undefined)).toBe(false)
    expect(FRASE_GROSSO_FUORI.length).toBeLessThan(120)
    expect(FRASE_GROSSO_FUORI).toMatch(/Gmail|Foto/)
  })
})

describe('i passi', () => {
  it('senza lo stato non ci sono passi', () => {
    expect(passiDa(undefined, normale)).toEqual([])
  })
  it('le versioni: prima si contano (niente stima), poi si tolgono, e non si annullano', () => {
    const conta = passiDa(stato(), normale)
    expect(conta).toHaveLength(1)
    expect(conta[0]).toMatchObject({ id: 'versioni', azione: 'conta', stima: 0, annullabile: false })
    // Contate e niente da togliere: il passo sparisce.
    expect(passiDa(stato(), { ...normale, contate: true })).toEqual([])
    const togli = passiDa(stato({ proposte: [proposta('versioni', 400 * MB, { versioni: 120 })] }), normale)
    expect(togli[0]).toMatchObject({ id: 'versioni', azione: 'togli', stima: 400 * MB, circa: true, liberaSubito: true, annullabile: false })
    expect(togli[0]?.breve).toContain('120')
  })
  it('l’ordine: versioni, chat, doppie, doppioni, recupero; solo quelli che hanno qualcosa', () => {
    const st = stato({
      proposte: [proposta('doppioni-nome', MB), proposta('doppie', 2 * MB), proposta('versioni', MB, { versioni: 3 }), proposta('recupero-scaduto', 5 * MB), proposta('prove', MB)],
      chat: proposta('chat-non-usate', GB), inRecupero: 10 * MB
    })
    expect(ids(passiDa(st, normale))).toEqual(['versioni', 'chat-non-usate', 'doppie', 'doppioni-nome', 'recupero'])
    expect(ids(passiDa(stato({ chat: proposta('chat-non-usate', GB) }), { ...normale, contate: true }))).toEqual(['chat-non-usate'])
    // Una proposta senza file non fa un passo.
    expect(passiDa(stato({ proposte: [proposta('doppie', 0, { voci: [] })] }), { ...normale, contate: true })).toEqual([])
  })
  it('Drive normale: le chat vanno nel recupero (si annullano, liberano dopo «Svuota»)', () => {
    const [c] = passiDa(stato({ chat: proposta('chat-non-usate', GB) }), { ...normale, contate: true })
    expect(c).toMatchObject({ azione: 'pulisci', tipo: 'chat-non-usate', stima: GB, liberaSubito: false, annullabile: true })
    expect(c?.conferma).toMatch(/recupero/)
  })
  it('Drive pieno con «salta»: si cancella subito dal Drive, non si annulla, sul PC resta', () => {
    const st = stato({ chat: proposta('chat-non-usate', GB), proposte: [proposta('doppie', MB)] })
    const p = passiDa(st, { ...piena, contate: true })
    for (const x of p) expect(x).toMatchObject({ liberaSubito: true, annullabile: false })
    expect(p[0]?.conferma).toMatch(/Non si annulla/)
    expect(p[0]?.spiega).toMatch(/sul PC resta/)
    // Con «tieni» (la scelta opposta) a Drive pieno si resta nel recupero.
    const tieni = passiDa(st, { contate: true, drivePieno: true, recupero: 'tieni' })
    for (const x of tieni) expect(x).toMatchObject({ liberaSubito: false, annullabile: true })
  })
  it('il recupero somma quello scaduto e quello che aspetta, e non si annulla', () => {
    const [r] = passiDa(stato({ proposte: [proposta('recupero-scaduto', 5 * MB)], inRecupero: 20 * MB }), { ...normale, contate: true })
    expect(r).toMatchObject({ id: 'recupero', azione: 'svuota', stima: 25 * MB, annullabile: false, liberaSubito: true })
    expect(passiDa(stato(), { ...normale, contate: true })).toEqual([])
  })
  it('i testi sono corti, la spiegazione sta nel «?»', () => {
    const st = stato({ proposte: [proposta('doppie', MB), proposta('recupero-scaduto', MB), proposta('versioni', MB, { versioni: 2 })], chat: proposta('chat-non-usate', MB), inRecupero: MB })
    for (const p of passiDa(st, normale)) {
      expect(p.breve.length).toBeLessThan(90)
      expect(p.conferma.length).toBeLessThan(90)
      expect(p.bottone.length).toBeLessThan(30)
      expect(p.spiega.length).toBeGreaterThan(p.breve.length)
    }
  })
})

describe('gli stati dei passi', () => {
  const st = stato({ chat: proposta('chat-non-usate', GB), proposte: [proposta('doppie', MB)] })
  const passi = passiDa(st, { ...normale, contate: true })
  it('all’inizio tutto da fare', () => {
    expect(righeDa(passi, {}).map((r) => r.stato)).toEqual(['da-fare', 'da-fare'])
  })
  it('un passo fatto resta in lista con i byte prima e dopo, anche se ormai non ha più niente da fare', () => {
    const chat = passi[0]!
    const memoria: Record<string, EsitoMemoria> = { 'chat-non-usate': { stato: 'fatto', prima: 5 * GB, dopo: 4 * GB, motivo: 'ok', passo: chat } }
    const dopo = passiDa(stato({ proposte: [proposta('doppie', MB)] }), { ...normale, contate: true })
    const r = righeDa(dopo, memoria)
    expect(r.map((x) => `${x.id}:${x.stato}`)).toEqual(['chat-non-usate:fatto', 'doppie:da-fare'])
    expect(r[0]).toMatchObject({ prima: 5 * GB, dopo: 4 * GB, titolo: chat.titolo })
  })
  it('in corso, saltato, errore (con il motivo); l’errore si può riprovare', () => {
    const memoria: Record<string, EsitoMemoria> = {
      'chat-non-usate': { stato: 'in-corso', passo: passi[0]! },
      doppie: { stato: 'errore', motivo: 'Il Drive non ha risposto', passo: passi[1]! }
    }
    const r = righeDa(passi, memoria)
    expect(r.map((x) => x.stato)).toEqual(['in-corso', 'errore'])
    expect(r[1]?.motivo).toBe('Il Drive non ha risposto')
    expect(r[1]?.azione).toBe('pulisci')
    const saltato = righeDa([], { versioni: { stato: 'saltato', motivo: 'Niente da togliere.', passo: passiDa(stato(), normale)[0]! } })
    expect(saltato).toHaveLength(1)
    expect(saltato[0]?.stato).toBe('saltato')
  })
  it('«da-fare» in memoria (dopo «Conta») non nasconde il passo di adesso', () => {
    const conta = passiDa(stato(), normale)[0]!
    const togli = passiDa(stato({ proposte: [proposta('versioni', MB, { versioni: 4 })] }), { ...normale, contate: true })
    const r = righeDa(togli, { versioni: { stato: 'da-fare', passo: conta, contate: true } })
    expect(r[0]).toMatchObject({ azione: 'togli', stato: 'da-fare' })
  })
})

/** Un Drive finto: tiene i byte di SierraDeck e li scala a ogni azione. */
function driveFinto(opz: { byte?: number; stato?: () => StatoSpazio; azione?: (c: { azione: string; tipo?: string; id?: string }, n: number) => { ok: boolean; messaggio: string; inSospeso?: boolean }; quotaErrore?: boolean } = {}): { api: ApiLiberaSpazio; chiamate: { azione: string; tipo?: string; id?: string; recupero?: string }[] } {
  let byte = opz.byte ?? 5 * GB
  const chiamate: { azione: string; tipo?: string; id?: string; recupero?: string }[] = []
  return {
    chiamate,
    api: {
      stato: async () => (opz.stato ?? (() => stato()))(),
      quota: async () => { if (opz.quotaErrore) throw new Error('rete'); return quota(10 * GB, 15 * GB, byte) },
      azione: async (c) => {
        chiamate.push({ ...c })
        const e = (opz.azione ?? (() => ({ ok: true, messaggio: 'Fatto.' })))(c, chiamate.length)
        if (e.ok) byte -= GB
        return e
      }
    }
  }
}
const passoDi = (x: Parameters<typeof passiDa>[0], o: OpzioniPassi, id: string) => passiDa(x, o).find((p) => p.id === id)!

describe('eseguire un passo', () => {
  it('«Conta»: se le versioni da togliere ci sono il passo resta da fare (ora con «Togli»), se no è saltato', async () => {
    const conta = passoDi(stato(), normale, 'versioni')
    const conVersioni = driveFinto({ stato: () => stato({ proposte: [proposta('versioni', MB, { versioni: 3 })] }) })
    expect(await eseguiPasso(conta, conVersioni.api, { recupero: 'salta' })).toMatchObject({ stato: 'da-fare', contate: true })
    expect(conVersioni.chiamate).toEqual([{ azione: 'spazio-versioni-conta' }])
    const senza = driveFinto()
    expect(await eseguiPasso(conta, senza.api, { recupero: 'salta' })).toMatchObject({ stato: 'saltato', contate: true, motivo: 'Niente da togliere.' })
  })
  it('un passo riuscito dice i byte di SierraDeck prima e dopo', async () => {
    const d = driveFinto({ azione: () => ({ ok: true, messaggio: '12 file nel recupero.' }) })
    const p = passoDi(stato({ chat: proposta('chat-non-usate', GB) }), normale, 'chat-non-usate')
    const e = await eseguiPasso(p, d.api, { recupero: 'salta' })
    expect(e).toMatchObject({ stato: 'fatto', prima: 5 * GB, dopo: 4 * GB, motivo: '12 file nel recupero.' })
    expect(d.chiamate).toEqual([{ azione: 'spazio-pulisci', tipo: 'chat-non-usate', recupero: 'salta' }])
  })
  it('le versioni si tolgono con la loro azione', async () => {
    const d = driveFinto()
    const e = await eseguiPasso(passoDi(stato({ proposte: [proposta('versioni', MB, { versioni: 3 })] }), normale, 'versioni'), d.api, { recupero: 'salta' })
    expect(e.stato).toBe('fatto')
    expect(d.chiamate).toEqual([{ azione: 'spazio-versioni-libera' }])
  })
  it('Drive pieno: «in sospeso» arriva fino al passo', async () => {
    const d = driveFinto({ azione: () => ({ ok: true, messaggio: 'Cancellati dal Drive.', inSospeso: true }) })
    const e = await eseguiPasso(passoDi(stato({ chat: proposta('chat-non-usate', GB) }), piena, 'chat-non-usate'), d.api, { recupero: 'salta' })
    expect(e).toMatchObject({ stato: 'fatto', inSospeso: true })
  })
  it('un errore ha il suo motivo e non cambia i byte', async () => {
    const d = driveFinto({ azione: () => ({ ok: false, messaggio: 'Drive pieno: non cancello niente.' }) })
    const e = await eseguiPasso(passoDi(stato({ chat: proposta('chat-non-usate', GB) }), piena, 'chat-non-usate'), d.api, { recupero: 'salta' })
    expect(e).toEqual({ stato: 'errore', motivo: 'Drive pieno: non cancello niente.' })
  })
  it('«non c’è più niente» non è un errore: il passo è saltato', async () => {
    const d = driveFinto({ azione: () => ({ ok: false, messaggio: 'Non c’è più niente da pulire qui.' }) })
    const e = await eseguiPasso(passoDi(stato({ proposte: [proposta('doppie', MB)] }), normale, 'doppie'), d.api, { recupero: 'salta' })
    expect(e.stato).toBe('saltato')
  })
  it('un’eccezione (rete) diventa un errore, mai un’eccezione', async () => {
    const d = driveFinto({ quotaErrore: true })
    const e = await eseguiPasso(passoDi(stato({ chat: proposta('chat-non-usate', GB) }), normale, 'chat-non-usate'), d.api, { recupero: 'salta' })
    expect(e).toEqual({ stato: 'errore', motivo: 'rete' })
  })
  it('il recupero: prima il recupero scaduto, poi si svuota ogni pulizia attiva (non le annullate né le già svuotate)', async () => {
    const pul = (id: string, x: Partial<Pulizia> = {}): Pulizia => ({ id, tipo: 'doppie', titolo: id, quando: '2026-10-01T00:00:00.000Z', chi: 'pc', scadeIl: '2026-11-01T00:00:00.000Z', voci: [], byte: MB, ...x })
    const d = driveFinto({
      stato: () => stato({ proposte: [proposta('recupero-scaduto', MB)], inRecupero: 30 * MB, pulizie: [pul('a'), pul('b', { annullataIl: 'x' }), pul('c', { svuotataIl: 'x' }), pul('d')] })
    })
    const p = passoDi(stato({ proposte: [proposta('recupero-scaduto', MB)], inRecupero: 30 * MB }), normale, 'recupero')
    const e = await eseguiPasso(p, d.api, { recupero: 'salta' })
    expect(e.stato).toBe('fatto')
    expect(d.chiamate.map((c) => `${c.azione}:${c.tipo ?? c.id}`)).toEqual(['spazio-pulisci:recupero-scaduto', 'spazio-svuota:a', 'spazio-svuota:d'])
  })
  it('il recupero: se una pulizia non si svuota è un errore col suo motivo', async () => {
    const d = driveFinto({
      stato: () => stato({ pulizie: [{ id: 'a', tipo: 'doppie', titolo: 'a', quando: '', chi: '', scadeIl: '', voci: [], byte: 1 }] }),
      azione: () => ({ ok: false, messaggio: '1 file cancellati, 2 no: riprova più tardi' })
    })
    const e = await eseguiPasso(passoDi(stato({ inRecupero: MB }), normale, 'recupero'), d.api, { recupero: 'salta' })
    expect(e).toEqual({ stato: 'errore', motivo: '1 file cancellati, 2 no: riprova più tardi' })
  })
})

describe('la riga in fondo', () => {
  it('da quanto a quanto, e quanto ha liberato SierraDeck', () => {
    const r = riepilogoFinale(quota(15 * GB, 15 * GB, 5 * GB), quota(12 * GB, 15 * GB, 2 * GB), 0)
    expect(r).toEqual({ prima: 100, dopo: 80, liberatiSierraDeck: 3 * GB, inSospeso: 0, riprova: false })
  })
  it('con pulizie in sospeso c’è «Riprova ora»', () => {
    expect(riepilogoFinale(quota(15 * GB, 15 * GB, 5 * GB), quota(15 * GB, 15 * GB, 5 * GB), 2)).toMatchObject({ inSospeso: 2, riprova: true, liberatiSierraDeck: 0 })
  })
  it('senza quota non inventa percentuali', () => {
    expect(riepilogoFinale(undefined, undefined, 0)).toEqual({ inSospeso: 0, riprova: false })
  })
})

describe('l’avviso «Drive pieno» della Salute apre la procedura', () => {
  it('la voce ha l’azione «Libera spazio sul Drive»', () => {
    const i = {
      adesso: Date.parse('2026-11-09T10:00:00Z'), versione: '0.99.0', pc: [], consegne: [], errori: [], aggiornamento: undefined,
      drive: { configurato: true, connesso: true, pieno: true, ultimoSalvataggio: '2026-11-09T09:00:00Z' }
    } as unknown as IngressiSalute
    const v = componiSalute(i).voci.find((x) => x.chiave === 'drive')
    expect(v?.azioni).toEqual([{ id: 'libera-spazio', testo: 'Libera spazio sul Drive' }])
  })
})

describe('le rotte per la pagina del telefono', () => {
  it('stato, quota, pulizie in sospeso e ripresa passano anche dal ponte', () => {
    for (const r of ['stato', 'quota', 'in-sospeso', 'riprendi']) expect(ROTTE_PONTE).toContain(`/api/drive/spazio/${r}`)
  })
})

describe('la pagina del telefono', () => {
  const html = paginaClient()
  const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'))

  it('la pagina si legge ancora (niente backtick o virgolette rotte)', () => {
    expect(() => new Function(script)).not.toThrow()
  })
  it('ha il bottone in «Spazio sul Drive» e l’azione della Salute, uniche al telefono', () => {
    expect(script).toContain('onclick="plApri(false)"')
    expect(script).toContain('onclick="plDaSalute()"')
    expect(script).toMatch(/const AZIONI_DAL_TELEFONO = \[[^\]]*'libera-spazio'/)
    expect(script).toContain('/api/drive/spazio/quota')
  })
  it('la stessa logica del PC è scritta nella pagina', () => {
    for (const f of [passiDa, righeDa, eseguiPasso, riepilogoFinale]) expect(script).toContain(f.toString())
  })

  /** Il pezzo della pagina che disegna la procedura, con un Drive finto sotto. */
  function pagina(rispondi: (percorso: string, corpo: unknown) => unknown) {
    const inizio = script.indexOf('// «Libera spazio sul Drive» (0.99)')
    const fine = script.indexOf('function pdSpazioHtml()')
    expect(inizio).toBeGreaterThan(0)
    expect(fine).toBeGreaterThan(inizio)
    const corpo = script.slice(inizio, fine)
    const f = new Function('chiedi', 'esc', 'escJs', 'aiuto', 'pannello', 'ultimoStato', 'pdByte', 'PD_TIPI', 'pdStrumento', 'pdScelto', 'pdDaConfermare', 'leggiPannelloDrive', 'pannelloAperto',
      `${corpo}; window.pl_ = () => pl; return { plApri: window.plApri, plFai: window.plFai, plConferma: window.plConferma, plHtml, plRighe, stato: () => pl }`)
    const finestra = {} as Record<string, unknown>
    const globale = globalThis as unknown as { window?: unknown }
    const prima = globale.window
    globale.window = finestra
    const ris = f(
      async (p: string, c: unknown) => rispondi(p, c), (t: string) => String(t), (t: string) => String(t), (_i: string, t: string) => `[?${t}]`, () => undefined, null,
      (n: number) => `${Math.round(n / MB)} MB`, TIPI_SPAZIO.map((t) => [t, t]), '', '', '', async () => undefined, null
    ) as { plApri: (p: boolean) => Promise<void>; plFai: (id: string) => Promise<void>; plConferma: (id: string) => void; plHtml: () => string; plRighe: () => { id: string; stato: string }[]; stato: () => { memoria: Record<string, { stato: string }> } }
    globale.window = prima
    return ris
  }

  it('Drive pieno e il grosso fuori: misura, frase corta, passi; dopo il passo lo stato è «fatto» con i byte', async () => {
    let byte = 600 * MB
    const chiamate: string[] = []
    const risposte = (p: string, c: unknown): unknown => {
      const corpo = c as { azione?: string; tipo?: string }
      chiamate.push(corpo.azione !== undefined ? `${p}:${corpo.azione}:${corpo.tipo ?? ''}` : p)
      if (p === '/api/drive/spazio/quota') return { quota: quota(15 * GB, 15 * GB, byte) }
      if (p === '/api/drive/spazio/stato') return { stato: stato({ chat: proposta('chat-non-usate', 200 * MB) }) }
      if (p === '/api/drive/spazio/in-sospeso') return { inSospeso: [] }
      if (p === '/api/drive/azione') { byte -= 200 * MB; return { ok: true, messaggio: 'Cancellati dal Drive.' } }
      return {}
    }
    const pg = pagina(risposte)
    const globale = globalThis as unknown as { window?: unknown }
    globale.window = {}
    await pg.plApri(true)
    let h = pg.plHtml()
    expect(h).toContain('100%')
    expect(h).toContain('Il Drive è pieno')
    expect(h).toContain(FRASE_GROSSO_FUORI)
    expect(h).toContain('Chat non usate')
    expect(h).toContain('non si annulla')
    pg.plConferma('chat-non-usate')
    expect(pg.plHtml()).toContain('Non si annulla')
    await pg.plFai('chat-non-usate')
    h = pg.plHtml()
    expect(pg.stato().memoria['chat-non-usate']?.stato).toBe('fatto')
    expect(h).toContain('fatto')
    expect(h).toContain('600 MB → 400 MB')
    expect(h).toContain('Dal 100% al 100%')
    expect(chiamate).toContain('/api/drive/azione:spazio-pulisci:chat-non-usate')
    globale.window = undefined
  })
})
