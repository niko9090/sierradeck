import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { creaServer, RILETTURA_RAPPORTO_MS, type ServerAutopiloti } from '../../src/autopilot-host/server'
import { apriArchivio, type Archivio } from '../../src/autopilot-host/archivio'
import { creaRegistroDomande } from '../../src/autopilot-host/domande'
import { ultimoRapportoDa } from '../../src/autopilot-host/trascrizione'
import { regoleDiConsegna } from '../../src/autopilot-host/nel-mosaico'
import { testoRipresa } from '../../src/autopilot-host/mai-fermo'
import { componiPromptDialogo } from '../../src/autopilot-host/dialogo'
import { leggiRapportoChat, quadroDellaChat, rapportoDiFineTurno, REGOLA_RAPPORTO, righeQuadroChat, rigaRapporto } from '@shared/rapporti-chat'
import { indicatoreDi } from '@shared/indicatore-autopilota'
import { nuovoAutopilota, type Autopilota, type ChatGovernata } from '@shared/autopilota'

// 0.85.1 — Le chat riferiscono sempre all'autopilota. Nicholas, 23/10 sera:
// «le chat devono SEMPRE interfacciarsi con te, tu dovresti sempre sapere cosa
// succede e perché». Il 23/10 una chat è rimasta muta 21 minuti dentro un turno
// lungo e l'autopilota, a cui si chiedeva «a che punto siamo», sapeva solo le
// ultime mosse: nessun rapporto arrivava prima della fine del turno.

const ORA = Date.parse('2026-10-23T20:00:00.000Z')
const iso = (ms: number): string => new Date(ms).toISOString()

function autopilota(over: Partial<Autopilota> & { id: string }): Autopilota {
  return {
    ...nuovoAutopilota({ id: over.id, nome: over.id, obiettivo: 'la 0.85.1', cwd: 'C:\\Progetti\\Esempio', criteri: [{ descrizione: 'i test passano', comando: 'npm test', soddisfatto: false }], iniziatoIl: iso(ORA - 3_600_000) }),
    stato: 'lavoro',
    ultimoEvento: iso(ORA),
    ...over
  }
}
const chat = (id: string, over: Partial<ChatGovernata> = {}): ChatGovernata =>
  ({ id, compito: `il compito di ${id}`, stato: 'lavoro', cicli: 1, sessionId: `s-${id}`, dal: iso(ORA - 30 * 60_000), ...over })

/** Una riga di trascrizione di Claude Code. */
const riga = (role: 'assistant' | 'user', text: string): string => JSON.stringify({ type: role, message: { role, content: [{ type: 'text', text }] } })

describe('la riga RAPPORTO', () => {
  it('le sette forme della regola si leggono', () => {
    expect(rigaRapporto('RAPPORTO: partita — rifaccio il supervisore')).toMatchObject({ tipo: 'partita', testo: 'rifaccio il supervisore', dichiarato: true })
    expect(rigaRapporto('RAPPORTO: piano — 1) test 2) correzione 3) commit')).toMatchObject({ tipo: 'piano', testo: '1) test 2) correzione 3) commit' })
    expect(rigaRapporto('RAPPORTO: passo fatto — scritto il test')).toMatchObject({ tipo: 'passo', testo: 'scritto il test' })
    expect(rigaRapporto('RAPPORTO: provo — npm run typecheck')).toMatchObject({ tipo: 'provo', testo: 'npm run typecheck' })
    expect(rigaRapporto('RAPPORTO: bloccata perché — gradle non parte')).toMatchObject({ tipo: 'bloccata', testo: 'gradle non parte' })
    expect(rigaRapporto('RAPPORTO: mi serve — la chiave del Drive')).toMatchObject({ tipo: 'serve', testo: 'la chiave del Drive' })
    expect(rigaRapporto('RAPPORTO: finita — commit 1a2b3c4, 120 test verdi')).toMatchObject({ tipo: 'finita', testo: 'commit 1a2b3c4, 120 test verdi' })
  })

  it('vale l ultima del testo, anche in grassetto; senza motivo lo dice', () => {
    expect(rigaRapporto('RAPPORTO: piano — x\nlavoro…\n**RAPPORTO: provo** — vitest')?.tipo).toBe('provo')
    expect(rigaRapporto('RAPPORTO: bloccata')).toMatchObject({ tipo: 'bloccata', testo: 'non ha detto il motivo' })
  })

  it('una parola che comincia come un tipo non è un rapporto, e senza la riga non c è', () => {
    expect(rigaRapporto('RAPPORTO: pianoforte')).toBeUndefined()
    expect(rigaRapporto('Ho finito il passo.')).toBeUndefined()
  })

  it('a fine turno: la riga se c è, se no quello che dice il segnale (dedotto)', () => {
    const q = iso(ORA)
    expect(rapportoDiFineTurno('RAPPORTO: finita — commit abc\nSEGNALE: fatto', { tipo: 'fatto', quando: q, dichiarato: true }, q)).toMatchObject({ tipo: 'finita', testo: 'commit abc', dichiarato: true })
    expect(rapportoDiFineTurno('SEGNALE: bloccata — manca la chiave', { tipo: 'bloccata', motivo: 'manca la chiave', quando: q, dichiarato: true }, q)).toMatchObject({ tipo: 'bloccata', testo: 'manca la chiave' })
    expect(rapportoDiFineTurno('…', { tipo: 'aspetto', di: 'c-2', quando: q, dichiarato: false }, q)).toMatchObject({ tipo: 'serve', testo: 'aspetta la chat c-2', dichiarato: false })
    expect(rapportoDiFineTurno('…', undefined, q)).toBeUndefined()
  })

  it('su disco: si rilegge, una forma sconosciuta non c è, e resta sulla chat letta dall archivio', () => {
    const r = { tipo: 'passo', testo: 'ok', quando: iso(ORA), dichiarato: true }
    expect(leggiRapportoChat(r)).toEqual(r)
    expect(leggiRapportoChat({ tipo: 'boh', testo: 'x', quando: iso(ORA) })).toBeUndefined()
    const arch = apriArchivio(mkdtempSync(join(tmpdir(), 'ap-rapporto-disco-')))
    arch.scrivi(autopilota({ id: 'ap-a', chats: [chat('c-1', { rapporto: r as never }), chat('c-2', { rapporto: { tipo: 'boh' } as never })] }))
    expect(arch.leggi('ap-a')?.chats[0]?.rapporto).toEqual(r)
    expect(arch.leggi('ap-a')?.chats[1]?.rapporto).toBeUndefined()
  })
})

