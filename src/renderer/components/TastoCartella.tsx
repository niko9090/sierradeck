import { useEffect, useState } from 'react'

/**
 * «Apri cartella» (0.82.0) nella testata di una chat: la cartella del suo
 * progetto in Esplora file. Il percorso lo trova il PC dai suoi dati; qui
 * c'è solo il gesto, e la riga corta quando non si apre niente (la chat
 * lavora su un altro PC, la cartella non c'è più).
 */
export function TastoCartella({ paneId, titolo }: { paneId: string; titolo: string }): React.JSX.Element {
  const [guaio, setGuaio] = useState<string | undefined>(undefined)
  useEffect(() => {
    if (guaio === undefined) return
    const t = setTimeout(() => setGuaio(undefined), 6000)
    return () => clearTimeout(t)
  }, [guaio])
  return (
    <>
      <button
        className="comando-riquadro"
        onClick={() => {
          setGuaio(undefined)
          void window.gestore.workspace.apriCartella({ chat: paneId })
            .then((r) => { if (!r.ok) setGuaio(r.messaggio) })
            .catch((err: unknown) => setGuaio(String(err)))
        }}
        title={`Apri la cartella di «${titolo}» in Esplora file`}
        aria-label={`Apri la cartella di ${titolo}`}
      >
        📁
      </button>
      {guaio !== undefined ? <span className="misura" role="status" style={{ color: 'var(--ambra)' }} title={guaio}>⚠ {guaio}</span> : null}
    </>
  )
}
