import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  creaSposta, creaLatoProprietario, pulisciCopia, improntaProgetto, giornaleSuDisco, copieNonMie, progettoDelloSlug, saleDaQuestoPc,
  type GiornaleSposta, type ManifestoSposta, type DipendenzeSposta
} from '../../src/main/progetti/sposta'
import { pathToSlug } from '../../src/main/indexer/project-scanner'
import { ErroreRemoto } from '../../src/main/pc-remoto'
import { registroVuoto, type RegistroProgetti, type RegistroProgettiStore } from '../../src/main/progetti/registro'

/**
 * «Sposta su questo PC» (0.88.0): il proprietario conferma, il PC nuovo
 * scarica e verifica le impronte, solo dopo cambia il proprietario, e la copia
 * di prima va nel recupero solo se è pulita. Due PC finti con un Drive in
 * memoria; cartelle temporanee.
 */
const sha = (b: Buffer | string): string => createHash('sha256').update(b).digest('hex')

function memoria(r: RegistroProgetti): RegistroProgettiStore & { r: RegistroProgetti } {
  const s = { r, leggi: () => s.r, scrivi: (x: RegistroProgetti) => { s.r = JSON.parse(JSON.stringify(x)) as RegistroProgetti } }
  return s
}

/** Un mondo: il fisso (proprietario) e il portatile (arriva), un Drive in memoria. */
function mondo() {
  const base = mkdtempSync(join(tmpdir(), 'sd-sposta-'))
  const fisso = { id: 'pc-f', nome: 'Fisso', cartellaProgetti: join(base, 'fisso', 'Progetti') }
  const port = { id: 'pc-l', nome: 'Portatile', cartellaProgetti: join(base, 'port', 'Progetti') }
  const percorsoDa = join(fisso.cartellaProgetti, 'Sito')
  mkdirSync(join(percorsoDa, 'src'), { recursive: true })
  writeFileSync(join(percorsoDa, 'README.md'), 'ciao')
  writeFileSync(join(percorsoDa, 'src', 'a.ts'), 'export const a = 1')
  const reg: RegistroProgetti = { versione: 1, progetti: [{ id: 'p1', nome: 'Sito', aggiuntoIl: '', proprietario: 'pc-f', percorso: percorsoDa, proprietarioDal: '2026-10-01T00:00:00.000Z' }] }
  const regFisso = memoria(JSON.parse(JSON.stringify(reg)) as RegistroProgetti)
  const regPort = memoria(JSON.parse(JSON.stringify(reg)) as RegistroProgetti)
  // Il Drive: chiave → contenuto, e il manifesto.
  const blob = new Map<string, Buffer>()
  const drive: ManifestoSposta = { file: {} }
  const carica = (k: string, b: Buffer): void => { blob.set(k, b); drive.file[k] = { nome: `f_${sha(k)}`, size: b.length, mtime: 1_700_000_000_000, sha: sha(b) } }
  const radiceChatFisso = join(base, 'fisso', 'claude')
  const radiceChatPort = join(base, 'port', 'claude')
  const slugDa = pathToSlug(percorsoDa)
  mkdirSync(join(radiceChatFisso, slugDa), { recursive: true })
  writeFileSync(join(radiceChatFisso, slugDa, 'ses-1.jsonl'), '{"cwd":"x"}\n')
  const salvaFisso = async (): Promise<{ ok: boolean }> => {
    carica('progetto-p1/README.md', readFileSync(join(percorsoDa, 'README.md')))
    carica('progetto-p1/src/a.ts', readFileSync(join(percorsoDa, 'src', 'a.ts')))
    carica(`chat/${slugDa}/ses-1.jsonl`, readFileSync(join(radiceChatFisso, slugDa, 'ses-1.jsonl')))
    return { ok: true }
  }
  const recuperoFisso: string[] = []
  const recuperoPort: string[] = []
  const inRecupero = (lista: string[]) => (c: string) => { const dove = `${c}.recupero`; renameSync(c, dove); lista.push(c); return { ok: true } }
  let fermate = 0
  let aperteFisso: { sessione?: string; alLavoro: boolean }[] = []
  let git = 0
  const proprietario = creaLatoProprietario({
    io: () => fisso,
    registro: regFisso,
    chatAperte: () => aperteFisso,
    fermaChat: async () => { fermate += aperteFisso.length; const n = aperteFisso.length; aperteFisso = []; return n },
    salva: salvaFisso,
    manifestoDrive: async () => JSON.parse(JSON.stringify(drive)) as ManifestoSposta,
    pulisci: ({ progetto, percorso }) => pulisciCopia({
      progetto, percorso, cartellaProgetti: fisso.cartellaProgetti,
      chatAperte: () => aperteFisso.length, gitDaSalvare: async () => git,
      manifestoDrive: async () => drive, inRecupero: inRecupero(recuperoFisso)
    })
  })
  let fissoAcceso = true
  const posta: { voce: string; comando: unknown; esito?: { stato: 'consegnata' | 'fallita'; esito: string } }[] = []
  const giornale = giornaleSuDisco(join(base, 'port', 'dati'))
  let corrompi = false
  const deps = (): DipendenzeSposta => ({
    io: () => port,
    registro: regPort,
    giornale,
    driveNonPronto: () => undefined,
    chiamaPc: async (_pc, percorso, corpo) => {
      if (!fissoAcceso) throw new ErroreRemoto('irraggiungibile', 'il fisso non risponde')
      const c = corpo as { progetto: string; verso: string; versoNome: string; percorso: string; proprietarioDal: string }
      if (percorso === '/api/sposta/prepara') return proprietario.prepara(c)
      if (percorso === '/api/sposta/concludi') return proprietario.concludi(c)
      throw new Error(`rotta inattesa ${percorso}`)
    },
    posta: {
      chiedi: async (_pc, comando) => { const voce = `v${posta.length + 1}`; posta.push({ voce, comando }); return voce },
      esito: async (_pc, voce) => posta.find((x) => x.voce === voce)?.esito ?? { stato: 'attesa' }
    },
    manifestoDrive: async () => JSON.parse(JSON.stringify(drive)) as ManifestoSposta,
    leggiFileDrive: async (k) => { const b = blob.get(k); return b === undefined ? undefined : corrompi && k.endsWith('a.ts') ? Buffer.from('rotto') : b },
    radiceChat: () => radiceChatPort,
    salvaRegistro: async () => undefined,
    inRecupero: inRecupero(recuperoPort),
    nomeDi: (id) => (id === 'pc-f' ? 'Fisso' : id),
    adesso: () => '2026-10-30T12:00:00.000Z',
    nuovoId: () => 'sp-1'
  })
  return {
    base, fisso, port, percorsoDa, regFisso, regPort, drive, recuperoFisso, recuperoPort, posta, giornale, radiceChatPort, slugDa, proprietario,
    deps, salvaFisso,
    fermate: () => fermate,
    apri: (c: { sessione?: string; alLavoro: boolean }[]) => { aperteFisso = c },
    spegni: () => { fissoAcceso = false },
    accendi: () => { fissoAcceso = true },
    gitSporco: (n: number) => { git = n },
    corrompi: (x: boolean) => { corrompi = x }
  }
}

