import { describe, it, expect } from 'vitest'
import { registroConIlDrive } from '../../src/main/cassaforte/fusione'
import { gruppoDiId, raggruppaProgetti } from '@shared/progetti-unificati'
import type { RegistroProgetti } from '../../src/main/progetti/registro'

/**
 * «Togli da questo PC» offerto dal pannello e rifiutato dalla rimozione
 * (portatile, 12/10, 0.68.0): il pannello legge il registro di qui insieme a
 * quello del Drive, la rimozione leggeva solo quello di qui. Il progetto (con la
 * cartella di questo PC) c'era solo nel registro del Drive, e la rimozione
 * rispondeva «il progetto non ha una cartella». Ora tutte e due usano lo stesso.
 */
describe('il progetto di «Togli da questo PC» si cerca nello stesso registro del pannello', () => {
  const qui: RegistroProgetti = { versione: 1, progetti: [{ id: 'altro', nome: 'Altro', percorsi: { 'pc-qui': 'D:\\Progetti\\Altro' }, aggiuntoIl: '2026-10-01T00:00:00Z' }] }
  const drive: RegistroProgetti = { versione: 1, progetti: [{ id: 'prova', nome: 'SierraDeck-prova-x', percorsi: { 'pc-casa': 'C:\\P\\SierraDeck-prova-x', 'pc-qui': 'D:\\Progetti\\SierraDeck-prova-x' }, aggiuntoIl: '2026-10-01T00:00:00Z' }] }
  it('solo nel registro di qui non c’è: era il difetto', () => {
    expect(gruppoDiId(raggruppaProgetti(qui.progetti), 'prova')).toBeUndefined()
  })
  it('nel registro del pannello c’è, con la cartella di questo PC', () => {
    const completo = registroConIlDrive(qui, drive, () => true)
    const g = gruppoDiId(raggruppaProgetti(completo.progetti), 'prova')
    expect(g?.percorsi.find((p) => p.pc === 'pc-qui')?.percorso).toBe('D:\\Progetti\\SierraDeck-prova-x')
  })
})
