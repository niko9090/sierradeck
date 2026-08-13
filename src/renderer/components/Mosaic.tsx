import { useCallback, useEffect, useRef, useState } from 'react'
import type { LayoutNode } from '@shared/layout-tree'
import { computeGeometry } from '@shared/layout-geometry'
import type { DividerBox } from '@shared/layout-geometry'
import { useLayoutStore } from '../state/layout'
import { spostaRiquadro } from '../spostamento'
import { memoriaWorkspace } from '../memoria-workspace'
import { MODELLI_IN_CHAT } from '../modelli'
import { Terminal } from './Terminal'
import { DiarioAutopilota } from './DiarioAutopilota'
import { autopilotaDi } from '../diario-autopilota'
import type { Autopilota } from '@shared/autopilota'
import { DropOverlay } from './DropOverlay'

const SPESSORE_DIVISORE = 6

/**
 * Il comando «sposta in un'altra finestra», nella barra del titolo del riquadro.
 *
 * Un comando esplicito e non un trascinamento: il trascinamento del browser non
 * attraversa due finestre di Electron — sono due processi di rendering distinti
 * e il `dataTransfer` non li collega — quindi servirebbe un trascinamento nativo
 * o un protocollo mediato dal Core. Questo fa la stessa cosa, in modo robusto e
 * verificabile.
 *
 * L'elenco delle finestre si chiede al primo clic e non a ogni rirender: una
 * invoke per riquadro a ogni ridisegno del mosaico sarebbe traffico inutile su
 * un dato che cambia solo quando si apre o si chiude una finestra.
 */
function ComandoSposta({ paneId }: { paneId: string }): React.JSX.Element {
  const [finestre, setFinestre] = useState<{ id: number; titolo: string }[] | undefined>(undefined)
  const [workspace, setWorkspace] = useState<{ nomi: string[]; attivo: string } | undefined>(undefined)
  const [errore, setErrore] = useState<string | undefined>(undefined)
  const chiudiPane = useLayoutStore((s) => s.closePane)
  const staccaPane = useLayoutStore((s) => s.staccaPane)

  const carica = (): void => {
    window.gestore.finestre
      .elenco()
      .then(setFinestre)
      .catch((err: unknown) => {
        setFinestre([])
        setErrore(String(err))
      })
    // Anche i workspace: sono l'altra destinazione possibile, e chi cerca
    // «dove mando questa chat» apre un menu solo.
    window.gestore.workspace
      .stato()
      .then(setWorkspace)
      .catch(() => setWorkspace(undefined))
  }

  // All'apparizione del riquadro, non al primo clic: il menu deve essere gia'
  // pieno quando si apre.
  useEffect(carica, [])

  /**
   * Manda la chat in un workspace che non è aperto.
   *
   * Il riquadro se ne va da qui e il suo `claude.exe` si chiude: la
   * conversazione resta su disco e riparte con `--resume` quando si passa a
   * quel workspace. È lo stesso comportamento del cambio di workspace, che
   * l'utente conosce già.
   */
  const versoWorkspace = (nome: string): void => {
    const pane = staccaPane(paneId)
    if (pane === undefined) return
    window.gestore.workspace
      .spostaChat(nome, pane)
      .then(() => {
        // **Anche alla memoria.** Il Core l'ha scritta sul disco, ma tornando
        // in quel workspace vince la copia che questa finestra tiene viva — e
        // quella non sa dello spostamento. Senza questa riga la chat spariva al
        // ritorno, e il primo salvataggio la cancellava anche dal file: non
        // «spostata male», proprio persa.
        memoriaWorkspace().aggiungi(nome, pane)
        chiudiPane(paneId)
      })
      .catch((err: unknown) => {
        // Se non è arrivata a destinazione deve restare dov'era: staccarla e
        // basta vorrebbe dire farla sparire da tutt'e due le parti.
        useLayoutStore.getState().accogliPane(pane)
        setErrore(String(err))
      })
  }

  const sposta = (finestraId: number): void => {
    setErrore(undefined)
    void spostaRiquadro(
      {
        stacca: (id) => useLayoutStore.getState().staccaPane(id),
        sposta: (pane, id) => window.gestore.finestre.sposta(pane, id),
        accogli: (pane) => useLayoutStore.getState().accogliPane(pane),
        segnala: (err) => setErrore(String(err))
      },
      paneId,
      finestraId
    )
  }

  return (
    <select
      value=""
      // Il ricarico al clic tiene fresco l'elenco; a riempirlo la prima volta
      // ci pensa l'effetto qui sopra, perche' una richiesta che parte **al**
      // clic arriva quando il menu e' gia' aperto e vuoto: era il difetto per
      // cui serviva premere due volte.
      onMouseDown={() => carica()}
      onChange={(e) => {
        const scelto = e.target.value
        if (scelto === '') return
        if (scelto.startsWith('w:')) versoWorkspace(scelto.slice(2))
        else sposta(Number(scelto))
      }}
      title={errore ?? 'Sposta questa chat in un’altra finestra o in un altro workspace'}
      aria-label={`Sposta ${paneId} altrove`}
      className="comando-riquadro"
      style={{ color: errore !== undefined ? 'var(--ambra)' : undefined }}
    >
      <option value="">⇄</option>
      {finestre !== undefined && finestre.length === 0 ? (
        <option value="" disabled>Nessuna altra finestra</option>
      ) : null}
      {(finestre ?? []).map((f) => (
        <option key={f.id} value={f.id}>{f.titolo}</option>
      ))}
      {workspace !== undefined && workspace.nomi.filter((x) => x !== workspace.attivo).length > 0 ? (
        <optgroup label="Workspace">
          {workspace.nomi
            .filter((x) => x !== workspace.attivo)
            .map((x) => (
              <option key={x} value={`w:${x}`}>{x}</option>
            ))}
        </optgroup>
      ) : null}
    </select>
  )
}

