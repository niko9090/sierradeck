import { describe, it, expect } from 'vitest'
import { creaClientPcRemoto } from '../../src/main/pc-remoto'
import { criticitaDi, testoRapporto, type SaluteDiPc } from '../../src/main/controllo-pc'
import { vistoDelPc } from '@shared/stato-pc'
import { dataBreve } from '@shared/tempo-it'
import type { BattitoPc } from '@shared/posta'

/**
 * k-162a: un PC con il solo Aiutante vivo. SierraDeck e l'Aiutante di quel PC sono
 * due battiti (id diversi, stesso `host`); «non risponde» e ogni testo del
 * controllo devono usare il più recente dei due, mai quello vecchio di SierraDeck.
 */
const ADESSO = Date.parse('2026-11-20T03:44:42.000Z')
const fa = (min: number): string => new Date(ADESSO - min * 60_000).toISOString()
const NOME = 'PC-Prova'

const sierraDeck = (battito: string): BattitoPc => ({
  pcId: 'sd', nome: NOME, host: 'host-prova', versione: '0.111.0', battito, cartelle: [], chat: [], indirizzi: ['192.0.2.10'], porta: 47640
})
const aiutante = (battito: string): BattitoPc => ({
  pcId: 'ai', nome: NOME, host: 'host-prova', versione: '0.111.0', battito, cartelle: [], chat: [], aiutante: true
})

/** Il controllo, come lo fa il programma: il client remoto muto, `altri` con il battito più recente. */
async function controllo(battiti: BattitoPc[]): Promise<{ saluti: SaluteDiPc[]; criticita: ReturnType<typeof criticitaDi>; rapporto: string }> {
  const remoto = creaClientPcRemoto({
    battiti: () => battiti,
    chiavePer: () => 'chiave-di-casa',
    mioNome: () => 'PC-Qui',
    adesso: () => ADESSO,
    bussaMs: 20,
    attesaMs: 20,
    driveCollegato: () => true,
    altriIndirizzi: async () => ({}),
    fetch: ((_url: string, init?: { signal?: AbortSignal }) =>
      new Promise((_ok, ko) => init?.signal?.addEventListener('abort', () => ko(new Error('abort'))))) as unknown as typeof fetch
  })
  const { visto, soloAiutante } = vistoDelPc(battiti, 'sd', ADESSO)
  const s: SaluteDiPc = { pcId: 'sd', nome: NOME, ...(visto !== undefined ? { battito: visto } : {}), ...(soloAiutante ? { soloAiutante: true } : {}) }
  try { await remoto.chiama('sd', '/api/salute') } catch (e) { s.errore = e instanceof Error ? e.message : String(e) }
  const saluti = [s]
  const criticita = criticitaDi(saluti, [], ADESSO)
  return { saluti, criticita, rapporto: testoRapporto({ quando: new Date(ADESSO).toISOString(), saluti, criticita, adesso: ADESSO }) }
}

describe('k-162a: l’ultimo segno è il più recente fra SierraDeck e l’Aiutante dello stesso host', () => {
  it('solo l’Aiutante fresco: nessuna criticità, riga informativa nel rapporto', async () => {
    const r = await controllo([sierraDeck(fa(12 * 24 * 60)), aiutante(fa(29))])
    expect(r.criticita).toEqual([])
    expect(r.rapporto).toContain('acceso, lavora solo l’Aiutante')
    expect(r.rapporto).not.toContain('non risponde (')
    expect(r.rapporto).toContain(`ultimo battito sul Drive: ${fa(29)}`)
  })

  it('tutti e due vecchi (battito illeggibile per lo stato): criticità con la data del più recente, non di SierraDeck', async () => {
    const vecchioSd = fa(8 * 24 * 60)
    const vecchioAi = fa(2 * 24 * 60)
    const r = await controllo([sierraDeck(vecchioSd), aiutante(vecchioAi)])
    // Il messaggio del bussare dice il segno più recente.
    expect(r.saluti[0]?.errore).toContain(dataBreve(vecchioAi))
    expect(r.saluti[0]?.errore).not.toContain(dataBreve(vecchioSd))
    expect(r.saluti[0]?.battito).toBe(vecchioAi)
    // Senza il battito (nessuna data leggibile) un PC che non risponde resta una criticità con quel testo.
    const senzaData = criticitaDi([{ ...r.saluti[0]!, battito: undefined as unknown as string }], [], ADESSO)
    expect(senzaData.map((c) => c.cosa)).toEqual(['non risponde'])
    expect(senzaData[0]?.dettaglio).toContain(dataBreve(vecchioAi))
  })

  it('SierraDeck fresco ma muto: criticità vera, non «solo Aiutante»', async () => {
    const r = await controllo([sierraDeck(fa(10)), aiutante(fa(5))])
    expect(r.saluti[0]?.soloAiutante).toBeUndefined()
    expect(r.criticita.map((c) => c.cosa)).toEqual(['non risponde'])
  })
})
