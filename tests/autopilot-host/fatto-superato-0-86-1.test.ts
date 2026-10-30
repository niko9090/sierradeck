import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { creaServer, type ServerAutopiloti } from '../../src/autopilot-host/server'
import { apriArchivio, type Archivio } from '../../src/autopilot-host/archivio'
import { creaRegistroDomande } from '../../src/autopilot-host/domande'
import { lavoroCompiuto, messaggiDaConsegnare } from '../../src/autopilot-host/rete-sicurezza'
import { pezzoFinito } from '../../src/autopilot-host/posti'
import type { Git } from '../../src/autopilot-host/worktree'
import { nuovoAutopilota, type Autopilota, type ChatGovernata } from '@shared/autopilota'
import { haDettoFatto, leggiSegnaleChat, segnaleSuperato } from '@shared/segnali-flotta'

/**
 * 0.86.1 — il «fatto» vecchio. Il segnale resta sulla chat finché non ne
 * arriva un altro: una chat che aveva detto «fatto» e poi aveva ricevuto
 * altro lavoro contava come finita, e l'autopilota finiva prima del tempo; la
 * chiusura del «pezzo finito» non guardava i messaggi in coda per la chat.
 */

const ORA = '2026-10-30T12:00:00.000Z'
const FATTO = { tipo: 'fatto' as const, quando: ORA, dichiarato: true }
const PASSATO = { descrizione: 'i test passano', comando: 'npm test', passato: true, uscita: 'ok' }

const chat = (id: string, over: Partial<ChatGovernata> = {}): ChatGovernata =>
  ({ id, compito: `compito di ${id}`, stato: 'lavoro', cicli: 5, sessionId: `s-${id}`, dal: '2026-10-30T09:00:00.000Z', ...over })

function flotta(cwd: string, chats: ChatGovernata[], over: Partial<Autopilota> = {}): Autopilota {
  return {
    ...nuovoAutopilota({ id: 'ap-30', nome: 'Rilascio 0.86.1', obiettivo: 'Chiudere la 0.86.1', cwd, criteri: [{ descrizione: 'i test passano', comando: 'npm test', soddisfatto: true, ultimaVerifica: { quando: ORA, codice: 0, uscita: 'ok' } }], iniziatoIl: '2026-10-30T08:00:00.000Z' }),
    stato: 'lavoro',
    ramoBase: 'main',
    chats,
    ...over
  }
}

describe('il «fatto» superato (puro)', () => {
  it('un «fatto» superato non vale; il segnale resta scritto e si rilegge dal disco', () => {
    const s = segnaleSuperato(FATTO, '2026-10-30T12:05:00.000Z')!
    expect(haDettoFatto({ segnale: FATTO })).toBe(true)
    expect(haDettoFatto({ segnale: s })).toBe(false)
    expect(s.tipo).toBe('fatto')
    expect(leggiSegnaleChat(JSON.parse(JSON.stringify(s)))).toEqual(s)
    // Un altro segnale non si tocca.
    const avanti = { tipo: 'avanti' as const, quando: ORA, dichiarato: true }
    expect(segnaleSuperato(avanti, ORA)).toBe(avanti)
    expect(pezzoFinito(chat('c-1', { segnale: s }), 'unito')).toBeUndefined()
  })

  it('lavoroCompiuto: no con un «fatto» superato, un messaggio in coda per una chat viva, una domanda aperta', () => {
    const fatti = { ramiAperti: 0 }
    const tutteFatte = flotta('C:/p', [chat('c-1', { segnale: FATTO }), chat('c-2', { segnale: FATTO })])
    expect(lavoroCompiuto(tutteFatte, [PASSATO], fatti)).toBe(true)
    const c2Superata = flotta('C:/p', [chat('c-1', { segnale: FATTO }), chat('c-2', { segnale: segnaleSuperato(FATTO, ORA)! })])
    expect(lavoroCompiuto(c2Superata, [PASSATO], fatti)).toBe(false)
    const conMessaggio = { ...tutteFatte, daConsegnare: [{ id: 'm-1', quando: ORA, testo: 'ancora una cosa', chats: ['c-2'] }] }
    expect(messaggiDaConsegnare(conMessaggio)).toBe(1)
    expect(lavoroCompiuto(conMessaggio, [PASSATO], fatti)).toBe(false)
    // Un messaggio per una chat già finita non arriverà mai: non tiene aperto il lavoro.
    const perUnaFinita = { ...flotta('C:/p', [chat('c-1', { segnale: FATTO }), chat('c-9', { stato: 'finita' })]), daConsegnare: [{ id: 'm-2', quando: ORA, testo: 'x', chats: ['c-9'] }] }
    expect(lavoroCompiuto(perUnaFinita, [PASSATO], fatti)).toBe(true)
    expect(lavoroCompiuto(tutteFatte, [PASSATO], { ...fatti, domandeAperte: 1 })).toBe(false)
  })
})

// ── Il servizio, con un git finto: i rami uniti o no ──

type Rami = Map<string, { unito: boolean }>
function gitDi(rami: Rami): Git {
  return (args, cwd) => {
    const a = args.join(' ')
    if (a === 'rev-parse --show-toplevel') return { codice: 0, uscita: cwd }
    if (a === 'rev-parse --abbrev-ref HEAD') return { codice: 0, uscita: 'main' }
    if (a === 'rev-parse HEAD') return { codice: 0, uscita: 'aaa111' }
    const verifica = /^rev-parse --verify --quiet refs\/heads\/(.+)$/.exec(a)
    if (verifica !== null) return { codice: verifica[1] === 'main' || rami.has(verifica[1]!) ? 0 : 1, uscita: '' }
    const antenato = /^merge-base --is-ancestor (?:refs\/heads\/)?(\S+) (?:refs\/heads\/)?main$/.exec(a)
    if (antenato !== null) return { codice: rami.get(antenato[1]!)?.unito === true ? 0 : 1, uscita: '' }
    if (a.startsWith('merge-tree')) return { codice: 1, uscita: '' }
    return { codice: 0, uscita: '' }
  }
}

