import { describe, expect, it } from 'vitest'
import { breve } from '../../src/shared/salute-vista'
import { titoloErrore } from '../../src/shared/salute'
import { erroreAltroPc } from '../../src/shared/autopiloti-altri'
import { cartellaMadre, ultimoPezzo } from '../../src/shared/progetti-identita'
import { nomeNormalizzato, senzaSuffissi } from '../../src/shared/progetti-unificati'
import { rigaDelGuasto } from '../../src/renderer/cartelle-sparite'

// Dati che arrivano dal Drive o da altri PC possono mancare: nessuna di queste cade.
const niente = undefined as unknown as string

describe('replace su valori che possono mancare', () => {
  it('Salute: breve e titoloErrore', () => {
    expect(breve(niente)).toBe('')
    expect(titoloErrore(niente)).toBe('')
    expect(breve('  una   riga ')).toBe('una riga')
  })
  it('Autopiloti: erroreAltroPc senza messaggio', () => {
    expect(erroreAltroPc('PC-Fisso', niente, [])).toContain('PC-Fisso non risponde')
  })
  it('Progetti: percorsi e nomi mancanti', () => {
    expect(ultimoPezzo(niente)).toBe('')
    expect(cartellaMadre(niente)).toBe('')
    expect(senzaSuffissi(niente)).toBe('')
    expect(nomeNormalizzato(niente)).toBe('')
    expect(ultimoPezzo('C:\\a\\b\\')).toBe('b')
  })
  it('Chat: rigaDelGuasto senza dettaglio', () => {
    const r = rigaDelGuasto({ caso: 'altro', titolo: 't', dettaglio: niente } as never, { sessionUuid: 'u', cwd: 'c' })
    expect(r.testo).toContain('non si apre')
  })
})
