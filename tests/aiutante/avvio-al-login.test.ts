import { describe, expect, it } from 'vitest'
import { avvioAlLoginAmmesso } from '../../src/aiutante/avvio-al-login'

describe("avvio con Windows solo per l'Aiutante installato", () => {
  it("la copia installata si scrive nell'avvio", () => {
    expect(avvioAlLoginAmmesso('C:\\Utenti\\x\\AppData\\Local\\Programs\\SierraDeck Aiutante\\SierraDeck Aiutante.exe')).toBe(true)
  })
  it('una copia appena costruita no', () => {
    expect(avvioAlLoginAmmesso('D:\\progetto\\dist-aiutante\\win-unpacked\\SierraDeck Aiutante.exe')).toBe(false)
    expect(avvioAlLoginAmmesso('D:/progetto/.claude/worktrees/agente/SierraDeck Aiutante.exe')).toBe(false)
  })
})
