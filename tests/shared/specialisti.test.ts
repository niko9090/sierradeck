import { describe, it, expect } from 'vitest'
import { nuovoAutopilota, type Autopilota } from '../../src/shared/autopilota'
import { rigaChatSola, rigaFlotta, rigaUltimaAzione, specialistiDi, titoloChatSpecialista } from '../../src/shared/specialisti'

/**
 * 0.73.0: gli specialisti visibili. Ogni chat ha il ruolo nel nome; la scheda
 * dice come è organizzato il lavoro e mostra chi fa cosa, con l'ultima azione
 * e la sessione per «Guarda»; un lavoro piccolo è una chat sola, detto.
 */
function ap(p: Partial<Autopilota> = {}): Autopilota {
  return { ...nuovoAutopilota({ id: 'ap-1', nome: 'Notte', obiettivo: 'o', cwd: 'E:\p', criteri: [{ descrizione: 'c', soddisfatto: false }], iniziatoIl: '2026-10-15T10:00:00.000Z', workspace: 'Notte' }), ...p }
}

describe('specialisti', () => {
  it('il ruolo davanti al nome del riquadro', () => {
    expect(titoloChatSpecialista('Notte', 'collaudo')).toBe('Collaudo · Notte')
    expect(titoloChatSpecialista('Notte', undefined)).toBe('Notte')
  })

  it('una flotta: la riga con i ruoli e uno per chat, con stato, ultima azione e sessione', () => {
    const s = specialistiDi(ap({
      organizzazione: rigaFlotta(['sviluppo', 'collaudo', 'revisione']),
      chats: [
        { id: 'c-1', compito: 'scrivi la funzione', stato: 'lavoro', cicli: 2, ruolo: 'sviluppo', sessionId: 's-1', ultimaAzione: 'Ho aggiunto il test.' },
        { id: 'c-2', compito: 'prova dal vero', stato: 'pausa', cicli: 0, ruolo: 'collaudo' }
      ]
    }))
    expect(s.riga).toBe('Lavoro diviso fra specialisti, ognuno nella sua chat: Sviluppo, Collaudo, Revisione')
    expect(s.elenco).toEqual([
      { id: 'c-1', ruolo: 'Sviluppo', colore: 'blu', compito: 'scrivi la funzione', stato: 'al lavoro', attivo: true, ultimaAzione: 'Ho aggiunto il test.', sessionId: 's-1', workspace: 'Notte' },
      { id: 'c-2', ruolo: 'Collaudo', colore: 'verde', compito: 'prova dal vero', stato: 'in pausa per i limiti del piano', attivo: false, ultimaAzione: '', workspace: 'Notte' }
    ])
  })

  it('0.73.1: una riga salvata nel formato vecchio («3 specialisti») si rifà dai ruoli delle chat', () => {
    const s = specialistiDi(ap({
      organizzazione: '3 specialisti, ognuno nella sua chat: Sviluppo, Revisione',
      chats: [
        { id: 'c-1', compito: 'a', stato: 'finita', cicli: 1, ruolo: 'sviluppo' },
        { id: 'c-2', compito: 'b', stato: 'finita', cicli: 1, ruolo: 'sviluppo' },
        { id: 'c-3', compito: 'c', stato: 'finita', cicli: 1, ruolo: 'revisione' },
        { id: 'c-4', compito: 'd', stato: 'finita', cicli: 1, ruolo: 'revisione' }
      ]
    }))
    expect(s.riga).toBe('Lavoro diviso fra specialisti, ognuno nella sua chat: Sviluppo, Revisione')
    expect(s.elenco).toHaveLength(4)
  })

  it('0.74.0: lo specialista che ha finito ha la chat chiusa (niente «Guarda» su pagina e app)', () => {
    const s = specialistiDi(ap({ stato: 'lavoro', chats: [
      { id: 'c-1', compito: 'a', stato: 'finita', cicli: 1, ruolo: 'sviluppo', sessionId: 's-1' },
      { id: 'c-2', compito: 'b', stato: 'lavoro', cicli: 1, ruolo: 'revisione', sessionId: 's-2' }
    ] }))
    expect(s.elenco.map((x) => x.chiusa)).toEqual([true, undefined])
  })

  it('un lavoro piccolo: una chat sola, e la scheda lo dice', () => {
    const s = specialistiDi(ap({ stato: 'lavoro', sessionId: 's-0', organizzazione: rigaChatSola('piccolo'), ultimaAzioneChat: 'Fatto il primo giro.' }))
    expect(s.riga).toBe('Lavoro piccolo: una chat sola, che fa tutto.')
    expect(s.elenco).toEqual([expect.objectContaining({ ruolo: 'Chat unica', stato: 'al lavoro', sessionId: 's-0', ultimaAzione: 'Fatto il primo giro.' })])
  })

  it('prima di partire: nessuno, e il perché', () => {
    expect(specialistiDi(ap({ stato: 'pronto' })).elenco).toEqual([])
  })

  it('i perché di una chat sola', () => {
    expect(rigaChatSola('senza-git')).toContain('non usa git')
    expect(rigaChatSola('limiti', 'piano al 92%')).toBe('Una chat sola: piano al 92%.')
  })

  it('l ultima azione in una riga: la prima che dice qualcosa, senza Markdown, corta', () => {
    expect(rigaUltimaAzione('\n## Fatto\n\n**Ho corretto** il test rosso.')).toBe('Fatto')
    expect(rigaUltimaAzione('- ok\n- Ho corretto il test')).toBe('Ho corretto il test')
    expect(rigaUltimaAzione('x'.repeat(300)).length).toBe(140)
  })
})

describe('0.76.0: lo stesso ordine in ogni workspace', () => {
  it('per ruolo, poi come sono nati; le chat senza ruolo in fondo', () => {
    const a = ap({ stato: 'lavoro', chats: [
      { id: 'c-1', compito: 'rilascio', stato: 'lavoro', cicli: 0, ruolo: 'rilascio' },
      { id: 'c-10', compito: 'collaudo b', stato: 'lavoro', cicli: 0, ruolo: 'collaudo' },
      { id: 'c-2', compito: 'senza ruolo', stato: 'lavoro', cicli: 0 },
      { id: 'c-3', compito: 'codice', stato: 'lavoro', cicli: 0, ruolo: 'sviluppo' },
      { id: 'c-4', compito: 'collaudo a', stato: 'lavoro', cicli: 0, ruolo: 'collaudo' }
    ] })
    expect(specialistiDi(a).elenco.map((s) => s.id)).toEqual(['c-3', 'c-4', 'c-10', 'c-1', 'c-2'])
  })
})