describe('dalla trascrizione', () => {
  it('il rapporto più recente fra i messaggi della chat, non gli esempi della regola nelle istruzioni', () => {
    const righe = [
      riga('user', REGOLA_RAPPORTO.join('\n')),
      riga('assistant', 'RAPPORTO: piano — tre passi'),
      JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', content: 'ok' }] } }),
      riga('assistant', 'Fatto il primo.\nRAPPORTO: passo fatto — test scritto'),
      riga('user', 'RAPPORTO: finita — esempio copiato'),
      '{"riga a metà'
    ]
    expect(ultimoRapportoDa(righe)).toMatchObject({ tipo: 'passo', testo: 'test scritto' })
    expect(ultimoRapportoDa([riga('user', REGOLA_RAPPORTO.join('\n'))])).toBeUndefined()
  })
})

describe('le istruzioni', () => {
  it('ogni chat governata riceve la regola del rapporto prima di quella del segnale; la Revisione no', () => {
    const a = autopilota({ id: 'ap-a' })
    const righe = regoleDiConsegna(a, chat('c-1'))
    const iR = righe.findIndex((r) => r.startsWith('A ogni passo scrivi all’autopilota un rapporto breve'))
    const iS = righe.findIndex((r) => r.startsWith('Chiudi ogni turno'))
    expect(iR).toBeGreaterThan(-1)
    expect(iS).toBeGreaterThan(iR)
    expect(righe.join('\n')).toContain('Fermarsi senza motivo non è ammesso')
    expect(regoleDiConsegna(a, chat('c-2', { ruolo: 'revisione' })).join('\n')).not.toContain('RAPPORTO:')
  })

  it('la chat muta si richiama con «dimmi il punto» e un RAPPORTO', () => {
    const a = autopilota({ id: 'ap-a' })
    const t = testoRipresa(a, chat('c-1', { ultimeIstruzioni: 'fai X' }), 21 * 60_000)
    expect(t.startsWith('Dimmi il punto: da 21 minuti')).toBe(true)
    expect(t).toContain('RAPPORTO:')
    expect(t).toContain('fai X')
  })
})

