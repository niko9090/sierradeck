import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { creaServerClient } from '../../src/main/client-server'
import { rotteClient, type DipendenzeRotte, type Chat } from '../../src/main/client-rotte'
import { apriDispositivi } from '../../src/main/dispositivi'
import { creaGuardianoPin } from '../../src/main/pin-guardiano'
import { creaClientPcRemoto, ErroreRemoto } from '../../src/main/pc-remoto'
import type { BattitoPc } from '@shared/posta'

/**
 * 0.49.0: il PIN delle chat sulle strade. Una chat protetta risponde 423 e
 * niente contenuto a chi non l'ha sbloccata — da un altro PC con la firma di
 * casa valida, dal telefono, dal ponte — e negli elenchi resta il nome senza
 * anteprime. La verifica la fa il PC di casa della chat.
 */
const K = 'chiave-di-casa-del-portatile'
const SEGRETO = 'il fatturato di Rossi è 120.000'
const CHAT: Chat[] = [
  { id: 'p-1', titolo: 'Clienti', cwd: 'C:\\clienti', sessione: 's-clienti', ultimaRiga: SEGRETO, coda: [SEGRETO], codaGrezza: [SEGRETO] },
  { id: 'p-2', titolo: 'Libera', cwd: 'C:\\libera', sessione: 's-libera', ultimaRiga: 'niente di segreto', coda: ['ok'], codaGrezza: ['ok'] }
]

const server: Server[] = []
afterEach(() => { for (const s of server.splice(0)) s.close() })

async function portatile(): Promise<{ porta: number; scritti: string[]; chiaveTelefono: string }> {
  const g = creaGuardianoPin({ leggi: () => undefined, scrivi: () => {}, passphraseGiusta: async () => false })
  await g.impostaPin('4821')
  g.proteggiChat('s-clienti', true)
  const scritti: string[] = []
  const dispositivi = apriDispositivi(mkdtempSync(join(tmpdir(), 'sd-pin-')))
  const rotte = rotteClient({
    dispositivi,
    chat: () => CHAT,
    autopiloti: async () => [],
    domande: async () => [],
    workspace: async () => ({ nomi: [], attivo: '' }),
    scriviAChat: (id: string, t: string) => { scritti.push(`${id}:${t}`) },
    righeDi: async () => ({ totale: 1, da: 0, pulite: [SEGRETO], grezze: [SEGRETO] }),
    aggiornamento: () => ({ fase: 'fermo' }),
    pin: g
  } as unknown as DipendenzeRotte)
  const s = creaServerClient({ dispositivi, chiaveDiCasa: () => K, rotta: (r) => rotte(r) })
  server.push(s)
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', () => r()))
  const t = dispositivi.accoppia(dispositivi.apriAccoppiamento().codice, 'telefono')
  return { porta: (s.address() as AddressInfo).port, scritti, chiaveTelefono: t?.chiave ?? '' }
}
/** Un altro PC: `io` è il suo id (0.49.1); senza, è un PC prima della 0.49.1 che non dice chi è. */
const altroPc = (porta: number, io: string | null = 'fisso'): ReturnType<typeof creaClientPcRemoto> => {
  const b: BattitoPc = { pcId: 'lap', nome: 'LAPTOP', versione: '0.49.1', battito: new Date().toISOString(), cartelle: [], chat: [], indirizzi: ['127.0.0.1'], porta }
  return creaClientPcRemoto({ battiti: () => [b], chiavePer: () => K, mioNome: () => io ?? 'VECCHIO', ...(io !== null ? { mioId: () => io } : {}) })
}

