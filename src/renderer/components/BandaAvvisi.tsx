import type { Avviso } from '../avvisi'

type Props = {
  avvisi: Avviso[]
  onAzione: (azione: NonNullable<Avviso['azione']>) => void
}

/**
 * La banda degli avvisi, sotto la fascia dei comandi.
 *
 * Compare solo quando c'è qualcosa da dire, e ogni avviso porta con sé il
 * gesto che lo risolve: un avviso che non offre una via d'uscita costringe a
 * cercarla altrove, che è il momento in cui si smette di leggerli.
 */
export function BandaAvvisi({ avvisi, onAzione }: Props): React.JSX.Element | null {
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
        </div>
      ))}
    </div>
  )
}