let server: ServerAutopiloti | undefined
let archivio: Archivio
let porta = 0
let interrogazioni: string[] = []
let avvisi: string[] = []
let orologio = ORA
afterEach(() => { server?.close(); server = undefined })

async function ambiente(git: Git): Promise<void> {
  archivio = apriArchivio(mkdtempSync(join(tmpdir(), 'ap-fatto-superato-')))
  interrogazioni = []
  avvisi = []
  orologio = ORA
  server = creaServer({
    archivio,
    esegui: () => Promise.resolve({ codice: 0, uscita: 'ok' }),
    interroga: (prompt) => { interrogazioni.push(prompt); return Promise.resolve({ testo: '{"azione": "prosegui", "istruzioni": "Aggiungi il test della coda vuota."}' }) },
    avviaLavoro: () => Promise.resolve(),
    fermaLavoro: () => {},
    avvisa: (tipo) => { avvisi.push(tipo); return Promise.resolve() },
    domande: creaRegistroDomande({ adesso: () => Date.parse(ORA) }),
    scadenzaDomandaMs: 5000,
    scadenzaInterviataMs: 5000,
    adesso: () => orologio,
    statoVero: () => Promise.resolve({ chat: [], ramoUnito: () => undefined, releasePubblicate: ['0.86.1'] }),
    git
  })
  const s = server
  await new Promise<void>((ris) => { s.listen(0, '127.0.0.1', () => { porta = (s.address() as { port: number }).port; ris() }) })
}

async function fermata(chatId: string, testo: string): Promise<any> {
  const r = await fetch(`http://127.0.0.1:${porta}/hook/stop?ap=ap-30&chat=${chatId}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: `s-${chatId}`, stop_hook_active: false, last_assistant_message: testo, hook_event_name: 'Stop' })
  })
  const t = await r.text()
  return t === '' ? undefined : JSON.parse(t)
}

describe('il servizio: un «fatto» seguito da altro lavoro non chiude niente', () => {
  it('c-2 dice «fatto» e riceve altro lavoro; c-1 chiude il suo pezzo: l’autopilota NON finisce', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'ap-fatto-c2-'))
    writeFileSync(join(cwd, 'package.json'), JSON.stringify({ name: 'progetto', version: '0.86.1' }))
    await ambiente(gitDi(new Map([['ap/ap-30/c-1', { unito: true }], ['ap/ap-30/c-2', { unito: true }]])))
    // c-2 è la chat dell'ultimo giro (approvata, rimessa al lavoro): il suo «fatto» non la chiude da solo.
    archivio.scrivi(flotta(cwd, [chat('c-1', { ramo: 'ap/ap-30/c-1' }), chat('c-2', { ramo: 'ap/ap-30/c-2', approvata: true })]))

    // 1. c-2 dice «fatto»; il supervisore le dà altro da fare.
    const r2 = await fermata('c-2', 'Ho finito la mia parte.\nSEGNALE: fatto — parte mia chiusa')
    expect(r2.decision).toBe('block')
    expect(r2.reason).toContain('Aggiungi il test della coda vuota')
    const c2 = archivio.leggi('ap-30')!.chats.find((x) => x.id === 'c-2')!
    expect(c2.segnale?.tipo).toBe('fatto')
    expect(c2.segnale?.superatoIl).toBeDefined()

    // 2. c-1 chiude il suo pezzo, con il ramo già unito: si chiude lei, non l'autopilota.
    orologio = '2026-10-30T12:10:00.000Z'
    const r1 = await fermata('c-1', 'Fatto.\nSEGNALE: fatto — test scritti')
    expect(r1).toEqual({})
    const a = archivio.leggi('ap-30')!
    expect(a.chats.find((x) => x.id === 'c-1')!.stato).toBe('finita')
    expect(a.stato).toBe('lavoro')
    expect(avvisi).not.toContain('finito')
    // Il «fatto» detto dopo il lavoro nuovo, invece, vale.
    const c2Dopo = { ...a.chats.find((x) => x.id === 'c-2')!, segnale: { ...FATTO, quando: '2026-10-30T12:20:00.000Z' } }
    expect(lavoroCompiuto({ ...a, chats: a.chats.map((x) => (x.id === 'c-2' ? c2Dopo : x)) }, [PASSATO], { ramiAperti: 0 })).toBe(true)
  })

  it('un messaggio in coda per la chat che dice «fatto»: le arriva, e la chat non si chiude', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'ap-fatto-msg-'))
    await ambiente(gitDi(new Map([['ap/ap-30/c-1', { unito: true }]])))
    archivio.scrivi(flotta(cwd, [chat('c-1', { ramo: 'ap/ap-30/c-1' }), chat('c-2')], {
      daConsegnare: [{ id: 'm-1', quando: ORA, testo: 'Nicholas: aggiungi anche la riga nel registro', chats: ['c-1'] }]
    }))
    const r = await fermata('c-1', 'Fatto il mio pezzo.\nSEGNALE: fatto — pezzo finito')
    expect(r.decision).toBe('block')
    expect(r.reason).toContain('aggiungi anche la riga nel registro')
    const a = archivio.leggi('ap-30')!
    expect(a.chats.find((x) => x.id === 'c-1')!.stato).toBe('lavoro')
    expect(a.daConsegnare.some((m) => m.id === 'm-1')).toBe(false)
    expect(a.decisioni.some((d) => d.cosa.includes('chiudo la chat c-1'))).toBe(false)
  })
})
