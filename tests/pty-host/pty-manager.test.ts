import { describe, it, expect, vi } from 'vitest'
import { PtyManager, ambientePty } from '../../src/pty-host/pty-manager'

describe('ambiente dei terminali', () => {
  it('non propaga ELECTRON_RUN_AS_NODE ai processi dell utente', () => {
    // Il Core lancia il PTY host con questa variabile; l'host copiava il
    // proprio ambiente in ogni pty, e da li' ogni CLI Electron avviato da un
    // riquadro partiva come Node puro.
    const env = ambientePty(
      { ELECTRON_RUN_AS_NODE: '1', ELECTRON_RENDERER_URL: 'http://localhost:5173', PATH: 'C:\\bin' },
      'sessione-1'
    )
    expect(env.ELECTRON_RUN_AS_NODE).toBeUndefined()
    expect(env.ELECTRON_RENDERER_URL).toBeUndefined()
  })

  it('conserva il resto dell ambiente della shell dell utente', () => {
    const env = ambientePty(
      { PATH: 'C:\\bin', ELECTRON_ENABLE_LOGGING: '1', vuota: undefined },
      'sessione-1'
    )
    expect(env.PATH).toBe('C:\\bin')
    // Non nell'elenco: se c'e', l'ha esportata l'utente ed e' sua.
    expect(env.ELECTRON_ENABLE_LOGGING).toBe('1')
    expect('vuota' in env).toBe(false)
  })

  it('aggiunge l uuid della sessione', () => {
    expect(ambientePty({}, 'sessione-1').CLAUDE_SESSION_UUID).toBe('sessione-1')
  })
})

describe('PtyManager', () => {
  it('avvia un processo e ne segnala l uscita', async () => {
    const mgr = new PtyManager()
    const exited = vi.fn()
    mgr.onExit(exited)

    const pid = mgr.spawn('t1', {
      sessionUuid: 'irrilevante',
      cwd: process.cwd(),
      command: 'cmd.exe',
      args: ['/c', 'exit', '0'],
      cols: 80,
      rows: 24
    })
    expect(pid).toBeGreaterThan(0)
    expect(mgr.has('t1')).toBe(true)

    await vi.waitFor(() => expect(exited).toHaveBeenCalled(), { timeout: 10000 })
    expect(exited.mock.calls[0]?.[0]).toBe('t1')
    expect(mgr.has('t1')).toBe(false)
  })

  it('trasmette l output del processo', async () => {
    const mgr = new PtyManager()
    let uscita = ''
    mgr.onData((_id, data) => { uscita += data })

    mgr.spawn('t2', {
      sessionUuid: 'irrilevante',
      cwd: process.cwd(),
      command: 'cmd.exe',
      args: ['/c', 'echo', 'CIAO_TEST'],
      cols: 80,
      rows: 24
    })

    await vi.waitFor(() => expect(uscita).toContain('CIAO_TEST'), { timeout: 10000 })
  })

  it('non consegna ELECTRON_RUN_AS_NODE a un processo vero', async () => {
    // La prova sul processo vero, non solo sulla funzione: cmd.exe lascia
    // `%VAR%` non espansa quando la variabile non esiste.
    const precedente = process.env.ELECTRON_RUN_AS_NODE
    process.env.ELECTRON_RUN_AS_NODE = '1'
    try {
      const mgr = new PtyManager()
      let uscita = ''
      mgr.onData((_id, data) => { uscita += data })
      mgr.spawn('t3', {
        sessionUuid: 'irrilevante',
        cwd: process.cwd(),
        command: 'cmd.exe',
        args: ['/c', 'echo', '[%ELECTRON_RUN_AS_NODE%]'],
        cols: 80,
        rows: 24
      })
      await vi.waitFor(() => expect(uscita).toContain(']'), { timeout: 10000 })
      expect(uscita).toContain('[%ELECTRON_RUN_AS_NODE%]')
    } finally {
      if (precedente === undefined) delete process.env.ELECTRON_RUN_AS_NODE
      else process.env.ELECTRON_RUN_AS_NODE = precedente
    }
  })

  it('ignora resize e kill su un id sconosciuto', () => {
    // Per queste due non c'e' niente da riferire: chiudere o ridimensionare
    // qualcosa che non c'e' piu' e' gia' il risultato voluto.
    const mgr = new PtyManager()
    expect(() => mgr.resize('inesistente', 10, 10)).not.toThrow()
    expect(() => mgr.kill('inesistente')).not.toThrow()
  })

  it('segnala la scrittura verso un id sconosciuto invece di ingoiarla', () => {
    const mgr = new PtyManager()
    expect(() => mgr.write('inesistente', 'x')).toThrow(/inesistente/)
  })

  it('non mette i caratteri dell utente nel messaggio d errore', () => {
    const mgr = new PtyManager()
    expect(() => mgr.write('t9', 'password-segreta')).toThrow(/16 caratteri/)
    expect(() => mgr.write('t9', 'password-segreta')).not.toThrow(/password/)
  })
})