describe('Sposta su questo PC', () => {
  it('il caso buono: ferma le chat, scarica, verifica, cambia proprietario, la copia di prima nel recupero', async () => {
    const m = mondo()
    m.apri([{ sessione: 'ses-1', alLavoro: false }])
    const g = await creaSposta(m.deps()).avvia('p1')
    expect(g.fase).toBe('fatta')
    expect(m.fermate()).toBe(1)
    const qui = join(m.port.cartellaProgetti, 'Sito')
    expect(readFileSync(join(qui, 'src', 'a.ts'), 'utf8')).toBe('export const a = 1')
    expect(readFileSync(join(m.radiceChatPort, pathToSlug(qui), 'ses-1.jsonl'), 'utf8')).toBe('{"cwd":"x"}\n')
    expect(g).toMatchObject({ file: 2, chat: 1, vecchiaCopia: 'nel-recupero' })
    expect(m.regPort.r.progetti[0]).toMatchObject({ proprietario: 'pc-l', percorso: qui })
    expect(m.regFisso.r.progetti[0]).toMatchObject({ proprietario: 'pc-l', percorso: qui })
    expect(m.recuperoFisso).toEqual([m.percorsoDa])
    expect(existsSync(m.percorsoDa)).toBe(false)
    expect(existsSync(`${m.percorsoDa}.recupero`)).toBe(true)
  })

  it('una chat che lavora sul proprietario: si aspetta, non si ferma niente', async () => {
    const m = mondo()
    m.apri([{ sessione: 'ses-1', alLavoro: true }])
    const s = creaSposta(m.deps())
    const g = await s.avvia('p1')
    expect(g.fase).toBe('attesa-proprietario')
    expect(m.fermate()).toBe(0)
    expect(m.regPort.r.progetti[0]?.proprietario).toBe('pc-f')
    m.apri([{ sessione: 'ses-1', alLavoro: false }])
    expect((await s.riprendi())?.fase).toBe('fatta')
  })

  it('il proprietario è spento: richiesta nella posta, poi si continua da soli quando risponde', async () => {
    const m = mondo()
    m.spegni()
    const s = creaSposta(m.deps())
    const g = await s.avvia('p1')
    expect(g.fase).toBe('attesa-proprietario')
    expect(m.posta[0]?.comando).toMatchObject({ tipo: 'sposta-prepara', progetto: 'p1', verso: 'pc-l' })
    expect(m.regPort.r.progetti[0]?.proprietario).toBe('pc-f')
    // Un giro più tardi, ancora spento: niente di nuovo, nessuna seconda voce.
    expect((await s.riprendi())?.fase).toBe('attesa-proprietario')
    expect(m.posta).toHaveLength(1)
    // Il fisso si accende e il suo postino esegue il comando: l'esito arriva nella posta.
    const esito = await m.proprietario.prepara({ progetto: 'p1', verso: 'pc-l', versoNome: 'Portatile' })
    ;(m.posta[0] as { esito?: unknown }).esito = { stato: 'consegnata', esito: JSON.stringify(esito) }
    const dopo = await s.riprendi()
    // Ancora spento per la strada diretta: la copia di prima la toglie quando torna (posta).
    expect(dopo?.fase).toBe('fatta')
    expect(dopo?.vecchiaCopia).toBe('in-attesa')
    expect(m.posta[1]?.comando).toMatchObject({ tipo: 'sposta-concludi', verso: 'pc-l' })
    expect(m.regPort.r.progetti[0]?.proprietario).toBe('pc-l')
  })

  it('un impronta diversa ferma tutto: il proprietario non cambia, la copia scaricata va nel recupero', async () => {
    const m = mondo()
    m.corrompi(true)
    const g = await creaSposta(m.deps()).avvia('p1')
    expect(g.fase).toBe('fallita')
    expect(g.errore).toContain('non sono arrivati uguali')
    expect(m.regPort.r.progetti[0]?.proprietario).toBe('pc-f')
    expect(m.regFisso.r.progetti[0]?.proprietario).toBe('pc-f')
    expect(existsSync(m.percorsoDa)).toBe(true)
    expect(m.recuperoPort).toEqual([join(m.port.cartellaProgetti, 'Sito')])
  })

  it('il Drive cambia dopo la conferma: si ferma senza cambiare proprietario', async () => {
    const m = mondo()
    const d = m.deps()
    const s = creaSposta({ ...d, leggiFileDrive: async (k, man) => { m.drive.file['progetto-p1/nuovo.txt'] = { nome: 'x', size: 1, mtime: 1, sha: 'x' }; return d.leggiFileDrive(k, man) } })
    const g = await s.avvia('p1')
    expect(g.fase).toBe('fallita')
    expect(g.errore).toContain('cambiato dopo la conferma')
    expect(m.regPort.r.progetti[0]?.proprietario).toBe('pc-f')
  })

  it('riprende dopo un arresto a metà: il giornale su disco dice dov era', async () => {
    const m = mondo()
    await m.salvaFisso()
    const qui = join(m.port.cartellaProgetti, 'Sito')
    mkdirSync(qui, { recursive: true })
    const g: GiornaleSposta = {
      id: 'sp-1', progetto: 'p1', nome: 'Sito', da: 'pc-f', daNome: 'Fisso', percorsoDa: m.percorsoDa, percorso: qui, fase: 'scarico',
      iniziataIl: 'x', aggiornataIl: 'x', impronta: improntaProgetto(m.drive, 'p1', m.percorsoDa), cartellaCreata: true, messaggio: 'Scarico.'
    }
    // Un file era già sceso prima dell'arresto.
    writeFileSync(join(qui, 'README.md'), 'ciao')
    m.giornale.scrivi(g)
    const dopo = await creaSposta(m.deps()).riprendi()
    expect(dopo?.fase).toBe('fatta')
    expect(m.regPort.r.progetti[0]?.proprietario).toBe('pc-l')
    // Il cambio è già fatto e il programma si chiude prima della copia di prima: si riprende da lì.
    const m2 = mondo()
    await m2.salvaFisso()
    m2.regPort.scrivi({ ...m2.regPort.r, progetti: m2.regPort.r.progetti.map((p) => ({ ...p, proprietario: 'pc-l', percorso: qui })) })
    m2.giornale.scrivi({ ...g, percorsoDa: m2.percorsoDa, fase: 'vecchia-copia' })
    expect((await creaSposta(m2.deps()).riprendi())?.fase).toBe('fatta')
    expect(m2.recuperoFisso).toEqual([m2.percorsoDa])
  })

  it('non sovrascrive una cartella che qui c è già con dei file', async () => {
    const m = mondo()
    mkdirSync(join(m.port.cartellaProgetti, 'Sito'), { recursive: true })
    writeFileSync(join(m.port.cartellaProgetti, 'Sito', 'mio.txt'), 'mio')
    const g = await creaSposta(m.deps()).avvia('p1')
    expect(g.fase).toBe('fallita')
    expect(g.errore).toContain('non la sovrascrivo')
    expect(readFileSync(join(m.port.cartellaProgetti, 'Sito', 'mio.txt'), 'utf8')).toBe('mio')
  })

  it('un progetto già di questo PC, o senza proprietario: non parte', async () => {
    const m = mondo()
    m.regPort.scrivi({ ...registroVuoto(), progetti: [{ id: 'p1', nome: 'Sito', aggiuntoIl: '', proprietario: 'pc-l', percorso: 'C:\\x' }] })
    expect((await creaSposta(m.deps()).avvia('p1')).errore).toContain('già di questo PC')
  })
})

