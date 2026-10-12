import { describe, it, expect } from 'vitest'
import { trovaChatRemota, type ChatSuPc } from '@shared/pc-remoto'

/**
 * «Ci sono ancora chat che dice che non sono avviate quando invece lo sono»
 * (Nicholas, 12/10). Con la ripresa Claude Code può scrivere la conversazione
 * sotto un id nuovo: il PC di casa cercava l'id vecchio e rispondeva «non
 * aperta». Nomi d'esempio.
 */
const aperte: ChatSuPc[] = [
  { id: 'p1', sessione: 'nuovo-id', cwd: 'E:\\Progetti\\fionda', titolo: 'Errore sul telefono' },
  { id: 'p2', sessione: 'altra', cwd: 'E:\\Progetti\\fionda', titolo: 'Parte gestionale' }
]
const cerca = { pcId: 'pc-casa', pcNome: 'CASA', cwd: 'E:\\Progetti\\fionda\\', sessione: 'vecchio-id' }

describe('una chat aperta sul PC di casa con un id nuovo', () => {
  it('vale come aperta: stessa cartella e stesso titolo', () => {
    expect(trovaChatRemota(aperte, { ...cerca, titolo: 'errore sul telefono' })?.sessione).toBe('nuovo-id')
  })
  it('l’id giusto vince sempre', () => {
    expect(trovaChatRemota(aperte, { ...cerca, sessione: 'altra', titolo: 'Errore sul telefono' })?.sessione).toBe('altra')
  })
  it('senza titolo, o con un titolo diverso, o con due chat uguali, non si indovina', () => {
    expect(trovaChatRemota(aperte, cerca)).toBeUndefined()
    expect(trovaChatRemota(aperte, { ...cerca, titolo: 'Un’altra cosa' })).toBeUndefined()
    const doppie = [...aperte, { id: 'p3', sessione: 'terza', cwd: 'E:\\Progetti\\fionda', titolo: 'Errore sul telefono' }]
    expect(trovaChatRemota(doppie, { ...cerca, titolo: 'Errore sul telefono' })).toBeUndefined()
  })
  it('in un’altra cartella no', () => {
    expect(trovaChatRemota(aperte, { ...cerca, cwd: 'E:\\Progetti\\altro', titolo: 'Errore sul telefono' })).toBeUndefined()
  })
})
