import { describe, it, expect, beforeEach } from 'vitest'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { comeAsincrono } from '../../src/autopilot-host/worktree'
import { ramiDelCompitoSulDisco } from '../../src/autopilot-host/servizio-orchestratore'
import { esegui, git, repositoryDiPartenza } from './worktree-comune'

/**
 * 11/11: i rami ricordati di un compito, chiesti a un git vero. Serve a non chiudere per sbaglio
 * un compito («il suo lavoro è già nel principale») quando il ramo è solo «contenuto» perché lo
 * specialista non ha mai fatto un commit, e a non lasciare fuori un ramo con lavoro vero (k-165).
 */
const repo = repositoryDiPartenza()
let progetto = ''
beforeEach(() => { progetto = repo.copia() })

const ga = comeAsincrono(git)
const commit = (file: string, testo: string, messaggio: string): void => {
  writeFileSync(join(progetto, file), testo)
  esegui(['add', '-A'], progetto)
  esegui(['commit', '-q', '-m', messaggio], progetto)
}
const guarda = (compito: { id: string; ramo?: string; rami?: string[] }, daNonGuardare?: Set<string>): ReturnType<typeof ramiDelCompitoSulDisco> =>
  ramiDelCompitoSulDisco(ga, { cwd: progetto, base: 'main', compito, ...(daNonGuardare !== undefined ? { daNonGuardare } : {}) })

describe('i rami di un compito, chiesti a git', () => {
  it('un ramo con commit che il principale non ha: è lavoro da unire', async () => {
    esegui(['checkout', '-q', '-b', 'worktree-agent-a1'], progetto)
    commit('b.txt', 'lavoro\n', 'k-1: il lavoro')
    esegui(['checkout', '-q', 'main'], progetto)
    expect(await guarda({ id: 'k-1', rami: ['worktree-agent-a1'] })).toEqual({ conLavoro: ['worktree-agent-a1'], dentro: 0, incerti: 0, mancanti: 0 })
  })

  it('unito con un’unione, anche col principale andato avanti: dentro di sicuro', async () => {
    esegui(['checkout', '-q', '-b', 'worktree-agent-a1'], progetto)
    commit('b.txt', 'lavoro\n', 'k-1: il lavoro')
    esegui(['checkout', '-q', 'main'], progetto)
    commit('c.txt', 'altro\n', 'altro lavoro nel principale')
    esegui(['merge', '-q', '--no-ff', '--no-edit', 'worktree-agent-a1'], progetto)
    commit('d.txt', 'dopo\n', 'ancora avanti')
    expect(await guarda({ id: 'k-1', rami: ['worktree-agent-a1'] })).toEqual({ conLavoro: [], dentro: 1, incerti: 0, mancanti: 0 })
  })

  it('mai staccato dal principale (nessun commit suo): contenuto, ma non vale come lavoro già dentro', async () => {
    esegui(['branch', 'worktree-agent-a1'], progetto)
    expect(await guarda({ id: 'k-1', rami: ['worktree-agent-a1'] })).toEqual({ conLavoro: [], dentro: 0, incerti: 1, mancanti: 0 })
    // Anche quando il principale va avanti, con commit e con unioni di altri.
    commit('c.txt', 'altro\n', 'avanti')
    esegui(['checkout', '-q', '-b', 'worktree-agent-a2'], progetto)
    commit('e.txt', 'di un altro\n', 'k-2: di un altro')
    esegui(['checkout', '-q', 'main'], progetto)
    esegui(['merge', '-q', '--no-ff', '--no-edit', 'worktree-agent-a2'], progetto)
    expect(await guarda({ id: 'k-1', rami: ['worktree-agent-a1'] })).toEqual({ conLavoro: [], dentro: 0, incerti: 1, mancanti: 0 })
  })

  it('lo stesso lavoro entrato per un’altra strada (senza novità): dentro; un ramo tolto: mancante', async () => {
    esegui(['checkout', '-q', '-b', 'worktree-agent-a1'], progetto)
    commit('b.txt', 'lavoro\n', 'k-1: il lavoro')
    esegui(['checkout', '-q', 'main'], progetto)
    commit('b.txt', 'lavoro\n', 'lo stesso lavoro, uscito con la release')
    expect(await guarda({ id: 'k-1', rami: ['worktree-agent-a1', 'worktree-agent-sparito'] })).toEqual({ conLavoro: [], dentro: 1, incerti: 0, mancanti: 1 })
  })

  it('un compito di prima, senza rami ricordati: valgono i rami con un commit che comincia col suo id (e non quelli di altri)', async () => {
    esegui(['checkout', '-q', '-b', 'worktree-agent-a1'], progetto)
    commit('b.txt', 'lavoro\n', 'k-165: copie con file in uso')
    esegui(['checkout', '-q', 'main'], progetto)
    esegui(['checkout', '-q', '-b', 'worktree-agent-a2'], progetto)
    commit('c.txt', 'altro\n', 'k-16: un altro compito')
    esegui(['checkout', '-q', 'main'], progetto)
    esegui(['checkout', '-q', '-b', 'altro-ramo'], progetto)
    commit('d.txt', 'a mano\n', 'k-165: un ramo fatto a mano, non di uno specialista')
    esegui(['checkout', '-q', 'main'], progetto)
    expect((await guarda({ id: 'k-165' })).conLavoro).toEqual(['worktree-agent-a1'])
    expect((await guarda({ id: 'k-16' })).conLavoro).toEqual(['worktree-agent-a2'])
    expect((await guarda({ id: 'k-1' })).conLavoro).toEqual([])
    // I rami di altri compiti aperti e degli specialisti al lavoro non si guardano.
    expect((await guarda({ id: 'k-165' }, new Set(['worktree-agent-a1']))).conLavoro).toEqual([])
  })
})
