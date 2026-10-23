import { describe, it, expect } from 'vitest'
import { conNomiDelleChat } from '@shared/chat-autopilota'

// 0.84.3 (collaudo c-96 D4): le note di lavoro dicono le chat per nome.
const a = { chats: [
  { id: 'c-1', compito: 'Il menu nuovo', stato: 'lavoro' as const, cicli: 1, ruolo: 'sviluppo' as const },
  { id: 'c-2', compito: 'La pagina del telefono', stato: 'lavoro' as const, cicli: 1 }
] }

describe('conNomiDelleChat', () => {
  it('la sigla diventa il ruolo, o il compito per una chat senza ruolo', () => {
    expect(conNomiDelleChat(a, 'la chat c-1 non dà segnali da 6 minuti')).toBe('Sviluppo non dà segnali da 6 minuti')
    expect(conNomiDelleChat(a, 'c-2: nessun segnale da 15 min')).toBe('la chat «La pagina del telefono»: nessun segnale da 15 min')
  })

  it('niente doppioni col ruolo davanti, i rami restano, le sigle sconosciute pure', () => {
    expect(conNomiDelleChat(a, 'Sviluppo c-1: OK, il ramo ap/x/c-1 è unito')).toBe('Sviluppo: OK, il ramo ap/x/c-1 è unito')
    expect(conNomiDelleChat(a, 'c-9 non c’è più')).toBe('c-9 non c’è più')
  })
})
