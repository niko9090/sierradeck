import { describe, it, expect, beforeEach } from 'vitest'
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chiudiProvaAsincrono, comeAsincrono, creaWorktree, iniziaProvaAsincrono, MOTIVO_CARTELLA_SPORCA, ramoSenzaNovitaAsincrono, salvaFileAsincrono, salvaLavoro, soloAggiunteNumstat, togliWorktree } from '../../src/autopilot-host/worktree'
import { elencoFile } from '../../src/autopilot-host/servizio-orchestratore'
import { esegui, git, repositoryDiPartenza } from './worktree-comune'

/** Worktree con git vero, 5/5: ramo senza novità e unione di prova (0.84.4). Il necessario comune è in `worktree-comune.ts`. */
const repo = repositoryDiPartenza()
let progetto = ''
beforeEach(() => { progetto = repo.copia() })

// 0.84.4: oltre i rifacimenti decide il programma (vedi `oltre-rifacimenti.ts`).
describe('oltre i rifacimenti: ramo senza novità e unione di prova (0.84.4)', () => {
  const ga = comeAsincrono(git)

  it('un ramo il cui lavoro è già entrato per un’altra strada non porta niente di nuovo; uno con un file suo sì', async () => {
    const wt = creaWorktree(git, { cwd: progetto, autopilota: 'ap1', chat: 'c-1', base: 'main' })
    if (!wt.ok) throw new Error('worktree non creato')
    writeFileSync(join(wt.cartella, 'b.txt'), 'dalla chat\n')
    salvaLavoro(git, wt.cartella, 'pezzo')
    expect(await ramoSenzaNovitaAsincrono(ga, { cwd: progetto, ramo: wt.ramo, base: 'main' })).toBe(false)
    // Lo stesso file entra nel principale da un'altra chat: il ramo è un doppione.
    writeFileSync(join(progetto, 'b.txt'), 'dalla chat\n')
    esegui(['add', '-A'], progetto)
    esegui(['commit', '-q', '-m', 'stesso lavoro da un altra chat'], progetto)
    expect(await ramoSenzaNovitaAsincrono(ga, { cwd: progetto, ramo: wt.ramo, base: 'main' })).toBe(true)
  })

  it('l’unione di prova: senza commit finché non si conferma; annullata, la cartella torna com’era', async () => {
    const wt = creaWorktree(git, { cwd: progetto, autopilota: 'ap1', chat: 'c-1', base: 'main' })
    if (!wt.ok) throw new Error('worktree non creato')
    writeFileSync(join(wt.cartella, 'b.txt'), 'dalla chat\n')
    salvaLavoro(git, wt.cartella, 'pezzo')
    const prima = esegui(['rev-parse', 'HEAD'], progetto)
    expect(await iniziaProvaAsincrono(ga, { cwd: progetto, ramo: wt.ramo, base: 'main' })).toEqual({ ok: true })
    expect(readFileSync(join(progetto, 'b.txt'), 'utf8')).toBe('dalla chat\n')
    expect(esegui(['rev-parse', 'HEAD'], progetto)).toBe(prima)
    expect(await chiudiProvaAsincrono(ga, { cwd: progetto, tieni: false })).toBe(false)
    expect(existsSync(join(progetto, 'b.txt'))).toBe(false)
    expect(git(['status', '--porcelain'], progetto).uscita).toBe('')
    // Di nuovo, e questa volta confermata: il ramo è unito con il suo commit.
    expect(await iniziaProvaAsincrono(ga, { cwd: progetto, ramo: wt.ramo, base: 'main' })).toEqual({ ok: true })
    expect(await chiudiProvaAsincrono(ga, { cwd: progetto, tieni: true })).toBe(true)
    expect(git(['merge-base', '--is-ancestor', wt.ramo, 'main'], progetto).codice).toBe(0)
  })

  // 11/11: prima «niente unione di prova con file a metà»: bastava un file modificato qualunque
  // e la fila delle unioni restava ferma per ore. Adesso la ferma solo un file che il ramo tocca.
  it('un file a metà che il ramo tocca ferma l’unione di prova, e si dice quale; il file resta com’è', async () => {
    const wt = creaWorktree(git, { cwd: progetto, autopilota: 'ap1', chat: 'c-1', base: 'main' })
    if (!wt.ok) throw new Error('worktree non creato')
    writeFileSync(join(wt.cartella, 'a.txt'), 'uno\ndalla chat\n')
    writeFileSync(join(wt.cartella, 'b.txt'), 'dalla chat\n')
    salvaLavoro(git, wt.cartella, 'pezzo')
    writeFileSync(join(progetto, 'a.txt'), 'a metà\n')
    const prima = esegui(['rev-parse', 'HEAD'], progetto)
    expect(await iniziaProvaAsincrono(ga, { cwd: progetto, ramo: wt.ramo, base: 'main' })).toEqual({ ok: false, motivo: MOTIVO_CARTELLA_SPORCA, file: ['a.txt'] })
    expect(readFileSync(join(progetto, 'a.txt'), 'utf8')).toBe('a metà\n')
    expect(existsSync(join(progetto, 'b.txt'))).toBe(false)
    expect(existsSync(join(progetto, '.git', 'MERGE_HEAD'))).toBe(false)
    expect(esegui(['rev-parse', 'HEAD'], progetto)).toBe(prima)
  })

  it('un file a metà che il ramo non tocca non ferma l’unione, e resta identico: dopo l’unione annullata e dopo quella confermata', async () => {
    const wt = creaWorktree(git, { cwd: progetto, autopilota: 'ap1', chat: 'c-1', base: 'main' })
    if (!wt.ok) throw new Error('worktree non creato')
    writeFileSync(join(wt.cartella, 'b.txt'), 'dalla chat\n')
    salvaLavoro(git, wt.cartella, 'pezzo')
    const aMeta = 'riga uno di Nicholas\r\nriga due, ancora a metà\n'
    writeFileSync(join(progetto, 'a.txt'), aMeta)
    const sporco = (): string => git(['status', '--porcelain', '--untracked-files=no'], progetto).uscita
    // L'unione di prova parte: il ramo dentro, il file di Nicholas com'era.
    expect(await iniziaProvaAsincrono(ga, { cwd: progetto, ramo: wt.ramo, base: 'main' })).toEqual({ ok: true })
    expect(readFileSync(join(progetto, 'b.txt'), 'utf8')).toBe('dalla chat\n')
    expect(readFileSync(join(progetto, 'a.txt'), 'utf8')).toBe(aMeta)
    // Annullata: il ramo esce, il file di Nicholas è identico e ancora «modificato, non salvato».
    expect(await chiudiProvaAsincrono(ga, { cwd: progetto, tieni: false })).toBe(false)
    expect(existsSync(join(progetto, 'b.txt'))).toBe(false)
    expect(readFileSync(join(progetto, 'a.txt'), 'utf8')).toBe(aMeta)
    expect(sporco()).toMatch(/^M a\.txt$/)
    // Di nuovo, e confermata: il commit dell'unione non porta dentro il suo file.
    expect(await iniziaProvaAsincrono(ga, { cwd: progetto, ramo: wt.ramo, base: 'main' })).toEqual({ ok: true })
    expect(await chiudiProvaAsincrono(ga, { cwd: progetto, tieni: true })).toBe(true)
    expect(git(['merge-base', '--is-ancestor', wt.ramo, 'main'], progetto).codice).toBe(0)
    expect(readFileSync(join(progetto, 'a.txt'), 'utf8')).toBe(aMeta)
    expect(sporco()).toMatch(/^M a\.txt$/)
    expect(esegui(['show', '--stat', '--format=', 'HEAD'], progetto)).not.toContain('a.txt')
    expect(esegui(['show', 'HEAD:a.txt'], progetto)).toBe('uno')
    // Mai uno stash, nemmeno uno automatico.
    expect(git(['stash', 'list'], progetto).uscita).toBe('')
  })

  it('con lo stash automatico di git acceso (merge.autoStash) i file a metà non passano da uno stash', async () => {
    esegui(['config', 'merge.autoStash', 'true'], progetto)
    const wt = creaWorktree(git, { cwd: progetto, autopilota: 'ap1', chat: 'c-1', base: 'main' })
    if (!wt.ok) throw new Error('worktree non creato')
    writeFileSync(join(wt.cartella, 'b.txt'), 'dalla chat\n')
    salvaLavoro(git, wt.cartella, 'pezzo')
    writeFileSync(join(progetto, 'a.txt'), 'a metà\n')
    expect(await iniziaProvaAsincrono(ga, { cwd: progetto, ramo: wt.ramo, base: 'main' })).toEqual({ ok: true })
    expect(existsSync(join(progetto, '.git', 'MERGE_AUTOSTASH'))).toBe(false)
    expect(git(['stash', 'list'], progetto).uscita).toBe('')
    expect(readFileSync(join(progetto, 'a.txt'), 'utf8')).toBe('a metà\n')
    expect(await chiudiProvaAsincrono(ga, { cwd: progetto, tieni: false })).toBe(false)
    expect(readFileSync(join(progetto, 'a.txt'), 'utf8')).toBe('a metà\n')
  })

  it('un file già messo nell’indice (git add) ferma l’unione anche se il ramo non lo tocca: resta nell’indice com’era', async () => {
    const wt = creaWorktree(git, { cwd: progetto, autopilota: 'ap1', chat: 'c-1', base: 'main' })
    if (!wt.ok) throw new Error('worktree non creato')
    writeFileSync(join(wt.cartella, 'b.txt'), 'dalla chat\n')
    salvaLavoro(git, wt.cartella, 'pezzo')
    writeFileSync(join(progetto, 'a.txt'), 'pronto per il commit\n')
    esegui(['add', 'a.txt'], progetto)
    expect(await iniziaProvaAsincrono(ga, { cwd: progetto, ramo: wt.ramo, base: 'main' })).toEqual({ ok: false, motivo: MOTIVO_CARTELLA_SPORCA, file: ['a.txt'] })
    expect(esegui(['diff', '--cached', '--name-only'], progetto)).toBe('a.txt')
    expect(readFileSync(join(progetto, 'a.txt'), 'utf8')).toBe('pronto per il commit\n')
    expect(existsSync(join(progetto, 'b.txt'))).toBe(false)
  })

  it('togliere la copia di una cartella che non è fra le copie delle chat non tocca niente', () => {
    const fuori = join(progetto, 'sotto')
    mkdirSync(fuori)
    writeFileSync(join(fuori, 'x.txt'), 'resta\n')
    togliWorktree(git, { cwd: progetto, cartella: fuori, ramo: 'ap/ap1/c-9' })
    expect(readFileSync(join(fuori, 'x.txt'), 'utf8')).toBe('resta\n')
  })
})

