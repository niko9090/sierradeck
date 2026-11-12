import { describe, it, expect, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { creaLavoratoreAiuto, LAVORO_FINITO_DURA_MS, RICEZIONE_FERMA_MS } from '../../src/autopilot-host/aiuto-lavoratore'
import type { AvviaProcesso } from '../../src/autopilot-host/orchestratore'
import { cancellaSicura } from '../../src/shared/cancella-sicura'

/**
 * 12/11 (Nicholas: «per ogni prova conclusa vengano eliminati i dati che non
 * servono più»): il PC che aiuta non lascia copie, giunzioni, rami, pacchetti
 * e `node_modules` dei lavori finiti. Git vero, specialista finto.
 */
const radice = mkdtempSync(join(tmpdir(), 'aiuto-pulizia-'))
afterAll(() => { try { cancellaSicura(radice, { dentro: [tmpdir()] }) } catch { /* Windows tiene i file un attimo */ } })

const g = (cwd: string, ...args: string[]): string => execFileSync('git', ['-c', 'user.name=Prova', '-c', 'user.email=prova@example.invalid', ...args], { cwd, encoding: 'utf8' })
const nessunProcesso: AvviaProcesso = () => { throw new Error('qui non parte nessuno') }
const silenzio = (): void => undefined

/** Un repo di progetto aiutato, con una copia `copie/<id>` sul ramo del lavoro e la giunzione a `bersaglio`. */
function progettoConCopia(base: string, id: string, bersaglio: string): { repo: string; copia: string } {
  const repo = join(base, 'repo')
  mkdirSync(repo, { recursive: true })
  g(repo, 'init', '-b', 'main')
  writeFileSync(join(repo, 'a.txt'), 'a\n')
  g(repo, 'add', '.')
  g(repo, 'commit', '-m', 'inizio')
  const copia = join(base, 'copie', id)
  g(repo, 'worktree', 'add', '-b', `worktree-agent-${id}`, copia)
  symlinkSync(bersaglio, join(copia, 'node_modules'), 'junction')
  return { repo, copia }
}

const rami = (repo: string): string[] => g(repo, 'for-each-ref', '--format=%(refname:short)', 'refs/heads/').split(/\r?\n/u).filter((r) => r !== '')

describe('il PC che aiuta pulisce dopo ogni prova', () => {
  it('all’avvio: il lavoro rimasto a metà perde copia, giunzione, ramo e pacchetti; i finiti da più di 2 giorni si dimenticano', async () => {
    const dati = join(radice, 'avvio')
    const base = join(dati, 'progetti', 'p')
    // La cartella vera a cui punta la giunzione: non deve perdere niente.
    const bersaglio = join(radice, 'moduli-veri')
    mkdirSync(bersaglio, { recursive: true })
    writeFileSync(join(bersaglio, 'pacchetto.js'), 'resta')
    const { repo, copia } = progettoConCopia(base, 'r00000000000a', bersaglio)
    mkdirSync(join(dati, 'arrivi'), { recursive: true })
    mkdirSync(join(dati, 'uscite'), { recursive: true })
    for (const f of ['arrivi/r00000000000a.bundle', 'uscite/r00000000000b.bundle', 'uscite/r00000000000c.bundle']) writeFileSync(join(dati, f), 'x')
    const ora = Date.now()
    writeFileSync(join(dati, 'lavori.json'), JSON.stringify([
      { id: 'r00000000000a', stato: 'lavoro', progetto: 'p', ricevuti: 1, totale: 1, inizio: ora - 60_000, copia, repo },
      { id: 'r00000000000b', stato: 'finito', progetto: 'p', ricevuti: 1, totale: 1, inizio: ora - LAVORO_FINITO_DURA_MS - 3_600_000, byte: 1 },
      { id: 'r00000000000c', stato: 'finito', progetto: 'p', ricevuti: 1, totale: 1, inizio: ora - 3_600_000, fine: ora - 60_000, byte: 1 }
    ]))

    const lav = creaLavoratoreAiuto({ cartella: dati, avvia: nessunProcesso, log: silenzio, pulisciOgniMs: 0 })
    await lav.pulizia()

    expect(lav.stato('r00000000000a')).toMatchObject({ stato: 'fallito' })
    expect(existsSync(copia)).toBe(false)
    expect(readFileSync(join(bersaglio, 'pacchetto.js'), 'utf8')).toBe('resta')
    expect(rami(repo)).toEqual(['main'])
    expect(existsSync(join(dati, 'arrivi', 'r00000000000a.bundle'))).toBe(false)
    // Il finito da più di 2 giorni: dimenticato, col suo pacchetto. Quello di un'ora fa resta da ritirare.
    expect(lav.stato('r00000000000b')).toBeUndefined()
    expect(existsSync(join(dati, 'uscite', 'r00000000000b.bundle'))).toBe(false)
    expect(lav.stato('r00000000000c')).toMatchObject({ stato: 'finito' })
    expect(existsSync(join(dati, 'uscite', 'r00000000000c.bundle'))).toBe(true)
    const salvati = (JSON.parse(readFileSync(join(dati, 'lavori.json'), 'utf8')) as Array<{ id: string }>).map((l) => l.id)
    expect(salvati.sort()).toEqual(['r00000000000a', 'r00000000000c'])
  }, 60_000)

  it('una radice scritta male in lavori.json o radici.json non porta la pulizia in un’altra cartella', async () => {
    const dati = join(radice, 'radice-strana')
    const altra = join(radice, 'cartella-di-qualcuno')
    const copia = join(altra, 'progetti', 'p', 'copie', 'r0000000000e1')
    mkdirSync(copia, { recursive: true })
    writeFileSync(join(copia, 'importante.txt'), 'resta')
    mkdirSync(dati, { recursive: true })
    writeFileSync(join(dati, 'radici.json'), JSON.stringify([altra]))
    writeFileSync(join(dati, 'lavori.json'), JSON.stringify([{ id: 'r0000000000e2', stato: 'fallito', progetto: 'p', ricevuti: 1, totale: 1, inizio: 0, radice: altra }]))
    const lav = creaLavoratoreAiuto({ cartella: dati, avvia: nessunProcesso, log: silenzio, pulisciOgniMs: 0 })
    await lav.pulizia()
    expect(readFileSync(join(copia, 'importante.txt'), 'utf8')).toBe('resta')
    expect(lav.stato('r0000000000e2')).toBeUndefined()
  })

  it('una ricezione ferma da 30 minuti: non riuscita, e il pacchetto a metà se ne va', async () => {
    const dati = join(radice, 'ricezione')
    let ora = Date.now()
    const lav = creaLavoratoreAiuto({ cartella: dati, avvia: nessunProcesso, log: silenzio, adesso: () => ora, pulisciOgniMs: 0 })
    expect(lav.pezzo({ lavoro: 'r0000000000a1', n: 0, totale: 2, dati: Buffer.from('mezzo').toString('base64') })).toMatchObject({ ok: true })
    expect(existsSync(join(dati, 'arrivi', 'r0000000000a1.bundle'))).toBe(true)
    ora += RICEZIONE_FERMA_MS - 60_000
    await lav.pulizia()
    expect(lav.stato('r0000000000a1')).toMatchObject({ stato: 'ricevo' })
    ora += 2 * 60_000
    await lav.pulizia()
    expect(lav.stato('r0000000000a1')).toMatchObject({ stato: 'fallito' })
    expect(existsSync(join(dati, 'arrivi', 'r0000000000a1.bundle'))).toBe(false)
    expect(lav.inCorso()).toBe(0)
  })

  it('il giro: via le copie che nessun lavoro usa (anche con la giunzione), i rami dei lavori chiusi e i pacchetti orfani', async () => {
    const dati = join(radice, 'giro')
    const base = join(dati, 'progetti', 'p')
    const bersaglio = join(radice, 'moduli-giro')
    mkdirSync(bersaglio, { recursive: true })
    writeFileSync(join(bersaglio, 'pacchetto.js'), 'resta')
    const { repo, copia } = progettoConCopia(base, 'r0000000000b1', bersaglio)
    // Una cartella rimasta a metà, non registrata in git.
    const rimasta = join(base, 'copie', 'r0000000000b2')
    mkdirSync(join(rimasta, 'src'), { recursive: true })
    writeFileSync(join(rimasta, 'src', 'x.ts'), 'x')
    mkdirSync(join(dati, 'uscite'), { recursive: true })
    writeFileSync(join(dati, 'uscite', 'r0000000000b3.bundle'), 'orfano')
    writeFileSync(join(dati, 'uscite', 'leggimi.txt'), 'non è un pacchetto: resta')

    const lav = creaLavoratoreAiuto({ cartella: dati, avvia: nessunProcesso, log: silenzio, pulisciOgniMs: 0 })
    await lav.pulizia()
    expect(existsSync(copia)).toBe(false)
    expect(existsSync(rimasta)).toBe(false)
    expect(readFileSync(join(bersaglio, 'pacchetto.js'), 'utf8')).toBe('resta')
    expect(rami(repo)).toEqual(['main'])
    expect(g(repo, 'worktree', 'list', '--porcelain').match(/^worktree /gmu)?.length).toBe(1)
    expect(existsSync(join(dati, 'uscite', 'r0000000000b3.bundle'))).toBe(false)
    expect(existsSync(join(dati, 'uscite', 'leggimi.txt'))).toBe(true)
  }, 60_000)

  it('su un’altra radice (il disco delle prove): lavori.json resta nei dati, la copia di chi lavora e i suoi node_modules restano, quelli vecchi no', async () => {
    const dati = join(radice, 'dati-altrove')
    const altrove = join(radice, 'disco-prove', 'aiuto-x')
    // Il progetto che arriva: con package.json e package-lock.json, e i suoi node_modules già installati qui.
    const sorgente = join(radice, 'sorgente')
    mkdirSync(sorgente, { recursive: true })
    g(sorgente, 'init', '-b', 'main')
    writeFileSync(join(sorgente, 'package.json'), '{"name":"p","version":"1.0.0"}\n')
    // Senza a capo: git (autocrlf) non lo cambia nella copia, e l'impronta resta quella calcolata qui.
    writeFileSync(join(sorgente, 'package-lock.json'), '{"name":"p","lockfileVersion":3}')
    g(sorgente, 'add', '.')
    g(sorgente, 'commit', '-m', 'inizio')
    const sha = g(sorgente, 'rev-parse', 'HEAD').trim()
    const pacchetto = join(radice, 'sorgente.bundle')
    g(sorgente, 'bundle', 'create', pacchetto, 'main')
    const impronta = createHash('sha256').update(readFileSync(join(sorgente, 'package-lock.json'))).digest('hex').slice(0, 16)
    const moduli = join(altrove, 'progetti', 'sorgente', 'moduli')
    const quelli = (n: string, completa = true): string => {
      const d = join(moduli, n)
      mkdirSync(join(d, 'node_modules'), { recursive: true })
      if (completa) writeFileSync(join(d, 'node_modules', '.package-lock.json'), '{}')
      return d
    }
    const usato = quelli(impronta)

    // Lo specialista finto resta al lavoro finché il test non lo lascia andare.
    let lascia = (): void => undefined
    const avvia: AvviaProcesso = () => {
      const uscite: Array<(c: number | null, e: string) => void> = []
      let finito = false
      lascia = () => { if (!finito) { finito = true; for (const f of uscite) f(0, '') } }
      return { scrivi: () => undefined, uccidi: () => lascia(), suRiga: () => undefined, suUscita: (f) => { if (finito) f(0, ''); else uscite.push(f) } }
    }
    const lav = creaLavoratoreAiuto({ cartella: dati, lavoro: altrove, avvia, log: silenzio, pulisciOgniMs: 0 })
    const buf = readFileSync(pacchetto)
    expect(lav.pezzo({ lavoro: 'r0000000000c1', n: 0, totale: 1, dati: buf.toString('base64') })).toMatchObject({ ok: true })
    expect(existsSync(join(altrove, 'arrivi', 'r0000000000c1.bundle'))).toBe(true)
    expect(lav.avvia({ lavoro: 'r0000000000c1', progetto: 'sorgente', ramoBase: 'main', base: sha, prompt: 'fai' })).toMatchObject({ ok: true })
    const fine = Date.now() + 30_000
    while (lav.stato('r0000000000c1')?.stato !== 'lavoro' && Date.now() < fine) await new Promise((ok) => setTimeout(ok, 50))
    expect(lav.stato('r0000000000c1')?.stato).toBe('lavoro')
    const copia = join(altrove, 'progetti', 'sorgente', 'copie', 'r0000000000c1')
    expect(existsSync(join(copia, 'node_modules'))).toBe(true)
    expect(existsSync(join(dati, 'lavori.json'))).toBe(true)
    expect(existsSync(join(altrove, 'lavori.json'))).toBe(false)
    expect((JSON.parse(readFileSync(join(dati, 'lavori.json'), 'utf8')) as Array<{ radice?: string }>)[0]?.radice).toBe(altrove)

    // Tre node_modules più nuovi di quello usato, e uno rimasto a metà: si tengono i 2 più recenti e quello in uso.
    const futuro = (d: string, ore: number): void => { const t = new Date(Date.now() + ore * 3_600_000); utimesSync(d, t, t) }
    const n1 = quelli('n1'); futuro(n1, 1)
    const n2 = quelli('n2'); futuro(n2, 2)
    const n3 = quelli('n3'); futuro(n3, 3)
    const meta = quelli('meta', false)
    await lav.pulizia()
    expect(existsSync(copia)).toBe(true)
    expect(existsSync(usato)).toBe(true)
    expect(existsSync(n3) && existsSync(n2)).toBe(true)
    expect(existsSync(n1)).toBe(false)
    expect(existsSync(meta)).toBe(false)

    // Finito: la copia se ne va da sola, e niente resta da ritirare (nessun commit).
    lascia()
    const fine2 = Date.now() + 30_000
    while (lav.stato('r0000000000c1')?.stato === 'lavoro' && Date.now() < fine2) await new Promise((ok) => setTimeout(ok, 50))
    await lav.pulizia()
    expect(lav.stato('r0000000000c1')?.stato).toBe('fallito')
    expect(existsSync(copia)).toBe(false)
    expect(readdirSync(join(altrove, 'arrivi'))).toEqual([])
    // Ora nessuno lo usa più: dei node_modules restano i 2 più recenti.
    expect(existsSync(usato)).toBe(false)
    expect(readdirSync(moduli).sort()).toEqual(['n2', 'n3'])
  }, 90_000)
})
