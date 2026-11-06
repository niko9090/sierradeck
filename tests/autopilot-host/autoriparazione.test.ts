import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { nuovoAutopilota, type Autopilota, type ChatGovernata } from '@shared/autopilota'
import { chiaveWorkspace } from '@shared/coda-richieste'
import { CARTELLA_COPIE_RIPARAZIONE } from '@shared/autoriparazione'
import { cartellaWorkspace } from '../../src/autopilot-host/coda-store'
import { impostazioniPredefinite, leggiImpostazioni, type ImpostazioniOrchestratore } from '../../src/autopilot-host/orchestratore-store'
import { passaAllUnico } from '../../src/autopilot-host/migra-orchestratore'
import { esitoVuoto } from '../../src/autopilot-host/autopulizia'
import { annullaRiparazioneServizio, riparaServizio, type DipendenzeRiparazioneServizio } from '../../src/autopilot-host/autoriparazione'

/**
 * k-59: l'autoriparazione dalla parte del servizio. Un mondo finto (archivio e
 * impostazioni in memoria con i file veri in una cartella temporanea), il
 * passaggio all'unico vero (`passaAllUnico`): si prova ogni caso dell'elenco, la
 * copia, l'idempotenza, le chat al lavoro che restano intatte, le «solo mia»
 * e «Torna come prima».
 */

const QUANDO = '2026-11-06T10:00:00.000Z'
const WS = 'Lavoro'

let dati = ''
let archivio: Map<string, Autopilota>
let imp: Map<string, ImpostazioniOrchestratore>
let occupate: Set<string>
let cartelle: Set<string>
let rami: Record<string, 'unito' | 'non-unito' | 'mancante' | 'ignoto'>
let righe: string[]
let nGiro = 0

const ap = (id: string, p: Partial<Autopilota> = {}): Autopilota => ({
  ...nuovoAutopilota({ id, nome: `Autopilota ${id}`, obiettivo: `obiettivo di ${id}`, cwd: 'prova/progetto', iniziatoIl: '2026-11-01T08:00:00.000Z', workspace: WS }),
  ...p
})
const chat = (id: string, p: Partial<ChatGovernata> = {}): ChatGovernata => ({ id, compito: `compito ${id}`, stato: 'bloccata', cicli: 1, sessionId: `s-${id}`, ...p })

const scrivi = (a: Autopilota): void => {
  archivio.set(a.id, a)
  mkdirSync(join(dati, 'autopiloti'), { recursive: true })
  writeFileSync(join(dati, 'autopiloti', `${a.id}.json`), JSON.stringify(a))
}
const impDi = (ws: string): ImpostazioniOrchestratore => imp.get(ws) ?? impostazioniPredefinite()
const cartellaWs = (ws: string): string => join(dati, 'orchestratori', cartellaWorkspace(ws))
const cambia = (ws: string, f: (i: ImpostazioniOrchestratore) => ImpostazioniOrchestratore): ImpostazioniOrchestratore => {
  const dopo = f(impDi(ws))
  imp.set(ws, dopo)
  mkdirSync(cartellaWs(ws), { recursive: true })
  writeFileSync(join(cartellaWs(ws), 'orchestratore.json'), JSON.stringify(dopo))
  return dopo
}

