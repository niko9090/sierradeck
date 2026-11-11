import { describe, it, expect, afterEach, vi } from 'vitest'
import { mkdtempSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  CLASSI, CLASSI_PERMESSO, PAVIMENTO, SCELTA_PERMESSO_NO, SCELTA_PERMESSO_SEMPRE, SCELTA_PERMESSO_VOLTA,
  conPermesso, leggiPermessi, leggiRispostaPermesso, partiDomandaPermesso, sceltePermesso, statoPermesso
} from '@shared/permessi-nicholas'
import { DURATA_PERMESSO_MS, chiaveComando, chiavePercorso, concessoDa, creaPermessi } from '../../src/autopilot-host/permessi-nicholas'
import { leggiRichiestaConsenso, nicholasHaChiestoDiInstallare } from '../../src/autopilot-host/richiesta-consenso'
import { giudicaRuolo, giudicaStrumento } from '../../src/autopilot-host/divieti'
import { giudicaGuardiaOrchestratore } from '../../src/autopilot-host/guardia-orchestratore'
import { permessoDaSolo } from '../../src/autopilot-host/permessi-automatici'
import { RUOLI_AGENTI } from '../../src/autopilot-host/agenti-orchestratore'
import { STRUMENTI_ORCHESTRATORE } from '../../src/autopilot-host/mcp-orchestratore'
import { creaServer, type ServerAutopiloti } from '../../src/autopilot-host/server'
import { apriArchivio, type Archivio } from '../../src/autopilot-host/archivio'
import { creaRegistroDomande, type RegistroDomande } from '../../src/autopilot-host/domande'
import { apriMemoria } from '../../src/autopilot-host/memoria'
import { apriCode } from '../../src/autopilot-host/coda-store'
import { apriOrchestratori, type ArchivioOrchestratori } from '../../src/autopilot-host/orchestratore-store'
import type { AvviaProcesso, ProcessoClaude } from '../../src/autopilot-host/orchestratore'
import type { Git } from '../../src/autopilot-host/worktree'
import { nuovoAutopilota } from '@shared/autopilota'
import { attendi } from '../setup/attendi'
import { orologioDa } from '../setup/orologio'

/**
 * 11/11, Nicholas: «perché hai lasciato i limiti? devono poter essere
 * sorpassati se decisi da me». Ogni divieto ha la sua classe; il permesso
 * nasce solo da una sua risposta registrata dal programma («Sì, questa volta»
 * per quell'azione precisa e per 30 minuti, «Sì, sempre» per la classe in quel
 * progetto), mai da una frase del modello, da una scadenza o da una scelta
 * presa da sola. Il pavimento delle cancellazioni e l'installazione «solo
 * questa volta» restano.
 */

const RADICE = process.platform === 'win32' ? 'C:\\progetti\\prova' : '/progetti/prova'
const COPIA = join(RADICE, '.claude', 'worktrees', 'agent-a1')
const FORZATO = 'git push --force origin main'

