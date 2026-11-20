import { describe, it, expect } from 'vitest'
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { creaClientPcRemoto } from '../../src/main/pc-remoto'
import { giroControlloPc } from '../../src/main/controllo-pc'
import { vistoConAiutante, vistoDelPc } from '@shared/stato-pc'
import { unBattitoPerNome } from '@shared/autopiloti-altri'
import { senzaAiutanti, type BattitoPc } from '@shared/posta'
import type { Salute } from '@shared/salute'

/**
 * k-163d: il controllo del 20/11 (09:44:41Z) dava «non risponde» a un PC vivo con il solo Aiutante.
 * Il battito dell'Aiutante era di 19 minuti prima (dentro i 35 di `SPENTO_DOPO_MS`), SierraDeck fermo al 12/11,
 * stesso `host` scritto allo stesso modo, nessun indirizzo risponde. Qui il giro intero come in index.ts
 * (la voce di salute scritta dal bussare, `altri` costruito come `altriPcGlobale`), con nomi e indirizzi finti.
 */
const ADESSO = Date.parse('2026-11-20T09:44:41.966Z')
const NOME = 'PC-Finto'
const SD_VECCHIO = '2026-11-12T23:21:00.000Z'
const AI_19_MIN = '2026-11-20T09:25:25.931Z'
const AI_OLTRE_SOGLIA = '2026-11-20T08:55:00.000Z' // 49 minuti prima

const sierraDeck = (battito: string): BattitoPc => ({
  pcId: 'sd', nome: NOME, host: 'host-finto', versione: '0.110.0', battito, cartelle: [], chat: [], indirizzi: ['192.0.2.10', '192.0.2.11'], porta: 47640
})
const aiutante = (battito: string): BattitoPc => ({
  pcId: 'ai', nome: NOME, host: 'host-finto', versione: '3.3.0', battito, cartelle: [], chat: [], aiutante: true
})

async function giro(battiti: BattitoPc[]): Promise<{ criticita: number; rapporto: string; log: string[] }> {
  const radice = mkdtempSync(join(tmpdir(), 'k163d-'))
  const remoto = creaClientPcRemoto({
    battiti: () => battiti, chiavePer: () => 'chiave-di-casa', mioNome: () => 'PC-Qui', adesso: () => ADESSO,
    bussaMs: 20, attesaMs: 20, driveCollegato: () => true, altriIndirizzi: async () => ({}),
    fetch: ((_url: string, init?: { signal?: AbortSignal }) =>
      new Promise((_ok, ko) => init?.signal?.addEventListener('abort', () => ko(new Error('abort'))))) as unknown as typeof fetch
  })
  const visti = vistoConAiutante(battiti, (b) => b.battito)
  const altri = unBattitoPerNome(senzaAiutanti(battiti), (b) => b.nome).map((b) => ({
    pcId: b.pcId, nome: b.nome,
    ...(visti.get(b.pcId) !== undefined ? { battito: visti.get(b.pcId) as string } : {}),
    ...(vistoDelPc(battiti, b.pcId, ADESSO).soloAiutante ? { soloAiutante: true } : {})
  }))
  const stato = await remoto.chiama('sd', '/api/salute').catch((e: unknown) => e instanceof Error ? e.message : String(e))
  const saluteQui: Salute = {
    scritto: new Date(ADESSO).toISOString(), tono: 'attenzione', riassunto: 'un PC non si raggiunge',
    voci: [{ chiave: 'pc:sd', tono: 'guasto', titolo: `Non so se ${NOME} è acceso`, spiegazione: String(stato), gruppo: 'pc' } as unknown as Salute['voci'][number]]
  }
  const log: string[] = []
  const r = await giroControlloPc({
    radice: () => radice, io: () => ({ id: 'qui', nome: 'PC-Qui' }), altri: () => altri,
    saluteQui: () => Promise.resolve(saluteQui), saluteDi: () => Promise.reject(new Error(String(stato))),
    autopiloti: () => Promise.resolve([]), affida: () => Promise.resolve(), adesso: () => ADESSO, log: (x) => log.push(x), riprovaMs: 1
  })
  const cartella = join(radice, '.sierradeck', 'errori-arrivati')
  const file = readdirSync(cartella).filter((f) => f.endsWith('.md'))
  return { criticita: r.criticita, rapporto: file.length > 0 ? readFileSync(join(cartella, file[0] as string), 'utf8') : '', log }
}

describe('k-163d: il caso reale del 20/11, giro intero', () => {
  it('Aiutante di 19 minuti prima, SierraDeck del 12/11, nessun indirizzo risponde: nessuna criticità, nessun rapporto', async () => {
    const r = await giro([sierraDeck(SD_VECCHIO), aiutante(AI_19_MIN)])
    expect(r.rapporto).toBe('')
    expect(r.criticita).toBe(0)
  })

  it('un battito di 19 minuti non è mai «dato vecchio»: la soglia è quella di stato-pc (35 minuti)', async () => {
    const r = await giro([sierraDeck(SD_VECCHIO), aiutante(AI_19_MIN), { ...sierraDeck(SD_VECCHIO), pcId: 'sd2', nome: 'Altro-PC-Finto', host: 'altro-host', battito: AI_OLTRE_SOGLIA }])
    // L'altro PC (tutti e due i battiti oltre soglia, qui solo SierraDeck) è spento; il primo no.
    expect(r.rapporto).not.toContain('non risponde')
    expect(r.rapporto).not.toContain('12/11')
    expect(r.rapporto).not.toContain('dato vecchio')
  })

  it('controllo: tutti e due i battiti oltre la soglia, nessuno risponde → PC spento, non «acceso» né «solo Aiutante»', async () => {
    const r = await giro([sierraDeck(SD_VECCHIO), aiutante(AI_OLTRE_SOGLIA)])
    expect(r.rapporto).not.toContain('lavora solo l’Aiutante')
    // Spento = non è una criticità, ma il rapporto non lo dice acceso.
    expect(r.criticita).toBe(0)
  })

  it('controllo: SierraDeck vivo ma muto, Aiutante vivo → resta «non risponde» (guasto vero)', async () => {
    const r = await giro([sierraDeck(AI_19_MIN), aiutante(AI_19_MIN)])
    expect(r.criticita).toBeGreaterThan(0)
    expect(r.rapporto).toContain('non risponde')
  })
})
