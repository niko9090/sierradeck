import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { contaChatPerWorkspace, filtraWorkspace } from '../menu-workspace'

type Props = {
  nomi: string[]
  attivo: string
  chiamano?: ReadonlySet<string> | undefined
  /** Aperto o chiuso lo decide chi lo monta: così anche una scorciatoia lo apre. */
  aperto: boolean
  onAperto: (aperto: boolean) => void
  onCambia: (nome: string) => void
  /** «Crea, rinomina o elimina…»: apre il pannello dei workspace. */
  onGestisci: () => void
}

/**
 * Il menu a tendina dei workspace, per quando sono tanti.
 *
 * Il tasto mostra il nome **intero** di dove sei e quanti workspace ci sono;
 * la tendina li elenca tutti per esteso, con quante chat ha ciascuno e il
 * pallino di chi aspetta una tua risposta. Frecce e Invio per scegliere;
 * scrivendo un pezzo del nome l'elenco si restringe (Backspace cancella,
 * senza una casella in mezzo: Nicholas, 16/09, «mi fa vedere solo il cerca e
 * non mi serve, voglio l'elenco»).
 *
 * La tendina sta in un portale, attaccata al `body` e posizionata sotto il
 * tasto: la fascia dei workspace scorre in orizzontale (`overflow-x: auto`) e
 * qualunque cosa esca dal suo rettangolo viene tagliata. Nella 0.27.0 la
 * tendina era figlia della fascia e si vedeva solo la prima riga.
 */