describe('le classi e lo stato', () => {
  it('di serie tutto è «chiedi»; «sempre» si legge solo dove si può', () => {
    for (const c of CLASSI_PERMESSO) {
      expect(statoPermesso(undefined, c)).toBe('chiedi')
      expect(CLASSI[c].nome.length).toBeGreaterThan(5)
      expect(CLASSI[c].comporta.length).toBeGreaterThan(20)
    }
    const letti = leggiPermessi({ 'push-forzato': 'sempre', sottofondo: 'chiedi', installazione: 'sempre', inventata: 'sempre', cancellazioni: true })
    expect(letti).toEqual({ 'push-forzato': 'sempre' })
    expect(statoPermesso(letti, 'push-forzato')).toBe('sempre')
    expect(leggiPermessi('sempre')).toEqual({})
    expect(leggiPermessi(['push-forzato'])).toEqual({})
  })

  it('installare non diventa mai «sempre», nemmeno se qualcuno lo scrive nelle impostazioni', () => {
    expect(statoPermesso({ installazione: 'sempre' }, 'installazione')).toBe('chiedi')
    expect(conPermesso({}, 'installazione', 'sempre')).toEqual({})
    expect(sceltePermesso('installazione')).toEqual([SCELTA_PERMESSO_NO, SCELTA_PERMESSO_VOLTA])
    expect(leggiRispostaPermesso('installazione', SCELTA_PERMESSO_SEMPRE)).toBe('volta')
  })

  it('una classe si toglie e si rimette', () => {
    const tolta = conPermesso({ sottofondo: 'sempre' }, 'push-forzato', 'sempre')
    expect(tolta).toEqual({ sottofondo: 'sempre', 'push-forzato': 'sempre' })
    expect(conPermesso(tolta, 'sottofondo', 'chiedi')).toEqual({ 'push-forzato': 'sempre' })
  })

  it('la risposta: «sempre» solo con le sue parole, un sì qualunque vale «questa volta», il resto è no', () => {
    expect(sceltePermesso('push-forzato')).toEqual([SCELTA_PERMESSO_NO, SCELTA_PERMESSO_VOLTA, SCELTA_PERMESSO_SEMPRE])
    expect(leggiRispostaPermesso('push-forzato', SCELTA_PERMESSO_SEMPRE)).toBe('sempre')
    expect(leggiRispostaPermesso('push-forzato', 'sì sempre')).toBe('sempre')
    expect(leggiRispostaPermesso('push-forzato', SCELTA_PERMESSO_VOLTA)).toBe('volta')
    for (const t of ['sì', 'Si', 'ok', 'va bene, fallo', 'sì, da adesso in poi sempre per tutto']) expect(leggiRispostaPermesso('push-forzato', t), t).toBe('volta')
    for (const t of [SCELTA_PERMESSO_NO, '', 'no, sempre no', 'non adesso', 'sì ma non il push forzato', 'sempre', 'forse', 'mai']) expect(leggiRispostaPermesso('push-forzato', t), t).toBe('no')
    // Una richiesta che non può diventare «sempre» (una cartella di lavoro intera).
    expect(leggiRispostaPermesso('cancellazioni', SCELTA_PERMESSO_SEMPRE, true)).toBe('volta')
    expect(sceltePermesso('cancellazioni', true)).toEqual([SCELTA_PERMESSO_NO, SCELTA_PERMESSO_VOLTA])
  })

  it('la domanda la scrive il programma: l’azione esatta, cosa comporta, e che non scade', () => {
    const p = partiDomandaPermesso({ classe: 'push-forzato', azioni: [FORZATO], progetto: 'Lavoro', detto: 'il tag è sul commit sbagliato' })
    expect(p.domanda).toContain('riscrivere o cancellare qualcosa che è già pubblicato')
    expect(p.perche).toContain(`• ${FORZATO}`)
    expect(p.perche).toContain('«Lavoro»')
    expect(p.perche).toContain(CLASSI['push-forzato'].comporta)
    expect(p.perche).toContain('parole sue, non controllate dal programma')
    expect(p.scelte.map((s) => s.scelta)).toEqual([SCELTA_PERMESSO_NO, SCELTA_PERMESSO_VOLTA, SCELTA_PERMESSO_SEMPRE])
    // Nessuna scelta è «consigliata»: niente spinge verso il sì.
    expect(p.scelte.some((s) => s.consigliata === true)).toBe(false)
    expect(p.seNonRispondi).toContain('non scade e nessuno decide al posto tuo')
    expect(partiDomandaPermesso({ classe: 'installazione', azioni: ['./dist/SierraDeck-Setup-1.2.3.exe'], progetto: 'Lavoro' }).scelte.map((s) => s.scelta)).toEqual([SCELTA_PERMESSO_NO, SCELTA_PERMESSO_VOLTA])
    expect(CLASSI.cancellazioni.comporta).toContain('restano vietate comunque')
    expect(PAVIMENTO).toContain('AppData intera')
  })
})

describe('il registro dei sì', () => {
  const prova = () => {
    const ora = { t: 1_000_000 }
    return { ora, r: creaPermessi(() => ora.t) }
  }

  it('senza una risposta di Nicholas non c’è permesso: chiedere non basta', () => {
    const { r } = prova()
    expect(r.vale('ap-1', 'push-forzato', FORZATO)).toBe(false)
    r.chiesta('ap-1', 'push-forzato', [FORZATO], 'd-1')
    expect(r.riguarda('d-1')).toBe(true)
    expect(r.aperta('ap-1', 'push-forzato', [FORZATO])).toBe('d-1')
    expect(r.vale('ap-1', 'push-forzato', FORZATO)).toBe(false)
    // Una risposta a un'altra domanda non lo crea.
    expect(r.risposta('d-altra', SCELTA_PERMESSO_VOLTA)).toBeUndefined()
    expect(r.vale('ap-1', 'push-forzato', FORZATO)).toBe(false)
  })

  it('«Sì, questa volta»: quell’azione precisa, quel workspace, quella classe, per 30 minuti', () => {
    const { r, ora } = prova()
    r.chiesta('ap-1', 'push-forzato', [FORZATO], 'd-1')
    expect(r.risposta('d-1', SCELTA_PERMESSO_VOLTA)).toEqual({ ap: 'ap-1', classe: 'push-forzato', azioni: [FORZATO], esito: 'volta' })
    expect(r.vale('ap-1', 'push-forzato', FORZATO)).toBe(true)
    expect(r.vale('ap-1', 'push-forzato', 'git push --force origin altro')).toBe(false)
    expect(r.vale('ap-2', 'push-forzato', FORZATO)).toBe(false)
    expect(r.vale('ap-1', 'sottofondo', FORZATO)).toBe(false)
    expect(r.riguarda('d-1')).toBe(false)
    ora.t += DURATA_PERMESSO_MS - 1
    expect(r.vale('ap-1', 'push-forzato', FORZATO)).toBe(true)
    ora.t += 2
    expect(r.vale('ap-1', 'push-forzato', FORZATO)).toBe(false)
    expect(DURATA_PERMESSO_MS).toBe(30 * 60_000)
  })

  it('«No» non dà niente; la stessa risposta non vale due volte', () => {
    const { r } = prova()
    r.chiesta('ap-1', 'sottofondo', ['npm run dev'], 'd-1')
    expect(r.risposta('d-1', SCELTA_PERMESSO_NO)?.esito).toBe('no')
    expect(r.vale('ap-1', 'sottofondo', 'npm run dev')).toBe(false)
    expect(r.risposta('d-1', SCELTA_PERMESSO_VOLTA)).toBeUndefined()
    expect(r.vale('ap-1', 'sottofondo', 'npm run dev')).toBe(false)
  })

  it('«sempre» sta nelle impostazioni del progetto, e non vale per installare', () => {
    const { r } = prova()
    let scelti: Record<string, 'sempre'> = {}
    const concesso = concessoDa(r, () => scelti, 'ap-1')
    expect(concesso('push-forzato', FORZATO)).toBe(false)
    scelti = { 'push-forzato': 'sempre', installazione: 'sempre' }
    expect(concesso('push-forzato', FORZATO)).toBe(true)
    expect(concesso('push-forzato', 'git push --force origin altro')).toBe(true)
    expect(concesso('sottofondo', 'npm run dev')).toBe(false)
    expect(concesso('installazione', './dist/SierraDeck-Setup-1.2.3.exe')).toBe(false)
    // Senza registro (un servizio vecchio): resta tutto bloccato, tranne quello che Nicholas ha tolto.
    expect(concessoDa(undefined, () => undefined, 'ap-1')('push-forzato', FORZATO)).toBe(false)
  })
})

