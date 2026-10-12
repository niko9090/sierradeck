import { describe, it, expect } from 'vitest'
import { creaPostino, nomeBattitoPc, BATTITO_PC_OGNI_MS, type BattitoPc } from '../../src/main/progetti/posta'
import type { Scatola } from '../../src/main/progetti/presenza'

/**
 * Gli altri PC come li ricordo: l'ultimo elenco letto dal Drive, tenuto in
 * memoria e su disco, per rispondere «questa cartella e' del portatile»
 * anche a Drive spento e appena avviati.
 */
function scatolaInMemoria(): Scatola & { dati: Map<string, unknown>; letture: number } {
  const dati = new Map<string, unknown>()
  const s = {
    dati, letture: 0,
    leggi: <T,>(nome: string) => { if (nome.startsWith('pc-')) s.letture += 1; return Promise.resolve(dati.get(nome) as T | undefined) },
    scrivi: (nome: string, oggetto: unknown) => { dati.set(nome, JSON.parse(JSON.stringify(oggetto))); return Promise.resolve() },
    cancella: (nome: string) => { dati.delete(nome); return Promise.resolve() },
    elenca: (prefisso: string) => Promise.resolve([...dati.keys()].filter((k) => k.startsWith(prefisso)))
  }
  return s
}

const battitoDi = (pcId: string, nome: string, cartelle: string[]): BattitoPc =>
  ({ pcId, nome, versione: '0.27.0', battito: '2026-09-15T08:00:00.000Z', cartelle, chat: [] })

describe('gli altri PC ricordati', () => {
  it('parte dalla memoria su disco, poi legge il Drive al giro e la aggiorna', async () => {
    const scatola = scatolaInMemoria()
    await scatola.scrivi(nomeBattitoPc('P'), battitoDi('P', 'Portatile', ['E:\\Documents\\x']))
    let suDisco: BattitoPc[] = [battitoDi('V', 'Vecchio', ['Q:\\v'])]
    let orologio = Date.parse('2026-09-15T08:00:00.000Z')
    const postino = creaPostino({
      scatola: () => scatola, pcId: () => 'F', pcNome: () => 'Fisso', versione: () => '0.27.0',
      chat: () => [], cartelle: () => [], cartellaEsiste: () => true,
      apriChat: () => undefined, riprendiChat: () => undefined, scrivi: () => undefined,
      adesso: () => orologio,
      memoria: { leggi: () => suDisco, scrivi: (b) => { suDisco = b } }
    })
    expect(postino.altrui().map((b) => b.nome)).toEqual(['Vecchio'])
    await postino.giro()
    expect(postino.altrui().map((b) => b.nome)).toEqual(['Portatile'])
    expect(suDisco.map((b) => b.nome)).toEqual(['Portatile'])
    // Non a ogni giro: gli altri PC si rileggono ogni due minuti.
    const letture = scatola.letture
    orologio += 30_000
    await postino.giro()
    expect(scatola.letture).toBe(letture)
    orologio += BATTITO_PC_OGNI_MS
    await postino.giro()
    expect(scatola.letture).toBeGreaterThan(letture)
  })

  it('senza Drive risponde con quello che ricorda, e non dimentica se stesso di essere escluso', async () => {
    const postino = creaPostino({
      scatola: () => undefined, pcId: () => 'F', pcNome: () => 'Fisso', versione: () => '0.27.0',
      chat: () => [], cartelle: () => [], cartellaEsiste: () => true,
      apriChat: () => undefined, riprendiChat: () => undefined, scrivi: () => undefined,
      memoria: { leggi: () => [battitoDi('P', 'Portatile', ['E:\\x'])], scrivi: () => undefined }
    })
    expect(await postino.pc()).toEqual([battitoDi('P', 'Portatile', ['E:\\x'])])
    expect(postino.altrui()[0]?.nome).toBe('Portatile')
  })
})

describe('i battiti per chi li chiede, subito (0.68.0)', () => {
  it('un minuto di memoria; poi risponde con quelli che ha e rilegge in sottofondo; aspetta il Drive solo la prima volta', async () => {
    const scatola = scatolaInMemoria()
    await scatola.scrivi(nomeBattitoPc('P'), battitoDi('P', 'Portatile', []))
    let orologio = Date.parse('2026-09-15T08:00:00.000Z')
    const postino = creaPostino({
      scatola: () => scatola, pcId: () => 'F', pcNome: () => 'Fisso', versione: () => '0.27.0',
      chat: () => [], cartelle: () => [], cartellaEsiste: () => true,
      apriChat: () => undefined, riprendiChat: () => undefined, scrivi: () => undefined,
      adesso: () => orologio
    })
    // La prima volta non c'è niente: si aspetta il Drive.
    expect((await postino.pcSubito()).map((b) => b.nome)).toEqual(['Portatile'])
    const letture = scatola.letture
    // Entro un minuto: dalla memoria, senza toccare il Drive.
    await scatola.scrivi(nomeBattitoPc('D'), battitoDi('D', 'Desktop', []))
    orologio += 30_000
    expect((await postino.pcSubito()).map((b) => b.nome)).toEqual(['Portatile'])
    expect(scatola.letture).toBe(letture)
    // Dopo un minuto: risponde subito con quelli di prima, e intanto rilegge.
    orologio += 40_000
    expect((await postino.pcSubito()).map((b) => b.nome)).toEqual(['Portatile'])
    await new Promise((ok) => setTimeout(ok, 10))
    expect(postino.altrui().map((b) => b.nome).sort()).toEqual(['Desktop', 'Portatile'])
  })
})
