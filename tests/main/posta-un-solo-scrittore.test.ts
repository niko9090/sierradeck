import { describe, it, expect } from 'vitest'
import {
  creaPostino, nomeBattitoPc, nomePosta, nomeUscita, nomeEsiti, unisciCassetta,
  type BattitoPc, type ChatDiPc, type Posta, type VocePosta
} from '../../src/main/progetti/posta'
import type { Scatola } from '../../src/main/progetti/posta'

/**
 * Audit I1 (0.86.2): la cassetta di un PC sul Drive era letta, cambiata e
 * riscritta da chiunque senza lucchetto, e la consegna scriveva nella chat
 * prima di segnare la voce consegnata. Adesso ogni file ha un solo scrittore
 * e l'esito si scrive prima del comando.
 */
type ScatolaProva = Scatola & { dati: Map<string, unknown>; guasti: Set<string> }

function scatolaLenta(): ScatolaProva {
  const dati = new Map<string, unknown>()
  const guasti = new Set<string>()
  // Una lettura e una scrittura ci mettono un turno: due PC che scrivono insieme si incrociano davvero.
  const turno = (): Promise<void> => new Promise((r) => { setTimeout(r, 1) })
  return {
    dati, guasti,
    leggi: async <T,>(nome: string) => { await turno(); const v = dati.get(nome); return (v === undefined ? undefined : JSON.parse(JSON.stringify(v))) as T | undefined },
    scrivi: async (nome, oggetto) => {
      await turno()
      if (guasti.has(nome)) throw new Error(`Drive: scrittura di ${nome} fallita`)
      dati.set(nome, JSON.parse(JSON.stringify(oggetto)))
    },
    cancella: async (nome) => { await turno(); dati.delete(nome) },
    elenca: async (prefisso) => { await turno(); return [...dati.keys()].filter((k) => k.startsWith(prefisso)) }
  }
}

const NAS = 'Z:\\progetti\\prova'
const ORA = Date.parse('2026-10-30T08:00:00.000Z')

function pc(opts: { id: string; nome: string; scatola: Scatola; cartelle?: string[]; consegnate?: { ids: string[] }; scriviRompe?: boolean }) {
  let chat: ChatDiPc[] = []
  const scritti: string[] = []
  const registro: string[] = []
  let n = 0
  const postino = creaPostino({
    scatola: () => opts.scatola,
    pcId: () => opts.id,
    pcNome: () => opts.nome,
    versione: () => '0.86.2',
    chat: () => chat,
    cartelle: () => opts.cartelle ?? [],
    cartellaEsiste: (c) => (opts.cartelle ?? []).includes(c),
    apriChat: () => undefined,
    riprendiChat: () => undefined,
    scrivi: (_id, testo) => { if (opts.scriviRompe === true) throw new Error('chat chiusa'); scritti.push(testo) },
    adesso: () => ORA,
    nuovoId: () => `${opts.id}-${++n}`,
    log: (m) => { registro.push(m) },
    ...(opts.consegnate !== undefined ? { consegnate: { leggi: () => opts.consegnate?.ids ?? [], scrivi: (ids: string[]) => { if (opts.consegnate) opts.consegnate.ids = ids } } } : {})
  })
  return { postino, scritti, registro, chat: (c: ChatDiPc[]) => { chat = c } }
}

const pronta: ChatDiPc = { id: 'p1', sessione: 's1', titolo: 'prova', cwd: NAS, viva: true, aspetta: true }

async function treP(scatola: ScatolaProva) {
  const a = pc({ id: 'A', nome: 'Torre', scatola, cartelle: [NAS] })
  const b = pc({ id: 'B', nome: 'Portatile', scatola })
  const c = pc({ id: 'C', nome: 'Ufficio', scatola })
  // Tutti battono, poi tutti si conoscono.
  await a.postino.giro(); await b.postino.giro(); await c.postino.giro()
  await a.postino.pc(); await b.postino.pc(); await c.postino.pc()
  return { a, b, c }
}

