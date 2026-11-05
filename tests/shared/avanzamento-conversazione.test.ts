import { describe, it, expect } from 'vitest'
import { rigaTraguardo } from '../../src/shared/chat-autopilota'
import { separaConversazione } from '../../src/shared/panoramica'

/** 0.92.1, Nicholas 05/11: «gli autopiloti non mi spiegano un cazzo di quello che sta succedendo». */
describe('cosa succede, nella conversazione con l’autopilota (0.92.1)', () => {
  it('la riga del programma si legge com’è, e sta nella conversazione (non nascosta in «Cosa è successo»)', () => {
    const testo = rigaTraguardo({ chats: [] }, { chat: 'toolu_1', esito: 'avanzamento', nota: 'Al lavoro: Lo sviluppatore — rifà la pagina di accesso.' })
    expect(testo).toBe('Al lavoro: Lo sviluppatore — rifà la pagina di accesso.')
    expect(rigaTraguardo({ chats: [] }, { chat: 'x', esito: 'avanzamento' })).toBeUndefined()
    const { messaggi } = separaConversazione([{ da: 'nota' as const, tono: 'traguardo', testo: testo! }])
    expect(messaggi).toHaveLength(1)
  })
})
