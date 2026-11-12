import { describe, it, expect } from 'vitest'
import { autoreValido, programmaAiuto, scegliPosto, type Aiutante } from '../../src/shared/aiuto-rete'

/**
 * 12/11, Nicholas: «SierraDeck se vede che c'è collegato un aiutante
 * preferirà sempre prima quelli che un altro PC». L'ordine: Aiutanti con posto
 * (il più libero), poi i PC «dedicati», poi questo PC se ha posto, poi i PC
 * che prestano i posti liberi.
 */
const pc = (nome: string, modo: Aiutante['modo'], liberi: number, aiutante = false): Aiutante =>
  ({ pcId: `id-${nome}`, nome, modo, liberi, ...(aiutante ? { programma: 'aiutante' as const } : {}) })

describe('scegliPosto con gli Aiutanti', () => {
  it('un Aiutante con posto vince su un PC dedicato più libero', () => {
    expect(scegliPosto([pc('Dedicato', 'dedicato', 6), pc('Aiu', 'dedicato', 1, true)], 0)?.nome).toBe('Aiu')
  })
  it('un Aiutante con posto vince anche se questo PC ha posto', () => {
    expect(scegliPosto([pc('Aiu', 'dedicato', 1, true)], 5)?.nome).toBe('Aiu')
  })
  it('fra più Aiutanti, il più libero', () => {
    expect(scegliPosto([pc('A1', 'dedicato', 1, true), pc('A2', 'dedicato', 3, true)], 0)?.nome).toBe('A2')
  })
  it('un Aiutante pieno non conta: poi i dedicati, poi questo PC, poi i posti liberi', () => {
    expect(scegliPosto([pc('Aiu', 'dedicato', 0, true), pc('Ded', 'dedicato', 2)], 3)?.nome).toBe('Ded')
    expect(scegliPosto([pc('Aiu', 'dedicato', 0, true), pc('Lib', 'posti-liberi', 2)], 3)).toBeUndefined()
    expect(scegliPosto([pc('Aiu', 'dedicato', 0, true), pc('Lib', 'posti-liberi', 2)], 0)?.nome).toBe('Lib')
  })
  it('un Aiutante in pausa («no») non riceve niente', () => {
    expect(scegliPosto([pc('Aiu', 'no', 4, true)], 0)).toBeUndefined()
  })
  it('senza Aiutanti tutto come prima (0.103.0)', () => {
    expect(scegliPosto([pc('A', 'posti-liberi', 3), pc('B', 'dedicato', 1)], 2)?.nome).toBe('B')
    expect(scegliPosto([pc('A', 'posti-liberi', 3)], 1)).toBeUndefined()
  })
})

describe('programma e autore da fuori', () => {
  it('programma: solo «aiutante» vale', () => {
    expect(programmaAiuto('aiutante')).toBe('aiutante')
    expect(programmaAiuto('SierraDeck')).toBeUndefined()
    expect(programmaAiuto(undefined)).toBeUndefined()
  })
  it('autore di git: nome ed email puliti, il resto si scarta', () => {
    expect(autoreValido({ nome: ' Mario ', email: 'mario@example.com' })).toEqual({ nome: 'Mario', email: 'mario@example.com' })
    expect(autoreValido({ nome: 'Mario', email: 'senza-chiocciola' })).toBeUndefined()
    expect(autoreValido({ nome: 'a\nb', email: 'a@b.c' })).toBeUndefined()
    expect(autoreValido({ nome: '', email: 'a@b.c' })).toBeUndefined()
    expect(autoreValido('x')).toBeUndefined()
  })
})
