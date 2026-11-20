import { describe, expect, it } from 'vitest'
import { VARIABILE_CODE_MODE, ambienteCodeMode, ambienteCodeModeAutopilota } from '@shared/code-mode'
import { PREFERENZE_PREDEFINITE, normalizzaPreferenze } from '@shared/preferenze'
import { buildClaudeArgs } from '../../src/main/config'

describe('code mode', () => {
  it('acceso: l ambiente delle chat contiene la variabile', () => {
    expect(ambienteCodeMode(true)).toEqual({ [VARIABILE_CODE_MODE]: '1' })
  })

  it('spento o assente: nessuna variabile', () => {
    expect(ambienteCodeMode(false)).toEqual({})
    expect(ambienteCodeMode(undefined)).toEqual({})
  })

  it('e spento di default e la preferenza si legge dal file', () => {
    expect(PREFERENZE_PREDEFINITE.codeMode).toBeUndefined()
    expect(normalizzaPreferenze({ codeMode: true }).codeMode).toBe(true)
    expect(normalizzaPreferenze({ codeMode: 'si' }).codeMode).toBeUndefined()
  })

  it('gli argomenti della chat non cambiano (si passa per l ambiente)', () => {
    expect(buildClaudeArgs('u1').join(' ')).not.toContain('CODE_MODE')
  })

  it('l autopilota (-p) non lo riceve mai: con -p non vale', () => {
    expect(ambienteCodeModeAutopilota()).toEqual({})
  })
})
