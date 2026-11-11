import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { comeAsincrono, prendiDalRemotoAsincrono, riallineaAsincrono, type GitAsincrono } from '../../src/autopilot-host/worktree'
import { creaServer, type ServerAutopiloti } from '../../src/autopilot-host/server'
import { apriArchivio } from '../../src/autopilot-host/archivio'
import { creaRegistroDomande } from '../../src/autopilot-host/domande'
import { apriMemoria } from '../../src/autopilot-host/memoria'
import { apriCode } from '../../src/autopilot-host/coda-store'
import { apriOrchestratori, type ArchivioOrchestratori } from '../../src/autopilot-host/orchestratore-store'
import type { AvviaProcesso, ProcessoClaude } from '../../src/autopilot-host/orchestratore'
import { nuovoAutopilota } from '@shared/autopilota'
import type { CompitoPiano } from '@shared/piano-orchestratore'
import { attendi } from '../setup/attendi'
import { orologioDa } from '../setup/orologio'
import { esegui, git, repositoryDiPartenza } from './worktree-comune'

/**
 * 11/11: il ramo principale di qui e quello del remoto, con **due repository veri** (il remoto
 * è un repository nudo in una cartella temporanea, «qui» e «altro» sono due suoi cloni).
 * Le release 0.99.2 e 0.99.3 sono uscite da un ramo mentre il principale di qui restava
 * undici commit indietro: il passo che li rimette in pari nel programma non c'era.
 */
const repo = repositoryDiPartenza()
const ga = comeAsincrono(git)

let remoto = ''
let qui = ''
let altro = ''

function clona(da: string, nome: string): string {
  const dove = join(mkdtempSync(join(tmpdir(), 'sd-rem-')), nome)
  esegui(['clone', '-q', da, dove], tmpdir())
  esegui(['config', 'user.name', 'Prova'], dove)
  esegui(['config', 'user.email', 'prova@example.com'], dove)
  esegui(['config', 'core.autocrlf', 'false'], dove)
  return dove
}

beforeEach(() => {
  remoto = join(mkdtempSync(join(tmpdir(), 'sd-rem-')), 'remoto.git')
  esegui(['clone', '-q', '--bare', repo.modello(), remoto], tmpdir())
  qui = clona(remoto, 'qui')
  altro = clona(remoto, 'altro')
})

const scrivi = (dove: string, file: string, testo: string, messaggio: string): void => {
  mkdirSync(join(dove, file, '..'), { recursive: true })
  writeFileSync(join(dove, file), testo)
  esegui(['add', '-A'], dove)
  esegui(['commit', '-q', '-m', messaggio], dove)
}
/** Un lavoro pubblicato da un'altra parte: un commit nel clone «altro», mandato sul remoto. */
const pubblica = (file: string, testo: string, messaggio: string): void => {
  scrivi(altro, file, testo, messaggio)
  esegui(['push', '-q', 'origin', 'main'], altro)
}
const testa = (dove: string, cosa = 'HEAD'): string => esegui(['rev-parse', cosa], dove)
const pulita = (dove: string): boolean => git(['status', '--porcelain', '--untracked-files=no'], dove).uscita === ''
const unioneAperta = (dove: string): boolean => existsSync(join(dove, '.git', 'MERGE_HEAD'))

