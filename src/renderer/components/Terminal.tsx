import { useEffect, useRef } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { ptyBus } from '../pty-bus'
import { creaAggancio } from '../aggancio'
import { decidiAzioneAppunti } from '../appunti'
import { useLayoutStore } from '../state/layout'

type Props = {
  paneId: string
  sessionUuid: string
  cwd: string
  title?: string
  /** Il pty a cui riagganciarsi, se questo riquadro ne aveva uno. */
  ptyId?: string
  /** Il modello scelto per questa chat, se non è quello predefinito. */
  model?: string
  onPtyId: (paneId: string, ptyId: string) => void
}

export function Terminal({ paneId, sessionUuid, cwd, title, ptyId, model, onPtyId }: Props): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)

  // Tutto ciò che serve una volta sola, all'avvio, passa da un ref e non dalle
  // dipendenze dell'effetto. L'identità dell'effetto è `paneId` e nient'altro,
  // la stessa chiave con cui il Mosaic identifica il riquadro: così un cambio di
  // titolo, o l'arrivo di un ptyId nuovo dopo un rilancio, non smonta il
  // terminale e non uccide claude.exe. È il difetto che il commento in
  // Mosaic.tsx promette che non accade, e nel Task 5 diventerebbe raggiungibile
  // per davvero, perché `ptyId` cambia durante la vita del riquadro.
  const avvio = useRef({ sessionUuid, cwd, title, ptyId, model, onPtyId })
  avvio.current = { sessionUuid, cwd, title, ptyId, model, onPtyId }

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const term = new XTerm({
      fontFamily: 'Cascadia Mono, Consolas, monospace',
      fontSize: 13,
      theme: { background: '#1e1e1e', foreground: '#dddddd' },
      cursorBlink: true
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(container)
    fit.fit()

    // Prima di qualunque richiesta: il bus si iscrive al canale quando viene
    // creato, e gli eventi che precedono l'arrivo dell'id devono trovarlo già in
    // ascolto. Il tampone per id vive lì dentro.
    const bus = ptyBus()
    const iniziale = avvio.current

    const aggancio = creaAggancio({
      ptyIdIniziale: iniziale.ptyId,
      dimensioni: () => ({ cols: term.cols, rows: term.rows }),
      spawn: (cols, rows) =>
        window.gestore.pty.spawn({
          sessionUuid: iniziale.sessionUuid,
          cwd: iniziale.cwd,
          title: iniziale.title,
          cols,
          rows,
          ...(iniziale.model !== undefined ? { model: iniziale.model } : {})
        }),
      attach: (id) => window.gestore.pty.attach(id),
      write: (id, data) => window.gestore.pty.write(id, data),
      resize: (id, cols, rows) => window.gestore.pty.resize(id, cols, rows),
      kill: (id) => window.gestore.pty.kill(id),
      ascolta: (id, cb) => bus.ascolta(id, cb),
      scarta: (id) => bus.scarta(id),
      scrivi: (testo) => term.write(testo),
      annunciaId: (id) => avvio.current.onPtyId(paneId, id)
    })

    aggancio.avvia()

    const copia = (): void => {
      const selezione = term.getSelection()
      if (selezione === '') return
      window.gestore.appunti.scrivi(selezione)
      // Senza questo, la selezione resta evidenziata e il prossimo Ctrl+C
      // copierebbe di nuovo invece di interrompere: l'utente lo leggerebbe come
      // «Ctrl+C non funziona piu'».
      term.clearSelection()
    }

    // `term.paste` e non `write`: passa dalla codifica del paste con parentesi
    // quando la modalita' e' attiva, ed e' cio' che permette a Claude Code di
    // riconoscere un blocco incollato invece di interpretarne ogni riga come un
    // invio — un testo di venti righe incollato senza parentesi diventerebbe
    // venti messaggi.
    const incolla = (): void => term.paste(window.gestore.appunti.leggi())

    term.attachCustomKeyEventHandler((e) => {
      const azione = decidiAzioneAppunti(e, term.hasSelection())
      if (azione === 'passa') return true
      e.preventDefault()
      if (azione === 'copia') copia()
      else incolla()
      // `false` ferma xterm: senza, Ctrl+V manderebbe anche \x16 al terminale.
      return false
    })

    // Tasto destro come nei terminali di Windows: copia se c'e' una selezione,
    // altrimenti incolla. E' l'unica strada per chi non usa le scorciatoie.
    const suTastoDestro = (e: MouseEvent): void => {
      e.preventDefault()
      if (term.hasSelection()) copia()
      else incolla()
    }
    container.addEventListener('contextmenu', suTastoDestro)

    const onData = term.onData((data) => aggancio.scrivi(data))
    const observer = new ResizeObserver(() => {
      fit.fit()
      // Il ridimensionamento è anche ciò che fa ridisegnare l'interfaccia di
      // Claude Code dopo un riaggancio, coprendo l'eventuale schermata
      // parziale ricostruita da uno scrollback troncato.
      aggancio.ridimensiona(term.cols, term.rows)
    })
    observer.observe(container)

    return () => {
      observer.disconnect()
      container.removeEventListener('contextmenu', suTastoDestro)
      onData.dispose()
      // Un riquadro può sparire dall'albero per due ragioni opposte: è stato
      // chiuso, o è stato ceduto a un'altra finestra. Lo store è l'unico a
      // saperlo, e distinguere qui è ciò che permette a una chat spostata di
      // continuare a vivere invece di essere uccisa un istante dopo la cessione.
      if (useLayoutStore.getState().ceduti.has(paneId)) aggancio.stacca()
      else aggancio.chiudi()
      term.dispose()
    }
  }, [paneId])

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}
