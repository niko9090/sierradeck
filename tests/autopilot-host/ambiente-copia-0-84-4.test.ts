import { describe, it, expect } from 'vitest'
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { peggioratiDelRamo, preparaCopia, problemaDiAmbiente, togliCollegamenti } from '../../src/autopilot-host/ambiente-copia'
import { daRicordare } from '../../src/autopilot-host/criteri-veloci'
import { verdettoAccettato } from '@shared/ruoli-agenti'

/**
 * 0.84.4 — la Revisione non respinge rami giusti per l'ambiente della copia.
 * Le uscite sono quelle dei casi veri del 23/10 (c-95 e c-106 rimandati
 * indietro 4 e 5 volte; c-82, c-97, c-99, c-109 con la copia sparita).
 */
const TS = 'Il TypeScript del programma compila senza errori'
const ALTRI = 'Gli altri test del programma passano (servizio, renderer, condivisi, pty)'
const ANDROID = 'L\'app Android compila e i suoi test unitari passano'
const LISTA = 'Lista dei lavori in .sierradeck/quaderno/lista-lavori.md'

const rosso = (descrizione: string, uscita: string, misurato?: boolean) => ({ descrizione, comando: 'x', passato: false, uscita, ...(misurato !== undefined ? { misurato } : {}) })
const verde = (descrizione: string) => ({ descrizione, comando: 'x', passato: true, uscita: '' })

describe('i fallimenti per l’ambiente si riconoscono (casi del 23/10)', () => {
  it('tsc non riconosciuto nella copia di c-106', () => {
    expect(problemaDiAmbiente(rosso(TS, "> tsc --noEmit\r\n\r\n'tsc' non è riconosciuto come comando interno o esterno,\r\n un programma eseguibile o un file batch.", false))).toBeDefined()
    expect(problemaDiAmbiente(rosso(TS, 'sh: line 1: tsc: command not found'))).toBeDefined()
  })
  it('npx vitest che scarica un’altra vitest (c-95)', () => {
    expect(problemaDiAmbiente(rosso(ALTRI, 'Need to install the following packages:\nvitest@5.0.5\nOk to proceed? (y)'))).toBeDefined()
    expect(problemaDiAmbiente(rosso(ALTRI, "failed to load config from vitest.config.ts\nError [ERR_MODULE_NOT_FOUND]: Cannot find package 'vitest' imported from E:\\copia\\vitest.config.ts"))).toBeDefined()
    expect(problemaDiAmbiente(rosso(ALTRI, "Error: Cannot find module 'E:\\copia\\node_modules\\vitest\\vitest.mjs'"))).toBeDefined()
  })
  it('gradle senza SDK (android/local.properties non c’è nelle copie)', () => {
    expect(problemaDiAmbiente(rosso(ANDROID, "SDK location not found. Define a valid SDK location with an ANDROID_HOME environment variable or by setting the sdk.dir path in your project's local properties file"))).toBeDefined()
  })
  it('i difetti veri restano difetti del ramo', () => {
    expect(problemaDiAmbiente(rosso(TS, "src/a.ts(3,20): error TS2307: Cannot find module './nuovo' or its corresponding type declarations."))).toBeUndefined()
    expect(problemaDiAmbiente(rosso(ALTRI, 'AssertionError: expected 1 to be 2\n Test Files  1 failed | 80 passed'))).toBeUndefined()
    expect(problemaDiAmbiente(rosso(ALTRI, "Error: Cannot find module './tolto' imported from tests/a.test.ts"))).toBeUndefined()
    expect(problemaDiAmbiente(verde(TS))).toBeUndefined()
  })
  it('un esito rosso per l’ambiente non si ricorda per il commit: rimesso node_modules si rimisura', () => {
    expect(daRicordare(rosso(TS, "Cannot find package 'typescript' imported from x"))).toBe(false)
    expect(daRicordare(rosso(ALTRI, 'AssertionError: expected 1 to be 2'))).toBe(true)
  })
})