describe('chiedere al remoto non è mai un errore, e non tiene fermo nessuno', () => {
  it('senza remoto: non c’è niente da prendere', async () => {
    expect(await prendiDalRemotoAsincrono(ga, { cwd: repo.copia(), base: 'main' })).toEqual({ esito: 'senza-remoto' })
  })

  it('remoto che non si raggiunge (qui: una cartella che non c’è): «non raggiunto» col perché, nessuna eccezione', async () => {
    esegui(['remote', 'set-url', 'origin', join(tmpdir(), 'sd-remoto-che-non-esiste.git')], qui)
    const e = await prendiDalRemotoAsincrono(ga, { cwd: qui, base: 'main' })
    expect(e.esito).toBe('non-raggiunto')
    // Niente è cambiato, e riallineare dopo non fa niente.
    expect(await riallineaAsincrono(ga, { cwd: qui, base: 'main' })).toEqual({ esito: 'pari', avanti: 0 })
  })

  it('remoto che non risponde: dopo il tempo massimo si va avanti senza', async () => {
    const lento: GitAsincrono = (args, cwd) => (args.includes('fetch') ? new Promise(() => { /* non risponde mai */ }) : ga(args, cwd))
    const da = Date.now()
    expect(await prendiDalRemotoAsincrono(lento, { cwd: qui, base: 'main' }, { tempoMs: 60 })).toMatchObject({ esito: 'non-raggiunto' })
    expect(Date.now() - da).toBeLessThan(5000)
  })

  it('un ramo che sul remoto non c’è: come senza remoto', async () => {
    esegui(['checkout', '-q', '-b', 'solo-qui'], qui)
    expect(await prendiDalRemotoAsincrono(ga, { cwd: qui, base: 'solo-qui' })).toEqual({ esito: 'senza-remoto' })
  })
})

