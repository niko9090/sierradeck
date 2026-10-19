import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apriSincronia } from '../../src/main/cassaforte/sincronia'
import { magazzinoInMemoria, type Magazzino } from '../../src/main/cassaforte/magazzino'
import { archivioInMemoria } from '../../src/main/cassaforte/archivio'

/**
 * 0.81.0: lo stato per l'autopilota (ogni 10 s) e le finestre (ogni 30 s
 * ciascuna) chiedevano `stato()`, e ogni volta le chiavi scendevano dal Drive:
 * oltre 360 richieste l'ora a Google. Adesso «il Drive lavora?» si sa senza
 * rete, e il confronto con le chiavi del Drive si rifà al massimo ogni 10 minuti.
 */
describe('il Drive non si interroga a ogni giro', () => {
  const temp: string[] = []
  afterEach(() => { for (const t of temp.splice(0)) rmSync(t, { recursive: true, force: true }) })

  const prepara = (): { apri: (ora?: () => number) => ReturnType<typeof apriSincronia>; scaricati: () => number } => {
    const radice = mkdtempSync(join(tmpdir(), 'sd-drive-letture-'))
    temp.push(radice)
    const dati = join(radice, 'dati')
    const claude = join(radice, 'claude')
    mkdirSync(dati, { recursive: true })
    mkdirSync(join(claude, 'projects'), { recursive: true })
    const vero = magazzinoInMemoria()
    let scaricati = 0
    const contato: Magazzino = { ...vero, scarica: async () => { scaricati++; return vero.scarica() } }
    const archivio = archivioInMemoria()
    return {
      apri: (ora) => apriSincronia({ dati, radiceClaude: claude, driveConnesso: () => true, magazzino: () => contato, archivio: () => archivio, ...(ora !== undefined ? { ora } : {}) }),
      scaricati: () => scaricati
    }
  }

  it('driveAttivo risponde senza scaricare niente', async () => {
    const p = prepara()
    const s = p.apri()
    expect(s.driveAttivo()).toBe(false)
    await s.creaPassphrase('una passphrase lunga abbastanza')
    s.auto(true)
    const prima = p.scaricati()
    for (let i = 0; i < 50; i++) expect(s.driveAttivo()).toBe(true)
    expect(p.scaricati()).toBe(prima)
    s.blocca()
    expect(s.driveAttivo()).toBe(false)
  })

  it('stato() con la cassaforte qui rilegge le chiavi del Drive al massimo ogni 10 minuti', async () => {
    const p = prepara()
    let adesso = 1_000_000
    const s = p.apri(() => adesso)
    await s.creaPassphrase('una passphrase lunga abbastanza')
    const prima = p.scaricati()
    for (let i = 0; i < 20; i++) { await s.stato(); adesso += 30_000 } // 10 minuti di finestre ogni 30 s
    expect(p.scaricati() - prima).toBe(1)
    adesso += 1
    await s.stato()
    expect(p.scaricati() - prima).toBe(2)
  })

  it('senza cassaforte qui il Drive si guarda ogni volta: è un PC nuovo che aspetta quella dell’altro', async () => {
    const p = prepara()
    const s = p.apri(() => 5)
    await s.stato()
    await s.stato()
    expect(p.scaricati()).toBe(2)
  })
})
