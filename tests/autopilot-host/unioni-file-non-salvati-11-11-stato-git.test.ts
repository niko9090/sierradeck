import { describe, it, expect, beforeEach } from 'vitest'
import { existsSync, readFileSync, utimesSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chiudiProvaAsincrono, comeAsincrono, creaWorktree, iniziaProvaAsincrono, LOCK_VECCHIO_MS, MOTIVO_CARTELLA_SPORCA, salvaLavoro, type GitAsincrono } from '../../src/autopilot-host/worktree'
import { esegui, git, repositoryDiPartenza } from './worktree-comune'

/**
 * 24/11 (k-err264): BG4 restava ferma ~8 ore con «la cartella di lavoro ha modifiche non salvate» senza «(N file)».
 * Causa: la cartella era ferma per uno stato git a metà (un'unione di prova interrotta mentre git teneva `index.lock`:
 * da lì `merge --abort` falliva per sempre) o per un errore di `git status` letto come «sporca». `status` non elencava file.
 */
const repo = repositoryDiPartenza()
let progetto = ''
beforeEach(() => { progetto = repo.copia() })
const ga = comeAsincrono(git)

function ramoConLavoro(): string {
  const wt = creaWorktree(git, { cwd: progetto, autopilota: 'ap1', chat: 'c-1', base: 'main' })
  if (!wt.ok) throw new Error('worktree non creato')
  writeFileSync(join(wt.cartella, 'b.txt'), 'dalla chat\n')
  salvaLavoro(git, wt.cartella, 'pezzo')
  return wt.ramo
}

const vecchio = (file: string): void => { const t = new Date(Date.now() - LOCK_VECCHIO_MS - 60_000); utimesSync(file, t, t) }

describe('cartella ferma senza file elencati', () => {
  it('prova del programma interrotta con un index.lock vecchio: si toglie il blocco, si annulla la prova, si riparte, e il registro lo dice', async () => {
    const ramo = ramoConLavoro()
    expect(await iniziaProvaAsincrono(ga, { cwd: progetto, ramo, base: 'main' })).toEqual({ ok: true })
    const blocco = join(progetto, '.git', 'index.lock')
    writeFileSync(blocco, '')
    vecchio(blocco)
    // Il caso vero: con il blocco `merge --abort` non può girare, la prova resta aperta.
    expect(git(['merge', '--abort'], progetto).codice).not.toBe(0)
    expect(existsSync(join(progetto, '.git', 'MERGE_HEAD'))).toBe(true)
    const registro: string[] = []
    expect(await iniziaProvaAsincrono(ga, { cwd: progetto, ramo, base: 'main', registro: (r) => registro.push(r), processiGit: () => false })).toEqual({ ok: true })
    expect(existsSync(blocco)).toBe(false)
    expect(registro.join('\n')).toMatch(/index\.lock/)
    expect(registro.join('\n')).toMatch(/annullata un’unione di prova/)
    expect(await chiudiProvaAsincrono(ga, { cwd: progetto, tieni: true })).toBe(true)
  })

  it('un index.lock vecchio ma con un git vivo, o troppo recente, non si tocca e l’avviso lo nomina', async () => {
    const ramo = ramoConLavoro()
    const blocco = join(progetto, '.git', 'index.lock')
    writeFileSync(blocco, '')
    vecchio(blocco)
    const vivo = await iniziaProvaAsincrono(ga, { cwd: progetto, ramo, base: 'main', processiGit: () => true })
    expect(vivo).toMatchObject({ ok: false, motivo: MOTIVO_CARTELLA_SPORCA })
    expect(vivo.ok ? '' : vivo.dettaglio).toMatch(/index\.lock/)
    expect(existsSync(blocco)).toBe(true)
    const ora = new Date()
    utimesSync(blocco, ora, ora)
    expect(await iniziaProvaAsincrono(ga, { cwd: progetto, ramo, base: 'main', processiGit: () => false })).toMatchObject({ ok: false, motivo: MOTIVO_CARTELLA_SPORCA })
    expect(existsSync(blocco)).toBe(true)
  })

  it('un’unione aperta da Nicholas non si tocca: l’avviso dice MERGE_HEAD e che non è del programma', async () => {
    const ramo = ramoConLavoro()
    esegui(['merge', '--no-ff', '--no-commit', ramo], progetto)
    const r = await iniziaProvaAsincrono(ga, { cwd: progetto, ramo, base: 'main' })
    expect(r).toMatchObject({ ok: false, motivo: MOTIVO_CARTELLA_SPORCA })
    const dettaglio = r.ok ? '' : r.dettaglio ?? ''
    expect(dettaglio).toMatch(/MERGE_HEAD/)
    expect(dettaglio).toMatch(/non è del programma/)
    expect(existsSync(join(progetto, '.git', 'MERGE_HEAD'))).toBe(true)
    expect(readFileSync(join(progetto, 'b.txt'), 'utf8')).toBe('dalla chat\n')
  })

  it('un cherry-pick o un rebase a metà si nominano e non si toccano', async () => {
    const ramo = ramoConLavoro()
    const stato = join(progetto, '.git', 'CHERRY_PICK_HEAD')
    writeFileSync(stato, `${esegui(['rev-parse', 'HEAD'], progetto)}\n`)
    const r = await iniziaProvaAsincrono(ga, { cwd: progetto, ramo, base: 'main' })
    expect(r.ok ? '' : r.dettaglio).toMatch(/CHERRY_PICK_HEAD/)
    expect(existsSync(stato)).toBe(true)
  })

  it('un errore di git status non è «cartella sporca»: l’avviso dice che git non ha risposto', async () => {
    const ramo = ramoConLavoro()
    const rotto: GitAsincrono = (args, cwd, segnale) => args[0] === 'status' ? Promise.resolve({ codice: 1, uscita: 'git fermato: tempo scaduto' }) : ga(args, cwd, segnale)
    const r = await iniziaProvaAsincrono(rotto, { cwd: progetto, ramo, base: 'main' })
    expect(r).toMatchObject({ ok: false, motivo: MOTIVO_CARTELLA_SPORCA })
    expect(r.ok ? '' : r.dettaglio).toMatch(/non è una cartella sporca: git status non ha risposto \(git fermato: tempo scaduto\)/)
  })
})
