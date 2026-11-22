import { describe, it, expect, beforeEach } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { gitAsincronoFinto } from '../setup/git-finto'
import { esegui, repositoryDiPartenza } from '../autopilot-host/worktree-comune'
import { perCheSuperato, RAMO_SUPERATO_DOPO_MS, togliRamiSuperati } from '../../src/autopilot-host/rami-superati'
import type { CompitoPiano } from '@shared/piano-orchestratore'

const repo = repositoryDiPartenza()
const g = gitAsincronoFinto
const ORA = Date.parse('2026-11-22T12:00:00Z')
const VECCHIO = ORA - 60 * 60_000

const compito = (id: string, extra: Partial<CompitoPiano>): CompitoPiano => ({
  id, richiesta: 'r-1', titolo: id, criterio: '`npm test`', dopo: [], peso: 1, stato: 'da-fare', creato: '2026-11-20T10:00:00Z', ...extra
})

let progetto = ''
let copie = ''

/** Un ramo di specialista con la sua copia di lavoro e un commit «k-N: …» che il principale non ha. */
function specialista(id: string, k: string): string {
  const ramo = `worktree-agent-${id}`
  const cartella = join(copie, id)
  esegui(['worktree', 'add', '-q', '-b', ramo, cartella], progetto)
  writeFileSync(join(cartella, `${id}.txt`), `${id}\n`)
  esegui(['add', '-A'], cartella)
  esegui(['commit', '-q', '-m', `${k}: lavoro di ${id}`], cartella)
  return ramo
}
const rami = (...nomi: string[]): { ramo: string; quando: number }[] => nomi.map((ramo) => ({ ramo, quando: VECCHIO }))
const locali = (): string[] => esegui(['branch', '--list', 'worktree-agent-*', '--format=%(refname:short)'], progetto).split(/\r?\n/u).filter((r) => r !== '')

beforeEach(() => {
  progetto = repo.copia()
  copie = mkdtempSync(join(tmpdir(), 'sd-copie-'))
})

describe('rami superati tolti da soli (22/11)', () => {
  it('perCheSuperato: unito con criterio verde da un altro ramo o chiuso sì; aperto, rosso o dallo stesso ramo no', () => {
    expect(perCheSuperato(compito('k-1', { stato: 'unito', criterioVerde: true, ramo: 'worktree-agent-b' }), 'worktree-agent-a')).toContain('già unito da worktree-agent-b')
    expect(perCheSuperato(compito('k-1', { chiuso: { come: 'richiesta-chiusa', perche: 'x', il: 'oggi' } }), 'worktree-agent-a')).toContain('chiuso nel piano')
    expect(perCheSuperato(compito('k-1', { stato: 'in-revisione' }), 'worktree-agent-a')).toBeUndefined()
    expect(perCheSuperato(compito('k-1', { stato: 'unito', criterioVerde: false, ramo: 'worktree-agent-b' }), 'worktree-agent-a')).toBeUndefined()
    expect(perCheSuperato(compito('k-1', { stato: 'unito', criterioVerde: true, ramo: 'worktree-agent-a' }), 'worktree-agent-a')).toBeUndefined()
    expect(perCheSuperato(undefined, 'worktree-agent-a')).toBeUndefined()
  })

  it('ramo con compito già unito da un altro ramo: tolti copia e ramo; la giunzione non svuota la cartella vera', async () => {
    const ramo = specialista('aaa', 'k-1')
    const cartella = join(copie, 'aaa')
    const vera = join(copie, 'node_modules_veri')
    mkdirSync(vera)
    writeFileSync(join(vera, 'pacchetto.txt'), 'resta\n')
    symlinkSync(vera, join(cartella, 'node_modules'), 'junction')
    const r = await togliRamiSuperati(g, { cwd: progetto, compiti: [compito('k-1', { stato: 'unito', criterioVerde: true, ramo: 'worktree-agent-altro' })], rami: rami(ramo), protetti: new Set(), ora: ORA })
    expect(r.tolti.map((t) => t.ramo)).toEqual([ramo])
    expect(r.tolti[0]?.perche).toContain('k-1')
    expect(r.nonTolti).toEqual([])
    expect(locali()).not.toContain(ramo)
    expect(existsSync(cartella)).toBe(false)
    expect(existsSync(join(vera, 'pacchetto.txt'))).toBe(true)
  })

  it('ramo con compito chiuso nel piano (riconosciuto dal soggetto del commit): tolto', async () => {
    const ramo = specialista('bbb', 'k-2')
    const r = await togliRamiSuperati(g, { cwd: progetto, compiti: [compito('k-2', { chiuso: { come: 'richiesta-chiusa', perche: 'x', il: 'oggi' } })], rami: rami(ramo), protetti: new Set(), ora: ORA })
    expect(r.nonTolti).toEqual([])
    expect(r.tolti.map((t) => t.ramo)).toEqual([ramo])
    expect(locali()).not.toContain(ramo)
  })

  it('ramo con compito ancora aperto: resta, con la sua copia', async () => {
    const ramo = specialista('ccc', 'k-3')
    const r = await togliRamiSuperati(g, { cwd: progetto, compiti: [compito('k-3', { stato: 'in-revisione', ramo })], rami: rami(ramo), protetti: new Set(), ora: ORA })
    expect(r.tolti).toEqual([])
    expect(locali()).toContain(ramo)
    expect(existsSync(join(copie, 'ccc'))).toBe(true)
  })

  it('ramo di una chat «solo mia» (protetto): resta anche se il compito è unito', async () => {
    const ramo = specialista('ddd', 'k-4')
    const r = await togliRamiSuperati(g, { cwd: progetto, compiti: [compito('k-4', { stato: 'unito', criterioVerde: true, ramo: 'worktree-agent-altro' })], rami: rami(ramo), protetti: new Set([ramo]), ora: ORA })
    expect(r.tolti).toEqual([])
    expect(locali()).toContain(ramo)
    expect(existsSync(join(copie, 'ddd'))).toBe(true)
  })

  it('ramo con uno specialista vivo sopra (protetto) o fermo da poco: resta', async () => {
    const vivo = specialista('eee', 'k-5')
    const fresco = specialista('fff', 'k-5')
    const piano = [compito('k-5', { stato: 'unito', criterioVerde: true, ramo: 'worktree-agent-altro' })]
    const r = await togliRamiSuperati(g, { cwd: progetto, compiti: piano, rami: [{ ramo: vivo, quando: VECCHIO }, { ramo: fresco, quando: ORA - RAMO_SUPERATO_DOPO_MS + 60_000 }], protetti: new Set([vivo]), ora: ORA })
    expect(r.tolti).toEqual([])
    expect(locali()).toEqual(expect.arrayContaining([vivo, fresco]))
  })

  it('i rami che non sono di uno specialista non si toccano', async () => {
    esegui(['branch', 'lavoro-mio'], progetto)
    const r = await togliRamiSuperati(g, { cwd: progetto, compiti: [compito('k-6', { chiuso: { come: 'richiesta-chiusa', perche: 'x', il: 'oggi' }, ramo: 'lavoro-mio' })], rami: rami('lavoro-mio'), protetti: new Set(), ora: ORA })
    expect(r.tolti).toEqual([])
    expect(esegui(['branch', '--list', 'lavoro-mio'], progetto)).toContain('lavoro-mio')
  })
})
