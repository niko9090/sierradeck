import { useEffect, useState } from 'react'
import { EVENTO_PREFERENZE_NON_SALVATE, TESTO_PREFERENZE_NON_SALVATE } from '../salva-preferenze'
import { Fumetto } from './Fumetti'

export function ContenutoPreferenzeNonSalvate({ onChiudi }: { onChiudi: () => void }): React.JSX.Element {
  return (
    <Fumetto tono="attesa">
      <span className="led led--attesa" />
      <span className="fumetto__testo">{TESTO_PREFERENZE_NON_SALVATE}</span>
      <button className="tasto tasto--mini" onClick={onChiudi} title="Chiudi">×</button>
    </Fumetto>
  )
}

/** Compare quando un salvataggio delle preferenze non è andato sul disco; si chiude col tasto. */
export function FumettoPreferenzeNonSalvate(): React.JSX.Element | null {
  const [visibile, setVisibile] = useState(false)
  useEffect(() => {
    const mostra = (): void => setVisibile(true)
    window.addEventListener(EVENTO_PREFERENZE_NON_SALVATE, mostra)
    return () => window.removeEventListener(EVENTO_PREFERENZE_NON_SALVATE, mostra)
  }, [])
  return visibile ? <ContenutoPreferenzeNonSalvate onChiudi={() => setVisibile(false)} /> : null
}
