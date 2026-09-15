import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { LavoroInCorso } from '../../main/cassaforte/lavoro-in-corso'
import { AvanzamentoLavoro } from './AvanzamentoLavoro'
import { ETICHETTA_LAVORO_TIPO } from '../progresso-sync'

/**
 * I fumetti: gli avvisi che galleggiano in basso a destra, **fuori dal
 * flusso della pagina**. Compaiono e spariscono senza spostare di un pixel i
 * riquadri, che e' il motivo per cui esistono (Nicholas, 2026-09-15: la
 * striscia della sincronia «continua a muoversi ed e' veramente scomodo»).
 * Non prendono il fuoco e non fermano quello che stai facendo.
 */
export function Fumetti({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <div className="fumetti" aria-live="polite">{children}</div>
}

export function Fumetto({ tono, pillola, children }: {
  tono: 'lavoro' | 'ok' | 'attesa' | 'errore'
  /** Una riga sola, piccola: per il lavoro automatico che non deve disturbare. */
  pillola?: boolean
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className={`fumetto fumetto--${tono}${pillola === true ? ' fumetto--pillola' : ''}`} role="status">
      {children}
    </div>
  )
}

/**
 * Il lavoro con il Drive in un fumetto, che si ridisegna da solo: l'App sa
 * solo che c'e' un lavoro (comincia, finisce), il progresso file per file e
 * l'orologio stanno qui dentro. `pillola`: la forma piccola per il lavoro
 * automatico, senza tasti.
 */
export function FumettoLavoroDrive({ iniziale, pillola }: { iniziale: LavoroInCorso; pillola?: boolean }): React.JSX.Element {
  const [lavoro, setLavoro] = useState<LavoroInCorso>(iniziale)
  const [adesso, setAdesso] = useState(Date.now())
  const [dettagli, setDettagli] = useState(false)
  useEffect(() => window.gestore.sync.onLavoro((s) => { if (s.inCorso !== undefined) setLavoro(s.inCorso) }), [])
  useEffect(() => { const t = setInterval(() => setAdesso(Date.now()), 1000); return () => clearInterval(t) }, [])
  const annulla = (): void => { void window.gestore.sync.annullaLavoro() }

  if (pillola === true) {
    const perc = lavoro.totale !== undefined && lavoro.totale > 0 ? Math.round(((lavoro.fatto ?? 0) / lavoro.totale) * 100) : undefined
    return (
      <Fumetto tono="lavoro" pillola>
        <span className="led led--lavoro" />
        <span>{ETICHETTA_LAVORO_TIPO[lavoro.tipo]}{perc !== undefined ? ` · ${perc}%` : '…'}</span>
      </Fumetto>
    )
  }

  return (
    <>
      <Fumetto tono="lavoro">
        <AvanzamentoLavoro lavoro={lavoro} adesso={adesso} compatto onDettagli={() => setDettagli(true)} onAnnulla={annulla} />
      </Fumetto>
      {dettagli ? createPortal(
        <div className="velo" onMouseDown={(e) => { if (e.target === e.currentTarget) setDettagli(false) }}>
          <div className="dialogo dialogo--medio" onMouseDown={(e) => e.stopPropagation()}>
            <div className="dialogo__testa">
              <span className="serigrafia">Lavoro con il Drive</span>
              <span style={{ flex: 1 }} />
              <button className="tasto" onClick={() => setDettagli(false)}>Chiudi</button>
            </div>
            <AvanzamentoLavoro lavoro={lavoro} adesso={adesso} onAnnulla={annulla} />
          </div>
        </div>,
        document.body
      ) : null}
    </>
  )
}

/** Un fumetto che si chiude da solo dopo `dopoMs`, a meno che non lo si chiuda prima. */
export function useChiusuraAutomatica(chiave: string | undefined, dopoMs: number, chiudi: () => void): void {
  useEffect(() => {
    if (chiave === undefined) return
    const t = setTimeout(chiudi, dopoMs)
    return () => clearTimeout(t)
    // Solo la chiave: un ridisegno non deve far ripartire il conto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chiave, dopoMs])
}