function Divider({ box, containerRef }: {
  box: DividerBox
  containerRef: React.RefObject<HTMLDivElement | null>
}): React.JSX.Element {
  const resize = useLayoutStore((s) => s.resize)
  const precedente = useRef(0)
  const orizzontale = box.direction === 'horizontal'

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    precedente.current = orizzontale ? e.clientX : e.clientY

    const onMove = (ev: PointerEvent): void => {
      const cont = containerRef.current
      if (!cont) return
      // La quota va calcolata sull'estensione dello split, non del contenitore:
      // un divisore annidato copre solo una frazione dello schermo.
      const totale = (orizzontale ? cont.clientWidth : cont.clientHeight) * box.parentFraction
      if (totale === 0) return
      const pos = orizzontale ? ev.clientX : ev.clientY
      resize(box.splitId, box.index, (pos - precedente.current) / totale)
      precedente.current = pos
    }

    const fine = (): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', fine)
      // Serve anche pointercancel: perdere il puntatore (Alt-Tab, una finestra
      // di sistema) non emette pointerup, e gli ascoltatori resterebbero vivi.
      // Il trascinamento successivo ne aggiungerebbe un secondo sullo stesso
      // riferimento, producendo ridimensionamenti a scatti.
      window.removeEventListener('pointercancel', fine)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', fine)
    window.addEventListener('pointercancel', fine)
  }, [box, containerRef, orizzontale, resize])

  // Il divisore e' un'incisione fra due riquadri, non una barra: scuro con un
  // filo di luce, come i solchi della console.
  const comune = {
    position: 'absolute' as const,
    background: 'var(--incisione)',
    boxShadow: 'inset 0 1px 0 var(--luce-incisione), inset 1px 0 0 var(--luce-incisione)',
    zIndex: 2
  }

  return (
    <div
      onPointerDown={onPointerDown}
      style={
        orizzontale
          ? {
              ...comune,
              cursor: 'col-resize',
              left: `${box.at * 100}%`,
              top: `${box.crossStart * 100}%`,
              height: `${box.crossSize * 100}%`,
              width: SPESSORE_DIVISORE,
              transform: `translateX(-${SPESSORE_DIVISORE / 2}px)`
            }
          : {
              ...comune,
              cursor: 'row-resize',
              top: `${box.at * 100}%`,
              left: `${box.crossStart * 100}%`,
              width: `${box.crossSize * 100}%`,
              height: SPESSORE_DIVISORE,
              transform: `translateY(-${SPESSORE_DIVISORE / 2}px)`
            }
      }
    />
  )
}

