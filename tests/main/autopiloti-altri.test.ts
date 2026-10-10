import { describe, it, expect, afterEach } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { creaServerClient } from '../../src/main/client-server'
import { rotteClient, type DipendenzeRotte } from '../../src/main/client-rotte'
import { apriDispositivi } from '../../src/main/dispositivi'
import { creaClientPcRemoto, ErroreRemoto } from '../../src/main/pc-remoto'
import { autopilotiDaStato, erroreAltroPc, giraSu, rottaAutopilotaAltroPc, type AutopilotiDiPc } from '../../src/shared/autopiloti-altri'
import type { BattitoPc } from '@shared/posta'
import { nuovoAutopilota } from '@shared/autopilota'

/**
 * Gli autopiloti degli altri PC (0.59.0) sulle strade vere: un portatile
 * d'esempio con un autopilota di prova, questo PC che lo legge e lo governa
 * con la firma di casa, un estraneo rifiutato. Nessun dato vero.
 */
const K = 'chiave-di-casa-di-esempio'
const AP = { ...nuovoAutopilota({ id: 'ap-prova', nome: 'Autopilota di prova', obiettivo: 'una prova', cwd: 'C:\\Prove\\ap', criteri: [{ descrizione: 'i test passano', soddisfatto: false }], iniziatoIl: '2026-10-10T20:00:00.000Z' }), stato: 'lavoro' as const }

const server: Server[] = []
afterEach(() => { for (const s of server.splice(0)) s.close() })

async function portatile() {
  const fatti: string[] = []
  const dispositivi = apriDispositivi(mkdtempSync(join(tmpdir(), 'sd-ap-altri-')))
  const rotte = rotteClient({
    dispositivi,
    chat: () => [],
    autopiloti: async () => [AP],
    domande: async () => [{ id: 'd-1', autopilotaId: 'ap-prova', testo: 'Posso pubblicare?' }],
    workspace: async () => ({ nomi: [], attivo: '' }),
    rispondi: async (id: string, r: string) => { fatti.push(`rispondi:${id}:${r}`) },
    dialogaAutopilota: async (id: string, t: string) => { fatti.push(`dialogo:${id}:${t}`); return { ricevuto: true } },
    fermaAutopilota: async (id: string) => { fatti.push(`ferma:${id}`) },
    riprendiAutopilota: async (id: string) => { fatti.push(`riprendi:${id}`) },
    aggiornamento: () => ({ fase: 'fermo' })
  } as unknown as DipendenzeRotte)
  const s = creaServerClient({ dispositivi, chiaveDiCasa: () => K, rotta: (r) => rotte(r) })
  server.push(s)
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', () => r()))
  return { porta: (s.address() as AddressInfo).port, fatti }
}
const questoPc = (porta: number, chiave: string) => {
  const b: BattitoPc = { pcId: 'lap', nome: 'PORTATILE-ESEMPIO', versione: '0.59.0', battito: new Date().toISOString(), cartelle: [], chat: [], indirizzi: ['127.0.0.1'], porta }
  return creaClientPcRemoto({ battiti: () => [b], chiavePer: () => chiave, mioNome: () => 'PC-ESEMPIO', mioId: () => 'fisso' })
}