function deps(over: Partial<DipendenzeRiparazioneServizio> = {}): DipendenzeRiparazioneServizio {
  const vecchiDel = (ws: string): Autopilota[] => {
    const i = impDi(ws)
    const gia = new Set(i.assorbiti ?? [])
    return [...archivio.values()].filter((a) => chiaveWorkspace(a) === ws && a.id !== i.autopilota && !gia.has(a.id))
  }
  const unicoDi = (ws: string): Autopilota | undefined => { const i = impDi(ws); return i.autopilota === undefined ? undefined : archivio.get(i.autopilota) }
  return {
    dati,
    archivio: { cartella: join(dati, 'autopiloti'), elenca: () => [...archivio.values()], scrivi },
    orchestratori: { impostazioni: impDi, cambiaImpostazioni: cambia, dimentica: (ws) => { imp.delete(ws); const f = join(cartellaWs(ws), 'orchestratore.json'); if (existsSync(f)) imp.set(ws, leggiImpostazioni(JSON.parse(readFileSync(f, 'utf8')))) } },
    cartellaWs,
    wsDi: chiaveWorkspace,
    vecchiDel,
    unicoDi,
    unici: () => [...archivio.values()].filter((a) => impDi(chiaveWorkspace(a)).autopilota === a.id),
    assicura: (ws) => {
      const gia = unicoDi(ws)
      const loro = vecchiDel(ws)
      const passo = passaAllUnico({ ws, autopiloti: loro, id: 'ap-unico', adesso: QUANDO, ...(gia !== undefined ? { unico: gia } : {}) })
      scrivi(passo.unico)
      cambia(ws, (i) => ({ ...i, autopilota: passo.unico.id, assorbiti: [...new Set([...(i.assorbiti ?? []), ...passo.assorbiti])] }))
      return { ok: true, unico: passo.unico }
    },
    salva: scrivi,
    occupata: (a, c) => occupate.has(`${a.id}/${c.id}`),
    cartellaEsiste: (c) => cartelle.has(c),
    statoRamo: (_cwd, ramo) => rami[ramo] ?? 'mancante',
    adesso: () => QUANDO,
    log: (r) => { righe.push(r) },
    ...over
  }
}

const giro = (d: DipendenzeRiparazioneServizio = deps()) => riparaServizio(d, `20261106-1000${String(++nGiro).padStart(2, '0')}`)
const sistemati = (r: Awaited<ReturnType<typeof giro>>) => r.voci.filter((v) => v.esito === 'sistemato')
const copie = (): string[] => (existsSync(join(dati, CARTELLA_COPIE_RIPARAZIONE)) ? readdirSync(join(dati, CARTELLA_COPIE_RIPARAZIONE)) : [])
const grezzo = (id: string): string => readFileSync(join(dati, 'autopiloti', `${id}.json`), 'utf8')

beforeEach(() => {
  dati = mkdtempSync(join(tmpdir(), 'ripara-'))
  archivio = new Map(); imp = new Map(); occupate = new Set(); cartelle = new Set(['prova/progetto']); rami = {}; righe = []; nGiro = 0
})
afterEach(() => { rmSync(dati, { recursive: true, force: true }) })

