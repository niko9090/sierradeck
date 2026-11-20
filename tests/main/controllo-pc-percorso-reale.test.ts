import { describe, it, expect } from 'vitest'
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { creaClientPcRemoto } from '../../src/main/pc-remoto'
import { altriPcDelControllo, giroControlloPc } from '../../src/main/controllo-pc'
import { creaPostino, nomeBattitoPc, type Scatola } from '../../src/main/progetti/posta'
import type { BattitoPc } from '@shared/posta'
import type { Salute } from '@shared/salute'

/**
 * k-163e: il percorso vero del controllo dei PC. I battiti passano dal postino (Drive finto + memoria su disco
 * finta), come in index.ts: `altri` non è mai già pronto. Nomi e indirizzi inventati.
 *
 * Il caso: SierraDeck del PC-Finto fermo al 12/11, il suo Aiutante batte da 19 minuti. Il postino però ricordava
 * (dalla memoria su disco dell'avvio precedente, o col Drive «piano») solo il battito vecchio: il controllo chiedeva
 * `pcSubito()`, che risponde con la memoria, e ne usciva «non risponde».
 */
const ADESSO = Date.parse('2026-11-20T09:44:41.966Z')
const NOME = 'PC-Finto'
const SD_VECCHIO = '2026-11-12T23:21:00.000Z'
const AI_19_MIN = '2026-11-20T09:25:25.931Z'
const AI_OLTRE_SOGLIA = '2026-11-20T08:55:00.000Z'

const sierraDeck = (battito: string): BattitoPc => ({
  pcId: 'sd', nome: NOME, host: 'host-finto', versione: '0.110.0', battito, cartelle: [], chat: [], indirizzi: ['192.0.2.10'], porta: 47640
})
const aiutante = (battito: string): BattitoPc => ({
  pcId: 'ai', nome: NOME, host: 'Host-Finto.local', versione: '3.3.0', battito, cartelle: [], chat: [], aiutante: true
})

function drive(battiti: BattitoPc[]): Scatola {
  const dati = new Map<string, unknown>(battiti.map((b) => [nomeBattitoPc(b.pcId), JSON.parse(JSON.stringify(b))]))
  return {
    leggi: <T,>(nome: string) => Promise.resolve(dati.get(nome) as T | undefined),
    scrivi: (nome, o) => { dati.set(nome, JSON.parse(JSON.stringify(o))); return Promise.resolve() },
    cancella: (nome) => { dati.delete(nome); return Promise.resolve() },
    elenca: (prefisso) => Promise.resolve([...dati.keys()].filter((k) => k.startsWith(prefisso)))
  }
}

/** Il giro come in index.ts: postino → altri (controllo) → giroControlloPc, con il bussare vero che fallisce. */
async function giro(o: { sulDrive: BattitoPc[]; memoria: BattitoPc[]; driveLeggibile?: boolean }): Promise<{ criticita: number; rapporto: string; altri: Array<{ pcId: string; battito?: string; soloAiutante?: boolean }> }> {
  const scatola = drive(o.sulDrive)
  const postino = creaPostino({
    scatola: () => scatola, pcId: () => 'qui', pcNome: () => 'PC-Qui', versione: () => '1.0.0',
    chat: () => [], cartelle: () => [], cartellaEsiste: () => false,
    apriChat: () => {}, riprendiChat: () => {}, scrivi: () => {},
    adesso: () => ADESSO,
    memoria: { leggi: () => o.memoria, scrivi: () => {} }
  })
  if (o.driveLeggibile === false) scatola.elenca = () => Promise.reject(new Error('Drive non raggiungibile'))
  const remoto = creaClientPcRemoto({
    battiti: () => postino.altrui(), chiavePer: () => 'chiave-di-casa', mioNome: () => 'PC-Qui', adesso: () => ADESSO,
    bussaMs: 20, attesaMs: 20, driveCollegato: () => true, altriIndirizzi: async () => ({}),
    fetch: ((_url: string, init?: { signal?: AbortSignal }) =>
      new Promise((_ok, ko) => init?.signal?.addEventListener('abort', () => ko(new Error('abort'))))) as unknown as typeof fetch
  })
  const radice = mkdtempSync(join(tmpdir(), 'k163e-'))
  const altri = await altriPcDelControllo({ postino, ioId: 'qui', nome: (b) => b.nome, adesso: () => ADESSO })
  // La voce di salute di questo PC la scrive il bussare, con la memoria del postino (dopo la lettura del controllo).
  const stato = await remoto.chiama('sd', '/api/salute').catch((e: unknown) => e instanceof Error ? e.message : String(e))
  const saluteQui: Salute = {
    scritto: new Date(ADESSO).toISOString(), tono: 'attenzione', riassunto: 'un PC non si raggiunge',
    voci: [{ chiave: 'pc:sd', tono: 'guasto', titolo: `Non so se ${NOME} è acceso`, spiegazione: String(stato), gruppo: 'pc' } as unknown as Salute['voci'][number]]
  }
  const r = await giroControlloPc({
    radice: () => radice, io: () => ({ id: 'qui', nome: 'PC-Qui' }), altri: () => altri,
    saluteQui: () => Promise.resolve(saluteQui), saluteDi: () => Promise.reject(new Error(String(stato))),
    autopiloti: () => Promise.resolve([]), affida: () => Promise.resolve(), adesso: () => ADESSO, log: () => {}, riprovaMs: 1
  })
  const cartella = join(radice, '.sierradeck', 'errori-arrivati')
  const file = readdirSync(cartella).filter((f) => f.endsWith('.md'))
  return { criticita: r.criticita, rapporto: file.length > 0 ? readFileSync(join(cartella, file[0] as string), 'utf8') : '', altri }
}

