import { useEffect, useState } from 'react'
import { rigaPosti, spiegaPosti, type PostiChat as Posti } from '@shared/posti-chat'
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
  }, [])
  if (p === undefined) return null
  const pieno = p.attive >= p.posti
  return (
    <span className={`posti-chat${pieno ? ' posti-chat--pieno' : ''}`} title="Chat degli autopiloti al lavoro su questo PC">
      <span className="posti-chat__riga">{rigaPosti(p)}</span>
      <Aiuto di="Chat al lavoro insieme">
        <span style={{ whiteSpace: 'pre-line' }}>{spiegaPosti(p)}</span>
        {'\n'}
        <span style={{ display: 'block', marginTop: 6 }}>Si regola in Impostazioni → Chat e autopiloti: «Meno chat», «Come dice il PC» o «Più chat».</span>
      </Aiuto>
    </span>
  )
}
