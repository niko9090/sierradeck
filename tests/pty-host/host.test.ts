import { describe, it, expect, vi } from 'vitest'
import { PassThrough } from 'node:stream'
import { startHost, type ManagerLike } from '../../src/pty-host/host'
import { encodeMessage } from '@shared/protocol'
import type { CoreToHost } from '@shared/protocol'

/**
 * Doppio del gestore dei pty: registra le chiamate in ordine, così i test
 * possono affermare *quante volte* i terminali sono stati chiusi, che è il
 * punto della guardia contro il doppio spegnimento.
 */
function managerDoppio(opts: { scrollback?: Map<string, string> } = {}): {
  manager: ManagerLike
  chiamate: string[]
} {
  const chiamate: string[] = []
  const scrollback = opts.scrollback ?? new Map<string, string>()
  const manager: ManagerLike = {
    onData: () => {},
    onExit: () => {},
    spawn: (id) => {
      chiamate.push(`spawn:${id}`)
      return 4242
    },
    write: (id, data) => chiamate.push(`write:${id}:${data}`),
    resize: (id, cols, rows) => chiamate.push(`resize:${id}:${cols}x${rows}`),
    kill: (id) => chiamate.push(`kill:${id}`),
    killAll: () => chiamate.push('killAll'),
    scrollbackDi: (id) => scrollback.get(id)
  }
  return { manager, chiamate }
}

function avvia(opts: { scrollback?: Map<string, string> } = {}): {
  chiamate: string[]
  stdin: PassThrough
  uscite: number[]
  righe: string[]
  log: string[]
  invia: (msg: CoreToHost) => void
} {
  const { manager, chiamate } = managerDoppio(opts)
  const stdin = new PassThrough()
  const uscite: number[] = []
  const righe: string[] = []
  const log: string[] = []

  startHost({
    manager,
    stdin,
    write: (chunk) => righe.push(chunk),
    exit: (code) => uscite.push(code),
    log: (message) => log.push(message)
  })

  return {
    chiamate,
    stdin,
    uscite,
    righe,
    log,
    invia: (msg) => {
      stdin.write(encodeMessage(msg))
    }
  }
}

