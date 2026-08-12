import { describe, it, expect } from 'vitest'
import { creaTampone, SCROLLBACK_MAX_BYTE, PREFISSO_RESET } from '../../src/pty-host/scrollback-buffer'

describe('tampone di scrollback', () => {
  it('legge una stringa vuota, col solo prefisso di reset, appena creato', () => {
    expect(creaTampone().leggi()).toBe(PREFISSO_RESET)
  })

  it('non supera il tetto in byte', () => {
    // Generare centinaia di KB da un processo reale renderebbe il test lento
    // e dipendente dal buffering di ConPTY. Qui si prova la sola politica di
    // taglio, sul modulo puro.
    const t = creaTampone()
    const pezzo = 'y'.repeat(8 * 1024)
    for (let i = 0; i < 100; i += 1) t.aggiungi(pezzo)
    const sb = t.leggi()
    // Il tetto vincola l'output *conservato*: il prefisso di reset e' una
    // costante aggiunta in lettura, non dato accumulato, quindi si scorpora
    // invece di allargare il tetto.
    const conservato = sb.slice(PREFISSO_RESET.length)
    expect(Buffer.byteLength(conservato, 'utf8')).toBeLessThanOrEqual(SCROLLBACK_MAX_BYTE)
    // Il taglio e' dalla testa: la coda, cioe' cio' che l'utente ha visto per
    // ultimo, e' la parte che deve sopravvivere.
    expect(conservato.endsWith(pezzo)).toBe(true)
  })

  it('conserva un solo pezzo anche se supera da solo il tetto', () => {
    const t = creaTampone()
    t.aggiungi('z'.repeat(SCROLLBACK_MAX_BYTE * 2))
    // Non deve svuotarsi: un pezzo unico enorme e' tutto cio' che c'e'.
    expect(t.leggi()).not.toBe(PREFISSO_RESET)
  })
})
