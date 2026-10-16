import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Terminal } from '@xterm/headless'
import { creaServerClient } from '../../src/main/client-server'
import { rotteClient, type DipendenzeRotte, type Chat } from '../../src/main/client-rotte'
import { apriDispositivi } from '../../src/main/dispositivi'
import { creaGuardianoPin } from '../../src/main/pin-guardiano'
import { creaClientPcRemoto, ErroreRemoto } from '../../src/main/pc-remoto'
import { creaSottofondo, cancelliSottofondo, type TerminaleMuto } from '../../src/main/sottofondo'
import type { HostToCore } from '../../src/shared/protocol'
import type { StatoSottofondo } from '../../src/shared/sottofondo'
import type { BattitoPc } from '@shared/posta'

/**
 * Le chat in sottofondo sulle strade vere (0.58.4): il server del Client di
 * un PC di casa d'esempio, un altro PC che bussa con la firma di casa, uno
 * estraneo, il PIN, la casa e un PC vecchio. Il pty è finto e fa Claude Code.
 */
const K = 'chiave-di-casa-di-esempio'
const S_PROVA = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const S_PIN = 'aaaaaaaa-bbbb-4ccc-8ddd-ffffffffffff'
const S_FUORI = 'aaaaaaaa-bbbb-4ccc-8ddd-000000000000'
const CARTELLA = 'C:\\Prove\\sottofondo'

const server: Server[] = []
afterEach(() => { for (const s of server.splice(0)) s.close() })

async function casa(opz: { senzaSottofondo?: boolean } = {}) {
  const g = creaGuardianoPin({ leggi: () => undefined, scrivi: () => {}, passphraseGiusta: async () => false })
  await g.impostaPin('4821')
  g.proteggiChat(S_PIN, true)
  const ascolti = new Map<string, (m: HostToCore) => void>()
  const avviati: string[] = []
  const log: string[] = []
  let campo = ''
  const manda = (id: string, data: string): void => ascolti.get(id)?.({ id, kind: 'data', data })
  const sf = creaSottofondo({
    dati: mkdtempSync(join(tmpdir(), 'sd-sf-rotte-')),
    avviaPty: (r) => { avviati.push(r.sessionUuid); return `pty-${avviati.length}` },
    ascolta: (id, cb) => { ascolti.set(id, cb) },
    smetti: (id) => { ascolti.delete(id) },
    scrivi: (id, data) => {
      if (data === '\r') { if (campo !== '') { const t = campo; campo = ''; manda(id, `\x1b[2J\x1b[H❯ ${t}\r\n\r\n✻ Lavoro… (1s · thinking)\r\n❯ \r\n`) } } else {
        // L'eco nel campo, come Claude Code (0.75.4): l'Invio parte solo dopo.
        campo += data
        manda(id, `\x1b[2J\x1b[H Benvenuto\r\n\r\n❯ ${campo}\r\n  ? for shortcuts`)
      }
    },
    ferma: () => {},
    creaTerminale: (cols, rows) => new Terminal({ cols, rows, allowProposedApi: true }) as unknown as TerminaleMuto,
    log: (m) => { log.push(m) },
    timer: (f) => f()
  })
  const dispositivi = apriDispositivi(mkdtempSync(join(tmpdir(), 'sd-sf-disp-')))
  const avvia = cancelliSottofondo({
    sottofondo: () => sf,
    io: () => ({ id: 'pc-casa', nome: 'PORTATILE-ESEMPIO' }),
    nomePc: (id) => (id === 'pc-fisso' ? 'PC-ESEMPIO' : undefined),
    casaAltrove: (s) => (s === S_FUORI ? { nome: 'PC-ESEMPIO' } : undefined),
    esiste: (cwd) => cwd === CARTELLA,
    inRiquadro: () => undefined,
    scriviInRiquadro: () => {},
    log: (m) => { log.push(m) }
  })
  const rotte = rotteClient({
    dispositivi,
    chat: (): Chat[] => sf.chat(),
    autopiloti: async () => [],
    domande: async () => [],
    workspace: async () => ({ nomi: [], attivo: '' }),
    cartelle: async () => [CARTELLA],
    scriviAChat: (id: string, t: string) => { const s = sf.perId(id); if (s !== undefined) sf.scrivi(s, t, 'w-1', { id: '', nome: 'chi guarda' }) },
    righeDi: async (id: string, da: number, quante: number) => { const s = sf.perId(id); return s === undefined ? undefined : sf.righe(s, da, quante) },
    aggiornamento: () => ({ fase: 'fermo' }),
    pin: g,
    ...(opz.senzaSottofondo === true ? {} : { sottofondo: { avvia, stato: (s: string) => sf.stato(s) } })
  } as unknown as DipendenzeRotte)
  const s = creaServerClient({ dispositivi, chiaveDiCasa: () => K, rotta: (r) => rotte(r) })
  server.push(s)
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', () => r()))
  const porta = (s.address() as AddressInfo).port
  /** Claude Code finto: disegna il campo. */
  const disegna = (): void => { for (const id of ascolti.keys()) manda(id, '\x1b[2J\x1b[H Benvenuto\r\n\r\n❯ \r\n  ? for shortcuts') }
  return { porta, sf, avviati, log, disegna }
}
const pcCon = (porta: number, chiave: string): ReturnType<typeof creaClientPcRemoto> => {
  const b: BattitoPc = { pcId: 'casa', nome: 'PORTATILE-ESEMPIO', versione: '0.58.4', battito: new Date().toISOString(), cartelle: [], chat: [], indirizzi: ['127.0.0.1'], porta }
  return creaClientPcRemoto({ battiti: () => [b], chiavePer: () => chiave, mioNome: () => 'PC-ESEMPIO', mioId: () => 'pc-fisso' })
}
const attendi = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