describe('autopiloti di prima mai passati all’unico', () => {
  it('li passa all’autopilota del workspace e adotta le loro chat, con la copia', async () => {
    scrivi(ap('ap-1', { chats: [chat('c-1', { cartella: 'prova/progetto', ramo: 'ap/ap-1/c-1' })] }))
    scrivi(ap('ap-2', { chats: [chat('c-1')] }))
    const r = await giro()
    expect(sistemati(r)).toHaveLength(1)
    expect(sistemati(r)[0]).toMatchObject({ caso: 'autopiloti-di-prima', workspace: WS })
    expect(r.copiato).toBe(true)
    const unico = archivio.get('ap-unico')!
    expect(unico.chats.map((c) => c.origine?.autopilota)).toEqual(['ap-1', 'ap-2'])
    expect(impDi(WS).assorbiti).toEqual(['ap-1', 'ap-2'])
    expect(copie()).toHaveLength(1)
    expect(existsSync(join(dati, CARTELLA_COPIE_RIPARAZIONE, copie()[0]!, 'servizio', 'autopiloti', 'ap-1.json'))).toBe(true)
    expect(righe.some((x) => x.includes('[autoriparazione]'))).toBe(true)
  })

  it('un’autopilota con la migrazione fatta a metà (unico presente, uno di prima rimasto fuori) lo assorbe senza duplicare', async () => {
    scrivi(ap('ap-1', { chats: [chat('c-1')] }))
    await giro()
    scrivi(ap('ap-3', { chats: [chat('c-1')] }))
    const r = await giro()
    expect(sistemati(r)).toHaveLength(1)
    expect(archivio.get('ap-unico')!.chats).toHaveLength(2)
    expect(impDi(WS).assorbiti).toEqual(['ap-1', 'ap-3'])
  })

  it('è idempotente: la seconda volta non cambia niente e non fa copie', async () => {
    scrivi(ap('ap-1', { chats: [chat('c-1')] }))
    await giro()
    const prima = { file: readdirSync(join(dati, 'autopiloti')).map((n) => grezzo(n.replace('.json', ''))), copie: copie() }
    const r = await giro()
    expect(sistemati(r)).toHaveLength(0)
    expect(r.copiato).toBe(false)
    expect(copie()).toEqual(prima.copie)
    expect(readdirSync(join(dati, 'autopiloti')).map((n) => grezzo(n.replace('.json', '')))).toEqual(prima.file)
  })

  it('autopilota mancante: l’unico è scritto nelle impostazioni ma il suo file non c’è più', async () => {
    cambia(WS, (i) => ({ ...i, autopilota: 'ap-sparito' }))
    scrivi(ap('ap-1', { chats: [chat('c-1')] }))
    const r = await giro()
    expect(sistemati(r)[0]).toMatchObject({ caso: 'autopilota-mancante', workspace: WS })
    expect(impDi(WS).autopilota).toBe('ap-unico')
    expect(archivio.get('ap-unico')!.chats).toHaveLength(1)
  })

  it('una chat al lavoro non si tocca: il workspace aspetta, poi si ripara a turno finito', async () => {
    scrivi(ap('ap-1', { chats: [chat('c-1', { stato: 'lavoro' })] }))
    occupate.add('ap-1/c-1')
    const prima = grezzo('ap-1')
    const r = await giro()
    expect(r.voci).toEqual([expect.objectContaining({ caso: 'autopiloti-di-prima', esito: 'rimandato', workspace: WS })])
    expect(r.copiato).toBe(false)
    expect(grezzo('ap-1')).toBe(prima)
    expect(archivio.has('ap-unico')).toBe(false)
    expect(copie()).toEqual([])
    occupate.clear()
    const dopo = await giro()
    expect(sistemati(dopo)).toHaveLength(1)
    expect(grezzo('ap-1')).toBe(prima)
  })

  it('un autopilota «a chat sola» al lavoro conta come occupato', async () => {
    scrivi(ap('ap-1', { stato: 'lavoro', sessionId: 's-1' }))
    const r = await giro()
    expect(r.voci[0]).toMatchObject({ esito: 'rimandato' })
    expect(archivio.has('ap-unico')).toBe(false)
  })

  it('i vecchi archiviati non si riassorbono', async () => {
    scrivi(ap('ap-1', { archiviato: true, chats: [chat('c-1')] }))
    const r = await giro()
    expect(r.voci).toEqual([])
    expect(archivio.has('ap-unico')).toBe(false)
  })

  it('se il passaggio rifiuta, è un fallimento detto, non un’eccezione', async () => {
    scrivi(ap('ap-1', { chats: [chat('c-1')] }))
    const r = await giro(deps({ assicura: () => ({ ok: false, motivo: 'serve la cartella del progetto' }) }))
    expect(r.voci[0]).toMatchObject({ esito: 'fallito' })
    expect(r.voci[0]!.cosa).toContain('serve la cartella')
  })
})

