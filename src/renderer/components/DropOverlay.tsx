import { useState } from 'react'
import type { DropPosition } from '@shared/layout-tree'
import { posizioneDaCoordinate } from '@shared/layout-geometry'

type Props = {
  onRilascio: (position: DropPosition) => void
}

const COLORE = 'rgba(90, 150, 250, 0.35)'
const BORDO = '2px solid rgba(120, 175, 255, 0.9)'

function stileIndicatore(p: DropPosition): React.CSSProperties {
  const base: React.CSSProperties = { position: 'absolute', background: COLORE, pointerEvents: 'none' }
  switch (p) {
    case 'sinistra': return { ...base, left: 0, top: 0, bottom: 0, width: '50%', borderRight: BORDO }
    case 'destra': return { ...base, right: 0, top: 0, bottom: 0, width: '50%', borderLeft: BORDO }
    case 'sopra': return { ...base, left: 0, right: 0, top: 0, height: '50%', borderBottom: BORDO }
    case 'sotto': return { ...base, left: 0, right: 0, bottom: 0, height: '50%', borderTop: BORDO }
  }
}

/**
 * La zona di rilascio sopra un riquadro, visibile solo durante un trascinamento.
 *
 * Copre il riquadro e ne intercetta gli eventi: durante il trascinamento il
 * terminale sotto non deve reagire. Fuori dal trascinamento il componente non
 * viene reso affatto, quindi non c'è nulla che possa rubare un clic — ed è la
 * ragione per cui il Mosaic lo monta condizionalmente invece di nasconderlo con
 * `display: none`.
 */
export function DropOverlay({ onRilascio }: Props): React.JSX.Element {
  const [anteprima, setAnteprima] = useState<DropPosition | undefined>(undefined)

  const posizioneDa = (e: React.DragEvent<HTMLDivElement>): DropPosition => {
    const r = e.currentTarget.getBoundingClientRect()
    return posizioneDaCoordinate(e.clientX - r.left, e.clientY - r.top, r.width, r.height)
  }

  return (
    <div
      style={{ position: 'absolute', inset: 0, zIndex: 3 }}
      onDragOver={(e) => {
        // Obbligatorio: senza preventDefault il browser rifiuta il rilascio e
        // onDrop non viene mai chiamato.
        e.preventDefault()
        setAnteprima(posizioneDa(e))
      }}
      onDragLeave={() => setAnteprima(undefined)}
      onDrop={(e) => {
        e.preventDefault()
        const p = posizioneDa(e)
        setAnteprima(undefined)
        onRilascio(p)
      }}
    >
      {anteprima !== undefined ? <div style={stileIndicatore(anteprima)} /> : null}
    </div>
  )
}
