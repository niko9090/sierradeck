import { describe, it, expect, afterEach, vi } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { AGENTI_ORCHESTRATORE, RUOLI_AGENTI, agentiSenzaGit, fileAgenti, type DefinizioneAgente } from '../../src/autopilot-host/agenti-orchestratore'
import { giudicaGuardiaOrchestratore } from '../../src/autopilot-host/guardia-orchestratore'
import { giudicaRuolo } from '../../src/autopilot-host/divieti'
import { ePesante } from '../../src/autopilot-host/criteri-veloci'
import { ePesantePerLaChat } from '../../src/autopilot-host/guardia-pc'
import { creaServer, type ServerAutopiloti } from '../../src/autopilot-host/server'
import { apriArchivio, type Archivio } from '../../src/autopilot-host/archivio'
import { creaRegistroDomande } from '../../src/autopilot-host/domande'
import { apriMemoria } from '../../src/autopilot-host/memoria'
import { apriCode } from '../../src/autopilot-host/coda-store'
import { apriOrchestratori, type ArchivioOrchestratori } from '../../src/autopilot-host/orchestratore-store'
import type { AvviaProcesso, ProcessoClaude } from '../../src/autopilot-host/orchestratore'
import type { Git } from '../../src/autopilot-host/worktree'
import { nuovoAutopilota } from '@shared/autopilota'
import type { Piano } from '@shared/piano-orchestratore'
import { attendi } from '../setup/attendi'
import { orologioDa } from '../setup/orologio'

/**
 * 11/11 (voce 7): lo specialista «rilascio». Pubblicare da una copia non si può
 * (la CLI vieta a chi è isolato ogni git verso la cartella principale): ogni
 * release finiva in giri di tentativi e di regole riscoperte. Il rilascio lavora
 * nella cartella principale, senza copia e senza strumenti di scrittura, con le
 * regole fisse nel prompt; la guardia gli lascia push, tag e `gh`, e gli vieta
 * ogni git che cambia la storia. Il suo compito si chiude con il criterio.
 */

const RADICE = process.platform === 'win32' ? 'C:\\progetti\\prova' : '/progetti/prova'
const ctx = { radice: RADICE, specialistiSulPc: 0, tettoPc: 4, tipiSpecialisti: RUOLI_AGENTI }

/** Il payload dell'hook: l'orchestratore non porta `agent_id`, il rilascio sì, con il `cwd` nella cartella principale. */
const delPrincipale = (tool: string, input: Record<string, unknown>): Record<string, unknown> => ({
  session_id: 's', cwd: RADICE, permission_mode: 'acceptEdits', hook_event_name: 'PreToolUse', tool_name: tool, tool_input: input, tool_use_id: 'toolu_1'
})
const delRilascio = (tool: string, input: Record<string, unknown>): Record<string, unknown> => ({
  ...delPrincipale(tool, input), agent_id: 'a9f1', agent_type: 'rilascio'
})
const shell = (command: string, tool = 'Bash'): Record<string, unknown> => delRilascio(tool, { command })

