import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomBytes } from 'node:crypto'
import { archivioInMemoria } from '../../src/main/cassaforte/archivio'
import { salvaIncrementale, leggiManifesto, manifestoVuoto } from '../../src/main/cassaforte/incrementale'
import { creaUnaCasa, OGGETTO_CASE, type ChatLocale } from '../../src/main/una-casa'
import { creaSpostaProgetto, impronteSessioni } from '../../src/main/sposta-progetto'
import { saleDaQui, type CaseChat } from '@shared/una-casa'
import type { Scatola } from '../../src/main/progetti/presenza'
import type { BattitoPc } from '@shared/posta'

/**
 * 0.42.0, «una chat, una casa», sul disco vero (cartelle temporanee): il
 * riordino sposta senza cancellare e si annulla; la sincronia carica solo le
 * chat di casa qui, con il loro PC; la procedura «Sposta progetto» verifica e
 * archivia.
 */
function scatolaInMemoria(): Scatola & { dati: Map<string, unknown> } {
  const dati = new Map<string, unknown>()
  return {
    dati,
    leggi: <T,>(nome: string) => Promise.resolve(dati.get(nome) as T | undefined),
    scrivi: (nome, oggetto) => { dati.set(nome, JSON.parse(JSON.stringify(oggetto))); return Promise.resolve() },
    cancella: (nome) => { dati.delete(nome); return Promise.resolve() }
  }
}

function ambiente() {
  const radice = mkdtempSync(join(tmpdir(), 'sd-casa-'))
  const progetti = join(radice, 'projects')
  const dati = join(radice, 'dati')
  const trading = join(radice, 'Trading')
  mkdirSync(trading, { recursive: true })
  const chat: ChatLocale[] = []
  const metti = (sessione: string, slug: string, cwd: string, testo: string): void => {
    mkdirSync(join(progetti, slug), { recursive: true })
    const f = join(progetti, slug, `${sessione}.jsonl`)
    writeFileSync(f, testo)
    chat.push({ sessione, slug, titolo: `chat ${sessione}`, cwd, jsonl: f })
  }
  // Una chat di qui (la cartella c'è solo qui), una del portatile (la cartella c'è solo là).
  metti('mia', 'C--Trading', trading, '{"mia":1}\n')
  metti('sua', 'C--Lavoro', 'C:\\Lavoro\\Gestionale', '{"sua":1}\n{"sua":2}\n')
  mkdirSync(join(progetti, 'C--Lavoro', 'sua', 'subagents'), { recursive: true })
  writeFileSync(join(progetti, 'C--Lavoro', 'sua', 'subagents', 'agent-1.jsonl'), '{"agente":1}\n')
  const battiti: BattitoPc[] = [{ pcId: 'lap', nome: 'LAPTOP', versione: '0.42.0', battito: '2026-10-02T12:00:00Z', cartelle: ['C:\\Lavoro\\Gestionale'], chat: [] }]
  const scatola = scatolaInMemoria()
  let aperte: { sessione?: string; cwd: string }[] = []
  const unaCasa = creaUnaCasa({
    dati, radiceProgetti: progetti,
    io: () => ({ id: 'fisso', nome: 'PC-Fisso' }),
    scatola: () => scatola,
    battiti: () => battiti,
    chatLocali: () => chat.filter((c) => existsSync(c.jsonl)),
    aperte: () => aperte,
    sulDrive: (s) => (s === 'sua' ? { size: 9 } : undefined),
    adesso: () => '2026-10-02T12:00:00.000Z'
  })
  return { radice, progetti, dati, trading, chat, scatola, unaCasa, apri: (a: typeof aperte) => { aperte = a } }
}