/** Il PC visto dal controllo: il battito che conta e se è acceso solo per l'Aiutante. */
const visto = (r: { altri: Array<{ pcId: string; battito?: string; soloAiutante?: boolean }> }): { battito?: string; soloAiutante?: boolean } | undefined => r.altri.find((p) => p.pcId === 'sd')

describe('k-163e: il controllo dal postino vero', () => {
  it('memoria del postino vecchia (senza il battito dell’Aiutante), Drive con l’Aiutante di 19 minuti: nessun «non risponde»', async () => {
    const r = await giro({ sulDrive: [sierraDeck(SD_VECCHIO), aiutante(AI_19_MIN)], memoria: [sierraDeck(SD_VECCHIO)] })
    expect(visto(r)).toEqual({ pcId: 'sd', nome: NOME, battito: AI_19_MIN, soloAiutante: true })
    expect(r.rapporto).toBe('')
    expect(r.criticita).toBe(0)
  })

  it('memoria con un battito dell’Aiutante vecchio di giorni, Drive con quello di 19 minuti: acceso', async () => {
    const r = await giro({ sulDrive: [sierraDeck(SD_VECCHIO), aiutante(AI_19_MIN)], memoria: [sierraDeck(SD_VECCHIO), aiutante('2026-11-12T23:30:00.000Z')] })
    expect(visto(r)).toMatchObject({ battito: AI_19_MIN, soloAiutante: true })
    expect(r.rapporto).toBe('')
    expect(r.criticita).toBe(0)
  })

  it('memoria già giusta: nessuna criticità (come prima)', async () => {
    const r = await giro({ sulDrive: [sierraDeck(SD_VECCHIO), aiutante(AI_19_MIN)], memoria: [sierraDeck(SD_VECCHIO), aiutante(AI_19_MIN)] })
    expect(r.criticita).toBe(0)
  })

  it('Drive illeggibile: si ripiega sulla memoria, senza rompere il giro', async () => {
    const r = await giro({ sulDrive: [], memoria: [sierraDeck(SD_VECCHIO), aiutante(AI_19_MIN)], driveLeggibile: false })
    expect(r.criticita).toBe(0)
  })

  it('Aiutante oltre i 35 minuti anche sul Drive: PC spento, mai «acceso» e mai criticità', async () => {
    const r = await giro({ sulDrive: [sierraDeck(SD_VECCHIO), aiutante(AI_OLTRE_SOGLIA)], memoria: [sierraDeck(SD_VECCHIO)] })
    expect(r.criticita).toBe(0)
    expect(r.rapporto).not.toContain('lavora solo l’Aiutante')
  })

  it('SierraDeck vivo ma muto: resta «non risponde» (guasto vero)', async () => {
    const r = await giro({ sulDrive: [sierraDeck(AI_19_MIN), aiutante(AI_19_MIN)], memoria: [sierraDeck(AI_19_MIN)] })
    expect(r.criticita).toBeGreaterThan(0)
    expect(r.rapporto).toContain('non risponde')
  })
})
