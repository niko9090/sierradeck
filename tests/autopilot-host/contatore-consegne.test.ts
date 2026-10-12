import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { apriArchivio, ultimoNumeroConsegne } from '../../src/autopilot-host/archivio'

/**
 * «STO SCRIVENDO NEGLI AUTOPILOTI MA NON RIESCONO AD IMPARTIRE ORDINI ALLE CHAT»
 * (Nicholas, 12/10). `elenca` leggeva anche `consegne-numero.json`, che non è
 * un autopilota, e lo metteva da parte come «illeggibile» a ogni giro: 47 copie,
 * il contatore spariva e le consegne ripartivano da c-1 (0.68.1).
 */
describe('il contatore delle consegne', () => {
  it('sopravvive a elenca(): non è un autopilota e non si mette da parte', () => {
    const d = mkdtempSync(join(tmpdir(), 'sd-contatore-'))
    writeFileSync(join(d, 'consegne-numero.json'), JSON.stringify({ ultimo: 41 }))
    const a = apriArchivio(d)
    for (let i = 0; i < 5; i += 1) expect(a.elenca()).toEqual([])
    expect(existsSync(join(d, 'consegne-numero.json'))).toBe(true)
    expect(readdirSync(d).filter((n) => n.includes('.illeggibile'))).toEqual([])
    // E a un riavvio si riparte da lì.
    expect(ultimoNumeroConsegne(d)).toBe(41)
  })
  it('all’avvio riparte dal numero più alto fra il contatore e le copie messe da parte per sbaglio', () => {
    const d = mkdtempSync(join(tmpdir(), 'sd-contatore-'))
    writeFileSync(join(d, 'consegne-numero.json.illeggibile-1'), JSON.stringify({ ultimo: 3 }))
    writeFileSync(join(d, 'consegne-numero.json.illeggibile-2'), JSON.stringify({ ultimo: 57 }))
    writeFileSync(join(d, 'consegne-numero.json.illeggibile-3'), 'rotto')
    writeFileSync(join(d, 'ap-1.json.illeggibile-1'), JSON.stringify({ ultimo: 999 }))
    expect(ultimoNumeroConsegne(d)).toBe(57)
    writeFileSync(join(d, 'consegne-numero.json'), JSON.stringify({ ultimo: 60 }))
    expect(ultimoNumeroConsegne(d)).toBe(60)
  })
})