describe('avviare in sottofondo da un altro PC della stessa casa', () => {
  it('parte senza finestre, compare fra le chat, e il testo in coda arriva appena è pronta', async () => {
    const c = await casa()
    const pc = pcCon(c.porta, K)
    const r = await pc.chiama('casa', '/api/sottofondo/avvia', { cartella: CARTELLA, sessione: S_PROVA, titolo: 'Prova', testo: 'ciao dal fisso', idMessaggio: 'm-1' }) as StatoSottofondo
    expect(r.fase).toBe('avvio')
    expect(r.perChi).toEqual({ id: 'pc-fisso', nome: 'PC-ESEMPIO' })
    expect(c.avviati).toEqual([S_PROVA])
    const stato = await pc.chiama('casa', '/api/stato') as { chat: { id: string; sessione?: string; sottofondo?: unknown }[] }
    expect(stato.chat.find((x) => x.sessione === S_PROVA)).toMatchObject({ id: `sf-${S_PROVA}`, sottofondo: { nome: 'PC-ESEMPIO' } })
    c.disegna()
    await attendi(30)
    await attendi(1600)
    c.sf.giro()
    await attendi(400)
    // L'Invio parte al giro dopo, quando il testo si vede nel campo (0.75.4).
    c.sf.giro()
    await attendi(30)
    // Lo schermo si legge come quello di ogni chat aperta.
    const storia = await pc.chiama('casa', '/api/storia', { chat: `sf-${S_PROVA}`, da: -1, quante: 20 }) as { righe: string[] }
    expect(storia.righe.join('\n')).toContain('ciao dal fisso')
    // Il controllo dopo l'invio: tre secondi (qui si finge il tempo passato).
    await attendi(3100)
    c.sf.giro()
    const st = await pc.chiama('casa', '/api/sottofondo/stato', { sessione: S_PROVA }) as StatoSottofondo
    expect(st.consegnati).toContain('m-1')
    expect(c.log.some((l) => l.includes('testo consegnato (m-1)'))).toBe(true)
  }, 15_000)

  it('un PC estraneo (chiave di casa sbagliata) non avvia niente', async () => {
    const c = await casa()
    const e = await pcCon(c.porta, 'chiave-di-un-altra-casa').chiama('casa', '/api/sottofondo/avvia', { cartella: CARTELLA, sessione: S_PROVA }).catch((x: unknown) => x)
    expect(e).toBeInstanceOf(ErroreRemoto)
    expect(c.avviati).toEqual([])
  })

  it('una chat protetta dal PIN: 423, niente avviato', async () => {
    const c = await casa()
    const e = await pcCon(c.porta, K).chiama('casa', '/api/sottofondo/avvia', { cartella: CARTELLA, sessione: S_PIN, testo: 'x', idMessaggio: 'm-2' }).catch((x: unknown) => x as ErroreRemoto)
    expect((e as ErroreRemoto).motivo).toBe('pin')
    expect(c.avviati).toEqual([])
  })

  it('una chat che ha casa altrove, o una cartella che non c’è: rifiutata con il perché', async () => {
    const c = await casa()
    const pc = pcCon(c.porta, K)
    const e1 = await pc.chiama('casa', '/api/sottofondo/avvia', { cartella: CARTELLA, sessione: S_FUORI }).catch((x: unknown) => x as ErroreRemoto)
    expect((e1 as ErroreRemoto).message).toContain('la casa di questa chat è PC-ESEMPIO')
    const e2 = await pc.chiama('casa', '/api/sottofondo/avvia', { cartella: 'C:\\Windows', sessione: S_PROVA }).catch((x: unknown) => x as ErroreRemoto)
    expect((e2 as ErroreRemoto).stato).toBe(403)
    expect(c.avviati).toEqual([])
  })

  it('un testo senza il suo id non passa (non si potrebbe evitare il doppione)', async () => {
    const c = await casa()
    const e = await pcCon(c.porta, K).chiama('casa', '/api/sottofondo/avvia', { cartella: CARTELLA, sessione: S_PROVA, testo: 'x' }).catch((x: unknown) => x as ErroreRemoto)
    expect((e as ErroreRemoto).stato).toBe(400)
  })

  it('un PC che non lo sa fare lo dice: va aggiornato alla 0.58.4', async () => {
    const c = await casa({ senzaSottofondo: true })
    const e = await pcCon(c.porta, K).chiama('casa', '/api/sottofondo/avvia', { cartella: CARTELLA, sessione: S_PROVA }).catch((x: unknown) => x as ErroreRemoto)
    expect((e as ErroreRemoto).message).toContain('va aggiornato alla 0.58.4')
  })
})