describe('la copia di prima va nel recupero solo se è pulita', () => {
  const prepara = async () => {
    const m = mondo()
    await m.salvaFisso()
    return m
  }
  const pulisci = (m: Awaited<ReturnType<typeof prepara>>, o: { aperte?: number; git?: number; cartellaProgetti?: string } = {}) => {
    const spostate: string[] = []
    return {
      spostate,
      esito: pulisciCopia({
        progetto: { id: 'p1', nome: 'Sito' }, percorso: m.percorsoDa, cartellaProgetti: o.cartellaProgetti ?? m.fisso.cartellaProgetti,
        chatAperte: () => o.aperte ?? 0, gitDaSalvare: async () => o.git ?? 0,
        manifestoDrive: async () => m.drive, inRecupero: (c) => { spostate.push(c); return { ok: true } }
      })
    }
  }
  it('identica al Drive: nel recupero', async () => {
    const m = await prepara()
    const p = pulisci(m)
    expect((await p.esito).tipo).toBe('nel-recupero')
    expect(p.spostate).toEqual([m.percorsoDa])
  })
  it('con chat aperte, git da salvare o un file diverso: resta, e dice perché', async () => {
    const m = await prepara()
    expect(await pulisci(m, { aperte: 1 }).esito).toMatchObject({ tipo: 'tenuta', perche: 'chat-aperte' })
    expect(await pulisci(m, { git: 2 }).esito).toMatchObject({ tipo: 'tenuta', perche: 'git-da-salvare' })
    writeFileSync(join(m.percorsoDa, 'src', 'a.ts'), 'cambiato qui')
    const p = pulisci(m)
    expect(await p.esito).toMatchObject({ tipo: 'tenuta', perche: 'diversa-dal-drive', file: ['src/a.ts'] })
    expect(p.spostate).toEqual([])
  })
  it('fuori dalla cartella dei progetti del programma: mai toccata, solo segnalata', async () => {
    const m = await prepara()
    const p = pulisci(m, { cartellaProgetti: join(m.base, 'altrove') })
    expect(await p.esito).toMatchObject({ tipo: 'tenuta', perche: 'fuori-cartella-progetti' })
    expect(p.spostate).toEqual([])
  })
  it('le copie da guardare: progetti di altri PC con una cartella qui, anche dal modello di prima', () => {
    const base = mkdtempSync(join(tmpdir(), 'sd-copie-'))
    const progetti = join(base, 'Progetti')
    const vecchia = join(base, 'Vecchia', 'A')
    mkdirSync(vecchia, { recursive: true })
    mkdirSync(join(progetti, 'A'), { recursive: true })
    mkdirSync(join(progetti, 'B'), { recursive: true })
    const reg: RegistroProgetti = { versione: 1, progetti: [
      { id: 'a', nome: 'A', aggiuntoIl: '', proprietario: 'pc-f', percorso: 'E:\A' },
      { id: 'b', nome: 'B', aggiuntoIl: '', proprietario: 'pc-l', percorso: join(progetti, 'B') }
    ] }
    const c = copieNonMie(reg, { id: 'pc-l', cartellaProgetti: progetti }, existsSync, { a: { 'pc-l': [vecchia] } })
    expect(c.map((x) => [x.progetto.id, x.percorso])).toEqual([['a', vecchia], ['a', join(progetti, 'A')]])
  })
})

