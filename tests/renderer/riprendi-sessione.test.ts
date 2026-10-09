import { describe, it, expect } from 'vitest'
import { comeRiprendere } from '../../src/renderer/riprendi-sessione'

/**
 * «Riprendi» del PC (0.56.0). Provato dal vero sulla copia di prova il 09/10:
 * scegliendo una conversazione di questo PC nasceva una chat nuova e vuota
 * (sessione diversa) invece di riprendere quella scelta.
 */
const s = { uuid: '11111111-2222-4333-8444-555555555555', cwd: 'C:\\Progetti\\Esempio', projectPath: 'C:\\Progetti\\Esempio' }

describe('riprendere una conversazione dal PC', () => {
  it('una di qui si apre con il suo identificativo: è quella, non una nuova', () => {
    expect(comeRiprendere(s, undefined, [])).toEqual({ tipo: 'locale', cwd: 'C:\\Progetti\\Esempio', sessionUuid: s.uuid })
  })
  it('già a schermo: niente secondo riquadro; se dorme si sveglia', () => {
    expect(comeRiprendere(s, undefined, [{ id: 'p-1', sessionUuid: s.uuid }])).toEqual({ tipo: 'gia', paneId: 'p-1', sveglia: false })
    expect(comeRiprendere(s, undefined, [{ id: 'p-1', sessionUuid: s.uuid, ibernata: true }])).toEqual({ tipo: 'gia', paneId: 'p-1', sveglia: true })
  })
  it('di un altro PC acceso: dal vivo là; spento: qui, con il suo identificativo', () => {
    expect(comeRiprendere(s, { id: 'pc-esempio-id', nome: 'PC-ESEMPIO', vivo: true }, [])).toMatchObject({ tipo: 'remota', sessionUuid: s.uuid, remoto: { pcId: 'pc-esempio-id', sessione: s.uuid } })
    expect(comeRiprendere(s, { id: 'pc-esempio-id', nome: 'PC-ESEMPIO', vivo: false }, [])).toEqual({ tipo: 'locale', cwd: 'C:\\Progetti\\Esempio', sessionUuid: s.uuid })
  })
  it('senza cwd si usa il progetto', () => {
    expect(comeRiprendere({ uuid: 'u', projectPath: 'D:\\Altro' }, undefined, [])).toEqual({ tipo: 'locale', cwd: 'D:\\Altro', sessionUuid: 'u' })
  })
})
