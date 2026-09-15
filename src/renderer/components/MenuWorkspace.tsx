import { useEffect, useRef, useState } from 'react'
import { contaChatPerWorkspace, filtraWorkspace } from '../menu-workspace'

type Props = {
  nomi: string[]
  attivo: string
  chiamano?: ReadonlySet<string> | undefined
  onCambia: (nome: string) => void
  /** «Crea, rinomina o elimina…»: apre il pannello dei workspace. */
  onGestisci: () => void
}

/**
 * Il menu a tendina dei workspace, per quando sono tanti.
 *
 * Il tasto mostra il nome **intero** di dove sei e quanti workspace ci sono;
 * il menu li elenca tutti per esteso, con quante chat ha ciascuno e il
 * pallino di chi aspetta una tua risposta. Con piu' di otto c'e' una casella
 * per cercare: si scrive un pezzo del nome e si preme Invio.
 */
export function MenuWorkspace({ nomi, attivo, chiamano, onCambia, onGestisci }: Props): React.JSX.Element {
  const [aperto, setAperto] = useState(false)
  const [filtro, setFiltro] = useState('')
  const [conti, setConti] = useState<Map<string, number>>(new Map())
  const casella = useRef<HTMLInputElement>(null)
  const quantiChiamano = nomi.filter((n) => chiamano?.has(n) === true && n !== attivo).length

  useEffect(() => {
    if (!aperto) return
    setFiltro('')
    void window.gestore.workspace.dove().then((d) => setConti(contaChatPerWorkspace(d))).catch(() => undefined)
    const suTasto = (e: KeyboardEvent): void => { if (e.key === 'Escape') setAperto(false) }
    window.addEventListener('keydown', suTasto)
    // Il fuoco nella casella, se c'e': si apre e si scrive subito.
    setTimeout(() => casella.current?.focus(), 0)
    return () => window.removeEventListener('keydown', suTasto)
  }, [aperto])

  const visibili = filtraWorkspace(nomi, filtro)
  const scegli = (n: string): void => { setAperto(false); if (n !== attivo) onCambia(n) }

  return (
    <div className="ws-menu">
      <button
        className={`ws-menu__tasto${quantiChiamano > 0 ? ' ws-menu__tasto--chiama' : ''}`}
        onClick={() => setAperto((a) => !a)}
        aria-haspopup="listbox"
        aria-expanded={aperto}
        title={`Sei in «${attivo}». ${nomi.length} workspace: premi per vederli tutti`}
      >
        <span className="ws-menu__nome">{attivo}</span>
        <span className="ws-menu__quanti">{nomi.length}</span>
        {quantiChiamano > 0 ? <span className="ws__chiama" aria-label="in altri workspace qualcuno aspetta una tua risposta">●</span> : null}
        <span className="ws-menu__freccia" aria-hidden>▾</span>
      </button>
      {aperto ? (
        <>
          <div className="ws-menu__velo" onMouseDown={() => setAperto(false)} />
          <div className="ws-menu__tendina" role="listbox" aria-label="Workspace">
            {nomi.length > 8 ? (
              <input
                ref={casella}
                className="campo ws-menu__filtro"
                value={filtro}
                onChange={(e) => setFiltro(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && visibili[0] !== undefined) scegli(visibili[0]) }}
                placeholder="cerca un workspace…"
                aria-label="cerca un workspace"
              />
            ) : null}
            <div className="ws-menu__lista">
              {visibili.length === 0 ? <div className="ws-menu__vuoto">Nessun workspace con «{filtro}».</div> : null}
              {visibili.map((n) => {
                const chiama = chiamano?.has(n) === true
                const quante = conti.get(n)
                return (
                  <button
                    key={n}
                    role="option"
                    aria-selected={n === attivo}
                    className={['ws-menu__voce', n === attivo ? 'ws-menu__voce--attiva' : '', chiama ? 'ws-menu__voce--chiama' : ''].filter((c) => c !== '').join(' ')}
                    onClick={() => scegli(n)}
                    title={chiama ? `In «${n}» qualcuno aspetta una tua risposta` : n === attivo ? `Sei in «${n}»` : `Passa a «${n}»`}
                  >
                    <span className="ws-menu__spunta" aria-hidden>{n === attivo ? '✓' : ''}</span>
                    <span className="ws-menu__voce-nome">{n}</span>
                    {chiama ? <span className="ws__chiama" aria-label="richiede il tuo intervento">●</span> : null}
                    <span className="ws-menu__conta">{quante === undefined ? '' : quante === 1 ? '1 chat' : `${quante} chat`}</span>
                  </button>
                )
              })}
            </div>
            <div className="ws-menu__piede">
              <button className="tasto" onClick={() => { setAperto(false); onGestisci() }}>Crea, rinomina o elimina…</button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
