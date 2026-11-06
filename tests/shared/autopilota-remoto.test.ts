import { describe, it, expect } from 'vitest'
import { autopilotaDelPcRemoto, letturaSpecialisti, rigaPcNonRisponde } from '../../src/shared/autopilota-remoto'
import { rottaAutopilotaAltroPc } from '../../src/shared/autopiloti-altri'
import { rottaPonte } from '../../src/shared/ponte-telefono'

/** k-60: la chat dell'autopilota di un altro PC, con gli specialisti di quel PC. */
describe('autopilotaDelPcRemoto', () => {
  const righe = [
    { id: 'a1', nome: 'Uno', stato: 'lavoro', workspace: 'Prova' },
    { id: 'a2', nome: 'Due', stato: 'attesa', workspace: 'Altro' },
    { id: 'a3', nome: 'Vecchio', stato: 'attesa', workspace: 'Prova', archiviato: true }
  ]
  it('trova quello del workspace, non gli archiviati né gli altri', () => {
    expect(autopilotaDelPcRemoto(righe, 'Prova')?.id).toBe('a1')
    expect(autopilotaDelPcRemoto(righe, 'Altro')?.id).toBe('a2')
    expect(autopilotaDelPcRemoto(righe, 'Nessuno')).toBeUndefined()
  })
})

describe('letturaSpecialisti', () => {
  const vista = { posti: { usati: 1, tetto: 4 }, alLavoro: [], inFila: [] }
  it('una lista valida passa com’è', () => {
    expect(letturaSpecialisti({ ok: true, dati: vista }, 'PC-prova')).toEqual({ tipo: 'lista', vista })
  })
  it('una risposta storta o una rotta sconosciuta: quel PC va aggiornato', () => {
    expect(letturaSpecialisti({ ok: true, dati: {} }, 'PC-prova').tipo).toBe('vecchio')
    expect(letturaSpecialisti({ ok: false, stato: 404, messaggio: 'x' }, 'PC-prova').tipo).toBe('vecchio')
  })
  it('PC spento o che non risponde: una riga chiara con il suo nome', () => {
    const r = letturaSpecialisti({ ok: false, stato: 502, messaggio: 'non risponde' }, 'PC-prova')
    expect(r).toEqual({ tipo: 'giu', avviso: rigaPcNonRisponde('PC-prova') })
    expect(rigaPcNonRisponde('PC-prova')).toContain('PC-prova è spento o non risponde')
  })
})

describe('la lista d’attesa passa verso l’altro PC', () => {
  it('dal PC e dal telefono, in sola lettura', () => {
    expect(rottaAutopilotaAltroPc('/api/specialisti/attesa')).toBe(true)
    expect(rottaPonte('/api/specialisti/attesa')).toBe(true)
    // La precedenza e il «Ferma» restano del PC dove si lavora.
    expect(rottaAutopilotaAltroPc('/api/specialisti/attesa/priorita')).toBe(false)
    expect(rottaPonte('/api/specialisti/attesa/priorita')).toBe(false)
  })
})
