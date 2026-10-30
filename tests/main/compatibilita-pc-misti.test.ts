import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { creaClientPcRemoto } from '../../src/main/pc-remoto'
import { provaCasa } from '../../src/main/casa-firma'
import { rotteClient, rotteLibere, type DipendenzeRotte } from '../../src/main/client-rotte'
import { apriDispositivi } from '../../src/main/dispositivi'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { nuovoAutopilota } from '@shared/autopilota'
import type { BattitoPc } from '@shared/posta'
import { pcVivo } from '@shared/posta'
import { nomeDaMostrare } from '@shared/nome-pc'
import { suAltriPc } from '@shared/workspace-riparazioni'

/**
 * 0.74.1, compatibilità mista. Nicholas, 15/10: «un PC alla 0.74.0 e altri
 * alla 0.73.x o 0.69.0 devono continuare a vedersi, aprire chat remote e
 * consegnare».
 *
 * `tests/fixtures/pc-misti/<versione>/`:
 * - `battito.json`: il battito **vero** che quel PC ha lasciato sul Drive
 *   (letto in sola lettura da `pc-altrui.json`), reso anonimo con le stesse
 *   chiavi e gli stessi tipi (note/compat/anonimizza.mjs);
 * - le altre: le risposte **vere** delle rotte di quella versione, generate
 *   dal suo tag (worktree, bundle esbuild della sua `client-rotte`, chiamate
 *   davvero: note/compat/genera.mjs).
 */
const VECCHIE = ['0.69.0', '0.73.0'] as const
const leggi = (v: string, f: string): unknown => JSON.parse(readFileSync(join('tests', 'fixtures', 'pc-misti', v, `${f}.json`), 'utf8'))
const corpo = (v: string, f: string): unknown => (leggi(v, f) as { corpo: unknown }).corpo

describe.each(VECCHIE)('un PC alla %s visto da un PC alla 0.74', (v) => {
  const battito = leggi(v, 'battito') as BattitoPc

  it('si vede: il suo battito vero si legge, con il nome, i suoi workspace in «Su altri PC» e se è vivo', () => {
    expect(battito.versione).toBe(v)
    expect(nomeDaMostrare(battito)).toBe(`PC-VECCHIO-${v}`)
    expect(pcVivo(battito, Date.parse(battito.battito) + 60_000)).toBe(true)
    const altri = suAltriPc(['workspace-1'], [{ pc: battito.pcId, nome: nomeDaMostrare(battito), ...(battito.workspace !== undefined ? { workspace: battito.workspace } : {}) }])
    expect(altri).toHaveLength(1)
    expect(altri[0]!.workspace.length).toBe((battito.workspace ?? []).length - 1)
  })

  it('apre le sue chat (stato e storia veri) e consegna un messaggio', async () => {
    const chiamate: { url: string; corpo?: unknown }[] = []
    const b: BattitoPc = { ...battito, indirizzi: ['192.0.2.20'], porta: 47640 }
    const c = creaClientPcRemoto({
      battiti: () => [b],
      chiavePer: () => 'chiave-di-casa',
      mioNome: () => 'PC-ESEMPIO',
      bussaMs: 30,
      attesaMs: 30,
      fetch: (async (url: string, init?: { body?: string }) => {
        chiamate.push({ url, ...(init?.body !== undefined ? { corpo: JSON.parse(init.body) as unknown } : {}) })
        const ok = (x: unknown) => ({ status: 200, json: async () => x })
        if (url.includes('/api/casa')) return ok({ prova: provaCasa('chiave-di-casa', new URL(url).searchParams.get('sfida') ?? '') })
        const p = new URL(url).pathname
        if (p === '/api/pc') return ok(corpo(v, 'pc'))
        if (p === '/api/stato') return ok(corpo(v, 'stato'))
        if (p === '/api/storia') return ok(corpo(v, 'storia'))
        if (p === '/api/scrivi') return ok(corpo(v, 'scrivi'))
        return { status: 404, json: async () => ({ errore: 'rotta inattesa' }) }
      }) as unknown as typeof fetch
    })
    const stato = await c.chiama(b.pcId, '/api/stato') as { chat: { id: string; titolo: string; aspetta?: boolean }[] }
    expect(stato.chat.map((x) => x.id)).toEqual(['p-1', 'p-2'])
    expect(stato.chat[0]).toMatchObject({ titolo: 'Gestore', aspetta: true })
    const storia = await c.chiama(b.pcId, '/api/storia', { chat: 'p-1', quante: 50 }) as { righe: string[]; totale: number }
    expect(storia.righe).toContain('● Ho finito la parte uno.')
    expect(await c.chiama(b.pcId, '/api/scrivi', { chat: 'p-1', testo: 'ciao dal PC nuovo' })).toEqual({ fatto: true })
    expect(chiamate.find((x) => x.url.endsWith('/api/scrivi'))?.corpo).toEqual({ chat: 'p-1', testo: 'ciao dal PC nuovo' })
    expect(c.stradaDi(b.pcId)?.strada).toBe('lan')
  })
})

