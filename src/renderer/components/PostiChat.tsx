import { useEffect, useState } from 'react'
import { avvisoCarico, rigaPosti, spiegaPosti, type PostiChat as Posti } from '@shared/posti-chat'
import { ModalePostiChat } from './ModalePostiChat'
import { Aiuto } from './Aiuto'

/** Ogni quanto si richiede: il servizio ricalcola i posti una volta al minuto. */
const OGNI_MS = 15_000

/**
 * «N di M chat» (0.82.0): quante chat degli autopiloti lavorano su questo PC e
 * quante ne lascia lavorare insieme, sempre nella fascia in alto. Il perché
 * (processori, memoria, carico, la fila) dietro «?». Niente se il servizio non
 * risponde: un numero inventato sarebbe peggio di nessuno.
 */
export function PostiChat(): React.JSX.Element | null {
  const [p, setP] = useState<Posti | undefined>(undefined)
  const [aperta, setAperta] = useState(false)
  const [giro, setGiro] = useState(0)
  useEffect(() => {
    let vivo = true
    const leggi = (): void => {
      // Un preload più vecchio (o una prova senza servizio) non ce l'ha: niente riga.
      const chiedi = window.gestore?.autopilota?.postiChat
      if (typeof chiedi !== 'function') return
      void chiedi().then((x) => { if (vivo) setP(x) }).catch(() => undefined)
    }
    leggi()
    const t = setInterval(leggi, OGNI_MS)
    return () => { vivo = false; clearInterval(t) }
  }, [giro])
  if (p === undefined) return null
  const pieno = p.attive >= p.posti
  const avviso = avvisoCarico(p)
  return (
    <span className={`posti-chat${pieno ? ' posti-chat--pieno' : ''}`} title="Chat degli autopiloti al lavoro su questo PC">
      <button type="button" className="posti-chat__tasto" aria-haspopup="dialog" title="Cambia quante chat lavorano insieme" onClick={() => setAperta(true)}>
        <span className="posti-chat__riga">{rigaPosti(p)}</span>
      </button>
      {avviso !== undefined ? <span className="posti-modale__avviso" title={avviso}>⚠ PC carico</span> : null}
      {aperta ? (
        <ModalePostiChat
          posti={p}
          onChiudi={() => setAperta(false)}
          // Il servizio ricalcola entro pochi secondi: si rilegge dopo un attimo.
          onCambiato={() => { setTimeout(() => setGiro((n) => n + 1), 1500) }}
        />
      ) : null}
      <Aiuto di="Chat al lavoro insieme">
        <span style={{ whiteSpace: 'pre-line' }}>{spiegaPosti(p)}</span>
        {'\n'}
        <span style={{ display: 'block', marginTop: 6 }}>Si regola in Impostazioni → Chat e autopiloti: «Meno chat», «Come dice il PC» o «Più chat».</span>
      </Aiuto>
    </span>
  )
}
