import type { Avviso } from '../avvisi'

type Props = {
  avvisi: Avviso[]
  onAzione: (azione: NonNullable<Avviso['azione']>) => void
  /** «Riprendi» / «Archivia» di un avviso di autopiloti fermi. */
  onAltra?: (azione: NonNullable<Avviso['altre']>[number]['azione'], ids: string[]) => void
  /** «Chiudi»: ricorda le chiavi, l'avviso non torna finche' non cambiano. */
  onChiudi?: (chiavi: string[]) => void
}

/**
 * La banda degli avvisi, sotto la fascia dei comandi.
 *
 * Compare solo quando c'è qualcosa da dire, e ogni avviso porta con sé il
 * gesto che lo risolve: un avviso che non offre una via d'uscita costringe a
 * cercarla altrove, che è il momento in cui si smette di leggerli.
 */
export function BandaAvvisi({ avvisi, onAzione, onAltra, onChiudi }: Props): React.JSX.Element | null {
  if (avvisi.length === 0) return null

  return (
    <div className="banda">
      {avvisi.map((a) => (
        <div key={a.id} className={`banda__voce banda__voce--${a.gravita}`}>
          <span className={`led ${a.gravita === 'blocco' ? 'led--fermo' : 'led--attesa'}`} />
          <span className="banda__testo">{a.testo}</span>
          {a.azione !== undefined ? (
            <button className="tasto" onClick={() => onAzione(a.azione!)}>
              {a.etichettaAzione ?? 'Apri'}
            </button>
          ) : null}
          {onAltra !== undefined
            ? (a.altre ?? []).map((x) => (
                <button key={x.azione} className="tasto" title={x.titolo} onClick={() => onAltra(x.azione, x.ids)}>
                  {x.etichetta}
                </button>
              ))
            : null}
          {a.chiavi !== undefined && onChiudi !== undefined ? (
            <button
              className="tasto"
              title="Toglie questo avviso: non torna per lo stesso fermo (o la stessa lista), nemmeno dopo un riavvio. Torna da solo se succede qualcosa di nuovo. L’autopilota resta com’è"
              onClick={() => onChiudi(a.chiavi!)}
            >
              Chiudi
            </button>
          ) : null}
        </div>
      ))}
    </div>
  )
}