describe('il quadro per chat', () => {
  const vero = { tipo: 'commit', quando: iso(ORA - 3 * 60_000) }

  it('compito, ultimo passo, ultimo segnale vero e da quanto; il motivo se è ferma', () => {
    const lavora = quadroDellaChat(chat('c-1', { rapporto: { tipo: 'passo', testo: 'scritto il test', quando: iso(ORA - 2 * 60_000), dichiarato: true } }), ORA, vero)
    expect(lavora).toEqual({ id: 'c-1', compito: 'il compito di c-1', passo: 'passo fatto: scritto il test (2 min fa)', vero: 'commit 3 min fa' })
    const bloccata = quadroDellaChat(chat('c-2', { rapporto: { tipo: 'bloccata', testo: 'gradle non parte', quando: iso(ORA), dichiarato: true } }), ORA)
    expect(bloccata.ferma).toBe('bloccata: gradle non parte')
    expect(bloccata.vero).toBe('nessuno ancora')
    expect(quadroDellaChat(chat('c-3', { stato: 'bloccata' }), ORA).ferma).toBe('aspetta una risposta di Nicholas')
    expect(quadroDellaChat(chat('c-4', { ripresa: { il: iso(ORA - 5 * 60_000), volte: 1 } }), ORA).ferma).toContain('dimmi il punto')
    expect(quadroDellaChat(chat('c-5', { ultimaAzione: 'ho unito il ramo' }), ORA).passo).toBe('a fine turno: ho unito il ramo')
    expect(quadroDellaChat(chat('c-6'), ORA).passo).toBe('non ha ancora riferito niente')
  })

  it('nel prompt delle risposte dalla scheda c è il quadro intero, non solo le ultime mosse', () => {
    const a = autopilota({
      id: 'ap-a',
      chats: [
        chat('c-1', { rapporto: { tipo: 'provo', testo: 'vitest tests/main', quando: iso(ORA), dichiarato: true } }),
        chat('c-2', { stato: 'pausa' }),
        chat('c-3', { stato: 'finita' })
      ]
    })
    const righe = righeQuadroChat({ ...a, segniVeri: { 'c-1': vero } }, ORA)
    expect(righe).toContain('## Le tue chat, una per una (il quadro intero)')
    expect(righe.find((r) => r.startsWith('- c-1'))).toBe('- c-1 — compito: il compito di c-1 · ultimo passo: prova: vitest tests/main (adesso) · ultimo segnale vero: commit 3 min fa')
    expect(righe.find((r) => r.startsWith('- c-2'))).toContain('ferma: in pausa per i limiti del piano')
    expect(righe).toContain('- Chiuse: 1.')
    const prompt = componiPromptDialogo(a, 'a che punto siamo?', { quadro: righe })
    expect(prompt).toContain('ultimo passo: prova: vitest tests/main')
    expect(prompt.indexOf('il quadro intero')).toBeLessThan(prompt.indexOf('## Ti scrive adesso'))
    // Senza il quadro dal servizio lo calcola lui, senza i segnali veri.
    expect(componiPromptDialogo(a, 'dove sei?')).toContain('## Le tue chat, una per una')
  })

  it('lo stesso quadro nel «?» dell indicatore (PC, pagina e app mostrano queste righe)', () => {
    const a = autopilota({ id: 'ap-a', chats: [chat('c-1', { ruolo: 'sviluppo', rapporto: { tipo: 'serve', testo: 'il sì di Nicholas', quando: iso(ORA - 60_000), dichiarato: true } })] })
    const ind = indicatoreDi({ ...a, segniVeri: { 'c-1': { tipo: 'test', quando: iso(ORA - 60_000) } } }, ORA)
    expect(ind.dettaglio[0]).toContain('test 1 min fa')
    expect(ind.dettaglio[0]).toContain('ultimo passo: le serve: il sì di Nicholas (1 min fa)')
    expect(ind.dettaglio[0]).toContain('ferma: le serve: il sì di Nicholas')
    expect(ind.aiuto).toContain('l’ultimo passo che la chat ha riferito')
  })
})

