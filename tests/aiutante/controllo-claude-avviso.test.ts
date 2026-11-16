import { describe, expect, it } from 'vitest'
import { livelloControlloClaude, type EsitoClaude } from '../../src/aiutante/controllo-claude'

const e = (stato: EsitoClaude['stato']): EsitoClaude => ({ stato })

describe('livelloControlloClaude', () => {
  it('avvio con accesso mancante: avviso, non errore', () => {
    expect(livelloControlloClaude(undefined, e('accesso'))).toBe('avviso')
  })
  it('avvio con «non risponde»: errore', () => {
    expect(livelloControlloClaude(undefined, e('altro'))).toBe('errore')
  })
  it('mancante e limite sono errori', () => {
    expect(livelloControlloClaude(undefined, e('mancante'))).toBe('errore')
    expect(livelloControlloClaude(e('ok'), e('limite'))).toBe('errore')
  })
  it('da accesso ad accesso: nessuna riga', () => {
    expect(livelloControlloClaude(e('accesso'), e('accesso'))).toBeUndefined()
  })
  it('da ok ad accesso: avviso', () => {
    expect(livelloControlloClaude(e('ok'), e('accesso'))).toBe('avviso')
  })
  it('da accesso a ok: info', () => {
    expect(livelloControlloClaude(e('accesso'), e('ok'))).toBe('info')
  })
  it('da ok a ok: nessuna riga; all\'avvio ok: info', () => {
    expect(livelloControlloClaude(e('ok'), e('ok'))).toBeUndefined()
    expect(livelloControlloClaude(undefined, e('ok'))).toBe('info')
  })
})
