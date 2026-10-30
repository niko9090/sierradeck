import { describe, it, expect, afterEach } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Autopilota } from '@shared/autopilota'
import type { StoricoErrori } from '@shared/storico-errori'
import { impostaStoricoRiassetto, passoRiassettoServizio, type DipendenzeRiassettoServizio } from '../../src/autopilot-host/riassetto-servizio'
import { cartellaWorktreeDi, type GitAsincrono } from '../../src/autopilot-host/worktree'
import { esitoVuoto } from '../../src/autopilot-host/autopulizia'
import { manifesti, ripristinaRiassetto } from '../../src/main/riassetto/recupero'

const ORA = Date.parse('2026-11-05T10:00:00Z')
const GIORNO = 86_400_000
const slug = (p: string): string => p.replace(/[^a-zA-Z0-9]/g, '-')

function vecchio(p: string, giorni = 30): void {
  const t = new Date(ORA - giorni * GIORNO)
  utimesSync(p, t, t)
}
function file(p: string, testo = 'x', giorni = 30): void {
  mkdirSync(join(p, '..'), { recursive: true })
  writeFileSync(p, testo)
  vecchio(p, giorni)
}

/** Una cartella dei dati con il suo archivio, un progetto e la casa di Claude Code, tutto finto. */
function mondo(): { dati: string; radice: string; progetti: string; claude: string; d: DipendenzeRiassettoServizio; rami: Map<string, 'unito' | 'non-unito'> } {
  const base = mkdtempSync(join(tmpdir(), 'sd-riassetto-servizio-'))
  const dati = join(base, 'dati')
  const radice = join(base, 'Progetto')
  const progetti = join(base, 'Progetti SierraDeck')
  const claude = join(base, '.claude')
  mkdirSync(join(dati, 'autopiloti'), { recursive: true })
  mkdirSync(radice, { recursive: true })
  mkdirSync(progetti, { recursive: true })
  mkdirSync(join(claude, 'projects'), { recursive: true })
  const rami = new Map<string, 'unito' | 'non-unito'>()
  const git: GitAsincrono = async (args, cwd) => {
    if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return { codice: 0, uscita: `${radice}\n` }
    if (args[0] === 'worktree' && args[1] === 'prune') return { codice: cwd === radice ? 0 : 1, uscita: '' }
    if (args[0] === 'rev-parse' && args[1] === '--verify') return { codice: rami.has(args[3]!.replace('refs/heads/', '')) ? 0 : 1, uscita: '' }
    if (args[0] === 'merge-base') return { codice: rami.get(args[2]!) === 'unito' ? 0 : 1, uscita: '' }
    return { codice: 1, uscita: 'sconosciuto' }
  }
  const autopiloti = [{
    id: 'ap-aaaaaaaa-0000', cwd: radice, stato: 'lavoro', ramoBase: 'main',
    chats: [
      { id: 'c-7', stato: 'lavoro', cartella: join(cartellaWorktreeDi(radice), 'ap-aaaaaaaa-c-7') },
      { id: 'c-8', stato: 'finita', cartella: join(cartellaWorktreeDi(radice), 'ap-aaaaaaaa-c-8') }
    ]
  }] as unknown as Autopilota[]
  const d: DipendenzeRiassettoServizio = {
    archivio: { cartella: join(dati, 'autopiloti'), elenca: () => autopiloti },
    versione: '0.88.0',
    gitAsincrono: git,
    radiceClaude: claude,
    ora: () => ORA,
    autopulizia: async () => ({ ...esitoVuoto(), byteLiberati: 700 })
  }
  return { dati, radice, progetti, claude, d, rami }
}

afterEach(() => { impostaStoricoRiassetto(undefined) })