describe('le note del programma non fermano l’unione (0.88.5)', () => {
  const ga = comeAsincrono(git)

  it('solo `.sierradeck/` cambiato: si salva con un commit e l’unione di prova parte', async () => {
    mkdirSync(join(progetto, '.sierradeck', 'quaderno'), { recursive: true })
    writeFileSync(join(progetto, '.sierradeck', 'quaderno', 'nota.md'), 'prima\n')
    esegui(['add', '-A'], progetto)
    esegui(['commit', '-q', '-m', 'nota'], progetto)
    const wt = creaWorktree(git, { cwd: progetto, autopilota: 'ap1', chat: 'c-1', base: 'main' })
    if (!wt.ok) throw new Error('worktree non creato')
    writeFileSync(join(wt.cartella, 'b.txt'), 'dalla chat\n')
    salvaLavoro(git, wt.cartella, 'pezzo')
    writeFileSync(join(progetto, '.sierradeck', 'quaderno', 'nota.md'), 'prima\nscritta dal programma\n')
    expect(await iniziaProvaAsincrono(ga, { cwd: progetto, ramo: wt.ramo, base: 'main' })).toEqual({ ok: true })
    expect(esegui(['log', '-1', '--format=%s', 'HEAD'], progetto)).toBe('quaderno: le note del programma, prima di unire')
    expect(await chiudiProvaAsincrono(ga, { cwd: progetto, tieni: true })).toBe(true)
    expect(readFileSync(join(progetto, '.sierradeck', 'quaderno', 'nota.md'), 'utf8')).toBe('prima\nscritta dal programma\n')
  })

  // 11/11: prima «un file del codice a metà ferma ancora l'unione», qualunque file fosse.
  it('un file del codice a metà ferma l’unione solo se il ramo lo tocca', async () => {
    const tracciato = esegui(['ls-files'], progetto).split(/\r?\n/)[0] as string
    const wt = creaWorktree(git, { cwd: progetto, autopilota: 'ap1', chat: 'c-1', base: 'main' })
    if (!wt.ok) throw new Error('worktree non creato')
    writeFileSync(join(wt.cartella, 'b.txt'), 'dalla chat\n')
    salvaLavoro(git, wt.cartella, 'pezzo')
    writeFileSync(join(progetto, tracciato), 'a metà\n')
    // Il ramo porta solo b.txt: il file a metà non c'entra, l'unione parte.
    expect(await iniziaProvaAsincrono(ga, { cwd: progetto, ramo: wt.ramo, base: 'main' })).toEqual({ ok: true })
    expect(await chiudiProvaAsincrono(ga, { cwd: progetto, tieni: false })).toBe(false)
    expect(readFileSync(join(progetto, tracciato), 'utf8')).toBe('a metà\n')
    // Adesso il ramo tocca proprio quel file: l'unione si ferma, e dice quale.
    writeFileSync(join(wt.cartella, tracciato), 'uno\ndue\n')
    salvaLavoro(git, wt.cartella, 'tocca il file')
    expect(await iniziaProvaAsincrono(ga, { cwd: progetto, ramo: wt.ramo, base: 'main' })).toEqual({ ok: false, motivo: 'la cartella di lavoro ha modifiche non salvate', file: [tracciato] })
    expect(readFileSync(join(progetto, tracciato), 'utf8')).toBe('a metà\n')
  })
})