describe('il riordino sul disco', () => {
  it('propone le chat fuori casa con il motivo; le sposta nel recupero senza cancellarle; si annulla', async () => {
    const e = ambiente()
    const p = await e.unaCasa.proposte()
    expect(p.quante).toBe(1)
    expect(p.gruppi[0]).toMatchObject({ pc: 'lap', nome: 'LAPTOP', chat: [{ sessione: 'sua', casa: { pc: 'lap', regola: 'cartella' } }] })
    expect(p.gruppi[0]?.chat[0]?.casa.motivo).toContain('c\'è solo su LAPTOP')

    const r = await e.unaCasa.riordina(['sua'])
    // Il .jsonl e la cartella dei sotto-agenti: nel recupero, interi.
    expect(r.spostamenti).toHaveLength(2)
    const daSua = join(e.progetti, 'C--Lavoro', 'sua.jsonl')
    expect(existsSync(daSua)).toBe(false)
    const nelRecupero = r.spostamenti.find((s) => s.da.endsWith('sua.jsonl'))?.a ?? ''
    expect(readFileSync(nelRecupero, 'utf8')).toBe('{"sua":1}\n{"sua":2}\n')
    // La casa confermata da Nicholas, qui e sul Drive.
    expect(e.unaCasa.casaDi('sua')).toMatchObject({ pc: 'lap', da: 'nicholas' })
    expect((e.scatola.dati.get(OGGETTO_CASE) as CaseChat).case.sua?.pc).toBe('lap')
    // Non è più fuori casa: non c'è più qui.
    expect((await e.unaCasa.proposte()).quante).toBe(0)
    // Il registro c'è, e si annulla.
    expect(e.unaCasa.riordini().map((x) => x.id)).toEqual([r.id])
    const a = await e.unaCasa.annulla(r.id)
    expect(a).toMatchObject({ ok: true, rimessi: 2, restano: [] })
    expect(readFileSync(daSua, 'utf8')).toBe('{"sua":1}\n{"sua":2}\n')
    expect(existsSync(join(e.progetti, 'C--Lavoro', 'sua', 'subagents', 'agent-1.jsonl'))).toBe(true)
    expect(e.unaCasa.riordini()[0]?.annullatoIl).toBeDefined()
    expect((await e.unaCasa.annulla(r.id)).ok).toBe(false)
  })
  it('una chat aperta adesso non si sposta', async () => {
    const e = ambiente()
    e.apri([{ sessione: 'sua', cwd: 'C:\\Lavoro\\Gestionale' }])
    const p = await e.unaCasa.proposte()
    expect(p.aperte).toBe(1)
    const r = await e.unaCasa.riordina(['sua'])
    expect(r.spostamenti).toEqual([])
    expect(existsSync(join(e.progetti, 'C--Lavoro', 'sua.jsonl'))).toBe(true)
  })
  it('annullare non sovrascrive una copia nuova comparsa al suo posto', async () => {
    const e = ambiente()
    const r = await e.unaCasa.riordina(['sua'])
    writeFileSync(join(e.progetti, 'C--Lavoro', 'sua.jsonl'), 'copia nuova')
    const a = await e.unaCasa.annulla(r.id)
    expect(a.restano.map((x) => x.sessione)).toContain('sua')
    expect(readFileSync(join(e.progetti, 'C--Lavoro', 'sua.jsonl'), 'utf8')).toBe('copia nuova')
  })
  it('migrazione: le case di tutte le chat di qui, con la regola; le nuove per nascita', async () => {
    const e = ambiente()
    const tutte = await e.unaCasa.decidiTutte()
    expect(tutte.mia).toMatchObject({ pc: 'fisso', da: 'nascita' })
    expect(tutte.sua).toMatchObject({ pc: 'lap', da: 'regola' })
    await e.unaCasa.memorizza(tutte)
    expect(await e.unaCasa.nascite(() => false)).toBe(0)
  })
})

describe('la sincronia: solo le chat di casa qui, con il loro PC', () => {
  it('la copia fuori casa non sale; le chat caricate portano il PC', async () => {
    const e = ambiente()
    const tutte = await e.unaCasa.decidiTutte()
    await e.unaCasa.memorizza(tutte)
    const archivio = archivioInMemoria()
    const maestra = randomBytes(32)
    const esito = await salvaIncrementale({
      radici: [{ prefisso: 'chat', cartella: e.progetti, includi: (r) => r.endsWith('.jsonl') }],
      maestra, archivio, manifestoPrec: manifestoVuoto(), adesso: '2026-10-02T12:00:00.000Z',
      escludi: (p) => !saleDaQui(p, e.unaCasa.case(), 'fisso'),
      proprietario: 'fisso'
    })
    expect(Object.keys(esito.manifesto.file)).toEqual(['chat/C--Trading/mia.jsonl'])
    const m = await leggiManifesto(archivio, maestra)
    expect(m.stato === 'ok' ? m.manifesto.file['chat/C--Trading/mia.jsonl']?.pc : undefined).toBe('fisso')
  })
})

