import { useEffect, useRef, useState } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { ptyBus } from '../pty-bus'
import { creaAggancio } from '../aggancio'
import { decidiAzioneAppunti } from '../appunti'
import { useLayoutStore } from '../state/layout'
import { useSessionStore } from '../state/sessions'
import { attesaPrevistaMs, avanzamento, descriviAttesa } from '../attesa-chat'
import { mostraAttesa } from '../preferenze-vive'

type Props = {
  paneId: string
  sessionUuid: string
  cwd: string
  title?: string
  /** Il pty a cui riagganciarsi, se questo riquadro ne aveva uno. */
  ptyId?: string
  /** Il modello scelto per questa chat, se non è quello predefinito. */
  model?: string
  /** Chi la governa, quando è la chat di un autopilota: da qui nascono i suoi hook. */
  autopilota?: { id: string; chat: string }
  onPtyId: (paneId: string, ptyId: string) => void
}

/** Ogni quanto avanza la barra dell'attesa: abbastanza da sembrare viva. */
const PASSO_ATTESA_MS = 150

export function Terminal({ paneId, sessionUuid, cwd, title, ptyId, model, autopilota, onPtyId }: Props): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)

  /**
   * Il peso della conversazione, dall'indice.
   *
   * È l'unica cosa onesta da dire mentre si aspetta: spiega **perché** ci mette.
   * Se l'indice non la conosce ancora vale zero, e allora l'attesa si limita a
   * dire «apro la chat» — una stima inventata sarebbe peggio di nessuna stima.
   */
  const peso = useSessionStore(
    (s) => s.sessions.find((x) => x.uuid === sessionUuid)?.sizeBytes ?? 0
  )
  /**
   * Da quando si aspetta. `undefined` = la chat è a schermo, non c'è niente da
   * aspettare.
   *
   * Una conversazione lunga tiene il riquadro nero per secondi — `claude.exe`
   * sta rileggendo megabyte di trascrizione — e un riquadro nero non si legge
   * come «sto caricando»: si legge come «è rotto».
   */
  const [attesaDa, setAttesaDa] = useState<number | undefined>(() =>
    mostraAttesa() ? Date.now() : undefined
  )
  const [adesso, setAdesso] = useState(() => Date.now())
  // Il setter dentro un ref: l'effetto del terminale nasce una volta sola
  // (`[paneId]`) e non deve rinascere perché lo stato è cambiato — rinascere
  // significherebbe ricreare l'xterm e, con lui, uccidere claude.exe.
  const finitaAttesa = useRef(setAttesaDa)
  finitaAttesa.current = setAttesaDa

  // L'orologio gira solo mentre si aspetta: a chat aperta non c'è niente da
  // ridisegnare, e un intervallo per riquadro acceso per sempre sarebbe il
  // lavoro inutile a riposo che la 0.12.8 aveva appena tolto.
  useEffect(() => {
    if (attesaDa === undefined) return
    const t = setInterval(() => setAdesso(Date.now()), PASSO_ATTESA_MS)
    return () => clearInterval(t)
  }, [attesaDa])

  // Tutto ciò che serve una volta sola, all'avvio, passa da un ref e non dalle
  // dipendenze dell'effetto. L'identità dell'effetto è `paneId` e nient'altro,
  // la stessa chiave con cui il Mosaic identifica il riquadro: così un cambio di
  // titolo, o l'arrivo di un ptyId nuovo dopo un rilancio, non smonta il
  // terminale e non uccide claude.exe. È il difetto che il commento in
  // Mosaic.tsx promette che non accade, e nel Task 5 diventerebbe raggiungibile
  // per davvero, perché `ptyId` cambia durante la vita del riquadro.
  const avvio = useRef({ sessionUuid, cwd, title, ptyId, model, autopilota, onPtyId })
  avvio.current = { sessionUuid, cwd, title, ptyId, model, autopilota, onPtyId }

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
          ...(iniziale.model !== undefined ? { model: iniziale.model } : {}),
          // Chi governa questa chat: il Core ne ricava gli hook con cui
          // l'autopilota saprà che ha finito di rispondere.
          ...(iniziale.autopilota !== undefined ? { autopilota: iniziale.autopilota } : {})
        }),
      attach: (id) => window.gestore.pty.attach(id),
      write: (id, data) => window.gestore.pty.write(id, data),
      resize: (id, cols, rows) => window.gestore.pty.resize(id, cols, rows),
      kill: (id) => window.gestore.pty.kill(id),
      ascolta: (id, cb) => bus.ascolta(id, cb),
      scarta: (id) => bus.scarta(id),
      scrivi: (testo) => {
        // La prima cosa che arriva **è** la chat che compare: da lì in poi non
        // c'è più niente da aspettare, e l'attesa se ne va. Vale sia per lo
        // scrollback di un riaggancio sia per il primo disegno di Claude Code,
        // che è esattamente quello che si stava aspettando.
        if (testo !== '') finitaAttesa.current(undefined)
        term.write(testo)
      },
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

  const previsto = attesaPrevistaMs(peso)
  const trascorso = attesaDa === undefined ? 0 : Math.max(0, adesso - attesaDa)

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      {attesaDa !== undefined ? (
        // Sopra il terminale, non al suo posto: sotto c'è già l'xterm montato e
        // dimensionato, e sostituirlo vorrebbe dire rimisurarlo alla comparsa.
        <div className="attesa-chat" role="status" aria-live="polite">
          <div className="attesa-chat__barra">
            <div
              className="attesa-chat__pieno"
              style={{ width: `${avanzamento(trascorso, previsto)}%` }}
            />
          </div>
          <div className="attesa-chat__testo">{descriviAttesa(peso, trascorso)}</div>
        </div>
      ) : null}
    </div>
  )
}