describe('chat orfane', () => {
  const unicoCon = (chats: ChatGovernata[], extra: Partial<Autopilota> = {}): void => {
    scrivi(ap('ap-unico', { chats, ...extra }))
    cambia(WS, (i) => ({ ...i, autopilota: 'ap-unico' }))
  }

  it('una chat viva con la copia sparita e il ramo tolto si chiude, con la copia di scorta', async () => {
    unicoCon([chat('c-1', { cartella: 'prova/copia-sparita', ramo: 'ap/x/c-1' }), chat('c-2', { cartella: 'prova/progetto' })])
    const r = await giro()
    expect(sistemati(r)[0]).toMatchObject({ caso: 'chat-orfana', workspace: WS })
    const u = archivio.get('ap-unico')!
    expect(u.chats[0]).toMatchObject({ stato: 'finita', conclusa: { come: 'tolto' } })
    expect(u.chats[1]).toMatchObject({ stato: 'bloccata' })
    expect(u.decisioni.at(-1)!.cosa).toContain('orfana')
    expect(copie()).toHaveLength(1)
  })

  it('con il ramo già unito la chiude come unita', async () => {
    rami['ap/x/c-1'] = 'unito'
    unicoCon([chat('c-1', { cartella: 'prova/copia-sparita', ramo: 'ap/x/c-1' })])
    await giro()
    expect(archivio.get('ap-unico')!.chats[0]!.conclusa?.come).toBe('unito')
  })

  it('con lavoro non unito sul ramo (o ramo incerto) non la chiude: la segnala', async () => {
    rami['ap/x/c-1'] = 'non-unito'
    rami['ap/x/c-2'] = 'ignoto'
    unicoCon([chat('c-1', { cartella: 'prova/sparita-1', ramo: 'ap/x/c-1' }), chat('c-2', { cartella: 'prova/sparita-2', ramo: 'ap/x/c-2' })])
    const prima = grezzo('ap-unico')
    const r = await giro()
    expect(r.voci.filter((v) => v.esito === 'segnalato')).toHaveLength(2)
    expect(sistemati(r)).toHaveLength(0)
    expect(grezzo('ap-unico')).toBe(prima)
    expect(copie()).toEqual([])
  })

  it('una chat orfana ma al lavoro aspetta, e non cambia niente', async () => {
    unicoCon([chat('c-1', { stato: 'lavoro', cartella: 'prova/sparita', ramo: 'ap/x/c-1' })])
    occupate.add('ap-unico/c-1')
    const prima = grezzo('ap-unico')
    const r = await giro()
    expect(r.voci).toEqual([expect.objectContaining({ caso: 'chat-orfana', esito: 'rimandato' })])
    expect(grezzo('ap-unico')).toBe(prima)
  })

  it('se anche la cartella del progetto manca (disco staccato) non si giudica niente', async () => {
    cartelle.clear()
    unicoCon([chat('c-1', { cartella: 'prova/sparita' })])
    const prima = grezzo('ap-unico')
    expect((await giro()).voci).toEqual([])
    expect(grezzo('ap-unico')).toBe(prima)
  })

  it('è idempotente', async () => {
    unicoCon([chat('c-1', { cartella: 'prova/sparita' })])
    await giro()
    const dopoPrima = grezzo('ap-unico')
    const r = await giro()
    expect(sistemati(r)).toHaveLength(0)
    expect(r.copiato).toBe(false)
    expect(grezzo('ap-unico')).toBe(dopoPrima)
  })
})