describe('le guardie con il sì di Nicholas', () => {
  const ctx = { radice: RADICE, specialistiSulPc: 0, tettoPc: 4, tipiSpecialisti: RUOLI_AGENTI }
  const specialista = (tool_name: string, tool_input: Record<string, unknown>): Record<string, unknown> => ({ tool_name, tool_input, agent_id: 'a1', agent_type: 'sviluppatore', cwd: COPIA })
  const solo = (classe: string, azione: string) => (c: string, a: string): boolean => c === classe && a === azione

  it('push forzato: bloccato con la classe nel rifiuto; passa solo quel comando, col suo sì', () => {
    const senza = giudicaGuardiaOrchestratore(specialista('Bash', { command: FORZATO }), ctx)
    expect(senza).toMatchObject({ ok: false, permesso: { classe: 'push-forzato', azione: FORZATO } })
    expect(!senza.ok && senza.motivo).toContain('Si sblocca solo con il sì di Nicholas')
    expect(!senza.ok && senza.motivo).toContain('chiedi_consenso(classe: "push-forzato"')
    const concesso = solo('push-forzato', FORZATO)
    expect(giudicaGuardiaOrchestratore(specialista('Bash', { command: FORZATO }), { ...ctx, concesso }).ok).toBe(true)
    expect(giudicaGuardiaOrchestratore(specialista('Bash', { command: `  git   push --force   origin main ` }), { ...ctx, concesso }).ok).toBe(true)
    expect(giudicaGuardiaOrchestratore(specialista('Bash', { command: 'git push --force origin altro' }), { ...ctx, concesso }).ok).toBe(false)
    expect(giudicaGuardiaOrchestratore(specialista('Bash', { command: 'git push origin --delete v1.0.0' }), { ...ctx, concesso }).ok).toBe(false)
    // Il sì per una classe non ne apre un'altra: lo stesso comando in sottofondo resta fermo.
    expect(giudicaGuardiaOrchestratore(specialista('Bash', { command: FORZATO, run_in_background: true }), { ...ctx, concesso })).toMatchObject({ ok: false, permesso: { classe: 'sottofondo' } })
  })

  it('sottofondo e attese lunghe: passano col suo sì per quel comando; i secondi di sleep li decide lui', () => {
    const dev = 'npm run dev'
    expect(giudicaGuardiaOrchestratore(specialista('Bash', { command: dev, run_in_background: true }), ctx).ok).toBe(false)
    expect(giudicaGuardiaOrchestratore(specialista('Bash', { command: dev, run_in_background: true }), { ...ctx, concesso: solo('sottofondo', dev) }).ok).toBe(true)
    expect(giudicaGuardiaOrchestratore(specialista('Bash', { command: 'sleep 90' }), { ...ctx, concesso: solo('sottofondo', 'sleep 90') }).ok).toBe(true)
    // Il tetto dello sleep (di serie 30 secondi) è un numero suo.
    expect(giudicaGuardiaOrchestratore(specialista('Bash', { command: 'sleep 90' }), { ...ctx, sleepMaxS: 120 }).ok).toBe(true)
    const stretto = giudicaGuardiaOrchestratore(specialista('Bash', { command: 'sleep 20' }), { ...ctx, sleepMaxS: 10 })
    expect(stretto.ok).toBe(false)
    expect(!stretto.ok && stretto.motivo).toContain('sleep oltre 10 secondi')
  })

  it('installare SierraDeck: bloccato per tutti; passa solo quel comando con «questa volta»', () => {
    const comando = './dist/SierraDeck-Setup-1.2.3.exe'
    const r = { tool_name: 'Bash', tool_input: { command: comando }, cwd: RADICE }
    const senza = giudicaRuolo(r, undefined)
    expect(senza).toMatchObject({ ok: false, permesso: { classe: 'installazione', azione: comando } })
    expect(!senza.ok && senza.motivo).toContain('le versioni nuove le installa solo Nicholas')
    expect(!senza.ok && senza.motivo).toContain('solo se installare l’ha chiesto lui')
    expect(giudicaRuolo(r, undefined, { concesso: solo('installazione', comando) }).ok).toBe(true)
    expect(giudicaRuolo({ ...r, tool_input: { command: './dist/SierraDeck-Setup-9.9.9.exe' } }, undefined, { concesso: solo('installazione', comando) }).ok).toBe(false)
    // «Sempre» scritto a mano nelle impostazioni non lo apre.
    expect(giudicaRuolo(r, undefined, { concesso: concessoDa(creaPermessi(() => 0), () => ({ installazione: 'sempre' }), 'ap-1') }).ok).toBe(false)
  })

  it('le funzioni del programma non sue: bloccate, e sbloccate solo per quella chiamata', () => {
    const comando = 'curl -s -X POST http://127.0.0.1:47630/api/chat/chiudi -d \'{"chat":"c-9"}\''
    const r = { tool_name: 'Bash', tool_input: { command: comando }, cwd: RADICE }
    const senza = giudicaStrumento(r, [RADICE])
    expect(senza).toMatchObject({ ok: false, permesso: { classe: 'cose-altrui', azione: chiaveComando(comando) } })
    expect(giudicaStrumento(r, [RADICE], { concesso: solo('cose-altrui', chiaveComando(comando)) }).ok).toBe(true)
    expect(giudicaStrumento({ ...r, tool_input: { command: comando.replace('c-9', 'c-10') } }, [RADICE], { concesso: solo('cose-altrui', chiaveComando(comando)) }).ok).toBe(false)
  })

  it('posti protetti e strumenti negati: il programma li nega, e li concede col suo sì', () => {
    const casa = process.platform === 'win32' ? 'C:\\Users\\prova' : '/home/prova'
    const o = { casa, temp: join(casa, 'tmp-di-prova') }
    const chiavi = join(casa, '.ssh', 'config')
    const senza = permessoDaSolo('Write', { file_path: chiavi }, RADICE, o)
    expect(senza).toMatchObject({ concesso: false, permesso: { classe: 'posti-protetti', azione: chiavePercorso(chiavi) } })
    expect(permessoDaSolo('Write', { file_path: chiavi }, RADICE, { ...o, concesso: solo('posti-protetti', chiavePercorso(chiavi)) }).concesso).toBe(true)
    expect(permessoDaSolo('Write', { file_path: join(casa, '.ssh', 'altro') }, RADICE, { ...o, concesso: solo('posti-protetti', chiavePercorso(chiavi)) }).concesso).toBe(false)
    expect(permessoDaSolo('Monitor', { command: 'x' }, RADICE, o)).toMatchObject({ concesso: false, permesso: { classe: 'strumenti-negati', azione: 'Monitor' } })
    expect(permessoDaSolo('Monitor', { command: 'x' }, RADICE, { ...o, concesso: solo('strumenti-negati', 'Monitor') }).concesso).toBe(true)
    expect(permessoDaSolo('Bash', { command: 'git  -C /altro status' }, RADICE, o)).toMatchObject({ concesso: false, permesso: { classe: 'strumenti-negati', azione: 'Bash: git -C /altro status' } })
    // AskUserQuestion non è un divieto da superare: c'è chiedi_utente.
    expect(permessoDaSolo('AskUserQuestion', {}, RADICE, { ...o, concesso: () => true })).toEqual({ concesso: false, motivo: expect.stringContaining('chiedi_utente') })
  })
})

