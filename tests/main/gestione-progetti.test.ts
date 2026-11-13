import { describe, expect, it } from 'vitest'
import { creaGestioneProgetti, type DepsGestione, type StatoGestione } from '../../src/main/progetti/gestione'
import type { ProgettoDrive, RegistroProgetti } from '../../src/main/progetti/registro'
import { collega, collegamentiVuoti, type Collegamenti } from '../../src/shared/progetti-identita'
import type { ComandoPosta } from '../../src/shared/posta'

/**
 * Il servizio di Gestione progetti con dei finti al posto di disco, Drive e
 * posta: le azioni su questo PC, quelle mandate agli altri, i rifiuti quando
 * qualcuno lavora nel progetto, e la regola «il workspace si chiama come la
 * cartella».
 */
type Finto = {
  d: DepsGestione
  reg: () => RegistroProgetti
  col: () => Collegamenti
  stato: () => StatoGestione
  ws: string[]
  posta: { pc: string; c: ComandoPosta }[]
  esiti: Record<string, { stato: 'attesa' | 'consegnata' | 'fallita'; esito?: string }>
  recupero: string[]
  drive: string[]
  rinomineWs: string[]
  cartelle: Set<string>
  occupato: { valore?: string }
}

function finto(progetti: ProgettoDrive[], opz: { ws?: string[]; col?: Collegamenti; cartelle?: string[]; fermi?: Record<string, string> | 'ignoti'; copieQui?: { id: string; percorso: string }[] } = {}): Finto {
  let reg: RegistroProgetti = { versione: 1, progetti }
  let col = opz.col ?? collegamentiVuoti()
  let stato: StatoGestione = { richieste: [], eliminazioni: [] }
  const f: Omit<Finto, 'd'> & { d?: DepsGestione } = {
    reg: () => reg, col: () => col, stato: () => stato,
    ws: [...(opz.ws ?? [])], posta: [], esiti: {}, recupero: [], drive: [], rinomineWs: [],
    cartelle: new Set((opz.cartelle ?? progetti.map((p) => p.percorso).filter((x): x is string => x !== undefined)).map((x) => x.toLowerCase())),
    occupato: {}
  }
  let n = 0
  const d: DepsGestione = {
    io: () => ({ id: 'A', nome: 'Primo' }),
    registro: { leggi: () => reg, scrivi: (r) => { reg = r } },
    collegamenti: { leggi: () => col, scrivi: (c) => { col = c } },
    stato: { leggi: () => stato, scrivi: (s) => { stato = s } },
    workspace: () => f.ws,
    pc: () => [{ id: 'B', nome: 'Secondo', acceso: false }],
    locali: () => ({}),
    copieQui: () => opz.copieQui ?? [],
    esiste: (p) => f.cartelle.has(p.toLowerCase()),
    occupato: async () => f.occupato.valore,
    fermi: async () => (opz.fermi === 'ignoti' ? undefined : opz.fermi ?? {}),
    rinominaWorkspace: (a, b) => {
      if (f.ws.some((w) => w !== a && w === b)) throw new Error('c’è già')
      f.ws = f.ws.map((w) => (w === a ? b : w))
      f.rinomineWs.push(`${a}>${b}`)
    },
    spostaCwdWorkspace: () => undefined,
    rinominaCartella: (percorso, nome) => {
      const nuovo = percorso.replace(/[^\\]+$/, nome)
      f.cartelle.delete(percorso.toLowerCase())
      f.cartelle.add(nuovo.toLowerCase())
      return { ok: true, nuovoPercorso: nuovo, chatSpostate: 1, avvisi: [], mappa: (x) => x }
    },
    annullaCartella: () => undefined,
    togliDalDrive: async (id) => { f.drive.push(id); return { ok: true, tolti: 3 } },
    inRecupero: (c) => { f.recupero.push(c); f.cartelle.delete(c.toLowerCase()); return { ok: true } },
    vietata: (c) => /^[A-Z]:\\?$/i.test(c),
    pulisciCopia: async ({ percorso }) => ({ tipo: 'nel-recupero', percorso, messaggio: 'nel recupero' }),
    posta: {
      manda: async (pc, c) => { f.posta.push({ pc, c }); n += 1; return `v${n}` },
      esito: async (_pc, voce) => f.esiti[voce]
    },
    spostaQui: async () => ({ ok: true, messaggio: 'spostato' }),
    apri: () => undefined,
    apriRemoto: async () => ({ ok: true, messaggio: 'aperto' }),
    log: () => undefined,
    adesso: () => Date.parse('2026-11-13T10:00:00Z')
  }
  f.d = d
  return f as Finto
}

