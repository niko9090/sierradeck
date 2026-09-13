import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { LavoroInCorso } from '../../main/cassaforte/lavoro-in-corso'
import { AvanzamentoLavoro } from './AvanzamentoLavoro'

/**
 * La striscia in alto di un lavoro con il Drive, che si ridisegna da sola.
 *
 * Nicholas (2026-09-13): «controlla che le operazioni di sync siano
 * asincrone perché blocca il programma». Il lavoro in se' e' asincrono; a
 * bloccare era la finestra: ogni file caricato o scaricato (sei alla volta,
 * centinaia in un minuto) e ogni secondo dell'orologio ridisegnavano
 * **tutta** l'App, console e riquadri compresi. Qui si ascolta il progresso
 * e si tiene l'orologio dentro un componente piccolo: l'App sa solo che c'e'
 * un lavoro, e si ridisegna quando comincia e quando finisce.
 */
export function StrisciaLavoroDrive({ iniziale }: { iniziale: LavoroInCorso }): React.JSX.Element {
  const [lavoro, setLavoro] = useState<LavoroInCorso>(iniziale)
  const [adesso, setAdesso] = useState(Date.now())
  const [dettagli, setDettagli] = useState(false)
  useEffect(() => window.gestore.sync.onLavoro((s) => { if (s.inCorso !== undefined) setLavoro(s.inCorso) }), [])
  useEffect(() => { const t = setInterval(() => setAdesso(Date.now()), 1000); return () => clearInterval(t) }, [])
  const annulla = (): void => { void window.gestore.sync.annullaLavoro() }

  return (
    <>
      <div className="avviso avviso--aggiornamento">
        <AvanzamentoLavoro lavoro={lavoro} adesso={adesso} compatto onDettagli={() => setDettagli(true)} onAnnulla={annulla} />
      </div>
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
