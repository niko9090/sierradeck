import { describe, it, expect, afterAll, afterEach, vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { creaLavoratoreAiuto } from '../../src/autopilot-host/aiuto-lavoratore'
import type { AvviaProcesso } from '../../src/autopilot-host/orchestratore'
import { causaRiassegnabile } from '../../src/shared/aiuto-esito'
import { causaScadenza, causaSilenzio, scadenzaIniziale, scadenzaSegno, scadenzaTick, TICK_SCADENZA_MS } from '../../src/shared/aiuto-scadenza'
import { SILENZIO_MAX_MS } from '../../src/shared/aiuto-rete'
import { cancellaSicura } from '../../src/shared/cancella-sicura'

/**
 * k-178f. Il PC che aiuta:
 * 1. al riavvio un lavoro a metà fallisce per colpa del PC (`pc`, riassegnabile) e i commit già fatti
 *    nel suo ramo restano ritirabili;
 * 2. il silenzio dello specialista si guarda a ogni giro (non alle 3 ore), ma una build che scrive file non è silenzio.
 */
const radice = mkdtempSync(join(tmpdir(), 'aiutante-riavvio-'))
afterAll(() => { try { cancellaSicura(radice, { dentro: [tmpdir()] }) } catch { /* Windows tiene i file un attimo */ } })
afterEach(() => { vi.useRealTimers() })

const g = (cwd: string, ...args: string[]): string => execFileSync('git', ['-c', 'user.name=Prova', '-c', 'user.email=prova@example.invalid', ...args], { cwd, encoding: 'utf8' }).trim()
const silenzio = (): void => undefined
const nessunProcesso: AvviaProcesso = () => { throw new Error('qui non parte nessuno') }
const attendi = async (cond: () => boolean, ms = 20_000): Promise<void> => {
  const fine = Date.now() + ms
  while (!cond()) {
    if (Date.now() > fine) throw new Error('condizione non raggiunta')
    await new Promise((ok) => setTimeout(ok, 20))
  }
}

describe('riavvio a metà lavoro', () => {
  it('causa pc (riassegnabile) e i commit del ramo restano da ritirare', async () => {
    const dati = join(radice, 'riavvio')
    const base = join(dati, 'progetti', 'p')
    const repo = join(base, 'repo')
    mkdirSync(repo, { recursive: true })
    g(repo, 'init', '-b', 'main')
    writeFileSync(join(repo, 'a.txt'), 'a\n')
    g(repo, 'add', '.')
    g(repo, 'commit', '-m', 'inizio')
    const sha = g(repo, 'rev-parse', 'HEAD')
    const id = 'r00000000022a'
    const copia = join(base, 'copie', id)
    g(repo, 'worktree', 'add', '-b', `worktree-agent-${id}`, copia)
    writeFileSync(join(copia, 'b.txt'), 'b\n')
    g(copia, 'add', '.')
    g(copia, 'commit', '-m', 'lavoro fatto prima del riavvio')
    // Un secondo lavoro, senza commit: il suo ramo si toglie come prima.
    const id2 = 'r00000000022b'
    g(repo, 'worktree', 'add', '-b', `worktree-agent-${id2}`, join(base, 'copie', id2))
    mkdirSync(dati, { recursive: true })
    const ora = Date.now()
    writeFileSync(join(dati, 'lavori.json'), JSON.stringify([
      { id, stato: 'lavoro', progetto: 'p', ricevuti: 1, totale: 1, inizio: ora - 60_000, copia, repo, base: sha },
      { id: id2, stato: 'lavoro', progetto: 'p', ricevuti: 1, totale: 1, inizio: ora - 60_000, repo, base: sha }
    ]))

    const lav = creaLavoratoreAiuto({ cartella: dati, avvia: nessunProcesso, log: silenzio, pulisciOgniMs: 0 })
    await lav.pulizia()

    const st = lav.stato(id)!
    expect(st).toMatchObject({ stato: 'fallito', causa: 'pc', commit: 1 })
    expect(causaRiassegnabile(st.causa!)).toBe(true)
    expect(st.byte).toBeGreaterThan(0)
    expect(existsSync(join(dati, 'uscite', `${id}.bundle`))).toBe(true)
    expect(existsSync(copia)).toBe(false)
    // Il ritiro è possibile: il pacchetto contiene il commit.
    const pezzo = lav.ritira({ lavoro: id, n: 0 })
    expect(pezzo).toMatchObject({ ok: true })
    const file = join(radice, 'ritirato.bundle')
    writeFileSync(file, Buffer.from((pezzo as { dati: string }).dati, 'base64'))
    expect(g(repo, 'bundle', 'list-heads', file)).toContain(`refs/heads/worktree-agent-${id}`)
    // Il lavoro senza commit: ramo tolto, niente da ritirare, ma sempre `pc`.
    expect(lav.stato(id2)).toMatchObject({ stato: 'fallito', causa: 'pc' })
    expect(g(repo, 'for-each-ref', '--format=%(refname:short)', `refs/heads/worktree-agent-${id2}`)).toBe('')
    expect(lav.ritira({ lavoro: id2, n: 0 })).toMatchObject({ ok: false })
    expect(JSON.parse(readFileSync(join(dati, 'lavori.json'), 'utf8')) as unknown[]).toHaveLength(2)
  }, 60_000)
})

describe('silenzio controllato a ogni giro', () => {
  it('funzioni pure: il silenzio senza segni è causa pc, un segno recente lo annulla', () => {
    const t0 = 1_000_000
    let s = scadenzaIniziale(t0)
    expect(causaSilenzio(s, t0 + SILENZIO_MAX_MS - 1)).toBeUndefined()
    const dopo = t0 + SILENZIO_MAX_MS + 60_000
    expect(causaSilenzio(s, dopo)).toMatchObject({ causa: 'pc' })
    s = scadenzaSegno(s, dopo - 1000)
    expect(causaSilenzio(s, dopo)).toBeUndefined()
    expect(causaScadenza(s, dopo)).toMatchObject({ causa: 'compito' })
    // Dopo un sonno basta meno silenzio.
    let d = scadenzaIniziale(t0)
    d = scadenzaTick(d, t0 + 3 * 60 * 60_000)
    expect(d.dormito).toBe(true)
    expect(causaSilenzio(d, t0 + 3 * 60 * 60_000)).toMatchObject({ causa: 'pc' })
  })

  /** Il progetto arrivato come pacchetto, lo specialista finto parte: torna il controllo per spegnerlo/fermarlo. */
  async function avviaMuto(nome: string, attivitaFile: (copia: string, dal: number) => Promise<number | undefined>) {
    const sorgente = join(radice, `${nome}-src`)
    mkdirSync(sorgente, { recursive: true })
    g(sorgente, 'init', '-b', 'main')
    writeFileSync(join(sorgente, 'a.txt'), 'a\n')
    g(sorgente, 'add', '.')
    g(sorgente, 'commit', '-m', 'inizio')
    const sha = g(sorgente, 'rev-parse', 'HEAD')
    const bundle = join(radice, `${nome}.bundle`)
    g(sorgente, 'bundle', 'create', bundle, 'main')
    let uscire: ((c: number | null, e: string) => void) | undefined
    let uccisioni = 0
    const avvia: AvviaProcesso = () => ({
      scrivi: () => undefined,
      suRiga: () => undefined,
      suUscita: (f) => { uscire = f },
      uccidi: () => { uccisioni++; uscire?.(1, '') }
    })
    // Solo gli intervalli sono finti (il giro della scadenza): git e le attese vere restano reali.
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    let ora = Date.now()
    const dati = join(radice, nome)
    const lav = creaLavoratoreAiuto({ cartella: dati, avvia, log: silenzio, adesso: () => ora, pulisciOgniMs: 0, attivitaFile })
    const id = 'r00000000022c'
    lav.pezzo({ lavoro: id, n: 0, totale: 1, dati: readFileSync(bundle).toString('base64') })
    expect(lav.avvia({ lavoro: id, progetto: 'p', ramoBase: 'main', base: sha, prompt: 'fai' })).toMatchObject({ ok: true })
    await attendi(() => lav.stato(id)?.stato === 'lavoro' && uscire !== undefined)
    // Un giro alla volta (30 s): un salto più lungo conterebbe come sonno del PC.
    const passa = async (ms: number): Promise<void> => {
      for (let t = 0; t < ms; t += TICK_SCADENZA_MS) {
        ora += TICK_SCADENZA_MS
        vi.advanceTimersByTime(TICK_SCADENZA_MS)
        await new Promise((ok) => setImmediate(ok))
        await new Promise((ok) => setImmediate(ok))
      }
    }
    return { lav, id, passa, uccisioni: () => uccisioni, adesso: () => ora }
  }

  it('processo muto e senza attività: dopo la soglia fallisce per colpa del PC, ben prima delle 3 ore', async () => {
    const x = await avviaMuto('muto', async () => undefined)
    await x.passa(SILENZIO_MAX_MS - 5 * 60_000)
    expect(x.lav.stato(x.id)).toMatchObject({ stato: 'lavoro' })
    await x.passa(6 * 60_000)
    await attendi(() => x.lav.stato(x.id)?.stato === 'fallito')
    expect(x.uccisioni()).toBeGreaterThan(0)
    const st = x.lav.stato(x.id)!
    expect(st.causa).toBe('pc')
    expect(causaRiassegnabile(st.causa!)).toBe(true)
    expect(st.motivo).toContain('non dava segni')
  }, 60_000)

  it('una build lunga che scrive file non è silenzio: resta in vita oltre la soglia', async () => {
    let chiamate = 0
    let adessoFinto = () => 0
    const x = await avviaMuto('build', async () => { chiamate++; return adessoFinto() })
    adessoFinto = x.adesso
    await x.passa(SILENZIO_MAX_MS + 20 * 60_000)
    expect(chiamate).toBeGreaterThan(0)
    expect(x.lav.stato(x.id)).toMatchObject({ stato: 'lavoro' })
    expect(x.uccisioni()).toBe(0)
    expect(x.lav.ferma(x.id)).toBe(true)
    await attendi(() => x.uccisioni() > 0)
  }, 60_000)
})