describe('«Sposta progetto», dal PC dove sta', () => {
  it('controlli, trasferimento, verifica, casa, archivio; e si annulla', async () => {
    const e = ambiente()
    const chiamate: { percorso: string; corpo: unknown }[] = []
    // Il PC di destinazione finto: ha ricevuto le stesse chat.
    const impronte = await impronteSessioni(e.progetti, ['mia'])
    const sposta = creaSpostaProgetto({
      io: () => ({ id: 'fisso', nome: 'PC-Fisso' }),
      unaCasa: e.unaCasa,
      chatLocali: () => e.chat.filter((c) => existsSync(c.jsonl)),
      aperte: () => [],
      autopilotiAlLavoro: async () => 0,
      driveCollegato: () => true,
      cassaforteAperta: () => true,
      altriPc: () => [{ pcId: 'lap', nome: 'LAPTOP' }],
      chiamaPc: async (_pc, percorso, corpo) => {
        chiamate.push({ percorso, corpo })
        if (percorso === '/api/sposta/pronto') return { versione: '0.42.0', nome: 'LAPTOP' }
        if (percorso === '/api/sposta/ricevi') return { ok: true, cartella: 'C:\\Progetti SierraDeck\\Trading' }
        return { file: impronte }
      },
      stradaDi: () => 'rete di casa',
      progettoSulDrive: (_cwd, metti) => (metti ? { id: 'p1', appenaMesso: true } : {}),
      salva: async () => ({ ok: true }),
      adesso: () => '2026-10-02T12:00:00.000Z'
    })
    expect(sposta.progetti().map((p) => p.nome)).toEqual(['Trading'])
    const c = await sposta.controlli(e.trading, 'lap')
    expect(c.every((x) => x.ok)).toBe(true)
    // Senza la cartella sul Drive e senza il permesso di metterla: si dice e ci si ferma.
    expect(await sposta.trasferisci(e.trading, 'lap', false)).toMatchObject({ ok: false, serveDrive: true })
    expect((await sposta.trasferisci(e.trading, 'lap', true)).ok).toBe(true)
    expect(chiamate.find((x) => x.percorso === '/api/sposta/ricevi')?.corpo).toMatchObject({ progetto: 'p1', sessioni: ['mia'], daNome: 'PC-Fisso' })
    expect(await sposta.verifica(e.trading, 'lap')).toMatchObject({ ok: true })
    await sposta.cambiaCasa(e.trading, 'lap')
    expect(e.unaCasa.casaDi('mia')).toMatchObject({ pc: 'lap', da: 'sposta' })
    const a = await sposta.archivia(e.trading, 'lap')
    expect(a.ok).toBe(true)
    expect(existsSync(join(e.progetti, 'C--Trading', 'mia.jsonl'))).toBe(false)
    // La cartella del codice resta dov'è.
    expect(existsSync(e.trading)).toBe(true)
    // «Annulla lo spostamento»: la chat torna, e la casa torna qui.
    const u = await e.unaCasa.annulla(a.registro?.id ?? '')
    expect(u.ok).toBe(true)
    expect(existsSync(join(e.progetti, 'C--Trading', 'mia.jsonl'))).toBe(true)
    expect(e.unaCasa.casaDi('mia')?.pc).toBe('fisso')
  })
  it('la verifica ferma tutto se una chat è arrivata diversa', async () => {
    const e = ambiente()
    const sposta = creaSpostaProgetto({
      io: () => ({ id: 'fisso', nome: 'PC-Fisso' }), unaCasa: e.unaCasa, chatLocali: () => e.chat, aperte: () => [],
      autopilotiAlLavoro: async () => 0, driveCollegato: () => true, cassaforteAperta: () => true,
      altriPc: () => [{ pcId: 'lap', nome: 'LAPTOP' }],
      chiamaPc: async () => ({ file: { mia: { size: 3, sha: 'diversa' } } }),
      stradaDi: () => undefined, progettoSulDrive: () => ({ id: 'p1' }), salva: async () => ({ ok: true })
    })
    const v = await sposta.verifica(e.trading, 'lap')
    expect(v.ok).toBe(false)
    expect(v.messaggio).toContain('la casa resta qui')
    expect(e.unaCasa.casaDi('mia')).toBeUndefined()
  })
  it('una destinazione che non risponde, o vecchia, ferma i controlli', async () => {
    const e = ambiente()
    const crea = (chiama: () => Promise<unknown>) => creaSpostaProgetto({
      io: () => ({ id: 'fisso', nome: 'PC-Fisso' }), unaCasa: e.unaCasa, chatLocali: () => e.chat, aperte: () => [],
      autopilotiAlLavoro: async () => 0, driveCollegato: () => true, cassaforteAperta: () => true,
      altriPc: () => [{ pcId: 'lap', nome: 'LAPTOP' }], chiamaPc: chiama, stradaDi: () => undefined,
      progettoSulDrive: () => ({ id: 'p1' }), salva: async () => ({ ok: true })
    })
    const muto = await crea(async () => { throw new Error('Non so se LAPTOP è acceso') }).controlli(e.trading, 'lap')
    expect(muto.find((x) => x.id === 'destinazione')).toMatchObject({ ok: false })
    const vecchio = await crea(async () => { throw new Error('errore 404 chat') }).controlli(e.trading, 'lap')
    expect(vecchio.find((x) => x.id === 'destinazione')?.cosaFare).toContain('0.42.0')
  })
})