describe('il ramo principale di qui raggiunge quello del remoto, senza mai forzare', () => {
  const prendi = async (): Promise<void> => { expect(await prendiDalRemotoAsincrono(ga, { cwd: qui, base: 'main' })).toEqual({ esito: 'preso' }) }

  it('niente da prendere: pari; e con commit solo di qui resta com’è', async () => {
    await prendi()
    expect(await riallineaAsincrono(ga, { cwd: qui, base: 'main' })).toEqual({ esito: 'pari', avanti: 0 })
    scrivi(qui, 'n.txt', 'nota\n', 'una nota di qui')
    await prendi()
    expect(await riallineaAsincrono(ga, { cwd: qui, base: 'main' })).toEqual({ esito: 'pari', avanti: 1 })
  })

  it('qui si è solo indietro: avanti veloce', async () => {
    pubblica('b.txt', 'uno\n', 'release 1')
    pubblica('c.txt', 'due\n', 'release 2')
    await prendi()
    expect(await riallineaAsincrono(ga, { cwd: qui, base: 'main' })).toEqual({ esito: 'allineato', presi: 2, come: 'avanti-veloce' })
    expect(testa(qui)).toBe(testa(qui, 'refs/remotes/origin/main'))
    expect(readFileSync(join(qui, 'c.txt'), 'utf8')).toBe('due\n')
    expect(pulita(qui)).toBe(true)
  })

  it('tutti e due avanti (qui le note del quaderno, là le release): un’unione, e resta tutto', async () => {
    scrivi(qui, '.sierradeck/quaderno/lezioni.md', '- una lezione\n', 'quaderno: le note del programma, prima di unire')
    pubblica('b.txt', 'uno\n', 'release 1')
    await prendi()
    expect(await riallineaAsincrono(ga, { cwd: qui, base: 'main' })).toEqual({ esito: 'allineato', presi: 1, come: 'unione' })
    expect(readFileSync(join(qui, 'b.txt'), 'utf8')).toBe('uno\n')
    expect(readFileSync(join(qui, '.sierradeck/quaderno/lezioni.md'), 'utf8')).toBe('- una lezione\n')
    expect(git(['merge-base', '--is-ancestor', 'refs/remotes/origin/main', 'main'], qui).codice).toBe(0)
    expect(esegui(['log', '-1', '--format=%s'], qui)).toContain('origin/main')
    expect(unioneAperta(qui)).toBe(false)
    expect(existsSync(join(qui, '.git', 'sierradeck-prova.json'))).toBe(false)
  })

  it('conflitto: unione annullata, si dice quali file, e la cartella resta com’era', async () => {
    scrivi(qui, 'a.txt', 'di qui\n', 'una modifica di qui')
    pubblica('a.txt', 'di là\n', 'la stessa riga, pubblicata')
    const prima = testa(qui)
    await prendi()
    expect(await riallineaAsincrono(ga, { cwd: qui, base: 'main' })).toEqual({ esito: 'conflitto', file: ['a.txt'], presi: 1 })
    expect(testa(qui)).toBe(prima)
    expect(readFileSync(join(qui, 'a.txt'), 'utf8')).toBe('di qui\n')
    expect(unioneAperta(qui)).toBe(false)
    expect(pulita(qui)).toBe(true)
    expect(existsSync(join(qui, '.git', 'sierradeck-prova.json'))).toBe(false)
  })

  it('un file modificato e non salvato che l’unione sovrascriverebbe: non si fa niente, il file resta', async () => {
    pubblica('a.txt', 'di là\n', 'pubblicato')
    writeFileSync(join(qui, 'a.txt'), 'a metà, non salvato\n')
    const prima = testa(qui)
    await prendi()
    expect(await riallineaAsincrono(ga, { cwd: qui, base: 'main' })).toMatchObject({ esito: 'occupata' })
    expect(testa(qui)).toBe(prima)
    expect(readFileSync(join(qui, 'a.txt'), 'utf8')).toBe('a metà, non salvato\n')
    // Lo stesso se i due rami sono andati avanti tutti e due.
    esegui(['stash', '-q'], qui)
    scrivi(qui, 'n.txt', 'nota\n', 'una nota di qui')
    esegui(['stash', 'pop', '-q'], qui)
    const dopo = testa(qui)
    expect(await riallineaAsincrono(ga, { cwd: qui, base: 'main' })).toMatchObject({ esito: 'occupata' })
    expect(testa(qui)).toBe(dopo)
    expect(readFileSync(join(qui, 'a.txt'), 'utf8')).toBe('a metà, non salvato\n')
    expect(unioneAperta(qui)).toBe(false)
  })

  it('un file modificato e non salvato che non c’entra: ci si riallinea, e la modifica resta dov’è', async () => {
    pubblica('b.txt', 'uno\n', 'pubblicato')
    writeFileSync(join(qui, 'a.txt'), 'a metà, non salvato\n')
    await prendi()
    expect(await riallineaAsincrono(ga, { cwd: qui, base: 'main' })).toEqual({ esito: 'allineato', presi: 1, come: 'avanti-veloce' })
    expect(readFileSync(join(qui, 'a.txt'), 'utf8')).toBe('a metà, non salvato\n')
    expect(readFileSync(join(qui, 'b.txt'), 'utf8')).toBe('uno\n')
  })

  it('la cartella è su un altro ramo, o ha un’unione aperta non del programma: non si tocca', async () => {
    pubblica('b.txt', 'uno\n', 'pubblicato')
    await prendi()
    esegui(['checkout', '-q', '-b', 'lavoro-a-mano'], qui)
    expect(await riallineaAsincrono(ga, { cwd: qui, base: 'main' })).toMatchObject({ esito: 'occupata' })
    esegui(['checkout', '-q', 'main'], qui)
    // Un'unione aperta a mano (senza il segno del programma).
    esegui(['checkout', '-q', '-b', 'altro-ramo'], qui)
    scrivi(qui, 'z.txt', 'z\n', 'su un altro ramo')
    esegui(['checkout', '-q', 'main'], qui)
    esegui(['merge', '-q', '--no-ff', '--no-commit', 'altro-ramo'], qui)
    expect(unioneAperta(qui)).toBe(true)
    expect(await riallineaAsincrono(ga, { cwd: qui, base: 'main' })).toEqual({ esito: 'occupata', perche: 'nella cartella di lavoro c’è un’unione aperta' })
    expect(unioneAperta(qui)).toBe(true)
  })
})

// ---------------------------------------------------------------- nel servizio, con git vero

type Finto = ProcessoClaude & { args: string[]; scritte: string[]; emetti: (o: unknown) => void }
let server: ServerAutopiloti | undefined
let orch: ArchivioOrchestratori
let processi: Finto[] = []
const WS = 'Lavoro'

