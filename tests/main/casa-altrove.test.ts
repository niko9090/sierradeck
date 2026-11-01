import { describe, it, expect } from 'vitest'
import { rifiutoCasaAltrove } from '../../src/main/casa-altrove'

describe('rifiutoCasaAltrove: il proprietario prima della convalida dello spawn', () => {
  const richiesta = { sessionUuid: 'aaaaaaaa-0000-0000-0000-000000000001', cwd: 'Z:\\cartella\\che\\qui\\non\\c-e' }

  it('cartella assente + progetto di un altro PC: messaggio «vive su <PC>»', () => {
    const m = rifiutoCasaAltrove(richiesta, () => ({ id: 'pc-2', nome: 'PORTATILE', motivo: '' }))
    expect(m).toBeDefined()
    expect(m).toContain('CHAT_DI_UN_ALTRO_PC:')
    expect(m).toContain('il progetto vive su PORTATILE')
    expect(m).not.toContain('cwd non accessibile')
  })

  it('progetto di questo PC: niente rifiuto, la convalida decide', () => {
    expect(rifiutoCasaAltrove(richiesta, () => undefined)).toBeUndefined()
  })

  it('richiesta malformata: non si interpella nessuno', () => {
    let chiamate = 0
    const f = (): undefined => { chiamate += 1; return undefined }
    expect(rifiutoCasaAltrove(null, f)).toBeUndefined()
    expect(rifiutoCasaAltrove({ sessionUuid: 1, cwd: '' }, f)).toBeUndefined()
    expect(chiamate).toBe(0)
  })
})