describe('i file a metà salvati col consenso (11/11)', () => {
  const ga = comeAsincrono(git)

  it('`salvaFile` fa un commit dei soli file detti: gli altri file a metà restano come sono', async () => {
    writeFileSync(join(progetto, 'c.txt'), 'tre\n')
    esegui(['add', '-A'], progetto)
    esegui(['commit', '-q', '-m', 'un altro file'], progetto)
    writeFileSync(join(progetto, 'a.txt'), 'da salvare\n')
    writeFileSync(join(progetto, 'c.txt'), 'questo no\n')
    expect(await salvaFileAsincrono(ga, { cwd: progetto, file: ['a.txt'], messaggio: 'lavoro in corso, salvato col consenso' })).toBe(true)
    expect(esegui(['log', '-1', '--format=%s', 'HEAD'], progetto)).toBe('lavoro in corso, salvato col consenso')
    expect(esegui(['show', '--stat', '--format=', 'HEAD'], progetto)).toContain('a.txt')
    expect(esegui(['show', '--stat', '--format=', 'HEAD'], progetto)).not.toContain('c.txt')
    expect(esegui(['show', 'HEAD:a.txt'], progetto)).toBe('da salvare')
    expect(readFileSync(join(progetto, 'c.txt'), 'utf8')).toBe('questo no\n')
    expect(git(['status', '--porcelain', '--untracked-files=no'], progetto).uscita).toMatch(/^M c\.txt$/)
  })

  it('`salvaFile` non accetta percorsi fuori dalla cartella, opzioni travestite da file, né un elenco vuoto', async () => {
    writeFileSync(join(progetto, 'a.txt'), 'da salvare\n')
    const prima = esegui(['rev-parse', 'HEAD'], progetto)
    for (const file of [[], ['../fuori.txt'], ['a.txt', '--all'], ['-A'], ['C:/altro/a.txt'], ['/etc/passwd'], ['']]) {
      expect(await salvaFileAsincrono(ga, { cwd: progetto, file, messaggio: 'no' })).toBe(false)
    }
    expect(esegui(['rev-parse', 'HEAD'], progetto)).toBe(prima)
    expect(readFileSync(join(progetto, 'a.txt'), 'utf8')).toBe('da salvare\n')
    // Un file senza modifiche: niente commit, e non è un errore che rompe qualcosa.
    expect(await salvaFileAsincrono(ga, { cwd: progetto, file: ['a.txt'], messaggio: 'sì' })).toBe(true)
    expect(await salvaFileAsincrono(ga, { cwd: progetto, file: ['a.txt'], messaggio: 'di nuovo' })).toBe(false)
  })
})

