import { describe, it, expect, afterEach, vi } from 'vitest'
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Server } from 'node:http'
import { radiceDellaCopia, togliCollegamenti } from '../../src/autopilot-host/ambiente-copia'
import { AGENTI_ORCHESTRATORE, agentiSenzaGit, fileAgenti, type DefinizioneAgente } from '../../src/autopilot-host/agenti-orchestratore'
import { apriArchivio } from '../../src/autopilot-host/archivio'
import { creaServer, type ServerAutopiloti } from '../../src/autopilot-host/server'
import { creaRegistroDomande } from '../../src/autopilot-host/domande'
import { creaTurni } from '../../src/autopilot-host/turni-criteri'
import { unicoFinto } from '../setup/unico-finto'
import { nuovoAutopilota } from '@shared/autopilota'

/**
 * 11/11 (voce 4): gli specialisti partono con le regole fisse dei comandi nella
 * copia (quelle che la CLI fa rispettare e che ognuno riscopriva a forza di
 * rifiuti), e con la copia già pronta: la giunzione a `node_modules` la mette
 * il programma al loro primo strumento.
 */

const eLink = (p: string): boolean => { try { return lstatSync(p).isSymbolicLink() } catch { return false } }

describe('la radice della copia di uno specialista', () => {
  const principale = join(tmpdir(), 'progetto-di-prova')
  const copia = join(principale, '.claude', 'worktrees', 'agent-a1')

  it('dal cwd dell’hook: la copia stessa, o una sua sottocartella', () => {
    expect(radiceDellaCopia(copia, principale)).toBe(copia)
    expect(radiceDellaCopia(join(copia, 'android', 'app'), principale)).toBe(copia)
    expect(radiceDellaCopia(`${copia}/src`.replace(/\\/g, '/'), principale)).toBe(copia)
  })

  it('niente da preparare fuori dalle copie: la principale, la cartella delle copie, un’altra cartella, un trucco con i due punti', () => {
    expect(radiceDellaCopia(principale, principale)).toBeUndefined()
    expect(radiceDellaCopia(join(principale, 'src'), principale)).toBeUndefined()
    expect(radiceDellaCopia(join(principale, '.claude', 'worktrees'), principale)).toBeUndefined()
    expect(radiceDellaCopia(join(tmpdir(), 'altro'), principale)).toBeUndefined()
    expect(radiceDellaCopia(join(copia, '..', '..', '..', 'src'), principale)).toBeUndefined()
    expect(radiceDellaCopia(join(principale, '.claude', 'worktrees-finti', 'x'), principale)).toBeUndefined()
  })
})

describe('le regole fisse nel prompt degli specialisti', () => {
  const conCopia = Object.entries(AGENTI_ORCHESTRATORE).filter(([, a]) => a.isolation === 'worktree')

  it('ogni specialista con la sua copia riceve le regole dei comandi e la prima mossa', () => {
    expect(conCopia.length).toBeGreaterThanOrEqual(6)
    for (const [nome, a] of conCopia) {
      expect(a.prompt, nome).toContain('git merge --ff-only main')
      expect(a.prompt, nome).toContain('un solo comando git per chiamata')
      expect(a.prompt, nome).toContain('mai `cd` né `git -C` verso la cartella principale')
      expect(a.prompt, nome).toContain('niente `cmd /c`')
      expect(a.prompt, nome).toContain('non `$(cat elenco)`')
      expect(a.prompt, nome).toContain('`node_modules` è già collegato dal programma')
      expect(a.prompt, nome).toContain('non creare giunzioni')
    }
  })

  it('le regole non contengono le parole che il flusso scambia per un Agent partito', () => {
    // Un rifiuto con «sottofondo/async/background» veniva letto come Agent in sottofondo: qui è un prompt, non un rifiuto,
    // ma il nome di nessun PC, nessun percorso personale e nessun indirizzo devono entrarci.
    for (const [, a] of conCopia) {
      expect(a.prompt).not.toMatch(/[A-Za-z]:\\Users\\|\/Users\/|\b\d{1,3}(\.\d{1,3}){3}\b/u)
    }
  })

  it('senza git non c’è una copia: né allineamento né regole della copia', () => {
    for (const [nome, a] of Object.entries(agentiSenzaGit())) {
      expect(a.prompt, nome).not.toContain('git merge --ff-only')
      expect(a.prompt, nome).not.toContain('Regole dei comandi nella tua copia')
      expect(a.prompt, nome).toContain('non è un repository git')
      expect(a.isolation, nome).toBeUndefined()
    }
  })

  it('il ramo principale del progetto entra nella riga di allineamento; un nome strano no', () => {
    const leggi = (t: string): Record<string, DefinizioneAgente> => JSON.parse(t) as Record<string, DefinizioneAgente>
    expect(leggi(fileAgenti(true)).sviluppatore!.prompt).toContain('git merge --ff-only main')
    const sviluppo = leggi(fileAgenti(true, 'sviluppo')).sviluppatore!.prompt
    expect(sviluppo).toContain('git merge --ff-only sviluppo')
    expect(sviluppo).toContain('git diff sviluppo...HEAD')
    expect(sviluppo).not.toContain('--ff-only main')
    for (const strano of ['-x', 'main; rm -rf .', 'a b', '$(whoami)', '']) {
      expect(leggi(fileAgenti(true, strano)).sviluppatore!.prompt).toContain('git merge --ff-only main')
    }
    expect(leggi(fileAgenti(false, 'sviluppo')).sviluppatore!.prompt).not.toContain('ff-only')
  })
})

