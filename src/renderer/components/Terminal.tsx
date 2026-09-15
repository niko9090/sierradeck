import { useEffect, useRef, useState } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { adattaSePuoi } from '../adatta-terminale'
import '@xterm/xterm/css/xterm.css'
import { ptyBus } from '../pty-bus'
import { creaAggancio } from '../aggancio'
import { decidiAzioneAppunti } from '../appunti'
import { useLayoutStore } from '../state/layout'
import { useSessionStore } from '../state/sessions'
import { attesaPrevistaMs, avanzamento, descriviAttesa } from '../attesa-chat'
import { registraSchermo, dimenticaSchermo } from '../schermo-terminale'
import { mostraAttesa } from '../preferenze-vive'
import { ModalePosta } from './ModalePosta'
import { pcVivo, type BattitoPc, type ChatAltrove } from '@shared/posta'

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

/**
 * Quanto si aspetta che una misura si fermi prima di ridimensionare il
 * terminale.
 *
 * Nicholas (2026-09-15, con una foto): «spesso la grafica della chat si
 * sminchia» — le righe di Claude Code a scalino, una spostata rispetto
 * all'altra, i riquadri sovrapposti. Succede quando il riquadro cambia
 * misura piu' volte in un attimo (una striscia che compare con la sua
 * animazione, un pannello che si apre): ogni passo intermedio arrivava a
 * ConPTY come una misura nuova, e Claude Code ridisegnava lo schermo su una
 * larghezza gia' vecchia. Si aspetta che la misura sia ferma, e si manda
 * quella sola.
 */