describe('note del quaderno: solo aggiunte (10/11)', () => {
  const ga = comeAsincrono(git)

  function conRamoPronto(): string {
    mkdirSync(join(progetto, '.sierradeck', 'quaderno'), { recursive: true })
    writeFileSync(join(progetto, '.sierradeck', 'quaderno', 'lezioni.md'), '- una\n- due\n')
    esegui(['add', '-A'], progetto)
    esegui(['commit', '-q', '-m', 'lezioni'], progetto)
    const wt = creaWorktree(git, { cwd: progetto, autopilota: 'ap1', chat: 'c-1', base: 'main' })
    if (!wt.ok) throw new Error('worktree non creato')
    writeFileSync(join(wt.cartella, 'b.txt'), 'dalla chat\n')
    salvaLavoro(git, wt.cartella, 'pezzo')
    return wt.ramo
  }

  it('righe aggiunte in coda a lezioni.md: si salvano e l’unione parte', async () => {
    const ramo = conRamoPronto()
    writeFileSync(join(progetto, '.sierradeck', 'quaderno', 'lezioni.md'), '- una\n- due\n- tre\n')
    expect(await iniziaProvaAsincrono(ga, { cwd: progetto, ramo, base: 'main' })).toEqual({ ok: true })
    expect(esegui(['log', '-1', '--format=%s', 'HEAD'], progetto)).toBe('quaderno: le note del programma, prima di unire')
  })

  it('un avviso di git sugli a capo, mescolato allo status, non è un file sporco', async () => {
    const ramo = conRamoPronto()
    writeFileSync(join(progetto, '.sierradeck', 'quaderno', 'lezioni.md'), '- una\n- due\n- tre\n')
    const conAvviso: typeof ga = async (args, cwd) => {
      const r = await ga(args, cwd)
      return args[0] === 'status' ? { ...r, uscita: `warning: in the working copy of '.sierradeck/quaderno/lezioni.md', CRLF will be replaced by LF\n${r.uscita}`.trim() } : r
    }
    expect(await iniziaProvaAsincrono(conAvviso, { cwd: progetto, ramo, base: 'main' })).toEqual({ ok: true })
  })

  it('decisioni.md con una riga cambiata («(×2)»): si salva e l’unione parte', async () => {
    mkdirSync(join(progetto, '.sierradeck', 'quaderno'), { recursive: true })
    writeFileSync(join(progetto, '.sierradeck', 'quaderno', 'decisioni.md'), '- scelta uno\n- scelta due\n')
    esegui(['add', '-A'], progetto)
    esegui(['commit', '-q', '-m', 'decisioni'], progetto)
    const wt = creaWorktree(git, { cwd: progetto, autopilota: 'ap1', chat: 'c-1', base: 'main' })
    if (!wt.ok) throw new Error('worktree non creato')
    writeFileSync(join(wt.cartella, 'b.txt'), 'dalla chat\n')
    salvaLavoro(git, wt.cartella, 'pezzo')
    writeFileSync(join(progetto, '.sierradeck', 'quaderno', 'decisioni.md'), '- scelta uno (×2)\n- scelta due\n')
    expect(await iniziaProvaAsincrono(ga, { cwd: progetto, ramo: wt.ramo, base: 'main' })).toEqual({ ok: true })
    expect(esegui(['log', '-1', '--format=%s', 'HEAD'], progetto)).toBe('quaderno: le note del programma, prima di unire')
    expect(git(['status', '--porcelain', '--untracked-files=no'], progetto).uscita).not.toContain('decisioni.md')
  })

  // 11/11: prima «un file fuori da .sierradeck ferma ancora l'unione, insieme al quaderno cambiato».
  // Adesso il quaderno si salva comunque (solo lui), e il file del codice ferma solo se il ramo lo tocca.
  it('un file fuori da `.sierradeck/` insieme al quaderno cambiato: il quaderno si salva, il file ferma l’unione solo se il ramo lo tocca, e si dice quale', async () => {
    const ramo = conRamoPronto()
    const lezioni = join(progetto, '.sierradeck', 'quaderno', 'lezioni.md')
    writeFileSync(lezioni, '- una\n- DUE cambiata\n')
    const tracciato = esegui(['ls-files'], progetto).split(/\r?\n/).find((f) => !f.startsWith('.sierradeck/')) as string
    writeFileSync(join(progetto, tracciato), 'a metà\n')
    // Il ramo non tocca il file a metà: il quaderno va in un commit suo, l'unione parte, il file resta com'è.
    expect(await iniziaProvaAsincrono(ga, { cwd: progetto, ramo, base: 'main' })).toEqual({ ok: true })
    expect(esegui(['log', '-1', '--format=%s', 'HEAD'], progetto)).toBe('quaderno: le note del programma, prima di unire')
    expect(esegui(['show', '--stat', '--format=', 'HEAD'], progetto)).not.toContain(tracciato)
    expect(readFileSync(join(progetto, tracciato), 'utf8')).toBe('a metà\n')
    expect(await chiudiProvaAsincrono(ga, { cwd: progetto, tieni: false })).toBe(false)
    expect(readFileSync(join(progetto, tracciato), 'utf8')).toBe('a metà\n')
    expect(readFileSync(lezioni, 'utf8')).toBe('- una\n- DUE cambiata\n')
    // Un ramo che tocca proprio quel file: si ferma, dice quale, e non lo tocca.
    const wt = creaWorktree(git, { cwd: progetto, autopilota: 'ap1', chat: 'c-2', base: 'main' })
    if (!wt.ok) throw new Error('worktree non creato')
    writeFileSync(join(wt.cartella, tracciato), 'uno\ndal secondo ramo\n')
    salvaLavoro(git, wt.cartella, 'tocca il file')
    const prima = esegui(['rev-parse', 'HEAD'], progetto)
    const r = await iniziaProvaAsincrono(ga, { cwd: progetto, ramo: wt.ramo, base: 'main' })
    expect(r).toEqual({ ok: false, motivo: 'la cartella di lavoro ha modifiche non salvate', file: [tracciato] })
    expect(esegui(['rev-parse', 'HEAD'], progetto)).toBe(prima)
    expect(readFileSync(join(progetto, tracciato), 'utf8')).toBe('a metà\n')
  })
})

describe('elencoFile: il messaggio d’attesa dice quali file tengono ferma la fila', () => {
  it('elenca i primi cinque e conta gli altri', () => {
    expect(elencoFile([])).toBe('')
    expect(elencoFile(['a.ts', 'b.ts'])).toBe(': a.ts, b.ts')
    expect(elencoFile(['1', '2', '3', '4', '5', '6', '7'])).toBe(': 1, 2, 3, 4, 5 (+2)')
  })
})

describe('soloAggiunteNumstat', () => {
  it('solo conteggi con zero righe tolte', () => {
    expect(soloAggiunteNumstat('2\t0\t.sierradeck/quaderno/lezioni.md\n')).toBe(true)
    expect(soloAggiunteNumstat('2\t1\t.sierradeck/quaderno/lezioni.md\n')).toBe(false)
    expect(soloAggiunteNumstat('-\t-\t.sierradeck/immagine.png\n')).toBe(false)
  })
})