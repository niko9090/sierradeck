import { afterEach, describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  commitInAttesa, conRiscontroInLista, conVersione, cosaDalTitolo, diventatiVerdi, idRichiestaDi, LISTA_LAVORI,
  rigaRiscontro, righeRichieste, riscontriNuovi, testDalComando, versioniUscite
} from '../../src/autopilot-host/riscontro'
import { comeAsincrono, gitReale } from '../../src/autopilot-host/worktree'
import { apriArchivio } from '../../src/autopilot-host/archivio'
import { creaServer, type ServerAutopiloti } from '../../src/autopilot-host/server'
import { creaRegistroDomande } from '../../src/autopilot-host/domande'
import { nuovoAutopilota, type Criterio } from '../../src/shared/autopilota'

/**
 * Il riscontro con la prova (0.85.0, c-128), col caso vero del 23/10: la
 * richiesta 0t («mai più la domanda sui rifacimenti») chiusa dal commit
 * 21727a1f con il test `oltre-rifacimenti-0-84-4.test.ts`, nella 0.84.4.
 * Le righe della lista sono quelle vere, accorciate.
 */

const LISTA = [
  '---',
  'titolo: "Lista dei lavori"',
  '---',
  '',
  '| # | Richiesta | Data | Stato |',
  '|---|---|---|---|',
  "| 0r | **0.84.4 (patch): la Revisione non respinge rami giusti per l'ambiente della copia.** Il 23/10 c-95 e c-106 rimandati indietro 4-5 volte perché nella copia mancava `node_modules` | 23/10 | **fatto sul ramo c-119 (23/10), va nella 0.84.4** |",
  "| 0s | **0.84.4 (patch): le risposte di Nicholas prese davvero.** Il 23/10 tre «rifallo ancora» comparivano come «l'ha ricevuta», ma nel registro nessuna traccia | 23/10 | **fatto sul ramo c-120 (23/10), va nella 0.84.4** |",
  "| 0t | **0.84.4 PRIMA DI TUTTO: mai più «Come vado avanti con …, che la Revisione ha già rimandato indietro N volte?».** Nicholas, 23/10: «sei tu che devi trovare le soluzioni, non io». Dopo troppi «da rifare» decide il programma | 23/10 | **fatto sul ramo c-125 (23/10), va nella 0.84.4** |",
  '| 0.84.4 | **0.84.4 (patch)**, richieste del 23/10: la Revisione non respinge un ramo, le risposte prese davvero, mai più la domanda sui rifacimenti, decide il programma | 23/10 | **in corso** |',
  '| 6c | **0.84.4: chat con il terminale che non parte.** Il programma riapre la chat da solo | 23/10 | **fatto sul ramo c-121 (23/10)** |',
  ''
].join('\n')

/** Il criterio vero dell'autopilota, per la parte della richiesta 0t. */
const CRITERIO_0T = '0.84.4 — Mai più la domanda «Come vado avanti con …, che la Revisione ha già rimandato indietro N volte?»: decide il programma'
const TITOLO_VERO = 'fix(autopilota): oltre i rifacimenti decide il programma, mai più «Come vado avanti con …?» (0.84.4, c-125)'
const TEST_VERO = 'tests/autopilot-host/oltre-rifacimenti-0-84-4.test.ts'