const avvia: AvviaProcesso = ({ args }) => {
  const righe: ((r: string) => void)[] = []
  const p: Finto = { args, scritte: [], scrivi: (r) => { p.scritte.push(r) }, uccidi: () => {}, suRiga: (f) => { righe.push(f) }, suUscita: () => {}, emetti: (o) => { for (const f of righe) f(JSON.stringify(o)) } }
  processi.push(p)
  return p
}

async function avviaServizio(): Promise<void> {
  const orologio = orologioDa('2026-11-11T08:00:00.000Z')
  const dati = mkdtempSync(join(tmpdir(), 'sd-rem-dati-'))
  const archivio = apriArchivio(mkdtempSync(join(tmpdir(), 'sd-rem-ap-')))
  archivio.scrivi({
    ...nuovoAutopilota({ id: 'ap-vecchio', nome: 'Prima', obiettivo: 'la release', cwd: qui, iniziatoIl: '2026-11-11T06:00:00.000Z', workspace: WS }),
    stato: 'lavoro',
    chats: [{ id: 'c-1', compito: 'la release', stato: 'lavoro', cicli: 1, sessionId: 's-1' }]
  })
  orch = apriOrchestratori(join(dati, 'orch'))
  processi = []
  const s = creaServer({
    archivio,
    memoria: apriMemoria(mkdtempSync(join(tmpdir(), 'sd-rem-mem-'))),
    versione: '0.99.3',
    esegui: () => Promise.resolve({ codice: 0, uscita: 'ok' }),
    avviaLavoro: () => Promise.resolve(),
    avvisa: () => Promise.resolve(),
    domande: creaRegistroDomande({ adesso: orologio.ms }),
    ultimoDetto: () => undefined,
    scadenzaDomandaMs: 5000,
    adesso: orologio.iso,
    coda: apriCode(join(dati, 'orch')),
    orchestratori: orch,
    avviaProcesso: avvia,
    porta: 47995,
    git,
    gitAsincrono: ga,
    unioneRiprovaMs: 10,
    raccoltaEventiMs: 20
  })
  server = s
  await new Promise<void>((ris) => s.listen(0, '127.0.0.1', () => ris()))
  expect(s.migraVecchi()).toBe(1)
  await attendi(() => processi.length > 0, { cosa: 'il processo dell’autopilota' })
  processi[0]!.emetti({ type: 'result', result: 'Pronto.', total_cost_usd: 0.001, session_id: 'sess-1', usage: { input_tokens: 100 } })
}

afterEach(() => { server?.close(); server = undefined; vi.restoreAllMocks() })

const compito = (id: string, piu: Partial<CompitoPiano> = {}): CompitoPiano => ({ id, richiesta: 'r-1', titolo: `lavoro ${id}`, criterio: `il lavoro ${id} c’è`, dopo: [], peso: 1, stato: 'da-fare', creato: '2026-11-11T08:00:00.000Z', ...piu })
const k = (id: string): CompitoPiano | undefined => orch.piano(WS).compiti.find((c) => c.id === id)