describe('copie e rami di chat chiuse, solo mia', () => {
  it('l’autopulizia è riusata: le copie tolte sono un cambiamento, le cartelle da guardare una segnalazione', async () => {
    const e = { ...esitoVuoto(), copieTolte: 2, ramiTolti: 1, trascrizioniTolte: 3, daGuardare: [{ cosa: 'prova/ap-1-c-1', perche: 'ha dei file' }] }
    const r = await giro(deps({ autopulizia: async () => e }))
    expect(sistemati(r)).toEqual([expect.objectContaining({ caso: 'copie-e-rami' })])
    expect(r.voci.find((v) => v.esito === 'segnalato')!.cosa).toContain('ha dei file')
  })

  it('l’autopulizia che non riesce non ferma il resto', async () => {
    scrivi(ap('ap-1', { chats: [chat('c-1')] }))
    const r = await giro(deps({ autopulizia: async () => { throw new Error('git non risponde') } }))
    expect(r.voci.some((v) => v.caso === 'copie-e-rami' && v.esito === 'fallito')).toBe(true)
    expect(archivio.has('ap-unico')).toBe(true)
  })

  it('le chat «solo mia» si segnalano e basta: il file non cambia', async () => {
    scrivi(ap('ap-unico', { adottate: [{ sessionId: 's-mia', titolo: 'mia', soloMia: true, adottataIl: QUANDO }, { sessionId: 's-2', titolo: 'altra', adottataIl: QUANDO }] }))
    cambia(WS, (i) => ({ ...i, autopilota: 'ap-unico' }))
    const prima = grezzo('ap-unico')
    const r = await giro()
    expect(r.voci).toEqual([expect.objectContaining({ caso: 'chat-solo-mia', esito: 'segnalato', workspace: WS })])
    expect(grezzo('ap-unico')).toBe(prima)
    expect(r.copiato).toBe(false)
  })

  it('una «solo mia» di un autopilota di prima passa con la sua marcatura, intatta', async () => {
    scrivi(ap('ap-1', { adottate: [{ sessionId: 's-mia', titolo: 'mia', soloMia: true, adottataIl: QUANDO }], chats: [chat('c-1')] }))
    await giro()
    expect(archivio.get('ap-unico')!.adottate).toEqual([{ sessionId: 's-mia', titolo: 'mia', soloMia: true, adottataIl: QUANDO }])
  })
})

describe('«Torna come prima» dalla parte del servizio', () => {
  it('rimette i file com’erano; l’unico nato con la riparazione si archivia, non si cancella', async () => {
    scrivi(ap('ap-1', { chats: [chat('c-1')] }))
    const vecchio = grezzo('ap-1')
    await giro()
    const id = copie()[0]!
    const r = annullaRiparazioneServizio(deps(), id)
    expect(r.ripristinati).toEqual([WS])
    expect(grezzo('ap-1')).toBe(vecchio)
    expect(archivio.get('ap-unico')).toMatchObject({ archiviato: true })
    expect(existsSync(join(dati, 'autopiloti', 'ap-unico.json'))).toBe(true)
    expect(impDi(WS).autopilota).toBeUndefined()
    expect(impDi(WS).assorbiti).toBeUndefined()
  })

  it('rimette l’unico già presente com’era (chat orfana di nuovo viva)', async () => {
    scrivi(ap('ap-unico', { chats: [chat('c-1', { cartella: 'prova/sparita' })] }))
    cambia(WS, (i) => ({ ...i, autopilota: 'ap-unico' }))
    const prima = grezzo('ap-unico')
    await giro()
    expect(archivio.get('ap-unico')!.chats[0]!.stato).toBe('finita')
    annullaRiparazioneServizio(deps(), copie()[0]!)
    expect(grezzo('ap-unico')).toBe(prima)
  })

  it('se un autopilota coinvolto ha una chat al lavoro non lo tocca e lo dice', async () => {
    scrivi(ap('ap-1', { chats: [chat('c-1')] }))
    await giro()
    const dopo = grezzo('ap-unico')
    occupate.add('ap-unico/c-1')
    scrivi({ ...archivio.get('ap-unico')!, chats: archivio.get('ap-unico')!.chats.map((c) => ({ ...c, stato: 'lavoro' as const })) })
    const r = annullaRiparazioneServizio(deps(), copie()[0]!)
    expect(r.rimandati).toEqual([WS])
    expect(r.ripristinati).toEqual([])
    expect(archivio.get('ap-unico')!.archiviato).toBeUndefined()
    expect(dopo).toBeTruthy()
  })

  it('senza copia lo dice invece di rompersi', () => {
    expect(annullaRiparazioneServizio(deps(), '20260101-000000').errori).toHaveLength(1)
  })
})
