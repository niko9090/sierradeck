import { useEffect, useState } from 'react'
import {
  cambioVisibile, iconaStrada, qualita, rigaStoria, testoRiconnessione, type Linea, type VoceCoda
} from '@shared/collegamento'
import { etichettaStrada } from '@shared/strada-pc'

/**
 * Il collegamento con un altro PC, a colpo d'occhio (0.51.0): l'icona della
 * strada, le tacche della qualità e il ritardo accanto a «SU <PC>»; toccando,
 * la storia delle cadute e dei cambi. Sotto, la fascia di riconnessione (non
 * blocca niente: lo schermo resta, attenuato) e l'animazione del cambio di
 * strada. Le regole stanno in `@shared/collegamento`.
 */

/** L'orologio della fascia: si ridisegna ogni secondo solo mentre serve. */
export function useAdesso(attivo: boolean): number {
  const [adesso, setAdesso] = useState(Date.now())
  useEffect(() => {
    if (!attivo) return
    const t = setInterval(() => setAdesso(Date.now()), 500)
    return () => clearInterval(t)
  }, [attivo])
  return attivo ? adesso : Date.now()
}

export function IndicatoreLinea({ linea, nomePc }: { linea: Linea; nomePc: string }): React.JSX.Element {
  const [aperta, setAperta] = useState(false)
  const q = qualita(linea.misure)
  const giu = linea.fase === 'ricollego'
  const via = linea.strada !== undefined ? etichettaStrada({ strada: linea.strada }, nomePc) : undefined
  const titolo = giu
    ? `Collegamento con ${nomePc} caduto: riprovo da solo. Tocca per la storia del collegamento.`
    : `${via?.testo ?? 'Strada non ancora nota.'} Qualità ${q.parola}${q.ritardoMs !== undefined ? `: ${q.ritardoMs} ms di ritardo tipico` : ''}${q.perdite > 0 ? `, ${Math.round(q.perdite * 100)}% di chiamate perse` : ''} (sulle ultime chiamate). Tocca per la storia del collegamento.`
  return (
    <span className="linea">
      <button type="button" className={giu ? 'linea__tasto linea__tasto--giu' : 'linea__tasto'} title={titolo} aria-label={titolo} onClick={() => setAperta((x) => !x)}>
        <span className="linea__icona">{iconaStrada(linea.strada)}</span>
        <span className={`linea__tacche linea__tacche--${giu ? 0 : q.tacche}`} aria-hidden="true">
          <i /><i /><i /><i />
        </span>
        <span className="linea__ms">{giu ? 'giù' : q.ritardoMs !== undefined ? `${q.ritardoMs} ms` : '…'}</span>
      </button>
      {aperta ? (
        <span className="linea__storia" role="dialog" aria-label="Storia del collegamento">
          <span className="linea__storia-titolo">Storia del collegamento con {nomePc}</span>
          <span className="linea__storia-nota">
            Le cadute, i ritorni e i cambi di strada di questa finestra, con l’ora e il motivo (gli ultimi trenta). Le strade si provano in quest’ordine: rete di casa 🏠, Tailscale 🔐, collegamento diretto via Internet (WebRTC) 🌐, Drive ☁️ (lento: solo leggere e scrivere). Quando ne torna una migliore, ci si passa da soli senza chiudere niente.
            Le tacche: 4 = ritardo sotto 150 ms e niente perso; ne tolgono una le chiamate perse, e il ritardo che sale (400 ms, 1 s).
          </span>
          {linea.storia.length === 0 ? <span className="linea__voce">Ancora niente da raccontare.</span> : null}
          {[...linea.storia].reverse().map((e, i) => (
            <span key={`${e.il}-${i}`} className={`linea__voce linea__voce--${e.tipo}`}>{rigaStoria(e)}</span>
          ))}
          <button type="button" className="tasto tasto--mini" onClick={() => setAperta(false)}>Chiudi</button>
        </span>
      ) : null}
    </span>
  )
}

/** La fascia di riconnessione e l'annuncio del cambio di strada. Non blocca niente. */
export function FasciaLinea({ linea, nomePc, adesso, onRiprova }: { linea: Linea; nomePc: string; adesso: number; onRiprova: () => void }): React.JSX.Element | null {
  const cambio = cambioVisibile(linea, adesso)
  const giu = testoRiconnessione(linea, nomePc, adesso)
  if (giu === undefined && cambio === undefined) return null
  return (
    <>
      {cambio !== undefined ? <div key={linea.cambio?.il} className="linea__cambio" role="status">⇄ {cambio}</div> : null}
      {giu !== undefined ? (
        <div className="linea__fascia" role="status">
          <span className="linea__fascia-testo">
            <strong>{giu}.</strong>{' '}
            {linea.messaggio !== undefined ? `${linea.messaggio.replace(/\.\s*$/, '')}. ` : ''}
            Lo schermo qui sotto è l’ultimo arrivato, attenuato: al ritorno si aggiorna da solo. Quello che scrivi intanto resta in coda, «in attesa di invio», e parte al ritorno una volta sola.
          </span>
          <button type="button" className="tasto tasto--mini" onClick={onRiprova}>Riprova adesso</button>
        </div>
      ) : null}
    </>
  )
}

/** I messaggi scritti a linea giù: in attesa di invio, o in volo. */
export function CodaInvii({ coda, onTogli }: { coda: VoceCoda[]; onTogli: (id: string) => void }): React.JSX.Element | null {
  if (coda.length === 0) return null
  return (
    <div className="linea__coda">
      {coda.map((v) => (
        <div key={v.id} className="linea__coda-voce">
          <span>{v.stato === 'invio' ? '↗ sto mandando' : '⏳ in attesa di invio'}: «{v.testo.length > 120 ? `${v.testo.slice(0, 120)}…` : v.testo}»</span>
          {v.stato === 'attesa' ? <button type="button" className="tasto tasto--mini" onClick={() => onTogli(v.id)} title="Toglilo dalla coda: non verrà mandato">Togli</button> : null}
        </div>
      ))}
    </div>
  )
}

/** Un id per messaggio, a caso. */
export function nuovoIdMessaggio(): string {
  const a = new Uint8Array(12)
  crypto.getRandomValues(a)
  return `m${Array.from(a, (x) => x.toString(16).padStart(2, '0')).join('')}`
}