const sito = (extra: Partial<ProgettoDrive> = {}): ProgettoDrive => ({ id: 'p', nome: 'Sito', aggiuntoIl: '2026-10-01', proprietario: 'A', percorso: 'C:\\P\\Sito', ...extra })

describe('rinomina', () => {
  it('sul proprietario: cartella, registro, workspace collegato, tutto insieme', async () => {
    const f = finto([sito()], { ws: ['Sito'] })
    const g = creaGestioneProgetti(f.d)
    const e = await g.azione({ azione: 'rinomina', id: 'p', nome: 'Sito Web' })
    expect(e.ok).toBe(true)
    expect(f.reg().progetti[0]).toMatchObject({ nome: 'Sito Web', percorso: 'C:\\P\\Sito Web' })
    expect(f.ws).toEqual(['Sito Web'])
    expect(f.col().collegati['Sito Web']).toMatchObject({ id: 'p' })
  })

  it('mai mentre una chat lavora nel progetto', async () => {
    const f = finto([sito()], { ws: ['Sito'] })
    f.occupato.valore = 'una chat è al lavoro'
    const e = await creaGestioneProgetti(f.d).azione({ azione: 'rinomina', id: 'p', nome: 'Web' })
    expect(e).toMatchObject({ ok: false })
    expect(e.messaggio).toContain('una chat è al lavoro')
    expect(f.reg().progetti[0]?.nome).toBe('Sito')
  })

  it('mai il nome di un altro progetto o di un altro workspace di qui', async () => {
    const f = finto([sito(), sito({ id: 'q', nome: 'Altro', percorso: 'C:\\P\\Altro' })], { ws: ['Sito', 'Libero'] })
    const g = creaGestioneProgetti(f.d)
    expect((await g.azione({ azione: 'rinomina', id: 'p', nome: 'altro' })).ok).toBe(false)
    expect((await g.azione({ azione: 'rinomina', id: 'p', nome: 'Libero' })).ok).toBe(false)
  })

  it('su un altro PC: per posta, e il workspace di qui segue al giro dopo', async () => {
    const f = finto([sito({ proprietario: 'B', percorso: 'D:\\Sito' })], { ws: ['Sito'] })
    const g = creaGestioneProgetti(f.d)
    const e = await g.azione({ azione: 'rinomina', id: 'p', nome: 'Web' })
    expect(e.ok).toBe(true)
    expect(f.posta).toEqual([{ pc: 'B', c: { tipo: 'progetto-rinomina', progetto: 'p', nome: 'Web' } }])
    expect(f.stato().richieste[0]).toMatchObject({ tipo: 'progetto-rinomina', stato: 'attesa', pcNome: 'Secondo' })
    // Arriva dal Drive il registro col nome nuovo: il workspace prende il nome.
    f.d.registro.scrivi({ versione: 1, progetti: [sito({ nome: 'Web', proprietario: 'B', percorso: 'D:\\Web' })] })
    await g.segui()
    expect(f.ws).toEqual(['Web'])
  })

  it('dal pannello dei workspace: il nome nuovo rinomina anche la cartella; un progetto di un altro PC rifiuta', async () => {
    const f = finto([sito()], { ws: ['Sito'] })
    const g = creaGestioneProgetti(f.d)
    expect(await g.primaDiRinominareWorkspace('Sito', 'Nuovo')).toBeUndefined()
    expect(f.reg().progetti[0]).toMatchObject({ nome: 'Nuovo', percorso: 'C:\\P\\Nuovo' })
    expect(f.ws).toEqual(['Sito'])
    const h = creaGestioneProgetti(finto([sito({ proprietario: 'B', percorso: 'D:\\Sito' })], { ws: ['Sito'] }).d)
    expect(await h.primaDiRinominareWorkspace('Sito', 'Nuovo')).toContain('Secondo')
  })
})