export function MenuWorkspace({ nomi, attivo, chiamano, aperto, onAperto, onCambia, onGestisci }: Props): React.JSX.Element {
  const [filtro, setFiltro] = useState('')
  const [evidenziato, setEvidenziato] = useState(0)
  const [conti, setConti] = useState<Map<string, number>>(new Map())
  const [posto, setPosto] = useState<{ top: number; left: number } | undefined>(undefined)
  const tasto = useRef<HTMLButtonElement>(null)
  const lista = useRef<HTMLDivElement>(null)
  const quantiChiamano = nomi.filter((n) => chiamano?.has(n) === true && n !== attivo).length

  const visibili = filtraWorkspace(nomi, filtro)
  const scegli = (n: string): void => { onAperto(false); if (n !== attivo) onCambia(n) }

  // Dove mettere la tendina: sotto il tasto, allineata a sinistra, senza
  // uscire dalla finestra. Si ricalcola a ogni apertura e se la finestra cambia.
  useLayoutEffect(() => {
    if (!aperto) return
    const misura = (): void => {
      const r = tasto.current?.getBoundingClientRect()
      if (r === undefined) return
      const larghezza = Math.min(480, window.innerWidth - 32)
      setPosto({ top: r.bottom + 4, left: Math.max(16, Math.min(r.left, window.innerWidth - larghezza - 16)) })
    }
    misura()
    window.addEventListener('resize', misura)
    return () => window.removeEventListener('resize', misura)
  }, [aperto])

  useEffect(() => {
    if (!aperto) return
    setFiltro('')
    setEvidenziato(Math.max(0, nomi.indexOf(attivo)))
    void window.gestore.workspace.dove().then((d) => setConti(contaChatPerWorkspace(d))).catch(() => undefined)
    // La tendina ha il fuoco (tabIndex -1) così la tastiera arriva a lei e non
    // al terminale sotto.
    setTimeout(() => lista.current?.focus(), 0)
  }, [aperto, nomi, attivo])

  useEffect(() => {
    if (evidenziato >= visibili.length) setEvidenziato(Math.max(0, visibili.length - 1))
  }, [visibili.length, evidenziato])

  useEffect(() => {
    if (!aperto) return
    const voce = lista.current?.querySelectorAll<HTMLElement>('.ws-menu__voce')[evidenziato]
    voce?.scrollIntoView({ block: 'nearest' })
  }, [aperto, evidenziato])

  const suTasto = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') { e.preventDefault(); onAperto(false); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setEvidenziato((i) => (visibili.length === 0 ? 0 : (i + 1) % visibili.length)); return }
    if (e.key === 'ArrowUp') { e.preventDefault(); setEvidenziato((i) => (visibili.length === 0 ? 0 : (i - 1 + visibili.length) % visibili.length)); return }
    if (e.key === 'Home') { e.preventDefault(); setEvidenziato(0); return }
    if (e.key === 'End') { e.preventDefault(); setEvidenziato(Math.max(0, visibili.length - 1)); return }
    if (e.key === 'Enter') {
      e.preventDefault()
      const n = visibili[evidenziato] ?? visibili[0]
      if (n !== undefined) scegli(n)
      return
    }
    if (e.key === 'Backspace') { e.preventDefault(); setFiltro((f) => f.slice(0, -1)); return }
    // Un carattere stampabile, senza Ctrl o Alt: si sta scrivendo un pezzo del nome.
    if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
      e.preventDefault()
      setFiltro((f) => f + e.key)
      setEvidenziato(0)
    }
  }

  const tendina = aperto && posto !== undefined ? (
    <>
      <div className="ws-menu__velo" onMouseDown={() => onAperto(false)} />
      <div
        ref={lista}
        className="ws-menu__tendina"
        style={{ top: posto.top, left: posto.left }}
        role="listbox"
        aria-label="Workspace"
        aria-activedescendant={visibili[evidenziato] !== undefined ? `ws-menu-voce-${evidenziato}` : undefined}
        tabIndex={-1}
        onKeyDown={suTasto}
      >
        {filtro !== '' ? (
          <div className="ws-menu__cerca" aria-live="polite">
            Cerchi «<b>{filtro}</b>» — Backspace per cancellare, Invio per il primo
          </div>
        ) : null}
        <div className="ws-menu__lista">
          {visibili.length === 0 ? <div className="ws-menu__vuoto">Nessun workspace con «{filtro}».</div> : null}
          {visibili.map((n, i) => {
            const chiama = chiamano?.has(n) === true
            const quante = conti.get(n)
            return (
              <button
                key={n}
                id={`ws-menu-voce-${i}`}
                role="option"
                aria-selected={n === attivo}
                tabIndex={-1}
                className={[
                  'ws-menu__voce',
                  n === attivo ? 'ws-menu__voce--attiva' : '',
                  chiama ? 'ws-menu__voce--chiama' : '',
                  i === evidenziato ? 'ws-menu__voce--evidenziata' : ''
                ].filter((c) => c !== '').join(' ')}
                onMouseEnter={() => setEvidenziato(i)}
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
          <span className="ws-menu__aiuto">↑↓ e Invio, oppure scrivi il nome</span>
          <button className="tasto" tabIndex={-1} onClick={() => { onAperto(false); onGestisci() }}>Crea, rinomina o elimina…</button>
        </div>
      </div>
    </>
  ) : null

  return (
    <div className="ws-menu">
      <button
        ref={tasto}
        className={`ws-menu__tasto${quantiChiamano > 0 ? ' ws-menu__tasto--chiama' : ''}`}
        onClick={() => onAperto(!aperto)}
        aria-haspopup="listbox"
        aria-expanded={aperto}
        title={`Sei in «${attivo}». ${nomi.length} workspace: premi per vederli tutti`}
      >
        <span className="ws-menu__nome">{attivo}</span>
        <span className="ws-menu__quanti">{nomi.length}</span>
        {quantiChiamano > 0 ? <span className="ws__chiama" aria-label="in altri workspace qualcuno aspetta una tua risposta">●</span> : null}
        <span className="ws-menu__freccia" aria-hidden>▾</span>
      </button>
      {tendina !== null ? createPortal(tendina, document.body) : null}
    </div>
  )
}
