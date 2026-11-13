import { useLayoutEffect, useRef } from 'react'
import { MISURE_LIBERE, type SezioneLibera } from '@shared/misure-pannelli'
import { useMisuraTrascinabile } from '../misure-vive'
import { Divisore } from './Divisore'

/**
 * Il bordo sinistro del dettaglio a destra di Progetti e di Autopiloti (13/11):
 * sta subito prima del dettaglio e gli dà la larghezza scelta col mouse. La
 * larghezza la scrive sul fratello che segue, così il dettaglio (che cambia:
 * progetto, foglio, primo messaggio) non deve saperne niente.
 */
export function BordoDettaglio({ chiave }: { chiave: Extract<SezioneLibera, 'progettiDettaglio' | 'autopilotiDettaglio'> }): React.JSX.Element {
  const { larghezza, onMisura } = useMisuraTrascinabile(chiave)
  const qui = useRef<HTMLSpanElement | null>(null)
  const dettaglio = (): HTMLElement | null => (qui.current?.nextElementSibling as HTMLElement | null | undefined) ?? null
  // Ogni disegno: il dettaglio accanto può essere un altro elemento di prima.
  useLayoutEffect(() => {
    const d = dettaglio()
    if (d !== null) d.style.width = larghezza !== undefined ? `${larghezza}px` : ''
  })
  return (
    <span ref={qui} className="bordo-dettaglio">
      <Divisore
        chiave={chiave}
        lato="sinistra"
        nome={MISURE_LIBERE[chiave].nome}
        misura={larghezza}
        misuraAttuale={() => dettaglio()?.getBoundingClientRect().width ?? 420}
        // L'elenco a sinistra resta leggibile.
        spazio={() => (qui.current?.parentElement?.getBoundingClientRect().width ?? window.innerWidth) - 360}
        onMisura={onMisura}
        classe="divisore--tra"
      />
    </span>
  )
}
