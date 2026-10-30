import { describe, it, expect } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FILE_PERCORSI_DI_PRIMA, passiDeiProgetti } from '../../src/main/riassetto/passi-progetti'
import { RimandaPasso, type ContestoPasso } from '../../src/main/riassetto/motore'
import type { EsitoPulizia } from '../../src/main/progetti/sposta'

/** Un contesto finto: tiene i segni, i saltati, le proposte e gli spostamenti. */
function contesto(dati: string): ContestoPasso & { segni: Set<string>; saltati: string[]; proposte: string[]; spostati: string[] } {
  const segni = new Set<string>()
  const saltati: string[] = []
  const proposte: string[] = []
  const spostati: string[] = []
  return {
    dati, versione: '0.88.0', ora: () => Date.parse('2026-11-01T10:00:00Z'), log: () => undefined,
    fatto: (k) => segni.has(k), segna: (k) => { segni.add(k) },
    sposta: (p) => { spostati.push(p); return { esito: 'spostato', byte: 0 } as never },
    salta: (cosa) => { saltati.push(cosa) }, errore: () => undefined, proponi: (t) => { proposte.push(t) },
    liberati: () => undefined, inRecupero: () => undefined, avanza: () => undefined, cartellaRecupero: () => dati,
    segni, saltati, proposte, spostati
  }
}

function datiFinti(): { dati: string; progetti: string } {
  const base = mkdtempSync(join(tmpdir(), 'sd-riassetto-progetti-'))
  const dati = join(base, 'dati')
  const progetti = join(base, 'Progetti')
  mkdirSync(dati, { recursive: true })
  mkdirSync(join(progetti, 'Trading'), { recursive: true })
  writeFileSync(join(dati, 'pc.json'), JSON.stringify({ id: 'pc-f', nome: 'PC-Fisso', cartellaProgetti: progetti }))
  writeFileSync(join(dati, 'pc-altrui.json'), JSON.stringify([{ pcId: 'pc-l', nome: 'LAPTOP-E60QM2D1', cartelle: [], chat: [] }]))
  writeFileSync(join(dati, 'progetti-drive.json'), JSON.stringify({ versione: 1, progetti: [
    { id: 'a', nome: 'Trading', percorsi: { 'pc-l': 'C:\Trading', 'pc-f': join(progetti, 'Trading') }, aggiuntoIl: '' },
    { id: 'b', nome: 'Downloads', percorsi: { 'pc-f': 'E:\Downloads' }, aggiuntoIl: '' }
  ] }))
  return { dati, progetti }
}

describe('riassetto: un PC per ogni progetto', () => {
  it('fase A: proprietari nel registro e i percorsi di prima salvati per il passo delle copie', async () => {
    const { dati, progetti } = datiFinti()
    const [proprietari] = passiDeiProgetti({ io: () => ({ id: 'pc-f', cartellaProgetti: progetti }), pulisci: () => undefined })
    await proprietari!.esegui(contesto(dati))
    const reg = JSON.parse(readFileSync(join(dati, 'progetti-drive.json'), 'utf8')) as { progetti: Array<{ nome: string; proprietario?: string }> }
    expect(reg.progetti.map((p) => [p.nome, p.proprietario])).toEqual([['Trading', 'pc-l']])
    expect(existsSync(join(dati, FILE_PERCORSI_DI_PRIMA))).toBe(true)
  })

  it('fase B: la copia di un progetto di un altro PC passa da `pulisci`; Drive muto = si riprova', async () => {
    const { dati, progetti } = datiFinti()
    const chieste: string[] = []
    let risposta: EsitoPulizia['tipo'] | 'drive' = 'drive'
    const pulisci = async (p: { percorso: string }): Promise<EsitoPulizia> => {
      chieste.push(p.percorso)
      return risposta === 'nel-recupero'
        ? { tipo: 'nel-recupero', percorso: p.percorso, messaggio: 'nel recupero' }
        : { tipo: 'tenuta', percorso: p.percorso, perche: 'drive', messaggio: 'il Drive non risponde' }
    }
    const [proprietari, copie] = passiDeiProgetti({ io: () => ({ id: 'pc-f', cartellaProgetti: progetti }), pulisci: () => pulisci })
    const c = contesto(dati)
    await proprietari!.esegui(c)
    await expect(copie!.esegui(c)).rejects.toBeInstanceOf(RimandaPasso)
    expect(chieste).toEqual([join(progetti, 'Trading')])
    risposta = 'nel-recupero'
    await copie!.esegui(c)
    expect(c.segni.has(`copia:${join(progetti, 'Trading')}`)).toBe(true)
    expect(c.spostati).toContain(join(dati, FILE_PERCORSI_DI_PRIMA))
  })

  it('fase B senza sincronia pronta: rimanda, non tocca niente', async () => {
    const { dati, progetti } = datiFinti()
    const [, copie] = passiDeiProgetti({ io: () => ({ id: 'pc-f', cartellaProgetti: progetti }), pulisci: () => undefined })
    await expect(copie!.esegui(contesto(dati))).rejects.toBeInstanceOf(RimandaPasso)
  })
})