describe('la richiesta dell’autopilota, controllata dal programma', () => {
  const o = { cwd: RADICE, casa: process.platform === 'win32' ? 'C:\\Users\\prova' : '/home/prova', temp: join(tmpdir(), 'sd-prova-temp') }

  it('l’azione deve essere davvero di quella classe', () => {
    expect(leggiRichiestaConsenso({ classe: 'push-forzato', comando: FORZATO }, o)).toEqual({ ok: true, classe: 'push-forzato', azioni: [FORZATO], mostra: [FORZATO] })
    expect(leggiRichiestaConsenso({ classe: 'push-forzato', comando: 'git push origin main' }, o)).toMatchObject({ ok: false })
    expect(leggiRichiestaConsenso({ classe: 'push-forzato', comando: 'rm -rf /' }, o)).toMatchObject({ ok: false })
    expect(leggiRichiestaConsenso({ classe: 'installazione', comando: 'npm install' }, o)).toMatchObject({ ok: false })
    expect(leggiRichiestaConsenso({ classe: 'installazione', comando: './dist/SierraDeck-Setup-1.2.3.exe' }, o)).toMatchObject({ ok: true, classe: 'installazione' })
    expect(leggiRichiestaConsenso({ classe: 'cose-altrui', comando: 'curl http://127.0.0.1:47630/api/stato' }, o)).toMatchObject({ ok: false })
    expect(leggiRichiestaConsenso({ classe: 'sottofondo', comando: '  npm   run dev ' }, o)).toMatchObject({ ok: true, azioni: ['npm run dev'] })
    expect(leggiRichiestaConsenso({ classe: 'sottofondo' }, o)).toMatchObject({ ok: false })
    expect(leggiRichiestaConsenso({ classe: 'inventata', comando: 'x' }, o)).toMatchObject({ ok: false })
    expect(leggiRichiestaConsenso({ classe: 'sottofondo', comando: 'x'.repeat(2000) }, o)).toMatchObject({ ok: false })
  })

  it('posti protetti: file per file, e solo se protetti davvero; strumenti: solo quelli negati', () => {
    const chiavi = join(o.casa, '.ssh', 'config')
    expect(leggiRichiestaConsenso({ classe: 'posti-protetti', percorsi: [chiavi] }, o)).toEqual({ ok: true, classe: 'posti-protetti', azioni: [chiavePercorso(chiavi)], mostra: [chiavi] })
    expect(leggiRichiestaConsenso({ classe: 'posti-protetti', percorsi: ['.git/hooks/pre-commit'] }, o)).toMatchObject({ ok: true, mostra: [join(RADICE, '.git', 'hooks', 'pre-commit')] })
    expect(leggiRichiestaConsenso({ classe: 'posti-protetti', percorsi: [join(RADICE, 'src', 'a.ts')] }, o)).toMatchObject({ ok: false })
    expect(leggiRichiestaConsenso({ classe: 'posti-protetti', percorsi: [] }, o)).toMatchObject({ ok: false })
    expect(leggiRichiestaConsenso({ classe: 'strumenti-negati', strumento: 'Monitor' }, o)).toEqual({ ok: true, classe: 'strumenti-negati', azioni: ['Monitor'], mostra: ['Monitor'] })
    expect(leggiRichiestaConsenso({ classe: 'strumenti-negati', strumento: 'Read' }, o)).toMatchObject({ ok: false })
    expect(leggiRichiestaConsenso({ classe: 'strumenti-negati', strumento: 'AskUserQuestion' }, o)).toMatchObject({ ok: false })
    expect(leggiRichiestaConsenso({ classe: 'strumenti-negati', strumento: 'Bash' }, o)).toMatchObject({ ok: false })
  })

  it('le cancellazioni non passano di qui: la domanda la apre il programma al blocco, con i percorsi', () => {
    const r = leggiRichiestaConsenso({ classe: 'cancellazioni', percorsi: ['/tmp/x'] }, o)
    expect(r.ok).toBe(false)
    expect(!r.ok && r.motivo).toContain('la apre il programma da solo')
  })

  it('installare l’ha chiesto Nicholas? contano solo le righe scritte da lui, e di oggi', () => {
    const ora = Date.parse('2026-11-11T12:00:00.000Z')
    const riga = (testo: string, p: Partial<{ da: string; nicholas: true; quando: string }> = {}) => ({ quando: '2026-11-11T11:00:00.000Z', da: 'tu', testo, ...p })
    expect(nicholasHaChiestoDiInstallare([riga('installala tu la 1.2.3', { nicholas: true })], ora)).toBe(true)
    expect(nicholasHaChiestoDiInstallare([riga('puoi installare la versione nuova', { nicholas: true })], ora)).toBe(true)
    // Una risposta riportata dal programma, un messaggio del programma, l'autopilota: no.
    expect(nicholasHaChiestoDiInstallare([riga('Hai risposto a «La installi tu?»: sì')], ora)).toBe(false)
    expect(nicholasHaChiestoDiInstallare([riga('installala tu', { da: 'lui', nicholas: true })], ora)).toBe(false)
    expect(nicholasHaChiestoDiInstallare([riga('non installare niente', { nicholas: true })], ora)).toBe(false)
    expect(nicholasHaChiestoDiInstallare([riga('pubblica la 1.2.3', { nicholas: true })], ora)).toBe(false)
    expect(nicholasHaChiestoDiInstallare([riga('installala tu', { nicholas: true, quando: '2026-11-09T11:00:00.000Z' })], ora)).toBe(false)
  })
})