describe('posta: un solo scrittore per file', () => {
  it('due PC che scrivono insieme alla torre non si cancellano i messaggi', async () => {
    const scatola = scatolaLenta()
    const { a, b, c } = await treP(scatola)
    await Promise.all([
      b.postino.aggiungi('A', { cwd: NAS, testo: 'dal portatile' }),
      c.postino.aggiungi('A', { cwd: NAS, testo: 'dall ufficio' }),
      b.postino.aggiungi('A', { cwd: NAS, testo: 'ancora dal portatile' })
    ])
    const vista = (await a.postino.posta('A')) as Posta
    expect(vista.voci.map((v) => v.testo).sort()).toEqual(['ancora dal portatile', 'dal portatile', 'dall ufficio'])
    // Ognuno ha scritto solo nella sua cassetta d'uscita; la cassetta unica non c'e'.
    expect(scatola.dati.has(nomeUscita('A', 'B'))).toBe(true)
    expect(scatola.dati.has(nomeUscita('A', 'C'))).toBe(true)
    expect(scatola.dati.has(nomePosta('A'))).toBe(false)
    a.chat([pronta])
    await a.postino.giro(); await a.postino.giro(); await a.postino.giro(); await a.postino.giro()
    expect(a.scritti.sort()).toEqual(['ancora dal portatile', 'dal portatile', 'dall ufficio'])
    // Gli esiti li scrive solo la torre, e tutti li vedono.
    expect(scatola.dati.has(nomeEsiti('A'))).toBe(true)
    expect(((await b.postino.posta('A')) as Posta).voci.every((v) => v.stato === 'consegnata')).toBe(true)
  })

  it('se il Drive non prende l\'esito, il comando non si scrive; al giro dopo si scrive una volta sola', async () => {
    const scatola = scatolaLenta()
    const { a, b } = await treP(scatola)
    await b.postino.aggiungi('A', { cwd: NAS, testo: 'una volta' })
    a.chat([pronta])
    scatola.guasti.add(nomeEsiti('A'))
    await a.postino.giro()
    expect(a.scritti).toEqual([])
    scatola.guasti.delete(nomeEsiti('A'))
    await a.postino.giro()
    await a.postino.giro()
    expect(a.scritti).toEqual(['una volta'])
  })

  it('un Drive che rilegge l\'esito vecchio non fa riscrivere il comando, nemmeno dopo un riavvio', async () => {
    const scatola = scatolaLenta()
    const memoria = { ids: [] as string[] }
    const { b } = await treP(scatola)
    const a = pc({ id: 'A', nome: 'Torre', scatola, cartelle: [NAS], consegnate: memoria })
    await a.postino.giro(); await a.postino.pc()
    await b.postino.aggiungi('A', { cwd: NAS, testo: 'mai due volte' })
    a.chat([pronta])
    await a.postino.giro()
    expect(a.scritti).toEqual(['mai due volte'])
    expect(memoria.ids).toHaveLength(1)
    // Il file degli esiti sparisce (una copia vecchia, un Drive che non ha ancora visto la scrittura).
    scatola.dati.delete(nomeEsiti('A'))
    await a.postino.giro()
    expect(a.scritti).toEqual(['mai due volte'])
    // Riavvio: un postino nuovo, con la stessa memoria su disco.
    const dopo = pc({ id: 'A', nome: 'Torre', scatola, cartelle: [NAS], consegnate: memoria })
    await dopo.postino.giro(); await dopo.postino.pc()
    dopo.chat([pronta])
    await dopo.postino.giro()
    expect(dopo.scritti).toEqual([])
  })

  it('una chat che non prende il testo: la voce fallisce e lo dice, senza riprovare all\'infinito', async () => {
    const scatola = scatolaLenta()
    const { b } = await treP(scatola)
    const a = pc({ id: 'A', nome: 'Torre', scatola, cartelle: [NAS], scriviRompe: true })
    await a.postino.giro(); await a.postino.pc()
    await b.postino.aggiungi('A', { cwd: NAS, testo: 'x' })
    a.chat([pronta])
    await a.postino.giro()
    const v = ((await b.postino.posta('A')) as Posta).voci[0]
    expect(v?.stato).toBe('fallita')
    expect(v?.esito).toContain('chat chiusa')
  })

  it('togli e pulisci una voce di un altro mittente non toccano la sua cassetta', async () => {
    const scatola = scatolaLenta()
    const { a, b, c } = await treP(scatola)
    await b.postino.aggiungi('A', { cwd: NAS, testo: 'di B' })
    await c.postino.aggiungi('A', { cwd: NAS, testo: 'di C' })
    const prima = JSON.stringify(scatola.dati.get(nomeUscita('A', 'B')))
    const idB = ((await c.postino.posta('A')) as Posta).voci.find((v) => v.testo === 'di B')?.id as string
    const dopo = await c.postino.togli('A', idB)
    expect(dopo?.voci.map((v) => v.testo)).toEqual(['di C'])
    expect(JSON.stringify(scatola.dati.get(nomeUscita('A', 'B')))).toBe(prima)
    // E la torre non consegna la voce tolta.
    a.chat([pronta])
    await a.postino.giro(); await a.postino.giro()
    expect(a.scritti).toEqual(['di C'])
    const pulita = await b.postino.pulisci('A')
    expect(pulita?.voci).toEqual([])
  })
})

