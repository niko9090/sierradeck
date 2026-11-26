import { describe, it, expect } from 'vitest'
import type { Autopilota } from '../../src/shared/autopilota'
import { conNomeSicuro, nomeODi, testoOVuoto } from '../../src/shared/nome-autopilota'
import { ledDi } from '../../src/shared/autopilota-vista'
import { chiChiede } from '../../src/shared/dove-chiedono'
import { pianoAutopilota } from '../../src/shared/panoramica'
import { autopilotiDaStato } from '../../src/shared/autopiloti-altri'

/**
 * k-351a: «Cannot read properties of undefined (reading 'trim')» in
 * VoceAutopilota (Z2-TECNICO, 0.122.4). Un autopilota letto da un altro PC con
 * un'altra versione arrivava senza `nome` (cast `as Autopilota`, nessun
 * controllo) e la Panoramica cadeva.
 */
const senzaNome = { id: 'a1', obiettivo: 'Rifai la pagina', cwd: 'C:\\x', stato: 'lavoro', sessionId: 's1' } as unknown as Autopilota

describe('il nome di un autopilota a prova di dati storti', () => {
  it('testoOVuoto: stringa com’è, il resto vuoto', () => {
    expect(testoOVuoto('ciao')).toBe('ciao')
    expect(testoOVuoto(undefined)).toBe('')
    expect(testoOVuoto(42)).toBe('')
    expect(testoOVuoto(null)).toBe('')
  })

  it('nomeODi: nome mancante, vuoto o non stringa dà la riserva', () => {
    expect(nomeODi({ nome: 'Eco' }, 'Autopilota')).toBe('Eco')
    expect(nomeODi({}, 'Autopilota')).toBe('Autopilota')
    expect(nomeODi({ nome: '  ' }, 'Autopilota')).toBe('Autopilota')
    expect(nomeODi({ nome: 7 }, 'Autopilota')).toBe('Autopilota')
  })

  it('alla fonte: conNomeSicuro porta nome e obiettivo mancanti o storti a ""', () => {
    const a = conNomeSicuro({ id: 'x', nome: 5, stato: 'lavoro' } as unknown as Autopilota)
    expect(a.nome).toBe('')
    expect(a.obiettivo).toBe('')
    expect(a.id).toBe('x')
    expect(conNomeSicuro(senzaNome).nome).toBe('')
    expect(conNomeSicuro(senzaNome).obiettivo).toBe('Rifai la pagina')
    expect(conNomeSicuro({ nome: 'Eco', obiettivo: 'o' }).nome).toBe('Eco')
  })

  it('l’elenco di un altro PC non lascia mai un nome mancante', () => {
    const righe = autopilotiDaStato({ autopiloti: [{ id: 'a1', stato: 'lavoro' }, { id: 'a2', nome: 3, obiettivo: 'Fai' }] })
    expect(righe.map((r) => r.nome)).toEqual(['a1', 'Fai'])
  })

  it('ledDi, chiChiede e pianoAutopilota non si rompono senza nome', () => {
    expect(ledDi(senzaNome).titolo).toBe('Rifai la pagina: lavoro')
    expect(chiChiede([{ ...senzaNome, stato: 'attesa' } as never], {})[0]?.nome).toBe('Rifai la pagina')
    expect(pianoAutopilota(senzaNome)[0]?.testo).toBe('Rifai la pagina')
  })

  it('senza nome e senza obiettivo, niente eccezioni', () => {
    const vuoto = { id: 'a1', cwd: 'C:\\x', stato: 'lavoro', sessionId: 's1' } as unknown as Autopilota
    expect(ledDi(vuoto).titolo).toBe(': lavoro')
    expect(pianoAutopilota(vuoto)[0]?.testo).toBe('')
  })
})