export function Mosaic({
  node,
  autopiloti
}: {
  node: LayoutNode
  /** Servono al riquadro per sapere se qualcuno sta governando la sua chat. */
  autopiloti: Autopilota[]
}): React.JSX.Element {
  const panes = useLayoutStore((s) => s.panes)
  const closePane = useLayoutStore((s) => s.closePane)
  const setPtyId = useLayoutStore((s) => s.setPtyId)
  const rinominaPane = useLayoutStore((s) => s.rinominaPane)
  // Quale riquadro si sta rinominando, e con che testo: il nome si cambia dove
  // lo si legge, con due clic sulla sua testata.
  const [rinominando, setRinominando] = useState<string | undefined>(undefined)
  // Quali riquadri stanno mostrando la conversazione dell'autopilota a tutta
  // larghezza: lì il terminale si fa da parte, perché i passaggi si leggono
  // come in una chat e su duecento pixel non ci stanno.
  const [diarioLargo, setDiarioLargo] = useState<ReadonlySet<string>>(new Set())
  const [bozzaNome, setBozzaNome] = useState('')
  const trascinato = useLayoutStore((s) => s.trascinato)
  const iniziaTrascinamento = useLayoutStore((s) => s.iniziaTrascinamento)
  const fineTrascinamento = useLayoutStore((s) => s.fineTrascinamento)
  const move = useLayoutStore((s) => s.move)
  const containerRef = useRef<HTMLDivElement>(null)
  const geometria = computeGeometry(node)

  return (
    <div ref={containerRef} style={{ position: 'relative', flex: 1, minWidth: 0, minHeight: 0 }}>
      {geometria.panes.map(({ paneId, rect }) => {
        const data = panes[paneId]
        if (!data) return null
        return (
          // Questi div sono fratelli in una lista piatta, ognuno con la chiave
          // stabile del proprio riquadro. Un cambio di layout ne cambia solo lo
          // stile: React non li smonta mai, quindi nessun <Terminal> viene
          // ricreato e nessun processo claude.exe viene ucciso.
          <div
            key={paneId}
            className="riquadro"
            style={{
              position: 'absolute',
              left: `${rect.left * 100}%`,
              top: `${rect.top * 100}%`,
              width: `${rect.width * 100}%`,
              height: `${rect.height * 100}%`,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden'
            }}
          >
            <div
              draggable
              onDragStart={(e) => {
                // Il dato serve al browser per considerare valido il
                // trascinamento; l'id vero lo tiene lo store, perche' e' anche
                // cio' che decide quali zone di rilascio mostrare.
                e.dataTransfer.setData('text/plain', paneId)
                e.dataTransfer.effectAllowed = 'move'
                iniziaTrascinamento(paneId)
              }}
              onDragEnd={() => fineTrascinamento()}
              className="testata-riquadro"
              style={{ cursor: trascinato === paneId ? 'grabbing' : 'grab' }}
            >
              {/* Le tre righe di presa: si vedono solo passandoci sopra, e
                  dicono che la testata si trascina prima che l'utente ci provi
                  per caso. */}
              <span className="presa" aria-hidden="true">⋮⋮</span>
              {rinominando === paneId ? (
                <input
                  autoFocus
                  className="campo testata-riquadro__campo"
                  value={bozzaNome}
                  onChange={(e) => setBozzaNome(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onBlur={() => setRinominando(undefined)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      rinominaPane(paneId, bozzaNome)
                      // Il nome vale anche per l'elenco delle sessioni: è la
                      // stessa chat, e ricordarlo in un posto solo non basta.
                      void window.gestore.etichette.imposta(data.sessionUuid, bozzaNome).catch(() => undefined)
                      setRinominando(undefined)
                    }
                    if (e.key === 'Escape') setRinominando(undefined)
                  }}
                />
              ) : (
                <span
                  className="testata-riquadro__titolo"
                  onDoubleClick={() => { setBozzaNome(data.title); setRinominando(paneId) }}
                  title="Due clic per dargli un nome tuo"
                >
                  {data.title}
                </span>
              )}
              <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                {/* Il modello di **questa** chat, cambiabile mentre lavora: si
                    manda il comando `/model` nel terminale, che è lo stesso
                    gesto che si farebbe a mano — così la conversazione non si
                    interrompe e non riparte da capo. */}
                <select
                  className="campo campo--compatto testata-riquadro__modello"
                  value=""
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => {
                    const scelto = e.target.value
                    if (scelto === '' || data.ptyId === undefined) return
                    window.gestore.pty.write(data.ptyId, `/model ${scelto}
`)
                    e.target.value = ''
                  }}
                  title="Cambia il modello di questa chat"
                >
                  <option value="">modello…</option>
                  {MODELLI_IN_CHAT.map((m) => (
                    <option key={m.valore} value={m.valore}>{m.etichetta}</option>
                  ))}
                </select>
                <ComandoSposta paneId={paneId} />
                {/* Dormire non è chiudere: la conversazione resta, e quello che
                    si libera è il claude.exe che la teneva in piedi. Con
                    qualche workspace pieno se ne tengono accesi dieci per
                    guardarne due. */}
                <button
                  onClick={() => {
                    const daChiudere = useLayoutStore.getState().iberna(paneId)
                    if (daChiudere !== undefined) window.gestore.pty.kill(daChiudere)
                  }}
                  className="comando-riquadro"
                  title="Mette la chat a dormire: chiude il suo claude.exe e conserva la conversazione"
                  aria-label={`Iberna ${data.title}`}
                >
                  ⏸
                </button>
                <button
                  onClick={() => closePane(paneId)}
                  className="comando-riquadro"
                  title="Chiude la chat e termina il suo claude.exe"
                  aria-label={`Chiudi ${data.title}`}
                >
                  ×
                </button>
              </span>
            </div>
            {/* Il terminale e, di lato, cio' che l'autopilota sta pensando di
                questa stessa cartella: le due meta' della stessa storia. */}
            <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
              <div style={{ flex: 1, minWidth: 0, display: diarioLargo.has(paneId) ? 'none' : 'block' }}>
                {data.ibernata === true ? (
                  // Il riquadro resta al suo posto: farlo sparire sarebbe
                  // indistinguibile dall'averlo chiuso, e la differenza è
                  // esattamente il punto — la conversazione c'è ancora.
                  <div className="chat-dorme">
                    <div className="chat-dorme__titolo">Questa chat dorme</div>
                    <div className="chat-dorme__spiega">
                      Il suo claude.exe è chiuso e non occupa memoria. La conversazione è al
                      suo posto: si riprende da dove era.
                    </div>
                    <button
                      className="tasto"
                      onClick={() => useLayoutStore.getState().sveglia(paneId)}
                    >
                      Svegliala
                    </button>
                  </div>
                ) : (
                <Terminal
                  paneId={paneId}
                  sessionUuid={data.sessionUuid}
                  cwd={data.cwd}
                  title={data.title}
                  ptyId={data.ptyId}
                  model={data.model}
                  autopilota={data.autopilota}
                  onPtyId={setPtyId}
                />
                )}
              </div>
              {(() => {
                const suo = autopilotaDi(autopiloti, data.cwd)
                if (suo === undefined) return null
                return (
                  <DiarioAutopilota
                    autopilota={suo}
                    largo={diarioLargo.has(paneId)}
                    onLargo={(v) =>
                      setDiarioLargo((prima) => {
                        const dopo = new Set(prima)
                        if (v) dopo.add(paneId)
                        else dopo.delete(paneId)
                        return dopo
                      })
                    }
                  />
                )
              })()}
            </div>
            {trascinato !== undefined && trascinato !== paneId ? (
              <DropOverlay onRilascio={(p) => move(trascinato, paneId, p)} />
            ) : null}
          </div>
        )
      })}
      {geometria.dividers.map((box) => (
        <Divider key={`${box.splitId}-${box.index}`} box={box} containerRef={containerRef} />
      ))}
    </div>
  )
}