describe('posta: un PC fermo a una versione vecchia (0.79.0)', () => {
  const vecchio = (pcId: string, nome: string): BattitoPc =>
    ({ pcId, nome, versione: '0.79.0', battito: new Date(ORA).toISOString(), cartelle: [NAS], chat: [] })

  it('le sue voci nella cassetta unica si consegnano, e l\'esito torna anche li\'', async () => {
    const scatola = scatolaLenta()
    const voce: VocePosta = { id: 'v-vecchio', testo: 'dal PC vecchio', cwd: NAS, creataIl: new Date(ORA).toISOString(), daPc: 'V', daNome: 'Vecchio', stato: 'attesa' }
    scatola.dati.set(nomePosta('A'), { voci: [voce] })
    const a = pc({ id: 'A', nome: 'Torre', scatola, cartelle: [NAS] })
    a.chat([pronta])
    await a.postino.giro()
    await a.postino.giro()
    expect(a.scritti).toEqual(['dal PC vecchio'])
    expect((scatola.dati.get(nomePosta('A')) as Posta).voci[0]?.stato).toBe('consegnata')
  })

  it('se riscrivere la cassetta unica fallisce dopo la consegna, il comando non si riscrive', async () => {
    const scatola = scatolaLenta()
    const voce: VocePosta = { id: 'v-vecchio', testo: 'una volta sola', cwd: NAS, creataIl: new Date(ORA).toISOString(), daPc: 'V', daNome: 'Vecchio', stato: 'attesa' }
    scatola.dati.set(nomePosta('A'), { voci: [voce] })
    scatola.guasti.add(nomePosta('A'))
    const a = pc({ id: 'A', nome: 'Torre', scatola, cartelle: [NAS] })
    a.chat([pronta])
    await a.postino.giro(); await a.postino.giro(); await a.postino.giro()
    expect(a.scritti).toEqual(['una volta sola'])
    expect(a.registro.some((r) => r.includes('cassetta vecchia'))).toBe(true)
  })

  it('a un PC che non dice `posta` nel battito si scrive ancora nella cassetta unica', async () => {
    const scatola = scatolaLenta()
    scatola.dati.set(nomeBattitoPc('V'), vecchio('V', 'Vecchio'))
    const a = pc({ id: 'A', nome: 'Torre', scatola })
    await a.postino.giro()
    await a.postino.aggiungi('V', { cwd: NAS, testo: 'per il vecchio' })
    expect((scatola.dati.get(nomePosta('V')) as Posta).voci.map((v) => v.testo)).toEqual(['per il vecchio'])
    expect(scatola.dati.has(nomeUscita('V', 'A'))).toBe(false)
  })
})

describe('unisciCassetta', () => {
  it('unisce, applica gli esiti, toglie le tolte, in ordine di creazione', () => {
    const v = (id: string, il: string): VocePosta => ({ id, testo: id, cwd: NAS, creataIl: il, daPc: 'B', daNome: 'B', stato: 'attesa' })
    const p = unisciCassetta({
      vecchia: { voci: [v('a', '2026-10-30T08:02:00Z')] },
      uscite: [{ voci: [v('b', '2026-10-30T08:01:00Z'), v('c', '2026-10-30T08:03:00Z')] }, { voci: [], tolte: ['c'] }],
      esiti: { b: { stato: 'consegnata', esito: 'ok', il: '2026-10-30T08:04:00Z' } }
    })
    expect(p.voci.map((x) => `${x.id}:${x.stato}`)).toEqual(['b:consegnata', 'a:attesa'])
    expect(p.voci[0]).not.toHaveProperty('il')
  })
})
