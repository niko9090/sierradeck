import { describe, it, expect } from 'vitest'
import { conConteggio, cpuRamDa, creaContatoreDrive, tipoRichiestaDrive, FINESTRA_RISORSE_MS } from '../../src/main/risorse'
import { creaPostino, nomeBattitoPc } from '../../src/main/progetti/posta'
import type { Scatola } from '../../src/main/progetti/posta'
import { componiSalute } from '@shared/salute'
import { risorseValide, rigaRisorse, type RisorsePc } from '@shared/risorse'

/**
 * «Ottimizziamo l'app perché i PC girano lenti» (Nicholas, 12/10): prima di
 * togliere giri si contano, su ogni PC (0.69.0).
 */
describe('il contatore delle richieste al Drive', () => {
  it('riconosce ricerca, scarica, scrittura e cancella dall’indirizzo', () => {
    expect(tipoRichiestaDrive('GET', 'https://www.googleapis.com/drive/v3/files?q=name%3D%27x%27&spaces=appDataFolder')).toBe('ricerca')
    expect(tipoRichiestaDrive('GET', 'https://www.googleapis.com/drive/v3/files/abc?alt=media')).toBe('scarica')
    expect(tipoRichiestaDrive('PATCH', 'https://www.googleapis.com/upload/drive/v3/files/abc?uploadType=media')).toBe('scrittura')
    expect(tipoRichiestaDrive('DELETE', 'https://www.googleapis.com/drive/v3/files/abc')).toBe('cancella')
  })

  it('conta al minuto sugli ultimi 10 minuti, e quante Google ne rifiuta', async () => {
    let ora = 0
    const c = creaContatoreDrive(() => ora)
    const finto = (async (_u: string, init?: { method?: string }) => new Response('', { status: init?.method === 'POST' ? 403 : 200 })) as unknown as typeof fetch
    const f = conConteggio(finto, c)
    for (let i = 0; i < 20; i += 1) await f('https://www.googleapis.com/drive/v3/files?q=x')
    await f('https://www.googleapis.com/upload/drive/v3/files', { method: 'POST' })
    expect(c.riassunto()).toEqual({ driveAlMinuto: 2.1, drivePerTipo: { ricerca: 20, scrittura: 1 }, driveRifiutate: 1 })
    // Passata la finestra, non restano.
    ora += FINESTRA_RISORSE_MS + 1
    expect(c.riassunto().driveAlMinuto).toBe(0)
  })
})

describe('CPU e RAM dei processi', () => {
  it('somma i processi; la CPU è del PC intero', () => {
    const r = cpuRamDa([
      { cpu: { percentCPUUsage: 6 }, memory: { workingSetSize: 200 * 1024 } },
      { cpu: { percentCPUUsage: 2 }, memory: { workingSetSize: 100 * 1024 } }
    ], 8)
    expect(r).toEqual({ cpu: 1, ramMb: 300, processi: 2 })
  })
})

const risorse = (x: Partial<RisorsePc> = {}): RisorsePc => ({ cpu: 0.9, ramMb: 680, processi: 6, driveAlMinuto: 4.2, drivePerTipo: {}, driveRifiutate: 0, misuratoIl: '2026-10-12T21:00:00.000Z', ...x })

describe('nel battito, senza farlo riscrivere', () => {
  function scatola(): Scatola & { scritture: number } {
    const dati = new Map<string, unknown>()
    const s = {
      scritture: 0,
      leggi: <T,>(nome: string) => Promise.resolve(dati.get(nome) as T | undefined),
      scrivi: (nome: string, oggetto: unknown) => { s.scritture += 1; dati.set(nome, JSON.parse(JSON.stringify(oggetto))); return Promise.resolve() },
      cancella: (nome: string) => { dati.delete(nome); return Promise.resolve() },
      elenca: (prefisso: string) => Promise.resolve([...dati.keys()].filter((k) => k.startsWith(prefisso)))
    }
    return s
  }

  it('le risorse vanno nel battito; se cambia solo loro non si riscrive', async () => {
    const drive = scatola()
    let ora = Date.parse('2026-10-12T21:00:00Z')
    let cpu = 1
    const p = creaPostino({
      scatola: () => drive, pcId: () => 'qui', pcNome: () => 'PC', versione: () => '0.69.0',
      chat: () => [], cartelle: () => [], cartellaEsiste: () => true,
      apriChat: () => undefined, riprendiChat: () => undefined, scrivi: () => undefined,
      adesso: () => ora, risorse: () => risorse({ cpu })
    })
    await p.giro()
    const battiti = (): number => drive.scritture
    const dopoPrimo = battiti()
    expect(((await drive.leggi<{ risorse?: RisorsePc }>(nomeBattitoPc('qui')))?.risorse)?.cpu).toBe(1)
    cpu = 7
    ora += 30_000
    await p.giro()
    expect(battiti()).toBe(dopoPrimo)
  })
})

describe('nella Salute', () => {
  it('una voce con questo PC e gli altri; attenzione se Google rifiuta', () => {
    const base = { adesso: Date.parse('2026-10-12T21:00:00Z'), versione: '0.69.0', drive: { configurato: true, connesso: true }, errori: [], consegne: [], oreErrori: 6 }
    const s = componiSalute({ ...base, pc: [{ pcId: 'b', nome: 'PORTATILE', versione: '0.69.0', risorse: risorse({ driveAlMinuto: 12, driveRifiutate: 3 }) }], risorse: risorse() })
    const v = s.voci.find((x) => x.chiave === 'risorse')
    expect(v?.titolo).toBe('Quanto lavora SierraDeck: CPU 0,9% · RAM 680 MB · Drive 4,2 richieste/min')
    expect(v?.spiegazione).toContain('PORTATILE: CPU 0,9% · RAM 680 MB · Drive 12 richieste/min · 3 rifiutate da Google')
    expect(v?.tono).toBe('attenzione')
  })

  it('dal battito di un altro PC si prende solo la forma giusta', () => {
    expect(risorseValide(risorse())).toBe(true)
    expect(risorseValide({ cpu: '9' })).toBe(false)
    expect(risorseValide(undefined)).toBe(false)
    expect(rigaRisorse(risorse({ ramMb: 1234 }))).toContain('RAM 1234 MB')
  })
})