describe('scrollback', () => {
  /**
   * Aspetta che un testo compaia nello scrollback di un pty.
   *
   * Non basta aspettare il primo evento `onData`: su ConPTY il primo chunk sono
   * le sequenze di modalita' del terminale (`\x1b[?9001h\x1b[?1004h`), e l'eco del
   * comando arriva in un chunk successivo. Aspettare «un evento» invece che «il
   * testo» rende il test dipendente da quanti chunk ConPTY decide di produrre,
   * che non e' una proprieta' del codice sotto esame.
   *
   * Il timeout fallisce con un messaggio invece di lasciare la suite appesa.
   */
  function attendiTesto(m: PtyManager, id: string, atteso: string, msLimite = 10_000): Promise<number> {
    return new Promise((risolvi, rifiuta) => {
      let eventi = 0
      const scadenza = setTimeout(
        () => rifiuta(new Error(`"${atteso}" non e' comparso entro ${msLimite} ms`)),
        msLimite
      )
      m.onData((idVisto) => {
        if (idVisto !== id) return
        eventi += 1
        if (!(m.scrollbackDi(id) ?? '').includes(atteso)) return
        clearTimeout(scadenza)
        risolvi(eventi)
      })
    })
  }

  it('restituisce undefined per un pty che non esiste', () => {
    expect(new PtyManager().scrollbackDi('mai-nato')).toBeUndefined()
  })

  it('conserva l output di un pty vivo, accumulando piu chunk', async () => {
    const m = new PtyManager()
    const atteso = attendiTesto(m, 'p1', 'CIAO-SCROLLBACK')
    m.spawn('p1', {
      sessionUuid: 'u1', cwd: process.cwd(),
      command: 'cmd.exe', args: ['/c', 'echo', 'CIAO-SCROLLBACK'],
      cols: 80, rows: 24
    })
    await atteso
    // Questo test prova il percorso vero end-to-end — un pty reale, `onData`,
    // il tampone, `scrollbackDi` — che i test diretti su `creaTampone` in
    // scrollback-buffer.test.ts saltano. Non prova la politica di taglio ne'
    // quanti chunk ConPTY produce: quello e' coperto li', e non e' un
    // contratto documentato da nessuna parte quanti chunk arrivino su una
    // macchina data.
    expect(m.scrollbackDi('p1')).toContain('CIAO-SCROLLBACK')
    m.killAll()
  })

  it('dimentica lo scrollback di un pty ucciso', async () => {
    const m = new PtyManager()
    const atteso = attendiTesto(m, 'p1', 'X')
    m.spawn('p1', {
      sessionUuid: 'u1', cwd: process.cwd(),
      command: 'cmd.exe', args: ['/c', 'echo', 'X'],
      cols: 80, rows: 24
    })
    await atteso
    m.kill('p1')
    expect(m.scrollbackDi('p1')).toBeUndefined()
    m.killAll()
  })

  it('dimentica lo scrollback anche quando il pty esce da solo, senza kill', async () => {
    // A differenza del test precedente, qui il processo termina di sua
    // iniziativa: prova il ramo `onExit`, non `kill`. I due percorsi
    // cancellano il tampone in punti diversi del codice, e un test che ne
    // provasse solo uno lascerebbe l'altro senza copertura.
    const m = new PtyManager()
    const uscito = new Promise<void>((risolvi) => {
      m.onExit((idVisto) => { if (idVisto === 'p1') risolvi() })
    })
    m.spawn('p1', {
      sessionUuid: 'u1', cwd: process.cwd(),
      command: 'cmd.exe', args: ['/c', 'exit', '0'],
      cols: 80, rows: 24
    })
    await uscito
    expect(m.scrollbackDi('p1')).toBeUndefined()
    m.killAll()
  })
})