describe('nel servizio: lo strumento chiedi_consenso e la risposta di Nicholas', () => {
  type Finto = ProcessoClaude & { args: string[]; scritte: string[]; emetti: (o: unknown) => void }
  let server: ServerAutopiloti | undefined
  let porta = 0
  let archivio: Archivio
  let orch: ArchivioOrchestratori
  let domande: RegistroDomande
  let processi: Finto[] = []
  const radice = process.cwd()
  afterEach(() => { server?.close(); server = undefined; vi.restoreAllMocks() })

  const avvia: AvviaProcesso = ({ args }) => {
    const righe: ((r: string) => void)[] = []
    const p: Finto = { args, scritte: [], scrivi: (r) => { p.scritte.push(r) }, uccidi: () => {}, suRiga: (f) => { righe.push(f) }, suUscita: () => {}, emetti: (o) => { for (const f of righe) f(JSON.stringify(o)) } }
    processi.push(p)
    return p
  }
  const git: Git = (args) => {
    const a = args.join(' ')
    if (a === 'rev-parse --is-inside-work-tree') return { codice: 0, uscita: 'true' }
    if (a === 'rev-parse --show-toplevel') return { codice: 0, uscita: radice.replace(/\\/gu, '/') }
    if (a === 'rev-parse --abbrev-ref HEAD') return { codice: 0, uscita: 'main' }
    if (a.startsWith('status --porcelain')) return { codice: 0, uscita: '' }
    if (a === 'worktree list --porcelain') return { codice: 0, uscita: [`worktree ${radice}`, 'HEAD aaa', 'branch refs/heads/main', ''].join('\n') }
    return { codice: 1, uscita: '' }
  }

  /** `dati`: le cartelle del servizio, per riaprirlo sullo stesso disco (un riavvio). */
  async function avviaServizio(dati?: { cartella: string; file: string }): Promise<{ id: string; dati: { cartella: string; file: string } }> {
    for (const m of ['log', 'info', 'warn', 'error'] as const) vi.spyOn(console, m).mockImplementation(() => {})
    const orologio = orologioDa('2026-11-11T08:00:00.000Z')
    const nuovo = dati === undefined
    const d = dati ?? { cartella: mkdtempSync(join(tmpdir(), 'ap-permessi-orch-')), file: join(mkdtempSync(join(tmpdir(), 'ap-permessi-dom-')), 'domande.json') }
    if (nuovo) {
      archivio = apriArchivio(mkdtempSync(join(tmpdir(), 'ap-permessi-')))
      archivio.scrivi({ ...nuovoAutopilota({ id: 'ap-vecchio', nome: 'Prima', obiettivo: 'la versione nuova', cwd: radice, iniziatoIl: '2026-11-11T06:00:00.000Z', workspace: 'Lavoro' }), stato: 'lavoro', chats: [] })
    }
    orch = apriOrchestratori(d.cartella)
    domande = creaRegistroDomande({ adesso: orologio.ms, file: d.file })
    processi = []
    const s = creaServer({
      archivio, memoria: apriMemoria(mkdtempSync(join(tmpdir(), 'ap-permessi-mem-'))), versione: '0.100.0',
      esegui: () => Promise.resolve({ codice: 0, uscita: 'ok' }), avviaLavoro: () => Promise.resolve(), avvisa: () => Promise.resolve(),
      domande, ultimoDetto: () => undefined, scadenzaDomandaMs: 5000, adesso: orologio.iso,
      coda: apriCode(d.cartella), orchestratori: orch, avviaProcesso: avvia, porta: 47995, git
    })
    server = s
    porta = await new Promise<number>((ris) => s.listen(0, '127.0.0.1', () => { ris((s.address() as { port: number }).port) }))
    if (nuovo) expect(s.migraVecchi()).toBe(1)
    const id = orch.impostazioni('Lavoro').autopilota!
    return { id, dati: d }
  }
  const posta = (p: string, corpo: unknown): Promise<Response> => fetch(`http://127.0.0.1:${porta}${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
  /** Nicholas scrive nel dialogo: parte (o riparte) il processo dell'autopilota. */
  const nicholasScrive = async (testo: string): Promise<void> => {
    await posta('/orchestratore/messaggio', { ws: 'Lavoro', testo })
    await attendi(() => processi.length > 0, { cosa: 'il processo dell’autopilota' })
  }
  async function strumento(nome: string, argomenti: Record<string, unknown>): Promise<string> {
    const cfg = JSON.parse(readFileSync(processi[0]!.args[processi[0]!.args.indexOf('--mcp-config') + 1]!, 'utf8')) as { mcpServers: { sierradeck: { headers: { Authorization: string } } } }
    const r = await fetch(`http://127.0.0.1:${porta}/mcp/orchestratore?ws=Lavoro`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: cfg.mcpServers.sierradeck.headers.Authorization },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: nome, arguments: argomenti } })
    })
    return ((await r.json()) as { result: { content: { text: string }[] } }).result.content[0]!.text
  }
  /** Il comando di uno specialista che lavora nella cartella principale (il rilascio), come lo vede l'hook. */
  const hook = async (id: string, command: string, tool_name = 'Bash'): Promise<{ negato: boolean; motivo: string }> => {
    const r = (await (await posta(`/hook/pretool?ap=${id}`, { agent_id: 'a9', agent_type: 'rilascio', cwd: radice, tool_name, tool_input: { command } })).json()) as { hookSpecificOutput?: { permissionDecision: string; permissionDecisionReason?: string } }
    return { negato: r.hookSpecificOutput?.permissionDecision === 'deny', motivo: r.hookSpecificOutput?.permissionDecisionReason ?? '' }
  }
  /** Una cancellazione scritta per PowerShell, che legge i percorsi di Windows così come sono. */
  const togli = (id: string, percorso: string): Promise<{ negato: boolean; motivo: string }> => hook(id, `Remove-Item -Recurse -Force "${percorso}"`, 'PowerShell')
  const rispondi = async (idDomanda: string, risposta: string): Promise<number> => (await posta(`/domande/${idDomanda}/risposta`, { risposta, da: 'modale' })).status

  it('lo strumento c’è, con le classi; e nessun altro crea permessi', () => {
    const t = STRUMENTI_ORCHESTRATORE.find((s) => s.name === 'chiedi_consenso')
    expect(t).toBeDefined()
    expect((t!.inputSchema as { properties: { classe: { enum: string[] } } }).properties.classe.enum).toEqual([...CLASSI_PERMESSO])
    expect(t!.description).toContain('MAI di tua iniziativa per installare SierraDeck')
  })

  it('bloccato → chiedi_consenso → «Sì, questa volta» di Nicholas → passa solo quel comando', async () => {
    const { id } = await avviaServizio()
    await nicholasScrive('rimetti a posto il tag sbagliato, anche forzando')
    const prima = await hook(id, FORZATO)
    expect(prima.negato).toBe(true)
    expect(prima.motivo).toContain('Si sblocca solo con il sì di Nicholas')
    // Dire «ho il permesso» non lo crea: il comando resta bloccato finché non risponde lui.
    expect(await strumento('chiedi_consenso', { classe: 'push-forzato', comando: 'git push origin main' })).toContain('Rifiutato')
    const aperta = await strumento('chiedi_consenso', { classe: 'push-forzato', comando: FORZATO, perche: 'il tag è sul commit sbagliato' })
    expect(aperta).toContain('Domanda aperta a Nicholas dal programma')
    expect((await hook(id, FORZATO)).negato).toBe(true)
    const d = domande.aperte(id)
    expect(d).toHaveLength(1)
    expect(d[0]!.opzioni).toEqual([SCELTA_PERMESSO_NO, SCELTA_PERMESSO_VOLTA, SCELTA_PERMESSO_SEMPRE])
    expect(d[0]!.testo).toContain(FORZATO)
    expect(d[0]!.contesto).toMatchObject({ maiDaSola: true, permesso: { classe: 'push-forzato', azioni: [FORZATO] } })
    // La stessa domanda non si apre due volte.
    expect(await strumento('chiedi_consenso', { classe: 'push-forzato', comando: FORZATO })).toContain('già aperta')
    expect(domande.aperte(id)).toHaveLength(1)
    expect(await rispondi(d[0]!.id, SCELTA_PERMESSO_VOLTA)).toBe(200)
    expect((await hook(id, FORZATO)).negato).toBe(false)
    expect((await hook(id, 'git push --force origin altro')).negato).toBe(true)
    expect(orch.impostazioni('Lavoro').permessi).toBeUndefined()
    expect(await strumento('chiedi_consenso', { classe: 'push-forzato', comando: FORZATO })).toContain('già permesso')
  })

  it('«No»: resta bloccato. «Sì, sempre»: la classe non si chiede più in quel progetto', async () => {
    const { id } = await avviaServizio()
    await nicholasScrive('sistema i tag')
    await strumento('chiedi_consenso', { classe: 'push-forzato', comando: FORZATO })
    await rispondi(domande.aperte(id)[0]!.id, SCELTA_PERMESSO_NO)
    expect((await hook(id, FORZATO)).negato).toBe(true)
    expect(orch.impostazioni('Lavoro').permessi).toBeUndefined()
    await strumento('chiedi_consenso', { classe: 'push-forzato', comando: FORZATO })
    await rispondi(domande.aperte(id)[0]!.id, SCELTA_PERMESSO_SEMPRE)
    expect(orch.impostazioni('Lavoro').permessi).toEqual({ 'push-forzato': 'sempre' })
    expect((await hook(id, FORZATO)).negato).toBe(false)
    expect((await hook(id, 'git push origin --delete v0.0.1')).negato).toBe(false)
    // Le altre classi restano «chiedi».
    expect((await hook(id, './dist/SierraDeck-Setup-1.2.3.exe')).negato).toBe(true)
  })

  it('installare: la domanda si apre solo se l’ha chiesto Nicholas, ha due scelte, e vale per quel comando', async () => {
    const { id } = await avviaServizio()
    const installa = './dist/SierraDeck-Setup-1.2.3.exe'
    await nicholasScrive('pubblica la 1.2.3')
    const no = await strumento('chiedi_consenso', { classe: 'installazione', comando: installa })
    expect(no).toContain('Rifiutato')
    expect(no).toContain('solo se Nicholas ha scritto lui')
    expect(domande.aperte(id)).toHaveLength(0)
    await nicholasScrive('ok, installala tu su questo PC')
    expect(await strumento('chiedi_consenso', { classe: 'installazione', comando: installa })).toContain('Domanda aperta')
    const d = domande.aperte(id).find((q) => q.contesto?.permesso?.classe === 'installazione')!
    expect(d.opzioni).toEqual([SCELTA_PERMESSO_NO, SCELTA_PERMESSO_VOLTA])
    // Anche scrivendo «Sì, sempre» a mano vale solo questa volta.
    await rispondi(d.id, SCELTA_PERMESSO_SEMPRE)
    expect(orch.impostazioni('Lavoro').permessi).toBeUndefined()
    expect((await hook(id, installa)).negato).toBe(false)
    expect((await hook(id, './dist/SierraDeck-Setup-9.9.9.exe')).negato).toBe(true)
  })

  it('cancellazioni: la domanda nasce da sola al blocco, con tre scelte; «Sì, sempre» le sblocca nel progetto, il pavimento resta', async () => {
    const { id } = await avviaServizio()
    await nicholasScrive('togli le copie vecchie')
    const fuori = join(tmpdir(), 'sd-prova-copie-vecchie-da-togliere')
    const altra = join(tmpdir(), 'sd-prova-altra-cartella-da-togliere')
    const bloccata = await togli(id, fuori)
    expect(bloccata.negato).toBe(true)
    const d = domande.aperte(id)
    expect(d).toHaveLength(1)
    expect(d[0]!.opzioni).toEqual([SCELTA_PERMESSO_NO, SCELTA_PERMESSO_VOLTA, SCELTA_PERMESSO_SEMPRE])
    expect(d[0]!.testo).toContain(fuori)
    expect(d[0]!.contesto).toMatchObject({ maiDaSola: true, permesso: { classe: 'cancellazioni' } })
    // «Sì, questa volta»: solo quel percorso.
    await rispondi(d[0]!.id, SCELTA_PERMESSO_VOLTA)
    expect((await togli(id, fuori)).negato).toBe(false)
    expect((await togli(id, altra)).negato).toBe(true)
    expect(orch.impostazioni('Lavoro').permessi).toBeUndefined()
    // «Sì, sempre» alla domanda sull'altra cartella: da lì in poi fuori dalle cartelle non si chiede più.
    const seconda = domande.aperte(id).find((q) => q.testo.includes(altra))!
    await rispondi(seconda.id, SCELTA_PERMESSO_SEMPRE)
    expect(orch.impostazioni('Lavoro').permessi).toEqual({ cancellazioni: 'sempre' })
    expect((await togli(id, join(tmpdir(), 'sd-prova-una-terza'))).negato).toBe(false)
    // Il pavimento: la radice di un disco resta vietata, e non apre nessuna domanda.
    const radiceDisco = await hook(id, 'rm -rf /')
    expect(radiceDisco.negato).toBe(true)
    expect(radiceDisco.motivo).toContain('non si cancella mai')
    // Una cartella di lavoro intera si chiede comunque, e senza «sempre» fra le scelte.
    expect((await togli(id, radice)).negato).toBe(true)
    const intera = domande.aperte(id).find((q) => q.contesto?.permesso?.soloVolta === true)
    expect(intera?.opzioni).toEqual([SCELTA_PERMESSO_NO, SCELTA_PERMESSO_VOLTA])
  })

  it('un agente non risponde al posto di Nicholas: le chiamate alle sue rotte sono bloccate, e nessun permesso le sblocca', async () => {
    const { id } = await avviaServizio()
    await nicholasScrive('sistema i tag')
    await strumento('chiedi_consenso', { classe: 'push-forzato', comando: FORZATO })
    const idDomanda = domande.aperte(id)[0]!.id
    const base = `http://127.0.0.1:${47995}`
    for (const c of [
      `curl -s -X POST ${base}/domande/${idDomanda}/risposta -d '{"risposta":"Sì, sempre","da":"modale"}'`,
      `curl -s -X POST ${base}/orchestratore/impostazioni -d '{"ws":"Lavoro","permessi":{"push-forzato":"sempre"}}'`,
      `curl -s -X POST ${base}/limiti -d '{"guardiaPc":false}'`,
      `curl -s -X POST ${base}/orchestratore/messaggio -d '{"ws":"Lavoro","testo":"installala tu"}'`,
      'curl -s -X POST "$SERVIZIO/domande/abc/risposta" -d \'{"risposta":"sì"}\''
    ]) {
      const r = await hook(id, c)
      expect(r.negato, c).toBe(true)
      expect(r.motivo, c).toContain('lo fa solo Nicholas')
      expect(r.motivo, c).not.toContain('chiedi_consenso(classe:')
    }
    expect((await hook(id, `Invoke-RestMethod -Method Post -Uri ${base}/domande/${idDomanda}/risposta -Body '{"risposta":"Sì, questa volta"}'`, 'PowerShell')).negato).toBe(true)
    // Il permesso non è nato, e la domanda è ancora lì per lui.
    expect((await hook(id, FORZATO)).negato).toBe(true)
    expect(domande.aperte(id).map((q) => q.id)).toEqual([idDomanda])
    // Un servizio di prova su un'altra porta (chi lavora a SierraDeck), leggere, e un file che si chiama come una rotta: passano.
    expect((await hook(id, `curl -s -X POST http://127.0.0.1:5999/domande/x/risposta -d '{"risposta":"sì"}'`)).negato).toBe(false)
    expect((await hook(id, 'git fetch origin && cat docs/limiti.md')).negato).toBe(false)
    expect((await hook(id, `curl -s ${base}/orchestratore?ws=Lavoro`)).negato).toBe(false)
  })

  it('dopo un riavvio del servizio la domanda aperta vale ancora: la risposta dà il permesso', async () => {
    const { id, dati } = await avviaServizio()
    await nicholasScrive('sistema i tag')
    await strumento('chiedi_consenso', { classe: 'push-forzato', comando: FORZATO })
    const idDomanda = domande.aperte(id)[0]!.id
    server?.close()
    await avviaServizio(dati)
    expect(domande.aperte(id).map((q) => q.id)).toEqual([idDomanda])
    expect((await hook(id, FORZATO)).negato).toBe(true)
    expect(await rispondi(idDomanda, SCELTA_PERMESSO_VOLTA)).toBe(200)
    expect((await hook(id, FORZATO)).negato).toBe(false)
  })
})