describe('elimina ovunque', () => {
  it('qui nel recupero, agli altri PC per posta, il Drive solo quando tutti hanno finito', async () => {
    const f = finto([sito(), sito({ id: 'q', nome: 'sito', proprietario: 'B', percorso: 'D:\\Sito' })], { ws: ['Sito'] })
    const g = creaGestioneProgetti(f.d)
    const e = await g.azione({ azione: 'elimina-ovunque', ids: ['p', 'q'] })
    expect(e.ok).toBe(true)
    expect(f.recupero).toEqual(['C:\\P\\Sito'])
    expect(f.posta).toEqual([{ pc: 'B', c: { tipo: 'progetto-elimina', progetto: 'p', nome: 'Sito', percorsi: ['D:\\Sito'] } }])
    expect(f.reg().progetti).toEqual([])
    expect(Object.keys(f.reg().tolti ?? {}).sort()).toEqual(['p', 'q'])
    expect(f.drive).toEqual([])
    f.esiti.v1 = { stato: 'consegnata', esito: 'nel recupero' }
    await g.avanza()
    expect(f.drive).toEqual(['p'])
    expect(f.stato().eliminazioni[0]?.driveTolto).toBeDefined()
    await g.avanza()
    expect(f.drive).toEqual(['p'])
  })

  it('mai mentre ci si lavora qui', async () => {
    const f = finto([sito()], { ws: ['Sito'] })
    f.occupato.valore = 'un autopilota è al lavoro'
    const e = await creaGestioneProgetti(f.d).azione({ azione: 'elimina-ovunque', id: 'p' })
    expect(e.ok).toBe(false)
    expect(f.recupero).toEqual([])
    expect(f.reg().progetti).toHaveLength(1)
  })

  it('il comando per posta tocca solo le cartelle col nome del progetto, mai una di sistema', async () => {
    const f = finto([], { cartelle: ['D:\\Sito', 'D:\\Altro', 'D:\\'] })
    const r = await creaGestioneProgetti(f.d).comando({ tipo: 'progetto-elimina', progetto: 'p', nome: 'Sito', percorsi: ['D:\\Sito', 'D:\\Altro', 'D:\\'] }, 'B')
    expect(r?.ok).toBe(true)
    expect(f.recupero).toEqual(['D:\\Sito'])
  })

  it('il comando per posta con una chat al lavoro: si riprova dopo', async () => {
    const f = finto([], { cartelle: ['D:\\Sito'] })
    f.occupato.valore = 'chat aperta'
    const r = await creaGestioneProgetti(f.d).comando({ tipo: 'progetto-elimina', progetto: 'p', nome: 'Sito', percorsi: ['D:\\Sito'] }, 'B')
    expect(r).toMatchObject({ ok: false, riprova: true })
  })
})

describe('le altre azioni', () => {
  it('imposta proprietario: qui solo con la cartella che c’è; un altro PC solo se dice di averla', async () => {
    const f = finto([sito({ proprietario: 'B', percorso: 'D:\\Sito' })], { cartelle: ['E:\\Sito'] })
    const g = creaGestioneProgetti(f.d)
    expect((await g.azione({ azione: 'imposta-proprietario', id: 'p', pc: 'A', percorso: 'E:\\Manca' })).ok).toBe(false)
    expect((await g.azione({ azione: 'imposta-proprietario', id: 'p', pc: 'C', percorso: 'X:\\Sito' })).ok).toBe(false)
    expect((await g.azione({ azione: 'imposta-proprietario', id: 'p', pc: 'A', percorso: 'E:\\Sito' })).ok).toBe(true)
    expect(f.reg().progetti[0]).toMatchObject({ proprietario: 'A', percorso: 'E:\\Sito' })
  })

  it('unisci: i workspace collegati alle voci tolte passano a quella che resta', async () => {
    const col = collega(collegamentiVuoti(), 'Sito', { id: 'q', nome: 'Sito' })
    const f = finto([sito(), sito({ id: 'q', proprietario: 'B', percorso: 'D:\\Sito' })], { ws: ['Sito'], col })
    const e = await creaGestioneProgetti(f.d).azione({ azione: 'unisci', tieni: 'p', ids: ['p', 'q'] })
    expect(e.ok).toBe(true)
    expect(f.reg().progetti.map((x) => x.id)).toEqual(['p'])
    expect(f.col().collegati.Sito?.id).toBe('p')
  })

  it('sposta su un altro PC: per posta; collega e scollega un workspace', async () => {
    const f = finto([sito()], { ws: ['Sito', 'Prove'] })
    const g = creaGestioneProgetti(f.d)
    expect((await g.azione({ azione: 'sposta', id: 'p', pc: 'B' })).ok).toBe(true)
    expect(f.posta[0]).toEqual({ pc: 'B', c: { tipo: 'progetto-sposta-qui', progetto: 'p' } })
    expect((await g.azione({ azione: 'collega', id: 'p', ws: 'Prove' })).messaggio).toContain('Rinomina')
    expect(f.col().collegati.Prove?.id).toBe('p')
    expect((await g.azione({ azione: 'scollega', ws: 'Prove' })).ok).toBe(true)
    expect(f.col().collegati.Prove).toBeUndefined()
    expect((await g.azione({ azione: 'collega', id: 'p', ws: 'Manca' })).ok).toBe(false)
  })

  it('pulisci copia: mai la cartella del proprietario', async () => {
    const f = finto([sito()], { copieQui: [] })
    const g = creaGestioneProgetti(f.d)
    expect((await g.azione({ azione: 'pulisci-copia', id: 'p', pc: 'A', percorso: 'c:\\p\\sito' })).ok).toBe(false)
    expect((await g.azione({ azione: 'pulisci-copia', id: 'p', pc: 'A', percorso: 'E:\\Vecchia\\Sito' })).ok).toBe(true)
  })

  it('togli dal Drive: il registro solo se il Drive ha risposto', async () => {
    const f = finto([sito()])
    f.d.togliDalDrive = async () => ({ ok: false, messaggio: 'niente rete' })
    const g = creaGestioneProgetti(f.d)
    expect((await g.azione({ azione: 'togli-drive', id: 'p' })).ok).toBe(false)
    expect(f.reg().progetti).toHaveLength(1)
  })
})