describe('il servizio salva l ultimo rapporto per chat', () => {
  let server: ServerAutopiloti | undefined
  let archivio: Archivio
  let porta = 0
  let ora = ORA
  afterEach(() => { server?.close(); server = undefined })

  async function ambiente(trascrizioni: Record<string, string[]>): Promise<void> {
    archivio = apriArchivio(mkdtempSync(join(tmpdir(), 'ap-rapporti-')))
    ora = ORA
    server = creaServer({
      archivio,
      esegui: () => Promise.resolve({ codice: 1, uscita: 'rosso' }),
      interroga: () => Promise.resolve({ testo: '{"azione": "prosegui", "istruzioni": "vai"}', sessionId: 'sup' }),
      avviaLavoro: () => Promise.resolve(),
      fermaLavoro: () => {},
      avvisa: () => Promise.resolve(),
      domande: creaRegistroDomande({ adesso: () => ora }),
      scadenzaDomandaMs: 5000,
      scadenzaInterviataMs: 5000,
      adesso: () => iso(ora),
      codaTrascrizione: (p) => trascrizioni[p]
    })
    const s = server
    await new Promise<void>((ris) => { s.listen(0, '127.0.0.1', () => { porta = (s.address() as { port: number }).port; ris() }) })
  }
  const passo = (chatId: string, transcript: string): Promise<Response> =>
    fetch(`http://127.0.0.1:${porta}/hook/rapporto?ap=ap-a&chat=${chatId}`, { method: 'POST', body: JSON.stringify({ hook_event_name: 'PostToolUse', transcript_path: transcript }) })
  const attendi = async (cond: () => boolean): Promise<void> => {
    for (let i = 0; i < 50 && !cond(); i += 1) await new Promise((r) => setTimeout(r, 10))
  }

  it('a ogni strumento usato: il rapporto nuovo va sulla chat e nel diario, uguale non si riscrive', async () => {
    const t = { '/t/c-1.jsonl': [riga('assistant', 'RAPPORTO: piano — test, correzione, commit')] }
    await ambiente(t)
    archivio.scrivi(autopilota({ id: 'ap-a', chats: [chat('c-1'), chat('c-2', { stato: 'finita' })] }))
    const r = await passo('c-1', '/t/c-1.jsonl')
    expect(r.status).toBe(200)
    await attendi(() => archivio.leggi('ap-a')?.chats[0]?.rapporto !== undefined)
    expect(archivio.leggi('ap-a')?.chats[0]?.rapporto).toMatchObject({ tipo: 'piano', testo: 'test, correzione, commit', dichiarato: true, quando: iso(ORA) })
    expect(archivio.leggi('ap-a')?.decisioni.at(-1)?.cosa).toBe('rapporto da c-1: piano: test, correzione, commit')

    // Lo stesso rapporto, letto di nuovo dopo la pausa: nessuna riga in più.
    ora = ORA + RILETTURA_RAPPORTO_MS
    const prima = archivio.leggi('ap-a')!.decisioni.length
    await passo('c-1', '/t/c-1.jsonl')
    await new Promise((r) => setTimeout(r, 30))
    expect(archivio.leggi('ap-a')!.decisioni.length).toBe(prima)

    // Un passo nuovo: si aggiorna.
    t['/t/c-1.jsonl'].push(riga('assistant', 'RAPPORTO: passo fatto — test scritto'))
    ora = ORA + 2 * RILETTURA_RAPPORTO_MS
    await passo('c-1', '/t/c-1.jsonl')
    await attendi(() => archivio.leggi('ap-a')?.chats[0]?.rapporto?.tipo === 'passo')
    expect(archivio.leggi('ap-a')?.chats[0]?.rapporto?.testo).toBe('test scritto')
  })

  it('non rilegge la trascrizione a ogni strumento, e non scrive su una chat chiusa o con un id sbagliato', async () => {
    let letture = 0
    const t: Record<string, string[]> = {}
    Object.defineProperty(t, '/t/x.jsonl', { get: () => { letture += 1; return [riga('assistant', 'RAPPORTO: provo — vitest')] }, enumerable: true })
    await ambiente(t)
    archivio.scrivi(autopilota({ id: 'ap-a', chats: [chat('c-1'), chat('c-2', { stato: 'finita' })] }))
    await passo('c-1', '/t/x.jsonl')
    await passo('c-1', '/t/x.jsonl')
    await passo('c-1', '/t/x.jsonl')
    await new Promise((r) => setTimeout(r, 30))
    expect(letture).toBe(1)
    await passo('c-2', '/t/x.jsonl')
    await passo('../x', '/t/x.jsonl')
    await new Promise((r) => setTimeout(r, 30))
    expect(archivio.leggi('ap-a')?.chats[1]?.rapporto).toBeUndefined()
  })
  it('a fine turno: la riga RAPPORTO del messaggio va sulla chat e nel diario', async () => {
    await ambiente({})
    archivio.scrivi(autopilota({ id: 'ap-a', chats: [chat('c-1'), chat('c-2')] }))
    const r = await fetch(`http://127.0.0.1:${porta}/hook/stop?ap=ap-a&chat=c-1`, {
      method: 'POST',
      body: JSON.stringify({ session_id: 's-c-1', stop_hook_active: false, hook_event_name: 'Stop', cwd: process.cwd(), transcript_path: 'x.jsonl', last_assistant_message: 'Pezzo chiuso.\nRAPPORTO: finita — commit 1a2b3c4, test verdi\nSEGNALE: fatto' })
    })
    expect(r.status).toBe(200)
    const c = archivio.leggi('ap-a')!.chats.find((x) => x.id === 'c-1')!
    expect(c.rapporto).toMatchObject({ tipo: 'finita', testo: 'commit 1a2b3c4, test verdi', dichiarato: true })
    expect(archivio.leggi('ap-a')!.decisioni.some((d) => d.cosa === 'rapporto da c-1: finita: commit 1a2b3c4, test verdi')).toBe(true)
  })
})
