import { describe, it, expect } from 'vitest'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { byteLeggibili, misura, nuovaPulizia, proposteDiPulizia, type FileDrive, type IndiceDrive, type StatoSpazio } from '../../src/shared/spazio-drive'

/**
 * Lo spazio sul Drive come lo manda un PC alla 0.65.0 dentro
 * `/api/drive/pannello` (`spazio`), su dati d'esempio fatti dalle funzioni
 * vere. L'app lo legge da `android/app/src/test/resources/spazio-drive/spazio-0.65.json`
 * (SpazioDriveTest). `AGGIORNA=1` riscrive.
 */
const ORA = Date.parse('2026-10-12T12:00:00Z')
const GIORNO = 86_400_000

function esempio(): StatoSpazio {
  const indice: IndiceDrive = {
    'chat/slug-a/aaaa.jsonl': { nome: 'f_a1', size: 5000, mtime: ORA - 90 * GIORNO },
    'chat/slug-b/aaaa.jsonl': { nome: 'f_a2', size: 4000, mtime: ORA - 90 * GIORNO },
    'progetto-p1/src/main.ts': { nome: 'f_p', size: 700, mtime: ORA }
  }
  const file: FileDrive[] = [
    { nome: 'f_a1', byte: 5_200_000 }, { nome: 'f_a2', byte: 4_100_000 }, { nome: 'f_p', byte: 800 },
    { nome: 'pc-esempio', byte: 9000 }, { nome: 'sierradeck.manifesto', byte: 2_000_000 }
  ]
  const proposte = proposteDiPulizia({ file, indice, copieSuiPc: new Map(), adesso: ORA })
  const pulizia = nuovaPulizia(proposte[0]!, { id: 'pulizia-esempio', chi: 'PC-ESEMPIO', adesso: ORA - GIORNO })
  return {
    misura: misura({ file, indice, quota: { limite: 15 * 1024 ** 3, usato: 3.2 * 1024 ** 3 }, adesso: ORA }),
    proposte,
    pulizie: [pulizia, { ...pulizia, id: 'pulizia-annullata', annullataIl: new Date(ORA).toISOString() }]
  }
}

describe('lo spazio sul Drive per l’app', () => {
  it('la risposta d’esempio è quella che l’app legge nei suoi test', () => {
    const file = join(__dirname, '..', '..', 'android', 'app', 'src', 'test', 'resources', 'spazio-drive', 'spazio-0.65.json')
    const atteso = `${JSON.stringify(esempio(), null, 2)}\n`
    if (process.env.AGGIORNA === '1' || !existsSync(file)) { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, atteso) }
    expect(readFileSync(file, 'utf8').replace(/\r\n/g, '\n')).toBe(atteso)
  })
  it('i testi che l’app rifà sono quelli del PC', () => {
    // SpazioDriveTest controlla le stesse stringhe dal lato Kotlin.
    expect(byteLeggibili(11_309_800)).toBe('11 MB')
    expect(byteLeggibili(9_300_000)).toBe('8,9 MB')
    expect(byteLeggibili(15 * 1024 ** 3)).toBe('15 GB')
    expect(byteLeggibili(3.2 * 1024 ** 3)).toBe('3,2 GB')
  })
})