describe('il workspace si chiama come la cartella', () => {
  it('la sistemazione di una volta: rinomina, copia di sicurezza, e «Torna come prima»', async () => {
    const copie: string[] = []
    const col = collega(collegamentiVuoti(), 'Sito vecchio', { id: 'p', nome: 'Sito' })
    const f = finto([sito()], { ws: ['Sito vecchio'], col })
    f.d.copiaWorkspace = (n) => { copie.push(n) }
    const g = creaGestioneProgetti(f.d)
    const m = await g.migraNomi()
    expect(m?.rinominati).toEqual([{ da: 'Sito vecchio', a: 'Sito' }])
    expect(f.ws).toEqual(['Sito'])
    expect(copie).toEqual(['workspaces.prima-dei-nomi.json'])
    // Una volta sola.
    f.ws = ['Sito vecchio']
    expect(await g.migraNomi()).toBe(m)
    expect(f.ws).toEqual(['Sito vecchio'])
    f.ws = ['Sito']
    expect((await g.azione({ azione: 'torna-nomi' })).ok).toBe(true)
    expect(f.ws).toEqual(['Sito vecchio'])
    expect(f.stato().migrazione?.tornataIl).toBeDefined()
  })

  it('rimandata finché non si sa quali workspace sono la casa di un autopilota', async () => {
    const col = collega(collegamentiVuoti(), 'Sito vecchio', { id: 'p', nome: 'Sito' })
    const f = finto([sito()], { ws: ['Sito vecchio'], col, fermi: 'ignoti' })
    expect(await creaGestioneProgetti(f.d).migraNomi()).toBeUndefined()
    expect(f.ws).toEqual(['Sito vecchio'])
    expect(f.stato().migrazione).toBeUndefined()
  })

  it('un workspace nuovo per un progetto che c’è già prende il nome della cartella e si collega', async () => {
    const f = finto([sito()], { ws: ['sito'] })
    const finale = await creaGestioneProgetti(f.d).dopoCreato('sito')
    expect(finale).toBe('Sito')
    expect(f.ws).toEqual(['Sito'])
    expect(f.col().collegati.Sito?.id).toBe('p')
  })

  it('i collegamenti seguono il workspace rinominato o eliminato dal pannello', () => {
    const col = collega(collegamentiVuoti(), 'Sito', { id: 'p', nome: 'Sito' })
    const f = finto([sito()], { ws: ['Sito'], col })
    const g = creaGestioneProgetti(f.d)
    g.dopoNome('Sito', 'Web')
    expect(f.col().collegati.Web?.id).toBe('p')
    g.dopoNome('Web', undefined)
    expect(f.col().collegati.Web).toBeUndefined()
  })
})
