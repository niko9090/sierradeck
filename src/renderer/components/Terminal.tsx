import { useEffect, useRef, useState } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { adattaSePuoi } from '../adatta-terminale'
import '@xterm/xterm/css/xterm.css'
import { ptyBus } from '../pty-bus'
import { creaAggancio } from '../aggancio'
import { azioneDelTasto } from '../scorciatoie-vive'
import { decidiAzioneAppunti } from '../appunti'
import { useLayoutStore } from '../state/layout'
import { useSessionStore } from '../state/sessions'
import { attesaPrevistaMs, avanzamento, descriviAttesa } from '../attesa-chat'
import { registraSchermo, dimenticaSchermo } from '../schermo-terminale'
import { mostraAttesa } from '../preferenze-vive'
import { ModalePosta } from './ModalePosta'
import { pcVivo, type BattitoPc, type ChatAltrove } from '@shared/posta'
import { diagnostica, tettoAttesaMs, senzaSequenze, USCITA_PRECOCE_MS, type Diagnosi } from '../diagnosi-chat'
import { SEGNI_DI_PROMPT } from '../ultime-righe'
import { FinestraTemporanea } from './FinestraTemporanea'

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
  /**
   * La via principale, da 0.33.0: il riquadro diventa un riquadro remoto e
   * mostra la chat **dal vivo su quel PC**, con i suoi file. Il Terminal si
   * smonta (non aveva nessun claude.exe: lo spawn si era fermato) e al suo
   * posto arriva `RiquadroRemoto`.
   */
  const guardaDalVivo = (c: ChatAltrove): void => {
    useLayoutStore.getState().rendiRemoto(paneId, { pcId: c.pc.id, pcNome: c.pc.nome, cwd: c.cwd, sessione: c.sessionUuid })
  }
  const apriQuiLoStesso = (): void => {
    forzaQui.current = true
    setAltrove(undefined)
    riarma()
    aggancioRef.current?.rilancia()
  }

  /**
   * La chat non si apre: la diagnosi, e cosa fare.
   *
   * Nicholas (23/09): «dobbiamo mettere una procedura per risolvere il problema
   * di chat che non si aprono». Il riquadro raccoglie le ultime righe del
   * terminale, l'esito dell'aggancio (uscita, errore, spawn rifiutato) e il
   * tempo passato senza prompt, e da `diagnosi-chat.ts` ricava il caso con le
   * azioni. «Risoluzione avanzata» apre una mini finestra con un Claude Code
   * che legge il dossier del caso.
   */
  const [guasto, setGuasto] = useState<Diagnosi | undefined>(undefined)
  const guastoRef = useRef<Diagnosi | undefined>(undefined)
  guastoRef.current = guasto
  const avviatoA = useRef(Date.now())
  const promptVisto = useRef(false)
  const ultimeRighe = useRef<string[]>([])
  const ultimoPtyId = useRef<string | undefined>(undefined)
  const [miniFinestra, setMiniFinestra] = useState<{ titolo: string; sotto?: string; ptyId?: string; nota?: string } | undefined>(undefined)
  const riarma = (): void => {
    avviatoA.current = Date.now()
    promptVisto.current = false
    ultimeRighe.current = []
    setGuasto(undefined)
    if (mostraAttesa()) setAttesaDa(Date.now())
  }
  const annotaGuasto = (d: Diagnosi): void => {
    setGuasto(d)
    finitaAttesa.current(undefined)
    void window.gestore.log.errore(`[chat] «${avvio.current.title ?? ''}» (${avvio.current.sessionUuid}, ${avvio.current.cwd}) non si apre — ${d.caso}: ${d.titolo}. ${d.dettaglio.replace(/\s+/g, ' ').slice(0, 600)}`).catch(() => undefined)
  }
  const ricordaRighe = (testo: string): void => {
    const pulito = senzaSequenze(testo)
    if (SEGNI_DI_PROMPT.test(pulito)) promptVisto.current = true
    if (pulito.trim() === '') return
    const righe = [...ultimeRighe.current, ...pulito.split('\n')].filter((r) => r.trim() !== '')
    ultimeRighe.current = righe.slice(-60)
  }
  // Il tetto: senza prompt entro il doppio del previsto, la chat e' «lenta».
  useEffect(() => {
    if (guasto !== undefined) return
    const tetto = tettoAttesaMs(attesaPrevistaMs(peso))
    const t = setInterval(() => {
      if (promptVisto.current || guastoRef.current !== undefined || altrove !== undefined) return
      const trascorso = Date.now() - avviatoA.current
      if (trascorso < tetto) return
      annotaGuasto(diagnostica({ tipo: 'lenta', trascorsoMs: trascorso, previstoMs: tetto }, ultimeRighe.current))
    }, 2000)
    return () => clearInterval(t)
  }, [guasto, peso, altrove])
  const riprova = (): void => { riarma(); aggancioRef.current?.rilancia() }
  const aspettaAncora = (): void => { avviatoA.current = Date.now(); setGuasto(undefined) }
  const scegliCartella = (): void => {
    void window.gestore.sistema.scegliCartella().then((c) => {
      if (c === undefined || c === '') return
      useLayoutStore.getState().impostaCartella(avvio.current.sessionUuid, c)
      // `avvio.current` si aggiorna al prossimo disegno: lo spawn legge da li'.
      setTimeout(riprova, 0)
    }).catch(() => undefined)
  }
  const nuovaChatQui = (): void => {
    useLayoutStore.getState().addPane(avvio.current.cwd, avvio.current.title ?? '')
    useLayoutStore.getState().closePane(paneId)
  }
  const accedi = (): void => {
    setMiniFinestra({ titolo: 'Accesso a Claude Code', sotto: 'Si apre il browser: entra con il tuo account, poi torna qui', nota: 'Avvio…' })
    void window.gestore.preparazione.accedi().then((id) => setMiniFinestra({ titolo: 'Accesso a Claude Code', sotto: 'Si apre il browser: entra con il tuo account, poi chiudi qui e premi «Riprova»', ptyId: id }))
      .catch((e: unknown) => setMiniFinestra({ titolo: 'Accesso a Claude Code', nota: String(e) }))
  }
  const installa = (): void => {
    setMiniFinestra({ titolo: 'Installazione di Claude Code', nota: 'Avvio…' })
    void window.gestore.preparazione.installa().then((id) => setMiniFinestra({ titolo: 'Installazione di Claude Code', sotto: 'Quando finisce, chiudi qui e premi «Riprova»', ptyId: id }))
      .catch((e: unknown) => setMiniFinestra({ titolo: 'Installazione di Claude Code', nota: String(e) }))
  }
  const risoluzioneAvanzata = (d: Diagnosi): void => {
    setMiniFinestra({ titolo: 'Risoluzione avanzata', sotto: 'Un Claude Code legge il dossier del caso e ragiona con te', nota: 'Preparo il dossier e avvio l’assistente…' })
    void window.gestore.risoluzione.apri({
      cwd: avvio.current.cwd, sessionUuid: avvio.current.sessionUuid, titolo: avvio.current.title ?? '',
      caso: d.caso, titoloDiagnosi: d.titolo, dettaglio: d.dettaglio, ultimeRighe: ultimeRighe.current
    }).then((r) => setMiniFinestra({ titolo: 'Risoluzione avanzata', sotto: `Dossier: ${r.dossier}`, ptyId: r.ptyId }))
      .catch((e: unknown) => setMiniFinestra({ titolo: 'Risoluzione avanzata', nota: `Non sono riuscito ad avviare l’assistente: ${e instanceof Error ? e.message : String(e)}` }))
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
      spawn: (cols, rows) => {
        // Da `avvio.current`, non da `iniziale`: dopo «Scegli la cartella» la
        // chat riparte nella cartella nuova, e un rilancio deve leggerla.
        const ora = avvio.current
        avviatoA.current = Date.now()
        promptVisto.current = false
        return window.gestore.pty.spawn({
          sessionUuid: ora.sessionUuid,
          cwd: ora.cwd,
          title: ora.title,
          cols,
          rows,
          ...(ora.model !== undefined ? { model: ora.model } : {}),
          ...(forzaQui.current ? { forzaQui: true } : {}),
          // Chi governa questa chat: il Core ne ricava gli hook con cui
          // l'autopilota saprà che ha finito di rispondere.
          ...(ora.autopilota !== undefined ? { autopilota: ora.autopilota } : {})
        })
      },
      suAltrove: (c) => {
        finitaAttesa.current(undefined)
        suAltrove.current(c)
      },
      suEsito: (e) => {
        // Un'uscita dopo il prompt e lontana dall'avvio e' l'utente che ha
        // chiuso la chat (`/exit`): non e' un guasto.
        const trascorso = Date.now() - avviatoA.current
        if (e.tipo === 'uscita' && promptVisto.current && trascorso > USCITA_PRECOCE_MS) return
        if (e.tipo === 'uscita' && e.codice === 0 && promptVisto.current) return
        annotaGuasto(diagnostica(e.tipo === 'uscita' ? { tipo: 'uscita', codice: e.codice, trascorsoMs: trascorso } : e, ultimeRighe.current))
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
        ricordaRighe(testo)
        term.write(testo)
      },
      annunciaId: (id) => {
        // Chi guarda da lontano legge lo **schermo disegnato**, non il flusso:
        // un'interfaccia a tutto schermo si ridisegna in posizione, e rimetterne
        // insieme i pezzi in fila dava le scritte mischiate che si vedevano dal
        // telefono. La griglia di xterm quel lavoro l'ha gia' fatto.
        registraSchermo(id, () => term.buffer.active, () => term.rows)
        ultimoPtyId.current = id
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
      // Una scorciatoia di SierraDeck (cambia workspace, chat accanto, un
      // pannello) non e' roba del terminale: `false` dice a xterm di non
      // toccarla, e l'ascolto sulla finestra la esegue.
      if (e.type === 'keydown' && azioneDelTasto(e) !== undefined) return false
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
      const idVivo = aggancio.idCorrente() ?? ultimoPtyId.current
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
            e gli errori in rosso. La strada giusta è guardarla <strong>dal vivo là</strong>: questo riquadro mostra il
            terminale di quel PC e quello che scrivi arriva a lui, come dal telefono. Serve che {altrove.pc.nome} sia
            acceso e raggiungibile (stessa rete, o Tailscale su tutti e due); se è spento, resta la cassetta.
          </div>
          <div className="chat-altrove__azioni">
            {altrove.pc.id !== '' ? (
              <button className="tasto tasto--primario" onClick={() => guardaDalVivo(altrove)} title="Trasforma questo riquadro nella chat dal vivo su quel PC: vedi il suo terminale e gli scrivi da qui">
                Guarda dal vivo su {altrove.pc.nome}
              </button>
            ) : null}
            <button className={altrove.pc.id !== '' ? 'tasto' : 'tasto tasto--primario'} onClick={() => scriviLa(altrove)} title="Metti un’azione nella cassetta di quel PC: la esegue lui, in questa chat, quando è acceso">
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
      {guasto !== undefined && altrove === undefined ? (
        <div className="attesa-chat chat-altrove chat-guasto" role="alert">
          <div className="chat-altrove__titolo">{guasto.titolo}</div>
          <div className="chat-altrove__testo">{guasto.spiegazione}</div>
          {guasto.dettaglio !== '' ? <pre className="chat-guasto__dettaglio">{guasto.dettaglio.slice(0, 1500)}</pre> : null}
          <div className="chat-altrove__azioni">
            {guasto.azioni.map((a) => {
              switch (a) {
                case 'riprova': return <button key={a} className="tasto tasto--primario" onClick={riprova} title="Rilancia claude.exe sulla stessa conversazione">Riprova</button>
                case 'aspetta': return <button key={a} className="tasto tasto--primario" onClick={aspettaAncora} title="Toglie l’avviso e lascia lavorare ancora per lo stesso tempo">Aspetta ancora</button>
                case 'scegli-cartella': return <button key={a} className="tasto tasto--primario" onClick={scegliCartella} title="Dici dove sta ora la cartella: la chat riparte lì, con la sua conversazione">Scegli la cartella…</button>
                case 'nuova-chat': return <button key={a} className="tasto" onClick={nuovaChatQui} title="Apre una chat nuova nella stessa cartella e chiude questo riquadro">Apri una chat nuova qui</button>
                case 'accedi': return <button key={a} className="tasto tasto--primario" onClick={accedi} title="Rifà l’accesso a Claude Code nel browser">Rifai l’accesso</button>
                case 'installa': return <button key={a} className="tasto tasto--primario" onClick={installa} title="Installa o ritrova Claude Code">Installa Claude Code</button>
                case 'avanzata': return <button key={a} className="tasto" onClick={() => risoluzioneAvanzata(guasto)} title="Apre una mini finestra con un Claude Code che legge il dossier del caso (diagnosi, cartella, trascrizione, accesso, registro) e ti guida">Risoluzione avanzata…</button>
                default: return null
              }
            })}
          </div>
          <div className="chat-altrove__nota">
            Il perché è anche nel registro (Impostazioni → Registro → «Apri i log»). La conversazione non si perde: «Riprova» la riprende da dov’era.
          </div>
        </div>
      ) : null}
      {miniFinestra !== undefined ? (
        <FinestraTemporanea
          titolo={miniFinestra.titolo}
          {...(miniFinestra.sotto !== undefined ? { sottotitolo: miniFinestra.sotto } : {})}
          {...(miniFinestra.ptyId !== undefined ? { ptyId: miniFinestra.ptyId } : {})}
          {...(miniFinestra.nota !== undefined ? { nota: miniFinestra.nota } : {})}
          onChiudi={() => setMiniFinestra(undefined)}
        />
      ) : null}
      {postaPer !== undefined && altrove !== undefined ? (
        <ModalePosta pc={postaPer} vivo={pcVivo(postaPer, Date.now())} presel={{ cwd: altrove.cwd, sessione: altrove.sessionUuid }} onChiudi={() => setPostaPer(undefined)} />
      ) : null}
    </div>
  )
}