describe('la copia pronta al primo strumento dello specialista', () => {
  let server: ServerAutopiloti | undefined
  afterEach(() => { server?.close(); server = undefined; vi.restoreAllMocks() })

  /** Un progetto di prova con `node_modules` vero, e la copia di uno specialista com'è appena aperta: solo i file tracciati. */
  const progettoConCopia = (): { principale: string; copia: string } => {
    const principale = join(mkdtempSync(join(tmpdir(), 'sd-copia-pronta-')), 'progetto')
    mkdirSync(join(principale, 'node_modules', 'vitest'), { recursive: true })
    writeFileSync(join(principale, 'node_modules', 'vitest', 'index.js'), 'vero\n')
    writeFileSync(join(principale, 'package.json'), '{"name":"prova"}\n')
    mkdirSync(join(principale, 'android'))
    writeFileSync(join(principale, 'android', 'local.properties'), 'sdk.dir=dove-sta\n')
    const copia = join(principale, '.claude', 'worktrees', 'agent-a1')
    mkdirSync(join(copia, 'android'), { recursive: true })
    writeFileSync(join(copia, 'package.json'), '{"name":"prova"}\n')
    return { principale, copia }
  }

  const avvia = async (principale: string): Promise<(corpo: Record<string, unknown>) => Promise<unknown>> => {
    vi.spyOn(console, 'info').mockImplementation(() => {})
    const archivio = apriArchivio(mkdtempSync(join(tmpdir(), 'ap-copia-pronta-')))
    server = creaServer({
      ...unicoFinto(archivio),
      archivio,
      esegui: () => Promise.resolve({ codice: 0, uscita: '' }),
      avviaLavoro: () => Promise.resolve(),
      avvisa: () => Promise.resolve(),
      domande: creaRegistroDomande({ adesso: () => Date.now() }),
      scadenzaDomandaMs: 5000,
      adesso: () => new Date().toISOString(),
      turni: creaTurni()
    })
    archivio.scrivi({ ...nuovoAutopilota({ id: 'ap-a', nome: 'a', obiettivo: 'o', cwd: principale, iniziatoIl: new Date().toISOString() }), stato: 'lavoro', chats: [] })
    const s: Server = server
    const porta = await new Promise<number>((ris) => { s.listen(0, '127.0.0.1', () => { ris((s.address() as { port: number }).port) }) })
    return async (corpo) => (await fetch(`http://127.0.0.1:${porta}/hook/pretool?ap=ap-a`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })).json()
  }

  it('al primo strumento: node_modules collegato e local.properties copiato; la cartella vera non è toccata', async () => {
    const { principale, copia } = progettoConCopia()
    const hook = await avvia(principale)
    expect(existsSync(join(copia, 'node_modules'))).toBe(false)
    expect(await hook({ agent_id: 'a1', agent_type: 'sviluppatore', cwd: copia, tool_name: 'Bash', tool_input: { command: 'git status' } })).toEqual({})
    expect(eLink(join(copia, 'node_modules'))).toBe(true)
    expect(readFileSync(join(copia, 'node_modules', 'vitest', 'index.js'), 'utf8')).toBe('vero\n')
    expect(readFileSync(join(copia, 'android', 'local.properties'), 'utf8')).toBe('sdk.dir=dove-sta\n')
    // Una volta per specialista: se lui la toglie, il programma non la rimette a ogni comando.
    expect(togliCollegamenti(copia)).toEqual(['node_modules'])
    await hook({ agent_id: 'a1', agent_type: 'sviluppatore', cwd: join(copia, 'android'), tool_name: 'Bash', tool_input: { command: 'git status' } })
    expect(existsSync(join(copia, 'node_modules'))).toBe(false)
    expect(readFileSync(join(principale, 'node_modules', 'vitest', 'index.js'), 'utf8')).toBe('vero\n')
  })

  it('da una sottocartella della copia si prepara la copia intera, non la sottocartella', async () => {
    const { principale, copia } = progettoConCopia()
    const hook = await avvia(principale)
    await hook({ agent_id: 'a2', agent_type: 'android', cwd: join(copia, 'android'), tool_name: 'Bash', tool_input: { command: 'git status' } })
    expect(eLink(join(copia, 'node_modules'))).toBe(true)
    expect(existsSync(join(copia, 'android', 'node_modules'))).toBe(false)
    togliCollegamenti(copia)
  })

  it('l’orchestratore e chi lavora fuori dalle copie non ricevono niente', async () => {
    const { principale, copia } = progettoConCopia()
    const hook = await avvia(principale)
    // Senza agent_id è l'orchestratore: lavora nella principale, niente da collegare.
    await hook({ cwd: principale, tool_name: 'Read', tool_input: { file_path: join(principale, 'package.json') } })
    // Uno specialista senza copia (cwd nella principale, o altrove).
    await hook({ agent_id: 'a3', agent_type: 'rilascio', cwd: principale, tool_name: 'Bash', tool_input: { command: 'git status' } })
    await hook({ agent_id: 'a4', agent_type: 'sviluppatore', cwd: tmpdir(), tool_name: 'Bash', tool_input: { command: 'git status' } })
    expect(existsSync(join(copia, 'node_modules'))).toBe(false)
    expect(eLink(join(principale, 'node_modules'))).toBe(false)
    expect(readFileSync(join(principale, 'node_modules', 'vitest', 'index.js'), 'utf8')).toBe('vero\n')
  })
})
