import { describe, it, expect } from 'vitest'
import { segnaleVeroDa, leggiSegnaleVero } from '@shared/indicatore-autopilota'
import type { Segnale } from '@shared/segnali-chat'

// 0.85.0: i segnali veri delle chat. P4: l'indicatore a tre righe dell'autopilota
// di prima non c'è più (l'avanzamento lo mostrano la testa dell'orchestratore e
// la coda); restano i segnali veri, che il servizio misura per ogni chat.

const ORA = Date.parse('2026-10-23T09:00:00.000Z')
const fa = (min: number): string => new Date(ORA - min * 60_000).toISOString()

const segnale = (evento: Segnale['evento'], min: number, extra: Partial<Segnale> = {}): Segnale => ({ sessione: 's-1', evento, quando: fa(min), ...extra })

describe('segnaleVeroDa: solo quello che la chat fa davvero', () => {
  it('commit, test, file cambiati, terminale; non i messaggi consegnati dal servizio', () => {
    expect(segnaleVeroDa([segnale('PostToolUse', 3, { strumento: 'Bash', comando: 'git commit -m "feat: x"' })])).toEqual({ tipo: 'commit', quando: fa(3) })
    expect(segnaleVeroDa([segnale('PreToolUse', 3, { strumento: 'Bash', comando: 'npx vitest run tests/shared' })])?.tipo).toBe('test')
    expect(segnaleVeroDa([segnale('PostToolUse', 3, { strumento: 'Edit', dettaglio: 'src/a.ts' })])?.tipo).toBe('file')
    expect(segnaleVeroDa([segnale('PostToolUse', 3, { strumento: 'Read' }), segnale('Stop', 2)])).toEqual({ tipo: 'terminale', quando: fa(2) })
    // Il servizio che consegna un turno non è un segnale della chat.
    expect(segnaleVeroDa([segnale('PostToolUse', 30, { strumento: 'Edit' }), segnale('UserPromptSubmit', 1), segnale('SessionStart', 1)])).toEqual({ tipo: 'file', quando: fa(30) })
    expect(segnaleVeroDa([segnale('UserPromptSubmit', 1)])).toBeUndefined()
  })
  it('legge dal JSON solo segni ben fatti', () => {
    expect(leggiSegnaleVero({ tipo: 'commit', quando: fa(1) })).toEqual({ tipo: 'commit', quando: fa(1) })
    expect(leggiSegnaleVero({ tipo: 'avanti', quando: fa(1) })).toBeUndefined()
    expect(leggiSegnaleVero({ tipo: 'test', quando: 'ieri' })).toBeUndefined()
  })
})
