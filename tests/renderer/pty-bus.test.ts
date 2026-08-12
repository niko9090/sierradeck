import { describe, it, expect, vi } from 'vitest'
import { creaBus, ARRETRATI_MAX } from '../../src/renderer/pty-bus'
import type { HostToCore } from '@shared/protocol'

function banco(): { bus: ReturnType<typeof creaBus>; emetti: (msg: HostToCore) => void; iscrizioni: number } {
  let emetti: (msg: HostToCore) => void = () => {}
  const stato = { iscrizioni: 0 }
  const bus = creaBus((cb) => {
    stato.iscrizioni += 1
    emetti = cb
    return () => {}
  })
  return {
    bus,
    emetti: (msg) => emetti(msg),
    get iscrizioni() {
      return stato.iscrizioni
    }
  }
}

const dato = (id: string, data: string): HostToCore => ({ id, kind: 'data', data })

describe('bus degli eventi dei pty', () => {
  it('si iscrive al canale una volta sola, non una per riquadro', () => {
    const b = banco()
    b.bus.ascolta('a', () => {})
    b.bus.ascolta('b', () => {})
    b.bus.ascolta('c', () => {})
    // Prima ogni riquadro registrava il proprio ascoltatore su ipcRenderer:
    // oltre i dieci arrivava MaxListenersExceededWarning, e ogni chunk veniva
    // consegnato N volte per essere buttato N-1.
    expect(b.iscrizioni).toBe(1)
  })

  it('consegna ogni evento al solo riquadro che lo possiede', () => {
    const b = banco()
    const a = vi.fn()
    const c = vi.fn()
    b.bus.ascolta('a', a)
    b.bus.ascolta('c', c)

    b.emetti(dato('a', 'ciao'))

    expect(a).toHaveBeenCalledTimes(1)
    expect(c).not.toHaveBeenCalled()
  })

  it('conserva gli eventi che precedono l assegnazione dell id e li rigioca in ordine', () => {
    // La corsa e' reale: la promise di spawn attraversa un salto IPC, un
    // evento ne attraversa due piu' l'avvio del processo.
    const b = banco()
    b.emetti(dato('a', 'primo'))
    b.emetti(dato('a', 'secondo'))

    const ricevuti: string[] = []
    b.bus.ascolta('a', (m) => {
      if (m.kind === 'data') ricevuti.push(m.data)
    })

    expect(ricevuti).toEqual(['primo', 'secondo'])
  })

  it('non mescola gli arretrati di riquadri diversi', () => {
    const b = banco()
    b.emetti(dato('a', 'di a'))
    b.emetti(dato('b', 'di b'))

    const ricevuti: string[] = []
    b.bus.ascolta('a', (m) => {
      if (m.kind === 'data') ricevuti.push(m.data)
    })

    expect(ricevuti).toEqual(['di a'])
  })

  it('non consegna piu nulla dopo l annullamento', () => {
    const b = banco()
    const a = vi.fn()
    const smetti = b.bus.ascolta('a', a)
    smetti()

    b.emetti(dato('a', 'dopo'))

    expect(a).not.toHaveBeenCalled()
  })

  it('scarta gli arretrati di un id che nessuno reclamera', () => {
    // Il caso vero: un riquadro smontato prima che lo spawn restituisse l'id.
    // Senza questo, la sua coda resterebbe nel bus per sempre.
    const b = banco()
    b.emetti(dato('a', 'orfano'))
    b.bus.scarta('a')

    const ricevuti: string[] = []
    b.bus.ascolta('a', (m) => {
      if (m.kind === 'data') ricevuti.push(m.data)
    })

    expect(ricevuti).toEqual([])
  })

  it('non accumula arretrati senza fine per un id che nessuno ascolta', () => {
    // Da quando cambiare workspace non uccide piu' le chat, un terminale puo'
    // restare senza ascoltatore per ore mentre il suo autopilota continua a
    // scrivere. Senza un tetto, il renderer terrebbe in memoria tutto
    // l'output prodotto in secondo piano: e' lo scrollback del PTY host a
    // conservarlo, e al riaggancio arriva da li'.
    const b = banco()
    for (let n = 0; n < ARRETRATI_MAX + 50; n += 1) b.emetti(dato('a', `riga-${n}`))

    const ricevuti: string[] = []
    b.bus.ascolta('a', (m) => {
      if (m.kind === 'data') ricevuti.push(m.data)
    })

    expect(ricevuti).toHaveLength(ARRETRATI_MAX)
    // Si buttano i piu' vecchi: quello che conta e' cosa e' successo per
    // ultimo, non come era cominciato.
    expect(ricevuti[ricevuti.length - 1]).toBe(`riga-${ARRETRATI_MAX + 49}`)
  })
})
