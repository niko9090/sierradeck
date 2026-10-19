import { useEffect, useState } from 'react'
import { AIUTO_MIGRAZIONE, testoMigrazione, type StatoMigrazione } from '@shared/migrazione-elenco'
import { Aiuto } from './Aiuto'

/**
 * La trasformazione dei workspace nelle impostazioni (0.74.1): com'è andata,
 * «Torna come prima» e «Rifai». La banda si chiude; questa riga resta.
 */
export function RigaMigrazione(): React.JSX.Element | null {
  const [s, setS] = useState<StatoMigrazione | null>(null)
  const [nota, setNota] = useState<string | undefined>(undefined)
  useEffect(() => {
    const leggi = (): void => { void window.gestore.migrazione.stato().then(setS).catch(() => undefined) }
    leggi()
    return window.gestore.migrazione.suCambio(leggi)
  }, [])
  if (s === null) return null
  const testo = testoMigrazione(s)
  return (
    <div className="impostazioni__riga">
      <span className="con-aiuto">Panoramica in tutti i workspace<Aiuto di="Panoramica in tutti i workspace">{AIUTO_MIGRAZIONE}</Aiuto><span className="impostazioni__nota" style={{ display: 'block' }}>{nota ?? testo}</span></span>
      {s.stato === 'fatta'
        ? <button className="tasto" onClick={() => { void window.gestore.migrazione.torna().then((e) => setNota(e.messaggio)).catch(() => undefined) }}>Torna come prima</button>
        : <button className="tasto" onClick={() => { void window.gestore.migrazione.rifai().then((e) => setNota(e.messaggio)).catch(() => undefined) }}>Trasforma tutti</button>}
    </div>
  )
}