const RIPOSO_RIDIMENSIONAMENTO_MS = 120

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

  /**
   * La chat e' di un altro PC: la sua cartella vive la', qui non c'e'. Lo
   * spawn si e' fermato e qui si sceglie: scriverle la' (la posta) o aprirla
   * qui lo stesso, in una cartella vuota, sapendo che i file non ci sono.
   */
  const [altrove, setAltrove] = useState<ChatAltrove | undefined>(undefined)
  const suAltrove = useRef(setAltrove)
  suAltrove.current = setAltrove
  const forzaQui = useRef(false)
  const aggancioRef = useRef<{ rilancia: () => void } | undefined>(undefined)
  const [postaPer, setPostaPer] = useState<BattitoPc | undefined>(undefined)
  const scriviLa = (c: ChatAltrove): void => {
    void window.gestore.posta.pc().then((pcs) => {
      const suo = pcs.find((b) => b.pcId === c.pc.id)
      setPostaPer(suo ?? { pcId: c.pc.id, nome: c.pc.nome, versione: '', battito: '', cartelle: [c.cwd], chat: [] })
    }).catch(() => setPostaPer({ pcId: c.pc.id, nome: c.pc.nome, versione: '', battito: '', cartelle: [c.cwd], chat: [] }))
  }
  const apriQuiLoStesso = (): void => {
    forzaQui.current = true
    setAltrove(undefined)
    if (mostraAttesa()) setAttesaDa(Date.now())
    aggancioRef.current?.rilancia()
  }

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
    // Solo se il contenitore ha una misura: un riquadro non ancora a schermo
    // propone zero righe, e un terminale a zero righe si rompe alla prima
    // riga che riceve. Ci ripensa il `ResizeObserver` appena diventa visibile.
    adattaSePuoi(fit)

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
          ...(forzaQui.current ? { forzaQui: true } : {}),
          // Chi governa questa chat: il Core ne ricava gli hook con cui
          // l'autopilota saprà che ha finito di rispondere.
          ...(iniziale.autopilota !== undefined ? { autopilota: iniziale.autopilota } : {})
        }),
      suAltrove: (c) => {
        finitaAttesa.current(undefined)
        suAltrove.current(c)
      },
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
      annunciaId: (id) => {
        // Chi guarda da lontano legge lo **schermo disegnato**, non il flusso:
        // un'interfaccia a tutto schermo si ridisegna in posizione, e rimetterne
        // insieme i pezzi in fila dava le scritte mischiate che si vedevano dal
        // telefono. La griglia di xterm quel lavoro l'ha gia' fatto.
        registraSchermo(id, () => term.buffer.active, () => term.rows)
        avvio.current.onPtyId(paneId, id)
      }
    })

    aggancioRef.current = aggancio
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
    let misuraInAttesa: number | undefined
    const observer = new ResizeObserver(() => {
      // Una misura sola, quando e' ferma: i passi intermedi di un'animazione
      // non arrivano al terminale (vedi `RIPOSO_RIDIMENSIONAMENTO_MS`).
      if (misuraInAttesa !== undefined) window.clearTimeout(misuraInAttesa)
      misuraInAttesa = window.setTimeout(() => {
        misuraInAttesa = undefined
        // Zero pixel non vuol dire «fammi piccolo», vuol dire «non sono a
        // schermo»: adattarsi lo porterebbe a zero righe, e la prima riga in
        // arrivo lo farebbe cadere — lontano da qui, dentro `write`.
        if (!adattaSePuoi(fit)) return
        // Il ridimensionamento è anche ciò che fa ridisegnare l'interfaccia di
        // Claude Code dopo un riaggancio, coprendo l'eventuale schermata
        // parziale ricostruita da uno scrollback troncato.
        aggancio.ridimensiona(term.cols, term.rows)
      }, RIPOSO_RIDIMENSIONAMENTO_MS)
    })
    observer.observe(container)

    return () => {
      if (misuraInAttesa !== undefined) window.clearTimeout(misuraInAttesa)
      observer.disconnect()
      container.removeEventListener('contextmenu', suTastoDestro)
      onData.dispose()
      // Un riquadro può sparire dall'albero per due ragioni opposte: è stato
      // chiuso, o è stato ceduto a un'altra finestra. Lo store è l'unico a
      // saperlo, e distinguere qui è ciò che permette a una chat spostata di
      // continuare a vivere invece di essere uccisa un istante dopo la cessione.
      // L'id del terminale si prende **prima** di staccare: lo store, a questo
      // punto, ha gia' tolto il riquadro (o azzerato il suo `ptyId`), e
      // leggerlo da li' dava sempre `undefined` — la griglia di ogni chat
      // chiusa restava offerta per tutta la vita della finestra, con il suo
      // xterm smontato dentro.
      const idVivo = aggancio.idCorrente()
      aggancioRef.current = undefined
      if (useLayoutStore.getState().ceduti.has(paneId)) aggancio.stacca()
      else aggancio.chiudi()
      // Prima di `dispose`: leggere la griglia di un terminale smontato non ha
      // senso, e continuare a offrirla mostrerebbe al telefono una chat che qui
      // non c'e' piu'.
      if (idVivo !== undefined) dimenticaSchermo(idVivo)
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
      {altrove !== undefined ? (
        <div className="attesa-chat chat-altrove" role="status" aria-live="polite">
          <div className="chat-altrove__titolo">Questa chat lavora su {altrove.pc.nome}</div>
          <div className="chat-altrove__testo">
            La sua cartella è <code>{altrove.cwd}</code>, e sta su quel computer: qui non c’è. Aprirla qui vorrebbe dire
            farla partire in una cartella vuota, senza i file del progetto: è quello che dava «directory non trovata»
            e gli errori in rosso. La conversazione la vedi lo stesso: arriva dal Drive man mano che quel PC ci lavora.
          </div>
          <div className="chat-altrove__azioni">
            <button className="tasto tasto--primario" onClick={() => scriviLa(altrove)} title="Metti un’azione nella cassetta di quel PC: la esegue lui, in questa chat, quando è acceso">
              Scrivile là, su {altrove.pc.nome}
            </button>
            <button className="tasto" onClick={apriQuiLoStesso} title="Apre la chat qui, in una cartella vuota con lo stesso nome: i file del progetto non ci sono">
              Aprila qui lo stesso
            </button>
          </div>
          <div className="chat-altrove__nota">
            Se invece vuoi lavorarci qui con i file, su quel PC metti la cartella sul Drive (Account → Progetti sul Drive):
            allora viaggia, e da qui prendi il testimone.
          </div>
        </div>
      ) : null}
      {postaPer !== undefined && altrove !== undefined ? (
        <ModalePosta pc={postaPer} vivo={pcVivo(postaPer, Date.now())} presel={{ cwd: altrove.cwd, sessione: altrove.sessionUuid }} onChiudi={() => setPostaPer(undefined)} />
      ) : null}
    </div>
  )
}
