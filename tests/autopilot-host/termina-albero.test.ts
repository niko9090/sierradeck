import { describe, it, expect, vi } from 'vitest'
import { modoDiTerminare, terminaAlbero, winpidDelGruppo, psAccanto } from '../../src/autopilot-host/verifiche'

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

/**
 * 0.81.0, 20/10: le suite dei test scadute restavano vive (sette insieme, PC al
 * 100%). Riprodotto: dopo `taskkill /T` sulla bash del criterio restavano tre
 * bash e il node di vitest, perché per Windows avevano un altro padre. Qui
 * l'uscita vera di `ps` di Git, accorciata, con la stessa forma.
 */
describe('i processi che la bash di Git avvia fuori dall albero di Windows', () => {
  const ps = [
    '      PID    PPID    PGID     WINPID   TTY         UID    STIME COMMAND',
    '      500       1     500      31500  ?         197609 13:10:01 /usr/bin/bash',
    '      510     500     500       8440  ?         197609 13:10:01 /usr/bin/env',
    '      520     510     520      31428  ?         197609 13:10:01 /usr/bin/bash',
    '      530     520     520      23564  ?         197609 13:10:01 /usr/bin/bash',
    'S     540     530     520      27620  ?         197609 13:10:02 /e/Programs/LTS/node',
    '      900       1     900      44444  ?         197609 13:00:00 /usr/bin/bash',
    '      910     900     900      45555  ?         197609 13:00:00 /e/Programs/LTS/node'
  ].join('\r\n')

  it('prende i figli per PPID e il gruppo della radice, non gli altri', () => {
    expect(winpidDelGruppo(ps, 31500).sort()).toEqual([8440, 23564, 27620, 31428, 31500].sort())
  })

  it('una radice che ps non conosce: niente, mai i processi degli altri', () => {
    expect(winpidDelGruppo(ps, 12345)).toEqual([])
    expect(winpidDelGruppo('', 31500)).toEqual([])
  })

  it('mai il servizio stesso, né i PID di sistema', () => {
    expect(winpidDelGruppo(ps, 31500, [27620])).not.toContain(27620)
    const conSistema = ps + '\r\n      560     500     500          4  ?  197609 13:10:03 /usr/bin/strano'
    expect(winpidDelGruppo(conSistema, 31500)).not.toContain(4)
  })

  it('una radice che non è capo del suo gruppo: solo i figli, mai chi condivide il PGID', () => {
    const condiviso = [
      '      PID    PPID    PGID     WINPID   TTY         UID    STIME COMMAND',
      '      700       1     100      31500  ?         197609 13:10:01 /usr/bin/bash',
      '      710     700     100       8440  ?         197609 13:10:01 /usr/bin/env',
      '      100       1     100      44444  ?         197609 13:00:00 /usr/bin/bash',
      '      120     100     100      45555  ?         197609 13:00:00 /e/Programs/LTS/node'
    ].join('\n')
    expect(winpidDelGruppo(condiviso, 31500).sort((a, b) => a - b)).toEqual([8440, 31500])
  })

  it('ps con colonne in un altro ordine, o senza intestazione: niente', () => {
    expect(winpidDelGruppo(ps.replace('PID    PPID    PGID', 'PPID    PID    PGID'), 31500)).toEqual([])
    expect(winpidDelGruppo(ps.split('\r\n').slice(1).join('\r\n'), 31500)).toEqual([])
  })

  it('terminaAlbero chiude il gruppo con un solo taskkill /T, senza gli altri', () => {
    const esegui = vi.fn()
    terminaAlbero(31500, { piattaforma: 'win32', esegui, gruppo: () => winpidDelGruppo(ps, 31500) })
    expect(esegui).toHaveBeenCalledTimes(2)
    expect(esegui).toHaveBeenNthCalledWith(1, 'taskkill', ['/PID', '31500', '/T', '/F'])
    const [file, argomenti] = esegui.mock.calls[1] as [string, string[]]
    expect(file).toBe('taskkill')
    expect(argomenti.slice(0, 2)).toEqual(['/F', '/T'])
    const pid = argomenti.filter((_, i) => argomenti[i - 1] === '/PID')
    expect(pid.sort()).toEqual(['23564', '27620', '31428', '8440'].sort())
    expect(argomenti).not.toContain('44444')
  })

  it('se leggere il gruppo fallisce, la radice si chiude lo stesso', () => {
    const esegui = vi.fn()
    terminaAlbero(31500, { piattaforma: 'win32', esegui, gruppo: () => { throw new Error('ps non risponde') } })
    expect(esegui).toHaveBeenCalledTimes(1)
  })

  it('ps sta accanto alla bash di usr/bin, o in usr/bin se la bash è quella di Git/bin', () => {
    const c = (p: string): string => p.replace(/\\/g, '/')
    expect(c(psAccanto('C:\\Git\\usr\\bin\\bash.exe', (p) => c(p) === 'C:/Git/usr/bin/ps.exe') ?? '')).toBe('C:/Git/usr/bin/ps.exe')
    expect(c(psAccanto('C:\\Git\\bin\\bash.exe', (p) => c(p).endsWith('usr/bin/ps.exe')) ?? '')).toContain('usr/bin/ps.exe')
    expect(psAccanto('C:\\Git\\bin\\bash.exe', () => false)).toBeUndefined()
  })
})