describe('nel servizio: una release uscita da un ramo non lascia indietro il principale (la storia della 0.99.2)', () => {
  it('il principale si riallinea da solo e i compiti il cui lavoro è già dentro si chiudono, senza una chat a mano', async () => {
    const errori = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
    // Lo specialista di k-1 ha scritto sul suo ramo; la release è uscita da un altro ramo che lo contiene, col push sul remoto.
    esegui(['checkout', '-q', '-b', 'worktree-agent-a1'], qui)
    scrivi(qui, 'b.txt', 'la correzione\n', 'k-1: la correzione')
    esegui(['checkout', '-q', '-b', 'worktree-agent-rel', 'main'], qui)
    esegui(['merge', '-q', '--no-ff', '--no-edit', 'worktree-agent-a1'], qui)
    scrivi(qui, 'versione.txt', '0.1.1\n', '0.1.1: la release')
    esegui(['push', '-q', 'origin', 'worktree-agent-rel:main'], qui)
    esegui(['checkout', '-q', 'main'], qui)
    // E qui, intanto, il programma ha salvato una nota del quaderno: i due rami sono andati avanti tutti e due.
    scrivi(qui, '.sierradeck/quaderno/lezioni.md', '- una lezione\n', 'quaderno: le note del programma, prima di unire')
    expect(esegui(['rev-list', '--count', 'main..worktree-agent-rel'], qui)).toBe('3')

    await avviaServizio()
    orch.scriviPiano(WS, { versione: 1, compiti: [
      // Come k-133: riportato «da fare» anche se il suo lavoro è uscito con la release di un altro compito.
      compito('k-1', { rami: ['worktree-agent-a1'], esito: 'sviluppatore non è riuscito' }),
      // La release: ha finito, la sua unione era stata rifiutata e non è più in fila.
      compito('k-2', { stato: 'in-revisione', ramo: 'worktree-agent-rel', rami: ['worktree-agent-rel'], esito: 'unione non fatta: l’unione di prova non si è potuta fare' }),
      // Un compito con un ramo che ha ancora lavoro fuori: non si chiude da solo.
      compito('k-3', { rami: ['worktree-agent-a9'], esito: 'sviluppatore è stato fermato' })
    ] })
    esegui(['branch', 'worktree-agent-a9', 'main'], qui)
    esegui(['checkout', '-q', 'worktree-agent-a9'], qui)
    scrivi(qui, 'x.txt', 'a metà\n', 'k-3: a metà')
    esegui(['checkout', '-q', 'main'], qui)

    server!.controllaChatFerme()
    await attendi(() => git(['merge-base', '--is-ancestor', 'refs/remotes/origin/main', 'main'], qui).codice === 0, { cosa: 'il principale in pari col remoto', timeout: 30_000 })
    await attendi(() => k('k-1')?.stato === 'unito' && k('k-2')?.stato === 'unito', { cosa: 'k-1 e k-2 chiusi dal programma', timeout: 30_000 })
    expect(k('k-1')).toMatchObject({ criterioVerde: true })
    expect(k('k-1')!.esito).toBeDefined()
    expect(k('k-3')!.stato).toBe('da-fare')
    expect(readFileSync(join(qui, 'versione.txt'), 'utf8')).toBe('0.1.1\n')
    expect(readFileSync(join(qui, '.sierradeck/quaderno/lezioni.md'), 'utf8')).toBe('- una lezione\n')
    expect(errori.mock.calls.map((c) => String(c[0])).join('\n')).not.toMatch(/riallin|remoto/i)
  }, 90_000)

  it('conflitto col remoto: niente è toccato e l’autopilota lo sa, con i file', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
    scrivi(qui, 'a.txt', 'di qui\n', 'una modifica di qui')
    pubblica('a.txt', 'di là\n', 'la stessa riga, pubblicata da un altro PC')
    const prima = testa(qui)
    await avviaServizio()
    orch.scriviPiano(WS, { versione: 1, compiti: [compito('k-1')] })
    server!.controllaChatFerme()
    await attendi(() => processi[0]!.scritte.join('\n').includes('conflitto su a.txt'), { cosa: 'l’evento del conflitto all’autopilota', timeout: 30_000 })
    expect(processi[0]!.scritte.join('\n')).toContain('Non ho toccato niente')
    expect(testa(qui)).toBe(prima)
    expect(unioneAperta(qui)).toBe(false)
    expect(pulita(qui)).toBe(true)
    // Al giro dopo lo stesso conflitto non si ripete all'autopilota.
    const quante = (): number => processi[0]!.scritte.join('\n').split('conflitto su a.txt').length - 1
    const dette = quante()
    server!.controllaChatFerme()
    await new Promise((ris) => setTimeout(ris, 300))
    expect(quante()).toBe(dette)
  }, 90_000)

  it('un ramo di specialista con lavoro mai unito: il programma non lo tocca e lo dice all’autopilota, una volta per ramo', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
    // Il pezzo di k-165 rimasto fuori; un ramo il cui lavoro è entrato per un'altra strada; uno che serve a un compito aperto.
    esegui(['checkout', '-q', '-b', 'worktree-agent-a5'], qui)
    scrivi(qui, 'fuori.txt', 'mai unito\n', 'k-165: copie con file in uso, si riprova senza errore')
    esegui(['checkout', '-q', '-b', 'worktree-agent-a6', 'main'], qui)
    scrivi(qui, 'doppio.txt', 'lo stesso\n', 'k-7: lo stesso lavoro')
    esegui(['checkout', '-q', '-b', 'worktree-agent-a7', 'main'], qui)
    scrivi(qui, 'aperto.txt', 'a metà\n', 'k-9: a metà')
    esegui(['checkout', '-q', 'main'], qui)
    scrivi(qui, 'doppio.txt', 'lo stesso\n', 'lo stesso lavoro, uscito con una release')
    esegui(['push', '-q', 'origin', 'main'], qui)
    await avviaServizio()
    orch.scriviPiano(WS, { versione: 1, compiti: [
      compito('k-165', { stato: 'unito', criterioVerde: true }),
      compito('k-9', { rami: ['worktree-agent-a7'], esito: 'sviluppatore è stato fermato' })
    ] })
    expect([...server!.ramiCitati(qui)]).toEqual(['worktree-agent-a7'])
    expect([...server!.copieVive(qui)]).toEqual([])
    server!.controllaChatFerme()
    await attendi(() => processi[0]!.scritte.join('\n').includes('worktree-agent-a5'), { cosa: 'l’evento all’autopilota', timeout: 30_000 })
    const detto = processi[0]!.scritte.join('\n')
    expect(detto).toContain('lavoro che non è mai entrato nel principale')
    expect(detto).toContain('k-165: copie con file in uso')
    expect(detto).toContain('è del compito k-165, che risulta unito: questo pezzo è rimasto fuori')
    expect(detto).not.toContain('worktree-agent-a6')
    expect(detto).not.toContain('worktree-agent-a7')
    // Nessun ramo è stato toccato, e i due guardati non si riguardano (né si ridicono) la prossima volta.
    const rami = esegui(['for-each-ref', '--format=%(refname:short)', 'refs/heads/'], qui).split(/\r?\n/).sort()
    expect(rami).toEqual(['main', 'worktree-agent-a5', 'worktree-agent-a6', 'worktree-agent-a7'])
    const guardati = (orch.impostazioni(WS).ramiSegnalati ?? []).map((r) => r.split('@')[0]).sort()
    expect(guardati).toEqual(['worktree-agent-a5', 'worktree-agent-a6'])
  }, 90_000)

  it('remoto che non si raggiunge: una riga nel registro (non un errore), e le unioni vanno avanti lo stesso', async () => {
    const errori = vi.spyOn(console, 'error').mockImplementation(() => {})
    const dette: string[] = []
    vi.spyOn(console, 'info').mockImplementation((...a: unknown[]) => { dette.push(String(a[0])) })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
    esegui(['remote', 'set-url', 'origin', join(tmpdir(), 'sd-remoto-che-non-esiste.git')], qui)
    esegui(['checkout', '-q', '-b', 'worktree-agent-a1'], qui)
    scrivi(qui, 'b.txt', 'la correzione\n', 'k-1: la correzione')
    esegui(['checkout', '-q', 'main'], qui)
    await avviaServizio()
    orch.scriviPiano(WS, { versione: 1, compiti: [compito('k-1', { stato: 'in-revisione', ramo: 'worktree-agent-a1', rami: ['worktree-agent-a1'] })] })
    server!.controllaChatFerme()
    await attendi(() => dette.some((r) => r.includes('remoto non raggiunto')), { cosa: 'la riga nel registro', timeout: 30_000 })
    server!.riprendiLavori({ servizioAppenaPartito: true })
    await attendi(() => k('k-1')?.stato === 'unito', { cosa: 'k-1 unito lo stesso', timeout: 60_000 })
    expect(git(['merge-base', '--is-ancestor', 'worktree-agent-a1', 'main'], qui).codice).toBe(0)
    expect(errori.mock.calls.map((c) => String(c[0])).join('\n')).not.toMatch(/riallin|remoto/i)
  }, 120_000)
})