describe('un autopilota che gira sul portatile, governato da questo PC', () => {
  it('si legge con la firma di casa: elenco e scheda (stato, criteri, chat, domande)', async () => {
    const p = await portatile()
    const pc = questoPc(p.porta, K)
    const elenco = autopilotiDaStato(await pc.chiama('lap', '/api/stato'))
    expect(elenco.map((a) => a.id)).toEqual(['ap-prova'])
    const scheda = await pc.chiama('lap', '/api/autopilota', { autopilota: 'ap-prova' }) as Record<string, unknown>
    expect(scheda).toMatchObject({ id: 'ap-prova', stato: 'lavoro', domandaId: 'd-1' })
    expect(Array.isArray(scheda.chat)).toBe(true)
    expect(Array.isArray(scheda.domandeScheda)).toBe(true)
  })
  it('scrivergli, rispondere, fermarlo e farlo riprendere arrivano al portatile', async () => {
    const p = await portatile()
    const pc = questoPc(p.porta, K)
    for (const [percorso, corpo] of [
      ['/api/autopilota/dialogo', { autopilota: 'ap-prova', testo: 'com’è messo?' }],
      ['/api/rispondi', { domanda: 'd-1', risposta: 'sì' }],
      ['/api/autopilota/ferma', { autopilota: 'ap-prova' }],
      ['/api/autopilota/riprendi', { autopilota: 'ap-prova' }]
    ] as const) {
      expect(rottaAutopilotaAltroPc(percorso)).toBe(true)
      await pc.chiama('lap', percorso, corpo)
    }
    expect(p.fatti).toEqual(['dialogo:ap-prova:com’è messo?', 'rispondi:d-1:sì', 'ferma:ap-prova', 'riprendi:ap-prova'])
  })
  it('un PC con un’altra chiave di casa non legge e non comanda niente', async () => {
    const p = await portatile()
    const e = await questoPc(p.porta, 'un-altra-casa').chiama('lap', '/api/autopilota/ferma', { autopilota: 'ap-prova' }).catch((x: unknown) => x)
    expect(e).toBeInstanceOf(ErroreRemoto)
    expect(p.fatti).toEqual([])
  })
  it('eliminare non è un’azione da un altro PC', () => {
    expect(rottaAutopilotaAltroPc('/api/autopilota/elimina')).toBe(false)
  })
})

describe('quando quel PC non risponde', () => {
  it('il perché, con le strade provate e cosa succede', () => {
    const t = erroreAltroPc('PORTATILE-ESEMPIO', 'Non risponde a nessun indirizzo.', ['192.0.2.10 (rete locale): nessuna risposta', '100.64.0.2 (Tailscale): nessuna risposta'])
    expect(t).toContain('PORTATILE-ESEMPIO non risponde')
    expect(t).toContain('la rete di casa, Tailscale')
    expect(t).toContain('WebRTC')
    expect(t).toContain('192.0.2.10 (rete locale): nessuna risposta')
    expect(t).toContain('continuano a lavorare là')
  })
})

describe('la rotta dell’elenco per la pagina e l’app', () => {
  const esempio: AutopilotiDiPc[] = [
    { pcId: 'pc-port', nome: 'PORTATILE-ESEMPIO', strada: 'lan', autopiloti: [{ id: 'ap-prova', nome: 'Autopilota di prova', stato: 'attesa', led: 'ambra', cicli: 3, strategia: '', motivo: 'aspetta te', cwd: 'C:\\Prove\\ap', fatti: 1, criteri: 3 }] },
    { pcId: 'pc-vecchio', nome: 'PC-VECCHIO', autopiloti: [], errore: erroreAltroPc('PC-VECCHIO', 'Non risponde', []), motivo: 'irraggiungibile' }
  ]
  it('risponde al telefono, non a un altro PC', async () => {
    const r = rotteClient({ autopilotiAltri: async () => esempio } as unknown as DipendenzeRotte)
    expect((await r({ metodo: 'GET', percorso: '/api/autopiloti/altri', corpo: undefined, dispositivo: 'tel-1' })).corpo).toEqual({ pc: esempio })
    expect((await r({ metodo: 'GET', percorso: '/api/autopiloti/altri', corpo: undefined, dispositivo: 'pc:altro' })).stato).toBe(403)
  })
  it('la risposta è quella che l’app si aspetta (resources/autopiloti-altri)', () => {
    const file = join('android', 'app', 'src', 'test', 'resources', 'autopiloti-altri', 'altri-0.59.json')
    if (process.env.AGGIORNA === '1' || !existsSync(file)) { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, JSON.stringify({ pc: esempio }, null, 2) + '\n') }
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ pc: esempio })
    expect(giraSu('PORTATILE-ESEMPIO')).toBe('gira su PORTATILE-ESEMPIO')
  })
})
