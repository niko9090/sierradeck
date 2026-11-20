import { describe, it, expect } from 'vitest'
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { creaClientPcRemoto } from '../../src/main/pc-remoto'
import { criticitaDi, giroControlloPc, testoRapporto, type SaluteDiPc } from '../../src/main/controllo-pc'
import { vistoConAiutante, vistoDelPc } from '@shared/stato-pc'
import { senzaAiutanti, type BattitoPc } from '@shared/posta'
import type { Salute } from '@shared/salute'

/**
 * k-163a: il controllo del 20/11 (09:44:41Z) da un PC con la 0.111.1 segnalava ancora
 * «non risponde» un PC dove gira solo l'Aiutante, vivo (battito 09:25, 19 minuti prima).
 * Qui lo stesso caso, con nomi e indirizzi finti.
 */
const ADESSO = Date.parse('2026-11-20T09:44:41.966Z')
const NOME = 'PC-Finto'
const BATTITO_SD = '2026-11-12T23:21:00.000Z'
const BATTITO_AI = '2026-11-20T09:25:25.931Z'

const sierraDeck = (host: string): BattitoPc => ({
  pcId: 'sd', nome: NOME, host, versione: '0.110.0', battito: BATTITO_SD, cartelle: [], chat: [], indirizzi: ['192.0.2.10'], porta: 47640
})
const aiutante = (host: string): BattitoPc => ({
  pcId: 'ai', nome: NOME, host, versione: '3.3.0', battito: BATTITO_AI, cartelle: [], chat: [], aiutante: true
})

/** Come `altriPcGlobale` e `leggiSalute` di index.ts: un PC per nome, con il battito più recente e il flag. */
async function giro(battiti: BattitoPc[]): Promise<{ criticita: number; rapporto: string; file: string[] }> {
  const radice = mkdtempSync(join(tmpdir(), 'k163a-'))
  const remoto = creaClientPcRemoto({
    battiti: () => battiti, chiavePer: () => 'chiave-di-casa', mioNome: () => 'PC-Qui', adesso: () => ADESSO,
    bussaMs: 20, attesaMs: 20, driveCollegato: () => true, altriIndirizzi: async () => ({}),
    fetch: ((_url: string, init?: { signal?: AbortSignal }) =>
      new Promise((_ok, ko) => init?.signal?.addEventListener('abort', () => ko(new Error('abort'))))) as unknown as typeof fetch
  })
  const visti = vistoConAiutante(battiti, (b) => b.battito)
  const altri = senzaAiutanti(battiti).map((b) => ({
    pcId: b.pcId, nome: b.nome,
    ...(visti.get(b.pcId) !== undefined ? { battito: visti.get(b.pcId) as string } : {}),
    ...(vistoDelPc(battiti, b.pcId, ADESSO).soloAiutante ? { soloAiutante: true } : {})
  }))
  // La salute di qui: la voce «non so se è acceso» che scrive il bussare, con il segno più recente.
  const stato = await remoto.chiama('sd', '/api/salute').catch((e: unknown) => e instanceof Error ? e.message : String(e))
  const saluteQui: Salute = {
    scritto: new Date(ADESSO).toISOString(), tono: 'attenzione', riassunto: 'un PC non si raggiunge',
    voci: [{ chiave: 'pc:sd', tono: 'guasto', titolo: `Non so se ${NOME} è acceso`, spiegazione: String(stato), gruppo: 'pc' } as unknown as Salute['voci'][number]]
  }
  const r = await giroControlloPc({
    radice: () => radice, io: () => ({ id: 'qui', nome: 'PC-Qui' }), altri: () => altri,
    saluteQui: () => Promise.resolve(saluteQui), saluteDi: () => Promise.reject(new Error('nessuna risposta')),
    autopiloti: () => Promise.resolve([]), affida: () => Promise.resolve(), adesso: () => ADESSO, log: () => undefined, riprovaMs: 1
  })
  const cartella = join(radice, '.sierradeck', 'errori-arrivati')
  const file = readdirSync(cartella).filter((f) => f.endsWith('.md'))
  const rapporto = file.length > 0 ? readFileSync(join(cartella, file[0] as string), 'utf8') : ''
  return { criticita: r.criticita, rapporto, file }
}

describe('k-163a: l’Aiutante vivo non è mai una criticità «non risponde»', () => {
  it('caso del 20/11: SierraDeck del 12/11, Aiutante delle 09:25, nessun indirizzo risponde', async () => {
    const r = await giro([sierraDeck('host-finto'), aiutante('host-finto')])
    expect(r.criticita).toBe(0)
    expect(r.file).toEqual([])
  })

  it('host scritto diverso (maiuscole, dominio): stesso risultato', async () => {
    const r = await giro([sierraDeck('HOST-FINTO'), aiutante('host-finto.local')])
    expect(r.criticita).toBe(0)
  })

  it('il rapporto, se scritto, non dice «dato vecchio» né «12/11» per quel PC', () => {
    const s: SaluteDiPc = { pcId: 'sd', nome: NOME, battito: BATTITO_AI, soloAiutante: true, errore: 'nessuna risposta' }
    const criticita = criticitaDi([s], [], ADESSO)
    expect(criticita).toEqual([])
    const t = testoRapporto({ quando: new Date(ADESSO).toISOString(), saluti: [s], criticita, adesso: ADESSO })
    expect(t).toContain('acceso, lavora solo l’Aiutante')
    expect(t).not.toContain('dato vecchio')
    expect(t).not.toContain('12/11')
    expect(t).not.toContain('non risponde')
  })
})