describe('lo specialista «rilascio»: com’è fatto', () => {
  const r = AGENTI_ORCHESTRATORE.rilascio!

  it('è uno degli specialisti, senza copia e senza strumenti di scrittura', () => {
    expect(RUOLI_AGENTI).toContain('rilascio')
    expect(r.isolation).toBeUndefined()
    for (const t of ['Edit', 'Write', 'MultiEdit', 'NotebookEdit']) expect(r.tools).not.toContain(t)
    for (const t of ['Read', 'Grep', 'Glob', 'Bash', 'PowerShell']) expect(r.tools).toContain(t)
    // Gli altri restano ognuno nella sua copia.
    for (const [nome, a] of Object.entries(AGENTI_ORCHESTRATORE)) if (nome !== 'rilascio') expect(a.isolation, nome).toBe('worktree')
  })

  it('il prompt porta le regole fisse del rilascio', () => {
    const p = r.prompt
    expect(p).toContain('Lavori nella cartella principale del progetto: non hai una copia tua')
    expect(p).toContain('nessun altro stia già pubblicando')
    expect(p).toContain('il TAG viene PRIMA della release')
    expect(p).toContain('git ls-remote --tags origin <tag>')
    expect(p).toContain('Mai `--force`')
    expect(p).toContain('La release nasce in BOZZA')
    expect(p).toContain('mai da una copia di lavoro')
    expect(p).toContain('`npm run pubblica`')
    expect(p).toContain('`npm run allega-apk`')
    expect(p).toContain('mai uno di debug')
    expect(p).toContain('gh release view <tag> --json isDraft,assets')
    expect(p).toContain('MAI installare')
    expect(p).toContain('senza sottofondo e senza sleep')
    expect(p).toContain('RAPPORTO:')
  })

  it('non porta le regole della copia (non ne ha una), né dati privati', () => {
    const p = r.prompt
    expect(p).not.toContain('Lavori nella tua copia del progetto')
    expect(p).not.toContain('git merge --ff-only')
    expect(p).not.toContain('Regole dei comandi nella tua copia')
    // Nessun percorso personale, nessun indirizzo, nessun repository con il suo padrone.
    expect(p).not.toMatch(/[A-Za-z]:\\|\/Users\/|\/home\/|\b\d{1,3}(\.\d{1,3}){3}\b|github\.com\/|@[\w-]+\.\w+/u)
  })

  it('gli specialisti con la copia sanno che pubblicare non tocca a loro', () => {
    for (const [nome, a] of Object.entries(AGENTI_ORCHESTRATORE)) {
      if (nome === 'rilascio') continue
      expect(a.prompt, nome).toContain('Pubblicare (push del ramo principale, tag, release, file allegati) non è compito tuo')
      expect(a.prompt, nome).toContain('lo specialista «rilascio»')
    }
  })

  it('con un ramo principale diverso resta senza copia; senza git non c’è (niente da pubblicare)', () => {
    const leggi = (t: string): Record<string, DefinizioneAgente> => JSON.parse(t) as Record<string, DefinizioneAgente>
    expect(leggi(fileAgenti(true)).rilascio!.isolation).toBeUndefined()
    const sviluppo = leggi(fileAgenti(true, 'sviluppo'))
    expect(sviluppo.rilascio!.isolation).toBeUndefined()
    expect(sviluppo.rilascio!.prompt).toBe(r.prompt)
    expect(Object.keys(agentiSenzaGit())).not.toContain('rilascio')
    expect(Object.keys(leggi(fileAgenti(false)))).not.toContain('rilascio')
    expect(Object.keys(agentiSenzaGit()).sort()).toEqual(RUOLI_AGENTI.filter((n) => n !== 'rilascio').sort())
  })
})

describe('la guardia con il rilascio nella cartella principale', () => {
  it('l’orchestratore lo può chiamare; un tipo qualunque senza copia resta vietato', () => {
    expect(giudicaGuardiaOrchestratore(delPrincipale('Agent', { subagent_type: 'rilascio', description: 'k-9: pubblica la 1.2.3' }), ctx).ok).toBe(true)
    expect(giudicaGuardiaOrchestratore(delPrincipale('Agent', { subagent_type: 'general-purpose' }), ctx).ok).toBe(false)
    // Conta come ogni specialista: a tetto pieno aspetta.
    expect(giudicaGuardiaOrchestratore(delPrincipale('Agent', { subagent_type: 'rilascio' }), { ...ctx, specialistiSulPc: 4 }).ok).toBe(false)
  })

  it('pubblicare passa: push, tag, gh e i comandi del progetto', () => {
    for (const c of [
      'git fetch origin',
      'git status --short',
      'git log origin/main --oneline -5',
      'git push origin main',
      'git tag v1.2.3',
      'git push origin v1.2.3',
      'git ls-remote --tags origin v1.2.3',
      'gh release list --limit 2',
      'gh release create v1.2.3 --draft --title "1.2.3" --notes-file note.md',
      'gh release upload v1.2.3 dist/app-android.json',
      'gh release view v1.2.3 --json isDraft,assets',
      'gh release edit v1.2.3 --draft=false --latest',
      'npm run pubblica',
      'export GH_TOKEN=$(gh auth token) && npm run pubblica',
      'npm run allega-apk'
    ]) expect(giudicaGuardiaOrchestratore(shell(c), ctx), c).toEqual({ ok: true })
    expect(giudicaGuardiaOrchestratore(shell('git push origin main', 'PowerShell'), ctx).ok).toBe(true)
  })

  it('cambiare la storia o i file della cartella principale no', () => {
    for (const c of [
      'git commit -am "versione"',
      'git add package.json',
      'git merge worktree-agent-x',
      'git reset --hard origin/main',
      'git checkout .',
      'git switch altro',
      'git pull',
      'git stash',
      'git rebase origin/main',
      'git clean -fd',
      'git fetch && git reset --hard origin/main',
      `git -C "${RADICE}" commit -m x`
    ]) {
      const g = giudicaGuardiaOrchestratore(shell(c), ctx)
      expect(g.ok, c).toBe(false)
      expect(!g.ok && g.motivo, c).toContain('nella cartella principale non si fa')
    }
    // Gli strumenti di scrittura non li ha; se li avesse, nella principale non scriverebbe lo stesso.
    expect(giudicaGuardiaOrchestratore(delRilascio('Write', { file_path: join(RADICE, 'package.json'), content: '{}' }), ctx).ok).toBe(false)
    expect(giudicaGuardiaOrchestratore(delRilascio('Edit', { file_path: 'package.json' }), ctx).ok).toBe(false)
  })

  it('niente sottofondo e niente attese lunghe a mano, come per tutti', () => {
    expect(giudicaGuardiaOrchestratore(delRilascio('Bash', { command: 'npm run pubblica', run_in_background: true }), ctx).ok).toBe(false)
    expect(giudicaGuardiaOrchestratore(shell('sleep 90'), ctx).ok).toBe(false)
  })

  it('installare resta vietato anche a lui', () => {
    expect(giudicaRuolo(shell('./dist/SierraDeck-Setup-1.2.3.exe'), undefined).ok).toBe(false)
    expect(giudicaRuolo(shell('Start-Process dist\\SierraDeck-Setup-1.2.3.exe', 'PowerShell'), undefined).ok).toBe(false)
    expect(giudicaRuolo(shell('curl -X POST http://127.0.0.1:47630/api/installa'), undefined).ok).toBe(false)
    // Caricare l'installer nella release non è eseguirlo.
    expect(giudicaRuolo(shell('gh release upload v1.2.3 dist/SierraDeck-Setup-1.2.3.exe.blockmap'), undefined).ok).toBe(true)
  })

  it('i comandi di pubblicazione sono pesanti: prendono il turno, mai insieme a una suite', () => {
    for (const c of ['npm run pubblica', 'export GH_TOKEN=$(gh auth token) && npm run pubblica', 'npm run allega-apk']) {
      expect(ePesante(c), c).toBe(true)
      expect(ePesantePerLaChat(c), c).toBe(true)
    }
    for (const c of ['gh release view v1.2.3 --json assets', 'git push origin main', 'grep -n pubblica package.json', 'cat scripts/allega-apk.mjs']) {
      expect(ePesante(c), c).toBe(false)
    }
  })
})

