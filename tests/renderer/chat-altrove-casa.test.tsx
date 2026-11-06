import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { attesaPerCasaIgnota, statoVersioneVecchia, versioneTroppoVecchia, VERSIONE_MIN_VISTA_DAL_VIVO } from '@shared/apertura-chat'

/**
 * k-58: il cartello «È ospitata da X ... sposta il progetto» non esiste piu'.
 * Una chat con la casa altrove, se non si sa decidere, aspetta e riprova da
 * sola; il cartello d'attesa dice il motivo in una riga, il resto dietro «?».
 */
const sorgente = readFileSync('src/renderer/components/Terminal.tsx', 'utf8')

describe('il riquadro di una chat con la casa su un altro PC', () => {
  it('non dice piu «sposta il progetto» come unica strada', () => {
    expect(sorgente).not.toContain('sposta il progetto da Progetti')
    expect(sorgente).not.toContain('È ospitata da {nomeAltrove}')
  })

  it('con la casa altrove, «locale» o una domanda caduta portano all attesa, non al cartello', () => {
    expect(sorgente).toContain('if (c.casa === true) applica(attesaPerCasaIgnota(c), () => undefined)')
    expect(sorgente).toMatch(/if \(a\.tipo === 'locale'\) ripiego\(\); else applica\(a, ripiego\)/)
  })

  it('l attesa ha una riga corta, il «?» e la cassetta', () => {
    expect(sorgente).toContain('<Aiuto di="perché la chat non si apre dal vivo">')
    expect(sorgente).toContain('Scrivile là, nella cassetta')
    expect(sorgente).toContain('Ricontrolla adesso')
  })

  it('la regola «una chat, un PC» resta: con la casa altrove niente «apri qui lo stesso»', () => {
    expect(sorgente).toContain('{inAttesaDi.perCasa === true ? null : (')
  })
})

describe('l attesa per una casa che non si sa decidere', () => {
  it('tiene la casa e dice che riprova da sola', () => {
    const a = attesaPerCasaIgnota({ cwd: 'Z:/p', pc: { id: 'pc-b', nome: 'PC-B' }, sessionUuid: 's1', perche: 'il progetto vive su PC-B' })
    expect(a).toMatchObject({ tipo: 'attesa', perCasa: true, pc: { id: 'pc-b' }, sessione: 's1', perche: 'il progetto vive su PC-B' })
    expect(a.statoPc?.cosaFare).toContain('ogni 20 secondi')
  })
})

describe('la versione per la vista dal vivo', () => {
  it('prima della minima è troppo vecchia; la minima e le successive no', () => {
    expect(versioneTroppoVecchia('0.40.0')).toBe(true)
    expect(versioneTroppoVecchia('0.58.3')).toBe(true)
    expect(versioneTroppoVecchia(VERSIONE_MIN_VISTA_DAL_VIVO)).toBe(false)
    expect(versioneTroppoVecchia('0.95.5')).toBe(false)
    expect(versioneTroppoVecchia('1.0.0')).toBe(false)
  })

  it('una versione assente o illeggibile non si giudica', () => {
    expect(versioneTroppoVecchia(undefined)).toBe(false)
    expect(versioneTroppoVecchia('')).toBe(false)
    expect(versioneTroppoVecchia('boh')).toBe(false)
  })

  it('il testo dice «aggiorna quel PC» con le due versioni', () => {
    const s = statoVersioneVecchia('PC-B', '0.40.0')
    expect(s.cosaFare).toContain('Aggiorna PC-B')
    expect(s.cosaFare).toContain('0.40.0')
    expect(s.cosaFare).toContain(VERSIONE_MIN_VISTA_DAL_VIVO)
  })
})