describe('il riassetto dalla parte del servizio', () => {
  it('rifiuta un passo sconosciuto e rimanda a PC carico', async () => {
    const { d } = mondo()
    expect((await passoRiassettoServizio({ passo: 'rm' }, d)).stato).toBe(400)
    const r = await passoRiassettoServizio({ passo: 'consegne' }, { ...d, guardiaPc: { valuta: () => ({ motivo: 'processore al 90%' }) } })
    expect(r.corpo).toMatchObject({ rimandato: expect.stringContaining('PC carico (processore al 90%)') })
  })

  it('consegne: il contatore prende il numero più alto, le copie «illeggibili» vanno nel recupero; la seconda volta niente', async () => {
    const { dati, d } = mondo()
    const cartella = join(dati, 'autopiloti')
    file(join(cartella, 'consegne-numero.json'), JSON.stringify({ ultimo: 10 }))
    file(join(cartella, 'consegne-numero.json.illeggibile-1'), JSON.stringify({ ultimo: 47 }))
    file(join(cartella, 'consegne-numero.json.illeggibile-2'), 'rotto')
    const r = await passoRiassettoServizio({ passo: 'consegne' }, d)
    expect(r.stato).toBe(200)
    expect(JSON.parse(readFileSync(join(cartella, 'consegne-numero.json'), 'utf8'))).toEqual({ ultimo: 47 })
    expect(existsSync(join(cartella, 'consegne-numero.json.illeggibile-1'))).toBe(false)
    expect(existsSync(join(cartella, 'consegne-numero.json.illeggibile-2'))).toBe(false)
    expect(manifesti(dati, '0.88.0')[0]?.manifesto.voci).toHaveLength(2)
    const di_nuovo = await passoRiassettoServizio({ passo: 'consegne' }, d)
    expect((di_nuovo.corpo as { fatti: string[] }).fatti).toEqual([])
  })

  it('autopiloti: quelli di prima già assorbiti vanno nel recupero con il manifesto, gli altri restano; «Annulla» li rimette', async () => {
    const { dati, d } = mondo()
    const cartella = join(dati, 'autopiloti')
    file(join(cartella, 'ap-11111111.json'), '{}')
    file(join(cartella, 'ap-11111111.decisioni.jsonl'), '')
    file(join(cartella, 'ap-22222222.json'), '{}')
    file(join(cartella, 'ap-33333333.json'), '{}')
    file(join(cartella, 'istruzioni', 'ap-11111111.json'), '{}')
    file(join(dati, 'orchestratori', 'ws-1', 'orchestratore.json'), JSON.stringify({ autopilota: 'ap-33333333', assorbiti: ['ap-11111111'] }))
    const r = await passoRiassettoServizio({ passo: 'autopiloti' }, d)
    const e = r.corpo as { fatti: string[]; saltati: Array<{ cosa: string }>; errori: string[] }
    expect(e.errori).toEqual([])
    expect(existsSync(join(cartella, 'ap-11111111.json'))).toBe(false)
    expect(existsSync(join(cartella, 'ap-11111111.decisioni.jsonl'))).toBe(false)
    expect(existsSync(join(cartella, 'istruzioni'))).toBe(false)
    expect(existsSync(join(cartella, 'ap-22222222.json'))).toBe(true)
    expect(existsSync(join(cartella, 'ap-33333333.json'))).toBe(true)
    expect(e.saltati.map((x) => x.cosa)).toContain('ap-22222222')
    expect(manifesti(dati, '0.88.0')[0]?.manifesto.voci).toHaveLength(3)
    expect(ripristinaRiassetto(dati, '0.88.0').ripristinati).toBe(3)
    expect(existsSync(join(cartella, 'ap-11111111.json'))).toBe(true)
  })

  it('worktree: prune, vecchie cartelle vuote delle copie nel recupero (solo vuote), poi l’autopulizia', async () => {
    const { dati, progetti, d } = mondo()
    mkdirSync(join(progetti, 'ap-aaaaaaaa-c-1', 'vuota-dentro'), { recursive: true })
    vecchio(join(progetti, 'ap-aaaaaaaa-c-1', 'vuota-dentro'))
    vecchio(join(progetti, 'ap-aaaaaaaa-c-1'))
    file(join(progetti, 'ap-aaaaaaaa-c-2', 'lavoro.txt'), 'non vuota')
    mkdirSync(join(progetti, 'MioProgetto'))
    const r = await passoRiassettoServizio({ passo: 'worktree', cartelleProgetti: [progetti, 'relativo', join(progetti, 'non-c-e')] }, d)
    const e = r.corpo as { fatti: string[]; byteLiberati: number }
    expect(existsSync(join(progetti, 'ap-aaaaaaaa-c-1'))).toBe(false)
    expect(existsSync(join(progetti, 'ap-aaaaaaaa-c-2', 'lavoro.txt'))).toBe(true)
    expect(existsSync(join(progetti, 'MioProgetto'))).toBe(true)
    expect(e.fatti).toEqual(expect.arrayContaining([expect.stringContaining('prune:'), 'autopulizia', join(progetti, 'ap-aaaaaaaa-c-1')]))
    expect(e.byteLiberati).toBe(700)
    expect(ripristinaRiassetto(dati, '0.88.0').ripristinati).toBe(1)
    expect(existsSync(join(progetti, 'ap-aaaaaaaa-c-1', 'vuota-dentro'))).toBe(true)
  })

  it('trascrizioni: solo quelle delle copie finite, con ramo unito o tolto, vecchie, di nessuno', async () => {
    const { dati, radice, progetti, claude, d, rami } = mondo()
    const projects = join(claude, 'projects')
    const nuove = slug(cartellaWorktreeDi(radice))
    const vecchie = slug(progetti)
    const crea = (nome: string, giorni = 10): string => {
      const dir = join(projects, nome)
      file(join(dir, `sessione-${nome.slice(-3)}.jsonl`), '{}', giorni)
      vecchio(dir, giorni)
      return dir
    }
    rami.set('ap/ap-aaaaaaaa/c-1', 'unito')
    rami.set('ap/ap-aaaaaaaa/c-3', 'non-unito')
    const unita = crea(`${nuove}-ap-aaaaaaaa-c-1`)
    const senzaRamo = crea(`${vecchie}-ap-aaaaaaaa-c-2`)
    const nonUnita = crea(`${nuove}-ap-aaaaaaaa-c-3`)
    mkdirSync(join(cartellaWorktreeDi(radice), 'ap-aaaaaaaa-c-4'), { recursive: true })
    const copiaViva = crea(`${nuove}-ap-aaaaaaaa-c-4`)
    const recente = crea(`${nuove}-ap-aaaaaaaa-c-5`, 1)
    const nelRecupero = crea(`${nuove}-ap-aaaaaaaa-c-6`)
    file(join(dati, 'recupero-chat.json'), JSON.stringify({ versione: 1, chat: [{ slug: `${nuove}-ap-aaaaaaaa-c-6` }] }))
    const chatViva = crea(`${nuove}-ap-aaaaaaaa-c-7`)
    const progettoVero = crea(slug(radice))
    const r = await passoRiassettoServizio({ passo: 'trascrizioni', cartelleProgetti: [progetti] }, d)
    const e = r.corpo as { fatti: string[]; saltati: Array<{ cosa: string; perche: string }>; sessioniTolte: string[] }
    expect(existsSync(unita)).toBe(false)
    expect(existsSync(senzaRamo)).toBe(false)
    for (const resta of [nonUnita, copiaViva, recente, nelRecupero, chatViva, progettoVero]) expect(existsSync(resta)).toBe(true)
    expect(e.sessioniTolte.sort()).toEqual(['sessione-c-1', 'sessione-c-2'].sort())
    expect(e.saltati).toEqual(expect.arrayContaining([
      { cosa: nonUnita, perche: 'ramo con commit non uniti' },
      { cosa: nelRecupero, perche: 'è nel recupero delle chat' }
    ]))
    // Nel recupero, non via.
    expect(ripristinaRiassetto(dati, '0.88.0').ripristinati).toBe(2)
    expect(existsSync(unita)).toBe(true)
  })

  it('errori: via quelli vecchi delle versioni passate, e restano leggibili nel recupero', async () => {
    const { dati, d } = mondo()
    let storico: StoricoErrori = {
      voci: [
        { quando: 'q', ultima: new Date(ORA - 5 * GIORNO).toISOString(), dove: 'servizio', volte: 1351, messaggio: 'spawn ENAMETOOLONG', versione: '0.84.4' },
        { quando: 'q', ultima: new Date(ORA - 3600_000).toISOString(), dove: 'servizio', volte: 1, messaggio: 'di adesso', versione: '0.88.0' }
      ]
    }
    impostaStoricoRiassetto({ leggi: () => storico, sostituisci: (f) => { storico = f(storico) } })
    const r = await passoRiassettoServizio({ passo: 'errori' }, d)
    expect((r.corpo as { fatti: string[] }).fatti).toEqual(['errori:1'])
    expect(storico.voci.map((v) => v.messaggio)).toEqual(['di adesso'])
    const m = manifesti(dati, '0.88.0').find((x) => x.manifesto.passo === 'servizio-errori')
    expect(m).toBeDefined()
    expect(existsSync(join(m!.cartella, 'errori-servizio-tolti.json'))).toBe(true)
  })
})
