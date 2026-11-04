import { describe, it, expect, beforeEach } from 'vitest'
import { join } from 'node:path'
import { _azzeraRuntime, installaRuntimeMancanti, type Esecutore } from '../../src/main/installa-runtime'
import { aggiungiRuntimeAlPath, argomentiWinget, RUNTIME, runtimeMancanti } from '../../src/shared/runtime-noti'
import { avvisiDiSistema } from '../../src/main/preparazione'

/** 0.91.0, Nicholas 04/11: «io voglio che il sistema installi anche node.js e git se non trovati». */

const PF = 'C:\Programmi'
const LAD = 'C:\Utente\Locale'
const NODE = join(PF, 'nodejs', 'node.exe')
const GIT_UTENTE = join(LAD, 'Programs', 'Git', 'cmd', 'git.exe')

beforeEach(() => { _azzeraRuntime() })

describe('Node.js e Git mancanti (0.91.0)', () => {
  it('trovati nel PATH o nelle cartelle solite; quelli fuori dal PATH ci entrano', () => {
    const env: Record<string, string | undefined> = { Path: 'C:\bin', ProgramFiles: PF, LOCALAPPDATA: LAD }
    const presenti = new Set([NODE])
    const esiste = (p: string): boolean => presenti.has(p)
    expect(runtimeMancanti(env, esiste).map((r) => r.nome)).toEqual(['Git'])
    expect(aggiungiRuntimeAlPath(env, esiste)).toEqual([join(PF, 'nodejs')])
    expect(env.Path).toContain(join(PF, 'nodejs'))
    expect(aggiungiRuntimeAlPath(env, esiste)).toEqual([])
  })

  it('winget senza domande; Git prima per l’utente', () => {
    const git = RUNTIME.find((r) => r.nome === 'Git')!
    expect(argomentiWinget(git, 'user')).toEqual(['install', '--id', 'Git.Git', '--exact', '--silent', '--accept-package-agreements', '--accept-source-agreements', '--disable-interactivity', '--scope', 'user'])
    expect(git.ambiti[0]).toBe('user')
  })

  it('installa ciò che manca, uno alla volta, e lo mette nel PATH', async () => {
    const env: Record<string, string | undefined> = { Path: 'C:\bin', ProgramFiles: PF, LOCALAPPDATA: LAD }
    const presenti = new Set<string>()
    const chiamate: string[][] = []
    const esegui: Esecutore = async (_f, args) => {
      chiamate.push(args)
      const id = args[args.indexOf('--id') + 1]
      if (id === 'Git.Git') presenti.add(GIT_UTENTE)
      if (id === 'OpenJS.NodeJS.LTS') presenti.add(NODE)
      return { codice: 0, uscita: 'Installazione completata' }
    }
    const stati = await installaRuntimeMancanti({ env, esiste: (p) => presenti.has(p), esegui })
    expect(stati).toEqual([{ nome: 'Node.js', stato: 'installato' }, { nome: 'Git', stato: 'installato' }])
    expect(chiamate.map((a) => a[2])).toEqual(['OpenJS.NodeJS.LTS', 'Git.Git'])
    expect(env.Path).toContain(join(LAD, 'Programs', 'Git', 'cmd'))
  })

  it('Git per l’utente non riesce: riprova per la macchina; senza winget lo dice', async () => {
    const env: Record<string, string | undefined> = { Path: 'C:\bin', ProgramFiles: PF, LOCALAPPDATA: LAD }
    const presenti = new Set<string>([NODE])
    const ambiti: string[] = []
    const esegui: Esecutore = async (_f, args) => {
      ambiti.push(args.includes('--scope') ? args[args.length - 1]! : 'nessuno')
      if (args.includes('user')) return { codice: 1, uscita: 'Nessun programma di installazione applicabile' }
      presenti.add(join(PF, 'Git', 'cmd', 'git.exe'))
      return { codice: 0, uscita: '' }
    }
    expect(await installaRuntimeMancanti({ env, esiste: (p) => presenti.has(p), esegui })).toEqual([{ nome: 'Git', stato: 'installato' }])
    expect(ambiti).toEqual(['user', 'nessuno'])

    _azzeraRuntime()
    const senza: Esecutore = async () => { throw Object.assign(new Error('spawn winget ENOENT'), { code: 'ENOENT' }) }
    const env2: Record<string, string | undefined> = { Path: 'C:\bin', ProgramFiles: PF, LOCALAPPDATA: LAD }
    const stati = await installaRuntimeMancanti({ env: env2, esiste: () => false, esegui: senza })
    expect(stati.every((s) => s.stato === 'fallito' && /winget non c/u.test(s.dettaglio ?? ''))).toBe(true)
    const avvisi = avvisiDiSistema({ env: env2, casa: 'C:\Utente', esiste: () => false }, stati)
    expect(avvisi.every((a) => a.includes('Installa Node.js e Git'))).toBe(true)
  })

  it('«già installato» non è un errore', async () => {
    const env: Record<string, string | undefined> = { Path: 'C:\bin', ProgramFiles: PF, LOCALAPPDATA: LAD }
    const presenti = new Set<string>([GIT_UTENTE])
    const esegui: Esecutore = async () => { presenti.add(NODE); return { codice: -1978335189, uscita: 'Found an existing package already installed.' } }
    expect(await installaRuntimeMancanti({ env, esiste: (p) => presenti.has(p), esegui })).toEqual([{ nome: 'Node.js', stato: 'installato' }])
  })
})
