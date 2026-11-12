import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { eAiutante, pcCheHaLaCartella, senzaAiutanti, type BattitoPc } from '../../src/shared/posta'
import { creaPostino, nomeBattitoPc, type Scatola } from '../../src/main/progetti/posta'

/**
 * 12/11: il battito di SierraDeck Aiutante porta `aiutante: true`. I PC di
 * prima non lo scrivono (e per loro un Aiutante è un PC senza chat); i PC
 * nuovi lo mostrano come «Aiutante» e non lo offrono per chat o progetti.
 */
const battito = (pcId: string, altro: Partial<BattitoPc> = {}): BattitoPc =>
  ({ pcId, nome: pcId, versione: '0.104.0', battito: '2026-11-12T10:00:00.000Z', cartelle: [], chat: [], ...altro })

describe('il segno dell’Aiutante nel battito', () => {
  it('solo `true` vale: assente, falso o storto è un PC normale (i battiti di prima)', () => {
    expect(eAiutante(battito('a', { aiutante: true }))).toBe(true)
    expect(eAiutante(battito('b'))).toBe(false)
    expect(eAiutante({ aiutante: 'true' })).toBe(false)
    expect(eAiutante(undefined)).toBe(false)
  })
  it('i PC per chat, workspace e progetti: senza gli Aiutanti', () => {
    const l = [battito('pc'), battito('aiu', { aiutante: true })]
    expect(senzaAiutanti(l).map((b) => b.pcId)).toEqual(['pc'])
  })
  it('un Aiutante non è mai «il PC che ha la cartella»', () => {
    const l = [battito('aiu', { aiutante: true, cartelle: ['C:\\Progetti\\x'], battito: '2026-11-12T11:00:00.000Z' })]
    expect(pcCheHaLaCartella('C:\\Progetti\\x', l)).toBeUndefined()
  })
})

function scatolaInMemoria(): Scatola & { dati: Map<string, unknown> } {
  const dati = new Map<string, unknown>()
  return {
    dati,
    leggi: <T,>(nome: string) => Promise.resolve(dati.get(nome) as T | undefined),
    scrivi: (nome, oggetto) => { dati.set(nome, JSON.parse(JSON.stringify(oggetto))); return Promise.resolve() },
    cancella: (nome) => { dati.delete(nome); return Promise.resolve() },
    elenca: (prefisso) => Promise.resolve([...dati.keys()].filter((k) => k.startsWith(prefisso)))
  }
}

const postino = (scatola: Scatola, pcId: string, aiutante?: () => boolean) => creaPostino({
  scatola: () => scatola, pcId: () => pcId, pcNome: () => pcId, versione: () => '1.0.0',
  chat: () => [], cartelle: () => [], cartellaEsiste: () => false,
  apriChat: () => {}, riprendiChat: () => {}, scrivi: () => {},
  ...(aiutante !== undefined ? { aiutante } : {})
})

describe('il postino scrive il segno', () => {
  it('l’Aiutante: `aiutante: true` nel battito sul Drive', async () => {
    const s = scatolaInMemoria()
    await postino(s, 'pc-aiu', () => true).giro()
    expect((s.dati.get(nomeBattitoPc('pc-aiu')) as BattitoPc).aiutante).toBe(true)
  })
  it('il programma completo: il battito non ha il campo (come prima)', async () => {
    const s = scatolaInMemoria()
    await postino(s, 'pc-pieno').giro()
    expect('aiutante' in (s.dati.get(nomeBattitoPc('pc-pieno')) as BattitoPc)).toBe(false)
  })
})

describe('dove il programma completo sceglie un PC per chat e progetti', () => {
  // 12/11: un controllo sul codice (il processo principale non si avvia nei test): i punti che
  // offrono un PC per guardare o aprire chat, per gli autopiloti e per le versioni passano da
  // `senzaAiutanti`; lo spedizioniere invece riceve il segno dell'Aiutante.
  const indice = readFileSync('src/main/index.ts', 'utf8')
  it('i riquadri remoti e il telefono non vedono gli Aiutanti come PC per le chat', () => {
    expect(indice).toMatch(/ipcMain\.handle\('remoto:pc'[\s\S]{0,400}senzaAiutanti\(await postino\.pcSubito\(\)/u)
    expect(indice).toMatch(/pc: \(\) => postinoGlobale\?\.pcSubito\(\)\.then\(senzaAiutanti\)/u)
  })
  it('gli autopiloti degli altri PC e le versioni: senza Aiutanti', () => {
    expect(indice).toMatch(/altriPcGlobale = async \(\) => \{[\s\S]{0,300}senzaAiutanti/u)
    expect(indice).toMatch(/const altre = senzaAiutanti\(postinoGlobale\?\.altrui\(\)/u)
  })
  it('lo spedizioniere sa chi è un Aiutante (per sceglierlo per primo)', () => {
    expect(indice).toMatch(/altri: \(\) => postino\.altrui\(\)[^\n]*eAiutante\(b\) \? \{ aiutante: true \}/u)
  })
})
