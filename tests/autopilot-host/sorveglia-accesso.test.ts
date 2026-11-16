import { describe, expect, it } from 'vitest'
import { confrontaAccesso, impronta } from '../../src/autopilot-host/sorveglia-accesso'

describe('sorveglianza dell’accesso a Claude', () => {
  it('login rifatto: si riprova subito, senza spegnere i processi', () => {
    expect(confrontaAccesso({ credenziali: '1|10', gettone: '' }, { credenziali: '2|10', gettone: '' })).toEqual({ riavvia: false, perche: 'login di Claude rifatto' })
  })
  it('gettone salvato o cambiato: anche i processi fermi ripartono col nuovo ambiente', () => {
    expect(confrontaAccesso({ credenziali: '1|10', gettone: '' }, { credenziali: '1|10', gettone: '5|300' })?.riavvia).toBe(true)
    expect(confrontaAccesso({ credenziali: '1|10', gettone: '5|300' }, { credenziali: '1|10', gettone: '6|320' })?.riavvia).toBe(true)
  })
  it('niente di cambiato, o credenziali sparite (logout): niente', () => {
    expect(confrontaAccesso({ credenziali: '1|10', gettone: '5|3' }, { credenziali: '1|10', gettone: '5|3' })).toBeUndefined()
    expect(confrontaAccesso({ credenziali: '1|10', gettone: '' }, { credenziali: '', gettone: '' })).toBeUndefined()
  })
  it('impronta di un file che non c’è: vuota', () => {
    expect(impronta('C:\\non\\esiste.json', () => { throw new Error('ENOENT') })).toBe('')
    expect(impronta('x', () => ({ mtimeMs: 3, size: 4 }))).toBe('3|4')
  })
})
