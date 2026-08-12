import { useEffect } from 'react'

/**
 * La domanda che precede un gesto da cui non si torna indietro.
 *
 * Esiste per un caso preciso: i preset di disposizione chiudono le chat che non
 * ci stanno, processi compresi, e stanno nella fascia a un clic di distanza.
 * Chiudere quattro conversazioni non è un'operazione che si scopre dopo.
 */
export function ModaleConferma({
  titolo,
  testo,
  etichettaAzione,
  onConferma,
  onAnnulla
}: {
  titolo: string
  testo: string
  etichettaAzione: string
  onConferma: () => void
  onAnnulla: () => void
}): React.JSX.Element {
  useEffect(() => {
    const suTasto = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onAnnulla()
    }
    window.addEventListener('keydown', suTasto)
    return () => window.removeEventListener('keydown', suTasto)
  }, [onAnnulla])

  return (
    <div className="velo" onMouseDown={(e) => { if (e.target === e.currentTarget) onAnnulla() }}>
      <div className="dialogo dialogo--medio" onMouseDown={(e) => e.stopPropagation()}>
        <div className="dialogo__testa">
          <span className="serigrafia">{titolo}</span>
        </div>
        <p style={{ margin: '4px 0 14px', lineHeight: 1.5 }}>{testo}</p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          {/* Annulla a fuoco: il tasto che non fa danni è quello che si preme
              per sbaglio battendo Invio. */}
          <button className="tasto" autoFocus onClick={onAnnulla}>Annulla</button>
          <button className="tasto tasto--primario" onClick={onConferma}>{etichettaAzione}</button>
        </div>
      </div>
    </div>
  )
}
