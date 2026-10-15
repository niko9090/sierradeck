import { useEffect, useState } from 'react'
import type { StatoMigrazione } from '@shared/migrazione-elenco'

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
  const testo = s.stato === 'fatta'
    ? `Tutti i workspace di questo PC sono a elenco (${s.dormienti.length}), ognuno con il suo autopilota fermo finché non gli scrivi. Le chat non sono state toccate.`
    : s.stato === 'annullata' ? 'Workspace tornati come prima.'
      : s.stato === 'fallita' ? `La trasformazione non è riuscita, tutto è com’era: ${s.motivo ?? ''}`
        : 'Trasformazione a metà: si completa al prossimo avvio.'
  return (
    <div className="impostazioni__riga">
      <span className="con-aiuto">Workspace a elenco<span className="impostazioni__nota" style={{ display: 'block' }}>{nota ?? testo}</span></span>
      {s.stato === 'fatta'
        ? <button className="tasto" onClick={() => { void window.gestore.migrazione.torna().then((e) => setNota(e.messaggio)).catch(() => undefined) }}>Torna come prima</button>
        : <button className="tasto" onClick={() => { void window.gestore.migrazione.rifai().then((e) => setNota(e.messaggio)).catch(() => undefined) }}>Trasforma tutti</button>}
    </div>
  )
}