describe('ambientePty — marcatori di sessione ereditati', () => {
  it('non passa alla chat i marcatori della sessione che ha lanciato il gestore', () => {
    // Osservato sul campo: con CLAUDE_CODE_CHILD_SESSION ereditato, Claude Code
    // scrive «Transcript saving is off» e **non salva la trascrizione**. Senza
    // .jsonl la chat non entra nell'indice e non e' piu' riprendibile: il
    // gestore perderebbe in silenzio la sua materia prima.
    const env = ambientePty(
      {
        CLAUDE_CODE_CHILD_SESSION: '1',
        CLAUDE_CODE_SESSION_ID: 'abc',
        CLAUDE_CODE_BRIDGE_SESSION_ID: 'def',
        CLAUDE_PID: '123',
        PATH: 'C:\Windows'
      },
      'u-1'
    )
    expect(env.CLAUDE_CODE_CHILD_SESSION).toBeUndefined()
    expect(env.CLAUDE_CODE_SESSION_ID).toBeUndefined()
    expect(env.CLAUDE_CODE_BRIDGE_SESSION_ID).toBeUndefined()
    expect(env.CLAUDE_PID).toBeUndefined()
  })

  it('lascia passare tutto il resto, compreso il PATH', () => {
    const env = ambientePty({ PATH: 'C:\Windows', CLAUDE_CONFIG_DIR: 'D:\altro' }, 'u-1')
    expect(env.PATH).toBe('C:\Windows')
    expect(env.CLAUDE_CONFIG_DIR).toBe('D:\altro')
  })

  it('non eredita il divieto di colorare, e dichiara cosa sa fare il terminale', () => {
    // Chi lancia il gestore da dentro una sessione di Claude Code gli passa
    // NO_COLOR: ereditandolo, ogni chat nasceva grigia — nessun errore, nessun
    // motivo visibile, e il sintomo identico a un guasto del terminale. Ma il
    // terminale che offriamo e' xterm.js, che il colore pieno lo disegna: il
    // divieto era di un altro guscio, non nostro.
    const env = ambientePty({ NO_COLOR: '1', CLAUDECODE: '1', PATH: 'C:\Windows' }, 'u-1')
    expect(env.NO_COLOR).toBeUndefined()
    expect(env.CLAUDECODE).toBeUndefined()
    expect(env.COLORTERM).toBe('truecolor')
    expect(env.TERM).toBe('xterm-256color')
  })

  it('non consegna ai terminali dell utente il canale privato di chi ci ha lanciati', () => {
    const env = ambientePty(
      { CLAUDE_CODE_MESSAGING_SOCKET: 'un-canale', CLAUDE_CODE_MESSAGING_TOKEN: 'segreto' },
      'u-1'
    )
    expect(env.CLAUDE_CODE_MESSAGING_SOCKET).toBeUndefined()
    expect(env.CLAUDE_CODE_MESSAGING_TOKEN).toBeUndefined()
  })

  it('le aggiunte esplicite vincono anche sulle capacita dichiarate', () => {
    // Chi vuole davvero il grigio deve poterlo imporre: le aggiunte sono una
    // scelta dell'utente e vengono per ultime.
    const env = ambientePty({}, 'u-1', { COLORTERM: '' })
    expect(env.COLORTERM).toBe('')
  })
})

