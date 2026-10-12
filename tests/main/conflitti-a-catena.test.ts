import { describe, it, expect } from 'vitest'
import { eCopiaDiConflitto, nomeCopiaConflitto } from '../../src/main/cassaforte/incrementale'

/**
 * Le copie di conflitto a catena (0.67.1): una copia di conflitto che andava in
 * conflitto a sua volta generava `a.conflitto-drive-….conflitto-torre-….ts`, e
 * così via a ogni giro fra due PC.
 */
describe('copie di conflitto, mai a catena', () => {
  it('riconosce una copia di conflitto dal nome', () => {
    expect(eCopiaDiConflitto('src/main.conflitto-torre-20260904-213000.ts')).toBe(true)
    expect(eCopiaDiConflitto('src/main.ts')).toBe(false)
    expect(eCopiaDiConflitto('note/conflitto-con-il-cliente.md')).toBe(false)
  })
  it('il nome di una copia riparte dal nome vero, senza un segno sopra l’altro', () => {
    expect(nomeCopiaConflitto('src/main.ts', 'Torre', '2026-09-04T21:30:00Z')).toBe('src/main.conflitto-torre-20260904-213000.ts')
    expect(nomeCopiaConflitto('src/main.conflitto-drive-20260904-213000.ts', 'Torre', '2026-10-12T10:00:00Z')).toBe('src/main.conflitto-torre-20261012-100000.ts')
  })
})
