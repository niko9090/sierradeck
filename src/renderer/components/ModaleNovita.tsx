import { useEffect } from 'react'
import type { Novita } from '@shared/novita'

type Props = {
  novita: Novita
  onChiudi: () => void
}

/**
 * Cosa è cambiato in questa versione, in poche righe e una volta sola.
 *
 * Compare al centro perché è l'unica cosa che chiede attenzione in quel
 * momento, e se ne va al primo clic. Non torna: il segno di «letta» lo mette il
 * Core nell'istante in cui consegna il testo, quindi anche chiudendola senza
 * leggerla non ricomparirà — una finestra che si riapre a ogni avvio diventa un
 * ostacolo fra l'utente e la prima chat, ed è così che si smette di leggere
 * anche quella che conta.
 */
export function ModaleNovita({ novita, onChiudi }: Props): React.JSX.Element {
  useEffect(() => {
    const suTasto = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' || e.key === 'Enter') onChiudi()
    }
    window.addEventListener('keydown', suTasto)
    return () => window.removeEventListener('keydown', suTasto)
  }, [onChiudi])

  return (
    <div className="velo" onMouseDown={(e) => { if (e.target === e.currentTarget) onChiudi() }}>
      <div className="dialogo dialogo--medio" onMouseDown={(e) => e.stopPropagation()}>
        <div className="dialogo__testa">
          <span className="led led--lavoro" />
          <span className="serigrafia">Novità della versione {novita.versione}</span>
        </div>

        <ul style={{ margin: '0 0 4px', paddingLeft: 20, fontSize: 13, lineHeight: 1.7 }}>
          {novita.righe.map((riga) => <li key={riga} style={{ marginBottom: 8 }}>{riga}</li>)}
        </ul>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
          <button className="tasto tasto--primario" autoFocus onClick={onChiudi}>
            Ho capito
          </button>
        </div>
      </div>
    </div>
  )
}