/** Ogni chiave (con il suo tipo JSON) della risposta vecchia c'è anche nella nuova: un PC vecchio trova quello che leggeva. */
function mancanti(vecchio: unknown, nuovo: unknown, dove = ''): string[] {
  const tipo = (x: unknown): string => (Array.isArray(x) ? 'array' : x === null ? 'null' : typeof x)
  if (tipo(vecchio) !== tipo(nuovo)) return [`${dove}: ${tipo(vecchio)} → ${tipo(nuovo)}`]
  if (Array.isArray(vecchio) && Array.isArray(nuovo)) return vecchio.flatMap((x, i) => (i < nuovo.length ? mancanti(x, nuovo[i], `${dove}[${i}]`) : [`${dove}[${i}] manca`]))
  if (tipo(vecchio) === 'object') {
    const n = nuovo as Record<string, unknown>
    return Object.entries(vecchio as Record<string, unknown>).flatMap(([k, x]) => (k in n ? mancanti(x, n[k], `${dove}.${k}`) : [`${dove}.${k} manca`]))
  }
  return []
}

describe('un PC alla 0.74 visto dai PC vecchi', () => {
  // Le rotte di oggi con gli stessi dati con cui sono state generate le risposte vecchie.
  const SCHERMO = ['● Ho finito la parte uno.', '', '> ']
  const deps = (): DipendenzeRotte => ({
    dispositivi: apriDispositivi(mkdtempSync(join(tmpdir(), 'sd-misti-'))),
    chat: () => [
      { id: 'p-1', titolo: 'Gestore', cwd: 'C:/p', sessione: 's-1', workspace: 'lavoro', aspetta: true, governata: false, viva: true, ultimaRiga: '> ', coda: SCHERMO, codaGrezza: SCHERMO },
      { id: 'p-2', titolo: 'Sviluppo · Notte', cwd: 'C:/p.sierradeck-wt/ap-1-c-1', sessione: 's-2', workspace: 'lavoro', aspetta: false, governata: true, autopilota: { id: 'ap-1', chat: 'c-1' }, viva: true, coda: ['lavoro…'], codaGrezza: ['lavoro…'] }
    ],
    autopiloti: () => Promise.resolve([{ ...nuovoAutopilota({ id: 'ap-1', nome: 'Notte', obiettivo: 'Test', cwd: 'C:/p', iniziatoIl: '2026-08-12T10:00:00.000Z' }), stato: 'lavoro' as const }]),
    rispondi: () => Promise.resolve(), domande: () => Promise.resolve([]), scriviAChat: () => undefined, apriChat: () => undefined,
    cartelle: () => Promise.resolve(['C:/p']), workspace: () => Promise.resolve({ nomi: ['lavoro'], attivo: 'lavoro' }),
    cambiaWorkspace: () => Promise.resolve(), fermaAutopilota: () => Promise.resolve(), riprendiAutopilota: () => Promise.resolve(),
    vaiAutopilota: () => Promise.resolve(), creaAutopilota: () => Promise.resolve({ id: 'ap-9' }), eliminaAutopilota: () => Promise.resolve(),
    riprendiAlRiavvio: () => Promise.resolve(), chiudiChat: () => undefined, rinominaChat: () => undefined,
    sessioni: () => Promise.resolve([]), riprendiSessione: () => undefined, creaWorkspace: () => Promise.resolve(), eliminaWorkspace: () => Promise.resolve(),
    salvataggi: () => Promise.resolve([]), caricaIstantanea: () => Promise.resolve(), consumi: () => Promise.resolve({}),
    quaderno: () => [], scheda: () => undefined, impostaPreferenze: () => Promise.resolve(),
    aggiornamento: () => ({ fase: 'aggiornato' }), cercaAggiornamento: () => undefined, scaricaAggiornamento: () => undefined, installaAggiornamento: () => undefined,
    versione: '0.74.1', apk: () => Promise.resolve(undefined)
  } as unknown as DipendenzeRotte)

  it.each(VECCHIE)('le risposte di oggi contengono tutto quello che leggeva un PC alla %s', async (v) => {
    const r = rotteClient(deps())
    const oggi = {
      ciao: (await rotteLibere(deps())({ metodo: 'GET', percorso: '/api/ciao', corpo: undefined })).corpo,
      pc: (await r({ metodo: 'GET', percorso: '/api/pc', corpo: undefined })).corpo,
      stato: (await r({ metodo: 'GET', percorso: '/api/stato', corpo: undefined })).corpo,
      storia: (await r({ metodo: 'POST', percorso: '/api/storia', corpo: { chat: 'p-1', quante: 50 } })).corpo,
      scrivi: (await r({ metodo: 'POST', percorso: '/api/scrivi', corpo: { chat: 'p-1', testo: 'ciao dal PC nuovo' } })).corpo
    }
    for (const [rotta, nuovo] of Object.entries(oggi)) {
      // La versione nel saluto cambia per forza; il resto deve esserci tutto.
      const vecchio = corpo(v, rotta) as Record<string, unknown>
      const senzaVersione = rotta === 'ciao' ? { ...vecchio, versione: '0.74.1' } : vecchio
      expect(mancanti(senzaVersione, nuovo, rotta)).toEqual([])
    }
  })
})
