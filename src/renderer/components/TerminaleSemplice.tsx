import { useEffect, useRef } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { ptyBus } from '../pty-bus'

type Props = {
  /** Il terminale a cui agganciarsi. Assente: non c'è ancora niente da mostrare. */
  ptyId?: string
  altezza?: number
}

/**
 * Un terminale agganciato a un pty che qualcun altro ha già avviato.
 *
 * Il `Terminal` del mosaico decide da sé se rilanciare o riagganciarsi, tiene
 * conto dei riquadri ceduti e parla con lo store del layout: tutta roba che qui
 * non c'è, perché qui il pty non è una chat — è un'installazione che scorre, o
 * un accesso che sta aspettando che qualcuno prema invio nel browser.
 *
 * Scrivere resta possibile ed è necessario: l'installatore può chiedere
 * conferma, e l'accesso di Claude Code aspetta una scelta proprio nel
 * terminale. Un riquadro di sola lettura lascerebbe l'utente davanti a una
 * domanda a cui non può rispondere.
 */
export function TerminaleSemplice({ ptyId, altezza = 260 }: Props): React.JSX.Element {
  const contenitore = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const nodo = contenitore.current
    if (!nodo || ptyId === undefined) return

    const term = new XTerm({
      fontFamily: 'Cascadia Mono, Consolas, monospace',
      fontSize: 12,
      theme: { background: '#1e1e1e', foreground: '#dddddd' },
      cursorBlink: true
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(nodo)
    fit.fit()

    const bus = ptyBus()
    const smetti = bus.ascolta(ptyId, (msg) => {
      if (msg.kind === 'data' || msg.kind === 'scrollback') term.write(msg.data)
      else if (msg.kind === 'exit') term.write(`\r\n\x1b[33m[terminato: ${msg.code}]\x1b[0m\r\n`)
      else if (msg.kind === 'error') term.write(`\r\n\x1b[31m[errore: ${msg.message}]\x1b[0m\r\n`)
    })

    const dati = term.onData((d) => window.gestore.pty.write(ptyId, d))
    const osservatore = new ResizeObserver(() => {
      fit.fit()
      window.gestore.pty.resize(ptyId, term.cols, term.rows)
    })
    osservatore.observe(nodo)

    return () => {
      osservatore.disconnect()
      dati.dispose()
      // Solo `smetti`, mai `kill`: chiudere la finestra della preparazione non
      // deve interrompere a metà un'installazione che sta scaricando, né un
      // accesso che sta aspettando il browser. Il processo finisce da sé.
      smetti()
      term.dispose()
    }
  }, [ptyId])

  return (
    <div
      ref={contenitore}
      style={{ width: '100%', height: altezza, background: '#1e1e1e', borderRadius: 4 }}
    />
  )
}
