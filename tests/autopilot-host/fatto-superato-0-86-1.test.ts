import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { creaServer, type ServerAutopiloti } from '../../src/autopilot-host/server'
import { unicoFinto } from '../setup/unico-finto'
import { apriArchivio, type Archivio } from '../../src/autopilot-host/archivio'
import { creaRegistroDomande } from '../../src/autopilot-host/domande'
import { pezzoFinito } from '../../src/autopilot-host/posti'
import type { Git } from '../../src/autopilot-host/worktree'
import { nuovoAutopilota, type Autopilota, type ChatGovernata } from '@shared/autopilota'
import { haDettoFatto, leggiSegnaleChat, segnaleSuperato } from '@shared/segnali-flotta'

/**
 * 0.86.1 — il «fatto» vecchio. Il segnale resta sulla chat finché non ne
 * arriva un altro: una chat che aveva detto «fatto» e poi aveva ricevuto
 * altro lavoro contava come finita; la chiusura del «pezzo finito» non
 * guardava i messaggi in coda per la chat.
 */

const ORA = '2026-10-30T12:00:00.000Z'
const FATTO = { tipo: 'fatto' as const, quando: ORA, dichiarato: true }

const chat = (id: string, over: Partial<ChatGovernata> = {}): ChatGovernata =>
  ({ id, compito: `compito di ${id}`, stato: 'lavoro', cicli: 5, sessionId: `s-${id}`, dal: '2026-10-30T09:00:00.000Z', ...over })

function flotta(cwd: string, chats: ChatGovernata[], over: Partial<Autopilota> = {}): Autopilota {
  return {
    ...nuovoAutopilota({ id: 'ap-30', nome: 'Rilascio 0.86.1', obiettivo: 'Chiudere la 0.86.1', cwd, iniziatoIl: '2026-10-30T08:00:00.000Z' }),
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
let avvisi: string[] = []
let orologio = ORA
afterEach(() => { server?.close(); server = undefined })

async function ambiente(git: Git): Promise<void> {
  archivio = apriArchivio(mkdtempSync(join(tmpdir(), 'ap-fatto-superato-')))
  avvisi = []
  orologio = ORA
  server = creaServer({
    ...unicoFinto(archivio),
    archivio,
    esegui: () => Promise.resolve({ codice: 0, uscita: 'ok' }),
    avviaLavoro: () => Promise.resolve(),
    avvisa: (tipo) => { avvisi.push(tipo); return Promise.resolve() },
    domande: creaRegistroDomande({ adesso: () => Date.parse(ORA) }),
    scadenzaDomandaMs: 5000,
    adesso: () => orologio,
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
