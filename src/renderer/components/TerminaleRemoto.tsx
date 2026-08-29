import React, { useEffect, useRef, useState } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

/**
 * Il terminale sul server, dentro il pannello dei file.
 *
 * È l'altra metà di FileZilla: sfogliare i file di una macchina e non poterci
 * dare un comando vuol dire aprire comunque un'altra finestra — che era
 * esattamente la cosa da togliere. Riavviare un servizio dopo aver caricato il
 * file che l'ha cambiato è **un** gesto, e deve stare in **un** posto.
 *
 * Il canale è lo stesso della connessione SFTP già aperta. Non è un risparmio
 * di rete: è che autenticarsi due volte vuol dire chiedere la password due
 * volte, o tenerne due copie in giro.
 */
export function TerminaleRemoto(
  { destinazione, altezza = 240, onErrore }: {
    /** Il server. Cambiarlo chiude la shell di prima e ne apre una nuova. */
    destinazione: string
    altezza?: number
    onErrore?: (messaggio: string) => void
  }
): React.JSX.Element {
  const contenitore = useRef<HTMLDivElement>(null)
  const [finito, setFinito] = useState(false)

  useEffect(() => {
    const nodo = contenitore.current
    if (nodo === null) return
    setFinito(false)

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

    /**
     * Il numero della shell arriva **dopo**, e nel frattempo si può già
     * scrivere. I tasti premuti prima si tengono da parte invece di perderli:
     * una password digitata nel vuoto è il modo più veloce di far credere che
     * il terminale sia morto.
     */
    let numero: string | undefined
    let vivo = true
    const inAttesa: string[] = []

    const smetti = window.gestore.trasferimenti.suGuscio((e) => {
      if (numero === undefined || e.guscio !== numero) return
      if (e.dati !== undefined) term.write(e.dati)
      if (e.finito === true) {
        setFinito(true)
        term.write('\r\n\x1b[33m[la sessione sul server si è chiusa]\x1b[0m\r\n')
      }
    })

    const dati = term.onData((d) => {
      if (numero === undefined) { inAttesa.push(d); return }
      void window.gestore.trasferimenti.scriviGuscio(numero, d)
    })

    void window.gestore.trasferimenti
      .apriGuscio(destinazione, term.cols, term.rows)
      .then((n) => {
        if (!vivo) {
          // Il riquadro è già sparito mentre il server rispondeva: la shell si
          // chiude subito, o resterebbe aperta sul server senza nessuno che la
          // guarda e senza nessuno che sappia il suo numero.
          void window.gestore.trasferimenti.chiudiGuscio(n)
          return
        }
        numero = n
        for (const pezzo of inAttesa) void window.gestore.trasferimenti.scriviGuscio(n, pezzo)
        inAttesa.length = 0
      })
      .catch((e: unknown) => {
        term.write(`\r\n\x1b[31m[non riesco ad aprire il terminale: ${String(e)}]\x1b[0m\r\n`)
        onErrore?.(String(e))
      })

    const osservatore = new ResizeObserver(() => {
      fit.fit()
      if (numero !== undefined) {
        void window.gestore.trasferimenti.ridimensionaGuscio(numero, term.cols, term.rows)
      }
    })
    osservatore.observe(nodo)

    return () => {
      vivo = false
      osservatore.disconnect()
      dati.dispose()
      smetti()
      if (numero !== undefined) void window.gestore.trasferimenti.chiudiGuscio(numero)
      term.dispose()
    }
  }, [destinazione])

  return (
    <div className="trasf__terminale" style={{ height: altezza }}>
      <div ref={contenitore} className="trasf__terminale-dentro" />
      {finito ? <div className="misura trasf__terminale-nota">Chiudi e riapri per ricominciare.</div> : null}
    </div>
  )
}