describe('un altro PC con la firma di casa valida, ma senza il PIN', () => {
  it('storia e scrittura: 423, niente contenuto, niente scritto; nell’elenco il nome senza anteprima', async () => {
    const { porta, scritti } = await portatile()
    const pc = altroPc(porta)
    const e = await pc.chiama('lap', '/api/storia', { chat: 'p-1', da: -1, quante: 50 }).catch((x: unknown) => x as ErroreRemoto)
    expect(e).toBeInstanceOf(ErroreRemoto)
    expect((e as ErroreRemoto).motivo).toBe('pin')
    expect(JSON.stringify(e)).not.toContain('Rossi')
    expect((e as ErroreRemoto).message).not.toContain('Rossi')
    expect(((await pc.chiama('lap', '/api/scrivi', { chat: 'p-1', testo: 'cancella tutto' }).catch((x: unknown) => x)) as ErroreRemoto).motivo).toBe('pin')
    expect(scritti).toEqual([])
    const stato = await pc.chiama('lap', '/api/stato') as { chat: Record<string, unknown>[] }
    expect(JSON.stringify(stato)).not.toContain('Rossi')
    expect(stato.chat.find((c) => c.id === 'p-1')).toMatchObject({ titolo: 'Clienti', pin: 'chiusa' })
    // La chat libera resta come prima.
    expect(await pc.chiama('lap', '/api/storia', { chat: 'p-2', da: -1, quante: 50 })).toMatchObject({ chat: 'p-2' })
  })
  it('con il PIN giusto si apre per quel PC (non per il telefono); il PIN sbagliato no', async () => {
    const { porta, chiaveTelefono } = await portatile()
    const pc = altroPc(porta)
    expect(((await pc.chiama('lap', '/api/pin/sblocca', { chat: 'p-1', pin: '0000' }).catch((x: unknown) => x)) as ErroreRemoto).stato).toBe(403)
    expect(await pc.chiama('lap', '/api/pin/sblocca', { chat: 'p-1', pin: '4821' })).toEqual({ fatto: true })
    expect(JSON.stringify(await pc.chiama('lap', '/api/storia', { chat: 'p-1', da: -1, quante: 50 }))).toContain('Rossi')
    const tel = await fetch(`http://127.0.0.1:${porta}/api/storia`, { method: 'POST', headers: { 'x-sierradeck-chiave': chiaveTelefono }, body: JSON.stringify({ chat: 'p-1' }) })
    expect(tel.status).toBe(423)
    expect(await tel.text()).not.toContain('Rossi')
  })
  it('dal telefono, dopo tre PIN sbagliati si aspetta (429) anche con quello giusto', async () => {
    const { porta, chiaveTelefono } = await portatile()
    const prova = async (pin: string): Promise<number> => (await fetch(`http://127.0.0.1:${porta}/api/pin/sblocca`, {
      method: 'POST', headers: { 'x-sierradeck-chiave': chiaveTelefono }, body: JSON.stringify({ chat: 'p-1', pin })
    })).status
    expect([await prova('1'), await prova('2'), await prova('3')]).toEqual([403, 403, 429])
    expect(await prova('4821')).toBe(429)
  })
})

describe('lo sblocco vale per chi guarda (0.49.1)', () => {
  it('il PC A sblocca: il PC B e il telefono che passa dal ponte di A ricevono ancora il rifiuto', async () => {
    const { porta } = await portatile()
    const a = altroPc(porta, 'pc-a')
    const b = altroPc(porta, 'pc-b')
    expect(await a.chiama('lap', '/api/pin/sblocca', { chat: 'p-1', pin: '4821' })).toEqual({ fatto: true })
    expect(JSON.stringify(await a.chiama('lap', '/api/storia', { chat: 'p-1', da: -1, quante: 50 }))).toContain('Rossi')
    expect(((await b.chiama('lap', '/api/storia', { chat: 'p-1', da: -1, quante: 50 }).catch((x: unknown) => x)) as ErroreRemoto).motivo).toBe('pin')
    // Il telefono che passa dal ponte di A: chi guarda è lui, non A.
    expect(((await a.chiama('lap', '/api/storia', { chat: 'p-1', da: -1, quante: 50 }, 'tel:t1@pc-a').catch((x: unknown) => x)) as ErroreRemoto).motivo).toBe('pin')
    expect(((await b.chiama('lap', '/api/scrivi', { chat: 'p-1', testo: 'x' }).catch((x: unknown) => x)) as ErroreRemoto).motivo).toBe('pin')
  })
  it('un PC che non dice chi è: il PIN giusto non resta aperto (e non apre per gli altri)', async () => {
    const { porta } = await portatile()
    const vecchio = altroPc(porta, null)
    expect(await vecchio.chiama('lap', '/api/pin/sblocca', { chat: 'p-1', pin: '4821' })).toEqual({ fatto: true })
    expect(((await vecchio.chiama('lap', '/api/storia', { chat: 'p-1', da: -1, quante: 50 }).catch((x: unknown) => x)) as ErroreRemoto).motivo).toBe('pin')
    expect(((await altroPc(porta, 'pc-b').chiama('lap', '/api/storia', { chat: 'p-1', da: -1, quante: 50 }).catch((x: unknown) => x)) as ErroreRemoto).motivo).toBe('pin')
  })
})
