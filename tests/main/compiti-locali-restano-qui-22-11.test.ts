import { describe, expect, it } from 'vitest'
import { motivoPerRestareQui, motivoReteSoloQui } from '@shared/aiuto-rete'

const PROGETTO = 'C:\\Finto\\Progetti\\Demo'

describe('22/11: i compiti che toccano cose di questo PC non vanno su un Aiutante', () => {
  describe('(a) requisiti.rete con un percorso locale', () => {
    it('un percorso locale resta qui', () => {
      expect(motivoReteSoloQui(['D:\\Finto\\dati'])).toBeDefined()
      expect(motivoReteSoloQui(['/finto/cartella'])).toBeDefined()
      expect(motivoReteSoloQui(['%FINTO%\\x'])).toBeDefined()
    })
    it('un host o una condivisione di rete può andare altrove', () => {
      expect(motivoReteSoloQui(['nas-finto.local'])).toBeUndefined()
      expect(motivoReteSoloQui(['\\\\server-finto\\condivisa'])).toBeUndefined()
      expect(motivoReteSoloQui(undefined)).toBeUndefined()
    })
  })

  describe('(b) il testo nomina dati di questo PC o lo dice', () => {
    it.each([
      'Pulisci le copie sotto .claude/worktrees del progetto',
      'Cancella il ramo worktree-agent-r123abc',
      'Leggi %APPDATA%\\SierraDeck\\registri e dimmi cosa è successo',
      'Guarda in AppData\\Roaming\\Finto i file vecchi',
      'Correggi impostazioni.json del programma',
      'Leggi i registri del servizio degli ultimi giorni',
      'Da fare solo su questo PC, non altrove',
      'Controllalo sul PC di Nicholas'
    ])('resta qui: %s', (testo) => {
      expect(motivoPerRestareQui(testo, PROGETTO)).toBeDefined()
    })
  })

  it('un compito normale va ancora sull’Aiutante', () => {
    expect(motivoPerRestareQui('Scrivi la funzione che somma due numeri e i suoi test', PROGETTO)).toBeUndefined()
    expect(motivoReteSoloQui(['nas-finto.local'])).toBeUndefined()
  })
})
