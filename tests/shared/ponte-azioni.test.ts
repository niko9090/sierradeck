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
    expect(azioneDelPonte('/api/drive/azione', { azione: 'porta-qui', progetto: 'p1' })).toBe('azione «porta-qui» del pannello sul progetto p1')
    expect(azioneDelPonte('/api/workspace/crea', { nome: 'Prova' })).toBe('creo il workspace «Prova»')
    // Dal collaudo: «sposto la chat nella chat …» e il cambio di workspace che non si vedeva.
    expect(azioneDelPonte('/api/chat/sposta', { chat: 'pane-6629dcd9-d308', workspace: 'Prova' })).toBe('sposto la chat pane-6629dcd nel workspace «Prova»')
    expect(azioneDelPonte('/api/chat/ospite', { chat: 'pane-1' })).toBe('cambio la casa della chat pane-1')
    expect(azioneDelPonte('/api/chat/dormi', { chat: 'pane-1' })).toBe('metto a dormire la chat pane-1')
    expect(azioneDelPonte('/api/workspace', { nome: 'MT5' })).toBe('passo al workspace «MT5» (sullo schermo di quel PC)')
    for (const lettura of ['/api/stato', '/api/storia', '/api/drive/pannello', '/api/sessioni', '/api/cartelle', '/api/autopilota']) {
      expect(azioneDelPonte(lettura, {})).toBeUndefined()
    }
  })

  it('ogni azione raccontata passa davvero dal ponte', () => {
    for (const p of ['/api/workspace', '/api/chat/sposta', '/api/scrivi', '/api/scegli', '/api/apri', '/api/sessioni/riprendi', '/api/chat/chiudi', '/api/chat/nome', '/api/workspace/crea', '/api/autopilota/crea', '/api/drive/azione']) {
      expect(rottaPonte(p)).toBe(true)
      // Il cambio di workspace si racconta solo con il nome (0.67.1).
      expect(azioneDelPonte(p, p === '/api/workspace' ? { nome: 'Fatture' } : {})).toBeDefined()
    }
  })
})

describe('cambio di workspace senza nome (0.67.1)', () => {
  it('il ponte lo ferma con il motivo, e il registro non scrive «passo al workspace «»»', async () => {
    const { leggiRichiestaPonte } = await import('../../src/shared/ponte-telefono')
    const r = leggiRichiestaPonte({ pc: 'pc-a', percorso: '/api/workspace', corpo: { nome: '  ' } })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errore).toBe('Manca il nome del workspace a cui passare.')
    expect(leggiRichiestaPonte({ pc: 'pc-a', percorso: '/api/workspace', corpo: { nome: 'Fatture' } }).ok).toBe(true)
    expect(azioneDelPonte('/api/workspace', { nome: '' })).toBeUndefined()
    expect(azioneDelPonte('/api/workspace', { nome: 'Fatture' })).toBe('passo al workspace «Fatture» (sullo schermo di quel PC)')
  })
})
