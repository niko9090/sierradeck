import { describe, it, expect } from 'vitest'
import {
  claudeDaAggiornare, notaClaude, piuVecchia, versioneInstallata, versioneUltima
} from '../../src/main/claude-versione'

describe('piuVecchia', () => {
  it('confronta numero per numero, non alfabeticamente', () => {
    // «2.9.0» viene dopo «2.10.0» in ordine alfabetico: e' la trappola che fa
    // proporre aggiornamenti all'indietro.
    expect(piuVecchia('2.9.0', '2.10.0')).toBe(true)
    expect(piuVecchia('2.10.0', '2.9.0')).toBe(false)
  })

  it('due versioni uguali non sono una piu vecchia dell altra', () => {
    expect(piuVecchia('2.1.228', '2.1.228')).toBe(false)
  })

  it('una versione con meno pezzi non fa esplodere il confronto', () => {
    expect(piuVecchia('2.1', '2.1.1')).toBe(true)
  })
})

describe('versioneInstallata', () => {
  it('prende il numero e lascia stare il resto', () => {
    // L'uscita cambia forma nel tempo: il numero e' l'unica cosa che serve.
    expect(versioneInstallata('claude', () => '2.1.228 (Claude Code)')).toBe('2.1.228')
  })

  it('un comando che non risponde non inventa una versione', () => {
    expect(versioneInstallata('claude', () => { throw new Error('non trovato') })).toBeUndefined()
  })
})

describe('versioneUltima', () => {
  it('legge la versione dal registro', () => {
    expect(versioneUltima(() => '2.2.0\n')).toBe('2.2.0')
  })

  it('senza rete non inventa niente', () => {
    expect(versioneUltima(() => { throw new Error('offline') })).toBeUndefined()
  })
})

describe('claudeDaAggiornare', () => {
  it('propone solo quando c e davvero qualcosa di piu nuovo', () => {
    expect(claudeDaAggiornare('claude', { installata: '2.1.228', ultima: '2.2.0' })).toBe('claude')
    expect(claudeDaAggiornare('claude', { installata: '2.2.0', ultima: '2.2.0' })).toBeUndefined()
    expect(claudeDaAggiornare('claude', { installata: '2.3.0', ultima: '2.2.0' })).toBeUndefined()
  })

  it('nel dubbio non tocca niente', () => {
    // Se una delle due versioni non si e' potuta stabilire, proporre di
    // sostituire qualcosa sarebbe farlo senza sapere se serve.
    expect(claudeDaAggiornare('claude', { ultima: '2.2.0' })).toBeUndefined()
    expect(claudeDaAggiornare('claude', { installata: '2.1.0' })).toBeUndefined()
  })
})

describe('notaClaude', () => {
  it('dice che e gia aggiornato, con la versione', () => {
    // Un controllo che non si vede, per chi guarda non e' avvenuto: la
    // finestra passava dall'installazione all'avvio come se Claude Code non
    // fosse mai stato guardato.
    expect(notaClaude('claude', { installata: '2.2.0', ultima: '2.2.0' })).toContain('2.2.0')
  })

  it('tace quando c e da aggiornarlo: lo dira l updater mentre lo fa', () => {
    expect(notaClaude('claude', { installata: '2.1.0', ultima: '2.2.0' })).toBe('')
  })

  it('tace quando la verifica non e riuscita', () => {
    // Raccontare una verifica non riuscita come riuscita e' peggio che tacere.
    expect(notaClaude('claude', { ultima: '2.2.0' })).toBe('')
    expect(notaClaude('claude', { installata: '2.2.0' })).toBe('')
  })
})
