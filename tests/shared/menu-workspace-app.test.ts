import { describe, it, expect } from 'vitest'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { azioniMenuWorkspace, gruppiMenuWorkspace } from '../../src/shared/menu-workspace'

/**
 * Il menu dei workspace (0.82.0) nell'app: le regole sono ricopiate in Kotlin
 * (`MenuWorkspace.kt`) e confrontate con
 * `android/app/src/test/resources/menu-workspace/menu-0.82.json`, scritto da
 * qui con `AGGIORNA=1`: gruppi e azioni uguali a PC e pagina.
 */
const trenta = Array.from({ length: 30 }, (_, i) => `Prova ${String(i + 1).padStart(2, '0')}`)
const altrove = [{ pc: 'p2', nome: 'Portatile', workspace: ['Prova 01', 'Solo di là', 'Dèsk di là'] }, { pc: 'p3', nome: 'Fisso', workspace: [] }]
const CASI_GRUPPI = [
  { nome: 'trenta con recenti', p: { nomi: trenta, attivo: 'Prova 07', recenti: ['Prova 03', 'Sparito', 'Prova 07', 'Prova 20', 'Prova 21', 'Prova 22', 'Prova 23'], altrove } },
  { nome: 'pochi', p: { nomi: ['A', 'B', 'C'], attivo: 'B', recenti: ['C'], altrove: [] } },
  { nome: 'ricerca', p: { nomi: [...trenta, 'Dèsk'], attivo: 'Prova 01', recenti: ['Prova 02'], filtro: ' DESK ', altrove } },
  { nome: 'ricerca vuota', p: { nomi: trenta, attivo: 'Prova 01', recenti: [], filtro: 'zzz', altrove: [] } },
  { nome: 'con nome del PC', p: { nomi: trenta, attivo: 'Prova 30', recenti: [], nomePc: 'PC prova', altrove: [] } }
]
const CASI_AZIONI = [
  { nome: 'di qui', v: { nome: 'B', qui: true }, p: { attivo: 'A', quanti: 3 } },
  { nome: 'davanti, ultimo', v: { nome: 'A', qui: true }, p: { attivo: 'A', quanti: 1 } },
  { nome: 'di un altro PC', v: { nome: 'C', qui: false, pc: { id: 'p2', nome: 'Portatile' } }, p: { attivo: 'A', quanti: 2 } }
]

function esempio(): Record<string, unknown> {
  return {
    gruppi: CASI_GRUPPI.map((c) => ({ nome: c.nome, ingresso: c.p, gruppi: gruppiMenuWorkspace(c.p) })),
    azioni: CASI_AZIONI.map((c) => ({ nome: c.nome, voce: c.v, ingresso: c.p, azioni: azioniMenuWorkspace(c.v, c.p) }))
  }
}

describe('il menu dei workspace nell’app (0.82.0)', () => {
  it('l’app ha gli stessi casi (resources/menu-workspace/menu-0.82.json)', () => {
    const fatto = esempio()
    const file = join('android', 'app', 'src', 'test', 'resources', 'menu-workspace', 'menu-0.82.json')
    if (process.env.AGGIORNA === '1') {
      mkdirSync(join(file, '..'), { recursive: true })
      writeFileSync(file, `${JSON.stringify(fatto, null, 2)}\n`)
    }
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(fatto)
  })
})
