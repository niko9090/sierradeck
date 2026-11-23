import { describe, it, expect } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fotoModificheAsincrono, ripristinaGeneratiAsincrono, type GitAsincrono } from '../../src/autopilot-host/worktree'
import { esegui, git, repositoryDiPartenza } from './worktree-comune'

/** 23/11: la misura del criterio riscrive file tracciati (schema, distinta): il programma li rimette com'erano, mai quelli di Nicholas. Git vero. */
const repo = repositoryDiPartenza()

describe('file rigenerati dalla misura (git vero)', () => {
  it('il file rigenerato torna com’era nell’indice, quello di Nicholas no', async () => {
    const cartella = repo.copia()
    writeFileSync(join(cartella, 'distinta.csv'), 'a\n')
    writeFileSync(join(cartella, 'schema.json'), '{}\n')
    esegui(['add', '-A'], cartella)
    esegui(['commit', '-q', '-m', 'file generati'], cartella)
    writeFileSync(join(cartella, 'a.txt'), 'di Nicholas\n')
    const asinc: GitAsincrono = (args, cwd) => Promise.resolve(git(args, cwd))
    const prima = await fotoModificheAsincrono(asinc, { cwd: cartella })
    expect([...prima!]).toEqual(['a.txt'])
    writeFileSync(join(cartella, 'distinta.csv'), 'riscritta dalla misura\n')
    writeFileSync(join(cartella, 'schema.json'), '{"x":1}\n')
    expect((await ripristinaGeneratiAsincrono(asinc, { cwd: cartella, prima })).sort()).toEqual(['distinta.csv', 'schema.json'])
    expect(readFileSync(join(cartella, 'distinta.csv'), 'utf8')).toBe('a\n')
    expect(readFileSync(join(cartella, 'schema.json'), 'utf8')).toBe('{}\n')
    expect(readFileSync(join(cartella, 'a.txt'), 'utf8')).toBe('di Nicholas\n')
    expect(esegui(['status', '--porcelain'], cartella).trim()).toBe('M a.txt')
  })
})
