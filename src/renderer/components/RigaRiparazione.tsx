import { useEffect, useState } from 'react'
import { AIUTO_RIPARAZIONE, segnalate, testoRiparazione, type StatoRiparazione } from '@shared/autoriparazione'
import { Aiuto } from './Aiuto'

/**
 * L'autoriparazione nelle impostazioni (k-59): il rapporto «Ho sistemato N
 * workspace: …», il dettaglio, «Ripara» e «Torna come prima».
 */
export function RigaRiparazione(): React.JSX.Element | null {
  const [s, setS] = useState<StatoRiparazione | null>(null)
  const [nota, setNota] = useState<string | undefined>(undefined)
  const [inCorso, setInCorso] = useState(false)
  useEffect(() => {
    const leggi = (): void => { void window.gestore.autoriparazione.stato().then(setS).catch(() => undefined) }
    leggi()
    return window.gestore.autoriparazione.suCambio(leggi)
  }, [])
  const ultimo = s?.ultimoCambiamento
  const daGuardare = s?.ultimo !== undefined ? segnalate(s.ultimo) : []
  const puoiTornare = s?.annullo !== undefined && s.annullo.annullatoIl === undefined
  return (
    <div className="impostazioni__riga">
      <span className="con-aiuto">Ripara i workspace rimasti indietro<Aiuto di="Ripara i workspace rimasti indietro">{AIUTO_RIPARAZIONE}</Aiuto>
        <span className="impostazioni__nota" style={{ display: 'block' }}>{nota ?? testoRiparazione(s)}</span>
        {ultimo !== undefined ? (
          <details>
            <summary className="impostazioni__nota">Dettaglio</summary>
            <ul className="impostazioni__nota">
              {ultimo.voci.filter((v) => v.esito === 'sistemato').map((v, i) => <li key={`s${i}`}>{v.cosa}</li>)}
            </ul>
          </details>
        ) : null}
        {daGuardare.length > 0 ? (
          <details>
            <summary className="impostazioni__nota">Da guardare ({daGuardare.length})</summary>
            <ul className="impostazioni__nota">{daGuardare.map((v, i) => <li key={`g${i}`}>{v.cosa}</li>)}</ul>
          </details>
        ) : null}
      </span>
      <span>
        <button className="tasto" disabled={inCorso} onClick={() => { setInCorso(true); void window.gestore.autoriparazione.ripara().then((e) => setNota(e.messaggio)).catch(() => undefined).finally(() => setInCorso(false)) }}>{inCorso ? 'Controllo…' : 'Ripara'}</button>
        {puoiTornare ? <button className="tasto" onClick={() => { void window.gestore.autoriparazione.torna().then((e) => setNota(e.messaggio)).catch(() => undefined) }}>Torna come prima</button> : null}
      </span>
    </div>
  )
}