describe('peggioratiDelRamo divide il ramo dall’ambiente', () => {
  const base = [verde(TS), verde(ALTRI), verde(ANDROID), verde(LISTA)]
  it('c-106: ramo uguale a main, rosso solo per i moduli mancanti → niente rimando indietro', () => {
    const ramo = [
      rosso(TS, "'tsc' non è riconosciuto come comando interno o esterno", false),
      rosso(ALTRI, 'Need to install the following packages:\nvitest@5.0.5'),
      verde(ANDROID), verde(LISTA)
    ]
    const p = peggioratiDelRamo(base, ramo, true)
    expect(p.delRamo).toEqual([])
    expect(p.ambiente).toHaveLength(2)
    const v = verdettoAccettato({ esito: 'ok', note: 'controllati src/a.ts:3' }, p.delRamo, 'REVISIONE: OK — src/a.ts:3', p.ambiente)
    expect(v.esito).toBe('ok')
    expect(v.note).toContain('Problema di ambiente nella copia, non del ramo')
  })
  it('c-82/c-97: la copia non è più un repository git → la lista dei lavori rossa non è colpa del ramo', () => {
    const p = peggioratiDelRamo(base, [verde(TS), verde(ALTRI), verde(ANDROID), rosso(LISTA, '')], false)
    expect(p.delRamo).toEqual([])
    expect(p.ambiente[0]).toContain('non è un repository git')
  })
  it('un test rosso vero continua a rimandare indietro', () => {
    const p = peggioratiDelRamo(base, [verde(TS), rosso(ALTRI, 'AssertionError: expected 1 to be 2'), verde(ANDROID), verde(LISTA)], true)
    expect(p.delRamo).toEqual([ALTRI])
    expect(verdettoAccettato({ esito: 'ok', note: 'src/a.ts:3' }, p.delRamo, '', p.ambiente).esito).toBe('rifare')
  })
})

describe('preparaCopia e togliCollegamenti', () => {
  const finti = () => {
    const radice = mkdtempSync(join(tmpdir(), 'sd-amb-'))
    const principale = join(radice, 'principale')
    const copia = join(radice, 'copia')
    mkdirSync(join(principale, 'node_modules', 'vitest'), { recursive: true })
    writeFileSync(join(principale, 'node_modules', 'vitest', 'package.json'), '{}')
    mkdirSync(join(principale, 'android'), { recursive: true })
    writeFileSync(join(principale, 'android', 'local.properties'), 'sdk.dir=C\\:\\\\sdk')
    mkdirSync(join(copia, 'android'), { recursive: true })
    for (const d of [principale, copia]) writeFileSync(join(d, 'package.json'), '{}')
    return { principale, copia }
  }

  it('rimette node_modules come collegamento e local.properties come copia; poi toglie solo il collegamento', () => {
    const { principale, copia } = finti()
    const p = preparaCopia(copia, principale)
    expect(p.messi).toEqual(['node_modules collegato', 'android/local.properties copiato'])
    expect(lstatSync(join(copia, 'node_modules')).isSymbolicLink()).toBe(true)
    expect(existsSync(join(copia, 'node_modules', 'vitest', 'package.json'))).toBe(true)
    expect(readFileSync(join(copia, 'android', 'local.properties'), 'utf8')).toContain('sdk.dir')
    // Una seconda volta non rifà niente.
    expect(preparaCopia(copia, principale).messi).toEqual([])
    expect(togliCollegamenti(copia)).toEqual(['node_modules'])
    expect(existsSync(join(copia, 'node_modules'))).toBe(false)
    // La cartella vera della cartella principale resta intera.
    expect(existsSync(join(principale, 'node_modules', 'vitest', 'package.json'))).toBe(true)
  })

  it('una node_modules vera nella copia non si tocca, e la cartella principale non si prepara mai', () => {
    const { principale, copia } = finti()
    mkdirSync(join(copia, 'node_modules'))
    writeFileSync(join(copia, 'node_modules', 'mio.txt'), 'x')
    expect(preparaCopia(copia, principale).messi).toEqual(['android/local.properties copiato'])
    expect(togliCollegamenti(copia)).toEqual([])
    expect(existsSync(join(copia, 'node_modules', 'mio.txt'))).toBe(true)
    expect(preparaCopia(principale, principale)).toEqual({ messi: [], mancano: [] })
  })

  it('una copia che non c’è più: niente da fare, nessun errore', () => {
    const { principale } = finti()
    expect(preparaCopia(join(principale, '..', 'sparita'), principale)).toEqual({ messi: [], mancano: [] })
    expect(togliCollegamenti(join(principale, '..', 'sparita'))).toEqual([])
  })
})