describe('ciclo di vita del PTY host', () => {
  it('resta operativo sui messaggi ordinari', async () => {
    const h = avvia()
    h.invia({
      id: 'p1',
      kind: 'spawn',
      sessionUuid: 'u',
      cwd: 'C:\\',
      command: 'cmd.exe',
      args: [],
      cols: 80,
      rows: 24
    })

    await vi.waitFor(() => expect(h.chiamate).toContain('spawn:p1'))
    expect(h.righe.join('')).toContain('"kind":"spawned"')
    expect(h.uscite).toEqual([])
  })

  it('chiude i terminali ed esce quando il Core chiede lo spegnimento', async () => {
    const h = avvia()
    h.invia({ kind: 'shutdown' })

    await vi.waitFor(() => expect(h.uscite).toEqual([0]))
    expect(h.chiamate).toEqual(['killAll'])
  })

  it('chiude i terminali quando lo stdin va in EOF senza che il Core abbia chiesto nulla', async () => {
    const h = avvia()
    // Il Core e' scomparso: nessuno spegnimento, solo la pipe che si chiude.
    h.stdin.end()

    await vi.waitFor(() => expect(h.uscite).toEqual([0]))
    expect(h.chiamate).toEqual(['killAll'])
  })

  // I due test che seguono emettono un evento solo per volta. Servono perche'
  // chiudendo davvero una pipe arrivano sia 'end' sia 'close', e ognuno dei
  // due gestori maschererebbe l'assenza dell'altro.
  it('il solo evento end basta a spegnere', async () => {
    const h = avvia()
    h.stdin.emit('end')

    await vi.waitFor(() => expect(h.uscite).toEqual([0]))
    expect(h.chiamate).toEqual(['killAll'])
  })

  it('il solo evento close basta a spegnere', async () => {
    const h = avvia()
    h.stdin.emit('close')

    await vi.waitFor(() => expect(h.uscite).toEqual([0]))
    expect(h.chiamate).toEqual(['killAll'])
  })

  it('non spegne due volte quando dopo end arriva anche close', async () => {
    const h = avvia()
    h.stdin.end()
    await vi.waitFor(() => expect(h.uscite).toEqual([0]))

    // Per la stessa scomparsa del Core i due eventi arrivano entrambi.
    h.stdin.emit('close')

    expect(h.chiamate).toEqual(['killAll'])
    expect(h.uscite).toEqual([0])
  })

  it('non spegne due volte se il Core chiede lo spegnimento e poi la pipe si chiude', async () => {
    const h = avvia()
    h.invia({ kind: 'shutdown' })
    await vi.waitFor(() => expect(h.uscite).toEqual([0]))

    // L'attesa deve essere sull'evento, non su vi.waitFor: waitFor si
    // accontenterebbe del primo controllo, fatto prima che la chiusura della
    // pipe sia arrivata ai gestori, e il test passerebbe senza aver
    // esercitato nulla.
    const chiusa = new Promise<void>((resolve) => {
      h.stdin.once('close', () => resolve())
    })
    h.stdin.end()
    await chiusa

    expect(h.chiamate).toEqual(['killAll'])
    expect(h.uscite).toEqual([0])
  })

  it('ignora i messaggi che seguono lo spegnimento nello stesso blocco', async () => {
    const h = avvia()
    // Spegnimento e una richiesta successiva arrivano insieme: dopo lo
    // spegnimento non c'e' piu' nessuno a cui la seconda possa servire.
    h.stdin.write(
      encodeMessage({ kind: 'shutdown' } satisfies CoreToHost) +
        encodeMessage({ id: 'p2', kind: 'kill' } satisfies CoreToHost)
    )

    await vi.waitFor(() => expect(h.uscite).toEqual([0]))
    expect(h.chiamate).toEqual(['killAll'])
  })

  it('segnala al riquadro una scrittura verso un terminale che non esiste piu', async () => {
    // Il doppio del manager solleva come quello vero: e' l'unico modo perche'
    // l'utente sappia che i tasti che ha premuto non sono arrivati da nessuna
    // parte. Senza questa risposta, la divergenza di stato fra Core e host
    // resterebbe invisibile a entrambi i lati.
    const { manager, chiamate } = managerDoppio()
    const stdin = new PassThrough()
    const righe: string[] = []
    manager.write = (id) => {
      chiamate.push(`write:${id}`)
      throw new Error(`terminale ${id} inesistente`)
    }
    startHost({
      manager,
      stdin,
      write: (chunk) => righe.push(chunk),
      exit: () => {},
      log: () => {}
    })

    stdin.write(encodeMessage({ id: 'p4', kind: 'write', data: 'ls' } satisfies CoreToHost))

    await vi.waitFor(() => expect(righe.join('')).toContain('"kind":"error"'))
    const risposta = JSON.parse(righe.join('').trim()) as { id: string; message: string }
    expect(risposta.id).toBe('p4')
    expect(risposta.message).toContain('inesistente')
  })

  it('segnala un tipo di messaggio sconosciuto invece di lasciare il Core in attesa', async () => {
    const h = avvia()
    h.stdin.write(JSON.stringify({ id: 'p3', kind: 'inventato' }) + '\n')

    await vi.waitFor(() => expect(h.righe.join('')).toContain('"kind":"error"'))
    expect(h.log.join('')).toContain('tipo di messaggio sconosciuto')
  })

  it('risponde con lo scrollback se il pty esiste', async () => {
    const h = avvia({ scrollback: new Map([['p1', 'CRONOLOGIA']]) })
    h.invia({ id: 'p1', kind: 'attach' })

    await vi.waitFor(() => expect(h.righe.join('')).toContain('"kind":"scrollback"'))
    expect(JSON.parse(h.righe.join('').trim())).toEqual({ id: 'p1', kind: 'scrollback', data: 'CRONOLOGIA' })
  })

  it('risponde assente se il pty non esiste', async () => {
    const h = avvia({ scrollback: new Map() })
    h.invia({ id: 'ignoto', kind: 'attach' })

    await vi.waitFor(() => expect(h.righe.join('')).toContain('"kind":"assente"'))
    expect(JSON.parse(h.righe.join('').trim())).toEqual({ id: 'ignoto', kind: 'assente' })
  })

  it('distingue uno scrollback vuoto da un pty assente', async () => {
    const h = avvia({ scrollback: new Map([['p1', '']]) })
    h.invia({ id: 'p1', kind: 'attach' })

    // Un pty appena avviato che non ha ancora scritto nulla esiste: deve
    // ricevere scrollback vuoto, non assente, altrimenti il riquadro lo
    // rilancerebbe e ne creerebbe un secondo.
    await vi.waitFor(() => expect(h.righe.join('')).toContain('"kind":"scrollback"'))
    expect(JSON.parse(h.righe.join('').trim())).toEqual({ id: 'p1', kind: 'scrollback', data: '' })
  })
})