describe('cosa sale sul Drive da un PC (0.88.0): solo le chat dei suoi progetti', () => {
  const progetti = [
    { proprietario: 'pc-f', percorso: 'E:/Lavoro/Foo' },
    { proprietario: 'pc-l', percorso: 'E:/Lavoro/Foo-bar' }
  ]
  it('la chat di un progetto si riconosce dallo slug, il progetto più lungo vince (Foo e Foo-bar)', () => {
    expect(progettoDelloSlug(progetti, pathToSlug('E:/Lavoro/Foo'))?.proprietario).toBe('pc-f')
    expect(progettoDelloSlug(progetti, pathToSlug('E:/Lavoro/Foo-bar'))?.proprietario).toBe('pc-l')
    expect(progettoDelloSlug(progetti, pathToSlug('E:/Altro'))).toBeUndefined()
  })
  it('le chat dei progetti di un altro PC non salgono; le mie, quelle fuori dai progetti e i file sì', () => {
    const slug = (p: string): string => `chat/${pathToSlug(p)}/s.jsonl`
    expect(saleDaQuestoPc(progetti, 'pc-f', slug('E:/Lavoro/Foo'))).toBe(true)
    expect(saleDaQuestoPc(progetti, 'pc-f', slug('E:/Lavoro/Foo-bar'))).toBe(false)
    expect(saleDaQuestoPc(progetti, 'pc-f', slug('E:/Sparsa'))).toBe(true)
    expect(saleDaQuestoPc(progetti, 'pc-f', 'progetto-x/src/a.ts')).toBe(true)
  })
})
