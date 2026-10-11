import { describe, it, expect } from 'vitest'
import { azioneDelPonte, rottaPonte } from '../../src/shared/ponte-telefono'

/**
 * Le richieste del telefono attraverso il ponte nel registro del PC che fa da
 * ponte (0.60.3): il collaudo fra i due PC non trovava traccia di quello che
 * il telefono faceva sull'altro PC.
 */
describe('azioneDelPonte', () => {
  it('le azioni si raccontano, le letture no', () => {
    expect(azioneDelPonte('/api/scrivi', { chat: 'sf-1234567890abcdef', testo: 'ciao', idMessaggio: 'm-12345678' }))
      .toBe('scrivo nella chat sf-123456789 (4 caratteri, m-12345678)')
    expect(azioneDelPonte('/api/sessioni/riprendi', { cartella: 'C:\\prova', sessione: '0123456789abcdef' }))
      .toBe('riapro la chat 01234567 in C:\\prova')
    expect(azioneDelPonte('/api/autopilota/crea', { cartella: 'C:\\prova' })).toBe('creo un autopilota in C:\\prova')
    expect(azioneDelPonte('/api/autopilota/archivia', { autopilota: 'ap-1' })).toBe('archivio l’autopilota ap-1')
    expect(azioneDelPonte('/api/autopilota/archivia', { autopilota: 'ap-1', archivia: false })).toBe('tolgo dall’archivio l’autopilota ap-1')
    expect(azioneDelPonte('/api/drive/azione', { azione: 'porta-qui', progetto: 'p1' })).toBe('azione «porta-qui» del pannello sul progetto p1')
    expect(azioneDelPonte('/api/workspace/crea', { nome: 'Prova' })).toBe('creo il workspace «Prova»')
    for (const lettura of ['/api/stato', '/api/storia', '/api/drive/pannello', '/api/sessioni', '/api/cartelle', '/api/autopilota']) {
      expect(azioneDelPonte(lettura, {})).toBeUndefined()
    }
  })

  it('ogni azione raccontata passa davvero dal ponte', () => {
    for (const p of ['/api/scrivi', '/api/scegli', '/api/apri', '/api/sessioni/riprendi', '/api/chat/chiudi', '/api/chat/nome', '/api/workspace/crea', '/api/autopilota/crea', '/api/autopilota/archivia', '/api/drive/azione']) {
      expect(rottaPonte(p)).toBe(true)
      expect(azioneDelPonte(p, {})).toBeDefined()
    }
  })
})
