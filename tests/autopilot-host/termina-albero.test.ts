import { describe, it, expect, vi } from 'vitest'
import { modoDiTerminare, terminaAlbero } from '../../src/autopilot-host/verifiche'

/**
 * Il timeout di un criterio deve portarsi via **anche i figli**.
 *
 * `figlio.kill()` uccideva la sola shell. Un criterio come
 * `npm run dev & sleep 6; curl …` lascia in piedi un albero — node, il bundler,
 * il browser di prova — che la morte della shell non tocca: resta acceso, tiene
 * la porta occupata, e il giro dopo lo stesso criterio fallisce per «indirizzo
 * già in uso». Il timeout, invece di ripulire, avvelenava i tentativi
 * successivi.
 *
 * Qui non si ammazza niente per davvero: si controlla **chi** si sarebbe
 * ammazzato, che è l'unica parte che si può sbagliare — e l'unica provabile
 * senza far dipendere il test dal sistema operativo di chi lo esegue.
 */

describe('modoDiTerminare', () => {
  it('su Windows usa taskkill con /T, che e tutta la differenza', () => {
    // Senza `/T`, `taskkill` chiude la shell e lascia in vita quello che la
    // shell aveva avviato: cioe' non risolve niente.
    const modo = modoDiTerminare(1234, 'win32')
    expect(modo).toEqual({ tipo: 'taskkill', file: 'taskkill', argomenti: ['/PID', '1234', '/T', '/F'] })
  })

  it('altrove ammazza il gruppo, non il processo', () => {
    // Il pid negativo e' il gruppo: e' l'unico modo di prendere anche i nipoti.
    expect(modoDiTerminare(1234, 'linux')).toEqual({ tipo: 'gruppo', pid: -1234 })
    expect(modoDiTerminare(1234, 'darwin')).toEqual({ tipo: 'gruppo', pid: -1234 })
  })
})

describe('terminaAlbero', () => {
  it('su Windows lancia taskkill', () => {
    const esegui = vi.fn()
    const uccidi = vi.fn()
    terminaAlbero(77, { piattaforma: 'win32', esegui, uccidi })
    expect(esegui).toHaveBeenCalledWith('taskkill', ['/PID', '77', '/T', '/F'])
    expect(uccidi).not.toHaveBeenCalled()
  })

  it('su POSIX manda SIGKILL al gruppo', () => {
    const esegui = vi.fn()
    const uccidi = vi.fn()
    terminaAlbero(77, { piattaforma: 'linux', esegui, uccidi })
    expect(uccidi).toHaveBeenCalledWith(-77, 'SIGKILL')
    expect(esegui).not.toHaveBeenCalled()
  })

  it('se non ci riesce prova almeno la strada di prima', () => {
    // Il gruppo puo' essere gia' morto, o `taskkill` non esserci: un errore qui
    // non deve lasciare il comando appeso senza che nessuno ci provi piu'.
    const ripiego = vi.fn()
    terminaAlbero(77, {
      piattaforma: 'linux',
      uccidi: () => { throw new Error('ESRCH') },
      ripiego
    })
    expect(ripiego).toHaveBeenCalled()
  })

  it('senza pid non fa niente', () => {
    // Un processo che non e' mai partito non ha un albero da tagliare, e
    // `process.kill(-undefined)` sarebbe un errore al posto di un non-fare.
    const uccidi = vi.fn()
    terminaAlbero(undefined, { piattaforma: 'linux', uccidi })
    expect(uccidi).not.toHaveBeenCalled()
  })
})
