import { describe, expect, it } from 'vitest'
import { livelloControlloClaude, scriviControlloClaude, type EsitoClaude } from '../../src/aiutante/controllo-claude'

const e = (stato: EsitoClaude['stato']): EsitoClaude => ({ stato })

describe('scriviControlloClaude', () => {
  const prova = () => {
    const info: string[] = []
    const errori: string[] = []
    return { info, errori, registro: { info: (m: string) => { info.push(m) }, errore: (m: string) => { errori.push(m) } } }
  }
  it('accesso mancante (loggedIn false): niente errore, una riga [avviso] info', () => {
    const p = prova()
    scriviControlloClaude(p.registro, undefined, { stato: 'accesso', estratto: 'loggedIn: false' }, true)
    expect(p.errori).toEqual([])
    expect(p.info).toHaveLength(1)
    expect(p.info[0]).toContain('[avviso] [claude] Claude non collegato o accesso scaduto')
    expect(p.info[0]).toContain('loggedIn: false')
  })
  it('accesso mancante di nuovo: nessuna riga; da ok: ancora avviso, mai errore', () => {
    const p = prova()
    scriviControlloClaude(p.registro, e('accesso'), e('accesso'), false)
    scriviControlloClaude(p.registro, e('ok'), e('accesso'), false)
    expect(p.errori).toEqual([])
    expect(p.info).toHaveLength(1)
  })
  it('Claude non installato resta un errore', () => {
    const p = prova()
    scriviControlloClaude(p.registro, undefined, e('mancante'), false)
    expect(p.errori).toHaveLength(1)
    expect(p.info).toEqual([])
  })
})

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
