import { useEffect, useState } from 'react'
import { mb, saltatiPerMotivo, type StatoRiassetto } from '@shared/riassetto'

/**
 * Il riassetto dopo l'aggiornamento (0.88), nella banda in alto: mentre
 * lavora la percentuale e il passo, alla fine il riepilogo con «Annulla»
 * (entro 30 giorni), «Libera subito» e «Chiudi». Non blocca niente: le chat
 * si usano mentre gira.
 */
export function BandaRiassetto(): React.JSX.Element | null {
  const [s, setS] = useState<StatoRiassetto | null>(null)
  const [nota, setNota] = useState<string | undefined>(undefined)
  const [aperto, setAperto] = useState(false)
  useEffect(() => {
    void window.gestore.riassetto.stato().then(setS).catch(() => undefined)
    return window.gestore.riassetto.suProgresso(setS)
  }, [])
  if (s === null || s.chiuso) return null
  const p = s.progresso
  const r = s.riepilogo
  if (r === undefined) {
    const testo = p.fermoPerche !== undefined
      ? `Riassetto dopo l’aggiornamento fermo: ${p.fermoPerche}`
      : `Riassetto dopo l’aggiornamento: ${p.percentuale}%${p.passo !== undefined ? ` — ${p.passo}` : ''}${p.saltatiInUso > 0 ? ` · saltati: ${p.saltatiInUso} in uso` : ''}`
    return (
      <div className="banda" role="status">
        <div className="banda__voce banda__voce--attenzione">
          <span className="led led--attesa" />
          <span className="banda__testo" title={testo}>{testo}</span>
        </div>
      </div>
    )
  }
  const fino = new Date(r.annullabileFino).toLocaleDateString('it-IT')
  const testo = s.annullato
    ? 'Riassetto annullato: tutto è tornato com’era.'
    : `Riassetto fatto: ${mb(r.byteLiberati)} liberati, ${mb(r.byteInRecupero)} nel recupero fino al ${fino}${r.saltati.length > 0 ? `, ${r.saltati.length} cose saltate` : ''}${r.proposte.length > 0 ? `, ${r.proposte.length} proposte` : ''}${r.errori.length > 0 ? `, ${r.errori.length} errori` : ''}.`
  const fai = (azione: Promise<{ ok: boolean; messaggio: string }>): void => {
    void azione.then((e) => setNota(e.messaggio)).catch((err: unknown) => setNota(String(err)))
  }
  return (
    <div className="banda" role="status">
      <div className="banda__voce banda__voce--attenzione">
        <span className="led led--attesa" />
        <span className="banda__testo" title={nota ?? testo}>{nota ?? testo}</span>
        <button className="tasto" onClick={() => setAperto((x) => !x)}>{aperto ? 'Nascondi' : 'Vedi'}</button>
        {!s.annullato && !s.liberato ? (
          <>
            <button className="tasto" title={`Rimette tutto dov’era, fino al ${fino}`} onClick={() => fai(window.gestore.riassetto.annulla())}>Annulla</button>
            {r.byteInRecupero > 0 ? (
              <button className="tasto" title={`Svuota adesso il recupero del riassetto (${r.cartellaRecupero}): dopo non si annulla più`} onClick={() => fai(window.gestore.riassetto.liberaSubito())}>Libera subito</button>
            ) : null}
          </>
        ) : null}
        <button className="tasto" title="Toglie questo avviso" onClick={() => { void window.gestore.riassetto.chiudi() }}>Chiudi</button>
      </div>
      {aperto ? (
        <div className="banda__voce" style={{ display: 'block', whiteSpace: 'normal' }}>
          <div>Recupero: <code>{r.cartellaRecupero}</code></div>
          <ul style={{ margin: '4px 0', paddingLeft: 18 }}>
            {r.passi.map((x) => <li key={x.titolo}>{x.titolo}: {x.stato === 'fatto' ? `${x.fatti} cose` : x.stato}</li>)}
          </ul>
          {r.saltati.length > 0 ? (
            <div>Saltate: {saltatiPerMotivo(r.saltati).map((g) => `${g.perche} (${g.quanti})`).join('; ')}</div>
          ) : null}
          {r.proposte.map((x) => <div key={x}>Proposta: {x}</div>)}
          {r.errori.slice(0, 5).map((x) => <div key={x}>Errore: {x}</div>)}
        </div>
      ) : null}
    </div>
  )
}