function git(cwd: string, ...args: string[]): string {
  const r = spawnSync('git', ['-c', 'user.name=prova', '-c', 'user.email=prova@example.invalid', '-c', 'commit.gpgsign=false', ...args], { cwd, encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`)
  return r.stdout.trim()
}

/** Un repository come quello vero: main con la lista, il ramo della chat che porta commit e test, unito. */
function repoDel23(): { cwd: string; commit: string } {
  const cwd = mkdtempSync(join(tmpdir(), 'riscontro-'))
  git(cwd, 'init', '-q', '-b', 'main')
  // Il commit della lista lo fa il programma col git del repository, come nella cartella vera.
  git(cwd, 'config', 'user.name', 'prova')
  git(cwd, 'config', 'user.email', 'prova@example.invalid')
  git(cwd, 'config', 'commit.gpgsign', 'false')
  git(cwd, 'config', 'core.autocrlf', 'false')
  mkdirSync(join(cwd, '.sierradeck', 'quaderno'), { recursive: true })
  writeFileSync(join(cwd, LISTA_LAVORI), LISTA)
  git(cwd, 'add', '-A')
  // La lista c'era da prima del lavoro di c-125, come nel caso vero. Senza una
  // data sua i due commit nascono nello stesso secondo, e a parità di data
  // `git log -1 --no-merges` dà il primo genitore dell'unione (questo):
  // il test passava o falliva a seconda del secondo (c-122, 23/10).
  const prima = new Date(Date.now() - 60_000).toISOString()
  const r = spawnSync('git', ['commit', '-q', '-m', 'docs(quaderno): lista dei lavori'], { cwd, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_DATE: prima, GIT_COMMITTER_DATE: prima } })
  if (r.status !== 0) throw new Error(`git commit: ${r.stderr}`)
  git(cwd, 'tag', 'v0.84.3')
  git(cwd, 'checkout', '-q', '-b', 'ap/c-125')
  mkdirSync(join(cwd, 'tests', 'autopilot-host'), { recursive: true })
  writeFileSync(join(cwd, TEST_VERO), '// la regola oltre i rifacimenti\n')
  writeFileSync(join(cwd, 'tests', 'autopilot-host', 'server.test.ts'), '// ritoccato insieme\n')
  git(cwd, 'add', '-A')
  git(cwd, 'commit', '-q', '-m', TITOLO_VERO)
  const commit = git(cwd, 'rev-parse', '--short', 'HEAD')
  git(cwd, 'checkout', '-q', 'main')
  git(cwd, 'merge', '-q', '--no-ff', '-m', "Merge branch 'ap/c-125'", 'ap/c-125')
  return { cwd, commit }
}

const criterio = (soddisfatto: boolean, comando?: string): Criterio => ({ descrizione: CRITERIO_0T, soddisfatto, ...(comando !== undefined ? { comando } : {}) })

describe('la richiesta di un criterio', () => {
  it('il caso vero: il criterio della 0.84.4 è la richiesta 0t, non la riga della release', () => {
    expect(righeRichieste(LISTA).map((r) => r.id)).toEqual(['0r', '0s', '0t', '6c'])
    expect(idRichiestaDi({ descrizione: CRITERIO_0T }, righeRichieste(LISTA))).toBe('0t')
  })

  it('un «[6c]» nel criterio vale più della somiglianza', () => {
    expect(idRichiestaDi({ descrizione: '[6c] Mai più la domanda sui rifacimenti' }, righeRichieste(LISTA))).toBe('6c')
  })

  it('un criterio che non somiglia a nessuna richiesta non chiude niente', () => {
    expect(idRichiestaDi({ descrizione: 'Il TypeScript del programma compila senza errori' }, righeRichieste(LISTA))).toBeUndefined()
    expect(idRichiestaDi({ descrizione: 'I test del programma principale passano' }, righeRichieste(LISTA))).toBeUndefined()
  })

  it('solo i criteri passati da rosso a verde', () => {
    const rosso = criterio(false)
    expect(diventatiVerdi([rosso], [criterio(true)])).toHaveLength(1)
    expect(diventatiVerdi([criterio(true)], [criterio(true)])).toHaveLength(0)
    expect(diventatiVerdi([rosso], [rosso])).toHaveLength(0)
  })

  it('cosa è cambiato, dal titolo del commit, e il test dal comando', () => {
    expect(cosaDalTitolo(TITOLO_VERO)).toBe('oltre i rifacimenti decide il programma, mai più «Come vado avanti con …?»')
    expect(testDalComando(`npx vitest run ${TEST_VERO} --maxWorkers=2`)).toBe(TEST_VERO)
    expect(testDalComando('npm run typecheck')).toBeUndefined()
  })
})

describe('il riscontro con il git vero (caso del 23/10)', () => {
  it('riga con cosa, commit, test e «nella prossima versione»; poi la 0.84.4 quando esce il tag', { timeout: 60_000 }, async () => {
    const { cwd, commit } = repoDel23()
    const g = comeAsincrono(gitReale)
    const nuovi = await riscontriNuovi({ git: g, cwd, verdi: [criterio(true)], lista: LISTA, giaDetto: '' })
    expect(nuovi).toEqual([{ richiesta: '0t', cosa: 'oltre i rifacimenti decide il programma, mai più «Come vado avanti con …?»', commit, test: TEST_VERO }])
    const riga = rigaRiscontro(nuovi[0]!)
    expect(riga).toBe(`Fatto [0t]: oltre i rifacimenti decide il programma, mai più «Come vado avanti con …?» — commit ${commit} · test ${TEST_VERO} · nella prossima versione`)
    // Già detto: non si ripete.
    expect(await riscontriNuovi({ git: g, cwd, verdi: [criterio(true)], lista: LISTA, giaDetto: riga })).toEqual([])
    // Nessun tag ancora: niente da aggiornare.
    expect(commitInAttesa(riga)).toEqual([commit])
    expect((await versioniUscite(g, cwd, [riga])).size).toBe(0)
    // Esce la 0.84.4.
    git(cwd, 'tag', 'v0.84.4')
    const uscite = await versioniUscite(g, cwd, [riga])
    expect([...uscite]).toEqual([[commit, '0.84.4']])
    expect(conVersione(riga, commit, '0.84.4')).toBe(`Fatto [0t]: oltre i rifacimenti decide il programma, mai più «Come vado avanti con …?» — commit ${commit} · test ${TEST_VERO} · nella 0.84.4`)
    // A tag già uscito il riscontro nasce con la versione.
    expect((await riscontriNuovi({ git: g, cwd, verdi: [criterio(true)], lista: LISTA, giaDetto: '' }))[0]?.versione).toBe('0.84.4')
  })

  // 29/10: il commit «docs(quaderno): riscontro…» non si fa più (vedi il
  // servizio, sotto). Resta la regola pura che scrive il riscontro nella riga.
  it('la riga della lista con il riscontro (regola pura): in coda alla cella dello stato, poi la versione senza raddoppiare', () => {
    const r = { richiesta: '0t', cosa: 'oltre i rifacimenti decide il programma', commit: 'abc1234', test: TEST_VERO }
    const riga0t = conRiscontroInLista(LISTA, r).split('\n').find((l) => l.startsWith('| 0t |'))!
    expect(riga0t).toContain('**fatto sul ramo c-125 (23/10), va nella 0.84.4** · **Riscontro:** Fatto [0t]: oltre i rifacimenti decide il programma')
    expect(riga0t).toContain(`commit abc1234 · test ${TEST_VERO} · nella prossima versione |`)
    const dopo = conVersione(conRiscontroInLista(conRiscontroInLista(LISTA, r), { ...r, versione: '0.84.4' }), 'abc1234', '0.84.4').split('\n').find((l) => l.startsWith('| 0t |'))!
    expect(dopo.split('**Riscontro:**')).toHaveLength(2)
    expect(dopo).toMatch(/· nella 0\.84\.4 \|$/)
  })
})

describe('nel servizio: la riga nella conversazione quando il criterio diventa verde', () => {
  let server: ServerAutopiloti | undefined
  afterEach(() => { server?.close() })

  // 29/10: la riga resta nella conversazione e nel registro; la lista dei
  // lavori non si tocca e nel principale non nasce nessun commit di note.
  it('ricontrollo dopo l unione: riga nella conversazione e nel registro, nessun commit nella lista; poi la versione', { timeout: 60_000 }, async () => {
    const { cwd, commit } = repoDel23()
    const archivio = apriArchivio(mkdtempSync(join(tmpdir(), 'riscontro-ap-')))
    server = creaServer({
      archivio,
      esegui: () => Promise.resolve({ codice: 0, uscita: 'ok' }),
      interroga: () => Promise.resolve({ testo: '{"azione": "finito"}' }),
      avviaLavoro: () => Promise.resolve(),
      fermaLavoro: () => {},
      avvisa: () => Promise.resolve(),
      domande: creaRegistroDomande({ adesso: () => Date.now() }),
      scadenzaDomandaMs: 5000,
      scadenzaInterviataMs: 5000,
      adesso: () => '2026-10-23T12:00:00.000Z',
      git: gitReale
    })
    archivio.scrivi({ ...nuovoAutopilota({ id: 'ap-0t', nome: 'Rifacimenti', obiettivo: 'o', cwd, criteri: [criterio(false, `node -e 0 ${TEST_VERO}`)], iniziatoIl: '2026-10-23T10:00:00.000Z' }), stato: 'finito' })
    const attendi = async (vero: () => boolean): Promise<void> => {
      for (let i = 0; i < 200 && !vero(); i += 1) await new Promise((r) => setTimeout(r, 25))
    }
    const dettoNelDialogo = (): string => (archivio.leggi('ap-0t')?.dialogo ?? []).map((s) => s.testo).join('\n')

    expect(await server.ricontrollaCriteri('ap-0t')).toBe(true)
    const testaPrima = git(cwd, 'rev-parse', 'HEAD')
    await attendi(() => dettoNelDialogo().includes('Fatto [0t]'))
    const a = archivio.leggi('ap-0t')!
    const riga = a.dialogo.find((s) => s.testo.startsWith('Fatto [0t]'))!
    expect(riga).toMatchObject({ da: 'lui', traccia: true })
    expect(riga.testo).toBe(`Fatto [0t]: oltre i rifacimenti decide il programma, mai più «Come vado avanti con …?» — commit ${commit} · test ${TEST_VERO} · nella prossima versione`)
    expect(a.decisioni.map((d) => d.cosa)).toContain(`riscontro: ${riga.testo}`)
    expect(readFileSync(join(cwd, LISTA_LAVORI), 'utf8')).not.toContain('**Riscontro:**')
    expect(git(cwd, 'rev-parse', 'HEAD')).toBe(testaPrima)

    // Esce la 0.84.4; al ricontrollo dopo la riga dice la versione, senza una riga in più.
    git(cwd, 'tag', 'v0.84.4')
    expect(await server.ricontrollaCriteri('ap-0t')).toBe(true)
    await attendi(() => dettoNelDialogo().includes('nella 0.84.4'))
    const dopo = archivio.leggi('ap-0t')!
    expect(dopo.dialogo.filter((s) => s.testo.startsWith('Fatto [0t]')).map((s) => s.testo)).toEqual([riga.testo.replace('nella prossima versione', 'nella 0.84.4')])
    expect(git(cwd, 'rev-parse', 'HEAD')).toBe(testaPrima)
    expect(git(cwd, 'status', '--porcelain')).toBe('')
  })
})