describe('il compito del rilascio si chiude con il criterio, senza un ramo da unire', () => {
  type Finto = ProcessoClaude & { args: string[]; emetti: (o: unknown) => void }
  let server: ServerAutopiloti | undefined
  let archivio: Archivio
  let orch: ArchivioOrchestratori
  let processi: Finto[] = []
  afterEach(() => { server?.close(); server = undefined; vi.restoreAllMocks() })

  const avvia: AvviaProcesso = ({ args }) => {
    const righe: ((r: string) => void)[] = []
    const p: Finto = { args, scrivi: () => {}, uccidi: () => {}, suRiga: (f) => { righe.push(f) }, suUscita: () => {}, emetti: (o) => { for (const f of righe) f(JSON.stringify(o)) } }
    processi.push(p)
    return p
  }

  /** Un progetto git con il solo ramo principale: nessuna copia, nessun ramo di specialisti. */
  const gitDelPrincipale = (): { git: Git; chiamate: string[][] } => {
    const chiamate: string[][] = []
    const radice = process.cwd()
    const git: Git = (args) => {
      chiamate.push(args)
      const a = args.join(' ')
      if (a === 'rev-parse --is-inside-work-tree') return { codice: 0, uscita: 'true' }
      if (a === 'rev-parse --show-toplevel') return { codice: 0, uscita: radice.replace(/\\/gu, '/') }
      if (a === 'rev-parse --abbrev-ref HEAD') return { codice: 0, uscita: 'main' }
      if (a.startsWith('status --porcelain')) return { codice: 0, uscita: '' }
      if (a === 'worktree list --porcelain') return { codice: 0, uscita: [`worktree ${radice}`, 'HEAD aaa', 'branch refs/heads/main', ''].join('\n') }
      if (a === 'rev-parse --verify --quiet refs/heads/main') return { codice: 0, uscita: '' }
      return { codice: 1, uscita: '' }
    }
    return { git, chiamate }
  }

  async function avviaServizio(git: Git, misure: { comando: string; cwd: string }[], codice: number): Promise<string> {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const orologio = orologioDa('2026-11-11T08:00:00.000Z')
    archivio = apriArchivio(mkdtempSync(join(tmpdir(), 'ap-rilascio-')))
    archivio.scrivi({ ...nuovoAutopilota({ id: 'ap-vecchio', nome: 'Prima', obiettivo: 'la versione nuova', cwd: process.cwd(), iniziatoIl: '2026-11-11T06:00:00.000Z', workspace: 'Lavoro' }), stato: 'lavoro', chats: [] })
    const cartella = mkdtempSync(join(tmpdir(), 'ap-rilascio-orch-'))
    orch = apriOrchestratori(cartella)
    processi = []
    const s = creaServer({
      archivio,
      memoria: apriMemoria(mkdtempSync(join(tmpdir(), 'ap-rilascio-mem-'))),
      versione: '0.99.3',
      esegui: (comando, cwd) => { misure.push({ comando, cwd }); return Promise.resolve({ codice, uscita: codice === 0 ? 'v1.2.3 pubblicata, 5 file' : 'release not found' }) },
      avviaLavoro: () => Promise.resolve(),
      avvisa: () => Promise.resolve(),
      domande: creaRegistroDomande({ adesso: orologio.ms }),
      ultimoDetto: () => undefined,
      scadenzaDomandaMs: 5000,
      adesso: orologio.iso,
      coda: apriCode(cartella),
      orchestratori: orch,
      avviaProcesso: avvia,
      porta: 47999,
      git
    })
    server = s
    const porta = await new Promise<number>((ris) => s.listen(0, '127.0.0.1', () => { ris((s.address() as { port: number }).port) }))
    expect(s.migraVecchi()).toBe(1)
    const id = orch.impostazioni('Lavoro').autopilota!
    // Il processo dell'autopilota parte con la prima richiesta.
    await fetch(`http://127.0.0.1:${porta}/orchestratore/messaggio`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ws: 'Lavoro', testo: 'pubblica la 1.2.3' }) })
    await attendi(() => processi.length > 0, { cosa: 'il processo dell’autopilota' })
    processi[0]!.emetti({ type: 'result', result: 'Pronto.', total_cost_usd: 0.001, session_id: 'sess-1', usage: { input_tokens: 100 } })
    return id
  }

  /** Il rilascio come lo vede il flusso: un Agent di tipo «rilascio» che parte, lavora in sottofondo e finisce. */
  const rilascioFinito = (compito: string): void => {
    const p = processi[0]!
    const descrizione = `${compito}: pubblica la 1.2.3`
    p.emetti({ type: 'assistant', parent_tool_use_id: null, message: { content: [{ type: 'tool_use', id: 'toolu_rilascio', name: 'Agent', input: { subagent_type: 'rilascio', description: descrizione } }] } })
    p.emetti({ type: 'system', subtype: 'task_started', task_id: 'a9f1c0de', tool_use_id: 'toolu_rilascio', task_type: 'local_agent', description: descrizione })
    p.emetti({ type: 'system', subtype: 'task_notification', task_id: 'a9f1c0de', tool_use_id: 'toolu_rilascio', status: 'completed', summary: 'pubblicata la 1.2.3' })
  }

  const compito = (criterio: string): Piano => ({
    versione: 1, compiti: [{ id: 'k-9', richiesta: 'r-1', titolo: 'pubblica la 1.2.3', criterio, dopo: [], peso: 1, stato: 'da-fare', creato: '2026-11-11T08:00:00.000Z' }]
  })

  it('finito il rilascio: nessun ramo cercato né unito, il criterio si misura nella cartella principale', async () => {
    const { git, chiamate } = gitDelPrincipale()
    const misure: { comando: string; cwd: string }[] = []
    const id = await avviaServizio(git, misure, 0)
    orch.scriviPiano('Lavoro', compito('la release c’è con i suoi file: `gh release view v1.2.3 --json isDraft,assets`'))
    rilascioFinito('k-9')
    await attendi(() => orch.piano('Lavoro').compiti[0]!.stato === 'unito', { cosa: 'k-9 chiuso con il criterio' })
    const k = orch.piano('Lavoro').compiti[0]!
    expect(k.criterioVerde).toBe(true)
    // Prima: al compito restava il ramo `worktree-agent-<id>` di una copia che il rilascio non ha, e l'unione falliva.
    expect(k.ramo).toBeUndefined()
    expect(k.esito).toContain('`gh release view v1.2.3 --json isDraft,assets` passa')
    expect(misure).toEqual([{ comando: 'gh release view v1.2.3 --json isDraft,assets', cwd: process.cwd() }])
    expect(chiamate.some((c) => c.includes('merge') || c.includes('worktree'))).toBe(false)
    expect(archivio.leggi(id)!.decisioni.map((d) => d.cosa)).toContainEqual(expect.stringContaining('toolu_rilascio: niente ramo da unire; criterio verde'))
  })

  it('criterio rosso (la release non c’è): il compito lo dice, e non si cerca un ramo da correggere', async () => {
    const { git, chiamate } = gitDelPrincipale()
    const misure: { comando: string; cwd: string }[] = []
    await avviaServizio(git, misure, 1)
    orch.scriviPiano('Lavoro', compito('la release c’è: `gh release view v1.2.3`'))
    rilascioFinito('k-9')
    await attendi(() => orch.piano('Lavoro').compiti[0]!.stato === 'unito', { cosa: 'k-9 misurato' })
    const k = orch.piano('Lavoro').compiti[0]!
    expect(k.criterioVerde).toBe(false)
    expect(k.ramo).toBeUndefined()
    expect(k.esito).toContain('`gh release view v1.2.3` non passa: release not found')
    expect(chiamate.some((c) => c.includes('merge') || c.includes('worktree'))).toBe(false)
  })
})
