import { describe, it, expect } from 'vitest'
import { nuovoAutopilota, ultimoTraguardoDi, ESITI_TRAGUARDO, type Autopilota } from '../../src/shared/autopilota'
import { conversazione, rigaTraguardo } from '../../src/shared/chat-autopilota'
import { separaConversazione } from '../../src/shared/panoramica'
import { paginaClient } from '../../src/main/client-pagina'

/**
 * «Nicholas partecipe» (0.81.0, punto 4): nella conversazione righe brevi solo
 * per gli eventi che contano — chat aperta, unita, mai partita, muta, finita,
 * ferma — e mai una per ogni giro.
 */
const ap = (over: Partial<Autopilota> = {}): Autopilota => ({
  ...nuovoAutopilota({ id: 'ap-1', nome: 'Notte', obiettivo: 'Rifai il menu', cwd: 'C:\\Progetti\\Esempio', iniziatoIl: '2026-10-20T07:00:00.000Z' }),
  ...over
})
const flotta = ap({
  chats: [
    { id: 'c-1', stato: 'lavoro', cicli: 0, compito: 'Il motore del menu', ruolo: 'sviluppo' },
    { id: 'c-2', stato: 'lavoro', cicli: 0, compito: 'Le prove del menu', ruolo: 'collaudo' }
  ] as Autopilota['chats']
})

describe('le righe nuove', () => {
  it('chat aperta e ramo unito, con il compito', () => {
    expect(rigaTraguardo(flotta, { chat: 'c-1', esito: 'aperta' })).toMatch(/: comincia «Il motore del menu»\.$/)
    expect(rigaTraguardo(flotta, { chat: 'c-1', esito: 'unito' })).toMatch(/«Il motore del menu» unito\.$/)
    // La chat singola non sta fra le `chats`: la riga c'è lo stesso.
    expect(rigaTraguardo(ap(), { chat: 'ap-1', esito: 'unito' })).toBe('Lavoro unito.')
  })

  it('mai partita e muta dicono cosa si fa', () => {
    const mai = rigaTraguardo(flotta, { chat: 'c-2', esito: 'mai-partita' }) ?? ''
    expect(mai).toContain('«Le prove del menu»')
    expect(mai).toContain('non è partita')
    expect(mai).toContain('riprovo')
    const muta = rigaTraguardo(ap(), { chat: 'ap-1', esito: 'muta' }) ?? ''
    expect(muta).toMatch(/^La chat non dà segnali da 5 minuti: aspetto\./)
    // 0.84.3: a 15 minuti la riprende lui (prima: «a un'ora la metto da parte»).
    expect(muta).toContain('a 15 minuti la rimetto al lavoro io')
  })

  it('ogni esito ha la sua riga (nessuno resta muto)', () => {
    for (const esito of ESITI_TRAGUARDO) expect(rigaTraguardo(flotta, { chat: 'c-1', esito, di: 'c-2' }), esito).toBeTruthy()
  })

  it('i traguardi nuovi si rileggono dal disco', () => {
    const a = ap({ decisioni: [{ quando: '2026-10-20T07:01:00.000Z', cosa: 'tecnico', traguardo: { chat: 'ap-1', esito: 'muta' } }] })
    const riletto = conversazione(JSON.parse(JSON.stringify(a)) as Autopilota)
    expect(riletto.some((b) => b.tono === 'traguardo' && b.testo.includes('non dà segnali'))).toBe(true)
  })

  it('ultimoTraguardoDi guarda solo quella chat, dall ultimo', () => {
    const a = ap({ decisioni: [
      { quando: '1', cosa: 'x', traguardo: { chat: 'c-1', esito: 'mai-partita' } },
      { quando: '2', cosa: 'y', traguardo: { chat: 'c-2', esito: 'aperta' } },
      { quando: '3', cosa: 'z' }
    ] })
    expect(ultimoTraguardoDi(a, 'c-1')?.esito).toBe('mai-partita')
    expect(ultimoTraguardoDi(a, 'c-2')?.esito).toBe('aperta')
    expect(ultimoTraguardoDi(a, 'c-3')).toBeUndefined()
  })
})

describe('nella conversazione solo quello che conta', () => {
  it('«Ha finito.» e «Si è fermato.» restano a sinistra; le note tecniche vanno negli eventi', () => {
    const { messaggi, eventi } = separaConversazione([
      { da: 'tu' as const, testo: 'fai il menu' },
      { da: 'nota' as const, testo: 'giro 3: proseguito', tono: 'lavoro' },
      { da: 'nota' as const, testo: 'Sviluppo: comincia «Il motore».', tono: 'traguardo' },
      { da: 'nota' as const, testo: 'Si è fermato.', tono: 'fermo' },
      { da: 'nota' as const, testo: 'Ha finito.', tono: 'fine' }
    ])
    expect(messaggi.map((b) => b.testo)).toEqual(['fai il menu', 'Sviluppo: comincia «Il motore».', 'Si è fermato.', 'Ha finito.'])
    expect(eventi.map((b) => b.testo)).toEqual(['giro 3: proseguito'])
  })

  it('la pagina del telefono usa la stessa regola', () => {
    expect(paginaClient()).toContain("b.tono === 'traguardo' || b.tono === 'fine' || b.tono === 'fermo'")
  })
})
